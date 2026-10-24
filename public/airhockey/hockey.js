(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const W = 1000, H = 560, PUCK_R = 22, MALLET_R = 40, GOAL = 220;
  const GY1 = (H - GOAL) / 2, GY2 = (H + GOAL) / 2;
  const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const AVATARS = [['A', 'S'], ['2', 'H'], ['3', 'D'], ['4', 'C'], ['5', 'S'], ['6', 'H'], ['7', 'D'], ['8', 'C'], ['9', 'S'], ['10', 'H']];
  const fmt = (n) => Number(n).toLocaleString('cs-CZ');

  // ---- pomocné ---------------------------------------------------------------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
    return n;
  }
  function toast(msg, kind) {
    const t = el('div', { class: 'toast' + (kind === 'err' ? ' err' : ''), text: msg });
    $('#toasts').append(t);
    setTimeout(() => t.remove(), 3800);
  }

  let memToken = null;
  function getToken() {
    let t = store.get('bj_token') || memToken; // stejný token jako blackjack = stejný (anonymní) účet
    if (!t || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) {
      const b = new Uint8Array(24);
      crypto.getRandomValues(b);
      t = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      store.set('bj_token', t);
      memToken = t;
    }
    return t;
  }

  function wsUrl() {
    const c = (window.AH_WS_URL || '').trim();
    if (c) return c;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/hockey';
  }
  function httpBase() {
    try { const x = new URL(wsUrl()); return (x.protocol === 'wss:' ? 'https:' : 'http:') + '//' + x.host; } catch (e) { return location.origin; }
  }

  function avatarEl(id, size = '') {
    const cls = ('avatar ' + size).trim();
    if (typeof id === 'string' && id.startsWith('u:')) {
      const img = el('img', { class: cls, src: `${httpBase()}/avatar/${id.slice(2)}.jpg`, alt: '', decoding: 'async' });
      img.addEventListener('error', () => img.replaceWith(avatarEl('a1', size)));
      return img;
    }
    const n = parseInt(String(id || 'a1').slice(1), 10);
    const a = AVATARS[(n >= 1 && n <= 10 ? n : 1) - 1];
    return el('div', { class: cls + (a[1] === 'H' || a[1] === 'D' ? ' red' : '') }, el('b', { text: a[0] }), el('i', { text: SUIT[a[1]] }));
  }

  // ---- zvuk -------------------------------------------------------------------
  let audio = null;
  let soundOn = store.get('ah_sound') !== false;
  function beep(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  const sndWall = () => beep(520, 0.05, 'triangle', 0.06);
  const sndHit = () => beep(180, 0.09, 'square', 0.1, -80);
  const sndGoal = () => { beep(392, 0.18, 'sawtooth', 0.1); setTimeout(() => beep(523, 0.25, 'sawtooth', 0.1), 150); };
  const sndWin = () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'triangle', 0.12), i * 130)); };
  const sndLose = () => { beep(300, 0.3, 'sawtooth', 0.08, -150); };
  const sndTick = () => beep(700, 0.06, 'sine', 0.08);

  // ---- stav -------------------------------------------------------------------
  let ws = null, retry = 0, wantReconnect = true;
  let me = null;           // { name, balance, avatar, custom, linked }
  let tables = [];
  let table = null;        // poslední zpráva 'table'
  let tableAt = 0;         // kdy dorazila (kvůli odpočtu)
  let screen = 'menu';
  let prevScores = null;
  let goalText = null, goalUntil = 0;

  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

  function connect() {
    $('#conn').hidden = false;
    let url = wsUrl();
    try { ws = new WebSocket(url); } catch (e) { setTimeout(connect, 2000); return; }
    ws.onopen = () => {
      retry = 0;
      $('#conn').hidden = true;
      let session;
      try { session = localStorage.getItem('portal_session') || undefined; } catch (e) { /* ignore */ }
      send({ t: 'hello', token: getToken(), session });
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } handle(m); };
    ws.onclose = () => {
      table = null;
      if (screen === 'game') show('menu');
      if (!wantReconnect) return;
      $('#conn').hidden = false;
      retry = Math.min(retry + 1, 6);
      setTimeout(connect, 500 * 2 ** retry);
    };
    ws.onerror = () => {};
  }

  function handle(m) {
    switch (m.t) {
      case 'welcome':
        me = { name: m.name, balance: m.balance, avatar: m.avatar, custom: m.custom, linked: m.linked || null };
        if (m.sessionInvalid) { try { localStorage.removeItem('portal_session'); } catch (e) { /* ignore */ } }
        renderMenu();
        if (screen === 'game') show('menu');
        break;
      case 'profile':
        me = { ...me, name: m.name, balance: m.balance, avatar: m.avatar, custom: m.custom };
        renderMenu();
        if (table) renderScoreboard();
        break;
      case 'lobby':
        tables = m.tables;
        if (screen === 'lobby') renderLobby();
        break;
      case 'table': onTable(m); break;
      case 's': onSnap(m); break;
      case 'left':
        table = null;
        if (screen === 'game') show('lobby');
        break;
      case 'error': toast(m.msg, 'err'); break;
      case 'kicked':
        wantReconnect = false;
        toast(m.reason || 'Spojení bylo ukončeno.', 'err');
        break;
      default: break;
    }
  }

  // ---- obrazovky --------------------------------------------------------------
  function show(name) {
    screen = name;
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    if (name === 'lobby') { send({ t: 'lobby' }); renderLobby(); }
    if (name === 'game') { resizeCanvas(); }
  }

  function renderMenu() {
    if (!me) return;
    $('#menu-name').textContent = me.name;
    $('#menu-balance').textContent = fmt(me.balance);
    $('#menu-avatar').replaceChildren(avatarEl(me.avatar, 'lg'));
    const lk = $('#menu-link');
    lk.hidden = !me.linked;
    lk.textContent = me.linked ? 'Propojeno s Google účtem' + (me.linked.email ? ' (' + me.linked.email + ')' : '') : '';
    $('#menu-hint').textContent = me.linked ? 'Jméno a profilovku změníš na hlavní stránce v Nastavení účtu.' : 'Přihlas se přes Google na hlavní stránce, ať máš zůstatek na všech zařízeních a můžeš si nastavit jméno a profilovku.';
    $('#g-balance').textContent = fmt(me.balance);
  }

  function renderLobby() {
    const ul = $('#tables');
    ul.replaceChildren(...tables.map((t) => {
      const info = t.players.length ? t.players.join(' · ') : 'volný';
      const state = t.full ? 'Plný' : (t.players.length ? 'Čeká na soupeře' : 'Prázdný');
      return el('li', {},
        el('div', {}, el('div', { class: 'tname', text: t.name + (t.permanent ? '' : ' (vlastní)') }), el('div', { class: 'tinfo', text: `${state} · ${info} · ${t.players.length}/2` })),
        el('button', { class: 'btn small', type: 'button', disabled: t.full, text: 'Hrát', onclick: () => send({ t: 'join', id: t.id }) }));
    }));
  }

  // ---- zápas: stav stolu ------------------------------------------------------
  function onTable(m) {
    const prev = table;
    table = m;
    tableAt = performance.now();
    const my = m.you;
    // gól: porovnání skóre
    if (prev && prev.id === m.id && prev.seats && m.seats) {
      for (let i = 0; i < 2; i++) {
        if (prev.seats[i] && m.seats[i] && m.seats[i].score > prev.seats[i].score) {
          goalText = (i === my ? 'GÓL!' : 'Gól soupeře') ;
          goalUntil = performance.now() + 1600;
          if (m.phase !== 'over') sndGoal();
        }
      }
      if (prev.phase !== 'over' && m.phase === 'over' && m.reward) { (m.reward.to === my ? sndWin : sndLose)(); }
    }
    if (m.phase === 'waiting' || m.phase === 'vote' || m.phase === 'reveal' || m.phase === 'countdown') { puck = null; }
    if (screen !== 'game') { show('game'); }
    $('#g-title').textContent = m.name;
    renderScoreboard();
    renderOverlay();
  }

  function renderScoreboard() {
    if (!table) return;
    const my = table.you;
    const mk = (idx, right) => {
      const s = table.seats[idx];
      if (!s) return el('div', { class: 'side' + (right ? ' right' : '') }, el('div', { class: 'who' }, el('div', { class: 'nm muted', text: 'Čeká se na hráče…' })));
      return el('div', { class: 'side' + (right ? ' right' : '') },
        avatarEl(s.avatar, 'sm'),
        el('div', { class: 'who' },
          el('div', { class: 'nm' }, s.name, idx === my ? el('span', { class: 'you-tag', text: 'ty' }) : null),
          el('div', { class: 'sub' }, 'Série: ', el('b', { text: String(s.streak) }), ' · příští výhra ', el('b', { text: '+' + fmt(s.next) }))));
    };
    const a = table.seats[my] ? table.seats[my].score : 0;
    const b = table.seats[1 - my] ? table.seats[1 - my].score : 0;
    $('#scoreboard').replaceChildren(mk(my, false), el('div', { class: 'score' }, String(a), el('span', { class: 'sep', text: ':' }), String(b)), mk(1 - my, true));
  }

  const SPEED_NAMES = { slow: 'Pomalá', normal: 'Normální', fast: 'Rychlá' };
  let lastTickNo = -1;
  function overlayHtml() {
    if (!table) return null;
    const my = table.you;
    const left = Math.max(0, table.left - (performance.now() - tableAt));
    if (table.phase === 'waiting') return { big: 'Čekání na soupeře…', small: 'Zápas začne, jakmile se připojí druhý hráč.' };
    if (table.phase === 'vote') {
      return { vote: true, big: 'Vyberte rychlost hry', small: 'Soupeř volí také · ' + Math.ceil(left / 1000) + ' s', key: 'vote|' + (table.myVote || '') + '|' + table.voted.join() + '|' + Math.ceil(left / 1000) };
    }
    if (table.phase === 'reveal') {
      const nm = (k) => SPEED_NAMES[k] || '–';
      const v = table.votes || [];
      const mine = v[my], theirs = v[1 - my];
      const how = table.how === 'coin' ? 'Hlasy se lišily – los rozhodl' : (table.how === 'default' ? 'Nikdo nehlasoval' : 'Shoda');
      return { big: nm(table.speed), small: `Ty: ${nm(mine)} · soupeř: ${nm(theirs)} · ${how}` };
    }
    if (table.phase === 'countdown') {
      const n = Math.ceil(left / 1000);
      return { big: n > 0 ? String(n) : 'Hraj!', small: 'První na ' + table.win + ' gólů' };
    }
    if (table.phase === 'goal' || (goalText && performance.now() < goalUntil && table.phase === 'playing')) return goalText ? { big: goalText, small: '' } : null;
    if (table.phase === 'over' && table.winner != null) {
      const won = table.winner === my;
      const rw = table.reward;
      return {
        cls: won ? 'win' : 'lose',
        big: won ? 'Vyhrál jsi!' : 'Prohrál jsi',
        small: (won && rw ? `+${fmt(rw.amount)} žetonů · série ${rw.streak}` : (rw ? `${table.seats[table.winner].name} získal +${fmt(rw.amount)}` : '')) + ' · odveta za ' + Math.ceil(left / 1000) + ' s',
      };
    }
    return null;
  }
  let ovKey = '';
  function renderOverlay() {
    const ov = $('#overlay');
    const o = overlayHtml();
    if (!o) { ov.hidden = true; ovKey = ''; return; }
    const key = o.key || (o.big + '|' + o.small);
    if (key === ovKey && !ov.hidden) return;
    if (table && table.phase === 'countdown' && /^\d$/.test(o.big)) sndTick();
    ovKey = key;
    ov.hidden = false;
    if (o.vote) {
      const info = table.myVote ? 'Tvůj hlas: ' + SPEED_NAMES[table.myVote] + (table.voted[1 - table.you] ? ' · soupeř už hlasoval' : '') : 'Rychlost ovlivňuje rychlost puku. Při neshodě rozhodne los.';
      let box = ov.querySelector('.box.vote');
      if (!box) { // tlačítka se nepřekreslují (klepnutí by se mohlo ztratit), jen se aktualizují
        const btns = (table.speeds || []).map((k) => el('button', { class: 'btn small vote-btn', type: 'button', 'data-k': k, text: SPEED_NAMES[k] || k, onclick: () => send({ t: 'vote', v: k }) }));
        box = el('div', { class: 'box vote' }, el('div', { class: 'big', text: o.big }), el('div', { class: 'small v-time' }),
          el('div', { class: 'vote-row' }, ...btns), el('div', { class: 'small v-info' }));
        ov.replaceChildren(box);
      }
      box.querySelector('.v-time').textContent = o.small;
      box.querySelector('.v-info').textContent = info;
      for (const b of box.querySelectorAll('.vote-btn')) b.classList.toggle('picked', b.dataset.k === table.myVote);
      return;
    }
    ov.replaceChildren(el('div', { class: 'box' }, el('div', { class: 'big ' + (o.cls || ''), text: o.big }), o.small ? el('div', { class: 'small', text: o.small }) : null));
  }

  // ---- fyzika na klientu = jen vykreslení snímků -----------------------------
  let puck = null;           // zobrazená pozice puku
  let snap = null;           // poslední snímek { p, m, at }
  let opp = null;            // zobrazená pozice soupeřovy pálky
  let mine = { x: 110, y: H / 2 }; // zobrazená pozice mé pálky (podle kurzoru)
  const target = { x: 110, y: H / 2 };

  function onSnap(m) {
    snap = { p: m.p, m: m.m, at: performance.now() };
    if (m.e & 1) sndWall();
    if (m.e & 2) sndHit();
  }

  // ---- vykreslení -----------------------------------------------------------
  const canvas = $('#rink');
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let portrait = false;
  function resizeCanvas() {
    const wrap = $('#rink-wrap');
    // na výšku (mobil): stůl se otočí o 90°, můj konec je dole (jako v Clash Royale)
    portrait = wrap.clientHeight > wrap.clientWidth * 1.05;
    const vw = portrait ? H : W, vh = portrait ? W : H; // rozměry zobrazeného stolu
    const maxW = Math.min(wrap.clientWidth, 1000);
    const maxH = wrap.clientHeight;
    const w = Math.max(160, Math.min(maxW, maxH * (vw / vh)));
    const h = w * (vh / vw);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = canvas.width / vw;
  }
  window.addEventListener('resize', () => { if (screen === 'game') resizeCanvas(); });

  const flip = () => table && table.you === 1; // hráč vpravo vidí stůl otočený, aby byl vždy vlevo
  const sx = (x) => (flip() ? W - x : x);

  function drawRink() {
    const c = ctx;
    if (portrait) c.setTransform(0, -scale, scale, 0, 0, W * scale); // x stolu -> nahoru, y stolu -> doprava
    else c.setTransform(scale, 0, 0, scale, 0, 0);
    // podklad
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#12486a'); g.addColorStop(1, '#0b2e49');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // jemná textura ledu
    c.fillStyle = 'rgba(255,255,255,0.035)';
    for (let x = 0; x < W; x += 40) c.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 40) c.fillRect(0, y, W, 1);
    // čáry
    c.strokeStyle = 'rgba(150,220,255,0.55)'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke();
    c.beginPath(); c.arc(W / 2, H / 2, 80, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(150,220,255,0.7)';
    c.beginPath(); c.arc(W / 2, H / 2, 8, 0, Math.PI * 2); c.fill();
    // brankoviště a branky: vlevo na obrazovce jsem vždy já (červený hráč 0 / modrý hráč 1)
    const RED = [255, 90, 90], BLUE = [110, 160, 255];
    const my = table ? table.you : 0;
    const leftC = my === 0 ? RED : BLUE, rightC = my === 0 ? BLUE : RED;
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    c.strokeStyle = rgba(leftC, 0.45);
    c.beginPath(); c.arc(0, H / 2, GOAL / 2 + 30, -Math.PI / 2, Math.PI / 2); c.stroke();
    c.strokeStyle = rgba(rightC, 0.45);
    c.beginPath(); c.arc(W, H / 2, GOAL / 2 + 30, Math.PI / 2, Math.PI * 1.5); c.stroke();
    for (const left of [true, false]) {
      const col = left ? leftC : rightC;
      c.fillStyle = rgba(col, 0.9);
      c.fillRect(left ? 0 : W - 8, GY1, 8, GOAL);
      const gg = c.createLinearGradient(left ? 0 : W, 0, left ? 60 : W - 60, 0);
      gg.addColorStop(0, rgba(col, 0.28)); gg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gg; c.fillRect(left ? 0 : W - 60, GY1, 60, GOAL);
    }
    // mantinel
    c.strokeStyle = '#d7efff'; c.lineWidth = 10;
    c.beginPath();
    c.moveTo(0, GY1); c.lineTo(0, 0); c.lineTo(W, 0); c.lineTo(W, GY1);
    c.moveTo(W, GY2); c.lineTo(W, H); c.lineTo(0, H); c.lineTo(0, GY2);
    c.stroke();
    c.fillStyle = '#d7efff';
    for (const [x, y] of [[0, GY1], [0, GY2], [W, GY1], [W, GY2]]) { c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); }
  }

  function drawMallet(x, y, color, hi) {
    const c = ctx;
    c.save();
    c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 14; c.shadowOffsetY = 6;
    c.fillStyle = color;
    c.beginPath(); c.arc(x, y, MALLET_R, 0, Math.PI * 2); c.fill();
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, MALLET_R - 4, 0, Math.PI * 2); c.stroke();
    const g = c.createRadialGradient(x - 8, y - 10, 2, x, y, 20);
    g.addColorStop(0, hi); g.addColorStop(1, color);
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, 20, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, 20, 0, Math.PI * 2); c.stroke();
  }

  function drawPuck(x, y) {
    const c = ctx;
    c.save();
    c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 10; c.shadowOffsetY = 5;
    c.fillStyle = '#15171c';
    c.beginPath(); c.arc(x, y, PUCK_R, 0, Math.PI * 2); c.fill();
    c.restore();
    c.strokeStyle = '#f2d36b'; c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, PUCK_R - 4, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.18)';
    c.beginPath(); c.arc(x - 6, y - 7, 6, 0, Math.PI * 2); c.fill();
  }

  let lastFrame = performance.now();
  let lastSent = 0, lastSentX = -1, lastSentY = -1;
  function frame(now) {
    requestAnimationFrame(frame);
    if (screen !== 'game' || !table) { lastFrame = now; return; }
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const my = table.you;
    const live = table.phase === 'playing';

    // moje pálka: okamžitě podle kurzoru (omezeno na mou polovinu), server dostane stejnou polohu
    const lo = my === 0 ? MALLET_R : W / 2 + MALLET_R, hi = my === 0 ? W / 2 - MALLET_R : W - MALLET_R;
    const tx = Math.min(hi, Math.max(lo, target.x)), ty = Math.min(H - MALLET_R, Math.max(MALLET_R, target.y));
    mine.x = tx; mine.y = ty;
    if (now - lastSent > 15 && (Math.abs(tx - lastSentX) > 0.4 || Math.abs(ty - lastSentY) > 0.4)) {
      send({ t: 'm', x: Math.round(tx * 10) / 10, y: Math.round(ty * 10) / 10 });
      lastSent = now; lastSentX = tx; lastSentY = ty;
    }

    // soupeřova pálka a puk z posledního snímku (puk se dopočítá podle rychlosti)
    if (snap) {
      const age = Math.min(0.1, (now - snap.at) / 1000);
      const oi = 1 - my;
      const ox = snap.m[oi * 2], oy = snap.m[oi * 2 + 1];
      opp = opp ? { x: opp.x + (ox - opp.x) * Math.min(1, dt * 22), y: opp.y + (oy - opp.y) * Math.min(1, dt * 22) } : { x: ox, y: oy };
      let px = snap.p[0] + snap.p[2] * age, py = snap.p[1] + snap.p[3] * age;
      py = Math.min(H - PUCK_R, Math.max(PUCK_R, py));
      if (!puck || Math.hypot(puck.x - px, puck.y - py) > 160) puck = { x: px, y: py };
      else { const k = Math.min(1, dt * 30); puck = { x: puck.x + (px - puck.x) * k, y: puck.y + (py - puck.y) * k }; }
    } else { opp = null; }

    // kreslení
    drawRink();
    const mc = my === 0 ? ['#e5484d', '#ff9a9e'] : ['#3d7bff', '#9bbcff'];
    const oc = my === 0 ? ['#3d7bff', '#9bbcff'] : ['#e5484d', '#ff9a9e'];
    if (opp) drawMallet(sx(opp.x), opp.y, oc[0], oc[1]);
    if (puck && table.phase !== 'waiting') drawPuck(sx(puck.x), puck.y);
    drawMallet(sx(mine.x), mine.y, mc[0], mc[1]);
    renderOverlay();
    void live;
  }
  requestAnimationFrame(frame);

  // ---- vstup: myš / dotyk -----------------------------------------------------
  function pointer(e) {
    if (screen !== 'game' || !table) return;
    const r = canvas.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    let x = portrait ? (1 - fy) * W : fx * W;
    const y = portrait ? fx * H : fy * H;
    if (flip()) x = W - x;
    target.x = x; target.y = y;
  }
  window.addEventListener('pointermove', pointer, { passive: true });
  window.addEventListener('pointerdown', pointer, { passive: true });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // ---- init -------------------------------------------------------------------
  function init() {
    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const go = b.dataset.go;
      if (go === 'quick') send({ t: 'quick' });
      else show(go);
    }));
    $('#create-form').addEventListener('submit', (e) => {
      e.preventDefault();
      send({ t: 'create', name: $('#table-name').value });
      $('#table-name').value = '';
    });
    $('#btn-leave').addEventListener('click', () => send({ t: 'leave' }));
    const snd = $('#btn-sound');
    const paint = () => { snd.textContent = soundOn ? '🔊' : '🔇'; };
    paint();
    snd.addEventListener('click', () => { soundOn = !soundOn; store.set('ah_sound', soundOn); paint(); });
    window.addEventListener('beforeunload', () => { wantReconnect = false; });
    connect();
  }
  // mobil: zákaz pinch-zoomu (iOS ignoruje user-scalable)
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  init();
})();
