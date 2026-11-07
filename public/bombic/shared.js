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
export const CURSE_S = 12;                            // jak dlouho trvá prokletí od lebky
export const ITEMS = ['bomb', 'fire', 'speed', 'kick', 'skull'];
export const ITEM_INFO = {
  bomb: { name: 'Bomba navíc', desc: 'Můžeš mít položenou o jednu bombu víc.' },
  fire: { name: 'Delší plamen', desc: 'Výbuch dosáhne o pole dál.' },
  speed: { name: 'Rychlé boty', desc: 'Běháš rychleji.' },
  kick: { name: 'Kopání bomb', desc: 'Když narazíš na bombu, odkopneš ji.' },
  skull: { name: 'Lebka', desc: 'Na 12 s tě něco postihne: zpomalení, zrychlení, žádné bomby, samovolné bomby, nebo krátký plamen.' },
};
export const CURSES = ['slow', 'fast', 'nobomb', 'auto', 'short'];
export const CURSE_NAME = { slow: 'Zpomalení', fast: 'Zrychlení', nobomb: 'Žádné bomby', auto: 'Samovolné bomby', short: 'Krátký plamen' };
export const SKINS = [
  { name: 'Modrý', main: '#3f8cf0', dark: '#1f4fa8', light: '#9ccbff' },
  { name: 'Červený', main: '#e5483f', dark: '#971f1a', light: '#ffa49d' },
  { name: 'Zelený', main: '#3fbf5a', dark: '#1d7a34', light: '#9cf0ad' },
  { name: 'Žlutý', main: '#f2c230', dark: '#a37a07', light: '#ffe98a' },
];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const MAX_LEVEL = 30;
export const xpFor = (lvl) => (lvl <= 1 ? 0 : Math.round(60 * Math.pow(lvl - 1, 1.45)));
export function levelOf(xp) { let l = 1; while (l < MAX_LEVEL && xp >= xpFor(l + 1)) l++; return l; }
export const speedOf = (lv) => BASE_SPEED + SPEED_STEP * clamp(lv, 0, MAX_SPEED_LV);
export const idx = (x, y) => y * COLS + x;
