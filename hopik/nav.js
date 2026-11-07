// HOPÍK – navigační graf pro boty: uzly jsou políčka, na kterých se dá stát, hrany se zjišťují zkoušením skutečné fyziky (chůze a skoky různé délky).
// Z grafu vyjde vzdálenost k cíli (v ticích) pro každý dosažitelný uzel; bot podle ní vybírá, kam skočit. Pojízdné plošiny graf nezná (bot po nich nepočítá).
import * as K from './shared.js';
import * as P from './phys.js';
const { COLS, ROWS } = K;
const GOAL = -1;
export const keyOf = (x, y) => Math.floor(y) * COLS + Math.floor(x);

function solidAt(W, x, y) { return x < 0 || x >= COLS ? true : y < 0 || y >= ROWS ? false : W.g[y * COLS + x] > 0 && !W.gone[y * COLS + x]; }
/** Dá se na políčku (cx, cy) stát? (pod ním je pevná zem, tělo se vejde a nic nezabíjí) */
export function standable(W, cx, cy) {
  if (cx < 0 || cx >= COLS || cy < 0 || cy + 1 >= ROWS) return false;
  if (!solidAt(W, cx, cy + 1) || solidAt(W, cx, cy)) return false;
  const b = P.newBody(cx + 0.5, cy + 1 - P.PH / 2 - 0.001); return P.fitsAt(W, b.x, b.y, 0) && P.hazardAt(W, b.x, b.y, 0) === 0;
}
function bodyAt(cx, cy) { const b = P.newBody(cx + 0.5, cy + 1 - P.PH / 2 - 0.001); b.gr = true; b.coy = P.COYOTE_T; return b; }

/** Zkusí z uzlu `key` všechny chůze a skoky a vrátí hrany [{ to, cost }] (to = klíč uzlu nebo GOAL). */
function expand(W, key) {
  const cx = key % COLS, cy = Math.floor(key / COLS); const out = new Map();
  const add = (to, cost) => { const o = out.get(to); if (o === undefined || cost < o) out.set(to, cost); };
  const run = (dirBit, hold, maxT) => {
    const b = bodyAt(cx, cy); let air = false;
    for (let k = 0; k < maxT; k++) {
      P.stepBody(W, b, dirBit | (k < hold ? P.IN.J : 0), k + 1, null);
      if (P.hazardAt(W, b.x, b.y, k + 1) !== 0) return;
      if (P.inGoal(W, b)) return add(GOAL, k + 1);
      if (!b.gr) air = true;
      if (b.gr) { const nk = keyOf(b.x, b.y); if (air) { if (nk !== key) add(nk, k + 1); return; } if (nk !== key) { add(nk, k + 1); return; } }
    }
  };
  for (const d of [P.IN.L, P.IN.R]) {
    run(d, 0, 22);                                           // chůze (případně pád z okraje)
    for (const h of [2, 4, 7, 10, 14, 19]) run(d, h, 70);    // skoky různě vysoké
  }
  for (const h of [6, 12, 19]) run(0, h, 60);                // skok na místě (pod překážku, na zeď)
  return out;
}

/** Postaví graf z místa startu. Vrací { dist: Map(klíč → ticků k cíli), edges, start, reachable }. */
export function buildNav(W) {
  const W2 = { ...W, movers: [], cannons: [], flames: [], noFx: true };   // pohyblivé a časované věci graf nezná (bot se jim vyhýbá až za běhu)
  const S = W.stage; const sx = Math.floor(S.spawn[0]), sy = Math.floor(S.spawn[1] - P.PH / 2);
  const start = sy * COLS + sx; const edges = new Map(); const queue = [start]; const seen = new Set([start]);
  while (queue.length) {
    const k = queue.pop(); if (!standable(W2, k % COLS, Math.floor(k / COLS))) { edges.set(k, new Map()); continue; }
    const e = expand(W2, k); edges.set(k, e);
    for (const to of e.keys()) if (to !== GOAL && !seen.has(to)) { seen.add(to); queue.push(to); }
  }
  // zpětná Dijkstra od cíle
  const rev = new Map(); for (const [k, e] of edges) for (const [to, c] of e) { if (!rev.has(to)) rev.set(to, []); rev.get(to).push([k, c]); }
  const dist = new Map([[GOAL, 0]]); const open = new Set([GOAL]);
  while (open.size) {
    let best = null, bd = Infinity; for (const k of open) { const d = dist.get(k); if (d < bd) { bd = d; best = k; } } open.delete(best);
    for (const [from, c] of rev.get(best) || []) { const nd = bd + c; if (nd < (dist.has(from) ? dist.get(from) : Infinity)) { dist.set(from, nd); open.add(from); } }
  }
  return { dist, edges, start, reachable: dist.has(start), goal: GOAL };
}
/** Nejkratší cesta ze startu k cíli jako pole klíčů uzlů (prázdné, když cíl není dosažitelný). */
export function pathOf(nav, from = nav.start) {
  if (!nav.dist.has(from)) return []; const out = [from]; let k = from;
  for (let i = 0; i < 400 && k !== GOAL; i++) {
    let best = null, bd = Infinity; for (const [to, c] of nav.edges.get(k) || []) { const d = (nav.dist.get(to) ?? Infinity) + c; if (d < bd) { bd = d; best = to; } }
    if (best === null || out.includes(best)) break; out.push(best); k = best;
  }
  return out;
}
export const distOf = (nav, x, y) => { const d = nav.dist.get(keyOf(x, y)); return d === undefined ? Infinity : d; };
export { GOAL };
