/* Automat na plyšáky – hra pro jednoho hráče (3D, vlastní WebGL engine v gl.js).
 * Zůstatek a nákup her řeší server (/api/claw/*), samotná hra běží v prohlížeči. */
(function () {
  'use strict';
  const { M, Renderer } = window.MiniGL;
  const $ = (s) => document.querySelector(s);
  const rng = () => (typeof window.__rng === 'function' ? window.__rng() : Math.random());
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (n) => Number(n || 0).toLocaleString('cs-CZ');

  // ---- úložiště a server --------------------------------------------------------------------------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };
  let memToken = null;
  function getToken() {
    let t = null;
    try { t = JSON.parse(store.get('bj_token')); } catch (e) { t = store.get('bj_token'); }
    t = t || memToken;
    if (!t || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) {
      const b = new Uint8Array(24); crypto.getRandomValues(b);
      t = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      store.set('bj_token', JSON.stringify(t)); memToken = t;
    }
    return t;
  }
  function getSession() { let s = store.get('portal_session'); try { s = JSON.parse(s); } catch (e) { /* surový řetězec */ } return typeof s === 'string' ? s : undefined; }
  function apiBase() {
    const P = window.PORTAL || {};
    if (window.CLAW_API_URL) return String(window.CLAW_API_URL).replace(/\/+$/, '');
    if (P.apiUrl) return String(P.apiUrl).replace(/\/+$/, '');
    const ws = window.BJ_WS_URL || window.AH_WS_URL;
    if (ws) { try { const u = new URL(ws); return (u.protocol === 'wss:' ? 'https://' : 'http://') + u.host; } catch (e) { /* ignore */ } }
    return location.origin;
  }
  const API = apiBase();
  async function api(action, body = {}) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 75000);
    try {
      const res = await fetch(`${API}/api/claw/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ token: getToken(), session: getSession(), ...body }),
      });
      let json = null; try { json = await res.json(); } catch (e) { /* ignore */ }
      return { ok: res.ok, status: res.status, json: json || {} };
    } catch (e) { return { ok: false, status: 0, json: { error: 'Server neodpovídá.' } }; } finally { clearTimeout(timer); }
  }

  // ---- zvuk ---------------------------------------------------------------------------------------
  let soundOn = store.get('claw_sound') !== '0';
  let actx = null;
  function tone(f, d, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d);
      g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + d + 0.02);
    } catch (e) { /* ignore */ }
  }
  const sfx = {
    coin() { tone(880, 0.09, 'square', 0.07); tone(1320, 0.16, 'square', 0.07, 0, 0.08); },
    drop() { tone(420, 0.5, 'sawtooth', 0.05, -300); },
    grab() { tone(160, 0.12, 'square', 0.1); tone(110, 0.2, 'square', 0.08, 0, 0.08); },
    slip() { tone(300, 0.35, 'triangle', 0.1, -200); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 0, i * 0.09)); },
    lose() { tone(330, 0.25, 'triangle', 0.09, -80); tone(247, 0.4, 'triangle', 0.09, -60, 0.2); },
    tick() { tone(1500, 0.03, 'square', 0.03); },
    boom() { tone(120, 0.7, 'sawtooth', 0.2, -100); tone(70, 0.9, 'square', 0.15, -50, 0.02); tone(900, 0.25, 'sawtooth', 0.08, -800); },
  };

  // ---- plyšáci --------------------------------------------------------------------------------------
  // r = poloměr kolize, hold = šance, že plyšák cestou k výdejnímu otvoru nevyklouzne
  const LOOKS = {
    chick: { r: 0.52, hold: 0.5, perfect: 0.4, emoji: '🐥', name: 'Kuřátko', value: 600 },
    frog: { r: 0.56, hold: 0.38, perfect: 0.3, emoji: '🐸', name: 'Žabka', value: 750 },
    bear: { r: 0.6, hold: 0.28, perfect: 0.2, emoji: '🧸', name: 'Medvídek', value: 900 },
    bunny: { r: 0.6, hold: 0.2, perfect: 0.1, emoji: '🐰', name: 'Králíček', value: 1200 },
    panda: { r: 0.64, hold: 0.14, perfect: 0.09, emoji: '🐼', name: 'Panda', value: 1500 },
    unicorn: { r: 0.74, hold: 0.09, perfect: 0.05, emoji: '🦄', name: 'Jednorožec', value: 2200 },
    phone: { r: 0.7, hold: 0.012, perfect: 0.02, grab: 0.45, emoji: '📱', name: 'Telefon', value: 3500 }, // extrémně těžké vylovit (a spawnuje se daleko od otvoru)
  };
  const ORDER = ['chick', 'frog', 'bear', 'bunny', 'panda', 'unicorn', 'phone'];
  const COUNTS = { chick: 4, frog: 4, bear: 3, bunny: 2, panda: 2, unicorn: 1, phone: 1 };
  const FUR = { shine: 6, spec: 0.05, rim: 0.4 };

  // ---- svět -----------------------------------------------------------------------------------------
  const HALF = 4;                  // vnitřní půdorys ±4
  const HOLE = { x1: -4, x2: -2.05, z1: 2.05, z2: 4 };
  const HOME = { x: -3.0, z: 3.0 };
  const GH = 1.5; // výška skla kolem výdejního otvoru
  const GLASS = [{ ax: HOLE.x2, az: HOLE.z1, bx: HOLE.x2, bz: HOLE.z2, nx: 1, nz: 0 }, { ax: HOLE.x1, az: HOLE.z1, bx: HOLE.x2, bz: HOLE.z1, nx: 0, nz: 1 }];
  function glassNear(x, z) { // nejbližší bod skla: {d, qx, qz, w}
    let best = null;
    for (const w of GLASS) {
      const abx = w.bx - w.ax, abz = w.bz - w.az, t = clamp(((x - w.ax) * abx + (z - w.az) * abz) / (abx * abx + abz * abz), 0, 1);
      const qx = w.ax + abx * t, qz = w.az + abz * t, d = Math.hypot(x - qx, z - qz);
      if (!best || d < best.d) best = { d, qx, qz, w };
    }
    return best;
  }
  const HUB_TOP = 6.5, HUB_MIN = 0.72, LIM = 3.4;
  const plush = [];
  let nextId = 1;

  const inHole = (p) => p.x > HOLE.x1 && p.x < HOLE.x2 && p.z > HOLE.z1 && p.z < HOLE.z2;

  function spawn(id, opts = {}) {
    const L = LOOKS[id];
    let x, z, tries = 0;
    do {
      x = (rng() * 2 - 1) * (HALF - L.r - 0.1); z = (rng() * 2 - 1) * (HALF - L.r - 0.1); tries++;
      if (id === 'phone') { x = 1.2 + rng() * (HALF - L.r - 1.3); z = -(1.2 + rng() * (HALF - L.r - 1.3)); } // telefon: vždy v nejvzdálenějším rohu od výdejního otvoru
    } while (x < -1.1 && z > 1.1 && tries < 40);
    const p = { uid: nextId++, id, r: L.r, m: L.r * L.r * L.r, x, y: opts.y == null ? L.r : opts.y, z, vx: 0, vy: 0, vz: 0,
      yaw: rng() * Math.PI * 2, tx: (rng() - 0.5) * 0.5, tz: (rng() - 0.5) * 0.5, held: false, sway: 0 };
    plush.push(p);
    return p;
  }

  function physStep(dt, events) {
    for (const p of plush) {
      if (p.held) continue;
      p.vy -= 24 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const hole = inHole(p);
      if (!hole) {
        if (p.y < p.r) {
          p.y = p.r; if (p.vy < 0) p.vy = -p.vy * 0.08;
          const f = Math.exp(-10 * dt); p.vx *= f; p.vz *= f;
        }
      } else if (p.y < -2.1) { events.push(p); }
      if (p.y - p.r * 0.3 < GH) { // sklo kolem otvoru: plyšák do něj naráží (shora se do otvoru dá spadnout)
        const g = glassNear(p.x, p.z), rr = p.r * 0.85 + 0.04;
        if (g.d < rr) {
          let nx = p.x - g.qx, nz = p.z - g.qz; const l = Math.hypot(nx, nz);
          if (l < 1e-4) { nx = g.w.nx; nz = g.w.nz; } else { nx /= l; nz /= l; }
          p.x = g.qx + nx * rr; p.z = g.qz + nz * rr;
          const vn = p.vx * nx + p.vz * nz; if (vn < 0) { p.vx -= vn * nx * 1.25; p.vz -= vn * nz * 1.25; }
        }
      }
      const lim = HALF - p.r * 0.85;
      if (p.x < -lim) { p.x = -lim; p.vx = Math.max(0, p.vx); } else if (p.x > lim) { p.x = lim; p.vx = Math.min(0, p.vx); }
      if (p.z < -lim) { p.z = -lim; p.vz = Math.max(0, p.vz); } else if (p.z > lim) { p.z = lim; p.vz = Math.min(0, p.vz); }
      const k = Math.exp(-0.9 * dt); p.vx *= k; p.vz *= k;
    }
    for (let i = 0; i < plush.length; i++) {
      const a = plush[i]; if (a.held) continue;
      for (let j = i + 1; j < plush.length; j++) {
        const b = plush[j]; if (b.held) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const minD = (a.r + b.r) * 0.9;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= minD * minD || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d, pen = minD - d, ms = a.m + b.m;
        const fa = b.m / ms, fb = a.m / ms;
        a.x -= nx * pen * fa; a.y -= ny * pen * fa; a.z -= nz * pen * fa;
        b.x += nx * pen * fb; b.y += ny * pen * fb; b.z += nz * pen * fb;
        const vr = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
        if (vr < 0) {
          const jn = (-(1.04) * vr) / (1 / a.m + 1 / b.m);
          a.vx -= (jn / a.m) * nx; a.vy -= (jn / a.m) * ny; a.vz -= (jn / a.m) * nz;
          b.vx += (jn / b.m) * nx; b.vy += (jn / b.m) * ny; b.vz += (jn / b.m) * nz;
        }
        a.vx *= 0.995; a.vz *= 0.995; b.vx *= 0.995; b.vz *= 0.995;
      }
    }
    for (const p of plush) { // klid na zemi: žádné věčné třepání
      if (!p.held && p.y <= p.r + 0.02 && Math.hypot(p.vx, p.vz) < 0.12) { p.vx = 0; p.vz = 0; }
    }
  }

  function settle(steps) { const ev = []; for (let i = 0; i < steps; i++) physStep(1 / 90, ev); }

  function stockAll() {
    plush.length = 0;
    let n = 0;
    for (const id of ORDER) for (let i = 0; i < COUNTS[id]; i++) spawn(id, { y: 0.8 + (n++) * 0.75 });
    settle(300);
  }
  function restock() {
    const have = {}; for (const p of plush) have[p.id] = (have[p.id] || 0) + 1;
    let n = 0;
    for (const id of ORDER) for (let i = (have[id] || 0); i < COUNTS[id]; i++) { if (plush.length < 14 || n < 2) { spawn(id, { y: 7.2 + (n++) * 0.8 }); } }
  }

  // ---- stav hry -------------------------------------------------------------------------------------
  const claw = { x: HOME.x, z: HOME.z, y: HUB_TOP, open: 1, vx: 0, vz: 0 };
  const G = {
    phase: 'idle', t: 0, aimLeft: 0, held: null, slipAt: Infinity, carryT: 0, playId: null, stopY: HUB_MIN,
    joy: { x: 0, y: 0 }, keys: { x: 0, y: 0 }, tilt: { x: 0, z: 0 }, btnPress: 0, result: null, winner: null, releaseT: 0,
    plays: 0, balance: 0, packs: { 1: 300, 6: 1500 }, bombPrice: 1000, bomb: null, prizes: null, busy: false, ready: false, dropAfterClose: false,
  };
  const AIM_TIME = 25;
  const cam = { yaw: 0.0, tyaw: 0.0, pitch: 0.3, dist: 20 };
  const particles = [];

  // ---- UI -------------------------------------------------------------------------------------------
  let toastTimer = null;
  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }
  const bombWaitMs = () => Math.max(0, (G.bombReadyAt || 0) - performance.now()); // zbývá do další bomby
  setInterval(() => { if (bombWaitMs() > 0 || G.bombCdShown) { G.bombCdShown = bombWaitMs() > 0; refreshHud(); } }, 500);
  function refreshHud() {
    $('#bal').textContent = fmt(G.balance); $('#plays').textContent = String(G.plays);
    const idle = G.phase === 'idle', showIdle = idle;
    $('#panel-idle').hidden = !showIdle; $('#panel-play').hidden = showIdle;
    $('#btn-play').disabled = !idle || G.busy || G.plays < 1 || !G.ready;
    const cd = bombWaitMs();
    $('#bomb-cd').hidden = cd <= 0; $('#bomb-price').hidden = cd > 0;
    if (cd > 0) { const sec = Math.ceil(cd / 1000); $('#bomb-cd').textContent = '⏳ ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
    $('#btn-bomb').disabled = G.phase !== 'aim' || !!G.bomb || G.bombUsed || cd > 0 || G.busy || !G.ready || G.balance < G.bombPrice;
    $('#btn-play').textContent = G.plays > 0 ? `Hrát (zbývá ${G.plays})` : 'Hrát';
    $('#btn-buy1').disabled = !idle || G.busy || !G.ready || G.balance < G.packs[1];
    $('#btn-buy6').disabled = !idle || G.busy || !G.ready || G.balance < G.packs[6];
    $('#btn-drop').disabled = G.phase !== 'aim';
    $('#panel-play').classList.toggle('locked', G.phase !== 'aim');
  }
  function applyState(j) {
    if (typeof j.balance === 'number') G.balance = j.balance;
    if (typeof j.plays === 'number') G.plays = j.plays;
    if (j.packs) G.packs = j.packs;
    if (typeof j.floor === 'number') G.floor = j.floor;
    if (typeof j.bombPrice === 'number') G.bombPrice = j.bombPrice;
    if (typeof j.bombIn === 'number') G.bombReadyAt = performance.now() + j.bombIn; // cooldown drží server, přežije restart stránky
    if (j.refilled) toast(`Zůstatek byl doplněn na ${j.floor || 200}.`, 3600);
    if (j.prizes) { G.prizes = j.prizes; for (const p of j.prizes) if (LOOKS[p.id]) { LOOKS[p.id].value = p.value; LOOKS[p.id].name = p.name; } renderPrizes(); }
    refreshHud();
  }
  function renderPrizes() {
    const box = $('#prize-list'); box.replaceChildren();
    for (const id of ORDER) {
      const L = LOOKS[id], d = document.createElement('div'); d.className = 'prize';
      const e = document.createElement('div'); e.className = 'pe'; e.textContent = L.emoji;
      const n = document.createElement('div'); n.className = 'pn'; n.textContent = L.name;
      const v = document.createElement('div'); v.className = 'pv'; const c = document.createElement('span'); c.className = 'coin'; v.append(c, ' ' + fmt(L.value));
      d.append(e, n, v); box.append(d);
    }
  }
  async function buy(pack) {
    if (G.busy) return; G.busy = true; refreshHud();
    const r = await api('buy', { pack }); G.busy = false;
    if (r.ok) { applyState(r.json); sfx.coin(); toast(pack === 1 ? 'Koupena 1 hra.' : 'Koupeno 6 her.'); } else { toast(r.json.error || 'Nákup se nepovedl.'); refreshHud(); }
  }
  async function buyBomb() {
    if (G.busy || G.phase !== 'aim' || G.bomb) return; G.busy = true; refreshHud();
    const bx = claw.x, bz = claw.z; // bomba spadne přesně pod drápek (v základní poloze tedy do otvoru)
    const r = await api('bomb'); G.busy = false;
    if (!r.ok) { if (typeof r.json.bombIn === 'number') G.bombReadyAt = performance.now() + r.json.bombIn; toast(r.json.error || 'Bombu se nepodařilo koupit.'); refreshHud(); return; }
    applyState(r.json); sfx.coin(); G.bombUsed = true;
    G.bombWins = []; G.bombClaims = []; G.bomb = { id: r.json.bombId, x: bx, z: bz, y: 8.5, vy: 0, st: 'fall', t: 0, blink: 0 };
    refreshHud();
  }
  const BR = 0.36;
  function updateBomb(dt) {
    const b = G.bomb; if (!b) return; b.t += dt;
    if (b.st === 'fall') {
      b.vy -= 24 * dt; b.y += b.vy * dt;
      const over = b.x > HOLE.x1 && b.x < HOLE.x2 && b.z > HOLE.z1 && b.z < HOLE.z2; // nad otvorem se propadne
      if (!over && b.y < GH + BR) { const g = glassNear(b.x, b.z); if (g.d < BR + 0.05) { let nx = b.x - g.qx, nz = b.z - g.qz; const l = Math.hypot(nx, nz) || 1; b.x = g.qx + nx / l * (BR + 0.05); b.z = g.qz + nz / l * (BR + 0.05); } }
      if (over) { if (b.y < -2.0) { b.pit = true; explodeBomb(b); } return; }
      let ground = BR;
      for (const p of plush) { const d = Math.hypot(p.x - b.x, p.z - b.z), R = BR + p.r * 0.9; if (d < R) ground = Math.max(ground, p.y + Math.sqrt(R * R - d * d)); }
      if (b.y <= ground) { b.y = ground; if (b.vy < -4) { b.vy = -b.vy * 0.25; } else { b.vy = 0; b.st = 'fuse'; b.t = 0; } }
    } else if (b.st === 'fuse') {
      const prev = b.blink; b.blink += dt * (6 + b.t * 10);
      if (Math.floor(prev) !== Math.floor(b.blink)) sfx.tick();
      if (b.t >= 1.5) explodeBomb(b);
    } else if (b.st === 'boom') {
      if (b.t > 3.2) { G.bomb = null; endBomb(); }
    }
  }
  async function endBomb() { // počká na připsání výher a ukáže je; plyšáci se doplní
    await Promise.all(G.bombClaims);
    if (G.phase === 'idle' || G.phase === 'aim') restock(); // za plyšáky, kteří spadli do otvoru
    const w = G.bombWins; G.bombWins = []; G.bombClaims = [];
    refreshHud();
    if (G.phase === 'idle' && G.plays < 1 && G.balance < (G.floor || 200)) { const r = await api('state'); if (r.ok) applyState(r.json); } // doplnění kreditu
    if (!w.length) return;
    const total = w.reduce((a, x) => a + x.value, 0);
    sfx.win(); confetti(50); toast(`💣 Bomba shodila do otvoru plyšáky: ${w.length}× · +${fmt(total)}`, 4200);
  }
  function claimBombPlush(p, bombId) {
    if (G.bombClaims.length >= 2) return; // za bombu se platí nejvýš 2 plyšáci
    G.bombClaims.push((async () => {
      const r = await api('bombclaim', { bombId, prize: p.id });
      if (r.ok) { applyState(r.json); G.bombWins.push({ id: p.id, value: r.json.won ? r.json.won.value : LOOKS[p.id].value }); }
    })());
  }
  function explodeBomb(b) {
    b.st = 'boom'; b.t = 0; sfx.boom(); G.shake = b.pit ? 0.5 : 1;
    for (const p of plush) {
      if (p.held || b.pit) continue; // bomba v šachtě nikoho nerozhází
      let dx = p.x - b.x, dz = p.z - b.z; const d = Math.hypot(dx, dz) || 0.01; dx /= d; dz /= d;
      const power = (7 + 5 * Math.max(0, 1 - d / 7)) * (0.7 + rng() * 0.6) / Math.max(0.55, p.r * 1.3);
      const ang = (rng() - 0.5) * 1.6, ca = Math.cos(ang), sa = Math.sin(ang);
      p.vx = (dx * ca - dz * sa) * power; p.vz = (dx * sa + dz * ca) * power; p.vy = 9 + rng() * 7;
      p.y = Math.max(p.y, p.r + 0.05); p.tx = (rng() - 0.5) * 1.2; p.tz = (rng() - 0.5) * 1.2; p.yaw += (rng() - 0.5) * 3;
      if (rng() < 0.012) { // malá šance: plyšák vyletí obloukem přímo do výdejního otvoru
        const T = 1.1; p.vx = (HOME.x - p.x) / T; p.vz = (HOME.z - p.z) / T; p.vy = (12 * T * T + 1.5 - p.y) / T;
      }
    }
    for (let i = 0; i < 60; i++) {
      const a = rng() * 6.28, e = (rng() - 0.3) * 1.6, s = 3 + rng() * 6;
      particles.push({ x: b.x, y: b.y + 0.2, z: b.z, vx: Math.cos(a) * s, vy: 2 + Math.abs(Math.sin(e)) * s, vz: Math.sin(a) * s,
        c: [[1, 0.55, 0.1], [1, 0.85, 0.2], [0.9, 0.25, 0.1], [0.35, 0.3, 0.3]][i % 4], life: 0.6 + rng() * 0.8, s: 0.12 + rng() * 0.22, rx: rng() * 6, rv: (rng() - 0.5) * 14 });
    }
  }

  async function startPlay() {
    if (G.busy || G.phase !== 'idle' || G.plays < 1) return;
    G.busy = true; refreshHud();
    const r = await api('play'); G.busy = false;
    if (!r.ok) { toast(r.json.error || 'Hru se nepodařilo spustit.'); if (r.json.balance != null) applyState(r.json); refreshHud(); return; }
    applyState(r.json); G.playId = r.json.playId;
    restock();
    G.bombUsed = false; G.phase = 'aim'; G.aimLeft = AIM_TIME; G.t = 0; G.held = null; G.result = null;
    claw.x = HOME.x; claw.z = HOME.z; claw.y = HUB_TOP; claw.open = 1;
    sfx.coin(); refreshHud();
  }

  // ---- ovládání: joystick + klávesnice ------------------------------------------------------------
  function setupJoystick() {
    const joy = $('#joy'), knob = $('#knob'); let id = null, cx = 0, cy = 0, rad = 50;
    const upd = (e) => {
      let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy);
      if (l > rad) { dx *= rad / l; dy *= rad / l; }
      G.joy.x = dx / rad; G.joy.y = -dy / rad;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    joy.addEventListener('pointerdown', (e) => {
      if (id !== null) return; id = e.pointerId; joy.setPointerCapture(id);
      const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; rad = r.width * 0.34; upd(e); e.preventDefault();
    });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === id) upd(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; G.joy.x = 0; G.joy.y = 0; knob.style.transform = 'translate(0,0)'; };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
    const keys = {};
    const kv = () => { G.keys.x = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0); G.keys.y = (keys.ArrowUp || keys.w ? 1 : 0) - (keys.ArrowDown || keys.s ? 1 : 0); };
    window.addEventListener('keydown', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
      if (k === ' ' || k === 'Enter') { if (G.phase === 'aim') doDrop(); else if (G.phase === 'idle' && !e.repeat) startPlay(); return; }
      keys[k] = true; kv();
    });
    window.addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = false; kv(); });
  }

  function setupCamera(canvas) {
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); $('#hint').hidden = true; });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      cam.tyaw -= (e.clientX - drag.x) * 0.0085; cam.yaw = cam.tyaw;
      cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.004, 0.08, 0.95);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    $('#rot-l').addEventListener('click', () => { cam.tyaw += Math.PI / 2; $('#hint').hidden = true; });
    $('#rot-r').addEventListener('click', () => { cam.tyaw -= Math.PI / 2; $('#hint').hidden = true; });
  }

  // ---- průběh hry -----------------------------------------------------------------------------------
  function doDrop() {
    if (G.phase !== 'aim') return;
    G.phase = 'drop'; G.btnPress = 1; G.joy.x = G.joy.y = 0; $('#knob').style.transform = 'translate(0,0)';
    claw.vx = claw.vz = 0; sfx.drop(); refreshHud();
  }

  function stopHeight() {
    let y = HUB_MIN;
    if (glassNear(claw.x, claw.z).d < 0.3) y = Math.max(y, GH + 0.9); // drápek nezajede do skla
    for (const p of plush) {
      if (p.held) continue;
      const d = Math.hypot(p.x - claw.x, p.z - claw.z);
      if (d < p.r * 0.8 + 0.28) y = Math.max(y, p.y + p.r * 0.55 + 0.2);
    }
    return y;
  }

  function pickCandidate() {
    let best = null, bd = 0.9;
    for (const p of plush) {
      if (p.held) continue;
      const d = Math.hypot(p.x - claw.x, p.z - claw.z);
      if (d < bd && p.y < claw.y + 0.2 && p.y > claw.y - 1.7) { best = p; bd = d; }
    }
    G.grabOff = best ? bd : 0;
    return best;
  }

  function confetti(n) {
    for (let i = 0; i < n; i++) {
      particles.push({ x: HOME.x + (rng() - 0.5), y: 0.5, z: HOME.z + (rng() - 0.5) + 1, vx: (rng() - 0.3) * 5, vy: 4 + rng() * 6, vz: 1 + rng() * 5,
        c: [[1, 0.3, 0.5], [1, 0.85, 0.25], [0.3, 0.8, 1], [0.5, 1, 0.5], [0.8, 0.5, 1]][i % 5], life: 2.4 + rng(), s: 0.1 + rng() * 0.1, rx: rng() * 6, rv: (rng() - 0.5) * 12 });
    }
  }

  async function finishPlay(won) {
    G.phase = 'result';
    refreshHud();
    if (won) {
      const L = LOOKS[won.id];
      sfx.win(); confetti(70);
      const r = await api('claim', { playId: G.playId, prize: won.id });
      if (r.ok) { applyState(r.json); showResult(true, L, r.json.won ? r.json.won.value : L.value); } else { toast(r.json.error || 'Výhru se nepodařilo připsat.'); showResult(false); }
    } else {
      sfx.lose(); const r = await api('end', { playId: G.playId }); if (r.ok) applyState(r.json); showResult(false); // server mohl doplnit kredit
    }
  }
  function showResult(win, L, value) {
    const box = $('#result');
    if (!win) { box.hidden = true; G.phase = 'idle'; claw.x = HOME.x; claw.z = HOME.z; claw.y = HUB_TOP; claw.open = 1; refreshHud(); return; } // bez výhry se nic nezobrazuje
    box.replaceChildren();
    const h = document.createElement('div'); h.className = 'rbig'; const s = document.createElement('div'); s.className = 'rsmall';
    if (win) { h.textContent = L.label || `${L.emoji} Vyhrál jsi: ${L.name}!`; s.append('Připsáno ', Object.assign(document.createElement('b'), { textContent: '+' + fmt(value) }), ' ', Object.assign(document.createElement('span'), { className: 'coin' })); box.className = 'result win'; }
    else { h.textContent = 'Tentokrát nic'; s.textContent = G.plays > 0 ? 'Zkus to znovu, zbývají ti hry.' : 'Kup si další hru a zkus štěstí.'; box.className = 'result'; }
    const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = 'Pokračovat';
    b.addEventListener('click', () => { box.hidden = true; G.phase = 'idle'; claw.x = HOME.x; claw.z = HOME.z; claw.y = HUB_TOP; claw.open = 1; refreshHud(); });
    box.append(h, s, b); box.hidden = false;
  }

  function update(dt) {
    G.t += dt;
    // pohyb pálky v režimu míření
    const ev = [];
    const sub = Math.max(1, Math.ceil(dt / (1 / 90)));
    for (let i = 0; i < sub; i++) physStep(dt / sub, ev);
    for (const p of ev) { // spadl do výdejního otvoru
      const k = plush.indexOf(p); if (k >= 0) plush.splice(k, 1);
      if (G.bomb && G.bomb.st === 'boom') { claimBombPlush(p, G.bomb.id); continue; } // výhra z bomby
      if (G.phase === 'release' || G.phase === 'carry' || G.phase === 'rise' || G.phase === 'close') { if (!G.winner) G.winner = p; }
    }

    let jx = clamp(G.joy.x + G.keys.x, -1, 1), jy = clamp(G.joy.y + G.keys.y, -1, 1);
    let mx = 0, mz = 0;
    if (G.phase === 'aim') {
      G.aimLeft -= dt;
      const l = Math.hypot(jx, jy); if (l > 1) { jx /= l; jy /= l; }
      const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw); // pohyb vzhledem k pohledu kamery
      mx = c * jx + -s * jy; mz = -s * jx + -c * jy;
      claw.vx = lerp(claw.vx, mx * 3.3, Math.min(1, dt * 7)); claw.vz = lerp(claw.vz, mz * 3.3, Math.min(1, dt * 7));
      claw.x = clamp(claw.x + claw.vx * dt, -LIM, LIM); claw.z = clamp(claw.z + claw.vz * dt, -LIM, LIM);
      if (G.aimLeft <= 0) doDrop();
    }
    G.tilt.x = lerp(G.tilt.x, G.phase === 'aim' ? mx : 0, Math.min(1, dt * 12));
    G.tilt.z = lerp(G.tilt.z, G.phase === 'aim' ? mz : 0, Math.min(1, dt * 12));
    G.btnPress = Math.max(0, G.btnPress - dt * 3);

    if (G.phase === 'drop') {
      claw.open = lerp(claw.open, 1, Math.min(1, dt * 10));
      const floorY = stopHeight();
      claw.y = Math.max(floorY, claw.y - 4.6 * dt);
      if (claw.y <= floorY + 1e-3) { G.phase = 'close'; G.t = 0; G.held = null; G.winner = null; }
    } else if (G.phase === 'close') {
      const prog = clamp(G.t / 0.8, 0, 1);
      if (!G.closeInit) {
        G.closeInit = true;
        const cand = pickCandidate();
        const perfect = !!cand && rng() < (LOOKS[cand.id].perfect || 0); // „perfektní úchop“: plyšák se chytí a už nevyklouzne
        // trefa přímo do plyšáka (střed drápku nad tělem) se vždy chytí; šance na vypadnutí se řeší níž
        if (cand && (perfect || G.grabOff <= 0.32 || rng() < (LOOKS[cand.id].grab || 0.93))) {
          // čím dál od středu drápku je plyšák chycen, tím menší šance, že vydrží (a tím víc se klepe)
          const q = clamp(G.grabOff / 0.9, 0, 1), base = LOOKS[cand.id].hold;
          const hold = base * (1 - 0.92 * q * q);
          G.held = cand; cand.held = true; sfx.grab();
          G.slipAt = rng() < hold ? Infinity : (0.5 + rng() * 2.2) * (1 - 0.55 * q);
          G.risk = clamp(0.25 * q + 0.75 * (1 - hold), 0, 1);
          if (perfect) { G.slipAt = Infinity; G.risk = 0.05; }
          G.wob = { f1: 7 + rng() * 5, f2: 11 + rng() * 7, f3: 9 + rng() * 6, p1: rng() * 6.28, p2: rng() * 6.28, p3: rng() * 6.28 };
        } else { G.held = null; }
      }
      claw.open = lerp(1, G.held ? 0.3 : 0, prog);
      if (G.t >= 0.95) { G.closeInit = false; G.phase = 'rise'; G.t = 0; G.carryT = 0; }
    } else if (G.phase === 'rise' || G.phase === 'carry') {
      G.carryT += dt;
      if (G.phase === 'rise') {
        claw.y = Math.min(HUB_TOP, claw.y + 3.6 * dt);
        if (claw.y >= HUB_TOP) { G.phase = 'carry'; G.t = 0; }
      } else {
        const dx = HOME.x - claw.x, dz = HOME.z - claw.z, d = Math.hypot(dx, dz);
        const step = Math.min(d, 3.2 * dt);
        if (d > 1e-3) { claw.x += (dx / d) * step; claw.z += (dz / d) * step; }
        if (d < 0.03) { G.phase = 'release'; G.t = 0; G.releaseT = 0; }
      }
      if (G.held && G.carryT > G.slipAt) { const p = G.held; p.held = false; p.vx = (rng() - 0.5) * 1.2; p.vz = (rng() - 0.5) * 1.2; p.vy = 0; G.held = null; sfx.slip(); toast('Vyklouzl!'); }
    } else if (G.phase === 'release') {
      G.releaseT += dt;
      claw.open = lerp(claw.open, 1, Math.min(1, dt * 6));
      if (G.held && G.releaseT > 0.35) { G.held.held = false; G.held.vy = 0; G.held = null; }
      if (G.winner || G.releaseT > 3) {
        const won = G.winner; G.winner = null;
        G.phase = 'finishing'; finishPlay(won);
      }
    } else if (G.phase === 'idle') {
      claw.open = lerp(claw.open, 1, Math.min(1, dt * 4));
    }

    // držený plyšák visí na pálce
    if (G.held) {
      const p = G.held;
      p.x = claw.x; p.z = claw.z; p.y = claw.y - p.r * 0.55 - 0.2;
      // klepání ze strany na stranu: síla roste s rizikem pádu a ještě víc těsně před vyklouznutím
      const W = G.wob || { f1: 8, f2: 13, f3: 10, p1: 0, p2: 1, p3: 2 }, rk = G.risk || 0;
      const near = isFinite(G.slipAt) ? 0.6 + 0.8 * clamp(G.carryT / G.slipAt, 0, 1) : 0.7;
      const amp = (0.05 + 0.55 * rk * rk) * near * (G.phase === 'rise' || G.phase === 'carry' ? 1 : 0.3);
      const tt = lastT;
      p.sway = amp * (0.6 * Math.sin(tt * W.f1 + W.p1) + 0.4 * Math.sin(tt * W.f2 + W.p2));
      p.sway2 = amp * 0.8 * Math.sin(tt * W.f3 + W.p3);
      if (amp > 0.2) p.x += Math.sin(tt * W.f2 + W.p3) * 0.06 * amp;
    }
    updateBomb(dt); G.shake = Math.max(0, (G.shake || 0) - dt * 1.6);
    for (const q of particles) { q.life -= dt; q.vy -= 14 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.rx += q.rv * dt; }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);

    cam.yaw = lerp(cam.yaw, cam.tyaw, Math.min(1, dt * 7));
    // časovač míření
    const bar = $('#timer-fill'); if (bar) bar.style.width = (G.phase === 'aim' ? clamp(G.aimLeft / AIM_TIME, 0, 1) * 100 : 0) + '%';
  }

  // ---- vykreslení -----------------------------------------------------------------------------------
  let R = null, texMarquee = null, texWall = null, lastT = 0;
  const COL = { pink: [0.96, 0.3, 0.62], purple: [0.4, 0.14, 0.68], dark: [0.16, 0.09, 0.28], gold: [1, 0.8, 0.3], metal: [0.78, 0.8, 0.88], red: [0.95, 0.15, 0.2] };

  function put(shape, x, y, z, sx, sy, sz, color, o = {}, rx = 0, ry = 0, rz = 0) {
    let m = M.translate(x, y, z);
    if (ry) m = M.mul(m, M.rotY(ry)); if (rx) m = M.mul(m, M.rotX(rx)); if (rz) m = M.mul(m, M.rotZ(rz));
    R.draw(shape, M.mul(m, M.scale(sx, sy, sz)), { color, ...o });
  }
  const sub = (base, shape, x, y, z, sx, sy, sz, color, o = {}, rx = 0, ry = 0, rz = 0) => {
    let m = M.translate(x, y, z);
    if (ry) m = M.mul(m, M.rotY(ry)); if (rx) m = M.mul(m, M.rotX(rx)); if (rz) m = M.mul(m, M.rotZ(rz));
    R.draw(shape, M.chain(base, m, M.scale(sx, sy, sz)), { color, ...FUR, ...o });
  };

  function drawPlush(p) {
    let b = M.translate(p.x, p.y, p.z);
    b = M.mul(b, M.rotY(p.yaw));
    const tx = p.held ? p.sway : p.tx, tz = p.held ? (p.sway2 || 0) : p.tz;
    if (tx) b = M.mul(b, M.rotX(tx)); if (tz) b = M.mul(b, M.rotZ(tz));
    const E = (x, y, z, r) => sub(b, 'sphere', x, y, z, r, r, r, [0.04, 0.04, 0.06], { rim: 0, spec: 0.7, shine: 40 });
    switch (p.id) {
      case 'chick': {
        const Y = [1, 0.86, 0.2], Y2 = [1, 0.74, 0.12];
        sub(b, 'sphere', 0, -0.02, 0, 0.5, 0.46, 0.46, Y);
        sub(b, 'sphere', 0, 0.42, 0.1, 0.34, 0.32, 0.32, Y);
        sub(b, 'cone', 0, 0.42, 0.44, 0.16, 0.2, 0.16, [1, 0.5, 0.1], {}, Math.PI / 2);
        E(-0.12, 0.52, 0.36, 0.05); E(0.12, 0.52, 0.36, 0.05);
        sub(b, 'sphere', -0.5, 0, 0, 0.09, 0.22, 0.2, Y2); sub(b, 'sphere', 0.5, 0, 0, 0.09, 0.22, 0.2, Y2);
        sub(b, 'sphere', 0, 0.72, 0.1, 0.07, 0.12, 0.07, Y2, {}, 0, 0, 0.3);
        sub(b, 'box', -0.17, -0.46, 0.15, 0.14, 0.06, 0.2, [1, 0.5, 0.1]); sub(b, 'box', 0.17, -0.46, 0.15, 0.14, 0.06, 0.2, [1, 0.5, 0.1]);
        break;
      }
      case 'frog': {
        const Gn = [0.3, 0.75, 0.3];
        sub(b, 'sphere', 0, -0.05, 0, 0.58, 0.42, 0.5, Gn);
        sub(b, 'sphere', 0, -0.12, 0.2, 0.4, 0.3, 0.32, [0.7, 0.92, 0.55]);
        for (const s of [-1, 1]) {
          sub(b, 'sphere', s * 0.24, 0.36, 0.3, 0.17, 0.17, 0.17, Gn);
          sub(b, 'sphere', s * 0.24, 0.4, 0.4, 0.12, 0.12, 0.1, [1, 1, 1], { rim: 0.1 });
          E(s * 0.24, 0.41, 0.48, 0.065);
          sub(b, 'sphere', s * 0.4, -0.2, 0.36, 0.14, 0.09, 0.26, Gn);
          sub(b, 'sphere', s * 0.32, 0.04, 0.42, 0.09, 0.06, 0.04, [1, 0.5, 0.55]);
        }
        break;
      }
      case 'bear': {
        const Br = [0.62, 0.4, 0.22], Br2 = [0.8, 0.6, 0.4];
        sub(b, 'sphere', 0, -0.06, 0, 0.55, 0.5, 0.45, Br);
        sub(b, 'sphere', 0, 0.5, 0.08, 0.38, 0.36, 0.36, Br);
        for (const s of [-1, 1]) {
          sub(b, 'sphere', s * 0.28, 0.82, 0.04, 0.14, 0.14, 0.1, Br); sub(b, 'sphere', s * 0.28, 0.82, 0.1, 0.08, 0.08, 0.05, [0.95, 0.7, 0.7]);
          sub(b, 'sphere', s * 0.52, -0.02, 0.12, 0.14, 0.24, 0.15, Br, {}, 0, 0, -s * 0.3); sub(b, 'sphere', s * 0.25, -0.45, 0.28, 0.17, 0.12, 0.22, Br);
          E(s * 0.14, 0.56, 0.4, 0.045);
        }
        sub(b, 'sphere', 0, 0.42, 0.4, 0.17, 0.13, 0.13, Br2); E(0, 0.47, 0.52, 0.06);
        sub(b, 'sphere', 0, -0.05, 0.38, 0.3, 0.3, 0.1, Br2);
        break;
      }
      case 'bunny': {
        const W = [0.97, 0.95, 0.98], Pk = [1, 0.62, 0.72];
        sub(b, 'sphere', 0, -0.05, 0, 0.55, 0.5, 0.46, W);
        sub(b, 'sphere', 0, 0.5, 0.1, 0.34, 0.32, 0.32, W);
        for (const s of [-1, 1]) {
          sub(b, 'sphere', s * 0.14, 1.0, 0.0, 0.1, 0.42, 0.07, W, {}, 0, 0, -s * 0.12);
          sub(b, 'sphere', s * 0.14, 1.0, 0.05, 0.06, 0.32, 0.03, Pk, {}, 0, 0, -s * 0.12);
          E(s * 0.13, 0.56, 0.38, 0.045); sub(b, 'sphere', s * 0.2, 0.44, 0.34, 0.07, 0.05, 0.03, Pk);
          sub(b, 'sphere', s * 0.5, -0.05, 0.1, 0.12, 0.2, 0.14, W); sub(b, 'sphere', s * 0.24, -0.45, 0.3, 0.15, 0.1, 0.22, W);
        }
        sub(b, 'sphere', 0, 0.45, 0.42, 0.06, 0.045, 0.04, Pk);
        sub(b, 'sphere', 0, -0.1, -0.5, 0.17, 0.17, 0.17, [1, 1, 1]);
        break;
      }
      case 'panda': {
        const W = [0.97, 0.97, 0.97], K = [0.1, 0.1, 0.12];
        sub(b, 'sphere', 0, -0.04, 0, 0.58, 0.52, 0.48, W);
        sub(b, 'sphere', 0, 0.56, 0.08, 0.4, 0.37, 0.37, W);
        for (const s of [-1, 1]) {
          sub(b, 'sphere', s * 0.32, 0.9, 0.0, 0.14, 0.14, 0.1, K);
          sub(b, 'sphere', s * 0.17, 0.6, 0.38, 0.1, 0.14, 0.05, K, {}, 0, 0, -s * 0.5);
          sub(b, 'sphere', s * 0.17, 0.62, 0.43, 0.035, 0.035, 0.03, [1, 1, 1], { unlit: true });
          sub(b, 'sphere', s * 0.56, 0.0, 0.1, 0.15, 0.3, 0.16, K, {}, 0, 0, -s * 0.25);
          sub(b, 'sphere', s * 0.28, -0.45, 0.2, 0.2, 0.18, 0.24, K);
        }
        sub(b, 'sphere', 0, 0.5, 0.42, 0.07, 0.05, 0.05, K);
        break;
      }
      case 'unicorn': {
        const W = [0.98, 0.94, 1], Pk = [1, 0.55, 0.8], Bl = [0.45, 0.7, 1], Pu = [0.7, 0.5, 1];
        sub(b, 'sphere', 0, -0.05, 0, 0.7, 0.55, 0.6, W);
        sub(b, 'sphere', 0, 0.66, 0.18, 0.44, 0.42, 0.42, W);
        sub(b, 'sphere', 0, 0.55, 0.52, 0.24, 0.2, 0.22, W);
        sub(b, 'cone', 0, 1.18, 0.26, 0.14, 0.56, 0.14, [1, 0.82, 0.3], { emis: [0.25, 0.18, 0], spec: 0.6, shine: 40 }, -0.22);
        for (const s of [-1, 1]) {
          sub(b, 'cone', s * 0.24, 1.02, 0.1, 0.14, 0.28, 0.1, W, {}, 0, 0, -s * 0.25);
          E(s * 0.2, 0.7, 0.55, 0.06); sub(b, 'sphere', s * 0.2 + 0.015, 0.72, 0.6, 0.02, 0.02, 0.02, [1, 1, 1], { unlit: true });
          sub(b, 'sphere', s * 0.14, 0.56, 0.7, 0.025, 0.025, 0.02, [0.3, 0.2, 0.3]);
          sub(b, 'sphere', s * 0.26, -0.5, 0.3, 0.18, 0.12, 0.26, W);
          sub(b, 'sphere', s * 0.32, 0.5, 0.5, 0.07, 0.05, 0.03, Pk);
        }
        sub(b, 'sphere', 0, 0.98, -0.02, 0.15, 0.17, 0.17, Pk); sub(b, 'sphere', 0, 0.78, -0.26, 0.17, 0.17, 0.17, Bl); sub(b, 'sphere', 0, 0.48, -0.42, 0.18, 0.18, 0.18, Pu);
        sub(b, 'sphere', 0, 0.02, -0.62, 0.2, 0.26, 0.2, Pk); sub(b, 'sphere', 0, -0.22, -0.66, 0.16, 0.2, 0.16, Bl);
        break;
      }
      case 'phone': {
        // luxusní telefon: rámeček z leštěného kovu, svítící displej, kamera a lesk
        b = M.mul(b, M.scale(1.3, 1.3, 1.3));
        const Fr = [0.86, 0.72, 0.4], Bk = [0.1, 0.11, 0.16];
        sub(b, 'sphere', 0, 0.02, 0, 0.9, 0.9, 0.9, [1, 0.85, 0.4], { alpha: 0.1 + 0.05 * Math.sin(lastT * 3), unlit: true, noDepth: true });
        const pulse = 0.5 + 0.5 * Math.sin(lastT * 2.5);
        sub(b, 'box', 0, 0.02, 0, 0.66, 1.12, 0.16, Fr, { spec: 0.9, shine: 70, rim: 0.3 });
        sub(b, 'box', 0, 0.02, 0.01, 0.6, 1.06, 0.15, Bk, { spec: 0.7, shine: 60, rim: 0.1 });
        // displej (svítí)
        sub(b, 'box', 0, 0.02, 0.085, 0.54, 1.0, 0.02, [0.18, 0.5, 0.95], { unlit: true, emis: [0.05 + 0.08 * pulse, 0.12, 0.25] });
        sub(b, 'box', 0, 0.25, 0.097, 0.54, 0.5, 0.006, [0.55, 0.3, 0.95], { unlit: true, emis: [0.2, 0.1, 0.3] });
        // ikonky aplikací
        const IC = [[1, 0.4, 0.4], [0.4, 1, 0.55], [1, 0.9, 0.35], [0.5, 0.8, 1], [1, 0.6, 0.9], [0.9, 0.9, 1]];
        for (let i = 0; i < 6; i++) sub(b, 'box', -0.16 + (i % 3) * 0.16, 0.14 - Math.floor(i / 3) * 0.17, 0.103, 0.1, 0.1, 0.005, IC[i], { unlit: true, emis: [0.15, 0.15, 0.15] });
        sub(b, 'box', 0, -0.37, 0.103, 0.4, 0.08, 0.005, [1, 1, 1], { unlit: true });
        // kamera a výřez
        sub(b, 'sphere', 0, 0.52, 0.1, 0.035, 0.035, 0.02, [0.02, 0.02, 0.04], { spec: 0.9, shine: 80 });
        sub(b, 'cyl', -0.18, 0.36, -0.09, 0.14, 0.03, 0.14, [0.07, 0.07, 0.1], { spec: 0.9, shine: 80 }, Math.PI / 2);
        sub(b, 'sphere', -0.18, 0.36, -0.115, 0.045, 0.045, 0.02, [0.3, 0.5, 0.9], { spec: 1, shine: 90, emis: [0.05, 0.1, 0.2] });
        // zlatá mašle jako dárek
        sub(b, 'sphere', 0.22, 0.62, 0.0, 0.1, 0.07, 0.07, [1, 0.35, 0.55], {}, 0, 0, 0.5); sub(b, 'sphere', 0.34, 0.54, 0.0, 0.1, 0.07, 0.07, [1, 0.35, 0.55], {}, 0, 0, -0.5);
        sub(b, 'sphere', 0.28, 0.58, 0.0, 0.05, 0.05, 0.05, [1, 0.8, 0.3], { spec: 0.8, shine: 60 });
        // třpyt kolem
        const g = 0.5 + 0.5 * Math.sin(lastT * 4 + p.uid);
        sub(b, 'sphere', -0.42, 0.7, 0.05, 0.04 * g, 0.04 * g, 0.04 * g, [1, 1, 0.8], { unlit: true });
        sub(b, 'sphere', 0.4, -0.3, 0.05, 0.035 * (1 - g), 0.035 * (1 - g), 0.035 * (1 - g), [1, 1, 0.8], { unlit: true });
        break;
      }
      default: break;
    }
  }

  function drawClaw(t) {
    const hub = claw.y;
    // lišta a můstek
    put('box', -3.85, 7.95, 0, 0.18, 0.18, 8.4, COL.metal, { spec: 0.5, shine: 50 });
    put('box', 3.85, 7.95, 0, 0.18, 0.18, 8.4, COL.metal, { spec: 0.5, shine: 50 });
    put('box', 0, 7.95, claw.z, 7.9, 0.22, 0.34, [0.9, 0.9, 0.95], { spec: 0.5, shine: 50 });
    put('box', claw.x, 7.9, claw.z, 0.9, 0.5, 0.8, COL.pink, { spec: 0.4, shine: 40 });
    put('sphere', claw.x, 8.18, claw.z, 0.16, 0.12, 0.16, [1, 0.9, 0.3], { emis: [0.5 + 0.4 * Math.sin(t * 6), 0.3, 0], unlit: true });
    // lanko
    const top = 7.65, len = top - (hub + 0.25);
    put('cyl', claw.x, (top + hub + 0.25) / 2, claw.z, 0.07, Math.max(0.01, len), 0.07, [0.2, 0.2, 0.25], { spec: 0.4 });
    // hlavice
    put('cyl', claw.x, hub + 0.12, claw.z, 0.34, 0.3, 0.34, COL.metal, { spec: 0.6, shine: 60 });
    put('cone', claw.x, hub + 0.38, claw.z, 0.34, 0.22, 0.34, COL.metal, { spec: 0.6, shine: 60 });
    put('sphere', claw.x, hub - 0.06, claw.z, 0.26, 0.15, 0.26, [0.9, 0.2, 0.3], { spec: 0.6, shine: 50 });
    // prsty
    const a = lerp(0.16, 0.7, claw.open), bend = lerp(1.15, 0.38, claw.open);
    for (let i = 0; i < 3; i++) {
      let m = M.chain(M.translate(claw.x, hub - 0.02, claw.z), M.rotY((i / 3) * Math.PI * 2 + 0.5), M.translate(0.26, 0, 0), M.rotZ(a));
      const L1 = 0.78, L2 = 0.6;
      R.draw('cyl', M.mul(m, M.mul(M.translate(0, -L1 / 2, 0), M.scale(0.1, L1, 0.1))), { color: COL.metal, spec: 0.7, shine: 60 });
      R.draw('sphere', M.mul(m, M.mul(M.translate(0, -L1, 0), M.scale(0.075, 0.075, 0.075))), { color: COL.gold, spec: 0.7 });
      m = M.chain(m, M.translate(0, -L1, 0), M.rotZ(-bend));
      R.draw('cyl', M.mul(m, M.mul(M.translate(0, -L2 / 2, 0), M.scale(0.085, L2, 0.085))), { color: COL.gold, spec: 0.7, shine: 60 });
      R.draw('cone', M.chain(m, M.translate(0, -L2 - 0.1, 0), M.rotX(Math.PI), M.scale(0.11, 0.2, 0.11)), { color: [1, 0.9, 0.5], spec: 0.7, shine: 60 });
    }
  }

  function drawScene(t) {
    const aspect = R.resize();
    const fov = 0.62; // ~35°
    const tanh = Math.tan(fov / 2);
    const dH = 7.6 / tanh, dW = 5.6 / (tanh * aspect);
    const want = Math.max(dH, dW) * (1 + cam.pitch * 0.12);
    cam.dist = cam.ready ? lerp(cam.dist, want, 0.2) : want; cam.ready = true;
    const tg = [0, 3.4, 0.9];
    const eye = [tg[0] + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, tg[1] + Math.sin(cam.pitch) * cam.dist, tg[2] + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist];
    if (G.shake > 0) { const k = G.shake * G.shake * 0.35; eye[0] += (Math.random() - 0.5) * k; eye[1] += (Math.random() - 0.5) * k; eye[2] += (Math.random() - 0.5) * k; }
    R.begin(eye, tg, fov, aspect, [0.045, 0.02, 0.1]);

    // podlaha místnosti
    put('cylhi', 0, -3.58, 1.2, 24, 0.04, 24, [0.12, 0.05, 0.22], { unlit: true });
    put('cylhi', 0, -3.55, 1.2, 15, 0.03, 15, [0.18, 0.08, 0.32], { unlit: true });

    // spodní skříň
    const base = [0.34, 0.12, 0.58];
    put('box', 0, -1.75, 4.25, 9, 3.5, 0.5, base, { spec: 0.3 });
    put('box', 0, -1.75, -4.25, 9, 3.5, 0.5, base, { spec: 0.3 });
    put('box', -4.25, -1.75, 0, 0.5, 3.5, 8, base, { spec: 0.3 });
    put('box', 4.25, -1.75, 0, 0.5, 3.5, 8, base, { spec: 0.3 });
    put('box', 0, -3.3, 0, 9, 0.4, 9, base);
    for (const [x, z, sx, sz] of [[0, 4.45, 9.3, 0.32], [0, -4.45, 9.3, 0.32], [-4.45, 0, 0.32, 9.3], [4.45, 0, 0.32, 9.3]]) put('box', x, -0.1, z, sx, 0.26, sz, COL.pink, { spec: 0.5, shine: 50 });

    // podlaha automatu (s otvorem)
    const fl = { pat: true, spec: 0.35, shine: 40 }, fc = [0.98, 0.8, 1];
    put('box', 0, -0.075, (-4 + HOLE.z1) / 2, 8, 0.15, HOLE.z1 + 4, fc, fl);
    put('box', (HOLE.x2 + 4) / 2, -0.075, (HOLE.z1 + 4) / 2, 4 - HOLE.x2, 0.15, 4 - HOLE.z1, fc, fl);
    // výdejní šachta
    const pitC = [0.5, 0.2, 0.08], pe = { emis: [0.12, 0.05, 0.0], noCull: true };
    put('plane', (HOLE.x1 + HOLE.x2) / 2, -2.4, (HOLE.z1 + HOLE.z2) / 2, HOLE.x2 - HOLE.x1, HOLE.z2 - HOLE.z1, 1, [0.3, 0.12, 0.05], pe, -Math.PI / 2);
    put('plane', HOLE.x2, -1.28, (HOLE.z1 + HOLE.z2) / 2, HOLE.z2 - HOLE.z1, 2.25, 1, pitC, pe, 0, -Math.PI / 2);
    put('plane', (HOLE.x1 + HOLE.x2) / 2, -1.28, HOLE.z1, HOLE.x2 - HOLE.x1, 2.25, 1, pitC, pe);
    const glow = 0.5 + 0.5 * Math.sin(t * 4);
    put('box', (HOLE.x1 + HOLE.x2) / 2, 0.02, HOLE.z1, HOLE.x2 - HOLE.x1, 0.07, 0.1, COL.gold, { unlit: true, emis: [0.1 * glow, 0, 0] });
    put('box', HOLE.x2, 0.02, (HOLE.z1 + HOLE.z2) / 2, 0.1, 0.07, HOLE.z2 - HOLE.z1, COL.gold, { unlit: true });

    // stěny (viditelné jen zevnitř), strop
    const wallO = { tex: texWall, spec: 0.05 }, wc = [0.62, 0.45, 0.95];
    put('plane', 0, 4.2, -HALF, 8, 8.4, 1, wc, wallO);
    put('plane', 0, 4.2, HALF, 8, 8.4, 1, wc, wallO, 0, Math.PI);
    put('plane', -HALF, 4.2, 0, 8, 8.4, 1, wc, wallO, 0, Math.PI / 2);
    put('plane', HALF, 4.2, 0, 8, 8.4, 1, wc, wallO, 0, -Math.PI / 2);
    put('plane', 0, 8.4, 0, 8, 8, 1, [0.22, 0.12, 0.4], {}, Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const hue = (t * 0.5 + i * 0.25) % 1, c = [0.5 + 0.5 * Math.sin(hue * 6.28), 0.5 + 0.5 * Math.sin(hue * 6.28 + 2.1), 0.5 + 0.5 * Math.sin(hue * 6.28 + 4.2)];
      put('box', -3 + i * 2, 8.36, 0, 0.35, 0.06, 7.2, c, { unlit: true });
    }

    // rám
    for (const [x, z] of [[-4.2, -4.2], [4.2, -4.2], [-4.2, 4.2], [4.2, 4.2]]) put('box', x, 4.25, z, 0.42, 8.7, 0.42, COL.pink, { spec: 0.6, shine: 70 });
    put('box', 0, 8.55, 4.2, 9, 0.38, 0.42, COL.purple, { spec: 0.4 }); put('box', 0, 8.55, -4.2, 9, 0.38, 0.42, COL.purple, { spec: 0.4 });
    put('box', -4.2, 8.55, 0, 0.42, 0.38, 8, COL.purple, { spec: 0.4 }); put('box', 4.2, 8.55, 0, 0.42, 0.38, 8, COL.purple, { spec: 0.4 });

    // světelná reklama
    put('box', 0, 9.65, 0, 9.0, 2.0, 4.0, COL.purple, { spec: 0.4 });
    put('box', 0, 10.72, 0, 9.4, 0.22, 4.3, COL.pink, { spec: 0.6, shine: 60 });
    put('plane', 0, 9.65, 2.012, 8.5, 1.7, 1, [1, 1, 1], { tex: texMarquee, unlit: true });
    put('plane', 0, 9.65, -2.012, 8.5, 1.7, 1, [1, 1, 1], { tex: texMarquee, unlit: true }, 0, Math.PI);
    for (let i = 0; i < 13; i++) {
      const on = (Math.floor(t * 3) + i) % 2 === 0, x = -4 + i * (8 / 12);
      for (const z of [2.12, -2.12]) put('sphere', x, 8.78, z, 0.1, 0.1, 0.1, on ? [1, 0.9, 0.4] : [0.4, 0.3, 0.2], { unlit: true, emis: on ? [0.4, 0.3, 0] : [0, 0, 0] });
    }

    // ovládací pult
    put('box', 0, -2.2, 5.6, 9, 2.6, 2.4, [0.27, 0.09, 0.47], { spec: 0.3 });
    put('box', 0, -0.88, 5.6, 8.6, 0.14, 2.2, [0.1, 0.07, 0.2], { spec: 0.5, shine: 60 });
    put('box', 0, -0.82, 6.72, 8.8, 0.1, 0.12, COL.pink, { spec: 0.6, shine: 60 });
    // joystick
    put('cyl', -1.9, -0.78, 5.7, 1.0, 0.16, 1.0, [0.55, 0.55, 0.62], { spec: 0.7, shine: 70 });
    put('cyl', -1.9, -0.72, 5.7, 0.62, 0.1, 0.62, [0.1, 0.1, 0.12], { spec: 0.4 });
    {
      const jm = M.chain(M.translate(-1.9, -0.7, 5.7), M.rotX(G.tilt.z * 0.5), M.rotZ(-G.tilt.x * 0.5));
      R.draw('cyl', M.mul(jm, M.mul(M.translate(0, 0.45, 0), M.scale(0.15, 0.9, 0.15))), { color: [0.8, 0.8, 0.86], spec: 0.8, shine: 60 });
      R.draw('sphere', M.mul(jm, M.mul(M.translate(0, 1.0, 0), M.scale(0.34, 0.34, 0.34))), { color: [0.95, 0.12, 0.2], spec: 0.9, shine: 70 });
    }
    // tlačítko
    const press = G.btnPress * 0.08, pulse = G.phase === 'aim' ? 0.5 + 0.5 * Math.sin(t * 8) : 0.1;
    put('cyl', 1.9, -0.78, 5.7, 1.2, 0.14, 1.2, [0.6, 0.6, 0.66], { spec: 0.7, shine: 70 });
    put('cyl', 1.9, -0.68 - press, 5.7, 0.86, 0.18, 0.86, [0.95, 0.15, 0.2], { spec: 0.8, shine: 60, emis: [0.25 * pulse, 0, 0] });
    // přihrádka na výhry a světýlka
    put('box', -3.0, -1.9, 6.42, 2.0, 1.3, 0.1, [0.04, 0.03, 0.08]);
    for (const [x, y, sx, sy] of [[-3.0, -1.25, 2.2, 0.12], [-3.0, -2.55, 2.2, 0.12], [-4.05, -1.9, 0.12, 1.4], [-1.95, -1.9, 0.12, 1.4]]) put('box', x, y, 6.46, sx, sy, 0.1, COL.gold, { spec: 0.6, shine: 50 });
    for (let i = 0; i < 7; i++) {
      const on = Math.sin(t * 5 + i) > 0; put('sphere', 0.1 + i * 0.35, -0.73, 6.2, 0.07, 0.05, 0.07, on ? [1, 0.85, 0.3] : [0.3, 0.25, 0.1], { unlit: true });
    }

    // sklo kolem výdejního otvoru: rámeček a sloupky (pruhy skla se kreslí až nakonec)
    for (const w of GLASS) {
      const cx = (w.ax + w.bx) / 2, cz = (w.az + w.bz) / 2, lx = Math.abs(w.bx - w.ax), lz = Math.abs(w.bz - w.az);
      put('box', cx, GH, cz, lx + 0.1, 0.09, lz + 0.1, COL.pink, { spec: 0.6, shine: 70 });
      put('box', cx, 0.04, cz, lx + 0.08, 0.08, lz + 0.08, COL.pink, { spec: 0.5, shine: 50 });
    }
    for (const [x, z] of [[HOLE.x2, HOLE.z1], [HOLE.x2, HOLE.z2], [HOLE.x1, HOLE.z1]]) put('box', x, GH / 2, z, 0.1, GH, 0.1, COL.pink, { spec: 0.6, shine: 70 });

    // plyšáci a stíny
    for (const p of plush) {
      const h = Math.max(0, p.y - p.r), a = clamp(0.32 - h * 0.06, 0.06, 0.3);
      if (p.y > -0.2) put('cyl', p.x, 0.025, p.z, p.r * 1.8, 0.01, p.r * 1.8, [0, 0, 0], { alpha: a, unlit: true, noDepth: true });
    }
    put('cyl', claw.x, 0.03, claw.z, 1.5, 0.01, 1.5, [0, 0, 0], { alpha: clamp(0.3 - (claw.y) * 0.03, 0.05, 0.3), unlit: true, noDepth: true });
    for (const p of plush) drawPlush(p);
    drawClaw(t);

    // bomba
    if (G.bomb) {
      const b = G.bomb;
      if (b.st !== 'boom') {
        const on = b.st === 'fuse' && Math.floor(b.blink) % 2 === 0, k = b.st === 'fuse' ? 1 + 0.06 * Math.sin(b.blink * 6.28) : 1;
        put('sphere', b.x, b.y, b.z, BR * k, BR * k, BR * k, on ? [0.95, 0.15, 0.1] : [0.1, 0.1, 0.13], { spec: 0.9, shine: 60, rim: 0.3, emis: on ? [0.6, 0.05, 0.02] : [0, 0, 0] });
        put('cyl', b.x, b.y + BR + 0.1, b.z, 0.07, 0.22, 0.07, [0.75, 0.6, 0.3]);
        put('sphere', b.x, b.y + BR + 0.26, b.z, 0.11, 0.11, 0.11, [1, 0.85, 0.3], { unlit: true });
      } else {
        const k = Math.min(1, b.t / 0.35), r = 0.5 + k * 5.5;
        put('sphere', b.x, b.y, b.z, r, r, r, [1, 0.65, 0.25], { alpha: 0.35 * (1 - k), unlit: true, noDepth: true });
      }
    }

    // konfety
    for (const q of particles) put('box', q.x, q.y, q.z, q.s, q.s * 0.3, q.s, q.c, { unlit: true }, q.rx, q.rx * 0.7, q.rx * 0.4);

    // sklo (nakonec, průhledné)
    const gl = { alpha: 0.07, rim: 0.9, spec: 0.5, shine: 60, noDepth: true, noCull: true };
    const gc = [0.7, 0.88, 1];
    put('plane', 0, 4.2, HALF + 0.05, 8.1, 8.4, 1, gc, gl);
    put('plane', 0, 4.2, -HALF - 0.05, 8.1, 8.4, 1, gc, gl);
    put('plane', -HALF - 0.05, 4.2, 0, 8.1, 8.4, 1, gc, gl, 0, Math.PI / 2);
    put('plane', HALF + 0.05, 4.2, 0, 8.1, 8.4, 1, gc, gl, 0, Math.PI / 2);
    const gh = { alpha: 0.2, rim: 0.9, spec: 0.6, shine: 60, noDepth: true, noCull: true };
    put('plane', HOLE.x2, GH / 2, (HOLE.z1 + HOLE.z2) / 2, HOLE.z2 - HOLE.z1, GH, 1, gc, gh, 0, Math.PI / 2);
    put('plane', (HOLE.x1 + HOLE.x2) / 2, GH / 2, HOLE.z1, HOLE.x2 - HOLE.x1, GH, 1, gc, gh);
    const st = { alpha: 0.1, unlit: true, noDepth: true, noCull: true };
    for (const [x, z, ry] of [[0, HALF + 0.06, 0], [0, -HALF - 0.06, 0], [-HALF - 0.06, 0, Math.PI / 2], [HALF + 0.06, 0, Math.PI / 2]]) {
      put('plane', x, 5.2, z, 1.2, 8.8, 1, [1, 1, 1], st, 0, ry, 0.5); put('plane', x + (ry ? 0 : 1.6), 5.2, z + (ry ? 1.6 : 0), 0.4, 8.8, 1, [1, 1, 1], st, 0, ry, 0.5);
    }
  }

  // ---- textury ----------------------------------------------------------------------------------------
  function makeMarquee() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 220; const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 1024, 0); bg.addColorStop(0, '#5b1a9a'); bg.addColorStop(0.5, '#b21f7c'); bg.addColorStop(1, '#5b1a9a');
    g.fillStyle = bg; g.fillRect(0, 0, 1024, 220);
    g.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc((i * 83) % 1024, (i * 47) % 220, 3 + (i % 4), 0, 7); g.fill(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 150px Impact, "Arial Black", system-ui, sans-serif';
    g.lineWidth = 16; g.strokeStyle = '#2a0b4d'; g.strokeText('PLYŠÁKY', 512, 112);
    g.shadowColor = '#ffe27a'; g.shadowBlur = 28; g.fillStyle = '#ffd84a'; g.fillText('PLYŠÁKY', 512, 112);
    g.shadowBlur = 0; g.font = '700 34px system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText('★  VYHRAJ SVÉHO KAMARÁDA  ★', 512, 198);
    return c;
  }
  function makeWall() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 512); bg.addColorStop(0, '#3a1b78'); bg.addColorStop(1, '#6b2a9e');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,.07)' : 'rgba(255,220,255,.12)';
      g.beginPath(); g.arc(32 + x * 64, 32 + y * 64, (x + y) % 2 ? 6 : 10, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 30; i++) { g.beginPath(); g.arc((i * 137) % 512, (i * 71) % 512, 1.6, 0, 7); g.fill(); }
    return c;
  }

  // ---- start ----------------------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; lastT += dt;
    try { update(dt); drawScene(lastT); } catch (e) { console.error(e); }
  }

  // kontrola, jestli horní lištu něco nepřekrývá (např. reklama/skript hostingu); výsledek se ukáže dole
  function coverCheck() {
    const bar = document.querySelector('.bar'); const app = document.getElementById('app');
    const find = () => {
      const out = [];
      for (const s of ['#back', '#btn-info', '#btn-snd']) {
        const b = $(s); if (!b) continue;
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (top && top !== b && !b.contains(top)) out.push({ s, top });
      }
      return out;
    };
    const run = (final) => {
      let bad = find(); if (!bad.length) return;
      bar.style.zIndex = '2147483647'; app.style.zIndex = '2147483646'; // 1) přebít cizí vrstvu (#app tvoří vlastní vrstvu)
      bad = find(); if (!bad.length) return;
      // 2) posunout lištu pod cizí prvek
      let low = 0;
      for (const x of bad) { let el = x.top; while (el.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement) el = el.parentElement; const r = el.getBoundingClientRect(); if (r.top < 120) low = Math.max(low, r.bottom); }
      if (low > 0 && low < 200) { bar.style.top = Math.ceil(low) + 'px'; app.style.paddingTop = 'calc(' + Math.ceil(low) + 'px + var(--barh, 56px))'; bad = find(); if (!bad.length) return; }
      if (final) {
        const e = document.getElementById('errbar');
        if (e) { e.hidden = false; e.textContent = 'Tlačítka v liště překrývá jiný prvek stránky:\n' + bad.map((x) => x.s + ' <- ' + x.top.outerHTML.slice(0, 160)).join('\n') + '\n'; }
      }
    };
    setTimeout(() => run(false), 500); setTimeout(() => run(true), 3000); window.addEventListener('resize', () => run(false));
  }

  async function init() {
    // horní lišta nesmí záviset na tom, jestli se povede 3D: tlačítka se zapojí jako první
    const snd = $('#btn-snd'); const paint = () => { snd.textContent = soundOn ? '🔊' : '🔇'; }; paint();
    snd.onclick = () => { soundOn = !soundOn; store.set('claw_sound', soundOn ? '1' : '0'); paint(); if (soundOn) sfx.tick(); };
    $('#btn-info').onclick = () => { $('#modal').hidden = false; };
    $('#modal-close').onclick = () => { $('#modal').hidden = true; };
    coverCheck();
    $('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) $('#modal').hidden = true; });
    renderPrizes();
    const fail = (msg) => { $('#fatal').hidden = false; $('#fatal').textContent = msg; };
    const canvas = $('#gl');
    try {
      R = new Renderer(canvas);
      texMarquee = R.texture(makeMarquee()); texWall = R.texture(makeWall());
    } catch (e) { fail('Tvůj prohlížeč nepodporuje 3D (WebGL), automat se nedá spustit. ' + (e && e.message ? '(' + e.message + ')' : '')); return; }
    try {
      stockAll(); setupJoystick(); setupCamera(canvas);
      $('#btn-play').addEventListener('click', startPlay);
      $('#btn-buy1').addEventListener('click', () => buy(1));
      $('#btn-buy6').addEventListener('click', () => buy(6));
      $('#btn-drop').addEventListener('click', doDrop);
      $('#btn-bomb').addEventListener('click', buyBomb);
    } catch (e) { fail('Chyba při startu hry: ' + (e && e.message)); return; }
    refreshHud();
    requestAnimationFrame(frame);
    window.__claw = { G, claw, plush, cam, LOOKS, update, physStep, startPlay, doDrop, HOME, HUB_TOP };
    const r = await api('state', { fresh: true }); // čerstvě načtená stránka: starou rozehranou hru zahodit
    if (r.ok) { G.ready = true; applyState(r.json); } else { fail((r.json && r.json.error) || 'Nepodařilo se připojit k serveru.'); }
    refreshHud();
  }
  init();
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
})();
