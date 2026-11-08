// MINIGOLF – průběh zápasu na serveru: jamky za sebou, všichni hrají naráz (míčky se nesrážejí). Pohyb míčku člověka počítá jeho prohlížeč (stejná fyzika z phys.js)
// a server přijímá hlášení; boti běží přímo tady. Server hlídá počet ran, dokončení jamky, časový limit a bodování (méně ran = lépe).
import * as K from './shared.js';
import * as P from './phys.js';
import * as C from './courses.js';
import * as B from './bot.js';
export const TICK = 1 / 30;

function rngOf(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const r2 = (v) => Math.round(v * 100) / 100;

export function newGame(players, seed, course, cfg) {
  cfg = K.cleanCfg(cfg);
  const g = { seed, course, cfg, holes: C.holeList(course, cfg.holes, seed), hole: -1, phase: 'intro', t: 0, pt: 0, rng: rngOf(seed ^ 0x9e3779b9), ev: [], over: null, history: [], deadline: cfg.time, first: -1,
    players: players.map((p) => ({ name: p.name, color: p.color, bot: p.bot || 0, left: false, total: 0, aces: 0, fins: 0, rows: [] })) };
  startHole(g, 0); return g;
}
export function startHole(g, k) {
  g.hole = k; const [c, h] = g.holes[k]; const def = C.holeDef(c, h);
  g.def = def; g.W = P.buildWorld(def); g.df = P.distField(g.W); g.par = def.par; g.cap = K.capOf(def.par); g.phase = 'intro'; g.t = 0; g.pt = 0; g.deadline = g.cfg.time; g.first = -1; g.res = null;
  const [tx, tz] = g.W.tee;
  for (const p of g.players) Object.assign(p, { x: tx, z: tz, vx: 0, vz: 0, m: 0, strokes: 0, done: false, doneAt: 0, lastX: tx, lastZ: tz, lastShot: -9, penOk: false, pick: false, ball: null, think: 0 });
  g.ev.push(['ph']);
}
const allDone = (g) => g.players.every((p) => p.done || p.left);
function finishPlayer(g, i, why) {
  const p = g.players[i]; if (p.done) return; p.done = true; p.doneAt = r2(g.pt); p.m = 0; p.vx = p.vz = 0;
  const ok = why === 'sink'; p.sunk = ok;
  if (ok && g.first < 0) { g.first = i; g.deadline = Math.min(g.deadline, g.pt + g.cfg.grace); }
  g.ev.push(['fin', i, ok ? 1 : 0, p.strokes]);
}
function endHole(g) {
  const rows = g.players.map((p) => { const sunk = p.done && p.sunk; const s = sunk ? p.strokes : g.cap; return { s, fin: sunk, t: p.doneAt, ace: sunk && p.strokes === 1 }; });
  g.players.forEach((p, i) => { p.total += rows[i].s; p.rows.push(rows[i].s); if (rows[i].fin) p.fins++; if (rows[i].ace) p.aces++; });
  g.history.push({ hole: g.hole, par: g.par, rows });
  g.phase = 'score'; g.t = 0; g.res = rows; g.ev.push(['ph']);
}
function nextHole(g) {
  if (g.hole + 1 < g.holes.length) return startHole(g, g.hole + 1);
  const tot = g.players.map((p) => p.total); const best = Math.min(...tot);
  g.over = { winners: g.players.map((p, i) => i).filter((i) => tot[i] === best && !g.players[i].left), totals: tot };
  if (!g.over.winners.length) g.over.winners = g.players.map((p, i) => i).filter((i) => tot[i] === best);
  g.phase = 'over'; g.ev.push(['ph']);
}

// ------------------------------------------------------------------ hlášení hráčů
const near = (g, x, z, d) => Math.hypot(x - g.W.cup[0], z - g.W.cup[1]) < d;
/** Rána hráče: server přičte ránu a pošle ji ostatním (ať vidí úder). */
export function shot(g, i, m) {
  const p = g.players[i]; if (!p || g.phase !== 'play' || p.done || p.left || p.strokes >= g.cap) return false;
  if (g.pt - p.lastShot < 0.3) return false;
  const x = Number(m.x), z = Number(m.z), a = Number(m.a), pw = K.clamp(Number(m.p), 0, 1); if (![x, z, a, pw].every(Number.isFinite)) return false;
  p.strokes++; p.lastShot = g.pt; p.penOk = true; p.lastX = K.clamp(x, 0, g.W.w); p.lastZ = K.clamp(z, 0, g.W.h); p.x = p.lastX; p.z = p.lastZ; p.m = 1;
  g.ev.push(['shot', i, r2(p.x), r2(p.z), r2(a), r2(pw), p.strokes]); return true;
}
/** Hlášení polohy míčku (x, z, vx, vz, m = 1 pohybuje se). */
export function report(g, i, m) {
  const p = g.players[i]; if (!p || g.phase !== 'play' || p.done || p.left || p.bot) return;
  const x = Number(m.x), z = Number(m.z); if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  p.x = K.clamp(x, 0, g.W.w); p.z = K.clamp(z, 0, g.W.h); p.vx = K.clamp(Number(m.vx) || 0, -40, 40); p.vz = K.clamp(Number(m.vz) || 0, -40, 40); p.m = m.m ? 1 : 0;
  if (!p.m && p.strokes >= g.cap) finishPlayer(g, i, 'pickup');   // vyčerpané rány: míček se zvedne
}
/** Míček spadl do vody/lávy: penalizační rána (nejvýš jedna za ránu) a návrat na místo posledního úderu. */
export function penalty(g, i) {
  const p = g.players[i]; if (!p || g.phase !== 'play' || p.done || p.left || !p.penOk) return false;
  p.penOk = false; p.strokes = Math.min(g.cap, p.strokes + 1); p.x = p.lastX; p.z = p.lastZ; p.vx = p.vz = 0; p.m = 0;
  g.ev.push(['pen', i, p.strokes]); if (p.strokes >= g.cap) finishPlayer(g, i, 'pickup'); return true;
}
/** Míček spadl do jamky (hlásí prohlížeč; server ověří, že byl poblíž). */
export function sunk(g, i, m) {
  const p = g.players[i]; if (!p || g.phase !== 'play' || p.done || p.left || p.strokes < 1) return false;
  const x = Number.isFinite(Number(m.x)) ? Number(m.x) : p.x, z = Number.isFinite(Number(m.z)) ? Number(m.z) : p.z;
  if (!near(g, x, z, 2.5) && !near(g, p.x, p.z, 2.5)) return false;
  p.x = g.W.cup[0]; p.z = g.W.cup[1]; finishPlayer(g, i, 'sink'); return true;
}
export function forfeit(g, i) { const p = g.players[i]; if (!p) return; p.left = true; if (g.phase === 'play' && !p.done) { p.done = true; p.sunk = false; g.ev.push(['fin', i, 0, p.strokes]); } }

// ------------------------------------------------------------------ boti
function botTurn(g, i) {
  const p = g.players[i]; if (p.done || p.left) return;
  if (!p.ball) { p.ball = P.newBall(p.x, p.z); p.think = (B.LV[p.bot] || B.LV[2]).think[0] + g.rng() * ((B.LV[p.bot] || B.LV[2]).think[1] - (B.LV[p.bot] || B.LV[2]).think[0]) * 0.5; }
  const b = p.ball;
  if (p.m) {   // míček se kutálí: čtyři kroky fyziky na tik
    for (let k = 0; k < 4 && !p.done; k++) {
      const ev = P.stepBall(g.W, b, g.pt + k * P.DT);
      if (ev === 'sink') { p.x = b.x; p.z = b.z; finishPlayer(g, i, 'sink'); return; }
      if (ev === 'hz') { p.penOk = true; penalty(g, i); b.x = p.lastX; b.z = p.lastZ; b.vx = b.vz = 0; b.still = 99; b.sunk = false; p.m = 0; p.think = 0.8; return; }
      if (P.isRest(b)) { p.m = 0; p.think = thinkOf(g, p); break; }
    }
    p.x = b.x; p.z = b.z; p.vx = b.vx; p.vz = b.vz;
    if (!p.m && p.strokes >= g.cap) finishPlayer(g, i, 'pickup');
    return;
  }
  p.think -= TICK; if (p.think > 0 || g.pt < 0.5) return;
  if (p.strokes >= g.cap) return finishPlayer(g, i, 'pickup');
  const s = B.chooseShot(g.W, g.df, p.x, p.z, g.pt, p.bot, g.rng);
  b.x = p.x; b.z = p.z; b.vx = b.vz = 0; b.sunk = false; b.still = 0; P.shoot(b, s.ang, s.pow);
  shot(g, i, { x: p.x, z: p.z, a: s.ang, p: s.pow });
}
const thinkOf = (g, p) => { const lv = B.LV[p.bot] || B.LV[2]; return lv.think[0] + g.rng() * (lv.think[1] - lv.think[0]); };

/** Jeden tik hry (1/30 s). */
export function tick(g) {
  if (g.phase === 'intro') { g.t += TICK; if (g.t >= K.INTRO_S) { g.phase = 'play'; g.pt = 0; g.ev.push(['ph']); } return; }
  if (g.phase === 'play') {
    g.pt += TICK;
    g.players.forEach((p, i) => { if (p.bot) botTurn(g, i); });
    if (allDone(g) || g.pt >= g.deadline) { g.players.forEach((p, i) => { if (!p.done) finishPlayer(g, i, 'time'); }); endHole(g); }
    return;
  }
  if (g.phase === 'score') { g.t += TICK; if (g.t >= K.SCORE_S) nextHole(g); return; }
}
export const clearEvents = (g) => { g.ev = []; };
/** Snímek pro klienty: poloha a stav míčků. */
export const snap = (g) => ({ gt: r2(g.pt), r: Math.max(0, Math.round(g.deadline - g.pt)), b: g.players.map((p) => [r2(p.x), r2(p.z), r2(p.vx), r2(p.vz), p.m, p.strokes, p.done ? (p.sunk ? 2 : 1) : 0]) });
