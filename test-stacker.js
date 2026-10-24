'use strict';
/** Test serverové části Stacker: start za 200, odměny za úrovně, ruleta, ochrany, obnova kreditu. */
process.env.TIME_SCALE = '0.04';
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto');
const PORT = 4200 + Math.floor(Math.random() * 300);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stacker-'));
const problems = []; const check = (c, m) => { if (!c) { problems.push(m); console.log('  !! ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tok = () => crypto.randomBytes(24).toString('base64url');
const call = async (a, body) => { const r = await fetch(`http://127.0.0.1:${PORT}/api/stacker/${a}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
(async () => {
  // --- losování rulety s pevným „náhodným“ číslem (váhy 50/40/30/20/10/5, součet 155) ---
  const createStacker = require('./stacker');
  const pickWith = async (rv, level = 1) => {
    const acc = { key: 'k', balance: 1000, lastSeen: 0 };
    const s = createStacker({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/, rand: () => rv });
    s.handle('start', { token: 'x' }); await sleep(400);
    const r = s.handle('claim', { token: 'x', playId: 1, level }); return { r, acc };
  };
  const cases = [[0, 0, 100], [0.2, 0, 100], [0.33, 1, 200], [0.6, 2, 500], [0.8, 3, 750], [0.95, 4, 1000], [0.99, 5, 2000]];
  for (const [rv, idx, amt] of cases) { const { r, acc } = await pickWith(rv); check(r.json.won.index === idx && r.json.won.amount === amt && acc.balance === 800 + amt, `ruleta rand=${rv}: ${JSON.stringify(r.json.won)}`); }
  let u = await pickWith(0.5, 2); check(u.r.json.won.type === 'small' && u.r.json.won.index === 2 && u.r.json.won.item === 2 && u.r.json.won.need === 2 && u.r.json.won.parts === 1 && u.acc.balance === 800, 'malá věcná odměna: ' + JSON.stringify(u.r.json.won));
  u = await pickWith(0.99, 3); check(u.r.json.won.type === 'big' && u.r.json.won.index === 3 && u.r.json.won.item === 12 && u.r.json.won.need === 6, 'velká věcná odměna: ' + JSON.stringify(u.r.json.won));
  u = await pickWith(0.00005, 3); check(u.r.json.won.type === 'big' && u.r.json.won.item === 13 && u.r.json.won.index === 4, 'vzácná věc (1 %): ' + JSON.stringify(u.r.json.won));
  u = await pickWith(0.0000000005, 3); check(u.r.json.won.item === 13, 'vzácná věc má přednost: ' + JSON.stringify(u.r.json.won));
  { // vzácné věci padají jen na 3. úrovni, malá odměna je vždy z prvních devíti
    const acc = { key: 'k2', balance: 100000, lastSeen: 0 };
    const s = createStacker({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/ });
    const seen = new Set(); let rare = 0;
    for (let n = 0; n < 30; n++) { s.handle('start', { token: 'x' }); await sleep(2); const lvl = n % 2 ? 2 : 3; const rr = await new Promise((res) => setTimeout(() => res(s.handle('claim', { token: 'x', playId: n + 1, level: lvl })), 400)); if (rr.json.won) { seen.add(rr.json.won.item); if (rr.json.won.item >= 13) rare++; if (lvl === 2 && rr.json.won.item > 8) check(false, 'malá odměna mimo skupinu'); } }
    check(rare < 10, 'vzácných věcí je moc: ' + rare);
    // prodej: potřeba dílů
    acc.items = [0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]; acc.balance = 1000;
    let q = s.handle('sell', { token: 'x', item: 4 }); check(q.status === 409, 'prodej bez dílů');
    q = s.handle('sell', { token: 'x', item: 1 }); check(q.status === 200 && q.json.sold.amount === 1000 && acc.items[1] === 1 && acc.balance === 2000, 'prodej 1× (potřeba 2, máš 3): ' + JSON.stringify(q.json.sold));
    q = s.handle('sell', { token: 'x', item: 1 }); check(q.status === 409, 'zbyl jen 1 díl');
    q = s.handle('sell', { token: 'x', item: 18 }); check(q.status === 200 && q.json.sold.amount === 300000 && acc.balance === 302000 && acc.items[18] === 0, 'prodej vzácné věci');
    q = s.handle('sell', { token: 'x', item: 99 }); check(q.status === 400, 'neznámá věc');
  }

  { // power-upy po neúspěšném zastavení: konec 45 %, srdíčko 20 %, +1 30 %, pád 5 %
    const pw = async (rv, rows) => {
      const acc = { key: 'kp', balance: 1000, lastSeen: 0 };
      const s = createStacker({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/, rand: () => rv });
      s.handle('start', { token: 'x' }); await sleep(400);
      return { s, acc, r: s.handle('power', { token: 'x', playId: 1, rows }) };
    };
    let q = await pw(0.1, 5); check(q.r.json.power === 'end' && !q.r.json.won, 'power konec: ' + JSON.stringify(q.r.json.power));
    q = await pw(0.5, 5); check(q.r.json.power === 'heart' && !q.r.json.won && q.s.handle('power', { token: 'x', playId: 1, rows: 5 }).status === 200, 'srdíčko nechá hru běžet');
    q = await pw(0.5, 5); check(q.s.handle('claim', { token: 'x', playId: 1, level: 1 }).status === 200, 'po srdíčku jde dál vybrat odměnu');
    q = await pw(0.8, 5); check(q.r.json.power === 'plus' && q.r.json.level === 1 && q.r.json.row === 6 && q.r.json.won.type === 'coin' && q.acc.balance > 800, '+1 z 5 řad = coiny: ' + JSON.stringify(q.r.json.won));
    check(q.s.handle('power', { token: 'x', playId: 1, rows: 5 }).status === 409, 'po výhře hra skončila');
    q = await pw(0.8, 9); check(q.r.json.level === 2 && q.r.json.won.type === 'small', '+1 z 9 řad = malá odměna');
    q = await pw(0.8, 15); check(q.r.json.level === 3 && q.r.json.won.type === 'big', '+1 z 15 řad = velká odměna');
    q = await pw(0.8, 2); check(q.r.json.power === 'plus' && q.r.json.level === 0 && !q.r.json.won, '+1 mimo úroveň = konec bez výhry');
    q = await pw(0.97, 9); check(q.r.json.power === 'fall' && q.r.json.level === 1 && q.r.json.row === 6 && q.r.json.won.type === 'coin', 'pád z 9 řad na coiny: ' + JSON.stringify(q.r.json));
    q = await pw(0.97, 12); check(q.r.json.level === 2 && q.r.json.row === 10 && q.r.json.won.type === 'small', 'pád z 12 řad na malou odměnu');
    q = await pw(0.97, 3); check(q.r.json.power === 'fall' && q.r.json.level === 0 && !q.r.json.won, 'pád bez úrovně pod sebou = konec');
    q = await pw(0.8, 16); check(q.r.status === 400, 'neplatná výška');
    const acc2 = { key: 'kq', balance: 1000, lastSeen: 0 }; const s2 = createStacker({ resolveAccount: () => ({ acc: acc2 }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/, rand: () => 0.8 });
    s2.handle('start', { token: 'x' }); check(s2.handle('power', { token: 'x', playId: 1, rows: 15 }).status === 409, 'power příliš brzy po startu');
  }

  // --- HTTP ---
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR, TIME_SCALE: '0.04' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('běží') && r()));
  const t = tok();
  let r = await call('state', { token: t });
  check(r.s === 200 && r.j.balance === 5000 && r.j.price === 200 && r.j.rows === 16 && r.j.big === 10 && r.j.cols === 9 && r.j.coins.join() === '100,200,500,750,1000,2000', 'počáteční stav: ' + JSON.stringify(r.j));
  check((await call('state', { token: 'x' })).s === 400, 'neplatný token přijat');
  check((await call('claim', { token: t, playId: 1, level: 1 })).s === 409, 'výhra bez spuštěné hry');
  r = await call('start', { token: t }); check(r.s === 200 && r.j.balance === 4800 && r.j.playId, 'start = 200: ' + JSON.stringify(r.j));
  const pid = r.j.playId;
  check((await call('claim', { token: t, playId: pid, level: 1 })).s === 409, 'výhra okamžitě po startu (moc rychle)');
  check((await call('claim', { token: t, playId: pid + 5, level: 1 })).s === 409, 'cizí hra');
  await sleep(150);
  check((await call('claim', { token: t, playId: pid, level: 9 })).s === 400, 'neznámá úroveň');
  check((await call('claim', { token: t, playId: pid, level: 3 })).s === 409, 'úroveň 3 po krátké době hry (min. doba)');
  r = await call('claim', { token: t, playId: pid, level: 1 });
  check(r.s === 200 && r.j.won.type === 'coin' && [100, 200, 500, 750, 1000, 2000].includes(r.j.won.amount) && r.j.balance === 4800 + r.j.won.amount, 'výhra 1. úrovně: ' + JSON.stringify(r.j.won));
  check((await call('claim', { token: t, playId: pid, level: 1 })).s === 409, 'dvojí vyplacení');
  // konec bez výhry
  r = await call('start', { token: t }); const bal = r.j.balance; const p2 = r.j.playId;
  r = await call('end', { token: t, playId: p2 }); check(r.s === 200 && r.j.balance === bal, 'konec bez výhry nic nevrací');
  check((await call('claim', { token: t, playId: p2, level: 1 })).s === 409, 'výhra po skončené hře');
  // nová hra přepíše starou
  r = await call('start', { token: t }); const pa = r.j.playId; r = await call('start', { token: t }); const pb = r.j.playId; await sleep(150);
  check((await call('claim', { token: t, playId: pa, level: 1 })).s === 409, 'výhra ze staré hry');
  check((await call('claim', { token: t, playId: pb, level: 1 })).s === 200, 'výhra z nové hry');
  // chudý hráč: obnova kreditu na 200 a hra jde hrát
  const poor = tok(); let n = 0;
  while (n++ < 40) { const s = await call('start', { token: poor }); if (s.s !== 200) break; await call('end', { token: poor, playId: s.j.playId }); }
  r = await call('state', { token: poor }); check(r.j.balance >= 0 && r.j.balance <= 200, 'chudý hráč: ' + r.j.balance);
  r = await call('start', { token: poor }); check(r.s === 200 || r.s === 402, 'start chudého hráče');
  const empty = tok(); let last;
  for (let i = 0; i < 25; i++) { const s2 = await call('start', { token: empty }); if (s2.s === 200) last = await call('end', { token: empty, playId: s2.j.playId }); }
  check(last.j.balance === 200 && last.j.refilled === true, 'obnova na 200 po posledním pokusu: ' + JSON.stringify([last.j.balance, last.j.refilled]));
  // opuštěný pokus (zavřená stránka) nesmí blokovat obnovu kreditu
  const ab = tok(); for (let i = 0; i < 25; i++) await call('start', { token: ab }); // zůstatek 0, rozehraná hra
  r = await call('state', { token: ab, fresh: true }); check(r.j.balance === 200 && r.j.refilled === true, 'obnova po opuštěné hře: ' + JSON.stringify([r.j.balance, r.j.refilled]));
  srv.kill('SIGTERM');
  console.log(problems.length ? 'SELHALO' : 'Všechny kontroly Stackeru prošly.'); process.exit(problems.length ? 1 : 0);
})();
