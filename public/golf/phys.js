// MINIGOLF – fyzika míčku a stavba hřiště z textové mapy (sdílený soubor, stejný je i v public/golf/).
// Hřiště je mřížka 1 × 1: '#' zeď, '.' tráva, ',' písek, 'i' led, '~' voda/láva/propast (míček se vrátí a přidá se rána), 'T' start, 'H' jamka,
// 'E' 'W' 'N' 'S' zrychlovače (východ, západ, sever = nahoru po mapě, jih), '1'–'4' teleporty (1↔2, 3↔4). Druhá vrstva `hgt` = výška políček číslicemi 0–9.
// Pohyblivé překážky jsou čisté funkce času t (sekundy od začátku jamky), takže se mezi hráči nic neposílá.
export const DT = 1 / 120;                 // krok fyziky
export const BR = 0.17;                    // poloměr míčku
export const CUP_R = 0.32, CUP_DEPTH = 0.4, GF = 30;   // jamka: skutečná díra (poloměr, hloubka); míček v ní padá vlastní tíhou (GF = tíže při pádu)
export const VMIN = 1.0, VMAX = 19;        // rychlost míčku po ráně (síla 0–1)
export const POW_K = 1.4;                  // křivka síly: jemné údery na krátko zůstávají snadné, plná síla je opravdu rychlá
export const powV = (p) => VMIN + (VMAX - VMIN) * Math.pow(Math.max(0, Math.min(1, p)), POW_K);
export const G = 9, HU = 0.3;              // tíže (sklon) a výška jednoho stupně číslice v `hgt`
export const WALL_E = 0.78;                // odrazivost zdí
export const C = { WALL: 0, GRASS: 1, SAND: 2, ICE: 3, HAZ: 4, BE: 5, BW: 6, BN: 7, BS: 8, T1: 9, T2: 10, T3: 11, T4: 12 };
const CH = { '#': C.WALL, '.': C.GRASS, T: C.GRASS, H: C.GRASS, ',': C.SAND, i: C.ICE, '~': C.HAZ, E: C.BE, W: C.BW, N: C.BN, S: C.BS, 1: C.T1, 2: C.T2, 3: C.T3, 4: C.T4 };
// tření: f = konstantní zpomalení, c = zpomalení úměrné rychlosti
const FRIC = []; FRIC[C.GRASS] = [1.45, 0.5]; FRIC[C.SAND] = [6.5, 1.2]; FRIC[C.ICE] = [0.35, 0.15]; FRIC[C.BE] = FRIC[C.BW] = FRIC[C.BN] = FRIC[C.BS] = FRIC[C.T1] = FRIC[C.T2] = FRIC[C.T3] = FRIC[C.T4] = FRIC[C.HAZ] = FRIC[C.WALL] = FRIC[C.GRASS];
const BOOST = { [C.BE]: [1, 0], [C.BW]: [-1, 0], [C.BN]: [0, -1], [C.BS]: [0, 1] }; const BOOST_A = 20, BOOST_V = 10.5;
const PARTNER = { [C.T1]: C.T2, [C.T2]: C.T1, [C.T3]: C.T4, [C.T4]: C.T3 };

/** Z textové definice jamky postaví svět: buňky, výšky ve vrcholech, start, jamka, teleporty, překážky. */
export function buildWorld(def) {
  const rows = def.map; const h = rows.length; const w = Math.max(...rows.map((r) => r.length));
  const cells = new Uint8Array(w * h); const W = { w, h, cells, tee: [1.5, 1.5], cup: [w - 1.5, h - 1.5], tele: {}, objs: [], def, par: def.par, theme: def.theme };
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const ch = rows[z][x] ?? '#'; const t = CH[ch] ?? C.WALL; cells[z * w + x] = t;
    if (ch === 'T') W.tee = [x + 0.5, z + 0.5]; else if (ch === 'H') W.cup = [x + 0.5, z + 0.5];
    if (t >= C.T1) W.tele[t] = [x + 0.5, z + 0.5];
  }
  const hc = new Float32Array(w * h);   // výška políček
  if (def.hgt) for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) { const d = def.hgt[z] && def.hgt[z][x]; hc[z * w + x] = d >= '0' && d <= '9' ? (d.charCodeAt(0) - 48) * HU : 0; }
  const vw = w + 1, vh = h + 1; const hv = new Float32Array(vw * vh);
  for (let j = 0; j < vh; j++) for (let i = 0; i < vw; i++) {
    let s = 0, n = 0;
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) { const cx = i + dx, cz = j + dz; if (cx < 0 || cz < 0 || cx >= w || cz >= h) continue; if (cells[cz * w + cx] === C.WALL) continue; s += hc[cz * w + cx]; n++; }
    hv[j * vw + i] = n ? s / n : 0;
  }
  W.hv = hv; W.vw = vw;
  for (const o of def.objs || []) W.objs.push({ ...o });
  return W;
}
const solid = (W, cx, cz) => cx < 0 || cz < 0 || cx >= W.w || cz >= W.h || W.cells[cz * W.w + cx] === C.WALL;
export const cellType = (W, x, z) => { const cx = Math.floor(x), cz = Math.floor(z); return solid(W, cx, cz) ? C.WALL : W.cells[cz * W.w + cx]; };
const HV = { y: 0, gx: 0, gz: 0 };
/** Výška terénu a sklon v bodě (bilineární mezi vrcholy). Vrací sdílený objekt. */
export function heightAt(W, x, z) {
  const fx = Math.max(0, Math.min(W.w - 1e-6, x)), fz = Math.max(0, Math.min(W.h - 1e-6, z)); const i = Math.floor(fx), j = Math.floor(fz); const u = fx - i, v = fz - j;
  const k = j * W.vw + i; const h00 = W.hv[k], h10 = W.hv[k + 1], h01 = W.hv[k + W.vw], h11 = W.hv[k + W.vw + 1];
  HV.y = h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
  HV.gx = (h10 - h00) * (1 - v) + (h11 - h01) * v; HV.gz = (h01 - h00) * (1 - u) + (h11 - h10) * u;
  return HV;
}

// ------------------------------------------------------------------ pohyblivé překážky
const TAU = Math.PI * 2;
/** Úsečky (točící se tyče a lopatky mlýnu) v čase t: [ax, az, bx, bz, poloměr, pivotX, pivotZ, úhlová rychlost]. */
export function segsAt(W, t) {
  const out = [];
  for (const o of W.objs) {
    if (o.k === 'bar') { const a = (o.ph || 0) + (o.spd || 1) * t, c = Math.cos(a) * o.len / 2, s = Math.sin(a) * o.len / 2; out.push([o.x - c, o.z - s, o.x + c, o.z + s, (o.w || 0.2) / 2, o.x, o.z, o.spd || 1]); }
    else if (o.k === 'mill') { const n = o.arms || 4; for (let k = 0; k < n; k++) { const a = (o.ph || 0) + (o.spd || 1) * t + k * TAU / n; out.push([o.x, o.z, o.x + Math.cos(a) * o.len, o.z + Math.sin(a) * o.len, (o.w || 0.2) / 2, o.x, o.z, o.spd || 1]); } }
  }
  return out;
}
/** Pohyblivé a periodické obdélníky: [x0, z0, x1, z1, vx, vz, pevný?]. Posuvníky jezdí po přímce, brány se střídavě zvedají. */
export function rectsAt(W, t) {
  const out = [];
  for (const o of W.objs) {
    if (o.k === 'slider') { const a = TAU * t / o.per + (o.ph || 0), s = Math.sin(a) * o.amp, v = Math.cos(a) * o.amp * TAU / o.per; const cx = o.x + o.ax * s, cz = o.z + o.az * s; out.push([cx - o.w / 2, cz - o.d / 2, cx + o.w / 2, cz + o.d / 2, o.ax * v, o.az * v, true]); }
    else if (o.k === 'gate') { out.push([o.x - o.w / 2, o.z - o.d / 2, o.x + o.w / 2, o.z + o.d / 2, 0, 0, gateUp(o, t)]); }
  }
  return out;
}
/** Je brána v čase t nahoře (zeď)? */
export const gateUp = (o, t) => { const p = ((t / o.per + (o.ph || 0)) % 1 + 1) % 1; return p < (o.duty ?? 0.5); };
/** Je brána právě v pohybu (blíží se změna)? Pro kreslení: plynulý přechod 0–1. */
export function gateLift(o, t) { const p = ((t / o.per + (o.ph || 0)) % 1 + 1) % 1, d = o.duty ?? 0.5, e = 0.06; if (p < d - e) return 1; if (p < d) return (d - p) / e; if (p < 1 - e) return 0; return 0; }

// ------------------------------------------------------------------ míček
export const newBall = (x, z) => ({ x, z, vx: 0, vz: 0, y: BR, vy: 0, still: 99, sunk: false, tw: 0, hit: 0, hk: '' });
export const speedOf = (b) => Math.hypot(b.vx, b.vz);
export const isRest = (b) => b.still >= 12 && !b.sunk;
/** Rána: úhel (radiány, 0 = +x, π/2 = +z) a síla 0–1. */
export function shoot(b, ang, pow) { const v = powV(pow); b.vx = Math.cos(ang) * v; b.vz = Math.sin(ang) * v; b.still = 0; }

function pushCircle(b, cx, cz, r, e, vsx, vsz, kind) {   // míček proti kruhu (sloup, nárazník) s povrchovou rychlostí vs
  const dx = b.x - cx, dz = b.z - cz, rr = r + BR, d2 = dx * dx + dz * dz; if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2) || 1e-6; const nx = dx / d, nz = dz / d; b.x = cx + nx * rr; b.z = cz + nz * rr;
  contact(b, nx, nz, e, vsx, vsz, kind); return true;
}
function contact(b, nx, nz, e, vsx, vsz, kind) {
  const rvx = b.vx - vsx, rvz = b.vz - vsz; const vn = rvx * nx + rvz * nz; if (vn >= 0) return;
  b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz; b.hit = Math.max(b.hit, -vn); b.hk = kind;
  if (kind === 'b') { const sp = Math.hypot(b.vx, b.vz); if (sp < 6.5) { b.vx = b.vx / (sp || 1) * 6.5; b.vz = b.vz / (sp || 1) * 6.5; } }
}
function pushRect(b, x0, z0, x1, z1, e, vsx, vsz, kind) {
  const px = Math.max(x0, Math.min(x1, b.x)), pz = Math.max(z0, Math.min(z1, b.z)); const dx = b.x - px, dz = b.z - pz; const d2 = dx * dx + dz * dz;
  if (d2 >= BR * BR) return false;
  let nx, nz, pen;
  if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = BR - d; }
  else { const l = b.x - x0, r = x1 - b.x, u = b.z - z0, dn = z1 - b.z; const m = Math.min(l, r, u, dn); if (m === l) { nx = -1; nz = 0; } else if (m === r) { nx = 1; nz = 0; } else if (m === u) { nx = 0; nz = -1; } else { nx = 0; nz = 1; } pen = m + BR; }
  b.x += nx * pen; b.z += nz * pen; contact(b, nx, nz, e, vsx, vsz, kind); return true;
}
function segDist(b, s) {   // nejbližší bod úsečky k míčku
  const abx = s[2] - s[0], abz = s[3] - s[1]; const l2 = abx * abx + abz * abz || 1e-9; let u = ((b.x - s[0]) * abx + (b.z - s[1]) * abz) / l2; u = Math.max(0, Math.min(1, u)); return [s[0] + abx * u, s[1] + abz * u];
}


/** Míček u jamky: skutečné 3D. Jamka je válcová díra v zemi (poloměr CUP_R, hloubka CUP_DEPTH). Míček je koule, která se opírá o okraj (kružnici), když je jeho střed nad dírou,
 * a padá, jakmile střed přejde dovnitř; uvnitř naráží do stěny a odskakuje od dna. Všechno se počítá v rovině (vzdálenost od osy jamky, výška středu míčku nad zemí). */
function cupStep(W, b) {
  const dx = b.x - W.cup[0], dz = b.z - W.cup[1]; let d = Math.hypot(dx, dz); const rx = d > 1e-6 ? dx / d : 1, rz = d > 1e-6 ? dz / d : 0;
  let vr = b.vx * rx + b.vz * rz; const vt = -b.vx * rz + b.vz * rx;
  b.vy -= GF * DT; b.y += b.vy * DT;
  const R = CUP_R;
  if (d >= R) { if (b.y < BR) { b.y = BR; if (b.vy < 0) b.vy = 0; } }          // rovná zem kolem jamky
  if (b.y >= 0 && d < R + BR) {                                                  // okraj jamky (kružnice poloměru R ve výšce země)
    const dr = d - R, dist = Math.hypot(dr, b.y);
    if (dist < BR) {
      const nr = dist > 1e-6 ? dr / dist : 0, ny = dist > 1e-6 ? b.y / dist : 1;
      d = R + nr * BR; b.y = ny * BR; const vn = vr * nr + b.vy * ny;
      if (vn < 0) { const e = vn < -1.5 ? 0.3 : 0; vr -= (1 + e) * vn * nr; b.vy -= (1 + e) * vn * ny; }
    }
  } else if (b.y < 0) {                                                          // uvnitř díry: stěna válce
    if (d > R - BR) { d = R - BR; if (vr > 0) vr = -vr * 0.3; }
    const yb = -CUP_DEPTH + BR;
    if (b.y < yb) { b.y = yb; b.vy = b.vy < -1.2 ? -b.vy * 0.3 : 0; }
    if (b.y <= yb + 1e-6) { const k = Math.max(0, 1 - 7 * DT); vr *= k; b.vx *= k; b.vz *= k; if (Math.hypot(vr, vt) < 0.05) { vr = 0; b.vx = 0; b.vz = 0; } }
  }
  b.x = W.cup[0] + rx * d; b.z = W.cup[1] + rz * d;
  const tx = -rz, tz = rx; const vtt = b.y <= -CUP_DEPTH + BR + 1e-6 ? vt * Math.max(0, 1 - 7 * DT) : vt;
  b.vx = vr * rx + vtt * tx; b.vz = vr * rz + vtt * tz;
}

/** Jeden krok fyziky (DT). t = čas jamky v sekundách. Vrací událost: 'sink' (v jamce), 'hz' (spadl do vody/lávy), 'tp' (teleport) nebo null. */
export function stepBall(W, b, t) {
  if (b.sunk) { cupStep(W, b); return null; }
  b.hit = 0; b.hk = '';
  const hh = heightAt(W, b.x, b.z); let ax = -G * hh.gx, az = -G * hh.gz;
  const ty = cellType(W, b.x, b.z);
  const bo = BOOST[ty]; if (bo && b.vx * bo[0] + b.vz * bo[1] < BOOST_V) { ax += bo[0] * BOOST_A; az += bo[1] * BOOST_A; }
  for (const o of W.objs) if (o.k === 'wind' && b.x > o.x - o.w / 2 && b.x < o.x + o.w / 2 && b.z > o.z - o.d / 2 && b.z < o.z + o.d / 2) { ax += o.ax; az += o.az; }
  b.vx += ax * DT; b.vz += az * DT;
  const fr = FRIC[ty] || FRIC[C.GRASS]; const sp = Math.hypot(b.vx, b.vz);
  if (sp > 0 && b.y <= BR + 0.02 && b.y >= 0) { const dec = (fr[0] + fr[1] * sp) * DT; if (sp <= dec) { b.vx = 0; b.vz = 0; } else { const k = (sp - dec) / sp; b.vx *= k; b.vz *= k; } }
  b.x += b.vx * DT; b.z += b.vz * DT;
  // zdi (políčka)
  for (let it = 0; it < 2; it++) {
    let any = false; const x0 = Math.floor(b.x - BR), x1 = Math.floor(b.x + BR), z0 = Math.floor(b.z - BR), z1 = Math.floor(b.z + BR);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      if (!solid(W, cx, cz)) continue;
      const sx = b.x < cx ? -1 : b.x > cx + 1 ? 1 : 0, sz = b.z < cz ? -1 : b.z > cz + 1 ? 1 : 0;
      if (sx && sz && (solid(W, cx + sx, cz) || solid(W, cx, cz + sz))) continue;   // vnitřní roh mezi zdmi: ať neodráží "duchy"
      if (pushRect(b, cx, cz, cx + 1, cz + 1, WALL_E, 0, 0, 'w')) any = true;
    }
    for (const o of W.objs) {
      if (o.k === 'pillar') { if (pushCircle(b, o.x, o.z, o.r, 0.8, 0, 0, 'w')) any = true; }
      else if (o.k === 'bump') { if (pushCircle(b, o.x, o.z, o.r, 1, 0, 0, 'b')) any = true; }
      else if (o.k === 'mill' && pushCircle(b, o.x, o.z, o.hub || 0.28, 0.8, 0, 0, 'w')) any = true;
    }
    for (const s of segsAt(W, t)) { const p = segDist(b, s); const vsx = -s[7] * (p[1] - s[6]), vsz = s[7] * (p[0] - s[5]); if (pushCircle(b, p[0], p[1], s[4], 0.85, vsx, vsz, 'w')) any = true; }
    for (const r of rectsAt(W, t)) if (r[6] && pushRect(b, r[0], r[1], r[2], r[3], 0.85, r[4], r[5], 'w')) any = true;
    if (!any) break;
  }
  if (b.hit > 0) { const s2 = Math.hypot(b.vx, b.vz); if (b.hk === 'w' && s2 > 0) { const k = 1 - 0.02; b.vx *= k; b.vz *= k; } }
  if (b.vx === 0 && b.vz === 0) b.still++; else b.still = 0;
  const ty2 = cellType(W, b.x, b.z);
  if (ty2 === C.HAZ) { b.vx = b.vz = 0; return 'hz'; }
  if (ty2 < C.T1) b.tw = 0;
  else if (!b.tw) { const p = W.tele[PARTNER[ty2]]; if (p) { b.x = p[0]; b.z = p[1]; b.tw = 1; const s2 = Math.hypot(b.vx, b.vz) || 1; if (s2 < 3) { b.vx = b.vx / s2 * 3; b.vz = b.vz / s2 * 3; } return 'tp'; } }
  const d = Math.hypot(W.cup[0] - b.x, W.cup[1] - b.z);
  if (d < CUP_R + BR + 0.05 || b.y !== BR) { cupStep(W, b); if (b.y !== BR || b.vy !== 0) b.still = 0; if (b.y < -BR) { b.sunk = true; return 'sink'; } }
  return null;
}

/** Zkusí ránu bez kreslení (pro boty a testy): vrací { x, z, ev, steps } po zastavení, dopadu do vody nebo jamce. */
export function simulate(W, x, z, ang, pow, t0 = 0, maxSteps = 2400) {
  const b = newBall(x, z); shoot(b, ang, pow); let ev = null, n = 0;
  for (; n < maxSteps; n++) { ev = stepBall(W, b, t0 + n * DT); if (ev === 'hz' || ev === 'sink') break; if (isRest(b)) break; }
  return { x: b.x, z: b.z, ev, steps: n, rest: isRest(b) };
}

/** Pole vzdáleností k jamce po průchodných políčkách (bez překážek): pro boty a testy. */
export function distField(W) {
  const { w, h } = W; const d = new Float32Array(w * h).fill(1e9); const cx = Math.floor(W.cup[0]), cz = Math.floor(W.cup[1]);
  const pass = (x, z) => { if (solid(W, x, z)) return false; return W.cells[z * w + x] !== C.HAZ; };
  const q = [[cx, cz]]; d[cz * w + cx] = 0; const link = {};   // teleporty: spojení políček
  for (const [a, b] of [[C.T1, C.T2], [C.T3, C.T4]]) if (W.tele[a] && W.tele[b]) { const pa = Math.floor(W.tele[a][1]) * w + Math.floor(W.tele[a][0]), pb = Math.floor(W.tele[b][1]) * w + Math.floor(W.tele[b][0]); link[pa] = pb; link[pb] = pa; }
  while (q.length) {
    const [x, z] = q.shift(); const cur = d[z * w + x];
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
    for (const [dx, dz, c] of nb) { const nx = x + dx, nz = z + dz; if (!pass(nx, nz)) continue; if (dx && dz && (!pass(x + dx, z) || !pass(x, z + dz))) continue; if (cur + c < d[nz * w + nx]) { d[nz * w + nx] = cur + c; q.push([nx, nz]); } }
    const l = link[z * w + x]; if (l !== undefined && cur < d[l]) { d[l] = cur; q.push([l % w, Math.floor(l / w)]); }
  }
  return d;
}
export const distAt = (W, d, x, z) => { const cx = Math.floor(x), cz = Math.floor(z); if (cx < 0 || cz < 0 || cx >= W.w || cz >= W.h) return 1e9; return d[cz * W.w + cx] + 0.3 * Math.hypot(W.cup[0] - x, W.cup[1] - z); };
