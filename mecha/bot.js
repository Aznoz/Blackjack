// MECHA ARÉNA – umělá inteligence: v každém kroku zkusí všechny legální akce na kopii stavu (s očekávanými hodnotami) a vybere tu s nejlepším ohodnocením.
import * as S from './sim.js';

/** Odhad, kolik poškození za příští kolo udělá strana i na vzdálenost d (hladové plnění tahových bodů a energie). */
function potential(st, i, d) {
  const s = st.sides[i], o = st.sides[1 - i]; let ap = s.st.ap, en = Math.min(s.maxEn, s.en + s.st.regen); const list = [];
  for (const w of s.st.weapons) { if (d < w.rng[0] || d > S.maxRange(s, w)) continue; const ch = Math.max(0.15, Math.min(0.98, (w.acc + (s.st.acc - 72) - (w.fx.arc ? 0 : o.st.evade)) / 100)); const res = Math.max(0, (o.st.res[w.type] || 0) * (1 - (w.fx.pierce || 0)));
    const ex = w.dmg * w.hits * ch * (1 - res) * (1 + 0.5 * (s.st.crit + w.crit) / 100) + (w.fx.burn ? w.fx.burn * w.fx.burnDmg * 0.5 : 0) + (w.fx.shock ? 8 * w.fx.shock : 0); list.push({ ex, ap: w.ap, en: w.en }); }
  list.sort((a, b) => b.ex / b.ap - a.ex / a.ap); let sum = 0;
  for (const w of list) if (ap >= w.ap && en >= w.en) { ap -= w.ap; en -= w.en; sum += w.ex; }
  return sum;
}
function score(st, i) {
  const s = st.sides[i], o = st.sides[1 - i]; if (st.over) return st.winner === i ? 1e6 : st.winner === 2 ? 0 : -1e6;
  const d = S.dist(st); const mine = potential(st, i, d), theirs = potential(st, 1 - i, d);
  const hp = (s.hp + s.sh) / s.maxHp * 100 - (o.hp + o.sh) / o.maxHp * 100;
  const dr = (s.drone ? 12 + s.drone.hp / s.drone.maxHp * 8 : 0) - (o.drone ? 8 : 0);
  return hp * 2.2 + (mine - theirs) * 0.45 + dr + s.en * 0.15 - (o.en * 0.1) + (s.guard ? 2 : 0);
}
/** Naplánuje a vrátí JEDNU akci pro stranu i (nebo { t: 'end' }). level 1 = chybuje a váhá, 3 = hraje nejlépe. */
export function chooseAction(st, i, level = 2, rng = Math.random) {
  const legal = S.legalActions(st, i); if (legal.length === 1) return legal[0];
  const base = score(st, i); let best = { t: 'end' }, bestV = base - (level >= 3 ? 0 : 0);
  const scored = [];
  for (const a of legal) {
    if (a.t === 'end') continue; const c = S.clone(st); S.apply(c, i, a, { ev: true }); let v = score(c, i);
    if (a.t === 'fire') v += 4;                   // střílet je dobré, i když to vypadá stejně
    if (a.t === 'jump') v -= 2.5; if (a.t === 'guard') v -= 1;
    scored.push({ a, v });
  }
  scored.sort((x, y) => y.v - x.v);
  const noise = level === 1 ? 30 : level === 2 ? 8 : 0;
  if (level === 1 && rng() < 0.18) return legal[Math.floor(rng() * legal.length)];
  let pick = null, pv = -Infinity;
  for (const s of scored.slice(0, 6)) { const v = s.v + (noise ? (rng() - 0.5) * noise : 0); if (v > pv) { pv = v; pick = s; } }
  if (pick && pick.v > bestV - 6) return pick.a;   // drobně horší akce se vyplatí, když se aspoň něco děje (nepřetáčet tah naprázdno)
  return best;
}
/** Odehraje celý tah bota; vrátí pole akcí (bez závěrečného end). */
export function planTurn(st, i, level = 2, rng = Math.random) {
  const c = S.clone(st), acts = [];
  for (let k = 0; k < 12 && !c.over && c.turn === i; k++) { const a = chooseAction(c, i, level, rng); if (a.t === 'end') break; acts.push(a); S.apply(c, i, a); }
  return acts;
}
