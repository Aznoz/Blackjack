/* Key Master: 3D automat (three.js). Hráč nejdřív šipkami ◀ ▶ vodorovně zamíří klíč na svítící dírku, pak stiskne Vyjet:
 * rameno s klíčem jede nahoru a hráč ho tlačítkem STOP zastaví přesně v úrovni dírky (klíč se zasune dovnitř).
 * Automat jde otáčet jako ten na plyšáky. Hra běží v prohlížeči, server (/api/keymaster/*) hlídá zůstatek, cenu pokusu,
 * postup po patrech a losuje odměny. */
import * as THREE from './vendor/three.module.min.js';
window.__km_ready = true;

(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fmt = (n) => Number(n || 0).toLocaleString('cs-CZ');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);

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
    if (window.KEYMASTER_API_URL) return String(window.KEYMASTER_API_URL).replace(/\/+$/, '');
    if (P.apiUrl) return String(P.apiUrl).replace(/\/+$/, '');
    const ws = window.BJ_WS_URL || window.AH_WS_URL;
    if (ws) { try { const u = new URL(ws); return (u.protocol === 'wss:' ? 'https://' : 'http://') + u.host; } catch (e) { /* ignore */ } }
    return location.origin;
  }
  const API = apiBase();
  async function api(action, body = {}) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 75000);
    try {
      const res = await fetch(`${API}/api/keymaster/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ token: getToken(), session: getSession(), ...body }),
      });
      let json = null; try { json = await res.json(); } catch (e) { /* ignore */ }
      return { ok: res.ok, status: res.status, json: json || {} };
    } catch (e) { return { ok: false, status: 0, json: { error: 'Server neodpovídá.' } }; } finally { clearTimeout(timer); }
  }

  // ---- zvuk ---------------------------------------------------------------------------------------
  let soundOn = store.get('keymaster_sound') !== '0';
  let actx = null;
  function tone(f, d, type = 'sine', vol = 0.1, slide = 0, delay = 0) {
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
    tick() { tone(1500, 0.02, 'square', 0.012); },
    press() { tone(180, 0.09, 'square', 0.09, -60); },
    lock() { tone(110, 0.14, 'square', 0.12, -40); tone(1320, 0.3, 'triangle', 0.09, 0, 0.05); tone(1760, 0.3, 'triangle', 0.07, 0, 0.1); },
    fail() { tone(220, 0.45, 'sawtooth', 0.1, -150); tone(110, 0.55, 'square', 0.08, -50, 0.08); },
    up() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.1, 0, i * 0.07)); },
    lift() { tone(140, 0.9, 'sawtooth', 0.035, 110); },
    coin() { tone(1900 + Math.random() * 500, 0.09, 'triangle', 0.06); },
    win() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 0, i * 0.09)); },
    start() { [392, 523, 659].forEach((f, i) => tone(f, 0.12, 'square', 0.06, 0, i * 0.06)); },
  };

  // ---- data: odměny (stejné pořadí jako na serveru, viz Stacker) ------------------------------------
  const ITEMS = [
    ['🍫', 'Čokoláda', 500, 1], ['🪁', 'Drak na létání', 1000, 2], ['🎲', 'Hra do party', 2000, 2], ['🔦', 'Svítilna', 3000, 2], ['🧢', 'Kšiltovka', 5000, 3],
    ['🧸', 'Plyšový medvěd', 10000, 3], ['🎧', 'Sluchátka', 20000, 3], ['🎮', 'Herní ovladač', 30000, 3], ['⌚', 'Chytré hodinky', 40000, 4],
    ['🛴', 'Koloběžka', 50000, 4], ['📷', 'Fotoaparát', 60000, 5], ['📱', 'Telefon', 75000, 5], ['💻', 'Notebook', 100000, 6],
    ['🏆', 'Zlatý pohár', 10000, 1], ['💍', 'Diamantový prsten', 30000, 1], ['👑', 'Koruna', 50000, 1], ['🏎️', 'Sporťák', 75000, 1], ['⛵', 'Plachetnice', 100000, 1], ['🏝️', 'Soukromý ostrov', 300000, 1],
  ];
  const CFG = { price: 100, coins: [50, 100, 200, 300, 500, 1000, 2000], weights: [45, 40, 30, 20, 10, 4, 1], small: [0, 1, 2, 3, 4, 5, 6, 7, 8], big: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18] };
  const TIER_NAME = [null, 'Coiny', 'Malá odměna', 'Velká odměna'];
  const TIER_ICON = [null, '🪙', '🎁', '🏆'];

  // ---- pravidla hry (zamíření, jízda nahoru a tolerance) -----------------------------------------------------
  const TIER_Y = [0, -2.8, 0.2, 3.1];        // výška dírek v patrech 1–3 (v téhle výšce musí být osa klíče)
  const SOCK_X = [-3, -1, 1, 3];             // čtyři dírky v každém patře
  const AIM_MAX = 3.6;                        // klíč jde vodorovně posouvat od -AIM_MAX do +AIM_MAX
  const LO = [0, 1.5, 1.6, 1.8], HI = 1.2;    // rameno jede od (výška dírky - LO) do (výška dírky + HI) a zase zpátky
  const RAMP = 0.7;                           // rozjezd ramene (s)
  const SPEED = [0, 1.7, 2.1, 2.5];           // rychlost jízdy nahoru (jednotek za sekundu): pomalejší, ale přesnější, o úspěchu rozhoduje načasování
  const TOL = [0, 0.14, 0.12, 0.10];          // trefa = klíč se OPRAVDU vejde do dírky: osa klíče nejvýš TOL od středu dírky vodorovně i svisle
  const CLR = TOL.map((t) => (t ? t + 0.02 : 0));   // vůle kolem klíče v dírce (o kousek víc než tolerance, aby klíč při trefě opticky zapadl)
  const TIER_COL = [0, 0xaeb9d2, 0x2a63e6, 0xf2ae00];   // rámy dírek: stříbrný, modrý, zlatý
  const ARM_MS = 800;                         // po stisku Vyjet chvíli nejde zastavit (server má minimum doby patra)
  const KZ = 1.5;                             // z-ová poloha ouška klíče v klidu; zasunutím se klíč posune o PUSH dozadu
  const PUSH = 1.1, MISS_PUSH = 0.62, HOOP_Z = -1.0;   // zasunutí do dírky / dotek špičky o desku při netrefě
  const POLE_X = 4.3;                         // svislé tyče vpravo, po kterých jezdí rameno
  // tvar dírky = průřez klíče (široké tělo, dole rovně, nahoře dva schody); klíč má tenhle průřez ve špičce, dírka je o vůli CLR větší
  const KEYHOLE = [[-0.62, -0.55], [0.62, -0.55], [0.62, 0.10], [0.34, 0.10], [0.34, 0.62], [-0.30, 0.62], [-0.30, 0.32], [-0.62, 0.32]];
  const KS = 0.46;                            // měřítko průřezu klíče (menší klíč než dřív)
  const rampDist = (t, v) => (t < RAMP ? (v * t * t) / (2 * RAMP) : (v * RAMP) / 2 + v * (t - RAMP));
  // Jedna souvislá jízda od spodku (pod 1. patrem) až úplně nahoru (nad 3. patro); rychlost roste s výškou (SPEED podle patra).
  // Hráč klíč zastaví, kdy chce: o patře rozhoduje to, kde ho zastaví. Nahoře rameno samo dojede na doraz (= netrefa).
  const Y_BOT = TIER_Y[1] - LO[1], Y_TOP = TIER_Y[3] + HI;
  const RISE_SEG = [[Y_BOT, (TIER_Y[1] + TIER_Y[2]) / 2, SPEED[1]], [(TIER_Y[1] + TIER_Y[2]) / 2, (TIER_Y[2] + TIER_Y[3]) / 2, SPEED[2]], [(TIER_Y[2] + TIER_Y[3]) / 2, Y_TOP, SPEED[3]]];
  const keyYAt = (t) => {
    t = Math.max(0, t); if (t < RAMP) return Y_BOT + (SPEED[1] * t * t) / (2 * RAMP);
    let y = Y_BOT + (SPEED[1] * RAMP) / 2, tt = t - RAMP;
    for (const [a, b, v] of RISE_SEG) { if (y >= b) continue; const y0 = Math.max(y, a), need = (b - y0) / v; if (tt < need) return y0 + v * tt; tt -= need; y = b; }
    return Y_TOP;
  };
  const RISE_T = (() => { let t = 0; while (keyYAt(t) < Y_TOP && t < 60) t += 0.005; return t; })();   // za jak dlouho rameno dojede úplně nahoru (s)
  const tierAt = (y) => { let b = 1; for (let k = 2; k <= 3; k++) if (Math.abs(y - TIER_Y[k]) < Math.abs(y - TIER_Y[b])) b = k; return b; };   // nejbližší patro k výšce klíče
  const baseY = () => Y_BOT;
  const sweepX = (t, v, p0) => { const R = 3.8, L = 4 * R; const p = (v * t + p0) % L; return p < 2 * R ? -R + p : 3 * R - p; };   // jen ukázka v klidu

  // ---- stav hry -------------------------------------------------------------------------------------
  const G = {
    phase: 'boot',                // boot | idle | aim | rise | push | claiming | reveal | over
    ready: false, busy: false, balance: 0, playId: null, parts: [],
    tier: 1, riseStart: 0, target: 1, lit: [null, null, null, null], aimX: 0, keyX: 0, keyY: 0, elevY: baseY(1), prevX: null, prevY: null, attractT0: 0, moveT: 0,
  };
  const held = { l: false, r: false };
  const tweens = [];
  function tween(dur, fn, ease = (k) => k) {
    return new Promise((res) => { tweens.push({ t0: performance.now(), dur, fn, ease, res }); });
  }
  function tickTweens(now) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; const k = clamp((now - tw.t0) / tw.dur, 0, 1);
      tw.fn(tw.ease(k), k);
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
  }

  // ===================================================================================================
  // 3D scéna
  // ===================================================================================================
  const stage = $('#stage'), canvas = $('#gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    const f = $('#fatal'); f.hidden = false; f.textContent = 'Tvůj prohlížeč nepodporuje 3D (WebGL), Key Master se nedá spustit.';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 300);

  // prostředí pro odlesky lesklého plastu a kovu (jednoduché „softboxy“)
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.MeshBasicMaterial({ color: 0x9aa1bf, side: THREE.BackSide })));
    const box = (w, h, x, y, z, s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(s, s, s), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
    box(30, 6, 0, 22, 8, 6); box(6, 30, -24, 4, 8, 4); box(6, 30, 24, 4, 8, 4); box(24, 5, 0, -14, 14, 2.5); box(14, 14, 0, 4, 28, 3); box(10, 24, 0, 2, -30, 2);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(env, 0.03).texture; pm.dispose();
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfd2e6, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(6, 14, 12); scene.add(sun);
  const sun2 = new THREE.DirectionalLight(0xdfe6ff, 0.7); sun2.position.set(-9, 6, -8); scene.add(sun2);

  const phys = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, metalness: 0.05, ...o });
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, ...o });
  const addBox = (parent, w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; };
  const addCyl = (parent, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 24) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); parent.add(o); return o; };
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  const emojiCache = {};
  function emojiTex(e) {
    return emojiCache[e] || (emojiCache[e] = canvasTex(128, 128, (g) => {
      g.font = '92px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 70);
    }));
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function rrPath(p, cx, cy, w, h, r) { const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2; p.moveTo(x0 + r, y0); p.lineTo(x1 - r, y0); p.quadraticCurveTo(x1, y0, x1, y0 + r); p.lineTo(x1, y1 - r); p.quadraticCurveTo(x1, y1, x1 - r, y1); p.lineTo(x0 + r, y1); p.quadraticCurveTo(x0, y1, x0, y1 - r); p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0); return p; }
  /** Bílý panel s oknem (výřez se zaoblenými rohy). */
  function windowPanel(w, h, win, depth, m) {
    const s = rrPath(new THREE.Shape(), 0, 0, w, h, 0.25);
    s.holes.push(rrPath(new THREE.Path(), win.cx, win.cy, win.w, win.h, win.r));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 8 }); g.translate(0, 0, -depth / 2);
    return new THREE.Mesh(g, m);
  }

  const cab = new THREE.Group(); scene.add(cab);
  const paint = phys(0x14151c, { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.18 });   // černý lak
  const dotTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#16171f'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(120,128,165,.3)'; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(x * 32 + 16 + (y % 2) * 16, y * 32 + 16, 5, 0, 7); g.fill(); } }, [1, 1]);
  const paintDots = phys(0xffffff, { map: dotTex, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const grey = phys(0x3b3e4e, { roughness: 0.4, metalness: 0.3 }), dark = mat(0x16172a, { roughness: 0.7 }), chrome = mat(0xe3e7f2, { metalness: 1, roughness: 0.2 }), blackMetal = mat(0x1d1f2b, { metalness: 0.8, roughness: 0.35 });
  const CW = 10, CD = 6.6;                                              // půdorys automatu (x × z)
  const BASE0 = -9.5, BASE1 = -4.9, WIN0 = -4.9, WIN1 = 5.5;            // spodek, okno

  // --- stín pod automatem
  { const t = canvasTex(256, 256, (g) => { const r = g.createRadialGradient(128, 128, 20, 128, 128, 128); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(19, 15), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = BASE0 - 0.55; cab.add(m); }

  // --- spodek: skříň, kolečka, přední panel
  addBox(cab, CW, BASE1 - BASE0, CD, paintDots, 0, (BASE0 + BASE1) / 2, 0);
  for (const [x, z] of [[-4.2, -2.6], [4.2, -2.6], [-4.2, 2.6], [4.2, 2.6]]) { const w = addCyl(cab, 0.35, 0.35, 0.3, dark, x, BASE0 - 0.25, z, 16); w.rotation.z = Math.PI / 2; }
  addBox(cab, CW + 0.1, 0.18, CD + 0.1, grey, 0, BASE1 + 0.09, 0);
  // --- okenní část: přední a boční panely s okny, zadní panel, strop
  const front = windowPanel(CW, WIN1 - WIN0, { cx: 0, cy: 0.05, w: 8.9, h: 9.5, r: 0.45 }, 0.3, paint); front.position.set(0, (WIN0 + WIN1) / 2, CD / 2 - 0.15); cab.add(front);
  for (const sx of [-1, 1]) {
    const sp = windowPanel(CD, WIN1 - WIN0, { cx: 0.3, cy: 0.2, w: 4.6, h: 7.4, r: 0.45 }, 0.3, paintDots); sp.rotation.y = sx * Math.PI / 2; sp.position.set(sx * (CW / 2 - 0.15), (WIN0 + WIN1) / 2, 0); cab.add(sp);
  }
  addBox(cab, CW, WIN1 - WIN0, 0.3, paint, 0, (WIN0 + WIN1) / 2, -CD / 2 + 0.15);
  addBox(cab, CW, 1.0, CD, paint, 0, WIN1 + 0.5, 0);
  // --- nástavec s nápisem
  const top = new THREE.Group(); top.position.set(0, WIN1 + 1.0, -0.9); cab.add(top);
  addBox(top, CW - 0.8, 3.3, 3.8, paintDots, 0, 1.65, 0);
  const marqueeTex = canvasTex(1024, 330, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#e3e7ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(100,108,150,.35)'; for (let y = 8; y < h; y += 16) for (let x = (((y - 8) / 16) % 2) * 8 + 4; x < w; x += 16) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
    g.lineJoin = 'round'; g.textBaseline = 'middle';
    const L = [['K', '#e53935'], ['E', '#fb8c00'], ['Y', '#fdd835'], [' ', null], ['M', '#e53935'], ['A', '#fdd835'], ['S', '#43a047'], ['T', '#1e88e5'], ['E', '#fb8c00'], ['R', '#8e24aa']];
    let fs = 150; g.font = `900 ${fs}px "Arial Black", Impact, "Segoe UI", sans-serif`;
    let ws = L.map(([c]) => g.measureText(c).width + (c === ' ' ? 10 : 4)); let total = ws.reduce((a, b) => a + b, 0);
    if (total > w - 250) { fs = Math.floor(fs * (w - 250) / total); g.font = `900 ${fs}px "Arial Black", Impact, "Segoe UI", sans-serif`; ws = L.map(([c]) => g.measureText(c).width + (c === ' ' ? 10 : 4)); total = ws.reduce((a, b) => a + b, 0); }
    let x = 40 + (w - 250 - total) / 2;
    L.forEach(([c, col], i) => { if (col) { g.lineWidth = 16; g.strokeStyle = '#1b1c4a'; g.strokeText(c, x, h / 2 + 8); g.fillStyle = col; g.fillText(c, x, h / 2 + 8); } x += ws[i]; });
    g.strokeStyle = '#1e3fae'; g.lineWidth = 22; g.beginPath(); g.arc(w - 105, h / 2 - 25, 40, 0, 7); g.stroke();
    g.lineWidth = 20; g.lineCap = 'round'; g.beginPath(); g.moveTo(w - 80, h / 2 + 5); g.lineTo(w - 80, h / 2 + 90); g.moveTo(w - 80, h / 2 + 45); g.lineTo(w - 48, h / 2 + 45); g.moveTo(w - 80, h / 2 + 78); g.lineTo(w - 52, h / 2 + 78); g.stroke();
  });
  const mqMat = new THREE.MeshStandardMaterial({ map: marqueeTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: marqueeTex, emissiveIntensity: 0.5 });
  const mq1 = new THREE.Mesh(new THREE.PlaneGeometry(CW - 1.3, 3.0), mqMat); mq1.position.set(0, 1.65, 1.92); top.add(mq1);
  const mq2 = new THREE.Mesh(new THREE.PlaneGeometry(CW - 1.3, 3.0), mqMat); mq2.rotation.y = Math.PI; mq2.position.set(0, 1.65, -1.92); top.add(mq2);
  // boční nálepky s klíčem pod oknem
  const stickerTex = canvasTex(256, 512, (g, w, h) => {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '150px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.fillText('🗝️', w / 2, 120); g.fillText('🧰', w / 2, 300);
    g.lineJoin = 'round'; g.font = '900 64px "Arial Black", Impact, sans-serif'; g.lineWidth = 12; g.strokeStyle = '#1b1c4a'; g.strokeText('KEY', w / 2, 410); g.fillStyle = '#ffd33d'; g.fillText('KEY', w / 2, 410);
    g.strokeText('MASTER', w / 2, 470); g.fillStyle = '#ff7a2e'; g.font = '900 56px "Arial Black", Impact, sans-serif'; g.fillText('MASTER', w / 2, 470);
  });
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.4), new THREE.MeshBasicMaterial({ map: stickerTex, transparent: true })); m.rotation.y = sx * Math.PI / 2; m.position.set(sx * (CW / 2 + 0.02), -7.0, -0.2); cab.add(m); }

  // --- přední strana spodku: logo, mincovníky, reproduktor, otvor na výhru
  const logoTex = canvasTex(512, 200, (g, w, h) => {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.font = '900 92px "Arial Black", Impact, sans-serif';
    g.lineWidth = 14; g.strokeStyle = '#1b1c4a'; g.strokeText('KEY', w / 2, 58); g.strokeText('MASTER', w / 2, 150);
    let gr = g.createLinearGradient(0, 10, 0, 100); gr.addColorStop(0, '#fff17a'); gr.addColorStop(1, '#ffb13a'); g.fillStyle = gr; g.fillText('KEY', w / 2, 58);
    gr = g.createLinearGradient(0, 100, 0, 190); gr.addColorStop(0, '#ff9a3a'); gr.addColorStop(1, '#e5362a'); g.fillStyle = gr; g.fillText('MASTER', w / 2, 150);
  });
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.21), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true })); logo.position.set(0.1, -6.62, CD / 2 + 0.02); cab.add(logo);
  for (const x of [-3.9, -2.9]) { addBox(cab, 0.8, 1.3, 0.12, chrome, x, -6.55, CD / 2 + 0.06); addBox(cab, 0.1, 0.5, 0.14, dark, x, -6.45, CD / 2 + 0.1); const b = addCyl(cab, 0.14, 0.14, 0.1, mat(0xe53935, { emissive: 0x7a0a0a, emissiveIntensity: 0.5 }), x, -7.0, CD / 2 + 0.12, 16); b.rotation.x = Math.PI / 2; }
  { const sp = addCyl(cab, 0.55, 0.55, 0.06, dark, 3.7, -6.0, CD / 2 + 0.03, 24); sp.rotation.x = Math.PI / 2; for (let i = -2; i <= 2; i++) addBox(cab, 0.8, 0.04, 0.08, grey, 3.7, -6.0 + i * 0.18, CD / 2 + 0.08); }
  addBox(cab, 1.3, 1.1, 0.14, dark, 3.7, -7.6, CD / 2 + 0.07);
  const flapTex = canvasTex(512, 300, (g, w, h) => {
    g.fillStyle = '#868ca2'; roundRect(g, 0, 0, w, h, 26); g.fill(); g.fillStyle = '#6a7087'; roundRect(g, 14, 14, w - 28, h - 28, 18); g.fill();
    g.fillStyle = 'rgba(255,255,255,.92)'; g.font = '900 70px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PRIZE', w / 2, h / 2 - 36); g.fillText('OUT', w / 2, h / 2 + 38);
  });
  addBox(cab, 4.0, 2.3, 0.16, dark, 0.1, -8.2, CD / 2 + 0.08);
  const flapPivot = new THREE.Group(); flapPivot.position.set(0.1, -7.2, CD / 2 + 0.2); cab.add(flapPivot);
  const flap = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.05), new THREE.MeshStandardMaterial({ map: flapTex, roughness: 0.4, transparent: true, opacity: 0.97 })); flap.position.set(0, -1.0, 0); flapPivot.add(flap);

  // --- ovládací pult vpředu: modré tlačítko a zelená páka
  const deck = new THREE.Group(); deck.position.set(0.3, WIN0 - 0.35, CD / 2 + 0.85); cab.add(deck);
  addBox(deck, 7.6, 0.55, 1.9, paint, 0, 0, 0);
  addBox(deck, 7.0, 0.1, 1.5, grey, 0, 0.3, 0);
  const btn3d = new THREE.Group(); btn3d.position.set(-1.0, 0.34, 0.05); deck.add(btn3d);
  addCyl(btn3d, 0.62, 0.7, 0.22, chrome, 0, 0, 0, 32);
  addCyl(btn3d, 0.5, 0.52, 0.3, mat(0x1a73ff, { emissive: 0x0a3fb0, emissiveIntensity: 0.9, roughness: 0.25 }), 0, 0.2, 0, 32);
  addCyl(deck, 0.12, 0.14, 0.45, chrome, 1.8, 0.5, 0.05, 12); const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), mat(0x2ecc71, { emissive: 0x0a6a30, emissiveIntensity: 0.6, roughness: 0.3 })); knob.position.set(1.8, 0.85, 0.05); deck.add(knob);

  // --- okna: sklo
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xcfe3ff, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
  const glassF = new THREE.Mesh(new THREE.PlaneGeometry(8.9, 9.5), glassM); glassF.position.set(0, (WIN0 + WIN1) / 2 + 0.05, CD / 2 - 0.1); glassF.renderOrder = 10; cab.add(glassF);
  for (const sx of [-1, 1]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 7.4), glassM); g.rotation.y = Math.PI / 2; g.position.set(sx * (CW / 2 - 0.1), (WIN0 + WIN1) / 2 + 0.2, 0.3); g.renderOrder = 10; cab.add(g); }
  // LED lišty kolem předního okna (v klidu barvy přeléváme)
  const leds = [];
  for (const [w, h, x, y] of [[0.1, 9.7, -4.5, 0.35], [0.1, 9.7, 4.5, 0.35], [9.1, 0.1, 0, 5.2], [9.1, 0.1, 0, -4.85]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3366 })); m.position.set(x, y, CD / 2 + 0.03); cab.add(m); leds.push(m); }

  // --- interiér: stěny, podlaha, osvětlení
  const inWall = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 10.0), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#eef0f8'); gr.addColorStop(1, '#d7dbe9'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(120,128,170,.22)'; for (let y = 8; y < h; y += 16) for (let x = (((y - 8) / 16) % 2) * 8 + 4; x < w; x += 16) { g.beginPath(); g.arc(x, y, 2.3, 0, 7); g.fill(); } }, [5, 5]), roughness: 0.8 }));
  inWall.position.set(0, 0.3, -CD / 2 + 0.31); cab.add(inWall);
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(CD - 0.6, 10), mat(0xe2e5f0, { roughness: 0.85 })); m.rotation.y = -sx * Math.PI / 2; m.position.set(sx * (CW / 2 - 0.31), 0.3, 0); cab.add(m); }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(9.4, CD - 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 5.28, 0); cab.add(ceil);
  const floorM = new THREE.Mesh(new THREE.PlaneGeometry(9.4, CD - 0.6), phys(0xf4f5fb, { roughness: 0.25, clearcoat: 1 })); floorM.rotation.x = -Math.PI / 2; floorM.position.set(0, -4.74, 0); cab.add(floorM);
  const lampA = new THREE.PointLight(0xffffff, 38, 26, 2); lampA.position.set(0, 4.5, 1.5); cab.add(lampA);
  const lampB = new THREE.PointLight(0xffffff, 30, 26, 2); lampB.position.set(0, -2.2, 1.8); cab.add(lampB);

  // --- patra: police, krabice s odměnou a desky s dírkou ve tvaru klíče (jako na fotce)
  function polyPath(path, pts, r) {   // uzavřená cesta po bodech se zaoblenými rohy
    const n = pts.length; const cut = (p, q, d) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy), k = Math.min(d, l / 2) / l; return [p[0] + dx * k, p[1] + dy * k]; };
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = cut(p, pts[(i + n - 1) % n], r), b = cut(p, pts[(i + 1) % n], r);
      if (i === 0) path.moveTo(a[0], a[1]); else path.lineTo(a[0], a[1]);
      path.quadraticCurveTo(p[0], p[1], b[0], b[1]);
    }
    path.closePath(); return path;
  }
  function offsetPoly(pts, d) {       // rozšíření mnohoúhelníku (proti směru hodin) o d
    const n = pts.length;
    return pts.map((p, i) => {
      const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n]; const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]]; const l1 = Math.hypot(e1[0], e1[1]), l2 = Math.hypot(e2[0], e2[1]);
      const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2]; const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
      return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
    });
  }
  function glitterTex(hex) {          // třpytivá fólie (hologram) rámu dírky
    const c = new THREE.Color(hex); const base = `#${c.getHexString()}`;
    return canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 520; i++) { const v = Math.random(); g.fillStyle = v < 0.5 ? 'rgba(255,255,255,.55)' : v < 0.8 ? 'rgba(255,255,255,.25)' : 'rgba(0,0,40,.22)'; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
    }, [1, 1]);
  }
  const boxTexCache = {};
  function boxTex(t) {                // přední strana krabice „WIN ME!“ s ikonou odměny
    return boxTexCache[t] || (boxTexCache[t] = canvasTex(256, 224, (g, w, h) => {
      g.fillStyle = '#fafbff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#17182e'; g.fillRect(0, 0, w, 58); g.fillStyle = '#ffd33d'; g.font = '900 44px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WIN ME!', w / 2, 31);
      g.fillStyle = '#' + new THREE.Color(TIER_COL[t]).getHexString(); g.fillRect(0, 58, w, 8);
      g.fillStyle = '#17182e'; g.font = '900 26px "Arial Black", Impact, sans-serif'; g.fillText(['', 'COINY', 'MALÁ ODMĚNA', 'VELKÁ ODMĚNA'][t], w / 2, 204);
      g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.fillText(TIER_ICON[t], w / 2, 138);
    }));
  }
  const glowTex = canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 4, 64, 64, 64); r.addColorStop(0, 'rgba(110,255,170,.95)'); r.addColorStop(0.45, 'rgba(60,255,140,.35)'); r.addColorStop(1, 'rgba(60,255,140,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
  const GREEN = new THREE.Color(0x2ee27a);
  const cells = [null, [], [], []];                    // cells[tier][i] = { fm, glow, box, g }
  const Z_BACK = -CD / 2 + 0.45;                       // zadní hrana polic
  const silverBar = mat(0x8d94ab, { metalness: 0.6, roughness: 0.35 });
  for (let t = 1; t <= 3; t++) {
    const y = TIER_Y[t], zc = (Z_BACK + HOOP_Z + 0.1) / 2, depth = HOOP_Z + 0.1 - Z_BACK;
    const holePts = offsetPoly(KEYHOLE.map(([px, py]) => [px * KS, py * KS]), CLR[t]), outPts = offsetPoly(holePts, 0.21), holeTop = Math.max(...holePts.map((q) => q[1]));   // dírka = průřez klíče + vůle
    const shape = polyPath(new THREE.Shape(), outPts, 0.2); shape.holes.push(polyPath(new THREE.Path(), holePts, 0.05));
    const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 6 }); fg.translate(0, 0, -0.06);
    const gt = glitterTex(TIER_COL[t]);
    addBox(cab, 9.0, 0.18, depth, paint, 0, y - 1.74, zc);                                                            // police
    const lip = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: TIER_COL[t] })); lip.position.set(0, y - 1.74, HOOP_Z + 0.2); cab.add(lip);
    addBox(cab, 9.0, 0.16, 0.14, paint, 0, y + 1.0, HOOP_Z);                                                          // upevňovací lišta desek
    for (let i = 0; i < 4; i++) {
      const x = SOCK_X[i], g = new THREE.Group(); g.position.set(x, y, 0); cab.add(g);
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.5), [mat(0xf2f3fa), mat(0xf2f3fa), mat(0xf2f3fa), mat(0xf2f3fa), new THREE.MeshStandardMaterial({ map: boxTex(t), roughness: 0.55, emissive: 0xffffff, emissiveMap: boxTex(t), emissiveIntensity: 0.0 }), mat(0xe4e6f2)]);
      box.position.set(0, -1.0, HOOP_Z - 0.6); g.add(box);                                                              // krabice stojí na polici za deskou
      const fm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: gt, metalness: 0.2, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.25, emissive: GREEN, emissiveIntensity: 0, iridescence: 0.3 });
      const frame = new THREE.Mesh(fg, fm); frame.position.set(0, 0, HOOP_Z); g.add(frame);
      addBox(g, 0.5, 0.16, 0.1, silverBar, 0, holeTop + 0.3, HOOP_Z);                                                 // šedý úchyt desky
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); glow.position.set(0, 0, HOOP_Z - 0.35); glow.scale.set(3.0, 3.0, 1); g.add(glow);
      cells[t].push({ fm, glow, box, g });
    }
  }
  // svislé tyče vpravo
  for (const z of [-0.45, 0.45]) addCyl(cab, 0.07, 0.07, 10.2, blackMetal, POLE_X, 0.3, z, 12);
  addBox(cab, 0.3, 10.2, 0.2, grey, POLE_X + 0.45, 0.3, 0);

  // --- výtah: modré rameno (z tyče vpravo až ke klíči) a zlatý klíč v držáku
  const elev = new THREE.Group(); cab.add(elev);                   // y = výška osy klíče
  const blue = phys(0x2a6be8, { roughness: 0.28, clearcoat: 0.8, metalness: 0.15 });
  const armBar = addBox(elev, 1, 0.3, 0.38, blue, 0, 0.7, 0);      // vodorovně od tyče ke klíči, roztahuje se podle polohy klíče
  addBox(elev, 0.55, 0.75, 1.1, blackMetal, POLE_X, 0.7, 0);         // vozík na tyčích
  const carr = new THREE.Group(); elev.add(carr);                   // všechno, co jede s klíčem doleva a doprava
  const zBar = addBox(carr, 0.34, 0.3, 1, blue, 0, 0.7, (KZ + 0.5) / 2); zBar.scale.z = KZ + 0.5;   // ramínko dopředu k držáku klíče
  addBox(carr, 0.5, 1.3, 0.4, blue, 0, 0.2, KZ + 0.5);               // držák, za který je klíč zavěšený
  const carLamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: 0x555a70 })); carLamp.position.set(0, 0.62, KZ + 0.72); carr.add(carLamp);
  const K = new THREE.Group(); K.position.set(0, 0, KZ); carr.add(K);   // klíč míří dozadu (−z), ouško (bow) je vpředu
  const gold = mat(0xffc531, { metalness: 1, roughness: 0.22, envMapIntensity: 1.6, emissive: 0x8a5200, emissiveIntensity: 0.3 });
  { const bow = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.08, 14, 36), gold); bow.rotation.y = Math.PI / 2; bow.scale.set(1, 1, 0.75); K.add(bow);              // ouško
    addCyl(K, 0.13, 0.13, 0.12, gold, 0, 0, -0.34, 20).rotation.x = Math.PI / 2;                                                                                  // límec
    addCyl(K, 0.075, 0.075, 1.0, gold, 0, 0, -0.9, 14).rotation.x = Math.PI / 2;                                                                                   // dřík
    const toothShape = polyPath(new THREE.Shape(), KEYHOLE.map(([px, py]) => [px * KS, py * KS]), 0.03);
    for (const [z0, len] of [[-0.7, 0.12], [-1.0, 0.12], [-1.35, 0.42]]) {   // zuby: průřez stejný jako tvar dírky, poslední (špička) zapadá do dírky
      const tg = new THREE.ExtrudeGeometry(toothShape, { depth: len, bevelEnabled: false, curveSegments: 4 }); tg.translate(0, 0, z0 - len);
      K.add(new THREE.Mesh(tg, gold));
    }
  }
  function setKeyX(x) { carr.position.x = x; const L = Math.max(0.05, POLE_X - x); armBar.scale.x = L; armBar.position.x = x + L / 2; }

  // --- efekty: jiskry, mince, bedna s výhrou
  const sparkN = 90, sparkPos = new Float32Array(sparkN * 3), sparkVel = new Float32Array(sparkN * 3), sparkLife = new Float32Array(sparkN);
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.16, color: 0xffe27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sparks.frustumCulled = false; cab.add(sparks);
  for (let i = 0; i < sparkN; i++) sparkPos[i * 3 + 1] = -999;
  function burst(x, y, z, color = 0xffe27a) {
    sparks.material.color.setHex(color);
    for (let i = 0; i < sparkN; i++) {
      const a = Math.random() * 6.283, s = rnd(1.5, 6.0), e = rnd(-0.6, 0.9);
      sparkPos[i * 3] = x; sparkPos[i * 3 + 1] = y; sparkPos[i * 3 + 2] = z; sparkVel[i * 3] = Math.cos(a) * s; sparkVel[i * 3 + 1] = Math.sin(a) * s + e * 2; sparkVel[i * 3 + 2] = rnd(0.5, 3); sparkLife[i] = rnd(0.5, 1.1);
    }
  }
  const coinGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.06, 20); const coinMat = mat(0xffd34d, { metalness: 1, roughness: 0.28, envMapIntensity: 1.3 });
  const coins = [];
  function spawnCoins(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(coinGeo, coinMat); m.position.set(x + rnd(-0.3, 0.3), y + rnd(-0.2, 0.3), z + rnd(-0.2, 0.2)); m.rotation.set(rnd(0, 3), rnd(0, 3), 0); cab.add(m);
      coins.push({ m, vx: rnd(-2.0, 2.0), vy: rnd(1, 5), vz: rnd(0.8, 3.2), sx: rnd(-6, 6), sz: rnd(-6, 6), t: 0, wait: i * 0.035, bounces: 0 });
    }
  }
  const FLOOR_Y = -4.55;
  function updateCoins(dt) {
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i]; c.t += dt; if (c.t < c.wait) { c.m.visible = false; continue; } c.m.visible = true;
      c.vy -= 24 * dt; c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z = Math.min(2.6, c.m.position.z + c.vz * dt); c.m.rotation.x += c.sx * dt; c.m.rotation.z += c.sz * dt;
      if (Math.abs(c.m.position.x) > 4.2) { c.m.position.x = Math.sign(c.m.position.x) * 4.2; c.vx *= -0.5; }
      if (c.m.position.y < FLOOR_Y + 0.1) { c.m.position.y = FLOOR_Y + 0.1; if (c.bounces < 3 && Math.abs(c.vy) > 2) { c.vy *= -0.45; c.vx *= 0.7; c.vz *= 0.5; c.bounces++; if (Math.random() < 0.4) sfx.coin(); } else { c.vy = 0; c.vx = c.vz = 0; c.sx = c.sz = 0; } }
      if (c.t > 3.4) { c.m.scale.multiplyScalar(0.9); if (c.m.scale.x < 0.05) { cab.remove(c.m); coins.splice(i, 1); } }
    }
  }
  function makeGift(it, rare) {
    const g = new THREE.Group();
    addBox(g, 1.1, 1.1, 1.1, mat(rare ? 0xffc928 : 0x8e44ff, { metalness: rare ? 0.6 : 0.1, roughness: 0.35 }), 0, 0, 0);
    addBox(g, 1.14, 1.14, 0.2, mat(0xffffff, { roughness: 0.4 }), 0, 0, 0); addBox(g, 0.2, 1.14, 1.14, mat(0xffffff, { roughness: 0.4 }), 0, 0, 0);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(it[0]), transparent: true })); sp.scale.set(1.0, 1.0, 1); sp.position.set(0, 0, 0.7); g.add(sp);
    cab.add(g); return g;
  }

  // ---- zaměření dírky, rozsvícení ---------------------------------------------------------------------
  function setTarget(tier, idx) {
    cells[tier].forEach((c, i) => { c.fm.emissiveIntensity = i === idx ? 0.8 : 0; c.box.material[4].emissiveIntensity = 0; });
  }
  function setLit(tier, idx) {
    const c = cells[tier][idx]; c.fm.emissiveIntensity = 1.1; c.box.material[4].emissiveIntensity = 0.5; G.lit[tier] = idx;
  }
  function clearAll() { for (let t = 1; t <= 3; t++) { G.lit[t] = null; setTarget(t, -1); } }
  function setElev(y) { G.elevY = y; elev.position.y = y; }

  // ---- kamera: otáčení celého automatu tahem (stejně jako u automatu na plyšáky) ----------------------------
  const cam = { yaw: -0.5, tyaw: -0.5, pitch: 0.14, tpitch: 0.14, shake: 0, dist: 40 };
  const FRONT = { yaw: 0, pitch: 0.1 };
  function fit() {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const vf = (camera.fov * Math.PI) / 360;
    cam.dist = Math.max(10.3 / Math.tan(vf), 6.4 / (Math.tan(vf) * camera.aspect)) + 3.6;
  }
  fit(); new ResizeObserver(fit).observe(stage); window.addEventListener('resize', fit);
  (function setupCamera() {
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      cam.tyaw -= (e.clientX - drag.x) * 0.0085; cam.yaw = cam.tyaw;
      cam.tpitch = clamp(cam.tpitch + (e.clientY - drag.y) * 0.004, -0.1, 0.8); cam.pitch = cam.tpitch;
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    $('#rot-l').addEventListener('click', () => { cam.tyaw += Math.PI / 2; });
    $('#rot-r').addEventListener('click', () => { cam.tyaw -= Math.PI / 2; });
    $('#rot-c').addEventListener('click', () => { const k = Math.round((cam.tyaw - FRONT.yaw) / (2 * Math.PI)); cam.tyaw = FRONT.yaw + k * 2 * Math.PI; cam.tpitch = FRONT.pitch; });
  })();
  const tierEls = [null, 1, 2, 3].map((t) => {
    if (!t) return null; const d = document.createElement('div'); d.className = 'tb'; d.innerHTML = `<b>${t}</b><span>${TIER_ICON[t]}</span><small>${['', 'Coiny', 'Malá', 'Velká'][t]}</small>`; return d;
  });
  $('#tiers').append(...[3, 2, 1].map((t) => tierEls[t]));

  // ===================================================================================================
  // herní logika
  // ===================================================================================================
  const ui = {
    bal: $('#bal'), start: $('#btn-start'), stop: $('#btn-stop'), aim: $('#aim'), go: $('#btn-go'), bl: $('#btn-l'), br: $('#btn-r'), hint: $('#hint'),
    result: $('#result'), banner: $('#banner'), toast: $('#toast'),
  };
  let toastTimer = null;
  function toast(msg, ms = 2600) { ui.toast.textContent = msg; ui.toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { ui.toast.hidden = true; }, ms); }
  function banner(text, ok) { const b = ui.banner; const n = b.cloneNode(false); n.id = 'banner'; n.textContent = text; n.className = ok ? 'ok' : ''; b.replaceWith(n); ui.banner = n; n.hidden = false; }
  function setBalance(n) { G.balance = n; ui.bal.textContent = fmt(n); updateButtons(); }
  function applyServer(j) {
    if (!j) return;
    if (typeof j.price === 'number') CFG.price = j.price;
    if (Array.isArray(j.coins)) CFG.coins = j.coins; if (Array.isArray(j.weights)) CFG.weights = j.weights;
    if (Array.isArray(j.small)) CFG.small = j.small; if (Array.isArray(j.big)) CFG.big = j.big;
    if (Array.isArray(j.items)) G.parts = j.items;
    if (typeof j.balance === 'number') setBalance(j.balance);
    $('#price').textContent = fmt(CFG.price); $('#m-price').textContent = fmt(CFG.price);
    buildPrizes();
  }
  const HINTS = {
    aim: '◀ ▶ zamiř klíč na svítící sloupec dírek (zelená kontrolka = sedí), pak stiskni Vyjet',
    rise: 'Klíč jede až nahoru. STOP ho zastaví: trefíš dírku v patře, kde ho zastavíš (výš = lepší odměna)',
  };
  function updateButtons() {
    const idle = G.ready && !G.busy && (G.phase === 'idle' || G.phase === 'over');
    ui.start.hidden = !(G.phase === 'idle' || G.phase === 'over' || G.phase === 'boot' || G.phase === 'claiming' || G.phase === 'reveal');
    ui.start.disabled = !idle || G.balance < CFG.price;
    ui.aim.hidden = G.phase !== 'aim';
    ui.stop.hidden = !(G.phase === 'rise' || G.phase === 'push');
    const playing = G.phase === 'aim' || G.phase === 'rise' || G.phase === 'push';
    for (let t = 1; t <= 3; t++) { const el = tierEls[t]; el.classList.toggle('on', playing); el.classList.toggle('done', G.lit[t] != null); }
    ui.hint.textContent = HINTS[G.phase] || (playing || G.phase === 'claiming' ? '' : 'Přetažením prstem / myší otáčíš automat');
  }

  // --- panely s odměnami (okno s pravidly + boční panely na širokém displeji)
  function chip(i) {
    const it = ITEMS[i]; const d = document.createElement('div'); d.className = 'pc' + (i >= 13 ? ' rare' : ''); d.textContent = it[0]; d.title = `${it[1]} · ${fmt(it[2])} coinů · potřeba dílů: ${it[3]}`;
    const n = G.parts[i] | 0; if (n > 0) { const b = document.createElement('i'); b.className = 'pn'; b.textContent = it[3] > 1 ? `${Math.min(n, 99)}/${it[3]}` : '✓'; d.append(b); }
    return d;
  }
  function section(title, kids, cls = 'pgrid') {
    const f = document.createDocumentFragment(); const l = document.createElement('div'); l.className = 'plabel'; l.textContent = title; const g = document.createElement('div'); g.className = cls; g.append(...kids); f.append(l, g); return f;
  }
  function coinsBlock() {
    const total = CFG.weights.reduce((a, b) => a + b, 0);
    return CFG.coins.map((a, i) => { const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = fmt(a); d.append(b, '≈ ' + (CFG.weights[i] / total * 100).toFixed(1).replace('.', ',') + ' %'); return d; });
  }
  function buildPrizes() {
    $('#chance-list').replaceChildren(...coinsBlock());
    $('#m-items').replaceChildren(section('Malé odměny (2. patro)', CFG.small.map(chip)), section('Velké odměny (3. patro)', CFG.big.map(chip)));
    $('#side-l').replaceChildren(section('1. patro: coiny', coinsBlock(), 'chances c2'), section('2. patro: malé odměny', CFG.small.map(chip)));
    $('#side-r').replaceChildren(section('3. patro: velké odměny', CFG.big.map(chip)), (() => { const p = document.createElement('p'); p.className = 'muted small'; p.textContent = 'Díly se sbírají, hotovou věc prodáš v Obchodu na hlavní stránce.'; return p; })());
  }

  // --- začátek patra: klíč čeká dole, hráč ho vodorovně zamíří a pak vyjede nahoru
  function beginPlay() {
    G.tier = 1; G.target = Math.floor(Math.random() * SOCK_X.length);   // svítící dírka je ve všech třech patrech nad sebou (jeden sloupec)
    clearAll();
    for (let t = 1; t <= 3; t++) setTarget(t, G.target);
    G.aimX = 0;
    G.moveT = 0; G.prevX = null; G.prevY = null; carLamp.material.color.setHex(0xffb02e);
    G.phase = 'aim'; updateButtons();
  }
  async function startPlay() {
    if (G.busy || !(G.phase === 'idle' || G.phase === 'over') || G.balance < CFG.price) return;
    G.busy = true; updateButtons(); ui.result.hidden = true;
    const r = await api('start');
    G.busy = false;
    if (!r.ok) { toast(r.json.error || 'Nepodařilo se spustit hru.'); if (r.status === 402) setBalance(r.json.balance != null ? r.json.balance : G.balance); updateButtons(); return; }
    G.playId = r.json.playId; applyServer(r.json); sfx.start();
    G.phase = 'idle'; resetScene(false); G.aimX = 0; G.keyX = 0; beginPlay();
  }
  function resetScene(animate) {
    clearAll(); K.position.z = KZ; setTarget(1, 1);
    if (!animate) { setElev(baseY(1)); return Promise.resolve(); }
    const y0 = G.elevY; return tween(900, (k) => setElev(lerp(y0, baseY(1), k)), easeIO);
  }
  function pressButton() { ui.stop.classList.add('down'); setTimeout(() => ui.stop.classList.remove('down'), 140); }

  /** Stisk „Vyjet“: rameno s klíčem začne jet nahoru. */
  function goUpNow() {
    if (G.phase !== 'aim') return;
    G.phase = 'rise'; G.riseStart = performance.now(); G.prevY = null; G.keyX = G.aimX; held.l = held.r = false;
    carLamp.material.color.setHex(0xff5a3c); sfx.press(); sfx.lift(); updateButtons();
  }
  function stopNow(ts, trust) {
    if (G.phase !== 'rise') return;
    const now = performance.now();
    if (now - G.riseStart < ARM_MS) return;
    let t = Number(ts); if (!(t > 0) || (!trust && Math.abs(t - now) > 250) || t > now) t = now; t = Math.max(t, G.riseStart);
    const x = G.aimX, y = keyYAt((t - G.riseStart) / 1000), tier = tierAt(y), tx = SOCK_X[G.target], ty = TIER_Y[tier]; G.tier = tier;
    const off = Math.max(Math.abs(x - tx), Math.abs(y - ty)), hit = off <= TOL[tier], q = hit ? clamp(1 - off / TOL[tier], 0, 1) : 0;   // q = přesnost zásahu (1 = střed dírky)
    G.phase = 'push'; G.keyX = x; G.keyY = y; setElev(y); updateButtons(); sfx.press(); pressButton();
    runPush(tier, x, y, tx, ty, hit, q);
  }
  async function runPush(tier, x, y, tx, ty, hit, q) {
    const stagePromise = api('stage', { playId: G.playId, tier, hit, q: Math.round(q * 100) / 100 });
    let r, slip = false;
    if (hit) {
      await tween(150, (k) => { G.keyX = lerp(x, tx, k); G.aimX = G.keyX; setElev(lerp(y, ty, k)); }, easeOut);
      await tween(300, (k) => { K.position.z = KZ - PUSH * 0.55 * k; }, easeIO);                  // špička jede do dírky
      r = await stagePromise;
      slip = !!(r.ok && r.json.slip);
      if (slip) {                                                                                // server: klíč se zasekl o hranu (rigování)
        sfx.fail(); cam.shake = 0.3; burst(tx, ty, HOOP_Z + 0.1, 0xff9a5a); banner('TĚSNĚ MIMO!', false); carLamp.material.color.setHex(0xff2020);
        const z0 = K.position.z;
        await tween(260, (k) => { K.position.z = z0 + 0.12 * Math.sin(k * Math.PI * 5) * (1 - k); G.keyX = tx + 0.05 * Math.sin(k * Math.PI * 7) * (1 - k); }, (k) => k);
        await tween(320, (k) => { K.position.z = lerp(z0, KZ, easeOut(k)); G.keyX = tx; });
      } else if (r.ok) {
        await tween(260, (k) => { K.position.z = KZ - PUSH * (0.55 + 0.45 * k); }, easeIO);
        sfx.lock(); setLit(tier, G.target); burst(tx, ty, HOOP_Z - 0.4, 0x7dffb0); cam.shake = 0.12; banner('TREFA!', true); carLamp.material.color.setHex(0x3cff8a);
      }
    } else {
      await tween(300, (k) => { K.position.z = KZ - MISS_PUSH * Math.sin(k * Math.PI * 0.5); }, easeOut);
      sfx.fail(); cam.shake = 0.45; burst(x, y, HOOP_Z + 0.1, 0xff6a5a); banner('MIMO!', false); carLamp.material.color.setHex(0xff2020);
      await tween(380, (k) => { K.position.z = KZ - MISS_PUSH + MISS_PUSH * k; }, easeOut);
      r = await stagePromise;
    }
    if (!r.ok) { // server hru nepotvrdil (starý pokus, příliš rychle…): konec pokusu
      toast(r.json.error || 'Hra se nepodařila potvrdit.'); await endToIdle(); return;
    }
    applyServer(r.json);
    if (!hit || r.json.lost) { await sleep(500); return showResult({ lost: true, tier, slip }); }
    await sleep(450); return claim();   // žádné potvrzování patra: trefa se rovnou vyplatí
  }
  async function claim() {
    G.phase = 'claiming'; updateButtons();
    const r = await api('claim', { playId: G.playId });
    if (!r.ok) { toast(r.json.error || 'Odměnu se nepodařilo vybrat.'); await endToIdle(); return; }
    applyServer(r.json); showResult({ won: r.json.won, refilled: r.json.refilled });
  }
  async function endToIdle() {
    api('end', { playId: G.playId }).then((r) => { if (r.ok) applyServer(r.json); });
    G.phase = 'idle'; updateButtons(); await resetScene(true); startAttract();
  }

  let giftBox = null, giftOut = null;
  async function showResult(o) {
    G.phase = 'reveal'; updateButtons(); const card = ui.result; const ico = $('#rs-ico'), tt = $('#rs-title'), tx = $('#rs-text');
    if (o.lost) {
      cam.shake = 0.2;
      ico.textContent = '💔'; tt.textContent = o.slip ? 'Těsně mimo' : 'Netrefil ses'; tx.textContent = (o.slip ? 'Klíč se zasekl o hranu dírky' : 'Klíč nezapadl do svítící dírky') + '. Zkus to znovu!';
    } else {
      const w = o.won, lit = G.lit[w.level]; const lx = lit != null ? SOCK_X[lit] : 0, ly = TIER_Y[w.level];
      sfx.win(); burst(lx, ly, HOOP_Z - 0.4, 0xffe27a);
      if (w.type === 'coin') {
        spawnCoins(lx, ly - 0.4, HOOP_Z, clamp(Math.round(10 + w.amount / 40), 12, 60)); ico.textContent = '🪙'; tt.textContent = `+${fmt(w.amount)} coinů`;
        tx.textContent = o.refilled ? `Zůstatek ${fmt(G.balance)} coinů (kredit se doplnil).` : `Zůstatek ${fmt(G.balance)} coinů.`;
        await sleep(1400);
      } else {
        const it = ITEMS[w.item]; const rare = w.item >= 13; giftBox = makeGift(it, rare); giftBox.position.set(lx, ly - 0.1, HOOP_Z - 0.6);
        await tween(500, (k) => { giftBox.scale.setScalar(0.2 + 0.8 * easeOut(k)); }, easeOut);
        const y0 = giftBox.position.y, z0 = giftBox.position.z; await tween(950, (k) => { giftBox.position.y = lerp(y0, FLOOR_Y + 0.6, k * k); giftBox.position.z = lerp(z0, 1.0, k); giftBox.rotation.y = k * 3; });
        await tween(380, (k) => { giftBox.position.y = FLOOR_Y + 0.6 - 1.6 * k; giftBox.scale.setScalar(1 - 0.5 * k); }, easeIO); sfx.coin();
        cab.remove(giftBox); giftBox = null;
        flapPivot.rotation.x = 0; await tween(300, (k) => { flapPivot.rotation.x = -1.1 * k; }, easeOut);
        giftOut = makeGift(it, rare); giftOut.position.set(0.1, -8.3, CD / 2 + 0.9); giftOut.scale.setScalar(0.2);
        await tween(550, (k) => { giftOut.scale.setScalar(0.2 + 0.5 * easeOut(k)); giftOut.position.y = -8.3 + 0.3 * k; giftOut.rotation.y = k * 0.5; }, easeOut);
        ico.textContent = it[0]; tt.textContent = it[1];
        const have = w.parts | 0, need = w.need | 0;
        tx.textContent = need > 1 ? `Máš ${have} z ${need} dílů. Až jich bude dost, prodáš hotovou věc (${fmt(it[2])} coinů) v Obchodu.` : `Hotová věc za ${fmt(it[2])} coinů. Prodej ji v Obchodu na hlavní stránce.`;
        if (rare) tt.textContent = '✨ ' + it[1] + ' ✨';
      }
    }
    G.phase = 'over'; updateButtons();
    $('#rs-again').disabled = G.balance < CFG.price; $('#rs-again').textContent = `Hrát znovu (${fmt(CFG.price)})`;
    card.hidden = false;
    setTimeout(() => { if (giftOut) { cab.remove(giftOut); giftOut = null; } flapPivot.rotation.x = 0; }, 4000);
    await resetScene(true); if (G.phase === 'over') startAttract();
  }
  function startAttract() { G.attractT0 = performance.now(); setTarget(1, 1); }
  function closeResult() { ui.result.hidden = true; }

  // ---- hlavní smyčka ------------------------------------------------------------------------------------
  const camTarget = new THREE.Vector3(0, -0.6, 0);
  let last = performance.now(), ledT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; ledT += dt;
    tickTweens(now);
    if (G.phase === 'aim') {          // hráč drží ◀ / ▶: klíč se plynule rozjíždí
      const dir = (held.r ? 1 : 0) - (held.l ? 1 : 0);
      if (dir) { G.moveT += dt; G.aimX = clamp(G.aimX + dir * lerp(1.0, 4.4, clamp(G.moveT / 0.45, 0, 1)) * dt, -AIM_MAX, AIM_MAX); } else G.moveT = 0;
      G.keyX = G.aimX;
    } else if (G.phase === 'rise') { G.keyX = G.aimX; G.keyY = keyYAt((now - G.riseStart) / 1000); setElev(G.keyY); if ((now - G.riseStart) / 1000 >= RISE_T) stopNow(now); }
    else if (G.phase === 'idle' || G.phase === 'over' || G.phase === 'boot') G.keyX = sweepX((now - G.attractT0) / 1000, 1.6, 0);
    setKeyX(G.keyX);
    const aligned = G.phase === 'aim' && Math.abs(G.keyX - SOCK_X[G.target]) <= TOL[3];   // klíč je vodorovně přesně nad dírkou (platí pro všechna patra)
    if (G.phase === 'aim') carLamp.material.color.setHex(aligned ? 0x3cff8a : 0xffb02e);
    if (G.phase === 'aim' && G.prevX != null) for (const sx of SOCK_X) if ((G.prevX - sx) * (G.keyX - sx) < 0) sfx.tick();
    G.prevX = G.keyX;
    if (G.phase === 'rise') { if (G.prevY != null) for (let k = 1; k <= 3; k++) { const ty = TIER_Y[k]; if ((G.prevY - ty) * (G.keyY - ty) < 0) sfx.tick(); } G.prevY = G.keyY; if (now - G.riseStart >= ARM_MS) carLamp.material.color.setHex(0x3cff8a); }
    // záře svítící dírky
    const pulse = 0.55 + 0.45 * Math.sin(now / 240);
    for (let t = 1; t <= 3; t++) cells[t].forEach((c, i) => {
      const open = (G.phase === 'aim' || G.phase === 'rise' || G.phase === 'push') && i === G.target; const attract = (G.phase === 'idle' || G.phase === 'over' || G.phase === 'boot') && t === 1 && i === 1;
      const lit = G.lit[t] === i;
      c.glow.material.opacity = lit ? 0.9 : (open || attract) ? pulse : 0;
      if ((open || attract) && !lit) c.fm.emissiveIntensity = (aligned && open ? 0.9 : 0.35) + 0.55 * pulse;
    });
    leds.forEach((m, i) => m.material.color.setHSL(((ledT * 0.25 + i * 0.12) % 1), 0.9, 0.58));
    knob.position.x = 1.8 + (G.phase === 'aim' ? clamp(((held.r ? 1 : 0) - (held.l ? 1 : 0)) * 0.22, -0.22, 0.22) : 0);
    for (let i = 0; i < sparkN; i++) {
      if (sparkLife[i] > 0) { sparkLife[i] -= dt; sparkVel[i * 3 + 1] -= 9 * dt; sparkPos[i * 3] += sparkVel[i * 3] * dt; sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt; sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt; if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = -999; }
    }
    sparkGeo.attributes.position.needsUpdate = true;
    updateCoins(dt);
    // kamera: plynulé otáčení kolem automatu
    cam.yaw = lerp(cam.yaw, cam.tyaw, Math.min(1, dt * 7)); cam.pitch = lerp(cam.pitch, cam.tpitch, Math.min(1, dt * 7)); cam.shake *= 0.9;
    const sh = cam.shake, cp = Math.cos(cam.pitch);
    camera.position.set(camTarget.x + Math.sin(cam.yaw) * cp * cam.dist + (Math.random() - 0.5) * sh, camTarget.y + Math.sin(cam.pitch) * cam.dist + (Math.random() - 0.5) * sh, camTarget.z + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(camTarget);
    renderer.render(scene, camera);
  }

  // ---- ovládání -------------------------------------------------------------------------------------------
  const tsOf = (e) => (e && e.timeStamp) || performance.now();
  ui.stop.addEventListener('pointerdown', (e) => { e.preventDefault(); stopNow(tsOf(e)); });
  ui.stop.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });
  ui.go.addEventListener('pointerdown', (e) => { e.preventDefault(); goUpNow(); });
  ui.go.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });
  for (const [el, k] of [[ui.bl, 'l'], [ui.br, 'r']]) {   // držení ◀ / ▶ posouvá klíč
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); held[k] = true; try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => { held[k] = false; });
  }
  window.addEventListener('blur', () => { held.l = held.r = false; });
  window.addEventListener('keydown', (e) => {
    if (!$('#modal').hidden || e.repeat) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { if (G.phase === 'aim') { held.l = true; e.preventDefault(); } else if (e.code === 'ArrowLeft') cam.tyaw += 0.25; }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { if (G.phase === 'aim') { held.r = true; e.preventDefault(); } else if (e.code === 'ArrowRight') cam.tyaw -= 0.25; }
    else if (e.code === 'KeyQ') cam.tyaw += 0.25; else if (e.code === 'KeyE') cam.tyaw -= 0.25;
    if (e.code === 'Space' || e.key === 'Enter') {
      if (G.phase === 'aim') { e.preventDefault(); goUpNow(); }
      else if (G.phase === 'rise') { e.preventDefault(); stopNow(tsOf(e)); }
      else if ((G.phase === 'idle' || G.phase === 'over') && ui.result.hidden && !ui.start.disabled && e.code === 'Space') { e.preventDefault(); startPlay(); }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') held.l = false; else if (e.code === 'ArrowRight' || e.code === 'KeyD') held.r = false;
  });
  ui.start.onclick = () => startPlay();
  $('#rs-ok').onclick = closeResult;
  $('#rs-again').onclick = () => { closeResult(); startPlay(); };
  $('#btn-snd').onclick = () => { soundOn = !soundOn; store.set('keymaster_sound', soundOn ? '1' : '0'); $('#btn-snd').textContent = soundOn ? '🔊' : '🔇'; };
  $('#btn-snd').textContent = soundOn ? '🔊' : '🔇';

  // ---- start --------------------------------------------------------------------------------------------
  clearAll(); setElev(baseY(1)); startAttract(); buildPrizes(); setTarget(1, 1); updateButtons();
  requestAnimationFrame(frame);
  (async () => {
    const r = await api('state', { fresh: true });
    if (!r.ok) { toast(r.json.error || 'Server neodpovídá, zkus to za chvilku.', 5000); }
    else { applyServer(r.json); if (r.json.refilled) toast('Kredit se doplnil.'); }
    G.ready = true; G.phase = 'idle'; updateButtons();
  })();

  // ladicí rozhraní pro automatické testy
  window.__km = {
    st: () => { const rising = G.phase === 'rise'; const ky = rising ? keyYAt((performance.now() - G.riseStart) / 1000) : G.keyY; return { phase: G.phase, tier: tierAt(ky), keyX: G.keyX, aimX: G.aimX, keyY: ky, targetX: SOCK_X[G.target], tierY: TIER_Y.slice(), tol: TOL.slice(), riseT: RISE_T, playId: G.playId, balance: G.balance, armed: performance.now() - G.riseStart >= ARM_MS, lit: G.lit.slice() }; },
    aim: (x) => { G.aimX = clamp(x, -AIM_MAX, AIM_MAX); }, go: goUpNow, stop: () => stopNow(performance.now()), stopAt: (ts) => stopNow(ts, true), riseStart: () => G.riseStart,
    SPEED, TOL, SOCK_X, TIER_Y, keyYAt, cam, view: (yaw, pitch) => { cam.tyaw = cam.yaw = yaw; cam.tpitch = cam.pitch = pitch; },
  };
})();
