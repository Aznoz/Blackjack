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
    { id: 'chick', name: 'Kuřátko', value: 50 },
    { id: 'frog', name: 'Žabka', value: 80 },
    { id: 'bear', name: 'Medvídek', value: 120 },
    { id: 'bunny', name: 'Králíček', value: 200 },
    { id: 'panda', name: 'Panda', value: 400 },
    { id: 'unicorn', name: 'Jednorožec', value: 1000 },
  ],
});

module.exports = function createClaw({ resolveAccount, markDirty, notifyBalance, TOKEN_RE }) {
  const active = new Map(); // acc.key -> { id, at }
  let seq = 0;

  const state = (acc) => ({ balance: acc.balance, plays: acc.clawPlays | 0, prizes: CLAW.PRIZES, packs: CLAW.PACKS });
  const bad = (status, error) => ({ status, json: { error } });

  /** @returns {{status:number, json:object}} */
  function handle(action, body) {
    if (!body || typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) return bad(400, 'Neplatný token.');
    const { acc } = resolveAccount({ token: body.token, session: typeof body.session === 'string' ? body.session : undefined });
    acc.lastSeen = Date.now();
    acc.clawPlays = acc.clawPlays | 0;

    if (action === 'state') return { status: 200, json: state(acc) };

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
      return { status: 200, json: { ...state(acc), playId: play.id } };
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
      return { status: 200, json: { ...state(acc), won: prize } };
    }

    if (action === 'end') { // hra skončila bez výhry
      const play = active.get(acc.key);
      if (play && play.id === Number(body.playId)) active.delete(acc.key);
      return { status: 200, json: state(acc) };
    }

    return bad(404, 'Neznámá akce.');
  }

  return { handle, CLAW, removeAccount: (acc) => active.delete(acc.key) };
};
module.exports.CLAW = CLAW;
