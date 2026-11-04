'use strict';
/**
 * Key Master: serverová část (peníze).
 * Hra sama (klíč jezdí po patře, hráč ho zastaví nad zámkem) běží v prohlížeči; server hlídá:
 *  - cenu pokusu (100 žetonů, strhne se při startu),
 *  - jednu souvislou jízdu klíče nahoru: hráč ho zastaví v patře, které chce (1–3), a server to potvrdí jednou (`stage`), nejdřív po minimální době dojezdu do toho patra,
 *  - odměnu: určuje ji server podle patra, ve kterém se klíč trefil (1 = coiny, 2 = malá věc, 3 = velká věc); klient ji po trefě rovnou vybere (`claim`), žádné další potvrzování,
 *  - „rigování“ jako na skutečném automatu: i dobrý zásah může sklouznout (malá šance podle patra, a čím méně přesný zásah, tím větší).
 * Věcné odměny jsou stejné jako ve Stackeru a ukládají se do stejného inventáře (acc.items),
 * takže se prodávají ve stejném Obchodu.
 */
const SC = Number(process.env.TIME_SCALE) > 0 ? Number(process.env.TIME_SCALE) : 1;
const { ITEMS } = require('./stacker');

const RIG_OFF = process.env.KM_RIG === '0'; // jen pro testy
const KEYMASTER = Object.freeze({
  PRICE: 100,
  TIERS: 3,
  // coinové odměny za 1. patro; w = váha (šance), losuje server
  COIN_PRIZES: [
    { amount: 50, w: 45 }, { amount: 100, w: 40 }, { amount: 200, w: 30 }, { amount: 300, w: 20 },
    { amount: 500, w: 10 }, { amount: 1000, w: 4 }, { amount: 2000, w: 1 },
  ],
  // nejkratší doba od startu hry, než se dá klíč zastavit v daném patře (dojezd ramena k 1. / 2. / 3. patru trvá aspoň ~1,2 / 2,8 / 4,7 s, tady s rezervou)
  MIN_TIER_MS: [0, Math.max(30, Math.round(700 * SC)), Math.max(30, Math.round(2000 * SC)), Math.max(30, Math.round(3500 * SC))],
  MIN_CLAIM_MS: Math.max(20, Math.round(350 * SC)),  // po poslední výhře chvíli trvá, než zámek cvakne
  MAX_PLAY_MS: 10 * 60 * 1000,
  // šance, že zásah, který prohlížeč nahlásil, klíč nakonec sklouzne z hrany dírky: base[patro] + (1 - přesnost) * edge (přesnost q 0..1, 1 = střed dírky)
  RIG: Object.freeze({ base: Object.freeze(RIG_OFF ? [0, 0, 0, 0] : [0, 0.06, 0.10, 0.14]), edge: RIG_OFF ? 0 : 0.2 }),
});

const POOL = { small: ITEMS.map((_, i) => i).filter((i) => ITEMS[i].pool === 'small'), big: ITEMS.map((_, i) => i).filter((i) => ITEMS[i].pool === 'big') };

module.exports = function createKeymaster({ resolveAccount, markDirty, notifyBalance, TOKEN_RE, FLOOR = 200, rand = Math.random, rig = KEYMASTER.RIG }) {
  const active = new Map(); // acc.key -> { id, at, level, stageAt }
  let seq = 0;

  const partsOf = (acc) => ITEMS.map((_, i) => (acc.items && acc.items[i]) | 0);
  const pub = (acc) => ({
    price: KEYMASTER.PRICE,
    coins: KEYMASTER.COIN_PRIZES.map((c) => c.amount), weights: KEYMASTER.COIN_PRIZES.map((c) => c.w),
    small: POOL.small, big: POOL.big,
    items: acc ? partsOf(acc) : undefined,
  });
  const state = (acc, extra) => ({ balance: acc.balance, floor: FLOOR, ...pub(acc), ...extra });
  const bad = (status, error) => ({ status, json: { error } });

  /** Obnova kreditu jako jinde: bez rozehrané hry a pod minimem se zůstatek doplní. */
  function topUp(acc) {
    if (active.has(acc.key) || acc.seat || acc.htable) return false;
    if (acc.balance >= FLOOR) return false;
    acc.balance = FLOOR; markDirty(); notifyBalance(acc);
    return true;
  }

  function pickCoin() {
    const total = KEYMASTER.COIN_PRIZES.reduce((a, c) => a + c.w, 0);
    let r = rand() * total;
    for (let i = 0; i < KEYMASTER.COIN_PRIZES.length; i++) { r -= KEYMASTER.COIN_PRIZES[i].w; if (r < 0) return i; }
    return KEYMASTER.COIN_PRIZES.length - 1;
  }
  /** Věcná odměna: vzácné věci mají vlastní šanci (jen 3. patro), jinak se losuje podle vah. */
  function pickItem(level) {
    if (level === 3) {
      for (const i of POOL.big) { const it = ITEMS[i]; if (it.rare && rand() * 100 < it.chance) return i; }
    }
    const reg = (level === 2 ? POOL.small : POOL.big).filter((i) => !ITEMS[i].rare);
    const total = reg.reduce((a, i) => a + ITEMS[i].w, 0);
    let r = rand() * total;
    for (const i of reg) { r -= ITEMS[i].w; if (r < 0) return i; }
    return reg[reg.length - 1];
  }
  /** Připíše odměnu za patro (coiny hned, věc jako díl) a vrátí popis výhry. */
  function grant(acc, level) {
    if (level === 1) {
      const index = pickCoin(); const amount = KEYMASTER.COIN_PRIZES[index].amount;
      acc.balance += amount; markDirty(); notifyBalance(acc);
      return { type: 'coin', index, amount, level };
    }
    const item = pickItem(level);
    if (!Array.isArray(acc.items)) acc.items = [];
    acc.items[item] = (acc.items[item] | 0) + 1; markDirty();
    const type = level === 2 ? 'small' : 'big';
    return { type, index: POOL[type].indexOf(item), item, parts: acc.items[item], need: ITEMS[item].need, level };
  }

  function handle(action, body) {
    if (!body || typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) return bad(400, 'Neplatný token.');
    const { acc } = resolveAccount({ token: body.token, session: typeof body.session === 'string' ? body.session : undefined });
    acc.lastSeen = Date.now();

    if (action === 'state') {
      if (body.fresh) active.delete(acc.key); // stránka se načetla znovu: rozehraný pokus je opuštěný
      const r = topUp(acc);
      return { status: 200, json: state(acc, { refilled: r }) };
    }

    if (action === 'start') {
      if (acc.balance < KEYMASTER.PRICE) return bad(402, 'Nemáš dost žetonů.');
      acc.balance -= KEYMASTER.PRICE;
      const now = Date.now();
      const play = { id: ++seq, at: now, level: 0, stageAt: now };
      active.set(acc.key, play);
      markDirty(); notifyBalance(acc);
      return { status: 200, json: state(acc, { playId: play.id }) };
    }

    if (action === 'stage') { // hráč zastavil klíč v patře `tier`: hit = trefil zámek
      const play = active.get(acc.key);
      if (!play || play.id !== Number(body.playId)) return bad(409, 'Tahle hra už skončila.');
      const tier = Math.floor(Number(body.tier));
      if (play.level !== 0 || !(tier >= 1 && tier <= KEYMASTER.TIERS)) return bad(409, 'Špatné patro.');   // jedna jízda = jedno zastavení
      const now = Date.now();
      if (now - play.at > KEYMASTER.MAX_PLAY_MS) { active.delete(acc.key); return bad(409, 'Hra vypršela.'); }
      if (now - play.stageAt < KEYMASTER.MIN_TIER_MS[tier]) return bad(409, 'Hra neproběhla v pořádku.');
      let slip = false;
      if (body.hit) { // „rigování“: zásah občas sklouzne (víc, když nebyl přesně do středu; starý prohlížeč bez přesnosti se bere jako přesný)
        const qn = Number(body.q), q = Number.isFinite(qn) ? Math.min(1, Math.max(0, qn)) : 1;
        const p = (rig.base[tier] || 0) + (1 - q) * (rig.edge || 0);
        slip = p > 0 && rand() < p;
      }
      if (!body.hit || slip) { // netrefil (nebo klíč sklouzl): o všechno, co v tomhle pokusu nevybral, přichází
        active.delete(acc.key);
        const refilled = topUp(acc);
        return { status: 200, json: state(acc, { lost: true, slip, level: play.level, refilled }) };
      }
      play.level = tier; play.stageAt = now;   // odměnu za toto patro si klient hned vybere (claim)
      return { status: 200, json: state(acc, { hit: true, level: tier }) };
    }

    if (action === 'claim') { // vybrání odměny za nejvyšší potvrzené patro
      const play = active.get(acc.key);
      if (!play || play.id !== Number(body.playId)) return bad(409, 'Tahle hra už skončila.');
      if (play.level < 1) return bad(409, 'Nemáš co vybrat.');
      if (Date.now() - play.stageAt < KEYMASTER.MIN_CLAIM_MS) return bad(409, 'Hra neproběhla v pořádku.');
      active.delete(acc.key); // jeden pokus = nejvýš jedna odměna
      const won = grant(acc, play.level);
      const refilled = topUp(acc);
      return { status: 200, json: state(acc, { won, refilled }) };
    }

    if (action === 'end') { // pokus opuštěn bez výhry
      const play = active.get(acc.key);
      if (play && play.id === Number(body.playId)) active.delete(acc.key);
      const refilled = topUp(acc);
      return { status: 200, json: state(acc, { refilled }) };
    }

    return bad(404, 'Neznámá akce.');
  }

  return { handle, KEYMASTER, removeAccount: (acc) => active.delete(acc.key) };
};
module.exports.KEYMASTER = KEYMASTER;
