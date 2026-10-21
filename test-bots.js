'use strict';
/**
 * Integrační test: spustí server a nechá u jednoho stolu hrát několik botů.
 *   node test-bots.js            (potřebuje nainstalované "ws": npm install)
 * Kontroluje pravidla, účetnictví zůstatků, skrytou kartu dealera, limity sázek,
 * špatné vstupy, odpojení, odchod uprostřed kola, AFK, plný stůl a uložení dat.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');
const R = require('./rules');

const PORT = 3460 + Math.floor(Math.random() * 300);
const URL = `ws://127.0.0.1:${PORT}/ws`;
const DATA_DIR = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'bj-test-'));
const TARGET_ROUNDS = Number(process.env.ROUNDS) || 45;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];
const problem = (msg) => { if (!problems.includes(msg)) { problems.push(msg); console.log('  !! ' + msg); } };
const cov = { insurancePhase: 0, insured: 0, split: 0, double: 0, blackjack: 0, dealerBJ: 0, bust: 0, floor: 0, push: 0, win: 0, lose: 0, dealerBust: 0 };
const tokens = [];
let serverErr = '';

// ---------------------------------------------------------------------------
function startServer() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', TIME_SCALE: '0.04', DATA_DIR },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (out.includes('běží')) resolve(p); });
    p.stderr.on('data', (d) => { serverErr += d; process.stderr.write('[server stderr] ' + d); });
    p.on('error', reject);
    setTimeout(() => reject(new Error('server nenastartoval')), 8000);
  });
}

const ALLOWED = new Set(['betting>betting', 'betting>dealing', 'dealing>dealing', 'dealing>insurance', 'dealing>playing',
  'dealing>settle', 'insurance>insurance', 'insurance>playing', 'insurance>settle', 'playing>playing',
  'playing>dealer', 'dealer>dealer', 'dealer>settle', 'settle>settle', 'settle>betting']);

class Bot {
  constructor(label, strategy = 'normal') {
    this.label = label;
    this.strategy = strategy; // normal | maniac | sleeper | idler
    this.token = crypto.randomBytes(24).toString('base64url');
    tokens.push(this.token);
    this.state = null;
    this.welcome = null;
    this.errors = [];
    this.toasts = [];
    this.lefts = [];
    this.kicked = false;
    this.rounds = 0;
    this.stop = false;
    this.lastPhase = null;
    this.betRound = -1;
    this.insRound = -1;
    this.actKey = '';
    this.betBal = 0;
    this.lastProfile = null;
  }

  connect() {
    return new Promise((resolve) => {
      this.ws = new WebSocket(URL);
      this.ws.on('open', () => this.send({ t: 'hello', token: this.token }));
      this.ws.on('message', (d) => {
        const m = JSON.parse(d.toString());
        this.onMsg(m);
        if (m.t === 'welcome') resolve(m);
      });
      this.ws.on('error', () => {});
    });
  }

  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }

  async until(pred, ms = 20000, what = 'podmínka') {
    const t0 = Date.now();
    while (!pred()) {
      if (Date.now() - t0 > ms) throw new Error(`${this.label}: timeout čekání na ${what}`);
      await sleep(15);
    }
  }

  onMsg(m) {
    for (const tk of tokens) if (JSON.stringify(m).includes(tk)) problem('únik tokenu ve zprávě ' + m.t);
    switch (m.t) {
      case 'welcome': this.welcome = m; this.lastProfile = m; break;
      case 'profile': this.lastProfile = m; break;
      case 'error': this.errors.push(m.msg); break;
      case 'toast': this.toasts.push(m.msg); break;
      case 'left': this.lefts.push(m.reason); this.state = null; this.lastPhase = null; break;
      case 'kicked': this.kicked = true; break;
      case 'table': this.onTable(m); break;
      default: break;
    }
  }

  onTable(st) {
    this.state = st;
    this.check(st);
    this.decide(st);
  }

  // ----- kontroly invariantů -----------------------------------------------
  check(st) {
    const y = st.you;
    const me = st.seats.find((s) => s.you);
    if (!me) return problem(`${this.label}: ve stavu chybí vlastní sedadlo`);
    if (st.seats.length > R.CFG.MAX_SEATS) problem('víc než 5 sedadel');
    if (!Number.isInteger(y.balance) || y.balance < 0) problem(`${this.label}: neplatný zůstatek ${y.balance}`);
    if (y.minBet !== 100 || y.maxBet !== R.maxBetFor(y.balance)) problem(`${this.label}: špatné limity sázky`);
    // sázka se strhává až při rozdání, takže ji lze proti zůstatku ověřit jen ve fázi sázení
    if (st.phase === 'betting' && y.bet > 0 && R.validateBet(y.bet, y.balance)) problem(`${this.label}: server přijal neplatnou sázku ${y.bet}`);
    if (st.timeLeft != null && st.timeLeft > st.timeTotal + 5) problem('timeLeft > timeTotal');

    if (st.phase === 'betting') {
      this.betBal = y.balance;
      if (y.balance < R.CFG.FLOOR) problem(`${this.label}: zůstatek ${y.balance} je pod minimem`);
    }

    // přechody fází
    if (this.lastPhase) {
      const key = this.lastPhase + '>' + st.phase;
      if (!ALLOWED.has(key)) problem('neplatný přechod fází ' + key);
    }
    const phaseChanged = this.lastPhase !== st.phase;
    this.lastPhase = st.phase;

    // skrytá karta dealera
    const dc = st.dealer.cards;
    if (['dealing', 'insurance', 'playing'].includes(st.phase) && dc.length >= 2) {
      if (dc[1] !== null && !(dc.length === 2 && R.handValue(dc).total === 21)) problem('skrytá karta dealera se ukázala předčasně');
      if (st.phase === 'playing' && dc[1] !== null) problem('skrytá karta odhalena během tahů hráčů');
    }
    if (st.phase === 'insurance' && phaseChanged) {
      cov.insurancePhase++;
      if (dc[0].r !== 'A') problem('pojištění nabídnuto bez esa');
    }
    for (const s of st.seats) {
      if (s.hands.length > R.CFG.MAX_HANDS) problem('víc než 4 ruce');
      if (s.balance < 0) problem('záporný zůstatek u ' + s.name);
    }

    if (st.phase === 'settle' && phaseChanged) this.checkSettle(st, me);
  }

  checkSettle(st, me) {
    if (dcHidden(st)) problem('při vyúčtování zůstala skrytá karta');
    const dealerTotal = R.handValue(st.dealer.cards).total;
    const dealerBJ = R.isBlackjack(st.dealer.cards);
    if (dealerBJ) cov.dealerBJ++;
    if (dealerTotal > 21) cov.dealerBust++;

    // dealer táhne správně (stojí na všech 17, nedobírá, když nemá proti komu)
    let anyLive = false;
    for (const s of st.seats) for (const h of s.hands) if (!h.blackjack && h.total <= 21) anyLive = true;
    if (!dealerBJ) {
      if (!anyLive && st.dealer.cards.length !== 2) problem('dealer dobíral, ačkoli nikdo nebyl ve hře');
      if (anyLive) {
        if (dealerTotal < 17) problem('dealer skončil pod 17');
        if (st.dealer.cards.length > 2 && R.handValue(st.dealer.cards.slice(0, -1)).total >= 17) problem('dealer dobíral na 17+');
      }
    }

    if (!me.participant) return;
    this.rounds++;
    let net = 0;
    for (const h of me.hands) {
      const exp = R.evaluateHand({ cards: h.cards, bet: h.bet, blackjack: h.blackjack }, dealerTotal, dealerBJ);
      if (h.result !== exp.result || h.payout !== exp.payout) problem(`${this.label}: špatné vyhodnocení ruky ${h.result}/${exp.result}`);
      net += exp.payout - h.bet;
      cov[exp.result === 'blackjack' ? 'blackjack' : exp.result === 'bust' ? 'bust' : exp.result] = (cov[exp.result === 'blackjack' ? 'blackjack' : exp.result === 'bust' ? 'bust' : exp.result] || 0) + 1;
      if (h.doubled) cov.double++;
    }
    if (me.hands.length > 1) cov.split++;
    if (me.insurance > 0) cov.insured++;
    net += R.insurancePayout(me.insurance, dealerBJ) - me.insurance;
    if (me.net !== net) problem(`${this.label}: net ${me.net} != ${net}`);
    const raw = this.betBal + net;
    const expBal = Math.max(R.CFG.FLOOR, raw);
    if (st.you.balance !== expBal) problem(`${this.label}: zůstatek po kole ${st.you.balance}, čekáno ${expBal} (před ${this.betBal}, net ${net})`);
    if (me.floored !== (raw < R.CFG.FLOOR)) problem(`${this.label}: špatný příznak floored`);
    if (raw < R.CFG.FLOOR) cov.floor++;
  }

  // ----- chování bota --------------------------------------------------------
  decide(st) {
    const y = st.you;
    const me = st.seats.find((s) => s.you);
    if (!me || this.strategy === 'idler') return;

    if (st.phase === 'betting' && y.canBet && y.bet === 0 && !this.stop && this.betRound !== st.round) {
      this.betRound = st.round;
      let amount;
      if (this.strategy === 'maniac') amount = y.maxBet;
      else if (this.strategy === 'sleeper') amount = 100;
      else {
        const pick = [100, 200, 500, 1000][Math.floor(Math.random() * 4)];
        amount = Math.random() < 0.1 ? y.maxBet : Math.min(pick, y.maxBet);
      }
      this.send({ t: 'bet', amount });
    }

    if (this.strategy === 'sleeper') return; // nikdy nehraje tah ani se nepojišťuje

    if (y.canInsure && this.insRound !== st.round) {
      this.insRound = st.round;
      this.send({ t: 'act', a: Math.random() < 0.5 ? 'insure' : 'decline' });
    }

    if (y.actions.length && me.active >= 0) {
      const h = me.hands[me.active];
      const key = `${st.round}:${me.active}:${h.cards.length}:${me.hands.length}`;
      if (this.actKey === key) return;
      this.actKey = key;
      let a;
      if (y.actions.includes('split') && Math.random() < 0.6) a = 'split';
      else if (y.actions.includes('double') && h.total >= 9 && h.total <= 11 && Math.random() < 0.6) a = 'double';
      else a = h.total < 17 ? 'hit' : 'stand';
      this.send({ t: 'act', a });
    }
  }
}

function dcHidden(st) { return st.dealer.cards.includes(null); }

// ---------------------------------------------------------------------------
async function main() {
  console.log(`Test běží (port ${PORT}, data ${DATA_DIR})`);
  let server = await startServer();

  const A = new Bot('A-normal');
  const B = new Bot('B-reconnect');
  const C = new Bot('C-leaver');
  const M = new Bot('M-maniac', 'maniac');
  const S = new Bot('S-sleeper', 'sleeper');
  const all = [A, B, C, M, S];

  // --- připojení + nový účet ---
  for (const b of all) {
    const w = await b.connect();
    if (!w.isNew || w.balance !== 5000 || w.inTable) problem(b.label + ': nový účet nemá 5000 chipů');
    if (w.rules.floor !== 200 || w.rules.minBet !== 100) problem('špatná pravidla ve welcome');
  }

  // --- přezdívka: špatné a dobré hodnoty ---
  for (const bad of ['', 'a', 'x'.repeat(17), '<script>', 'a/b', 12345, null]) A.send({ t: 'setName', name: bad });
  await A.until(() => A.errors.length >= 7, 3000, '7 chyb přezdívky');
  A.errors.length = 0;
  A.send({ t: 'setName', name: '  Honza   Novák ' });
  await A.until(() => A.lastProfile && A.lastProfile.saved, 3000, 'uložení přezdívky');
  if (A.lastProfile.name !== 'Honza Novák') problem('přezdívka nebyla normalizována: ' + A.lastProfile.name);

  // --- všichni quick join -> stejný stůl; pátý je S, šestý nesmí dovnitř ---
  A.stop = true; // A zatím nesmí vsázet sám, nejdřív zkoušíme špatné sázky
  for (const b of all) b.send({ t: 'quick' });
  await Promise.all(all.map((b) => b.until(() => b.state, 5000, 'stav stolu')));
  const tid = A.state.id;
  if (!all.every((b) => b.state.id === tid)) problem('boti neskončili u stejného stolu');
  if (A.state.seats.length !== 5) problem('u stolu nemá být 5 hráčů');
  if (!A.state.seats.some((s) => s.name === 'Honza Novák')) problem('nová přezdívka není vidět u stolu');

  const X = new Bot('X-extra');
  await X.connect();
  X.send({ t: 'join', id: tid });
  await X.until(() => X.errors.length >= 1, 3000, 'chyba plného stolu');
  if (!/plný/i.test(X.errors[0])) problem('plný stůl: špatná hláška ' + X.errors[0]);
  X.send({ t: 'quick' });
  await X.until(() => X.state, 3000, 'quick na jiný stůl');
  if (X.state.id === tid) problem('quick poslal hráče k plnému stolu');
  X.send({ t: 'leave' });
  await X.until(() => X.lefts.length >= 1, 3000, 'odchod X');

  // --- špatné sázky (musí vše odmítnout) ---
  const y0 = A.state.you;
  const bad = [50, 105, y0.maxBet + 10, 'abc', -100, 1e9, 100.5, null];
  for (const amount of bad) A.send({ t: 'bet', amount });
  await A.until(() => A.errors.length >= bad.length - 0, 4000, 'chyby špatných sázek');
  if (A.state.you.bet !== 0) problem('špatná sázka byla přijata');
  A.errors.length = 0;
  A.stop = false;

  // --- akce mimo tah musí být ignorovány ---
  for (let i = 0; i < 5; i++) A.send({ t: 'act', a: 'hit' });

  // --- hlavní smyčka hry ---
  let bDone = false;
  let cDone = false;
  const t0 = Date.now();
  while (Math.min(A.rounds, M.rounds) < TARGET_ROUNDS) {
    if (Date.now() - t0 > 240000) throw new Error('simulace trvá příliš dlouho');
    await sleep(25);

    // B: odpojení uprostřed kola a návrat
    if (!bDone && B.rounds >= 4 && B.state && B.state.phase === 'playing' && B.state.you.balance >= 0) {
      bDone = true;
      B.ws.terminate();
      await sleep(250);
      const w = await B.connect();
      console.log(`  reconnect B: inTable=${w.inTable}`);
      if (w.inTable) await B.until(() => B.state && B.state.seats.some((s) => s.you), 3000, 'stav po reconnectu');
      else B.send({ t: 'quick' });
    }

    // C: odchod uprostřed kola -> vyřídí se až po kole
    if (!cDone && C.rounds >= 7 && C.state && C.state.phase === 'playing' && C.state.seats.find((s) => s.you).participant) {
      cDone = true;
      C.send({ t: 'leave' });
      await C.until(() => C.toasts.length >= 1, 3000, 'toast o pozdějším odchodu');
      await C.until(() => C.lefts.includes('leave'), 8000, 'odchod po kole');
      C.send({ t: 'quick' });
    }

    // S: sleeper musí být po pár kolech vyhozen pro nečinnost, pak se vrátí
    if (S.lefts.includes('afk') && !S.rejoined) {
      S.rejoined = true;
      S.send({ t: 'quick' });
    }
  }

  if (!bDone) problem('reconnect test neproběhl');
  if (!cDone) problem('leave test neproběhl');
  if (!S.lefts.includes('afk')) problem('sleeper nebyl vyhozen pro nečinnost');
  if (S.state && S.state.you && S.rejoined) console.log('  sleeper se po vyhození znovu připojil');

  // --- vypnout sázení a počkat, až kolo doběhne ---
  for (const b of all) b.stop = true;
  await Promise.all([A, B, C, M].map((b) => b.until(() => b.state && b.state.phase === 'betting' && !b.state.seats.some((s) => s.bet > 0), 20000, 'konec kol')));
  await sleep(300);

  const expected = new Map();
  for (const b of [A, B, C, M]) expected.set(b, b.state.you.balance);
  console.log('  zůstatky:', [...expected].map(([b, v]) => `${b.label}=${v}`).join(' '));
  for (const [b, v] of expected) if (v < 200) problem(b.label + ' pod minimem 200: ' + v);

  // --- statistiky/žebříček ---
  const lbBot = A;
  let lb = null;
  lbBot.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'leaderboard') lb = m; });
  lbBot.send({ t: 'leaderboard' });
  await lbBot.until(() => lb, 3000, 'žebříček');
  if (!lb.rows.length || lb.rows.some((r, i) => i && lb.rows[i - 1].balance < r.balance)) problem('žebříček není seřazený');
  if (lb.rows.some((r) => Object.keys(r).sort().join() !== 'balance,name,rounds')) problem('žebříček prozrazuje navíc něco jiného');

  // --- vypnutí serveru uloží data, po startu se zůstatky vrátí ---
  for (const b of all) b.ws.terminate();
  await sleep(200);
  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));
  const file = path.join(DATA_DIR, 'players.json');
  if (!fs.existsSync(file)) problem('data/players.json nevznikl');
  else {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Object.keys(saved).length < 5) problem('uloženo méně účtů než 5');
    if (JSON.stringify(saved).includes(A.token)) problem('token je v souboru uložen v čitelné podobě');
  }

  server = await startServer();
  for (const [b, v] of expected) {
    b.state = null;
    const w = await b.connect();
    if (w.balance !== v) problem(`${b.label}: po restartu serveru zůstatek ${w.balance} místo ${v}`);
    if (w.isNew) problem(b.label + ': po restartu je účet znovu nový');
  }
  console.log('  perzistence po restartu OK');

  // --- druhé přihlášení stejným tokenem vykopne první ---
  const A2 = new Bot('A2');
  A2.token = A.token;
  await A2.connect();
  await A.until(() => A.kicked, 3000, 'kick první relace');

  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));
}

main()
  .then(() => {
    console.log('\nPokrytí situací:', JSON.stringify(cov));
    const must = ['insurancePhase', 'split', 'double', 'blackjack', 'bust', 'win', 'lose', 'push', 'floor'];
    const missing = must.filter((k) => !cov[k]);
    if (missing.length) console.log('  (nepokryto náhodou: ' + missing.join(', ') + ')');
    if (serverErr) problem('server vypsal chyby na stderr');
    if (problems.length) {
      console.log(`\nSELHALO – ${problems.length} problémů:`);
      problems.forEach((p) => console.log(' - ' + p));
      process.exit(1);
    }
    console.log('\nVšechny kontroly prošly.');
    process.exit(0);
  })
  .catch((e) => {
    console.error('\nSELHALO:', e.message);
    problems.forEach((p) => console.log(' - ' + p));
    process.exit(1);
  });
