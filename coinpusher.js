'use strict';
/**
 * Coin Pusher: serverová část (peníze, mince na plošině, karty se symboly ze Stackeru).
 *
 * Nahoře jezdí otvor, ze kterého hráč mezerníkem / tlačítkem pustí minci. Mince se odráží mezi kolíky (server to spočítá
 * s náhodou, hráč zvolí jen místo pádu) a dopadne na plošinu. Pak se plošina s tlačítkem rozjede a zatlačí hromadu mincí
 * dopředu; co přepadne přes přední okraj, spadne do výherního otvoru a vyplatí se.
 *
 * Mince na plošině jsou kruhy v pohledu shora (fyzika je jen na serveru, prohlížeč dostane pohyb po snímcích a jen ho přehraje):
 *  - mince (hodnoty 5 až 100) a „karty“ se symboly věcných odměn ze Stackeru (padne-li karta, hráč dostane díl té věci
 *    do stejného inventáře jako ve Stackeru / Key Masteru),
 *  - plošina je v čase hráče vždy v rovnováze: kolik mincí hráč vhodí (vlastní + doplněné strojem), tolik jich v průměru vypadne.
 * Uloženo v účtu (Upstash): zbývající mince `cpCoins`. Rozložení plošiny je v paměti serveru (po restartu se vygeneruje nové).
 */
const { ITEMS } = require('./stacker');

const COINS = Object.freeze([ // typy mincí: hodnota, poloměr, váha při doplňování
  { name: 'Bronzová', v: 5, r: 0.36, w: 45 },
  { name: 'Stříbrná', v: 10, r: 0.42, w: 30 },
  { name: 'Zlatá', v: 25, r: 0.48, w: 15 },
  { name: 'Platinová', v: 50, r: 0.54, w: 7 },
  { name: 'Rubínová', v: 100, r: 0.6, w: 3 },
].map((c) => Object.freeze(c)));
const PLAYER_COIN = 1; // mince, kterou vhazuje hráč (stříbrná)

// karty: jaké věci se na nich objevují (váhy upřednostňují levné věci, kartu pak může padnout i velká věc)
const CARD_WEIGHTS = Object.freeze({ 'Čokoláda': 50, 'Drak na létání': 25, 'Hra do party': 15, 'Svítilna': 6, 'Kšiltovka': 3, 'Plyšový medvěd': 1.2, 'Sluchátka': 0.5, 'Herní ovladač': 0.3, 'Chytré hodinky': 0.3 });
const CARD_ITEMS = ITEMS.map((it, i) => [i, CARD_WEIGHTS[it.name] || 0]).filter((p) => p[1] > 0);

const CP = Object.freeze({
  PACKS: Object.freeze([[1, 50], [3, 100], [5, 175], [10, 350]].map((r) => Object.freeze(r))), // [mincí, cena]
  MAX_COINS: 30,
  W: 9,              // šířka plošiny (x je od -4,5 do 4,5)
  YF: 6.6,           // přední okraj: střed mince za touto čarou = spadla do výherního otvoru
  YD: 0.9,           // hloubka, kam mince dopadají
  PMAX: 1.9,         // o kolik se plošina při tlačení posune dopředu
  H: 6.0,            // výška pádu mince mezi kolíky
  R_CARD: 0.6,
  DT: 1 / 120, T_PRE: 0.1, T_OUT: 0.8, T_HOLD: 0.15, T_BACK: 0.8, T_SETTLE: 0.6, SAMPLE: 6,
  HOUSE_COINS: 2,    // kolik mincí vhodí stroj navíc ke každé hráčově minci (udržuje plošinu)
  CARD_CHANCE: 0.009, // šance, že se po hodu na plošinu přidá nová karta
  MAX_ITEMS: 70, MAX_CARDS: 3,
  MIN_DROP_GAP_MS: 1500,
  MAX_SHELF_AGE_MS: 6 * 60 * 60 * 1000,
  DROP_STEP: 0.3,    // rozestup mezi pády mincí z jednoho hodu (s)
});

// kolíky (mince se mezi nimi odráží): střídavé řady
const PEGS = (() => {
  const out = [];
  for (let row = 0; row < 6; row++) {
    const h = 5.0 - row * 0.8, xs = row % 2 ? [-2.7, -0.9, 0.9, 2.7] : [-3.6, -1.8, 0, 1.8, 3.6];
    for (const x of xs) out.push([x, h]);
  }
  return out;
})();
const PEG_R = 0.14;
const q2 = (n) => Math.round(n * 100) / 100;

/** Pád mince mezi kolíky: vrací [[x, h], ...] po 1/30 s a dopadovou polohu. Náhoda (odrazy) pochází ze serveru. */
function plinko(x0, r, rand) {
  const g = 22, e = 0.45, dt = 1 / 120;
  let x = x0, h = CP.H, vx = (rand() - 0.5) * 0.8, vh = 0;
  const path = [[x, h]];
  const lim = CP.W / 2 - r;
  for (let i = 0; i < 1200 && h > 0; i++) {
    vh -= g * dt; x += vx * dt; h += vh * dt;
    if (x < -lim) { x = -lim; vx = Math.abs(vx) * 0.5; } else if (x > lim) { x = lim; vx = -Math.abs(vx) * 0.5; }
    for (const [px, ph] of PEGS) {
      const dx = x - px, dh = h - ph, rr = r + PEG_R, d2 = dx * dx + dh * dh;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2), nx, nh; if (d < 1e-6) { nx = 0; nh = 1; d = 0; } else { nx = dx / d; nh = dh / d; }
      x = px + nx * rr; h = ph + nh * rr;
      const vn = vx * nx + vh * nh;
      if (vn < 0) { vx -= (1 + e) * vn * nx; vh -= (1 + e) * vn * nh; }
      const a = (rand() - 0.5) * 0.5, ca = Math.cos(a), sa = Math.sin(a); // malá náhoda v odrazu
      const nvx = vx * ca - vh * sa, nvh = vx * sa + vh * ca; vx = nvx; vh = nvh;
      vx += (nx >= 0 ? 1 : -1) * 0.25; // mince se při odrazu trochu odsune stranou, aby se nezasekla na vrcholu kolíku
    }
    if (i % 4 === 3) path.push([x, h]);
  }
  path.push([x, Math.max(0, h)]);
  return { path, x: Math.max(-lim, Math.min(lim, x)), steps: path.length * 4 };
}

/** Jeden tah plošiny: vloží nové věci, rozjede plošinu dopředu a zpět; vrací snímky pohybu a věci, které spadly. */
function stroke(items, rand) {
  const { DT } = CP;
  const nPre = Math.round(CP.T_PRE / DT), nOut = Math.round(CP.T_OUT / DT), nHold = Math.round(CP.T_HOLD / DT), nBack = Math.round(CP.T_BACK / DT), nSettle = Math.round(CP.T_SETTLE / DT);
  const total = nPre + nOut + nHold + nBack + nSettle;
  const smooth = (u) => u * u * (3 - 2 * u);
  const face = (s) => {
    if (s < nPre) return 0;
    s -= nPre; if (s < nOut) return CP.PMAX * smooth(s / nOut);
    s -= nOut; if (s < nHold) return CP.PMAX;
    s -= nHold; if (s < nBack) return CP.PMAX * (1 - smooth(s / nBack));
    return 0;
  };
  const live = items.slice();
  const lastRec = new Map(live.map((it) => [it.id, [it.x, it.y]]));
  const frames = [], fell = [];
  const lim = CP.W / 2;
  const snapshot = (all) => {
    const fr = [];
    for (const it of live) {
      const l = lastRec.get(it.id);
      if (all || Math.abs(it.x - l[0]) > 0.004 || Math.abs(it.y - l[1]) > 0.004) { fr.push([it.id, Math.round(it.x * 100), Math.round(it.y * 100)]); l[0] = it.x; l[1] = it.y; }
    }
    frames.push(fr);
  };
  snapshot(true);
  for (let s = 0; s < total; s++) {
    const p = face(s);
    for (let iter = 0; iter < 8; iter++) {
      for (let i = 0; i < live.length; i++) {
        const a = live[i];
        for (let j = i + 1; j < live.length; j++) {
          const b = live[j], dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
          if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
          const d2 = dx * dx + dy * dy; if (d2 >= rr * rr) continue;
          let d = Math.sqrt(d2), nx, ny;
          if (d < 1e-6) { nx = rand() - 0.5; ny = 0.2; const n = Math.sqrt(nx * nx + ny * ny); nx /= n; ny /= n; d = 0; } else { nx = dx / d; ny = dy / d; }
          const ov = (rr - d) / 2; a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
        }
      }
      for (const it of live) {
        if (it.x < -lim + it.r) it.x = -lim + it.r; else if (it.x > lim - it.r) it.x = lim - it.r;
        if (it.y < p + it.r) it.y = p + it.r;
      }
    }
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].y > CP.YF) { fell.push({ id: live[i].id, f: frames.length }); live.splice(i, 1); }
    }
    if ((s + 1) % CP.SAMPLE === 0) snapshot(false);
  }
  snapshot(false);
  for (const it of live) { it.x = q2(it.x); it.y = q2(it.y); }
  return { frames, fell, live };
}

module.exports = function createCoinPusher({ resolveAccount, markDirty, notifyBalance, TOKEN_RE, FLOOR = 200, rand = Math.random, now = Date.now }) {
  const shelves = new Map(); // acc.key -> { items, nextId, at, lastDrop }
  let template = null;

  const pickWeighted = (list, wf) => { const tot = list.reduce((a, x) => a + wf(x), 0); let r = rand() * tot; for (const x of list) { r -= wf(x); if (r < 0) return x; } return list[list.length - 1]; };
  const randCoinType = () => COINS.indexOf(pickWeighted(COINS, (c) => c.w));
  const randCardItem = () => pickWeighted(CARD_ITEMS, (p) => p[1])[0];

  const mkCoin = (shelf, t, x, y) => ({ id: ++shelf.nextId, k: 'c', t, v: COINS[t].v, r: COINS[t].r, x: q2(x), y: q2(y) });
  const mkCard = (shelf, x, y) => ({ id: ++shelf.nextId, k: 'k', item: randCardItem(), r: CP.R_CARD, x: q2(x), y: q2(y) });

  /** Volné místo pro věc o poloměru r v pásu y0..y1 (nebo null). */
  function freeSpot(items, r, y0, y1) {
    for (let t = 0; t < 200; t++) {
      const x = (rand() - 0.5) * (CP.W - 2 * r - 0.1), y = y0 + rand() * (y1 - y0);
      if (items.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + r + 0.02)) return [x, y];
    }
    return null;
  }

  /** Jeden celý tah: nové věci (id, typ, dráha pádu), pohyb plošiny, co spadlo. Mění shelf.items. */
  function turn(shelf, spawnDefs) {
    const spawn = []; let tMax = 0;
    spawnDefs.forEach((d, i) => {
      const r = d.r, pl = plinko(Math.max(-CP.W / 2 + r, Math.min(CP.W / 2 - r, d.x)), r, rand);
      const t0 = i * CP.DROP_STEP, dur = pl.steps * CP.DT, y = CP.YD + (rand() - 0.5) * 0.5;
      const item = d.k === 'k' ? { id: ++shelf.nextId, k: 'k', item: d.item, r, x: q2(pl.x), y: q2(y) } : { id: ++shelf.nextId, k: 'c', t: d.t, v: COINS[d.t].v, r, x: q2(pl.x), y: q2(y) };
      spawn.push({ ...item, t0: q2(t0), dur: q2(dur), x0: q2(d.x), path: pl.path.map(([px, ph]) => [Math.round(px * 100), Math.round(ph * 100)]), mine: !!d.mine });
      shelf.items.push(item);
      tMax = Math.max(tMax, t0 + dur);
    });
    const sim = stroke(shelf.items, rand);
    const fallenIds = new Set(sim.fell.map((f) => f.id));
    const fallenItems = shelf.items.filter((it) => fallenIds.has(it.id));
    shelf.items = sim.live;
    return { spawn, tStroke: q2(tMax + 0.15), frames: sim.frames, fell: sim.fell, fallenItems };
  }

  function newShelf() {
    if (!template) { // jednou za běh serveru: „rozehraná“ plošina v rovnováze (aby první hráč nedostal jednorázový příval mincí)
      const sh = { items: [], nextId: 0 };
      for (let i = 0; i < 30; i++) { const t = randCoinType(), s = freeSpot(sh.items, COINS[t].r, 1.8, 5.8); if (s) sh.items.push(mkCoin(sh, t, s[0], s[1])); }
      for (let i = 0; i < 26; i++) {
        const defs = [{ k: 'c', t: PLAYER_COIN, r: COINS[PLAYER_COIN].r, x: (rand() - 0.5) * 8 }];
        for (let h = 0; h < CP.HOUSE_COINS; h++) { const t = randCoinType(); defs.push({ k: 'c', t, r: COINS[t].r, x: (rand() - 0.5) * 8 }); }
        turn(sh, defs);
      }
      const card = freeSpot(sh.items, CP.R_CARD, 0.9, 2.2); if (card) sh.items.push(mkCard(sh, card[0], card[1]));
      template = sh;
    }
    return { items: template.items.map((it) => ({ ...it, ...(it.k === 'k' ? { item: randCardItem() } : {}) })), nextId: template.nextId, at: now(), lastDrop: 0 };
  }
  function shelfOf(acc) {
    let sh = shelves.get(acc.key);
    if (!sh || now() - sh.at > CP.MAX_SHELF_AGE_MS) { sh = newShelf(); shelves.set(acc.key, sh); }
    return sh;
  }

  const pubItem = (it) => (it.k === 'k' ? { id: it.id, k: 'k', item: it.item, r: it.r, x: it.x, y: it.y } : { id: it.id, k: 'c', t: it.t, v: it.v, r: it.r, x: it.x, y: it.y });
  const pub = () => ({
    packs: CP.PACKS.map((p) => ({ n: p[0], price: p[1] })), maxCoins: CP.MAX_COINS, W: CP.W, YF: CP.YF, YD: CP.YD, PMAX: CP.PMAX, H: CP.H,
    pegs: PEGS, pegR: PEG_R, types: COINS.map((c) => ({ name: c.name, v: c.v, r: c.r })), cardR: CP.R_CARD,
    cards: ITEMS.map((it) => ({ name: it.name, emoji: it.emoji, need: it.need, price: it.price })),
    timing: { out: CP.T_OUT, hold: CP.T_HOLD, back: CP.T_BACK, settle: CP.T_SETTLE, pre: CP.T_PRE, dt: CP.DT * CP.SAMPLE },
  });
  const state = (acc, shelf, extra) => ({ balance: acc.balance, floor: FLOOR, coins: acc.cpCoins | 0, ...pub(), items: shelf ? shelf.items.map(pubItem) : [], parts: ITEMS.map((_, i) => (acc.items && acc.items[i]) | 0), ...extra });
  const bad = (status, error, acc) => ({ status, json: { error, ...(acc ? { balance: acc.balance, coins: acc.cpCoins | 0 } : {}) } });

  function topUp(acc) {
    if ((acc.cpCoins | 0) > 0 || acc.seat || acc.htable) return false;
    if (acc.balance >= FLOOR) return false;
    acc.balance = FLOOR; markDirty(); notifyBalance(acc);
    return true;
  }

  function handle(action, body) {
    if (!body || typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) return bad(400, 'Neplatný token.');
    const { acc } = resolveAccount({ token: body.token, session: typeof body.session === 'string' ? body.session : undefined });
    acc.lastSeen = now();
    if (!Number.isInteger(acc.cpCoins)) acc.cpCoins = 0;

    if (action === 'state') {
      const r = topUp(acc);
      return { status: 200, json: state(acc, shelfOf(acc), { refilled: r }) };
    }

    if (action === 'buy') {
      const pack = CP.PACKS.find((p) => p[0] === Math.floor(Number(body.n)));
      if (!pack) return bad(400, 'Neznámá nabídka.', acc);
      if (acc.cpCoins + pack[0] > CP.MAX_COINS) return bad(409, `Můžeš mít nejvýš ${CP.MAX_COINS} mincí najednou.`, acc);
      if (acc.balance < pack[1]) return bad(402, 'Nemáš dost žetonů.', acc);
      acc.balance -= pack[1]; acc.cpCoins += pack[0]; markDirty(); notifyBalance(acc);
      return { status: 200, json: state(acc, shelfOf(acc), { bought: pack[0] }) };
    }

    if (action === 'drop') {
      if ((acc.cpCoins | 0) < 1) return bad(409, 'Nemáš žádnou minci. Kup si další.', acc);
      const x = Number(body.x);
      if (!Number.isFinite(x) || Math.abs(x) > CP.W / 2) return bad(400, 'Neplatná poloha.', acc);
      const shelf = shelfOf(acc), t = now();
      if (t - shelf.lastDrop < CP.MIN_DROP_GAP_MS) return bad(429, 'Moc rychle, počkej, až plošina dotlačí.', acc);
      shelf.lastDrop = t;

      const defs = [{ k: 'c', t: PLAYER_COIN, r: COINS[PLAYER_COIN].r, x, mine: true }];
      const n = shelf.items.length, nh = n < 44 ? CP.HOUSE_COINS + 1 : n < 62 ? CP.HOUSE_COINS : n < CP.MAX_ITEMS ? 1 : 0;
      for (let i = 0; i < nh; i++) { const ty = randCoinType(); defs.push({ k: 'c', t: ty, r: COINS[ty].r, x: (rand() - 0.5) * (CP.W - 1) }); }
      const cards = shelf.items.filter((it) => it.k === 'k').length;
      if (cards < CP.MAX_CARDS && rand() < CP.CARD_CHANCE) defs.push({ k: 'k', item: randCardItem(), r: CP.R_CARD, x: (rand() - 0.5) * (CP.W - 1) });

      acc.cpCoins -= 1;
      const res = turn(shelf, defs);
      let coins = 0; const cardsWon = [];
      for (const it of res.fallenItems) {
        if (it.k === 'c') coins += it.v;
        else {
          if (!Array.isArray(acc.items)) acc.items = [];
          acc.items[it.item] = (acc.items[it.item] | 0) + 1;
          cardsWon.push({ id: it.id, item: it.item, parts: acc.items[it.item], need: ITEMS[it.item].need });
        }
      }
      if (coins) { acc.balance += coins; notifyBalance(acc); }
      markDirty();
      const refilled = topUp(acc);
      const fellInfo = res.fell.map((f) => { const it = res.fallenItems.find((o) => o.id === f.id); return it.k === 'c' ? { id: f.id, f: f.f, k: 'c', v: it.v } : { id: f.id, f: f.f, k: 'k', item: it.item }; });
      return { status: 200, json: state(acc, shelf, { drop: { spawn: res.spawn, tStroke: res.tStroke, frames: res.frames, fell: fellInfo, coins, cards: cardsWon }, refilled }) };
    }

    return bad(404, 'Neznámá akce.');
  }

  return { handle, CP, COINS, PEGS, shelfOf, removeAccount: (acc) => shelves.delete(acc.key), _shelves: shelves, _turn: turn };
};
module.exports.CP = CP;
module.exports.COINS = COINS;
