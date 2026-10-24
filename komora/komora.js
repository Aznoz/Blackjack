// Prokletá komora – multiplayerový server (Node.js + WebSocket).
// Spuštění: npm install && npm start      (na Renderu: Build = npm install, Start = npm start)
//
// Proměnné prostředí (vše volitelné):
//   PORT             port (Render ho nastaví sám)
//   ALLOWED_ORIGINS  seznam povolených adres frontendu oddělený čárkou, např. https://mujweb.webzdarma.cz
//   TURN_SECONDS     čas na tah člověka (výchozí 45 s)
//   GAME_SPEED       násobek délky animací (1 = normální; testy používají malé číslo)

import crypto from 'node:crypto';
import { Game, eventsFor, viewFromSnap } from './game.js';
import { decide, BOT_NAMES } from './bot.js';

const SPEED = Number(process.env.GAME_SPEED ?? 1);
const TURN_MS = Math.max(1, Number(process.env.TURN_SECONDS) || 45) * 1000;
const normOrigin = (s) => String(s || '').trim().replace(/\/+$/, '').toLowerCase();
const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';
const LOBBY_GRACE_MS = 30_000;
const EMPTY_ROOM_MS = 90_000;

const rooms = new Map();

// ---------------------------------------------------------------- pomocné
const rnd = (a, b) => a + Math.random() * (b - a);
const now = () => Date.now();

function cleanName(s) {
  const t = String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return t || 'Hráč';
}

function makeCode() {
  for (let tries = 0; tries < 200; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch { /* spojení padlo */ }
  }
}

function humans(room) { return room.players.filter((p) => !p.bot); }
function connectedHumans(room) { return humans(room).filter((p) => p.connected); }

function uniqueName(room, name) {
  let n = name; let i = 2;
  while (room.players.some((p) => p.name === n)) n = `${name.slice(0, 11)} ${i++}`;
  return n;
}

function addPlayer(room, { name, bot = false, ws = null }) {
  const pl = {
    id: 'p' + room.nextId++, name: uniqueName(room, name), bot,
    token: bot ? null : crypto.randomBytes(12).toString('hex'),
    ws, connected: !bot, afk: false, dropTimer: null,
  };
  room.players.push(pl);
  if (!room.hostId && !bot) room.hostId = pl.id;
  return pl;
}

function lobbyInfo(room) {
  return {
    code: room.code,
    host: room.hostId,
    phase: room.phase,
    settings: room.settings,
    players: room.players.map((p, i) => ({ id: p.id, name: p.name, bot: p.bot, connected: p.connected || p.bot, color: i % 4 })),
  };
}

function sendLobby(room) {
  const info = lobbyInfo(room);
  for (const p of room.players) if (p.ws) send(p.ws, { t: 'lobby', lobby: info });
}

/** Doplní do pohledu informace, které zná jen server (kdo je odpojený / hraje za něj automat). */
function decorate(room, view) {
  for (const vp of view.players) {
    const rp = room.players.find((x) => x.id === vp.id);
    vp.auto = !!rp && !rp.bot && (!rp.connected || rp.afk);
    vp.connected = !!rp && (rp.bot || rp.connected);
  }
  return view;
}

function timeLeft(room) {
  if (room.phase !== 'playing' || !room.deadline) return 0;
  return Math.max(0, room.deadline - now());
}

function publish(room, events) {
  const tl = timeLeft(room);
  for (const p of room.players) {
    if (!p.ws) continue;
    const evs = eventsFor(events, p.id);
    for (const ev of evs) decorate(room, ev.s);
    send(p.ws, { t: 'update', events: evs, tl, lobby: lobbyInfo(room) });
  }
}

function syncTo(room, pl) {
  if (!room.game) { send(pl.ws, { t: 'lobby', lobby: lobbyInfo(room) }); return; }
  const state = decorate(room, viewFromSnap(room.game.snapshot(), pl.id));
  send(pl.ws, { t: 'sync', state, tl: timeLeft(room), lobby: lobbyInfo(room) });
}

// ---------------------------------------------------------------- průběh hry
function clearTimers(room) {
  clearTimeout(room.timer);
  room.timer = null;
  room.deadline = 0;
}

function schedule(room) {
  clearTimeout(room.timer);
  if (room.phase !== 'playing') return;
  const cur = room.game.cur();
  const pl = room.players.find((p) => p.id === cur.id);
  const wait = Math.max(0, room.busyUntil - now());
  const auto = !pl || pl.bot || !pl.connected || pl.afk;
  if (auto) {
    room.deadline = 0;
    room.timer = setTimeout(() => autoStep(room), wait + rnd(900, 1700) * SPEED);
  } else {
    room.deadline = now() + wait + TURN_MS;
    room.timer = setTimeout(() => {
      pl.afk = true; // kdo nestíhá, hraje za něj automat, dokud sám něco neudělá
      autoStep(room);
    }, wait + TURN_MS);
  }
}

function afterAction(room, events) {
  const total = events.reduce((a, e) => a + (e.dur || 0), 0);
  room.busyUntil = now() + total;
  if (room.game.phase === 'over') {
    room.phase = 'over';
    clearTimers(room);
  } else {
    schedule(room);
  }
  publish(room, events);
}

function autoStep(room) {
  if (room.phase !== 'playing') return;
  const g = room.game;
  const cur = g.cur();
  let res;
  try {
    const act = decide(viewFromSnap(g.snapshot(), cur.id));
    res = act.t === 'use' ? g.use(cur.id, act.card, act.target) : g.shoot(cur.id, act.target);
  } catch (err) {
    console.error('bot error', err);
    res = { ok: false, err: 'chyba' };
  }
  if (!res.ok) {
    const opp = g.players.filter((p) => p.alive && p.id !== cur.id);
    res = g.shoot(cur.id, cur.cursed || !opp.length ? cur.id : opp[Math.floor(Math.random() * opp.length)].id);
    if (!res.ok) res = g.shoot(cur.id, cur.id);
  }
  if (!res.ok) {
    console.error('autoStep selhal:', res.err);
    room.timer = setTimeout(() => autoStep(room), 3000);
    return;
  }
  afterAction(room, res.events);
}

function startGame(room) {
  // odpojení lidé se do hry nebrat
  for (const p of [...room.players]) if (!p.bot && !p.connected) removePlayer(room, p, true);
  if (room.players.length < 2) return 'Ke hře jsou potřeba aspoň dva hráči (můžeš přidat boty).';
  const defs = room.players.map((p) => ({ id: p.id, name: p.name, bot: p.bot }));
  room.game = new Game(defs, { lives: room.settings.lives, durScale: SPEED });
  room.phase = 'playing';
  for (const p of room.players) p.afk = false;
  const events = room.game.start();
  afterAction(room, events);
  return null;
}

function removePlayer(room, pl, silent = false) {
  clearTimeout(pl.dropTimer);
  room.players = room.players.filter((p) => p !== pl);
  if (room.hostId === pl.id) {
    const next = humans(room).find((p) => p.connected) || humans(room)[0];
    room.hostId = next ? next.id : null;
  }
  if (!silent) sendLobby(room);
}

function destroyRoom(room) {
  clearTimers(room);
  for (const p of room.players) clearTimeout(p.dropTimer);
  rooms.delete(room.code);
}

function newRoom() {
  const code = makeCode();
  if (!code) return null;
  const room = {
    code, players: [], hostId: null, settings: { lives: 4 }, phase: 'lobby', game: null,
    busyUntil: 0, timer: null, deadline: 0, nextId: 0, emptySince: 0,
  };
  rooms.set(code, room);
  return room;
}

function bindJoined(ws, room, pl, extra = {}) {
  ws.ctx = { code: room.code, pid: pl.id };
  pl.ws = ws; pl.connected = true; pl.afk = false;
  clearTimeout(pl.dropTimer);
  room.emptySince = 0;
  send(ws, { t: 'joined', code: room.code, you: pl.id, token: pl.token, lobby: lobbyInfo(room), ...extra });
}

function addBots(room, count) {
  const used = new Set(room.players.map((p) => p.name));
  const pool = BOT_NAMES.filter((n) => !used.has(n)).sort(() => Math.random() - 0.5);
  for (let i = 0; i < count && room.players.length < MAX_PLAYERS; i++) {
    addPlayer(room, { name: pool[i] || 'Bot ' + (i + 1), bot: true });
  }
}

// ---------------------------------------------------------------- zprávy od klientů
function handle(ws, msg) {
  const ctx = ws.ctx;
  const room = ctx ? rooms.get(ctx.code) : null;
  const pl = room ? room.players.find((p) => p.id === ctx.pid) : null;

  switch (msg.t) {
    case 'ping': return send(ws, { t: 'pong' });

    case 'create':
    case 'quick': {
      if (room && pl) return send(ws, { t: 'err', msg: 'Už jsi v místnosti.' });
      const r = newRoom();
      if (!r) return send(ws, { t: 'err', msg: 'Server je plný, zkus to později.' });
      const me = addPlayer(r, { name: cleanName(msg.name), ws });
      bindJoined(ws, r, me);
      if (msg.t === 'quick') {
        r.settings.lives = clampLives(msg.lives);
        addBots(r, Math.max(1, Math.min(3, Number(msg.bots) || 2)));
        const err = startGame(r);
        if (err) send(ws, { t: 'err', msg: err });
      }
      return;
    }

    case 'join': {
      if (room && pl) return send(ws, { t: 'err', msg: 'Už jsi v místnosti.' });
      const code = String(msg.code ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      const r = rooms.get(code);
      if (!r) return send(ws, { t: 'err', code: 'noroom', msg: `Místnost ${code || '????'} neexistuje.` });
      if (r.phase !== 'lobby') return send(ws, { t: 'err', msg: 'Hra v této místnosti už běží.' });
      if (r.players.length >= MAX_PLAYERS) return send(ws, { t: 'err', msg: 'Místnost je plná.' });
      const me = addPlayer(r, { name: cleanName(msg.name), ws });
      bindJoined(ws, r, me);
      return sendLobby(r);
    }

    case 'resume': {
      const r = rooms.get(String(msg.code ?? '').toUpperCase());
      const me = r && r.players.find((p) => !p.bot && p.token && p.token === msg.token);
      if (!me) return send(ws, { t: 'err', code: 'noroom', msg: 'Místnost už neexistuje.' });
      if (me.ws && me.ws !== ws && me.ws.readyState === 1) { try { me.ws.close(4000, 'replaced'); } catch { /* nic */ } }
      bindJoined(ws, r, me, { resumed: true });
      if (r.phase === 'lobby') sendLobby(r); else { syncTo(r, me); if (r.phase === 'playing') schedule(r); }
      return;
    }
  }

  if (!room || !pl) return send(ws, { t: 'err', code: 'noroom', msg: 'Nejsi v žádné místnosti.' });
  const isHost = room.hostId === pl.id;

  switch (msg.t) {
    case 'addBot':
      if (!isHost || room.phase !== 'lobby') return;
      if (room.players.length >= MAX_PLAYERS) return send(ws, { t: 'err', msg: 'Místnost je plná.' });
      addBots(room, 1);
      return sendLobby(room);

    case 'removeBot': {
      if (!isHost || room.phase !== 'lobby') return;
      const b = room.players.find((p) => p.id === msg.id && p.bot);
      if (b) removePlayer(room, b);
      return;
    }

    case 'kick': {
      if (!isHost || room.phase !== 'lobby') return;
      const k = room.players.find((p) => p.id === msg.id && !p.bot && p.id !== pl.id);
      if (k) {
        send(k.ws, { t: 'kicked' });
        const kws = k.ws;
        removePlayer(room, k);
        if (kws) { kws.ctx = null; }
      }
      return;
    }

    case 'settings':
      if (!isHost || room.phase !== 'lobby') return;
      room.settings.lives = clampLives(msg.lives);
      return sendLobby(room);

    case 'start': {
      if (!isHost || room.phase !== 'lobby') return;
      const err = startGame(room);
      if (err) send(ws, { t: 'err', msg: err });
      return;
    }

    case 'again':
      if (!isHost || room.phase !== 'over') return;
      for (const p of [...room.players]) if (!p.bot && !p.connected) removePlayer(room, p, true);
      room.game = null; room.phase = 'lobby'; clearTimers(room);
      for (const p of room.players) p.afk = false;
      return sendLobby(room);

    case 'leave':
      leave(ws, true);
      return;

    case 'use':
    case 'shoot': {
      if (room.phase !== 'playing') return;
      if (now() < room.busyUntil - 250) return send(ws, { t: 'err', code: 'busy', msg: 'Počkej, ještě se něco děje.' });
      const res = msg.t === 'use'
        ? room.game.use(pl.id, Number(msg.card), msg.target == null ? null : String(msg.target))
        : room.game.shoot(pl.id, String(msg.target));
      if (!res.ok) return send(ws, { t: 'err', code: 'rule', msg: res.err });
      pl.afk = false;
      return afterAction(room, res.events);
    }

    default:
      return;
  }
}

function clampLives(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(2, Math.min(6, n)) : 4;
}

/** Hráč odešel (vědomě) nebo mu spadlo spojení. */
function leave(ws, voluntary) {
  const ctx = ws.ctx;
  if (!ctx) return;
  const room = rooms.get(ctx.code);
  ws.ctx = null;
  if (!room) return;
  const pl = room.players.find((p) => p.id === ctx.pid);
  if (!pl || (pl.ws && pl.ws !== ws)) return;
  pl.ws = null;
  pl.connected = false;
  if (room.hostId === pl.id && room.phase !== 'lobby') {
    const next = connectedHumans(room)[0];
    if (next) room.hostId = next.id;
  }

  if (room.phase === 'lobby') {
    if (voluntary) removePlayer(room, pl);
    else {
      pl.dropTimer = setTimeout(() => { if (!pl.connected && rooms.has(room.code)) removePlayer(room, pl); }, LOBBY_GRACE_MS);
      sendLobby(room);
    }
  } else {
    if (voluntary) pl.token = null; // už se nevrátí
    if (room.phase === 'playing') {
      const cur = room.game.cur();
      if (cur.id === pl.id) schedule(room);
      publish(room, [{ e: 'presence', p: pl.id, dur: 0, snap: room.game.snapshot() }]);
    } else sendLobby(room);
  }
  if (connectedHumans(room).length === 0) room.emptySince = now() || 1;
}

// ---------------------------------------------------------------- připojení (WebSocket obsluhuje hlavní server na cestě /komora)
const clients = new Set();

export function handleConnection(ws) {
  clients.add(ws);
  ws.isAlive = true;
  ws.ctx = null;
  ws.bucket = { n: 20, t: now() };
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    // ochrana proti zahlcení: max. ~15 zpráv za sekundu
    const t = now();
    ws.bucket.n = Math.min(20, ws.bucket.n + ((t - ws.bucket.t) / 1000) * 15);
    ws.bucket.t = t;
    if (ws.bucket.n < 1) return;
    ws.bucket.n -= 1;
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { handle(ws, msg); } catch (err) { console.error('komora: chyba obsluhy', err); }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws, false); });
  ws.on('error', () => { /* zavření se řeší v close */ });
}

// keep-alive (Render a různé proxy zavírají neaktivní spojení)
setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* nic */ }
  }
}, 25_000).unref();

// úklid prázdných místností
setInterval(() => {
  for (const room of rooms.values()) {
    if (connectedHumans(room).length === 0 && room.emptySince && now() - room.emptySince > EMPTY_ROOM_MS) destroyRoom(room);
  }
}, 15_000).unref();

export const stats = () => ({ rooms: rooms.size, clients: clients.size });
export { rooms };
