// ARÉNA VĚŽÍ – sdílené definice (stejný soubor je i v public/arena/, test hlídá shodu): rozměry arény, věže, karty, úrovně a ceny.
// Souřadnice: šířka 360 × výška 640, hráč 0 má základnu dole, hráč 1 nahoře; řeka uprostřed s jedním mostem.
export const W = 360, H = 640, MID = 320;
export const RIVER = { y0: 306, y1: 334 };      // pás řeky (pozemní jednotky se v něm drží mostu)
export const BRIDGE = { x0: 130, x1: 230 };      // most přes řeku (jedna lajna)
export const DT = 0.05;                          // jeden tik simulace (20× za sekundu)
export const MATCH_S = 180, OT_S = 60, DOUBLE_AT = 120;   // 3 minuty, poslední minuta dvojitý elixír, pak 60 s prodloužení (první zničená věž vyhrává)
export const ELIXIR_MAX = 10, ELIXIR_START = 5, ELIXIR_SEC = 2.8;   // elixír: 1 za 2,8 s (od 2:00 dvojnásobně rychle)
export const DECK_SIZE = 9, HAND_SIZE = 3, MAX_CARD_LEVEL = 10, MAX_LEVEL = 20;
export const DEPLOY_S = 1;                       // po položení jednotka 1 s „nasazuje“ (stojí)

/** Věže každého hráče: hlavní vzadu uprostřed, menší strážní věž před ní. `d` = vzdálenost od okraje arény. */
export const TOWER = {
  main:  { kind: 'main',  name: 'Hlavní věž',  hp: 3600, dmg: 72, as: 0.95, range: 125, r: 26, d: 46 },
  front: { kind: 'front', name: 'Strážní věž', hp: 2100, dmg: 60, as: 0.85, range: 118, r: 20, d: 150 },
};

/**
 * Karty. cost = elixír, n = kolik jednotek se položí, tt = koho jednotka napadá ('ground' jen pozemní, 'all' i vzdušné, 'building' jen věže),
 * splash = poloměr plošného zásahu, fly = létá (ignoruje řeku), lvl = od jaké úrovně hráče je karta odemčená.
 */
export const CARDS = {
  soldier:   { id: 'soldier',   name: 'Vojín',        icon: '🗡️', cost: 2, lvl: 1,  n: 1, hp: 230, dmg: 40,  as: 0.9,  speed: 54, range: 16, r: 8,  tt: 'ground', desc: 'Levný pěšák. Rychle se nasazuje a dobře drží linii.' },
  archer:    { id: 'archer',    name: 'Střelkyně',    icon: '🏹', cost: 3, lvl: 1,  n: 2, hp: 105, dmg: 27,  as: 0.9,  speed: 52, range: 88, r: 7,  tt: 'all',    desc: 'Dvě střelkyně z dálky. Zasáhnou i vzdušné jednotky.' },
  knight:    { id: 'knight',    name: 'Rytíř',        icon: '🛡️', cost: 3, lvl: 1,  n: 1, hp: 650, dmg: 78,  as: 1.1,  speed: 46, range: 18, r: 10, tt: 'ground', desc: 'Pevný bojovník na blízko. Vydrží hodně a dobře tlačí.' },
  skeletons: { id: 'skeletons', name: 'Kostlivci',    icon: '💀', cost: 2, lvl: 1,  n: 3, hp: 62,  dmg: 22,  as: 0.75, speed: 80, range: 14, r: 6,  tt: 'ground', desc: 'Tři rychlí kostlivci. Dobří proti jedné silné jednotce.' },
  fireball:  { id: 'fireball',  name: 'Ohnivá koule', icon: '🔥', cost: 4, lvl: 1,  kind: 'spell', hp: 0, dmg: 290, splash: 62, tt: 'all', towerMul: 0.4, delay: 0.6, desc: 'Kouzlo: výbuch na vybraném místě. Věže berou jen 40 %.' },
  golem:     { id: 'golem',     name: 'Golem',        icon: '🗿', cost: 6, lvl: 1,  n: 1, hp: 1500, dmg: 115, as: 1.6, speed: 30, range: 20, r: 14, tt: 'building', desc: 'Pomalý obr, který jde rovnou na věže. Za ním tlač další jednotky.' },
  wizard:    { id: 'wizard',    name: 'Čaroděj',      icon: '🧙', cost: 4, lvl: 1,  n: 1, hp: 270, dmg: 88,  as: 1.4,  speed: 50, range: 92, r: 8,  tt: 'all',    splash: 30, desc: 'Střílí ohnivé koule s plošným zásahem, i na vzdušné jednotky.' },
  bats:      { id: 'bats',      name: 'Netopýři',     icon: '🦇', cost: 3, lvl: 1,  n: 4, hp: 52,  dmg: 21,  as: 0.9,  speed: 98, range: 14, r: 6,  tt: 'all',    fly: true, desc: 'Čtyři rychlí létající netopýři. Pozemní bojovníci na ně nedosáhnou.' },
  musketeer: { id: 'musketeer', name: 'Mušketýr',     icon: '🔫', cost: 4, lvl: 1,  n: 1, hp: 340, dmg: 112, as: 1.0,  speed: 50, range: 104, r: 8, tt: 'all',    desc: 'Silná střelba z dálky na pozemní i vzdušné cíle.' },
  dragon:    { id: 'dragon',    name: 'Dráček',       icon: '🐉', cost: 4, lvl: 3,  n: 1, hp: 390, dmg: 62,  as: 1.3,  speed: 62, range: 58, r: 10, tt: 'all',    fly: true, splash: 24, desc: 'Létající, plošný zásah. Dobrý proti rojům.' },
  bomber:    { id: 'bomber',    name: 'Sapér',        icon: '💣', cost: 3, lvl: 6,  n: 1, hp: 210, dmg: 500, as: 1.0,  speed: 98, range: 4,  r: 7,  tt: 'building', kind: 'bomber', splash: 38, desc: 'Rychle doběhne k věži a vybuchne. Na jednotky nezaútočí.' },
  berserker: { id: 'berserker', name: 'Berserkři',    icon: '🪓', cost: 6, lvl: 9,  n: 3, hp: 390, dmg: 64,  as: 0.75,  speed: 58, range: 16, r: 9,  tt: 'ground', desc: 'Tři zuřiví válečníci. Drtí cokoli na zemi.' },
  priest:    { id: 'priest',    name: 'Kněz',         icon: '⛑️', cost: 4, lvl: 12, n: 1, hp: 310, dmg: 0,   as: 1.2,  speed: 48, range: 40, r: 8,  tt: 'ground', kind: 'healer', heal: 70, healR: 80, desc: 'Nebojuje, ale doprovází spojence a léčí je.' },
  farm:      { id: 'farm',      name: 'Elixírová farma', icon: '🧪', cost: 5, lvl: 1, n: 1, hp: 600, dmg: 0, as: 4, speed: 0, range: 0, r: 11, tt: 'ground', kind: 'farm', gen: 1, desc: 'Budova: po položení každé 4 s přidá 1 elixír. Soupeř ji ale může zničit.' },
};
export const CARD_ORDER = ['soldier', 'skeletons', 'archer', 'knight', 'bats', 'fireball', 'musketeer', 'wizard', 'golem', 'farm', 'dragon', 'bomber', 'berserker', 'priest'];
export const STARTER = ['soldier', 'archer', 'knight', 'skeletons', 'fireball', 'golem', 'wizard', 'bats', 'musketeer'];

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Úroveň karty zvyšuje životy i poškození (a léčení) o 10 % za úroveň. */
export const lvMul = (l) => 1 + 0.1 * (clamp(Math.floor(Number(l) || 1), 1, MAX_CARD_LEVEL) - 1);
/** Cena vylepšení karty z úrovně `lv` na `lv + 1` (v coinech arény). */
export const upgradeCost = (id, lv) => { const c = CARDS[id]; return c ? Math.round(((c.cost + 2) * 16 * Math.pow(1.42, clamp(lv, 1, MAX_CARD_LEVEL) - 1)) / 10) * 10 : 0; };

export const xpFor = (lvl) => (lvl <= 1 ? 0 : Math.round(80 * Math.pow(lvl - 1, 1.5)));
export function levelOf(xp) { let l = 1; while (l < MAX_LEVEL && xp >= xpFor(l + 1)) l++; return l; }
export const unlocked = (id, plvl) => !!CARDS[id] && plvl >= CARDS[id].lvl;
