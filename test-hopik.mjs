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
  assert.equal(K.CHARS.length, 8); assert.equal(K.charIdx(7), 7); assert.equal(K.charIdx(8), -1); assert.equal(K.charIdx('x'), -1); assert.equal(K.stageIdx(99), 0); assert.equal(K.stageIdx(2), 2); assert.equal(K.STAGES.length, 10); assert.equal(K.stageIdx(9), 9); assert.equal(K.stageIdx(10), 0);
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

{ // dopad ('l') se hlásí jen při skutečném dopadu, ne při každém tiku stání na zemi (dřív to dělalo oblak prachu a spam zvuku)
  const W = P.buildWorld(0, []); const b = P.newBody(2.5, 16 - P.PH / 2 - 0.01); const ev = [];
  for (let k = 0; k < 120; k++) { const f = []; P.stepBody(W, b, k === 60 ? P.IN.J : 0, k, f); for (const e of f) ev.push([k, e]); }
  assert.ok(ev.filter(([k, e]) => e === 'l' && k > 3 && k < 60).length === 0, 'na zemi se nehlásí dopad'); assert.ok(ev.some(([k, e]) => e === 'j' && k === 60)); assert.ok(ev.some(([k, e]) => e === 'l' && k > 60 && k < 90), 'po skoku jeden dopad');
}
{ // boční pružina: otočené odrazovadlo (r = 1 doprava, 3 doleva, 2 dolů) vystřelí do strany; vzhůru zůstává stará pružina
  const pc = (r, x, y) => ({ id: 1, type: 'bounce', r, x, y, owner: 0, round: 1 });
  const W = P.buildWorld(0, [pc(1, 10, 14)]); assert.ok(W.hasSp && W.sp[14 * K.COLS + 10] === 2 && W.sp[15 * K.COLS + 10] === 2, 'pružina doprava je na stěně');
  const b = P.newBody(11.36, 16 - P.PH / 2 - 0.001); b.gr = true; P.stepBody(W, b, 0, 0, null); assert.ok(b.vx > 15, 'vpravo od pružiny doprava (' + b.vx + ')');
  const W3 = P.buildWorld(0, [pc(3, 10, 14)]); const c = P.newBody(9.64, 16 - P.PH / 2 - 0.001); c.gr = true; P.stepBody(W3, c, 0, 0, null); assert.ok(c.vx < -15, 'vlevo od pružiny doleva');
  const d = P.newBody(9.64, 16 - P.PH / 2 - 0.001); d.gr = true; P.stepBody(W, d, 0, 0, null); assert.ok(Math.abs(d.vx) < 5, 'ze zadní strany nic');
  const W0 = P.buildWorld(0, [pc(0, 10, 15)]); assert.ok(!W0.hasSp, 'vzhůru je obyčejné odrazovadlo'); assert.deepEqual(K.pieceCells('bounce', 1).sort(), [[0, 0], [0, 1]], 'otočené odrazovadlo je svislé');
  const W2 = P.buildWorld(0, [pc(2, 10, 5)]); const e = P.newBody(10.5, 6 + P.PH / 2 + 0.001); e.vy = -2; P.stepBody(W2, e, 0, 0, null); assert.ok(e.vy > 15, 'stropní pružina tlačí dolů (' + e.vy + ')');
}
{ // nové pasti: vrtule, kyvadlo, padací kámen, laser, pila na kolejnici, ventilátor – čisté funkce ticku
  const pcs = [{ id: 2, type: 'blades', r: 0, x: 10, y: 5, owner: 1, round: 1 }, { id: 3, type: 'pendulum', r: 0, x: 25, y: 0, owner: 0, round: 1 }, { id: 4, type: 'thwomp', r: 0, x: 8, y: 2, owner: 2, round: 1 },
    { id: 5, type: 'laser', r: 0, x: 2, y: 8, owner: 3, round: 1 }, { id: 6, type: 'rsaw', r: 0, x: 16, y: 12, owner: 1, round: 1 }, { id: 7, type: 'fan', r: 0, x: 4, y: 15, owner: 0, round: 1 }];
  const W = P.buildWorld(0, pcs); assert.equal(W.blades.length, 1); assert.equal(W.pends.length, 1); assert.equal(W.thwomps.length, 1); assert.equal(W.lasers.length, 1); assert.equal(W.rsaws.length, 1); assert.equal(W.fans.length, 1);
  const hz = (x, y, tk) => P.hazardAt(W, x, y, tk, 0.08);
  const Wb = P.buildWorld(0, [pcs[0]]); const hzb = (x, y, tk) => P.hazardAt(Wb, x, y, tk, 0.08); const bl = Wb.blades[0]; for (const tk of [0, 17, 60, 111]) { const a = P.bladeAngle(bl, tk); assert.equal(hzb(bl.px + Math.cos(a) * 1.8, bl.py + Math.sin(a) * 1.8, tk), 2, 'špička vrtule zabíjí'); assert.equal(hzb(bl.px + Math.cos(a + 1.57) * 1.8, bl.py + Math.sin(a + 1.57) * 1.8, tk), 0, 'mezi lopatkami je volno'); }
  const pe = W.pends[0]; for (const tk of [0, 30, 77]) { const q = P.pendBall(pe, tk); assert.equal(hz(q[0], q[1], tk), 1, 'koule kyvadla zabíjí'); }
  const th = W.thwomps[0]; let top = -1, bot = -1; for (let k = 0; k < 240; k++) { const o = P.thwompOff(th, k); if (top < 0 && o === 0) top = k; if (bot < 0 && o === 4) bot = k; }
  assert.ok(top >= 0 && bot >= 0); assert.equal(hz(9, 3, top), 3, 'kámen nahoře zabíjí'); assert.equal(hz(9, 7, top), 0, 'dole je v tu chvíli volno'); assert.equal(hz(9, 7, bot), 3, 'kámen dole zabíjí'); assert.equal(hz(9, 3, bot), 0, 'nahoře je v tu chvíli volno');
  const ls = W.lasers[0]; assert.ok(ls.len > 10, 'paprsek letí až ke zdi (' + ls.len + ')'); let on = -1, off = -1, warn = -1; for (let k = 0; k < K.LASER_PERIOD; k++) { const s2 = P.laserState(ls, k); if (s2 === 2 && on < 0) on = k; if (s2 === 0 && off < 0) off = k; if (s2 === 1 && warn < 0) warn = k; }
  assert.ok(on >= 0 && off >= 0 && warn >= 0); assert.equal(hz(8, 8.5, on), 4, 'laser pálí'); assert.equal(hz(8, 8.5, warn), 0, 'varování nezabíjí'); assert.equal(hz(8, 8.5, off), 0);
  const rs = W.rsaws[0]; const p0 = P.rsawPos(rs, 0, [0, 0]); let mn = 99, mx = -99; for (let k = 0; k < K.RSAW_PERIOD; k++) { const q = P.rsawPos(rs, k, [0, 0]); mn = Math.min(mn, q[0]); mx = Math.max(mx, q[0]); assert.equal(hz(q[0], q[1], k), 2, 'pila zabíjí tam, kde je'); } assert.ok(mx - mn > 4.5, 'pila jezdí po dráze'); void p0;
  const fa = W.fans[0]; assert.ok(fa.len >= 4, 'dosah ventilátoru'); let onk = -1, offk = -1; for (let k = 0; k < K.FAN.period; k++) { if (P.fanOn(fa, k) && onk < 0) onk = k; if (!P.fanOn(fa, k) && offk < 0) offk = k; }
  const b = P.newBody(4.5, 15 - P.PH / 2 - 1); b.vy = 0; for (let k = 0; k < 3; k++) P.stepBody(W, b, 0, onk, null); assert.ok(b.vy < 0, 'ventilátor nahoru zvedá (' + b.vy + ')');
  const b2 = P.newBody(4.5, 15 - P.PH / 2 - 1); b2.vy = 0; for (let k = 0; k < 3; k++) P.stepBody(W, b2, 0, offk, null); assert.ok(b2.vy > 0, 'vypnutý ventilátor nefouká');
  const Wf = P.buildWorld(0, [{ id: 9, type: 'fan', r: 1, x: 4, y: 14, owner: 0, round: 1 }]); const b3 = P.newBody(6.5, 14.5); b3.gr = true; const onT = [...Array(K.FAN.period).keys()].find((k) => P.fanOn(Wf.fans[0], k)); const x0 = b3.x; P.stepBody(Wf, b3, 0, onT, null); assert.ok(b3.x > x0 + 0.1, 'boční ventilátor odfoukne doprava');
  const N0 = N.buildNav(W); assert.ok(N0.reachable, 'časované pasti navigační graf ignoruje');
  // neotočitelné kusy se otočí zpátky na 0, rozměry
  assert.ok(K.rotatable('thwomp') && !K.rotatable('blades') && !K.rotatable('pendulum') && K.rotatable('laser') && K.rotatable('rsaw') && K.rotatable('fan'));
  assert.deepEqual(K.pieceSize('thwomp', 0), [2, 6]); assert.deepEqual(K.pieceSize('thwomp', 1), [6, 2]); assert.deepEqual(K.pieceSize('rsaw', 0), [6, 1]); assert.deepEqual(K.pieceSize('rsaw', 1), [1, 6]);
  assert.ok(K.PIECE_IDS.filter((id) => K.PIECES[id].kind === 'hazard').length >= 16, 'aspoň 12 nových pastí k původním čtyřem');
}

{ // padací kámen: shora pevný (dá se na něm stát), zespodu a ze stran zabíjí; otočením se mění dráha, kámen zůstává vzpřímený
  const mk = (r, x, y) => P.buildWorld(0, [{ id: 4, type: 'thwomp', r, x, y, owner: 2, round: 1 }]);
  const W = mk(0, 8, 2); const th = W.thwomps[0]; assert.equal(th.dir, 2); let top = -1, bot = -1; for (let k = 0; k < 240; k++) { const o = P.thwompOff(th, k); if (top < 0 && o === 0) top = k; if (bot < 0 && o === 4) bot = k; }
  const hz = (x, y, tk) => P.hazardAt(W, x, y, tk, 0.08);
  assert.equal(hz(9, 2 - P.PH / 2 - 0.001, top), 0, 'stojící na kameni je v bezpečí'); assert.equal(hz(8 - P.PW / 2 - 0.01, 3, top), 3, 'dotek ze strany zabíjí'); assert.equal(hz(9, 4 + P.PH / 2 + 0.01, top), 3, 'dotek zespodu zabíjí');
  assert.ok(!P.fitsAt(W, 9, 2 - P.PH / 2 + 0.3, top) && P.fitsAt(W, 9, 2 - P.PH / 2 - 0.01, top), 'kámen je pevný');
  const b = P.newBody(9, 2 - P.PH / 2 - 0.002); b.vy = 0; let alive = true, minY = 99, maxY = -99; for (let k = 0; k < 160; k++) { const tk = top + k; P.stepBody(W, b, 0, tk, null); const hh = P.hazardAt(W, b.x, b.y, tk, 0.08); if (hh) alive = false; minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y); }
  assert.ok(alive, 'kámen s hráčem na hřbetě ho nezabije'); assert.ok(maxY - minY > 3.3, 'hráč jede s kamenem dolů a nahoru (' + (maxY - minY).toFixed(2) + ')');
  const Wl = mk(1, 8, 4); const tl = Wl.thwomps[0]; assert.equal(tl.dir, 3); assert.deepEqual(K.pieceSize('thwomp', 1), [6, 2]); const pos0 = P.thwompPos(tl, top, [0, 0]); const posB = P.thwompPos(tl, bot, [0, 0]);
  assert.ok(Math.abs(pos0[0] - 12) < 1e-6 && Math.abs(pos0[1] - 4) < 1e-6, 'doleva míří z pravého konce dráhy (' + pos0 + ')'); assert.ok(Math.abs(posB[0] - 8) < 1e-6, 'a dojede na levý konec (' + posB + ')');
  const Wu = mk(2, 8, 4); assert.equal(Wu.thwomps[0].dir, 0); const pu = P.thwompPos(Wu.thwomps[0], top, [0, 0]); assert.ok(Math.abs(pu[1] - 8) < 1e-6, 'nahoru začíná dole');
  const Wr = mk(3, 8, 4); assert.equal(Wr.thwomps[0].dir, 1);
}
{ // bodáky: hroty zabíjejí jen na své straně, ze zbylých stran jde stát
  const mk = (r, x, y) => P.buildWorld(0, [{ id: 1, type: 'spikes', r, x, y, owner: 1, round: 1 }]);
  assert.deepEqual(K.pieceSize('spikes', 0), [3, 2]); assert.deepEqual(K.pieceSize('spikes', 1), [2, 3]);
  const W = mk(0, 10, 14); assert.equal(W.g[15 * COLS + 11], K.T.SOLID, 'základ je pevný'); assert.equal(W.g[14 * COLS + 11], 0, 'řada hrotů pevná není'); assert.equal(P.hazardAt(W, 11.5, 14.6, 0, 0.08), 2, 'hroty zabíjejí');
  const b = P.newBody(11.5, 12); for (let k = 0; k < 40; k++) P.stepBody(W, b, 0, k, null); assert.ok(P.hazardAt(W, b.x, b.y, 40, 0.08) === 2, 'shora na hroty padá do smrti');
  const Wr = mk(1, 10, 12); const sp = K.spikeSplit('spikes', 1); assert.equal(sp.face, 1); assert.ok(sp.spike.every(([x]) => x === 1) && sp.base.every(([x]) => x === 0));
  const c = P.newBody(10.5, 12 - P.PH / 2 - 0.001); for (let k = 0; k < 40; k++) P.stepBody(Wr, c, 0, k, null); assert.ok(c.gr && P.hazardAt(Wr, c.x, c.y, 40, 0.08) === 0 && Math.abs(c.y + P.PH / 2 - 12) < 0.02, 'na straně bez hrotů se dá stát');
  assert.equal(P.hazardAt(Wr, 11.5, 13.5, 0, 0.08), 2, 'ze strany hrotů zabíjí');
  for (let r = 0; r < 4; r++) { const s2 = K.spikeSplit('spikes', r); assert.equal(s2.spike.length, 3); assert.equal(s2.base.length, 3); assert.equal(s2.face, r); }
}
{ // nové pasti: výsuvné bodáky, rampouch, odrážeč, mizející plošina, černá díra, valoun
  const one = (type, r, x, y) => P.buildWorld(0, [{ id: 3, type, r, x, y, owner: 1, round: 1 }]);
  const Wr = one('retract', 0, 8, 14); const ro = Wr.rspikes[0]; const st = (k) => P.retractState(ro, k); let s0 = -1, s1 = -1, s2 = -1; for (let k = 0; k < K.RETRACT.period; k++) { if (st(k) === 0 && s0 < 0) s0 = k; if (st(k) === 1 && s1 < 0) s1 = k; if (st(k) === 2 && s2 < 0) s2 = k; }
  assert.ok(s0 >= 0 && s1 >= 0 && s2 >= 0); assert.equal(P.hazardAt(Wr, 9.5, 14.6, s2, 0.08), 2, 'vysunuté zabíjí'); assert.equal(P.hazardAt(Wr, 9.5, 14.6, s0, 0.08), 0, 'schované ne'); assert.equal(P.hazardAt(Wr, 9.5, 14.6, s1, 0.08), 0, 'varování nezabíjí');
  const Wi = one('icicle', 0, 10, 3); const ic = Wi.icicles[0]; assert.ok(ic.len > 8, 'rampouch padá až na zem (' + ic.len + ')'); let live = 0, dead = 0; const o = {}; for (let k = 0; k < K.ICICLE.period; k++) { P.icicleState(ic, k, o); if (o.live) { live++; assert.equal(P.hazardAt(Wi, 10.5, 4 + o.off + 0.5, k, 0.08), 2, 'rampouch zabíjí tam, kde je'); } else dead++; }
  assert.ok(live > 60 && dead > 10, 'rampouch po dopadu přestane zabíjet'); let fell = false; for (let k = 0; k < K.ICICLE.period; k++) { P.icicleState(ic, k, o); if (o.off > 3) fell = true; } assert.ok(fell, 'rampouch spadne');
  const Wb = one('bumper', 0, 8, 10); const bb = P.newBody(8.0, 10.5); P.stepBody(Wb, bb, 0, 0, null); assert.ok(bb.vx < -8, 'odrážeč odpálí doleva (' + bb.vx + ')'); const bb2 = P.newBody(9.0, 10.5); P.stepBody(Wb, bb2, 0, 0, null); assert.ok(bb2.vx > 8, 'a doprava (' + bb2.vx + ')'); assert.equal(P.hazardAt(Wb, 8.5, 10.5, 0), 0, 'odrážeč nezabíjí');
  const Wv = one('vanish', 0, 8, 10); const va = Wv.vanish[0]; let solid = -1, gone = -1, warn = -1; for (let k = 0; k < K.VANISH.period; k++) { const v = P.vanishState(va, k); if (v === 0 && solid < 0) solid = k; if (v === 2 && gone < 0) gone = k; if (v === 1 && warn < 0) warn = k; }
  assert.ok(solid >= 0 && gone >= 0 && warn >= 0); assert.ok(!P.fitsAt(Wv, 9.5, 10.5, solid) && !P.fitsAt(Wv, 9.5, 10.5, warn) && P.fitsAt(Wv, 9.5, 10.5, gone), 'plošina je pevná, kromě fáze, kdy chybí');
  const cb = P.newBody(9.5, 10 - P.PH / 2 - 0.002); cb.vy = 0; P.stepBody(Wv, cb, 0, solid, null); assert.ok(cb.gr, 'na mizející plošině se stojí');
  const Wh = one('hole', 0, 10, 8); const ho = Wh.holes[0]; let hon = -1, hoff = -1; for (let k = 0; k < K.HOLE.period; k++) { const v = P.holeState(ho, k); if (v === 2 && hon < 0) hon = k; if (v === 0 && hoff < 0) hoff = k; }
  assert.equal(P.hazardAt(Wh, 10.5, 8.5, hon, 0.08), 2, 'jádro díry zabíjí'); assert.equal(P.hazardAt(Wh, 10.5, 8.5, hoff, 0.08), 0, 'klidná díra nezabíjí');
  const h1 = P.newBody(13, 8.5); P.stepBody(Wh, h1, 0, hon, null); assert.ok(h1.vx < -0.1, 'díra přitahuje (' + h1.vx + ')'); const h2 = P.newBody(13, 8.5); P.stepBody(Wh, h2, 0, hoff, null); assert.ok(Math.abs(h2.vx) < 0.01, 'klidná nepřitahuje');
  const Wo = one('boulder', 0, 10, 14); const bo = Wo.boulders[0]; const q = [0, 0, 0, 0]; let rolled = 0, minx = 99, maxx = -99; for (let k = 0; k < K.BOULDER.period; k++) { P.boulderPos(bo, k, q); if (q[3] === 2) { rolled++; minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); assert.equal(P.hazardAt(Wo, q[0], q[1], k, 0.08), 2, 'valoun zabíjí'); } else assert.equal(P.hazardAt(Wo, q[0], q[1], k, 0.08), 0); }
  assert.ok(rolled > 100 && maxx - minx > 5, 'valoun se kutálí po dráze'); const Wl = one('boulder', 1, 10, 14); P.boulderPos(Wl.boulders[0], 0, q); assert.ok(q[0] > 14, 'otočený valoun začíná vpravo (' + q[0] + ')');
  assert.deepEqual(K.pieceSize('boulder', 0), [8, 1]); for (const id of ['retract', 'icicle', 'bumper', 'vanish', 'hole', 'boulder']) assert.ok(K.PIECES[id] && K.PIECES[id].kind === 'hazard', id);
  const Wn = P.buildWorld(0, [3, 4, 5, 6, 7, 8].map((i, n) => ({ id: i, type: ['retract', 'icicle', 'bumper', 'vanish', 'hole', 'boulder'][n], r: 0, x: 6 + n * 3, y: 2 + n, owner: 0, round: 1 }))); assert.ok(N.buildNav(Wn).reachable, 'navigační graf časované pasti ignoruje');
}
{ // nastavení zápasu a bonusové kolo ve dvou
  assert.deepEqual(K.cleanCfg(null), K.CFG_DEFAULT); assert.deepEqual(K.cleanCfg({ pick: 999, place: 40, win: 75, rounds: 'x', bonus: 0 }), { ...K.CFG_DEFAULT, place: 40, win: 75, bonus: 0 });
  const g0 = G.newGame([{ name: 'a', char: 0 }, { name: 'b', char: 1 }], 3, 0, { pick: 8, place: 15, run: 20, win: 30, rounds: 6 }); assert.equal(g0.len.pick, 8 * K.TPS); assert.equal(g0.len.run, 20 * K.TPS); assert.ok(!g0.bonus, '1. kolo bonus nemá'); assert.equal(g0.cfg.win, 30);
  const g = G.newGame([{ name: 'a', char: 0 }, { name: 'b', char: 1 }], 3, 0); const playRound = (bonusExpected) => {
    assert.equal(g.bonus, bonusExpected, 'bonus v kole ' + g.round); const picks = []; const n = bonusExpected ? 2 : 1;
    for (let s = 0; s < n; s++) { assert.equal(g.phase, 'pick'); assert.equal(g.sub, s); for (let i = 0; i < 2; i++) assert.ok(G.pickPiece(g, i, g.offers.findIndex((o) => o.by < 0))); assert.equal(g.phase, 'place'); for (let i = 0; i < 2; i++) assert.ok(harmless(g, i), 'položit'); }
    assert.equal(g.phase, 'reveal'); assert.equal(g.pieces.filter((p) => p.round === g.round).length, 2 * n, 'v kole se položilo ' + 2 * n + ' kusů'); toPhase(g, 'score'); toPhase(g, 'pick');
  };
  playRound(false); playRound(true); playRound(false); playRound(true);
  const g3 = G.newGame([0, 1, 2].map((i) => ({ name: 'p' + i, char: i })), 3, 0); g3.round = 1; assert.ok(!K.isBonusRound(g3.cfg, 2, 3), 've třech bonus není'); assert.ok(!K.isBonusRound({ ...g.cfg, bonus: 0 }, 2, 2), 'vypnutý bonus');
}
// --- všechny tratě jdou dokončit a boti na nich něco dokážou
for (let s = 0; s < K.STAGES.length; s++) {
  const W = P.buildWorld(s, []); const nv = N.buildNav(W); assert.ok(nv.reachable, 'trať ' + K.STAGES[s].name + ' je dosažitelná'); assert.ok(N.pathOf(nv).length >= 5);
  const S = K.STAGES[s]; assert.ok(S.forbid.length >= 2); const b = P.newBody(S.spawn[0], S.spawn[1] - P.PH / 2 - 0.01); assert.ok(P.fitsAt(W, b.x, b.y, 0), 'start se vejde');
}
for (const lv of [1, 2, 3]) {
  const g = G.newGame([{ name: 'a', char: 0, bot: lv }, { name: 'b', char: 1, bot: lv }, { name: 'c', char: 2, bot: lv }], 7 + lv, [0, 3, 4][lv - 1]); const st = g.players.map(() => ({})); let fin = 0, errs = 0;
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
{ // měna a obchod: startovních 100 coinů, koupě za coiny, výběr originálu / koupené věci, neplatné věci se zahodí
  const me = A.api('me', { token: TK[0] }).json.hopik; assert.equal(me.coins, 100); assert.deepEqual(me.own, []); assert.deepEqual(Object.keys(me.eq), ['hat', 'glasses', 'boots', 'back']);
  assert.equal(A.api('buy', { token: TX, cat: 'hat', id: 'beanie' }).status, 401); assert.equal(A.api('buy', { token: TK[0], cat: 'nic', id: 'beanie' }).status, 400); assert.equal(A.api('buy', { token: TK[0], cat: 'hat', id: 'nic' }).status, 400);
  assert.equal(A.api('buy', { token: TK[0], cat: 'back', id: 'angel' }).status, 402, 'na andělská křídla (300) coiny nestačí');
  const b = A.api('buy', { token: TK[0], cat: 'hat', id: 'beanie' }); assert.equal(b.status, 200); assert.equal(b.json.hopik.coins, 60); assert.equal(b.json.hopik.eq.hat, 'beanie'); assert.ok(b.json.hopik.own.includes('hat:beanie'));
  assert.equal(A.api('buy', { token: TK[0], cat: 'hat', id: 'beanie' }).status, 409, 'dvakrát nekoupí');
  assert.equal(A.api('equip', { token: TK[0], cat: 'hat', id: 'tophat' }).status, 403, 'nekoupené nasadit nejde'); assert.equal(A.api('equip', { token: TK[0], cat: 'boots', id: '-' }).status, 403, '„bez“ umí jen čepice');
  assert.equal(A.api('equip', { token: TK[0], cat: 'hat', id: '-' }).json.hopik.eq.hat, '-'); assert.equal(A.api('equip', { token: TK[0], cat: 'hat', id: '' }).json.hopik.eq.hat, ''); assert.equal(A.api('equip', { token: TK[0], cat: 'hat', id: 'beanie' }).json.hopik.eq.hat, 'beanie');
  const ta = A.hopikOf(accs[TK[0]]); ta.eq.glasses = 'shades'; ta.coins = 'x'; const ta2 = A.hopikOf(accs[TK[0]]); assert.equal(ta2.eq.glasses, '', 'nekoupená výbava se zahodí'); assert.equal(ta2.coins, 100, 'poškozené coiny začnou znovu'); ta2.coins = 60;
  for (const cat of K.COSM_SLOTS) assert.ok(K.COSM[cat].length >= 10, 'aspoň deset věcí v kategorii ' + cat);
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
  cs[1].say({ t: 'cfg', cfg: { win: 100 } }); assert.equal(room.cfg.win, K.CFG_DEFAULT.win, 'nastavení smí měnit jen host'); cs[0].say({ t: 'cfg', cfg: { win: 100, pick: 8, place: 7, bonus: 0 } }); assert.equal(room.cfg.win, 100); assert.equal(room.cfg.pick, 8); assert.equal(room.cfg.place, K.CFG_DEFAULT.place, 'neplatná hodnota se zahodí'); assert.equal(cs[2].last('state').cfg.win, 100, 'ostatní nastavení vidí');
  cs[1].say({ t: 'start' }); assert.equal(room.phase, 'lobby', 'startovat smí jen host'); cs[1].say({ t: 'stage', stage: 1 }); assert.equal(room.stage, 2); cs[0].say({ t: 'stage', stage: 1 }); assert.equal(room.stage, 1);
  cs[2].say({ t: 'join', code: 'ZZZZ', token: TK[2] }); cs[0].say({ t: 'start' }); assert.equal(room.phase, 'play'); assert.equal(room.game.stage, 1); assert.equal(room.game.cfg.win, 100); assert.equal(room.game.len.pick, 8 * K.TPS, 'délka výběru podle nastavení'); assert.equal(cs[3].last('game').cfg.pick, 8); assert.equal(cs[3].last('state').you, 3);
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
  const fin = a.last('state'); assert.equal(fin.phase, 'over'); assert.ok(fin.result.rounds >= 1 && fin.result.pts.length === 3); assert.equal(A.hopikOf(accs[TK[0]]).games, g0 + 1); assert.ok(fin.result.coins && fin.result.coins[0] && fin.result.coins[0].gain >= A.COINS.play, 'za zápas jsou coiny'); assert.equal(A.hopikOf(accs[TK[0]]).coins, 60 + fin.result.coins[0].gain); assert.ok(a.last('game').ph === 'over' || a.last('game').ph === 'score');
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
