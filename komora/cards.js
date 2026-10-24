// Definice karet z pohledu pravidel (server). Vzhled karet (obrázky, texty) je na frontendu v js/cards.js.
// ID karet musí být na obou stranách stejná – hlídá to test (test/sim.js).

export const CAP = 6;        // počet komor ve válci
export const HAND_MAX = 6;   // maximum karet v ruce
export const DEAL = 2;       // kolik karet dostane každý živý hráč při nabití

// weight = pravděpodobnost, že karta padne; target = karta potřebuje cíl (jiný hráč)
export const CARD_DEFS = {
  voodoo:   { weight: 7,  target: 'other' },
  double:   { weight: 6 },
  saw:      { weight: 7 },
  eye:      { weight: 10 },
  skull:    { weight: 5 },
  spin:     { weight: 6 },
  eject:    { weight: 9 },
  cross:    { weight: 6 },
  herb:     { weight: 10 },
  amanita:  { weight: 6 },
  amulet:   { weight: 5 },
  pact:     { weight: 4 },
  thief:    { weight: 5,  target: 'other' },
  curse:    { weight: 4,  target: 'other' },
  holy:     { weight: 5 },
  pendulum: { weight: 4 },
};

export const CARD_TYPES = Object.keys(CARD_DEFS);

/**
 * Platné cíle karty. ctx = { me, players, remaining }
 * players = pole { id, alive, skip, cursed, hand:[...] ... } (funguje nad živou hrou i nad snapshotem)
 */
export function targetsFor(type, ctx) {
  const { me, players } = ctx;
  const others = players.filter((p) => p.alive && p.id !== me.id);
  switch (type) {
    case 'voodoo': return others.filter((p) => !p.skip);
    case 'thief':  return others.filter((p) => p.hand.length > 0);
    case 'curse':  return others.filter((p) => !p.cursed);
    default:       return [];
  }
}

/** Vrací null, když jde kartu zahrát, jinak českou větu s důvodem. */
export function canUse(type, ctx) {
  const { me, players, remaining } = ctx;
  const alive = players.filter((p) => p.alive).length;
  switch (type) {
    case 'voodoo':
      return targetsFor(type, ctx).length ? null : 'Všichni ostatní už jsou zastaveni.';
    case 'thief':
      return targetsFor(type, ctx).length ? null : 'Nikdo další nemá žádnou kartu.';
    case 'curse':
      return targetsFor(type, ctx).length ? null : 'Všichni ostatní už jsou prokleti.';
    case 'double':
      if (me.dbl) return 'Dvojitá rána je už připravená.';
      return remaining >= 2 ? null : 'V komoře zbývá jen jeden náboj.';
    case 'saw':
      return me.saw ? 'Pila je už připravená.' : null;
    case 'eye':
    case 'skull':
    case 'eject':
    case 'cross':
      return remaining >= 1 ? null : 'Válec je prázdný.';
    case 'spin':
      return remaining >= 2 ? null : 'Není co míchat.';
    case 'herb':
      return me.hp < me.maxHp ? null : 'Máš plný počet životů.';
    case 'amanita':
      return me.hp >= 2 ? null : 'Při posledním životě je to příliš nebezpečné.';
    case 'amulet':
      return me.amulet ? 'Amulet už nosíš.' : null;
    case 'pact':
      if (me.hp < 2) return 'Nemáš dost životů na oběť.';
      return me.hand.length <= HAND_MAX - 1 ? null : 'Máš plnou ruku.';
    case 'holy':
      return remaining < CAP ? null : 'Válec je plný.';
    case 'pendulum':
      return alive >= 3 ? null : 'Kyvadlo má smysl od tří hráčů.';
    default:
      return 'Neznámá karta.';
  }
}
