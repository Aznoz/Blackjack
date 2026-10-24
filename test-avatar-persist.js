'use strict';
/** Profilovky v Upstash: po restartu bez disku se obrázek obnoví z Upstash; starší obrázek z disku se do Upstash dohraje. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const problems = [];
const check = (c, m) => { if (!c) { problems.push(m); console.log('  !! ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// minimální JPEG s hlavičkou SOF 64×64 (stačí pro kontrolu serveru)
function jpeg() {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x40, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0]), sof, Buffer.alloc(40, 7), Buffer.from([0xff, 0xd9])]);
}
const img = jpeg();
const hash = crypto.createHash('sha256').update(img).digest('hex').slice(0, 16);

function mockUpstash(store) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        const m = /^\/(get|set|del)\/(.+)$/.exec(req.url);
        const key = m ? decodeURIComponent(m[2]) : '';
        res.setHeader('Content-Type', 'application/json');
        if (!m) { res.statusCode = 404; return res.end('{}'); }
        if (m[1] === 'get') return res.end(JSON.stringify({ result: store.has(key) ? store.get(key) : null }));
        if (m[1] === 'set') { store.set(key, body); return res.end('{"result":"OK"}'); }
        store.delete(key); res.end('{"result":1}');
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function startServer(port, up, dir) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${up}`, UPSTASH_REDIS_REST_TOKEN: 'x' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (out.includes('běží')) resolve(p); });
    p.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
    p.on('error', reject);
    setTimeout(() => reject(new Error('server nenastartoval')), 8000);
  });
}
const get = (port, p) => new Promise((resolve) => http.get({ host: '127.0.0.1', port, path: p }, (r) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(c) })); }));

(async () => {
  const players = JSON.stringify({ 'g:abc': { name: 'Honza', balance: 3000, avatar: 'u:' + hash, custom: hash, stats: { rounds: 1 } } });

  // 1) nový server bez disku, obrázek jen v Upstash
  const store1 = new Map([['blackjack:players', players], ['blackjack:avatar-' + hash, img.toString('base64')]]);
  const up1 = await mockUpstash(store1);
  const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'av1-'));
  let port = 4100 + Math.floor(Math.random() * 400);
  let p = await startServer(port, up1.address().port, dir1);
  const r1 = await get(port, `/avatar/${hash}.jpg`);
  check(r1.status === 200 && r1.body.equals(img), 'obrázek se po restartu neobnovil z Upstash (status ' + r1.status + ')');
  check(fs.existsSync(path.join(dir1, 'avatars', hash + '.jpg')), 'obnovený obrázek se neuložil na disk');
  p.kill('SIGTERM'); await sleep(300); up1.close();

  // 2) starší obrázek jen na disku -> dohraje se do Upstash
  const store2 = new Map([['blackjack:players', players]]);
  const up2 = await mockUpstash(store2);
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'av2-'));
  fs.mkdirSync(path.join(dir2, 'avatars'));
  fs.writeFileSync(path.join(dir2, 'avatars', hash + '.jpg'), img);
  port = 4500 + Math.floor(Math.random() * 400);
  p = await startServer(port, up2.address().port, dir2);
  await sleep(600);
  check(store2.get('blackjack:avatar-' + hash) === img.toString('base64'), 'obrázek z disku se nedohrál do Upstash');
  const r2 = await get(port, `/avatar/${hash}.jpg`);
  check(r2.status === 200, 'obrázek z disku se neservíruje');
  p.kill('SIGTERM'); await sleep(300); up2.close();

  // 3) účet odkazuje na obrázek, který nikde není -> vrátí se předvolba
  const store3 = new Map([['blackjack:players', players]]);
  const up3 = await mockUpstash(store3);
  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'av3-'));
  port = 4900 + Math.floor(Math.random() * 400);
  p = await startServer(port, up3.address().port, dir3);
  const r3 = await get(port, `/avatar/${hash}.jpg`);
  check(r3.status === 404, 'chybějící obrázek má dát 404, dal ' + r3.status);
  p.kill('SIGTERM'); await sleep(300); up3.close();

  console.log(problems.length ? '\nSELHALO' : '\nVšechny kontroly ukládání profilovek prošly.');
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.log('SELHALO:', e.message); process.exit(1); });
