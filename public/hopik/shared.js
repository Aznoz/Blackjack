// HOPÍK – sdílené definice (stejný soubor je i v public/hopik/, test hlídá shodu): rozměry hřiště, kusy (plošiny a pasti), stage, postavičky, body.
// Jednotka je jedno políčko (1 × 1); hřiště má 32 × 18 políček. Fyzika je v phys.js (také sdílená).
export const COLS = 32, ROWS = 18;
export const TPS = 30, DT = 1 / TPS;                 // 30 tiků za sekundu
export const T = { EMPTY: 0, SOLID: 1, ICE: 2, BOUNCE: 3, CRUMBLE: 4, DEVICE: 5 };   // dlaždice; 1–5 jsou pevné
export const WIN_POINTS = 50, MAX_ROUNDS = 12;       // zápas: kdo první dosáhne 50 bodů (po kole), nejvýš 12 kol
export const PTS = { finish: 10, first: 5, solo: 10, kill: 2, killMax: 6 };
export const TIME = { pick: 15, place: 25, reveal: 1.5, count: 3, run: 30, hurry: 10, score: 6 };   // sekundy jednotlivých fází
export const MAX_PLAYERS = 4;

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
  spikes: { name: 'Bodáky', desc: 'Tři bodáky, dotek znamená konec.', kind: 'hazard', cells: [[0, 0], [1, 0], [2, 0]], face: 0, w: 9 },
  saw: { name: 'Pila', desc: 'Točivá pila 2 × 2, dotek znamená konec.', kind: 'hazard', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], w: 7 },
  cannon: { name: 'Dělo', desc: 'Každé dvě vteřiny vystřelí kulku.', kind: 'hazard', tile: 5, cells: [[0, 0]], face: 1, w: 6 },
  flame: { name: 'Plamenomet', desc: 'Střídavě chrlí oheň do vzdálenosti 3 políček.', kind: 'hazard', tile: 5, cells: [[0, 0]], face: 0, w: 5 },
};
export const PIECE_IDS = Object.keys(PIECES);
export const MOVER_AMP = 3, MOVER_PERIOD = 150;        // pojízdná plošina: rozkmit v políčkách a perioda v ticcích
export const CANNON_PERIOD = 60, BULLET_SPEED = 9, BULLET_R = 0.28;
export const FLAME_PERIOD = 90, FLAME_ON = 30, FLAME_LEN = 3;
export const CRUMBLE_T = 14;                           // tiků od došlápnutí do propadnutí

/** Buňky kusu po otočení o r × 90° (normalizované, min x = min y = 0). Pojízdná plošina vrací celý rezervovaný pás. */
export function pieceCells(type, r) {
  const P = PIECES[type]; r = ((r % 4) + 4) % 4;
  if (type === 'mover') {
    const n = 3 + 2 * MOVER_AMP, out = [];
    if (r % 2 === 0) for (let i = 0; i < n; i++) out.push([i, 0]); else for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) out.push([j, i]);
    return out;
  }
  let c = P.cells.map(([x, y]) => [x, y]);
  for (let k = 0; k < r; k++) c = c.map(([x, y]) => [-y, x]);
  const mx = Math.min(...c.map((q) => q[0])), my = Math.min(...c.map((q) => q[1]));
  return c.map(([x, y]) => [x - mx, y - my]);
}
/** Směr pasti po otočení (0 nahoru, 1 doprava, 2 dolů, 3 doleva). */
export const faceOf = (type, r) => ((PIECES[type].face || 0) + (((r % 4) + 4) % 4)) % 4;
export const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const rotatable = (type) => type !== 'saw' && type !== 'block';
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
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const charIdx = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n < CHARS.length ? n : -1; };
export const idx = (x, y) => y * COLS + x;
