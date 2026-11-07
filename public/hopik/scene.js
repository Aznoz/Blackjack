// HOPÍK – animovaná scéna v hlavním menu: louka, po které zvířátka běhají a přeskakují bedny a bodáky. Čistě dekorace.
import { drawAnimal, drawBackground, drawPieceShape, flagShape, sawShape, INK, SEAT } from './art.js?v=4';
import * as K from './shared.js?v=4';
let raf = 0, cv = null, g = null, W = 0, H = 0, dpr = 1, last = 0, t = 0, bg = null, actors = [];
const VIEW_W = 21;                                    // kolik políček široká je scéna
const GROUND = 6.2;                                   // výška země ve scéně (v políčkách odshora)
const OBST = [{ x: 3.4, w: 2, k: 'block' }, { x: 8.2, w: 3, k: 'spikes' }, { x: 13.2, w: 1, k: 'saw' }, { x: 16.4, w: 2, k: 'block' }];
function build() {
  const r = cv.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  actors = [0, 1, 2, 3, 4].map((i) => ({ ch: [0, 5, 3, 1, 4][i], x: -i * 2.6, sp: 2.2 + i * 0.18, ph: i * 1.3 }));
  bg = document.createElement('canvas'); bg.width = 640; bg.height = 360; const b = bg.getContext('2d'); b.setTransform(20, 0, 0, 20, 0, 0); drawBackground(b, 'meadow', 0);
}
/** Výška (nahoru od země), ve které je zvíře v dané x-ové poloze: oblouk přes překážku. */
function lift(x) {
  let h = 0;
  for (const o of OBST) { const a = o.x - 1.4, w = o.w + 2.2, u = (x - a) / w; if (u > 0 && u < 1) h = Math.max(h, Math.sin(u * Math.PI) * (o.k === 'block' ? 2.3 : o.k === 'saw' ? 2.6 : 2.0)); }
  return h;
}
function draw() {
  const s = W / VIEW_W; const vh = H / s;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  g.drawImage(bg, 0, 0, W, H);
  g.setTransform(dpr * s, 0, 0, dpr * s, 0, dpr * (H - vh * s) / 2 * 0); g.lineJoin = 'round';
  const gy = Math.min(GROUND, vh - 1.9);
  // země
  g.fillStyle = '#b0713d'; g.fillRect(0, gy, VIEW_W, vh - gy); g.fillStyle = '#62d05a'; g.fillRect(0, gy, VIEW_W, 0.35); g.lineWidth = 0.07; g.strokeStyle = INK; g.beginPath(); g.moveTo(0, gy); g.lineTo(VIEW_W, gy); g.stroke();
  for (let i = 0; i < VIEW_W; i++) { g.fillStyle = '#d6a46a'; g.beginPath(); g.ellipse(i + 0.4 + (i % 3) * 0.2, gy + 0.9 + (i % 2) * 0.5, 0.12, 0.08, 0, 0, 6.283); g.fill(); }
  g.save(); g.translate(0, gy);
  flagShape(g, 20, 0, t);
  for (const o of OBST) {
    if (o.k === 'block') drawPieceShape(g, 'block', 0, o.x, -2, { own: SEAT[1] });
    else if (o.k === 'spikes') drawPieceShape(g, 'spikes', 0, o.x, -2, { own: SEAT[0] });
    else sawShape(g, o.x + 0.5, -0.9, 0.9, t, SEAT[2]);
  }
  for (const a of [...actors].sort((p, q) => p.x - q.x)) {
    const run = a.x > -1 && a.x < VIEW_W + 1; const h = lift(a.x);
    drawAnimal(g, a.ch, a.x, -0.45 - h, { face: 1, t: t + a.ph, gr: h < 0.05, vx: 8, vy: h > 0.05 ? (lift(a.x + 0.05) - h > 0 ? -12 : 12) : 0 }); void run;
  }
  g.restore();
}
function step(dt) {
  t += dt;
  for (const a of actors) { a.x += a.sp * dt * 1.5; if (a.x > VIEW_W + 1.5) a.x = -1.5 - Math.random() * 2; }
}
function loop(now) { raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; step(dt); draw(); }
export function startScene(canvas) { if (raf) return; cv = canvas; g = cv.getContext('2d'); build(); last = performance.now(); raf = requestAnimationFrame(loop); window.addEventListener('resize', onResize); }
function onResize() { if (raf) build(); }
export function stopScene() { if (raf) cancelAnimationFrame(raf); raf = 0; window.removeEventListener('resize', onResize); }
void K;
