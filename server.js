'use strict';
/**
 * Blackjack multiplayer server.
 *  - statické soubory z ./public
 *  - WebSocket na /ws (autoritativní server: klient jen posílá akce)
 *  - účty podle tajného tokenu v prohlížeči, zůstatky se ukládají do data/players.json
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const R = require('./rules');
const { CFG } = R;

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'players.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
// Volitelně omezení původu WebSocketu, např. ALLOWED_ORIGINS=https://mujweb.cz,https://www.mujweb.cz
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function send(ws, obj) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }
}

// ============================================================================
// Účty
// ============================================================================

const accounts = new Map(); // sha256(token) -> account
const NAME_RE = /^[\p{L}\p{N} _.\-]+$/u;

function cleanText(v, min, max) {
  if (typeof v !== 'string') return null;
  const s = v
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length < min || s.length > max || !NAME_RE.test(s)) return null;
  return s;
}
const cleanName = (v) => cleanText(v, 2, 16);
const cleanTableName = (v) => cleanText(v, 2, 24);

function randomName() {
  return 'Hráč' + (1000 + crypto.randomInt(9000));
}

function keyOf(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function makeAccount(key, d = {}) {
  return {
    key,
    name: cleanName(d.name) || randomName(),
    balance: Number.isFinite(d.balance) ? Math.max(CFG.FLOOR, Math.floor(d.balance)) : CFG.START_BALANCE,
    stats: Object.assign({ rounds: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, biggestWin: 0 }, d.stats || {}),
    createdAt: d.createdAt || Date.now(),
    lastSeen: d.lastSeen || Date.now(),
    ws: null,
    table: null,
    seat: null,
  };
}

function loadAccounts() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    for (const [key, a] of Object.entries(raw)) {
      if (!a || typeof a.balance !== 'number') continue;
      // úklid: účty, které nikdy nehrály a 30 dní se neozvaly
      if ((!a.stats || !a.stats.rounds) && (a.lastSeen || 0) < cutoff) continue;
      accounts.set(key, makeAccount(key, a));
    }
    console.log(`Načteno ${accounts.size} účtů.`);
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Načtení dat selhalo:', e.message);
  }
}

let saveTimer = null;
function markDirty() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, 2000);
}
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    const out = {};
    for (const [k, a] of accounts) {
      out[k] = { name: a.name, balance: a.balance, stats: a.stats, createdAt: a.createdAt, lastSeen: a.lastSeen };
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    console.error('Uložení dat selhalo:', e.message);
  }
}

function publicProfile(a) {
  return { name: a.name, balance: a.balance, stats: a.stats };
}

// ============================================================================
// Sedadlo a stůl
// ============================================================================

class Seat {
  constructor(sid, account) {
    this.sid = sid;
    this.account = account;
    this.lastBet = 0;
    this.afkBet = 0;  // po sobě jdoucí kola, kdy hráč nevsadil
    this.afkTurn = 0; // po sobě jdoucí tahy, na které nereagoval
    this.leaving = false;
    this.disconnectedAt = 0;
    this.resetRound();
  }

  resetRound() {
    this.bet = 0;
    this.hands = [];
    this.insurance = 0;
    this.insuranceDone = false;
    this.participant = false;
    this.pending = null;
    this.net = null;
    this.floored = false;
  }

  get connected() {
    const ws = this.account.ws;
    return !!ws && ws.readyState === 1;
  }

  /** Odpojený déle než pár vteřin – už na něj nečekáme. */
  get dropped() {
    return !this.connected && Date.now() - this.disconnectedAt > CFG.DROP_GRACE;
  }
}

const tables = new Map();
let tableSeq = 0;

let lobbyTimer = null;
function lobbyDirty() {
  if (lobbyTimer) return;
  lobbyTimer = setTimeout(() => {
    lobbyTimer = null;
    const msg = { t: 'lobby', tables: lobbyInfo() };
    for (const a of accounts.values()) if (a.ws && !a.table) send(a.ws, msg);
  }, 400);
}

function lobbyInfo() {
  return [...tables.values()]
    .map((tb) => ({
      id: tb.id, name: tb.name, players: tb.seats.length, max: CFG.MAX_SEATS,
      phase: tb.phase, permanent: tb.permanent,
    }))
    .sort((a, b) => Number(b.permanent) - Number(a.permanent) || a.id.localeCompare(b.id, 'en', { numeric: true }));
}

class Table {
  constructor(id, name, permanent) {
    this.id = id;
    this.name = name;
    this.permanent = permanent;
    this.seats = [];
    this.sidSeq = 0;
    this.phase = 'betting'; // betting | dealing | insurance | playing | dealer | settle
    this.round = 0;
    this.note = '';
    this.shoe = new R.Shoe();
    this.dealer = { cards: [], hidden: false };
    this.activeSeat = null;
    this.activeHand = 0;
    this.accepting = false; // přijímáme teď tah hráče?
    this.deadline = 0;
    this.deadlineTotal = 0;
    this.stakesHeld = false; // jsou někde strženy sázky, které ještě nebyly vyplaceny?
    this.everSeated = false; // seděl u stolu už někdo? (prázdný nový stůl se nesmí hned zrušit)
    this.destroyed = false;
    this._waiters = new Set();
    this.run();
  }

  // ---- pomocné -------------------------------------------------------------

  wait(ms, pred) {
    return new Promise((resolve) => {
      const start = Date.now();
      let iv = null;
      const check = () => {
        if (this.destroyed || pred() || Date.now() - start >= ms) {
          clearInterval(iv);
          this._waiters.delete(check);
          resolve();
          return true;
        }
        return false;
      };
      iv = setInterval(check, 100);
      this._waiters.add(check);
      check();
    });
  }

  poke() {
    for (const c of [...this._waiters]) c();
  }

  startTimer(ms) {
    this.deadline = Date.now() + ms;
    this.deadlineTotal = ms;
  }

  stopTimer() {
    this.deadline = 0;
    this.deadlineTotal = 0;
  }

  draw() {
    return this.shoe.draw();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    tables.delete(this.id);
    this.poke();
    lobbyDirty();
  }

  // ---- sedadla -------------------------------------------------------------

  addSeat(account) {
    const seat = new Seat(++this.sidSeq, account);
    this.everSeated = true;
    this.seats.push(seat);
    account.table = this;
    account.seat = seat;
    this.broadcast();
    this.poke();
    lobbyDirty();
    return seat;
  }

  detach(seat) {
    const i = this.seats.indexOf(seat);
    if (i >= 0) this.seats.splice(i, 1);
    if (seat.account.seat === seat) {
      seat.account.seat = null;
      seat.account.table = null;
    }
  }

  /** Hráč chce odejít. Pokud je uprostřed kola, odejde až po jeho dohrání. */
  leave(seat) {
    if (seat.participant && this.phase !== 'betting') {
      seat.leaving = true;
      this.broadcast();
      this.poke();
      return 'later';
    }
    this.detach(seat);
    this.broadcast();
    this.poke();
    lobbyDirty();
    if (!this.permanent && this.seats.length === 0) this.destroy();
    return 'now';
  }

  cleanupSeats() {
    for (const s of [...this.seats]) {
      let reason = null;
      if (s.leaving) reason = 'leave';
      else if (s.afkBet >= CFG.AFK_LIMIT || s.afkTurn >= CFG.AFK_LIMIT) reason = 'afk';
      else if (!s.connected) reason = 'gone';
      if (!reason) continue;
      const ws = s.account.ws;
      this.detach(s);
      if (reason !== 'gone') send(ws, { t: 'left', reason });
    }
    lobbyDirty();
  }

  // ---- přijetí akcí od klientů --------------------------------------------

  placeBet(seat, amount) {
    if (this.phase !== 'betting' || seat.leaving) return 'Teď nelze vsadit.';
    if (amount === 0) {
      seat.bet = 0;
    } else {
      const err = R.validateBet(amount, seat.account.balance);
      if (err) return err;
      seat.bet = amount;
      seat.lastBet = amount;
      seat.afkBet = 0;
    }
    this.broadcast();
    this.poke();
    return null;
  }

  handleAction(seat, a) {
    if (seat.leaving) return;
    if (this.phase === 'insurance') {
      if (!seat.participant || seat.insuranceDone) return;
      if (a === 'insure') {
        const cost = seat.bet / 2;
        if (seat.account.balance < cost) return;
        seat.account.balance -= cost;
        seat.insurance = cost;
      } else if (a !== 'decline') {
        return;
      }
      seat.insuranceDone = true;
      this.broadcast();
      this.poke();
      return;
    }
    if (this.phase === 'playing' && this.accepting && this.activeSeat === seat
        && ['hit', 'stand', 'double', 'split'].includes(a)) {
      seat.pending = a;
      this.poke();
    }
  }

  actionsFor(seat, hi) {
    const h = seat.hands[hi];
    if (!h || h.done) return [];
    const acts = ['hit', 'stand'];
    if (h.cards.length === 2 && seat.account.balance >= h.bet) {
      acts.push('double');
      if (seat.hands.length < CFG.MAX_HANDS && R.canSplit(h.cards)) acts.push('split');
    }
    return acts;
  }

  // ---- stav pro klienty ----------------------------------------------------

  view(seat) {
    const now = Date.now();
    const hiding = this.dealer.hidden;
    const dealerCards = this.dealer.cards.map((c, i) => (hiding && i === 1 ? null : c));
    const visible = this.dealer.cards.filter((c, i) => !(hiding && i === 1));
    const dv = visible.length ? R.handValue(visible) : { total: 0, soft: false };
    const bal = seat.account.balance;

    return {
      t: 'table',
      id: this.id,
      name: this.name,
      phase: this.phase,
      round: this.round,
      note: this.note,
      timeLeft: this.deadline ? Math.max(0, this.deadline - now) : null,
      timeTotal: this.deadlineTotal,
      dealer: { cards: dealerCards, total: dv.total, soft: dv.soft },
      seats: this.seats.map((s) => ({
        sid: s.sid,
        name: s.account.name,
        balance: s.account.balance,
        bet: s.bet,
        you: s === seat,
        connected: s.connected,
        leaving: s.leaving,
        participant: s.participant,
        active: this.activeSeat === s ? this.activeHand : -1,
        insurance: s.insurance,
        net: s.net,
        floored: s.floored,
        hands: s.hands.map((h) => {
          const v = R.handValue(h.cards);
          return {
            cards: h.cards, total: v.total, soft: v.soft, bet: h.bet, done: h.done,
            blackjack: h.blackjack, doubled: h.doubled, result: h.result, payout: h.payout,
          };
        }),
      })),
      you: {
        sid: seat.sid,
        balance: bal,
        bet: seat.bet,
        lastBet: seat.lastBet,
        minBet: CFG.MIN_BET,
        maxBet: R.maxBetFor(bal),
        canBet: this.phase === 'betting' && !seat.leaving,
        actions: this.phase === 'playing' && this.accepting && this.activeSeat === seat
          ? this.actionsFor(seat, this.activeHand) : [],
        canInsure: this.phase === 'insurance' && seat.participant && !seat.insuranceDone
          && !seat.leaving && bal >= seat.bet / 2,
        insuranceCost: seat.bet / 2,
        leaving: seat.leaving,
      },
    };
  }

  broadcast() {
    for (const s of this.seats) {
      if (s.connected) send(s.account.ws, this.view(s));
    }
  }

  // ---- hlavní smyčka -------------------------------------------------------

  async run() {
    while (!this.destroyed) {
      try {
        this.cleanupSeats();
        if (this.seats.length === 0) {
          if (!this.permanent && this.everSeated) { this.destroy(); return; }
          this.phase = 'betting';
          this.dealer = { cards: [], hidden: false };
          this.note = '';
          await this.wait(Infinity, () => this.seats.length > 0);
          continue;
        }
        await this.playRound();
      } catch (e) {
        console.error(`[stůl ${this.id}] chyba v kole:`, e);
        this.recoverFromError();
        await sleep(1000);
      }
    }
  }

  /** Vrátí sázky, pokud kolo spadlo uprostřed. */
  recoverFromError() {
    if (this.stakesHeld) {
      for (const s of this.seats) {
        if (!s.participant) continue;
        for (const h of s.hands) s.account.balance += h.bet;
        s.account.balance += s.insurance;
      }
      this.stakesHeld = false;
      markDirty();
    }
    for (const s of this.seats) s.resetRound();
    this.dealer = { cards: [], hidden: false };
    this.phase = 'betting';
    this.activeSeat = null;
    this.accepting = false;
    this.stopTimer();
    this.note = 'Kolo bylo zrušeno kvůli chybě, sázky se vrátily.';
    this.broadcast();
  }

  async playRound() {
    // ---------- 1) sázení ----------
    this.phase = 'betting';
    this.round++;
    this.note = '';
    this.dealer = { cards: [], hidden: false };
    this.activeSeat = null;
    this.accepting = false;
    for (const s of this.seats) s.resetRound();
    if (this.shoe.needsShuffle()) {
      this.shoe.shuffle();
      this.note = 'Karty byly zamíchány.';
    }
    this.stopTimer();
    this.broadcast();

    // Odpočet začíná až první sázkou.
    await this.wait(Infinity, () => this.seats.length === 0 || this.seats.some((s) => s.bet > 0));
    if (this.destroyed || this.seats.length === 0) return;
    this.startTimer(CFG.BET_TIME);
    this.broadcast();
    await this.wait(CFG.BET_TIME, () => this.seats.length === 0 || this.seats.every((s) => s.bet > 0 || s.dropped));
    this.stopTimer();

    let parts = this.seats.filter((s) => s.bet > 0 && !s.leaving);
    if (parts.length === 0) { this.broadcast(); return; } // všichni sázku zrušili

    for (const s of this.seats) {
      if (!(s.bet > 0)) s.afkBet++;
    }

    // Strhnout sázky.
    this.stakesHeld = true;
    for (const s of parts) {
      const acc = s.account;
      if (R.validateBet(s.bet, acc.balance) || s.bet > acc.balance) { s.bet = 0; continue; }
      acc.balance -= s.bet;
      s.participant = true;
      s.hands = [R.newHand(s.bet)];
    }
    parts = parts.filter((s) => s.participant);
    markDirty();
    if (parts.length === 0) { this.stakesHeld = false; return; }

    // ---------- 2) rozdávání ----------
    this.phase = 'dealing';
    this.broadcast();
    await sleep(CFG.STEP_DELAY / 2);
    for (let round = 0; round < 2; round++) {
      for (const s of parts) {
        s.hands[0].cards.push(this.draw());
        this.broadcast();
        await sleep(CFG.CARD_DELAY);
      }
      this.dealer.cards.push(this.draw());
      if (round === 1) this.dealer.hidden = true; // druhá karta dealera je skrytá
      this.broadcast();
      await sleep(CFG.CARD_DELAY);
    }
    for (const s of parts) {
      const h = s.hands[0];
      if (R.isBlackjack(h.cards)) { h.blackjack = true; h.done = true; }
    }
    const upcard = this.dealer.cards[0];

    // ---------- 3) pojištění ----------
    if (upcard.r === 'A') {
      this.phase = 'insurance';
      for (const s of parts) s.insuranceDone = s.account.balance < s.bet / 2; // nemá na pojištění
      this.startTimer(CFG.INSURANCE_TIME);
      this.broadcast();
      await this.wait(CFG.INSURANCE_TIME, () => parts.every((s) => s.insuranceDone || s.leaving || s.dropped));
      this.stopTimer();
      for (const s of parts) s.insuranceDone = true;
      this.broadcast();
    }

    // ---------- 4) dealer koukne na skrytou kartu ----------
    let dealerBJ = false;
    if (upcard.r === 'A' || R.cardVal(upcard.r) === 10) {
      this.note = 'Dealer kontroluje skrytou kartu…';
      this.broadcast();
      await sleep(CFG.STEP_DELAY);
      if (R.isBlackjack(this.dealer.cards)) {
        dealerBJ = true;
        this.dealer.hidden = false;
        this.note = 'Dealer má blackjack!';
        this.broadcast();
        await sleep(CFG.STEP_DELAY);
      } else {
        this.note = '';
      }
    }

    // ---------- 5) tahy hráčů ----------
    if (!dealerBJ) {
      this.phase = 'playing';
      for (const s of parts) {
        for (let hi = 0; hi < s.hands.length; hi++) {
          const h = s.hands[hi];
          while (!h.done) {
            // Ruka po splitu má jen jednu kartu – dobereme druhou.
            if (h.cards.length === 1) {
              this.activeSeat = s; this.activeHand = hi;
              h.cards.push(this.draw());
              this.broadcast();
              await sleep(CFG.CARD_DELAY);
              if (h.splitAces || R.handValue(h.cards).total >= 21) { h.done = true; break; }
            }

            this.activeSeat = s;
            this.activeHand = hi;
            s.pending = null;
            this.accepting = true;
            this.startTimer(CFG.TURN_TIME);
            this.broadcast();
            await this.wait(CFG.TURN_TIME, () => !!s.pending || s.leaving || s.dropped);
            this.accepting = false;
            this.stopTimer();

            let act = s.pending;
            s.pending = null;
            if (!act) {
              act = 'stand'; // vypršel čas / odešel / odpojen
              if (!s.leaving && !s.dropped) s.afkTurn++;
            } else {
              s.afkTurn = 0;
              if (!this.actionsFor(s, hi).includes(act)) continue; // neplatný tah, zkusit znovu
            }

            if (act === 'stand') {
              h.done = true;
            } else if (act === 'hit') {
              h.cards.push(this.draw());
              this.broadcast();
              await sleep(CFG.CARD_DELAY);
              if (R.handValue(h.cards).total >= 21) h.done = true;
            } else if (act === 'double') {
              s.account.balance -= h.bet;
              h.bet *= 2;
              h.doubled = true;
              h.cards.push(this.draw());
              h.done = true;
              this.broadcast();
              await sleep(CFG.CARD_DELAY);
            } else if (act === 'split') {
              s.account.balance -= h.bet;
              const second = h.cards.pop();
              const nh = R.newHand(h.bet);
              nh.cards = [second];
              nh.fromSplit = h.fromSplit = true;
              if (second.r === 'A') nh.splitAces = h.splitAces = true; // k esům jen jedna karta
              s.hands.splice(hi + 1, 0, nh);
              this.broadcast();
              await sleep(CFG.CARD_DELAY);
            }
          }
        }
      }
      this.activeSeat = null;
      this.accepting = false;

      // ---------- 6) tah dealera ----------
      this.phase = 'dealer';
      this.dealer.hidden = false;
      this.broadcast();
      await sleep(CFG.STEP_DELAY);
      const needDraw = parts.some((s) => s.hands.some((h) => !h.blackjack && R.handValue(h.cards).total <= 21));
      if (needDraw) {
        // Dealer dobírá do 17 a na měkké 17 stojí.
        while (R.handValue(this.dealer.cards).total < 17) {
          this.dealer.cards.push(this.draw());
          this.broadcast();
          await sleep(CFG.CARD_DELAY + 150);
        }
      }
    }

    // ---------- 7) vyúčtování ----------
    this.settle(parts, dealerBJ);
    this.phase = 'settle';
    this.broadcast();
    await sleep(CFG.SETTLE_TIME);
  }

  settle(parts, dealerBJ) {
    const dealerTotal = R.handValue(this.dealer.cards).total;
    for (const s of parts) {
      const acc = s.account;
      let staked = 0;
      let paid = 0;
      let bjCount = 0;
      for (const h of s.hands) {
        const { result, payout } = R.evaluateHand(h, dealerTotal, dealerBJ);
        h.result = result;
        h.payout = payout;
        staked += h.bet;
        paid += payout;
        if (result === 'blackjack') bjCount++;
      }
      const insPaid = R.insurancePayout(s.insurance, dealerBJ);
      acc.balance += paid + insPaid;
      s.net = paid + insPaid - staked - s.insurance;
      if (acc.balance < CFG.FLOOR) {
        acc.balance = CFG.FLOOR; // zůstatek nikdy nespadne pod minimum
        s.floored = true;
      }

      const st = acc.stats;
      st.rounds++;
      if (s.net > 0) st.wins++;
      else if (s.net < 0) st.losses++;
      else st.pushes++;
      st.blackjacks += bjCount;
      if (s.net > st.biggestWin) st.biggestWin = s.net;
    }
    this.stakesHeld = false;
    markDirty();
    for (const s of parts) {
      if (s.connected) send(s.account.ws, { t: 'profile', ...publicProfile(s.account) });
    }
    if (parts.some((s) => s.floored)) this.note = 'Zůstatek byl doplněn na minimum ' + CFG.FLOOR + '.';
  }
}

function createTable(name, permanent = false) {
  const id = 't' + ++tableSeq;
  const tb = new Table(id, name, permanent);
  tables.set(id, tb);
  lobbyDirty();
  return tb;
}

// ============================================================================
// HTTP (statické soubory)
// ============================================================================

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; base-uri 'none'; form-action 'none'",
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  let p;
  try {
    p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (p === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(p));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Nenalezeno');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ...SEC_HEADERS,
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

// ============================================================================
// WebSocket
// ============================================================================

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 2048,
  verifyClient: (info) => !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(info.origin),
});

function allow(ws) {
  const now = Date.now();
  ws.bucket = Math.min(20, ws.bucket + ((now - ws.bucketAt) / 1000) * 10);
  ws.bucketAt = now;
  if (ws.bucket < 1) return false;
  ws.bucket -= 1;
  return true;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

function err(ws, msg) {
  send(ws, { t: 'error', msg });
}

function joinTable(acc, tb) {
  if (acc.table) return 'Už sedíš u stolu.';
  if (tb.seats.length >= CFG.MAX_SEATS) return 'Stůl je plný.';
  tb.addSeat(acc);
  return null;
}

function handleMessage(ws, msg) {
  if (!msg || typeof msg.t !== 'string') return;

  if (msg.t === 'hello') {
    if (typeof msg.token !== 'string' || !TOKEN_RE.test(msg.token)) {
      err(ws, 'Neplatný token.');
      return ws.close();
    }
    const key = keyOf(msg.token);
    let acc = accounts.get(key);
    let isNew = false;
    if (!acc) {
      acc = makeAccount(key, { name: cleanName(msg.name) });
      accounts.set(key, acc);
      isNew = true;
    }
    if (acc.ws && acc.ws !== ws) {
      const old = acc.ws;
      old.account = null;
      send(old, { t: 'kicked', reason: 'Přihlásil ses v jiném okně.' });
      old.close();
    }
    acc.ws = ws;
    ws.account = acc;
    acc.lastSeen = Date.now();
    if (acc.seat) acc.seat.disconnectedAt = 0;
    markDirty();
    send(ws, {
      t: 'welcome', isNew, inTable: !!acc.table, ...publicProfile(acc),
      rules: { minBet: CFG.MIN_BET, floor: CFG.FLOOR, start: CFG.START_BALANCE, maxSeats: CFG.MAX_SEATS },
    });
    if (acc.table) {
      acc.table.broadcast();
      acc.table.poke();
    } else {
      send(ws, { t: 'lobby', tables: lobbyInfo() });
    }
    return;
  }

  const acc = ws.account;
  if (!acc) return;

  switch (msg.t) {
    case 'setName': {
      const name = cleanName(msg.name);
      if (!name) return err(ws, 'Přezdívka musí mít 2–16 znaků (písmena, čísla, mezera, _ . -).');
      acc.name = name;
      markDirty();
      send(ws, { t: 'profile', ...publicProfile(acc), saved: true });
      if (acc.table) acc.table.broadcast();
      break;
    }
    case 'lobby':
      send(ws, { t: 'lobby', tables: lobbyInfo() });
      break;
    case 'leaderboard': {
      const rows = [...accounts.values()]
        .filter((a) => a.stats.rounds > 0)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10)
        .map((a) => ({ name: a.name, balance: a.balance, rounds: a.stats.rounds }));
      send(ws, { t: 'leaderboard', rows });
      break;
    }
    case 'create': {
      if (acc.table) return err(ws, 'Už sedíš u stolu.');
      const name = cleanTableName(msg.name);
      if (!name) return err(ws, 'Název stolu musí mít 2–24 znaků.');
      if (tables.size >= CFG.MAX_TABLES) return err(ws, 'Je otevřeno příliš mnoho stolů.');
      const tb = createTable(name, false);
      const e = joinTable(acc, tb);
      if (e) { err(ws, e); tb.destroy(); }
      break;
    }
    case 'join': {
      const tb = tables.get(String(msg.id));
      if (!tb) return err(ws, 'Stůl neexistuje.');
      const e = joinTable(acc, tb);
      if (e) err(ws, e);
      break;
    }
    case 'quick': {
      if (acc.table) return err(ws, 'Už sedíš u stolu.');
      const open = [...tables.values()].filter((tb) => tb.seats.length < CFG.MAX_SEATS);
      open.sort((a, b) => b.seats.length - a.seats.length);
      let tb = open[0];
      if (!tb) {
        if (tables.size >= CFG.MAX_TABLES) return err(ws, 'Všechny stoly jsou plné.');
        tb = createTable('Stůl ' + (tableSeq + 1), false);
      }
      const e = joinTable(acc, tb);
      if (e) err(ws, e);
      break;
    }
    case 'leave': {
      const tb = acc.table;
      const seat = acc.seat;
      if (!tb || !seat) return send(ws, { t: 'left', reason: 'leave' });
      const how = tb.leave(seat);
      if (how === 'now') send(ws, { t: 'left', reason: 'leave' });
      else send(ws, { t: 'toast', msg: 'Stůl opustíš po dohrání tohoto kola.' });
      break;
    }
    case 'bet': {
      if (!acc.table || !acc.seat) return;
      const e = acc.table.placeBet(acc.seat, msg.amount);
      if (e) err(ws, e);
      break;
    }
    case 'act': {
      if (!acc.table || !acc.seat || typeof msg.a !== 'string') return;
      acc.table.handleAction(acc.seat, msg.a);
      break;
    }
    default:
      break;
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.account = null;
  ws.bucket = 20;
  ws.bucketAt = Date.now();

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw, isBinary) => {
    if (isBinary || !allow(ws)) return;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    try { handleMessage(ws, msg); } catch (e) { console.error('Chyba při zpracování zprávy:', e); }
  });
  ws.on('close', () => {
    const acc = ws.account;
    if (!acc || acc.ws !== ws) return;
    acc.ws = null;
    acc.lastSeen = Date.now();
    markDirty();
    if (acc.seat) {
      acc.seat.disconnectedAt = Date.now();
      acc.table.broadcast();
      acc.table.poke();
    }
  });
  ws.on('error', () => {});
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* ignore */ }
  }
}, 30000);
heartbeat.unref();

// ============================================================================
// Start / vypnutí
// ============================================================================

function shutdown() {
  console.log('Vypínám server…');
  for (const tb of tables.values()) if (tb.stakesHeld) tb.recoverFromError(); // vrátit rozehrané sázky
  saveNow();
  process.exit(0);
}

if (require.main === module) {
  loadAccounts();
  ['Stůl 1', 'Stůl 2', 'Stůl 3'].forEach((n) => createTable(n, true));
  tableSeq = Math.max(tableSeq, 3);
  server.listen(PORT, HOST, () => console.log(`Blackjack běží na http://${HOST}:${PORT}`));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
