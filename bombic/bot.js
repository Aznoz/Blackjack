// BOMBIC – bot: čte mapu nebezpečí (kdy kterým polem proletí plamen), uteče z ohrožení, sbírá předměty, bombou rozbíjí pařezy
// a láká soupeře do pasti. Bomby pokládá jen tehdy, když má jistou cestu do bezpečí. Obtížnost mění rychlost reakce a odvahu.
import * as K from './shared.js';
import { DIRS, tileAt, bombOcc, cellOf, FLAME_T } from './sim.js';
const { COLS, ROWS, T, idx } = K;
const N = COLS * ROWS;

export const BOT_NAMES = { 1: 'Bot Nováček', 2: 'Bot Bojovník', 3: 'Bot Mistr' };
export const BOT_THINK = { 1: 9, 2: 6, 3: 5 };           // jak často (v tiscích) bot přehodnocuje
const REACT = { 1: 16, 2: 28, 3: 44 };                    // z jak daleka (tiky do výbuchu) si ohrožení všimne
const MISTAKE = { 1: 0.3, 2: 0.16, 3: 0.02 };              // šance, že tah promrhá blouděním
const BOMB_P = { 1: 0.35, 2: 0.75, 3: 1 };                // šance, že využije příležitost k bombě
const HUNT = { 1: 0, 2: 0.5, 3: 1 };                      // zájem o honění soupeřů

export function blastCells(s, cx, cy, range) {
  const out = [[cx, cy]];
  for (let d = 1; d <= 4; d++) {
    const [dx, dy] = DIRS[d];
    for (let r = 1; r <= range; r++) {
      const x = cx + dx * r, y = cy + dy * r; const t = tileAt(s, x, y);
      if (t === T.STONE) break; out.push([x, y]); if (t === T.STUMP || bombOcc(s, x, y)) break;
    }
  }
  return out;
}

/** Pro každé pole seznam [od, do] (v tících od teď), kdy tam bude plamen. */
function buildDanger(s, extra) {
  const dg = Array.from({ length: N }, () => null);
  const add = (x, y, a, b) => { const k = idx(x, y); (dg[k] || (dg[k] = [])).push([a, b]); };
  const bombs = s.bombs.map((b) => ({ b, t: Math.max(0, b.fuse), cells: null }));
  if (extra) bombs.push({ b: extra, t: extra.fuse, cells: null });
  for (const o of bombs) o.cells = blastCells(s, o.b.moving && o.b.prog >= 0.5 ? o.b.tx : o.b.cx, o.b.moving && o.b.prog >= 0.5 ? o.b.ty : o.b.cy, o.b.range);
  for (let it = 0; it < 4; it++) for (const a of bombs) for (const [x, y] of a.cells) for (const c of bombs) if (c !== a && c.b.cx === x && c.b.cy === y && a.t < c.t) c.t = a.t;   // řetězení
  for (const o of bombs) for (const [x, y] of o.cells) add(x, y, o.t, o.t + FLAME_T);
  for (const f of s.flames) add(f.x, f.y, 0, f.until - s.tick);
  for (const w of s.warns) add(w.x, w.y, w.at - s.tick, 1e9);
  return dg;
}
const deadly = (dg, k, a, st) => { const l = dg[k]; if (!l) return false; for (const [t0, t1] of l) if (t0 <= a + st + 1 && t1 >= a - 1) return true; return false; };
const permSafe = (dg, k, a) => { const l = dg[k]; if (!l) return true; for (const [, t1] of l) if (t1 >= a - 1) return false; return true; };

/** Prohledávání do šířky: nejkratší bezpečné cesty z pole `start` (čas příchodu v tících, první krok). */
function bfs(s, p, dg, start, st) {
  const dist = new Int16Array(N).fill(-1), first = new Uint8Array(N); const q = [start]; dist[start] = 0;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h]; const cx = cur % COLS, cy = (cur - cx) / COLS;
    for (let d = 1; d <= 4; d++) {
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1]; if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const k = idx(nx, ny); if (dist[k] >= 0 || s.grid[k] !== T.FLOOR || bombOcc(s, nx, ny)) continue;
      const a = Math.round((dist[cur] + 1) * st); if (deadly(dg, k, a, st)) continue;
      dist[k] = dist[cur] + 1; first[k] = cur === start ? d : first[cur]; q.push(k);
    }
  }
  return { dist, first, order: q };
}

function escapeDir(s, p, dg, st) {
  const start = idx(Math.floor(p.x), Math.floor(p.y)); const r = bfs(s, p, dg, start, st);
  for (const k of r.order) if (k !== start && permSafe(dg, k, Math.round(r.dist[k] * st))) return { d: r.first[k], steps: r.dist[k] };
  return null;
}

export function botThink(s, i, lvl) {
  const p = s.pl[i]; const none = { d: 0, bomb: false };
  if (!p.alive || s.freeze > 0) return none;
  const rnd = s.rng; const st = 1 / (K.speedOf(p.spLv) * K.DT);        // tiků na jedno pole
  const cx = Math.floor(p.x), cy = Math.floor(p.y), here = idx(cx, cy);
  const dg = buildDanger(s);
  // 1) ohrožení: utéct
  const l = dg[here];
  if (l && l.some(([t0, t1]) => t0 <= REACT[lvl] && t1 >= 0)) {
    const e = escapeDir(s, p, dg, st);
    if (e) return { d: e.d, bomb: false };
    return { d: 1 + Math.floor(rnd() * 4), bomb: false };               // není kam, aspoň se hýbej
  }
  if (rnd() < MISTAKE[lvl] * 0.5) return { d: Math.floor(rnd() * 5), bomb: false };
  const enemies = s.pl.filter((q) => q.alive && q.i !== i);
  const canBomb = p.placed < p.bombsMax && !(p.curse && p.curse.k === 'nobomb');
  const range = p.curse && p.curse.k === 'short' ? 1 : p.range;
  const value = (x, y) => {                                              // co by bomba z pole (x,y) zničila
    let v = 0; for (const [bx, by] of blastCells(s, x, y, range)) { if (tileAt(s, bx, by) === T.STUMP) v += 1; for (const e of enemies) if (Math.floor(e.x) === bx && Math.floor(e.y) === by) v += 6; }
    return v;
  };
  // 2) bomba tady, když něco zničí a je kam utéct
  if (canBomb && rnd() < BOMB_P[lvl] && value(cx, cy) > 0) {
    const fake = { cx, cy, tx: cx, ty: cy, moving: false, prog: 0, range, fuse: K.FUSE_S / K.DT };
    const dg2 = buildDanger(s, fake); const e = escapeDir(s, p, dg2, st);
    if (e && e.steps * st < fake.fuse - 6) return { d: e.d, bomb: true };
  }
  // 3) kam jít: předmět, pak místo vhodné pro bombu, pak soupeř
  const r = bfs(s, p, dg, here, st); let best = -1, bestScore = 1e9;
  for (const k of r.order) {
    if (k === here) continue; const x = k % COLS, y = (k - x) / COLS; let sc = r.dist[k];
    const it = s.items.find((q) => q.x === x && q.y === y);
    if (it) { if ((it.type === 'skull' && lvl >= 2) || it.type === 'skate') continue; sc -= 6; if (lvl === 1 && r.dist[k] > 6) continue; }
    else if (canBomb && lvl >= 1 && r.dist[k] <= 16 && value(x, y) > 0) sc += 1; else if (lvl >= 2 && rnd() < HUNT[lvl] && enemies.some((e) => Math.abs(Math.floor(e.x) - x) + Math.abs(Math.floor(e.y) - y) <= 2)) sc += 4;
    else continue;
    if (sc < bestScore) { bestScore = sc; best = k; }
  }
  if (best >= 0) {
    // krok po nejkratší cestě k cíli: dopočítáme zpětně přes první krok
    return { d: r.first[best], bomb: false };
  }
  // 4) bloudění po bezpečných polích
  const opts = []; for (let d = 1; d <= 4; d++) { const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1]; const k = idx(nx, ny); if (s.grid[k] === T.FLOOR && !bombOcc(s, nx, ny) && !deadly(dg, k, st, st)) opts.push(d); }
  return { d: opts.length ? opts[Math.floor(rnd() * opts.length)] : 0, bomb: false };
}
