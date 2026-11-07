// ARÉNA VĚŽÍ – simulace zápasu (jen na serveru, autoritativní). Jeden tik = 0,05 s. Bez náhody kromě zamíchání balíčku (seed).
// newGame(decks, seed) → stav, play(s, hráč, ruka, x, y) položí kartu, step(s) posune hru o tik, snapFor(s, hráč) udělá zprávu pro klienta.
import * as C from './cards.js';
const { DT, W, H, MID, RIVER, BRIDGE, CARDS, TOWER } = C;
const sqrt = Math.sqrt;
const AGGRO = 100;                       // dál než tohle jednotky cizí jednotky „nevidí“ a jdou na věž
const SEP_PUSH = 0.6;                    // jak silně se pozemní jednotky odtlačují

export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** decks = [[{ id, lv } × 9], [...]] pro hráče 0 (dole) a 1 (nahoře). opts.rate = násobek rychlosti elixíru každého hráče (boti). */
export function newGame(decks, seed = 1, opts = {}) {
  const rng = mulberry32(seed);
  const s = { tick: 0, nextId: 10, units: [], towers: [], pend: [], ev: [], over: null, ot: false, rng, pl: [], crowns: [0, 0], rate: opts.rate || [1, 1] };
  for (let o = 0; o < 2; o++) {
    for (const k of ['main', 'front']) {
      const T = TOWER[k];
      s.towers.push({ id: o * 2 + (k === 'main' ? 1 : 2), kind: 'tower', tk: k, o, x: W / 2, y: o === 0 ? H - T.d : T.d, hp: T.hp, max: T.hp, cd: 0.5, tgt: null, dead: false, r: T.r, range: T.range, dmg: T.dmg, as: T.as });
    }
    const deck = (decks[o] || []).map((c) => ({ id: c.id, lv: C.clamp(Math.floor(Number(c.lv) || 1), 1, C.MAX_CARD_LEVEL) }));
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }   // zamíchání
    s.pl.push({ elixir: C.ELIXIR_START, hand: deck.slice(0, C.HAND_SIZE), queue: deck.slice(C.HAND_SIZE), played: 0, spent: 0 });
  }
  return s;
}

const secs = (s) => s.tick * DT;
const inBand = (y) => y >= RIVER.y0 && y <= RIVER.y1;
const dist = (a, b) => sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
const alive = (e) => e && e.hp > 0 && !e.dead;
/** Smí jednotka `u` napadnout cíl `e` (jednotku)? */
function canHit(u, e) { if (u.tt === 'building') return e.k === 'farm';   // golem a sapér jdou na věže, ale cestou zničí i farmu
  if (u.tt === 'ground') return !e.fly; return true; }

// ------------------------------------------------------------------ karty a jednotky
/** Položí kartu z ruky (index 0–2) na (x, y) (absolutní souřadnice arény). Vrací chybovou hlášku nebo null. */
export function play(s, pi, hi, x, y) {
  if (s.over) return 'Zápas už skončil.';
  const p = s.pl[pi]; const h = p && p.hand[hi]; if (!h) return 'Taková karta v ruce není.';
  const card = CARDS[h.id]; if (!Number.isFinite(x) || !Number.isFinite(y)) return 'Špatné místo.';
  if (p.elixir + 1e-9 < card.cost) return 'Nemáš dost elixíru.';
  x = C.clamp(x, 8, W - 8); y = C.clamp(y, 8, H - 8);
  if (card.kind !== 'spell') { // jednotky jen na vlastní půlku, mimo řeku
    const ok = pi === 0 ? y >= RIVER.y1 + 10 : y <= RIVER.y0 - 10;
    if (!ok) return 'Jednotky pokládej jen na svou polovinu.';
  }
  p.elixir -= card.cost; p.played++; p.spent += card.cost;
  p.hand[hi] = p.queue.shift(); p.queue.push(h);   // použitá karta jde na konec fronty, do ruky přijde další
  const mul = C.lvMul(h.lv);
  if (card.kind === 'spell') {
    s.pend.push({ due: s.tick + Math.round(card.delay / DT), x, y, r: card.splash, dmg: Math.round(card.dmg * mul), o: pi, towerMul: card.towerMul ?? 1, kind: card.id });
    s.ev.push(['sp', Math.round(x), Math.round(y), card.splash, card.id, Math.round(card.delay / DT), pi]);
    return null;
  }
  for (let k = 0; k < card.n; k++) {
    const ang = card.n > 1 ? (k / card.n) * Math.PI * 2 + 0.6 : 0; const rad = card.n > 6 ? 12 + (k % 2) * 9 : card.n > 1 ? 11 : 0;
    const ux = C.clamp(x + Math.cos(ang) * rad, 6, W - 6); const uy = pi === 0 ? C.clamp(y + Math.sin(ang) * rad, RIVER.y1 + 4, H - 6) : C.clamp(y + Math.sin(ang) * rad, 6, RIVER.y0 - 4);
    const u = {
      id: s.nextId++, kind: 'unit', o: pi, card: card.id, k: card.kind || 'unit', x: ux, y: uy, hp: Math.round(card.hp * mul), max: Math.round(card.hp * mul), dmg: Math.round(card.dmg * mul), as: card.as, speed: card.speed, range: card.range, r: card.r,
      tt: card.tt, fly: !!card.fly, splash: card.splash || 0, cd: 0, wait: C.DEPLOY_S, tgt: null, gen: card.gen || 0, life: card.life || 0, fcd: card.as, heal: card.heal ? Math.round(card.heal * mul) : 0, healR: card.healR || 0, hcd: 0,
    };
    s.units.push(u); s.ev.push(['s', u.id, u.card, pi, Math.round(ux), Math.round(uy)]);
  }
  return null;
}

// ------------------------------------------------------------------ škody
function hurt(s, t, amount, srcO) {
  if (!alive(t) || amount <= 0) return;
  t.hp -= amount;
  if (t.hp > 0) return;
  t.hp = 0;
  if (t.kind === 'tower') {
    t.dead = true; s.ev.push(['td', t.id]);
    const enemy = 1 - t.o; if (t.tk === 'front') s.crowns[enemy] = Math.max(s.crowns[enemy], 1);
    if (t.tk === 'main') { s.crowns[enemy] = 3; if (!s.over) s.over = { winner: enemy, reason: 'main' }; }
    else if (s.ot && !s.over) s.over = { winner: enemy, reason: 'ot' };   // v prodloužení vyhrává první zničená věž
  } else {
    s.ev.push(['d', t.id, Math.round(t.x), Math.round(t.y), t.card, t.o, t.fly ? 1 : 0]);
  }
}
function splashAt(s, o, x, y, r, dmg, towerMul = 1) { // škoda všem nepřátelům (jednotkám i věžím) v okruhu
  for (const e of s.units) if (e.o !== o && alive(e) && sqrt((e.x - x) * (e.x - x) + (e.y - y) * (e.y - y)) <= r + e.r) hurt(s, e, dmg, o);
  for (const t of s.towers) if (t.o !== o && !t.dead && sqrt((t.x - x) * (t.x - x) + (t.y - y) * (t.y - y)) <= r + t.r) hurt(s, t, Math.round(dmg * towerMul), o);
}

// ------------------------------------------------------------------ pohyb
function moveTo(u, tx, ty, v) {
  const dx = tx - u.x, dy = ty - u.y; const d = sqrt(dx * dx + dy * dy); if (d < 1e-6) return;
  const m = Math.min(v, d); u.x += (dx / d) * m; u.y += (dy / d) * m;
}
/** Pozemní jednotka k cíli: nejdřív k mostu, pak přes řeku jen po mostě. */
function walk(u, tgt) {
  const v = u.speed * DT;
  if (u.fly) return moveTo(u, tgt.x, tgt.y, v);
  const side = u.y < RIVER.y0 ? -1 : u.y > RIVER.y1 ? 1 : 0; const tside = tgt.y < MID ? -1 : 1;
  if (side !== 0 && side !== tside) { // je na jedné straně, cíl na druhé: jdi k nejbližšímu místu mostu
    const bx = C.clamp(u.x, BRIDGE.x0 + 12, BRIDGE.x1 - 12); const by = side < 0 ? RIVER.y0 + 1 : RIVER.y1 - 1;
    return moveTo(u, bx, by, v);
  }
  if (side === 0) { // na mostě: rovně na druhou stranu, vodorovně držet v mostě
    u.x = C.clamp(u.x, BRIDGE.x0 + 8, BRIDGE.x1 - 8);
    const ty = tside < 0 ? RIVER.y0 - 2 : RIVER.y1 + 2; return moveTo(u, u.x, ty, v);
  }
  moveTo(u, tgt.x, tgt.y, v);
}

// ------------------------------------------------------------------ cílení
function pickTarget(s, u) {
  let best = null, bd = 1e9;
  for (const e of s.units) {
    if (e.o === u.o || !alive(e) || !canHit(u, e)) continue;
    const d = dist(u, e) - e.r; if (d < AGGRO && d < bd) { bd = d; best = e; }
  }
  if (best) return best;
  bd = 1e9;
  for (const t of s.towers) { if (t.o === u.o || t.dead) continue; const d = dist(u, t); if (d < bd) { bd = d; best = t; } }
  return best;
}

function unitAttack(s, u, t) {
  u.cd = u.as; u.lock = true;
  if (u.k === 'bomber') { splashAt(s, u.o, u.x, u.y, u.splash, u.dmg, 1); s.ev.push(['x', Math.round(u.x), Math.round(u.y), u.splash]); u.hp = 0; return; }
  if (u.splash) splashAt(s, u.o, t.x, t.y, u.splash, u.dmg, 1); else hurt(s, t, u.dmg, u.o);
  s.ev.push(['a', u.id, t.id, u.range > 40 ? 1 : 0]);
}

function stepUnit(s, u) {
  if (u.wait > 0) { u.wait -= DT; return; }
  if (u.k === 'farm') return stepFarm(s, u);   // budova: nehýbe se, nebojuje, jen vyrábí elixír
  if (u.cd > 0) u.cd -= DT;
  if (u.k === 'healer') return stepHealer(s, u);
  // cíl se po prvním úderu zamkne a mění se jen když zemře (předtím se každých 5 tiků hledá nejbližší nepřítel)
  if (!alive(u.tgt) || (u.tgt.kind === 'unit' && !canHit(u, u.tgt))) { u.tgt = pickTarget(s, u); u.lock = false; }
  else if (!u.lock && (s.tick + u.id) % 5 === 0) u.tgt = pickTarget(s, u);
  const t = u.tgt; if (!t) return;
  const d = dist(u, t) - t.r - (u.k === 'bomber' ? 0 : u.r);
  if (d <= u.range) { if (u.cd <= 0) unitAttack(s, u, t); return; }
  walk(u, t);
}
function stepFarm(s, u) {
  if (u.life > 0) hurt(s, u, u.max * DT / u.life, -1);   // budova chátrá a po `life` sekundách zanikne
  if (u.hp <= 0) return;
  u.fcd -= DT;
  if (u.fcd <= 0) { u.fcd += u.as; const p = s.pl[u.o]; p.elixir = Math.min(C.ELIXIR_MAX, p.elixir + u.gen); s.ev.push(['e', u.id, u.o]); }
}
function stepHealer(s, u) {
  if (u.hcd > 0) u.hcd -= DT;
  if (u.hcd <= 0) { // pulz léčení všech spojenců v okruhu
    let any = false;
    for (const e of s.units) if (e.o === u.o && e !== u && alive(e) && e.hp < e.max && sqrt((e.x - u.x) * (e.x - u.x) + (e.y - u.y) * (e.y - u.y)) <= u.healR) { e.hp = Math.min(e.max, e.hp + u.heal); any = true; }
    if (any) { u.hcd = u.as; s.ev.push(['h', u.id]); }
  }
  // doprovod: nejvíc postoupivší spojenecká bojová jednotka
  let lead = null;
  for (const e of s.units) if (e.o === u.o && e.k !== 'healer' && alive(e) && !e.fly) { const adv = u.o === 0 ? -e.y : e.y; if (!lead || adv > (u.o === 0 ? -lead.y : lead.y)) lead = e; }
  const home = { x: W / 2, y: u.o === 0 ? H - 190 : 190, r: 0 };
  const tgt = lead || home;
  if (dist(u, tgt) > 34) walk(u, tgt);
}

function stepTower(s, t) {
  if (t.dead) return;
  t.cd -= DT;
  let tg = t.tgt;
  if (!alive(tg) || dist(t, tg) - tg.r > t.range) {
    tg = null; let bd = 1e9;
    for (const e of s.units) { if (e.o === t.o || !alive(e)) continue; const d = dist(t, e) - e.r; if (d <= t.range && d < bd) { bd = d; tg = e; } }
    t.tgt = tg;
  }
  if (tg && t.cd <= 0) { t.cd = t.as; hurt(s, tg, t.dmg, t.o); s.ev.push(['a', t.id, tg.id, 1]); }
}

function separate(s) { // pozemní jednotky se do sebe nesmějí slít
  const g = s.units.filter((u) => !u.fly);
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const a = g[i], b = g[j]; const dx = b.x - a.x, dy = b.y - a.y; const d2 = dx * dx + dy * dy; const m = a.r + b.r;
    if (d2 >= m * m) continue;
    const d = sqrt(d2) || 0.001; const push = (m - d) * SEP_PUSH * 0.5; const nx = d2 < 1e-6 ? 1 : dx / d, ny = d2 < 1e-6 ? 0 : dy / d;
    const wa = a.tgt && a.cd > 0 && dist(a, a.tgt) - a.tgt.r - a.r <= a.range ? 0.3 : 1; const wb = b.tgt && b.cd > 0 && dist(b, b.tgt) - b.tgt.r - b.r <= b.range ? 0.3 : 1;
    const fa = a.k === 'farm' ? 0 : 1, fb = b.k === 'farm' ? 0 : 1;   // farma je nehybná
    a.x -= nx * push * wa * fa; a.y -= ny * push * wa * fa; b.x += nx * push * wb * fb; b.y += ny * push * wb * fb;
  }
  for (const u of g) { u.x = C.clamp(u.x, 5, W - 5); if (inBand(u.y)) u.x = C.clamp(u.x, BRIDGE.x0 + 6, BRIDGE.x1 - 6); }
}

// ------------------------------------------------------------------ tik
export function step(s) {
  if (s.over) return;
  s.tick++;
  const t = secs(s);
  const dbl = t >= C.DOUBLE_AT ? 2 : 1;
  for (let o = 0; o < 2; o++) s.pl[o].elixir = Math.min(C.ELIXIR_MAX, s.pl[o].elixir + (DT / C.ELIXIR_SEC) * dbl * (s.rate[o] || 1));
  for (let i = s.pend.length - 1; i >= 0; i--) { const e = s.pend[i]; if (s.tick >= e.due) { splashAt(s, e.o, e.x, e.y, e.r, e.dmg, e.towerMul); s.pend.splice(i, 1); } }
  for (const u of s.units) if (alive(u)) stepUnit(s, u);
  separate(s);
  for (const tw of s.towers) stepTower(s, tw);
  s.units = s.units.filter((u) => u.hp > 0);
  // konec zápasu podle času
  if (!s.over) {
    if (!s.ot && t >= C.MATCH_S) {
      if (s.crowns[0] !== s.crowns[1]) s.over = { winner: s.crowns[0] > s.crowns[1] ? 0 : 1, reason: 'time' };
      else { s.ot = true; s.ev.push(['ot']); }
    } else if (s.ot && t >= C.MATCH_S + C.OT_S) {
      const r = [0, 1].map((o) => s.towers.filter((x) => x.o === o && !x.dead).reduce((a, x) => a + x.hp, 0));
      s.over = { winner: r[0] === r[1] ? -1 : r[0] > r[1] ? 0 : 1, reason: 'hp' };
    }
  }
}

// ------------------------------------------------------------------ zpráva pro klienta (souřadnice z pohledu hráče: ty jsi vždy dole)
const flipX = (pi, x) => (pi === 1 ? W - x : x), flipY = (pi, y) => (pi === 1 ? H - y : y);
export function snapFor(s, pi) {
  const me = s.pl[pi]; const mine = (o) => (o === pi ? 0 : 1);
  const evs = s.ev.map((e) => {
    switch (e[0]) {
      case 's': return ['s', e[1], e[2], mine(e[3]), Math.round(flipX(pi, e[4])), Math.round(flipY(pi, e[5]))];
      case 'd': return ['d', e[1], Math.round(flipX(pi, e[2])), Math.round(flipY(pi, e[3])), e[4], mine(e[5]), e[6]];
      case 'sp': return ['sp', Math.round(flipX(pi, e[1])), Math.round(flipY(pi, e[2])), e[3], e[4], e[5], mine(e[6])];
      case 'x': return ['x', Math.round(flipX(pi, e[1])), Math.round(flipY(pi, e[2])), e[3]];
      case 'e': return ['e', e[1], mine(e[2])];
      default: return e;
    }
  });
  return {
    t: 'snap', k: s.tick, tm: Math.max(0, Math.ceil((s.ot ? C.MATCH_S + C.OT_S : C.MATCH_S) - secs(s))), ot: s.ot ? 1 : 0, dbl: secs(s) >= C.DOUBLE_AT ? 1 : 0,
    el: Math.round(me.elixir * 10) / 10, hand: me.hand.map((c) => [c.id, c.lv]), next: me.queue[0] ? [me.queue[0].id, me.queue[0].lv] : null,
    u: s.units.map((u) => [u.id, u.card, mine(u.o), Math.round(flipX(pi, u.x)), Math.round(flipY(pi, u.y)), u.hp, u.max, u.wait > 0 ? 1 : 0]),
    tw: s.towers.map((x) => [x.id, mine(x.o), x.tk === 'main' ? 0 : 1, Math.round(flipX(pi, x.x)), Math.round(flipY(pi, x.y)), x.hp, x.max]),
    cr: [s.crowns[pi], s.crowns[1 - pi]], ev: evs,
  };
}
export const clearEvents = (s) => { s.ev.length = 0; };
