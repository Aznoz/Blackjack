// HOPÍK – závodní hra se stavěním překážek (jako Ultimate Chicken Horse) pro 2 až 4 hráče: každé kolo si hráči vyberou kus (plošina nebo past),
// položí ho na trať a pak se běží z vlajky na startu k cíli. Body dostane, kdo doběhne; pasti zabíjejí. První na 50 bodů vyhrává.
// Online (rychlá hra, kód místnosti) nebo proti botům. Průběh kol počítá server (sim.js), pohyb postavy si počítá prohlížeč hráče (stejná fyzika
// z phys.js) a server ho přijímá jako hlášení; boti běží přímo na serveru. WebSocket obsluhuje hlavní server na cestě /hopik. Účty dodává init().
import crypto from 'node:crypto';
import * as K from './shared.js';
import * as G from './sim.js';
import * as B from './bot.js';

const SC = Number(process.env.HOPIK_SCALE) > 0 ? Number(process.env.HOPIK_SCALE) : 1;   // jen pro testy: zrychlení hodin
const ms = (n) => Math.max(2, Math.round(n * SC));
const DROP_GRACE_MS = Number(process.env.HOPIK_DROP_MS) || 30_000;
const AUTO_START_MS = Number(process.env.HOPIK_AUTO_MS) || 12_000;       // rychlá hra: po této době se začne i s menším počtem lidí (nejméně 2)
const EMPTY_ROOM_MS = 120_000;
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';
const rooms = new Map();
const now = () => Date.now();
let deps = null;
export function init(d) { deps = d; }
const dirty = () => { try { deps && deps.markDirty(); } catch { /* nic */ } };

// ------------------------------------------------------------------ účet
export function hopikOf(acc) {
  let t = acc.hopik; if (!t || typeof t !== 'object') t = acc.hopik = {};
  for (const k of ['wins', 'games', 'fin']) t[k] = Math.max(0, Math.min(1e7, Math.floor(Number(t[k]) || 0)));
  t.char = K.charIdx(t.char);   // -1 = ještě nevybráno
  return t;
}
function profileOf(acc, linked) { const t = hopikOf(acc); return { account: true, linked: !!linked, name: acc.name, avatar: acc.avatar, hopik: { char: t.char, wins: t.wins, games: t.games, fin: t.fin } }; }
function identify(msg) {
  if (!deps || !msg || typeof msg.token !== 'string' || !deps.TOKEN_RE.test(msg.token)) return null;
  try { return deps.resolveAccount({ token: msg.token, session: typeof msg.session === 'string' ? msg.session : undefined, name: msg.name }); } catch { return null; }
}
/** HTTP: me (profil pro menu), char (uložení vybrané postavičky do účtu). */
export function api(action, body) {
  if (action === 'me') { const ident = identify(body || {}); return { status: 200, json: ident ? profileOf(ident.acc, ident.linked) : { account: false } }; }
  if (action === 'char') {
    const ident = identify(body || {}); if (!ident) return { status: 401, json: { error: 'Pro uložení postavičky se musíš přihlásit.' } };
    const c = K.charIdx(body.char); if (c < 0) return { status: 400, json: { error: 'Neznámá postavička.' } };
    hopikOf(ident.acc).char = c; dirty(); return { status: 200, json: profileOf(ident.acc, ident.linked) };
  }
  return { status: 404, json: { error: 'Neznámá akce.' } };
}

// ------------------------------------------------------------------ pomocné
function cleanName(s) { const t = String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14); return t || 'Hráč'; }
function makeCode() { for (let i = 0; i < 200; i++) { let c = ''; for (let j = 0; j < 4; j++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; } return null; }
function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch { /* spojení padlo */ } } }
const humans = (room) => room.players.filter((p) => !p.bot);
const live = (room) => room.players.filter((p) => p.connected && !p.bot);
function freeChar(room, want, except) {
  const used = new Set(room.players.filter((p) => !p.left && p !== except).map((p) => p.char));
  if (want >= 0 && !used.has(want)) return want;
  const free = K.CHARS.map((_, i) => i).filter((i) => !used.has(i)); return free.length ? free[Math.floor(Math.random() * free.length)] : 0;
}

// ------------------------------------------------------------------ stav pro klienty
function playerView(p, room) {
  const t = p.acc ? hopikOf(p.acc) : null;
  return { name: p.name, avatar: p.acc ? p.acc.avatar : null, bot: p.bot || 0, connected: p.connected, char: p.char, left: !!p.left, wins: t ? t.wins : 0, games: t ? t.games : 0 };
}
function view(room, pid) {
  return {
    t: 'state', code: room.code, phase: room.phase, you: room.players.findIndex((p) => p.id === pid), host: room.players.findIndex((p) => p.id === room.host), quick: !!room.quick, solo: !!room.solo,
    stage: room.stage, players: room.players.map((p) => playerView(p, room)), result: room.result, rematch: room.players.map((p) => p.bot || room.rematch.has(p.id)), matchId: room.matchId,
    auto: room.quick && room.autoAt ? Math.max(0, Math.round((room.autoAt - now()) / 1000)) : null,
    drop: room.dropFor ? { idx: room.players.findIndex((p) => p.id === room.dropFor), left: Math.max(0, Math.round((room.dropAt - now()) / 1000)) } : null,
  };
}
function publish(room) { for (const p of room.players) if (p.ws) send(p.ws, view(room, p.id)); }
/** Úplný stav hry (fáze, kusy na trati, nabídka kusů, body); posílá se při každé změně fáze, výběru a položení kusu. */
function gameMsg(room) {
  const g = room.game; if (!g) return null;
  return {
    t: 'game', ph: g.phase, gt: g.t, round: g.round, stage: g.stage, rt: g.rt, pts: g.players.map((p) => p.pts), left: g.players.map((p) => !!p.left),
    pieces: g.pieces.map((p) => [p.id, p.type, p.r, p.x, p.y, p.owner, p.round]), offers: g.offers.map((o) => [o.type, o.by]), piece: g.piece, placed: g.placed,
    res: g.phase === 'score' || g.phase === 'over' ? g.roundRes : null, over: g.over,
    fin: g.run ? g.run.fin.map((v) => v >= 0) : null, dead: g.run ? g.run.dead.slice() : null,
  };
}
function broadcast(room, obj) { const json = typeof obj === 'string' ? obj : JSON.stringify(obj); for (const p of room.players) if (p.ws && !p.bot && p.ws.bufferedAmount < 400_000) send(p.ws, json); }

// ------------------------------------------------------------------ průběh zápasu
function startMatch(room) {
  for (const p of room.players) { p.left = false; }
  room.game = G.newGame(room.players.map((p) => ({ name: p.name, char: p.char, bot: p.bot })), crypto.randomInt(1, 2 ** 31), room.stage);
  room.result = null; room.rematch = new Set(); room.matchId = (room.matchId || 0) + 1; room.autoAt = null; room.phase = 'play'; room.lastActive = now();
  room.lastPh = null; room.bst = room.players.map(() => ({})); room.bd = room.players.map(() => 0); room.tickN = 0;
  for (const p of room.players) if (p.left) G.forfeit(room.game, room.players.indexOf(p));
  publish(room); const m = gameMsg(room); if (m) broadcast(room, m);
}
function finish(room) {
  if (room.phase === 'over') return;
  const g = room.game; room.phase = 'over';
  const winner = g.over ? g.over.winner : -1;
  const fins = g.players.map((p, i) => g.history.filter((h) => h.rows[i] && h.rows[i].fin).length);
  room.result = { winner, pts: g.players.map((p) => p.pts), rounds: g.round, fins };
  room.players.forEach((p, i) => {
    if (p.bot || !p.acc || p.left) return;
    const t = hopikOf(p.acc); t.games++; t.fin += fins[i]; if (winner === i) t.wins++; p.acc.lastSeen = now();
  });
  dirty(); publish(room);
}
/** Boti: výběr kusu, pokládání a řízení běhu. */
function driveBots(room) {
  const g = room.game;
  if (g.phase !== room.lastPh) {   // nová fáze: boti si naplánují, kdy zareagují
    room.lastPh = g.phase;
    if (g.phase === 'pick') { room.bst = room.players.map(() => ({})); room.bd = room.players.map((p) => 20 + Math.floor(Math.random() * (p.bot === 3 ? 50 : 110))); }
    if (g.phase === 'place') room.bd = room.players.map((p) => 30 + Math.floor(Math.random() * (p.bot === 3 ? 160 : 330)));
  }
  room.players.forEach((p, i) => {
    if (!p.bot || p.left) return;
    if (g.phase === 'pick' && g.pick[i] === -1 && g.t >= room.bd[i]) { const k = B.botPick(g, i, p.bot); if (k >= 0) G.pickPiece(g, i, k); }
    else if (g.phase === 'place' && !g.placed[i] && g.t >= room.bd[i]) {   // bot nejdřív ukáže ducha kusu na zvoleném místě a po chvilce ho položí
      const st = room.bst[i];
      if (!st.target) { const c = B.botPlace(g, i, p.bot); if (!c) G.skipPlace(g, i); else { st.target = c; st.putAt = g.t + 18 + Math.floor(Math.random() * 20); G.setGhost(g, i, c.x, c.y, c.r); } }
      else if (g.t >= st.putAt) { const c = st.target; if (G.placePiece(g, i, c.x, c.y, c.r) !== 'ok') G.skipPlace(g, i); }
    }
    else if (g.phase === 'reveal' && room.bst[i].navDone !== true) { room.bst[i].navDone = true; B.navOf(g); }
    else if (g.phase === 'run' && !g.run.dead[i] && g.run.fin[i] < 0) G.setInput(g, i, B.botInput(g, i, p.bot, room.bst[i]));
  });
}
function flush(room) {
  const g = room.game; const ev = g.ev; room.tickN++;
  if (ev.some((e) => e[0] === 'ph' || e[0] === 'pk' || e[0] === 'pl')) { const m = gameMsg(room); if (m) broadcast(room, m); }
  const rest = ev.filter((e) => e[0] !== 'ph' && e[0] !== 'pk' && e[0] !== 'pl');
  let msg = null;
  if (g.phase === 'count' || g.phase === 'run') { msg = G.snap(g); msg.t = 'tk'; msg.ph = g.phase; msg.gt = g.t; }
  else if (g.phase === 'place' && room.tickN % 3 === 0) {
    const gh = g.players.map((p, i) => (g.placed[i] || p.left || !g.piece[i] || (p.bot && !(room.bst[i] && room.bst[i].target)) ? null : [g.ghost[i].x, g.ghost[i].y, g.ghost[i].r]));
    const sig = JSON.stringify(gh); if (sig !== room.ghSig) { room.ghSig = sig; msg = { t: 'tk', ph: 'place', gt: g.t, gh }; }
  }
  if (rest.length) { if (!msg) msg = { t: 'tk', ph: g.phase, gt: g.t }; msg.ev = rest; }
  if (msg) broadcast(room, msg);
  G.clearEvents(g);
}
function tickRoom(room) {
  if (room.phase === 'lobby') { if (room.quick && room.autoAt && now() >= room.autoAt && room.players.length >= 2) fillAndStart(room, 0, 0); return; }
  const g = room.game; if (!g || room.phase !== 'play') return;
  driveBots(room); G.tick(g); flush(room);
  if (g.phase === 'over') finish(room);
}
let ticker = null;
export function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => { for (const r of rooms.values()) { try { tickRoom(r); } catch (e) { console.error('hopik: chyba ticku', e); } } }, ms(K.DT * 1000));
  ticker.unref();
}
startTicker();
/** Jen pro testy: posune místnost o n tiků hned (bez čekání). */
export function advance(room, n) { for (let i = 0; i < n && room.phase === 'play'; i++) tickRoom(room); }

// ------------------------------------------------------------------ místnosti a spojení
function newRoom() {
  const code = makeCode(); if (!code) return null;
  const room = { code, players: [], nextId: 1, host: null, phase: 'lobby', quick: false, solo: false, game: null, result: null, rematch: new Set(), stage: 0, emptySince: now(), matchId: 0, dropTimer: null, dropAt: null, dropFor: null, autoAt: null, bst: [], bd: [], lastPh: null, tickN: 0, ghSig: '' };
  rooms.set(code, room); return room;
}
function addPlayer(room, ws, msg) {
  const ident = identify(msg);
  if (ident && room.players.some((p) => p.acc === ident.acc)) return { err: 'Tenhle účet už v místnosti hraje.' };
  const base = ident && ident.linked ? ident.acc.name : (String(msg.name ?? '').trim() ? msg.name : ident ? ident.acc.name : msg.name);
  let n = cleanName(base); let k = 2;
  while (room.players.some((p) => p.name === n)) n = `${cleanName(base).slice(0, 11)} ${k++}`;
  let want = K.charIdx(msg.char); if (want < 0 && ident) want = hopikOf(ident.acc).char;
  const pl = { id: 'p' + room.nextId++, name: n, token: crypto.randomBytes(12).toString('hex'), ws, connected: true, acc: ident ? ident.acc : null, bot: 0, left: false, char: -1 };
  pl.char = freeChar(room, want, pl);
  room.players.push(pl); if (!room.host) room.host = pl.id; bind(ws, room, pl); return { pl };
}
function addBots(room, count, level) {
  for (let k = 0; k < count && room.players.length < K.MAX_PLAYERS; k++) {
    let n = B.BOT_NAMES[level]; let j = 2; while (room.players.some((p) => p.name === n)) n = `${B.BOT_NAMES[level]} ${j++}`;
    const pl = { id: 'bot' + room.nextId++, name: n, token: null, ws: null, connected: true, acc: null, bot: level, left: false, char: -1 }; pl.char = freeChar(room, -1, pl); room.players.push(pl);
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
    if (!room.dropTimer && !room.solo) {   // odpojení: krátká doba na návrat, postava mezitím stojí
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
function fillAndStart(room, fill, level, stage) {
  if (stage !== undefined) room.stage = K.stageIdx(stage);
  if (fill) addBots(room, K.MAX_PLAYERS - room.players.length, level || 2);
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
      if (room.phase !== 'lobby' || room.players.length >= K.MAX_PLAYERS) return send(ws, { t: 'err', fatal: true, msg: 'Místnost je plná nebo už hraje.' });
    } else if (msg.t === 'quick') {
      const ident = identify(msg);
      room = [...rooms.values()].find((r) => r.quick && r.phase === 'lobby' && r.players.length < K.MAX_PLAYERS && live(r).length === r.players.length && !(ident && r.players.some((p) => p.acc === ident.acc)));
      if (!room) { room = newRoom(); if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Server je plný, zkus to později.' }); room.quick = true; room.stage = crypto.randomInt(0, K.STAGES.length); }
    } else {
      room = newRoom(); if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Server je plný, zkus to později.' });
      room.stage = K.stageIdx(msg.stage);
    }
    const r = addPlayer(room, ws, msg);
    if (r.err) { if (room.players.length === 0) destroy(room); return send(ws, { t: 'err', fatal: true, msg: r.err }); }
    if (msg.t === 'bot') {
      const level = K.clamp(Math.floor(Number(msg.level)) || 2, 1, 3), n = K.clamp(Math.floor(Number(msg.n)) || 1, 1, 3);
      room.solo = true; addBots(room, n, level);
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
    case 'die': if (g) G.clientDie(g, i, Number(msg.c)); return;
    case 'cr': if (g && g.phase === 'run') G.crumbleReport(g, Math.floor(Number(msg.gid)), K.clamp(Math.floor(Number(msg.k)) || g.rt, g.rt - 12, g.rt + 2)); return;
    case 'ghost': if (g) G.setGhost(g, i, Number(msg.x), Number(msg.y), Number(msg.r)); return;
    case 'pick': if (g) { room.lastActive = now(); if (!G.pickPiece(g, i, Math.floor(Number(msg.k)))) { const m = gameMsg(room); if (m) send(ws, m); } else flush(room); } return;
    case 'place': if (g) {
      room.lastActive = now(); const r = G.placePiece(g, i, Number(msg.x), Number(msg.y), Number(msg.r));
      if (r !== 'ok') { send(ws, { t: 'placeres', ok: r }); } else flush(room);
    } return;
    case 'char': {   // výběr postavičky v čekárně (nesmí ji mít jiný hráč)
      if (room.phase !== 'lobby') return; const c = K.charIdx(msg.char); if (c < 0) return;
      if (room.players.some((p) => p !== pl && !p.left && p.char === c)) return send(ws, { t: 'err', msg: 'Tuhle postavičku už má jiný hráč.' });
      pl.char = c; if (pl.acc) { hopikOf(pl.acc).char = c; dirty(); } return publish(room);
    }
    case 'stage': if (room.phase === 'lobby' && room.host === pl.id && !room.quick) { room.stage = K.stageIdx(msg.stage); publish(room); } return;
    case 'start': {   // jen zakladatel: začít (nejméně 2 hráči), případně doplnit boty do 4
      if (room.phase !== 'lobby' || room.host !== pl.id) return;
      const level = K.clamp(Math.floor(Number(msg.level)) || 2, 1, 3);
      if (!fillAndStart(room, !!msg.fill, level, msg.stage)) send(ws, { t: 'err', msg: 'Na hru jsou potřeba aspoň dva hráči (nebo zapni doplnění boty).' });
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
    const t = now(); ws.bucket.n = Math.min(120, ws.bucket.n + ((t - ws.bucket.t) / 1000) * 60); ws.bucket.t = t;   // hlášení pohybu chodí asi 20× za sekundu
    if (ws.bucket.n < 1) return; ws.bucket.n -= 1;
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { handle(ws, msg); } catch (e) { console.error('hopik: chyba obsluhy', e); }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws, false); });
  ws.on('error', () => {});
}
setInterval(() => { for (const ws of clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* nic */ } } }, 25_000).unref();
setInterval(() => { for (const r of rooms.values()) if (live(r).length === 0 && r.emptySince && now() - r.emptySince > EMPTY_ROOM_MS) destroy(r); }, 15_000).unref();
setInterval(() => { for (const r of rooms.values()) if (r.phase === 'lobby') publish(r); }, 1000).unref();   // odpočet automatického startu

export const stats = () => ({ rooms: rooms.size, clients: clients.size });
export { rooms, K, G };
