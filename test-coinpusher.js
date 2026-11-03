'use strict';
/** Test Coin Pusheru: nabídky mincí, ochrany, výplata podle toho, co spadlo, karty (díly Stackeru), rovnováha plošiny, bez překryvů. */
const assert = require('assert');
const createCoinPusher = require('./coinpusher');
const { ITEMS } = require('./stacker');

let t = 9_000_000; let seed = 1234; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const acc = { key: 'a', balance: 5000, lastSeen: 0, cpCoins: 0, items: [] };
const cp = createCoinPusher({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/, rand, now: () => t });
const { CP, COINS } = cp;
const call = (a, b = {}) => cp.handle(a, { token: 'x'.repeat(24), ...b });
// mince ve stejné vrstvě se nepřekrývají, v různých vrstvách se smí překrývat; karty na mincích s nimi nekolidují
// hod + tah plošiny dohromady (v prohlížeči jsou to dva požadavky: drop a push)
const dpWith = (fn) => (x) => {
  const a = fn('drop', { x }); if (a.status !== 200) return a;
  let b = fn('push', { ids: a.json.drop.spawn.map((q) => q.id) }); if (b.status !== 200) return b;
  const tot = { ...b.json.push, cards: [...b.json.push.cards], fell: [...b.json.push.fell] };
  for (let i = 0; i < 4 && b.json.push.again; i++) { // co spadlo z plošiny, zatlačí další tah (prohlížeč ho pošle sám)
    b = fn('push', { ids: [] }); assert.equal(b.status, 200);
    tot.coins += b.json.push.coins; tot.cards.push(...b.json.push.cards); tot.fell.push(...b.json.push.fell); tot.again = b.json.push.again;
  }
  assert.equal(b.json.push.again, false, 'po řetězu tahů nic neleží v dosahu plošiny');
  return { status: 200, json: { ...b.json, coins: a.json.coins, drop: { ...tot, spawn: a.json.drop.spawn } } };
};
const overlaps = (items) => { const cs = items.filter((it) => it.k === 'c'); for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const a = cs[i], b = cs[j], rr = (a.r + b.r) * (a.lay === b.lay ? 1 : CP.LAYER_K); if (Math.hypot(a.x - b.x, a.y - b.y) < rr - 0.06) return [a, b]; } return null; };

// --- token a neznámá akce
assert.equal(createCoinPusher({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /^[a-z]{24}$/ }).handle('state', { token: '!' }).status, 400);
assert.equal(call('nope').status, 404);

// --- stav
let r = call('state');
assert.equal(r.status, 200); assert.equal(r.json.coins, 0); assert.equal(r.json.packs.length, 4);
assert.deepEqual(r.json.packs.map((p) => [p.n, p.price]), [[1, 50], [3, 100], [5, 175], [10, 350]]);
assert.ok(r.json.items.length >= 60 && r.json.items.length <= 140, 'rozehraná plošina: ' + r.json.items.length);
assert.ok(r.json.items.filter((it) => it.k === 'c').every((it) => it.y - it.r >= CP.P0 + CP.PMAX - 0.04), 'před plošinou žádná mince neleží (nečinná plošina nic nehne)');
{ const cards = r.json.items.filter((it) => it.k === 'k'), cs = r.json.items.filter((it) => it.k === 'c');
  assert.equal(cards.length, CP.START_CARDS, 'karty jsou od začátku na hromadě');
  assert.ok(cards.every((c) => cs.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < 0.6)), 'každá karta leží na nějaké minci');
  assert.ok(cs.some((c) => c.lay === 1) && cs.some((c) => c.lay === 0), 'mince leží ve dvou vrstvách (na sobě)'); }
assert.ok(r.json.items.every((it) => it.x - it.r >= -CP.W / 2 - 1e-9 && it.x + it.r <= CP.W / 2 + 1e-9 && it.y >= it.r - 1e-9 && it.y < CP.YF), 'věci jsou na plošině');
assert.equal(overlaps(r.json.items), null, 'věci se nepřekrývají');
assert.equal(r.json.types.length, COINS.length);
assert.deepEqual(r.json.types.map((x) => x.v), [10, 25, 50, 100, 250]);
assert.ok(r.json.types.every((x, i, a) => !i || x.r === a[0].r), 'všechny mince jsou stejně velké');

// --- nákup
assert.equal(call('buy', { n: 2 }).status, 400, 'jen nabízené balíčky');
assert.equal(call('buy', {}).status, 400);
r = call('buy', { n: 1 }); assert.equal(r.status, 200); assert.equal(r.json.coins, 1); assert.equal(acc.balance, 4950);
r = call('buy', { n: 3 }); assert.equal(acc.balance, 4850); assert.equal(acc.cpCoins, 4);
r = call('buy', { n: 5 }); assert.equal(acc.balance, 4675); assert.equal(acc.cpCoins, 9);
r = call('buy', { n: 10 }); assert.equal(acc.balance, 4325); assert.equal(acc.cpCoins, 19);
r = call('buy', { n: 10 }); assert.equal(acc.cpCoins, 29); assert.equal(acc.balance, 3975);
assert.equal(call('buy', { n: 3 }).status, 409, 'nejvýš 30 mincí'); assert.equal(acc.balance, 3975);
acc.balance = 40; assert.equal(call('buy', { n: 1 }).status, 402); assert.equal(acc.cpCoins, 29);
acc.balance = 5000;

// --- ochrany hodu
acc.cpCoins = 0; assert.equal(call('drop', { x: 0 }).status, 409, 'bez mince se nehází');
acc.cpCoins = 5;
assert.equal(call('drop', { x: 'a' }).status, 400); assert.equal(call('drop', {}).status, 400); assert.equal(call('drop', { x: 5 }).status, 400); assert.equal(call('drop', { x: -4.6 }).status, 400);
assert.equal(acc.cpCoins, 5, 'neplatný hod minci nespotřebuje');

// --- hod: výplata podle toho, co spadlo
let before = call('state').json.items.length;
const bal0 = acc.balance;
const dp = dpWith(call);
r = dp(0.5);
assert.equal(r.status, 200); assert.equal(acc.cpCoins, 4); assert.equal(r.json.coins, 4);
{
  const d = r.json.drop;
  assert.ok(d.spawn[0].mine && d.spawn[0].k === 'c', 'první padá hráčova mince');
  assert.equal(d.spawn.filter((s) => s.k === 'c').length, 1, 'padá jen jedna mince (žádné mince navíc)');
  assert.equal(d.spawn[0].x0, 0.5);
  assert.ok(d.spawn.every((s) => s.path.length > 10 && s.path[0][1] === CP.H * 100 || Math.abs(s.path[0][1] - CP.H * 100) < 1), 'pád začíná nahoře');
  assert.ok(d.spawn.every((s, i) => s.t0 >= 0 && (!i || s.t0 > d.spawn[i - 1].t0)), 'věci padají postupně');
  assert.ok(d.frames.length > 20 && d.frames[0].length >= before, 'první snímek má všechno');
  assert.ok(r.json.items.filter((it) => it.k === 'c').every((it) => it.y - it.r >= CP.P0 + CP.PMAX - 0.04), 'po tahu je před plošinou volno');
  const fallenCoins = d.fell.filter((f) => f.k === 'c').reduce((a, f) => a + f.v, 0);
  assert.equal(d.coins, fallenCoins); assert.equal(acc.balance, bal0 + fallenCoins);
  assert.equal(overlaps(r.json.items), null, 'po tahu se věci nepřekrývají');
  assert.ok(d.fell.every((f) => !r.json.items.some((it) => it.id === f.id)), 'co spadlo, na plošině už není');
}
assert.equal(call('drop', { x: 1 }).status, 429, 'moc rychlý druhý hod (menší než 60 ms)'); assert.equal(acc.cpCoins, 4);
t += 1600;

// --- karta: položíme ji na nejpřednější minci, a jak se hromada tlačí, jede s mincemi a přepadne
{
  const sh = cp.shelfOf(acc); const front = sh.items.filter((it) => it.k === 'c').sort((p, q) => q.y - p.y)[0];
  const card = { id: ++sh.nextId, k: 'k', item: 0, r: CP.R_CARD, x: front.x, y: front.y }; sh.items.push(card);
  acc.cpCoins = 30; acc.items = [];
  let got = null; for (let i = 0; i < 30 && !got; i++) { t += 1600; const rr = dp(-3 + (i % 5) * 1.5); const c = rr.json.drop.cards.find((q) => q.id === card.id); if (c) got = c; }
  assert.ok(got, 'karta s mincemi přepadla'); assert.equal(got.item, 0); assert.equal(acc.items[0], 1, 'díl se připsal do inventáře Stackeru');
  assert.equal(got.need, ITEMS[0].need); assert.equal(got.parts, 1);
}

// --- simulace: rovnováha (plošina se nevyprázdní ani nepřeroste), výnos a velikost hromady
{
  const acc2 = { key: 'b', balance: 1e9, lastSeen: 0, cpCoins: 0, items: [] };
  const cp2 = createCoinPusher({ resolveAccount: () => ({ acc: acc2 }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/, rand, now: () => t });
  const call2 = (a, b = {}) => cp2.handle(a, { token: 'x'.repeat(24), ...b });
  let won = 0, drops = 0, minN = 1e9, maxN = 0, cards = 0, maxFell = 0; const N = 600;
  for (let i = 0; i < N; i++) {
    if (acc2.cpCoins < 1) call2('buy', { n: 10 });
    t += 1600;
    const rr = dpWith(call2)((rand() - 0.5) * 8); assert.equal(rr.status, 200);
    won += rr.json.drop.coins; cards += rr.json.drop.cards.length; drops++; maxFell = Math.max(maxFell, rr.json.drop.fell.length);
    const n = rr.json.items.length; minN = Math.min(minN, n); maxN = Math.max(maxN, n); assert.equal(rr.json.drop.spawn.filter((s) => s.k === 'c').length, 1);
    if (i % 25 === 0) assert.equal(overlaps(rr.json.items), null, 'bez překryvů v běhu');
  }
  const perDrop = won / drops;
  console.log(`  ${N} hodů: průměrně ${perDrop.toFixed(1)} coinů / hod, karet ${cards}, věcí na plošině ${minN}-${maxN}, nejvíc spadlo naráz ${maxFell}`);
  assert.ok(minN >= 50 && maxN <= 150, 'plošina se nevyprázdní a nepřeroste: ' + minN + '..' + maxN);
  assert.ok(perDrop > 28 && perDrop < 55, 'výnos je rozumný (cena mince 33 až 50): ' + perDrop);
  assert.ok(cards >= 1 && cards <= 40, "karty padají občas: " + cards);
}

// --- házení bez přestávky: více mincí padá hned po sobě a jeden tah je zatlačí společně
{
  acc.cpCoins = 12; acc.balance = 5000; t += 1000;
  const ids = []; let bal = acc.balance;
  for (let i = 0; i < 6; i++) { t += 80; const a = call('drop', { x: -3 + i }); assert.equal(a.status, 200, 'hod ' + i); assert.equal(a.json.coins, 11 - i); assert.equal(a.json.balance, bal, 'hod nic nevyplácí, dokud plošina netlačí'); ids.push(...a.json.drop.spawn.map((q) => q.id)); }
  const pend = cp.shelfOf(acc).pending; assert.equal(pend.length, ids.length, 'mince čekají na tah');
  assert.ok(pend.filter((o) => o.k === 'c').every((o, i, arr) => arr.every((p, j) => i === j || Math.hypot(o.x - p.x, o.y - p.y) > o.r * 2 - 0.06 || o.lay !== p.lay)), 'čekající mince se nepřekrývají');
  assert.equal(call('push', { ids: [999999] }).status, 409, 'cizí id nic netlačí');
  const b = call('push', { ids }); assert.equal(b.status, 200); assert.deepEqual(b.json.push.ids.slice().sort((p, q) => p - q), ids.slice().sort((p, q) => p - q), 'tah zatlačil všech 6 najednou');
  assert.equal(cp.shelfOf(acc).pending.length, 0);
  assert.equal(b.json.push.again, true, 'mince spadly z plošiny a leží v dosahu: potřebují další tah');
  assert.equal(overlaps(b.json.items), null);
  let tot = b.json.push.coins, last = b; for (let i = 0; i < 4 && last.json.push.again; i++) { last = call('push', { ids: [] }); assert.equal(last.status, 200); tot += last.json.push.coins; }
  assert.equal(last.json.push.again, false); assert.equal(call('push', { ids: [] }).status, 409, 'není co tlačit');
  assert.equal(last.json.balance, bal + tot);
  assert.equal(overlaps(last.json.items), null);
  // strop čekajících mincí
  acc.cpCoins = 30; t += 1000; let st = 200; for (let i = 0; i < 14 && st === 200; i++) { t += 80; st = call('drop', { x: 0 }).status; } assert.equal(st, 429, 'nejvýš ' + CP.MAX_PENDING + ' čekajících');
  // po zavření stránky: čekající mince se při dalším načtení dotlačí a vyplatí
  const f = call('state'); assert.equal(f.json.flushed, true); assert.equal(cp.shelfOf(acc).pending.length, 0);
}

// --- topUp: bez mincí a pod podlahou se kredit doplní
{ acc.cpCoins = 0; acc.balance = 3; r = call('state'); assert.equal(r.json.refilled, true); assert.equal(acc.balance, 200); }
console.log('coinpusher: OK');
