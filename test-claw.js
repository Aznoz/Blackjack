'use strict';
/** Test serverové části automatu na plyšáky: nákup 200/1000, spotřeba her, odměna, ochrany. */
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto');
const PORT = 3800 + Math.floor(Math.random() * 300);
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'claw-'));
const problems = []; const check = (c, m) => { if (!c) { problems.push(m); console.log('  !! ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tok = () => crypto.randomBytes(24).toString('base64url');
const call = async (a, body) => { const r = await fetch(`http://127.0.0.1:${PORT}/api/claw/${a}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR, TIME_SCALE: '0.04' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('běží') && r()));
  const t = tok();
  let r = await call('state', { token: t });
  check(r.s === 200 && r.j.balance === 5000 && r.j.plays === 0 && r.j.prizes.length === 7, 'počáteční stav: ' + JSON.stringify(r.j));
  check((await call('state', { token: 'x' })).s === 400, 'neplatný token přijat');
  check((await call('buy', { token: t, pack: 3 })).s === 400, 'neplatný balíček přijat');
  r = await call('buy', { token: t, pack: 1 }); check(r.j.balance === 4700 && r.j.plays === 1, '1 hra = 300: ' + JSON.stringify(r.j));
  r = await call('buy', { token: t, pack: 6 }); check(r.j.balance === 3200 && r.j.plays === 7, '6 her = 1500: ' + JSON.stringify(r.j));
  check((await call('claim', { token: t, playId: 1, prize: 'unicorn' })).s === 409, 'odměna bez spuštěné hry');
  r = await call('play', { token: t }); check(r.j.plays === 6 && r.j.playId, 'play spotřebuje hru');
  const pid = r.j.playId;
  check((await call('claim', { token: t, playId: pid, prize: 'unicorn' })).s === 409, 'odměna okamžitě po startu (moc rychle)');
  r = await call('play', { token: t }); const pid2 = r.j.playId; // nová hra přepíše starou
  check(pid2 !== pid && r.j.plays === 5, 'druhá hra');
  await sleep(500);
  check((await call('claim', { token: t, playId: pid, prize: 'chick' })).s === 409, 'odměna za starou hru');
  check((await call('claim', { token: t, playId: pid2, prize: 'dragon' })).s === 400, 'neznámý plyšák');
  await call('play', { token: t }); // předchozí claim zrušil hru; začni novou
  const st = await call('state', { token: t });
  r = await call('play', { token: t }); const pid3 = r.j.playId; await sleep(500);
  r = await call('claim', { token: t, playId: pid3, prize: 'panda' });
  check(r.s === 200 && r.j.won.value === 1500 && r.j.balance === 3200 + 1500, 'výhra pandy +1500: ' + JSON.stringify(r.j));
  check((await call('claim', { token: t, playId: pid3, prize: 'panda' })).s === 409, 'dvojí vyplacení jedné hry');
  // nedostatek žetonů
  let rr;
  const low = tok(); for (let i = 0; i < 3; i++) await call('buy', { token: low, pack: 6 }); // 4500, zbývá 500
  rr = await call('buy', { token: low, pack: 6 }); check(rr.s === 402, 'balíček za 1500 při 500 žetonech: ' + rr.s);
  rr = await call('buy', { token: low, pack: 1 }); check(rr.s === 200 && rr.j.balance === 200, 'hra za 300: ' + JSON.stringify(rr.j));
  rr = await call('buy', { token: low, pack: 1 }); check(rr.s === 402, 'nákup při 200 žetonech: ' + rr.s);
  // obnova kreditu: po dohrání všech her pod 200 -> 200 (pod 200 se dá spadnout jen bombou)
  const tiny = tok(); for (let i = 0; i < 2; i++) await call('buy', { token: tiny, pack: 6 }); for (let i = 0; i < 3; i++) await call('buy', { token: tiny, pack: 1 }); // 1100, 15 her
  let tp = await call('play', { token: tiny }); rr = await call('bomb', { token: tiny }); check(rr.s === 200 && rr.j.balance === 100, 'bomba srazí zůstatek na 100: ' + JSON.stringify(rr.j));
  rr = await call('end', { token: tiny, playId: tp.j.playId }); check(!rr.j.refilled && rr.j.balance === 100 && rr.j.plays === 14, 's nakoupenými hrami se nedoplňuje: ' + JSON.stringify(rr.j));
  let lastId; for (let i = 0; i < 14; i++) { tp = await call('play', { token: tiny }); lastId = tp.j.playId; if (i < 13) await call('end', { token: tiny, playId: lastId }); }
  rr = await call('state', { token: tiny }); check(!rr.j.refilled && rr.j.balance === 100, 'během hry se nedoplňuje');
  rr = await call('end', { token: tiny, playId: lastId });
  check(rr.j.plays === 0 && rr.j.balance === 200 && rr.j.refilled === true, 'obnova na 200 po dohrání: ' + JSON.stringify([rr.j.plays, rr.j.balance, rr.j.refilled]));
  // bomba: jen při hře, jednou za hru, nejvýš 2 vyplacení
  const nb0 = tok(); rr = await call('bomb', { token: nb0 });
  check(rr.s === 409, 'bomba bez rozehrané hry: ' + rr.s);
  const bt = tok(); await call('buy', { token: bt, pack: 6 }); const bp1 = await call('play', { token: bt });
  rr = await call('bomb', { token: bt });
  check(rr.s === 200 && rr.j.balance === 5000 - 1500 - 1000 && rr.j.bomb === true, 'bomba stojí 1000: ' + JSON.stringify(rr.j));
  const bid = rr.j.bombId;
  rr = await call('bomb', { token: bt }); check(rr.s === 409, 'druhá bomba v jedné hře: ' + rr.s);
  check((await call('bombclaim', { token: bt, bombId: bid, prize: 'frog' })).s === 409, 'výhra z bomby moc brzy');
  await sleep(2600);
  check((await call('bombclaim', { token: bt, bombId: bid + 99, prize: 'frog' })).s === 409, 'výhra z cizí bomby');
  check((await call('bombclaim', { token: bt, bombId: bid, prize: 'dragon' })).s === 400, 'neznámý plyšák z bomby');
  rr = await call('bombclaim', { token: bt, bombId: bid, prize: 'frog' });
  check(rr.s === 200 && rr.j.balance === 2500 + 750, 'výhra z bomby: ' + JSON.stringify(rr.j));
  rr = await call('bombclaim', { token: bt, bombId: bid, prize: 'chick' }); check(rr.s === 200, 'druhá výhra z bomby');
  rr = await call('bombclaim', { token: bt, bombId: bid, prize: 'chick' }); check(rr.s === 409, 'třetí výhra z bomby (max 2): ' + rr.s);
  await call('end', { token: bt, playId: bp1.j.playId });
  rr = await call('play', { token: bt }); rr = await call('bomb', { token: bt });
  check(rr.s === 429 && rr.j.bombIn > 0, 'cooldown bomby: ' + JSON.stringify([rr.s, rr.j.bombIn]));
  check((await call('state', { token: bt })).j.bombIn > 0, 'state hlásí zbývající cooldown');
  const lowB = tok(); for (let i = 0; i < 2; i++) await call('buy', { token: lowB, pack: 6 }); for (let i = 0; i < 3; i++) await call('buy', { token: lowB, pack: 1 }); // zbývá 1100
  const lp = await call('play', { token: lowB }); rr = await call('bomb', { token: lowB }); // 100
  await call('end', { token: lowB, playId: lp.j.playId }); await call('play', { token: lowB });
  await sleep(12200); // cooldown (TIME_SCALE 0.04 => 12 s)
  check((await call('state', { token: bt })).j.bombIn === 0, 'cooldown vypršel');
  rr = await call('bomb', { token: bt }); check(rr.s === 200, 'bomba po cooldownu znovu možná: ' + rr.s);
  rr = await call('bomb', { token: lowB }); check(rr.s === 402, 'bomba bez žetonů: ' + rr.s);
  const nb = tok(); check((await call('bombclaim', { token: nb, bombId: 1, prize: 'frog' })).s === 409, 'výhra bez bomby');
  // opuštěná hra (zavřená stránka) blokuje obnovu jen do dalšího načtení stránky
  const ab = tok(); await call('buy', { token: ab, pack: 6 }); await call('buy', { token: ab, pack: 6 }); await call('buy', { token: ab, pack: 6 }); // 500
  for (let i = 0; i < 1; i++) await call('buy', { token: ab, pack: 1 }); // 200
  check((await call('state', { token: ab })).j.refilled === false, 'bez poklesu pod 200 se nedoplňuje');
  // hry se ukládají (restart serveru)
  srv.kill('SIGTERM'); await new Promise((r2) => srv.once('exit', r2));
  const saved = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'players.json'), 'utf8'));
  check(Object.values(saved).some((a) => a.clawPlays === 3), 'clawPlays se neuložilo: ' + JSON.stringify(Object.values(saved).map((a) => a.clawPlays)));
  check(Object.values(saved).some((a) => a.bombAt > 0), 'bombAt se neuložilo');
  console.log(problems.length ? 'SELHALO' : 'Všechny kontroly automatu prošly.'); process.exit(problems.length ? 1 : 0);
})();
