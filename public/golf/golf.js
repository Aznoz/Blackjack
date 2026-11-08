// MINIGOLF – klient: menu, čekárna a hra. 3D scéna je v scene.js (three.js), fyzika míčku v phys.js (stejná jako na serveru): míček hráče se počítá tady v prohlížeči
// a hlásí se serveru, ostatní míčky se dopočítávají z jeho snímků. Ovládání: táhni prstem dozadu a pusť (prak), kamera je za míčkem a jde otáčet.
import * as K from './shared.js?v=4';
import * as P from './phys.js?v=4';
import * as C from './courses.js?v=4';
import { createScene } from './scene.js?v=4';
import { skinPreviewURL, fxIconURL, clubIconURL } from './cosm.js?v=4';

const CFG = window.GOLF_CONFIG || {};
const $ = (id) => document.getElementById(id);
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nic */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* nic */ } } };
const SS = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* nic */ } }, del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* nic */ } } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const API = String(CFG.SERVER_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/golf\/?$/, '');
const coarse = () => matchMedia('(pointer: coarse)').matches;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const LEVELS = [[1, 'Nováček', 'Míří nejistě, často minimálně o kus.'], [2, 'Hráč', 'Slušně míří a zvládne většinu jamek.'], [3, 'Šampion', 'Skoro neomylný, počítej s jamkou na jednu ránu.']];
const colorHex = (i) => (K.COLORS[i] || K.COLORS[0]).c;
let prof = null;   // profil účtu (null = host bez účtu)
const myEq = () => (prof && prof.account && prof.golf.eq) || { skin: '', fx: '', club: '' };
const myClub = () => K.clubOf(myEq().club);
let curClub = K.BASE_CLUB;   // hůl platná pro rozehranou jamku

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
const myName = () => { const el = $('name'); const v = el && !el.closest('[hidden]') ? el.value.trim() : ''; return v || (prof && prof.name) || LS.get('golf_name') || undefined; };
let myColor = Number.isFinite(+LS.get('golf_color')) && LS.get('golf_color') !== null ? +LS.get('golf_color') : -1;
async function call(action, body) {
  const r = await fetch(API + '/api/golf/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ident(), ...body }), signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Chyba ' + r.status); return j;
}

// ------------------------------------------------------------------ zvuk (syntetický) a hudba
let ac = null, noiseBuf = null, muted = LS.get('golf_mute') === '1', musicOn = LS.get('golf_music') !== '0';
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
  click() { tone(720, 0.05, 'square', 0.035); },
  hit(p, v = 1) { noise(0.1, (0.08 + p * 0.14) * v, 2600 + p * 2200, 300); tone(150 + p * 120, 0.12, 'sine', (0.1 + p * 0.08) * v, -60); },
  tick(s) { tone(420 + Math.random() * 160, 0.05, 'triangle', 0.02 + s * 0.05); },
  boing() { tone(260, 0.26, 'sine', 0.1, 420); tone(520, 0.2, 'triangle', 0.04, 300, 0.04); },
  cup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.08, 0, i * 0.08)); },
  ace() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.28, 'square', 0.04, 0, i * 0.07)); },
  splash() { noise(0.45, 0.16, 2800, 300); tone(300, 0.3, 'sine', 0.05, -200); },
  tele() { tone(280, 0.32, 'sawtooth', 0.04, 900); tone(1200, 0.2, 'sine', 0.03, -500, 0.1); },
  beep(hi) { tone(hi ? 1175 : 784, hi ? 0.35 : 0.16, 'square', 0.05); },
  bad() { tone(220, 0.25, 'sawtooth', 0.05, -90); },
};
const mus = { timer: null, step: 0, next: 0 };
const CH = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], ROOT = 261.63; const hz = (n) => ROOT * Math.pow(2, n / 12);
function musicTick() {
  const a = ac; if (!a || muted || !musicOn) return; const spb = 60 / 104 / 2;
  while (mus.next < a.currentTime + 0.25) {
    const st = mus.step, bar = Math.floor(st / 8) % 4, ch = CH[bar], t0 = Math.max(mus.next, a.currentTime);
    const note = (n, d, vol, type) => { const o = a.createOscillator(), g2 = a.createGain(); o.type = type; o.frequency.value = n; g2.gain.setValueAtTime(vol, t0); g2.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g2).connect(a.destination); o.start(t0); o.stop(t0 + d + 0.02); };
    const arp = [0, 1, 2, 1, 2, 1, 0, 1][st % 8]; note(hz(ch[arp] + 12), 0.5, 0.028, 'triangle');
    if (st % 4 === 0) note(hz(ch[0] - 12), 0.8, 0.05, 'sine');
    if (st % 8 === 4) note(hz(ch[2] + 24), 0.35, 0.016, 'sine');
    mus.next += spb; mus.step++;
  }
}
function syncMusic() { if (musicOn && !muted && ac) { if (!mus.timer) { mus.next = ac.currentTime + 0.05; mus.timer = setInterval(musicTick, 80); } } else if (mus.timer) { clearInterval(mus.timer); mus.timer = null; } }
const svgSpeaker = (off) => `<svg class="svgi" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5h4l5-4v13l-5-4H3z" fill="currentColor"/>${off ? '<path d="M15.5 9l6 6m0-6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' : '<path d="M15.5 9a4 4 0 010 6M18 6.5a8 8 0 010 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>'}</svg>`;
const svgNote = (off) => `<svg class="svgi" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17V6l10-2v11" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="7" cy="17" r="2.6" fill="currentColor"/><circle cx="17" cy="15" r="2.6" fill="currentColor"/>${off ? '<path d="M3 3l18 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' : ''}</svg>`;
function syncAudioUi() {
  for (const id of ['muteBtn', 'lobMute']) { const b = $(id); if (b) b.innerHTML = svgSpeaker(muted); }
  $('musicBtn').innerHTML = svgNote(!musicOn || muted);
  $('pSound').firstElementChild.textContent = muted ? 'Zvuk: vypnutý' : 'Zvuk: zapnutý'; $('pMusic').firstElementChild.textContent = musicOn ? 'Hudba: zapnutá' : 'Hudba: vypnutá';
  syncMusic();
}
function setMuted(v) { muted = v; LS.set('golf_mute', v ? '1' : '0'); audio(); syncAudioUi(); }
function setMusic(v) { musicOn = v; LS.set('golf_music', v ? '1' : '0'); audio(); syncAudioUi(); }
for (const id of ['muteBtn', 'lobMute']) $(id).onclick = () => setMuted(!muted);
$('musicBtn').onclick = () => setMusic(!musicOn); $('pSound').onclick = () => setMuted(!muted); $('pMusic').onclick = () => setMusic(!musicOn);
for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, () => { if (!ac || ac.state !== 'running') { audio(); setTimeout(syncMusic, 60); } }, { passive: true });

// ------------------------------------------------------------------ celá obrazovka (jako u ostatních her na telefonu)
const rootEl = document.documentElement; const fsOK = !!(rootEl.requestFullscreen || rootEl.webkitRequestFullscreen);
const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
async function enterFs() { try { await (rootEl.requestFullscreen ? rootEl.requestFullscreen({ navigationUI: 'hide' }) : rootEl.webkitRequestFullscreen()); } catch (e) { /* nejde */ } }
function exitFs() { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* nic */ } }
const autoFs = () => { if (fsOK && coarse() && !isFs() && LS.get('golf_fs') !== '0') enterFs(); };
const toggleFs = () => { if (isFs()) { LS.set('golf_fs', '0'); exitFs(); } else { LS.set('golf_fs', '1'); enterFs(); } };
if (fsOK) { $('fsBtn').hidden = false; $('pFs').hidden = false; $('fsBtn').onclick = toggleFs; $('pFs').onclick = () => { toggleFs(); closePause(); }; }

// ------------------------------------------------------------------ 3D scéna
const glc = $('gl'); let V = null;
try { V = createScene(glc, { shadows: true, shadowSize: coarse() ? 1024 : 2048, maxDpr: coarse() ? 2 : 2 }); } catch (e) { console.error(e); }
function resize() { if (V) V.resize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ obrazovky
let screen = 'menu';
function show(name) {
  screen = name; for (const id of ['menu', 'lobby', 'game']) $(id).hidden = id !== name;
  if (name !== 'game') { closePause(); }
  if (name === 'game') { camInit = false; }
}
let toastT = null;
function toast(msg, ms = 2200) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }
const status = (msg) => { $('menuStatus').textContent = msg || ''; };

// ------------------------------------------------------------------ síť
let ws = null, S = null, GS = null, me = -1, curMatch = -1, offset = 0, bestRtt = 1e9, pingAt = 0, pingTimer = null;
const sendMsg = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
function connect(first) {
  closeWs(); return new Promise((resolve, reject) => {
    let done = false; const sock = new WebSocket(CFG.SERVER_URL); ws = sock;
    const to = setTimeout(() => { if (!done) { done = true; try { sock.close(); } catch (e) { /* nic */ } reject(new Error('Server neodpovídá (možná se právě budí, zkus to za chvilku).')); } }, 25000);
    sock.onopen = () => { if (done) return; done = true; clearTimeout(to); bestRtt = 1e9; ping(); pingTimer = setInterval(ping, 2500); first && first(); resolve(); };
    sock.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMsg(m); };
    sock.onclose = () => { clearInterval(pingTimer); if (ws === sock) { ws = null; onClosed(); } if (!done) { done = true; clearTimeout(to); reject(new Error('Nepodařilo se připojit.')); } };
    sock.onerror = () => {};
  });
}
function closeWs() { if (ws) { const s = ws; ws = null; try { s.close(); } catch (e) { /* nic */ } } clearInterval(pingTimer); }
function ping() { pingAt = performance.now(); sendMsg({ t: 'ping' }); }
function onClosed() {
  if (screen === 'game' || screen === 'lobby') { const saved = SS.get('golf_room'); if (saved && S && S.phase !== 'over') { toast('Spojení se přerušilo, připojuju znovu…', 3000); setTimeout(tryResume, 1200); } else { backToMenu('Spojení se serverem se přerušilo.'); } }
}
async function tryResume() {
  const saved = SS.get('golf_room'); if (!saved) return backToMenu();
  let r; try { r = JSON.parse(saved); } catch (e) { return backToMenu(); }
  try { await connect(); sendMsg({ t: 'resume', code: r.code, token: r.token }); } catch (e) { setTimeout(tryResume, 2500); }
}
function backToMenu(msg) {
  lobSig = '';
  closeWs(); SS.del('golf_room'); S = null; GS = null; me = -1; curMatch = -1; show('menu'); status(msg || ''); previewMenu(); refreshProfile();
}
function onMsg(m) {
  switch (m.t) {
    case 'pong': { const rtt = performance.now() - pingAt; if (rtt < bestRtt + 40 || rtt < 120) { bestRtt = Math.min(bestRtt, rtt); offset = m.at - (Date.now() - rtt / 2); } return; }
    case 'joined': SS.set('golf_room', JSON.stringify({ code: m.code, token: m.token })); return;
    case 'err': if (m.fatal) { if (m.gone) SS.del('golf_room'); backToMenu(m.msg); } else toast(m.msg); return;
    case 'state': return onState(m);
    case 'game': return onGame(m);
    case 'tk': return onTick(m);
    case 'nosink': if (ball) { ball.sunk = false; sunkLocal = false; ball.y = P.BR; ball.vy = 0; respawnAt = performance.now() + 50; sinkT[me] = 0; } return;
    default:
  }
}
function onState(s) {
  const prevPhase = S ? S.phase : null; S = s; me = s.you;
  if (s.phase === 'lobby') { if (screen !== 'lobby') { show('lobby'); GS = null; lobSig = ''; } renderLobby(); return; }
  if (screen !== 'game') { show('game'); autoFs(); }
  if (s.matchId !== curMatch) { curMatch = s.matchId; GS = null; }
  if (s.phase === 'over' && prevPhase !== 'over') renderOver();
  else if (s.phase === 'over') renderOver();
  const d = s.drop; $('dropBar').hidden = !d; if (d && S.players[d.idx]) $('dropBar').textContent = `${S.players[d.idx].name} se odpojil(a), čekáme ${d.left} s`;
}

// ------------------------------------------------------------------ menu: profil, barvy, tlačítka
function renderSwatches(el, used, onPick, cur) {
  el.innerHTML = K.COLORS.map((c, i) => `<button type="button" class="sw${cur === i ? ' on' : ''}${used && used.has(i) && cur !== i ? ' taken' : ''}" data-i="${i}" style="--c:${c.c}" aria-label="${c.name}" title="${c.name}"></button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) onPick(+b.dataset.i); };
}
function pickColor(i) {
  sfx.click(); myColor = i; LS.set('golf_color', String(i)); renderSwatches($('swatches'), null, pickColor, myColor); previewMenu();
  if (S && S.phase === 'lobby') sendMsg({ t: 'color', color: i }); else if (prof && prof.account) call('color', { color: i }).catch(() => {});
}
async function refreshProfile() {
  try { prof = await call('me', {}); } catch (e) { prof = null; }
  const has = prof && prof.account; $('prof').hidden = !has; $('nameField').hidden = !!(has && prof.linked);
  if (has) { const g = prof.golf; $('pName').textContent = prof.name; $('pRec').textContent = `${g.wins} výher · ${g.games} zápasů · ${g.aces}× jamka na 1 ránu`; $('pCoins').lastElementChild.textContent = g.coins; if (g.color >= 0 && !(LS.get('golf_color'))) { myColor = g.color; } }
  else { $('nameField').hidden = false; $('name').value = $('name').value || LS.get('golf_name') || ''; }
  if (myColor < 0) myColor = Math.floor(Math.random() * K.COLORS.length);
  renderSwatches($('swatches'), null, pickColor, myColor); previewMenu();
}
$('name').addEventListener('input', () => LS.set('golf_name', $('name').value.trim()));
const join = (extra) => ({ ...ident(), name: myName(), color: myColor, ...extra });
async function enter(first) { status('Připojuju…'); try { await connect(first); status(''); } catch (e) { status(e.message); } }
$('bQuick').onclick = () => { sfx.click(); audio(); enter(() => sendMsg({ t: 'quick', ...join() })); };
$('bCreate').onclick = () => { sfx.click(); audio(); enter(() => sendMsg({ t: 'create', ...join({ course: 0 }) })); };
$('joinForm').onsubmit = (e) => { e.preventDefault(); const code = $('code').value.trim().toUpperCase(); if (code.length < 4) return status('Napiš čtyřmístný kód.'); sfx.click(); audio(); enter(() => sendMsg({ t: 'join', code, ...join() })); };
$('bHow').onclick = () => { sfx.click(); $('howModal').hidden = false; }; $('howClose').onclick = () => { $('howModal').hidden = true; };
document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { const m = e.target.closest('.modal'); if (m) { m.hidden = true; if (m.id === 'shopModal') shopOpen = false; } } });

// ------------------------------------------------------------------ obchod: skiny míčků, efekty výhry a hole za coiny
const FX_INFO = {
  '': 'Barevné konfety z jamky.', sparks: 'Fontána zlatých jiskřiček.', stars: 'Hvězdičky létají vzhůru a snášejí se dolů.', rings: 'Rázové vlny se rozbíhají od jamky.', hearts: 'Srdíčka pomalu stoupají.',
  rainbow: 'Vysoký duhový gejzír.', fireworks: 'Raketa a salva barevných ohňostrojů.', lightning: 'Blesk udeří přímo do jamky.', meteor: 'Z nebe dopadne ohnivý meteorit.', goldrain: 'Zlatý déšť a třpytky.', nova: 'Výbuch supernovy s rázovými vlnami.',
};
const SHOP = {
  skin: { tab: 'Míčky', base: { id: '', name: 'Základní míček', price: 0 }, list: K.SKINS, hint: (it) => (it.id ? 'Vzhled míčku, vidí ho všichni hráči. Barva hráče zůstává u jmenovky.' : 'Obyčejný míček v tvé barvě.') },
  fx: { tab: 'Efekty výhry', base: { id: '', name: 'Konfety', price: 0 }, list: K.WINFX, hint: (it) => FX_INFO[it.id] + ' Přehraje se, když míček spadne do jamky (u jamky na jednu ránu větší), a po vítězství v zápase.' },
  club: { tab: 'Hole', base: K.BASE_CLUB, list: K.CLUBS, hint: (it) => it.desc + ' Hůl vidíš jen ty.' },
};
let shopTab = 'skin', shopSel = { skin: '', fx: '', club: '' }, shopOpen = false, shopBusy = false;
const hasAcc = () => !!(prof && prof.account);
const ownsItem = (cat, id) => id === '' || (hasAcc() && prof.golf.own.includes(cat + ':' + id));
const eqOf = (cat) => (hasAcc() ? prof.golf.eq[cat] : '');
const coinsNow = () => (hasAcc() ? prof.golf.coins : 0);
function shopImg(cat, it, size) { return cat === 'skin' ? skinPreviewURL(it.id, size, colorHex(Math.max(0, myColor))) : cat === 'fx' ? fxIconURL(it.id, size) : clubIconURL(it.id, size); }
function statRow(label, frac, txt) { return `<div class="st"><span>${label}</span><span class="bar"><i style="width:${Math.round(clamp(frac, 0, 1) * 100)}%"></i></span><span>${txt}</span></div>`; }
function renderShop() {
  const cfg = SHOP[shopTab]; const items = [cfg.base, ...cfg.list]; let sel = items.find((x) => x.id === shopSel[shopTab]) || items[0]; shopSel[shopTab] = sel.id;
  $('shopCoins').textContent = coinsNow();
  $('shopTabs').innerHTML = Object.entries(SHOP).map(([k, c]) => `<button type="button" data-tab="${k}" class="${k === shopTab ? 'on' : ''}">${c.tab}</button>`).join('');
  $('shopGrid').innerHTML = items.map((it) => { const own = ownsItem(shopTab, it.id), eq = own && eqOf(shopTab) === it.id; return `<button type="button" class="scard${it.id === sel.id ? ' sel' : ''}${own ? ' own' : ''}${eq ? ' eq' : ''}${!own && it.price > coinsNow() ? ' lock' : ''}" data-id="${it.id}"><img src="${shopImg(shopTab, it, 64)}" alt="" width="64" height="64"><b>${esc(it.name)}</b><small>${own ? (it.id === '' ? 'základ' : 'máš') : `<i class="coin"></i>${it.price}`}</small></button>`; }).join('');
  $('shopPrev').src = shopImg(shopTab, sel, 104); $('shopName').textContent = sel.name; $('shopHint').textContent = cfg.hint(sel);
  $('shopStats').innerHTML = shopTab === 'club' ? statRow('Síla rány', (sel.pw - 1) / 0.3, `+${Math.round((sel.pw - 1) * 100)} %`) + statRow('Zaměřovač', (sel.aim - 1) / 0.6, `+${Math.round((sel.aim - 1) * 100)} %`) + statRow('Písek brzdí', 1 - sel.sand, sel.sand < 1 ? `−${Math.round((1 - sel.sand) * 100)} %` : 'jako vždy') : '';
  const own = ownsItem(shopTab, sel.id), eq = own && eqOf(shopTab) === sel.id; const b = $('shopBuy'); b.hidden = false; b.disabled = shopBusy; const bt = b.firstElementChild;
  if (!hasAcc()) { bt.textContent = 'Přihlas se pro nákup'; b.disabled = true; } else if (eq) { bt.textContent = 'Nasazeno'; b.disabled = true; } else if (own) bt.textContent = 'Nasadit'; else bt.textContent = `Koupit za ${sel.price} coinů`;
  b.classList.toggle('main', hasAcc() && !eq); $('shopTry').hidden = shopTab !== 'fx' || !W;
  $('shopNote').textContent = hasAcc() ? 'Coiny dostaneš za zápas (10), výhru (+30), každou dokončenou jamku (+2) a jamku na jednu ránu (+15).' : 'Coiny se ukládají do účtu na portálu. Přihlášený hráč tu může nakupovat.';
}
function openShop() { shopOpen = true; $('shopModal').hidden = false; renderShop(); }
$('bShop').onclick = () => { sfx.click(); openShop(); };
$('shopTabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; sfx.click(); shopTab = b.dataset.tab; renderShop(); $('shopGrid').scrollTop = 0; };
$('shopGrid').onclick = (e) => { const b = e.target.closest('[data-id]'); if (!b) return; sfx.click(); shopSel[shopTab] = b.dataset.id; renderShop(); };
$('shopBuy').onclick = async () => {
  const cat = shopTab, id = shopSel[cat]; if (!hasAcc() || shopBusy) return; const own = ownsItem(cat, id); const it = id === '' ? SHOP[cat].base : K.shopItem(cat, id);
  if (!own && it.price > coinsNow()) { sfx.bad(); toast(`Chybí ti ${it.price - coinsNow()} coinů.`); return; }
  shopBusy = true; renderShop();
  try { prof = await call(own ? 'equip' : 'buy', { cat, id }); sfx.cup(); toast(own ? `Nasazeno: ${it.name}` : `Koupeno: ${it.name}`); $('pCoins').lastElementChild.textContent = prof.golf.coins; if (cat === 'skin') previewMenu(); }
  catch (err) { sfx.bad(); toast(err.message); }
  shopBusy = false; renderShop();
};
let demoUntil = 0;
$('shopTry').onclick = () => {   // ukázka efektu: na chvíli se schová menu a efekt se přehraje nad jamkou v pozadí
  if (!W || !V) return; const id = shopSel.fx; $('shopModal').hidden = true; $('menu').style.visibility = 'hidden'; $('lobby').style.visibility = 'hidden'; demoUntil = performance.now() + 4200; preview = preview || { a: 0 };
  setTimeout(() => V.fx.win(id, W.cup[0], W.cup[1], false), 350); setTimeout(() => V.fx.win(id, W.cup[0], W.cup[1], true), 1700);
  setTimeout(() => { $('menu').style.visibility = ''; $('lobby').style.visibility = ''; demoUntil = 0; if (shopOpen) { $('shopModal').hidden = false; renderShop(); } }, 4300);
};

// --- hra proti botům
const bs = { course: 0, holes: 3, n: 2, lv: 2, time: 60 };
function chips(el, items, cur, on, cls = '') { el.innerHTML = items.map(([v, label, extra]) => `<button type="button" class="${cls}${v === cur ? ' on' : ''}" data-v="${v}">${label}</button>`).join(''); el.onclick = (e) => { const b = e.target.closest('[data-v]'); if (b && !b.disabled) { sfx.click(); on(+b.dataset.v); } }; }
const courseItems = () => [...C.COURSES.map((c, i) => [i, c.name]), [C.MIX, 'Mix']];
function renderBot() {
  chips($('botCourse'), courseItems(), bs.course, (v) => { bs.course = v; renderBot(); });
  chips($('botHoles'), K.CFG_OPTS.holes.map((v) => [v, v + ' jamek']), bs.holes, (v) => { bs.holes = v; renderBot(); });
  chips($('botN'), [1, 2, 3].map((v) => [v, v === 1 ? '1 soupeř' : v + ' soupeři']), bs.n, (v) => { bs.n = v; renderBot(); });
  chips($('botLv'), LEVELS.map(([v, n]) => [v, n]), bs.lv, (v) => { bs.lv = v; renderBot(); });
  chips($('botTime'), K.CFG_OPTS.time.map((v) => [v, v + ' s']), bs.time, (v) => { bs.time = v; renderBot(); });
  $('botLvInfo').textContent = LEVELS[bs.lv - 1][2];
}
$('bBot').onclick = () => { sfx.click(); audio(); renderBot(); $('botModal').hidden = false; };
$('botCancel').onclick = () => { $('botModal').hidden = true; };
$('botGo').onclick = () => { sfx.click(); audio(); $('botModal').hidden = true; enter(() => sendMsg({ t: 'bot', ...join({ level: bs.lv, n: bs.n, course: bs.course, cfg: { holes: bs.holes, time: bs.time, grace: 25 } }) })); };

// ------------------------------------------------------------------ čekárna
let lobSig = '';
function renderLobby() {
  const s = S; const host = s.host === me; $('lobCode').textContent = s.code;
  $('lobSub').textContent = s.quick ? (s.auto != null ? `Rychlá hra – začne se za ${s.auto} s, nebo jakmile se sejdou 4 hráči.` : 'Rychlá hra – čeká se na dalšího hráče.') : 'Pošli kód kamarádům, ať se připojí.';
  const sig = JSON.stringify([s.host, me, s.quick, s.course, s.cfg, s.players.map((p) => [p.name, p.color, p.bot, p.connected, p.wins])]);
  if (sig !== lobSig) {
    lobSig = sig;
    const used = new Set(s.players.map((p) => p.color));
    $('plist').innerHTML = Array.from({ length: K.MAX_PLAYERS }, (_, i) => {
      const p = s.players[i]; if (!p) return `<div class="prow empty"><span class="dot" style="--c:#555"></span><span>Volné místo</span><small></small></div>`;
      const mine = i === me; return `<div class="prow"><span class="dot" style="--c:${colorHex(p.color)}"></span><span>${esc(p.name)}${mine ? ' (ty)' : ''}${i === s.host ? ' ♛' : ''}</span><small>${p.bot ? 'bot' : p.connected ? p.wins + ' výher' : 'odpojen'}</small>${mine ? '<div class="swatches" id="lobSw"></div>' : ''}</div>`;
    }).join('');
    if ($('lobSw')) renderSwatches($('lobSw'), used, (i) => { if (!used.has(i)) pickColor(i); else toast('Tuhle barvu už má jiný hráč.'); }, s.players[me] ? s.players[me].color : -1);
    const can = host && !s.quick; const dis = !can;
    const mk = (id, items, cur, key, fn) => { chips($(id), items, cur, (v) => { if (can) fn(v); }); for (const b of $(id).children) b.disabled = dis && !(b.classList.contains('on')); };
    mk('lobCourse', courseItems(), s.course, 'course', (v) => sendMsg({ t: 'course', course: v }));
    mk('lobHoles', K.CFG_OPTS.holes.map((v) => [v, String(v)]), s.cfg.holes, 'holes', (v) => sendMsg({ t: 'cfg', cfg: { holes: v } }));
    mk('lobTime', K.CFG_OPTS.time.map((v) => [v, v + ' s']), s.cfg.time, 'time', (v) => sendMsg({ t: 'cfg', cfg: { time: v } }));
    mk('lobGrace', K.CFG_OPTS.grace.map((v) => [v, v + ' s']), s.cfg.grace, 'grace', (v) => sendMsg({ t: 'cfg', cfg: { grace: v } }));
  }
  $('cfgNote').textContent = s.quick ? 'V rychlé hře se hřiště losuje.' : host ? '' : 'Nastavení mění zakladatel hry.';
  $('hostActs').hidden = !host; $('lobStart').disabled = false;
  $('lobStatus').textContent = host ? (s.players.length < 2 ? 'Na hru jsou potřeba aspoň dva hráči, nebo zapni „doplnit boty“.' : '') : 'Čekáme, až zakladatel spustí hru…';
  previewLobby(s.course);
}
$('lobStart').onclick = () => { sfx.click(); audio(); sendMsg({ t: 'start', fill: $('fillBots').checked, level: 2, course: S.course }); };
$('lobLeave').onclick = () => { sendMsg({ t: 'leave' }); backToMenu(); };
$('lobCopy').onclick = async () => { try { await navigator.clipboard.writeText(S.code); toast('Kód zkopírován'); } catch (e) { toast('Kód: ' + S.code); } };

// ------------------------------------------------------------------ náhled ve 3D v menu a čekárně
let preview = null, previewKey = '';
function previewHole(c) {
  if (!V) return; const cc = c === C.MIX ? Math.floor(Math.random() * C.COURSES.length) : c; const key = 'p' + c; if (previewKey === key && W) return; previewKey = key;
  const k = c === C.MIX ? Math.floor(Math.random() * 6) : [0, 3, 4, 5][Math.floor(Math.random() * 4)];
  W = P.buildWorld(C.holeDef(cc, k)); V.setHole(W); V.setBalls([{ color: colorHex(Math.max(0, myColor)), name: '', mine: true, skin: myEq().skin }]); V.moveBall(0, W.tee[0], W.tee[1]); preview = { a: Math.random() * 6 };
}
function previewMenu() { previewKey = ''; previewHole(Math.floor(Math.random() * C.COURSES.length)); if (V && W) V.moveBall(0, W.tee[0], W.tee[1]); }
function previewLobby(c) { previewHole(c); }

// ------------------------------------------------------------------ hra: stav
let W = null, DF = null, ball = null, strokes = 0, lastShot = null, sunkLocal = false, doneSrv = 0, respawnAt = 0, acc = 0, lastRep = 0, lastMv = false, lastTick = 0, ccount = -1;
let cups = [];   // míčky ostatních, které padají do jamky (stejná fyzika jako u mého míčku)
let others = []; let holeT0 = 0, snapR = 0, scoreEnds = 0, sinkT = [];
const tObs = () => (Date.now() + offset - holeT0) / 1000;
let yaw = 0, pitch = 0.64, yawGoal = null, zoom = 1, topView = false, camInit = false, rotHold = 0; const camP = { x: 0, y: 5, z: 0 }, camL = { x: 0, y: 0, z: 0 };
let paused = false;

function hintYaw(x, z) {   // směr po nejkratší cestě k jamce (kamera se po ráně otočí tím směrem)
  let cx = Math.floor(x), cz = Math.floor(z); let tx = W.cup[0], tz = W.cup[1];
  for (let n = 0; n < 5; n++) {
    let best = null, bd = DF[cz * W.w + cx];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const nx = cx + dx, nz = cz + dz; if ((!dx && !dz) || nx < 0 || nz < 0 || nx >= W.w || nz >= W.h) continue; const v = DF[nz * W.w + nx]; if (v < bd) { bd = v; best = [nx, nz]; } }
    if (!best) break; cx = best[0]; cz = best[1]; tx = cx + 0.5; tz = cz + 0.5; if (Math.hypot(tx - x, tz - z) > 3.2) break;
  }
  if (Math.hypot(tx - x, tz - z) < 0.8) { tx = W.cup[0]; tz = W.cup[1]; }
  return Math.atan2(tz - z, tx - x);
}
function setupHole() {
  W = P.buildWorld(C.holeDef(GS.c, GS.k)); DF = P.distField(W); previewKey = ''; V.setHole(W);
  V.setBalls(S.players.map((p, i) => ({ color: colorHex(p.color), name: p.name, mine: i === me, skin: p.sk })));
  curClub = myClub(); const ct = $('clubTag'); ct.hidden = !curClub.id; ct.textContent = curClub.id ? `${curClub.name} +${Math.round((curClub.pw - 1) * 100)} %` : '';
  ball = P.newBall(W.tee[0], W.tee[1]); ball.sand = curClub.sand; strokes = 0; lastShot = { x: W.tee[0], z: W.tee[1] }; sunkLocal = false; doneSrv = 0; respawnAt = 0; acc = 0; lastMv = false; sinkT = S.players.map(() => 0); cups = S.players.map(() => null);
  others = S.players.map(() => ({ x: W.tee[0], z: W.tee[1], rx: W.tee[0], rz: W.tee[1], vx: 0, vz: 0, m: 0, s: 0, d: 0, recv: 0 }));
  yaw = hintYaw(W.tee[0], W.tee[1]); yawGoal = null; camInit = false; $('banner').hidden = true; $('scoreOv').hidden = true;
  for (let i = 0; i < S.players.length; i++) V.moveBall(i, W.tee[0], W.tee[1], 1);
  tipShown = false;
}
let tipShown = false, tipT = 0;
function onGame(m) {
  if (!S) return; const hole = !GS || m.hole !== GS.hole || m.c !== GS.c || m.k !== GS.k || S.matchId !== curMatch || !W || !ball;
  const prevPh = GS ? GS.ph : null; GS = m; holeT0 = m.at - m.el; snapR = m.snap ? m.snap.r : m.lim; ccount = -1;
  if (hole) { setupHole(); if (m.snap) applySnap(m.snap, true); }
  if (m.ph === 'play' && prevPh !== 'play') { $('intro').hidden = true; sfx.beep(true); if (!LS.get('golf_tip') && !tipShown) { tipShown = true; tipT = performance.now(); $('tip').hidden = false; } }
  if (m.ph === 'intro') { $('intro').hidden = false; $('iHole').textContent = `Jamka ${m.hole + 1} z ${m.of}`; $('iName').textContent = W.def.name; $('iPar').textContent = `Par ${m.par} · ${C.courseName(m.c)}`; $('iCount').textContent = ''; $('scoreOv').hidden = true; $('overOv').hidden = true; }
  if (m.ph === 'score') { scoreEnds = Date.now() + K.SCORE_S * 1000; renderScore(); }
  if (m.ph === 'over') { $('scoreOv').hidden = true; renderOver(); }
  else $('overOv').hidden = true;
  if (m.ph === 'play' && (prevPh === 'intro' || hole)) yawGoal = hintYaw(ball.x, ball.z);
}
function applySnap(m, silent) {
  snapR = m.r; if (!GS) return; const now = performance.now();
  m.b.forEach((b, i) => {
    if (i === me) { strokes = Math.max(strokes, b[5]); if (b[6] && !doneSrv) doneSrv = b[6]; return; }
    const o = others[i]; if (!o) return; o.x = b[0]; o.z = b[1]; o.vx = b[2]; o.vz = b[3]; o.m = b[4]; o.s = b[5]; o.d = b[6]; o.recv = now; if (silent) { o.rx = o.x; o.rz = o.z; }
  });
}
function onTick(m) { if (!GS) return; applySnap(m); if (m.ev) for (const e of m.ev) onEvent(e); }
function onEvent(e) {
  const [k, i] = e; const p = S.players[i]; if (!p) return;
  if (k === 'shot') { if (i !== me) { const o = others[i]; o.x = o.rx = e[2]; o.z = o.rz = e[3]; o.m = 1; sfx.hit(e[5], 0.35); V.fx.puff(e[2], e[3]); } }
  else if (k === 'pen') { if (i !== me) { const o = others[i]; V.fx.splash(o.rx, o.rz); sfx.splash(); } }
  else if (k === 'fin') {
    if (i === me) { doneSrv = e[2] ? 2 : 1; if (!e[2] && !sunkLocal) { banner(`Míček zvednut<small>${GS.cap} ran – nestíhal(a) jsi</small>`, 2600); sfx.bad(); } }
    else { const o = others[i]; if (e[2]) { startCup(i, o); V.fx.win(p.fx || '', W.cup[0], W.cup[1], e[3] === 1); sfx.cup(); toast(`${p.name} dokončil(a) jamku za ${e[3]}`, 1800); } else { sinkT[i] = -1; toast(`${p.name} zvedl(a) míček`, 1800); } }
  }
}
function banner(html, ms = 2200) { const b = $('banner'); b.innerHTML = html; b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; clearTimeout(banner.t); banner.t = setTimeout(() => { b.hidden = true; }, ms); }
const scoreWord = (s, par) => (s === 1 ? 'Hole in one!' : s - par <= -3 ? 'Albatros!' : s - par === -2 ? 'Eagle!' : s - par === -1 ? 'Birdie!' : s - par === 0 ? 'Par' : s - par === 1 ? 'Bogey' : s - par === 2 ? 'Double bogey' : '+' + (s - par));

// ------------------------------------------------------------------ hra: fyzika vlastního míčku
const canShoot = () => !!(GS && GS.ph === 'play' && ball && V && P.isRest(ball) && !sunkLocal && !doneSrv && strokes < GS.cap && !respawnAt && !paused && tObs() >= 0);
function stepMine(dt) {
  if (!ball || !GS || respawnAt || (!sunkLocal && GS.ph !== 'play')) return;
  acc = Math.min(acc + dt, 0.1); let n = 0; const t = tObs();
  while (acc >= P.DT && n < 14) {
    acc -= P.DT; n++; if (sunkLocal) { P.stepBall(W, ball, 0); continue; } const ev = P.stepBall(W, ball, t - acc);
    if (ball.hit > 0.9) { const nw = performance.now(); if (nw - lastTick > 70) { lastTick = nw; if (ball.hk === 'b') { sfx.boing(); V.fx.sparks(ball.x, ball.z, 0xff7a9a); } else { sfx.tick(clamp(ball.hit / 10, 0, 1)); if (ball.hit > 3) V.fx.sparks(ball.x, ball.z, 0xffffff); } } }
    if (ev === 'sink') { onSink(); return; }
    if (ev === 'hz') { onWater(); return; }
    if (ev === 'tp') { sfx.tele(); V.fx.tele(ball.x, ball.z, 0xd9a0ff); }
  }
}
function startCup(i, o) {   // míček soupeře dojede k jamce a spadne do ní vlastní tíhou
  const cb = P.newBall(o.rx, o.rz); const dx = W.cup[0] - o.rx, dz = W.cup[1] - o.rz, dc = Math.hypot(dx, dz) || 1;
  if (dc > 0.5) { cb.x = W.cup[0] - dx / dc * 0.5; cb.z = W.cup[1] - dz / dc * 0.5; }
  const sp = clamp(Math.hypot(o.vx, o.vz), 2, 4.5); cb.vx = dx / dc * sp; cb.vz = dz / dc * sp; cb.still = 0; cb.acc = 0; cb.age = 0; cups[i] = cb; sinkT[i] = 0.001;
}
function stepCup(cb, dt) {
  cb.age += dt; cb.acc = Math.min(cb.acc + dt, 0.1);
  if (!cb.sunk && cb.age > 1.4) { cb.x = W.cup[0]; cb.z = W.cup[1]; cb.vx = cb.vz = 0; cb.y = P.BR + 0.02; }   // kdyby se míček přes jamku jen odrazil, stejně ho tam dostaneme
  while (cb.acc >= P.DT) { cb.acc -= P.DT; P.stepBall(W, cb, 0); }
}
function onSink() {
  sunkLocal = true; V.fx.win((S.players[me] && S.players[me].fx) || '', W.cup[0], W.cup[1], strokes === 1); sendMsg({ t: 'sink', x: ball.x, z: ball.z });
  const ace = strokes === 1; (ace ? sfx.ace : sfx.cup)(); banner(`${scoreWord(strokes, GS.par)}<small>${strokes} ${strokes === 1 ? 'rána' : strokes < 5 ? 'rány' : 'ran'} · par ${GS.par}</small>`, 2800);
  sendRep(true);
}
function onWater() {
  sfx.splash(); V.fx.splash(ball.x, ball.z); sendMsg({ t: 'pen' }); strokes = Math.min(GS.cap, strokes + 1); respawnAt = performance.now() + 900; sinkT[me] = -1;
  banner('Plouf!<small>+1 rána, zpátky na místo úderu</small>', 1600);
}
function sendRep(force) {
  const mv = !P.isRest(ball), now = performance.now();
  if (force || (mv && now - lastRep > 85) || mv !== lastMv || (!mv && now - lastRep > 1000)) { sendMsg({ t: 'rep', x: +ball.x.toFixed(2), z: +ball.z.toFixed(2), vx: +ball.vx.toFixed(2), vz: +ball.vz.toFixed(2), m: mv ? 1 : 0 }); lastRep = now; lastMv = mv; }
}
function shoot(ang, pow) {
  lastShot = { x: ball.x, z: ball.z }; P.shoot(ball, ang, pow, curClub.pw); strokes++; acc = 0; sendMsg({ t: 'shot', x: +ball.x.toFixed(2), z: +ball.z.toFixed(2), a: +ang.toFixed(3), p: +pow.toFixed(3) });
  sfx.hit(pow); V.fx.puff(ball.x, ball.z); lastRep = 0; sendRep(true); LS.set('golf_tip', '1'); $('tip').hidden = true; yawGoal = null;
}

// ------------------------------------------------------------------ ovládání: prak (táhni dozadu a pusť), kamera
const ptr = new Map(); let pull = null;
const pullMax = () => clamp(Math.min(innerWidth, innerHeight) * 0.34, 90, 210);
function pullVec() {
  if (!pull) return null; const L = Math.hypot(pull.dx, pull.dy); const lim = pullMax(); const p = clamp((L - 14) / (lim - 14), 0, 1); const ok = L >= 24;
  const fw = L ? pull.dy / L : 0, rg = L ? -pull.dx / L : 0; const c = Math.cos(yaw), s = Math.sin(yaw);
  return { ok, p, dx: c * fw - s * rg, dz: s * fw + c * rg };
}
glc.addEventListener('contextmenu', (e) => e.preventDefault());
function ballHit(e) {   // je prst/myš na míčku? (jen odtud se dá střílet, jinde se otáčí kamera)
  if (!ball || !W) return false; const gy = P.heightAt(W, ball.x, ball.z).y + P.BR; const [sx, sy] = V.project(ball.x, gy, ball.z, innerWidth, innerHeight);
  const r = (e.pointerType === 'mouse' ? 40 : 58) / Math.sqrt(zoom); return Math.hypot(e.clientX - sx, e.clientY - sy) <= r;
}
glc.addEventListener('pointerdown', (e) => {
  if (screen !== 'game' || !GS) return; audio(); try { glc.setPointerCapture(e.pointerId); } catch (x) { /* nic */ }
  const shoot0 = (e.pointerType !== 'mouse' || e.button === 0) && pull === null && ptr.size === 0 && canShoot() && ballHit(e);
  ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, cam: !shoot0 });
  if (shoot0) { pull = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 }; $('tip').hidden = true; }
});
glc.addEventListener('pointermove', (e) => {
  const p = ptr.get(e.pointerId); if (!p) return;
  if (p.cam) {
    const cams = [...ptr.values()].filter((q) => q.cam);
    if (cams.length >= 2) { const o = cams.find((q) => q !== p); const d0 = Math.hypot(p.x - o.x, p.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y); if (d0 > 8 && d1 > 8) zoom = clamp(zoom * d0 / d1, 0.55, 2.2); }
    yaw -= (e.clientX - p.x) * 0.0065; pitch = clamp(pitch + (e.clientY - p.y) * 0.004, 0.28, 1.3); yawGoal = null; p.x = e.clientX; p.y = e.clientY; return;
  }
  if (pull && pull.id === e.pointerId) { pull.dx = e.clientX - pull.x0; pull.dy = e.clientY - pull.y0; }
});
function endPtr(e, cancel) {
  const p = ptr.get(e.pointerId); if (!p) return; ptr.delete(e.pointerId);
  if (pull && pull.id === e.pointerId) { const v = pullVec(); pull = null; V.aim(false); $('power').hidden = true; if (!cancel && v && v.ok && canShoot()) shoot(Math.atan2(v.dz, v.dx), Math.max(0.04, v.p)); }
}
glc.addEventListener('pointerup', (e) => endPtr(e, false)); glc.addEventListener('pointercancel', (e) => endPtr(e, true));
glc.addEventListener('wheel', (e) => { if (screen === 'game') { zoom = clamp(zoom * (e.deltaY > 0 ? 1.08 : 0.92), 0.55, 2.2); e.preventDefault(); } }, { passive: false });
const keys = new Set(); addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; keys.add(e.code); if (e.code === 'KeyT' && screen === 'game') toggleTop(); if (e.code === 'Escape' && screen === 'game') { if (pull) { pull = null; V.aim(false); $('power').hidden = true; } else togglePause(); } }); addEventListener('keyup', (e) => keys.delete(e.code)); addEventListener('blur', () => { keys.clear(); rotHold = 0; });
for (const [id, d] of [['rotL', -1], ['rotR', 1]]) { const b = $(id); b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audio(); rotHold = d; yawGoal = null; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (x) { /* nic */ } }); for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { if (rotHold === d) rotHold = 0; b.classList.remove('on'); }); }
function toggleTop() { topView = !topView; $('topBtn').classList.toggle('on', topView); sfx.click(); }
$('topBtn').onclick = toggleTop;
function openPause() { paused = true; $('pauseModal').hidden = false; }
function closePause() { paused = false; $('pauseModal').hidden = true; }
const togglePause = () => (paused ? closePause() : openPause());
$('pauseBtn').onclick = () => { sfx.click(); openPause(); }; $('pResume').onclick = closePause;
$('pLeave').onclick = () => { sendMsg({ t: 'leave' }); backToMenu(); };

// ------------------------------------------------------------------ hra: kamera, další hráči, vykreslení
const lerp = (a, b, k) => a + (b - a) * k;
function updateCamera(dt) {
  if (!W) return; const k = 1 - Math.exp(-dt * 7); const cx = W.w / 2, cz = W.h / 2; let px, py, pz, lx, ly, lz; const up = V.cam.up;
  const bx = ball ? ball.x : W.tee[0], bz = ball ? ball.z : W.tee[1]; const gh = (x, z) => P.heightAt(W, x, z).y;
  const ph = GS ? GS.ph : 'score'; const f = [Math.cos(yaw), Math.sin(yaw)];
  const behind = () => { const d = 5.4 * zoom; return { px: bx - f[0] * d * Math.cos(pitch), py: gh(bx, bz) + 0.2 + d * Math.sin(pitch), pz: bz - f[1] * d * Math.cos(pitch), lx: bx + f[0] * 1.4, ly: gh(bx, bz) + 0.1, lz: bz + f[1] * 1.4 }; };
  let tgt; up.set(0, 1, 0);
  if (ph === 'intro' && GS) {
    const u = clamp(1 + tObs() / K.INTRO_S, 0, 1); const e = u * u * (3 - 2 * u); const b = behind(); const R = Math.max(W.w, W.h); const hf = Math.atan2(W.cup[1] - W.tee[1], W.cup[0] - W.tee[0]);
    const o = { px: cx - Math.cos(hf) * R * 0.15, py: R * 0.7 + 3, pz: cz - Math.sin(hf) * R * 0.15 + R * 0.35, lx: W.cup[0], ly: 0, lz: W.cup[1] };
    tgt = { px: lerp(o.px, b.px, e), py: lerp(o.py, b.py, e), pz: lerp(o.pz, b.pz, e), lx: lerp(o.lx, b.lx, e), ly: lerp(o.ly, b.ly, e), lz: lerp(o.lz, b.lz, e) }; camInit = false;
    camP.x = tgt.px; camP.y = tgt.py; camP.z = tgt.pz; camL.x = tgt.lx; camL.y = tgt.ly; camL.z = tgt.lz;
  } else if (ph === 'score' || ph === 'over' || !GS) {
    preview = preview || { a: 0 };
    if (ph === 'over' && performance.now() < celebUntil) { preview.a += dt * 0.55; const hh = gh(W.cup[0], W.cup[1]); tgt = { px: W.cup[0] + Math.cos(preview.a) * 5.8, py: hh + 3.6, pz: W.cup[1] + Math.sin(preview.a) * 5.8, lx: W.cup[0], ly: hh + 1.5, lz: W.cup[1] }; }
    else { preview.a += dt * 0.15; const R = Math.max(W.w, W.h) * 0.8 + 5; tgt = { px: cx + Math.cos(preview.a) * R, py: R * 0.55 + 2, pz: cz + Math.sin(preview.a) * R * 0.8, lx: cx, ly: 0, lz: cz }; }
  } else if (topView) {
    const H = clamp(Math.max(W.w, W.h) * 0.62 * zoom + 3, 7, 40); up.set(f[0], 0, f[1]); tgt = { px: cx - f[0] * 0.02, py: H, pz: cz - f[1] * 0.02, lx: cx, ly: 0, lz: cz };
  } else tgt = behind();
  if (!camInit) { camP.x = tgt.px; camP.y = tgt.py; camP.z = tgt.pz; camL.x = tgt.lx; camL.y = tgt.ly; camL.z = tgt.lz; camInit = true; }
  else if (ph !== 'intro') { const kk = ph === 'play' && !topView ? 1 - Math.exp(-dt * 9) : k; camP.x = lerp(camP.x, tgt.px, kk); camP.y = lerp(camP.y, tgt.py, kk); camP.z = lerp(camP.z, tgt.pz, kk); camL.x = lerp(camL.x, tgt.lx, kk); camL.y = lerp(camL.y, tgt.ly, kk); camL.z = lerp(camL.z, tgt.lz, kk); }
  V.cam.position.set(camP.x, camP.y, camP.z); V.cam.lookAt(camL.x, camL.y, camL.z);
}
function updateOthers(dt) {
  if (!GS || !S) return; const now = performance.now();
  S.players.forEach((p, i) => {
    if (i === me) return; const o = others[i]; if (!o) return; let vis = 1;
    const cb = sinkT[i] > 0 ? cups[i] : null; if (cb) { sinkT[i] += dt; stepCup(cb, dt); o.rx = cb.x; o.rz = cb.z; }
    else if (sinkT[i] < 0 || o.d === 1 || p.left) vis = 0;
    else if (o.d === 2) vis = 0;
    else { const age = Math.min(0.3, (now - o.recv) / 1000); const tx = o.m ? o.x + o.vx * age : o.x, tz = o.m ? o.z + o.vz * age : o.z; const k = 1 - Math.exp(-dt * (o.m ? 16 : 10)); o.rx = lerp(o.rx, tx, k); o.rz = lerp(o.rz, tz, k); }
    const b = V.balls[i]; if (b) b.sink = cb ? P.BR - cb.y : 0;
    V.moveBall(i, o.rx, o.rz, vis);
  });
}
let hudT = 0, perfAcc = 0, perfN = 0, lowQ = false;
function updateHud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.1; if (!GS || !S) return;
  $('hName').textContent = `Jamka ${GS.hole + 1}/${GS.of}`; $('hSub').textContent = `${W ? W.def.name : ''} · Par ${GS.par}`; $('sVal').textContent = strokes;
  const r = GS.ph === 'play' ? Math.max(0, snapR - 0) : GS.lim; $('tVal').textContent = GS.ph === 'play' ? r : GS.lim; $('tBar').style.transform = `scaleX(${clamp(r / GS.lim, 0, 1)})`; $('timer').classList.toggle('low', GS.ph === 'play' && r <= 10);
  $('board').innerHTML = S.players.map((p, i) => { const o = i === me ? { d: doneSrv, s: strokes } : others[i] || { d: 0, s: 0 }; const st = o.d === 2 ? `<span class="st ok">✓${o.s}</span>` : o.d === 1 ? `<span class="st bad">✗</span>` : `<span class="st">${o.s || 0}</span>`; return `<div class="brow${i === me ? ' me' : ''}"><span class="dot" style="--c:${colorHex(p.color)}"></span><span class="nm">${esc(p.name)}</span>${st}<span class="tt">${GS.totals[i]}</span></div>`; }).join('');
  if (GS.ph === 'intro') { const left = -tObs(); const n = Math.ceil(left); if (left <= 3 && left > 0) { if (n !== ccount) { ccount = n; $('iCount').textContent = n; sfx.beep(false); } } else if (left > 3) $('iCount').textContent = ''; }
  if (GS.ph === 'score') { const sec = Math.max(0, Math.ceil((scoreEnds - Date.now()) / 1000)); const c = $('scoreCount'); if (c) c.textContent = `Další jamka za ${sec} s`; }
  if (!$('tip').hidden && (performance.now() - tipT > 7000 || !canShoot())) $('tip').hidden = true;
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!V) return;
  if (screen === 'game' && GS && W) {
    if (rotHold || keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('ArrowRight') || keys.has('KeyD')) { const d = rotHold || ((keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0)); yaw += d * 1.9 * dt; yawGoal = null; }
    if (yawGoal !== null) { const d = angDiff(yaw, yawGoal); yaw += d * Math.min(1, dt * 4.5); if (Math.abs(d) < 0.01) yawGoal = null; }
    if (respawnAt && performance.now() >= respawnAt) { respawnAt = 0; ball.x = lastShot.x; ball.z = lastShot.z; ball.vx = ball.vz = 0; ball.y = P.BR; ball.vy = 0; ball.still = 99; ball.sunk = false; sinkT[me] = 0; sendRep(true); yawGoal = hintYaw(ball.x, ball.z); }
    const wasMoving = ball && !P.isRest(ball); stepMine(dt); if (ball && !sunkLocal && GS.ph === 'play' && !respawnAt) { sendRep(false); if (wasMoving && P.isRest(ball)) { yawGoal = hintYaw(ball.x, ball.z); sendRep(true); } }
    const mb = V.balls[me]; if (mb) mb.sink = P.BR - ball.y;
    V.moveBall(me, ball.x, ball.z, sinkT[me] < 0 ? 0 : 1);
    if (pull) { const v = pullVec(); if (v && v.ok && canShoot()) { V.aim(true, ball.x, ball.z, v.dx, v.dz, v.p, curClub.aim); $('power').hidden = false; $('pFill').style.width = v.p * 100 + '%'; $('pTxt').textContent = Math.round(v.p * 100) + ' %'; } else { V.aim(false); $('power').hidden = true; } }
    updateOthers(dt);
  } else if (screen !== 'game' && W) { preview = preview || { a: 0 }; V.cam.up.set(0, 1, 0); V.aim(false);
    if (demoUntil > performance.now()) { preview.a += dt * 0.5; const hh = P.heightAt(W, W.cup[0], W.cup[1]).y; V.cam.position.set(W.cup[0] + Math.cos(preview.a) * 5.6, hh + 3.4, W.cup[1] + Math.sin(preview.a) * 5.6); V.cam.lookAt(W.cup[0], hh + 1.4, W.cup[1]); }
    else { preview.a += dt * 0.13; const cx = W.w / 2, cz = W.h / 2, R = Math.max(W.w, W.h) * 0.62 + 5; V.cam.position.set(cx + Math.cos(preview.a) * R, R * 0.62 + 2.5, cz + Math.sin(preview.a) * R * 0.8); V.cam.lookAt(cx, 0, cz); } }
  if (screen === 'game' && W) updateCamera(dt);
  V.update(dt, screen === 'game' && GS ? tObs() : performance.now() / 1000);
  V.render(); updateHud(dt);
  if (screen === 'game' && GS && GS.ph === 'play') { perfAcc += dt; perfN++; if (perfN === 90) { const avg = perfAcc / perfN; perfAcc = perfN = 0; if (avg > 0.036 && !lowQ) { lowQ = true; V.setShadows(false); V.renderer.setPixelRatio(1); resize(); } } }
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ výsledky
function scoreTable(rows, totals, pars, upto, winners) {
  const n = S.players.length; const heads = pars.map((p, h) => `<th>${h + 1}</th>`).join('');
  const order = S.players.map((p, i) => i).sort((a, b) => totals[a] - totals[b]);
  const body = order.map((i) => { const p = S.players[i]; const cells = pars.map((par, h) => { const v = rows[i] && rows[i][h]; if (v === undefined) return '<td>·</td>'; const cls = v < par ? 'under' : v > par ? 'over' : ''; return `<td class="${cls}">${v}</td>`; }).join(''); return `<tr class="${winners && winners.includes(i) ? 'gold' : ''}${i === me ? ' me' : ''}"><td class="nm"><span style="--c:${colorHex(p.color)}"></span>${esc(p.name)}</td>${cells}<td class="sc">${totals[i]}</td></tr>`; }).join('');
  const parRow = `<tr><td class="nm">Par</td>${pars.map((p) => `<td>${p}</td>`).join('')}<td class="sc">${pars.reduce((a, b) => a + b, 0)}</td></tr>`;
  return `<table class="tbl"><thead><tr><th class="nm"></th>${heads}<th>Σ</th></tr></thead><tbody>${parRow}${body}</tbody></table>`;
}
function renderScore() {
  const g = GS; if (!g || g.ph !== 'score') return; const res = g.res || []; const hl = C.holeList(S.course, S.cfg.holes, g.seed); const pars = []; for (let h = 0; h <= g.hole; h++) pars.push(C.holeDef(hl[h][0], hl[h][1]).par);
  const rowsDone = g.rows;
  const lines = res.map((r, i) => ({ i, r })).sort((a, b) => a.r.s - b.r.s).map(({ i, r }) => `<tr class="${i === me ? 'me' : ''}"><td class="nm"><span style="--c:${colorHex(S.players[i].color)}"></span>${esc(S.players[i].name)}</td><td class="sc ${r.fin ? (r.s < g.par ? 'under' : r.s > g.par ? 'over' : '') : 'dnf'}">${r.fin ? r.s : r.s + ' ✗'}</td><td>${r.fin ? scoreWord(r.s, g.par) : 'nedokončeno'}</td></tr>`).join('');
  $('scoreOv').innerHTML = `<div class="ovbox"><h2>Jamka ${g.hole + 1} hotova</h2><div class="sub">${esc(W.def.name)} · par ${g.par}</div><table class="tbl"><tbody>${lines}</tbody></table><div style="height:10px"></div>${scoreTable(rowsDone, g.totals, pars, g.hole, null)}<div class="count" id="scoreCount"></div></div>`;
  $('scoreOv').hidden = false;
}
let celebFor = -1, celebUntil = 0, celebT = 0;
function startCeleb(r) {   // oslava vítěze: pár vteřin kamera krouží kolem jamky a hrají se efekty výhry vítězů, až potom naskočí tabulka
  const win = r.winners || []; if (!win.length || win.length === S.players.length || !W) return;
  celebUntil = performance.now() + 4300; banner(`Vítěz<small>${esc(win.map((i) => S.players[i].name).join(' a '))}</small>`, 3800); preview = preview || { a: 0 };
  [200, 1100, 2000, 2900].forEach((d) => setTimeout(() => { if (curMatch !== celebFor || !W) return; for (const w of win) V.fx.win((S.players[w] && S.players[w].fx) || '', W.cup[0], W.cup[1], true); }, d));
}
function renderOver() {
  const r = S && S.result; if (!r || !GS) return;
  if (celebFor !== curMatch) { celebFor = curMatch; startCeleb(r); }
  if (performance.now() < celebUntil) { clearTimeout(celebT); celebT = setTimeout(renderOver, celebUntil - performance.now() + 40); $('overOv').hidden = true; return; } const pars = r.pars; const win = r.winners; const names = win.map((i) => S.players[i].name);
  const draw = win.length === S.players.length; const youWin = win.includes(me) && !draw;
  const my = r.coins && r.coins[me];
  const rem = S.rematch; const need = S.players.filter((p) => !p.bot && !p.left).length; const got = S.players.filter((p, i) => !p.bot && rem[i]).length;
  $('overOv').innerHTML = `<div class="ovbox"><h2>${draw ? 'Remíza' : youWin ? 'Vyhrál(a) jsi!' : `Vyhrál(a) ${esc(names.join(' a '))}`}</h2><div class="sub">${C.courseName(S.course)} · ${pars.length} jamek</div>${scoreTable(r.rows, r.totals, pars, pars.length, win)}${my ? `<div class="reward"><i class="coin"></i>+${my.gain} coinů</div>` : ''}<div class="acts"><button class="btn ghost" id="oMenu" type="button"><b>Menu</b></button><button class="btn main" id="oAgain" type="button"${rem[me] && !S.solo ? ' disabled' : ''}><b>${rem[me] && !S.solo ? `Čekám (${got}/${need})` : 'Odveta'}</b></button></div></div>`;
  $('overOv').hidden = false; $('oMenu').onclick = () => { sendMsg({ t: 'leave' }); backToMenu(); }; $('oAgain').onclick = () => { sfx.click(); sendMsg({ t: 'rematch' }); };
  if (youWin && !renderOver.done) { renderOver.done = curMatch; sfx.ace(); } if (renderOver.done !== curMatch && youWin) { renderOver.done = curMatch; }
}

// ------------------------------------------------------------------ start
window.__golf = { get V() { return V; }, get S() { return S; }, get GS() { return GS; }, get ball() { return ball; }, get W() { return W; }, get strokes() { return strokes; }, get yaw() { return yaw; }, set yaw(v) { yaw = v; }, shoot, canShoot, get me() { return me; }, tObs };
syncAudioUi(); refreshProfile();
const saved = SS.get('golf_room'); if (saved) { try { const r = JSON.parse(saved); connect().then(() => sendMsg({ t: 'resume', code: r.code, token: r.token })).catch(() => SS.del('golf_room')); } catch (e) { SS.del('golf_room'); } }
