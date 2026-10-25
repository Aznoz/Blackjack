// Vesmírná štvanice – místnosti, lobby, boti, časovače. WebSocket obsluhuje hlavní server na cestě /stvanice.
// Účty (jméno z Google účtu, profilovka) dodává server přes init(); coiny se zatím nepoužívají.
import crypto from 'node:crypto';
import { Game } from './game.js';
import { Bot } from './bot.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './data.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';
const EMPTY_ROOM_MS = 90_000;
const LOBBY_GRACE_MS = 30_000;
const DROP_BOT_MS = 6_000;        // po tolika ms od odpojení za hráče hraje bot
const FAST = !!process.env.STVANICE_FAST; // jen pro testy: časy v řádu stovek ms
const SPEEDS = FAST ? { pomalu: [400, 300], normalne: [400, 300], rychle: [400, 300] } : { // čas na rozhodnutí: [vlastní tah, reakce] v ms
  pomalu: [120_000, 45_000],
  normalne: [75_000, 30_000],
  rychle: [40_000, 20_000],
};
const BOT_MIN = Number(process.env.STVANICE_BOT_MIN_MS) || 1500;
const PLAY_MIN = Number(process.env.STVANICE_BOT_MIN_MS) || 2300; // běžný průběh hry je pomalejší než výběr rolí a postav
const PLAY_MAX = Number(process.env.STVANICE_BOT_MAX_MS) || 3800;
const BOT_MAX = Number(process.env.STVANICE_BOT_MAX_MS) || 2600;
const BOT_TEMPO = { pomalu: 1.7, normalne: 1, rychle: 0.5 }; // násobek prodlevy botů
const BOT_NAMES = ['Robo Atlas', 'Kapitán Zlomek', 'Nova-7', 'Dr. Orbit', 'Mechanik Hugo', 'Pilot Lenka', 'Android Bob', 'Komandér Pixel', 'Kyber', 'Droid Eda'];

const rooms = new Map();
const now = () => Date.now();
const rnd = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
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

const humans = (room) => room.players.filter((p) => !p.left);
const live = (room) => humans(room).filter((p) => p.connected);
const byId = (room, id) => room.players.find((p) => p.id === id);

// ---------------------------------------------------------------- pohled pro klienty
function lobbyList(room) {
  return humans(room).map((p) => ({ id: p.id, name: p.name, connected: p.connected, avatar: p.acc ? p.acc.avatar : null, account: !!p.acc }));
}
function view(room, pid) {
  const out = {
    t: 'state', code: room.code, phase: room.phase, you: pid, hostId: room.hostId,
    total: room.total, speed: room.speed, botSpeed: room.botSpeed, lobby: lobbyList(room), min: MIN_PLAYERS, max: MAX_PLAYERS,
  };
  if (room.game) {
    const gv = room.game.view(pid);
    gv.players = gv.players.map((p) => {
      const h = byId(room, p.id);
      return { ...p, connected: h ? h.connected && !h.left : true, ctrl: h ? (h.left ? 'bot' : h.afk || !h.connected ? 'bot' : 'human') : 'bot' };
    });
    out.game = gv;
    out.events = room.game.events.slice(-30);
    out.ttl = room.deadline ? Math.max(0, room.deadline - now()) : null;
    out.ttlMax = room.deadlineMax || null;
  }
  return out;
}
function publish(room) {
  for (const p of room.players) if (p.ws) send(p.ws, view(room, p.id));
}

// ---------------------------------------------------------------- řízení hry (časovače, boti)
function clearTimer(room) { if (room.timer) clearTimeout(room.timer); room.timer = null; room.deadline = null; room.deadlineMax = null; }

const isBotTurn = (room, pid) => {
  const h = byId(room, pid);
  return !h || h.left || h.afk || !h.connected && now() - (h.dropAt || 0) > DROP_BOT_MS;
};

function schedule(room) {
  clearTimer(room);
  const g = room.game;
  if (!g || room.phase !== 'game' || !g.pending) return;
  if (!live(room).length) return; // nikdo se nedívá → hra se zastaví, dokud se někdo nevrátí
  const pd = g.pending;
  const h = byId(room, pd.pid);
  if (isBotTurn(room, pd.pid)) {
    const quick = ['respond', 'discard', 'pick', 'rescue', 'rolepick', 'charpick'].includes(pd.type);
    const pick = pd.type === 'rolepick' || pd.type === 'charpick';
    const f = (BOT_TEMPO[room.botSpeed] || 1) * (quick ? 0.7 : 1);
    room.timer = setTimeout(() => botAct(room), pick ? rnd(BOT_MIN * 1.3 * (BOT_TEMPO[room.botSpeed] || 1), BOT_MAX * 1.3 * (BOT_TEMPO[room.botSpeed] || 1)) : rnd(PLAY_MIN * f, PLAY_MAX * f));
    return;
  }
  const [playMs, replyMs] = SPEEDS[room.speed] || SPEEDS.normalne;
  const ms = pd.type === 'play' ? playMs : replyMs;
  room.deadline = now() + ms; room.deadlineMax = ms;
  // odpojený člověk se po chvíli nahradí botem
  const wait = h && !h.connected ? Math.max(500, DROP_BOT_MS - (now() - (h.dropAt || now())) + 50) : ms;
  room.timer = setTimeout(() => {
    if (h && !h.connected) return schedule(room);
    timeout(room, h);
  }, wait);
}

function afterStep(room) {
  const g = room.game;
  for (const b of room.bots.values()) b.observe();
  if (g.result) { room.phase = 'over'; clearTimer(room); publish(room); return; }
  publish(room);
  schedule(room);
}

function botFor(room, pid) {
  let b = room.bots.get(pid);
  if (!b) { b = new Bot(room.game, pid); room.bots.set(pid, b); }
  return b;
}

function botAct(room) {
  const g = room.game;
  if (!g || !g.pending || room.phase !== 'game') return;
  const pid = g.pending.pid;
  let a;
  try { a = botFor(room, pid).decide(); } catch (e) { console.error('stvanice: chyba bota', e); a = null; }
  let r = a ? g.act(pid, a) : { err: 'bez akce' };
  if (!r.ok) { // nouzově výchozí akce, aby se hra nikdy nezasekla
    r = g.act(pid, g.autoAction());
    if (!r.ok) { console.error('stvanice: ani výchozí akce neprošla', g.pending && g.pending.type, r.err); room.game = null; room.phase = 'lobby'; publish(room); return; }
  }
  afterStep(room);
}

function timeout(room, h) {
  const g = room.game;
  if (!g || !g.pending) return;
  const pid = g.pending.pid;
  if (h) {
    h.strikes = (h.strikes || 0) + 1;
    if (h.strikes >= 2) h.afk = true;
  }
  const r = g.act(pid, g.autoAction());
  if (!r.ok) { botAct(room); return; }
  afterStep(room);
}

// ---------------------------------------------------------------- místnosti
function newRoom() {
  const code = makeCode();
  if (!code) return null;
  const room = {
    code, players: [], nextId: 1, hostId: null, phase: 'lobby', total: 4, speed: 'normalne', botSpeed: 'normalne',
    game: null, bots: new Map(), timer: null, deadline: null, deadlineMax: null, emptySince: now(),
  };
  rooms.set(code, room);
  return room;
}
function destroy(room) { clearTimer(room); rooms.delete(room.code); }

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
  const pl = { id: 'p' + room.nextId++, name: n, token: crypto.randomBytes(12).toString('hex'), ws, connected: true, left: false, afk: false, strikes: 0, acc: ident ? ident.acc : null };
  room.players.push(pl);
  if (!room.hostId) room.hostId = pl.id;
  bind(ws, room, pl);
  return { pl };
}
function bind(ws, room, pl) {
  if (pl.ws && pl.ws !== ws) { pl.ws.ctx = null; try { pl.ws.close(4000, 'Přihlášení z jiného okna'); } catch { /* nic */ } }
  pl.ws = ws; pl.connected = true; pl.dropAt = null; ws.ctx = { code: room.code, pid: pl.id };
  if (pl.dropTimer) { clearTimeout(pl.dropTimer); pl.dropTimer = null; }
  room.emptySince = null;
  send(ws, { t: 'joined', code: room.code, you: pl.id, token: pl.token });
}

function removeFromLobby(room, pl) {
  room.players = room.players.filter((p) => p !== pl);
  if (room.hostId === pl.id) room.hostId = (live(room)[0] || room.players[0] || {}).id || null;
  if (!room.players.length) destroy(room); else publish(room);
}

function leave(ws, voluntary) {
  const ctx = ws.ctx; if (!ctx) return;
  ws.ctx = null;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = byId(room, ctx.pid);
  if (!pl || (pl.ws && pl.ws !== ws)) return;
  pl.ws = null; pl.connected = false; pl.dropAt = now();
  if (room.hostId === pl.id) { const n = live(room)[0]; if (n) room.hostId = n.id; }
  if (room.phase === 'lobby') {
    if (voluntary) removeFromLobby(room, pl);
    else { pl.dropTimer = setTimeout(() => { if (!pl.connected && rooms.has(room.code)) removeFromLobby(room, pl); }, LOBBY_GRACE_MS); publish(room); }
  } else {
    if (voluntary) { pl.left = true; pl.token = null; }
    publish(room);
    // je-li právě na řadě, ať bot převezme hned
    if (room.phase === 'game') schedule(room);
  }
  if (live(room).length === 0) room.emptySince = now();
}

const SAFE_KEYS = ['act', 'cardId', 'target', 'tzone', 'tcard', 'replaceId', 'pass', 'escape', 'pick', 'src', 'pid', 'slot', 'char'];
function cleanAction(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const out = {};
  for (const k of SAFE_KEYS) {
    const v = a[k];
    if (v === undefined) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string' && v.length <= 24) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else return null;
  }
  for (const k of ['cardIds', 'picks']) {
    const v = a[k];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.length > 3 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
    out[k] = v;
  }
  return out;
}

function startGame(room) {
  room.players = room.players.filter((p) => p.connected && !p.left);
  const hs = room.players;
  const total = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.max(room.total, hs.length)));
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  const list = hs.map((p) => ({ id: p.id, name: p.name, bot: false, avatar: p.acc ? p.acc.avatar : null }));
  for (let i = 0; list.length < total; i++) list.push({ id: 'b' + (i + 1), name: names[i % names.length], bot: true, avatar: null });
  for (const p of hs) { p.afk = false; p.strikes = 0; }
  room.bots = new Map();
  room.game = new Game({ players: list, pick: true });
  for (const p of room.game.players) room.bots.set(p.id, new Bot(room.game, p.id)); // každý bot sleduje hru od začátku (i za hráče, který odejde)
  room.phase = 'game';
  afterStep(room);
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
      if (humans(room).length >= MAX_PLAYERS) return send(ws, { t: 'err', fatal: true, msg: 'Místnost je plná (max. 8 hráčů).' });
    }
    const r = addPlayer(room, ws, msg);
    if (r.err) { if (msg.t === 'create') destroy(room); return send(ws, { t: 'err', fatal: true, msg: r.err }); }
    return publish(room);
  }
  if (msg.t === 'resume') {
    if (ws.ctx) return;
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const pl = room && room.players.find((p) => p.token && p.token === msg.token && !p.left);
    if (!pl) return send(ws, { t: 'err', fatal: true, gone: true, msg: 'Místnost už neexistuje.' });
    bind(ws, room, pl);
    publish(room);
    if (room.phase === 'game') schedule(room);
    return;
  }
  const ctx = ws.ctx; if (!ctx) return;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = byId(room, ctx.pid); if (!pl) return;

  switch (msg.t) {
    case 'config': {
      if (room.phase !== 'lobby' || room.hostId !== pl.id) return;
      if (msg.total != null) room.total = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(Number(msg.total)) || 4));
      if (typeof msg.speed === 'string' && SPEEDS[msg.speed]) room.speed = msg.speed;
      if (typeof msg.botSpeed === 'string' && BOT_TEMPO[msg.botSpeed]) room.botSpeed = msg.botSpeed;
      return publish(room);
    }
    case 'kick': {
      if (room.phase !== 'lobby' || room.hostId !== pl.id) return;
      const v = byId(room, msg.id);
      if (!v || v.id === pl.id) return;
      if (v.ws) { send(v.ws, { t: 'err', fatal: true, msg: 'Host tě vyhodil z místnosti.' }); v.ws.ctx = null; }
      return removeFromLobby(room, v);
    }
    case 'start': {
      if (room.phase !== 'lobby' || room.hostId !== pl.id) return;
      if (live(room).length < 1) return;
      return startGame(room);
    }
    case 'act': {
      if (room.phase !== 'game' || !room.game) return;
      const a = cleanAction(msg.a);
      if (!a) return send(ws, { t: 'reject', msg: 'Neplatná akce.' });
      const r = room.game.act(pl.id, a);
      if (!r.ok) return send(ws, { t: 'reject', msg: r.err });
      pl.strikes = 0; pl.afk = false;
      return afterStep(room);
    }
    case 'again': {
      if (room.phase !== 'over' || room.hostId !== pl.id) return;
      room.players = room.players.filter((p) => !p.left);
      room.game = null; room.bots = new Map(); room.phase = 'lobby';
      for (const p of room.players) { p.afk = false; p.strikes = 0; }
      return publish(room);
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
    try { handle(ws, msg); } catch (e) { console.error('stvanice: chyba obsluhy', e); }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws, false); });
  ws.on('error', () => {});
}

setInterval(() => { for (const ws of clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* nic */ } } }, 25_000).unref();
setInterval(() => { for (const r of rooms.values()) if (live(r).length === 0 && r.emptySince && now() - r.emptySince > EMPTY_ROOM_MS) destroy(r); }, 15_000).unref();

export const stats = () => ({ rooms: rooms.size, clients: clients.size });
export { rooms, handle };
