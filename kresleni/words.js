// Slovník pro KRESLENÍ A HÁDÁNÍ. Slova jsou rozdělená podle toho, jak těžko se kreslí.
// Slova mohou mít mezeru (např. „horská dráha“); hádá se bez ohledu na diakritiku a velikost písmen.

const RAW = {
  lehka: `slunce měsíc hvězda strom dům auto kolo květina srdce kočka pes ryba pták jablko banán hruška hrnek židle stůl postel klíč kniha
    balón oko ucho nos ruka noha ponožka klobouk brýle hodiny lampa dveře okno most loď letadlo vlak mrak déšť sníh duha hora řeka plot
    žába had slon žirafa myš kráva prase kuře vejce sýr pizza zmrzlina dort bonbon deštník taška boty košile kalhoty čepice rukavice
    kámen list tulipán houba mrkev rajče okurka cibule citron třešně jahoda hrozny ananas meloun auto bota prsten koruna meč štít
    svíčka dárek zvonek telefon nůžky lžíce vidlička nůž talíř sklenice láhev kbelík žárovka tužka guma pravítko míč raketa kolotoč
    ježek včela motýl pavouk slimák kachna husa sova žralok krab`,
  normalni: `sněhulák vodopád pyramida klavír kytara housle mikrofon počítač televize ledvina vrtulník ponorka maják pavučina zámek hrad
    kostel věž tunel semafor popelnice lavička schody žebřík kladivo pila šroubovák kolečko trakař vozík traktor bagr hasičské auto
    sanitka motorka koloběžka skateboard brusle lyže snowboard raketa kosmonaut robot drak čaroděj princezna rytíř pirát kapitán
    klaun kouzelník cirkus stan oheň táborák spacák batoh mapa kompas lupa dalekohled mikroskop teploměr injekce obvaz lékárna
    nemocnice škola tabule učitel žák batoh peněženka kabelka sluneční brýle plavky ručník vana sprcha zubní kartáček mýdlo zrcadlo
    skříň lednička pračka sporák trouba toustovač konvice hrnec pánev struhadlo palačinka hamburger hranolky párek polévka špagety
    chobotnice medúza delfín velryba tučňák lenochod klokan velbloud nosorožec hroch krokodýl želva ještěrka veverka netopýr`,
  tezka: `knihovna tornádo horská dráha čarodějnice astronaut akvárium labyrint vysavač mikrovlnka sopka větrný mlýn dálkové ovládání
    sluneční hodiny ping pong kolotoč lanovka letiště nádraží přístav hřbitov muzeum divadlo koncert diskotéka karneval
    narozeniny svatba vánoční strom velikonoční vajíčko dušičky silvestr ohňostroj kouzelná hůlka létající koberec mimozemšťan
    jednorožec drak se sedmi hlavami strašidlo upír vlkodlak mumie kostlivec zombie duch hřebík šroub matice ozubené kolo
    elektrárna větrná elektrárna solární panel baterie zásuvka vypínač kabel router internet notebook klávesnice počítačová myš
    sluchátka reproduktor rádio gramofon magnetofon fotoaparát kamera film popcorn kino dalekohled periskop satelit raketoplán
    vesmírná stanice černá díra kometa galaxie zatmění slunce rovník poledník kontinent ostrov poloostrov záliv průliv
    vodovod kanalizace komín střecha krb balkon terasa bazén trampolína houpačka prolézačka pískoviště skluzavka
    dirigent orchestr balet akrobat žonglér krotitel lvů provazochodec hasič policista záchranář horolezec potápěč`,
};

export const LEVELS = ['lehka', 'normalni', 'tezka', 'mix'];
export const LEVEL_NAMES = { lehka: 'Lehká', normalni: 'Střední', tezka: 'Těžká', mix: 'Mix' };

/** Bez diakritiky, malými písmeny a jednou mezerou: „Horská  Dráha“ → „horska draha“. */
export const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Řádky obsahují slova oddělená mezerou; víceslovné výrazy se zadávají s podtržítkem (horska_draha) nebo z tohoto seznamu. */
const PHRASES = [
  'horská dráha', 'větrný mlýn', 'dálkové ovládání', 'sluneční hodiny', 'ping pong', 'vánoční strom', 'velikonoční vajíčko', 'kouzelná hůlka',
  'létající koberec', 'drak se sedmi hlavami', 'větrná elektrárna', 'solární panel', 'počítačová myš', 'vesmírná stanice', 'černá díra',
  'hasičské auto', 'sluneční brýle', 'zubní kartáček', 'krotitel lvů',
];

function parse(text) {
  let s = ` ${text.replace(/\s+/g, ' ')} `;
  const out = [];
  for (const ph of PHRASES) {
    if (s.includes(` ${ph} `)) { out.push(ph); s = s.replace(` ${ph} `, ' '); }
  }
  // zbylé výrazy: „sedmi hlavami“ apod. už jsou pokryté; ostatní jsou jednoslovné
  for (const w of s.split(' ').filter(Boolean)) out.push(w);
  return out;
}

const seen = new Set();
export const POOLS = {};
for (const lv of ['lehka', 'normalni', 'tezka']) {
  POOLS[lv] = [];
  for (const w of parse(RAW[lv])) {
    const f = fold(w);
    if (!f || seen.has(f) || !/^[a-z]+( [a-z]+)*$/.test(f)) continue;
    seen.add(f);
    POOLS[lv].push({ w: w.toLowerCase(), f, lv });
  }
}
POOLS.mix = [...POOLS.lehka, ...POOLS.normalni, ...POOLS.tezka];
export const ALL = POOLS.mix;
