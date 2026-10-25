// Místnosti Vesmírné štvanice: lobby, start s boty, celá hra se dvěma lidmi + 2 boty, AFK a odpojení.
process.env.STVANICE_FAST = '1';
process.env.STVANICE_BOT_MIN_MS = '1';
process.env.STVANICE_BOT_MAX_MS = '3';
import assert from 'node:assert/strict';
const { handle, rooms } = await import('./stvanice/stvanice.js');
const { Bot } = await import('./stvanice/bot.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fakeWs() { const ws = { readyState: 1, out: [], ctx: null, send(d) { this.out.push(JSON.parse(d)); }, close() { this.readyState = 3; }, on() {} }; return ws; }
const last = (ws, t) => [...ws.out].reverse().find((m) => m.t === t);

// --- lobby
const a = fakeWs(); const b = fakeWs();
handle(a, { t: 'create', name: 'Honza' });
const code = last(a, 'joined').code;
handle(b, { t: 'join', code, name: 'Eva' });
assert.equal(last(b, 'state').lobby.length, 2);
handle(b, { t: 'config', total: 8 }); // jen host smí
assert.equal(last(a, 'state').total, 4);
handle(a, { t: 'config', total: 6, speed: 'rychle' });
assert.equal(last(a, 'state').total, 6);
handle(a, { t: 'config', total: 99 });
assert.equal(last(a, 'state').total, 8);
handle(a, { t: 'config', total: 4 });

// --- hra: lidé jako boti přes handle(), ostatní hráče řídí server
handle(a, { t: 'start' });
const room = rooms.get(code);
assert.equal(room.phase, 'game'); assert.equal(room.game.players.length, 4);
assert.equal(room.game.players.filter((p) => p.bot).length, 2);
const brains = new Map(); let humanActs = 0; let rejects = 0;
const t0 = Date.now();
while (room.phase === 'game' && Date.now() - t0 < 60000) {
  const g = room.game; const pd = g.pending;
  if (pd && (pd.pid === 'p1' || pd.pid === 'p2')) {
    if (!brains.has(pd.pid)) brains.set(pd.pid, new Bot(g, pd.pid));
    const act = brains.get(pd.pid).decide();
    const ws = pd.pid === 'p1' ? a : b;
    const before = ws.out.length;
    handle(ws, { t: 'act', a: act });
    if (ws.out.slice(before).some((m) => m.t === 'reject')) rejects++;
    humanActs++;
  } else await sleep(2);
}
assert.equal(room.phase, 'over', 'hra skončila');
assert.equal(rejects, 0);
const st = last(a, 'state');
assert.ok(st.game.result && st.game.result.winners.length);
// ve výsledku jsou vidět všechny role, před koncem cizí role skryté
assert.ok(st.game.players.every((p) => p.role));
// --- ještě jednou
handle(a, { t: 'again' });
assert.equal(room.phase, 'lobby');
handle(a, { t: 'start' });
assert.equal(room.phase, 'game');
// skryté role: ve hře vidím jen svoji a kapitánovu
const sv = last(b, 'state').game;
const hidden = sv.players.filter((p) => p.id !== 'p2' && p.role !== null && p.role !== 'kapitan');
assert.equal(hidden.length, 0, 'cizí role nesmí unikat');
const others = sv.players.filter((p) => p.id !== 'p2');
assert.ok(others.every((p) => p.hand === undefined), 'cizí ruce nesmí unikat');

// --- AFK: nikdo z lidí nehraje → po vypršení časů převezmou boti a hra dojede
const t1 = Date.now();
while (room.phase === 'game' && Date.now() - t1 < 60000) await sleep(20);
assert.equal(room.phase, 'over', 'AFK hra dojela s boty');
assert.ok(room.players.every((p) => p.afk), 'oba lidé označeni jako AFK');

// --- odpojení a návrat
handle(a, { t: 'again' });
handle(a, { t: 'start' });
const tok = last(b, 'joined').token;
b.readyState = 3; handle(b, { t: 'leave' });
assert.ok(rooms.has(code));
const b2 = fakeWs();
handle(b2, { t: 'resume', code, token: tok });
assert.ok(last(b2, 'err') && last(b2, 'err').gone, 'po dobrovolném odchodu se nelze vrátit');
console.log(`stvanice místnosti OK (lidských tahů ${humanActs})`);
process.exit(0);
