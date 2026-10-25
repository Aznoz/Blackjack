// Šachový engine: perft (známé počty uzlů), speciální tahy, koncové stavy.
import assert from 'node:assert/strict';
import { fromFen, perft, Game, START_FEN, toFen, sqFrom, legalMoves } from './sachy/engine.js';

const P = [
  ['start', START_FEN, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['pozice 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['pozice 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['pozice 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['pozice 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079]],
];
for (const [name, fen, exp] of P) {
  const s = fromFen(fen);
  assert.equal(toFen(s), fen, `FEN round-trip ${name}`);
  exp.forEach((n, i) => assert.equal(perft(s, i + 1), n, `perft ${name} hloubka ${i + 1}`));
  console.log('perft OK:', name);
}

// Zkrácený mat (fool's mate)
let g = new Game();
for (const [a, b] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) assert.ok(g.play(sqFrom(a), sqFrom(b)).ok);
assert.equal(g.result.type, 'mat'); assert.equal(g.result.winner, 'b'); assert.equal(g.sans.at(-1), 'Qh4#');
assert.ok(g.play(sqFrom('a2'), sqFrom('a3')).err, 'po matu už nejde táhnout');

// Pat
g = new Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
assert.equal(g.result.type, 'pat');
// Nedostatek materiálu
assert.equal(new Game('8/8/8/4k3/8/3K4/8/8 w - - 0 1').result.reason, 'Nedostatek materiálu');
assert.equal(new Game('8/8/8/4k3/8/3KN3/8/8 w - - 0 1').result.type, 'remiza');
// Braní mimochodem + rošáda + proměna
g = new Game('r3k2r/8/8/3pP3/8/8/8/R3K2R w KQkq d6 0 1');
assert.ok(g.play(sqFrom('e5'), sqFrom('d6')).ok); assert.equal(g.sans[0], 'exd6'); assert.equal(g.state.board[sqFrom('d5')], null);
assert.ok(g.play(sqFrom('e8'), sqFrom('g8')).ok); assert.equal(g.state.board[sqFrom('f8')], 'r'); assert.equal(g.sans[1], 'O-O');
g = new Game('8/P6k/8/8/8/8/8/K7 w - - 0 1');
assert.ok(g.play(sqFrom('a7'), sqFrom('a8'), 'n').ok); assert.equal(g.state.board[sqFrom('a8')], 'N');
// Rošáda přes šachované pole není povolena
const s = fromFen('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
assert.ok(!legalMoves(s).some((m) => m.castle === 'k'), 'rošáda přes šach');
assert.ok(legalMoves(s).some((m) => m.castle === 'q'));
// Trojí opakování
g = new Game();
for (let i = 0; i < 2; i++) for (const [a, b] of [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]) g.play(sqFrom(a), sqFrom(b));
assert.equal(g.result && g.result.reason, 'Trojí opakování pozice');
// Pravidlo 50 tahů
assert.equal(new Game('4k3/8/8/8/8/8/R7/4K3 w - - 100 80').result.reason, 'Pravidlo 50 tahů');
console.log('šachový engine OK');
