// Vesmírná štvanice – mozek bota.
// Bot nikdy nepodvádí: o ostatních vidí jen to, co vidí člověk (počet karet, vyložené karty, životy, odhalené role mrtvých,
// kdo na koho střílel). Z toho si vede pravděpodobnostní odhad rolí a podle vlastní role rozhoduje, na koho střílet,
// koho léčit a koho nechat být.
import { TYPES, isWeapon, roleSet } from './data.js';
import { enumeratePlays } from './actions.js';

const ROLE_LIST = ['kapitan', 'ruka', 'bandita', 'zabijak', 'sebevrah', 'silenec'];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class Bot {
  constructor(game, pid, rng = Math.random) {
    this.g = game; this.pid = pid; this.rng = rng;
    this.ev = {};      // pid -> { role: násobitel důkazů }
    this.grudge = {};  // pid -> kolik mi ublížil
    this.seen = game.seq;
    this.turns = 0;
  }
  me() { return this.g.P(this.pid); }

  // ------------------------------------------------------------ odhad rolí
  observe() {
    const g = this.g;
    for (const e of g.eventsSince(this.seen)) this.onEvent(e);
    this.seen = g.seq;
  }
  mult(pid, role, f) {
    const m = (this.ev[pid] ||= {});
    m[role] = clamp((m[role] ?? 1) * f, 0.04, 25);
  }
  /** Rozložení rolí hráče q (jen z veřejných informací). */
  probs(q) {
    const g = this.g; const me = this.me();
    if (q.id === me.id) return { [me.role]: 1 };
    if (q.revealed) return { [q.role]: 1 };
    const pool = {};
    for (const r of roleSet(g.players.length)) pool[r] = (pool[r] || 0) + 1;
    pool[me.role] -= 1;
    for (const p of g.players) if (p.revealed && p.id !== me.id) pool[p.role] -= 1;
    const w = {}; let sum = 0;
    for (const r of ROLE_LIST) {
      const cnt = Math.max(0, pool[r] || 0);
      w[r] = cnt * ((this.ev[q.id] || {})[r] ?? 1);
      sum += w[r];
    }
    if (sum <= 0) { for (const r of ROLE_LIST) if ((pool[r] || 0) > 0) { w[r] = 1; sum += 1; } }
    const out = {};
    for (const r of ROLE_LIST) out[r] = sum ? w[r] / sum : 0;
    return out;
  }
  late() { // pozdní fáze pro Zabijáka: bandité jsou pryč, nebo zbývá málo hráčů
    const g = this.g;
    return g.players.filter((p) => !p.alive && p.role === 'bandita').length >= 2 || g.alive().length <= 3;
  }
  attackEvidence(xid, yid, s) {
    const g = this.g; const me = this.me();
    if (xid === me.id || !xid) return;
    const X = g.P(xid); if (!X || X.revealed) return;
    const Y = g.P(yid); if (!Y) return;
    const py = this.probs(Y);
    const aC = (py.kapitan || 0) + (py.ruka || 0);
    const bC = py.bandita || 0;
    this.mult(xid, 'bandita', 1 + s * 2 * aC); this.mult(xid, 'bandita', 1 - s * 0.6 * bC);
    this.mult(xid, 'ruka', 1 + s * 2 * bC); this.mult(xid, 'ruka', 1 - s * 0.85 * aC);
    this.mult(xid, 'sebevrah', 1 + s * 1.6 * (py.kapitan || 0));
    this.mult(xid, 'zabijak', 1 + s * 0.8 * bC);
    this.mult(xid, 'silenec', 1 + s * 0.25);
  }
  onEvent(e) {
    const me = this.me();
    if (e.type === 'turn' && e.pid === this.pid) this.turns++;
    if (e.type === 'play' && e.to && !e.defend && !e.duel && !e.rescue) {
      if (e.as === 'strela' || e.card.type === 'strela') this.attackEvidence(e.by, e.to, 1);
      else if (e.card.type === 'duel') this.attackEvidence(e.by, e.to, 0.8);
      else if (e.card.type === 'foukacka' && e.by !== e.to) {
        const X = this.g.P(e.by); const Y = this.g.P(e.to);
        if (X && Y && !X.revealed && e.by !== me.id) {
          const py = this.probs(Y); const aC = (py.kapitan || 0) + (py.ruka || 0); const bC = py.bandita || 0;
          this.mult(e.by, 'ruka', 1 + 2.2 * aC); this.mult(e.by, 'ruka', 1 - 0.7 * bC);
          this.mult(e.by, 'bandita', 1 + 2.2 * bC); this.mult(e.by, 'bandita', 1 - 0.8 * aC);
          this.mult(e.by, 'sebevrah', 1 - 0.5 * (py.kapitan || 0));
        }
      }
    } else if (e.type === 'equip' && e.to && e.to !== e.by && e.card.type === 'cela') {
      this.attackEvidence(e.by, e.to, 0.6);
    } else if (e.type === 'damage' && e.to === me.id && e.by && e.by !== me.id && ['shot', 'duel'].includes(e.cause)) {
      this.grudge[e.by] = Math.min(1, (this.grudge[e.by] || 0) + 0.25 * e.n);
    } else if (e.type === 'death' && e.by && e.by !== e.pid) {
      this.attackEvidence(e.by, e.pid, 1);
    }
  }

  // ------------------------------------------------------------ hodnota ublížení
  /** Kladné = je dobré tomuhle hráči ubrat život, záporné = chci ho udržet naživu. */
  harm(q) {
    const g = this.g; const me = this.me();
    if (!q.alive || q.id === me.id) return 0;
    const p = this.probs(q);
    const cap = g.captain;
    let W;
    switch (me.role) {
      case 'kapitan': W = { bandita: 1.0, zabijak: 0.75, sebevrah: 0.8, silenec: 0.5, ruka: -1.6, kapitan: 0 }; break;
      case 'ruka': W = { bandita: 1.0, zabijak: 0.6, sebevrah: 0.75, silenec: 0.45, ruka: -1.6, kapitan: -6 }; break;
      case 'bandita': W = { kapitan: 1.7, ruka: 1.9, zabijak: 0.35, sebevrah: 0.65, silenec: 0.3, bandita: -3.5 }; break;
      case 'zabijak':
        if (!this.late()) W = { bandita: 1.0, ruka: 0.12, sebevrah: 0.6, silenec: 0.4, zabijak: 0, kapitan: -4 };
        else W = { ruka: 1.0, sebevrah: 0.8, silenec: 0.85, bandita: 0.9, zabijak: 0, kapitan: g.alive().length === 2 ? 8 : -1.6 };
        break;
      case 'sebevrah': W = { kapitan: 3.2, ruka: 0.35, bandita: -0.25, zabijak: 0.15, silenec: 0.1, sebevrah: 0 }; break;
      default: W = { kapitan: cap.life <= 1 ? -0.8 : 0.7, ruka: 1, bandita: 1, zabijak: 1, sebevrah: 1, silenec: 0 }; // Šílenec
    }
    let v = 0;
    for (const r of ROLE_LIST) v += (p[r] || 0) * (W[r] || 0);
    v += 0.35 * (this.grudge[q.id] || 0);
    return v;
  }
  ally(q) { return Math.max(0, -this.harm(q)); } // jak moc chci hráče udržet naživu

  // ------------------------------------------------------------ hodnota karet
  keep(c) {
    const g = this.g; const me = this.me();
    const hurt = me.life < me.maxLife;
    const sameInHand = me.hand.filter((x) => x.type === c.type).length;
    switch (c.type) {
      case 'cerna_dira': return 9;
      case 'sklad': return 8;
      case 'pilulka': return hurt ? 9 : 5.5;
      case 'stit': return me.char.id === 'mjohnson' ? 6.5 : 7 - (sameInHand > 2 ? 2 : 0);
      case 'strela': return (me.role === 'silenec' ? 8 : 6.5) - (sameInHand > 2 ? 1.5 : 0);
      case 'foukacka': return 5;
      case 'duel': return 6;
      case 'varovny': return 6.5;
      case 'dezintegrator': return 5.5;
      case 'zaloha': case 'prepadeni': return me.role === 'silenec' ? 7 : 5;
      case 'stanice': return 6;
      case 'kantyna': return 4.8;
      case 'cela': return 5.2;
      case 'vynalez': return me.role === 'ruka' || me.role === 'kapitan' ? 1 : 3;
      case 'opasek': return me.table.some((x) => x.type === 'opasek') ? 1 : 6.5;
      case 'teleport': return me.table.some((x) => x.type === 'teleport') ? 1 : 5;
      case 'harpuna': return me.table.some((x) => x.type === 'harpuna') ? 1 : 4.5;
      default:
        if (isWeapon(c.type)) { const cur = g.range(me); const r = TYPES[c.type].range; return r > cur ? 4.5 + (r - cur) * 0.4 : (c.type === 'kulomet' ? 3 : 1.2); }
        return 2;
    }
  }
  worstCards(list, n) { return list.slice().sort((a, b) => this.keep(a) - this.keep(b)).slice(0, n); }

  // ------------------------------------------------------------ rozhodování
  decide() {
    this.observe();
    const g = this.g; const pd = g.pending;
    if (!pd || pd.pid !== this.pid) return null;
    const me = this.me();
    switch (pd.type) {
      case 'play': return this.decidePlay();
      case 'respond': return this.decideRespond(pd);
      case 'rescue': return { cardId: pd.usable.find((id) => me.hand.find((c) => c.id === id).type === 'pilulka') ?? pd.usable[0] };
      case 'cell': return { escape: true, cardId: this.worstCards(me.hand.filter((c) => pd.usable.includes(c.id)), 1)[0].id };
      case 'discard': return { cardId: this.worstCards(me.hand, 1)[0].id };
      case 'pick': return this.decidePick(pd);
      case 'drawsrc': return this.decideSource(pd);
      default: return g.autoAction();
    }
  }

  decideRespond(pd) {
    const g = this.g; const me = this.me();
    const cards = pd.usable.map((id) => me.hand.find((c) => c.id === id));
    if (pd.cause === 'shot' || pd.cause === 'duel') {
      // střelbě (i duelu) se vždy brání; v duelu jen když se vyplatí pokračovat (jinak ztratím život tak jako tak)
      return { cardId: this.worstCards(cards, 1)[0].id };
    }
    // záloha / přepadení: karta za život – platím kartou, když jsem zranitelný, nebo mám přebytek
    if (me.life <= 2 || cards.length >= 2 || me.hand.length > g.handLimit(me)) return { cardId: this.worstCards(cards, 1)[0].id };
    return { pass: true };
  }

  decidePick(pd) {
    const cards = pd.cards;
    const val = (c) => this.keep(c) + (c.type && isWeapon(c.type) ? 0 : 0);
    if (pd.count === 2) {
      const sorted = cards.slice().sort((a, b) => val(b) - val(a));
      return { picks: [sorted[0].id, sorted[1].id] };
    }
    const best = cards.slice().sort((a, b) => val(b) - val(a))[0];
    return { pick: best.id };
  }

  decideSource(pd) {
    const g = this.g; const me = this.me();
    for (const o of pd.options) {
      if (o.src === 'discard' && this.keep(o.card) >= 6.4) return { src: 'discard' };
      if (o.src === 'hand') {
        const t = o.targets.map((id) => g.P(id)).filter((q) => this.harm(q) > -0.3).sort((a, b) => b.hand.length - a.hand.length)[0];
        if (t && t.hand.length >= 2) return { src: 'hand', pid: t.id };
      }
      if (o.src === 'table') {
        let best = null; let bs = 0;
        for (const t of o.targets) {
          const q = g.P(t.pid);
          if (this.harm(q) < -0.3) continue;
          for (const c of t.cards) {
            const s = ['cela', 'vynalez'].includes(c.type) ? 0 : this.keep(c);
            if (s > bs && s >= 5) { bs = s; best = { src: 'table', pid: t.pid, cardId: c.id }; }
          }
        }
        if (best) return best;
      }
    }
    return { src: 'deck' };
  }

  // ------------------------------------------------------------ hlavní fáze
  shotThreshold() {
    const me = this.me();
    const over = me.hand.length > this.g.handLimit(me) + 1; // propadnou mi karty → radši vystřelím
    return Math.max(over ? 0.02 : 0.08, 0.3 - 0.012 * this.turns);
  }

  decidePlay() {
    const g = this.g; const me = this.me();
    const plays = enumeratePlays(g, me);
    let best = null; let bestS = 1.2;
    const unlimited = g.unlimited(me);
    const thr = this.shotThreshold();
    let bestShot = null; let bestShotV = -1e9;
    for (const a of plays) {
      if (a.act === 'wild') { if (me.life <= 2 && me.hand.length >= 3) { const two = this.worstCards(me.hand, 2); if (4 > bestS) { best = { act: 'wild', cardIds: two.map((c) => c.id) }; bestS = 4; } } continue; }
      const c = me.hand.find((x) => x.id === a.cardId);
      if (g.isShot(me, c)) {
        const t = g.P(a.target);
        let v = this.harm(t) * (t.life <= 1 ? 1.4 : 1);
        if (me.role === 'sebevrah' && t.role === 'kapitan' && t.revealed) v += 1;
        if (v >= thr && v > bestShotV) { bestShotV = v; bestShot = a; }
        continue;
      }
      const s = this.score(a, c);
      if (s > bestS) { best = a; bestS = s; }
    }
    if (bestShot) {
      // střela končí tah (kromě neomezených střelců) → hraje se jako poslední, ale s bonusem u neomezených
      if (unlimited) { const s = 3 + bestShotV * 2; if (s > bestS) return bestShot; } else if (!best) return bestShot;
    }
    return best || { act: 'end' };
  }

  score(a, c) {
    const g = this.g; const me = this.me();
    const t = a.target != null ? g.P(a.target) : null;
    const others = g.alive().filter((q) => q.id !== me.id);
    switch (c.type) {
      case 'cerna_dira': return 9.5;
      case 'sklad': return 8;
      case 'stanice': return 6.5;
      case 'pilulka': {
        if (me.life >= me.maxLife) return 0;
        if (me.life <= 2) return 9;
        return me.hand.length > g.handLimit(me) ? 5 : 0;
      }
      case 'foukacka': {
        if (t.life >= t.maxLife) return 0;
        const ben = t.id === me.id ? 1 : this.ally(t);
        if (ben < 0.35) return 0;
        const need = t.life <= 2 ? 7.5 : 3.6;
        return need * Math.min(1.5, ben) * (t.id === me.id && me.hand.some((x) => x.type === 'pilulka') ? 0.6 : 1);
      }
      case 'kantyna': {
        let net = 0;
        for (const q of g.alive()) if (q.life < q.maxLife) net += q.id === me.id ? 1 : -this.harm(q);
        return net > 0.8 ? 5 + net : 0;
      }
      case 'varovny': case 'dezintegrator': return this.scoreSteal(a, c, t);
      case 'duel': {
        const v = this.harm(t);
        const mine = me.hand.filter((x) => g.isShot(me, x) && x.id !== c.id).length;
        if (v < 0.45 || mine < 1 || mine < 0.3 * t.hand.length) return 0;
        return 3.5 + 2 * v;
      }
      case 'zaloha': case 'prepadeni': {
        let net = 0;
        for (const q of others) {
          const hc = q.hand.length;
          const pHit = hc <= 1 ? 0.8 : hc === 2 ? 0.6 : 0.4;
          net += this.harm(q) * pHit;
        }
        return net > 0.9 ? 3 + net : 0;
      }
      case 'cela': {
        const v = this.harm(t);
        if (v < 0.45) return 0;
        return 3 + 3 * v;
      }
      case 'vynalez': {
        if (me.role === 'kapitan' || me.role === 'ruka') return 0;
        return me.life >= 3 && g.alive().length >= 4 && this.rng() < 0.6 ? 2 : 0;
      }
      case 'opasek': case 'teleport': case 'harpuna': {
        const base = c.type === 'opasek' ? 6.5 : c.type === 'teleport' ? 5.2 : 4.4;
        if (a.replaceId != null) {
          const old = me.table.find((x) => x.id === a.replaceId);
          return this.keep(c) - this.keep(old) - 1.2 > 1 ? base - 3 : 0;
        }
        if (c.type === 'harpuna') {
          const reach = others.some((q) => this.harm(q) > 0.3 && g.dist(me, q) === g.range(me) + 1);
          return reach ? base + 1 : base - 1.5;
        }
        return base;
      }
      default:
        if (isWeapon(c.type)) {
          const cur = g.range(me); const r = TYPES[c.type].range;
          if (c.type === 'kulomet') {
            const shots = me.hand.filter((x) => g.isShot(me, x)).length;
            return shots >= 2 && !g.unlimited(me) ? 5.5 : 0;
          }
          if (r <= cur) return 0;
          const reach = others.some((q) => this.harm(q) > 0.3 && g.dist(me, q) > cur && g.dist(me, q) <= r);
          if (a.replaceId != null) return reach ? 4 : 0;
          return reach ? 6 : 2.5;
        }
        return 0;
    }
  }

  scoreSteal(a, c, t) {
    const g = this.g; const me = this.me();
    const isVar = c.type === 'varovny';
    if (a.tzone === 'hand') {
      const v = this.harm(t);
      if (v < 0.3) return 0;
      return (isVar ? 3.4 : 2.7) * v * Math.min(1.4, 0.45 + t.hand.length * 0.25);
    }
    const tc = [...t.table, ...t.status].find((x) => x.id === a.tcard);
    if (!tc) return 0;
    if (tc.type === 'vynalez') {
      if (t.id === me.id) return 7;
      const ben = this.ally(t); return ben > 0.5 ? 5 * Math.min(1.5, ben) : 0;
    }
    if (tc.type === 'cela') {
      const ben = t.id === me.id ? 1 : this.ally(t);
      return ben > 0.4 ? 6 * Math.min(1.5, ben) : 0;
    }
    const v = this.harm(t);
    if (t.id === me.id || v < 0.3) return 0;
    let s = tc.type === 'opasek' ? 4.2 : tc.type === 'teleport' ? 3.8 : tc.type === 'harpuna' ? 3.2 : 2.6 + (TYPES[tc.type].range || 1) * 0.35;
    s *= Math.min(1.5, v);
    if (isVar && this.keep(tc) >= 4.4 && me.table.length < g.slotCap(me)) s += 1.3;
    return s + (isVar ? 0.5 : 0);
  }
}
