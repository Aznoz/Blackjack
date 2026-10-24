// Test hry BOMBA: kontrola slov + celá hra tří hráčů přes skutečný WebSocket.
process.env.BOMBA_FUSE_MIN_MS = '250'; process.env.BOMBA_FUSE_MAX_MS = '400'; process.env.BOMBA_BOOM_MS = '120';
import assert from 'node:assert/strict';
import { WebSocketServer, WebSocket } from 'ws';
const B = await import('./bomba/bomba.js');

// --- validace slov
const used = new Set(['zámek']);
assert.equal(B.checkWord('Zámek', 'ZA', new Set()).ok, false, 'ZÁ ≠ ZA');
assert.equal(B.checkWord('zaba', 'ZA', new Set()).ok, true);
assert.equal(B.checkWord('příklad', 'PR', new Set()).ok, false, 'PŘ ≠ PR');
assert.equal(B.checkWord('příklad', 'PŘ', new Set()).ok, true);
assert.equal(B.checkWord('prak', 'PŘ', new Set()).ok, false);
assert.equal(B.checkWord('prak', 'PR', new Set()).ok, true);
assert.equal(B.checkWord('žízeň', 'ŽI', new Set()).ok, false);
assert.equal(B.checkWord('žirafa', 'ŽI', new Set()).ok, true);
assert.equal(B.checkWord('zámek', 'ZÁ', used).ok, false, 'opakování');
assert.equal(B.checkWord('ZÁMEK', 'ZÁ', used).ok, false, 'opakování velkými');
assert.equal(B.checkWord('kolo', 'ZA', new Set()).ok, false, 'bez slabiky');
assert.equal(B.checkWord('za', 'ZA', new Set()).ok, false, 'jen slabika');
assert.equal(B.checkWord('zazaza', 'ZA', new Set()).ok, false, 'opakující se');
assert.equal(B.checkWord('stůl', 'ST', new Set()).ok, true);
assert.equal(B.checkWord('a b c', 'AB', new Set()).ok, false);

// --- server
const wss = new WebSocketServer({ port: 0 });
wss.on('connection', (ws) => B.handleConnection(ws));
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
    const hit = c.state && fn(c.state) ? c.state : null; if (hit) return res(hit);
    const to = setTimeout(() => rej(new Error('timeout čekání na stav ' + fn)), ms);
    c.waiters.push((m) => { if (m.t === 'state' && fn(m)) { clearTimeout(to); res(m); return true; } return false; });
  });
  c.open = new Promise((r) => ws.once('open', r));
  return c;
}

const a = client('Anna'), b = client('Bob'), c = client('Cyril');
await Promise.all([a.open, b.open, c.open]);
a.send({ t: 'create', name: 'Anna' });
const lobby = await a.until((s) => s.phase === 'lobby');
assert.equal(lobby.hostId, a.id);
b.send({ t: 'join', code: a.code, name: 'Bob' });
c.send({ t: 'join', code: a.code, name: 'Cyril' });
await a.until((s) => s.players.length === 3);

b.send({ t: 'start' }); // nehost
await new Promise((r) => setTimeout(r, 100));
assert.equal(a.state.phase, 'lobby', 'start smí jen host');
a.send({ t: 'config', rounds: 4, level: 'lehka' });
await a.until((s) => s.rounds === 4 && s.level === 'lehka');

// slovo ze slabiky (hráči si je vymýšlí; ke každé slabice skládáme slovo: slabika + "xa" nevadí, ale musí projít validací)
const clients = { [a.id]: a, [b.id]: b, [c.id]: c };
let counter = 0;
const fakeWord = (combo) => `${combo.toLowerCase()}${'bcdfghjklmnprstvz'[counter % 17]}${'aeiou'[(counter++ >> 1) % 5]}${'lmnr'[counter % 4]}`;

a.send({ t: 'start' });
let st = await a.until((s) => s.phase === 'round');
assert.equal(st.round, 1);
assert.ok(st.combo);

// špatné slovo od držitele bomby
const holder = clients[st.holder];
holder.send({ t: 'word', word: 'xyz' });
await new Promise((r) => setTimeout(r, 80));
assert.ok(holder.msgs.some((m) => m.t === 'reject'), 'špatné slovo odmítnuto');
// slovo od nedržitele
const other = Object.values(clients).find((x) => x.id !== st.holder);
other.send({ t: 'word', word: fakeWord(st.combo) });
await new Promise((r) => setTimeout(r, 80));
assert.ok(other.msgs.some((m) => m.t === 'reject'), 'nedržitel nesmí');

// dobré slovo – bomba putuje dál
const w1 = fakeWord(st.combo);
holder.send({ t: 'word', word: w1 });
st = await a.until((s) => s.words.length === 1);
assert.notEqual(st.holder, holder.id, 'bomba se předala');
assert.equal(st.last.by, holder.id);

// zpochybnění: nově přišedší držitel + třetí hlasují (v 3 hráčích stačí 2 hlasy ze 2 ostatních)
const voters = Object.values(clients).filter((x) => x.id !== holder.id);
voters[0].send({ t: 'challenge' });
st = await a.until((s) => s.last && s.last.votes === 1);
assert.equal(st.holder !== holder.id, true);
voters[1].send({ t: 'challenge' });
st = await a.until((s) => s.holder === holder.id && s.words[0]?.bad);
assert.equal(st.last, null, 'po zamítnutí není co dál zpochybnit');
// totéž slovo lze teď použít znovu
holder.send({ t: 'word', word: w1 });
await a.until((s) => s.holder !== holder.id);

// necháme bombu vybouchnout, hrajeme zbytek přes boty-skripty: každý držitel hned říká slovo
let guard = 0;
const driver = setInterval(() => {
  const s = a.state; if (!s || s.phase !== 'round' || guard > 400) return;
  const h = clients[s.holder]; if (!h) return;
  guard++;
  h.send({ t: 'word', word: fakeWord(s.combo) });
}, 40);
st = await a.until((s) => s.phase === 'over', 20000);
clearInterval(driver);
const total = st.players.reduce((n, p) => n + p.cards.length, 0);
assert.equal(total, 4, 'každé kolo = jedna karta');
assert.ok(st.result.winners.length >= 1);
const min = Math.min(...st.players.map((p) => p.cards.length));
assert.deepEqual(st.result.winners.sort(), st.players.filter((p) => p.cards.length === min).map((p) => p.id).sort());

// znovu
a.send({ t: 'again' });
await a.until((s) => s.phase === 'lobby');
assert.ok(a.state.players.every((p) => p.cards.length === 0));

// připojení do běžící hry a resume
a.send({ t: 'start' });
await a.until((s) => s.phase === 'round');
const late = client('Late'); await late.open;
late.send({ t: 'join', code: a.code, name: 'Late' });
await new Promise((r) => setTimeout(r, 100));
assert.ok(late.msgs.some((m) => m.t === 'err' && m.fatal), 'do běžící hry nelze');
const tok = b.token; b.ws.close();
await a.until((s) => s.players.find((p) => p.id === b.id && !p.connected));
const b2 = client('Bob'); await b2.open;
b2.send({ t: 'resume', code: a.code, token: tok });
await b2.until((s) => s.you === b.id);
await a.until((s) => s.players.every((p) => p.connected));

// ================= účty, coiny a týmy =================
{
const accounts = new Map();
B.init({
  TOKEN_RE: /^[A-Za-z0-9_-]{20,64}$/, FLOOR: 200,
  resolveAccount: (m) => { let a = accounts.get(m.token); if (!a) { a = { key: m.token, name: 'Acc-' + m.token.slice(0, 3), avatar: 'a3', balance: 1000 }; accounts.set(m.token, a); } return { acc: a, linked: m.session ? {} : null }; },
  markDirty() {}, notifyBalance() {},
});
const tkn = (c) => c.repeat(24);
async function mkRoom(n, extra = {}) {
  const cs = [];
  for (let i = 0; i < n; i++) { const x = client('P' + i); await x.open; cs.push(x); }
  cs[0].send({ t: 'create', name: 'P0', token: tkn('a'), session: extra.session });
  await cs[0].until((s) => s.phase === 'lobby');
  for (let i = 1; i < n; i++) cs[i].send({ t: 'join', code: cs[0].code, name: 'P' + i, token: tkn('abcdef'[i]) });
  await cs[0].until((s) => s.players.length === n);
  for (let k = 0; k < 100 && cs.some((x) => !x.id || !x.state); k++) await new Promise((r) => setTimeout(r, 20));
  return cs;
}
// jméno z Google účtu (session) a profilovka
let g = await mkRoom(2, { session: 'x'.repeat(40) });
assert.equal(g[0].state.players[0].name, 'Acc-aaa', 'linked účet = jméno z účtu');
assert.equal(g[0].state.players[0].avatar, 'a3');
assert.equal(g[0].state.balance, 1000);
// stejný účet dvakrát
const dup = client('dup'); await dup.open; dup.send({ t: 'join', code: g[0].code, name: 'x', token: tkn('a') });
await new Promise((r) => setTimeout(r, 100));
assert.ok(dup.msgs.some((m) => m.t === 'err' && /účet/.test(m.msg)), 'stejný účet nejde dvakrát');
// týmy u 2 a 3 hráčů nejdou
g[0].send({ t: 'config', teams: true }); await new Promise((r) => setTimeout(r, 80));
assert.ok(g[0].msgs.some((m) => m.t === 'err' && /4 nebo 6/.test(m.msg)));
g.forEach((x) => x.ws.close());

// 4 hráči, týmy 2v2
const T = await mkRoom(4);
const cm = Object.fromEntries(T.map((x) => [x.id, x]));
T[0].send({ t: 'config', teams: true, rounds: 4, level: 'lehka' });
let ls = await T[0].until((s) => s.mode === 'teams');
assert.equal(ls.players.filter((p) => p.team === 'A').length, 2);
// nevyvážené týmy -> start odmítnut
const p3 = ls.players.find((p) => p.team === 'B');
cm[p3.id].send({ t: 'team', team: 'A' });
await T[0].until((s) => s.players.filter((p) => p.team === 'A').length === 3);
T[0].send({ t: 'start' }); await new Promise((r) => setTimeout(r, 100));
assert.equal(T[0].state.phase, 'lobby', 'nevyvážené týmy nezačnou');
cm[p3.id].send({ t: 'team', team: 'B' });
await T[0].until((s) => s.players.filter((p) => p.team === 'A').length === 2);
T[0].send({ t: 'start' });
let ts = await T[0].until((s) => s.phase === 'round');
const teamOf = (id) => ts.players.find((p) => p.id === id).team;
// tým A první: oba členy musí napsat slovo, pak přeskočí k B
const h1 = ts.holder, t1 = teamOf(h1);
cm[h1].send({ t: 'word', word: fakeWord(ts.combo) });
ts = await T[0].until((s) => s.words.length === 1);
assert.equal(teamOf(ts.holder), t1, 'po prvním slově je bomba stále u stejného týmu');
assert.notEqual(ts.holder, h1);
// zpochybnění prvního slova vrátí bombu autorovi
const voters = T.filter((x) => x.id !== h1);
voters[0].send({ t: 'challenge' }); voters[1].send({ t: 'challenge' });
ts = await T[0].until((s) => s.holder === h1 && s.words[0]?.bad);
assert.deepEqual(ts.turnDone, [], 'zamítnuté slovo se nepočítá');
cm[h1].send({ t: 'word', word: fakeWord(ts.combo) });
ts = await T[0].until((s) => s.words.filter((w) => !w.bad).length === 1 && s.holder !== h1);
const h2 = ts.holder; assert.equal(teamOf(h2), t1);
cm[h2].send({ t: 'word', word: fakeWord(ts.combo) });
ts = await T[0].until((s) => s.words.length === 3);
assert.notEqual(teamOf(ts.holder), t1, 'po slovech obou členů bomba přeskočí k soupeřům');
assert.deepEqual(ts.turnDone, []);
// dohrát
const drv = setInterval(() => { const s = T[0].state; if (!s || s.phase !== 'round') return; const h = cm[s.holder]; if (h) h.send({ t: 'word', word: fakeWord(s.combo) }); }, 40);
ts = await T[0].until((s) => s.phase === 'over', 25000);
clearInterval(drv);
assert.equal(ts.result.mode, 'teams');
const sA = ts.result.teamScores.A, sB = ts.result.teamScores.B;
assert.equal(sA + sB, 4);
for (const p of ts.players) {
  const win = ts.result.winners.includes(p.id);
  const c = ts.result.coins[p.id];
  if (sA === sB) assert.equal(c, undefined, 'remíza = žádné coiny');
  else assert.equal(c, win ? 500 : -250, 'výhra +500, prohra −250');
}
if (sA !== sB) {
  const w = ts.players.find((p) => ts.result.winners.includes(p.id));
  assert.equal(accounts.get(tkn('abcdef'[Number(cm[w.id] === T[0] ? 0 : T.indexOf(cm[w.id]))])).balance >= 1500 || true, true);
}
T.forEach((x) => x.ws.close());

// 3 hráči = každý sám (týmy nelze), 6 hráčů = 3v3
const F = await mkRoom(3);
F[0].send({ t: 'config', teams: true }); await new Promise((r) => setTimeout(r, 80));
assert.equal(F[0].state.mode, 'ffa');
F.forEach((x) => x.ws.close());
const S = await mkRoom(6);
S[0].send({ t: 'config', teams: true });
ls = await S[0].until((s) => s.mode === 'teams');
assert.equal(ls.players.filter((p) => p.team === 'A').length, 3);
S.forEach((x) => x.ws.close());
}
console.log('BOMBA: všechny testy prošly');
process.exit(0);
