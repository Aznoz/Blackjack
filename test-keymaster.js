'use strict';
/** Test serverové části Key Master: start za 100, postup po patrech, odměny, ochrany, obnova kreditu. */
process.env.TIME_SCALE = '0.04';
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto');
const PORT = 4600 + Math.floor(Math.random() * 300);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'keymaster-'));
const problems = []; const check = (c, m) => { if (!c) { problems.push(m); console.log('  !! ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tok = () => crypto.randomBytes(24).toString('base64url');
const call = async (a, body) => { const r = await fetch(`http://127.0.0.1:${PORT}/api/keymaster/${a}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
(async () => {
  const createKeymaster = require('./keymaster');
  const { ITEMS } = require('./stacker');
  // odehraje pokus s pevným „náhodným“ číslem: projde `levels` pater a pak vybere
  const play = async (rv, levels, acc = { key: 'k', balance: 1000, lastSeen: 0 }) => {
    const s = createKeymaster({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/, rand: () => rv });
    const st = s.handle('start', { token: 'x' }); const playId = st.json.playId;
    for (let t = 1; t <= levels; t++) { await sleep(t === 1 ? 60 : 60); const q = s.handle('stage', { token: 'x', playId, tier: t, hit: true }); if (q.status !== 200) return { q, acc, s, playId }; }
    await sleep(40);
    return { r: s.handle('claim', { token: 'x', playId }), acc, s, playId };
  };
  // --- ruleta coinů (váhy 45/40/30/20/10/4/1, součet 150)
  const cases = [[0, 0, 50], [0.29, 0, 50], [0.31, 1, 100], [0.55, 1, 100], [0.7, 2, 200], [0.85, 3, 300], [0.95, 4, 500], [0.99, 5, 1000], [0.998, 6, 2000]];
  for (const [rv, idx, amt] of cases) { const { r, acc } = await play(rv, 1); check(r && r.json.won && r.json.won.index === idx && r.json.won.amount === amt && acc.balance === 900 + amt, `ruleta rand=${rv}: ${JSON.stringify(r && r.json.won)}`); }
  // --- věcné odměny
  let u = await play(0.5, 2); check(u.r.json.won.type === 'small' && u.r.json.won.item >= 0 && u.r.json.won.item <= 8 && u.r.json.won.parts === 1 && u.acc.balance === 900 && u.acc.items[u.r.json.won.item] === 1, '2. patro = malá věc: ' + JSON.stringify(u.r.json.won));
  u = await play(0.99, 3); check(u.r.json.won.type === 'big' && u.r.json.won.item === 12 && u.r.json.won.need === 6, '3. patro = velká věc: ' + JSON.stringify(u.r.json.won));
  u = await play(0.00005, 3); check(u.r.json.won.type === 'big' && u.r.json.won.item === 13, 'vzácná věc (1 %): ' + JSON.stringify(u.r.json.won));
  { // vzácné věci jen na 3. patře
    const acc = { key: 'k2', balance: 100000, lastSeen: 0 };
    const s = createKeymaster({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/ });
    for (let n = 0; n < 24; n++) {
      const lv = n % 2 ? 2 : 3; const pid = s.handle('start', { token: 'x' }).json.playId;
      for (let t = 1; t <= lv; t++) { await sleep(55); s.handle('stage', { token: 'x', playId: pid, tier: t, hit: true }); }
      await sleep(30); const rr = s.handle('claim', { token: 'x', playId: pid });
      check(rr.status === 200, 'claim ' + rr.status);
      if (lv === 2 && rr.json.won.item > 8) check(false, 'malá odměna mimo skupinu');
    }
  }
  // --- ochrany postupu
  {
    const acc = { key: 'k3', balance: 1000, lastSeen: 0 };
    const s = createKeymaster({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/, rand: () => 0.5 });
    check(s.handle('stage', { token: 'x', playId: 1, tier: 1, hit: true }).status === 409, 'stage bez hry');
    check(s.handle('claim', { token: 'x', playId: 1 }).status === 409, 'claim bez hry');
    let pid = s.handle('start', { token: 'x' }).json.playId;
    check(s.handle('stage', { token: 'x', playId: pid, tier: 1, hit: true }).status === 409, 'patro hned po startu (moc rychle)');
    await sleep(60);
    check(s.handle('stage', { token: 'x', playId: pid, tier: 2, hit: true }).status === 409, 'přeskočení 1. patra');
    check(s.handle('stage', { token: 'x', playId: pid, tier: 0, hit: true }).status === 409, 'patro 0');
    check(s.handle('stage', { token: 'x', playId: pid + 9, tier: 1, hit: true }).status === 409, 'cizí hra');
    check(s.handle('claim', { token: 'x', playId: pid }).status === 409, 'claim bez potvrzeného patra');
    let q = s.handle('stage', { token: 'x', playId: pid, tier: 1, hit: true }); check(q.status === 200 && q.json.hit && q.json.level === 1, '1. patro potvrzeno');
    check(s.handle('stage', { token: 'x', playId: pid, tier: 1, hit: true }).status === 409, 'dvakrát totéž patro');
    check(s.handle('claim', { token: 'x', playId: pid }).status === 409, 'claim hned po patře (moc rychle)');
    await sleep(40);
    q = s.handle('claim', { token: 'x', playId: pid }); check(q.status === 200 && q.json.won.type === 'coin', 'claim po 1. patře');
    check(s.handle('claim', { token: 'x', playId: pid }).status === 409, 'dvojí vyplacení');
    check(s.handle('stage', { token: 'x', playId: pid, tier: 2, hit: true }).status === 409, 'stage po skončené hře');
    // netrefil: o všechno přicházíš
    const before = acc.balance; pid = s.handle('start', { token: 'x' }).json.playId; await sleep(60);
    s.handle('stage', { token: 'x', playId: pid, tier: 1, hit: true }); await sleep(80);
    q = s.handle('stage', { token: 'x', playId: pid, tier: 2, hit: false });
    check(q.status === 200 && q.json.lost && q.json.level === 1 && acc.balance === before - 100, 'netrefil 2. patro = nic: ' + JSON.stringify([q.json.lost, acc.balance, before]));
    check(s.handle('claim', { token: 'x', playId: pid }).status === 409, 'po prohře už nejde vybrat');
    // nová hra přepíše starou
    const pa = s.handle('start', { token: 'x' }).json.playId; const pb = s.handle('start', { token: 'x' }).json.playId; await sleep(60);
    check(s.handle('stage', { token: 'x', playId: pa, tier: 1, hit: true }).status === 409, 'stará hra');
    check(s.handle('stage', { token: 'x', playId: pb, tier: 1, hit: true }).status === 200, 'nová hra');
    // chudý hráč
    acc.balance = 50; check(s.handle('start', { token: 'x' }).status === 402, 'málo žetonů');
  }

  // --- HTTP
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR, TIME_SCALE: '0.04' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('běží') && r()));
  const t = tok();
  let r = await call('state', { token: t });
  check(r.s === 200 && r.j.balance === 5000 && r.j.price === 100 && r.j.coins.join() === '50,100,200,300,500,1000,2000' && r.j.items.length === ITEMS.length, 'počáteční stav: ' + JSON.stringify(r.j));
  check((await call('state', { token: 'x' })).s === 400, 'neplatný token přijat');
  r = await call('start', { token: t }); check(r.s === 200 && r.j.balance === 4900 && r.j.playId, 'start = 100: ' + JSON.stringify(r.j.balance));
  const pid = r.j.playId; await sleep(80);
  r = await call('stage', { token: t, playId: pid, tier: 1, hit: true }); check(r.s === 200 && r.j.level === 1, 'stage přes HTTP');
  await sleep(40);
  r = await call('claim', { token: t, playId: pid }); check(r.s === 200 && r.j.won.type === 'coin' && r.j.balance === 4900 + r.j.won.amount, 'claim přes HTTP: ' + JSON.stringify(r.j.won));
  // věc z Key Masteru se prodá přes Stacker (stejný inventář)
  const acc = await (async () => { for (let i = 0; i < 30; i++) { const p = (await call('start', { token: t })).j.playId; for (let k = 1; k <= 2; k++) { await sleep(70); await call('stage', { token: t, playId: p, tier: k, hit: true }); } await sleep(40); const c = await call('claim', { token: t, playId: p }); if (c.j.won && c.j.won.type === 'small' && c.j.won.need === 1) return c.j.won; } return null; })();
  if (acc) { const sr = await fetch(`http://127.0.0.1:${PORT}/api/stacker/sell`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, item: acc.item, count: 1 }) }); check(sr.status === 200, 'věc z Key Masteru jde prodat v Obchodu: ' + sr.status); }
  // opuštěný pokus nesmí blokovat obnovu kreditu
  const ab = tok(); for (let i = 0; i < 52; i++) await call('start', { token: ab });
  r = await call('state', { token: ab, fresh: true }); check(r.j.balance === 200 && r.j.refilled === true, 'obnova po opuštěné hře: ' + JSON.stringify([r.j.balance, r.j.refilled]));
  srv.kill('SIGTERM');
  console.log(problems.length ? 'SELHALO' : 'Všechny kontroly Key Masteru prošly.'); process.exit(problems.length ? 1 : 0);
})();
