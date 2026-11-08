// MINIGOLF – kresba kosmetiky z dat (žádné obrázky): textury skinů míčků (válcová projekce 256 × 128 na kouli), jejich náhled v obchodě,
// ikony efektů výhry a holí. Seznamy věcí a ceny jsou v shared.js; tady je jen vzhled. Bez three.js, takže jde použít v menu i ve 3D scéně.
import * as K from './shared.js?v=4';

const TAU = Math.PI * 2;
function rngOf(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const star = (g, x, y, r, pts = 5, inner = 0.45) => { g.beginPath(); for (let i = 0; i < pts * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / pts, rr = i % 2 ? r * inner : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
const heart = (g, x, y, s) => { g.beginPath(); g.moveTo(x, y + s * 0.9); g.bezierCurveTo(x - s * 1.3, y + s * 0.1, x - s * 0.7, y - s * 0.9, x, y - s * 0.3); g.bezierCurveTo(x + s * 0.7, y - s * 0.9, x + s * 1.3, y + s * 0.1, x, y + s * 0.9); g.fill(); };
const wrapDraw = (w, fn) => { fn(0); fn(-w); fn(w); };   // věc u levého nebo pravého okraje textury se dokreslí i na druhé straně (válec je souvislý)

/** Vzhled skinů: paint(g, w, h) kreslí texturu, rough/metal = materiál, em = barva a síla vlastního světla, anim = animace (scroll = posun textury, pulse = pulzující záře). */
export const SKIN_ART = {
  dots: { rough: 0.35, metal: 0.02, paint(g, w, h) { g.fillStyle = '#fff4fa'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff4fa8'; for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) { g.beginPath(); g.arc((c + (r % 2) * 0.5) * w / 12 + 10, (r + 0.5) * h / 6, 7 - Math.abs(r - 2.5) * 0.9, 0, TAU); g.fill(); } } },
  checker: { rough: 0.4, metal: 0.02, paint(g, w, h) { for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) { g.fillStyle = (r + c) % 2 ? '#15151c' : '#f6f6f6'; g.fillRect(c * w / 12, r * h / 6, w / 12 + 1, h / 6 + 1); } } },
  tennis: { rough: 0.9, metal: 0, paint(g, w, h) {
    g.fillStyle = '#c9ea2e'; g.fillRect(0, 0, w, h); const rnd = rngOf(5); g.fillStyle = 'rgba(255,255,255,.14)'; for (let i = 0; i < 500; i++) g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'; for (const ph of [0, w / 2]) { g.beginPath(); for (let x = 0; x <= w / 2; x += 4) { const y = h / 2 + Math.sin(x / (w / 2) * TAU) * h * 0.34; if (x) g.lineTo(x + ph, y); else g.moveTo(x + ph, y); } g.stroke(); } } },
  stars: { rough: 0.3, metal: 0.1, em: [0x101c50, 0.35], paint(g, w, h) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0e1a5c'); gr.addColorStop(1, '#2a3aa8'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const rnd = rngOf(11); for (let i = 0; i < 26; i++) { const x = rnd() * w, y = 10 + rnd() * (h - 20), r = 4 + rnd() * 5; g.fillStyle = rnd() < 0.5 ? '#ffd84a' : '#fff6c0'; wrapDraw(w, (o) => star(g, x + o, y, r)); } } },
  smile: { rough: 0.4, metal: 0, paint(g, w, h) {
    g.fillStyle = '#ffd62a'; g.fillRect(0, 0, w, h);
    for (const cx of [w * 0.25, w * 0.75]) { g.fillStyle = '#3a2a00'; g.beginPath(); g.ellipse(cx - 14, h * 0.4, 5, 9, 0, 0, TAU); g.ellipse(cx + 14, h * 0.4, 5, 9, 0, 0, TAU); g.fill(); g.strokeStyle = '#3a2a00'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.arc(cx, h * 0.5, 22, 0.2, Math.PI - 0.2); g.stroke(); g.fillStyle = 'rgba(255,120,80,.45)'; g.beginPath(); g.arc(cx - 30, h * 0.58, 6, 0, TAU); g.arc(cx + 30, h * 0.58, 6, 0, TAU); g.fill(); } } },
  soccer: { rough: 0.4, metal: 0.02, paint(g, w, h) {
    g.fillStyle = '#fbfbfb'; g.fillRect(0, 0, w, h); const pts = [[0.08, 0.28], [0.33, 0.28], [0.58, 0.28], [0.83, 0.28], [0.2, 0.72], [0.45, 0.72], [0.7, 0.72], [0.95, 0.72], [0.5, 0.05], [0, 0.05], [0.5, 0.95], [0, 0.95]];
    for (const [px, py] of pts) { g.fillStyle = '#1c1c22'; wrapDraw(w, (o) => { g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; g.lineTo(px * w + o + Math.cos(a) * 15, py * h + Math.sin(a) * 15); } g.closePath(); g.fill(); }); }
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(i * w / 4 + w / 8, 0); g.lineTo(i * w / 4 + w / 8, h); g.stroke(); } } },
  basket: { rough: 0.85, metal: 0, paint(g, w, h) {
    g.fillStyle = '#e8732a'; g.fillRect(0, 0, w, h); const rnd = rngOf(9); g.fillStyle = 'rgba(90,30,0,.18)'; for (let i = 0; i < 700; i++) g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
    g.strokeStyle = '#1d1208'; g.lineWidth = 4; for (const x of [0, w / 2, w]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    for (const cx of [w / 4, w * 3 / 4]) { g.beginPath(); g.arc(cx - w / 4 - 22, h / 2, 40, -1.0, 1.0); g.stroke(); g.beginPath(); g.arc(cx + w / 4 + 22 - w / 2, h / 2, 40, Math.PI - 1.0, Math.PI + 1.0); g.stroke(); } } },
  eight: { rough: 0.15, metal: 0.05, paint(g, w, h) { g.fillStyle = '#0d0d12'; g.fillRect(0, 0, w, h); for (const cx of [w * 0.25, w * 0.75]) { g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, h / 2, 26, 0, TAU); g.fill(); g.fillStyle = '#0d0d12'; g.font = '900 38px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('8', cx, h / 2 + 2); } g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(0, 0, w, 6); } },
  earth: { rough: 0.5, metal: 0, paint(g, w, h) {
    g.fillStyle = '#1f6fd8'; g.fillRect(0, 0, w, h); const rnd = rngOf(3); g.fillStyle = '#3fae4a';
    for (let i = 0; i < 9; i++) { const x = rnd() * w, y = 24 + rnd() * (h - 48), r = 12 + rnd() * 18; wrapDraw(w, (o) => { g.beginPath(); g.ellipse(x + o, y, r * 1.4, r, rnd() * 3, 0, TAU); g.fill(); }); }
    g.fillStyle = '#8a6a3a'; for (let i = 0; i < 6; i++) { const x = rnd() * w, y = 30 + rnd() * (h - 60); g.beginPath(); g.arc(x, y, 5 + rnd() * 5, 0, TAU); g.fill(); }
    g.fillStyle = '#f4fbff'; g.fillRect(0, 0, w, 9); g.fillRect(0, h - 9, w, 9); g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(rnd() * w, 20 + rnd() * (h - 40), 22, 6, 0, 0, TAU); g.fill(); } } },
  lava: { rough: 0.7, metal: 0.05, em: [0xff4a00, 0.7], anim: 'pulse', paint(g, w, h) {
    g.fillStyle = '#26110c'; g.fillRect(0, 0, w, h); const rnd = rngOf(21); g.strokeStyle = '#ff8a1c'; g.shadowColor = '#ff4a00'; g.shadowBlur = 8; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let k = 0; k < 14; k++) { let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 5; i++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 36; g.lineTo(x, y); } g.stroke(); } g.shadowBlur = 0; g.fillStyle = 'rgba(255,200,60,.5)'; for (let i = 0; i < 40; i++) g.fillRect(rnd() * w, rnd() * h, 2, 2); } },
  ice: { rough: 0.08, metal: 0.25, em: [0x6ac8ff, 0.25], paint(g, w, h) {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#d8f4ff'); gr.addColorStop(0.5, '#a8def8'); gr.addColorStop(1, '#e8fbff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const rnd = rngOf(8);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2.5; for (let k = 0; k < 16; k++) { let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 4; i++) { x += (rnd() - 0.4) * 40; y += (rnd() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 24; i++) star(g, rnd() * w, rnd() * h, 2 + rnd() * 3, 4, 0.3); } },
  neon: { rough: 0.2, metal: 0.2, em: [0x20e0ff, 0.9], anim: 'pulse', paint(g, w, h) {
    g.fillStyle = '#08081a'; g.fillRect(0, 0, w, h); g.lineWidth = 5; g.shadowBlur = 10; const rings = [[0.2, '#18f0ff'], [0.5, '#ff2fd8'], [0.8, '#18f0ff']];
    for (const [y, c] of rings) { g.strokeStyle = c; g.shadowColor = c; g.beginPath(); g.moveTo(0, y * h); g.lineTo(w, y * h); g.stroke(); }
    g.strokeStyle = '#fff36a'; g.shadowColor = '#fff36a'; for (const x of [w * 0.25, w * 0.75]) { g.beginPath(); g.moveTo(x - 18, h * 0.3); g.lineTo(x + 6, h * 0.52); g.lineTo(x - 8, h * 0.52); g.lineTo(x + 16, h * 0.74); g.stroke(); } g.shadowBlur = 0; } },
  galaxy: { rough: 0.35, metal: 0.1, em: [0x6a2cff, 0.55], anim: 'pulse', paint(g, w, h) {
    g.fillStyle = '#0a0524'; g.fillRect(0, 0, w, h); const rnd = rngOf(2);
    for (const [c, n] of [['rgba(150,60,255,.55)', 5], ['rgba(40,140,255,.45)', 5], ['rgba(255,70,200,.4)', 4]]) for (let i = 0; i < n; i++) { const x = rnd() * w, y = rnd() * h, r = 24 + rnd() * 34; wrapDraw(w, (o) => { const rg = g.createRadialGradient(x + o, y, 0, x + o, y, r); rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x + o - r, y - r, r * 2, r * 2); }); }
    g.fillStyle = '#fff'; for (let i = 0; i < 90; i++) { g.globalAlpha = 0.4 + rnd() * 0.6; g.fillRect(rnd() * w, rnd() * h, 1.6, 1.6); } g.globalAlpha = 1; } },
  rainbow: { rough: 0.3, metal: 0.05, anim: 'scroll', paint(g, w, h) { for (let x = 0; x < w; x++) { g.fillStyle = `hsl(${x / w * 360},95%,58%)`; g.fillRect(x, 0, 2, h); } const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, 'rgba(255,255,255,.35)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.2)'); g.fillStyle = sh; g.fillRect(0, 0, w, h); } },
  chrome: { rough: 0.12, metal: 0.35, em: [0x8899aa, 0.2], paint(g, w, h) {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5c86c8'); gr.addColorStop(0.46, '#e9f1fb'); gr.addColorStop(0.5, '#2c2f38'); gr.addColorStop(0.56, '#8a7a66'); gr.addColorStop(1, '#3a2f28'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.7)'; for (const x of [40, 120, 200]) { g.beginPath(); g.ellipse(x, h * 0.3, 18, 7, 0, 0, TAU); g.fill(); } g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, h * 0.47, w, 3); } },
  gold: { rough: 0.2, metal: 0.4, em: [0xffb000, 0.32], paint(g, w, h) {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#f9e07a'); gr.addColorStop(0.3, '#d9a017'); gr.addColorStop(0.55, '#fff0a8'); gr.addColorStop(0.8, '#c88a0c'); gr.addColorStop(1, '#f2c94c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.65)'; const rnd = rngOf(4); for (let i = 0; i < 18; i++) star(g, rnd() * w, rnd() * h, 2 + rnd() * 3, 4, 0.25); g.strokeStyle = 'rgba(120,70,0,.3)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); } },
};

/** Obrázek míčku se skinem do obchodu: z válcové textury se spočítá pohled na kouli (osvětlení zleva nahoře). */
const previewCache = new Map();
export function skinPreviewURL(id, size = 96, baseColor = '#ef3b3b') {
  const key = id + '|' + size + '|' + baseColor; if (previewCache.has(key)) return previewCache.get(key);
  const w = 256, h = 128; const tex = document.createElement('canvas'); tex.width = w; tex.height = h; const tg = tex.getContext('2d');
  if (id && SKIN_ART[id]) SKIN_ART[id].paint(tg, w, h); else { tg.fillStyle = baseColor; tg.fillRect(0, 0, w, h); tg.fillStyle = 'rgba(255,255,255,.9)'; tg.fillRect(0, 52, w, 24); }
  const src = tg.getImageData(0, 0, w, h).data; const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const out = g.createImageData(size, size); const R = size / 2 - 2; const rot = 0.5, cr = Math.cos(rot), sr = Math.sin(rot);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + 0.5 - size / 2) / R, ny = (y + 0.5 - size / 2) / R, d2 = nx * nx + ny * ny; if (d2 > 1) continue; const nz = Math.sqrt(1 - d2);
    const px = nx * cr + nz * sr, pz = -nx * sr + nz * cr; const lon = Math.atan2(px, pz), lat = Math.asin(-ny); const u = ((lon / TAU + 0.5) % 1 + 1) % 1, v = 0.5 - lat / Math.PI;
    const si = ((Math.min(h - 1, Math.floor(v * h)) * w) + Math.min(w - 1, Math.floor(u * w))) * 4; const lit = Math.max(0, -0.45 * nx - 0.55 * ny + 0.7 * nz); const k = 0.45 + 0.7 * lit; const spec = Math.pow(Math.max(0, -0.4 * nx - 0.5 * ny + 0.77 * nz), 28) * 150;
    const o = (y * size + x) * 4; out.data[o] = Math.min(255, src[si] * k + spec); out.data[o + 1] = Math.min(255, src[si + 1] * k + spec); out.data[o + 2] = Math.min(255, src[si + 2] * k + spec); out.data[o + 3] = d2 > (1 - 1.5 / R) ? 140 : 255;
  }
  g.putImageData(out, 0, 0); const url = c.toDataURL(); previewCache.set(key, url); return url;
}

/** Ikona efektu výhry (jednoduchý obrázek z tvarů) do obchodu. */
const FX_ICON = {
  '': (g, s) => { const rnd = rngOf(7); for (let i = 0; i < 26; i++) { g.save(); g.translate(s * (0.15 + rnd() * 0.7), s * (0.15 + rnd() * 0.7)); g.rotate(rnd() * 6); g.fillStyle = `hsl(${rnd() * 360},90%,58%)`; g.fillRect(-4, -2.5, 8, 5); g.restore(); } },
  sparks: (g, s) => { g.strokeStyle = '#ffd84a'; g.lineWidth = 3; g.lineCap = 'round'; for (let i = 0; i < 12; i++) { const a = i * TAU / 12; g.beginPath(); g.moveTo(s / 2 + Math.cos(a) * s * 0.12, s * 0.58 + Math.sin(a) * s * 0.12); g.lineTo(s / 2 + Math.cos(a) * s * (0.28 + (i % 3) * 0.06), s * 0.58 + Math.sin(a) * s * (0.28 + (i % 3) * 0.06)); g.stroke(); } },
  stars: (g, s) => { const rnd = rngOf(3); for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#ffd84a' : '#fff6c0'; star(g, s * (0.18 + rnd() * 0.64), s * (0.18 + rnd() * 0.64), s * (0.07 + rnd() * 0.07)); } },
  rings: (g, s) => { for (let i = 0; i < 3; i++) { g.strokeStyle = `rgba(90,210,255,${1 - i * 0.28})`; g.lineWidth = 4 - i; g.beginPath(); g.ellipse(s / 2, s * 0.6, s * (0.14 + i * 0.12), s * (0.06 + i * 0.05), 0, 0, TAU); g.stroke(); } },
  hearts: (g, s) => { const rnd = rngOf(6); for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#ff5fa0' : '#ff9ac4'; heart(g, s * (0.2 + rnd() * 0.6), s * (0.22 + rnd() * 0.56), s * (0.07 + rnd() * 0.05)); } },
  rainbow: (g, s) => { for (let i = 0; i < 6; i++) { g.strokeStyle = `hsl(${i * 55},95%,58%)`; g.lineWidth = 5; g.beginPath(); g.arc(s / 2, s * 0.78, s * (0.38 - i * 0.045), Math.PI, 0); g.stroke(); } },
  fireworks: (g, s) => { for (const [cx, cy, c] of [[0.35, 0.38, '#ff4f6a'], [0.68, 0.5, '#ffd84a']]) { g.strokeStyle = c; g.lineWidth = 3; g.lineCap = 'round'; for (let i = 0; i < 10; i++) { const a = i * TAU / 10; g.beginPath(); g.moveTo(s * cx + Math.cos(a) * s * 0.06, s * cy + Math.sin(a) * s * 0.06); g.lineTo(s * cx + Math.cos(a) * s * 0.2, s * cy + Math.sin(a) * s * 0.2); g.stroke(); } } },
  lightning: (g, s) => { g.fillStyle = '#fff36a'; g.shadowColor = '#7ad0ff'; g.shadowBlur = 10; g.beginPath(); g.moveTo(s * 0.56, s * 0.08); g.lineTo(s * 0.28, s * 0.54); g.lineTo(s * 0.48, s * 0.54); g.lineTo(s * 0.4, s * 0.92); g.lineTo(s * 0.74, s * 0.4); g.lineTo(s * 0.54, s * 0.4); g.closePath(); g.fill(); g.shadowBlur = 0; },
  meteor: (g, s) => { const gr = g.createLinearGradient(s * 0.15, s * 0.1, s * 0.62, s * 0.62); gr.addColorStop(0, 'rgba(255,120,30,0)'); gr.addColorStop(1, 'rgba(255,170,60,.95)'); g.strokeStyle = gr; g.lineWidth = s * 0.14; g.lineCap = 'round'; g.beginPath(); g.moveTo(s * 0.15, s * 0.1); g.lineTo(s * 0.62, s * 0.58); g.stroke(); g.fillStyle = '#5a3a2a'; g.beginPath(); g.arc(s * 0.66, s * 0.62, s * 0.11, 0, TAU); g.fill(); g.fillStyle = '#ffd24a'; star(g, s * 0.72, s * 0.84, s * 0.08, 8, 0.4); },
  goldrain: (g, s) => { const rnd = rngOf(9); for (let i = 0; i < 9; i++) { const x = s * (0.14 + rnd() * 0.72), y = s * (0.14 + rnd() * 0.72); g.fillStyle = '#e8a812'; g.beginPath(); g.ellipse(x, y, s * 0.07, s * 0.07, 0, 0, TAU); g.fill(); g.fillStyle = '#ffe27a'; g.beginPath(); g.ellipse(x - 1, y - 1, s * 0.045, s * 0.045, 0, 0, TAU); g.fill(); } },
  nova: (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.46); gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, '#ffe27a'); gr.addColorStop(0.6, 'rgba(255,90,40,.7)'); gr.addColorStop(1, 'rgba(255,60,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); g.strokeStyle = '#fff'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.beginPath(); g.moveTo(s / 2 + Math.cos(a) * s * 0.12, s / 2 + Math.sin(a) * s * 0.12); g.lineTo(s / 2 + Math.cos(a) * s * 0.44, s / 2 + Math.sin(a) * s * 0.44); g.stroke(); } },
};
const iconCache = new Map();
export function fxIconURL(id, size = 96) {
  const key = 'fx' + id + size; if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const bg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.7); bg.addColorStop(0, '#1d3a2c'); bg.addColorStop(1, '#0c1f17'); g.fillStyle = bg; g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 1, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 2, 0, TAU); g.clip(); (FX_ICON[id] || FX_ICON[''])(g, size); g.restore();
  const url = c.toDataURL(); iconCache.set(key, url); return url;
}

/** Ikona hole: šikmá tyč s hlavou, barva podle kvality. */
const CLUB_COL = { '': ['#b98a52', '#d8d8d8'], iron: ['#9aa3ad', '#cfd6dd'], sand: ['#c9a65a', '#e6d28a'], driver: ['#6b7480', '#2b6fe0'], titan: ['#8fd0e8', '#d8f4ff'], goldclub: ['#e0b020', '#fff0a0'], plasma: ['#a24dff', '#4af0ff'], putter: ['#7d8791', '#f2f2f2'], wood: ['#8a5a2b', '#b9783a'], ruby: ['#c0183c', '#ff6b86'], diamond: ['#7fe6ff', '#ffffff'], dragon: ['#ff5a1a', '#ffd23a'] };
export function clubIconURL(id, size = 96) {
  const key = 'cl' + id + size; if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const s = size; const [shaft, head] = CLUB_COL[id] || CLUB_COL[''];
  const bg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.7); bg.addColorStop(0, '#1d3a2c'); bg.addColorStop(1, '#0c1f17'); g.fillStyle = bg; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 1, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 2, 0, TAU); g.clip();
  const GLOW = { plasma: '#7a5cff', goldclub: '#ffd24a', ruby: '#ff2a55', diamond: '#8ff0ff', dragon: '#ff7a1a' };
  if (GLOW[id]) { g.shadowColor = GLOW[id]; g.shadowBlur = 12; }
  g.strokeStyle = shaft; g.lineWidth = s * 0.055; g.lineCap = 'round'; g.beginPath(); g.moveTo(s * 0.8, s * 0.14); g.lineTo(s * 0.34, s * 0.7); g.stroke();
  g.fillStyle = head; g.beginPath(); g.moveTo(s * 0.3, s * 0.66); g.lineTo(s * 0.46, s * 0.74); g.lineTo(s * 0.5, s * 0.84); g.lineTo(s * 0.18, s * 0.8); g.closePath(); g.fill(); g.shadowBlur = 0;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(s * 0.62, s * 0.84, s * 0.07, 0, TAU); g.fill(); g.fillStyle = 'rgba(0,0,0,.12)'; g.beginPath(); g.arc(s * 0.64, s * 0.86, s * 0.05, 0, TAU); g.fill(); g.restore();
  const url = c.toDataURL(); iconCache.set(key, url); return url;
}
export { K };
