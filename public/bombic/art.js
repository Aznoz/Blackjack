// BOMBIC – kreslená grafika (bez emoji a bez obrázků): travnatá podlaha, kameny, rozbitné sudy (pařezy), stromy na okraji, bomby, plameny,
// předměty a malí bombeři ve čtyřech barvách. Všechno se kreslí vektorově na canvas, takže je ostré na každém displeji.
import { SKINS, T, MAPS, COLS, ROWS } from './shared.js';
const TAU = Math.PI * 2;
const OL = '#26180f';
const hash = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function circ(g, x, y, r, fill, lw = 0, stroke = OL) { g.beginPath(); g.arc(x, y, r, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
function ell(g, x, y, rx, ry, fill, lw = 0, stroke = OL) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }

// ------------------------------------------------------------------ terén (každá mapa má vlastní prostředí)
const TH = {
  forest: { a: '#52a246', b: '#4c9a41', det: 'rgba(30,90,30,.45)', stone: ['#b8bec6', '#8c939d', '#6b727c', '#444a52'], bg: '#1b4a22' },
  desert: { a: '#e8cd8e', b: '#e0c382', det: 'rgba(150,110,50,.5)', stone: ['#ead09a', '#c9a066', '#a47c42', '#6e5226'], bg: '#c99d58' },
  snow: { a: '#edf5fc', b: '#e0ecf7', det: 'rgba(140,175,210,.6)', stone: ['#d8e3ef', '#a3b6ca', '#7d91a8', '#46566a'], bg: '#9db8cf' },
  lava: { a: '#4c3b3b', b: '#43332f', det: 'rgba(255,120,30,.55)', stone: ['#756a86', '#51495f', '#352f42', '#16121c'], bg: '#1b1013' },
  cave: { a: '#40486a', b: '#3a4262', det: 'rgba(130,150,230,.35)', stone: ['#8e97b6', '#6c7592', '#4a5272', '#232842'], bg: '#1c2133' },
};
const thOf = (n) => TH[n] || TH.forest;
export function drawFloor(g, x, y, ts, gx, gy, theme = 'forest') {
  const th = thOf(theme); g.fillStyle = (gx + gy) % 2 ? th.a : th.b; g.fillRect(x, y, ts, ts);
  g.strokeStyle = th.det; g.lineWidth = Math.max(1, ts * 0.04); g.lineCap = 'round';
  if (theme === 'forest') {
    for (let i = 0; i < 3; i++) { const px = x + ts * (0.15 + 0.7 * hash(gx, gy, i)), py = y + ts * (0.2 + 0.7 * hash(gx, gy, i + 7)); g.beginPath(); g.moveTo(px, py); g.lineTo(px - ts * 0.04, py - ts * 0.1); g.moveTo(px, py); g.lineTo(px + ts * 0.05, py - ts * 0.09); g.stroke(); }
    if (hash(gx, gy, 3) < 0.12) circ(g, x + ts * (0.2 + 0.6 * hash(gx, gy, 4)), y + ts * (0.2 + 0.6 * hash(gx, gy, 5)), ts * 0.045, '#f7e86b');
  } else if (theme === 'desert') {
    for (let i = 0; i < 3; i++) { const px = x + ts * (0.15 + 0.7 * hash(gx, gy, i)), py = y + ts * (0.2 + 0.7 * hash(gx, gy, i + 7)); ell(g, px, py, ts * 0.045, ts * 0.028, th.det); }
    if (hash(gx, gy, 3) < 0.3) { g.beginPath(); g.arc(x + ts * 0.5, y + ts * 1.05, ts * 0.45, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
  } else if (theme === 'snow') {
    for (let i = 0; i < 2; i++) { const px = x + ts * (0.15 + 0.7 * hash(gx, gy, i)), py = y + ts * (0.2 + 0.7 * hash(gx, gy, i + 7)); g.beginPath(); g.moveTo(px - ts * 0.07, py); g.lineTo(px + ts * 0.07, py); g.moveTo(px, py - ts * 0.07); g.lineTo(px, py + ts * 0.07); g.stroke(); }
    if (hash(gx, gy, 3) < 0.2) circ(g, x + ts * 0.6, y + ts * 0.35, ts * 0.04, '#fff');
  } else if (theme === 'lava') {
    if (hash(gx, gy, 2) < 0.45) { const px = x + ts * (0.2 + 0.3 * hash(gx, gy, 4)), py = y + ts * (0.2 + 0.3 * hash(gx, gy, 5)); g.beginPath(); g.moveTo(px, py); g.lineTo(px + ts * 0.2, py + ts * 0.1); g.lineTo(px + ts * 0.28, py + ts * 0.32); g.lineTo(px + ts * 0.5, py + ts * 0.4); g.stroke(); }
  } else {
    for (let i = 0; i < 2; i++) { const px = x + ts * (0.15 + 0.7 * hash(gx, gy, i)), py = y + ts * (0.25 + 0.65 * hash(gx, gy, i + 7)); g.beginPath(); g.moveTo(px, py); g.lineTo(px + ts * 0.03, py - ts * 0.1); g.lineTo(px + ts * 0.06, py); g.closePath(); g.stroke(); }
  }
}
export function drawStone(g, x, y, ts, gx, gy, theme = 'forest') {
  const th = thOf(theme); const c = th.stone;
  ell(g, x + ts / 2, y + ts * 0.88, ts * 0.42, ts * 0.12, 'rgba(0,0,0,.25)');
  g.beginPath(); g.moveTo(x + ts * 0.1, y + ts * 0.82); g.quadraticCurveTo(x + ts * 0.02, y + ts * 0.45, x + ts * 0.26, y + ts * 0.2); g.quadraticCurveTo(x + ts * 0.5, y + ts * 0.04, x + ts * 0.76, y + ts * 0.2); g.quadraticCurveTo(x + ts * 0.98, y + ts * 0.42, x + ts * 0.9, y + ts * 0.82); g.closePath();
  const gr = g.createLinearGradient(x, y, x + ts, y + ts); gr.addColorStop(0, c[0]); gr.addColorStop(0.6, c[1]); gr.addColorStop(1, c[2]); g.fillStyle = gr; g.fill(); g.strokeStyle = c[3]; g.lineWidth = Math.max(1.5, ts * 0.05); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = Math.max(1, ts * 0.04); g.beginPath(); g.moveTo(x + ts * 0.26, y + ts * 0.34); g.quadraticCurveTo(x + ts * 0.4, y + ts * 0.18, x + ts * 0.6, y + ts * 0.2); g.stroke();
  g.strokeStyle = theme === 'lava' ? 'rgba(255,130,40,.9)' : 'rgba(40,45,52,.5)'; g.beginPath(); g.moveTo(x + ts * (0.45 + 0.2 * hash(gx, gy)), y + ts * 0.45); g.lineTo(x + ts * 0.55, y + ts * 0.6); g.lineTo(x + ts * 0.5, y + ts * 0.75); g.stroke();
  if (theme === 'snow') { g.beginPath(); g.moveTo(x + ts * 0.18, y + ts * 0.36); g.quadraticCurveTo(x + ts * 0.3, y + ts * 0.1, x + ts * 0.52, y + ts * 0.1); g.quadraticCurveTo(x + ts * 0.74, y + ts * 0.1, x + ts * 0.82, y + ts * 0.34); g.quadraticCurveTo(x + ts * 0.7, y + ts * 0.26, x + ts * 0.6, y + ts * 0.34); g.quadraticCurveTo(x + ts * 0.46, y + ts * 0.24, x + ts * 0.32, y + ts * 0.34); g.quadraticCurveTo(x + ts * 0.26, y + ts * 0.3, x + ts * 0.18, y + ts * 0.36); g.fillStyle = '#fff'; g.fill(); }
}
export function drawTree(g, x, y, ts, gx, gy) {
  g.fillStyle = '#1b4a22'; g.fillRect(x, y, ts, ts);
  const cx = x + ts / 2, cy = y + ts / 2; const j = hash(gx, gy);
  ell(g, cx, y + ts * 0.9, ts * 0.4, ts * 0.1, 'rgba(0,0,0,.3)');
  g.fillStyle = '#5a3a1c'; g.fillRect(cx - ts * 0.08, cy + ts * 0.15, ts * 0.16, ts * 0.32);
  circ(g, cx - ts * 0.18, cy + ts * 0.02, ts * 0.27, '#2b7a35', Math.max(1, ts * 0.03), '#14381a'); circ(g, cx + ts * 0.2, cy + ts * 0.05, ts * 0.26, '#2f8a3a', Math.max(1, ts * 0.03), '#14381a');
  circ(g, cx, cy - ts * 0.16, ts * 0.3, j < 0.5 ? '#3a9a45' : '#36923f', Math.max(1, ts * 0.03), '#14381a'); circ(g, cx - ts * 0.08, cy - ts * 0.22, ts * 0.1, 'rgba(255,255,255,.18)');
}
function drawBorder(g, x, y, ts, gx, gy, theme) {
  if (theme === 'forest') return drawTree(g, x, y, ts, gx, gy);
  const th = thOf(theme); g.fillStyle = th.bg; g.fillRect(x, y, ts, ts); const cx = x + ts / 2, cy = y + ts / 2; const lw = Math.max(1.2, ts * 0.04);
  ell(g, cx, y + ts * 0.9, ts * 0.4, ts * 0.1, 'rgba(0,0,0,.3)');
  if (theme === 'desert') {   // kaktus
    g.lineJoin = 'round'; const body = (bx, by, w, h, r) => { rr(g, bx, by, w, h, r); g.fillStyle = '#3f9a4a'; g.fill(); g.strokeStyle = '#1d5a28'; g.lineWidth = lw; g.stroke(); };
    body(cx - ts * 0.11, y + ts * 0.14, ts * 0.22, ts * 0.74, ts * 0.11); body(cx - ts * 0.34, y + ts * 0.34, ts * 0.12, ts * 0.3, ts * 0.06); body(cx - ts * 0.34, y + ts * 0.52, ts * 0.3, ts * 0.12, ts * 0.06); body(cx + ts * 0.22, y + ts * 0.26, ts * 0.12, ts * 0.28, ts * 0.06); body(cx + ts * 0.04, y + ts * 0.44, ts * 0.3, ts * 0.12, ts * 0.06);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = lw * 0.7; g.beginPath(); g.moveTo(cx, y + ts * 0.2); g.lineTo(cx, y + ts * 0.8); g.stroke(); if (hash(gx, gy) < 0.4) circ(g, cx, y + ts * 0.14, ts * 0.06, '#ff7a9a');
  } else if (theme === 'snow') {   // zasněžená borovice
    g.lineJoin = 'round'; g.fillStyle = '#5a3a1c'; g.fillRect(cx - ts * 0.07, y + ts * 0.7, ts * 0.14, ts * 0.2);
    for (const [w, yy] of [[0.5, 0.52], [0.4, 0.34], [0.3, 0.17]]) { g.beginPath(); g.moveTo(cx, y + ts * (yy - 0.16)); g.lineTo(cx + ts * w * 0.9, y + ts * (yy + 0.2)); g.lineTo(cx - ts * w * 0.9, y + ts * (yy + 0.2)); g.closePath(); g.fillStyle = '#2d7a55'; g.fill(); g.strokeStyle = '#144530'; g.lineWidth = lw; g.stroke(); g.beginPath(); g.moveTo(cx, y + ts * (yy - 0.16)); g.lineTo(cx + ts * w * 0.5, y + ts * (yy + 0.02)); g.quadraticCurveTo(cx, y + ts * (yy + 0.08), cx - ts * w * 0.5, y + ts * (yy + 0.02)); g.closePath(); g.fillStyle = '#f4faff'; g.fill(); }
  } else if (theme === 'lava') {   // tmavá skála se žhavým okrajem
    g.beginPath(); g.moveTo(x + ts * 0.08, y + ts * 0.9); g.lineTo(x + ts * 0.18, y + ts * 0.3); g.lineTo(x + ts * 0.42, y + ts * 0.14); g.lineTo(x + ts * 0.68, y + ts * 0.22); g.lineTo(x + ts * 0.9, y + ts * 0.9); g.closePath(); g.fillStyle = '#2d2328'; g.fill(); g.strokeStyle = '#0c0709'; g.lineWidth = lw; g.stroke();
    g.strokeStyle = '#ff7a1a'; g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(x + ts * 0.3, y + ts * 0.3); g.lineTo(x + ts * 0.4, y + ts * 0.55); g.lineTo(x + ts * 0.34, y + ts * 0.78); g.moveTo(x + ts * 0.6, y + ts * 0.34); g.lineTo(x + ts * 0.66, y + ts * 0.62); g.stroke();
    ell(g, cx, y + ts * 0.92, ts * 0.36, ts * 0.07, 'rgba(255,110,20,.55)');
  } else {   // jeskyně: cihlová zeď
    g.fillStyle = '#262c42'; g.fillRect(x, y, ts, ts); g.strokeStyle = '#141829'; g.lineWidth = lw;
    for (let r = 0; r < 3; r++) { const yy = y + (r * ts) / 3; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + ts, yy); g.stroke(); const off = (r + gx) % 2 ? ts / 2 : 0; for (let c = 0; c < 2; c++) { const xx = x + off + c * (ts / 2); if (xx > x && xx < x + ts) { g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + ts / 3); g.stroke(); } } }
    if (hash(gx, gy) < 0.3) { g.fillStyle = '#4fae7a'; g.beginPath(); g.ellipse(x + ts * 0.5, y + ts * 0.98, ts * 0.2, ts * 0.06, 0, 0, TAU); g.fill(); }
  }
}
export function drawStump(g, x, y, ts, gx, gy, theme = 'forest') {   // rozbitný předmět (sud, bedna, ledový blok, ohořelý balvan, krystal)
  const cx = x + ts / 2; ell(g, cx, y + ts * 0.9, ts * 0.38, ts * 0.1, 'rgba(0,0,0,.28)'); const lw = Math.max(1.5, ts * 0.05);
  if (theme === 'desert') {   // dřevěná bedna
    rr(g, x + ts * 0.12, y + ts * 0.18, ts * 0.76, ts * 0.7, ts * 0.08); const gr = g.createLinearGradient(0, y, 0, y + ts); gr.addColorStop(0, '#d9a45e'); gr.addColorStop(1, '#a87434'); g.fillStyle = gr; g.fill(); g.strokeStyle = OL; g.lineWidth = lw; g.stroke();
    g.strokeStyle = '#6e4320'; g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(x + ts * 0.14, y + ts * 0.22); g.lineTo(x + ts * 0.86, y + ts * 0.84); g.moveTo(x + ts * 0.86, y + ts * 0.22); g.lineTo(x + ts * 0.14, y + ts * 0.84); g.stroke(); g.strokeRect(x + ts * 0.2, y + ts * 0.26, ts * 0.6, ts * 0.54); return;
  }
  if (theme === 'snow') {   // ledový blok
    rr(g, x + ts * 0.12, y + ts * 0.2, ts * 0.76, ts * 0.68, ts * 0.14); const gr = g.createLinearGradient(x, y, x + ts, y + ts); gr.addColorStop(0, '#e8f9ff'); gr.addColorStop(0.5, '#a9dcf5'); gr.addColorStop(1, '#6db6e0'); g.fillStyle = gr; g.fill(); g.strokeStyle = '#2b6b98'; g.lineWidth = lw; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = lw * 0.9; g.beginPath(); g.moveTo(x + ts * 0.24, y + ts * 0.34); g.lineTo(x + ts * 0.4, y + ts * 0.28); g.moveTo(x + ts * 0.26, y + ts * 0.5); g.lineTo(x + ts * 0.3, y + ts * 0.6); g.stroke(); return;
  }
  if (theme === 'lava') {   // ohořelý balvan se žhavými prasklinami
    g.beginPath(); g.moveTo(x + ts * 0.14, y + ts * 0.86); g.quadraticCurveTo(x + ts * 0.08, y + ts * 0.4, x + ts * 0.3, y + ts * 0.24); g.quadraticCurveTo(x + ts * 0.52, y + ts * 0.12, x + ts * 0.74, y + ts * 0.26); g.quadraticCurveTo(x + ts * 0.94, y + ts * 0.42, x + ts * 0.86, y + ts * 0.86); g.closePath(); g.fillStyle = '#6a3326'; g.fill(); g.strokeStyle = '#0c0709'; g.lineWidth = lw; g.stroke();
    g.strokeStyle = '#ffb02e'; g.lineWidth = lw; g.beginPath(); g.moveTo(x + ts * 0.3, y + ts * 0.34); g.lineTo(x + ts * 0.44, y + ts * 0.5); g.lineTo(x + ts * 0.38, y + ts * 0.7); g.moveTo(x + ts * 0.44, y + ts * 0.5); g.lineTo(x + ts * 0.66, y + ts * 0.56); g.lineTo(x + ts * 0.72, y + ts * 0.74); g.stroke(); return;
  }
  if (theme === 'cave') {   // krystaly
    const cr = (px, py, w, h, c1, c2) => { g.beginPath(); g.moveTo(px - w, py); g.lineTo(px - w * 0.7, py - h * 0.7); g.lineTo(px, py - h); g.lineTo(px + w * 0.7, py - h * 0.7); g.lineTo(px + w, py); g.closePath(); const gr = g.createLinearGradient(px - w, py - h, px + w, py); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fill(); g.strokeStyle = '#1a1030'; g.lineWidth = lw * 0.8; g.stroke(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.moveTo(px - w * 0.3, py - h * 0.2); g.lineTo(px - w * 0.3, py - h * 0.7); g.stroke(); };
    cr(x + ts * 0.3, y + ts * 0.84, ts * 0.17, ts * 0.46, '#d9a8ff', '#7a3fd0'); cr(x + ts * 0.68, y + ts * 0.84, ts * 0.16, ts * 0.52, '#9fe8ff', '#3a8ad0'); cr(x + ts * 0.5, y + ts * 0.88, ts * 0.2, ts * 0.66, '#f2c4ff', '#9a52e8'); return;
  }
  const w = ts * 0.74, h = ts * 0.74;   // sud
  g.save(); g.translate(cx, y + ts * 0.52);
  g.beginPath(); g.moveTo(-w * 0.42, -h * 0.34); g.quadraticCurveTo(-w * 0.56, 0, -w * 0.42, h * 0.38); g.lineTo(w * 0.42, h * 0.38); g.quadraticCurveTo(w * 0.56, 0, w * 0.42, -h * 0.34); g.closePath();
  const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0); gr.addColorStop(0, '#6e4320'); gr.addColorStop(0.45, '#a8692f'); gr.addColorStop(1, '#6a3f1c'); g.fillStyle = gr; g.fill(); g.strokeStyle = OL; g.lineWidth = lw; g.stroke();
  g.strokeStyle = 'rgba(40,20,5,.5)'; g.lineWidth = Math.max(1, ts * 0.03); for (const f of [-0.2, 0.05, 0.28]) { g.beginPath(); g.moveTo(w * f, -h * 0.32); g.lineTo(w * f * 1.05, h * 0.36); g.stroke(); }
  for (const yy of [-0.17, 0.2]) { g.fillStyle = '#5a5f69'; g.fillRect(-w * 0.5, h * yy - ts * 0.03, w, ts * 0.07); g.strokeStyle = '#2b2e34'; g.lineWidth = 1; g.strokeRect(-w * 0.5, h * yy - ts * 0.03, w, ts * 0.07); }
  ell(g, 0, -h * 0.34, w * 0.42, h * 0.13, '#c58a4a', Math.max(1.5, ts * 0.045)); ell(g, 0, -h * 0.34, w * 0.28, h * 0.075, '#8f5a28');
  g.restore();
}
export function drawTile(g, t, x, y, ts, gx, gy, border, theme = 'forest') {
  if (border) return drawBorder(g, x, y, ts, gx, gy, theme);
  drawFloor(g, x, y, ts, gx, gy, theme);
  if (t === T.STONE) drawStone(g, x, y, ts, gx, gy, theme); else if (t === T.STUMP) drawStump(g, x, y, ts, gx, gy, theme);
}

// ------------------------------------------------------------------ bomby, plameny, předměty
export function drawBomb(g, cx, cy, ts, fuse, t, kicked) {
  const urgency = fuse < 18 ? 1 : 0; const pulse = 1 + Math.sin(t * (urgency ? 22 : 9)) * (urgency ? 0.08 : 0.04); const r = ts * 0.34 * pulse;
  ell(g, cx, cy + ts * 0.3, ts * 0.3, ts * 0.09, 'rgba(0,0,0,.3)');
  const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r); gr.addColorStop(0, urgency && Math.sin(t * 22) > 0 ? '#ff6b5a' : '#5c6070'); gr.addColorStop(1, '#14161d');
  circ(g, cx, cy, r, gr, Math.max(1.5, ts * 0.05), '#05060a'); circ(g, cx - r * 0.38, cy - r * 0.4, r * 0.2, 'rgba(255,255,255,.55)');
  g.strokeStyle = '#d8c8a0'; g.lineWidth = Math.max(1.5, ts * 0.06); g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + r * 0.2, cy - r * 0.9); g.quadraticCurveTo(cx + r * 0.6, cy - r * 1.3, cx + r * 0.95, cy - r * 1.15); g.stroke();
  const sp = ts * (0.08 + 0.04 * Math.sin(t * 30)); g.fillStyle = '#ffd24a'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + t * 4, rr2 = i % 2 ? sp * 0.45 : sp; g.lineTo(cx + r * 0.95 + Math.cos(a) * rr2, cy - r * 1.15 + Math.sin(a) * rr2); } g.closePath(); g.fill();
  void kicked;
}
export function drawFlame(g, x, y, ts, t, gx, gy) {
  const k = 0.92 + 0.08 * Math.sin(t * 40 + gx * 2 + gy); const m = ts * (1 - k) / 2;
  rr(g, x + m + ts * 0.03, y + m + ts * 0.03, ts * k - ts * 0.06, ts * k - ts * 0.06, ts * 0.28); const gr = g.createRadialGradient(x + ts / 2, y + ts / 2, ts * 0.05, x + ts / 2, y + ts / 2, ts * 0.55); gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.35, '#ffd23a'); gr.addColorStop(0.75, '#ff7a1a'); gr.addColorStop(1, '#d9321c'); g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(120,20,0,.5)'; g.lineWidth = Math.max(1, ts * 0.04); g.stroke();
}
export function skullIcon(g, s) {   // lebka, střed v (0,0), poloměr ≈ s
  ell(g, 0, -s * 0.1, s * 0.82, s * 0.78, '#f1ede0', Math.max(1, s * 0.12), '#222'); rr(g, -s * 0.5, s * 0.35, s, s * 0.55, s * 0.18); g.fillStyle = '#f1ede0'; g.fill(); g.strokeStyle = '#222'; g.lineWidth = Math.max(1, s * 0.12); g.stroke();
  ell(g, -s * 0.33, -s * 0.12, s * 0.22, s * 0.27, '#1a1426'); ell(g, s * 0.33, -s * 0.12, s * 0.22, s * 0.27, '#1a1426');
  g.fillStyle = '#1a1426'; g.beginPath(); g.moveTo(0, s * 0.1); g.lineTo(-s * 0.1, s * 0.3); g.lineTo(s * 0.1, s * 0.3); g.closePath(); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = Math.max(1, s * 0.08); for (const i of [-0.2, 0, 0.2]) { g.beginPath(); g.moveTo(s * i, s * 0.52); g.lineTo(s * i, s * 0.86); g.stroke(); }
}
const ITEM_COL = { bomb: ['#5b7bff', '#2438a8'], fire: ['#ff8a3a', '#c2330f'], speed: ['#4cd070', '#17803a'], kick: ['#b36cff', '#6a2cb8'], skull: ['#7b7f8c', '#2e3038'], skate: ['#ff9a2a', '#c2520f'] };
export function drawItemIcon(g, type, s) {   // ikona předmětu uvnitř odznaku, střed (0,0), polovina šířky s
  if (type === 'bomb') { circ(g, 0, s * 0.1, s * 0.5, '#111319', Math.max(1, s * 0.08), '#000'); circ(g, -s * 0.18, -s * 0.08, s * 0.14, 'rgba(255,255,255,.6)'); g.strokeStyle = '#e9d9ac'; g.lineWidth = Math.max(1.5, s * 0.12); g.lineCap = 'round'; g.beginPath(); g.moveTo(s * 0.2, -s * 0.34); g.quadraticCurveTo(s * 0.45, -s * 0.7, s * 0.65, -s * 0.5); g.stroke(); circ(g, s * 0.66, -s * 0.5, s * 0.15, '#ffd24a'); g.fillStyle = '#fff'; g.font = `900 ${s * 0.7}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+', s * 0.55, s * 0.45); }
  else if (type === 'fire') { g.beginPath(); g.moveTo(0, -s * 0.85); g.bezierCurveTo(s * 0.5, -s * 0.35, s * 0.8, s * 0.1, s * 0.55, s * 0.5); g.bezierCurveTo(s * 0.35, s * 0.85, -s * 0.35, s * 0.85, -s * 0.55, s * 0.5); g.bezierCurveTo(-s * 0.8, s * 0.1, -s * 0.3, -s * 0.3, 0, -s * 0.85); g.fillStyle = '#fff2a8'; g.fill(); g.strokeStyle = '#7a2208'; g.lineWidth = Math.max(1, s * 0.1); g.stroke(); g.beginPath(); g.moveTo(0, -s * 0.2); g.bezierCurveTo(s * 0.3, s * 0.1, s * 0.3, s * 0.5, 0, s * 0.55); g.bezierCurveTo(-s * 0.3, s * 0.5, -s * 0.3, s * 0.1, 0, -s * 0.2); g.fillStyle = '#ff9a2a'; g.fill(); }
  else if (type === 'speed') { g.beginPath(); g.moveTo(s * 0.15, -s * 0.9); g.lineTo(-s * 0.6, s * 0.1); g.lineTo(-s * 0.05, s * 0.1); g.lineTo(-s * 0.2, s * 0.9); g.lineTo(s * 0.62, -s * 0.2); g.lineTo(s * 0.08, -s * 0.2); g.closePath(); g.fillStyle = '#fff6a8'; g.fill(); g.strokeStyle = '#7a5a00'; g.lineWidth = Math.max(1, s * 0.1); g.lineJoin = 'round'; g.stroke(); }
  else if (type === 'kick') { g.beginPath(); g.moveTo(-s * 0.7, s * 0.55); g.lineTo(-s * 0.7, -s * 0.1); g.quadraticCurveTo(-s * 0.7, -s * 0.5, -s * 0.35, -s * 0.5); g.lineTo(-s * 0.05, -s * 0.5); g.lineTo(s * 0.1, -s * 0.05); g.quadraticCurveTo(s * 0.7, 0, s * 0.72, s * 0.3); g.lineTo(s * 0.72, s * 0.55); g.closePath(); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#3d1a6a'; g.lineWidth = Math.max(1, s * 0.1); g.lineJoin = 'round'; g.stroke(); g.fillStyle = '#7a3fd0'; g.fillRect(-s * 0.7, s * 0.4, s * 1.42, s * 0.15); }
  else if (type === 'skull') { g.save(); g.translate(0, s * 0.05); skullIcon(g, s * 0.72); g.restore(); }
  else if (type === 'skate') skateBoard(g, s * 0.95, true);
}
export function drawItem(g, type, x, y, ts, t, gx, gy) {
  const c = ITEM_COL[type] || ITEM_COL.bomb; const bob = Math.sin(t * 4 + gx + gy) * ts * 0.035; const cx = x + ts / 2, cy = y + ts / 2 + bob; const w = ts * 0.78;
  ell(g, cx, y + ts * 0.9, ts * 0.3, ts * 0.07, 'rgba(0,0,0,.25)');
  rr(g, cx - w / 2, cy - w / 2, w, w, w * 0.22); const gr = g.createLinearGradient(0, cy - w / 2, 0, cy + w / 2); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]); g.fillStyle = gr; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.5, ts * 0.05); g.stroke();
  g.save(); g.translate(cx, cy); drawItemIcon(g, type, w * 0.34); g.restore();
}
export function drawWarn(g, x, y, ts, t) {
  g.fillStyle = `rgba(255,60,40,${0.25 + 0.2 * Math.sin(t * 20)})`; g.fillRect(x, y, ts, ts); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = Math.max(1.5, ts * 0.06); g.beginPath(); g.moveTo(x + ts * 0.25, y + ts * 0.25); g.lineTo(x + ts * 0.75, y + ts * 0.75); g.moveTo(x + ts * 0.75, y + ts * 0.25); g.lineTo(x + ts * 0.25, y + ts * 0.75); g.stroke();
}

// ------------------------------------------------------------------ skateboard
export function skateBoard(g, s, big) {   // střed (0,0), s = polovina délky; big = ikona předmětu (bez stínu, výraznější)
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-s * 0.95, -s * 0.12); g.quadraticCurveTo(-s * 1.05, -s * 0.28, -s * 0.85, -s * 0.28); g.lineTo(s * 0.85, -s * 0.28); g.quadraticCurveTo(s * 1.05, -s * 0.28, s * 0.95, -s * 0.12); g.lineTo(s * 0.8, s * 0.1); g.lineTo(-s * 0.8, s * 0.1); g.closePath();
  g.fillStyle = big ? '#fff2c8' : '#ff8a1f'; g.fill(); g.strokeStyle = OL; g.lineWidth = Math.max(1.3, s * 0.14); g.stroke();
  g.fillStyle = big ? '#e5483f' : '#ffd24a'; g.fillRect(-s * 0.55, -s * 0.2, s * 1.1, s * 0.1);
  for (const sx of [-s * 0.5, s * 0.5]) { circ(g, sx, s * 0.32, s * 0.2, '#2a2a38', Math.max(1, s * 0.1)); circ(g, sx, s * 0.32, s * 0.07, '#d9dde8'); }
  g.restore();
}

// ------------------------------------------------------------------ bombeři a jejich skiny
const FACE = '#8a4a2a';
function headBase(g, S, face) {
  const tone = S.tone || '#ffe3c4';
  if (S.hat === 'ninja') { circ(g, 0, -9, 11.5, S.hc, 1.8); g.save(); g.beginPath(); g.arc(0, -9, 11.3, 0, TAU); g.clip(); g.fillStyle = tone; if (face !== 1) g.fillRect(-12, -12.5, 24, 8.5); g.restore(); }
  else circ(g, 0, -9, 11.5, tone, 1.8);
}
function faceDraw(g, S, face) {
  const ex = face === 4 ? -3 : face === 2 ? 3 : 0;
  if (face !== 1) {
    for (const sx of face === 3 ? [-4.2, 4.2] : [ex - 3.4 + (face === 2 ? 1 : 0), ex + 3.4 + (face === 4 ? -1 : 0)]) { ell(g, sx, -7.8, 2.4, 3.2, '#fff', 1.2); circ(g, sx + ex * 0.35, -7.4, 1.5, '#1a1426'); }
    if (S.hat === 'pirate') { const px = face === 4 ? ex - 3.4 : face === 2 ? ex + 3.4 - 1 : 4.2; ell(g, px, -7.8, 3.2, 3.8, '#15151c'); g.strokeStyle = '#15151c'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px - 3, -9.5); g.lineTo(-11, -15); g.stroke(); }
    if (S.hat !== 'ninja') { g.strokeStyle = FACE; g.lineWidth = 1.2; g.beginPath(); g.arc(ex * 0.6, -3, 2.4, 0.2, Math.PI - 0.2); g.stroke(); }
  } else { g.fillStyle = S.hat === 'ninja' ? S.hc : S.dark; g.beginPath(); g.ellipse(0, -6, 7, 4.5, 0, 0, Math.PI); g.fill(); }
}
function helmetShape(g, fill) { g.beginPath(); g.arc(0, -10, 11.8, Math.PI * 1.04, Math.PI * 1.96); g.quadraticCurveTo(0, -12.5, -11.4, -9); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = OL; g.lineWidth = 1.8; g.stroke(); }
function hatDraw(g, S, face, t) {
  const hc = S.hc || S.main, hd = S.hd || S.dark; const ex = face === 4 ? -5.5 : face === 2 ? 5.5 : 0; g.lineWidth = 1.8; g.strokeStyle = OL;
  const path = (fn, fill, line = true) => { g.beginPath(); fn(); if (fill) { g.fillStyle = fill; g.fill(); } if (line) g.stroke(); };
  switch (S.hat) {
    case 'cap': helmetShape(g, hc); circ(g, 0, -21.6, 1.8, hd, 1.2); if (face !== 1) { g.beginPath(); g.ellipse(ex * 0.9, -11.6, 8.8, 2.8, 0, 0, TAU); g.fillStyle = hd; g.fill(); g.stroke(); } break;
    case 'chef': for (const [cx, cy, r] of [[-6.5, -26, 6.2], [0, -29, 7], [6.5, -26, 6.2]]) circ(g, cx, cy, r, '#fff', 1.6); g.fillStyle = '#fff'; g.fillRect(-9.5, -26, 19, 8); rr(g, -9.8, -20.6, 19.6, 5.6, 2); g.fillStyle = '#fff'; g.fill(); g.stroke(); g.strokeStyle = 'rgba(150,140,120,.5)'; g.lineWidth = 1; for (const x of [-4, 2, 7]) { g.beginPath(); g.moveTo(x, -19.5); g.lineTo(x, -16.5); g.stroke(); } break;
    case 'party': path(() => { g.moveTo(-8.5, -17); g.lineTo(0, -35); g.lineTo(8.5, -17); g.closePath(); }, hc); g.save(); g.clip(); g.strokeStyle = hd; g.lineWidth = 3; for (const o of [-26, -22, -18]) { g.beginPath(); g.moveTo(-10, o + 6); g.lineTo(10, o - 6); g.stroke(); } g.restore(); g.strokeStyle = OL; g.lineWidth = 1.8; path(() => { g.moveTo(-8.5, -17); g.lineTo(0, -35); g.lineTo(8.5, -17); }, null); g.beginPath(); g.ellipse(0, -17, 9.2, 2.4, 0, 0, TAU); g.fillStyle = hd; g.fill(); g.stroke(); circ(g, 0, -35.5, 3.2, '#ffd24a', 1.4); break;
    case 'ninja': g.save(); g.beginPath(); g.arc(0, -9, 11.3, 0, TAU); g.clip(); g.fillStyle = hd; g.fillRect(-12, -17.5, 24, 4.6); g.restore(); g.fillStyle = hd; path(() => { g.moveTo(10.5, -15); g.lineTo(18, -18 + Math.sin(t * 9) * 1.5); g.lineTo(16, -13.5); g.lineTo(19.5, -10 + Math.sin(t * 9 + 1) * 1.5); g.lineTo(10, -12.5); g.closePath(); }, hd); g.fillStyle = 'rgba(255,255,255,.65)'; g.fillRect(-2.5, -16.8, 5, 3); break;
    case 'pirate': path(() => { g.moveTo(-14, -13.5); g.quadraticCurveTo(-9, -27, 0, -28); g.quadraticCurveTo(9, -27, 14, -13.5); g.quadraticCurveTo(0, -9.5, -14, -13.5); g.closePath(); }, hc); g.strokeStyle = hd; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-13, -14.8); g.quadraticCurveTo(0, -11.3, 13, -14.8); g.stroke(); circ(g, 0, -20.5, 2.9, '#f1ede0', 1); g.fillStyle = '#15151c'; g.fillRect(-1.6, -21.2, 1, 1.2); g.fillRect(0.6, -21.2, 1, 1.2); break;
    case 'cowboy': g.beginPath(); g.ellipse(0, -14.2, 15.8, 4.2, 0, 0, TAU); g.fillStyle = hc; g.fill(); g.stroke(); path(() => { g.moveTo(-7.4, -14.5); g.lineTo(-6.6, -24); g.quadraticCurveTo(0, -27.5, 6.6, -24); g.lineTo(7.4, -14.5); g.closePath(); }, hc); g.fillStyle = hd; g.fillRect(-7.2, -18.4, 14.4, 3); g.fillStyle = '#ffd24a'; g.fillRect(-1.6, -18.2, 3.2, 2.6); break;
    case 'wizard': g.beginPath(); g.ellipse(0, -14.6, 14.8, 3.8, 0, 0, TAU); g.fillStyle = hc; g.fill(); g.stroke(); path(() => { g.moveTo(-9, -15); g.quadraticCurveTo(-5, -27, 4, -39); g.quadraticCurveTo(7, -29, 9, -15); g.closePath(); }, hc); g.fillStyle = hd; for (const [sx, sy, r] of [[0.5, -24, 2.3], [-3, -19, 1.4], [3.3, -30, 1.3]]) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; g.lineTo(sx + Math.cos(a) * rr2, sy + Math.sin(a) * rr2); } g.closePath(); g.fill(); } break;
    case 'astro': g.beginPath(); g.arc(0, -9, 15, 0, TAU); g.fillStyle = 'rgba(170,215,255,.1)'; g.fill(); g.strokeStyle = 'rgba(210,235,255,.95)'; g.lineWidth = 2; g.stroke(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.beginPath(); g.arc(0, -9, 11.5, Math.PI * 1.15, Math.PI * 1.45); g.stroke(); g.strokeStyle = OL; g.lineWidth = 1.8; g.beginPath(); g.ellipse(0, 4.5, 12, 3.2, 0, 0, TAU); g.fillStyle = '#fff'; g.fill(); g.stroke(); g.fillStyle = hd; g.fillRect(-7, 3.6, 14, 1.8); g.strokeStyle = OL; g.beginPath(); g.moveTo(9, -20); g.lineTo(12, -27); g.stroke(); circ(g, 12, -28, 2.2, '#ff4b45', 1.2); break;
    case 'viking': for (const sx of [-1, 1]) path(() => { g.moveTo(sx * 10, -14); g.quadraticCurveTo(sx * 20, -15, sx * 16.5, -27); g.quadraticCurveTo(sx * 15, -20, sx * 9, -19); g.closePath(); }, hd); helmetShape(g, hc); g.fillStyle = hd; g.fillRect(-11.4, -15.5, 22.8, 2.6); rr(g, -1.3, -15, 2.6, 8, 1); g.fillStyle = hc; g.fill(); g.stroke(); break;
    case 'flame': { const a = Math.sin(t * 9) * 2.2, b = Math.sin(t * 11 + 1) * 2.8; path(() => { g.moveTo(-10.5, -13); g.bezierCurveTo(-14, -22, -8, -24, -7, -31 + a); g.bezierCurveTo(-3, -25, -2, -24, 0, -36 + b); g.bezierCurveTo(2, -25, 4, -25, 7, -31 + a); g.bezierCurveTo(8, -24, 14, -22, 10.5, -13); g.closePath(); }, hc); g.beginPath(); g.moveTo(-6, -14); g.bezierCurveTo(-8, -21, -3, -22, 0, -29 + b * 0.7); g.bezierCurveTo(3, -22, 8, -21, 6, -14); g.closePath(); g.fillStyle = hd; g.fill(); break; }
    case 'crown': path(() => { g.moveTo(-9.5, -15.5); g.lineTo(-11, -28); g.lineTo(-5.2, -22.5); g.lineTo(0, -30.5); g.lineTo(5.2, -22.5); g.lineTo(11, -28); g.lineTo(9.5, -15.5); g.closePath(); }, hc); g.fillStyle = hd; g.fillRect(-9.6, -19.4, 19.2, 3.8); g.strokeRect(-9.6, -19.4, 19.2, 3.8); circ(g, -5, -17.5, 1.2, '#7be08a'); circ(g, 0, -17.5, 1.4, '#4ac8ff'); circ(g, 5, -17.5, 1.2, '#fff'); circ(g, 0, -31.5, 1.8, '#fff', 1); break;
    case 'legend': { helmetShape(g, hc); g.fillStyle = hd; g.beginPath(); g.ellipse(-4.5, -17.5, 3.4, 1.8, -0.5, 0, TAU); g.fill(); g.strokeStyle = OL; g.lineWidth = 1.8; g.beginPath(); g.moveTo(0, -21); g.lineTo(0, -25); g.stroke(); circ(g, 0, -26, 2.8, '#ffffff', 1.4); g.beginPath(); g.ellipse(0, -33, 9.5, 2.8, 0, 0, TAU); g.strokeStyle = '#ffd24a'; g.lineWidth = 2.8; g.stroke(); g.strokeStyle = '#fff6b0'; g.lineWidth = 1; g.stroke(); const k = (Math.sin(t * 5) + 1) / 2; g.fillStyle = `rgba(255,255,255,${0.5 + k * 0.5})`; g.save(); g.translate(11, -26); g.rotate(t * 2); g.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 1.2 : 3.4 + k; g.lineTo(Math.cos(i * Math.PI / 4) * r, Math.sin(i * Math.PI / 4) * r); } g.closePath(); g.fill(); g.restore(); break; }
    default: helmetShape(g, S.main); g.fillStyle = S.light; g.beginPath(); g.ellipse(-4.5, -17.5, 3.4, 1.8, -0.5, 0, TAU); g.fill(); g.strokeStyle = OL; g.lineWidth = 1.8; g.beginPath(); g.moveTo(0, -21); g.lineTo(0, -26); g.stroke(); circ(g, 0, -27, 2.8, '#ff4b45', 1.4);
  }
}
const skinOf = (k) => SKINS[Math.max(0, Math.min(SKINS.length - 1, k | 0))];
/** Nakreslí postavu. cx, cy = střed pole; face 1–4 (nahoru, doprava, dolů, doleva); o.dying 0–1, o.skate = stojí na skateboardu. */
export function drawPlayer(g, skin, cx, cy, ts, face, moving, t, o = {}) {
  const S = skinOf(skin); const s = ts / 40; const dying = o.dying || 0;
  g.save(); g.translate(cx, cy);
  if (dying > 0) { g.globalAlpha = Math.max(0, 1 - dying); g.rotate(dying * 9); g.scale(1 - dying * 0.6, 1 - dying * 0.6); g.translate(0, -dying * ts * 0.4); }
  g.scale(s, s); g.lineJoin = 'round'; g.lineCap = 'round';
  const w = moving ? Math.sin(t * 16) : 0; const bob = moving ? -Math.abs(Math.sin(t * 16)) * 1.8 : Math.sin(t * 3) * 0.4;
  if (dying === 0) ell(g, 0, 17, 11, 3.6, 'rgba(0,0,0,.3)');
  if (o.skate) { g.save(); g.translate(0, 20.5); g.scale(1.25, 1.25); skateBoard(g, 11, false); g.restore(); }
  g.translate(0, bob + (o.skate ? -3.5 : 0));
  ell(g, -5.5, 16 + Math.max(0, w) * -2, 5, 3, '#2a2a38', 1.4); ell(g, 5.5, 16 + Math.max(0, -w) * -2, 5, 3, '#2a2a38', 1.4);   // boty
  rr(g, -9, 0, 18, 15, 6); g.fillStyle = S.main; g.fill(); g.strokeStyle = OL; g.lineWidth = 1.8; g.stroke(); g.fillStyle = S.dark; g.fillRect(-9, 8, 18, 3); rr(g, -2.5, 7.4, 5, 4.2, 1); g.fillStyle = '#ffd24a'; g.fill();
  circ(g, -11.5, 6 + w * 2, 3.4, '#fff', 1.4); circ(g, 11.5, 6 - w * 2, 3.4, '#fff', 1.4);   // rukavice
  headBase(g, S, face); faceDraw(g, S, face); hatDraw(g, S, face, t);
  if (o.curse) { g.save(); g.translate(0, -37 + Math.sin(t * 6) * 1.5); skullIcon(g, 6); g.restore(); }
  if (o.you) { g.fillStyle = '#fff'; g.strokeStyle = OL; g.lineWidth = 1.4; g.beginPath(); const yy = -41 - Math.abs(Math.sin(t * 4)) * 3; g.moveTo(-4.5, yy - 5); g.lineTo(4.5, yy - 5); g.lineTo(0, yy); g.closePath(); g.fill(); g.stroke(); }
  g.restore();
}
const portraits = new Map();
export function portraitURL(skin) {
  skin = Math.max(0, Math.min(SKINS.length - 1, skin | 0)); let u = portraits.get(skin); if (u) return u;
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'); const S = SKINS[skin];
  g.translate(48, 62); g.scale(2.1, 2.1); g.lineJoin = 'round'; g.lineCap = 'round';
  rr(g, -9, 0, 18, 15, 6); g.fillStyle = S.main; g.fill(); g.strokeStyle = OL; g.lineWidth = 1.8; g.stroke();
  headBase(g, S, 3); faceDraw(g, S, 3); hatDraw(g, S, 3, 0.5);
  u = c.toDataURL('image/png'); portraits.set(skin, u); return u;
}
const iconCache = new Map();
export function itemURL(type) {
  let u = iconCache.get(type); if (u) return u;
  const c = document.createElement('canvas'); c.width = c.height = 80; const g = c.getContext('2d'); g.lineJoin = 'round';
  const col = ITEM_COL[type]; rr(g, 6, 6, 68, 68, 16); const gr = g.createLinearGradient(0, 6, 0, 74); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]); g.fillStyle = gr; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.stroke();
  g.translate(40, 40); drawItemIcon(g, type, 26); u = c.toDataURL('image/png'); iconCache.set(type, u); return u;
}
// náhled mapy: kameny a místa pro pařezy podle vzoru čtvrtiny, v barvách prostředí
const thumbs = new Map();
export function mapThumb(i) {
  let u = thumbs.get(i); if (u) return u; const m = MAPS[i]; const th = thOf(m.theme); const cs = 10;
  const c = document.createElement('canvas'); c.width = COLS * cs; c.height = ROWS * cs; const g = c.getContext('2d'); g.fillStyle = th.bg; g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = m.q[Math.min(y, ROWS - 1 - y)][Math.min(x, COLS - 1 - x)]; const edge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1; if (edge) continue;
    g.fillStyle = (x + y) % 2 ? th.a : th.b; g.fillRect(x * cs, y * cs, cs, cs);
    if (ch === '#') { g.fillStyle = th.stone[1]; g.fillRect(x * cs + 1, y * cs + 1, cs - 2, cs - 2); g.fillStyle = th.stone[0]; g.fillRect(x * cs + 1, y * cs + 1, cs - 2, 3); }
    else if (ch === '.') { g.globalAlpha = 0.55; g.fillStyle = m.theme === 'snow' ? '#7fc8ee' : m.theme === 'cave' ? '#a070e0' : m.theme === 'lava' ? '#ff8a2a' : '#a8692f'; g.fillRect(x * cs + 2, y * cs + 2, cs - 4, cs - 4); g.globalAlpha = 1; }
  }
  u = c.toDataURL('image/png'); thumbs.set(i, u); return u;
}
