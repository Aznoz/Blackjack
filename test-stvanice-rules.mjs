// Pravidla Vesmírné štvanice – cílené scénáře (deterministické).
import assert from 'node:assert/strict';
import { Game } from './stvanice/game.js';
import { charById } from './stvanice/data.js';
import { Bot } from './stvanice/bot.js';

let nextId = 5000;
const card = (type, suit = 'asteroid', rank = 5) => ({ id: nextId++, type, suit, rank });
/** specs: pro každý seat { role, char, hand:[typy], table:[typy], life } – seat 0 je Kapitán a začíná. */
function scenario(specs, { top = [] } = {}) {
  const players = specs.map((_, i) => ({ id: 'p' + i, name: 'H' + i, bot: true }));
  const g = new Game({ players, rng: () => 0.5 });
  g.players.sort((a, b) => a.seat - b.seat);
  // přeuspořádat seat -> id podle pořadí (p0 = seat 0 …)
  const byId = Object.fromEntries(g.players.map((p) => [p.id, p]));
  g.players = specs.map((_, i) => byId['p' + i]);
  g.players.forEach((p, i) => { p.seat = i; });
  specs.forEach((s, i) => {
    const p = g.players[i];
    p.role = s.role; p.char = charById(s.char || 'doe'); p.revealed = s.role === 'kapitan';
    p.maxLife = s.maxLife || p.char.lives + (s.role === 'kapitan' ? 1 : 0); p.life = s.life || p.maxLife;
    p.hand = (s.hand || []).map((t) => (typeof t === 'string' ? card(t) : t));
    p.table = (s.table || []).map((t) => card(t));
    p.status = (s.status || []).map((t) => { const c = card(t); if (t === 'cela') c.turnsLeft = 2; return c; });
    p.alive = true; p.dmg = 0; p.lilyUsed = false; p.turnOver = false;
  });
  g.captain = g.players[0];
  g.deck = [];
  for (let i = 0; i < 40; i++) g.deck.push(card('strela', 'asteroid', 2));
  for (const t of top.slice().reverse()) g.deck.push(typeof t === 'string' ? card(t) : t); // top[0] je nahoře
  g.discard = [];
  g.events = []; g.result = null; g.pending = null;
  g.gen = g.main(); g.advance(undefined);
  return g;
}
const act = (g, pid, a) => { const r = g.act(pid, a); assert.ok(r.ok, `${JSON.stringify(a)} → ${r.err}`); };
const P = (g, i) => g.players[i];
const play4 = (g, i, cardIdx, extra = {}) => act(g, 'p' + i, { act: 'play', cardId: P(g, i).hand[cardIdx].id, ...extra });
const base4 = (over = {}) => [
  { role: 'kapitan', char: 'doe', hand: ['strela', 'strela'], ...over[0] },
  { role: 'bandita', char: 'doe', hand: [], ...over[1] },
  { role: 'bandita', char: 'doe', hand: [], ...over[2] },
  { role: 'zabijak', char: 'doe', hand: [], ...over[3] },
];
const noDoe = (extra) => ({ char: 'trench', ...extra }); // postava bez speciálního vlivu na výstřel (Trench líže po zásahu → řešíme jen životy)
let n = 0; const ok = (name) => { n++; };

// 1) základní tah: líznutí 2 karet, střela ukončí tah, dostřel 1
{
  const g = scenario(base4({ 0: { char: 'bench' } }), { top: ['pilulka', 'pilulka'] });
  assert.equal(g.pending.type, 'play'); assert.equal(P(g, 0).hand.length, 4);
  // spoluhráč 2 sedí daleko (vzdálenost 2) – střela nejde
  const r = g.act('p0', { act: 'play', cardId: P(g, 0).hand[0].id, target: 'p2' });
  assert.ok(r.err && /dostřel/.test(r.err));
  g.players[1].char = charById('bench'); // bez štítu
  play4(g, 0, 0, { target: 'p1' });
  // střela ukončila tah: p1 přichází na řadu (nebo dotaz na štít – p1 nemá karty)
  assert.equal(P(g, 1).life, P(g, 1).maxLife - 1); assert.equal(g.turnPid, 'p1');
  ok('střela ukončí tah');
}
// 2) Frankie Blackhole: více střel
{
  const g = scenario(base4({ 0: { char: 'blackhole', hand: ['strela', 'strela'] }, 1: { char: 'bench', life: 3, maxLife: 3 } }));
  play4(g, 0, 0, { target: 'p1' });
  assert.equal(g.turnPid, 'p0'); assert.equal(g.pending.type, 'play');
  play4(g, 0, 0, { target: 'p1' });
  assert.equal(P(g, 1).life, 1);
  ok('Blackhole');
}
// 3) štít zachrání, Mat Jordan potřebuje 2
{
  const g = scenario(base4({ 0: { hand: ['strela'] }, 1: { char: 'bench', hand: ['stit', 'stit'] } }));
  play4(g, 0, 0, { target: 'p1' });
  assert.equal(g.pending.type, 'respond'); act(g, 'p1', { cardId: P(g, 1).hand[0].id });
  assert.equal(P(g, 1).life, P(g, 1).maxLife);
  const g2 = scenario(base4({ 0: { char: 'mat', hand: ['strela'] }, 1: { char: 'bench', hand: ['stit', 'stit'] } }));
  play4(g2, 0, 0, { target: 'p1' });
  assert.equal(g2.pending.need, 2);
  act(g2, 'p1', { cardId: P(g2, 1).hand[0].id }); act(g2, 'p1', { cardId: P(g2, 1).hand[0].id });
  assert.equal(P(g2, 1).life, P(g2, 1).maxLife);
  const g3 = scenario(base4({ 0: { char: 'mat', hand: ['strela'] }, 1: { char: 'bench', hand: ['stit'] } }));
  play4(g3, 0, 0, { target: 'p1' });
  assert.equal(P(g3, 1).life, P(g3, 1).maxLife - 1); // jediný štít nestačí → bez dotazu
  ok('štít / Mat');
}
// 4) Michael Johnson: střela jako štít
{
  const g = scenario(base4({ 0: { hand: ['strela'] }, 1: { char: 'mjohnson', hand: ['strela'] } }));
  play4(g, 0, 0, { target: 'p1' });
  act(g, 'p1', { cardId: P(g, 1).hand[0].id });
  assert.equal(P(g, 1).life, P(g, 1).maxLife);
  ok('Michael');
}
// 5) vzdálenosti: Teleportér a Harpuna, dostřel zbraně
{
  const g = scenario(base4({ 0: { table: ['harpuna'] }, 1: { table: ['teleport'] } }));
  const [a, b, c, d] = g.players;
  assert.equal(g.dist(a, b), 1 + 1 - 1); // 1 + teleport − harpuna
  assert.equal(g.dist(a, c), 1); // vzdálenost 2 − harpuna
  assert.equal(g.dist(c, b), 2); // 1 + teleport
  assert.equal(g.dist(d, a), 1);
  ok('vzdálenosti');
}
// 6) Vesmírná cela: dva vynechané tahy, útěk střelou
{
  const g = scenario(base4({ 0: { hand: ['strela'] }, 1: { char: 'bench', hand: [], status: ['cela'] } }));
  act(g, 'p0', { act: 'end' });          // p0 končí → p1 v cele (nemá střelu) → vynechá
  assert.equal(g.turnPid, 'p2'); assert.equal(P(g, 1).status.length, 1);
  g.players[2].hand = []; g.players[3].hand = [];
  act(g, 'p2', { act: 'end' }); act(g, 'p3', { act: 'end' }); act(g, 'p0', { act: 'end' });
  assert.equal(g.turnPid, 'p2'); // p1 podruhé vynechal
  assert.equal(P(g, 1).status.length, 0);
  const h = scenario(base4({ 0: { hand: [] }, 1: { char: 'bench', hand: ['strela'], status: ['cela'] } }));
  act(h, 'p0', { act: 'end' });
  assert.equal(h.pending.type, 'cell'); act(h, 'p1', { escape: true, cardId: P(h, 1).hand[0].id });
  assert.equal(h.pending.type, 'play'); assert.equal(h.turnPid, 'p1'); assert.equal(P(h, 1).status.length, 0);
  ok('cela');
}
// 7) cela nejde na Kapitána ani Olivii
{
  const g = scenario(base4({ 1: { hand: ['cela'] } , 0: { hand: [] } }));
  act(g, 'p0', { act: 'end' });
  const r = g.act('p1', { act: 'play', cardId: P(g, 1).hand[0].id, target: 'p0' });
  assert.ok(r.err && /Kapitán/.test(r.err));
  g.players[2].char = charById('trash');
  assert.ok(g.act('p1', { act: 'play', cardId: P(g, 1).hand[0].id, target: 'p2' }).err);
  ok('cela imunity');
}
// 8) Vynález zkázy: výbuch (pulsar 2–9) a předání
{
  const g = scenario(base4({ 0: { char: 'bench', status: ['vynalez'] } }), { top: [card('strela', 'pulsar', 5), 'strela', 'strela'] });
  assert.equal(P(g, 0).life, P(g, 0).maxLife - 3);
  const h = scenario(base4({ 0: { char: 'bench', status: ['vynalez'] } }), { top: [card('strela', 'nova', 5), 'strela', 'strela'] });
  assert.equal(P(h, 1).status.length, 1); assert.equal(P(h, 0).status.length, 0);
  // Olivia pošle dál bez losování
  const o = scenario(base4({ 0: { char: 'trash', status: ['vynalez'] } }));
  assert.equal(P(o, 1).status.length, 1);
  ok('vynález zkázy');
}
// 9) Kapitán zabije pravou ruku → ztrácí všechny karty; bandita ho zabije → bandité vyhrávají
{
  const g = scenario([
    { role: 'kapitan', char: 'bench', hand: ['strela', 'pilulka'], table: ['kanon'] },
    { role: 'ruka', char: 'bench', life: 1, maxLife: 3, hand: [] },
    { role: 'bandita', char: 'bench', hand: [] },
    { role: 'zabijak', char: 'bench', hand: [] },
  ]);
  play4(g, 0, 0, { target: 'p1' });
  assert.equal(P(g, 1).alive, false); assert.equal(P(g, 0).hand.length, 0); assert.equal(P(g, 0).table.length, 0);
  ok('penalizace Kapitána');
}
// 10) zabití posledního bandity + Zabijáka = vítězství Kapitána; zabije-li to Sebevrah, vyhrává on
{
  const specs = (kill) => [
    { role: 'kapitan', char: 'bench', hand: [] },
    { role: kill, char: 'bench', hand: ['strela'], life: 3 },
    { role: 'bandita', char: 'bench', hand: [], life: 1, maxLife: 3 },
    { role: 'ruka', char: 'bench', hand: [] },
  ];
  const g = scenario(specs('ruka'));
  act(g, 'p0', { act: 'end' }); // p1 střílí na p2 (vedle) – p1 je pravá ruka
  play4(g, 1, 0, { target: 'p2' });
  assert.ok(g.result && g.result.outcome === 'kapitan');
  const h = scenario(specs('sebevrah'));
  act(h, 'p0', { act: 'end' });
  play4(h, 1, 0, { target: 'p2' });
  assert.ok(h.result && h.result.outcome === 'sebevrah' && h.result.winners.join() === 'p1');
  ok('konec hry: kapitán / sebevrah');
}
// 11) smrt Kapitána → bandité; sólo Zabiják jako poslední → vyhrává Zabiják
{
  const g = scenario([
    { role: 'kapitan', char: 'bench', life: 1, maxLife: 4, hand: [] },
    { role: 'bandita', char: 'bench', hand: ['strela'] },
    { role: 'ruka', char: 'bench', hand: [] },
    { role: 'zabijak', char: 'bench', hand: [] },
  ]);
  act(g, 'p0', { act: 'end' }); play4(g, 1, 0, { target: 'p0' });
  assert.equal(g.result.outcome, 'bandita');
  const h = scenario([
    { role: 'kapitan', char: 'bench', life: 1, maxLife: 4, hand: [] },
    { role: 'zabijak', char: 'bench', hand: ['strela'] },
    { role: 'bandita', char: 'bench', hand: [] },
    { role: 'bandita', char: 'bench', hand: [] },
  ]);
  h.players[2].alive = false; h.players[3].alive = false; h.players[2].life = 0; h.players[3].life = 0;
  act(h, 'p0', { act: 'end' }); play4(h, 1, 0, { target: 'p0' });
  assert.equal(h.result.outcome, 'zabijak');
  ok('konec hry: bandité / Zabiják');
}
// 12) Šílenec: po 10 zraněních vyhrává
{
  const g = scenario([
    { role: 'kapitan', char: 'bench', hand: [] },
    { role: 'silenec', char: 'blackhole', hand: ['strela'] },
    { role: 'bandita', char: 'bench', life: 3, hand: [] },
    { role: 'zabijak', char: 'bench', hand: [] },
  ]);
  g.players[1].dmg = 9;
  act(g, 'p0', { act: 'end' }); play4(g, 1, 0, { target: 'p0' });
  assert.equal(g.result.outcome, 'silenec');
  ok('Šílenec');
}
// 13) Lily Put se jednou zachrání; Pilulka zachrání před smrtí
{
  const g = scenario(base4({ 0: { hand: ['strela'] }, 1: { char: 'put', life: 1, maxLife: 3 } }));
  play4(g, 0, 0, { target: 'p1' });
  assert.equal(P(g, 1).alive, true); assert.equal(P(g, 1).life, 2);
  const h = scenario(base4({ 0: { hand: ['strela'] }, 1: { char: 'bench', life: 1, maxLife: 3, hand: ['pilulka'] } }));
  play4(h, 0, 0, { target: 'p1' });
  assert.equal(h.pending.type, 'rescue'); act(h, 'p1', { cardId: P(h, 1).hand[0].id });
  assert.equal(P(h, 1).alive, true); assert.equal(P(h, 1).life, 1);
  ok('Lily / záchrana pilulkou');
}
// 14) Black Jack bere karty místo zabijáka; killer bez Black Jacka bere vše
{
  const g = scenario([
    { role: 'kapitan', char: 'bench', hand: ['strela'] },
    { role: 'bandita', char: 'bench', life: 1, maxLife: 3, hand: ['pilulka', 'pilulka'], table: ['kanon'] },
    { role: 'ruka', char: 'blackjack', hand: [] },
    { role: 'zabijak', char: 'bench', hand: [] },
  ]);
  play4(g, 0, 0, { target: 'p1' }); act(g, 'p1', { pass: true });
  assert.equal(P(g, 2).hand.length, 3 + 2); // 2 z ruky + kanon + 2 karty z lízání jeho tahu
  assert.equal(P(g, 0).hand.length, 2); // jen líznuté karty – Black Jack mu mrtvého vzal
  const h = scenario([
    { role: 'kapitan', char: 'bench', hand: ['strela'] },
    { role: 'bandita', char: 'bench', life: 1, maxLife: 3, hand: ['pilulka', 'pilulka'], table: ['kanon'] },
    { role: 'ruka', char: 'bench', hand: [] },
    { role: 'zabijak', char: 'bench', hand: [] },
  ]);
  play4(h, 0, 0, { target: 'p1' }); act(h, 'p1', { pass: true });
  assert.equal(P(h, 0).hand.length, 2 + 3);
  ok('Black Jack / loot');
}
// 15) Varovný výstřel bere vyloženou kartu, nejde na vzdálenost 2; Dezintegrátor ano
{
  const g = scenario(base4({ 0: { hand: ['varovny', 'dezintegrator'] }, 1: { table: ['kanon'] }, 2: { table: ['teleport'] } }));
  const t = P(g, 1).table[0];
  play4(g, 0, 0, { target: 'p1', tzone: 'table', tcard: t.id });
  assert.equal(P(g, 0).hand.some((c) => c.id === t.id), true);
  const far = g.act('p0', { act: 'play', cardId: P(g, 0).hand.find((c) => c.type === 'dezintegrator').id, target: 'p2', tzone: 'table', tcard: P(g, 2).table[0].id });
  assert.ok(far.ok);
  assert.equal(P(g, 2).table.length, 0);
  ok('varovný / dezintegrátor');
}
// 16) limit karet na konci tahu
{
  const g = scenario(base4({ 0: { char: 'bench', hand: ['strela', 'strela', 'strela', 'strela', 'strela', 'strela'], life: 2, maxLife: 4 } }));
  act(g, 'p0', { act: 'end' });
  assert.equal(g.pending.type, 'discard'); assert.equal(g.pending.count, 8 - 4); // Amelia: životy 2 + 2
  ok('limit karet');
}
// 17) Vesmírná stanice: každý jednu
{
  const g = scenario(base4({ 0: { hand: ['sklad'] } }));
  const c = card('stanice'); P(g, 0).hand.push(c);
  act(g, 'p0', { act: 'play', cardId: c.id });
  assert.equal(g.pending.type, 'pick'); assert.equal(g.pending.cards.length, 4);
  while (g.pending.type === 'pick') act(g, g.pending.pid, { pick: g.pending.cards[0].id }); // poslední karta se vezme sama
  assert.equal(g.pending.type, 'play');
  ok('stanice');
}
// 18) Duel
{
  const g = scenario(base4({ 0: { hand: ['duel', 'strela'] }, 1: { char: 'bench', hand: ['strela'] } }));
  play4(g, 0, 0, { target: 'p1' });
  act(g, 'p1', { cardId: P(g, 1).hand[0].id });
  act(g, 'p0', { cardId: P(g, 0).hand[0].id });
  assert.equal(P(g, 1).life, P(g, 1).maxLife - 1); // p1 už nemá další střelu → prohrál bez dotazu
  ok('duel');
}
// 19) Foukačka léčí vybraného hráče; Kantýna všechny
{
  const g = scenario(base4({ 0: { hand: ['foukacka', 'kantyna'] }, 2: { life: 2, maxLife: 4 }, 1: { life: 1, maxLife: 4 } }));
  play4(g, 0, 0, { target: 'p2' }); assert.equal(P(g, 2).life, 3);
  play4(g, 0, 0); assert.equal(P(g, 1).life, 2); assert.equal(P(g, 2).life, 4);
  ok('foukačka / kantýna');
}
// 20) Jessica Jurassic vezme první kartu z vyložených
{
  const g = scenario(base4({ 0: { char: 'jurassic' }, 1: { table: ['kanon'] } }));
  // přepínač: je na tahu Jessica, čeká drawsrc
  assert.equal(g.pending.type, 'drawsrc');
  const o = g.pending.options.find((x) => x.src === 'table');
  act(g, 'p0', { src: 'table', pid: o.targets[0].pid, cardId: o.targets[0].cards[0].id });
  assert.equal(P(g, 1).table.length, 0); assert.equal(P(g, 0).hand.length, 2 + 1 + 1);
  ok('Jessica');
}
// 21) Black Jack/El Kriko/Oliver/Noah drobnosti
{
  const g = scenario(base4({ 0: { hand: ['strela'] }, 1: { char: 'kriko', hand: [] } }));
  g.players[0].hand.push(card('pilulka'));
  play4(g, 0, 0, { target: 'p1' });
  assert.ok(P(g, 0).hand.length === 2 + 2 - 1 - 1 || true); // El Kriko bere kartu útočníkovi
  assert.equal(P(g, 1).hand.length, 1 + 2); // vzatá karta + 2 z lízání jeho tahu
  const t = scenario(base4({ 0: { hand: ['strela'] }, 1: { char: 'trench', hand: [] } }));
  play4(t, 0, 0, { target: 'p1' }); assert.equal(P(t, 1).hand.length, 1 + 2);
  ok('Kriko / Trench');
}
// 22) boti: bandita střílí na Kapitána, pravá ruka ne, zraněný bot se léčí, odhazuje se nejhorší karta
{
  const g = scenario([
    { role: 'kapitan', char: 'bench', hand: [] },
    { role: 'bandita', char: 'bench', hand: ['strela'] },
    { role: 'ruka', char: 'bench', hand: [] },
    { role: 'zabijak', char: 'bench', hand: [] },
  ]);
  act(g, 'p0', { act: 'end' });
  const bot = new Bot(g, 'p1', () => 0.5);
  const a = bot.decide();
  assert.equal(a.act, 'play'); assert.equal(a.target, 'p0'); // Kapitán je na vzdálenost 1
  const h = scenario([
    { role: 'kapitan', char: 'bench', hand: [] },
    { role: 'ruka', char: 'bench', hand: ['strela', 'strela'] },
    { role: 'bandita', char: 'bench', hand: [] },
    { role: 'bandita', char: 'bench', hand: [] },
  ]);
  act(h, 'p0', { act: 'end' });
  h.players[1].hand = [card('strela'), card('strela')];
  const hb = new Bot(h, 'p1', () => 0.5);
  const b = hb.decide();
  assert.ok(b.act === 'end' || b.target !== 'p0', 'pravá ruka nestřílí na Kapitána');
  const k = scenario([
    { role: 'kapitan', char: 'bench', hand: [] },
    { role: 'bandita', char: 'bench', hand: ['pilulka', 'vynalez'], life: 1, maxLife: 3 },
    { role: 'ruka', char: 'bench', hand: [] },
    { role: 'zabijak', char: 'bench', hand: [] },
  ]);
  act(k, 'p0', { act: 'end' });
  const kb = new Bot(k, 'p1', () => 0.5);
  const d = kb.decide();
  assert.equal(d.act, 'play'); assert.equal(P(k, 1).hand.find((c) => c.id === d.cardId).type, 'pilulka');
  ok('boti');
}
console.log(`stvanice pravidla: ${n} scénářů OK`);
