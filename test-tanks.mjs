// Tankové souboje: fyzika (shodný soubor na serveru i v prohlížeči), účet (nákup, barva, XP), online zápas (tahy, jízda, bedny, výstřely, coiny),
// hra proti botovi a rematch / odpojení / vzdání.
process.env.TANKS_SCALE = '0.02';
process.env.TANKS_DROP_MS = '300';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const T = await import('./tanks/tanks.js');
const P = T.P;

// --- fyzika a sdílený soubor
assert.equal(fs.readFileSync('./tanks/physics.js', 'utf8'), fs.readFileSync('./public/tanks/physics.js', 'utf8'), 'physics.js musí být na serveru i v public/ stejný');
{
  const h1 = P.genTerrain(12345), h2 = P.genTerrain(12345);
  assert.equal(P.checksum(h1), P.checksum(h2), 'terén je deterministický');
  const tanks = [{ x: 200, hp: 100 }, { x: 1400, hp: 100 }];
  const r = P.simulate({ h: h1, tanks, wind: 0, crates: [] }, 0, 45, 70, 'std');
  assert.ok(r.paths.length === 1 && r.ex.length >= 1 && r.dur > 0);
  const hc = h1.slice(); const cs = P.checksum(hc);
  P.applyCrater(hc, 800, hc[800] - 5, 60); assert.notEqual(P.checksum(hc), cs, 'kráter mění terén');
  for (const id of P.ORDER) { const rr = P.simulate({ h: P.genTerrain(7), tanks: [{ x: 200, hp: 100 }, { x: 1400, hp: 100 }], wind: 3 }, 1, 120, 80, id); assert.ok(rr.dur >= 0, id); }
  let worst = 0; for (let sd = 1; sd <= 600; sd++) { const h = P.genTerrain(sd * 7919); for (const px of [170, 200, 230, 1370, 1400, 1430]) worst = Math.max(worst, Math.abs(h[px + 15] - h[px - 15]) / 30); }
  assert.ok(worst < 1.0, 'tanky začínají na rovině (' + worst.toFixed(2) + ')');
  { // tank přejede kráter i atomovky (jízda dál od okraje do kráteru a ven)
    const stp = P.DRIVE_SPEED * 0.05;
    for (const r of [34, 68, 120]) for (const dir of [1, -1]) {
      const h = P.genTerrain(5); P.applyCrater(h, 800, h[800] - 2, r); let px = dir > 0 ? 600 : 1000;
      while (dir > 0 ? px < 1000 : px > 600) { const nx = px + dir * stp; assert.ok(-(P.groundAt(h, nx) - P.groundAt(h, px)) <= Math.max(P.SLOPE_MAX * stp, P.STEP_UP), 'kráter ' + r + ' se dá přejet'); px = nx; }
    }
  }
  assert.equal(P.levelOf(0), 1); assert.ok(P.levelOf(P.xpFor(5)) === 5); assert.equal(P.levelOf(1e9), P.MAX_LEVEL);
}

// --- účty
const accs = {};
const mk = (name, bal) => ({ name, avatar: null, balance: bal, lastSeen: 0 });
let dirty = 0; const notified = [];
T.init({
  FLOOR: 100, TOKEN_RE: /^[A-Za-z0-9_-]{20,64}$/, markDirty: () => { dirty++; }, notifyBalance: (a) => notified.push(a.name),
  resolveAccount: ({ token }) => (accs[token] ? { acc: accs[token], linked: true } : null),
});
const T1 = 'a'.repeat(24), T2 = 'b'.repeat(24), T3 = 'c'.repeat(24), TX = 'x'.repeat(24);
accs[T1] = mk('Honza', 5000); accs[T2] = mk('Eva', 5000); accs[T3] = mk('Chudák', 150);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await sleep(10); } throw new Error('timeout: ' + f); };


{
  let r = T.api('me', { token: TX }); assert.equal(r.json.account, false);
  r = T.api('me', { token: T1 }); assert.equal(r.status, 200); assert.equal(r.json.tank.lvl, 1); assert.equal(r.json.tank.xp, 0);
  r = T.api('buy', { token: T1, id: 'big' }); assert.equal(r.status, 200); assert.equal(r.json.tank.ammo.big, 3); assert.equal(accs[T1].balance, 5000 - 240);
  assert.equal(T.api('buy', { token: T1, id: 'triple' }).status, 403, 'trojitá salva se odemyká na úrovni 2');
  assert.equal(T.api('buy', { token: T1, id: 'std' }).status, 400);
  assert.equal(T.api('buy', { token: TX, id: 'big' }).status, 401);
  for (let i = 0; i < 5; i++) assert.equal(T.api('buy', { token: T1, id: 'big' }).status, 200);
  assert.equal(T.api('buy', { token: T1, id: 'big' }).status, 409, 'strop 20 kusů');
  assert.equal(T.api('buy', { token: T3, id: 'big' }).status, 402, 'nedostatek coinů');
  assert.equal(T.api('color', { token: T1, c: 3 }).status, 403); assert.equal(T.api('color', { token: T1, c: 99 }).status, 400);
  assert.equal(T.api('color', { token: T1, c: 2 }).json.tank.color, 2);
  T.tankOf(accs[T1]).xp = P.xpFor(6);
  assert.equal(T.api('buy', { token: T1, id: 'nuke' }).status, 200);
  assert.equal(T.api('color', { token: T1, c: 5 }).status, 200);
  assert.ok(dirty > 0 && notified.includes('Honza'));
  accs[T1] = mk('Honza', 5000); accs[T2] = mk('Eva', 5000); accs[T3] = mk('Chudák', 150);
}

function client() {
  const ws = { readyState: 1, out: [], h: {}, send(d) { this.out.push(JSON.parse(d)); }, close() { this.readyState = 3; this.h.close && this.h.close(); }, on(e, f) { this.h[e] = f; }, terminate() {}, ping() {} };
  T.handleConnection(ws);
  ws.say = (o) => ws.h.message(Buffer.from(JSON.stringify(o)));
  ws.last = (t) => [...ws.out].reverse().find((m) => m.t === t);
  ws.all = (t) => ws.out.filter((m) => m.t === t);
  return ws;
}
function online(tokA = T1, tokB = T2) {
  const a = client(), b = client();
  a.say({ t: 'create', token: tokA, name: 'Honza' });
  const code = a.last('joined').code;
  b.say({ t: 'join', code, token: tokB, name: 'Eva' });
  return { a, b, code, room: T.rooms.get(code) };
}
const cur = (m) => (m.turn === m.a.last('state').you ? m.a : m.b);
function findHit(room, i, w = 'std') {
  const en = 1 - i; const env = { h: room.h, tanks: room.tanks, wind: room.wind };
  for (let a = 5; a <= 175; a += 2) for (let pw = 20; pw <= 100; pw += 4) { const r = P.simulate(env, i, a, pw, w, { dry: true }); if (r.dmg[en] > 0 && r.dmg[i] === 0) return { a, pw }; }
  return null;
}

// --- lobby, start, stav
{
  const m = online(); const { a, b, room } = m;
  const sa = a.last('state'), sb = b.last('state');
  assert.equal(sa.phase, 'play'); assert.equal(sa.players.length, 2); assert.deepEqual(sa.hp, [100, 100]);
  assert.equal(sa.you + sb.you, 1); assert.equal(sa.crates.length, 2); assert.ok(sa.th === sb.th && sa.th === P.checksum(room.h));
  assert.equal(a.last('terrain').h.length, P.W, 'klient dostane terén');
  assert.equal(sa.players[0].name === sa.players[1].name, false);
  const turn = sa.turn, cu = turn === sa.you ? a : b, ot = cu === a ? b : a;
  ot.say({ t: 'fire', a: 45, p: 60, w: 'std' }); assert.equal(ot.last('rej').msg, 'Teď nejsi na tahu.');
  cu.say({ t: 'fire', a: 45, p: 60, w: 'big' }); assert.match(cu.last('rej').msg, /munici/);
  const c3 = client(); c3.say({ t: 'join', code: m.code, token: T3, name: 'X' }); assert.ok(c3.last('err').fatal, 'třetí se nevejde');
  const dup = client(); dup.say({ t: 'create', token: T1, name: 'H' }); const dupJoin = client(); dupJoin.say({ t: 'join', code: dup.last('joined').code, token: T1, name: 'H2' });
  assert.match(dupJoin.last('err').msg, /účet/, 'stejný účet dvakrát ne');

  // jízda
  const i = turn, d = i === 0 ? 1 : -1; const x0 = room.tanks[i].x, f0 = room.tanks[i].fuel;
  cu.say({ t: 'drive', d }); await until(() => room.tanks[i].x !== x0 && cu.all('mv').length > 3); cu.say({ t: 'drive', d: 0 });
  await sleep(120);
  assert.ok(Math.sign(room.tanks[i].x - x0) === d && room.tanks[i].fuel < f0, 'tank jede a spotřebovává palivo');
  assert.ok(ot.all('mv').length > 0, 'soupeř vidí pohyb');
  // jízda soupeře se ignoruje
  const xo = room.tanks[1 - i].x; ot.say({ t: 'drive', d: 1 }); await sleep(180); ot.say({ t: 'drive', d: 0 }); assert.equal(room.tanks[1 - i].x, xo);

  // sebrání bedny
  const x1 = room.tanks[i].x; room.crates.push({ id: 99, x: x1 + d * 40, kind: 'cluster' });
  cu.say({ t: 'drive', d }); const pick = await until(() => cu.all('crate').find((c) => c.op === 'pick')); cu.say({ t: 'drive', d: 0 });
  assert.equal(pick.w, 'cluster'); assert.ok(room.tanks[i].crate.cluster >= 1); assert.ok(cu.last('ammo').ammo.cluster >= 1);
  assert.ok(!room.crates.some((c) => c.id === 99));

  // výstřel z bedny (munice z bedny se spotřebuje první)
  const hit = findHit(room, i, 'cluster') || { a: 45, p: 60 };
  const cc = room.tanks[i].crate.cluster; cu.say({ t: 'fire', a: hit.a, p: hit.pw ?? hit.p, w: 'cluster' });
  const shot = await until(() => cu.last('shot')); assert.equal(shot.w, 'cluster'); assert.ok(shot.paths.length >= 1 && shot.ex.length >= 1);
  assert.equal(room.tanks[i].crate.cluster, cc - 1); assert.equal(shot.th, P.checksum(room.h));
  const st = await until(() => { const s = cu.last('state'); return s.turn !== turn && s.phase === 'play' && s; });
  assert.equal(st.shots[i], 1); assert.equal(cu.last('state').th, P.checksum(room.h), 'klient i server mají stejný terén');
  assert.notEqual(st.wind, undefined);
  m.a.say({ t: 'leave' });
}

// --- koupená munice se odečítá z účtu natrvalo, oprava léčí
{
  T.tankOf(accs[T1]).ammo = { big: 2, repair: 1 };
  const m = online(); const { a, b, room } = m;
  const meIdx = a.last('state').you; const cu = room.turn === meIdx ? a : null;
  if (!cu) { // ať je na tahu Honza (účet T1)
    b.say({ t: 'fire', a: 45, p: 10, w: 'std' }); await until(() => a.last('state').turn === meIdx);
  }
  const ammoNow = a.last('state').ammo; assert.equal(ammoNow.big, 2); assert.equal(ammoNow.repair, 1);
  room.tanks[meIdx].hp = 40;
  a.say({ t: 'fire', a: 90, p: 50, w: 'repair' }); await until(() => a.last('heal'));
  assert.equal(room.tanks[meIdx].hp, 75); assert.equal(T.tankOf(accs[T1]).ammo.repair, undefined);
  await until(() => a.last('state').turn !== meIdx);
  await until(() => a.last('state').turn === meIdx || (b.say({ t: 'fire', a: 45, p: 10, w: 'std' }), false), 6000);
  const hit = findHit(room, meIdx, 'big') || { a: 45, pw: 50 };
  a.say({ t: 'fire', a: hit.a, p: hit.pw, w: 'big' }); await until(() => a.last('shot') && a.last('shot').w === 'big');
  assert.equal(T.tankOf(accs[T1]).ammo.big, 1, 'munice se odečetla z účtu');
  a.say({ t: 'leave' }); b.say({ t: 'leave' });
}

// --- výhra online: +900 / −300, XP, výhry; podlaha zůstatku
{
  accs[T1] = mk('Honza', 5000); accs[T2] = mk('Eva', 150);
  const m = online(); const { a, b, room } = m; const s = a.last('state');
  const w = s.turn, cw = w === s.you ? a : b; const wacc = w === s.you ? accs[T1] : accs[T2], lacc = w === s.you ? accs[T2] : accs[T1];
  const wb = wacc.balance, lb = lacc.balance;
  room.tanks[1 - w].hp = 1; room.tanks[0].shots = room.tanks[1].shots = 2;
  const hit = findHit(room, w); assert.ok(hit, 'existuje zásah');
  cw.say({ t: 'fire', a: hit.a, p: hit.pw, w: 'std' });
  const over = await until(() => { const x = a.last('state'); return x.phase === 'over' && x; });
  assert.equal(over.result.winner, w); assert.ok(over.result.coins[w] === 900);
  assert.equal(wacc.balance, wb + 900); assert.equal(lacc.balance, Math.max(100, lb - 300));
  assert.ok(notified.length > 0 && T.tankOf(wacc).wins === 1 && T.tankOf(lacc).losses === 1 && T.tankOf(wacc).xp > 0 && T.tankOf(lacc).xp > 0);
  assert.equal(over.result.xp[w].gain, T.tankOf(wacc).xp);
  // odveta
  a.say({ t: 'rematch' }); assert.equal(a.last('state').phase, 'over'); b.say({ t: 'rematch' });
  await until(() => a.last('state').phase === 'play'); assert.deepEqual(a.last('state').hp, [100, 100]); assert.equal(a.last('state').result, null);
  a.say({ t: 'leave' });
}

// --- krátký zápas: coiny se neúčtují; odpojení = výhra soupeře po prodlevě, resume mezitím funguje
{
  accs[T1] = mk('Honza', 5000); accs[T2] = mk('Eva', 5000);
  const m = online(); const { a, b, room, code } = m; const tok = b.last('joined').token;
  b.close(); const b2 = client(); b2.say({ t: 'resume', code, token: tok });
  assert.equal(b2.last('state').phase, 'play'); assert.equal(b2.last('terrain').h.length, P.W, 'po resume přijde terén');
  assert.equal(b2.last('state').you, b.last('state').you);
  b2.close(); room.tanks[0].shots = 1; room.tanks[1].shots = 1;
  const ov = await until(() => { const x = a.last('state'); return x.phase === 'over' && x; }, 3000);
  assert.equal(ov.result.winner, a.last('state').you); assert.ok(ov.result.noCoins, 'moc krátký zápas'); assert.equal(accs[T1].balance, 5000);
  a.say({ t: 'leave' });
}
{ // vzdání po dostatečném počtu výstřelů
  const m = online(); const { a, b, room } = m; room.tanks[0].shots = room.tanks[1].shots = 2;
  const bb = b.last('state').you; const ab = a.last('state').you;
  b.say({ t: 'leave' });
  const ov = a.last('state'); assert.equal(ov.phase, 'over'); assert.equal(ov.result.winner, ab); assert.ok(ov.result.coins[ab] === 900);
  assert.notEqual(bb, ab);
}
{ // žádný výstřel a odchod = místnost zmizí bez účtování
  const m = online(); const { a, b, code } = m; const bal = accs[T1].balance;
  b.say({ t: 'leave' }); assert.ok(!T.rooms.has(code)); assert.equal(accs[T1].balance, bal);
}
{ // zmeškané tahy → prohra
  const m = online(); const { a, b, room, code } = m;
  const ov = await until(() => { const x = a.last('state'); return x.phase === 'over' && x; }, 6000);
  assert.match(ov.result.reason, /nehrál/); a.say({ t: 'leave' }); b.say({ t: 'leave' });
}

// --- rychlá hra: dva hráči se spárují
{
  const a = client(), b = client();
  a.say({ t: 'quick', token: T1, name: 'Honza' }); assert.equal(a.last('state').phase, 'lobby'); assert.equal(a.last('state').quick, true);
  b.say({ t: 'quick', token: T2, name: 'Eva' });
  assert.equal(b.last('joined').code, a.last('joined').code); assert.equal(a.last('state').phase, 'play');
  a.say({ t: 'leave' }); b.say({ t: 'leave' });
}

// --- bot
{
  accs[T1] = mk('Honza', 5000);
  const a = client(); a.say({ t: 'bot', level: 2, token: T1, name: 'Honza' });
  const st = a.last('state'); assert.equal(st.bot, 2); assert.equal(st.players.filter((p) => p.bot).length, 1);
  const room = T.rooms.get(st.code); const me = st.you; const bot = 1 - me;
  assert.equal(st.players[bot].name, 'Bot Seržant');
  // bot odpovídá střelou, člověk jen střílí naslepo
  let turns = 0;
  await until(() => {
    const s = a.last('state'); if (!s || s.phase === 'over') return true;
    if (s.phase === 'play' && s.turn === me && a.last('terrain') && s.turnNo !== turns) { turns = s.turnNo; a.say({ t: 'fire', a: me === 0 ? 50 : 130, p: 55, w: 'std' }); }
    return a.all('shot').some((x) => x.by === bot) && a.all('shot').some((x) => x.by === me);
  }, 15000);
  assert.ok(a.all('shot').some((x) => x.by === bot), 'bot střílí');
  a.say({ t: 'leave' }); assert.ok(!T.rooms.has(st.code), 'bot hra po odchodu zmizí');
}
{ // výhra nad botem: +odměna dle úrovně, prohra bez ztráty
  accs[T1] = mk('Honza', 5000); const before = accs[T1].balance;
  const a = client(); a.say({ t: 'bot', level: 3, token: T1, name: 'Honza' });
  const st = a.last('state'); const room = T.rooms.get(st.code); const me = st.you, bot = 1 - me;
  room.tanks[me].shots = 2; room.tanks[bot].hp = 1;
  await until(() => a.last('state').turn === me && a.last('state').phase === 'play', 4000).catch(() => null);
  if (room.turn !== me) { await until(() => room.turn === me && room.phase === 'play', 8000); }
  const hit = findHit(room, me); a.say({ t: 'fire', a: hit.a, p: hit.pw, w: 'std' });
  const ov = await until(() => { const x = a.last('state'); return x.phase === 'over' && x; });
  assert.equal(ov.result.winner, me); assert.equal(accs[T1].balance, before + 500); assert.ok(T.tankOf(accs[T1]).xp >= 110);
  a.say({ t: 'rematch' }); await until(() => a.last('state').phase === 'play'); assert.equal(a.last('state').hp[me], 100);
  // prohra: bot nezabíjí zadarmo — člověk jen čeká, soupeř ho nesmí oškubat o coiny
  room.tanks[me].hp = 1; const bal = accs[T1].balance;
  await until(() => room.phase === 'over', 20000);
  assert.equal(room.result.winner === me, false); assert.equal(accs[T1].balance, bal, 'prohra s botem nestojí coiny');
  a.say({ t: 'leave' });
}
{ // bot úrovně 3 trefuje hned: hráč nehraje, bot střílí
  let hits = 0, tries = 0;
  for (let k = 0; k < 4; k++) {
    const a = client(); a.say({ t: 'bot', level: 3, token: T1, name: 'Honza' });
    const st = a.last('state'); const bot = 1 - st.you;
    const shot = await until(() => a.all('shot').find((x) => x.by === bot), 8000).catch(() => null);
    if (shot) { tries++; if (shot.hp[st.you] < shot.hpBefore[st.you]) hits++; }
    a.say({ t: 'leave' });
  }
  assert.ok(tries >= 3 && hits >= tries - 1, `bot L3 trefuje (${hits}/${tries})`);
}

console.log('test-tanks: OK');
process.exit(0);
