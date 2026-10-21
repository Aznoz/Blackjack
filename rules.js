'use strict';
/**
 * Čistá herní logika blackjacku (bez sítě a časovačů) – dá se snadno testovat.
 */
const crypto = require('crypto');

// Pro testy lze všechny časy zkrátit: TIME_SCALE=0.05 node server.js
const SCALE = Number(process.env.TIME_SCALE) > 0 ? Number(process.env.TIME_SCALE) : 1;
const t = (ms) => Math.max(5, Math.round(ms * SCALE));

const CFG = Object.freeze({
  START_BALANCE: 5000, // počáteční chipy
  FLOOR: 200,          // pod tuto hodnotu zůstatek nikdy nespadne
  MIN_BET: 100,
  MAX_BET_PCT: 0.8,    // max sázka = 80 % aktuálního zůstatku (zaokrouhleno dolů)
  BET_UNIT: 10,        // sázka musí být násobek 10 (kvůli výplatě 3:2 bez desetinných míst)
  DECKS: 6,
  RESHUFFLE_AT: 0.25,  // míchá se, když v botě zbývá < 25 % karet
  MAX_SEATS: 5,
  MAX_HANDS: 4,        // max. počet rukou po splitech
  MAX_TABLES: 40,
  AFK_LIMIT: 3,        // tolik nečinných kol za sebou = vyhození od stolu
  BET_TIME: t(15000),
  INSURANCE_TIME: t(10000),
  TURN_TIME: t(20000),
  SETTLE_TIME: t(6500),
  CARD_DELAY: t(650),
  STEP_DELAY: t(900),
  DROP_GRACE: t(4000), // jak dlouho počkáme na znovupřipojení hráče, který je na tahu
  EMPTY_TABLE_TTL: t(60000), // vlastní stůl, u kterého nikdo není, se po této době zruší
});

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];

function cardVal(rank) {
  if (rank === 'A') return 11;
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

/** Hodnota ruky; soft = počítá se nějaké eso jako 11. */
function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardVal(c.r);
    if (c.r === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

/** Split je možný u dvou karet stejné hodnoty (10, J, Q, K se berou jako stejné). */
function canSplit(cards) {
  return cards.length === 2 && cardVal(cards[0].r) === cardVal(cards[1].r);
}

// ---- sázky -----------------------------------------------------------------

function roundStep(balance) {
  if (balance < 1000) return 10;
  if (balance < 10000) return 50;
  if (balance < 100000) return 100;
  return 1000;
}

/** Max sázka = 80 % zůstatku, zaokrouhleno dolů na rozumný krok (nikdy méně než MIN_BET). */
function maxBetFor(balance) {
  const step = roundStep(balance);
  const raw = Math.floor(balance * CFG.MAX_BET_PCT);
  const rounded = Math.floor(raw / step) * step;
  return Math.max(CFG.MIN_BET, rounded);
}

/** Vrací text chyby, nebo null když je sázka v pořádku. */
function validateBet(amount, balance) {
  if (!Number.isInteger(amount)) return 'Neplatná sázka.';
  if (amount % CFG.BET_UNIT !== 0) return `Sázka musí být násobek ${CFG.BET_UNIT}.`;
  if (amount < CFG.MIN_BET) return `Minimální sázka je ${CFG.MIN_BET}.`;
  const max = maxBetFor(balance);
  if (amount > max) return `Maximální sázka je ${max} (80 % zůstatku).`;
  return null;
}

// ---- vyhodnocení -----------------------------------------------------------

function newHand(bet) {
  return {
    cards: [], bet, done: false, blackjack: false,
    doubled: false, fromSplit: false, splitAces: false,
    result: null, payout: 0,
  };
}

/**
 * Vyhodnotí jednu ruku proti dealerovi.
 * payout = kolik se hráči vrací celkem (vklad + výhra); 0 = prohra.
 */
function evaluateHand(hand, dealerTotal, dealerBJ) {
  const total = handValue(hand.cards).total;
  let result;
  if (hand.blackjack) result = dealerBJ ? 'push' : 'blackjack';
  else if (dealerBJ) result = 'lose';
  else if (total > 21) result = 'bust';
  else if (dealerTotal > 21) result = 'win';
  else if (total > dealerTotal) result = 'win';
  else if (total < dealerTotal) result = 'lose';
  else result = 'push';

  let payout = 0;
  if (result === 'blackjack') payout = (hand.bet * 5) / 2; // vklad + 3:2
  else if (result === 'win') payout = hand.bet * 2;
  else if (result === 'push') payout = hand.bet;
  return { result, payout };
}

/** Pojištění platí 2:1 (vrací se vklad + 2x vklad), když má dealer blackjack. */
function insurancePayout(insurance, dealerBJ) {
  return dealerBJ ? insurance * 3 : 0;
}

// ---- bota (shoe) -----------------------------------------------------------

class Shoe {
  constructor() {
    this.cards = [];
    this.total = 0;
    this.shuffle();
  }

  shuffle() {
    const cards = [];
    for (let d = 0; d < CFG.DECKS; d++) {
      for (const s of SUITS) for (const r of RANKS) cards.push({ r, s });
    }
    // Fisher–Yates s kryptograficky silným RNG
    for (let i = cards.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    this.cards = cards;
    this.total = cards.length;
  }

  needsShuffle() {
    return this.cards.length < this.total * CFG.RESHUFFLE_AT;
  }

  draw() {
    if (this.cards.length === 0) this.shuffle();
    return this.cards.pop();
  }
}

module.exports = {
  CFG, RANKS, SUITS, cardVal, handValue, isBlackjack, canSplit,
  roundStep, maxBetFor, validateBet, newHand, evaluateHand, insurancePayout, Shoe,
};
