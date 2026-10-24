'use strict';
/**
 * Test Google přihlášení, oblíbených her a propojení zůstatku s Google účtem.
 * Falešné Google klíče (JWKS) servíruje lokální server, takže běží skutečný kód ověřování.
 * Druhá část ověřuje ukládání do Upstash (falešný REST server).
 */
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const PORT = 3800 + Math.floor(Math.random() * 100);
const JWKS_PORT = PORT + 150;
const UP_PORT = PORT + 300;
const BASE = `http://127.0.0.1:${PORT}`;
const problems = [];
const problem = (m) => { if (!problems.includes(m)) { problems.push(m); console.log('  !! ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (cond, msg) => { if (!cond) problem(msg); };

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };

function makeJwt(claims = {}, opts = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: opts.alg || 'RS256', kid: opts.kid || 'k1', typ: 'JWT' };
  const payload = { iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '1000', name: 'Honza Test', email: 'honza@example.com', picture: 'https://lh3.example/p.jpg', iat: now, exp: now + 3600, ...claims };
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = b(header) + '.' + b(payload);
  const sig = opts.alg === 'none' ? '' : crypto.sign('RSA-SHA256', Buffer.from(data), opts.key || privateKey).toString('base64url');
  return data + '.' + sig;
}

function startServer(dataDir, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', TIME_SCALE: '0.04', DATA_DIR: dataDir, GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_JWKS_URL: `http://127.0.0.1:${JWKS_PORT}/certs`, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (out.includes('běží')) resolve(p); });
    p.stderr.on('data', (d) => process.stderr.write('[server stderr] ' + d));
    p.on('error', reject);
    setTimeout(() => reject(new Error('server nenastartoval')), 8000);
  });
}
const stop = (p) => new Promise((r) => { p.once('exit', r); p.kill('SIGTERM'); });

async function api(method, url, body, token, origin) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  if (origin) headers.Origin = origin;
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch (e) { /* ignore */ }
  return { status: res.status, json, headers: res.headers };
}

class Client {
  constructor(session) {
    this.token = crypto.randomBytes(24).toString('base64url');
    this.session = session;
    this.welcome = null; this.kicked = false;
  }
  connect() {
    return new Promise((resolve) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'hello', token: this.token, session: this.session })));
      this.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'welcome') { this.welcome = m; resolve(m); } if (m.t === 'kicked') this.kicked = true; });
      this.ws.on('error', () => {});
    });
  }
  close() { try { this.ws.terminate(); } catch (e) { /* ignore */ } }
}

async function main() {
  const jwks = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); }).listen(JWKS_PORT, '127.0.0.1');
  const dataDir = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'bj-google-'));
  let server = await startServer(dataDir);

  // --- neplatné přihlášení ---
  const bad = [
    ['bez tokenu', undefined],
    ['nesmysl', 'abc.def.ghi'],
    ['cizí podpis', makeJwt({}, { key: other.privateKey })],
    ['špatné aud', makeJwt({ aud: 'jina-aplikace' })],
    ['expirovaný', makeJwt({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ['špatný iss', makeJwt({ iss: 'https://evil.example' })],
    ['alg none', makeJwt({}, { alg: 'none' })],
    ['neznámý kid', makeJwt({}, { kid: 'zzz' })],
    ['špatné sub', makeJwt({ sub: '../x' })],
  ];
  for (const [name, credential] of bad) {
    const r = await api('POST', '/api/login', { credential });
    check(r.status === 401, `login přijal neplatný token (${name}): ${r.status}`);
  }
  check((await api('GET', '/api/me')).status === 401, '/api/me bez relace není 401');
  check((await api('GET', '/api/me', undefined, 'x'.repeat(40))).status === 401, '/api/me s cizí relací není 401');

  // --- platné přihlášení (zařízení A hrálo anonymně, přihlášení převezme jeho účet) ---
  const A = new Client(undefined);
  const wa = await A.connect();
  check(!wa.linked && wa.balance === 5000, 'anonymní hráč nemá 5000');
  A.ws.send(JSON.stringify({ t: 'setName', name: 'Honzik' })); await sleep(150);
  A.close(); await sleep(150);
  const ok = await api('POST', '/api/login', { credential: makeJwt(), anonToken: A.token });
  check(ok.status === 200 && ok.json && ok.json.session && ok.json.profile.email === 'honza@example.com', 'platné přihlášení selhalo: ' + JSON.stringify(ok.json));
  const session = ok.json.session;
  check(!JSON.stringify(ok.json.profile).includes('"sub"'), 'profil prozrazuje sub');
  check(ok.json.profile.balance === 5000 && ok.json.profile.favorites.length === 0 && /^a(10|[1-9])$/.test(ok.json.profile.avatar) && ok.json.profile.name === 'Honzik', 'převzatý účet má mít zůstatek 5000, předvolbu a jméno Honzik: ' + JSON.stringify(ok.json.profile));

  // --- CORS ---
  const pre = await fetch(BASE + '/api/favorites', { method: 'OPTIONS', headers: { Origin: 'https://utube.unas.cz', 'Access-Control-Request-Method': 'PUT' } });
  check(pre.status === 204 && pre.headers.get('access-control-allow-origin') && /PUT/.test(pre.headers.get('access-control-allow-methods') || ''), 'CORS preflight nefunguje');

  // --- oblíbené ---
  const f1 = await api('PUT', '/api/favorites', { favorites: ['blackjack', 'blackjack', 'x-y'] }, session);
  check(f1.status === 200 && f1.json.favorites.join() === 'blackjack,x-y', 'uložení oblíbených: ' + JSON.stringify(f1.json));
  for (const badFav of [['A'], ['a'.repeat(40)], 'blackjack', [1], Array.from({ length: 60 }, (_, i) => 'g' + i), null]) {
    const r = await api('PUT', '/api/favorites', { favorites: badFav }, session);
    check(r.status === 400, 'oblíbené přijaly neplatná data ' + JSON.stringify(badFav).slice(0, 30));
  }
  check((await api('GET', '/api/me', undefined, session)).json.favorites.join() === 'blackjack,x-y', 'oblíbené se neuložily');
  check((await api('PUT', '/api/favorites', { favorites: ['blackjack'] }, 'y'.repeat(40))).status === 401, 'cizí relace smí měnit oblíbené');

  // --- propojení zůstatku ---
  // stejné zařízení (stejný token), teď s relací -> převezme se anonymní účet
  const A2 = new Client(session); A2.token = A.token;
  const wa2 = await A2.connect();
  check(wa2.linked && wa2.linked.email === 'honza@example.com', 'welcome nehlásí propojení');
  check(wa2.name === 'Honzik', 'převzetí anonymního účtu neselhalo: ' + wa2.name);
  check(!wa2.isNew, 'účet převzatý při přihlášení nemá být isNew');
  A2.close(); await sleep(150);
  // jiné zařízení (jiný token) se stejnou relací -> stejný účet
  const B = new Client(session);
  const wb = await B.connect();
  check(wb.linked && wb.name === 'Honzik', 'druhé zařízení nevidí stejný účet: ' + wb.name);
  B.close(); await sleep(150);
  // původní token bez relace už nesmí vést na Google účet (nový anonymní účet)
  const A3 = new Client(undefined); A3.token = A.token;
  const wa3 = await A3.connect();
  check(!wa3.linked && wa3.name !== 'Honzik' && wa3.isNew, 'po odhlášení token pořád ukazuje na Google účet: ' + wa3.name);
  A3.close();
  // neplatná relace -> anonymní účet + příznak
  const C = new Client('Z'.repeat(40));
  const wc = await C.connect();
  check(!wc.linked && wc.sessionInvalid === true, 'neplatná relace není ohlášena');
  C.close();
  // druhý Google uživatel dostane vlastní účet
  const ok2 = await api('POST', '/api/login', { credential: makeJwt({ sub: '2000', email: 'jana@example.com', name: 'Jana' }) });
  const D = new Client(ok2.json.session);
  const wd = await D.connect();
  check(wd.linked && wd.name === 'Jana', 'druhý uživatel nemá vlastní účet s jménem z Googlu: ' + wd.name);
  D.close(); await sleep(100);
  const me1 = await api('GET', '/api/me', undefined, session);
  check(me1.json.balance === 5000 && me1.json.name === 'Honzik', 'profil nezobrazuje společný účet: ' + JSON.stringify(me1.json));
  check((await api('GET', '/api/me', undefined, ok2.json.session)).json.favorites.length === 0, 'oblíbené se míchají mezi uživateli');

  // --- jméno a profilovka přes API (nastavení účtu na hlavní stránce) ---
  const sess2 = ok2.json.session;
  const pn = await api('PUT', '/api/profile', { name: 'Janička' }, sess2);
  check(pn.status === 200 && pn.json.name === 'Janička', 'změna jména přes API: ' + JSON.stringify(pn.json));
  for (const badName of ['', 'x', '<script>', 'a'.repeat(30), 5]) {
    check((await api('PUT', '/api/profile', { name: badName }, sess2)).status === 400, 'API přijalo neplatné jméno ' + JSON.stringify(badName));
  }
  check((await api('PUT', '/api/profile', { name: 'Hacker' })).status === 401, 'změna jména bez relace');
  const pa = await api('PUT', '/api/avatar', { avatar: 'a4' }, sess2);
  check(pa.status === 200 && pa.json.avatar === 'a4', 'výběr předvolby přes API');
  check((await api('PUT', '/api/avatar', { avatar: 'u:0123456789abcdef' }, sess2)).status === 400, 'API přijalo cizí obrázek');
  const sofJpeg = (w, h) => {
    const sof = Buffer.alloc(19); sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17, 2); sof[4] = 8; sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7); sof[9] = 3;
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]), sof, Buffer.alloc(40, 1), Buffer.from([0xff, 0xd9])]);
  };
  const up1 = await api('POST', '/api/avatar', { data: sofJpeg(256, 256).toString('base64') }, sess2);
  check(up1.status === 200 && /^u:[0-9a-f]{16}$/.test(up1.json.avatar) && up1.json.custom, 'nahrání profilovky přes API: ' + JSON.stringify(up1.json));
  check((await api('POST', '/api/avatar', { data: sofJpeg(256, 256).toString('base64') }, sess2)).status === 400, 'chybí cooldown nahrávání přes API');
  if (up1.json && up1.json.custom) {
    const img = await fetch(`${BASE}/avatar/${up1.json.custom}.jpg`);
    check(img.status === 200, 'nahraný obrázek není dostupný');
  }
  // změna jména se projeví v otevřené hře
  const live = new Client(sess2); await live.connect();
  const seen = [];
  live.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'profile') seen.push(m); });
  await api('PUT', '/api/profile', { name: 'NovéJméno' }, sess2); await sleep(200);
  check(seen.some((m) => m.name === 'NovéJméno' && m.saved === 'name'), 'otevřená hra nedostala změnu jména');
  live.close();
  // přihlášení s anonymním tokenem převede postup (zůstatek, jméno) hned při loginu
  const anon = new Client(undefined); await anon.connect();
  anon.ws.send(JSON.stringify({ t: 'setName', name: 'Anonym' })); await sleep(150); anon.close(); await sleep(100);
  const ok3 = await api('POST', '/api/login', { credential: makeJwt({ sub: '4000', email: 'x@example.com', name: 'Xavier' }), anonToken: anon.token });
  check(ok3.status === 200 && ok3.json.profile.name === 'Anonym', 'login nepřevzal anonymní účet: ' + JSON.stringify(ok3.json));

  // --- perzistence po restartu ---
  await stop(server);
  check(fs.existsSync(path.join(dataDir, 'google.json')), 'google.json nevznikl');
  const gtxt = fs.readFileSync(path.join(dataDir, 'google.json'), 'utf8');
  check(!gtxt.includes(session), 'relační token je uložen v čitelné podobě');
  server = await startServer(dataDir);
  const me2 = await api('GET', '/api/me', undefined, session);
  check(me2.status === 200 && me2.json.favorites.join() === 'blackjack,x-y' && me2.json.name === 'Honzik', 'po restartu se data ztratila');

  // --- odhlášení a smazání ---
  const out = await api('POST', '/api/logout', {}, ok2.json.session);
  check(out.status === 200 && (await api('GET', '/api/me', undefined, ok2.json.session)).status === 401, 'odhlášení neukončilo relaci');
  const E = new Client(session); await E.connect();
  const del = await api('DELETE', '/api/account', undefined, session);
  check(del.status === 200, 'smazání účtu selhalo');
  await sleep(200);
  check(E.kicked, 'smazání účtu nevyhodilo otevřené spojení');
  check((await api('GET', '/api/me', undefined, session)).status === 401, 'relace po smazání stále platí');
  E.close();
  const after = JSON.parse(fs.readFileSync(path.join(dataDir, 'players.json'), 'utf8'));
  check(!Object.keys(after).some((k) => k.startsWith('g:1000')), 'blackjack účet zůstal po smazání Google účtu');
  const F = new Client(undefined); F.token = crypto.randomBytes(24).toString('base64url');
  await stop(server);

  // --- ověření: bez GOOGLE_CLIENT_ID vrací 503 ---
  server = await startServer(fs.mkdtempSync(path.join(os.tmpdir(), 'bj-g2-')), { GOOGLE_CLIENT_ID: '' });
  check((await api('POST', '/api/login', { credential: makeJwt() })).status === 503, 'bez Client ID má login vracet 503');
  await stop(server);

  // --- Upstash (falešný REST) ---
  const kv = new Map();
  const up = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer tok') { res.writeHead(401); return res.end('{}'); }
    const m = /^\/(get|set)\/(.+)$/.exec(req.url);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (m[1] === 'set') { kv.set(decodeURIComponent(m[2]), Buffer.concat(chunks).toString('utf8')); return res.end('{"result":"OK"}'); }
      res.end(JSON.stringify({ result: kv.has(decodeURIComponent(m[2])) ? kv.get(decodeURIComponent(m[2])) : null }));
    });
  }).listen(UP_PORT, '127.0.0.1');
  const upEnv = { UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${UP_PORT}`, UPSTASH_REDIS_REST_TOKEN: 'tok' };
  server = await startServer(fs.mkdtempSync(path.join(os.tmpdir(), 'bj-up1-')), upEnv);
  const l = await api('POST', '/api/login', { credential: makeJwt({ sub: '3000', email: 'up@example.com' }) });
  await api('PUT', '/api/favorites', { favorites: ['blackjack'] }, l.json.session);
  const G = new Client(l.json.session); await G.connect();
  G.ws.send(JSON.stringify({ t: 'setName', name: 'Uptest' })); await sleep(200); G.close();
  await stop(server); // shutdown počká na odeslání
  check(kv.has('blackjack:google') && kv.has('blackjack:players'), 'data se neodeslala do Upstash: ' + [...kv.keys()]);
  // nový server s prázdným diskem: data se načtou z Upstash
  server = await startServer(fs.mkdtempSync(path.join(os.tmpdir(), 'bj-up2-')), upEnv);
  const me3 = await api('GET', '/api/me', undefined, l.json.session);
  check(me3.status === 200 && me3.json.favorites.join() === 'blackjack' && me3.json.name === 'Uptest', 'data se z Upstash po restartu nenačetla: ' + JSON.stringify(me3.json));
  await stop(server);
  up.close(); jwks.close();
}

main().then(() => {
  if (problems.length) { console.log(`\nSELHALO – ${problems.length} problémů`); process.exit(1); }
  console.log('Všechny kontroly Google/Upstash prošly.');
  process.exit(0);
}).catch((e) => { console.error('\nSELHALO:', e); process.exit(1); });
