'use strict';
/**
 * Kolo štěstí: serverová část (peníze).
 * Kolo má 24 shodných výsečí. Výsledek losuje server (podle vah, ne podle velikosti výseče), klient jen
 * rozkrouží kolo tak, aby se zastavilo na vylosované výseči.
 *  - roztočení stojí 100 žetonů (strhne se hned),
 *  - výhra se připíše až po dotočení kola (`collect`), nejdřív po minimální době, ať se zůstatek neprozradí předem,
 *  - výseč „500 + jackpotový roztoč“ vyplatí 500 a hráč dostane jedno zdarma kolo s tabulkou jen velkých výher,
 *  - jackpot 10 000 má na hlavním kole šanci 0,1 %, v bonusovém roztočení 5 %.
 * Rozehraný, ale nesebraný výsledek se při dalším načtení stránky (state) hráči připíše, nic nepropadne.
 */
const SC = Number(process.env.TIME_SCALE) > 0 ? Number(process.env.TIME_SCALE) : 1;

// pořadí výsečí kolem dokola (24 kusů); star = „jackpotový roztoč“
const SLOTS = Object.freeze([
  { v: 20 }, { v: 100 }, { v: 50 }, { v: 300 }, { v: 40 }, { v: 70 }, { v: 20 }, { v: 1000 }, { v: 150 }, { v: 50 }, { v: 40 }, { v: 100 },
  { v: 20 }, { v: 200 }, { v: 70 }, { v: 500, star: true }, { v: 40 }, { v: 50 }, { v: 20 }, { v: 150 }, { v: 100 }, { v: 70 }, { v: 200 }, { v: 10000 },
].map((s) => Object.freeze(s)));

// šance (v tisícinách) pro hlavní kolo: klíč = index první výseče dané hodnoty se řídí hodnotou (a hvězdou)
const MAIN_W = Object.freeze([
  { v: 20, w: 305 }, { v: 40, w: 210 }, { v: 50, w: 150 }, { v: 70, w: 110 }, { v: 100, w: 90 }, { v: 150, w: 60 },
  { v: 200, w: 40 }, { v: 300, w: 20 }, { v: 500, star: true, w: 10 }, { v: 1000, w: 4 }, { v: 10000, w: 1 },
]);
// bonusový (jackpotový) roztoč: jen velké výhry
const BONUS_W = Object.freeze([{ v: 200, w: 450 }, { v: 300, w: 300 }, { v: 1000, w: 200 }, { v: 10000, w: 50 }]);

const WHEEL = Object.freeze({
  PRICE: 100,
  JACKPOT: 10000,
  SLOTS, MAIN_W, BONUS_W,
  MIN_COLLECT_MS: Math.max(40, Math.round(4000 * SC)), // kolo se točí asi 6 s, dřív výhru nevyplatíme
  MAX_PENDING_MS: 10 * 60 * 1000,
});

const slotIndexes = (v, star) => SLOTS.map((s, i) => i).filter((i) => SLOTS[i].v === v && !!SLOTS[i].star === !!star);
for (const t of [...MAIN_W, ...BONUS_W]) if (!slotIndexes(t.v, t.star).length) throw new Error('Kolo: chybí výseč ' + t.v);

module.exports = function createWheel({ resolveAccount, markDirty, notifyBalance, TOKEN_RE, FLOOR = 200, rand = Math.random }) {
  const pending = new Map(); // acc.key -> { id, at, value, slot, star, bonus }
  let seq = 0;

  const rtp = (table) => { const tot = table.reduce((a, t) => a + t.w, 0); return table.reduce((a, t) => a + t.w * t.v, 0) / tot; };
  const pub = (acc) => ({
    price: WHEEL.PRICE, jackpot: WHEEL.JACKPOT,
    slots: SLOTS.map((s) => (s.star ? [s.v, 1] : [s.v, 0])),
    main: MAIN_W.map((t) => ({ v: t.v, star: !!t.star, w: t.w })), mainTotal: MAIN_W.reduce((a, t) => a + t.w, 0),
    bonusTable: BONUS_W.map((t) => ({ v: t.v, w: t.w })), bonusTotal: BONUS_W.reduce((a, t) => a + t.w, 0),
    bonus: !!(acc && acc.wheelBonus),
  });
  const state = (acc, extra) => ({ balance: acc.balance, floor: FLOOR, ...pub(acc), ...extra });
  const bad = (status, error) => ({ status, json: { error } });

  /** Obnova kreditu jako jinde: bez rozehraného kola a pod minimem se zůstatek doplní. */
  function topUp(acc) {
    if (pending.has(acc.key) || acc.wheelBonus || acc.seat || acc.htable) return false;
    if (acc.balance >= FLOOR) return false;
    acc.balance = FLOOR; markDirty(); notifyBalance(acc);
    return true;
  }

  function pick(table) {
    const total = table.reduce((a, t) => a + t.w, 0);
    let r = rand() * total;
    for (const t of table) { r -= t.w; if (r < 0) return t; }
    return table[table.length - 1];
  }
  function roll(table) {
    const t = pick(table); const idx = slotIndexes(t.v, t.star);
    const slot = idx[Math.min(idx.length - 1, Math.floor(rand() * idx.length))];
    return { value: t.v, star: !!t.star, slot };
  }

  /** Připíše výhru čekajícího roztočení; vrátí popis, co se stalo. */
  function settle(acc, p) {
    pending.delete(acc.key);
    acc.balance += p.value; markDirty(); notifyBalance(acc);
    if (p.bonus) acc.wheelBonus = 0;
    if (p.star) acc.wheelBonus = 1;
    return { value: p.value, slot: p.slot, star: p.star, bonus: p.bonus, jackpot: p.value === WHEEL.JACKPOT };
  }

  function handle(action, body) {
    if (!body || typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) return bad(400, 'Neplatný token.');
    const { acc } = resolveAccount({ token: body.token, session: typeof body.session === 'string' ? body.session : undefined });
    acc.lastSeen = Date.now();

    if (action === 'state') {
      let settled = null;
      if (body.fresh) { const p = pending.get(acc.key); if (p) settled = settle(acc, p); } // stránka se načetla znovu: výhra z nedotočeného kola se připíše
      const r = topUp(acc);
      return { status: 200, json: state(acc, { refilled: r, settled }) };
    }

    if (action === 'spin' || action === 'bonus') {
      const isBonus = action === 'bonus';
      const old = pending.get(acc.key);
      if (old && Date.now() - old.at > WHEEL.MAX_PENDING_MS) pending.delete(acc.key);
      else if (old) return bad(409, 'Předchozí kolo ještě není dotočené.');
      if (isBonus) {
        if (!acc.wheelBonus) return bad(409, 'Nemáš jackpotový roztoč.');
      } else {
        if (acc.wheelBonus) return bad(409, 'Nejdřív využij jackpotový roztoč zdarma.');
        if (acc.balance < WHEEL.PRICE) return bad(402, 'Nemáš dost žetonů.');
        acc.balance -= WHEEL.PRICE; markDirty(); notifyBalance(acc);
      }
      const r = roll(isBonus ? BONUS_W : MAIN_W);
      const p = { id: ++seq, at: Date.now(), value: r.value, slot: r.slot, star: r.star, bonus: isBonus };
      pending.set(acc.key, p);
      return { status: 200, json: state(acc, { spinId: p.id, slot: p.slot, value: p.value, star: p.star, isBonus }) };
    }

    if (action === 'collect') {
      const p = pending.get(acc.key);
      if (!p || p.id !== Number(body.spinId)) return bad(409, 'Tohle kolo už skončilo.');
      if (Date.now() - p.at < WHEEL.MIN_COLLECT_MS) return bad(409, 'Kolo se ještě točí.');
      const won = settle(acc, p);
      const refilled = topUp(acc);
      return { status: 200, json: state(acc, { won, refilled }) };
    }

    return bad(404, 'Neznámá akce.');
  }

  return { handle, WHEEL, removeAccount: (acc) => pending.delete(acc.key), expected: () => ({ main: rtp(MAIN_W), bonus: rtp(BONUS_W) }) };
};
module.exports.WHEEL = WHEEL;
