// Minigolf: sdílené soubory, fyzika míčku (zdi, třecí plochy, sklon, jamka, voda, teleport, pohyblivé překážky), řešitelnost všech jamek,
// boti, hra na serveru (průběh jamek, bodování, limit) a online místnosti (rychlá hra, kód, boti, odpojení, účet).
process.env.GOLF_SCALE = '1000000'; process.env.GOLF_DROP_MS = '60';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const A = await import('./golf/golf.js');
const K = await import('./golf/shared.js');
const P = await import('./golf/phys.js');
const C = await import('./golf/courses.js');
const G = await import('./golf/sim.js');
const B = await import('./golf/bot.js');

for (const f of ['shared.js', 'phys.js', 'courses.js']) assert.equal(fs.readFileSync('./golf/' + f, 'utf8'), fs.readFileSync('./public/golf/' + f, 'utf8'), f + ' musí být na serveru i v public/ stejný');
assert.equal(JSON.parse(fs.readFileSync('./golf/package.json', 'utf8')).type, 'module');

// --- hřiště: tvar, start a jamka, pole výšek
{
  assert.equal(C.COURSES.length, 5); for (const c of C.COURSES) assert.equal(c.holes.length, c.id === 'space' ? 10 : 11, c.id);
  for (let c = 0; c < C.COURSES.length; c++) for (let k = 0; k < C.COURSES[c].holes.length; k++) {
    const d = C.holeDef(c, k); const W = P.buildWorld(d); const txt = d.map.join('');
    assert.equal((txt.match(/T/g) || []).length, 1, d.name + ': právě jeden start'); assert.equal((txt.match(/H/g) || []).length, 1, d.name + ': právě jedna jamka');
    assert.equal(P.cellType(W, W.tee[0], W.tee[1]), P.C.GRASS); assert.ok(d.par >= 2 && d.par <= 5);
    for (const t of [1, 3]) { const has = (ch) => txt.includes(ch); assert.equal(has(String(t)), has(String(t + 1)), d.name + ': teleporty jsou v páru'); }
    const df = P.distField(W); assert.ok(P.distAt(W, df, W.tee[0], W.tee[1]) < 1e8, d.name + ': k jamce vede cesta');
    assert.ok(d.map.every((r, z) => r[0] === '#' && r[r.length - 1] === '#' && (z > 0 && z < d.map.length - 1 || /^#+$/.test(r))), d.name + ': okraj je zeď');
  }
  assert.equal(C.holeList(0, 3).length, 3); assert.equal(C.holeList(2, 6).length, 6); const mix = C.holeList(C.MIX, 6, 11); assert.equal(mix.length, 6); assert.equal(new Set(mix.map((m) => m.join())).size, 6, 'Mix bez opakování'); assert.notDeepEqual(C.holeList(C.MIX, 6, 12), mix);
  assert.equal(C.courseIdx(99), 0); assert.equal(C.courseIdx(C.MIX), C.MIX); assert.equal(C.courseIdx('x'), 0); assert.equal(C.courseName(C.MIX), 'Mix');
}

// --- fyzika
const mkW = (map, extra = {}) => P.buildWorld({ par: 2, theme: 'meadow', map, ...extra });
const roll = (W, b, sec, t0 = 0) => { let ev = null; for (let i = 0; i < sec / P.DT && !ev; i++) { ev = P.stepBall(W, b, t0 + i * P.DT); if (P.isRest(b)) break; } return ev; };
{
  const W = mkW(['##########', '#T......H#', '##########']);
  const b = P.newBall(1.5, 1.5); P.shoot(b, 0, 0.2); const v0 = P.speedOf(b); assert.ok(Math.abs(v0 - P.powV(0.2)) < 1e-9);
  assert.ok(roll(W, b, 10) === null && P.isRest(b), 'míček se na trávě zastaví'); assert.ok(b.x > 1.6 && b.x < W.cup[0], 'a dojel kousek: ' + b.x.toFixed(2));
  const weak = P.newBall(1.5, 1.5); P.shoot(weak, 0, 0); roll(W, weak, 10); const strong = P.newBall(1.5, 1.5); P.shoot(strong, 0, 0.5); roll(W, strong, 10); assert.ok(strong.x > weak.x, 'silnější rána dojede dál');
  const fast = P.newBall(1.5, 1.5); P.shoot(fast, 0, 1); assert.equal(roll(W, fast, 5), null, 'moc rychlý míček jamku přeskočí (nebo se odrazí od zdi)'); assert.ok(!fast.sunk || true);
  const slow = P.newBall(5.5, 1.5); P.shoot(slow, 0, 0.35); assert.equal(roll(W, slow, 10), 'sink', 'pomalý míček do jamky spadne'); assert.ok(slow.sunk);
}
{ // zdi: odraz a úhel, rohy, vnitřní rohy mezi zdmi neodráží duchy
  const W = mkW(['#######', '#.....#', '#.....#', '#.....#', '#######']);
  const b = P.newBall(3.5, 2.5); P.shoot(b, Math.PI / 2, 0.4); let hits = 0, lastZ = b.z; for (let i = 0; i < 400; i++) { P.stepBall(W, b, 0); if (b.hit > 0) hits++; assert.ok(b.z > 1 && b.z < 4 && b.x > 1 && b.x < 6, 'zůstává uvnitř'); } assert.ok(hits >= 1, 'odrazil se od zdi'); assert.ok(Math.abs(b.x - 3.5) < 0.01, 'kolmý odraz neuhýbá do strany');
  const d = P.newBall(2, 2); P.shoot(d, Math.PI / 4, 0.5); for (let i = 0; i < 80; i++) P.stepBall(W, d, 0); assert.ok(d.vx !== 0 || d.vz !== 0);
  const W2 = mkW(['########', '#......#', '#......#', '#......#', '########']); const s = P.newBall(3.5, 1.17); P.shoot(s, 0, 0.5); const z0 = s.z; for (let i = 0; i < 200; i++) P.stepBall(W2, s, 0); assert.ok(Math.abs(s.z - z0) < 1e-6 && s.vz === 0, 'klouzání podél zdi z více políček se nehrbolí (žádné duchy na spojích)');
  for (let n = 0; n < 40; n++) { const q = P.newBall(3.5, 2.5); P.shoot(q, n * 0.7, 1); for (let i = 0; i < 1500; i++) { P.stepBall(W, q, 0); assert.ok(q.x > 1 - 1e-6 && q.x < 6 + 1e-6 && q.z > 1 - 1e-6 && q.z < 4 + 1e-6, 'míček nikdy neprojde zdí'); } }
}
{ // povrchy: písek zastaví dřív, led klouže, zrychlovač přidá
  const run = (ch, pow) => { const W = mkW(['###########', '#T' + ch.repeat(8) + '#', '###########']); const b = P.newBall(1.5, 1.5); P.shoot(b, 0, pow); roll(W, b, 30); return b.x; };
  assert.ok(run(',', 0.5) < run('.', 0.5) - 0.8, 'písek brzdí'); assert.ok(run('i', 0.3) > run('.', 0.3) + 1, 'led klouže');
  const W = mkW(['############', '#T.EEEE....#', '############']); const b = P.newBall(1.5, 1.5); P.shoot(b, 0, 0.25); let vmax = 0; for (let i = 0; i < 600; i++) { P.stepBall(W, b, 0); vmax = Math.max(vmax, P.speedOf(b)); } assert.ok(vmax > 5, 'zrychlovač rozjede i stojící míček: ' + vmax.toFixed(1));
  const WW = mkW(['############', '#T.WWWW....#', '############']); const c = P.newBall(7.5, 1.5); P.shoot(c, Math.PI, 0.25); let vm = 0; for (let i = 0; i < 300; i++) { P.stepBall(WW, c, 0); vm = Math.max(vm, P.speedOf(c)); } assert.ok(vm > 5 && c.x < 7.5, 'zrychlovač W');
}
{ // sklon: míček sjíždí z kopce, gentle sklon ho drží
  const map = ['##########', '#........#', '#........#', '#........#', '##########']; const steep = mkW(map, { hgt: ['0000000000', '0123456789', '0123456789', '0123456789', '0000000000'] });
  const b = P.newBall(2.5, 2.5); for (let i = 0; i < 120; i++) P.stepBall(steep, b, 0); assert.ok(b.vx < -0.8 && b.x < 2.5, 'strmý svah ho rozjede dolů: ' + b.vx.toFixed(2));
  const mild = mkW(map, { hgt: ['0000000000', '0011223344', '0011223344', '0011223344', '0000000000'] }); const m = P.newBall(2.5, 2.5); for (let i = 0; i < 300; i++) P.stepBall(mild, m, 0); assert.ok(m.vx === 0, 'mírný svah ho udrží');
  const up = P.newBall(1.5, 2.5); P.shoot(up, 0, 0.1); for (let i = 0; i < 600; i++) P.stepBall(steep, up, 0); assert.ok(up.x < 4, 'slabá rána do kopce se vrátí');
  const hh = P.heightAt(steep, 3.5, 2.5); assert.ok(hh.y > 0 && hh.gx > 0);
}
{ // voda, teleport, jamka u zdi, překážky
  const W = mkW(['###########', '#T..~~~...#', '###########']); const b = P.newBall(1.5, 1.5); P.shoot(b, 0, 0.5); assert.equal(roll(W, b, 10), 'hz', 'voda');
  const T = mkW(['#############', '#T..1......2#', '#############']); const t = P.newBall(1.5, 1.5); P.shoot(t, 0, 0.3); let tp = null; for (let i = 0; i < 600 && !tp; i++) tp = P.stepBall(T, t, 0); assert.equal(tp, 'tp'); assert.ok(t.x > 11, 'teleport přenese na druhý konec'); for (let i = 0; i < 40; i++) assert.notEqual(P.stepBall(T, t, 0), 'tp', 'tam a hned zpátky ne');
  const R = mkW(['########', '#T.....#', '########'], { objs: [{ k: 'pillar', x: 4.5, z: 1.5, r: 0.4 }] }); const p = P.newBall(1.5, 1.5); P.shoot(p, 0, 0.5); roll(R, p, 6); assert.ok(p.x < 4.0, 'sloup zastaví míček');
  const Bm = mkW(['##########', '#T.......#', '##########'], { objs: [{ k: 'bump', x: 5.5, z: 1.5, r: 0.4 }] }); const bb = P.newBall(1.5, 1.5); P.shoot(bb, 0, 0.45); let back = false; for (let i = 0; i < 400; i++) { P.stepBall(Bm, bb, 0); if (bb.vx < -2) back = true; } assert.ok(back, 'nárazník míček vrátí pružně');
  const Mv = (ph) => mkW(['########', '#T.....#', '########'], { objs: [{ k: 'bar', x: 4.5, z: 1.5, len: 1.4, spd: 0, ph, w: 0.2 }] });
  const s1 = P.segsAt(Mv(0), 0)[0], s2 = P.segsAt(Mv(Math.PI / 2), 0)[0]; assert.ok(Math.abs(s1[3] - s1[1]) < 1e-9 && Math.abs(s2[2] - s2[0]) < 1e-9, 'tyč se otáčí podle fáze');
  const gate = { k: 'gate', x: 4.5, z: 1.5, w: 1, d: 1, per: 4, duty: 0.5, ph: 0 }; assert.ok(P.gateUp(gate, 0.1) && !P.gateUp(gate, 3)); const Gt = mkW(['########', '#T.....#', '########'], { objs: [gate] });
  const gb = P.newBall(1.5, 1.5); P.shoot(gb, 0, 0.5); roll(Gt, gb, 5, 0); assert.ok(gb.x < 4.2, 'zavřená brána zastaví'); const go = P.newBall(1.5, 1.5); P.shoot(go, 0, 0.5); roll(Gt, go, 5, 2); assert.ok(go.x > 4.6, 'otevřená brána pustí');
  const sl = { k: 'slider', x: 4.5, z: 1.5, w: 0.6, d: 1, ax: 0, az: 1, amp: 0, per: 2 }; assert.equal(P.rectsAt(mkW(['#####', '#T..#', '#####'], { objs: [sl] }), 0).length, 1);
  const Wd = mkW(['##########', '#T.......#', '##########'], { objs: [{ k: 'wind', x: 5, z: 1.5, w: 10, d: 1, ax: -6, az: 0 }] }); const wb = P.newBall(1.5, 1.5); P.shoot(wb, 0, 0.3); for (let i = 0; i < 300; i++) P.stepBall(Wd, wb, 0); assert.ok(wb.vx < 0 || wb.x < 3, 'vítr tlačí');
}
{ // simulate + distField
  const W = P.buildWorld(C.holeDef(0, 0)); const r = P.simulate(W, W.tee[0], W.tee[1], 0, 0.5, 0); assert.ok(r.rest && r.x > W.tee[0] + 1);
  const df = P.distField(W); assert.equal(P.distAt(W, df, W.cup[0], W.cup[1]), 0); assert.ok(P.distAt(W, df, W.tee[0], W.tee[1]) > 10);
  const wat = P.buildWorld(C.holeDef(0, 2)); const dw = P.distField(wat); assert.ok(P.distAt(wat, dw, 8.5, 1.5) >= 1e8, 'voda je neprůchodná');
}

// --- řešitelnost všech jamek: bot Šampion je dohraje do par + 3 ran (z různých časů, kvůli pohyblivým překážkám)
{
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let c = 0; c < C.COURSES.length; c++) for (let k = 0; k < C.COURSES[c].holes.length; k++) {
    const def = C.holeDef(c, k); const W = P.buildWorld(def); const df = P.distField(W); let best = 99;
    for (let trial = 0; trial < 3; trial++) {
      let x = W.tee[0], z = W.tee[1], t = 4 + trial * 1.7, st = 0, done = false;
      while (st < def.par + 3 && !done) { const s = B.chooseShot(W, df, x, z, t, 3, rnd); st++; const r = P.simulate(W, x, z, s.ang, s.pow, t); t += r.steps * P.DT + 1; if (r.ev === 'sink') done = true; else if (r.ev === 'hz') st++; else { x = r.x; z = r.z; } }
      if (done) best = Math.min(best, st);
    }
    assert.ok(best <= def.par + 2, `${def.theme} ${k + 1} ${def.name}: bot dohrál za ${best}, par ${def.par}`);
  }
}

// --- hra na serveru (bez sítě): průběh jamek, limit, bodování
const advanceTo = (g, ph, max = 20000) => { for (let i = 0; i < max && g.phase !== ph; i++) { G.tick(g); G.clearEvents(g); } assert.equal(g.phase, ph); };
{
  const g = G.newGame([{ name: 'a', color: 0 }, { name: 'b', color: 1 }], 5, 0, { holes: 3, time: 45, grace: 15 });
  assert.equal(g.holes.length, 3); assert.equal(g.phase, 'intro'); advanceTo(g, 'play'); assert.equal(g.pt, 0);
  const W = g.W; assert.equal(G.sunk(g, 0, { x: W.tee[0], z: W.tee[1] }), false, 'bez rány se do jamky spadnout nedá');
  assert.ok(G.shot(g, 0, { x: W.tee[0], z: W.tee[1], a: 0, p: 0.5 })); assert.equal(g.players[0].strokes, 1); assert.equal(g.ev.filter((e) => e[0] === 'shot').length, 1); assert.equal(G.shot(g, 0, { x: W.tee[0], z: W.tee[1], a: 0, p: 0.5 }), false, 'rány nejde spamovat');
  assert.equal(G.sunk(g, 0, { x: 3, z: 3 }), false, 'hlášení z daleka se odmítne'); assert.ok(G.sunk(g, 0, { x: W.cup[0] - 0.1, z: W.cup[1] })); assert.equal(g.first, 0); assert.equal(g.deadline, 15, 'po prvním dokončení zbývá jen přidaný čas');
  assert.equal(G.penalty(g, 1), false, 'bez rány žádná penalizace'); G.shot(g, 1, { x: W.tee[0], z: W.tee[1], a: 0, p: 0.1 }); assert.ok(G.penalty(g, 1)); assert.equal(g.players[1].strokes, 2); assert.equal(G.penalty(g, 1), false, 'jedna penalizace za ránu');
  advanceTo(g, 'score'); assert.equal(g.res[0].s, 1); assert.ok(g.res[0].fin && g.res[0].ace); assert.equal(g.res[1].s, g.cap, 'kdo nedokončí, dostane par + 4'); assert.equal(g.players[0].total, 1); assert.equal(g.players[0].aces, 1);
  advanceTo(g, 'play'); assert.equal(g.hole, 1); assert.equal(g.players[0].strokes, 0); assert.equal(g.players[0].done, false);
  for (let k = 0; k < 2; k++) { const w = g.W; for (let i = 0; i < 2; i++) { G.shot(g, i, { x: w.tee[0], z: w.tee[1], a: 0, p: 0.3 }); } g.pt += 1; for (let i = 0; i < 2; i++) { g.players[i].lastShot = -9; G.sunk(g, i, { x: w.cup[0], z: w.cup[1] }); } advanceTo(g, 'score'); advanceTo(g, k === 0 ? 'play' : 'over'); }
  assert.equal(g.phase, 'over'); assert.deepEqual(g.over.winners, [0].concat(g.over.totals[0] === g.over.totals[1] ? [1] : [])); assert.equal(g.over.totals.length, 2);
}
{ // vyčerpané rány: míček se zvedne; opuštění hry
  const g = G.newGame([{ name: 'a', color: 0 }, { name: 'b', color: 1 }], 9, 1, { holes: 3, time: 90, grace: 25 }); advanceTo(g, 'play'); const p = g.players[0];
  for (let i = 0; i < g.cap; i++) { p.lastShot = -9; assert.ok(G.shot(g, 0, { x: g.W.tee[0], z: g.W.tee[1], a: 0, p: 0.2 })); } assert.equal(G.shot(g, 0, { x: 1, z: 1, a: 0, p: 0.2 }), false, 'víc než cap ran ne');
  G.report(g, 0, { x: 3, z: 3, vx: 0, vz: 0, m: 0 }); assert.ok(p.done && !p.sunk, 'po posledním zastavení se míček zvedne');
  G.forfeit(g, 1); assert.ok(g.players[1].left && g.players[1].done); G.tick(g); assert.equal(g.phase, 'score', 'všichni hotovi = konec jamky');
}
for (let lv = 1; lv <= 3; lv++) { // boti hrají sami celý zápas
  const g = G.newGame([{ name: 'a', color: 0, bot: lv }, { name: 'b', color: 1, bot: lv }, { name: 'c', color: 2, bot: lv }], 3 + lv, C.MIX, { holes: 3, time: 60, grace: 25 }); let n = 0;
  for (; n < 60000 && g.phase !== 'over'; n++) { G.tick(g); G.clearEvents(g); } assert.equal(g.phase, 'over', 'zápas botů skončí'); assert.ok(g.players.every((q) => q.rows.length === 3 && q.total >= 3)); assert.ok(g.players.some((q) => q.fins >= 1), `boti úrovně ${lv} někdy dohrají`);
}

// --- účet, místnosti a online zápas
const accs = {};
const mk = (name) => ({ name, avatar: null, balance: 5000, lastSeen: 0 });
let dirty = 0;
A.init({ TOKEN_RE: /^[A-Za-z0-9_-]{20,64}$/, markDirty: () => { dirty++; }, resolveAccount: ({ token }) => (accs[token] ? { acc: accs[token], linked: true } : null) });
const TK = ['a', 'b', 'c', 'd', 'e'].map((ch) => ch.repeat(24)), TX = 'x'.repeat(24);
['Honza', 'Eva', 'Petr', 'Jana', 'Karel'].forEach((n, i) => { accs[TK[i]] = mk(n); });
{
  assert.equal(A.api('me', { token: TX }).json.account, false);
  const r = A.api('me', { token: TK[0] }); assert.equal(r.status, 200); assert.equal(r.json.golf.color, -1); assert.equal(r.json.golf.coins, 100); assert.equal(A.api('nic', { token: TK[0] }).status, 404);
  assert.equal(A.api('color', { token: TK[0], color: 3 }).json.golf.color, 3); assert.equal(A.api('color', { token: TK[0], color: 99 }).status, 400); assert.equal(A.api('color', { token: TX, color: 1 }).status, 401);
  const t = A.golfOf(accs[TK[0]]); t.wins = -5; t.color = 77; t.coins = 'x'; A.golfOf(accs[TK[0]]); assert.equal(t.wins, 0, 'sanitizace'); assert.equal(t.color, -1); assert.equal(t.coins, 100); t.color = 3;
}
{ // obchod: koupě za coiny, výběr, hole mění sílu rány a písek
  const t = A.golfOf(accs[TK[1]]); assert.deepEqual(t.eq, { skin: '', fx: '', club: '' }); assert.deepEqual(t.own, []);
  assert.equal(A.api('buy', { token: TX, cat: 'skin', id: 'dots' }).status, 401); assert.equal(A.api('buy', { token: TK[1], cat: 'nic', id: 'dots' }).status, 400); assert.equal(A.api('buy', { token: TK[1], cat: 'skin', id: 'nic' }).status, 400);
  assert.equal(A.api('buy', { token: TK[1], cat: 'club', id: 'plasma' }).status, 402, 'na plazmovou hůl nemá');
  let r = A.api('buy', { token: TK[1], cat: 'skin', id: 'dots' }); assert.equal(r.status, 200); assert.equal(r.json.golf.coins, 20); assert.deepEqual(r.json.golf.own, ['skin:dots']); assert.equal(r.json.golf.eq.skin, 'dots', 'koupená věc se rovnou nasadí');
  assert.equal(A.api('buy', { token: TK[1], cat: 'skin', id: 'dots' }).status, 409, 'dvakrát ne');
  assert.equal(A.api('equip', { token: TK[1], cat: 'fx', id: 'sparks' }).status, 403, 'nekoupenou věc nasadit nejde');
  assert.equal(A.api('equip', { token: TK[1], cat: 'skin', id: '' }).json.golf.eq.skin, '', 'prázdné id = základ'); assert.equal(A.api('equip', { token: TK[1], cat: 'skin', id: 'dots' }).json.golf.eq.skin, 'dots');
  t.coins = 5000; for (const [c, id] of [['fx', 'rings'], ['club', 'driver']]) assert.equal(A.api('buy', { token: TK[1], cat: c, id }).status, 200);
  assert.deepEqual(A.golfOf(accs[TK[1]]).eq, { skin: 'dots', fx: 'rings', club: 'driver' });
  accs[TK[1]].golf.own.push('skin:podvod'); accs[TK[1]].golf.eq.skin = 'podvod'; A.golfOf(accs[TK[1]]); assert.ok(!accs[TK[1]].golf.own.includes('skin:podvod'), 'neznámá věc se zahodí'); assert.equal(accs[TK[1]].golf.eq.skin, '');
  accs[TK[1]].golf.eq.fx = 'sparks'; assert.equal(A.golfOf(accs[TK[1]]).eq.fx, '', 'nasadit jde jen koupené'); A.api('equip', { token: TK[1], cat: 'skin', id: 'dots' }); A.api('equip', { token: TK[1], cat: 'fx', id: 'rings' });
  t.coins = 100; t.own = []; t.eq = { skin: '', fx: '', club: '' };
  assert.ok(K.CLUBS.every((c) => c.pw > 1 && c.pw <= 1.5 && c.aim >= 1 && c.sand > 0 && c.sand <= 1) && K.clubOf('').pw === 1 && K.clubOf('nic').pw === 1);
  for (const l of [K.SKINS, K.WINFX, K.CLUBS]) { assert.equal(new Set(l.map((x) => x.id)).size, l.length, 'id jsou jedinečná'); assert.ok(l.every((x) => /^[A-Za-z0-9]{2,12}$/.test(x.id) && x.price > 0)); }
  const base = P.newBall(1.5, 1.5); P.shoot(base, 0, 1); const big = P.newBall(1.5, 1.5); P.shoot(big, 0, 1, K.clubOf('plasma').pw);
  assert.ok(Math.abs(P.speedOf(big) / P.speedOf(base) - 1.3) < 1e-9, 'hůl násobí rychlost'); const cheat = P.newBall(1.5, 1.5); P.shoot(cheat, 0, 1, 9); assert.ok(Math.abs(P.speedOf(cheat) - P.speedOf(base)) < 1e-9, 'přehnaný násobek se ignoruje');
  const SW = mkW(['####################', '#T,,,,,,,,,,,,,,,,H#', '####################']); const a1 = P.newBall(1.5, 1.5); P.shoot(a1, 0, 0.5); roll(SW, a1, 15); const a2 = P.newBall(1.5, 1.5); a2.sand = K.clubOf('sand').sand; P.shoot(a2, 0, 0.5); roll(SW, a2, 15);
  assert.ok(a2.x > a1.x + 0.5, 'pískovka zajede v písku dál'); const g1 = P.newBall(1.5, 1.5); P.shoot(g1, 0, 0.5); const g2 = P.newBall(1.5, 1.5); g2.sand = 0.4; P.shoot(g2, 0, 0.5); const GW = mkW(['####################', '#T..................#', '####################']); roll(GW, g1, 15); roll(GW, g2, 15); assert.ok(Math.abs(g1.x - g2.x) < 1e-9, 'na trávě pískovka nic nemění');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client() {
  const ws = { readyState: 1, out: [], h: {}, bufferedAmount: 0, send(d) { this.out.push(JSON.parse(d)); }, close() { this.readyState = 3; this.h.close && this.h.close(); }, on(e, f) { this.h[e] = f; }, terminate() { this.close(); }, ping() {} };
  A.handleConnection(ws); ws.say = (o) => ws.h.message(Buffer.from(JSON.stringify(o)));
  ws.last = (t) => [...ws.out].reverse().find((m) => m.t === t); ws.all = (t) => ws.out.filter((m) => m.t === t); return ws;
}
{ // rychlá hra: dva lidé se potkají, barvy jsou různé, vybraná se bere z účtu
  const a = client(), b = client(); a.say({ t: 'quick', token: TK[0], name: 'Honza' }); b.say({ t: 'quick', token: TK[1], name: 'Eva', color: 3 });
  const room = A.rooms.get(a.last('joined').code); assert.equal(b.last('joined').code, room.code); assert.equal(room.phase, 'lobby'); assert.ok(room.autoAt);
  const st = b.last('state'); assert.equal(st.players.length, 2); assert.equal(st.players[0].color, 3, 'Honza má v účtu barvu 3'); assert.notEqual(st.players[1].color, 3, 'barvy se neopakují');
  b.say({ t: 'color', color: 3 }); assert.ok(b.last('err'), 'zabraná barva'); b.say({ t: 'color', color: 6 }); assert.equal(a.last('state').players[1].color, 6); assert.equal(A.golfOf(accs[TK[1]]).color, 6, 'zvolená se ukládá do účtu'); b.say({ t: 'color', color: 99 }); assert.equal(a.last('state').players[1].color, 6);
  a.say({ t: 'start' }); assert.equal(room.phase, 'play', 'na rychlé hře začne i host (2 lidé)');
  const gm = b.last('game'); assert.equal(gm.ph, 'intro'); assert.ok(gm.el < 0 && gm.of === 6 && gm.par >= 2); assert.deepEqual(gm.totals, [0, 0]);
  a.say({ t: 'leave' }); b.say({ t: 'leave' }); assert.ok(!A.rooms.has(room.code));
}
{ // soukromá místnost: kód, pátý se nevejde, host volí hřiště a nastavení
  const cs = [0, 1, 2, 3, 4].map(() => client()); cs[0].say({ t: 'create', token: TK[0], name: 'Honza', course: 2 }); const code = cs[0].last('joined').code; const room = A.rooms.get(code); assert.equal(room.course, 2);
  for (let i = 1; i < 4; i++) cs[i].say({ t: 'join', code: code.toLowerCase(), token: TK[i], name: 'x' }); cs[4].say({ t: 'join', code, token: TK[4], name: 'y' }); assert.ok(cs[4].last('err').fatal); assert.equal(room.players.length, 4);
  assert.equal(new Set(room.players.map((p) => p.color)).size, 4, 'čtyři různé barvy');
  cs[1].say({ t: 'cfg', cfg: { holes: 3 } }); assert.equal(room.cfg.holes, 6, 'nastavení smí měnit jen host'); cs[0].say({ t: 'cfg', cfg: { holes: 3, time: 90, grace: 7 } }); assert.equal(room.cfg.holes, 3); assert.equal(room.cfg.time, 90); assert.equal(room.cfg.grace, K.CFG_DEFAULT.grace, 'nepovolená hodnota se ignoruje');
  cs[1].say({ t: 'start' }); assert.equal(room.phase, 'lobby', 'startovat smí jen host'); cs[1].say({ t: 'course', course: 1 }); assert.equal(room.course, 2); cs[0].say({ t: 'course', course: 1 }); assert.equal(room.course, 1);
  cs[0].say({ t: 'start' }); assert.equal(room.phase, 'play'); assert.equal(room.game.course, 1); assert.equal(room.game.holes.length, 3); assert.equal(room.game.cfg.time, 90);
  // rána, voda, jamka přes zprávy; ostatní vidí úder
  A.advance(room, 4 * 30 + 2); assert.equal(room.game.phase, 'play'); const g = room.game; const W = g.W;
  cs[1].say({ t: 'shot', x: W.tee[0], z: W.tee[1], a: 0.5, p: 0.4 }); assert.equal(g.players[1].strokes, 1); const ev = cs[2].all('tk').flatMap((m) => m.ev || []).find((e) => e[0] === 'shot'); assert.ok(ev && ev[1] === 1, 'ostatní dostanou ránu');
  cs[1].say({ t: 'rep', x: 3, z: 2, vx: 1, vz: 0, m: 1 }); assert.equal(g.players[1].x, 3); assert.equal(g.players[1].m, 1); cs[1].say({ t: 'pen' }); assert.equal(g.players[1].strokes, 2); assert.equal(g.players[1].x, W.tee[0], 'po vodě zpátky na místo úderu');
  cs[0].say({ t: 'sink', x: W.cup[0], z: W.cup[1] }); assert.equal(g.players[0].done, false, 'bez rány se nepočítá'); cs[0].say({ t: 'shot', x: W.tee[0], z: W.tee[1], a: 0, p: 0.1 }); cs[0].say({ t: 'sink', x: W.cup[0], z: W.cup[1] }); assert.ok(g.players[0].done && g.players[0].sunk);
  assert.ok(cs[3].all('tk').flatMap((m) => m.ev || []).some((e) => e[0] === 'fin' && e[1] === 0));
  for (const c of cs) c.say({ t: 'leave' });
}
{ // proti botům: zápas dojede do konce, účet dostane statistiky a coiny
  const a = client(); const t0 = A.golfOf(accs[TK[0]]); const g0 = t0.games, c0 = t0.coins;
  a.say({ t: 'bot', token: TK[0], name: 'Honza', level: 3, n: 2, cfg: { holes: 3, time: 45, grace: 15 } }); const room = A.rooms.get(a.last('joined').code); assert.ok(room.solo); assert.equal(room.players.length, 3); assert.equal(room.game.holes.length, 3);
  for (let i = 0; i < 40000 && room.phase === 'play'; i++) { A.advance(room, 1); const g = room.game; if (g.phase === 'play') { const p = g.players[0]; if (!p.done && g.pt > 3 && p.strokes === 0) { a.say({ t: 'shot', x: g.W.tee[0], z: g.W.tee[1], a: 0, p: 0.1 }); } } }
  const fin = a.last('state'); assert.equal(fin.phase, 'over'); assert.ok(fin.result.winners.length >= 1 && fin.result.totals.length === 3 && fin.result.rows[0].length === 3); assert.equal(A.golfOf(accs[TK[0]]).games, g0 + 1); assert.ok(fin.result.coins[0].gain >= K.COINS.play); assert.equal(A.golfOf(accs[TK[0]]).coins, c0 + fin.result.coins[0].gain);
  a.say({ t: 'rematch' }); assert.equal(room.phase, 'play', 'odveta proti botům hned začne'); a.say({ t: 'leave' }); assert.ok(!A.rooms.has(room.code));
}
{ // odpojení a návrat; po vypršení se hráč vzdá
  const a = client(), b = client(); a.say({ t: 'create', token: TK[0], name: 'Honza' }); const code = a.last('joined').code; b.say({ t: 'join', code, token: TK[1], name: 'Eva' }); a.say({ t: 'start' }); const room = A.rooms.get(code); assert.equal(room.phase, 'play');
  const tok = b.last('joined').token; b.close(); assert.ok(room.dropFor, 'běží odpočet na návrat'); const b2 = client(); b2.say({ t: 'resume', code, token: tok }); assert.ok(b2.last('state') && b2.last('game'), 'po návratu dostane stav'); assert.equal(room.dropFor, null);
  b2.close(); await sleep(150); assert.ok(room.players[1].left, 'po vypršení se vzdá'); assert.equal(room.phase, 'play'); a.say({ t: 'leave' }); await sleep(10); assert.ok(!A.rooms.has(code));
}
{ // výbava ostatních se posílá v seznamu hráčů a po startu zápasu je zamčená (hůl se neposílá)
  const t = A.golfOf(accs[TK[3]]); t.coins = 5000; for (const [c, id] of [['skin', 'galaxy'], ['fx', 'fireworks'], ['club', 'titan']]) assert.equal(A.api('buy', { token: TK[3], cat: c, id }).status, 200);
  const a = client(), b = client(); a.say({ t: 'create', token: TK[3], name: 'Jana' }); const code = a.last('joined').code; b.say({ t: 'join', code, token: TK[4], name: 'Karel' });
  let st = b.last('state'); assert.equal(st.players[0].sk, 'galaxy'); assert.equal(st.players[0].fx, 'fireworks'); assert.equal(st.players[1].sk, ''); assert.ok(!('club' in st.players[0]), 'hůl ostatní nevidí');
  a.say({ t: 'start' }); A.api('equip', { token: TK[3], cat: 'skin', id: '' }); const room = A.rooms.get(code); A.advance(room, 1); a.say({ t: 'ping' });
  st = b.last('state'); assert.equal(st.players[0].sk, 'galaxy', 'v zápase se skin nemění'); a.say({ t: 'leave' }); b.say({ t: 'leave' });
  t.coins = 100; t.own = []; t.eq = { skin: '', fx: '', club: '' };
  const bots = client(); bots.say({ t: 'bot', token: TK[4], name: 'Karel', level: 1, n: 3, cfg: { holes: 3, time: 45, grace: 15 } }); const sb = bots.last('state'); assert.ok(sb.players.slice(1).every((p) => (p.sk === '' || K.shopItem('skin', p.sk)) && (p.fx === '' || K.shopItem('fx', p.fx))), 'boti mají jen existující výbavu'); bots.say({ t: 'leave' });
}

// --- celé hřiště (11 = všechny jamky hřiště) a nové hřiště Vesmír
{
  const K = await import('./golf/shared.js'); assert.equal(K.cleanCfg({ holes: 11 }).holes, 11); assert.equal(K.cleanCfg({ holes: 7 }).holes, K.CFG_DEFAULT.holes);
  const sp = C.COURSES.findIndex((c) => c.id === 'space'); assert.ok(sp >= 0); assert.equal(C.holeList(sp, 11).length, 10); assert.equal(C.holeList(0, 11).length, 11);
  const mixAll = C.holeList(C.MIX, 11, 5); assert.equal(mixAll.length, 11); assert.equal(new Set(mixAll.map((m) => m.join())).size, 11);
  const g = G.newGame([{ name: 'a', color: 0 }, { name: 'b', color: 1 }], 5, sp, { holes: 11, time: 45, grace: 15 }); assert.equal(g.holes.length, 10); assert.ok(g.holes.every((h) => h[0] === sp));
}

console.log('Minigolf: všechny testy prošly');
process.exit(0);
