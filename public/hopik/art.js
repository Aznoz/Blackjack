// HOPÍK – grafika: všechno je nakreslené vektorově (zvířátka, terén, kusy, pasti, kulky, plameny, vlajka, pozadí) v jednotkách políček.
// Volající nastaví transformaci canvasu tak, aby 1 jednotka = 1 políčko. Žádné emoji ani obrázky.
import * as K from './shared.js?v=8';
import { hatC, glassesC, bootC, backC } from './cosm.js?v=8';
import * as P from './phys.js?v=8';
const { COLS, ROWS } = K;
export const INK = '#2b2118';
export const SEAT = ['#ff5a4f', '#2f9cff', '#ffc928', '#46c46a'];          // barva místa u stolu (obrys jména, pecky na kusech)
export const SEAT_DK = ['#c93a30', '#1c6fc4', '#c69100', '#2b8f48'];
const TAU = Math.PI * 2;
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function ell(g, x, y, rx, ry, fill, lw = 0.055, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); } }
function poly(g, pts, fill, lw = 0.055, close = true) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.lineWidth = lw; g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); } }
function rrect(g, x, y, w, h, r, fill, lw = 0.055) { g.beginPath(); g.roundRect(x, y, w, h, r); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); } }

// ------------------------------------------------------------------ zvířátka
// Každé zvířátko se kreslí v pixelových souřadnicích (jako postavy v Bombicu, aby šla použít stejná kosmetika): hlava je kruh ve (0,-9) o poloměru 11,5,
// tělo je zaoblený obdélník (-9..9, 0..15), nohy jsou kolem y 16 a země je v y 19. Zvířátko se dívá doprava (doleva se zrcadlí).
const PX = 0.0265;
const OLN = '#2b2118';
const cir = (g, x, y, r, fill, lw = 1.7) => { g.beginPath(); g.arc(x, y, r, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.lineWidth = lw; g.strokeStyle = OLN; g.stroke(); } };
const el = (g, x, y, rx, ry, fill, lw = 1.7, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.lineWidth = lw; g.strokeStyle = OLN; g.stroke(); } };
const pg = (g, pts, fill, lw = 1.7) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.lineWidth = lw; g.strokeStyle = OLN; g.lineJoin = 'round'; g.stroke(); } };
const qd = (g, a, b, c, d, fill, lw = 1.7) => { g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], b[1], c[0], c[1]); g.quadraticCurveTo(d[0], d[1], a[0], a[1]); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.lineWidth = lw; g.strokeStyle = OLN; g.stroke(); } };
function rr2(g, x, y, w, h, r, fill, lw = 1.7) { g.beginPath(); g.roundRect(x, y, w, h, r); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.lineWidth = lw; g.strokeStyle = OLN; g.stroke(); } }
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
/** Nakreslí postavičku se středem těla (x, y). o = { face: ±1, t: čas (s), vx, vy, gr, wall, alpha, sc, dance, cs: kosmetika { hat, glasses, boots, back } }. Výška je asi jedno políčko. */
export function drawAnimal(g, ci, x, y, o = {}) {
  const C = K.CHARS[ci] || K.CHARS[0]; const f = o.face < 0 ? -1 : 1, t = o.t || 0, vx = o.vx || 0, vy = o.vy || 0;
  const run = o.gr && Math.abs(vx) > 0.5; const ph = t * 16;
  let sx = 1, sy = 1; if (!o.gr && !o.wall) { const s = Math.max(-0.18, Math.min(0.2, vy / 90)); sy = 1 + s; sx = 1 - s * 0.7; }
  const bob = run ? Math.abs(Math.sin(ph)) * 0.05 : o.dance ? Math.abs(Math.sin(t * 9)) * 0.12 : Math.sin(t * 3) * 0.012;
  g.save(); g.globalAlpha = o.alpha === undefined ? 1 : o.alpha; g.translate(x, y + 0.45); g.scale(f * (o.sc || 1) * sx, (o.sc || 1) * sy); g.translate(0, -bob);
  if (o.wall) g.rotate(-0.12); if (run) g.rotate(0.05);
  g.scale(PX, PX); g.translate(0, -19); g.lineJoin = 'round'; g.lineCap = 'round';
  critter(g, C, ci, { t, ph, moving: run, air: !o.gr && !o.wall, dance: o.dance, cs: o.cs || {}, up: vy < -2, wall: o.wall });
  g.restore();
}
function critter(g, C, ci, o) {
  const { t, ph, moving, air } = o; const cs = o.cs; const e = C.ear; const w = moving ? Math.sin(ph) : 0; const wag = Math.sin(t * 5);
  const fy1 = air ? 13.5 : 16 + Math.max(0, w) * -2.2, fy2 = air ? 14.5 : 16 + Math.max(0, -w) * -2.2;
  if (cs.back) backC(g, cs.back, 2, t, moving, 0);
  // ocas a zadní části (za tělem)
  g.save();
  if (e === 'comb') { for (const [dx, dy, a] of [[-10, 4, -0.9], [-11, 7, -0.2], [-9, 9, 0.6]]) { g.save(); g.translate(dx, dy); g.rotate(a); el(g, -2, 0, 5, 2.4, e === 'comb' ? '#f4ead0' : C.body, 1.5); g.restore(); } }
  else if (e === 'horse') { g.beginPath(); g.moveTo(-8, 4); g.bezierCurveTo(-17, 2 + wag, -17, 12, -11, 14 + wag * 1.5); g.bezierCurveTo(-13, 9, -12, 6, -8, 8); g.closePath(); g.fillStyle = C.acc; g.fill(); g.lineWidth = 1.6; g.strokeStyle = OLN; g.stroke(); }
  else if (e === 'pig') { g.beginPath(); g.moveTo(-9, 7); g.bezierCurveTo(-16, 3, -15, 11, -12, 8); g.bezierCurveTo(-10, 6, -13, 5, -14, 8); g.lineWidth = 3.4; g.strokeStyle = OLN; g.stroke(); g.lineWidth = 1.6; g.strokeStyle = C.body; g.stroke(); }
  else if (e === 'rabbit') { cir(g, -11, 9, 4.6, '#ffffff', 1.5); el(g, -12, 8, 1.6, 1.2, 'rgba(210,214,230,.9)', 0); }
  else if (e === 'tuft') { pg(g, [[-8, 8], [-15, 2 + wag], [-13, 8], [-16, 11], [-8, 12]], C.dark, 1.5); }
  else if (e === 'goat' || e === 'cow') { g.beginPath(); g.moveTo(-9, 6); g.quadraticCurveTo(-14, 10 + wag, -13, 15); g.lineWidth = 2.2; g.strokeStyle = OLN; g.stroke(); el(g, -13, 15.5, 2.2, 3.2, e === 'cow' ? C.acc : C.dark, 1.4); }
  else if (e === 'sheep') { cir(g, -11, 9, 4.2, C.body, 1.5); }
  g.restore();
  // nohy / boty
  const foot = (fx, fyy) => {
    if (cs.boots) return;
    if (e === 'comb' || e === 'tuft') { pg(g, [[fx - 4.4, fyy + 3], [fx, fyy - 2.4], [fx + 4.4, fyy + 3]], C.beak, 1.5); }
    else if (e === 'rabbit') el(g, fx + 0.6, fyy + 0.6, 6, 3.2, C.belly, 1.6);
    else if (e === 'horse' || e === 'cow' || e === 'goat') { rr2(g, fx - 3.6, fyy - 3.2, 7.2, 6.4, 2.2, shade('#7a6a60', 0.55), 1.6); el(g, fx, fyy - 2.4, 3.6, 2, 'rgba(255,255,255,.15)', 0); }
    else if (e === 'pig') el(g, fx, fyy, 4.6, 3.2, shade(C.body, 0.8), 1.6);
    else el(g, fx, fyy, 4.8, 3.1, e === 'sheep' ? '#4a4644' : C.dark, 1.6);
  };
  if (!cs.boots) { foot(-5.5, fy1); foot(5.5, fy2); }
  // tělo
  if (e === 'sheep') { for (const [cx, cy, r] of [[-7.5, 4, 5.4], [7.5, 4, 5.4], [-6.5, 11, 5.2], [6.5, 11, 5.2], [0, 1.4, 6.2], [0, 11.5, 5.4], [-9.5, 7.5, 4.6], [9.5, 7.5, 4.6]]) cir(g, cx, cy, r, C.body, 1.6); cir(g, 0, 7, 8.4, C.body, 0); }
  else {
    rr2(g, -9.2, -0.5, 18.4, 15.8, 6.6, C.body, 1.8);
    g.save(); g.beginPath(); g.roundRect(-9.2, -0.5, 18.4, 15.8, 6.6); g.clip(); const gr = g.createLinearGradient(0, -1, 0, 16); gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.16)'); g.fillStyle = gr; g.fillRect(-10, -1, 20, 18); g.restore();
    el(g, 1.5, 9, 5.8, 5.2, C.belly, 0);
    if (C.spot) { el(g, -4.5, 5, 3.6, 2.8, C.acc, 0, 0.5); el(g, 5.5, 11.5, 2.8, 2.4, C.acc, 0); el(g, -6.4, 12, 2.2, 1.9, C.acc, 0); }
    if (e === 'pig') { el(g, -5, 4, 1.8, 1.2, 'rgba(255,255,255,.35)', 0, -0.5); }
    rr2(g, -9.2, -0.5, 18.4, 15.8, 6.6, null, 1.8);
  }
  if (cs.boots) { bootC(g, cs.boots, -5.5, fy1, 2, t, moving); bootC(g, cs.boots, 5.5, fy2, 2, t, moving); }
  if (cs.back) backC(g, cs.back, 2, t, moving, 1);
  // ruce / křidélka
  const armY = o.dance || o.up ? 0 : 6;
  for (const sd of [-1, 1]) {
    const ay = armY + (moving ? w * 2 * sd : 0) + (o.dance ? Math.sin(t * 12 + sd) * 3 : 0);
    if (e === 'comb' || e === 'tuft') { g.save(); g.translate(sd * 10.4, ay + 1); g.rotate(sd * 0.35 + (air ? sd * 0.7 : 0)); el(g, 0, 1, 3.4, 5.4, e === 'comb' ? '#ffffff' : C.body, 1.5); el(g, 0, 3, 2, 2.6, shade(C.body, 0.92), 0); g.restore(); }
    else if (e === 'sheep') cir(g, sd * 11.6, ay, 3.6, '#4a4644', 1.5);
    else if (e === 'rabbit') cir(g, sd * 11.4, ay, 3.5, C.body, 1.5);
    else cir(g, sd * 11.4, ay, 3.5, e === 'cow' ? '#ffffff' : e === 'pig' ? C.body : C.body, 1.5);
  }
  // hlava (kruh) a obličej, který se dívá doprava
  const hx = 0, hy = -9, R = 11.5;
  if (e === 'sheep') { for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU + 0.3; cir(g, Math.cos(a) * 9, hy + Math.sin(a) * 8.6, 5, C.body, 1.5); } cir(g, 0, hy, 10, C.body, 0); }
  // uši za hlavou
  g.save();
  if (e === 'rabbit') { const wv = Math.sin(t * 3.2) * 0.07; for (const [ex2, rot] of [[-4.4, -0.2 + wv], [3.4, 0.14 + wv]]) { g.save(); g.translate(ex2, -17); g.rotate(rot); el(g, 0, -10, 3.6, 10.5, C.body, 1.7); el(g, 0.3, -9.6, 1.7, 8, C.acc, 0); g.restore(); } }
  if (e === 'horse') { for (const [ex2, rot] of [[-4.4, -0.35], [3.8, 0.1]]) { g.save(); g.translate(ex2, -18); g.rotate(rot); pg(g, [[-3.4, 1], [0, -9], [3.4, 1]], C.dark, 1.6); pg(g, [[-1.8, 0], [0, -6], [1.8, 0]], '#e99a8a', 0); g.restore(); } }
  if (e === 'goat') { for (const sd of [-1, 1]) { g.save(); g.translate(sd * 10.6 + 1, -9); g.rotate(sd * 0.7); el(g, 0, 0, 6, 2.8, C.dark, 1.6); g.restore(); } }
  g.restore();
  g.save(); // hlava
  if (e !== 'sheep') {
    cir(g, hx, hy, R, C.body, 1.9);
    g.save(); g.beginPath(); g.arc(hx, hy, R, 0, TAU); g.clip(); const hg = g.createRadialGradient(-3, hy - 5, 1, 0, hy, R * 1.1); hg.addColorStop(0, 'rgba(255,255,255,.28)'); hg.addColorStop(0.6, 'rgba(255,255,255,0)'); hg.addColorStop(1, 'rgba(0,0,0,.14)'); g.fillStyle = hg; g.fillRect(-13, -22, 26, 26);
    if (C.spot) { el(g, -4.6, -13, 5, 4.4, C.acc, 0, -0.4); } if (e === 'horse') { pg(g, [[-1, -20], [3, -20], [2.6, -9], [0, -9]], '#f6e6c8', 0); }
    g.restore(); cir(g, hx, hy, R, null, 1.9);
  } else { el(g, 3.6, hy + 0.5, 7.8, 8.6, '#4a4644', 1.7); el(g, 1, hy - 4, 4, 2.4, 'rgba(255,255,255,.12)', 0); }
  // vzor na hlavě a čumák podle zvířete
  const nx = 7.8, ny = -4.6;
  if (e === 'horse') { el(g, nx + 0.4, ny + 0.4, 5.4, 4.6, C.belly, 1.5); el(g, nx + 2.4, ny - 0.2, 0.9, 1.2, C.dark, 0); el(g, nx - 1, ny - 0.2, 0.9, 1.2, C.dark, 0); }
  if (e === 'pig') { el(g, nx + 0.6, ny, 5.6, 4.2, '#ff97b6', 1.6); el(g, nx + 2.6, ny, 1, 1.7, '#b5476b', 0); el(g, nx - 0.9, ny, 1, 1.7, '#b5476b', 0); }
  if (e === 'cow') { el(g, nx + 0.4, ny + 0.6, 6.2, 4.6, '#ffb9cc', 1.6); el(g, nx + 2.8, ny + 0.6, 1, 1.5, '#a14864', 0); el(g, nx - 1.2, ny + 0.6, 1, 1.5, '#a14864', 0); }
  if (e === 'rabbit') { el(g, nx - 0.6, ny + 0.2, 4.6, 3.6, C.belly, 1.4); pg(g, [[nx - 1.5, ny + 1.6], [nx + 1, ny + 1.6], [nx + 0.7, ny + 5], [nx - 1.2, ny + 5]], '#fff', 1.1); el(g, nx - 0.1, ny - 1.4, 1.5, 1.1, '#ff7f9f', 0.9); }
  if (e === 'comb') { pg(g, [[nx - 2.4, ny - 2.2], [nx + 5.8, ny + 0.4], [nx - 2.4, ny + 3]], C.beak, 1.6); el(g, nx - 0.2, ny + 4.6, 1.8, 2.6, '#e8433c', 1.2); }
  if (e === 'tuft') { el(g, nx + 2.2, ny + 0.8, 6, 2.6, C.beak, 1.6); el(g, nx + 3.4, ny + 2.2, 4.6, 1.4, shade(C.beak, 0.85), 0); }
  if (e === 'goat') { el(g, nx + 0.2, ny + 0.6, 5.2, 4.2, C.belly, 1.5); el(g, nx + 2.2, ny + 0.2, 0.8, 1, C.dark, 0); pg(g, [[nx - 1.6, ny + 4], [nx + 1.8, ny + 4], [nx + 0.3, ny + 9.4]], C.dark, 1.4); }
  if (e === 'sheep') { el(g, nx - 0.8, ny + 0.6, 2.2, 1.6, '#ffb3c6', 1); }
  // oči (velké, lesklé) + tváře + pusa
  const blink = Math.sin(t * 1.3 + ci * 2) > 0.985 || o.air && false;
  for (const ex of [0.8, 6.6]) {
    if (blink) { g.beginPath(); g.moveTo(ex - 2.4, -7.8); g.quadraticCurveTo(ex, -6.2, ex + 2.4, -7.8); g.lineWidth = 1.5; g.strokeStyle = OLN; g.stroke(); }
    else { el(g, ex, -7.8, 2.45, 3.3, '#1f1a22', 0); el(g, ex + 0.6, -9.1, 1.0, 1.15, '#ffffff', 0); el(g, ex - 0.6, -6.3, 0.5, 0.55, 'rgba(255,255,255,.85)', 0); if (e === 'goat') { el(g, ex, -7.8, 2.45, 3.3, '#e8b933', 0); el(g, ex, -7.8, 2.2, 0.9, '#1f1a22', 0); el(g, ex + 0.6, -9, 0.7, 0.7, '#fff', 0); } }
  }
  el(g, -3.4, -3.6, 2.6, 1.6, 'rgba(255,110,140,.42)', 0); el(g, 9.2, -3.2, 2.2, 1.5, 'rgba(255,110,140,.38)', 0);
  if (e !== 'pig' && e !== 'cow' && e !== 'comb' && e !== 'tuft' && e !== 'horse') { g.beginPath(); g.moveTo(nx - 1.4, ny + 3.1); g.quadraticCurveTo(nx, ny + 4.4, nx + 1.6, ny + 3.1); g.lineWidth = 1.1; g.strokeStyle = OLN; g.stroke(); }
  g.restore();
  // ozdoby nahoře (hřebínek, rohy, tupé, hříva, uši spadlé) – před hlavou
  if (!cs.hat || cs.hat === '-') {
    if (e === 'comb') { for (const [cx, cy, r] of [[-4.4, -19.8, 3.2], [0.4, -21.8, 3.8], [5.2, -19.8, 3.2]]) cir(g, cx, cy, r, '#e8433c', 1.6); }
    if (e === 'horse') { g.beginPath(); g.moveTo(-9, -15); g.bezierCurveTo(-11, -22, -3, -25, 3, -21); g.bezierCurveTo(-1, -20, -2, -17, -5, -14); g.closePath(); g.fillStyle = C.acc; g.fill(); g.lineWidth = 1.6; g.strokeStyle = OLN; g.stroke(); }
    if (e === 'pig') { for (const [ex2, rot, sd] of [[-5, -0.5, -1], [4.6, 0.9, 1]]) { g.save(); g.translate(ex2, -18.4); g.rotate(rot); pg(g, [[-3.6, 1.4], [0, -6.4], [3.8, 1.2]], C.dark, 1.6); pg(g, [[-1.8, 0.6], [0, -3.6], [2, 0.6]], '#ff9db9', 0); g.restore(); void sd; } }
    if (e === 'cow') { for (const sx2 of [-4.6, 5]) { g.save(); g.translate(sx2, -19.4); g.rotate(sx2 > 0 ? 0.3 : -0.3); pg(g, [[-1.9, 1.4], [-0.5, -5], [1.9, 1.4]], '#f6e8c0', 1.5); g.restore(); } for (const [ex2, rot] of [[-11.4, 0.7], [12.4, -0.5]]) { g.save(); g.translate(ex2, -11); g.rotate(rot); el(g, 0, 0, 4.2, 2.6, C.acc, 1.5); g.restore(); } }
    if (e === 'tuft') { pg(g, [[-1.2, -19.8], [-3.6, -26], [1, -22], [2.6, -27], [4.4, -20.4]], C.body, 1.5); }
    if (e === 'goat') { for (const sx2 of [-4.2, 4.2]) { g.beginPath(); g.moveTo(sx2, -19.2); g.bezierCurveTo(sx2 - 3, -27, sx2 - 8, -26, sx2 - 8.4, -21); g.lineWidth = 3.8; g.strokeStyle = OLN; g.stroke(); g.lineWidth = 2; g.strokeStyle = '#f3e8d2'; g.stroke(); } }
    if (e === 'sheep') { for (const [cx, cy, r] of [[-3.6, -19.4, 3.8], [3.4, -19.8, 4], [0, -21.6, 3.6]]) cir(g, cx, cy, r, C.body, 1.5); }
  }
  if (cs.glasses) glassesC(g, cs.glasses, 2, t);
  if (cs.hat === '-') { /* bez čepice */ } else if (cs.hat) hatC(g, cs.hat, 2, t);
}
const portraitCache = new Map();
/** Obrázek postavičky pro menu, čekárnu a hlavičky hráčů (data URL, cachuje se). cs = kosmetika { hat, glasses, boots, back }. */
export function portraitURL(ci, px = 96, mood, cs) {
  cs = cs || {}; const key = ci + ':' + px + ':' + (mood || '') + '|' + (cs.hat || '') + '|' + (cs.glasses || '') + '|' + (cs.boots || '') + '|' + (cs.back || ''); if (portraitCache.has(key)) return portraitCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d'); const sc = px / 1.55; g.setTransform(sc, 0, 0, sc, px * 0.5, px * 0.6);
  drawAnimal(g, ci, 0, 0, { face: 1, t: 0.3, gr: true, dance: mood === 'win', cs });
  const url = c.toDataURL(); portraitCache.set(key, url); return url;
}
const cosmCache = new Map();
const ZOOM = { hat: [2.6, -0.62], glasses: [3.1, -0.25], boots: [2.9, 0.38], back: [2.0, -0.05] };
/** Náhled věci z obchodu: zvířátko `ci` s touhle jednou věcí, přiblížené na příslušnou část (id '' = originál, '-' = bez čepice). */
export function cosmURL(cat, id, ci = 0) {
  const key = cat + ':' + id + ':' + ci; let u = cosmCache.get(key); if (u) return u;
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'); const [z, cy] = ZOOM[cat] || [2, 0]; const sc = 96 / (1.55 / z * 1.55 * 0.64) / 1.55 * 1.0;
  void sc; const s2 = 48 * 0.55 * z; g.setTransform(s2, 0, 0, s2, 48, 48 - cy * s2);
  drawAnimal(g, ci, 0, 0, { face: 1, t: 0.4, gr: true, cs: { [cat]: id } });
  u = c.toDataURL(); cosmCache.set(key, u); return u;
}

// ------------------------------------------------------------------ dlaždice a terén
export const THEMES = {
  meadow: { sky: ['#8fd8ff', '#d9f4ff'], top: '#62d05a', topDk: '#3da13a', body: '#b0713d', bodyDk: '#8a5628', ice: '#bfeeff', pebble: '#d6a46a' },
  snow: { sky: ['#6e86c8', '#d3dcf5'], top: '#ffffff', topDk: '#c9d6ee', body: '#66748f', bodyDk: '#4b5873', ice: '#b5ecff', pebble: '#8d9bb7' },
  cave: { sky: ['#1d1534', '#3b2a63'], top: '#a07be6', topDk: '#7b55c4', body: '#4f4378', bodyDk: '#382e5a', ice: '#9ee7ff', pebble: '#7a6aa8' },
  desert: { sky: ['#ffcf8a', '#fff1cf'], top: '#f4d27c', topDk: '#d9a94c', body: '#d49a52', bodyDk: '#b57a32', ice: '#bfeeff', pebble: '#ecc383', noBlades: true },
  forest: { sky: ['#8fd9b4', '#eaf9cf'], top: '#4fbf5a', topDk: '#2f8f3f', body: '#7a5232', bodyDk: '#5c3b22', ice: '#bfeeff', pebble: '#a8794a' },
  volcano: { sky: ['#2b1020', '#a8401c'], top: '#ff8a3a', topDk: '#c4491a', body: '#43303b', bodyDk: '#2e2029', ice: '#bfeeff', pebble: '#6a4a58', noBlades: true },
  candy: { sky: ['#ffd0ea', '#e4f6ff'], top: '#ff7eb6', topDk: '#e0559a', body: '#ffe6f2', bodyDk: '#ffc9e3', ice: '#c8f1ff', pebble: '#ff9ac8', noBlades: true },
  space: { sky: ['#05051a', '#241b5c'], top: '#d8dbea', topDk: '#a0a4bb', body: '#80849c', bodyDk: '#5d6078', ice: '#bfeeff', pebble: '#a6aac2', noBlades: true },
  beach: { sky: ['#62cdfb', '#e6faff'], top: '#fbe9a6', topDk: '#e7c56e', body: '#ebc57d', bodyDk: '#cd9f4f', ice: '#bfeeff', pebble: '#f6df9f', noBlades: true },
  sky: { sky: ['#4aaeff', '#d9f2ff'], top: '#ffffff', topDk: '#cfe1fb', body: '#eef5ff', bodyDk: '#cfe0f8', ice: '#b5ecff', pebble: '#ffffff', noBlades: true },
};
function terrainCell(g, th, x, y, kind, up, left, right, down) {
  const T = THEMES[th];
  if (kind === K.T.BOUNCE) { solidCell(g, K.T.BOUNCE, x, y, '#fff', {}); return; }
  if (kind === K.T.ICE) { rrect(g, x + 0.02, y + 0.02, 0.96, 0.96, 0.12, T.ice, 0.055); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x + 0.12, y + 0.14, 0.5, 0.08); g.fillRect(x + 0.12, y + 0.3, 0.22, 0.06); return; }
  g.fillStyle = T.body; g.fillRect(x, y, 1, 1);
  g.fillStyle = T.bodyDk; for (let i = 0; i < 3; i++) { const h = hash(x, y, i + 1); ell(g, x + 0.15 + h * 0.7, y + 0.2 + hash(x, y, i + 9) * 0.65, 0.08 + h * 0.06, 0.06, T.pebble, 0); }
  g.strokeStyle = INK; g.lineWidth = 0.055; g.lineCap = 'butt';
  if (!up) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1, y); g.stroke(); }
  if (!down) { g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + 1, y + 1); g.stroke(); }
  if (!left) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 1); g.stroke(); }
  if (!right) { g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + 1, y + 1); g.stroke(); }
  if (!up) { g.fillStyle = T.top; g.fillRect(x - (left ? 0 : -0.03), y + 0.03, 1 + (left ? 0 : -0.03) + (right ? 0 : -0.03), 0.26); g.fillStyle = T.topDk; g.fillRect(x, y + 0.26, 1, 0.07); if (!T.noBlades && th !== 'snow') for (let i = 0; i < 3; i++) { const bx = x + 0.12 + i * 0.3 + hash(x, y, i) * 0.1; poly(g, [[bx, y + 0.33], [bx + 0.06, y + 0.4 + hash(x, y, i + 4) * 0.08], [bx + 0.12, y + 0.33]], T.topDk, 0); } g.strokeStyle = INK; g.lineWidth = 0.055; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1, y); g.stroke(); }
}
/** Pevná část hřiště (rects stage) – kreslí se jednou do mezipaměti. */
export function drawTerrain(g, S) {
  const cells = new Map(); for (const [x, y, w, h, t] of S.rects) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cells.set(j * COLS + i, t);
  const has = (i, j) => (i < 0 || i >= COLS ? true : cells.has(j * COLS + i));
  for (const [k, t] of cells) { const x = k % COLS, y = Math.floor(k / COLS); terrainCell(g, S.theme, x, y, t, has(x, y - 1), has(x - 1, y), has(x + 1, y), has(x, y + 1) || y + 1 >= ROWS); }
}
/** Pozadí podle motivu (obloha, kopce nebo skály, třpytky). */
export function drawBackground(g, th, t = 0) {
  const T = THEMES[th]; const gr = g.createLinearGradient(0, 0, 0, ROWS); gr.addColorStop(0, T.sky[0]); gr.addColorStop(1, T.sky[1]); g.fillStyle = gr; g.fillRect(0, 0, COLS, ROWS);
  if (th === 'meadow') {
    ell(g, 26, 3, 1.6, 1.6, '#ffe45c', 0.07); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.moveTo(26 + Math.cos(a) * 2.1, 3 + Math.sin(a) * 2.1); g.lineTo(26 + Math.cos(a) * 2.7, 3 + Math.sin(a) * 2.7); g.lineWidth = 0.1; g.strokeStyle = '#ffd23a'; g.lineCap = 'round'; g.stroke(); }
    for (const [cx, cy, s] of [[6, 3.5, 1], [15, 2.2, 0.8], [21, 5.5, 1.1]]) { for (const [dx, dy, r] of [[-0.9, 0.2, 0.7], [0, -0.2, 0.9], [0.95, 0.2, 0.7]]) ell(g, cx + dx * s, cy + dy * s, r * s, r * s * 0.8, '#ffffff', 0.06); }
    for (const [cx, w, h, c] of [[6, 11, 4.5, '#8fd36a'], [20, 14, 5.5, '#7bc95a'], [31, 9, 4, '#8fd36a']]) { g.beginPath(); g.ellipse(cx, 16.2, w, h, 0, Math.PI, TAU); g.fillStyle = c; g.fill(); g.lineWidth = 0.06; g.strokeStyle = INK; g.stroke(); }
  } else if (th === 'snow') {
    for (const [cx, h, w] of [[5, 9, 6], [13, 11, 7], [24, 10, 7], [31, 8, 5]]) { poly(g, [[cx - w, 17], [cx, 17 - h], [cx + w, 17]], '#9aa9d6', 0.07); poly(g, [[cx - w * 0.36, 17 - h * 0.64], [cx, 17 - h], [cx + w * 0.36, 17 - h * 0.64], [cx + w * 0.12, 17 - h * 0.7], [cx, 17 - h * 0.6], [cx - w * 0.15, 17 - h * 0.7]], '#ffffff', 0.05); }
    for (let i = 0; i < 40; i++) { const x = hash(i, 1) * COLS, y = hash(i, 2) * ROWS; ell(g, x, y, 0.06 + hash(i, 3) * 0.05, 0.06 + hash(i, 3) * 0.05, 'rgba(255,255,255,.8)', 0); }
  } else if (th === 'desert') {
    ell(g, 5.5, 4, 1.7, 1.7, '#ffb62e', 0.07); ell(g, 5.5, 4, 1.15, 1.15, '#ffd45c', 0);
    for (const [cx, w, h] of [[19, 5, 5.5], [25.5, 3.4, 3.6]]) { poly(g, [[cx - w, 16.5], [cx, 16.5 - h], [cx + w, 16.5]], '#e8bd6b', 0.07); poly(g, [[cx, 16.5 - h], [cx + w, 16.5], [cx + w * 0.25, 16.5]], '#cf9c4a', 0); g.beginPath(); g.moveTo(cx - w, 16.5); g.lineTo(cx, 16.5 - h); g.lineTo(cx + w, 16.5); g.lineWidth = 0.07; g.strokeStyle = INK; g.stroke(); }
    for (const [cx, w, h, c] of [[8, 9, 3.2, '#f3cf82'], [22, 12, 3.8, '#efc673'], [32, 8, 3, '#f3cf82']]) { g.beginPath(); g.ellipse(cx, 16.4, w, h, 0, Math.PI, TAU); g.fillStyle = c; g.fill(); g.lineWidth = 0.06; g.strokeStyle = INK; g.stroke(); }
    for (const [cx, by, hh] of [[8.5, 15.8, 2.6], [14.8, 15.6, 2], [23.8, 15.9, 2.4]]) { rrect(g, cx - 0.22, by - hh, 0.44, hh, 0.2, '#58b45a', 0.06); rrect(g, cx - 0.9, by - hh * 0.62, 0.34, 0.3, 0.14, '#58b45a', 0.05); rrect(g, cx - 0.9, by - hh * 0.62 - 0.55, 0.3, 0.7, 0.14, '#58b45a', 0.05); rrect(g, cx + 0.56, by - hh * 0.42, 0.34, 0.3, 0.14, '#58b45a', 0.05); rrect(g, cx + 0.6, by - hh * 0.42 - 0.5, 0.3, 0.68, 0.14, '#58b45a', 0.05); }
    for (let i = 0; i < 6; i++) { const x = 2 + i * 5.2 + hash(i, 3) * 2, y = 1.5 + hash(i, 4) * 5; g.beginPath(); g.ellipse(x, y, 1.1, 0.22, 0, 0, TAU); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill(); }
  } else if (th === 'forest') {
    for (const [x0, w] of [[3, 3], [11, 2.4], [21, 3.4]]) { const gr2 = g.createLinearGradient(0, 0, 0, 14); gr2.addColorStop(0, 'rgba(255,255,205,.55)'); gr2.addColorStop(1, 'rgba(255,255,205,0)'); g.fillStyle = gr2; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + w, 0); g.lineTo(x0 + w + 4, 15); g.lineTo(x0 + 3, 15); g.closePath(); g.fill(); }
    for (let i = 0; i < 9; i++) { const x = i * 4 + hash(i, 1) * 1.6, h = 8 + hash(i, 2) * 5; rrect(g, x - 0.45, 17 - h, 0.9, h, 0.2, '#86b56f', 0); for (const [dx, dy, r] of [[0, 0, 2.2], [-1.4, 0.9, 1.5], [1.5, 0.8, 1.6]]) ell(g, x + dx, 17 - h + dy, r, r * 0.9, '#98c982', 0); }
    for (const [x, h, c] of [[1.8, 13, '#4fa95c'], [10.8, 15, '#3f9a52'], [17.2, 13.5, '#4fa95c'], [25.2, 15.5, '#3f9a52'], [31, 12, '#4fa95c']]) {
      rrect(g, x - 0.7, 17 - h, 1.4, h, 0.3, '#8c5c36', 0.07); g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x + 0.1, 17 - h + 0.8, 0.5, h - 0.8); for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x - 0.4, 17 - h + 2 + k * 2.4); g.lineTo(x - 0.1, 17 - h + 2.4 + k * 2.4); g.lineWidth = 0.05; g.strokeStyle = 'rgba(60,35,15,.5)'; g.stroke(); }
      for (const [dx, dy, r] of [[-1.7, 1.6, 2], [0, 0, 2.7], [1.9, 1.4, 2], [0.1, 2.7, 2.3]]) ell(g, x + dx, 17 - h + dy, r, r * 0.86, c, 0.07); ell(g, x - 0.9, 17 - h - 0.5, 1, 0.6, 'rgba(255,255,255,.2)', 0, -0.3);
    }
    for (const [x, y, s2] of [[6.4, 15, 1], [11.6, 13, 0.8], [15.6, 11, 1], [20.4, 9, 0.8], [24.7, 7, 1], [26.6, 11, 0.7], [30.4, 13, 1]]) { rrect(g, x - 0.1 * s2, y - 0.5 * s2, 0.2 * s2, 0.5 * s2, 0.06, '#f4ead2', 0.05); g.beginPath(); g.ellipse(x, y - 0.52 * s2, 0.42 * s2, 0.32 * s2, 0, Math.PI, TAU); g.closePath(); g.fillStyle = '#e8433c'; g.fill(); g.lineWidth = 0.055; g.strokeStyle = INK; g.stroke(); for (const dx of [-0.2, 0.05, 0.22]) ell(g, x + dx * s2, y - 0.62 * s2 - Math.abs(dx) * 0.2, 0.06 * s2, 0.05 * s2, '#fff', 0); }
    for (let i = 0; i < 26; i++) ell(g, hash(i, 11) * COLS, 1 + hash(i, 12) * 13, 0.05, 0.05, 'rgba(255,245,150,.8)', 0);
  } else if (th === 'volcano') {
    const gl = g.createRadialGradient(16, 14, 1, 16, 14, 17); gl.addColorStop(0, 'rgba(255,160,50,.6)'); gl.addColorStop(1, 'rgba(255,90,30,0)'); g.fillStyle = gl; g.fillRect(0, 0, COLS, ROWS);
    for (let i = 0; i < 40; i++) ell(g, hash(i, 21) * COLS, hash(i, 22) * 8, 0.04 + hash(i, 23) * 0.04, 0.04 + hash(i, 23) * 0.04, 'rgba(255,220,180,.55)', 0);
    for (const [cx, w, h] of [[4, 6, 6], [28, 6.5, 7]]) poly(g, [[cx - w, 17], [cx - 0.9, 17 - h], [cx + 0.9, 17 - h], [cx + w, 17]], '#2f1d27', 0.07);
    poly(g, [[7, 17], [13, 7.5], [14.6, 6.6], [17.4, 6.6], [19, 7.5], [25, 17]], '#3a2531', 0.08); poly(g, [[16, 6.6], [14.6, 6.6], [13, 7.5], [15, 9], [14.4, 11], [16.2, 13.5], [15.4, 17], [17.6, 17], [17.2, 13], [18.2, 10.5], [17.2, 8.5], [19, 7.5], [17.4, 6.6]], '#ff7a2a', 0); ell(g, 16, 6.6, 1.5, 0.45, '#ffcf5a', 0.06);
    for (const [x, y, r, a] of [[16, 5.2, 1.1, 0.5], [17.2, 3.8, 1.5, 0.45], [15.4, 2.2, 1.9, 0.38], [17.5, 0.6, 2.2, 0.3]]) ell(g, x, y, r, r * 0.8, `rgba(90,70,80,${a})`, 0);
    for (let i = 0; i < 18; i++) { const x = 11 + hash(i, 31) * 10, y = 1 + hash(i, 32) * 8; ell(g, x, y, 0.07, 0.07, i % 3 ? '#ff9a3a' : '#ffd24a', 0); }
    const lv = g.createLinearGradient(0, 16.2, 0, 18); lv.addColorStop(0, '#ffb23a'); lv.addColorStop(0.5, '#ff6a1f'); lv.addColorStop(1, '#c8300f'); g.fillStyle = lv; g.beginPath(); g.moveTo(0, 16.4); for (let x = 0; x <= COLS; x += 0.5) g.lineTo(x, 16.3 + Math.sin(x * 1.3) * 0.14); g.lineTo(COLS, ROWS); g.lineTo(0, ROWS); g.closePath(); g.fill(); g.lineWidth = 0.06; g.strokeStyle = INK; g.stroke();
    for (let i = 0; i < 10; i++) ell(g, hash(i, 41) * COLS, 16.9 + hash(i, 42) * 0.8, 0.12 + hash(i, 43) * 0.1, 0.07, 'rgba(255,230,140,.8)', 0);
  } else if (th === 'candy') {
    const cols = ['#ff6b6b', '#ffa94d', '#ffe066', '#8ce99a', '#74c0fc', '#b197fc']; g.lineCap = 'butt'; cols.forEach((c, i) => { g.beginPath(); g.arc(16, 17.5, 13.8 - i * 0.62, Math.PI, TAU); g.lineWidth = 0.64; g.strokeStyle = c; g.globalAlpha = 0.85; g.stroke(); }); g.globalAlpha = 1;
    for (const [cx, cy, s2] of [[5, 3.4, 1.1], [14, 2.2, 0.8], [25, 3.6, 1.2]]) for (const [dx, dy, r] of [[-1, 0.25, 0.7], [0, -0.2, 1], [1.05, 0.25, 0.75]]) ell(g, cx + dx * s2, cy + dy * s2, r * s2, r * s2 * 0.78, 'rgba(255,255,255,.95)', 0.05);
    for (const [x, y, r, c1] of [[3, 12, 1.1, '#ff6b9a'], [11, 9.5, 0.9, '#6ad0ff'], [20.5, 13.5, 1.05, '#ffcf3a'], [30.5, 7.5, 1, '#ff8ad8']]) { rrect(g, x - 0.09, y, 0.18, 17 - y, 0.09, '#fff7ec', 0.06); ell(g, x, y, r, r, '#fff', 0.07); g.save(); g.beginPath(); g.arc(x, y, r - 0.04, 0, TAU); g.clip(); g.strokeStyle = c1; g.lineWidth = 0.18; for (let a = 0; a < 3.4; a += 0.34) { g.beginPath(); for (let u = 0; u < 12; u += 0.4) g.lineTo(x + Math.cos(u + a) * (u / 12) * r * 1.05, y + Math.sin(u + a) * (u / 12) * r * 1.05); g.stroke(); break; } g.restore(); ell(g, x, y, r, r, null, 0.07); }
    for (const [x, y] of [[7.5, 17], [23, 17]]) { g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 3.2); g.arc(x + 0.7, y - 3.2, 0.7, Math.PI, 0); g.lineWidth = 0.44; g.strokeStyle = INK; g.stroke(); g.lineWidth = 0.3; g.strokeStyle = '#fff'; g.stroke(); g.save(); g.strokeStyle = '#ff4f6e'; g.lineWidth = 0.3; g.setLineDash([0.3, 0.45]); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 3.2); g.arc(x + 0.7, y - 3.2, 0.7, Math.PI, 0); g.stroke(); g.restore(); }
    for (const [cx, w, h, c] of [[9, 7, 3.2, '#ffc2de'], [24, 9, 3.8, '#c9f0d8'], [1, 5, 3, '#c9e4ff'], [31, 6, 3, '#ffe2a8']]) { g.beginPath(); g.ellipse(cx, 16.6, w, h, 0, Math.PI, TAU); g.fillStyle = c; g.fill(); g.lineWidth = 0.06; g.strokeStyle = INK; g.stroke(); }
    for (let i = 0; i < 30; i++) { const x = hash(i, 51) * COLS, y = 1 + hash(i, 52) * 13; ell(g, x, y, 0.07, 0.07, ['#ff7eb6', '#ffe066', '#74c0fc', '#8ce99a'][i % 4], 0); }
  } else if (th === 'space') {
    for (const [cx, cy, c, r] of [[6, 5, 'rgba(120,60,200,.35)', 8], [26, 10, 'rgba(255,90,170,.25)', 9], [16, 3, 'rgba(60,120,255,.22)', 7]]) { const n = g.createRadialGradient(cx, cy, 0, cx, cy, r); n.addColorStop(0, c); n.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = n; g.fillRect(0, 0, COLS, ROWS); }
    for (let i = 0; i < 110; i++) { const r = 0.035 + hash(i, 62) * 0.06; ell(g, hash(i, 61) * COLS, hash(i, 63) * 16, r, r, i % 9 ? 'rgba(255,255,255,.85)' : '#ffe9a8', 0); }
    const pg = g.createRadialGradient(24, 5, 0.3, 24, 5, 3.4); pg.addColorStop(0, '#b39bff'); pg.addColorStop(1, '#5d3fd3'); g.save(); g.beginPath(); g.arc(24, 5, 3.3, 0, TAU); g.fillStyle = pg; g.fill(); g.lineWidth = 0.08; g.strokeStyle = INK; g.stroke(); g.clip(); g.fillStyle = 'rgba(255,255,255,.14)'; for (const dy of [-1.2, -0.2, 0.9]) g.fillRect(20, 5 + dy, 8, 0.4); g.restore();
    g.save(); g.translate(24, 5); g.rotate(-0.35); g.beginPath(); g.ellipse(0, 0, 5.6, 1.15, 0, Math.PI, TAU); g.lineWidth = 0.34; g.strokeStyle = 'rgba(255,214,140,.9)'; g.stroke(); g.restore(); ell(g, 24, 5, 3.3, 3.3, null, 0.08);
    g.save(); g.translate(24, 5); g.rotate(-0.35); g.beginPath(); g.ellipse(0, 0, 5.6, 1.15, 0, 0, Math.PI); g.lineWidth = 0.34; g.strokeStyle = 'rgba(255,214,140,.9)'; g.stroke(); g.restore();
    const eg = g.createRadialGradient(5.6, 4.2, 0.2, 5.6, 4.2, 1.6); eg.addColorStop(0, '#8fd4ff'); eg.addColorStop(1, '#2b6fd6'); g.beginPath(); g.arc(6, 4.4, 1.5, 0, TAU); g.fillStyle = eg; g.fill(); g.lineWidth = 0.07; g.strokeStyle = INK; g.stroke(); ell(g, 5.5, 4.2, 0.5, 0.3, '#6fcf7a', 0, 0.5); ell(g, 6.5, 4.9, 0.35, 0.22, '#6fcf7a', 0, -0.4);
    g.beginPath(); g.moveTo(14, 2); g.lineTo(11, 3.6); g.lineWidth = 0.06; g.strokeStyle = 'rgba(255,255,255,.8)'; g.stroke();
    for (const [cx, w, h] of [[6, 9, 2.4], [20, 12, 3], [31, 7, 2.6]]) { g.beginPath(); g.ellipse(cx, 16.8, w, h, 0, Math.PI, TAU); g.fillStyle = '#5a5e7a'; g.fill(); g.lineWidth = 0.06; g.strokeStyle = INK; g.stroke(); }
    for (const [x, y, r] of [[4, 15.4, 0.8], [11, 15.8, 0.5], [18, 14.8, 0.9], [24, 15.6, 0.6], [29, 15.2, 0.5]]) { ell(g, x, y, r, r * 0.45, '#474a63', 0.04); }
  } else if (th === 'beach') {
    ell(g, 5, 3.4, 1.6, 1.6, '#fff08a', 0.07); const sg = g.createRadialGradient(5, 3.4, 1.6, 5, 3.4, 4.4); sg.addColorStop(0, 'rgba(255,240,150,.5)'); sg.addColorStop(1, 'rgba(255,240,150,0)'); g.fillStyle = sg; g.fillRect(0, 0, 12, 9);
    for (const [cx, cy, s2] of [[14, 2.6, 1], [22, 4.4, 1.2], [29, 2.2, 0.8]]) for (const [dx, dy, r] of [[-0.9, 0.2, 0.7], [0, -0.2, 0.9], [0.95, 0.2, 0.7]]) ell(g, cx + dx * s2, cy + dy * s2, r * s2, r * s2 * 0.8, '#ffffff', 0.06);
    const sea = g.createLinearGradient(0, 10.5, 0, 18); sea.addColorStop(0, '#53d0f7'); sea.addColorStop(1, '#1c86d6'); g.fillStyle = sea; g.fillRect(0, 10.6, COLS, 8); g.beginPath(); g.moveTo(0, 10.6); g.lineTo(COLS, 10.6); g.lineWidth = 0.07; g.strokeStyle = INK; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineWidth = 0.08; g.lineCap = 'round'; for (let j = 0; j < 7; j++) for (let i = 0; i < 9; i++) { const x = ((i * 4.1 + j * 1.9) % (COLS + 2)), y = 11.3 + j * 1.05; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 0.35, y - 0.22, x + 0.7, y); g.quadraticCurveTo(x + 1.05, y + 0.22, x + 1.4, y); g.stroke(); }
    poly(g, [[12.5, 10.6], [13.1, 8], [13.1, 10.6]], '#fff', 0.05); poly(g, [[13.3, 10.6], [13.3, 7.6], [15, 10.6]], '#ffd0d0', 0.05); poly(g, [[12.2, 10.7], [15.4, 10.7], [14.7, 11.35], [12.9, 11.35]], '#8a5628', 0.05);
    for (const [x, y, b2] of [[4.8, 14, 1], [9.6, 15, -1], [14.6, 13, 1], [19.4, 11, -1], [29.4, 10, 1]]) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + b2 * 0.5, y - 1.8, x + b2 * 0.2, y - 3.4); g.lineWidth = 0.4; g.strokeStyle = INK; g.stroke(); g.lineWidth = 0.26; g.strokeStyle = '#a8703a'; g.stroke(); const tx = x + b2 * 0.2, ty = y - 3.4; for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k - 2.5) * 0.62; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(a) * 1.2, ty + Math.sin(a) * 1.0 - 0.3, tx + Math.cos(a) * 1.9, ty + Math.sin(a) * 1.5 + 0.7); g.lineWidth = 0.3; g.strokeStyle = INK; g.stroke(); g.lineWidth = 0.18; g.strokeStyle = '#3fb85a'; g.stroke(); } ell(g, tx - 0.12, ty + 0.1, 0.14, 0.14, '#7a4a1e', 0.04); ell(g, tx + 0.14, ty + 0.14, 0.14, 0.14, '#7a4a1e', 0.04); }
    g.lineWidth = 0.07; g.strokeStyle = INK; g.beginPath(); g.moveTo(15.2, 13); g.lineTo(15.2, 10.4); g.stroke(); g.beginPath(); g.moveTo(13.6, 11.1); g.quadraticCurveTo(15.2, 9.2, 16.9, 11.1); g.closePath(); g.fillStyle = '#ff6b6b'; g.fill(); g.stroke();
    for (const [x, y] of [[9, 5.5], [24, 6.6], [27.5, 3.4]]) { g.beginPath(); g.moveTo(x - 0.35, y); g.quadraticCurveTo(x - 0.15, y - 0.3, x, y); g.quadraticCurveTo(x + 0.15, y - 0.3, x + 0.35, y); g.lineWidth = 0.07; g.strokeStyle = '#2b3b5e'; g.stroke(); }
  } else if (th === 'sky') {
    ell(g, 27, 3.2, 1.5, 1.5, '#fff2a8', 0.07);
    for (const [cx, cy, s] of [[5, 3, 1.1], [14, 1.8, 0.8], [21, 3.6, 1.2], [29.5, 6.4, 0.9], [9, 7, 0.9]]) for (const [dx, dy, r] of [[-1, 0.25, 0.7], [0, -0.2, 1], [1.05, 0.25, 0.75], [0.1, 0.35, 0.9]]) ell(g, cx + dx * s, cy + dy * s, r * s, r * s * 0.78, 'rgba(255,255,255,.92)', 0);
    for (const [cx, cy] of [[11, 16.2], [19, 16.8], [27, 16.4], [3, 16.9], [32, 16.8]]) for (const [dx, dy, r] of [[-1.7, 0.2, 1.5], [0, -0.4, 2.1], [1.8, 0.2, 1.6]]) ell(g, cx + dx, cy + dy, r, r * 0.85, '#f2f9ff', 0.07);
    for (const [bx, by] of [[8, 5], [22, 2.2], [25, 12]]) { g.beginPath(); g.moveTo(bx - 0.35, by); g.quadraticCurveTo(bx - 0.15, by - 0.3, bx, by); g.quadraticCurveTo(bx + 0.15, by - 0.3, bx + 0.35, by); g.lineWidth = 0.07; g.strokeStyle = '#2b3b5e'; g.lineCap = 'round'; g.stroke(); }
  } else {
    for (let i = 0; i < 14; i++) { const x = i * 2.4 + hash(i, 5) * 1.4, h = 1 + hash(i, 6) * 2.6; poly(g, [[x - 0.7, 2], [x + 0.7, 2], [x, 2 + h]], '#2a1f48', 0.06); }
    for (const [cx, cy, c] of [[4, 12, '#6fe0ff'], [28, 14, '#ff8ae0'], [23, 5, '#7dffb0'], [10, 5, '#ffe36f']]) { poly(g, [[cx - 0.3, cy + 1], [cx - 0.1, cy], [cx + 0.1, cy + 1]], c, 0.05); poly(g, [[cx + 0.0, cy + 1], [cx + 0.25, cy + 0.3], [cx + 0.45, cy + 1]], c, 0.05); }
    for (let i = 0; i < 30; i++) { const x = hash(i, 7) * COLS, y = 2 + hash(i, 8) * 14; ell(g, x, y, 0.05, 0.05, 'rgba(210,190,255,.55)', 0); }
  }
}

// ------------------------------------------------------------------ kusy
const FACE_ROT = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
function solidCell(g, tile, x, y, own, o) {
  if (tile === K.T.ICE) { rrect(g, x + 0.03, y + 0.05, 0.94, 0.9, 0.14, '#c4f1ff', 0.06); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(x + 0.14, y + 0.16, 0.42, 0.08); g.fillRect(x + 0.14, y + 0.3, 0.16, 0.06); return; }
  if (tile === K.T.BOUNCE) {   // pružina; o.face = kam střílí (0 nahoru, 1 doprava, 2 dolů, 3 doleva), otočená je přišroubovaná na stěnu
    const c = o.bounce || 0, sq = 1 - c * 0.35; g.save(); g.translate(x + 0.5, y + 0.5); g.rotate(FACE_ROT[o.face | 0]);
    rrect(g, -0.47, 0.05, 0.94, 0.42, 0.1, '#7a6f9b', 0.06); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(-0.38, 0.1, 0.76, 0.06);
    g.save(); g.translate(0, 0.08); g.scale(1, sq);
    g.beginPath(); g.moveTo(-0.34, 0); g.bezierCurveTo(-0.34, -0.34, 0.34, -0.34, 0.34, 0); g.closePath(); g.fillStyle = '#ff5a6e'; g.fill(); g.lineWidth = 0.06; g.strokeStyle = INK; g.stroke(); ell(g, -0.1, -0.15, 0.08, 0.05, 'rgba(255,255,255,.6)', 0); g.restore();
    if (o.face) { g.fillStyle = '#7a6f9b'; for (const sx of [-0.36, 0.36]) ell(g, sx, 0.26, 0.04, 0.04, '#d8d2ea', 0.03); }
    g.restore(); return;
  }
  if (tile === K.T.CRUMBLE) {
    const sh = o.shake ? Math.sin(o.shake * 90) * 0.03 : 0; g.save(); g.translate(sh, 0);
    rrect(g, x + 0.02, y + 0.06, 0.96, 0.88, 0.1, '#d6b479', 0.06); g.strokeStyle = '#7c5a2a'; g.lineWidth = 0.045; g.beginPath(); g.moveTo(x + 0.3, y + 0.08); g.lineTo(x + 0.42, y + 0.4); g.lineTo(x + 0.3, y + 0.62); g.lineTo(x + 0.46, y + 0.92); g.moveTo(x + 0.42, y + 0.4); g.lineTo(x + 0.72, y + 0.5); g.stroke(); g.restore(); return;
  }
  rrect(g, x + 0.02, y + 0.04, 0.96, 0.92, 0.1, '#d9a35d', 0.06);
  g.fillStyle = '#eec27f'; g.fillRect(x + 0.1, y + 0.1, 0.8, 0.12); g.strokeStyle = '#a06a2c'; g.lineWidth = 0.04; g.beginPath(); g.moveTo(x + 0.1, y + 0.62); g.lineTo(x + 0.9, y + 0.62); g.moveTo(x + 0.1, y + 0.8); g.lineTo(x + 0.55, y + 0.8); g.stroke();
  ell(g, x + 0.17, y + 0.5, 0.045, 0.045, '#5b3a17', 0); ell(g, x + 0.83, y + 0.5, 0.045, 0.045, '#5b3a17', 0);
  ell(g, x + 0.84, y + 0.16, 0.07, 0.07, own, 0.035);
}
function spikeCell(g, x, y, face, own) {
  g.save(); g.translate(x + 0.5, y + 0.5); g.rotate(FACE_ROT[face]); rrect(g, -0.46, 0.28, 0.92, 0.2, 0.05, '#6c7385', 0.055);
  for (const dx of [-0.24, 0.24]) poly(g, [[dx - 0.2, 0.3], [dx, -0.34], [dx + 0.2, 0.3]], '#e6ebf5', 0.055);
  for (const dx of [-0.24, 0.24]) { g.beginPath(); g.moveTo(dx - 0.05, 0.2); g.lineTo(dx, -0.15); g.lineWidth = 0.035; g.strokeStyle = 'rgba(120,130,150,.8)'; g.stroke(); }
  ell(g, 0, 0.38, 0.04, 0.04, own, 0); g.restore();
}
export function sawShape(g, cx, cy, r, t, own) {
  g.save(); g.translate(cx, cy); g.rotate(t * 9);
  g.beginPath(); const n = 10; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU, rr = i % 2 ? r * 0.78 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fillStyle = '#d6dbe6'; g.fill(); g.lineWidth = 0.06; g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
  ell(g, 0, 0, r * 0.5, r * 0.5, '#9aa3b8', 0.05); ell(g, 0, 0, r * 0.16, r * 0.16, own, 0.04);
  g.beginPath(); g.moveTo(-r * 0.4, 0); g.lineTo(r * 0.4, 0); g.moveTo(0, -r * 0.4); g.lineTo(0, r * 0.4); g.lineWidth = 0.04; g.strokeStyle = 'rgba(40,40,60,.55)'; g.stroke(); g.restore();
}
function deviceBase(g, x, y, own) { rrect(g, x + 0.04, y + 0.04, 0.92, 0.92, 0.12, '#59607a', 0.06); g.fillStyle = '#7a829e'; g.fillRect(x + 0.12, y + 0.1, 0.76, 0.08); ell(g, x + 0.16, y + 0.84, 0.04, 0.04, own, 0); ell(g, x + 0.84, y + 0.84, 0.04, 0.04, own, 0); }
function cannonShape(g, x, y, face, own, recoil = 0) {
  deviceBase(g, x, y, own); g.save(); g.translate(x + 0.5, y + 0.5); g.rotate(FACE_ROT[face]);
  rrect(g, -0.17, -0.52 + recoil * 0.1, 0.34, 0.6, 0.06, '#2f3447', 0.055); rrect(g, -0.22, -0.56 + recoil * 0.1, 0.44, 0.14, 0.04, '#444b66', 0.05); ell(g, 0, 0.1, 0.22, 0.22, '#3c4260', 0.055); ell(g, -0.07, 0.03, 0.06, 0.05, 'rgba(255,255,255,.35)', 0); g.restore();
}
function flameShape(g, x, y, face, own) {
  deviceBase(g, x, y, own); g.save(); g.translate(x + 0.5, y + 0.5); g.rotate(FACE_ROT[face]);
  rrect(g, -0.13, -0.46, 0.26, 0.44, 0.05, '#c8cfe0', 0.05); rrect(g, -0.19, -0.5, 0.38, 0.1, 0.04, '#e24a3a', 0.05); ell(g, 0, 0.12, 0.16, 0.14, '#444b66', 0.05); g.restore();
}
// ------------------------------------------------------------------ nové pasti: pevná část (základna) a pohyblivá část (podle tiku)
function roundPlate(g, x, y, own) { rrect(g, x + 0.04, y + 0.04, 0.92, 0.92, 0.16, '#59607a', 0.06); g.fillStyle = '#7a829e'; g.fillRect(x + 0.14, y + 0.1, 0.72, 0.07); ell(g, x + 0.14, y + 0.86, 0.04, 0.04, own, 0); ell(g, x + 0.86, y + 0.86, 0.04, 0.04, own, 0); }
function bladeHub(g, x, y, own) { roundPlate(g, x, y, own); ell(g, x + 0.5, y + 0.5, 0.2, 0.2, '#c8cfe0', 0.05); }
function pendAnchor(g, x, y, own) { roundPlate(g, x, y, own); ell(g, x + 0.5, y + 0.5, 0.13, 0.13, '#e9ecf4', 0.05); }
function laserShape(g, x, y, face, own) {
  deviceBase(g, x, y, own); g.save(); g.translate(x + 0.5, y + 0.5); g.rotate(FACE_ROT[face]);
  rrect(g, -0.2, -0.5, 0.4, 0.42, 0.08, '#3a3f58', 0.055); ell(g, 0, -0.34, 0.12, 0.12, '#ff3a52', 0.05); ell(g, -0.04, -0.38, 0.04, 0.04, 'rgba(255,255,255,.85)', 0); ell(g, 0, 0.1, 0.2, 0.2, '#4a5070', 0.055); g.restore();
}
function fanBase(g, x, y, face, own) {
  deviceBase(g, x, y, own); g.save(); g.translate(x + 0.5, y + 0.5); g.rotate(FACE_ROT[face]);
  ell(g, 0, -0.04, 0.34, 0.34, '#2f3447', 0.055); ell(g, 0, -0.04, 0.27, 0.27, '#5b6384', 0); g.restore();
}
function thwompTrack(g, x, y, r) {
  const face = K.faceOf('thwomp', r), [w, h] = K.pieceSize('thwomp', r); g.save(); g.strokeStyle = 'rgba(60,50,70,.5)'; g.lineWidth = 0.06; g.setLineDash([0.16, 0.14]); g.beginPath();
  if (w < h) { g.moveTo(x + 0.05, y + 0.3); g.lineTo(x + 0.05, y + h - 0.1); g.moveTo(x + w - 0.05, y + 0.3); g.lineTo(x + w - 0.05, y + h - 0.1); } else { g.moveTo(x + 0.3, y + 0.05); g.lineTo(x + w - 0.1, y + 0.05); g.moveTo(x + 0.3, y + h - 0.05); g.lineTo(x + w - 0.1, y + h - 0.05); }
  g.stroke(); g.setLineDash([]);
  const mx = face === 1 ? x - 0.02 : face === 3 ? x + w - 0.24 : x, my = face === 2 ? y - 0.02 : face === 0 ? y + h - 0.24 : y;   // kotva na začátku dráhy (opačně než se kámen vrhá)
  if (w < h) { rrect(g, mx, my, w, 0.26, 0.08, '#59607a', 0.06); ell(g, mx + 0.2, my + 0.13, 0.04, 0.04, '#c8cfe0', 0); ell(g, mx + w - 0.2, my + 0.13, 0.04, 0.04, '#c8cfe0', 0); } else { rrect(g, mx, my, 0.26, h, 0.08, '#59607a', 0.06); ell(g, mx + 0.13, my + 0.2, 0.04, 0.04, '#c8cfe0', 0); ell(g, mx + 0.13, my + h - 0.2, 0.04, 0.04, '#c8cfe0', 0); }
  const [vx, vy] = K.DIRV[face]; g.fillStyle = 'rgba(60,50,70,.55)'; const cx = x + w / 2 + vx * 1.6, cy = y + h / 2 + vy * 1.6; poly(g, [[cx + vx * 0.3, cy + vy * 0.3], [cx - vy * 0.22 - vx * 0.2, cy + vx * 0.22 - vy * 0.2], [cx + vy * 0.22 - vx * 0.2, cy - vx * 0.22 - vy * 0.2]], 'rgba(60,50,70,.55)', 0);
  g.restore();
}
function rsawTrack(g, x, y, ax) {
  const n = K.RSAW_LEN; g.save(); g.lineCap = 'round';
  const a = ax ? [x + 0.5, y + 0.5] : [x + 0.5, y + 0.5], b = ax ? [x + 0.5, y + n - 0.5] : [x + n - 0.5, y + 0.5];
  g.strokeStyle = INK; g.lineWidth = 0.2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.strokeStyle = '#9aa3b8'; g.lineWidth = 0.11; g.stroke();
  for (const [px, py] of [a, b]) { ell(g, px, py, 0.17, 0.17, '#59607a', 0.05); ell(g, px, py, 0.05, 0.05, '#c8cfe0', 0); }
  g.restore();
}
/** Lopatky vrtule (dvě, naproti sobě); b = { px, py, dir, phase }. */
export function bladeDyn(g, b, tk, t, own) {
  const a = K.BLADE_PERIOD ? b.dir * TAU * ((tk + b.phase) / K.BLADE_PERIOD) : 0, L = K.BLADE_LEN;
  g.save(); g.translate(b.px, b.py);
  g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(0, 0, L + 0.15, 0, TAU); g.fill();
  g.rotate(a); rrect(g, -L, -0.17, L * 2, 0.34, 0.17, '#eef1f8', 0.06);
  g.save(); g.beginPath(); g.roundRect(-L, -0.17, L * 2, 0.34, 0.17); g.clip(); g.fillStyle = '#e24a3a'; for (let i = -6; i < 6; i++) { g.beginPath(); g.moveTo(i * 0.4, -0.2); g.lineTo(i * 0.4 + 0.2, -0.2); g.lineTo(i * 0.4 + 0.02, 0.2); g.lineTo(i * 0.4 - 0.18, 0.2); g.closePath(); g.fill(); } g.restore();
  rrect(g, -L, -0.17, L * 2, 0.34, 0.17, null, 0.06); ell(g, 0, 0, 0.2, 0.2, '#c8cfe0', 0.05); ell(g, 0, 0, 0.07, 0.07, own, 0.03);
  g.restore();
}
/** Kyvadlo: kotva je pevná, řetěz a koule se houpají; p = { px, py, phase }. */
export function pendDyn(g, p, tk, t, own) {
  const a = K.PEND_AMP * Math.sin(TAU * ((tk + p.phase) / K.PEND_PERIOD)), L = K.PEND_LEN; const bx = p.px + Math.sin(a) * L, by = p.py + Math.cos(a) * L;
  g.save(); const n = 7; for (let i = 1; i < n; i++) { const u = i / n; ell(g, p.px + (bx - p.px) * u, p.py + (by - p.py) * u, 0.075, 0.12, '#aab2c6', 0.04, a); }
  g.translate(bx, by); g.rotate(a * 0.6 + t * 0.4); const R = K.PEND_R;
  for (let i = 0; i < 10; i++) { const q = (i / 10) * TAU; poly(g, [[Math.cos(q - 0.2) * R * 0.85, Math.sin(q - 0.2) * R * 0.85], [Math.cos(q) * R * 1.22, Math.sin(q) * R * 1.22], [Math.cos(q + 0.2) * R * 0.85, Math.sin(q + 0.2) * R * 0.85]], '#cfd5e3', 0.045); }
  ell(g, 0, 0, R * 0.9, R * 0.9, '#4a5070', 0.06); ell(g, -R * 0.3, -R * 0.3, R * 0.28, R * 0.2, 'rgba(255,255,255,.4)', 0, -0.6); ell(g, 0, 0, R * 0.2, R * 0.2, own, 0.03); g.restore();
}
/** Padací kámen 2 × 2 s mračící se tváří (pořád vzpřímený; zespodu a po stranách má hroty, shora je hladký); h = { sx, sy, vx, vy, phase }. */
export function thwDyn(g, h, tk, t, own, off) {
  const H = K.THW; const u = (((tk + h.phase) % H.period) + H.period) % H.period; const o = off === undefined ? P.thwompOff(h, tk) : off;
  const sh = u > H.wait - 12 && u < H.wait ? Math.sin(tk * 3) * 0.04 : 0; const w = H.s, x = h.sx + h.vx * o + sh, y = h.sy + h.vy * o; const falling = u >= H.wait && u < H.wait + H.fall + 3;
  g.save();
  const sp = (pts) => poly(g, pts, '#cfd5e3', 0.045);
  for (const q of [0.28, 0.72]) { sp([[x + w * q - 0.15, y + w - 0.04], [x + w * q, y + w + 0.2], [x + w * q + 0.15, y + w - 0.04]]); sp([[x + 0.04, y + w * q - 0.15], [x - 0.2, y + w * q], [x + 0.04, y + w * q + 0.15]]); sp([[x + w - 0.04, y + w * q - 0.15], [x + w + 0.2, y + w * q], [x + w - 0.04, y + w * q + 0.15]]); }
  rrect(g, x + 0.03, y + 0.03, w - 0.06, w - 0.06, 0.22, '#8a8ea0', 0.07);
  g.fillStyle = '#b4b8c9'; g.fillRect(x + 0.14, y + 0.1, w - 0.28, 0.14); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x + 0.2, y + 0.12, w - 0.4, 0.04);
  for (const [dx, dy] of [[0.2, 0.34], [w - 0.2, 0.34], [0.2, w - 0.2], [w - 0.2, w - 0.2]]) ell(g, x + dx, y + dy, 0.05, 0.05, '#5c6075', 0);
  const ex = [x + w * 0.3, x + w * 0.7]; for (const [i, e] of ex.entries()) { ell(g, e, y + w * 0.46, 0.2, falling ? 0.1 : 0.17, '#fff', 0.05); ell(g, e + (i ? -0.04 : 0.04), y + w * 0.49, 0.07, 0.07, INK, 0); poly(g, [[e - 0.26 * (i ? -1 : 1), y + w * 0.26], [e + 0.24 * (i ? -1 : 1), y + w * 0.36], [e - 0.26 * (i ? -1 : 1), y + w * 0.36]], INK, 0.03); }
  g.beginPath(); g.moveTo(x + w * 0.27, y + w * 0.78); for (let i = 0; i <= 5; i++) g.lineTo(x + w * 0.27 + (i / 5) * w * 0.46, y + w * (i % 2 ? 0.7 : 0.82)); g.lineTo(x + w * 0.73, y + w * 0.78); g.lineWidth = 0.055; g.strokeStyle = INK; g.stroke();
  g.restore(); void own;
}
/** Laserový paprsek: varování bliká tence, výstřel září; l = { sx, sy, vx, vy, len, phase, preview }. */
export function laserDyn(g, l, tk, t) {
  const u = (((tk + l.phase) % K.LASER_PERIOD) + K.LASER_PERIOD) % K.LASER_PERIOD; const st = l.preview ? 1 : u < K.LASER_PERIOD - K.LASER_WARN - K.LASER_ON ? 0 : u < K.LASER_PERIOD - K.LASER_ON ? 1 : 2; if (!st) return;
  const x1 = l.sx + l.vx * l.len, y1 = l.sy + l.vy * l.len; g.save(); g.lineCap = 'round';
  if (st === 1) { g.globalAlpha = l.preview ? 0.55 : (Math.floor(u / 3) % 2 ? 0.8 : 0.25); g.strokeStyle = '#ff5a7a'; g.lineWidth = 0.05; g.setLineDash([0.18, 0.14]); g.beginPath(); g.moveTo(l.sx, l.sy); g.lineTo(x1, y1); g.stroke(); }
  else { g.strokeStyle = 'rgba(255,40,70,.28)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(l.sx, l.sy); g.lineTo(x1, y1); g.stroke(); g.strokeStyle = '#ff3a52'; g.lineWidth = 0.26; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 0.1; g.stroke(); ell(g, x1, y1, 0.22 + Math.sin(t * 40) * 0.04, 0.22, 'rgba(255,200,210,.85)', 0); }
  g.restore();
}
/** Pila na kolejnici (dráha je v rsawTrack): s = { x, y, ax, phase }. */
export function rsawDyn(g, s, tk, t, own) {
  const d = (K.RSAW_LEN - 1) * (0.5 + 0.5 * Math.sin(TAU * ((tk + s.phase) / K.RSAW_PERIOD))); sawShape(g, s.x + 0.5 + (s.ax === 0 ? d : 0), s.y + 0.5 + (s.ax === 1 ? d : 0), K.RSAW_R * 1.05, t, own);
}
/** Ventilátor: vrtule se točí, když fouká, a v proudu poletují čárky větru; f = { x, y, dir, vx, vy, sx, sy, len, phase, preview }. */
export function fanDyn(g, f, tk, t) {
  const on = f.preview || ((((tk + f.phase) % K.FAN.period) + K.FAN.period) % K.FAN.period) < K.FAN.on; const cx = f.x + 0.5, cy = f.y + 0.5;
  g.save(); g.translate(cx, cy); g.rotate(FACE_ROT[f.dir]); const sp = on ? t * 18 : 0.4;
  for (let i = 0; i < 3; i++) { g.save(); g.rotate(sp + i * 2.094); ell(g, 0, -0.14, 0.07, 0.17, '#e9ecf4', 0.04); g.restore(); } ell(g, 0, -0.04, 0.06, 0.06, '#59607a', 0.03);
  g.restore();
  if (!on || f.len <= 0.2) return; g.save(); g.lineCap = 'round'; g.lineWidth = 0.05; g.strokeStyle = 'rgba(255,255,255,.75)';
  const n = 7; for (let i = 0; i < n; i++) { const ph = ((t * 1.6 + i / n) % 1), d = ph * f.len, wob = Math.sin(i * 2.3 + t * 5) * 0.4; const px = f.sx + f.vx * d - f.vy * wob, py = f.sy + f.vy * d + f.vx * wob; g.globalAlpha = Math.sin(ph * Math.PI) * 0.85; g.beginPath(); g.moveTo(px, py); g.lineTo(px + f.vx * 0.45, py + f.vy * 0.45); g.stroke(); }
  g.restore();
}
// ------------------------------------------------------------------ další pasti (výsuvné bodáky, rampouch, odrážeč, mizející plošina, černá díra, valoun)
/** Plocha pro výsuvné bodáky: plechová deska s dírkami (hroty vyjíždějí v retractDyn). */
function retractSlot(g, x, y, face) {
  g.save(); g.translate(x + 0.5, y + 0.5); g.rotate(FACE_ROT[face]); rrect(g, -0.46, 0.26, 0.92, 0.22, 0.05, '#6c7385', 0.055);
  for (const dx of [-0.24, 0.24]) ell(g, dx, 0.37, 0.1, 0.045, '#262a38', 0); g.restore();
}
/** Výsuvné bodáky; o = { cells: [[x, y]], face, phase }, st: 0 schované, 1 cukají, 2 venku. */
export function retractDyn(g, o, tk, t, own, forced) {
  const st = forced === undefined ? P.retractState(o, tk) : forced; if (!st) return;
  const ext = st === 2 ? 1 : 0.3 + Math.sin(t * 60) * 0.06;
  for (const [cx, cy] of o.cells) {
    g.save(); g.translate(cx + 0.5, cy + 0.5); g.rotate(FACE_ROT[o.face]);
    for (const dx of [-0.24, 0.24]) poly(g, [[dx - 0.2, 0.3], [dx, 0.3 - 0.64 * ext], [dx + 0.2, 0.3]], st === 1 ? '#ffb4a8' : '#e6ebf5', 0.055);
    g.restore();
  }
}
function icicleMount(g, x, y, own) { rrect(g, x + 0.04, y + 0.04, 0.92, 0.92, 0.12, '#7d95b8', 0.06); g.fillStyle = '#dff3ff'; g.fillRect(x + 0.12, y + 0.1, 0.76, 0.1); ell(g, x + 0.16, y + 0.84, 0.04, 0.04, own, 0); ell(g, x + 0.84, y + 0.84, 0.04, 0.04, own, 0); }
/** Rampouch visící ze stropního bločku; c = { x, y, len, phase }. */
export function icicleDyn(g, c, tk, t, own, forced) {
  const st = forced || P.icicleState(c, tk, icSt); if (!st.vis) { g.save(); g.globalAlpha = 0.5; for (let i = 0; i < 5; i++) ell(g, c.x + 0.5 + Math.cos(i * 2.4) * 0.3, c.y + 1 + c.len + 0.9 - Math.abs(Math.sin(i * 1.7)) * 0.3 + 0.05, 0.05, 0.05, '#dff6ff', 0); g.restore(); return; }
  const I = K.ICICLE, sh = st.shake ? Math.sin(tk * 2.2) * 0.04 : 0; const k = st.grow, y0 = c.y + 1 + st.off, L = I.len * k;
  g.save(); g.translate(c.x + 0.5 + sh, y0);
  poly(g, [[-0.26, -0.02], [0, L], [0.26, -0.02]], '#cdeeff', 0.055); poly(g, [[-0.12, 0.05], [-0.04, L * 0.6], [0.02, 0.05]], 'rgba(255,255,255,.75)', 0);
  g.restore();
}
const icSt = {};
export function bumperDyn(g, b, tk, t, own) {
  const pulse = 1 + Math.sin(t * 6 + b.cx) * 0.04; g.save(); g.translate(b.cx, b.cy); g.scale(pulse, pulse);
  ell(g, 0, 0, 0.5, 0.5, '#ffd23a', 0.065); ell(g, 0, 0, 0.36, 0.36, '#ff5a4f', 0.05); ell(g, 0, 0, 0.2, 0.2, '#fff3d6', 0.04); ell(g, -0.14, -0.16, 0.08, 0.05, 'rgba(255,255,255,.7)', 0, -0.6);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 0.8; ell(g, Math.cos(a) * 0.43, Math.sin(a) * 0.43, 0.035, 0.035, INK, 0); }
  g.restore(); void tk; void own;
}
/** Mizející plošina; v = { x, y, phase }; forced = stav pro náhled. */
export function vanishDyn(g, v, tk, t, own, forced) {
  const st = forced === undefined ? P.vanishState(v, tk) : forced; g.save();
  if (st === 2) { g.strokeStyle = 'rgba(40,30,20,.4)'; g.lineWidth = 0.05; g.setLineDash([0.14, 0.12]); g.strokeRect(v.x + 0.06, v.y + 0.12, 2.88, 0.76); g.restore(); return; }
  if (st === 1) g.globalAlpha = Math.floor(tk / 3) % 2 ? 0.3 : 0.85;
  rrect(g, v.x + 0.02, v.y + 0.06, 2.96, 0.88, 0.14, '#c9a6ff', 0.065); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(v.x + 0.16, v.y + 0.14, 2.68, 0.1);
  for (let i = 0; i < 3; i++) { ell(g, v.x + 0.5 + i, v.y + 0.62, 0.14, 0.14, '#8b5fd6', 0.04); ell(g, v.x + 0.5 + i, v.y + 0.62, 0.05, 0.05, own, 0); }
  g.restore();
}
/** Černá díra; h = { cx, cy, phase }; forced = stav pro náhled. */
export function holeDyn(g, h, tk, t, own, forced) {
  const st = forced === undefined ? P.holeState(h, tk) : forced; const R = K.HOLE.r; g.save(); g.translate(h.cx, h.cy);
  if (st === 2) {
    g.strokeStyle = 'rgba(120,70,190,.4)'; g.lineWidth = 0.05; g.setLineDash([0.2, 0.18]); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke(); g.setLineDash([]);
    for (let i = 0; i < 10; i++) { const ph = (t * 0.9 + i / 10) % 1, a = i * 2.4 + ph * 3, d = R * (1 - ph); g.globalAlpha = Math.sin(ph * Math.PI) * 0.8; ell(g, Math.cos(a) * d, Math.sin(a) * d, 0.05, 0.05, '#e3d1ff', 0); }
    g.globalAlpha = 1;
  }
  const k = st >= 2 ? 1 : st === 1 ? 0.55 : 0.32;
  ell(g, 0, 0, 0.62 * k + 0.1, 0.62 * k + 0.1, 'rgba(150,90,230,.35)', 0);
  for (let i = 0; i < 3; i++) { g.save(); g.rotate(t * 3 + i * 2.094); g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(0.2 * k, -0.5 * k, 0.7 * k, -0.4 * k, 0.74 * k, 0.05); g.lineWidth = 0.09; g.strokeStyle = '#b284ff'; g.stroke(); g.restore(); }
  ell(g, 0, 0, 0.36 * k + 0.06, 0.36 * k + 0.06, '#120a1d', 0.05); ell(g, 0, 0, 0.12 * k, 0.12 * k, '#000', 0);
  g.restore(); void own;
}
function boulderTrack(g, x, y, dir) {
  g.save(); g.strokeStyle = 'rgba(40,30,20,.45)'; g.lineWidth = 0.07; g.setLineDash([0.18, 0.16]); g.beginPath(); g.moveTo(x + 0.2, y + 0.94); g.lineTo(x + K.BOULDER.len - 0.2, y + 0.94); g.stroke(); g.setLineDash([]);
  const sx = dir > 0 ? x + 0.2 : x + K.BOULDER.len - 0.2; rrect(g, sx - 0.12, y + 0.55, 0.24, 0.42, 0.06, '#8a5628', 0.05);
  g.fillStyle = 'rgba(60,45,30,.55)'; for (let i = 0; i < 3; i++) { const cx = x + 2.6 + i * 1.4 + (dir > 0 ? 0 : 0); poly(g, [[cx + 0.2 * dir, y + 0.74], [cx - 0.12 * dir, y + 0.58], [cx - 0.12 * dir, y + 0.9]], 'rgba(60,45,30,.55)', 0); }
  g.restore();
}
/** Valoun; b = { x, y, dir, phase }; forced = [cx, cy, úhel, stav] pro náhled. */
export function boulderDyn(g, b, tk, t, own, forced) {
  const q = forced || P.boulderPos(b, tk, bpv); if (q[3] === 0) return; const R = K.BOULDER.r;
  g.save(); g.translate(q[0], q[1]); if (q[3] === 1) g.globalAlpha = 0.45; g.rotate(q[2]);
  ell(g, 0, 0, R, R, '#9a8f84', 0.07); ell(g, 0, 0, R * 0.86, R * 0.86, '#b2a79b', 0);
  g.strokeStyle = '#6e6359'; g.lineWidth = 0.06; g.beginPath(); g.moveTo(-R * 0.5, -R * 0.2); g.lineTo(-R * 0.1, -R * 0.32); g.lineTo(R * 0.1, -R * 0.05); g.lineTo(R * 0.5, -R * 0.15); g.moveTo(-R * 0.1, R * 0.4); g.lineTo(R * 0.15, R * 0.1); g.lineTo(R * 0.4, R * 0.45); g.stroke();
  ell(g, -R * 0.3, -R * 0.45, R * 0.22, R * 0.14, 'rgba(255,255,255,.35)', 0, -0.6); ell(g, R * 0.35, R * 0.3, 0.07, 0.07, own, 0);
  g.restore();
}
const bpv = [0, 0, 0, 0];
/** Náhled pohyblivé části pasti při pokládání a na kartičkách (ukázková poloha, pomocná kružnice dosahu). */
function previewDyn(g, type, r, x, y, own, t, icon) {
  const [vx, vy] = K.DIRV[K.faceOf(type, r)]; const tk = 18;
  g.save();
  if (type === 'blades') { g.strokeStyle = 'rgba(40,30,20,.35)'; g.lineWidth = 0.05; g.setLineDash([0.15, 0.12]); g.beginPath(); g.arc(x + 0.5, y + 0.5, K.BLADE_LEN, 0, TAU); g.stroke(); g.setLineDash([]); bladeDyn(g, { px: x + 0.5, py: y + 0.5, dir: 1, phase: icon ? 11 : t * 20 }, tk, t, own); }
  else if (type === 'pendulum') { g.strokeStyle = 'rgba(40,30,20,.35)'; g.lineWidth = 0.05; g.setLineDash([0.15, 0.12]); g.beginPath(); g.arc(x + 0.5, y + 0.5, K.PEND_LEN, Math.PI / 2 - K.PEND_AMP, Math.PI / 2 + K.PEND_AMP); g.stroke(); g.setLineDash([]); pendDyn(g, { px: x + 0.5, py: y + 0.5, phase: icon ? 122 : t * 20 }, tk, t, own); }
  else if (type === 'thwomp') { const f = K.faceOf('thwomp', r), tr = K.THW.h - K.THW.s; const o = { sx: x + (f === 3 ? tr : 0), sy: y + (f === 0 ? tr : 0), vx: vx, vy: vy, phase: 0 }; if (!icon) { g.strokeStyle = 'rgba(40,30,20,.3)'; g.lineWidth = 0.05; g.setLineDash([0.15, 0.12]); g.strokeRect(o.sx + vx * tr + 0.03, o.sy + vy * tr + 0.03, 1.94, 1.94); g.setLineDash([]); } thwDyn(g, o, 0, t, own, icon ? 1.6 : 0); }
  else if (type === 'retract') retractDyn(g, { cells: K.spikeSplit('retract', r).spike.map(([dx, dy]) => [x + dx, y + dy]), face: K.faceOf('retract', r), phase: 0 }, 0, t, own, icon ? 2 : (Math.floor(t * 1.4) % 2 ? 2 : 1));
  else if (type === 'icicle') { icicleDyn(g, { x, y, len: 3, phase: 0 }, 0, t, own, { vis: true, shake: false, grow: 1, off: icon ? 0 : (t * 1.5 % 1) * 1.5 }); if (!icon) { g.strokeStyle = 'rgba(40,30,20,.3)'; g.lineWidth = 0.05; g.setLineDash([0.15, 0.12]); g.beginPath(); g.moveTo(x + 0.5, y + 2); g.lineTo(x + 0.5, y + 6); g.stroke(); g.setLineDash([]); } }
  else if (type === 'bumper') bumperDyn(g, { cx: x + 0.5, cy: y + 0.5 }, 0, t, own);
  else if (type === 'vanish') vanishDyn(g, { x, y, phase: 0 }, 0, t, own, icon ? 0 : (Math.floor(t * 0.9) % 3 === 2 ? 2 : Math.floor(t * 0.9) % 3 === 1 ? 1 : 0));
  else if (type === 'hole') holeDyn(g, { cx: x + 0.5, cy: y + 0.5, phase: 0 }, 0, t, own, icon ? 3 : 2);
  else if (type === 'boulder') { const dir = r % 2 === 0 ? 1 : -1; boulderDyn(g, { x, y, dir, phase: 0 }, 0, t, own, [x + (dir > 0 ? K.BOULDER.r + 1.4 : K.BOULDER.len - K.BOULDER.r - 1.4), y + 1 - K.BOULDER.r, 0.4, 2]); }
  else if (type === 'laser') laserDyn(g, { sx: x + 0.5 + vx * 0.55, sy: y + 0.5 + vy * 0.55, vx, vy, len: icon ? 1.9 : 9, phase: 0, preview: true }, tk, t);
  else if (type === 'rsaw') { const d = icon ? 2.2 : (K.RSAW_LEN - 1) * (0.5 + 0.5 * Math.sin(t * 2)); sawShape(g, x + 0.5 + (r % 2 === 0 ? d : 0), y + 0.5 + (r % 2 === 1 ? d : 0), K.RSAW_R * 1.05, t, own); }
  else if (type === 'fan') fanDyn(g, { x, y, dir: K.faceOf(type, r), vx, vy, sx: x + 0.5 + vx * 0.55, sy: y + 0.5 + vy * 0.55, len: icon ? 1.5 : K.FAN.len, phase: 0, preview: true }, tk, t);
  g.restore();
}
/** Nakreslí kus (základní vzhled bez pohyblivých částí). o = { alpha, tint, own (barva místa), shake, owners: [seat], t } */
/** Bomba (malá = tmavá koule, velká = větší s červeným pruhem); cx, cy = střed políčka. */
export function bombShape(g, cx, cy, big, t) {
  const R = big ? 0.6 : 0.4; g.save(); g.translate(cx, cy + (big ? 0.04 : 0.07));
  ell(g, 0, 0, R, R, big ? '#43203a' : '#3b4156', 0.06);
  if (big) { g.save(); g.beginPath(); g.arc(0, 0, R - 0.03, 0, TAU); g.clip(); g.fillStyle = '#ff5a4f'; g.fillRect(-R, -0.1, R * 2, 0.22); g.fillStyle = '#ffd23a'; for (let k = -3; k <= 3; k++) g.fillRect(k * 0.24 - 0.06, -0.1, 0.12, 0.22); g.restore(); g.lineWidth = 0.06; g.strokeStyle = INK; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke(); }
  ell(g, -R * 0.36, -R * 0.4, R * 0.3, R * 0.17, 'rgba(255,255,255,.55)', 0, -0.6);
  rrect(g, -0.14, -R - 0.1, 0.28, 0.17, 0.05, '#8a8f9f', 0.05);
  g.strokeStyle = '#8a5628'; g.lineWidth = 0.07; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -R - 0.08); g.quadraticCurveTo(0.2, -R - 0.32, 0.34, -R - 0.24); g.stroke();
  const fl = 0.5 + 0.5 * Math.sin(t * 22), sx = 0.34, sy = -R - 0.24; ell(g, sx, sy, 0.1 + 0.05 * fl, 0.1 + 0.05 * fl, '#ffd23a', 0); ell(g, sx, sy, 0.05, 0.05, '#ffffff', 0);
  g.fillStyle = '#ff8a2a'; for (let k = 0; k < 5; k++) { const an = t * 9 + k * 1.256; g.fillRect(sx + Math.cos(an) * 0.18 - 0.025, sy + Math.sin(an) * 0.18 - 0.025, 0.05, 0.05); }
  g.restore();
}
export function drawPieceShape(g, type, r, x, y, o = {}) {
  const P = K.PIECES[type], cells = K.pieceCells(type, r), own = o.own || '#ffffff', face = K.faceOf(type, r);
  g.save(); if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  if (type === 'mover') {
    const ax = r % 2; const n = 9; g.strokeStyle = 'rgba(40,30,20,.45)'; g.lineWidth = 0.07; g.setLineDash([0.18, 0.16]); g.beginPath();
    if (!ax) { g.moveTo(x + 0.3, y + 0.5); g.lineTo(x + n - 0.3, y + 0.5); } else { g.moveTo(x + 1.5, y + 0.3); g.lineTo(x + 1.5, y + n - 0.3); } g.stroke(); g.setLineDash([]);
    if (o.ghost) moverShape(g, ax ? x + 0 : x + 3, ax ? y + 3 : y, own, 0);
  } else for (const [dx, dy] of cells) {
    const cx = x + dx, cy = y + dy;
    if (P.kind === 'solid') solidCell(g, P.tile, cx, cy, own, type === 'bounce' ? { ...o, face } : o);
    else if (type === 'spikes' || type === 'retract') { const sp = K.spikeSplit(type, r); if (sp.base.some(([bx, by]) => bx === dx && by === dy)) deviceBase(g, cx, cy, own); else if (type === 'spikes') spikeCell(g, cx, cy, face, own); else retractSlot(g, cx, cy, face); }
    else if (type === 'icicle') icicleMount(g, cx, cy, own);
    else if (type === 'cannon') cannonShape(g, cx, cy, face, own, o.recoil || 0);
    else if (type === 'flame') flameShape(g, cx, cy, face, own);
    else if (type === 'blades') bladeHub(g, cx, cy, own);
    else if (type === 'pendulum') pendAnchor(g, cx, cy, own);
    else if (type === 'laser') laserShape(g, cx, cy, face, own);
    else if (type === 'fan') fanBase(g, cx, cy, face, own);
    else if (type === 'bomb' || type === 'megabomb') bombShape(g, cx + 0.5, cy + 0.5, type === 'megabomb', o.t || 0);
  }
  if (type === 'thwomp') thwompTrack(g, x, y, r);
  if (type === 'boulder') boulderTrack(g, x, y, r % 2 === 0 ? 1 : -1);
  if (type === 'rsaw') rsawTrack(g, x, y, r % 2);
  if (o.ghost || o.icon) previewDyn(g, type, r, x, y, own, o.t || 0, !!o.icon);
  if (type === 'saw') sawShape(g, x + 1, y + 1, 0.92, o.t || 0, own);
  if (o.tint) { g.globalCompositeOperation = 'source-atop'; }
  g.restore();
}
export function moverShape(g, x, y, own, t) {
  rrect(g, x + 0.02, y + 0.12, 2.96, 0.8, 0.14, '#6ac4ff', 0.065); g.fillStyle = '#b8e6ff'; g.fillRect(x + 0.14, y + 0.2, 2.72, 0.1);
  for (const px of [0.5, 2.5]) { ell(g, x + px, y + 0.62, 0.15, 0.15, '#3d4a68', 0.05); ell(g, x + px, y + 0.62, 0.05, 0.05, own, 0); }
  poly(g, [[x + 1.2, y + 0.55], [x + 1.45, y + 0.4], [x + 1.45, y + 0.7]], '#fff', 0.03); poly(g, [[x + 1.8, y + 0.55], [x + 1.55, y + 0.4], [x + 1.55, y + 0.7]], '#fff', 0.03);
}
export function bulletShape(g, x, y, vx, vy, t) { g.save(); g.translate(x, y); g.rotate(Math.atan2(vy, vx)); ell(g, -0.12, 0, 0.26, 0.1, 'rgba(255,170,60,.5)', 0); ell(g, 0, 0, 0.22, 0.2, '#2f3447', 0.055); ell(g, -0.05, -0.06, 0.06, 0.05, 'rgba(255,255,255,.5)', 0); g.restore(); }
/** Plamen z plamenometu: obdélník rect = [x0, y0, x1, y1], face = směr, on = chrlí, soon = za chvilku začne. */
export function flameBurst(g, f, on, soon, t) {
  const [x0, y0, x1, y1] = f.rect; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (soon && !on) { g.save(); g.globalAlpha = 0.5 + Math.sin(t * 40) * 0.3; const [vx, vy] = K.DIRV[f.dir]; ell(g, f.x + 0.5 + vx * 0.55, f.y + 0.5 + vy * 0.55, 0.1, 0.1, '#ffb23a', 0); g.restore(); return; }
  if (!on) return; g.save(); const [vx, vy] = K.DIRV[f.dir]; const bx = f.x + 0.5 + vx * 0.5, by = f.y + 0.5 + vy * 0.5; g.translate(bx, by); g.rotate(FACE_ROT[f.dir]);
  const L = K.FLAME_LEN; for (let i = 0; i < 3; i++) { const w = 0.34 - i * 0.07, l = L * (1 - i * 0.18) + Math.sin(t * 30 + i) * 0.12; g.beginPath(); g.moveTo(-w, 0); g.bezierCurveTo(-w * 1.6, -l * 0.45, -w * 0.5, -l * 0.8, 0, -l); g.bezierCurveTo(w * 0.5, -l * 0.8, w * 1.6, -l * 0.45, w, 0); g.closePath(); g.fillStyle = ['#ff6a1f', '#ffa21f', '#ffe45c'][i]; g.fill(); if (!i) { g.lineWidth = 0.05; g.strokeStyle = INK; g.stroke(); } }
  g.restore(); void cx; void cy;
}
export function flagShape(g, x, y, t, col = '#ff5a4f') {   // x = střed tyče, y = spodek
  rrect(g, x - 0.05, y - 2.6, 0.1, 2.6, 0.04, '#e9e3d4', 0.05); ell(g, x, y - 2.62, 0.12, 0.12, '#ffd23a', 0.05); g.beginPath(); g.moveTo(x + 0.05, y - 2.5);
  for (let i = 0; i <= 8; i++) g.lineTo(x + 0.05 + (i / 8) * 1.3, y - 2.5 + Math.sin(t * 5 + i * 0.7) * 0.07 * (i / 8) * 3); for (let i = 8; i >= 0; i--) g.lineTo(x + 0.05 + (i / 8) * 1.3, y - 1.7 + Math.sin(t * 5 + i * 0.7) * 0.07 * (i / 8) * 3);
  g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = 0.055; g.strokeStyle = INK; g.stroke();
  g.save(); g.beginPath(); g.moveTo(x + 0.05, y - 2.5); for (let i = 0; i <= 8; i++) g.lineTo(x + 0.05 + (i / 8) * 1.3, y - 2.5 + Math.sin(t * 5 + i * 0.7) * 0.07 * (i / 8) * 3); for (let i = 8; i >= 0; i--) g.lineTo(x + 0.05 + (i / 8) * 1.3, y - 1.7 + Math.sin(t * 5 + i * 0.7) * 0.07 * (i / 8) * 3); g.closePath(); g.clip();
  g.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) g.fillRect(x + 0.05 + i * 0.22, y - 2.5 + j * 0.27, 0.22, 0.27); g.restore();
  ell(g, x, y - 0.02, 0.28, 0.08, '#8a5628', 0.04);
}
export function startSign(g, x, y) { rrect(g, x - 0.06, y - 0.9, 0.12, 0.9, 0.03, '#8a5628', 0.05); rrect(g, x - 0.62, y - 1.3, 1.24, 0.5, 0.1, '#fff6d6', 0.055); g.fillStyle = INK; g.beginPath(); g.moveTo(x - 0.25, y - 1.15); g.lineTo(x + 0.3, y - 1.05); g.lineTo(x - 0.25, y - 0.93); g.closePath(); g.fill(); }

// ------------------------------------------------------------------ náhledy
const iconCache = new Map();
/** Ikona kusu pro kartičky výběru (data URL). */
const ICON_FRAME = { bomb: { w: 1.5, h: 1.7, ox: 0.25, oy: 0.45 }, megabomb: { w: 1.9, h: 2.1, ox: 0.45, oy: 0.65 }, blades: { w: 5, h: 5, ox: 2, oy: 2 }, pendulum: { w: 5, h: 4.3, ox: 0.5, oy: 0 }, laser: { w: 3.3, h: 1, ox: 0, oy: 0 }, fan: { w: 1.4, h: 2.7, ox: 0.2, oy: 1.7 }, rsaw: { w: 6, h: 1, ox: 0, oy: 0 }, thwomp: { w: 2.4, h: 4.4, ox: 0.2, oy: 0 }, icicle: { w: 1, h: 2.1, ox: 0, oy: 0 }, boulder: { w: 4.6, h: 1.9, ox: 0, oy: 0.9 }, hole: { w: 1, h: 1, ox: 0, oy: 0 }, retract: { w: 3, h: 2, ox: 0, oy: 0 }, mover: { w: 3, h: 1, ox: 0, oy: 0 } };
export function pieceIcon(type, px = 120) {
  const key = type + ':' + px; if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d');
  const sz = K.pieceSize(type, 0); const fr = ICON_FRAME[type] || { w: sz[0], h: sz[1], ox: 0, oy: 0 }; const sc = Math.min(px * 0.88 / Math.max(fr.w, fr.h, 2), px / 2.4);
  g.setTransform(sc, 0, 0, sc, (px - fr.w * sc) / 2, (px - fr.h * sc) / 2 + 0.02 * px); g.lineJoin = 'round'; g.lineCap = 'round';
  if (type === 'mover') moverShape(g, 0, 0, '#ffffff', 0); else if (type === 'saw') sawShape(g, 1, 1, 0.92, 0.4, '#ffffff'); else drawPieceShape(g, type, 0, fr.ox, fr.oy, { own: '#ffffff', icon: true });
  const url = c.toDataURL(); iconCache.set(key, url); return url;
}
/** Náhled trati pro výběr stage. */
export function stageThumb(si, px = 192) {
  const key = 'st' + si + ':' + px; if (iconCache.has(key)) return iconCache.get(key);
  const S = K.STAGES[si]; const c = document.createElement('canvas'); c.width = px; c.height = Math.round((px * ROWS) / COLS); const g = c.getContext('2d'); const sc = px / COLS; g.setTransform(sc, 0, 0, sc, 0, 0);
  drawBackground(g, S.theme, 0); drawTerrain(g, S); flagShape(g, S.flag[0], S.flag[1], 0); startSign(g, S.spawn[0], S.spawn[1]);
  const url = c.toDataURL(); iconCache.set(key, url); return url;
}
