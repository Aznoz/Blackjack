// MECHA ARÉNA – souboj: SVG aréna (boční pohled, 10 polí), roboti poskládaní z karet, přehrávání událostí ze serveru (střelba, pohyb, skoky, dron, oheň, šok)
// a ovládání tahu. Pravidla počítá server; tady se jen zobrazují a nabízejí se akce podle S.legalActions nad snímkem stavu.
import * as H from './shared.js?v=3';
import * as S from './sim.js?v=3';
import * as C from './campaign.js?v=3';
import * as A from './art.js?v=3';
import { itemLines } from './info.js?v=3';

const NS = 'http://www.w3.org/2000/svg';
const TILE = 100, X0 = 50, GY = 332, SC = 0.96, VW = 1100, VH = 440, BOT = 408, TURN_S = 75;
const TC = { kin: '#ffcf5a', nrg: '#5ee0ff', exp: '#ff8a5a' };
const VIS = {
  mg: { k: 'trace', col: '#ffd45a', ms: 150, gap: 90 }, shot: { k: 'trace', col: '#ffd45a', ms: 170, gap: 25, spread: 1 }, turret: { k: 'trace', col: '#ffd45a', ms: 150, gap: 120 }, snip: { k: 'trace', col: '#ffffff', ms: 110, gap: 160, len: 90, w: 3 },
  rail: { k: 'beam', col: '#ffe2a0', w: 7, ms: 280, gap: 160, shake: 1 }, laser: { k: 'beam', col: '#7af0ff', w: 3.5, ms: 220, gap: 160 }, plas: { k: 'orb', col: '#7af0ff', r: 9, ms: 240, gap: 160 }, pcan: { k: 'orb', col: '#8af4ff', r: 15, ms: 300, gap: 160 },
  tesla: { k: 'bolt', col: '#9ae6ff', ms: 240, gap: 160 }, emp: { k: 'ring', col: '#b89cff', ms: 320, gap: 160 },
  rocket: { k: 'rocket', col: '#ff9a4a', ms: 400, gap: 160, arc: 30 }, micro: { k: 'rocket', col: '#ff9a4a', ms: 360, gap: 80, arc: 50, small: 1 }, mortar: { k: 'rocket', col: '#ffb060', ms: 700, gap: 160, arc: 230 },
  flame: { k: 'flame', col: '#ff8a30', ms: 320, gap: 160 }, blade: { k: 'melee', col: '#7af0ff', gap: 160 }, hammer: { k: 'melee', col: '#ffd45a', heavy: 1, gap: 160 },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, document.hidden ? 0 : ms));
const cxOf = (x) => X0 + x * TILE + TILE / 2;
const BASEY = GY + 8 - 233 * SC;   // y počátku robota (v souřadnicích robota je zem ve 233)

export function createBattle(root, hooks) {
  let dead = false, you = 0, players = [], stats = [], view = null, theme = 'junk', chain = Promise.resolve(), over = false, busy = true, deadline = 0, hoverW = null, jumpMode = false, tgtPick = null, endInfo = null, rematchSent = false, lastLog = '';
  const pos = [0, 0], jy = [0, 0], shk = [[0, 0], [0, 0]], blink = [0, 0], cam = { x: 0, w: VW, tx: 0, tw: VW }, bob = { t: 0 };
  let svg, bgF, bgM, fxg, botG = [], drnG = [], gsh = [], tilesG, tileEls = [], stripEls = [], elHud, elActs, elLog, elBanner, elArena, raf = 0, tmr = 0, shake = 0;
  const narrow = () => root.clientWidth < 700;
  const face = (i) => (pos[1 - i] >= pos[i] ? 1 : -1);

  // ------------------------------------------------------------ stavba
  function build() {
    const sides = [0, 1];
    root.innerHTML = `<div class="hz-bar"></div><div class="hud">${sides.map((i) => `<div class="hp ${i === 0 ? 'lft' : 'rgt'} ${i === you ? 'own' : 'opp'}" data-s="${i}"><div class="nm"></div><div class="bar2"><i class="hpf"></i><i class="shf"></i><em></em></div><div class="bar2 thin"><i class="enf"></i></div><div class="pips"></div><div class="sts"></div></div>`).join('').replace('</div></div><div class="hp rgt', '</div></div><div class="mid"><span class="rd"></span><b class="tm"></b></div><div class="hp rgt')}</div>
    <div class="arena"><svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMax meet"></svg><div class="banner"></div></div><div class="log"></div><div class="acts2"></div>`;
    elHud = root.querySelector('.hud'); elArena = root.querySelector('.arena'); elBanner = root.querySelector('.banner'); elLog = root.querySelector('.log'); elActs = root.querySelector('.acts2'); svg = elArena.querySelector('svg');
    const tiles = Array.from({ length: H.ARENA.len }, (_, i) => `<rect class="floor" x="${X0 + i * TILE + 2}" y="${GY}" width="${TILE - 4}" height="12" fill="#fff" opacity="${i % 2 ? 0.05 : 0.09}"/>`).join('');
    const botHtml = (i) => `<g class="bot" data-i="${i}"><g class="gsh"><ellipse cx="100" cy="125" rx="78" ry="112" fill="rgba(74,168,255,.12)" stroke="#4aa8ff" stroke-width="3" opacity="0"/></g><g class="in">${A.robotSVG(players[i].build, players[i].inv, { team: i === you ? '#ffb000' : '#ff4d3d' })}</g></g>`;
    svg.innerHTML = `${A.arenaBG(theme)}${tiles}<g id="drn0"></g><g id="drn1"></g>${botHtml(0)}${botHtml(1)}<g id="fx"></g><g id="tiles"></g>`;
    bgF = svg.querySelector('#bgf'); bgM = svg.querySelector('#bgm'); fxg = svg.querySelector('#fx'); tilesG = svg.querySelector('#tiles'); botG = [...svg.querySelectorAll('.bot')]; drnG = [svg.querySelector('#drn0'), svg.querySelector('#drn1')]; gsh = botG.map((b) => b.querySelector('.gsh ellipse'));
    tilesG.innerHTML = Array.from({ length: H.ARENA.len }, (_, i) => `<rect class="tilehit" data-t="${i}" x="${X0 + i * TILE + 2}" y="${GY - 200}" width="${TILE - 4}" height="214" fill="transparent"/><rect class="strip" x="${X0 + i * TILE + 2}" y="${GY}" width="${TILE - 4}" height="12" fill="none" pointer-events="none"/>`).join('');
    tileEls = [...tilesG.querySelectorAll('.tilehit')]; stripEls = [...tilesG.querySelectorAll('.strip')]; for (const t of tileEls) t.onclick = () => onTile(+t.dataset.t);
    fit(); if (ro) { ro.disconnect(); ro.observe(elArena); }
  }
  // aréna vyplní zbytek obrazovky (žádný pevný poměr stran) – výška výřezu se dopočítá z jejího skutečného poměru, takže se nikdy neořízne a nic neskroluje
  let asp = 2.5;
  function fit() { if (!elArena) return; const w = elArena.clientWidth, h = elArena.clientHeight; if (w > 20 && h > 20) asp = w / h; }
  const onResize = () => fit(); window.addEventListener('resize', onResize);
  let ro = null; try { ro = new ResizeObserver(() => fit()); } catch (x) { /* starší prohlížeč */ }

  // ------------------------------------------------------------ vykreslování (každý snímek)
  function frame(now) {
    if (dead) return; raf = requestAnimationFrame(frame); bob.t = now / 1000;
    for (let i = 0; i < 2; i++) {
      const cx = cxOf(pos[i]), dx = shk[i][0], dy = shk[i][1], y = BASEY + dy - jy[i];
      botG[i].setAttribute('transform', face(i) === 1 ? `translate(${cx - 100 * SC + dx} ${y}) scale(${SC})` : `translate(${cx + 100 * SC + dx} ${y}) scale(${-SC} ${SC})`);
      botG[i].style.opacity = blink[i] > now ? (Math.floor(now / 55) % 2 ? 0.35 : 1) : 1;
      const d = drnG[i].firstChild; if (d) { const dir = face(i), bx = cx - dir * 64, by = GY - 175 * SC - 30 + Math.sin(bob.t * 2.4 + i) * 6 - jy[i] * 0.4; d.setAttribute('transform', `translate(${(d._ox ?? bx) + (d._fx || 0)} ${(d._oy ?? by)})`); d._tx = bx; d._ty = by; if (d._ox === undefined || d._snap) { d._ox = bx; d._oy = by; d._snap = 0; } else { d._ox += (bx - d._ox) * 0.2; d._oy += (by - d._oy) * 0.2; } }
    }
    const lo = Math.min(cxOf(pos[0]), cxOf(pos[1])), hi = Math.max(cxOf(pos[0]), cxOf(pos[1]));
    const minW = 330 * asp;   // aspoň 330 jednotek na výšku (roboti + čísla nad nimi)
    cam.tw = Math.max(clamp(hi - lo + (narrow() ? 230 : 380), narrow() ? 470 : 520, VW), minW); cam.tx = (lo + hi) / 2 - cam.tw / 2;
    cam.w += (cam.tw - cam.w) * 0.14; cam.x += (cam.tx - cam.x) * 0.14;
    const w = Math.max(cam.w, minW), h = w / asp, sx = shake > 0 ? (Math.random() - 0.5) * shake : 0; shake = Math.max(0, shake - 1.2);
    const x = w >= VW + 100 ? (VW - w) / 2 : clamp(cam.x, -50, VW + 50 - w);
    svg.setAttribute('viewBox', `${(x + sx).toFixed(1)} ${(BOT - h + sx).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
    if (bgF) { bgF.setAttribute('transform', `translate(${(x * 0.72).toFixed(1)} 0)`); bgM.setAttribute('transform', `translate(${(x * 0.38).toFixed(1)} 0)`); }
  }
  function renderDrones() {
    for (let i = 0; i < 2; i++) {
      const d = view.sides[i].drone, g = drnG[i];
      if (!d) { g.innerHTML = ''; continue; }
      if (!g.firstChild) { g.innerHTML = `<g class="d"><g class="dd">${A.droneSVG(d.dtype, (H.item(d.id) || { tier: 1 }).tier)}</g><rect x="-18" y="26" width="36" height="5" fill="#05080b" stroke="#2c3946"/><rect class="dh" x="-18" y="26" width="36" height="5" fill="#6ce08f"/></g>`; g.firstChild._snap = 1; }
      g.querySelector('.dh').setAttribute('width', 36 * clamp(d.hp / d.maxHp, 0, 1)); g.querySelector('.dd').setAttribute('transform', 'scale(.8)');
    }
  }
  function renderHud() {
    for (const el of elHud.querySelectorAll('.hp')) {
      const i = +el.dataset.s, s = view.sides[i], p = players[i];
      el.querySelector('.nm').textContent = (i === you ? 'TY · ' : '') + p.name; el.querySelector('.hpf').style.width = (100 * clamp(s.hp / s.maxHp, 0, 1)) + '%';
      const sh = el.querySelector('.shf'); sh.style.width = s.maxSh ? (100 * clamp(s.sh / s.maxSh, 0, 1)) + '%' : '0'; el.querySelector('em').textContent = `${Math.max(0, Math.ceil(s.hp))} / ${s.maxHp}${s.maxSh ? '  +' + Math.ceil(s.sh) : ''}`;
      el.querySelector('.enf').style.width = (100 * clamp(s.en / Math.max(1, s.maxEn), 0, 1)) + '%'; el.querySelector('.enf').title = `Energie ${Math.floor(s.en)} / ${s.maxEn}`;
      el.querySelector('.pips').innerHTML = Array.from({ length: Math.max(s.apMax, s.ap) }, (_, k) => `<i class="pip ${k < s.ap ? 'on' : ''}"></i>`).join('');
      const st = []; if (s.burn) st.push(`<span class="st">HOŘÍ ${s.burn.t}×</span>`); if (s.shocked) st.push(`<span class="st b">ŠOK</span>`); if (s.guard) st.push(`<span class="st g">ŠTÍT −25 %</span>`); if (s.ev) st.push(`<span class="st g">ÚHYB +${s.ev}</span>`); if (s.drone) st.push(`<span class="st b">DRON ${Math.ceil(s.drone.hp)}</span>`);
      st.unshift(`<span class="st b">EN ${Math.floor(s.en)}</span>`); el.querySelector('.sts').innerHTML = st.join('');
      gsh[i].setAttribute('opacity', s.guard ? 1 : 0);
    }
    elHud.querySelector('.rd').textContent = `Kolo ${view.round} / ${S.ROUND_LIMIT}`;
  }
  function renderTiles() {
    const mine = view && !over && view.turn === you && !busy; const s = view && view.sides[you], o = view && view.sides[1 - you];
    tileEls.forEach((t, i) => {
      let cls = 'tilehit'; if (mine && s) {
        if (jumpMode) { const a = legal().find((l) => l.t === 'jump' && s.x + l.dir * l.n === i); if (a) cls += ' tile-jmp'; }
        else { const w = hoverW && stats[you].weapons.find((x) => x.slot === hoverW); if (w) { const d = Math.abs(i - s.x); if (i !== s.x && d >= w.rng[0] && d <= (w.rng[1] > 1 ? w.rng[1] + stats[you].rngb : w.rng[1])) cls += ' tile-rng'; } }
      }
      t.setAttribute('class', cls); stripEls[i].setAttribute('fill', cls.includes('tile-rng') ? '#ff4d3d' : cls.includes('tile-jmp') ? '#4aa8ff' : 'none'); stripEls[i].setAttribute('opacity', 0.85);
    });
  }
  // ------------------------------------------------------------ pseudo-stav pro pravidla
  function pseudo() { return { over: view.over, turn: view.turn, round: view.round, sides: view.sides.map((s, i) => ({ x: s.x, hp: s.hp, maxHp: s.maxHp, ap: s.ap, en: s.en, used: Object.fromEntries(s.used.map((k) => [k, true])), guard: s.guard, repLeft: s.repLeft, droneUsed: s.droneUsed, drone: s.drone, st: stats[i] })) }; }
  const legal = () => (view && !view.over ? S.legalActions(pseudo(), you) : []);
  const hitChance = (w) => { const o = view.sides[1 - you], ost = stats[1 - you], jam = o.drone && o.drone.dtype === 'jam' ? 0 : 0; const myJam = view.sides[1 - you].drone && view.sides[1 - you].drone.dtype === 'jam' ? ost.drone.jam : 0; const ev = clamp(ost.evade + o.ev, 0, 75); return clamp(w.acc + (stats[you].acc - H.BASE.acc) - (w.fx && w.fx.arc ? 0 : ev) - myJam + jam, 15, 98); };
  const walkTo = (dir) => { const s = view.sides[you], o = view.sides[1 - you]; let x = s.x; for (let k = 0; k < stats[you].spd; k++) { const nx = x + dir; if (nx < 0 || nx >= H.ARENA.len || nx === o.x) break; x = nx; } return x; };

  // ------------------------------------------------------------ ovládání tahu
  // ikony akcí (SVG, žádné emoji)
  const IC = {
    fwd: '<svg viewBox="0 0 48 48"><path d="M8 12l14 12L8 36zM24 12l14 12-14 12z" fill="currentColor"/></svg>',
    back: '<svg viewBox="0 0 48 48" style="transform:scaleX(-1)"><path d="M8 12l14 12L8 36zM24 12l14 12-14 12z" fill="currentColor"/></svg>',
    jump: '<svg viewBox="0 0 48 48"><path d="M6 38Q24 -6 42 38" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 7"/><path d="M36 26l8 14-16-3z" fill="currentColor"/><rect x="16" y="30" width="14" height="10" rx="2" fill="currentColor"/><path d="M19 42l3 5 3-5z" fill="#ffb000"/></svg>',
    guard: '<svg viewBox="0 0 48 48"><path d="M24 4l16 6v12c0 11-7 18-16 22C15 40 8 33 8 22V10z" fill="currentColor"/><path d="M24 11l9 3v8c0 6-4 11-9 14-5-3-9-8-9-14v-8z" fill="#0d1217" opacity=".55"/></svg>',
    repair: '<svg viewBox="0 0 48 48"><rect x="17" y="6" width="14" height="36" rx="3" fill="currentColor"/><rect x="6" y="17" width="36" height="14" rx="3" fill="currentColor"/><circle cx="24" cy="24" r="5" fill="#0d1217" opacity=".5"/></svg>',
    end: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="4"/><path d="M17 14v20l17-10z" fill="currentColor"/></svg>',
  };
  const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true;
  const showTip = (btn, html) => { tip.innerHTML = html; tip.hidden = false; root.appendChild(tip); const r = btn.getBoundingClientRect(), pr = root.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight; let x = r.left - pr.left + r.width / 2 - tw / 2; x = clamp(x, 6, pr.width - tw - 6); let y = r.top - pr.top - th - 8; if (y < 4) y = r.bottom - pr.top + 8; tip.style.left = x + 'px'; tip.style.top = y + 'px'; };
  const hideTip = () => { tip.hidden = true; };
  function ibtn(o) {
    return `<button class="ib ${o.cls || ''}" type="button" data-k="${o.key}" style="--tc:${o.tc || 'var(--amber)'}" ${o.dis ? 'data-dis="1"' : ''}><span class="ic">${o.icon}</span>${o.ap != null ? `<i class="ap">${o.ap}</i>` : ''}${o.en != null ? `<i class="en">${o.en}</i>` : ''}${o.pc != null ? `<i class="pc">${o.pc}%</i>` : ''}<span class="lb">${o.label}</span></button>`;
  }
  function renderActs() {
    if (!view) return; const mine = view.turn === you && !over; hideTip();
    elActs.className = 'acts2' + (mine && !busy ? ' mine' : '');
    if (over) { elActs.innerHTML = ''; return; }
    if (!mine || busy) { elActs.innerHTML = `<div class="wait">${mine ? 'Probíhá akce…' : 'Tah soupeře…'}</div>`; renderTiles(); return; }
    const L = legal(), s = view.sides[you], o = view.sides[1 - you], st = stats[you], fireL = L.filter((a) => a.t === 'fire');
    const defs = {};   // klíč -> { html tooltipu, akce }
    const grpW = [], grpM = [], grpU = [], grpE = [];
    for (const w of st.weapons) {
      const f = fireL.filter((a) => a.slot === w.slot), d = Math.abs(s.x - o.x), maxR = w.rng[1] > 1 ? w.rng[1] + st.rngb : w.rng[1]; let why = '';
      if (!f.length) why = s.used.includes(w.slot) ? 'Už použito v tomhle tahu.' : s.ap < w.ap ? 'Málo tahových bodů.' : s.en < w.en ? 'Málo energie.' : d < w.rng[0] ? 'Soupeř je příliš blízko.' : d > maxR ? 'Soupeř je mimo dosah.' : '';
      const it = H.item(w.id), ch = hitChance(w);
      defs['w' + w.slot] = { tip: `<b>${esc(w.name)}</b> <span class="sl">${H.SLOT_NAME[w.slot]}</span><div class="chips">${itemLines(it, w.lv).replace(/<span class="chip">váha[^<]*<\/span>/, '')}</div><p>Šance na zásah teď: <b>${ch} %</b>${why ? `<br><span class="why">${why}</span>` : ''}</p>`, dis: !f.length, w, run: () => { hoverW = w.slot; if (f.length > 1) { tgtPick = w; renderActs(); } else send({ t: 'fire', slot: w.slot, tgt: 'mech' }); } };
      grpW.push(ibtn({ key: 'w' + w.slot, icon: A.cardIcon(it), label: esc(it.famName.split(' ')[0]), tc: TC[w.type], ap: w.ap, en: w.en, pc: ch, dis: !f.length, cls: 'wp' }));
    }
    const fwd = o.x > s.x ? 1 : -1, canM = (dir) => L.some((a) => a.t === 'move' && a.dir === dir), canJ = L.some((a) => a.t === 'jump');
    for (const [k, dir, lbl, ic] of [['mf', fwd, 'Vpřed', 'fwd'], ['mb', -fwd, 'Vzad', 'back']]) {
      const to = walkTo(dir), ok = canM(dir);
      defs[k] = { tip: `<b>${lbl}</b><p>Chůze o ${Math.abs(to - s.x)} ${Math.abs(to - s.x) === 1 ? 'pole' : 'pole'} směrem ${dir === fwd ? 'k soupeři' : 'od soupeře'}. Stojí 1 tahový bod.</p>${ok ? '' : '<p class="why">Tam se jít nedá.</p>'}`, dis: !ok, run: () => send({ t: 'move', dir }) };
      grpM.push(ibtn({ key: k, icon: dir === 1 ? IC.fwd : IC.back, label: lbl, ap: 1, dis: !ok }));
    }
    defs.jump = { tip: `<b>Skok</b><p>Přeskočí až ${st.jmp} ${st.jmp === 1 ? 'pole' : 'pole'}, i přes soupeře. Stojí 1 tahový bod a 2 energie. Do konce tahu máš +15 % úhybu.</p><p>Po klepnutí vyber modré pole.</p>${canJ ? '' : '<p class="why">Teď se skákat nedá.</p>'}`, dis: !canJ, run: () => { jumpMode = !jumpMode; hoverW = null; renderActs(); } };
    grpM.push(ibtn({ key: 'jump', icon: IC.jump, label: 'Skok', ap: 1, en: 2, dis: !canJ, cls: jumpMode ? 'on' : '' }));
    const canG = L.some((a) => a.t === 'guard');
    defs.guard = { tip: `<b>Štít</b><p>Do konce kola jsou zásahy o 25 % slabší. Stojí 1 tahový bod.</p>${s.guard ? '<p class="why">Štít už držíš.</p>' : ''}`, dis: !canG, run: () => send({ t: 'guard' }) };
    grpU.push(ibtn({ key: 'guard', icon: IC.guard, label: 'Štít', ap: 1, dis: !canG, tc: '#7ac8ff' }));
    if (st.rep) { const rp = L.some((a) => a.t === 'repair'); defs.rep = { tip: `<b>Oprava</b><p>Nano-opravář vyléčí ${st.rep} HP. Stojí 1 tahový bod a 2 energie, zbývá ${s.repLeft} použití.</p>${rp ? '' : '<p class="why">Teď to nejde (plné životy, málo energie nebo bez použití).</p>'}`, dis: !rp, run: () => send({ t: 'repair' }) }; grpU.push(ibtn({ key: 'rep', icon: IC.repair, label: 'Oprava', ap: 1, en: 2, dis: !rp, tc: '#6ce08f' })); }
    if (st.drone) { const dr = L.some((a) => a.t === 'drone'), dit = H.item(st.drone.id); defs.drone = { tip: `<b>Vyslat dron</b> <span class="sl">${esc(st.drone.name)}</span><div class="chips">${itemLines(dit, st.drone.lv)}</div>${s.droneUsed ? '<p class="why">Dron už byl vyslán.</p>' : dr ? '' : '<p class="why">Teď to nejde (málo TB nebo energie).</p>'}`, dis: !dr, run: () => send({ t: 'drone' }) }; grpU.push(ibtn({ key: 'drone', icon: A.cardIcon(dit), label: 'Dron', ap: st.drone.ap, en: st.drone.en, dis: !dr, tc: '#c070ff' })); }
    defs.end = { tip: `<b>Konec tahu</b><p>Dron zasáhne, energie se dobije a táhne soupeř. Nevyužité tahové body propadnou.</p>`, run: () => send({ t: 'end' }) };
    grpE.push(ibtn({ key: 'end', icon: IC.end, label: 'Konec', tc: '#ff4d3d', cls: 'end' + (L.length <= 1 || s.ap === 0 ? ' rec' : '') }));
    elActs.innerHTML = `${tgtPick ? `<div class="tgt">Cíl zbraně <b>${esc(tgtPick.name)}</b>: <button class="btn sm" data-tg="mech" type="button">Robot</button><button class="btn sm alt" data-tg="drone" type="button">Dron</button><button class="btn sm alt" data-tg="x" type="button">Zrušit</button></div>` : ''}<div class="igrid"><div class="grp">${grpW.join('') || '<div class="wait">Nemáš žádnou zbraň.</div>'}</div><div class="sep"></div><div class="grp">${grpM.join('')}</div><div class="sep"></div><div class="grp">${grpU.join('')}</div><div class="grow"></div><div class="grp">${grpE.join('')}</div></div><div class="hint">Najeď na ikonu (na telefonu ji podrž) a uvidíš podrobnosti.</div>`;
    for (const b of elActs.querySelectorAll('.ib')) {
      const d = defs[b.dataset.k]; let lp = false, timer = 0;
      b.onpointerenter = (e) => { if (e.pointerType === 'mouse') { showTip(b, d.tip); if (d.w) { hoverW = d.w.slot; renderTiles(); } } };
      b.onpointerleave = () => { clearTimeout(timer); hideTip(); if (d.w) { hoverW = null; renderTiles(); } };
      b.onpointerdown = (e) => { if (e.pointerType === 'mouse') return; lp = false; clearTimeout(timer); timer = setTimeout(() => { lp = true; showTip(b, d.tip); if (d.w) { hoverW = d.w.slot; renderTiles(); } if (navigator.vibrate) { try { navigator.vibrate(15); } catch (x) { /* nic */ } } }, 380); };
      const endPress = () => { clearTimeout(timer); if (lp) setTimeout(() => { hideTip(); if (d.w) { hoverW = null; renderTiles(); } }, 1400); };
      b.onpointerup = endPress; b.onpointercancel = () => { clearTimeout(timer); lp = false; hideTip(); };
      b.oncontextmenu = (e) => e.preventDefault();
      b.onclick = () => { if (lp) { lp = false; return; } hideTip(); if (d.dis) { showTip(b, d.tip); setTimeout(hideTip, 1800); hooks.sfx.bad(); return; } d.run(); };
    }
    for (const b of elActs.querySelectorAll('[data-tg]')) b.onclick = () => { const w = tgtPick; tgtPick = null; if (b.dataset.tg === 'x') return renderActs(); send({ t: 'fire', slot: w.slot, tgt: b.dataset.tg }); };
    renderTiles();
    if (L.length === 1 && s.ap === 0) setTimeout(() => { if (!dead && !busy && view && view.turn === you && !over && S.legalActions(pseudo(), you).length === 1) send({ t: 'end' }); }, 700);
  }
  function onTile(i) { if (busy || over || !view || view.turn !== you || !jumpMode) return; const s = view.sides[you]; const a = legal().find((l) => l.t === 'jump' && s.x + l.dir * l.n === i); if (a) send({ t: 'jump', dir: a.dir, n: a.n }); }
  function send(a) { busy = true; jumpMode = false; tgtPick = null; hoverW = null; hooks.sfx.click(); hooks.send({ t: 'act', a }); renderActs(); }
  function unlock() { busy = false; jumpMode = false; tgtPick = null; renderActs(); }

  // ------------------------------------------------------------ efekty
  function mk(tag, at, parent = fxg) { const e = document.createElementNS(NS, tag); for (const k of Object.keys(at)) e.setAttribute(k, at[k]); parent.appendChild(e); return e; }
  function tween(ms, fn) { return new Promise((res) => { if (dead || document.hidden) { fn(1); return res(); } const t0 = performance.now(); const step = (now) => { if (dead) return res(); const k = Math.min(1, (now - t0) / ms); fn(k); if (k < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); }); }
  function float(x, y, txt, col, size = 30) { size = Math.round(size * clamp(cam.w / 1000, 0.62, 1.15)); const t = mk('text', { x, y, 'text-anchor': 'middle', 'font-size': size, fill: col, class: 'fl' }); t.textContent = txt; tween(950, (k) => { t.setAttribute('y', y - 60 * ease(k)); t.setAttribute('opacity', k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3); }).then(() => t.remove()); }
  const bodyPos = (i) => [cxOf(pos[i]), BASEY + 112 * SC - jy[i]];
  const dronePos = (i) => { const d = drnG[i].firstChild; return d && d._ox !== undefined ? [d._ox, d._oy] : bodyPos(i); };
  function muzzlePos(i, slot, fam) { const [mx, my] = A.muzzle(slot, fam), cx = cxOf(pos[i]); return [face(i) === 1 ? cx - 100 * SC + mx * SC : cx + 100 * SC - mx * SC, BASEY - jy[i] + my * SC]; }
  const hurt = (i, k = 1) => { blink[i] = performance.now() + 260; shk[i] = [(Math.random() - 0.5) * 14 * k, (Math.random() - 0.5) * 6 * k]; setTimeout(() => { shk[i] = [0, 0]; }, 110); };
  const recoil = (i) => { shk[i] = [-face(i) * 7, 0]; setTimeout(() => { shk[i] = [0, 0]; }, 90); };
  function burst(x, y, col, n = 7, r = 26) { for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, l = r * (0.6 + Math.random() * 0.7), e = mk('line', { x1: x, y1: y, x2: x, y2: y, stroke: col, 'stroke-width': 3, 'stroke-linecap': 'round' }); tween(260, (t) => { const q = ease(t); e.setAttribute('x1', x + Math.cos(a) * l * q * 0.5); e.setAttribute('y1', y + Math.sin(a) * l * q * 0.5); e.setAttribute('x2', x + Math.cos(a) * l * q); e.setAttribute('y2', y + Math.sin(a) * l * q); e.setAttribute('opacity', 1 - t); }).then(() => e.remove()); } }
  function ring(x, y, col, r0 = 8, r1 = 60, ms = 340, fill = 'none') { const c = mk('circle', { cx: x, cy: y, r: r0, fill, stroke: col, 'stroke-width': 4 }); return tween(ms, (t) => { c.setAttribute('r', r0 + (r1 - r0) * ease(t)); c.setAttribute('opacity', 1 - t); }).then(() => c.remove()); }
  function boom(x, y, big = 1) { const c = mk('circle', { cx: x, cy: y, r: 6, fill: '#ffb060', filter: 'url(#fxglow)' }); const c2 = mk('circle', { cx: x, cy: y, r: 3, fill: '#fff6d0' }); hooks.sfx.boom(); shake = Math.max(shake, 8 * big); tween(420, (t) => { const q = ease(t); c.setAttribute('r', 8 + 52 * big * q); c.setAttribute('opacity', 1 - t); c2.setAttribute('r', 4 + 28 * big * q); c2.setAttribute('opacity', 1 - t * 1.4 < 0 ? 0 : 1 - t * 1.4); }).then(() => { c.remove(); c2.remove(); }); burst(x, y, '#ffcf5a', 9, 60 * big); }
  async function projectile(v, from, to, miss) {
    const ang = Math.atan2(to[1] - from[1], to[0] - from[0]), end = miss ? [to[0] + Math.cos(ang) * 120 + (Math.random() - 0.5) * 40, to[1] - 50 + Math.random() * 20] : to;
    switch (v.k) {
      case 'trace': { const g = mk('g', {}), len = v.len || 26, l = mk('line', { x1: -len, y1: 0, x2: 0, y2: 0, stroke: v.col, 'stroke-width': v.w || 2.5, 'stroke-linecap': 'round', filter: 'url(#fxglow)' }, g); const sp = v.spread ? (Math.random() - 0.5) * 50 : 0; await tween(v.ms, (k) => { const x = from[0] + (end[0] - from[0]) * k, y = from[1] + (end[1] + sp - from[1]) * k; g.setAttribute('transform', `translate(${x} ${y}) rotate(${ang * 57.3})`); }); g.remove(); l.remove(); break; }
      case 'beam': { const l = mk('line', { x1: from[0], y1: from[1], x2: end[0], y2: end[1], stroke: v.col, 'stroke-width': v.w, 'stroke-linecap': 'round', opacity: 0.95, filter: 'url(#fxglow)' }); const l2 = mk('line', { x1: from[0], y1: from[1], x2: end[0], y2: end[1], stroke: '#fff', 'stroke-width': v.w * 0.35, 'stroke-linecap': 'round' }); if (v.shake) shake = 7; await tween(v.ms, (k) => { l.setAttribute('opacity', 1 - k); l2.setAttribute('opacity', 1 - k); l.setAttribute('stroke-width', v.w * (1 - k * 0.6)); }); l.remove(); l2.remove(); break; }
      case 'orb': { const c = mk('circle', { r: v.r, fill: v.col, opacity: 0.95, filter: 'url(#fxglow)' }); const c2 = mk('circle', { r: v.r * 0.45, fill: '#fff' }); await tween(v.ms, (k) => { const x = from[0] + (end[0] - from[0]) * k, y = from[1] + (end[1] - from[1]) * k; c.setAttribute('cx', x); c.setAttribute('cy', y); c2.setAttribute('cx', x); c2.setAttribute('cy', y); }); c.remove(); c2.remove(); break; }
      case 'bolt': { const p = mk('polyline', { fill: 'none', stroke: v.col, 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', filter: 'url(#fxglow)' }); const pts = []; const n = 8; for (let k = 0; k <= n; k++) { const t = k / n; pts.push([from[0] + (end[0] - from[0]) * t + (k && k < n ? (Math.random() - 0.5) * 34 : 0), from[1] + (end[1] - from[1]) * t + (k && k < n ? (Math.random() - 0.5) * 34 : 0)]); } p.setAttribute('points', pts.map((q) => q.join(',')).join(' ')); await tween(v.ms, (k) => p.setAttribute('opacity', 1 - k * k)); p.remove(); break; }
      case 'ring': { const c = mk('circle', { cx: from[0], cy: from[1], r: 6, fill: 'none', stroke: v.col, 'stroke-width': 4 }); await tween(v.ms, (k) => { c.setAttribute('cx', from[0] + (end[0] - from[0]) * k); c.setAttribute('cy', from[1] + (end[1] - from[1]) * k); c.setAttribute('r', 6 + 26 * k); c.setAttribute('opacity', 1 - k * 0.5); }); c.remove(); break; }
      case 'rocket': { const g = mk('g', {}); mk('rect', { x: -10, y: -3, width: 16, height: 6, rx: 3, fill: '#d8dde2' }, g); mk('polygon', { points: '6,-3 13,0 6,3', fill: v.col }, g); const fl = mk('polygon', { points: '-10,-3 -20,0 -10,3', fill: '#ffcf5a' }, g); const sc = v.small ? 0.7 : 1; await tween(v.ms, (k) => { const x = from[0] + (end[0] - from[0]) * k, y = from[1] + (end[1] - from[1]) * k - Math.sin(Math.PI * k) * v.arc, a = Math.atan2(end[1] - from[1] - Math.cos(Math.PI * k) * Math.PI * v.arc, end[0] - from[0]); g.setAttribute('transform', `translate(${x} ${y}) rotate(${a * 57.3}) scale(${sc})`); if (Math.random() < 0.5) { const sm = mk('circle', { cx: x, cy: y, r: 4, fill: '#9aa3ac', opacity: 0.6 }); tween(300, (t) => { sm.setAttribute('r', 4 + 8 * t); sm.setAttribute('opacity', 0.6 * (1 - t)); }).then(() => sm.remove()); } }); fl.remove(); g.remove(); break; }
      case 'flame': { const n = 10; const ps = []; for (let k = 0; k < n; k++) ps.push(tween(v.ms, (t) => { const tt = clamp(t * 1.2 - k * 0.04, 0, 1); return tt; }).then(() => 0)); for (let k = 0; k < n; k++) { const c = mk('circle', { r: 6, fill: k % 2 ? '#ff7a20' : '#ffcf5a', opacity: 0 }); const off = (Math.random() - 0.5) * 24; setTimeout(() => tween(v.ms, (t) => { c.setAttribute('cx', from[0] + (end[0] - from[0]) * t); c.setAttribute('cy', from[1] + (end[1] + off - from[1]) * t); c.setAttribute('r', 5 + 14 * t); c.setAttribute('opacity', 0.9 * (1 - t * 0.7)); }).then(() => c.remove()), k * 28); } await sleep(v.ms + 280); break; }
      default: await sleep(150);
    }
  }
  function impactFx(v, p, hit, label) { if (!hit) { hooks.sfx.miss(); if (label) float(p[0], p[1] - 30, 'MIMO', '#c9d2da', 22); return; } const exp = v && (v.k === 'rocket'); if (exp) boom(p[0], p[1], v.small ? 0.55 : v.arc > 100 ? 1.3 : 1); else { burst(p[0], p[1], v && v.k === 'bolt' ? '#9ae6ff' : v && v.col || '#ffd45a'); if (v && (v.k === 'orb' || v.k === 'beam' || v.k === 'ring')) ring(p[0], p[1], v.col, 6, 34, 260); } }
  async function animFire(e) {
    const i = e.i, o = 1 - i, it = H.item(e.wid) || { fam: 'mg' }, fam = it.fam, v = VIS[fam] || VIS.mg, from = muzzlePos(i, e.slot, fam), toMech = e.tgt === 'drone' ? dronePos(o) : bodyPos(o);
    if (v.k === 'melee') { const dir = face(i), tx = TILE * 0.55; await tween(160, (k) => { shk[i] = [dir * tx * ease(k), 0]; }); }
    else { recoil(i); const f = mk('circle', { cx: from[0], cy: from[1], r: 12, fill: v.col || '#fff', opacity: 0.9, filter: 'url(#fxglow)' }); tween(120, (t) => { f.setAttribute('r', 12 + 8 * t); f.setAttribute('opacity', 0.9 * (1 - t)); }).then(() => f.remove()); }
    hooks.sfx[(H.item(e.wid) || {}).wp ? it.wp.type : 'kin']?.();
    const jobs = e.hits.map((h, k) => sleep(k * (v.gap || 120)).then(async () => {
      const to = [toMech[0] + (Math.random() - 0.5) * 18, toMech[1] + (Math.random() - 0.5) * 30];
      if (v.k === 'melee') { const sl = mk('path', { d: `M${to[0] - 30} ${to[1] - 40} Q${to[0] + 10} ${to[1]} ${to[0] - 30} ${to[1] + 40}`, fill: 'none', stroke: v.col, 'stroke-width': v.heavy ? 9 : 5, 'stroke-linecap': 'round' }); tween(220, (t) => sl.setAttribute('opacity', 1 - t)).then(() => sl.remove()); if (v.heavy) { shake = 10; ring(to[0], GY + 6, '#ffd45a', 6, 70, 300); } }
      else await projectile(v, from, to, !h.h);
      const fxp = [to[0] + (k - (e.hits.length - 1) / 2) * 30, to[1] - 30 - (k % 2) * 22];
      if (h.h) { hooks.sfx.hit(h.c); impactFx(v, to, 1); hit(o, e.tgt, h); float(fxp[0], fxp[1], (h.d > 0 ? '-' + Math.round(h.d) : '0') + (h.a > 0 ? ' (štít ' + Math.round(h.a) + ')' : ''), h.c ? '#ffe35a' : h.a > 0 && h.d === 0 ? '#7ac8ff' : '#ff7a6a', h.c ? 38 : 28); if (h.c) float(fxp[0], fxp[1] - 30, 'KRIT!', '#ffe35a', 20); } else impactFx(v, [to[0] + 40, to[1]], 0, k === 0 && !e.hits.some((q) => q.h));
    }));
    await Promise.all(jobs);
    const fdir = face(i); if (v.k === 'melee') await tween(160, (k) => { shk[i] = [fdir * TILE * 0.55 * (1 - ease(k)), 0]; }).then(() => { shk[i] = [0, 0]; });
    const fx = e.fx || {}, tp = bodyPos(o);
    if (fx.burn) { float(tp[0], tp[1] - 70, `HOŘÍ ${fx.burn}×`, '#ff9a4a', 22); for (let k = 0; k < 6; k++) setTimeout(() => burst(tp[0] + (Math.random() - 0.5) * 50, tp[1] + (Math.random() - 0.5) * 60, '#ff8a30', 3, 22), k * 60); }
    if (fx.shock) { float(tp[0], tp[1] - 90, 'ŠOK', '#8fd4ff', 26); ring(tp[0], tp[1], '#8fd4ff', 10, 70, 360); }
    if (fx.emp) float(tp[0], tp[1] - 90, `−${fx.emp} EN`, '#b89cff', 24);
    if (fx.push) { const [a, b] = fx.push; await tween(260, (k) => { pos[o] = a + (b - a) * ease(k); }); pos[o] = b; }
    if (fx.droneDown) { const dp = dronePos(o); boom(dp[0], dp[1], 0.6); float(dp[0], dp[1] - 30, 'DRON ZNIČEN', '#ffb060', 20); }
    await sleep(120);
  }
  function hit(o, tgt, h) { if (!view) return; const s = view.sides[o]; hurt(o, h.c ? 1.6 : 1); if (tgt === 'drone') { if (s.drone) s.drone.hp = Math.max(0, s.drone.hp - h.d); } else { s.sh = Math.max(0, s.sh - (h.a || 0)); s.hp = Math.max(0, s.hp - (h.d || 0)); } renderHud(); renderDrones(); }
  function banner(txt, col) { elBanner.textContent = txt; elBanner.style.textShadow = `0 2px 0 #000, 0 0 24px ${col || 'var(--amber)'}`; elBanner.classList.remove('show'); void elBanner.offsetWidth; elBanner.classList.add('show'); }
  const logTxt = (t) => { lastLog = t; elLog.textContent = t; };

  // ------------------------------------------------------------ přehrání událostí
  async function play(evs) {
    for (const e of evs) {
      if (dead) return;
      switch (e.k) {
        case 'turn': { const mine = e.i === you; if (view) { view.turn = e.i; view.round = e.round; } banner(mine ? 'Tvůj tah' : players[e.i].name, mine ? '#ffb000' : '#ff4d3d'); hooks.sfx.turn(); logTxt(`Kolo ${e.round} · táhne ${mine ? 'tvůj robot' : players[e.i].name}${e.shock ? ' (šok: −1 TB)' : ''}`); renderHud(); await sleep(520); break; }
        case 'burn': { const p = bodyPos(e.i); float(p[0], p[1] - 40, '−' + e.d, '#ff9a4a', 28); burst(p[0], p[1], '#ff8a30', 6, 40); hurt(e.i, 0.6); if (view) view.sides[e.i].hp = Math.max(0, view.sides[e.i].hp - e.d); renderHud(); logTxt('Oheň pálí.'); await sleep(420); break; }
        case 'fire': { const w = H.item(e.wid); logTxt(`${players[e.i].name}: ${w ? w.famName : 'zbraň'} · ${e.hits.filter((h) => h.h).length}/${e.hits.length} zásahů`); await animFire(e); break; }
        case 'move': { hooks.sfx.step(); const n = Math.abs(e.to - e.from); for (let k = 0; k < n; k++) { hooks.sfx.step(); } await tween(180 + n * 130, (k) => { pos[e.i] = e.from + (e.to - e.from) * ease(k); jy[e.i] = Math.abs(Math.sin(k * Math.PI * n)) * 6; }); pos[e.i] = e.to; jy[e.i] = 0; logTxt(`${players[e.i].name} jde.`); break; }
        case 'jump': { hooks.sfx.jump(); const p = bodyPos(e.i); await tween(520, (k) => { pos[e.i] = e.from + (e.to - e.from) * ease(k); jy[e.i] = Math.sin(Math.PI * k) * 110; }); pos[e.i] = e.to; jy[e.i] = 0; ring(cxOf(e.to), GY + 6, '#c9d2da', 6, 50, 280); shake = 4; logTxt(`${players[e.i].name} skáče.`); break; }
        case 'guard': { hooks.sfx.guard(); if (view) view.sides[e.i].guard = true; gsh[e.i].setAttribute('opacity', 1); const p = bodyPos(e.i); float(p[0], p[1] - 90, 'ŠTÍT', '#7ac8ff', 24); renderHud(); await sleep(350); break; }
        case 'repair': { hooks.sfx.heal(); const p = bodyPos(e.i); float(p[0], p[1] - 40, '+' + Math.round(e.h), '#6ce08f', 32); for (let k = 0; k < 5; k++) setTimeout(() => burst(p[0] + (Math.random() - 0.5) * 60, p[1] + (Math.random() - 0.5) * 70, '#6ce08f', 2, 20), k * 70); if (view) view.sides[e.i].hp = Math.min(view.sides[e.i].maxHp, view.sides[e.i].hp + e.h); renderHud(); logTxt('Nano-opravář léčí.'); await sleep(450); break; }
        case 'deploy': { hooks.sfx.deploy(); const it = H.item(e.id); if (view) view.sides[e.i].drone = { id: e.id, dtype: it.dr.dtype, hp: stats[e.i].drone.hp, maxHp: stats[e.i].drone.hp }; renderDrones(); const d = drnG[e.i].firstChild; if (d) { d._ox = cxOf(pos[e.i]); d._oy = BASEY + 30; } logTxt(`${players[e.i].name} vysílá dron.`); await sleep(500); break; }
        case 'drone': { const dp = dronePos(e.i), bp = bodyPos(e.i), op = bodyPos(1 - e.i); logTxt(`Dron ${players[e.i].name}`);
          if (e.act === 'atk') { await projectile({ k: 'trace', col: '#ff7a5a', ms: 160 }, dp, op, !e.hit); if (e.hit) { hooks.sfx.hit(0); burst(op[0], op[1], '#ff7a5a'); hit(1 - e.i, 'mech', { d: e.d, a: e.a, c: 0 }); float(op[0], op[1] - 30, '−' + Math.round(e.d), '#ff7a6a', 24); } else float(op[0] + 30, op[1] - 30, 'MIMO', '#c9d2da', 20); }
          else if (e.act === 'rep') { hooks.sfx.heal(); float(bp[0], bp[1] - 40, '+' + Math.round(e.h), '#6ce08f', 28); ring(bp[0], bp[1], '#6ce08f', 10, 60, 360); if (view) view.sides[e.i].hp = Math.min(view.sides[e.i].maxHp, view.sides[e.i].hp + e.h); renderHud(); }
          else if (e.act === 'shd') { hooks.sfx.guard(); float(bp[0], bp[1] - 40, '+' + e.v + ' štít', '#7ac8ff', 24); ring(bp[0], bp[1], '#7ac8ff', 10, 70, 360); }
          else if (e.act === 'jam') { hooks.sfx.nrg(); ring(op[0], op[1], '#c070ff', 10, 80, 400); float(op[0], op[1] - 50, `−${e.lost} EN`, '#c070ff', 22); }
          await sleep(300); break; }
        case 'snap': { view = JSON.parse(JSON.stringify(e.s)); for (let i = 0; i < 2; i++) if (!jy[i] && Math.abs(pos[i] - view.sides[i].x) > 0.01 && !busyMove) pos[i] = view.sides[i].x; renderHud(); renderDrones(); break; }
        case 'end': { endInfo = e; break; }
        default:
      }
    }
  }
  let busyMove = false;
  function afterPlay(snapView, dl) { view = JSON.parse(JSON.stringify(snapView)); for (let i = 0; i < 2; i++) { pos[i] = view.sides[i].x; jy[i] = 0; } renderHud(); renderDrones(); busy = false; jumpMode = false; tgtPick = null; deadline = Date.now() + TURN_S * 1000; renderActs(); }

  // ------------------------------------------------------------ cyklus s hodinami
  function tick() { if (!view || dead) return; const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)), t = elHud.querySelector('.tm'); if (!t) return; if (over) { t.textContent = ''; return; } t.textContent = view.turn === you ? `${left} s` : `soupeř ${left} s`; t.classList.toggle('low', view.turn === you && left <= 10); }

  // ------------------------------------------------------------ API
  function start(m) {
    you = m.you; players = m.players; theme = m.theme || 'junk'; stats = players.map((p) => H.mechStats(p.build, p.inv)); over = false; busy = true; endInfo = null; rematchSent = false;
    build(); pos[0] = H.ARENA.startA; pos[1] = H.ARENA.startB; jy[0] = jy[1] = 0; cam.x = clamp((cxOf(pos[0]) + cxOf(pos[1])) / 2 - VW / 2, 0, VW); cam.w = VW;
    view = { turn: -1, round: 1, over: false, winner: -1, sides: [0, 1].map((i) => ({ x: pos[i], hp: stats[i].hp, maxHp: stats[i].hp, sh: stats[i].shield, maxSh: stats[i].shield, en: stats[i].en, maxEn: stats[i].en, ap: 0, apMax: stats[i].ap, used: [], guard: false, ev: 0, burn: null, shocked: false, repLeft: stats[i].repUses, droneUsed: false, drone: null })) };
    renderHud(); renderDrones(); raf = requestAnimationFrame(frame); tmr = setInterval(tick, 250);
    banner(m.mission >= 0 ? `Mise ${C.MISSIONS[m.mission].title}` : 'Souboj', '#ffb000'); elActs.innerHTML = '<div class="wait">Příprava…</div>';
    if (m.resumed || !m.ev || !m.ev.length) { afterPlay(m.s, m.dl); return; }
    chain = chain.then(() => play(m.ev)).then(() => { if (!dead) afterPlay(m.s, m.dl); });
  }
  function onEv(m) { busy = true; renderActs(); chain = chain.then(() => play(m.ev)).then(() => { if (!dead) afterPlay(m.s, m.dl); }); }
  function onOver(m) { chain = chain.then(async () => { if (dead) return; over = true; renderActs(); renderTiles(); await sleep(500); showResult(m); }); }
  function showResult(m) {
    const win = m.winner === you, draw = m.winner === 2, rw = m.reward || {}; win ? hooks.sfx.win() : draw ? hooks.sfx.turn() : hooks.sfx.lose();
    const why = endInfo && endInfo.forfeit ? (win ? 'Soupeř to vzdal.' : 'Vzdal ses.') : endInfo && endInfo.timeout ? 'Vypršel limit kol, rozhodly životy.' : '';
    const camp = hooks.mission >= 0, idx = hooks.mission, cards = rw.cards || [];
    const el = document.createElement('div'); el.className = 'res';
    el.innerHTML = `<div class="dlg"><h1 class="${win ? 'win' : draw ? '' : 'lose'}">${win ? 'Vítězství' : draw ? 'Remíza' : 'Porážka'}</h1><p style="color:var(--dim)">${esc(why)}</p>
    <div class="rew">+${rw.coins || 0} coinů</div>${rw.first ? `<p style="color:var(--grn)">První vítězství v téhle misi!${rw.crate ? ' Dostáváš bednu:' : ''}</p>` : ''}
    <div class="drops">${cards.map((id, k) => { const it = H.item(id); return `<div class="drop r${it.tier - 1}" style="animation-delay:${k * 0.25}s"><div class="card" style="--rc:${H.RARITY[it.tier - 1].color}">${A.cardIcon(it)}<span class="cn">${esc(it.famName)} Mk ${['I', 'II', 'III', 'IV', 'V'][it.tier - 1]}</span></div></div>`; }).join('')}</div>
    <div class="acts" style="justify-content:center">${camp ? `${win && idx < C.MISSIONS.length - 1 ? '<button class="btn" data-n="next" type="button">Další mise</button>' : ''}<button class="btn ${win ? 'alt' : ''}" data-n="retry" type="button">${win ? 'Zopakovat' : 'Zkusit znovu'}</button><button class="btn alt" data-n="garage" type="button">Garáž</button><button class="btn alt" data-n="camp" type="button">Mapa kampaně</button>` : `<button class="btn" data-rm type="button">Odveta</button><button class="btn alt" data-n="garage" type="button">Garáž</button><button class="btn alt" data-n="menu" type="button">Menu</button>`}</div></div>`;
    root.appendChild(el); for (const b of el.querySelectorAll('[data-n]')) b.onclick = () => hooks.next(b.dataset.n);
    const rm = el.querySelector('[data-rm]'); if (rm) rm.onclick = () => { if (rematchSent) return; rematchSent = true; rm.textContent = 'Čekám na soupeře…'; rm.disabled = true; hooks.send({ t: 'rematch' }); };
    cards.forEach((id, k) => setTimeout(() => hooks.sfx.land(H.item(id).tier - 1), 300 + k * 250));
  }
  function onRematch() { /* druhý hráč čeká: tlačítko už ukazuje stav */ }
  function destroy() { dead = true; cancelAnimationFrame(raf); clearInterval(tmr); window.removeEventListener("resize", onResize); if (ro) ro.disconnect(); root.innerHTML = ''; }
  return { start, onEv, onOver, onRematch, unlock, destroy, isOver: () => over };
}
