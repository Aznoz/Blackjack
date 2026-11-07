// BOMBIC – bombermanovská hra pro 2 až 4 hráče: les s pařezy a kameny, bomby, plameny, power-upy a lebky. Online (rychlá hra, kód místnosti)
// nebo proti botům; prázdná místa může doplnit bot. Zápas je první na 2 vítězná kola, v posledních 45 s kola padají kameny od okraje.
// Simulaci počítá server (sim.js, 20 tiků za sekundu) a každý tik posílá snímek; WebSocket obsluhuje hlavní server na cestě /bombic.
// Účty a ukládání dodává server přes init().
import crypto from 'node:crypto';
import * as K from './shared.js';
import * as G from './sim.js';
import { botThink, BOT_THINK, BOT_NAMES } from './bot.js';

const SC = Number(process.env.BOMBIC_SCALE) > 0 ? Number(process.env.BOMBIC_SCALE) : 1;   // jen pro testy: zrychlení hodin
const ms = (n) => Math.max(2, Math.round(n * SC));
const DROP_GRACE_MS = Number(process.env.BOMBIC_DROP_MS) || 30_000;
const AUTO_START_MS = Number(process.env.BOMBIC_AUTO_MS) || 12_000;       // rychlá hra: po této době se začne i s menším počtem lidí (nejméně 2)
const EMPTY_ROOM_MS = 120_000;
const BETWEEN_T = 60;                                                      // pauza mezi koly (tiky)
export const XP = { play: 20, win: 60, round: 10, kill: 8 };
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';

const rooms = new Map();
const now = () => Date.now();
let deps = null;
export function init(d) { deps = d; }

// ------------------------------------------------------------------ účet: postup
export function bombicOf(acc) {
  let t = acc.bombic; if (!t || typeof t !== 'object') t = acc.bombic = {};
  for (const k of ['xp', 'wins', 'games', 'kills']) t[k] = Math.max(0, Math.min(1e7, Math.floor(Number(t[k]) || 0)));
  const sk = Math.floor(Number(t.skin)); t.skin = Number.isFinite(sk) && sk >= 0 && sk < K.SKINS.length ? sk : -1;   // -1 = automaticky podle místa u stolu
  return t;
}
const dirty = () => { try { deps && deps.markDirty(); } catch { /* nic */ } };
function profileOf(acc, linked) {
  const t = bombicOf(acc); const lvl = K.levelOf(t.xp);
  return { account: true, linked: !!linked, name: acc.name, avatar: acc.avatar, bombic: { xp: t.xp, lvl, from: K.xpFor(lvl), next: lvl >= K.MAX_LEVEL ? null : K.xpFor(lvl + 1), wins: t.wins, games: t.games, kills: t.kills, skin: t.skin }, xpRules: XP };
}
function identify(msg) {
  if (!deps || !msg || typeof msg.token !== 'string' || !deps.TOKEN_RE.test(msg.token)) return null;
  try { return deps.resolveAccount({ token: msg.token, session: typeof msg.session === 'string' ? msg.session : undefined, name: msg.name }); } catch { return null; }
}
/** HTTP: me (profil pro menu). */
export function api(action, body) {
  if (action === 'me') { const ident = identify(body || {}); return { status: 200, json: ident ? profileOf(ident.acc, ident.linked) : { account: false, xpRules: XP } }; }
  if (action === 'skin') {   // výběr skinu: jen odemčený (podle úrovně), -1 = automaticky
    const ident = identify(body || {}); if (!ident) return { status: 401, json: { error: 'Pro skiny se musíš přihlásit.' } };
    const t = bombicOf(ident.acc); const want = Math.floor(Number(body.skin));
    if (!Number.isFinite(want) || want < -1 || want >= K.SKINS.length) return { status: 400, json: { error: 'Neznámý skin.' } };
    if (want >= 0 && K.SKINS[want].lvl > K.levelOf(t.xp)) return { status: 403, json: { error: `Tenhle skin se odemkne na úrovni ${K.SKINS[want].lvl}.` } };
    t.skin = want; dirty(); return { status: 200, json: profileOf(ident.acc, ident.linked) };
  }
  return { status: 404, json: { error: 'Neznámá akce.' } };
}

// ------------------------------------------------------------------ pomocné
function cleanName(s) { const t = String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14); return t || 'Hráč'; }
function makeCode() { for (let i = 0; i < 200; i++) { let c = ''; for (let j = 0; j < 4; j++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; } return null; }
function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch { /* spojení padlo */ } } }
const humans = (room) => room.players.filter((p) => !p.bot);
const live = (room) => room.players.filter((p) => p.connected && !p.bot);

// ------------------------------------------------------------------ stav pro klienty
function playerView(p, room) {
  const t = p.acc ? bombicOf(p.acc) : null;
  return { name: p.name, avatar: p.acc ? p.acc.avatar : null, bot: p.bot || 0, connected: p.connected, lvl: t ? K.levelOf(t.xp) : 1, skin: p.skin >= 0 ? p.skin : 0, left: !!p.left, wins: room.wins[room.players.indexOf(p)] || 0 };
}
function view(room, pid) {
  const you = room.players.findIndex((p) => p.id === pid);
  return {
    t: 'state', code: room.code, phase: room.phase, you, host: room.players.findIndex((p) => p.id === room.host), quick: !!room.quick, solo: !!room.solo,
    players: room.players.map((p) => playerView(p, room)), round: room.round, round_result: room.roundResult, result: room.result,
    rematch: room.players.map((p) => p.bot || room.rematch.has(p.id)), matchId: room.matchId, need: K.WINS_NEEDED, map: room.map,
    auto: room.quick && room.autoAt ? Math.max(0, Math.round((room.autoAt - now()) / 1000)) : null,
    drop: room.dropFor ? { idx: room.players.findIndex((p) => p.id === room.dropFor), left: Math.max(0, Math.round((room.dropAt - now()) / 1000)) } : null,
  };
}
/** Přidělí každému jiný skin: nejdřív vybrané (a odemčené) podle pořadí u stolu, ostatním zbylé základní a pak libovolné volné. */
function assignSkins(room) {
  const used = new Set(); const want = room.players.map((p) => { if (!p.acc) return -1; const t = bombicOf(p.acc); return t.skin >= 0 && K.SKINS[t.skin].lvl <= K.levelOf(t.xp) ? t.skin : -1; });
  room.players.forEach((p, i) => { p.skin = -1; if (want[i] >= 0 && !used.has(want[i])) { p.skin = want[i]; used.add(want[i]); } });
  room.players.forEach((p) => { if (p.skin >= 0) return; let k = 0; while (used.has(k)) k++; p.skin = k; used.add(k); });
}
function publish(room) {
  if (room.phase === 'lobby') assignSkins(room);
  for (const p of room.players) if (p.ws) send(p.ws, view(room, p.id)); }
function sendSnaps(room) {
  const g = room.game; if (!g) return;
  const withGrid = g.gridVer !== room.sentVer; room.sentVer = g.gridVer;
  const json = JSON.stringify(G.snap(g, withGrid)); room.lastSnapGrid = G.gridStr(g);
  for (const p of room.players) if (p.ws && !p.bot && p.ws.bufferedAmount < 200_000) send(p.ws, json);
  G.clearEvents(g);
}
function fullSnap(room) { const g = room.game; if (!g) return null; return G.snap(g, true); }

// ------------------------------------------------------------------ průběh zápasu
function startRound(room) {
  room.round++; room.roundResult = null;
  room.game = G.newRound(room.players.map((p) => p.name), crypto.randomInt(1, 2 ** 31), { map: room.map });
  room.sentVer = 0; room.phase = 'play'; room.lastActive = now();
  room.thinkAt = room.players.map((p, i) => (p.bot ? 30 + i * 3 : 0));
  for (const p of room.players) if (p.left) G.forfeit(room.game, room.players.indexOf(p));
  publish(room); sendSnaps(room);
}
function startMatch(room) {
  assignSkins(room);
  room.wins = room.players.map(() => 0); room.round = 0; room.result = null; room.rematch = new Set(); room.matchId = (room.matchId || 0) + 1; room.autoAt = null;
  room.kills = room.players.map(() => 0); room.roundsPlayed = 0;
  for (const p of room.players) { p.left = false; }
  startRound(room);
}
function roundEnd(room) {
  const g = room.game; const w = g.over.winner; room.roundsPlayed++;
  g.pl.forEach((p, i) => { room.kills[i] += p.kills; });
  if (w >= 0) room.wins[w]++;
  room.roundResult = { n: room.round, winner: w, reason: g.over.reason, wins: [...room.wins] };
  const top = Math.max(...room.wins); const lead = room.wins.filter((x) => x === top).length;
  const done = top >= K.WINS_NEEDED || room.round >= K.MAX_ROUNDS || humans(room).every((p) => p.left);
  if (done) return finish(room, top > 0 && lead === 1 ? room.wins.indexOf(top) : -1);
  room.phase = 'between'; room.pause = BETWEEN_T; publish(room);
}
function finish(room, winner) {
  if (room.phase === 'over') return;
  room.phase = 'over';
  const out = { winner, wins: [...room.wins], rounds: room.round, kills: [...room.kills], xp: {} };
  room.players.forEach((p, i) => {
    if (p.bot || !p.acc || p.left) return;
    const t = bombicOf(p.acc); const won = winner === i;
    const gain = XP.play + (won ? XP.win : 0) + room.wins[i] * XP.round + Math.min(10, room.kills[i]) * XP.kill;
    const lvl0 = K.levelOf(t.xp); t.xp += gain; t.games++; t.kills += room.kills[i]; if (won) t.wins++; p.acc.lastSeen = now();
    out.xp[i] = { gain, lvl: K.levelOf(t.xp), up: K.levelOf(t.xp) > lvl0 };
  });
  dirty(); room.result = out; publish(room);
}

function tickRoom(room) {
  if (room.phase === 'lobby') { if (room.quick && room.autoAt && now() >= room.autoAt && room.players.length >= 2) { fillAndStart(room, 0, 0); } return; }
  if (room.phase === 'between') { if (--room.pause <= 0) startRound(room); return; }
  const g = room.game; if (!g || room.phase !== 'play') return;
  room.players.forEach((p, i) => { if (p.bot && g.tick >= room.thinkAt[i]) { room.thinkAt[i] = g.tick + BOT_THINK[p.bot]; const a = botThink(g, i, p.bot); G.setInput(g, i, a.d); if (a.bomb) G.wantBomb(g, i); } });
  G.step(g); sendSnaps(room);
  if (g.over) roundEnd(room);
}
let ticker = null;
export function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => { for (const r of rooms.values()) { try { tickRoom(r); } catch (e) { console.error('bombic: chyba ticku', e); } } }, ms(K.DT * 1000));
  ticker.unref();
}
startTicker();
/** Jen pro testy: posune místnost o n tiků hned (bez čekání). */
export function advance(room, n) { for (let i = 0; i < n && (room.phase === 'play' || room.phase === 'between'); i++) tickRoom(room); }

// ------------------------------------------------------------------ místnosti a spojení
function newRoom() {
  const code = makeCode(); if (!code) return null;
  const room = { code, players: [], nextId: 1, host: null, phase: 'lobby', quick: false, solo: false, game: null, result: null, roundResult: null, round: 0, wins: [], kills: [], rematch: new Set(), map: 0, emptySince: now(), matchId: 0, dropTimer: null, dropAt: null, dropFor: null, thinkAt: [], autoAt: null, pause: 0, sentVer: 0, roundsPlayed: 0 };
  rooms.set(code, room); return room;
}
function addPlayer(room, ws, msg) {
  const ident = identify(msg);
  if (ident && room.players.some((p) => p.acc === ident.acc)) return { err: 'Tenhle účet už v místnosti hraje.' };
  const base = ident && ident.linked ? ident.acc.name : (String(msg.name ?? '').trim() ? msg.name : ident ? ident.acc.name : msg.name);
  let n = cleanName(base); let k = 2;
  while (room.players.some((p) => p.name === n)) n = `${cleanName(base).slice(0, 11)} ${k++}`;
  const pl = { id: 'p' + room.nextId++, name: n, token: crypto.randomBytes(12).toString('hex'), ws, connected: true, acc: ident ? ident.acc : null, bot: 0, left: false };
  room.players.push(pl); if (!room.host) room.host = pl.id; bind(ws, room, pl); return { pl };
}
function addBots(room, count, level) {
  for (let k = 0; k < count && room.players.length < 4; k++) {
    let n = BOT_NAMES[level]; let j = 2; while (room.players.some((p) => p.name === n)) n = `${BOT_NAMES[level]} ${j++}`;
    room.players.push({ id: 'bot' + room.nextId++, name: n, token: null, ws: null, connected: true, acc: null, bot: level, left: false });
  }
}
function bind(ws, room, pl) {
  if (pl.ws && pl.ws !== ws) { pl.ws.ctx = null; try { pl.ws.close(4000, 'Přihlášení z jiného okna'); } catch { /* nic */ } }
  pl.ws = ws; pl.connected = true; ws.ctx = { code: room.code, pid: pl.id };
  if (room.dropFor === pl.id) { clearTimeout(room.dropTimer); room.dropTimer = null; room.dropAt = null; room.dropFor = null; }
  room.emptySince = null;
  send(ws, { t: 'joined', code: room.code, you: room.players.indexOf(pl), token: pl.token });
}
function destroy(room) { room.matchId++; room.phase = 'dead'; if (room.dropTimer) clearTimeout(room.dropTimer); rooms.delete(room.code); }
/** Hráč opustil rozehraný zápas: jeho postava hned zanikne a zápas pokračuje bez něj. */
function forfeit(room, pl) {
  pl.left = true; pl.ws = null; pl.connected = false; pl.token = null;
  if (room.game && room.phase === 'play') G.forfeit(room.game, room.players.indexOf(pl));
  if (humans(room).every((p) => p.left)) return destroy(room);
  publish(room);
}

function leave(ws, voluntary) {
  const ctx = ws.ctx; if (!ctx) return; ws.ctx = null;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = room.players.find((p) => p.id === ctx.pid);
  if (!pl || (pl.ws && pl.ws !== ws)) return;
  pl.ws = null; pl.connected = false;
  if (room.phase === 'lobby') {
    room.players = room.players.filter((p) => p !== pl); const hs = humans(room);
    if (!hs.length) return destroy(room);
    if (room.host === pl.id) room.host = hs[0].id;
    if (room.players.filter((p) => !p.bot).length < 2) room.autoAt = null;
    return publish(room);
  }
  if (room.phase === 'play' || room.phase === 'between') {
    if (room.solo && voluntary) return destroy(room);
    if (voluntary) return forfeit(room, pl);
    if (!room.dropTimer && !room.solo) {   // odpojení: krátká doba na návrat, postava mezitím stojí
      if (room.game && room.phase === 'play') G.setInput(room.game, room.players.indexOf(pl), 0);
      room.dropFor = pl.id; room.dropAt = now() + DROP_GRACE_MS;
      room.dropTimer = setTimeout(() => { room.dropTimer = null; room.dropAt = null; room.dropFor = null; if (!pl.connected && !pl.left) forfeit(room, pl); }, DROP_GRACE_MS);
      publish(room);
    } else if (room.solo) { room.emptySince = now(); }
  } else { // over
    if (room.solo) { if (voluntary) destroy(room); return; }
    if (voluntary) { pl.token = null; pl.left = true; room.rematch.delete(pl.id); if (!humans(room).some((p) => !p.left)) return destroy(room); publish(room); }
  }
  if (live(room).length === 0) room.emptySince = now();
}
function fillAndStart(room, fill, level, map) {
  if (map !== undefined) room.map = K.mapIdx(map);
  if (fill) addBots(room, 4 - room.players.length, level || 2);
  if (room.players.length < 2) return false;
  startMatch(room); return true;
}

function handle(ws, msg) {
  if (msg.t === 'ping') return send(ws, { t: 'pong' });
  if (msg.t === 'create' || msg.t === 'join' || msg.t === 'quick' || msg.t === 'bot') {
    if (ws.ctx) return;
    let room;
    if (msg.t === 'join') {
      room = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Místnost s tímhle kódem neexistuje.' });
      if (room.phase !== 'lobby' || room.players.length >= 4) return send(ws, { t: 'err', fatal: true, msg: 'Místnost je plná nebo už hraje.' });
    } else if (msg.t === 'quick') {
      const ident = identify(msg);
      room = [...rooms.values()].find((r) => r.quick && r.phase === 'lobby' && r.players.length < 4 && live(r).length === r.players.length && !(ident && r.players.some((p) => p.acc === ident.acc)));
      if (!room) { room = newRoom(); if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Server je plný, zkus to později.' }); room.quick = true; room.map = crypto.randomInt(0, K.MAPS.length); }
    } else {
      room = newRoom(); if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Server je plný, zkus to později.' });
      room.map = K.mapIdx(msg.map);
    }
    const r = addPlayer(room, ws, msg);
    if (r.err) { if (room.players.length === 0) destroy(room); return send(ws, { t: 'err', fatal: true, msg: r.err }); }
    if (msg.t === 'bot') {
      const level = K.clamp(Math.floor(Number(msg.level)) || 2, 1, 3), n = K.clamp(Math.floor(Number(msg.n)) || 1, 1, 3);
      room.solo = true; addBots(room, n, level);
      send(ws, { t: 'joined', code: room.code, you: room.players.indexOf(r.pl), token: r.pl.token });
      return startMatch(room);
    }
    if (room.quick) { if (room.players.length >= 4) return startMatch(room); if (room.players.length >= 2 && !room.autoAt) room.autoAt = now() + AUTO_START_MS; }
    return publish(room);
  }
  if (msg.t === 'resume') {
    if (ws.ctx) return;
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const pl = room && room.players.find((p) => p.token && p.token === msg.token);
    if (!pl) return send(ws, { t: 'err', fatal: true, gone: true, msg: 'Zápas už neexistuje.' });
    bind(ws, room, pl); publish(room); const fs = (room.phase === 'play' || room.phase === 'between') ? fullSnap(room) : null; if (fs) send(ws, fs); return;
  }
  const ctx = ws.ctx; if (!ctx) return;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = room.players.find((p) => p.id === ctx.pid); if (!pl) return;
  const i = room.players.indexOf(pl);
  switch (msg.t) {
    case 'in': if (room.phase === 'play' && room.game) { G.setInput(room.game, i, Math.floor(Number(msg.d))); room.lastActive = now(); } return;
    case 'bomb': if (room.phase === 'play' && room.game) { G.wantBomb(room.game, i); room.lastActive = now(); } return;
    case 'map': if (room.phase === 'lobby' && room.host === pl.id && !room.quick) { room.map = K.mapIdx(msg.map); publish(room); } return;
    case 'start': {   // jen zakladatel: začít (nejméně 2 hráči), případně doplnit boty do 4
      if (room.phase !== 'lobby' || room.host !== pl.id) return;
      const level = K.clamp(Math.floor(Number(msg.level)) || 2, 1, 3);
      if (!fillAndStart(room, !!msg.fill, level, msg.map)) send(ws, { t: 'err', msg: 'Na hru jsou potřeba aspoň dva hráči (nebo zapni doplnění boty).' });
      return;
    }
    case 'leave': return leave(ws, true);
    case 'rematch': {
      if (room.phase !== 'over') return;
      if (room.solo) return startMatch(room);
      room.rematch.add(pl.id);
      if (humans(room).filter((p) => !p.left).every((p) => room.rematch.has(p.id) && p.connected)) { room.players = room.players.filter((p) => p.bot || !p.left); if (room.players.length < 2) return; if (!room.players.some((p) => p.id === room.host)) room.host = humans(room)[0].id; return startMatch(room); }
      return publish(room);
    }
    default:
  }
}

const clients = new Set();
export function handleConnection(ws) {
  clients.add(ws); ws.isAlive = true; ws.ctx = null; ws.bucket = { n: 60, t: now() };
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    const t = now(); ws.bucket.n = Math.min(60, ws.bucket.n + ((t - ws.bucket.t) / 1000) * 30); ws.bucket.t = t;
    if (ws.bucket.n < 1) return; ws.bucket.n -= 1;
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { handle(ws, msg); } catch (e) { console.error('bombic: chyba obsluhy', e); }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws, false); });
  ws.on('error', () => {});
}
setInterval(() => { for (const ws of clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* nic */ } } }, 25_000).unref();
setInterval(() => { for (const r of rooms.values()) if (live(r).length === 0 && r.emptySince && now() - r.emptySince > EMPTY_ROOM_MS) destroy(r); }, 15_000).unref();
setInterval(() => { for (const r of rooms.values()) if (r.phase === 'lobby') publish(r); }, 1000).unref();   // odpočet automatického startu

export const stats = () => ({ rooms: rooms.size, clients: clients.size });
export { rooms, K, G };
