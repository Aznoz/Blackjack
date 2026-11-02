'use strict';
/** Test serverové části Kola štěstí: cena, výsledky podle vah, bonusový roztoč, ochrany, výplata až po dotočení, obnova kreditu. */
process.env.TIME_SCALE = '0.04';
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto');
const M = 2; // násobek výher (viz MULT v wheel.js)
const PORT = 4900 + Math.floor(Math.random() * 300);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wheel-'));
const problems = []; const check = (c, m) => { if (!c) { problems.push(m); console.log('  !! ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tok = () => crypto.randomBytes(24).toString('base64url');
const call = async (a, body) => { const r = await fetch(`http://127.0.0.1:${PORT}/api/wheel/${a}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
(async () => {
  const createWheel = require('./wheel');
  const { WHEEL } = createWheel;
  // --- tabulky: 24 výsečí, váhy sedí, výseč existuje
  check(WHEEL.SLOTS.length === 24, 'počet výsečí');
  check(WHEEL.MAIN_W.reduce((a, t) => a + t.w, 0) === 1000, 'váhy hlavního kola = 1000');
  check(WHEEL.BONUS_W.reduce((a, t) => a + t.w, 0) === 1000, 'váhy bonusu = 1000');
  check(WHEEL.SLOTS.filter((s) => s.v === 10000 * M).length === 1 && WHEEL.SLOTS.filter((s) => s.star).length === 1, 'jackpot a hvězda mají po jedné výseči');
  for (let i = 0; i < 24; i++) check(WHEEL.SLOTS[i].v !== WHEEL.SLOTS[(i + 1) % 24].v, 'dvě stejné výseče vedle sebe: ' + i);
  { const w = createWheel({ resolveAccount: () => ({ acc: {} }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/ }); const e = w.expected();
    const main = e.main, bonus = e.bonus; const rtp = (main + 0.01 * bonus) / WHEEL.PRICE; console.log(`  návratnost ≈ ${(rtp * 100).toFixed(1)} %`); check(rtp > 0.8 * M && rtp < 0.97 * M, 'návratnost mimo rozumný rozsah ' + rtp); }
  // odehraje roztočení s pevným „náhodným“ číslem a sebere výhru
  const mk = (rv, acc) => createWheel({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/, rand: typeof rv === 'function' ? rv : () => rv });
  const fresh = () => ({ key: 'k', balance: 1000, lastSeen: 0 });
  // hranice vah: 0 -> 20, 0.31 -> 40 (po 305), 0.999 -> 10000
  const cases = [[0, 20], [0.3, 20], [0.31, 40], [0.52, 50], [0.67, 70], [0.78, 100], [0.88, 150], [0.94, 200], [0.97, 300], [0.985, 500], [0.9955, 1000], [0.9999, 10000]];
  for (const [rv, base] of cases) {
    const val = base * M;
    const acc = fresh(); const w = mk(rv, acc); const sp = w.handle('spin', { token: 'x' });
    check(sp.status === 200 && sp.json.value === val && acc.balance === 900, `rand=${rv}: ${JSON.stringify([sp.json.value, acc.balance])}`);
    check(WHEEL.SLOTS[sp.json.slot].v === val, `výseč odpovídá hodnotě ${val}`);
    check(acc.balance === 900, 'výhra se nepřipíše před dotočením');
    await sleep(200); const c = w.handle('collect', { token: 'x', spinId: sp.json.spinId });
    check(c.status === 200 && c.json.won.value === val && acc.balance === 900 + val, `výplata ${val}: ${acc.balance}`);
    check(w.handle('collect', { token: 'x', spinId: sp.json.spinId }).status === 409, 'dvojí vyplacení');
    if (base === 500) check(acc.wheelBonus === 1 && c.json.won.star && c.json.bonus === true, 'hvězda dá jackpotový roztoč');
    else check(!acc.wheelBonus, 'bez hvězdy žádný bonus');
  }
  // --- bonusový roztoč
  {
    const acc = { key: 'b', balance: 1000, lastSeen: 0, wheelBonus: 1 }; const w = mk(0.1, acc);
    check(w.handle('spin', { token: 'x' }).status === 409, 'při bonusu nejde platit běžný roztoč');
    check(acc.balance === 1000, 'zamítnutý spin nestrhne');
    const b = w.handle('bonus', { token: 'x' }); check(b.status === 200 && b.json.value === 200 * M && b.json.isBonus && acc.balance === 1000, 'bonus je zdarma: ' + JSON.stringify([b.json.value, acc.balance]));
    check(w.handle('bonus', { token: 'x' }).status === 409, 'druhý bonus před dotočením');
    await sleep(200); const c = w.handle('collect', { token: 'x', spinId: b.json.spinId });
    check(c.status === 200 && acc.balance === 1000 + 200 * M && !acc.wheelBonus && c.json.won.bonus === true, 'bonus vyplacen a spotřebován');
    check(w.handle('bonus', { token: 'x' }).status === 409, 'bonus bez nároku');
    // jackpot v bonusu
    const acc2 = { key: 'b2', balance: 1000, lastSeen: 0, wheelBonus: 1 }; const w2 = mk(0.99, acc2); const b2 = w2.handle('bonus', { token: 'x' });
    await sleep(200); const c2 = w2.handle('collect', { token: 'x', spinId: b2.json.spinId }); check(c2.json.won.value === 10000 * M && c2.json.won.jackpot && acc2.balance === 1000 + 10000 * M, 'jackpot z bonusu');
  }
  // --- ochrany
  {
    const acc = fresh(); const w = mk(0.1, acc);
    check(w.handle('collect', { token: 'x', spinId: 1 }).status === 409, 'collect bez roztočení');
    const sp = w.handle('spin', { token: 'x' });
    check(w.handle('collect', { token: 'x', spinId: sp.json.spinId }).status === 409, 'collect hned po roztočení (kolo se točí)');
    check(w.handle('spin', { token: 'x' }).status === 409, 'druhý spin před dotočením');
    check(w.handle('collect', { token: 'x', spinId: sp.json.spinId + 7 }).status === 409, 'cizí spinId');
    await sleep(200); check(w.handle('collect', { token: 'x', spinId: sp.json.spinId }).status === 200, 'collect po dotočení');
    acc.balance = 50; check(w.handle('spin', { token: 'x' }).status === 402, 'málo žetonů');
    check(createWheel({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /^a$/ }).handle('spin', { token: 'zz' }).status === 400, 'neplatný token');
    // opuštěné kolo se při novém načtení stránky připíše
    const a2 = fresh(); const w2 = mk(0.55, a2); w2.handle('spin', { token: 'x' });
    const st = w2.handle('state', { token: 'x', fresh: true }); check(st.json.settled && st.json.settled.value === 50 * M && a2.balance === 900 + 50 * M, 'nedotočené kolo se připíše: ' + JSON.stringify(st.json.settled));
  }
  // --- statistika: skutečná návratnost při velkém počtu roztočení
  {
    const acc = { key: 's', balance: 1e9, lastSeen: 0 }; const w = createWheel({ resolveAccount: () => ({ acc }), markDirty() {}, notifyBalance() {}, TOKEN_RE: /.+/, rand: Math.random });
    const orig = Date.now; let fake = orig(); Date.now = () => fake;
    let jackpots = 0, spent = 0; const N = 40000; const b0 = acc.balance;
    for (let i = 0; i < N; i++) {
      let r = acc.wheelBonus ? w.handle('bonus', { token: 'x' }) : w.handle('spin', { token: 'x' }); if (!r.json.isBonus) spent += 100;
      fake += 5000; const c = w.handle('collect', { token: 'x', spinId: r.json.spinId }); if (c.json.won.jackpot) jackpots++;
    }
    Date.now = orig; const rtp = (acc.balance - b0 + spent) / spent; console.log(`  simulace ${N}×: návratnost ${(rtp * 100).toFixed(1)} %, jackpotů ${jackpots}`);
    check(rtp > 0.78 * M && rtp < 1.0 * M, 'simulovaná návratnost ' + rtp);
  }
  // --- HTTP
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR, TIME_SCALE: '0.04' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('běží') && r()));
  const t = tok();
  let r = await call('state', { token: t });
  check(r.s === 200 && r.j.balance === 5000 && r.j.price === 100 && r.j.jackpot === 10000 * M && r.j.slots.length === 24 && r.j.bonus === false, 'počáteční stav: ' + JSON.stringify(r.j).slice(0, 200));
  check((await call('state', { token: 'x' })).s === 400, 'neplatný token přijat');
  r = await call('spin', { token: t }); check(r.s === 200 && r.j.balance === 4900 && r.j.spinId, 'spin přes HTTP');
  const sp = r.j; await sleep(250);
  r = await call('collect', { token: t, spinId: sp.spinId }); check(r.s === 200 && r.j.balance === 4900 + sp.value && r.j.won.value === sp.value, 'collect přes HTTP');
  // opuštěný pokus nesmí blokovat obnovu kreditu
  const ab = tok(); for (let i = 0; i < 52; i++) { const x = await call('spin', { token: ab }); if (x.s === 200) { await sleep(200); await call('collect', { token: ab, spinId: x.j.spinId }); } }
  r = await call('state', { token: ab, fresh: true }); check(r.j.balance >= 200, 'stav po sérii');
  // bonus přežije obnovení stránky
  let found = null; for (let i = 0; i < 4000 && !found; i++) { const tk = tok(); const x = await call('spin', { token: tk }); if (x.j.star) { found = { tk, x }; } else if (i % 1 === 0) { /* dál */ } }
  if (found) { const s2 = await call('state', { token: found.tk, fresh: true }); check(s2.j.settled && s2.j.settled.star && s2.j.bonus === true, 'hvězda se při novém načtení připíše a bonus zůstane: ' + JSON.stringify([s2.j.settled, s2.j.bonus])); const b = await call('bonus', { token: found.tk }); check(b.s === 200, 'bonus po obnovení stránky'); }
  srv.kill('SIGTERM');
  console.log(problems.length ? 'SELHALO' : 'Všechny kontroly Kola štěstí prošly.'); process.exit(problems.length ? 1 : 0);
})();
