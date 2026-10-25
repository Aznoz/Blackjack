// Šachový bot: správnost generátoru tahů (perft + porovnání s engine.js) a základní síla úrovní.
import assert from 'node:assert/strict';
import * as AI from './sachy/ai.js';
import { Game, legalMoves, fromFen, START_FEN, sqName } from './sachy/engine.js';

const P = [
  [START_FEN, [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
for (const [fen, exp] of P) exp.forEach((n, i) => assert.equal(AI.perft(fen, i + 1), n, `perft ${fen} d${i + 1}`));
console.log('perft bota OK');

// náhodné partie: legální tahy bota a engine.js se musí shodovat v každé pozici
let positions = 0;
for (let g = 0; g < 40; g++) {
  const game = new Game();
  for (let i = 0; i < 160 && !game.result; i++) {
    const fen = game.fens[game.fens.length - 1];
    const a = AI.legalList(fen).sort();
    const b = legalMoves(game.state).map((m) => `${m.from}-${m.to}${m.promo || ''}`).sort();
    assert.deepEqual(a, b, `legální tahy se liší v ${fen}`);
    positions++;
    const ms = legalMoves(game.state); const m = ms[Math.floor(Math.random() * ms.length)];
    game.play(m.from, m.to, m.promo || 'q');
  }
}
console.log('shoda s engine.js OK (pozic:', positions + ')');

// taktika: mat v 1 a v 2, braní zdarma, vyhnutí se matu
const mv = (o) => `${sqName(o.from)}${sqName(o.to)}${o.promo || ''}`;
assert.equal(mv(AI.bestMove({ fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', level: 5, ms: 500 })), 'a1a8', 'mat v 1');
assert.equal(mv(AI.bestMove({ fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', level: 5, ms: 500 })), 'h5f7', 'matová kombinace Qxf7#');
assert.equal(mv(AI.bestMove({ fen: '4k3/8/8/3q4/8/8/4P3/R3K3 w - - 0 1', level: 4, ms: 400 })).length >= 4, true);
const hang = mv(AI.bestMove({ fen: 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', level: 5, ms: 600 }));
assert.equal(hang, 'f3h4', 'bere nehlídanou dámu');
// každá úroveň vrátí legální tah
for (let lv = 1; lv <= 5; lv++) {
  const g = new Game();
  for (let i = 0; i < 12; i++) { const r = AI.bestMove({ fen: g.fens[g.fens.length - 1], history: g.fens.slice(0, -1), level: lv, ms: 100 }); assert.ok(g.play(r.from, r.to, r.promo || 'q').ok, `úroveň ${lv} legální tah`); }
}
console.log('taktika a úrovně OK');
