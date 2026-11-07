// ARÉNA VĚŽÍ – klient: menu, balíček, canvas arény (řeka, most, věže, jednotky), karty a elixír, boti i online.
// Simulaci počítá server, klient dostává snímky (10×/s, souřadnice už z tvého pohledu: ty jsi dole) a plynule je dopočítává.
import * as C from './cards.js?v=1';
import { drawChar, iconImg, iconCanvas, flame, crown } from './art.js?v=3';
import { startScene, stopScene } from './scene.js?v=3';
const { CARDS, W, H, RIVER, BRIDGE, TOWER } = C;

const CFG = window.ARENA_CONFIG || {};
const $ = (id) => document.getElementById(id);
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nic */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* nic */ } } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const API = String(CFG.SERVER_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/arena\/?$/, '');
const BOT_LEVELS = [[1, 'Nováček', 'Hraje nahodile, pomalu a bez kouzel.'], [2, 'Pěšák', 'Už se brání a používá kouzla.'], [3, 'Velitel', 'Chytře vybírá obránce a skládá útoky.'], [4, 'Maršál', 'Rychlý a zkušený, silné karty.']];
const REASON = { main: 'Hlavní věž padla.', time: 'Čas vypršel, rozhodla zničená věž.', ot: 'V prodloužení padla první věž.', hp: 'Rozhodl zbývající stav věží.', surrender: 'Soupeř se vzdal.', drop: 'Soupeř se odpojil.' };

// ------------------------------------------------------------------ malé SVG ikony (místo emoji)
const SVG_CROWN = '<svg class="svgi" viewBox="0 0 24 18" aria-label="koruna"><path d="M2 15 1 4l6 5 5-8 5 8 5-5-1 11z" fill="#ffd24a" stroke="#2a1f3a" stroke-width="1.6" stroke-linejoin="round"/><rect x="2" y="14" width="20" height="3.4" rx="1.4" fill="#e0a91c" stroke="#2a1f3a" stroke-width="1.3"/></svg>';
const svgSpeaker = (off) => `<svg class="svgi" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5h4l5-4v13l-5-4H3z" fill="currentColor"/>${off ? '<path d="M15.5 9l6 6m0-6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' : '<path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'}</svg>`;
const DROP = '<i class="drop"></i>';

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
const myName = () => { const el = $('name'); const v = el && !el.closest('[hidden]') ? el.value.trim() : ''; return v || (prof && prof.name) || LS.get('arena_name') || undefined; };

let prof = null;
async function call(action, body) {
  const r = await fetch(API + '/api/arena/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ident(), ...body }), signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Chyba ' + r.status); return j;
}

// ------------------------------------------------------------------ zvuk (syntetický)
let ac = null, noiseBuf = null, muted = LS.get('arena_mute') === '1';
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
  click() { tone(520, .06, 'triangle', .05); },
  deploy() { tone(260, .12, 'triangle', .07, 120); tone(520, .08, 'sine', .05, 0, .06); },
  hit() { noise(.06, .06, 1800, 500); },
  shoot() { tone(780, .07, 'square', .025, -300); },
  die() { noise(.18, .1, 900, 150); },
  boom() { noise(.55, .32, 1500, 80); tone(90, .45, 'sine', .2, -50); },
  tower() { noise(1.1, .4, 1200, 50); tone(70, .9, 'sine', .25, -40); },
  heal() { [523, 659, 784].forEach((f, i) => tone(f, .12, 'sine', .05, 0, i * .07)); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .2, 'triangle', .09, 0, i * .12)); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, .28, 'sawtooth', .06, 0, i * .18)); },
  err() { tone(160, .14, 'square', .05); },
};
function syncMute() { $('muteBtn').innerHTML = svgSpeaker(muted); $('pMute').innerHTML = `<b>Zvuk: ${muted ? 'vypnutý' : 'zapnutý'}</b>`; }
const toggleMute = () => { muted = !muted; LS.set('arena_mute', muted ? '1' : '0'); syncMute(); if (!muted) sfx.click(); };
$('muteBtn').onclick = toggleMute; $('pMute').onclick = toggleMute; syncMute();

// ------------------------------------------------------------------ obrazovky a okna
let screen = 'menu';
function show(name) { screen = name; for (const id of ['menu', 'lobby', 'game']) $(id).hidden = id !== name; if (name === 'game') { resize(); } if (name === 'menu') startScene($('mscene')); else stopScene(); }
let toastT = null;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600); }
function setStatus(msg, err) { const el = $('menuStatus'); el.textContent = msg || ''; el.classList.toggle('err', !!err); }
const openModal = (id) => { $(id).hidden = false; };
document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { const m = e.target.closest('.modal'); if (m) m.hidden = true; } else if (e.target.classList && e.target.classList.contains('modal')) e.target.hidden = true; });

// ------------------------------------------------------------------ profil, menu, balíček
async function refreshProfile() { try { prof = await call('me', {}); } catch (e) { prof = null; } renderProfile(); }
function renderProfile() {
  const ok = !!(prof && prof.account);
  $('coinChip').hidden = !ok; $('prof').hidden = !ok; $('nameField').hidden = ok && prof.linked;
  if (!ok) return;
  const t = prof.arena;
  $('coinNum').textContent = prof.coins.toLocaleString('cs-CZ');
  $('pLvl').textContent = t.lvl; $('pName').textContent = prof.name || 'Hráč';
  $('pXp').style.width = (t.next ? clamp((t.xp - t.from) / (t.next - t.from), 0, 1) * 100 : 100) + '%';
  $('pXpTxt').textContent = t.next ? `${t.xp - t.from} / ${t.next - t.from} XP` : 'maximum';
  $('pRec').textContent = `${t.wins} výher · ${prof.streak ? 'série ' + prof.streak : '0 v řadě'}`;
  if (!$('deckModal').hidden) renderDeck();
}
function botMenu() {
  const rw = (prof && prof.rewards) || { botWin: { 1: 50, 2: 80, 3: 110, 4: 150 }, botLose: { 1: 15, 2: 20, 3: 25, 4: 30 } };
  $('botLevels').innerHTML = BOT_LEVELS.map(([n, nm, ds]) => `<button class="lv" type="button" data-lv="${n}"><span><b>${nm}</b><small>${ds}</small></span><span class="rw"><span class="coin"></span> +${rw.botWin[n]}<small>prohra +${rw.botLose[n]}</small></span></button>`).join('');
}
$('bBot').onclick = () => { audio(); botMenu(); openModal('botModal'); };
$('botLevels').addEventListener('click', (e) => { const b = e.target.closest('[data-lv]'); if (!b) return; $('botModal').hidden = true; startGame({ t: 'bot', level: +b.dataset.lv }); });
$('bQuick').onclick = () => { audio(); startGame({ t: 'quick' }); };
$('bCreate').onclick = () => { audio(); startGame({ t: 'create' }); };
$('joinForm').onsubmit = (e) => { e.preventDefault(); audio(); const c = $('code').value.trim().toUpperCase(); if (c.length !== 4) return setStatus('Kód má 4 písmena.', true); startGame({ t: 'join', code: c }); };
$('code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
$('name').addEventListener('change', () => LS.set('arena_name', $('name').value.trim()));
$('bHow').onclick = () => { renderHow(); openModal('howModal'); };

function statLine(c, lv = 1) {
  const m = C.lvMul(lv);
  if (c.kind === 'spell') return `Poškození ${Math.round(c.dmg * m)} v okruhu ${c.splash}, věže ${Math.round(c.towerMul * 100)} %`;
  const n = c.n > 1 ? `${c.n}× ` : '';
  const dmg = c.kind === 'healer' ? `léčí ${Math.round(c.heal * m)}` : `útok ${Math.round(c.dmg * m)}`;
  const tt = c.tt === 'building' ? 'jen věže' : c.tt === 'all' ? 'zem i vzduch' : 'jen zem';
  return `${n}${Math.round(c.hp * m)} životů, ${dmg}, ${tt}${c.fly ? ', létá' : ''}`;
}
function renderHow() {
  $('howCards').innerHTML = C.CARD_ORDER.map((id) => { const c = CARDS[id]; return `<div class="ci" style="grid-template-columns:56px 1fr"><div class="ic" style="width:52px;height:62px;cursor:default">${iconImg(id)}</div><div><div class="nm">${esc(c.name)} <em>${DROP}${c.cost}</em></div><div class="ds">${esc(c.desc)}</div><div class="st">${esc(statLine(c))}${c.lvl > 1 ? ` · od úrovně ${c.lvl}` : ''}</div></div></div>`; }).join('');
}

let draft = [];   // rozpracovaný balíček (ids)
$('bDeck').onclick = async () => { audio(); if (!prof) await refreshProfile(); if (!prof || !prof.account) return setStatus('Pro balíček se musíš přihlásit (účet se vytvoří při otevření portálu).', true); draft = [...prof.arena.deck]; renderDeck(); openModal('deckModal'); };
function renderDeck() {
  if (!prof || !prof.account) return;
  const t = prof.arena; const lv = t.lvl;
  $('deckCoins').textContent = prof.coins.toLocaleString('cs-CZ');
  $('deckLvl').innerHTML = `<div class="plvl">${t.lvl}</div><div class="pinfo"><div class="pname">Úroveň ${t.lvl}</div><div class="xpbar"><i style="width:${t.next ? clamp((t.xp - t.from) / (t.next - t.from), 0, 1) * 100 : 100}%"></i></div><div class="psub"><span>${t.next ? `${t.xp - t.from} / ${t.next - t.from} XP` : 'maximum'}</span><span>${t.wins} výher</span></div></div>`;
  $('deckCount').textContent = `(${draft.length}/${C.DECK_SIZE})`;
  $('deckSlots').innerHTML = Array.from({ length: C.DECK_SIZE }, (_, i) => { const id = draft[i]; return id ? `<button type="button" data-rm="${id}" title="${esc(CARDS[id].name)}">${iconImg(id)}<small>${CARDS[id].cost}</small></button>` : `<button type="button" class="empty" disabled>+</button>`; }).join('');
  const saved = JSON.stringify(draft) === JSON.stringify(t.deck);
  $('deckSave').disabled = draft.length !== C.DECK_SIZE || saved; $('deckSave').querySelector('b').textContent = saved ? 'Balíček uložen' : draft.length === C.DECK_SIZE ? 'Uložit balíček' : `Vyber ještě ${C.DECK_SIZE - draft.length}`;
  $('deckList').innerHTML = C.CARD_ORDER.map((id) => {
    const c = CARDS[id]; const lock = lv < c.lvl; const cl = t.lv[id] || 1; const inD = draft.includes(id); const max = cl >= C.MAX_CARD_LEVEL; const price = max ? 0 : C.upgradeCost(id, cl);
    const pips = Array.from({ length: C.MAX_CARD_LEVEL }, (_, k) => `<i class="${k < cl ? 'on' : ''}"></i>`).join('');
    const acts = lock ? `<button type="button" disabled>Úroveň ${c.lvl}</button>` : `<button type="button" class="alt" data-tg="${id}">${inD ? 'Vyndat' : 'Přidat'}</button><button type="button" data-up="${id}" ${max || prof.coins < price ? 'disabled' : ''}>${max ? 'Maximum' : `Vylepšit <span class="coin"></span> ${price}`}</button>`;
    return `<div class="ci${inD ? ' in' : ''}${lock ? ' lock' : ''}"><div class="ic" ${lock ? '' : `data-tg="${id}"`}>${iconImg(id)}<span class="cost" style="left:-6px;top:-8px;width:22px;height:26px;font-size:12px">${c.cost}</span></div><div><div class="nm">${esc(c.name)}<em>úr. ${cl}/${C.MAX_CARD_LEVEL}</em></div><div class="pips">${pips}</div><div class="ds">${esc(c.desc)}</div><div class="st">${esc(statLine(c, cl))}</div></div><div class="acts">${acts}</div></div>`;
  }).join('');
}
$('deckSlots').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; draft = draft.filter((x) => x !== b.dataset.rm); sfx.click(); renderDeck(); });
$('deckList').addEventListener('click', async (e) => {
  const tg = e.target.closest('[data-tg]'); const up = e.target.closest('[data-up]');
  if (tg) { const id = tg.dataset.tg; if (draft.includes(id)) draft = draft.filter((x) => x !== id); else if (draft.length < C.DECK_SIZE) draft.push(id); else toast(`Balíček je plný (${C.DECK_SIZE}), nejdřív některou kartu vyndej.`); sfx.click(); renderDeck(); return; }
  if (up && !up.disabled) { up.disabled = true; try { prof = await call('upgrade', { id: up.dataset.up }); renderProfile(); renderDeck(); sfx.heal(); } catch (err) { toast(err.message); renderDeck(); } }
});
$('deckSave').onclick = async () => { try { prof = await call('deck', { deck: draft }); draft = [...prof.arena.deck]; renderProfile(); renderDeck(); sfx.heal(); toast('Balíček uložen.'); } catch (err) { toast(err.message); } };

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
function startGame(req) {
  setStatus(''); LS.set('arena_name', ($('name').value || '').trim());
  session = null; LS.del('arena_resume'); S = null; cur = null; snaps = []; outbox = []; retry = 0;
  if (!(ws && ws.readyState === 1)) setStatus('Připojuji…');
  sendMsg(req);
}
function backToMenu(msg) {
  wantOpen = false; session = null; LS.del('arena_resume'); outbox = []; clearTimeout(connTimer);
  if (ws) { try { ws.onclose = null; ws.close(); } catch (e) { /* nic */ } ws = null; }
  S = null; cur = null; snaps = []; $('conn').hidden = true; $('over').hidden = true; $('pauseModal').hidden = true; clearTimeout(overTimer); overTimer = null;
  show('menu'); setStatus(msg || '', !!msg); refreshProfile();
}
function leaveGame() { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ t: 'leave' })); } catch (e) { /* nic */ } } backToMenu(); }

// ------------------------------------------------------------------ stav hry
let S = null;               // poslední zpráva `state` (místnost, hráči, výsledek)
let me = 0;
let snaps = [];             // poslední snímky { at, u: Map, tw: Map, ... } pro plynulé dopočítání
let cur = null;             // nejnovější snímek (karty, elixír, čas)
let overTimer = null, lastTm = -1, shownOt = false, shownDbl = false;
const evq = [];             // události čekající na přehrání (zpožděné kvůli plynulosti)
const fx = [];              // efekty (prach, výbuchy, střely, ...)
let shake = 0;
const flash = new Map();    // id → čas do konce záblesku zásahu
const lunge = new Map();    // id → čas do konce výpadu
const dead = [];            // mrtvé jednotky doznívající na plátně

function onMsg(m) {
  switch (m.t) {
    case 'joined': session = { code: m.code, token: m.token }; LS.set('arena_resume', JSON.stringify({ ...session, at: Date.now() })); setStatus(''); return;
    case 'state': return onState(m);
    case 'snap': return onSnap(m);
    case 'ok': return;
    case 'rej': sfx.err(); toast(m.msg); pending = false; return;
    case 'err': toast(m.msg); if (m.fatal) { if (m.gone) backToMenu('Zápas už neexistuje.'); else if (screen === 'menu') setStatus(m.msg, true); else backToMenu(m.msg); } return;
    default:
  }
}
function onState(s) {
  const prev = S; S = s; me = s.you; $('conn').hidden = true;
  if (s.phase === 'lobby') {
    if (screen !== 'lobby') show('lobby');
    $('roomCode').textContent = s.code; $('copyLink').hidden = !!s.quick;
    $('lobbyHint').textContent = s.quick ? 'Hledám soupeře pro rychlou hru…' : 'Pošli kód kamarádovi nebo mu pošli odkaz.';
    return;
  }
  if (screen !== 'game') show('game');
  const fresh = !prev || prev.phase === 'lobby' || prev.matchId !== s.matchId || (prev.phase === 'over' && s.phase !== 'over');
  if (fresh) resetMatch();
  $('gEnemy').textContent = s.players[1 - me] ? `${s.players[1 - me].name} · ${s.players[1 - me].lvl}. úr.` : 'Soupeř';
  if (s.phase === 'over' && s.result) { if (!overTimer) overTimer = setTimeout(() => { overTimer = null; showOver(); }, 1100); } else { $('over').hidden = true; clearTimeout(overTimer); overTimer = null; }
}
function resetMatch() {
  snaps = []; cur = null; fx.length = 0; evq.length = 0; dead.length = 0; flash.clear(); lunge.clear(); sel = -1; pending = false; lastTm = -1; shownOt = false; shownDbl = false;
  $('over').hidden = true; $('hand').dataset.sig = ''; $('banner').hidden = true;
}
function onSnap(m) {
  const at = performance.now();
  const u = new Map(m.u.map((a) => [a[0], { id: a[0], card: a[1], mine: a[2] === 0, x: a[3], y: a[4], hp: a[5], max: a[6], dep: a[7] }]));
  const tw = new Map(m.tw.map((a) => [a[0], { id: a[0], mine: a[1] === 0, main: a[2] === 0, x: a[3], y: a[4], hp: a[5], max: a[6] }]));
  const sn = { at, k: m.k, u, tw };
  snaps.push(sn); if (snaps.length > 6) snaps.shift();
  for (const e of m.ev) evq.push({ due: at + 120, e });
  const first = !cur; cur = m; cur.u2 = u; cur.tw2 = tw; pending = false;
  if (first) shownDbl = !!m.dbl;
  updateHud();
}

// ------------------------------------------------------------------ HUD: karty, elixír, čas
let sel = -1, pending = false;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function updateHud() {
  const m = cur; if (!m) return;
  $('gTimer').textContent = fmtTime(m.tm); $('gTimer').classList.toggle('low', m.tm <= 10 && !m.ot);
  $('gMode').textContent = m.ot ? 'PRODLOUŽENÍ' : m.dbl ? 'ELIXÍR ×2' : '';
  $('gCrowns').innerHTML = `<span class="me">${m.cr[0] >= 3 ? SVG_CROWN : m.cr[0]}</span><i>:</i><span class="en">${m.cr[1] >= 3 ? SVG_CROWN : m.cr[1]}</span>`;
  if (m.ot && !shownOt) { shownOt = true; banner('Prodloužení!'); }
  else if (m.dbl && !shownDbl) { shownDbl = true; banner('Dvojitý elixír!'); }
  $('eFill').style.width = (m.el / C.ELIXIR_MAX) * 100 + '%'; $('eNum').textContent = Math.floor(m.el);
  const sig = m.hand.map((h) => h.join(':')).join('|');
  const hand = $('hand');
  if (hand.dataset.sig !== sig) { // karty se přestavují jen při změně ruky (kvůli tažení prstem)
    hand.dataset.sig = sig;
    hand.innerHTML = m.hand.map((h, i) => { const c = CARDS[h[0]]; return `<button class="hc" type="button" data-i="${i}" aria-label="${esc(c.name)}"><span class="cost">${c.cost}</span><span class="ic">${iconImg(h[0])}</span><span class="nm">${esc(c.name)}</span><span class="lvb">úr. ${h[1]}</span></button>`; }).join('');
  }
  [...hand.children].forEach((b, i) => { const c = CARDS[m.hand[i][0]]; b.classList.toggle('poor', m.el + 1e-9 < c.cost); b.classList.toggle('sel', i === sel); });
  const nx = m.next ? CARDS[m.next[0]] : null; $('nextCard').innerHTML = nx ? `${iconImg(m.next[0])}<span class="cost" style="left:-8px;top:-8px;width:22px;height:26px;font-size:12px">${nx.cost}</span>` : '';
}
function banner(txt) { const b = $('banner'); b.textContent = txt; b.hidden = true; void b.offsetWidth; b.hidden = false; }
function showOver() {
  const r = S && S.result; if (!r) return;
  const won = r.winner === me, draw = r.winner === -1;
  $('oTitle').textContent = draw ? 'REMÍZA' : won ? 'VÝHRA' : 'PROHRA'; $('oTitle').className = 'otitle ' + (draw ? 'draw' : won ? '' : 'lose');
  $('oReason').textContent = (REASON[r.reason] || '') + (r.reason === 'surrender' && !won ? ' Vzdal ses.' : '');
  const co = r.coins[me]; const bo = r.bonus[me] || 0;
  $('oCoins').innerHTML = co != null ? `<div class="pos"><span class="coin"></span> +${co}</div>${bo ? `<div class="streak">série výher: +${bo} bonus (${r.streak[me]}. v řadě)</div>` : ''}` : (r.noCoins ? `<div class="nc">${esc(r.noCoins)}</div>` : '');
  const xp = r.xp[me]; $('oXpTxt').textContent = xp ? `+${xp.gain} XP${xp.up ? ` · nová úroveň ${xp.lvl}!` : ''}` : ''; $('oXpBar').style.width = '100%';
  const bot = S.bot; $('oAgainTxt').textContent = bot ? 'Hrát znovu' : S.rematch[me] ? 'Čekám na soupeře…' : 'Odveta';
  $('oAgain').disabled = !bot && !!S.rematch[me]; $('oHint').textContent = !bot && S.rematch[1 - me] ? 'Soupeř chce odvetu.' : '';
  $('over').hidden = false; if (draw) sfx.click(); else if (won) sfx.win(); else sfx.lose();
}
$('oAgain').onclick = () => { sendMsg({ t: 'rematch' }); };
$('oMenu').onclick = () => leaveGame();
$('pauseBtn').onclick = () => { $('pauseModal').hidden = false; };
$('pLeave').onclick = () => { $('pauseModal').hidden = true; leaveGame(); };
$('leaveLobby').onclick = () => leaveGame();
$('copyLink').onclick = async () => {
  const url = `${location.origin}${location.pathname}?k=${S ? S.code : ''}`;
  try { await navigator.clipboard.writeText(url); toast('Odkaz zkopírován.'); } catch (e) { toast(url); }
};

// ------------------------------------------------------------------ plátno
const cv = $('cv'); const g = cv.getContext('2d');
let cw = 0, ch = 0, dpr = 1, sc = 1, ox = 0, oy = 0;
function resize() {
  const r = $('gField').getBoundingClientRect(); if (!r.width || !r.height) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2.5); cw = r.width; ch = r.height;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  sc = Math.min(cw / W, ch / H); ox = (cw - W * sc) / 2; oy = (ch - H * sc) / 2;
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));
const toArena = (cx, cy) => { const r = cv.getBoundingClientRect(); return [(cx - r.left - ox) / sc, (cy - r.top - oy) / sc]; };

// ---- vstup: karta se vybere (klepnutím) a položí klepnutím do arény, nebo se přetáhne
let drag = null, ptr = null;   // ptr = [x, y] v souřadnicích arény (pro náhled)
$('hand').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.hc'); if (!b || !cur) return; e.preventDefault(); audio();
  sel = sel === +b.dataset.i && !drag ? -1 : +b.dataset.i; sfx.click();
  drag = { i: +b.dataset.i, sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId };
  updateHud();
});
window.addEventListener('pointermove', (e) => {
  if (drag && e.pointerId === drag.id) { if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 12) { drag.moved = true; sel = drag.i; updateHud(); } if (drag.moved) ptr = toArena(e.clientX, e.clientY); }
  else if (sel >= 0 && e.pointerType === 'mouse') ptr = toArena(e.clientX, e.clientY);
});
window.addEventListener('pointerup', (e) => {
  if (drag && e.pointerId === drag.id) {
    const d = drag; drag = null;
    if (d.moved) { const [x, y] = toArena(e.clientX, e.clientY); const r = cv.getBoundingClientRect(); if (e.clientY < r.bottom && e.clientY > r.top) placeCard(d.i, x, y); else { sel = -1; ptr = null; updateHud(); } }
  }
});
window.addEventListener('pointercancel', () => { drag = null; });
cv.addEventListener('pointerdown', (e) => { if (sel < 0 || !cur) return; e.preventDefault(); const [x, y] = toArena(e.clientX, e.clientY); ptr = [x, y]; placeCard(sel, x, y); });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
function validSpot(i, x, y) { const c = CARDS[cur.hand[i][0]]; if (x < 0 || x > W || y < 0 || y > H) return false; return c.kind === 'spell' || y >= RIVER.y1 + 10; }
function placeCard(i, x, y) {
  if (!cur || !S || S.phase !== 'play' || pending) return;
  const c = CARDS[cur.hand[i][0]];
  if (cur.el + 1e-9 < c.cost) { sfx.err(); toast('Nemáš dost elixíru.'); return; }
  if (!validSpot(i, x, y)) { sfx.err(); toast(x < 0 || x > W || y < 0 || y > H ? 'Polož kartu do arény.' : 'Jednotky pokládej jen na svou polovinu (dole).'); return; }
  pending = true; sel = -1; ptr = null; sfx.deploy();
  sendMsg({ t: 'play', hi: i, x: Math.round(x), y: Math.round(y) }); updateHud();
}

// ------------------------------------------------------------------ vykreslení
const COL = { me: ['#5aa9ff', '#1f5fc4', '#0d3a8a'], en: ['#ff7a72', '#c42b25', '#7e1410'] };
function interp(now) { // pozice jednotek v čase (o 130 ms zpět, ať se dá plynule mezi snímky počítat)
  const out = new Map(); const tws = new Map();
  if (!snaps.length) return { u: out, tw: tws };
  const rt = now - 130; let a = snaps[0], b = snaps[snaps.length - 1];
  for (let i = snaps.length - 1; i >= 0; i--) { if (snaps[i].at <= rt) { a = snaps[i]; b = snaps[i + 1] || snaps[i]; break; } if (i === 0) { a = snaps[0]; b = snaps[0]; } }
  const t = a === b ? 1 : clamp((rt - a.at) / (b.at - a.at), 0, 1);
  const last = snaps[snaps.length - 1];
  for (const [id, ub] of b.u) { const ua = a.u.get(id) || ub; out.set(id, { ...ub, x: ua.x + (ub.x - ua.x) * t, y: ua.y + (ub.y - ua.y) * t }); }
  for (const [id, tb] of last.tw) tws.set(id, tb);
  return { u: out, tw: tws };
}
let lastPos = { u: new Map(), tw: new Map() };
const P = (x, y) => [ox + x * sc, oy + y * sc];
function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function drawField(now) {
  g.fillStyle = '#0e2a18'; g.fillRect(0, 0, cw, ch);
  // tráva v pruzích
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#3f9a4a' : '#47a653'; const [x, y] = P(0, i * 40); g.fillRect(x, y, W * sc, 40 * sc + 1); }
  // tmavší okraje arény
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; const [ax, ay] = P(0, 0); g.strokeRect(ax, ay, W * sc, H * sc);
  // zvýraznění vlastní poloviny při pokládání
  if (sel >= 0 && cur && CARDS[cur.hand[sel][0]].kind !== 'spell') { const [x, y] = P(0, RIVER.y1); g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x, y, W * sc, (H - RIVER.y1) * sc); g.strokeStyle = 'rgba(255,255,255,.6)'; g.setLineDash([8, 6]); g.strokeRect(x + 1, y + 1, W * sc - 2, (H - RIVER.y1) * sc - 2); g.setLineDash([]); }
  // řeka
  const [rx, ry] = P(0, RIVER.y0); const rh = (RIVER.y1 - RIVER.y0) * sc;
  const gr = g.createLinearGradient(0, ry, 0, ry + rh); gr.addColorStop(0, '#3f8fe0'); gr.addColorStop(1, '#2a6fc4'); g.fillStyle = gr; g.fillRect(rx, ry, W * sc, rh);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { const wx = ((i * 47 + now * 0.02) % (W + 40)) - 20; const [px, py] = P(wx, RIVER.y0 + 7 + (i % 3) * 8); g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + 6 * sc, py - 3 * sc, px + 14 * sc, py); g.stroke(); }
  // most
  const [bx] = P(BRIDGE.x0, 0); const bw = (BRIDGE.x1 - BRIDGE.x0) * sc;
  g.fillStyle = '#9c6a3a'; g.fillRect(bx, ry - 4 * sc, bw, rh + 8 * sc);
  g.strokeStyle = '#6b4423'; g.lineWidth = Math.max(1, sc); for (let i = 0; i <= 12; i++) { const yy = ry - 4 * sc + (i / 12) * (rh + 8 * sc); g.beginPath(); g.moveTo(bx, yy); g.lineTo(bx + bw, yy); g.stroke(); }
  g.fillStyle = '#5a3a1c'; g.fillRect(bx - 3 * sc, ry - 4 * sc, 4 * sc, rh + 8 * sc); g.fillRect(bx + bw - sc, ry - 4 * sc, 4 * sc, rh + 8 * sc);
  // dekorace: kameny a keře
  for (const [dx, dy, k] of DECOR) { const [px, py] = P(dx, dy); if (k) { g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(px, py + 5 * sc, 11 * sc, 5 * sc, 0, 0, 6.283); g.fill(); g.fillStyle = '#2f7d3b'; g.beginPath(); g.arc(px, py, 9 * sc, 0, 6.283); g.arc(px + 7 * sc, py + 3 * sc, 7 * sc, 0, 6.283); g.fill(); } else { g.fillStyle = '#8b9096'; g.beginPath(); g.ellipse(px, py, 7 * sc, 5 * sc, 0, 0, 6.283); g.fill(); } }
}
const DECOR = [[30, 70, 1], [330, 90, 1], [40, 250, 0], [320, 250, 1], [28, 400, 1], [334, 420, 0], [310, 560, 1], [40, 590, 0], [80, 30, 0], [290, 36, 0], [60, 620, 1], [300, 300, 0]];

function drawTower(t, now) {
  const [px, py] = P(t.x, t.y); const s = sc * (t.main ? 1.05 : 0.9); const col = t.mine ? COL.me : COL.en;
  const alive = t.hp > 0;
  g.save(); g.translate(px, py);
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(0, 22 * s, 34 * s, 10 * s, 0, 0, 6.283); g.fill();
  if (!alive) { g.fillStyle = '#6b6f78'; g.beginPath(); g.moveTo(-30 * s, 20 * s); g.lineTo(-18 * s, 0); g.lineTo(-4 * s, 10 * s); g.lineTo(10 * s, -6 * s); g.lineTo(26 * s, 20 * s); g.closePath(); g.fill(); g.strokeStyle = '#3d4047'; g.lineWidth = 2; g.stroke(); g.restore(); return; }
  const bw = (t.main ? 38 : 30) * s, bh = (t.main ? 46 : 36) * s;
  const fl = (flash.get(t.id) || 0) > now ? 1 : 0;
  g.fillStyle = fl ? '#fff' : '#c9b27a'; g.strokeStyle = '#6e5a2b'; g.lineWidth = 2.5; rr(-bw, -bh + 18 * s, bw * 2, bh, 4 * s); g.fill(); g.stroke();
  g.fillStyle = fl ? '#fff' : '#d8c48e';   // cimbuří
  for (let i = -2; i <= 2; i++) { g.fillRect(i * bw * 0.42 - bw * 0.14, -bh + 8 * s, bw * 0.28, 12 * s); g.strokeRect(i * bw * 0.42 - bw * 0.14, -bh + 8 * s, bw * 0.28, 12 * s); }
  g.fillStyle = col[1]; g.fillRect(-bw, -bh * 0.35, bw * 2, 9 * s);   // barevný pás týmu
  g.fillStyle = '#3b2a16'; rr(-6 * s, 4 * s, 12 * s, 16 * s, 6 * s); g.fill();   // vrata
  if (t.main) { crown(g, 0, -bh - 3 * s, 1.15 * s); }
  else { g.fillStyle = col[0]; g.beginPath(); g.moveTo(0, -bh + 6 * s); g.lineTo(0, -bh - 12 * s); g.lineTo(14 * s, -bh - 7 * s); g.lineTo(0, -bh - 2 * s); g.fill(); g.strokeStyle = '#4b3a1e'; g.beginPath(); g.moveTo(0, -bh + 6 * s); g.lineTo(0, -bh - 14 * s); g.stroke(); }
  g.restore();
  hpBar(px, py - (t.main ? 66 : 54) * sc / 1, t.hp, t.max, t.mine, 46 * sc);
}
function hpBar(x, y, hp, max, mine, w) {
  const f = clamp(hp / max, 0, 1); const h = Math.max(5, 6 * sc);
  g.fillStyle = 'rgba(0,0,0,.65)'; rr(x - w / 2 - 1, y - 1, w + 2, h + 2, 3); g.fill();
  g.fillStyle = mine ? '#4aa3ff' : '#ff5a52'; if (f > 0) { rr(x - w / 2, y, w * f, h, 2.5); g.fill(); }
}
function drawUnit(u, now) {
  const c = CARDS[u.card]; const col = u.mine ? COL.me : COL.en; let [px, py] = P(u.x, u.y);
  const r = (c.r + 3) * sc * 1.15; const fly = c.fly ? 16 * sc : 0;
  const lg = (lunge.get(u.id) || 0) - now; let lx = 0, ly = 0; if (lg > 0) { const k = Math.sin((lg / 160) * 3.14) * 5 * sc; ly = u.mine ? -k : k; }
  if (c.fly) { g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(px, py + r * 0.6, r * 0.8, r * 0.3, 0, 0, 6.283); g.fill(); }   // stín létajících jednotek na zemi
  const fl = (flash.get(u.id) || 0) > now;
  g.save(); g.translate(px + lx, py - fly + ly); if (u.dep) g.globalAlpha = 0.6;
  if (!c.fly) { g.fillStyle = col[0] + '55'; g.strokeStyle = col[0]; g.lineWidth = Math.max(1.5, 1.8 * sc); g.beginPath(); g.ellipse(0, fly + r * 0.55, r * 0.95, r * 0.36, 0, 0, 6.283); g.fill(); g.stroke(); }   // barevný kruh týmu pod nohama
  const k = r * 2.5 / 40; g.scale(k, k); if (fl) g.filter = 'brightness(2.4)';
  drawChar(g, u.card, u.mine ? 'me' : 'en', now / 1000 + u.id * 0.37);
  g.filter = 'none';
  g.restore();
  if (u.dep) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, r * 1.35, 0, 6.283 * Math.min(1, 0.2 + ((now / 400) % 1) * 0.8)); g.stroke(); }
  if (u.hp < u.max || c.hp >= 600) hpBar(px, py - fly - r - 8 * sc, u.hp, u.max, u.mine, Math.max(18 * sc, r * 2));
}

function addFx(o) { fx.push({ born: performance.now(), ...o }); }
function processEvents(now) {
  while (evq.length && evq[0].due <= now) {
    const { e } = evq.shift(); const kind = e[0];
    if (kind === 's') { addFx({ k: 'dust', x: e[4], y: e[5], life: 600 }); if (e[3] !== 0) sfx.shoot(); }
    else if (kind === 'd') { addFx({ k: 'puff', x: e[2], y: e[3], life: 500 }); sfx.die(); }
    else if (kind === 'a') {
      const f = lastPos.u.get(e[1]) || lastPos.tw.get(e[1]); const t = lastPos.u.get(e[2]) || lastPos.tw.get(e[2]); if (!f || !t) continue;
      if (e[3]) { addFx({ k: 'proj', x0: f.x, y0: f.y - (f.id < 10 ? 20 : 0), x1: t.x, y1: t.y, life: 220, tower: f.id < 10 }); sfx.shoot(); } else { lunge.set(f.id, now + 160); sfx.hit(); }
      flash.set(t.id, now + 110);
    }
    else if (kind === 'sp') { addFx({ k: 'meteor', x: e[1], y: e[2], r: e[3], life: e[5] * 50 }); }
    else if (kind === 'x') { addFx({ k: 'boom', x: e[1], y: e[2], r: e[3], life: 450 }); sfx.boom(); shake = Math.max(shake, 3); }
    else if (kind === 'td') { const t = lastPos.tw.get(e[1]); if (t) { addFx({ k: 'boom', x: t.x, y: t.y, r: 60, life: 900 }); addFx({ k: 'boom', x: t.x + 14, y: t.y - 10, r: 40, life: 700, delay: 150 }); } sfx.tower(); shake = Math.max(shake, 9); }
    else if (kind === 'h') { const u = lastPos.u.get(e[1]); if (u) { addFx({ k: 'heal', x: u.x, y: u.y, life: 700 }); sfx.heal(); } }
  }
  // dopad kouzla: po skončení meteoru výbuch
  for (const f of fx) if (f.k === 'meteor' && !f.done && now - f.born >= f.life) { f.done = true; addFx({ k: 'boom', x: f.x, y: f.y, r: f.r, life: 520 }); sfx.boom(); shake = Math.max(shake, 5); }
}
function drawFx(now) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; const t = (now - f.born - (f.delay || 0)) / f.life;
    if (t > 1 && !(f.k === 'meteor' && !f.done)) { fx.splice(i, 1); continue; }
    if (t < 0) continue;
    const [px, py] = P(f.x, f.y);
    if (f.k === 'dust') { g.strokeStyle = `rgba(255,255,255,${0.7 * (1 - t)})`; g.lineWidth = 3 * sc; g.beginPath(); g.ellipse(px, py + 4 * sc, (8 + 22 * t) * sc, (4 + 10 * t) * sc, 0, 0, 6.283); g.stroke(); }
    else if (f.k === 'puff') { g.globalAlpha = 0.8 * (1 - t); g.fillStyle = '#e8ecf5'; for (const [ox, oy, rd] of [[-7, 0, 6], [6, -2, 7], [0, -7, 6], [-2, 3, 5]]) { g.beginPath(); g.arc(px + ox * (0.6 + t) * sc, py + (oy - 14 * t) * sc, rd * (0.7 + 0.9 * t) * sc, 0, 6.283); g.fill(); } g.globalAlpha = 1; }
    else if (f.k === 'proj') { const x = f.x0 + (f.x1 - f.x0) * Math.min(1, t), y = f.y0 + (f.y1 - f.y0) * Math.min(1, t); const [qx, qy] = P(x, y); g.fillStyle = f.tower ? '#ffe45c' : '#fff'; g.shadowColor = '#ffd54a'; g.shadowBlur = 8; g.beginPath(); g.arc(qx, qy, (f.tower ? 4 : 3) * sc, 0, 6.283); g.fill(); g.shadowBlur = 0; }
    else if (f.k === 'meteor') { const k = Math.min(1, t); const [mx, my] = P(f.x, f.y); g.strokeStyle = 'rgba(255,120,40,.55)'; g.lineWidth = 3; g.setLineDash([6, 5]); g.beginPath(); g.arc(mx, my, f.r * sc, 0, 6.283); g.stroke(); g.setLineDash([]); const yy = my - (1 - k) * 360 * sc; g.save(); g.translate(mx, yy); g.rotate(Math.PI); flame(g, 1.1 * sc, now / 1000); g.restore(); }
    else if (f.k === 'boom') { const rad = (f.r * (0.4 + 0.9 * t)) * sc; const gr = g.createRadialGradient(px, py, 0, px, py, rad); gr.addColorStop(0, `rgba(255,240,160,${0.95 * (1 - t)})`); gr.addColorStop(0.5, `rgba(255,140,40,${0.7 * (1 - t)})`); gr.addColorStop(1, 'rgba(255,60,20,0)'); g.fillStyle = gr; g.beginPath(); g.arc(px, py, rad, 0, 6.283); g.fill(); }
    else if (f.k === 'heal') { g.globalAlpha = 1 - t; const hy = py - (10 + 26 * t) * sc, a = 3.4 * sc, b = 9 * sc; g.fillStyle = '#5dff9a'; g.strokeStyle = '#0b4a26'; g.lineWidth = 1.5; g.beginPath(); g.rect(px - a, hy - b, 2 * a, 2 * b); g.rect(px - b, hy - a, 2 * b, 2 * a); g.fill(); g.stroke(); g.globalAlpha = 1; }
  }
}
function drawGhost() {
  if (sel < 0 || !cur || !ptr) return; const c = CARDS[cur.hand[sel][0]]; const [x, y] = ptr; const ok = validSpot(sel, x, y); const [px, py] = P(clamp(x, 0, W), clamp(y, 0, H));
  if (c.kind === 'spell') { g.fillStyle = 'rgba(255,100,40,.22)'; g.strokeStyle = 'rgba(255,150,60,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(px, py, c.splash * sc, 0, 6.283); g.fill(); g.stroke(); }
  else { g.fillStyle = ok ? 'rgba(255,255,255,.28)' : 'rgba(255,60,50,.35)'; g.beginPath(); g.arc(px, py, (c.r + 6) * sc * 1.15, 0, 6.283); g.fill(); }
  g.globalAlpha = 0.9; const gs = c.kind === 'spell' ? 44 * sc : (c.r + 9) * sc * 2.6; g.drawImage(iconCanvas(cur.hand[sel][0]), px - gs / 2, py - gs / 2 - (c.kind === 'spell' ? 0 : gs * 0.08), gs, gs); g.globalAlpha = 1;
}
let lastFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (screen !== 'game' || !cw) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (shake > 0.2) { g.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake *= 0.88; } else shake = 0;
  drawField(now);
  const pos = interp(now); lastPos = pos;
  processEvents(now);
  for (const t of pos.tw.values()) drawTower(t, now);
  const us = [...pos.u.values()].sort((a, b) => ((CARDS[a.card].fly ? 1000 : 0) + a.y) - ((CARDS[b.card].fly ? 1000 : 0) + b.y));
  for (const u of us) drawUnit(u, now);
  drawFx(now); drawGhost();
  lastFrame = now;
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ start
$('fan').innerHTML = ['knight', 'wizard', 'dragon'].map((id, i) => `<span class="fc f${i}">${iconImg(id)}</span>`).join('');
startScene($('mscene'));
(async () => {
  await refreshProfile(); botMenu();
  const q = new URLSearchParams(location.search).get('k');
  let rs = null; try { rs = JSON.parse(LS.get('arena_resume')); } catch (e) { /* nic */ }
  if (q && /^[A-Za-z]{4}$/.test(q)) { $('code').value = q.toUpperCase(); setTimeout(() => startGame({ t: 'join', code: q.toUpperCase() }), 500); }
  else if (rs && rs.code && rs.token && Date.now() - rs.at < 30 * 60 * 1000) { session = { code: rs.code, token: rs.token }; setStatus('Obnovuji rozehranou hru…'); connect(); }
})();
window.__arena = { get S() { return S; }, get cur() { return cur; }, C, onMsg, show, placeCard, get sel() { return sel; }, set sel(v) { sel = v; } };
