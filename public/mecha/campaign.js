// MECHA ARÉNA – kampaň: 6 kapitol po 5 misích (poslední je boss) + generátor soupeřů podle síly (pro rychlou hru bez člověka).
import * as H from './shared.js';

export const CHAPTERS = [
  { name: 'Šrotiště', theme: 'junk', blurb: 'Rezavé stroje a výcvik nováčků.' }, { name: 'Továrna', theme: 'factory', blurb: 'Obranné roboty hlídají linky.' },
  { name: 'Poušť', theme: 'desert', blurb: 'Písek, žár a těžká technika.' }, { name: 'Ledová stanice', theme: 'ice', blurb: 'Zamrzlý výzkumný komplex.' },
  { name: 'Sopečná pevnost', theme: 'lava', blurb: 'Pancéřovaní strážci lávy.' }, { name: 'Orbitální stanice', theme: 'space', blurb: 'Poslední výzva: elitní bojové stroje.' },
];
const NAMES = [
  'Rezavec', 'Šrotař', 'Kolouch MK-1', 'Hlídač hald', 'Drtič šrotu',
  'Svářeč', 'Montážník', 'Lisovací Lenka', 'Linkový kat', 'Šéf výroby',
  'Písečný pavouk', 'Karavanář', 'Skarab-7', 'Poutní stroj', 'Faraon',
  'Rampouch', 'Mrazák', 'Polární strážce', 'Sněžný ničitel', 'Ledový král',
  'Magmoun', 'Žhář', 'Pevnostní věž', 'Vulkán-9', 'Pán ohně',
  'Orbiter', 'Hvězdný lovec', 'Kosmický kat', 'Strážce stanice', 'Velitel Omega',
];
const HANDS = ['mg', 'plas', 'laser', 'rail', 'blade', 'hammer', 'flame', 'tesla', 'shot', 'emp', 'axe', 'claw', 'pile', 'hook'];
const SHOULDERS = ['rocket', 'mortar', 'turret', 'micro', 'snip', 'pcan'];
const HEADS = ['sens', 'helm', 'cpu', 'radar', 'visor'], LEGS = ['servo', 'greave', 'gyro', 'frame', 'thrust'], DRONES = ['adron', 'rdron', 'sdron', 'jdron'];
function mul32(a) { return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pickOf = (arr, r) => arr[Math.floor(r() * arr.length)];
const T = (t) => Math.max(1, Math.min(5, Math.round(t)));

/** Sestaví soupeře. tier = průměrná úroveň karet (1–5, může být desetinná), lv = úroveň vylepšení karet. */
export function genBuild(seed, tier, lv = 1, opt = {}) {
  const r = mul32(seed * 7919 + 13), b = H.emptyBuild(); const t = (d = 0) => T(tier + d + (r() < 0.3 ? 1 : 0) - (r() < 0.25 ? 1 : 0));
  const hands = [pickOf(HANDS, r)]; hands.push(pickOf(HANDS.filter((x) => x !== hands[0]), r));
  b.hdL = hands[0] + t(); b.hdR = hands[1] + t();
  if (tier >= 1.8) { const s1 = pickOf(SHOULDERS, r); b.shL = s1 + t(-1); if (tier >= 2.6) b.shR = pickOf(SHOULDERS.filter((x) => x !== s1), r) + t(-1); }
  b.head = pickOf(HEADS, r) + t();
  const reactorTier = tier >= 1.8 ? T(tier + (opt.boss ? 1 : 0)) : 1;
  b.chest = tier >= 1.8 ? (r() < 0.78 ? 'reac' + Math.max(2, reactorTier) : 'plate' + t()) : 'plate1';
  b.lgL = pickOf(LEGS, r) + t(); b.lgR = pickOf(LEGS, r) + t();
  if (tier >= 2.4 || opt.boss) b.drone = pickOf(DRONES, r) + t(-0.5);
  // nosnost: když je robot přetížený, nejtěžší kartu zlehčí o úroveň
  for (let k = 0; k < 30; k++) {
    const m = H.mechStats(b); if (m.weight <= m.cap) break;
    let worst = null; for (const s of H.SLOTS) { const it = b[s] && H.item(b[s]); if (it && it.tier > 1 && (!worst || it.w > worst.w)) worst = { s, w: it.w, it }; }
    if (!worst) break; b[worst.s] = worst.it.fam + (worst.it.tier - 1);
  }
  const inv = {}; for (const id of Object.values(b)) if (id) inv[id] = { n: 9, lv };
  return { build: b, inv };
}
const tierOf = (idx) => [1, 1.3, 2.2, 3, 3.8, 4.5][idx / 5 | 0] + (idx % 5) * [0.1, 0.2, 0.2, 0.2, 0.15, 0.1][idx / 5 | 0];
export const MISSIONS = Array.from({ length: 30 }, (_, idx) => {
  const ch = idx / 5 | 0, boss = idx % 5 === 4, lv = Math.min(5, 1 + (ch >= 2 ? 1 : 0) + (ch >= 4 ? 1 : 0) + (boss && ch >= 1 ? 1 : 0));
  const g = genBuild(idx + 1, tierOf(idx) + (boss ? 0.4 : 0), lv, { boss });
  const crate = boss ? (ch < 3 ? 'vojen' : 'proto') : ch < 2 ? 'serv' : (idx % 2 ? 'tech' : 'zbroj');
  return { idx, ch, boss, name: NAMES[idx], title: `${ch + 1}-${idx % 5 + 1}`, theme: CHAPTERS[ch].theme, level: ch === 0 ? 1 : ch < 3 ? 2 : 3, build: g.build, inv: g.inv, coins: 100 + idx * 30 + (boss ? 150 : 0), repeatCoins: 40 + idx * 8, crate };
});
/** Soupeř pro rychlou hru bez člověka: podle síly hráčovy sestavy. */
export function mirrorFor(power, seed) {
  const tier = Math.max(1, Math.min(4.6, 0.8 + power / 260)); const lv = Math.max(1, Math.min(4, Math.round(tier / 1.3)));
  const g = genBuild(seed, tier, lv); return { name: 'Cvičný robot', ...g };
}
