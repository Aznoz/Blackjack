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
  const W = { stage: S, g: new Uint8Array(COLS * ROWS), occ: new Uint8Array(COLS * ROWS), gone: new Uint8Array(COLS * ROWS), sp: new Uint8Array(COLS * ROWS), hasSp: false, movers: [], spikes: [], saws: [], cannons: [], flames: [], blades: [], pends: [], thwomps: [], lasers: [], rsaws: [], fans: [], rspikes: [], icicles: [], bumpers: [], vanish: [], holes: [], boulders: [], grp: new Map(), crumbleAt: new Map(), groups: [], onCrumble: null, noFx: false, pieces: (pieces || []).slice() };
  for (const [x, y, w, h, t] of S.rects) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { W.g[j * COLS + i] = t; W.occ[j * COLS + i] = 1; }
  for (const p of W.pieces) addPiece(W, p);
  refreshBeams(W);
  return W;
}
/** Doplní do už postaveného světa další kus (a přepočítá dolet kulek, protože nový kus může stát v cestě). */
export function addPlaced(W, p) { W.pieces.push(p); addPiece(W, p); refreshBeams(W); }
/** Dolet kulek, paprsků a větru závisí na pevných věcech v cestě, takže se po každém novém kusu přepočítá. */
function refreshBeams(W) {
  for (const c of W.cannons) c.life = bulletLife(W, c);
  for (const l of W.lasers) { l.len = freeRun(W, l.sx, l.sy, l.vx, l.vy, 60, l.x, l.y); setBeamRect(l, l.len, K.LASER_R); }
  for (const c of W.icicles) c.len = Math.max(0, freeRun(W, c.x + 0.5, c.y + 1, 0, 1, 16, c.x, c.y) - K.ICICLE.len);
  for (const f of W.fans) { f.len = freeRun(W, f.sx, f.sy, f.vx, f.vy, K.FAN.len, f.x, f.y); setBeamRect(f, f.len, K.FAN.half); }
}
/** Jak daleko (v políčkách, nejvýš max) se od (sx, sy) ve směru (vx, vy) dojde, než se narazí na pevnou dlaždici (vlastní políčko zařízení se nepočítá). */
function freeRun(W, sx, sy, vx, vy, max, ex, ey) {
  let d = 0; while (d < max) { const x = Math.floor(sx + vx * d), y = Math.floor(sy + vy * d); if (x < 0 || y < 0 || x >= COLS || y >= ROWS) break; if (W.g[y * COLS + x] > 0 && !W.gone[y * COLS + x] && !(x === ex && y === ey)) break; d += 0.1; }
  return d;
}
function setBeamRect(o, len, hw) {
  const { vx, vy } = o; const x1 = o.sx + vx * len, y1 = o.sy + vy * len;
  o.rect = [Math.min(o.sx, x1) - (vx ? 0 : hw), Math.min(o.sy, y1) - (vy ? 0 : hw), Math.max(o.sx, x1) + (vx ? 0 : hw), Math.max(o.sy, y1) + (vy ? 0 : hw)];
}
function addPiece(W, p) {
  const P = K.PIECES[p.type]; const cells = K.pieceCells(p.type, p.r); const face = K.faceOf(p.type, p.r);
  for (const [dx, dy] of cells) { const x = p.x + dx, y = p.y + dy; if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue; W.occ[y * COLS + x] = 1; }
  if (P.kind === 'solid') {
    const gi = []; for (const [dx, dy] of cells) { const k = (p.y + dy) * COLS + p.x + dx; W.g[k] = P.tile; gi.push(k); if (p.type === 'bounce' && face !== 0) { W.sp[k] = face + 1; W.hasSp = true; } }   // otočené odrazovadlo je pružina na stěně: vystřelí do strany (nebo dolů)
    if (P.tile === T.CRUMBLE) { const id = W.groups.length; W.groups.push(gi); for (const k of gi) W.grp.set(k, id); }
  } else if (p.type === 'mover') {
    const ax = p.r % 2 === 0 ? 0 : 1;
    W.movers.push({ id: p.id, owner: p.owner, ax, cx: ax === 0 ? p.x + 4.5 : p.x + 1.5, cy: ax === 0 ? p.y + 0.5 : p.y + 4.5, phase: (p.id * 37) % K.MOVER_PERIOD });
  } else if (p.type === 'spikes' || p.type === 'retract') {
    const sp = K.spikeSplit(p.type, p.r); const rects = [];
    for (const [dx, dy] of sp.base) W.g[(p.y + dy) * COLS + p.x + dx] = T.SOLID;   // pevný základ, na kterém se dá stát
    for (const [dx, dy] of sp.spike) {
      const x = p.x + dx, y = p.y + dy; let r;
      if (face === 0) r = [x + 0.12, y + 0.2, x + 0.88, y + 1]; else if (face === 2) r = [x + 0.12, y, x + 0.88, y + 0.8]; else if (face === 1) r = [x, y + 0.12, x + 0.8, y + 0.88]; else r = [x + 0.2, y + 0.12, x + 1, y + 0.88];
      rects.push(r);
    }
    if (p.type === 'spikes') for (const r of rects) W.spikes.push([r[0], r[1], r[2], r[3], p.owner]);
    else W.rspikes.push({ rects, cells: sp.spike.map(([dx, dy]) => [p.x + dx, p.y + dy]), face, owner: p.owner, phase: (p.id * 43) % K.RETRACT.period, id: p.id });
  } else if (p.type === 'icicle') {
    W.g[p.y * COLS + p.x] = T.DEVICE; W.icicles.push({ x: p.x, y: p.y, len: 0, phase: (p.id * 59) % K.ICICLE.period, owner: p.owner, id: p.id });
  } else if (p.type === 'bumper') {
    W.bumpers.push({ cx: p.x + 0.5, cy: p.y + 0.5, owner: p.owner, id: p.id });
  } else if (p.type === 'vanish') {
    W.vanish.push({ x: p.x, y: p.y, phase: (p.id * 61) % K.VANISH.period, owner: p.owner, id: p.id });
  } else if (p.type === 'hole') {
    W.holes.push({ cx: p.x + 0.5, cy: p.y + 0.5, phase: (p.id * 67) % K.HOLE.period, owner: p.owner, id: p.id });
  } else if (p.type === 'boulder') {
    W.boulders.push({ x: p.x, y: p.y, dir: p.r % 2 === 0 ? 1 : -1, phase: (p.id * 71) % K.BOULDER.period, owner: p.owner, id: p.id });
  } else if (p.type === 'saw') {
    W.saws.push({ x: p.x + 1, y: p.y + 1, r: 0.9, owner: p.owner });
  } else if (p.type === 'blades') {
    W.g[p.y * COLS + p.x] = T.DEVICE; W.blades.push({ px: p.x + 0.5, py: p.y + 0.5, dir: p.id % 2 ? 1 : -1, phase: (p.id * 41) % K.BLADE_PERIOD, owner: p.owner, id: p.id });
  } else if (p.type === 'pendulum') {
    W.g[p.y * COLS + p.x] = T.DEVICE; W.pends.push({ px: p.x + 0.5, py: p.y + 0.5, phase: (p.id * 47) % K.PEND_PERIOD, owner: p.owner, id: p.id });
  } else if (p.type === 'thwomp') {
    const [vx, vy] = K.DIRV[face], tr = K.THW.h - K.THW.s;   // kámen se vrhá ve směru face; základní (horní) poloha je na opačném konci dráhy
    W.thwomps.push({ x: p.x, y: p.y, dir: face, vx, vy, sx: p.x + (face === 3 ? tr : 0), sy: p.y + (face === 0 ? tr : 0), phase: (p.id * 31) % K.THW.period, owner: p.owner, id: p.id });
  } else if (p.type === 'rsaw') {
    W.rsaws.push({ x: p.x, y: p.y, ax: p.r % 2, phase: (p.id * 37) % K.RSAW_PERIOD, owner: p.owner, id: p.id });
  } else if (p.type === 'laser' || p.type === 'fan') {
    const x = p.x, y = p.y; W.g[y * COLS + x] = T.DEVICE; const [vx, vy] = K.DIRV[face];
    const o = { x, y, dir: face, vx, vy, sx: x + 0.5 + vx * 0.55, sy: y + 0.5 + vy * 0.55, owner: p.owner, id: p.id, len: 0, rect: [0, 0, 0, 0], phase: p.type === 'laser' ? (p.id * 53) % K.LASER_PERIOD : (p.id * 29) % K.FAN.period };
    (p.type === 'laser' ? W.lasers : W.fans).push(o);
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
const TAU2 = Math.PI * 2;
/** Úhel vrtule (rad) v daném ticku. */
export const bladeAngle = (b, tick) => b.dir * TAU2 * ((tick + b.phase) / K.BLADE_PERIOD);
/** Koule kyvadla: [x, y, úhel]. */
export function pendBall(p, tick) { const a = K.PEND_AMP * Math.sin(TAU2 * ((tick + p.phase) / K.PEND_PERIOD)); return [p.px + Math.sin(a) * K.PEND_LEN, p.py + Math.cos(a) * K.PEND_LEN, a]; }
/** Jak hluboko (v políčkách od horní polohy) je padací kámen v daném ticku. */
export function thwompOff(t, tick) {
  const H = K.THW, travel = H.h - H.s; const u = (((tick + t.phase) % H.period) + H.period) % H.period;
  if (u < H.wait) return 0; if (u < H.wait + H.fall) { const k = (u - H.wait) / H.fall; return travel * k * k; }
  if (u < H.wait + H.fall + H.rest) return travel; const k = (u - H.wait - H.fall - H.rest) / (H.period - H.wait - H.fall - H.rest); return travel * (1 - k);
}
/** Levý horní roh padacího kamene v daném ticku (kámen je pořád vzpřímený, mění se jen směr dráhy). */
export function thwompPos(t, tick, out = [0, 0]) { const o = thwompOff(t, tick); out[0] = t.sx + t.vx * o; out[1] = t.sy + t.vy * o; return out; }
export function thwompBox(t, tick, out = [0, 0, 0, 0]) { thwompPos(t, tick, rp); out[0] = rp[0]; out[1] = rp[1]; out[2] = rp[0] + K.THW.s; out[3] = rp[1] + K.THW.s; return out; }
/** Výsuvné bodáky: 0 schované, 1 varují (cukají), 2 venku. */
export function retractState(o, tick) { const R = K.RETRACT; const u = (((tick + o.phase) % R.period) + R.period) % R.period; return u < R.period - R.warn - R.on ? 0 : u < R.period - R.on ? 1 : 2; }
/** Rampouch: { off: o kolik už spadl, vis: je vidět, live: je smrtelný, grow: 0..1 dorůstání, shake: třese se }. */
export function icicleState(c, tick, out = {}) {
  const I = K.ICICLE; const u = (((tick + c.phase) % I.period) + I.period) % I.period; const fall = Math.sqrt((2 * c.len) / I.g) * K.TPS; const land = I.fallAt + Math.ceil(fall);
  out.shake = u >= I.fallAt - 22 && u < I.fallAt; out.grow = 1; out.vis = true; out.live = true; out.off = 0;
  if (u >= I.fallAt) { const s = Math.min(fall, u - I.fallAt) * K.DT; out.off = Math.min(c.len, 0.5 * I.g * s * s); if (u >= land) { out.live = false; out.vis = u < land + I.shatter; } }
  if (u >= I.period - I.grow) { out.vis = true; out.live = false; out.off = 0; out.grow = (u - (I.period - I.grow)) / I.grow; }
  return out;
}
/** Mizející plošina: 0 pevná, 1 varuje (bliká, ještě pevná), 2 chybí. */
export function vanishState(v, tick) { const V = K.VANISH; const u = (((tick + v.phase) % V.period) + V.period) % V.period; return u < V.solid ? 0 : u < V.solid + V.warn ? 1 : 2; }
/** Černá díra: 0 klidná, 1 se rozbíhá (varování), 2 přitahuje. */
export function holeState(h, tick) { const H = K.HOLE; const u = (((tick + h.phase) % H.period) + H.period) % H.period; return u < H.period - H.on - H.warn ? 0 : u < H.period - H.on ? 1 : 2; }
/** Valoun: [střed x, střed y, úhel, stav] — stav 0 schovaný, 1 dorůstá na startu (nesmrtelný), 2 se kutálí. */
export function boulderPos(b, tick, out = [0, 0, 0, 0]) {
  const B = K.BOULDER; const u = (((tick + b.phase) % B.period) + B.period) % B.period; const span = B.len - 2 * B.r;
  const f = u < B.roll ? Math.pow(u / B.roll, 1.35) : 1; const d = b.dir > 0 ? B.r + span * f : B.len - B.r - span * f;
  out[0] = b.x + d; out[1] = b.y + 1 - B.r; out[2] = (b.dir * d) / B.r; out[3] = u < B.roll ? 2 : u < B.roll + 25 ? 0 : 1;
  if (out[3] === 1) { out[0] = b.x + (b.dir > 0 ? B.r : B.len - B.r); out[2] = 0; }
  return out;
}
/** Stav laseru: 0 nic, 1 varuje (bliká), 2 pálí. */
export function laserState(l, tick) { const u = (((tick + l.phase) % K.LASER_PERIOD) + K.LASER_PERIOD) % K.LASER_PERIOD; return u < K.LASER_PERIOD - K.LASER_WARN - K.LASER_ON ? 0 : u < K.LASER_PERIOD - K.LASER_ON ? 1 : 2; }
/** Střed pily na kolejnici. */
export function rsawPos(s, tick, out = [0, 0]) { const d = (K.RSAW_LEN - 1) * (0.5 + 0.5 * Math.sin(TAU2 * ((tick + s.phase) / K.RSAW_PERIOD))); out[0] = s.x + 0.5 + (s.ax === 0 ? d : 0); out[1] = s.y + 0.5 + (s.ax === 1 ? d : 0); return out; }
export const fanOn = (f, tick) => ((((tick + f.phase) % K.FAN.period) + K.FAN.period) % K.FAN.period) < K.FAN.on;
/** Pole věcí, jejichž stav závisí na čase (navigační graf bota s nimi nepočítá). */
export const TIMED = ['movers', 'cannons', 'flames', 'blades', 'pends', 'thwomps', 'lasers', 'rsaws', 'fans', 'rspikes', 'icicles', 'bumpers', 'vanish', 'holes', 'boulders'];
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
export function newBody(x, y) { return { x, y, vx: 0, vy: 0, face: 1, gr: false, coy: 0, buf: 0, jh: false, wall: 0, wlock: 0, rise: false, ice: false, stand: -1, crush: false, sc: 0 }; }
export const copyBody = (p) => ({ ...p });

let ox0 = 0, ox1 = 0, oy0 = 0, oy1 = 0;
const mb = [0, 0, 0, 0], rp = [0, 0], ic = {}, bp = [0, 0, 0, 0];
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
  for (let i = 0; i < W.thwomps.length; i++) {
    thwompBox(W.thwomps[i], tick, mb);
    if (x0 < mb[2] && x1 > mb[0] && y0 < mb[3] && y1 > mb[1]) { hit = true; if (mb[0] < ox0) ox0 = mb[0]; if (mb[2] > ox1) ox1 = mb[2]; if (mb[1] < oy0) oy0 = mb[1]; if (mb[3] > oy1) oy1 = mb[3]; }
  }
  for (let i = 0; i < W.vanish.length; i++) {
    const v = W.vanish[i]; if (vanishState(v, tick) === 2) continue;
    if (x0 < v.x + 3 && x1 > v.x && y0 < v.y + 1 && y1 > v.y) { hit = true; if (v.x < ox0) ox0 = v.x; if (v.x + 3 > ox1) ox1 = v.x + 3; if (v.y < oy0) oy0 = v.y; if (v.y + 1 > oy1) oy1 = v.y + 1; }
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
  const circ = (cx, cy, r) => { const nx = Math.max(x0, Math.min(cx, x1)), ny = Math.max(y0, Math.min(cy, y1)); const dx = nx - cx, dy = ny - cy; return dx * dx + dy * dy < r * r; };
  for (const b of W.blades) { const a = bladeAngle(b, tick), ca = Math.cos(a), sa = Math.sin(a); for (let u = -K.BLADE_LEN; u <= K.BLADE_LEN + 1e-6; u += 0.25) if (circ(b.px + ca * u, b.py + sa * u, K.BLADE_R)) return b.owner + 1; }
  for (const p of W.pends) { const q = pendBall(p, tick); if (circ(q[0], q[1], K.PEND_R * 0.88)) return p.owner + 1; }
  { const bx0 = x - PW / 2 - 0.04, bx1 = x + PW / 2 + 0.04, by0 = y - PH / 2 - 0.04, by1 = y + PH / 2 + 0.04, feet = y + PH / 2;   // kámen zabíjí dotekem ze stran a zespodu, shora (nohy u horní hrany) je bezpečný
    for (const t of W.thwomps) { thwompBox(t, tick, mb); if (bx0 < mb[2] && bx1 > mb[0] && by0 < mb[3] && by1 > mb[1] && feet > mb[1] + 0.22) return t.owner + 1; } }
  for (const o of W.rspikes) if (retractState(o, tick) === 2) for (const s of o.rects) if (x0 < s[2] && x1 > s[0] && y0 < s[3] && y1 > s[1]) return o.owner + 1;
  for (const c of W.icicles) { icicleState(c, tick, ic); if (ic.live) { const ry0 = c.y + 1 + ic.off + 0.05; if (x0 < c.x + 0.5 + K.ICICLE.w && x1 > c.x + 0.5 - K.ICICLE.w && y0 < ry0 + K.ICICLE.len && y1 > ry0) return c.owner + 1; } }
  for (const b of W.boulders) { boulderPos(b, tick, bp); if (bp[3] === 2 && circ(bp[0], bp[1], K.BOULDER.r * 0.9)) return b.owner + 1; }
  for (const h of W.holes) if (holeState(h, tick) === 2 && circ(h.cx, h.cy, K.HOLE.core)) return h.owner + 1;
  for (const l of W.lasers) if (laserState(l, tick) === 2 && x0 < l.rect[2] && x1 > l.rect[0] && y0 < l.rect[3] && y1 > l.rect[1]) return l.owner + 1;
  for (const s of W.rsaws) { rsawPos(s, tick, rp); if (circ(rp[0], rp[1], K.RSAW_R * 0.92)) return s.owner + 1; }
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
    p.gr = true; if (t === T.ICE) p.ice = true; else if (t === T.BOUNCE && !W.sp[k]) bounce = true;
    if (t === T.CRUMBLE && !W.noFx) { const gid = W.grp.get(k); if (triggerCrumble(W, gid, tick) && W.onCrumble) W.onCrumble(gid, tick); }
  }
  for (let i = 0; i < W.movers.length; i++) { moverBox(W.movers[i], tick, mb); if (x0 < mb[2] && x1 > mb[0] && fy >= mb[1] && fy < mb[1] + 0.3 && p.y + PH / 2 <= mb[1] + 0.12) { p.gr = true; p.stand = i; break; } }
  if (!p.gr) for (let i = 0; i < W.thwomps.length; i++) { thwompBox(W.thwomps[i], tick, mb); if (x0 < mb[2] && x1 > mb[0] && fy >= mb[1] && fy < mb[1] + 0.3 && p.y + PH / 2 <= mb[1] + 0.12) { p.gr = true; p.stand = 100 + i; break; } }
  if (!p.gr) for (let i = 0; i < W.vanish.length; i++) { const v = W.vanish[i]; if (vanishState(v, tick) !== 2 && x0 < v.x + 3 && x1 > v.x && fy >= v.y && fy < v.y + 0.3 && p.y + PH / 2 <= v.y + 0.12) { p.gr = true; break; } }
  p.wall = 0; if (!p.gr) { if (overlap(W, p.x + 0.07, p.y, tick)) p.wall = 1; else if (overlap(W, p.x - 0.07, p.y, tick)) p.wall = -1; }
  return bounce;
}
export const SPRING_VX = 24, SPRING_VY = -9;
/** Boční pružina (otočené odrazovadlo): kdo se dotkne její vnější strany, je vystřelen pryč (do strany, nebo dolů od stropní). */
function springPush(W, p, fx) {
  const r0 = Math.floor(p.y - PH / 2 + 0.05), r1 = Math.floor(p.y + PH / 2 - 0.05);
  const at = (cx, cy) => (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS ? 0 : W.sp[cy * COLS + cx]);
  const cr = Math.floor(p.x + PW / 2 + 0.06), cl = Math.floor(p.x - PW / 2 - 0.06);
  for (let y = r0; y <= r1; y++) {
    if (at(cr, y) === 4) { p.vx = -SPRING_VX; p.vy = SPRING_VY; p.wlock = 6; p.face = -1; p.sc = 10; p.buf = 0; if (fx) fx.push('b'); return; }
    if (at(cl, y) === 2) { p.vx = SPRING_VX; p.vy = SPRING_VY; p.wlock = 6; p.face = 1; p.sc = 10; p.buf = 0; if (fx) fx.push('b'); return; }
  }
  const ch = Math.floor(p.y - PH / 2 - 0.06);
  for (let x = Math.floor(p.x - PW / 2 + 0.02); x <= Math.floor(p.x + PW / 2 - 0.02); x++) if (at(x, ch) === 3) { p.vy = SPRING_VX; p.sc = 10; if (fx) fx.push('b'); return; }
}
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));

/** Jeden tik fyziky postavy. `inp` = bity IN, `tick` = tik světa, `fx` = volitelné pole, kam se zapisují události ('j' skok, 'w' odraz od stěny, 'b' odrazovadlo, 'l' dopad). */
export function stepBody(W, p, inp, tick, fx) {
  const L = inp & 1, R = inp & 2, J = inp & 4; const dir = (R ? 1 : 0) - (L ? 1 : 0);
  if (p.stand >= 100 && W.thwomps[p.stand - 100]) { const t = W.thwomps[p.stand - 100]; const d = thwompOff(t, tick) - thwompOff(t, tick - 1); p.x += d * t.vx; p.y += d * t.vy; }
  else if (p.stand >= 0 && W.movers[p.stand]) { const m = W.movers[p.stand]; const d = moverOff(m, tick) - moverOff(m, tick - 1); if (m.ax === 0) p.x += d; else p.y += d; }
  p.crush = false; depen(W, p, tick);
  if (J && !p.jh) p.buf = BUF_T; else if (p.buf > 0) p.buf--;
  if (p.wlock > 0) p.wlock--;
  if (p.wlock === 0) {
    if (dir !== 0) { let acc = p.gr ? (p.ice ? ACC_ICE : ACC_G) : ACC_A; if (p.vx * dir < 0) acc *= TURN; p.vx = approach(p.vx, dir * RUN, acc * DT); p.face = dir; }
    else p.vx = approach(p.vx, 0, (p.gr ? (p.ice ? FR_ICE : FR_G) : FR_A) * DT);
  }
  p.vy = Math.min(MAXFALL, p.vy + GRAV * (W.stage.grav || 1) * DT);
  let windX = 0;
  for (let i = 0; i < W.fans.length; i++) {
    const f = W.fans[i]; if (!fanOn(f, tick)) continue;
    if (p.x - PW / 2 < f.rect[2] && p.x + PW / 2 > f.rect[0] && p.y - PH / 2 < f.rect[3] && p.y + PH / 2 > f.rect[1]) {
      if (f.dir === 0) p.vy = Math.max(-9, p.vy - K.FAN.lift * DT); else if (f.dir === 2) p.vy = Math.min(MAXFALL, p.vy + 80 * DT); else windX += f.dir === 1 ? K.FAN.wind : -K.FAN.wind;
    }
  }
  for (let i = 0; i < W.holes.length; i++) {
    const h = W.holes[i]; if (holeState(h, tick) !== 2) continue;
    const dx = h.cx - p.x, dy = h.cy - p.y, d = Math.hypot(dx, dy); if (d < K.HOLE.r && d > 0.01) { const a = K.HOLE.pull * (1 - d / K.HOLE.r) * DT; p.vx += (dx / d) * a; p.vy += (dy / d) * a; }
  }
  if (!p.gr && p.wall !== 0 && dir === p.wall && p.vy > SLIDE_V) p.vy = SLIDE_V;
  if (p.gr) p.coy = COYOTE_T; else if (p.coy > 0) p.coy--;
  if (p.buf > 0) {
    if (p.coy > 0) { p.vy = -JUMP_V; p.buf = 0; p.coy = 0; p.gr = false; p.rise = true; if (fx) fx.push('j'); }
    else if (p.wall !== 0 && !p.gr) { p.vy = -WJUMP_V; p.vx = -p.wall * WJUMP_VX; p.wlock = WLOCK_T; p.face = -p.wall; p.buf = 0; p.wall = 0; p.rise = true; if (fx) fx.push('w'); }
  }
  if (!J && p.rise && p.vy < 0) { p.vy *= CUT; p.rise = false; } else if (p.vy >= 0) p.rise = false;
  p.jh = !!J;
  moveX(W, p, p.vx * DT + windX * DT, tick);
  const wasFalling = p.vy > 0, wasAir = !p.gr; const hit = moveY(W, p, p.vy * DT, tick);
  const bounce = probe(W, p, tick);
  if (p.sc > 0) p.sc--; else if (W.hasSp) springPush(W, p, fx);
  for (let i = 0; i < W.bumpers.length; i++) {   // odrážeč: kdo se dotkne kruhu, je odpálen od jeho středu
    const b = W.bumpers[i]; const nx = Math.max(p.x - PW / 2, Math.min(b.cx, p.x + PW / 2)), ny = Math.max(p.y - PH / 2, Math.min(b.cy, p.y + PH / 2));
    if (Math.hypot(nx - b.cx, ny - b.cy) < K.BUMP.r) {
      let dx = p.x - b.cx, dy = p.y - b.cy; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d; if (dy > 0.5) dy = 0.5;
      const n = Math.hypot(dx, dy); p.vx = (dx / n) * K.BUMP.v; p.vy = (dy / n) * K.BUMP.v - 2; p.wlock = 6; p.coy = 0; p.rise = false; p.gr = false; p.buf = 0; if (dx) p.face = dx > 0 ? 1 : -1; if (fx) fx.push('b'); break;
    }
  }
  if (hit === 1 && wasFalling) { if (bounce) { p.vy = -BOUNCE_V; p.gr = false; p.coy = 0; p.rise = false; if (fx) fx.push('b'); } else if (fx && wasAir) fx.push('l'); }
  if (p.x < PW / 2) p.x = PW / 2; if (p.x > COLS - PW / 2) p.x = COLS - PW / 2;
  if (p.y < -8) { p.y = -8; if (p.vy < 0) p.vy = 0; }
}
