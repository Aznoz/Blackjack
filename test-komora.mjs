// Síťový test: spustí skutečný server a hraje přes WebSocket. Spuštění: node test/net.js
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4100 + Math.floor(Math.random() * 400);
const server = spawn(process.execPath, [path.join(here, 'server.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', GAME_SPEED: '0.01', TURN_SECONDS: '1', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'komora-')) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { if (cond) console.log('  ✓', msg); else { failures++; console.error('  ✗', msg); } };

class Client {
  constructor(name) { this.name = name; this.msgs = []; this.waiters = []; this.you = null; this.token = null; this.code = null; this.lastState = null; this.autoplay = false; this.overSeen = false; this.errors = []; }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/komora`);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error('ws error'));
      this.ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data));
    });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  onMessage(m) {
    this.msgs.push(m);
    if (m.t === 'joined') { this.you = m.you; this.token = m.token; this.code = m.code; }
    if (m.t === 'err') this.errors.push(m);
    if (m.t === 'update') {
      for (const ev of m.events) if (ev.e === 'over') this.overSeen = true;
      this.lastState = m.events[m.events.length - 1].s;
      this.maybeAct();
    }
    if (m.t === 'sync') { this.lastState = m.state; if (m.state.phase === 'over') this.overSeen = true; this.maybeAct(); }
    this.waiters = this.waiters.filter((w) => { if (w.pred(m)) { w.resolve(m); return false; } return true; });
  }
  waitFor(pred, timeout = 8000) {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      this.waiters.push(w);
      setTimeout(() => { if (this.waiters.includes(w)) { this.waiters = this.waiters.filter((x) => x !== w); reject(new Error('timeout čekání na zprávu')); } }, timeout);
    });
  }
  maybeAct() {
    if (!this.autoplay || this.acting) return;
    const s = this.lastState;
    if (!s || s.phase !== 'playing' || s.turn !== this.you) return;
    this.acting = true;
    setTimeout(async () => {
      this.acting = false;
      const cur = this.lastState;
      if (!cur || cur.phase !== 'playing' || cur.turn !== this.you) return;
      const me = cur.players.find((p) => p.id === this.you);
      const opts = Object.entries(cur.use).filter(([, u]) => u.ok);
      if (opts.length && Math.random() < 0.5) {
        const [id, u] = opts[Math.floor(Math.random() * opts.length)];
        this.send({ t: 'use', card: Number(id), target: u.targets.length ? u.targets[0] : null });
      } else {
        const alive = cur.players.filter((p) => p.alive);
        const t = me.cursed ? me.id : alive[Math.floor(Math.random() * alive.length)].id;
        this.send({ t: 'shoot', target: t });
      }
      // po chybě 'busy' zkusit znovu
      await sleep(250);
      this.maybeAct();
    }, 15);
  }
  close() { try { this.ws.close(); } catch { /* nic */ } }
}

async function until(fn, timeout = 20000, step = 50) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (fn()) return true; await sleep(step); }
  return false;
}

async function main() {
  // počkat na start serveru
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/komora/health`); ready = (await r.json()).ok; } catch { await sleep(100); }
  }
  check(ready, 'server běží a /health odpovídá');

  console.log('\nScénář 1: dva lidé + bot, celá partie, "znovu"');
  const A = new Client('Alena'); const B = new Client('Bohouš');
  await A.connect(); await B.connect();
  A.send({ t: 'create', name: 'Alena' });
  await A.waitFor((m) => m.t === 'joined');
  check(/^[A-Z]{4}$/.test(A.code), `kód místnosti ${A.code}`);
  B.send({ t: 'join', name: 'Bohouš', code: A.code.toLowerCase() });
  await B.waitFor((m) => m.t === 'joined');
  A.send({ t: 'addBot' });
  A.send({ t: 'settings', lives: 3 });
  await A.waitFor((m) => m.t === 'lobby' && m.lobby.players.length === 3 && m.lobby.settings.lives === 3);
  check(true, 'lobby: 3 hráči, 3 životy');
  B.send({ t: 'start' });
  await sleep(100);
  check(!A.msgs.some((m) => m.t === 'update'), 'start od ne-hostitele je ignorován');
  A.send({ t: 'start' });
  await A.waitFor((m) => m.t === 'update');
  const first = A.msgs.find((m) => m.t === 'update');
  check(first.events[0].e === 'start' && first.events.some((e) => e.e === 'load') && first.events.some((e) => e.e === 'turn'), 'první update obsahuje start, load, turn');
  check(first.events.every((e) => e.s && e.s.you === A.you), 'každá událost nese stav z pohledu hráče');
  A.autoplay = true; B.autoplay = true;
  A.maybeAct(); B.maybeAct();
  const finished = await until(() => A.overSeen && B.overSeen, 40000);
  check(finished, 'partie dohrána do konce u obou hráčů');
  check(A.lastState && A.lastState.winner, 'je vítěz: ' + (A.lastState && A.lastState.winner));
  A.send({ t: 'again' });
  const back = await A.waitFor((m) => m.t === 'lobby' && m.lobby.phase === 'lobby' && A.msgs.indexOf(m) > A.msgs.findIndex((x) => x.t === 'update'), 4000).catch(() => null);
  check(!!back, 'hostitel vrátil místnost do lobby');
  A.close(); B.close();

  console.log('\nScénář 2: chyby a neplatné vstupy');
  const C = new Client('Cyril'); await C.connect();
  C.send({ t: 'join', name: 'Cyril', code: 'ZZZZ' });
  const e1 = await C.waitFor((m) => m.t === 'err');
  check(/neexistuje/.test(e1.msg), 'neexistující místnost → chyba');
  C.send({ t: 'start' });
  await C.waitFor((m) => m.t === 'err' && m.code === 'noroom');
  check(true, 'akce bez místnosti → chyba');
  C.ws.send('tohle není json');
  C.ws.send(JSON.stringify({ x: 1 }));
  C.send({ t: 'ping' });
  await C.waitFor((m) => m.t === 'pong');
  check(true, 'server přežije nesmyslné zprávy a odpovídá na ping');
  C.close();

  console.log('\nScénář 3: rychlá hra s boty + odpojení a návrat (resume)');
  const D = new Client('Dana'); await D.connect();
  D.send({ t: 'quick', name: 'Dana', bots: 2, lives: 3 });
  await D.waitFor((m) => m.t === 'update');
  check(D.lastState.players.length === 3 && D.lastState.players.filter((p) => p.bot).length === 2, 'quick: Dana + 2 boti');
  const { token, code } = D;
  D.autoplay = false;
  D.close();
  await sleep(300);
  const D2 = new Client('Dana2'); await D2.connect();
  D2.send({ t: 'resume', code, token });
  const sync = await D2.waitFor((m) => m.t === 'sync');
  check(sync.state.phase === 'playing' && sync.state.you === D.you, 'resume vrátí hráče do rozehrané hry (sync)');
  D2.you = D.you; D2.autoplay = true; D2.maybeAct();
  const fin3 = await until(() => D2.overSeen, 40000);
  check(fin3, 'rychlá hra po návratu dohrána');
  D2.close();

  console.log('\nScénář 4: AFK – automat převezme tah po vypršení času');
  const E = new Client('Eda'); await E.connect();
  E.send({ t: 'quick', name: 'Eda', bots: 1, lives: 2 });
  await E.waitFor((m) => m.t === 'update');
  E.autoplay = false; // Eda nehraje vůbec
  const done = await until(() => E.overSeen, 45000);
  check(done, 'hra dohrána i když člověk nehrál (AFK automat)');
  const sawAuto = E.msgs.some((m) => m.t === 'update' && m.events.some((ev) => ev.s.players.some((p) => p.id === E.you && p.auto)));
  check(sawAuto, 'hráč je označen jako "auto"');
  E.close();

  console.log('\nScénář 5: zahlcení zprávami');
  const F = new Client('Fanda'); await F.connect();
  for (let i = 0; i < 400; i++) F.send({ t: 'ping' });
  await sleep(300);
  F.send({ t: 'ping' });
  await sleep(100);
  check(F.ws.readyState === 1, 'spojení přežilo záplavu zpráv');
  F.close();
}

try {
  await main();
} catch (err) {
  failures++;
  console.error('✗ test spadl:', err.message);
}
server.kill();
if (/Error|error/.test(serverLog.replace(/ws error/g, ''))) { console.error('\nVýpis serveru obsahuje chyby:\n' + serverLog); failures++; }
if (failures) { console.error(`\n${failures} selhání`); process.exit(1); }
console.log('\nVšechny síťové testy prošly ✓');
process.exit(0);
