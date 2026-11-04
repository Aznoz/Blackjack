// TANKOVÉ SOUBOJE – tahová dělostřelecká hra 1v1 (jako Tank Stars): zaměřování úhlu a síly, jízda s palivem, různé střely,
// bedny se střelami na poli, hra proti botovi i online (kód místnosti / rychlá hra), coiny, XP, úrovně a arzenál uložené v účtu.
// Fyziku a terén řeší physics.js (stejný soubor je i v prohlížeči), server je autoritativní: počítá výstřel a posílá klientům záznam.
// WebSocket obsluhuje hlavní server na cestě /tanks; účty, coiny a ukládání dodává server přes init().
import crypto from 'node:crypto';
import * as P from './physics.js';
const { W, WEAPONS, ORDER, COLORS, MAX_HP, FUEL_MAX, DRIVE_SPEED, SLOPE_MAX, STEP_UP, MIN_GAP, EDGE, TANK_HY, groundAt } = P;

const S = Number(process.env.TANKS_SCALE) > 0 ? Number(process.env.TANKS_SCALE) : 1;   // jen pro testy: zrychlení časovačů
const ms = (n) => Math.max(5, Math.round(n * S));
export const WIN_COINS = 900;                         // výhra online (oba hráči mají účet)
export const LOSE_COINS = 300;                        // prohra online (zůstatek neklesne pod minimum serveru)
export const BOT_REWARDS = { 1: 150, 2: 300, 3: 500 };   // výhra nad botem dané úrovně (prohra se neúčtuje)
export const BOT_NAMES = { 1: 'Bot Rekrut', 2: 'Bot Seržant', 3: 'Bot Generál' };
const BOT_XP = { 1: 40, 2: 70, 3: 110 };
const MIN_SHOTS = 2;                                  // coiny jen když každý hráč vystřelil aspoň 2×
const TURN_MS = ms(45_000);                           // čas na tah
const DROP_GRACE_MS = Number(process.env.TANKS_DROP_MS) || 60_000;
const MAX_IDLE_TURNS = 3;                             // tolikrát za sebou propásnutý tah = prohra
const EMPTY_ROOM_MS = 120_000;
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';
const MAX_CRATES = 4;

const rooms = new Map();
const now = () => Date.now();
let deps = null;
export function init(d) { deps = d; }

// ------------------------------------------------------------------ účet: postup
export function tankOf(acc) {
  let t = acc.tank;
  if (!t || typeof t !== 'object') t = acc.tank = {};
  t.xp = Math.max(0, Math.min(1e7, Math.floor(Number(t.xp) || 0)));
  t.wins = Math.max(0, Math.floor(Number(t.wins) || 0)); t.losses = Math.max(0, Math.floor(Number(t.losses) || 0));
  t.color = Number.isInteger(t.color) && t.color >= 0 && t.color < COLORS.length ? t.color : 0;
  if (!t.ammo || typeof t.ammo !== 'object') t.ammo = {};
  for (const id of Object.keys(t.ammo)) { const w = WEAPONS[id]; if (!w || w.inf) { delete t.ammo[id]; continue; } if (t.ammo[id] > w.max) { t.ammo[id] = w.max; } } // starší účty s víc kusy než dnešní strop se srazí na max
  return t;
}
const owned = (acc, w) => (acc ? (tankOf(acc).ammo[w] | 0) : 0);
const levelOfAcc = (acc) => (acc ? P.levelOf(tankOf(acc).xp) : 1);
const dirty = () => { try { deps && deps.markDirty(); } catch { /* nic */ } };
const notify = (acc) => { try { deps && deps.notifyBalance(acc); } catch { /* nic */ } };

function profileOf(acc, linked) {
  const t = tankOf(acc); const lvl = P.levelOf(t.xp);
  return {
    account: true, linked: !!linked, name: acc.name, avatar: acc.avatar, balance: acc.balance,
    tank: { xp: t.xp, lvl, from: P.xpFor(lvl), next: lvl >= P.MAX_LEVEL ? null : P.xpFor(lvl + 1), wins: t.wins, losses: t.losses, color: t.color, ammo: { ...t.ammo } },
    win: WIN_COINS, lose: LOSE_COINS, botRewards: BOT_REWARDS,
  };
}
function identify(msg) {
  if (!deps || !msg || typeof msg.token !== 'string' || !deps.TOKEN_RE.test(msg.token)) return null;
  try { return deps.resolveAccount({ token: msg.token, session: typeof msg.session === 'string' ? msg.session : undefined, name: msg.name }); } catch { return null; }
}

/** HTTP: me (profil pro menu), buy (koupit balíček střel), color (vybrat barvu tanku). */
export function api(action, body) {
  const bad = (status, error) => ({ status, json: { error } });
  const ident = identify(body || {});
  if (action === 'me') return { status: 200, json: ident ? profileOf(ident.acc, ident.linked) : { account: false, win: WIN_COINS, lose: LOSE_COINS, botRewards: BOT_REWARDS } };
  if (!ident) return bad(401, 'Nejdřív se přihlas (účet se vytvoří sám při otevření portálu).');
  const acc = ident.acc; const t = tankOf(acc);
  if (action === 'buy') {
    const w = WEAPONS[String(body.id)];
    if (!w || !w.price) return bad(400, 'Tohle se nedá koupit.');
    if (levelOfAcc(acc) < w.lvl) return bad(403, `Odemkne se na úrovni ${w.lvl}.`);
    if ((t.ammo[w.id] | 0) + w.pack > w.max) return bad(409, `${w.name}: u sebe smíš mít nejvíc ${w.max} ks.`);
    if (acc.balance < w.price) return bad(402, 'Nemáš dost coinů.');
    acc.balance -= w.price; t.ammo[w.id] = (t.ammo[w.id] | 0) + w.pack; acc.lastSeen = now();
    dirty(); notify(acc);
    return { status: 200, json: profileOf(acc, ident.linked) };
  }
  if (action === 'color') {
    const c = Math.floor(Number(body.c));
    if (!(c >= 0 && c < COLORS.length)) return bad(400, 'Neznámá barva.');
    if (levelOfAcc(acc) < COLORS[c].lvl) return bad(403, `Odemkne se na úrovni ${COLORS[c].lvl}.`);
    t.color = c; dirty();
    return { status: 200, json: profileOf(acc, ident.linked) };
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
const idxOf = (room, pl) => room.players.indexOf(pl);
const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Dostupná munice hráče v zápase: koupená (v účtu) + ze sebraných beden (jen tahle hra). */
function ammoOf(room, i) {
  const pl = room.players[i]; const tk = room.tanks[i]; const out = { std: 1 };
  if (pl.bot) { for (const [k, v] of Object.entries(tk.crate)) if (v > 0) out[k] = v; return out; }
  const keys = new Set([...Object.keys(tk.crate), ...(pl.acc ? Object.keys(tankOf(pl.acc).ammo) : [])]);
  for (const k of keys) { const n = (tk.crate[k] | 0) + owned(pl.acc, k); if (n > 0 && WEAPONS[k] && !WEAPONS[k].inf) out[k] = n; }
  return out;
}
function takeAmmo(room, i, w) { // vrátí true a odečte (nejdřív ze beden)
  const pl = room.players[i]; const tk = room.tanks[i];
  if (WEAPONS[w].inf) return true;
  if ((tk.crate[w] | 0) > 0) { tk.crate[w]--; return true; }
  if (pl.bot) return false;
  if (pl.acc && owned(pl.acc, w) > 0) { const t = tankOf(pl.acc); t.ammo[w]--; if (t.ammo[w] <= 0) delete t.ammo[w]; dirty(); return true; }
  return false;
}

// ------------------------------------------------------------------ stav pro klienty
/** Barvy tanků: vlastní z účtu; když by byly obě stejné (nebo bot), druhý hráč dostane jinou. */
function colorsOf(room) {
  const c = room.players.map((p, i) => (p.bot ? -1 : p.acc ? tankOf(p.acc).color : i % COLORS.length));
  if (c.length < 2) return c;
  if (c[0] < 0) c[0] = c[1] === 1 ? 0 : 1; if (c[1] < 0) c[1] = c[0] === 1 ? 0 : 1;
  if (c[0] === c[1]) c[1] = c[0] === 1 ? 0 : 1;
  return c;
}
function playerView(room, p, i) {
  const t = p.acc ? tankOf(p.acc) : null; const cl = colorsOf(room);
  return { name: p.name, avatar: p.acc ? p.acc.avatar : null, bot: p.bot || 0, connected: p.connected, lvl: t ? P.levelOf(t.xp) : 1, color: cl[i] >= 0 ? cl[i] : 0, account: !!p.acc };
}
function view(room, pid) {
  const you = room.players.findIndex((p) => p.id === pid);
  return {
    t: 'state', code: room.code, phase: room.phase, you, hostIdx: 0, bot: room.bot || 0, quick: !!room.quick,
    players: room.players.map((p, i) => playerView(room, p, i)),
    hp: room.tanks.map((k) => k.hp), x: room.tanks.map((k) => r1(k.x)), fuel: room.tanks.map((k) => Math.round(k.fuel)),
    turn: room.turn, turnNo: room.turnNo, turnMs: room.phase === 'play' && room.turnEnd ? Math.max(0, room.turnEnd - now()) : 0, turnTotal: TURN_MS,
    wind: room.wind, crates: room.crates.map((c) => ({ id: c.id, x: c.x })), ammo: you >= 0 && room.tanks[you] ? ammoOf(room, you) : {}, lock: you >= 0 && room.tanks[you] ? { ...room.tanks[you].lock } : {},
    th: P.checksum(room.h), shots: room.tanks.map((k) => k.shots), result: room.result || null, rematch: [...room.rematch],
    dropIn: room.dropAt ? Math.max(0, room.dropAt - now()) : null, dropFor: room.dropFor, at: now(),
    win: WIN_COINS, lose: LOSE_COINS, botRewards: BOT_REWARDS,
  };
}
function publish(room) { for (const p of room.players) if (p.ws) send(p.ws, view(room, p.id)); }
function bcast(room, obj, except) { for (const p of room.players) if (p.ws && p !== except) send(p.ws, obj); }
function sendTerrain(room, ws) { send(ws, { t: 'terrain', h: Array.from(room.h), th: P.checksum(room.h) }); }

// ------------------------------------------------------------------ průběh zápasu
function clearTimers(room) { for (const k of ['turnT', 'resolveT', 'botT', 'driveT']) { if (room[k]) clearTimeout(room[k]); room[k] = null; } if (room.driveI) { clearInterval(room.driveI); room.driveI = null; } }

function startMatch(room) {
  clearTimers(room);
  room.seed = crypto.randomInt(1, 2 ** 31);
  room.h = P.genTerrain(room.seed);
  const xl = 190 + Math.round(Math.random() * 40), xr = W - 190 - Math.round(Math.random() * 40);
  room.tanks = [xl, xr].map((x) => ({ x, hp: MAX_HP, fuel: FUEL_MAX, crate: {}, lock: {}, fuelNext: 0, shots: 0, dmg: 0, idle: 0 }));
  room.crates = []; room.crateSeq = 0;
  for (let i = 0; i < 2; i++) spawnCrate(room);
  room.wind = Math.round((Math.random() * 2 - 1) * 6);
  room.turn = Math.random() < 0.5 ? 0 : 1; room.turnNo = 0; room.result = null; room.rematch = new Set();
  room.phase = 'play'; room.matchId = (room.matchId || 0) + 1; room.driveDir = 0; room.lastActive = now();
  for (const p of room.players) if (p.ws) sendTerrain(room, p.ws);
  beginTurn(room, true);
}

function pickCrateKind() {
  const t = [['big', 18], ['triple', 16], ['bounce', 13], ['roller', 12], ['cluster', 11], ['sniper', 11], ['repair', 9], ['five', 8], ['mega', 7], ['napalm', 7], ['airstrike', 5], ['bounce4', 4], ['megacluster', 3], ['repair2', 4], ['nuke', 3], ['doom', 1]];
  let r = Math.random() * t.reduce((a, b) => a + b[1], 0);
  for (const [k, w] of t) { r -= w; if (r < 0) return k; }
  return 'big';
}
function spawnCrate(room) {
  for (let tries = 0; tries < 40; tries++) {
    const x = Math.round(260 + Math.random() * (W - 520));
    if (room.tanks.some((k) => Math.abs(k.x - x) < 130) || room.crates.some((c) => Math.abs(c.x - x) < 120)) continue;
    const c = { id: ++room.crateSeq, x, kind: pickCrateKind() };
    room.crates.push(c); return c;
  }
  return null;
}

function beginTurn(room, first) {
  clearTimers(room);
  if (!first) { room.turn = 1 - room.turn; room.wind = clamp(room.wind + Math.round((Math.random() * 2 - 1) * 4), -8, 8); }
  room.turnNo++; room.driveDir = 0;
  const cur = room.tanks[room.turn];
  for (const k of Object.keys(cur.lock)) { if (--cur.lock[k] <= 0) delete cur.lock[k]; }   // nabíjení zbraní se odpočítává po vlastních tazích
  const pen = cur.fuelNext; cur.fuelNext = 0; cur.fuel = Math.round(FUEL_MAX * (1 - pen));
  const added = [];
  if (room.turnNo % 2 === 0 && room.crates.length < MAX_CRATES && Math.random() < 0.75) { const c = spawnCrate(room); if (c) added.push({ id: c.id, x: c.x }); }
  room.turnEnd = now() + TURN_MS; room.phase = 'play';
  room.turnT = setTimeout(() => onTimeout(room), TURN_MS);
  publish(room);
  if (pen > 0 && room.players[room.turn].ws) send(room.players[room.turn].ws, { t: 'note', msg: `Zpětný ráz: palivo −${Math.round(pen * 100)} %` });
  for (const c of added) bcast(room, { t: 'crate', op: 'spawn', id: c.id, x: c.x });
  if (room.players[room.turn].bot) botTurn(room);
}

function onTimeout(room) {
  if (room.phase !== 'play') return;
  const tk = room.tanks[room.turn]; tk.idle++;
  stopDrive(room);
  if (tk.idle >= MAX_IDLE_TURNS) return finish(room, { winner: 1 - room.turn, reason: `${room.players[room.turn].name} dlouho nehrál`, abandon: true });
  bcast(room, { t: 'note', msg: `${room.players[room.turn].name} nestihl tah.` });
  beginTurn(room, false);
}

// --- jízda: klient posílá jen směr (−1 / 0 / 1), server po 50 ms posouvá tank a hlídá palivo, svahy, soupeře a okraje
function setDrive(room, i, d) {
  if (room.phase !== 'play' || room.turn !== i) return;
  room.driveDir = d;
  if (d && !room.driveI) room.driveI = setInterval(() => driveTick(room), 50);
  if (!d) stopDrive(room);
}
function stopDrive(room) { room.driveDir = 0; if (room.driveI) { clearInterval(room.driveI); room.driveI = null; } }
function driveTick(room) {
  if (room.phase !== 'play') return stopDrive(room);
  const i = room.turn, tk = room.tanks[i], other = room.tanks[1 - i], d = room.driveDir;
  if (!d) return stopDrive(room);
  const step = DRIVE_SPEED * 0.05; let nx = tk.x + d * step;
  const dy = groundAt(room.h, nx) - groundAt(room.h, tk.x);       // kladné = z kopce (tank sjede libovolně), záporné = do kopce
  const ok = tk.fuel >= step * 0.5 && nx >= EDGE && nx <= W - EDGE && Math.abs(nx - other.x) >= MIN_GAP && -dy <= Math.max(SLOPE_MAX * step, STEP_UP);
  if (!ok && !room.players[i].bot && tk.fuel >= step * 0.5) return;   // člověk drží tlačítko: překážka ho jen zdrží, nic se nespotřebuje
  if (!ok) { stopDrive(room); bcast(room, { t: 'mv', i, x: r1(tk.x), f: Math.round(tk.fuel), stop: 1 }); if (room.onDriveEnd) { const f = room.onDriveEnd; room.onDriveEnd = null; f(); } return; }
  tk.x = nx; tk.fuel = Math.max(0, tk.fuel - step); tk.idle = 0;
  const got = [];
  for (let k = room.crates.length - 1; k >= 0; k--) {
    const c = room.crates[k];
    if (Math.abs(c.x - tk.x) < 30) {
      const wp = WEAPONS[c.kind]; const have = (tk.crate[c.kind] | 0) + owned(room.players[i].acc, c.kind);
      const n = Math.min(wp.max - have, (wp.pack || 2) <= 1 ? 1 : 1 + (Math.random() < 0.45 ? 1 : 0));   // víc, než uneseš, se nesebere
      if (n <= 0) { if (!tk.full) tk.full = new Set(); if (!tk.full.has(c.id)) { tk.full.add(c.id); const w = room.players[i].ws; if (w) send(w, { t: 'note', msg: `${wp.name}: u sebe smíš mít nejvíc ${wp.max} ks, bedna zůstává.` }); } continue; }
      room.crates.splice(k, 1);
      tk.crate[c.kind] = (tk.crate[c.kind] | 0) + n; got.push({ id: c.id, w: c.kind, n });
    }
  }
  bcast(room, { t: 'mv', i, x: r1(tk.x), f: Math.round(tk.fuel) });
  for (const g of got) { bcast(room, { t: 'crate', op: 'pick', id: g.id, i, w: g.w, n: g.n }); }
  if (got.length) { for (const p of room.players) if (p.ws) send(p.ws, { t: 'ammo', ammo: ammoOf(room, room.players.indexOf(p)) }); }
  if (tk.fuel <= 0.5) { stopDrive(room); if (room.onDriveEnd) { const f = room.onDriveEnd; room.onDriveEnd = null; f(); } }
}

// --- výstřel
function doFire(room, i, a, pw, wid) {
  if (room.phase !== 'play' || room.turn !== i) return 'Teď nejsi na tahu.';
  const wp = WEAPONS[wid]; if (!wp) return 'Neznámá zbraň.';
  const tk = room.tanks[i];
  if (!Number.isFinite(a) || !Number.isFinite(pw)) return 'Špatné zaměření.';
  a = clamp(a, 0, 180); pw = clamp(pw, 8, 100);
  if ((tk.lock[wid] | 0) > 0) return 'Tahle zbraň se ještě nabíjí.';
  if (!takeAmmo(room, i, wid)) return 'Tuhle munici nemáš.';
  stopDrive(room); clearTimers(room);
  tk.idle = 0;
  if (wp.fuelPen) tk.fuelNext = Math.max(tk.fuelNext, wp.fuelPen);   // nevýhody zbraní (viz physics.js consOf)
  if (wp.cd) tk.lock[wid] = wp.cd + 1;
  if (wp.util === 'heal') { // oprava: vyléčí a ukončí tah
    tk.hp = Math.min(MAX_HP, tk.hp + wp.heal);
    bcast(room, { t: 'heal', i, hp: tk.hp, amount: wp.heal });
    room.phase = 'resolve'; room.resolveT = setTimeout(() => afterShot(room), ms(1200));
    publish(room); return null;
  }
  tk.shots++;
  const hpBefore = room.tanks.map((k) => k.hp);
  let self = 0; if (wp.selfDmg) { self = Math.min(wp.selfDmg, Math.max(0, tk.hp - 1)); tk.hp -= self; }   // výstřel nikdy nezabije střelce
  const res = P.simulate({ h: room.h, tanks: room.tanks, wind: room.wind, crates: room.crates }, i, a, pw, wid);
  tk.dmg += res.dmg[1 - i] | 0;
  room.phase = 'resolve';
  const hp = room.tanks.map((k) => k.hp);
  bcast(room, { t: 'shot', by: i, w: wid, a: r1(a), p: Math.round(pw), wind: room.wind, paths: res.paths, ex: res.ex, dur: res.dur, hp, hpBefore, self, th: P.checksum(room.h) });
  room.resolveT = setTimeout(() => afterShot(room), ms(res.dur + 1600));
  return null;
}
function afterShot(room) {
  if (room.phase !== 'resolve') return;
  const dead = room.tanks.map((k) => k.hp <= 0);
  if (dead[0] && dead[1]) return finish(room, { winner: null, reason: 'Oba tanky jsou zničené' });
  if (dead[0] || dead[1]) { const w = dead[0] ? 1 : 0; return finish(room, { winner: w, reason: `${room.players[1 - w].name} byl zničen` }); }
  beginTurn(room, false);
}

// --- konec zápasu, coiny a XP
function finish(room, r) {
  if (room.phase === 'over') return;
  clearTimers(room);
  room.phase = 'over';
  const out = { winner: r.winner, reason: r.reason, coins: {}, xp: {}, noCoins: null };
  const enough = room.tanks.every((k, i) => room.players[i].bot || k.shots >= MIN_SHOTS);
  const humans = room.players.map((p, i) => ({ p, i })).filter((o) => !o.p.bot && o.p.acc);
  for (const { p, i } of humans) {
    const t = tankOf(p.acc); const won = r.winner === i; const tk = room.tanks[i];
    const base = room.bot ? (won ? BOT_XP[room.bot] : 15) : (won ? 110 : 35);
    const xp = tk.shots >= 1 ? Math.round(base + Math.min(120, tk.dmg / 2)) : 0;
    const lvl0 = P.levelOf(t.xp); t.xp += xp; out.xp[i] = { gain: xp, lvl: P.levelOf(t.xp), up: P.levelOf(t.xp) > lvl0 };
    if (r.winner != null && tk.shots >= 1) { if (won) t.wins++; else t.losses++; }
  }
  if (r.winner != null) {
    if (!enough) out.noCoins = 'Zápas byl moc krátký, coiny se neúčtují.';
    else if (room.bot) {
      const wi = r.winner; const w = room.players[wi];
      if (!w.bot && w.acc) { const before = w.acc.balance; w.acc.balance += BOT_REWARDS[room.bot]; out.coins[wi] = w.acc.balance - before; w.acc.lastSeen = now(); notify(w.acc); }
    } else if (room.players.every((p) => p.acc)) {
      const w = room.players[r.winner].acc, l = room.players[1 - r.winner].acc;
      const wb = w.balance, lb = l.balance; w.balance = wb + WIN_COINS; l.balance = Math.max(deps ? deps.FLOOR : 0, lb - LOSE_COINS);
      out.coins[r.winner] = w.balance - wb; out.coins[1 - r.winner] = l.balance - lb; notify(w); notify(l);
    }
  }
  dirty();
  room.result = out;
  publish(room);
}

// ------------------------------------------------------------------ bot
function botWeapons(room, bi) {
  const a = ammoOf(room, bi); const list = ['std'];
  const lk = room.tanks[bi].lock; const specials = Object.keys(a).filter((k) => k !== 'std' && a[k] > 0 && !WEAPONS[k].util && !(lk[k] > 0));
  for (let n = 0; n < 2 && specials.length; n++) list.push(specials.splice(Math.floor(Math.random() * specials.length), 1)[0]);
  return list;
}
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
function botPlan(room, bi) {
  const lvl = room.bot, ei = 1 - bi;
  const me = room.tanks[bi], en = room.tanks[ei];
  const env = { h: room.h, tanks: room.tanks, wind: room.wind };
  const weapons = botWeapons(room, bi);
  let best = null;
  const evalShot = (a, pw, w) => {
    const r = P.simulate(env, bi, a, pw, w, { dry: true });
    let dist = 1e9; for (const e of r.ex) dist = Math.min(dist, Math.hypot(e.x - en.x, e.y - (groundAt(room.h, en.x) - TANK_HY)));
    const score = Math.min(r.dmg[ei], en.hp + 10) * 1.0 - r.dmg[bi] * 2.2 - (WEAPONS[w].selfDmg || 0) * 1.3 - (WEAPONS[w].fuelPen || 0) * 6 - Math.min(dist, 900) * 0.04 + (w === 'std' ? 4 : 0) + (r.dmg[ei] >= en.hp ? 60 : 0);
    return { a, pw, w, score, dmg: r.dmg[ei], self: r.dmg[bi] };
  };
  for (const w of weapons) {
    for (let a = 8; a <= 172; a += 4) for (let pw = 24; pw <= 100; pw += 5) { const c = evalShot(a, pw, w); if (!best || c.score > best.score) best = c; }
  }
  if (best && lvl >= 2) { // doladění kolem nejlepšího výstřelu
    const b0 = best;
    for (let a = b0.a - 4; a <= b0.a + 4; a += 1) for (let pw = b0.pw - 5; pw <= b0.pw + 5; pw += 1) { if (a < 0 || a > 180 || pw < 8 || pw > 100) continue; const c = evalShot(a, pw, b0.w); if (c.score > best.score) best = c; }
  }
  const sig = lvl === 1 ? [8, 9] : lvl === 2 ? [3.2, 4] : [1.1, 1.3];
  return { a: clamp(best.a + gauss() * sig[0], 2, 178), pw: clamp(best.pw + gauss() * sig[1], 10, 100), w: best.w };
}
function botTurn(room) {
  const bi = room.turn, mid = room.matchId;
  const lvl = room.bot; const tk = room.tanks[bi];
  const act = () => room.matchId === mid && room.phase === 'play' && room.turn === bi;
  const aimAndFire = () => {
    if (!act()) return;
    let plan; try { plan = botPlan(room, bi); } catch (e) { console.error('tanks: bot', e); plan = { a: bi === 0 ? 50 : 130, pw: 60, w: 'std' }; }
    // zdraví: když je málo životů a má opravu, použije ji
    const am = ammoOf(room, bi);
    const rep = am.repair2 ? 'repair2' : am.repair ? 'repair' : null;
    if (rep && tk.hp <= 45 && lvl >= 2) { plan = { a: 90, pw: 50, w: rep }; }
    room.botT = setTimeout(() => { if (!act()) return; const err = doFire(room, bi, plan.a, plan.pw, plan.w); if (err) doFire(room, bi, plan.a, plan.pw, 'std'); }, ms(600 + Math.random() * 700));
  };
  // nejdřív případně popojede k bedně (úroveň 2+), pak zamíří a vystřelí
  room.botT = setTimeout(() => {
    if (!act()) return;
    let target = null;
    if (lvl >= 2 || Math.random() < 0.3) {
      let bd = 1e9;
      for (const c of room.crates) { const d = Math.abs(c.x - tk.x); const en = room.tanks[1 - bi]; if (d < bd && d <= tk.fuel * 0.9 && (c.x - en.x) * (tk.x - en.x) > 0 && Math.abs(c.x - en.x) > MIN_GAP + 10) { bd = d; target = c; } }
    }
    if (!target) return aimAndFire();
    const dir = Math.sign(target.x - tk.x) || 1; const tid = target.id;
    room.onDriveEnd = () => { if (act()) room.botT = setTimeout(aimAndFire, ms(500)); };
    setDrive(room, bi, dir);
    // jede, dokud nesebere bednu (nebo nedojde palivo / nenarazí); pojistka časem
    const check = setInterval(() => {
      if (!act()) { clearInterval(check); return; }
      if (!room.crates.some((c) => c.id === tid) || Math.sign(target.x - tk.x) !== dir) { clearInterval(check); if (room.onDriveEnd) { const f = room.onDriveEnd; room.onDriveEnd = null; stopDrive(room); f(); } }
    }, 60);
    room.botT2 = setTimeout(() => { clearInterval(check); if (room.onDriveEnd) { const f = room.onDriveEnd; room.onDriveEnd = null; stopDrive(room); f(); } }, ms(7000));
  }, ms(1100 + Math.random() * 900));
}

// ------------------------------------------------------------------ místnosti a spojení
function newRoom() {
  const code = makeCode(); if (!code) return null;
  const room = {
    code, players: [], nextId: 1, phase: 'lobby', quick: false, bot: 0, h: new Int16Array(W), tanks: [{ x: 200, hp: MAX_HP, fuel: 0, crate: {}, lock: {}, fuelNext: 0, shots: 0, dmg: 0, idle: 0 }, { x: W - 200, hp: MAX_HP, fuel: 0, crate: {}, shots: 0, dmg: 0, idle: 0 }],
    crates: [], crateSeq: 0, wind: 0, turn: 0, turnNo: 0, turnEnd: 0, result: null, rematch: new Set(), emptySince: now(), matchId: 0, driveDir: 0,
    dropTimer: null, dropAt: null, dropFor: null,
  };
  rooms.set(code, room); return room;
}
function addPlayer(room, ws, msg, bot) {
  const ident = bot ? null : identify(msg);
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
  if (pl.dropTimer) { clearTimeout(pl.dropTimer); pl.dropTimer = null; }
  if (room.dropFor === pl.id) { clearTimeout(room.dropTimer); room.dropTimer = null; room.dropAt = null; room.dropFor = null; }
  room.emptySince = null;
  send(ws, { t: 'joined', code: room.code, you: room.players.indexOf(pl), token: pl.token });
}
function destroy(room) { room.matchId++; clearTimers(room); if (room.botT2) clearTimeout(room.botT2); if (room.dropTimer) clearTimeout(room.dropTimer); rooms.delete(room.code); }

function leave(ws, voluntary) {
  const ctx = ws.ctx; if (!ctx) return; ws.ctx = null;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = room.players.find((p) => p.id === ctx.pid);
  if (!pl || (pl.ws && pl.ws !== ws)) return;
  pl.ws = null; pl.connected = false;
  const i = room.players.indexOf(pl);
  if (room.phase === 'lobby') { room.players = room.players.filter((p) => p !== pl); if (!room.players.length) destroy(room); else publish(room); return; }
  if (room.phase === 'play' || room.phase === 'resolve') {
    if (room.bot && voluntary) { destroy(room); return; }
    if (voluntary) { const w = 1 - i; const enoughShots = room.tanks[i].shots >= 1; if (!enoughShots && room.tanks[w].shots === 0) { room.players = []; destroy(room); return; } finish(room, { winner: w, reason: `${pl.name} se vzdal` }); pl.token = null; return; }
    if (!room.dropTimer) {
      room.dropFor = pl.id; room.dropAt = now() + DROP_GRACE_MS;
      room.dropTimer = setTimeout(() => { room.dropTimer = null; room.dropAt = null; room.dropFor = null; if (!pl.connected && (room.phase === 'play' || room.phase === 'resolve')) finish(room, { winner: 1 - i, reason: `${pl.name} se odpojil`, abandon: true }); }, DROP_GRACE_MS);
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
    bind(ws, room, pl); if (room.phase !== 'lobby') sendTerrain(room, ws); return publish(room);
  }
  const ctx = ws.ctx; if (!ctx) return;
  const room = rooms.get(ctx.code); if (!room) return;
  const pl = room.players.find((p) => p.id === ctx.pid); if (!pl) return;
  const i = room.players.indexOf(pl);
  switch (msg.t) {
    case 'drive': { const d = Number(msg.d) > 0 ? 1 : Number(msg.d) < 0 ? -1 : 0; setDrive(room, i, d); return; }
    case 'aim': { if (room.phase === 'play' && room.turn === i) bcast(room, { t: 'aim', i, a: Number(msg.a) || 0, p: Number(msg.p) || 0, w: String(msg.w || 'std').slice(0, 10) }, pl); return; }
    case 'fire': { const err = doFire(room, i, Number(msg.a), Number(msg.p), String(msg.w || 'std')); if (err) send(ws, { t: 'rej', msg: err }); return; }
    case 'sync': return sendTerrain(room, ws);
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
    try { handle(ws, msg); } catch (e) { console.error('tanks: chyba obsluhy', e); }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws, false); });
  ws.on('error', () => {});
}
setInterval(() => { for (const ws of clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* nic */ } } }, 25_000).unref();
setInterval(() => { for (const r of rooms.values()) if (live(r).length === 0 && r.emptySince && now() - r.emptySince > EMPTY_ROOM_MS) destroy(r); }, 15_000).unref();

export const stats = () => ({ rooms: rooms.size, clients: clients.size });
export { rooms, P };
