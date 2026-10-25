// Test enginu Vesmírné štvanice: tisíce her s náhodnými hráči – nesmí nikde spadnout ani zaseknout,
// počet karet musí být pořád 82 a každá hra musí mít vítěze.
import assert from 'node:assert/strict';
import { Game, cardCount } from './stvanice/game.js';
import { randomAction } from './stvanice/actions.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './stvanice/data.js';

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const outcomes = {}; let turnsTotal = 0; let steps = 0;
const GAMES = Number(process.env.GAMES) || 1500;
for (let i = 0; i < GAMES; i++) {
  const rng = mulberry(1000 + i);
  const n = MIN_PLAYERS + (i % (MAX_PLAYERS - MIN_PLAYERS + 1));
  const players = Array.from({ length: n }, (_, k) => ({ id: 'p' + k, name: 'H' + k, bot: true }));
  const g = new Game({ players, rng, pick: true });
  let guard = 0;
  const order = [];
  while (g.pending && !g.result) {
    if (g.phase === 'rolepick' || g.phase === 'charpick') {
      order.push(g.phase + ':' + g.players.findIndex((p) => p.id === g.pending.pid));
      // nikdo mimo vybírajícího nesmí z pohledu vidět cizí roli
      for (const q of g.players) { const v = g.view(q.id); assert.ok(v.players.every((p) => p.id === q.id || p.role === null || (g.phase === 'charpick' && p.role === 'kapitan')), 'role se v úvodu neukazují'); assert.ok(v.pick); }
    }
    if (g.phase === 'play' && order.length) {
      // pořadí: obě fáze po směru hodin od náhodného hráče
      for (const ph of ['rolepick', 'charpick']) {
        const idx = order.filter((x) => x.startsWith(ph)).map((x) => Number(x.split(':')[1]));
        assert.equal(idx.length, n);
        idx.forEach((v, k) => assert.equal(v, (idx[0] + k) % n, 'po směru hodin'));
      }
      const roles = g.players.map((p) => p.role).sort();
      for (const r of ['kapitan', 'bandita', 'zabijak']) assert.ok(roles.includes(r), 'chybí ' + r);
      assert.equal(roles.filter((r) => r === 'sebevrah' || r === 'silenec').length, n >= 8 ? 2 : 1);
      assert.equal(roles.length, n);
      assert.equal(new Set(g.players.map((p) => p.char.id)).size, n, 'postavy se neopakují');
      order.length = 0;
    }
    assert.equal(cardCount(g), 82, `počet karet (hra ${i})`);
    const a = randomAction(g, rng);
    const r = g.act(g.pending.pid, a);
    assert.ok(r.ok, `akce selhala: ${JSON.stringify(a)} → ${r.err} (typ ${g.pending && g.pending.type}, hra ${i})`);
    steps++;
    if (++guard > 20000) assert.fail(`hra ${i} se zasekla`);
    for (const p of g.players) { assert.ok(p.life <= p.maxLife); assert.ok(p.alive || p.life === 0); }
  }
  assert.ok(g.result, `hra ${i} skončila bez výsledku`);
  assert.ok(g.result.winners.length >= 1, 'vítěz');
  outcomes[g.result.outcome] = (outcomes[g.result.outcome] || 0) + 1;
  turnsTotal += g.events.filter((e) => e.type === 'turn').length;
}
console.log(`stvanice engine: ${GAMES} her OK, kroků ${steps}, výsledky`, outcomes, 'průměr tahů', Math.round(turnsTotal / GAMES));
