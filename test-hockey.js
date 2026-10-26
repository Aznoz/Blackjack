'use strict';
/** Integrační test air hockeye přes WebSocket: stoly, zápasy, odměny 200/400/650/1000, série, společný zůstatek. */
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3500 + Math.floor(Math.random() * 300);
const problems = [];
const problem = (m) => { if (!problems.includes(m)) { problems.push(m); console.log('  !! ' + m); } };
const check = (c, m) => { if (!c) problem(m); };
const log = (...a) => { if (process.env.HK_DEBUG) console.log('  [dbg]', ...a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 1000, H = 560;

function startServer(dataDir) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', TIME_SCALE: '0.04', HOCKEY_WIN_SCORE: '1', DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (out.includes('běží')) resolve(p); });
    p.stderr.on('data', (d) => process.stderr.write('[server stderr] ' + d));
    p.on('error', reject);
    setTimeout(() => reject(new Error('server nenastartoval')), 8000);
  });
}

class Bot {
  constructor(label, mode = 'idle', token) {
    this.label = label; this.mode = mode; this.token = token || crypto.randomBytes(24).toString('base64url');
    this.welcome = null; this.table = null; this.lobby = null; this.balance = null; this.errors = [];
    this.puck = null; this.m = null; this.snaps = 0; this.lefts = 0; this.kicked = false; this.tables = [];
  }
  connect(pathName = '/hockey') {
    return new Promise((resolve) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PORT}${pathName}`);
      this.ws.on('open', () => this.send({ t: 'hello', token: this.token }));
      this.ws.on('message', (d) => this.onMsg(JSON.parse(d.toString()), resolve));
      this.ws.on('error', () => {});
    });
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  onMsg(m, resolve) {
    switch (m.t) {
      case 'welcome': this.welcome = m; this.balance = m.balance; if (resolve) resolve(m); break;
      case 'profile': this.balance = m.balance; this.name = m.name; break;
      case 'lobby': this.lobby = m.tables; break;
      case 'table': this.table = m; this.tables.push(m); break;
      case 'left': this.lefts++; this.table = null; break;
      case 'error': this.errors.push(m.msg); break;
      case 'kicked': this.kicked = true; break;
      case 's': this.onSnap(m); break;
      default: break;
    }
  }
  onSnap(s) {
    this.snaps++;
    this.puck = s.p; this.m = s.m;
    if (!this.table || this.table.you == null) return;
    const me = this.table.you;
    const mx = s.m[me * 2], my = s.m[me * 2 + 1];
    if (this.mode === 'idle') { this.send({ t: 'm', x: me === 0 ? 100 : W - 100, y: 30 }); return; } // zalezlý v rohu, nebrání v brance
    // útočník: míří přes puk směrem k soupeřově brance
    const gx = me === 0 ? W : 0, gy = H / 2;
    const px = s.p[0], py = s.p[1];
    let dx = gx - px, dy = gy - py; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    // vyjet za puk, pak vpřed: pokud je pálka před pukem, nejdřív zajet za něj
    const behind = me === 0 ? mx < px - 30 : mx > px + 30;
    const tx = behind ? px + dx * 120 : px - dx * 70;
    const ty = behind ? py + dy * 120 : py - dy * 70 + (py < H / 2 ? 60 : -60) * (behind ? 0 : 1);
    this.send({ t: 'm', x: tx, y: ty });
  }
  async until(pred, ms = 20000, what = 'podmínka') {
    const t0 = Date.now();
    while (!pred()) { if (Date.now() - t0 > ms) throw new Error(`${this.label}: timeout čekání na ${what}`); await sleep(15); }
  }
  close() { try { this.ws.terminate(); } catch (e) { /* ignore */ } }
}

async function playMatch(attacker, idler, startingMatchNo, timeout = 60000) {
  attacker.mode = 'attack'; idler.mode = 'idle';
  if (process.env.HK_DEBUG) { const iv = setInterval(() => console.log('   dbg', attacker.table && attacker.table.phase, 'puck', attacker.puck && attacker.puck.map((v) => Math.round(v)).join(','), 'mallets', attacker.m && attacker.m.map(Math.round).join(','), 'score', attacker.table && attacker.table.seats.map((x) => x && x.score).join('-')), 1500); attacker.dbg = iv; }
  await attacker.until(() => attacker.table && attacker.table.phase === 'over' && attacker.table.reward, timeout, 'konec zápasu č. ' + startingMatchNo);
  return attacker.table.reward;
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'bj-hockey-'));
  let server = await startServer(dataDir);
  const A = new Bot('A'); const B = new Bot('B');
  const wa = await A.connect(); await B.connect();
  log('const wa = await A.connect(); await B.connect();');
  check(wa.balance === 5000 && wa.rules.rewards.join() === '200,400,650,1000', 'welcome: zůstatek/odměny špatně');
  check(A.lobby && A.lobby.length === 3 && A.lobby.every((t) => t.permanent), 'lobby nemá 3 stálé stoly');

  // --- chybné vstupy ---
  A.send({ t: 'join', id: 999 }); A.send({ t: 'create', name: '<b>' }); A.send({ t: 'create', name: 'x' });
  await sleep(150);
  check(A.errors.length === 3, 'chybné vstupy mají vracet chyby: ' + A.errors.length);
  A.send({ t: 'm', x: 1, y: 1 }); A.send({ t: 'garbage' }); A.ws.send('not json'); A.ws.send('x'.repeat(600));
  await sleep(100);

  // --- dva hráči u stálého stolu 1 ---
  A.send({ t: 'join', id: A.lobby[0].id }); await A.until(() => A.table, 2000, 'A u stolu');
  log("A.send({ t: 'join', id: A.lobby[0].id }); await A.");
  A.send({ t: 'join', id: A.lobby[1].id }); await sleep(100);
  check(A.errors.some((e) => /sedíš/.test(e)), 'A se připojil k dalšímu stolu');
  B.send({ t: 'join', id: A.lobby[0].id }); await B.until(() => B.table, 2000, 'B u stolu');
  await A.until(() => A.table.seats[1], 2000, 'A vidí soupeře');
  log("await A.until(() => A.table.seats[1], 2000, 'A vid");
  const C = new Bot('C'); await C.connect(); C.send({ t: 'join', id: A.table.id }); await sleep(150);
  check(C.errors.some((e) => /plný/.test(e)), 'třetí hráč se dostal ke stolu pro dva');
  C.close();
  check(A.table.you === 0 && B.table.you === 1, 'špatné přiřazení stran');
  await A.until(() => A.table.phase === 'countdown' || A.table.phase === 'playing', 3000, 'start zápasu');
  log("await A.until(() => A.table.phase === 'countdown' ");
  await A.until(() => A.snaps > 5, 3000, 'snímky fyziky');
  log("await A.until(() => A.snaps > 5, 3000, 'snímky fyz");

  // --- série výher u jednoho stolu: 200, 400, 650, 1000, 1000 ---
  const expected = [200, 400, 650, 1000, 1000];
  let bal = 5000;
  for (let i = 0; i < expected.length; i++) {
    A.table.reward = null;
    const r = await playMatch(A, B, i + 1);
    bal += expected[i];
    check(r.amount === expected[i] && r.to === 0 && r.streak === i + 1, `zápas ${i + 1}: odměna ${JSON.stringify(r)} místo ${expected[i]}`);
    await A.until(() => A.balance === bal, 3000, 'zůstatek A po zápase ' + (i + 1));
    console.log(`  zápas ${i + 1}: A vyhrál, +${r.amount}, zůstatek ${A.balance}`);
    if (i < expected.length - 1) await A.until(() => A.table.phase !== 'over', 5000, 'odvetný zápas'); // odveta začne sama
  }
  check(B.balance === 5000, 'poražený nemá ztratit chipy');

  // --- soupeř vyhraje: série A se přeruší ---
  await A.until(() => A.table.phase !== 'over', 5000, 'další zápas');
  A.table.reward = null; B.table.reward = null; A.table.winner = null;
  A.mode = 'idle'; B.mode = 'attack';
  await B.until(() => B.table.phase === 'over' && B.table.reward && B.table.reward.to === 1, 60000, 'výhra B');
  check(B.table.reward.amount === 200 && B.table.reward.streak === 1, 'první výhra B má dát 200: ' + JSON.stringify(B.table.reward));
  await B.until(() => B.balance === 5200, 3000, 'zůstatek B');
  check(B.table.seats[0].streak === 0, 'série A se po prohře neresetovala');
  await B.until(() => B.table.phase !== 'over', 5000, 'další zápas');
  // A znovu vyhraje: začíná od 200
  A.table.reward = null; B.table.reward = null;
  const rA = await playMatch(A, B, 7);
  check(rA.amount === 200 && rA.streak === 1, 'po přerušení série má A začít od 200: ' + JSON.stringify(rA));
  await A.until(() => A.table.phase !== 'over', 5000, 'další zápas');

  // --- odchod uprostřed zápasu: bez odměny, odchod resetuje sérii ---
  A.mode = 'idle'; B.mode = 'idle';
  const balB = B.balance;
  await A.until(() => A.table.phase === 'countdown' || A.table.phase === 'playing', 5000, 'běží zápas');
  A.send({ t: 'leave' });
  await B.until(() => B.table && B.table.phase === 'waiting' && !B.table.seats[0], 3000, 'B čeká sám');
  check(B.balance === balB, 'odchod soupeře nemá dát odměnu');
  A.send({ t: 'join', id: B.table.id }); await A.until(() => A.table && A.table.seats[0], 3000, 'A zpět');
  check(A.table.seats[A.table.you].streak === 0, 'po návratu ke stolu musí být série 0');
  A.send({ t: 'leave' }); await sleep(100);

  // --- hlasování o rychlosti ---
  {
    const A3 = A; const B3 = B;
    A3.send({ t: 'join', id: 1 }); await A3.until(() => A3.table, 2000, 'A u stolu (vote)');
    B3.send({ t: 'join', id: 1 }); await B3.until(() => B3.table && B3.table.phase === 'vote', 2000, 'fáze hlasování');
    check(A3.table.speeds.join() === 'slow,normal,fast', 'nabídka rychlostí');
    A3.send({ t: 'vote', v: 'bogus' }); await sleep(60);
    check(!A3.table.myVote, 'neplatný hlas přijat');
    A3.send({ t: 'vote', v: 'fast' }); await A3.until(() => A3.table.myVote === 'fast', 1000, 'můj hlas');
    check(B3.table.voted[0] === true && !B3.table.myVote, 'soupeř vidí jen že hlasoval, ne co');
    B3.send({ t: 'vote', v: 'fast' });
    await A3.until(() => A3.table.phase === 'reveal', 1000, 'reveal');
    check(A3.table.speed === 'fast' && A3.table.how === 'same' && A3.table.votes.join() === 'fast,fast', 'shoda: ' + JSON.stringify([A3.table.speed, A3.table.how]));
    A3.send({ t: 'leave' }); B3.send({ t: 'leave' }); await sleep(150);
    // neshoda -> los jedné z voleb; opakujeme, aby se objevily obě možnosti
    const seen = new Set();
    for (let k = 0; k < 14 && seen.size < 2; k++) {
      A3.send({ t: 'join', id: 1 }); await A3.until(() => A3.table, 2000, 'A u stolu');
      B3.send({ t: 'join', id: 1 }); await B3.until(() => B3.table && B3.table.phase === 'vote', 2000, 'vote');
      A3.send({ t: 'vote', v: 'slow' }); B3.send({ t: 'vote', v: 'fast' });
      await A3.until(() => A3.table.phase === 'reveal', 1000, 'reveal 2');
      check(A3.table.how === 'coin' && (A3.table.speed === 'slow' || A3.table.speed === 'fast'), 'los: ' + A3.table.speed);
      seen.add(A3.table.speed);
      A3.send({ t: 'leave' }); B3.send({ t: 'leave' }); await sleep(120);
    }
    check(seen.size === 2, 'los vybral vždy stejnou rychlost: ' + [...seen]);
    // bez hlasů vyprší čas -> normální
    A3.send({ t: 'join', id: 1 }); await A3.until(() => A3.table, 2000, 'A');
    B3.send({ t: 'join', id: 1 }); await B3.until(() => B3.table && B3.table.phase === 'vote', 2000, 'vote 3');
    await A3.until(() => A3.table.phase === 'reveal', 3000, 'timeout hlasování');
    check(A3.table.speed === 'normal' && A3.table.how === 'default', 'bez hlasů má být normální');
    A3.send({ t: 'leave' }); B3.send({ t: 'leave' }); await sleep(150);
  }

  // --- zavření spojení = odchod od stolu; nové přihlášení nevrací ke stolu ---
  B.close(); await sleep(300);
  const B2 = new Bot('B2', 'idle', B.token); await B2.connect();
  await B2.until(() => B2.lobby, 2000, 'lobby po návratu B'); // lobby chodí hned po uvítání, ale ne vždy ve stejné chvíli
  check(B2.table === null && B2.balance === B.balance + 0 || B2.welcome.balance === 5200, 'po návratu B nemá stejný zůstatek: ' + B2.welcome.balance);
  check(!B2.lobby.some((t) => t.players.length && t.permanent), 'po zavření spojení někdo sedí u stolu');

  // --- vlastní stůl se po minutě bez hráčů zruší ---
  B2.send({ t: 'create', name: 'Moje hra' }); await B2.until(() => B2.table, 2000, 'vlastní stůl');
  await sleep(200);
  B2.send({ t: 'lobby' }); await sleep(100);
  check(B2.lobby.length === 4 && B2.lobby.some((t) => t.name === 'Moje hra' && !t.permanent), 'vlastní stůl chybí v lobby');
  B2.send({ t: 'leave' }); await sleep(2800); // EMPTY_TTL = 60 s * 0.04
  B2.send({ t: 'lobby' }); await sleep(100);
  check(B2.lobby.length === 3, 'prázdný vlastní stůl se nezrušil: ' + B2.lobby.length);

  // --- zahlcení zprávami nepoloží server ---
  B2.send({ t: 'quick' }); await B2.until(() => B2.table, 2000, 'quick');
  for (let i = 0; i < 2000; i++) B2.send({ t: 'm', x: Math.random() * 1e9, y: -1e9 });
  B2.send({ t: 'm', x: 'abc', y: null });
  await sleep(300);
  check(B2.ws.readyState === 1 && B2.snaps >= 0, 'server po záplavě zpráv nereaguje');
  B2.send({ t: 'leave' });

  // --- společný zůstatek: stejný token v blackjacku vidí stejný zůstatek ---
  const BJ = new Bot('BJ', 'idle', A.token);
  const bjWelcome = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: A.token })));
    ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'welcome') { resolve(m); ws.terminate(); } });
  });
  check(bjWelcome.balance === A.balance, `blackjack nevidí společný zůstatek: ${bjWelcome.balance} vs ${A.balance}`);
  BJ.close();
  // kick druhého okna v hockeyi
  const A2 = new Bot('A2', 'idle', A.token); await A2.connect(); await A.until(() => A.kicked, 2000, 'kick');

  // --- po restartu serveru zůstanou zůstatky ---
  const finalA = A.balance;
  A2.close(); B2.close(); await sleep(200);
  server.kill('SIGTERM'); await new Promise((r) => server.once('exit', r));
  server = await startServer(dataDir);
  const A3 = new Bot('A3', 'idle', A.token); const w3 = await A3.connect();
  check(w3.balance === finalA, `po restartu zůstatek ${w3.balance} místo ${finalA}`);
  A3.close();
  server.kill('SIGTERM'); await new Promise((r) => server.once('exit', r));
}

main().then(() => {
  if (problems.length) { console.log(`\nSELHALO – ${problems.length} problémů`); process.exit(1); }
  console.log('\nVšechny kontroly air hockeye prošly.'); process.exit(0);
}).catch((e) => { console.error('\nSELHALO:', e.message); problems.forEach((p) => console.log(' - ' + p)); process.exit(1); });
