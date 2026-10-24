// Umělá inteligence botů. Rozhoduje se jen podle "view" (stejné informace, jaké má hráč) – nepodvádí.
// decide(view) vrací buď { t:'use', card, target } nebo { t:'shoot', target }.

export const BOT_NAMES = [
  'Havran', 'Strašák', 'Vlkodlak', 'Kostlivec', 'Bludička', 'Hrobník',
  'Černá vdova', 'Sova', 'Mátoha', 'Lesní muž', 'Uhlíř', 'Bába kořenářka',
];

function liveChance(cyl) {
  if (cyl.remaining <= 0) return 0.5;
  if (cyl.known[0] != null) return cyl.known[0] ? 1 : 0;
  let live = cyl.live;
  let blank = cyl.blank;
  cyl.known.forEach((k, i) => {
    if (i > 0 && k != null) { if (k) live--; else blank--; }
  });
  live = Math.max(0, live);
  blank = Math.max(0, blank);
  if (live + blank === 0) return 0.5;
  const p = live / (live + blank);
  return cyl.uncertain ? 0.5 * p + 0.25 : p;
}

export function decide(view, rng = Math.random) {
  const me = view.players.find((p) => p.id === view.you);
  const opp = view.players.filter((p) => p.alive && p.id !== me.id);
  const cyl = view.cyl;
  const known0 = cyl.known[0] ?? null;
  const known1 = cyl.known[1] ?? null;
  const pLive = liveChance(cyl);

  const have = (type) => me.hand.find((c) => c.type === type && view.use[c.id] && view.use[c.id].ok);
  const useCard = (card, target) => ({ t: 'use', card: card.id, target: target ?? null });
  const lowest = (list) => list.slice().sort((a, b) => a.hp - b.hp || rng() - 0.5)[0];
  const pick = (list) => list[Math.floor(rng() * list.length)];

  // --- léčení a ochrana ---
  let c;
  if ((c = have('herb')) && me.hp < me.maxHp) return useCard(c);
  if ((c = have('amulet'))) return useCard(c);
  if ((c = have('amanita')) && me.hp >= 3 && me.hp <= me.maxHp - 2 && rng() < 0.7) return useCard(c);

  // --- informace ---
  if (known0 == null && cyl.remaining >= 1) {
    if ((c = have('skull'))) return useCard(c);
    if ((c = have('eye'))) return useCard(c);
  }

  // --- útok se znalostí náboje ---
  if (known0 === true) {
    if ((c = have('saw')) && opp.some((o) => o.hp >= 2) && rng() < 0.85) return useCard(c);
    if (known1 === true && (c = have('double')) && cyl.remaining >= 2) return useCard(c);
  }
  if (known0 === false && opp.length) {
    const weak = lowest(opp);
    if ((c = have('cross')) && rng() < (weak.hp <= 2 ? 0.7 : 0.25)) return useCard(c);
  }

  // --- ostatní karty ---
  if (opp.length) {
    if ((c = have('curse')) && rng() < 0.6) {
      const targets = view.use[c.id].targets.map((id) => opp.find((o) => o.id === id)).filter(Boolean);
      if (targets.length) return useCard(c, lowest(targets).id);
    }
    if ((c = have('voodoo')) && rng() < 0.55) {
      const ids = view.use[c.id].targets;
      // preferuj hráče, který by byl hned po mně na řadě
      const order = view.players;
      const myIdx = order.findIndex((p) => p.id === me.id);
      let nextId = null;
      for (let k = 1; k <= order.length; k++) {
        const cand = order[(myIdx + view.dir * k + order.length * 4) % order.length];
        if (cand.alive && cand.id !== me.id) { nextId = cand.id; break; }
      }
      return useCard(c, ids.includes(nextId) ? nextId : pick(ids));
    }
    if ((c = have('thief')) && rng() < 0.75) {
      const ids = view.use[c.id].targets;
      const richest = ids
        .map((id) => opp.find((o) => o.id === id))
        .filter(Boolean)
        .sort((a, b) => b.hand.length - a.hand.length)[0];
      if (richest) return useCard(c, richest.id);
    }
  }
  if ((c = have('pact')) && me.hp >= 3 && me.hand.length <= 4 && rng() < 0.45) return useCard(c);
  if ((c = have('pendulum')) && opp.length >= 2 && rng() < 0.3) return useCard(c);
  if (known0 == null) {
    if ((c = have('eject')) && pLive > 0.55 && rng() < 0.8) return useCard(c);
    if ((c = have('holy')) && pLive > 0.5 && rng() < 0.8) return useCard(c);
    if ((c = have('saw')) && pLive > 0.55 && rng() < 0.4) return useCard(c);
    if ((c = have('double')) && me.hp >= 3 && rng() < 0.15) return useCard(c);
  }
  if ((c = have('spin')) && rng() < 0.08) return useCard(c);

  // --- výstřel ---
  if (me.cursed || !opp.length) return { t: 'shoot', target: me.id };
  const unshielded = opp.filter((o) => !o.amulet);
  const victim = lowest(unshielded.length ? unshielded : opp);

  if (known0 === true) return { t: 'shoot', target: victim.id };
  if (known0 === false) return { t: 'shoot', target: me.id };
  const thr = me.hp <= 1 ? 0.2 : me.hp <= 2 ? 0.4 : 0.5;
  return { t: 'shoot', target: pLive < thr ? me.id : victim.id };
}
