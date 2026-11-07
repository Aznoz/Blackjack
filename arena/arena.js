// ARÉNA VĚŽÍ – hra 1 na 1 podobná Clash Royale: pokládáš jednotky na svou půlku arény, ty jdou přes most na věže soupeře.
// Hlavní věž vzadu + menší strážní věž před ní, balíček 9 karet (3 v ruce), elixír, 3 minuty + prodloužení. Proti botovi (4 obtížnosti) nebo online.
// Simulaci počítá server (sim.js), klientům posílá snímky 10× za sekundu. WebSocket obsluhuje hlavní server na cestě /arena;
// účty, coiny a ukládání dodává server přes init().
import crypto from 'node:crypto';
import * as C from './cards.js';
import * as G from './sim.js';
import { botThink, botDeck, BOT_THINK, BOT_RATE } from './bot.js';
const { CARDS, W, H } = C;

const SC = Number(process.env.ARENA_SCALE) > 0 ? Number(process.env.ARENA_SCALE) : 1;   // jen pro testy: zrychlení hodin
const ms = (n) => Math.max(2, Math.round(n * SC));
export const START_COINS = 200, WIN_COINS = 100, LOSE_COINS = 30;
export const BOT_REWARDS = { 1: 50, 2: 80, 3: 110, 4: 150 };
export const BOT_LOSE = { 1: 15, 2: 20, 3: 25, 4: 30 };
export const STREAK_BONUS = 20, STREAK_CAP = 5;
export const BOT_NAMES = { 1: 'Bot Nováček', 2: 'Bot Pěšák', 3: 'Bot Velitel', 4: 'Bot Maršál' };
const BOT_XP = { 1: 30, 2: 50, 3: 70, 4: 90 };
const REWARDS = { win: WIN_COINS, lose: LOSE_COINS, botWin: BOT_REWARDS, botLose: BOT_LOSE, streakBonus: STREAK_BONUS, streakCap: STREAK_CAP };
const MIN_PLAYS = 2;                                  // coiny jen když každý člověk položil aspoň 2 karty
const DROP_GRACE_MS = Number(process.env.ARENA_DROP_MS) || 30_000;
const EMPTY_ROOM_MS = 120_000;
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';

const rooms = new Map();
const now = () => Date.now();
let deps = null;
export function init(d) { deps = d; }

// ------------------------------------------------------------------ účet: postup, balíček, úrovně karet
export function arenaOf(acc) {
  let t = acc.arena;
  if (!t || typeof t !== 'object') t = acc.arena = {};
  t.xp = Math.max(0, Math.min(1e7, Math.floor(Number(t.xp) || 0)));
  t.wins = Math.max(0, Math.floor(Number(t.wins) || 0)); t.losses = Math.max(0, Math.floor(Number(t.losses) || 0));
  t.coins = Number.isFinite(t.coins) ? Math.max(0, Math.min(1e9, Math.floor(t.coins))) : START_COINS;
  t.streak = Math.max(0, Math.floor(Number(t.streak) || 0)); t.best = Math.max(t.streak, Math.floor(Number(t.best) || 0));
  if (!t.lv || typeof t.lv !== 'object') t.lv = {};
  for (const id of Object.keys(t.lv)) { if (!CARDS[id]) delete t.lv[id]; else t.lv[id] = C.clamp(Math.floor(Number(t.lv[id]) || 1), 1, C.MAX_CARD_LEVEL); }
  const plvl = C.levelOf(t.xp);
  if (!t.owned || typeof t.owned !== 'object') {   // první načtení: nový účet má jen základní karty, starý si ponechá vše, co měl odemčené úrovní
    const fresh = !t.wins && !t.losses && !t.xp;
    t.owned = {}; for (const id of C.CARD_ORDER) if (C.STARTER.includes(id) || (!fresh && C.unlocked(id, plvl))) t.owned[id] = 1;
  }
  for (const id of Object.keys(t.owned)) if (!CARDS[id]) delete t.owned[id];
  for (const id of C.STARTER) t.owned[id] = 1;
  if (!t.cxp || typeof t.cxp !== 'object') t.cxp = {};
  for (const id of Object.keys(t.cxp)) { if (!CARDS[id]) delete t.cxp[id]; else t.cxp[id] = Math.max(0, Math.min(1e7, Math.floor(Number(t.cxp[id]) || 0))); }
  if (!Array.isArray(t.chests)) t.chests = [];
  t.chests = t.chests.filter((c) => c && C.CHESTS[c.type] && typeof c.id === 'string').slice(0, MAX_CHESTS);
  const seen = new Set(); const deck = [];
  for (const id of Array.isArray(t.deck) ? t.deck : []) if (CARDS[id] && t.owned[id] && !seen.has(id)) { seen.add(id); deck.push(id); }
  for (const id of C.STARTER) if (deck.length < C.DECK_SIZE && !seen.has(id)) { seen.add(id); deck.push(id); }   // doplnění na 9
  t.deck = deck.slice(0, C.DECK_SIZE);
  return t;
}
const MAX_CHESTS = 60;
// Záloha postupu podepsaná serverem: klient si ji drží v prohlížeči a po resetu serveru (smazaná data) ji pošle zpět. Nastav ARENA_SECRET v prostředí serveru.
const SECRET = process.env.ARENA_SECRET || 'arena-vezi-default-secret-change-me';
const sign = (token, data) => crypto.createHmac('sha256', SECRET).update(token + '|' + data).digest('hex');
const isFresh = (t) => !t.xp && !t.wins && !t.losses && !Object.keys(t.lv).length && !Object.keys(t.cxp).length;
function makeBackup(t, token) {
  const d = JSON.stringify({ xp: t.xp, wins: t.wins, losses: t.losses, coins: t.coins, streak: t.streak, best: t.best, lv: t.lv, owned: Object.keys(t.owned), cxp: t.cxp, chests: t.chests, deck: t.deck });
  return { d, s: sign(token, d) };
}
const newChest = (type) => ({ id: crypto.randomBytes(6).toString('hex'), type, at: now() });
const pickW = (w) => { let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; } return 0; };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
/** Jakou truhlu hráč dostane po zápase (výhra = lepší). */
function chestType(won, draw, bot) {
  const w = draw ? [55, 35, 10, 0] : won ? (bot ? [[30, 45, 20, 5], [24, 46, 24, 6], [18, 46, 28, 8], [12, 46, 32, 10]][bot - 1] : [10, 42, 36, 12]) : [70, 25, 5, 0];
  return C.CHEST_ORDER[pickW(w)];
}
/** Otevře truhlu: XP pro karty, coiny, někdy nová postava. */
function lootOf(t, type) {
  const d = C.CHESTS[type]; const rewards = [];
  const missing = C.CARD_ORDER.filter((id) => !t.owned[id]);
  if (missing.length && Math.random() < d.fresh) { const id = missing[Math.floor(Math.random() * missing.length)]; t.owned[id] = 1; rewards.push({ id, xp: rnd(d.xp[0], d.xp[1]), isNew: true }); }
  const pool = C.CARD_ORDER.filter((id) => t.owned[id] && !rewards.some((r) => r.id === id));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  for (const id of pool.slice(0, Math.max(0, d.cards - rewards.length))) rewards.push({ id, xp: rnd(d.xp[0], d.xp[1]), isNew: false });
  for (const r of rewards) t.cxp[r.id] = Math.min(1e7, (t.cxp[r.id] || 0) + r.xp);
  const coins = rnd(d.coins[0], d.coins[1]); t.coins = Math.min(1e9, t.coins + coins);
  return { type, rewards, coins };
}
const levelOfAcc = (acc) => (acc ? C.levelOf(arenaOf(acc).xp) : 1);
const dirty = () => { try { deps && deps.markDirty(); } catch { /* nic */ } };
/** Balíček hráče do zápasu: 9 × { id, lv }. */
export function deckOf(acc) {
  if (!acc) return C.STARTER.map((id) => ({ id, lv: 1 }));
  const t = arenaOf(acc); return t.deck.map((id) => ({ id, lv: t.lv[id] || 1 }));
}
function profileOf(acc, linked) {
  const t = arenaOf(acc); const lvl = C.levelOf(t.xp);
  return {
    account: true, linked: !!linked, name: acc.name, avatar: acc.avatar, coins: t.coins, streak: t.streak, best: t.best,
    arena: { xp: t.xp, lvl, from: C.xpFor(lvl), next: lvl >= C.MAX_LEVEL ? null : C.xpFor(lvl + 1), wins: t.wins, losses: t.losses, deck: [...t.deck], lv: { ...t.lv }, owned: Object.keys(t.owned), cxp: { ...t.cxp }, chests: t.chests.map((c) => ({ id: c.id, type: c.type })) },
    rewards: REWARDS,
  };
}
function identify(msg) {
  if (!deps || !msg || typeof msg.token !== 'string' || !deps.TOKEN_RE.test(msg.token)) return null;
  try { return deps.resolveAccount({ token: msg.token, session: typeof msg.session === 'string' ? msg.session : undefined, name: msg.name }); } catch { return null; }
}

/** HTTP: me (profil pro menu), deck (nastavit balíček 9 karet), upgrade (vylepšit kartu za coiny). */
export function api(action, body) {
  const bad = (status, error) => ({ status, json: { error } });
  const ident = identify(body || {});
  const withBackup = (acc, linked) => { const p = profileOf(acc, linked); if (body && typeof body.token === 'string') p.backup = makeBackup(arenaOf(acc), body.token); return p; };
  if (action === 'me') return { status: 200, json: ident ? withBackup(ident.acc, ident.linked) : { account: false, rewards: REWARDS } };
  if (!ident) return bad(401, 'Nejdřív se přihlas (účet se vytvoří sám při otevření portálu).');
  const acc = ident.acc; const t = arenaOf(acc); const plvl = C.levelOf(t.xp);
  if (action === 'deck') {
    const d = body.deck;
    if (!Array.isArray(d) || d.length !== C.DECK_SIZE) return bad(400, `Balíček musí mít přesně ${C.DECK_SIZE} karet.`);
    if (new Set(d).size !== d.length) return bad(400, 'Každá karta smí být v balíčku jen jednou.');
    for (const id of d) { if (!CARDS[id]) return bad(400, 'Neznámá karta.'); if (!t.owned[id]) return bad(403, `${CARDS[id].name} ještě nemáš (padá z truhel).`); }
    t.deck = d.map(String); dirty();
    return { status: 200, json: withBackup(acc, ident.linked) };
  }
  if (action === 'upgrade') {
    const id = String(body.id); const c = CARDS[id];
    if (!c) return bad(400, 'Neznámá karta.');
    if (!t.owned[id]) return bad(403, `${c.name} ještě nemáš (padá z truhel).`);
    const lv = t.lv[id] || 1;
    if (lv >= C.MAX_CARD_LEVEL) return bad(409, `${c.name}: už má nejvyšší úroveň.`);
    const price = C.upgradeCost(id, lv);
    const need = C.cardXpNeed(lv);
    if ((t.cxp[id] || 0) < need) return bad(402, `Chybí XP karty (${t.cxp[id] || 0}/${need}). XP padá z truhel.`);
    if (t.coins < price) return bad(402, 'Nemáš dost coinů arény.');
    t.coins -= price; t.cxp[id] -= need; t.lv[id] = lv + 1; acc.lastSeen = now(); dirty();
    return { status: 200, json: withBackup(acc, ident.linked) };
  }
  if (action === 'restore') {
    const b = body.backup;
    if (!isFresh(t)) return bad(409, 'Účet už má postup, obnova není potřeba.');
    if (!b || typeof b.d !== 'string' || typeof b.s !== 'string' || b.d.length > 200000) return bad(400, 'Neplatná záloha.');
    const good = Buffer.from(sign(body.token, b.d)); const got = Buffer.from(b.s);
    if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return bad(403, 'Záloha nesedí k tomuto účtu.');
    let d; try { d = JSON.parse(b.d); } catch { return bad(400, 'Neplatná záloha.'); }
    t.xp = d.xp; t.wins = d.wins; t.losses = d.losses; t.coins = d.coins; t.streak = d.streak; t.best = d.best; t.lv = d.lv; t.cxp = d.cxp; t.chests = d.chests; t.deck = d.deck;
    t.owned = {}; for (const id of Array.isArray(d.owned) ? d.owned : []) t.owned[id] = 1;
    arenaOf(acc); acc.lastSeen = now(); dirty();
    return { status: 200, json: withBackup(acc, ident.linked) };
  }
  if (action === 'open') {
    const i = t.chests.findIndex((c) => c.id === String(body.chest));
    if (i < 0) return { status: 200, json: { ...withBackup(acc, ident.linked), loot: null } };   // truhla už neexistuje: jen vrať aktuální sklad
    const [ch] = t.chests.splice(i, 1); const loot = lootOf(t, ch.type); acc.lastSeen = now(); dirty();
    return { status: 200, json: { ...withBackup(acc, ident.linked), loot } };
  }
  return bad(404, 'Neznámá akce.');
}

// ------------------------------------------------------------------ pomocné
function cleanName(s) {
  const t = String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return t || 'Hráč';
}
function makeCode() {
  for (let i = 0; i < 200; i++) {
    let c = ''; for (let j = 0; j < 4; j++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}
function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch { /* spojení padlo */ } } }
const live = (room) => room.players.filter((p) => p.connected && !p.bot);

// ------------------------------------------------------------------ stav pro klienty
function playerView(p) {
  const t = p.acc ? arenaOf(p.acc) : null;
  return { name: p.name, avatar: p.acc ? p.acc.avatar : null, bot: p.bot || 0, connected: p.connected, lvl: t ? C.levelOf(t.xp) : 1, account: !!p.acc };
}
function view(room, pid) {
  const you = room.players.findIndex((p) => p.id === pid);
  return {
    t: 'state', code: room.code, phase: room.phase, you, bot: room.bot || 0, quick: !!room.quick,
    players: room.players.map(playerView), result: room.result, rematch: room.players.map((p) => room.rematch.has(p.id)),
    drop: room.dropFor ? { idx: room.players.findIndex((p) => p.id === room.dropFor), left: Math.max(0, Math.round((room.dropAt - now()) / 1000)) } : null, matchId: room.matchId,
  };
}
function publish(room) { for (const p of room.players) if (p.ws) send(p.ws, view(room, p.id)); }
function bcast(room, obj, except) { for (const p of room.players) if (p.ws && p !== except) send(p.ws, obj); }
function sendSnaps(room) {
  const g = room.game; if (!g) return;
  room.players.forEach((p, i) => { if (p.ws && !p.bot) send(p.ws, G.snapFor(g, i)); });
  G.clearEvents(g);
}

// ------------------------------------------------------------------ průběh zápasu
function startMatch(room) {
  const decks = room.players.map((p) => (p.bot ? botDeck(p.bot) : deckOf(p.acc)));
  const rate = room.players.map((p) => (p.bot ? BOT_RATE[p.bot] : 1));
  room.game = G.newGame(decks, crypto.randomInt(1, 2 ** 31), { rate });
  room.thinkAt = room.players.map((p, i) => (p.bot ? 20 + i * 7 + Math.floor(Math.random() * 20) : 0));
  room.result = null; room.rematch = new Set(); room.matchId = (room.matchId || 0) + 1; room.phase = 'play'; room.lastActive = now();
  publish(room); sendSnaps(room);
}

function finish(room, r) {
  if (room.phase === 'over') return;
  room.phase = 'over';
  const g = room.game; const crowns = g ? [...g.crowns] : [0, 0];
  const out = { winner: r.winner, reason: r.reason, crowns, coins: {}, bonus: {}, streak: {}, xp: {}, noCoins: null, chest: {} };
  const humans = room.players.map((p, i) => ({ p, i })).filter((o) => !o.p.bot && o.p.acc);
  const enough = room.players.every((p, i) => p.bot || (g && g.pl[i].played >= MIN_PLAYS));
  for (const { p, i } of humans) {
    const t = arenaOf(p.acc); const won = r.winner === i; const plays = g ? g.pl[i].played : 0;
    const base = room.bot ? (won ? BOT_XP[room.bot] : 12) : (won ? 80 : 25);
    const xp = plays >= 1 ? Math.round(base + Math.min(60, plays * 2)) : 0;
    const lvl0 = C.levelOf(t.xp); t.xp += xp; out.xp[i] = { gain: xp, lvl: C.levelOf(t.xp), up: C.levelOf(t.xp) > lvl0 };
    if (r.winner >= 0 && plays >= 1) { if (won) t.wins++; else t.losses++; }
  }
  if (!enough) out.noCoins = 'Zápas byl moc krátký, coiny se neúčtují.';
  else for (const { p, i } of humans) {
    const t = arenaOf(p.acc); const won = r.winner === i; let amount;
    if (r.winner === -1) { amount = room.bot ? BOT_LOSE[room.bot] : LOSE_COINS; out.bonus[i] = 0; }   // remíza = útěcha, série se nemění
    else if (won) { t.streak++; t.best = Math.max(t.best, t.streak); const bonus = STREAK_BONUS * Math.min(t.streak - 1, STREAK_CAP); amount = (room.bot ? BOT_REWARDS[room.bot] : WIN_COINS) + bonus; out.bonus[i] = bonus; }
    else { t.streak = 0; amount = room.bot ? BOT_LOSE[room.bot] : LOSE_COINS; out.bonus[i] = 0; }
    const ct = chestType(won, r.winner === -1, room.bot); if (t.chests.length < MAX_CHESTS) t.chests.push(newChest(ct)); out.chest[i] = ct;
    t.coins = Math.min(1e9, t.coins + amount); out.coins[i] = amount; out.streak[i] = t.streak; p.acc.lastSeen = now();
  }
  dirty();
  room.result = out;
  publish(room);
}

function tickRoom(room) {
  const g = room.game; if (!g || room.phase !== 'play') return;
  room.players.forEach((p, i) => { if (p.bot && g.tick >= room.thinkAt[i]) { room.thinkAt[i] = g.tick + BOT_THINK[p.bot]; const a = botThink(g, i, p.bot); if (a) G.play(g, i, a.hi, a.x, a.y); } });
  G.step(g);
  if (g.tick % 2 === 0 || g.over) sendSnaps(room);
  if (g.over) finish(room, g.over);
}
let ticker = null;
export function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => { for (const r of rooms.values()) { try { tickRoom(r); } catch (e) { console.error('arena: chyba ticku', e); } } }, ms(C.DT * 1000));
  ticker.unref();
}
startTicker();
/** Jen pro testy: posune zápas o n tiků hned (bez čekání). */
export function advance(room, n) { for (let i = 0; i < n && room.phase === 'play'; i++) tickRoom(room); }

// ------------------------------------------------------------------ místnosti a spojení
function newRoom() {
  const code = makeCode(); if (!code) return null;
  const room = { code, players: [], nextId: 1, phase: 'lobby', quick: false, bot: 0, game: null, result: null, rematch: new Set(), emptySince: now(), matchId: 0, dropTimer: null, dropAt: null, dropFor: null, thinkAt: [0, 0] };
  rooms.set(code, room); return room;
}
function addPlayer(room, ws, msg) {
  const ident = identify(msg);
  if (ident && room.players.some((p) => p.acc === ident.acc)) return { err: 'Tenhle účet už v místnosti hraje.' };
  const base = ident && ident.linked ? ident.acc.name : (String(msg.name ?? '').trim() ? msg.name : ident ? ident.acc.name : msg.name);
  let n = cleanName(base); let k = 2;
  while (room.players.some((p) => p.name === n)) n = `${cleanName(base).slice(0, 11)} ${k++}`;
  const pl = { id: 'p' + room.nextId++, name: n, token: crypto.randomBytes(12).toString('hex'), ws, connected: true, acc: ident ? ident.acc : null, bot: 0 };
  room.players.push(pl); bind(ws, room, pl); return { pl };
}
function bind(ws, room, pl) {
  if (pl.ws && pl.ws !== ws) { pl.ws.ctx = null; try { pl.ws.close(4000, 'Přihlášení z jiného okna'); } catch { /* nic */ } }
  pl.ws = ws; pl.connected = true; ws.ctx = { code: room.code, pid: pl.id };
  if (room.dropFor === pl.id) { clearTimeout(room.dropTimer); room.dropTimer = null; room.dropAt = null; room.dropFor = null; }
  room.emptySince = null;
  send(ws, { t: 'joined', code: room.code, you: room.players.indexOf(pl), token: pl.token });
}
function destroy(room) { room.matchId++; room.phase = 'dead'; if (room.dropTimer) clearTimeout(room.dropTimer); rooms.delete(room.code); }

function leave(ws, voluntary) {
  const ctx = ws.ctx; if (!ctx) return; ws.ctx = null;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = room.players.find((p) => p.id === ctx.pid);
  if (!pl || (pl.ws && pl.ws !== ws)) return;
  pl.ws = null; pl.connected = false;
  const i = room.players.indexOf(pl);
  if (room.phase === 'lobby') { room.players = room.players.filter((p) => p !== pl); if (!room.players.length) destroy(room); else publish(room); return; }
  if (room.phase === 'play') {
    if (room.bot && voluntary) { destroy(room); return; }
    if (voluntary) { const w = 1 - i; if (room.game.pl[i].played < 1 && room.game.pl[w].played === 0) { room.players = []; destroy(room); return; } finish(room, { winner: w, reason: 'surrender' }); pl.token = null; return; }
    if (!room.dropTimer) {
      room.dropFor = pl.id; room.dropAt = now() + DROP_GRACE_MS;
      room.dropTimer = setTimeout(() => { room.dropTimer = null; room.dropAt = null; room.dropFor = null; if (!pl.connected && room.phase === 'play') finish(room, { winner: 1 - i, reason: 'drop' }); }, DROP_GRACE_MS);
      publish(room);
    }
  } else { // over
    if (room.bot) { if (voluntary) destroy(room); return; }
    if (voluntary) { pl.token = null; room.rematch.delete(pl.id); publish(room); }
  }
  if (live(room).length === 0) room.emptySince = now();
}

function handle(ws, msg) {
  if (msg.t === 'ping') return send(ws, { t: 'pong' });
  if (msg.t === 'create' || msg.t === 'join' || msg.t === 'quick' || msg.t === 'bot') {
    if (ws.ctx) return;
    let room;
    if (msg.t === 'join') {
      room = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Místnost s tímhle kódem neexistuje.' });
      if (room.phase !== 'lobby' || room.players.length >= 2) return send(ws, { t: 'err', fatal: true, msg: 'Místnost je plná nebo už hraje.' });
    } else if (msg.t === 'quick') {
      room = [...rooms.values()].find((r) => r.quick && r.phase === 'lobby' && r.players.length === 1 && r.players[0].connected);
      const ident = identify(msg);
      if (room && ident && room.players.some((p) => p.acc === ident.acc)) room = null;
      if (!room) { room = newRoom(); if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Server je plný, zkus to později.' }); room.quick = true; }
    } else {
      room = newRoom(); if (!room) return send(ws, { t: 'err', fatal: true, msg: 'Server je plný, zkus to později.' });
    }
    const r = addPlayer(room, ws, msg);
    if (r.err) { if (room.players.length === 0) destroy(room); return send(ws, { t: 'err', fatal: true, msg: r.err }); }
    const lvl = Number(msg.level);
    if (msg.t === 'bot' && BOT_REWARDS[lvl]) {
      room.bot = lvl;
      const human = r.pl;
      const bot = { id: 'bot', name: BOT_NAMES[lvl], token: null, ws: null, connected: true, acc: null, bot: lvl };
      if (Math.random() < 0.5) room.players.unshift(bot); else room.players.push(bot);   // strana je náhodná
      send(ws, { t: 'joined', code: room.code, you: room.players.indexOf(human), token: human.token });
      return startMatch(room);
    }
    if (room.players.length === 2) return startMatch(room);
    return publish(room);
  }
  if (msg.t === 'resume') {
    if (ws.ctx) return;
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const pl = room && room.players.find((p) => p.token && p.token === msg.token);
    if (!pl) return send(ws, { t: 'err', fatal: true, gone: true, msg: 'Zápas už neexistuje.' });
    bind(ws, room, pl); publish(room); if (room.phase === 'play' && room.game) send(ws, G.snapFor(room.game, room.players.indexOf(pl))); return;
  }
  const ctx = ws.ctx; if (!ctx) return;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = room.players.find((p) => p.id === ctx.pid); if (!pl) return;
  const i = room.players.indexOf(pl);
  switch (msg.t) {
    case 'play': { // x, y jsou z pohledu hráče (ty jsi dole); hráč 1 se převádí na absolutní souřadnice
      if (room.phase !== 'play' || !room.game) return;
      let x = Number(msg.x), y = Number(msg.y); if (i === 1) { x = W - x; y = H - y; }
      const err = G.play(room.game, i, Math.floor(Number(msg.hi)), x, y); if (err) send(ws, { t: 'rej', msg: err }); else { room.lastActive = now(); send(ws, { t: 'ok', hi: msg.hi }); }
      return;
    }
    case 'leave': return leave(ws, true);
    case 'rematch': {
      if (room.phase !== 'over' || room.players.length < 2) return;
      if (room.bot) return startMatch(room);
      room.rematch.add(pl.id);
      if (room.players.every((p) => room.rematch.has(p.id) && p.connected)) return startMatch(room);
      return publish(room);
    }
    default:
  }
}

const clients = new Set();
export function handleConnection(ws) {
  clients.add(ws); ws.isAlive = true; ws.ctx = null; ws.bucket = { n: 40, t: now() };
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    const t = now(); ws.bucket.n = Math.min(40, ws.bucket.n + ((t - ws.bucket.t) / 1000) * 20); ws.bucket.t = t;
    if (ws.bucket.n < 1) return; ws.bucket.n -= 1;
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { handle(ws, msg); } catch (e) { console.error('arena: chyba obsluhy', e); }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws, false); });
  ws.on('error', () => {});
}
setInterval(() => { for (const ws of clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* nic */ } } }, 25_000).unref();
setInterval(() => { for (const r of rooms.values()) if (live(r).length === 0 && r.emptySince && now() - r.emptySince > EMPTY_ROOM_MS) destroy(r); }, 15_000).unref();

export const stats = () => ({ rooms: rooms.size, clients: clients.size });
export { rooms, C, G };
