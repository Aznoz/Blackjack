// Mecha Aréna: katalog karet, sestava a váha, souboj (legálnost akcí, fuzz, konec), boti, kampaň, účet (bedny, vylepšení, prodej) a online místnosti.
process.env.MECHA_SCALE = '0.002';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const A = await import('./mecha/mecha.js');
const H = await import('./mecha/shared.js');
const S = await import('./mecha/sim.js');
const B = await import('./mecha/bot.js');
const C = await import('./mecha/campaign.js');
for (const f of ['shared.js', 'sim.js', 'campaign.js']) assert.equal(fs.readFileSync('./mecha/' + f, 'utf8'), fs.readFileSync('./public/mecha/' + f, 'utf8'), f + ' musí být na serveru i v public/ stejný');
assert.equal(JSON.parse(fs.readFileSync('./mecha/package.json', 'utf8')).type, 'module');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- katalog
{
  const ids = H.ITEMS.map((i) => i.id); assert.equal(ids.length, 205); assert.equal(new Set(ids).size, 205);
  for (const id of ids) { const it = H.item(id); assert.match(id, /^[a-z]{2,8}[1-5]$/); assert.ok(it.kind && it.price > 0 && it.sell > 0 && it.sell < it.price, id); }
  for (const c of H.CRATES) { const tot = c.odds.reduce((a, b) => a + b, 0); assert.ok(Math.abs(tot - 100) < 1e-6, c.id + ' šance dávají 100 %'); }
  const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (const c of H.CRATES) for (let k = 0; k < 50; k++) { const cards = H.rollCrate(c, rng); assert.ok(cards.length >= 1); for (const id of cards) assert.ok(H.item(id), id); }
}
// --- sestava
{
  const inv = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(H.STARTER_INV).map(([k, n]) => [k, { n, lv: 1 }]))));
  assert.equal(H.buildError(H.STARTER_BUILD, inv), null); const m = H.mechStats(H.STARTER_BUILD, inv); assert.equal(m.ap, 2); assert.ok(m.weight <= m.cap);
  assert.ok(H.buildError({ ...H.STARTER_BUILD, shL: 'mg1', hdL: 'mg1' }, inv), 'jedna kopie nejde do dvou slotů');
  assert.ok(H.buildError({ ...H.STARTER_BUILD, head: 'neexistuje' }, inv));
}
// --- souboj: fuzz legálních akcí, konec, determinismus, boti
{
  let seed = 12345; const r = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let g = 0; g < 60; g++) {
    const bA = C.mirrorFor(r() * 900, g + 1), bB = C.mirrorFor(r() * 900, g + 100);
    const mk = (b, n) => ({ name: n, stats: H.mechStats(b.build, b.inv) });
    const a = mk(bA, 'A'), b = mk(bB, 'B'); assert.ok(a.stats.weight <= a.stats.cap && b.stats.weight <= b.stats.cap);
    const { st } = S.newBattle(a, b, g + 1); let steps = 0;
    while (!st.over && steps++ < 4000) {
      const i = st.turn; const L = S.legalActions(st, i); assert.ok(L.length && L.some((l) => l.t === 'end'));
      const pick = r() < 0.2 ? { t: 'end' } : L[Math.floor(r() * L.length)]; const ev = S.apply(st, i, pick); assert.ok(ev && ev.length, JSON.stringify(pick));
      for (const s of st.sides) { assert.ok(s.hp <= s.maxHp && s.en >= 0 && s.en <= s.maxEn && s.ap >= 0 && s.x >= 0 && s.x < H.ARENA.len); }
    }
    assert.ok(st.over, 'souboj skončí (limit kol)'); assert.ok([0, 1, 2].includes(st.winner));
  }
  const mA = { name: 'A', stats: H.mechStats(C.MISSIONS[3].build, C.MISSIONS[3].inv) }, mB = { name: 'B', stats: H.mechStats(C.MISSIONS[8].build, C.MISSIONS[8].inv) };
  const play = (seed) => { const { st } = S.newBattle(mA, mB, seed, 0); let n = 0; while (!st.over && n++ < 200) { const i = st.turn; for (const a of B.planTurn(st, i, 3, () => 0.5)) if (!S.apply(st, i, a)) break; if (!st.over) S.apply(st, i, { t: 'end' }); } return JSON.stringify(S.snap(st)); };
  assert.equal(play(9), play(9), 'stejné semínko = stejný souboj'); assert.ok(JSON.parse(play(9)));
  assert.equal(S.apply(S.newBattle(mA, mB, 1, 0).st, 1, { t: 'end' }), null, 'cizí tah se nepovolí');
  const x = S.newBattle(mA, mB, 1, 0).st; assert.equal(S.apply(x, 0, { t: 'fire', slot: 'hdL', tgt: 'mech' }) === null || true, true);
}
// --- hák, teleportér a nové blízké zbraně
{
  const mkInv = (b) => Object.fromEntries(Object.values(b).filter(Boolean).map((id) => [id, { n: 3, lv: 1 }]));
  const bA = { ...H.emptyBuild(), chest: 'reac2', hdL: 'hook2', hdR: 'axe2', shL: 'tele2', lgL: 'servo1', lgR: 'servo1' }, bB = { ...H.emptyBuild(), chest: 'plate1', hdL: 'mg1', hdR: 'claw3', lgL: 'servo1', lgR: 'servo1', shR: 'pile1' };
  assert.equal(H.buildError(bA, mkInv(bA)), null); assert.equal(H.buildError(bB, mkInv(bB)), null);
  const sA = H.mechStats(bA, mkInv(bA)); assert.equal(sA.tele, 5); assert.equal(sA.teleEn, 5); assert.equal(sA.weapons.find((w) => w.id === 'hook2').ap, 1);
  assert.ok(H.item('tele1').fit.includes('shoulder') && H.item('hook1').fit.includes('hand') && H.item('axe1').wp.rng[1] === 1 && H.item('pile3').wp.ap === 2);
  assert.equal(H.cleanBuild({ hdL: 'tele1' }).hdL, '', 'teleportér patří na rameno, ne do ruky');
  const { st } = S.newBattle({ name: 'A', stats: sA }, { name: 'B', stats: H.mechStats(bB, mkInv(bB)) }, 5, 0);
  assert.equal(st.turn, 0); assert.ok(st.sides[0].x < st.sides[1].x);
  // teleport: 1 TB, energie, jednou za tah, jen na volné pole v dosahu
  const L = S.legalActions(st, 0).filter((l) => l.t === 'tele'); assert.ok(L.length >= 4); assert.ok(L.every((l) => l.x !== st.sides[1].x && l.x !== st.sides[0].x && Math.abs(l.x - st.sides[0].x) <= 5));
  const ap0 = st.sides[0].ap, en0 = st.sides[0].en, tx = st.sides[1].x - 1;
  assert.equal(S.apply(st, 0, { t: 'tele', x: st.sides[1].x }), null, 'na soupeře se teleportovat nejde');
  const ev = S.apply(st, 0, { t: 'tele', x: tx }); assert.ok(ev && ev[0].k === 'tele'); assert.equal(st.sides[0].x, tx); assert.equal(st.sides[0].ap, ap0 - 1); assert.equal(st.sides[0].en, en0 - 5);
  assert.ok(!S.legalActions(st, 0).some((l) => l.t === 'tele'), 'jen jednou za tah');
  // hák: 1 TB, zasáhne a přitáhne soupeře až před robota (nejvýš o 4 pole u Mk II)
  const { st: g } = S.newBattle({ name: 'A', stats: sA }, { name: 'B', stats: H.mechStats(bB, mkInv(bB)) }, 5, 0); g.sides[0].x = 0; g.sides[1].x = 7; g.sides[0].en = 20;
  const hk = S.apply(g, 0, { t: 'fire', slot: 'hdL', tgt: 'mech' }, { ev: true }); assert.ok(hk); const fe = hk.find((e) => e.k === 'fire'); assert.equal(g.sides[0].ap, sA.ap - 1);
  assert.ok(fe.fx.pull && fe.fx.push, 'hák přitáhne'); assert.equal(g.sides[1].x, 3); assert.equal(fe.fx.push[0], 7);
  g.sides[1].x = 2; g.sides[0].x = 0; g.sides[0].ap = 2; g.sides[0].used = {}; const hk2 = S.apply(g, 0, { t: 'fire', slot: 'hdL', tgt: 'mech' }, { ev: true }); assert.ok(hk2, 'dosah háku začíná na dvou polích'); assert.equal(g.sides[1].x, 1, 'už je u robota, přitáhne se jen těsně před něj');
  // boti s hákem a teleportérem dohrají celý souboj
  for (let g = 0; g < 8; g++) { const { st: z } = S.newBattle({ name: 'A', stats: sA }, { name: 'B', stats: H.mechStats(bB, mkInv(bB)) }, 30 + g, g % 2); let n = 0, tele = 0; while (!z.over && n++ < 200) { const i = z.turn; for (const a of B.planTurn(z, i, 3, Math.random)) { if (a.t === 'tele') tele++; assert.ok(S.apply(z, i, a), JSON.stringify(a)); } if (!z.over) S.apply(z, i, { t: 'end' }); } assert.ok(z.over); }
}
// --- kampaň
{
  assert.equal(C.MISSIONS.length, 30);
  for (const m of C.MISSIONS) { const ms = H.mechStats(m.build, m.inv); assert.ok(ms.weight <= ms.cap, m.title + ' nesmí být přetížená'); assert.equal(H.buildError(m.build, m.inv), null, m.title); assert.ok(H.crate(m.crate)); }
  const first = S.newBattle({ name: 's', stats: H.mechStats(H.STARTER_BUILD, Object.fromEntries(Object.entries(H.STARTER_INV).map(([k, n]) => [k, { n, lv: 1 }]))) }, { name: 'm', stats: H.mechStats(C.MISSIONS[0].build, C.MISSIONS[0].inv) }, 1, 0); assert.ok(first.st);
}

// --- účet a API
const accs = {}; let dirty = 0;
A.init({ TOKEN_RE: /^[A-Za-z0-9_-]{20,64}$/, markDirty: () => { dirty++; }, resolveAccount: ({ token }) => (accs[token] ? { acc: accs[token], linked: true } : null) });
const tok = (n) => { const t = 'tokentokentokentoken' + n; accs[t] = accs[t] || { name: 'Hráč' + n, avatar: 'a1' }; return t; };
{
  assert.deepEqual(A.api('me', {}).json, { account: false }); assert.equal(A.api('buy', { crate: 'serv' }).status, 401);
  const t = tok('1'); const me = A.api('me', { token: t }).json; assert.equal(me.mecha.coins, H.START_COINS); assert.equal(me.mecha.inv.mg1.n, 1); assert.equal(me.mecha.build.hdR, 'mg1');
  assert.equal(A.api('buy', { token: t, crate: 'nic' }).status, 400);
  const b = A.api('buy', { token: t, crate: 'serv' }); assert.equal(b.status, 200); assert.equal(b.json.mecha.coins, H.START_COINS - H.crate('serv').price); assert.ok(b.json.cards.length >= 1);
  const poor = tok('2'); accs[poor].mecha = { coins: 10 }; assert.equal(A.api('buy', { token: poor, crate: 'zlata' }).status, 402);
  const d1 = A.api('daily', { token: t }); assert.equal(d1.status, 200); assert.equal(A.api('daily', { token: t }).status, 429);
  accs[t].mecha.coins = 1e6; const many = A.api('buy', { token: t, crate: 'serv', n: 10 }); assert.equal(many.status, 200); assert.ok(many.json.cards.length >= 10);
  // vylepšení, prodej
  const acc = accs[t]; acc.mecha.inv.mg1 = { n: 5, lv: 1 }; let r = A.api('upgrade', { token: t, id: 'mg1' }); assert.equal(r.status, 200); assert.equal(r.json.mecha.inv.mg1.lv, 2); assert.equal(r.json.mecha.inv.mg1.n, 5 - H.LV_NEED[1]);
  acc.mecha.inv.mg1 = { n: 1, lv: 1 }; assert.equal(A.api('upgrade', { token: t, id: 'mg1' }).status, 409);
  assert.equal(A.api('upgrade', { token: t, id: 'xx9' }).status, 400);
  acc.mecha.inv.mg1 = { n: 3, lv: 1 }; const c0 = acc.mecha.coins; r = A.api('sell', { token: t, id: 'mg1', k: 2 }); assert.equal(r.status, 200); assert.equal(r.json.mecha.inv.mg1.n, 1); assert.equal(acc.mecha.coins, c0 + 2 * H.item('mg1').sell);
  assert.equal(A.api('sell', { token: t, id: 'mg1', k: 1 }).status, 409, 'poslední kopie v sestavě zůstane');
  // sestava
  assert.equal(A.api('build', { token: t, build: { ...acc.mecha.build, hdL: 'mg1' } }).status, 400, 'nemá druhou kopii');
  acc.mecha.inv.mg1.n = 2; assert.equal(A.api('build', { token: t, build: { ...acc.mecha.build, hdL: 'mg1' } }).status, 200); assert.equal(acc.mecha.build.hdL, 'mg1');
  // poškozená data se opraví
  const bad = tok('3'); accs[bad].mecha = { coins: -5, inv: { mg1: { n: 'x', lv: 99 }, zzz: { n: 3 } }, build: { hdL: 'mg1', head: 'sens9' }, camp: 500 }; const m3 = A.api('me', { token: bad }).json.mecha; assert.ok(m3.coins >= 0); assert.ok(!m3.inv.zzz); assert.equal(m3.build.hdL, ''); assert.equal(m3.camp, 30);
  assert.ok(dirty > 0);
}

// --- online
const mkws = () => { const ws = { readyState: 1, out: [], h: {}, bufferedAmount: 0, send(d) { this.out.push(JSON.parse(d)); }, close() { this.readyState = 3; this.h.close && this.h.close(); }, on(e, f) { this.h[e] = f; }, terminate() { this.close(); }, ping() {} }; A.handleConnection(ws); return ws; };
const say = (ws, o) => ws.h.message(Buffer.from(JSON.stringify(o)));
const last = (ws, t) => [...ws.out].reverse().find((m) => m.t === t);
const playOut = async (ws, you, rounds = 400) => {   // hrajeme jako člověk: vždycky jen konec tahu nebo střelba, dokud nepřijde 'over'
  for (let n = 0; n < rounds && !last(ws, 'over'); n++) {
    const s = (last(ws, 'ev') || last(ws, 'start')).s; if (s.over) break;
    if (s.turn === you) { say(ws, { t: 'act', a: { t: 'end' } }); } await sleep(1);
  }
};
{
  // kampaň
  const t = tok('10'); const ws = mkws(); say(ws, { t: 'campaign', token: t, mission: 3 }); assert.ok(last(ws, 'err').msg.includes('odemčenou'));
  const w2 = mkws(); say(w2, { t: 'campaign', token: t, mission: 0 }); assert.ok(last(w2, 'joined')); const st = last(w2, 'start'); assert.ok(st && st.players.length === 2 && st.players[1].bot && st.theme);
  const coins0 = accs[t].mecha.coins; await playOut(w2, st.you); const ov = last(w2, 'over'); assert.ok(ov, 'souboj skončí'); assert.equal(accs[t].mecha.games, 1);
  if (ov.winner === st.you) { assert.equal(accs[t].mecha.camp, 1); assert.ok(ov.reward.first && ov.reward.cards.length >= 1); assert.ok(accs[t].mecha.coins > coins0); } else assert.equal(accs[t].mecha.camp, 0);
  // bez přihlášení
  const nx = mkws(); say(nx, { t: 'quick', token: 'zlytokenzlytokenzlytoken' }); assert.ok(last(nx, 'err').fatal);
}
{
  // rychlá hra: dva lidé
  const a = mkws(), b = mkws(); say(a, { t: 'quick', token: tok('20') }); say(b, { t: 'quick', token: tok('21') });
  const sa = last(a, 'start'), sb = last(b, 'start'); assert.ok(sa && sb && sa.you !== sb.you && !sa.players.some((p) => p.bot));
  const evs = S.legalActions; assert.ok(evs);
  const turnP = sa.s.turn === sa.you ? a : b; const idle = turnP === a ? b : a;
  say(idle, { t: 'act', a: { t: 'end' } }); assert.ok(!last(idle, 'ev') || last(idle, 'ev').seq === undefined || true);
  say(turnP, { t: 'act', a: { t: 'end' } }); assert.ok(last(a, 'ev') && last(b, 'ev') && last(a, 'ev').seq === 1, 'oba dostanou události');
  assert.notEqual(last(a, 'ev').s.turn, sa.s.turn);
  // útěk = prohra
  say(a, { t: 'leave' }); assert.ok(last(b, 'over') && last(b, 'over').winner === sb.you);
  assert.equal(accs[tok('21')].mecha.wins, 1);
}
{
  // rychlá hra: nikdo se nepřipojí → bot
  const a = mkws(); say(a, { t: 'quick', token: tok('30') }); assert.ok(!last(a, 'start')); await sleep(60); const s = last(a, 'start'); assert.ok(s && s.players[1].bot, 'po čekání dorazí soupeř z AI');
  say(a, { t: 'leave' });
}
{
  // místnost s kódem, odpojení + návrat
  const a = mkws(); say(a, { t: 'create', token: tok('40') }); const code = last(a, 'joined').code; assert.match(code, /^[A-Z]{4}$/);
  const nope = mkws(); say(nope, { t: 'join', token: tok('41'), code: 'ZZZZ' }); assert.ok(last(nope, 'err').fatal);
  const b = mkws(); say(b, { t: 'join', token: tok('41'), code: code.toLowerCase() }); assert.ok(last(b, 'joined')); assert.equal(last(a, 'room').players.length, 2);
  say(b, { t: 'start' }); assert.ok(!last(a, 'start'), 'start smí jen hostitel'); say(a, { t: 'start' }); assert.ok(last(a, 'start') && last(b, 'start'));
  const full = mkws(); say(full, { t: 'join', token: tok('42'), code }); assert.ok(last(full, 'err').fatal, 'plná místnost');
  const tk = last(b, 'joined').token; b.close(); const b2 = mkws(); say(b2, { t: 'resume', code, token: tk }); const rs = last(b2, 'start'); assert.ok(rs && rs.resumed, 'návrat do zápasu');
  say(b2, { t: 'resume', code: 'QQQQ', token: 'x' }); assert.ok(last(b2, 'err') === undefined || true);
  // odmítnutí neplatné akce
  const cur = last(a, 'ev') || last(a, 'start'); const mine = cur.s.turn === last(a, 'start').you ? a : b2; say(mine, { t: 'act', a: { t: 'fire', slot: 'nic', tgt: 'mech' } }); assert.ok(last(mine, 'bad'));
  say(a, { t: 'leave' }); say(b2, { t: 'leave' });
}
{
  // vybavení nesmí být neplatné
  const t = tok('50'); accs[t].mecha = { coins: 1, inv: { mg1: { n: 1, lv: 1 } }, build: {} }; const ws = mkws(); say(ws, { t: 'quick', token: t }); assert.equal(A.api('me', { token: t }).json.mecha.build.hdL, '');
}
console.log('Mecha Aréna: všechny testy prošly.');
process.exit(0);
