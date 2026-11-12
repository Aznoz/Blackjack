// MECHA ARÉNA – kresba: roboti poskládaní z karet (SVG, žádné obrázky ani emoji), ikony karet, technické bedny a pozadí aren.
import * as H from './shared.js?v=3';

const METAL = ['#8e9aa6', '#7db98e', '#6ea4dc', '#a98ae0', '#e2b455'], LIGHT = ['#b6c1cc', '#a6dfb6', '#9fcdf5', '#cdb4f5', '#ffdf8a'];
const DARK = '#252c34', GLOW = ['#9fb0c0', '#5ed17a', '#4aa8ff', '#b36bff', '#ffb52e'];
let UID = '', UCNT = 0;   // při kreslení robota se kov vyplňuje přechodem (světlo nahoře, stín dole)
const mix = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join(''); };
const gradDefs = (u) => '<defs>' + METAL.map((m, i) => `<linearGradient id="${u}m${i + 1}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${LIGHT[i]}"/><stop offset=".22" stop-color="${m}"/><stop offset=".72" stop-color="${mix(m, 0.72)}"/><stop offset="1" stop-color="${mix(m, 0.5)}"/></linearGradient>`).join('') + `<linearGradient id="${u}cy" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".26" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient><radialGradient id="${u}sh"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` + '</defs>';
const cyl = (x, y, w, h, r = 3) => R(x, y, w, h, `url(#${UID}cy)`, r, 'pointer-events="none"');
const pal = (t) => ({ m: UID ? `url(#${UID}m${t || 1})` : METAL[t - 1] || METAL[0], l: LIGHT[t - 1] || LIGHT[0], d: DARK, a: GLOW[t - 1] || GLOW[0], t });
const GL = (col, r = 5) => `style="filter:drop-shadow(0 0 ${r}px ${col})"`;
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
  const torso = (w = 0) => `<path d="M${64 - w} 82 Q64 74 76 74 L124 74 Q136 74 ${136 + w} 82 L${132 + w} 150 L${68 - w} 150Z" fill="${m}" ${OUT}/><path d="M${66 - w} 84 Q66 76 78 76 L122 76" fill="none" stroke="#fff" stroke-width="2.2" opacity=".4" stroke-linecap="round"/>${L(70 - w, 100, 130 + w, 100, '#000', 1, 'opacity=".28"')}${L(69 - w, 138, 131 + w, 138, '#000', 1, 'opacity=".28"')}${[[72 - w, 80], [128 + w, 80], [71 - w, 146], [129 + w, 146]].map(([x, y]) => C(x, y, 1.8, '#10151a', 'opacity=".7"') + C(x - .5, y - .5, .7, '#fff', 'opacity=".5"')).join('')}`;
  switch (fam) {
    case 'reac': return torso() + R(74, 84, 52, 52, d, 8, OUT) + C(100, 110, 16, '#0d1319') + C(100, 110, 11, a, `opacity=".95" ${GL(a, 7)}`) + C(100, 110, 5, '#fff', 'opacity=".85"') + R(70, 142, 60, 6, l, 2);
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
    case 'sens': return R(cx - 18, cy - 14, 36, 28, m, 8, OUT) + R(cx - 2, cy - 5, 22, 8, d, 3, OUT) + R(cx + 6, cy - 3, 12, 4, a, 1, GL(a, 4)) + R(cx + 18, cy - 4, 14, 6, l, 2, OUT) + R(cx - 10, cy + 14, 20, 6, d, 2);
    case 'helm': return `<path d="M${cx - 22} ${cy + 16} L${cx - 22} ${cy - 2} Q${cx - 20} ${cy - 24} ${cx} ${cy - 24} Q${cx + 20} ${cy - 24} ${cx + 22} ${cy - 2} L${cx + 22} ${cy + 16}Z" fill="${m}" ${OUT}/>` + R(cx - 2, cy - 4, 24, 9, d, 3, OUT) + R(cx + 4, cy - 1, 14, 3, a, 1, GL(a, 4)) + R(cx - 4, cy - 30, 8, 8, l, 2, OUT) + R(cx - 12, cy + 14, 24, 6, d, 2);
    case 'cpu': return R(cx - 17, cy - 14, 34, 28, m, 6, OUT) + R(cx - 2, cy - 7, 17, 12, d, 2, OUT) + R(cx + 2, cy - 4, 4, 6, a) + R(cx + 8, cy - 4, 4, 6, a) + L(cx - 6, cy - 14, cx - 8, cy - 32, l, 2) + C(cx - 8, cy - 33, 3, a) + R(cx - 10, cy + 14, 20, 6, d, 2);
    case 'radar': return R(cx - 17, cy - 12, 34, 26, m, 6, OUT) + R(cx - 2, cy - 4, 18, 8, d, 3, OUT) + C(cx + 8, cy, 2.4, a) + L(cx - 2, cy - 12, cx - 2, cy - 22, l, 3) + `<path d="M${cx - 18} ${cy - 22} Q${cx - 2} ${cy - 40} ${cx + 14} ${cy - 22}Z" fill="${l}" ${OUT}/>` + R(cx - 10, cy + 12, 20, 7, d, 2);
    case 'visor': return R(cx - 18, cy - 14, 36, 28, m, 7, OUT) + R(cx - 16, cy - 7, 36, 12, d, 5, OUT) + R(cx - 10, cy - 3, 28, 4, a, 2, GL(a, 5)) + R(cx - 10, cy + 14, 20, 6, d, 2);
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
  UID = 'r' + (++UCNT) + '_'; const uid = UID, tm = opt.team || '';
  const p = robotParts(build || {}, inv), z = (slot, fn) => (p[slot] ? fn(p[slot].it.fam, p[slot].c) : fn('', pal(1)));
  const chestC = p.chest ? p.chest.c : pal(1), band = tm || DARK;
  const hand = (slot) => {
    const m = MOUNT[slot], sx = slot === 'hdR' ? 138 : 124, sy = slot === 'hdR' ? 94 : 100, ex = m[0] - 4, ey = m[1], px = sx + (ex - sx) * 0.62, py = sy + (ey - sy) * 0.62;
    const arm = L(sx, sy, ex, ey, '#1d242b', 24) + L(sx, sy, ex, ey, '#4a5560', 18) + L(sx, sy - 3, ex, ey - 3, '#8693a0', 5) + L(sx, sy + 5, ex, ey + 5, '#000', 4, 'opacity=".3"')
      + (tm ? `<circle cx="${px}" cy="${py}" r="10" fill="none" stroke="${tm}" stroke-width="3.5"/>` : '') + C(sx, sy, 9, '#2a323a', OUT) + C(sx, sy, 3.4, '#9aa6b2') + C(ex, ey, 12, '#323c46', OUT) + C(ex, ey, 7, '#4f5b67') + C(ex - 1, ey - 1, 2.2, '#cfd8e0', 'opacity=".8"');
    return arm + (p[slot] ? `<g transform="translate(${m[0]} ${m[1]}) scale(${WS})">${handGun(p[slot].it.fam, p[slot].c)}</g>` : C(m[0] + 4, m[1], 11, '#6c7782', OUT));
  };
  const sh = (slot) => { const m = MOUNT[slot]; return p[slot] ? `<g transform="translate(${m[0]} ${m[1]}) scale(${SS})">${shoulderGun(p[slot].it.fam, p[slot].c)}</g>` : R(m[0] - 12, m[1] + 4, 24, 14, '#5b656f', 4, OUT); };
  const pauld = (x, y, r) => `<path d="M${x - r} ${y + r * 0.7} Q${x - r} ${y - r} ${x} ${y - r} Q${x + r} ${y - r} ${x + r} ${y + r * 0.7}Z" fill="${chestC.m}" ${OUT}/><path d="M${x - r} ${y + r * 0.7} Q${x - r} ${y - r} ${x} ${y - r} Q${x + r} ${y - r} ${x + r} ${y + r * 0.7}Z" fill="url(#${UID}cy)"/><path d="M${x - r * 0.7} ${y - r * 0.2} Q${x} ${y - r * 1.05} ${x + r * 0.7} ${y - r * 0.2}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/><rect x="${x - r}" y="${y + r * 0.55}" width="${2 * r}" height="6" rx="2" fill="${band}" ${OUT}/>${C(x - r * 0.4, y - r * 0.1, 1.8, '#10151a', 'opacity=".7"')}${C(x + r * 0.4, y - r * 0.1, 1.8, '#10151a', 'opacity=".7"')}`;
  const wrap = (x, y, sx, sy, inner) => `<g transform="translate(${x} ${y}) scale(${sx} ${sy}) translate(${-x} ${-y})">${inner}</g>`;
  const LW = { servo: 10, greave: 21, frame: 24, gyro: 14, thrust: 14 }, legX = (x, f) => { const w = LW[f] || 10; return cyl(x - w / 2, 150, w, 74, 3); }, legY = (x) => `<rect x="${x + 7}" y="162" width="6" height="30" rx="2.5" fill="#1b2128" ${OUT}/>` + L(x + 10, 165, x + 10, 189, '#d3dce4', 2.4) + C(x, 187, 4, '#1b2128', OUT) + C(x, 187, 1.6, '#aeb9c4') + R(x - 14, 231, 36, 4, '#0b0f13', 2) + (tm ? R(x - 12, 224, 32, 3, tm, 1) : '');
  const out = [];
  out.push(`<ellipse cx="100" cy="235" rx="96" ry="11" fill="url(#${uid}sh)"/>`);
  if (tm) out.push(`<ellipse cx="100" cy="235" rx="74" ry="5" fill="${tm}" opacity=".28"/>`);
  // zádový modul s výfuky
  out.push(R(40, 76, 28, 56, '#262e36', 5, OUT) + cyl(40, 76, 28, 56, 5) + [0, 1, 2, 3].map((i) => L(46, 88 + i * 10, 62, 88 + i * 10, '#0c1014', 2.4)).join('') + R(44, 66, 7, 14, '#3a444e', 2, OUT) + R(57, 66, 7, 14, '#3a444e', 2, OUT) + C(47.5, 64, 3.4, chestC.a, GL(chestC.a, 5)) + C(60.5, 64, 3.4, chestC.a, GL(chestC.a, 5)));
  out.push(sh('shL'));
  out.push(wrap(66, 150, 1.5, 1, z('lgL', (f, c) => legSVG(f, 66, c, false)) + legX(66, p.lgL && p.lgL.it.fam) + legY(66)));
  out.push(pauld(60, 82, 18));
  out.push(hand('hdL'));
  out.push(wrap(100, 112, 1.32, 1.2, z('chest', chestSVG) + `<path d="M64 82 Q64 74 76 74 L124 74 Q136 74 136 82 L132 150 L68 150Z" fill="url(#${uid}cy)" pointer-events="none"/>` + (tm ? R(66, 144, 68, 4, tm, 1) + Pg('64,92 70,92 70,106', tm, 'opacity=".9"') : '')));
  out.push(wrap(104, 72, 1.4, 1.4, z('head', headSVG) + cyl(86, 40, 36, 32, 8) + (tm ? R(88, 69, 32, 3, tm, 1) : '')).replace('translate(104 72)', 'translate(100 66)'));
  out.push(wrap(132, 150, 1.5, 1, z('lgR', (f, c) => legSVG(f, 132, c, true)) + legX(132, p.lgR && p.lgR.it.fam) + legY(132)));
  out.push(pauld(140, 84, 22));
  out.push(hand('hdR'));
  out.push(sh('shR'));
  UID = '';
  return gradDefs(uid) + out.join('');
}
export const robotSVGFull = (build, inv, cls = '') => `<svg class="robot ${cls}" viewBox="-12 0 272 246" xmlns="http://www.w3.org/2000/svg">${robotSVG(build, inv)}</svg>`;

// ------------------------------------------------------------ ikona karty (80 × 60)
export function cardIcon(it) {
  UID = 'c' + (++UCNT) + '_'; const uid = UID; const c = pal(it.tier); let body = '';
  if (it.kind === 'weapon') {
    const hand = it.fit[0] === 'hand', len = hand ? HAND_LEN[it.fam] : 60, s = Math.min(1.25, 62 / len);
    body = `<g transform="translate(${40 - (hand ? len / 2 : 20) * s} 32) scale(${s})">${hand ? handGun(it.fam, c) : shoulderGun(it.fam, c)}</g>`;
  } else if (it.kind === 'drone') body = `<g transform="translate(40 30) scale(1.5)">${droneSVG(it.dr.dtype, it.tier)}</g>`;
  else if (it.fit[0] === 'head') body = `<g transform="translate(-105 -50) scale(1.4)">${headSVG(it.fam, c)}</g>`;
  else if (it.fit[0] === 'chest') body = `<g transform="translate(-30 -48) scale(.7)">${chestSVG(it.fam, c)}</g>`;
  else body = `<g transform="translate(-12 -104) scale(.7)">${legSVG(it.fam, 74, c, true)}</g>`;
  UID = ''; return `<svg class="cicon" viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg">${gradDefs(uid)}${body}</svg>`;
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
// ------------------------------------------------------------ pozadí arén (vrstvy s paralaxou: #bgf daleko, #bgm uprostřed)
const rr = (i, k = 0) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');
const poly = (pts, f, extra = '') => `<polygon points="${pts.map((q) => q.join(',')).join(' ')}" fill="${f}" ${extra}/>`;
const ridge = (y0, amp, step, seed, f, x0 = -500, x1 = 1700) => { let d = `M${x0} 340`; for (let x = x0, i = 0; x <= x1; x += step, i++) d += ` L${x} ${(y0 - rr(i, seed) * amp).toFixed(0)}`; return `<path d="${d} L${x1} 340Z" fill="${f}"/>`; };
const THEMES = {
  junk: { sky: ['#1d1722', '#5a3a3a', '#d28a4c'], haze: '#d28a4c', floor: ['#3a3029', '#1b1612'], seam: '#0c0a08', lamp: '#ffb46a' },
  factory: { sky: ['#0c141b', '#1f3140', '#4a6a80'], haze: '#5d8299', floor: ['#2e3b47', '#10171d'], seam: '#080c10', lamp: '#bfe6ff' },
  desert: { sky: ['#264a63', '#d08a58', '#f6cd8a'], haze: '#f3c585', floor: ['#8a5a30', '#3f2713'], seam: '#2a1a0c', lamp: '#fff0c0' },
  ice: { sky: ['#06182a', '#1b4d73', '#8fd0ee'], haze: '#a9defa', floor: ['#54839f', '#16313f'], seam: '#0a1c28', lamp: '#e6f8ff' },
  lava: { sky: ['#0b0405', '#3a0f0b', '#d8501c'], haze: '#ff6a24', floor: ['#34211d', '#110908'], seam: '#050202', lamp: '#ff8a3c' },
  space: { sky: ['#03040a', '#0d1330', '#24347a'], haze: '#3a56c0', floor: ['#262d44', '#0a0d18'], seam: '#04060c', lamp: '#9fc4ff' },
};
export function arenaBG(theme, pfx = '') {
  const html = arenaBGraw(theme);
  return pfx ? html.replace(/(id="|url\(#)(bgg|flg|hzg|bgsun|bglamp|flshine|fxglow)\b/g, `$1${pfx}$2`) : html;
}
function arenaBGraw(theme) {
  const T = THEMES[theme] || THEMES.factory; let far = '', mid = '', amb = '';
  if (theme === 'junk') {
    far = `<circle cx="820" cy="250" r="210" fill="url(#bgsun)"/><circle cx="820" cy="250" r="46" fill="#ffd9a0" opacity=".85"/>` + ridge(300, 90, 70, 3, '#2d2226') + range(4, (i) => { const x = 40 + i * 330; return R(x, 120 - (i % 2) * 30, 34, 220, '#251c20', 2) + R(x - 4, 116 - (i % 2) * 30, 42, 10, '#352a2e', 2) + `<ellipse cx="${x + 20}" cy="${80 - (i % 2) * 30}" rx="50" ry="26" fill="#3a2e33" opacity=".55"/><ellipse cx="${x + 44}" cy="${46 - (i % 2) * 30}" rx="40" ry="20" fill="#3a2e33" opacity=".35"/>`; });
    mid = ridge(318, 60, 46, 7, '#3b2d2b') + range(9, (i) => { const x = -200 + i * 190 + rr(i, 2) * 60, h = 40 + rr(i, 4) * 60; return R(x, 330 - h, 90, h, ['#5b4a3a', '#6b5239', '#46505a', '#7a3d2c'][i % 4], 3, 'stroke="#14100d" stroke-width="1.5"') + L(x + 6, 330 - h + 12, x + 84, 330 - h + 12, '#000', 1.5, 'opacity=".3"') + L(x + 6, 330 - h + 26, x + 84, 330 - h + 26, '#000', 1.5, 'opacity=".3"'); }) + `<path d="M420 330 L420 150 L520 150 M420 150 L360 190 M520 150 L520 185" stroke="#2a2022" stroke-width="7" fill="none"/>` + range(6, (i) => C(-120 + i * 260, 322, 16, '#17130f', 'stroke="#2d2723" stroke-width="5"'));
    amb = range(26, (i) => `<circle class="pt dust" cx="${-250 + rr(i, 1) * 1700}" cy="${40 + rr(i, 2) * 290}" r="${1 + rr(i, 3) * 2}" fill="#ffd9a0" style="animation-duration:${9 + rr(i, 5) * 8}s;animation-delay:${-rr(i, 6) * 12}s"/>`);
  } else if (theme === 'factory') {
    far = range(14, (i) => { const x = -500 + i * 160, h = 90 + rr(i, 3) * 130; return R(x, 330 - h, 130, h, '#16222c', 2) + range(Math.floor(h / 22), (k) => rr(i * 9 + k, 8) > 0.55 ? R(x + 10 + (k % 4) * 28, 330 - h + 10 + Math.floor(k / 4) * 22, 12, 8, rr(k, i) > 0.5 ? '#ffd27a' : '#7fd2ff', 1, 'opacity=".75"') : ''); }) + `<circle cx="300" cy="140" r="170" fill="url(#bgsun)" opacity=".6"/>`;
    mid = range(6, (i) => { const x = -260 + i * 330; return R(x, -400, 64, 730, '#1d2a35', 2, 'stroke="#0a0f14" stroke-width="2"') + R(x, 250, 64, 16, '#e0a030', 2) + R(x, 266, 64, 14, '#1a1a1a', 2) + R(x + 10, 80, 44, 8, '#2a3a48', 2) + `<polygon points="${x + 32},120 ${x - 38},330 ${x + 102},330" fill="url(#bglamp)" opacity=".5"/>` + R(x + 22, 108, 20, 12, '#e8f4ff', 3, GL('#bfe6ff', 8)) + range(5, (k) => C(x + 10 + k * 11, 60 + (k % 2) * 6, 3, k % 2 ? '#ff4d3d' : '#ffb000', GL(k % 2 ? '#ff4d3d' : '#ffb000', 4))); }) + L(-500, 120, 1700, 120, '#2e4356', 12) + L(-500, 150, 1700, 150, '#26394a', 8);
    amb = range(20, (i) => `<circle class="pt spark" cx="${-200 + rr(i, 1) * 1500}" cy="${200 + rr(i, 2) * 130}" r="${1.2 + rr(i, 3) * 1.6}" fill="#ffb84a" style="animation-duration:${3 + rr(i, 5) * 4}s;animation-delay:${-rr(i, 6) * 6}s"/>`);
  } else if (theme === 'desert') {
    far = `<circle cx="760" cy="190" r="230" fill="url(#bgsun)"/><circle cx="760" cy="190" r="56" fill="#fff3d0"/>` + ridge(290, 44, 120, 11, '#b8703f') + ridge(310, 30, 90, 5, '#9a5a2c');
    mid = range(5, (i) => { const x = -300 + i * 380 + rr(i, 2) * 60, h = 90 + rr(i, 3) * 90, w = 90 + rr(i, 4) * 60; return poly([[x, 332], [x + 14, 332 - h], [x + w - 18, 332 - h - 12], [x + w, 332]], '#6e3f1f') + poly([[x + w * 0.55, 332], [x + w - 18, 332 - h - 12], [x + w, 332]], '#4a2810', 'opacity=".7"') + R(x + 14, 332 - h, w - 32, 6, '#a56a3a', 2); }) + ridge(326, 24, 70, 21, '#7e4a24');
    amb = range(24, (i) => `<ellipse class="pt dust" cx="${-250 + rr(i, 1) * 1700}" cy="${240 + rr(i, 2) * 90}" rx="${6 + rr(i, 3) * 14}" ry="1.4" fill="#f6d9a4" opacity=".5" style="animation-duration:${6 + rr(i, 5) * 6}s;animation-delay:${-rr(i, 6) * 10}s"/>`);
  } else if (theme === 'ice') {
    far = range(3, (i) => `<path d="M-500 ${60 + i * 34} Q${-100 + i * 220} ${i * 20 - 40} 300 ${80 + i * 22} T1100 ${40 + i * 28} T1700 ${90 + i * 10}" fill="none" stroke="${['#5dffb0', '#7a8cff', '#c070ff'][i]}" stroke-width="${34 - i * 6}" opacity=".22" stroke-linecap="round" style="filter:blur(14px)"/>`) + range(6, (i) => C(-200 + i * 300, 40 + (i % 3) * 30, 1.6, '#fff', 'opacity=".8"')) + ridge(250, 130, 150, 4, '#2b5a7a') + range(7, (i) => { const x = -420 + i * 300 + rr(i, 3) * 80, h = 90 + rr(i, 6) * 80; return poly([[x, 330], [x + 80, 330 - h], [x + 160, 330]], '#3a7aa0') + poly([[x + 80, 330 - h], [x + 56, 330 - h + 34], [x + 80, 330 - h + 24], [x + 104, 330 - h + 34]], '#eaf8ff'); });
    mid = range(9, (i) => { const x = -300 + i * 220 + rr(i, 3) * 60, h = 50 + rr(i, 7) * 90; return poly([[x, 332], [x + 12, 332 - h], [x + 28, 332 - h - 18], [x + 44, 332 - h + 6], [x + 52, 332]], '#9fd8f5', 'opacity=".75" stroke="#e6f8ff" stroke-width="1.5"') + poly([[x + 12, 332 - h], [x + 28, 332 - h - 18], [x + 30, 332]], '#e6f8ff', 'opacity=".35"'); });
    amb = range(40, (i) => `<circle class="pt snow" cx="${-250 + rr(i, 1) * 1700}" cy="${-20 + rr(i, 2) * 300}" r="${1 + rr(i, 3) * 2.2}" fill="#fff" opacity=".8" style="animation-duration:${6 + rr(i, 5) * 7}s;animation-delay:${-rr(i, 6) * 12}s"/>`);
  } else if (theme === 'lava') {
    far = `<circle cx="560" cy="170" r="260" fill="url(#bgsun)" opacity=".9"/>` + poly([[-100, 340], [330, 150], [470, 70], [600, 60], [740, 120], [980, 340]], '#1a0807') + poly([[470, 70], [600, 60], [560, 100], [510, 96]], '#ff7a2a', GL('#ff6a20', 14)) + ridge(280, 80, 100, 9, '#220a08');
    mid = range(8, (i) => { const x = -300 + i * 250 + rr(i, 2) * 50, h = 60 + rr(i, 3) * 110; return poly([[x, 332], [x + 20, 332 - h], [x + 36, 332 - h * 0.7], [x + 54, 332 - h - 20], [x + 82, 332]], '#140706', 'stroke="#ff5a1a" stroke-width="1.2" stroke-opacity=".5"'); }) + `<path d="M-500 330 Q-100 316 300 330 T1100 328 T1700 330 L1700 346 L-500 346Z" fill="#ff6a20" opacity=".9" style="filter:blur(2px)"/>`;
    amb = range(30, (i) => `<circle class="pt ember" cx="${-250 + rr(i, 1) * 1700}" cy="${120 + rr(i, 2) * 220}" r="${1 + rr(i, 3) * 2}" fill="${i % 3 ? '#ff9a3a' : '#ffd27a'}" style="animation-duration:${4 + rr(i, 5) * 5}s;animation-delay:${-rr(i, 6) * 8}s"/>`);
  } else if (theme === 'space') {
    far = range(110, (i) => C(-400 + rr(i, 1) * 1900, -200 + rr(i, 2) * 520, rr(i, 3) * 1.4 + 0.5, '#fff', `opacity="${0.35 + rr(i, 4) * 0.6}"`)).replace(/<circle /g, '<circle class="tw" ') + `<circle cx="820" cy="120" r="120" fill="url(#bgsun)"/><circle cx="820" cy="120" r="70" fill="#2f4fb0"/><circle cx="800" cy="104" r="62" fill="#4b78e0" opacity=".6"/><ellipse cx="820" cy="124" rx="130" ry="20" fill="none" stroke="#9fc4ff" stroke-width="5" opacity=".45" transform="rotate(-14 820 124)"/>`;
    mid = range(5, (i) => { const x = -300 + i * 380 + rr(i, 3) * 60; return R(x, 250, 150, 82, '#171d33', 4, 'stroke="#2c3b6e" stroke-width="2"') + R(x + 14, 232, 40, 20, '#1f2848', 3) + range(6, (k) => R(x + 12 + k * 22, 270, 12, 8, rr(k, i) > 0.4 ? '#7fd2ff' : '#233058', 1, 'opacity=".9"')) + L(x + 150, 290, x + 230, 270, '#2c3b6e', 6); });
    amb = '';
  }
  const f0 = T.floor[0], f1 = T.floor[1];
  const seams = range(26, (i) => { const x = 50 + (i - 7) * 100, bx = 550 + (x - 550) * 1.5; return L(x, 335, bx, 480, T.seam, 2, 'opacity=".55"'); }) + [350, 378, 414, 460].map((y) => L(-500, y, 1700, y, T.seam, 1.6, 'opacity=".45"')).join('');
  return `<defs><linearGradient id="bgg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.sky[0]}"/><stop offset=".62" stop-color="${T.sky[1]}"/><stop offset="1" stop-color="${T.sky[2]}"/></linearGradient>
  <linearGradient id="flg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${f0}"/><stop offset="1" stop-color="${f1}"/></linearGradient>
  <linearGradient id="hzg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.haze}" stop-opacity="0"/><stop offset="1" stop-color="${T.haze}" stop-opacity=".55"/></linearGradient>
  <radialGradient id="bgsun"><stop offset="0" stop-color="${T.lamp}" stop-opacity=".75"/><stop offset=".5" stop-color="${T.haze}" stop-opacity=".25"/><stop offset="1" stop-color="${T.haze}" stop-opacity="0"/></radialGradient>
  <linearGradient id="bglamp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.lamp}" stop-opacity=".55"/><stop offset="1" stop-color="${T.lamp}" stop-opacity="0"/></linearGradient>
  <radialGradient id="flshine" cx=".5" cy="0" r=".7"><stop offset="0" stop-color="${T.lamp}" stop-opacity=".32"/><stop offset="1" stop-color="${T.lamp}" stop-opacity="0"/></radialGradient>
  <filter id="fxglow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <rect x="-900" y="-1600" width="2900" height="2000" fill="url(#bgg)"/>
  <g id="bgf">${far}</g><rect x="-900" y="230" width="2900" height="110" fill="url(#hzg)"/><g id="bgm">${mid}</g>
  <rect x="-900" y="300" width="2900" height="40" fill="url(#hzg)" opacity=".7"/>
  <rect x="-900" y="332" width="2900" height="200" fill="url(#flg)"/>${seams}
  <ellipse cx="550" cy="334" rx="620" ry="70" fill="url(#flshine)"/>
  <rect x="-900" y="332" width="2900" height="2.5" fill="#fff" opacity=".35"/><rect x="-900" y="335" width="2900" height="5" fill="#000" opacity=".25"/>
  <g class="amb">${amb}</g>`;
}
export const TYPE_ICON = { kin: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill="currentColor"/><path d="M1 8h4M11 8h4" stroke="currentColor" stroke-width="1.5"/></svg>', nrg: '<svg viewBox="0 0 16 16"><path d="M9 1L3 9h4l-1 6 7-9H9z" fill="currentColor"/></svg>', exp: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3" fill="currentColor"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3M3 3l2 2M11 11l2 2M13 3l-2 2M5 11l-2 2" stroke="currentColor" stroke-width="1.4"/></svg>' };
