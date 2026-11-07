// BOMBIC – klient: menu, čekárna, hřiště na canvasu (les, pařezy, bomby, plameny, předměty), ovládání klávesnicí i dotykem, boti i online.
// Simulaci počítá server, klient dostává snímky (20× za sekundu) a mezi nimi plynule dopočítává pohyb (zpoždění ~100 ms).
import * as K from './shared.js';
import { drawTile, drawItem, drawBomb, drawFlame, drawWarn, drawPlayer, portraitURL, itemURL } from './art.js';
import { startScene, stopScene } from './scene.js';
const { COLS, ROWS, SKINS } = K;

const CFG = window.BOMBIC_CONFIG || {};
const $ = (id) => document.getElementById(id);
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nic */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* nic */ } } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const API = String(CFG.SERVER_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/bombic\/?$/, '');
const DELAY = 100;                                                   // ms: o tolik se vykresluje za skutečností kvůli plynulosti
const BOT_LEVELS = [[1, 'Nováček', 'Chodí nahodile a často udělá chybu.'], [2, 'Bojovník', 'Uhýbá bombám, rozbíjí sudy a loví soupeře.'], [3, 'Mistr', 'Rychlý a přesný, počítá řetězové výbuchy.']];
const REASON = { time: 'Čas vypršel.', draw: 'Všichni padli zároveň.', last: 'Zbyl poslední bombič.', forfeit: 'Soupeři odešli.' };
const CURSE_BY_CODE = [null, 'slow', 'fast', 'nobomb', 'auto', 'short'];
const svgSpeaker = (off) => `<svg class="svgi" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5h4l5-4v13l-5-4H3z" fill="currentColor"/>${off ? '<path d="M15.5 9l6 6m0-6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' : '<path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'}</svg>`;

// ------------------------------------------------------------------ identita
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
let prof = null;
const myName = () => { const el = $('name'); const v = el && !el.closest('[hidden]') ? el.value.trim() : ''; return v || (prof && prof.name) || LS.get('bombic_name') || undefined; };
async function call(action, body) {
  const r = await fetch(API + '/api/bombic/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ident(), ...body }), signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Chyba ' + r.status); return j;
}

// ------------------------------------------------------------------ zvuk (syntetický)
let ac = null, noiseBuf = null, muted = LS.get('bombic_mute') === '1';
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; }
function tone(freq, dur, type = 'triangle', vol = 0.07, slide = 0, delay = 0) {
  if (muted) return; const a = audio(); if (!a) return;
  const o = a.createOscillator(), g2 = a.createGain(), t0 = a.currentTime + delay; o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(25, freq + slide), t0 + dur);
  g2.gain.setValueAtTime(vol, t0); g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g2).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur, vol, f0, f1, delay = 0) {
  if (muted) return; const a = audio(); if (!a) return;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; const t0 = a.currentTime + delay; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t0 + dur);
  const g2 = a.createGain(); g2.gain.setValueAtTime(vol, t0); g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g2).connect(a.destination); s.start(t0); s.stop(t0 + dur + 0.05);
}
const sfx = {
  click() { tone(520, .06, 'triangle', .05); },
  place() { tone(180, .1, 'sine', .12, -60); noise(.05, .04, 900, 300); },
  boom() { noise(.6, .34, 1700, 70); tone(80, .5, 'sine', .22, -45); },
  stump() { noise(.12, .08, 1400, 400); },
  stone() { noise(.2, .12, 700, 120); tone(100, .15, 'sine', .1, -40); },
  pick() { [660, 880].forEach((f, i) => tone(f, .09, 'triangle', .07, 0, i * .06)); },
  skull() { [300, 220, 160].forEach((f, i) => tone(f, .14, 'sawtooth', .06, 0, i * .08)); },
  kick() { tone(240, .08, 'square', .05, 200); },
  die() { noise(.3, .14, 1100, 150); tone(300, .35, 'sawtooth', .06, -230); },
  tick() { tone(740, .08, 'triangle', .07); },
  go() { tone(988, .25, 'triangle', .1); tone(1318, .3, 'triangle', .08, 0, .08); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .2, 'triangle', .09, 0, i * .12)); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, .28, 'sawtooth', .06, 0, i * .18)); },
  err() { tone(160, .14, 'square', .05); },
};
function syncMute() { $('muteBtn').innerHTML = svgSpeaker(muted); $('pMute').innerHTML = `<b>Zvuk: ${muted ? 'vypnutý' : 'zapnutý'}</b>`; }
const toggleMute = () => { muted = !muted; LS.set('bombic_mute', muted ? '1' : '0'); syncMute(); if (!muted) sfx.click(); };
$('muteBtn').onclick = toggleMute; $('pMute').onclick = toggleMute; syncMute();

// ------------------------------------------------------------------ obrazovky a okna
let screen = 'menu';
function show(name) {
  screen = name; for (const id of ['menu', 'lobby', 'game']) $(id).hidden = id !== name;
  if (name === 'game') resize();
  if (name === 'menu') startScene($('mscene')); else stopScene();
}
let toastT = null;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600); }
function setStatus(msg, err) { const el = $('menuStatus'); el.textContent = msg || ''; el.classList.toggle('err', !!err); }
const openModal = (id) => { $(id).hidden = false; };
document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { const m = e.target.closest('.modal'); if (m) m.hidden = true; } else if (e.target.classList && e.target.classList.contains('modal')) e.target.hidden = true; });

// ------------------------------------------------------------------ profil a menu
async function refreshProfile() { try { prof = await call('me', {}); } catch (e) { prof = null; } renderProfile(); return prof; }
function renderProfile() {
  const ok = !!(prof && prof.account);
  $('prof').hidden = !ok; $('nameField').hidden = ok && prof.linked;
  if (!ok) return;
  const t = prof.bombic;
  $('pLvl').textContent = t.lvl; $('pName').textContent = prof.name || 'Hráč';
  $('pXp').style.width = (t.next ? clamp((t.xp - t.from) / (t.next - t.from), 0, 1) * 100 : 100) + '%';
  $('pXpTxt').textContent = t.next ? `${t.xp - t.from} / ${t.next - t.from} XP` : 'maximum';
  $('pRec').textContent = `${t.wins} výher · ${t.games} her`;
}
let botPick = { n: 3, level: 2 };
try { const b = JSON.parse(LS.get('bombic_bot')); if (b && b.n >= 1 && b.n <= 3 && b.level >= 1 && b.level <= 3) botPick = b; } catch (e) { /* výchozí */ }
function renderBotModal() {
  for (const b of $('botN').children) b.classList.toggle('on', +b.dataset.n === botPick.n);
  $('botLevels').innerHTML = BOT_LEVELS.map(([n, nm, ds]) => `<button class="lv${n === botPick.level ? ' on' : ''}" type="button" data-lv="${n}"><span><b>${nm}</b><small>${ds}</small></span></button>`).join('');
}
$('bBot').onclick = () => { audio(); renderBotModal(); openModal('botModal'); };
$('botN').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (!b) return; botPick.n = +b.dataset.n; sfx.click(); renderBotModal(); });
$('botLevels').addEventListener('click', (e) => { const b = e.target.closest('[data-lv]'); if (!b) return; botPick.level = +b.dataset.lv; sfx.click(); renderBotModal(); });
$('botGo').onclick = () => { LS.set('bombic_bot', JSON.stringify(botPick)); $('botModal').hidden = true; startGame({ t: 'bot', n: botPick.n, level: botPick.level }); };
$('bQuick').onclick = () => { audio(); startGame({ t: 'quick' }); };
$('bCreate').onclick = () => { audio(); startGame({ t: 'create' }); };
$('joinForm').onsubmit = (e) => { e.preventDefault(); audio(); const c = $('code').value.trim().toUpperCase(); if (c.length !== 4) return setStatus('Kód má 4 písmena.', true); startGame({ t: 'join', code: c }); };
$('code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
$('name').addEventListener('change', () => LS.set('bombic_name', $('name').value.trim()));
$('bHow').onclick = () => { $('howItems').innerHTML = K.ITEMS.map((id) => `<div class="it"><img src="${itemURL(id)}" alt=""><div><b>${esc(K.ITEM_INFO[id].name)}</b><small>${esc(K.ITEM_INFO[id].desc)}</small></div></div>`).join(''); openModal('howModal'); };
$('name').value = LS.get('bombic_name') || '';

// ------------------------------------------------------------------ spojení
let ws = null, session = null, wantOpen = false, outbox = [], retry = 0, connTimer = null;
function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  wantOpen = true; let sock;
  try { sock = new WebSocket(CFG.SERVER_URL); } catch (e) { setStatus('Špatná adresa serveru.', true); return; }
  ws = sock;
  sock.onopen = () => {
    if (ws !== sock) return; retry = 0; $('conn').hidden = true;
    if (session && !outbox.length) sock.send(JSON.stringify({ t: 'resume', code: session.code, token: session.token }));
    for (const m of outbox) sock.send(JSON.stringify(m)); outbox = [];
  };
  sock.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } try { onMsg(m); } catch (e) { console.error(e); } };
  sock.onclose = () => {
    if (ws !== sock) return; ws = null;
    if (!wantOpen) return;
    const inGame = !!session;
    if (!inGame && !outbox.length) return;
    if (++retry > 25) { wantOpen = false; backToMenu('Spojení se serverem se nepodařilo obnovit.'); return; }
    $('conn').hidden = false; $('conn').textContent = inGame ? 'Spojení přerušeno, připojuji…' : 'Server se probouzí, chvilku strpení…';
    clearTimeout(connTimer); connTimer = setTimeout(connect, Math.min(4000, 700 * retry));
  };
  sock.onerror = () => { /* vyřeší onclose */ };
}
const isStart = (t) => t === 'create' || t === 'join' || t === 'quick' || t === 'bot';
function sendMsg(m) {
  const full = { ...m, ...(isStart(m.t) ? { ...ident(), name: myName() } : {}) };
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(full)); else { if (isStart(m.t)) outbox.push(full); connect(); }
}
setInterval(() => { if (ws && ws.readyState === 1 && screen !== 'menu') { try { ws.send('{"t":"ping"}'); } catch (e) { /* nic */ } } }, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && session && wantOpen && !ws) connect(); });
function startGame(req) {
  setStatus(''); LS.set('bombic_name', ($('name').value || '').trim());
  session = null; LS.del('bombic_resume'); S = null; resetBoard(); outbox = []; retry = 0;
  if (!(ws && ws.readyState === 1)) setStatus('Připojuji…');
  sendMsg(req);
}
function backToMenu(msg) {
  wantOpen = false; session = null; LS.del('bombic_resume'); outbox = []; clearTimeout(connTimer);
  if (ws) { try { ws.onclose = null; ws.close(); } catch (e) { /* nic */ } ws = null; }
  S = null; resetBoard(); $('conn').hidden = true; $('over').hidden = true; $('pauseModal').hidden = true; clearTimeout(overTimer); overTimer = null;
  show('menu'); setStatus(msg || '', !!msg); refreshProfile();
}
function leaveGame() { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ t: 'leave' })); } catch (e) { /* nic */ } } backToMenu(); }

// ------------------------------------------------------------------ stav hry
let S = null;                // poslední zpráva `state`
let me = 0;
let snaps = [], cur = null, gridStr = '';
let overTimer = null;
const evq = [], fx = [], dieAt = [];
let shake = 0, sdShown = false, lastCount = -1, bannerT = null, hudSig = '', chipSig = '';

function onMsg(m) {
  switch (m.t) {
    case 'joined': session = { code: m.code, token: m.token }; LS.set('bombic_resume', JSON.stringify({ ...session, at: Date.now() })); setStatus(''); return;
    case 'state': return onState(m);
    case 'snap': return onSnap(m);
    case 'pong': return;
    case 'err': sfx.err(); toast(m.msg); if (m.fatal) { if (m.gone) backToMenu('Zápas už neexistuje.'); else if (screen === 'menu') setStatus(m.msg, true); else backToMenu(m.msg); } return;
    default:
  }
}
function resetBoard() { snaps = []; cur = null; gridStr = ''; evq.length = 0; fx.length = 0; dieAt.length = 0; shake = 0; sdShown = false; lastCount = -1; hudSig = ''; chipSig = ''; hideBanner(); $('dropNote').hidden = true; $('gTimer').parentElement.classList.remove('sd'); }
function onState(s) {
  const prev = S; S = s; me = s.you; $('conn').hidden = true;
  if (s.phase === 'lobby') { if (screen !== 'lobby') show('lobby'); renderLobby(s); return; }
  if (screen !== 'game') show('game');
  const newMatch = !prev || prev.phase === 'lobby' || prev.matchId !== s.matchId;
  const newRound = newMatch || prev.round !== s.round;
  if (newRound) { resetBoard(); if (s.phase === 'play') banner(`Kolo ${s.round}`, 1400); }
  if (newMatch) { $('over').hidden = true; clearTimeout(overTimer); overTimer = null; }
  if (prev && prev.phase !== 'between' && s.phase === 'between' && s.round_result) {
    const r = s.round_result; const w = r.winner >= 0 ? s.players[r.winner] : null;
    banner(w ? `${esc(w.name)} bere kolo` : 'Remíza', 2600, `<small>${esc(REASON[r.reason] || '')}</small>`);
    if (r.winner === me) sfx.win(); else sfx.lose();
  }
  $('gRound').textContent = `Kolo ${s.round}`;
  renderChips();
  const d = s.drop; const dn = $('dropNote');
  if (d && d.idx >= 0 && d.idx !== me && s.players[d.idx]) { dn.textContent = `${s.players[d.idx].name} se odpojil, čekáme ${d.left} s`; dn.hidden = false; } else dn.hidden = true;
  if (s.phase === 'over' && s.result) { if (!overTimer && $('over').hidden) overTimer = setTimeout(() => { overTimer = null; showOver(); }, 1300); } else if (s.phase !== 'over') { $('over').hidden = true; clearTimeout(overTimer); overTimer = null; }
  else if (!$('over').hidden) renderOver();
  if (s.phase === 'play') resendDir();
}
function renderLobby(s) {
  $('roomCode').textContent = s.code; $('lobbyTitle').textContent = s.quick ? 'Rychlá hra' : 'Vlastní hra';
  $('slots').innerHTML = [0, 1, 2, 3].map((i) => { const p = s.players[i]; if (!p) return '<div class="slot empty">volné místo</div>'; return `<div class="slot${i === s.you ? ' me' : ''}"><img src="${portraitURL(i)}" alt=""><div><div class="nm">${esc(p.name)}</div><small>${p.bot ? 'bot' : 'úroveň ' + p.lvl}${i === s.host ? ' · zakladatel' : ''}${!p.connected ? ' · odpojen' : ''}</small></div></div>`; }).join('');
  const n = s.players.length; const host = s.you === s.host && !s.quick;
  $('copyLink').hidden = !!s.quick; $('hostBox').hidden = !host;
  $('lobbyHint').textContent = s.quick ? (s.auto != null && n >= 2 ? `Hra začne za ${s.auto} s (nebo hned, až budou čtyři).` : 'Hledám další hráče, stačí dva…') : host ? 'Pošli kód kamarádům. Začít můžeš, až budou aspoň dva, nebo doplň boty.' : 'Čeká se, až zakladatel spustí hru.';
  if (host) { const ok = n >= 2 || $('fillBots').checked; $('startBtn').disabled = !ok; $('startBtn').querySelector('b').textContent = ok ? 'Začít hru' : 'Čekám na další hráče'; }
}
$('fillBots').addEventListener('change', () => S && renderLobby(S));
$('fillLevel').addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (!b) return; for (const x of $('fillLevel').children) x.classList.toggle('on', x === b); sfx.click(); });
$('startBtn').onclick = () => { audio(); const lv = +($('fillLevel').querySelector('.on') || { dataset: { l: 2 } }).dataset.l; sendMsg({ t: 'start', fill: $('fillBots').checked, level: lv }); };
$('leaveLobby').onclick = () => leaveGame();
$('copyLink').onclick = async () => {
  const url = `${location.origin}${location.pathname}?k=${S ? S.code : ''}`;
  try { await navigator.clipboard.writeText(url); toast('Odkaz zkopírován.'); } catch (e) { toast(url); }
};
$('pauseBtn').onclick = () => { $('pauseModal').hidden = false; };
$('pLeave').onclick = () => { $('pauseModal').hidden = true; leaveGame(); };

function banner(html, ms, extra) { const el = $('banner'); el.innerHTML = html + (extra || ''); el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(bannerT); if (ms) bannerT = setTimeout(hideBanner, ms); }
function hideBanner() { clearTimeout(bannerT); $('banner').hidden = true; }

function renderChips() {
  if (!S) return; const alive = cur ? cur.p.map((p) => p[2]) : S.players.map(() => 1);
  const sig = JSON.stringify([S.players.map((p) => [p.name, p.wins, p.left, p.connected]), alive, me]);
  if (sig === chipSig) return; chipSig = sig;
  $('pchips').innerHTML = S.players.map((p, i) => `<div class="pc${i === me ? ' me' : ''}${alive[i] ? '' : ' dead'}${p.left ? ' left' : ''}" style="--c:${SKINS[i].main}"><img src="${portraitURL(i)}" alt=""><div style="min-width:0"><div class="nm">${esc(p.name)}</div><div class="pips">${Array.from({ length: S.need }, (_, k) => `<i class="${k < p.wins ? 'on' : ''}"></i>`).join('')}</div></div></div>`).join('');
}
function onSnap(m) {
  const at = performance.now();
  if (typeof m.g === 'string') gridStr = m.g;
  const sn = { at, k: m.k, tm: m.tm, fr: m.fr, sd: m.sd, p: m.p, b: m.b, f: m.f, i: m.i, w: m.w, grid: gridStr };
  snaps.push(sn); if (snaps.length > 12) snaps.shift();
  for (const e of m.ev || []) evq.push({ due: at + DELAY, e });
  cur = sn; updateHud();
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function updateHud() {
  const m = cur; if (!m) return;
  $('gTimer').textContent = fmtTime(m.tm); $('gTimer').parentElement.classList.toggle('sd', !!m.sd);
  if (m.sd && !sdShown) { sdShown = true; banner('Náhlá smrt!', 1800, '<small>Z okraje padají kameny</small>'); sfx.skull(); }
  if (m.fr > 0) { const c = Math.ceil(m.fr / 20); if (c !== lastCount) { lastCount = c; banner(`<span class="cnt">${c}</span>`); sfx.tick(); } }
  const p = m.p[me]; if (p) {
    const curse = CURSE_BY_CODE[p[5]]; const sig = [p[6], p[10], p[7], p[8], p[9], p[5]].join();
    if (sig !== hudSig) {
      hudSig = sig;
      $('mine').innerHTML = `<span class="st" title="Bomby"><img src="${itemURL('bomb')}" alt="">${Math.max(0, p[6] - p[10])}/${p[6]}</span><span class="st" title="Dosah"><img src="${itemURL('fire')}" alt="">${p[7]}</span><span class="st" title="Rychlost"><img src="${itemURL('speed')}" alt="">${p[8]}</span><span class="st${p[9] ? '' : ' off'}" title="Kopání"><img src="${itemURL('kick')}" alt="">${p[9] ? 'ano' : '–'}</span>${curse ? `<span class="st curse"><img src="${itemURL('skull')}" alt="">${esc(K.CURSE_NAME[curse])}</span>` : ''}`;
    }
  }
  renderChips();
}

// ------------------------------------------------------------------ události a efekty
function burst(x, y, n, cols, speed, life) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = speed * (0.4 + Math.random()); fx.push({ k: 'deb', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, t: 0, life: life * (0.6 + Math.random() * 0.6), c: cols[i % cols.length], s: 0.06 + Math.random() * 0.08, r: Math.random() * 6 }); } }
function processEvents(now) {
  while (evq.length && evq[0].due <= now) {
    const e = evq.shift().e; const a = cur; const k = e[0];
    if (k === 'b') sfx.place();
    else if (k === 'x') { sfx.boom(); shake = Math.max(shake, 7); burst(e[1] + 0.5, e[2] + 0.5, 10, ['#ffd24a', '#ff8a1f', '#fff3b0'], 5, 0.5); fx.push({ k: 'smoke', x: e[1] + 0.5, y: e[2] + 0.5, t: 0, life: 0.8 }); }
    else if (k === 's') { sfx.stump(); burst(e[1] + 0.5, e[2] + 0.5, 9, ['#a8692f', '#6e4320', '#c58a4a'], 4, 0.7); }
    else if (k === 'r') { sfx.stone(); shake = Math.max(shake, 4); burst(e[1] + 0.5, e[2] + 0.5, 8, ['#8c939d', '#6b727c', '#b8bec6'], 3.5, 0.6); }
    else if (k === 'k') sfx.kick();
    else if (k === 'd') { dieAt[e[3]] = now; sfx.die(); burst(e[1], e[2], 8, ['#fff', SKINS[e[3] % 4].main], 4, 0.7); if (e[3] === me) banner('Jsi venku', 1500); }
    else if (k === 'i') {
      const type = typeof e[1] === 'number' ? K.ITEMS[e[1]] : e[1]; const pi = e[2]; const pp = a && a.p[pi];
      if (type === 'skull') sfx.skull(); else if (pi === me) sfx.pick();
      if (pp) fx.push({ k: 'ico', x: pp[0], y: pp[1] - 0.5, t: 0, life: 0.9, type });
    } else if (k === 'go') { banner('Do toho!', 800); sfx.go(); resendDir(); }
  }
}

// ------------------------------------------------------------------ vykreslení
const cv = $('cv'); const g = cv.getContext('2d');
let cw = 0, ch = 0, dpr = 1, ts = 32, ox = 0, oy = 0, bgCan = null, bgKey = '';
function resize() {
  const r = $('gField').getBoundingClientRect(); if (!r.width || !r.height) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2.5); cw = r.width; ch = r.height;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  ts = Math.max(12, Math.floor(Math.min(cw / COLS, ch / ROWS))); ox = Math.floor((cw - ts * COLS) / 2); oy = Math.floor((ch - ts * ROWS) / 2); bgKey = '';
}
window.addEventListener('resize', () => { if (screen === 'game') resize(); });
if (window.ResizeObserver) new ResizeObserver(() => { if (screen === 'game') resize(); }).observe($('gField'));
function paintBg(gs) {
  const key = gs + '|' + ts + '|' + dpr; if (key === bgKey && bgCan) return; bgKey = key;
  bgCan = bgCan || document.createElement('canvas'); bgCan.width = Math.round(COLS * ts * dpr); bgCan.height = Math.round(ROWS * ts * dpr);
  const b = bgCan.getContext('2d'); b.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1; drawTile(b, +gs[y * COLS + x] || 0, x * ts, y * ts, ts, x, y, border); }
}
function pick(now) {   // dva snímky, mezi kterými je právě vykreslovaný čas
  const rt = now - DELAY; let i = snaps.length - 1; while (i > 0 && snaps[i].at > rt) i--;
  const a = snaps[i], b = snaps[i + 1]; const u = b ? clamp((rt - a.at) / Math.max(1, b.at - a.at), 0, 1) : 0; return { a, b, u };
}
const lerp = (p, q, u) => p + (q - p) * u;
function draw(now, tsec) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#0d2013'; g.fillRect(0, 0, cw, ch);
  if (!snaps.length || !cur) return;
  const { a, b, u } = pick(now);
  if (!a.grid) return;
  paintBg(a.grid);
  g.save();
  if (shake > 0.3) { g.translate(ox + (Math.random() - 0.5) * shake, oy + (Math.random() - 0.5) * shake); shake *= 0.86; } else { shake = 0; g.translate(ox, oy); }
  g.drawImage(bgCan, 0, 0, COLS * ts, ROWS * ts);
  for (const [x, y] of a.w) drawWarn(g, x * ts, y * ts, ts, tsec);
  for (const [x, y, ti] of a.i) drawItem(g, K.ITEMS[ti], x * ts, y * ts, ts, tsec, x, y);
  for (let j = 0; j < a.b.length; j++) {
    const q = a.b[j]; let px = q[0] + q[3] * q[2], py = q[1] + q[4] * q[2]; const r = b && b.b[j];
    if (r && r[3] === q[3] && r[4] === q[4] && Math.abs((r[0] + r[3] * r[2]) - px) < 1.6 && Math.abs((r[1] + r[4] * r[2]) - py) < 1.6) { px = lerp(px, r[0] + r[3] * r[2], u); py = lerp(py, r[1] + r[4] * r[2], u); }
    drawBomb(g, (px + 0.5) * ts, (py + 0.5) * ts, ts, q[5], tsec, q[6]);
  }
  for (const [x, y] of a.f) drawFlame(g, x * ts, y * ts, ts, tsec, x, y);
  const order = []; for (let i = 0; i < a.p.length; i++) {
    const p = a.p[i]; const q = b && b.p[i]; let x = p[0], y = p[1];
    if (q && Math.abs(q[0] - x) < 2 && Math.abs(q[1] - y) < 2) { x = lerp(x, q[0], u); y = lerp(y, q[1], u); }
    const dying = !p[2] && dieAt[i] !== undefined ? (now - dieAt[i]) / 900 : 0;
    if (!p[2] && !(dying > 0 && dying < 1)) continue; order.push({ i, x, y, p, dying });
  }
  order.sort((m, n) => m.y - n.y);
  for (const o of order) drawPlayer(g, o.i, o.x * ts, o.y * ts - ts * 0.12, ts, o.p[3], !!o.p[4], tsec, { you: o.i === me && o.p[2] && S && S.phase === 'play', curse: o.p[5] && o.p[2], dying: o.dying });
  drawFx(now);
  g.restore();
}
const imgs = {}; const itemImg = (t) => imgs[t] || (imgs[t] = Object.assign(new Image(), { src: itemURL(t) }));
let lastNow = 0;
function drawFx(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000 || 0.016);
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt; const k = f.t / f.life; if (k >= 1) { fx.splice(i, 1); continue; }
    if (f.k === 'deb') { f.vy += 14 * dt; f.x += f.vx * dt; f.y += f.vy * dt; g.save(); g.globalAlpha = 1 - k * k; g.translate(f.x * ts, f.y * ts); g.rotate(f.r + f.t * 8); g.fillStyle = f.c; g.fillRect(-f.s * ts / 2, -f.s * ts / 2, f.s * ts, f.s * ts); g.restore(); }
    else if (f.k === 'smoke') { g.globalAlpha = 0.45 * (1 - k); g.fillStyle = '#d8d8d8'; for (const [dx, dy, r] of [[-0.3, 0, 0.3], [0.3, -0.1, 0.28], [0, -0.3, 0.32]]) { g.beginPath(); g.arc((f.x + dx * (0.5 + k)) * ts, (f.y + dy - k * 0.8) * ts, r * ts * (0.7 + k), 0, 6.283); g.fill(); } g.globalAlpha = 1; }
    else if (f.k === 'ico') { g.save(); g.globalAlpha = 1 - k * k; g.translate(f.x * ts, (f.y - k * 0.9) * ts); g.scale(1 + k * 0.2, 1 + k * 0.2); const im = itemImg(f.type); const s = ts * 0.7; g.drawImage(im, -s / 2, -s / 2, s, s); g.restore(); }
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  if (screen !== 'game' || !cw) { lastNow = now; return; }
  processEvents(now); draw(now, now / 1000); lastNow = now;
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ ovládání
let curDir = 0, padDir = 0; const keyStack = [];
const KEYDIR = { ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3, ArrowLeft: 4, KeyA: 4 };
const wantDir = () => padDir || (keyStack.length ? keyStack[keyStack.length - 1] : 0);
function recompute() { const d = wantDir(); if (d !== curDir) { curDir = d; sendMsg({ t: 'in', d }); } }
function resendDir() { const d = wantDir(); curDir = d; if (d) sendMsg({ t: 'in', d }); }
function playing() { return screen === 'game' && S && S.phase === 'play'; }
function dropBomb() { if (!playing()) return; sendMsg({ t: 'bomb' }); }
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (KEYDIR[e.code]) { e.preventDefault(); const d = KEYDIR[e.code]; if (!keyStack.includes(d)) keyStack.push(d); if (playing()) recompute(); }
  else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE' || e.code === 'ShiftLeft') { e.preventDefault(); if (!e.repeat) dropBomb(); }
});
window.addEventListener('keyup', (e) => { const d = KEYDIR[e.code]; if (!d) return; const i = keyStack.indexOf(d); if (i >= 0) keyStack.splice(i, 1); if (playing() || curDir) recompute(); });
window.addEventListener('blur', () => { keyStack.length = 0; padDir = 0; if (curDir) recompute(); });
// dotykový ovladač: čtyři směry podle toho, kam se prstem odtáhne od středu
const pad = $('pad'), knob = $('knob'); let padId = null;
function padMove(e) {
  const r = pad.getBoundingClientRect(); const R = r.width / 2; const dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const len = Math.hypot(dx, dy);
  let d = 0;
  if (len > R * 0.28) {
    const horiz = Math.abs(dx) > Math.abs(dy); const cur2 = padDir;
    if (cur2 === 1 || cur2 === 3) d = Math.abs(dx) > Math.abs(dy) * 1.3 ? (dx > 0 ? 2 : 4) : (dy < 0 ? 1 : 3);
    else if (cur2 === 2 || cur2 === 4) d = Math.abs(dy) > Math.abs(dx) * 1.3 ? (dy > 0 ? 3 : 1) : (dx > 0 ? 2 : 4);
    else d = horiz ? (dx > 0 ? 2 : 4) : (dy < 0 ? 1 : 3);
  }
  const k = len > R * 0.6 ? (R * 0.6) / len : 1; knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  if (d !== padDir) { padDir = d; recompute(); }
}
pad.addEventListener('pointerdown', (e) => { e.preventDefault(); audio(); padId = e.pointerId; try { pad.setPointerCapture(e.pointerId); } catch (x) { /* nic */ } padMove(e); });
pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) padMove(e); });
const padEnd = (e) => { if (e.pointerId !== padId) return; padId = null; padDir = 0; knob.style.transform = ''; recompute(); };
pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd);
const bb = $('bombBtn');
bb.addEventListener('pointerdown', (e) => { e.preventDefault(); audio(); bb.classList.add('down'); dropBomb(); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) bb.addEventListener(ev, () => bb.classList.remove('down'));

// ------------------------------------------------------------------ konec zápasu
function showOver() { renderOver(); $('over').hidden = false; if (S && S.result) { if (S.result.winner === me) sfx.win(); else sfx.lose(); } overXpDone = false; fillXp(); }
let overXpDone = false;
function renderOver() {
  const s = S; if (!s || !s.result) return; const r = s.result; const won = r.winner === me; const w = r.winner >= 0 ? s.players[r.winner] : null;
  const t = $('oTitle'); t.textContent = won ? 'VÝHRA' : r.winner < 0 ? 'REMÍZA' : 'PROHRA'; t.className = 'otitle' + (won ? '' : r.winner < 0 ? ' draw' : ' lose');
  $('oReason').textContent = won ? `Vyhráno ${r.wins[me]} : ${Math.max(...r.wins.filter((_, i) => i !== me), 0)} na kola.` : w ? `Zápas vyhrál ${w.name}.` : 'Nikdo nevyhrál dost kol.';
  const order = s.players.map((p, i) => i).sort((x, y) => r.wins[y] - r.wins[x] || r.kills[y] - r.kills[x]);
  $('oTable').innerHTML = order.map((i) => { const p = s.players[i]; const x = r.xp && r.xp[i]; return `<div class="orow${i === r.winner ? ' win' : ''}"><img src="${portraitURL(i)}" alt=""><div>${esc(p.name)}${i === me ? ' (ty)' : ''}<br><small>vyřazení: ${r.kills[i]}</small></div><span>${r.wins[i]} ${r.wins[i] === 1 ? 'kolo' : r.wins[i] >= 2 && r.wins[i] <= 4 ? 'kola' : 'kol'}</span><span class="xg">${x ? '+' + x.gain + ' XP' : ''}</span></div>`; }).join('');
  const again = $('oAgain'); const rm = s.rematch || []; const mine = !!rm[me]; const humansIn = s.players.filter((p) => !p.bot && !p.left).length; const ready = s.players.filter((p, i) => !p.bot && !p.left && rm[i]).length;
  $('oAgainTxt').textContent = s.solo ? 'Hrát znovu' : mine ? `Čekám na ostatní (${ready}/${humansIn})` : 'Odveta'; again.disabled = !s.solo && mine;
  $('oHint').textContent = s.solo ? '' : humansIn <= 1 ? 'Ostatní hráči odešli.' : '';
  if (humansIn <= 1 && !s.solo) { again.disabled = true; $('oAgainTxt').textContent = 'Odveta není možná'; }
}
async function fillXp() {
  const x = S && S.result && S.result.xp && S.result.xp[me]; const box = $('oXp'); if (!x) { box.hidden = true; return; }
  box.hidden = false; $('oXpBar').style.width = '0%'; $('oXpTxt').textContent = `+${x.gain} XP · úroveň ${x.lvl}${x.up ? ' · nová úroveň!' : ''}`;
  await refreshProfile(); const t = prof && prof.bombic; if (t) setTimeout(() => { $('oXpBar').style.width = (t.next ? clamp((t.xp - t.from) / (t.next - t.from), 0, 1) * 100 : 100) + '%'; }, 80);
}
$('oAgain').onclick = () => { audio(); sendMsg({ t: 'rematch' }); };
$('oMenu').onclick = () => leaveGame();

// ------------------------------------------------------------------ start
startScene($('mscene'));
(async () => {
  await refreshProfile();
  const q = new URLSearchParams(location.search).get('k');
  let rs = null; try { rs = JSON.parse(LS.get('bombic_resume')); } catch (e) { /* nic */ }
  if (q && /^[A-Za-z]{4}$/.test(q)) { $('code').value = q.toUpperCase(); setTimeout(() => startGame({ t: 'join', code: q.toUpperCase() }), 500); }
  else if (rs && rs.code && rs.token && Date.now() - rs.at < 30 * 60 * 1000) { session = { code: rs.code, token: rs.token }; setStatus('Obnovuji rozehranou hru…'); connect(); }
})();
window.__bombic = { get S() { return S; }, get cur() { return cur; }, get snaps() { return snaps; }, onMsg, show, K };
