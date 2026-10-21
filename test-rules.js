'use strict';
// Jednotkové testy čisté herní logiky: node test-rules.js
const assert = require('assert');
const R = require('./rules');

const c = (r, s = 'S') => ({ r, s });
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const hand = (cards, bet, extra = {}) => ({ ...R.newHand(bet), cards, ...extra });

// ---- hodnota ruky ----
t('A+K = 21 blackjack', () => {
  assert.deepStrictEqual(R.handValue([c('A'), c('K')]), { total: 21, soft: true });
  assert.ok(R.isBlackjack([c('A'), c('K')]));
});
t('A+A = 12 (soft)', () => assert.deepStrictEqual(R.handValue([c('A'), c('A')]), { total: 12, soft: true }));
t('A+6 = 17 soft, A+6+10 = 17 hard', () => {
  assert.deepStrictEqual(R.handValue([c('A'), c('6')]), { total: 17, soft: true });
  assert.deepStrictEqual(R.handValue([c('A'), c('6'), c('10')]), { total: 17, soft: false });
});
t('tři karty na 21 není blackjack', () => assert.ok(!R.isBlackjack([c('7'), c('7'), c('7')])));
t('bust 10+9+5 = 24', () => assert.strictEqual(R.handValue([c('10'), c('9'), c('5')]).total, 24));
t('A+A+9 = 21', () => assert.strictEqual(R.handValue([c('A'), c('A'), c('9')]).total, 21));

// ---- split ----
t('split: K+Q ano, 8+8 ano, 9+8 ne, 3 karty ne', () => {
  assert.ok(R.canSplit([c('K'), c('Q')]));
  assert.ok(R.canSplit([c('8'), c('8', 'H')]));
  assert.ok(!R.canSplit([c('9'), c('8')]));
  assert.ok(!R.canSplit([c('2'), c('2'), c('2')]));
});

// ---- sázky ----
t('max sázka = 80 % zůstatku se zaokrouhlením dolů', () => {
  const cases = [
    [200, 160], [300, 240], [999, 790], [1000, 800], [1234, 950], [5000, 4000],
    [9999, 7950], [10000, 8000], [12345, 9800], [100000, 80000], [123456, 98000],
  ];
  for (const [bal, max] of cases) assert.strictEqual(R.maxBetFor(bal), max, `balance ${bal}`);
});
t('vlastnosti max sázky pro všechny zůstatky 200..200000', () => {
  for (let b = 200; b <= 200000; b += 7) {
    const m = R.maxBetFor(b);
    assert.ok(m >= R.CFG.MIN_BET, `min ${b}`);
    assert.ok(m <= Math.floor(b * 0.8), `<= 80 % ${b}`);
    assert.strictEqual(m % 10, 0, `násobek 10 ${b}`);
  }
});
t('validateBet: min 100, max 80 %, násobek 10, celé číslo', () => {
  assert.strictEqual(R.validateBet(100, 200), null);
  assert.strictEqual(R.validateBet(160, 200), null);
  assert.ok(R.validateBet(170, 200));      // nad 80 %
  assert.ok(R.validateBet(90, 5000));      // pod minimem
  assert.ok(R.validateBet(0, 5000));
  assert.ok(R.validateBet(-100, 5000));
  assert.ok(R.validateBet(105, 5000));     // není násobek 10
  assert.ok(R.validateBet(100.5, 5000));
  assert.ok(R.validateBet('500', 5000));
  assert.ok(R.validateBet(NaN, 5000));
  assert.strictEqual(R.validateBet(4000, 5000), null);
  assert.ok(R.validateBet(4010, 5000));
});

// ---- vyhodnocení ----
t('blackjack platí 3:2 (vklad 100 -> vrací 250)', () => {
  const r = R.evaluateHand(hand([c('A'), c('K')], 100, { blackjack: true }), 20, false);
  assert.deepStrictEqual(r, { result: 'blackjack', payout: 250 });
});
t('blackjack proti dealerovu blackjacku = push', () => {
  const r = R.evaluateHand(hand([c('A'), c('K')], 100, { blackjack: true }), 21, true);
  assert.deepStrictEqual(r, { result: 'push', payout: 100 });
});
t('21 ve třech kartách proti dealerovu blackjacku prohrává', () => {
  const r = R.evaluateHand(hand([c('7'), c('7'), c('7')], 100), 21, true);
  assert.deepStrictEqual(r, { result: 'lose', payout: 0 });
});
t('výhra 1:1, prohra, push, bust, dealer bust', () => {
  assert.deepStrictEqual(R.evaluateHand(hand([c('10'), c('9')], 100), 18, false), { result: 'win', payout: 200 });
  assert.deepStrictEqual(R.evaluateHand(hand([c('10'), c('7')], 100), 18, false), { result: 'lose', payout: 0 });
  assert.deepStrictEqual(R.evaluateHand(hand([c('10'), c('8')], 100), 18, false), { result: 'push', payout: 100 });
  assert.deepStrictEqual(R.evaluateHand(hand([c('10'), c('9'), c('5')], 100), 18, false), { result: 'bust', payout: 0 });
  assert.deepStrictEqual(R.evaluateHand(hand([c('10'), c('2')], 100), 24, false), { result: 'win', payout: 200 });
});
t('bust hráče prohrává i když dealer bustne', () => {
  assert.deepStrictEqual(R.evaluateHand(hand([c('10'), c('9'), c('5')], 100), 25, false), { result: 'bust', payout: 0 });
});
t('double: sázka 200 vyhraje 400', () => {
  assert.deepStrictEqual(R.evaluateHand(hand([c('5'), c('6'), c('10')], 200, { doubled: true }), 18, false), { result: 'win', payout: 400 });
});
t('split-21 (bez příznaku blackjack) platí jen 1:1', () => {
  const r = R.evaluateHand(hand([c('A'), c('K')], 100, { fromSplit: true }), 20, false);
  assert.deepStrictEqual(r, { result: 'win', payout: 200 });
});
t('pojištění: 2:1 při dealerově blackjacku, jinak propadá', () => {
  assert.strictEqual(R.insurancePayout(50, true), 150);
  assert.strictEqual(R.insurancePayout(50, false), 0);
});
t('výplaty jsou vždy celá čísla pro sázky v násobcích 10', () => {
  for (let bet = 100; bet <= 10000; bet += 10) {
    const r = R.evaluateHand(hand([c('A'), c('K')], bet, { blackjack: true }), 20, false);
    assert.ok(Number.isInteger(r.payout));
  }
});

// ---- bota ----
t('bota má 6x52 karet, 24 od každé hodnoty, 78 od každé barvy', () => {
  const s = new R.Shoe();
  assert.strictEqual(s.cards.length, 312);
  const byRank = {};
  const bySuit = {};
  for (const x of s.cards) {
    byRank[x.r] = (byRank[x.r] || 0) + 1;
    bySuit[x.s] = (bySuit[x.s] || 0) + 1;
  }
  assert.strictEqual(Object.keys(byRank).length, 13);
  for (const r of Object.keys(byRank)) assert.strictEqual(byRank[r], 24);
  for (const k of Object.keys(bySuit)) assert.strictEqual(bySuit[k], 78);
});
t('bota se míchá a po 75 % rozdaných karet žádá přemíchání', () => {
  const s = new R.Shoe();
  const first = s.cards.map((x) => x.r + x.s).join();
  s.shuffle();
  assert.notStrictEqual(first, s.cards.map((x) => x.r + x.s).join());
  assert.ok(!s.needsShuffle());
  for (let i = 0; i < 235; i++) s.draw();
  assert.ok(s.needsShuffle());
});
t('prázdná bota se sama přemíchá', () => {
  const s = new R.Shoe();
  for (let i = 0; i < 312; i++) s.draw();
  assert.ok(s.draw().r);
});

console.log(`\n${n} testů prošlo.`);
