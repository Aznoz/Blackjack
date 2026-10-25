// Šachy proti botovi: odměny podle úrovně (200/500/750/1000/1500), prohra nic neodečte.
process.env.SACHY_MIN_PLIES = '1';
process.env.SACHY_BOT_MIN_MS = '1';
import assert from 'node:assert/strict';
const S = await import('./sachy/sachy.js');
const { sqFrom } = await import('./sachy/engine.js');
const acc = { name: 'Honza', avatar: null, balance: 1000, lastSeen: 0 };
const TOK = 'a'.repeat(24);
S.init({ FLOOR: 100, TOKEN_RE: /^[A-Za-z0-9_-]{20,64}$/, markDirty() {}, notifyBalance() {}, resolveAccount: ({ token }) => (token === TOK ? { acc, linked: true } : null) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client() { const ws = { readyState: 1, out: [], h: {}, send(d) { this.out.push(JSON.parse(d)); }, close() {}, on(e, f) { this.h[e] = f; }, terminate() {} }; S.handleConnection(ws); ws.say = (o) => ws.h.message(Buffer.from(JSON.stringify(o))); ws.last = (t) => [...ws.out].reverse().find((m) => m.t === t); return ws; }
assert.deepEqual(S.BOT_REWARDS, { 1: 200, 2: 500, 3: 750, 4: 1000, 5: 1500 });

const expected = { 1: 200, 2: 500, 3: 750, 4: 1000, 5: 1500 };
for (const lvl of [1, 2, 3, 4, 5]) {
  process.env.SACHY_START_FEN = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1'; // mat jedním tahem Ra8#
  const before = acc.balance;
  const h = client(); h.say({ t: 'create', token: TOK, name: 'Honza', bot: lvl, pick: 'w', time: 0 });
  h.say({ t: 'move', from: sqFrom('a1'), to: sqFrom('a8') });
  const st = h.last('state');
  assert.equal(st.result.winner, 'w'); assert.equal(st.result.coins.p1, expected[lvl], `odměna úrovně ${lvl}`);
  assert.equal(acc.balance, before + expected[lvl]);
  h.say({ t: 'leave' });
}
// prohra: bot dá mat – hráč nic neztratí
delete process.env.SACHY_START_FEN;
const bal = acc.balance;
const h = client(); h.say({ t: 'create', token: TOK, name: 'Honza', bot: 5, pick: 'w', time: 0 });
h.say({ t: 'move', from: sqFrom('e2'), to: sqFrom('e4') });
for (let i = 0; i < 400 && h.last('state').moves.length < 2; i++) await sleep(10);
h.say({ t: 'resign' });
assert.equal(h.last('state').result.winner, 'b'); assert.deepEqual(h.last('state').result.coins, {}); assert.equal(acc.balance, bal);
// host bez účtu: výhra bez coinů
process.env.SACHY_START_FEN = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1';
const g = client(); g.say({ t: 'create', token: 'z'.repeat(24), name: 'Host', bot: 4, pick: 'w', time: 0 });
g.say({ t: 'move', from: sqFrom('a1'), to: sqFrom('a8') });
assert.deepEqual(g.last('state').result.coins, {});
console.log('šachy bot – odměny OK');
process.exit(0);
