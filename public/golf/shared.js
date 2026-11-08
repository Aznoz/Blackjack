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
