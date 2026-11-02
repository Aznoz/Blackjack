'use strict';
/**
 * Color Stop: serverová část (peníze a kontrola).
 * Šipka jezdí dokola po kruhu 12 políček. Svítí vždy jedno políčko, hráč musí šipku zastavit (STOP) uvnitř něj.
 * Po zásahu šipka otočí směr, v novém směru se rozsvítí další políčko (zpočátku daleko, ke konci čím dál blíž) a šipka zrychlí. Hraje se do 50 zásahů,
 * první netrefa hru ukončí. Výplata je podle dosaženého skóre (50 = jackpot).
 *
 * Hru počítá prohlížeč (je to hra na reakci), server:
 *  - strhne cenu při startu a losuje celou trasu předem (vzdálenost a barvu každého dalšího políčka),
 *  - při konci hry vyplatí podle skóre, ale skóre omezí podle uplynulého času: šipka potřebuje na cestu k dalšímu
 *    políčku minimální čas (vzdálenost / rychlost), takže „50 zásahů za 2 vteřiny“ nikdo nevyplatí,
 *  - rozehraná hra, kterou hráč neukončí (zavřel stránku), propadá; cena je už zaplacená.
 */
const SC = Number(process.env.TIME_SCALE) > 0 ? Number(process.env.TIME_SCALE) : 1;

const CS = {
  PRICE: 100,
  STEPS: 50,                       // tolik zásahů je jackpot
  CELLS: 12,                       // políček na kruhu
  CELL_DEG: 30,                    // úhel jednoho políčka
  SPEED0: 100,                     // °/s na začátku
  SPEED_STEP: 6,                   // o kolik °/s se šipka zrychlí po každém zásahu (po 49 zásazích 394 °/s)
  DMIN: 2, DMAX: 9,                // nové políčko je 2 až 9 políček před šipkou (v novém směru); 2 = mezera jen jedno políčko
  SHRINK_FROM: 10, SHRINK_TO: 46,  // od 10. zásahu se největší vzdálenost zmenšuje z 9 na 3, od 46. zásahu je vždy jen 2 (mezera 1 políčko)
  COLORS: 8,                       // počet barev (jen vzhled)
  // [minimální skóre, výplata]; platí první řádek, který hráč splní
  PAYOUTS: Object.freeze([[50, 20000], [45, 6000], [40, 3000], [35, 1500], [30, 800], [25, 400], [20, 250], [15, 150], [10, 100], [5, 50]].map((r) => Object.freeze(r))),
  SLACK: 0.85,                     // tolerance k minimálnímu času
  MAX_GAME_MS: 60 * 60 * 1000,
};
const speedAt = (k) => CS.SPEED0 + CS.SPEED_STEP * k;
/** Největší možná vzdálenost nového políčka po k zásazích: zpočátku 9, od 10. zásahu se mezery zmenšují, na konci jen 2. */
const dmaxAt = (k) => {
  if (k >= CS.SHRINK_TO) return CS.DMIN;
  if (k <= CS.SHRINK_FROM) return CS.DMAX;
  return Math.max(3, Math.round(CS.DMAX - ((CS.DMAX - 3) * (k - CS.SHRINK_FROM)) / (CS.SHRINK_TO - CS.SHRINK_FROM)));
};
const payoutFor = (score) => { for (const [min, pay] of CS.PAYOUTS) if (score >= min) return pay; return 0; };
CS.payoutFor = payoutFor; CS.speedAt = speedAt; CS.dmaxAt = dmaxAt; Object.freeze(CS);

module.exports = function createColorStop({ resolveAccount, markDirty, notifyBalance, TOKEN_RE, FLOOR = 200, rand = Math.random, now = Date.now }) {
  const pending = new Map(); // acc.key -> { id, at, seq }
  let seq = 0;

  const pub = () => ({
    price: CS.PRICE, steps: CS.STEPS, cells: CS.CELLS, cellDeg: CS.CELL_DEG, speed0: CS.SPEED0, speedStep: CS.SPEED_STEP,
    payouts: CS.PAYOUTS.map((r) => [r[0], r[1]]), jackpot: payoutFor(CS.STEPS),
  });
  const state = (acc, extra) => ({ balance: acc.balance, floor: FLOOR, ...pub(), ...extra });
  const bad = (status, error, acc) => ({ status, json: { error, ...(acc ? { balance: acc.balance } : {}) } });

  /** Obnova kreditu jako jinde: bez rozehrané hry a pod minimem se zůstatek doplní. */
  function topUp(acc) {
    if (pending.has(acc.key) || acc.seat || acc.htable) return false;
    if (acc.balance >= FLOOR) return false;
    acc.balance = FLOOR; markDirty(); notifyBalance(acc);
    return true;
  }

  /** Trasa celé hry: pro každý zásah vzdálenost (v políčkách) nového políčka a jeho barva. */
  function makeRoute() {
    const route = []; let prev = -1;
    for (let k = 0; k < CS.STEPS; k++) {
      const span = dmaxAt(k) - CS.DMIN, d = CS.DMIN + Math.min(span, Math.floor(rand() * (span + 1)));
      let c = Math.min(CS.COLORS - 1, Math.floor(rand() * CS.COLORS)); if (c === prev) c = (c + 1 + Math.floor(rand() * (CS.COLORS - 1))) % CS.COLORS; prev = c;
      route.push([d, c]);
    }
    return route;
  }

  /** Nejvyšší skóre, které je za uplynulý čas fyzicky možné (šipka musí k políčku dojet). */
  function maxScoreByTime(route, elapsedMs) {
    let t = 0, s = 0;
    for (let k = 0; k < route.length; k++) {
      const ms = ((route[k][0] - 1) * CS.CELL_DEG / speedAt(k)) * 1000 * CS.SLACK * SC;
      if (t + ms > elapsedMs) break;
      t += ms; s++;
    }
    return s;
  }

  function handle(action, body) {
    if (!body || typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) return bad(400, 'Neplatný token.');
    const { acc } = resolveAccount({ token: body.token, session: typeof body.session === 'string' ? body.session : undefined });
    acc.lastSeen = now();

    if (action === 'state') {
      const r = topUp(acc);
      return { status: 200, json: state(acc, { refilled: r }) };
    }

    if (action === 'start') {
      if (acc.balance < CS.PRICE) return bad(402, 'Nemáš dost žetonů.', acc);
      acc.balance -= CS.PRICE; markDirty(); notifyBalance(acc);
      const route = makeRoute();
      const p = { id: ++seq, at: now(), route }; // případná nedohraná hra se tím přepíše (propadla)
      pending.set(acc.key, p);
      return { status: 200, json: state(acc, { gameId: p.id, route }) };
    }

    if (action === 'end') {
      const p = pending.get(acc.key);
      if (!p || p.id !== Number(body.gameId)) return bad(409, 'Tahle hra už skončila.', acc);
      const claimed = Math.floor(Number(body.score));
      if (!Number.isFinite(claimed) || claimed < 0 || claimed > CS.STEPS) return bad(400, 'Neplatné skóre.', acc);
      pending.delete(acc.key);
      const elapsed = now() - p.at;
      const allowed = elapsed > CS.MAX_GAME_MS ? 0 : maxScoreByTime(p.route, elapsed);
      const score = Math.min(claimed, allowed);
      const payout = payoutFor(score);
      if (payout) { acc.balance += payout; markDirty(); notifyBalance(acc); }
      const refilled = topUp(acc);
      return { status: 200, json: state(acc, { score, claimed, capped: score < claimed, payout, jackpot: score >= CS.STEPS, refilled }) };
    }

    return bad(404, 'Neznámá akce.');
  }

  return { handle, CS, removeAccount: (acc) => pending.delete(acc.key) };
};
module.exports.CS = CS;
