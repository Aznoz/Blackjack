// Šachový bot: rychlý engine na poli 0x88 (make/unmake), alfa-beta s tabulkou pozic, iterativním prohlubováním,
// quiescence, null move, LMR a řazením tahů. Pět úrovní (1 = nováček … 5 = velmi silný soupeř).
// Vstup/výstup používají stejné značení polí jako engine.js (a1 = 0 … h8 = 63).

const EMPTY = 0, PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const MATE = 30000, INF = 32000;
const KN_D = [33, 31, 18, 14, -14, -18, -31, -33];
const K_D = [16, -16, 1, -1, 17, 15, -15, -17];
const B_D = [17, 15, -15, -17];
const R_D = [16, -16, 1, -1];
const VAL = [0, 100, 320, 330, 500, 900, 0];

// ------------------------------------------------------------------ tabulky hodnocení (Michniewski, pohled bílého, 1. řada = 8. řada šachovnice)
const PST_RAW = {
  [PAWN]: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [KNIGHT]: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [BISHOP]: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [ROOK]: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [QUEEN]: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  KING_MG: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  KING_EG: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
};
const PAWN_EG_BONUS = [0, 0, 5, 12, 25, 45, 75, 0]; // podle relativní řady (0 = výchozí)
// MG[piece(1..6)][color][sq88], EG obdobně; hodnoty už zahrnují materiál
const MG = [], EG = [];
for (let p = 0; p <= 6; p++) { MG.push([new Int16Array(128), new Int16Array(128)]); EG.push([new Int16Array(128), new Int16Array(128)]); }
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
  const sq = r * 16 + f;
  for (let p = 1; p <= 6; p++) {
    const mgT = p === KING ? PST_RAW.KING_MG : PST_RAW[p]; const egT = p === KING ? PST_RAW.KING_EG : PST_RAW[p];
    for (let c = 0; c < 2; c++) {
      const idx = c === 0 ? (7 - r) * 8 + f : r * 8 + f; const rel = c === 0 ? r : 7 - r;
      MG[p][c][sq] = VAL[p] + mgT[idx];
      EG[p][c][sq] = VAL[p] + egT[idx] + (p === PAWN ? PAWN_EG_BONUS[rel] : 0);
    }
  }
}
const PHASE_W = [0, 0, 1, 1, 2, 4, 0];

// ------------------------------------------------------------------ Zobrist
let seed = 0x9e3779b9;
const rnd32 = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
const ZLo = new Int32Array(16 * 128), ZHi = new Int32Array(16 * 128), CLo = new Int32Array(16), CHi = new Int32Array(16), ELo = new Int32Array(9), EHi = new Int32Array(9);
for (let i = 0; i < ZLo.length; i++) { ZLo[i] = rnd32(); ZHi[i] = rnd32(); }
for (let i = 0; i < 16; i++) { CLo[i] = rnd32(); CHi[i] = rnd32(); }
for (let i = 0; i < 9; i++) { ELo[i] = rnd32(); EHi[i] = rnd32(); }
const SIDE_LO = rnd32(), SIDE_HI = rnd32();
const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[0x00] = 15 & ~2; CASTLE_MASK[0x07] = 15 & ~1; CASTLE_MASK[0x04] = 15 & ~3;
CASTLE_MASK[0x70] = 15 & ~8; CASTLE_MASK[0x77] = 15 & ~4; CASTLE_MASK[0x74] = 15 & ~12;

// ------------------------------------------------------------------ pozice
const MAXPLY = 128;
class Pos {
  constructor() {
    this.b = new Int8Array(128); this.side = 0; this.castle = 0; this.ep = -1; this.half = 0;
    this.ksq = [0, 0]; this.hLo = 0; this.hHi = 0;
    this.mg = [0, 0]; this.eg = [0, 0]; this.phase = 0; this.cnt = new Int8Array(16);
    this.sp = 0;
    const n = 1024;
    this.uCap = new Int8Array(n); this.uCastle = new Uint8Array(n); this.uEp = new Int16Array(n); this.uHalf = new Int16Array(n);
    this.uLo = new Int32Array(n); this.uHi = new Int32Array(n); this.uMoved = new Int8Array(n);
    this.histLo = new Int32Array(n + 512); this.histHi = new Int32Array(n + 512); this.hn = 0; // hashe dosavadní partie + cesty hledáním
  }
  put(sq, p) {
    this.b[sq] = p; const t = p & 7, c = p >> 3;
    this.hLo ^= ZLo[p * 128 + sq]; this.hHi ^= ZHi[p * 128 + sq];
    this.mg[c] += MG[t][c][sq]; this.eg[c] += EG[t][c][sq]; this.phase += PHASE_W[t]; this.cnt[p]++;
    if (t === KING) this.ksq[c] = sq;
  }
  rem(sq) {
    const p = this.b[sq]; this.b[sq] = 0; const t = p & 7, c = p >> 3;
    this.hLo ^= ZLo[p * 128 + sq]; this.hHi ^= ZHi[p * 128 + sq];
    this.mg[c] -= MG[t][c][sq]; this.eg[c] -= EG[t][c][sq]; this.phase -= PHASE_W[t]; this.cnt[p]--;
    return p;
  }
}
// kódování figur: bílé 1..6, černé 9..14
const FEN_P = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
export function posFromFen(fen) {
  const pos = new Pos();
  const [place, turn, cast, ep, half] = fen.trim().split(/\s+/);
  const rows = place.split('/');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) f += +ch;
      else { const t = FEN_P[ch.toLowerCase()]; const c = ch === ch.toUpperCase() ? 0 : 1; pos.put((7 - r) * 16 + f, t | (c << 3)); f++; }
    }
  }
  pos.side = turn === 'b' ? 1 : 0;
  pos.castle = (cast.includes('K') ? 1 : 0) | (cast.includes('Q') ? 2 : 0) | (cast.includes('k') ? 4 : 0) | (cast.includes('q') ? 8 : 0);
  pos.ep = ep && ep !== '-' ? (parseInt(ep[1], 10) - 1) * 16 + 'abcdefgh'.indexOf(ep[0]) : -1;
  pos.half = parseInt(half || '0', 10);
  if (pos.side) { pos.hLo ^= SIDE_LO; pos.hHi ^= SIDE_HI; }
  pos.hLo ^= CLo[pos.castle]; pos.hHi ^= CHi[pos.castle];
  if (pos.ep >= 0) { pos.hLo ^= ELo[pos.ep & 7]; pos.hHi ^= EHi[pos.ep & 7]; } else { pos.hLo ^= ELo[8]; pos.hHi ^= EHi[8]; }
  return pos;
}

function attacked(pos, sq, by) { // je pole sq napadeno stranou by (0/1)?
  const b = pos.b; const hi = by << 3;
  // pěšci: bílý pěšec na sq-15/sq-17 útočí na sq
  if (by === 0) { let s = sq - 15; if (!(s & 0x88) && b[s] === (PAWN)) return true; s = sq - 17; if (!(s & 0x88) && b[s] === PAWN) return true; }
  else { let s = sq + 15; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true; s = sq + 17; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true; }
  const N = KNIGHT | hi, K = KING | hi, Bi = BISHOP | hi, Ro = ROOK | hi, Q = QUEEN | hi;
  for (let i = 0; i < 8; i++) { const s = sq + KN_D[i]; if (!(s & 0x88) && b[s] === N) return true; }
  for (let i = 0; i < 8; i++) { const s = sq + K_D[i]; if (!(s & 0x88) && b[s] === K) return true; }
  for (let i = 0; i < 4; i++) { const d = B_D[i]; let s = sq + d; while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === Bi || p === Q) return true; break; } s += d; } }
  for (let i = 0; i < 4; i++) { const d = R_D[i]; let s = sq + d; while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === Ro || p === Q) return true; break; } s += d; } }
  return false;
}
const inCheckP = (pos) => attacked(pos, pos.ksq[pos.side], pos.side ^ 1);

// tah: from | to<<8 | promo<<16 | flags<<20 ; flags: 1 = braní, 2 = en passant, 4 = rošáda, 8 = dvojkrok
const mFrom = (m) => m & 0xff, mTo = (m) => (m >> 8) & 0xff, mPromo = (m) => (m >> 16) & 15, mFlags = (m) => m >> 20;

function genMoves(pos, list, capsOnly) {
  let n = 0; const b = pos.b; const side = pos.side; const op = side ^ 1;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = r * 16 + f; const p = b[sq];
    if (!p || (p >> 3) !== side) continue;
    const t = p & 7;
    if (t === PAWN) {
      const dir = side === 0 ? 16 : -16; const start = side === 0 ? 1 : 6; const last = side === 0 ? 7 : 0;
      const s1 = sq + dir;
      if (!(s1 & 0x88) && !b[s1]) {
        if ((s1 >> 4) === last) { for (let pr = QUEEN; pr >= KNIGHT; pr--) { if (capsOnly && pr !== QUEEN) continue; list[n++] = sq | (s1 << 8) | (pr << 16); } }
        else if (!capsOnly) {
          list[n++] = sq | (s1 << 8);
          if (r === start) { const s2 = s1 + dir; if (!b[s2]) list[n++] = sq | (s2 << 8) | (8 << 20); }
        }
      }
      for (const dd of [dir - 1, dir + 1]) {
        const s = sq + dd; if (s & 0x88) continue;
        const q = b[s];
        if (q && (q >> 3) === op) {
          if ((s >> 4) === last) { for (let pr = QUEEN; pr >= KNIGHT; pr--) { if (capsOnly && pr !== QUEEN) continue; list[n++] = sq | (s << 8) | (pr << 16) | (1 << 20); } }
          else list[n++] = sq | (s << 8) | (1 << 20);
        } else if (s === pos.ep && !q) list[n++] = sq | (s << 8) | (3 << 20);
      }
    } else if (t === KNIGHT || t === KING) {
      const D = t === KNIGHT ? KN_D : K_D;
      for (let i = 0; i < 8; i++) {
        const s = sq + D[i]; if (s & 0x88) continue;
        const q = b[s];
        if (!q) { if (!capsOnly) list[n++] = sq | (s << 8); } else if ((q >> 3) === op) list[n++] = sq | (s << 8) | (1 << 20);
      }
      if (t === KING && !capsOnly) {
        const home = side === 0 ? 0x04 : 0x74;
        if (sq === home && !attacked(pos, sq, op)) {
          if ((pos.castle & (side === 0 ? 1 : 4)) && !b[home + 1] && !b[home + 2] && !attacked(pos, home + 1, op) && !attacked(pos, home + 2, op)) list[n++] = sq | ((home + 2) << 8) | (4 << 20);
          if ((pos.castle & (side === 0 ? 2 : 8)) && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(pos, home - 1, op) && !attacked(pos, home - 2, op)) list[n++] = sq | ((home - 2) << 8) | (4 << 20);
        }
      }
    } else {
      const dirs = t === BISHOP ? B_D : t === ROOK ? R_D : K_D;
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i]; let s = sq + d;
        while (!(s & 0x88)) {
          const q = b[s];
          if (!q) { if (!capsOnly) list[n++] = sq | (s << 8); } else { if ((q >> 3) === op) list[n++] = sq | (s << 8) | (1 << 20); break; }
          s += d;
        }
      }
    }
  }
  return n;
}

function make(pos, m) { // vrací false (a nic nemění), pokud tah nechá vlastního krále v šachu
  const from = mFrom(m), to = mTo(m), promo = mPromo(m), fl = mFlags(m);
  const sp = pos.sp; const side = pos.side;
  pos.uCastle[sp] = pos.castle; pos.uEp[sp] = pos.ep; pos.uHalf[sp] = pos.half; pos.uLo[sp] = pos.hLo; pos.uHi[sp] = pos.hHi;
  pos.histLo[pos.hn] = pos.hLo; pos.histHi[pos.hn] = pos.hHi; pos.hn++;
  const moved = pos.b[from]; pos.uMoved[sp] = moved;
  let cap = 0;
  pos.hLo ^= CLo[pos.castle]; pos.hHi ^= CHi[pos.castle];
  pos.hLo ^= pos.ep >= 0 ? ELo[pos.ep & 7] : ELo[8]; pos.hHi ^= pos.ep >= 0 ? EHi[pos.ep & 7] : EHi[8];
  if (fl & 2) { const cs = to + (side === 0 ? -16 : 16); cap = pos.rem(cs); }
  else if (pos.b[to]) cap = pos.rem(to);
  pos.uCap[sp] = cap;
  pos.rem(from);
  pos.put(to, promo ? (promo | (side << 3)) : moved);
  if (fl & 4) { // rošáda: přesun věže
    if (to > from) { pos.rem(to + 1); pos.put(to - 1, ROOK | (side << 3)); } else { pos.rem(to - 2); pos.put(to + 1, ROOK | (side << 3)); }
  }
  pos.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
  pos.ep = (fl & 8) ? (from + to) >> 1 : -1;
  pos.half = ((moved & 7) === PAWN || cap) ? 0 : pos.half + 1;
  pos.hLo ^= CLo[pos.castle]; pos.hHi ^= CHi[pos.castle];
  pos.hLo ^= pos.ep >= 0 ? ELo[pos.ep & 7] : ELo[8]; pos.hHi ^= pos.ep >= 0 ? EHi[pos.ep & 7] : EHi[8];
  pos.hLo ^= SIDE_LO; pos.hHi ^= SIDE_HI;
  pos.sp++; pos.side ^= 1;
  if (attacked(pos, pos.ksq[side], side ^ 1)) { unmake(pos, m); return false; }
  return true;
}
function unmake(pos, m) {
  pos.sp--; pos.hn--; const sp = pos.sp;
  const from = mFrom(m), to = mTo(m), fl = mFlags(m);
  pos.side ^= 1; const side = pos.side;
  const moved = pos.uMoved[sp], cap = pos.uCap[sp];
  if (fl & 4) { if (to > from) { pos.rem(to - 1); pos.put(to + 1, ROOK | (side << 3)); } else { pos.rem(to + 1); pos.put(to - 2, ROOK | (side << 3)); } }
  pos.rem(to); pos.put(from, moved);
  if (cap) { if (fl & 2) pos.put(to + (side === 0 ? -16 : 16), cap); else pos.put(to, cap); }
  pos.castle = pos.uCastle[sp]; pos.ep = pos.uEp[sp]; pos.half = pos.uHalf[sp]; pos.hLo = pos.uLo[sp]; pos.hHi = pos.uHi[sp];
}
function makeNull(pos) {
  const sp = pos.sp; pos.uEp[sp] = pos.ep; pos.uLo[sp] = pos.hLo; pos.uHi[sp] = pos.hHi; pos.uHalf[sp] = pos.half;
  pos.histLo[pos.hn] = pos.hLo; pos.histHi[pos.hn] = pos.hHi; pos.hn++;
  pos.hLo ^= pos.ep >= 0 ? ELo[pos.ep & 7] : ELo[8]; pos.hHi ^= pos.ep >= 0 ? EHi[pos.ep & 7] : EHi[8];
  pos.ep = -1; pos.hLo ^= ELo[8]; pos.hHi ^= EHi[8]; pos.hLo ^= SIDE_LO; pos.hHi ^= SIDE_HI; pos.half++;
  pos.sp++; pos.side ^= 1;
}
function unmakeNull(pos) { pos.sp--; pos.hn--; const sp = pos.sp; pos.side ^= 1; pos.ep = pos.uEp[sp]; pos.hLo = pos.uLo[sp]; pos.hHi = pos.uHi[sp]; pos.half = pos.uHalf[sp]; }

function evaluate(pos) { // z pohledu strany na tahu
  const ph = Math.min(24, pos.phase);
  const mg = pos.mg[0] - pos.mg[1], eg = pos.eg[0] - pos.eg[1];
  let s = (mg * ph + eg * (24 - ph)) / 24;
  if (pos.cnt[BISHOP] >= 2) s += 28; if (pos.cnt[BISHOP | 8] >= 2) s -= 28;
  s = pos.side === 0 ? s : -s;
  return (s | 0) + 8;
}

// ------------------------------------------------------------------ hledání
const TT_BITS = 20; const TT_SIZE = 1 << TT_BITS;
const ttHi = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE), ttScore = new Int16Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE), ttFlag = new Uint8Array(TT_SIZE);
const killers = new Int32Array(MAXPLY * 2); const history = new Int32Array(2 * 128 * 128);
const lists = []; for (let i = 0; i < MAXPLY + 8; i++) lists.push(new Int32Array(256));
const scores = []; for (let i = 0; i < MAXPLY + 8; i++) scores.push(new Int32Array(256));
let nodes = 0, stopAt = 0, stopped = false;

function moveScore(pos, m, ttm, ply) {
  if (m === ttm) return 2_000_000;
  const fl = mFlags(m);
  if (fl & 1) { const v = pos.b[mTo(m)] & 7; const a = pos.b[mFrom(m)] & 7; return 1_000_000 + (v || 1) * 16 - a + (mPromo(m) === QUEEN ? 800 : 0); }
  if (fl & 2) return 1_000_000 + 16 - 1;
  if (mPromo(m)) return 990_000 + mPromo(m);
  if (killers[ply * 2] === m) return 900_000; if (killers[ply * 2 + 1] === m) return 899_000;
  return history[(pos.side * 128 + mFrom(m)) * 128 + mTo(m)];
}
function orderPick(list, sc, n, i) { // výběrové řazení: nejlepší tah na pozici i
  let best = i; for (let j = i + 1; j < n; j++) if (sc[j] > sc[best]) best = j;
  if (best !== i) { const t = list[i]; list[i] = list[best]; list[best] = t; const s = sc[i]; sc[i] = sc[best]; sc[best] = s; }
}
function isRepetition(pos) {
  const lim = Math.max(0, pos.hn - pos.half);
  for (let i = pos.hn - 2; i >= lim; i -= 2) if (pos.histLo[i] === pos.hLo && pos.histHi[i] === pos.hHi) return true;
  return false;
}
function qsearch(pos, alpha, beta, ply) {
  if ((++nodes & 2047) === 0 && Date.now() > stopAt) stopped = true;
  if (stopped) return 0;
  const stand = evaluate(pos);
  if (ply >= MAXPLY - 2) return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  const list = lists[ply], sc = scores[ply];
  const n = genMoves(pos, list, true);
  for (let i = 0; i < n; i++) sc[i] = moveScore(pos, list[i], 0, ply);
  for (let i = 0; i < n; i++) {
    orderPick(list, sc, n, i);
    const m = list[i];
    if (!(mPromo(m)) && stand + VAL[pos.b[mTo(m)] & 7] + 200 < alpha) continue; // delta pruning
    if (!make(pos, m)) continue;
    const v = -qsearch(pos, -beta, -alpha, ply + 1);
    unmake(pos, m);
    if (stopped) return 0;
    if (v > alpha) { alpha = v; if (alpha >= beta) return alpha; }
  }
  return alpha;
}
function negamax(pos, depth, alpha, beta, ply, nullOk) {
  if ((++nodes & 2047) === 0 && Date.now() > stopAt) stopped = true;
  if (stopped) return 0;
  const inCheck = inCheckP(pos);
  if (ply > 0) {
    if (pos.half >= 100 || isRepetition(pos)) return 0;
    if (ply >= MAXPLY - 2) return evaluate(pos);
  }
  if (inCheck) depth++;
  if (depth <= 0) return qsearch(pos, alpha, beta, ply);
  const origAlpha = alpha;
  const idx = pos.hLo & (TT_SIZE - 1);
  let ttm = 0;
  if (ttHi[idx] === pos.hHi && ttFlag[idx]) {
    ttm = ttMove[idx];
    if (ply > 0 && ttDepth[idx] >= depth) {
      let s = ttScore[idx]; if (s > MATE - 200) s -= ply; else if (s < -MATE + 200) s += ply;
      const f = ttFlag[idx];
      if (f === 1) return s; if (f === 2 && s >= beta) return s; if (f === 3 && s <= alpha) return s;
    }
  }
  const pv = beta - alpha > 1;
  // null move
  if (nullOk && !pv && !inCheck && depth >= 3 && pos.phase >= 4 && evaluate(pos) >= beta) {
    makeNull(pos);
    const v = -negamax(pos, depth - 3, -beta, -beta + 1, ply + 1, false);
    unmakeNull(pos);
    if (stopped) return 0;
    if (v >= beta) return v >= MATE - 200 ? beta : v;
  }
  const list = lists[ply], sc = scores[ply];
  const n = genMoves(pos, list, false);
  for (let i = 0; i < n; i++) sc[i] = moveScore(pos, list[i], ttm, ply);
  let best = -INF, bestM = 0, legal = 0;
  for (let i = 0; i < n; i++) {
    orderPick(list, sc, n, i);
    const m = list[i];
    if (!make(pos, m)) continue;
    legal++;
    const quiet = !(mFlags(m) & 3) && !mPromo(m);
    let v;
    if (legal === 1) v = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
    else {
      let red = 0;
      if (depth >= 3 && legal > 3 && quiet && !inCheck) red = legal > 8 ? 2 : 1;
      v = -negamax(pos, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
      if (v > alpha && red) v = -negamax(pos, depth - 1, -alpha - 1, -alpha, ply + 1, true);
      if (v > alpha && v < beta) v = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
    }
    unmake(pos, m);
    if (stopped) return 0;
    if (v > best) { best = v; bestM = m; }
    if (v > alpha) {
      alpha = v;
      if (alpha >= beta) {
        if (quiet) { if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; } history[(pos.side * 128 + mFrom(m)) * 128 + mTo(m)] += depth * depth; }
        break;
      }
    }
  }
  if (!legal) return inCheck ? -MATE + ply : 0;
  let flag = best <= origAlpha ? 3 : best >= beta ? 2 : 1;
  let s = best; if (s > MATE - 200) s += ply; else if (s < -MATE + 200) s -= ply;
  if (ttFlag[idx] === 0 || ttHi[idx] === pos.hHi || ttDepth[idx] <= depth) { ttHi[idx] = pos.hHi; ttMove[idx] = bestM; ttScore[idx] = s; ttDepth[idx] = depth; ttFlag[idx] = flag; }
  return best;
}

function rootMoves(pos) {
  const list = new Int32Array(256); const n = genMoves(pos, list, false); const out = [];
  for (let i = 0; i < n; i++) if (make(pos, list[i])) { unmake(pos, list[i]); out.push(list[i]); }
  return out;
}
const toStd = (sq88) => (sq88 >> 4) * 8 + (sq88 & 7);
const PROMO_CH = { [KNIGHT]: 'n', [BISHOP]: 'b', [ROOK]: 'r', [QUEEN]: 'q' };
const out = (m, score, depth) => ({ from: toStd(mFrom(m)), to: toStd(mTo(m)), promo: mPromo(m) ? PROMO_CH[mPromo(m)] : null, score, depth });

/** Úrovně: depth = hloubka, ms = časový limit, noise = náhodná chyba hodnocení v setinách pěšce, rnd = šance na zcela náhodný tah */
export const LEVELS = {
  1: { depth: 1, ms: 200, noise: 450, rnd: 0.22 },
  2: { depth: 2, ms: 400, noise: 220, rnd: 0.06 },
  3: { depth: 3, ms: 700, noise: 90, rnd: 0 },
  4: { depth: 7, ms: 900, noise: 0, rnd: 0 },
  5: { depth: 16, ms: 2600, noise: 0, rnd: 0 },
};

/**
 * Najde tah. opts: { fen, history: [fen,…] (předchozí pozice partie), level 1–5, ms? (přepíše limit) }.
 * Vrací {from,to,promo,score,depth} nebo null, když není tah.
 */
export function bestMove(opts) {
  const lv = LEVELS[opts.level] || LEVELS[3];
  const pos = posFromFen(opts.fen);
  for (const f of opts.history || []) { const p = posFromFen(f); pos.histLo[pos.hn] = p.hLo; pos.histHi[pos.hn] = p.hHi; pos.hn++; }
  const moves = rootMoves(pos);
  if (!moves.length) return null;
  if (moves.length === 1) return out(moves[0], 0, 0);
  if (lv.rnd && Math.random() < lv.rnd) return out(moves[Math.floor(Math.random() * moves.length)], 0, 0);
  killers.fill(0); history.fill(0);
  const ms = opts.ms || lv.ms;
  stopAt = Date.now() + ms; stopped = false; nodes = 0;
  if (lv.noise) { // slabší úrovně: každý tah zvlášť na pevné hloubce + šum
    const scored = [];
    for (const m of moves) {
      make(pos, m);
      let v = -negamax(pos, lv.depth - 1, -INF, INF, 1, false);
      unmake(pos, m);
      if (stopped) { stopped = false; stopAt = Date.now() + ms; }
      scored.push([m, v + (Math.random() * 2 - 1) * lv.noise]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    return out(scored[0][0], Math.round(scored[0][1]), lv.depth);
  }
  let bestM = moves[0], bestV = 0, doneDepth = 0;
  for (let d = 1; d <= lv.depth; d++) {
    // kořen: tahy seřazené podle předchozí iterace
    let alpha = -INF; let curBest = 0; let curV = -INF;
    const order = moves.slice().sort((a, b) => (a === bestM ? -1 : b === bestM ? 1 : 0));
    let first = true;
    for (const m of order) {
      make(pos, m);
      let v;
      if (first) v = -negamax(pos, d - 1, -INF, -alpha, 1, true);
      else { v = -negamax(pos, d - 1, -alpha - 1, -alpha, 1, true); if (v > alpha && !stopped) v = -negamax(pos, d - 1, -INF, -alpha, 1, true); }
      unmake(pos, m);
      if (stopped) break;
      first = false;
      if (v > curV) { curV = v; curBest = m; }
      if (v > alpha) alpha = v;
    }
    if (stopped) { if (curBest && d > 1 && curV > bestV - 150) { bestM = curBest; bestV = curV; } break; }
    bestM = curBest; bestV = curV; doneDepth = d;
    if (Math.abs(bestV) > MATE - 100 && d >= 4) break;
    if (Date.now() > stopAt - ms * 0.55 && d >= 4) break; // další iterace by se už nestihla
  }
  return out(bestM, bestV, doneDepth);
}

/** Statické hodnocení pozice z pohledu bílého v setinách pěšce (pro rozhodování o remíze). */
export function staticEval(fen) { const pos = posFromFen(fen); const v = evaluate(pos) - 8; return pos.side === 0 ? v : -v; }

export function perft(fen, depth) {
  const pos = posFromFen(fen);
  const rec = (d) => {
    const list = new Int32Array(256); const n = genMoves(pos, list, false);
    let c = 0;
    for (let i = 0; i < n; i++) { if (!make(pos, list[i])) continue; c += d === 1 ? 1 : rec(d - 1); unmake(pos, list[i]); }
    return c;
  };
  return depth === 0 ? 1 : rec(depth);
}
/** Pro testy: všechny legální tahy ve formátu from-to-promo (pole jako engine.js). */
export function legalList(fen) { const pos = posFromFen(fen); return rootMoves(pos).map((m) => { const o = out(m, 0, 0); return `${o.from}-${o.to}${o.promo || ''}`; }); }
