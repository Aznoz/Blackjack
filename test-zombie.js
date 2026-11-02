'use strict';
/** Test Zombie Snatcheru: fyzika je deterministická, server přepočítá výstřel, výplata, písmena + jackpot, pokusy, ochrany. */
const assert = require('assert');
const Z = require('./zsim');
const createZombie = require('./zombie');
const { ZS } = createZombie;

let t = 5_000_000; let seed = 99; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const acc = { key: 'a', balance: 5000, lastSeen: 0, zsTries: 0, zsLetters: 0 };
let notified = 0;
const zs = createZombie({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() { notified++; }, TOKEN_RE: /.+/, rand, now: () => t });
const call = (a, b = {}) => zs.handle(a, { token: 'x'.repeat(24), ...b });

// --- fyzika: deterministická, jen celá čísla úhlu, díra a rameno fungují
{
  const pk = [{ id: 1, r: 0.12, x: 0.5, y: 0.1 }, { id: 2, r: 0.09, x: -0.4, y: -0.5 }, { id: 3, r: 0.06, x: 0.2, y: 0.7 }];
  const a = Z.run(pk, 123), b = Z.run(pk, 123);
  assert.deepEqual(a.pucks.map((p) => [p.x, p.y, p.alive]), b.pucks.map((p) => [p.x, p.y, p.alive]), 'stejný vstup = bitově stejný výsledek');
  assert.equal(a.step, Z.STEPS); assert.ok(Math.abs(Z.TOTAL_T - 2.6) < 1e-9);
  const c = Z.run(pk, 400); assert.notDeepEqual(a.pucks.map((p) => [p.x, p.y]), c.pucks.map((p) => [p.x, p.y]), 'úhel plošiny mění výsledek');
  // puk nikdy neskončí mimo plošinu ani ve sloupu
  for (let phi = 0; phi < Z.C.PHI_STEPS; phi += 60) for (const p of Z.run(pk, phi).pucks) if (p.alive) { const rho = Math.hypot(p.x, p.y); assert.ok(rho <= Z.C.RP + 1e-9 && rho >= Z.C.RC - 1e-9, 'puk mimo plošinu: ' + rho); }
  // bez puku v dosahu ramene se nic nestane
  const far = Z.run([{ id: 9, r: 0.1, x: 0.3, y: -0.3 }], 0); assert.equal(far.fallen.length, 0);
}

// --- stav, nákup
let r = call('state');
assert.equal(r.status, 200); assert.equal(r.json.tries, 0); assert.equal(r.json.price, 500); assert.equal(r.json.jackpot, 10000);
{ const ps = r.json.pucks; assert.equal(ps.filter((p) => p.k === 'c').length, 24, '24 mincí'); assert.equal(ps.filter((p) => p.k === 'l').map((p) => p.ch).sort().join(''), 'BEIMOZ', 'všech 6 písmen');
  const vs = {}; for (const p of ps) if (p.k === 'c') vs[p.v] = (vs[p.v] || 0) + 1; assert.deepEqual(vs, { 50: 5, 100: 4, 200: 4, 500: 3, 750: 2, 1000: 2, 1500: 1, 2000: 1, 3000: 1, 5000: 1 });
  // čím vyšší hodnota, tím menší puk; písmena stejně malá
  const rs = {}; for (const p of ps) if (p.k === 'c') rs[p.v] = p.r; const vals = Object.keys(rs).map(Number).sort((a, b) => a - b); for (let i = 1; i < vals.length; i++) assert.ok(rs[vals[i]] < rs[vals[i - 1]], 'vyšší hodnota = menší puk');
  assert.ok(ps.filter((p) => p.k === 'l').every((p) => p.r === ZS.R_LETTER && p.r < rs[5000]), 'písmena jsou malá a stejná');
  for (let i = 0; i < ps.length; i++) { const p = ps[i]; assert.ok(Math.hypot(p.x, p.y) + p.r <= 1 + 1e-9 && Math.hypot(p.x, p.y) - p.r >= Z.C.RC - 1e-9, 'puk na plošině'); for (let j = i + 1; j < ps.length; j++) assert.ok(Math.hypot(p.x - ps[j].x, p.y - ps[j].y) >= p.r + ps[j].r, 'puky se nepřekrývají'); } }
assert.equal(call('shoot', { phi: 10 }).status, 409, 'bez pokusů se střílet nedá');
r = call('buy'); assert.equal(r.status, 200); assert.equal(r.json.balance, 4500); assert.equal(r.json.tries, 3);
assert.equal(call('buy').json.tries, 6); assert.equal(call('buy').json.tries, 9); assert.equal(acc.balance, 3500);
assert.equal(call('buy').status, 409, 'nejvýš 9 pokusů'); assert.equal(acc.balance, 3500);
acc.zsTries = 3; acc.balance = 5000;

// --- ochrany
assert.equal(call('shoot', { phi: -1 }).status, 400); assert.equal(call('shoot', { phi: 720 }).status, 400); assert.equal(call('shoot', { phi: 1.5 }).status, 400); assert.equal(call('shoot', {}).status, 400);
assert.equal(acc.zsTries, 3, 'neplatný výstřel pokus nespotřebuje');

// --- výstřel: server přepočítá a vyplatí
const before = zs.platformOf(acc).pucks.map((p) => ({ ...p }));
r = call('shoot', { phi: 200 });
assert.equal(r.status, 200); assert.equal(acc.zsTries, 2); assert.equal(r.json.tries, 2);
{
  const expected = Z.run(before.map((p) => ({ id: p.id, r: p.r, x: p.x, y: p.y })), 200);
  assert.deepEqual(r.json.result.fallen.map((f) => f.id).sort(), expected.fallen.map((f) => f.id).sort(), 'server vyplatil to, co dává simulace');
  const coins = expected.fallen.reduce((a, f) => a + (before.find((p) => p.id === f.id).v || 0), 0);
  assert.equal(r.json.result.coins, coins); assert.equal(r.json.result.payout, coins + 0); assert.equal(r.json.balance, 5000 + coins);
  assert.equal(r.json.pucks.filter((p) => p.k === 'c').length, 24, 'mince se doplní'); assert.ok(r.json.added.length >= r.json.result.fallen.filter((f) => f.k === 'c').length);
}
assert.equal(call('shoot', { phi: 300 }).status, 429, 'příliš rychlý druhý výstřel'); assert.equal(acc.zsTries, 2);
t += 2100; acc.balance = 5000;

// --- písmena se ukládají do účtu a jackpot: najdeme situaci, kdy puk s písmenem spolehlivě spadne
function findHit(ch) { // vezme skutečné rozložení, jednomu puku dá poloměr písmene a najde úhel, při kterém spadne
  for (let g = 0; g < 200; g++) {
    const base = zs.platformOf({ ...acc, key: 'find' + g }).pucks.map((p) => ({ ...p }));
    for (let i = 0; i < base.length; i++) {
      const pucks = base.map((p, j) => (j === i ? { id: p.id, k: 'l', ch, r: ZS.R_LETTER, x: p.x, y: p.y } : p)).filter((p, j) => j === i || p.k === 'c');
      for (let phi = 0; phi < Z.C.PHI_STEPS; phi += 8) {
        const s = Z.run(pucks.map((p) => ({ id: p.id, r: p.r, x: p.x, y: p.y })), phi);
        if (s.fallen.some((f) => f.id === base[i].id)) return { pucks, phi, id: base[i].id };
      }
    }
  }
  throw new Error('nenalezeno');
}
{
  const hit = findHit('Z');
  const plat = zs.platformOf(acc); plat.pucks = hit.pucks; plat.nextId = 999; plat.lastShot = 0;
  acc.zsLetters = 0; acc.zsTries = 2;
  r = call('shoot', { phi: hit.phi });
  assert.equal(r.status, 200); assert.ok(r.json.result.letters.includes('Z'), 'písmeno Z spadlo'); assert.equal(acc.zsLetters & 1, 1, 'písmeno Z uloženo v účtu'); assert.equal(r.json.lettersMask & 1, 1);
  assert.equal(r.json.result.jackpot, false);
  assert.ok(!r.json.pucks.some((p) => p.k === 'l' && p.ch === 'Z'), 'nasbírané písmeno už na plošině není');
  assert.equal(r.json.pucks.filter((p) => p.k === 'l').length, 5, 'zbylých pět písmen je na plošině');
  // poslední chybějící písmeno = jackpot (všech 6 napříč hrami)
  const hit2 = findHit('E'); t += 2100;
  const pl2 = zs.platformOf(acc); pl2.pucks = hit2.pucks; pl2.nextId = 999; pl2.lastShot = 0;
  const fallenCoins = Z.run(hit2.pucks.map((p) => ({ id: p.id, r: p.r, x: p.x, y: p.y })), hit2.phi).fallen.length; assert.ok(fallenCoins >= 1);
  acc.zsLetters = 0b011111; acc.zsTries = 1; const bal = acc.balance;
  r = call('shoot', { phi: hit2.phi });
  assert.equal(r.json.result.jackpot, true); assert.equal(r.json.result.payout, r.json.result.coins + 10000); assert.equal(acc.balance, bal + r.json.result.payout); assert.equal(acc.zsLetters, 0, 'po jackpotu se písmena vynulují');
  assert.equal(r.json.pucks.filter((p) => p.k === 'l').length, 6, 'písmena se vrátí na plošinu');
  assert.equal(acc.zsTries, 0);
}
// --- po posledním pokusu nelze střílet a nový nákup udělá novou plošinu
assert.equal(call('shoot', { phi: 5 }).status, 409);
{ const oldIds = zs.platformOf(acc).pucks.map((p) => p.id).join(); acc.balance = 5000; r = call('buy'); assert.equal(r.json.tries, 3); assert.notEqual(r.json.pucks.map((p) => p.id).join(), oldIds); }
// --- obnova kreditu pod minimem jen bez rozehraných pokusů
{ const poor = { key: 'p', balance: 10, lastSeen: 0, zsTries: 0, zsLetters: 0 }; const z2 = createZombie({ resolveAccount: () => ({ acc: poor }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/, rand, now: () => t });
  const q = (a, b) => z2.handle(a, { token: 'y'.repeat(24), ...b }); assert.equal(q('buy').status, 402); assert.equal(q('state').json.refilled, true); assert.equal(poor.balance, 200);
  poor.balance = 10; poor.zsTries = 2; assert.equal(q('state').json.refilled, false); assert.equal(poor.balance, 10); }
// --- návratnost: náhodný úhel (spodní odhad; chytrý hráč vybírá lépe)
{ let sum = 0, n = 0, letters = 0; const z3acc = { key: 'r', balance: 1e9, lastSeen: 0, zsTries: 0, zsLetters: 0 };
  const z3 = createZombie({ resolveAccount: () => ({ acc: z3acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/, rand, now: () => t }); const q = (a, b) => z3.handle(a, { token: 'z'.repeat(24), ...b });
  for (let g = 0; g < 120; g++) { q('buy'); for (let k = 0; k < 3; k++) { t += 2100; const x = q('shoot', { phi: Math.floor(rand() * 720) }); sum += x.json.result.coins; letters += x.json.result.letters.length; n++; } }
  console.log(`  náhodné načasování: průměr ${(sum / n).toFixed(0)} coinů na pokus (cena pokusu ${(500 / 3).toFixed(0)}), písmen na pokus ${(letters / n).toFixed(3)}`);
  assert.ok(sum / n > 60 && sum / n < 700, 'průměrná výhra mimo rozumný rozsah'); }

console.log('Zombie Snatcher: všechny testy prošly ✓');
