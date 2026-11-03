'use strict';
/**
 * Zombie Snatcher: serverová část (peníze, puky, písmena Z-O-M-B-I-E).
 *
 * Otočná plošina s puky (hodnoty 50 až 5 000, čím větší hodnota, tím menší puk) a šesti malými puky s písmeny. Hráč si za 500 koupí
 * 3 pokusy. Po stisku STOP se rameno rozmáchne a shrne puky; puky, které spadnou do výherní díry, se vyplatí.
 * Spadnou-li všechna písmena Z-O-M-B-I-E (i postupně, napříč hrami), je jackpot 10 000.
 *
 * Fyzika je v `zsim.js` (stejný soubor běží v prohlížeči). Server výstřel PŘEPOČÍTÁ z rozložení puků a úhlu plošiny,
 * který hráč poslal, a vyplatí to, co vyšlo jemu; prohlížeč výsledek jen zobrazuje.
 * Trvale uložené v účtu (Upstash): zbývající pokusy `zsTries` a nasbíraná písmena `zsLetters` (bitová maska).
 * Rozložení puků na plošině se drží v paměti serveru (po restartu se vygeneruje nové, písmena a pokusy zůstanou).
 */
const Z = require('./zsim');

const VALUES = Object.freeze([[50, 5], [100, 4], [200, 4], [500, 3], [750, 2], [1000, 2], [1500, 1], [2000, 1], [3000, 1], [5000, 1]].map((r) => Object.freeze(r))); // [hodnota, počet]
const LETTERS = 'ZOMBIE';
const ZS = Object.freeze({
  PRICE: 500, TRIES_PER_BUY: 3, MAX_TRIES: 9, JACKPOT: 10000,
  VALUES, LETTERS,
  R_COIN: (rank) => 0.125 - 0.0065 * rank, // poloměr puku podle pořadí hodnoty (čím větší hodnota, tím menší)
  R_LETTER: 0.055,                          // všechna písmena stejně malá
  MIN_SHOT_GAP_MS: 2000,                    // nejkratší doba mezi dvěma výstřely jednoho hráče
  MAX_PLATFORM_AGE_MS: 6 * 60 * 60 * 1000,
});
const ALL_LETTERS = (1 << LETTERS.length) - 1; // 63
const COIN_COUNT = VALUES.reduce((a, r) => a + r[1], 0);
const q4 = (n) => Math.round(n * 1e4) / 1e4;

module.exports = function createZombie({ resolveAccount, markDirty, notifyBalance, TOKEN_RE, FLOOR = 200, rand = Math.random, now = Date.now }) {
  const platforms = new Map(); // acc.key -> { pucks, nextId, at, lastShot }

  const rankOfValue = (v) => VALUES.findIndex((r) => r[0] === v);

  /** Najde volné místo pro puk o poloměru r (blízko hodnoty rho0, jinak kdekoliv); vrací [x,y] nebo null. */
  function place(pucks, r, rho0, spread) {
    for (let tries = 0; tries < 500; tries++) {
      let rho;
      if (tries < 200 && rho0 != null) rho = rho0 + (rand() - 0.5) * spread;
      else rho = Z.C.RC + r + 0.03 + rand() * (Z.C.RP - 2 * r - Z.C.RC - 0.06);
      rho = Math.max(Z.C.RC + r + 0.02, Math.min(Z.C.RP - r - 0.02, rho));
      const a = rand() * Math.PI * 2, x = q4(Math.cos(a) * rho), y = q4(Math.sin(a) * rho);
      if (pucks.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + r + 0.012)) return [x, y];
    }
    return null;
  }
  const coinRho = (rank) => 0.78 - 0.42 * (rank / 9); // dražší puky blíž ke sloupu (hůř dostupné)
  const letterRho = () => 0.55 + rand() * 0.25;

  /** Doplní plošinu: chybějící mince podle tabulky a chybějící (nenasbíraná) písmena. Vrací nově přidané puky. */
  function refill(plat, lettersMask) {
    const added = [];
    const have = new Map(); for (const p of plat.pucks) if (p.k === 'c') have.set(p.v, (have.get(p.v) || 0) + 1);
    const need = [];
    VALUES.forEach(([v, n], rank) => { for (let i = (have.get(v) || 0); i < n; i++) need.push({ k: 'c', v, rank, r: ZS.R_COIN(rank) }); });
    for (let i = 0; i < LETTERS.length; i++) {
      if (lettersMask & (1 << i)) continue;
      if (!plat.pucks.some((p) => p.k === 'l' && p.ch === LETTERS[i])) need.push({ k: 'l', ch: LETTERS[i], r: ZS.R_LETTER, rank: -1 });
    }
    need.sort((a, b) => b.rank - a.rank); // nejdřív dražší (nejmenší prostor, nejhůř se hledá místo)
    for (const w of need) {
      let xy = null;
      if (w.k === 'l') {
        for (let t = 0; t < 300 && !xy; t++) {
          const rho = letterRho(), a = rand() * Math.PI * 2, x = q4(Math.cos(a) * rho), y = q4(Math.sin(a) * rho);
          if (plat.pucks.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + w.r + 0.012)) xy = [x, y];
        }
        if (!xy) xy = place(plat.pucks, w.r, null, 0);
      } else xy = place(plat.pucks, w.r, coinRho(w.rank), 0.3);
      if (!xy) continue; // plošina je plná (nemělo by se stát)
      const puck = w.k === 'l' ? { id: ++plat.nextId, k: 'l', ch: w.ch, r: w.r, x: xy[0], y: xy[1] } : { id: ++plat.nextId, k: 'c', v: w.v, r: w.r, x: xy[0], y: xy[1] };
      plat.pucks.push(puck); added.push(puck.id);
    }
    return added;
  }
  function newPlatform(acc) {
    const plat = { pucks: [], nextId: 0, at: now(), lastShot: 0 };
    refill(plat, acc.zsLetters | 0);
    platforms.set(acc.key, plat);
    return plat;
  }
  function platformOf(acc) {
    let plat = platforms.get(acc.key);
    if (!plat || now() - plat.at > ZS.MAX_PLATFORM_AGE_MS) plat = newPlatform(acc);
    return plat;
  }

  const pubPuck = (p) => (p.k === 'l' ? { id: p.id, k: 'l', ch: p.ch, r: p.r, x: p.x, y: p.y } : { id: p.id, k: 'c', v: p.v, r: p.r, x: p.x, y: p.y });
  const pub = () => ({ price: ZS.PRICE, triesPerBuy: ZS.TRIES_PER_BUY, maxTries: ZS.MAX_TRIES, jackpot: ZS.JACKPOT, letters: LETTERS, values: VALUES.map((r) => r[0]), total: Z.TOTAL_T });
  const state = (acc, plat, extra) => ({ balance: acc.balance, floor: FLOOR, tries: acc.zsTries | 0, lettersMask: acc.zsLetters | 0, ...pub(), pucks: plat ? plat.pucks.map(pubPuck) : [], ...extra });
  const bad = (status, error, acc) => ({ status, json: { error, ...(acc ? { balance: acc.balance, tries: acc.zsTries | 0, lettersMask: acc.zsLetters | 0 } : {}) } });

  function topUp(acc) {
    if ((acc.zsTries | 0) > 0 || acc.seat || acc.htable) return false;
    if (acc.balance >= FLOOR) return false;
    acc.balance = FLOOR; markDirty(); notifyBalance(acc);
    return true;
  }

  function handle(action, body) {
    if (!body || typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) return bad(400, 'Neplatný token.');
    const { acc } = resolveAccount({ token: body.token, session: typeof body.session === 'string' ? body.session : undefined });
    acc.lastSeen = now();
    if (!Number.isInteger(acc.zsTries)) acc.zsTries = 0;
    if (!Number.isInteger(acc.zsLetters)) acc.zsLetters = 0;

    if (action === 'state') {
      const r = topUp(acc);
      return { status: 200, json: state(acc, platformOf(acc), { refilled: r }) };
    }

    if (action === 'buy') {
      if (acc.zsTries + ZS.TRIES_PER_BUY > ZS.MAX_TRIES) return bad(409, `Můžeš mít nejvýš ${ZS.MAX_TRIES} pokusů najednou.`, acc);
      if (acc.balance < ZS.PRICE) return bad(402, 'Nemáš dost žetonů.', acc);
      acc.balance -= ZS.PRICE; acc.zsTries += ZS.TRIES_PER_BUY; markDirty(); notifyBalance(acc);
      const plat = platformOf(acc); // puky na plošině zůstávají i po dokoupení pokusů
      return { status: 200, json: state(acc, plat, { bought: true }) };
    }

    if (action === 'shoot') {
      if ((acc.zsTries | 0) < 1) return bad(409, 'Nemáš žádný pokus. Kup si další.', acc);
      const phi = Number(body.phi);
      if (!Number.isInteger(phi) || phi < 0 || phi >= Z.C.PHI_STEPS) return bad(400, 'Neplatný úhel.', acc);
      const plat = platformOf(acc);
      const t = now();
      if (t - plat.lastShot < ZS.MIN_SHOT_GAP_MS) return bad(429, 'Moc rychle, počkej, až se rameno vrátí.', acc);
      plat.lastShot = t;

      const sim = Z.run(plat.pucks.map((p) => ({ id: p.id, r: p.r, x: p.x, y: p.y })), phi);
      const byId = new Map(plat.pucks.map((p) => [p.id, p]));
      const fallen = []; let coins = 0, mask = acc.zsLetters | 0;
      for (const f of sim.fallen) {
        const p = byId.get(f.id); if (!p) continue;
        if (p.k === 'c') { coins += p.v; fallen.push({ id: p.id, k: 'c', v: p.v, t: f.t }); }
        else { mask |= 1 << LETTERS.indexOf(p.ch); fallen.push({ id: p.id, k: 'l', ch: p.ch, t: f.t }); }
      }
      // nové rozložení: zbylé puky tam, kde se zastavily
      const fell = new Set(sim.fallen.map((f) => f.id));
      const pos = new Map(sim.pucks.filter((p) => p.alive).map((p) => [p.id, p]));
      plat.pucks = plat.pucks.filter((p) => !fell.has(p.id) && pos.has(p.id)).map((p) => { const s = pos.get(p.id); return { ...p, x: q4(s.x), y: q4(s.y) }; });
      acc.zsTries -= 1;
      const jackpot = mask === ALL_LETTERS;
      let payout = coins;
      if (jackpot) { payout += ZS.JACKPOT; mask = 0; }
      acc.zsLetters = mask;
      if (payout) { acc.balance += payout; notifyBalance(acc); }
      markDirty();
      const added = refill(plat, mask);
      const refilled = topUp(acc);
      return { status: 200, json: state(acc, plat, { result: { fallen, coins, payout, jackpot, letters: fallen.filter((f) => f.k === 'l').map((f) => f.ch) }, added, phi, refilled }) };
    }

    return bad(404, 'Neznámá akce.');
  }

  return { handle, ZS, platformOf, removeAccount: (acc) => platforms.delete(acc.key), _platforms: platforms };
};
module.exports.ZS = ZS;
