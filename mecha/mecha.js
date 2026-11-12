// MECHA ARÉNA – server: účet (coiny, karty a jejich úrovně, sestava robota, postup v kampani), obchod s bednami a online souboje po tazích.
// Souboj počítá výhradně server (sim.js); klient jen posílá akce a přehrává události. WebSocket obsluhuje hlavní server na cestě /mecha. Účty dodává init().
import crypto from 'node:crypto';
import * as H from './shared.js';
import * as S from './sim.js';
import * as B from './bot.js';
import * as C from './campaign.js';

const SC = Number(process.env.MECHA_SCALE) > 0 ? Number(process.env.MECHA_SCALE) : 1;   // jen pro testy: zrychlení hodin
const ms = (n) => Math.max(2, Math.round(n * SC));
const TURN_MS = 75_000, DROP_MS = 30_000, QUICK_WAIT_MS = 9_000, EMPTY_ROOM_MS = 120_000;
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';
const rooms = new Map();
const now = () => Date.now();
let deps = null;
export function init(d) { deps = d; }
const dirty = () => { try { deps && deps.markDirty(); } catch { /* nic */ } };
const rnd = () => crypto.randomInt(0, 1 << 30) / (1 << 30);
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));

// ------------------------------------------------------------------ účet
export function mechaOf(acc) {
  let t = acc.mecha; if (!t || typeof t !== 'object') t = acc.mecha = {};
  const fresh = !t.inv;
  t.coins = Number.isFinite(t.coins) ? clampN(t.coins, 0, 1e9) : H.START_COINS;
  const inv = {}; if (t.inv && typeof t.inv === 'object') for (const id of Object.keys(t.inv)) { if (!H.item(id)) continue; const e = t.inv[id] || {}; const n = clampN(e.n, 0, 9999); if (n > 0) inv[id] = { n, lv: clampN(e.lv, 1, H.MAX_LV) || 1 }; }
  if (fresh) for (const id of Object.keys(H.STARTER_INV)) inv[id] = { n: H.STARTER_INV[id], lv: 1 };
  t.inv = inv;
  let build = H.cleanBuild(fresh ? H.STARTER_BUILD : t.build);
  const u = {}; for (const s of H.SLOTS) { const id = build[s]; if (!id) continue; u[id] = (u[id] || 0) + 1; if (!inv[id] || u[id] > inv[id].n) { build[s] = ''; u[id] -= 1; } }   // kartu, kterou hráč nemá, ze sestavy vyhodí
  { let m = H.mechStats(build, inv); for (const s of ['drone', 'shL', 'shR', 'hdL', 'hdR', 'head', 'chest', 'lgL', 'lgR']) { if (m.weight <= m.cap) break; build[s] = ''; m = H.mechStats(build, inv); } }
  t.build = build;
  for (const k of ['wins', 'games', 'losses', 'opened']) t[k] = clampN(t[k], 0, 1e7);
  t.camp = clampN(t.camp, 0, C.MISSIONS.length); t.daily = Number.isFinite(t.daily) ? Math.max(0, Math.floor(t.daily)) : 0;
  return t;
}
function profileOf(acc, linked) {
  const t = mechaOf(acc);
  return { account: true, linked: !!linked, name: acc.name, avatar: acc.avatar, mecha: { coins: t.coins, inv: t.inv, build: t.build, camp: t.camp, wins: t.wins, games: t.games, losses: t.losses, opened: t.opened, dailyIn: Math.max(0, t.daily + H.DAILY_MS - now()) } };
}
function identify(msg) {
  if (!deps || !msg || typeof msg.token !== 'string' || !deps.TOKEN_RE.test(msg.token)) return null;
  try { return deps.resolveAccount({ token: msg.token, session: typeof msg.session === 'string' ? msg.session : undefined, name: msg.name }); } catch { return null; }
}
function addCards(t, ids) { for (const id of ids) { const e = t.inv[id] || (t.inv[id] = { n: 0, lv: 1 }); e.n = Math.min(9999, e.n + 1); } }
const usedOf = (t, id) => H.usage(t.build)[id] || 0;
/** HTTP: me, build (uložení sestavy), buy (bedna), daily (bedna zdarma), upgrade (vylepšení karty z kopií), sell (prodej přebytečných kopií). */
export function api(action, body) {
  body = body || {};
  const ident = identify(body); if (!ident) return action === 'me' ? { status: 200, json: { account: false } } : { status: 401, json: { error: 'Tohle jde jen s účtem – přihlas se.' } };
  const acc = ident.acc, t = mechaOf(acc), P = () => profileOf(acc, ident.linked);
  switch (action) {
    case 'me': return { status: 200, json: P() };
    case 'build': {
      const b = H.cleanBuild(body.build); const err = H.buildError(b, t.inv); if (err) return { status: 400, json: { error: err } };
      t.build = b; dirty(); return { status: 200, json: P() };
    }
    case 'buy': case 'daily': {
      const c = H.crate(action === 'daily' ? 'serv' : String(body.crate || '')); if (!c) return { status: 400, json: { error: 'Neznámá bedna.' } };
      if (action === 'daily') { if (now() < t.daily + H.DAILY_MS) return { status: 429, json: { error: 'Denní bedna ještě není připravená.' } }; t.daily = now(); }
      else { const n = clampN(body.n, 1, 10) || 1; const price = c.price * n; if (t.coins < price) return { status: 402, json: { error: `Chybí ti ${price - t.coins} coinů.` } }; t.coins -= price; body._n = n; }
      const n = action === 'daily' ? 1 : body._n, cards = []; for (let k = 0; k < n; k++) cards.push(...H.rollCrate(c, rnd));
      addCards(t, cards); t.opened += n; dirty(); return { status: 200, json: { ...P(), cards, crate: c.id } };
    }
    case 'upgrade': {
      const id = String(body.id || ''), it = H.item(id), e = t.inv[id]; if (!it || !e) return { status: 400, json: { error: 'Tu kartu nemáš.' } };
      if (e.lv >= H.MAX_LV) return { status: 409, json: { error: 'Karta už je na nejvyšší úrovni.' } };
      const need = H.LV_NEED[e.lv]; if (e.n - need < Math.max(1, usedOf(t, id))) return { status: 409, json: { error: `Na vylepšení potřebuješ ${need} volných kopií navíc.` } };
      e.n -= need; e.lv += 1; dirty(); return { status: 200, json: P() };
    }
    case 'sell': {
      const id = String(body.id || ''), it = H.item(id), e = t.inv[id]; if (!it || !e) return { status: 400, json: { error: 'Tu kartu nemáš.' } };
      const spare = e.n - Math.max(1, usedOf(t, id)); const k = clampN(body.k, 1, 9999) || 1; if (spare < k) return { status: 409, json: { error: 'Tolik volných kopií nemáš (jedna zůstává vždycky).' } };
      e.n -= k; t.coins = Math.min(1e9, t.coins + it.sell * k); dirty(); return { status: 200, json: P() };
    }
    default: return { status: 404, json: { error: 'Neznámá akce.' } };
  }
}

// ------------------------------------------------------------------ pomocné
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Hráč';
function makeCode() { for (let i = 0; i < 200; i++) { let c = ''; for (let j = 0; j < 4; j++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; } return null; }
function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch { /* spojení padlo */ } } }
const humans = (room) => room.players.filter((p) => !p.bot);
const toAll = (room, obj) => { const s = JSON.stringify(obj); for (const p of room.players) if (!p.bot && p.connected) send(p.ws, s); };
const invView = (build, inv) => { const o = {}; for (const id of Object.values(build)) if (id) o[id] = { lv: inv[id] ? inv[id].lv : 1 }; return o; };

function newPlayer(ws, msg, ident) {
  const t = mechaOf(ident.acc); const err = H.buildError(t.build, t.inv);
  return { id: crypto.randomBytes(4).toString('hex'), token: crypto.randomBytes(8).toString('hex'), ws, acc: ident.acc, name: cleanName(ident.acc.name || msg.name), avatar: ident.acc.avatar, build: { ...t.build }, inv: JSON.parse(JSON.stringify(t.inv)), connected: true, bot: false, left: false, err };
}
function botPlayer(name, build, inv, level) { return { id: 'b' + crypto.randomBytes(3).toString('hex'), bot: true, connected: true, name, build, inv, level, left: false }; }
function newRoom(kind) { const code = makeCode(); if (!code) return null; const r = { code, kind, phase: 'lobby', players: [], host: null, game: null, mission: -1, timer: null, dropTimer: null, rematch: new Set(), emptySince: null, seq: 0, idle: 0 }; rooms.set(code, r); return r; }
function destroy(room) { clearTimeout(room.timer); clearTimeout(room.dropTimer); clearTimeout(room.waitTimer); rooms.delete(room.code); }
const bodyView = (p) => ({ name: p.name, avatar: p.avatar || '', bot: !!p.bot, build: p.build, inv: invView(p.build, p.inv) });
const lobbyMsg = (room) => ({ t: 'room', code: room.code, kind: room.kind, phase: room.phase, host: room.host, players: room.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar || '', bot: !!p.bot, connected: p.connected, ready: true })) });
function publish(room) { toAll(room, lobbyMsg(room)); }

// ------------------------------------------------------------------ souboj
function startBattle(room) {
  const [a, b] = room.players; const mk = (p) => ({ name: p.name, stats: H.mechStats(p.build, p.inv) });
  const g = S.newBattle(mk(a), mk(b), crypto.randomInt(1, 2 ** 31), room.kind === 'camp' ? 0 : -1);
  room.game = g.st; room.phase = 'play'; room.seq = 0; room.idle = 0; room.rematch.clear();
  const theme = room.mission >= 0 ? C.MISSIONS[room.mission].theme : C.CHAPTERS[crypto.randomInt(0, C.CHAPTERS.length)].theme;
  room.theme = theme;
  const ev = g.ev.slice(); botLoop(room, ev);
  for (let i = 0; i < 2; i++) { const p = room.players[i]; if (!p.bot) send(p.ws, { t: 'start', code: room.code, you: i, mission: room.mission, theme, players: room.players.map(bodyView), ev, s: S.snap(room.game), dl: now() + ms(TURN_MS), token: p.token }); }
  if (!room.game.over) armTimer(room); else finish(room);
}
function botLoop(room, ev) {
  for (let guard = 0; guard < 6 && !room.game.over; guard++) {
    const i = room.game.turn, p = room.players[i]; if (!p.bot) return;
    for (const a of B.planTurn(room.game, i, p.level || 2, Math.random)) { const e = S.apply(room.game, i, a); if (!e) break; ev.push(...e); if (room.game.over) return; }
    ev.push(...S.apply(room.game, i, { t: 'end' }) || []);
  }
}
function armTimer(room) {
  clearTimeout(room.timer); if (room.game.over) return;
  room.timer = setTimeout(() => { if (room.phase !== 'play' || room.game.over) return; const i = room.game.turn; const p = room.players[i]; if (p.bot) return; p.idle = (p.idle || 0) + 1; if (p.idle >= 3) return forfeit(room, i); const ev = S.forceEnd(room.game); botLoop(room, ev); push(room, ev); }, ms(TURN_MS));
}
function push(room, ev) {
  room.seq += 1; toAll(room, { t: 'ev', seq: room.seq, ev, s: S.snap(room.game), dl: now() + ms(TURN_MS) });
  if (room.game.over) finish(room); else armTimer(room);
}
function onAct(room, i, a) {
  if (room.phase !== 'play' || room.game.over || room.game.turn !== i) return;
  const ev = S.apply(room.game, i, a); if (!ev) return send(room.players[i].ws, { t: 'bad' });
  room.players[i].idle = 0; botLoop(room, ev); push(room, ev);
}
function forfeit(room, i) { if (room.phase !== 'play') return; const ev = S.forfeit(room.game, i); push(room, ev); }
function finish(room) {
  if (room.phase !== 'play') return; room.phase = 'over'; clearTimeout(room.timer);
  const w = room.game.winner; const res = [];
  room.players.forEach((p, i) => {
    if (p.bot) return res.push(null);
    const t = mechaOf(p.acc), win = w === i, draw = w === 2; const out = { win, draw, coins: 0, cards: [], first: false };
    t.games += 1; if (win) t.wins += 1; else if (!draw) t.losses += 1;
    if (room.kind === 'camp') {
      const m = C.MISSIONS[room.mission];
      if (win) { if (room.mission === t.camp) { t.camp += 1; out.first = true; out.coins = m.coins; const cr = H.crate(m.crate); out.crate = cr.id; out.cards = H.rollCrate(cr, rnd); addCards(t, out.cards); } else out.coins = m.repeatCoins; } else out.coins = draw ? 10 : 15;
    } else { const vsBot = room.players.some((q) => q.bot); out.coins = win ? (vsBot ? 60 : 140) : draw ? 20 : (vsBot ? 20 : 40); }
    t.coins = Math.min(1e9, t.coins + out.coins); dirty(); out.profile = profileOf(p.acc, true).mecha; res.push(out);
  });
  room.players.forEach((p, i) => { if (!p.bot) send(p.ws, { t: 'over', winner: w, reward: res[i] }); });
  if (room.kind === 'camp' || room.kind === 'quick') room.emptySince = now();
}

// ------------------------------------------------------------------ spojení
function bind(ws, room, pl) { pl.ws = ws; pl.connected = true; ws.ctx = { code: room.code, pid: pl.id }; room.emptySince = null; if (room.dropTimer) { clearTimeout(room.dropTimer); room.dropTimer = null; } }
function leave(ws, voluntary) {
  const ctx = ws.ctx; ws.ctx = null; if (!ctx) return; const room = rooms.get(ctx.code); if (!room) return;
  const pl = room.players.find((p) => p.id === ctx.pid); if (!pl) return; pl.connected = false; const i = room.players.indexOf(pl);
  if (room.phase === 'lobby') { room.players.splice(i, 1); if (room.players.length === 0) return destroy(room); if (room.host === pl.id) room.host = room.players.find((p) => !p.bot).id; return publish(room); }
  if (room.phase === 'play') {
    if (voluntary) return forfeit(room, i);
    room.dropTimer = setTimeout(() => { room.dropTimer = null; if (!pl.connected && room.phase === 'play') forfeit(room, i); }, ms(DROP_MS)); return;
  }
  if (voluntary) { pl.left = true; if (!humans(room).some((p) => !p.left)) destroy(room); else publish(room); }
}
const ensureBuild = (ws, pl) => { if (pl.err) { send(ws, { t: 'err', fatal: true, msg: pl.err }); return false; } return true; };
function handle(ws, msg) {
  if (msg.t === 'ping') return send(ws, { t: 'pong', at: now() });
  if (['campaign', 'quick', 'create', 'join', 'train'].includes(msg.t)) {
    if (ws.ctx) return; const ident = identify(msg); if (!ident) return send(ws, { t: 'err', fatal: true, msg: 'Chybí přihlášení.' });
    let room;
    if (msg.t === 'join') {
      room = rooms.get(String(msg.code || '').toUpperCase().trim()); if (!room || room.kind !== 'room') return send(ws, { t: 'err', fatal: true, msg: 'Místnost s tímhle kódem neexistuje.' });
      if (room.phase !== 'lobby' || room.players.length >= 2) return send(ws, { t: 'err', fatal: true, msg: 'Místnost je plná nebo už hraje.' });
    } else if (msg.t === 'quick') {
      room = [...rooms.values()].find((r) => r.kind === 'quick' && r.phase === 'lobby' && r.players.length === 1 && r.players[0].connected && r.players[0].acc !== ident.acc);
      if (!room) { room = newRoom('quick'); if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Server je plný, zkus to později.' }); }
    } else {
      room = newRoom(msg.t === 'create' ? 'room' : 'camp'); if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Server je plný, zkus to později.' });
      if (msg.t === 'campaign') { const t = mechaOf(ident.acc), idx = clampN(msg.mission, 0, C.MISSIONS.length - 1); if (idx > t.camp) { destroy(room); return send(ws, { t: 'err', fatal: true, msg: 'Tuhle misi ještě nemáš odemčenou.' }); } room.mission = idx; }
    }
    const pl = newPlayer(ws, msg, ident); if (!ensureBuild(ws, pl)) { if (!room.players.length) destroy(room); return; }
    room.players.push(pl); if (!room.host) room.host = pl.id; bind(ws, room, pl); send(ws, { t: 'joined', code: room.code, token: pl.token, you: room.players.length - 1 });
    if (msg.t === 'campaign') { const m = C.MISSIONS[room.mission]; room.players.push(botPlayer(m.name, m.build, m.inv, m.level)); return startBattle(room); }
    if (msg.t === 'train') { room.mission = -1; const lv = clampN(msg.level, 1, 3) || 2; const mir = C.mirrorFor(H.power(pl.build, pl.inv), crypto.randomInt(1, 1e6)); room.players.push(botPlayer(mir.name, mir.build, mir.inv, lv)); room.kind = 'quick'; return startBattle(room); }
    if (msg.t === 'quick') {
      if (room.players.length === 2) { clearTimeout(room.waitTimer); return startBattle(room); }
      room.waitTimer = setTimeout(() => { if (room.phase === 'lobby' && room.players.length === 1) { const p0 = room.players[0]; const mir = C.mirrorFor(H.power(p0.build, p0.inv), crypto.randomInt(1, 1e6)); room.players.push(botPlayer(mir.name, mir.build, mir.inv, 2)); startBattle(room); } }, ms(QUICK_WAIT_MS));
    }
    return publish(room);
  }
  if (msg.t === 'resume') {
    if (ws.ctx) return; const room = rooms.get(String(msg.code || '').toUpperCase()); const pl = room && room.players.find((p) => p.token && p.token === msg.token);
    if (!pl) return send(ws, { t: 'err', fatal: true, gone: true, msg: 'Zápas už neexistuje.' });
    bind(ws, room, pl); publish(room);
    if (room.phase === 'play' || room.phase === 'over') send(ws, { t: 'start', code: room.code, you: room.players.indexOf(pl), mission: room.mission, theme: room.theme, players: room.players.map(bodyView), ev: [], s: S.snap(room.game), dl: now() + ms(TURN_MS), token: pl.token, resumed: 1 });
    return;
  }
  const ctx = ws.ctx; if (!ctx) return; const room = rooms.get(ctx.code); if (!room) return;
  const pl = room.players.find((p) => p.id === ctx.pid); if (!pl) return; const i = room.players.indexOf(pl);
  switch (msg.t) {
    case 'act': return onAct(room, i, msg.a && typeof msg.a === 'object' ? { t: String(msg.a.t), slot: String(msg.a.slot || ''), tgt: msg.a.tgt === 'drone' ? 'drone' : 'mech', dir: msg.a.dir === -1 ? -1 : 1, n: clampN(msg.a.n, 0, 9) } : null);
    case 'start': if (room.phase === 'lobby' && room.kind === 'room' && room.host === pl.id) { if (room.players.length < 2) { const lv = clampN(msg.level, 1, 3) || 2; const mir = C.mirrorFor(H.power(pl.build, pl.inv), crypto.randomInt(1, 1e6)); room.players.push(botPlayer(mir.name, mir.build, mir.inv, lv)); } startBattle(room); } return;
    case 'leave': return leave(ws, true);
    case 'rematch': {
      if (room.phase !== 'over' || room.kind === 'camp') return; const bot = room.players.find((p) => p.bot);
      if (bot) { for (const p of humans(room)) { const t = mechaOf(p.acc); p.build = { ...t.build }; p.inv = JSON.parse(JSON.stringify(t.inv)); const e = H.buildError(p.build, p.inv); if (e) return send(ws, { t: 'err', msg: e }); } return startBattle(room); }
      room.rematch.add(pl.id); if (humans(room).filter((p) => !p.left).every((p) => room.rematch.has(p.id) && p.connected)) { for (const p of humans(room)) { const t = mechaOf(p.acc); p.build = { ...t.build }; p.inv = JSON.parse(JSON.stringify(t.inv)); } return startBattle(room); }
      return toAll(room, { t: 'rematch', ids: [...room.rematch] });
    }
    default:
  }
}
const clients = new Set();
export function handleConnection(ws) {
  clients.add(ws); ws.isAlive = true; ws.ctx = null; ws.bucket = { n: 40, t: now() };
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    const t = now(); ws.bucket.n = Math.min(40, ws.bucket.n + ((t - ws.bucket.t) / 1000) * 10); ws.bucket.t = t; if (ws.bucket.n < 1) return; ws.bucket.n -= 1;
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; } if (!msg || typeof msg.t !== 'string') return;
    try { handle(ws, msg); } catch (e) { console.error('mecha: chyba obsluhy', e); }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws, false); }); ws.on('error', () => {});
}
setInterval(() => { for (const ws of clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* nic */ } } }, 25_000).unref();
setInterval(() => { for (const r of rooms.values()) { if (!r.players.some((p) => !p.bot && p.connected)) { if (!r.emptySince) r.emptySince = now(); else if (now() - r.emptySince > EMPTY_ROOM_MS) destroy(r); } } }, 15_000).unref();
export const stats = () => ({ rooms: rooms.size, clients: clients.size });
export { rooms, H, S, C };
