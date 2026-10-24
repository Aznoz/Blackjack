// Herní logika "Prokletá komora" – čistá logika bez sítě (kvůli testům).
//
// Pravidla ve zkratce:
//  * Revolver má 6 komor. Při každém nabití jsou v něm 1–4 ostré náboje, zbytek slepé.
//    Počty jsou veřejné, pořadí tajné.
//  * Hráč na tahu může zahrát libovolně karet a potom MUSÍ vystřelit – na sebe nebo na jiného.
//  * Slepý náboj do sebe = hraješ znovu. Ostrý náboj do sebe = ztráta života a tah končí.
//    Výstřel na soupeře vždy končí tah.
//  * Když je válec prázdný, nabije se znovu a každý živý hráč dostane 2 nové karty (max. 6 v ruce).
//  * Poslední živý hráč vyhrává.
//
// Každá událost (event) nese i snapshot celého stavu PO události – klient si tak nemusí nic dopočítávat.

import { CAP, HAND_MAX, DEAL, CARD_DEFS, CARD_TYPES, canUse, targetsFor } from './cards.js';

/** Pohled na stav z hlediska jednoho hráče (skryje cizí tajné informace). */
export function viewFromSnap(s, pid) {
  const remaining = s.chambers.length;
  const spentCount = CAP - remaining;
  const spent = spentCount > 0 ? s.history.slice(Math.max(0, s.history.length - spentCount)) : [];
  const view = {
    you: pid,
    phase: s.phase,
    turn: s.turn,
    dir: s.dir,
    loadNo: s.loadNo,
    winner: s.winner,
    players: s.players.map((p) => ({ ...p, hand: p.hand.map((c) => ({ ...c })) })),
    cyl: {
      cap: CAP,
      remaining,
      live: s.pub.live,
      blank: s.pub.blank,
      uncertain: s.pub.uncertain,
      spent,
      known: s.chambers.map((c) => {
        const hit = c.seen.find(([id]) => id === pid);
        return hit ? hit[1] : null;
      }),
    },
    use: {},
  };
  // Které karty jde teď zahrát (jen pro hráče na tahu)
  const me = s.players.find((p) => p.id === pid);
  if (me && me.alive && s.phase === 'playing' && s.turn === pid) {
    const ctx = { me, players: s.players, remaining };
    for (const card of me.hand) {
      const why = canUse(card.type, ctx);
      view.use[card.id] = why
        ? { ok: false, why }
        : { ok: true, targets: targetsFor(card.type, ctx).map((p) => p.id) };
    }
  }
  return view;
}

/** Události upravené pro jednoho hráče (tajné informace dostane jen ten, komu patří). */
export function eventsFor(events, pid) {
  return events.map((ev) => {
    const { snap, priv, privTo, ...rest } = ev;
    const out = { ...rest };
    if (priv && privTo === pid) Object.assign(out, priv);
    out.s = viewFromSnap(snap, pid);
    return out;
  });
}

export class Game {
  /**
   * @param {{id:string,name:string,bot?:boolean}[]} defs  hráči v pořadí sezení
   * @param {{lives?:number, rng?:()=>number, durScale?:number}} opts
   */
  constructor(defs, opts = {}) {
    this.rng = opts.rng || Math.random;
    this.scale = opts.durScale ?? 1;
    const lives = Math.max(1, Math.min(9, Math.round(opts.lives ?? 4)));
    this.players = defs.map((d, i) => ({
      id: d.id, name: d.name, bot: !!d.bot, color: i % 4,
      hp: lives, maxHp: lives, alive: true, hand: [],
      skip: false, cursed: false, amulet: false, saw: false, dbl: false,
    }));
    this.chambers = [];           // zbývající náboje; [0] je v komoře, která se vystřelí jako další
    this.history = [];            // co už ve válci padlo (true = ostrý)
    this.pub = { live: 0, blank: 0, uncertain: false }; // veřejně známé počty
    this.turn = 0;
    this.dir = 1;
    this.phase = 'playing';
    this.loadNo = 0;
    this.winner = null;
    this.nextCardId = 1;
    this.out = [];
  }

  // ---------- pomocné ----------
  D(ms) { return Math.round(ms * this.scale); }
  cur() { return this.players[this.turn]; }
  byId(id) { return this.players.find((p) => p.id === id); }
  aliveList() { return this.players.filter((p) => p.alive); }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  newCard() {
    let total = 0;
    for (const t of CARD_TYPES) total += CARD_DEFS[t].weight;
    let r = this.rng() * total;
    let type = CARD_TYPES[CARD_TYPES.length - 1];
    for (const t of CARD_TYPES) {
      r -= CARD_DEFS[t].weight;
      if (r < 0) { type = t; break; }
    }
    return { id: this.nextCardId++, type };
  }

  pickLiveCount() {
    const r = this.rng();
    if (r < 0.15) return 1;
    if (r < 0.50) return 2;
    if (r < 0.85) return 3;
    return 4;
  }

  snapshot() {
    return {
      phase: this.phase,
      turn: this.cur().id,
      dir: this.dir,
      loadNo: this.loadNo,
      winner: this.winner,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, bot: p.bot, color: p.color,
        hp: p.hp, maxHp: p.maxHp, alive: p.alive,
        skip: p.skip, cursed: p.cursed, amulet: p.amulet, saw: p.saw, dbl: p.dbl,
        hand: p.hand.map((c) => ({ id: c.id, type: c.type })),
      })),
      chambers: this.chambers.map((c) => ({ live: c.live, seen: [...c.seen] })),
      history: [...this.history],
      pub: { ...this.pub },
    };
  }

  view(pid) { return viewFromSnap(this.snapshot(), pid); }

  ev(e) {
    e.snap = this.snapshot();
    this.out.push(e);
    return e;
  }

  reveal(live) {
    this.history.push(live);
    if (live) this.pub.live = Math.max(0, this.pub.live - 1);
    else this.pub.blank = Math.max(0, this.pub.blank - 1);
  }

  guard(pid) {
    if (this.phase !== 'playing') return 'Hra neběží.';
    const c = this.cur();
    if (!c || !c.alive) return 'Nikdo není na tahu.';
    if (c.id !== pid) return 'Nejsi na tahu.';
    return null;
  }

  ctx(me) { return { me, players: this.players, remaining: this.chambers.length }; }

  // ---------- průběh hry ----------
  start() {
    this.out = [];
    this.turn = Math.floor(this.rng() * this.players.length);
    this.ev({ e: 'start', dur: this.D(1500) });
    this.load();
    this.ev({ e: 'turn', p: this.cur().id, dur: this.D(700) });
    return this.out;
  }

  /** Nabití válce + rozdání karet. */
  load() {
    this.loadNo++;
    const live = this.pickLiveCount();
    const blank = CAP - live;
    const arr = [];
    for (let i = 0; i < live; i++) arr.push({ live: true, seen: new Map() });
    for (let i = 0; i < blank; i++) arr.push({ live: false, seen: new Map() });
    this.chambers = this.shuffle(arr);
    this.history = [];
    this.pub = { live, blank, uncertain: false };

    const deals = {};
    for (const p of this.aliveList()) {
      deals[p.id] = [];
      for (let k = 0; k < DEAL; k++) {
        const c = this.newCard();
        if (p.hand.length < HAND_MAX) { p.hand.push(c); deals[p.id].push({ id: c.id, type: c.type }); }
      }
    }
    this.ev({ e: 'load', live, blank, deals, dur: this.D(4200) });
  }

  /** Zahrání karty. Vrací {ok, events} nebo {ok:false, err}. */
  use(pid, cardId, targetId) {
    const err = this.guard(pid);
    if (err) return { ok: false, err };
    const p = this.cur();
    const idx = p.hand.findIndex((c) => c.id === cardId);
    if (idx < 0) return { ok: false, err: 'Tuto kartu nemáš.' };
    const card = p.hand[idx];
    const ctx = this.ctx(p);
    const why = canUse(card.type, ctx);
    if (why) return { ok: false, err: why };

    let target = null;
    if (CARD_DEFS[card.type].target === 'other') {
      target = targetsFor(card.type, ctx).find((t) => t.id === targetId) || null;
      if (!target) return { ok: false, err: 'Vyber platný cíl.' };
    }

    this.out = [];
    p.hand.splice(idx, 1);
    this.ev({ e: 'use', p: p.id, card: { id: card.id, type: card.type }, target: target ? target.id : null, dur: this.D(1300) });
    this.apply(card.type, p, target);
    if (this.chambers.length === 0 && this.phase === 'playing') this.load();
    return { ok: true, events: this.out };
  }

  apply(type, p, target) {
    switch (type) {
      case 'voodoo':
        target.skip = true;
        this.ev({ e: 'voodoo', p: p.id, t: target.id, dur: this.D(1700) });
        break;
      case 'double':
        p.dbl = true;
        this.ev({ e: 'mark', p: p.id, mark: 'dbl', dur: this.D(900) });
        break;
      case 'saw':
        p.saw = true;
        this.ev({ e: 'mark', p: p.id, mark: 'saw', dur: this.D(900) });
        break;
      case 'amulet':
        p.amulet = true;
        this.ev({ e: 'mark', p: p.id, mark: 'amulet', dur: this.D(1100) });
        break;
      case 'eye': {
        const ch = this.chambers[0];
        ch.seen.set(p.id, ch.live);
        this.ev({ e: 'peek', p: p.id, n: 1, dur: this.D(1700), priv: { vals: [ch.live] }, privTo: p.id });
        break;
      }
      case 'skull': {
        const vals = [];
        for (let i = 0; i < Math.min(2, this.chambers.length); i++) {
          const ch = this.chambers[i];
          ch.seen.set(p.id, ch.live);
          vals.push(ch.live);
        }
        this.ev({ e: 'peek', p: p.id, n: vals.length, dur: this.D(1900), priv: { vals }, privTo: p.id });
        break;
      }
      case 'spin':
        this.shuffle(this.chambers);
        for (const c of this.chambers) c.seen = new Map();
        this.ev({ e: 'spin', p: p.id, dur: this.D(1800) });
        break;
      case 'eject': {
        const ch = this.chambers.shift();
        this.reveal(ch.live);
        this.ev({ e: 'eject', p: p.id, live: ch.live, dur: this.D(2000) });
        break;
      }
      case 'cross': {
        const ch = this.chambers[0];
        const had = ch.seen.has(p.id);
        ch.live = !ch.live;
        if (had) ch.seen.set(p.id, ch.live); // kdo to věděl, ví to dál; ostatní mají zastaralou informaci
        this.pub.uncertain = true;
        this.ev({ e: 'invert', p: p.id, dur: this.D(1700), priv: { val: had ? ch.live : null }, privTo: p.id });
        break;
      }
      case 'herb': {
        const before = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + 1);
        this.ev({ e: 'heal', p: p.id, amount: p.hp - before, dur: this.D(1500) });
        break;
      }
      case 'amanita': {
        const good = this.rng() < 0.5;
        const before = p.hp;
        if (good) p.hp = Math.min(p.maxHp, p.hp + 2);
        else p.hp = Math.max(1, p.hp - 1);
        this.ev({ e: 'amanita', p: p.id, good, amount: Math.abs(p.hp - before), dur: this.D(2100) });
        break;
      }
      case 'pact': {
        p.hp = Math.max(1, p.hp - 1);
        const dealt = [];
        for (let i = 0; i < 2; i++) {
          if (p.hand.length >= HAND_MAX) break;
          const c = this.newCard();
          p.hand.push(c);
          dealt.push({ id: c.id, type: c.type });
        }
        this.ev({ e: 'pact', p: p.id, dealt, dur: this.D(2100) });
        break;
      }
      case 'thief': {
        const i = Math.floor(this.rng() * target.hand.length);
        const [stolen] = target.hand.splice(i, 1);
        p.hand.push(stolen);
        this.ev({ e: 'steal', p: p.id, t: target.id, card: { id: stolen.id, type: stolen.type }, dur: this.D(1900) });
        break;
      }
      case 'curse':
        target.cursed = true;
        this.ev({ e: 'curse', p: p.id, t: target.id, dur: this.D(1800) });
        break;
      case 'holy': {
        const at = Math.floor(this.rng() * (this.chambers.length + 1));
        this.chambers.splice(at, 0, { live: false, seen: new Map() });
        this.pub.blank += 1;
        this.ev({ e: 'holy', p: p.id, dur: this.D(1700) });
        break;
      }
      case 'pendulum':
        this.dir = -this.dir;
        this.ev({ e: 'dir', p: p.id, dir: this.dir, dur: this.D(1600) });
        break;
      default:
        break;
    }
  }

  /** Výstřel. target = id hráče (i sebe). */
  shoot(pid, targetId) {
    const err = this.guard(pid);
    if (err) return { ok: false, err };
    const p = this.cur();
    const t = this.byId(targetId);
    if (!t || !t.alive) return { ok: false, err: 'Vyber platný cíl.' };
    if (p.cursed && t.id !== p.id) return { ok: false, err: 'Jsi proklet – smíš střílet jen sám do sebe.' };
    if (this.chambers.length === 0) return { ok: false, err: 'Válec je prázdný.' };

    this.out = [];
    const n = Math.min(p.dbl ? 2 : 1, this.chambers.length);
    const rounds = [];
    for (let i = 0; i < n; i++) {
      const ch = this.chambers.shift();
      rounds.push(ch.live);
      this.reveal(ch.live);
    }
    const usedSaw = p.saw;
    const usedDouble = n === 2;
    p.dbl = false; p.saw = false; p.cursed = false;

    const lives = rounds.filter(Boolean).length;
    let dmg = lives * (usedSaw ? 2 : 1);
    let blocked = false;
    if (dmg > 0 && t.amulet) { t.amulet = false; blocked = true; dmg = 0; }
    if (dmg > 0) t.hp = Math.max(0, t.hp - dmg);
    const killed = t.hp === 0;
    const self = t.id === p.id;
    const extra = self && lives === 0;

    this.ev({
      e: 'shot', p: p.id, t: t.id, rounds, dmg, blocked, killed,
      saw: usedSaw && lives > 0, double: usedDouble,
      dur: this.D(lives > 0 ? 4300 : 3000),
    });

    if (killed) {
      t.alive = false;
      t.hand = [];
      t.skip = false; t.cursed = false; t.amulet = false; t.saw = false; t.dbl = false;
      this.ev({ e: 'death', p: t.id, dur: this.D(2600) });
      const alive = this.aliveList();
      if (alive.length <= 1) {
        this.phase = 'over';
        this.winner = alive.length ? alive[0].id : null;
        this.ev({ e: 'over', winner: this.winner, dur: this.D(3500) });
        return { ok: true, events: this.out };
      }
    }

    if (this.chambers.length === 0) this.load();

    if (extra) this.ev({ e: 'turn', p: p.id, extra: true, dur: this.D(700) });
    else this.advance();
    return { ok: true, events: this.out };
  }

  advance() {
    const n = this.players.length;
    let guard = 0;
    for (;;) {
      do { this.turn = (this.turn + this.dir + n) % n; } while (!this.players[this.turn].alive);
      const c = this.players[this.turn];
      if (c.skip && guard++ < 8) {
        c.skip = false;
        this.ev({ e: 'skip', p: c.id, dur: this.D(1800) });
        continue;
      }
      break;
    }
    this.ev({ e: 'turn', p: this.cur().id, dur: this.D(700) });
  }
}
