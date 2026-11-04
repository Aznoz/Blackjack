(() => {
  'use strict';
  const CFG = window.KRESLENI_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const COLORS = ['#ffd84a', '#5ee1ff', '#7ee08a', '#ff8fb1', '#c59bff', '#ff9a5b', '#9fe8ff', '#ffb4a8'];
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nic */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* nic */ } } };
  const LEVELS = [
    { id: 'lehka', name: 'Lehká', desc: 'Jednoduché věci: slunce, kočka, strom…' },
    { id: 'normalni', name: 'Střední', desc: 'Sněhulák, klavír, hrad, bagr…' },
    { id: 'tezka', name: 'Těžká', desc: 'Tornádo, labyrint, horská dráha…' },
    { id: 'mix', name: 'Mix', desc: 'Všechno dohromady – nejvíc slov.' },
  ];
  const LV = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
  const PAL = ['#ffffff', '#111111', '#7f7f7f', '#c8c8c8', '#e8352b', '#ff8a1f', '#ffd21f', '#8bd62a', '#1faa4b', '#16c1c9', '#2b6be8', '#6a3fd1', '#d12bb8', '#ff8fb3', '#8a5a2b', '#f0c9a0'];
  const SIZES = [3, 7, 14, 26];
  const colorOf = (c) => (typeof c === 'string' ? c : PAL[c] || '#000000'); // index do palety, nebo vlastní barva '#rrggbb'
  const CW = 800, CH = 600;

  const API = String(CFG.SERVER_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/kresleni\/?$/, '');
  let memToken = null;
  function getToken() {
    let t = null;
    try { t = JSON.parse(LS.get('bj_token')); } catch (e) { t = LS.get('bj_token'); }
    t = t || memToken;
    if (!t || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) {
      const b = new Uint8Array(24); crypto.getRandomValues(b);
      t = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      LS.set('bj_token', JSON.stringify(t)); memToken = t;
    }
    return t;
  }
  function getSession() { let x = LS.get('portal_session'); try { x = JSON.parse(x); } catch (e) { /* surový řetězec */ } return typeof x === 'string' ? x : undefined; }
  const ident = () => ({ token: getToken(), session: getSession() });

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const AVS = [['A', 'S'], ['2', 'H'], ['3', 'D'], ['4', 'C'], ['5', 'S'], ['6', 'H'], ['7', 'D'], ['8', 'C'], ['9', 'S'], ['10', 'H']];
  const color = (id) => COLORS[(parseInt(String(id).slice(1), 10) - 1 + COLORS.length) % COLORS.length];
  /** Profilovka z účtu na Herně (karta nebo nahraný obrázek); host bez účtu dostane barevné písmeno. */
  function avatarHtml(p) {
    const id = p.avatar;
    if (typeof id === 'string' && /^u:[0-9a-f]{16}$/.test(id)) return `<img class="av" src="${API}/avatar/${id.slice(2)}.jpg" alt="" onerror="this.style.visibility='hidden'">`;
    if (typeof id === 'string' && /^a(10|[1-9])$/.test(id)) { const a = AVS[parseInt(id.slice(1), 10) - 1]; return `<span class="av card${a[1] === 'H' || a[1] === 'D' ? ' red' : ''}"><b>${a[0]}</b><i>${SUIT[a[1]]}</i></span>`; }
    return `<span class="av" style="background:${color(p.id)}">${esc(String(p.name || '?')[0].toUpperCase())}</span>`;
  }

  let ws = null, st = null, me = null, session = null, seenEv = 0, wantOpen = false, retry = 0, pending = null;
  let muted = LS.get('kres_mute') === '1';
  let stateAt = 0, chat = [], lastTurnKey = '';

  // ---------------- zvuk (syntetický, bez souborů)
  let ac = null;
  function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; }
  function tone(freq, dur, type = 'triangle', vol = 0.07, slide = 0, delay = 0) {
    if (muted) return; const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + delay; o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    pop() { tone(700, .08, 'triangle', .07); tone(1000, .1, 'triangle', .07, 0, .07); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, 'triangle', .09, 0, i * .11)); },
    tick() { tone(1100, .03, 'square', .03); },
    turn() { tone(440, .1, 'sine', .08); tone(660, .14, 'sine', .08, 0, .1); },
    end() { tone(330, .14, 'triangle', .07); tone(247, .22, 'triangle', .07, 0, .13); },
    hint() { tone(880, .06, 'sine', .05); },
  };

  // ---------------- spojení
  function toast(t) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, 3200); }
  function setStatus(t, err) { const e = $('menuStatus'); e.textContent = t || ''; e.className = 'status' + (err ? ' err' : ''); }
  const healthUrl = () => API + '/kresleni/health';

  function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    wantOpen = true;
    let sock;
    try { sock = new WebSocket(CFG.SERVER_URL); } catch (e) { setStatus('Špatná adresa serveru.', true); return; }
    ws = sock;
    sock.onopen = () => {
      retry = 0; loadMe();
      if (pending) { send(pending); pending = null; }
      else if (session) send({ t: 'resume', code: session.code, token: session.token });
    };
    sock.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMsg(m); };
    sock.onclose = () => {
      if (ws === sock) ws = null;
      if (!wantOpen) return;
      if (st) toast('Spojení spadlo, připojuji znovu…');
      retry++;
      if (retry > 12) { wantOpen = false; setStatus('Server neodpovídá. Zkus to za chvilku (může se probouzet).', true); if (st) leaveLocal(); return; }
      if (!st && !session && !pending) { wantOpen = false; return; }
      setTimeout(connect, Math.min(4000, 800 * retry));
    };
    sock.onerror = () => {};
  }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); else { pending = o; connect(); } }
  function wake() { // Render po nečinnosti usíná; pár vteřin se probouzí
    setStatus('Probouzím server…');
    fetch(healthUrl(), { cache: 'no-store' }).then(() => { setStatus(''); loadMe(); }).catch(() => setStatus(''));
  }

  function onMsg(m) {
    switch (m.t) {
      case 'joined': session = { code: m.code, token: m.token }; me = m.you; LS.set('kres_session', JSON.stringify(session)); break;
      case 'state': onState(m); break;
      case 'draw': items = Array.isArray(m.items) ? m.items : []; redraw(); break;
      case 'd': onOp(m); break;
      case 'chat': addChat(m.m); break;
      case 'chatlog': chat = Array.isArray(m.list) ? m.list.slice() : []; renderChat(); break;
      case 'err':
        if (m.fatal) { setStatus(m.msg, true); if (m.gone) { session = null; LS.del('kres_session'); } leaveLocal(true); wantOpen = false; if (ws) ws.close(); }
        else toast(m.msg);
        break;
      default:
    }
  }

  // ---------------- obrazovky
  function show(id) { for (const s of ['menu', 'lobby', 'game', 'over']) $(s).hidden = s !== id; document.documentElement.classList.toggle('ingame', id === 'game'); window.scrollTo(0, 0); syncVV(); }

  // Na mobilu je obrazovka hry pevně rozložená do výšky skutečně viditelné části (bez klávesnice), stránka se neposouvá.
  // Po otevření klávesnice se výška zmenší a plátno, chat a pole se vejdou do zbytku; skryje se hlavička, hráči a nástroje.
  function syncVV() {
    const vv = window.visualViewport, root = document.documentElement;
    const h = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--app-h', Math.round(h) + 'px');
    root.style.setProperty('--app-top', Math.round(vv ? vv.offsetTop : 0) + 'px');
    const typing = document.activeElement === $('chatInput');
    root.classList.toggle('kb', typing || (window.innerHeight - h > 120));
  }
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', syncVV); window.visualViewport.addEventListener('scroll', () => { syncVV(); if (document.documentElement.classList.contains('ingame')) window.scrollTo(0, 0); }); }
  window.addEventListener('resize', syncVV); window.addEventListener('orientationchange', () => setTimeout(syncVV, 200));
  $('chatInput').addEventListener('focus', () => { syncVV(); setTimeout(() => { syncVV(); window.scrollTo(0, 0); const l = $('chatLog'); l.scrollTop = l.scrollHeight; }, 250); });
  $('chatInput').addEventListener('blur', () => setTimeout(syncVV, 50));
  $('chatForm').querySelector('button').addEventListener('pointerdown', (e) => { if (document.activeElement === $('chatInput')) e.preventDefault(); }); // klávesnice se po odeslání nezavře
  syncVV();
  function leaveLocal(keepStatus) {
    st = null; me = null; session = null; seenEv = 0; chat = []; items = []; lastTurnKey = ''; LS.del('kres_session');
    show('menu'); if (!keepStatus) setStatus('');
    history.replaceState(null, '', location.pathname);
  }
  const nameOf = (id) => (st && st.players.find((p) => p.id === id) || {}).name || '?';

  function onState(s) {
    const prev = st; st = s; me = s.you; stateAt = performance.now();
    if (session && s.code !== session.code) session.code = s.code;
    const phaseChanged = !prev || prev.phase !== s.phase;
    if (s.phase === 'lobby') { renderLobby(); show('lobby'); }
    else if (s.phase === 'over') { renderOver(); if (phaseChanged) { show('over'); sfx.win(); } }
    else { if ($('game').hidden) { show('game'); fit(); } renderGame(prev); }
    if (s.ev && s.ev.id > seenEv) { const first = seenEv === 0; seenEv = s.ev.id; if (!first) onEvent(s.ev); }
  }

  // ---------------- lobby
  function renderLobby() {
    $('roomCode').textContent = st.code;
    const host = st.hostId === me;
    const n = st.players.length;
    $('lobbyCount').textContent = `${n} / 8`;
    $('lobbyPlayers').innerHTML = st.players.map((p) => `<li class="${p.id === me ? 'me' : ''}">${avatarHtml(p)}<b>${esc(p.name)}</b><small>${p.id === st.hostId ? 'zakladatel' : p.connected ? '' : 'odpojen'}</small></li>`).join('')
      + Array.from({ length: Math.max(0, Math.min(8, Math.max(4, n + 1)) - n) }, () => '<li class="empty">čeká se…</li>').join('');
    $('hostCfg').hidden = !host;
    $('cfgView').hidden = host;
    $('cfgView').innerHTML = `Slova: <b>${LV[st.level].name}</b> · ${st.rounds} ${st.rounds === 1 ? 'kolo' : st.rounds < 5 ? 'kola' : 'kol'} · ${st.drawSec} s na kreslení`;
    $('levels').innerHTML = LEVELS.map((l) => `<button type="button" class="lvl${l.id === st.level ? ' on' : ''}" data-lv="${l.id}"><b>${l.name}</b><span>${l.desc}</span></button>`).join('');
    $('levels').querySelectorAll('[data-lv]').forEach((b) => { b.onclick = () => send({ t: 'config', level: b.dataset.lv }); });
    if (document.activeElement !== $('cfgRounds')) $('cfgRounds').value = String(st.rounds);
    if (document.activeElement !== $('cfgDraw')) $('cfgDraw').value = String(st.drawSec);
    $('startBtn').hidden = !host; $('startBtn').disabled = n < 2;
    $('lobbyHint').textContent = n < 2 ? 'Na hru jsou potřeba aspoň 2 hráči – pošli kamarádům kód nebo odkaz (hraje se 2–8 lidí).' : (host ? 'Až budete všichni, spusť hru.' : 'Čekáme, až zakladatel spustí hru.');
    history.replaceState(null, '', `?room=${st.code}`);
  }

  // ---------------- plátno
  const cv = $('cv'); const ctx = cv.getContext('2d', { willReadFrequently: true });
  let items = []; // zrcadlo kresby ze serveru: {k:'s',c,w,pts} (tah), {k:'f',c,x,y} (výplň), {k:'g',s,c,w,x1,y1,x2,y2,fl} (tvar)
  let cur = null; // rozkreslený tah (příjemce i kreslíř)
  function clearCanvas() { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CW, CH); }
  function strokeStyle(c, w) { ctx.strokeStyle = colorOf(c); ctx.fillStyle = colorOf(c); ctx.lineWidth = SIZES[w]; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
  function segs(it, from) { // vykreslí body tahu od indexu from (index bodu)
    strokeStyle(it.c, it.w);
    const p = it.pts;
    if (p.length === 2 && from === 0) { ctx.beginPath(); ctx.arc(p[0], p[1], SIZES[it.w] / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.beginPath();
    const i0 = Math.max(0, from - 1);
    ctx.moveTo(p[i0 * 2], p[i0 * 2 + 1]);
    for (let i = i0 + 1; i < p.length / 2; i++) ctx.lineTo(p[i * 2], p[i * 2 + 1]);
    ctx.stroke();
  }
  /** Tvar mezi dvěma rohy/konci: s = 'l' čára, 'r' obdélník, 'o' elipsa; fl = vyplněný. Kreslí se do ctx (nebo do náhledu). */
  function drawShape(g, c2 = ctx) {
    const col = colorOf(g.c);
    c2.strokeStyle = col; c2.fillStyle = col; c2.lineWidth = SIZES[g.w]; c2.lineCap = 'round'; c2.lineJoin = 'round';
    const x0 = Math.min(g.x1, g.x2), y0 = Math.min(g.y1, g.y2), dx = Math.abs(g.x2 - g.x1), dy = Math.abs(g.y2 - g.y1);
    c2.beginPath();
    if (g.s === 'l') { c2.moveTo(g.x1, g.y1); c2.lineTo(g.x2, g.y2); }
    else if (g.s === 'r') c2.rect(x0, y0, dx, dy);
    else c2.ellipse(x0 + dx / 2, y0 + dy / 2, Math.max(0.5, dx / 2), Math.max(0.5, dy / 2), 0, 0, Math.PI * 2);
    if (g.fl && g.s !== 'l') c2.fill();
    c2.stroke();
  }
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function floodFill(sx, sy, c) {
    sx = Math.max(0, Math.min(CW - 1, sx)); sy = Math.max(0, Math.min(CH - 1, sy));
    const img = ctx.getImageData(0, 0, CW, CH), d = img.data;
    const i0 = (sy * CW + sx) * 4; const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2];
    const [fr, fg, fb] = hexRgb(colorOf(c));
    const TOL = 90;
    const same = (i) => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) <= TOL;
    if (Math.abs(fr - tr) + Math.abs(fg - tg) + Math.abs(fb - tb) <= 6) return;
    const seen = new Uint8Array(CW * CH);
    const stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop(), x0 = stack.pop();
      let x = x0;
      while (x >= 0 && !seen[y * CW + x] && same((y * CW + x) * 4)) x--;
      x++;
      let up = false, down = false;
      while (x < CW && !seen[y * CW + x] && same((y * CW + x) * 4)) {
        const k = y * CW + x; seen[k] = 1; const i = k * 4; d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
        if (y > 0) { const u = same(((y - 1) * CW + x) * 4) && !seen[(y - 1) * CW + x]; if (u && !up) stack.push(x, y - 1); up = u; }
        if (y < CH - 1) { const dn = same(((y + 1) * CW + x) * 4) && !seen[(y + 1) * CW + x]; if (dn && !down) stack.push(x, y + 1); down = dn; }
        x++;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function redraw() {
    clearCanvas(); cur = null;
    for (const it of items) { if (it.k === 's') segs(it, 0); else if (it.k === 'f') floodFill(it.x, it.y, it.c); else if (it.k === 'g') drawShape(it); }
  }
  /** Operace od kreslíře (pro hádající): začátek tahu, další body, vyplnění. */
  function onOp(m) {
    if (m.op === 'b') { cur = { k: 's', c: m.c, w: m.w, pts: [m.x, m.y] }; items.push(cur); segs(cur, 0); }
    else if (m.op === 'p' && cur && Array.isArray(m.pts)) { const from = cur.pts.length / 2; cur.pts.push(...m.pts); segs(cur, from); }
    else if (m.op === 's') { cur = null; const g = { k: 'g', s: m.s, c: m.c, w: m.w, x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, fl: m.fl ? 1 : 0 }; items.push(g); drawShape(g); }
    else if (m.op === 'f') { redraw(); items.push({ k: 'f', c: m.c, x: m.x, y: m.y }); floodFill(m.x, m.y, m.c); } // před výplní se plátno překreslí „načisto“, aby všichni dostali stejný výsledek
  }

  // ---- kreslení myší/prstem (jen kreslíř v tahu)
  let tool = 'pen', colorIdx = 1, sizeIdx = 1, shapeFill = false, shape = null, down = false, buf = [], flushT = null, drawPtr = null;   // drawPtr = prst / ukazatel, který právě kreslí (druhý prst se ignoruje)
  const SHAPE_TOOLS = { line: 'l', rect: 'r', oval: 'o' };
  const pv = $('pv'), pctx = pv.getContext('2d');
  const clearPreview = () => pctx.clearRect(0, 0, CW, CH);
  const canDraw = () => !!st && st.phase === 'draw' && st.drawer === me && !st.paused;
  function pos(e) { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(CW, Math.round(((e.clientX - r.left) * CW) / r.width))), Math.max(0, Math.min(CH, Math.round(((e.clientY - r.top) * CH) / r.height)))]; }
  const penColor = () => (tool === 'eraser' ? 0 : colorIdx);
  function flush() {
    flushT = null;
    if (buf.length) { send({ t: 'd', op: 'p', pts: buf.slice(0, 100) }); buf = buf.slice(100); if (buf.length) flushT = setTimeout(flush, 30); }
  }
  cv.addEventListener('pointerdown', (e) => {
    if (!canDraw()) return;
    e.preventDefault(); audio();
    if (down || drawPtr !== null || (e.pointerType === 'touch' && !e.isPrimary)) return;   // druhý prst na plátně nic nedělá: tah prvního pokračuje
    const [x, y] = pos(e);
    if (tool === 'fill') { send({ t: 'd', op: 'f', c: colorIdx, x, y }); redraw(); items.push({ k: 'f', c: colorIdx, x, y }); floodFill(x, y, colorIdx); return; }
    down = true; drawPtr = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* nic */ }
    if (SHAPE_TOOLS[tool]) { shape = { k: 'g', s: SHAPE_TOOLS[tool], c: colorIdx, w: sizeIdx, x1: x, y1: y, x2: x, y2: y, fl: shapeFill && tool !== 'line' ? 1 : 0 }; return; }
    cur = { k: 's', c: penColor(), w: sizeIdx, pts: [x, y] }; items.push(cur); segs(cur, 0);
    send({ t: 'd', op: 'b', c: cur.c, w: cur.w, x, y });
  });
  /** Při držené klávese Shift: čtverec/kruh, u čáry svislá/vodorovná/úhlopříčná. */
  function constrain(g, shift) {
    if (!shift) return;
    let dx = g.x2 - g.x1, dy = g.y2 - g.y1;
    if (g.s === 'l') {
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy);
      dx = Math.cos(a) * len; dy = Math.sin(a) * len;
    } else { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
    g.x2 = Math.max(0, Math.min(CW, Math.round(g.x1 + dx))); g.y2 = Math.max(0, Math.min(CH, Math.round(g.y1 + dy)));
  }
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId !== drawPtr) return;
    if (down && shape) { e.preventDefault(); [shape.x2, shape.y2] = pos(e); constrain(shape, e.shiftKey); clearPreview(); drawShape(shape, pctx); return; }
    if (!down || !cur) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const [x, y] = pos(ev);
      const n = cur.pts.length;
      if (cur.pts[n - 2] === x && cur.pts[n - 1] === y) continue;
      const from = n / 2; cur.pts.push(x, y); segs(cur, from); buf.push(x, y);
    }
    if (!flushT) flushT = setTimeout(flush, 40);
  });
  const up = (e) => {
    if (!down || e.pointerId !== drawPtr) return;
    drawPtr = null;
    if (shape) { // puštění: tvar se definitivně nakreslí a odešle (kliknutí bez tažení se zahodí)
      down = false; try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* nic */ }
      const g = shape; shape = null; clearPreview();
      if (e.type === 'pointercancel' || !canDraw() || (g.x1 === g.x2 && g.y1 === g.y2)) return;
      items.push(g); drawShape(g);
      send({ t: 'd', op: 's', s: g.s, c: g.c, w: g.w, x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, fl: g.fl });
      return;
    }
    down = false; try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* nic */ } clearTimeout(flushT); while (buf.length) { send({ t: 'd', op: 'p', pts: buf.slice(0, 100) }); buf = buf.slice(100); } flushT = null; cur = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(g, (e) => e.preventDefault());   // iOS: pinch dvěma prsty nezoomuje stránku
  cv.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  // ---- barevné kolo (vlastní barva): odstín = úhel, sytost = vzdálenost od středu, jas = posuvník
  const hsv2hex = (h, sat, v) => {
    const f = (n) => { const k = (n + h * 6) % 6; return v - v * sat * Math.max(0, Math.min(k, 4 - k, 1)); };
    return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  };
  const WS = 168, WR = WS / 2;
  let wH = 0.75, wS = 0.8, wV = 1, customHex = hsv2hex(wH, wS, wV), wDown = false;
  const wheel = $('wheel'), wctx = wheel.getContext('2d', { willReadFrequently: true });
  function drawWheel() {
    const img = wctx.createImageData(WS, WS), d = img.data;
    for (let y = 0; y < WS; y++) {
      for (let x = 0; x < WS; x++) {
        const dx = x + 0.5 - WR, dy = y + 0.5 - WR, r = Math.hypot(dx, dy);
        if (r > WR) continue;
        const [R, G, B] = hexRgb(hsv2hex((Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1, Math.min(1, r / (WR - 1)), wV));
        const i = (y * WS + x) * 4; d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = 255;
      }
    }
    wctx.putImageData(img, 0, 0);
    const a = wH * Math.PI * 2, px = WR + Math.cos(a) * wS * (WR - 1), py = WR + Math.sin(a) * wS * (WR - 1);
    wctx.lineWidth = 3; wctx.strokeStyle = '#000'; wctx.beginPath(); wctx.arc(px, py, 8, 0, Math.PI * 2); wctx.stroke();
    wctx.lineWidth = 2; wctx.strokeStyle = '#fff'; wctx.beginPath(); wctx.arc(px, py, 8, 0, Math.PI * 2); wctx.stroke();
  }
  function setCustom(pick) { // pick: vybrat ji i jako aktuální barvu
    customHex = hsv2hex(wH, wS, wV);
    drawWheel();
    $('cval').style.setProperty('--c', hsv2hex(wH, wS, 1));
    const sw = $('swCustom'); sw.style.background = customHex; sw.dataset.hex = customHex;
    $('chex').textContent = customHex.toUpperCase();
    if (pick) { colorIdx = customHex; if (tool === 'eraser') tool = 'pen'; }
    syncTools();
  }
  function wheelPick(e) {
    const r = wheel.getBoundingClientRect();
    const dx = ((e.clientX - r.left) / r.width) * WS - WR, dy = ((e.clientY - r.top) / r.height) * WS - WR;
    wH = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1; wS = Math.min(1, Math.hypot(dx, dy) / (WR - 1));
    setCustom(true);
  }
  wheel.addEventListener('pointerdown', (e) => { e.preventDefault(); wDown = true; try { wheel.setPointerCapture(e.pointerId); } catch (err) { /* nic */ } wheelPick(e); });
  wheel.addEventListener('pointermove', (e) => { if (wDown) { e.preventDefault(); wheelPick(e); } });
  const wUp = () => { wDown = false; };
  wheel.addEventListener('pointerup', wUp); wheel.addEventListener('pointercancel', wUp);
  $('cval').addEventListener('input', (e) => { wV = Math.max(0.05, Math.min(1, Number(e.target.value) / 100)); setCustom(true); });

  const TOOL_BTNS = { pen: 'tPen', eraser: 'tEraser', fill: 'tFill', line: 'tLine', rect: 'tRect', oval: 'tOval' };
  function buildTools() {
    const sws = PAL.map((c, i) => `<button type="button" class="sw${i === colorIdx ? ' on' : ''}" data-c="${i}" style="background:${c}" aria-label="Barva ${i + 1}"></button>`).join('');
    $('pal').innerHTML = sws + '<button type="button" class="sw custom" id="swCustom" aria-label="Vlastní barva"></button><button type="button" class="sw wheelbtn" id="swWheel" aria-label="Barevné kolo" title="Barevné kolo"></button>';
    $('pal').querySelectorAll('.sw[data-c]').forEach((b) => { b.onclick = () => { colorIdx = Number(b.dataset.c); if (tool === 'eraser') tool = 'pen'; syncTools(); }; });
    $('swCustom').onclick = () => { colorIdx = customHex; if (tool === 'eraser') tool = 'pen'; syncTools(); };
    $('swWheel').onclick = () => { const p = $('cpanel'); p.hidden = !p.hidden; $('swWheel').classList.toggle('open', !p.hidden); if (!p.hidden) setCustom(true); };
    $('sizes').innerHTML = SIZES.map((s, i) => `<button type="button" class="sz${i === sizeIdx ? ' on' : ''}" data-s="${i}" aria-label="Tloušťka ${i + 1}"><i style="width:${Math.min(26, s + 4)}px;height:${Math.min(26, s + 4)}px"></i></button>`).join('');
    $('sizes').querySelectorAll('.sz').forEach((b) => { b.onclick = () => { sizeIdx = Number(b.dataset.s); syncTools(); }; });
    for (const [t, id] of Object.entries(TOOL_BTNS)) $(id).onclick = () => { tool = t; syncTools(); };
    $('tShapeFill').onclick = () => { shapeFill = !shapeFill; syncTools(); };
    $('tUndo').onclick = () => { if (!canDraw() || !items.length) return; send({ t: 'd', op: 'u' }); items.pop(); redraw(); };
    $('tClear').onclick = () => { if (!canDraw() || !items.length) return; send({ t: 'd', op: 'x' }); items = []; redraw(); };
    setCustom(false);
  }
  function syncTools() {
    $('pal').querySelectorAll('.sw[data-c]').forEach((b) => b.classList.toggle('on', colorIdx === Number(b.dataset.c) && tool !== 'eraser'));
    $('swCustom').classList.toggle('on', colorIdx === customHex && tool !== 'eraser');
    $('sizes').querySelectorAll('.sz').forEach((b) => b.classList.toggle('on', Number(b.dataset.s) === sizeIdx));
    for (const [t, id] of Object.entries(TOOL_BTNS)) $(id).classList.toggle('on', tool === t);
    $('tShapeFill').classList.toggle('on', shapeFill);
    $('tShapeFill').hidden = !(tool === 'rect' || tool === 'oval');
    $('tShapeFill').textContent = shapeFill ? '◼' : '◻';
    $('tShapeFill').title = shapeFill ? 'Tvar vyplněný (klikni pro obrys)' : 'Tvar jen obrys (klikni pro vyplnění)';
  }

  // ---------------- hra
  function fit() { /* plátno má poměr stran 4:3 z CSS, nic dalšího není potřeba */ }
  function renderGame(prev) {
    const imDrawer = st.drawer === me, ph = st.phase;
    $('roundInfo').innerHTML = `Kolo ${st.round}/${st.rounds}<br>Tah ${Math.min(st.turnNo, st.turnsTotal)}/${st.turnsTotal}`;
    // slovo
    const wb = $('wordBox'); wb.className = 'wordbox';
    const knows = st.word !== null;
    if (ph === 'choose') wb.textContent = imDrawer ? 'Vyber slovo' : `${nameOf(st.drawer)} vybírá slovo…`;
    else if (ph === 'reveal') { wb.classList.add('ok'); wb.innerHTML = `Slovo: <b>${esc(st.word || '')}</b>`; }
    else if (imDrawer) { wb.classList.add('mine'); wb.innerHTML = `Kresli: <b>${esc(st.word || '')}</b>`; }
    else if (knows) { wb.classList.add('ok'); wb.innerHTML = `✔ ${esc(st.word)}`; }
    else if (!st.mask) wb.innerHTML = '<span class="nohint">Hádej, co kreslí…</span>';
    else wb.innerHTML = (st.mask || []).map((ch) => (ch === ' ' ? '<span class="ch sp"></span>' : `<span class="ch${ch !== '_' ? ' got' : ''}">${ch === '_' ? '' : esc(ch)}</span>`)).join('') + `<small>${st.wordLen} písmen</small>`;

    // hráči
    const order = st.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.score - a.p.score || a.i - b.i).map((x) => x.p);
    $('players').innerHTML = order.map((p) => `<div class="pl${p.id === st.drawer && ph !== 'over' ? ' drawing' : ''}${st.guessed.includes(p.id) ? ' ok' : ''}${p.id === me ? ' me' : ''}${p.connected ? '' : ' off'}">${avatarHtml(p)}<span class="info"><span class="nm">${esc(p.name)}</span><span class="sc">${p.score} b.</span></span>${p.id === st.drawer && (ph === 'draw' || ph === 'choose') ? '<span class="bd">✏️</span>' : st.guessed.includes(p.id) ? '<span class="bd">✅</span>' : ''}</div>`).join('');

    // plátno a nástroje
    $('cwrap').classList.toggle('draw', canDraw());
    $('tools').hidden = !(ph === 'draw' && imDrawer);
    const hb = $('hintBtn'), hi = st.hint;
    hb.hidden = !(ph === 'draw' && imDrawer && hi);
    if (!hb.hidden) {
      const next = hi.level >= hi.max ? 'Víc nápověd není' : hi.level === 0 ? 'Prozradit počet písmen' : 'Prozradit náhodné písmeno';
      hb.innerHTML = `💡<small>${hi.level}/${hi.max}</small>`; hb.disabled = hi.level >= hi.max; hb.title = hb.ariaLabel = 'Nápověda: ' + next;
    }
    const ov = $('ov'); ov.className = 'ov';
    if (st.paused) { ov.hidden = false; ov.innerHTML = '<div><h3>⏸ Hra čeká</h3><div class="sub">Někomu spadlo spojení. Hra pokračuje, jakmile se vrátí.</div></div>'; }
    else if (ph === 'choose') {
      ov.hidden = false;
      ov.innerHTML = imDrawer
        ? `<div><h3>Co budeš kreslit?</h3><div class="opts">${(st.options || []).map((o, i) => `<button type="button" class="opt" data-i="${i}">${esc(o)}</button>`).join('')}</div><div class="sub" id="chooseLeft"></div></div>`
        : `<div><h3>✏️ ${esc(nameOf(st.drawer))} vybírá slovo…</h3><div class="sub">Připrav se na hádání!</div></div>`;
      ov.querySelectorAll('.opt').forEach((b) => { b.onclick = () => { send({ t: 'pick', i: Number(b.dataset.i) }); }; });
    } else if (ph === 'reveal' && st.reveal) {
      const r = st.reveal; ov.hidden = false; ov.classList.add('bottom');
      const gains = r.gains.filter((g) => g.pts > 0).sort((a, b) => b.pts - a.pts);
      ov.innerHTML = `<div><div class="sub">${r.reason === 'time' ? 'Čas vypršel' : r.reason === 'all' ? 'Všichni uhádli!' : r.reason === 'left' ? 'Kreslíř odešel' : 'Konec tahu'}</div><div class="big">${esc(r.word)}</div>${gains.length ? `<div class="gains">${gains.map((g) => `<span>${esc(nameOf(g.id))} <b>+${g.pts}</b></span>`).join('')}</div>` : '<div class="sub">Nikdo neuhádl 😢</div>'}</div>`;
    } else ov.hidden = true;

    // chat
    const inp = $('chatInput');
    inp.placeholder = ph === 'draw' && (imDrawer || knows) ? 'Chat (vidí ho jen ti, kdo znají slovo)' : ph === 'draw' ? 'Piš tip…' : 'Napiš do chatu…';
    // mobil: kreslíř při kreslení nepíše (klávesnice by mu zakryla plátno a nástroje); hádající a ostatní píšou normálně
    const lockChat = ph === 'draw' && imDrawer && window.matchMedia('(max-width:899px)').matches;
    if (lockChat) inp.placeholder = 'Kreslíš – chat je vypnutý';
    if (inp.disabled !== lockChat) { inp.disabled = lockChat; $('chatForm').querySelector('button').disabled = lockChat; if (lockChat) { inp.blur(); syncVV(); } }

    // události při změně tahu
    const key = st.code + ':' + st.round + ':' + st.turnNo + ':' + ph;
    if (key !== lastTurnKey) { lastTurnKey = key; if (ph === 'draw' && imDrawer) { sfx.turn(); tool = 'pen'; syncTools(); } }
    $('clock').classList.toggle('low', ph === 'draw' && st.turnMs - (performance.now() - stateAt) < 10000 && st.turnMs > 0);
  }

  // odpočet (hodiny, pruh) a výběr slova
  let lastTick = -1;
  setInterval(() => {
    if (!st) return;
    const el = performance.now() - stateAt;
    if (st.phase === 'draw' && !st.paused) {
      const left = Math.max(0, st.turnMs - el), total = st.drawSec * 1000;
      const sec = Math.ceil(left / 1000);
      $('clockNum').textContent = sec;
      $('timeFill').style.width = Math.min(100, (left / Math.max(total, left)) * 100) + '%';
      $('clock').classList.toggle('low', left < 10000);
      if (sec <= 5 && sec > 0 && sec !== lastTick) { lastTick = sec; sfx.tick(); }
    } else {
      $('clockNum').textContent = st.phase === 'choose' ? '✏️' : '--'; $('timeFill').style.width = st.phase === 'draw' ? $('timeFill').style.width : '0'; $('clock').classList.remove('low');
      const cl = $('chooseLeft'); if (cl && st.phase === 'choose') cl.textContent = `Zbývá ${Math.max(0, Math.ceil((st.chooseMs - el) / 1000))} s – jinak se vybere samo`;
    }
  }, 150);

  function onEvent(ev) {
    if (ev.type === 'guess') { if (ev.by === me) sfx.win(); else sfx.pop(); }
    else if (ev.type === 'turnEnd') sfx.end();
    else if (ev.type === 'hint') sfx.hint();
  }

  // ---------------- chat
  function addChat(m) { chat.push(m); if (chat.length > 80) chat.shift(); renderChat(); }
  function renderChat() {
    const log = $('chatLog');
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.innerHTML = chat.map((m) => {
      const cls = ['m', m.kind === 'chat' ? '' : m.kind, m.vis === 'know' ? 'know' : '', m.pid === me && m.kind === 'chat' ? 'mine' : ''].filter(Boolean).join(' ');
      return m.kind === 'chat' ? `<div class="${cls}"><b>${esc(m.name)}</b>${esc(m.text)}</div>` : `<div class="${cls}">${esc(m.text)}</div>`;
    }).join('');
    if (near) log.scrollTop = log.scrollHeight;
  }

  // ---------------- konec
  function renderOver() {
    const r = st.result;
    const sorted = st.players.slice().sort((a, b) => b.score - a.score);
    $('overTitle').textContent = r.abandoned ? 'Hra skončila' : r.best.length === 1 ? `Vítězí ${nameOf(r.best[0])} 🏆` : r.best.length > 1 ? 'Remíza! 🤝' : 'Konec hry';
    $('overSub').textContent = r.abandoned ? 'Ostatním dlouho nešlo spojení, tak se hra ukončila.' : `Odkreslilo se ${r.turns} obrázků`;
    const top = r.best.length ? sorted.slice(0, 3) : []; // bez bodů se stupně vítězů neukazují
    $('podium').hidden = !top.length;
    const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
    $('podium').innerHTML = order.map((i) => { const p = top[i]; return `<div class="pod p${i + 1}">${avatarHtml(p)}<div class="nm">${esc(p.name)}</div><div class="pt">${p.score} b.</div><div class="bar">${i + 1}</div></div>`; }).join('');
    $('board').innerHTML = sorted.map((p, i) => `<li class="${r.best.includes(p.id) ? 'win' : ''}"><span class="rk">${i + 1}.</span>${avatarHtml(p)}<b>${esc(p.name)}${p.id === me ? ' (ty)' : ''}</b><span class="pts">${p.score} b.</span></li>`).join('');
    const host = st.hostId === me;
    $('again').hidden = !host;
    $('overHint').textContent = host ? 'Hrajeme znovu?' : 'Čekáme, až zakladatel pustí další hru.';
  }

  // Profil (jméno a profilovka z Google účtu). Render po nečinnosti usíná a první dotaz selže, proto se zkouší znovu, dokud server neodpoví.
  let meTries = 0, meTimer = null, meBusy = false;
  async function loadMe() {
    if (meBusy) return; meBusy = true; clearTimeout(meTimer);
    try {
      const r = await fetch(API + '/api/kresleni/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ident()), signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined });
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      meTries = 0;
      if (!j || !j.account) return;
      const box = $('acct');
      box.innerHTML = `${avatarHtml({ avatar: j.avatar, name: j.name, id: 'p1' })}<div><b>${esc(j.name)}</b><small>${j.linked ? 'přihlášen přes Google' : 'bez přihlášení'}</small></div>`;
      box.hidden = false;
      if (j.linked) { $('nameField').hidden = true; $('acctHint').textContent = 'Hraješ pod jménem a profilovkou ze svého účtu.'; }
      else { $('nameField').hidden = false; $('acctHint').textContent = 'Přihlas se přes Google na hlavní stránce a ve hře budeš mít své jméno a profilovku.'; }
    } catch (e) { // server se probouzí: zkusit znovu
      if (++meTries <= 20) meTimer = setTimeout(loadMe, Math.min(5000, 1200 * meTries));
    } finally { meBusy = false; }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadMe(); }); // třeba po přihlášení v jiné záložce

  // ---------------- ovládání
  $('mute').textContent = muted ? '🔇' : '🔊';
  $('mute').onclick = () => { muted = !muted; LS.set('kres_mute', muted ? '1' : '0'); $('mute').textContent = muted ? '🔇' : '🔊'; if (!muted) sfx.pop(); };
  if (CFG.BACK_URL) $('back').href = CFG.BACK_URL;
  clearCanvas(); buildTools();
  $('name').value = LS.get('kres_name') || '';
  const params = new URLSearchParams(location.search);
  if (params.get('room')) $('code').value = params.get('room').toUpperCase().slice(0, 4);
  const getName = () => { const n = $('name').value.trim(); LS.set('kres_name', n); return n || 'Hráč'; };

  $('create').onclick = () => { audio(); setStatus('Připojuji…'); pending = { t: 'create', name: getName(), ...ident() }; connect(); };
  $('joinForm').onsubmit = (e) => {
    e.preventDefault(); audio();
    const code = $('code').value.trim().toUpperCase();
    if (code.length !== 4) { setStatus('Kód má 4 písmena.', true); return; }
    setStatus('Připojuji…'); pending = { t: 'join', code, name: getName(), ...ident() }; connect();
  };
  $('copyLink').onclick = () => {
    const url = location.origin + location.pathname + '?room=' + st.code;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Odkaz zkopírován'), () => toast(url));
  };
  $('cfgRounds').onchange = () => send({ t: 'config', rounds: Number($('cfgRounds').value) });
  $('cfgDraw').onchange = () => send({ t: 'config', drawSec: Number($('cfgDraw').value) });
  $('hintBtn').onclick = () => { if (canDraw()) { audio(); send({ t: 'hint' }); } };
  $('startBtn').onclick = () => { audio(); send({ t: 'start' }); };
  $('again').onclick = () => send({ t: 'again' });
  const leave = () => { send({ t: 'leave' }); wantOpen = false; setTimeout(() => { if (ws) ws.close(); }, 100); leaveLocal(); };
  $('leaveLobby').onclick = leave; $('leaveOver').onclick = leave;
  $('chatForm').onsubmit = (e) => {
    e.preventDefault();
    const t = $('chatInput').value.trim(); if (!t) return;
    send({ t: 'chat', text: t }); $('chatInput').value = '';
  };

  // ---------------- start: obnova relace po obnovení stránky
  loadMe();
  try { const s = JSON.parse(LS.get('kres_session') || 'null'); if (s && s.code && s.token) { session = s; connect(); } else wake(); } catch (e) { wake(); }
})();
