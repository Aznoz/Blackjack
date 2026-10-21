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

- Hlavní menu: Rychlá hra, Stoly (lobby + vytvoření vlastního stolu), Žebříček, Nastavení, Pravidla
- **Nastavení → přezdívka** (2–16 znaků), zapnutí/vypnutí zvuků
- Stoly pro 5 hráčů, 3 stálé stoly + libovolné vlastní (prázdný vlastní stůl se sám zruší)
- Hráč začíná s **5 000 chipy**, zůstatek **nikdy nespadne pod 200** (po prohře se doplní na 200)
- Sázka **min 100, max 80 % aktuálního zůstatku**, zaokrouhleno dolů (vždy násobek 10;
  krok zaokrouhlení: <1 000 → 10, <10 000 → 50, <100 000 → 100, výš 1 000)
- Plná pravidla: 6 balíčků, blackjack 3:2, dealer stojí na měkké 17, dealer koukne na skrytou kartu,
  pojištění 2:1, double (i po splitu), split až na 4 ruce, k splitnutým esům jen jedna karta
- Odpojení / refresh stránky: hráč se vrátí na své místo, účet i zůstatek zůstanou
- Časovače: 15 s na sázku (po první sázce), 20 s na tah, nečinný hráč se po 3 kolech odpojí
- Ovládání z klávesnice: `H` hit, `S` stand, `D` double, `P` split, `Enter` potvrdí sázku

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
| `DATA_DIR` | `./data` | kde se ukládá `players.json` |
| `ALLOWED_ORIGINS` | (vše) | čárkami oddělený seznam povolených původů WebSocketu, např. `https://hra.example.cz` |

Poznámky k provozu:

- **Účet = tajný token v prohlížeči** (`localStorage`). Smazání dat prohlížeče znamená ztrátu účtu.
  Server ukládá jen SHA-256 hash tokenu. Registrace ani hesla v téhle verzi nejsou.
- Zůstatky a statistiky jsou v `data/players.json` – **zálohuj ho**. Při řádném vypnutí (SIGTERM/SIGINT)
  se rozehrané sázky vrátí a data se uloží.
- Server je jeden proces v paměti, jedna instance zvládne desítky až stovky hráčů. Pro víc instancí by
  stoly a účty musely být ve sdíleném úložišti.
- Stránku lze vložit do jiného webu přes `<iframe>` ze stejné domény; ze cizí domény ji blokuje
  hlavička `X-Frame-Options` (změň v `server.js`, pokud potřebuješ).

## Soubory

```
server.js        HTTP + WebSocket server, stoly, kola, účty
rules.js         čistá logika: hodnota ruky, bota, limity sázek, výplaty, konfigurace (CFG)
public/          klient: index.html, style.css, game.js
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
