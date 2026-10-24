// Cílené testy čtyř nových karet Prokleté komory: roulette, rest, bond, whisper.
import { Game, eventsFor } from './komora/game.js';
import { CARD_DEFS, CAP } from './komora/cards.js';
import { decide } from './komora/bot.js';

let failures = 0;
const expect = (c, m) => { if (!c) { failures++; console.error('  ✗', m); } };
function fresh(count = 3, lives = 4, rng) {
  const defs = Array.from({ length: count }, (_, i) => ({ id: 'p' + i, name: 'T' + i }));
  const g = new Game(defs, { lives, durScale: 0, rng });
  g.start(); g.turn = 0;
  for (const p of g.players) p.hand = [];
  return g;
}
const give = (g, pid, type) => { const c = { id: g.nextCardId++, type }; g.byId(pid).hand.push(c); return c; };
const setCh = (g, arr) => { g.chambers = arr.map((l) => ({ live: l, seen: new Map() })); g.pub = { live: arr.filter(Boolean).length, blank: arr.filter((x) => !x).length, uncertain: false }; g.history = []; };

expect(['roulette', 'rest', 'bond', 'whisper'].every((t) => CARD_DEFS[t]), 'nové karty jsou v definicích');

{ // rest: +2 (strop maxHp) a okamžitý konec tahu
  const g = fresh(3, 4); setCh(g, [false, false, true, false, false, false]);
  g.byId('p0').hp = 1;
  const c = give(g, 'p0', 'rest');
  const r = g.use('p0', c.id);
  expect(r.ok && g.byId('p0').hp === 3, 'rest vyléčí 2 životy');
  expect(g.cur().id === 'p1' && r.events.some((e) => e.e === 'rest'), 'rest ukončí tah');
  g.byId('p1').hp = 3; const c2 = give(g, 'p1', 'rest'); g.use('p1', c2.id);
  expect(g.byId('p1').hp === 4, 'rest nepřeleje maximum');
}
{ // rest: jen na začátku tahu a ne při plných životech
  const g = fresh(3, 4); setCh(g, [false, false, true, false, false, false]);
  g.byId('p0').hp = 2;
  const c = give(g, 'p0', 'rest'); const e = give(g, 'p0', 'eye');
  expect(g.use('p0', e.id).ok, 'eye');
  const bad = g.use('p0', c.id);
  expect(!bad.ok, 'rest po zahrané kartě nejde');
  // po slepém výstřelu do sebe (další tah) také ne
  const g2 = fresh(3, 4); setCh(g2, [false, false, true, false, false, false]); g2.byId('p0').hp = 2;
  const c2 = give(g2, 'p0', 'rest');
  g2.shoot('p0', 'p0');
  expect(g2.cur().id === 'p0' && !g2.use('p0', c2.id).ok, 'rest po výstřelu nejde');
  const g3 = fresh(3, 4); const c3 = give(g3, 'p0', 'rest');
  expect(!g3.use('p0', c3.id).ok, 'rest při plných životech nejde');
  // nový tah = zase jde
  const g4 = fresh(3, 4); setCh(g4, [false, true, false, false, false, false]); g4.byId('p1').hp = 1;
  g4.shoot('p0', 'p1');
  const c4 = give(g4, 'p1', 'rest');
  expect(g4.use('p1', c4.id).ok, 'rest na začátku dalšího tahu jde');
}
{ // bond: oba -1; amulet cíle zablokuje jen cíl; nejde při 1 životě; smrt cíle
  const g = fresh(3, 4); setCh(g, [false, false, true, false, false, false]);
  const c = give(g, 'p0', 'bond');
  const r = g.use('p0', c.id, 'p1');
  expect(r.ok && g.byId('p0').hp === 3 && g.byId('p1').hp === 3 && g.cur().id === 'p0', 'bond ubere oběma a tah pokračuje');
  const g2 = fresh(3, 4); g2.byId('p1').amulet = true;
  const c2 = give(g2, 'p0', 'bond'); g2.use('p0', c2.id, 'p1');
  expect(g2.byId('p1').hp === 4 && !g2.byId('p1').amulet && g2.byId('p0').hp === 3, 'amulet cíle pohltí zranění, ty ztratíš život');
  const g3 = fresh(3, 4); g3.byId('p0').hp = 1; const c3 = give(g3, 'p0', 'bond');
  expect(!g3.use('p0', c3.id, 'p1').ok, 'bond při posledním životě nejde');
  const g4 = fresh(2, 4); g4.byId('p1').hp = 1; const c4 = give(g4, 'p0', 'bond');
  const r4 = g4.use('p0', c4.id, 'p1');
  expect(r4.ok && g4.phase === 'over' && g4.winner === 'p0' && !g4.byId('p1').alive && g4.byId('p0').hp === 3, 'bond zabije cíl a hra skončí');
  const g5 = fresh(3, 4); const c5 = give(g5, 'p0', 'bond');
  expect(!g5.use('p0', c5.id, 'p0').ok && !g5.use('p0', c5.id, null).ok, 'bond potřebuje jiného hráče');
}
{ // roulette: náhodný cíl, tah nekončí, spotřebuje náboj
  const seq = [0.0, 0.5, 0.99]; let k = 0; const rng = () => seq[k++ % seq.length];
  const g = fresh(3, 4, rng); setCh(g, [true, false, false, false, false, false]);
  const c = give(g, 'p0', 'roulette');
  k = 0;
  const r = g.use('p0', c.id);
  const sh = r.events.find((e) => e.e === 'rshot');
  expect(r.ok && sh && sh.t === 'p0' && sh.live && sh.dmg === 1, 'ruleta zasáhla náhodného hráče (zde sebe)');
  expect(g.byId('p0').hp === 3 && g.chambers.length === 5 && g.pub.live === 0, 'ruleta spotřebovala náboj a ubrala život');
  expect(g.cur().id === 'p0', 'po ruletě tah pokračuje');
  const g2 = fresh(3, 4, () => 0.5); setCh(g2, [false, false, false, false, false, false]); const c2 = give(g2, 'p0', 'roulette');
  const r2 = g2.use('p0', c2.id);
  expect(r2.events.find((e) => e.e === 'rshot').dmg === 0 && g2.cur().id === 'p0', 'slepý náboj neubírá');
  // amulet
  const g3 = fresh(3, 4, () => 0.5); setCh(g3, [true, false, false, false, false, false]); g3.byId('p1').amulet = true;
  const c3 = give(g3, 'p0', 'roulette'); g3.use('p0', c3.id);
  expect(g3.byId('p1').hp === 4 && !g3.byId('p1').amulet, 'amulet ochrání před ruletou');
  // sebevražda: tah končí
  const g4 = fresh(3, 4, () => 0); setCh(g4, [true, false, false, false, false, false]); g4.byId('p0').hp = 1;
  const c4 = give(g4, 'p0', 'roulette'); const r4 = g4.use('p0', c4.id);
  expect(!g4.byId('p0').alive && g4.cur().id !== 'p0' && g4.phase === 'playing' && r4.events.some((e) => e.e === 'death'), 'smrt sebe ruletou ukončí tah');
  // poslední náboj => nabití
  const g5 = fresh(3, 4, () => 0.5); setCh(g5, [false]); const c5 = give(g5, 'p0', 'roulette'); g5.use('p0', c5.id);
  expect(g5.chambers.length === CAP, 'po ruletě na poslední náboj se válec znovu nabije');
  // konec hry
  const g6 = fresh(2, 4, () => 0.99); setCh(g6, [true, false, false, false, false, false]); g6.byId('p1').hp = 1;
  const c6 = give(g6, 'p0', 'roulette'); g6.use('p0', c6.id);
  expect(g6.phase === 'over' && g6.winner === 'p0', 'ruleta může ukončit hru');
}
{ // whisper: tajné, jen pro hráče; zná náboj
  const g = fresh(3, 4, () => 0.5); setCh(g, [false, false, true, false, false, false]);
  const c = give(g, 'p0', 'whisper');
  const r = g.use('p0', c.id);
  const ev = r.events.find((e) => e.e === 'peekAt');
  expect(ev && ev.idx === 3 && ev.total === 6 && ev.priv.val === g.chambers[3].live, 'whisper odhalí náhodný náboj');
  const mine = eventsFor(r.events, 'p0').find((e) => e.e === 'peekAt');
  const other = eventsFor(r.events, 'p1').find((e) => e.e === 'peekAt');
  expect(mine.val === g.chambers[3].live && !('val' in other), 'hodnotu uvidí jen hráč');
  expect(g.view('p0').cyl.known[3] === g.chambers[3].live && g.view('p1').cyl.known[3] == null, 'komora je pro hráče označená jako známá');
  expect(g.cur().id === 'p0', 'whisper tah nekončí');
}
{ // boti nové karty používají a nerozbijí hru
  let games = 0; let errs = 0;
  for (let n = 0; n < 400; n++) {
    const g = fresh(2 + (n % 3), 3 + (n % 3));
    for (const p of g.players) { p.bot = true; for (const t of ['roulette', 'rest', 'bond', 'whisper']) give(g, p.id, t); }
    let steps = 0;
    while (g.phase === 'playing' && steps++ < 400) {
      const cur = g.cur();
      const act = decide(g.view(cur.id), Math.random);
      const r = act.t === 'use' ? g.use(cur.id, act.card, act.target) : g.shoot(cur.id, act.target);
      if (!r.ok) { errs++; break; }
    }
    if (g.phase === 'playing') errs++;
    games++;
  }
  expect(errs === 0, `boti s novými kartami odehráli ${games} her bez chyby (chyb: ${errs})`);
}
console.log(failures ? `\nSELHALO: ${failures}` : 'Karty ruleta/spánek/pouto/šepot: všechny kontroly prošly ✓');
process.exit(failures ? 1 : 0);
