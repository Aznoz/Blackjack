// MECHA ARÉNA – sdílená data a pravidla (server i prohlížeč): sloty robota, katalog karet, vlastnosti sestavy, bedny a jejich kořist.
// Žádné náhodné jevy tu nejsou (náhoda se předává zvenku jako rng), aby to šlo stejně spočítat na serveru i v klientovi.

export const SLOTS = ['head', 'shL', 'shR', 'chest', 'hdL', 'hdR', 'lgL', 'lgR', 'drone'];
export const SLOT_KIND = { head: 'head', shL: 'shoulder', shR: 'shoulder', chest: 'chest', hdL: 'hand', hdR: 'hand', lgL: 'leg', lgR: 'leg', drone: 'drone' };
export const SLOT_NAME = { head: 'Hlava', shL: 'Levé rameno', shR: 'Pravé rameno', chest: 'Hruď', hdL: 'Levá ruka', hdR: 'Pravá ruka', lgL: 'Levá noha', lgR: 'Pravá noha', drone: 'Dron' };
export const KIND_NAME = { head: 'Hlava', shoulder: 'Rameno', chest: 'Hruď', hand: 'Ruka', leg: 'Noha', drone: 'Dron' };
export const RARITY = [
  { id: 'common', name: 'Běžná', color: '#9aa7b5', mul: 1 }, { id: 'uncommon', name: 'Neobvyklá', color: '#5ed17a', mul: 2.2 }, { id: 'rare', name: 'Vzácná', color: '#4aa8ff', mul: 5 },
  { id: 'epic', name: 'Epická', color: '#b36bff', mul: 11 }, { id: 'legend', name: 'Legendární', color: '#ffb52e', mul: 26 },
];
export const MAX_LV = 5;
export const LV_NEED = [0, 2, 4, 8, 16];            // kolik dalších kopií karty stojí posun z úrovně L na L+1 (index = L-1 → LV_NEED[L])
export const levelMul = (lv) => 1 + 0.1 * (Math.max(1, Math.min(MAX_LV, lv | 0)) - 1);
export const TYPES = { kin: { name: 'Kinetické', short: 'KIN', color: '#ffcf5a' }, nrg: { name: 'Energetické', short: 'ENE', color: '#5ee0ff' }, exp: { name: 'Výbušné', short: 'EXP', color: '#ff7a4a' } };

export const BASE = { hp: 150, ap: 2, en: 10, regen: 4, cap: 70, acc: 72, crit: 5, evade: 0, spd: 1, jmp: 2 };   // výchozí robot: jen dva tahové body
export const MAX_AP = 6;
export const ARENA = { len: 10, startA: 2, startB: 7 };

const T = (a) => a;   // jen čitelnost: pole po pěti úrovních (Mk I … Mk V)
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
// ---------------------------------------------------------------- rodiny karet
// w = váha, st = vlastnosti po úrovních. Zbraně: dmg, hits, acc, rng [min,max], ap, en, type, crit, fx. Moduly: hp, res, ap, en, regen, shield, shieldRegen, acc, crit, evade, spd, jmp, cap, rep, rngb.
const WEAPONS_HAND = [
  { fam: 'mg', name: 'Kulomet', w: 4, type: 'kin', ap: 1, en: [2, 2, 3, 3, 3], acc: 70, rng: [1, 6], hits: [3, 3, 4, 4, 5], dmg: [5, 6, 7, 8, 10], desc: 'Dávka rychlých ran, spolehlivý do všeho.' },
  { fam: 'plas', name: 'Plazmová pistole', w: 3, type: 'nrg', ap: 1, en: [3, 3, 3, 4, 4], acc: 80, rng: [1, 5], hits: 1, dmg: [11, 14, 18, 23, 30], desc: 'Jediný silný energetický výstřel.' },
  { fam: 'laser', name: 'Laserová puška', w: 5, type: 'nrg', ap: 1, en: [4, 4, 5, 5, 5], acc: 92, rng: [2, 8], hits: 1, dmg: [13, 17, 22, 29, 38], desc: 'Přesná a dalekonosná.' },
  { fam: 'rail', name: 'Railgun', w: 8, type: 'kin', ap: 2, en: [6, 6, 7, 7, 8], acc: 82, rng: [3, 10], hits: 1, dmg: [30, 39, 51, 66, 86], fx: { pierce: [0.35, 0.4, 0.45, 0.5, 0.6] }, desc: 'Projektil prorazí odolnost cíle.' },
  { fam: 'blade', name: 'Energetický meč', w: 3, type: 'nrg', ap: 1, en: [2, 2, 3, 3, 3], acc: 92, rng: [1, 1], hits: 1, dmg: [15, 20, 26, 34, 44], crit: [15, 18, 22, 26, 32], desc: 'Jen na dotek, ale s vysokou šancí na kritický zásah.' },
  { fam: 'hammer', name: 'Hydraulické kladivo', w: 7, type: 'kin', ap: 2, en: [3, 3, 4, 4, 5], acc: 76, rng: [1, 1], hits: 1, dmg: [24, 31, 40, 52, 68], fx: { push: [1, 1, 1, 2, 2], shock: [0, 0, 0.35, 0.5, 0.7] }, desc: 'Odhodí soupeře a občas ho omráčí.' },
  { fam: 'axe', name: 'Bojová sekera', w: 6, type: 'kin', ap: 1, en: [2, 2, 3, 3, 3], acc: 86, rng: [1, 1], hits: 1, dmg: [20, 26, 34, 44, 58], crit: [10, 12, 15, 18, 22], fx: { pierce: [0.2, 0.25, 0.3, 0.35, 0.45] }, desc: 'Těžká čepel jen na dotek; část zásahu projde odolností cíle.' },
  { fam: 'claw', name: 'Plazmové drápy', w: 4, type: 'nrg', ap: 1, en: [3, 3, 3, 4, 4], acc: 94, rng: [1, 1], hits: [2, 2, 3, 3, 3], dmg: [8, 10, 12, 15, 20], fx: { burn: [0, 0, 1, 2, 2], burnDmg: [0, 0, 3, 4, 5] }, desc: 'Rychlé sekance na dotek. Od Mk III zapalují.' },
  { fam: 'pile', name: 'Pneumatický kůl', w: 8, type: 'exp', ap: 2, en: [4, 4, 5, 5, 6], acc: 80, rng: [1, 1], hits: 1, dmg: [34, 44, 57, 74, 96], fx: { pierce: [0.4, 0.45, 0.5, 0.55, 0.65] }, desc: 'Pomalý, ale prorazí i silný pancíř.' },
  { fam: 'hook', name: 'Přitahovací hák', w: 4, type: 'kin', ap: 1, en: [3, 3, 3, 4, 4], acc: 85, rng: [2, 7], hits: 1, dmg: [4, 5, 7, 9, 12], fx: { pull: [3, 4, 5, 6, 8] }, desc: 'Zasáhne a přitáhne soupeře až před sebe. Stojí jen 1 tahový bod.' },
  { fam: 'flame', name: 'Plamenomet', w: 5, type: 'exp', ap: 1, en: [3, 3, 4, 4, 5], acc: 88, rng: [1, 3], hits: 1, dmg: [7, 9, 12, 16, 21], fx: { burn: [2, 2, 3, 3, 4], burnDmg: [3, 4, 5, 7, 9] }, desc: 'Zapálí cíl, hoří několik kol.' },
  { fam: 'tesla', name: 'Tesla cívka', w: 4, type: 'nrg', ap: 1, en: [3, 3, 4, 4, 4], acc: 95, rng: [1, 4], hits: 1, dmg: [9, 12, 15, 20, 26], fx: { shock: [0.4, 0.5, 0.65, 0.8, 1] }, desc: 'Šok: soupeř má příští kolo o tahový bod méně.' },
  { fam: 'shot', name: 'Brokovnice', w: 5, type: 'kin', ap: 1, en: [2, 2, 3, 3, 3], acc: 78, rng: [1, 3], hits: [4, 4, 5, 5, 6], dmg: [5, 6, 8, 10, 13], desc: 'Na blízko devastující.' },
  { fam: 'emp', name: 'EMP projektor', w: 4, type: 'nrg', ap: 1, en: [2, 2, 3, 3, 3], acc: 90, rng: [1, 6], hits: 1, dmg: [4, 5, 7, 9, 12], fx: { emp: [3, 4, 6, 8, 11] }, desc: 'Vysává energii soupeře.' },
];
const WEAPONS_SHOULDER = [
  { fam: 'rocket', name: 'Raketomet', w: 8, type: 'exp', ap: 2, en: [5, 5, 6, 6, 7], acc: 76, rng: [2, 9], hits: 1, dmg: [22, 29, 38, 49, 64], desc: 'Silná raketa na střední a velkou vzdálenost.' },
  { fam: 'mortar', name: 'Minomet', w: 9, type: 'exp', ap: 2, en: [5, 5, 6, 6, 7], acc: 86, rng: [4, 10], hits: 1, dmg: [24, 31, 41, 53, 69], fx: { arc: 1 }, desc: 'Obloukem; úskoky mu nevadí, zblízka nefunguje.' },
  { fam: 'turret', name: 'Dělová věž', w: 6, type: 'kin', ap: 1, en: [3, 3, 4, 4, 4], acc: 74, rng: [1, 7], hits: 2, dmg: [7, 9, 12, 15, 20], desc: 'Dvě rány z ramene za jeden tahový bod.' },
  { fam: 'micro', name: 'Mikroraketnice', w: 7, type: 'exp', ap: 2, en: [4, 4, 5, 5, 6], acc: 72, rng: [2, 8], hits: [4, 4, 5, 5, 6], dmg: [4, 5, 6, 8, 10], desc: 'Salva malých raket.' },
  { fam: 'snip', name: 'Ostřelovač', w: 7, type: 'kin', ap: 2, en: [4, 4, 5, 5, 5], acc: 96, rng: [4, 10], hits: 1, dmg: [23, 30, 39, 50, 65], crit: [25, 28, 32, 36, 42], desc: 'Dalekonosná přesná zbraň s kritickými zásahy.' },
  { fam: 'pcan', name: 'Plazmové dělo', w: 8, type: 'nrg', ap: 1, en: [5, 5, 6, 6, 7], acc: 80, rng: [2, 8], hits: 1, dmg: [17, 22, 29, 38, 49], desc: 'Energetické dělo za jediný tahový bod.' },
];
const MODULES = [
  // rameno
  { fam: 'tele', kind: 'shoulder', name: 'Teleportér', w: 7, desc: 'Akce Teleport: za 1 tahový bod se přeneseš na libovolné volné pole v dosahu (jednou za tah).', st: { tele: [4, 5, 6, 8, 10], teleEn: [5, 5, 4, 4, 3] } },
  // hlava
  { fam: 'sens', kind: 'head', name: 'Zaměřovač', w: 2, desc: 'Lepší přesnost a kritické zásahy.', st: { acc: [5, 8, 11, 15, 20], crit: [2, 3, 5, 7, 10], hp: [4, 6, 8, 10, 12] } },
  { fam: 'helm', kind: 'head', name: 'Ocelová přilba', w: 4, desc: 'Odolnost proti kinetickým zásahům.', st: { hp: [12, 18, 26, 36, 50], res: [{ kin: 0.03 }, { kin: 0.05 }, { kin: 0.08 }, { kin: 0.11 }, { kin: 0.15 }] } },
  { fam: 'cpu', kind: 'head', name: 'Taktický procesor', w: 2, desc: 'Víc energie, rychlejší dobíjení; Mk V přidá tahový bod.', st: { en: [2, 3, 4, 5, 7], regen: [0, 1, 1, 1, 2], ap: [0, 0, 0, 0, 1] } },
  { fam: 'radar', kind: 'head', name: 'Radar', w: 3, desc: 'Prodlužuje dostřel zbraní (Mk IV a V o 1 pole).', st: { rngb: [0, 0, 0, 1, 1], acc: [3, 5, 7, 9, 12] } },
  { fam: 'visor', kind: 'head', name: 'Termovizor', w: 2, desc: 'Přesnost a odolnost proti energii.', st: { acc: [3, 5, 8, 11, 15], res: [{ nrg: 0.03 }, { nrg: 0.05 }, { nrg: 0.07 }, { nrg: 0.1 }, { nrg: 0.14 }] } },
  // hruď
  { fam: 'reac', kind: 'chest', name: 'Reaktor', w: 8, desc: 'Energie a tahové body. Od Mk II dává +1 tahový bod, Mk V dokonce +2.', st: { en: [4, 6, 8, 11, 15], regen: [1, 1, 2, 2, 3], ap: [0, 1, 1, 1, 2] } },
  { fam: 'plate', kind: 'chest', name: 'Pancíř', w: 12, desc: 'Hodně životů a odolnost proti kinetice a výbuchům.', st: { hp: [25, 38, 55, 78, 110], res: [{ kin: 0.03, exp: 0.03 }, { kin: 0.05, exp: 0.05 }, { kin: 0.07, exp: 0.07 }, { kin: 0.1, exp: 0.1 }, { kin: 0.13, exp: 0.13 }] } },
  { fam: 'shld', kind: 'chest', name: 'Generátor štítu', w: 7, desc: 'Štít pohltí zásahy a každé kolo se částečně obnoví.', st: { shield: [10, 16, 24, 34, 48], shieldRegen: [4, 6, 9, 12, 16] } },
  { fam: 'nano', kind: 'chest', name: 'Nano-opravář', w: 6, desc: 'Akce Oprava: za 1 tahový bod vyléčí životy (omezený počet použití za zápas).', st: { rep: [14, 20, 28, 38, 52], repUses: [2, 2, 3, 3, 4], hp: [5, 8, 12, 16, 22] } },
  { fam: 'cool', kind: 'chest', name: 'Chladicí jádro', w: 6, desc: 'Rychlejší dobíjení energie; od Mk IV nehoří.', st: { regen: [2, 3, 4, 5, 7], hp: [4, 6, 9, 12, 16], noBurn: [0, 0, 0, 1, 1] } },
  { fam: 'vault', kind: 'chest', name: 'Nosný rám', w: 3, desc: 'Zvyšuje nosnost robota.', st: { cap: [12, 16, 22, 29, 38], hp: [4, 6, 9, 12, 16] } },
  // nohy
  { fam: 'servo', kind: 'leg', name: 'Servopohon', w: 5, desc: 'Delší skok a trocha úhybnosti.', st: { jmp: [1, 1, 1, 2, 2], evade: [2, 3, 4, 6, 8] } },
  { fam: 'greave', kind: 'leg', name: 'Holenní pancíř', w: 7, desc: 'Životy a odolnost proti výbuchům.', st: { hp: [15, 22, 32, 45, 62], res: [{ exp: 0.03 }, { exp: 0.05 }, { exp: 0.07 }, { exp: 0.1 }, { exp: 0.13 }] } },
  { fam: 'gyro', kind: 'leg', name: 'Gyro stabilizátor', w: 4, desc: 'Úhybnost a přesnost střelby.', st: { evade: [4, 6, 9, 13, 18], acc: [0, 2, 3, 4, 6] } },
  { fam: 'frame', kind: 'leg', name: 'Těžký rám', w: 6, desc: 'Nosnost a životy.', st: { cap: [8, 11, 15, 20, 26], hp: [10, 14, 20, 28, 38] } },
  { fam: 'thrust', kind: 'leg', name: 'Tryskáče', w: 5, desc: 'Dlouhé skoky; od Mk IV chůze o dvě pole.', st: { jmp: [1, 2, 2, 3, 3], spd: [0, 0, 0, 1, 1] } },
];
const DRONES = [
  { fam: 'adron', name: 'Útočný dron', w: 3, dtype: 'atk', desc: 'Po vyslání každé kolo sám střílí na soupeře.', hp: [20, 28, 38, 52, 72], dmg: [5, 7, 9, 12, 16], acc: [78, 80, 82, 85, 88], rng: [1, 6], ap: 1, en: 2 },
  { fam: 'rdron', name: 'Opravný dron', w: 3, dtype: 'rep', desc: 'Po vyslání každé kolo léčí majitele.', hp: [20, 28, 38, 52, 72], heal: [6, 9, 13, 18, 25], ap: 1, en: 2 },
  { fam: 'sdron', name: 'Štítový dron', w: 3, dtype: 'shd', desc: 'Po vyslání každé kolo dodá majiteli štít.', hp: [20, 28, 38, 52, 72], shield: [8, 12, 17, 24, 34], ap: 1, en: 2 },
  { fam: 'jdron', name: 'Rušicí dron', w: 3, dtype: 'jam', desc: 'Po vyslání zhoršuje soupeři přesnost a vysává mu energii.', hp: [18, 24, 32, 44, 60], jam: [6, 9, 13, 18, 25], drain: [1, 1, 2, 2, 3], ap: 1, en: 2 },
];
const pick = (v, i) => (Array.isArray(v) ? v[i] : v);
const wmul = (t) => 1 + 0.2 * t;   // t = 0..4

function build() {
  const items = [];
  for (const f of WEAPONS_HAND.concat(WEAPONS_SHOULDER)) {
    const shoulder = WEAPONS_SHOULDER.includes(f);
    for (let t = 0; t < 5; t++) {
      const fx = {}; if (f.fx) for (const k of Object.keys(f.fx)) fx[k] = pick(f.fx[k], t);
      items.push({ id: f.fam + (t + 1), fam: f.fam, tier: t + 1, kind: 'weapon', fit: shoulder ? ['shoulder'] : ['hand'], name: `${f.name} Mk ${ROMAN[t]}`, famName: f.name, desc: f.desc, w: Math.round(f.w * wmul(t)),
        wp: { type: f.type, dmg: pick(f.dmg, t), hits: pick(f.hits, t), acc: f.acc, rng: [f.rng[0], f.rng[1]], ap: f.ap, en: pick(f.en, t), crit: f.crit ? pick(f.crit, t) : 0, fx } });
    }
  }
  for (const f of MODULES) for (let t = 0; t < 5; t++) {
    const st = {}; for (const k of Object.keys(f.st)) st[k] = pick(f.st[k], t);
    items.push({ id: f.fam + (t + 1), fam: f.fam, tier: t + 1, kind: 'module', fit: [f.kind], name: `${f.name} Mk ${ROMAN[t]}`, famName: f.name, desc: f.desc, w: Math.round(f.w * wmul(t)), st });
  }
  for (const f of DRONES) for (let t = 0; t < 5; t++) {
    const d = { dtype: f.dtype, hp: pick(f.hp, t), ap: f.ap, en: f.en }; for (const k of ['dmg', 'acc', 'heal', 'shield', 'jam', 'drain']) if (f[k] !== undefined) d[k] = pick(f[k], t); if (f.rng) d.rng = [f.rng[0], f.rng[1]];
    items.push({ id: f.fam + (t + 1), fam: f.fam, tier: t + 1, kind: 'drone', fit: ['drone'], name: `${f.name} Mk ${ROMAN[t]}`, famName: f.name, desc: f.desc, w: Math.round(f.w * wmul(t)), dr: d });
  }
  for (const it of items) { it.rarity = RARITY[it.tier - 1].id; it.price = Math.round(40 * RARITY[it.tier - 1].mul); it.sell = Math.round(it.price * 0.35); }
  return items;
}
export const ITEMS = build();
const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const item = (id) => BY_ID.get(id) || null;
export const FAMILIES = [...new Set(ITEMS.map((i) => i.fam))];
export const itemsOf = (kind) => ITEMS.filter((i) => i.fit.includes(kind));

// ---------------------------------------------------------------- sestava a její vlastnosti
export const emptyBuild = () => Object.fromEntries(SLOTS.map((s) => [s, '']));
export function cleanBuild(b) { const out = emptyBuild(); if (b && typeof b === 'object') for (const s of SLOTS) { const it = item(String(b[s] ?? '')); if (it && it.fit.includes(SLOT_KIND[s])) out[s] = it.id; } return out; }
/** Počty karet, které sestava spotřebuje (jedna karta = jedno místo). */
export function usage(build) { const u = {}; for (const s of SLOTS) if (build[s]) u[build[s]] = (u[build[s]] || 0) + 1; return u; }
/** inv: { id: { n, lv } }. Vrátí chybu v češtině, nebo null. */
export function buildError(build, inv) {
  const u = usage(build);
  for (const id of Object.keys(u)) { if (!item(id)) return 'Neznámá karta.'; const have = inv && inv[id] ? inv[id].n : 0; if (have < u[id]) return `Karta „${item(id).name}“ je v sestavě ${u[id]}× a máš ji jen ${have}×.`; }
  const st = mechStats(build, inv); if (st.weight > st.cap) return `Robot je přetížený (${st.weight}/${st.cap}).`;
  return null;
}
const RES0 = () => ({ kin: 0, nrg: 0, exp: 0 });
const lvOf = (inv, id) => (inv && inv[id] ? Math.max(1, Math.min(MAX_LV, inv[id].lv | 0 || 1)) : 1);
/** Spočítá vlastnosti robota ze sestavy; úrovně karet bere z inv (bez inv = všechno na úrovni 1). */
export function mechStats(build, inv) {
  const m = { hp: BASE.hp, ap: BASE.ap, en: BASE.en, regen: BASE.regen, shield: 0, shieldRegen: 0, acc: BASE.acc, crit: BASE.crit, evade: BASE.evade, spd: BASE.spd, jmp: BASE.jmp, cap: BASE.cap, rngb: 0, res: RES0(), weight: 0, rep: 0, repUses: 0, noBurn: false, tele: 0, teleEn: 0, weapons: [], drone: null };
  for (const s of SLOTS) {
    const it = build[s] ? item(build[s]) : null; if (!it) continue; const lv = lvOf(inv, it.id), L = levelMul(lv);
    m.weight += it.w;
    if (it.kind === 'weapon') { const w = it.wp; m.weapons.push({ slot: s, id: it.id, lv, name: it.name, type: w.type, dmg: Math.round(w.dmg * L * 10) / 10, hits: w.hits, acc: w.acc, rng: [w.rng[0], w.rng[1]], ap: w.ap, en: w.en, crit: w.crit, fx: scaleFx(w.fx, L) }); }
    else if (it.kind === 'drone') { const d = it.dr; m.drone = { id: it.id, lv, name: it.name, dtype: d.dtype, hp: Math.round(d.hp * L), ap: d.ap, en: d.en, dmg: d.dmg ? Math.round(d.dmg * L) : 0, acc: d.acc || 0, rng: d.rng || [1, 1], heal: d.heal ? Math.round(d.heal * L) : 0, shield: d.shield ? Math.round(d.shield * L) : 0, jam: d.jam || 0, drain: d.drain || 0 }; }
    else {
      const st = it.st;
      m.hp += Math.round((st.hp || 0) * L); m.ap += st.ap || 0; m.en += Math.round((st.en || 0) * L * 10) / 10; m.regen += st.regen || 0; m.shield += Math.round((st.shield || 0) * L); m.shieldRegen += Math.round((st.shieldRegen || 0) * L);
      m.acc += st.acc || 0; m.crit += st.crit || 0; m.evade += st.evade || 0; m.spd += st.spd || 0; m.jmp += st.jmp || 0; m.cap += st.cap || 0; m.rngb += st.rngb || 0;
      if (st.tele) { m.tele = Math.max(m.tele, st.tele); m.teleEn = m.teleEn ? Math.min(m.teleEn, st.teleEn) : st.teleEn; }
      if (st.rep) { m.rep += Math.round(st.rep * L); m.repUses += st.repUses || 0; } if (st.noBurn) m.noBurn = true;
      if (st.res) for (const k of Object.keys(st.res)) m.res[k] += st.res[k];
    }
  }
  m.ap = Math.min(MAX_AP, m.ap); m.en = Math.round(m.en); m.evade = Math.min(60, m.evade); m.acc = Math.min(98, m.acc);
  for (const k of Object.keys(m.res)) m.res[k] = Math.min(0.75, Math.round(m.res[k] * 1000) / 1000);
  return m;
}
function scaleFx(fx, L) { const o = {}; for (const k of Object.keys(fx || {})) o[k] = (k === 'burnDmg' || k === 'emp') ? Math.round(fx[k] * L) : fx[k]; return o; }
/** Odhad síly sestavy (pro výběr soupeřů a přehled): hrubý součet výstupu, odolnosti a rychlosti. */
export function power(build, inv) {
  const m = mechStats(build, inv); let dpt = 0; for (const w of m.weapons) dpt += (w.dmg * w.hits * (w.acc / 100)) / w.ap; const ehp = m.hp + m.shield * 2;
  return Math.round(dpt * m.ap * 3 + ehp * 0.8 + m.en * 2 + (m.drone ? 30 : 0));
}

// ---------------------------------------------------------------- bedny (technicky vypadající bedny; z nich padají karty)
// odds = šance na úroveň karty (Mk I…V) v %, filter = které karty mohou padnout
export const CRATES = [
  { id: 'serv', name: 'Servisní bedna', price: 250, cards: 2, color: '#7f8a96', accent: '#c9d2da', desc: 'Základní zásilka dílů: většinou Mk I a II.', odds: [70, 25, 5, 0, 0], filter: null },
  { id: 'tech', name: 'Technická bedna', price: 450, cards: 2, color: '#3f7fa8', accent: '#8fd4ff', desc: 'Jen moduly do hlavy, hrudi, nohou a ramen.', odds: [55, 30, 12, 3, 0], filter: { kind: 'module' } },
  { id: 'zbroj', name: 'Zbrojní bedna', price: 550, cards: 2, color: '#a8683f', accent: '#ffc08f', desc: 'Jen zbraně do rukou a ramen.', odds: [55, 30, 12, 3, 0], filter: { kind: 'weapon' } },
  { id: 'dron', name: 'Dronová přepravka', price: 600, cards: 1, color: '#3fa88c', accent: '#8fffe1', desc: 'Jeden dron, na vyšší úrovni často lepší.', odds: [45, 33, 17, 5, 0], filter: { kind: 'drone' } },
  { id: 'vojen', name: 'Vojenská bedna', price: 1100, cards: 3, color: '#5b7a3a', accent: '#c5e88f', desc: 'Tři karty, slušná šance na vzácné a epické.', odds: [30, 36, 24, 9, 1], filter: null },
  { id: 'hlava', name: 'Bedna Hlava & Hruď', price: 800, cards: 2, color: '#5a4fa8', accent: '#b9b0ff', desc: 'Jen moduly do hlavy a hrudi.', odds: [40, 36, 18, 5, 1], filter: { kinds: ['head', 'chest'] } },
  { id: 'proto', name: 'Prototyp', price: 2800, cards: 3, color: '#a83f5a', accent: '#ffa0b8', desc: 'Prototypové zásilky: vždy aspoň vzácná karta.', odds: [0, 0, 55, 36, 9], filter: null },
  { id: 'zlata', name: 'Zlatý kontejner', price: 7500, cards: 3, color: '#b8922e', accent: '#ffe68a', desc: 'Pouze epické a legendární karty.', odds: [0, 0, 0, 72, 28], filter: null },
];
export const crate = (id) => CRATES.find((c) => c.id === id) || null;
export const DAILY_MS = 20 * 3600 * 1000;
function crateItems(c) {
  const f = c.filter; return ITEMS.filter((i) => !f || (f.kind === 'module' ? i.kind === 'module' : f.kind === 'weapon' ? i.kind === 'weapon' : f.kind === 'drone' ? i.kind === 'drone' : f.kinds ? f.kinds.some((k) => i.fit.includes(k)) && i.kind === 'module' : true));
}
/** Vylosuje obsah bedny: pole id karet. rng() vrací číslo v <0,1). */
export function rollCrate(c, rng) {
  const pool = crateItems(c), out = [];
  for (let i = 0; i < c.cards; i++) {
    let r = rng() * 100, tier = 1; for (let t = 0; t < 5; t++) { r -= c.odds[t]; if (r < 0) { tier = t + 1; break; } }
    const cand = pool.filter((x) => x.tier === tier); out.push(cand[Math.floor(rng() * cand.length)].id);
  }
  return out;
}

// ---------------------------------------------------------------- start hráče
export const START_COINS = 1500;
export const STARTER_INV = { mg1: 1, plas1: 1, sens1: 1, plate1: 1, servo1: 2, reac1: 1 };
export const STARTER_BUILD = { head: 'sens1', shL: '', shR: '', chest: 'plate1', hdL: 'plas1', hdR: 'mg1', lgL: 'servo1', lgR: 'servo1', drone: '' };
