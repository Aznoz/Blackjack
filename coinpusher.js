'use strict';
/**
 * Coin Pusher: serverová část (peníze, mince na plošině, karty se symboly ze Stackeru).
 *
 * Nahoře jezdí otvor, ze kterého hráč mezerníkem / tlačítkem pustí minci. Mince se odráží mezi kolíky (server to spočítá
 * s náhodou, hráč zvolí jen místo pádu) a dopadne na plošinu. Pak se plošina s tlačítkem rozjede a zatlačí hromadu mincí
 * dopředu; co přepadne přes přední okraj, spadne do výherního otvoru a vyplatí se.
 *
 * Mince na plošině jsou kruhy v pohledu shora (fyzika je jen na serveru, prohlížeč dostane pohyb po snímcích a jen ho přehraje):
 *  - mince (hodnoty 10 až 250; hráčova mince z otvoru je náhodného typu) a „karty“ se symboly věcných odměn ze Stackeru (padne-li karta, hráč dostane díl té věci
 *    do stejného inventáře jako ve Stackeru / Key Masteru),
 *  - plošina je v rovnováze: kolik mincí hráč vhodí, tolik jich (zhruba i hodnotou) vypadne. Plošina jezdí v prohlížeči neustále, ale bez nové mince se hromada nehýbe.
 * Uloženo v účtu (Upstash): zbývající mince `cpCoins`. Rozložení plošiny je v paměti serveru (po restartu se vygeneruje nové).
 */
const { ITEMS } = require('./stacker');

const COIN_R = 0.4; // všechny mince jsou stejně velké, liší se barvou a hodnotou
const COINS = Object.freeze([ // typy mincí: hodnota, váha (mince z otvoru se losuje podle vah)
  { name: 'Bronzová', v: 10, r: COIN_R, w: 38 },
  { name: 'Stříbrná', v: 25, r: COIN_R, w: 30 },
  { name: 'Zlatá', v: 50, r: COIN_R, w: 20 },
  { name: 'Platinová', v: 100, r: COIN_R, w: 8 },
  { name: 'Rubínová', v: 250, r: COIN_R, w: 4 },
].map((c) => Object.freeze(c)));

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
  R_CARD: 0.5,        // karta leží NA mincích (s mincemi nekoliduje), tohle je jen poloha vůči stěně
  CARD_CARRY: 0.9,    // karta jede s mincemi, které jsou pod ní (do této vzdálenosti)
  LAYER_P: 0.25,      // šance, že mince leží na druhé vrstvě (na jiných mincích)
  LAYER_K: 0.5,       // mince v různých vrstvách se smí překrývat (vzdálenost aspoň takový podíl součtu poloměrů)
  START_CARDS: 4,
  DT: 1 / 120, T_PRE: 0.1, T_OUT: 0.8, T_HOLD: 0.15, T_BACK: 0.8, T_SETTLE: 0.6, SAMPLE: 6,
  CARD_CHANCE: 0.02,  // šance, že z otvoru po hráčově minci vypadne nová karta (dopadne na hromadu)
  MAX_CARDS: 5,
  MIN_DROP_GAP_MS: 60, MAX_PENDING: 12, // hodit jde pořád dokola; na plošině může čekat nejvýš 12 mincí na tah
  MAX_SHELF_AGE_MS: 6 * 60 * 60 * 1000,
  DROP_STEP: 0.3,    // rozestup mezi pády mincí z jednoho hodu (s)
});

// kolíky (mince se mezi nimi odráží): hustě, střídavé řady. Mezery mezi kolíky jsou i šikmo větší než mince (a u stěn je mezera širší než mince).
const PEGS = (() => {
  const out = [];
  for (let row = 0; row < 6; row++) {
    const h = 5.0 - row * 0.8, xs = row % 2 ? [-2.7, -0.9, 0.9, 2.7] : [-3.5, -1.8, 0, 1.8, 3.5];
    for (const x of xs) out.push([x, h]);
  }
  return out;
})();
const PEG_R = 0.12;
const q2 = (n) => Math.round(n * 100) / 100;

/** Pád mince mezi kolíky: vrací [[x, h], ...] po 1/30 s a dopadovou polohu. Náhoda (odrazy) pochází ze serveru. */
function plinko(x0, r, rand) {
  const g = 22, e = 0.45, dt = 1 / 120;
  let x = x0, h = CP.H, vx = (rand() - 0.5) * 0.8, vh = 0;
  const path = [[x, h]];
  const lim = CP.W / 2 - r;
  let hMark = h, iMark = 0;
  for (let i = 0; i < 1200 && h > 0; i++) {
    if (i - iMark >= 40) { // záchrana: kdyby mince 1/3 s skoro neklesla (zaklínila se), dostane silný postrčení
      if (hMark - h < 0.25) { vx += (rand() < 0.5 ? -1 : 1) * (1.2 + rand()); vh = Math.min(vh, 0) - 2; }
      hMark = h; iMark = i;
    }
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

/** Jeden tah plošiny: vloží nové věci, rozjede plošinu dopředu a zpět; vrací snímky pohybu a věci, které spadly.
 *  Mince jsou kruhy; mince ve stejné vrstvě se neprotínají, mince v různých vrstvách se smí překrývat (leží na sobě).
 *  Karty leží na mincích: nekolidují s nimi, jen jedou s mincemi pod sebou (a plošina je tlačí). */
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
  let prevP = -1;
  for (let s = 0; s < total; s++) {
    const p = face(s);
    const still = !(p > prevP) && s !== 0 && s !== total - 1; prevP = p; // mince se hýbou jen když je plošina tlačí dopředu (couvání a stání nic nemění)
    for (const it of live) { it.ox = it.x; it.oy = it.y; }
    const cs = live.filter((it) => it.k === 'c');
    const pairs = [];
    if (!still) {
    // mřížka (buňka 1,0 >= největší dosah dvojice 0,8): páry se hledají jen mezi sousedními buňkami
    const grid = new Map();
    for (const it of cs) { const key = Math.floor(it.x + 5) * 64 + Math.floor(it.y + 1); let g = grid.get(key); if (!g) { g = []; grid.set(key, g); } g.push(it); }
    for (let ci = 0; ci < cs.length; ci++) {
      const a = cs[ci], gx = Math.floor(a.x + 5), gy = Math.floor(a.y + 1);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const g = grid.get((gx + ox) * 64 + gy + oy); if (!g) continue;
        for (const b of g) if (b.id > a.id) pairs.push(a, b);
      }
    }
    }
    for (let iter = 0; iter < (still ? 0 : 6); iter++) {
      let moved = false;
      for (let pi = 0; pi < pairs.length; pi += 2) {
        const a = pairs[pi], b = pairs[pi + 1], dx = b.x - a.x, dy = b.y - a.y, rr = (a.r + b.r) * (a.lay === b.lay ? 1 : CP.LAYER_K);
        if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
        const d2 = dx * dx + dy * dy; if (d2 >= rr * rr) continue;
        let d = Math.sqrt(d2), nx, ny;
        if (d < 1e-6) { nx = rand() - 0.5; ny = 0.2; const n = Math.sqrt(nx * nx + ny * ny); nx /= n; ny /= n; d = 0; } else { nx = dx / d; ny = dy / d; }
        const ov = (rr - d) / 2; a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov; moved = true;
      }
      for (const it of cs) {
        if (it.x < -lim + it.r) { it.x = -lim + it.r; moved = true; } else if (it.x > lim - it.r) { it.x = lim - it.r; moved = true; }
        if (it.y < p + it.r) { it.y = p + it.r; moved = true; }
      }
      if (!moved) break;
    }
    for (const c of live) { // karty jedou s mincemi pod sebou
      if (c.k !== 'k') continue;
      let sx = 0, sy = 0, n = 0;
      for (const o of cs) { if (Math.abs(o.x - c.x) > CP.CARD_CARRY || Math.abs(o.y - c.y) > CP.CARD_CARRY) continue; if (Math.hypot(o.x - c.x, o.y - c.y) > CP.CARD_CARRY) continue; sx += o.x - o.ox; sy += o.y - o.oy; n++; }
      if (n) { c.x += sx / n; c.y += sy / n; }
      if (c.x < -lim + c.r) c.x = -lim + c.r; else if (c.x > lim - c.r) c.x = lim - c.r;
      if (c.y < p + 0.3) c.y = p + 0.3;
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

  const randLay = () => (rand() < CP.LAYER_P ? 1 : 0);
  const mkCoin = (shelf, t, x, y, lay = randLay()) => ({ id: ++shelf.nextId, k: 'c', t, v: COINS[t].v, r: COINS[t].r, lay, x: q2(x), y: q2(y) });
  const mkCard = (shelf, x, y) => ({ id: ++shelf.nextId, k: 'k', item: randCardItem(), r: CP.R_CARD, x: q2(x), y: q2(y) });

  /** Volné místo pro minci o poloměru r a vrstvě lay v pásu y0..y1 (nebo null). */
  function freeSpot(items, r, y0, y1, lay) {
    for (let t = 0; t < 200; t++) {
      const x = (rand() - 0.5) * (CP.W - 2 * r - 0.1), y = y0 + rand() * (y1 - y0);
      if (items.every((o) => o.k !== 'c' || Math.hypot(o.x - x, o.y - y) > (o.r + r) * (o.lay === lay ? 1 : CP.LAYER_K) + 0.02)) return [x, y];
    }
    return null;
  }

  /** Vloží jednu věc z otvoru: spočítá pád mezi kolíky a dopad. Věc čeká v shelf.pending, dokud ji nezatlačí tah plošiny.
   *  Karta má při pádu mezi kolíky stejný poloměr jako mince (jinak by se mezi kolíky zasekla). */
  function spawnOne(shelf, d, t0) {
    const pr = d.k === 'k' ? COIN_R : d.r, r = d.r;
    const pl = plinko(Math.max(-CP.W / 2 + pr, Math.min(CP.W / 2 - pr, d.x)), pr, rand);
    let y = CP.YD; // dopadová hloubka: aby se nově dopadlé mince nepřekrývaly, hledá se volné místo mezi čekajícími
    for (let tr = 0; tr < 12; tr++) {
      const yy = 0.55 + rand() * 0.95;
      if (shelf.pending.every((o) => o.k !== 'c' || d.k === 'k' || Math.hypot(o.x - pl.x, o.y - yy) > r * 2 + 0.05)) { y = yy; break; }
      y = yy;
    }
    const item = d.k === 'k' ? { id: ++shelf.nextId, k: 'k', item: d.item, r, x: q2(pl.x), y: q2(y) } : { id: ++shelf.nextId, k: 'c', t: d.t, v: COINS[d.t].v, r, lay: randLay(), x: q2(pl.x), y: q2(y) };
    shelf.pending.push(item);
    return { ...item, t0: q2(t0), dur: q2(pl.steps * CP.DT), x0: q2(d.x), path: pl.path.map(([px, ph]) => [Math.round(px * 100), Math.round(ph * 100)]), mine: !!d.mine };
  }

  /** Tah plošiny: zatlačí vybrané čekající věci (ids; bez ids všechny) spolu s hromadou. Mění shelf.items. */
  function strokeShelf(shelf, ids) {
    const take = ids ? shelf.pending.filter((it) => ids.includes(it.id)) : shelf.pending.slice();
    shelf.pending = shelf.pending.filter((it) => !take.includes(it));
    for (const it of take) shelf.items.push(it);
    const sim = stroke(shelf.items, rand);
    const fallenIds = new Set(sim.fell.map((f) => f.id));
    const fallenItems = shelf.items.filter((it) => fallenIds.has(it.id));
    shelf.items = sim.live;
    return { frames: sim.frames, fell: sim.fell, fallenItems, ids: take.map((it) => it.id) };
  }

  /** Celý tah najednou (rozehrání plošiny a testy): nové věci + tah. */
  function turn(shelf, spawnDefs) {
    const spawn = spawnDefs.map((d, i) => spawnOne(shelf, d, i * CP.DROP_STEP));
    const res = strokeShelf(shelf, null);
    return { spawn, tStroke: 0, frames: res.frames, fell: res.fell, fallenItems: res.fallenItems };
  }

  function newShelf() {
    if (!template) { // jednou za běh serveru: „rozehraná“ plošina v rovnováze, na mincích leží karty
      const sh = { items: [], pending: [], nextId: 0 };
      for (let i = 0; i < 56; i++) { const t = randCoinType(), lay = randLay(), s = freeSpot(sh.items, COINS[t].r, 2.7, 6.2, lay); if (s) sh.items.push(mkCoin(sh, t, s[0], s[1], lay)); }
      for (let i = 0; i < 40; i++) { const t = randCoinType(); turn(sh, [{ k: 'c', t, r: COINS[t].r, x: (rand() - 0.5) * 8 }]); }
      const base = sh.items.filter((it) => it.k === 'c' && it.y > 2.8 && it.y < 5.6);
      for (let i = 0; i < CP.START_CARDS && base.length; i++) { const c = base.splice(Math.floor(rand() * base.length), 1)[0]; sh.items.push(mkCard(sh, Math.max(-3.9, Math.min(3.9, c.x + (rand() - 0.5) * 0.3)), c.y + (rand() - 0.5) * 0.3)); }
      template = sh;
    }
    return { items: template.items.map((it) => ({ ...it, ...(it.k === 'k' ? { item: randCardItem() } : {}) })), pending: [], nextId: template.nextId, at: now(), lastDrop: 0 };
  }
  function shelfOf(acc) {
    let sh = shelves.get(acc.key);
    if (!sh || now() - sh.at > CP.MAX_SHELF_AGE_MS) { sh = newShelf(); shelves.set(acc.key, sh); }
    return sh;
  }

  const pubItem = (it) => (it.k === 'k' ? { id: it.id, k: 'k', item: it.item, r: it.r, x: it.x, y: it.y } : { id: it.id, k: 'c', t: it.t, v: it.v, r: it.r, lay: it.lay, x: it.x, y: it.y });
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
    const sh = shelves.get(acc.key); if (sh && sh.pending.length) return false;
    if (acc.balance >= FLOOR) return false;
    acc.balance = FLOOR; markDirty(); notifyBalance(acc);
    return true;
  }

  /** Připíše výhru z tahu (mince do zůstatku, karty do inventáře) a vrátí popis pro prohlížeč. */
  function payout(acc, res) {
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
    if (coins || cardsWon.length) markDirty();
    const fell = res.fell.map((f) => { const it = res.fallenItems.find((o) => o.id === f.id); return it.k === 'c' ? { id: f.id, f: f.f, k: 'c', v: it.v } : { id: f.id, f: f.f, k: 'k', item: it.item }; });
    return { frames: res.frames, fell, coins, cards: cardsWon, ids: res.ids };
  }

  function handle(action, body) {
    if (!body || typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) return bad(400, 'Neplatný token.');
    const { acc } = resolveAccount({ token: body.token, session: typeof body.session === 'string' ? body.session : undefined });
    acc.lastSeen = now();
    if (!Number.isInteger(acc.cpCoins)) acc.cpCoins = 0;

    if (action === 'state') {
      const shelf = shelfOf(acc); let flushed = false;
      if (shelf.pending.length) { payout(acc, strokeShelf(shelf, null)); flushed = true; } // mince, které při zavření stránky nestihly dotlačit
      const r = topUp(acc);
      return { status: 200, json: state(acc, shelf, { refilled: r, flushed }) };
    }

    if (action === 'buy') {
      const pack = CP.PACKS.find((p) => p[0] === Math.floor(Number(body.n)));
      if (!pack) return bad(400, 'Neznámá nabídka.', acc);
      if (acc.cpCoins + pack[0] > CP.MAX_COINS) return bad(409, `Můžeš mít nejvýš ${CP.MAX_COINS} mincí najednou.`, acc);
      if (acc.balance < pack[1]) return bad(402, 'Nemáš dost žetonů.', acc);
      acc.balance -= pack[1]; acc.cpCoins += pack[0]; markDirty(); notifyBalance(acc);
      return { status: 200, json: state(acc, shelfOf(acc), { bought: pack[0] }) };
    }

    // drop: mince z otvoru padá mezi kolíky a dopadne na plošinu (zatím jen čeká); tah plošiny je zvlášť (push)
    if (action === 'drop') {
      if ((acc.cpCoins | 0) < 1) return bad(409, 'Nemáš žádnou minci. Kup si další.', acc);
      const x = Number(body.x);
      if (!Number.isFinite(x) || Math.abs(x) > CP.W / 2) return bad(400, 'Neplatná poloha.', acc);
      const shelf = shelfOf(acc), t = now();
      if (shelf.pending.length >= CP.MAX_PENDING) return bad(429, 'Počkej, než plošina zatlačí mince.', acc);
      if (t - shelf.lastDrop < CP.MIN_DROP_GAP_MS) return bad(429, 'Moc rychle.', acc);
      shelf.lastDrop = t;
      const ty = randCoinType();
      const spawn = [spawnOne(shelf, { k: 'c', t: ty, r: COINS[ty].r, x, mine: true }, 0)];
      const cards = shelf.items.filter((it) => it.k === 'k').length + shelf.pending.filter((it) => it.k === 'k').length;
      if (cards < CP.MAX_CARDS && rand() < CP.CARD_CHANCE) spawn.push(spawnOne(shelf, { k: 'k', item: randCardItem(), r: CP.R_CARD, x: (rand() - 0.5) * (CP.W - 1) }, CP.DROP_STEP));
      acc.cpCoins -= 1; markDirty();
      return { status: 200, json: { balance: acc.balance, coins: acc.cpCoins, drop: { spawn }, pending: shelf.pending.length } };
    }

    // push: tah plošiny, který zatlačí čekající mince (ids = ty, které prohlížeč do tahu počítá) a vyplatí, co přepadne
    if (action === 'push') {
      const shelf = shelfOf(acc);
      const ids = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isInteger(n)).slice(0, 40) : null;
      if (!shelf.pending.length || (ids && !shelf.pending.some((it) => ids.includes(it.id)))) return bad(409, 'Není co tlačit.', acc);
      const res = payout(acc, strokeShelf(shelf, ids));
      const refilled = topUp(acc);
      return { status: 200, json: state(acc, shelf, { push: res, refilled }) };
    }

    return bad(404, 'Neznámá akce.');
  }

  return { handle, CP, COINS, PEGS, shelfOf, removeAccount: (acc) => shelves.delete(acc.key), _shelves: shelves, _turn: turn };
};
module.exports.CP = CP;
module.exports.COINS = COINS;
