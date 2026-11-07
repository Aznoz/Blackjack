// HOPÍK – fyzika postavy a svět (stejný soubor je i v public/hopik/, test hlídá shodu). Běží na serveru (boti, kontrola) i v klientovi (pohyb vlastní postavy).
// Svět (buildWorld) se skládá ze stage a položených kusů. Všechno nebezpečné (pily, bodáky, plamenomety, kulky z děl, pojízdné plošiny) je čistá funkce
// tiku, takže každý klient i server vidí totéž bez synchronizace; stavem je jen drolení plošin (viz crumble).
import * as K from './shared.js';
const { COLS, ROWS, DT, T } = K;
export const PW = 0.7, PH = 0.9;                       // tělo postavy (šířka, výška) v políčkách
export const GRAV = 58, JUMP_V = 20.5, MAXFALL = 26, RUN = 8.2;
export const ACC_G = 85, ACC_A = 52, FR_G = 95, FR_A = 12, ACC_ICE = 12, FR_ICE = 5, TURN = 1.6;   // zrychlení a tření (země, vzduch, led)
export const COYOTE_T = 4, BUF_T = 4, SLIDE_V = 5, WJUMP_V = 18.5, WJUMP_VX = 8.5, WLOCK_T = 5, BOUNCE_V = 30, CUT = 0.45;
export const IN = { L: 1, R: 2, J: 4, D: 8 };           // bity vstupu
const EPS = 1e-4;
const FALL = -1;                                        // kód smrti pádem (ostatní smrti = vlastník pasti + 1)

// ------------------------------------------------------------------ svět
export function buildWorld(stageIdx, pieces) {
  const S = K.STAGES[K.stageIdx(stageIdx)];
  const W = { stage: S, g: new Uint8Array(COLS * ROWS), occ: new Uint8Array(COLS * ROWS), gone: new Uint8Array(COLS * ROWS), movers: [], spikes: [], saws: [], cannons: [], flames: [], grp: new Map(), crumbleAt: new Map(), groups: [], onCrumble: null, noFx: false, pieces: (pieces || []).slice() };
  for (const [x, y, w, h, t] of S.rects) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { W.g[j * COLS + i] = t; W.occ[j * COLS + i] = 1; }
  for (const p of W.pieces) addPiece(W, p);
  for (const c of W.cannons) c.life = bulletLife(W, c);
  return W;
}
/** Doplní do už postaveného světa další kus (a přepočítá dolet kulek, protože nový kus může stát v cestě). */
export function addPlaced(W, p) { W.pieces.push(p); addPiece(W, p); for (const c of W.cannons) c.life = bulletLife(W, c); }
function addPiece(W, p) {
  const P = K.PIECES[p.type]; const cells = K.pieceCells(p.type, p.r); const face = K.faceOf(p.type, p.r);
  for (const [dx, dy] of cells) { const x = p.x + dx, y = p.y + dy; if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue; W.occ[y * COLS + x] = 1; }
  if (P.kind === 'solid') {
    const gi = []; for (const [dx, dy] of cells) { const k = (p.y + dy) * COLS + p.x + dx; W.g[k] = P.tile; gi.push(k); }
    if (P.tile === T.CRUMBLE) { const id = W.groups.length; W.groups.push(gi); for (const k of gi) W.grp.set(k, id); }
  } else if (p.type === 'mover') {
    const ax = p.r % 2 === 0 ? 0 : 1;
    W.movers.push({ id: p.id, owner: p.owner, ax, cx: ax === 0 ? p.x + 4.5 : p.x + 1.5, cy: ax === 0 ? p.y + 0.5 : p.y + 4.5, phase: (p.id * 37) % K.MOVER_PERIOD });
  } else if (p.type === 'spikes') {
    for (const [dx, dy] of cells) {
      const x = p.x + dx, y = p.y + dy; let r;
      if (face === 0) r = [x + 0.15, y + 0.5, x + 0.85, y + 1]; else if (face === 2) r = [x + 0.15, y, x + 0.85, y + 0.5]; else if (face === 1) r = [x + 0.5, y + 0.15, x + 1, y + 0.85]; else r = [x, y + 0.15, x + 0.5, y + 0.85];
      W.spikes.push([r[0], r[1], r[2], r[3], p.owner]);
    }
  } else if (p.type === 'saw') {
    W.saws.push({ x: p.x + 1, y: p.y + 1, r: 0.9, owner: p.owner });
  } else if (p.type === 'cannon' || p.type === 'flame') {
    const x = p.x, y = p.y; W.g[y * COLS + x] = T.DEVICE;
    const [vx, vy] = K.DIRV[face]; const ph = (p.id * 23) % K.CANNON_PERIOD;
    if (p.type === 'cannon') W.cannons.push({ x, y, dir: face, ox: x + 0.5 + vx * 0.9, oy: y + 0.5 + vy * 0.9, vx, vy, owner: p.owner, phase: ph, life: 0, id: p.id });
    else {
      const L = K.FLAME_LEN; let r;
      if (face === 0) r = [x + 0.2, y - L, x + 0.8, y]; else if (face === 2) r = [x + 0.2, y + 1, x + 0.8, y + 1 + L]; else if (face === 1) r = [x + 1, y + 0.2, x + 1 + L, y + 0.8]; else r = [x - L, y + 0.2, x, y + 0.8];
      W.flames.push({ x, y, dir: face, rect: r, owner: p.owner, phase: (p.id * 29) % K.FLAME_PERIOD, id: p.id });
    }
  }
}
/** Jak dlouho (v ticích) kulka letí, než narazí do pevné dlaždice nebo mimo hřiště. */
function bulletLife(W, c) {
  let x = c.ox, y = c.oy, d = 0;
  for (let i = 0; i < 400; i++) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) break;
    if (W.g[cy * COLS + cx] > 0 && !(cx === c.x && cy === c.y)) break;
    x += c.vx * 0.1; y += c.vy * 0.1; d += 0.1;
  }
  return Math.max(1, Math.round(d / K.BULLET_SPEED * K.TPS));
}
export const moverOff = (m, tick) => K.MOVER_AMP * Math.sin((2 * Math.PI * (tick + m.phase)) / K.MOVER_PERIOD);
/** Obdélník pojízdné plošiny v daném ticku. */
export function moverBox(m, tick, out = [0, 0, 0, 0]) {
  const o = moverOff(m, tick); const x0 = m.cx - 1.5 + (m.ax === 0 ? o : 0), y0 = m.cy - 0.5 + (m.ax === 1 ? o : 0);
  out[0] = x0; out[1] = y0; out[2] = x0 + 3; out[3] = y0 + 1; return out;
}
export const flameOn = (f, tick) => ((tick + f.phase) % K.FLAME_PERIOD) < K.FLAME_ON;
/** Je kulka z děla `c` v ticku `tick`? Vrací polohy aktivních kulek (pole [x, y]) – pro kreslení i kolize. */
export function bulletsOf(c, tick, out = []) {
  const age0 = (tick + c.phase) % K.CANNON_PERIOD;
  for (let a = age0; a < c.life; a += K.CANNON_PERIOD) { const d = K.BULLET_SPEED * a * DT; out.push([c.ox + c.vx * d, c.oy + c.vy * d]); }
  return out;
}
/** Spustí drolení skupiny plošin (jen jednou). */
export function triggerCrumble(W, gid, tick) { if (gid == null || W.crumbleAt.has(gid) || W.groups[gid] === undefined) return false; if (W.groups[gid].every((k) => W.gone[k])) return false; W.crumbleAt.set(gid, tick); return true; }
/** Jednou za tik: propadnutí drolících se plošin. */
export function stepWorld(W, tick) { for (const [gid, t0] of W.crumbleAt) if (tick >= t0 + K.CRUMBLE_T) { for (const k of W.groups[gid]) W.gone[k] = 1; W.crumbleAt.delete(gid); } }
/** Lze položit kus? (uvnitř hřiště, mimo obsazené a zakázané oblasti) */
export function canPlace(W, type, r, x, y) {
  if (!K.PIECES[type]) return false;
  const cells = K.pieceCells(type, r);
  for (const [dx, dy] of cells) {
    const cx = x + dx, cy = y + dy; if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false;
    if (W.occ[cy * COLS + cx]) return false;
    for (const [fx, fy, fw, fh] of W.stage.forbid) if (cx >= fx && cx < fx + fw && cy >= fy && cy < fy + fh) return false;
  }
  return true;
}

// ------------------------------------------------------------------ tělo postavy
export function newBody(x, y) { return { x, y, vx: 0, vy: 0, face: 1, gr: false, coy: 0, buf: 0, jh: false, wall: 0, wlock: 0, rise: false, ice: false, stand: -1, crush: false }; }
export const copyBody = (p) => ({ ...p });

let ox0 = 0, ox1 = 0, oy0 = 0, oy1 = 0;
const mb = [0, 0, 0, 0];
/** Překrývá tělo se středem (x, y) nějakou pevnou věc? Mezní hodnoty překryvu zůstanou v ox0..oy1. */
function overlap(W, x, y, tick) {
  const x0 = x - PW / 2, x1 = x + PW / 2, y0 = y - PH / 2, y1 = y + PH / 2;
  let hit = false; ox0 = 1e9; ox1 = -1e9; oy0 = 1e9; oy1 = -1e9;
  const cx0 = Math.floor(x0), cx1 = Math.floor(x1 - 1e-6), cy0 = Math.floor(y0), cy1 = Math.floor(y1 - 1e-6);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    let solid;
    if (cx < 0 || cx >= COLS) solid = true; else if (cy < 0 || cy >= ROWS) solid = false; else { const k = cy * COLS + cx; solid = W.g[k] > 0 && !W.gone[k]; }
    if (solid) { hit = true; if (cx < ox0) ox0 = cx; if (cx + 1 > ox1) ox1 = cx + 1; if (cy < oy0) oy0 = cy; if (cy + 1 > oy1) oy1 = cy + 1; }
  }
  for (let i = 0; i < W.movers.length; i++) {
    moverBox(W.movers[i], tick, mb);
    if (x0 < mb[2] && x1 > mb[0] && y0 < mb[3] && y1 > mb[1]) { hit = true; if (mb[0] < ox0) ox0 = mb[0]; if (mb[2] > ox1) ox1 = mb[2]; if (mb[1] < oy0) oy0 = mb[1]; if (mb[3] > oy1) oy1 = mb[3]; }
  }
  return hit;
}
/** Vejde se tělo se středem (x, y) bez překrytí s pevnými věcmi? */
export const fitsAt = (W, x, y, tick) => !overlap(W, x, y, tick);
/** Smrtelný dotek: vrací 0 (nic), FALL (-1, pád) nebo vlastník pasti + 1. `shrink` zmenšuje tělo (shovívavost). */
export function hazardAt(W, x, y, tick, shrink = 0.08) {
  if (y - PH / 2 > ROWS + 0.2) return FALL;
  const x0 = x - PW / 2 + shrink, x1 = x + PW / 2 - shrink, y0 = y - PH / 2 + shrink, y1 = y + PH / 2 - shrink;
  for (const s of W.spikes) if (x0 < s[2] && x1 > s[0] && y0 < s[3] && y1 > s[1]) return s[4] + 1;
  for (const s of W.saws) { const nx = Math.max(x0, Math.min(s.x, x1)), ny = Math.max(y0, Math.min(s.y, y1)); const dx = nx - s.x, dy = ny - s.y; if (dx * dx + dy * dy < s.r * s.r) return s.owner + 1; }
  for (const f of W.flames) if (flameOn(f, tick) && x0 < f.rect[2] && x1 > f.rect[0] && y0 < f.rect[3] && y1 > f.rect[1]) return f.owner + 1;
  for (const c of W.cannons) {
    const age0 = (tick + c.phase) % K.CANNON_PERIOD;
    for (let a = age0; a < c.life; a += K.CANNON_PERIOD) {
      const d = K.BULLET_SPEED * a * DT; const bx = c.ox + c.vx * d, by = c.oy + c.vy * d;
      const nx = Math.max(x0, Math.min(bx, x1)), ny = Math.max(y0, Math.min(by, y1)); const dx = nx - bx, dy = ny - by; if (dx * dx + dy * dy < K.BULLET_R * K.BULLET_R) return c.owner + 1;
    }
  }
  return 0;
}
export function inGoal(W, p) { const [gx, gy, gw, gh] = W.stage.goal; return p.x + PW / 2 > gx && p.x - PW / 2 < gx + gw && p.y + PH / 2 > gy && p.y - PH / 2 < gy + gh; }

function moveX(W, p, dx, tick) {
  const n = Math.max(1, Math.ceil(Math.abs(dx) / 0.35)), st = dx / n;
  for (let i = 0; i < n; i++) {
    p.x += st;
    if (overlap(W, p.x, p.y, tick)) { p.x = st > 0 ? ox0 - PW / 2 - EPS : ox1 + PW / 2 + EPS; p.vx = 0; return true; }
  }
  return false;
}
function moveY(W, p, dy, tick) {
  const n = Math.max(1, Math.ceil(Math.abs(dy) / 0.35)), st = dy / n;
  for (let i = 0; i < n; i++) {
    p.y += st;
    if (overlap(W, p.x, p.y, tick)) { const down = st > 0; p.y = down ? oy0 - PH / 2 - EPS : oy1 + PH / 2 + EPS; p.vy = 0; return down ? 1 : -1; }
  }
  return 0;
}
/** Když pojízdná plošina najede do postavy, vytlačí ji; když nemá kam, je zmáčknutá. */
function depen(W, p, tick) {
  if (!overlap(W, p.x, p.y, tick)) return;
  const c = [[p.x, oy0 - PH / 2 - EPS], [p.x, oy1 + PH / 2 + EPS], [ox0 - PW / 2 - EPS, p.y], [ox1 + PW / 2 + EPS, p.y]];
  let best = null, bd = 1e9;
  for (const [x, y] of c) { const d = Math.abs(x - p.x) + Math.abs(y - p.y); if (d < bd && !overlap(W, x, y, tick)) { bd = d; best = [x, y]; } }
  if (best && bd < 1.6) { p.x = best[0]; p.y = best[1]; } else p.crush = true;
}
/** Zjistí, na čem postava stojí (zem, led, odrazovadlo, pojízdná plošina, drolící se plošina) a jestli se dotýká stěny. */
function probe(W, p, tick) {
  p.gr = false; p.ice = false; p.stand = -1; let bounce = false;
  const fy = p.y + PH / 2 + 0.05, row = Math.floor(fy), x0 = p.x - PW / 2 + 0.02, x1 = p.x + PW / 2 - 0.02;
  if (row >= 0 && row < ROWS) for (let cx = Math.floor(x0); cx <= Math.floor(x1); cx++) {
    if (cx < 0 || cx >= COLS) continue; const k = row * COLS + cx; const t = W.g[k]; if (t === 0 || W.gone[k]) continue;
    p.gr = true; if (t === T.ICE) p.ice = true; else if (t === T.BOUNCE) bounce = true;
    if (t === T.CRUMBLE && !W.noFx) { const gid = W.grp.get(k); if (triggerCrumble(W, gid, tick) && W.onCrumble) W.onCrumble(gid, tick); }
  }
  for (let i = 0; i < W.movers.length; i++) { moverBox(W.movers[i], tick, mb); if (x0 < mb[2] && x1 > mb[0] && fy >= mb[1] && fy < mb[1] + 0.3 && p.y + PH / 2 <= mb[1] + 0.12) { p.gr = true; p.stand = i; break; } }
  p.wall = 0; if (!p.gr) { if (overlap(W, p.x + 0.07, p.y, tick)) p.wall = 1; else if (overlap(W, p.x - 0.07, p.y, tick)) p.wall = -1; }
  return bounce;
}
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));

/** Jeden tik fyziky postavy. `inp` = bity IN, `tick` = tik světa, `fx` = volitelné pole, kam se zapisují události ('j' skok, 'w' odraz od stěny, 'b' odrazovadlo, 'l' dopad). */
export function stepBody(W, p, inp, tick, fx) {
  const L = inp & 1, R = inp & 2, J = inp & 4; const dir = (R ? 1 : 0) - (L ? 1 : 0);
  if (p.stand >= 0 && W.movers[p.stand]) { const m = W.movers[p.stand]; const d = moverOff(m, tick) - moverOff(m, tick - 1); if (m.ax === 0) p.x += d; else p.y += d; }
  p.crush = false; depen(W, p, tick);
  if (J && !p.jh) p.buf = BUF_T; else if (p.buf > 0) p.buf--;
  if (p.wlock > 0) p.wlock--;
  if (p.wlock === 0) {
    if (dir !== 0) { let acc = p.gr ? (p.ice ? ACC_ICE : ACC_G) : ACC_A; if (p.vx * dir < 0) acc *= TURN; p.vx = approach(p.vx, dir * RUN, acc * DT); p.face = dir; }
    else p.vx = approach(p.vx, 0, (p.gr ? (p.ice ? FR_ICE : FR_G) : FR_A) * DT);
  }
  p.vy = Math.min(MAXFALL, p.vy + GRAV * DT);
  if (!p.gr && p.wall !== 0 && dir === p.wall && p.vy > SLIDE_V) p.vy = SLIDE_V;
  if (p.gr) p.coy = COYOTE_T; else if (p.coy > 0) p.coy--;
  if (p.buf > 0) {
    if (p.coy > 0) { p.vy = -JUMP_V; p.buf = 0; p.coy = 0; p.gr = false; p.rise = true; if (fx) fx.push('j'); }
    else if (p.wall !== 0 && !p.gr) { p.vy = -WJUMP_V; p.vx = -p.wall * WJUMP_VX; p.wlock = WLOCK_T; p.face = -p.wall; p.buf = 0; p.wall = 0; p.rise = true; if (fx) fx.push('w'); }
  }
  if (!J && p.rise && p.vy < 0) { p.vy *= CUT; p.rise = false; } else if (p.vy >= 0) p.rise = false;
  p.jh = !!J;
  moveX(W, p, p.vx * DT, tick);
  const wasFalling = p.vy > 0, wasAir = !p.gr; const hit = moveY(W, p, p.vy * DT, tick);
  const bounce = probe(W, p, tick);
  if (hit === 1 && wasFalling) { if (bounce) { p.vy = -BOUNCE_V; p.gr = false; p.coy = 0; p.rise = false; if (fx) fx.push('b'); } else if (fx && wasAir) fx.push('l'); }
  if (p.x < PW / 2) p.x = PW / 2; if (p.x > COLS - PW / 2) p.x = COLS - PW / 2;
  if (p.y < -8) { p.y = -8; if (p.vy < 0) p.vy = 0; }
}
