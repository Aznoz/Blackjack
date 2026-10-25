// Vesmírná štvanice – herní engine (server-authoritative).
// Celá hra je jeden generátor: kdykoli je potřeba rozhodnutí hráče, `yield` vrátí „prompt“ (komu, co, jaké volby)
// a hra čeká na `act(pid, akce)`. Díky tomu jdou karty s dlouhými řetězci reakcí (duel, záloha, výstřel…) psát lineárně.
import { TYPES, WEAPONS, isWeapon, buildDeck, CHARS, roleSet, ROLES, SILENEC_GOAL, charById } from './data.js';

export class GameOver extends Error {}

const pub = (c) => (c ? (c.turnsLeft != null ? { id: c.id, type: c.type, suit: c.suit, rank: c.rank, turnsLeft: c.turnsLeft } : { id: c.id, type: c.type, suit: c.suit, rank: c.rank }) : null);
const isRed = (c) => c.suit === 'nova' || c.suit === 'kometa';

export class Game {
  /** players: [{ id, name, bot, avatar }] (4–8, boti už doplnění), rng: () => [0,1) */
  constructor({ players, rng }) {
    this.rng = rng || Math.random;
    this.seq = 0;
    this.events = [];
    this.pending = null;
    this.result = null;
    this.revealed = [];
    this.limbo = [];
    this.phase = 'setup';
    this.turnPid = null;
    this.setup(players);
    this.gen = this.main();
    this.advance(undefined);
  }

  // ------------------------------------------------------------------ pomocné
  rint(n) { return Math.floor(this.rng() * n); }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = this.rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  P(id) { return this.players.find((p) => p.id === id) || null; }
  alive() { return this.players.filter((p) => p.alive); }
  nextAlive(p) {
    const n = this.players.length;
    for (let k = 1; k <= n; k++) { const q = this.players[(p.seat + k) % n]; if (q.alive) return q; }
    return p;
  }
  /** Živí hráči po směru hodinových ručiček od `p` (bez něj). */
  othersFrom(p) {
    const out = [];
    const n = this.players.length;
    for (let k = 1; k < n; k++) { const q = this.players[(p.seat + k) % n]; if (q.alive) out.push(q); }
    return out;
  }
  emit(type, data = {}) {
    const e = { seq: ++this.seq, type, ...data };
    this.events.push(e);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 300);
    return e;
  }
  say(text) { this.emit('log', { text }); }
  eventsSince(seq) { return this.events.filter((e) => e.seq > seq); }
  nm(p) { return p ? p.name : '?'; }

  // ------------------------------------------------------------------ příprava hry
  setup(list) {
    const n = list.length;
    const roles = this.shuffle(roleSet(n));
    const chars = this.shuffle(CHARS.slice()).slice(0, n);
    const seats = this.shuffle(list.slice());
    this.players = seats.map((s, i) => {
      const char = chars[i];
      const role = roles[i];
      const maxLife = char.lives + (role === 'kapitan' ? 1 : 0);
      return {
        id: s.id, name: s.name, bot: !!s.bot, avatar: s.avatar || null, seat: i,
        char, role, maxLife, life: maxLife, hand: [], table: [], status: [],
        alive: true, revealed: role === 'kapitan', lilyUsed: false, dmg: 0, turnOver: false,
      };
    });
    this.deck = this.shuffle(buildDeck(() => this.rng()));
    this.discard = [];
    for (const p of this.players) {
      const cnt = p.role === 'kapitan' ? p.char.lives : p.life;
      p.hand.push(...this.take(cnt));
    }
    this.captain = this.players.find((p) => p.role === 'kapitan');
  }

  // ------------------------------------------------------------------ balíček
  ensure(n) {
    if (this.deck.length >= n || !this.discard.length) return;
    const fresh = this.shuffle(this.discard.splice(0));
    this.deck.unshift(...fresh); // vrch balíčku je konec pole
    this.emit('reshuffle', { count: fresh.length });
  }
  take(n) { this.ensure(n); const out = []; for (let i = 0; i < n && this.deck.length; i++) out.push(this.deck.pop()); return out; }
  peek(n) { this.ensure(n); return this.deck.slice(-n).reverse(); } // [0] je nejvrchnější
  toDiscard(c) { if (c) { delete c.turnsLeft; this.discard.push(c); } }
  /** Líznutí pro „losování“ (Opasek, Vynález zkázy…): karta se ukáže a jde do odhozu. */
  flip(why, p) {
    const [c] = this.take(1);
    if (!c) return null;
    this.toDiscard(c);
    this.emit('flip', { why, pid: p ? p.id : null, card: pub(c) });
    return c;
  }
  handOf(p, id) { return p.hand.find((c) => c.id === id) || null; }
  takeFromHand(p, id) { const i = p.hand.findIndex((c) => c.id === id); return i < 0 ? null : p.hand.splice(i, 1)[0]; }
  takeFromTable(t, id) {
    for (const z of [t.table, t.status]) { const i = z.findIndex((c) => c.id === id); if (i >= 0) return z.splice(i, 1)[0]; }
    return null;
  }
  findOnTable(t, id) { return t.table.find((c) => c.id === id) || t.status.find((c) => c.id === id) || null; }

  // ------------------------------------------------------------------ pravidla: vzdálenosti, zbraně
  weaponOf(p) { return p.table.find((c) => isWeapon(c.type)) || null; }
  range(p) { const w = this.weaponOf(p); return w ? TYPES[w.type].range : 1; }
  unlimited(p) { const w = this.weaponOf(p); return p.char.id === 'blackhole' || (w && w.type === 'kulomet'); }
  slotCap(p) { return 2 + (p.char.id === 'belt' ? 1 : 0); }
  handLimit(p) { return p.life + (p.char.id === 'bench' ? 2 : 0); }
  isShot(p, c) { return c.type === 'strela' || (p.char.id === 'mjohnson' && c.type === 'stit'); }
  isMiss(p, c) { return c.type === 'stit' || (p.char.id === 'mjohnson' && c.type === 'strela'); }
  dist(a, b) {
    if (a.id === b.id) return 0;
    const al = this.alive();
    const ia = al.indexOf(a); const ib = al.indexOf(b);
    if (ia < 0 || ib < 0) return 99;
    const d = Math.abs(ia - ib);
    let r = Math.min(d, al.length - d);
    if (b.table.some((c) => c.type === 'teleport')) r += 1;
    if (a.table.some((c) => c.type === 'harpuna')) r -= 1;
    return Math.max(1, r);
  }
  inRange(a, b) { return this.dist(a, b) <= this.range(a); }

  // ------------------------------------------------------------------ ovladač generátoru
  advance(input) {
    let r;
    try { r = this.gen.next(input); } catch (e) { if (e instanceof GameOver) r = { done: true }; else throw e; }
    if (r.done) { this.pending = null; this.phase = 'over'; } else this.pending = r.value;
  }
  act(pid, action) {
    if (this.result) return { err: 'Hra už skončila.' };
    const pd = this.pending;
    if (!pd) return { err: 'Teď se nic neděje.' };
    if (pd.pid !== pid) return { err: 'Nejsi na řadě.' };
    if (!action || typeof action !== 'object') return { err: 'Neplatná akce.' };
    const e = pd.validate ? pd.validate(action) : null;
    if (e) return { err: e };
    this.advance(action);
    return { ok: true };
  }
  /** Výchozí akce pro aktuální prompt (vypršel čas / hráč odpojen). */
  autoAction() {
    const pd = this.pending;
    if (!pd) return null;
    return typeof pd.auto === 'function' ? pd.auto() : pd.auto;
  }
  prompt(pid, type, extra, validate, auto) { return { pid, type, ...extra, validate, auto }; }

  // ------------------------------------------------------------------ hlavní průběh
  *main() {
    try {
      this.phase = 'play';
      let cur = this.captain;
      for (;;) {
        yield* this.turn(cur);
        cur = this.nextAlive(cur);
      }
    } catch (e) { if (!(e instanceof GameOver)) throw e; }
  }

  *turn(p) {
    this.turnPid = p.id;
    p.turnOver = false;
    this.phase = 'start';
    this.emit('turn', { pid: p.id });
    this.say(`Na tahu je ${p.name}.`);

    // Vynález zkázy
    const dyn = p.status.find((c) => c.type === 'vynalez');
    if (dyn) {
      yield* this.dynamiteCheck(p, dyn);
      if (!p.alive) return;
    }
    // Vesmírná cela
    const cell = p.status.find((c) => c.type === 'cela');
    if (cell) {
      if (p.char.id === 'trash') { this.takeFromTable(p, cell.id); this.toDiscard(cell); this.say(`${p.name} je imunní vůči cele.`); } else {
        const usable = p.hand.filter((c) => this.isShot(p, c)).map((c) => c.id);
        let escape = false;
        if (usable.length) {
          const a = yield this.prompt(p.id, 'cell', { usable, turnsLeft: cell.turnsLeft },
            (x) => (x.escape ? (usable.includes(x.cardId) ? null : 'Tuhle kartu k útěku použít nejde.') : null), { escape: false });
          if (a.escape) {
            const c = this.takeFromHand(p, a.cardId);
            this.toDiscard(c);
            this.emit('discard', { pid: p.id, card: pub(c) });
            escape = true;
          }
        }
        if (escape) {
          this.takeFromTable(p, cell.id); this.toDiscard(cell);
          this.emit('escape', { pid: p.id });
          this.say(`${p.name} prostřelil zámek a utekl z cely!`);
        } else {
          cell.turnsLeft -= 1;
          this.say(`${p.name} sedí v cele a vynechává tah.`);
          this.emit('jailed', { pid: p.id, left: cell.turnsLeft });
          if (cell.turnsLeft <= 0) { this.takeFromTable(p, cell.id); this.toDiscard(cell); this.say(`${p.name} je po tomhle kole z cely venku.`); }
          yield* this.discardPhase(p);
          return;
        }
      }
    }

    this.phase = 'draw';
    yield* this.drawPhase(p);
    if (!p.alive) return;

    this.phase = 'play';
    for (;;) {
      yield* this.settle();
      if (!p.alive || p.turnOver) break;
      const a = yield this.prompt(p.id, 'play', {}, (x) => this.validatePlay(p, x), { act: 'end' });
      if (a.act === 'end') break;
      if (a.act === 'wild') {
        for (const id of a.cardIds) { const c = this.takeFromHand(p, id); this.toDiscard(c); }
        this.emit('discard', { pid: p.id, n: 2 });
        yield* this.heal(p, 1, p);
      } else {
        yield* this.playCard(p, a);
      }
    }
    if (!p.alive) return;
    yield* this.discardPhase(p);
  }

  *discardPhase(p) {
    this.phase = 'discard';
    yield* this.settle();
    while (p.alive && p.hand.length > this.handLimit(p)) {
      const count = p.hand.length - this.handLimit(p);
      const a = yield this.prompt(p.id, 'discard', { count }, (x) => (this.handOf(p, x.cardId) ? null : 'Tuhle kartu nemáš.'),
        () => ({ cardId: p.hand[this.rint(p.hand.length)].id }));
      const c = this.takeFromHand(p, a.cardId);
      this.toDiscard(c);
      this.emit('discard', { pid: p.id, card: pub(c) });
    }
  }

  /** Noah Lafayette: prázdná ruka = líznout. Volá se po každé akci. */
  *settle() {
    for (const q of this.alive()) {
      if (q.char.id === 'lafayette' && q.hand.length === 0) {
        const cs = this.take(1);
        q.hand.push(...cs);
        if (cs.length) { this.emit('draw', { pid: q.id, n: 1 }); this.say(`${q.name} (prázdná ruka) líznul kartu.`); }
      }
    }
    return undefined;
  }

  // ------------------------------------------------------------------ Vynález zkázy
  *dynamiteCheck(p, dyn) {
    if (p.char.id === 'trash') {
      this.passDynamite(p, dyn);
      this.say(`${p.name} (Olivia) rovnou posílá Vynález zkázy dál.`);
      return;
    }
    const c = this.flip('vynalez', p);
    if (c && c.suit === 'pulsar' && c.rank >= 2 && c.rank <= 9) {
      this.takeFromTable(p, dyn.id); this.toDiscard(dyn);
      this.emit('explode', { pid: p.id });
      this.say(`Vynález zkázy vybuchl ${p.name}ovi do tváře!`);
      yield* this.damage(p, 3, null, 'vynalez');
    } else {
      this.passDynamite(p, dyn);
      this.say(`Vynález zkázy ${p.name} nevybuchl a putuje dál.`);
    }
  }
  passDynamite(p, dyn) {
    this.takeFromTable(p, dyn.id);
    const nxt = this.nextAlive(p);
    if (nxt.id === p.id) { p.status.push(dyn); return; }
    nxt.status.push(dyn);
    this.emit('pass-status', { from: p.id, to: nxt.id, card: pub(dyn) });
  }

  // ------------------------------------------------------------------ líznutí
  *drawPhase(p) {
    const id = p.char.id;
    if (id === 'underpost') {
      const top = this.peek(3);
      if (top.length <= 2) { for (const c of top) { this.deck.splice(this.deck.indexOf(c), 1); p.hand.push(c); } } else {
        const ids = top.map((c) => c.id);
        const a = yield this.prompt(p.id, 'pick', { cards: top.map(pub), count: 2, reason: 'underpost', priv: true },
          (x) => (Array.isArray(x.picks) && x.picks.length === 2 && new Set(x.picks).size === 2 && x.picks.every((i) => ids.includes(i)) ? null : 'Vyber dvě karty.'),
          { picks: ids.slice(0, 2) });
        for (const i of a.picks) { const k = this.deck.findIndex((c) => c.id === i); p.hand.push(this.deck.splice(k, 1)[0]); }
      }
      this.emit('draw', { pid: p.id, n: 2 });
      return;
    }
    if (id === 'jjackson') {
      p.hand.push(...this.take(1));
      const second = this.take(1);
      p.hand.push(...second);
      if (second[0]) {
        this.emit('reveal', { pid: p.id, card: pub(second[0]) });
        if (isRed(second[0])) { p.hand.push(...this.take(1)); this.say(`${p.name} ukázal ${second[0].suit === 'nova' ? 'Novu' : 'Kometu'} a bere si třetí kartu.`); }
      }
      this.emit('draw', { pid: p.id, n: 2 });
      return;
    }
    let left = 2;
    if (id === 'cassidy' || id === 'acecart' || id === 'jurassic') {
      const options = this.drawSources(p);
      if (options.length > 1) {
        const a = yield this.prompt(p.id, 'drawsrc', { options }, (x) => this.validateSource(p, options, x), { src: 'deck' });
        if (a.src !== 'deck') {
          const c = this.takeSource(p, a);
          if (c) { p.hand.push(c); left -= 1; }
        }
      }
    }
    yield* this.drawCards(p, left);
  }
  drawSources(p) {
    const out = [{ src: 'deck' }];
    if (p.char.id === 'cassidy' && this.discard.length) out.push({ src: 'discard', card: pub(this.discard[this.discard.length - 1]) });
    if (p.char.id === 'acecart') {
      const t = this.alive().filter((q) => q.id !== p.id && q.hand.length).map((q) => q.id);
      if (t.length) out.push({ src: 'hand', targets: t });
    }
    if (p.char.id === 'jurassic') {
      const t = this.alive().filter((q) => q.id !== p.id && (q.table.length || q.status.length)).map((q) => ({ pid: q.id, cards: [...q.table, ...q.status].map(pub) }));
      if (t.length) out.push({ src: 'table', targets: t });
    }
    return out;
  }
  validateSource(p, options, x) {
    const o = options.find((q) => q.src === x.src);
    if (!o) return 'Tenhle zdroj teď nejde.';
    if (x.src === 'hand') return o.targets.includes(x.pid) ? null : 'Tenhle hráč nemá karty.';
    if (x.src === 'table') { const t = o.targets.find((q) => q.pid === x.pid); return t && t.cards.some((c) => c.id === x.cardId) ? null : 'Tahle karta tam není.'; }
    return null;
  }
  takeSource(p, a) {
    if (a.src === 'discard') { const c = this.discard.pop(); this.emit('draw', { pid: p.id, n: 1, src: 'discard' }); return c; }
    if (a.src === 'hand') {
      const t = this.P(a.pid);
      const c = t.hand.splice(this.rint(t.hand.length), 1)[0];
      this.emit('steal', { by: p.id, from: t.id, zone: 'hand' });
      this.say(`${p.name} vzal ${t.name}ovi kartu z ruky.`);
      return c;
    }
    if (a.src === 'table') {
      const t = this.P(a.pid);
      const c = this.takeFromTable(t, a.cardId);
      this.emit('steal', { by: p.id, from: t.id, zone: 'table', card: pub(c) });
      this.say(`${p.name} vzal ${t.name}ovi vyloženou kartu (${TYPES[c.type].name}).`);
      return c;
    }
    return null;
  }
  /** Líznutí n karet do ruky (Jack Johnson si z každé dvojice vybírá). */
  *drawCards(p, n) {
    for (let i = 0; i < n; i++) {
      if (p.char.id === 'jjohnson') {
        const top = this.peek(2);
        if (top.length === 2) {
          const ids = top.map((c) => c.id);
          const a = yield this.prompt(p.id, 'pick', { cards: top.map(pub), count: 1, reason: 'jjohnson', priv: true },
            (x) => (ids.includes(x.pick) ? null : 'Vyber jednu z karet.'), { pick: ids[0] });
          const k = this.deck.findIndex((c) => c.id === a.pick); p.hand.push(this.deck.splice(k, 1)[0]);
          const o = this.deck.pop(); // druhá karta (zbyla na vrchu)
          this.toDiscard(o);
          continue;
        }
      }
      p.hand.push(...this.take(1));
    }
    this.emit('draw', { pid: p.id, n });
  }

  // ------------------------------------------------------------------ léčení a poškození
  *heal(p, n, by) {
    const add = Math.min(n, p.maxLife - p.life);
    if (add <= 0) return;
    p.life += add;
    this.emit('heal', { pid: p.id, by: by ? by.id : null, n: add });
    this.say(`${p.name} si vyléčil ${add} život${add > 1 ? 'y' : ''}.`);
  }

  *damage(t, n, src, cause) {
    const srcP = src ? this.P(src) : null;
    const before = t.life;
    t.life -= n;
    const dealt = Math.max(0, Math.min(n, before));
    if (srcP && srcP.id !== t.id) srcP.dmg += dealt;
    this.emit('damage', { to: t.id, by: src, n: dealt, cause });
    this.say(`${t.name} ztrácí ${dealt} život${dealt > 1 ? 'y' : ''}${srcP && srcP.id !== t.id ? ` (zásah od ${srcP.name})` : ''}.`);
    if (srcP && srcP.alive && srcP.role === 'silenec' && srcP.dmg >= SILENEC_GOAL) this.finish('silenec', src);

    if (t.life <= 0) {
      if (t.char.id === 'put' && !t.lilyUsed) {
        t.lilyUsed = true; t.life = 2;
        this.emit('revive', { pid: t.id });
        this.say(`${t.name} (Lily) se zázračně uzdravila a pokračuje!`);
      }
      while (t.life <= 0) {
        const usable = t.hand.filter((c) => c.type === 'pilulka' || c.type === 'foukacka').map((c) => c.id);
        const need = 1 - t.life;
        if (usable.length < need) break;
        const a = yield this.prompt(t.id, 'rescue', { usable, need, from: src }, (x) => (x.pass || usable.includes(x.cardId) ? null : 'Tuhle kartu nejde použít.'), { pass: true });
        if (a.pass) break;
        const c = this.takeFromHand(t, a.cardId);
        this.toDiscard(c);
        this.emit('play', { by: t.id, card: pub(c), to: t.id, rescue: true });
        yield* this.heal(t, 1, t);
      }
      if (t.life <= 0) { yield* this.kill(t, src); return; }
    }
    // reakce postav na zásah
    if (t.alive && dealt > 0) {
      if (t.char.id === 'trench') {
        const cs = this.take(dealt); t.hand.push(...cs);
        if (cs.length) { this.emit('draw', { pid: t.id, n: cs.length }); this.say(`${t.name} (Oliver) líznul za zásah ${cs.length}×.`); }
      }
      if (t.char.id === 'kriko' && srcP && srcP.alive && srcP.id !== t.id && srcP.hand.length) {
        const c = srcP.hand.splice(this.rint(srcP.hand.length), 1)[0];
        t.hand.push(c);
        this.emit('steal', { by: t.id, from: srcP.id, zone: 'hand' });
        this.say(`${t.name} (El Kriko) vzal útočníkovi kartu z ruky.`);
      }
    }
  }

  *kill(v, killerId) {
    v.alive = false; v.revealed = true; v.life = 0;
    const killer = killerId ? this.P(killerId) : null;
    this.emit('death', { pid: v.id, role: v.role, by: killerId || null });
    this.say(`${v.name} je vyřazen ze hry! Byl to: ${ROLES[v.role].name}.`);
    const hand = v.hand.splice(0); const tab = [...v.table.splice(0), ...v.status.splice(0)];
    const killerOk = killer && killer.alive;
    let penalty = false;
    if (killerOk && killer.role === 'kapitan' && v.role === 'ruka') {
      penalty = true;
      const lost = killer.hand.splice(0).concat(killer.table.splice(0), killer.status.splice(0));
      for (const c of lost) this.toDiscard(c);
      this.emit('penalty', { pid: killer.id });
      this.say(`Kapitán zabil svou pravou ruku – ${killer.name} přichází o všechny karty!`);
    }
    const bj = this.alive().find((q) => q.char.id === 'blackjack' && q.id !== v.id);
    if (bj && !(killerOk && killer.id === bj.id)) {
      bj.hand.push(...hand);
      this.limbo = tab;
      let pickedId = null;
      if (tab.length === 1) pickedId = tab[0].id;
      else if (tab.length > 1) {
        const ids = tab.map((c) => c.id);
        const a = yield this.prompt(bj.id, 'pick', { cards: tab.map(pub), count: 1, reason: 'blackjack' }, (x) => (ids.includes(x.pick) ? null : 'Vyber jednu z karet.'), { pick: ids[0] });
        pickedId = a.pick;
      }
      this.limbo = [];
      for (const c of tab) { if (c.id === pickedId) bj.hand.push(c); else this.toDiscard(c); }
      this.emit('loot', { by: bj.id, from: v.id, n: hand.length + (pickedId != null ? 1 : 0) });
    } else if (killerOk && !penalty) {
      killer.hand.push(...hand, ...tab);
      this.emit('loot', { by: killer.id, from: v.id, n: hand.length + tab.length });
    } else {
      for (const c of [...hand, ...tab]) this.toDiscard(c);
    }
    yield* this.settle();
    this.checkEnd(killerId);
  }

  // ------------------------------------------------------------------ konec hry
  checkEnd(killerId) {
    const alive = this.alive();
    const killer = killerId ? this.P(killerId) : null;
    let outcome = null;
    if (!this.captain.alive) {
      outcome = alive.length === 1 && alive[0].role === 'zabijak' ? 'zabijak' : 'bandita';
    } else if (!alive.some((p) => p.role === 'bandita' || p.role === 'zabijak')) {
      outcome = 'kapitan';
    }
    if (!outcome) return;
    if (killer && killer.alive && killer.role === 'sebevrah') outcome = 'sebevrah';
    this.finish(outcome, killerId);
  }
  finish(outcome, killerId) {
    const wins = {
      kapitan: (p) => p.role === 'kapitan' || p.role === 'ruka',
      bandita: (p) => p.role === 'bandita',
      zabijak: (p) => p.role === 'zabijak',
      sebevrah: (p) => p.role === 'sebevrah',
      silenec: (p) => p.role === 'silenec',
    }[outcome];
    const text = {
      kapitan: 'Kapitán a jeho pravé ruce zničili vesmírné piráty!',
      bandita: 'Vesmírní bandité zničili Kapitána!',
      zabijak: 'Nájemný zabiják přežil jako poslední!',
      sebevrah: 'Sebevrah dosáhl svého – ukončil hru!',
      silenec: 'Pomatený šílenec nasbíral 10 zranění!',
    }[outcome];
    this.result = {
      outcome, text, killer: killerId || null,
      winners: this.players.filter(wins).map((p) => p.id),
      roles: Object.fromEntries(this.players.map((p) => [p.id, p.role])),
      dmg: Object.fromEntries(this.players.map((p) => [p.id, p.dmg])),
    };
    this.phase = 'over';
    this.emit('over', { outcome });
    this.say(text);
    throw new GameOver();
  }

  // ------------------------------------------------------------------ validace tahu
  validatePlay(p, a) {
    if (a.act === 'end') return null;
    if (a.act === 'wild') {
      if (p.char.id !== 'fwild') return 'To umí jen Frankie Wild.';
      if (p.life >= p.maxLife) return 'Máš plné životy.';
      if (!Array.isArray(a.cardIds) || a.cardIds.length !== 2 || a.cardIds[0] === a.cardIds[1]) return 'Vyber 2 karty.';
      if (!a.cardIds.every((i) => this.handOf(p, i))) return 'Tyhle karty nemáš.';
      return null;
    }
    if (a.act !== 'play') return 'Neplatná akce.';
    const c = this.handOf(p, a.cardId);
    if (!c) return 'Tuhle kartu nemáš.';
    const t = a.target != null ? this.P(a.target) : null;
    if (a.target != null && (!t || !t.alive)) return 'Cíl už není ve hře.';
    const T = TYPES[c.type];
    const needTarget = () => (!t ? 'Vyber cíl.' : null);

    if (this.isShot(p, c)) {
      if (!t) return 'Vyber, na koho střelit.';
      if (t.id === p.id) return 'Na sebe střílet nejde.';
      if (!this.inRange(p, t)) return `${t.name} je mimo dostřel (vzdálenost ${this.dist(p, t)}, dostřel ${this.range(p)}).`;
      return null;
    }
    switch (c.type) {
      case 'stit': return 'Energický štít se hraje až jako odpověď na výstřel.';
      case 'pilulka': return p.life >= p.maxLife ? 'Máš plné životy.' : null;
      case 'foukacka': return needTarget() || (t.life >= t.maxLife ? `${t.name} má plné životy.` : null);
      case 'kantyna': return this.alive().some((q) => q.life < q.maxLife) ? null : 'Všichni mají plné životy.';
      case 'varovny': {
        const e = needTarget(); if (e) return e;
        if (t.id === p.id) return 'Sám sobě ne.';
        if (this.dist(p, t) > 1) return 'Varovný výstřel dosáhne jen na vzdálenost 1.';
        if (a.tzone === 'hand') return t.hand.length ? null : `${t.name} nemá karty v ruce.`;
        if (a.tzone === 'table') return this.findOnTable(t, a.tcard) ? null : 'Tahle vyložená karta tam není.';
        return 'Vyber kartu, kterou vezmeš.';
      }
      case 'dezintegrator': {
        const e = needTarget(); if (e) return e;
        if (a.tzone === 'hand') return t.id === p.id ? 'Vlastní kartu z ruky ne.' : (t.hand.length ? null : `${t.name} nemá karty v ruce.`);
        if (a.tzone === 'table') return this.findOnTable(t, a.tcard) ? null : 'Tahle vyložená karta tam není.';
        return 'Vyber kartu, kterou zničíš.';
      }
      case 'duel': { const e = needTarget(); return e || (t.id === p.id ? 'Sám se sebou ne.' : null); }
      case 'zaloha': case 'prepadeni': case 'stanice': case 'sklad': case 'cerna_dira': return null;
      case 'cela': {
        const e = needTarget(); if (e) return e;
        if (t.id === p.id) return 'Celu nelze dát sobě.';
        if (t.role === 'kapitan') return 'Kapitána do cely zavřít nejde.';
        if (t.char.id === 'trash') return 'Olivia je vůči cele imunní.';
        if (t.status.some((q) => q.type === 'cela')) return 'Tenhle hráč už v cele je.';
        return null;
      }
      case 'vynalez': return p.status.some((q) => q.type === 'vynalez') ? 'Vynález zkázy už před sebou máš.' : (a.target != null && a.target !== p.id ? 'Vynález zkázy se pokládá před sebe.' : null);
      default:
    }
    if (T.kind === 'equip') {
      if (!isWeapon(c.type) && p.table.some((q) => q.type === c.type)) return 'Tuhle kartu už máš vyloženou.';
      if (isWeapon(c.type) && this.weaponOf(p)) return null; // nová zbraň nahradí starou
      if (p.table.length < this.slotCap(p)) return null;
      if (a.replaceId != null && p.table.some((q) => q.id === a.replaceId)) return null;
      return `Máš plno vyložených karet (max ${this.slotCap(p)}). Přetáhni kartu na tu, kterou chceš nahradit.`;
    }
    return 'Tuhle kartu teď zahrát nejde.';
  }

  // ------------------------------------------------------------------ zahrání karet
  *playCard(p, a) {
    const c = this.takeFromHand(p, a.cardId);
    const t = a.target != null ? this.P(a.target) : null;
    const T = TYPES[c.type];

    if (this.isShot(p, c)) {
      this.toDiscard(c);
      this.emit('play', { by: p.id, card: pub(c), to: t.id, as: 'strela' });
      this.say(`${p.name} střílí na ${t.name}.`);
      yield* this.shoot(p, t);
      if (!this.unlimited(p)) p.turnOver = true;
      return;
    }
    if (T.kind === 'equip') {
      let replaced = null;
      if (isWeapon(c.type) && this.weaponOf(p)) replaced = this.takeFromTable(p, this.weaponOf(p).id);
      else if (p.table.length >= this.slotCap(p)) replaced = this.takeFromTable(p, a.replaceId);
      if (replaced) this.toDiscard(replaced);
      p.table.push(c);
      this.emit('equip', { by: p.id, card: pub(c), replaced: pub(replaced) });
      this.say(`${p.name} vykládá ${T.name}.`);
      return;
    }
    if (c.type === 'cela') {
      c.turnsLeft = 2;
      t.status.push(c);
      this.emit('equip', { by: p.id, to: t.id, card: pub(c) });
      this.say(`${p.name} zavírá ${t.name} do vesmírné cely!`);
      return;
    }
    if (c.type === 'vynalez') {
      p.status.push(c);
      this.emit('equip', { by: p.id, card: pub(c) });
      this.say(`${p.name} vykládá Vynález zkázy.`);
      return;
    }
    // okamžité karty jdou do odhozu
    this.toDiscard(c);
    this.emit('play', { by: p.id, card: pub(c), to: t ? t.id : null });
    switch (c.type) {
      case 'pilulka': this.say(`${p.name} bere Pilulku.`); yield* this.heal(p, 1, p); break;
      case 'foukacka': this.say(`${p.name} foukl uzdravující šipku na ${t.name}.`); yield* this.heal(t, 1, p); break;
      case 'kantyna':
        this.say(`${p.name} zve všechny do Kosmické kantýny.`);
        for (const q of this.alive()) yield* this.heal(q, 1, p);
        break;
      case 'sklad': this.say(`${p.name} bere 2 karty ze skladu.`); yield* this.drawCards(p, 2); break;
      case 'cerna_dira': this.say(`${p.name} sahá do Černé díry pro 3 karty.`); yield* this.drawCards(p, 3); break;
      case 'varovny': {
        let got;
        if (a.tzone === 'hand') { got = t.hand.splice(this.rint(t.hand.length), 1)[0]; this.emit('steal', { by: p.id, from: t.id, zone: 'hand' }); this.say(`${p.name} vzal ${t.name}ovi kartu z ruky.`); } else {
          got = this.takeFromTable(t, a.tcard); this.emit('steal', { by: p.id, from: t.id, zone: 'table', card: pub(got) }); this.say(`${p.name} vzal ${t.name}ovi ${TYPES[got.type].name}.`);
        }
        delete got.turnsLeft;
        p.hand.push(got);
        break;
      }
      case 'dezintegrator': {
        let got;
        if (a.tzone === 'hand') { got = t.hand.splice(this.rint(t.hand.length), 1)[0]; this.say(`${p.name} zničil ${t.name}ovi kartu z ruky.`); } else {
          got = this.takeFromTable(t, a.tcard); this.say(`${p.name} zničil ${t.name}ovi ${TYPES[got.type].name}.`);
        }
        this.toDiscard(got);
        this.emit('destroy', { by: p.id, from: t.id, zone: a.tzone, card: a.tzone === 'table' ? pub(got) : null });
        break;
      }
      case 'duel': this.say(`${p.name} vyzývá ${t.name} na souboj!`); yield* this.duel(p, t); break;
      case 'zaloha': this.say(`${p.name} svolává Banditskou zálohu!`); yield* this.raid(p, 'zaloha'); break;
      case 'prepadeni': this.say(`${p.name} spouští Laserové přepadení!`); yield* this.raid(p, 'prepadeni'); break;
      case 'stanice': yield* this.station(p); break;
      default:
    }
  }

  *shoot(p, t) {
    let need = p.char.id === 'mat' ? 2 : 1;
    const flips = [];
    if (t.table.some((c) => c.type === 'opasek')) flips.push('opasek');
    if (t.char.id === 'doe') flips.push('doe');
    for (const why of flips) {
      if (need <= 0) break;
      const c = this.flip(why, t);
      if (c && c.suit === 'nova') { need -= 1; this.emit('barrel', { pid: t.id, why }); this.say(`${t.name} měl štěstí – střela ho minula!`); }
    }
    while (need > 0) {
      const usable = t.hand.filter((c) => this.isMiss(t, c)).map((c) => c.id);
      if (usable.length < need) break;
      const a = yield this.prompt(t.id, 'respond', { from: p.id, need, cause: 'shot', usable },
        (x) => (x.pass || usable.includes(x.cardId) ? null : 'Tuhle kartu teď nemůžeš zahrát.'), { pass: true });
      if (a.pass) break;
      const c = this.takeFromHand(t, a.cardId);
      this.toDiscard(c);
      this.emit('play', { by: t.id, card: pub(c), to: p.id, defend: true });
      need -= 1;
    }
    if (need <= 0) { this.emit('miss', { by: p.id, to: t.id }); this.say(`${t.name} se střele vyhnul.`); return; }
    yield* this.damage(t, 1, p.id, 'shot');
  }

  *duel(p, t) {
    let cur = t; let opp = p;
    for (;;) {
      const usable = cur.hand.filter((c) => this.isShot(cur, c)).map((c) => c.id);
      let lost = true;
      if (usable.length) {
        const a = yield this.prompt(cur.id, 'respond', { from: opp.id, need: 1, cause: 'duel', usable },
          (x) => (x.pass || usable.includes(x.cardId) ? null : 'Tuhle kartu teď nemůžeš zahrát.'), { pass: true });
        if (!a.pass) {
          const c = this.takeFromHand(cur, a.cardId);
          this.toDiscard(c);
          this.emit('play', { by: cur.id, card: pub(c), to: opp.id, duel: true });
          lost = false;
        }
      }
      if (lost) { yield* this.damage(cur, 1, opp.id, 'duel'); return; }
      [cur, opp] = [opp, cur];
    }
  }

  *raid(p, cause) {
    for (const t of this.othersFrom(p)) {
      if (!t.alive) continue;
      const usable = t.hand.filter((c) => (cause === 'zaloha' ? this.isShot(t, c) : this.isMiss(t, c))).map((c) => c.id);
      if (usable.length) {
        const a = yield this.prompt(t.id, 'respond', { from: p.id, need: 1, cause, usable },
          (x) => (x.pass || usable.includes(x.cardId) ? null : 'Tuhle kartu teď nemůžeš odhodit.'), { pass: true });
        if (!a.pass) {
          const c = this.takeFromHand(t, a.cardId);
          this.toDiscard(c);
          this.emit('discard', { pid: t.id, card: pub(c) });
          continue;
        }
      }
      yield* this.damage(t, 1, p.id, cause);
    }
  }

  *station(p) {
    const order = [p, ...this.othersFrom(p)];
    this.revealed = this.take(order.length);
    this.emit('station', { cards: this.revealed.map(pub) });
    this.say(`Vesmírná stanice: otočeno ${this.revealed.length} karet.`);
    for (const q of order) {
      if (!this.revealed.length) break;
      let pick;
      if (this.revealed.length === 1) pick = this.revealed[0].id;
      else {
        const ids = this.revealed.map((c) => c.id);
        const a = yield this.prompt(q.id, 'pick', { cards: this.revealed.map(pub), count: 1, reason: 'stanice' },
          (x) => (ids.includes(x.pick) ? null : 'Vyber jednu z karet na stole.'), { pick: ids[0] });
        pick = a.pick;
      }
      const k = this.revealed.findIndex((c) => c.id === pick);
      q.hand.push(this.revealed.splice(k, 1)[0]);
      this.emit('station-pick', { pid: q.id, id: pick });
    }
    for (const c of this.revealed.splice(0)) this.toDiscard(c);
  }

  // ------------------------------------------------------------------ pohled pro klienta
  view(viewerId) {
    const me = this.P(viewerId);
    const over = !!this.result;
    const pend = this.pending;
    let prompt = null;
    if (pend) {
      prompt = { pid: pend.pid, type: pend.type };
      for (const k of ['from', 'need', 'cause', 'count', 'reason', 'turnsLeft']) if (pend[k] !== undefined) prompt[k] = pend[k];
      if (pend.pid === viewerId) {
        for (const k of ['usable', 'cards', 'options']) if (pend[k] !== undefined) prompt[k] = pend[k];
      } else if (pend.cards && !pend.priv) prompt.cards = pend.cards;
    }
    return {
      over, result: this.result,
      turn: this.turnPid, phase: this.phase,
      deck: this.deck.length, discardCount: this.discard.length,
      discardTop: this.discard.length ? pub(this.discard[this.discard.length - 1]) : null,
      revealed: this.revealed.map(pub),
      seq: this.seq,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, bot: p.bot, avatar: p.avatar, seat: p.seat,
        char: p.char.id, maxLife: p.maxLife, life: p.life, alive: p.alive,
        handCount: p.hand.length, hand: p.id === viewerId || over ? p.hand.map(pub) : undefined,
        table: p.table.map(pub), status: p.status.map(pub),
        role: p.revealed || p.id === viewerId || over ? p.role : null,
        dist: me && me.alive && p.alive && p.id !== viewerId ? this.dist(me, p) : null,
        lilyUsed: p.char.id === 'put' ? p.lilyUsed : undefined,
        dmg: over || p.id === viewerId ? p.dmg : undefined,
      })),
      me: me ? { range: this.range(me), unlimited: !!this.unlimited(me), handLimit: this.handLimit(me), slots: this.slotCap(me) } : null,
      prompt,
      log: this.events.filter((e) => e.type === 'log').slice(-40).map((e) => ({ seq: e.seq, text: e.text })),
    };
  }
}

/** Kontrola kvůli testům: počet karet v obběhu musí být vždy 82. */
export function cardCount(g) {
  let n = g.deck.length + g.discard.length + g.revealed.length + g.limbo.length;
  for (const p of g.players) n += p.hand.length + p.table.length + p.status.length;
  return n;
}
export { charById };
