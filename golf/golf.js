// MINIGOLF – 3D minigolf pro 2 až 4 hráče: všichni hrají naráz (bez střídání tahů), každý šťouchá do svého míčku, aby ho dostal do jamky na co nejméně ran.
// Online (rychlá hra, kód místnosti) nebo proti botům. Průběh zápasu počítá server (sim.js), míček člověka počítá jeho prohlížeč (stejná fyzika z phys.js)
// a server ho přijímá jako hlášení; boti běží přímo na serveru. WebSocket obsluhuje hlavní server na cestě /golf. Účty dodává init().
import crypto from 'node:crypto';
import * as K from './shared.js';
import * as C from './courses.js';
import * as G from './sim.js';
import * as B from './bot.js';

const SC = Number(process.env.GOLF_SCALE) > 0 ? Number(process.env.GOLF_SCALE) : 1;   // jen pro testy: zrychlení hodin
const ms = (n) => Math.max(2, Math.round(n * SC));
const DROP_GRACE_MS = Number(process.env.GOLF_DROP_MS) || 30_000;
const AUTO_START_MS = Number(process.env.GOLF_AUTO_MS) || 12_000;       // rychlá hra: po této době se začne i s menším počtem lidí (nejméně 2)
const EMPTY_ROOM_MS = 120_000;
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';
const rooms = new Map();
const now = () => Date.now();
let deps = null;
export function init(d) { deps = d; }
const dirty = () => { try { deps && deps.markDirty(); } catch { /* nic */ } };

// ------------------------------------------------------------------ účet
export function golfOf(acc) {
  let t = acc.golf; if (!t || typeof t !== 'object') t = acc.golf = {};
  for (const k of ['wins', 'games', 'aces', 'holes']) t[k] = Math.max(0, Math.min(1e7, Math.floor(Number(t[k]) || 0)));
  t.color = K.colorIdx(t.color);   // -1 = ještě nevybráno
  t.coins = Number.isFinite(t.coins) ? Math.max(0, Math.min(1e9, Math.floor(t.coins))) : K.START_COINS;
  const own = new Set(); if (Array.isArray(t.own)) for (const k of t.own) { if (typeof k !== 'string') continue; const [c, id] = k.split(':'); if (K.shopItem(c, id)) own.add(c + ':' + id); }
  t.own = [...own]; t.eq = K.cleanEq(t.eq, own);
  return t;
}
function profileOf(acc, linked) { const t = golfOf(acc); return { account: true, linked: !!linked, name: acc.name, avatar: acc.avatar, golf: { color: t.color, wins: t.wins, games: t.games, aces: t.aces, holes: t.holes, coins: t.coins, own: t.own, eq: t.eq }, coinRules: K.COINS }; }
function identify(msg) {
  if (!deps || !msg || typeof msg.token !== 'string' || !deps.TOKEN_RE.test(msg.token)) return null;
  try { return deps.resolveAccount({ token: msg.token, session: typeof msg.session === 'string' ? msg.session : undefined, name: msg.name }); } catch { return null; }
}
/** HTTP: me (profil pro menu), color (uložení barvy míčku). */
export function api(action, body) {
  if (action === 'me') { const ident = identify(body || {}); return { status: 200, json: ident ? profileOf(ident.acc, ident.linked) : { account: false } }; }
  if (action === 'color') {
    const ident = identify(body || {}); if (!ident) return { status: 401, json: { error: 'Pro uložení barvy se musíš přihlásit.' } };
    const c = K.colorIdx(body.color); if (c < 0) return { status: 400, json: { error: 'Neznámá barva.' } };
    golfOf(ident.acc).color = c; dirty(); return { status: 200, json: profileOf(ident.acc, ident.linked) };
  }
  if (action === 'buy' || action === 'equip') {   // obchod: koupě za coiny / výběr (prázdné id = základ zdarma)
    const ident = identify(body || {}); if (!ident) return { status: 401, json: { error: 'Do obchodu se musíš přihlásit.' } };
    const t = golfOf(ident.acc); const cat = String(body.cat ?? ''); const id = String(body.id ?? '');
    if (!K.SHOP_CATS.includes(cat)) return { status: 400, json: { error: 'Neznámá kategorie.' } };
    if (action === 'equip') {
      if (id !== '' && !(K.shopItem(cat, id) && t.own.includes(cat + ':' + id))) return { status: 403, json: { error: 'Tuhle věc ještě nemáš.' } };
      t.eq[cat] = id; dirty(); return { status: 200, json: profileOf(ident.acc, ident.linked) };
    }
    const it = K.shopItem(cat, id); if (!it) return { status: 400, json: { error: 'Neznámá věc.' } };
    if (t.own.includes(cat + ':' + id)) return { status: 409, json: { error: 'Tuhle věc už máš.' } };
    if (t.coins < it.price) return { status: 402, json: { error: `Chybí ti ${it.price - t.coins} coinů.` } };
    t.coins -= it.price; t.own.push(cat + ':' + id); t.eq[cat] = id; dirty(); return { status: 200, json: profileOf(ident.acc, ident.linked) };
  }
  return { status: 404, json: { error: 'Neznámá akce.' } };
}

// ------------------------------------------------------------------ pomocné
function cleanName(s) { const t = String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14); return t || 'Hráč'; }
function makeCode() { for (let i = 0; i < 200; i++) { let c = ''; for (let j = 0; j < 4; j++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; } return null; }
function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch { /* spojení padlo */ } } }
const humans = (room) => room.players.filter((p) => !p.bot);
const live = (room) => room.players.filter((p) => p.connected && !p.bot);
function freeColor(room, want, except) {
  const used = new Set(room.players.filter((p) => !p.left && p !== except).map((p) => p.color));
  if (want >= 0 && !used.has(want)) return want;
  const free = K.COLORS.map((_, i) => i).filter((i) => !used.has(i)); return free.length ? free[Math.floor(Math.random() * free.length)] : 0;
}

// ------------------------------------------------------------------ stav pro klienty
/** Veřejná výbava hráče (skin míčku a efekt výhry): z účtu, boti dostanou náhodnou. Při zápase je zamčená, aby se mezi jamkami nic neměnilo. */
function eqOf(p) {
  if (p.bot) return p.eq || (p.eq = { skin: Math.random() < 0.6 ? K.SKINS[Math.floor(Math.random() * K.SKINS.length)].id : '', fx: Math.random() < 0.5 ? K.WINFX[Math.floor(Math.random() * K.WINFX.length)].id : '' });
  return p.acc ? K.pubEq(golfOf(p.acc).eq) : { skin: '', fx: '' };
}
function playerView(p, room) {
  const t = p.acc ? golfOf(p.acc) : null; const eq = p.eqLock && room.phase !== 'lobby' ? p.eqLock : eqOf(p);
  return { name: p.name, avatar: p.acc ? p.acc.avatar : null, bot: p.bot || 0, connected: p.connected, color: p.color, left: !!p.left, wins: t ? t.wins : 0, games: t ? t.games : 0, sk: eq.skin, fx: eq.fx };
}
function view(room, pid) {
  return {
    t: 'state', code: room.code, phase: room.phase, you: room.players.findIndex((p) => p.id === pid), host: room.players.findIndex((p) => p.id === room.host), quick: !!room.quick, solo: !!room.solo,
    course: room.course, cfg: room.cfg, players: room.players.map((p) => playerView(p, room)), result: room.result, rematch: room.players.map((p) => p.bot || room.rematch.has(p.id)), matchId: room.matchId,
    auto: room.quick && room.autoAt ? Math.max(0, Math.round((room.autoAt - now()) / 1000)) : null,
    drop: room.dropFor ? { idx: room.players.findIndex((p) => p.id === room.dropFor), left: Math.max(0, Math.round((room.dropAt - now()) / 1000)) } : null,
  };
}
function publish(room) { for (const p of room.players) if (p.ws) send(p.ws, view(room, p.id)); }
/** Úplný stav hry: jamka, fáze, výsledky; posílá se při každé změně fáze. `el` = ms od začátku hry na jamce (záporné během úvodu). */
function gameMsg(room) {
  const g = room.game; if (!g) return null;
  const el = g.phase === 'intro' ? -Math.round((K.INTRO_S - g.t) * 1000) : g.phase === 'play' ? Math.round(g.pt * 1000) : 0;
  return {
    t: 'game', ph: g.phase, hole: g.hole, of: g.holes.length, c: g.holes[g.hole][0], k: g.holes[g.hole][1], par: g.par, cap: g.cap, lim: g.cfg.time, el, at: now(),
    totals: g.players.map((p) => p.total), rows: g.players.map((p) => p.rows.slice()), left: g.players.map((p) => !!p.left), res: g.phase === 'score' || g.phase === 'over' ? g.res || null : null, over: g.over,
    seed: g.seed, snap: g.phase === 'play' ? G.snap(g) : null,
  };
}
function broadcast(room, obj) { const json = typeof obj === 'string' ? obj : JSON.stringify(obj); for (const p of room.players) if (p.ws && !p.bot && p.ws.bufferedAmount < 400_000) send(p.ws, json); }

// ------------------------------------------------------------------ průběh zápasu
function startMatch(room) {
  for (const p of room.players) { p.left = false; p.eqLock = { ...eqOf(p) }; }   // výbava se na začátku zápasu zamkne (změny v obchodě platí od dalšího zápasu)
  room.game = G.newGame(room.players.map((p) => ({ name: p.name, color: p.color, bot: p.bot })), crypto.randomInt(1, 2 ** 31), room.course, room.cfg);
  room.result = null; room.rematch = new Set(); room.matchId = (room.matchId || 0) + 1; room.autoAt = null; room.phase = 'play'; room.lastActive = now(); room.tickN = 0;
  for (const p of room.players) if (p.left) G.forfeit(room.game, room.players.indexOf(p));
  publish(room); const m = gameMsg(room); if (m) broadcast(room, m); G.clearEvents(room.game);
}
function finish(room) {
  if (room.phase === 'over') return;
  const g = room.game; room.phase = 'over';
  const winners = g.over ? g.over.winners : [];
  room.result = { winners, totals: g.players.map((p) => p.total), rows: g.players.map((p) => p.rows.slice()), pars: g.history.map((h) => h.par), coins: {} };
  room.players.forEach((p, i) => {
    if (p.bot || !p.acc || p.left) return;
    const gp = g.players[i]; const t = golfOf(p.acc); t.games++; t.holes += gp.fins; t.aces += gp.aces; const win = winners.includes(i) && winners.length < g.players.length; if (win) t.wins++; p.acc.lastSeen = now();
    const cg = K.COINS.play + (win ? K.COINS.win : 0) + gp.aces * K.COINS.ace + gp.fins * K.COINS.hole; t.coins = Math.min(1e9, t.coins + cg);
    room.result.coins[i] = { gain: cg, total: t.coins };
  });
  dirty(); publish(room);
}
function flush(room) {
  const g = room.game; const ev = g.ev; room.tickN++;
  if (ev.some((e) => e[0] === 'ph')) { const m = gameMsg(room); if (m) broadcast(room, m); }
  const rest = ev.filter((e) => e[0] !== 'ph');
  let msg = null;
  if (g.phase === 'play' && room.tickN % 3 === 0) { msg = G.snap(g); msg.t = 'tk'; }
  if (rest.length) { if (!msg) { msg = G.snap(g); msg.t = 'tk'; } msg.ev = rest; }
  if (msg) broadcast(room, msg);
  G.clearEvents(g);
}
function tickRoom(room) {
  if (room.phase === 'lobby') { if (room.quick && room.autoAt && now() >= room.autoAt && room.players.length >= 2) fillAndStart(room, 0, 0); return; }
  const g = room.game; if (!g || room.phase !== 'play') return;
  G.tick(g); flush(room);
  if (g.phase === 'over') finish(room);
}
let ticker = null;
export function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => { for (const r of rooms.values()) { try { tickRoom(r); } catch (e) { console.error('golf: chyba ticku', e); } } }, ms(G.TICK * 1000));
  ticker.unref();
}
startTicker();
/** Jen pro testy: posune místnost o n tiků hned (bez čekání). */
export function advance(room, n) { for (let i = 0; i < n && room.phase === 'play'; i++) tickRoom(room); }

// ------------------------------------------------------------------ místnosti a spojení
function newRoom() {
  const code = makeCode(); if (!code) return null;
  const room = { code, players: [], nextId: 1, host: null, phase: 'lobby', quick: false, solo: false, game: null, result: null, rematch: new Set(), course: 0, cfg: K.cleanCfg(null), emptySince: now(), matchId: 0, dropTimer: null, dropAt: null, dropFor: null, autoAt: null, tickN: 0 };
  rooms.set(code, room); return room;
}
function addPlayer(room, ws, msg) {
  const ident = identify(msg);
  if (ident && room.players.some((p) => p.acc === ident.acc)) return { err: 'Tenhle účet už v místnosti hraje.' };
  const base = ident && ident.linked ? ident.acc.name : (String(msg.name ?? '').trim() ? msg.name : ident ? ident.acc.name : msg.name);
  let n = cleanName(base); let k = 2;
  while (room.players.some((p) => p.name === n)) n = `${cleanName(base).slice(0, 11)} ${k++}`;
  let want = K.colorIdx(msg.color); if (want < 0 && ident) want = golfOf(ident.acc).color;
  const pl = { id: 'p' + room.nextId++, name: n, token: crypto.randomBytes(12).toString('hex'), ws, connected: true, acc: ident ? ident.acc : null, bot: 0, left: false, color: -1 };
  pl.color = freeColor(room, want, pl);
  room.players.push(pl); if (!room.host) room.host = pl.id; bind(ws, room, pl); return { pl };
}
function addBots(room, count, level) {
  for (let k = 0; k < count && room.players.length < K.MAX_PLAYERS; k++) {
    let n = B.BOT_NAMES[level]; let j = 2; while (room.players.some((p) => p.name === n)) n = `${B.BOT_NAMES[level]} ${j++}`;
    const pl = { id: 'bot' + room.nextId++, name: n, token: null, ws: null, connected: true, acc: null, bot: level, left: false, color: -1 }; pl.color = freeColor(room, -1, pl); room.players.push(pl);
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
/** Hráč opustil rozehraný zápas: jeho míček zmizí a zápas pokračuje bez něj. */
function forfeit(room, pl) {
  pl.left = true; pl.ws = null; pl.connected = false; pl.token = null;
  if (room.game && room.phase === 'play') { G.forfeit(room.game, room.players.indexOf(pl)); flush(room); }
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
  if (room.phase === 'play') {
    if (room.solo && voluntary) return destroy(room);
    if (voluntary) return forfeit(room, pl);
    if (!room.dropTimer && !room.solo) {   // odpojení: krátká doba na návrat, míček mezitím stojí
      room.dropFor = pl.id; room.dropAt = now() + DROP_GRACE_MS;
      room.dropTimer = setTimeout(() => { room.dropTimer = null; room.dropAt = null; room.dropFor = null; if (!pl.connected && !pl.left) forfeit(room, pl); }, DROP_GRACE_MS);
      publish(room);
    } else if (room.solo) room.emptySince = now();
  } else { // over
    if (room.solo) { if (voluntary) destroy(room); return; }
    if (voluntary) { pl.token = null; pl.left = true; room.rematch.delete(pl.id); if (!humans(room).some((p) => !p.left)) return destroy(room); publish(room); }
  }
  if (live(room).length === 0) room.emptySince = now();
}
function fillAndStart(room, fill, level, course) {
  if (course !== undefined) room.course = C.courseIdx(course);
  if (fill) addBots(room, K.MAX_PLAYERS - room.players.length, level || 2);
  if (room.players.length < 2) return false;
  startMatch(room); return true;
}

function handle(ws, msg) {
  if (msg.t === 'ping') return send(ws, { t: 'pong', at: now() });
  if (msg.t === 'create' || msg.t === 'join' || msg.t === 'quick' || msg.t === 'bot') {
    if (ws.ctx) return;
    let room;
    if (msg.t === 'join') {
      room = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Místnost s tímhle kódem neexistuje.' });
      if (room.phase !== 'lobby' || room.players.length >= K.MAX_PLAYERS) return send(ws, { t: 'err', fatal: true, msg: 'Místnost je plná nebo už hraje.' });
    } else if (msg.t === 'quick') {
      const ident = identify(msg);
      room = [...rooms.values()].find((r) => r.quick && r.phase === 'lobby' && r.players.length < K.MAX_PLAYERS && live(r).length === r.players.length && !(ident && r.players.some((p) => p.acc === ident.acc)));
      if (!room) { room = newRoom(); if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Server je plný, zkus to později.' }); room.quick = true; room.course = crypto.randomInt(0, C.COURSES.length + 1); }
    } else {
      room = newRoom(); if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Server je plný, zkus to později.' });
      room.course = C.courseIdx(msg.course);
    }
    const r = addPlayer(room, ws, msg);
    if (r.err) { if (room.players.length === 0) destroy(room); return send(ws, { t: 'err', fatal: true, msg: r.err }); }
    if (msg.t === 'bot') {
      const level = K.clamp(Math.floor(Number(msg.level)) || 2, 1, 3), n = K.clamp(Math.floor(Number(msg.n)) || 1, 1, 3);
      room.solo = true; room.cfg = K.cleanCfg(msg.cfg); addBots(room, n, level);
      return startMatch(room);
    }
    if (room.quick) { if (room.players.length >= K.MAX_PLAYERS) return startMatch(room); if (room.players.length >= 2 && !room.autoAt) room.autoAt = now() + AUTO_START_MS; }
    return publish(room);
  }
  if (msg.t === 'resume') {
    if (ws.ctx) return;
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const pl = room && room.players.find((p) => p.token && p.token === msg.token);
    if (!pl) return send(ws, { t: 'err', fatal: true, gone: true, msg: 'Zápas už neexistuje.' });
    bind(ws, room, pl); publish(room); const gm = room.phase === 'play' || room.phase === 'over' ? gameMsg(room) : null; if (gm) send(ws, gm); return;
  }
  const ctx = ws.ctx; if (!ctx) return;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = room.players.find((p) => p.id === ctx.pid); if (!pl) return;
  const i = room.players.indexOf(pl); const g = room.phase === 'play' ? room.game : null;
  switch (msg.t) {
    case 'rep': if (g) G.report(g, i, msg); return;
    case 'shot': if (g) { room.lastActive = now(); if (G.shot(g, i, msg)) flush(room); } return;
    case 'pen': if (g) { if (G.penalty(g, i)) flush(room); } return;
    case 'sink': if (g) { room.lastActive = now(); if (G.sunk(g, i, msg)) flush(room); else send(ws, { t: 'nosink' }); } return;
    case 'color': {   // výběr barvy míčku v čekárně (nesmí ji mít jiný hráč)
      if (room.phase !== 'lobby') return; const c = K.colorIdx(msg.color); if (c < 0) return;
      if (room.players.some((p) => p !== pl && !p.left && p.color === c)) return send(ws, { t: 'err', msg: 'Tuhle barvu už má jiný hráč.' });
      pl.color = c; if (pl.acc) { golfOf(pl.acc).color = c; dirty(); } return publish(room);
    }
    case 'cfg': if (room.phase === 'lobby' && room.host === pl.id && !room.quick) { room.cfg = K.cleanCfg({ ...room.cfg, ...(msg.cfg && typeof msg.cfg === 'object' ? msg.cfg : {}) }); publish(room); } return;
    case 'course': if (room.phase === 'lobby' && room.host === pl.id && !room.quick) { room.course = C.courseIdx(msg.course); publish(room); } return;
    case 'start': {   // jen zakladatel: začít (nejméně 2 hráči), případně doplnit boty do 4
      if (room.phase !== 'lobby' || room.host !== pl.id) return;
      const level = K.clamp(Math.floor(Number(msg.level)) || 2, 1, 3);
      if (!fillAndStart(room, !!msg.fill, level, msg.course)) send(ws, { t: 'err', msg: 'Na hru jsou potřeba aspoň dva hráči (nebo zapni doplnění boty).' });
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
  clients.add(ws); ws.isAlive = true; ws.ctx = null; ws.bucket = { n: 120, t: now() };
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    const t = now(); ws.bucket.n = Math.min(120, ws.bucket.n + ((t - ws.bucket.t) / 1000) * 60); ws.bucket.t = t;   // hlášení polohy chodí asi 12× za sekundu
    if (ws.bucket.n < 1) return; ws.bucket.n -= 1;
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { handle(ws, msg); } catch (e) { console.error('golf: chyba obsluhy', e); }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws, false); });
  ws.on('error', () => {});
}
setInterval(() => { for (const ws of clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* nic */ } } }, 25_000).unref();
setInterval(() => { for (const r of rooms.values()) if (live(r).length === 0 && r.emptySince && now() - r.emptySince > EMPTY_ROOM_MS) destroy(r); }, 15_000).unref();
setInterval(() => { for (const r of rooms.values()) if (r.phase === 'lobby') publish(r); }, 1000).unref();   // odpočet automatického startu

export const stats = () => ({ rooms: rooms.size, clients: clients.size });
export { rooms, K, G, C };
