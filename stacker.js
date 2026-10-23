'use strict';
/**
 * Stacker (věžičky z kostek): serverová část (peníze).
 * Hra sama běží v prohlížeči; server hlídá:
 *  - cenu pokusu (200 žetonů, strhne se při startu),
 *  - výhru za dosaženou úroveň (jedna odměna na jeden pokus, nejdřív po minimální době hry),
 *  - losování coinové odměny za 1. úroveň (ruleta, váhy podle tabulky) – výsledek určuje server.
 */
const SC = Number(process.env.TIME_SCALE) > 0 ? Number(process.env.TIME_SCALE) : 1;

const STACKER = Object.freeze({
  PRICE: 200,
  COLS: 9,
  ROWS: 16,
  LEVELS: { 1: 6, 2: 10, 3: 16 },     // úroveň -> kolik řad musí být položeno
  // coinové odměny za 1. úroveň; w = váha (šance) v tabulce, losuje se úměrně vahám
  COIN_PRIZES: [
    { amount: 100, w: 50 }, { amount: 200, w: 40 }, { amount: 500, w: 30 },
    { amount: 750, w: 20 }, { amount: 1000, w: 10 }, { amount: 2000, w: 5 },
  ],
  SMALL_COUNT: 9,                    // políček malých věcných odměn (2. úroveň)
  BIG_COUNT: 10,                     // políček velkých věcných odměn (3. úroveň, vč. 6 vzácných)
  MIN_ROW_MS: Math.max(20, Math.round(350 * SC)), // rychleji se řada položit nedá
  MAX_PLAY_MS: 10 * 60 * 1000,
});

// ---- věcné odměny (díly se sbírají, hotová věc se prodá v Obchodu) -------------------------------
// price = cena při prodeji, need = kolik dílů je potřeba, w = váha mezi ostatními věcmi ve stejné skupině,
// chance = (jen vzácné) samostatná šance v %, že na 3. úrovni padne rovnou tahle věc (stačí 1 kus).
const ITEMS = Object.freeze([
  { name: 'Čokoláda', emoji: '🍫', price: 500, need: 1, w: 50, pool: 'small' },
  { name: 'Drak na létání', emoji: '🪁', price: 1000, need: 2, w: 40, pool: 'small' },
  { name: 'Hra do party', emoji: '🎲', price: 2000, need: 2, w: 35, pool: 'small' },
  { name: 'Svítilna', emoji: '🔦', price: 3000, need: 2, w: 30, pool: 'small' },
  { name: 'Kšiltovka', emoji: '🧢', price: 5000, need: 3, w: 20, pool: 'small' },
  { name: 'Plyšový medvěd', emoji: '🧸', price: 10000, need: 3, w: 15, pool: 'small' },
  { name: 'Sluchátka', emoji: '🎧', price: 20000, need: 3, w: 10, pool: 'small' },
  { name: 'Herní ovladač', emoji: '🎮', price: 30000, need: 3, w: 10, pool: 'small' },
  { name: 'Chytré hodinky', emoji: '⌚', price: 40000, need: 4, w: 10, pool: 'small' },
  { name: 'Koloběžka', emoji: '🛴', price: 50000, need: 4, w: 7, pool: 'big' },
  { name: 'Fotoaparát', emoji: '📷', price: 60000, need: 5, w: 7, pool: 'big' },
  { name: 'Telefon', emoji: '📱', price: 75000, need: 5, w: 5, pool: 'big' },
  { name: 'Notebook', emoji: '💻', price: 100000, need: 6, w: 5, pool: 'big' },
  { name: 'Zlatý pohár', emoji: '🏆', price: 10000, need: 1, chance: 1, pool: 'big', rare: true },
  { name: 'Diamantový prsten', emoji: '💍', price: 30000, need: 1, chance: 0.5, pool: 'big', rare: true },
  { name: 'Koruna', emoji: '👑', price: 50000, need: 1, chance: 0.2, pool: 'big', rare: true },
  { name: 'Sporťák', emoji: '🏎️', price: 75000, need: 1, chance: 0.05, pool: 'big', rare: true },
  { name: 'Plachetnice', emoji: '⛵', price: 100000, need: 1, chance: 0.009, pool: 'big', rare: true },
  { name: 'Soukromý ostrov', emoji: '🏝️', price: 300000, need: 1, chance: 0.0001, pool: 'big', rare: true },
]);
const POOL = { small: ITEMS.map((_, i) => i).filter((i) => ITEMS[i].pool === 'small'), big: ITEMS.map((_, i) => i).filter((i) => ITEMS[i].pool === 'big') };

module.exports = function createStacker({ resolveAccount, markDirty, notifyBalance, TOKEN_RE, FLOOR = 200, rand = Math.random }) {
  const active = new Map(); // acc.key -> { id, at }
  let seq = 0;

  const partsOf = (acc) => ITEMS.map((_, i) => (acc.items && acc.items[i]) | 0);
  const pub = (acc) => ({ price: STACKER.PRICE, cols: STACKER.COLS, rows: STACKER.ROWS, levels: STACKER.LEVELS, coins: STACKER.COIN_PRIZES.map((c) => c.amount), small: STACKER.SMALL_COUNT, big: STACKER.BIG_COUNT, items: acc ? partsOf(acc) : undefined });
  const state = (acc, extra) => ({ balance: acc.balance, floor: FLOOR, ...pub(acc), ...extra });

  /** Obnova kreditu jako jinde: bez rozehrané hry a pod minimem se zůstatek doplní. */
  function topUp(acc) {
    if (active.has(acc.key) || acc.seat || acc.htable) return false;
    if (acc.balance >= FLOOR) return false;
    acc.balance = FLOOR; markDirty(); notifyBalance(acc);
    return true;
  }
  const bad = (status, error) => ({ status, json: { error } });

  function pickCoin() {
    const total = STACKER.COIN_PRIZES.reduce((a, c) => a + c.w, 0);
    let r = rand() * total;
    for (let i = 0; i < STACKER.COIN_PRIZES.length; i++) { r -= STACKER.COIN_PRIZES[i].w; if (r < 0) return i; }
    return STACKER.COIN_PRIZES.length - 1;
  }

  /** Co padne za věcnou odměnu: vzácné věci mají vlastní šanci (jen velká odměna), jinak se losuje podle vah. */
  function pickItem(level) {
    const pool = level === 2 ? POOL.small : POOL.big;
    if (level === 3) {
      for (const i of POOL.big) { const it = ITEMS[i]; if (it.rare && rand() * 100 < it.chance) return i; }
    }
    const reg = pool.filter((i) => !ITEMS[i].rare);
    const total = reg.reduce((a, i) => a + ITEMS[i].w, 0);
    let r = rand() * total;
    for (const i of reg) { r -= ITEMS[i].w; if (r < 0) return i; }
    return reg[reg.length - 1];
  }
  const itemInfo = () => ITEMS.map((it) => ({ name: it.name, emoji: it.emoji, price: it.price, need: it.need, pool: it.pool, rare: !!it.rare }));

  function handle(action, body) {
    if (!body || typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) return bad(400, 'Neplatný token.');
    const { acc } = resolveAccount({ token: body.token, session: typeof body.session === 'string' ? body.session : undefined });
    acc.lastSeen = Date.now();

    if (action === 'state') { if (body.fresh) active.delete(acc.key); /* stránka se načetla znovu: rozehraný pokus je opuštěný a nesmí blokovat obnovu kreditu */ const r = topUp(acc); return { status: 200, json: state(acc, { refilled: r }) }; }

    if (action === 'inventory') return { status: 200, json: state(acc, { catalog: itemInfo() }) };

    if (action === 'sell') { // prodej hotových věcí: z dílů se odečte „need“ kusů na jeden prodej
      const i = Math.floor(Number(body.item)); const count = Math.max(1, Math.min(1000, Math.floor(Number(body.count) || 1)));
      if (!(i >= 0 && i < ITEMS.length)) return bad(400, 'Neznámá věc.');
      const it = ITEMS[i]; const have = (acc.items && acc.items[i]) | 0;
      const can = Math.floor(have / it.need);
      if (can < 1) return bad(409, 'Nemáš nasbíráno dost dílů.');
      const n = Math.min(count, can);
      acc.items[i] = have - n * it.need; acc.balance += n * it.price; markDirty(); notifyBalance(acc);
      return { status: 200, json: state(acc, { catalog: itemInfo(), sold: { item: i, count: n, amount: n * it.price } }) };
    }

    if (action === 'start') {
      if (acc.balance < STACKER.PRICE) return bad(402, 'Nemáš dost žetonů.');
      acc.balance -= STACKER.PRICE;
      const play = { id: ++seq, at: Date.now() };
      active.set(acc.key, play);
      markDirty(); notifyBalance(acc);
      return { status: 200, json: state(acc, { playId: play.id }) };
    }

    if (action === 'claim') {
      const play = active.get(acc.key);
      if (!play || play.id !== Number(body.playId)) return bad(409, 'Tahle hra už skončila.');
      const level = Number(body.level);
      const rows = STACKER.LEVELS[level];
      if (!rows) return bad(400, 'Neznámá úroveň.');
      const age = Date.now() - play.at;
      if (age < STACKER.MIN_ROW_MS * rows || age > STACKER.MAX_PLAY_MS) return bad(409, 'Hra neproběhla v pořádku.');
      active.delete(acc.key); // jeden pokus = nejvýš jedna odměna
      let won;
      if (level === 1) {
        const index = pickCoin(); const amount = STACKER.COIN_PRIZES[index].amount;
        acc.balance += amount; markDirty(); notifyBalance(acc);
        won = { type: 'coin', index, amount, level };
      } else {
        const item = pickItem(level);
        if (!Array.isArray(acc.items)) acc.items = [];
        acc.items[item] = (acc.items[item] | 0) + 1; markDirty();
        const type = level === 2 ? 'small' : 'big';
        won = { type, index: POOL[type].indexOf(item), item, parts: acc.items[item], need: ITEMS[item].need, level };
      }
      const refilled = topUp(acc);
      return { status: 200, json: state(acc, { won, refilled }) };
    }

    if (action === 'end') { // pokus skončil bez výhry
      const play = active.get(acc.key);
      if (play && play.id === Number(body.playId)) active.delete(acc.key);
      const refilled = topUp(acc);
      return { status: 200, json: state(acc, { refilled }) };
    }

    return bad(404, 'Neznámá akce.');
  }

  return { handle, STACKER, removeAccount: (acc) => active.delete(acc.key) };
};
module.exports.STACKER = STACKER;
module.exports.ITEMS = ITEMS;
