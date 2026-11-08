// MINIGOLF – sdílené definice (stejný soubor je i v public/golf/, test hlídá shodu): barvy míčků, nastavení zápasu, bodování.
// Fyzika míčku je v phys.js, hřiště v courses.js (obojí je taky sdílené s prohlížečem).
export const MAX_PLAYERS = 4;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Barvy míčků; v místnosti má každou jen jeden hráč. */
export const COLORS = [
  { name: 'Červená', c: '#ef3b3b' }, { name: 'Modrá', c: '#2f7cf6' }, { name: 'Žlutá', c: '#ffcf1f' }, { name: 'Zelená', c: '#2fcf6a' },
  { name: 'Oranžová', c: '#ff8a1f' }, { name: 'Fialová', c: '#9b59ff' }, { name: 'Růžová', c: '#ff6fb5' }, { name: 'Tyrkysová', c: '#19d3c5' },
];
export const colorIdx = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n < COLORS.length ? n : -1; };
// Nastavení zápasu: holes = počet jamek, time = limit na jamku (s), grace = kolik zbývá ostatním po prvním dokončení (s).
export const CFG_OPTS = { holes: [3, 6], time: [45, 60, 90], grace: [15, 25, 40] };
export const CFG_DEFAULT = { holes: 6, time: 60, grace: 25 };
export function cleanCfg(c) { const o = {}; for (const k of Object.keys(CFG_DEFAULT)) { const v = c ? Number(c[k]) : NaN; o[k] = CFG_OPTS[k].includes(v) ? v : CFG_DEFAULT[k]; } return o; }
export const INTRO_S = 4, SCORE_S = 6;          // úvod jamky (přelet kamery) a tabulka po jamce
export const CAP_OVER_PAR = 4;                   // kdo jamku nedokončí, dostane par + 4 ran; víc ran než tolik se neudělá
export const capOf = (par) => par + CAP_OVER_PAR;
export const COINS = { play: 10, win: 30, ace: 15, hole: 2 };   // coiny za zápas, výhru, jamku na jednu ránu a každou dokončenou jamku
export const START_COINS = 100;

// ------------------------------------------------------------------ obchod: skiny míčků, efekty výhry a hole
// Koupené věci se ukládají v účtu jako 'kategorie:id' (acc.golf.own), vybraná výbava v acc.golf.eq = { skin, fx, club }; prázdné id = základ (zdarma).
// Skin a efekt vidí všichni hráči, hůl jen její majitel (mění sílu rány a zaměřovač). Kresba skinů a efektů je v public/golf/cosm.js a scene.js.
export const SHOP_CATS = ['skin', 'fx', 'club'];
export const SKINS = [
  { id: 'dots', name: 'Puntíkáč', price: 80 }, { id: 'checker', name: 'Šachovnice', price: 100 }, { id: 'tennis', name: 'Tenisák', price: 120 }, { id: 'stars', name: 'Hvězdná obloha', price: 140 },
  { id: 'smile', name: 'Smajlík', price: 160 }, { id: 'soccer', name: 'Fotbal', price: 180 }, { id: 'basket', name: 'Basketbal', price: 180 }, { id: 'bee', name: 'Včelka', price: 200 },
  { id: 'eight', name: 'Osmička', price: 220 }, { id: 'camo', name: 'Maskáč', price: 240 }, { id: 'melon', name: 'Meloun', price: 260 }, { id: 'earth', name: 'Planeta', price: 300 },
  { id: 'pumpkin', name: 'Dýně', price: 340 }, { id: 'lava', name: 'Láva', price: 400 }, { id: 'ice', name: 'Ledovec', price: 400 }, { id: 'neon', name: 'Neon', price: 450 },
  { id: 'galaxy', name: 'Galaxie', price: 600 }, { id: 'rainbow', name: 'Duha', price: 700 }, { id: 'matrix', name: 'Matrix', price: 750 }, { id: 'chrome', name: 'Chrom', price: 800 },
  { id: 'disco', name: 'Disco koule', price: 900 }, { id: 'gold', name: 'Zlato', price: 1200 }, { id: 'void', name: 'Černá díra', price: 1500 },
];
export const WINFX = [   // přehrají se v jamce, když míček spadne do díry, a ve větší podobě po vítězství v zápase
  { id: 'sparks', name: 'Jiskry', price: 100 }, { id: 'stars', name: 'Hvězdný déšť', price: 150 }, { id: 'bubbles', name: 'Bubliny', price: 180 }, { id: 'rings', name: 'Rázová vlna', price: 200 },
  { id: 'hearts', name: 'Srdíčka', price: 220 }, { id: 'snow', name: 'Sněžení', price: 240 }, { id: 'rainbow', name: 'Duhový gejzír', price: 280 }, { id: 'petals', name: 'Sakury', price: 320 },
  { id: 'fireworks', name: 'Ohňostroj', price: 400 }, { id: 'lightning', name: 'Blesk', price: 500 }, { id: 'vortex', name: 'Magický vír', price: 600 }, { id: 'meteor', name: 'Meteorit', price: 650 },
  { id: 'goldrain', name: 'Zlatý déšť', price: 800 }, { id: 'nova', name: 'Supernova', price: 1000 },
];
// pw = násobek rychlosti rány, aim = délka zaměřovače, sand = jak moc písek brzdí (1 = normálně, menší = míň)
export const CLUBS = [
  { id: 'putter', name: 'Přesný patr', price: 100, pw: 1.03, aim: 1.7, sand: 1, desc: 'Skoro stejná síla, ale hodně dlouhý zaměřovač.' },
  { id: 'iron', name: 'Železná sedmička', price: 150, pw: 1.06, aim: 1, sand: 1, desc: 'Trochu silnější rána.' },
  { id: 'sand', name: 'Pískovka', price: 250, pw: 1.04, aim: 1, sand: 0.4, desc: 'Písek míček skoro nebrzdí.' },
  { id: 'wood', name: 'Dřevěná pětka', price: 300, pw: 1.09, aim: 1.05, sand: 0.85, desc: 'Vyvážená hůl do každého terénu.' },
  { id: 'driver', name: 'Driver', price: 400, pw: 1.12, aim: 1.1, sand: 1, desc: 'Silná rána na dlouhé jamky.' },
  { id: 'beach', name: 'Plážová lopatka', price: 500, pw: 1.1, aim: 1.1, sand: 0.1, desc: 'Písek míček téměř nebrzdí.' },
  { id: 'titan', name: 'Titanový driver', price: 700, pw: 1.18, aim: 1.25, sand: 1, desc: 'Silná rána a delší zaměřovač.' },
  { id: 'sniper', name: 'Odstřelovač', price: 1100, pw: 1.15, aim: 2.2, sand: 1, desc: 'Nejdelší zaměřovač ze všech holí.' },
  { id: 'goldclub', name: 'Zlatá hůl', price: 1200, pw: 1.24, aim: 1.4, sand: 0.7, desc: 'Silná, dlouhý zaměřovač, písek méně brzdí.' },
  { id: 'ruby', name: 'Rubínová hůl', price: 1600, pw: 1.27, aim: 1.3, sand: 0.6, desc: 'Silná rána a písek skoro nevadí.' },
  { id: 'plasma', name: 'Plazmová hůl', price: 2000, pw: 1.3, aim: 1.6, sand: 0.5, desc: 'Velmi silná rána a dlouhý zaměřovač.' },
  { id: 'diamond', name: 'Diamantová hůl', price: 3000, pw: 1.38, aim: 1.8, sand: 0.4, desc: 'Extrémní síla a dlouhý zaměřovač.' },
  { id: 'storm', name: 'Bouřková hůl', price: 3800, pw: 1.44, aim: 1.5, sand: 0.35, desc: 'Skoro dračí síla a písek skoro nevadí.' },
  { id: 'dragon', name: 'Dračí hůl', price: 5000, pw: 1.5, aim: 2, sand: 0.3, desc: 'Absolutně nejsilnější hůl ze všech.' },
];
export const BASE_CLUB = { id: '', name: 'Základní hůl', price: 0, pw: 1, aim: 1, sand: 1, desc: 'Obyčejná hůl, každý ji má.' };
const LISTS = { skin: SKINS, fx: WINFX, club: CLUBS };
export const shopItem = (cat, id) => { const l = LISTS[cat]; return l ? l.find((x) => x.id === id) || null : null; };
export const clubOf = (id) => shopItem('club', id) || BASE_CLUB;
/** Výbava: jen koupené věci (own = Set 'kategorie:id'), jinak základ. */
export function cleanEq(eq, own) {
  const o = { skin: '', fx: '', club: '' };
  for (const c of SHOP_CATS) { const v = eq && typeof eq[c] === 'string' ? eq[c] : ''; if (v && shopItem(c, v) && own && own.has(c + ':' + v)) o[c] = v; }
  return o;
}
/** Veřejná část výbavy, kterou vidí ostatní hráči (hůl ne). */
export const pubEq = (eq) => ({ skin: eq && eq.skin || '', fx: eq && eq.fx || '' });
