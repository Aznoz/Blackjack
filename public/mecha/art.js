// MECHA ARÉNA – kresba: roboti poskládaní z karet (SVG, žádné obrázky ani emoji), ikony karet, technické bedny a pozadí aren.
import * as H from './shared.js?v=2';

const METAL = ['#8e9aa6', '#7db98e', '#6ea4dc', '#a98ae0', '#e2b455'], LIGHT = ['#b6c1cc', '#a6dfb6', '#9fcdf5', '#cdb4f5', '#ffdf8a'];
const DARK = '#252c34', GLOW = ['#9fb0c0', '#5ed17a', '#4aa8ff', '#b36bff', '#ffb52e'];
const pal = (t) => ({ m: METAL[t - 1] || METAL[0], l: LIGHT[t - 1] || LIGHT[0], d: DARK, a: GLOW[t - 1] || GLOW[0], t });
const R = (x, y, w, h, f, r = 2, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}" ${extra}/>`;
const C = (x, y, r, f, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" ${extra}/>`;
const Pg = (pts, f, extra = '') => `<polygon points="${pts}" fill="${f}" ${extra}/>`;
const L = (x1, y1, x2, y2, s, w = 2, extra = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${s}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const OUT = 'stroke="#10151a" stroke-width="1.4" stroke-linejoin="round"';

// ------------------------------------------------------------ zbraně (úchop v bodě 0,0, míří doprava)
export const HAND_LEN = { mg: 58, plas: 38, laser: 70, rail: 80, blade: 56, hammer: 46, flame: 52, tesla: 48, shot: 44, emp: 46 };
export const SH_OFF = { rocket: [48, -6], mortar: [30, -38], turret: [36, -4], micro: [36, -8], snip: [66, -6], pcan: [46, -10] };
export const MOUNT = { hdR: [150, 112], hdL: [140, 134], shR: [132, 66], shL: [70, 60] };
const WS = 1.3, SS = 1.2;   // zbraně jsou větší než na kartě: roboti jsou obří stroje
export function muzzle(slot, fam) {
  const m = MOUNT[slot]; if (!m) return [140, 100];
  if (slot[0] === 'h') return [m[0] + (HAND_LEN[fam] || 40) * WS, m[1]];
  const o = SH_OFF[fam] || [40, -6]; return [m[0] + o[0] * SS, m[1] + o[1] * SS];
}
function handGun(fam, c) {
  const { m, l, d, a } = c;
  switch (fam) {
    case 'mg': return R(-4, -7, 30, 14, m, 3, OUT) + R(26, -4, 32, 8, d, 2, OUT) + [30, 40, 50].map((x) => L(x, -4, x, 4, l, 1.5)).join('') + R(2, 6, 10, 12, d, 2, OUT) + R(12, -9, 8, 3, a, 1);
    case 'plas': return R(-4, -7, 22, 15, m, 4, OUT) + R(18, -4, 20, 9, d, 3, OUT) + C(37, 0, 4, a, 'opacity=".9"') + R(0, 8, 8, 10, d, 2, OUT);
    case 'laser': return R(-4, -6, 26, 13, m, 3, OUT) + R(22, -3, 48, 6, d, 2, OUT) + R(34, -7, 6, 14, l, 2, OUT) + R(54, -7, 5, 14, l, 2, OUT) + C(69, 0, 3.5, a) + R(0, 7, 8, 11, d, 2, OUT);
    case 'rail': return R(-6, -9, 28, 18, m, 3, OUT) + R(22, -7, 58, 4, l, 1, OUT) + R(22, 3, 58, 4, l, 1, OUT) + [30, 44, 58, 72].map((x) => R(x - 2, -9, 4, 18, a, 1)).join('') + R(0, 9, 9, 12, d, 2, OUT);
    case 'blade': return R(-8, -5, 16, 10, d, 2, OUT) + R(8, -9, 5, 18, m, 1, OUT) + Pg('13,-4 52,-2 56,0 52,2 13,4', a, 'opacity=".95"') + Pg('13,-2 50,-1 50,1 13,2', '#fff', 'opacity=".7"');
    case 'hammer': return R(-6, -3, 36, 6, d, 2, OUT) + R(26, -16, 20, 32, m, 3, OUT) + R(26, -16, 20, 7, l, 2) + R(26, 9, 20, 7, l, 2) + C(36, 0, 3, a);
    case 'flame': return R(-10, -14, 18, 26, m, 4, OUT) + R(8, -4, 30, 8, d, 2, OUT) + R(34, -6, 8, 12, l, 2, OUT) + `<path d="M43 0 Q50 -7 52 0 Q50 7 43 0Z" fill="${a}"/>` + `<path d="M43 0 Q47 -3 49 0 Q47 3 43 0Z" fill="#fff" opacity=".8"/>`;
    case 'tesla': return R(-4, -5, 14, 10, d, 2, OUT) + R(10, -7, 28, 14, m, 3, OUT) + [16, 24, 32].map((x) => R(x, -10, 3, 20, a, 1)).join('') + C(42, 0, 5, l, OUT) + `<path d="M46 -3 L52 -8 L50 -1 L56 -4" stroke="${a}" fill="none" stroke-width="1.6"/>`;
    case 'shot': return R(-4, -7, 18, 14, d, 3, OUT) + R(14, -7, 30, 6, m, 2, OUT) + R(14, 1, 30, 6, m, 2, OUT) + R(40, -8, 5, 16, l, 1) + R(2, 7, 8, 11, d, 2, OUT);
    case 'emp': return R(-4, -5, 16, 12, d, 3, OUT) + R(12, -3, 10, 6, m, 1, OUT) + `<path d="M22 -14 L44 -22 L44 22 L22 14Z" fill="${m}" ${OUT}/>` + C(40, 0, 4, a) + `<path d="M30 -8 Q36 0 30 8" stroke="${a}" fill="none" stroke-width="1.6"/>`;
    default: return R(-4, -6, 24, 12, m, 3, OUT);
  }
}
function shoulderGun(fam, c) {
  const { m, l, d, a } = c;
  switch (fam) {
    case 'rocket': return R(-6, -12, 40, 22, m, 3, OUT) + C(36, -7, 5, d, OUT) + C(36, 5, 5, d, OUT) + Pg('34,-12 48,-7 34,-2', a) + Pg('34,0 48,5 34,10', a) + R(-2, -8, 18, 4, l, 1);
    case 'mortar': return `<g transform="rotate(-52)">` + R(-4, -8, 50, 16, m, 3, OUT) + R(40, -10, 8, 20, l, 2, OUT) + R(8, -10, 4, 20, d, 1) + `</g>` + R(-8, 4, 22, 10, d, 3, OUT);
    case 'turret': return R(-8, 2, 24, 12, d, 3, OUT) + C(8, 0, 11, m, OUT) + R(12, -7, 30, 5, l, 2, OUT) + R(12, 1, 30, 5, l, 2, OUT) + C(8, 0, 4, a);
    case 'micro': return R(-6, -14, 40, 24, m, 3, OUT) + [0, 1, 2].flatMap((r) => [0, 1].map((q) => C(8 + r * 10, -8 + q * 12, 3.4, d))).join('') + R(30, -14, 6, 24, l, 2, OUT) + R(-6, -15, 40, 3, a, 1);
    case 'snip': return R(-8, -5, 22, 12, m, 3, OUT) + R(14, -3, 56, 6, d, 2, OUT) + R(66, -5, 5, 10, l, 1) + R(8, -12, 24, 6, l, 2, OUT) + C(14, -9, 3, a) + C(28, -9, 3, a);
    case 'pcan': return R(-8, -9, 28, 20, m, 4, OUT) + R(20, -6, 28, 14, d, 3, OUT) + R(44, -9, 6, 20, l, 2, OUT) + C(47, 1, 3.5, a) + R(-2, -12, 14, 4, a, 1);
    default: return R(-6, -8, 30, 14, m, 3, OUT);
  }
}
// ------------------------------------------------------------ moduly
function legSVG(fam, x, c, front) {
  const { m, l, d, a } = c, hip = 150;
  const base = R(x - 7, hip, 14, 38, m, 3, OUT) + R(x - 6, hip + 36, 12, 32, d, 3, OUT) + R(x - 12, 222, 32, 11, m, 3, OUT);
  const tone = front ? '' : ' opacity=".92"';
  switch (fam) {
    case 'servo': return `<g${tone}>` + R(x - 5, hip, 10, 38, m, 3, OUT) + L(x + 1, hip + 4, x + 1, hip + 70, a, 3) + R(x - 4, hip + 34, 8, 34, d, 2, OUT) + C(x, hip + 36, 6, l, OUT) + R(x - 11, 222, 30, 10, m, 3, OUT) + `</g>`;
    case 'greave': return `<g${tone}>` + R(x - 10, hip, 20, 36, m, 4, OUT) + R(x - 11, hip + 34, 22, 34, l, 4, OUT) + R(x - 9, hip + 40, 18, 4, d, 1) + R(x - 9, hip + 50, 18, 4, d, 1) + R(x - 14, 220, 36, 13, m, 3, OUT) + `</g>`;
    case 'gyro': return `<g${tone}>` + base + C(x, hip + 38, 12, d, OUT) + C(x, hip + 38, 8, m) + L(x - 7, hip + 38, x + 7, hip + 38, a, 2) + L(x, hip + 31, x, hip + 45, a, 2) + `</g>`;
    case 'frame': return `<g${tone}>` + R(x - 12, hip, 24, 40, m, 3, OUT) + R(x - 10, hip + 38, 20, 32, d, 3, OUT) + L(x - 10, hip + 4, x + 10, hip + 36, l, 2) + L(x + 10, hip + 4, x - 10, hip + 36, l, 2) + R(x - 16, 220, 40, 13, m, 3, OUT) + `</g>`;
    case 'thrust': return `<g${tone}>` + base + R(x - 16, hip + 40, 9, 22, d, 2, OUT) + Pg(`${x - 16},${hip + 62} ${x - 7},${hip + 62} ${x - 11},${hip + 78}`, a, 'opacity=".85"') + `</g>`;
    default: return `<g${tone}>` + R(x - 5, hip, 10, 38, '#6c7782', 3, OUT) + R(x - 4, hip + 36, 8, 32, '#4a535c', 3, OUT) + R(x - 10, 223, 26, 9, '#6c7782', 3, OUT) + `</g>`;
  }
}
function chestSVG(fam, c) {
  const { m, l, d, a } = c;
  const torso = (w = 0) => `<path d="M${64 - w} 82 Q64 74 76 74 L124 74 Q136 74 ${136 + w} 82 L${132 + w} 150 L${68 - w} 150Z" fill="${m}" ${OUT}/>`;
  switch (fam) {
    case 'reac': return torso() + R(74, 84, 52, 52, d, 8, OUT) + C(100, 110, 16, '#0d1319') + C(100, 110, 11, a, 'opacity=".95"') + C(100, 110, 5, '#fff', 'opacity=".85"') + R(70, 142, 60, 6, l, 2);
    case 'plate': return torso(4) + Pg('62,86 100,100 138,86 138,98 100,112 62,98', l, 'opacity=".9"') + Pg('66,112 100,126 134,112 134,124 100,138 66,124', l, 'opacity=".75"') + [[70, 82], [130, 82], [70, 144], [130, 144]].map(([x, y]) => C(x, y, 2.6, d)).join('');
    case 'shld': return torso() + `<path d="M132 90 Q158 110 132 136" fill="none" stroke="${a}" stroke-width="5" stroke-linecap="round" opacity=".9"/>` + `<path d="M132 98 Q148 110 132 128" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/>` + R(76, 90, 42, 42, d, 6, OUT) + C(97, 111, 9, a, 'opacity=".9"');
    case 'nano': return torso() + R(78, 90, 44, 44, d, 6, OUT) + R(95, 96, 10, 32, '#e9fff0', 2) + R(84, 107, 32, 10, '#e9fff0', 2) + R(95, 96, 10, 5, a, 1);
    case 'cool': return torso() + [0, 1, 2, 3, 4].map((i) => R(54, 82 + i * 12, 14, 5, l, 1, OUT)).join('') + R(76, 90, 44, 44, d, 6, OUT) + [0, 1, 2].map((i) => L(84, 100 + i * 12, 114, 100 + i * 12, a, 2)).join('');
    case 'vault': return torso(2) + R(72, 82, 56, 62, 'none', 3, `stroke="${d}" stroke-width="3"`) + L(72, 82, 128, 144, d, 3) + L(128, 82, 72, 144, d, 3) + [[72, 82], [128, 82], [72, 144], [128, 144]].map(([x, y]) => C(x, y, 3.5, a)).join('');
    default: return torso() + R(76, 90, 48, 44, '#5b656f', 6, OUT) + R(72, 142, 56, 6, '#4a535c', 2);
  }
}
function headSVG(fam, c) {
  const { m, l, d, a } = c, cx = 104, cy = 56;
  switch (fam) {
    case 'sens': return R(cx - 18, cy - 14, 36, 28, m, 8, OUT) + R(cx - 2, cy - 5, 22, 8, d, 3, OUT) + R(cx + 6, cy - 3, 12, 4, a) + R(cx + 18, cy - 4, 14, 6, l, 2, OUT) + R(cx - 10, cy + 14, 20, 6, d, 2);
    case 'helm': return `<path d="M${cx - 22} ${cy + 16} L${cx - 22} ${cy - 2} Q${cx - 20} ${cy - 24} ${cx} ${cy - 24} Q${cx + 20} ${cy - 24} ${cx + 22} ${cy - 2} L${cx + 22} ${cy + 16}Z" fill="${m}" ${OUT}/>` + R(cx - 2, cy - 4, 24, 9, d, 3, OUT) + R(cx + 4, cy - 1, 14, 3, a) + R(cx - 4, cy - 30, 8, 8, l, 2, OUT) + R(cx - 12, cy + 14, 24, 6, d, 2);
    case 'cpu': return R(cx - 17, cy - 14, 34, 28, m, 6, OUT) + R(cx - 2, cy - 7, 17, 12, d, 2, OUT) + R(cx + 2, cy - 4, 4, 6, a) + R(cx + 8, cy - 4, 4, 6, a) + L(cx - 6, cy - 14, cx - 8, cy - 32, l, 2) + C(cx - 8, cy - 33, 3, a) + R(cx - 10, cy + 14, 20, 6, d, 2);
    case 'radar': return R(cx - 17, cy - 12, 34, 26, m, 6, OUT) + R(cx - 2, cy - 4, 18, 8, d, 3, OUT) + C(cx + 8, cy, 2.4, a) + L(cx - 2, cy - 12, cx - 2, cy - 22, l, 3) + `<path d="M${cx - 18} ${cy - 22} Q${cx - 2} ${cy - 40} ${cx + 14} ${cy - 22}Z" fill="${l}" ${OUT}/>` + R(cx - 10, cy + 12, 20, 7, d, 2);
    case 'visor': return R(cx - 18, cy - 14, 36, 28, m, 7, OUT) + R(cx - 16, cy - 7, 36, 12, d, 5, OUT) + R(cx - 10, cy - 3, 28, 4, a, 2) + R(cx - 10, cy + 14, 20, 6, d, 2);
    default: return R(cx - 17, cy - 13, 34, 26, '#6c7782', 6, OUT) + R(cx + 2, cy - 4, 14, 6, '#252c34', 2) + R(cx - 9, cy + 13, 18, 6, '#4a535c', 2);
  }
}
export function droneSVG(dtype, t, spin = 0) {
  const c = pal(t || 1), col = { atk: '#ff5a4a', rep: '#5ed17a', shd: '#4aa8ff', jam: '#c070ff' }[dtype] || c.a;
  const rot = `<g class="rot">${L(-20, -14, 20, -14, '#c9d2da', 3)}${L(-20, 14, 20, 14, '#c9d2da', 3)}</g>`;
  const body = C(0, 0, 13, c.m, OUT) + C(0, 0, 7, DARK) + C(0, 0, 4, col) + R(-4, -20, 8, 6, c.l, 1) + R(-4, 14, 8, 6, c.l, 1);
  const extra = dtype === 'atk' ? R(11, -3, 14, 6, DARK, 2, OUT) : dtype === 'rep' ? R(-2, -9, 4, 18, '#e9fff0', 1) + R(-9, -2, 18, 4, '#e9fff0', 1) : dtype === 'shd' ? `<path d="M-18 -4 Q0 -26 18 -4" fill="none" stroke="${col}" stroke-width="2.4"/>` : `<path d="M-16 6 Q0 -6 16 6M-10 12 Q0 4 10 12" fill="none" stroke="${col}" stroke-width="2"/>`;
  return rot + body + extra;
}
// ------------------------------------------------------------ celý robot (souřadnice 0..200 × 0..240, míří doprava)
export function robotParts(build, inv) {
  const g = (slot) => { const id = build && build[slot]; const it = id ? H.item(id) : null; return it ? { it, c: pal(it.tier) } : null; };
  const o = {}; for (const s of H.SLOTS) o[s] = g(s); return o;
}
export function robotSVG(build, inv, opt = {}) {
  const p = robotParts(build || {}, inv), z = (slot, fn) => (p[slot] ? fn(p[slot].it.fam, p[slot].c) : fn('', pal(1)));
  const chestC = p.chest ? p.chest.c : pal(1);
  const hand = (slot) => { const m = MOUNT[slot], sx = slot === 'hdR' ? 138 : 124, sy = slot === 'hdR' ? 94 : 100; const arm = L(sx, sy, m[0] - 4, m[1], '#2c343c', 21) + L(sx, sy, m[0] - 4, m[1], '#58636e', 15) + L(sx, sy - 3, m[0] - 4, m[1] - 3, '#7d8996', 4) + C(m[0] - 4, m[1], 11, '#3a444e', OUT); return arm + (p[slot] ? `<g transform="translate(${m[0]} ${m[1]}) scale(${WS})">${handGun(p[slot].it.fam, p[slot].c)}</g>` : C(m[0] + 4, m[1], 11, '#6c7782', OUT)); };
  const sh = (slot) => { const m = MOUNT[slot]; return p[slot] ? `<g transform="translate(${m[0]} ${m[1]}) scale(${SS})">${shoulderGun(p[slot].it.fam, p[slot].c)}</g>` : R(m[0] - 12, m[1] + 4, 24, 14, '#5b656f', 4, OUT); };
  const pauld = (x, y, r) => `<path d="M${x - r} ${y + r * 0.7} Q${x - r} ${y - r} ${x} ${y - r} Q${x + r} ${y - r} ${x + r} ${y + r * 0.7}Z" fill="${chestC.m}" ${OUT}/><path d="M${x - r * 0.7} ${y - r * 0.2} Q${x} ${y - r * 1.05} ${x + r * 0.7} ${y - r * 0.2}" fill="none" stroke="${chestC.l}" stroke-width="3" stroke-linecap="round" opacity=".8"/><rect x="${x - r}" y="${y + r * 0.55}" width="${2 * r}" height="6" rx="2" fill="${DARK}"/>`;
  const wrap = (x, y, sx, sy, inner) => `<g transform="translate(${x} ${y}) scale(${sx} ${sy}) translate(${-x} ${-y})">${inner}</g>`;
  const out = [];
  out.push(`<ellipse cx="100" cy="233" rx="88" ry="8" fill="#000" opacity=".3"/>`);
  out.push(sh('shL'));
  out.push(wrap(66, 150, 1.5, 1, z('lgL', (f, c) => legSVG(f, 66, c, false))));
  out.push(pauld(60, 82, 18));
  out.push(hand('hdL'));
  out.push(wrap(100, 112, 1.32, 1.2, z('chest', chestSVG)));
  out.push(wrap(104, 72, 1.4, 1.4, z('head', headSVG)).replace('translate(104 72)', 'translate(100 66)'));
  out.push(wrap(132, 150, 1.5, 1, z('lgR', (f, c) => legSVG(f, 132, c, true))));
  out.push(pauld(140, 84, 22));
  out.push(hand('hdR'));
  out.push(sh('shR'));
  return out.join('');
}
export const robotSVGFull = (build, inv, cls = '') => `<svg class="robot ${cls}" viewBox="-12 0 272 246" xmlns="http://www.w3.org/2000/svg">${robotSVG(build, inv)}</svg>`;

// ------------------------------------------------------------ ikona karty (80 × 60)
export function cardIcon(it) {
  const c = pal(it.tier); let body = '';
  if (it.kind === 'weapon') {
    const hand = it.fit[0] === 'hand', len = hand ? HAND_LEN[it.fam] : 60, s = Math.min(1.25, 62 / len);
    body = `<g transform="translate(${40 - (hand ? len / 2 : 20) * s} 32) scale(${s})">${hand ? handGun(it.fam, c) : shoulderGun(it.fam, c)}</g>`;
  } else if (it.kind === 'drone') body = `<g transform="translate(40 30) scale(1.5)">${droneSVG(it.dr.dtype, it.tier)}</g>`;
  else if (it.fit[0] === 'head') body = `<g transform="translate(-105 -50) scale(1.4)">${headSVG(it.fam, c)}</g>`;
  else if (it.fit[0] === 'chest') body = `<g transform="translate(-30 -48) scale(.7)">${chestSVG(it.fam, c)}</g>`;
  else body = `<g transform="translate(-12 -104) scale(.7)">${legSVG(it.fam, 74, c, true)}</g>`;
  return `<svg class="cicon" viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
// ------------------------------------------------------------ bedna (technická, víko se dá odklopit)
export function crateSVG(c, cls = '') {
  const k = c.color, a = c.accent, bolts = [[14, 20], [106, 20], [14, 82], [106, 82]].map(([x, y]) => C(x, y, 3, '#11161b', 'stroke="#000" opacity=".8"')).join('');
  return `<svg class="crate ${cls}" viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg">
  <g class="cbody"><ellipse cx="60" cy="104" rx="50" ry="5" fill="#000" opacity=".35"/>${R(8, 30, 104, 70, k, 5, OUT)}${R(8, 30, 104, 70, 'url(#hz)', 5)}${R(14, 38, 92, 54, 'none', 3, `stroke="${a}" stroke-opacity=".55" stroke-width="1.5"`)}
    ${R(46, 38, 28, 54, '#11161b', 3, 'opacity=".55"')}${R(50, 46, 20, 12, a, 2, 'opacity=".9"')}${L(52, 66, 68, 66, a, 2)}${L(52, 72, 68, 72, a, 2)}${L(52, 78, 62, 78, a, 2)}${R(8, 90, 104, 10, '#11161b', 3, 'opacity=".5"')}${bolts}</g>
  <g class="clid">${R(4, 16, 112, 20, k, 4, OUT)}${R(4, 16, 112, 6, a, 3, 'opacity=".5"')}${R(48, 22, 24, 10, '#11161b', 2)}${C(60, 27, 2.4, a)}${L(14, 30, 106, 30, '#000', 1.5, 'opacity=".4"')}</g>
  <defs><pattern id="hz" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="14" fill="#000" opacity=".16"/></pattern></defs></svg>`;
}
// ------------------------------------------------------------ pozadí arén
export function arenaBG(theme) {
  const T = {
    junk: ['#2b2620', '#4a3d2f', '#6b5a43', '#1d1915'], factory: ['#1b2630', '#2c3f50', '#4d6a80', '#12181e'], desert: ['#5b3a24', '#c9893f', '#e8b768', '#3c2616'],
    ice: ['#0f2a3f', '#2b6a92', '#9fd8f5', '#0a1c2b'], lava: ['#1c0b0b', '#5a1d10', '#c2441a', '#120707'], space: ['#05060f', '#121a3a', '#2c3b82', '#05060c'],
  }[theme] || ['#1b2630', '#2c3f50', '#4d6a80', '#12181e'];
  const [top, mid, low, floor] = T; let deco = '';
  if (theme === 'space') deco = Array.from({ length: 60 }, (_, i) => C((i * 173) % 1000, (i * 71) % 300, (i % 3) * 0.5 + 0.6, '#fff', `opacity="${0.3 + (i % 5) * 0.12}"`)).join('') + C(820, 110, 60, '#2e4fa8', 'opacity=".8"') + C(800, 100, 52, '#4876d8', 'opacity=".5"');
  else if (theme === 'junk') deco = [0, 1, 2, 3, 4, 5, 6].map((i) => Pg(`${i * 160},330 ${i * 160 + 40},${230 - (i % 3) * 30} ${i * 160 + 110},330`, '#3a3026', 'opacity=".9"')).join('') + R(120, 200, 70, 30, '#5a4a38', 3) + R(700, 180, 90, 40, '#4a3a2a', 3);
  else if (theme === 'factory') deco = [0, 1, 2, 3].map((i) => R(60 + i * 250, 70, 70, 260, '#22313e', 3) + R(60 + i * 250, 70, 70, 14, '#e0a030', 2, 'opacity=".7"')).join('') + L(0, 110, 1000, 110, '#3b5368', 6) + L(0, 150, 1000, 150, '#3b5368', 4);
  else if (theme === 'desert') deco = C(780, 90, 46, '#ffe9a8', 'opacity=".9"') + `<path d="M0 330 Q150 250 320 300 T640 290 T1000 280 L1000 340 L0 340Z" fill="#a8672c"/><path d="M0 330 Q200 280 420 320 T1000 310 L1000 340 L0 340Z" fill="#8a5222"/>`;
  else if (theme === 'ice') deco = [0, 1, 2, 3, 4, 5].map((i) => Pg(`${i * 190},340 ${i * 190 + 60},${190 - (i % 3) * 30} ${i * 190 + 120},340`, '#bfe6f8', 'opacity=".5"')).join('') + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => C((i * 137) % 1000, (i * 53) % 200, 2, '#fff', 'opacity=".7"')).join('');
  else if (theme === 'lava') deco = `<path d="M0 340 L120 210 L220 300 L380 170 L520 300 L700 200 L860 300 L1000 220 L1000 340Z" fill="#2a0e0a"/><path d="M0 345 Q250 320 500 345 T1000 340 L1000 360 L0 360Z" fill="#ff6a20" opacity=".8"/>` + [0, 1, 2, 3, 4].map((i) => C(120 + i * 200, 300 - (i % 2) * 30, 3, '#ffb060', 'opacity=".8"')).join('');
  return `<defs><linearGradient id="bgg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".6" stop-color="${mid}"/><stop offset="1" stop-color="${low}"/></linearGradient><linearGradient id="flg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${floor}"/><stop offset="1" stop-color="#05080b"/></linearGradient></defs>
  <rect x="-100" y="-1400" width="1300" height="1860" fill="url(#bgg)"/>${deco}<rect x="-100" y="332" width="1300" height="140" fill="url(#flg)"/><rect x="-100" y="332" width="1300" height="3" fill="#fff" opacity=".18"/>`;
}
export const TYPE_ICON = { kin: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill="currentColor"/><path d="M1 8h4M11 8h4" stroke="currentColor" stroke-width="1.5"/></svg>', nrg: '<svg viewBox="0 0 16 16"><path d="M9 1L3 9h4l-1 6 7-9H9z" fill="currentColor"/></svg>', exp: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3" fill="currentColor"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3M3 3l2 2M11 11l2 2M13 3l-2 2M5 11l-2 2" stroke="currentColor" stroke-width="1.4"/></svg>' };
