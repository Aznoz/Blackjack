// TANKOVÉ SOUBOJE – klient: menu, arzenál, canvas grafika (soumrak, oranžový destruktivní terén, tanky), míření, jízda, bedny, boti i online.
// Výstřely i výbuchy počítá server (physics.js je stejný soubor jako na serveru), klient je jen přehrává a zaměřuje.
import * as P from './physics.js?v=15';
const { W, H, WEAPONS, ORDER, COLORS, MAX_HP, FUEL_MAX } = P;

const CFG = window.TANKS_CONFIG || {};
const $ = (id) => document.getElementById(id);
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nic */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* nic */ } } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const API = String(CFG.SERVER_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/tanks\/?$/, '');
const ICON = { std: '🎯', big: '💣', triple: '🔱', bounce: '🏀', roller: '🟢', trap: '🪤', laser: '🔴', cluster: '🎆', sniper: '🔭', nuke: '☢️', five: '🌠', mega: '💥', napalm: '🔥', airstrike: '✈️', bounce4: '🪀', megacluster: '🎇', doom: '🌋', repair: '🔧', repair2: '🧰' };

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
const myName = () => { const el = $('name'); const v = el && !el.closest('[hidden]') ? el.value.trim() : ''; return v || (prof && prof.name) || LS.get('tanks_name') || undefined; };

let prof = null;           // profil z účtu (postup, zůstatek, munice)
async function call(action, body) {
  const r = await fetch(API + '/api/tanks/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ident(), ...body }), signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Chyba ' + r.status); return j;
}

// ------------------------------------------------------------------ zvuk (syntetický)
let ac = null, noiseBuf = null, muted = LS.get('tanks_mute') === '1';
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; }
function tone(freq, dur, type = 'triangle', vol = 0.07, slide = 0, delay = 0) {
  if (muted) return; const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + delay; o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(25, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur, vol, f0, f1, delay = 0) {
  if (muted) return; const a = audio(); if (!a) return;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; const t0 = a.currentTime + delay; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t0 + dur);
  const g = a.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(t0); s.stop(t0 + dur + 0.05);
}
const sfx = {
  fire() { tone(170, .22, 'sawtooth', .09, -120); noise(.25, .22, 2200, 300); },
  boom(r = 40) { const k = clamp(r / 60, .5, 2); noise(.5 + .35 * k, .38, 1400 + 600 * k, 70); tone(95, .45 * k, 'sine', .22, -60); },
  pick() { tone(660, .09, 'triangle', .08); tone(990, .14, 'triangle', .08, 0, .08); },
  heal() { [523, 659, 784].forEach((f, i) => tone(f, .16, 'sine', .07, 0, i * .09)); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .2, 'triangle', .09, 0, i * .12)); },
  lose() { tone(330, .2, 'triangle', .08); tone(247, .3, 'triangle', .08, 0, .17); tone(185, .4, 'triangle', .08, 0, .36); },
  tick() { tone(1100, .03, 'square', .025); },
  turn() { tone(520, .09, 'sine', .07); tone(780, .12, 'sine', .07, 0, .09); },
  click() { tone(800, .04, 'square', .03); },
};
function setMuted(m) { muted = m; LS.set('tanks_mute', m ? '1' : '0'); $('muteBtn').textContent = m ? '🔇' : '🔊'; $('pMute').innerHTML = `<b>Zvuk: ${m ? 'vypnutý' : 'zapnutý'}</b>`; }

// ------------------------------------------------------------------ stav
let ws = null, S = null, me = -1, session = null, wantOpen = false, retry = 0, outbox = [], connTimer = null;
let screen = 'menu';
let fireSent = false, sel = 'std', turnEndAt = 0, lastTurnNo = -1, overTimer = null, lastSyncAt = 0, lastTick = -1;
let driveDir = 0, aimSentAt = 0, aimTimer = null;
const R = {
  demoH: P.genTerrain(4242), h: null, tk: [], crates: [], mines: [], fx: [], shake: 0, aim: [{ a: 45, p: 60 }, { a: 135, p: 60 }], trace: null, shot: null, clouds: [], t: 0,
};
R.h = R.demoH;
const newTk = (x, face) => ({ x, dx: x, y: 0, tilt: 0, hp: MAX_HP, face, ang: face > 0 ? 45 : 135, dead: false, flash: 0, recoil: 0, wheel: 0, col: 0, smokeT: 0 });
R.tk = [newTk(300, 1), newTk(W - 300, -1)];
for (let i = 0; i < 6; i++) R.clouds.push({ x: Math.random() * W, y: 60 + Math.random() * 240, s: .6 + Math.random() * 1.1, v: 4 + Math.random() * 8 });

function resetMatch() {
  R.fx = []; R.crates = []; R.mines = []; R.trace = null; R.shot = null; R.shake = 0;
  R.aim = [{ a: 45, p: 60 }, { a: 135, p: 60 }];
  R.tk = [newTk(S.x[0], 1), newTk(S.x[1], -1)];
  for (let i = 0; i < 2; i++) { R.tk[i].hp = S.hp[i]; R.tk[i].y = P.groundAt(R.h, R.tk[i].x); R.tk[i].col = S.players[i].color; }
  sel = 'std'; fireSent = false; lastTurnNo = -1; driveDir = 0; lastTick = -1;
  $('over').hidden = true; if (overTimer) { clearTimeout(overTimer); overTimer = null; }
}

// ------------------------------------------------------------------ obrazovky
function show(name) {
  screen = name;
  $('menu').hidden = name !== 'menu'; $('lobby').hidden = name !== 'lobby'; $('game').hidden = name !== 'game';
  if (name !== 'game') { if (R.h !== R.demoH) { R.h = R.demoH; terrDirty = true; } R.tk[0].x = R.tk[0].dx = 300; R.tk[1].x = R.tk[1].dx = W - 300; R.tk.forEach((t) => { t.hp = MAX_HP; t.dead = false; t.col = 0; }); R.tk[1].col = 1; R.crates = []; R.fx = []; R.shot = null; R.trace = null; }
  $('back').hidden = false;
}
function toast(t) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, 3200); }
function setStatus(t, err) { const e = $('menuStatus'); e.textContent = t || ''; e.className = 'status' + (err ? ' err' : ''); }
const openModal = (id) => { $(id).hidden = false; };
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-close]'); if (c) { const m = c.closest('.modal'); if (m) m.hidden = true; return; }
  if (e.target.classList && e.target.classList.contains('modal')) e.target.hidden = true;
});

// ------------------------------------------------------------------ profil a menu
async function refreshProfile() {
  try {
    const j = await call('me', {});
    if (!j || !j.account) return null;
    prof = j; renderProfile(); return j;
  } catch (e) { return null; }
}
function renderProfile() {
  if (!prof) return;
  const t = prof.tank;
  $('prof').hidden = false; $('coinChip').hidden = false; $('coinNum').textContent = prof.coins.toLocaleString('cs-CZ');
  $('pLvl').textContent = t.lvl; $('pName').textContent = prof.name;
  const span = t.next ? t.next - t.from : 1; $('pXp').style.width = (t.next ? clamp((t.xp - t.from) / span, 0, 1) * 100 : 100) + '%';
  $('pXpTxt').textContent = t.next ? `${t.xp - t.from} / ${span} XP do úrovně ${t.lvl + 1}` : 'Maximální úroveň';
  $('pRec').textContent = `${t.wins} výher · ${t.losses} proher` + (prof.streak >= 2 ? ` · série ${prof.streak}🔥` : '');
  $('nameField').hidden = !!prof.linked;
  if (!prof.linked && !$('name').value) $('name').value = LS.get('tanks_name') || prof.name || '';
  if ($('shopModal') && !$('shopModal').hidden) renderShop();
}
let meTries = 0;
async function bootProfile() { const j = await refreshProfile(); if (!j && ++meTries <= 20) setTimeout(bootProfile, Math.min(5000, 1200 * meTries)); }

function botMenu() {
  const RW = (prof && prof.rewards) || { botWin: { 1: 100, 2: 160, 3: 240 }, botLose: { 1: 30, 2: 45, 3: 60 } }; const rw = RW.botWin, rl = RW.botLose;
  const L = [[1, 'Rekrut', 'Občas se netrefí a míří nepřesně.'], [2, 'Seržant', 'Trefuje poměrně přesně a sbírá bedny.'], [3, 'Generál', 'Skoro vždycky trefí. Hodně štěstí.']];
  $('botLevels').innerHTML = L.map(([n, nm, ds]) => `<button class="lv" type="button" data-lv="${n}"><span><b>${nm}</b><small>${ds}</small></span><span class="rw"><span class="coin"></span> +${rw[n]}<small>prohra +${rl[n]}</small></span></button>`).join('');
  openModal('botModal');
}
$('botLevels').addEventListener('click', (e) => { const b = e.target.closest('[data-lv]'); if (!b) return; $('botModal').hidden = true; startGame({ t: 'bot', level: +b.dataset.lv }); });
$('bBot').onclick = () => { audio(); botMenu(); };
$('bQuick').onclick = () => { audio(); startGame({ t: 'quick' }); };
$('bCreate').onclick = () => { audio(); startGame({ t: 'create' }); };
$('joinForm').onsubmit = (e) => { e.preventDefault(); audio(); const c = $('code').value.trim().toUpperCase(); if (c.length !== 4) { setStatus('Kód má 4 písmena.', true); return; } startGame({ t: 'join', code: c }); };
$('bShop').onclick = () => { audio(); renderShop(); openModal('shopModal'); refreshProfile(); };
$('bHow').onclick = () => openModal('howModal');
$('muteBtn').onclick = () => { setMuted(!muted); audio(); };
$('pMute').onclick = () => setMuted(!muted);
// ------------------------------------------------------------------ celá obrazovka + otočení na šířku
const rootEl = document.documentElement;
const fsOK = !!(rootEl.requestFullscreen || rootEl.webkitRequestFullscreen);
const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
let lockWhy = '';
async function lockLand(verbose) { // zámek orientace jde jen v celé obrazovce; zkusí se víc způsobů, protože prohlížeče se liší
  if (!coarse) return false;   // na počítači se nic zamykat nemá
  lockWhy = '';
  const so = screen.orientation;
  for (const mode of ['landscape', 'landscape-primary']) {
    try { if (so && so.lock) { await so.lock(mode); return true; } } catch (e) { lockWhy = (e && e.name) || 'chyba'; }
  }
  try { const old = screen.lockOrientation || screen.mozLockOrientation || screen.msLockOrientation; if (old && old.call(screen, 'landscape')) return true; } catch (e) { /* nic */ }
  if (verbose && window.innerHeight > window.innerWidth) toast(so && so.lock ? `Telefon zámek na šířku nepovolil (${lockWhy || 'neznámý důvod'}). Zkus zapnout automatické otáčení v telefonu a otočit ho.` : 'Tenhle prohlížeč neumí zamknout šířku, otoč telefon ručně.');
  return false;
}
async function enterFs() {
  try { if (rootEl.requestFullscreen) await rootEl.requestFullscreen({ navigationUI: 'hide' }); else if (rootEl.webkitRequestFullscreen) rootEl.webkitRequestFullscreen(); } catch (e) { /* prohlížeč nepustil */ }
  await lockLand(true);
}
function exitFs() {
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* nic */ }
  try { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (e) { /* nic */ }
}
function autoFs() { if (fsOK && coarse && !isFs() && LS.get('tanks_fs') !== '0') enterFs(); }   // na dotykových zařízeních se při startu hry zkusí celá obrazovka + šířka (jde jen z klepnutí)
function toggleFs() { if (isFs()) { LS.set('tanks_fs', '0'); exitFs(); } else { LS.set('tanks_fs', '1'); enterFs(); } }
function syncFs() { const on = isFs(); if (on && coarse) lockLand(false); $('fsBtn').textContent = on ? '⤢' : '⛶'; $('fsBtn').setAttribute('aria-label', on ? 'Ukončit celou obrazovku' : 'Celá obrazovka'); $('pFs').innerHTML = `<b>Celá obrazovka: ${on ? 'zapnutá' : 'vypnutá'}</b>`; }
if (fsOK) { $('fsBtn').hidden = false; $('pFs').hidden = false; $('fsBtn').onclick = toggleFs; $('pFs').onclick = toggleFs; document.addEventListener('fullscreenchange', syncFs); document.addEventListener('webkitfullscreenchange', syncFs); syncFs(); }
$('code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
$('name').addEventListener('change', () => LS.set('tanks_name', $('name').value.trim()));

function renderShop() {
  if (!prof) { $('shopLvl').textContent = 'Načítám účet…'; return; }
  const t = prof.tank;
  $('shopCoins').textContent = prof.coins.toLocaleString('cs-CZ');
  $('shopLvl').innerHTML = `<div class="plvl">${t.lvl}</div><div class="pinfo"><div class="pname">Úroveň ${t.lvl}</div><div class="xpbar"><i style="width:${t.next ? clamp((t.xp - t.from) / (t.next - t.from), 0, 1) * 100 : 100}%"></i></div><div class="psub"><span>${t.next ? `${t.xp - t.from} / ${t.next - t.from} XP` : 'maximum'}</span><span>${t.wins} výher</span></div></div>`;
  $('shopColors').innerHTML = COLORS.map((c, i) => `<button type="button" data-c="${i}" style="background:${c.c}" class="${t.color === i ? 'on' : ''} ${t.lvl < c.lvl ? 'lock' : ''}" data-l="Lv ${c.lvl}" aria-label="${c.name}" title="${c.name}${t.lvl < c.lvl ? ' (od úrovně ' + c.lvl + ')' : ''}"></button>`).join('');
  $('shopWeapons').innerHTML = ORDER.filter((id) => id !== 'std').map((id) => {
    const w = WEAPONS[id]; const own = t.ammo[id] | 0; const lock = t.lvl < w.lvl; const full = own + w.pack > w.max; const poor = prof.coins < w.price;
    const label = lock ? `Úroveň ${w.lvl}` : full ? 'Plno' : `Koupit ${w.pack}×<br><span class="coin"></span> ${w.price}`;
    return `<div class="wi${lock ? ' lock' : ''}"><div class="ic" style="background:${w.col}">${ICON[id]}</div><div><div class="nm">${w.name} <span class="own">· máš ${own}/${w.max}</span></div><div class="ds">${w.desc}${P.consOf(w) ? `<br><u>Nevýhoda: ${esc(P.consOf(w))}</u>` : ''}</div></div><button class="buy" type="button" data-b="${id}" ${lock || full || poor ? 'disabled' : ''}>${label}</button></div>`;
  }).join('');
}
$('shopColors').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-c]'); if (!b) return;
  try { prof = await call('color', { c: +b.dataset.c }); renderProfile(); renderShop(); sfx.click(); } catch (err) { toast(err.message); }
});
$('shopWeapons').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-b]'); if (!b || b.disabled) return; b.disabled = true;
  try { prof = await call('buy', { id: b.dataset.b }); renderProfile(); renderShop(); sfx.pick(); } catch (err) { toast(err.message); renderShop(); }
});

// ------------------------------------------------------------------ spojení
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
function sendMsg(m) { const full = { ...m, ...(m.t === 'create' || m.t === 'join' || m.t === 'quick' || m.t === 'bot' ? { ...ident(), name: myName() } : {}) }; if (ws && ws.readyState === 1) ws.send(JSON.stringify(full)); else { if (m.t === 'create' || m.t === 'join' || m.t === 'quick' || m.t === 'bot') { outbox = [full]; connect(); } } }
function startGame(req) {
  autoFs();
  setStatus(''); LS.set('tanks_name', ($('name').value || '').trim());
  session = null; LS.del('tanks_resume'); S = null; outbox = []; retry = 0;
  if (ws && ws.readyState === 1) sendMsg(req); else { setStatus('Připojuji…'); sendMsg(req); }
}
function backToMenu(msg) {
  wantOpen = false; session = null; LS.del('tanks_resume'); outbox = []; clearTimeout(connTimer);
  if (ws) { try { ws.onclose = null; ws.close(); } catch (e) { /* nic */ } ws = null; }
  S = null; fireSent = false; $('conn').hidden = true; $('over').hidden = true; $('pauseModal').hidden = true; show('menu'); setStatus(msg || '', !!msg);
  refreshProfile();
}
function leaveGame() { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ t: 'leave' })); } catch (e) { /* nic */ } } backToMenu(); }

function onMsg(m) {
  switch (m.t) {
    case 'joined': session = { code: m.code, token: m.token }; LS.set('tanks_resume', JSON.stringify({ ...session, at: Date.now() })); setStatus(''); return;
    case 'state': return onState(m);
    case 'terrain': R.h = Int16Array.from(m.h); terrDirty = true; if (S) R.tk.forEach((t, i) => { t.y = P.groundAt(R.h, t.dx); }); return;
    case 'shot': return startShot(m);
    case 'aim': if (m.i !== me && R.aim[m.i]) R.aim[m.i] = { a: clamp(m.a, 0, 180), p: clamp(m.p, 8, 100) }; return;
    case 'mv': { if (!S) return; S.x[m.i] = m.x; S.fuel[m.i] = m.f; R.tk[m.i].x = m.x; if (m.i === me) $('fuelFill').style.height = clamp(m.f / FUEL_MAX, 0, 1) * 100 + '%'; if (m.stop && m.i === me) driveDir = 0; return; }
    case 'ammo': if (S) { S.ammo = m.ammo; renderTray(); } return;
    case 'crate': return onCrate(m);
    case 'mine': { // past spuštěná jízdou
      R.mines = R.mines.filter((q) => q.id !== m.id); const t = R.tk[m.i]; const gy = P.groundAt(R.h, m.x);
      boom(m.x, gy - 6, 46); t.hp = m.hp; t.flash = .4; floatText(t.dx, t.y - 66, '−' + m.dmg + ' past', '#ffb020');
      if (t.hp <= 0 && !t.dead) { t.dead = true; boom(t.dx, t.y - 18, 90); }
      return;
    }
    case 'heal': { const t = R.tk[m.i]; t.hp = m.hp; floatText(t.dx, t.y - 60, '+' + m.amount, '#6cff6c'); for (let k = 0; k < 14; k++) R.fx.push({ k: 'spark', x: t.dx + (Math.random() - .5) * 40, y: t.y - 10, vx: (Math.random() - .5) * 30, vy: -60 - Math.random() * 60, life: 0, max: .9, size: 3, col: '#8cff8c', g: -20 }); sfx.heal(); return; }
    case 'note': toast(m.msg); return;
    case 'rej': toast(m.msg); fireSent = false; return;
    case 'err': toast(m.msg); if (m.fatal) { if (m.gone) { backToMenu('Zápas už neexistuje.'); } else if (screen === 'menu') setStatus(m.msg, true); else backToMenu(m.msg); } return;
    default:
  }
}

function onState(s) {
  const prev = S; S = s; me = s.you;
  $('conn').hidden = true;
  if (s.phase === 'lobby') {
    if (screen !== 'lobby') show('lobby');
    $('roomCode').textContent = s.code; $('copyLink').hidden = !!s.quick;
    $('lobbyHint').textContent = s.quick ? 'Hledám soupeře pro rychlou hru…' : 'Pošli kód kamarádovi nebo mu pošli odkaz.';
    return;
  }
  if (screen !== 'game') show('game');
  const fresh = !prev || prev.phase === 'lobby' || prev.code !== s.code || (prev.phase === 'over' && s.phase !== 'over');
  if (fresh) { resetMatch(); }
  for (let i = 0; i < 2; i++) {
    const t = R.tk[i]; t.x = s.x[i]; t.col = s.players[i].color;
    if (!R.shot) { t.hp = s.hp[i]; t.dead = s.hp[i] <= 0; }
  }
  if (s.phase === 'play') {
    turnEndAt = performance.now() + s.turnMs;
    if (s.turnNo !== lastTurnNo) {
      const changed = lastTurnNo >= 0; lastTurnNo = s.turnNo; fireSent = false; driveDir = 0;
      if (changed && s.turn === me) sfx.turn();
      if (s.turn === me && changed) { const a = R.aim[me]; sendAim(true); void a; }
    }
  }
  if (!R.shot && s.th !== P.checksum(R.h) && performance.now() - lastSyncAt > 1500) { lastSyncAt = performance.now(); sendMsg({ t: 'sync' }); }
  R.mines = (s.mines || []).map((q) => ({ id: q.id, x: q.x, o: q.o }));
  // crates
  const ids = new Set(s.crates.map((c) => c.id));
  R.crates = R.crates.filter((c) => ids.has(c.id));
  for (const c of s.crates) if (!R.crates.some((o) => o.id === c.id)) R.crates.push(mkCrate(c.id, c.x, s.turnNo <= 1 && fresh, c.hp));
  if (!ammoHas(sel) || isLocked(sel)) sel = 'std';
  renderTray(); updateHud(true);
  if (s.phase === 'over' && s.result) { finishShot(); if (!overTimer) overTimer = setTimeout(() => { overTimer = null; showOver(); }, 700); } else { $('over').hidden = true; }
}
const ammoHas = (id) => id === 'std' || (S && S.ammo && S.ammo[id] > 0);
const isLocked = (id) => !!(S && S.lock && S.lock[id] > 0);
const myTurn = () => !!S && S.phase === 'play' && S.turn === me && !fireSent && !R.shot && screen === 'game';
const mkCrate = (id, x, fall, hp) => ({ id, hp: !!hp, x, y: fall ? -80 - Math.random() * 260 : P.groundAt(R.h, x) - 12, vy: 0, landed: !fall, t: Math.random() * 6 });
function onCrate(m) {
  if (m.op === 'spawn') { if (!R.crates.some((c) => c.id === m.id)) R.crates.push(mkCrate(m.id, m.x, true, m.hp)); }
  else if (m.op === 'pick') {
    R.crates = R.crates.filter((c) => c.id !== m.id); const t = R.tk[m.i]; sfx.pick();
    if (m.w === 'hp') return;   // zdravotní bedna: efekt a čísla přijdou ve zprávě `heal`
    floatText(t.dx, t.y - 70, `+${m.n}× ${WEAPONS[m.w].name}`, WEAPONS[m.w].col);
    for (let k = 0; k < 16; k++) R.fx.push({ k: 'spark', x: t.dx, y: t.y - 30, vx: (Math.random() - .5) * 220, vy: -80 - Math.random() * 160, life: 0, max: .7, size: 3, col: WEAPONS[m.w].col, g: 400 });
  }
}

// ------------------------------------------------------------------ výstřel (přehrávání záznamu ze serveru)
function startShot(m) {
  finishShot();
  const by = m.by, t = R.tk[by]; R.aim[by] = { a: m.a, p: m.p }; t.face = m.a <= 90 ? 1 : -1; t.ang = m.a;
  t.hp = m.hpBefore[by]; R.tk[1 - by].hp = m.hpBefore[1 - by];
  if (m.self) { t.hp = Math.max(1, t.hp - m.self); t.flash = .3; floatText(t.dx, t.y - 66, '−' + m.self, '#ff9a5a'); }
  R.shot = { m, t: 0, ei: 0 };
  const [mx, my] = P.muzzleOf(R.h, t.x, m.a);
  t.recoil = 9; sfx.fire(); R.shake = Math.max(R.shake, 2.5);
  for (let k = 0; k < 10; k++) R.fx.push({ k: 'smoke', x: mx, y: my, vx: Math.cos(m.a * Math.PI / 180) * (30 + Math.random() * 90) + (Math.random() - .5) * 30, vy: -Math.sin(m.a * Math.PI / 180) * (30 + Math.random() * 90) + (Math.random() - .5) * 30, life: 0, max: .6 + Math.random() * .4, size: 6 + Math.random() * 6, grow: 20 });
  R.fx.push({ k: 'flash', x: mx, y: my, r: 36, life: 0, max: .16 });
  if (by === me) { const pa = m.paths; const p0 = pa.filter((q) => q.t0 === 0).sort((x, y) => y.pts.length - x.pts.length)[0] || pa[0]; R.trace = p0 ? p0.pts.filter((_, i) => i % 2 === 0) : null; }
  fireSent = true; updateHud(true);
}
function stepShot(dt) {
  const sh = R.shot; if (!sh) return; sh.t += dt * 1000;
  const ex = sh.m.ex;
  while (sh.ei < ex.length && ex[sh.ei].t <= sh.t) applyExplosion(ex[sh.ei++]);
  // stopa za střelou
  for (const p of sh.m.paths) {
    const idx = (sh.t - p.t0) / (1000 / 60); if (idx < 0 || idx >= p.pts.length - 1) continue;
    const i = Math.floor(idx), f = idx - i, a = p.pts[i], b = p.pts[i + 1];
    const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
    if (Math.random() < .9) R.fx.push({ k: 'smoke', x, y, vx: (Math.random() - .5) * 8, vy: (Math.random() - .5) * 8, life: 0, max: .5, size: 3.2, grow: 8, col: WEAPONS[sh.m.w].col });
  }
  if (sh.t > sh.m.dur + 350 && sh.ei >= ex.length) finishShot(true);
}
function applyExplosion(e) {
  if (e.r > 0) { P.applyCrater(R.h, e.x, e.y, e.r); terrDirty = true; }
  for (const id of e.cr || []) { R.crates = R.crates.filter((c) => c.id !== id); for (let k = 0; k < 8; k++) R.fx.push({ k: 'spark', x: e.x, y: e.y, vx: (Math.random() - .5) * 200, vy: -Math.random() * 200, life: 0, max: .8, size: 3, col: '#c9a26a', g: 500 }); }
  if (e.trap) { if (!R.mines.some((q) => Math.abs(q.x - e.x) < 1)) R.mines.push({ id: 0, x: e.x, o: R.shot ? R.shot.m.by : 0 }); sfx.tick(); for (let k = 0; k < 6; k++) R.fx.push({ k: 'spark', x: e.x, y: e.y - 4, vx: (Math.random() - .5) * 120, vy: -Math.random() * 100, life: 0, max: .5, size: 2.5, col: '#ffb020', g: 400 }); return; }
  if (e.split) { R.fx.push({ k: 'flash', x: e.x, y: e.y, r: 30, life: 0, max: .2 }); sfx.tick(); return; }
  boom(e.x, e.y, e.r);
  for (const [i, dmg] of e.hits) {
    const t = R.tk[i]; t.hp = Math.max(0, t.hp - dmg); t.flash = .35;
    floatText(t.dx, t.y - 66, '−' + dmg, '#ff5a52');
    if (t.hp <= 0 && !t.dead) { t.dead = true; boom(t.dx, t.y - 18, 90); for (let k = 0; k < 30; k++) R.fx.push({ k: 'spark', x: t.dx, y: t.y - 20, vx: (Math.random() - .5) * 500, vy: -100 - Math.random() * 420, life: 0, max: 1.3, size: 4, col: ['#2a2d3a', '#f5c518', '#ff7a14'][k % 3], g: 600 }); }
  }
}
function finishShot(done) {
  const sh = R.shot; if (!sh) return;
  while (sh.ei < sh.m.ex.length) { const e = sh.m.ex[sh.ei++]; if (e.r > 0) { P.applyCrater(R.h, e.x, e.y, e.r); terrDirty = true; } for (const id of e.cr || []) R.crates = R.crates.filter((c) => c.id !== id); }
  R.shot = null;
  for (let i = 0; i < 2; i++) { R.tk[i].hp = sh.m.hp[i]; R.tk[i].dead = sh.m.hp[i] <= 0; }
  if (P.checksum(R.h) !== sh.m.th) { lastSyncAt = performance.now(); sendMsg({ t: 'sync' }); }
  updateHud(true); void done;
}

// ------------------------------------------------------------------ efekty
function boom(x, y, r) {
  r = Math.max(r, 20); const n = Math.round(14 + r / 3);
  R.fx.push({ k: 'flash', x, y, r: r * 1.7, life: 0, max: .4 }, { k: 'ring', x, y, r: r * 1.3, life: 0, max: .55 });
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 80 + Math.random() * (260 + r * 2.2); R.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0, max: .5 + Math.random() * .8, size: 2 + Math.random() * 3, col: ['#fff2a0', '#ffc23a', '#ff7a14', '#ff4b2a'][i % 4], g: 500 }); }
  for (let i = 0; i < n / 2; i++) { const a = -Math.PI * Math.random(), v = 100 + Math.random() * (180 + r); R.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 1 + Math.random() * .8, size: 3 + Math.random() * 4, col: ['#7d2a14', '#a63a1a', '#5b1d18'][i % 3], g: 620 }); }
  for (let i = 0; i < 6 + r / 12; i++) R.fx.push({ k: 'smoke', x: x + (Math.random() - .5) * r, y: y + (Math.random() - .5) * r * .6, vx: (Math.random() - .5) * 40, vy: -20 - Math.random() * 50, life: 0, max: 1.2 + Math.random() * 1.2, size: r * .28 + Math.random() * 10, grow: 26 });
  R.shake = Math.max(R.shake, Math.min(16, r / 8)); sfx.boom(r);
}
const floatText = (x, y, txt, col) => R.fx.push({ k: 'text', x, y, txt, col, life: 0, max: 1.4 });
function stepFx(dt) {
  const L = R.fx; if (L.length > 700) L.splice(0, L.length - 700);
  for (let i = L.length - 1; i >= 0; i--) {
    const f = L[i]; f.life += dt; if (f.life >= f.max) { L.splice(i, 1); continue; }
    if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; if (f.g) f.vy += f.g * dt; if (f.k === 'smoke') { f.vx *= .985; f.vy *= .985; f.size += (f.grow || 0) * dt; } }
    if (f.k === 'text') f.y -= 34 * dt;
  }
  R.shake = Math.max(0, R.shake - dt * 22);
}

// ------------------------------------------------------------------ vykreslování
const cv = $('cv'), g = cv.getContext('2d');
let cw = 0, ch = 0, dpr = 1, sc = 1, ox = 0, oy = 0, bgCv = null, terrCv = null, terrK = 1, terrDirty = true;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = window.innerWidth; ch = window.innerHeight; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  sc = cw / W; ox = 0; oy = ch - H * sc;   // svět vždy vyplní celou šířku (za okrajem mapy se nic nekreslí); na velmi širokých displejích se ořízne kus oblohy nahoře
  buildBg(); terrDirty = true; placeUi();
}
function shade(hex, amt) { const n = parseInt(hex.slice(1), 16); const f = (v) => clamp(Math.round(v + amt), 0, 255); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

function buildBg() {
  bgCv = document.createElement('canvas'); bgCv.width = Math.round(cw * dpr); bgCv.height = Math.round(ch * dpr);
  const c = bgCv.getContext('2d'); c.scale(dpr, dpr);
  const hor = oy + 560 * sc;
  const sky = c.createLinearGradient(0, 0, 0, hor); sky.addColorStop(0, '#0e1646'); sky.addColorStop(.42, '#24338a'); sky.addColorStop(.78, '#5a58ac'); sky.addColorStop(1, '#c47fa6');
  c.fillStyle = sky; c.fillRect(0, 0, cw, ch);
  const rnd = P.mulberry32(77);
  for (let i = 0; i < 110; i++) { c.globalAlpha = .25 + rnd() * .6; c.fillStyle = '#fff'; const sz = rnd() < .12 ? 2 : 1; c.fillRect(rnd() * cw, rnd() * hor * .72, sz, sz); }
  c.globalAlpha = 1;
  c.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
  const mx = 1210, my = 160; // měsíc se září
  const halo = c.createRadialGradient(mx, my, 10, mx, my, 220); halo.addColorStop(0, 'rgba(230,236,255,.5)'); halo.addColorStop(1, 'rgba(230,236,255,0)'); c.fillStyle = halo; c.fillRect(mx - 230, my - 230, 460, 460);
  c.fillStyle = '#e8edff'; c.beginPath(); c.arc(mx, my, 46, 0, 6.283); c.fill(); c.fillStyle = 'rgba(160,170,220,.35)'; c.beginPath(); c.arc(mx - 14, my - 8, 10, 0, 6.283); c.arc(mx + 16, my + 14, 7, 0, 6.283); c.fill();
  const hills = (base, amp, col, seed, f) => {
    const r2 = P.mulberry32(seed); const ph = [r2() * 6, r2() * 6, r2() * 6]; c.fillStyle = col; c.beginPath(); c.moveTo(-ox / sc - 10, 900);
    for (let x = -ox / sc - 10; x <= W + ox / sc + 10; x += 12) c.lineTo(x, base - amp * (0.55 + .3 * Math.sin(x * f + ph[0]) + .25 * Math.sin(x * f * 2.3 + ph[1]) + .15 * Math.sin(x * f * 5 + ph[2])));
    c.lineTo(W + ox / sc + 10, 900); c.closePath(); c.fill();
  };
  hills(560, 150, '#3a3f98', 3, .004); hills(575, 100, '#2c3680', 9, .006);
  // elektrické stožáry s dráty
  const pylons = [250, 520, 790, 1060, 1330, 1600].map((x, i) => ({ x: x + (i % 2) * 18, h: 120 + (i % 3) * 18 }));
  c.strokeStyle = '#1b2467'; c.fillStyle = '#1b2467'; c.lineWidth = 2;
  const pg = (x) => 560 + 0 * x;
  for (const p of pylons) {
    const y0 = pg(p.x) + 10, y1 = y0 - p.h, w = 22;
    c.lineWidth = 3; c.beginPath(); c.moveTo(p.x - w / 2, y0); c.lineTo(p.x, y1); c.lineTo(p.x + w / 2, y0); c.stroke();
    c.lineWidth = 1.6; c.beginPath(); for (let k = 1; k < 5; k++) { const yy = y0 - (p.h * k) / 5, ww = (w / 2) * (1 - k / 5.5); c.moveTo(p.x - ww, yy); c.lineTo(p.x + ww, yy); } c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(p.x - 34, y1 + 14); c.lineTo(p.x + 34, y1 + 14); c.moveTo(p.x - 26, y1 + 32); c.lineTo(p.x + 26, y1 + 32); c.stroke();
  }
  c.lineWidth = 1.4;
  for (let i = 0; i < pylons.length - 1; i++) { const a = pylons[i], b = pylons[i + 1]; for (const [dy, dx] of [[14, 34], [14, -34], [32, 26], [32, -26]]) { const ax = a.x + (dx > 0 ? dx : dx), bx = b.x + dx; const ay = pg(a.x) + 10 - a.h + dy, by = pg(b.x) + 10 - b.h + dy; c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + 22, bx, by); c.stroke(); } }
  // kaktusy a stromy v popředí hor
  const r3 = P.mulberry32(21); c.fillStyle = '#18205a';
  for (let i = 0; i < 16; i++) {
    const x = 60 + i * 98 + r3() * 40, y = 566 + r3() * 8, hh = 38 + r3() * 40;
    if (i % 3 === 1) { c.beginPath(); c.moveTo(x, y); c.lineTo(x - 15, y - hh * .5); c.lineTo(x - 7, y - hh * .5); c.lineTo(x - 22, y - hh); c.lineTo(x + 22, y - hh); c.lineTo(x + 7, y - hh * .5); c.lineTo(x + 15, y - hh * .5); c.closePath(); c.fill(); c.fillRect(x - 3, y - 6, 6, 8); }
    else { rr(c, x - 5, y - hh, 10, hh + 4, 5); c.fill(); rr(c, x - 19, y - hh * .62, 8, hh * .36, 4); c.fill(); rr(c, x - 19, y - hh * .5, 18, 7, 3); c.fill(); rr(c, x + 11, y - hh * .78, 8, hh * .4, 4); c.fill(); rr(c, x + 1, y - hh * .5, 18, 7, 3); c.fill(); }
  }
  c.fillStyle = '#141b4c'; c.fillRect(-ox / sc - 10, 576, W + 2 * ox / sc + 20, 400);
}
function buildTerrain() {
  terrK = clamp(sc * dpr, .5, 2);
  if (!terrCv) terrCv = document.createElement('canvas');
  terrCv.width = Math.round(W * terrK); terrCv.height = Math.round(H * terrK);
  const c = terrCv.getContext('2d'); c.setTransform(terrK, 0, 0, terrK, 0, 0); c.clearRect(0, 0, W, H);
  const h = R.h;
  const path = () => { c.beginPath(); c.moveTo(0, H + 2); for (let x = 0; x < W; x++) c.lineTo(x + .5, h[x]); c.lineTo(W, H + 2); c.closePath(); };
  path();
  const gr = c.createLinearGradient(0, 240, 0, H); gr.addColorStop(0, '#f0702a'); gr.addColorStop(.35, '#d9481f'); gr.addColorStop(1, '#8a2420'); c.fillStyle = gr; c.fill();
  c.save(); path(); c.clip();
  const r = P.mulberry32(99);
  for (let i = 0; i < 380; i++) { const x = r() * W, y = 220 + r() * 600, s = 3 + r() * 9; c.fillStyle = r() < .5 ? 'rgba(90,20,20,.13)' : 'rgba(255,170,90,.09)'; c.beginPath(); c.ellipse(x, y, s * 1.6, s, r() * 3, 0, 6.283); c.fill(); }
  c.lineWidth = 2; for (let k = 0; k < 9; k++) { c.strokeStyle = k % 2 ? 'rgba(80,16,20,.18)' : 'rgba(255,190,120,.12)'; c.beginPath(); const y0 = 300 + k * 60, ph = r() * 6; for (let x = 0; x <= W; x += 20) c.lineTo(x, y0 + Math.sin(x * .006 + ph) * 18 + Math.sin(x * .017 + ph * 2) * 7); c.stroke(); }
  c.restore();
  // světlá hrana nahoře + stín pod ní
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath(); for (let x = 0; x < W; x++) c.lineTo(x + .5, h[x] + 7); c.strokeStyle = 'rgba(110,25,25,.45)'; c.lineWidth = 9; c.stroke();
  c.beginPath(); for (let x = 0; x < W; x++) c.lineTo(x + .5, h[x] + 1.5); c.strokeStyle = '#ffa35a'; c.lineWidth = 6; c.stroke();
  c.beginPath(); for (let x = 0; x < W; x++) c.lineTo(x + .5, h[x] - .5); c.strokeStyle = '#ffd19a'; c.lineWidth = 2.2; c.stroke();
  terrDirty = false;
}

function drawTank(c, t, i) {
  const col = COLORS[t.col % COLORS.length].c; const dead = t.dead;
  const body = dead ? '#3b3e4c' : col, dark = dead ? '#23252f' : shade(col, -70), light = dead ? '#555968' : shade(col, 45);
  const K = 1.3, x = t.dx, y = t.y, px = x, py = y - 28;
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(0, 1, 38, 6, 0, 0, 6.283); c.fill();
  c.rotate(clamp(t.tilt, -.6, .6)); c.scale(t.face * K, K);
  rr(c, -29, -13, 58, 14, 7); c.fillStyle = '#272a37'; c.fill(); c.strokeStyle = '#0f1118'; c.lineWidth = 2; c.stroke();
  for (let k = 0; k < 5; k++) { const wx = -21 + k * 10.5; c.fillStyle = '#4d5368'; c.beginPath(); c.arc(wx, -6, 4.4, 0, 6.283); c.fill(); c.strokeStyle = '#1b1d28'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(wx, -6); c.lineTo(wx + Math.cos(t.wheel + k) * 4, -6 + Math.sin(t.wheel + k) * 4); c.stroke(); }
  c.beginPath(); c.moveTo(-26, -12); c.lineTo(27, -12); c.lineTo(22, -22); c.lineTo(-19, -22); c.closePath();
  const gb = c.createLinearGradient(0, -22, 0, -10); gb.addColorStop(0, light); gb.addColorStop(.45, body); gb.addColorStop(1, dark); c.fillStyle = gb; c.fill(); c.strokeStyle = dark; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
  c.fillStyle = dark; c.beginPath(); c.moveTo(27, -12); c.lineTo(22, -22); c.lineTo(17, -22); c.lineTo(20, -12); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-14, -19.5, 22, 2);
  c.restore();
  // hlaveň a věžička v rovině světa (střela vylétá z pivotu)
  c.save(); c.translate(px, py); c.rotate(-t.ang * Math.PI / 180); c.translate(-t.recoil, 0); c.scale(K, K);
  rr(c, 2, -3.6, 28, 7.2, 2.5); const gg = c.createLinearGradient(0, -4, 0, 4); gg.addColorStop(0, light); gg.addColorStop(.5, body); gg.addColorStop(1, dark); c.fillStyle = gg; c.fill(); c.strokeStyle = dark; c.lineWidth = 1.6; c.stroke();
  rr(c, 24, -4.8, 8, 9.6, 2); c.fillStyle = dark; c.fill();
  c.restore();
  c.save(); c.translate(px, py); c.scale(K, K); c.beginPath(); c.arc(0, 0, 11.5, Math.PI, 0); c.lineTo(11.5, 4); c.lineTo(-11.5, 4); c.closePath();
  const gd = c.createRadialGradient(-3, -6, 2, 0, 0, 14); gd.addColorStop(0, light); gd.addColorStop(1, body); c.fillStyle = gd; c.fill(); c.strokeStyle = dark; c.lineWidth = 2; c.stroke();
  c.fillStyle = dark; c.beginPath(); c.arc(0, -2, 3.2, 0, 6.283); c.fill(); c.restore();
  if (t.flash > 0) { c.save(); c.globalAlpha = Math.min(1, t.flash * 3) * .7; c.globalCompositeOperation = 'lighter'; c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y - 20, 38, 0, 6.283); c.fill(); c.restore(); }
}
function drawCrate(c, k) {
  c.save(); c.translate(k.x, k.y); const bob = k.landed ? Math.sin(k.t * 3) * 1.2 : 0; c.translate(0, bob);
  if (!k.landed) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-12, -10); c.lineTo(-26, -42); c.moveTo(12, -10); c.lineTo(26, -42); c.moveTo(0, -12); c.lineTo(0, -46); c.stroke(); c.fillStyle = '#ff5a52'; c.beginPath(); c.arc(0, -46, 30, Math.PI, 0); c.quadraticCurveTo(24, -38, 12, -40); c.quadraticCurveTo(0, -32, -12, -40); c.quadraticCurveTo(-24, -38, -30, -46); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.fillRect(-12, -70, 8, 24); c.fillRect(4, -70, 8, 24); }
  c.globalAlpha = .16 + .12 * Math.sin(k.t * 4); c.fillStyle = '#ffd21f'; c.globalCompositeOperation = 'lighter'; c.beginPath(); c.arc(0, 0, 26, 0, 6.283); c.fill(); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  if (k.hp) { // zdravotní bedna: bílá se zeleným křížem
    c.globalAlpha = .2 + .12 * Math.sin(k.t * 4); c.fillStyle = '#4dff7a'; c.globalCompositeOperation = 'lighter'; c.beginPath(); c.arc(0, 0, 28, 0, 6.283); c.fill(); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    rr(c, -13, -12, 26, 24, 3); const gh = c.createLinearGradient(0, -12, 0, 12); gh.addColorStop(0, '#ffffff'); gh.addColorStop(1, '#cfd8e6'); c.fillStyle = gh; c.fill(); c.strokeStyle = '#1e7a3c'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#25c25a'; c.fillRect(-3.5, -8, 7, 16); c.fillRect(-8, -3.5, 16, 7);
    c.restore(); return;
  }
  rr(c, -13, -12, 26, 24, 3); const gr = c.createLinearGradient(0, -12, 0, 12); gr.addColorStop(0, '#6aa0ff'); gr.addColorStop(1, '#2a4fb0'); c.fillStyle = gr; c.fill(); c.strokeStyle = '#13276b'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#ffd21f'; c.fillRect(-13, -3, 26, 6); c.fillStyle = '#3a2400'; c.font = '900 14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 0, 0.5);
  c.restore();
}
function drawFx(c) {
  for (const f of R.fx) {
    const u = f.life / f.max;
    if (f.k === 'spark') { c.globalAlpha = 1 - u * u; c.fillStyle = f.col; c.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size); }
    else if (f.k === 'smoke') { c.globalAlpha = (1 - u) * (f.col ? .55 : .38); c.fillStyle = f.col || '#4a4560'; c.beginPath(); c.arc(f.x, f.y, f.size, 0, 6.283); c.fill(); }
    else if (f.k === 'flash') { const rad = f.r * (.45 + .55 * u); const gr = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad); gr.addColorStop(0, `rgba(255,250,210,${1 - u})`); gr.addColorStop(.4, `rgba(255,170,50,${.8 * (1 - u)})`); gr.addColorStop(1, 'rgba(255,80,20,0)'); c.globalAlpha = 1; c.globalCompositeOperation = 'lighter'; c.fillStyle = gr; c.beginPath(); c.arc(f.x, f.y, rad, 0, 6.283); c.fill(); c.globalCompositeOperation = 'source-over'; }
    else if (f.k === 'ring') { c.globalAlpha = (1 - u) * .8; c.strokeStyle = '#ffe2a0'; c.lineWidth = 4 * (1 - u) + 1; c.beginPath(); c.arc(f.x, f.y, f.r * (.2 + .8 * u), 0, 6.283); c.stroke(); }
    else if (f.k === 'text') { c.globalAlpha = Math.min(1, (1 - u) * 2); c.font = '900 26px "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(f.txt, f.x, f.y); c.fillStyle = f.col; c.fillText(f.txt, f.x, f.y); }
  }
  c.globalAlpha = 1;
}
function dots(c, pts, col, r, every = 1, fade = false) {
  for (let i = 0; i < pts.length; i += every) { c.globalAlpha = fade ? 1 - (i / pts.length) * .75 : .9; c.fillStyle = col; c.beginPath(); c.arc(pts[i][0], pts[i][1], r, 0, 6.283); c.fill(); }
  c.globalAlpha = 1;
}

function update(dt) {
  R.t += dt;
  for (const cl of R.clouds) { cl.x += (cl.v + (S ? S.wind * 4 : 0)) * dt; if (cl.x > W + 200) cl.x = -200; if (cl.x < -220) cl.x = W + 180; }
  const demo = screen !== 'game';
  for (let i = 0; i < 2; i++) {
    const t = R.tk[i];
    if (demo) { R.aim[i] = { a: i === 0 ? 40 + Math.sin(R.t * .6) * 14 : 140 + Math.sin(R.t * .6 + 1.4) * 14, p: 60 }; t.face = i === 0 ? 1 : -1; }
    const gy = P.groundAt(R.h, t.dx);
    const before = t.dx; t.dx += (t.x - t.dx) * Math.min(1, dt * 12); t.wheel += (t.dx - before) * .22;
    if (!t.y) t.y = gy; else if (t.y < gy) t.y = Math.min(gy, t.y + 520 * dt); else t.y = Math.max(gy, t.y - 900 * dt);
    const tl = P.tiltAt(R.h, t.dx); t.tilt += (tl - t.tilt) * Math.min(1, dt * 10);
    const aim = R.aim[i]; if (aim) { t.ang += (aim.a - t.ang) * Math.min(1, dt * 14); if (!R.shot) { const f = aim.a <= 90 ? 1 : -1; if (f !== t.face) t.face = f; } }
    t.flash = Math.max(0, t.flash - dt); t.recoil = Math.max(0, t.recoil - dt * 40);
    if (t.dead) { t.smokeT -= dt; if (t.smokeT <= 0) { t.smokeT = .09; R.fx.push({ k: 'smoke', x: t.dx + (Math.random() - .5) * 20, y: t.y - 20, vx: (Math.random() - .5) * 10, vy: -30 - Math.random() * 30, life: 0, max: 1.6, size: 7, grow: 14 }); if (Math.random() < .4) R.fx.push({ k: 'spark', x: t.dx + (Math.random() - .5) * 20, y: t.y - 22, vx: (Math.random() - .5) * 40, vy: -70, life: 0, max: .4, size: 3, col: '#ff7a14', g: 200 }); } }
  }
  for (const k of R.crates) {
    k.t += dt; const gy = P.groundAt(R.h, k.x) - 12;
    if (!k.landed) { k.vy = Math.min(150, k.vy + 140 * dt); k.y += k.vy * dt; if (k.y >= gy) { k.y = gy; k.landed = true; } }
    else if (k.y < gy) k.y = Math.min(gy, k.y + 400 * dt); else k.y = gy;
  }
  stepShot(dt); stepFx(dt);
  if (screen === 'game' && S && S.phase === 'play') {
    const left = Math.max(0, Math.ceil((turnEndAt - performance.now()) / 1000)); const el = $('timer');
    if (el.textContent !== String(left)) { el.textContent = left; el.classList.toggle('low', left <= 8); if (left <= 5 && left > 0 && lastTick !== left && myTurn()) { lastTick = left; sfx.tick(); } }
  }
}
function render() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!bgCv) return;
  g.drawImage(bgCv, 0, 0, cw, ch);
  g.save(); g.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
  g.fillStyle = 'rgba(255,255,255,.07)';
  for (const cl of R.clouds) { for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(cl.x + k * 34 * cl.s, cl.y + (k % 2) * 8, 64 * cl.s, 17 * cl.s, 0, 0, 6.283); g.fill(); } }
  if (R.shake > 0) g.translate((Math.random() - .5) * R.shake, (Math.random() - .5) * R.shake);
  if (terrDirty) buildTerrain();
  if (ox > 0) { const m = ox / sc + 1; g.drawImage(terrCv, 0, 0, 1 * terrK, H * terrK, -m, 0, m, H); g.drawImage(terrCv, (W - 1) * terrK, 0, 1 * terrK, H * terrK, W, 0, m, H); }
  g.drawImage(terrCv, 0, 0, W, H);
  for (const k of R.crates) drawCrate(g, k);
  for (const q of R.mines) { // pasti: plochý disk s blikajícím světlem (tvoje zeleně, soupeřovy červeně)
    const gy = P.groundAt(R.h, q.x), mineOwn = q.o === me, bl = .5 + .5 * Math.sin(R.t * 6 + q.x);
    g.save(); g.translate(q.x, gy); g.scale(1.35, 1.35); g.fillStyle = '#3a3f4a'; g.strokeStyle = '#161922'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, -3, 13, 6, 0, 0, 6.283); g.fill(); g.stroke();
    g.fillStyle = '#5a6272'; g.beginPath(); g.ellipse(0, -5, 8, 3, 0, 0, 6.283); g.fill();
    g.fillStyle = mineOwn ? `rgba(110,255,130,${.4 + .6 * bl})` : `rgba(255,70,60,${.4 + .6 * bl})`; g.beginPath(); g.arc(0, -8, 2.6, 0, 6.283); g.fill();
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = .35 * bl; g.beginPath(); g.arc(0, -8, 9, 0, 6.283); g.fill(); g.restore();
  }
  for (let i = 0; i < 2; i++) if (R.tk[i].dead) drawTank(g, R.tk[i], i);
  for (let i = 0; i < 2; i++) if (!R.tk[i].dead) drawTank(g, R.tk[i], i);
  // značka aktivního hráče
  if (S && S.phase === 'play' && !R.shot) { const t = R.tk[S.turn]; if (t && !t.dead) { const by = t.y - 78 + Math.sin(R.t * 5) * 4; g.fillStyle = COLORS[t.col % COLORS.length].c; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(t.dx, by + 12); g.lineTo(t.dx - 9, by); g.lineTo(t.dx + 9, by); g.closePath(); g.fill(); g.stroke(); } }
  if (screen === 'game' && myTurn()) {
    const t = R.tk[me]; const a = R.aim[me];
    if (R.trace) dots(g, R.trace, '#58e08a', 2.6, 2);
    const pv = P.previewPath(R.h, t.x, a.a, a.p, S.wind, 26, 3, sel); dots(g, pv, '#ffffff', 3, 1, true);
  }
  if (R.shot) {
    const sh = R.shot;
    for (const p of sh.m.paths) {
      const idx = (sh.t - p.t0) / (1000 / 60); if (idx < 0 || idx >= p.pts.length - 1) continue;
      const i = Math.floor(idx), f = idx - i, a = p.pts[i], b = p.pts[i + 1]; const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f; const col = WEAPONS[sh.m.w].col;
      g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(x, y, 0, x, y, 14); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 14, 0, 6.283); g.fill(); g.globalCompositeOperation = 'source-over';
      const wr = WEAPONS[sh.m.w];
      if (wr.laser) continue;
      if (wr.roll) { // kulatý granát: tmavé tělo, otáčející se pruh a odpočet do výbuchu
        g.save(); g.translate(x, y); g.rotate(x / 6);
        g.fillStyle = '#2b3a1f'; g.strokeStyle = wr.col; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 7, 0, 6.283); g.fill(); g.stroke();
        g.fillStyle = wr.col; g.fillRect(-7, -1.5, 14, 3); g.restore();
        const left = Math.max(0, Math.ceil((wr.fuse * 1000 - sh.t) / 1000));
        g.font = '800 15px system-ui, sans-serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(left, x, y - 15); g.fillStyle = left <= 1 ? '#ff6a5a' : '#fff'; g.fillText(left, x, y - 15);
      } else { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3.6, 0, 6.283); g.fill(); }
    }
  }
  if (R.shot && WEAPONS[R.shot.m.w].laser && R.shot.m.paths[0]) { // laserový paprsek: rychle zhasíná
    const sh = R.shot, pp = R.shot.m.paths[0].pts, a = pp[0], b = pp[pp.length - 1], k = Math.max(0, 1 - sh.t / 450);
    if (k > 0) {
      g.save(); g.lineCap = 'round'; g.globalCompositeOperation = 'lighter';
      g.globalAlpha = k * .55; g.strokeStyle = WEAPONS[sh.m.w].col; g.lineWidth = 14 * k + 3; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.globalAlpha = k; g.strokeStyle = '#fff'; g.lineWidth = 4 * k + 1; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.restore();
    }
  }
  drawFx(g);
  g.restore();
}
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  try { update(dt); render(); placeUi(); hpHud(); } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ HUD
const w2s = (x, y) => [ox + x * sc, oy + y * sc];
let hudKey = '';
function updateHud(force) {
  if (!S || screen !== 'game') return;
  for (let i = 0; i < 2; i++) {
    const p = S.players[i], t = R.tk[i], c = COLORS[p.color % COLORS.length].c;
    $('pb' + i).style.setProperty('--pc', c); $('pl' + i).textContent = p.lvl; $('pn' + i).textContent = p.name + (p.connected ? '' : ' (odpojen)') + (i === me ? ' (ty)' : '');
    $('hf' + i).style.width = clamp(t.hp, 0, MAX_HP) / MAX_HP * 100 + '%'; $('hn' + i).textContent = Math.max(0, Math.round(t.hp));
    $('pb' + i).classList.toggle('act', S.phase === 'play' && S.turn === i && !R.shot);
  }
  const w = S.wind; $('wind').textContent = w === 0 ? 'Bezvětří' : (w < 0 ? '◀ ' : '') + 'Vítr ' + Math.abs(w) + (w > 0 ? ' ▶' : '');
  const mt = myTurn(); $('ctl').classList.toggle('off', !mt); $('fire').disabled = !mt;
  const bot = S.players.some((p) => p.bot);
  const oppName = S.players[1 - me] ? S.players[1 - me].name : '';
  $('msg').textContent = S.phase !== 'play' ? '' : R.shot || fireSent ? '' : mt ? 'Zamiř a vystřel' : (bot ? `${oppName} přemýšlí…` : `${oppName} míří…`);
  $('drive').style.visibility = 'visible';
  const key = `${S.turnNo}|${sel}|${S.ammo && JSON.stringify(S.ammo)}`;
  if (force || key !== hudKey) { hudKey = key; renderWbtn(); }
  const f = S.fuel ? S.fuel[me] : 0; $('fuelFill').style.height = clamp(f / FUEL_MAX, 0, 1) * 100 + '%';
  $('knob') && placeKnob();
}
let hpCache = '';
function hpHud() {
  if (screen !== 'game' || !S) return; const k = R.tk[0].hp + '|' + R.tk[1].hp; if (k === hpCache) return; hpCache = k;
  for (let i = 0; i < 2; i++) { const t = R.tk[i]; $('hf' + i).style.width = clamp(t.hp, 0, MAX_HP) / MAX_HP * 100 + '%'; $('hn' + i).textContent = Math.max(0, Math.round(t.hp)); }
}
function placeUi() {
  if (screen !== 'game' || !S) return;
  const act = S.phase === 'play' && !R.shot ? S.turn : -1;
  const pills = $('pills'); if (act < 0) { pills.style.visibility = 'hidden'; return; }
  const t = R.tk[act], a = R.aim[act]; pills.style.visibility = 'visible';
  const [sx, sy] = w2s(t.dx + (t.face > 0 ? -70 : 70), t.y - 50);
  pills.style.left = sx + 'px'; pills.style.top = sy + 'px';
  $('pPow').textContent = `${Math.round(a.p)} SÍLA`; $('pAng').textContent = `${Math.round(a.a)} ÚHEL`;
}

// ------------------------------------------------------------------ zbraně
function renderWbtn() {
  const w = WEAPONS[sel]; const n = w.inf ? '∞' : ((S && S.ammo && S.ammo[sel]) || 0);
  $('wbtn').innerHTML = `<span class="dot" style="color:${w.col}"></span><span>${w.name}</span><small style="opacity:.7">×${n}</small>`;
}
function renderTray() {
  if (!S) return;
  const items = ORDER.filter(ammoHas);
  $('tray').innerHTML = items.map((id, ix) => { const w = WEAPONS[id]; const n = w.inf ? '∞' : S.ammo[id]; const lk = isLocked(id); return `<button type="button" data-w="${id}" class="${id === sel ? 'on' : ''}${lk ? ' lk' : ''}" ${lk ? 'aria-disabled="true"' : ''}><span class="dot" style="color:${w.col}"></span>${w.name}<small>${lk ? '🔒 nabíjí' : n}</small><kbd>${ix < 9 ? ix + 1 : ''}</kbd></button>`; }).join('');
  renderWbtn();
}
function selectWeapon(id) { if (!ammoHas(id)) return; if (isLocked(id)) { toast('Tahle zbraň se ještě nabíjí.'); return; } sel = id; $('tray').hidden = true; renderTray(); sfx.click(); }
$('wbtn').onclick = () => { if (!myTurn()) return; $('tray').hidden = !$('tray').hidden; };
$('tray').addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (b) selectWeapon(b.dataset.w); });

// ------------------------------------------------------------------ míření a jízda
function setAim(a, p, send = true) {
  const cur = R.aim[me]; a = clamp(Math.round(a), 0, 180); p = clamp(Math.round(p), 8, 100);
  if (a === cur.a && p === cur.p) return; R.aim[me] = { a, p }; R.tk[me].face = a <= 90 ? 1 : -1; placeKnob(); if (send) sendAim();
}
function sendAim(force) {
  const now = performance.now(); if (aimTimer) { clearTimeout(aimTimer); aimTimer = null; }
  const go = () => { aimSentAt = performance.now(); if (S && S.phase === 'play' && S.turn === me) sendMsg({ t: 'aim', a: R.aim[me].a, p: R.aim[me].p, w: sel }); };
  if (force || now - aimSentAt > 110) go(); else aimTimer = setTimeout(go, 110 - (now - aimSentAt));
}
const pad = $('pad');
function placeKnob() {
  if (!S || me < 0) return; const a = R.aim[me]; const rad = pad.clientWidth / 2 - 21; const r = (a.p / 100) * rad; const ang = a.a * Math.PI / 180;
  const k = $('knob'); k.style.left = 50 + (Math.cos(ang) * r / pad.clientWidth) * 100 + '%'; k.style.top = 50 - (Math.sin(ang) * r / pad.clientWidth) * 100 + '%';
}
let padDrag = false;
function padMove(e) {
  const r = pad.getBoundingClientRect(); const vx = e.clientX - (r.left + r.width / 2), vy = e.clientY - (r.top + r.height / 2); const d = Math.hypot(vx, vy);
  if (d < 6) return; let a = Math.atan2(-vy, vx) * 180 / Math.PI; if (a < 0) a = vx >= 0 ? 0 : 180;
  setAim(a, clamp(d / (r.width / 2 - 8) * 100, 8, 100));
}
pad.addEventListener('pointerdown', (e) => { if (!myTurn()) return; padDrag = true; pad.setPointerCapture(e.pointerId); padMove(e); e.preventDefault(); });
pad.addEventListener('pointermove', (e) => { if (padDrag) padMove(e); });
const padEnd = () => { padDrag = false; }; pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd);
function holdBtn(el, fn) {
  let iv = null, to = null; const stop = () => { clearTimeout(to); clearInterval(iv); iv = to = null; };
  el.addEventListener('pointerdown', (e) => { if (!myTurn()) return; e.preventDefault(); fn(); to = setTimeout(() => { iv = setInterval(fn, 60); }, 350); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.addEventListener(ev, stop));
}
holdBtn($('aMinus'), () => myTurn() && setAim(R.aim[me].a - 1, R.aim[me].p)); holdBtn($('aPlus'), () => myTurn() && setAim(R.aim[me].a + 1, R.aim[me].p));
holdBtn($('pMinus'), () => myTurn() && setAim(R.aim[me].a, R.aim[me].p - 1)); holdBtn($('pPlus'), () => myTurn() && setAim(R.aim[me].a, R.aim[me].p + 1));

function setDrive(d) {
  if (d !== 0 && !myTurn()) d = 0;
  if (d === driveDir) return; driveDir = d; $('dl').classList.toggle('on', d < 0); $('dr').classList.toggle('on', d > 0);
  sendMsg({ t: 'drive', d });
}
// dlouhé držení prstu na ovládání nesmí spustit systémové menu ani vibraci (telefon při dlouhém stisku bzučí)
document.addEventListener('contextmenu', (e) => { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault(); });
for (const el of [...document.querySelectorAll('#drive button, #pad, .nudge button')]) el.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
for (const [id, d] of [['dl', -1], ['dr', 1]]) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); setDrive(d); });
  for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, () => setDrive(0));
  el.addEventListener('lostpointercapture', () => setDrive(0));
}
function doFire() {
  if (!myTurn()) return; const a = R.aim[me]; $('tray').hidden = true;
  setDrive(0); fireSent = true; sendMsg({ t: 'fire', a: a.a, p: a.p, w: sel }); updateHud(true);
}
$('fire').onclick = doFire;

// klávesnice
const held = new Set(); let keyIv = null;
function keyStep() {
  if (!myTurn()) return; const a = R.aim[me]; let da = 0, dp = 0;
  if (held.has('ArrowLeft')) da += 1; if (held.has('ArrowRight')) da -= 1; if (held.has('ArrowUp')) dp += 1; if (held.has('ArrowDown')) dp -= 1;
  // úhel: šipka doleva zvedá hlaveň na levou stranu (úhel roste), doprava ji sklání
  if (da || dp) setAim(a.a + da, a.p + dp);
}
window.addEventListener('keydown', (e) => {
  if (screen !== 'game' || e.target.tagName === 'INPUT' || !$('pauseModal').hidden) return;
  const k = e.key;
  if (k === ' ' || k === 'Enter') { e.preventDefault(); if (!e.repeat) doFire(); return; }
  if (k === 'Escape') { pauseHelp(); $('pauseModal').hidden = false; return; }
  if (k === 'a' || k === 'A') { setDrive(-1); return; } if (k === 'd' || k === 'D') { setDrive(1); return; }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) { e.preventDefault(); if (!held.has(k)) { held.add(k); keyStep(); } if (!keyIv) keyIv = setInterval(keyStep, 55); return; }
  if (/^[1-9]$/.test(k) && myTurn()) { const id = ORDER.filter(ammoHas)[+k - 1]; if (id) selectWeapon(id); }
});
window.addEventListener('keyup', (e) => {
  const k = e.key; if (k === 'a' || k === 'A' || k === 'd' || k === 'D') setDrive(0);
  held.delete(k); if (!held.size && keyIv) { clearInterval(keyIv); keyIv = null; }
});
window.addEventListener('blur', () => { setDrive(0); held.clear(); });

// ------------------------------------------------------------------ konec zápasu
function showOver() {
  if (!S || !S.result) return; const r = S.result; const won = r.winner === me, draw = r.winner == null;
  $('over').hidden = false; $('tray').hidden = true;
  const ti = $('oTitle'); ti.textContent = draw ? 'REMÍZA' : won ? 'VÝHRA!' : 'PROHRA'; ti.className = 'otitle' + (draw ? ' draw' : won ? '' : ' lose');
  $('oReason').textContent = r.reason || '';
  const c = r.coins && r.coins[me], bn = r.bonus && r.bonus[me], sk = r.streak && r.streak[me]; $('oCoins').innerHTML = c ? `<span class="pos"><span class="coin"></span> +${c}</span>${bn ? `<span class="streak">🔥 série ${sk} výher · bonus +${bn}</span>` : ''}` : (r.noCoins ? `<span class="nc">${esc(r.noCoins)}</span>` : '');
  const x = r.xp && r.xp[me]; $('oXpTxt').textContent = x ? `+${x.gain} XP${x.up ? ' · NOVÁ ÚROVEŇ ' + x.lvl + '!' : ''}` : '';
  $('oXpBar').style.width = '0%';
  if (draw) {} else if (won) sfx.win(); else sfx.lose();
  refreshProfile().then((j) => { if (j && !$('over').hidden) { const t = j.tank; $('oXpBar').style.width = (t.next ? clamp((t.xp - t.from) / (t.next - t.from), 0, 1) * 100 : 100) + '%'; } });
  const bot = S.players.some((p) => p.bot); const opp = S.players[1 - me];
  $('oAgainTxt').textContent = bot ? 'Hrát znovu' : 'Odveta'; $('oAgain').disabled = !bot && !(opp && opp.connected);
  $('oHint').textContent = !bot && opp && !opp.connected ? 'Soupeř odešel.' : '';
}
$('oAgain').onclick = () => { sendMsg({ t: 'rematch' }); const bot = S && S.players.some((p) => p.bot); if (!bot) { $('oHint').textContent = 'Čekám na soupeře…'; $('oAgain').disabled = true; } };
$('oMenu').onclick = leaveGame;
function pauseHelp() {
  const own = (id) => (WEAPONS[id].inf ? '' : ((S && S.ammo && S.ammo[id]) | 0));
  $('pauseHelp').innerHTML = ORDER.map((id) => { const w = WEAPONS[id]; const n = own(id);
    return `<div class="wr"><i style="color:${w.col}"></i><div><b>${esc(w.name)}</b>${n ? `<em>máš ${n}×</em>` : ''}${w.max ? `<small> (max ${w.max})</small>` : ''}<br><span>${esc(w.desc)}${w.util ? '' : ` Poškození až ${w.shots ? w.shots + '×' : ''}${w.split ? w.split.n + '×' + w.split.dmg : w.dmg}.`}${P.consOf(w) ? ` <u>Nevýhoda: ${esc(P.consOf(w))}</u>` : ''}</span></div></div>`; }).join('');
}
$('menuBtn').onclick = () => { pauseHelp(); $('pauseModal').hidden = false; $('pLeave').innerHTML = '<b>Vzdát se a odejít</b>'; };
let leaveArmed = false;
$('pLeave').onclick = () => { if (!leaveArmed) { leaveArmed = true; $('pLeave').innerHTML = '<b>Opravdu? Klepni znovu</b>'; setTimeout(() => { leaveArmed = false; $('pLeave').innerHTML = '<b>Vzdát se a odejít</b>'; }, 3000); return; } leaveArmed = false; $('pauseModal').hidden = true; leaveGame(); };
$('leaveLobby').onclick = leaveGame;
$('copyLink').onclick = async () => {
  const url = location.origin + location.pathname + '?k=' + (S ? S.code : '');
  try { await navigator.clipboard.writeText(url); toast('Odkaz zkopírován.'); } catch (e) { toast('Kód: ' + (S ? S.code : '')); }
};

// ------------------------------------------------------------------ start
$('back').href = CFG.BACK_URL || '../';
setMuted(muted);
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize(); requestAnimationFrame(frame); show('menu'); bootProfile();
document.addEventListener('pointerdown', () => audio(), { once: true });
{ // odkaz s kódem místnosti / rozehraná hra
  const q = new URLSearchParams(location.search).get('k');
  let rs = null; try { rs = JSON.parse(LS.get('tanks_resume')); } catch (e) { /* nic */ }
  if (q && /^[A-Za-z]{4}$/.test(q)) { $('code').value = q.toUpperCase(); setTimeout(() => startGame({ t: 'join', code: q.toUpperCase() }), 700); }
  else if (rs && rs.code && rs.token && Date.now() - rs.at < 30 * 60 * 1000) { session = { code: rs.code, token: rs.token }; setStatus('Obnovuji rozehranou hru…'); connect(); }
}
window.__tanks = { R, get S() { return S; }, P, show, onMsg };
