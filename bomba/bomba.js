// BOMBA! – Tik Tak Bum online (2–6 hráčů). Logika místností a kol, WebSocket obsluhuje hlavní server na cestě /bomba.
import crypto from 'node:crypto';
import { EASY, HARD } from './combos.js';

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';
const EMPTY_ROOM_MS = 90_000;
const LOBBY_GRACE_MS = 30_000;
const BOOM_MS = Number(process.env.BOMBA_BOOM_MS) || 4500;
const FUSE_MIN = Number(process.env.BOMBA_FUSE_MIN_MS) || 9_000;
const FUSE_MAX = Number(process.env.BOMBA_FUSE_MAX_MS) || 28_000;
const ALONE_MS = Number(process.env.BOMBA_ALONE_MS) || 25_000;
const MAX_CHALLENGES = 2; // zpochybnění slova na hráče a kolo

export const LEVELS = ['lehka', 'normalni', 'tezka'];
const rooms = new Map();
const now = () => Date.now();
const rndInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

// Háčky a čárky se berou vážně (PR ≠ PŘ): neignoruje se diakritika, jen velikost písmen.
export const norm = (s) => String(s).normalize('NFC').toLowerCase();

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

const active = (room) => room.players.filter((p) => !p.left);
const live = (room) => active(room).filter((p) => p.connected);
const byId = (room, id) => room.players.find((p) => p.id === id);

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rndInt(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function drawCombo(room) {
  if (!room.deck.length) {
    const pool = room.level === 'lehka' ? EASY : room.level === 'tezka' ? HARD : [...EASY, ...HARD];
    room.deck = shuffle(pool.slice());
  }
  return room.deck.pop();
}

// ---------------------------------------------------------------- validace slova
export function checkWord(raw, combo, used) {
  const w = norm(String(raw ?? '').trim());
  if (w.length < 3) return { ok: false, err: 'Slovo je moc krátké (aspoň 3 písmena).' };
  if (w.length > 28) return { ok: false, err: 'Slovo je moc dlouhé.' };
  if (!/^[a-záčďéěíňóřšťúůýž]+$/.test(w)) return { ok: false, err: 'Jen písmena, jedno slovo.' };
  if (!w.includes(norm(combo))) return { ok: false, err: `Slovo musí obsahovat „${combo}“.` };
  if (w === norm(combo)) return { ok: false, err: 'To je jen ta slabika, ne slovo.' };
  if (/(.)\1\1\1/.test(w) || /(.{1,3})\1\1/.test(w)) return { ok: false, err: 'Tohle nevypadá jako slovo.' };
  if (used.has(w)) return { ok: false, err: 'To slovo už v tomto kole zaznělo.' };
  return { ok: true, w };
}

// ---------------------------------------------------------------- stav pro klienty
function needed(room) {
  const l = room.last;
  if (!l) return 0;
  const others = live(room).filter((p) => p.id !== l.by).length;
  return Math.max(1, Math.floor(others / 2) + 1);
}

function view(room, pid) {
  const l = room.last && !room.last.resolved ? room.last : null;
  return {
    t: 'state', code: room.code, phase: room.phase, you: pid, hostId: room.hostId,
    round: room.round, rounds: room.rounds, level: room.level,
    combo: room.phase === 'lobby' || room.phase === 'over' ? null : room.combo,
    holder: room.holder, starter: room.starter,
    players: active(room).map((p) => ({ id: p.id, name: p.name, cards: p.cards, connected: p.connected })),
    words: room.words.slice(-8),
    last: l ? { by: l.by, word: l.word, votes: l.votes.size, needed: needed(room), voted: l.votes.has(pid) } : null,
    ev: room.ev, result: room.result || null,
  };
}
function publish(room, ev) {
  if (ev) room.ev = { id: ++room.evId, ...ev };
  for (const p of room.players) if (p.ws) send(p.ws, view(room, p.id));
}

// ---------------------------------------------------------------- průběh hry
function clearTimers(room) {
  for (const k of ['fuse', 'next', 'alone']) { if (room[k]) clearTimeout(room[k]); room[k] = null; }
}

function nextHolder(room, fromId) {
  const list = active(room);
  const i = list.findIndex((p) => p.id === fromId);
  for (let k = 1; k <= list.length; k++) {
    const p = list[(i + k) % list.length];
    if (p.connected && p.id !== fromId) return p.id;
  }
  return fromId;
}

function startRound(room) {
  clearTimers(room);
  room.round += 1;
  room.phase = 'round';
  room.combo = drawCombo(room);
  room.used = new Set();
  room.words = [];
  room.last = null;
  for (const p of room.players) p.chal = 0;
  let start = room.starter && byId(room, room.starter);
  if (!start || start.left || !start.connected) start = shuffle(live(room).slice())[0];
  room.holder = start.id;
  room.starter = start.id;
  room.fuse = setTimeout(() => explode(room), rndInt(FUSE_MIN, FUSE_MAX));
  publish(room, { type: 'round', round: room.round });
}

function explode(room) {
  if (room.phase !== 'round') return;
  room.fuse = null;
  const loser = byId(room, room.holder);
  if (loser) loser.cards.push(room.combo);
  room.phase = 'boom';
  room.starter = room.holder;
  publish(room, { type: 'boom', loser: room.holder, combo: room.combo });
  room.next = setTimeout(() => afterBoom(room), BOOM_MS);
}

function afterBoom(room) {
  room.next = null;
  if (room.round >= room.rounds || live(room).length < MIN_PLAYERS) return finish(room);
  startRound(room);
}

function finish(room) {
  clearTimers(room);
  room.phase = 'over';
  const list = active(room);
  const best = Math.min(...list.map((p) => p.cards.length));
  room.result = { winners: list.filter((p) => p.cards.length === best).map((p) => p.id), best };
  publish(room, { type: 'over' });
}

function checkAlone(room) {
  if (room.phase !== 'round' && room.phase !== 'boom') return;
  if (live(room).length >= MIN_PLAYERS) { if (room.alone) { clearTimeout(room.alone); room.alone = null; } return; }
  if (!room.alone) room.alone = setTimeout(() => { room.alone = null; if (live(room).length < MIN_PLAYERS && room.phase !== 'over') finish(room); }, ALONE_MS);
}

function submitWord(room, pl, raw) {
  if (room.phase !== 'round') return { err: 'Teď se nehraje.' };
  if (room.holder !== pl.id) return { err: 'Bombu teď nemáš.' };
  const r = checkWord(raw, room.combo, room.used);
  if (!r.ok) return { err: r.err };
  room.used.add(r.w);
  const word = String(raw).trim().slice(0, 28);
  const entry = { by: pl.id, word };
  room.words.push(entry);
  room.last = { by: pl.id, word, w: r.w, votes: new Set(), resolved: false, entry };
  room.holder = nextHolder(room, pl.id);
  publish(room, { type: 'pass', from: pl.id, to: room.holder, word });
  return {};
}

function challenge(room, pl) {
  const l = room.last;
  if (room.phase !== 'round' || !l || l.resolved) return 'Není co zpochybnit.';
  if (l.by === pl.id) return 'Vlastní slovo zpochybnit nejde.';
  if (l.votes.has(pl.id)) return null;
  if (pl.chal >= MAX_CHALLENGES) return 'Další zpochybnění už v tomhle kole nemáš.';
  l.votes.add(pl.id);
  if (l.votes.size >= needed(room)) {
    l.resolved = true;
    for (const v of l.votes) { const p = byId(room, v); if (p) p.chal += 1; }
    room.used.delete(l.w);
    l.entry.bad = true;
    const author = byId(room, l.by);
    if (author && author.connected && !author.left) room.holder = author.id;
    publish(room, { type: 'rejected', by: l.by, word: l.word, to: room.holder });
  } else publish(room, null);
  return null;
}

// ---------------------------------------------------------------- místnosti
function newRoom() {
  const code = makeCode();
  if (!code) return null;
  const room = {
    code, players: [], nextId: 1, hostId: null, phase: 'lobby', round: 0, rounds: 10, level: 'normalni',
    deck: [], combo: null, used: new Set(), words: [], last: null, holder: null, starter: null,
    ev: null, evId: 0, result: null, emptySince: now(), fuse: null, next: null, alone: null,
  };
  rooms.set(code, room);
  return room;
}

function addPlayer(room, ws, name) {
  let n = cleanName(name); let i = 2;
  while (room.players.some((p) => p.name === n)) n = `${cleanName(name).slice(0, 11)} ${i++}`;
  const pl = { id: 'p' + room.nextId++, name: n, token: crypto.randomBytes(12).toString('hex'), ws, connected: true, left: false, cards: [], chal: 0 };
  room.players.push(pl);
  if (!room.hostId) room.hostId = pl.id;
  bind(ws, room, pl);
  return pl;
}
function bind(ws, room, pl) {
  if (pl.ws && pl.ws !== ws) { pl.ws.ctx = null; try { pl.ws.close(4000, 'Přihlášení z jiného okna'); } catch { /* nic */ } }
  pl.ws = ws; pl.connected = true; ws.ctx = { code: room.code, pid: pl.id };
  if (pl.dropTimer) { clearTimeout(pl.dropTimer); pl.dropTimer = null; }
  room.emptySince = null;
  send(ws, { t: 'joined', code: room.code, you: pl.id, token: pl.token });
}

function removeFromLobby(room, pl) {
  room.players = room.players.filter((p) => p !== pl);
  if (room.hostId === pl.id) room.hostId = (live(room)[0] || room.players[0] || {}).id || null;
  if (!room.players.length) destroy(room); else publish(room, null);
}
function destroy(room) { clearTimers(room); rooms.delete(room.code); }

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
    if (room.phase === 'round' && room.holder === pl.id && voluntary && live(room).length >= MIN_PLAYERS) room.holder = nextHolder(room, pl.id);
    publish(room, null);
    checkAlone(room);
  }
  if (live(room).length === 0) room.emptySince = now();
}

function handle(ws, msg) {
  if (msg.t === 'ping') return send(ws, { t: 'pong' });
  if (msg.t === 'create') {
    if (ws.ctx) return;
    const room = newRoom();
    if (!room) return send(ws, { t: 'err', msg: 'Server je plný, zkus to později.' });
    addPlayer(room, ws, msg.name);
    return publish(room, null);
  }
  if (msg.t === 'join') {
    if (ws.ctx) return;
    const room = rooms.get(String(msg.code || '').toUpperCase().trim());
    if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Místnost s tímhle kódem neexistuje.' });
    if (room.phase !== 'lobby') return send(ws, { t: 'err', fatal: true, msg: 'Hra už běží, připojit se jde jen před startem.' });
    if (active(room).length >= MAX_PLAYERS) return send(ws, { t: 'err', fatal: true, msg: 'Místnost je plná (max. 6 hráčů).' });
    addPlayer(room, ws, msg.name);
    return publish(room, null);
  }
  if (msg.t === 'resume') {
    if (ws.ctx) return;
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const pl = room && room.players.find((p) => p.token && p.token === msg.token && !p.left);
    if (!pl) return send(ws, { t: 'err', fatal: true, gone: true, msg: 'Místnost už neexistuje.' });
    bind(ws, room, pl);
    checkAlone(room);
    return publish(room, null);
  }
  const ctx = ws.ctx; if (!ctx) return;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = byId(room, ctx.pid); if (!pl) return;

  switch (msg.t) {
    case 'config': {
      if (room.phase !== 'lobby' || room.hostId !== pl.id) return;
      if (msg.rounds != null) room.rounds = Math.max(3, Math.min(30, Math.round(Number(msg.rounds)) || 10));
      if (LEVELS.includes(msg.level)) { room.level = msg.level; room.deck = []; }
      return publish(room, null);
    }
    case 'start': {
      if (room.phase !== 'lobby' || room.hostId !== pl.id) return;
      if (live(room).length < MIN_PLAYERS) return send(ws, { t: 'err', msg: 'Na hru jsou potřeba aspoň 2 hráči.' });
      room.players = room.players.filter((p) => p.connected);
      for (const p of room.players) { p.cards = []; p.chal = 0; }
      room.round = 0; room.result = null; room.starter = null; room.deck = [];
      return startRound(room);
    }
    case 'word': {
      const r = submitWord(room, pl, msg.word);
      if (r.err) send(ws, { t: 'reject', msg: r.err });
      return;
    }
    case 'challenge': {
      const err = challenge(room, pl);
      if (err) send(ws, { t: 'err', msg: err });
      return;
    }
    case 'again': {
      if (room.phase !== 'over' || room.hostId !== pl.id) return;
      room.players = room.players.filter((p) => !p.left);
      for (const p of room.players) p.cards = [];
      room.phase = 'lobby'; room.round = 0; room.result = null; room.combo = null; room.holder = null; room.last = null; room.words = [];
      return publish(room, { type: 'lobby' });
    }
    case 'leave': return leave(ws, true);
    default:
  }
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
    try { handle(ws, msg); } catch (e) { console.error('bomba: chyba obsluhy', e); }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws, false); });
  ws.on('error', () => {});
}

setInterval(() => { for (const ws of clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* nic */ } } }, 25_000).unref();
setInterval(() => { for (const r of rooms.values()) if (live(r).length === 0 && r.emptySince && now() - r.emptySince > EMPTY_ROOM_MS) destroy(r); }, 15_000).unref();

export const stats = () => ({ rooms: rooms.size, clients: clients.size });
export { rooms };
