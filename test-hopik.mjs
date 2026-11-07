// Hopík: sdílené soubory, fyzika, kusy a jejich pokládání, bodování kola, dosažitelnost všech tratí, boti a online místnosti (rychlá hra, kód, boti, odpojení).
// Hodiny serveru se tu vypínají (HOPIK_SCALE) a zápas se posouvá ručně přes advance(), takže testy jsou rychlé.
process.env.HOPIK_SCALE = '1000000'; process.env.HOPIK_DROP_MS = '60';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const A = await import('./hopik/hopik.js');
const K = await import('./hopik/shared.js');
const P = await import('./hopik/phys.js');
const G = await import('./hopik/sim.js');
const N = await import('./hopik/nav.js');
const B = await import('./hopik/bot.js');
const { COLS, ROWS } = K;

for (const f of ['shared.js', 'phys.js']) assert.equal(fs.readFileSync('./hopik/' + f, 'utf8'), fs.readFileSync('./public/hopik/' + f, 'utf8'), f + ' musí být na serveru i v public/ stejný');
assert.equal(JSON.parse(fs.readFileSync('./hopik/package.json', 'utf8')).type, 'module');

// --- kusy: otáčení a rozměry
{
  assert.deepEqual(K.pieceSize('plank3', 0), [3, 1]); assert.deepEqual(K.pieceSize('plank3', 1), [1, 3]); assert.deepEqual(K.pieceSize('block', 3), [2, 2]);
  for (const id of K.PIECE_IDS) for (let r = 0; r < 4; r++) { const c = K.pieceCells(id, r); assert.ok(c.every(([x, y]) => x >= 0 && y >= 0), id); assert.ok(Math.min(...c.map((q) => q[0])) === 0 && Math.min(...c.map((q) => q[1])) === 0); assert.equal(new Set(c.map((q) => q.join())).size, c.length, 'bez duplicit ' + id); }
  assert.equal(K.faceOf('spikes', 0), 0); assert.equal(K.faceOf('spikes', 1), 1); assert.equal(K.faceOf('cannon', 1), 2); assert.equal(K.faceOf('cannon', 3), 0);
  assert.equal(K.rotatable('saw'), false); assert.equal(K.rotatable('plank3'), true);
  for (const p of Object.values(K.PIECES)) assert.ok(p.w > 0 && p.name && p.desc);
  assert.equal(K.CHARS.length, 8); assert.equal(K.charIdx(7), 7); assert.equal(K.charIdx(8), -1); assert.equal(K.charIdx('x'), -1); assert.equal(K.stageIdx(99), 0); assert.equal(K.stageIdx(2), 2);
}

// --- fyzika
{
  const W = P.buildWorld(0, []); const S = W.stage;
  const b = P.newBody(S.spawn[0], S.spawn[1] - P.PH / 2 - 0.01);
  for (let i = 0; i < 20; i++) P.stepBody(W, b, 0, i, null); assert.ok(b.gr, 'stojí na zemi'); assert.ok(Math.abs(b.y + P.PH / 2 - 16) < 0.02, 'a to přesně na hraně dlaždic: ' + b.y);
  const x0 = b.x; for (let i = 0; i < 30; i++) P.stepBody(W, b, P.IN.R, 20 + i, null); assert.ok(b.x > x0 + 4, 'běží doprava'); assert.ok(b.vx <= P.RUN + 0.01 && b.vx > P.RUN - 0.5, 'maximální rychlost');
  const b2 = P.newBody(2.5, 16 - P.PH / 2 - 0.01); for (let i = 0; i < 5; i++) P.stepBody(W, b2, 0, i, null); let top = b2.y; for (let i = 0; i < 60; i++) { P.stepBody(W, b2, P.IN.J, 10 + i, null); top = Math.min(top, b2.y); }
  const h = 16 - P.PH / 2 - top; assert.ok(h > 3.2 && h < 4.2, 'výška skoku ' + h.toFixed(2)); 
  const b3 = P.newBody(2.5, 16 - P.PH / 2 - 0.01); for (let i = 0; i < 5; i++) P.stepBody(W, b3, 0, i, null); let top3 = b3.y; for (let i = 0; i < 60; i++) { P.stepBody(W, b3, i < 3 ? P.IN.J : 0, 10 + i, null); top3 = Math.min(top3, b3.y); }
  assert.ok(16 - P.PH / 2 - top3 < h - 0.8, 'krátký stisk = nižší skok');
  const b4 = P.newBody(15.5, 3); for (let i = 0; i < 200; i++) P.stepBody(W, b4, 0, i, null); assert.ok(b4.y > ROWS, 'v díře padá'); assert.equal(P.hazardAt(W, 15.5, b4.y, 0), -1, 'pád = smrt');
  assert.ok(P.inGoal(W, { x: S.goal[0] + 1, y: S.goal[1] + 1 }) && !P.inGoal(W, { x: 3, y: 3 }));
}

// --- pokládání kusů
{
  const W = P.buildWorld(0, []);
  assert.ok(P.canPlace(W, 'plank3', 0, 8, 5)); assert.ok(!P.canPlace(W, 'plank3', 0, 0, 16), 'do země ne'); assert.ok(!P.canPlace(W, 'plank3', 0, 30, 5), 'přes okraj ne'); assert.ok(!P.canPlace(W, 'plank3', 0, 25, 5), 'zakázaná zóna u cíle');
  assert.ok(!P.canPlace(W, 'plank3', 0, 1, 12), 'zakázaná zóna u startu'); assert.ok(!P.canPlace(W, 'plank3', 0, -1, 5));
  const pc = { id: 1, type: 'plank3', r: 0, x: 8, y: 5, owner: 0, round: 1 }; P.addPlaced(W, pc); assert.ok(!P.canPlace(W, 'plank3', 0, 9, 5), 'kusy se nepřekrývají'); assert.ok(P.canPlace(W, 'plank3', 0, 8, 6));
  const g = G.newGame([{ name: 'a', char: 0 }, { name: 'b', char: 1 }], 3, 0); assert.equal(g.pieces.length, 0);
  const W2 = P.buildWorld(0, g.pieces); P.addPlaced(W2, pc); assert.equal(g.pieces.length, 0, 'addPlaced nesmí měnit cizí pole kusů');
}

// --- kolo: výběr, pokládání, běh, bodování
const toPhase = (g, ph, max = 5000) => { for (let i = 0; i < max && g.phase !== ph; i++) { G.tick(g); G.clearEvents(g); } assert.equal(g.phase, ph); };
function setup(n = 2, seed = 5, stage = 0) {
  const g = G.newGame(Array.from({ length: n }, (_, i) => ({ name: 'H' + i, char: i })), seed, stage);
  for (let i = 0; i < n; i++) assert.ok(G.pickPiece(g, i, g.offers.findIndex((o) => o.by < 0)));
  assert.equal(g.phase, 'place');
  return g;
}
const harmless = (g, i) => { for (let k = 0; k < 400; k++) { const x = (k * 7 + i * 3) % 28, y = 2 + (k % 6); if (G.placePiece(g, i, x, y, 0) === 'ok') return true; } return false; };
{
  const g = G.newGame([{ name: 'a', char: 0 }, { name: 'b', char: 1 }], 5, 0); assert.equal(g.phase, 'pick'); assert.ok(g.offers.length >= 4);
  assert.ok(g.offers.some((o) => K.PIECES[o.type].kind === 'hazard') && g.offers.some((o) => K.PIECES[o.type].kind !== 'hazard'), 'nabídka má plošinu i past');
  assert.ok(G.pickPiece(g, 0, 0)); assert.ok(!G.pickPiece(g, 1, 0), 'kus lze vzít jen jednou'); assert.ok(!G.pickPiece(g, 0, 1), 'a jen jeden'); assert.ok(G.pickPiece(g, 1, 1)); assert.equal(g.phase, 'place');
  assert.equal(G.placePiece(g, 0, 99, 99, 0), 'invalid'); assert.equal(G.placePiece(g, 0, NaN, 5, 0), 'no');
  assert.ok(harmless(g, 0)); assert.equal(g.phase, 'place'); assert.equal(G.placePiece(g, 0, 3, 3, 0), 'no', 'dvakrát ne'); assert.ok(harmless(g, 1)); assert.equal(g.phase, 'reveal'); assert.equal(g.pieces.length, 2);
  toPhase(g, 'count'); assert.equal(g.run.bodies.length, 2); toPhase(g, 'run');
  // nikdo nedoběhne: konec po limitu, 0 bodů
  toPhase(g, 'score', 2000); assert.deepEqual(g.players.map((p) => p.pts), [0, 0]); assert.ok(g.roundRes.none); assert.equal(g.round, 1);
  toPhase(g, 'pick'); assert.equal(g.round, 2); assert.equal(g.pieces.length, 2, 'kusy zůstávají na trati');
}
{ // jediný doběhne: 10 + 5 + 10; v cíli nebo mrtvý už se nehýbe
  const g = setup(2); assert.ok(harmless(g, 0)); assert.ok(harmless(g, 1)); toPhase(g, 'run');
  const S = g.W.stage; const b = g.run.bodies[0]; b.x = S.goal[0] + 1; b.y = S.goal[1] + 1; G.tick(g); assert.ok(g.run.fin[0] >= 0); assert.equal(g.run.first, 0); assert.ok(g.ev.some((e) => e[0] === 'f'));
  G.clientDie(g, 1, -1); assert.ok(g.run.dead[1]); toPhase(g, 'score', 600); assert.deepEqual(g.roundRes.rows.map((r) => r.total), [25, 0]); assert.deepEqual(g.players.map((p) => p.pts), [25, 0]);
}
{ // doběhnou oba: první 15, druhý 10, ale když doběhnou VŠICHNI, body se nedávají
  const g = setup(3); for (let i = 0; i < 3; i++) assert.ok(harmless(g, i)); toPhase(g, 'run'); const S = g.W.stage;
  for (const i of [1, 0]) { const b = g.run.bodies[i]; b.x = S.goal[0] + 1; b.y = S.goal[1] + 1; G.tick(g); } assert.deepEqual(g.run.order, [1, 0]); G.clientDie(g, 2, 0);
  toPhase(g, 'score', 600); assert.deepEqual(g.roundRes.rows.map((r) => r.total), [10, 15, 0]);
  const g2 = setup(2); for (let i = 0; i < 2; i++) assert.ok(harmless(g2, i)); toPhase(g2, 'run'); for (const i of [0, 1]) { const b = g2.run.bodies[i]; b.x = g2.W.stage.goal[0] + 1; b.y = g2.W.stage.goal[1] + 1; G.tick(g2); }
  toPhase(g2, 'score', 600); assert.ok(g2.roundRes.all); assert.deepEqual(g2.players.map((p) => p.pts), [0, 0], 'moc snadná trať: nikdo nic');
}
{ // zabití pastí: 2 body za zabití, nejvýš 6; sebevražda nic nedává
  const g = setup(3); for (let i = 0; i < 3; i++) assert.ok(harmless(g, i)); toPhase(g, 'run');
  G.clientDie(g, 1, 1); G.clientDie(g, 2, 1); G.clientDie(g, 0, 1); G.clientDie(g, 0, -1); toPhase(g, 'score', 2000);
  assert.deepEqual(g.roundRes.rows.map((r) => r.kills), [4, 0, 0], 'dvě zabité a vlastní past nic nedává'); assert.equal(g.players[0].pts, 4);
}
{ // zápas končí na 50 bodech (po kole) a remíza pokračuje
  const g = setup(2); g.players[0].pts = 40; g.players[1].pts = 45; for (let i = 0; i < 2; i++) assert.ok(harmless(g, i)); toPhase(g, 'run');
  const b = g.run.bodies[0]; b.x = g.W.stage.goal[0] + 1; b.y = g.W.stage.goal[1] + 1; G.tick(g); G.clientDie(g, 1, 0); toPhase(g, 'score', 600); assert.equal(g.over.winner, 0); assert.deepEqual(g.over.pts, [65, 45]); toPhase(g, 'over', 300);
  const h = setup(2); h.players[0].pts = 40; h.players[1].pts = 65; for (let i = 0; i < 2; i++) assert.ok(harmless(h, i)); toPhase(h, 'run'); const c = h.run.bodies[0]; c.x = h.W.stage.goal[0] + 1; c.y = h.W.stage.goal[1] + 1; G.tick(h); G.clientDie(h, 1, 0);
  toPhase(h, 'score', 600); assert.deepEqual(h.players.map((p) => p.pts), [65, 65]); assert.equal(h.over, null, 'remíza na 50+ pokračuje dalším kolem'); toPhase(h, 'pick', 300); assert.equal(h.round, 2);
}
{ // hlášení pohybu: skok o půl hřiště se zahodí, plynulý pohyb projde, mrtvý a boti se nehlásí
  const g = setup(2); for (let i = 0; i < 2; i++) assert.ok(harmless(g, i)); toPhase(g, 'run'); const b = g.run.bodies[0]; const x0 = b.x;
  G.report(g, 0, { x: x0 + 15, y: b.y, vx: 0, vy: 0, face: 1, gr: true }); assert.equal(b.x, x0, 'teleport se zahodí');
  G.tick(g); G.report(g, 0, { x: x0 + 0.5, y: b.y, vx: 8, vy: 0, face: 1, gr: true, wall: 0 }); assert.equal(b.x, x0 + 0.5); G.report(g, 0, { x: NaN, y: 1 }); assert.equal(b.x, x0 + 0.5);
  G.report(g, 0, { x: x0 + 0.6, y: b.y, vx: 1e9, vy: -1e9, face: -1, gr: false }); assert.ok(Math.abs(b.vx) <= 40 && Math.abs(b.vy) <= 40);
}
{ // opuštění hráče během hry: jeho kus propadne a hra pokračuje
  const g = setup(3); G.forfeit(g, 2); assert.ok(g.players[2].left); assert.ok(harmless(g, 0)); assert.ok(harmless(g, 1)); assert.equal(g.phase, 'reveal');
  toPhase(g, 'run'); assert.ok(g.run.dead[2]);
}

// --- všechny tři tratě jdou dokončit a boti na nich něco dokážou
for (let s = 0; s < K.STAGES.length; s++) {
  const W = P.buildWorld(s, []); const nv = N.buildNav(W); assert.ok(nv.reachable, 'trať ' + K.STAGES[s].name + ' je dosažitelná'); assert.ok(N.pathOf(nv).length >= 5);
  const S = K.STAGES[s]; assert.ok(S.forbid.length >= 2); const b = P.newBody(S.spawn[0], S.spawn[1] - P.PH / 2 - 0.01); assert.ok(P.fitsAt(W, b.x, b.y, 0), 'start se vejde');
}
for (const lv of [1, 2, 3]) {
  const g = G.newGame([{ name: 'a', char: 0, bot: lv }, { name: 'b', char: 1, bot: lv }, { name: 'c', char: 2, bot: lv }], 7 + lv, lv % 3); const st = g.players.map(() => ({})); let fin = 0, errs = 0;
  for (let n = 0; n < 9000 && g.round <= 3; n++) {
    const ph = g.phase;
    try {
      if (g.phase === 'pick') g.players.forEach((p, i) => { if (g.pick[i] === -1 && g.t > 3 + i * 2) assert.ok(G.pickPiece(g, i, B.botPick(g, i, lv))); });
      if (g.phase === 'place') g.players.forEach((p, i) => { if (!g.placed[i] && g.t > 5 + i * 3) { const c = B.botPlace(g, i, lv); if (c) { assert.equal(G.placePiece(g, i, c.x, c.y, c.r), 'ok', 'bot pokládá jen platně'); } else G.skipPlace(g, i); } });
      if (g.phase === 'run') g.players.forEach((p, i) => { if (!g.run.dead[i] && g.run.fin[i] < 0) { const m = B.botInput(g, i, lv, st[i]); assert.ok(Number.isInteger(m) && m >= 0 && m < 16); G.setInput(g, i, m); } });
    } catch (e) { errs++; throw e; }
    G.tick(g); G.clearEvents(g); if (g.over) g.over = null; if (ph === 'run' && g.phase === 'score') fin += g.roundRes.rows.filter((r) => r.fin).length;
  }
  assert.equal(errs, 0); assert.ok(g.pieces.length >= 6, 'boti pokládají kusy'); assert.ok(fin >= 1 || lv === 1, `boti úrovně ${lv} občas doběhnou (${fin})`);
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
  const r = A.api('me', { token: TK[0] }); assert.equal(r.status, 200); assert.equal(r.json.hopik.char, -1); assert.equal(r.json.hopik.games, 0); assert.equal(A.api('nic', { token: TK[0] }).status, 404);
  assert.equal(A.api('char', { token: TX, char: 1 }).status, 401); assert.equal(A.api('char', { token: TK[0], char: 99 }).status, 400); assert.equal(A.api('char', { token: TK[0], char: 'x' }).status, 400);
  assert.equal(A.api('char', { token: TK[0], char: 4 }).json.hopik.char, 4); assert.equal(A.hopikOf(accs[TK[0]]).char, 4); const t = A.hopikOf(accs[TK[0]]); t.wins = -5; t.char = 77; A.hopikOf(accs[TK[0]]); assert.equal(t.wins, 0, 'sanitizace'); assert.equal(t.char, -1); t.char = 4;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client() {
  const ws = { readyState: 1, out: [], h: {}, bufferedAmount: 0, send(d) { this.out.push(JSON.parse(d)); }, close() { this.readyState = 3; this.h.close && this.h.close(); }, on(e, f) { this.h[e] = f; }, terminate() { this.close(); }, ping() {} };
  A.handleConnection(ws); ws.say = (o) => ws.h.message(Buffer.from(JSON.stringify(o)));
  ws.last = (t) => [...ws.out].reverse().find((m) => m.t === t); ws.all = (t) => ws.out.filter((m) => m.t === t); return ws;
}
{ // rychlá hra: dva lidé se potkají, postavičky jsou různé, vybraná se bere z účtu
  const a = client(), b = client(); a.say({ t: 'quick', token: TK[0], name: 'Honza' }); b.say({ t: 'quick', token: TK[1], name: 'Eva', char: 4 });
  const room = A.rooms.get(a.last('joined').code); assert.equal(b.last('joined').code, room.code); assert.equal(room.phase, 'lobby'); assert.ok(room.autoAt);
  const st = b.last('state'); assert.equal(st.players.length, 2); assert.equal(st.players[0].char, 4, 'Honza má v účtu králíka'); assert.notEqual(st.players[1].char, 4, 'postavičky se neopakují'); assert.ok(K.charIdx(st.players[1].char) >= 0);
  b.say({ t: 'char', char: 4 }); assert.ok(b.last('err'), 'zabraná postavička'); b.say({ t: 'char', char: 6 }); assert.equal(a.last('state').players[1].char, 6); assert.equal(A.hopikOf(accs[TK[1]]).char, 6, 'zvolená se ukládá do účtu');
  b.say({ t: 'char', char: 99 }); assert.equal(a.last('state').players[1].char, 6);
  a.say({ t: 'start' }); assert.equal(room.phase, 'play', 'na rychlé hře začne i host (2 lidé)');
  const gm = b.last('game'); assert.equal(gm.ph, 'pick'); assert.equal(gm.offers.length, 4); assert.deepEqual(gm.pts, [0, 0]);
  a.say({ t: 'leave' }); b.say({ t: 'leave' }); assert.ok(!A.rooms.has(room.code));
}
{ // soukromá místnost: kód, pátý se nevejde, host vybírá stage, start přes tlačítko
  const cs = [0, 1, 2, 3, 4].map(() => client()); cs[0].say({ t: 'create', token: TK[0], name: 'Honza', stage: 2 }); const code = cs[0].last('joined').code; const room = A.rooms.get(code); assert.equal(room.stage, 2);
  for (let i = 1; i < 4; i++) cs[i].say({ t: 'join', code: code.toLowerCase(), token: TK[i], name: 'x' }); cs[4].say({ t: 'join', code, token: TK[4], name: 'y' }); assert.ok(cs[4].last('err').fatal); assert.equal(room.players.length, 4);
  assert.equal(new Set(room.players.map((p) => p.char)).size, 4, 'čtyři různé postavičky');
  cs[1].say({ t: 'start' }); assert.equal(room.phase, 'lobby', 'startovat smí jen host'); cs[1].say({ t: 'stage', stage: 1 }); assert.equal(room.stage, 2); cs[0].say({ t: 'stage', stage: 1 }); assert.equal(room.stage, 1);
  cs[2].say({ t: 'join', code: 'ZZZZ', token: TK[2] }); cs[0].say({ t: 'start' }); assert.equal(room.phase, 'play'); assert.equal(room.game.stage, 1); assert.equal(cs[3].last('state').you, 3);
  // výběr kusu: po jednom, kdo přijde později, dostane chybu (a nový stav)
  const k = cs[0].last('game').offers.findIndex(([, by]) => by < 0); cs[0].say({ t: 'pick', k }); cs[1].say({ t: 'pick', k }); assert.equal(room.game.pick[1], -1); assert.equal(cs[1].last('game').offers[k][1], 0);
  for (let i = 1; i < 4; i++) cs[i].say({ t: 'pick', k: room.game.offers.findIndex((o) => o.by < 0) }); assert.equal(room.game.phase, 'place'); assert.equal(cs[2].last('game').ph, 'place');
  cs[0].say({ t: 'place', x: 99, y: 99, r: 0 }); assert.equal(cs[0].last('placeres').ok, 'invalid'); cs[0].say({ t: 'ghost', x: 8, y: 5, r: 1 }); assert.equal(room.game.ghost[0].x, 8);
  for (let i = 0; i < 4; i++) { const ty = room.game.piece[i]; let ok = false; for (let q = 0; q < 300 && !ok; q++) { cs[i].say({ t: 'place', x: (q * 5 + i) % 28, y: 2 + (q % 8), r: 0 }); ok = room.game.placed[i]; } assert.ok(ok, 'položeno ' + ty); }
  assert.equal(room.game.phase, 'reveal'); assert.equal(cs[1].last('game').pieces.length, 4);
  A.advance(room, 50); assert.equal(room.game.phase, 'count'); assert.ok(cs[1].last('tk').p.length === 4);
  A.advance(room, 90); assert.equal(room.game.phase, 'run'); assert.ok(cs[0].all('tk').some((m) => m.ev && m.ev.some((e) => e[0] === 'go')), 'signál startu');
  // hlášení: plynulý pohyb se přenese ostatním
  const b0 = room.game.run.bodies[0]; cs[0].say({ t: 'rep', x: b0.x + 0.3, y: b0.y, vx: 7, vy: 0, face: 1, gr: 1, wall: 0 }); A.advance(room, 1); const sn = cs[1].last('tk'); assert.ok(Math.abs(sn.p[0][0] - (b0.x)) < 1e-6 && sn.p[0][2] === 7, 'poloha je ve snímku');
  cs[0].say({ t: 'rep', x: b0.x + 20, y: b0.y }); assert.ok(b0.x < 20, 'teleport zahozen');
  cs[2].say({ t: 'die', c: -1 }); A.advance(room, 1); assert.ok(room.game.run.dead[2]); assert.ok(cs[0].all('tk').some((m) => m.ev && m.ev.some((e) => e[0] === 'd' && e[1] === 2)));
  cs[1].say({ t: 'cr', gid: 0, k: 5 }); cs[1].say({ t: 'die', c: 'x' }); cs[1].say({ t: 'rep' }); cs[1].say({ t: 'ghost' }); cs[1].say({ t: 'neco' });
  for (const c of cs.slice(0, 4)) c.say({ t: 'leave' }); assert.ok(!A.rooms.has(code), 'prázdná místnost zmizí');
}
{ // proti botům: hra se rozjede hned, kola běží, po zápase se zapíše statistika a jde odveta
  const a = client(); a.say({ t: 'bot', token: TK[0], name: 'Honza', n: 2, level: 3, stage: 0 }); const st = a.last('state'); const room = A.rooms.get(st.code); assert.equal(st.phase, 'play'); assert.equal(st.players.length, 3); assert.ok(st.solo); assert.ok(st.players[1].bot === 3);
  assert.equal(new Set(st.players.map((p) => p.char)).size, 3);
  const g0 = A.hopikOf(accs[TK[0]]).games; const phases = new Set(); for (let i = 0; i < 40000 && room.phase === 'play'; i++) { A.advance(room, 1); phases.add(room.game.phase); }
  assert.equal(room.phase, 'over', 'zápas skončí (max 12 kol)'); for (const ph of ['pick', 'place', 'reveal', 'count', 'run', 'score']) assert.ok(phases.has(ph), 'fáze ' + ph);
  const fin = a.last('state'); assert.equal(fin.phase, 'over'); assert.ok(fin.result.rounds >= 1 && fin.result.pts.length === 3); assert.equal(A.hopikOf(accs[TK[0]]).games, g0 + 1); assert.ok(a.last('game').ph === 'over' || a.last('game').ph === 'score');
  a.say({ t: 'rematch' }); assert.equal(a.last('state').phase, 'play'); assert.equal(room.game.round, 1); a.say({ t: 'leave' }); assert.ok(!A.rooms.has(st.code));
}
{ // odpojení a návrat, pak vzdání
  const a = client(), b = client(); a.say({ t: 'create', token: TK[0], name: 'Honza' }); const code = a.last('joined').code; b.say({ t: 'join', code, token: TK[1], name: 'Eva' }); a.say({ t: 'start' }); const room = A.rooms.get(code);
  const tokB = b.last('joined').token; b.close(); assert.ok(a.last('state').drop, 'odpočet na návrat'); const b2 = client(); b2.say({ t: 'resume', code, token: tokB }); assert.ok(b2.last('state').phase === 'play' && b2.last('game').ph === 'pick', 'návrat do hry'); assert.equal(b2.last('state').drop, null);
  b2.say({ t: 'resume', code, token: 'zzz' }); b2.close(); await sleep(150); assert.ok(room.players[1].left, 'po čekání se vzdá'); assert.ok(room.game.players[1].left);
  a.say({ t: 'leave' }); assert.ok(!A.rooms.has(code)); const c = client(); c.say({ t: 'resume', code, token: tokB }); assert.ok(c.last('err').gone);
}
{ // jeden člověk odejde dobrovolně z lobby / z boje: ostatní pokračují
  const a = client(), b = client(), c = client(); a.say({ t: 'create', token: TK[0], name: 'Honza' }); const code = a.last('joined').code; b.say({ t: 'join', code, token: TK[1], name: 'Eva' }); c.say({ t: 'join', code, token: TK[2], name: 'Petr' });
  b.say({ t: 'leave' }); assert.equal(A.rooms.get(code).players.length, 2); a.say({ t: 'leave' }); assert.equal(A.rooms.get(code).host, A.rooms.get(code).players[0].id); c.say({ t: 'leave' }); assert.ok(!A.rooms.has(code));
  const x = client(); x.say({ t: 'start' }); x.say({ t: 'rep', x: 1, y: 1 }); x.say({ t: 'pick', k: 0 }); x.ws; const junk = client(); junk.h.message(Buffer.from('není json')); junk.h.message(Buffer.from('{"t":5}'));
  const d = client(); d.say({ t: 'join', code: 'NOPE', token: TK[0] }); assert.ok(d.last('err').fatal);
}
console.log('Hopík: všechny testy prošly');
process.exit(0);
