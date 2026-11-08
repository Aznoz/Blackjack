// MINIGOLF – hřiště (sdílený soubor, stejný je i v public/golf/). Každé hřiště má 6 jamek; jamka je textová mapa (viz phys.js) + překážky.
// Souřadnice překážek jsou v políčkách (střed políčka je +0,5). `par` = ideální počet ran.
const TAU = Math.PI * 2;
/** Obdélníková mapa s okrajovou zdí; fn dostane malé API: fill(x0,z0,x1,z1,znak), put(x,z,znak), tee(x,z), cup(x,z) (souřadnice políček, včetně). */
function grid(w, h, fn, floor = '.') {
  const g = Array.from({ length: h }, (_, z) => Array.from({ length: w }, (_, x) => (x === 0 || z === 0 || x === w - 1 || z === h - 1 ? '#' : floor)));
  const api = { fill(x0, z0, x1, z1, ch) { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z][x] = ch; }, put(x, z, ch) { g[z][x] = ch; }, tee(x, z) { g[z][x] = 'T'; }, cup(x, z) { g[z][x] = 'H'; } };
  fn(api); return g.map((r) => r.join(''));
}
/** Vrstva výšek: kopec (cos), jehlan nebo schodová rampa. */
function hill(w, h, cx, cz, r, H) { return Array.from({ length: h }, (_, z) => Array.from({ length: w }, (_, x) => { const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); return d >= r ? '0' : String(Math.round(H * (0.5 + 0.5 * Math.cos(Math.PI * d / r)))); }).join('')); }
function pyramid(w, h, cx, cz, rx, rz, H) { return Array.from({ length: h }, (_, z) => Array.from({ length: w }, (_, x) => { const d = Math.max(Math.abs(x + 0.5 - cx) / rx, Math.abs(z + 0.5 - cz) / rz); return d >= 1 ? '0' : String(Math.min(H, Math.round((1 - d) * H * 1.6))); }).join('')); }
function ramp(w, h, x0, x1, H, dir = 1) { return Array.from({ length: h }, () => Array.from({ length: w }, (_, x) => { const t = dir > 0 ? (x - x0) / (x1 - x0) : (x1 - x) / (x1 - x0); return String(Math.max(0, Math.min(H, Math.round(t * H)))); }).join('')); }
const tree = (x, z, r = 0.4) => ({ k: 'pillar', x, z, r });

// ------------------------------------------------------------------ Louka
const meadow = [
  { name: 'Rozcvička', par: 2, map: grid(22, 7, (g) => { g.fill(10, 2, 11, 4, ','); g.tee(2, 3); g.cup(19, 3); }), objs: [tree(7.5, 5.6), tree(15.5, 1.6)] },
  { name: 'Zákruta', par: 3, map: grid(15, 11, (g) => { g.fill(1, 4, 6, 9, '#'); g.fill(9, 6, 10, 7, ','); g.tee(2, 2); g.cup(12, 9); }), objs: [tree(10.5, 4.4), tree(12.5, 6.5, 0.35)] },
  { name: 'Most', par: 3, map: grid(17, 8, (g) => { g.fill(6, 1, 10, 2, '~'); g.fill(6, 5, 10, 6, '~'); g.tee(2, 3); g.cup(14, 3); }), objs: [tree(13.5, 5.6, 0.35)] },
  { name: 'Větrný mlýn', par: 3, map: grid(20, 7, (g) => { g.tee(2, 3); g.cup(17, 3); }), objs: [{ k: 'mill', x: 10, z: 3.5, len: 2.1, arms: 4, spd: 1.5, hub: 0.3, w: 0.24 }] },
  { name: 'Kopec', par: 3, map: grid(22, 9, (g) => { g.tee(2, 4); g.cup(19, 4); }), hgt: hill(22, 9, 10.5, 4.5, 5, 5), objs: [tree(16.5, 2.2), tree(16.5, 6.8)] },
  { name: 'Brány', par: 4, map: grid(27, 9, (g) => { g.fill(8, 1, 8, 2, '#'); g.fill(8, 5, 8, 7, '#'); g.fill(16, 1, 16, 4, '#'); g.fill(16, 7, 16, 7, '#'); g.tee(2, 6); g.cup(22, 3); }),
    objs: [{ k: 'gate', x: 8.5, z: 4, w: 1, d: 2, per: 3.2, duty: 0.55, ph: 0 }, { k: 'gate', x: 16.5, z: 6, w: 1, d: 2, per: 3.2, duty: 0.55, ph: 0.5 }, tree(21.5, 5.5, 0.35)] },
];

// ------------------------------------------------------------------ Poušť
const desert = [
  { name: 'Oáza', par: 2, map: grid(24, 8, (g) => { g.fill(8, 1, 10, 3, ','); g.fill(13, 4, 15, 6, ','); g.tee(2, 4); g.cup(21, 3); }), objs: [tree(11.5, 5.5, 0.32), tree(17.5, 2.5, 0.32), tree(20.5, 5.5, 0.32)] },
  { name: 'Pyramida', par: 3, map: grid(22, 11, (g) => { g.tee(2, 5); g.cup(19, 5); }), hgt: pyramid(22, 11, 11, 5.5, 3.5, 3.2, 4), objs: [] },
  { name: 'Posuvné bloky', par: 3, map: grid(24, 9, (g) => { g.tee(2, 4); g.cup(21, 4); }),
    objs: [{ k: 'slider', x: 9, z: 4.5, w: 0.8, d: 2.2, ax: 0, az: 1, amp: 2.0, per: 3.6, ph: 0 }, { k: 'slider', x: 14, z: 4.5, w: 0.8, d: 2.2, ax: 0, az: 1, amp: 2.0, per: 3.6, ph: Math.PI }, { k: 'slider', x: 18.5, z: 4.5, w: 0.8, d: 2.2, ax: 0, az: 1, amp: 2.0, per: 3.6, ph: Math.PI / 2 }] },
  { name: 'Pouštní hadovka', par: 5, map: grid(26, 11, (g) => { g.fill(1, 3, 21, 3, '#'); g.fill(4, 7, 24, 7, '#'); g.fill(10, 4, 13, 6, ','); g.tee(2, 2); g.cup(23, 8); }), objs: [] },
  { name: 'Řeka', par: 3, map: grid(24, 9, (g) => { g.fill(10, 1, 13, 7, '~'); g.fill(10, 2, 13, 3, '.'); g.fill(10, 5, 13, 6, '.'); g.tee(2, 4); g.cup(21, 4); }),
    objs: [{ k: 'gate', x: 11.5, z: 3, w: 4, d: 2, per: 3, duty: 0.5, ph: 0 }, { k: 'bar', x: 11.5, z: 6, len: 3.2, spd: 2.2, ph: 0, w: 0.22 }, tree(17.5, 2, 0.32), tree(17.5, 6.5, 0.32)] },
  { name: 'Sfinga', par: 4, map: grid(26, 9, (g) => { g.fill(12, 4, 15, 4, 'E'); g.fill(20, 2, 23, 6, ','); g.tee(2, 4); g.cup(23, 4); }),
    objs: [{ k: 'bar', x: 8, z: 3.5, len: 3.6, spd: 1.9, ph: 0, w: 0.24 }, { k: 'bar', x: 18, z: 5.5, len: 3.6, spd: -1.9, ph: 1, w: 0.24 }, tree(5.5, 6.5, 0.32)] },
];

// ------------------------------------------------------------------ Led
const ice = [
  { name: 'Kluziště', par: 2, map: grid(24, 9, (g) => { g.tee(2, 4); g.cup(21, 4); }, 'i'), objs: [tree(11.5, 2.5, 0.4), tree(11.5, 6.5, 0.4)] },
  { name: 'Odrazy', par: 3, map: grid(24, 11, (g) => { g.fill(8, 1, 9, 6, '#'); g.fill(15, 4, 16, 9, '#'); g.tee(2, 5); g.cup(21, 5); }, 'i'), objs: [] },
  { name: 'Trhliny', par: 3, map: grid(24, 9, (g) => { g.fill(6, 2, 8, 3, '~'); g.fill(11, 5, 14, 7, '~'); g.fill(17, 1, 18, 3, '~'); g.tee(2, 4); g.cup(21, 4); }, 'i'), objs: [tree(15.5, 2.2, 0.4)] },
  { name: 'Ledové brány', par: 3, map: grid(24, 9, (g) => { g.fill(8, 1, 8, 2, '#'); g.fill(8, 6, 8, 7, '#'); g.fill(16, 1, 16, 2, '#'); g.fill(16, 6, 16, 7, '#'); g.tee(2, 4); g.cup(21, 4); }, 'i'),
    objs: [{ k: 'gate', x: 8.5, z: 4.5, w: 1, d: 3, per: 2.8, duty: 0.5, ph: 0 }, { k: 'gate', x: 16.5, z: 4.5, w: 1, d: 3, per: 2.8, duty: 0.5, ph: 0.5 }] },
  { name: 'Slalom', par: 3, map: grid(14, 24, (g) => { g.tee(7, 2); g.cup(7, 21); }, 'i'), hgt: Array.from({ length: 24 }, (_, z) => String(Math.max(0, 8 - Math.floor(z / 2.6))).repeat(14)),
    objs: [tree(4.5, 7), tree(9.5, 11), tree(4.5, 15), tree(9.5, 18.5, 0.35)] },
  { name: 'Sněžný finiš', par: 4, map: grid(28, 11, (g) => { g.fill(13, 1, 13, 9, '#'); g.fill(10, 4, 10, 6, '1'); g.fill(16, 4, 16, 6, '2'); g.fill(18, 5, 20, 5, 'E'); g.tee(2, 5); g.cup(25, 5); }, 'i'), objs: [{ k: 'bump', x: 22.5, z: 3, r: 0.4 }, { k: 'bump', x: 22.5, z: 7, r: 0.4 }] },
];

// ------------------------------------------------------------------ Sopka
const lava = [
  { name: 'Rozžhavená stezka', par: 3, map: grid(24, 9, (g) => { g.fill(1, 1, 22, 2, '~'); g.fill(1, 6, 22, 7, '~'); g.tee(2, 4); g.cup(21, 4); }), objs: [{ k: 'bump', x: 12, z: 4.5, r: 0.4 }] },
  { name: 'Nárazníky', par: 3, map: grid(22, 12, (g) => { g.tee(2, 6); g.cup(19, 6); }),
    objs: [{ k: 'bump', x: 8, z: 4, r: 0.45 }, { k: 'bump', x: 8, z: 8, r: 0.45 }, { k: 'bump', x: 12, z: 6, r: 0.5 }, { k: 'bump', x: 15.5, z: 3.5, r: 0.45 }, { k: 'bump', x: 15.5, z: 8.5, r: 0.45 }] },
  { name: 'Ohnivé tyče', par: 3, map: grid(24, 9, (g) => { g.fill(18, 1, 19, 2, '~'); g.fill(18, 6, 19, 7, '~'); g.tee(2, 4); g.cup(21, 4); }),
    objs: [{ k: 'bar', x: 9, z: 4.5, len: 3.9, spd: 2.2, ph: 0, w: 0.24 }, { k: 'bar', x: 14, z: 4.5, len: 3.9, spd: -2.2, ph: 1.2, w: 0.24 }] },
  { name: 'Sopečné schody', par: 3, map: grid(24, 9, (g) => { g.fill(6, 1, 7, 2, '~'); g.fill(6, 5, 7, 7, '~'); g.tee(2, 4); g.cup(20, 4); }), hgt: ramp(24, 9, 8, 13, 5), objs: [] },
  { name: 'Portál', par: 3, map: grid(24, 9, (g) => { g.fill(9, 1, 14, 7, '~'); g.fill(6, 3, 6, 5, '1'); g.fill(17, 3, 17, 5, '2'); g.tee(2, 4); g.cup(21, 4); }), objs: [{ k: 'bump', x: 19.5, z: 2.2, r: 0.4 }, { k: 'bump', x: 19.5, z: 6.8, r: 0.4 }] },
  { name: 'Sopka', par: 4, map: grid(28, 13, (g) => { g.fill(9, 1, 18, 11, '~'); g.fill(9, 5, 18, 7, '.'); g.fill(21, 3, 25, 9, ','); g.fill(6, 6, 7, 6, 'E'); g.tee(2, 6); g.cup(25, 6); }),
    objs: [{ k: 'bar', x: 13, z: 6.5, len: 2.6, spd: 2.4, ph: 0, w: 0.24 }, { k: 'bar', x: 17, z: 6.5, len: 2.6, spd: -2.4, ph: 1.5, w: 0.24 }] },
];

export const COURSES = [
  { id: 'meadow', name: 'Louka', blurb: 'Stromy, mlýn a kopec. Pohodový začátek.', holes: meadow },
  { id: 'desert', name: 'Poušť', blurb: 'Písek, pyramida a posuvné bloky.', holes: desert },
  { id: 'ice', name: 'Led', blurb: 'Kluzko, odrazy a ledové brány.', holes: ice },
  { id: 'lava', name: 'Sopka', blurb: 'Láva, nárazníky a portály.', holes: lava },
];
export const MIX = COURSES.length;       // index "Mix": šest náhodných jamek z celé nabídky
export const courseIdx = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n <= MIX ? n : 0; };
export const courseName = (i) => (i === MIX ? 'Mix' : COURSES[i].name);
/** Seznam jamek zápasu [courseIdx, holeIdx] podle hřiště, počtu jamek a semínka (Mix losuje pestrou šestici z různých hřišť). */
export function holeList(course, n, seed = 1) {
  let s = seed >>> 0 || 1; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  if (course !== MIX) { const c = COURSES[course]; const all = c.holes.map((_, k) => k); return (n >= c.holes.length ? all : all.slice(0, n)).map((k) => [course, k]); }
  const pool = []; for (let c = 0; c < COURSES.length; c++) for (let k = 0; k < COURSES[c].holes.length; k++) pool.push([c, k]);
  const out = []; while (out.length < n && pool.length) { const i = Math.floor(rnd() * pool.length); const [c, k] = pool.splice(i, 1)[0]; if (out.some((o) => o[0] === c && o[1] === k)) continue; out.push([c, k]); }
  return out;
}
export const holeDef = (c, k) => ({ ...COURSES[c].holes[k], theme: COURSES[c].id, course: c, index: k });
