// Šachy: místnosti, tahy, hodiny, remíza, vzdání, odpojení, coiny (výhra +1500, prohra −500).
process.env.SACHY_MS_PER_MIN = '300'; // „minuta“ = 300 ms
process.env.SACHY_DROP_MS = '250';
process.env.SACHY_FIRST_MS = '400';
import assert from 'node:assert/strict';
const S = await import('./sachy/sachy.js');
const { sqFrom } = await import('./sachy/engine.js');

const accs = {};
const mk = (name, bal) => ({ name, avatar: null, balance: bal, lastSeen: 0 });
let dirty = 0; const notified = [];
S.init({
  FLOOR: 100, TOKEN_RE: /^[A-Za-z0-9_-]{20,64}$/, markDirty: () => { dirty++; }, notifyBalance: (a) => notified.push(a.name),
  resolveAccount: ({ token }) => (accs[token] ? { acc: accs[token], linked: true } : null),
});
const T1 = 'a'.repeat(24), T2 = 'b'.repeat(24), T3 = 'c'.repeat(24);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client() {
  const ws = { readyState: 1, out: [], h: {}, send(d) { this.out.push(JSON.parse(d)); }, close() { this.readyState = 3; }, on(e, f) { this.h[e] = f; }, terminate() {} };
  S.handleConnection(ws);
  ws.say = (o) => ws.h.message(Buffer.from(JSON.stringify(o)));
  ws.last = (t) => [...ws.out].reverse().find((m) => m.t === t);
  return ws;
}
const mv = (ws, a, b, promo) => ws.say({ t: 'move', from: sqFrom(a), to: sqFrom(b), promo });
function setup(tokA = T1, tokB = T2, cfg = {}) {
  const a = client(), b = client();
  a.say({ t: 'create', token: tokA, name: 'Honza' });
  const code = a.last('joined').code;
  b.say({ t: 'join', code, token: tokB, name: 'Eva' });
  if (Object.keys(cfg).length) a.say({ t: 'config', ...cfg });
  return { a, b, code };
}
const bothMate = (w, bl) => { mv(w, 'f2', 'f3'); mv(bl, 'e7', 'e5'); mv(w, 'g2', 'g4'); mv(bl, 'd8', 'h4'); };

// --- lobby a oprávnění
accs[T1] = mk('Honza', 1000); accs[T2] = mk('Eva', 3000); accs[T3] = mk('Třetí', 50);
let { a, b, code } = setup();
assert.equal(a.last('state').players.length, 2);
b.say({ t: 'config', time: 3 }); assert.equal(a.last('state').cfg.time, 10, 'config smí jen zakladatel');
a.say({ t: 'config', time: 5, inc: 2, pick: 'w' });
assert.deepEqual([a.last('state').cfg.time, a.last('state').cfg.inc, a.last('state').cfg.pick], [5, 2, 'w']);
a.say({ t: 'config', time: 7 }); assert.equal(a.last('state').cfg.time, 5, 'neplatný čas se ignoruje');
const c = client(); c.say({ t: 'join', code, token: T3, name: 'X' });
assert.ok(c.last('err').fatal, 'třetí hráč se nevejde');
const dup = client(); dup.say({ t: 'create', token: T1, name: 'Honza' });
const dc = dup.last('joined').code; const dup2 = client(); dup2.say({ t: 'join', code: dc, token: T1, name: 'Honza2' });
assert.match(dup2.last('err').msg, /účet/, 'stejný účet dvakrát ne');

// --- partie do matu, pick 'w' = zakladatel bílý
a.say({ t: 'start' });
let st = a.last('state');
assert.equal(st.phase, 'play'); assert.equal(st.color, 'w'); assert.equal(b.last('state').color, 'b');
assert.equal(st.legal.length, 20); assert.equal(b.last('state').legal.length, 0, 'černý nemá tah');
mv(b, 'e7', 'e5'); assert.equal(b.last('rej').msg, 'Nejsi na tahu.');
mv(a, 'e2', 'e5'); assert.ok(a.last('rej'), 'nelegální tah');
mv(a, 'f2', 'f3'); mv(b, 'e7', 'e5'); mv(a, 'g2', 'g4'); mv(b, 'd8', 'h4');
st = a.last('state');
assert.equal(st.phase, 'over'); assert.equal(st.result.type, 'mat'); assert.equal(st.result.winner, 'b');
assert.deepEqual(st.result.coins, { p1: -500, p2: 1500 });
assert.equal(accs[T1].balance, 500); assert.equal(accs[T2].balance, 4500);
assert.ok(dirty > 0 && notified.includes('Honza'));
mv(a, 'a2', 'a3'); assert.ok(a.last('rej'), 'po konci se netáhne');

// --- odveta: barvy se prohodí
a.say({ t: 'rematch' }); assert.equal(a.last('state').phase, 'over');
b.say({ t: 'rematch' });
st = a.last('state'); assert.equal(st.phase, 'play'); assert.equal(st.color, 'b'); assert.equal(b.last('state').color, 'w');
// vzdání po pár tazích = prohra −500 / +1500
mv(b, 'e2', 'e4'); mv(a, 'e7', 'e5'); mv(b, 'g1', 'f3'); mv(a, 'b8', 'c6');
a.say({ t: 'resign' });
st = b.last('state'); assert.equal(st.result.type, 'vzdani'); assert.equal(st.result.winner, 'w');
assert.equal(accs[T1].balance, 100, 'zůstatek neklesne pod FLOOR');
assert.equal(accs[T2].balance, 6000);

// --- krátká partie: vzdání po 1 tahu = zrušeno bez coinů
accs[T1].balance = 1000; accs[T2].balance = 1000;
({ a, b } = setup(T1, T2, { pick: 'w' }));
a.say({ t: 'start' }); mv(a, 'e2', 'e4'); b.say({ t: 'resign' });
st = a.last('state'); assert.equal(st.result.type, 'abort'); assert.deepEqual(st.result.coins, {});
// 3 půltahy a vzdání = vítěz, ale bez coinů (moc krátké)
({ a, b } = setup(T1, T2, { pick: 'w' }));
a.say({ t: 'start' }); mv(a, 'e2', 'e4'); mv(b, 'e7', 'e5'); mv(a, 'd2', 'd4'); b.say({ t: 'resign' });
st = a.last('state'); assert.equal(st.result.winner, 'w'); assert.deepEqual(st.result.coins, {}); assert.ok(st.result.noCoins);
assert.equal(accs[T1].balance, 1000);

// --- remíza dohodou (až po 2 plies)
({ a, b } = setup(T1, T2, { pick: 'w' }));
a.say({ t: 'start' }); a.say({ t: 'draw' }); assert.equal(a.last('state').drawOffer, null, 'nabídka před 2 tahy nejde');
mv(a, 'e2', 'e4'); mv(b, 'e7', 'e5'); b.say({ t: 'draw' });
assert.equal(a.last('state').drawOffer, 'p2');
a.say({ t: 'nodraw' }); assert.equal(a.last('state').drawOffer, null);
b.say({ t: 'draw' }); a.say({ t: 'draw' });
st = a.last('state'); assert.equal(st.result.type, 'remiza'); assert.equal(accs[T1].balance, 1000);

// --- hodiny: 1 „minuta“ = 300 ms, hodiny běží po prvních tazích obou
({ a, b } = setup(T1, T2, { pick: 'w', time: 1 }));
a.say({ t: 'start' });
assert.equal(a.last('state').clock.running, null, 'před prvním tahem hodiny neběží');
mv(a, 'e2', 'e4'); mv(b, 'e7', 'e5'); // běží bílému
mv(a, 'd2', 'd4'); mv(b, 'd7', 'd5');
assert.equal(a.last('state').clock.running, 'w');
await sleep(450);
st = a.last('state'); assert.equal(st.phase, 'over'); assert.equal(st.result.type, 'cas'); assert.equal(st.result.winner, 'b');
assert.equal(accs[T1].balance, 500, 'prohra na čas −500 (bílý je zakladatel)');
// nulový limit = hodiny nejsou
({ a, b } = setup(T1, T2, { pick: 'w', time: 0 }));
a.say({ t: 'start' }); assert.equal(a.last('state').clock, null);

// --- první tah včas, jinak zrušeno
({ a, b } = setup(T1, T2, { pick: 'w' }));
a.say({ t: 'start' }); await sleep(500);
st = a.last('state'); assert.equal(st.result.type, 'abort');

// --- odpojení: návrat v lhůtě partii zachová, jinak prohra
accs[T1].balance = 1000; accs[T2].balance = 1000;
({ a, b, code } = setup(T1, T2, { pick: 'w', time: 0 }));
a.say({ t: 'start' });
const sess = a.last('joined'); mv(a, 'e2', 'e4'); mv(b, 'e7', 'e5'); mv(a, 'd2', 'd4'); mv(b, 'd7', 'd5');
a.h.close();
assert.ok(b.last('state').dropIn > 0, 'soupeř vidí odpočet odpojení');
const a2 = client(); a2.say({ t: 'resume', code, token: sess.token });
assert.equal(a2.last('state').phase, 'play'); assert.equal(b.last('state').dropIn, null);
a2.h.close(); await sleep(350);
st = b.last('state'); assert.equal(st.result.type, 'opusteni'); assert.equal(st.result.winner, 'b');
assert.equal(accs[T2].balance, 2500);

console.log('šachy místnosti OK');
process.exit(0);
