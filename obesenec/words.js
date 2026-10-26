// Slovník pro OBĚŠENCE. Slova jsou po kategoriích; obtížnost se určuje podle délky slova (bez diakritiky):
//   lehká 4–6 písmen · normální 7–8 · těžká 9–10 · expert 11 a víc.
// Zadávají se s diakritikou, hádá se po základních písmenech A–Z (Á se odkryje písmenem A, Ž písmenem Z atd.).

const RAW = {
  'Zvířata': `kočka pes kůň kráva ovce koza prase slepice kachna husa králík liška vlk medvěd jelen srnka zajíc ježek sova orel
    jestřáb straka vrána holub čáp labuť žába had ještěrka želva krokodýl slon žirafa lev tygr zebra opice gorila tučňák delfín
    velryba žralok chobotnice medúza krab pavouk mravenec včela moucha komár motýl vážka brouk šnek žížala veverka bobr vydra
    jezevec netopýr papoušek vlaštovka datel kolibřík nosorožec hroch klokan koala panda leopard gepard velbloud pštros
    sova kapr štika pstruh sumec kuře kohout krocan křeček morče myš krysa potkan chameleón ptakopysk mravenečník jednorožec
    velociraptor lenochod surikata vlaštovka`,
  'Jídlo': `chléb rohlík houska koláč buchta knedlík polévka guláš svíčková řízek omeleta palačinka brambor mrkev cibule česnek rajče
    okurka paprika zelí salát jablko hruška švestka třešně jahoda malina borůvka meruňka broskev pomeranč citron banán ananas meloun
    hrozny čokoláda zmrzlina bonbon sýr máslo jogurt mléko tvaroh vejce šunka klobása párek salám špagety těstoviny pizza
    hamburger vánočka bábovka koblih perník medovník šlehačka pudink marmeláda džem sirup bramborák lívanec hranolky
    čokoládovna zmrzlinárna cukrárna restaurace`,
  'Příroda': `strom les louka řeka potok jezero rybník moře oceán hora kopec údolí skála jeskyně ostrov poušť džungle vodopád duha
    mrak bouřka blesk sníh led vítr déšť mlha kapradí houba list květina tulipán růže slunečnice sedmikráska pampeliška kopřiva
    borovice smrk dub buk bříza javor lípa topol vrba pramen záplava sopka útes pláž vlna příliv bouře`,
  'Domov': `stůl židle skříň postel lampa koberec záclona okno dveře střecha schody kuchyně ložnice koupelna lednička sporák pračka
    televize telefon počítač klávesnice monitor hodinky budík kalendář mapa batoh kabelka peněženka deštník klíč zámek kladivo
    šroubovák pila kleště žebřík zrcadlo polštář peřina ručník mýdlo kartáček hrnek talíř lžíce vidlička nůž sklenice konvice
    vysavač chladnička mikrovlnka sluchátka vrtačka kapesník stavebnice pokladnička`,
  'Doprava': `kolo auto autobus vlak tramvaj letadlo loď raketa motorka metro kamion traktor člun ponorka vrtulník lokomotiva
    automobil motocykl skútr koloběžka vozík taxík přístav nádraží letiště křižovatka semafor chodník dálnice tunel most
    elektromobil kamionista`,
  'Sport': `fotbal hokej tenis basketbal volejbal plavání běh lyže snowboard šachy golf box zápas gól branka rozhodčí trenér stadion
    míč raketa medaile pohár olympiáda maraton cyklistika veslování šerm lukostřelba házená atletika gymnastika brusle
    plavec fotbalista tenista hráč kapitán turnaj`,
  'Povolání': `lékař učitel kuchař řidič pilot hasič policista prodavač zedník truhlář malíř zpěvák herec spisovatel novinář programátor
    inženýr zahradník rybář myslivec holič kadeřník pekař řezník právník architekt astronaut kosmonaut veterinář cestovatel
    elektrikář meteorolog kameraman fotograf hudebník obchodník knihovnice sestřička vodoinstalatér automechanik prezident
    ministr starosta voják`,
  'Místa': `praha brno ostrava plzeň olomouc liberec pardubice zlín jihlava česko slovensko polsko německo rakousko francie španělsko
    itálie řecko norsko švédsko finsko dánsko anglie irsko island egypt čína japonsko austrálie brazílie kanada mexiko afrika
    evropa asie amerika antarktida vídeň berlín londýn paříž řím athény madrid lisabon varšava budapešť
    hospoda škola nemocnice knihovna muzeum divadlo kino kostel hrad zámek náměstí hřbitov parlament univerzita ministerstvo
    supermarket papírnictví knihkupectví nakladatelství zahradnictví hospodářství mezinárodní`,
  'Věda a technika': `vesmír planeta hvězda galaxie kometa měsíc slunce země mars jupiter saturn raketoplán teleskop mikroskop
    gravitace elektřina baterie magnet atom molekula energie internet robot software aplikace databáze algoritmus procesor
    laboratoř experiment vynález stroj motor kalkulačka technologie automatizace planetárium astronomie matematika
    geografie fotografie psychologie architektura komunikace encyklopedie mimozemšťan`,
  'Pohádky a zábava': `radost smutek kamarád rodina přítel láska štěstí svoboda přátelství dobrodružství tajemství pohádka princezna drak
    čaroděj čarodějnice víla trpaslík obr kouzlo poklad rytíř kytara klavír housle buben trumpeta flétna harmonika hudba písnička
    koncert film puzzle domino karneval kamarádství dobrodruh neuvěřitelný nezapomenutelný odpovědnost zodpovědnost pohostinnost
    demokracie bezpečnost ochutnávka čtyřlístek`,
  'Oblečení': `kabát bunda košile kalhoty sukně šaty ponožky boty čepice rukavice šála tričko svetr pyžamo kapuce plavky pásek kravata
    pantofle sandály náušnice náramek`,
};

export const LEVELS = ['lehka', 'normalni', 'tezka', 'expert'];

/** Nastavení obtížností: počet povolených chyb, jestli se ukáže kategorie, kolik písmen je zdarma odkryto. */
export const LEVEL_CFG = {
  lehka:    { name: 'Lehká',    min: 4,  max: 6,  mistakes: 9, category: true,  reveal: 1, desc: 'Krátká slova (4–6 písmen), nápověda s kategorií, první písmeno zdarma, 9 chyb.' },
  normalni: { name: 'Normální', min: 7,  max: 8,  mistakes: 8, category: true,  reveal: 0, desc: 'Slova o 7–8 písmenech, nápověda s kategorií, 8 chyb.' },
  tezka:    { name: 'Těžká',    min: 9,  max: 10, mistakes: 7, category: false, reveal: 0, desc: 'Delší slova (9–10 písmen), bez nápovědy, 7 chyb.' },
  expert:   { name: 'Expert',   min: 11, max: 99, mistakes: 6, category: false, reveal: 0, desc: 'Dlouhá slova (11+ písmen), bez nápovědy, jen 6 chyb.' },
};

/** Bez diakritiky a malými písmeny: „Žlutý“ → „zluty“. */
export const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const seen = new Set();
export const ALL = [];
for (const [cat, list] of Object.entries(RAW)) {
  for (const w of list.split(/\s+/).filter(Boolean)) {
    const f = fold(w);
    if (seen.has(f) || !/^[a-z]+$/.test(f)) continue; // duplicity a cokoli jiného než písmena se přeskočí
    seen.add(f);
    ALL.push({ w: w.toLowerCase(), f, c: cat });
  }
}

export const POOLS = Object.fromEntries(LEVELS.map((lv) => {
  const { min, max } = LEVEL_CFG[lv];
  return [lv, ALL.filter((e) => e.f.length >= min && e.f.length <= max)];
}));
