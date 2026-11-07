// BOMBIC – sdílené definice (stejný soubor je i v public/bombic/, test hlídá shodu): mřížka, časy, power-upy, barvy hráčů, úrovně.
export const COLS = 15, ROWS = 13;                    // celé hřiště včetně okrajových stromů (hratelné je 13 × 11)
export const DT = 0.05;                               // jeden tik simulace (20× za sekundu)
export const T = { FLOOR: 0, STONE: 1, STUMP: 2 };   // kámen (nezničitelný), pařez (rozbitný)
export const SPAWNS = [[1, 1], [13, 1], [1, 11], [13, 11]];
export const FUSE_S = 2.4, FLAME_S = 0.55;            // doba do výbuchu bomby, doba hoření plamene
export const ROUND_S = 150, SUDDEN_S = 45;            // délka kola; posledních 45 s padají kameny od okraje
export const FREEZE_S = 3;                            // odpočet před začátkem kola
export const WINS_NEEDED = 2, MAX_ROUNDS = 5;         // zápas = první na 2 vítězná kola
export const BASE_SPEED = 4.2, SPEED_STEP = 0.55, MAX_SPEED_LV = 5;   // pole za sekundu a o kolik víc za každé zrychlení
export const START_BOMBS = 1, START_RANGE = 2, MAX_BOMBS = 8, MAX_RANGE = 9;
export const CURSE_S = 12;
export const SKATE_S = 15, SHOT_S = 1.2;              // skateboard: jak dlouho trvá a jak často sám vystřelí bombu ve směru pohledu                            // jak dlouho trvá prokletí od lebky
export const ITEMS = ['bomb', 'fire', 'speed', 'kick', 'skull', 'skate', 'gskull'];
export const ITEM_INFO = {
  bomb: { name: 'Bomba navíc', desc: 'Můžeš mít položenou o jednu bombu víc.' },
  fire: { name: 'Delší plamen', desc: 'Výbuch dosáhne o pole dál.' },
  speed: { name: 'Rychlé boty', desc: 'Běháš rychleji.' },
  kick: { name: 'Kopání bomb', desc: 'Když narazíš na bombu, odkopneš ji.' },
  skate: { name: 'Skateboard', desc: 'Na 15 s se postavíš na skateboard a bomby ti samy vyletují ve směru, kam se díváš.' },
  gskull: { name: 'Zelená lebka', desc: 'Vzácná: všem soupeřům hodí náhodné prokletí na 12 s, tobě nic.' },
  skull: { name: 'Lebka', desc: 'Na 12 s tě něco postihne: zpomalení, zrychlení, žádné bomby, samovolné bomby, nebo krátký plamen.' },
};
export const CURSES = ['slow', 'fast', 'nobomb', 'auto', 'short'];
export const CURSE_NAME = { slow: 'Zpomalení', fast: 'Zrychlení', nobomb: 'Žádné bomby', auto: 'Samovolné bomby', short: 'Krátký plamen' };
// Skiny: prvních pět je zdarma, ostatní se odemykají úrovní hráče (`lvl`). `hat` určuje tvar čepice, `hc`/`hd` její barvy, `tone` barvu pleti.
export const SKINS = [
  { name: 'Modrý', lvl: 1, hat: 'helmet', main: '#3f8cf0', dark: '#1f4fa8', light: '#9ccbff' },
  { name: 'Červený', lvl: 1, hat: 'helmet', main: '#e5483f', dark: '#971f1a', light: '#ffa49d' },
  { name: 'Zelený', lvl: 1, hat: 'helmet', main: '#3fbf5a', dark: '#1d7a34', light: '#9cf0ad' },
  { name: 'Žlutý', lvl: 1, hat: 'helmet', main: '#f2c230', dark: '#a37a07', light: '#ffe98a' },
  { name: 'Oranžový', lvl: 2, hat: 'cap', main: '#ff8a1f', dark: '#b24f05', light: '#ffc98a', hc: '#ff8a1f', hd: '#b24f05' },
  { name: 'Kuchař', lvl: 4, hat: 'chef', main: '#f4f1ea', dark: '#9d978a', light: '#ffffff', hc: '#ffffff', hd: '#cfc9bb' },
  { name: 'Oslavenec', lvl: 6, hat: 'party', main: '#ff5fa8', dark: '#b01f66', light: '#ffb3d9', hc: '#ff5fa8', hd: '#4ac8ff' },
  { name: 'Ninja', lvl: 9, hat: 'ninja', main: '#2b2d3a', dark: '#14151d', light: '#6b6f86', hc: '#2b2d3a', hd: '#e5483f' },
  { name: 'Kovboj', lvl: 12, hat: 'cowboy', main: '#b5763c', dark: '#6e4320', light: '#e6b585', hc: '#9a5f2a', hd: '#5a3517' },
  { name: 'Pirát', lvl: 15, hat: 'pirate', main: '#7a2a2a', dark: '#451212', light: '#c97a7a', hc: '#1f2029', hd: '#ffd24a' },
  { name: 'Čaroděj', lvl: 18, hat: 'wizard', main: '#7a4ad8', dark: '#43228f', light: '#c2a5ff', hc: '#5a35b8', hd: '#ffd24a' },
  { name: 'Kosmonaut', lvl: 22, hat: 'astro', main: '#e9eef7', dark: '#7f8aa3', light: '#ffffff', hc: '#ffffff', hd: '#3f8cf0' },
  { name: 'Viking', lvl: 26, hat: 'viking', main: '#5f6f86', dark: '#34404f', light: '#a9bad0', hc: '#9aa5b5', hd: '#f1e3b5' },
  { name: 'Ohnivák', lvl: 29, hat: 'flame', main: '#d4382a', dark: '#7e1409', light: '#ff9d6a', hc: '#ff7a1a', hd: '#ffd84a' },
  { name: 'Král', lvl: 32, hat: 'crown', main: '#7a2fa8', dark: '#431062', light: '#d29bff', hc: '#ffc42e', hd: '#e5483f' },
  { name: 'Legenda', lvl: 35, hat: 'legend', main: '#ffc42e', dark: '#a8730a', light: '#fff1a8', hc: '#ffd84a', hd: '#fff7c8' },
];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const MAX_LEVEL = 35;
export const xpFor = (lvl) => (lvl <= 1 ? 0 : Math.round(60 * Math.pow(lvl - 1, 1.45)));
export function levelOf(xp) { let l = 1; while (l < MAX_LEVEL && xp >= xpFor(l + 1)) l++; return l; }
export const speedOf = (lv) => BASE_SPEED + SPEED_STEP * clamp(lv, 0, MAX_SPEED_LV);
export const idx = (x, y) => y * COLS + x;
export const unlockedSkins = (lvl) => SKINS.map((k, i) => (k.lvl <= lvl ? i : -1)).filter((i) => i >= 0);
// Mapy: vzor jedné čtvrtiny hřiště (8 sloupců × 7 řádků, vlevo nahoře včetně okraje), zbytek se zrcadlí.
// '#' kámen, '.' náhodně pařez (nebo volno), 'o' vždy volno. U startů se pařezy nikdy nevyskytují. `theme` je vzhled (kreslí klient).
export const MAPS = [
  { name: 'Les', theme: 'forest', desc: 'Klasika: pravidelné sloupky a hodně sudů.', stump: 0.70, stone: 0.04,
    q: ['########', '#.......', '#.#.#.#.', '#.......', '#.#.#.#.', '#.......', '#.#.#.#.'] },
  { name: 'Poušť', theme: 'desert', desc: 'Otevřená mapa s pár kameny, rychlá a nebezpečná.', stump: 0.52, stone: 0.03,
    q: ['########', '#.......', '#.#...#.', '#.......', '#...#...', '#.......', '#.#...#.'] },
  { name: 'Sníh', theme: 'snow', desc: 'Bludiště zdí s úzkými chodbami.', stump: 0.62, stone: 0.02,
    q: ['########', '#...#...', '#.#.#.#.', '#.#...#.', '#...#.#.', '#.#.#...', '#.....#.'] },
  { name: 'Sopka', theme: 'lava', desc: 'Uprostřed kamenný kruh se čtyřmi vstupy.', stump: 0.64, stone: 0.02,
    q: ['########', '#.......', '#.#.....', '#.......', '#...##..', '#...#...', '#.......'] },
  { name: 'Jeskyně', theme: 'cave', desc: 'Husté zdi a krátké úseky, hodně zákoutí.', stump: 0.60, stone: 0.02,
    q: ['########', '#.......', '#.#.#.#.', '#.#...#.', '#.#.#.#.', '#.......', '#.#.#.#.'] },
];
export const mapIdx = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n < MAPS.length ? n : 0; };
