// HOPÍK – klient: menu s výběrem postavičky, čekárna, a hra (výběr kusu → pokládání → běh) na canvasu. Pohyb vlastní postavy se počítá tady v prohlížeči
// (stejná fyzika jako na serveru, phys.js) a každých pár ticků se hlásí serveru; ostatní hráči se zobrazují z jeho snímků a mezi nimi se plynule dopočítávají.
import * as K from './shared.js?v=7';
import * as P from './phys.js?v=7';
import * as A from './art.js?v=7';
import { startScene, stopScene } from './scene.js?v=7';
import { createMusic } from './music.js?v=7';
const { COLS, ROWS, TPS, CHARS, STAGES } = K;

const CFG = window.HOPIK_CONFIG || {};
const $ = (id) => document.getElementById(id);
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nic */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* nic */ } } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const API = String(CFG.SERVER_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/hopik\/?$/, '');
const DELAY = 100;                                                   // ms: o tolik se ostatní hráči vykreslují za skutečností kvůli plynulosti
const BOT_LEVELS = [[1, 'Nováček', 'Skáče nejistě a občas spadne.'], [2, 'Skokan', 'Zvládne většinu tratí a umí podrazit.'], [3, 'Mistr', 'Skáče přesně a staví zákeřné pasti.']];
const svgSpeaker = (off) => `<svg class="svgi" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5h4l5-4v13l-5-4H3z" fill="currentColor"/>${off ? '<path d="M15.5 9l6 6m0-6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' : '<path d="M15.5 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'}</svg>`;

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
const myName = () => { const el = $('name'); const v = el && !el.closest('[hidden]') ? el.value.trim() : ''; return v || (prof && prof.name) || LS.get('hopik_name') || undefined; };
async function call(action, body) {
  const r = await fetch(API + '/api/hopik/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ident(), ...body }), signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Chyba ' + r.status); return j;
}

// ------------------------------------------------------------------ zvuk (syntetický)
let ac = null, noiseBuf = null, muted = LS.get('hopik_mute') === '1';
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
  click() { tone(560, .05, 'square', .035); },
  pick() { [660, 880].forEach((f, i) => tone(f, .09, 'triangle', .07, 0, i * .06)); },
  place() { tone(170, .12, 'sine', .14, -70); noise(.06, .05, 900, 300); },
  jump() { tone(330, .13, 'square', .035, 380); },
  land() { noise(.06, .035, 700, 250); },
  bounce() { tone(220, .28, 'sine', .12, 700); },
  die() { noise(.28, .12, 1500, 150); tone(420, .4, 'sawtooth', .05, -330); },
  boom() { noise(.3, .1, 1200, 200); },
  bomb(big) { noise(big ? .9 : .55, big ? .32 : .22, big ? 2400 : 3200, 90); tone(big ? 70 : 110, big ? .7 : .4, 'sine', big ? .3 : .22, -45); if (big) tone(48, .9, 'sine', .25, -20, .05); },
  fin() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .13, 'triangle', .08, 0, i * .07)); },
  tick() { tone(740, .08, 'triangle', .07); },
  go() { tone(988, .25, 'triangle', .1); tone(1318, .3, 'triangle', .08, 0, .08); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .2, 'triangle', .09, 0, i * .11)); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, .28, 'sawtooth', .05, 0, i * .18)); },
  err() { tone(160, .14, 'square', .05); },
  pop() { tone(440, .08, 'sine', .08, 500); },
};
// hudba (music.js): vlastní přepínač, ztlumení zvuku vypne i hudbu
let musicOn = LS.get('hopik_music') !== '0';
const music = createMusic(() => (ac && ac.state === 'running' ? ac : null), () => !muted && musicOn && !document.hidden);
const svgNote = (off) => `<svg class="svgi" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V5.5l10-2v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><ellipse cx="6.5" cy="17.8" rx="3" ry="2.3" fill="currentColor"/><ellipse cx="16.5" cy="15.8" rx="3" ry="2.3" fill="currentColor"/>${off ? '<path d="M3 3l18 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' : ''}</svg>`;
function syncMute() { $('muteBtn').innerHTML = svgSpeaker(muted); $('pMute').innerHTML = `<b>Zvuk: ${muted ? 'vypnutý' : 'zapnutý'}</b>`; $('musicBtn').innerHTML = svgNote(!musicOn || muted); $('pMusic').innerHTML = `<b>Hudba: ${musicOn && !muted ? 'zapnutá' : 'vypnutá'}</b>`; }
const toggleMute = () => { muted = !muted; LS.set('hopik_mute', muted ? '1' : '0'); syncMute(); if (!muted) sfx.click(); syncMusic(); };
const toggleMusic = () => { audio(); musicOn = !musicOn; if (musicOn && muted) { muted = false; LS.set('hopik_mute', '0'); } LS.set('hopik_music', musicOn ? '1' : '0'); syncMute(); syncMusic(); };
$('muteBtn').onclick = toggleMute; $('pMute').onclick = toggleMute; $('musicBtn').onclick = toggleMusic; $('pMusic').onclick = toggleMusic; syncMute();
// nálada podle obrazovky a fáze: menu a čekárna veselá, pokládání šibalské, běh hnaný, odpočet a konec ticho
function wantMood() {
  if (screen !== 'game') return 'menu'; const ph = phase();
  return ph === 'pick' || ph === 'place' || ph === 'reveal' ? 'build' : ph === 'run' ? 'run' : ph === 'score' ? 'menu' : 'off';
}
function syncMusic() { music.set(wantMood()); }
for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, () => { if (!ac || ac.state !== 'running') { audio(); setTimeout(syncMusic, 60); } }, { passive: true });
document.addEventListener('visibilitychange', syncMusic);

// ------------------------------------------------------------------ obrazovky a okna
let screen = 'menu';
function show(name) {
  screen = name; for (const id of ['menu', 'lobby', 'game']) $(id).hidden = id !== name;
  $('game').classList.toggle('ov', !!coarse());   // na dotykovém zařízení ovládání i výběr kusů překrývají hru
  if (name === 'game') { resize(); if (isFs() && coarse()) lockLand(false); } else unlockLand();

  if (name === 'menu') startScene($('mscene')); else stopScene();
}
let toastT = null;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600); }
function setStatus(msg, err) { const el = $('menuStatus'); el.textContent = msg || ''; el.classList.toggle('err', !!err); }
const openModal = (id) => { $(id).hidden = false; };
document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { const m = e.target.closest('.modal'); if (m) m.hidden = true; } else if (e.target.classList && e.target.classList.contains('modal')) e.target.hidden = true; });

// ------------------------------------------------------------------ menu: postavička, profil, boti
let myChar = clamp(Number(LS.get('hopik_char')) || 0, 0, CHARS.length - 1);
let botPick = { n: 3, level: 2, stage: 0 };
try { const b = JSON.parse(LS.get('hopik_bot')); if (b && b.n >= 1 && b.n <= 3 && b.level >= 1 && b.level <= 3) botPick = { ...botPick, ...b, stage: K.stageIdx(b.stage) }; } catch (e) { /* výchozí */ }
function charCards(sel, taken, mini) {
  return CHARS.map((c, i) => { const by = taken ? taken[i] : undefined; return `<button type="button" class="ch${i === sel ? ' on' : ''}${by !== undefined && by !== sel ? ' taken' : ''}" data-ch="${i}" aria-label="${esc(c.name)}"><img src="${A.portraitURL(i, mini ? 72 : 96)}" alt="">${by !== undefined && i !== sel ? `<i class="who" style="--c:${A.SEAT[by]}"></i>` : ''}<b>${esc(c.name)}</b></button>`; }).join('');
}
function renderChars() {
  $('charGrid').innerHTML = charCards(myChar);
  $('charInfo').textContent = `${CHARS[myChar].name}: ${CHARS[myChar].desc}`;
}
async function setChar(i) {
  myChar = i; LS.set('hopik_char', String(i)); renderChars(); sfx.pick();
  if (prof && prof.account) { try { prof = await call('char', { char: i }); } catch (e) { /* ukládá se i při dalším vstupu do hry */ } }
}
$('charGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (b) setChar(+b.dataset.ch); });
async function refreshProfile() { try { prof = await call('me', {}); } catch (e) { prof = null; } if (prof && prof.account && prof.hopik.char >= 0 && !LS.get('hopik_char')) { myChar = prof.hopik.char; LS.set('hopik_char', String(myChar)); } renderProfile(); renderChars(); return prof; }
function renderProfile() {
  const ok = !!(prof && prof.account);
  $('prof').hidden = !ok; $('nameField').hidden = ok && prof.linked;
  if (!ok) return;
  $('pName').textContent = prof.name || 'Hráč'; $('pRec').textContent = `${prof.hopik.wins} výher · ${prof.hopik.games} zápasů`;
  $('pCoins').lastElementChild.textContent = prof.hopik.coins; $('shopSub').textContent = `máš ${prof.hopik.coins} coinů`;
}

// ------------------------------------------------------------------ obchod s kosmetikou
let shopCat = 'hat', trying = null;   // trying = { cat, id }: věc, kterou si hráč zkouší, ale ještě ji nemá
const coinI = '<i class="coin"></i>';
const owns = (cat, id) => !!(prof && prof.account && prof.hopik.own.includes(cat + ':' + id));
function renderShop() {
  const ok = !!(prof && prof.account); const b = ok ? prof.hopik : null; const sk = myChar;
  $('shopCoins').textContent = ok ? b.coins : 0;
  $('shopTabs').innerHTML = K.COSM_CATS.map((c) => `<button type="button" class="${c.id === shopCat ? 'on' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('');
  const cat = K.COSM_CATS.find((c) => c.id === shopCat); const eq = ok ? b.eq : {};
  const look = { ...eq }; if (trying) look[trying.cat] = trying.id;
  $('shopPrev').src = A.portraitURL(sk, 112, '', look);
  if (!ok) { $('shopGrid').innerHTML = '<p class="muted">Do obchodu se musíš přihlásit (účet se vytvoří při otevření portálu).</p>'; $('shopName').textContent = ''; $('shopHint').textContent = ''; $('shopBuy').hidden = true; return; }
  const tile = (id, name, price, thumbId) => {
    const own = id === '' || id === '-' || owns(cat.id, id); const cur = eq[cat.id] || ''; const on = trying ? (trying.cat === cat.id && trying.id === id) : cur === id;
    const sub = id === '' || id === '-' ? (cur === id && !trying ? 'nasazeno' : 'zdarma') : own ? (cur === id && !trying ? 'nasazeno' : 'máš') : `${coinI}${price}`;
    const poor = !own && b.coins < price;
    return `<button type="button" class="si${on ? ' on' : ''}${own ? ' own' : ''}${poor ? ' poor' : ''}" data-id="${esc(id)}"><img src="${A.cosmURL(cat.id, thumbId, sk)}" alt=""><b>${esc(name)}</b><small>${sub}</small></button>`;
  };
  let html = tile('', cat.orig, 0, '');
  if (cat.none) html += tile('-', cat.none, 0, '-');
  html += K.COSM[cat.id].map((it) => tile(it.id, it.name, it.price, it.id)).join('');
  $('shopGrid').innerHTML = html;
  const it = trying ? K.cosmItem(trying.cat, trying.id) : null; const buy = $('shopBuy');
  if (it) { $('shopName').textContent = it.name; const need = it.price - b.coins; $('shopHint').textContent = need > 0 ? `Chybí ti ${need} coinů. Hraj zápasy a vyděláš je.` : 'Zatím ji jen zkoušíš, koupíš ji tlačítkem.'; buy.hidden = false; buy.disabled = need > 0; buy.firstElementChild.innerHTML = `Koupit za ${coinI}${it.price}`; }
  else { buy.hidden = true; const cur = eq[shopCat]; const ci = cur && cur !== '-' ? K.cosmItem(shopCat, cur) : null; $('shopName').textContent = `${cat.name}: ${ci ? ci.name : cur === '-' ? cat.none : cat.orig}`; $('shopHint').textContent = 'Klepni na věc: vlastní se nasadí hned, ostatní si nejdřív vyzkoušíš.'; }
}
$('bShop').onclick = async () => { audio(); await refreshProfile(); trying = null; renderShop(); openModal('shopModal'); };
$('shopTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; shopCat = b.dataset.cat; trying = null; sfx.click(); renderShop(); });
$('shopGrid').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-id]'); if (!b || !prof || !prof.account) return; const id = b.dataset.id;
  if (id === '' || id === '-' || owns(shopCat, id)) { trying = null; try { prof = await call('equip', { cat: shopCat, id }); renderProfile(); renderShop(); sfx.pick(); } catch (x) { sfx.err(); toast(x.message); } }
  else { trying = { cat: shopCat, id }; sfx.click(); renderShop(); }
});
$('shopBuy').onclick = async () => {
  if (!trying) return; const t = trying;
  try { prof = await call('buy', { cat: t.cat, id: t.id }); trying = null; renderProfile(); renderShop(); sfx.pick(); toast('Koupeno a nasazeno.'); } catch (x) { sfx.err(); toast(x.message); renderShop(); }
};
function renderBotModal() {
  for (const b of $('botN').children) b.classList.toggle('on', +b.dataset.n === botPick.n);
  $('botStages').innerHTML = STAGES.map((s, i) => `<button type="button" class="st${i === botPick.stage ? ' on' : ''}" data-st="${i}"><img src="${A.stageThumb(i, 160)}" alt=""><b>${esc(s.name)}</b></button>`).join('');
  $('botLevels').innerHTML = BOT_LEVELS.map(([n, nm, ds]) => `<button class="lv${n === botPick.level ? ' on' : ''}" type="button" data-lv="${n}"><b>${nm}</b><small>${ds}</small></button>`).join('');
}
$('bBot').onclick = () => { audio(); renderBotModal(); openModal('botModal'); };
$('botN').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (!b) return; botPick.n = +b.dataset.n; sfx.click(); renderBotModal(); });
$('botLevels').addEventListener('click', (e) => { const b = e.target.closest('[data-lv]'); if (!b) return; botPick.level = +b.dataset.lv; sfx.click(); renderBotModal(); });
$('botStages').addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; botPick.stage = +b.dataset.st; sfx.click(); renderBotModal(); });
$('botGo').onclick = () => { LS.set('hopik_bot', JSON.stringify(botPick)); $('botModal').hidden = true; startGame({ t: 'bot', n: botPick.n, level: botPick.level, stage: botPick.stage }); };
$('bQuick').onclick = () => { audio(); startGame({ t: 'quick' }); };
$('bCreate').onclick = () => { audio(); startGame({ t: 'create', stage: botPick.stage }); };
$('joinForm').onsubmit = (e) => { e.preventDefault(); audio(); const c = $('code').value.trim().toUpperCase(); if (c.length !== 4) return setStatus('Kód má 4 písmena.', true); startGame({ t: 'join', code: c }); };
$('code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
$('name').addEventListener('change', () => LS.set('hopik_name', $('name').value.trim()));
$('name').value = LS.get('hopik_name') || '';
$('bHow').onclick = () => { $('howItems').innerHTML = K.PIECE_IDS.map((id) => `<div class="it"><img src="${A.pieceIcon(id, 80)}" alt=""><div><b>${esc(K.PIECES[id].name)}</b><small>${esc(K.PIECES[id].desc)}</small></div></div>`).join(''); openModal('howModal'); };

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
  const full = { ...m, ...(isStart(m.t) ? { ...ident(), name: myName(), char: myChar } : {}) };
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(full)); else { if (isStart(m.t)) outbox.push(full); connect(); }
}
setInterval(() => { if (ws && ws.readyState === 1 && screen !== 'menu') { try { ws.send('{"t":"ping"}'); } catch (e) { /* nic */ } } }, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && session && wantOpen && !ws) connect(); });
function startGame(req) {
  autoFs();
  setStatus(''); LS.set('hopik_name', ($('name').value || '').trim());
  session = null; LS.del('hopik_resume'); S = null; GS = null; resetRun(); outbox = []; retry = 0;
  if (!(ws && ws.readyState === 1)) setStatus('Připojuji…');
  sendMsg(req);
}
function backToMenu(msg) {
  wantOpen = false; session = null; LS.del('hopik_resume'); outbox = []; clearTimeout(connTimer);
  if (ws) { try { ws.onclose = null; ws.close(); } catch (e) { /* nic */ } ws = null; }
  S = null; GS = null; resetRun(); $('conn').hidden = true; for (const id of ['over', 'score', 'pauseModal', 'picks']) $(id).hidden = true; clearTimeout(overTimer); overTimer = null;
  show('menu'); setStatus(msg || '', !!msg); refreshProfile();
}
function leaveGame() { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ t: 'leave' })); } catch (e) { /* nic */ } } backToMenu(); }

// ------------------------------------------------------------------ stav hry
let S = null;                 // poslední zpráva `state` (místnost)
let GS = null;                // poslední zpráva `game` (fáze, kusy, nabídka) + čas příjmu
let me = 0;
let W = null, wSig = '';      // svět pro aktuální kolo (stage + kusy)
const born = new Map();       // id kusu → čas, kdy se objevil (animace)
let overTimer = null;
const fx = [];                // částice a efekty
const run = { dfx: false, k: 0, kAt: 0, snaps: [], body: null, prev: null, acc: 0, dead: false, fin: false, go: false, nrep: 0, tn: 0, firstFin: -1, over: false, hit: 0 };
let pl = { x: 14, y: 8, r: 0, ok: false, sent: false, last: 0, sig: '', moved: false };
let ghosts = [];              // cizí duchové kusů během pokládání: [x, y, r] | null
let banT = null, hintSig = '', pickSig = '', chipSig = '', shake = 0, lastBeep = -1;

function resetRun() {
  run.lastTk = undefined; run.k = 0; run.kAt = performance.now(); run.snaps = []; run.body = null; run.prev = null; run.acc = 0; run.dead = false; run.fin = false; run.go = false; run.nrep = 0; run.tn = 0; run.firstFin = -1; run.hit = 0; run.dfx = false;
  fx.length = 0; ghosts = []; pl = { x: 14, y: 8, r: 0, ok: false, sent: false, last: 0, sig: '', moved: false }; hintSig = ''; pickSig = ''; chipSig = ''; shake = 0; lastBeep = -1;
}
const phase = () => (GS ? GS.ph : '');
const nowTick = () => run.k + Math.floor(((performance.now() - run.kAt) * TPS) / 1000);
const nowTickF = () => run.k + ((performance.now() - run.kAt) * TPS) / 1000;   // zlomkový tik jen pro plynulé kreslení
function secsLeft() {
  if (!GS) return 0; const el = GS.gt / TPS + (performance.now() - GS.at) / 1000; const T = { ...K.TIME, ...(GS.cfg ? { pick: GS.cfg.pick, place: GS.cfg.place, run: GS.cfg.run } : {}) };
  switch (GS.ph) {
    case 'pick': return T.pick - el; case 'place': return T.place - el; case 'reveal': return T.reveal - el; case 'count': return T.count - el; case 'score': return T.score - el;
    case 'run': { const k = nowTick(); let left = T.run - k / TPS; if (run.firstFin >= 0) left = Math.min(left, T.hurry - (k - run.firstFin) / TPS); return left; }
    default: return 0;
  }
}
function worldFor(m) {
  const sig = m.stage + ':' + m.round + ':' + m.pieces.map((p) => p[0]).join(',') + (m.ph === 'count' ? ':c' : '');
  if (sig === wSig && W) return;
  const old = wSig; wSig = sig;
  const pcs = m.pieces.map(([id, type, r, x, y, owner, round]) => ({ id, type, r, x, y, owner, round }));
  W = P.buildWorld(m.stage, pcs); W.onCrumble = (gid, tick) => sendMsg({ t: 'cr', gid, k: tick });
  const t0 = performance.now(); for (const p of pcs) { if (!born.has(p.id)) born.set(p.id, old ? t0 : t0 - 2000); }
  if (m.pieces.length === 0) born.clear();
}

function onMsg(m) {
  switch (m.t) {
    case 'joined': session = { code: m.code, token: m.token }; LS.set('hopik_resume', JSON.stringify({ ...session, at: Date.now() })); setStatus(''); return;
    case 'state': return onState(m);
    case 'game': return onGame(m);
    case 'tk': return onTick(m);
    case 'placeres': sfx.err(); toast(m.ok === 'invalid' ? 'Sem se kus položit nedá.' : 'Teď se nedá nic položit.'); pl.sent = false; shake = 0.25; return;
    case 'pong': return;
    case 'err': sfx.err(); toast(m.msg); if (m.fatal) { if (m.gone) backToMenu('Zápas už neexistuje.'); else if (screen === 'menu') setStatus(m.msg, true); else backToMenu(m.msg); } return;
    default:
  }
}
function onState(s) {
  const prev = S; S = s; me = s.you; $('conn').hidden = true;
  if (s.phase === 'lobby') { if (screen !== 'lobby') show('lobby'); renderLobby(s); return; }
  if (screen !== 'game') show('game');
  if (!prev || prev.phase === 'lobby' || prev.matchId !== s.matchId) { GS = null; resetRun(); wSig = ''; born.clear(); for (const id of ['over', 'score']) $(id).hidden = true; clearTimeout(overTimer); overTimer = null; }
  const d = s.drop; const dn = $('dropNote');
  if (d && d.idx >= 0 && d.idx !== me && s.players[d.idx]) { dn.textContent = `${s.players[d.idx].name} se odpojil, čekáme ${d.left} s`; dn.hidden = false; } else dn.hidden = true;
  if (s.phase === 'over' && s.result) { if (!overTimer && $('over').hidden) overTimer = setTimeout(() => { overTimer = null; showOver(); }, 900); } else if (s.phase !== 'over') { $('over').hidden = true; clearTimeout(overTimer); overTimer = null; }
  else if (!$('over').hidden) renderOver();
  renderChips();
}
function onGame(m) {
  const prev = GS; const at = performance.now(); GS = { ...m, at };
  if (screen !== 'game') return;
  const newRound = !prev || prev.round !== m.round, newPh = !prev || prev.ph !== m.ph;
  worldFor(m);
  if (newRound && m.ph === 'pick') { resetRun(); $('score').hidden = true; if (prev) banner(`Kolo ${m.round}`, 1100); }
  if (newPh) {
    banT && clearTimeout(banT);
    if (m.ph === 'pick') { $('score').hidden = true; sfx.click(); if (m.sub === 1 && prev && prev.ph === 'place') { banner('<b>Bonusový výběr!</b> Každý si vybere a položí ještě jeden kus.', 2200); sfx.pop(); } }
    if (m.ph === 'place') { pl = { x: Math.max(0, Math.round(COLS / 2 - 1)), y: 7, r: 0, ok: false, sent: false, last: 0, sig: '', moved: false }; sfx.click(); }
    if (m.ph === 'reveal') { sfx.pop(); const mine = m.pieces.filter((p) => p[6] === m.round); for (const p of mine) if (!born.has(p[0])) born.set(p[0], at); }
    if (m.ph === 'count') { run.dfx = false; run.dead = false; run.fin = false; run.go = false; run.body = null; run.prev = null; run.snaps = []; run.firstFin = -1; fx.length = 0; lastBeep = -1; }
    if (m.ph === 'score') { showScore(); }
    if (m.ph === 'run') { run.firstFin = -1; }
  }
  if (m.ph === 'run' && prev && prev.ph === 'run' && m.fin) { /* stav doběhnutí přijde i z událostí */ }
  renderChips(); renderPicks(); renderHint();
}
function onTick(m) {
  const at = performance.now();
  if (typeof m.gt === 'number' && GS && m.ph === GS.ph) { GS.gt = m.gt; GS.at = at; }
  if (m.p) {
    run.k = m.k; run.kAt = at; run.snaps.push({ at, p: m.p }); if (run.snaps.length > 12) run.snaps.shift();
    if (!run.body && (m.ph === 'count' || m.ph === 'run') && m.p[me]) { const s = m.p[me]; run.body = P.newBody(s[0], s[1]); run.prev = { x: s[0], y: s[1] }; }
  }
  if (m.gh) ghosts = m.gh;
  if (m.ev) for (const e of m.ev) onEvent(e, at);
}
function seatColor(i) { return A.SEAT[i % 4]; }
function onEvent(e, at) {
  switch (e[0]) {
    case 'go': run.go = true; banner('HOP!', 700); sfx.go(); break;
    case 'd': { const [, i, x, y, cause] = e; if (i === me) { if (run.dfx) break; run.dead = true; run.dfx = true; } deathFx(i, x, y, cause); break; }
    case 'f': { const [, i, ord] = e; if (run.firstFin < 0) run.firstFin = nowTick(); if (i === me) { run.fin = true; } finishFx(i, ord); break; }
    case 'j': if (e[1] !== me) { /* cizí skok: tichý, ať to nehrká */ } break;
    case 'cr': if (W) P.triggerCrumble(W, e[1], e[2]); break;
    case 'bomb': bombFx(e); break;
    default:
  }
}
function deathFx(i, x, y, cause) {
  const ch = S && S.players[i] ? S.players[i].char : 0; const C = CHARS[ch] || CHARS[0];
  for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.283 + Math.random() * 0.4, v = 3 + Math.random() * 5; fx.push({ k: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, g: 16, life: 0.7 + Math.random() * 0.4, t: 0, c: k % 3 ? C.body : C.dark, s: 0.12 + Math.random() * 0.12 }); }
  fx.push({ k: 'ring', x, y, life: 0.4, t: 0 }); fx.push({ k: 'ghost', x, y, ch, life: 1.3, t: 0 });
  if (i === me) { shake = 0.3; } sfx.die();
  if (cause > 0 && S && S.players[cause - 1] && cause - 1 !== i) fx.push({ k: 'txt', x, y: y - 0.8, text: `${S.players[cause - 1].name}!`, c: seatColor(cause - 1), life: 1.4, t: 0 });
}
function finishFx(i, ord) {
  const b = run.snaps.length ? run.snaps[run.snaps.length - 1].p[i] : null; const x = i === me && run.body ? run.body.x : b ? b[0] : 28, y = i === me && run.body ? run.body.y : b ? b[1] : 5;
  for (let k = 0; k < 26; k++) { const a = Math.random() * 6.283, v = 2 + Math.random() * 6; fx.push({ k: 'conf', x, y: y - 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, g: 10, life: 1.1 + Math.random() * 0.8, t: 0, c: ['#ff5a4f', '#ffc928', '#2f9cff', '#46c46a'][k % 4], s: 0.16, r: Math.random() * 6 }); }
  fx.push({ k: 'txt', x, y: y - 1, text: ord === 1 ? 'První!' : `${ord}.`, c: '#46c46a', life: 1.3, t: 0 }); if (i === me || ord === 1) sfx.fin();
}
function banner(html, ms, extra) { const el = $('banner'); el.innerHTML = html + (extra || ''); el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; clearTimeout(banT); if (ms) banT = setTimeout(() => { el.hidden = true; }, ms); }

// ------------------------------------------------------------------ čekárna
function renderLobby(s) {
  $('roomCode').textContent = s.code; $('lobbyTitle').textContent = s.quick ? 'Rychlá hra' : 'Vlastní hra';
  $('slots').innerHTML = [0, 1, 2, 3].map((i) => { const p = s.players[i]; if (!p) return '<div class="slot empty">volné místo</div>'; return `<div class="slot${i === s.you ? ' me' : ''}"><img src="${A.portraitURL(p.char, 72, '', p.cs)}" alt=""><div><b><i class="seat" style="--c:${A.SEAT[i]}"></i>${esc(p.name)}</b><small>${i === s.host && !s.quick ? 'zakladatel · ' : ''}${p.bot ? 'bot' : p.connected ? esc(CHARS[p.char].name) : 'odpojen'}</small></div></div>`; }).join('');
  const taken = {}; s.players.forEach((p, i) => { if (p.char >= 0) taken[p.char] = i; });
  $('lobbyChars').innerHTML = charCards(s.players[s.you] ? s.players[s.you].char : -1, taken, true);
  const n = s.players.length; const host = s.you === s.host && !s.quick;
  $('copyLink').hidden = !!s.quick; $('hostBox').hidden = !host;
  const st = STAGES[s.stage] || STAGES[0];
  $('stageSel').className = 'stagesel';
  $('stageSel').innerHTML = host ? `<h3>Trať</h3><div class="stages">${STAGES.map((x, i) => `<button type="button" class="st${i === s.stage ? ' on' : ''}" data-st="${i}"><img src="${A.stageThumb(i, 160)}" alt=""><b>${esc(x.name)}</b></button>`).join('')}</div>` : `<div class="stageone"><img src="${A.stageThumb(s.stage || 0, 200)}" alt=""><div><small>Trať</small><b>${esc(st.name)}</b><small>${esc(st.desc)}</small></div></div>`;
  renderCfg(s, host);
  $('lobbyHint').textContent = s.quick ? (s.auto != null && n >= 2 ? `Hra začne za ${s.auto} s (nebo hned, až budou čtyři).` : 'Hledám další hráče, stačí dva…') : host ? 'Pošli kód kamarádům. Začít můžeš, až budou aspoň dva, nebo prázdná místa doplň boty.' : 'Čekáme, až zakladatel začne hru.';
  if (host) { const ok = n >= 2 || $('fillBots').checked; $('startBtn').disabled = !ok; $('startBtn').querySelector('b').textContent = ok ? 'Začít hru' : 'Čekám na další hráče'; }
}
const CFG_ROWS = [['pick', 'Výběr kusu', (v) => v + ' s'], ['place', 'Pokládání', (v) => v + ' s'], ['run', 'Běh', (v) => v + ' s'], ['win', 'Body k výhře', (v) => v], ['rounds', 'Nejvýš kol', (v) => v], ['bonus', 'Bonus ve dvou', (v) => (v ? 'zap' : 'vyp')]];
function renderCfg(s, host) {
  const c = s.cfg || K.CFG_DEFAULT; const el = $('cfgSel'); el.hidden = !!s.quick;
  if (s.quick) return;
  const sum = `výběr ${c.pick} s · pokládání ${c.place} s · běh ${c.run} s · do ${c.win} bodů · nejvýš ${c.rounds} kol${c.bonus ? ' · bonusové kolo ve dvou' : ''}`;
  el.innerHTML = host ? `<h3>Nastavení zápasu</h3><div class="cfg">${CFG_ROWS.map(([k, nm, fmt]) => `<div class="cfgrow"><span>${nm}</span><div class="seg mini" data-cfg="${k}">${K.CFG_OPTS[k].map((v) => `<button type="button" data-v="${v}"${c[k] === v ? ' class="on"' : ''}>${fmt(v)}</button>`).join('')}</div></div>`).join('')}</div><small class="muted">Bonus: když hrají jen dva, každé druhé kolo si každý vybere a položí kus navíc.</small>` : `<div class="cfgsum"><small>Nastavení zápasu</small><b>${sum}</b></div>`;
}
$('cfgSel').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); const row = e.target.closest('[data-cfg]'); if (!b || !row || !S || S.you !== S.host) return; sfx.click(); sendMsg({ t: 'cfg', cfg: { [row.dataset.cfg]: +b.dataset.v } }); });
$('lobbyChars').addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (!b || !S || S.phase !== 'lobby') return; const i = +b.dataset.ch; if (b.classList.contains('taken')) return toast('Tuhle postavičku už má jiný hráč.'); myChar = i; LS.set('hopik_char', String(i)); sfx.pick(); sendMsg({ t: 'char', char: i }); });
$('stageSel').addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b || !S || S.you !== S.host) return; sfx.click(); sendMsg({ t: 'stage', stage: +b.dataset.st }); });
$('fillBots').addEventListener('change', () => S && renderLobby(S));
$('fillLevel').addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (!b) return; for (const x of $('fillLevel').children) x.classList.toggle('on', x === b); sfx.click(); });
$('startBtn').onclick = () => { audio(); const lv = +($('fillLevel').querySelector('.on') || { dataset: { l: 2 } }).dataset.l; sendMsg({ t: 'start', fill: $('fillBots').checked, level: lv, stage: S ? S.stage : 0 }); };
$('leaveLobby').onclick = () => leaveGame();
$('copyLink').onclick = async () => { const url = `${location.origin}${location.pathname}?k=${S ? S.code : ''}`; try { await navigator.clipboard.writeText(url); toast('Odkaz zkopírován.'); } catch (e) { toast(url); } };
$('pauseBtn').onclick = () => { $('pauseModal').hidden = false; };
$('pLeave').onclick = () => { $('pauseModal').hidden = true; leaveGame(); };

// ------------------------------------------------------------------ hlavička, výběr kusu, nápověda
function renderChips() {
  if (!S) return; const g = GS;
  const sig = JSON.stringify([S.players.map((p) => [p.name, p.left, p.connected, p.char]), g ? [g.pts, g.pick, g.placed, g.ph, g.round, run.dead, run.fin] : 0, g && g.piece, g && g.offers.map((o) => o[1]), me, run.snaps.length ? run.snaps[run.snaps.length - 1].p.map((p) => p[4]) : 0]);
  if (sig === chipSig) return; chipSig = sig;
  const last = run.snaps.length ? run.snaps[run.snaps.length - 1].p : null; const ph = phase();
  $('pchips').innerHTML = S.players.map((p, i) => {
    const flags = last && (ph === 'run' || ph === 'count') ? last[i][4] : 1; const dead = last && ph === 'run' ? !(flags & 1) : false; const fin = last && ph === 'run' ? !!(flags & 2) : false;
    const ready = g && ((ph === 'pick' && g.offers.some((o) => o[1] === i)) || (ph === 'place' && g.placed[i]));
    return `<div class="pc${i === me ? ' me' : ''}${dead ? ' dead' : ''}${fin ? ' fin' : ''}${p.left ? ' left' : ''}${ready ? ' ready' : ''}" style="--c:${A.SEAT[i]}"><img src="${A.portraitURL(p.char, 48, '', p.cs)}" alt=""><div style="min-width:0"><span class="nm">${esc(p.name)}</span><span class="pt">${g ? g.pts[i] : 0} b.</span></div></div>`;
  }).join('');
}
function renderPicks() {
  const g = GS; const el = $('picks'); const ph = phase();
  if (!g || ph !== 'pick') { el.hidden = true; pickSig = ''; return; }
  const sig = JSON.stringify([g.offers, g.round]); const mine = g.offers.findIndex((o) => o[1] === me);
  el.hidden = false; $('pickTitle').textContent = mine >= 0 ? 'Máš vybráno. Čekáme na ostatní…' : 'Vyber si kus!';
  if (sig === pickSig) return; pickSig = sig;
  $('cards').innerHTML = g.offers.map(([type, by], k) => { const P_ = K.PIECES[type]; const hz = P_.kind === 'hazard', tl = P_.kind === 'tool'; return `<button type="button" class="pcard${hz ? ' haz' : ''}${tl ? ' tool' : ''}${by >= 0 ? ' taken' : ''}${by === me ? ' mine' : ''}" data-k="${k}"${by >= 0 ? ' disabled' : ''}><span class="kind">${hz ? 'past' : tl ? 'bomba' : 'plošina'}</span><img class="ic" src="${A.pieceIcon(type, 120)}" alt=""><b>${esc(P_.name)}</b><small>${esc(P_.desc)}</small>${by >= 0 && S && S.players[by] ? `<img class="by" src="${A.portraitURL(S.players[by].char, 48)}" alt="">` : ''}</button>`; }).join('');
}
$('cards').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b || b.disabled || !GS || phase() !== 'pick' || GS.offers.some((o) => o[1] === me)) return; audio(); sfx.pick(); sendMsg({ t: 'pick', k: +b.dataset.k }); });
const coarse = () => window.matchMedia && matchMedia('(pointer: coarse)').matches;
// ------------------------------------------------------------------ celá obrazovka + otočení na šířku (stejně jako v Tancích)
const rootEl = document.documentElement;
const fsOK = !!(rootEl.requestFullscreen || rootEl.webkitRequestFullscreen);
const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
let lockWhy = '';
async function lockLand(verbose) {   // zámek orientace jde jen v celé obrazovce; zkusí se víc způsobů, protože prohlížeče se liší
  if (!coarse()) return false;
  lockWhy = ''; const so = screen.orientation;
  for (const mode of ['landscape', 'landscape-primary']) { try { if (so && so.lock) { await so.lock(mode); return true; } } catch (e) { lockWhy = (e && e.name) || 'chyba'; } }
  try { const old = screen.lockOrientation || screen.mozLockOrientation || screen.msLockOrientation; if (old && old.call(screen, 'landscape')) return true; } catch (e) { /* nic */ }
  if (verbose && window.innerHeight > window.innerWidth) toast(so && so.lock ? `Telefon zámek na šířku nepovolil (${lockWhy || 'neznámý důvod'}). Zkus zapnout automatické otáčení a otočit ho.` : 'Tenhle prohlížeč neumí zamknout šířku, otoč telefon ručně.');
  return false;
}
function unlockLand() { try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* nic */ } }
async function enterFs() {
  try { if (rootEl.requestFullscreen) await rootEl.requestFullscreen({ navigationUI: 'hide' }); else if (rootEl.webkitRequestFullscreen) rootEl.webkitRequestFullscreen(); } catch (e) { /* prohlížeč nepustil */ }
  await lockLand(true);
}
function exitFs() { unlockLand(); try { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (e) { /* nic */ } }
function autoFs() { if (fsOK && coarse() && !isFs() && LS.get('hopik_fs') !== '0') enterFs(); }   // na dotykových zařízeních se při startu hry zkusí celá obrazovka + šířka (jde jen z klepnutí)
function toggleFs() { if (isFs()) { LS.set('hopik_fs', '0'); exitFs(); } else { LS.set('hopik_fs', '1'); enterFs(); } }
function syncFs() { const on = isFs(); if (on && coarse() && screen === 'game') lockLand(false); $('fsBtn').textContent = on ? '⤢' : '⛶'; $('fsBtn').setAttribute('aria-label', on ? 'Ukončit celou obrazovku' : 'Celá obrazovka'); $('pFs').innerHTML = `<b>Celá obrazovka: ${on ? 'zapnutá' : 'vypnutá'}</b>`; setTimeout(resize, 150); }
if (fsOK) { $('fsBtn').hidden = false; $('pFs').hidden = false; $('fsBtn').onclick = toggleFs; $('pFs').onclick = toggleFs; document.addEventListener('fullscreenchange', syncFs); document.addEventListener('webkitfullscreenchange', syncFs); syncFs(); }
$('rotateSkip').onclick = () => { $('rotate').classList.add('skip'); };
function renderHint() {
  const el = $('hint'); const ph = phase(); let txt = '';
  if (ph === 'place') { const g = GS; if (g.placed[me] || !g.piece[me]) txt = g.piece[me] ? 'Hotovo. Čekáme na ostatní…' : 'Tentokrát nemáš co pokládat.'; else if (K.isTool(g.piece[me])) txt = coarse() ? 'Bomba: přetáhni ji na kus, který chceš zničit (zčervená), a polož.' : 'Bomba: najeď na kus, který chceš zničit (zčervená), a polož kliknutím. Kruh ukazuje dosah.';
    else txt = coarse() ? 'Přetáhni kus prstem, otoč ho a polož.' : 'Kus se hýbe myší. Otočíš ho R nebo pravým tlačítkem, položíš kliknutím.'; }
  else if (ph === 'run') txt = run.dead ? 'Vypadl jsi. Sleduj ostatní.' : run.fin ? 'V cíli! Čekáme na ostatní.' : '';
  else if (ph === 'reveal') txt = 'Kusy se odhalují…';
  $('game').classList.toggle('pk', ph === 'pick'); $('game').classList.toggle('pl', ph === 'place');
  const sig = txt + '|' + ph; if (sig === hintSig) return; hintSig = sig; el.textContent = txt; el.hidden = !txt;
  const placing = ph === 'place' && GS && !GS.placed[me] && !!GS.piece[me];
  $('ppad').hidden = !placing; $('tpad').hidden = placing; $('tbJ').hidden = placing;
}

// ------------------------------------------------------------------ výsledky kola a zápasu
function rowHtml(i, extra) { const p = S.players[i]; return `<div class="orow${extra.win ? ' win' : ''}" style="--c:${A.SEAT[i]}"><img src="${A.portraitURL(p.char, 56, extra.win ? 'win' : '', p.cs)}" alt=""><div class="nm">${esc(p.name)}${i === me ? ' (ty)' : ''}<small>${extra.sub}</small>${extra.coins ? `<span class="cg">${coinI}+${extra.coins}</span>` : ''}${extra.bar !== undefined ? `<div class="bar"><i style="width:${clamp(extra.bar, 0, 100)}%"></i></div>` : ''}</div><span class="tot">${extra.tot}</span></div>`; }
function showScore() {
  const g = GS; if (!g || !g.res || !S) return; const r = g.res;
  $('sTitle').textContent = `Kolo ${r.n}`;
  $('sNote').textContent = r.all ? 'Doběhli všichni, trať byla moc snadná. Za doběh se body nedávají.' : r.none ? 'Nikdo nedoběhl. Příště to zkus víc podrazit, ale ne zas tolik.' : '';
  const order = r.rows.map((x, i) => i).sort((a, b) => r.rows[b].total - r.rows[a].total || g.pts[b] - g.pts[a]);
  $('sTable').innerHTML = order.map((i) => { const x = r.rows[i]; const parts = []; if (x.finish) parts.push('doběh +' + x.finish); if (x.first) parts.push('první +' + x.first); if (x.solo) parts.push('jediný +' + x.solo); if (x.kills) parts.push('pasti +' + x.kills); return rowHtml(i, { sub: `${x.fin ? 'v cíli' : 'nedoběhl'}${parts.length ? ' · ' + parts.join(', ') : ''} · celkem ${g.pts[i]} z ${K.WIN_POINTS}`, tot: '+' + x.total, bar: (g.pts[i] / K.WIN_POINTS) * 100, win: x.total > 0 && x.total === Math.max(...r.rows.map((y) => y.total)) }); }).join('');
  $('sNext').textContent = g.over ? 'Zápas končí…' : 'Další kolo se chystá…';
  $('score').hidden = false; const mine = r.rows[me]; if (mine && mine.total > 0) sfx.win(); else if (mine && !mine.fin) sfx.lose();
}
function showOver() { $('score').hidden = true; renderOver(); $('over').hidden = false; if (S && S.result) { if (S.result.winner === me) sfx.win(); else sfx.lose(); } refreshProfile(); }
function renderOver() {
  const s = S; if (!s || !s.result) return; const r = s.result; const won = r.winner === me; const w = r.winner >= 0 ? s.players[r.winner] : null;
  const t = $('oTitle'); t.textContent = won ? 'VÝHRA' : r.winner < 0 ? 'REMÍZA' : 'PROHRA'; t.className = 'otitle' + (won ? '' : r.winner < 0 ? ' draw' : ' lose');
  $('oReason').textContent = w ? `${won ? 'Vyhrál jsi' : 'Zápas vyhrál ' + w.name} po ${r.rounds}. kole.` : `Po ${r.rounds} kolech nikdo nevyhrál.`;
  const order = s.players.map((p, i) => i).sort((x, y) => r.pts[y] - r.pts[x]);
  $('oTable').innerHTML = order.map((i) => rowHtml(i, { sub: `doběhů: ${r.fins[i]}`, tot: r.pts[i], win: i === r.winner, coins: r.coins && r.coins[i] ? r.coins[i].gain : 0 })).join('');
  const again = $('oAgain'); const rm = s.rematch || []; const mine = !!rm[me]; const humansIn = s.players.filter((p) => !p.bot && !p.left).length; const ready = s.players.filter((p, i) => !p.bot && !p.left && rm[i]).length;
  $('oAgainTxt').textContent = s.solo ? 'Hrát znovu' : mine ? `Čekám na ostatní (${ready}/${humansIn})` : 'Odveta'; again.disabled = !s.solo && mine;
  $('oHint').textContent = s.solo ? '' : humansIn <= 1 ? 'Ostatní hráči odešli.' : '';
  if (humansIn <= 1 && !s.solo) { again.disabled = true; $('oAgainTxt').textContent = 'Odveta není možná'; }
}
$('oAgain').onclick = () => { audio(); sendMsg({ t: 'rematch' }); };
$('oMenu').onclick = () => leaveGame();

// ------------------------------------------------------------------ ovládání
const keys = new Set(); const touch = { L: false, R: false, J: false };
const KEYMAP = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'J', KeyW: 'J', Space: 'J' };
const mask = () => ((keys.has('L') || touch.L ? P.IN.L : 0) | (keys.has('R') || touch.R ? P.IN.R : 0) | (keys.has('J') || touch.J ? P.IN.J : 0));
const placing = () => screen === 'game' && phase() === 'place' && GS && !GS.placed[me] && !!GS.piece[me];
function pieceBox() { const t = GS.piece[me]; return K.pieceSize(t, pl.r); }
function clampPl() { const [w, h] = pieceBox(); pl.x = clamp(pl.x, 0, COLS - w); pl.y = clamp(pl.y, 0, ROWS - h); }
function validPl() { if (!placing() || !W) return false; return P.canPlace(W, GS.piece[me], pl.r, pl.x, pl.y); }
const bombHits = () => (placing() && W && K.isTool(GS.piece[me]) ? K.bombTargets(W.pieces, GS.piece[me], pl.x, pl.y) : []);
function rotate() { if (!placing() || !K.rotatable(GS.piece[me])) return; const [w0, h0] = pieceBox(); pl.r = (pl.r + 1) % 4; const [w1, h1] = pieceBox(); pl.x += Math.round((w0 - w1) / 2); pl.y += Math.round((h0 - h1) / 2); clampPl(); sfx.click(); syncGhost(); }
function putPiece() {
  if (!placing() || pl.sent) return; if (!validPl()) { sfx.err(); shake = 0.2; toast('Sem se kus položit nedá.'); return; }
  pl.sent = true; sendMsg({ t: 'place', x: pl.x, y: pl.y, r: pl.r }); sfx.place();
}
function syncGhost(force) {
  const now = performance.now(); const sig = pl.x + ',' + pl.y + ',' + pl.r; if (sig === pl.sig && !force) return; if (now - pl.last < 90 && !force) return; pl.sig = sig; pl.last = now; sendMsg({ t: 'ghost', x: pl.x, y: pl.y, r: pl.r });
}
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return; if (screen !== 'game') return;
  if (placing()) {
    const mv = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] }[e.code];
    if (mv) { e.preventDefault(); pl.x += mv[0]; pl.y += mv[1]; pl.moved = true; clampPl(); syncGhost(); return; }
    if (e.code === 'KeyR' || e.code === 'KeyQ') { e.preventDefault(); if (!e.repeat) rotate(); return; }
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) putPiece(); return; }
  }
  const k = KEYMAP[e.code]; if (k) { e.preventDefault(); keys.add(k); }
});
window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
window.addEventListener('blur', () => { keys.clear(); touch.L = touch.R = touch.J = false; });
// doleva/doprava: prst jde plynule přejet z jednoho tlačítka na druhé bez zvednutí
{
  const pad = $('tpad'), bl = $('tbL'), br = $('tbR'), act = new Map();
  const apply = () => { const ds = [...act.values()]; touch.L = ds.includes('L'); touch.R = ds.includes('R'); bl.classList.toggle('down', touch.L); br.classList.toggle('down', touch.R); };
  const dirAt = (e) => { const a = bl.getBoundingClientRect(), b = br.getBoundingClientRect(); return e.clientX < (a.right + b.left) / 2 ? 'L' : 'R'; };
  pad.addEventListener('pointerdown', (e) => { if (!e.target.closest('.tb')) return; e.preventDefault(); audio(); act.set(e.pointerId, dirAt(e)); apply(); try { pad.setPointerCapture(e.pointerId); } catch (x) { /* nic */ } });
  pad.addEventListener('pointermove', (e) => { if (!act.has(e.pointerId)) return; const d = dirAt(e); if (act.get(e.pointerId) !== d) { act.set(e.pointerId, d); apply(); } });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, (e) => { if (act.delete(e.pointerId)) apply(); });
  window.addEventListener('blur', () => { act.clear(); apply(); });
}
for (const [id, k] of [['tbJ', 'J']]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); audio(); touch[k] = true; b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch (x) { /* nic */ } });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { touch[k] = false; b.classList.remove('down'); });
}
$('pbRot').onclick = () => rotate(); $('pbPut').onclick = () => putPiece();
// myš a dotyk na hřišti: pokládání kusu
const cv = $('cv'); const g = cv.getContext('2d'); let ts = 20, cw = 0, ch = 0, dpr = 1;
function toTile(e) { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * COLS, ((e.clientY - r.top) / r.height) * ROWS]; }
function aim(e) {
  if (!placing()) return; let [fx2, fy2] = toTile(e); if (e.pointerType === 'touch') fy2 -= 1.8;   // prst kus nezakrývá
  const [w, h] = pieceBox(); pl.x = Math.round(fx2 - w / 2); pl.y = Math.round(fy2 - h / 2); pl.moved = true; clampPl(); syncGhost();
}
cv.addEventListener('pointermove', aim);
cv.addEventListener('pointerdown', (e) => { audio(); if (!placing()) return; aim(e); if (e.pointerType !== 'touch' && e.button === 0) putPiece(); });
cv.addEventListener('contextmenu', (e) => { e.preventDefault(); if (placing()) rotate(); });
cv.addEventListener('wheel', (e) => { if (placing()) { e.preventDefault(); rotate(); } }, { passive: false });

// ------------------------------------------------------------------ místní fyzika vlastní postavy
function sendRep(b) { sendMsg({ t: 'rep', x: +b.x.toFixed(3), y: +b.y.toFixed(3), vx: +b.vx.toFixed(2), vy: +b.vy.toFixed(2), face: b.face, gr: b.gr ? 1 : 0, wall: b.wall, k: nowTick() }); }
function die(cause) {
  if (run.dead || run.fin) return; run.dead = true; run.dfx = true; const b = run.body; sendMsg({ t: 'die', c: cause }); deathFx(me, b.x, b.y, cause); chipSig = ''; renderChips(); renderHint();
}
function localTick() {
  const b = run.body; if (!b || !W) return; const tk = nowTick(); run.lastTk = tk; P.stepWorld(W, tk); run.prev = { x: b.x, y: b.y };
  const f = []; P.stepBody(W, b, mask(), tk, f);
  for (const e of f) { if (e === 'j') { sfx.jump(); dust(b.x, b.y + 0.45, 3); } else if (e === 'w') { sfx.jump(); dust(b.x - b.face * 0.3, b.y, 3); } else if (e === 'b') { sfx.bounce(); } else if (e === 'l') { sfx.land(); dust(b.x, b.y + 0.45, 4); } }
  if (b.crush) return die(0);
  const hz = P.hazardAt(W, b.x, b.y, tk, 0.08); if (hz) return die(hz);
  if (P.inGoal(W, b)) { run.fin = true; if (run.firstFin < 0) run.firstFin = tk; sendRep(b); chipSig = ''; renderChips(); renderHint(); return; }
  if ((run.nrep++ & 1) === 0) sendRep(b);
}
function dust(x, y, n) { for (let k = 0; k < n; k++) fx.push({ k: 'dot', x: x + (Math.random() - 0.5) * 0.5, y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 1.5, g: 4, life: 0.35, t: 0, c: 'rgba(120,100,70,.55)', s: 0.14 }); }
let lastNow = 0;
function stepLocal(dt) {
  if (phase() !== 'run' || !run.go || run.dead || run.fin || !run.body) return;
  run.acc += dt; let n = 0; while (run.acc >= 1 / TPS && n++ < 4) { run.acc -= 1 / TPS; localTick(); if (run.dead || run.fin) break; } if (run.acc > 0.2) run.acc = 0;
}

// ------------------------------------------------------------------ kreslení
let bgCache = null, bgSig = '';
function resize() {
  const f = $('gField'); if (!f) return; const aw = f.clientWidth - 8, ah = f.clientHeight - 8; if (aw < 50 || ah < 50) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2.5); ts = Math.max(8, Math.min(aw / COLS, ah / ROWS)); cw = Math.floor(COLS * ts); ch = Math.floor(ROWS * ts);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); bgSig = '';
}
if (window.ResizeObserver) new ResizeObserver(() => { if (screen === 'game') resize(); }).observe($('gField'));
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));
function ensureBg(stage) {
  const sig = stage + ':' + cv.width; if (sig === bgSig && bgCache) return; bgSig = sig;
  bgCache = document.createElement('canvas'); bgCache.width = cv.width; bgCache.height = cv.height; const b = bgCache.getContext('2d'); const s = cv.width / COLS; b.setTransform(s, 0, 0, s, 0, 0); b.lineJoin = 'round';
  const S_ = STAGES[stage]; A.drawBackground(b, S_.theme, 0); A.drawTerrain(b, S_);
}
function interp(i, now) {
  const rt = now - DELAY; const s = run.snaps; if (!s.length) return null; let a = null, c = null;
  for (let k = s.length - 1; k >= 0; k--) { if (s[k].at <= rt) { a = s[k]; c = s[k + 1] || null; break; } }
  if (!a) a = s[0]; if (!c) return a.p[i]; const u = clamp((rt - a.at) / Math.max(1, c.at - a.at), 0, 1); const p = a.p[i], q = c.p[i]; if (!p || !q) return p || q;
  return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, q[2], q[3], q[4], q[5]];
}
function drawWorld(now, t) {
  const stage = GS.stage; const S_ = STAGES[stage]; ensureBg(stage); const ph = phase();
  // čas pro kreslení pastí: zlomkový tik (plynulé plošiny a kulky); při vlastním běhu přesně ve stejném čase jako interpolovaná postava
  const mine = ph === 'run' && run.go && run.body && !run.dead && !run.fin && run.lastTk !== undefined; const tk = ph === 'run' || ph === 'count' ? (mine ? run.lastTk - 1 + clamp(run.acc * TPS, 0, 1) : nowTickF()) : 0;
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(bgCache, 0, 0);
  const s = cv.width / COLS; const sh = shake > 0 ? (Math.random() - 0.5) * shake * 0.5 : 0; g.setTransform(s, 0, 0, s, sh * s, (shake > 0 ? (Math.random() - 0.5) * shake * 0.5 : 0) * s); g.lineJoin = 'round'; g.lineCap = 'round';
  // zakázané oblasti při pokládání
  if (ph === 'place' || ph === 'pick') { g.save(); for (const [x, y, w2, h2] of S_.forbid) { g.fillStyle = 'rgba(255,90,79,.16)'; g.fillRect(x, y, w2, h2); g.strokeStyle = 'rgba(200,40,30,.55)'; g.lineWidth = 0.06; g.setLineDash([0.25, 0.2]); g.strokeRect(x + 0.03, y + 0.03, w2 - 0.06, h2 - 0.06); } g.restore(); }
  // cíl a start
  const [gx, gy, gw, gh] = S_.goal; g.save(); g.fillStyle = 'rgba(70,196,106,.18)'; g.fillRect(gx, gy, gw, gh); g.strokeStyle = 'rgba(40,150,70,.7)'; g.lineWidth = 0.07; g.setLineDash([0.3, 0.2]); g.strokeRect(gx + 0.04, gy + 0.04, gw - 0.08, gh - 0.08); g.restore();
  A.startSign(g, S_.spawn[0] - 1.4, S_.spawn[1]); A.flagShape(g, S_.flag[0], S_.flag[1], t);
  // kusy
  for (const pc of W.pieces) {
    const own = seatColor(pc.owner); const o = { own, t }; const age = (now - (born.get(pc.id) || 0)) / 1000;
    if (pc.type === 'crumble') { const gid = W.grp.get(pc.y * COLS + pc.x); if (gid !== undefined) { if (W.groups[gid].every((k) => W.gone[k])) continue; const t0 = W.crumbleAt.get(gid); if (t0 !== undefined) o.shake = Math.max(0.01, (tk - t0) / TPS); } }
    g.save(); if (age < 0.4) { const [w2, h2] = K.pieceSize(pc.type, pc.r); const u = age / 0.4, sc = u < 1 ? 1 + Math.sin(u * Math.PI) * 0.25 - (1 - u) * 0.6 : 1; g.translate(pc.x + w2 / 2, pc.y + h2 / 2); g.scale(sc, sc); g.translate(-(pc.x + w2 / 2), -(pc.y + h2 / 2)); }
    A.drawPieceShape(g, pc.type, pc.r, pc.x, pc.y, o); g.restore();
  }
  for (const m of W.movers) { const b = P.moverBox(m, tk); A.moverShape(g, b[0], b[1], seatColor(m.owner), t); }
  for (const c of W.cannons) { const bl = P.bulletsOf(c, tk); for (const [bx, by] of bl) A.bulletShape(g, bx, by, c.vx, c.vy, t); }
  for (const l of W.lasers) A.laserDyn(g, l, tk, t);
  for (const s2 of W.rsaws) A.rsawDyn(g, s2, tk, t, seatColor(s2.owner));
  for (const f2 of W.fans) A.fanDyn(g, f2, tk, t);
  for (const b2 of W.blades) A.bladeDyn(g, b2, tk, t, seatColor(b2.owner));
  for (const p2 of W.pends) A.pendDyn(g, p2, tk, t, seatColor(p2.owner));
  for (const h2 of W.thwomps) A.thwDyn(g, h2, tk, t, seatColor(h2.owner));
  for (const o2 of W.rspikes) A.retractDyn(g, o2, tk, t, seatColor(o2.owner));
  for (const o2 of W.icicles) A.icicleDyn(g, o2, tk, t, seatColor(o2.owner));
  for (const o2 of W.vanish) A.vanishDyn(g, o2, tk, t, seatColor(o2.owner));
  for (const o2 of W.boulders) A.boulderDyn(g, o2, tk, t, seatColor(o2.owner));
  for (const o2 of W.bumpers) A.bumperDyn(g, o2, tk, t, seatColor(o2.owner));
  for (const o2 of W.holes) A.holeDyn(g, o2, tk, t, seatColor(o2.owner));
  for (const f of W.flames) { const ph2 = (tk + f.phase) % K.FLAME_PERIOD; A.flameBurst(g, f, ph2 < K.FLAME_ON, ph2 > K.FLAME_PERIOD - 9, t); }
  // postavičky
  drawPlayers(now, t, tk);
  // duchové kusů při pokládání
  if (ph === 'place') {
    ghosts.forEach((gh, i) => { if (!gh || i === me || !GS.piece[i]) return; if (K.isTool(GS.piece[i])) blastPreview(GS.piece[i], gh[0], gh[1], [], t, 0.45); A.drawPieceShape(g, GS.piece[i], gh[2], gh[0], gh[1], { own: seatColor(i), alpha: 0.5, ghost: true, t }); const [w2] = K.pieceSize(GS.piece[i], gh[2]); label(S.players[i].name, gh[0] + w2 / 2, gh[1] - 0.25, seatColor(i)); });
    if (placing()) {
      const type = GS.piece[me]; const tool = K.isTool(type); const hits = tool ? bombHits() : []; const ok = tool ? true : validPl(); pl.ok = ok; const [w2, h2] = pieceBox();
      if (tool) blastPreview(type, pl.x, pl.y, hits, t, 1);
      else { g.save(); g.fillStyle = ok ? 'rgba(70,196,106,.22)' : 'rgba(255,90,79,.28)'; for (const [dx, dy] of K.pieceCells(type, pl.r)) g.fillRect(pl.x + dx, pl.y + dy, 1, 1); g.restore(); }
      A.drawPieceShape(g, type, pl.r, pl.x, pl.y, { own: seatColor(me), alpha: ok ? 0.85 : 0.5, ghost: true, t });
      g.save(); g.strokeStyle = tool ? (hits.length ? '#c8261c' : '#7b7f8c') : ok ? '#2b8f48' : '#c8261c'; g.lineWidth = 0.08; g.setLineDash([0.2, 0.15]); g.strokeRect(pl.x + 0.02, pl.y + 0.02, w2 - 0.04, h2 - 0.04); g.restore();
      label('Ty', pl.x + w2 / 2, pl.y - 0.25, seatColor(me));
    }
  }
  drawFx(now, t);
}
function label(text, x, y, col) { g.save(); g.font = '900 0.42px "Arial Rounded MT Bold", Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.lineWidth = 0.12; g.strokeStyle = A.INK; g.lineJoin = 'round'; g.strokeText(text, x, y); g.fillStyle = col || '#fff'; g.fillText(text, x, y); g.restore(); }
function drawPlayers(now, t, tk) {
  if (!S) return; const ph = phase(); const S_ = STAGES[GS.stage]; const order = S.players.map((p, i) => i).sort((a, b) => (a === me) - (b === me));
  for (const i of order) {
    const p = S.players[i]; if (p.left) continue; let st = null;
    if (ph === 'pick' || ph === 'place' || ph === 'reveal') st = { x: S_.spawn[0] - 0.4 + i * 0.3, y: S_.spawn[1] - P.PH / 2 - 0.02, face: 1, gr: true, vx: 0, vy: 0, wall: 0 };
    else if (i === me && run.body) {
      const b = run.body; const a = (ph === 'run' && run.go && !run.dead && !run.fin) ? clamp(run.acc * TPS, 0, 1) : 1; const px = run.prev ? run.prev.x + (b.x - run.prev.x) * a : b.x, py = run.prev ? run.prev.y + (b.y - run.prev.y) * a : b.y;
      if (run.dead) continue; st = { x: px, y: py, face: b.face, gr: b.gr, vx: b.vx, vy: b.vy, wall: b.wall, fin: run.fin };
    } else { const q = interp(i, now); if (!q) continue; if (!(q[4] & 1)) continue; st = { x: q[0], y: q[1], vx: q[2], vy: q[3], gr: !!(q[4] & 4), wall: q[4] & 8 ? 1 : q[4] & 16 ? -1 : 0, face: q[5], fin: !!(q[4] & 2) }; }
    if (!st) continue;
    if (i === me && ph === 'run' && run.dead) continue;
    A.drawAnimal(g, p.char, st.x, st.y, { face: st.face, t: t + i, gr: st.gr, vx: st.vx, vy: st.vy, wall: st.wall, dance: st.fin, cs: p.cs });
    if (ph !== 'pick' && ph !== 'place' && ph !== 'reveal') label(i === me ? 'Ty' : p.name, st.x, st.y - 0.85 - (i % 2) * 0.38, seatColor(i));
  }
}
/** Dosah bomby při míření: kruh, a kusy, které by zničila, zčervenají (alpha = průhlednost náhledu). */
function blastPreview(type, x, y, hits, t, alpha) {
  const B = K.PIECES[type]; g.save(); g.globalAlpha = alpha;
  g.beginPath(); g.arc(x + 0.5, y + 0.5, B.blast, 0, 6.283); g.fillStyle = 'rgba(255,120,40,.14)'; g.fill();
  g.strokeStyle = 'rgba(220,60,20,.8)'; g.lineWidth = 0.08; g.setLineDash([0.3, 0.2]); g.lineDashOffset = -t * 1.5; g.stroke(); g.setLineDash([]);
  const pul = 0.3 + 0.15 * Math.sin(t * 9); g.fillStyle = `rgba(255,50,30,${pul + 0.2})`;
  for (const p of hits) for (const [dx, dy] of K.pieceCells(p.type, p.r)) g.fillRect(p.x + dx, p.y + dy, 1, 1);
  g.restore();
}
/** Výbuch bomby: záblesk, rázová vlna do plného dosahu a trosky z kusů, které zmizely. */
function bombFx(e) {
  const [, , type, x, y, gone] = e; const B = K.PIECES[type]; if (!B) return; const big = type === 'megabomb'; const cx = x + 0.5, cy = y + 0.5;
  fx.push({ k: 'blast', x: cx, y: cy, R: B.blast, life: big ? 0.75 : 0.55, t: 0 });
  for (let k = 0; k < (big ? 46 : 22); k++) { const a = Math.random() * 6.283, v = (big ? 5 : 3) + Math.random() * (big ? 9 : 6); fx.push({ k: 'dot', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, g: 12, life: 0.5 + Math.random() * 0.6, t: 0, c: ['#ffd23a', '#ff8a2a', '#ff5a4f', '#3b4156'][k % 4], s: 0.1 + Math.random() * 0.16 }); }
  for (const [, ptype, r2, px, py, owner] of gone) { for (const [dx, dy] of K.pieceCells(ptype, r2)) for (let k = 0; k < 3; k++) fx.push({ k: 'dot', x: px + dx + 0.5, y: py + dy + 0.5, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 7, g: 22, life: 0.6 + Math.random() * 0.5, t: 0, c: k ? seatColor(owner) : '#8a8f9f', s: 0.1 + Math.random() * 0.1 }); }
  shake = Math.max(shake, big ? 0.55 : 0.3); sfx.bomb(big);
  const who = S && S.players[e[1]] ? S.players[e[1]].name : ''; fx.push({ k: 'txt', x: cx, y: cy - 0.9, text: gone.length ? (big ? 'BUM!' : 'Bum!') : 'Mimo!', c: gone.length ? '#ff5a4f' : '#7b7f8c', life: 1.2, t: 0 }); void who;
}
function drawFx(now, t) {
  const dt = Math.min(0.05, (now - lastNow) / 1000 || 0.016);
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt; const u = f.t / f.life; if (u >= 1) { fx.splice(i, 1); continue; }
    if (f.k === 'dot' || f.k === 'conf') { f.vy += f.g * dt; f.x += f.vx * dt; f.y += f.vy * dt; g.save(); g.globalAlpha = 1 - u * u; g.fillStyle = f.c; if (f.k === 'conf') { g.translate(f.x, f.y); g.rotate(f.r + f.t * 8); g.fillRect(-f.s / 2, -f.s / 3, f.s, f.s * 0.66); } else { g.beginPath(); g.arc(f.x, f.y, f.s, 0, 6.283); g.fill(); if (f.s > 0.15) { g.lineWidth = 0.04; g.strokeStyle = A.INK; g.stroke(); } } g.restore(); }
    else if (f.k === 'blast') { g.save(); const R = f.R * (1 - Math.pow(1 - Math.min(1, u * 1.6), 3)); const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(0.01, R)); gr.addColorStop(0, `rgba(255,250,210,${0.95 * (1 - u)})`); gr.addColorStop(0.5, `rgba(255,170,50,${0.6 * (1 - u)})`); gr.addColorStop(1, 'rgba(255,90,30,0)'); g.fillStyle = gr; g.beginPath(); g.arc(f.x, f.y, Math.max(0.01, R), 0, 6.283); g.fill(); g.globalAlpha = 1 - u; g.lineWidth = 0.16 * (1 - u) + 0.03; g.strokeStyle = '#fff3c4'; g.beginPath(); g.arc(f.x, f.y, Math.max(0.01, R), 0, 6.283); g.stroke(); g.restore(); }
    else if (f.k === 'ring') { g.save(); g.globalAlpha = 1 - u; g.lineWidth = 0.12 * (1 - u); g.strokeStyle = '#fff'; g.beginPath(); g.arc(f.x, f.y, 0.3 + u * 1.6, 0, 6.283); g.stroke(); g.restore(); }
    else if (f.k === 'ghost') { A.drawAnimal(g, f.ch, f.x, f.y - u * 2.4, { face: 1, t, gr: false, alpha: (1 - u) * 0.45, sc: 1 + u * 0.2 }); }
    else if (f.k === 'txt') { g.save(); g.globalAlpha = 1 - u * u; label(f.text, f.x, f.y - u * 1.2, f.c); g.restore(); }
  }
  if (shake > 0) shake = Math.max(0, shake - dt);
}
function drawOverlayCount() {
  if (phase() !== 'count') return; const left = secsLeft(); const n = Math.max(1, Math.ceil(left)); if (n !== lastBeep) { lastBeep = n; sfx.tick(); banner(String(n), 900); }
}
function frame(now) {
  requestAnimationFrame(frame);
  if (now - (frame.mu || 0) > 250) { frame.mu = now; syncMusic(); }
  if (screen !== 'game' || !cw || !GS || !W) { lastNow = now; return; }
  const dt = Math.min(0.1, (now - lastNow) / 1000 || 0.016);
  stepLocal(dt); drawWorld(now, now / 1000); drawOverlayCount();
  // časomíra
  const left = secsLeft(); const showT = phase() === 'pick' || phase() === 'place' || phase() === 'run'; const tb = $('gTimer');
  tb.textContent = showT ? String(Math.max(0, Math.ceil(left))) : '·'; tb.parentElement.classList.toggle('low', showT && left <= 5 && left > 0);
  $('gRound').textContent = `Kolo ${GS.round}${GS.bonus ? (GS.sub === 1 ? ' · bonus' : ' · bonus 2×') : ''}`;
  if (phase() === 'place') { if (placing()) { const ok = validPl(); if (ok !== pl.ok) { pl.ok = ok; } } renderHint(); }
  if (now - (frame.last || 0) > 400) { frame.last = now; renderChips(); }
  lastNow = now;
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ start
startScene($('mscene')); renderChars();
(async () => {
  await refreshProfile();
  const q = new URLSearchParams(location.search).get('k');
  let rs = null; try { rs = JSON.parse(LS.get('hopik_resume')); } catch (e) { /* nic */ }
  if (q && /^[A-Za-z]{4}$/.test(q)) { $('code').value = q.toUpperCase(); setTimeout(() => startGame({ t: 'join', code: q.toUpperCase() }), 500); }
  else if (rs && rs.code && rs.token && Date.now() - rs.at < 30 * 60 * 1000) { session = { code: rs.code, token: rs.token }; setStatus('Obnovuji rozehranou hru…'); connect(); }
})();
window.__hopik = { get S() { return S; }, get GS() { return GS; }, get W() { return W; }, get run() { return run; }, get pl() { return pl; }, onMsg, show, K, P, mask, sendMsg };
