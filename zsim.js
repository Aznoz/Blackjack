'use strict';
/**
 * Zombie Snatcher: sdílená fyzika (běží na serveru i v prohlížeči, musí to být STEJNÝ soubor).
 *
 * Otočná plošina (poloměr 1) se točí rovnoměrně, puky na ní leží. Po stisknutí STOP se pevné rameno (čepem u okraje)
 * rozmáchne přes plošinu a shrne puky k okraji; puk, jehož střed přejde přes okraj v místě výherní díry, spadne a vyhrává.
 *
 * Simulace se počítá v souřadnicích plošiny (puky jsou v klidu, rameno a díra se vůči nim otáčejí), proto je jediným vstupem
 *  - rozložení puků (souřadnice na plošině) a
 *  - úhel plošiny v okamžiku stisku STOP (celé číslo 0..PHI_STEPS-1).
 * Počítá se jen se sčítáním, násobením, dělením a odmocninou (žádné sin/cos/atan2), které jsou podle normy IEEE přesné a dávají
 * ve všech prohlížečích i v Node bitově shodné výsledky. Díky tomu server výsledek přepočítá a klient ho jen zobrazí.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ZSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const C = Object.freeze({
    RP: 1.0,                 // poloměr plošiny
    RC: 0.24,                // poloměr středového sloupu
    OMEGA: 0.6,              // úhlová rychlost plošiny (rad/s), proti směru hodinových ručiček
    DT: 1 / 120,             // krok simulace (s)
    PHI_STEPS: 720,          // počet úhlů plošiny, které lze poslat (0,5°)
    // rameno: čep (svět) a výchozí směr, délka, poloměr, rozmach
    PIVOT_X: 1.1, PIVOT_Y: 0.0,
    ARM_DX: 0.0, ARM_DY: 1.0,
    ARM_LEN: 1.42, ARM_R: 0.05,
    SWEEP: 1.95,             // rozmach ramene (rad, proti směru hodinových ručiček)
    SWEEP_T: 1.7,            // doba rozmachu (s)
    SETTLE_T: 0.9,           // doba, po kterou se po rozmachu ještě počítá (puky se uklidní)
    // výherní díra: směr (svět) a polovina úhlu (cos)
    HOLE_X: -0.9396926207859084, HOLE_Y: -0.3420201433256687, HOLE_COS: 0.9659258262890683, // 200°, ±15°
    DAMP: 0.88,              // útlum rychlosti puku za krok
  });
  const TOTAL_T = C.SWEEP_T + C.SETTLE_T;
  const STEPS = Math.round(TOTAL_T / C.DT);

  // otočení vektoru o malý úhel a (|a| < 0,1) polynomem, jen + a * (deterministické)
  function rot(v, a) {
    const a2 = a * a;
    const c = 1 - a2 / 2 + (a2 * a2) / 24, s = a - (a2 * a) / 6 + (a2 * a2 * a) / 120;
    const x = v.x * c - v.y * s, y = v.x * s + v.y * c;
    const n = Math.sqrt(x * x + y * y);
    v.x = x / n; v.y = y / n;
  }
  const STEP_ANGLE = (2 * Math.PI) / C.PHI_STEPS; // jen konstanta; do výpočtu vstupuje jen jako číslo
  const smooth = (u) => u * u * (3 - 2 * u);

  /** Úhel plošiny phiIdx (kroky po 0,5°) -> směry čepu, ramene a díry v souřadnicích plošiny. */
  function create(pucks, phiIdx) {
    const idx = Math.max(0, Math.min(C.PHI_STEPS - 1, Math.floor(phiIdx) || 0));
    const pv = { x: C.PIVOT_X, y: C.PIVOT_Y }, pn = Math.sqrt(pv.x * pv.x + pv.y * pv.y);
    const pl = { x: pv.x / pn, y: pv.y / pn }, dl = { x: C.ARM_DX, y: C.ARM_DY }, hl = { x: C.HOLE_X, y: C.HOLE_Y };
    for (let i = 0; i < idx; i++) { rot(pl, -STEP_ANGLE); rot(dl, -STEP_ANGLE); rot(hl, -STEP_ANGLE); } // plošina je pootočená o phi: svět -> plošina = otočení o -phi
    pl.x *= pn; pl.y *= pn;
    return {
      t: 0, step: 0, idx, pl, dl, hl, armAng: 0, // armAng: o kolik se rameno už otočilo (rad, jen pro zobrazení)
      pucks: pucks.map((p) => ({ id: p.id, r: p.r, x: p.x, y: p.y, vx: 0, vy: 0, alive: true })),
      fallen: [], done: false,
    };
  }

  function step(s) {
    if (s.done) return;
    const { DT, OMEGA } = C;
    // pohyb rámu: čep a díra obíhají plošinu rychlostí -OMEGA, rameno se navíc otáčí
    const u0 = Math.min(1, s.t / C.SWEEP_T), u1 = Math.min(1, (s.t + DT) / C.SWEEP_T);
    const da = C.SWEEP * (smooth(u1) - smooth(u0));
    rot(s.pl, -OMEGA * DT); // (směr čepu); délka se níž drží
    const pl = s.pl; const pn = Math.sqrt(pl.x * pl.x + pl.y * pl.y); const k = Math.sqrt(C.PIVOT_X * C.PIVOT_X + C.PIVOT_Y * C.PIVOT_Y) / pn; pl.x *= k; pl.y *= k;
    rot(s.hl, -OMEGA * DT);
    rot(s.dl, da - OMEGA * DT);
    s.armAng += da;
    const wa = da / DT - OMEGA; // úhlová rychlost ramene vůči plošině
    const pvx = OMEGA * pl.y, pvy = -OMEGA * pl.x; // rychlost čepu vůči plošině
    const dl = s.dl, hl = s.hl;
    const px = -dl.y, py = dl.x;
    const live = s.pucks.filter((p) => p.alive);

    for (const p of live) { p.vx *= C.DAMP; p.vy *= C.DAMP; p.x += p.vx * DT; p.y += p.vy * DT; }

    for (let it = 0; it < 3; it++) {
      // rameno (kapsle)
      for (const p of live) {
        if (!p.alive) continue;
        const rx = p.x - pl.x, ry = p.y - pl.y;
        let q = rx * dl.x + ry * dl.y; if (q < 0) q = 0; else if (q > C.ARM_LEN) q = C.ARM_LEN;
        const cx = pl.x + dl.x * q, cy = pl.y + dl.y * q;
        let dx = p.x - cx, dy = p.y - cy; const d2 = dx * dx + dy * dy, rr = p.r + C.ARM_R;
        if (d2 < rr * rr) {
          let d = Math.sqrt(d2); if (d < 1e-9) { dx = px; dy = py; d = 1; }
          const nx = dx / d, ny = dy / d;
          p.x = cx + nx * rr; p.y = cy + ny * rr;
          const vax = pvx + wa * q * px, vay = pvy + wa * q * py; // rychlost bodu ramene
          const vn = p.vx * nx + p.vy * ny, van = vax * nx + vay * ny;
          if (vn < van) { p.vx += (van - vn) * nx; p.vy += (van - vn) * ny; }
        }
      }
      // puky mezi sebou
      for (let i = 0; i < live.length; i++) {
        const a = live[i]; if (!a.alive) continue;
        for (let j = i + 1; j < live.length; j++) {
          const b = live[j]; if (!b.alive) continue;
          const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          let d = Math.sqrt(d2), nx, ny; if (d < 1e-9) { nx = 1; ny = 0; d = 0; } else { nx = dx / d; ny = dy / d; }
          const ov = (rr - d) / 2; a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
          const va = a.vx * nx + a.vy * ny, vb = b.vx * nx + b.vy * ny;
          if (va > vb) { const m = (va + vb) / 2; a.vx += (m - va) * nx; a.vy += (m - va) * ny; b.vx += (m - vb) * nx; b.vy += (m - vb) * ny; }
        }
      }
      // sloup a okraj
      for (const p of live) {
        if (!p.alive) continue;
        const d2 = p.x * p.x + p.y * p.y; const rho = Math.sqrt(d2);
        const rc = C.RC + p.r;
        if (rho < rc) { const f = rho < 1e-9 ? 0 : rc / rho; if (rho < 1e-9) { p.x = rc; p.y = 0; } else { p.x *= f; p.y *= f; } const nn = Math.sqrt(p.x * p.x + p.y * p.y); const nx = p.x / nn, ny = p.y / nn; const vn = p.vx * nx + p.vy * ny; if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; } continue; }
        if (rho > C.RP - p.r) {
          const inGap = p.x * hl.x + p.y * hl.y >= C.HOLE_COS * rho;
          if (inGap) { if (rho > C.RP) { p.alive = false; s.fallen.push({ id: p.id, t: s.t }); } }
          else { const f = (C.RP - p.r) / rho; p.x *= f; p.y *= f; const nx = p.x / (C.RP - p.r), ny = p.y / (C.RP - p.r); const vn = p.vx * nx + p.vy * ny; if (vn > 0) { p.vx -= vn * nx; p.vy -= vn * ny; } }
        }
      }
    }
    s.t += DT; s.step++;
    if (s.step >= STEPS) s.done = true;
  }

  /** Spočítá celý výstřel naráz (server). Vrací pole spadlých puků a zbylé puky v souřadnicích plošiny (po dojetí plošiny o úhel konce). */
  function run(pucks, phiIdx) {
    const s = create(pucks, phiIdx);
    while (!s.done) step(s);
    return s;
  }

  return { C, TOTAL_T, STEPS, create, step, run };
});
