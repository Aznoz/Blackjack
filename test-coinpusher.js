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
const overlaps = (items) => { for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const a = items[i], b = items[j]; if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 0.06) return [a, b]; } return null; };

// --- token a neznámá akce
assert.equal(createCoinPusher({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /^[a-z]{24}$/ }).handle('state', { token: '!' }).status, 400);
assert.equal(call('nope').status, 404);

// --- stav
let r = call('state');
assert.equal(r.status, 200); assert.equal(r.json.coins, 0); assert.equal(r.json.packs.length, 4);
assert.deepEqual(r.json.packs.map((p) => [p.n, p.price]), [[1, 50], [3, 100], [5, 175], [10, 350]]);
assert.ok(r.json.items.length >= 40 && r.json.items.length <= 75, 'rozehraná plošina: ' + r.json.items.length);
assert.ok(r.json.items.every((it) => it.y - it.r >= CP.PMAX - 0.02), 'před plošinou nic neleží (nečinná plošina nic nehne)');
assert.ok(r.json.items.every((it) => it.x - it.r >= -CP.W / 2 - 1e-9 && it.x + it.r <= CP.W / 2 + 1e-9 && it.y >= it.r - 1e-9 && it.y < CP.YF), 'věci jsou na plošině');
assert.equal(overlaps(r.json.items), null, 'věci se nepřekrývají');
assert.equal(r.json.types.length, COINS.length);
assert.deepEqual(r.json.types.map((x) => x.v), [10, 25, 50, 100, 250]);
assert.ok(r.json.types.every((x, i, a) => !i || x.r > a[i - 1].r), 'vyšší hodnota = větší mince');

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
r = call('drop', { x: 0.5 });
assert.equal(r.status, 200); assert.equal(acc.cpCoins, 4); assert.equal(r.json.coins, 4);
{
  const d = r.json.drop;
  assert.ok(d.spawn[0].mine && d.spawn[0].k === 'c', 'první padá hráčova mince');
  assert.equal(d.spawn.filter((s) => s.k === 'c').length, 1, 'padá jen jedna mince (žádné mince navíc)');
  assert.equal(d.spawn[0].x0, 0.5);
  assert.ok(d.spawn.every((s) => s.path.length > 10 && s.path[0][1] === CP.H * 100 || Math.abs(s.path[0][1] - CP.H * 100) < 1), 'pád začíná nahoře');
  assert.ok(d.spawn.every((s, i) => s.t0 >= 0 && (!i || s.t0 > d.spawn[i - 1].t0)), 'věci padají postupně');
  assert.ok(d.tStroke > d.spawn[d.spawn.length - 1].t0 + d.spawn[d.spawn.length - 1].dur, 'tah až po dopadu');
  assert.ok(d.frames.length > 20 && d.frames[0].length >= before, 'první snímek má všechno');
  assert.ok(r.json.items.every((it) => it.y - it.r >= CP.PMAX - 0.02), 'po tahu je před plošinou volno');
  const fallenCoins = d.fell.filter((f) => f.k === 'c').reduce((a, f) => a + f.v, 0);
  assert.equal(d.coins, fallenCoins); assert.equal(acc.balance, bal0 + fallenCoins);
  assert.equal(overlaps(r.json.items), null, 'po tahu se věci nepřekrývají');
  assert.ok(d.fell.every((f) => !r.json.items.some((it) => it.id === f.id)), 'co spadlo, na plošině už není');
}
assert.equal(call('drop', { x: 1 }).status, 429, 'moc rychlý druhý hod'); assert.equal(acc.cpCoins, 4);
t += 1600;

// --- karta: vynutíme ji na plošině těsně před hranou
{
  const sh = cp.shelfOf(acc); const card = { id: ++sh.nextId, k: 'k', item: 0, r: CP.R_CARD, x: 0, y: CP.YF - 0.2 };
  sh.items = sh.items.filter((it) => Math.hypot(it.x - card.x, it.y - card.y) > it.r + card.r + 0.05); sh.items.push(card);
  acc.cpCoins = 30; acc.items = [];
  let got = null; for (let i = 0; i < 30 && !got; i++) { t += 1600; const rr = call("drop", { x: -3 + (i % 5) * 1.5 }); const c = rr.json.drop.cards.find((q) => q.id === card.id); if (c) got = c; }
  assert.ok(got, 'karta při tlačení přepadla'); assert.equal(got.item, 0); assert.equal(acc.items[0], 1, 'díl se připsal do inventáře Stackeru');
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
    const rr = call2('drop', { x: (rand() - 0.5) * 8 }); assert.equal(rr.status, 200);
    won += rr.json.drop.coins; cards += rr.json.drop.cards.length; drops++; maxFell = Math.max(maxFell, rr.json.drop.fell.length);
    const n = rr.json.items.length; minN = Math.min(minN, n); maxN = Math.max(maxN, n); assert.equal(rr.json.drop.spawn.filter((s) => s.k === 'c').length, 1);
    if (i % 25 === 0) assert.equal(overlaps(rr.json.items), null, 'bez překryvů v běhu');
  }
  const perDrop = won / drops;
  console.log(`  ${N} hodů: průměrně ${perDrop.toFixed(1)} coinů / hod, karet ${cards}, věcí na plošině ${minN}-${maxN}, nejvíc spadlo naráz ${maxFell}`);
  assert.ok(minN >= 40 && maxN <= 75, 'plošina se nevyprázdní a nepřeroste: ' + minN + '..' + maxN);
  assert.ok(perDrop > 28 && perDrop < 55, 'výnos je rozumný (cena mince 33 až 50): ' + perDrop);
  assert.ok(cards >= 0 && cards <= 12);
}

// --- topUp: bez mincí a pod podlahou se kredit doplní
{ acc.cpCoins = 0; acc.balance = 3; r = call('state'); assert.equal(r.json.refilled, true); assert.equal(acc.balance, 200); }
console.log('coinpusher: OK');
