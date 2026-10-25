// Šachový engine: plná pravidla (rošáda, braní mimochodem, proměna, šach, mat, pat, remízy).
// Pole = rank*8 + file (a1 = 0, h1 = 7, a8 = 56). Figury: velké = bílé (PNBRQK), malé = černé (pnbrqk).
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const FILES = 'abcdefgh';
export const sqName = (s) => FILES[s & 7] + ((s >> 3) + 1);
export const sqFrom = (n) => FILES.indexOf(n[0]) + (parseInt(n[1], 10) - 1) * 8;
const isWhite = (p) => p !== null && p === p.toUpperCase();
const colorOf = (p) => (p === null ? null : isWhite(p) ? 'w' : 'b');
const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KG = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function fromFen(fen) {
  const [pos, turn, cast, ep, half, full] = fen.trim().split(/\s+/);
  const board = new Array(64).fill(null);
  const rows = pos.split('/');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) f += parseInt(ch, 10); else { board[(7 - r) * 8 + f] = ch; f++; }
    }
  }
  return {
    board, turn: turn === 'b' ? 'b' : 'w',
    castling: { K: cast.includes('K'), Q: cast.includes('Q'), k: cast.includes('k'), q: cast.includes('q') },
    ep: ep && ep !== '-' ? sqFrom(ep) : -1, half: parseInt(half || '0', 10), full: parseInt(full || '1', 10),
  };
}
export function toFen(s) {
  let out = '';
  for (let r = 7; r >= 0; r--) {
    let e = 0;
    for (let f = 0; f < 8; f++) {
      const p = s.board[r * 8 + f];
      if (!p) e++; else { if (e) { out += e; e = 0; } out += p; }
    }
    if (e) out += e;
    if (r) out += '/';
  }
  const c = (s.castling.K ? 'K' : '') + (s.castling.Q ? 'Q' : '') + (s.castling.k ? 'k' : '') + (s.castling.q ? 'q' : '');
  return `${out} ${s.turn} ${c || '-'} ${s.ep >= 0 ? sqName(s.ep) : '-'} ${s.half} ${s.full}`;
}
/** Klíč pozice pro trojí opakování (bez počítadel tahů; braní mimochodem jen když je opravdu možné). */
export function posKey(s) {
  const f = toFen(s).split(' ');
  return `${f[0]} ${f[1]} ${f[2]} ${s.ep >= 0 && epPossible(s) ? f[3] : '-'}`;
}
function epPossible(s) {
  if (s.ep < 0) return false;
  const me = s.turn; const pawn = me === 'w' ? 'P' : 'p'; const dir = me === 'w' ? -1 : 1;
  const r = (s.ep >> 3) + dir; const f = s.ep & 7;
  for (const df of [-1, 1]) { const ff = f + df; if (ff < 0 || ff > 7) continue; if (s.board[r * 8 + ff] === pawn) return legalMoves(s).some((m) => m.ep); }
  return false;
}
export const startState = () => fromFen(START_FEN);

export function isAttacked(board, sq, by) {
  const r = sq >> 3, f = sq & 7;
  // pěšci
  const pr = by === 'w' ? r - 1 : r + 1; const P = by === 'w' ? 'P' : 'p';
  if (pr >= 0 && pr < 8) for (const df of [-1, 1]) { const ff = f + df; if (ff >= 0 && ff < 8 && board[pr * 8 + ff] === P) return true; }
  const N = by === 'w' ? 'N' : 'n';
  for (const [dr, df] of KN) { const rr = r + dr, ff = f + df; if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && board[rr * 8 + ff] === N) return true; }
  const K = by === 'w' ? 'K' : 'k';
  for (const [dr, df] of KG) { const rr = r + dr, ff = f + df; if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && board[rr * 8 + ff] === K) return true; }
  const B = by === 'w' ? 'B' : 'b', R = by === 'w' ? 'R' : 'r', Q = by === 'w' ? 'Q' : 'q';
  for (const [dr, df] of DIAG) {
    let rr = r + dr, ff = f + df;
    while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { const p = board[rr * 8 + ff]; if (p) { if (p === B || p === Q) return true; break; } rr += dr; ff += df; }
  }
  for (const [dr, df] of ORTH) {
    let rr = r + dr, ff = f + df;
    while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) { const p = board[rr * 8 + ff]; if (p) { if (p === R || p === Q) return true; break; } rr += dr; ff += df; }
  }
  return false;
}
const kingSq = (board, c) => board.indexOf(c === 'w' ? 'K' : 'k');
export const inCheck = (s, c = s.turn) => { const k = kingSq(s.board, c); return k >= 0 && isAttacked(s.board, k, c === 'w' ? 'b' : 'w'); };

/** Pseudo-legální tahy (bez kontroly vlastního krále). Tah: {from,to,piece,cap,promo,ep,castle,double} */
function pseudo(s) {
  const out = []; const { board, turn } = s; const me = turn; const op = me === 'w' ? 'b' : 'w';
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq]; if (!p || colorOf(p) !== me) continue;
    const t = p.toUpperCase(); const r = sq >> 3, f = sq & 7;
    if (t === 'P') {
      const dir = me === 'w' ? 1 : -1; const start = me === 'w' ? 1 : 6; const last = me === 'w' ? 7 : 0;
      const r1 = r + dir;
      if (r1 >= 0 && r1 < 8 && !board[r1 * 8 + f]) {
        if (r1 === last) for (const pr of 'qrbn') out.push({ from: sq, to: r1 * 8 + f, piece: p, cap: null, promo: pr });
        else {
          out.push({ from: sq, to: r1 * 8 + f, piece: p, cap: null });
          if (r === start && !board[(r + 2 * dir) * 8 + f]) out.push({ from: sq, to: (r + 2 * dir) * 8 + f, piece: p, cap: null, double: true });
        }
      }
      for (const df of [-1, 1]) {
        const ff = f + df; if (ff < 0 || ff > 7 || r1 < 0 || r1 > 7) continue;
        const to = r1 * 8 + ff; const tp = board[to];
        if (tp && colorOf(tp) === op) {
          if (r1 === last) for (const pr of 'qrbn') out.push({ from: sq, to, piece: p, cap: tp, promo: pr });
          else out.push({ from: sq, to, piece: p, cap: tp });
        } else if (to === s.ep && !tp) out.push({ from: sq, to, piece: p, cap: me === 'w' ? 'p' : 'P', ep: true });
      }
    } else if (t === 'N' || t === 'K') {
      for (const [dr, df] of t === 'N' ? KN : KG) {
        const rr = r + dr, ff = f + df; if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
        const to = rr * 8 + ff; const tp = board[to];
        if (!tp || colorOf(tp) === op) out.push({ from: sq, to, piece: p, cap: tp });
      }
      if (t === 'K') {
        const home = me === 'w' ? 0 : 56;
        if (sq === home + 4 && !isAttacked(board, sq, op)) {
          const ks = me === 'w' ? s.castling.K : s.castling.k; const qs = me === 'w' ? s.castling.Q : s.castling.q;
          const R = me === 'w' ? 'R' : 'r';
          if (ks && board[home + 7] === R && !board[home + 5] && !board[home + 6] && !isAttacked(board, home + 5, op) && !isAttacked(board, home + 6, op)) out.push({ from: sq, to: home + 6, piece: p, cap: null, castle: 'k' });
          if (qs && board[home] === R && !board[home + 1] && !board[home + 2] && !board[home + 3] && !isAttacked(board, home + 3, op) && !isAttacked(board, home + 2, op)) out.push({ from: sq, to: home + 2, piece: p, cap: null, castle: 'q' });
        }
      }
    } else {
      const dirs = t === 'B' ? DIAG : t === 'R' ? ORTH : [...DIAG, ...ORTH];
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          const to = rr * 8 + ff; const tp = board[to];
          if (!tp) out.push({ from: sq, to, piece: p, cap: null });
          else { if (colorOf(tp) === op) out.push({ from: sq, to, piece: p, cap: tp }); break; }
          rr += dr; ff += df;
        }
      }
    }
  }
  return out;
}

/** Provede tah a vrátí NOVÝ stav (vstup se nemění). */
export function applyMove(s, m) {
  const board = s.board.slice(); const me = s.turn;
  board[m.to] = m.promo ? (me === 'w' ? m.promo.toUpperCase() : m.promo) : m.piece;
  board[m.from] = null;
  if (m.ep) board[m.to + (me === 'w' ? -8 : 8)] = null;
  if (m.castle) {
    const home = me === 'w' ? 0 : 56;
    if (m.castle === 'k') { board[home + 5] = board[home + 7]; board[home + 7] = null; } else { board[home + 3] = board[home]; board[home] = null; }
  }
  const castling = { ...s.castling };
  const touch = (sq) => { if (sq === 4) { castling.K = false; castling.Q = false; } if (sq === 60) { castling.k = false; castling.q = false; } if (sq === 7) castling.K = false; if (sq === 0) castling.Q = false; if (sq === 63) castling.k = false; if (sq === 56) castling.q = false; };
  touch(m.from); touch(m.to);
  return {
    board, turn: me === 'w' ? 'b' : 'w', castling,
    ep: m.double ? (m.from + m.to) / 2 : -1,
    half: m.piece.toUpperCase() === 'P' || m.cap ? 0 : s.half + 1,
    full: s.full + (me === 'b' ? 1 : 0),
  };
}

export function legalMoves(s) {
  const out = [];
  for (const m of pseudo(s)) {
    const n = applyMove(s, m);
    if (!inCheck(n, s.turn)) out.push(m);
  }
  return out;
}

/** Zápis tahu v SAN (např. Nf3, exd5, O-O, e8=Q+). */
export function toSan(s, m, legal = legalMoves(s)) {
  let san;
  const t = m.piece.toUpperCase();
  if (m.castle) san = m.castle === 'k' ? 'O-O' : 'O-O-O';
  else {
    const cap = m.cap || m.ep;
    if (t === 'P') san = (cap ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
    else {
      const same = legal.filter((o) => o !== m && o.piece === m.piece && o.to === m.to);
      let dis = '';
      if (same.length) {
        const sameFile = same.some((o) => (o.from & 7) === (m.from & 7)); const sameRank = same.some((o) => (o.from >> 3) === (m.from >> 3));
        if (!sameFile) dis = FILES[m.from & 7]; else if (!sameRank) dis = String((m.from >> 3) + 1); else dis = sqName(m.from);
      }
      san = t + dis + (cap ? 'x' : '') + sqName(m.to);
    }
  }
  const n = applyMove(s, m);
  if (inCheck(n)) san += legalMoves(n).length ? '+' : '#';
  return san;
}

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
export const pieceValue = (p) => VAL[p.toLowerCase()] || 0;

/** Nedostatek materiálu pro mat (K vs K, K+N/B vs K, K+B vs K+B stejnobarevné). */
export function insufficient(board) {
  const pcs = board.map((p, i) => (p ? [p.toLowerCase(), i] : null)).filter((x) => x && x[0] !== 'k');
  if (!pcs.length) return true;
  if (pcs.some((x) => x[0] === 'p' || x[0] === 'r' || x[0] === 'q')) return false;
  if (pcs.length === 1) return true; // jedna lehká figura
  if (pcs.every((x) => x[0] === 'b')) { const col = (i) => ((i >> 3) + (i & 7)) & 1; return pcs.every((x) => col(x[1]) === col(pcs[0][1])); }
  return false;
}

/**
 * Hra: drží historii pozic. play(from,to,promo) vrátí {ok,move,san} nebo {err}.
 * result: null | {type:'mat'|'pat'|'remiza', winner:'w'|'b'|null, reason}
 */
export class Game {
  constructor(fen = START_FEN) {
    this.state = fromFen(fen);
    this.sans = []; this.moves = []; this.keys = [posKey(this.state)]; this.fens = [toFen(this.state)];
    this.result = null;
    this.evaluate();
  }
  legal() { return legalMoves(this.state); }
  movesFrom(sq) { return this.legal().filter((m) => m.from === sq); }
  find(from, to, promo) {
    const c = this.legal().filter((m) => m.from === from && m.to === to);
    if (!c.length) return null;
    if (c[0].promo) { const p = (promo || 'q').toLowerCase(); return c.find((m) => m.promo === p) || null; }
    return c[0];
  }
  play(from, to, promo) {
    if (this.result) return { err: 'Hra už skončila.' };
    const legal = this.legal();
    const m = legal.find((x) => x.from === from && x.to === to && (!x.promo || x.promo === (promo || 'q').toLowerCase()));
    if (!m) return { err: 'Neplatný tah.' };
    const san = toSan(this.state, m, legal);
    this.state = applyMove(this.state, m);
    this.sans.push(san); this.moves.push({ from: m.from, to: m.to, promo: m.promo || null, cap: m.cap || (m.ep ? (m.piece === 'P' ? 'p' : 'P') : null), castle: m.castle || null });
    this.keys.push(posKey(this.state)); this.fens.push(toFen(this.state));
    this.evaluate();
    return { ok: true, move: m, san };
  }
  evaluate() {
    const s = this.state;
    const n = legalMoves(s).length;
    if (n === 0) { this.result = inCheck(s) ? { type: 'mat', winner: s.turn === 'w' ? 'b' : 'w', reason: 'Šachmat' } : { type: 'pat', winner: null, reason: 'Pat – hráč na tahu nemá žádný tah' }; return; }
    if (insufficient(s.board)) { this.result = { type: 'remiza', winner: null, reason: 'Nedostatek materiálu' }; return; }
    const k = this.keys[this.keys.length - 1];
    if (this.keys.filter((x) => x === k).length >= 3) { this.result = { type: 'remiza', winner: null, reason: 'Trojí opakování pozice' }; return; }
    if (s.half >= 100) { this.result = { type: 'remiza', winner: null, reason: 'Pravidlo 50 tahů' }; return; }
    this.result = null;
  }
}

export function perft(s, depth) {
  if (depth === 0) return 1;
  const ms = legalMoves(s);
  if (depth === 1) return ms.length;
  let n = 0;
  for (const m of ms) n += perft(applyMove(s, m), depth - 1);
  return n;
}
