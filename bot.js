// ARÉNA VĚŽÍ – bot: rozhoduje, kterou kartu a kam položit. Pracuje s absolutními souřadnicemi arény za hráče `pi`.
// Obtížnost (1–4) určuje, jak často se zamyslí (THINK), kolik elixíru šetří pro útok (PUSH_AT), jak často udělá chybu (MISTAKE)
// a jak chytře vybírá obránce a kouzla.
import * as C from './cards.js';
const { CARDS, W, H, MID, RIVER } = C;
export const BOT_THINK = { 1: 40, 2: 28, 3: 18, 4: 12 };        // za kolik tiků (po 0,05 s) se bot zase rozhoduje
export const BOT_RATE = { 1: 0.75, 2: 0.9, 3: 1, 4: 1.05 };      // násobek rychlosti elixíru
export const BOT_CARD_LV = { 1: 1, 2: 2, 3: 4, 4: 6 };          // úroveň karet bota
const PUSH_AT = { 1: 9, 2: 8, 3: 7, 4: 6 };
const MISTAKE = { 1: 0.45, 2: 0.25, 3: 0.1, 4: 0.03 };

/** Balíček bota: 9 karet, aspoň 2 zasahující vzdušné cíle; náhodný, ale slušně poskládaný. */
export function botDeck(level, rnd = Math.random) {
  const pool = C.CARD_ORDER.filter((id) => !CARDS[id].lvl || CARDS[id].lvl <= 1 + level * 3);
  for (let tries = 0; tries < 50; tries++) {
    const ids = [...pool].sort(() => rnd() - 0.5).slice(0, C.DECK_SIZE);
    if (ids.filter((id) => CARDS[id].tt === 'all' && CARDS[id].kind !== 'spell').length < 2) continue;
    if (!ids.some((id) => CARDS[id].cost >= 4 && CARDS[id].kind !== 'spell' && CARDS[id].kind !== 'farm')) continue;
    return ids.map((id) => ({ id, lv: BOT_CARD_LV[level] || 1 }));
  }
  return C.STARTER.map((id) => ({ id, lv: BOT_CARD_LV[level] || 1 }));
}

const isSpell = (c) => c.kind === 'spell';
const score = (c) => ((c.hp * (c.n || 1)) * 0.5 + (c.dmg * (c.n || 1)) / c.as * 2.2) / c.cost;

export function botThink(s, pi, lvl) {
  const p = s.pl[pi]; const en = 1 - pi; const rnd = s.rng;
  const hand = p.hand.map((h, i) => ({ h, i, c: CARDS[h.id] })).filter((x) => x.c.cost <= p.elixir + 1e-9);
  if (!hand.length) return null;
  const back = pi === 0 ? 1 : -1;                                   // směr k vlastní základně
  const lo = pi === 0 ? RIVER.y1 + 12 : 10, hi = pi === 0 ? H - 10 : RIVER.y0 - 12;
  const cy = (y) => C.clamp(y, lo, hi), cx = (x) => C.clamp(x, 10, W - 10);
  const myFront = s.towers.find((t) => t.o === pi && t.tk === 'front' && !t.dead) || s.towers.find((t) => t.o === pi && t.tk === 'main');
  const enFront = s.towers.find((t) => t.o === en && !t.dead && t.tk === 'front') || s.towers.find((t) => t.o === en && t.tk === 'main');
  const enemies = s.units.filter((u) => u.o === en && u.hp > 0);
  const mine = s.units.filter((u) => u.o === pi && u.hp > 0);
  const nearMy = (u) => (pi === 0 ? u.y > MID - 50 : u.y < MID + 50);
  const threats = enemies.filter(nearMy).sort((a, b) => Math.hypot(a.x - myFront.x, a.y - myFront.y) - Math.hypot(b.x - myFront.x, b.y - myFront.y));

  // 1) kouzlo na hlouček (od seržanta výš) nebo na skoro zničenou věž (od kapitána)
  const fb = hand.find((x) => isSpell(x.c));
  if (fb && lvl >= 2 && rnd() > MISTAKE[lvl]) {
    let bestV = 0, bp = null;
    for (const e of enemies) { let v = 0; for (const f of enemies) if (Math.hypot(e.x - f.x, e.y - f.y) <= fb.c.splash) v += Math.min(f.hp, fb.c.dmg * C.lvMul(fb.h.lv)); if (v > bestV) { bestV = v; bp = e; } }
    if (bp && bestV >= 420 + 60 * (4 - lvl)) return { hi: fb.i, x: bp.x, y: bp.y };
    if (lvl >= 3 && enFront && enFront.hp <= fb.c.dmg * C.lvMul(fb.h.lv) * 0.4 + 5 && !enFront.dead) return { hi: fb.i, x: enFront.x, y: enFront.y };
  }
  // farma: když nikdo netlačí a ještě žádnou nemáme, postaví se vzadu u základny
  const farmCard = hand.find((x) => x.c.kind === 'farm');
  if (farmCard && lvl >= 2 && !threats.length && !mine.some((u) => u.k === 'farm') && p.elixir >= farmCard.c.cost + (lvl >= 3 ? 0 : 1) && s.tick * C.DT > 8) return { hi: farmCard.i, x: cx(W / 2 + (rnd() - 0.5) * 120), y: cy(pi === 0 ? H - 70 : 70) };
  const units = hand.filter((x) => !isSpell(x.c) && x.c.kind !== 'farm');
  if (!units.length) return null;

  // 2) obrana proti jednotkám na naší polovině
  if (threats.length && rnd() > MISTAKE[lvl]) {
    const th = threats[0];
    const defenders = units.filter((x) => x.c.kind !== 'bomber' && x.c.kind !== 'healer' && x.c.tt !== 'building' && (!th.fly || x.c.tt === 'all'));
    if (defenders.length) {
      const pick = lvl >= 3 ? defenders.reduce((a, b) => (score(b.c) > score(a.c) ? b : a)) : defenders[Math.floor(rnd() * defenders.length)];
      return { hi: pick.i, x: cx(th.x + (rnd() - 0.5) * 30), y: cy(Math.min(Math.max(th.y + back * 46, myFront.y - 30), hi + 0) ) };
    }
  }

  // 3) útok, až je dost elixíru
  if (p.elixir < PUSH_AT[lvl] && (lvl < 3 || mine.length || p.elixir < 9)) return null;
  const leaders = mine.filter((u) => u.k !== 'healer' && !u.fly).sort((a, b) => (pi === 0 ? a.y - b.y : b.y - a.y));
  const lead = leaders[0];
  let choices = units;
  if (!lead) choices = units.filter((x) => x.c.kind !== 'healer' && x.c.kind !== 'bomber') .length ? units.filter((x) => x.c.kind !== 'healer' && x.c.kind !== 'bomber') : units;
  else if (lvl >= 2) { const sup = units.filter((x) => x.c.range > 40 || x.c.fly || x.c.kind === 'healer' || x.c.kind === 'bomber'); if (sup.length) choices = sup; }
  let pick;
  if (lvl >= 3) {   // chytřejší volba: bez jednotek na poli nejdřív tanka, jinak nejlepší poměr cena/výkon
    pick = !lead ? choices.reduce((a, b) => (b.c.hp * (b.c.n || 1) > a.c.hp * (a.c.n || 1) ? b : a)) : choices.reduce((a, b) => (score(b.c) > score(a.c) ? b : a));
  } else pick = choices[Math.floor(rnd() * choices.length)];
  if (pick.c.kind === 'healer' && !lead) pick = choices.find((x) => x.c.kind !== 'healer') || pick;
  let x, y;
  if (lvl >= 2 && lead && pick.c.kind !== 'bomber') { x = lead.x + (rnd() - 0.5) * 24; y = (pi === 0 ? Math.max(lead.y + 40, lo) : Math.min(lead.y - 40, hi)); if ((pi === 0 && lead.y < MID) || (pi === 1 && lead.y > MID)) y = pi === 0 ? lo + 4 : hi - 4; }
  else if (pick.c.kind === 'bomber') { x = W / 2 + (rnd() - 0.5) * 50; y = pi === 0 ? lo + 4 : hi - 4; }
  else { x = W / 2 + (rnd() - 0.5) * (lvl === 1 ? 260 : 90); y = lvl === 1 ? lo + rnd() * (hi - lo) : (pi === 0 ? H - 120 : 120) + (rnd() - 0.5) * 20; }
  return { hi: pick.i, x: cx(x), y: cy(y) };
}
