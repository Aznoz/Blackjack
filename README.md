# Blackjack Multiplayer

HTML5 blackjack pro více hráčů. Klient je čisté HTML/CSS/JS (bez frameworku), server je Node.js
s WebSocketem. Server je **autoritativní** – míchá karty, hlídá limity a počítá výplaty, klient jen posílá akce.

## Rychlý start

```bash
npm install
npm start
# otevři http://localhost:3000 (pro multiplayer otevři víc oken / zařízení)
```

Potřebuješ Node.js 18 nebo novější. Jediná závislost je `ws`.

## Co hra umí

- Hlavní menu: Rychlá hra, Stoly (lobby + vytvoření vlastního stolu), Nastavení (zvuky), Pravidla
- **Jméno** (2–16 znaků) a **profilovka** se nastavují na hlavní stránce v Nastavení účtu (platí pro všechny hry)
- **Profilovka**: 10 předvoleb (eso a karty 2–10, každá v jiné barvě) nebo vlastní obrázek. Vlastní obrázek se v prohlížeči
  ořízne na čtverec, zmenší na 256×256 JPEG (do ~75 kB) a nahraje na server, který ho zkontroluje (JPEG, velikost, rozměry),
  uloží pod hash a servíruje na `/avatar/<hash>.jpg`. Profilovku vidí ostatní u stolu, v menu i v žebříčku.
- **Obchod** a **Žebříčky** jsou na hlavní stránce portálu (odkazy uprostřed hlavičky). Žebříček čte veřejné `GET /api/leaderboard`.
- **Air hockey**: před každým zápasem se hlasuje o rychlosti (pomalá 0,7× / normální / rychlá 1,35× rychlost puku); při různých hlasech rozhodne los mezi nimi, bez hlasu platí normální.
- Stoly pro 5 hráčů, 3 stálé stoly + libovolné vlastní (prázdný vlastní stůl se sám zruší)
- Hráč začíná s **5 000 chipy**, zůstatek **nikdy nespadne pod 200** (po prohře se doplní na 200)
- Sázka **min 100, max 80 % aktuálního zůstatku**, zaokrouhleno dolů (vždy násobek 10;
  krok zaokrouhlení: <1 000 → 10, <10 000 → 50, <100 000 → 100, výš 1 000)
- Plná pravidla: 6 balíčků, blackjack 3:2, dealer stojí na měkké 17, dealer koukne na skrytou kartu,
  pojištění 2:1, double (i po splitu), split až na 4 ruce, k splitnutým esům jen jedna karta
- Zavření karty / refresh / ztráta spojení = odchod od stolu; po návratu hráč začíná v hlavním menu (účet i zůstatek zůstanou). Rozehrané kolo se dohraje automaticky (stand)
- Prázdný vlastní stůl se po 1 minutě zruší
- Časovače: 15 s na sázku (po první sázce), 20 s na tah, nečinný hráč se po 3 kolech odpojí
- Ovládání z klávesnice: `H` hit, `S` stand, `D` double, `P` split, `Enter` potvrdí sázku

## Air hockey

Druhá hra na stejném serveru (WebSocket `/hockey`, klient v `public/airhockey/`). Zápas 1 na 1, první na 7 gólů, myší se ovládá pálka.
Fyzika běží na serveru (`hockey-physics.js`), klient jen posílá polohu kurzoru a vykresluje. 3 stálé stoly + vlastní stoly (prázdný
se po minutě zruší). Odměny za výhry v řadě u jednoho stolu: 200 / 400 / 650 / 1000 (a dál 1000); prohra nebo odchod od stolu sérii
nuluje, odchod uprostřed zápasu zápas zruší bez odměny. Odměna jde do **společného zůstatku**. Testy: `node test-hockey-physics.js`,
`node test-hockey.js`.

## Společný účet

Jméno, profilovka a zůstatek jsou společné pro všechny hry. Účet je buď propojený s Google (nastavuje se na hlavní stránce v Nastavení
účtu přes HTTP API `/api/profile`, `/api/avatar`), nebo anonymní (tajný token v prohlížeči, jméno a profilovka náhodné). Při prvním
přihlášení přes Google se anonymní postup z prohlížeče převede na Google účet.

## Google účty a hlavní stránka

Server obsahuje HTTP API pro hlavní stránku (`/api/login`, `/api/me`, `/api/favorites`, `/api/logout`, `/api/account`).
Přihlášení přes Google ověřuje server (podpis, aud, platnost) a vydá vlastní relaci. Oblíbené hry a zůstatek v blackjacku
jsou pak spojené s Google účtem na všech zařízeních. Proměnné: `GOOGLE_CLIENT_ID`, volitelně `UPSTASH_REDIS_REST_URL` +
`UPSTASH_REDIS_REST_TOKEN` (trvalé ukládání na Renderu free). Postup viz `README-portal.md`. Testy: `node test-google.js`.

## Nasazení na reálný web

Multiplayer potřebuje běžící Node.js proces – na čistě statický hosting (jen HTML soubory) to nejde.
Hodí se jakýkoli VPS nebo PaaS (Render, Railway, Fly.io, Hetzner…).

1. Nahraj projekt na server, `npm install --omit=dev`
2. Spusť trvale, např. `pm2 start server.js --name blackjack` (nebo systemd)
3. Před server dej reverzní proxy s HTTPS. Klient si sám zvolí `wss://`, když stránka běží na `https://`.

Ukázka pro nginx (WebSocket je na cestě `/ws`):

```nginx
server {
    server_name hra.example.cz;
    # ... listen 443 ssl; certifikáty ...

    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 120s;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
```

Proměnné prostředí:

| Proměnná | Výchozí | Význam |
|---|---|---|
| `PORT` | `3000` | port serveru |
| `HOST` | `0.0.0.0` | na jakém rozhraní poslouchat (za proxy dej `127.0.0.1`) |
| `DATA_DIR` | `./data` | kde se ukládá `players.json` a složka `avatars/` s nahranými profilovkami |
| `ALLOWED_ORIGINS` | (vše) | čárkami oddělený seznam povolených původů WebSocketu, např. `https://hra.example.cz` |

Poznámky k provozu:

- **Účet = tajný token v prohlížeči** (`localStorage`). Smazání dat prohlížeče znamená ztrátu účtu.
  Server ukládá jen SHA-256 hash tokenu. Registrace ani hesla v téhle verzi nejsou.
- Zůstatky a statistiky jsou v `data/players.json` – **zálohuj ho**. Při řádném vypnutí (SIGTERM/SIGINT)
  se rozehrané sázky vrátí a data se uloží.
- **Nahrané profilovky** jsou v `DATA_DIR/avatars/` (celkem max 60 MB, max 80 kB na obrázek, nahrát lze jednou za 3 s).
  Na Renderu (free plan) je disk dočasný – po restartu/nasazení zmizí zůstatky i profilovky (hráči se vrátí na předvolbu).
  Trvale pomůže placený plán s Diskem a `DATA_DIR=/var/data`. Obrázky nejsou moderované.
- Server je jeden proces v paměti, jedna instance zvládne desítky až stovky hráčů. Pro víc instancí by
  stoly a účty musely být ve sdíleném úložišti.
- Stránku lze vložit do jiného webu přes `<iframe>` ze stejné domény; ze cizí domény ji blokuje
  hlavička `X-Frame-Options` (změň v `server.js`, pokud potřebuješ).

## Soubory

```
server.js        HTTP + WebSocket server, stoly, kola, účty
rules.js         čistá logika: hodnota ruky, bota, limity sázek, výplaty, konfigurace (CFG)
public/          klient blackjacku: index.html, style.css, game.js, config.js
public/airhockey/ klient air hockeye
hockey.js        server air hockeye (stoly, zápasy, odměny)
hockey-physics.js fyzika air hockeye
google.js        ověření Google ID tokenu
persist.js       ukládání dat (soubor + volitelně Upstash)
test-rules.js    jednotkové testy pravidel
test-bots.js     integrační test s boty přes WebSocket
```

Hodnoty jako počáteční chipy, minimum, 80 %, počet balíčků nebo časovače jsou na jednom místě
v objektu `CFG` na začátku `rules.js`.

## Testy

```bash
npm test
```

`test-bots.js` spustí server s urychlenými časovači a nechá u jednoho stolu hrát pět botů
(včetně „maniaka“ sázejícího maximum a „spáče“, který nikdy netáhne). Kontroluje účetnictví zůstatku
po každém kole, odmítnutí špatných sázek, skrytou kartu dealera, tah dealera, odpojení a návrat,
odchod uprostřed kola, vyhození nečinných, plný stůl a uložení dat po restartu serveru.

## Automat na plyšáky (`public/claw/`)
Hra pro jednoho hráče, 3D přes vlastní WebGL engine (`gl.js`, žádná knihovna). Ovládání: joystick (myš / dotyk), mezerník = spustit,
automat jde otáčet přetažením nebo tlačítky. 1 hra = 300, 6 her = 1500. Server (`claw.js`, `/api/claw/*`) hlídá nákup, spotřebu her
a odměnu (jedna odměna na hru, nejdřív po minimální době hry). Hodnoty plyšáků jsou v `claw.js` (`PRIZES`).
Adresu serveru si stránka bere z `../portal-config.js` (`apiUrl`). Test: `node test-claw.js`.

## Stacker (věžička z kostek)

Hra pro jednoho hráče na `/stacker/`. Jeden pokus stojí 200. Kostky se pohybují, hráč je zastavuje klepnutím / mezerníkem / klikem
(řada má max. 4 → 3 → 2 → 1 kostku, co přečuhuje, odpadne, rychlost roste). Úrovně: 5 řad = coiny (ruleta 100/200/500/750/1000/2000
s vahami 50/40/30/20/10/5), 10 řad = díl věcné odměny (sbírá se, hotovou věc prodáš v Obchodu na portálu, záložka Prodat; 19 věcí vč. 6 vzácných).
Server (`stacker.js`, `/api/stacker/*`) strhává cenu, hlídá minimální dobu hry, losuje odměnu a připisuje coiny.

## Prokletá komora (stejný server)

Hororová ruská ruleta (složka `komora/`, frontend `public/../prokleta-komora/` na webu) běží ve stejném procesu jako ostatní hry:
WebSocket cesta `/komora`, probuzení `/komora/health`. Ve `prokleta-komora/config.js` na webu je
`SERVER_URL: "wss://TVUJ-SERVER.onrender.com/komora"`. Samostatný Render pro komoru už není potřeba.
Test: `node test-komora.mjs`.

## Vesmírná štvanice (stejný server)

Karetní hra pro 4–8 hráčů s tajnými rolemi (složka `stvanice/`, frontend `public/stvanice/` → na webu `stvanice/`).
Běží ve stejném procesu: WebSocket cesta `/stvanice`, probuzení `/stvanice/health`, účet `/api/stvanice/me`.
Ve `stvanice/config.js` na webu: `SERVER_URL: "wss://TVUJ-SERVER.onrender.com/stvanice"`.
Server rozhoduje o všem (`game.js`), boti (`bot.js`) doplňují prázdná místa a přebírají odpojené/AFK hráče.
`public/stvanice/data.js` je kopie `stvanice/data.js` – po změně dat ji znovu zkopíruj.
Testy: `test-stvanice.mjs` (náhodné hry), `test-stvanice-rules.mjs` (pravidla), `test-stvanice-bots.mjs` (boti), `test-stvanice-room.mjs` (místnosti).

Úvod hry (`pick: true` v `Game`): na stole leží tolik rubů rolí, kolik je hráčů (vždy Kapitán, bandita, Zabiják a Sebevrah/Šílenec náhodně; pak pravá ruka, 2. bandita, 2. pravá ruka, druhá z rolí Sebevrah/Šílenec). Vybírá náhodný hráč a po směru hodin, roli vidí jen ten, kdo si ji vzal. Potom stejně z odkrytých postav (N náhodných z 19).

## Šachy (stejný server)

Klasické šachy 1v1 přes čtyřpísmenný kód místnosti. Klient je ve složce `public/sachy/` (nahrává se na web jako ostatní hry), server v `sachy/` (běží ve stejném procesu na cestě `/sachy`, zdravotní kontrola `/sachy/health`, profil `POST /api/sachy/me`).

- `sachy/engine.js` – plná pravidla (rošáda, braní mimochodem, proměna, šach/mat/pat, trojí opakování, 50 tahů, nedostatek materiálu). Ověřeno perft testy (`test-sachy-engine.mjs`). Kopie enginu je v `public/sachy/engine.js` (klient podle ní přehrává historii) – po změně ji zkopíruj: `cp sachy/engine.js public/sachy/engine.js`.
- `sachy/sachy.js` – místnosti, hodiny (bez limitu nebo 1–30 min + přídavek), nabídka remízy, vzdání, odveta s prohozením barev, odpojení (90 s na návrat, pak prohra).
- Coiny: výhra **+1 500**, prohra **−500** (nikdy pod minimum serveru), remíza nic. Účtuje se jen když mají účet oba hráči a partie má aspoň 4 půltahy; kratší partie (a zrušené před 2. půltahem) bez coinů.
- Testovací proměnné: `SACHY_MS_PER_MIN`, `SACHY_DROP_MS`, `SACHY_FIRST_MS`, `SACHY_START_FEN`.

### Boti v šachách

- Hra proti botovi: `create` se `bot: 1–5`. Obtížnosti: 1 Nováček, 2 Začátečník, 3 Pokročilý, 4 Expert, 5 Velmistr (hodně těžký). Odměna za výhru: **200 / 500 / 750 / 1000 / 1500** coinů (jen když má hráč účet a partie má aspoň 4 půltahy). Prohra ani remíza proti botovi nic neúčtuje.
- `sachy/ai.js` – engine (alfa-beta, TT, null move, LMR, quiescence, PST), `sachy/aiworker.js` – běží ve `worker_threads`, takže přemýšlení bota neblokuje ostatní hry. Při selhání workeru zahraje náhodný legální tah.
- Bot nabídku remízy přijme jen když stojí hůř (nebo je partie dlouhá a vyrovnaná).
- Testy: `test-sachy-ai.mjs`, `test-sachy-bot.mjs`. Zkušební proměnná: `SACHY_BOT_MIN_MS`.

## Oběšenec (stejný server)

Hádání slov pro 1–6 hráčů, kód místnosti jako u BOMBY. Klient je ve `public/obesenec/`, server v `obesenec/` (WebSocket `/obesenec`, zdravotní kontrola `/obesenec/health`, profil `POST /api/obesenec/me`). Jméno a profilovka se berou z Google účtu na Herně (hosté se jménem z pole).

- `obesenec/words.js` – 570+ slov v kategoriích. Obtížnost se určuje podle délky slova: lehká 4–6 písmen, normální 7–8, těžká 9–10, expert 11+. Nastavení obtížností (počet chyb 9/8/7/6, nápověda kategorie, první písmeno zdarma) je v `LEVEL_CFG`. Nová slova stačí dopsat do `RAW` (duplicity a nepísmena se přeskočí).
- `obesenec/obesenec.js` – místnosti: zakladatel volí obtížnost, počet slov (3–15) a čas na tah (15–60 s), hráči se střídají u jednoho oběšence. Hádá se po písmenech bez diakritiky, nebo celým slovem (špatně = 2 chyby). Body: +2 za odkryté písmeno, +5 za poslední písmeno, +5 a +3 za chybějící písmeno při trefě celého slova. Nestihnutý tah se přeskočí; když všichni dlouho nehrají, hra se ukončí. Bez coinů.
- Test: `test-obesenec.mjs`. Zkušební proměnné: `OBES_NEXT_MS`, `OBES_TURN_MS`.

## Kresli a hádej (stejný server)

Kreslení a hádání pro 2–8 hráčů (jako Gartic.io / Skribbl), kód místnosti jako u BOMBY. Klient je ve `public/kresleni/`, server v `kresleni/` (WebSocket `/kresleni`, zdravotní kontrola `/kresleni/health`, profil `POST /api/kresleni/me`). Jméno a profilovka z Google účtu na Herně. Bez coinů.

- `kresleni/words.js` – 330+ slov ve 3 obtížnostech (lehká, střední, těžká) + Mix; víceslovné výrazy jsou v seznamu `PHRASES`. Nová slova se dopisují do `RAW`.
- `kresleni/kresleni.js` – zakladatel volí slova, počet kol (1–5) a čas na kreslení (40–120 s). V každém kole se vystřídají všichni: kreslíř vybírá ze 3 slov (12 s), pak kreslí; ostatní hádají v chatu (bez ohledu na diakritiku a velikost, „skoro“ = o písmeno vedle). Body: 100 + až 300 podle zbývajícího času, první uhádnuvší +50, kreslíř +40 za každého uhádnuvšího. Nápovědy dává **kreslíř ručně** tlačítkem 💡 (samy se nedávají): 1. prozradí počet písmen (do té doby hádající nevidí ani to), 2. odkryje náhodné písmeno, 3. (jen slova od 7 písmen) další náhodné písmeno. Každá nápověda se objeví i v chatu. Zprávy kreslíře a těch, kdo už uhádli, vidí jen oni. Pozdější příchozí dostane dosavadní kresbu. Při 2 hráčích hra po výpadku jednoho počká (45 s) na návrat.
- Nástroje kreslíře: tužka, guma, **rovná čára, čtverec/obdélník, kruh/elipsa** (tažením od rohu k rohu; tvar jde vyplnit tlačítkem ◻/◼, se Shiftem vznikne čtverec/kruh a čára po 45°; tvar se ostatním ukáže po puštění, kreslíř vidí živý náhled), výplň, zpět a smazat vše. Barev je 16 v paletě + **barevné kolo** (odstín/sytost tahem po kole, jas posuvníkem) pro libovolnou vlastní barvu. Barva je v protokolu buď index do palety (0–15), nebo řetězec `#rrggbb` (jen malá písmena, server jinou hodnotu zahodí). Tvar je operace `{t:'d', op:'s', s:'l'|'r'|'o', c, w, x1, y1, x2, y2, fl}`; na serveru je to položka `{k:'g', …}` a počítá se do limitu tahů.
- Kresba se přenáší po tazích (začátek, body, výplň, zpět, smazat) na logickém plátně 800×600; server drží celou historii (limit 500 tahů / 24 000 bodů). Před každou výplní se plátno překreslí načisto, aby výplň vyšla všem stejně.
- Test: `test-kresleni.mjs`. Zkušební proměnné: `KRES_CHOOSE_MS`, `KRES_REVEAL_MS`, `KRES_DRAW_MS`, `KRES_GRACE_MS`.

## Tankové souboje (stejný server)
Tahová dělostřelecká hra 1v1 (`tanks/`, klient `public/tanks/`, WebSocket `/tanks`). Hraje se proti botovi (3 obtížnosti) nebo online (rychlá hra, kód místnosti, odveta, návrat do rozehrané hry po obnovení stránky).
- **Server je autoritativní**: počítá výstřel (`tanks/physics.js`, stejný soubor je i v `public/tanks/`, test hlídá, že jsou shodné) a klientům pošle záznam dráhy a výbuchů; kráter terénu se počítá celočíselně, takže vychází na serveru i v prohlížeči stejně (kontrolní součet, při nesouladu klient požádá o `sync`).
- **Tah**: popojet (palivo, svahy, hranice), zamířit (úhel + síla, vítr), vystřelit. Čas na tah 45 s, 3 propásnuté tahy za sebou = prohra.
- **Zbraně** (16, odemykají se do úrovně 30): Granát (neomezený), Těžká bomba, Trojitá salva, Odrážeč, Kazeta, Odstřelovač, Atomovka, Pětisalva, Mega bomba, Napalm, Letecký nálet, Super odrážeč, Mega kazeta, Soudný den a dvě opravárenské sady. Definice (`WEAPONS`) jsou v `tanks/physics.js`, nová zbraň = jeden řádek + její id v `TANK_AMMO_IDS` v `server.js`. Na poli padají **bedny** se zbraněmi (sebere se jízdou, výbuch bednu zničí), ta munice platí jen pro jeden zápas.
- **Coiny**: online výhra +900, prohra −300 (zůstatek neklesne pod minimum serveru); proti botovi +150 / +300 / +500 podle obtížnosti, prohra nic nestojí. Coiny se účtují jen když každý hráč vystřelil aspoň 2×.
- **Postup** je v účtu (`acc.tank` = XP, výhry/prohry, koupená munice, barva tanku) a ukládá se stejně jako coiny (`persist.js`, s Upstashem přežije restart i nasazení). Úrovně 1–30 odemykají zbraně a 16 barev tanku; Arzenál (nákup střel, barva) jde přes `/api/tanks/me|buy|color`.
- Test: `node test-tanks.mjs` (fyzika, účet, online zápas, bedny, boti, výplaty, odpojení).

## Key Master (3D automat, 1 hráč)

3D **černý** automat jako ten z arkád (three.js, soubor `public/keymaster/vendor/three.module.min.js` je přibalený). Hráč nejdřív držením ◀ ▶ (nebo šipkami / A, D) vodorovně zamíří zlatý klíč na ramenu na **svítící sloupec dírek** (ve všech třech patrech svítí dírka nad sebou; desky s dírkou ve tvaru klíče), pak stiskne **Vyjet**: rameno s klíčem jede po tyčích **souvisle až úplně nahoru** a hráč ho tlačítkem **STOP** (mezerník) zastaví, kdy chce. O odměně rozhoduje **patro, ve kterém klíč zastaví** (nejbližší patro k výšce klíče): osa klíče musí být přesně v úrovni dírky. Trefa = klíč se **opravdu vejde do dírky** (dírka je průřez klíče + vůle, tolerance 0,14 / 0,12 / 0,10 jednotky podle patra, vodorovně i svisle; konstanty `TOL`, `CLR`, `SPEED`, `KS` v `keymaster.js` klienta) → klíč zapadne a odměna se **rovnou vyplatí, bez potvrzování a bez „risknout vyšší patro“**. Když klíč dojede úplně nahoru (nebo se netrefí), pokus propadá. Výš = lepší odměna, ale rameno jede rychleji (`SPEED` roste s výškou) a dírka je těsnější. Server k tomu přidává **rigování** jako na skutečném automatu: i čistý zásah může sklouznout z hrany (`RIG`: základ 6 / 10 / 14 % podle patra + až 20 % navíc podle toho, jak daleko od středu dírky zásah byl; klient posílá přesnost `q`). Tři patra: 1. coiny, 2. malá věcná odměna, 3. velká věcná odměna. Server: `stage` (jedno zastavení v patře 1–3, nejdřív po minimální době dojezdu `MIN_TIER_MS`) a hned `claim`. Automat jde otáčet tahem prstu / myší (tlačítka ⟲ ⟳ ◎ otočí o 90° / vrátí čelní pohled).

- Server: `keymaster.js`, HTTP API `POST /api/keymaster/{state,start,stage,claim,end}` (stejný vzor jako Stacker). Pokus stojí **100**; patra se potvrzují postupně (`stage`), odměnu losuje server podle nejvyššího potvrzeného patra (`claim`), minimální doby mezi kroky hlídají podvody. Coiny: 50–2000 (váhy 45/40/30/20/10/4/1). Věcné odměny jsou **stejné jako ve Stackeru** a padají do stejného inventáře, takže se prodávají ve stejném Obchodu.
- Web: `public/keymaster/` (`index.html`, `keymaster.css`, `keymaster.js`, `header.js`, `config.js`, `vendor/`). `config.js` může přepsat adresu serveru (`window.KEYMASTER_API_URL`), jinak se vezme z `portal-config.js`.
- Test: `node test-keymaster.js`.

## Color Stop (arkáda na reakci, 1 hráč)

Kolem dokola jezdí šipka po kruhu 12 políček, vždy svítí jedno. Hráč stiskne **STOP** (mezerník, tlačítko nebo klepnutí na plochu), když je šipka nad svítícím políčkem. Po zásahu šipka **otočí směr**, v novém směru se rozsvítí další políčko (jiná barva) a šipka **zrychlí** (100 °/s + 5 °/s za každý zásah, před posledním zásahem 345 °/s). Vzdálenost nového políčka je 2 až 9 políček (nejmenší mezera je jedno políčko); od 10. zásahu se největší vzdálenost zmenšuje a od 46. zásahu je mezera vždy jen jedno políčko. Šipka políčko přejede nebo STOP mimo = konec hry. Cíl je **50 zásahů** (jackpot).

- Server: `colorstop.js`, HTTP API `POST /api/colorstop/{state,start,end}`. Hra stojí **100**. `start` strhne cenu a vylosuje celou trasu (vzdálenost a barvu každého dalšího políčka), `end` vyplatí podle skóre: 5+ → 50, 10+ → 100, 15+ → 150, 20+ → 250, 25+ → 400, 30+ → 800, 35+ → 1 500, 40+ → 3 000, 45+ → 6 000, **50 → 20 000**. Tabulka a rychlosti jsou konstanty `CS` na začátku souboru.
- Hra je reakční a počítá se v prohlížeči, server proto skóre **omezí podle času**: šipka potřebuje na cestu k dalšímu políčku minimální čas (vzdálenost / rychlost), takže nikdo nevyplatí „50 zásahů za dvě vteřiny“. Nedohraná hra (zavřená stránka) propadá, při zavření se pokusí odeslat aspoň dosavadní skóre.
- Web: `public/colorstop/` (`index.html`, `colorstop.css`, `colorstop.js`, `header.js`, `config.js`), kreslí se na 2D plátno. `config.js` může přepsat adresu serveru (`window.COLORSTOP_API_URL`), jinak se vezme z `portal-config.js`.
- Test: `node test-colorstop.js`.

## Coin Pusher (3D automat na mince, 1 hráč)

Klasika z heren: nahoře jezdí otvor, mezerníkem / tlačítkem **VHODIT MINCI** se z něj pustí mince, odrazí se mezi kolíky (27 hustých kolíků ve střídavých řadách) a dopadne na plošinu. Plošina **jezdí neustále** (i bez koupených mincí), ale hromadu posune jen tehdy, když se na ni dostane nová mince. Co přepadne přes přední okraj, je **výhra**. Házet jde **bez přestávky**: mince padá hned po stisku a tah plošiny je zvlášť, zatlačí najednou všechny mince, které do začátku cyklu dopadly (na plošině může čekat nejvýš 12). Mince se kupují v balíčcích: **1 za 50, 3 za 100, 5 za 175, 10 za 350** (najednou nejvýš 30, nevhozené zůstávají v účtu).

- **Mince:** všechny jsou **stejně velké**, liší se barvou a hodnotou: bronzová 10, stříbrná 25, zlatá 50, platinová 100, rubínová 250 (váhy 38 / 30 / 20 / 8 / 4). Padá vždy **jen hráčova mince**, náhodného typu. Mince leží ve dvou vrstvách, takže se **překrývají a leží na sobě** (mince ve stejné vrstvě se neprotínají, v různých ano).
- **Karty:** speciální karty se symbolem věci ze Stackeru **leží od začátku na hromadě mincí** (4 kusy) a jedou s mincemi pod sebou. Levné věci jsou časté, vzácné (Sluchátka, Ovladač, Hodinky…) jen výjimečně (`CARD_WEIGHTS`). Občas (2 %) vypadne z otvoru po hráčově minci i **nová karta** a dopadne na hromadu. Když karta přepadne přes okraj, hráč dostane **díl** té věci do stejného inventáře jako ve Stackeru (prodej v Obchodu).
- Fyzika je **jen na serveru** (`coinpusher.js`, ≈ 10 ms na hod): odraz mince mezi kolíky (s náhodou a pojistkou proti zaseknutí, karta má při pádu stejný poloměr jako mince) i tlačení plošiny. Prohlížeči se pošlou dráhy a snímky pohybu, které jen přehraje. Díky tomu se nedá podvádět a nemusí se hlídat shodné soubory v prohlížeči a na serveru. Prohlížeč pouští plošinu pořád dokola a tah ze serveru začne na začátku jejího cyklu.
- API: `POST /api/coinpusher/{state,buy,drop,push}`. `drop` potřebuje `x` (poloha otvoru, ±4,5), strhne minci a vrátí dráhu pádu mezi kolíky; mince se odrazí od zadní stěny, dopadne **před plošinu** a čeká. `push` (s `ids` mincí, které prohlížeč do tahu počítá) provede tah plošiny a vyplatí, co přepadlo. Mezi hody stačí 60 ms. Na plošině jsou pořád aspoň 2 karty (`MIN_CARDS`): když jich je méně (včetně těch, co čekají na tah), z otvoru spolu s mincí vypadnou 1 nebo 2 nové; jinak padá karta jen občas (`CARD_CHANCE`, nejvýš `MAX_CARDS`). Kdyby hráč zavřel stránku dřív, `state` při dalším načtení čekající mince dotlačí a vyplatí (`flushed`). **Uložené v účtu (Upstash)**: zbývající mince `cpCoins`; díly karet v `items`. Rozložení plošiny je jen v paměti serveru (po restartu nebo po 6 hodinách nečinnosti se vytvoří nová „rozehraná“).
- Ekonomika: hromada se zachovává (kolik mincí se vhodí, tolik jich zhruba vypadne, i hodnotou), návratnost vychází z průměrné hodnoty vhozené mince (≈ 39 coinů): balíček 1 za 50 ≈ 79 %, ostatní (33–35 za minci) ≈ 112–118 %. Naměřeno na 1 500 hodech ≈ 39 coinů na hod, zhruba 40 % hodů nic nevyplatí, na plošině je ≈ 90–125 věcí a karta přepadne asi jednou za 35 hodů. Ladí se `COINS` (hodnoty, váhy), `CARD_WEIGHTS`, `CARD_CHANCE`, `START_CARDS`, `LAYER_P` v `CP`.
- Web: `public/coinpusher/` (`index.html`, `coinpusher.css`, `coinpusher.js`, `header.js`, `config.js`, `vendor/`). `config.js` může přepsat adresu serveru (`window.COINPUSHER_API_URL`).
- Test: `node test-coinpusher.js`.

## Zombie Snatcher (3D automat s plošinou, 1 hráč)

Podle arkády z Dave & Buster's. Otočná modrá plošina v kopuli, na ní puky s hodnotami **50, 100, 200, 500, 750, 1000, 1500, 2000, 3000, 5000** (čím větší hodnota, tím menší puk a blíž ke sloupu) a šest malých stejně velkých zelených puků s písmeny **Z O M B I E**. Za **500** hráč koupí **3 pokusy** (najednou nejvýš 9). **STOP** (mezerník / tlačítko) rozmáchne pevné rameno (vysoko nad puky, dotýká se jich jen „prst“ na jeho konci, puky se od něj přirozeně smekají); na konci rozmachu dojede přímo k **výherní díře** (dole u diváka, výřez ±8° v okraji plošiny). Automat jde otáčet tahem, dvěma prsty se přibližuje.

- Fyzika `zsim.js` je **jeden soubor pro server i prohlížeč** (deterministická, jen + − × ÷ a odmocnina, bitově shodná v Node i v prohlížečích). Vstupem je rozložení puků a úhel plošiny při STOP (0 až 719, po 0,5°). Prohlížeč výstřel hned přehraje, server ho **přepočítá** a vyplatí jen to, co vyšlo jemu.
- Server: `zombie.js`, HTTP API `POST /api/zombie/{state,buy,shoot}`. **Uložené v účtu (Upstash)**: zbývající pokusy `zsTries` a nasbíraná písmena `zsLetters` (bitová maska). Rozložení puků na plošině je jen v paměti serveru (po restartu se vygeneruje nové, pokusy i písmena zůstanou). Puky na plošině zůstávají i po dokoupení pokusů (nová plošina se vytvoří až po restartu serveru nebo po 6 hodinách nečinnosti). Mezi dvěma výstřely musí uplynout 2 s.
- Vyváženost (hráč s náhodným načasováním): ≈ 330–470 coinů na pokus (cena pokusu je ≈ 167), písmeno padne zhruba 1 ze 25 pokusů, jackpot je velmi vzácný. Ladí se šířkou díry (`HOLE_COS`) a délkou „prstu“ (`ARM_HOOK`) v `zsim.js` (užší díra / kratší prst = méně výher). Šikovný hráč (nebo bot), který zvolí ideální úhel, vyhraje víc, to je u dovednostních her nevyhnutelné. Po změně konstant je nutné zkopírovat `zsim.js` i do `public/zombie/`.
- Web: `public/zombie/` (`index.html`, `zombie.css`, `zombie.js`, `zsim.js`, `header.js`, `config.js`, `vendor/`). `config.js` může přepsat adresu serveru (`window.ZOMBIE_API_URL`).
- Test: `node test-zombie.js`.

## Kolo štěstí (3D arkádové kolo, 1 hráč)

Velké svislé kolo jako v arkádách (three.js, `public/wheel/vendor/three.module.min.js` je přibalený): černý buben, zelená kapota s obrazovkou „JACKPOT 20 000“, jazýček nahoře cvaká o kolíky. Roztočení stojí **100**; kolo má 24 stejně velkých výsečí (40, 80, 100, 140, 200, 300, 400, 600, 1000 ★, 2000, 20 000; všechny výhry jsou násobeny konstantou `MULT = 2` v `wheel.js`, šance a cena se nemění), ale výsledek losuje server podle vah, takže velké výhry padají mnohem řidčeji než malé (šance jsou vypsané v pravidlech i v bočních panelech). Výseč **1000 ★** vyplatí 1000 a dá **jackpotový roztoč zdarma** (padají jen 400 / 600 / 2000 / 20 000, jackpot 5 %). Jackpot 20 000 má na hlavním kole 0,1 %, dohromady zhruba 1 z 670 roztočení; návratnost ≈ 179 %. Automat jde otáčet tahem, dvěma prsty / kolečkem se kolo přibližuje.

- Server: `wheel.js`, HTTP API `POST /api/wheel/{state,spin,bonus,collect}`. `spin` strhne vklad a vylosuje výseč, `collect` výhru připíše až po dotočení (nejdřív po 4 s). Nesebrané kolo se při dalším načtení stránky (`state` s `fresh`) hráči připíše. Nevyužitý jackpotový roztoč se ukládá v účtu (`wheelBonus`).
- Web: `public/wheel/` (`index.html`, `wheel.css`, `wheel.js`, `header.js`, `config.js`, `vendor/`). `config.js` může přepsat adresu serveru (`window.WHEEL_API_URL`).
- Test: `node test-wheel.js` (včetně simulace 40 000 roztočení).
