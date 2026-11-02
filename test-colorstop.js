'use strict';
/** Test serverové části Color Stopu: cena, trasa, výplatní tabulka, omezení skóre podle času, ochrany, obnova kreditu. */
const assert = require('assert');
const createColorStop = require('./colorstop');
const { CS } = createColorStop;

let t = 1_000_000;
const acc = { key: 'k', balance: 1000, lastSeen: 0 };
const mk = (a = acc, rand = Math.random) => createColorStop({ resolveAccount: () => ({ acc: a }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/, rand, now: () => t });
const cs = mk();
const call = (a, b = {}) => cs.handle(a, { token: 'x'.repeat(24), ...b });

// --- tabulka
assert.equal(CS.payoutFor(0), 0); assert.equal(CS.payoutFor(4), 0); assert.equal(CS.payoutFor(5), 50); assert.equal(CS.payoutFor(9), 50);
assert.equal(CS.payoutFor(10), 100); assert.equal(CS.payoutFor(49), 6000); assert.equal(CS.payoutFor(50), 20000);
assert.equal(CS.speedAt(0), 100); assert.equal(CS.speedAt(49), 394);
assert.equal(CS.dmaxAt(0), 9); assert.equal(CS.dmaxAt(10), 9); assert.equal(CS.dmaxAt(46), 2); assert.equal(CS.dmaxAt(49), 2);
for (let k = 11; k < 46; k++) assert.ok(CS.dmaxAt(k) <= CS.dmaxAt(k - 1) && CS.dmaxAt(k) >= 3, 'dmax klesá: ' + k);

// --- neplatný token
assert.equal(cs.handle('state', { token: 5 }).status, 400);
{ const c = createColorStop({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /^[a-z]{24}$/, now: () => t }); assert.equal(c.handle('state', { token: 'ABC' }).status, 400); }

// --- stav
let r = call('state');
assert.equal(r.status, 200); assert.equal(r.json.balance, 1000); assert.equal(r.json.price, 100); assert.equal(r.json.jackpot, 20000);
assert.equal(r.json.payouts[0][0], 50);

// --- start: cena, trasa
r = call('start');
assert.equal(r.status, 200); assert.equal(r.json.balance, 900);
const g1 = r.json; assert.equal(g1.route.length, 50);
for (let i = 0; i < 50; i++) {
  const [d, c] = g1.route[i];
  assert.ok(Number.isInteger(d) && d >= 2 && d <= CS.dmaxAt(i), `vzdálenost ${d} v kroku ${i}`); assert.ok(Number.isInteger(c) && c >= 0 && c < 8, 'barva ' + c);
  if (i) assert.notEqual(c, g1.route[i - 1][1], 'dvě stejné barvy po sobě');
}

// --- špatné konce hry
assert.equal(call('end', { gameId: g1.gameId + 1, score: 3 }).status, 409);
assert.equal(call('end', { gameId: g1.gameId, score: -1 }).status, 400);
assert.equal(call('end', { gameId: g1.gameId, score: 51 }).status, 400);
assert.equal(call('end', { gameId: g1.gameId, score: 'x' }).status, 400);
assert.equal(acc.balance, 900, 'neplatné konce nic nevyplatí');

// --- podvod: 50 zásahů okamžitě -> skóre se omezí na 0
t += 300;
r = call('end', { gameId: g1.gameId, score: 50 });
assert.equal(r.status, 200); assert.equal(r.json.score, 0); assert.equal(r.json.capped, true); assert.equal(r.json.payout, 0); assert.equal(r.json.jackpot, false);
assert.equal(acc.balance, 900);
assert.equal(call('end', { gameId: g1.gameId, score: 3 }).status, 409, 'hra jde ukončit jen jednou');

// --- poctivá hra: skóre 12 za dostatečný čas
{
  r = call('start'); assert.equal(acc.balance, 800); const g = r.json;
  let need = 0; for (let k = 0; k < 12; k++) need += ((g.route[k][0] - 1) * 30 / CS.speedAt(k)) * 1000;
  t += Math.ceil(need) + 50; // bez tolerance 0,85 by to nevyšlo, s ní ano
  r = call('end', { gameId: g.gameId, score: 12 });
  assert.equal(r.json.score, 12); assert.equal(r.json.payout, 100); assert.equal(r.json.capped, false); assert.equal(acc.balance, 900);
}
// --- skóre se omezí na to, co čas dovolí
{
  r = call('start'); const g = r.json; // -100
  let need = 0; for (let k = 0; k < 10; k++) need += ((g.route[k][0] - 1) * 30 / CS.speedAt(k)) * 1000 * CS.SLACK;
  t += Math.ceil(need) + 5;
  r = call('end', { gameId: g.gameId, score: 40 });
  assert.equal(r.json.score, 10); assert.equal(r.json.claimed, 40); assert.equal(r.json.capped, true); assert.equal(r.json.payout, 100);
}
// --- jackpot: dost času na všech 50
{
  const before = acc.balance;
  r = call('start'); const g = r.json;
  let need = 0; for (let k = 0; k < 50; k++) need += ((g.route[k][0] - 1) * 30 / CS.speedAt(k)) * 1000;
  t += Math.ceil(need) + 100;
  r = call('end', { gameId: g.gameId, score: 50 });
  assert.equal(r.json.score, 50); assert.equal(r.json.jackpot, true); assert.equal(r.json.payout, 20000); assert.equal(acc.balance, before - 100 + 20000);
}
// --- prohra hned: skóre 0 nic nevyplatí
{ const before = acc.balance; r = call('start'); r = call('end', { gameId: r.json.gameId, score: 0 }); assert.equal(r.json.payout, 0); assert.equal(acc.balance, before - 100); }
// --- zahozená hra se přepíše novou, stará už skončit nejde
{ const a = call('start').json; const b = call('start').json; assert.notEqual(a.gameId, b.gameId); assert.equal(call('end', { gameId: a.gameId, score: 0 }).status, 409); assert.equal(call('end', { gameId: b.gameId, score: 0 }).status, 200); }
// --- příliš dlouhá hra se nevyplatí
{ const g = call('start').json; t += CS.MAX_GAME_MS + 1000; r = call('end', { gameId: g.gameId, score: 50 }); assert.equal(r.json.score, 0); }
// --- málo žetonů; obnova kreditu
{ const poor = { key: 'p', balance: 50, lastSeen: 0 }; const c = mk(poor); const q = (a, b) => c.handle(a, { token: 'y'.repeat(24), ...b });
  let x = q('start'); assert.equal(x.status, 402); assert.equal(x.json.balance, 50);
  x = q('state'); assert.equal(x.json.refilled, true); assert.equal(poor.balance, 200); x = q('start'); assert.equal(x.status, 200); assert.equal(poor.balance, 100);
  // během rozehrané hry se kredit nedoplňuje; po konci s nulou ano
  poor.balance = 100; x = q('start'); assert.equal(poor.balance, 0); x = q('state'); assert.equal(x.json.refilled, false); assert.equal(poor.balance, 0);
  x = q('end', { gameId: x.json.gameId ?? 0, score: 0 }); // špatné id -> 409
  assert.equal(x.status, 409);
}
// --- trasa: mezery se ke konci zmenšují, nejmenší možná je jedno políčko (vzdálenost 2)
{ const avg = (from, to) => { let sum = 0, n = 0, min = 99; for (let i = 0; i < 300; i++) { acc.balance = 1000; const g = call('start'); for (let k = from; k < to; k++) { sum += g.json.route[k][0]; n++; min = Math.min(min, g.json.route[k][0]); } } return { avg: sum / n, min }; };
  const early = avg(0, 10), mid = avg(20, 30), late = avg(40, 46), last = avg(46, 50);
  console.log('  průměrná vzdálenost: začátek', early.avg.toFixed(2), '| střed', mid.avg.toFixed(2), '| konec', late.avg.toFixed(2), '| poslední 4:', last.avg.toFixed(2));
  assert.ok(early.avg > 5.4 && early.avg < 6.6, 'začátek ≈ 5,5 (2–9)'); assert.ok(mid.avg < early.avg && late.avg < mid.avg, 'mezery se zmenšují');
  assert.equal(early.min, 2, 'nejmenší vzdálenost 2 (mezera jen 1 políčko) se vyskytuje i na začátku'); assert.equal(last.avg, 2, 'poslední zásahy mají vždy mezeru 1 políčko'); }

console.log('Color Stop: všechny testy prošly ✓');
