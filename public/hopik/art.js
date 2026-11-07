// HOPÍK – grafika: všechno je nakreslené vektorově (zvířátka, terén, kusy, pasti, kulky, plameny, vlajka, pozadí) v jednotkách políček.
// Volající nastaví transformaci canvasu tak, aby 1 jednotka = 1 políčko. Žádné emoji ani obrázky.
import * as K from './shared.js?v=1';
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
/** Nakreslí postavičku se středem těla (x, y). o = { face: ±1, t: čas (s), vx, vy, gr, wall, alpha, sc, dance }. Výška těla je asi jedno políčko. */
export function drawAnimal(g, ci, x, y, o = {}) {
  const C = K.CHARS[ci] || K.CHARS[0]; const f = o.face < 0 ? -1 : 1, t = o.t || 0, vx = o.vx || 0, vy = o.vy || 0;
  const run = o.gr && Math.abs(vx) > 0.5; const ph = t * 16;
  let sx = 1, sy = 1; if (!o.gr && !o.wall) { const s = Math.max(-0.18, Math.min(0.2, vy / 90)); sy = 1 + s; sx = 1 - s * 0.7; }
  const bob = run ? Math.abs(Math.sin(ph)) * 0.05 : o.dance ? Math.abs(Math.sin(t * 9)) * 0.12 : Math.sin(t * 3) * 0.012;
  g.save(); g.globalAlpha = o.alpha === undefined ? 1 : o.alpha; g.translate(x, y + 0.45); g.scale(f * (o.sc || 1) * sx, (o.sc || 1) * sy); g.translate(0, -bob);
  if (o.wall) { g.rotate(-0.12); }
  const lean = run ? 0.06 : 0; g.rotate(lean);
  // nohy
  const fl = run ? Math.sin(ph) * 0.13 : 0, air = !o.gr && !o.wall;
  const foot = (dx, dy) => ell(g, dx, -0.07 + dy, 0.11, 0.075, C.dark, 0.05);
  // ocas / zadní části (za tělem)
  const e = C.ear;
  if (e === 'comb') { poly(g, [[-0.34, -0.3], [-0.58, -0.5], [-0.46, -0.28], [-0.62, -0.26], [-0.4, -0.14]], '#e8433c', 0.05); }
  if (e === 'horse') { poly(g, [[-0.36, -0.2], [-0.62, -0.05 + Math.sin(t * 6) * 0.03], [-0.5, -0.38]], C.acc, 0.05); }
  if (e === 'pig') { g.beginPath(); g.moveTo(-0.38, -0.25); g.bezierCurveTo(-0.6, -0.3, -0.58, -0.5, -0.46, -0.44); g.lineWidth = 0.06; g.strokeStyle = INK; g.stroke(); g.lineWidth = 0.035; g.strokeStyle = C.dark; g.stroke(); }
  if (e === 'rabbit') ell(g, -0.42, -0.18, 0.13, 0.13, '#ffffff', 0.05);
  if (e === 'tuft') poly(g, [[-0.34, -0.22], [-0.56, -0.34], [-0.5, -0.14]], C.dark, 0.05);
  if (e === 'goat' || e === 'cow') poly(g, [[-0.36, -0.26], [-0.52, -0.1], [-0.4, -0.1]], C.dark, 0.05);
  foot(-0.17 - fl, air ? -0.04 : 0); foot(0.17 + fl, air ? -0.04 : 0);
  if (run) { foot(-0.17 + fl, Math.max(0, -Math.cos(ph)) * -0.05); }
  // tělo
  if (e === 'sheep') { for (const [cx, cy, r] of [[-0.28, -0.3, 0.2], [0, -0.45, 0.22], [0.26, -0.3, 0.2], [-0.2, -0.12, 0.2], [0.2, -0.14, 0.2], [0, -0.28, 0.28]]) ell(g, cx, cy, r, r, C.body, 0.05); }
  else ell(g, 0, -0.33, 0.43, 0.36, C.body, 0.06);
  if (e !== 'sheep') ell(g, 0.02, -0.2, 0.28, 0.2, C.belly, 0);
  if (C.spot) { ell(g, -0.2, -0.47, 0.13, 0.1, C.acc, 0, 0.5); ell(g, 0.25, -0.2, 0.1, 0.13, C.acc, 0, 0); ell(g, -0.28, -0.22, 0.08, 0.07, C.acc, 0, 0); }
  // hlava / obličej (směrem dopředu, tělo je zároveň hlava)
  const hx = 0.17, hy = -0.4;
  if (e === 'sheep') ell(g, hx + 0.1, hy + 0.02, 0.24, 0.26, C.acc, 0.05);
  // uši a ozdoby
  if (e === 'comb') { ell(g, 0.05, -0.7, 0.09, 0.09, '#e8433c', 0.05); ell(g, 0.17, -0.74, 0.09, 0.1, '#e8433c', 0.05); ell(g, 0.29, -0.7, 0.08, 0.08, '#e8433c', 0.05); }
  if (e === 'horse') { poly(g, [[0.0, -0.64], [0.06, -0.86], [0.17, -0.65]], C.dark, 0.05); poly(g, [[0.15, -0.64], [0.24, -0.84], [0.3, -0.62]], C.dark, 0.05); poly(g, [[-0.12, -0.6], [0.0, -0.78], [0.04, -0.6]], C.acc, 0.04); }
  if (e === 'sheep') { poly(g, [[0.0, -0.58], [-0.14, -0.66], [-0.04, -0.5]], C.acc, 0.05); poly(g, [[0.34, -0.58], [0.46, -0.52], [0.36, -0.46]], C.acc, 0.05); }
  if (e === 'pig') { poly(g, [[-0.02, -0.64], [0.06, -0.86], [0.2, -0.64]], C.dark, 0.05); poly(g, [[0.18, -0.64], [0.34, -0.8], [0.34, -0.58]], C.dark, 0.05); }
  if (e === 'cow') { poly(g, [[-0.02, -0.66], [-0.1, -0.84], [0.04, -0.7]], '#f1e3b6', 0.05); poly(g, [[0.3, -0.66], [0.36, -0.84], [0.22, -0.7]], '#f1e3b6', 0.05); ell(g, -0.1, -0.58, 0.12, 0.06, C.dark, 0.05, -0.4); ell(g, 0.38, -0.55, 0.1, 0.06, C.dark, 0.05, 0.4); }
  if (e === 'rabbit') { const w = Math.sin(t * 4) * 0.03; ell(g, 0.02, -0.92 + w, 0.1, 0.27, C.body, 0.055, -0.12); ell(g, 0.02, -0.92 + w, 0.045, 0.2, C.acc, 0, -0.12); ell(g, 0.27, -0.92 + w, 0.1, 0.27, C.body, 0.055, 0.14); ell(g, 0.27, -0.92 + w, 0.045, 0.2, C.acc, 0, 0.14); }
  if (e === 'tuft') { poly(g, [[0.1, -0.68], [0.02, -0.88], [0.18, -0.74], [0.2, -0.92], [0.28, -0.7]], C.body, 0.05); }
  if (e === 'goat') { g.lineWidth = 0.07; g.strokeStyle = INK; g.lineCap = 'round'; for (const sx2 of [0.02, 0.28]) { g.beginPath(); g.moveTo(sx2, -0.66); g.quadraticCurveTo(sx2 - 0.12, -0.9, sx2 + 0.02, -0.96); g.stroke(); } g.lineWidth = 0.035; g.strokeStyle = '#efe6d4'; for (const sx2 of [0.02, 0.28]) { g.beginPath(); g.moveTo(sx2, -0.66); g.quadraticCurveTo(sx2 - 0.12, -0.9, sx2 + 0.02, -0.96); g.stroke(); } poly(g, [[-0.04, -0.6], [-0.22, -0.54], [-0.04, -0.5]], C.dark, 0.05); }
  // oči
  const ex = hx + 0.15, ey = hy - 0.07, blink = Math.sin(t * 1.3 + ci * 2) > 0.985;
  for (const dx of [0.0, 0.19]) { if (blink) { g.beginPath(); g.moveTo(ex + dx - 0.05, ey); g.lineTo(ex + dx + 0.05, ey); g.lineWidth = 0.04; g.strokeStyle = INK; g.stroke(); } else { ell(g, ex + dx, ey, 0.068, 0.085, '#ffffff', 0.04); ell(g, ex + dx + 0.02, ey + 0.005, 0.034, 0.045, INK, 0); } }
  // čumák
  const n = C.nose, nx = hx + 0.34, ny = hy + 0.12;
  if (n === 'beak') poly(g, [[nx - 0.1, ny - 0.07], [nx + 0.17, ny + 0.02], [nx - 0.1, ny + 0.1]], C.beak, 0.05);
  if (n === 'duck') { ell(g, nx + 0.04, ny + 0.03, 0.17, 0.065, C.beak, 0.05); }
  if (n === 'snout') { ell(g, nx - 0.01, ny + 0.03, 0.15, 0.13, C.belly, 0.05); ell(g, nx + 0.06, ny + 0.0, 0.02, 0.025, INK, 0); }
  if (n === 'pig') { ell(g, nx, ny, 0.14, 0.11, '#ff8fb0', 0.05); ell(g, nx - 0.04, ny, 0.02, 0.035, INK, 0); ell(g, nx + 0.05, ny, 0.02, 0.035, INK, 0); }
  if (n === 'cow') { ell(g, nx, ny + 0.02, 0.15, 0.12, '#ffb3c6', 0.05); ell(g, nx - 0.04, ny + 0.02, 0.02, 0.03, INK, 0); ell(g, nx + 0.05, ny + 0.02, 0.02, 0.03, INK, 0); }
  if (n === 'rabbit') { ell(g, nx - 0.03, ny - 0.02, 0.05, 0.04, '#ff7f9f', 0.04); g.beginPath(); g.moveTo(nx - 0.03, ny + 0.02); g.lineTo(nx - 0.03, ny + 0.1); g.lineWidth = 0.03; g.strokeStyle = INK; g.stroke(); }
  if (n === 'sheep') { ell(g, nx - 0.04, ny + 0.0, 0.05, 0.04, '#ffb3c6', 0.04); }
  if (n === 'goat') { ell(g, nx - 0.01, ny + 0.03, 0.14, 0.11, C.belly, 0.05); poly(g, [[nx - 0.06, ny + 0.1], [nx - 0.02, ny + 0.27], [nx + 0.03, ny + 0.1]], C.dark, 0.04); }
  if (e === 'comb') poly(g, [[nx - 0.06, ny + 0.1], [nx - 0.02, ny + 0.24], [nx + 0.03, ny + 0.1]], '#e8433c', 0.04);
  // tvář
  ell(g, hx + 0.06, hy + 0.14, 0.06, 0.04, C.acc === '#3b3836' ? '#ffb3c6' : 'rgba(255,120,140,.45)', 0);
  g.restore();
}
const portraitCache = new Map();
/** Obrázek postavičky pro menu, čekárnu a hlavičky hráčů (data URL, cachuje se). */
export function portraitURL(ci, px = 96, mood) {
  const key = ci + ':' + px + ':' + (mood || ''); if (portraitCache.has(key)) return portraitCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d'); const sc = px / 1.5; g.setTransform(sc, 0, 0, sc, px * 0.5, px * 0.58);
  drawAnimal(g, ci, 0, 0, { face: 1, t: 0.3, gr: true, dance: mood === 'win' });
  const url = c.toDataURL(); portraitCache.set(key, url); return url;
}

// ------------------------------------------------------------------ dlaždice a terén
export const THEMES = {
  meadow: { sky: ['#8fd8ff', '#d9f4ff'], top: '#62d05a', topDk: '#3da13a', body: '#b0713d', bodyDk: '#8a5628', ice: '#bfeeff', pebble: '#d6a46a' },
  snow: { sky: ['#6e86c8', '#d3dcf5'], top: '#ffffff', topDk: '#c9d6ee', body: '#66748f', bodyDk: '#4b5873', ice: '#b5ecff', pebble: '#8d9bb7' },
  cave: { sky: ['#1d1534', '#3b2a63'], top: '#a07be6', topDk: '#7b55c4', body: '#4f4378', bodyDk: '#382e5a', ice: '#9ee7ff', pebble: '#7a6aa8' },
};
function terrainCell(g, th, x, y, kind, up, left, right, down) {
  const T = THEMES[th];
  if (kind === K.T.ICE) { rrect(g, x + 0.02, y + 0.02, 0.96, 0.96, 0.12, T.ice, 0.055); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x + 0.12, y + 0.14, 0.5, 0.08); g.fillRect(x + 0.12, y + 0.3, 0.22, 0.06); return; }
  g.fillStyle = T.body; g.fillRect(x, y, 1, 1);
  g.fillStyle = T.bodyDk; for (let i = 0; i < 3; i++) { const h = hash(x, y, i + 1); ell(g, x + 0.15 + h * 0.7, y + 0.2 + hash(x, y, i + 9) * 0.65, 0.08 + h * 0.06, 0.06, T.pebble, 0); }
  g.strokeStyle = INK; g.lineWidth = 0.055; g.lineCap = 'butt';
  if (!up) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1, y); g.stroke(); }
  if (!down) { g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + 1, y + 1); g.stroke(); }
  if (!left) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 1); g.stroke(); }
  if (!right) { g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + 1, y + 1); g.stroke(); }
  if (!up) { g.fillStyle = T.top; g.fillRect(x - (left ? 0 : -0.03), y + 0.03, 1 + (left ? 0 : -0.03) + (right ? 0 : -0.03), 0.26); g.fillStyle = T.topDk; g.fillRect(x, y + 0.26, 1, 0.07); if (th !== 'snow') for (let i = 0; i < 3; i++) { const bx = x + 0.12 + i * 0.3 + hash(x, y, i) * 0.1; poly(g, [[bx, y + 0.33], [bx + 0.06, y + 0.4 + hash(x, y, i + 4) * 0.08], [bx + 0.12, y + 0.33]], T.topDk, 0); } g.strokeStyle = INK; g.lineWidth = 0.055; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1, y); g.stroke(); }
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
  if (tile === K.T.BOUNCE) {
    rrect(g, x + 0.03, y + 0.55, 0.94, 0.42, 0.1, '#7a6f9b', 0.06);
    const c = o.bounce || 0, sq = 1 - c * 0.35; g.save(); g.translate(x + 0.5, y + 0.58); g.scale(1, sq);
    g.beginPath(); g.moveTo(-0.34, 0); g.bezierCurveTo(-0.34, -0.34, 0.34, -0.34, 0.34, 0); g.closePath(); g.fillStyle = '#ff5a6e'; g.fill(); g.lineWidth = 0.06; g.strokeStyle = INK; g.stroke(); ell(g, -0.1, -0.15, 0.08, 0.05, 'rgba(255,255,255,.6)', 0); g.restore(); return;
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
/** Nakreslí kus (základní vzhled bez pohyblivých částí). o = { alpha, tint, own (barva místa), shake, owners: [seat], t } */
export function drawPieceShape(g, type, r, x, y, o = {}) {
  const P = K.PIECES[type], cells = K.pieceCells(type, r), own = o.own || '#ffffff', face = K.faceOf(type, r);
  g.save(); if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  if (type === 'mover') {
    const ax = r % 2; const n = 9; g.strokeStyle = 'rgba(40,30,20,.45)'; g.lineWidth = 0.07; g.setLineDash([0.18, 0.16]); g.beginPath();
    if (!ax) { g.moveTo(x + 0.3, y + 0.5); g.lineTo(x + n - 0.3, y + 0.5); } else { g.moveTo(x + 1.5, y + 0.3); g.lineTo(x + 1.5, y + n - 0.3); } g.stroke(); g.setLineDash([]);
    if (o.ghost) moverShape(g, ax ? x + 0 : x + 3, ax ? y + 3 : y, own, 0);
  } else for (const [dx, dy] of cells) {
    const cx = x + dx, cy = y + dy;
    if (P.kind === 'solid') solidCell(g, P.tile, cx, cy, own, o);
    else if (type === 'spikes') spikeCell(g, cx, cy, face, own);
    else if (type === 'cannon') cannonShape(g, cx, cy, face, own, o.recoil || 0);
    else if (type === 'flame') flameShape(g, cx, cy, face, own);
  }
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
export function pieceIcon(type, px = 120) {
  const key = type + ':' + px; if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d');
  let r = 0; const [w, h] = type === 'mover' ? [3, 1] : K.pieceSize(type, r); const cells = type === 'mover' ? [[0, 0], [1, 0], [2, 0]] : K.pieceCells(type, r); const sc = Math.min(px * 0.86 / Math.max(w, h, 2), px / 2.4);
  g.setTransform(sc, 0, 0, sc, (px - w * sc) / 2, (px - h * sc) / 2 + 0.02 * px);
  if (type === 'mover') { moverShape(g, 0, 0, '#ffffff', 0); } else if (type === 'saw') sawShape(g, 1, 1, 0.92, 0.4, '#ffffff'); else { void cells; drawPieceShape(g, type, r, 0, 0, { own: '#ffffff' }); }
  const url = c.toDataURL(); iconCache.set(key, url); return url;
}
/** Náhled trati pro výběr stage. */
export function stageThumb(si, px = 192) {
  const key = 'st' + si + ':' + px; if (iconCache.has(key)) return iconCache.get(key);
  const S = K.STAGES[si]; const c = document.createElement('canvas'); c.width = px; c.height = Math.round((px * ROWS) / COLS); const g = c.getContext('2d'); const sc = px / COLS; g.setTransform(sc, 0, 0, sc, 0, 0);
  drawBackground(g, S.theme, 0); drawTerrain(g, S); flagShape(g, S.flag[0], S.flag[1], 0); startSign(g, S.spawn[0], S.spawn[1]);
  const url = c.toDataURL(); iconCache.set(key, url); return url;
}
