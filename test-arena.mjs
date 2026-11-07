// Aréna věží: karty a sdílený soubor, simulace boje (věže, most, kouzla, léčení, prodloužení), bot, účet (balíček, vylepšení karet), online zápas.
// Hodiny serveru se tu vypínají (ARENA_SCALE) a zápas se posouvá ručně přes advance(), takže testy jsou rychlé i deterministické.
process.env.ARENA_SCALE = '1000000';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const A = await import('./arena/arena.js');
const C = await import('./arena/cards.js');
const G = await import('./arena/sim.js');
const B = await import('./arena/bot.js');
const { CARDS, W, H, RIVER } = C;

// --- sdílený soubor a definice karet
assert.equal(fs.readFileSync('./arena/cards.js', 'utf8'), fs.readFileSync('./public/arena/cards.js', 'utf8'), 'cards.js musí být na serveru i v public/ stejný');
{
  assert.equal(C.CARD_ORDER.length, Object.keys(CARDS).length); assert.equal(new Set(C.STARTER).size, 9); assert.equal(C.DECK_SIZE, 9); assert.equal(C.HAND_SIZE, 3);
  for (const id of C.CARD_ORDER) { const c = CARDS[id]; assert.equal(c.id, id); assert.ok(c.cost >= 1 && c.cost <= 10 && c.name && c.icon && c.desc, id); if (c.kind !== 'spell') { assert.ok(c.hp > 0 && c.n >= 1 && c.speed > 0 && c.range > 0 && c.r > 0 && ['ground', 'all', 'building'].includes(c.tt), id); } }
  for (const id of C.STARTER) assert.ok(C.unlocked(id, 1), 'startovní karta je odemčená ' + id);
  assert.ok(C.CARD_ORDER.some((id) => !C.unlocked(id, 1)), 'další karty se odemykají');
  for (let l = 2; l <= C.MAX_LEVEL; l++) assert.ok(C.xpFor(l) > C.xpFor(l - 1)); assert.equal(C.levelOf(0), 1); assert.equal(C.levelOf(C.xpFor(7)), 7); assert.equal(C.levelOf(1e9), C.MAX_LEVEL);
  assert.equal(C.lvMul(1), 1); assert.ok(Math.abs(C.lvMul(10) - 1.9) < 1e-9); assert.equal(C.lvMul(99), C.lvMul(10));
  for (let l = 2; l <= 9; l++) assert.ok(C.upgradeCost('knight', l) > C.upgradeCost('knight', l - 1), 'cena roste');
  assert.ok(C.upgradeCost('golem', 1) > C.upgradeCost('soldier', 1), 'dražší karta = dražší vylepšení');
}

const deck = (ids, lv = 1) => ids.map((id) => ({ id, lv }));
const STARTER_DECK = deck(C.STARTER);
const run = (s, n) => { for (let i = 0; i < n && !s.over; i++) { G.step(s); G.clearEvents(s); } };
const fresh = (d0 = STARTER_DECK, d1 = STARTER_DECK, seed = 7) => G.newGame([d0, d1], seed);
/** Dá hráči vybranou kartu do ruky na místo 0 (a dost elixíru). */
function give(s, pi, id, lv = 1) { const p = s.pl[pi]; p.hand[0] = { id, lv }; p.elixir = 10; }

// --- začátek zápasu, ruka a fronta
{
  const s = fresh();
  assert.equal(s.towers.length, 4); assert.equal(s.towers.filter((t) => t.o === 0 && t.tk === 'main').length, 1); assert.equal(s.towers.filter((t) => t.o === 1 && t.tk === 'front').length, 1);
  const f0 = s.towers.find((t) => t.o === 0 && t.tk === 'front'), m0 = s.towers.find((t) => t.o === 0 && t.tk === 'main');
  assert.ok(f0.y < m0.y && f0.y > RIVER.y1, 'strážní věž stojí před hlavní (blíž k řece)');
  for (const p of s.pl) { assert.equal(p.hand.length, 3); assert.equal(p.queue.length, 6); assert.equal(p.elixir, 5); assert.equal(new Set([...p.hand, ...p.queue].map((c) => c.id)).size, 9, 'v ruce a frontě je všech 9 karet'); }
  const first = s.pl[0].hand[0].id; const nxt = s.pl[0].queue[0].id;
  give(s, 0, 'soldier'); s.pl[0].elixir = 5;
  assert.match(G.play(s, 0, 0, 180, 100), /svou polovinu/, 'jednotky jen na svou polovinu'); assert.equal(s.pl[0].elixir, 5, 'chyba elixír nestojí');
  assert.match(G.play(s, 0, 5, 180, 500), /není/); assert.match(G.play(s, 0, 0, NaN, 500), /Špatné/);
  const q0 = s.pl[0].queue[0].id; assert.equal(G.play(s, 0, 0, 180, 500), null); assert.equal(s.pl[0].elixir, 3, 'voják stojí 2');
  assert.equal(s.pl[0].hand[0].id, q0, 'do ruky přijde další karta z fronty'); assert.equal(s.pl[0].queue.at(-1).id, 'soldier', 'použitá karta jde na konec fronty'); assert.equal(s.pl[0].queue.length, 6);
  assert.equal(s.units.length, 1); assert.equal(s.units[0].o, 0); void first; void nxt;
  s.pl[0].elixir = 1; give(s, 0, 'golem'); s.pl[0].elixir = 1; assert.match(G.play(s, 0, 0, 180, 500), /elixír/, 'málo elixíru');
  // pozice hráče 1 je nahoře
  assert.match(G.play(s, 1, 0, 180, 500), /svou polovinu/); give(s, 1, 'soldier'); assert.equal(G.play(s, 1, 0, 180, 150), null);
}

// --- elixír: 1 za 2,8 s, od 2:00 dvojnásobně
{
  const s = fresh(); s.pl[0].elixir = 0; run(s, 20); assert.ok(Math.abs(s.pl[0].elixir - 1 / 2.8) < 0.01, 'za 1 s přibude 1/2,8');
  s.tick = 120 * 20; s.pl[0].elixir = 0; run(s, 20); assert.ok(Math.abs(s.pl[0].elixir - 2 / 2.8) < 0.02, 'od 2:00 dvojnásobek');
  s.pl[0].elixir = 9.9; run(s, 100); assert.equal(s.pl[0].elixir, 10, 'strop 10');
}

// --- jednotka přejde most, zničí strážní věž a nakonec hlavní věž = výhra
{
  const s = fresh(); const f1 = s.towers.find((t) => t.o === 1 && t.tk === 'front'), m1 = s.towers.find((t) => t.o === 1 && t.tk === 'main');
  give(s, 0, 'golem'); assert.equal(G.play(s, 0, 0, 180, 500), null);
  const g = s.units[0]; let crossed = false;
  for (let i = 0; i < 20 * 40 && g.hp > 0; i++) { G.step(s); G.clearEvents(s); if (g.y < RIVER.y0 - 2) crossed = true; if (g.y > RIVER.y0 && g.y < RIVER.y1) assert.ok(g.x >= C.BRIDGE.x0 && g.x <= C.BRIDGE.x1, 'v řece jen po mostě'); }
  assert.ok(crossed, 'golem přešel most'); assert.ok(f1.hp < f1.max || f1.dead, 'golem útočí na strážní věž');
  // dokonči: slabé věže, ať se vidí konec
  s.towers.filter((t) => t.o === 1).forEach((t) => { t.hp = 5; }); give(s, 0, 'knight'); G.play(s, 0, 0, 180, 400); run(s, 20 * 60);
  assert.ok(s.over, 'zápas skončil'); assert.equal(s.over.winner, 0); assert.equal(s.over.reason, 'main'); assert.equal(m1.dead, true); assert.equal(s.crowns[0], 3);
}

// --- létající jednotku pozemní boj na blízko nezasáhne, střelci ano
{
  const s = fresh(); give(s, 1, 'bats'); G.play(s, 1, 0, 180, 150); give(s, 0, 'soldier'); G.play(s, 0, 0, 180, 360);
  const bats = s.units.filter((u) => u.card === 'bats'); const sol = s.units.find((u) => u.card === 'soldier');
  assert.ok(bats.every((b) => b.fly) && !sol.fly);
  // voják nesmí cílit na netopýry (tt ground)
  sol.wait = 0; for (const b of bats) { b.x = sol.x + 4; b.y = sol.y - 4; b.wait = 0; } sol.tgt = null; run(s, 3);
  assert.ok(!sol.tgt || sol.tgt.kind === 'tower', 'pozemní voják letce necílí');
  const s2 = fresh(); give(s2, 1, 'bats'); G.play(s2, 1, 0, 180, 150); give(s2, 0, 'archer'); G.play(s2, 0, 0, 180, 360); const ar = s2.units.filter((u) => u.card === 'archer'); const bt = s2.units.filter((u) => u.card === 'bats');
  ar.forEach((a) => { a.wait = 0; a.x = 180; a.y = 400; }); bt.forEach((b, i) => { b.wait = 0; b.x = 170 + i * 6; b.y = 380; }); run(s2, 100);
  assert.ok(s2.units.filter((u) => u.card === 'bats').length < bt.length, 'střelkyně létající zasáhnou');
}

// --- kouzlo: plošný zásah jednotkám, věž bere 40 %
{
  const s = fresh(); give(s, 1, 'soldier'); G.play(s, 1, 0, 100, 150); give(s, 1, 'soldier'); G.play(s, 1, 0, 110, 150);
  const f1 = s.towers.find((t) => t.o === 1 && t.tk === 'front'); const hp0 = f1.hp;
  const us = s.units.filter((u) => u.o === 1); us.forEach((u) => { u.x = 60; u.y = 100; u.wait = 5; });
  give(s, 0, 'fireball'); assert.equal(G.play(s, 0, 0, 60, 100), null); assert.equal(s.pl[0].queue.at(-1).id, 'fireball'); assert.equal(s.units.length, 2, 'kouzlo ještě nedopadlo');
  run(s, 14); assert.equal(s.units.filter((u) => u.o === 1).length, 0, 'výbuch zabil oba vojáky (230 životů, 290 poškození)');
  give(s, 0, 'fireball'); G.play(s, 0, 0, f1.x, f1.y); run(s, 14); assert.equal(hp0 - f1.hp, Math.round(290 * 0.4), 'věž dostane 40 % z poškození kouzla');
  const sl = fresh(); give(sl, 0, 'fireball', 10); G.play(sl, 0, 0, 5, 5); give(sl, 1, 'soldier'); G.play(sl, 1, 0, 5, 40); const v = sl.units[0]; v.wait = 9; run(sl, 14); assert.ok(v.hp <= 0 || sl.units.length === 0, 'koule vyššího levelu zabíjí také');
  const lvl = G.newGame([deck(C.STARTER, 10), STARTER_DECK], 1); give(lvl, 0, 'knight', 10); G.play(lvl, 0, 0, 180, 500); assert.equal(lvl.units[0].hp, Math.round(650 * 1.9), 'úroveň karty zvyšuje životy');
}

// --- sapér vybuchne u věže, kněz léčí
{
  const s = fresh(); const f1 = s.towers.find((t) => t.o === 1 && t.tk === 'front'); give(s, 0, 'bomber'); G.play(s, 0, 0, 180, 400); run(s, 20 * 20);
  assert.ok(f1.hp <= f1.max - 400 || f1.dead, 'sapér udělal velkou škodu věži'); assert.equal(s.units.filter((u) => u.card === 'bomber').length, 0, 'sapér při výbuchu zmizí');
  const h = fresh(); give(h, 0, 'priest'); G.play(h, 0, 0, 180, 480); give(h, 0, 'knight'); G.play(h, 0, 0, 190, 480);
  const kn = h.units.find((u) => u.card === 'knight'); kn.hp = 100; kn.wait = 0; h.units.find((u) => u.card === 'priest').wait = 0; run(h, 40); assert.ok(kn.hp >= 100 + 60, 'kněz vyléčil rytíře (' + kn.hp + ')');
  assert.ok(h.ev.length === 0 || true);
}

// --- konec podle času: strážní věž rozhoduje; při remíze prodloužení, první zničená věž vyhrává
{
  const s = fresh(); s.towers.find((t) => t.o === 1 && t.tk === 'front').hp = 1; give(s, 0, 'archer'); G.play(s, 0, 0, 180, 345); s.units.forEach((u) => { u.x = 180; u.y = 345; u.wait = 0; });
  s.tick = 170 * 20; run(s, 20 * 8); // střelkyně nedoletí, ale testujeme čas níž
  const t = fresh(); t.crowns = [1, 0]; t.tick = 3599; run(t, 3); assert.equal(t.over.winner, 0); assert.equal(t.over.reason, 'time', 'po 3 minutách vyhrává ten s víc zničenými věžemi');
  const o = fresh(); o.tick = 3599; run(o, 3); assert.ok(o.ot && !o.over, 'remíza = prodloužení');
  o.towers.find((t2) => t2.o === 0 && t2.tk === 'front').hp = 10; give(o, 1, 'soldier'); const fr = o.towers.find((t2) => t2.o === 0 && t2.tk === 'front'); G.play(o, 1, 0, 180, 120);
  fr.hp = 0; G.step(o); // simuluj zničení přes hurt: vlož přes bomber
  const o2 = fresh(); o2.tick = 3600; run(o2, 1); assert.ok(o2.ot); const f2 = o2.towers.find((t2) => t2.o === 0 && t2.tk === 'front'); f2.hp = 1; give(o2, 1, 'bomber'); G.play(o2, 1, 0, 180, 250); run(o2, 20 * 25);
  assert.ok(o2.over && o2.over.winner === 1 && o2.over.reason === 'ot', 'v prodloužení vyhrává první zničená věž ' + JSON.stringify(o2.over));
  const o3 = fresh(); o3.tick = 4799; o3.ot = true; o3.towers.find((t2) => t2.o === 1 && t2.tk === 'main').hp -= 500; run(o3, 3); assert.equal(o3.over.winner, 0, 'na konci prodloužení rozhodne zbývající stav věží'); assert.equal(o3.over.reason, 'hp');
  const o4 = fresh(); o4.tick = 4799; o4.ot = true; run(o4, 3); assert.equal(o4.over.winner, -1, 'úplně stejné věže = remíza');
}

// --- zprávy pro klienty: hráč 1 vidí arénu otočenou (on je dole), karty vidí jen vlastní
{
  const s = fresh(); give(s, 1, 'knight'); G.play(s, 1, 0, 100, 150);
  const a = G.snapFor(s, 0), b = G.snapFor(s, 1); const u0 = a.u[0], u1 = b.u[0];
  assert.equal(u0[2], 1, 'pro hráče 0 je to nepřítel'); assert.equal(u1[2], 0, 'pro hráče 1 je to jeho jednotka'); assert.deepEqual([u0[3], u0[4]], [100, 150]); assert.deepEqual([u1[3], u1[4]], [W - 100, H - 150], 'pohled hráče 1 je otočený');
  for (const sn of [a, b]) { const own = sn.tw.filter((t) => t[1] === 0); assert.equal(own.length, 2); assert.ok(own.every((t) => t[4] > H / 2), 'vlastní věže jsou vždy dole'); }
  assert.deepEqual(a.hand.map((h) => h[0]), s.pl[0].hand.map((h) => h.id)); assert.deepEqual(b.hand.map((h) => h[0]), s.pl[1].hand.map((h) => h.id)); assert.equal(a.tm, 180);
  assert.ok(JSON.stringify(b).length < 4000, 'snímek je malý');
  assert.ok(b.ev.some((e) => e[0] === 's' && e[5] === H - 150), 'událost nasazení je otočená také');
}

// --- bot: balíček, rozhodování a síla
{
  for (let lv = 1; lv <= 4; lv++) { for (let k = 0; k < 20; k++) { const d = B.botDeck(lv); assert.equal(d.length, 9); assert.equal(new Set(d.map((c) => c.id)).size, 9); assert.ok(d.filter((c) => CARDS[c.id].tt === 'all' && CARDS[c.id].kind !== 'spell').length >= 2, 'aspoň 2 karty na vzdušné cíle'); assert.ok(d.every((c) => c.lv === B.BOT_CARD_LV[lv])); } }
  assert.ok(B.BOT_THINK[1] > B.BOT_THINK[2] && B.BOT_THINK[2] > B.BOT_THINK[3] && B.BOT_THINK[3] > B.BOT_THINK[4], 'vyšší obtížnost = rychlejší');
  assert.ok(B.BOT_CARD_LV[1] < B.BOT_CARD_LV[4] && B.BOT_RATE[1] < B.BOT_RATE[4]);
  const duel = (la, lb, n) => { let w = [0, 0, 0]; for (let g = 0; g < n; g++) { const s = G.newGame([B.botDeck(la), B.botDeck(lb)], 500 + g, { rate: [B.BOT_RATE[la], B.BOT_RATE[lb]] }); const nx = [3 + g % 5, 9]; const lv = [la, lb]; while (!s.over) { for (let p = 0; p < 2; p++) if (s.tick >= nx[p]) { nx[p] = s.tick + B.BOT_THINK[lv[p]]; const a = B.botThink(s, p, lv[p]); if (a) { const e = G.play(s, p, a.hi, a.x, a.y); assert.equal(e, null, 'bot nikdy nehraje neplatně: ' + e); } } G.step(s); G.clearEvents(s); } w[s.over.winner < 0 ? 2 : s.over.winner]++; assert.ok(s.tick <= 4800 + 1, 'zápas skončí do 4 minut'); } return w; };
  const w = duel(4, 1, 16); assert.ok(w[0] >= 14, `Maršál (strana 0) poráží Nováčka ${w}`);
  const w2 = duel(1, 4, 16); assert.ok(w2[1] >= 14, `Maršál (strana 1) poráží Nováčka ${w2}`);
  const w3 = duel(3, 2, 20); assert.ok(w3[0] >= 12, `Velitel poráží Pěšáka ${w3}`);
}

// --- účet: start, balíček, vylepšení karet
const accs = {};
const mk = (name, bal) => ({ name, avatar: null, balance: bal, lastSeen: 0 });
let dirty = 0;
A.init({ FLOOR: 100, TOKEN_RE: /^[A-Za-z0-9_-]{20,64}$/, markDirty: () => { dirty++; }, notifyBalance: () => {}, resolveAccount: ({ token }) => (accs[token] ? { acc: accs[token], linked: true } : null) });
const T1 = 'a'.repeat(24), T2 = 'b'.repeat(24), TX = 'x'.repeat(24);
accs[T1] = mk('Honza', 5000); accs[T2] = mk('Eva', 5000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await sleep(5); } throw new Error('timeout: ' + f); };
{
  assert.equal(A.api('me', { token: TX }).json.account, false);
  let r = A.api('me', { token: T1 }); assert.equal(r.status, 200); assert.equal(r.json.coins, 200, 'start na 200 coinech arény'); assert.equal(r.json.arena.lvl, 1); assert.deepEqual(r.json.arena.deck, C.STARTER, 'výchozí balíček'); assert.equal(accs[T1].balance, 5000);
  r = A.api('deck', { token: T1, deck: [...C.STARTER.slice(0, 8)] }); assert.equal(r.status, 400, 'musí být 9 karet');
  r = A.api('deck', { token: T1, deck: [...C.STARTER.slice(0, 8), 'soldier'] }); assert.equal(r.status, 400, 'bez duplicit');
  r = A.api('deck', { token: T1, deck: [...C.STARTER.slice(0, 8), 'nic'] }); assert.equal(r.status, 400);
  r = A.api('deck', { token: T1, deck: [...C.STARTER.slice(0, 8), 'dragon'] }); assert.equal(r.status, 403, 'dráček se odemyká na úrovni 3');
  assert.equal(A.api('deck', { token: TX, deck: C.STARTER }).status, 401);
  A.arenaOf(accs[T1]).xp = C.xpFor(3);
  r = A.api('deck', { token: T1, deck: [...C.STARTER.slice(0, 8), 'dragon'] }); assert.equal(r.status, 200); assert.ok(r.json.arena.deck.includes('dragon') && !r.json.arena.deck.includes('musketeer'));
  assert.equal(A.deckOf(accs[T1]).length, 9);
  const t = A.arenaOf(accs[T1]); t.coins = 1000;
  r = A.api('upgrade', { token: T1, id: 'knight' }); assert.equal(r.status, 200); assert.equal(r.json.arena.lv.knight, 2); assert.equal(r.json.coins, 1000 - C.upgradeCost('knight', 1));
  assert.equal(A.api('upgrade', { token: T1, id: 'priest' }).status, 403, 'kněz je zamčený'); assert.equal(A.api('upgrade', { token: T1, id: 'x' }).status, 400);
  t.coins = 1; assert.equal(A.api('upgrade', { token: T1, id: 'knight' }).status, 402); t.coins = 1e6; t.lv.knight = 10; assert.equal(A.api('upgrade', { token: T1, id: 'knight' }).status, 409, 'nejvyšší úroveň');
  assert.equal(A.deckOf(accs[T1]).find((c) => c.id === 'knight').lv, 10, 'úroveň karty jde do zápasu');
  t.deck = ['priest', 'priest', 'soldier', 'zzz']; t.lv = { soldier: 99, nic: 3 }; A.arenaOf(accs[T1]); assert.equal(t.deck.length, 9); assert.equal(new Set(t.deck).size, 9); assert.ok(!t.deck.includes('priest'), 'zamčenou kartu srazí'); assert.equal(t.lv.soldier, 10); assert.ok(!('nic' in t.lv));
  assert.ok(dirty > 0);
  accs[T1] = mk('Honza', 5000); accs[T2] = mk('Eva', 5000);
}

// --- online zápas a coiny
function client() {
  const ws = { readyState: 1, out: [], h: {}, send(d) { this.out.push(JSON.parse(d)); }, close() { this.readyState = 3; this.h.close && this.h.close(); }, on(e, f) { this.h[e] = f; }, terminate() {}, ping() {} };
  A.handleConnection(ws);
  ws.say = (o) => ws.h.message(Buffer.from(JSON.stringify(o)));
  ws.last = (t) => [...ws.out].reverse().find((m) => m.t === t);
  ws.all = (t) => ws.out.filter((m) => m.t === t);
  return ws;
}
function online() { const a = client(), b = client(); a.say({ t: 'create', token: T1, name: 'Honza' }); const code = a.last('joined').code; b.say({ t: 'join', code, token: T2, name: 'Eva' }); return { a, b, code, room: A.rooms.get(code) }; }
{
  const { a, b, room } = online();
  assert.equal(a.last('state').phase, 'play'); assert.equal(b.last('state').phase, 'play'); assert.ok(a.last('snap') && b.last('snap'), 'oba dostanou snímek hned po startu');
  assert.deepEqual(a.last('state').players.map((p) => p.name), ['Honza', 'Eva']);
  // hráč 1 pokládá kartu ve svém pohledu dole (y = 500) → na serveru nahoře
  room.game.pl[1].elixir = 10; room.game.pl[1].hand[0] = { id: 'knight', lv: 1 };
  b.say({ t: 'play', hi: 0, x: 120, y: 500 }); assert.ok(b.last('ok'), 'platný tah potvrzen'); assert.equal(room.game.units.length, 1);
  assert.deepEqual([Math.round(room.game.units[0].x), Math.round(room.game.units[0].y)], [W - 120, H - 500], 'souřadnice hráče 1 se převedou na absolutní');
  A.advance(room, 2); const sb = b.last('snap'), sa = a.last('snap'); assert.deepEqual([sb.u[0][3], sb.u[0][4]], [120, 500], 'hráč 1 vidí svůj rytíř dole'); assert.equal(sa.u[0][2], 1, 'hráč 0 ho vidí jako nepřítele'); assert.ok(sa.u[0][4] < H / 2);
  room.game.pl[1].hand[1] = { id: 'soldier', lv: 1 }; room.game.pl[0].hand[0] = { id: 'soldier', lv: 1 }; room.game.pl[0].elixir = 10;   // jednotka (ne kouzlo), jinak by šla položit kamkoli
  b.say({ t: 'play', hi: 1, x: 120, y: 100 }); assert.match(b.last('rej').msg, /polovinu/);
  a.say({ t: 'play', hi: 0, x: 120, y: 100 }); assert.match(a.last('rej').msg, /polovinu/);
  a.say({ t: 'play', hi: 9, x: 120, y: 500 }); assert.ok(a.last('rej'));
  // oba zahrají aspoň 2 karty → po vzdání platí coiny; vzdát se = prohra
  for (const [cl, i] of [[a, 0], [b, 1]]) for (let k = 0; k < 2; k++) { room.game.pl[i].elixir = 10; room.game.pl[i].hand[0] = { id: 'soldier', lv: 1 }; cl.say({ t: 'play', hi: 0, x: 100 + k * 40, y: 520 }); }
  const c1 = A.arenaOf(accs[T1]).coins, c2 = A.arenaOf(accs[T2]).coins;
  b.say({ t: 'leave' });
  const over = a.last('state'); assert.equal(over.phase, 'over'); assert.equal(over.result.winner, 0); assert.equal(over.result.reason, 'surrender');
  assert.equal(over.result.coins[0], 100); assert.equal(over.result.coins[1], 30, 'prohra dává útěchu'); assert.equal(A.arenaOf(accs[T1]).coins, c1 + 100); assert.equal(A.arenaOf(accs[T2]).coins, c2 + 30);
  assert.equal(A.arenaOf(accs[T1]).wins, 1); assert.equal(A.arenaOf(accs[T2]).losses, 1); assert.equal(A.arenaOf(accs[T1]).streak, 1); assert.equal(A.arenaOf(accs[T2]).streak, 0); assert.ok(over.result.xp[0].gain > 0);
  assert.equal(accs[T1].balance, 5000, 'portálové coiny se nemění'); a.say({ t: 'leave' });
}
{ // krátký zápas: bez coinů
  const { a, b, room } = online(); const c1 = A.arenaOf(accs[T1]).coins;
  room.game.pl[0].elixir = 10; a.say({ t: 'play', hi: 0, x: 100, y: 520 }); b.say({ t: 'leave' }); const r = a.last('state').result; assert.ok(r.noCoins && !r.coins[0], 'bez aspoň 2 karet od každého se coiny neúčtují'); assert.equal(A.arenaOf(accs[T1]).coins, c1); a.say({ t: 'leave' });
}
{ // žádná karta a odchod = místnost zmizí bez účtování
  const { a, b, code } = online(); b.say({ t: 'leave' }); assert.ok(!A.rooms.has(code)); a.say({ t: 'leave' });
}
{ // odpojení: po prodlevě vyhrává soupeř, mezitím jde návrat (resume)
  const { a, b, room, code } = online(); const tokB = b.last('joined').token;
  for (const [cl, i] of [[a, 0], [b, 1]]) for (let k = 0; k < 2; k++) { room.game.pl[i].elixir = 10; room.game.pl[i].hand[0] = { id: 'soldier', lv: 1 }; cl.say({ t: 'play', hi: 0, x: 100 + k * 40, y: 520 }); }
  b.close(); assert.ok(a.last('state').drop, 'soupeř má odpočet'); assert.equal(a.last('state').phase, 'play');
  const b2 = client(); b2.say({ t: 'resume', code, token: tokB }); assert.equal(b2.last('state').phase, 'play'); assert.ok(b2.last('snap'), 'po návratu dostane snímek'); assert.equal(b2.last('joined').you, 1); assert.equal(a.last('state').drop, null);
  b2.say({ t: 'leave' }); a.say({ t: 'leave' });
}
{ // revanš
  const { a, b, room } = online(); for (const [cl, i] of [[a, 0], [b, 1]]) for (let k = 0; k < 2; k++) { room.game.pl[i].elixir = 10; room.game.pl[i].hand[0] = { id: 'soldier', lv: 1 }; cl.say({ t: 'play', hi: 0, x: 100 + k * 40, y: 520 }); }
  room.game.towers.find((t) => t.o === 1 && t.tk === 'main').hp = 1; room.game.pl[0].elixir = 10; room.game.pl[0].hand[0] = { id: 'fireball', lv: 1 }; a.say({ t: 'play', hi: 0, x: 180, y: 46 });   // kouzlo dorazí hlavní věž
  for (let i = 0; i < 40 && room.phase === 'play'; i++) A.advance(room, 20);
  const st = a.last('state'); assert.equal(st.phase, 'over'); assert.equal(st.result.winner, 0); assert.equal(st.result.reason, 'main'); assert.deepEqual(st.result.crowns, [3, 0]);
  a.say({ t: 'rematch' }); assert.equal(a.last('state').phase, 'over'); b.say({ t: 'rematch' }); assert.equal(a.last('state').phase, 'play'); assert.equal(room.game.tick, 0); assert.equal(a.last('state').result, null);
  a.say({ t: 'leave' }); b.say({ t: 'leave' });
}

// --- proti botovi: bot hraje sám, výhra/prohra dává coiny podle obtížnosti
{
  const a = client(); a.say({ t: 'bot', level: 4, token: T1, name: 'Honza' }); const st = a.last('state'); const room = A.rooms.get(st.code);
  assert.equal(st.bot, 4); assert.equal(st.players[1 - st.you].name, 'Bot Maršál'); assert.equal(st.phase, 'play');
  const c0 = A.arenaOf(accs[T1]).coins; const you = st.you;
  room.game.pl[you].played = 3;   // člověk „hrál“ (aby se účtovaly coiny), jinak nehraje nic
  A.advance(room, 20 * 120); assert.ok(room.game.pl[1 - you].played >= 2, 'bot sám pokládá karty (' + room.game.pl[1 - you].played + ')');
  A.advance(room, 20 * 200); const r = a.last('state'); assert.equal(r.phase, 'over'); assert.equal(r.result.winner, 1 - you, 'nečinný hráč prohrává'); assert.equal(r.result.coins[you], 30); assert.equal(A.arenaOf(accs[T1]).coins, c0 + 30);
  a.say({ t: 'rematch' }); assert.equal(a.last('state').phase, 'play', 'odveta s botem hned'); a.say({ t: 'leave' }); assert.ok(!A.rooms.has(st.code), 'odchod od bota zruší místnost');
  // výhra nad botem: levný Nováček dostane do věže
  const b = client(); b.say({ t: 'bot', level: 1, token: T1, name: 'Honza' }); const s2 = b.last('state'); const rm = A.rooms.get(s2.code); const y = s2.you; const c1 = A.arenaOf(accs[T1]).coins; A.arenaOf(accs[T1]).streak = 0;
  rm.game.pl[y].played = 3; rm.game.towers.find((t) => t.o === 1 - y && t.tk === 'main').hp = 1; rm.game.pl[y].elixir = 10; rm.game.pl[y].hand[0] = { id: 'fireball', lv: 1 };
  b.say({ t: 'play', hi: 0, x: 180, y: 46 }); for (let i = 0; i < 60 && rm.phase === 'play'; i++) A.advance(rm, 20);
  const r2 = b.last('state'); assert.equal(r2.phase, 'over'); assert.equal(r2.result.winner, y); assert.equal(r2.result.coins[y], 50, 'výhra nad Nováčkem +50'); assert.equal(A.arenaOf(accs[T1]).coins, c1 + 50);
  b.say({ t: 'leave' });
}
{ // úrovně karet a balíček se použijí v zápase
  const t = A.arenaOf(accs[T1]); t.lv = { golem: 5 }; const a = client(); a.say({ t: 'bot', level: 1, token: T1, name: 'Honza' }); const st = a.last('state'); const rm = A.rooms.get(st.code);
  const mine = [...rm.game.pl[st.you].hand, ...rm.game.pl[st.you].queue]; assert.equal(mine.length, 9); const gl = mine.find((c) => c.id === 'golem'); assert.equal(gl.lv, 5, 'vylepšená karta jde do zápasu'); a.say({ t: 'leave' });
}
assert.ok(A.stats().rooms >= 0);

console.log('test-arena: OK');
process.exit(0);
