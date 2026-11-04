// TANKOVÉ SOUBOJE: sdílená fyzika (server i prohlížeč). Tenhle soubor je stejný v tanks/ (server) a public/tanks/ (klient),
// aby kráter a dráha střely vyšly na obou stranách přesně stejně. Test (test-tanks.mjs) hlídá, že jsou identické.
// Souřadnice: x doprava, y dolů, svět je W × H. Terén je výška povrchu h[x] (větší y = níž), kráter jen ubírá zem.

export const W = 1600, H = 800;
export const GRAV = 520;          // px/s²
export const VSCALE = 8.8;        // síla 0–100 → počáteční rychlost (px/s)
export const WIND_K = 7;          // vítr (−8…8) → zrychlení ve vodorovném směru (px/s²)
export const DT = 1 / 120;        // krok simulace (s); do dráhy se ukládá každý druhý krok (60 bodů za vteřinu)
export const TANK_R = 30;         // poloměr zásahu tanku
export const TANK_HY = 18;        // střed tanku je takhle vysoko nad zemí
export const MAX_HP = 100;
export const FUEL_MAX = 190;      // kolik pixelů smí tank za tah ujet
export const DRIVE_SPEED = 72;    // px/s
export const SLOPE_MAX = 1.7;     // nejstrmější svah, který tank vyjede (změna výšky / vodorovná vzdálenost)
export const STEP_UP = 26;        // drobný schod / hrana, kterou tank přejede vždy (px na jeden krok jízdy)
export const MIN_GAP = 70;        // nejmenší vzdálenost mezi tanky
export const EDGE = 46;           // tank nezajede blíž k okraji

/** Zbraně. `price`/`pack`/`lvl` = obchod (cena za balíček kusů, od které úrovně), `max` = nejvíc kusů, které smíš mít u sebe (koupené + z beden v zápase); `std` je neomezená. */
export const WEAPONS = {
  std:     { id: 'std',     name: 'Granát',            desc: 'Základní náboj, neomezený.',                                       r: 38,  dmg: 30, col: '#ffd23f', inf: true },
  big:     { id: 'big',     name: 'Těžká bomba',       desc: 'Velký kráter a velká rána.',                                       r: 68,  dmg: 48, col: '#ff7a3d', price: 240,  pack: 3, max: 9, lvl: 1, fuelPen: 0.4 },
  triple:  { id: 'triple',  name: 'Trojitá salva',     desc: 'Tři střely vedle sebe, hodí se na vzdálené cíle.',                  r: 34,  dmg: 24, col: '#5ee1ff', price: 240,  pack: 3, max: 9, lvl: 2, shots: 3, spread: 6, fuelPen: 0.2 },
  bounce:  { id: 'bounce',  name: 'Odrážeč',           desc: 'Dvakrát se odrazí od země, než vybuchne.',                         r: 44,  dmg: 34, col: '#7dff9a', price: 300,  pack: 3, max: 6, lvl: 3, bounces: 2, selfDmg: 3 },
  roller:  { id: 'roller',  name: 'Kutálející granát', desc: 'Po dopadu se kutálí po zemi (z kopce rychleji) a vybuchne přesně 5 s po výstřelu. Zastaví se u tanku.', r: 56, dmg: 42, col: '#9be15d', price: 340, pack: 3, max: 6, lvl: 4, roll: true, fuse: 5, selfDmg: 6, fuelPen: 0.5 },
  laser:   { id: 'laser',   name: 'Laser',             desc: 'Střílí úplně rovně skrz kopce i překážky (síla se ignoruje) a prvnímu tanku v cestě vždy dá pevných 20 životů. Terén neničí.', r: 0, dmg: 20, col: '#ff4de1', price: 420, pack: 3, max: 6, lvl: 7, laser: true, fuelPen: 0.3 },
  cluster: { id: 'cluster', name: 'Kazeta',            desc: 'Ve vrcholu dráhy se rozpadne na 5 menších bomb.',                  r: 0,   dmg: 0,  col: '#d58cff', price: 360,  pack: 3, max: 6, lvl: 4, split: { n: 5, r: 30, dmg: 20 }, selfDmg: 4 },
  sniper:  { id: 'sniper',  name: 'Odstřelovač',       desc: 'Rychlá, skoro přímá střela, vítr ji sotva ovlivní. Malý kráter, silný zásah.', r: 24, dmg: 58, col: '#f2f2f2', price: 320, pack: 3, max: 6, lvl: 5, vmul: 1.25, gmul: 0.55, wmul: 0.3, fuelPen: 0.5 },
  nuke:    { id: 'nuke',    name: 'Atomovka',          desc: 'Obrovský výbuch. Dej si pozor, ať nezasáhne i tebe.',              r: 120, dmg: 80, col: '#ff3b3b', price: 900,  pack: 1, max: 1, lvl: 6, selfDmg: 10, fuelPen: 0.5, cd: 1 },
  five:    { id: 'five',    name: 'Pětisalva',         desc: 'Pět střel vedle sebe, skoro vždycky něco trefí.',                  r: 30,  dmg: 20, col: '#4fd8ff', price: 480,  pack: 3, max: 6, lvl: 8, shots: 5, spread: 4.5, selfDmg: 5 },
  mega:    { id: 'mega',    name: 'Mega bomba',        desc: 'Obří kráter a těžká rána.',                                        r: 95,  dmg: 62, col: '#ff5a2a', price: 560,  pack: 2, max: 4, lvl: 10, selfDmg: 6, fuelPen: 0.3 },
  napalm:  { id: 'napalm',  name: 'Napalm',            desc: 'Po dopadu se rozstříkne na 8 malých výbuchů kolem.',               r: 0,   dmg: 0,  col: '#ff9a1f', price: 520,  pack: 3, max: 6, lvl: 12, split: { n: 8, r: 26, dmg: 15, impact: true }, selfDmg: 5, fuelPen: 0.2 },
  airstrike: { id: 'airstrike', name: 'Letecký nálet', desc: 'Na místě dopadu zavolá déšť 6 bomb z nebe.',                      r: 0,   dmg: 0,  col: '#9fb4ff', price: 720,  pack: 2, max: 2, lvl: 16, split: { n: 6, r: 36, dmg: 26, impact: true, rain: true, gap: 56 }, fuelPen: 0.4, cd: 1 },
  bounce4: { id: 'bounce4', name: 'Super odrážeč',     desc: 'Čtyřikrát se odrazí, než vybuchne.',                               r: 54,  dmg: 40, col: '#5dffb0', price: 640,  pack: 3, max: 6, lvl: 19, bounces: 4, selfDmg: 6 },
  megacluster: { id: 'megacluster', name: 'Mega kazeta', desc: 'Ve vrcholu se rozpadne na 9 bomb.',                              r: 0,   dmg: 0,  col: '#e6a0ff', price: 900,  pack: 3, max: 6, lvl: 22, split: { n: 9, r: 38, dmg: 24 }, selfDmg: 8, fuelPen: 0.3 },
  doom:    { id: 'doom',    name: 'Soudný den',        desc: 'Gigantický výbuch, který smete skoro všechno. Opatrně.',           r: 160, dmg: 100, col: '#ff2a2a', price: 2200, pack: 1, max: 1, lvl: 26, selfDmg: 15, fuelPen: 0.7, cd: 1 },
  repair:  { id: 'repair',  name: 'Opravárenská sada', desc: 'Vyléčí 35 životů a ukončí tah. Nestřílí.',                         r: 0,   dmg: 0,  col: '#6cff6c', price: 200,  pack: 2, max: 4, lvl: 2,  util: 'heal', heal: 35, fuelPen: 0.3 },
  repair2: { id: 'repair2', name: 'Generální oprava',  desc: 'Vyléčí 70 životů a ukončí tah. Nestřílí.',                         r: 0,   dmg: 0,  col: '#3dff9a', price: 420,  pack: 2, max: 2, lvl: 14, util: 'heal', heal: 70, fuelPen: 0.5 },
};
/** Nevýhody zbraní (text pro hráče): vlastní ztráta životů při výstřelu, méně paliva v příštím tahu, nabíjení (zbraň nejde použít v dalších tazích). */
const CZ_LIFE = (n) => (n === 1 ? '1 život' : n >= 2 && n <= 4 ? n + ' životy' : n + ' životů');
export function consOf(w) {
  const out = [];
  if (w.selfDmg) out.push(`výstřel tě stojí ${CZ_LIFE(w.selfDmg)}`);
  if (w.fuelPen) out.push(`příští tah máš o ${Math.round(w.fuelPen * 100)} % míň paliva`);
  if (w.cd) out.push(w.cd === 1 ? 'další tah se zbraň nabíjí' : `další ${w.cd} tahy se zbraň nabíjí`);
  return out.length ? out.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.' : '';
}
export const ORDER = ['std', 'big', 'triple', 'bounce', 'roller', 'laser', 'cluster', 'sniper', 'nuke', 'five', 'mega', 'napalm', 'airstrike', 'bounce4', 'megacluster', 'doom', 'repair', 'repair2'];
export const COLORS = [
  { c: '#f5c518', name: 'Žlutá', lvl: 1 }, { c: '#4fd8ff', name: 'Azurová', lvl: 1 }, { c: '#6ee06a', name: 'Zelená', lvl: 1 },
  { c: '#ff5a52', name: 'Červená', lvl: 2 }, { c: '#b07cff', name: 'Fialová', lvl: 3 }, { c: '#ff7bc0', name: 'Růžová', lvl: 4 },
  { c: '#dfe6ee', name: 'Bílá', lvl: 5 }, { c: '#3a4150', name: 'Černá', lvl: 7 },
  { c: '#ff9a2e', name: 'Oranžová', lvl: 9 }, { c: '#2ee6c4', name: 'Tyrkysová', lvl: 11 }, { c: '#b6f23a', name: 'Limetková', lvl: 13 }, { c: '#a3202f', name: 'Bordó', lvl: 15 },
  { c: '#ffe066', name: 'Zlatá', lvl: 18 }, { c: '#aab4c4', name: 'Stříbrná', lvl: 21 }, { c: '#3b6bff', name: 'Královská modř', lvl: 24 }, { c: '#7affc8', name: 'Mátová', lvl: 30 },
];
export const MAX_LEVEL = 30;
/** XP potřebné k dosažení úrovně n (úroveň 1 = 0). */
export const xpFor = (n) => (n <= 1 ? 0 : 80 * (n - 1) * n / 2);
export const levelOf = (xp) => { let n = 1; while (n < MAX_LEVEL && xp >= xpFor(n + 1)) n++; return n; };

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const xi = (v) => (v < 0 ? 0 : v > W - 1 ? W - 1 : Math.round(v));
/** Na čem tank stojí: nejvyšší z bodů pod pásy (tank nezapadne do hrany). */
export const groundAt = (h, x) => Math.min(h[xi(x - 15)], h[xi(x)], h[xi(x + 15)]);
export const tiltAt = (h, x) => Math.atan2(h[xi(x + 17)] - h[xi(x - 17)], 34);
const smooth = (t) => t * t * (3 - 2 * t);

/** Náhodný terén: rovné okraje pro tanky a 1–3 kopce uprostřed. */
export function genTerrain(seed) {
  const r = mulberry32(seed >>> 0);
  const h = new Int16Array(W);
  const base = 560 + Math.round(r() * 30);
  const hills = []; const nh = 1 + Math.floor(r() * 3);
  for (let i = 0; i < nh; i++) hills.push({ c: 480 + r() * 640, w: 160 + r() * 220, a: 110 + r() * 170, flat: r() < 0.5 });
  const waves = [];
  for (let k = 1; k <= 4; k++) waves.push({ f: 1.5 + k * 1.9 + r() * 1.2, ph: r() * 6.283, a: 22 / k + r() * 6 });
  for (let x = 0; x < W; x++) {
    let y = base;
    for (const hl of hills) {
      const d = Math.abs(x - hl.c) / hl.w;
      const bump = hl.flat ? smooth(Math.max(0, Math.min(1, (1.6 - d) / 0.9))) : smooth(Math.max(0, 1 - d));
      y -= hl.a * bump * smooth(Math.max(0, Math.min(1, (Math.min(x, W - 1 - x) - 250) / 300)));   // kopce se k okrajům vytrácejí (tanky stojí na rovině)
    }
    // vlnky jen mimo okraje (tam jsou rovná stanoviště)
    const edge = Math.min(1, Math.max(0, (Math.min(x, W - 1 - x) - 170) / 160));
    for (const w of waves) y += Math.sin((x / W) * w.f * 6.283 + w.ph) * w.a * edge * 0.55;
    h[x] = Math.max(240, Math.min(H - 150, Math.round(y)));
  }
  return h;
}

/** Kráter: z každého sloupce ubere část, kterou zasahuje kruh (zem nad kruhem se propadne dolů), takže vznikne kulatá jáma bez svislých stěn. Hlídá shodu server/klient. */
export function applyCrater(h, cx, cy, r) {
  const x0 = Math.max(0, cx - r), x1 = Math.min(W - 1, cx + r);
  for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = Math.sqrt(r * r - dx * dx);
    const top = cy - dy, bottom = Math.ceil(cy + dy);
    const from = top > h[x] ? top : h[x];                                  // z kruhu se počítá jen to, co leží v zemi
    if (bottom > from) h[x] = Math.min(H - 26, h[x] + Math.ceil(bottom - from));   // zem nad kruhem se propadne o odebranou výšku
  }
}

export const checksum = (h) => { let s = 0; for (let x = 0; x < W; x += 3) s = (s * 31 + h[x]) | 0; return s; };

/** Kam se otáčí hlaveň a odkud střela vyletí. */
export const pivotOf = (h, x) => [x, groundAt(h, x) - 28];
export const muzzleOf = (h, x, ang) => { const a = ang * Math.PI / 180; return [x + Math.cos(a) * 40, groundAt(h, x) - 28 - Math.sin(a) * 40]; };

/** Paprsek laseru: jde rovně od ústí hlavně skrz terén a překážky a zastaví se na prvním cizím tanku nebo na okraji světa. Vrací body po 30 px, koncový bod a případně zasažený tank / bedny. */
export function laserRay(h, x, ang, tanks, si, crates) {
  const [px, py] = muzzleOf(h, x, ang); const a = ang * Math.PI / 180, dx = Math.cos(a), dy = -Math.sin(a);
  let xx = px, yy = py, len = 0, end = 'out', tank = -1; const pts = [[Math.round(px), Math.round(py)]]; const cr = [];
  for (;;) {
    xx += dx * 3; yy += dy * 3; len += 3;
    if (xx < -60 || xx > W + 60 || yy < -400 || yy > H + 100 || len > 2600) break;
    if (tanks) for (let i = 0; i < tanks.length; i++) { const tk = tanks[i]; if (i === si || tk.hp <= 0) continue; if (Math.hypot(xx - tk.x, yy - (groundAt(h, tk.x) - TANK_HY)) < TANK_R) { tank = i; end = 'tank'; break; } }
    if (tank >= 0) break;
    if (crates) for (const c of crates) if (!cr.includes(c.id) && Math.hypot(c.x - xx, h[xi(c.x)] - 12 - yy) < 18) cr.push(c.id);
    if (len % 30 === 0) pts.push([Math.round(xx), Math.round(yy)]);
  }
  pts.push([Math.round(xx), Math.round(yy)]);
  return { pts, x: Math.round(xx), y: Math.round(yy), end, tank, cr };
}

/** Náhled dráhy pro zaměřování (jen terén, bez zásahů tanků). Vrací body každých `every` kroků. */
export function previewPath(h, x, ang, pw, wind, count, every = 3, wid = 'std') {
  const wp = WEAPONS[wid] || WEAPONS.std, gm = wp.gmul || 1, wm = wp.wmul ?? 1;
  if (wp.laser) { const r = laserRay(h, x, ang, null, -1); const out = [[r.pts[0][0], r.pts[0][1]]]; for (let i = 1; i < r.pts.length && out.length <= count; i++) out.push(r.pts[i]); return out; }
  const a = ang * Math.PI / 180, v = pw * VSCALE * (wp.vmul || 1);
  let [px, py] = muzzleOf(h, x, ang);
  let vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
  const pts = [[px, py]];
  for (let i = 1; i <= count * every; i++) {
    vy += GRAV * gm * DT; vx += wind * wm * WIND_K * DT; px += vx * DT; py += vy * DT;
    if (px < -250 || px > W + 250 || py > H + 400) break;
    if (px >= 0 && px < W && py >= h[xi(px)]) { pts.push([px, h[xi(px)]]); break; }
    if (i % every === 0) pts.push([px, py]);
  }
  return pts;
}

/**
 * Simulace jednoho výstřelu.
 *  env = { h, tanks: [{ x, hp }], wind, crates?: [{ id, x }] }; `h` i hp tanků se mění (kromě dry), bedny zasažené výbuchem se odeberou.
 *  Výsledek: { paths: [{ t0, pts, end }], ex: [{ t, x, y, r, hits: [[i, dmg]], cr: [id], split? }], dur, dmg: [d0, d1] }.
 *  Časy jsou v ms od výstřelu; pts jsou celá čísla po 1/60 s od t0. `dry` = jen odhad pro bota (nic nemění, bez drah).
 */
export function simulate(env, si, ang, pw, wid, opts = {}) {
  const dry = !!opts.dry, rnd = opts.rnd || Math.random;
  const { h, tanks, wind } = env; const crates = env.crates || [];
  const wp = WEAPONS[wid];
  const me = tanks[si];
  if (wp.laser) { // laser: rovný paprsek skrz terén, pevných `dmg` životů prvnímu zasaženému tanku (nic neničí)
    const r = laserRay(h, me.x, ang, tanks, si, crates); const paths = [], ex = [], dmg = new Array(tanks.length).fill(0);
    if (!dry) paths.push({ t0: 0, pts: r.pts, end: 'laser' });
    if (r.end !== 'out') {
      const e = { t: 80, x: r.x, y: r.y, r: 0, hits: [], cr: dry ? [] : r.cr };
      if (r.tank >= 0) { e.hits.push([r.tank, wp.dmg]); dmg[r.tank] = wp.dmg; if (!dry) tanks[r.tank].hp = Math.max(0, tanks[r.tank].hp - wp.dmg); }
      if (!dry) { for (const id of r.cr) { const k = crates.findIndex((c) => c.id === id); if (k >= 0) crates.splice(k, 1); } }
      ex.push(e);
    }
    return { paths, ex, dur: ex.length ? 80 : 150, dmg };
  }
  const a0 = ang * Math.PI / 180, v = pw * VSCALE * (wp.vmul || 1);
  const [px, py] = muzzleOf(h, me.x, ang);
  const ns = wp.shots || 1; const offs = ns > 1 ? Array.from({ length: ns }, (_, i) => (i - (ns - 1) / 2) * wp.spread) : [0];
  let live = offs.map((o) => { const a = a0 + o * Math.PI / 180; return { x: px, y: py, vx: Math.cos(a) * v, vy: -Math.sin(a) * v, bounces: wp.bounces || 0, split: wp.split || null, roll: !!wp.roll, fuse: wp.fuse ? Math.round(wp.fuse * 120) : 0, r: wp.r, dmg: wp.dmg, gm: wp.gmul || 1, wm: wp.wmul ?? 1, t0: 0, age: 0, pts: dry ? null : [[Math.round(px), Math.round(py)]] }; });
  const paths = [], ex = [], dmg = new Array(tanks.length).fill(0);
  let tick = 0; const MAXT = 120 * 14;
  const tms = () => Math.round(tick * 1000 / 120);
  const finish = (p, end, x, y) => { if (!dry) { p.pts.push([Math.round(x), Math.round(y)]); paths.push({ t0: Math.round(p.t0 * 1000 / 120), pts: p.pts, end }); } };
  const explode = (p, x, y) => {
    x = Math.round(x); y = Math.round(y);
    const e = { t: tms(), x, y, r: p.r, hits: [], cr: [] };
    for (let i = 0; i < tanks.length; i++) {
      const tk = tanks[i]; if (tk.hp <= 0) continue;
      const d = Math.hypot(tk.x - x, groundAt(h, tk.x) - TANK_HY - y);
      const f = 1 - Math.max(0, d - 16) / (p.r + 12);
      if (f > 0 && p.dmg > 0) { const dm = Math.max(1, Math.round(p.dmg * f)); e.hits.push([i, dm]); dmg[i] += dm; if (!dry) tk.hp = Math.max(0, tk.hp - dm); }
    }
    if (!dry) {
      for (let k = crates.length - 1; k >= 0; k--) { const c = crates[k]; if (Math.hypot(c.x - x, h[xi(c.x)] - 12 - y) < p.r + 14) { e.cr.push(c.id); crates.splice(k, 1); } }
      applyCrater(h, x, y, p.r); ex.push(e);
    } else ex.push(e);
  };
  const doSplit = (p, next) => {
    finish(p, 'split', p.x, p.y); ex.push({ t: tms(), x: Math.round(p.x), y: Math.round(p.y), r: 0, hits: [], cr: [], split: true });
    const sp = p.split, n = sp.n; const gy = h[xi(p.x)];
    for (let k = 0; k < n; k++) {
      let c;
      if (sp.rain) { const gx = Math.max(6, Math.min(W - 7, p.x + (k - (n - 1) / 2) * sp.gap + (rnd() - 0.5) * 18)); c = { x: gx, y: -30 - rnd() * 90, vx: 0, vy: 150 }; }
      else if (sp.impact) { c = { x: p.x, y: Math.min(p.y, gy) - 6, vx: (k - (n - 1) / 2) * 62 + (rnd() - 0.5) * 30, vy: -(90 + rnd() * 160) }; }
      else { const o = (k - (n - 1) / 2) * 62 + (rnd() - 0.5) * 26; c = { x: p.x, y: p.y, vx: p.vx * 0.55 + o, vy: p.vy * 0.25 + (rnd() - 0.4) * 70 }; }
      next.push({ ...c, bounces: 0, split: null, r: sp.r, dmg: sp.dmg, gm: 1, wm: 1, t0: tick, age: 0, pts: dry ? null : [[Math.round(c.x), Math.round(c.y)]] });
    }
  };
  while (live.length && tick < MAXT) {
    tick++;
    const next = [];
    for (const p of live) {
      p.age++;
      if (p.fuse && tick >= p.fuse) { finish(p, 'boom', p.x, p.y); explode(p, p.x, p.y); continue; }   // zápalná šňůra: výbuch přesně po 5 s, ať je granát kdekoli
      if (p.rolling) { // kutálí se po zemi: z kopce zrychluje, tření ho brzdí, u tanku se zastaví
        if (!p.halt) {
          const gx = (h[xi(p.x + 3)] - h[xi(p.x - 3)]) / 6;
          p.s += gx * 330 * DT;
          const fr = 70 * DT; p.s = Math.abs(p.s) <= fr ? 0 : p.s - Math.sign(p.s) * fr;
          p.s = Math.max(-380, Math.min(380, p.s));
          p.x += p.s * DT;
          if (p.x < 4) { p.x = 4; p.s = -p.s * 0.4; } else if (p.x > W - 5) { p.x = W - 5; p.s = -p.s * 0.4; }
        }
        p.y = h[xi(p.x)] - 6;
        if (!dry && (tick - p.t0) % 2 === 0) p.pts.push([Math.round(p.x), Math.round(p.y)]);
        if (!p.halt) for (let i = 0; i < tanks.length; i++) { const tk = tanks[i]; if (tk.hp > 0 && Math.hypot(p.x - tk.x, p.y - (groundAt(h, tk.x) - TANK_HY)) < TANK_R - 4) { p.halt = true; p.s = 0; break; } }
        next.push(p); continue;
      }
      p.vy += GRAV * p.gm * DT; p.vx += wind * p.wm * WIND_K * DT; p.x += p.vx * DT; p.y += p.vy * DT;
      if (!dry && (tick - p.t0) % 2 === 0) p.pts.push([Math.round(p.x), Math.round(p.y)]);
      if (p.bounces > 0 && (p.x < 0 || p.x > W - 1)) { p.x = p.x < 0 ? 0 : W - 1; p.vx = -p.vx * 0.6; }   // odrážeč se odráží i od krajů světa
      if (p.x < -250 || p.x > W + 250 || p.y > H + 400) { finish(p, 'out', p.x, p.y); continue; }
      if (p.x >= 0 && p.x < W && p.y >= h[xi(p.x)]) {
        if (p.roll) { p.rolling = true; p.s = Math.max(-300, Math.min(300, p.vx * 0.5)); p.y = h[xi(p.x)] - 6; next.push(p); continue; }
        if (p.bounces > 0) { // odraz od svahu
          const gy = h[xi(p.x)], gx = (h[xi(p.x + 3)] - h[xi(p.x - 3)]) / 6, ln = Math.hypot(gx, 1), nx = gx / ln, ny = -1 / ln;
          const dot = p.vx * nx + p.vy * ny;
          if (dot < 0) { p.vx = (p.vx - 2 * dot * nx) * 0.62; p.vy = (p.vy - 2 * dot * ny) * 0.62; }
          p.y = gy - 3; p.bounces--; next.push(p); continue;
        }
        const gy = h[xi(p.x)];
        if (p.split) { doSplit(p, next); continue; }
        finish(p, 'boom', p.x, gy); explode(p, p.x, gy); continue;
      }
      let hit = false;
      for (let i = 0; i < tanks.length; i++) {
        const tk = tanks[i]; if (tk.hp <= 0) continue;
        if (i === si && p.age < 40) continue;
        if (p.tcool && tick < p.tcool) continue;                       // vlastní tank hned po výstřelu nepočítáme
        if (Math.hypot(p.x - tk.x, p.y - (groundAt(h, tk.x) - TANK_HY)) < TANK_R) { hit = true; break; }
      }
      if (hit && p.roll) { p.vx *= -0.25; p.vy = -Math.abs(p.vy) * 0.2 - 40; p.tcool = tick + 24; hit = false; }   // v letu se od tanku jen odrazí
      if (hit) { if (p.split) { doSplit(p, next); continue; } finish(p, 'boom', p.x, p.y); explode(p, p.x, p.y); continue; }
      if (p.split && !p.split.impact && p.vy > 0 && p.age > 14) { doSplit(p, next); continue; }   // kazeta se rozpadne ve vrcholu
      next.push(p);
    }
    live = next;
  }
  for (const p of live) finish(p, 'out', p.x, p.y);
  const dur = ex.length ? ex[ex.length - 1].t : tms();
  return { paths, ex, dur, dmg };
}
