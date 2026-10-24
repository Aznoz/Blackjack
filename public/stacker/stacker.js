/* Stacker – věžička z kostek (jako herní automat). Hra běží v prohlížeči, server (/api/stacker/*) hlídá
 * zůstatek, cenu pokusu a losuje odměny. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (n) => Number(n || 0).toLocaleString('cs-CZ');
  const rng = () => (typeof window.__rng === 'function' ? window.__rng() : Math.random());

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
    if (window.STACKER_API_URL) return String(window.STACKER_API_URL).replace(/\/+$/, '');
    if (P.apiUrl) return String(P.apiUrl).replace(/\/+$/, '');
    const ws = window.BJ_WS_URL || window.AH_WS_URL;
    if (ws) { try { const u = new URL(ws); return (u.protocol === 'wss:' ? 'https://' : 'http://') + u.host; } catch (e) { /* ignore */ } }
    return location.origin;
  }
  const API = apiBase();
  async function api(action, body = {}) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 75000);
    try {
      const res = await fetch(`${API}/api/stacker/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ token: getToken(), session: getSession(), ...body }),
      });
      let json = null; try { json = await res.json(); } catch (e) { /* ignore */ }
      return { ok: res.ok, status: res.status, json: json || {} };
    } catch (e) { return { ok: false, status: 0, json: { error: 'Server neodpovídá.' } }; } finally { clearTimeout(timer); }
  }

  // ---- zvuk ---------------------------------------------------------------------------------------
  let soundOn = store.get('stacker_sound') !== '0';
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
    step() { tone(1100, 0.025, 'square', 0.012); },
    stop(row) { tone(300 + row * 40, 0.12, 'square', 0.09, -60); },
    lose() { tone(260, 0.5, 'sawtooth', 0.1, -200); tone(120, 0.6, 'square', 0.08, -60, 0.1); },
    level() { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.14, 'triangle', 0.1, 0, i * 0.07)); },
    tick(i) { tone(900 + (i % 6) * 60, 0.05, 'square', 0.05); },
    win() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 0, i * 0.09)); },
  };

  // ---- konfigurace hry (server ji při načtení potvrdí) --------------------------------------------
  const CFG = { price: 200, cols: 9, rows: 16, levels: { 1: 6, 2: 10, 3: 16 }, coins: [100, 200, 500, 750, 1000, 2000], small: 9, big: 10 };
  const CAPS = [4, 3, 2, 1];                        // nejvyšší šířka kostek v řadě 1, 2, 3, 4+
  const capOf = (row) => CAPS[Math.min(row, CAPS.length - 1)];
  const WEIGHTS = [50, 40, 30, 20, 10, 5];          // šance coinových odměn (losuje server)
  // rychlost: ms na jeden krok kostky, s každou řadou rychleji
  const intervalOf = (row) => Math.max(26, Math.round(120 * Math.pow(0.9, row)));
  // věcné odměny: stejné pořadí jako na serveru (malé = indexy 0–8, velké = 9–18, posledních 6 je vzácných)
  const ITEMS = [
    ['🍫', 'Čokoláda', 500, 1], ['🪁', 'Drak na létání', 1000, 2], ['🎲', 'Hra do party', 2000, 2], ['🔦', 'Svítilna', 3000, 2], ['🧢', 'Kšiltovka', 5000, 3],
    ['🧸', 'Plyšový medvěd', 10000, 3], ['🎧', 'Sluchátka', 20000, 3], ['🎮', 'Herní ovladač', 30000, 3], ['⌚', 'Chytré hodinky', 40000, 4],
    ['🛴', 'Koloběžka', 50000, 4], ['📷', 'Fotoaparát', 60000, 5], ['📱', 'Telefon', 75000, 5], ['💻', 'Notebook', 100000, 6],
    ['🏆', 'Zlatý pohár', 10000, 1], ['💍', 'Diamantový prsten', 30000, 1], ['👑', 'Koruna', 50000, 1], ['🏎️', 'Sporťák', 75000, 1], ['⛵', 'Plachetnice', 100000, 1], ['🏝️', 'Soukromý ostrov', 300000, 1],
  ];
  const POOL = { small: [0, 1, 2, 3, 4, 5, 6, 7, 8], big: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18] };

  const G = {
    parts: [],
    phase: 'idle', ready: false, busy: false, balance: 0, playId: null,
    row: 0, placed: [], cur: { x: 0, w: 4, dir: 1 }, acc: 0, falling: [], flash: 0, flashColor: '#fff', shake: 0, pending: null, spinning: false, t: 0,
  };
  const L = { cs: 24, dpr: 1 };

  // ---- panely odměn --------------------------------------------------------------------------------
  const cells = { small: [], big: [], coins: [] };
  function buildPanels() {
    const mk = (cls, text) => { const d = document.createElement('div'); d.className = cls; if (text != null) d.textContent = text; return d; };
    const sg = $('#small-grid'), bg = $('#big-grid'); sg.replaceChildren(); bg.replaceChildren();
    const prize = (i) => {
      const it = ITEMS[i], d = mk('pc' + (i >= 13 ? ' rare' : ''), it[0]); d.title = `${it[1]} · ${fmt(it[2])} coinů · potřeba dílů: ${it[3]}`;
      const n = G.parts[i] | 0; if (n > 0) { const b = document.createElement('i'); b.className = 'pn'; b.textContent = it[3] > 1 ? `${Math.min(n, 99)}/${it[3]}` : '✓'; d.append(b); }
      return d;
    };
    cells.small = POOL.small.slice(0, CFG.small).map((i) => { const d = prize(i); sg.append(d); return d; });
    cells.big = POOL.big.slice(0, CFG.big - 1).map((i) => { const d = prize(i); bg.append(d); return d; });
    const cl = $('#coins-l'), cr = $('#coins-r'); cl.replaceChildren(); cr.replaceChildren();
    cells.coins = CFG.coins.map((a, i) => {
      const d = mk('cc'); const c = document.createElement('span'); c.className = 'coin'; d.append(c, fmt(a));
      (i < 3 ? cl : cr).append(d); return d;
    });
    const ch = $('#chance-list'); ch.replaceChildren();
    const total = WEIGHTS.reduce((a, b) => a + b, 0);
    CFG.coins.forEach((a, i) => { const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = fmt(a); d.append(b, '≈ ' + (WEIGHTS[i] / total * 100).toFixed(1).replace('.', ',') + ' %'); ch.append(d); });
  }
  const showRewards = (on) => $('#cab').classList.toggle('rewards-on', on);
  const island = () => $('#island');
  function clearHl() { for (const c of [...cells.small, ...cells.big, ...cells.coins, island()]) c.classList.remove('hl', 'win'); island().hidden = true; island().classList.remove('up'); }

  // ---- rozložení --------------------------------------------------------------------------------------
  function layout() {
    const st = $('#stage'); const vv = window.visualViewport; const vw = Math.min(window.innerWidth || 9999, document.documentElement.clientWidth || 9999, vv ? vv.width : 9999);
    const W = Math.min(st.clientWidth, vw) - 16, H = st.clientHeight - 16, gap = 10;
    const cab = $('#cab'), f = $('#field'), cv = $('#cv');
    const col = W < 560 && H > W * 1.2; // mobil na výšku: panely s odměnami pod polem
    cab.classList.toggle('col', col);
    let cs, fw, sw;
    if (col) { // mobil na výšku: hra přes celou obrazovku, panely s odměnami se ukážou jen při losování
      const cell = clamp(Math.floor(((W - gap) / 2 - 24) / 3), 20, 34);
      sw = Math.floor((W - gap) / 2); document.documentElement.style.setProperty('--cell', cell + 'px');
      cs = Math.max(10, Math.floor(Math.min((H - 8) / CFG.rows, (W - 8) / CFG.cols)));
      fw = cs * CFG.cols;
    } else {
      const minSide = 110;
      cs = Math.floor(H / CFG.rows); fw = cs * CFG.cols;
      if (W - fw - 2 * gap < 2 * minSide) { fw = W - 2 * gap - 2 * minSide; cs = Math.floor(fw / CFG.cols); fw = cs * CFG.cols; }
      cs = Math.max(10, cs);
      // panely s odměnami: co nejvíc přes volné místo na stránce, ale ne vyšší než herní pole
      const fh0 = cs * CFG.rows, cellMax = Math.floor((fh0 - 110) / 4.1);
      sw = Math.max(minSide, Math.min(Math.floor((W - fw - 2 * gap) / 2), 3 * cellMax + 30));
      for (const s of ['#side-l', '#side-r']) $(s).style.width = sw + 'px';
      document.documentElement.style.setProperty('--cell', Math.floor((sw - 30) / 3) + 'px');
    }
    L.cs = cs; L.dpr = Math.min(2, window.devicePixelRatio || 1); BG = null; SPR = {};
    const fh = cs * CFG.rows; f.style.width = fw + 6 + 'px'; f.style.height = fh + 6 + 'px';
    cv.style.width = fw + 'px'; cv.style.height = fh + 'px'; cv.width = Math.round(fw * L.dpr); cv.height = Math.round(fh * L.dpr);
  }

  // ---- hra ---------------------------------------------------------------------------------------------
  function resetBoard() { G.row = 0; G.placed = []; G.falling = []; G.acc = 0; newBlock(); }
  function newBlock() {
    const w = G.row === 0 ? capOf(0) : Math.min(G.placed[G.row - 1].w, capOf(G.row));
    const left = rng() < 0.5;
    G.cur = { w, x: left ? 0 : CFG.cols - w, dir: left ? 1 : -1 };
  }
  function stepBlock() {
    const c = G.cur; let nx = c.x + c.dir;
    if (nx < 0 || nx + c.w > CFG.cols) { c.dir = -c.dir; nx = c.x + c.dir; }
    c.x = nx; sfx.step();
  }
  function spawnFall(cs, row, x0, w0) { // kostky, které odpadly
    for (const c of cs) G.falling.push({ c, r: row, y: 0, vy: -2 + rng() * 2, vx: (rng() - 0.5) * 3, rot: 0, vr: (rng() - 0.5) * 6, life: 1.4 });
  }
  const locked = () => performance.now() < (G.uiLock || 0); // ochrana: „duchový“ klik po stisku STOP nesmí trefit tlačítko, které se objeví pod prstem
  function stopPressed() {
    if (G.phase !== 'run') return;
    G.uiLock = performance.now() + 650;
    const r = G.row, cur = G.cur; let x = cur.x, w = cur.w; const lost = [];
    if (r > 0) {
      const prev = G.placed[r - 1];
      const lo = Math.max(cur.x, prev.x), hi = Math.min(cur.x + cur.w, prev.x + prev.w);
      for (let c = cur.x; c < cur.x + cur.w; c++) if (c < lo || c >= hi) lost.push(c);
      if (hi - lo <= 0) { fail(lost); return; }
      x = lo; w = hi - lo;
    }
    spawnFall(lost, r);
    if (lost.length) G.shake = Math.max(G.shake, 0.35);
    G.placed.push({ x, w }); G.row++; sfx.stop(G.row);
    const lv = G.row === CFG.levels[3] ? 3 : G.row === CFG.levels[2] ? 2 : G.row === CFG.levels[1] ? 1 : 0;
    if (lv === 3) { G.flash = 1; G.flashColor = '#ffd84a'; claim(3); return; }
    if (lv) { G.phase = 'prompt'; G.flash = 1; G.flashColor = '#ffd84a'; sfx.level(); showPrompt(lv); refreshUi(); return; }
    G.acc = 0; newBlock();
  }
  const PW = [['end', '🏁', 'Konec'], ['heart', '❤️', 'Další pokus'], ['plus', '➕', '+1 patro'], ['fall', '⬇️', 'Pád']];
  function fail(lostCells) {
    G.phase = 'powerup'; spawnFall(lostCells, G.row); G.shake = 0.8; G.flash = 0.6; G.flashColor = '#ff2a55'; sfx.lose();
    refreshUi(); showPower();
  }
  async function showPower() {
    const box = $('#pw-cells'); box.replaceChildren();
    const cells = PW.map(([id, ico, name]) => { const d = document.createElement('div'); d.className = 'pw'; d.dataset.id = id; d.innerHTML = `<b>${ico}</b><span>${name}</span>`; box.append(d); return d; });
    $('#pw-text').textContent = 'Netrefil ses… zkus štěstí!'; $('#pw').hidden = false;
    const r = await api('power', { playId: G.playId, rows: G.row });
    const j = r.ok && r.json && r.json.power ? r.json : null;
    if (!j) { // server power-upy (ještě) nezná nebo hra už skončila: kolo se jen ukončí a kredit se doplní
      $('#pw').hidden = true;
      const e = await api('end', { playId: G.playId }); if (e.ok) applyState(e.json);
      endLost(r.status === 404 ? 'Server zatím nemá power-upy (nahraj novou verzi stacker.js na GitHub). Konec hry.' : 'Tentokrát se nepovedlo. Zkus to znovu.'); return;
    }
    const t = PW.findIndex((p) => p[0] === j.power);
    roulette(cells, [0, 1, 2, 3], t, () => {
      sfx.win(); $('#pw-text').textContent = { end: 'Konec hry.', heart: 'Máš další pokus!', plus: 'Věž poskočí o patro!', fall: 'Věž padá na nejbližší úroveň!' }[j.power];
      setTimeout(() => { $('#pw').hidden = true; applyPower(j); }, 1100);
    });
  }
  function endLost(text, title = 'Kostky vedle!') {
    G.phase = 'over'; showResult(title, text, false); refreshUi();
  }
  function startReward(j) { // rovnou na losování odměny dané úrovně
    G.flash = 1; G.flashColor = '#ffd84a'; G.pending = j; G.phase = 'spin'; showRewards(true); refreshUi(); spin(j.won);
  }
  function applyPower(j) {
    if (j.power === 'heart') {
      toast('❤️ Další pokus!', 1800); G.phase = 'run'; G.acc = 0; G.uiLock = performance.now() + 350; newBlock(); refreshUi(); return;
    }
    if (j.power === 'plus') {
      const prev = G.placed[G.row - 1]; G.placed.push(prev ? { x: prev.x, w: prev.w } : { x: 0, w: capOf(0) }); G.row++; sfx.stop(G.row);
      if (j.won) { startReward(j); return; }
      applyState(j); endLost('Věž poskočila o patro, ale na úroveň to nestačí. Konec hry.', '➕ +1 patro'); return;
    }
    if (j.power === 'fall') {
      if (j.won) {
        const cs = []; for (let r = j.row; r < G.placed.length; r++) for (let c = G.placed[r].x; c < G.placed[r].x + G.placed[r].w; c++) G.falling.push({ c, r, y: 0, vy: -1 + Math.random(), vx: (Math.random() - 0.5) * 2, rot: 0, vr: (Math.random() - 0.5) * 6, life: 1.2 });
        G.placed.length = j.row; G.row = j.row; G.shake = 0.7; startReward(j); return;
      }
      applyState(j); endLost('Věž spadla, ale není tu žádná úroveň, na kterou by dopadla. Konec hry.', '⬇️ Pád'); return;
    }
    applyState(j); endLost('Konec hry. Zkus to znovu.');
  }

  function showPrompt(lv) {
    $('#pr-title').textContent = `Úroveň ${lv} dosažena!`;
    $('#pr-text').textContent = lv === 1 ? 'Odměna: coiny (ruleta 100 – 2\u00a0000). Pokračuj o patro výš, nebo odměnu vezmi.' : 'Odměna: malá věcná odměna. Risknout velkou odměnu, nebo vzít tuhle?';
    $('#pr-go').textContent = `Pokračovat na úroveň ${lv + 1}`;
    $('#pr-take').textContent = lv === 1 ? 'Vybrat coiny' : 'Vybrat odměnu';
    $('#prompt').hidden = false; G.promptLevel = lv;
  }
  function showResult(title, text, good) {
    $('#rs-title').textContent = title; $('#rs-text').textContent = text; $('#result').hidden = false;
    $('#result').style.borderColor = good ? 'var(--gold)' : 'var(--line)';
  }

  function okResult() { $('#result').hidden = true; if (G.phase === 'done') clearHl(); showRewards(false); G.phase = 'idle'; G.placed = []; G.row = 0; refreshUi(); }

  async function startGame() {
    if (G.busy || !G.ready || (G.phase !== 'idle' && G.phase !== 'over' && G.phase !== 'done')) return;
    G.busy = true; refreshUi();
    const r = await api('start'); G.busy = false;
    if (!r.ok) { toast(r.json.error || 'Hru se nepodařilo spustit.'); if (r.json.balance != null) applyState(r.json); refreshUi(); return; }
    applyState(r.json); G.playId = r.json.playId;
    clearHl(); showRewards(false); $('#result').hidden = true; $('#prompt').hidden = true;
    try { if (document.documentElement.requestFullscreen && !document.fullscreenElement && $('#cab').classList.contains('col')) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (e) { /* ignore */ }
    resetBoard(); G.phase = 'run'; G.t = 0; refreshUi();
  }

  async function claim(level) {
    G.phase = 'claiming'; $('#prompt').hidden = true; refreshUi();
    const r = await api('claim', { playId: G.playId, level });
    if (!r.ok) { G.phase = 'over'; toast(r.json.error || 'Výhru se nepodařilo připsat.'); showResult('Něco se pokazilo', r.json.error || 'Výhru se nepodařilo připsat.', false); refreshUi(); return; }
    G.pending = r.json; G.phase = 'spin'; showRewards(true); refreshUi();
    spin(r.json.won);
  }

  // ---- ruleta: rychle, pak pomaleji, nakonec zůstane svítit vybrané políčko -------------------------------
  function spin(won) {
    clearHl();
    let list, order, target;
    if (won.type === 'coin') { list = cells.coins; order = [0, 3, 1, 4, 2, 5]; target = won.index; }  // střídavě vlevo a vpravo
    else if (won.type === 'small') { list = cells.small; order = list.map((_, i) => i); target = won.index; }
    else { island().hidden = false; list = cells.big.concat([island()]); order = list.map((_, i) => i); target = won.index; } // vzácný ostrov vyskočí uprostřed obrazovky jen při losování velké odměny
    roulette(list, order, target, () => finishSpin(won));
  }
  function roulette(list, order, target, done) {
    const pos = order.indexOf(target), n = order.length, total = n * 3 + pos;
    let i = 0, prev = null;
    const stepFn = () => {
      if (prev) prev.classList.remove('hl');
      const el = list[order[i % n]]; el.classList.add('hl'); prev = el; sfx.tick(i);
      if (i >= total) { el.classList.remove('hl'); el.classList.add('win'); done(); return; }
      const t = i / total; i++;
      setTimeout(stepFn, 55 + 380 * t * t * t);
    };
    stepFn();
  }
  function finishSpin(won) {
    if (won.type === 'big') island().classList.add('up');
    sfx.win(); G.flash = 1; G.flashColor = '#ffd84a';
    if (G.pending) { applyState(G.pending); G.pending = null; }
    G.phase = 'done';
    if (won.type === 'coin') showResult(`Vyhrál jsi ${fmt(won.amount)} coinů!`, `Úroveň 1 · připsáno ${fmt(won.amount)}`, true);
    else {
      const it = ITEMS[won.item] || ['🎁', 'Odměna', 0, 1], rare = won.item >= 13;
      const left = won.need > 1 ? `Máš ${won.parts} z ${won.need} dílů – hotovou věc prodáš v Obchodu.` : `Prodej v Obchodu za ${fmt(it[2])} coinů.`;
      showResult(`${it[0]} ${rare ? 'Vzácná výhra: ' : 'Získal jsi díl: '}${it[1]}`, `Úroveň ${won.level} · ${left}`, true);
    }
    refreshUi();
  }

  // ---- UI ---------------------------------------------------------------------------------------------
  let toastT = 0;
  function toast(msg, ms = 2800) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }
  function applyState(j) {
    if (typeof j.balance === 'number') { G.balance = j.balance; }
    if (j.coins) { CFG.coins = j.coins; }
    if (j.price) CFG.price = j.price;
    if (Array.isArray(j.items)) { const ch = j.items.join() !== G.parts.join(); G.parts = j.items; if (ch && G.phase !== 'spin') { buildPanels(); } }
    if (j.refilled) toast(`Zůstatek byl doplněn na ${j.floor || 200}.`, 3600);
    refreshUi();
  }
  function refreshUi() {
    $('#bal').textContent = fmt(G.balance);
    const run = G.phase === 'run';
    $('#btn-stop').hidden = !run; $('#btn-start').hidden = run || G.phase === 'prompt' || G.phase === 'claiming' || G.phase === 'spin' || G.phase === 'powerup';
    $('#btn-start').disabled = G.busy || !G.ready || G.balance < CFG.price;
    $('#btn-start').firstChild.textContent = (G.phase === 'over' || G.phase === 'done') ? 'Hrát znovu ' : 'Hrát ';
  }

  // ---- kreslení ---------------------------------------------------------------------------------------
  const mainCtx = $('#cv').getContext('2d'); let ctx = mainCtx;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  let BG = null, SPR = {}; // předrenderované pozadí a kostky (rychlé na mobilu)
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function cellRect(c, r) { const cs = L.cs, g = Math.max(1.5, cs * 0.07); return [c * cs + g, (CFG.rows - 1 - r) * cs + g, cs - 2 * g, cs - 2 * g, cs * 0.2]; }
  const LV_ROW = () => ({ [CFG.levels[1] - 1]: 1, [CFG.levels[2] - 1]: 2, [CFG.levels[3] - 1]: 3 });
  function paintBlock(x, y, w, h, rad, kind) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (kind === 'move') { g.addColorStop(0, '#fff2f8'); g.addColorStop(0.35, '#ff8fbd'); g.addColorStop(1, '#ff2d7d'); ctx.shadowColor = 'rgba(255,120,190,.95)'; ctx.shadowBlur = L.cs * 0.7; }
    else { g.addColorStop(0, '#ff7fb2'); g.addColorStop(0.5, '#ee1d6a'); g.addColorStop(1, '#a30040'); ctx.shadowColor = 'rgba(255,40,120,.75)'; ctx.shadowBlur = L.cs * 0.35; }
    ctx.fillStyle = g; rr(x, y, w, h, rad); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(x + w * 0.12, y + h * 0.1, w * 0.76, h * 0.22, rad * 0.6); ctx.fill();
  }
  function sprite(kind) {
    if (SPR[kind]) return SPR[kind];
    const [, , w, h, rad] = cellRect(0, 0), pad = Math.ceil(L.cs * 0.8), d = L.dpr;
    const cv = mk((w + 2 * pad) * d, (h + 2 * pad) * d), sc = cv.getContext('2d'), keep = ctx;
    ctx = sc; ctx.setTransform(d, 0, 0, d, 0, 0); paintBlock(pad, pad, w, h, rad, kind); ctx = keep;
    return (SPR[kind] = { cv, pad, w: cv.width / d, h: cv.height / d });
  }
  function drawOn(c, r, kind, alpha = 1) {
    const [x, y] = cellRect(c, r), sp = sprite(kind);
    ctx.globalAlpha = alpha; ctx.drawImage(sp.cv, x - sp.pad, y - sp.pad, sp.w, sp.h); ctx.globalAlpha = 1;
  }
  function paintStatic(W, H, cs) {
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2a0630'); bg.addColorStop(1, '#10021a');
    ctx.fillStyle = bg; ctx.fillRect(-4, -4, W + 8, H + 8);
    const lvr = LV_ROW();
    for (let r = 0; r < CFG.rows; r++) {
      const lv = lvr[r] || 0;
      for (let c = 0; c < CFG.cols; c++) {
        const [x, y, w, h, rad] = cellRect(c, r);
        ctx.fillStyle = lv === 1 ? '#4a3510' : lv === 2 ? '#1c3a52' : lv === 3 ? '#5a1d58' : '#3a0d3a';
        rr(x, y, w, h, rad); ctx.fill();
        ctx.strokeStyle = lv ? (lv === 1 ? '#a8791f' : lv === 2 ? '#4f93c4' : '#d24fcf') : '#521655'; ctx.lineWidth = 1; ctx.stroke();
      }
      if (lv) {
        const [x, y, w, h] = cellRect(0, r);
        ctx.font = `${Math.floor(cs * 0.62)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.85; ctx.fillText(lv === 1 ? '🪙' : lv === 2 ? '🎁' : '🏆', x + w / 2, y + h / 2 + 1); ctx.globalAlpha = 1;
      }
    }
  }
  function getBg(W, H, cs) {
    if (BG) return BG;
    const d = L.dpr, cv = mk(W * d, H * d), keep = ctx; ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
    paintStatic(W, H, cs);
    ctx.fillStyle = 'rgba(255,255,255,.035)'; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    ctx = keep; return (BG = cv);
  }
  function draw() {
    const cs = L.cs, W = cs * CFG.cols, H = cs * CFG.rows;
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    const sh = G.shake > 0 ? G.shake * cs * 0.18 : 0;
    if (sh) ctx.translate((rng() - 0.5) * sh, (rng() - 0.5) * sh);
    ctx.drawImage(getBg(W, H, cs), -0, 0, W, H);
    // položené řady
    for (let r = 0; r < G.placed.length; r++) { const p = G.placed[r]; for (let c = p.x; c < p.x + p.w; c++) drawOn(c, r, 'on'); }
    // pohybující se kostky
    if (G.phase === 'run') for (let c = G.cur.x; c < G.cur.x + G.cur.w; c++) drawOn(c, G.row, 'move');
    else if (G.phase === 'idle') { // ukázka před hrou
      const w = 4, span = CFG.cols - w, p = (G.t * 4.2) % (span * 2), x = Math.round(p <= span ? p : span * 2 - p);
      for (let c = x; c < x + w; c++) drawOn(c, 0, 'move', 0.55);
    }
    // odpadlé kostky
    for (const f of G.falling) {
      const [x, y, w, h, rad] = cellRect(f.c, f.r);
      ctx.save(); ctx.globalAlpha = clamp(f.life, 0, 1); ctx.translate(x + w / 2 + f.vx * (1.4 - f.life) * cs, y + h / 2 + f.y); ctx.rotate(f.rot);
      const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#ff9cc4'); g.addColorStop(1, '#c4004f'); ctx.fillStyle = g; rr(-w / 2, -h / 2, w, h, rad); ctx.fill(); ctx.restore();
    }
    // jemné LED linky + záblesk
    if (G.flash > 0) { ctx.globalAlpha = G.flash * 0.35; ctx.fillStyle = G.flashColor; ctx.fillRect(-4, -4, W + 8, H + 8); ctx.globalAlpha = 1; }
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; G.t += dt;
    if (G.phase === 'run') {
      G.acc += dt * 1000; const iv = intervalOf(G.row);
      while (G.acc >= iv) { G.acc -= iv; stepBlock(); }
    }
    for (const f of G.falling) { f.life -= dt; f.vy += 22 * dt * 0.1; f.y += f.vy * L.cs * dt * 6; f.vy += 30 * dt; f.rot += f.vr * dt; }
    G.falling = G.falling.filter((f) => f.life > 0);
    G.flash = Math.max(0, G.flash - dt * 1.8); G.shake = Math.max(0, G.shake - dt * 1.6);
    try { draw(); } catch (e) { console.error(e); }
  }

  // ---- ovládání ----------------------------------------------------------------------------------------
  function bindInput() {
    $('#stage').addEventListener('pointerdown', (e) => {
      if (G.phase !== 'run') return;
      if (e.target.closest('.btn, .overlay, .side')) return;
      stopPressed();
    });
    $('#btn-stop').addEventListener('pointerdown', (e) => { e.preventDefault(); stopPressed(); });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (G.phase === 'run') { e.preventDefault(); if (!e.repeat) stopPressed(); return; }
      if (e.repeat || locked()) return;
      if (!$('#modal').hidden) return;
      if (!$('#result').hidden && (G.phase === 'done' || G.phase === 'over')) { e.preventDefault(); okResult(); return; } // potvrzení výhry / konce kola
      if (G.phase === 'idle' || G.phase === 'over' || G.phase === 'done') { e.preventDefault(); startGame(); }
    });
    $('#btn-start').addEventListener('click', () => { $('#btn-start').blur(); if (!locked()) startGame(); });
    $('#pr-go').addEventListener('click', () => { if (locked()) return; $('#prompt').hidden = true; G.phase = 'run'; G.acc = 0; newBlock(); refreshUi(); });
    $('#pr-take').addEventListener('click', () => { if (!locked()) claim(G.promptLevel); });
    $('#rs-ok').addEventListener('click', () => { if (!locked()) okResult(); });
    window.addEventListener('resize', layout); window.addEventListener('orientationchange', () => setTimeout(layout, 250)); if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
    try { new ResizeObserver(layout).observe($('#stage')); } catch (e) { /* ignore */ }
    setTimeout(layout, 300); setTimeout(layout, 1200);
    window.addEventListener('orientationchange', () => setTimeout(layout, 200));
  }

  // kontrola, jestli horní lištu něco nepřekrývá (např. reklama hostingu): lištu zvedneme nebo posuneme
  function coverCheck() {
    const bar = document.querySelector('.bar'), app = $('#app');
    const find = () => ['#back', '#btn-info', '#btn-snd'].map((s) => { const b = $(s); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t && t !== b && !b.contains(t) ? { s, t } : null; }).filter(Boolean);
    const run = (final) => {
      let bad = find(); if (!bad.length) return;
      bar.style.zIndex = '2147483647'; app.style.zIndex = '2147483646'; bad = find(); if (!bad.length) return;
      if (final) { const e = $('#errbar'); e.hidden = false; e.textContent = 'Tlačítka v liště překrývá jiný prvek stránky:\n' + bad.map((x) => x.s + ' <- ' + x.t.outerHTML.slice(0, 160)).join('\n') + '\n'; }
    };
    setTimeout(() => run(false), 500); setTimeout(() => run(true), 3000);
  }

  async function init() {
    const snd = $('#btn-snd'); const paint = () => { snd.textContent = soundOn ? '🔊' : '🔇'; }; paint();
    snd.onclick = () => { soundOn = !soundOn; store.set('stacker_sound', soundOn ? '1' : '0'); paint(); if (soundOn) sfx.tick(0); };
    $('#btn-info').onclick = () => { $('#modal').hidden = false; };
    $('#modal-close').onclick = () => { $('#modal').hidden = true; };
    coverCheck();
    buildPanels(); layout(); bindInput(); resetBoard(); refreshUi();
    requestAnimationFrame(frame);
    window.__stacker = { G, CFG, stopPressed, startGame, intervalOf, capOf, spin, showRewards, applyPower };
    const r = await api('state', { fresh: true }); // čerstvě načtená stránka: opuštěný pokus zahodit
    if (r.ok) {
      const j = r.json; if (j.rows) { CFG.rows = j.rows; CFG.cols = j.cols; CFG.levels = j.levels; CFG.coins = j.coins; CFG.small = j.small; CFG.big = j.big; }
      buildPanels(); layout(); G.ready = true; applyState(j);
    } else { const f = $('#fatal'); f.hidden = false; f.textContent = (r.json && r.json.error) || 'Nepodařilo se připojit k serveru.'; }
    refreshUi();
  }
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  init();
})();
