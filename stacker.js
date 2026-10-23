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
  SMALL_COUNT: 9,                    // políček malých věcných odměn (zatím placeholder)
  BIG_COUNT: 9,                      // políček velkých věcných odměn (zatím placeholder)
  MIN_ROW_MS: Math.max(20, Math.round(350 * SC)), // rychleji se řada položit nedá
  MAX_PLAY_MS: 10 * 60 * 1000,
});

module.exports = function createStacker({ resolveAccount, markDirty, notifyBalance, TOKEN_RE, FLOOR = 200, rand = Math.random }) {
  const active = new Map(); // acc.key -> { id, at }
  let seq = 0;

  const pub = () => ({ price: STACKER.PRICE, cols: STACKER.COLS, rows: STACKER.ROWS, levels: STACKER.LEVELS, coins: STACKER.COIN_PRIZES.map((c) => c.amount), small: STACKER.SMALL_COUNT, big: STACKER.BIG_COUNT });
  const state = (acc, extra) => ({ balance: acc.balance, floor: FLOOR, ...pub(), ...extra });

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

  function handle(action, body) {
    if (!body || typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) return bad(400, 'Neplatný token.');
    const { acc } = resolveAccount({ token: body.token, session: typeof body.session === 'string' ? body.session : undefined });
    acc.lastSeen = Date.now();

    if (action === 'state') { if (body.fresh) active.delete(acc.key); /* stránka se načetla znovu: rozehraný pokus je opuštěný a nesmí blokovat obnovu kreditu */ const r = topUp(acc); return { status: 200, json: state(acc, { refilled: r }) }; }

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
      } else if (level === 2) {
        won = { type: 'small', index: Math.floor(rand() * STACKER.SMALL_COUNT), level };
      } else {
        won = { type: 'big', index: Math.floor(rand() * STACKER.BIG_COUNT), level };
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
