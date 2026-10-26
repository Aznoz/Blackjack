// Test hry KRESLENÍ A HÁDÁNÍ: slovník + celé hry 2–4 hráčů přes skutečný WebSocket.
process.env.KRES_CHOOSE_MS = '700';
process.env.KRES_REVEAL_MS = '150';
process.env.KRES_DRAW_MS = '4000';
process.env.KRES_GRACE_MS = '600';
import assert from 'node:assert/strict';
import { WebSocketServer, WebSocket } from 'ws';
const K = await import('./kresleni/kresleni.js');
const W = await import('./kresleni/words.js');

// --- slovník
assert.ok(W.ALL.length >= 100, 'aspoň 100 slov, je ' + W.ALL.length);
for (const lv of ['lehka', 'normalni', 'tezka']) assert.ok(W.POOLS[lv].length >= 40, `${lv}: málo slov (${W.POOLS[lv].length})`);
assert.equal(W.POOLS.mix.length, W.POOLS.lehka.length + W.POOLS.normalni.length + W.POOLS.tezka.length);
const seen = new Set();
for (const e of W.ALL) { assert.ok(!seen.has(e.f), 'duplicita ' + e.w); seen.add(e.f); assert.match(e.f, /^[a-z]+( [a-z]+)*$/, e.w); assert.equal(W.fold(e.w), e.f); }
assert.equal(W.fold('  Horská   DRÁHA! '), 'horska draha');

// --- server
const wss = new WebSocketServer({ port: 0 });
wss.on('connection', (ws) => K.handleConnection(ws));
await new Promise((r) => wss.once('listening', r));
const port = wss.address().port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, name, state: null, msgs: [], chat: [], items: [], ops: [], waiters: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    c.msgs.push(m);
    if (m.t === 'state') c.state = m;
    if (m.t === 'joined') { c.id = m.you; c.token = m.token; c.code = m.code; }
    if (m.t === 'chat') c.chat.push(m.m);
    if (m.t === 'chatlog') c.chat = m.list.slice();
    if (m.t === 'draw') { c.items = m.items; c.ops = []; }
    if (m.t === 'd') c.ops.push(m);
    c.waiters = c.waiters.filter((w) => !w(m));
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.until = (fn, ms = 4000) => new Promise((res, rej) => {
    if (c.state && fn(c.state)) return res(c.state);
    const where = new Error().stack.split('\n').slice(3, 6).map((x) => x.trim().replace(/.*\//, '')).join(' < ');
    const to = setTimeout(() => rej(new Error(`timeout čekání na stav ${fn} (${c.name}, fáze ${c.state && c.state.phase}) ${where}`)), ms);
    c.waiters.push((m) => { if (m.t === 'state' && fn(m)) { clearTimeout(to); res(m); return true; } return false; });
  });
  c.open = new Promise((r) => ws.once('open', r));
  return c;
}
const room = (code) => K.rooms.get(code);

const a = client('Anna'), b = client('Bob'), c3 = client('Cyril');
await Promise.all([a.open, b.open, c3.open]);
a.send({ t: 'create', name: 'Anna' });
await a.until((s) => s.phase === 'lobby');
b.send({ t: 'join', code: a.code, name: 'Bob' });
await a.until((s) => s.players.length === 2);

// --- start a konfigurace
b.send({ t: 'start' }); await sleep(100);
assert.equal(a.state.phase, 'lobby', 'start smí jen host');
b.send({ t: 'config', level: 'tezka' }); await sleep(80);
assert.equal(a.state.level, 'mix', 'config smí jen host');
a.send({ t: 'config', level: 'lehka', rounds: 1, drawSec: 40 });
await a.until((s) => s.level === 'lehka' && s.rounds === 1 && s.drawSec === 40);
a.send({ t: 'config', rounds: 9, drawSec: 7, level: 'blbost' }); await sleep(80);
assert.equal(a.state.rounds, 1); assert.equal(a.state.drawSec, 40); assert.equal(a.state.level, 'lehka');
c3.send({ t: 'join', code: a.code, name: 'Cyril' });
await a.until((s) => s.players.length === 3);
a.send({ t: 'start' });
let s = await a.until((s) => s.phase === 'choose');
await sleep(100);
const P = { [a.id]: a, [b.id]: b, [c3.id]: c3 };
const drawer1 = P[s.drawer];
const others = (d) => Object.values(P).filter((p) => p !== d);

// --- volba slova: slova vidí jen kreslíř
assert.equal(drawer1.state.options.length, 3);
for (const o of others(drawer1)) assert.equal(o.state.options, null, 'ostatní slova nevidí');
assert.ok(drawer1.state.chooseMs > 0);
others(drawer1)[0].send({ t: 'pick', i: 0 }); await sleep(80);
assert.equal(a.state.phase, 'choose', 'volit smí jen kreslíř');
for (const o of Object.values(P)) assert.ok(o.state.phase === 'choose');
drawer1.send({ t: 'pick', i: 1 });
s = await a.until((s) => s.phase === 'draw');
await sleep(100);
let entry = room(a.code).entry;
assert.equal(entry.w, drawer1.state.options?.[1] ?? entry.w);
assert.equal(drawer1.state.word, entry.w, 'kreslíř vidí slovo');
for (const o of others(drawer1)) {
  assert.equal(o.state.word, null, 'hádající slovo nevidí');
  assert.equal(o.state.mask.length, [...entry.w].length);
  assert.ok(o.state.mask.every((ch, i) => ch === '_' || ch === ' '), 'maska nic neprozradí');
}

// --- kresba se přenáší ostatním a ukládá pro příchozí
const [g1, g2] = others(drawer1);
drawer1.send({ t: 'd', op: 'b', c: 4, w: 1, x: 10, y: 20 });
drawer1.send({ t: 'd', op: 'p', pts: [12, 22, 15, 30, 2000, -50] });
drawer1.send({ t: 'd', op: 'f', c: 6, x: 100, y: 100 });
await sleep(150);
for (const g of [g1, g2]) {
  assert.equal(g.ops.length, 3, 'operace dorazily');
  assert.deepEqual(g.ops[1].pts, [12, 22, 15, 30, 800, 0], 'souřadnice se ořežou na plátno');
}
assert.equal(drawer1.ops.length, 0, 'kreslíř si vlastní tahy nedostává zpět');
assert.equal(room(a.code).items.length, 2);
g1.send({ t: 'd', op: 'b', c: 1, w: 1, x: 1, y: 1 }); await sleep(80);
assert.equal(room(a.code).items.length, 2, 'kreslit smí jen kreslíř');
drawer1.send({ t: 'd', op: 'b', c: 99, w: 1, x: 1, y: 1 }); drawer1.send({ t: 'd', op: 'b', c: 1, w: 'x', x: 1, y: 1 }); await sleep(80);
assert.equal(room(a.code).items.length, 2, 'neplatná barva/tloušťka se ignoruje');
drawer1.send({ t: 'd', op: 'u' }); await sleep(100);
assert.equal(room(a.code).items.length, 1); assert.equal(g1.items.length, 1, 'zpět se přenese');
drawer1.send({ t: 'd', op: 'x' }); await sleep(100);
assert.equal(room(a.code).items.length, 0); assert.equal(g2.items.length, 0);
drawer1.send({ t: 'd', op: 'b', c: 2, w: 0, x: 5, y: 5 }); drawer1.send({ t: 'd', op: 'p', pts: [6, 6, 7, 7] }); await sleep(100);

// --- hádání: špatná odpověď je vidět všem, kreslíř nemůže hádat
g1.send({ t: 'chat', text: 'bumbrlíček' }); await sleep(100);
for (const p of Object.values(P)) assert.ok(p.chat.some((m) => m.text === 'bumbrlíček' && m.name === g1.name), 'špatný tip vidí všichni');
drawer1.send({ t: 'chat', text: entry.w }); await sleep(100);
assert.equal(room(a.code).guessed.size, 0, 'kreslíř slovo uhádnout nemůže');
for (const g of [g1, g2]) assert.ok(!g.chat.some((m) => m.text === entry.w), 'kreslířův chat hádající nevidí');
// skoro (jedno písmeno vedle) – napoví jen jemu
const near = entry.f.length >= 4 ? entry.f.slice(0, -1) + (entry.f.endsWith('x') ? 'y' : 'x') : null;
if (near) { g1.send({ t: 'chat', text: near }); await sleep(100); assert.ok(g1.chat.some((m) => m.kind === 'close'), 'skoro'); assert.ok(!g2.chat.some((m) => m.kind === 'close'), 'skoro vidí jen autor'); }

// --- správný tip: body podle času, první bonus, slovo se neprozradí
g1.send({ t: 'chat', text: entry.w.toUpperCase() });
s = await a.until((s) => s.guessed.length === 1);
await sleep(100);
assert.ok(g1.state.word === entry.w, 'kdo uhádl, vidí slovo');
assert.equal(g2.state.word, null);
assert.ok(!g2.chat.some((m) => m.kind === 'chat' && m.text.toLowerCase() === entry.w.toLowerCase()), 'správný tip se nezaznamená do chatu hádajících');
const pts1 = s.players.find((p) => p.id === g1.id).score;
assert.ok(pts1 >= 100 + 50 && pts1 <= 100 + 300 + 50, 'body prvního: ' + pts1);
assert.equal(s.players.find((p) => p.id === drawer1.id).score, 40, 'kreslíř +40 za každého, kdo uhádl');
g1.send({ t: 'chat', text: 'tajna zprava' }); await sleep(100);
assert.ok(drawer1.chat.some((m) => m.text === 'tajna zprava') && !g2.chat.some((m) => m.text === 'tajna zprava'), 'uhádnutí si píšou jen mezi sebou');
g1.send({ t: 'chat', text: entry.w }); await sleep(80);
assert.equal(room(a.code).guessed.size, 1, 'dvakrát bodovat nejde');
await sleep(300);
g2.send({ t: 'chat', text: entry.w });
s = await a.until((s) => s.phase === 'reveal');
const pts2 = s.players.find((p) => p.id === g2.id).score;
assert.ok(pts2 >= 100 && pts2 < pts1 + 1, 'druhý nemá bonus za prvního: ' + pts2 + ' vs ' + pts1);
assert.equal(s.reveal.word, entry.w);
assert.equal(s.reveal.reason, 'all', 'když uhádnou všichni, tah končí hned');
assert.equal(s.players.find((p) => p.id === drawer1.id).score, 80);
assert.ok(a.chat.some((m) => m.kind === 'reveal'));
assert.equal(a.state.word, entry.w, 'po tahu všichni vidí slovo');

// --- další tah má jiného kreslíře; vyprší čas
s = await a.until((s) => s.phase === 'choose' && s.drawer !== drawer1.id);
const drawer2 = P[s.drawer];
assert.notEqual(drawer2, drawer1);
await sleep(900); // kreslíř nevybere → vybere se samo
s = await a.until((s) => s.phase === 'draw');
assert.ok(room(a.code).entry);
s = await a.until((s) => s.phase === 'reveal', 9000);
assert.equal(s.reveal.reason, 'time');
assert.ok(s.reveal.nobody);
assert.ok(a.chat.some((m) => m.text && m.text.includes('Čas vypršel')));

// --- pozdější příchozí hráč se připojí a vidí kresbu
s = await a.until((s) => s.phase === 'choose');
const d3 = P[s.drawer];
d3.send({ t: 'pick', i: 0 }); await a.until((s) => s.phase === 'draw');
d3.send({ t: 'd', op: 'b', c: 3, w: 2, x: 50, y: 60 }); d3.send({ t: 'd', op: 'p', pts: [60, 70, 80, 90] }); await sleep(80);
const late = client('Dana'); await late.open;
late.send({ t: 'join', code: a.code, name: 'Dana' });
await late.until((x) => x.phase === 'draw');
assert.equal(late.items.length, 1, 'příchozí dostane dosavadní kresbu');
assert.deepEqual(late.items[0].pts, [50, 60, 60, 70, 80, 90]);
assert.equal(late.state.players.length, 4);
assert.equal(late.state.word, null);
assert.ok(late.chat.length > 0, 'příchozí dostane chat');
assert.ok(!late.chat.some((m) => m.vis === 'know'));
// kreslíř odejde → tah končí
const obs = d3 === a ? b : a; // pozorovatel, který zůstane připojený (kreslířem může být kdokoli)
d3.ws.close();
s = await obs.until((s) => s.phase === 'reveal', 5000);
assert.equal(s.reveal.reason, 'left');

// --- hra pokračuje a skončí; po konci „znovu“ resetuje body
const alive = () => [a, b, c3, late].filter((x) => x.ws.readyState === 1);
const hostC = () => alive().find((x) => x.id === room(a.code).hostId);
const A = alive()[0]; // pozorovatel
for (let guard = 0; guard < 40; guard++) {
  const st = A.state;
  if (st.phase === 'over') break;
  await sleep(120);
}
s = await A.until((s) => s.phase === 'over', 60000);
assert.ok(s.result.turns >= 3);
assert.ok(Array.isArray(s.result.best));
const nonHost = alive().find((x) => x !== hostC());
nonHost.send({ t: 'again' }); await sleep(80);
assert.equal(A.state.phase, 'over', 'znovu smí jen host');
hostC().send({ t: 'again' });
s = await A.until((s) => s.phase === 'lobby');
assert.ok(s.players.every((p) => p.score === 0));

// --- dva hráči: odpojení jednoho = pauza, návrat = pokračování, bez návratu = konec
const H = hostC();
for (const x of alive()) { if (x !== H) x.send({ t: 'leave' }); }
await H.until((x) => x.players.length === 1);
const eva = client('Eva'); await eva.open; eva.send({ t: 'join', code: H.code, name: 'Eva' }); await H.until((x) => x.players.length === 2);
H.send({ t: 'start' });
s = await H.until((s) => s.phase === 'choose');
const two = [...H.state.players];
const other = two.find((p) => p.id !== H.id);
const oc = eva;
assert.ok(oc, 'druhý hráč nalezen');
oc.ws.close(); // spadlo spojení
s = await H.until((s) => s.paused === true);
const tok = oc.token, oid = oc.id;
const back = client('back'); await back.open;
back.send({ t: 'resume', code: H.code, token: tok });
s = await H.until((x) => x.paused === false && x.phase === 'choose');
assert.ok(room(H.code).players.find((p) => p.id === oid).connected);
back.ws.close();
s = await H.until((x) => x.paused === true);
s = await H.until((x) => x.phase === 'over', 3000);
assert.ok(s.result.abandoned, 'bez návratu hra skončí');

// --- účet: jméno a profilovka z Google účtu
const acc = { name: 'Google Honza', avatar: 'a3', balance: 1 };
K.init({ TOKEN_RE: /^[A-Za-z0-9_-]{20,64}$/, resolveAccount: ({ token, name }) => ({ acc, linked: token.startsWith('L'), name }) });
assert.deepEqual(K.me({ token: 'L'.repeat(24) }).json, { account: true, linked: true, name: 'Google Honza', avatar: 'a3' });
assert.deepEqual(K.me({}).json, { account: false });
const g = client('x'); await g.open;
g.send({ t: 'create', name: 'Přezdívka', token: 'L'.repeat(24) });
s = await g.until((s) => s.phase === 'lobby');
assert.equal(s.players[0].name, 'Google Honza');
assert.equal(s.players[0].avatar, 'a3');
const g2c = client('y'); await g2c.open;
g2c.send({ t: 'join', code: g.code, name: 'dup', token: 'L'.repeat(24) }); await sleep(150);
assert.ok(g2c.msgs.some((m) => m.t === 'err' && /účet/.test(m.msg)), 'jeden účet nemůže hrát dvakrát');

// --- limity: max 8 hráčů, špatný kód, 1 hráč nezačne
const z = client('z'); await z.open; z.send({ t: 'join', code: 'ZZZZ', name: 'z' }); await sleep(100);
assert.ok(z.msgs.some((m) => m.t === 'err' && m.fatal));
const h = client('h'); await h.open; h.send({ t: 'create', name: 'h' }); await h.until((x) => x.phase === 'lobby');
h.send({ t: 'start' }); await sleep(100);
assert.equal(h.state.phase, 'lobby'); assert.ok(h.msgs.some((m) => m.t === 'err' && /2 hráči/.test(m.msg)), 'sám hrát nejde');
const many = []; for (let i = 0; i < 8; i++) { const m = client('m' + i); await m.open; many.push(m); m.send({ t: 'join', code: h.code, name: 'M' + i }); await sleep(40); }
await sleep(200);
assert.equal(h.state.players.length, 8);
assert.ok(many[7].msgs.some((m) => m.t === 'err' && /plná/.test(m.msg)), '9. hráč se nevejde');

console.log('kreslení: všechny testy prošly ✓ (slov: ' + W.ALL.length + ')');
process.exit(0);
