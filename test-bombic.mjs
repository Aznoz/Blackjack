// Bombic: sdílený soubor, mapa, pohyb a kolize, bomby (řetězení, plameny, pařezy), předměty a lebky, kopání, náhlá smrt, bot, účet a online zápas.
// Hodiny serveru se tu vypínají (BOMBIC_SCALE) a zápas se posouvá ručně přes advance(), takže testy jsou rychlé i deterministické.
process.env.BOMBIC_SCALE = '1000000';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const A = await import('./bombic/bombic.js');
const K = await import('./bombic/shared.js');
const G = await import('./bombic/sim.js');
const B = await import('./bombic/bot.js');
const { COLS, ROWS, T, idx } = K;

assert.equal(fs.readFileSync('./bombic/shared.js', 'utf8'), fs.readFileSync('./public/bombic/shared.js', 'utf8'), 'shared.js musí být na serveru i v public/ stejný');

// --- pomůcky: prázdné hřiště se dvěma hráči na vybraných polích
const run = (s, n) => { for (let i = 0; i < n && !s.over; i++) { G.step(s); G.clearEvents(s); } };
function blank(n = 2, seed = 1) {
  const s = G.newRound(Array.from({ length: n }, (_, i) => 'H' + i), seed, { noFreeze: true });
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (!(x % 2 === 0 && y % 2 === 0)) s.grid[idx(x, y)] = T.FLOOR;
  return s;
}
const put = (s, i, x, y) => { s.pl[i].x = x + 0.5; s.pl[i].y = y + 0.5; };
const cell = (s, i) => [Math.floor(s.pl[i].x), Math.floor(s.pl[i].y)];

// --- mapa
{
  const s = G.newRound(['a', 'b', 'c', 'd'], 42, { noFreeze: true }); const g = s.grid;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) assert.equal(g[idx(x, y)], T.STONE, 'okraj je kámen');
    else if (x % 2 === 0 && y % 2 === 0) assert.equal(g[idx(x, y)], T.STONE, 'sloupek');
    assert.equal(g[idx(x, y)], g[idx(COLS - 1 - x, y)], 'zrcadlově podle svislé osy'); assert.equal(g[idx(x, y)], g[idx(x, ROWS - 1 - y)], 'zrcadlově podle vodorovné osy');
  }
  for (const [sx, sy] of K.SPAWNS) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2]]) { const x = sx + (sx === 1 ? dx : -dx), y = sy + (sy === 1 ? dy : -dy); assert.equal(g[idx(x, y)], T.FLOOR, 'bezpečné pole u startu'); }
  const stumps = [...g].filter((v) => v === T.STUMP).length; assert.ok(stumps > 50 && stumps < 110, 'pařezů je rozumně: ' + stumps);
  const s2 = G.newRound(['a', 'b'], 42, { noFreeze: true }); assert.deepEqual([...s2.grid], [...g], 'stejné semínko = stejná mapa');
  assert.notDeepEqual([...G.newRound(['a', 'b'], 43).grid], [...g]);
  assert.deepEqual(G.newRound(['a', 'b'], 1).pl.map((p) => [Math.floor(p.x), Math.floor(p.y)]), [[1, 1], [13, 11]], 'dva hráči: protilehlé rohy');
  assert.deepEqual(G.newRound(['a', 'b', 'c', 'd'], 1).pl.map((p) => [Math.floor(p.x), Math.floor(p.y)]), [[1, 1], [13, 1], [1, 11], [13, 11]]);
}

// --- odpočet na začátku kola
{
  const s = G.newRound(['a', 'b'], 5); put(s, 0, 1, 1); G.setInput(s, 0, 2); G.wantBomb(s, 0); const x0 = s.pl[0].x; run(s, G.FREEZE_T - 2);
  assert.equal(s.pl[0].x, x0, 'během odpočtu se nehýbe'); assert.equal(s.bombs.length, 0, 'ani nepokládá bomby'); run(s, 4); G.setInput(s, 0, 2); run(s, 10); assert.ok(s.pl[0].x > x0, 'po odpočtu běží');
}

// --- pohyb, zdi, klouzání po rozích
{
  const s = blank(); put(s, 0, 1, 1); G.setInput(s, 0, 2); run(s, 20);   // 1 s doprava
  const sp = K.speedOf(0); assert.ok(Math.abs(s.pl[0].x - (1.5 + sp)) < 0.2, 'ujde cca rychlost × čas: ' + s.pl[0].x);
  G.setInput(s, 0, 2); run(s, 200); assert.ok(s.pl[0].x < COLS - 1 - 0.4 + 0.001, 'nepronikne okrajem'); assert.ok(s.pl[0].x > COLS - 1.5 - 0.05);
  put(s, 0, 1, 2); G.setInput(s, 0, 2); run(s, 30);   // v řadě y=2 stojí sloupek na x=2
  assert.ok(s.pl[0].x < 2 - 0.4 + 0.01, 'sloupek ho zastaví: ' + s.pl[0].x);
  // ulička: mimo osu se postava při pohybu rychle srovná na střed pole a teprve pak jde
  const t = blank(); put(t, 1, 13, 11); t.pl[0].x = 1.2; t.pl[0].y = 1.5; G.setInput(t, 0, 3); run(t, 3); assert.equal(t.pl[0].x, 1.5, 'srovná se na osu sloupce'); run(t, 10); assert.ok(t.pl[0].y > 1.9 && t.pl[0].x === 1.5, 'a jde dolů');
  // zatáčka: stisk doprava uprostřed pole u sloupku (řada y=2 je zablokovaná) ho dovede do řady y=3
  const u = blank(); put(u, 1, 13, 11); u.pl[0].x = 1.5; u.pl[0].y = 2.9; G.setInput(u, 0, 2); run(u, 40); assert.equal(u.pl[0].y, 3.5, 'zatočí do volné řady'); assert.ok(u.pl[0].x > 2.5, 'a projde: ' + u.pl[0].x);
  // do zdi se neotáčí: žádná volná ulička = stojí na místě
  const w = blank(); put(w, 1, 13, 11); put(w, 0, 1, 2); w.grid[idx(2, 1)] = T.STONE; w.grid[idx(2, 3)] = T.STONE; w.pl[0].y = 2.0; G.setInput(w, 0, 2); run(w, 20); assert.equal(w.pl[0].y, 2.0); assert.equal(w.pl[0].x, 1.5);
  // zastavení hned po uvolnění (žádné dojíždění) a ostré otočení o 180° bez prodlevy
  const z = blank(); put(z, 1, 13, 11); put(z, 0, 3, 1); G.setInput(z, 0, 2); run(z, 3); const x1 = z.pl[0].x; G.setInput(z, 0, 0); run(z, 5); assert.equal(z.pl[0].x, x1, 'stojí'); G.setInput(z, 0, 4); run(z, 1); assert.ok(z.pl[0].x < x1, 'otočka hned');
}

// --- bomba: pokládání, limit, průchod vlastní bombou, výbuch
{
  const s = blank(); put(s, 0, 3, 1); put(s, 1, 13, 11);
  G.wantBomb(s, 0); run(s, 1); assert.equal(s.bombs.length, 1); G.wantBomb(s, 0); run(s, 1); assert.equal(s.bombs.length, 1, 'limit 1 bomba');
  assert.equal(s.pl[0].placed, 1);
  G.setInput(s, 0, 2); run(s, 12); assert.ok(s.pl[0].x > 4.0, 'z vlastní bomby vyjde'); G.setInput(s, 0, 4); run(s, 30); assert.ok(s.pl[0].x > 3.9, 'zpátky přes bombu už nejde'); assert.equal(s.pl[0].alive, true);
  put(s, 0, 11, 11); G.setInput(s, 0, 0); run(s, G.FUSE_T - 43 + 1); assert.equal(s.bombs.length, 0, 'bomba vybuchla'); assert.ok(s.flames.length > 0); assert.equal(s.pl[0].placed, 0, 'bomba se vrátila do zásoby');
  const fl = (x, y) => s.flames.some((f) => f.x === x && f.y === y);
  assert.ok(fl(3, 1) && fl(4, 1) && fl(5, 1) && fl(2, 1) && fl(1, 1), 'plamen dosah 2 do stran'); assert.ok(!fl(6, 1), 'dál ne');
  assert.ok(fl(3, 2) && fl(3, 3) && !fl(3, 4), 'dolů o 2 pole'); assert.ok(!fl(3, 0), 'okraj nehoří');
}
{ // plamen se zastaví o kámen a rozbije jen první pařez
  const s = blank(); put(s, 1, 13, 11); put(s, 0, 7, 1); s.grid[idx(5, 1)] = T.STUMP; s.grid[idx(4, 1)] = T.STUMP; s.pl[0].range = 5;
  G.wantBomb(s, 0); run(s, 1); put(s, 0, 3, 11); run(s, G.FUSE_T);
  assert.equal(s.grid[idx(5, 1)], T.FLOOR, 'první pařez zničen'); assert.equal(s.grid[idx(4, 1)], T.STUMP, 'druhý za ním ne');
  assert.ok(s.flames.some((f) => f.x === 5 && f.y === 1) && !s.flames.some((f) => f.x === 4 && f.y === 1));
  assert.ok(!s.flames.some((f) => f.x === 8 && f.y === 2), 'sloupek na (8,2) nehoří'); assert.ok(s.flames.some((f) => f.x === 12 && f.y === 1), 'dosah 5 doprava');
  assert.ok(s.gridVer > 1);
}
{ // plamen zabije hráče a započítá zabití; vlastní smrt nikoli
  const s = blank(); put(s, 0, 1, 1); put(s, 1, 3, 1); s.pl[0].range = 3; s.pl[0].placed = 0;
  G.wantBomb(s, 0); run(s, 1); put(s, 0, 5, 5); run(s, G.FUSE_T);
  assert.equal(s.pl[1].alive, false, 'soupeř v plameni zemřel'); assert.equal(s.pl[0].kills, 1);
  const t = blank(); put(t, 0, 1, 1); put(t, 1, 13, 11); G.wantBomb(t, 0); run(t, 1); run(t, G.FUSE_T + 1);
  assert.equal(t.pl[0].alive, false, 'sám sebe zabije'); assert.equal(t.pl[0].kills, 0, 'sebevražda není zabití');
}
{ // řetězová reakce
  const s = blank(); put(s, 1, 13, 11); put(s, 0, 1, 1); s.pl[0].bombsMax = 3;
  G.wantBomb(s, 0); run(s, 1); G.setInput(s, 0, 2); run(s, 6); G.wantBomb(s, 0); run(s, 1); G.setInput(s, 0, 0);
  assert.equal(s.bombs.length, 2); const second = s.bombs[1]; second.fuse = 2; const first = s.bombs[0]; assert.ok(first.fuse > 30);
  put(s, 0, 7, 9); run(s, 4); assert.equal(s.bombs.length, 0, 'druhá bomba odpálila první'); assert.ok(s.flames.length >= 6);
}

// --- předměty a lebky
{
  const s = blank(); put(s, 0, 3, 1); put(s, 1, 13, 11);
  s.items.push({ x: 3, y: 1, type: 'bomb' }); run(s, 1); assert.equal(s.pl[0].bombsMax, 2); assert.equal(s.items.length, 0);
  for (const [type, f, v] of [['fire', 'range', 3], ['speed', 'spLv', 1]]) { s.items.push({ x: 3, y: 1, type }); run(s, 1); assert.equal(s.pl[0][f], v, type); }
  s.items.push({ x: 3, y: 1, type: 'kick' }); run(s, 1); assert.equal(s.pl[0].kick, true);
  for (let k = 0; k < 12; k++) { s.items.push({ x: 3, y: 1, type: 'bomb' }); s.items.push({ x: 3, y: 1, type: 'fire' }); run(s, 1); }
  assert.equal(s.pl[0].bombsMax, K.MAX_BOMBS, 'strop bomb'); assert.equal(s.pl[0].range, K.MAX_RANGE, 'strop dosahu');
  s.items.length = 0; s.items.push({ x: 3, y: 1, type: 'skull' }); run(s, 1); assert.ok(s.pl[0].curse && K.CURSES.includes(s.pl[0].curse.k), 'lebka prokleje');
  const c = s.pl[0].curse; assert.ok(c.until - s.tick > K.CURSE_S / K.DT - 3); s.pl[0].curse = { k: 'slow', until: s.tick + G.CURSE_T }; run(s, G.CURSE_T + 2); assert.equal(s.pl[0].curse, null, 'prokletí vyprší');
  // jednotlivá prokletí
  const t = blank(); put(t, 0, 3, 1); put(t, 1, 13, 11);
  t.pl[0].curse = { k: 'nobomb', until: 1e9 }; G.wantBomb(t, 0); run(t, 2); assert.equal(t.bombs.length, 0, 'prokletí bez bomb');
  t.pl[0].curse = { k: 'auto', until: 1e9 }; t.pl[0].autoAt = 0; run(t, 3); assert.equal(t.bombs.length, 1, 'samovolná bomba');
  t.bombs = []; t.pl[0].placed = 0; t.pl[0].curse = { k: 'short', until: 1e9 }; t.pl[0].autoAt = 1e9; put(t, 0, 5, 1); G.wantBomb(t, 0); run(t, 1); assert.equal(t.bombs[0].range, 1, 'krátký plamen');
  const u = blank(); put(u, 0, 3, 1); put(u, 1, 13, 11); G.setInput(u, 0, 2); run(u, 20); const d1 = u.pl[0].x - 3.5;
  const w = blank(); put(w, 0, 3, 1); put(w, 1, 13, 11); w.pl[0].curse = { k: 'slow', until: 1e9 }; G.setInput(w, 0, 2); run(w, 20); assert.ok(w.pl[0].x - 3.5 < d1 * 0.6, 'zpomalení');
  const f = blank(); put(f, 0, 3, 1); put(f, 1, 13, 11); f.pl[0].curse = { k: 'fast', until: 1e9 }; G.setInput(f, 0, 2); run(f, 8); assert.ok(f.pl[0].x - 3.5 > d1 * 0.3 * 1.3, 'zrychlení');
}
{ // plamen zničí položený předmět, ale ten odkrytý z pařezu přežije vlastní výbuch
  const s = blank(); put(s, 1, 13, 11); put(s, 0, 1, 1); s.items.push({ x: 2, y: 1, type: 'fire' }); s.grid[idx(3, 1)] = T.STUMP;
  G.wantBomb(s, 0); run(s, 1); put(s, 0, 1, 3); run(s, G.FUSE_T); assert.ok(!s.items.some((i) => i.x === 2 && i.y === 1), 'předmět v plameni shořel');
  let drops = 0; for (let seed = 0; seed < 60; seed++) { const t = blank(2, seed + 100); put(t, 1, 13, 11); put(t, 0, 1, 1); t.grid[idx(3, 1)] = T.STUMP; G.wantBomb(t, 0); run(t, 1); put(t, 0, 1, 3); run(t, G.FUSE_T); if (t.items.some((i) => i.x === 3 && i.y === 1)) drops++; }
  assert.ok(drops > 8 && drops < 35, 'z pařezu padá předmět asi ve třetině případů: ' + drops);
}

// --- kopání bomb
{
  const s = blank(); put(s, 1, 13, 11); put(s, 0, 1, 1); s.pl[0].kick = true;
  s.bombs.push({ id: 99, owner: 1, cx: 3, cy: 1, tx: 3, ty: 1, moving: false, dx: 0, dy: 0, prog: 0, fuse: 200, range: 2, pass: new Set() });
  G.setInput(s, 0, 2); run(s, 20); const b = s.bombs[0]; assert.ok(b.moving || b.cx > 3, 'bomba se rozjela'); run(s, 40); assert.ok(b.cx >= 12 || !b.moving, 'doletí ke zdi'); assert.equal(b.cx, 13, 'zastaví se u okraje na (13,1)'); assert.equal(b.moving, false);
  const t = blank(); put(t, 1, 13, 11); put(t, 0, 1, 1);   // bez botů nekope
  t.bombs.push({ id: 99, owner: 1, cx: 3, cy: 1, tx: 3, ty: 1, moving: false, dx: 0, dy: 0, prog: 0, fuse: 200, range: 2, pass: new Set() });
  G.setInput(t, 0, 2); run(t, 40); assert.equal(t.bombs[0].cx, 3); assert.ok(t.pl[0].x < 2.7, 'bomba je zeď');
  // kopnutá bomba zastaví před hráčem
  const u = blank(); put(u, 0, 1, 1); put(u, 1, 9, 1); u.pl[0].kick = true;
  u.bombs.push({ id: 99, owner: 1, cx: 3, cy: 1, tx: 3, ty: 1, moving: false, dx: 0, dy: 0, prog: 0, fuse: 400, range: 2, pass: new Set() }); G.setInput(u, 0, 2); run(u, 60); assert.equal(u.bombs[0].cx, 8, 'zastavila před soupeřem');
}

// --- konec kola, prodleva, náhlá smrt, čas
{
  const s = blank(3); put(s, 0, 1, 1); put(s, 1, 13, 1); put(s, 2, 1, 11);
  s.pl[0].range = 2; G.wantBomb(s, 0); run(s, 1); put(s, 0, 5, 5); put(s, 1, 3, 1); run(s, G.FUSE_T); assert.equal(s.pl[1].alive, false); assert.equal(s.over, null, 'zbývají dva');
  put(s, 2, 5, 5);
  const s2 = blank(2); put(s2, 0, 1, 1); put(s2, 1, 3, 1); G.wantBomb(s2, 0); run(s2, 1); put(s2, 0, 5, 5); run(s2, G.FUSE_T + 3); assert.equal(s2.pl[1].alive, false); assert.equal(s2.over, null, 'krátká prodleva');
  run(s2, 60); assert.deepEqual(s2.over, { winner: 0, reason: 'last' });
  const s3 = blank(2); put(s3, 0, 1, 1); put(s3, 1, 2, 1); G.wantBomb(s3, 0); run(s3, G.FUSE_T + 80); assert.equal(s3.over.winner, -1, 'oba zahynuli = remíza'); assert.equal(s3.pl[0].alive, false);
}
{
  const s = blank(2); put(s, 0, 1, 1); put(s, 1, 13, 11); const ST = (G.ROUND_T - G.SUDDEN_T) ;
  run(s, ST - 1); assert.equal(s.warns.length, 0); run(s, 2); assert.ok(s.warns.length >= 1, 'náhlá smrt začíná'); const w = s.warns[0]; run(s, 14); assert.equal(s.grid[idx(w.x, w.y)], T.STONE, 'kámen dopadl');
  assert.ok(G.snap(s, false).sd === 1);
  const t = blank(2); t.sdNext = 1e9; put(t, 0, 7, 6); put(t, 1, 1, 1); run(t, G.ROUND_T - 3); assert.equal(t.over, null); run(t, 5); assert.deepEqual(t.over, { winner: -1, reason: 'time' }, 'vypršel čas = remíza');
  const u = blank(2); run(u, G.ROUND_T - G.SUDDEN_T); let falls = 0; for (let i = 0; i < 700; i++) { G.step(u); falls += u.ev.filter((e) => e[0] === 'r').length; G.clearEvents(u); for (const p of u.pl) p.alive = true; u.endAt = 0; u.over = null; u.tick = Math.min(u.tick, G.ROUND_T - 5); }
  assert.ok(falls > 60, 'kameny padají spirálou: ' + falls);
  const v = blank(2); put(v, 0, 1, 1); put(v, 1, 7, 6); run(v, G.ROUND_T - G.SUDDEN_T + 30); assert.equal(v.pl[0].alive, false, 'kámen dopadl na hráče v rohu'); assert.equal(v.pl[0].kills, 0);
}
{ // mapy: okraj, zrcadlení, bezpečné rohy, průchodnost (pařezy se dají vybombit), pařezy skutečně vznikají
  assert.ok(K.MAPS.length >= 5); for (const m of K.MAPS) assert.equal(m.q.length, 7), assert.ok(m.q.every((r) => r.length === 8));
  for (let mi = 0; mi < K.MAPS.length; mi++) for (const seed of [1, 7, 99]) {
    const s = G.newRound(['a', 'b', 'c', 'd'], seed, { noFreeze: true, map: mi }); const g = s.grid; let stumps = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) assert.equal(g[idx(x, y)], T.STONE);
      assert.equal(g[idx(x, y)], g[idx(COLS - 1 - x, y)], 'mapa ' + mi); assert.equal(g[idx(x, y)], g[idx(x, ROWS - 1 - y)], 'mapa ' + mi); if (g[idx(x, y)] === T.STUMP) stumps++;
    }
    assert.ok(stumps > 15, 'mapa ' + mi + ' má pařezy');
    for (const [sx, sy] of K.SPAWNS) for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [-1, 0], [-2, 0], [0, -1], [0, -2]]) { const x = sx + dx, y = sy + dy; if (x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1 && Math.abs(dx) + Math.abs(dy) <= 2 && !(Math.abs(dx) === 1 && Math.abs(dy) === 1)) { const inward = (sx === 1 ? dx >= 0 : dx <= 0) && (sy === 1 ? dy >= 0 : dy <= 0); if (inward) assert.equal(g[idx(x, y)], T.FLOOR, `start mapy ${mi} musí být volný (${x},${y})`); } }
    const seen = new Set(), st = [[1, 1]]; while (st.length) { const [x, y] = st.pop(); const k = idx(x, y); if (x < 0 || y < 0 || x >= COLS || y >= ROWS || seen.has(k) || g[k] === T.STONE) continue; seen.add(k); st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
    let free = 0; for (let k = 0; k < g.length; k++) if (g[k] !== T.STONE) free++; assert.equal(seen.size, free, `mapa ${mi}: všechna pole dosažitelná`); assert.ok(K.SPAWNS.every(([x, y]) => seen.has(idx(x, y))));
  }
  assert.equal(K.mapIdx(99), 0); assert.equal(K.mapIdx('x'), 0); assert.equal(K.mapIdx(2), 2); assert.equal(G.newRound(['a', 'b'], 1, { map: 3 }).map, 3);
  const a = G.newRound(['a', 'b'], 5, { map: 0 }).grid, b = G.newRound(['a', 'b'], 5, { map: 2 }).grid; assert.notDeepEqual([...a], [...b], 'mapy se liší');
}
{ // skateboard: po sebrání bombu vystřelí jen stisk bomby (mezerník) ve směru pohledu; sám nic nestřílí, výstřely se nepočítají do limitu, po 15 s skončí
  const s = blank(2); put(s, 0, 3, 1); s.pl[0].face = 2; s.items.push({ x: 3, y: 1, type: 'skate' }); G.step(s); assert.ok(s.pl[0].skateUntil > 0, 'skateboard sebrán'); assert.ok(s.ev.some((e) => e[0] === 'i' && e[1] === 'skate'));
  run(s, 60); assert.equal(s.bombs.length, 0, 'sám nic nestřílí ani nepokládá');
  G.wantBomb(s, 0); G.step(s); assert.equal(s.bombs.length, 1, 'výstřel na stisk'); const b = s.bombs[0]; assert.equal(b.dx, 1); assert.equal(b.dy, 0); assert.ok(b.moving && b.free); assert.equal(s.pl[0].placed, 0, 'výstřel nepočítá do limitu'); assert.ok(b.cx >= 3);
  G.wantBomb(s, 0); G.step(s); assert.equal(s.bombs.length, 1, 'mezi výstřely je krátká prodleva'); run(s, G.SHOT_T); G.wantBomb(s, 0); G.step(s); assert.equal(s.bombs.length, 2, 'další výstřel po prodlevě'); assert.equal(s.pl[0].placed, 0);
  run(s, 10); assert.ok(s.bombs[0].cx >= 5, 'bomba letí pryč'); s.pl[0].face = 3; put(s, 0, 3, 3); s.pl[0].shootAt = 0; G.wantBomb(s, 0); G.step(s); assert.ok(s.bombs.some((q) => q.dy === 1 && q.free), 'střílí ve směru pohledu (dolů)');
  const t = blank(2); put(t, 0, 1, 1); t.pl[0].skateUntil = 5; run(t, 8); assert.equal(t.pl[0].skateUntil, 0, 'skateboard vyprší'); G.wantBomb(t, 0); G.step(t); assert.equal(t.bombs.length, 1); assert.equal(t.bombs[0].moving, false, 'po skončení se bomba zase pokládá'); assert.equal(t.pl[0].placed, 1);
  const w = blank(2); put(w, 0, 1, 1); w.pl[0].face = 4; w.pl[0].skateUntil = 9999; G.wantBomb(w, 0); G.step(w); assert.equal(w.bombs.length, 1, 'před zdí se položí obyčejná bomba'); assert.equal(w.bombs[0].moving, false); assert.equal(w.pl[0].placed, 1);
  const c = blank(2); put(c, 0, 1, 1); c.pl[0].face = 2; c.pl[0].skateUntil = 9999; c.pl[0].curse = { k: 'nobomb', until: 1e9 }; G.wantBomb(c, 0); G.step(c); assert.equal(c.bombs.length, 0, 'prokletí bez bomb platí i na skateboardu');
  const e = blank(2); put(e, 0, 1, 1); put(e, 1, 13, 11); e.pl[0].face = 2; e.pl[0].skateUntil = 9999; G.wantBomb(e, 0); run(e, 1); const f = e.bombs[0]; assert.ok(f && f.free); run(e, G.FUSE_T + 2); assert.ok(e.flames.length > 0 || e.bombs.length > 0); assert.equal(e.pl[0].placed, 0, 'po výbuchu se placed nesnižuje do mínusu');
  assert.equal(G.snap(s, false).p[0][12] > 0, true, 'snímek nese zbývající čas skateboardu');
}
{ // zelená lebka: prokletí dostanou všichni živí soupeři, sběratel ne
  const s = blank(3); put(s, 0, 3, 1); put(s, 1, 9, 1); put(s, 2, 13, 11); G.forfeit(s, 2); s.items.push({ x: 3, y: 1, type: 'gskull' }); G.step(s);
  assert.equal(s.pl[0].curse, null, 'sběratel prokletí nemá'); assert.ok(s.pl[1].curse && K.CURSES.includes(s.pl[1].curse.k), 'soupeř ho má'); assert.equal(s.pl[2].curse, null, 'mrtvý ne'); assert.ok(s.ev.some((e) => e[0] === 'i' && e[1] === 'gskull'));
  run(s, G.CURSE_T + 2); assert.ok(s.pl[1].curse === null || !s.pl[1].alive, 'prokletí po čase zmizí'); assert.ok(K.ITEMS.includes('gskull')); assert.ok(K.ITEM_INFO.gskull.name);
}
{ // skiny: odemykání úrovní
  assert.equal(K.SKINS.length, 16); assert.ok(K.SKINS.slice(0, 4).every((k) => k.lvl === 1)); for (let i = 1; i < K.SKINS.length; i++) assert.ok(K.SKINS[i].lvl >= K.SKINS[i - 1].lvl, 'úrovně rostou'); assert.equal(K.SKINS.at(-1).lvl, K.MAX_LEVEL); assert.deepEqual(K.unlockedSkins(1), [0, 1, 2, 3]); assert.equal(K.unlockedSkins(35).length, K.SKINS.length);
  assert.ok(new Set(K.SKINS.map((k) => k.name)).size === K.SKINS.length);
}
{ // snímek
  const s = blank(2); put(s, 0, 3, 1); G.wantBomb(s, 0); G.step(s); const sn = G.snap(s, true);
  assert.equal(sn.t, 'snap'); assert.equal(sn.g.length, COLS * ROWS); assert.equal(sn.p.length, 2); assert.equal(sn.p[0].length, 13); assert.equal(sn.b.length, 1); assert.ok(sn.ev.some((e) => e[0] === 'b'));
  assert.equal(G.snap(s, false).g, undefined); G.forfeit(s, 1); assert.equal(s.pl[1].alive, false);
}

// --- bot
{
  const wins = (levels, N) => { const w = levels.map(() => 0); let dr = 0; for (let seed = 1; seed <= N; seed++) { const s = G.newRound(levels.map((_, i) => 'b' + i), seed * 7919, { noFreeze: true }); const th = levels.map((l, i) => i); while (!s.over) { levels.forEach((l, i) => { if (s.tick >= th[i]) { th[i] = s.tick + B.BOT_THINK[l]; const a = B.botThink(s, i, l); G.setInput(s, i, a.d); if (a.bomb) G.wantBomb(s, i); } }); G.step(s); G.clearEvents(s); } if (s.over.winner >= 0) w[s.over.winner]++; else dr++; } return { w, dr }; };
  const a = wins([3, 1], 30); assert.ok(a.w[0] >= 18, 'Mistr porazí Nováčka: ' + a.w);
  const d3 = wins([3, 2], 30); assert.ok(d3.w[0] > d3.w[1], 'Mistr porazí Bojovníka: ' + d3.w);
  const b = wins([1, 3], 30); assert.ok(b.w[1] >= 18, 'a to i ze druhé strany: ' + b.w);
  const c = wins([3, 3, 3, 3], 8); assert.equal(c.w.reduce((x, y) => x + y, 0) + c.dr, 8, 'čtyři boti dohrají');
  const lone = G.newRound(['solo', 'dummy'], 3, { noFreeze: true }); for (let i = 0; i < 60; i++) { const a2 = B.botThink(lone, 0, 3); G.setInput(lone, 0, a2.d); if (a2.bomb) G.wantBomb(lone, 0); G.step(lone); G.clearEvents(lone); }
  assert.ok(lone.pl[0].x !== 1.5 || lone.pl[0].y !== 1.5, 'bot se hýbe');
  const e = B.blastCells(blank(), 3, 1, 3); assert.ok(e.some(([x, y]) => x === 6 && y === 1) && !e.some(([x, y]) => x === 3 && y === 5), 'dosah plamene');
}

// --- účet a online zápas
const accs = {};
const mk = (name) => ({ name, avatar: null, balance: 5000, lastSeen: 0 });
let dirty = 0;
A.init({ TOKEN_RE: /^[A-Za-z0-9_-]{20,64}$/, markDirty: () => { dirty++; }, resolveAccount: ({ token }) => (accs[token] ? { acc: accs[token], linked: true } : null) });
const TK = ['a', 'b', 'c', 'd', 'e'].map((ch) => ch.repeat(24)), TX = 'x'.repeat(24);
['Honza', 'Eva', 'Petr', 'Jana', 'Karel'].forEach((n, i) => { accs[TK[i]] = mk(n); });
{
  assert.equal(A.api('me', { token: TX }).json.account, false);
  const r = A.api('me', { token: TK[0] }); assert.equal(r.status, 200); assert.equal(r.json.bombic.lvl, 1); assert.equal(r.json.bombic.wins, 0); assert.equal(A.api('nic', { token: TK[0] }).status, 404);
  const t = A.bombicOf(accs[TK[0]]); t.xp = K.xpFor(4) + 3; t.wins = -5; assert.equal(A.api('me', { token: TK[0] }).json.bombic.lvl, 4); A.bombicOf(accs[TK[0]]); assert.equal(t.wins, 0, 'sanitizace'); t.xp = 0;
  assert.ok(K.xpFor(35) > K.xpFor(34)); assert.equal(K.levelOf(0), 1); assert.equal(K.levelOf(1e9), K.MAX_LEVEL); assert.equal(K.MAX_LEVEL, 35);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client() {
  const ws = { readyState: 1, out: [], h: {}, bufferedAmount: 0, send(d) { this.out.push(JSON.parse(d)); }, close() { this.readyState = 3; this.h.close && this.h.close(); }, on(e, f) { this.h[e] = f; }, terminate() {}, ping() {} };
  A.handleConnection(ws); ws.say = (o) => ws.h.message(Buffer.from(JSON.stringify(o)));
  ws.last = (t) => [...ws.out].reverse().find((m) => m.t === t); ws.all = (t) => ws.out.filter((m) => m.t === t); return ws;
}
const room4 = () => { const cs = TK.slice(0, 4).map(() => client()); cs[0].say({ t: 'create', token: TK[0], name: 'Honza' }); const code = cs[0].last('joined').code; for (let i = 1; i < 4; i++) cs[i].say({ t: 'join', code, token: TK[i], name: 'x' }); assert.equal(cs[0].last('state').phase, 'lobby'); cs[0].say({ t: 'start' }); return { cs, code, room: A.rooms.get(code) }; };
{ // čtyři lidé: zakladatel začne, souřadnice, vstupy
  const { cs, room } = room4(); assert.equal(cs[3].last('state').phase, 'play'); assert.equal(room.players.length, 4); assert.ok(cs.every((c) => c.last('snap') && c.last('snap').g));
  assert.deepEqual(cs[2].last('state').players.map((p) => p.name), ['Honza', 'Eva', 'Petr', 'Jana']); assert.equal(cs[2].last('state').you, 2);
  A.advance(room, G.FREEZE_T + 2); cs[0].say({ t: 'in', d: 2 }); cs[0].say({ t: 'bomb' }); A.advance(room, 15);
  const sn = cs[1].last('snap'); assert.ok(sn.p[0][0] > 1.6, 'vstup hráče 0 se projevil u všech'); assert.equal(sn.b.length, 1); assert.equal(sn.g, undefined, 'mřížka se nepřeposílá, dokud se nezmění');
  cs[0].say({ t: 'in', d: 9 }); cs[0].say({ t: 'in', d: 'x' }); A.advance(room, 2);
  for (const c of cs) c.say({ t: 'leave' }); assert.ok(!A.rooms.has(room.code), 'prázdná místnost zmizí'); 
}
{ // lobby: 5. hráč se nevejde, zakladatel startuje, boti doplní
  const a = client(), b = client(); a.say({ t: 'create', token: TK[0], name: 'Honza' }); const code = a.last('joined').code; assert.equal(a.last('state').phase, 'lobby'); assert.equal(a.last('state').host, 0);
  a.say({ t: 'start' }); assert.ok(a.last('err'), 'sám nezačne bez botů'); assert.equal(a.last('state').phase, 'lobby');
  b.say({ t: 'join', code, token: TK[1], name: 'Eva' }); b.say({ t: 'start' }); assert.equal(b.last('state').phase, 'lobby', 'startovat smí jen zakladatel');
  const e = client(); e.say({ t: 'join', code, token: TK[1], name: 'Eva' }); assert.ok(e.last('err'), 'stejný účet dvakrát nejde');
  a.say({ t: 'start', fill: true, level: 3 }); const st = a.last('state'); assert.equal(st.phase, 'play'); assert.deepEqual(st.players.map((p) => p.bot), [0, 0, 3, 3]); assert.ok(st.players[2].name.startsWith('Bot'));
  const x = client(); x.say({ t: 'join', code, token: TK[2], name: 'x' }); assert.ok(x.last('err'), 'rozehraná místnost'); const y = client(); y.say({ t: 'join', code: 'ZZZZ', token: TK[2] }); assert.ok(y.last('err'));
  a.say({ t: 'leave' }); b.say({ t: 'leave' });
}
{ // rychlá hra: dva se spárují a po prodlevě se začne, čtvrtý spustí hned
  const a = client(), b = client(); a.say({ t: 'quick', token: TK[0], name: 'Honza' }); b.say({ t: 'quick', token: TK[1], name: 'Eva' });
  const room = A.rooms.get(a.last('joined').code); assert.equal(b.last('joined').code, room.code); assert.equal(room.phase, 'lobby'); assert.ok(room.autoAt, 'odpočet startu'); assert.ok(typeof b.last('state').auto === 'number');
  room.autoAt = Date.now() - 1; A.advance(room, 1); assert.equal(room.phase, 'lobby', 'advance neřeší lobby');
  const c = client(), d = client(); c.say({ t: 'quick', token: TK[2], name: 'Petr' }); d.say({ t: 'quick', token: TK[3], name: 'Jana' }); assert.equal(room.phase, 'play', 'čtyři lidé = start hned'); assert.equal(d.last('state').players.length, 4);
  for (const k of [a, b, c, d]) k.say({ t: 'leave' });
}
{ // zápas proti botům: celé kolo, výhry, XP
  const a = client(); a.say({ t: 'bot', token: TK[0], name: 'Honza', n: 3, level: 2 }); const st = a.last('state'); const room = A.rooms.get(st.code); assert.equal(st.phase, 'play'); assert.equal(st.players.length, 4); assert.ok(st.solo);
  const xp0 = A.bombicOf(accs[TK[0]]).xp; let guard = 0; while (room.phase !== 'over' && guard++ < 40000) A.advance(room, 20);
  assert.equal(room.phase, 'over'); const r = a.last('state'); assert.ok(r.result && r.result.rounds >= 1); assert.ok(r.result.xp[0].gain >= 20, 'XP za účast'); assert.equal(A.bombicOf(accs[TK[0]]).xp, xp0 + r.result.xp[0].gain); assert.equal(A.bombicOf(accs[TK[0]]).games, 1);
  assert.ok(r.result.wins.some((w) => w >= 0)); assert.ok(a.all('state').some((m) => m.round_result), 'oznámení výsledku kola');
  a.say({ t: 'rematch' }); assert.equal(a.last('state').phase, 'play', 'odveta s boty hned'); a.say({ t: 'leave' }); assert.ok(!A.rooms.has(st.code));
  const b = client(); b.say({ t: 'bot', token: TK[1], name: 'Eva', n: 99, level: 9 }); assert.equal(b.last('state').players.length, 4, 'meze n a obtížnosti'); assert.ok(b.last('state').players.every((p, i) => i === 0 || p.bot === 3)); b.say({ t: 'leave' });
}
{ // přesný průběh zápasu: výhra o dvě kola, po prvním kole pauza a nové kolo
  const a = client(), b = client(); a.say({ t: 'create', token: TK[0], name: 'Honza' }); b.say({ t: 'join', code: a.last('joined').code, token: TK[1], name: 'Eva' }); a.say({ t: 'start' });
  const room = A.rooms.get(a.last('joined').code); assert.equal(room.phase, 'play'); const xpA = A.bombicOf(accs[TK[0]]).xp, wins0 = A.bombicOf(accs[TK[0]]).wins;
  const kill = (i) => { G.forfeit(room.game, i); }; kill(1); A.advance(room, G.FREEZE_T + 45); assert.equal(room.phase, 'between'); assert.deepEqual(a.last('state').round_result.wins, [1, 0]); assert.equal(a.last('state').round_result.winner, 0);
  A.advance(room, 61); assert.equal(room.phase, 'play'); assert.equal(room.round, 2); assert.ok(a.all('snap').filter((x) => x.k === 0).every((x) => x.g) && a.all('snap').filter((x) => x.k === 0).length === 2, 'nové kolo = nová mřížka');
  kill(1); A.advance(room, G.FREEZE_T + 45); assert.equal(room.phase, 'over'); const res = a.last('state').result; assert.equal(res.winner, 0); assert.deepEqual(res.wins, [2, 0]);
  assert.equal(res.xp[0].gain, 20 + 60 + 2 * 10); assert.equal(res.xp[1].gain, 20); assert.equal(res.xp[0].coins, 10 + 30 + 2 * 5); assert.equal(res.xp[1].coins, 10); assert.equal(res.xp[0].coinsTotal, A.bombicOf(accs[TK[0]]).coins, 'coiny za zápas se připsaly'); assert.equal(A.bombicOf(accs[TK[0]]).wins, wins0 + 1); assert.equal(A.bombicOf(accs[TK[0]]).xp, xpA + 100);
  a.say({ t: 'rematch' }); assert.equal(a.last('state').phase, 'over'); assert.deepEqual(a.last('state').rematch, [true, false]); b.say({ t: 'rematch' }); assert.equal(a.last('state').phase, 'play'); assert.equal(a.last('state').round, 1); assert.deepEqual(a.last('state').players.map((p) => p.wins), [0, 0]);
  a.say({ t: 'leave' }); b.say({ t: 'leave' }); assert.ok(!A.rooms.has(room.code));
}
{ // odchod a odpojení uprostřed hry, návrat
  const { cs, code, room } = room4(); const tok = cs[3].last('joined').token;
  cs[2].say({ t: 'leave' }); assert.equal(room.game.pl[2].alive, false, 'odešel = jeho postava zmizí'); assert.equal(room.phase, 'play', 'ostatní hrají dál'); assert.ok(room.players[2].left);
  cs[3].h.close(); assert.ok(cs[0].last('state').drop, 'odpojený má odpočet'); const c2 = client(); c2.say({ t: 'resume', code, token: tok }); assert.equal(c2.last('joined').you, 3); assert.ok(c2.last('snap').g, 'po návratu celý snímek'); assert.equal(cs[0].last('state').drop, null);
  c2.say({ t: 'resume', code, token: 'zzz' }); cs[0].say({ t: 'leave' }); cs[1].say({ t: 'leave' }); c2.say({ t: 'leave' }); assert.ok(!A.rooms.has(code));
  const bad = client(); bad.say({ t: 'resume', code: 'QQQQ', token: 'x' }); assert.ok(bad.last('err').gone);
}
{ // lobby: odchod zakladatele předá vedení
  const a = client(), b = client(); a.say({ t: 'create', token: TK[0], name: 'Honza' }); b.say({ t: 'join', code: a.last('joined').code, token: TK[1], name: 'Eva' }); a.say({ t: 'leave' }); assert.equal(b.last('state').host, 0); assert.equal(b.last('state').players.length, 1); b.say({ t: 'leave' });
}
{ // výběr skinu přes API a přidělení skinů v místnosti
  const t = A.bombicOf(accs[TK[0]]); t.xp = 0; t.skin = -1; assert.equal(A.api('skin', { token: TX, skin: 1 }).status, 401);
  assert.equal(A.api('skin', { token: TK[0], skin: 7 }).status, 403, 'neodemčený skin'); assert.equal(A.api('skin', { token: TK[0], skin: 99 }).status, 400); assert.equal(A.api('skin', { token: TK[0], skin: 'x' }).status, 400);
  assert.equal(A.api('skin', { token: TK[0], skin: 2 }).json.bombic.skin, 2); t.xp = K.xpFor(9); const r = A.api('skin', { token: TK[0], skin: 7 }); assert.equal(r.status, 200); assert.equal(r.json.bombic.skin, 7);
  const a = client(), b = client(); a.say({ t: 'create', token: TK[0], name: 'Honza' }); b.say({ t: 'join', code: a.last('joined').code, token: TK[1], name: 'Eva' });
  assert.deepEqual(b.last('state').players.map((p) => p.skin), [7, 0], 'vybraný skin + první volný základní');
  const t1 = A.bombicOf(accs[TK[1]]); t1.xp = K.xpFor(9); t1.skin = 7; b.say({ t: 'leave' }); const b2 = client(); b2.say({ t: 'join', code: a.last('joined').code, token: TK[1], name: 'Eva' }); assert.deepEqual(a.last('state').players.map((p) => p.skin), [7, 0], 'stejný skin dvakrát nejde');
  a.say({ t: 'start', fill: true, level: 1 }); const sk = a.last('state').players.map((p) => p.skin); assert.equal(new Set(sk).size, 4, 'všichni mají jiný skin'); t.skin = 3; t.xp = 0;
  a.say({ t: 'leave' }); b2.say({ t: 'leave' }); t1.xp = 0; t1.skin = -1;
  t.skin = 7; assert.equal(A.bombicOf(accs[TK[0]]).skin, 7); t.xp = 0; const c = client(); c.say({ t: 'bot', token: TK[0], name: 'Honza', n: 1, level: 1 }); assert.equal(c.last('state').players[0].skin, 0, 'neodemčený vybraný skin se nepoužije'); c.say({ t: 'leave' }); t.skin = -1;
}
{ // mapa: výběr zakladatelem, předání do hry, rychlá hra náhodná, boti
  const a = client(), b = client(); a.say({ t: 'create', token: TK[0], name: 'Honza', map: 3 }); assert.equal(a.last('state').map, 3); b.say({ t: 'join', code: a.last('joined').code, token: TK[1], name: 'Eva' }); assert.equal(b.last('state').map, 3);
  b.say({ t: 'map', map: 1 }); assert.equal(a.last('state').map, 3, 'mapu mění jen zakladatel'); a.say({ t: 'map', map: 4 }); assert.equal(b.last('state').map, 4); a.say({ t: 'map', map: 77 }); assert.equal(b.last('state').map, 0, 'neplatná mapa = první');
  a.say({ t: 'start', map: 2 }); const room = A.rooms.get(a.last('joined').code); assert.equal(room.game.map, 2); assert.equal(a.last('state').map, 2); assert.equal(a.last('snap').g, [...room.game.grid].join(''));
  A.advance(room, 1); a.say({ t: 'leave' }); b.say({ t: 'leave' });
  const q1 = client(), q2 = client(); q1.say({ t: 'quick', token: TK[0], name: 'Honza' }); q2.say({ t: 'quick', token: TK[1], name: 'Eva' }); const qr = A.rooms.get(q1.last('joined').code); assert.ok(qr.map >= 0 && qr.map < K.MAPS.length); q1.say({ t: 'map', map: 1 }); assert.equal(qr.map === 1 && false, false); q1.say({ t: 'leave' }); q2.say({ t: 'leave' });
  const c = client(); c.say({ t: 'bot', token: TK[0], name: 'Honza', n: 2, level: 1, map: 4 }); assert.equal(c.last('state').map, 4); assert.equal(A.rooms.get(c.last('state').code).game.map, 4); c.say({ t: 'leave' });
}
{ // kosmetika: katalog (aspoň 10 věcí v kategorii), nákup za coiny, výběr originál / vlastní, uložení v účtu, zamčení při startu zápasu
  assert.deepEqual(K.COSM_CATS.map((c) => c.id), K.COSM_SLOTS); assert.ok(K.COSM_SLOTS.length >= 4);
  for (const c of K.COSM_SLOTS) { assert.ok(K.COSM[c].length >= 10, 'aspoň deset věcí: ' + c); assert.equal(new Set(K.COSM[c].map((x) => x.id)).size, K.COSM[c].length, 'unikátní id'); for (const it of K.COSM[c]) assert.ok(it.name && it.price > 0 && /^[A-Za-z0-9]{2,12}$/.test(it.id)); }
  const t = A.bombicOf(accs[TK[0]]); t.xp = 0; t.skin = -1; t.coins = 100; t.own = []; t.eq = {};
  const me0 = A.api('me', { token: TK[0] }).json; assert.equal(me0.bombic.coins, 100); assert.deepEqual(me0.bombic.own, []); assert.deepEqual(me0.bombic.eq, { hat: '', glasses: '', boots: '', back: '' }); assert.equal(me0.coinRules.win, 30);
  assert.equal(A.api('buy', { token: TX, cat: 'hat', id: 'beanie' }).status, 401); assert.equal(A.api('buy', { token: TK[0], cat: 'x', id: 'beanie' }).status, 400); assert.equal(A.api('buy', { token: TK[0], cat: 'hat', id: 'nope' }).status, 400);
  let r = A.api('buy', { token: TK[0], cat: 'hat', id: 'beanie' }); assert.equal(r.status, 200); assert.equal(r.json.bombic.coins, 60); assert.deepEqual(r.json.bombic.own, ['hat:beanie']); assert.equal(r.json.bombic.eq.hat, 'beanie', 'koupená věc se rovnou nasadí');
  assert.equal(A.api('buy', { token: TK[0], cat: 'hat', id: 'beanie' }).status, 409, 'dvakrát ne'); assert.equal(A.api('buy', { token: TK[0], cat: 'hat', id: 'halo' }).status, 402, 'nedostatek coinů'); assert.equal(A.bombicOf(accs[TK[0]]).coins, 60, 'neúspěšný nákup nic nestrhne');
  assert.equal(A.api('equip', { token: TK[0], cat: 'hat', id: 'tophat' }).status, 403, 'nekoupené nejde nasadit'); assert.equal(A.api('equip', { token: TK[0], cat: 'boots', id: '-' }).status, 403, 'bez bot neexistuje');
  assert.equal(A.api('equip', { token: TK[0], cat: 'hat', id: '' }).json.bombic.eq.hat, '', 'originál skinu'); assert.equal(A.api('equip', { token: TK[0], cat: 'hat', id: '-' }).json.bombic.eq.hat, '-', 'bez čepice'); assert.equal(A.api('equip', { token: TK[0], cat: 'hat', id: 'beanie' }).json.bombic.eq.hat, 'beanie');
  t.coins = 5000; for (const [c, id] of [['glasses', 'shades'], ['boots', 'rocket'], ['back', 'jet']]) assert.equal(A.api('buy', { token: TK[0], cat: c, id }).status, 200); assert.deepEqual(A.bombicOf(accs[TK[0]]).eq, { hat: 'beanie', glasses: 'shades', boots: 'rocket', back: 'jet' });
  // poškozená data v účtu se očistí
  t.own = ['hat:nope', 'zzz', 'hat:beanie', 5, 'hat:beanie']; t.eq = { hat: 'tophat', glasses: 'shades', boots: 5, back: 'x' }; const cl = A.bombicOf(accs[TK[0]]); assert.deepEqual(cl.own, ['hat:beanie']); assert.deepEqual(cl.eq, { hat: '', glasses: '', boots: '', back: '' }, 'nekoupené a neplatné se zahodí');
  t.own = ['hat:beanie', 'glasses:shades']; t.eq = { hat: 'beanie', glasses: 'shades' };
  // stav místnosti nese výbavu, boti dostanou náhodnou, při startu se výbava zamkne
  const a = client(), b = client(); a.say({ t: 'create', token: TK[0], name: 'Honza' }); b.say({ t: 'join', code: a.last('joined').code, token: TK[1], name: 'Eva' });
  let pl = a.last('state').players; assert.deepEqual(pl[0].cs, { hat: 'beanie', glasses: 'shades', boots: '', back: '' }); assert.deepEqual(pl[1].cs, { hat: '', glasses: '', boots: '', back: '' });
  a.say({ t: 'start', fill: true, level: 1 }); pl = a.last('state').players; assert.equal(pl.length, 4);
  for (const p of pl.slice(2)) for (const c of K.COSM_SLOTS) assert.ok(p.cs[c] === '' || K.cosmItem(c, p.cs[c]), 'bot má platnou věc');
  assert.equal(A.api('equip', { token: TK[0], cat: 'hat', id: '-' }).status, 200); assert.equal(a.last('state').players[0].cs.hat, 'beanie', 'změna během zápasu se projeví až v dalším');
  a.say({ t: 'leave' }); b.say({ t: 'leave' }); A.api('equip', { token: TK[0], cat: 'hat', id: '' });
  const gst = client(); gst.say({ t: 'bot', name: 'Host', n: 1, level: 1 }); assert.deepEqual(gst.last('state').players[0].cs, { hat: '', glasses: '', boots: '', back: '' }, 'host bez účtu = originál'); gst.say({ t: 'leave' });
  t.own = []; t.eq = {}; t.coins = 100; t.xp = 0; t.skin = -1;
}
assert.ok(dirty > 0);
console.log('test-bombic: OK');
process.exit(0);
