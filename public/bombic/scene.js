// BOMBIC – animovaná scéna v hlavním menu: kousek lesa, po kterém pobíhají bombeři a občas něco vybuchne. Čistě dekorace.
import { drawTile, drawBomb, drawFlame, drawPlayer } from './art.js?v=4';
import { T } from './shared.js?v=4';
let raf = 0, cv = null, g = null, W = 0, H = 0, ts = 40, cols = 0, rows = 0, grid = [], bg = null, actors = [], bombs = [], flames = [], regrow = [], last = 0, t = 0, dpr = 1;
const D = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? T.STONE : grid[y * cols + x]);
function build() {
  const r = cv.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ts = Math.max(34, Math.min(64, H / 5)); cols = Math.ceil(W / ts) + 1; rows = Math.ceil(H / ts) + 1;
  grid = []; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) grid.push(x % 2 === 1 && y % 2 === 1 ? T.STONE : hash(x, y) < 0.42 && (x + y > 1) ? T.STUMP : T.FLOOR);
  bg = document.createElement('canvas'); bg.width = Math.round(cols * ts * dpr); bg.height = Math.round(rows * ts * dpr); paintBg();
  const spots = []; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (grid[y * cols + x] === T.FLOOR) spots.push([x, y]);
  actors = [0, 1, 2, 3].map((i) => { const s = spots[Math.floor((spots.length * (i + 0.5)) / 4)] || [0, 0]; return { skin: i, x: s[0], y: s[1], tx: s[0], ty: s[1], prog: 1, face: 2, wait: Math.random() }; });
  bombs = []; flames = []; regrow = [];
}
function paintBg() { const b = bg.getContext('2d'); b.setTransform(dpr, 0, 0, dpr, 0, 0); b.clearRect(0, 0, bg.width, bg.height); for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) drawTile(b, grid[y * cols + x], x * ts, y * ts, ts, x, y, false); }
function step(dt) {
  t += dt;
  for (const a of actors) {
    if (a.prog < 1) { a.prog = Math.min(1, a.prog + dt * 2.3); if (a.prog >= 1) { a.x = a.tx; a.y = a.ty; a.wait = 0.05 + Math.random() * 0.25; } continue; }
    a.wait -= dt; if (a.wait > 0) continue;
    const opts = []; for (let d = 0; d < 4; d++) { const nx = a.x + D[d][0], ny = a.y + D[d][1]; if (at(nx, ny) === T.FLOOR && !bombs.some((b) => b.x === nx && b.y === ny) && !flames.some((f) => f.x === nx && f.y === ny)) opts.push(d); }
    if (!opts.length) { a.wait = 0.3; continue; }
    const d = a.dir !== undefined && opts.includes(a.dir) && Math.random() < 0.6 ? a.dir : opts[Math.floor(Math.random() * opts.length)];
    a.dir = d; a.face = [1, 2, 3, 4][d]; a.tx = a.x + D[d][0]; a.ty = a.y + D[d][1]; a.prog = 0;
    if (Math.random() < 0.1 && bombs.length < 3) bombs.push({ x: a.x, y: a.y, fuse: 1.7 });
  }
  for (const b of bombs) b.fuse -= dt;
  for (const b of bombs.filter((q) => q.fuse <= 0)) {
    bombs.splice(bombs.indexOf(b), 1); flames.push({ x: b.x, y: b.y, life: 0.5 });
    for (let d = 0; d < 4; d++) for (let r = 1; r <= 2; r++) { const x = b.x + D[d][0] * r, y = b.y + D[d][1] * r, k = at(x, y); if (k === T.STONE) break; flames.push({ x, y, life: 0.5 }); if (k === T.STUMP) { grid[y * cols + x] = T.FLOOR; regrow.push({ x, y, in: 6 + Math.random() * 4 }); paintBg(); break; } }
  }
  for (const f of flames) f.life -= dt; flames = flames.filter((f) => f.life > 0);
  for (const r of regrow) r.in -= dt;
  for (const r of regrow.filter((q) => q.in <= 0)) { if (!actors.some((a) => (a.x === r.x && a.y === r.y) || (a.tx === r.x && a.ty === r.y)) && !flames.some((f) => f.x === r.x && f.y === r.y)) { grid[r.y * cols + r.x] = T.STUMP; paintBg(); regrow.splice(regrow.indexOf(r), 1); } else r.in = 1; }
}
function draw() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const oy = Math.min(0, (H - rows * ts) / 2); g.save(); g.translate(0, oy);
  g.drawImage(bg, 0, 0, cols * ts, rows * ts);
  for (const f of flames) drawFlame(g, f.x * ts, f.y * ts, ts, t, f.x, f.y);
  for (const b of bombs) drawBomb(g, (b.x + 0.5) * ts, (b.y + 0.5) * ts, ts, b.fuse * 20, t);
  for (const a of [...actors].sort((p, q) => (p.y + (p.ty - p.y) * p.prog) - (q.y + (q.ty - q.y) * q.prog))) drawPlayer(g, a.skin, (a.x + (a.tx - a.x) * a.prog + 0.5) * ts, (a.y + (a.ty - a.y) * a.prog + 0.5) * ts, ts, a.face, a.prog < 1, t);
  g.restore();
}
function loop(now) {
  raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
  step(dt); draw();
}
export function startScene(canvas) {
  if (raf) return; cv = canvas; g = cv.getContext('2d'); build(); last = performance.now(); raf = requestAnimationFrame(loop);
  window.addEventListener('resize', onResize);
}
function onResize() { if (raf) build(); }
export function stopScene() { if (raf) cancelAnimationFrame(raf); raf = 0; window.removeEventListener('resize', onResize); }
