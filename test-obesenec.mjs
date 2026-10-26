// Test hry OBĚŠENEC: slovník, obtížnosti a celá hra dvou hráčů přes skutečný WebSocket.
process.env.OBES_NEXT_MS = '120';
process.env.OBES_TURN_MS = '600';
import assert from 'node:assert/strict';
import { WebSocketServer, WebSocket } from 'ws';
const O = await import('./obesenec/obesenec.js');
const W = await import('./obesenec/words.js');

// --- slovník
assert.ok(W.ALL.length >= 100, 'aspoň 100 slov, je ' + W.ALL.length);
for (const lv of W.LEVELS) {
  const cfg = W.LEVEL_CFG[lv], pool = W.POOLS[lv];
  assert.ok(pool.length >= 25, `${lv}: málo slov (${pool.length})`);
  for (const e of pool) assert.ok(e.f.length >= cfg.min && e.f.length <= cfg.max, `${lv}: ${e.w} má špatnou délku`);
}
const fs = new Set(); for (const e of W.ALL) { assert.ok(!fs.has(e.f), 'duplicita ' + e.w); fs.add(e.f); assert.match(e.f, /^[a-z]+$/); assert.ok(e.c, 'kategorie ' + e.w); }
assert.equal(W.fold('Žluťoučký kůň ŘEKA'), 'zlutoucky kun reka');
const lens = (lv) => W.POOLS[lv].map((e) => e.f.length);
assert.ok(Math.max(...lens('lehka')) < Math.min(...lens('normalni')), 'lehká kratší než normální');
assert.ok(Math.max(...lens('normalni')) < Math.min(...lens('tezka')), 'normální kratší než těžká');
assert.ok(Math.max(...lens('tezka')) < Math.min(...lens('expert')), 'těžká kratší než expert');
assert.ok(W.LEVEL_CFG.lehka.mistakes > W.LEVEL_CFG.normalni.mistakes && W.LEVEL_CFG.normalni.mistakes > W.LEVEL_CFG.tezka.mistakes && W.LEVEL_CFG.tezka.mistakes > W.LEVEL_CFG.expert.mistakes, 'víc chyb u lehčích');

// --- server
const wss = new WebSocketServer({ port: 0 });
wss.on('connection', (ws) => O.handleConnection(ws));
await new Promise((r) => wss.once('listening', r));
const port = wss.address().port;

function client(name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, name, state: null, msgs: [], waiters: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    c.msgs.push(m);
    if (m.t === 'state') c.state = m;
    if (m.t === 'joined') { c.id = m.you; c.token = m.token; c.code = m.code; }
    c.waiters = c.waiters.filter((w) => !w(m));
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.until = (fn, ms = 4000) => new Promise((res, rej) => {
    if (c.state && fn(c.state)) return res(c.state);
    const to = setTimeout(() => rej(new Error('timeout čekání na stav ' + fn)), ms);
    c.waiters.push((m) => { if (m.t === 'state' && fn(m)) { clearTimeout(to); res(m); return true; } return false; });
  });
  c.open = new Promise((r) => ws.once('open', r));
  return c;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wordOf = (room) => O.rooms.get(room).entry; // test sahá do serveru pro tajné slovo

const a = client('Anna'), b = client('Bob');
await Promise.all([a.open, b.open]);
a.send({ t: 'create', name: 'Anna' });
await a.until((s) => s.phase === 'lobby');
b.send({ t: 'join', code: a.code, name: 'Bob' });
await a.until((s) => s.players.length === 2);

b.send({ t: 'start' }); await sleep(100);
assert.equal(a.state.phase, 'lobby', 'start smí jen host');
b.send({ t: 'config', level: 'expert' }); await sleep(80);
assert.equal(a.state.level, 'normalni', 'config smí jen host');
a.send({ t: 'config', level: 'tezka', rounds: 3, turnSec: 45 });
await a.until((s) => s.level === 'tezka' && s.rounds === 3 && s.turnSec === 45);
a.send({ t: 'config', rounds: 7, turnSec: 1 }); await sleep(80);
assert.equal(a.state.rounds, 3, 'neplatný počet kol se ignoruje');
assert.equal(a.state.turnSec, 45);

// --- kolo 1: těžká = 9–10 písmen, bez nápovědy kategorie
a.send({ t: 'start' });
let s = await a.until((s) => s.phase === 'round');
let e = wordOf(a.code);
assert.ok(e.f.length >= 9 && e.f.length <= 10, 'těžká slova mají 9–10 písmen: ' + e.w);
assert.equal(s.category, null, 'těžká bez kategorie');
assert.equal(s.maxMistakes, 7);
assert.equal(s.len, e.f.length);
assert.ok(s.word.every((x) => x === null), 'nic není odkryto');
const first = s.turn;
const P = { [a.id]: a, [b.id]: b };
const other = (id) => (id === a.id ? b : a);

// mimo tah
other(first).send({ t: 'guess', letter: 'a' });
await other(first).until(() => true); await sleep(80);
assert.ok(other(first).msgs.some((m) => m.t === 'reject' && /tahu/.test(m.msg)), 'mimo tah se odmítne');
assert.equal(a.state.guessed.length, 0);

// správné písmeno odkryje všechny výskyty (i s diakritikou) a předá tah
const target = [...e.f][0];
P[first].send({ t: 'guess', letter: target.toUpperCase() });
s = await a.until((s) => s.guessed.length === 1);
assert.ok(s.guessed[0].ok && s.guessed[0].l === target);
const shown = s.word.map((x, i) => (x === null ? null : e.f[i]));
assert.ok(shown.every((x, i) => (x === target) === (e.f[i] === target) || x === null && e.f[i] !== target), 'odkryty všechny výskyty písmene');
assert.ok(s.word.filter((x) => x !== null).length === [...e.f].filter((c) => c === target).length);
assert.notEqual(s.turn, first, 'po tipu se střídá');
assert.equal(s.players.find((p) => p.id === first).score, 2 * [...e.f].filter((c) => c === target).length);

// opakované písmeno
P[s.turn].send({ t: 'guess', letter: target });
await sleep(100);
assert.ok(P[s.turn].msgs.some((m) => m.t === 'reject' && /už padlo/.test(m.msg)));
// nesmysl
P[s.turn].send({ t: 'guess', letter: '5' }); P[s.turn].send({ t: 'guess', letter: 'ab' });
await sleep(100);

// špatné písmeno = chyba
const absent = 'qwxjzkyv'.split('').find((c) => !e.f.includes(c)) || 'q';
P[a.state.turn].send({ t: 'guess', letter: absent });
s = await a.until((s) => s.mistakes === 1);
assert.ok(!s.guessed.at(-1).ok);

// špatné celé slovo = 2 chyby
P[s.turn].send({ t: 'solve', word: 'zzzzzzzzzz' });
s = await a.until((s) => s.mistakes === 3);
// správné celé slovo vyhraje kolo
const solver = s.turn;
P[solver].send({ t: 'solve', word: e.w.toUpperCase() });
s = await a.until((s) => s.phase === 'reveal');
assert.equal(s.solvedCount, 1);
assert.deepEqual(s.word, [...e.w], 'po kole je slovo celé vidět');
assert.equal(s.results[0].solved, true); assert.equal(s.results[0].by, solver);

// --- kolo 2: prohra vyčerpáním chyb
s = await a.until((s) => s.phase === 'round' && s.round === 2);
e = wordOf(a.code);
const wrong = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((c) => !e.f.includes(c));
for (let i = 0; i < 7; i++) {
  const cur = a.state;
  if (cur.phase !== 'round') break;
  P[cur.turn].send({ t: 'guess', letter: wrong[i] });
  await a.until((x) => x.guessed.length > cur.guessed.length || x.phase !== 'round');
}
s = await a.until((s) => s.phase === 'reveal');
assert.equal(s.results[1].solved, false);
assert.equal(s.mistakes, 7);

// --- kolo 3: odpojení hráče na tahu předá tah druhému, hra pokračuje
s = await a.until((s) => s.phase === 'round' && s.round === 3);
if (s.turn === b.id) { b.ws.close(); await sleep(150); assert.equal(a.state.turn, a.id, 'tah přejde na zbývajícího'); }
else { b.ws.close(); await sleep(150); }
assert.equal(a.state.players.find((p) => p.id === b.id).connected, false);
// Bob se vrací přes resume
const b2 = client('Bob2'); await b2.open;
b2.send({ t: 'resume', code: a.code, token: b.token });
await b2.until((x) => x.phase === 'round');
// vyřešit poslední slovo
e = wordOf(a.code);
let cur = a.state;
const tc = cur.turn === a.id ? a : b2;
tc.send({ t: 'solve', word: e.w });
s = await a.until((s) => s.phase === 'over');
assert.equal(s.result.solved, 2);
assert.equal(s.result.total, 3);
assert.ok(s.result.best.length >= 1);
assert.ok(s.players.every((p) => typeof p.score === 'number'));

// --- znovu
b2.send({ t: 'again' }); await sleep(80);
assert.equal(a.state.phase, 'over', 'znovu smí jen host');
a.send({ t: 'again' });
s = await a.until((s) => s.phase === 'lobby');
assert.ok(s.players.every((p) => p.score === 0));

// --- sólo hra + lehká (nápověda kategorie, první písmeno zdarma) + časový limit tahu
a.send({ t: 'config', level: 'lehka', rounds: 3 });
b2.send({ t: 'leave' }); await a.until((s) => s.players.length === 1);
a.send({ t: 'start' });
s = await a.until((s) => s.phase === 'round');
e = wordOf(a.code);
assert.ok(e.f.length >= 4 && e.f.length <= 6);
assert.ok(s.category, 'lehká ukazuje kategorii');
assert.equal(s.maxMistakes, 9);
assert.equal(s.guessed.length, 1, 'první písmeno zdarma');
assert.equal(s.word[0], e.w[0]);
// vypršení času = přeskočení tahu bez trestu (sólo: tah zůstává u téhož hráče)
const before = s.mistakes;
await a.until(() => a.msgs.some((m) => m.t === 'state' && m.ev && m.ev.type === 'skip'), 3000);
assert.equal(a.state.mistakes, before, 'přeskočený tah nic nestojí');
a.send({ t: 'solve', word: e.w });
await a.until((s) => s.phase === 'reveal');

// --- hra s přihlášeným účtem: jméno a profilovka z účtu
const acc = { name: 'Google Honza', avatar: 'a3', balance: 1 };
O.init({ TOKEN_RE: /^[A-Za-z0-9_-]{20,64}$/, resolveAccount: ({ token, name }) => ({ acc, linked: token.startsWith('L'), name }) });
assert.deepEqual(O.me({ token: 'L'.repeat(24) }).json, { account: true, linked: true, name: 'Google Honza', avatar: 'a3' });
assert.deepEqual(O.me({}).json, { account: false });
const g = client('x'); await g.open;
g.send({ t: 'create', name: 'Přezdívka', token: 'L'.repeat(24) });
s = await g.until((s) => s.phase === 'lobby');
assert.equal(s.players[0].name, 'Google Honza', 'jméno se bere z účtu, ne z pole');
assert.equal(s.players[0].avatar, 'a3');
const g2 = client('y'); await g2.open;
g2.send({ t: 'join', code: g.code, name: 'dup', token: 'L'.repeat(24) });
await sleep(150);
assert.ok(g2.msgs.some((m) => m.t === 'err' && /účet/.test(m.msg)), 'jeden účet nemůže hrát dvakrát');

// --- neznámý kód, plná místnost
const z = client('z'); await z.open; z.send({ t: 'join', code: 'ZZZZ', name: 'z' }); await sleep(100);
assert.ok(z.msgs.some((m) => m.t === 'err' && m.fatal));

console.log('oběšenec: všechny testy prošly ✓ (slov: ' + W.ALL.length + ')');
process.exit(0);
