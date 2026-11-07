// HOPÍK – boti: vybírají kusy, pokládají je poblíž nejkratší cesty a běží do cíle. Běh řídí zkoušení plánů ve skutečné fyzice (skok po x tikách s rozběhem)
// s ohodnocením podle navigačního grafu (nav.js): bot vybere plán, po kterém dopadne nejblíž cíli a přežije. Obtížnost mění rozhodovací periodu a chybovost.
import * as K from './shared.js';
import * as P from './phys.js';
import * as N from './nav.js';
const { COLS, ROWS } = K;
export const BOT_NAMES = { 1: 'Bot Nováček', 2: 'Bot Skokan', 3: 'Bot Mistr' };
export const LV = { 1: { think: 9, noise: 0.22, blunder: 0.12, aim: 0.45 }, 2: { think: 5, noise: 0.08, blunder: 0.03, aim: 0.8 }, 3: { think: 3, noise: 0, blunder: 0, aim: 1 } };
const IN = P.IN;

/** Navigační graf aktuálního světa (cachovaný: přepočítá se, když se změní kusy nebo kolo). */
export function navOf(g) {
  const key = g.round + ':' + g.pieces.length + ':' + g.stage;
  if (g.navKey !== key) { g.nav = N.buildNav(P.buildWorld(g.stage, g.pieces)); g.navKey = key; g.path = N.pathOf(g.nav); }
  return g.nav;
}
const rnd = (g, n) => Math.floor(g.rng() * n);

// ------------------------------------------------------------------ výběr a pokládání
export function botPick(g, i, level) {
  const free = g.offers.map((o, k) => ({ o, k })).filter((e) => e.o.by < 0); if (!free.length) return -1;
  const hz = free.filter((e) => K.PIECES[e.o.type].kind === 'hazard'); const want = g.rng() < (level === 1 ? 0.35 : 0.6) ? hz : free.filter((e) => K.PIECES[e.o.type].kind !== 'hazard');
  const pool = want.length ? want : free; return pool[rnd(g, pool.length)].k;
}
function rotFor(type, wantFace) { const base = K.PIECES[type].face || 0; return ((wantFace - base) % 4 + 4) % 4; }
/** Kam bot položí svůj kus: { x, y, r } (vždy platné místo, pokud nějaké existuje). */
export function botPlace(g, i, level) {
  const type = g.piece[i], W = g.W; if (!type) return null; const P_ = K.PIECES[type];
  let path = []; if (g.phase === 'place' || g.phase === 'reveal') { navOf(g); path = (g.path || []).filter((k) => k >= 0); }
  path = path.slice(2, Math.max(2, path.length - 1)); const cands = [];
  const aim = path.length && g.rng() < LV[level].aim;
  const node = () => { const k = path[rnd(g, path.length)]; return [k % COLS, Math.floor(k / COLS)]; };
  const corridor = new Set(); for (const k of path) { const cx = k % COLS, cy = Math.floor(k / COLS); for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy >= -3; dy--) corridor.add((cy + dy) * COLS + cx + dx); }
  for (let n = 0; n < 40; n++) {
    if (aim) {
      const [cx, cy] = node();
      if (type === 'spikes') cands.push({ x: cx - rnd(g, 3), y: cy, r: 0 });
      else if (type === 'saw') cands.push({ x: cx - rnd(g, 2), y: cy - 1, r: 0 });
      else if (type === 'blades') cands.push({ x: cx, y: cy - 1 - rnd(g, 2), r: 0 });
      else if (type === 'pendulum') cands.push({ x: cx - 1 + rnd(g, 3), y: cy - 3 - rnd(g, 2), r: 0 });
      else if (type === 'thwomp') cands.push({ x: cx - rnd(g, 2), y: cy - 4 - rnd(g, 2), r: 0 });
      else if (type === 'rsaw') cands.push({ x: cx - rnd(g, 5), y: cy, r: rnd(g, 4) < 3 ? 0 : 1 });
      else if (type === 'fan') cands.push({ x: cx - 1 + rnd(g, 3), y: cy, r: rnd(g, 4) });
      else if (type === 'cannon' || type === 'laser') { const s = g.rng() < 0.5 ? 1 : -1, d = 4 + rnd(g, 6); cands.push({ x: cx + s * d, y: cy, r: s > 0 ? rotFor(type, 3) : rotFor(type, 1) }); }
      else if (type === 'flame') cands.push({ x: cx, y: cy - 1, r: rotFor(type, 2) });
      else if (type === 'bounce') cands.push({ x: cx - rnd(g, 2), y: cy, r: 0 });
      else if (type === 'mover') { const r = rnd(g, 2); cands.push({ x: cx - 4 + rnd(g, 3), y: cy - 1 - rnd(g, 3), r }); }
      else { const r = rnd(g, K.rotatable(type) ? 4 : 1); const up = g.rng() < 0.6; cands.push({ x: cx + rnd(g, 7) - 3, y: cy + (up ? -(2 + rnd(g, 4)) : 2 + rnd(g, 3)), r }); }
    } else cands.push({ x: rnd(g, COLS), y: 2 + rnd(g, ROWS - 4), r: rnd(g, K.rotatable(type) ? 4 : 1) });
  }
  const trial = (c) => { const pc = { id: g.nextId, type, r: c.r, x: c.x, y: c.y, owner: i, round: g.round }; const nv = N.buildNav(P.buildWorld(g.stage, g.pieces.concat([pc]))); return nv.reachable ? nv.dist.get(nv.start) : -1; };
  const keepsReachable = (c) => trial(c) >= 0;
  const hard = []; // mistři vyberou z průchozích kusů ten, který trať nejvíc prodlouží
  const careful = level >= 2 && N.buildNav(P.buildWorld(g.stage, g.pieces)).reachable; let checks = 6;   // chytřejší boti nezničí trať úplně (jinak se nedají získat body)
  for (const c of cands) {
    if (!P.canPlace(W, type, c.r, c.x, c.y)) continue;
    if (P_.kind === 'solid' || type === 'mover') {   // platforma nesmí zasypat cestu
      let bad = false; for (const [dx, dy] of K.pieceCells(type, c.r)) if (corridor.has((c.y + dy) * COLS + c.x + dx) && type !== 'mover') { bad = true; break; }
      if (bad && g.rng() < 0.9) continue;
    }
    if (!careful) return c;
    if (checks-- > 0) { const d = trial(c); if (d >= 0) { if (level < 3) return c; hard.push([d, c]); if (hard.length >= 4) break; } }
  }
  if (hard.length) return hard.sort((a, b) => b[0] - a[0])[0][1];
  for (let n = 0; n < 300; n++) {
    const c = { x: rnd(g, COLS), y: rnd(g, ROWS), r: rnd(g, 4) }; if (!P.canPlace(W, type, c.r, c.x, c.y)) continue;
    if (!careful || (checks-- > -4 && keepsReachable(c))) return c;
    if (checks < -4) break;
  }
  return null;
}

// ------------------------------------------------------------------ běh
const T1 = [0, 2, 4, 7, 10, 14], HOLD = [4, 8, 13, 19], WAIT = [0, 8, 16];
function planInput(pl, k) {
  k -= pl.w; if (k < 0) return 0;
  if (k < pl.t1) return pl.d1 > 0 ? IN.R : pl.d1 < 0 ? IN.L : 0;
  const j = k - pl.t1; const dbit = pl.d2 > 0 ? IN.R : pl.d2 < 0 ? IN.L : 0;
  return dbit | (j < pl.h ? IN.J : 0);
}
/** Zkusí plán na kopii těla: { cost, alive } (cost = ticků k cíli, Infinity když nepřežije nebo nedopadne). */
function rollout(g, nav, b0, pl, tk) {
  const W = g.W; const b = P.copyBody(b0); const start = N.keyOf(b.x, b.y); let air = false; const jumpAt = pl.w + pl.t1;
  const noFx = W.noFx; W.noFx = true; let res = { cost: Infinity, alive: 0 };
  for (let k = 0; k < 100; k++) {
    P.stepBody(W, b, planInput(pl, k), tk + k, null);
    if (P.hazardAt(W, b.x, b.y, tk + k, 0.04) !== 0 || b.crush) { res = { cost: Infinity, alive: k }; break; }
    if (P.inGoal(W, b)) { res = { cost: k + 1, alive: k }; break; }
    if (!b.gr) air = true;
    const walk = pl.t1 >= 99;
    if (b.gr && k >= jumpAt && ((air && k > jumpAt) || (walk && k > pl.w + 3))) {
      const nk = N.keyOf(b.x, b.y);
      if (!walk && !air) continue;
      if (nk === start && (k < pl.w + 30)) { if (walk) continue; }
      let d = nav.dist.get(nk); if (d === undefined) d = N.distOf(nav, b.x, b.y);
      if (d === Infinity) d = 600 + (Math.abs(W.stage.goal[0] - b.x) + Math.abs(W.stage.goal[1] - b.y)) * 6;   // neznámé místo (např. pojízdná plošina): hrubý odhad
      res = { cost: k + 1 + d, alive: k }; break;
    }
    res.alive = k;
  }
  W.noFx = noFx; return res;
}
/** Vybere plán pro bota `i` (volá se, když stojí na zemi). */
function choosePlan(g, i, level, tk) {
  const nav = navOf(g), R = g.run, b = R.bodies[i]; const cfg = LV[level];
  const key = N.keyOf(b.x, b.y); let want = 1;
  let bestTo = null, bd = Infinity; for (const [to, c] of nav.edges.get(key) || []) { const d = (nav.dist.get(to) ?? Infinity) + c; if (d < bd) { bd = d; bestTo = to; } }
  if (bestTo !== null) { const tx = bestTo === N.GOAL ? W_goalX(g) : (bestTo % COLS) + 0.5; want = tx >= b.x ? 1 : -1; } else want = W_goalX(g) >= b.x ? 1 : -1;
  const plans = [];
  for (const w of WAIT) {
    for (const d of [want, -want]) plans.push({ w, d1: d, t1: 999, d2: d, h: 0 });
    for (const t1 of T1) for (const d2 of [want, 0, -want]) for (const h of HOLD) plans.push({ w, d1: want, t1, d2, h });
  }
  const scored = [];
  for (const pl of plans) { const r = rollout(g, nav, b, pl, tk); scored.push({ pl, c: r.cost + pl.w * 0.5 + (pl.d1 !== want ? 4 : 0), alive: r.alive }); }
  const ok = scored.filter((s) => s.c < Infinity).sort((a, c) => a.c - c.c);
  if (!ok.length) { const s = scored.sort((a, c) => c.alive - a.alive)[0]; return s ? s.pl : { w: 0, d1: 0, t1: 0, d2: 0, h: 0 }; }
  let pick = ok[0].pl;
  if (cfg.noise && g.rng() < cfg.noise) pick = ok[Math.min(ok.length - 1, rnd(g, 3))].pl;
  if (cfg.blunder && g.rng() < cfg.blunder && pick.h > 0) pick = { ...pick, h: 3 };
  return pick;
}
const W_goalX = (g) => g.W.stage.goal[0] + g.W.stage.goal[2] / 2;
/** Vstup (bity IN) pro bota `i` v tomto ticku. `st` je jeho trvalý stav ({}), obtížnost 1–3. */
export function botInput(g, i, level, st) {
  if (g.phase !== 'run') return 0;
  const R = g.run, b = R.bodies[i], tk = g.rt;
  if (b.gr || b.coy > 0) {
    if (!st.pl || tk >= st.nextAt || st.landed !== true) { st.pl = choosePlan(g, i, level, tk); st.t0 = tk; st.nextAt = tk + LV[level].think; }
    st.landed = true;
  } else {
    if (st.landed) { st.landed = false; }
    if (!st.pl) { st.pl = { w: 0, d1: 1, t1: 999, d2: 1, h: 0 }; st.t0 = tk; }
  }
  return planInput(st.pl, tk - st.t0);
}
