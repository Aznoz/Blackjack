// MECHA ARÉNA – souboj dvou robotů po tazích (server i klient). Bez vedlejších účinků kromě měnění stavu předaného do funkcí.
// Robot má tahové body (AP), energii, životy, štít. Akce: střelba (každá zbraň jednou za kolo), chůze, skok, vyslání dronu (jednou za zápas),
// obrana, oprava, konec tahu. Náhoda je v čísle st.r (mulberry32), takže stejný zápas jde zopakovat.
import { ARENA, BASE } from './shared.js';

export const ROUND_LIMIT = 30;
export const GUARD_MUL = 0.75, CRIT_MUL = 1.5, JUMP_EVADE = 15;

export function rnd(st) { let t = (st.r = (st.r + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

function mkSide(m, x) {
  const s = m.stats;
  return { name: m.name || 'Robot', st: s, x, hp: s.hp, maxHp: s.hp, sh: s.shield, maxSh: s.shield, en: s.en, maxEn: s.en, ap: 0, used: {}, guard: false, ev: 0, burn: null, shocked: false, repLeft: s.repUses, drone: null, droneUsed: false };
}
/** m = { name, stats } (stats z mechStats). first = kdo začíná (0/1), jinak podle semínka. */
export function newBattle(mA, mB, seed = 1, first = -1) {
  const st = { r: (seed >>> 0) || 1, turn: 0, round: 1, over: false, winner: -1, sides: [mkSide(mA, ARENA.startA), mkSide(mB, ARENA.startB)] };
  st.turn = first === 0 || first === 1 ? first : (rnd(st) < 0.5 ? 0 : 1);
  const ev = []; beginTurn(st, st.turn, ev); return { st, ev };
}
export const dist = (st) => Math.abs(st.sides[0].x - st.sides[1].x);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;

export function snap(st) {
  return { turn: st.turn, round: st.round, over: st.over, winner: st.winner, sides: st.sides.map((s) => ({ x: s.x, hp: r1(s.hp), maxHp: s.maxHp, sh: r1(s.sh), maxSh: s.maxSh, en: r1(s.en), maxEn: s.maxEn, ap: s.ap, apMax: s.st.ap, used: Object.keys(s.used), guard: s.guard, ev: s.ev, burn: s.burn ? { ...s.burn } : null, shocked: s.shocked, repLeft: s.repLeft, droneUsed: s.droneUsed,
    drone: s.drone ? { id: s.drone.id, dtype: s.drone.dtype, hp: r1(s.drone.hp), maxHp: s.drone.maxHp } : null })) };
}
const effEvade = (s) => clamp(s.st.evade + s.ev, 0, 75);
const jamOf = (st, i) => { const o = st.sides[1 - i].drone; return o && o.dtype === 'jam' ? o.jam : 0; };
export const maxRange = (s, w) => (w.rng[1] > 1 ? w.rng[1] + s.st.rngb : w.rng[1]);

function beginTurn(st, i, ev) {
  const s = st.sides[i];
  s.ap = Math.max(1, s.st.ap - (s.shocked ? 1 : 0)); const wasShocked = s.shocked; s.shocked = false;
  s.en = Math.min(s.maxEn, s.en + s.st.regen); s.sh = Math.min(s.maxSh, s.sh + s.st.shieldRegen);
  s.used = {}; s.guard = false; s.ev = 0;
  if (s.burn) { const d = s.burn.d; s.hp -= d; s.burn.t -= 1; const t = s.burn.t; if (t <= 0) s.burn = null; ev.push({ k: 'burn', i, d, t }); }
  ev.push({ k: 'turn', i, round: st.round, shock: wasShocked });
  fin(st, ev);
}
function fin(st, ev) {
  if (st.over) return;
  const [a, b] = st.sides;
  if (a.hp <= 0 || b.hp <= 0) { st.over = true; st.winner = a.hp <= 0 && b.hp <= 0 ? 2 : a.hp <= 0 ? 1 : 0; }
  ev.push({ k: 'snap', s: snap(st) });
  if (st.over) ev.push({ k: 'end', winner: st.winner });
}
export function legalActions(st, i) {
  const s = st.sides[i], o = st.sides[1 - i], out = [];
  if (st.over || st.turn !== i) return out;
  const d = dist(st);
  for (const w of s.st.weapons) {
    if (s.used[w.slot] || s.ap < w.ap || s.en < w.en) continue;
    const inR = d >= w.rng[0] && d <= maxRange(s, w);
    if (inR) { out.push({ t: 'fire', slot: w.slot, tgt: 'mech' }); if (o.drone) out.push({ t: 'fire', slot: w.slot, tgt: 'drone' }); }
  }
  if (s.ap >= 1) {
    for (const dir of [-1, 1]) { const nx = stepTo(st, i, dir, s.st.spd); if (nx !== s.x) out.push({ t: 'move', dir }); }
    if (s.en >= 2) for (const dir of [-1, 1]) for (let n = 1; n <= s.st.jmp; n++) { const nx = s.x + dir * n; if (nx >= 0 && nx < ARENA.len && nx !== o.x) out.push({ t: 'jump', dir, n }); }
    if (s.st.tele && !s.used.tele && s.en >= s.st.teleEn) for (let x = 0; x < ARENA.len; x++) if (x !== s.x && x !== o.x && Math.abs(x - s.x) <= s.st.tele) out.push({ t: 'tele', x });
    if (!s.guard) out.push({ t: 'guard' });
    if (s.st.rep > 0 && s.repLeft > 0 && s.hp < s.maxHp && s.en >= 2) out.push({ t: 'repair' });
  }
  if (s.st.drone && !s.droneUsed && s.ap >= s.st.drone.ap && s.en >= s.st.drone.en) out.push({ t: 'drone' });
  out.push({ t: 'end' });
  return out;
}
function stepTo(st, i, dir, n) {   // kam až dojde při chůzi (nepřejde soupeře ani okraj arény)
  const s = st.sides[i], o = st.sides[1 - i]; let x = s.x;
  for (let k = 0; k < n; k++) { const nx = x + dir; if (nx < 0 || nx >= ARENA.len || nx === o.x) break; x = nx; }
  return x;
}
export function isLegal(st, i, a) {
  if (!a || typeof a.t !== 'string') return false;
  return legalActions(st, i).some((l) => l.t === a.t && (a.t !== 'fire' || (l.slot === a.slot && l.tgt === (a.tgt === 'drone' ? 'drone' : 'mech'))) && (a.t !== 'move' || l.dir === a.dir) && (a.t !== 'jump' || (l.dir === a.dir && l.n === a.n)) && (a.t !== 'tele' || l.x === a.x));
}

/** Provede akci (musí být legální). opts.ev = očekávané hodnoty místo losování (plánování bota). Vrací pole událostí (poslední je snap). */
export function apply(st, i, a, opts = {}) {
  const ev = []; if (!isLegal(st, i, a)) return null;
  const s = st.sides[i], o = st.sides[1 - i];
  switch (a.t) {
    case 'fire': fire(st, i, a, ev, !!opts.ev); break;
    case 'move': { s.ap -= 1; const from = s.x; s.x = stepTo(st, i, a.dir, s.st.spd); ev.push({ k: 'move', i, from, to: s.x }); break; }
    case 'jump': { s.ap -= 1; s.en -= 2; const from = s.x; s.x += a.dir * a.n; s.ev = JUMP_EVADE; ev.push({ k: 'jump', i, from, to: s.x }); break; }
    case 'tele': { s.ap -= 1; s.en -= s.st.teleEn; s.used.tele = true; const from = s.x; s.x = a.x; ev.push({ k: 'tele', i, from, to: s.x }); break; }
    case 'guard': s.ap -= 1; s.guard = true; ev.push({ k: 'guard', i }); break;
    case 'repair': { s.ap -= 1; s.en -= 2; s.repLeft -= 1; const h = Math.min(s.st.rep, s.maxHp - s.hp); s.hp += h; ev.push({ k: 'repair', i, h }); break; }
    case 'drone': { const d = s.st.drone; s.ap -= d.ap; s.en -= d.en; s.droneUsed = true; s.drone = { ...d, hp: d.hp, maxHp: d.hp }; ev.push({ k: 'deploy', i, id: d.id }); break; }
    case 'end': endTurn(st, i, ev, !!opts.ev); return ev;
    default: return null;
  }
  fin(st, ev); return ev;
}
function hitChance(att, w, tgtEvade, jam, arc) { return clamp(w.acc + (att.st.acc - BASE.acc) - (arc ? 0 : tgtEvade) - jam, 15, 98); }
function dealToMech(t, raw, type, pierce) {
  const res = Math.max(0, (t.st.res[type] || 0) * (1 - (pierce || 0)));
  let d = raw * (1 - res) * (t.guard ? GUARD_MUL : 1); d = Math.max(1, d);
  const ab = Math.min(t.sh, d); t.sh -= ab; const hpd = d - ab; t.hp -= hpd; return { hp: hpd, ab };
}
function fire(st, i, a, ev, evMode) {
  const s = st.sides[i], o = st.sides[1 - i], w = s.st.weapons.find((x) => x.slot === a.slot);
  s.ap -= w.ap; s.en -= w.en; s.used[w.slot] = true;
  const arc = !!w.fx.arc, onDrone = a.tgt === 'drone' && o.drone; const jam = jamOf(st, i);
  const chance = hitChance(s, w, onDrone ? 10 : effEvade(o), jam, arc);
  const critP = clamp(s.st.crit + w.crit, 0, 90) / 100;
  const hits = []; let landed = 0;
  for (let n = 0; n < w.hits; n++) {
    let hit, crit, mul;
    if (evMode) { hit = true; crit = false; mul = (chance / 100) * (1 + (CRIT_MUL - 1) * critP); } else { hit = rnd(st) * 100 < chance; crit = hit && rnd(st) < critP; mul = crit ? CRIT_MUL : 1; }
    if (!hit) { hits.push({ h: 0 }); continue; }
    landed++;
    if (onDrone) { const d = Math.max(1, w.dmg * mul); const dd = Math.min(o.drone.hp, d); o.drone.hp -= d; hits.push({ h: 1, c: crit ? 1 : 0, d: r1(dd), a: 0 }); }
    else { const r = dealToMech(o, w.dmg * mul, w.type, w.fx.pierce); hits.push({ h: 1, c: crit ? 1 : 0, d: r1(r.hp), a: r1(r.ab) }); }
  }
  const fx = {};
  if (onDrone) { if (o.drone.hp <= 0) { o.drone = null; fx.droneDown = 1; } }
  else if (landed > 0 || (evMode && chance > 0)) {
    const okFx = evMode ? chance >= 50 : landed > 0;
    if (okFx) {
      if (w.fx.burn && !o.st.noBurn) { o.burn = { t: w.fx.burn, d: w.fx.burnDmg }; fx.burn = w.fx.burn; }
      if (w.fx.shock && !o.shocked && (evMode ? w.fx.shock >= 0.5 : rnd(st) < w.fx.shock)) { o.shocked = true; fx.shock = 1; }
      if (w.fx.emp) { const lost = Math.min(o.en, w.fx.emp); o.en -= lost; fx.emp = lost; }
      if (w.fx.pull) { fx.pull = 1; const dir = s.x >= o.x ? 1 : -1; let x = o.x; for (let k = 0; k < w.fx.pull; k++) { const nx = x + dir; if (nx === s.x || nx < 0 || nx >= ARENA.len) break; x = nx; } if (x !== o.x) { fx.push = [o.x, x]; o.x = x; } }
      if (w.fx.push) { const dir = o.x >= s.x ? 1 : -1; let x = o.x; for (let k = 0; k < w.fx.push; k++) { const nx = x + dir; if (nx < 0 || nx >= ARENA.len) break; x = nx; } if (x !== o.x) { fx.push = [o.x, x]; o.x = x; } }
    }
  }
  ev.push({ k: 'fire', i, slot: w.slot, wid: w.id, type: w.type, tgt: onDrone ? 'drone' : 'mech', hits, fx });
}
function endTurn(st, i, ev, evMode) {
  const s = st.sides[i], o = st.sides[1 - i], dr = s.drone;
  if (dr && !st.over) {
    if (dr.dtype === 'atk') {
      const d = dist(st);
      if (d >= dr.rng[0] && d <= dr.rng[1]) {
        const chance = clamp(dr.acc - effEvade(o), 15, 98); const hit = evMode ? true : rnd(st) * 100 < chance; const mul = evMode ? chance / 100 : 1;
        if (hit) { const r = dealToMech(o, dr.dmg * mul, 'kin', 0); ev.push({ k: 'drone', i, act: 'atk', hit: 1, d: r1(r.hp), a: r1(r.ab) }); } else ev.push({ k: 'drone', i, act: 'atk', hit: 0 });
      }
    } else if (dr.dtype === 'rep') { const h = Math.min(dr.heal, s.maxHp - s.hp); s.hp += h; ev.push({ k: 'drone', i, act: 'rep', h }); }
    else if (dr.dtype === 'shd') { s.sh = Math.min(s.sh + dr.shield, Math.max(s.maxSh, 0) + dr.shield * 2); ev.push({ k: 'drone', i, act: 'shd', v: dr.shield }); }
    else if (dr.dtype === 'jam') { const lost = Math.min(o.en, dr.drain); o.en -= lost; ev.push({ k: 'drone', i, act: 'jam', lost }); }
  }
  s.ap = 0;
  if (!st.over) { const a = st.sides[0], b = st.sides[1]; if (a.hp <= 0 || b.hp <= 0) { fin(st, ev); return; } }
  if (st.over) return;
  const next = 1 - i; if (next === 0) st.round += 1;   // nové kolo začíná stranou 0
  if (st.round > ROUND_LIMIT) { st.over = true; const [a, b] = st.sides; const pa = a.hp / a.maxHp, pb = b.hp / b.maxHp; st.winner = Math.abs(pa - pb) < 0.02 ? 2 : pa > pb ? 0 : 1; ev.push({ k: 'snap', s: snap(st) }); ev.push({ k: 'end', winner: st.winner, timeout: 1 }); return; }
  st.turn = next; beginTurn(st, next, ev);
}
/** Strana, která má hrát, vzdala / vypršel čas: prostě skončí tah. */
export function forceEnd(st) { if (st.over) return []; const ev = []; endTurn(st, st.turn, ev, false); return ev; }
export function forfeit(st, i) { const ev = []; if (st.over) return ev; st.over = true; st.winner = 1 - i; ev.push({ k: 'snap', s: snap(st) }); ev.push({ k: 'end', winner: st.winner, forfeit: 1 }); return ev; }
export const clone = (st) => structuredClone(st);
