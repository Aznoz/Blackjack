'use strict';
/**
 * Fyzika air hockeye (čistá, bez sítě – dá se testovat).
 * Stůl je 1000 × 560 jednotek, branky jsou vlevo (x = 0) a vpravo (x = W). Hráč 0 hraje vlevo, hráč 1 vpravo.
 */
const W = 1000;
const H = 560;
const GOAL = 220;          // šířka otvoru branky
const PUCK_R = 22;
const MALLET_R = 40;
const DT = 1 / 60;         // jeden tick simulace
const SUB = 4;             // podkroky na tick (proti "prostřelení" zdí a pálky)
const MAX_PUCK_SPEED = 1800;
const MAX_MALLET_SPEED = 5000; // nejvyšší rychlost pálky (anti-teleport)
const WALL_E = 0.92;       // odrazivost zdí
const MALLET_E = 0.85;     // odrazivost pálky
const DAMPING = 0.35;      // zpomalení puku za sekundu (vzduchový stůl = skoro žádné)

const GY1 = (H - GOAL) / 2;
const GY2 = (H + GOAL) / 2;
// zdi jako úsečky; konce úseček u branek fungují jako tyčky
const SEGMENTS = [
  [0, 0, W, 0], [0, H, W, H],
  [0, 0, 0, GY1], [0, GY2, 0, H],
  [W, 0, W, GY1], [W, GY2, W, H],
];

const EV_WALL = 1, EV_HIT = 2, EV_GOAL = 4;

class Rink {
  constructor() {
    this.puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    this.mallets = [
      { x: 110, y: H / 2, vx: 0, vy: 0, tx: 110, ty: H / 2 },
      { x: W - 110, y: H / 2, vx: 0, vy: 0, tx: W - 110, ty: H / 2 },
    ];
    this.goal = null; // index hráče, který právě dal gól
  }

  /** Nové podání: puk stojí na straně hráče `side` (ten podává), pálky na výchozích místech. */
  reset(side) {
    this.goal = null;
    this.resetPuck(side);
    this.mallets[0] = { x: 110, y: H / 2, vx: 0, vy: 0, tx: 110, ty: H / 2 };
    this.mallets[1] = { x: W - 110, y: H / 2, vx: 0, vy: 0, tx: W - 110, ty: H / 2 };
  }

  /** Puk stojí těsně u středové čáry na straně hráče, který podává (dosáhne na něj jen on). */
  resetPuck(side) {
    this.goal = null;
    this.puck = { x: side === 0 ? W / 2 - 30 : W / 2 + 30, y: H / 2, vx: 0, vy: 0 };
  }

  /** Kam chce hráč pálku dostat (kurzor myši). Omezení na vlastní polovinu hlídá step(). */
  setTarget(side, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const m = this.mallets[side];
    m.tx = x;
    m.ty = y;
  }

  static clampMallet(side, x, y) {
    const lo = side === 0 ? MALLET_R : W / 2 + MALLET_R;
    const hi = side === 0 ? W / 2 - MALLET_R : W - MALLET_R;
    return [Math.min(hi, Math.max(lo, x)), Math.min(H - MALLET_R, Math.max(MALLET_R, y))];
  }

  /** Posune pálky směrem k cíli (s limitem rychlosti). Vrací jejich pozice před a po pohybu. */
  moveMallets() {
    const moves = [];
    for (let i = 0; i < 2; i++) {
      const m = this.mallets[i];
      const [tx, ty] = Rink.clampMallet(i, m.tx, m.ty);
      let dx = tx - m.x;
      let dy = ty - m.y;
      const d = Math.hypot(dx, dy);
      const max = MAX_MALLET_SPEED * DT;
      if (d > max) { dx *= max / d; dy *= max / d; }
      moves.push({ x0: m.x, y0: m.y, dx, dy });
      m.vx = dx / DT;
      m.vy = dy / DT;
    }
    return moves;
  }

  /**
   * Jeden tick. Když `puckLive` je false, hýbou se jen pálky (odpočet před zápasem, pauza po gólu).
   * Vrací bitovou masku událostí (EV_WALL, EV_HIT, EV_GOAL) pro zvuky a konec hry.
   */
  step(puckLive = true) {
    const moves = this.moveMallets();
    let ev = 0;
    const p = this.puck;
    const h = DT / SUB;
    for (let k = 1; k <= SUB; k++) {
      for (let i = 0; i < 2; i++) {
        const m = this.mallets[i];
        m.x = moves[i].x0 + (moves[i].dx * k) / SUB;
        m.y = moves[i].y0 + (moves[i].dy * k) / SUB;
      }
      if (!puckLive) continue;
      p.x += p.vx * h;
      p.y += p.vy * h;
      // zdi a tyčky branek
      for (const [x1, y1, x2, y2] of SEGMENTS) {
        if (this._segment(p, x1, y1, x2, y2)) ev |= EV_WALL;
      }
      // pálky
      for (let i = 0; i < 2; i++) {
        if (this._mallet(p, this.mallets[i])) ev |= EV_HIT;
      }
      // pálka přimáčkla puk ke zdi: ještě jednou zdi, ať puk neuvízne uvnitř
      for (const [x1, y1, x2, y2] of SEGMENTS) this._segment(p, x1, y1, x2, y2);
      const damp = Math.exp(-DAMPING * h);
      p.vx *= damp;
      p.vy *= damp;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > MAX_PUCK_SPEED) { p.vx *= MAX_PUCK_SPEED / sp; p.vy *= MAX_PUCK_SPEED / sp; }
      // gól: puk celý přejel čáru
      if (p.x < -PUCK_R) { this.goal = 1; ev |= EV_GOAL; break; }
      if (p.x > W + PUCK_R) { this.goal = 0; ev |= EV_GOAL; break; }
    }
    return ev;
  }

  _segment(p, x1, y1, x2, y2) {
    const sx = x2 - x1;
    const sy = y2 - y1;
    const len2 = sx * sx + sy * sy;
    let t = ((p.x - x1) * sx + (p.y - y1) * sy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + sx * t;
    const cy = y1 + sy * t;
    let nx = p.x - cx;
    let ny = p.y - cy;
    let d = Math.hypot(nx, ny);
    if (d >= PUCK_R) return false;
    if (d < 1e-6) { nx = W / 2 - p.x; ny = H / 2 - p.y; d = Math.hypot(nx, ny) || 1; }
    nx /= d;
    ny /= d;
    p.x = cx + nx * PUCK_R;
    p.y = cy + ny * PUCK_R;
    const vn = p.vx * nx + p.vy * ny;
    if (vn < 0) {
      p.vx -= (1 + WALL_E) * vn * nx;
      p.vy -= (1 + WALL_E) * vn * ny;
      return true;
    }
    return false;
  }

  /** Puk vytlačený pálkou ke zdi nesmí skončit za zdí: posune se podél zdi a zůstane dotýkat pálky. */
  _contain(p, m, R) {
    const inMouth = () => p.y >= GY1 && p.y <= GY2;
    if (p.y < PUCK_R || p.y > H - PUCK_R) {
      const side = p.x >= m.x ? 1 : -1;
      p.y = Math.min(H - PUCK_R, Math.max(PUCK_R, p.y));
      const dy = p.y - m.y;
      p.x = m.x + side * Math.sqrt(Math.max(0, R * R - dy * dy));
    }
    if ((p.x < PUCK_R || p.x > W - PUCK_R) && !inMouth()) {
      const side = p.y >= m.y ? 1 : -1;
      p.x = Math.min(W - PUCK_R, Math.max(PUCK_R, p.x));
      const dx = p.x - m.x;
      p.y = Math.min(H - PUCK_R, Math.max(PUCK_R, m.y + side * Math.sqrt(Math.max(0, R * R - dx * dx))));
    }
  }

  _mallet(p, m) {
    let nx = p.x - m.x;
    let ny = p.y - m.y;
    let d = Math.hypot(nx, ny);
    const R = PUCK_R + MALLET_R;
    if (d >= R) return false;
    if (d < 1e-6) { nx = p.x < W / 2 ? 1 : -1; ny = 0; d = 1; }
    nx /= d;
    ny /= d;
    p.x = m.x + nx * R;
    p.y = m.y + ny * R;
    this._contain(p, m, R);
    const vn = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
    if (vn < 0) {
      p.vx -= (1 + MALLET_E) * vn * nx;
      p.vy -= (1 + MALLET_E) * vn * ny;
      return true;
    }
    return false;
  }
}

module.exports = {
  Rink, W, H, GOAL, GY1, GY2, PUCK_R, MALLET_R, DT, SUB, MAX_PUCK_SPEED, MAX_MALLET_SPEED, EV_WALL, EV_HIT, EV_GOAL,
};
