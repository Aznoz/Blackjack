(() => {
  'use strict';
  const CFG = window.BOMBA_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const COLORS = ['#ffb52e', '#6ec8ff', '#7ee08a', '#ff8fb1', '#c59bff', '#ff8a5b'];
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nic */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* nic */ } } };

  const API = String(CFG.SERVER_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/bomba\/?$/, '');
  let memToken = null, acct = null;
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
  const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const AVS = [['A', 'S'], ['2', 'H'], ['3', 'D'], ['4', 'C'], ['5', 'S'], ['6', 'H'], ['7', 'D'], ['8', 'C'], ['9', 'S'], ['10', 'H']];
  /** Profilovka z účtu na Herně (karta nebo nahraný obrázek); host bez účtu dostane barevné písmeno. */
  function avatarHtml(p) {
    const id = p.avatar;
    if (typeof id === 'string' && /^u:[0-9a-f]{16}$/.test(id)) return `<img class="av" src="${API}/avatar/${id.slice(2)}.jpg" alt="" onerror="this.style.visibility='hidden'">`;
    if (typeof id === 'string' && /^a(10|[1-9])$/.test(id)) { const a = AVS[parseInt(id.slice(1), 10) - 1]; return `<span class="av card${a[1] === 'H' || a[1] === 'D' ? ' red' : ''}"><b>${a[0]}</b><i>${SUIT[a[1]]}</i></span>`; }
    return `<span class="av" style="background:${color(p.id)}">${esc(String(p.name || '?')[0].toUpperCase())}</span>`;
  }
  const TEAM = { A: { name: 'Červení', col: '#e8452c' }, B: { name: 'Modří', col: '#4aa3ff' } };
  let ws = null, st = null, me = null, session = null, seenEv = 0, wantOpen = false, retry = 0, pending = null, lastPhase = null;
  let muted = LS.get('bomba_mute') === '1';

  // ---------------- zvuk (syntetický, bez souborů)
  let ac = null;
  function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; }
  function tone(freq, dur, type = 'square', vol = 0.06, slide = 0) {
    if (muted) return; const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur + 0.02);
  }
  function noise(dur, vol = 0.3) {
    if (muted) return; const a = audio(); if (!a) return;
    const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    s.buffer = buf; g.gain.value = vol; s.connect(f).connect(g).connect(a.destination); s.start();
  }
  const sfx = {
    pass() { tone(520, .09, 'triangle', .08, 500); },
    bad() { tone(160, .22, 'sawtooth', .07, -60); },
    boom() { noise(1.1, .5); tone(90, .7, 'sawtooth', .12, -60); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .18, 'triangle', .09), i * 130)); },
    round() { tone(330, .08, 'triangle', .07); setTimeout(() => tone(440, .1, 'triangle', .07), 90); },
  };
  let tickT = null, tickN = 0, roundStart = 0;
  function tickLoop() {
    clearTimeout(tickT);
    if (!st || st.phase !== 'round') return;
    tone(tickN++ % 2 ? 1250 : 1000, .035, 'square', .035);
    tickT = setTimeout(tickLoop, 620);
  }

  // ---------------- spojení
  function toast(t) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, 3200); }
  function setStatus(t, err) { const e = $('menuStatus'); e.textContent = t || ''; e.className = 'status' + (err ? ' err' : ''); }
  function healthUrl() { return String(CFG.SERVER_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/bomba\/?$/, '/bomba/health'); }

  function connect(first) {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    wantOpen = true;
    let sock;
    try { sock = new WebSocket(CFG.SERVER_URL); } catch (e) { setStatus('Špatná adresa serveru.', true); return; }
    ws = sock;
    sock.onopen = () => {
      retry = 0;
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
      setTimeout(() => connect(false), Math.min(4000, 800 * retry));
    };
    sock.onerror = () => {};
  }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); else { pending = o; connect(); } }

  function wake() { // Render po nečinnosti usíná; pár vteřin se probouzí
    setStatus('Probouzím server…');
    fetch(healthUrl(), { cache: 'no-store' }).then(() => setStatus('')).catch(() => setStatus(''));
  }

  function onMsg(m) {
    switch (m.t) {
      case 'joined': session = { code: m.code, token: m.token }; me = m.you; LS.set('bomba_session', JSON.stringify(session)); break;
      case 'state': onState(m); break;
      case 'reject': { sfx.bad(); showMsg(m.msg); $('word').select(); break; }
      case 'err':
        if (m.fatal) { setStatus(m.msg, true); if (m.gone) { session = null; LS.del('bomba_session'); } leaveLocal(true); wantOpen = false; if (ws) ws.close(); }
        else toast(m.msg);
        break;
      default:
    }
  }
  function showMsg(t) { $('msg').textContent = t || ''; clearTimeout(showMsg.t); if (t) showMsg.t = setTimeout(() => { $('msg').textContent = ''; }, 3200); }

  // ---------------- obrazovky
  function show(id) { for (const s of ['menu', 'lobby', 'game', 'over']) $(s).hidden = s !== id; window.scrollTo(0, 0); }
  function leaveLocal(keepStatus) {
    st = null; me = null; session = null; seenEv = 0; lastPhase = null; LS.del('bomba_session'); clearTimeout(tickT);
    show('menu'); if (!keepStatus) setStatus('');
    history.replaceState(null, '', location.pathname);
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const idx = (id) => st.players.findIndex((p) => p.id === id);
  const color = (id) => COLORS[(parseInt(String(id).slice(1), 10) - 1 + COLORS.length) % COLORS.length];
  const nameOf = (id) => (st.players.find((p) => p.id === id) || {}).name || '?';
  const LEVEL = { lehka: 'Lehká', normalni: 'Normální', tezka: 'Těžká' };

  function onState(s) {
    const prev = st; st = s; me = s.you;
    if (session && s.code !== session.code) session.code = s.code;
    const phaseChanged = !prev || prev.phase !== s.phase;
    if (s.phase === 'lobby') { renderLobby(); show('lobby'); }
    else if (s.phase === 'over') { renderOver(); if (phaseChanged) { show('over'); sfx.win(); } }
    else { if (phaseChanged || $('game').hidden) show('game'); renderGame(prev); }
    if (s.ev && s.ev.id > seenEv) { const first = seenEv === 0; seenEv = s.ev.id; if (!first) onEvent(s.ev); }
    lastPhase = s.phase;
  }

  // ---------------- lobby
  function renderLobby() {
    $('roomCode').textContent = st.code;
    const host = st.hostId === me;
    const teams = st.mode === 'teams';
    const n = st.players.filter((p) => p.connected).length;
    const row = (p) => `<li class="${p.id === me ? 'me' : ''}">${avatarHtml(p)}<b>${esc(p.name)}</b><small>${p.id === st.hostId ? 'zakladatel' : ''}${p.connected ? '' : ' (odpojen)'}</small></li>`;
    $('lobbyPlayers').hidden = teams;
    $('lobbyPlayers').innerHTML = st.players.map(row).join('');
    $('teamsBox').hidden = !teams;
    if (teams) {
      const half = n / 2; const cnt = { A: 0, B: 0 };
      st.players.forEach((p) => { if (p.team) cnt[p.team]++; });
      const meP = st.players.find((p) => p.id === me);
      $('teamsBox').innerHTML = ['A', 'B'].map((t) => `<div class="teamcol t${t}"><h3><span>${TEAM[t].name}</span><span>${cnt[t]}/${half}</span></h3><ul>${st.players.filter((p) => p.team === t).map((p) => `<li>${avatarHtml(p)}<span>${esc(p.name)}${p.id === me ? ' (ty)' : ''}</span></li>`).join('')}</ul>${meP && meP.team !== t ? `<button class="btn" type="button" data-team="${t}">Přejít k týmu</button>` : ''}</div>`).join('') +
        (cnt.A !== cnt.B ? `<div class="teamwarn">Týmy musí mít stejně hráčů (${half} a ${half}).</div>` : '');
      $('teamsBox').querySelectorAll('[data-team]').forEach((b) => { b.onclick = () => send({ t: 'team', team: b.dataset.team }); });
    }
    $('hostCfg').hidden = !host;
    $('cfgView').hidden = host;
    $('cfgView').textContent = `Kol: ${st.rounds} · Obtížnost: ${LEVEL[st.level]} · ${teams ? 'Týmy' : 'Každý sám za sebe'} · Bomba: ${st.fuseMin}–${st.fuseMax} s`;
    if (document.activeElement !== $('cfgFuseMin')) $('cfgFuseMin').value = st.fuseMin;
    if (document.activeElement !== $('cfgFuseMax')) $('cfgFuseMax').value = st.fuseMax;
    if (document.activeElement !== $('cfgRounds')) $('cfgRounds').value = String(st.rounds);
    if (document.activeElement !== $('cfgLevel')) $('cfgLevel').value = st.level;
    $('modeLbl').hidden = !st.canTeams;
    $('cfgMode').value = st.wantTeams && st.canTeams ? 'teams' : 'ffa';
    const balanced = !teams || st.players.filter((p) => p.team === 'A').length === n / 2;
    $('startBtn').hidden = !host; $('startBtn').disabled = n < 2 || !balanced;
    $('lobbyHint').textContent = n < 2 ? 'Počkej na aspoň jednoho dalšího hráče – pošli mu kód nebo odkaz (hraje se 2–6 lidí).'
      : (n === 4 || n === 6) ? (teams ? `Hrajete ${n / 2}v${n / 2}. Každý si vybere tým.` : `Můžete hrát každý sám, nebo ${n / 2}v${n / 2} v týmech${host ? ' (změň režim nahoře)' : ''}.`)
      : 'Hraje se každý sám za sebe (týmy jsou jen pro 4 nebo 6 hráčů).';
    if (n >= 2 && !host) $('lobbyHint').textContent += ' Čekáme, až zakladatel spustí hru.';
    history.replaceState(null, '', `?room=${st.code}`);
  }

  // ---------------- hra
  function seatPos(i, n) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: 50 + 40 * Math.cos(a), y: 50 + 41 * Math.sin(a) };
  }
  function renderGame(prev) {
    const n = st.players.length, myI = Math.max(0, idx(me));
    $('roundInfo').textContent = `Kolo ${st.round} / ${st.rounds}`;
    $('roomInfo').textContent = `Místnost ${st.code}`;
    if (!prev || prev.combo !== st.combo || prev.round !== st.round) {
      $('comboText').textContent = st.combo || '--';
      const c = $('combo'); c.classList.remove('flip'); void c.offsetWidth; c.classList.add('flip');
    }
    $('seats').innerHTML = st.players.map((p, i) => {
      const pos = seatPos((i - myI + n) % n, n);
      return `<div class="seat${p.id === st.holder && st.phase === 'round' ? ' hold' : ''}${p.id === me ? ' me' : ''}${p.connected ? '' : ' off'}${p.team ? ' t' + p.team : ''}" data-id="${p.id}" style="left:${pos.x}%;top:${pos.y}%">
        ${avatarHtml(p)}
        <div class="nm">${p.team ? `<span class="tg t${p.team}"></span>` : ''}${esc(p.name)}</div>
        <div class="cards">${p.cards.map((c) => `<i>${esc(c)}</i>`).join('')}</div></div>`;
    }).join('');
    moveBomb();
    $('feed').innerHTML = st.words.map((w) => `<span class="${w.bad ? 'bad' : ''}">${esc(w.word)}</span>`).join('');

    const mine = st.phase === 'round' && st.holder === me;
    const boom = st.phase === 'boom';
    $('turn').className = 'turn' + (mine ? ' mine' : '');
    const hp = st.players.find((p) => p.id === st.holder);
    let tinfo = '';
    if (st.mode === 'teams' && hp && st.phase === 'round') {
      const size = st.players.filter((p) => p.team === hp.team && p.connected).length;
      tinfo = ` (${TEAM[hp.team].name}: ${Math.min(size, st.turnDone.length + 1)}/${size})`;
    }
    $('turn').textContent = boom ? '💥 BUM!' : mine ? `Máš bombu! Slovo se „${st.combo}“${tinfo}` : `Bombu má ${nameOf(st.holder)}${tinfo}`;
    $('teamHud').textContent = st.mode === 'teams' ? ['A', 'B'].map((t) => `${TEAM[t].name} ${st.players.filter((p) => p.team === t).reduce((n, p) => n + p.cards.length, 0)}`).join(' : ') : '';
    $('wordForm').hidden = !mine;
    if (mine && (!prev || prev.holder !== me || prev.phase !== 'round')) { $('word').value = ''; setTimeout(() => { try { $('word').focus(); } catch (e) { /* nic */ } }, 60); }
    const ch = $('challenge');
    const can = st.phase === 'round' && st.last && st.last.by !== me;
    ch.hidden = !can;
    if (can) { ch.textContent = `✋ „${st.last.word}“ není slovo (${st.last.votes}/${st.last.needed})`; ch.disabled = st.last.voted; }
    if (st.phase === 'round' && (!prev || prev.phase !== 'round' || prev.round !== st.round)) { roundStart = Date.now(); tickN = 0; tickLoop(); }
    if (st.phase !== 'round') clearTimeout(tickT);
  }
  function seatEl(id) { return document.querySelector(`.seat[data-id="${id}"]`); }
  function moveBomb() {
    const b = $('bomb'); const s = seatEl(st.holder);
    if (!s || st.phase === 'boom') { if (st.phase !== 'boom') { b.style.left = '50%'; b.style.top = '50%'; } return; }
    const x = parseFloat(s.style.left), y = parseFloat(s.style.top);
    b.style.left = (50 + (x - 50) * 0.5) + '%'; b.style.top = (50 + (y - 50) * 0.5 + 4) + '%';
  }
  function bubble(id, text, bad) {
    const s = seatEl(id); if (!s) return;
    const d = document.createElement('div'); d.className = 'bubble' + (bad ? ' bad' : ''); d.textContent = text;
    d.style.left = s.style.left; d.style.top = `calc(${s.style.top} - 30px)`;
    $('stage').appendChild(d); setTimeout(() => d.remove(), 2000);
  }
  function onEvent(ev) {
    if (ev.type === 'pass') { sfx.pass(); bubble(ev.from, ev.word); }
    else if (ev.type === 'rejected') { sfx.bad(); bubble(ev.by, ev.word, true); toast(`Slovo „${ev.word}“ bylo zamítnuto. Bomba jde zpět na ${nameOf(ev.to)}.`); }
    else if (ev.type === 'round') sfx.round();
    else if (ev.type === 'boom') {
      sfx.boom(); clearTimeout(tickT);
      const s = seatEl(ev.loser), b = $('bomb');
      if (s) { b.style.left = s.style.left; b.style.top = s.style.top; }
      const fx = $('boomfx'); fx.innerHTML = '<div>💥</div>'; fx.hidden = false;
      const st2 = $('stage'); st2.classList.remove('shake'); void st2.offsetWidth; st2.classList.add('shake');
      const fl = document.createElement('div'); fl.className = 'flash'; document.body.appendChild(fl); setTimeout(() => fl.remove(), 600);
      setTimeout(() => { fx.hidden = true; }, 1000);
      $('turn').textContent = `💥 BUM! ${nameOf(ev.loser)} bere kartu „${ev.combo}“`;
      if (navigator.vibrate) { try { navigator.vibrate(ev.loser === me ? [200, 80, 300] : 80); } catch (e) { /* nic */ } }
    }
  }

  // ---------------- konec
  function renderOver() {
    const r = st.result; const win = r.winners; const iWon = win.includes(me);
    const allWin = win.length === st.players.length;
    if (r.mode === 'teams') {
      $('overTitle').textContent = r.winnerTeams.length === 2 ? `Remíza! (${r.teamScores.A} : ${r.teamScores.B})` : `Vítězí tým ${TEAM[r.winnerTeams[0]].name} (${r.teamScores[r.winnerTeams[0]]} : ${r.teamScores[r.winnerTeams[0] === 'A' ? 'B' : 'A']})`;
    } else $('overTitle').textContent = allWin ? 'Remíza!' : win.length > 1 ? 'Vítězí: ' + win.map(nameOf).join(', ') : `Vítěz: ${nameOf(win[0])} 🏆`;
    const sorted = st.players.slice().sort((a, b) => a.cards.length - b.cards.length);
    $('board').innerHTML = sorted.map((p) => `<li class="${win.includes(p.id) ? 'win' : ''}${p.team ? ' t' + p.team : ''}">${avatarHtml(p)}<b>${esc(p.name)}${p.id === me ? ' (ty)' : ''}</b><span class="cs">${p.cards.map((c) => `<i>${esc(c)}</i>`).join('') || '<small>bez karet</small>'}</span></li>`).join('');
    const d = r.coins && r.coins[me];
    const cl = $('coinLine');
    if (d) { cl.textContent = `${d > 0 ? '+' : '−'}${Math.abs(d)} 🪙${st.balance != null ? ` · zůstatek ${Number(st.balance).toLocaleString('cs-CZ')}` : ''}`; cl.className = 'coinline ' + (d > 0 ? 'plus' : 'minus'); }
    else { cl.textContent = ''; cl.className = 'coinline'; }
    const host = st.hostId === me;
    $('again').hidden = !host;
    $('overHint').textContent = host ? (iWon ? 'Gratulace! Hrajeme znovu?' : 'Hrajeme znovu?') : 'Čekáme, až zakladatel pustí další hru.';
  }

  async function loadMe() {
    try {
      const r = await fetch(API + '/api/bomba/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ident()) });
      const j = await r.json();
      if (!j || !j.account) return;
      acct = j;
      const box = $('acct');
      box.innerHTML = `${avatarHtml({ avatar: j.avatar, name: j.name, id: 'p1' })}<div><b>${esc(j.name)}</b><small>${j.linked ? 'přihlášen přes Google' : 'bez přihlášení'}</small></div><div class="bal">🪙 ${Number(j.balance).toLocaleString('cs-CZ')}</div>`;
      box.hidden = false;
      if (j.linked) { $('nameField').hidden = true; $('acctHint').textContent = 'Hraješ pod jménem a profilovkou ze svého účtu. Výhra +500 🪙, prohra −250 🪙.'; }
      else $('acctHint').textContent = 'Přihlas se přes Google na hlavní stránce a ve hře budeš mít své jméno a profilovku. Výhra +500 🪙, prohra −250 🪙.';
    } catch (e) { /* server se probouzí */ }
  }

  // ---------------- ovládání
  $('mute').textContent = muted ? '🔇' : '🔊';
  $('mute').onclick = () => { muted = !muted; LS.set('bomba_mute', muted ? '1' : '0'); $('mute').textContent = muted ? '🔇' : '🔊'; if (!muted) sfx.pass(); };
  if (CFG.BACK_URL) $('back').href = CFG.BACK_URL;
  $('name').value = LS.get('bomba_name') || '';
  const params = new URLSearchParams(location.search);
  if (params.get('room')) $('code').value = params.get('room').toUpperCase().slice(0, 4);
  const getName = () => { const n = $('name').value.trim(); LS.set('bomba_name', n); return n || 'Hráč'; };

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
  $('cfgMode').onchange = () => send({ t: 'config', teams: $('cfgMode').value === 'teams' });
  const sendFuse = () => {
    const lo = Math.round(Number($('cfgFuseMin').value)), hi = Math.round(Number($('cfgFuseMax').value));
    if (!(lo > 0) || !(hi > 0)) { $('cfgFuseMin').value = st.fuseMin; $('cfgFuseMax').value = st.fuseMax; return; }
    if (lo < 6 || hi > 45) toast('Čas může být jen od 6 do 45 sekund.');
    send({ t: 'config', fuseMin: lo, fuseMax: hi });
  };
  $('cfgFuseMin').onchange = sendFuse; $('cfgFuseMax').onchange = sendFuse;
  $('cfgLevel').onchange = () => send({ t: 'config', level: $('cfgLevel').value });
  $('startBtn').onclick = () => { audio(); send({ t: 'start' }); };
  $('again').onclick = () => send({ t: 'again' });
  const leave = () => { send({ t: 'leave' }); wantOpen = false; setTimeout(() => { if (ws) ws.close(); }, 100); leaveLocal(); };
  $('leaveLobby').onclick = leave; $('leaveOver').onclick = leave;
  $('wordForm').onsubmit = (e) => {
    e.preventDefault();
    const w = $('word').value.trim(); if (!w) return;
    send({ t: 'word', word: w }); $('word').value = ''; $('word').focus();
  };
  $('challenge').onclick = () => send({ t: 'challenge' });

  // ---------------- start: obnova relace po obnovení stránky
  loadMe();
  try { const s = JSON.parse(LS.get('bomba_session') || 'null'); if (s && s.code && s.token) { session = s; connect(true); } else wake(); } catch (e) { wake(); }
})();
