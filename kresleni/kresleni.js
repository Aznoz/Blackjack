// KRESLENÍ A HÁDÁNÍ (jako Gartic.io / Skribbl) – 2 až 8 hráčů, jeden kreslí a ostatní hádají slovo v chatu.
// Logika místností, kol, bodování a synchronizace kresby. WebSocket obsluhuje hlavní server na cestě /kresleni.
// Účty (jméno a profilovka z Google účtu) dodává server přes init().
import crypto from 'node:crypto';
import { POOLS, LEVELS, LEVEL_NAMES, fold } from './words.js';

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';
const EMPTY_ROOM_MS = 90_000;
const LOBBY_GRACE_MS = 30_000;
const CHOOSE_MS = Number(process.env.KRES_CHOOSE_MS) || 12_000; // čas kreslíře na výběr slova
const REVEAL_MS = Number(process.env.KRES_REVEAL_MS) || 6_000; // pauza po tahu (ukázka slova a bodů)
const DRAW_OVERRIDE_MS = Number(process.env.KRES_DRAW_MS) || 0; // jen pro testy
export const ROUND_CHOICES = [1, 2, 3, 4, 5];
export const DRAW_CHOICES = [40, 60, 80, 100, 120];
export const W = 800, H = 600; // logické rozměry plátna
const PALETTE_SIZE = 16, WIDTHS = 4;
const MAX_ITEMS = 500, MAX_POINTS = 24_000; // ochrana serveru před zahlcením jednou kresbou
const CHAT_KEEP = 60;
const GUESS_BASE = 100, GUESS_TIME_BONUS = 300, FIRST_BONUS = 50, DRAWER_PER_GUESS = 40;

export { LEVELS, LEVEL_NAMES };
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
    code, players: [], nextId: 1, hostId: null, phase: 'lobby', level: 'mix', rounds: 3, drawSec: 80,
    round: 0, order: [], idx: -1, drawer: null, options: [], entry: null, revealed: new Set(),
    items: [], cur: null, pts: 0, guessed: new Map(), gains: new Map(), turnEnd: 0, turns: [],
    used: new Set(), chat: [], chatId: 0, ev: null, evId: 0, result: null, reveal: null,
    emptySince: now(), timers: { choose: null, draw: null, next: null, hints: [] },
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
  const pl = { id: 'p' + room.nextId++, name: n, token: crypto.randomBytes(12).toString('hex'), ws, connected: true, left: false, score: 0, acc: ident ? ident.acc : null, joinedAt: now() };
  room.players.push(pl);
  if (!room.hostId) room.hostId = pl.id;
  if (room.phase !== 'lobby' && room.phase !== 'over' && room.order.length) room.order.push(pl.id); // pozdější příchozí kreslí v aktuálním kole jako poslední
  bind(ws, room, pl);
  return { pl };
}
function bind(ws, room, pl) {
  if (pl.ws && pl.ws !== ws) { pl.ws.ctx = null; try { pl.ws.close(4000, 'Přihlášení z jiného okna'); } catch { /* nic */ } }
  pl.ws = ws; pl.connected = true; ws.ctx = { code: room.code, pid: pl.id };
  if (pl.dropTimer) { clearTimeout(pl.dropTimer); pl.dropTimer = null; }
  room.emptySince = null;
  send(ws, { t: 'joined', code: room.code, you: pl.id, token: pl.token });
  if (room.phase !== 'lobby') {
    send(ws, { t: 'draw', items: room.items });
    send(ws, { t: 'chatlog', list: room.chat.filter((m) => canSee(room, pl, m)) });
  }
  if (room.paused && live(room).length >= MIN_PLAYERS) resumeFromPause(room);
}

function clearTimers(room) {
  const T = room.timers;
  for (const k of ['choose', 'draw', 'next']) { if (T[k]) clearTimeout(T[k]); T[k] = null; }
  for (const h of T.hints) clearTimeout(h);
  T.hints = [];
}
/** Zbyl jediný hráč (ostatním spadlo spojení): hra se na chvíli zastaví a čeká na návrat; po uplynutí lhůty skončí. */
const GRACE_MS = Number(process.env.KRES_GRACE_MS) || 45_000;
function pauseGame(room) {
  if (room.paused) return;
  clearTimers(room);
  room.paused = { phase: room.phase };
  room.graceT = setTimeout(() => { room.graceT = null; if (rooms.has(room.code) && room.paused) { room.paused = null; finishGame(room, true); } }, GRACE_MS);
  publish(room, { type: 'paused' });
}
function resumeFromPause(room) {
  const was = room.paused; if (!was) return;
  room.paused = null;
  if (room.graceT) clearTimeout(room.graceT);
  room.graceT = null;
  sys(room, '▶️ Hra pokračuje.');
  const dr = byId(room, room.drawer);
  if ((was.phase === 'choose' || was.phase === 'draw') && dr && dr.connected && !dr.left) startChoose(room);
  else nextTurn(room);
}
function removeFromLobby(room, pl) {
  room.players = room.players.filter((p) => p !== pl);
  if (room.hostId === pl.id) room.hostId = (live(room)[0] || room.players[0] || {}).id || null;
  if (!room.players.length) destroy(room); else publish(room, null);
}
function destroy(room) { clearTimers(room); if (room.graceT) clearTimeout(room.graceT); rooms.delete(room.code); }

// ---------------------------------------------------------------- chat
/** Zprávy hráčů, kteří už slovo znají (kreslíř, ti co uhádli), vidí jen oni – ostatní by se mohli dozvědět slovo. */
function canSee(room, pl, m) {
  if (m.vis === 'all') return true;
  if (m.vis === 'only') return m.pid === pl.id;
  return pl.id === room.drawer || room.guessed.has(pl.id);
}
function pushChat(room, m) {
  const msg = { id: ++room.chatId, ...m };
  room.chat.push(msg);
  if (room.chat.length > CHAT_KEEP) room.chat.shift();
  for (const p of room.players) if (p.ws && canSee(room, p, msg)) send(p.ws, { t: 'chat', m: msg });
  return msg;
}
const sys = (room, text, kind = 'sys') => pushChat(room, { kind, text, vis: 'all' });

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// ---------------------------------------------------------------- stav pro klienty
const wordLetters = (room) => [...room.entry.w].filter((c) => c !== ' ').length;
function maskOf(room) {
  const w = [...room.entry.w];
  let k = 0;
  return w.map((ch) => { if (ch === ' ') return ' '; const show = room.revealed.has(k); k++; return show ? ch : '_'; });
}

function view(room, pid) {
  const inTurn = room.entry && (room.phase === 'draw' || room.phase === 'reveal');
  const knows = pid === room.drawer || room.guessed.has(pid);
  const showWord = inTurn && (room.phase === 'reveal' || knows);
  const dr = byId(room, room.drawer);
  return {
    t: 'state', code: room.code, phase: room.phase, you: pid, hostId: room.hostId,
    level: room.level, rounds: room.rounds, drawSec: room.drawSec, round: room.round,
    turnNo: room.turns.length + (room.phase === 'choose' || room.phase === 'draw' ? 1 : 0), turnsTotal: room.rounds * Math.max(2, active(room).length),
    drawer: room.phase === 'lobby' || room.phase === 'over' ? null : room.drawer,
    options: room.phase === 'choose' && pid === room.drawer ? room.options.map((o) => o.w) : null,
    chooseMs: room.phase === 'choose' && room.timers.choose ? Math.max(0, room.chooseEnd - now()) : 0,
    mask: room.phase === 'draw' && room.entry ? maskOf(room) : null,
    word: showWord ? room.entry.w : null,
    wordLen: inTurn ? wordLetters(room) : 0,
    guessed: [...room.guessed.keys()],
    turnMs: room.phase === 'draw' ? Math.max(0, room.turnEnd - now()) : 0,
    reveal: room.phase === 'reveal' ? room.reveal : null,
    drawerName: dr ? dr.name : null,
    players: active(room).map((p) => ({ id: p.id, name: p.name, connected: p.connected, score: p.score, avatar: p.acc ? p.acc.avatar : null, account: !!p.acc })),
    paused: !!room.paused, ev: room.ev, result: room.result || null,
  };
}
function publish(room, ev) {
  if (ev) room.ev = { id: ++room.evId, ...ev };
  for (const p of room.players) if (p.ws) send(p.ws, view(room, p.id));
}
function broadcastDraw(room, msg, exceptId) {
  for (const p of room.players) if (p.ws && p.id !== exceptId) send(p.ws, msg);
}

// ---------------------------------------------------------------- průběh hry
function drawWords(room) {
  let pool = POOLS[room.level].filter((e) => !room.used.has(e.f));
  if (pool.length < 3) { room.used.clear(); pool = POOLS[room.level].slice(); }
  return shuffle(pool.slice()).slice(0, 3);
}

function startGame(room) {
  clearTimers(room);
  room.players = room.players.filter((p) => p.connected);
  for (const p of room.players) p.score = 0;
  room.round = 1; room.turns = []; room.result = null; room.used.clear();
  room.order = shuffle(active(room).map((p) => p.id)); room.idx = -1;
  room.chat = []; room.chatId = 0;
  nextTurn(room);
}

/** Najde dalšího kreslíře (přítomného hráče); po posledním v kole začne další kolo, po posledním kole konec hry. */
function nextTurn(room) {
  for (;;) {
    room.idx++;
    if (room.idx >= room.order.length) {
      room.round++;
      if (room.round > room.rounds) return finishGame(room, false);
      room.order = active(room).map((p) => p.id); room.idx = 0;
      sys(room, `🏁 Začíná ${room.round}. kolo`, 'round');
    }
    const p = byId(room, room.order[room.idx]);
    if (p && !p.left && p.connected) { room.drawer = p.id; break; }
    if (!live(room).length) return pauseGame(room);
  }
  if (live(room).length < MIN_PLAYERS) return pauseGame(room);
  startChoose(room);
}

function startChoose(room) {
  clearTimers(room);
  room.phase = 'choose';
  room.options = drawWords(room);
  room.entry = null; room.revealed = new Set(); room.guessed = new Map(); room.gains = new Map(); room.reveal = null;
  room.items = []; room.cur = null; room.pts = 0;
  broadcastDraw(room, { t: 'draw', items: [] });
  room.chooseEnd = now() + CHOOSE_MS;
  room.timers.choose = setTimeout(() => { room.timers.choose = null; pick(room, Math.floor(Math.random() * room.options.length)); }, CHOOSE_MS);
  publish(room, { type: 'choose', drawer: room.drawer });
}

function pick(room, i) {
  if (room.phase !== 'choose') return;
  const e = room.options[i];
  if (!e) return;
  if (room.timers.choose) clearTimeout(room.timers.choose);
  room.timers.choose = null;
  room.entry = e; room.used.add(e.f);
  startDraw(room);
}

function startDraw(room) {
  room.phase = 'draw';
  const ms = DRAW_OVERRIDE_MS || room.drawSec * 1000;
  room.turnStart = now(); room.turnEnd = now() + ms;
  room.timers.draw = setTimeout(() => { room.timers.draw = null; endTurn(room, 'time'); }, ms);
  // nápovědy: odkrytá písmena v 40 % a 70 % času (u delších slov)
  const n = wordLetters(room);
  const hints = n >= 8 ? 2 : n >= 4 ? 1 : 0;
  for (let h = 0; h < hints; h++) {
    room.timers.hints.push(setTimeout(() => {
      if (room.phase !== 'draw') return;
      const free = [...Array(n).keys()].filter((k) => !room.revealed.has(k));
      if (free.length <= 1) return;
      room.revealed.add(free[Math.floor(Math.random() * free.length)]);
      publish(room, { type: 'hint' });
    }, Math.round(ms * (h === 0 ? 0.4 : 0.7))));
  }
  const dr = byId(room, room.drawer);
  sys(room, `✏️ ${dr ? dr.name : 'Kreslíř'} kreslí – hádejte, co to je!`, 'turn');
  publish(room, { type: 'draw', drawer: room.drawer });
}

function endTurn(room, reason) {
  if (room.phase !== 'draw' && room.phase !== 'choose') return;
  clearTimers(room);
  const wasChoose = room.phase === 'choose';
  room.phase = 'reveal';
  if (!room.entry) room.entry = room.options[0] || { w: '?', f: '?' };
  const gains = [...room.players.filter((p) => !p.left)].map((p) => ({ id: p.id, pts: room.gains.get(p.id) || 0 }));
  room.reveal = { word: room.entry.w, drawer: room.drawer, reason, gains, nobody: !room.guessed.size };
  room.turns.push({ drawer: room.drawer, word: room.entry.w, guessed: room.guessed.size });
  const label = reason === 'all' ? 'Všichni uhádli!' : reason === 'left' ? 'Kreslíř odešel.' : wasChoose ? 'Kreslíř nic nevybral.' : 'Čas vypršel.';
  sys(room, `${label} Slovo bylo „${room.entry.w}“.`, 'reveal');
  publish(room, { type: 'turnEnd', reason });
  room.timers.next = setTimeout(() => { room.timers.next = null; if (rooms.has(room.code)) nextTurn(room); }, REVEAL_MS);
}

function finishGame(room, abandoned) {
  clearTimers(room);
  if (room.graceT) { clearTimeout(room.graceT); room.graceT = null; }
  room.paused = null;
  room.phase = 'over';
  const ranking = active(room).slice().sort((a, b) => b.score - a.score);
  const top = ranking.length ? ranking[0].score : 0;
  room.result = { abandoned: !!abandoned, turns: room.turns.length, best: top > 0 ? ranking.filter((p) => p.score === top).map((p) => p.id) : [] };
  publish(room, { type: 'over' });
}

function guessWord(room, pl, text) {
  const g = fold(text);
  const f = room.entry.f;
  if (g && g === f) {
    const left = Math.max(0, room.turnEnd - now());
    const total = Math.max(1, room.turnEnd - room.turnStart);
    const first = room.guessed.size === 0;
    const pts = GUESS_BASE + Math.floor(GUESS_TIME_BONUS * Math.min(1, left / total)) + (first ? FIRST_BONUS : 0);
    room.guessed.set(pl.id, { pts, t: now() });
    pl.score += pts; room.gains.set(pl.id, pts);
    const dr = byId(room, room.drawer);
    if (dr) { dr.score += DRAWER_PER_GUESS; room.gains.set(dr.id, (room.gains.get(dr.id) || 0) + DRAWER_PER_GUESS); }
    sys(room, `🎉 ${pl.name} uhádl slovo! (+${pts})`, 'ok');
    const waiting = live(room).filter((p) => p.id !== room.drawer && !room.guessed.has(p.id));
    publish(room, { type: 'guess', by: pl.id });
    if (!waiting.length) endTurn(room, 'all');
    return;
  }
  pushChat(room, { kind: 'chat', pid: pl.id, name: pl.name, text, vis: 'all' });
  if (g && g.length >= 4 && lev(g, f) === 1) pushChat(room, { kind: 'close', pid: pl.id, text: `„${text}“ je skoro dobře!`, vis: 'only' });
}

function handleChat(room, pl, raw) {
  const text = String(raw ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!text) return;
  if (room.phase === 'draw' && pl.id !== room.drawer && !room.guessed.has(pl.id)) return guessWord(room, pl, text);
  if (room.phase === 'draw') { // kreslíř a ti, co už uhádli, píšou jen „mezi sebou“
    return pushChat(room, { kind: 'chat', pid: pl.id, name: pl.name, text, vis: 'know' });
  }
  pushChat(room, { kind: 'chat', pid: pl.id, name: pl.name, text, vis: 'all' });
}

// ---------------------------------------------------------------- kresba
const idx = (v, max) => (Number.isInteger(v) && v >= 0 && v < max ? v : null); // index barvy/tloušťky: mimo rozsah se zahodí
const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
function handleDraw(room, pl, m) {
  if (room.phase !== 'draw' || pl.id !== room.drawer) return;
  switch (m.op) {
    case 'b': { // začátek tahu: barva, tloušťka a první bod
      const c = idx(m.c, PALETTE_SIZE), w = idx(m.w, WIDTHS), x = int(m.x, 0, W), y = int(m.y, 0, H);
      if (c === null || w === null || x === null || y === null) return;
      if (room.items.length >= MAX_ITEMS || room.pts >= MAX_POINTS) { room.cur = null; return; }
      room.cur = { k: 's', c, w, pts: [x, y] }; room.items.push(room.cur); room.pts++;
      return broadcastDraw(room, { t: 'd', op: 'b', c, w, x, y }, pl.id);
    }
    case 'p': { // další body tahu
      if (!room.cur || !Array.isArray(m.pts)) return;
      const pts = [];
      for (let i = 0; i + 1 < m.pts.length && pts.length < 120; i += 2) {
        const x = int(m.pts[i], 0, W), y = int(m.pts[i + 1], 0, H);
        if (x === null || y === null) return;
        pts.push(x, y);
      }
      if (!pts.length || room.pts + pts.length / 2 > MAX_POINTS) return;
      room.cur.pts.push(...pts); room.pts += pts.length / 2;
      return broadcastDraw(room, { t: 'd', op: 'p', pts }, pl.id);
    }
    case 'f': { // vyplnění plochy
      const c = idx(m.c, PALETTE_SIZE), x = int(m.x, 0, W), y = int(m.y, 0, H);
      if (c === null || x === null || y === null || room.items.length >= MAX_ITEMS) return;
      room.cur = null; room.items.push({ k: 'f', c, x, y });
      return broadcastDraw(room, { t: 'd', op: 'f', c, x, y }, pl.id);
    }
    case 'u': { // zpět
      room.cur = null;
      if (!room.items.length) return;
      room.items.pop();
      return broadcastDraw(room, { t: 'draw', items: room.items }, pl.id);
    }
    case 'x': { // smazat vše
      room.cur = null; room.items = []; room.pts = 0;
      return broadcastDraw(room, { t: 'draw', items: [] }, pl.id);
    }
    default:
  }
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
    if (!active(room).length) return destroy(room);
    if (room.phase === 'over') { publish(room, null); }
    else if (live(room).length < MIN_PLAYERS) {
      if (voluntary || !live(room).length) { // odešel schválně → konec; spadlo spojení všem → čeká se na návrat
        if (live(room).length) { sys(room, `${pl.name} odešel(a) – nezbyl dost hráčů.`); finishGame(room, true); } else { pauseGame(room); }
      } else { sys(room, `${pl.name} se odpojil(a) – čekáme na návrat…`); pauseGame(room); }
    } else if ((room.phase === 'draw' || room.phase === 'choose') && room.drawer === pl.id) { publish(room, null); endTurn(room, 'left'); }
    else {
      publish(room, null);
      if (room.phase === 'draw') { // odešel poslední, kdo ještě hádal → tah končí
        const waiting = live(room).filter((p) => p.id !== room.drawer && !room.guessed.has(p.id));
        if (!waiting.length && room.guessed.size) endTurn(room, 'all');
      }
    }
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
      if (room.phase === 'over') return send(ws, { t: 'err', fatal: true, msg: 'Tahle hra už skončila.' });
      if (active(room).length >= MAX_PLAYERS) return send(ws, { t: 'err', fatal: true, msg: `Místnost je plná (max. ${MAX_PLAYERS} hráčů).` });
    }
    const r = addPlayer(room, ws, msg);
    if (r.err) { if (msg.t === 'create') destroy(room); return send(ws, { t: 'err', fatal: true, msg: r.err }); }
    if (room.phase !== 'lobby') sys(room, `👋 ${r.pl.name} se připojil(a)`);
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

  if (room.paused && (msg.t === 'd' || msg.t === 'pick' || msg.t === 'chat')) return; // hra čeká na návrat hráče
  switch (msg.t) {
    case 'config': {
      if (room.phase !== 'lobby' || room.hostId !== pl.id) return;
      if (LEVELS.includes(msg.level)) room.level = msg.level;
      if (ROUND_CHOICES.includes(Number(msg.rounds))) room.rounds = Number(msg.rounds);
      if (DRAW_CHOICES.includes(Number(msg.drawSec))) room.drawSec = Number(msg.drawSec);
      return publish(room, null);
    }
    case 'start': {
      if (room.phase !== 'lobby' || room.hostId !== pl.id) return;
      if (live(room).length < MIN_PLAYERS) return send(ws, { t: 'err', msg: 'Na hru jsou potřeba aspoň 2 hráči.' });
      return startGame(room);
    }
    case 'pick': {
      if (room.phase !== 'choose' || room.drawer !== pl.id) return;
      const i = Number(msg.i);
      if (!Number.isInteger(i) || i < 0 || i >= room.options.length) return;
      return pick(room, i);
    }
    case 'd': return handleDraw(room, pl, msg);
    case 'chat': return handleChat(room, pl, msg.text);
    case 'again': {
      if (room.phase !== 'over' || room.hostId !== pl.id) return;
      room.players = room.players.filter((p) => !p.left && p.connected);
      clearTimers(room);
      room.phase = 'lobby'; room.round = 0; room.entry = null; room.drawer = null; room.items = []; room.result = null; room.turns = []; room.order = []; room.guessed = new Map(); room.chat = [];
      for (const p of room.players) p.score = 0;
      broadcastDraw(room, { t: 'draw', items: [] });
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
  ws.bucket = { n: 80, t: now() }; // kreslení posílá hodně malých zpráv
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    const t = now();
    ws.bucket.n = Math.min(80, ws.bucket.n + ((t - ws.bucket.t) / 1000) * 50);
    ws.bucket.t = t;
    if (ws.bucket.n < 1) return;
    ws.bucket.n -= 1;
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { handle(ws, msg); } catch (e) { console.error('kresleni: chyba obsluhy', e); }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws, false); });
  ws.on('error', () => {});
}

setInterval(() => { for (const ws of clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* nic */ } } }, 25_000).unref();
setInterval(() => { for (const r of rooms.values()) if (live(r).length === 0 && r.emptySince && now() - r.emptySince > EMPTY_ROOM_MS) destroy(r); }, 15_000).unref();

export const stats = () => ({ rooms: rooms.size, clients: clients.size });
export { rooms };
