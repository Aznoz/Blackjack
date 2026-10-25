// Pomocné funkce nad enginem: výčet všech legálních tahů (pro boty i testy) a náhodné rozhodnutí pro libovolný prompt.
import { TYPES, isWeapon } from './data.js';

/** Všechny legální akce hlavní fáze pro hráče `p` (kromě 'end'). */
export function enumeratePlays(g, p) {
  const out = [];
  const alive = g.alive();
  const seen = new Set();
  const add = (a) => { if (!g.validatePlay(p, a)) out.push(a); };
  for (const c of p.hand) {
    const key = c.type + (p.hand.filter((x) => x.type === c.type).length > 1 ? '' : c.id);
    // stejné druhy karet se liší jen id – pro výčet stačí první kopie každého druhu (kromě ověření různých cílů)
    if (seen.has(c.type)) continue;
    seen.add(c.type);
    const T = TYPES[c.type];
    const base = { act: 'play', cardId: c.id };
    if (g.isShot(p, c) || c.type === 'strela' || c.type === 'stit') {
      for (const t of alive) if (t.id !== p.id) add({ ...base, target: t.id });
      continue;
    }
    switch (c.type) {
      case 'foukacka': for (const t of alive) add({ ...base, target: t.id }); break;
      case 'varovny':
        for (const t of alive) if (t.id !== p.id) {
          if (t.hand.length) add({ ...base, target: t.id, tzone: 'hand' });
          for (const x of [...t.table, ...t.status]) add({ ...base, target: t.id, tzone: 'table', tcard: x.id });
        }
        break;
      case 'dezintegrator':
        for (const t of alive) {
          if (t.id !== p.id && t.hand.length) add({ ...base, target: t.id, tzone: 'hand' });
          for (const x of [...t.table, ...t.status]) add({ ...base, target: t.id, tzone: 'table', tcard: x.id });
        }
        break;
      case 'duel': case 'cela': for (const t of alive) if (t.id !== p.id) add({ ...base, target: t.id }); break;
      case 'vynalez': add({ ...base, target: p.id }); break;
      default:
        if (T.kind === 'equip') {
          if (isWeapon(c.type) || p.table.length < g.slotCap(p)) add(base);
          else for (const x of p.table) add({ ...base, replaceId: x.id });
        } else add(base);
    }
  }
  if (p.char.id === 'fwild' && p.life < p.maxLife && p.hand.length >= 2) add({ act: 'wild', cardIds: [p.hand[0].id, p.hand[1].id] });
  return out;
}

/** Náhodné (ale legální) rozhodnutí pro jakýkoli prompt – používá se v testech a jako nouzová volba. */
export function randomAction(g, rng = Math.random) {
  const pd = g.pending; const p = g.P(pd.pid);
  const pickOne = (arr) => arr[Math.floor(rng() * arr.length)];
  switch (pd.type) {
    case 'play': {
      const plays = enumeratePlays(g, p);
      if (!plays.length || rng() < 0.12) return { act: 'end' };
      return pickOne(plays);
    }
    case 'respond': return pd.usable.length && rng() < 0.7 ? { cardId: pickOne(pd.usable) } : { pass: true };
    case 'rescue': return pd.usable.length && rng() < 0.8 ? { cardId: pickOne(pd.usable) } : { pass: true };
    case 'cell': return rng() < 0.6 ? { escape: true, cardId: pickOne(pd.usable) } : { escape: false };
    case 'discard': return { cardId: pickOne(p.hand).id };
    case 'pick': {
      if (pd.count === 2) { const ids = pd.cards.map((c) => c.id); const a = ids.splice(Math.floor(rng() * ids.length), 1)[0]; return { picks: [a, pickOne(ids)] }; }
      return { pick: pickOne(pd.cards).id };
    }
    case 'drawsrc': {
      const o = pickOne(pd.options);
      if (o.src === 'hand') return { src: 'hand', pid: pickOne(o.targets) };
      if (o.src === 'table') { const t = pickOne(o.targets); return { src: 'table', pid: t.pid, cardId: pickOne(t.cards).id }; }
      return { src: o.src };
    }
    default: return g.autoAction();
  }
}
