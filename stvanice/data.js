// Vesmírná štvanice – data hry: barvy, karty, postavy, role.
// Čtyři vesmírné „barvy“ (symboly) nahrazují klasické ♥ ♦ ♠ ♣. Mechanicky platí:
//   Nova = srdce, Kometa = káry (červené)  |  Pulsar = piky, Asteroid = kříže (černé)

export const SUITS = {
  nova: { name: 'Nova', red: true },
  kometa: { name: 'Kometa', red: true },
  pulsar: { name: 'Pulsar', red: false },
  asteroid: { name: 'Asteroid', red: false },
};
export const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankLabel = (r) => RANK_LABEL[r] || String(r);

// kind: 'instant' = zahraje se do odhazovacího balíčku, 'equip' = vyloží se před sebe, 'status' = stavová karta (cela, vynález zkázy)
export const TYPES = {
  strela:        { name: 'Vesmírná střela', kind: 'instant', count: 25, text: 'Ubere jednomu hráči na dostřel 1 život. Ukončuje tvůj tah (zahraj ji jako poslední).' },
  stit:          { name: 'Energický štít', kind: 'instant', count: 12, text: 'Zahraješ ho, když na tebe někdo vystřelí – střela ti život neubere.' },
  pilulka:       { name: 'Pilulka', kind: 'instant', count: 6, text: 'Vyléčí ti 1 život (nad počáteční maximum ne). Zachrání tě i těsně před smrtí.' },
  foukacka:      { name: 'Foukačka', kind: 'instant', count: 2, text: 'Vyléčí 1 život hráči podle tvého výběru (i tobě).' },
  varovny:       { name: 'Varovný výstřel', kind: 'instant', count: 4, text: 'Vezmeš si do ruky kartu hráče na vzdálenost 1: náhodnou z ruky, nebo vyloženou.' },
  dezintegrator: { name: 'Dezintegrátor', kind: 'instant', count: 4, text: 'Libovolnému hráči zničíš kartu: náhodnou z ruky, nebo vyloženou (kterou vidíš).' },
  duel:          { name: 'Duel', kind: 'instant', count: 3, text: 'Vyzvaný odhazuje Vesmírné střely, pak ty, a tak se střídáte. Kdo nemůže, ztrácí 1 život.' },
  zaloha:        { name: 'Bandití záloha', kind: 'instant', count: 2, text: 'Všichni ostatní musí odhodit Vesmírnou střelu, jinak ztratí 1 život.' },
  prepadeni:     { name: 'Laserové přepadení', kind: 'instant', count: 1, text: 'Všichni ostatní musí odhodit Energický štít, jinak ztratí 1 život.' },
  stanice:       { name: 'Vesmírná stanice', kind: 'instant', count: 2, text: 'Otočí se tolik karet z balíčku, kolik je hráčů. Začínáš ty a každý si jednu vybere.' },
  sklad:         { name: 'Sklad s municí', kind: 'instant', count: 2, text: 'Líznes 2 karty.' },
  cerna_dira:    { name: 'Černá díra', kind: 'instant', count: 1, text: 'Líznes 3 karty.' },
  kantyna:       { name: 'Kosmická kantýna', kind: 'instant', count: 1, text: 'Všem hráčům se vyléčí 1 život.' },

  teleport:      { name: 'Teleportér', kind: 'equip', count: 2, text: 'Ostatní jsou k tobě o 1 dál (platí i pro Varovný výstřel).' },
  harpuna:       { name: 'Harpuna', kind: 'equip', count: 1, text: 'Ty jsi ke všem o 1 blíž.' },
  opasek:        { name: 'Opasek poslední záchrany', kind: 'equip', count: 2, text: 'Když na tebe někdo střelí, líznes kartu: je-li Nova, střela tě minula.' },
  brokovnice:    { name: 'Brokovnice', kind: 'equip', count: 3, range: 2, text: 'Zbraň: dostřel 2.' },
  kanon:         { name: 'Kanon', kind: 'equip', count: 1, range: 3, text: 'Zbraň: dostřel 3.' },
  puska:         { name: 'Laserová puška', kind: 'equip', count: 1, range: 4, text: 'Zbraň: dostřel 4.' },
  odstrelovaci:  { name: 'Odstřelovací laserovka', kind: 'equip', count: 1, range: 5, text: 'Zbraň: dostřel 5.' },
  kulomet:       { name: 'Krátký kulomet', kind: 'equip', count: 2, range: 1, text: 'Zbraň: libovolně mnoho Vesmírných střel za tah, ale jen na vzdálenost 1.' },

  cela:          { name: 'Vesmírná cela', kind: 'status', count: 3, text: 'Položíš ji před soupeře (ne Kapitána): vynechá 2 své tahy. Uteče hned, když na začátku tahu odhodí Vesmírnou střelu.' },
  vynalez:       { name: 'Vynález zkázy', kind: 'status', count: 1, text: 'Vyložíš ho před sebe. Na začátku každého tvého tahu se líznou karta: Pulsar 2–9 = ztratíš 3 životy, jinak vynález putuje dál. Zničí ho Varovný výstřel nebo Dezintegrátor.' },
};
export const WEAPONS = ['brokovnice', 'kanon', 'puska', 'odstrelovaci', 'kulomet'];
export const isWeapon = (t) => WEAPONS.includes(t);

/** Balíček o 82 kartách. Každá karta má pevný druh a náhodnou barvu + hodnotu (stejné rozložení jako klasických 52 karet). */
export function buildDeck(rng = Math.random) {
  const pairs = [];
  for (const s of Object.keys(SUITS)) for (let r = 2; r <= 14; r++) pairs.push([s, r]);
  const shufflePairs = () => { const a = pairs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let pool = [];
  const cards = [];
  let id = 0;
  for (const [type, t] of Object.entries(TYPES)) {
    for (let i = 0; i < t.count; i++) {
      if (!pool.length) pool = shufflePairs();
      const [suit, rank] = pool.pop();
      cards.push({ id: id++, type, suit, rank });
    }
  }
  return cards;
}

export const ROLES = {
  kapitan:  { name: 'Lodní kapitán', short: 'Kapitán', text: 'Role známá všem. Má o 1 maximální život navíc. Přežij a zničíš všechny bandity i Nájemného zabijáka.' },
  ruka:     { name: 'Kapitánova pravá ruka', short: 'Pravá ruka', text: 'Chraň Kapitána za každou cenu, zlikviduj bandity a Nájemného zabijáka. Nestřílej na druhou pravou ruku.' },
  bandita:  { name: 'Vesmírný bandita', short: 'Bandita', text: 'Zničte Kapitána. Napřed pravé ruce, pak jeho samotného. Nestřílej do druhého bandity. Pozor: zabije-li Kapitána Sebevrah, vyhrává on.' },
  zabijak:  { name: 'Nájemný zabiják', short: 'Zabiják', text: 'Zpočátku braň Kapitána jako pravá ruka, později zlikviduj všechny. Kapitána si nech na konec – vyhraješ jen jako poslední živý.' },
  sebevrah: { name: 'Sebevrah', short: 'Sebevrah', text: 'Chceš co nejrychleji ukončit hru – vyhraješ, když ji ukončí tvůj vlastní smrtící zásah (nejlépe zabitím Kapitána).' },
  silenec:  { name: 'Pomatený šílenec', short: 'Šílenec', text: 'Střílej pomateně na kohokoli. Vyhraješ, když svými kartami ostatním ubereš dohromady 10 životů.' },
};
export const SILENEC_GOAL = 10;

/** Sestava rolí pro n hráčů. Vždy: Kapitán, bandita, Zabiják a jedna z rolí Sebevrah / Šílenec (náhodně). Další hráči přidávají zbytek. */
export function roleSet(n, rng = Math.random) {
  const x = rng() < 0.5 ? 'sebevrah' : 'silenec';
  const y = x === 'sebevrah' ? 'silenec' : 'sebevrah';
  const base = ['kapitan', 'bandita', 'zabijak', x];
  if (n >= 5) base.push('ruka');
  if (n >= 6) base.push('bandita');
  if (n >= 7) base.push('ruka');
  if (n >= 8) base.push(y);
  return base;
}
/** Co se o sestavě ví předem (bot / hráč): pro dané n počty jistých rolí; Sebevrah a Šílenec jsou 0,5 (do 7 hráčů je přítomen jen jeden z nich). */
export function roleOdds(n) {
  const o = { kapitan: 1, bandita: n >= 6 ? 2 : 1, zabijak: 1, ruka: n >= 7 ? 2 : n >= 5 ? 1 : 0, sebevrah: n >= 8 ? 1 : 0.5, silenec: n >= 8 ? 1 : 0.5 };
  return o;
}
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 8;

export const CHARS = [
  { id: 'blackhole', name: 'Frankie Blackhole', lives: 4, text: 'Můžeš zahrát libovolný počet karet Vesmírná střela.' },
  { id: 'mjohnson', name: 'Michael Johnson', lives: 4, text: 'Vesmírnou střelu můžeš hrát místo Energického štítu a naopak.' },
  { id: 'mat', name: 'Mat Jordan', lives: 4, text: 'Na jeho Vesmírnou střelu potřebuješ 2 Energické štíty.' },
  { id: 'jjohnson', name: 'Jack Johnson', lives: 4, text: 'Pokaždé, když lížeš kartu, vezmeš si vrchní dvě a jednu z nich si vybereš (druhá jde do odhozu).' },
  { id: 'jjackson', name: 'John Jackson', lives: 4, text: 'Druhou lízanou kartu ukážeš. Je-li Nova nebo Kometa, líznes si ještě jednu.' },
  { id: 'fwild', name: 'Frankie Wild', lives: 4, text: 'Za 2 odhozené karty si můžeš vrátit 1 život.' },
  { id: 'underpost', name: 'John Underpost', lives: 4, text: 'Místo lízání se podíváš na vrchní tři karty a vybereš si dvě (třetí zůstane nahoře).' },
  { id: 'doe', name: 'John Doe', lives: 4, text: 'Když tě zasáhne Vesmírná střela, líznes kartu: je-li Nova, střela tě minula.' },
  { id: 'blackjack', name: 'Black Jack', lives: 4, text: 'Kdykoli je hráč vyřazen, vezmeš si jeho karty z ruky a jednu z vyložených (ostatní se zahodí) – místo zabijáka.' },
  { id: 'cassidy', name: 'George Cassidy', lives: 4, text: 'První kartu si můžeš vzít z vrchu odhazovacího balíčku.' },
  { id: 'acecart', name: 'Jack Acecart', lives: 4, text: 'První kartu si můžeš vzít z ruky libovolného hráče.' },
  { id: 'trench', name: 'Oliver Trench', lives: 4, text: 'Kdykoli jsi zasažen (a přežiješ), líznes si kartu.' },
  { id: 'lafayette', name: 'Noah Lafayette', lives: 4, text: 'Jakmile nemáš žádnou kartu v ruce, jednu si líznes.' },
  { id: 'kriko', name: 'El Kriko', lives: 4, text: 'Pokaždé, když tě zasáhne hráč, vezmeš mu náhodnou kartu z ruky.' },
  { id: 'trash', name: 'Olivia Trash', lives: 4, text: 'Jsi imunní vůči Vesmírné cele i Vynálezu zkázy (ten rovnou pošleš dál).' },
  { id: 'bench', name: 'Amelia Bench', lives: 3, text: 'Můžeš mít v ruce o 2 karty víc, než máš životů.' },
  { id: 'belt', name: 'Isabella Belt', lives: 4, text: 'Můžeš mít před sebou vyloženou jednu kartu navíc.' },
  { id: 'put', name: 'Lily Put', lives: 3, text: 'Jednou za hru: pokud bys měla zemřít, vyléčíš si 2 životy a pokračuješ.' },
  { id: 'jurassic', name: 'Jessica Jurassic', lives: 3, text: 'První kartu si můžeš vzít z vyložených karet libovolného hráče.' },
];
export const charById = (id) => CHARS.find((c) => c.id === id);
