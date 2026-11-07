// BOMBIC – simulace jednoho kola (jen server): mřížka s kameny a pařezy, 2–4 hráči, bomby s řetězením, plameny, power-upy, lebky, kopání bomb
// a náhlá smrt (kameny padají od okraje). Čistá logika bez sítě, takže ji jde testovat tik po tiku (step) a bot ji čte stejně jako hráč.
import * as K from './shared.js';
const { COLS, ROWS, T } = K;
const { idx } = K;
export const TICKS = (s) => Math.round(s / K.DT);
export const FUSE_T = TICKS(K.FUSE_S), FLAME_T = TICKS(K.FLAME_S), ROUND_T = TICKS(K.ROUND_S), SUDDEN_T = TICKS(K.SUDDEN_S), FREEZE_T = TICKS(K.FREEZE_S), CURSE_T = TICKS(K.CURSE_S), SKATE_T = TICKS(K.SKATE_S), SHOT_T = TICKS(K.SHOT_S);
const SD_EVERY = 6, SD_WARN = 12;                    // náhlá smrt: nový kámen každých 0,3 s, dopadá po 0,6 s
const HALF = 0.4, EPS = 0.0001;
export const DIRS = [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]];   // 0 stát, 1 nahoru, 2 doprava, 3 dolů, 4 doleva
const ITEM_W = [['bomb', 26], ['fire', 26], ['speed', 20], ['kick', 8], ['skull', 10], ['skate', 9], ['gskull', 4]];
const DROP_P = 0.34;

export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const inb = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const isBorder = (x, y) => x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;

/** Pořadí, v jakém padají kameny při náhlé smrti: spirála od okraje dovnitř po hratelných polích. */
function spiral() {
  const out = []; let x0 = 1, y0 = 1, x1 = COLS - 2, y1 = ROWS - 2;
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) out.push([x, y0]);
    for (let y = y0 + 1; y <= y1; y++) out.push([x1, y]);
    if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) out.push([x, y1]);
    if (x1 > x0) for (let y = y1 - 1; y > y0; y--) out.push([x0, y]);
    x0++; y0++; x1--; y1--;
  }
  return out;
}
const SPIRAL = spiral();

/** Hřiště podle mapy: vzor čtvrtiny se zrcadlí do všech rohů, pařezy se rozsévají náhodně (a taky zrcadlí, takže je to pro všechny stejné). */
export function makeGrid(rng, nPlayers, map = 0) {
  const M = K.MAPS[K.mapIdx(map)];
  const g = new Uint8Array(COLS * ROWS);
  const safe = (x, y) => K.SPAWNS.some(([sx, sy]) => Math.abs(x - sx) + Math.abs(y - sy) <= 2);
  const set = (x, y, v) => { for (const [mx, my] of [[x, y], [COLS - 1 - x, y], [x, ROWS - 1 - y], [COLS - 1 - x, ROWS - 1 - y]]) g[idx(mx, my)] = v; };
  const hx = (COLS - 1) / 2, hy = (ROWS - 1) / 2;
  for (let y = 0; y <= hy; y++) for (let x = 0; x <= hx; x++) if (M.q[y][x] === '#') set(x, y, T.STONE);
  for (let y = 1; y <= hy; y++) for (let x = 1; x <= hx; x++) {
    if (g[idx(x, y)] || safe(x, y) || M.q[y][x] !== '.') continue;
    const r = rng();
    if (r < M.stone) set(x, y, T.STONE); else if (r < M.stone + M.stump) set(x, y, T.STUMP);
  }
  void nPlayers;
  return g;
}

export function newRound(names, seed, opts = {}) {
  const rng = mulberry32(seed >>> 0);
  const n = names.length;
  const s = {
    n, tick: 0, rng, map: K.mapIdx(opts.map), grid: makeGrid(rng, n, opts.map), gridVer: 1, bombs: [], flames: [], items: [], warns: [], ev: [], over: null, endAt: 0,
    freeze: opts.noFreeze ? 0 : FREEZE_T, nextBomb: 1, sdI: 0, sdNext: ROUND_T - SUDDEN_T, pl: [],
  };
  // hráči: 2 hráči na protilehlých rozích, 3 a 4 hráči zaberou další rohy
  const order = n === 2 ? [0, 3] : [0, 1, 2, 3];
  for (let i = 0; i < n; i++) {
    const [sx, sy] = K.SPAWNS[order[i]];
    s.pl.push({ i, name: names[i], x: sx + 0.5, y: sy + 0.5, d: 0, face: 3, alive: true, bombsMax: K.START_BOMBS, range: K.START_RANGE, spLv: 0, kick: false, curse: null, placed: 0, want: false, kills: 0, diedAt: -1, autoAt: 0, moving: 0, slot: order[i], skateUntil: 0, shootAt: 0 });
  }
  return s;
}

// ------------------------------------------------------------------ pomocné dotazy
export const tileAt = (s, x, y) => (inb(x, y) ? s.grid[idx(x, y)] : T.STONE);
export function bombOcc(s, cx, cy) { for (const b of s.bombs) if ((b.cx === cx && b.cy === cy) || (b.moving && b.tx === cx && b.ty === cy)) return b; return null; }
const flameAt = (s, x, y) => s.flames.some((f) => f.x === x && f.y === y);
export const cellOf = (p) => [Math.floor(p.x), Math.floor(p.y)];
const speedNow = (p) => { let v = K.speedOf(p.spLv); if (p.curse) { if (p.curse.k === 'slow') v *= 0.5; else if (p.curse.k === 'fast') v *= 1.8; } return v; };
const rangeNow = (p) => (p.curse && p.curse.k === 'short' ? 1 : p.range);

function blockedFor(s, p, cx, cy) {
  if (!inb(cx, cy)) return true;
  const t = s.grid[idx(cx, cy)]; if (t === T.STONE || t === T.STUMP) return true;
  const b = bombOcc(s, cx, cy); return !!(b && !b.pass.has(p.i));
}
function collides(s, p, nx, ny) {
  const x0 = Math.floor(nx - HALF + EPS), x1 = Math.floor(nx + HALF - EPS), y0 = Math.floor(ny - HALF + EPS), y1 = Math.floor(ny + HALF - EPS);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (blockedFor(s, p, x, y)) return true;
  return false;
}
const overlapsCell = (p, cx, cy) => p.x + HALF > cx + EPS && p.x - HALF < cx + 1 - EPS && p.y + HALF > cy + EPS && p.y - HALF < cy + 1 - EPS;

// ------------------------------------------------------------------ pohyb hráče (po „uličkách“ mřížky: při změně směru se postava rychle srovná na střed pole)
function movePlayer(s, p) {
  const [dx, dy] = DIRS[p.d]; p.moving = 0; if (!dx && !dy) return;
  p.face = p.d; let rem = speedNow(p) * K.DT;
  const lat = dx ? 'y' : 'x';                                   // souřadnice, která musí ležet na ose uličky
  const v = p[lat], k = Math.floor(v), off = v - (k + 0.5);
  if (Math.abs(off) > EPS) {
    // srovnání do nejbližší uličky, ze které se dá jít zadaným směrem (i o pole dál: zatáčka se „předběhne“ nebo se vrátí do křižovatky)
    let best = null, bd = 9;
    for (const c of [k, k - 1, k + 1]) {
      const sx = dx ? Math.floor(p.x) + dx : c, sy = dx ? c : Math.floor(p.y) + dy; if (blockedFor(s, p, sx, sy)) continue;
      const dist = Math.abs(c + 0.5 - v); if (dist < bd - 1e-9) { bd = dist; best = c + 0.5; }
    }
    if (best === null) return;                                  // žádná ulička tím směrem: stojí
    const step = Math.min(rem, bd), sg = Math.sign(best - v); const np = v + sg * step;
    const tx = dx ? p.x : np, ty = dx ? np : p.y;
    if (collides(s, p, tx, ty)) return;
    p[lat] = step >= bd - 1e-9 ? best : np; p.moving = 1; rem -= step; if (rem <= EPS || step < bd - 1e-9) return;
  } else p[lat] = k + 0.5;
  const nx = p.x + dx * rem, ny = p.y + dy * rem;
  if (!collides(s, p, nx, ny)) { p.x = nx; p.y = ny; p.moving = 1; return; }
  if (dx) {
    const cx = Math.floor(nx + dx * HALF); const lim = dx > 0 ? cx - HALF - EPS : cx + 1 + HALF + EPS; if (dx > 0 ? lim > p.x : lim < p.x) { p.x = lim; p.moving = 1; }
    tryKick(s, p, cx, Math.floor(p.y), dx, 0);
  } else {
    const cy = Math.floor(ny + dy * HALF); const lim = dy > 0 ? cy - HALF - EPS : cy + 1 + HALF + EPS; if (dy > 0 ? lim > p.y : lim < p.y) { p.y = lim; p.moving = 1; }
    tryKick(s, p, Math.floor(p.x), cy, 0, dy);
  }
}
function tryKick(s, p, cx, cy, dx, dy) {
  if (!p.kick) return; const b = bombOcc(s, cx, cy); if (!b || b.moving || b.pass.has(p.i)) return;
  if (Math.abs(dx ? p.y - (cy + 0.5) : p.x - (cx + 0.5)) > 0.3) return;   // musí do bomby narazit zhruba středem
  const nx = b.cx + dx, ny = b.cy + dy; if (!canBombEnter(s, nx, ny)) return;
  b.moving = true; b.dx = dx; b.dy = dy; b.tx = nx; b.ty = ny; b.prog = 0; s.ev.push(['k', b.cx, b.cy]);
}
function canBombEnter(s, x, y) {
  if (!inb(x, y) || s.grid[idx(x, y)] !== T.FLOOR || bombOcc(s, x, y)) return false;
  for (const q of s.pl) if (q.alive && Math.floor(q.x) === x && Math.floor(q.y) === y) return false;
  return true;
}

// ------------------------------------------------------------------ bomby a výbuchy
function placeBomb(s, p) {
  if (!p.alive || s.freeze > 0 || s.over) return false;
  if (p.curse && p.curse.k === 'nobomb') return false;
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  if (p.placed >= p.bombsMax || s.grid[idx(cx, cy)] !== T.FLOOR || bombOcc(s, cx, cy)) return false;
  const pass = new Set(); for (const q of s.pl) if (q.alive && overlapsCell(q, cx, cy)) pass.add(q.i);
  s.bombs.push({ id: s.nextBomb++, owner: p.i, cx, cy, tx: cx, ty: cy, moving: false, dx: 0, dy: 0, prog: 0, fuse: FUSE_T, range: rangeNow(p), pass, free: false });
  p.placed++; s.ev.push(['b', cx, cy]); return true;
}
/** Skateboard: bomba vyletí z pole hráče ve směru pohledu a kloužu jako kopnutá (nepočítá se do limitu bomb). */
function shootBomb(s, p) {
  const cx = Math.floor(p.x), cy = Math.floor(p.y); const [dx, dy] = DIRS[p.face] || DIRS[3];
  if (s.grid[idx(cx, cy)] !== T.FLOOR || bombOcc(s, cx, cy)) return false;
  const nx = cx + dx, ny = cy + dy; if (!canBombEnter(s, nx, ny)) return false;
  const pass = new Set(); for (const q of s.pl) if (q.alive && overlapsCell(q, cx, cy)) pass.add(q.i);
  s.bombs.push({ id: s.nextBomb++, owner: p.i, cx, cy, tx: nx, ty: ny, moving: true, dx, dy, prog: 0, fuse: FUSE_T, range: rangeNow(p), pass, free: true });
  s.ev.push(['b', cx, cy]); return true;
}
function killPlayer(s, p, by) {
  if (!p.alive) return; p.alive = false; p.diedAt = s.tick; p.d = 0; p.moving = 0;
  if (by >= 0 && by !== p.i && s.pl[by]) s.pl[by].kills++;
  s.ev.push(['d', +p.x.toFixed(2), +p.y.toFixed(2), p.i]);
}
function pickItem(rng) { let r = rng() * ITEM_W.reduce((a, b) => a + b[1], 0); for (const [id, w] of ITEM_W) { if ((r -= w) < 0) return id; } return 'bomb'; }

/** Vybuchne bomba `b` a (řetězově) všechny, které zasáhne plamen. */
function explodeAll(s, first) {
  const queue = [first]; const stumps = []; const burned = new Set();
  while (queue.length) {
    const b = queue.shift(); const k = s.bombs.indexOf(b); if (k < 0) continue; s.bombs.splice(k, 1);
    const owner = s.pl[b.owner]; if (owner && !b.free) owner.placed = Math.max(0, owner.placed - 1);
    const cx = b.moving && b.prog >= 0.5 ? b.tx : b.cx, cy = b.moving && b.prog >= 0.5 ? b.ty : b.cy;
    const cells = [[cx, cy]];
    for (let d = 1; d <= 4; d++) {
      const [dx, dy] = DIRS[d];
      for (let r = 1; r <= b.range; r++) {
        const x = cx + dx * r, y = cy + dy * r; if (!inb(x, y)) break; const t = s.grid[idx(x, y)];
        if (t === T.STONE) break;
        cells.push([x, y]);
        if (t === T.STUMP) { stumps.push([x, y]); break; }
        const ob = bombOcc(s, x, y); if (ob && !queue.includes(ob)) { queue.push(ob); break; }
      }
    }
    for (const [x, y] of cells) {
      burned.add(idx(x, y)); const f = s.flames.find((q) => q.x === x && q.y === y);
      if (f) { f.until = s.tick + FLAME_T; f.owner = b.owner; } else s.flames.push({ x, y, until: s.tick + FLAME_T, owner: b.owner });
    }
    s.ev.push(['x', cx, cy, b.range]);
  }
  // plamen ničí položené předměty (nově odkryté z pařezů ještě ne)
  s.items = s.items.filter((it) => !burned.has(idx(it.x, it.y)));
  for (const [x, y] of stumps) {
    if (s.grid[idx(x, y)] !== T.STUMP) continue; s.grid[idx(x, y)] = T.FLOOR; s.gridVer++; s.ev.push(['s', x, y]);
    if (s.rng() < DROP_P) s.items.push({ x, y, type: pickItem(s.rng) });
  }
}

function applyItem(s, p, type) {
  if (type === 'bomb') p.bombsMax = Math.min(K.MAX_BOMBS, p.bombsMax + 1);
  else if (type === 'fire') p.range = Math.min(K.MAX_RANGE, p.range + 1);
  else if (type === 'speed') p.spLv = Math.min(K.MAX_SPEED_LV, p.spLv + 1);
  else if (type === 'kick') p.kick = true;
  else if (type === 'gskull') { for (const q of s.pl) if (q.alive && q.i !== p.i) { q.curse = { k: K.CURSES[Math.floor(s.rng() * K.CURSES.length)], until: s.tick + CURSE_T }; q.autoAt = s.tick + 8; } }
  else if (type === 'skate') { p.skateUntil = s.tick + SKATE_T; p.shootAt = s.tick + 6; }
  else if (type === 'skull') { p.curse = { k: K.CURSES[Math.floor(s.rng() * K.CURSES.length)], until: s.tick + CURSE_T }; p.autoAt = s.tick + 8; }
  s.ev.push(['i', type, p.i]);
}

function moveBombs(s) {
  for (const b of s.bombs) {
    if (!b.moving) continue;
    b.prog += 6 * K.DT;                                   // kopnutá bomba klouže 6 polí za sekundu
    while (b.moving && b.prog >= 1) {
      b.cx = b.tx; b.cy = b.ty; b.prog -= 1;
      const nx = b.cx + b.dx, ny = b.cy + b.dy;
      if (canBombEnter(s, nx, ny)) { b.tx = nx; b.ty = ny; } else { b.moving = false; b.prog = 0; b.tx = b.cx; b.ty = b.cy; }
    }
    // hráč, který se postavil do cesty, bombu zastaví
    if (b.moving && b.prog < 0.5) for (const q of s.pl) if (q.alive && Math.floor(q.x) === b.tx && Math.floor(q.y) === b.ty) { b.moving = false; b.prog = 0; b.tx = b.cx; b.ty = b.cy; break; }
  }
}

function suddenDeath(s) {
  if (s.tick >= s.sdNext && s.sdI < SPIRAL.length) {
    let c = null; while (s.sdI < SPIRAL.length) { const [x, y] = SPIRAL[s.sdI++]; if (s.grid[idx(x, y)] !== T.STONE && !s.warns.some((w) => w.x === x && w.y === y)) { c = [x, y]; break; } }
    if (c) s.warns.push({ x: c[0], y: c[1], at: s.tick + SD_WARN });
    s.sdNext = s.tick + SD_EVERY;
  }
  for (let k = s.warns.length - 1; k >= 0; k--) {
    const w = s.warns[k]; if (s.tick < w.at) continue; s.warns.splice(k, 1);
    s.grid[idx(w.x, w.y)] = T.STONE; s.gridVer++; s.ev.push(['r', w.x, w.y]);
    s.items = s.items.filter((it) => !(it.x === w.x && it.y === w.y));
    for (const b of [...s.bombs]) if (b.cx === w.x && b.cy === w.y) { s.bombs.splice(s.bombs.indexOf(b), 1); const o = s.pl[b.owner]; if (o && !b.free) o.placed = Math.max(0, o.placed - 1); }
    for (const p of s.pl) if (p.alive && Math.floor(p.x) === w.x && Math.floor(p.y) === w.y) killPlayer(s, p, -1);
  }
}

// ------------------------------------------------------------------ jeden tik
export function step(s) {
  if (s.over) return;
  s.tick++;
  if (s.freeze > 0) { s.freeze--; for (const p of s.pl) p.want = false; if (s.freeze === 0) s.ev.push(['go']); return; }
  for (const p of s.pl) {
    if (!p.alive) continue;
    if (p.curse && s.tick >= p.curse.until) p.curse = null;
    if (p.curse && p.curse.k === 'auto' && s.tick >= p.autoAt) { p.autoAt = s.tick + 12; placeBomb(s, p); }
    if (p.skateUntil && s.tick >= p.skateUntil) p.skateUntil = 0;
    if (p.skateUntil && s.tick >= p.shootAt && shootBomb(s, p)) p.shootAt = s.tick + SHOT_T;
    if (p.want) { p.want = false; placeBomb(s, p); }
    movePlayer(s, p);
  }
  for (const b of s.bombs) for (const i of [...b.pass]) { const q = s.pl[i]; if (!q || !q.alive || !overlapsCell(q, b.cx, b.cy)) b.pass.delete(i); }
  moveBombs(s);
  for (const b of s.bombs) b.fuse--;
  for (let guard = 0; guard < 40; guard++) { const b = s.bombs.find((q) => q.fuse <= 0); if (!b) break; explodeAll(s, b); }
  s.flames = s.flames.filter((f) => f.until > s.tick);
  for (const p of s.pl) {
    if (!p.alive) continue; const cx = Math.floor(p.x), cy = Math.floor(p.y);
    const f = s.flames.find((q) => q.x === cx && q.y === cy); if (f) { killPlayer(s, p, f.owner); continue; }
    const k = s.items.findIndex((it) => it.x === cx && it.y === cy); if (k >= 0) { const it = s.items.splice(k, 1)[0]; applyItem(s, p, it.type); }
  }
  if (s.tick >= ROUND_T - SUDDEN_T) suddenDeath(s);
  // konec kola: zůstal nejvýš jeden živý (krátká prodleva, ať se dohraje výbuch) nebo vypršel čas
  const alive = s.pl.filter((p) => p.alive);
  if (!s.endAt && alive.length <= (s.n >= 2 ? 1 : 0)) s.endAt = s.tick + (alive.length ? 40 : 20);
  if (s.endAt && s.tick >= s.endAt) { const a = s.pl.filter((p) => p.alive); s.over = { winner: a.length === 1 ? a[0].i : -1, reason: a.length === 1 ? 'last' : 'draw' }; }
  else if (s.tick >= ROUND_T) s.over = { winner: -1, reason: 'time' };
}

// ------------------------------------------------------------------ vstupy a snímek
export function setInput(s, i, d) { const p = s.pl[i]; if (p && Number.isInteger(d) && d >= 0 && d <= 4) p.d = p.alive ? d : 0; }
/** Hráč odešel ze hry: jeho postava zmizí (bez zásahu plamenem). */
export function forfeit(s, i) { const p = s.pl[i]; if (p && p.alive) { p.alive = false; p.diedAt = s.tick; p.d = 0; p.moving = 0; s.ev.push(['d', +p.x.toFixed(2), +p.y.toFixed(2), i]); } }
export function wantBomb(s, i) { const p = s.pl[i]; if (p && p.alive && s.freeze <= 0) p.want = true; }
const CURSE_CODE = { slow: 1, fast: 2, nobomb: 3, auto: 4, short: 5 };
const r2 = (v) => Math.round(v * 100) / 100;
export const gridStr = (s) => { let o = ''; for (let i = 0; i < s.grid.length; i++) o += s.grid[i]; return o; };
export function snap(s, withGrid) {
  const out = {
    t: 'snap', k: s.tick, tm: Math.max(0, Math.ceil((ROUND_T - s.tick) * K.DT)), fr: s.freeze, sd: s.tick >= ROUND_T - SUDDEN_T ? 1 : 0,
    p: s.pl.map((p) => [r2(p.x), r2(p.y), p.alive ? 1 : 0, p.face, p.moving, p.curse ? CURSE_CODE[p.curse.k] : 0, p.bombsMax, p.range, p.spLv, p.kick ? 1 : 0, p.placed, p.kills, p.skateUntil ? Math.ceil((p.skateUntil - s.tick) * K.DT) : 0]),
    b: s.bombs.map((b) => [b.cx, b.cy, r2(b.prog), b.dx, b.dy, Math.max(0, b.fuse), b.moving ? 1 : 0]),
    f: s.flames.map((f) => [f.x, f.y]), i: s.items.map((it) => [it.x, it.y, K.ITEMS.indexOf(it.type)]), w: s.warns.map((w) => [w.x, w.y]),
    ev: s.ev,
  };
  if (withGrid) out.g = gridStr(s);
  return out;
}
export const clearEvents = (s) => { s.ev = []; };
