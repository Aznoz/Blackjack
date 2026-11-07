// HOPÍK – sdílené definice (stejný soubor je i v public/hopik/, test hlídá shodu): rozměry hřiště, kusy (plošiny a pasti), stage, postavičky, body.
// Jednotka je jedno políčko (1 × 1); hřiště má 32 × 18 políček. Fyzika je v phys.js (také sdílená).
export const COLS = 32, ROWS = 18;
export const TPS = 30, DT = 1 / TPS;                 // 30 tiků za sekundu
export const T = { EMPTY: 0, SOLID: 1, ICE: 2, BOUNCE: 3, CRUMBLE: 4, DEVICE: 5 };   // dlaždice; 1–5 jsou pevné
export const WIN_POINTS = 50, MAX_ROUNDS = 12;       // výchozí zápas: kdo první dosáhne 50 bodů (po kole), nejvýš 12 kol
export const PTS = { finish: 10, first: 5, solo: 10, kill: 2, killMax: 6 };
export const TIME = { pick: 15, place: 25, reveal: 1.5, count: 3, run: 30, hurry: 10, score: 6 };   // sekundy jednotlivých fází
export const MAX_PLAYERS = 4;
// Nastavení zápasu, které volí zakladatel hry v čekárně (pick, place, run = sekundy fází; win = body k výhře; rounds = nejvýš kol; bonus = bonusové kolo při dvou hráčích).
export const CFG_OPTS = { pick: [8, 15, 25, 40], place: [15, 25, 40, 60], run: [20, 30, 45, 60], win: [30, 50, 75, 100], rounds: [6, 12, 20, 30], bonus: [0, 1] };
export const CFG_DEFAULT = { pick: TIME.pick, place: TIME.place, run: TIME.run, win: WIN_POINTS, rounds: MAX_ROUNDS, bonus: 1 };
/** Zkontroluje nastavení zápasu (jen povolené hodnoty, jinak výchozí). */
export function cleanCfg(c) { const o = {}; for (const k of Object.keys(CFG_DEFAULT)) { const v = c ? Number(c[k]) : NaN; o[k] = CFG_OPTS[k].includes(v) ? v : CFG_DEFAULT[k]; } return o; }
/** Je v tomhle kole bonusový výběr navíc? (dva aktivní hráči, každé druhé kolo) */
export const isBonusRound = (cfg, round, players) => !!cfg.bonus && players === 2 && round % 2 === 0;

// ------------------------------------------------------------------ kusy
// cells = tvary v základní poloze (x, y), y roste dolů. kind: solid (pevná plošina), hazard (past), special (rozsah se rezervuje).
// face = výchozí směr u pastí (0 nahoru, 1 doprava, 2 dolů, 3 doleva); otáčení po 90° po směru hodinových ručiček.
export const PIECES = {
  plank3: { name: 'Prkno', desc: 'Pevná plošina, 3 políčka.', kind: 'solid', tile: 1, cells: [[0, 0], [1, 0], [2, 0]], w: 10 },
  plank5: { name: 'Dlouhé prkno', desc: 'Pevná plošina, 5 políček.', kind: 'solid', tile: 1, cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], w: 8 },
  block: { name: 'Kvádr', desc: 'Pevný blok 2 × 2.', kind: 'solid', tile: 1, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], w: 8 },
  pillar: { name: 'Sloup', desc: 'Svislý sloup, dá se po něm šplhat odrazy od stěny.', kind: 'solid', tile: 1, cells: [[0, 0], [0, 1], [0, 2], [0, 3]], w: 6 },
  ell: { name: 'Roh', desc: 'Pevný tvar L.', kind: 'solid', tile: 1, cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], w: 7 },
  stairs: { name: 'Schody', desc: 'Tři schody.', kind: 'solid', tile: 1, cells: [[2, 0], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]], w: 6 },
  ice: { name: 'Ledová plošina', desc: 'Kluzká plošina, 4 políčka.', kind: 'solid', tile: 2, cells: [[0, 0], [1, 0], [2, 0], [3, 0]], w: 5 },
  crumble: { name: 'Drolící se plošina', desc: 'Po došlápnutí se za chvilku propadne.', kind: 'solid', tile: 4, cells: [[0, 0], [1, 0], [2, 0]], w: 5 },
  bounce: { name: 'Odrazovadlo', desc: 'Vystřelí tě vysoko do vzduchu.', kind: 'solid', tile: 3, cells: [[0, 0], [1, 0]], w: 5 },
  mover: { name: 'Pojízdná plošina', desc: 'Plošina 3 políčka jezdí sem a tam (otočením svisle).', kind: 'special', cells: [[0, 0], [1, 0], [2, 0]], w: 5 },
  spikes: { name: 'Bodáky', desc: 'Blok s hroty na jedné straně. Hroty zabíjejí, ze zbylých stran se na něm dá stát. Otáčením určíš, kde hroty jsou.', kind: 'hazard', cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], face: 0, w: 9 },
  saw: { name: 'Pila', desc: 'Točivá pila 2 × 2, dotek znamená konec.', kind: 'hazard', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], w: 7 },
  cannon: { name: 'Dělo', desc: 'Každé dvě vteřiny vystřelí kulku.', kind: 'hazard', tile: 5, cells: [[0, 0]], face: 1, w: 6 },
  flame: { name: 'Plamenomet', desc: 'Střídavě chrlí oheň do vzdálenosti 3 políček.', kind: 'hazard', tile: 5, cells: [[0, 0]], face: 0, w: 5 },
  blades: { name: 'Vrtule', desc: 'Dvě dlouhé lopatky se točí dokola, dotek znamená konec.', kind: 'hazard', tile: 5, cells: [[0, 0]], w: 5 },
  pendulum: { name: 'Kyvadlo', desc: 'Ostnatá koule se houpá na řetězu z jednoho políčka.', kind: 'hazard', tile: 5, cells: [[0, 0]], w: 5 },
  thwomp: { name: 'Padací kámen', desc: 'Kámen se prudce vrhne po dráze 2 × 6 a pomalu se vrátí. Zabíjí dotekem zespodu i ze stran, shora na něm můžeš stát. Otáčením měníš směr dráhy.', kind: 'hazard', face: 2, cells: Array.from({ length: 12 }, (_, i) => [i % 2, Math.floor(i / 2)]), w: 4 },
  laser: { name: 'Laser', desc: 'Střídavě vyšle dlouhý paprsek až k první zdi. Před výstřelem bliká.', kind: 'hazard', tile: 5, cells: [[0, 0]], face: 1, w: 5 },
  rsaw: { name: 'Pila na kolejnici', desc: 'Pila jezdí sem a tam po dráze dlouhé 6 políček (otočením svisle).', kind: 'hazard', cells: [[0, 0]], w: 5 },
  retract: { name: 'Výsuvné bodáky', desc: 'Blok, ze kterého hroty střídavě vyjíždějí (nejdřív varovně zacukají) a zase se schovají. Otáčením určíš stranu.', kind: 'hazard', cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], face: 0, w: 6 },
  icicle: { name: 'Rampouch', desc: 'Ostrý rampouch visí ze stropního bločku, zatřese se a spadne až na zem. Pak znovu doroste.', kind: 'hazard', tile: 5, cells: [[0, 0]], w: 5 },
  bumper: { name: 'Odrážeč', desc: 'Kulatý odrážeč jako v pinballu: kdo se ho dotkne, je odpálen pryč. Nezabíjí, ale umí zničit skok.', kind: 'hazard', cells: [[0, 0]], w: 5 },
  vanish: { name: 'Mizející plošina', desc: 'Plošina 3 políčka, která chvíli bliká a pak zmizí, aby se zase objevila.', kind: 'hazard', cells: [[0, 0], [1, 0], [2, 0]], w: 5 },
  hole: { name: 'Černá díra', desc: 'Střídavě přitahuje všechno do vzdálenosti 3,5 políčka. Uprostřed je smrtelná.', kind: 'hazard', cells: [[0, 0]], w: 4 },
  boulder: { name: 'Valoun', desc: 'Obrovská koule se rozkutálí po dráze dlouhé 8 políček. Přeskoč ji. Otočením se kutálí na druhou stranu.', kind: 'hazard', cells: Array.from({ length: 8 }, (_, i) => [i, 0]), face: 1, w: 4 },
  fan: { name: 'Ventilátor', desc: 'Střídavě fouká do vzdálenosti 5 políček: zvedá nebo odfoukne.', kind: 'hazard', tile: 5, cells: [[0, 0]], face: 0, w: 4 },
};
export const PIECE_IDS = Object.keys(PIECES);
export const MOVER_AMP = 3, MOVER_PERIOD = 150;        // pojízdná plošina: rozkmit v políčkách a perioda v ticcích
export const CANNON_PERIOD = 60, BULLET_SPEED = 9, BULLET_R = 0.28;
export const FLAME_PERIOD = 90, FLAME_ON = 30, FLAME_LEN = 3;
export const BLADE_PERIOD = 150, BLADE_LEN = 2.2, BLADE_R = 0.2;                       // vrtule: oběh v ticcích, délka lopatky od osy, tloušťka (poloměr)
export const PEND_PERIOD = 130, PEND_LEN = 3.2, PEND_AMP = 1.15, PEND_R = 0.5;          // kyvadlo: perioda, délka řetězu, výkyv (rad), poloměr koule
export const THW = { period: 120, wait: 60, fall: 5, rest: 20, w: 2, h: 6, s: 2 };     // padací kámen: sloupec w × h, kámen s × s
export const LASER_PERIOD = 120, LASER_WARN = 20, LASER_ON = 40, LASER_R = 0.11;       // laser: perioda, varování (bliká), výstřel, polotloušťka paprsku
export const RSAW_LEN = 6, RSAW_PERIOD = 130, RSAW_R = 0.5;                            // pila na kolejnici: délka dráhy, perioda, poloměr
export const FAN = { period: 120, on: 80, len: 5, half: 0.85, wind: 5.5, lift: 100 };  // ventilátor: perioda, doba fouknutí, dosah, poloviční šířka, odfuk (políček/s), zrychlení vzhůru
export const RETRACT = { period: 100, warn: 14, on: 34 };                               // výsuvné bodáky: perioda, varování (cukají), doba venku
export const ICICLE = { period: 170, fallAt: 110, grow: 18, shatter: 10, w: 0.22, len: 0.95, g: 40 };  // rampouch: perioda, tik pádu, doba dorůstání, doba tříštění, polovina šířky, délka, zrychlení
export const BUMP = { r: 0.52, v: 17 };                                                 // odrážeč: poloměr, rychlost odpálení
export const VANISH = { period: 150, solid: 95, warn: 25 };                             // mizející plošina: perioda, pevná doba, varování (bliká, pořád pevná); zbytek periody chybí
export const HOLE = { period: 150, on: 90, warn: 16, r: 3.5, core: 0.42, pull: 62 };    // černá díra: perioda, doba působení, varování, dosah, smrtelné jádro, síla přitahování
export const BOULDER = { period: 190, roll: 125, len: 8, r: 0.85 };                     // valoun: perioda, doba kutálení, délka dráhy, poloměr
export const CRUMBLE_T = 14;                           // tiků od došlápnutí do propadnutí

/** Buňky kusu po otočení o r × 90° (normalizované, min x = min y = 0). Pojízdná plošina vrací celý rezervovaný pás. */
export function pieceCells(type, r) {
  const P = PIECES[type]; r = ((r % 4) + 4) % 4;
  if (type === 'mover') {
    const n = 3 + 2 * MOVER_AMP, out = [];
    if (r % 2 === 0) for (let i = 0; i < n; i++) out.push([i, 0]); else for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) out.push([j, i]);
    return out;
  }
  if (type === 'rsaw') { const out = []; for (let i = 0; i < RSAW_LEN; i++) out.push(r % 2 === 0 ? [i, 0] : [0, i]); return out; }
  if (type === 'boulder') return P.cells.map(([x, y]) => [x, y]);
  let c = P.cells.map(([x, y]) => [x, y]);
  for (let k = 0; k < r; k++) c = c.map(([x, y]) => [-y, x]);
  const mx = Math.min(...c.map((q) => q[0])), my = Math.min(...c.map((q) => q[1]));
  return c.map(([x, y]) => [x - mx, y - my]);
}
/** Směr pasti po otočení (0 nahoru, 1 doprava, 2 dolů, 3 doleva). */
export const faceOf = (type, r) => ((PIECES[type].face || 0) + (((r % 4) + 4) % 4)) % 4;
export const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const rotatable = (type) => !['saw', 'block', 'blades', 'pendulum', 'icicle', 'bumper', 'vanish', 'hole'].includes(type);
/** Rozdělení bodáků na buňky s hroty (strana, kam míří) a pevný základ. */
export function spikeSplit(type, r) {
  const cells = pieceCells(type, r), f = faceOf(type, r), v = (c) => (f === 0 || f === 2 ? c[1] : c[0]);
  const ext = f === 0 || f === 3 ? Math.min(...cells.map(v)) : Math.max(...cells.map(v));
  return { spike: cells.filter((c) => v(c) === ext), base: cells.filter((c) => v(c) !== ext), face: f };
}
/** Rozměr (šířka, výška) rezervované oblasti kusu. */
export function pieceSize(type, r) { const c = pieceCells(type, r); return [Math.max(...c.map((q) => q[0])) + 1, Math.max(...c.map((q) => q[1])) + 1]; }

// ------------------------------------------------------------------ stage (pevná část hřiště)
// rects = [x, y, w, h, dlaždice]; spawn = střed postavy při startu (x, y spodní hrany); goal = obdélník cíle; forbid = kam se nesmí stavět.
export const STAGES = [
  { id: 'louka', name: 'Louka', theme: 'meadow', desc: 'Pastvina s děrou v zemi a schody k vlajce na kopci.',
    rects: [[0, 16, 13, 2, 1], [16, 16, 16, 2, 1], [6, 13, 4, 1, 1], [11, 10, 4, 1, 1], [16, 7, 4, 1, 1], [23, 7, 9, 3, 1]],
    spawn: [2.5, 16], goal: [28, 4, 4, 3], flag: [29.5, 7], forbid: [[0, 11, 5, 5], [24, 3, 8, 4]] },
  { id: 'hory', name: 'Hory', theme: 'snow', desc: 'Ze skály dolů po ledových stupních, pod nimi je propast.',
    rects: [[0, 5, 5, 13, 1], [8, 8, 4, 1, 2], [14, 11, 4, 1, 1], [20, 14, 4, 1, 2], [26, 15, 6, 3, 1]],
    spawn: [2.5, 5], goal: [27, 11, 5, 4], flag: [29.5, 15], forbid: [[0, 0, 5, 5], [26, 10, 6, 5]] },
  { id: 'jeskyne', name: 'Jeskyně', theme: 'cave', desc: 'Strop, podlaha a uprostřed skalní stěna, přes kterou je potřeba přelézt.',
    rects: [[0, 16, 32, 2, 1], [0, 0, 32, 2, 1], [14, 6, 4, 10, 1], [8, 13, 3, 1, 1], [11, 10, 3, 1, 1], [12, 8, 2, 1, 1], [19, 9, 3, 1, 1], [22, 12, 3, 1, 1]],
    spawn: [2.5, 16], goal: [28, 12, 4, 4], flag: [29.5, 16], forbid: [[0, 11, 5, 5], [26, 11, 6, 5]] },
  { id: 'pust', name: 'Poušť', theme: 'desert', desc: 'Pískové ostrůvky mezi propastmi, v poslední jámě je odrazovadlo.',
    rects: [[0, 15, 7, 3, 1], [10, 15, 4, 3, 1], [16, 13, 3, 5, 1], [20, 17, 3, 1, 3], [25, 10, 3, 8, 1], [29, 12, 3, 6, 1]],
    spawn: [2.5, 15], goal: [29, 8, 3, 4], flag: [30.5, 12], forbid: [[0, 10, 6, 5], [28, 6, 4, 6]] },
  { id: 'oblaka', name: 'Oblaka', theme: 'sky', desc: 'Plovoucí mraky vysoko nad zemí. Pod mezerou je odrazovadlo, které tě vystřelí zpátky.',
    rects: [[0, 11, 5, 2, 1], [7, 10, 3, 1, 1], [12, 8, 3, 1, 1], [17, 6, 4, 1, 1], [20, 14, 3, 1, 3], [24, 8, 3, 1, 2], [29, 11, 3, 3, 1]],
    spawn: [2.5, 11], goal: [29, 7, 3, 4], flag: [30.5, 11], forbid: [[0, 6, 6, 5], [28, 6, 4, 5]] },
  { id: 'les', name: 'Les', theme: 'forest', desc: 'Z mechu na pařezy, po klacích a kmenech nahoru a pak dolů k vlajce.',
    rects: [[0, 15, 6, 3, 1], [8, 13, 2, 5, 1], [12, 11, 2, 7, 1], [16, 9, 4, 1, 1], [22, 7, 2, 11, 1], [26, 11, 2, 1, 1], [29, 13, 3, 5, 1]],
    spawn: [2.5, 15], goal: [29, 9, 3, 4], flag: [30.5, 13], forbid: [[0, 10, 6, 5], [28, 8, 4, 5]] },
  { id: 'sopka', name: 'Sopka', theme: 'volcano', desc: 'Úzké kamenné stupně nad lávou, kdo spadne, shoří.',
    rects: [[0, 13, 5, 5, 1], [7, 12, 2, 1, 1], [11, 10, 2, 1, 1], [15, 12, 3, 1, 1], [20, 9, 2, 1, 1], [24, 11, 2, 1, 1], [28, 8, 4, 10, 1]],
    spawn: [2.5, 13], goal: [28, 4, 4, 4], flag: [29.5, 8], forbid: [[0, 8, 5, 5], [27, 3, 5, 5]] },
  { id: 'cukrovi', name: 'Cukroví', theme: 'candy', desc: 'Cukrová krajina: kluzká poleva, gumový trampolínový cukr a duha nad hlavou.',
    rects: [[0, 14, 6, 4, 1], [8, 12, 3, 1, 2], [13, 13, 3, 1, 3], [18, 6, 4, 1, 1], [24, 9, 3, 1, 2], [28, 12, 4, 6, 1]],
    spawn: [2.5, 14], goal: [28, 8, 4, 4], flag: [29.5, 12], forbid: [[0, 9, 6, 5], [27, 7, 5, 5]] },
  { id: 'mesic', name: 'Měsíc', theme: 'space', grav: 0.6, desc: 'Nízká gravitace: skáčeš výš a dál, ale pasti jsou stejně smrtící.',
    rects: [[0, 15, 5, 3, 1], [9, 12, 3, 1, 1], [16, 8, 3, 1, 1], [22, 12, 4, 1, 1], [28, 14, 4, 4, 1]],
    spawn: [2.5, 15], goal: [28, 10, 4, 4], flag: [29.5, 14], forbid: [[0, 10, 5, 5], [27, 9, 5, 5]] },
  { id: 'plaz', name: 'Pláž', theme: 'beach', desc: 'Pískové ostrůvky v moři s palmami, mezi nimi se nedá šlápnout.',
    rects: [[0, 14, 6, 4, 1], [8, 15, 3, 3, 1], [13, 13, 3, 5, 1], [18, 11, 3, 7, 1], [23, 13, 2, 5, 1], [27, 10, 5, 8, 1]],
    spawn: [2.5, 14], goal: [27, 6, 5, 4], flag: [29.5, 10], forbid: [[0, 9, 6, 5], [26, 5, 6, 5]] },
];
export const stageIdx = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n < STAGES.length ? n : 0; };

// ------------------------------------------------------------------ postavičky
// Každá je nakreslená vektorově (art.js); `ear` a `nose` určují tvar uší a čumáku, `spot` skvrny.
export const CHARS = [
  { name: 'Kuře', body: '#fff4d6', belly: '#ffffff', dark: '#d9b66a', acc: '#e8433c', ear: 'comb', nose: 'beak', beak: '#ff9a1f', desc: 'Rychlé a šikovné, červený hřebínek.' },
  { name: 'Kůň', body: '#b9743a', belly: '#d89a5e', dark: '#6e3f19', acc: '#3a2412', ear: 'horse', nose: 'snout', desc: 'Hnědý s hřívou.' },
  { name: 'Ovce', body: '#f4f2ee', belly: '#ffffff', dark: '#c9c4ba', acc: '#3b3836', ear: 'sheep', nose: 'sheep', desc: 'Huňatá vlna, černá hlava.' },
  { name: 'Prase', body: '#ffa8c2', belly: '#ffc9d9', dark: '#d9708f', acc: '#d9708f', ear: 'pig', nose: 'pig', desc: 'Růžové s rypáčkem.' },
  { name: 'Kráva', body: '#fbfbf7', belly: '#ffffff', dark: '#c8c8c0', acc: '#26242a', ear: 'cow', nose: 'cow', spot: true, desc: 'Strakatá s růžovým čumákem.' },
  { name: 'Králík', body: '#c8ccd6', belly: '#eef0f6', dark: '#8c92a3', acc: '#ff9ab5', ear: 'rabbit', nose: 'rabbit', desc: 'Dlouhé uši, skáče nejradši.' },
  { name: 'Kachna', body: '#ffd53d', belly: '#ffe98a', dark: '#c99a0b', acc: '#ff8a1f', ear: 'tuft', nose: 'duck', beak: '#ff8a1f', desc: 'Žlutá s oranžovým zobáčkem.' },
  { name: 'Koza', body: '#d9d0c2', belly: '#f1ebe0', dark: '#9c917f', acc: '#6a5a46', ear: 'goat', nose: 'goat', desc: 'Rohy a bradka.' },
];
// Kosmetika (obchod za coiny Hopíku): čepice, brýle, boty, záda. U každé kategorie si hráč vybere originál skinu, nebo vlastní koupenou věc.
// Uložené je `own` (pole 'kategorie:id') a `eq` (kategorie -> '' originál skinu | '-' bez čepice (jen čepice) | id věci). Vzhled kreslí klient (cosm.js a art.js).
export const COSM_CATS = [
  { id: 'hat', name: 'Čepice', orig: 'Originál skinu', none: 'Bez čepice' },
  { id: 'glasses', name: 'Brýle', orig: 'Žádné' },
  { id: 'boots', name: 'Boty', orig: 'Originál skinu' },
  { id: 'back', name: 'Záda', orig: 'Nic' },
];
export const COSM = {
  hat: [
    { id: 'beanie', name: 'Kulich', price: 40 }, { id: 'backcap', name: 'Kšiltovka', price: 50 }, { id: 'beret', name: 'Baret', price: 60 },
    { id: 'straw', name: 'Slaměňák', price: 70 }, { id: 'hardhat', name: 'Stavební helma', price: 80 }, { id: 'sombrero', name: 'Sombrero', price: 90 },
    { id: 'cat', name: 'Kočičí uši', price: 100 }, { id: 'bunny', name: 'Králičí uši', price: 100 }, { id: 'tophat', name: 'Cylindr', price: 120 },
    { id: 'propeller', name: 'Vrtulka', price: 130 }, { id: 'horns', name: 'Ďábelské rohy', price: 150 }, { id: 'halo', name: 'Svatozář', price: 200 },
  ],
  glasses: [
    { id: 'round', name: 'Kulaté', price: 40 }, { id: 'nerd', name: 'Hranaté', price: 50 }, { id: 'shades', name: 'Sluneční', price: 60 },
    { id: 'eyepatch', name: 'Pirátská páska', price: 70 }, { id: 'd3', name: '3D brýle', price: 80 }, { id: 'aviator', name: 'Pilotky', price: 90 },
    { id: 'mask', name: 'Maska', price: 100 }, { id: 'heart', name: 'Srdíčka', price: 110 }, { id: 'star', name: 'Hvězdy', price: 110 },
    { id: 'monocle', name: 'Monokl', price: 120 }, { id: 'goggles', name: 'Lyžařské', price: 140 }, { id: 'visor', name: 'Cyber visor', price: 220 },
  ],
  boots: [
    { id: 'sneakR', name: 'Červené tenisky', price: 50 }, { id: 'sneakB', name: 'Modré tenisky', price: 50 }, { id: 'rain', name: 'Gumáky', price: 60 },
    { id: 'slipper', name: 'Papuče', price: 70 }, { id: 'neon', name: 'Neonové tenisky', price: 90 }, { id: 'cowboy', name: 'Kovbojky', price: 110 },
    { id: 'ninja', name: 'Ninja tabi', price: 120 }, { id: 'roller', name: 'Brusle', price: 140 }, { id: 'rainbow', name: 'Duhové boty', price: 180 },
    { id: 'rocket', name: 'Raketové boty', price: 220 }, { id: 'gold', name: 'Zlaté boty', price: 250 }, { id: 'winged', name: 'Okřídlené boty', price: 260 },
  ],
  back: [
    { id: 'pack', name: 'Batoh', price: 60 }, { id: 'fox', name: 'Liščí ocas', price: 70 }, { id: 'cape', name: 'Plášť', price: 80 },
    { id: 'quiver', name: 'Toulec', price: 90 }, { id: 'shell', name: 'Želví krunýř', price: 100 }, { id: 'surf', name: 'Surf', price: 110 },
    { id: 'guitar', name: 'Kytara', price: 120 }, { id: 'royal', name: 'Královský plášť', price: 200 }, { id: 'fly', name: 'Motýlí křídla', price: 220 },
    { id: 'jet', name: 'Jetpack', price: 260 }, { id: 'bat', name: 'Netopýří křídla', price: 280 }, { id: 'angel', name: 'Andělská křídla', price: 300 },
  ],
};
export const COSM_SLOTS = COSM_CATS.map((c) => c.id);
export const cosmItem = (cat, id) => (COSM[cat] || []).find((x) => x.id === id) || null;
/** Výběr po kategoriích očištěný od neplatného a nekoupeného (`own` = Set 'kategorie:id'). */
export function cleanEq(eq, own) {
  const o = {};
  for (const c of COSM_SLOTS) { const v = eq && typeof eq[c] === 'string' ? eq[c] : ''; o[c] = v === '' || (v === '-' && c === 'hat') || (cosmItem(c, v) && own.has(c + ':' + v)) ? v : ''; }
  return o;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const charIdx = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n < CHARS.length ? n : -1; };
export const idx = (x, y) => y * COLS + x;
