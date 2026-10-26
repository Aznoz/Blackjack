// OBĚŠENEC – hádání slov pro 1–6 hráčů (spolupráce u jednoho oběšence, hráči se střídají).
// Logika místností a kol, WebSocket obsluhuje hlavní server na cestě /obesenec. Účty (jméno, profilovka) dodává server přes init().
import crypto from 'node:crypto';
import { POOLS, LEVELS, LEVEL_CFG, fold } from './words.js';

const MAX_PLAYERS = 6;
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';
const EMPTY_ROOM_MS = 90_000;
const LOBBY_GRACE_MS = 30_000;
const NEXT_MS = Number(process.env.OBES_NEXT_MS) || 4500; // pauza mezi slovy
const TURN_OVERRIDE_MS = Number(process.env.OBES_TURN_MS) || 0; // jen pro testy
export const ROUND_CHOICES = [3, 5, 8, 10, 15];
export const TURN_CHOICES = [15, 20, 30, 45, 60];
const WORD_GUESS_COST = 2; // špatně tipnuté celé slovo = 2 chyby
const IDLE_LIMIT_BASE = 3; // kolik kol po sobě bez jediného tipu (všichni nečinní) hru ukončí

export { LEVELS, LEVEL_CFG };
const rooms = new Map();
const now = () => Date.now();

let deps = null;
export function init(d) { deps = d; }

function cleanName(s) {
  const t = String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return t || 'Hráč';
}
function makeCode() {
  for (let i = 0; i < 200; i++) {
    let c = '';
    for (let j = 0; j < 4; j++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}
function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch { /* spojení padlo */ } } }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const active = (room) => room.players.filter((p) => !p.left);
const live = (room) => active(room).filter((p) => p.connected);
const byId = (room, id) => room.players.find((p) => p.id === id);

// ---------------------------------------------------------------- místnosti
function newRoom() {
  const code = makeCode();
  if (!code) return null;
  const room = {
    code, players: [], nextId: 1, hostId: null, phase: 'lobby', level: 'normalni', rounds: 5, turnSec: 30,
    round: 0, deck: [], entry: null, guessed: [], mistakes: 0, turn: null, turnEnd: 0, starter: null,
    results: [], solved: 0, idle: 0, ev: null, evId: 0, result: null,
    emptySince: now(), turnT: null, nextT: null,
  };
  rooms.set(code, room);
  return room;
}

/** Přihlášení hráče: účet z tokenu/Google relace (jméno a profilovka z účtu); bez něj host. */
function identify(msg) {
  if (!deps || typeof msg.token !== 'string' || !deps.TOKEN_RE.test(msg.token)) return null;
  try { return deps.resolveAccount({ token: msg.token, session: typeof msg.session === 'string' ? msg.session : undefined, name: msg.name }); } catch { return null; }
}

function addPlayer(room, ws, msg) {
  const ident = identify(msg);
  if (ident && room.players.some((p) => !p.left && p.acc === ident.acc)) return { err: 'Tenhle účet už v místnosti hraje.' };
  const base = ident && ident.linked ? ident.acc.name : (String(msg.name ?? '').trim() ? msg.name : ident ? ident.acc.name : msg.name);
  let n = cleanName(base); let i = 2;
  while (room.players.some((p) => p.name === n)) n = `${cleanName(base).slice(0, 11)} ${i++}`;
  const pl = { id: 'p' + room.nextId++, name: n, token: crypto.randomBytes(12).toString('hex'), ws, connected: true, left: false, score: 0, hits: 0, misses: 0, acc: ident ? ident.acc : null };
  room.players.push(pl);
  if (!room.hostId) room.hostId = pl.id;
  bind(ws, room, pl);
  return { pl };
}
function bind(ws, room, pl) {
  if (pl.ws && pl.ws !== ws) { pl.ws.ctx = null; try { pl.ws.close(4000, 'Přihlášení z jiného okna'); } catch { /* nic */ } }
  pl.ws = ws; pl.connected = true; ws.ctx = { code: room.code, pid: pl.id };
  if (pl.dropTimer) { clearTimeout(pl.dropTimer); pl.dropTimer = null; }
  room.emptySince = null;
  send(ws, { t: 'joined', code: room.code, you: pl.id, token: pl.token });
  if (room.phase === 'round' && !room.turn) { room.turn = pl.id; armTurn(room); } // hra čekala, až se někdo vrátí
}

function clearTimers(room) {
  for (const k of ['turnT', 'nextT']) { if (room[k]) clearTimeout(room[k]); room[k] = null; }
}
function removeFromLobby(room, pl) {
  room.players = room.players.filter((p) => p !== pl);
  if (room.hostId === pl.id) room.hostId = (live(room)[0] || room.players[0] || {}).id || null;
  if (!room.players.length) destroy(room); else publish(room, null);
}
function destroy(room) { clearTimers(room); rooms.delete(room.code); }

// ---------------------------------------------------------------- stav pro klienty
const maskWord = (room) => {
  if (!room.entry) return [];
  const got = new Set(room.guessed.filter((g) => g.ok).map((g) => g.l));
  const open = room.phase === 'reveal' || room.phase === 'over';
  return [...room.entry.w].map((ch) => (open || got.has(fold(ch)) ? ch : null));
};
const isComplete = (room) => {
  const got = new Set(room.guessed.filter((g) => g.ok).map((g) => g.l));
  return [...room.entry.f].every((ch) => got.has(ch));
};

function view(room, pid) {
  const cfg = LEVEL_CFG[room.level];
  const inRound = room.entry && (room.phase === 'round' || room.phase === 'reveal');
  return {
    t: 'state', code: room.code, phase: room.phase, you: pid, hostId: room.hostId,
    level: room.level, rounds: room.rounds, turnSec: room.turnSec, round: room.round,
    word: inRound ? maskWord(room) : null, len: inRound ? room.entry.f.length : 0,
    category: inRound && cfg.category ? room.entry.c : null,
    guessed: room.guessed.map((g) => ({ l: g.l, ok: g.ok, by: g.by })),
    mistakes: room.mistakes, maxMistakes: cfg.mistakes,
    turn: room.phase === 'round' ? room.turn : null,
    turnMs: room.phase === 'round' && room.turnEnd ? Math.max(0, room.turnEnd - now()) : 0,
    solvedCount: room.solved, results: room.results,
    players: active(room).map((p) => ({ id: p.id, name: p.name, connected: p.connected, score: p.score, hits: p.hits, misses: p.misses, avatar: p.acc ? p.acc.avatar : null, account: !!p.acc })),
    ev: room.ev, result: room.result || null,
  };
}
function publish(room, ev) {
  if (ev) room.ev = { id: ++room.evId, ...ev };
  for (const p of room.players) if (p.ws) send(p.ws, view(room, p.id));
}

// ---------------------------------------------------------------- průběh hry
function drawEntry(room) {
  if (!room.deck.length) room.deck = shuffle(POOLS[room.level].slice());
  return room.deck.pop();
}

function nextLive(room, fromId) {
  const list = active(room);
  const i = list.findIndex((p) => p.id === fromId);
  for (let k = 1; k <= list.length; k++) {
    const p = list[(i + k + list.length) % list.length];
    if (p.connected) return p.id;
  }
  return null;
}

function armTurn(room) {
  if (room.turnT) clearTimeout(room.turnT);
  const ms = TURN_OVERRIDE_MS || room.turnSec * 1000;
  room.turnEnd = now() + ms;
  room.turnT = setTimeout(() => onTurnTimeout(room), ms);
}
function onTurnTimeout(room) {
  room.turnT = null;
  if (!rooms.has(room.code) || room.phase !== 'round') return;
  const skipped = room.turn;
  room.idle++;
  if (room.idle >= Math.max(live(room).length, 1) * IDLE_LIMIT_BASE) return finishGame(room, true); // všichni dlouho nic nehrají
  room.turn = nextLive(room, skipped);
  if (room.turn) armTurn(room); else room.turnEnd = 0;
  publish(room, { type: 'skip', by: skipped });
}
function advanceTurn(room) {
  room.turn = nextLive(room, room.turn);
  if (room.turn) armTurn(room); else { if (room.turnT) clearTimeout(room.turnT); room.turnT = null; room.turnEnd = 0; }
}

function startRound(room) {
  room.round++;
  room.entry = drawEntry(room);
  room.guessed = []; room.mistakes = 0; room.idle = 0; room.ev = null;
  const cfg = LEVEL_CFG[room.level];
  if (cfg.reveal > 0) room.guessed.push({ l: room.entry.f[0], ok: true, by: null });
  room.phase = 'round';
  room.starter = room.starter ? (nextLive(room, room.starter) || room.starter) : (live(room)[0] || {}).id || null;
  room.turn = room.starter;
  if (room.turn) armTurn(room); else room.turnEnd = 0;
  publish(room, { type: 'round', round: room.round });
}

function endRound(room, solved, by) {
  if (room.turnT) clearTimeout(room.turnT);
  room.turnT = null; room.turnEnd = 0;
  room.phase = 'reveal';
  if (solved) room.solved++;
  room.results.push({ word: room.entry.w, category: room.entry.c, solved, by: by || null });
  publish(room, { type: solved ? 'solved' : 'failed', by: by || null, word: room.entry.w });
  room.nextT = setTimeout(() => {
    room.nextT = null;
    if (!rooms.has(room.code)) return;
    if (room.round >= room.rounds) finishGame(room, false); else startRound(room);
  }, NEXT_MS);
}

function finishGame(room, abandoned) {
  clearTimers(room);
  room.phase = 'over';
  const ranking = active(room).slice().sort((a, b) => b.score - a.score);
  room.result = {
    solved: room.solved, total: room.results.length, abandoned: !!abandoned,
    best: ranking.length && ranking[0].score > 0 ? ranking.filter((p) => p.score === ranking[0].score).map((p) => p.id) : [],
  };
  publish(room, { type: 'over' });
}

function guessLetter(room, pl, raw) {
  const l = fold(String(raw ?? '').trim());
  if (!/^[a-z]$/.test(l)) return { err: 'Tipni jedno písmeno.' };
  if (room.guessed.some((g) => g.l === l)) return { err: `Písmeno ${l.toUpperCase()} už padlo.` };
  const n = [...room.entry.f].filter((c) => c === l).length;
  room.idle = 0;
  if (n > 0) {
    room.guessed.push({ l, ok: true, by: pl.id });
    pl.hits += n; pl.score += n * 2;
    if (isComplete(room)) { pl.score += 5; publish(room, { type: 'hit', letter: l.toUpperCase(), by: pl.id, n }); return endRound(room, true, pl.id), {}; }
    advanceTurn(room);
    publish(room, { type: 'hit', letter: l.toUpperCase(), by: pl.id, n });
  } else {
    room.guessed.push({ l, ok: false, by: pl.id });
    room.mistakes++; pl.misses++;
    if (room.mistakes >= LEVEL_CFG[room.level].mistakes) { publish(room, { type: 'miss', letter: l.toUpperCase(), by: pl.id }); return endRound(room, false, null), {}; }
    advanceTurn(room);
    publish(room, { type: 'miss', letter: l.toUpperCase(), by: pl.id });
  }
  return {};
}

function guessWord(room, pl, raw) {
  const w = fold(String(raw ?? '').trim());
  if (!/^[a-z]{2,24}$/.test(w)) return { err: 'Napiš celé slovo, jen písmena.' };
  room.idle = 0;
  if (w === room.entry.f) {
    const left = [...new Set(room.entry.f)].filter((c) => !room.guessed.some((g) => g.ok && g.l === c)).length;
    pl.score += 5 + left * 3; pl.hits += left;
    for (const c of new Set(room.entry.f)) if (!room.guessed.some((g) => g.l === c)) room.guessed.push({ l: c, ok: true, by: pl.id });
    endRound(room, true, pl.id);
    return {};
  }
  room.mistakes = Math.min(LEVEL_CFG[room.level].mistakes, room.mistakes + WORD_GUESS_COST);
  pl.misses++;
  if (room.mistakes >= LEVEL_CFG[room.level].mistakes) { publish(room, { type: 'badword', by: pl.id, word: w }); return endRound(room, false, null), {}; }
  advanceTurn(room);
  publish(room, { type: 'badword', by: pl.id, word: w });
  return {};
}

// ---------------------------------------------------------------- spojení
function leave(ws, voluntary) {
  const ctx = ws.ctx; if (!ctx) return;
  ws.ctx = null;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = byId(room, ctx.pid);
  if (!pl || (pl.ws && pl.ws !== ws)) return;
  pl.ws = null; pl.connected = false;
  if (room.hostId === pl.id) { const n = live(room)[0]; if (n) room.hostId = n.id; }
  if (room.phase === 'lobby') {
    if (voluntary) removeFromLobby(room, pl);
    else { pl.dropTimer = setTimeout(() => { if (!pl.connected && rooms.has(room.code)) removeFromLobby(room, pl); }, LOBBY_GRACE_MS); publish(room, null); }
  } else {
    if (voluntary) { pl.left = true; pl.token = null; }
    if (room.phase === 'round' && room.turn === pl.id) advanceTurn(room);
    if (!active(room).length) return destroy(room);
    publish(room, null);
  }
  if (live(room).length === 0) room.emptySince = now();
}

function handle(ws, msg) {
  if (msg.t === 'ping') return send(ws, { t: 'pong' });
  if (msg.t === 'create' || msg.t === 'join') {
    if (ws.ctx) return;
    let room;
    if (msg.t === 'create') {
      room = newRoom();
      if (!room) return send(ws, { t: 'err', msg: 'Server je plný, zkus to později.' });
    } else {
      room = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Místnost s tímhle kódem neexistuje.' });
      if (room.phase !== 'lobby') return send(ws, { t: 'err', fatal: true, msg: 'Hra už běží, připojit se jde jen před startem.' });
      if (active(room).length >= MAX_PLAYERS) return send(ws, { t: 'err', fatal: true, msg: 'Místnost je plná (max. 6 hráčů).' });
    }
    const r = addPlayer(room, ws, msg);
    if (r.err) { if (msg.t === 'create') destroy(room); return send(ws, { t: 'err', fatal: true, msg: r.err }); }
    return publish(room, null);
  }
  if (msg.t === 'resume') {
    if (ws.ctx) return;
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const pl = room && room.players.find((p) => p.token && p.token === msg.token && !p.left);
    if (!pl) return send(ws, { t: 'err', fatal: true, gone: true, msg: 'Místnost už neexistuje.' });
    bind(ws, room, pl);
    return publish(room, null);
  }
  const ctx = ws.ctx; if (!ctx) return;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = byId(room, ctx.pid); if (!pl) return;

  switch (msg.t) {
    case 'config': {
      if (room.phase !== 'lobby' || room.hostId !== pl.id) return;
      if (LEVELS.includes(msg.level)) { room.level = msg.level; room.deck = []; }
      if (ROUND_CHOICES.includes(Number(msg.rounds))) room.rounds = Number(msg.rounds);
      if (TURN_CHOICES.includes(Number(msg.turnSec))) room.turnSec = Number(msg.turnSec);
      return publish(room, null);
    }
    case 'start': {
      if (room.phase !== 'lobby' || room.hostId !== pl.id) return;
      if (live(room).length < 1) return;
      room.players = room.players.filter((p) => p.connected);
      for (const p of room.players) { p.score = 0; p.hits = 0; p.misses = 0; }
      room.round = 0; room.solved = 0; room.results = []; room.result = null; room.deck = []; room.starter = null; room.ev = null;
      return startRound(room);
    }
    case 'guess': {
      if (room.phase !== 'round') return;
      if (room.turn !== pl.id) return send(ws, { t: 'reject', msg: 'Teď nejsi na tahu.' });
      const r = guessLetter(room, pl, msg.letter);
      if (r.err) send(ws, { t: 'reject', msg: r.err });
      return;
    }
    case 'solve': {
      if (room.phase !== 'round') return;
      if (room.turn !== pl.id) return send(ws, { t: 'reject', msg: 'Teď nejsi na tahu.' });
      const r = guessWord(room, pl, msg.word);
      if (r.err) send(ws, { t: 'reject', msg: r.err });
      return;
    }
    case 'again': {
      if (room.phase !== 'over' || room.hostId !== pl.id) return;
      room.players = room.players.filter((p) => !p.left);
      clearTimers(room);
      room.phase = 'lobby'; room.round = 0; room.entry = null; room.guessed = []; room.mistakes = 0; room.turn = null; room.result = null; room.results = []; room.solved = 0;
      for (const p of room.players) { p.score = 0; p.hits = 0; p.misses = 0; }
      return publish(room, { type: 'lobby' });
    }
    case 'leave': return leave(ws, true);
    default:
  }
}

/** Pro HTTP: kdo se právě hlásí (jméno, profilovka) – menu hry ukáže přihlášeného hráče. */
export function me(body) {
  const ident = identify(body || {});
  if (!ident) return { status: 200, json: { account: false } };
  return { status: 200, json: { account: true, linked: !!ident.linked, name: ident.acc.name, avatar: ident.acc.avatar } };
}

const clients = new Set();
export function handleConnection(ws) {
  clients.add(ws);
  ws.isAlive = true; ws.ctx = null;
  ws.bucket = { n: 20, t: now() };
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    const t = now();
    ws.bucket.n = Math.min(20, ws.bucket.n + ((t - ws.bucket.t) / 1000) * 10);
    ws.bucket.t = t;
    if (ws.bucket.n < 1) return;
    ws.bucket.n -= 1;
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { handle(ws, msg); } catch (e) { console.error('obesenec: chyba obsluhy', e); }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws, false); });
  ws.on('error', () => {});
}

setInterval(() => { for (const ws of clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* nic */ } } }, 25_000).unref();
setInterval(() => { for (const r of rooms.values()) if (live(r).length === 0 && r.emptySince && now() - r.emptySince > EMPTY_ROOM_MS) destroy(r); }, 15_000).unref();

export const stats = () => ({ rooms: rooms.size, clients: clients.size });
export { rooms };
