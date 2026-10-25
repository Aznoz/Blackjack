// Vesmírná štvanice – klient (stůl, karty, přetahování, animace, napojení na server).
import { TYPES, CHARS, ROLES, SUITS, rankLabel, charById, isWeapon, MIN_PLAYERS, MAX_PLAYERS } from './data.js?v=2';
import { suitSvg, iconSvg, roleSvg, portraitSvg, botSvg, BACK_SVG } from './art.js?v=1';

const CFG = window.STVANICE_CONFIG || {};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nic */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* nic */ } } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ účet (stejné jako v ostatních hrách Herny)
const API = String(CFG.SERVER_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/stvanice\/?$/, '');
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
const AV_SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
const AVS = [['A', 'S'], ['2', 'H'], ['3', 'D'], ['4', 'C'], ['5', 'S'], ['6', 'H'], ['7', 'D'], ['8', 'C'], ['9', 'S'], ['10', 'H']];
const COLORS = ['#ffb52e', '#6ec8ff', '#7ee08a', '#ff8fb1', '#c59bff', '#ff8a5b', '#5be3b4', '#f0e07a'];
function avatarHtml(p, cls = 'av') {
  if (p.bot) return `<span class="${cls} botav">🤖</span>`;
  const id = p.avatar;
  if (typeof id === 'string' && /^u:[0-9a-f]{16}$/.test(id)) return `<img class="${cls}" src="${API}/avatar/${id.slice(2)}.jpg" alt="" onerror="this.style.visibility='hidden'">`;
  if (typeof id === 'string' && /^a(10|[1-9])$/.test(id)) { const a = AVS[parseInt(id.slice(1), 10) - 1]; return `<span class="${cls} acard${a[1] === 'H' || a[1] === 'D' ? ' red' : ''}"><b>${a[0]}</b><i>${AV_SUIT[a[1]]}</i></span>`; }
  const n = parseInt(String(p.id).replace(/\D/g, ''), 10) || 1;
  return `<span class="${cls}" style="background:${COLORS[n % COLORS.length]}">${esc(String(p.name || '?')[0].toUpperCase())}</span>`;
}

// ------------------------------------------------------------------ zvuk (syntetický)
let muted = LS.get('stvanice_mute') === '1';
let ac = null;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; }
function tone(freq, dur, type = 'square', vol = 0.05, slide = 0, delay = 0) {
  if (muted) return; const a = audio(); if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator(); const g = a.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.03);
}
function noise(dur, vol = 0.2, freq = 1200) {
  if (muted) return; const a = audio(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur); const buf = a.createBuffer(1, n, a.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const s = a.createBufferSource(); const g = a.createGain(); const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  s.buffer = buf; g.gain.value = vol; s.connect(f).connect(g).connect(a.destination); s.start();
}
const sfx = {
  card() { noise(0.09, 0.12, 2400); tone(420, 0.07, 'triangle', 0.04, 200); },
  shot() { tone(1500, 0.22, 'sawtooth', 0.06, -1300); noise(0.12, 0.08, 4000); },
  hit() { noise(0.28, 0.32, 700); tone(120, 0.22, 'sawtooth', 0.09, -60); },
  shield() { tone(880, 0.25, 'sine', 0.07, 400); tone(1320, 0.3, 'sine', 0.04, 0, 0.05); },
  heal() { [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', 0.06, 0, i * 0.08)); },
  death() { tone(300, 0.7, 'sawtooth', 0.09, -250); noise(0.5, 0.25, 500); },
  turn() { tone(660, 0.1, 'triangle', 0.06); tone(990, 0.14, 'triangle', 0.06, 0, 0.09); },
  tick() { tone(1100, 0.03, 'square', 0.03); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.08, 0, i * 0.13)); },
  lose() { [392, 311, 247].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.06, 0, i * 0.18)); },
  boom() { noise(0.7, 0.4, 500); tone(80, 0.6, 'sawtooth', 0.12, -50); },
  err() { tone(180, 0.15, 'sawtooth', 0.05, -60); },
};
function setMute(m) { muted = m; LS.set('stvanice_mute', m ? '1' : '0'); for (const id of ['muteMenu', 'muteGame', 'mutePick']) $(id).textContent = m ? '🔇' : '🔊'; }

// ------------------------------------------------------------------ spojení
let ws = null; let st = null; let G = null; let me = null; let session = null;
let wantOpen = false; let retry = 0; let pending = null;

function toast(t, ms = 3000) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, ms); }
function setStatus(t, err) { const e = $('menuStatus'); e.textContent = t || ''; e.className = 'status' + (err ? ' err' : ''); }
const healthUrl = () => String(CFG.SERVER_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/stvanice\/?$/, '/stvanice/health');

function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  wantOpen = true;
  let sock;
  try { sock = new WebSocket(CFG.SERVER_URL); } catch (e) { setStatus('Špatná adresa serveru.', true); return; }
  ws = sock;
  sock.onopen = () => {
    retry = 0;
    if (pending) { send(pending); pending = null; } else if (session) send({ t: 'resume', code: session.code, token: session.token });
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
function wake() { setStatus('Probouzím server…'); fetch(healthUrl(), { cache: 'no-store' }).then(() => setStatus('')).catch(() => setStatus('')); }

function onMsg(m) {
  switch (m.t) {
    case 'joined': session = { code: m.code, token: m.token }; LS.set('stvanice_session', JSON.stringify(session)); break;
    case 'state': onState(m); break;
    case 'reject': sfx.err(); toast(m.msg); restoreAfterReject(); break;
    case 'err':
      if (m.fatal) { setStatus(m.msg, true); if (m.gone) { session = null; LS.del('stvanice_session'); } leaveLocal(true); wantOpen = false; if (ws) ws.close(); } else toast(m.msg);
      break;
    default:
  }
}

// ------------------------------------------------------------------ obrazovky
function show(id) { for (const s of ['menu', 'lobby', 'pick', 'game']) $(s).hidden = s !== id; if (id !== 'game' && id !== 'pick') window.scrollTo(0, 0); document.body.classList.toggle('ingame', id === 'game' || id === 'pick'); }
function leaveLocal(keepStatus) {
  st = null; G = null; me = null; session = null; lastSeq = null; selected = null; fxQ.length = 0;
  LS.del('stvanice_session'); clearInterval(timerT);
  closeOverlay(); show('menu'); if (!keepStatus) setStatus('');
  history.replaceState(null, '', location.pathname);
}

// ------------------------------------------------------------------ pomocné k datům hry
const meP = () => (G ? G.players.find((p) => p.id === me) : null);
const P = (id) => (G ? G.players.find((p) => p.id === id) : null);
const nameOf = (id) => (P(id) || {}).name || '?';
const typeIndex = Object.fromEntries(Object.keys(TYPES).map((k, i) => [k, i]));
const cardName = (c) => (TYPES[c.type] ? TYPES[c.type].name : c.type);
const isMine = () => !!G && G.prompt && G.prompt.pid === me;

function cardHtml(c, o = {}) {
  const T = TYPES[c.type] || { kind: 'instant', name: c.type };
  const red = SUITS[c.suit] && SUITS[c.suit].red;
  const extra = c.turnsLeft != null ? `<span class="c-jail">${c.turnsLeft}×</span>` : '';
  return `<div class="card kind-${T.kind}${red ? ' red' : ''}${o.cls ? ' ' + o.cls : ''}" data-id="${c.id}" data-type="${c.type}">
    <div class="c-top"><b>${rankLabel(c.rank)}</b>${suitSvg(c.suit)}</div>
    <div class="c-art">${iconSvg(c.type)}</div>
    <div class="c-name">${esc(T.name)}</div>${extra}</div>`;
}
const backHtml = (cls = '') => `<div class="card back ${cls}">${BACK_SVG}</div>`;
function elFromHtml(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

// ------------------------------------------------------------------ menu / lobby
function renderLobby() {
  $('roomCode').textContent = st.code;
  const host = st.hostId === me;
  const humans = st.lobby;
  const total = Math.max(st.total, humans.length);
  const slots = [];
  for (const p of humans) {
    slots.push(`<li class="${p.id === me ? 'me' : ''}">${avatarHtml(p)}<b>${esc(p.name)}</b><small>${p.id === st.hostId ? 'zakladatel' : ''}${p.connected ? '' : ' (odpojen)'}</small>${host && p.id !== me ? `<button class="kick" data-kick="${p.id}" type="button" aria-label="Vyhodit">✕</button>` : ''}</li>`);
  }
  for (let i = humans.length; i < total; i++) slots.push(`<li class="botslot"><span class="av botav">🤖</span><b>Bot</b><small>doplní hru</small></li>`);
  $('lobbyPlayers').innerHTML = slots.join('');
  $('lobbyPlayers').querySelectorAll('[data-kick]').forEach((b) => { b.onclick = () => send({ t: 'kick', id: b.dataset.kick }); });
  $('hostCfg').hidden = !host;
  $('cfgView').hidden = host;
  const SPEED = { pomalu: 'pomalu', normalne: 'normálně', rychle: 'rychle' };
  $('cfgView').textContent = `U stolu ${total} hráčů · čas na tah: ${SPEED[st.speed] || st.speed} · tempo botů: ${SPEED[st.botSpeed] || st.botSpeed || 'normálně'}`;
  const sel = $('cfgTotal');
  if (!sel.options.length) for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) sel.add(new Option(`${n} hráčů`, String(n)));
  if (document.activeElement !== sel) sel.value = String(st.total);
  if (document.activeElement !== $('cfgSpeed')) $('cfgSpeed').value = st.speed;
  if (document.activeElement !== $('cfgBot')) $('cfgBot').value = st.botSpeed || 'normalne';
  const bots = total - humans.length;
  $('lobbyHint').textContent = bots > 0 ? `Hraje ${humans.length} ${humans.length === 1 ? 'člověk' : humans.length < 5 ? 'lidé' : 'lidí'} a ${bots} ${bots === 1 ? 'bot' : bots < 5 ? 'boti' : 'botů'}. Kamarády pozveš kódem nebo odkazem.` : `Hraje ${humans.length} lidí.`;
  if (!host) $('lobbyHint').textContent += ' Čekáme, až zakladatel spustí hru.';
  $('startBtn').hidden = !host;
  history.replaceState(null, '', `?room=${st.code}`);
}

async function loadMe() {
  try {
    const r = await fetch(API + '/api/stvanice/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ident()) });
    const j = await r.json();
    if (!j || !j.account) return;
    const box = $('acct');
    box.innerHTML = `${avatarHtml({ avatar: j.avatar, name: j.name, id: 'p1' })}<div><b>${esc(j.name)}</b><small>${j.linked ? 'přihlášen přes Google' : 'bez přihlášení'}</small></div>`;
    box.hidden = false;
    if (j.linked) { $('nameField').hidden = true; $('acctHint').textContent = 'Hraješ pod jménem a profilovkou ze svého účtu.'; } else $('acctHint').textContent = 'Přihlas se přes Google na hlavní stránce a ve hře budeš mít své jméno a profilovku.';
  } catch (e) { /* server se probouzí */ }
}

// ------------------------------------------------------------------ úvod: výběr rolí a postav
let pickSel = null;
function renderPick(prev) {
  const pk = G.pick; const pr = G.prompt; const mineTurn = !!pr && pr.pid === me;
  const role = pk.kind === 'rolepick';
  if (!prev || prev.pick.kind !== pk.kind) pickSel = null;
  const mine = meP();
  $('pRoom').textContent = `Místnost ${st.code}`;
  $('pPhase').textContent = role ? 'Výběr rolí' : 'Výběr postav';
  $('pTurn').textContent = mineTurn ? '🎯 Vybíráš ty' : (pr ? `Vybírá: ${nameOf(pr.pid)}` : '');
  $('pTurn').classList.toggle('mine', mineTurn);
  $('pickTitle').textContent = role ? 'Vyber si svou roli' : 'Vyber si svou postavu';
  $('pickMsg').textContent = role
    ? (mineTurn ? 'Klepni na jednu z karet rubem nahoru. Svou roli uvidíš jen ty.' : 'Role jsou rubem nahoru. Každý si vezme jednu, uvidí ji jen on sám.')
    : (mineTurn ? 'Klepni na postavu a potvrď výběr. Postavy jsou odkryté všem.' : 'Postavy jsou odkryté všem – vybírá se po směru hodinových ručiček.');
  // pořadí vybírání (po směru hodin od prvního)
  const n = G.players.length;
  const f = Math.max(0, G.players.findIndex((p) => p.id === pk.first));
  const chips = [];
  for (let k = 0; k < n; k++) {
    const p = G.players[(f + k) % n];
    const done = role ? pk.slots.some((s) => s.by === p.id) : pk.chars.some((s) => s.by === p.id);
    const cur = pr && pr.pid === p.id;
    const cap = p.role === 'kapitan' && p.revealed;
    chips.push(`<span class="chip${cur ? ' cur' : ''}${done ? ' done' : ''}${p.id === me ? ' me' : ''}">${k === 0 ? '<i class="first">1.</i>' : ''}${avatarHtml(p, 'av xs')}<b>${esc(p.name)}</b>${cap ? '<em title="Lodní kapitán">⭐</em>' : ''}${done ? '<u>✓</u>' : ''}</span>`);
  }
  $('pickChips').innerHTML = chips.join('<s>›</s>');
  const grid = $('pickGrid'); const act = $('pickAct');
  grid.className = role ? 'roles' : 'chars';
  if (role) {
    act.innerHTML = mine && mine.role ? `<div class="mybox">${roleSvg(mine.role, 'roleico')}<div><b class="rolename r-${mine.role}">${esc(ROLES[mine.role].name)}</b><p>${esc(ROLES[mine.role].text)}</p><p class="muted">Nikomu ji neukazuj. Ostatní si ještě vybírají.</p></div></div>` : '';
    grid.innerHTML = pk.slots.map((s, i) => {
      const taker = s.by ? P(s.by) : null;
      const own = s.by === me;
      const face = own && mine.role ? `<div class="rc-front">${roleSvg(mine.role, 'roleico')}<b class="r-${mine.role}">${esc(ROLES[mine.role].short)}</b></div>` : '<div class="rc-back"><span>?</span></div>';
      return `<button type="button" class="rolecard${s.by ? ' taken' : ''}${own ? ' own flip' : ''}${mineTurn && !s.by ? ' pickable' : ''}" data-slot="${i}" ${mineTurn && !s.by ? '' : 'disabled'} aria-label="Karta role ${i + 1}">${face}${taker ? `<span class="who">${avatarHtml(taker, 'av xs')}${esc(taker.name)}</span>` : ''}</button>`;
    }).join('');
    grid.querySelectorAll('.pickable').forEach((b) => { b.onclick = () => { sfx.card(); send({ t: 'act', a: { slot: Number(b.dataset.slot) } }); }; });
  } else {
    if (mine && mine.role) {
      $('pickMsg').innerHTML += ` Tvoje role: <b class="rolename r-${mine.role}">${esc(ROLES[mine.role].name)}</b>.`;
    }
    grid.innerHTML = pk.chars.map((s) => {
      const ch = charById(s.id); const taker = s.by ? P(s.by) : null;
      const can = mineTurn && !s.by;
      return `<button type="button" class="charcard${s.by ? ' taken' : ''}${can ? ' pickable' : ''}${pickSel === s.id ? ' sel' : ''}" data-char="${s.id}" ${can ? '' : 'disabled'}>
        <div class="cc-art">${portraitSvg(s.id, 'portrait')}</div><b>${esc(ch.name)}</b><span class="cc-life">${'♥'.repeat(ch.lives)}<small>${ch.lives} ${ch.lives === 1 ? 'život' : ch.lives < 5 ? 'životy' : 'životů'}</small></span>
        <p>${esc(ch.text)}</p>${taker ? `<span class="who">${avatarHtml(taker, 'av xs')}${esc(taker.name)}</span>` : ''}</button>`;
    }).join('');
    grid.querySelectorAll('.pickable').forEach((b) => { b.onclick = () => { pickSel = b.dataset.char; sfx.tick(); renderPick(G.pick ? { pick: pk } : null); }; });
    act.innerHTML = mineTurn ? `<button class="btn big" id="pickOkChar" type="button" ${pickSel && pk.chars.some((c) => c.id === pickSel && !c.by) ? '' : 'disabled'}>${pickSel ? 'Vybrat: ' + esc(charById(pickSel).name) : 'Vyber postavu'}</button>` : '';
    const ok = $('pickOkChar'); if (ok) ok.onclick = () => { if (pickSel) { send({ t: 'act', a: { char: pickSel } }); pickSel = null; } };
  }
}

// ------------------------------------------------------------------ jádro vykreslení hry
let selected = null;      // vybraná karta v ruce (klepnutím)
let wildMode = false; let wildPick = [];
let lastSeq = null; let timerT = null; let deadlineLocal = 0; let ttlMax = 0; let lastTick = 0;
let handEls = new Map();
let deferred = null;

function onState(s) {
  const first = !st;
  st = s; me = s.you;
  if (session && s.code !== session.code) session.code = s.code;
  if (s.phase === 'lobby' || !s.game) { G = null; lastSeq = null; renderLobby(); show('lobby'); closeOverlay(); return; }
  if (drag) { deferred = s; return; }
  applyState(s, first);
}

function applyState(s, first) {
  const prevG = G;
  G = s.game;
  if (G.pick) { // úvod: výběr rolí / postav
    show('pick');
    const evs0 = s.events || [];
    if (lastSeq === null) lastSeq = evs0.length ? evs0[evs0.length - 1].seq : 0;
    const fresh0 = evs0.filter((e) => e.seq > lastSeq);
    if (fresh0.length) lastSeq = fresh0[fresh0.length - 1].seq;
    deadlineLocal = s.ttl != null ? Date.now() + s.ttl : 0; ttlMax = s.ttlMax || 0;
    for (const e of fresh0) fxQ.push(e);
    renderPick(prevG && prevG.pick ? prevG : null);
    runFx(); startTimerLoop();
    return;
  }
  show('game');
  // události (animace)
  const evs = s.events || [];
  if (lastSeq === null) lastSeq = evs.length ? evs[evs.length - 1].seq : 0;
  const fresh = evs.filter((e) => e.seq > lastSeq);
  if (fresh.length) lastSeq = fresh[fresh.length - 1].seq;
  deadlineLocal = s.ttl != null ? Date.now() + s.ttl : 0; ttlMax = s.ttlMax || 0;
  renderGame(prevG);
  for (const e of fresh) fxQ.push(e);
  runFx();
  if (G.over) showResult(); else if ($('overlay').dataset.kind === 'result') closeOverlay();
  startTimerLoop();
}
function restoreAfterReject() { if (G) renderGame(G); }

function seatPositions(n) { // n protihráčů v pořadí po směru hodinových ručiček od hráče
  const wide = $('stage').clientWidth > $('stage').clientHeight * 1.15;
  const rx = wide ? 41 : 40; const ry = wide ? 32 : 35; const cy = wide ? 53 : 47;
  const out = [];
  for (let i = 0; i < n; i++) {
    const th = (n === 1 ? 90 : 200 - (220 * (i + 0.5)) / n) * Math.PI / 180;
    out.push({ x: 50 + rx * Math.cos(th), y: cy - ry * Math.sin(th) });
  }
  return out;
}

function lifePips(p, cls = '') {
  const ratio = p.maxLife ? p.life / p.maxLife : 0;
  const col = p.life <= 1 ? 'low' : ratio <= 0.5 ? 'mid' : 'hi';
  let h = '';
  for (let i = 0; i < p.maxLife; i++) h += `<i class="pip ${i < p.life ? 'on ' + col : ''}"></i>`;
  return `<span class="pips ${cls}">${h}</span>`;
}

function ordered() { // všichni hráči od mě po směru hodin
  const mine = meP(); if (!mine) return G.players;
  const n = G.players.length;
  return G.players.slice().sort((a, b) => ((a.seat - mine.seat + n) % n) - ((b.seat - mine.seat + n) % n));
}

function renderGame(prevG) {
  const mine = meP();
  const pr = G.prompt;
  $('roomInfo').textContent = `Místnost ${st.code}`;
  $('deckInfo').textContent = `balíček ${G.deck} · odhoz ${G.discardCount}`;
  // protihráči
  const others = ordered().filter((p) => p.id !== me);
  const pos = seatPositions(others.length);
  $('table').classList.toggle('many', others.length >= 6);
  $('seats').innerHTML = others.map((p, i) => seatHtml(p, pos[i])).join('');
  $('seats').querySelectorAll('.s-av,.s-name').forEach((el) => { el.onclick = (e) => { e.stopPropagation(); const id = el.closest('.seat').dataset.id; if (!tryTapTarget(id)) showPlayerDetail(id); }; });
  $('seats').querySelectorAll('.mini').forEach((el) => { el.onclick = (e) => { e.stopPropagation(); showCardDetail({ id: el.dataset.id, type: el.dataset.type, suit: el.dataset.suit, rank: Number(el.dataset.rank) }); }; });
  // střed
  const top = G.discardTop;
  $('deckPile').innerHTML = `${backHtml('pilecard')}<span class="cnt">${G.deck}</span>`;
  $('discardPile').innerHTML = top ? `${cardHtml(top, { cls: 'pilecard' })}<span class="cnt">${G.discardCount}</span>` : `<div class="pilecard empty"></div>`;
  $('revealed').innerHTML = (G.revealed || []).map((c) => cardHtml(c, { cls: 'mini rev' })).join('');
  renderMine(mine);
  renderBar(mine, pr);
  renderTurnLabel();
  renderLog();
  updateDropHints();
}

function seatHtml(p, pos) {
  const pr = G.prompt;
  const isTurn = G.turn === p.id && !G.over;
  const active = pr && pr.pid === p.id;
  const role = p.role ? roleSvg(p.role, 'roleico') : '';
  const slots = [...p.table, ...p.status].map((c) => cardHtml(c, { cls: 'mini' }).replace('data-id', `data-suit="${c.suit}" data-rank="${c.rank}" data-id`)).join('');
  const dist = p.dist != null && p.alive ? `<span class="s-dist ${p.dist <= G.me.range ? 'in' : 'out'}" title="Vzdálenost od tebe">↔${p.dist}</span>` : '';
  const ch = charById(p.char);
  const tag = !p.alive ? '<span class="s-tag dead">VYŘAZEN</span>' : p.ctrl === 'bot' && !p.bot ? '<span class="s-tag afk">hraje bot</span>' : '';
  const who = p.bot ? '🤖 ' : '';
  return `<div class="seat${isTurn ? ' turn' : ''}${active ? ' active' : ''}${p.alive ? '' : ' dead'}" data-id="${p.id}" style="left:${pos.x}%;top:${pos.y}%">
    <div class="s-av">${p.bot ? portraitSvg(p.char) : portraitSvg(p.char)}<span class="s-role">${p.role ? role : '<b>?</b>'}</span>${p.alive ? `<span class="s-hand">${p.handCount}</span>` : ''}${dist}</div>
    <div class="s-name">${who}${esc(p.name)}</div>
    <div class="s-char">${esc(ch ? ch.name : '')}</div>
    ${p.alive ? lifePips(p) : ''}
    <div class="s-slots">${slots}</div>${tag}</div>`;
}

function sortedHand(p) {
  return p.hand.slice().sort((a, b) => (typeIndex[a.type] - typeIndex[b.type]) || (a.id - b.id));
}

function renderMine(mine) {
  if (!mine) return;
  const pr = G.prompt;
  const ch = charById(mine.char);
  $('mAv').innerHTML = `${portraitSvg(mine.char)}${mine.role ? `<span class="s-role big">${roleSvg(mine.role, 'roleico')}</span>` : ''}`;
  $('mAv').onclick = () => showPlayerDetail(me);
  $('mAv').classList.toggle('turn', G.turn === me && !G.over);
  $('mAv').classList.toggle('dead', !mine.alive);
  $('mInfo').innerHTML = `<div class="mi-name">${avatarHtml(mine, 'av sm')}<b>${esc(mine.name)}</b></div>
    <div class="mi-char">${esc(ch ? ch.name : '')}${mine.role ? ` · <span class="rolename r-${mine.role}">${esc(ROLES[mine.role].short)}</span>` : ''}</div>
    ${lifePips(mine, 'big')}
    <div class="mi-meta">Karty ${mine.hand.length}/${G.me.handLimit} · dostřel ${G.me.range}${G.me.unlimited ? ' · bez limitu střel' : ''}</div>`;
  // vyložené karty + siluety (viditelné jen při držení vykládací karty)
  const slotsN = G.me.slots;
  let sl = '';
  for (let i = 0; i < slotsN; i++) {
    const c = mine.table[i];
    sl += c ? `<div class="slot filled" data-slot="${i}">${cardHtml(c, { cls: 'mini' }).replace('data-id', `data-suit="${c.suit}" data-rank="${c.rank}" data-id`)}</div>` : `<div class="slot empty" data-slot="${i}"><i></i></div>`;
  }
  sl += mine.status.length ? mine.status.map((c) => `<div class="slot filled status">${cardHtml(c, { cls: 'mini' }).replace('data-id', `data-suit="${c.suit}" data-rank="${c.rank}" data-id`)}</div>`).join('') : '<div class="slot empty status" data-slot="status"><i></i></div>';
  $('mSlots').innerHTML = sl;
  $('mSlots').querySelectorAll('.mini').forEach((el) => { el.onclick = (e) => { e.stopPropagation(); showCardDetail({ id: el.dataset.id, type: el.dataset.type, suit: el.dataset.suit, rank: Number(el.dataset.rank) }); }; });
  renderHand(mine, pr);
}

function renderHand(mine, pr) {
  const hand = $('hand');
  const cards = sortedHand(mine);
  const ids = new Set(cards.map((c) => c.id));
  for (const [id, el] of handEls) if (!ids.has(id)) { el.remove(); handEls.delete(id); }
  const myTurnPlay = isMine() && pr.type === 'play';
  let prev = null;
  for (const c of cards) {
    let el = handEls.get(c.id);
    if (!el) { el = elFromHtml(cardHtml(c)); handEls.set(c.id, el); el.classList.add('enter'); setTimeout(() => el.classList.remove('enter'), 400); }
    // pořadí
    if (prev ? prev.nextSibling !== el : hand.firstChild !== el) hand.insertBefore(el, prev ? prev.nextSibling : hand.firstChild);
    prev = el;
    let cls = '';
    if (isMine() && ['respond', 'rescue', 'cell'].includes(pr.type)) cls = pr.usable.includes(c.id) ? 'usable' : 'dim';
    else if (myTurnPlay) { const info = playInfo(c); cls = info.kind === 'none' ? 'dim' : ''; }
    else if (isMine() && pr.type === 'discard') cls = 'usable';
    else if (!isMine()) cls = '';
    el.classList.toggle('usable', cls === 'usable');
    el.classList.toggle('dim', cls === 'dim');
    el.classList.toggle('sel', selected === c.id);
    el.classList.toggle('wild', wildPick.includes(c.id));
    el.dataset.id = c.id;
  }
  // překrývání karet (vějíř), aby se vešly bez posuvníku
  const wrap = $('handWrap');
  const n = cards.length; const cw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw-px')) || el0Width();
  const avail = wrap.clientWidth - 8;
  const ov = n > 1 ? Math.max(-6, Math.min(cw * 0.78, (n * cw - avail) / (n - 1))) : 0;
  hand.style.setProperty('--ov', Math.max(0, ov) + 'px');
  hand.classList.toggle('empty', n === 0);
  if (selected != null && !ids.has(selected)) selected = null;
}
function el0Width() { const e = document.querySelector('#hand .card'); return e ? e.getBoundingClientRect().width : 80; }

function renderTurnLabel() {
  const pr = G.prompt; const t = P(G.turn);
  let s = '';
  if (G.over) s = 'Konec hry';
  else if (pr && pr.pid === me) s = pr.type === 'play' ? '🎯 Tvůj tah' : '⚡ Rozhoduj se';
  else if (t) s = t.id === me ? 'Tvůj tah' : `Na tahu: ${t.name}`;
  $('gturn').textContent = s;
  $('gturn').classList.toggle('mine', !!pr && pr.pid === me);
}

function renderLog() {
  $('logbox').innerHTML = G.log.slice(-5).map((l) => `<div>${esc(l.text)}</div>`).join('');
}

// ------------------------------------------------------------------ prompty a lišta s tlačítky
function describePrompt(pr) {
  const who = nameOf(pr.pid);
  const from = pr.from ? nameOf(pr.from) : '';
  const mineP = pr.pid === me;
  switch (pr.type) {
    case 'play': return mineP ? 'Tvůj tah – přetáhni kartu na cíl nebo doprostřed. Střela ukončuje tah, zahraj ji nakonec.' : `${who} zvažuje tah…`;
    case 'respond': {
      if (!mineP) return `${who} reaguje…`;
      if (pr.cause === 'shot') return `${from} na tebe střílí! Zahraj Energický štít${pr.need > 1 ? ` (potřeba ${pr.need}×)` : ''}, nebo přijmi zásah.`;
      if (pr.cause === 'duel') return `Duel proti ${from}: odhoď Vesmírnou střelu, nebo ztratíš život.`;
      if (pr.cause === 'zaloha') return `Bandití záloha od ${from}! Odhoď Vesmírnou střelu, jinak ztratíš život.`;
      return `Laserové přepadení od ${from}! Odhoď Energický štít, jinak ztratíš život.`;
    }
    case 'rescue': return mineP ? 'Umíráš! Zahraj Pilulku nebo Foukačku a zůstaneš ve hře.' : `${who} se zachraňuje před smrtí…`;
    case 'cell': return mineP ? `Jsi ve vesmírné cele (zbývá ${pr.turnsLeft} ${pr.turnsLeft === 1 ? 'tah' : 'tahy'}). Odhoď Vesmírnou střelu a utečeš, jinak tah vynecháš.` : `${who} sedí v cele…`;
    case 'discard': return mineP ? `Máš moc karet – odhoď ještě ${pr.count}. (Klepni na kartu.)` : `${who} odhazuje karty…`;
    case 'rolepick': return mineP ? 'Vyber si kartu role.' : `${who} si vybírá roli…`;
    case 'charpick': return mineP ? 'Vyber si postavu.' : `${who} si vybírá postavu…`;
    case 'pick': return mineP ? 'Vyber si kartu.' : `${who} vybírá kartu…`;
    case 'drawsrc': return mineP ? 'Odkud si vezmeš první kartu?' : `${who} vybírá, odkud líznout…`;
    default: return '';
  }
}

function renderBar(mine, pr) {
  const btns = [];
  let text = G.over ? 'Hra skončila.' : pr ? describePrompt(pr) : '';
  if (selected != null && isMine() && pr.type === 'play') {
    const c = mine.hand.find((x) => x.id === selected);
    if (c) text = `${cardName(c)}: ${TYPES[c.type].text}`;
  }
  if (isMine() && !G.over) {
    if (pr.type === 'play') {
      if (mine.char === 'fwild' && mine.life < mine.maxLife && mine.hand.length >= 2) btns.push(`<button class="btn small ghost" id="bWild" type="button">${wildMode ? 'Zrušit léčení' : '❤ Za 2 karty +1 život'}</button>`);
      btns.push('<button class="btn small" id="bEnd" type="button">Konec tahu</button>');
    } else if (pr.type === 'respond') btns.push(`<button class="btn small danger" id="bPass" type="button">${pr.cause === 'shot' || pr.cause === 'duel' ? 'Přijmout zásah' : 'Ztratit život'}</button>`);
    else if (pr.type === 'rescue') btns.push('<button class="btn small danger" id="bPass" type="button">Nechat to být</button>');
    else if (pr.type === 'cell') btns.push('<button class="btn small" id="bStay" type="button">Zůstat v cele</button>');
    if (wildMode) text = `Vyber 2 karty k odhození (${wildPick.length}/2).`;
  }
  $('barText').textContent = text;
  $('barBtns').innerHTML = btns.join('');
  const b = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  b('bEnd', () => { selected = null; wildMode = false; wildPick = []; send({ t: 'act', a: { act: 'end' } }); });
  b('bPass', () => send({ t: 'act', a: { pass: true } }));
  b('bStay', () => send({ t: 'act', a: { escape: false } }));
  b('bWild', () => { wildMode = !wildMode; wildPick = []; selected = null; renderGame(G); });
  // modální výběry
  if (isMine() && !G.over) {
    if (pr.type === 'pick') openPick(pr); else if (pr.type === 'drawsrc') openSource(pr); else if (['pick', 'drawsrc'].includes($('overlay').dataset.kind)) closeOverlay();
  } else if (['pick', 'drawsrc'].includes($('overlay').dataset.kind)) closeOverlay();
}

// časovač rozhodnutí
function startTimerLoop() {
  clearInterval(timerT);
  const tick = () => {
    const left = deadlineLocal ? Math.max(0, deadlineLocal - Date.now()) : 0;
    const f = $(G.pick ? 'pTimerFill' : 'timerFill');
    if (!deadlineLocal || !ttlMax || G.over) { f.style.width = '0'; return; }
    f.style.width = `${(left / ttlMax) * 100}%`;
    const mineT = isMine();
    f.className = left < 8000 ? (mineT ? 'low mine' : 'low') : mineT ? 'mine' : '';
    if (mineT && left > 0 && left < 6000 && Math.ceil(left / 1000) !== lastTick) { lastTick = Math.ceil(left / 1000); sfx.tick(); }
  };
  tick(); timerT = setInterval(tick, 150);
}

// ------------------------------------------------------------------ jak se která karta hraje
function playInfo(c) {
  const mine = meP(); const O = G.players.filter((q) => q.alive && q.id !== me);
  const shot = c.type === 'strela' || (mine.char === 'mjohnson' && c.type === 'stit');
  if (shot) return { kind: 'target', ok: O.filter((q) => q.dist != null && q.dist <= G.me.range).map((q) => q.id), why: 'Mimo dostřel' };
  switch (c.type) {
    case 'stit': return { kind: 'none', why: 'Energický štít se hraje až jako odpověď na výstřel.' };
    case 'pilulka': return mine.life < mine.maxLife ? { kind: 'center' } : { kind: 'none', why: 'Máš plné životy.' };
    case 'foukacka': return { kind: 'target', ok: G.players.filter((q) => q.alive && q.life < q.maxLife).map((q) => q.id), why: 'Má plné životy' };
    case 'kantyna': return G.players.some((q) => q.alive && q.life < q.maxLife) ? { kind: 'center' } : { kind: 'none', why: 'Všichni mají plné životy.' };
    case 'sklad': case 'cerna_dira': case 'zaloha': case 'prepadeni': case 'stanice': return { kind: 'center' };
    case 'varovny': return { kind: 'target', ok: O.filter((q) => q.dist === 1 && (q.handCount > 0 || q.table.length || q.status.length)).map((q) => q.id), why: 'Jen na vzdálenost 1' };
    case 'dezintegrator': return { kind: 'target', ok: G.players.filter((q) => q.alive && (q.id === me ? (q.table.length || q.status.length) : (q.handCount > 0 || q.table.length || q.status.length))).map((q) => q.id), why: 'Nemá co zničit' };
    case 'duel': return { kind: 'target', ok: O.map((q) => q.id), why: '' };
    case 'cela': return { kind: 'target', ok: O.filter((q) => q.role !== 'kapitan' && q.char !== 'trash' && !q.status.some((x) => x.type === 'cela')).map((q) => q.id), why: 'Do cely ho nezavřeš' };
    case 'vynalez': return mine.status.some((x) => x.type === 'vynalez') ? { kind: 'none', why: 'Vynález zkázy už máš.' } : { kind: 'slot', status: true };
    default: return TYPES[c.type] && TYPES[c.type].kind === 'equip' ? { kind: 'slot' } : { kind: 'none', why: '' };
  }
}

// ------------------------------------------------------------------ přetahování a klepání
let drag = null;
const handEl = () => $('hand');

function cardById(id) { const m = meP(); return m ? m.hand.find((c) => c.id === Number(id)) : null; }

function onHandDown(e) {
  const el = e.target.closest('.card'); if (!el || !G || G.over) return;
  const c = cardById(el.dataset.id); if (!c) return;
  audio();
  drag = { id: c.id, el, sx: e.clientX, sy: e.clientY, started: false, pointer: e.pointerId, ghost: null, over: null };
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* nic */ }
}
function onMove(e) {
  if (!drag || e.pointerId !== drag.pointer) return;
  const dx = e.clientX - drag.sx; const dy = e.clientY - drag.sy;
  if (!drag.started) {
    if (Math.hypot(dx, dy) < 9) return;
    startDrag(e);
  }
  moveGhost(e);
}
function startDrag(e) {
  const c = cardById(drag.id);
  const pr = G.prompt;
  drag.started = true;
  drag.card = c;
  drag.mode = dragMode(c);
  const r = drag.el.getBoundingClientRect();
  const g = drag.el.cloneNode(true);
  g.classList.add('ghost'); g.classList.remove('sel', 'usable', 'dim', 'enter');
  g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
  document.body.appendChild(g);
  drag.ghost = g; drag.gw = r.width; drag.gh = r.height;
  drag.el.classList.add('dragging');
  document.body.classList.add('dragging-card');
  markTargets();
}
function moveGhost(e) {
  const g = drag.ghost;
  g.style.transform = `translate(${e.clientX - drag.gw / 2}px, ${e.clientY - drag.gh * 0.7}px) rotate(${Math.max(-12, Math.min(12, (e.clientX - drag.sx) / 14))}deg) scale(1.08)`;
  const t = dropTargetAt(e.clientX, e.clientY);
  const key = t ? t.kind + ':' + (t.id ?? '') : '';
  if (key !== drag.over) {
    document.querySelectorAll('.hover-drop').forEach((x) => x.classList.remove('hover-drop'));
    drag.over = key;
    if (t && t.el && t.valid) t.el.classList.add('hover-drop');
  }
}
function onUp(e) {
  if (!drag || e.pointerId !== drag.pointer) return;
  const t = drag.started ? dropTargetAt(e.clientX, e.clientY) : null;
  const d = drag; drag = null;
  document.body.classList.remove('dragging-card');
  if (d.ghost) d.ghost.remove();
  d.el.classList.remove('dragging');
  document.querySelectorAll('.hover-drop,.tgt-ok,.tgt-no,.show-slots').forEach((x) => x.classList.remove('hover-drop', 'tgt-ok', 'tgt-no', 'show-slots'));
  $('table').classList.remove('dragging-center'); $('mine').classList.remove('show-slots');
  if (!d.started) { tapCard(d.id); } else {
    dropCard(d.card, t, e.clientX, e.clientY);
  }
  if (deferred) { const s = deferred; deferred = null; applyState(s, false); }
}
function onCancel(e) { if (drag && e.pointerId === drag.pointer) { if (drag.ghost) drag.ghost.remove(); drag.el.classList.remove('dragging'); drag = null; document.body.classList.remove('dragging-card'); document.querySelectorAll('.tgt-ok,.tgt-no,.hover-drop').forEach((x) => x.classList.remove('tgt-ok', 'tgt-no', 'hover-drop')); $('mine').classList.remove('show-slots'); if (deferred) { const s = deferred; deferred = null; applyState(s, false); } } }

/** Co se s kartou dá dělat právě teď (podle promptu). */
function dragMode(c) {
  const pr = G.prompt;
  if (!pr || pr.pid !== me) return { kind: 'none', why: 'Teď nejsi na řadě.' };
  if (pr.type === 'play') return playInfo(c);
  if (['respond', 'rescue', 'cell'].includes(pr.type)) return pr.usable.includes(c.id) ? { kind: 'center', special: pr.type } : { kind: 'none', why: 'Tuhle kartu teď použít nejde.' };
  if (pr.type === 'discard') return { kind: 'center', special: 'discard' };
  return { kind: 'none', why: '' };
}

function markTargets() {
  const m = drag.mode;
  document.querySelectorAll('.seat').forEach((s) => s.classList.remove('tgt-ok', 'tgt-no'));
  $('mAv').classList.remove('tgt-ok', 'tgt-no');
  if (m.kind === 'target') {
    for (const p of G.players) {
      if (!p.alive) continue;
      const el = p.id === me ? $('mAv') : document.querySelector(`.seat[data-id="${p.id}"]`);
      if (!el) continue;
      el.classList.add(m.ok.includes(p.id) ? 'tgt-ok' : 'tgt-no');
    }
  } else if (m.kind === 'center') $('table').classList.add('dragging-center');
  else if (m.kind === 'slot') $('mine').classList.add('show-slots');
}

function dropTargetAt(x, y) {
  const m = drag && drag.mode; if (!m) return null;
  const el = document.elementFromPoint(x, y); if (!el) return null;
  if (m.kind === 'target') {
    const seat = el.closest('.seat'); const mine = el.closest('#mAv');
    const id = seat ? seat.dataset.id : mine ? me : null;
    if (id) return { kind: 'player', id, el: seat || mine, valid: m.ok.includes(id), why: m.why };
    return null;
  }
  if (m.kind === 'slot') {
    const slot = el.closest('.slot');
    if (slot) return { kind: 'slot', id: slot.dataset.slot, el: slot, valid: m.status ? slot.dataset.slot === 'status' : slot.dataset.slot !== 'status' };
    return null;
  }
  if (m.kind === 'center') {
    if (el.closest('#handWrap')) return null; // zpátky do ruky = zrušit
    if (el.closest('#table') || el.closest('#stage')) return { kind: 'center', el: $('center'), valid: true };
    return null;
  }
  return null;
}

function dropCard(c, t, x, y) {
  const m = dragMode(c);
  lastDrop = { x, y };
  if (m.kind === 'none') { if (m.why) toast(m.why); sfx.err(); return; }
  if (!t) return; // zrušeno
  if (t.valid === false) { toast(m.why || 'Sem to nejde.'); sfx.err(); return; }
  const pr = G.prompt;
  if (m.special === 'discard') return void send({ t: 'act', a: { cardId: c.id } });
  if (m.special === 'respond' || m.special === 'rescue') return void send({ t: 'act', a: { cardId: c.id } });
  if (m.special === 'cell') return void send({ t: 'act', a: { escape: true, cardId: c.id } });
  if (m.kind === 'target') return playOnTarget(c, t.id);
  if (m.kind === 'slot') {
    const mine = meP();
    const a = { act: 'play', cardId: c.id };
    if (!m.status) { const idx = Number(t.id); const occupied = mine.table[idx]; if (occupied) a.replaceId = occupied.id; }
    return void send({ t: 'act', a });
  }
  if (m.kind === 'center') return void send({ t: 'act', a: { act: 'play', cardId: c.id } });
}
let lastDrop = null;

function playOnTarget(c, targetId) {
  const tp = P(targetId);
  if (c.type === 'varovny' || c.type === 'dezintegrator') {
    const choices = [];
    if (targetId !== me && tp.handCount > 0) choices.push({ zone: 'hand', label: `Náhodná karta z ruky (${tp.handCount})` });
    for (const x of [...tp.table, ...tp.status]) choices.push({ zone: 'table', card: x });
    if (!choices.length) { toast('Není co vzít.'); return; }
    if (choices.length === 1) return void sendTargeted(c, targetId, choices[0]);
    openChooser(c, tp, choices);
    return;
  }
  send({ t: 'act', a: { act: 'play', cardId: c.id, target: targetId } });
}
function sendTargeted(c, targetId, ch) {
  const a = { act: 'play', cardId: c.id, target: targetId, tzone: ch.zone };
  if (ch.zone === 'table') a.tcard = ch.card.id;
  send({ t: 'act', a });
}

function tapCard(id) {
  const c = cardById(id); if (!c) return;
  const pr = G.prompt;
  if (wildMode && isMine() && pr.type === 'play') {
    wildPick = wildPick.includes(id) ? wildPick.filter((x) => x !== id) : [...wildPick, id].slice(-2);
    if (wildPick.length === 2) { send({ t: 'act', a: { act: 'wild', cardIds: wildPick } }); wildMode = false; wildPick = []; }
    return renderGame(G);
  }
  const m = dragMode(c);
  if (isMine() && ['respond', 'rescue', 'cell', 'discard'].includes(pr.type)) {
    if (m.kind === 'none') { toast(m.why); sfx.err(); return; }
    return dropCard(c, { kind: 'center', valid: true }, 0, 0);
  }
  // hlavní fáze: první klepnutí vybere (zvýrazní cíle), druhé klepnutí na kartu zahraje, pokud nepotřebuje cíl
  if (selected === id) {
    if (m.kind === 'center') return void send({ t: 'act', a: { act: 'play', cardId: c.id } });
    if (m.kind === 'slot') { const mine = meP(); const a = { act: 'play', cardId: c.id }; if (!m.status && mine.table.length >= G.me.slots) { toast('Máš plno vyložených karet – přetáhni kartu na tu, kterou chceš nahradit.'); return; } return void send({ t: 'act', a }); }
    selected = null; return renderGame(G);
  }
  selected = id;
  if (m.kind === 'none' && m.why) toast(m.why);
  renderGame(G);
  highlightSelected(m);
}
function highlightSelected(m) {
  document.querySelectorAll('.tgt-ok,.tgt-no').forEach((x) => x.classList.remove('tgt-ok', 'tgt-no'));
  $('mine').classList.toggle('show-slots', m.kind === 'slot');
  if (m.kind === 'target') {
    for (const p of G.players) {
      if (!p.alive) continue;
      const el = p.id === me ? $('mAv') : document.querySelector(`.seat[data-id="${p.id}"]`);
      if (el) el.classList.add(m.ok.includes(p.id) ? 'tgt-ok' : 'tgt-no');
    }
  }
}
/** Klepnutí na protihráče, když je vybraná karta. Vrací true, pokud se klepnutí použilo. */
function tryTapTarget(id) {
  if (selected == null || !G || !isMine() || G.prompt.type !== 'play') return false;
  const c = cardById(selected); if (!c) return false;
  const m = playInfo(c);
  if (m.kind !== 'target') return false;
  if (!m.ok.includes(id)) { toast(m.why || 'Sem to nejde.'); sfx.err(); return true; }
  selected = null;
  playOnTarget(c, id);
  return true;
}
function updateDropHints() {
  if (selected != null && G && isMine() && G.prompt.type === 'play') {
    const c = cardById(selected);
    if (c) highlightSelected(playInfo(c));
  }
}

// tap na vlastní portrét jako cíl (foukačka/Dezintegrátor na sebe…)
function tapMine() { if (!tryTapTarget(me)) showPlayerDetail(me); }

// ------------------------------------------------------------------ překryvy (výběry, detail)
function closeOverlay() { const o = $('overlay'); o.hidden = true; o.innerHTML = ''; o.dataset.kind = ''; }
function openOverlay(kind, html, cls = '') {
  const o = $('overlay'); o.dataset.kind = kind; o.className = cls; o.innerHTML = html; o.hidden = false;
}
function openPick(pr) {
  if ($('overlay').dataset.kind === 'pick' && $('overlay').dataset.sig === JSON.stringify(pr.cards.map((c) => c.id))) return;
  const titles = { underpost: 'Podívej se na vrchní tři karty a vyber si dvě', jjohnson: 'Vyber si jednu ze dvou karet (druhá se zahodí)', stanice: 'Vesmírná stanice – vyber si kartu', blackjack: 'Black Jack – vyber si jednu vyloženou kartu' };
  const picks = [];
  openOverlay('pick', `<div class="modal"><h3>${esc(titles[pr.reason] || 'Vyber kartu')}</h3><div class="pickrow">${pr.cards.map((c) => cardHtml(c, { cls: 'big' })).join('')}</div>${pr.count === 2 ? '<button class="btn" id="pickOk" type="button" disabled>Potvrdit výběr</button>' : ''}</div>`, 'dim');
  $('overlay').dataset.sig = JSON.stringify(pr.cards.map((c) => c.id));
  $('overlay').querySelectorAll('.card').forEach((el) => {
    el.onclick = () => {
      const id = Number(el.dataset.id);
      if (pr.count === 2) {
        const i = picks.indexOf(id); if (i >= 0) picks.splice(i, 1); else if (picks.length < 2) picks.push(id);
        $('overlay').querySelectorAll('.card').forEach((x) => x.classList.toggle('sel', picks.includes(Number(x.dataset.id))));
        $('pickOk').disabled = picks.length !== 2;
      } else { send({ t: 'act', a: { pick: id } }); closeOverlay(); }
    };
  });
  const ok = $('pickOk'); if (ok) ok.onclick = () => { send({ t: 'act', a: { picks: picks.slice() } }); closeOverlay(); };
}
function openSource(pr) {
  const o = pr.options;
  let h = '<div class="modal"><h3>Odkud si vezmeš první kartu?</h3><div class="srcrow">';
  h += '<button class="btn" data-src="deck" type="button">Z balíčku</button>';
  for (const x of o) {
    if (x.src === 'discard') h += `<div class="srcopt"><button class="btn ghost" data-src="discard" type="button">Z odhazovacího balíčku</button>${cardHtml(x.card, { cls: 'mini' })}</div>`;
    if (x.src === 'hand') h += `<div class="srcopt"><span>Z ruky hráče:</span>${x.targets.map((id) => `<button class="btn ghost" data-src="hand" data-pid="${id}" type="button">${esc(nameOf(id))} (${P(id).handCount})</button>`).join('')}</div>`;
    if (x.src === 'table') h += `<div class="srcopt"><span>Vyložená karta:</span>${x.targets.map((t) => t.cards.map((c) => `<button class="srccard" data-src="table" data-pid="${t.pid}" data-card="${c.id}" type="button">${cardHtml(c, { cls: 'mini' })}<small>${esc(nameOf(t.pid))}</small></button>`).join('')).join('')}</div>`;
  }
  h += '</div></div>';
  if ($('overlay').dataset.kind === 'drawsrc') return;
  openOverlay('drawsrc', h, 'dim');
  $('overlay').querySelectorAll('[data-src]').forEach((b) => {
    b.onclick = () => {
      const a = { src: b.dataset.src };
      if (b.dataset.pid) a.pid = b.dataset.pid;
      if (b.dataset.card) a.cardId = Number(b.dataset.card);
      send({ t: 'act', a }); closeOverlay();
    };
  });
}
function openChooser(c, tp, choices) {
  const h = `<div class="modal"><h3>${esc(cardName(c))} → ${esc(tp.name)}</h3><p class="muted">Co chceš ${c.type === 'varovny' ? 'vzít' : 'zničit'}?</p><div class="srcrow">${choices.map((ch, i) => (ch.zone === 'hand' ? `<button class="btn ghost" data-i="${i}" type="button">${esc(ch.label)}</button>` : `<button class="srccard" data-i="${i}" type="button">${cardHtml(ch.card, { cls: 'big' })}</button>`)).join('')}</div><button class="link" id="chCancel" type="button">Zrušit</button></div>`;
  openOverlay('chooser', h, 'dim');
  $('overlay').querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { sendTargeted(c, tp.id, choices[Number(b.dataset.i)]); closeOverlay(); }; });
  $('chCancel').onclick = closeOverlay;
}
function showCardDetail(c) {
  const T = TYPES[c.type]; if (!T) return;
  openOverlay('detail', `<div class="modal small">${cardHtml(c, { cls: 'big' })}<h3>${esc(T.name)}</h3><p>${esc(T.text)}</p><button class="btn small" id="dClose" type="button">Zavřít</button></div>`, 'dim');
  $('dClose').onclick = closeOverlay; $('overlay').onclick = (e) => { if (e.target === $('overlay')) closeOverlay(); };
}
function showPlayerDetail(id) {
  const p = P(id); if (!p) return;
  const ch = charById(p.char);
  const role = p.role ? ROLES[p.role] : null;
  openOverlay('detail', `<div class="modal small"><div class="pd-av">${portraitSvg(p.char, 'portrait lg')}</div><h3>${esc(ch.name)}</h3><p class="muted">${esc(p.name)}${p.bot ? ' (bot)' : ''} · ${p.maxLife} životů</p><p>${esc(ch.text)}</p>${role ? `<div class="pd-role">${roleSvg(p.role, 'roleico lg')}<div><b>${esc(role.name)}</b><p>${esc(role.text)}</p></div></div>` : '<p class="muted">Role je tajná.</p>'}<button class="btn small" id="dClose" type="button">Zavřít</button></div>`, 'dim');
  $('dClose').onclick = closeOverlay; $('overlay').onclick = (e) => { if (e.target === $('overlay')) closeOverlay(); };
}

// ------------------------------------------------------------------ animace událostí
const fxQ = []; let fxBusy = false;
async function runFx() {
  if (fxBusy) return; fxBusy = true;
  while (fxQ.length) {
    const e = fxQ.shift();
    try { await playEvent(e); } catch (err) { /* animace nikdy nesmí shodit hru */ }
  }
  fxBusy = false;
}
function rectOf(id) {
  let el = null;
  if (id === me) el = $('mAv'); else el = document.querySelector(`.seat[data-id="${id}"] .s-av`);
  if (!el) return null;
  const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}
const centerPoint = () => { const r = $('center').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const deckPoint = () => { const r = $('deckPile').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
function cardPx() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw-fly')) || 64; }

function fly(c, from, to, o = {}) {
  if (!from || !to) return Promise.resolve();
  const el = elFromHtml(c ? cardHtml(c, { cls: 'fly' }) : backHtml('fly'));
  const w = o.w || cardPx();
  el.style.setProperty('--cw', w + 'px');
  $('fx').appendChild(el);
  const h = w * 1.4;
  const a = el.animate([
    { transform: `translate(${from.x - w / 2}px, ${from.y - h / 2}px) scale(${o.s0 ?? 0.8}) rotate(${o.r0 ?? -6}deg)`, opacity: 0.2 },
    { transform: `translate(${from.x - w / 2}px, ${from.y - h / 2}px) scale(1) rotate(0deg)`, opacity: 1, offset: 0.12 },
    { transform: `translate(${to.x - w / 2}px, ${to.y - h / 2}px) scale(${o.s1 ?? 0.9}) rotate(${o.r1 ?? 4}deg)`, opacity: 1, offset: 0.82 },
    { transform: `translate(${to.x - w / 2}px, ${to.y - h / 2}px) scale(${(o.s1 ?? 0.9) * 0.9}) rotate(${o.r1 ?? 4}deg)`, opacity: 0 },
  ], { duration: o.dur || 560, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
  return a.finished.then(() => el.remove(), () => el.remove());
}
function floater(id, text, cls) {
  const r = rectOf(id); if (!r) return;
  const d = document.createElement('div'); d.className = 'floater ' + cls; d.textContent = text;
  d.style.left = r.x + 'px'; d.style.top = (r.y - r.h * 0.2) + 'px';
  $('fx').appendChild(d); setTimeout(() => d.remove(), 1500);
}
function shake(id) {
  const el = id === me ? $('mAv') : document.querySelector(`.seat[data-id="${id}"] .s-av`);
  if (!el) return;
  el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 600);
}
function screenFlash(col) {
  const f = $('flash'); f.style.background = col; f.hidden = false; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); setTimeout(() => { f.hidden = true; }, 450);
}
let playShowT = null;
function playShow(card, who, to, note) {
  let b = $('playShow');
  if (!b) { b = document.createElement('div'); b.id = 'playShow'; $('stage').appendChild(b); }
  const T = TYPES[card.type] || { name: card.type, text: '' };
  b.innerHTML = `<div class="ps-card">${cardHtml(card, { cls: 'big' })}</div><div class="ps-cap"><b>${esc(who)}</b>${to ? ` <i>→</i> <b>${esc(to)}</b>` : ''}<span>${esc(note || T.name)}</span><small>${esc(T.text)}</small></div>`;
  b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  clearTimeout(playShowT); playShowT = setTimeout(() => { b.hidden = true; }, 2600);
}
function flipShow(card, caption) {
  const b = $('flipShow'); b.innerHTML = cardHtml(card, { cls: 'big' }) + `<div class="cap">${esc(caption)}</div>`; b.hidden = false;
  setTimeout(() => { b.hidden = true; }, 1300);
}

async function playEvent(e) {
  switch (e.type) {
    case 'turn': if (e.pid === me) { sfx.turn(); if (navigator.vibrate) try { navigator.vibrate(60); } catch (x) { /* nic */ } } break;
    case 'play': {
      const from = e.by === me && lastDrop && lastDrop.x ? lastDrop : rectOf(e.by);
      lastDrop = null;
      const isShot = (e.card.type === 'strela') || e.as === 'strela';
      const to = e.to && e.to !== e.by ? rectOf(e.to) : centerPoint();
      const tn = e.to && e.to !== e.by ? nameOf(e.to) : '';
      if (e.defend) { sfx.shield(); playShow(e.card, nameOf(e.by), tn, 'brání se: ' + cardName(e.card)); await fly(e.card, rectOf(e.by), centerPoint(), { dur: 520 }); await sleep(500); break; }
      if (isShot) sfx.shot(); else sfx.card();
      playShow(e.card, nameOf(e.by), tn, e.rescue ? 'záchrana: ' + cardName(e.card) : e.duel ? 'duel: odhazuje ' + cardName(e.card) : isShot && e.card.type !== 'strela' ? 'střílí (' + cardName(e.card) + ')' : cardName(e.card));
      await fly(e.card, from, to || centerPoint(), { dur: isShot ? 460 : 560 });
      await sleep(isShot ? 350 : 500);
      break;
    }
    case 'equip': { sfx.card(); const to = e.to ? rectOf(e.to) : rectOf(e.by); playShow(e.card, nameOf(e.by), e.to && e.to !== e.by ? nameOf(e.to) : '', e.to && e.to !== e.by ? cardName(e.card) + ' (pokládá před soupeře)' : 'vykládá: ' + cardName(e.card)); await fly(e.card, rectOf(e.by), to, { dur: 520 }); await sleep(450); break; }
    case 'damage': {
      sfx.hit(); shake(e.to); floater(e.to, `−${e.n}`, 'dmg');
      if (e.to === me) { screenFlash('rgba(255,50,80,.35)'); if (navigator.vibrate) try { navigator.vibrate([120, 40, 160]); } catch (x) { /* nic */ } }
      await sleep(260); break;
    }
    case 'heal': sfx.heal(); floater(e.pid, `+${e.n}`, 'heal'); await sleep(160); break;
    case 'miss': floater(e.to, 'MIMO!', 'miss'); sfx.shield(); await sleep(200); break;
    case 'barrel': floater(e.pid, 'Štěstí!', 'miss'); sfx.shield(); await sleep(150); break;
    case 'flip': {
      const c = e.card;
      let cap = 'Losování';
      if (e.why === 'vynalez') cap = c.suit === 'pulsar' && c.rank >= 2 && c.rank <= 9 ? 'Vynález zkázy: VÝBUCH!' : 'Vynález zkázy: nevybuchl';
      else cap = c.suit === 'nova' ? 'Nova – střela mine!' : 'Žádná Nova – střela míří dál';
      flipShow(c, cap); await sleep(700); break;
    }
    case 'draw': {
      const n = Math.min(e.n || 1, 3);
      for (let i = 0; i < n; i++) { fly(null, deckPoint(), e.pid === me ? { x: $('hand').getBoundingClientRect().left + $('hand').clientWidth / 2, y: $('hand').getBoundingClientRect().top + 40 } : rectOf(e.pid), { dur: 380, s1: 0.8 }); await sleep(90); }
      break;
    }
    case 'steal': { sfx.card(); fly(e.card || null, rectOf(e.from), rectOf(e.by), { dur: 460 }); await sleep(120); break; }
    case 'destroy': { sfx.hit(); fly(e.card || null, rectOf(e.from), centerPoint(), { dur: 420 }); await sleep(120); break; }
    case 'loot': { fly(null, rectOf(e.from), rectOf(e.by), { dur: 460 }); await sleep(100); break; }
    case 'pass-status': { fly(e.card, rectOf(e.from), rectOf(e.to), { dur: 460 }); await sleep(100); break; }
    case 'explode': sfx.boom(); screenFlash('rgba(255,160,40,.45)'); shake(e.pid); await sleep(200); break;
    case 'escape': floater(e.pid, 'UTEKL!', 'miss'); sfx.shot(); break;
    case 'jailed': floater(e.pid, 'V cele', 'dmg'); break;
    case 'revive': sfx.heal(); floater(e.pid, 'Přežila!', 'heal'); break;
    case 'penalty': floater(e.pid, 'Ztrácí karty', 'dmg'); break;
    case 'death': {
      sfx.death();
      const p = P(e.pid);
      const b = document.createElement('div'); b.className = 'deathbanner';
      b.innerHTML = `<div>${roleSvg(e.role, 'roleico lg')}</div><b>${esc(p ? p.name : '?')} je vyřazen!</b><span>${esc(ROLES[e.role].name)}</span>`;
      $('fx').appendChild(b); setTimeout(() => b.remove(), 2300);
      if (e.pid === me && navigator.vibrate) try { navigator.vibrate([200, 80, 300]); } catch (x) { /* nic */ }
      await sleep(700); break;
    }
    case 'station': sfx.card(); break;
    case 'rolepick': case 'charpick': sfx.card(); break;
    case 'captain': sfx.turn(); break;
    case 'deal': sfx.card(); break;
    default:
  }
}

// ------------------------------------------------------------------ konec hry
function showResult() {
  if ($('overlay').dataset.kind === 'result') return;
  const r = G.result;
  const iWon = r.winners.includes(me);
  const winRole = { kapitan: 'Kapitán a pravé ruce', bandita: 'Vesmírní bandité', zabijak: 'Nájemný zabiják', sebevrah: 'Sebevrah', silenec: 'Pomatený šílenec' }[r.outcome];
  const rows = ordered().map((p) => {
    const won = r.winners.includes(p.id);
    return `<li class="${won ? 'win' : ''}${p.alive ? '' : ' dead'}"><div class="rp">${portraitSvg(p.char, 'portrait sm')}</div><div class="rn"><b>${esc(p.name)}${p.id === me ? ' (ty)' : ''}</b><small>${esc(charById(p.char).name)}</small></div><div class="rr">${roleSvg(p.role, 'roleico sm')}<span>${esc(ROLES[p.role].short)}</span></div><div class="rs">${won ? '🏆' : ''}${p.role === 'silenec' && p.dmg != null ? `<small>${p.dmg}/10</small>` : ''}</div></li>`;
  }).join('');
  const host = st.hostId === me;
  openOverlay('result', `<div class="modal result ${iWon ? 'won' : 'lost'}"><div class="rtitle">${iWon ? '🏆 Vyhrál jsi!' : 'Prohrál jsi'}</div><h3>${esc(r.text)}</h3><p class="muted">Vítězí: ${esc(winRole)}</p><ul class="rlist">${rows}</ul>${host ? '<button class="btn big" id="again" type="button">Hrát znovu</button>' : '<p class="muted">Čekáme, až zakladatel pustí další hru.</p>'}<button class="btn ghost wide" id="leaveOver" type="button">Odejít</button></div>`, 'dim');
  if (iWon) sfx.win(); else sfx.lose();
  const a = $('again'); if (a) a.onclick = () => { closeOverlay(); send({ t: 'again' }); };
  $('leaveOver').onclick = leave;
}

// ------------------------------------------------------------------ nápověda
function showHelp(tab = 'rules') {
  const tabs = { rules: 'Pravidla', roles: 'Role', chars: 'Postavy', cards: 'Karty' };
  const body = {
    rules: `<ol class="rules">
      <li><b>Cíl hry</b> závisí na tvé tajné roli. Jedinou veřejnou rolí je Lodní kapitán (má o 1 život víc).</li>
      <li>Hraje se po směru hodinových ručiček, začíná Kapitán. Na začátku tahu si <b>lízneš 2 karty</b>, pak hraješ libovolně karet.</li>
      <li><b>Vesmírná střela ukončuje tah</b> – zahraj ji jako poslední (výjimka: Frankie Blackhole a Krátký kulomet). Střílí se jen na hráče na dostřel (základ je 1, zbraně ho zvětšují).</li>
      <li>Střele se vyhneš kartou <b>Energický štít</b>, jinak ztratíš život. Bez životů jsi vyřazen (a tvoje role se odhalí).</li>
      <li>Kdo hráče vyřadí, <b>vezme si všechny jeho karty</b>. Kapitán, který omylem zabije svou pravou ruku, ztrácí všechny karty.</li>
      <li>Na konci tahu smíš mít v ruce nejvýš tolik karet, kolik máš životů.</li>
      <li>Vyložit před sebe smíš max. 2 karty (Isabella Belt 3) – zbraně, Teleportér, Harpunu, Opasek. Vesmírná cela a Vynález zkázy mají své vlastní místo.</li>
      <li><b>Vzdálenost</b> = nejkratší cesta kolem stolu mezi živými hráči. Teleportér ostatní vzdaluje od tebe, Harpuna přibližuje tebe k ostatním.</li>
      <li>Při smrtelném zásahu můžeš ještě zahrát <b>Pilulku</b> (nebo Foukačku) a zůstat ve hře.</li>
      <li>Ovládání: karty <b>přetahuj</b> na cíl (hráče), doprostřed stolu, nebo – u vykládacích karet – do siluet nad rukou. Klepnutí na kartu ji vybere a ukáže cíle.</li>
    </ol>`,
    roles: Object.entries(ROLES).map(([k, r]) => `<div class="hrow">${roleSvg(k, 'roleico lg')}<div><b>${esc(r.name)}</b><p>${esc(r.text)}</p></div></div>`).join('') +
      `<p class="muted">Na začátku hry leží na stole tolik karet rolí rubem nahoru, kolik je hráčů. Každý si jednu vezme (začíná náhodný hráč, pak po směru hodin) a uvidí ji jen on. Vždy je mezi nimi Kapitán, bandita, Zabiják a jedna z rolí Sebevrah / Šílenec (náhodně). Další hráči přidávají: 5 = pravá ruka · 6 = druhý bandita · 7 = druhá pravá ruka · 8 = druhá z rolí Sebevrah / Šílenec. Pak se z odkrytých postav vybírá stejným způsobem.</p>`,
    chars: CHARS.map((c) => `<div class="hrow">${portraitSvg(c.id, 'portrait sm')}<div><b>${esc(c.name)}</b> <small>${c.lives} ${c.lives === 1 ? 'život' : c.lives < 5 ? 'životy' : 'životů'}</small><p>${esc(c.text)}</p></div></div>`).join(''),
    cards: Object.entries(TYPES).map(([k, t]) => `<div class="hrow">${iconSvg(k, 'icon sm')}<div><b>${esc(t.name)}</b> <small>${t.kind === 'instant' ? 'zahraje se' : t.kind === 'equip' ? 'vykládací' : 'stavová'} · ${t.count}×</small><p>${esc(t.text)}</p></div></div>`).join('') +
      `<div class="suits">${Object.entries(SUITS).map(([k, s]) => `<span>${suitSvg(k, 'suit big')}${s.name}</span>`).join('')}<p class="muted">Barvy mají význam u losování: <b>Nova</b> a <b>Kometa</b> jsou červené, <b>Pulsar</b> a <b>Asteroid</b> černé. Opasek a John Doe se zachrání Novou, Vynález zkázy exploduje při Pulsaru 2–9.</p></div>`,
  };
  const h = $('help');
  h.innerHTML = `<div class="hbox"><div class="htop"><b>Vesmírná štvanice</b><button class="icon" id="hClose" type="button" aria-label="Zavřít">✕</button></div><div class="htabs">${Object.entries(tabs).map(([k, n]) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div><div class="hbody">${body[tab]}</div></div>`;
  h.hidden = false;
  $('hClose').onclick = () => { h.hidden = true; };
  h.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => showHelp(b.dataset.tab); });
}

// ------------------------------------------------------------------ ovládání
function leave() { send({ t: 'leave' }); wantOpen = false; setTimeout(() => { if (ws) ws.close(); }, 100); leaveLocal(); }

function init() {
  setMute(muted);
  for (const id of ['muteMenu', 'muteGame', 'mutePick']) $(id).onclick = () => { setMute(!muted); if (!muted) sfx.card(); };
  if (CFG.BACK_URL) $('back').href = CFG.BACK_URL;
  $('heroArt').innerHTML = ['kapitan', 'ruka', 'bandita', 'zabijak', 'sebevrah', 'silenec'].map((r) => roleSvg(r, 'roleico hero')).join('');
  $('name').value = LS.get('stvanice_name') || '';
  const params = new URLSearchParams(location.search);
  if (params.get('room')) $('code').value = params.get('room').toUpperCase().slice(0, 4);
  const getName = () => { const n = $('name').value.trim(); LS.set('stvanice_name', n); return n || 'Hráč'; };
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
  $('cfgTotal').onchange = () => send({ t: 'config', total: Number($('cfgTotal').value) });
  $('cfgSpeed').onchange = () => send({ t: 'config', speed: $('cfgSpeed').value });
  $('cfgBot').onchange = () => send({ t: 'config', botSpeed: $('cfgBot').value });
  $('startBtn').onclick = () => { audio(); send({ t: 'start' }); };
  $('leaveLobby').onclick = leave;
  $('leaveGame').onclick = () => { if (confirm('Opravdu odejít ze hry? Za tebe bude hrát bot.')) leave(); };
  $('leavePick').onclick = () => { if (confirm('Opravdu odejít ze hry? Za tebe bude hrát bot.')) leave(); };
  for (const id of ['helpMenu', 'helpLobby', 'helpGame', 'helpPick']) $(id).onclick = () => showHelp();
  $('help').onclick = (e) => { if (e.target === $('help')) $('help').hidden = true; };
  const hand = $('hand');
  hand.addEventListener('pointerdown', onHandDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  $('mAv').addEventListener('click', tapMine);
  $('stage').addEventListener('click', (e) => { if (selected != null && !e.target.closest('.seat') && !e.target.closest('#mAv')) { const c = cardById(selected); if (c && playInfo(c).kind === 'center') { const id = selected; selected = null; send({ t: 'act', a: { act: 'play', cardId: id } }); } } });
  window.addEventListener('resize', () => { if (G && !G.pick && !drag) renderGame(G); });
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('.card')) e.preventDefault(); });
  loadMe();
  try { const s = JSON.parse(LS.get('stvanice_session') || 'null'); if (s && s.code && s.token) { session = s; connect(); } else wake(); } catch (e) { wake(); }
}
init();
