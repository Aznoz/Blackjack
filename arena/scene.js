// ARÉNA VĚŽÍ – animovaná scéna v hlavním menu: západ slunce, dvě pevnosti (hlavní + strážní věž), řeka s mostem, na mostě se potkávají postavy,
// z nebe padá ohnivá koule a nad hlavou přelétá dráček. Kreslí se stejnými postavami jako ve hře (art.js).
import { drawChar, flame, crown } from './art.js?v=3';

const POOL = ['soldier', 'knight', 'archer', 'wizard', 'musketeer', 'berserker', 'golem', 'skeletons', 'priest', 'bomber'];
const CYCLE = 9;
let raf = 0, cv = null, g = null, W = 0, H = 0, dpr = 1, t0 = 0;
const ease = (k) => (k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k));
const lerp = (a, b, k) => a + (b - a) * k;

export function startScene(canvas) { if (raf) return; cv = canvas; g = cv.getContext('2d'); t0 = performance.now(); raf = requestAnimationFrame(loop); }
export function stopScene() { cancelAnimationFrame(raf); raf = 0; }

function fit() {
  const r = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  W = r.width; H = r.height;
}
function loop(now) { raf = requestAnimationFrame(loop); fit(); if (W < 50 || H < 50) return; draw((now - t0) / 1000); }

function sideTower(x, yb, s, team, main, t) {
  const col = team === 'me' ? ['#4a93f5', '#1f4fa8'] : ['#ec5148', '#971f1a'];
  const bw = (main ? 26 : 21) * s, bh = (main ? 64 : 44) * s;
  g.save(); g.translate(x, yb);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 2 * s, bw * 1.35, 5 * s, 0, 0, 6.283); g.fill();
  g.lineJoin = 'round'; g.lineWidth = 2.2; g.strokeStyle = '#6e5a2b';
  g.fillStyle = '#cdb683'; g.beginPath(); g.rect(-bw, -bh, bw * 2, bh); g.fill(); g.stroke();
  g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(bw * 0.25, -bh, bw * 0.75, bh);
  g.strokeStyle = 'rgba(110,90,43,.5)'; g.lineWidth = 1; for (let i = 1; i < 5; i++) { const yy = -bh * i / 5; g.beginPath(); g.moveTo(-bw, yy); g.lineTo(bw, yy); g.stroke(); }
  g.lineWidth = 2.2; g.strokeStyle = '#6e5a2b'; g.fillStyle = '#dccb97';
  for (let i = -2; i <= 2; i += 2) { g.beginPath(); g.rect(i * bw * 0.42 - bw * 0.2, -bh - 9 * s, bw * 0.4, 10 * s); g.fill(); g.stroke(); }
  g.fillStyle = col[0]; g.fillRect(-bw, -bh * 0.55, bw * 2, 8 * s); g.strokeRect(-bw, -bh * 0.55, bw * 2, 8 * s);
  g.fillStyle = '#3b2a16'; g.beginPath(); g.moveTo(-5 * s, 0); g.lineTo(-5 * s, -9 * s); g.arc(0, -9 * s, 5 * s, Math.PI, 0); g.lineTo(5 * s, 0); g.closePath(); g.fill();
  g.fillStyle = '#2a2236'; g.beginPath(); g.moveTo(-3 * s, -bh * 0.78); g.lineTo(-3 * s, -bh * 0.78 - 8 * s); g.arc(0, -bh * 0.78 - 8 * s, 3 * s, Math.PI, 0); g.lineTo(3 * s, -bh * 0.78); g.closePath(); g.fill();
  if (main) { crown(g, 0, -bh - 16 * s, 1.15 * s); }
  else {   // vlaječka
    const px = bw * 0.6; g.strokeStyle = '#4b3a1e'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, -bh - 8 * s); g.lineTo(px, -bh - 30 * s); g.stroke();
    const w = Math.sin(t * 4) * 2 * s; g.fillStyle = col[0]; g.beginPath(); g.moveTo(px, -bh - 30 * s); g.quadraticCurveTo(px + 9 * s, -bh - 31 * s + w, px + 16 * s, -bh - 26 * s); g.quadraticCurveTo(px + 9 * s, -bh - 24 * s - w, px, -bh - 20 * s); g.fill();
  }
  g.restore();
}

function unitAt(id, team, x, feetY, s, t, alpha = 1) {
  if (alpha <= 0.01) return;
  g.save(); g.globalAlpha = alpha; g.translate(x, feetY - 17 * s); g.scale(s, s);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 17, 10, 3.4, 0, 0, 6.283); g.fill();
  drawChar(g, id, team, t); g.restore();
}

function draw(t) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gy = H * 0.8, S = Math.max(0.9, H / 150);
  // obloha
  let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1b1156'); gr.addColorStop(0.42, '#6d33a6'); gr.addColorStop(0.72, '#ff7f6b'); gr.addColorStop(1, '#ffc46b');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; for (let i = 0; i < 26; i++) { const sx = (i * 97.3) % W, sy = (i * 41.7) % (H * 0.4); g.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + i); g.fillRect(sx, sy, 1.6, 1.6); } g.globalAlpha = 1;
  // slunce
  const sx = W * 0.5, sy = gy - H * 0.08, sr = H * 0.2; gr = g.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 1.8); gr.addColorStop(0, 'rgba(255,240,170,.95)'); gr.addColorStop(0.35, 'rgba(255,190,90,.55)'); gr.addColorStop(1, 'rgba(255,140,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(sx, sy, sr * 0.62, 0, 6.283); g.fill();
  // mraky
  g.fillStyle = 'rgba(255,214,200,.55)'; for (let i = 0; i < 3; i++) { const cx = ((t * (6 + i * 3) + i * 170) % (W + 140)) - 70, cy = H * (0.2 + i * 0.1); for (const [ox, oy, rd] of [[-16, 2, 9], [0, -4, 13], [17, 1, 10]]) { g.beginPath(); g.arc(cx + ox, cy + oy, rd, 0, 6.283); g.fill(); } }
  // vzdálené kopce
  g.fillStyle = '#4b2a85'; g.beginPath(); g.moveTo(0, gy); for (let x = 0; x <= W; x += 10) g.lineTo(x, gy - H * 0.12 - Math.sin(x * 0.021) * H * 0.05 - Math.sin(x * 0.007 + 1) * H * 0.07); g.lineTo(W, gy); g.fill();
  // dráček přelétá
  const dx = ((t * 38) % (W + 120)) - 60; g.save(); g.translate(dx, H * 0.46 + Math.sin(t * 1.6) * 8); g.scale(S * 0.85, S * 0.85); drawChar(g, 'dragon', 'me', t); g.restore();
  // země a řeka
  const rx0 = W * 0.43, rx1 = W * 0.57;
  g.fillStyle = '#3f9a4b'; g.fillRect(0, gy - 8, W, H - gy + 8); g.fillStyle = '#5bbd5f'; g.fillRect(0, gy - 8, W, 5);
  g.fillStyle = '#2e7d3b'; g.fillRect(0, gy + (H - gy) * 0.55, W, H);
  gr = g.createLinearGradient(0, gy - 8, 0, H); gr.addColorStop(0, '#59b6ff'); gr.addColorStop(1, '#2a6fd0'); g.fillStyle = gr; g.fillRect(rx0, gy - 8, rx1 - rx0, H - gy + 8);
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.6; for (let i = 0; i < 6; i++) { const yy = gy + 6 + i * ((H - gy - 8) / 6), wx = rx0 + ((i * 17 + t * 14) % (rx1 - rx0 - 14)); g.beginPath(); g.moveTo(wx, yy); g.quadraticCurveTo(wx + 5, yy - 3, wx + 12, yy); g.stroke(); }
  // most
  g.fillStyle = '#9c6a3a'; g.fillRect(rx0 - 12, gy - 6, rx1 - rx0 + 24, 16); g.strokeStyle = '#6b4423'; g.lineWidth = 1.2; for (let x = rx0 - 12; x <= rx1 + 12; x += 8) { g.beginPath(); g.moveTo(x, gy - 6); g.lineTo(x, gy + 10); g.stroke(); }
  g.fillStyle = '#5a3a1c'; g.fillRect(rx0 - 12, gy - 6, rx1 - rx0 + 24, 3); g.fillRect(rx0 - 12, gy + 8, rx1 - rx0 + 24, 3);
  // pevnosti: hlavní věž vzadu a menší strážní před ní
  const ts = Math.max(0.75, H / 215);
  sideTower(W * 0.09, gy + 2, ts, 'me', true, t); sideTower(W * 0.27, gy + 4, ts, 'me', false, t);
  sideTower(W * 0.91, gy + 2, ts, 'en', true, t + 1); sideTower(W * 0.73, gy + 4, ts, 'en', false, t + 1);
  // souboj na mostě
  const cyc = Math.floor(t / CYCLE), p = t % CYCLE;
  const bl = POOL[(cyc * 3) % POOL.length]; let rd = POOL[(cyc * 5 + 2) % POOL.length]; if (rd === bl) rd = POOL[(cyc * 5 + 3) % POOL.length];
  const feet = gy + 6, us = Math.max(1, H / 128);
  const fade = Math.min(1, p / 0.5, (CYCLE - p) / 0.6);
  const bx = p < 3.3 ? lerp(W * 0.3, W * 0.45, ease(p / 3.3)) : lerp(W * 0.45, W * 0.8, ease((p - 3.3) / 5.7));
  unitAt(bl, 'me', bx, feet, us, t + cyc, fade);
  if (p < 3.4) unitAt(rd, 'en', lerp(W * 0.7, W * 0.56, ease(p / 3.3)), feet, us, t * 1.05 + cyc, Math.min(1, fade * 1.2));
  // ohnivá koule
  if (p > 2.3 && p < 3.4) {
    const k = (p - 2.3) / 1.1, fx = W * 0.56, fy = lerp(-30, feet - 18 * us, k * k);
    g.save(); g.translate(fx, fy); g.rotate(Math.PI); flame(g, Math.max(0.8, H / 190), t); g.restore();
  }
  if (p >= 3.4 && p < 4.1) {   // výbuch + obláček
    const k = (p - 3.4) / 0.7, ex = W * 0.56, ey = feet - 16 * us;
    gr = g.createRadialGradient(ex, ey, 0, ex, ey, 42 * us * (0.4 + k)); gr.addColorStop(0, `rgba(255,240,160,${0.95 * (1 - k)})`); gr.addColorStop(0.5, `rgba(255,140,40,${0.7 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,60,20,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(ex, ey, 42 * us * (0.4 + k), 0, 6.283); g.fill();
    g.globalAlpha = 0.85 * (1 - k); g.fillStyle = '#eef1fa'; for (const [ox, oy, r] of [[-8, 0, 7], [7, -3, 8], [0, -9, 7]]) { g.beginPath(); g.arc(ex + ox * (0.6 + k) * us * 0.8, ey + (oy - 16 * k) * us * 0.8, r * (0.8 + k) * us * 0.8, 0, 6.283); g.fill(); } g.globalAlpha = 1;
  }
}
