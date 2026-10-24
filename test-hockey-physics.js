'use strict';
const assert = require('assert');
const P = require('./hockey-physics');
const { Rink, W, H, PUCK_R, MALLET_R, GY1, GY2, MAX_PUCK_SPEED, EV_GOAL, EV_HIT, EV_WALL } = P;
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const run = (r, ticks, live = true) => { let ev = 0; for (let i = 0; i < ticks; i++) { ev |= r.step(live); if (ev & EV_GOAL) break; } return ev; };

test('puk odražený od horní a dolní zdi zůstane na stole', () => {
  const r = new Rink(); r.puck = { x: 500, y: 300, vx: 300, vy: -1500 };
  for (let i = 0; i < 600; i++) { r.step(); assert(r.puck.y >= PUCK_R - 1e-6 && r.puck.y <= H - PUCK_R + 1e-6, 'y mimo stůl: ' + r.puck.y); if (r.goal !== null) break; }
});
test('rychlý puk neprojde pálkou ani zdí (žádné prostřelení)', () => {
  for (let k = 0; k < 200; k++) {
    const r = new Rink(); r.setTarget(0, 300, 300); run(r, 40, false);
    r.puck = { x: 480, y: 300 + (Math.random() - .5) * 40, vx: -MAX_PUCK_SPEED, vy: (Math.random() - .5) * 400 };
    let hit = false;
    for (let i = 0; i < 60 && !hit; i++) { hit = !!(r.step() & EV_HIT); assert(r.puck.x > r.mallets[0].x - 1, 'puk prošel pálkou'); }
  }
});
test('puk se nikdy neodrazí rychleji než MAX_PUCK_SPEED', () => {
  const r = new Rink(); r.puck = { x: 300, y: 280, vx: 0, vy: 0 };
  r.mallets[0].x = 280; r.mallets[0].tx = 340; r.mallets[0].ty = 280;
  let max = 0; for (let i = 0; i < 300; i++) { r.step(); max = Math.max(max, Math.hypot(r.puck.vx, r.puck.vy)); if (r.goal !== null) break; }
  assert(max <= MAX_PUCK_SPEED + 1e-6, 'rychlost ' + max);
});
test('gól do levé branky dostane hráč 1, do pravé hráč 0', () => {
  let r = new Rink(); r.puck = { x: 60, y: H / 2, vx: -900, vy: 0 };
  assert(run(r, 120) & EV_GOAL); assert.strictEqual(r.goal, 1);
  r = new Rink(); r.puck = { x: W - 60, y: H / 2, vx: 900, vy: 0 };
  assert(run(r, 120) & EV_GOAL); assert.strictEqual(r.goal, 0);
});
test('puk mimo otvor branky se od zdi odrazí (není gól)', () => {
  const r = new Rink(); r.puck = { x: 60, y: GY1 - 60, vx: -900, vy: 0 };
  run(r, 120); assert.strictEqual(r.goal, null); assert(r.puck.x >= PUCK_R - 1e-6);
});
test('tyčka branky odrazí puk', () => {
  const r = new Rink(); r.puck = { x: 80, y: GY1 - 10, vx: -700, vy: 40 };
  const ev = run(r, 60); assert(ev & EV_WALL);
});
test('pálka zůstane na vlastní polovině a ve stole', () => {
  const r = new Rink();
  for (const [x, y] of [[900, 100], [-50, -50], [500, 9999], [W, H]]) { r.setTarget(0, x, y); run(r, 120, false); assert(r.mallets[0].x <= W / 2 - MALLET_R + 1e-6 && r.mallets[0].x >= MALLET_R - 1e-6); assert(r.mallets[0].y >= MALLET_R - 1e-6 && r.mallets[0].y <= H - MALLET_R + 1e-6); }
  r.setTarget(1, 100, 100); run(r, 120, false); assert(r.mallets[1].x >= W / 2 + MALLET_R - 1e-6);
});
test('pálka se nemůže teleportovat (limit rychlosti)', () => {
  const r = new Rink(); r.setTarget(0, 450, 500); r.step(false);
  const d = Math.hypot(r.mallets[0].x - 110, r.mallets[0].y - H / 2);
  assert(d <= P.MAX_MALLET_SPEED * P.DT + 1e-6, 'skok ' + d);
});
test('neplatné cíle (NaN, Infinity) se ignorují', () => {
  const r = new Rink(); r.setTarget(0, NaN, 5); r.setTarget(0, Infinity, 5); r.setTarget(1, 'a', {}); run(r, 5, false);
  assert(Number.isFinite(r.mallets[0].x) && Number.isFinite(r.mallets[1].y));
});
test('náhodný zápas 200 000 ticků: žádné NaN, puk vždy na stole nebo v brance', () => {
  const r = new Rink(); r.reset(0);
  for (let i = 0; i < 200000; i++) {
    if (i % 7 === 0) { r.setTarget(0, Math.random() * 500, Math.random() * H); r.setTarget(1, 500 + Math.random() * 500, Math.random() * H); }
    r.step();
    const p = r.puck; assert(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.vx) && Number.isFinite(p.vy), 'NaN');
    if (r.goal !== null) r.reset(r.goal);
    assert(p.y >= 0 && p.y <= H && p.x > -PUCK_R * 2 && p.x < W + PUCK_R * 2, `puk mimo stůl ${p.x},${p.y}`);
  }
});
test('puk zastavený pálkou u zdi neuvízne ve zdi', () => {
  const r = new Rink(); r.puck = { x: 30, y: 80, vx: 0, vy: 0 };
  r.mallets[0].x = 70; r.mallets[0].y = 80; r.setTarget(0, 20, 80);
  run(r, 120); assert(r.puck.x >= PUCK_R - 0.5 && r.puck.y >= PUCK_R - 0.5);
});
console.log(`\n${n} testů fyziky prošlo.`);
