// ŠACHY – online 1v1 přes kód místnosti. Pravidla řeší engine.js, tady jsou místnosti, hodiny, nabídky remízy a coiny.
// WebSocket obsluhuje hlavní server na cestě /sachy. Účty a coiny dodává server přes init().
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { Game, sqName, insufficient, pieceValue } from './engine.js';
import { staticEval } from './ai.js';

export const WIN_COINS = 1500;
export const LOSE_COINS = 500;
const MIN_PLIES_FOR_COINS = Number(process.env.SACHY_MIN_PLIES) || 4; // coiny jen u partie, ve které každý hráč odehrál aspoň 2 tahy (proti „farmení“ okamžitým vzdáním)
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';
const EMPTY_ROOM_MS = 120_000;
const LOBBY_GRACE_MS = 40_000;
const DROP_GRACE_MS = Number(process.env.SACHY_DROP_MS) || 90_000; // po tolika ms bez spojení se hráč vzdává
const FIRST_MOVE_MS = Number(process.env.SACHY_FIRST_MS) || 60_000; // na první tah každého hráče; jinak se partie zruší bez coinů
const MS_MIN = Number(process.env.SACHY_MS_PER_MIN) || 60_000; // jen pro testy
export const BOT_REWARDS = { 1: 200, 2: 500, 3: 750, 4: 1000, 5: 1500 }; // výhra nad botem dané úrovně (prohra se neúčtuje)
export const BOT_NAMES = { 1: 'Bot Nováček', 2: 'Bot Začátečník', 3: 'Bot Pokročilý', 4: 'Bot Expert', 5: 'Bot Velmistr' };
const BOT_MIN_MS = Number(process.env.SACHY_BOT_MIN_MS) || 500; // nejkratší „přemýšlení“ bota, ať tahy nepadají okamžitě
export const TIMES = [0, 1, 3, 5, 10, 15, 30]; // minuty na hráče (0 = bez limitu)
export const INCS = [0, 2, 5, 10]; // přídavek za tah v sekundách

const rooms = new Map();
const now = () => Date.now();
let deps = null;
export function init(d) { deps = d; }

const other = (c) => (c === 'w' ? 'b' : 'w');
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
const byId = (room, id) => room.players.find((p) => p.id === id);
const byColor = (room, c) => room.players.find((p) => p.color === c);
const live = (room) => room.players.filter((p) => p.connected && !p.bot);

// ---------------------------------------------------------------- stav pro klienty
function clockView(room) {
  if (!room.timed) return null;
  const c = { w: room.clock.w, b: room.clock.b };
  let running = null;
  if (room.phase === 'play' && room.game && room.clockOn) { running = room.game.state.turn; c[running] = Math.max(0, c[running] - (now() - room.turnAt)); }
  return { w: c.w, b: c.b, running, inc: room.inc };
}

function legalMap(room, color) {
  if (room.phase !== 'play' || !room.game || room.game.state.turn !== color) return [];
  const out = [];
  for (const m of room.game.legal()) out.push([m.from, m.to, m.promo ? 1 : 0]);
  return out;
}

function captured(game) {
  const byW = []; const byB = []; // co vzal bílý / černý
  for (const m of game.moves) if (m.cap) (m.cap === m.cap.toLowerCase() ? byW : byB).push(m.cap);
  const order = 'qrbnp';
  const sort = (a) => a.sort((x, y) => order.indexOf(x.toLowerCase()) - order.indexOf(y.toLowerCase()));
  const sum = (a) => a.reduce((n, p) => n + pieceValue(p), 0);
  return { byW: sort(byW), byB: sort(byB), diff: sum(byW) - sum(byB) };
}

function view(room, pid) {
  const me = byId(room, pid);
  const g = room.game;
  const last = g && g.moves.length ? g.moves[g.moves.length - 1] : null;
  return {
    t: 'state', code: room.code, phase: room.phase, you: pid, color: me ? me.color : null, hostId: room.hostId,
    cfg: { time: room.time, inc: room.inc, pick: room.pick }, bot: room.bot || 0, botRewards: BOT_REWARDS,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, connected: p.connected, avatar: p.acc ? p.acc.avatar : null, account: !!p.acc, bot: p.bot || 0,
      rematch: room.rematch.has(p.id),
    })),
    fen: g ? g.fens[g.fens.length - 1] : null, startFen: g ? g.fens[0] : null,
    turn: g ? g.state.turn : null,
    check: !!(g && !g.result && g.sans.length && /[+#]$/.test(g.sans[g.sans.length - 1])),
    moves: g ? g.sans.map((s, i) => ({ san: s, from: g.moves[i].from, to: g.moves[i].to, promo: g.moves[i].promo })) : [],
    last: last ? { from: last.from, to: last.to, cap: !!last.cap, castle: !!last.castle, promo: !!last.promo } : null,
    legal: me ? legalMap(room, me.color) : [],
    captured: g ? captured(g) : null,
    clock: clockView(room), clockAt: now(),
    drawOffer: room.drawOffer, dropIn: room.dropAt && room.dropFor !== pid ? Math.max(0, room.dropAt - now()) : null,
    coinsOn: !!deps, balance: me && me.acc ? me.acc.balance : null, win: WIN_COINS, lose: LOSE_COINS,
    result: room.result || null,
  };
}
function publish(room) { for (const p of room.players) if (p.ws) send(p.ws, view(room, p.id)); }

// ---------------------------------------------------------------- průběh partie
function clearTimers(room) { for (const k of ['flag', 'first', 'botT']) { if (room[k]) clearTimeout(room[k]); room[k] = null; } }

function startGame(room, swap) {
  clearTimers(room);
  const [a, b] = room.players; // a = zakladatel místnosti
  if (swap) a.color = other(a.color);
  else a.color = room.pick === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : room.pick;
  b.color = other(a.color);
  room.game = new Game(process.env.SACHY_START_FEN || undefined); // proměnná jen pro testy
  room.gameId = (room.gameId || 0) + 1; room.botBusy = false;
  room.timed = room.time > 0;
  room.clock = { w: room.time * MS_MIN, b: room.time * MS_MIN };
  room.clockOn = false; room.turnAt = now();
  room.drawOffer = null; room.result = null; room.rematch = new Set();
  room.phase = 'play';
  armFirst(room);
  publish(room);
  scheduleBot(room);
}

function armFirst(room) {
  if (room.first) { clearTimeout(room.first); room.first = null; }
  if (room.game.moves.length >= 2) return;
  const bp = room.bot && botPlayer(room); if (bp && room.game.state.turn === bp.color) return; // bota nehlídáme
  room.first = setTimeout(() => {
    room.first = null;
    if (room.phase === 'play' && room.game.moves.length < 2) finish(room, { type: 'abort', winner: null, reason: 'Hráč na tahu nezačal včas – partie zrušena' });
  }, FIRST_MOVE_MS);
}
function armFlag(room) {
  if (room.flag) { clearTimeout(room.flag); room.flag = null; }
  if (!room.timed || !room.clockOn || room.phase !== 'play') return;
  const c = room.game.state.turn;
  const left = room.clock[c] - (now() - room.turnAt);
  room.flag = setTimeout(() => { room.flag = null; flagFall(room, c); }, Math.max(0, left) + 30);
}
/** Přepočítá hodiny hráče na tahu; vrací true, pokud mu už vypršel čas. */
function settleClock(room) {
  if (!room.timed || !room.clockOn) return false;
  const c = room.game.state.turn;
  const t = now();
  room.clock[c] -= t - room.turnAt; room.turnAt = t;
  return room.clock[c] <= 0;
}
function onlyKingLike(board, color) { // soupeř nemůže dát mat (jen král, případně s jednou lehkou figurou)
  const mine = board.filter((p) => p && (color === 'w' ? p === p.toUpperCase() : p === p.toLowerCase()) && p.toLowerCase() !== 'k');
  return mine.length === 0 || (mine.length === 1 && 'nb'.includes(mine[0].toLowerCase()));
}
function flagFall(room, c) {
  if (room.phase !== 'play') return;
  if (!settleClock(room)) { armFlag(room); return; }
  room.clock[c] = 0;
  const win = other(c);
  if (onlyKingLike(room.game.state.board, win)) return finish(room, { type: 'remiza', winner: null, reason: 'Vypršel čas, ale soupeř nemá čím dát mat' });
  finish(room, { type: 'cas', winner: win, reason: 'Vypršel čas' });
}

function finish(room, result) {
  if (room.phase !== 'play') return;
  clearTimers(room);
  if (room.dropTimer) { clearTimeout(room.dropTimer); room.dropTimer = null; room.dropAt = null; room.dropFor = null; }
  room.phase = 'over';
  room.drawOffer = null;
  const winnerP = result.winner ? byColor(room, result.winner) : null;
  const r = { type: result.type, winner: result.winner, winnerId: winnerP ? winnerP.id : null, reason: result.reason, coins: {} };
  if (result.winner && room.game.moves.length >= MIN_PLIES_FOR_COINS) r.coins = payout(room, winnerP);
  else if (result.winner && !(winnerP && winnerP.bot)) r.noCoins = 'Partie byla moc krátká – coiny se neúčtují.';
  room.result = r;
  if (room.timed) room.clockOn = false;
  publish(room);
}

/** Výhra +1500 coinů, prohra −500 (zůstatek nikdy neklesne pod minimum serveru). Jen když oba hráči mají účet. */
function payout(room, winner) {
  const coins = {};
  if (room.bot) { // výhra nad botem: odměna podle úrovně, prohra se neúčtuje
    if (!deps || winner.bot || !winner.acc) return coins;
    const before = winner.acc.balance; winner.acc.balance = before + BOT_REWARDS[room.bot];
    coins[winner.id] = winner.acc.balance - before; winner.acc.lastSeen = now();
    try { deps.notifyBalance(winner.acc); deps.markDirty(); } catch { /* nic */ }
    return coins;
  }
  if (!deps || !room.players.every((p) => p.acc)) return coins;
  const loser = room.players.find((p) => p !== winner);
  const w = winner.acc; const l = loser.acc;
  const wb = w.balance; const lb = l.balance;
  w.balance = wb + WIN_COINS; l.balance = Math.max(deps.FLOOR, lb - LOSE_COINS);
  coins[winner.id] = w.balance - wb; coins[loser.id] = l.balance - lb;
  w.lastSeen = now(); l.lastSeen = now();
  for (const a of [w, l]) { try { deps.notifyBalance(a); } catch { /* nic */ } }
  try { deps.markDirty(); } catch { /* nic */ }
  return coins;
}

function doMove(room, pl, msg) {
  if (room.phase !== 'play') return 'Teď se nehraje.';
  const g = room.game;
  if (g.state.turn !== pl.color) return 'Nejsi na tahu.';
  const from = Number(msg.from), to = Number(msg.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63) return 'Neplatný tah.';
  if (settleClock(room)) { flagFall(room, pl.color); return null; }
  const promo = typeof msg.promo === 'string' ? msg.promo.toLowerCase() : 'q';
  const r = g.play(from, to, 'qrbn'.includes(promo) ? promo : 'q');
  if (r.err) { room.turnAt = now(); return r.err; }
  room.drawOffer = null;
  if (room.timed) {
    if (room.clockOn) room.clock[pl.color] += room.inc * 1000;
    if (g.moves.length >= 2) room.clockOn = true; // hodiny se rozběhnou, až oba odehráli první tah
    room.turnAt = now();
  }
  if (g.moves.length >= 2 && room.first) { clearTimeout(room.first); room.first = null; } else armFirst(room);
  if (g.result) { finish(room, g.result); return null; }
  armFlag(room);
  publish(room);
  scheduleBot(room);
  return null;
}

// ---------------------------------------------------------------- bot (výpočet běží ve vlákně)
let worker = null; let reqId = 0; const waiting = new Map();
function resetWorker() { worker = null; for (const res of waiting.values()) res(undefined); waiting.clear(); }
function getWorker() {
  if (worker) return worker;
  try {
    const w = new Worker(new URL('./aiworker.js', import.meta.url));
    w.on('message', (m) => { const res = waiting.get(m.id); if (res) { waiting.delete(m.id); res(m.move); } });
    w.on('error', (e) => { console.error('sachy: vlákno bota spadlo:', e.message); if (worker === w) resetWorker(); });
    w.on('exit', () => { if (worker === w) resetWorker(); });
    w.unref();
    worker = w;
  } catch (e) { console.error('sachy: vlákno bota se nespustilo:', e.message); worker = null; }
  return worker;
}
/** Zeptá se bota na tah; při chybě vrátí undefined (pak se zahraje náhodný legální tah). */
function askBot(room, ms) {
  const g = room.game; const w = getWorker();
  if (!w) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const id = ++reqId; waiting.set(id, resolve);
    const t = setTimeout(() => { if (waiting.delete(id)) resolve(undefined); }, 20_000); t.unref();
    w.postMessage({ id, fen: g.fens[g.fens.length - 1], history: g.fens.slice(-110, -1), level: room.bot, ms });
  });
}
function botPlayer(room) { return room.players.find((p) => p.bot); }
function scheduleBot(room) {
  const bp = room.bot && botPlayer(room);
  if (!bp || room.phase !== 'play' || room.botBusy || room.game.state.turn !== bp.color) return;
  room.botBusy = true;
  const gameId = room.gameId;
  const lowMs = room.timed && room.clockOn ? Math.max(80, Math.floor((room.clock[bp.color] - (now() - room.turnAt)) / 25)) : 0; // při málo času jen krátce
  const think = askBot(room, lowMs || undefined);
  const wait = new Promise((r) => { room.botT = setTimeout(r, BOT_MIN_MS + Math.random() * (room.bot <= 2 ? 500 : 900)); });
  Promise.all([think, wait]).then(([mv]) => {
    room.botBusy = false; room.botT = null;
    if (room.phase !== 'play' || room.gameId !== gameId || !rooms.has(room.code) || room.game.state.turn !== bp.color) return;
    let m = mv;
    if (!m || room.game.find(m.from, m.to, m.promo) === null) { const l = room.game.legal(); const r = l[Math.floor(Math.random() * l.length)]; m = r && { from: r.from, to: r.to, promo: r.promo || null }; }
    if (m) {
      const err = doMove(room, bp, { from: m.from, to: m.to, promo: m.promo || undefined });
      if (err && room.phase === 'play') { const l = room.game.legal(); const r = l[0]; if (r) doMove(room, bp, { from: r.from, to: r.to, promo: r.promo || undefined }); }
    }
  });
}
/** Bot nabídku remízy přijme, když je na tom hůř (nebo u slabých úrovní občas náhodou). */
function botAcceptsDraw(room) {
  const bp = botPlayer(room); const ev = staticEval(room.game.fens[room.game.fens.length - 1]); const mine = bp.color === 'w' ? ev : -ev;
  if (room.bot <= 2) return Math.random() < 0.4;
  return mine <= -120 || (room.game.moves.length >= 90 && Math.abs(mine) < 60);
}

// ---------------------------------------------------------------- místnosti
function newRoom() {
  const code = makeCode();
  if (!code) return null;
  const room = {
    code, players: [], nextId: 1, hostId: null, phase: 'lobby', time: 10, inc: 0, pick: 'random', game: null, timed: false,
    clock: { w: 0, b: 0 }, clockOn: false, turnAt: 0, drawOffer: null, rematch: new Set(), result: null,
    bot: 0, botBusy: false, botT: null, gameId: 0, emptySince: now(), flag: null, first: null, dropTimer: null, dropAt: null, dropFor: null,
  };
  rooms.set(code, room);
  return room;
}

function identify(msg) {
  if (!deps || typeof msg.token !== 'string' || !deps.TOKEN_RE.test(msg.token)) return null;
  try { return deps.resolveAccount({ token: msg.token, session: typeof msg.session === 'string' ? msg.session : undefined, name: msg.name }); } catch { return null; }
}

function addPlayer(room, ws, msg) {
  const ident = identify(msg);
  if (ident && room.players.some((p) => p.acc === ident.acc)) return { err: 'Tenhle účet už v místnosti hraje.' };
  const base = ident && ident.linked ? ident.acc.name : (String(msg.name ?? '').trim() ? msg.name : ident ? ident.acc.name : msg.name);
  let n = cleanName(base); let i = 2;
  while (room.players.some((p) => p.name === n)) n = `${cleanName(base).slice(0, 11)} ${i++}`;
  const pl = { id: 'p' + room.nextId++, name: n, token: crypto.randomBytes(12).toString('hex'), ws, connected: true, color: null, acc: ident ? ident.acc : null };
  room.players.push(pl);
  if (!room.hostId) room.hostId = pl.id;
  bind(ws, room, pl);
  return { pl };
}
function bind(ws, room, pl) {
  if (pl.ws && pl.ws !== ws) { pl.ws.ctx = null; try { pl.ws.close(4000, 'Přihlášení z jiného okna'); } catch { /* nic */ } }
  pl.ws = ws; pl.connected = true; ws.ctx = { code: room.code, pid: pl.id };
  if (pl.dropTimer) { clearTimeout(pl.dropTimer); pl.dropTimer = null; }
  if (room.dropFor === pl.id) { clearTimeout(room.dropTimer); room.dropTimer = null; room.dropAt = null; room.dropFor = null; }
  room.emptySince = null;
  send(ws, { t: 'joined', code: room.code, you: pl.id, token: pl.token });
}
function destroy(room) { room.botBusy = true; room.gameId++; clearTimers(room); if (room.dropTimer) clearTimeout(room.dropTimer); rooms.delete(room.code); }
function removeFromLobby(room, pl) {
  room.players = room.players.filter((p) => p !== pl);
  if (room.hostId === pl.id) room.hostId = (room.players[0] || {}).id || null;
  if (!room.players.length) destroy(room); else publish(room);
}

function leave(ws, voluntary) {
  const ctx = ws.ctx; if (!ctx) return;
  ws.ctx = null;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = byId(room, ctx.pid);
  if (!pl || (pl.ws && pl.ws !== ws)) return;
  pl.ws = null; pl.connected = false;
  if (room.phase === 'lobby') {
    if (voluntary) removeFromLobby(room, pl);
    else { pl.dropTimer = setTimeout(() => { if (!pl.connected && rooms.has(room.code)) removeFromLobby(room, pl); }, LOBBY_GRACE_MS); publish(room); }
  } else if (room.phase === 'play') {
    if (voluntary && room.bot) { destroy(room); return; }
    if (voluntary) { resign(room, pl); pl.token = null; }
    else if (!room.dropTimer) {
      room.dropFor = pl.id; room.dropAt = now() + DROP_GRACE_MS;
      room.dropTimer = setTimeout(() => {
        room.dropTimer = null; room.dropAt = null; room.dropFor = null;
        const p = byId(room, pl.id);
        if (p && !p.connected && room.phase === 'play') finish(room, room.game.moves.length < 2 ? { type: 'abort', winner: null, reason: 'Hráč se odpojil – partie zrušena' } : { type: 'opusteni', winner: other(p.color), reason: 'Soupeř se odpojil' });
      }, DROP_GRACE_MS);
      publish(room);
    }
  } else { // over
    if (voluntary && room.bot) { destroy(room); return; }
    if (voluntary) { pl.token = null; room.players = room.players.filter((p) => p !== pl); room.rematch.delete(pl.id); if (room.hostId === pl.id) room.hostId = (room.players[0] || {}).id || null; publish(room); }
  }
  if (live(room).length === 0) room.emptySince = now();
}

function resign(room, pl) {
  if (room.phase !== 'play') return;
  if (room.game.moves.length < 2) return finish(room, { type: 'abort', winner: null, reason: `${pl.name} partii zrušil` });
  finish(room, { type: 'vzdani', winner: other(pl.color), reason: `${pl.name} se vzdal` });
}

function handle(ws, msg) {
  if (msg.t === 'ping') return send(ws, { t: 'pong' });
  if (msg.t === 'create' || msg.t === 'join') {
    if (ws.ctx) return;
    let room;
    if (msg.t === 'create') {
      room = newRoom();
      if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Server je plný, zkus to později.' });
    } else {
      room = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Místnost s tímhle kódem neexistuje.' });
      if (room.phase !== 'lobby' || room.players.length >= 2) return send(ws, { t: 'err', fatal: true, msg: 'Místnost je plná nebo už hraje.' });
    }
    const r = addPlayer(room, ws, msg);
    if (r.err) { if (msg.t === 'create') destroy(room); return send(ws, { t: 'err', fatal: true, msg: r.err }); }
    const lvl = Number(msg.bot);
    if (msg.t === 'create' && BOT_REWARDS[lvl]) { // partie proti botovi: bez čekání na soupeře, rovnou start
      room.bot = lvl;
      if (TIMES.includes(Number(msg.time))) room.time = Number(msg.time);
      if (INCS.includes(Number(msg.inc))) room.inc = Number(msg.inc);
      if (room.time === 0) room.inc = 0;
      if (['random', 'w', 'b'].includes(msg.pick)) room.pick = msg.pick;
      room.players.push({ id: 'bot', name: BOT_NAMES[lvl], token: null, ws: null, connected: true, color: null, acc: null, bot: lvl });
      return startGame(room, false);
    }
    return publish(room);
  }
  if (msg.t === 'resume') {
    if (ws.ctx) return;
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const pl = room && room.players.find((p) => p.token && p.token === msg.token);
    if (!pl) return send(ws, { t: 'err', fatal: true, gone: true, msg: 'Místnost už neexistuje.' });
    bind(ws, room, pl);
    return publish(room);
  }
  const ctx = ws.ctx; if (!ctx) return;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = byId(room, ctx.pid); if (!pl) return;

  switch (msg.t) {
    case 'config': {
      if (room.phase !== 'lobby' || room.hostId !== pl.id) return;
      if (msg.time != null && TIMES.includes(Number(msg.time))) room.time = Number(msg.time);
      if (msg.inc != null && INCS.includes(Number(msg.inc))) room.inc = Number(msg.inc);
      if (room.time === 0) room.inc = 0;
      if (['random', 'w', 'b'].includes(msg.pick)) room.pick = msg.pick;
      return publish(room);
    }
    case 'start': {
      if (room.phase !== 'lobby' || room.hostId !== pl.id) return;
      if (room.players.length < 2 || live(room).length < 2) return send(ws, { t: 'err', msg: 'Počkej na soupeře – pošli mu kód místnosti.' });
      return startGame(room, false);
    }
    case 'move': {
      const err = doMove(room, pl, msg);
      if (err) { send(ws, { t: 'rej', msg: err }); publish(room); }
      return;
    }
    case 'resign': return resign(room, pl);
    case 'draw': {
      if (room.phase !== 'play' || room.game.moves.length < 2) return;
      if (room.bot) {
        if (botAcceptsDraw(room)) return finish(room, { type: 'remiza', winner: null, reason: 'Bot přijal remízu' });
        return send(ws, { t: 'err', msg: 'Bot remízu odmítl.' });
      }
      if (room.drawOffer && room.drawOffer !== pl.id) return finish(room, { type: 'remiza', winner: null, reason: 'Dohoda o remíze' });
      room.drawOffer = pl.id; return publish(room);
    }
    case 'nodraw': { if (room.phase === 'play' && room.drawOffer && room.drawOffer !== pl.id) { room.drawOffer = null; publish(room); } return; }
    case 'rematch': {
      if (room.phase !== 'over' || room.players.length < 2) return;
      if (room.bot) return startGame(room, true);
      room.rematch.add(pl.id);
      if (room.players.every((p) => room.rematch.has(p.id))) { return startGame(room, true); }
      return publish(room);
    }
    case 'leave': return leave(ws, true);
    default:
  }
}

/** Pro HTTP: kdo se právě hlásí (jméno, profilovka, zůstatek) – menu hry ukáže přihlášeného hráče. */
export function me(body) {
  const ident = identify(body || {});
  if (!ident) return { status: 200, json: { account: false, win: WIN_COINS, lose: LOSE_COINS, botRewards: BOT_REWARDS } };
  return { status: 200, json: { account: true, linked: !!ident.linked, name: ident.acc.name, avatar: ident.acc.avatar, balance: ident.acc.balance, win: WIN_COINS, lose: LOSE_COINS, botRewards: BOT_REWARDS } };
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
    try { handle(ws, msg); } catch (e) { console.error('sachy: chyba obsluhy', e); }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws, false); });
  ws.on('error', () => {});
}

setInterval(() => { for (const ws of clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* nic */ } } }, 25_000).unref();
setInterval(() => { for (const r of rooms.values()) if (live(r).length === 0 && r.emptySince && now() - r.emptySince > EMPTY_ROOM_MS) destroy(r); }, 15_000).unref();

export const stats = () => ({ rooms: rooms.size, clients: clients.size });
export { rooms, sqName, insufficient };
