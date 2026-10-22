'use strict';
/**
 * Automat na plyšáky: serverová část (peníze).
 * Hra sama běží v prohlížeči; server hlídá jen to, co se týká zůstatku:
 *  - nákup her (100 za 1, 500 za 6),
 *  - spotřebu hry při startu,
 *  - odměnu za vyhraného plyšáka (jedna odměna na jednu hru, nejdřív po minimální době hry).
 */
const SC = Number(process.env.TIME_SCALE) > 0 ? Number(process.env.TIME_SCALE) : 1;

const CLAW = Object.freeze({
  PACKS: { 1: 100, 6: 500 },        // počet her -> cena
  MAX_PLAYS: 60,
  MIN_PLAY_MS: Math.max(50, Math.round(7000 * SC)), // rychleji se hra odehrát nedá
  MAX_PLAY_MS: 10 * 60 * 1000,
  PRIZES: [
    { id: 'chick', name: 'Kuřátko', value: 150 },
    { id: 'frog', name: 'Žabka', value: 300 },
    { id: 'bear', name: 'Medvídek', value: 500 },
    { id: 'bunny', name: 'Králíček', value: 750 },
    { id: 'panda', name: 'Panda', value: 1000 },
    { id: 'unicorn', name: 'Jednorožec', value: 1500 },
    { id: 'phone', name: 'Telefon', value: 2500 },
  ],
});

module.exports = function createClaw({ resolveAccount, markDirty, notifyBalance, TOKEN_RE, FLOOR = 200 }) {
  const active = new Map(); // acc.key -> { id, at }
  let seq = 0;

  const state = (acc, extra) => ({ balance: acc.balance, plays: acc.clawPlays | 0, prizes: CLAW.PRIZES, packs: CLAW.PACKS, floor: FLOOR, ...extra });

  /** Obnova kreditu: když hráč dohraje všechny hry a zůstatek je pod minimem, doplní se na minimum (jako v blackjacku). */
  function topUp(acc) {
    if ((acc.clawPlays | 0) > 0 || active.has(acc.key) || acc.seat || acc.htable) return false;
    if (acc.balance >= FLOOR) return false;
    acc.balance = FLOOR;
    markDirty();
    notifyBalance(acc);
    return true;
  }
  const bad = (status, error) => ({ status, json: { error } });

  /** @returns {{status:number, json:object}} */
  function handle(action, body) {
    if (!body || typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) return bad(400, 'Neplatný token.');
    const { acc } = resolveAccount({ token: body.token, session: typeof body.session === 'string' ? body.session : undefined });
    acc.lastSeen = Date.now();
    acc.clawPlays = acc.clawPlays | 0;

    if (action === 'state') { const r = topUp(acc); return { status: 200, json: state(acc, { refilled: r }) }; }

    if (action === 'buy') {
      const n = Number(body.pack);
      const price = CLAW.PACKS[n];
      if (!price) return bad(400, 'Neplatný balíček.');
      if (acc.clawPlays + n > CLAW.MAX_PLAYS) return bad(400, 'Máš moc nevyužitých her.');
      if (acc.balance < price) return bad(402, 'Nemáš dost žetonů.');
      acc.balance -= price;
      acc.clawPlays += n;
      markDirty();
      notifyBalance(acc);
      return { status: 200, json: state(acc) };
    }

    if (action === 'play') {
      if (acc.clawPlays < 1) return bad(402, 'Nemáš žádnou hru, nejdřív si kup.');
      acc.clawPlays -= 1;
      const play = { id: ++seq, at: Date.now() };
      active.set(acc.key, play);
      markDirty();
      return { status: 200, json: state(acc, { playId: play.id }) };
    }

    if (action === 'claim') {
      const play = active.get(acc.key);
      if (!play || play.id !== Number(body.playId)) return bad(409, 'Tahle hra už skončila.');
      active.delete(acc.key); // jedna hra = nejvýš jedna odměna
      const prize = CLAW.PRIZES.find((p) => p.id === body.prize);
      if (!prize) return bad(400, 'Neznámý plyšák.');
      const age = Date.now() - play.at;
      if (age < CLAW.MIN_PLAY_MS || age > CLAW.MAX_PLAY_MS) return bad(409, 'Hra neproběhla v pořádku.');
      acc.balance += prize.value;
      markDirty();
      notifyBalance(acc);
      const refilled = topUp(acc);
      return { status: 200, json: state(acc, { won: prize, refilled }) };
    }

    if (action === 'end') { // hra skončila bez výhry
      const play = active.get(acc.key);
      if (play && play.id === Number(body.playId)) active.delete(acc.key);
      const refilled = topUp(acc);
      return { status: 200, json: state(acc, { refilled }) };
    }

    return bad(404, 'Neznámá akce.');
  }

  return { handle, CLAW, removeAccount: (acc) => active.delete(acc.key) };
};
module.exports.CLAW = CLAW;
