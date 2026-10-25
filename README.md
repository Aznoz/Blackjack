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
