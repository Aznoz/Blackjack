// HOPÍK – kreslení kosmetiky z obchodu: čepice, brýle, boty, záda (převzato z Bombicu). Vše se kreslí v pixelových souřadnicích postavy (hlava ve (0,-9) o poloměru 11,5,
// tělo (-9..9, 0..15), nohy kolem y 16); art.js to volá z drawAnimal. Kategorie viz COSM v shared.js.
const TAU = Math.PI * 2;
const OL = '#26180f';
function circ(g, x, y, r, fill, lw = 0, stroke = OL) { g.beginPath(); g.arc(x, y, r, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
function ell(g, x, y, rx, ry, fill, lw = 0, stroke = OL, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
function rr(g, x, y, w, h, r, fill, lw = 0, stroke = OL) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
function path(g, fn, fill, lw = 1.6, stroke = OL) { g.beginPath(); fn(); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
function line(g, x1, y1, x2, y2, col, lw) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
function star(g, x, y, r, fill, lw = 1.4) { path(g, () => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); }, fill, lw); }
function heart(g, x, y, s, fill, lw = 1.4) { path(g, () => { g.moveTo(x, y + s * 0.9); g.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.9, y - s * 1.1, x, y - s * 0.4); g.bezierCurveTo(x + s * 0.9, y - s * 1.1, x + s * 1.5, y - s * 0.1, x, y + s * 0.9); g.closePath(); }, fill, lw); }
const setup = (g) => { g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 1.6; g.strokeStyle = OL; };

// ------------------------------------------------------------------ čepice (nahrazují čepici skinu)
export function hatC(g, id, face, t) {
  g.save(); setup(g); const sx = face === 4 ? -2 : face === 2 ? 2 : 0; g.translate(sx * 0.5, 0);
  switch (id) {
    case 'beanie':
      path(g, () => { g.moveTo(-11.5, -13); g.quadraticCurveTo(-12.5, -27, 0, -27); g.quadraticCurveTo(12.5, -27, 11.5, -13); g.closePath(); }, '#e5483f');
      g.strokeStyle = 'rgba(120,20,15,.45)'; g.lineWidth = 1; for (const x of [-6, -2, 2, 6]) { g.beginPath(); g.moveTo(x, -25); g.lineTo(x * 1.1, -17); g.stroke(); }
      setup(g); rr(g, -12.4, -17, 24.8, 5.4, 2.4, '#f4f1ea', 1.6); g.strokeStyle = 'rgba(160,150,130,.6)'; g.lineWidth = 1; for (const x of [-8, -4, 0, 4, 8]) { g.beginPath(); g.moveTo(x, -16.4); g.lineTo(x, -12.6); g.stroke(); }
      setup(g); circ(g, 0, -28, 3.6, '#f4f1ea', 1.5); break;
    case 'backcap': {
      path(g, () => { g.arc(0, -10, 11.8, Math.PI * 1.04, Math.PI * 1.96); g.quadraticCurveTo(0, -12.5, -11.4, -9); g.closePath(); }, '#3f8cf0');
      if (face === 1) ell(g, 0, -12.3, 9.5, 3.2, '#1f4fa8', 1.6); else if (face === 2) ell(g, -10.5, -13.4, 5.5, 2.2, '#1f4fa8', 1.6, OL, -0.1); else if (face === 4) ell(g, 10.5, -13.4, 5.5, 2.2, '#1f4fa8', 1.6, OL, 0.1);
      circ(g, 0, -21.4, 1.7, '#1f4fa8', 1.2); if (face === 3) circ(g, 0, -16.6, 2.4, '#fff', 1.2); break; }
    case 'beret':
      ell(g, 0, -15.5, 11.8, 3.2, '#7e1409', 1.6); ell(g, 1.5, -19.6, 13, 6.2, '#c2332d', 1.8, OL, -0.12); g.strokeStyle = 'rgba(255,170,160,.45)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(-1, -20.8, 6, 2, -0.12, Math.PI, TAU); g.stroke(); setup(g); rr(g, 0.3, -27.4, 2.6, 4.4, 1, '#7e1409', 1.3); break;
    case 'straw':
      ell(g, 0, -14.6, 16.5, 4.4, '#f0d27a', 1.8); path(g, () => { g.moveTo(-8, -14.6); g.quadraticCurveTo(-8.4, -26, 0, -26); g.quadraticCurveTo(8.4, -26, 8, -14.6); g.closePath(); }, '#f6e08e');
      g.fillStyle = '#d4382a'; g.fillRect(-8, -19, 16, 3.4); g.strokeStyle = OL; g.lineWidth = 1; g.strokeRect(-8, -19, 16, 3.4); g.strokeStyle = 'rgba(160,120,40,.55)'; g.lineWidth = 1; for (const x of [-12, -7, 7, 12]) { g.beginPath(); g.moveTo(x, -14.6 + (Math.abs(x) > 9 ? 0.4 : -0.5)); g.lineTo(x * 0.9, -16.2); g.stroke(); } break;
    case 'hardhat':
      path(g, () => { g.arc(0, -10, 11.8, Math.PI * 1.04, Math.PI * 1.96); g.quadraticCurveTo(0, -12.5, -11.4, -9); g.closePath(); }, '#ffc42e'); rr(g, -2.2, -22.4, 4.4, 9.6, 1.2, '#e6a516', 1.4); rr(g, -13, -15.6, 26, 3.6, 1.6, '#ffc42e', 1.6);
      if (face === 3) { circ(g, 0, -18, 2, '#fff7c8', 1.2); } g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-6, -18, 2.6, 1.3, -0.6, 0, TAU); g.fill(); break;
    case 'sombrero':
      ell(g, 0, -16, 21, 5, '#e8c36a', 1.8); g.strokeStyle = '#d4382a'; g.lineWidth = 1.8; g.setLineDash([3, 3]); g.beginPath(); g.ellipse(0, -16, 19.4, 4.1, 0, 0, TAU); g.stroke(); g.setLineDash([]); setup(g);
      path(g, () => { g.moveTo(-8.6, -16); g.quadraticCurveTo(-8, -27, -2.5, -31); g.quadraticCurveTo(0, -32.5, 2.5, -31); g.quadraticCurveTo(8, -27, 8.6, -16); g.closePath(); }, '#f0d27a'); g.fillStyle = '#d4382a'; g.fillRect(-8.4, -21, 16.8, 3.6); g.strokeStyle = OL; g.lineWidth = 1; g.strokeRect(-8.4, -21, 16.8, 3.6); circ(g, 0, -19.2, 1.3, '#ffd24a'); break;
    case 'cat':
      for (const s of [-1, 1]) { path(g, () => { g.moveTo(s * 10.5, -15); g.lineTo(s * 10.2, -29); g.lineTo(s * 2.8, -20.4); g.closePath(); }, '#2b2d3a'); path(g, () => { g.moveTo(s * 8.7, -18.4); g.lineTo(s * 8.7, -25.6); g.lineTo(s * 4.6, -20.4); g.closePath(); }, '#ff9ac4', 0); }
      g.strokeStyle = OL; g.lineWidth = 3.4; g.beginPath(); g.arc(0, -10, 11.2, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.strokeStyle = '#2b2d3a'; g.lineWidth = 1.8; g.stroke(); break;
    case 'bunny': {
      const fl = Math.sin(t * 3) * 0.05;
      for (const s of [-1, 1]) { g.save(); g.translate(s * 5, -20); g.rotate(s * (0.2 + fl)); ell(g, 0, -9, 3.8, 10, '#f4f1ea', 1.6); ell(g, 0, -8.6, 1.8, 7.4, '#ff9ac4'); g.restore(); }
      g.strokeStyle = OL; g.lineWidth = 3.4; g.beginPath(); g.arc(0, -10, 11.2, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.strokeStyle = '#f4f1ea'; g.lineWidth = 1.8; g.stroke(); break; }
    case 'tophat':
      ell(g, 0, -15.2, 13, 3.4, '#26262e', 1.8); rr(g, -8.4, -31, 16.8, 16.4, 1.8, '#26262e', 1.8); g.fillStyle = '#e5483f'; g.fillRect(-8.4, -20.6, 16.8, 4); g.strokeStyle = OL; g.lineWidth = 1.2; g.strokeRect(-8.4, -20.6, 16.8, 4); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(-6, -29.5, 2.4, 8.6); break;
    case 'propeller': {
      path(g, () => { g.arc(0, -10, 11.8, Math.PI * 1.04, Math.PI * 1.96); g.quadraticCurveTo(0, -12.5, -11.4, -9); g.closePath(); }, '#4ac8ff');
      g.save(); g.beginPath(); g.arc(0, -10, 11.4, Math.PI, TAU); g.clip(); g.fillStyle = '#ff5fa8'; g.fillRect(-12, -24, 8, 14); g.fillStyle = '#ffd24a'; g.fillRect(4, -24, 8, 14); g.restore();
      setup(g); path(g, () => { g.arc(0, -10, 11.8, Math.PI * 1.04, Math.PI * 1.96); }, null); line(g, 0, -21.4, 0, -25.4, OL, 2.4); circ(g, 0, -21.4, 1.2, OL);
      g.save(); g.translate(0, -26.4); g.scale(1, 0.36); g.rotate(t * 16); ell(g, 6.2, 0, 6, 2.2, '#ff5fa8', 1.5); ell(g, -6.2, 0, 6, 2.2, '#ffd24a', 1.5); g.restore(); circ(g, 0, -26.4, 1.6, '#e5483f', 1.2); break; }
    case 'horns':
      for (const s of [-1, 1]) { path(g, () => { g.moveTo(s * 9, -15.5); g.quadraticCurveTo(s * 15.5, -19, s * 12.2, -30); g.quadraticCurveTo(s * 8.6, -23.5, s * 4.6, -19.6); g.closePath(); }, '#e5483f'); path(g, () => { g.moveTo(s * 10.2, -18.2); g.quadraticCurveTo(s * 13, -21, s * 11.8, -26); }, null, 1.4, '#ff9d8a'); }
      break;
    case 'halo': {
      const y = -29 + Math.sin(t * 3) * 1.2; g.strokeStyle = 'rgba(255,230,120,.35)'; g.lineWidth = 6; g.beginPath(); g.ellipse(0, y, 9, 2.9, 0, 0, TAU); g.stroke();
      g.strokeStyle = OL; g.lineWidth = 4.4; g.beginPath(); g.ellipse(0, y, 9, 2.9, 0, 0, TAU); g.stroke(); g.strokeStyle = '#ffd84a'; g.lineWidth = 2.6; g.stroke(); g.strokeStyle = '#fff7c8'; g.lineWidth = 0.9; g.beginPath(); g.ellipse(0, y - 0.3, 8.6, 2.5, 0, Math.PI * 1.1, Math.PI * 1.7); g.stroke(); break; }
    default:
  }
  g.restore();
}

// ------------------------------------------------------------------ brýle
const eyesX = (face) => { const ex = face === 4 ? -3 : face === 2 ? 3 : 0; return face === 3 ? [-4.2, 4.2] : [ex - 3.4 + (face === 2 ? 1 : 0), ex + 3.4 + (face === 4 ? -1 : 0)]; };
export function glassesC(g, id, face, t) {
  g.save(); setup(g); const Y = -7.8; const [a, b] = eyesX(face); const sx = face === 4 ? -2.6 : face === 2 ? 2.6 : 0;
  if (face === 1) {   // zezadu je vidět jen pásek
    if (id === 'goggles') { rr(g, -11.8, Y - 2.4, 23.6, 4.8, 2, '#2b2d3a', 1.4); }
    else if (id === 'visor') { rr(g, -11.6, Y - 3.2, 23.2, 6.4, 3, '#1f6f8f', 1.4); }
    else if (id === 'eyepatch') { line(g, -11.2, Y - 3, 11.2, Y - 7, OL, 1.6); }
    else if (id === 'mask') { rr(g, -11.8, Y - 3.4, 23.6, 6.4, 3, '#2b2d3a', 1.4); }
    g.restore(); return;
  }
  const temples = () => { if (face === 3) { line(g, a - 4.2, Y - 0.6, -11.3, Y - 1.4, OL, 1.4); line(g, b + 4.2, Y - 0.6, 11.3, Y - 1.4, OL, 1.4); } };
  switch (id) {
    case 'round': temples(); for (const x of [a, b]) circ(g, x, Y, 4.3, 'rgba(190,225,255,.4)', 1.7); line(g, a + 4.3, Y, b - 4.3, Y, OL, 1.5); g.fillStyle = 'rgba(255,255,255,.75)'; for (const x of [a, b]) { g.beginPath(); g.ellipse(x - 1.4, Y - 1.5, 1.2, 0.7, -0.6, 0, TAU); g.fill(); } break;
    case 'nerd': temples(); for (const x of [a, b]) rr(g, x - 4.4, Y - 3.8, 8.8, 7.4, 1.8, 'rgba(235,245,255,.55)', 2.3); line(g, a + 4.4, Y - 1, b - 4.4, Y - 1, OL, 2); rr(g, (a + b) / 2 - 1.3, Y - 2.4, 2.6, 2.6, 0.6, '#f4f1ea', 0.9); break;
    case 'shades': temples(); for (const x of [a, b]) path(g, () => { g.moveTo(x - 4.8, Y - 3.4); g.lineTo(x + 4.8, Y - 3.4); g.lineTo(x + 4, Y + 2.4); g.quadraticCurveTo(x, Y + 5, x - 4, Y + 2.4); g.closePath(); }, '#15151c', 1.6); line(g, a + 4.6, Y - 2.6, b - 4.6, Y - 2.6, OL, 2); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.1; for (const x of [a, b]) { g.beginPath(); g.moveTo(x - 3.2, Y - 1.8); g.lineTo(x - 1, Y - 1.8 + 0.1); g.lineTo(x - 2.2, Y + 0.6); g.stroke(); } break;
    case 'eyepatch': { line(g, a, Y, -11.4, -14.4, OL, 1.8); line(g, a, Y, 11.4, -12.6, OL, 1.8); ell(g, a, Y, 4.3, 4.6, '#15151c', 1.4); g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.beginPath(); g.arc(a, Y, 2.4, 3.6, 5.2); g.stroke(); break; }
    case 'd3': { const x0 = a - 5.3, x1 = b + 5.3; rr(g, x0, Y - 4.4, x1 - x0, 8.8, 2, '#f4f1ea', 1.6); rr(g, a - 3.8, Y - 2.8, 7.6, 5.6, 1, '#e5483f', 1); rr(g, b - 3.8, Y - 2.8, 7.6, 5.6, 1, '#2fc4f0', 1); temples(); break; }
    case 'aviator': temples(); for (const x of [a, b]) path(g, () => { g.moveTo(x - 5, Y - 3.6); g.quadraticCurveTo(x, Y - 4.8, x + 5, Y - 3.6); g.quadraticCurveTo(x + 5.4, Y + 4.4, x, Y + 5); g.quadraticCurveTo(x - 5.4, Y + 4.4, x - 5, Y - 3.6); g.closePath(); }, 'rgba(255,150,50,.5)', 1.8, '#c9921a'); line(g, a + 4.6, Y - 2.8, b - 4.6, Y - 2.8, '#c9921a', 1.5); g.fillStyle = 'rgba(255,255,255,.7)'; for (const x of [a, b]) { g.beginPath(); g.ellipse(x - 1.8, Y - 1.4, 1.1, 1.8, -0.5, 0, TAU); g.fill(); } break;
    case 'mask': {
      g.beginPath(); g.moveTo(-11.8 + sx, Y - 3.6); g.quadraticCurveTo(sx, Y - 6.6, 11.8 + sx, Y - 3.6); g.lineTo(11.4 + sx, Y + 2.2); g.quadraticCurveTo(7 + sx, Y + 5, 2 + sx, Y + 2.2); g.lineTo(-2 + sx, Y + 2.2); g.quadraticCurveTo(-7 + sx, Y + 5, -11.4 + sx, Y + 2.2); g.closePath();
      for (const x of [a, b]) { g.moveTo(x + 3.6, Y); g.ellipse(x, Y, 3.6, 3.8, 0, 0, TAU); }
      g.fillStyle = '#2b2d3a'; g.fill('evenodd'); g.stroke(); for (const x of [a, b]) { g.beginPath(); g.ellipse(x, Y, 3.6, 3.8, 0, 0, TAU); g.strokeStyle = OL; g.lineWidth = 1.2; g.stroke(); } break; }
    case 'heart': temples(); for (const x of [a, b]) { heart(g, x, Y + 0.4, 3.9, '#ff4b6e'); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(x - 1.7, Y - 1.4, 1, 0.7, -0.6, 0, TAU); g.fill(); } line(g, a + 3.6, Y - 1.4, b - 3.6, Y - 1.4, OL, 1.5); break;
    case 'star': temples(); for (const x of [a, b]) star(g, x, Y + 0.3, 5.6, '#ffd24a', 1.5); line(g, a + 4, Y - 1.2, b - 4, Y - 1.2, OL, 1.5); break;
    case 'monocle': { circ(g, b, Y, 4.8, 'rgba(200,230,255,.3)', 1.9, '#c9921a'); g.strokeStyle = '#c9921a'; g.lineWidth = 1; g.beginPath(); g.moveTo(b + 1, Y + 4.7); g.quadraticCurveTo(b + 4, Y + 11, b + 1, Y + 18); g.stroke(); g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(b - 1.6, Y - 1.8, 1.2, 0.8, -0.6, 0, TAU); g.fill(); break; }
    case 'goggles': {
      rr(g, -11.8, Y - 2.4, 23.6, 4.8, 2, '#2b2d3a', 1.4);
      for (const x of [a, b]) { circ(g, x, Y, 5.1, '#2b2d3a', 0); circ(g, x, Y, 4.1, '#ff9a2a', 1.2); circ(g, x, Y, 2.6, '#ffd24a'); g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(x - 1.4, Y - 1.4, 1.3, 0.8, -0.6, 0, TAU); g.fill(); }
      g.strokeStyle = OL; g.lineWidth = 1.4; for (const x of [a, b]) { g.beginPath(); g.arc(x, Y, 5.1, 0, TAU); g.stroke(); } break; }
    case 'visor': {
      const x0 = a - 5.6, x1 = b + 5.6; rr(g, x0, Y - 3.6, x1 - x0, 7.2, 3.4, '#14c4e8', 1.6);
      g.save(); rr(g, x0, Y - 3.6, x1 - x0, 7.2, 3.4); g.clip(); const gr = g.createLinearGradient(0, Y - 3.6, 0, Y + 3.6); gr.addColorStop(0, '#8cf0ff'); gr.addColorStop(1, '#0a7fb0'); g.fillStyle = gr; g.fillRect(x0, Y - 4, x1 - x0, 8);
      const p = ((t * 14) % ((x1 - x0) + 6)) - 3; g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(x0 + p, Y - 4, 2.2, 8); g.restore(); rr(g, x0, Y - 3.6, x1 - x0, 7.2, 3.4, null, 1.6); break; }
    default:
  }
  g.restore();
}

// ------------------------------------------------------------------ boty (jedna bota; x, y = střed původní boty, w = švih nohy)
export function bootC(g, id, x, y, face, t, mv) {
  g.save(); setup(g); const tx = face === 2 ? 1.4 : face === 4 ? -1.4 : 0;
  const base = (c, sole, rx = 5.8, ry = 3.4) => { ell(g, x + tx, y + 1.3, rx, ry * 0.92, sole, 1.5); ell(g, x + tx, y - 0.2, rx, ry, c, 1.6); };
  switch (id) {
    case 'sneakR': case 'sneakB': case 'neon': { const c = id === 'sneakR' ? '#e5483f' : id === 'sneakB' ? '#3f8cf0' : '#39ff7a'; base(c, id === 'neon' ? '#26262e' : '#f4f1ea'); g.strokeStyle = id === 'neon' ? '#26262e' : '#fff'; g.lineWidth = 1.2; for (const k of [-1.6, 0.4]) { g.beginPath(); g.moveTo(x + tx + k - 1, y - 2.3); g.lineTo(x + tx + k + 1, y - 1.4); g.stroke(); } if (face !== 1) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(x + tx - 1.6, y - 1.6, 1.8, 0.8, -0.3, 0, TAU); g.fill(); } break; }
    case 'rain': rr(g, x - 4.4, y - 7.4, 8.8, 9.4, 2.4, '#ffd24a', 1.6); rr(g, x - 4.4, y - 7.4, 8.8, 2.6, 1.2, '#e6a516', 1.2); ell(g, x + tx, y + 0.8, 5.8, 3.3, '#ffd24a', 1.6); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x - 2.8, y - 4, 1.4, 4.4); break;
    case 'cowboy': rr(g, x - 4.4, y - 7.2, 8.8, 9, 2, '#9a5f2a', 1.6); g.fillStyle = '#e6b585'; g.fillRect(x - 4.4, y - 7.2, 8.8, 1.6); ell(g, x + tx, y + 0.9, 6.2, 3.2, '#7a4519', 1.6); line(g, x - 2, y - 4.4, x + 2, y - 4.4, '#e6b585', 1); if (face === 2 || face === 4) { star(g, x - tx * 3.4, y + 1.6, 2.2, '#ffd24a', 0.9); } break;
    case 'slipper': { ell(g, x + tx, y + 0.6, 6.8, 4, '#ff9ac4', 1.6); for (const k of [-3.2, 0, 3.2]) circ(g, x + tx + k, y - 2.2 + Math.abs(k) * 0.2, 2.2, '#ffd0e6', 1.1); break; }
    case 'ninja': base('#2b2d3a', '#14151d'); line(g, x + tx, y - 3, x + tx, y + 1.2, '#14151d', 1.2); g.fillStyle = '#e5483f'; g.fillRect(x - 4.6, y - 3.4, 9.2, 1.8); g.strokeStyle = OL; g.lineWidth = 1; g.strokeRect(x - 4.6, y - 3.4, 9.2, 1.8); break;
    case 'roller': { circ(g, x - 3.4 + tx * 0.5, y + 4.2, 1.9, '#ff5fa8', 1.2); circ(g, x + 3.4 + tx * 0.5, y + 4.2, 1.9, '#ff5fa8', 1.2); g.fillStyle = '#9aa5b5'; g.fillRect(x - 5 + tx, y + 2.2, 10, 1.4); ell(g, x + tx, y - 0.2, 5.8, 3.4, '#f4f1ea', 1.6); g.fillStyle = '#ff5fa8'; g.fillRect(x - 3 + tx, y - 2.4, 6, 1.2); break; }
    case 'rainbow': { base('#fff', '#26262e'); g.save(); g.beginPath(); g.ellipse(x + tx, y - 0.2, 5.6, 3.2, 0, 0, TAU); g.clip(); const cols = ['#e5483f', '#ffc42e', '#3fbf5a', '#3f8cf0']; cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(x + tx - 6 + i * 3, y - 4, 3.1, 8); }); g.restore(); ell(g, x + tx, y - 0.2, 5.8, 3.4, null, 1.6); break; }
    case 'rocket': { const f = (mv ? 5 : 2.6) + Math.sin(t * 30 + x) * 1.2; path(g, () => { g.moveTo(x - 2.6, y + 3.6); g.lineTo(x, y + 3.6 + f); g.lineTo(x + 2.6, y + 3.6); g.closePath(); }, '#ff8a1f', 1.2); path(g, () => { g.moveTo(x - 1.2, y + 3.6); g.lineTo(x, y + 3.6 + f * 0.6); g.lineTo(x + 1.2, y + 3.6); g.closePath(); }, '#ffe98a', 0); rr(g, x - 3.4, y + 1.8, 6.8, 2.2, 1, '#3a3f4d', 1.2); base('#8d95a8', '#3a3f4d'); g.fillStyle = '#e5483f'; g.fillRect(x - 5 + tx, y - 2.2, 10, 1.4); break; }
    case 'gold': { base('#ffc42e', '#a8730a'); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(x + tx - 1.8, y - 1.6, 2, 0.9, -0.3, 0, TAU); g.fill(); const k = (Math.sin(t * 5 + x) + 1) / 2; if (k > 0.7) star(g, x + tx + 3.2, y - 2.6, 1.6 + k, '#fff', 0); break; }
    case 'winged': { const fl = Math.sin(t * (mv ? 14 : 5) + x) * 0.35; for (const s of [-1, 1]) { g.save(); g.translate(x + tx + s * 5, y - 1.2); g.rotate(s * (0.55 + fl)); ell(g, s * 3.8, 0, 4.8, 1.9, '#fff', 1.2); ell(g, s * 4.4, 2, 3.8, 1.4, '#e8eef8', 1); g.restore(); } base('#f4f1ea', '#c9d2e4'); g.fillStyle = '#ffd24a'; g.fillRect(x - 2 + tx, y - 2.6, 4, 1.2); break; }
    default:
  }
  g.restore();
}

// ------------------------------------------------------------------ záda: pass 0 = za tělem, pass 1 = před tělem (zezadu celé, zepředu popruhy a límce)
export function backC(g, id, face, t, mv, pass) {
  const view = face === 1 ? 'back' : face === 3 ? 'front' : 'side'; const dir = face === 2 ? -1 : 1;   // dir = na kterou stranu postavy je záda
  const ox = view === 'side' ? dir * 5 : 0; const sw = Math.sin(t * (mv ? 14 : 3)) * (mv ? 1.8 : 0.6);
  g.save(); setup(g);
  if (pass === 0 && view !== 'back') main(g, id, view, ox, dir, t, mv, sw);
  else if (pass === 1 && view === 'back') main(g, id, view, ox, dir, t, mv, sw);
  else if (pass === 1) extra(g, id, view, dir);
  g.restore();
}
function main(g, id, view, ox, dir, t, mv, sw) {
  const wide = view === 'side' ? 0.7 : 1.14; const cw = view === 'side' ? 7 : 15;
  switch (id) {
    case 'pack': rr(g, -10 * wide + ox, -3, 20 * wide, 18.4, 5, '#3fbf5a', 1.7); rr(g, -8 * wide + ox, -2, 16 * wide, 7.4, 3, '#1d7a34', 1.3); rr(g, -6 * wide + ox, 8.4, 12 * wide, 5, 2, '#2a9a45', 1.2); circ(g, ox, 6.6, 1.3, '#ffd24a', 0.9); break;
    case 'fox': { const s = view === 'side' ? -dir : 1; const wag = Math.sin(t * (mv ? 12 : 4)) * 2.4; const bx = view === 'side' ? ox * 1.2 : 7;
      path(g, () => { g.moveTo(bx, 12); g.bezierCurveTo(bx + s * 9, 13, bx + s * 15, 4 + wag, bx + s * 13, -7 + wag); g.bezierCurveTo(bx + s * 8, -2, bx + s * 2, 3, bx - s * 2, 7); g.closePath(); }, '#ff8a1f', 1.7);
      path(g, () => { g.moveTo(bx + s * 13, -7 + wag); g.bezierCurveTo(bx + s * 9.4, -3.6 + wag * 0.8, bx + s * 11.6, -1 + wag * 0.6, bx + s * 15, 0 + wag * 0.6); g.bezierCurveTo(bx + s * 16.2, -3 + wag, bx + s * 15, -6 + wag, bx + s * 13, -7 + wag); }, '#fff', 1.4); break; }
    case 'cape': case 'royal': { const c1 = id === 'cape' ? '#e5483f' : '#7a2fa8', c2 = id === 'cape' ? '#971f1a' : '#431062';
      path(g, () => { g.moveTo(-9 + ox, 1); g.quadraticCurveTo(-cw + ox + sw, 10, -cw + ox + sw, 20); g.quadraticCurveTo(ox, 22 + Math.abs(sw) * 0.4, cw + ox + sw, 20); g.quadraticCurveTo(cw + ox + sw, 10, 9 + ox, 1); g.closePath(); }, c1, 1.7);
      g.strokeStyle = c2; g.lineWidth = 1.4; for (const k of [-5, 0, 5]) { g.beginPath(); g.moveTo(k * 0.6 + ox, 3); g.quadraticCurveTo(k * 1.2 + ox + sw * 0.5, 12, k * 1.7 + ox + sw, 20.4); g.stroke(); }
      if (id === 'royal') { g.strokeStyle = '#ffc42e'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-cw + ox + sw, 19); g.quadraticCurveTo(ox, 21.2, cw + ox + sw, 19); g.stroke(); } break; }
    case 'quiver': { g.save(); g.translate(ox + (view === 'side' ? 0 : 4), 5); g.rotate(0.45); rr(g, -3.6, -9, 7.2, 21, 2.6, '#8a5a2a', 1.7); g.fillStyle = '#5a3517'; g.fillRect(-3.6, -6, 7.2, 2); g.strokeStyle = OL; g.lineWidth = 1; g.strokeRect(-3.6, -6, 7.2, 2);
      for (const [k, c] of [[-2, '#e5483f'], [0.4, '#fff'], [2.6, '#e5483f']]) { line(g, k, -9, k * 1.1, -15, '#c9b27a', 1.2); path(g, () => { g.moveTo(k, -15); g.lineTo(k - 1.6, -18); g.lineTo(k + 1.6, -18); g.closePath(); }, c, 0.9); } g.restore(); break; }
    case 'shell': ell(g, ox, 7.5, 12 * wide, 11.4, '#4a9a3a', 1.8); g.save(); g.beginPath(); g.ellipse(ox, 7.5, 11.2 * wide, 10.6, 0, 0, TAU); g.clip(); g.strokeStyle = '#2d6a22'; g.lineWidth = 1.3; for (const [x1, y1, x2, y2] of [[-12, 3, 12, 3], [-12, 12, 12, 12], [-4, -4, -4, 20], [4, -4, 4, 20], [-9, -4, -12, 8], [9, -4, 12, 8]]) { g.beginPath(); g.moveTo(x1 + ox, y1); g.lineTo(x2 + ox, y2); g.stroke(); } g.restore(); ell(g, ox, 7.5, 12 * wide, 11.4, null, 1.8); break;
    case 'surf': { g.save(); g.translate(7 + (view === 'side' ? ox : 0) , 4); g.rotate(0.32); path(g, () => { g.moveTo(0, -20); g.bezierCurveTo(6, -12, 5.6, 10, 3, 18); g.lineTo(-3, 18); g.bezierCurveTo(-5.6, 10, -6, -12, 0, -20); g.closePath(); }, '#4ac8ff', 1.7); line(g, 0, -17, 0, 16, '#fff', 1.8); g.fillStyle = '#ff5fa8'; g.fillRect(-4.6, -4, 9.2, 3); g.restore(); break; }
    case 'guitar': { g.save(); g.translate(ox, 6); g.rotate(-0.55); rr(g, -1.7, -21, 3.4, 15, 1, '#6e4320', 1.4); rr(g, -2.8, -25.6, 5.6, 5.6, 1.6, '#3a2412', 1.4); ell(g, 0, 0, 6.6, 5.6, '#d98a3c', 1.7); ell(g, 0, 8.2, 8.4, 7.2, '#d98a3c', 1.7); circ(g, 0, 5, 2.5, '#26180f', 0); g.strokeStyle = '#fff1a8'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, -6); g.lineTo(0, 5); g.stroke(); g.restore(); break; }
    case 'fly': { const fl = 1 + Math.sin(t * (mv ? 12 : 4)) * 0.1; for (const s of [-1, 1]) { g.save(); g.translate(s * 7, 4); g.scale(fl * (view === 'side' ? 0.7 : 1), 1); g.rotate(s * 0.35); ell(g, s * 6, -4, 7.6, 11, '#ff5fa8', 1.6, OL, s * 0.35); circ(g, s * 8, -7, 2.6, '#ffd24a', 1); ell(g, s * 4.4, 8, 5.2, 6.6, '#9a5fe8', 1.6, OL, -s * 0.3); circ(g, s * 5, 9, 1.6, '#fff', 0); g.restore(); } break; }
    case 'jet': { const f = (mv ? 8 : 4) + Math.sin(t * 28) * 1.6; for (const s of [-1, 1]) { const cx = s * 8.2 + (view === 'side' ? ox * 0.3 : 0);
        path(g, () => { g.moveTo(cx - 3.2, 17); g.lineTo(cx, 17 + f); g.lineTo(cx + 3.2, 17); g.closePath(); }, '#ff8a1f', 1.2); path(g, () => { g.moveTo(cx - 1.5, 17); g.lineTo(cx, 17 + f * 0.62); g.lineTo(cx + 1.5, 17); g.closePath(); }, '#ffe98a', 0);
        rr(g, cx - 4, 0, 8, 17, 3.4, '#aeb7c8', 1.7); g.fillStyle = '#e5483f'; g.fillRect(cx - 4, 5, 8, 2.6); g.strokeStyle = OL; g.lineWidth = 1; g.strokeRect(cx - 4, 5, 8, 2.6); rr(g, cx - 3, 16.4, 6, 2.6, 1, '#3a3f4d', 1.2); }
      break; }
    case 'bat': { const fl = Math.sin(t * (mv ? 11 : 4)) * 0.14; for (const s of [-1, 1]) { g.save(); g.translate(s * 7, 3); g.rotate(s * fl); const sc = view === 'side' ? 0.7 : 1;
        path(g, () => { g.moveTo(0, 0); g.quadraticCurveTo(s * 8 * sc, -13, s * 22 * sc, -9); g.quadraticCurveTo(s * 18 * sc, -4, s * 20 * sc, 3); g.quadraticCurveTo(s * 15 * sc, 0, s * 14 * sc, 9); g.quadraticCurveTo(s * 9 * sc, 3, s * 2 * sc, 11); g.closePath(); }, '#5a2f86', 1.7);
        g.strokeStyle = '#2a1442'; g.lineWidth = 1.2; for (const [ex2, ey2] of [[22, -9], [20, 3], [14, 9]]) { g.beginPath(); g.moveTo(0, 0); g.lineTo(s * ex2 * sc * 0.96, ey2 * 0.96); g.stroke(); } g.restore(); } break; }
    case 'angel': { const fl = Math.sin(t * (mv ? 11 : 3.4)) * 0.12; for (const s of [-1, 1]) { g.save(); g.translate(s * 7, 3); g.rotate(s * fl); const sc = view === 'side' ? 0.7 : 1;
        ell(g, s * 8 * sc, 10, 3.8 * sc, 7.4, '#e8eef8', 1.5, OL, s * 0.55); ell(g, s * 11.6 * sc, 4, 4.2 * sc, 9.4, '#f4f7ff', 1.5, OL, s * 0.75); ell(g, s * 9.6 * sc, -3.4, 4.8 * sc, 10.4, '#fff', 1.6, OL, s * 0.5);
        g.strokeStyle = 'rgba(160,175,210,.7)'; g.lineWidth = 1; for (const k of [-1, 1.5]) { g.beginPath(); g.moveTo(s * (8 + k) * sc, -9); g.lineTo(s * (9.6 + k) * sc, 2); g.stroke(); } g.restore(); } break; }
    default:
  }
}
function extra(g, id, view, dir) {
  if (view !== 'front' && view !== 'side') return;
  const f = view === 'front';
  switch (id) {
    case 'pack': if (f) { line(g, -6, 1.4, -8.4, 12.6, '#1d7a34', 2.6); line(g, 6, 1.4, 8.4, 12.6, '#1d7a34', 2.6); } break;
    case 'cape': case 'royal': if (id === 'royal') { ell(g, 0, 1.6, 10.6, 3.4, '#fff', 1.5); g.fillStyle = '#26180f'; for (const x of [-6, -2, 2, 6]) g.fillRect(x - 0.5, 0.9, 1.1, 2.2); } else { circ(g, -4, 1.4, 1.6, '#ffd24a', 1); circ(g, 4, 1.4, 1.6, '#ffd24a', 1); line(g, -4, 1.4, 4, 1.4, '#ffd24a', 1.2); } break;
    case 'quiver': if (f) line(g, -8, 1.6, 8.4, 13.4, '#5a3517', 2.2); break;
    case 'guitar': if (f) line(g, -8, 1.6, 8.4, 13.4, '#c2332d', 2); break;
    default:
  }
}
