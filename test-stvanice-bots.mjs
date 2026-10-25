// Simulace her bot proti botům: musí skončit, bez neplatných tahů, s rozumným rozložením vítězů.
import assert from 'node:assert/strict';
import { Game, cardCount } from './stvanice/game.js';
import { Bot } from './stvanice/bot.js';
import { MIN_PLAYERS, MAX_PLAYERS } from './stvanice/data.js';

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const GAMES = Number(process.env.GAMES) || 400;
const per = {}; let invalid = 0; let maxTurns = 0; let turnsSum = 0; const winRole = {};
for (let i = 0; i < GAMES; i++) {
  const rng = mulberry(77 + i * 13);
  const n = MIN_PLAYERS + (i % (MAX_PLAYERS - MIN_PLAYERS + 1));
  const players = Array.from({ length: n }, (_, k) => ({ id: 'b' + k, name: 'B' + k, bot: true }));
  const g = new Game({ players, rng });
  const bots = new Map(g.players.map((p) => [p.id, new Bot(g, p.id, rng)]));
  let guard = 0;
  while (g.pending && !g.result) {
    if (cardCount(g) !== 82) assert.fail(`karty ${cardCount(g)} ve hře ${i}`);
    const pid = g.pending.pid;
    let a = bots.get(pid).decide();
    let r = g.act(pid, a);
    if (!r.ok) { invalid++; if (process.env.DEBUG) console.log('neplatné', g.pending.type, JSON.stringify(a), r.err); r = g.act(pid, g.autoAction()); assert.ok(r.ok, 'ani auto akce neprošla'); }
    if (++guard > 40000) assert.fail(`hra ${i} (${n} hráčů) se zasekla`);
  }
  const turns = g.events.filter((e) => e.type === 'turn').length;
  maxTurns = Math.max(maxTurns, turns); turnsSum += turns;
  const k = `${n}h`;
  per[k] ||= {}; per[k][g.result.outcome] = (per[k][g.result.outcome] || 0) + 1;
  winRole[g.result.outcome] = (winRole[g.result.outcome] || 0) + 1;
}
console.log(`boti: ${GAMES} her, neplatných tahů ${invalid}, průměr tahů ${Math.round(turnsSum / GAMES)}, max ${maxTurns}`);
console.log(JSON.stringify(per));
console.log('celkem', winRole);
assert.ok(invalid === 0, 'boti nesmí zkoušet neplatné tahy');
