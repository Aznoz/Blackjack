// MECHA ARÉNA – klient: menu, garáž (sestava robota z karet), sklad a vylepšování, obchod s bednami, kampaň, online místnosti. Souboj je v battle.js.
import * as H from './shared.js?v=3';
import * as C from './campaign.js?v=3';
import * as A from './art.js?v=3';
import { sfx, setMuted, isMuted } from './sfx.js?v=3';
import { createBattle } from './battle.js?v=3';
import { itemLines, pct } from './info.js?v=3';

const CFG = window.MECHA_CONFIG || {};
const $ = (id) => document.getElementById(id);
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nic */ } } };
const SS = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* nic */ } }, del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* nic */ } } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const API = String(CFG.SERVER_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/mecha\/?$/, '');
const RC = (it) => H.RARITY[it.tier - 1].color;
const fmt = (n) => Number(n).toLocaleString('cs-CZ');

// ------------------------------------------------------------------ identita a API
let memToken = null;
function getToken() {
  let t = null; try { t = JSON.parse(LS.get('bj_token')); } catch (e) { t = LS.get('bj_token'); } t = t || memToken;
  if (!t || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) { const b = new Uint8Array(24); crypto.getRandomValues(b); t = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); LS.set('bj_token', JSON.stringify(t)); memToken = t; }
  return t;
}
function getSession() { let x = LS.get('portal_session'); try { x = JSON.parse(x); } catch (e) { /* surový řetězec */ } return typeof x === 'string' ? x : undefined; }
const ident = () => ({ token: getToken(), session: getSession() });
async function call(action, body) {
  const r = await fetch(API + '/api/mecha/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ident(), ...body }), signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Chyba ' + r.status); return j;
}
let prof = null;
const my = () => (prof && prof.mecha) || { coins: 0, inv: {}, build: H.emptyBuild(), camp: 0, wins: 0, games: 0, losses: 0, opened: 0, dailyIn: 0 };
function setProf(p) { if (p && p.mecha) { prof = p; prof.at = Date.now(); } paintCoins(); }
async function refreshProfile() { try { setProf(await call('me', {})); } catch (e) { /* offline: zůstane staré */ } updateMenu(); }

// ------------------------------------------------------------------ obecné
let screen = 'menu';
const SCREENS = ['menu', 'garage', 'shop', 'camp', 'lobby', 'battle'];
function show(name) { screen = name; for (const s of SCREENS) $(s).hidden = s !== name; closeModal(); if (name === 'menu') updateMenu(); }
let toastT = null;
function toast(msg, ms = 2400) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }
const status = (m) => { $('status').textContent = m || ''; };
function openModal(html, cls = '') { const m = $('modal'); m.innerHTML = `<div class="dlg ${cls}" role="dialog"><button class="x" type="button" aria-label="Zavřít">×</button>${html}</div>`; m.hidden = false; m.querySelector('.x').onclick = closeModal; m.onclick = (e) => { if (e.target === m) closeModal(); }; return m.firstElementChild; }
function closeModal() { const m = $('modal'); m.hidden = true; m.innerHTML = ''; }
const paintCoins = () => { for (const e of document.querySelectorAll('[data-coins]')) e.textContent = fmt(my().coins); };
const bar = (title, back = 'menu') => `<div class="hz-bar"></div><header class="bar"><button class="back" type="button" data-go="${back}">‹ Zpět</button><span class="title">${title}</span><span class="grow"></span><span class="coins"><i></i><b data-coins>${fmt(my().coins)}</b></span></header>`;
function wireGo(root) { for (const b of root.querySelectorAll('[data-go]')) b.onclick = () => { sfx.click(); const g = b.dataset.go; if (g === 'shop') return openShop(); if (g === 'garage') return openGarage(); if (g === 'camp') return openCamp(); show(g); if (g === 'menu') leaveRoomSilently(); }; }

// ------------------------------------------------------------------ popis karet
const cardHTML = (it, o = {}) => `<${o.tag || 'button'} class="card ${o.cls || ''}" type="button" data-id="${it.id}" style="--rc:${RC(it)}" ${o.dis ? 'disabled' : ''}>${o.n != null ? `<span class="cnt">×${o.n}</span>` : ''}${A.cardIcon(it)}<span class="cn">${esc(it.famName)} Mk ${['I', 'II', 'III', 'IV', 'V'][it.tier - 1]}</span><span class="cm"><span>${H.RARITY[it.tier - 1].name}</span>${o.lv ? `<span class="lv">Ú${o.lv}</span>` : ''}</span>${o.extra || ''}</${o.tag || 'button'}>`;

// ------------------------------------------------------------------ menu
function updateMenu() {
  const has = !!(prof && prof.account), m = my();
  $('pilot').hidden = !has; $('noAcc').hidden = has;
  if (has) { $('pName').textContent = prof.name || 'Pilot'; $('pRec').textContent = `výhry ${m.wins} · zápasy ${m.games} · kampaň ${m.camp}/${C.MISSIONS.length}`; }
  $('pCoins').textContent = fmt(m.coins); $('campSub').textContent = m.camp >= C.MISSIONS.length ? 'kampaň dokončena' : `mise ${Math.min(m.camp + 1, C.MISSIONS.length)} z ${C.MISSIONS.length}`;
  $('shopSub').textContent = m.dailyIn <= 0 && has ? 'bedna zdarma čeká!' : 'bedny s kartami';
  for (const id of ['bCamp', 'bGarage', 'bShop', 'bQuick', 'bTrain', 'bCreate']) $(id).disabled = !has;
  $('heroBot').innerHTML = A.robotSVGFull(has ? m.build : H.STARTER_BUILD, m.inv);
  $('muteBtn').textContent = isMuted() ? 'Zvuk vyp' : 'Zvuk zap';
}
$('muteBtn').onclick = () => { setMuted(!isMuted()); updateMenu(); };
const fsOK = document.documentElement.requestFullscreen && !/iPhone|iPad/.test(navigator.userAgent);
if (fsOK) { $('fsBtn').hidden = false; $('fsBtn').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }; }
$('bGarage').onclick = () => { sfx.click(); openGarage(); };
$('bShop').onclick = () => { sfx.click(); openShop(); };
$('bCamp').onclick = () => { sfx.click(); openCamp(); };
$('bQuick').onclick = () => { sfx.click(); status('Hledám soupeře…'); startOnline({ t: 'quick' }); };
$('bCreate').onclick = () => { sfx.click(); startOnline({ t: 'create' }); };
$('bTrain').onclick = () => { sfx.click(); const d = openModal(`<h2>Trénink</h2><p>Zápas proti robotovi podobné síly, odměna je menší než za online.</p><div class="acts"><button class="btn alt" data-l="1" type="button">Lehký</button><button class="btn" data-l="2" type="button">Střední</button><button class="btn red" data-l="3" type="button">Těžký</button></div>`); for (const b of d.querySelectorAll('[data-l]')) b.onclick = () => { closeModal(); startOnline({ t: 'train', level: +b.dataset.l }); }; };
$('joinForm').onsubmit = (e) => { e.preventDefault(); const c = $('code').value.trim().toUpperCase(); if (c.length !== 4) return toast('Kód má čtyři písmena.'); startOnline({ t: 'join', code: c }); };
$('bHow').onclick = () => { sfx.click(); openModal(`<h2>Jak se hraje</h2><div class="how"><ul>
<li>Robota skládáš z <b>karet</b> do devíti slotů: hlava, dvě ramena, hruď, dvě ruce, dvě nohy a dron. Jedna kopie karty zaplní jeden slot.</li>
<li>Každý díl váží. Když součet přesáhne <b>nosnost</b>, robot je přetížený a do boje nepůjde.</li>
<li>Karty padají z <b>beden</b> v obchodě. Stejné karty se dají sloučit: dvě kopie navíc zvednou kartu na úroveň 2 a tak dál, každá úroveň dává +10 % výkonu.</li>
<li>V boji střídáte tahy. Začínající robot má jen <b>dva tahové body (TB)</b>. Každá akce stojí TB: výstřel jednou zbraní, krok, skok, štít, oprava, vyslání dronu. Výkonnější reaktor a procesor tahové body přidají.</li>
<li>Zbraně i skoky spotřebují <b>energii</b>, která se každé kolo trochu dobije. Každou zbraň jde za tah použít jednou.</li>
<li>Střela má šanci zasáhnout podle přesnosti, vzdálenosti a úhybnosti. Kritické zásahy dávají 1,5× víc. Štít chrání životy a brnění snižuje kinetické, energetické nebo výbušné zásahy.</li>
<li>Dron vyšleš jednou za zápas. Po konci tvého tahu sám střílí, léčí, staví štít nebo ruší soupeře.</li>
<li>Kampaň má 30 misí. Za první vítězství dostaneš coiny a bednu. Online zápas se hraje proti dalšímu hráči, případně proti AI, když se nikdo nenajde.</li></ul></div>`); };

// ------------------------------------------------------------------ garáž
let draft = null, gTab = 'build', gFilter = 'all', gErr = '';
function openGarage() { draft = { ...my().build }; gTab = 'build'; gErr = ''; show('garage'); renderGarage(); }
const SLOT_POS = { head: ['l', 0], shL: ['l', 1], hdL: ['l', 2], chest: ['l', 3], lgL: ['l', 4], shR: ['r', 0], hdR: ['r', 1], lgR: ['r', 2], drone: ['r', 3] };
function freeCount(id, ignoreSlot) { const e = my().inv[id]; if (!e) return 0; let used = 0; for (const s of H.SLOTS) if (draft[s] === id && s !== ignoreSlot) used++; return e.n - used; }
function renderGarage() {
  const g = $('garage'), m = my(), inv = m.inv;
  const st = H.mechStats(draft, inv), err = H.buildError(draft, inv); gErr = err || '';
  const slotBtn = (s) => { const it = draft[s] ? H.item(draft[s]) : null, [side, i] = SLOT_POS[s]; return `<button class="slot ${it ? 'has' : ''}" type="button" data-slot="${s}" style="${side === 'l' ? 'left' : 'right'}:6px;top:${2 + i * 19.5}%;${it ? '--rc:' + RC(it) : ''}">${it ? A.cardIcon(it) : ''}<span class="nm">${it ? esc(it.famName) + ' ' + ['I', 'II', 'III', 'IV', 'V'][it.tier - 1] : H.SLOT_NAME[s]}</span>${it ? '' : '<span class="nm">prázdné</span>'}</button>`; };
  const over = st.weight > st.cap, wpct = Math.min(100, (st.weight / st.cap) * 100);
  const row = (a, b) => `<div class="srow"><span>${a}</span><b>${b}</b></div>`;
  let build = `<div class="garage"><div class="stage">${A.robotSVGFull(draft, inv)}${H.SLOTS.map(slotBtn).join('')}</div>
  <div class="statp"><h3>Vlastnosti robota</h3>
  <div class="srow"><span>Nosnost</span><b>${st.weight} / ${st.cap}</b></div><div class="wbar ${over ? 'over' : ''}"><i style="width:${wpct}%"></i></div>${err ? `<p class="err">${esc(err)} Změny se neuloží, dokud to nespravíš.</p>` : '<small style="color:var(--dim)">Sestava se ukládá automaticky.</small>'}
  ${row('Životy', st.hp)}${row('Tahové body', st.ap + ' / ' + H.MAX_AP)}${row('Energie (dobíjení / kolo)', `${st.en} (+${st.regen})`)}${st.shield ? row('Štít (obnova / kolo)', `${st.shield} (+${st.shieldRegen})`) : ''}${row('Přesnost', st.acc + ' %')}${row('Kritický zásah', st.crit + ' %')}${row('Úhybnost', st.evade + ' %')}${row('Chůze / skok', `${st.spd} / ${st.jmp}`)}
  ${['kin', 'nrg', 'exp'].map((k) => (st.res[k] ? row('Odolnost ' + H.TYPES[k].name.toLowerCase(), pct(st.res[k])) : '')).join('')}${st.rep ? row('Oprava', `${st.rep} HP ×${st.repUses}`) : ''}${row('Síla sestavy', H.power(draft, inv))}
  <h3 style="margin-top:12px">Výzbroj</h3><div class="wlist">${st.weapons.map((w) => { const it = H.item(w.id); return `<div class="wl">${A.cardIcon(it)}<div><b>${esc(w.name)}</b> · ${H.SLOT_NAME[w.slot]}<div class="chips">${itemLines(it, w.lv).replace(/<span class="chip">váha[^<]*<\/span>/, '')}</div></div></div>`; }).join('') || '<div class="empty">Žádná zbraň. Dej nějakou do ruky nebo na rameno.</div>'}
  ${st.drone ? `<div class="wl">${A.cardIcon(H.item(st.drone.id))}<div><b>${esc(st.drone.name)}</b> · Dron<div class="chips">${itemLines(H.item(st.drone.id), st.drone.lv)}</div></div></div>` : ''}</div></div></div>`;
  let inv2 = ''; if (gTab === 'inv') {
    const kinds = [['all', 'Vše'], ['weapon', 'Zbraně'], ['module', 'Moduly'], ['drone', 'Drony']];
    const ids = Object.keys(inv).map(H.item).filter((it) => it && (gFilter === 'all' || it.kind === gFilter)).sort((a, b) => b.tier - a.tier || a.fam.localeCompare(b.fam));
    inv2 = `<div class="filters">${kinds.map(([k, n]) => `<button class="tab ${gFilter === k ? 'on' : ''}" data-f="${k}" type="button">${n}</button>`).join('')}</div><div class="cards">${ids.map((it) => cardHTML(it, { n: inv[it.id].n, lv: inv[it.id].lv })).join('') || '<div class="empty">Tady zatím nic není. V obchodě koupíš bedny s kartami.</div>'}</div>`;
  }
  g.innerHTML = `${bar('Garáž')}<div class="wrap"><div class="tabs"><button class="tab ${gTab === 'build' ? 'on' : ''}" data-t="build" type="button">Sestava</button><button class="tab ${gTab === 'inv' ? 'on' : ''}" data-t="inv" type="button">Sklad karet (${Object.values(inv).reduce((a, e) => a + e.n, 0)})</button><span class="grow"></span><button class="btn sm" data-go="shop" type="button">Obchod</button></div>${gTab === 'build' ? build : inv2}</div>`;
  wireGo(g);
  for (const b of g.querySelectorAll('[data-t]')) b.onclick = () => { sfx.click(); gTab = b.dataset.t; renderGarage(); };
  for (const b of g.querySelectorAll('[data-f]')) b.onclick = () => { sfx.click(); gFilter = b.dataset.f; renderGarage(); };
  for (const b of g.querySelectorAll('[data-slot]')) b.onclick = () => { sfx.click(); pickCard(b.dataset.slot); };
  for (const b of g.querySelectorAll('.card')) b.onclick = () => { sfx.click(); cardDetail(b.dataset.id); };
}
let saveT = null;
function saveBuild() {
  clearTimeout(saveT); if (H.buildError(draft, my().inv)) return;
  const snapshot = { ...draft }; saveT = setTimeout(async () => { try { setProf(await call('build', { build: snapshot })); } catch (e) { toast(e.message); } }, 250);
}
function pickCard(slot) {
  const kind = H.SLOT_KIND[slot], inv = my().inv;
  const ids = Object.keys(inv).map(H.item).filter((it) => it && it.fit.includes(kind)).sort((a, b) => b.tier - a.tier || a.fam.localeCompare(b.fam));
  const d = openModal(`<h2>${H.SLOT_NAME[slot]}</h2><p style="color:var(--dim)">Vyber kartu. Jedna kopie se dá použít jen v jednom slotu.</p><div class="acts" style="margin:0 0 10px"><button class="btn alt sm" data-clear type="button">Vyprázdnit slot</button></div><div class="cards">${ids.map((it) => { const free = freeCount(it.id, slot), cur = draft[slot] === it.id; return cardHTML(it, { n: free + (cur ? 1 : 0) ? free : 0, lv: inv[it.id].lv, cls: cur ? 'sel' : '', dis: free < 1 && !cur, extra: `<span class="cm"><span>váha ${it.w}</span></span>` }); }).join('') || `<div class="empty">Na tenhle slot nemáš žádnou kartu. Zkus bednu v obchodě.</div>`}</div>`, 'wide');
  d.querySelector('[data-clear]').onclick = () => { sfx.click(); draft[slot] = ''; closeModal(); renderGarage(); saveBuild(); };
  for (const b of d.querySelectorAll('.card')) b.onclick = () => { sfx.click(); draft[slot] = b.dataset.id; closeModal(); renderGarage(); saveBuild(); };
}
function cardDetail(id) {
  const it = H.item(id), e = my().inv[id]; if (!it || !e) return;
  const used = H.usage(my().build)[id] || 0, spare = e.n - Math.max(1, used), need = e.lv < H.MAX_LV ? H.LV_NEED[e.lv] : 0, canUp = e.lv < H.MAX_LV && e.n - need >= Math.max(1, used);
  const d = openModal(`<div style="display:grid;grid-template-columns:140px 1fr;gap:14px;align-items:center"><div style="--rc:${RC(it)}">${cardHTML(it, { tag: 'div', n: e.n, lv: e.lv })}</div><div><h2 style="margin:0">${esc(it.name)}</h2><span class="rbadge" style="--rc:${RC(it)}">${H.RARITY[it.tier - 1].name}</span> <span class="rbadge" style="--rc:var(--amber)">úroveň ${e.lv} / ${H.MAX_LV}</span><p>${esc(it.desc)}</p></div></div>
  <div class="chips">${itemLines(it, e.lv)}</div>
  ${e.lv < H.MAX_LV ? `<p style="color:var(--dim)">Vylepšení na úroveň ${e.lv + 1} stojí ${need} kopie navíc (+10 % výkonu). Máš ${e.n}, v sestavě ${used}.</p>` : '<p style="color:var(--amber2)">Nejvyšší úroveň.</p>'}
  <div class="acts"><button class="btn" data-up type="button" ${canUp ? '' : 'disabled'}>Vylepšit</button><button class="btn alt" data-sell1 type="button" ${spare >= 1 ? '' : 'disabled'}>Prodat 1 (+${it.sell})</button><button class="btn alt" data-sellall type="button" ${spare >= 2 ? '' : 'disabled'}>Prodat volné ×${spare} (+${it.sell * spare})</button></div>`);
  const act = async (a, body) => { try { const p = await call(a, { id, ...body }); setProf(p); sfx.pop(); closeModal(); if (screen === 'garage') { draft = { ...my().build, ...Object.fromEntries(H.SLOTS.filter((s) => draft[s] && my().inv[draft[s]]).map((s) => [s, draft[s]])) }; renderGarage(); } } catch (e) { toast(e.message); sfx.bad(); } };
  d.querySelector('[data-up]').onclick = () => act('upgrade'); d.querySelector('[data-sell1]').onclick = () => act('sell', { k: 1 }); d.querySelector('[data-sellall]').onclick = () => act('sell', { k: spare });
}

// ------------------------------------------------------------------ obchod
let dailyTimer = null;
function openShop() {
  show('shop'); const s = $('shop'), m = my();
  const odds = (c) => `<div class="odds">${c.odds.map((v, i) => (v ? `<i style="flex:${v};background:${H.RARITY[i].color}" title="${H.RARITY[i].name} ${v} %"></i>` : '')).join('')}</div><div class="oddl">${c.odds.map((v, i) => (v ? `<span style="color:${H.RARITY[i].color}">${v} %</span>` : '')).join('')}</div>`;
  s.innerHTML = `${bar('Sklad dílů')}<div class="wrap"><div class="daily" id="daily">${A.crateSVG(H.crate('serv'))}<div><b style="font-family:var(--head);text-transform:uppercase;letter-spacing:.06em;font-size:18px">Denní zásilka zdarma</b><div id="dailyTxt" style="color:var(--dim)"></div></div><span class="grow"></span><button class="btn" id="dailyBtn" type="button">Otevřít</button></div>
  <div class="crates">${H.CRATES.map((c) => `<div class="crate-card" style="--cc:${c.accent}">${A.crateSVG(c)}<h3>${esc(c.name)}</h3><p>${esc(c.desc)} (${c.cards} ${c.cards === 1 ? 'karta' : c.cards < 5 ? 'karty' : 'karet'})</p>${odds(c)}<div class="buy"><button class="btn" data-buy="${c.id}" data-n="1" type="button" ${m.coins < c.price ? 'disabled' : ''}>Koupit · ${fmt(c.price)}</button><button class="btn alt" data-buy="${c.id}" data-n="5" type="button" ${m.coins < c.price * 5 ? 'disabled' : ''}>×5</button></div></div>`).join('')}</div></div>`;
  wireGo(s);
  for (const b of s.querySelectorAll('[data-buy]')) b.onclick = () => buyCrate(b.dataset.buy, +b.dataset.n);
  $('dailyBtn').onclick = () => buyCrate('daily', 1);
  clearInterval(dailyTimer); const tick = () => { const left = Math.max(0, my().dailyIn - (Date.now() - (prof.at || Date.now()))); const t = $('dailyTxt'); if (!t) return clearInterval(dailyTimer); const h = Math.floor(left / 3600000), mi = Math.floor((left % 3600000) / 60000), se = Math.floor((left % 60000) / 1000); t.textContent = left <= 0 ? 'Servisní bedna je připravená k vyzvednutí.' : `Další bedna za ${h} h ${String(mi).padStart(2, '0')} min ${String(se).padStart(2, '0')} s`; const bt = $('dailyBtn'); if (bt) bt.disabled = left > 0; };
  tick(); dailyTimer = setInterval(tick, 1000);
}
let buying = false;
async function buyCrate(id, n) {
  if (buying) return; buying = true; sfx.click(); const before = { ...my().inv }; const cid = id === 'daily' ? 'serv' : id;
  try { const r = await call(id === 'daily' ? 'daily' : 'buy', id === 'daily' ? {} : { crate: id, n }); setProf(r); await playOpen(H.crate(cid), r.cards, before); if (screen === 'shop') openShop(); }
  catch (e) { toast(e.message); sfx.bad(); } finally { buying = false; }
}
function playOpen(crate, cards, before) {
  return new Promise((resolve) => {
    const ov = document.createElement('div'); ov.className = 'open'; ov.style.setProperty('--cc', crate.accent);
    ov.innerHTML = `<div class="cr"><span class="beam"></span>${A.crateSVG(crate)}</div><div class="drops"></div><button class="btn" id="opFin" type="button" hidden>Pokračovat</button>`; document.body.appendChild(ov);
    const cr = ov.querySelector('.cr'), drops = ov.querySelector('.drops'); const seen = { ...before };
    sfx.crate(); cr.classList.add('shake'); setTimeout(() => { cr.classList.add('go'); sfx.pop(); }, 600);
    cards.forEach((id, i) => setTimeout(() => {
      const it = H.item(id), isNew = !seen[id]; seen[id] = { n: 1 }; const el = document.createElement('div'); el.className = 'drop r' + (it.tier - 1); el.innerHTML = cardHTML(it, { tag: 'div', extra: isNew ? '<span class="newtag">NOVÁ</span>' : '' }); drops.appendChild(el); sfx.land(it.tier - 1);
    }, 1050 + i * 320));
    setTimeout(() => { const b = ov.querySelector('#opFin'); b.hidden = false; b.onclick = () => { ov.remove(); resolve(); }; }, 1050 + cards.length * 320 + 250);
  });
}

// ------------------------------------------------------------------ kampaň
function openCamp() {
  show('camp'); const s = $('camp'), m = my();
  s.innerHTML = `${bar('Kampaň')}<div class="wrap">${C.CHAPTERS.map((ch, ci) => `<div class="chap"><svg class="chbg" viewBox="0 130 1100 210" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${A.arenaBG(ch.theme, `c${ci}`)}</svg><h3>${ci + 1}. ${esc(ch.name)}</h3><small>${esc(ch.blurb)}</small><div class="path">${C.MISSIONS.filter((x) => x.ch === ci).map((x) => `<button class="node ${x.idx < m.camp ? 'done' : x.idx === m.camp ? 'cur' : 'lock'} ${x.boss ? 'boss' : ''}" data-m="${x.idx}" type="button"><span class="dot">${x.idx < m.camp ? '✓' : x.title}</span><span>${esc(x.name)}</span></button>`).join('')}</div></div>`).join('')}</div>`;
  wireGo(s);
  for (const b of s.querySelectorAll('[data-m]')) b.onclick = () => { sfx.click(); missionInfo(+b.dataset.m); };
}
function missionInfo(idx) {
  const mi = C.MISSIONS[idx], m = my(); if (idx > m.camp) return toast('Tahle mise je zamčená. Nejdřív porazíš předchozí.');
  const es = H.mechStats(mi.build, mi.inv), ms = H.mechStats(m.build, m.inv), done = idx < m.camp, cr = H.crate(mi.crate), err = H.buildError(m.build, m.inv);
  const d = openModal(`<h2>${mi.title} · ${esc(mi.name)}${mi.boss ? ' <span class="rbadge" style="--rc:var(--red)">BOSS</span>' : ''}</h2><div class="vs"><div>${A.robotSVGFull(m.build, m.inv)}<div class="chips"><span class="chip">Ty · síla ${H.power(m.build, m.inv)}</span><span class="chip">${ms.hp} HP</span><span class="chip">${ms.ap} TB</span></div></div><div class="flip">${A.robotSVGFull(mi.build, mi.inv)}<div class="chips" style="justify-content:flex-end"><span class="chip">${esc(mi.name)} · síla ${H.power(mi.build, mi.inv)}</span><span class="chip">${es.hp} HP</span><span class="chip">${es.ap} TB</span></div></div></div>
  <p style="color:var(--dim)">Výzbroj soupeře: ${es.weapons.map((w) => esc(w.name)).join(', ') || 'žádná'}${es.drone ? ', dron ' + esc(es.drone.name) : ''}.</p>
  <p>${done ? `Odměna za opakování: <b class="rew" style="font-size:16px">${mi.repeatCoins} coinů</b>` : `Odměna za první vítězství: <b class="rew" style="font-size:16px">${mi.coins} coinů</b> a ${esc(cr.name)}`}</p>${err ? `<p class="err">${esc(err)} Oprav sestavu v garáži.</p>` : ''}
  <div class="acts"><button class="btn" id="go" type="button" ${err ? 'disabled' : ''}>Do boje</button><button class="btn alt" data-garage type="button">Garáž</button></div>`);
  d.querySelector('#go').onclick = () => { closeModal(); startOnline({ t: 'campaign', mission: idx }); };
  d.querySelector('[data-garage]').onclick = () => { closeModal(); openGarage(); };
}

// ------------------------------------------------------------------ síť, lobby a souboj
let ws = null, battle = null, room = null, lastStart = null, youIdx = 0;
const sendMsg = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
function closeWs() { if (ws) { const s = ws; ws = null; try { s.close(); } catch (e) { /* nic */ } } }
function connect() {
  closeWs(); return new Promise((resolve, reject) => {
    let done = false; const sock = new WebSocket(CFG.SERVER_URL); ws = sock;
    const to = setTimeout(() => { if (!done) { done = true; try { sock.close(); } catch (e) { /* nic */ } reject(new Error('Server neodpovídá (možná se právě budí, zkus to za chvilku).')); } }, 25000);
    sock.onopen = () => { if (done) return; done = true; clearTimeout(to); resolve(); };
    sock.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMsg(m); };
    sock.onclose = () => { if (ws === sock) { ws = null; onClosed(); } if (!done) { done = true; clearTimeout(to); reject(new Error('Nepodařilo se připojit.')); } };
    sock.onerror = () => {};
  });
}
async function startOnline(first) {
  if (!prof || !prof.account) return toast('Nejdřív se načte tvůj účet.');
  const err = H.buildError(my().build, my().inv); if (err) { toast(err); return; }
  try { status('Připojuju se…'); await connect(); sendMsg({ ...first, ...ident(), name: prof.name }); } catch (e) { status(e.message); toast(e.message); }
}
function leaveRoomSilently() { if (ws && room) sendMsg({ t: 'leave' }); closeWs(); room = null; SS.del('mecha_room'); }
function onClosed() {
  if (screen === 'battle' || screen === 'lobby') { const saved = SS.get('mecha_room'); if (saved && battle && !battle.isOver()) { toast('Spojení se přerušilo, připojuju znovu…', 3000); setTimeout(tryResume, 1200); } else backToMenu('Spojení se serverem se přerušilo.'); }
}
async function tryResume() { const saved = SS.get('mecha_room'); if (!saved) return backToMenu(); let r; try { r = JSON.parse(saved); } catch (e) { return backToMenu(); } try { await connect(); sendMsg({ t: 'resume', code: r.code, token: r.token }); } catch (e) { setTimeout(tryResume, 2500); } }
function backToMenu(msg) { closeWs(); room = null; SS.del('mecha_room'); if (battle) { battle.destroy(); battle = null; } show('menu'); status(msg || ''); refreshProfile(); }
function onMsg(m) {
  switch (m.t) {
    case 'joined': youIdx = m.you | 0; SS.set('mecha_room', JSON.stringify({ code: m.code, token: m.token })); return;
    case 'err': if (m.fatal) { if (m.gone) SS.del('mecha_room'); backToMenu(m.msg); } else toast(m.msg); return;
    case 'room': room = m; if (m.phase === 'lobby') renderLobby(); return;
    case 'start': return onStart(m);
    case 'ev': if (battle) battle.onEv(m); return;
    case 'over': if (battle) battle.onOver(m); if (m.reward && m.reward.profile && prof) { prof.mecha = { ...prof.mecha, ...m.reward.profile }; prof.at = Date.now(); paintCoins(); } return;
    case 'rematch': if (battle) battle.onRematch(m); return;
    case 'bad': toast('Tuhle akci teď nejde provést.'); sfx.bad(); if (battle) battle.unlock(); return;
    default:
  }
}
function renderLobby() {
  if (screen !== 'lobby') show('lobby'); const l = $('lobby'), r = room; const mineFirst = !!(r.players[youIdx] && r.players[youIdx].id === r.host);
  const quick = r.kind === 'quick';
  l.innerHTML = `${bar(quick ? 'Rychlý zápas' : 'Místnost')}<div class="lobby">${quick ? '<p>Hledám soupeře… když se nikdo nenajde, nastoupí robot řízený AI.</p>' : `<p>Pošli kód kamarádovi:</p><div class="codebox">${esc(r.code)}</div>`}<div class="plist">${r.players.map((p) => `<div class="pl"><span>${esc(p.name)}</span><span style="color:${p.connected ? 'var(--grn)' : 'var(--red)'}">${p.connected ? 'připraven' : 'odpojen'}</span></div>`).join('')}${r.players.length < 2 ? '<div class="pl" style="opacity:.5"><span>čekám na hráče…</span><span>·</span></div>' : ''}</div>
  <div class="acts" style="justify-content:center">${!quick && mineFirst ? `<button class="btn" id="lbStart" type="button">${r.players.length < 2 ? 'Hrát proti AI' : 'Začít zápas'}</button>` : ''}<button class="btn alt" id="lbLeave" type="button">Odejít</button></div></div>`;
  wireGo(l); const st = $('lbStart'); if (st) st.onclick = () => { sfx.click(); sendMsg({ t: 'start', level: 2 }); }; $('lbLeave').onclick = () => { sfx.click(); backToMenu(); };
}
function onStart(m) {
  lastStart = m; show('battle'); status('');
  if (battle) battle.destroy();
  battle = createBattle($('battle'), { send: sendMsg, toast, sfx, exit: () => backToMenu(), next: (type) => afterBattle(type), kind: room && room.kind, mission: m.mission });
  battle.start(m);
}
function afterBattle(type) {
  const mission = lastStart ? lastStart.mission : -1;
  if (type === 'retry' && mission >= 0) { const idx = mission; closeWs(); room = null; SS.del('mecha_room'); startOnline({ t: 'campaign', mission: idx }); return; }
  if (type === 'next' && mission >= 0) { const idx = Math.min(mission + 1, C.MISSIONS.length - 1); closeWs(); room = null; SS.del('mecha_room'); startOnline({ t: 'campaign', mission: idx }); return; }
  if (type === 'garage') { backToMenu(); openGarage(); return; }
  if (type === 'camp') { backToMenu(); openCamp(); return; }
  backToMenu();
}

// ------------------------------------------------------------------ start
(async () => {
  updateMenu(); await refreshProfile();
  const saved = SS.get('mecha_room'); if (saved) { try { const r = JSON.parse(saved); await connect(); sendMsg({ t: 'resume', code: r.code, token: r.token }); } catch (e) { SS.del('mecha_room'); } }
})();
window.__mecha = { get prof() { return prof; }, show, openGarage, openShop, openCamp, call };
