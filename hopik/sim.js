// HOPÍK – průběh zápasu na serveru: fáze kola (výběr kusu → pokládání → odhalení → odpočet → běh → body), skládání trati a bodování.
// Pohyb lidských hráčů počítá jejich prohlížeč (stejná fyzika z phys.js) a server ho přijímá jako hlášení; boti běží přímo tady na serveru.
import * as K from './shared.js';
import * as P from './phys.js';
const { TPS } = K;
const S2T = (s) => Math.round(s * TPS);
export const LEN = { pick: S2T(K.TIME.pick), place: S2T(K.TIME.place), reveal: S2T(K.TIME.reveal), count: S2T(K.TIME.count), run: S2T(K.TIME.run), hurry: S2T(K.TIME.hurry), score: S2T(K.TIME.score) };

function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Nový zápas. players = [{ name, char, bot }]; stage = číslo stage. */
export function newGame(players, seed = 1, stage = 0) {
  const g = {
    stage: K.stageIdx(stage), rng: rng32(seed), phase: 'pick', t: 0, round: 0, over: null, ev: [],
    players: players.map((p, i) => ({ i, name: p.name, char: p.char, bot: p.bot || 0, pts: 0, left: false })),
    pieces: [], nextId: 1, W: null, offers: [], pick: [], piece: [], placed: [], ghost: [], run: null, roundRes: null, rt: 0, history: [],
  };
  startRound(g); return g;
}
const active = (g) => g.players.filter((p) => !p.left);
const pickWeighted = (g, ids, ex) => { const c = ids.filter((id) => !ex.includes(id)); let r = g.rng() * c.reduce((a, id) => a + K.PIECES[id].w, 0); for (const id of c) { if ((r -= K.PIECES[id].w) < 0) return id; } return c[c.length - 1]; };
function makeOffers(g) {
  const n = K.clamp(active(g).length + 2, 4, 6), out = [];
  const solid = K.PIECE_IDS.filter((id) => K.PIECES[id].kind !== 'hazard'), haz = K.PIECE_IDS.filter((id) => K.PIECES[id].kind === 'hazard');
  out.push(pickWeighted(g, solid, out)); out.push(pickWeighted(g, haz, out));
  while (out.length < n) out.push(pickWeighted(g, K.PIECE_IDS, out));
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(g.rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out.map((type) => ({ type, by: -1 }));
}
function setPhase(g, ph) { g.phase = ph; g.t = 0; g.ev.push(['ph', ph]); }
export function startRound(g) {
  g.round++; g.roundRes = null; g.W = P.buildWorld(g.stage, g.pieces);
  g.offers = makeOffers(g); g.pick = g.players.map(() => -1); g.piece = g.players.map(() => null); g.placed = g.players.map(() => false);
  g.ghost = g.players.map(() => ({ x: 14, y: 8, r: 0 }));
  g.players.forEach((p, i) => { if (p.left) g.pick[i] = -2; });
  setPhase(g, 'pick');
}

// ------------------------------------------------------------------ výběr kusu
export function pickPiece(g, i, k) {
  if (g.phase !== 'pick' || g.players[i].left || g.pick[i] !== -1) return false;
  const o = g.offers[k]; if (!o || o.by >= 0) return false;
  o.by = i; g.pick[i] = k; g.piece[i] = o.type; g.ev.push(['pk', i, k]);
  if (g.pick.every((v) => v !== -1)) endPick(g);
  return true;
}
function endPick(g) {
  const free = g.offers.filter((o) => o.by < 0);
  g.players.forEach((p, i) => { if (g.pick[i] !== -1) return; const o = free.splice(Math.floor(g.rng() * free.length), 1)[0]; if (o) { o.by = i; g.pick[i] = g.offers.indexOf(o); g.piece[i] = o.type; } });
  setPhase(g, 'place');
  g.players.forEach((p, i) => { g.placed[i] = !!p.left || !g.piece[i]; });
}

// ------------------------------------------------------------------ pokládání
export function setGhost(g, i, x, y, r) { if (g.phase !== 'place' || g.players[i].left || g.placed[i]) return; g.ghost[i] = { x: Math.round(x) | 0, y: Math.round(y) | 0, r: ((r | 0) % 4 + 4) % 4 }; }
export function placePiece(g, i, x, y, r) {
  if (g.phase !== 'place' || g.placed[i] || g.players[i].left) return 'no';
  x = Math.round(x); y = Math.round(y); r = ((Math.round(r) % 4) + 4) % 4; const type = g.piece[i];
  if (!type || !Number.isFinite(x) || !Number.isFinite(y)) return 'no';
  if (!P.canPlace(g.W, type, r, x, y)) return 'invalid';
  const pc = { id: g.nextId++, type, r, x, y, owner: i, round: g.round }; g.pieces.push(pc); P.addPlaced(g.W, pc); g.placed[i] = true; g.ev.push(['pl', i, pc]);
  if (g.placed.every(Boolean)) endPlace(g);
  return 'ok';
}
/** Hráč (bot) nemá kam kus položit: kus propadne. */
export function skipPlace(g, i) { if (g.phase !== 'place' || g.placed[i]) return; g.placed[i] = true; if (g.placed.every(Boolean)) endPlace(g); }
function autoPlace(g, i) {
  const type = g.piece[i], gh = g.ghost[i]; if (!type) { g.placed[i] = true; return; }
  if (placePiece(g, i, gh.x, gh.y, gh.r) === 'ok') return;
  for (let k = 0; k < 300; k++) { const r = Math.floor(g.rng() * 4); if (placePiece(g, i, Math.floor(g.rng() * K.COLS), Math.floor(g.rng() * K.ROWS), r) === 'ok') return; }
  g.placed[i] = true;   // není kam: kus propadne
}
function endPlace(g) {
  if (g.phase !== 'place') return;
  g.players.forEach((p, i) => { if (!g.placed[i]) g.placed[i] = true; });
  setPhase(g, 'reveal');
}

// ------------------------------------------------------------------ běh
function startCount(g) {
  const S = g.W.stage; const act = active(g); const n = act.length; let k = 0;
  g.run = { bodies: [], fin: [], dead: [], kills: [], deadAt: [], cause: [], first: -1, order: [], endAt: -1, hurryAt: -1 };
  g.players.forEach((p, i) => {
    const b = P.newBody(S.spawn[0] + (p.left ? 0 : (k - (n - 1) / 2) * 0.4), S.spawn[1] - P.PH / 2 - 0.01); if (!p.left) k++;
    g.run.bodies.push(b); g.run.fin.push(-1); g.run.dead.push(!!p.left); g.run.kills.push(0); g.run.deadAt.push(-1); g.run.cause.push(0);
  });
  g.inp = g.players.map(() => 0); g.rt = -LEN.count; for (const b of g.run.bodies) b.seen = g.rt; g.W.noFx = false;
  g.W.onCrumble = (gid, tick) => g.ev.push(['cr', gid, tick]);
  setPhase(g, 'count');
}
/** Hlášení pohybu lidského hráče z jeho prohlížeče (poloha, rychlost, příznaky). */
export function report(g, i, r) {
  if (g.phase !== 'run' && g.phase !== 'count') return;
  const b = g.run && g.run.bodies[i], p = g.players[i]; if (!b || p.bot || g.run.dead[i] || g.run.fin[i] >= 0) return;
  if (g.phase === 'count') return;
  const f = (v) => Number.isFinite(v) ? v : null;
  const x = f(r.x), y = f(r.y); if (x === null || y === null) return;
  const lim = 2.5 + 1.3 * Math.max(0, g.rt - (b.seen ?? g.rt));   // nejvýš ~1 políčko za tik (plus rezerva na zpoždění sítě)
  if (Math.abs(x - b.x) > lim || Math.abs(y - b.y) > lim) return;   // skok o půl hřiště je podvod nebo chyba
  b.x = K.clamp(x, P.PW / 2, K.COLS - P.PW / 2); b.y = K.clamp(y, -8, K.ROWS + 3); b.vx = K.clamp(f(r.vx) ?? 0, -40, 40); b.vy = K.clamp(f(r.vy) ?? 0, -40, 40);
  b.face = r.face < 0 ? -1 : 1; b.gr = !!r.gr; b.wall = r.wall | 0; b.stand = -1; b.seen = g.rt;
  b.k = K.clamp(f(r.k) ?? g.rt, g.rt - 15, g.rt + 3);   // tik, ve kterém hráč pohyb prožil (pasti se vyhodnocují v něm, ne v tiku přijetí zprávy)
}
function kill(g, i, cause) {
  const R = g.run; if (R.dead[i] || R.fin[i] >= 0) return;
  R.dead[i] = true; R.deadAt[i] = g.rt; R.cause[i] = cause;
  const o = cause > 0 ? cause - 1 : -1; if (o >= 0 && o !== i && g.players[o]) R.kills[o]++;
  const b = R.bodies[i]; g.ev.push(['d', i, +b.x.toFixed(2), +b.y.toFixed(2), cause]);
}
/** Hráč (prohlížeč) hlásí vlastní smrt; příčina = vlastník pasti + 1, -1 pád, 0 neznámá. */
export function clientDie(g, i, cause) { if (g.phase !== 'run' || !g.run) return; const c = Math.floor(cause); kill(g, i, Number.isFinite(c) && c >= -1 && c <= g.players.length ? c : 0); }
export function setInput(g, i, mask) { if (g.inp && Number.isInteger(mask) && mask >= 0 && mask < 16) g.inp[i] = mask; }
export function crumbleReport(g, gid, tick) { if (g.W && P.triggerCrumble(g.W, gid, tick)) g.ev.push(['cr', gid, tick]); }
export function forfeit(g, i) {
  const p = g.players[i]; if (!p || p.left) return; p.left = true;
  if (g.phase === 'pick' && g.pick[i] === -1) { g.pick[i] = -2; if (g.pick.every((v) => v !== -1)) endPick(g); }
  else if (g.phase === 'place' && !g.placed[i]) { g.placed[i] = true; if (g.placed.every(Boolean)) endPlace(g); }
  if (g.run && (g.phase === 'run' || g.phase === 'count')) { if (!g.run.dead[i] && g.run.fin[i] < 0) { g.run.dead[i] = true; g.run.deadAt[i] = g.rt; g.ev.push(['d', i, +g.run.bodies[i].x.toFixed(2), +g.run.bodies[i].y.toFixed(2), 0]); } }
}

function stepRun(g) {
  const R = g.run, W = g.W, tk = g.rt;
  P.stepWorld(W, tk);
  g.players.forEach((p, i) => {
    if (R.dead[i] || R.fin[i] >= 0) return; const b = R.bodies[i];
    if (p.bot) { const fx = []; P.stepBody(W, b, g.inp[i], tk, fx); for (const e of fx) if (e === 'j' || e === 'w' || e === 'b') g.ev.push(['j', i, e]); if (b.crush) return kill(g, i, 0); }
    const hz = P.hazardAt(W, b.x, b.y, p.bot || b.k === undefined ? tk : b.k, p.bot ? 0.08 : 0.2);
    if (hz) return kill(g, i, hz);
    if (P.inGoal(W, b)) { R.fin[i] = tk; R.order.push(i); if (R.first < 0) R.first = i; g.ev.push(['f', i, R.order.length]); if (R.hurryAt < 0) R.hurryAt = tk + LEN.hurry; }
  });
  const act = g.players.filter((p, i) => !p.left && !R.dead[i] && R.fin[i] < 0);
  if (!act.length && R.endAt < 0) R.endAt = tk + 25;
  if ((R.endAt >= 0 && tk >= R.endAt) || tk >= LEN.run || (R.hurryAt >= 0 && tk >= R.hurryAt)) endRun(g);
}
function endRun(g) {
  const R = g.run; const act = active(g); const fins = R.order.slice();
  const all = act.length >= 2 && act.every((p) => R.fin[p.i] >= 0);   // doběhli všichni = trať byla příliš snadná, za doběhnutí se body nedávají
  const rows = g.players.map((p, i) => ({ i, fin: R.fin[i] >= 0, order: R.order.indexOf(i) + 1, finish: 0, first: 0, solo: 0, kills: Math.min(K.PTS.killMax, R.kills[i] * K.PTS.kill), total: 0 }));
  if (!all) for (const i of fins) { rows[i].finish = K.PTS.finish; if (i === R.first) rows[i].first = K.PTS.first; if (fins.length === 1) rows[i].solo = K.PTS.solo; }
  for (const r of rows) { r.total = r.finish + r.first + r.solo + r.kills; g.players[r.i].pts += r.total; }
  g.roundRes = { n: g.round, rows, all, none: fins.length === 0 };
  g.history.push(g.roundRes);
  const top = Math.max(...g.players.map((p) => p.pts)); const leaders = g.players.filter((p) => p.pts === top);
  if ((top >= K.WIN_POINTS && leaders.length === 1) || g.round >= K.MAX_ROUNDS || active(g).filter((p) => !p.bot).length === 0) g.over = { winner: leaders.length === 1 ? leaders[0].i : -1, pts: g.players.map((p) => p.pts), rounds: g.round };
  setPhase(g, 'score');
}

/** Jeden tik hry (30× za sekundu). Události (g.ev) si server po každém tiku odebere. */
export function tick(g) {
  if (g.over && g.phase === 'score' && g.t >= LEN.score) { setPhase(g, 'over'); return; }
  if (g.phase === 'over') return;
  g.t++;
  switch (g.phase) {
    case 'pick': if (g.t >= LEN.pick) endPick(g); break;
    case 'place': if (g.t >= LEN.place) { g.players.forEach((p, i) => { if (!g.placed[i]) autoPlace(g, i); }); endPlace(g); } break;
    case 'reveal': if (g.t >= LEN.reveal) startCount(g); break;
    case 'count': g.rt++; P.stepWorld(g.W, g.rt); if (g.t >= LEN.count) { g.rt = 0; for (const b of g.run.bodies) b.seen = 0; setPhase(g, 'run'); g.ev.push(['go']); } break;
    case 'run': g.rt++; stepRun(g); break;
    case 'score': if (g.t >= LEN.score && !g.over) startRound(g); break;
    default:
  }
}
/** Snímek pohybu (jen při odpočtu a běhu). Příznaky: 1 živý, 2 v cíli, 4 na zemi. */
export function snap(g) {
  const R = g.run; if (!R) return null;
  return { t: 'snap', k: g.rt, ph: g.phase, p: R.bodies.map((b, i) => [+b.x.toFixed(2), +b.y.toFixed(2), +b.vx.toFixed(1), +b.vy.toFixed(1), (R.dead[i] ? 0 : 1) | (R.fin[i] >= 0 ? 2 : 0) | (b.gr ? 4 : 0) | (b.wall ? (b.wall > 0 ? 8 : 16) : 0), b.face]) };
}
export const clearEvents = (g) => { g.ev = []; };
export { K, P };
