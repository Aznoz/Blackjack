// BOMBIC – kreslená grafika (bez emoji a bez obrázků): travnatá podlaha, kameny, rozbitné sudy (pařezy), stromy na okraji, bomby, plameny,
// předměty a malí bombeři ve čtyřech barvách. Všechno se kreslí vektorově na canvas, takže je ostré na každém displeji.
import { SKINS, T } from './shared.js';
const TAU = Math.PI * 2;
const OL = '#26180f';
const hash = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function circ(g, x, y, r, fill, lw = 0, stroke = OL) { g.beginPath(); g.arc(x, y, r, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
function ell(g, x, y, rx, ry, fill, lw = 0, stroke = OL) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }

// ------------------------------------------------------------------ terén
export function drawFloor(g, x, y, ts, gx, gy) {
  g.fillStyle = (gx + gy) % 2 ? '#52a246' : '#4c9a41'; g.fillRect(x, y, ts, ts);
  g.strokeStyle = 'rgba(30,90,30,.45)'; g.lineWidth = Math.max(1, ts * 0.04); g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {   // stébla trávy
    const px = x + ts * (0.15 + 0.7 * hash(gx, gy, i)), py = y + ts * (0.2 + 0.7 * hash(gx, gy, i + 7)); g.beginPath(); g.moveTo(px, py); g.lineTo(px - ts * 0.04, py - ts * 0.1); g.moveTo(px, py); g.lineTo(px + ts * 0.05, py - ts * 0.09); g.stroke();
  }
  if (hash(gx, gy, 3) < 0.12) { circ(g, x + ts * (0.2 + 0.6 * hash(gx, gy, 4)), y + ts * (0.2 + 0.6 * hash(gx, gy, 5)), ts * 0.045, '#f7e86b'); }   // kopretiny
}
export function drawStone(g, x, y, ts, gx, gy) {
  const cx = x + ts / 2, cy = y + ts * 0.54;
  ell(g, cx, y + ts * 0.88, ts * 0.42, ts * 0.12, 'rgba(0,0,0,.25)');
  g.beginPath(); g.moveTo(x + ts * 0.1, y + ts * 0.82); g.quadraticCurveTo(x + ts * 0.02, y + ts * 0.45, x + ts * 0.26, y + ts * 0.2); g.quadraticCurveTo(x + ts * 0.5, y + ts * 0.04, x + ts * 0.76, y + ts * 0.2); g.quadraticCurveTo(x + ts * 0.98, y + ts * 0.42, x + ts * 0.9, y + ts * 0.82); g.closePath();
  const gr = g.createLinearGradient(x, y, x + ts, y + ts); gr.addColorStop(0, '#b8bec6'); gr.addColorStop(0.6, '#8c939d'); gr.addColorStop(1, '#6b727c'); g.fillStyle = gr; g.fill(); g.strokeStyle = '#444a52'; g.lineWidth = Math.max(1.5, ts * 0.05); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = Math.max(1, ts * 0.04); g.beginPath(); g.moveTo(x + ts * 0.26, y + ts * 0.34); g.quadraticCurveTo(x + ts * 0.4, y + ts * 0.18, x + ts * 0.6, y + ts * 0.2); g.stroke();
  g.strokeStyle = 'rgba(40,45,52,.5)'; g.beginPath(); g.moveTo(x + ts * (0.45 + 0.2 * hash(gx, gy)), y + ts * 0.45); g.lineTo(x + ts * 0.55, y + ts * 0.6); g.lineTo(x + ts * 0.5, y + ts * 0.75); g.stroke();
}
export function drawTree(g, x, y, ts, gx, gy) {
  g.fillStyle = '#1b4a22'; g.fillRect(x, y, ts, ts);
  const cx = x + ts / 2, cy = y + ts / 2; const j = hash(gx, gy);
  ell(g, cx, y + ts * 0.9, ts * 0.4, ts * 0.1, 'rgba(0,0,0,.3)');
  g.fillStyle = '#5a3a1c'; g.fillRect(cx - ts * 0.08, cy + ts * 0.15, ts * 0.16, ts * 0.32);
  circ(g, cx - ts * 0.18, cy + ts * 0.02, ts * 0.27, '#2b7a35', Math.max(1, ts * 0.03), '#14381a'); circ(g, cx + ts * 0.2, cy + ts * 0.05, ts * 0.26, '#2f8a3a', Math.max(1, ts * 0.03), '#14381a');
  circ(g, cx, cy - ts * 0.16, ts * 0.3, j < 0.5 ? '#3a9a45' : '#36923f', Math.max(1, ts * 0.03), '#14381a'); circ(g, cx - ts * 0.08, cy - ts * 0.22, ts * 0.1, 'rgba(255,255,255,.18)');
}
export function drawStump(g, x, y, ts, gx, gy, pop = 0) {   // rozbitný sud
  const cx = x + ts / 2; const k = 1 + pop * 0.1;
  ell(g, cx, y + ts * 0.9, ts * 0.38, ts * 0.1, 'rgba(0,0,0,.28)');
  g.save(); g.translate(cx, y + ts * 0.52); g.scale(k, k);
  const w = ts * 0.74, h = ts * 0.74;
  g.beginPath(); g.moveTo(-w * 0.42, -h * 0.34); g.quadraticCurveTo(-w * 0.56, 0, -w * 0.42, h * 0.38); g.lineTo(w * 0.42, h * 0.38); g.quadraticCurveTo(w * 0.56, 0, w * 0.42, -h * 0.34); g.closePath();
  const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0); gr.addColorStop(0, '#6e4320'); gr.addColorStop(0.45, '#a8692f'); gr.addColorStop(1, '#6a3f1c'); g.fillStyle = gr; g.fill(); g.strokeStyle = OL; g.lineWidth = Math.max(1.5, ts * 0.05); g.stroke();
  g.strokeStyle = 'rgba(40,20,5,.5)'; g.lineWidth = Math.max(1, ts * 0.03); for (const f of [-0.2, 0.05, 0.28]) { g.beginPath(); g.moveTo(w * f, -h * 0.32); g.lineTo(w * f * 1.05, h * 0.36); g.stroke(); }
  for (const yy of [-0.17, 0.2]) { g.fillStyle = '#5a5f69'; g.fillRect(-w * 0.5, h * yy - ts * 0.03, w, ts * 0.07); g.strokeStyle = '#2b2e34'; g.lineWidth = 1; g.strokeRect(-w * 0.5, h * yy - ts * 0.03, w, ts * 0.07); }
  ell(g, 0, -h * 0.34, w * 0.42, h * 0.13, '#c58a4a', Math.max(1.5, ts * 0.045)); ell(g, 0, -h * 0.34, w * 0.28, h * 0.075, '#8f5a28');
  g.restore();
}
export function drawTile(g, t, x, y, ts, gx, gy, border) {
  if (border) return drawTree(g, x, y, ts, gx, gy);
  drawFloor(g, x, y, ts, gx, gy);
  if (t === T.STONE) drawStone(g, x, y, ts, gx, gy); else if (t === T.STUMP) drawStump(g, x, y, ts, gx, gy);
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
const ITEM_COL = { bomb: ['#5b7bff', '#2438a8'], fire: ['#ff8a3a', '#c2330f'], speed: ['#4cd070', '#17803a'], kick: ['#b36cff', '#6a2cb8'], skull: ['#7b7f8c', '#2e3038'] };
export function drawItemIcon(g, type, s) {   // ikona předmětu uvnitř odznaku, střed (0,0), polovina šířky s
  if (type === 'bomb') { circ(g, 0, s * 0.1, s * 0.5, '#111319', Math.max(1, s * 0.08), '#000'); circ(g, -s * 0.18, -s * 0.08, s * 0.14, 'rgba(255,255,255,.6)'); g.strokeStyle = '#e9d9ac'; g.lineWidth = Math.max(1.5, s * 0.12); g.lineCap = 'round'; g.beginPath(); g.moveTo(s * 0.2, -s * 0.34); g.quadraticCurveTo(s * 0.45, -s * 0.7, s * 0.65, -s * 0.5); g.stroke(); circ(g, s * 0.66, -s * 0.5, s * 0.15, '#ffd24a'); g.fillStyle = '#fff'; g.font = `900 ${s * 0.7}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+', s * 0.55, s * 0.45); }
  else if (type === 'fire') { g.beginPath(); g.moveTo(0, -s * 0.85); g.bezierCurveTo(s * 0.5, -s * 0.35, s * 0.8, s * 0.1, s * 0.55, s * 0.5); g.bezierCurveTo(s * 0.35, s * 0.85, -s * 0.35, s * 0.85, -s * 0.55, s * 0.5); g.bezierCurveTo(-s * 0.8, s * 0.1, -s * 0.3, -s * 0.3, 0, -s * 0.85); g.fillStyle = '#fff2a8'; g.fill(); g.strokeStyle = '#7a2208'; g.lineWidth = Math.max(1, s * 0.1); g.stroke(); g.beginPath(); g.moveTo(0, -s * 0.2); g.bezierCurveTo(s * 0.3, s * 0.1, s * 0.3, s * 0.5, 0, s * 0.55); g.bezierCurveTo(-s * 0.3, s * 0.5, -s * 0.3, s * 0.1, 0, -s * 0.2); g.fillStyle = '#ff9a2a'; g.fill(); }
  else if (type === 'speed') { g.beginPath(); g.moveTo(s * 0.15, -s * 0.9); g.lineTo(-s * 0.6, s * 0.1); g.lineTo(-s * 0.05, s * 0.1); g.lineTo(-s * 0.2, s * 0.9); g.lineTo(s * 0.62, -s * 0.2); g.lineTo(s * 0.08, -s * 0.2); g.closePath(); g.fillStyle = '#fff6a8'; g.fill(); g.strokeStyle = '#7a5a00'; g.lineWidth = Math.max(1, s * 0.1); g.lineJoin = 'round'; g.stroke(); }
  else if (type === 'kick') { g.beginPath(); g.moveTo(-s * 0.7, s * 0.55); g.lineTo(-s * 0.7, -s * 0.1); g.quadraticCurveTo(-s * 0.7, -s * 0.5, -s * 0.35, -s * 0.5); g.lineTo(-s * 0.05, -s * 0.5); g.lineTo(s * 0.1, -s * 0.05); g.quadraticCurveTo(s * 0.7, 0, s * 0.72, s * 0.3); g.lineTo(s * 0.72, s * 0.55); g.closePath(); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#3d1a6a'; g.lineWidth = Math.max(1, s * 0.1); g.lineJoin = 'round'; g.stroke(); g.fillStyle = '#7a3fd0'; g.fillRect(-s * 0.7, s * 0.4, s * 1.42, s * 0.15); }
  else if (type === 'skull') { g.save(); g.translate(0, s * 0.05); skullIcon(g, s * 0.72); g.restore(); }
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

// ------------------------------------------------------------------ bombeři
/** Nakreslí postavu. cx, cy = střed pole; face 1–4 (nahoru, doprava, dolů, doleva); dying 0–1 (průběh zániku). */
export function drawPlayer(g, skin, cx, cy, ts, face, moving, t, o = {}) {
  const S = SKINS[skin % 4]; const s = ts / 40; const dying = o.dying || 0;
  g.save(); g.translate(cx, cy);
  if (dying > 0) { g.globalAlpha = Math.max(0, 1 - dying); g.rotate(dying * 9); g.scale(1 - dying * 0.6, 1 - dying * 0.6); g.translate(0, -dying * ts * 0.4); }
  g.scale(s, s); g.lineJoin = 'round'; g.lineCap = 'round';
  const w = moving ? Math.sin(t * 16) : 0; const bob = moving ? -Math.abs(Math.sin(t * 16)) * 1.8 : Math.sin(t * 3) * 0.4;
  if (dying === 0) ell(g, 0, 17, 11, 3.6, 'rgba(0,0,0,.3)');
  g.translate(0, bob);
  ell(g, -5.5, 16 + Math.max(0, w) * -2, 5, 3, '#2a2a38', 1.4); ell(g, 5.5, 16 + Math.max(0, -w) * -2, 5, 3, '#2a2a38', 1.4);   // boty
  rr(g, -9, 0, 18, 15, 6); g.fillStyle = S.main; g.fill(); g.strokeStyle = OL; g.lineWidth = 1.8; g.stroke(); g.fillStyle = S.dark; g.fillRect(-9, 8, 18, 3); rr(g, -2.5, 7.4, 5, 4.2, 1); g.fillStyle = '#ffd24a'; g.fill();
  circ(g, -11.5, 6 + w * 2, 3.4, '#fff', 1.4); circ(g, 11.5, 6 - w * 2, 3.4, '#fff', 1.4);   // rukavice
  circ(g, 0, -9, 11.5, '#ffe3c4', 1.8);
  // přilba
  g.beginPath(); g.arc(0, -10, 11.8, Math.PI * 1.04, Math.PI * 1.96); g.quadraticCurveTo(0, -12.5, -11.4, -9); g.closePath(); g.fillStyle = S.main; g.fill(); g.strokeStyle = OL; g.lineWidth = 1.8; g.stroke();
  g.fillStyle = S.light; g.beginPath(); g.ellipse(-4.5, -17.5, 3.4, 1.8, -0.5, 0, TAU); g.fill();
  g.strokeStyle = OL; g.lineWidth = 1.8; g.beginPath(); g.moveTo(0, -21); g.lineTo(0, -26); g.stroke(); circ(g, 0, -27, 2.8, '#ff4b45', 1.4);
  const ex = face === 4 ? -3 : face === 2 ? 3 : 0;
  if (face !== 1) {
    for (const sx of face === 3 ? [-4.2, 4.2] : [ex - 3.4 + (face === 2 ? 1 : 0), ex + 3.4 + (face === 4 ? -1 : 0)]) { ell(g, sx + (face === 3 ? 0 : 0), -7.8, 2.4, 3.2, '#fff', 1.2); circ(g, sx + ex * 0.35, -7.4, 1.5, '#1a1426'); }
    g.strokeStyle = '#8a4a2a'; g.lineWidth = 1.2; g.beginPath(); g.arc(ex * 0.6, -3, 2.4, 0.2, Math.PI - 0.2); g.stroke();
  } else { g.fillStyle = S.dark; g.beginPath(); g.ellipse(0, -6, 7, 4.5, 0, 0, Math.PI); g.fill(); }
  if (o.curse) { g.save(); g.translate(0, -35 + Math.sin(t * 6) * 1.5); skullIcon(g, 6); g.restore(); }
  if (o.you) { g.fillStyle = '#fff'; g.strokeStyle = OL; g.lineWidth = 1.4; g.beginPath(); const yy = -38 - Math.abs(Math.sin(t * 4)) * 3; g.moveTo(-4.5, yy - 5); g.lineTo(4.5, yy - 5); g.lineTo(0, yy); g.closePath(); g.fill(); g.stroke(); }
  g.restore();
}
const portraits = new Map();
export function portraitURL(skin) {
  let u = portraits.get(skin); if (u) return u;
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'); const S = SKINS[skin % 4];
  g.translate(48, 56); g.scale(2.6, 2.6); g.lineJoin = 'round'; g.lineCap = 'round';
  circ(g, 0, -9, 11.5, '#ffe3c4', 1.8);
  g.beginPath(); g.arc(0, -10, 11.8, Math.PI * 1.04, Math.PI * 1.96); g.quadraticCurveTo(0, -12.5, -11.4, -9); g.closePath(); g.fillStyle = S.main; g.fill(); g.strokeStyle = OL; g.lineWidth = 1.8; g.stroke();
  g.fillStyle = S.light; g.beginPath(); g.ellipse(-4.5, -17.5, 3.4, 1.8, -0.5, 0, TAU); g.fill();
  g.strokeStyle = OL; g.beginPath(); g.moveTo(0, -21); g.lineTo(0, -25); g.stroke(); circ(g, 0, -26, 2.8, '#ff4b45', 1.4);
  for (const sx of [-4.2, 4.2]) { ell(g, sx, -7.8, 2.4, 3.2, '#fff', 1.2); circ(g, sx, -7.4, 1.5, '#1a1426'); }
  g.strokeStyle = '#8a4a2a'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, -3, 2.4, 0.2, Math.PI - 0.2); g.stroke();
  u = c.toDataURL('image/png'); portraits.set(skin, u); return u;
}
const iconCache = new Map();
export function itemURL(type) {
  let u = iconCache.get(type); if (u) return u;
  const c = document.createElement('canvas'); c.width = c.height = 80; const g = c.getContext('2d'); g.lineJoin = 'round';
  const col = ITEM_COL[type]; rr(g, 6, 6, 68, 68, 16); const gr = g.createLinearGradient(0, 6, 0, 74); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]); g.fillStyle = gr; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.stroke();
  g.translate(40, 40); drawItemIcon(g, type, 26); u = c.toDataURL('image/png'); iconCache.set(type, u); return u;
}
