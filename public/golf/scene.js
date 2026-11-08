// MINIGOLF – 3D scéna (three.js): stavba jamky z mapy (terén po vrcholech, zdi, voda/láva, překážky, vlajka), míčky se jmenovkami, částice, kamera.
// Fyzika je v phys.js (stejná jako na serveru), tady se jen kreslí. Všechno se kreslí z dat, žádné obrázky.
import * as THREE from './vendor/three.module.min.js';
import * as P from './phys.js?v=4';
import { SKIN_ART } from './cosm.js?v=4';

const rgb = (h) => new THREE.Color(h);
// Vzhled prostředí: nebe (nahoře, u obzoru), mlha, barvy podlahy, písku, ledu, zdí, tekutiny, okolí a doplňky.
export const THEMES = {
  meadow: { sky: [0x58b8ff, 0xdff6ff], fog: 0xcdefff, floor: [0x63d35b, 0x59c852], sand: 0xf3dc94, ice: 0xc4ecff, wallSide: 0xc08a52, wallTop: 0xfaf3e2, liq: 0x2f93ff, liqEm: 0x0a3a80, out: 0x4fae4a, flag: 0xff3b3b, sun: 0xfff2d0, hemi: [0xdff4ff, 0x77c46a] },
  desert: { sky: [0xffb866, 0xffe9c2], fog: 0xffe0b0, floor: [0xe0a35c, 0xd69852], sand: 0xfbe58f, ice: 0xc4ecff, wallSide: 0xa5622b, wallTop: 0xfff0cf, liq: 0x28d0d8, liqEm: 0x0a5a60, out: 0xe0b46c, flag: 0x1c8fff, sun: 0xffe4b0, hemi: [0xfff0d8, 0xc89a5c] },
  ice: { sky: [0x7fc7ff, 0xf1fbff], fog: 0xe6f7ff, floor: [0xc2ebff, 0xb7e3fa], sand: 0xf3f3e8, ice: 0xc2ebff, wallSide: 0xb5cde4, wallTop: 0xffffff, liq: 0x2a6fbf, liqEm: 0x0a2a60, out: 0xf4fbff, flag: 0xff4f6a, sun: 0xeaf6ff, hemi: [0xeaf6ff, 0x9fc4e0] },
  lava: { sky: [0x1a0710, 0x7a2a14], fog: 0x4a1a14, floor: [0x6e5656, 0x654e4e], sand: 0x8a6a4a, ice: 0xc4ecff, wallSide: 0x2a2226, wallTop: 0x4a3c42, liq: 0xff5a14, liqEm: 0xff3a00, out: 0x2a1c1e, flag: 0xffd24a, sun: 0xffc090, hemi: [0xff9a6a, 0x3a2022] },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
}
const chevTex = (col) => canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = col; for (let k = 0; k < 2; k++) { const x = 8 + k * 60; g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 40, 64); g.lineTo(x, 112); g.lineTo(x + 18, 112); g.lineTo(x + 58, 64); g.lineTo(x + 18, 16); g.closePath(); g.fill(); } }, true);
const stripeTex = (a, b) => canvasTex(64, 64, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; for (let k = -2; k < 6; k++) { g.beginPath(); g.moveTo(k * 16, 0); g.lineTo(k * 16 + 8, 0); g.lineTo(k * 16 + 8 + 64, 64); g.lineTo(k * 16 + 64, 64); g.fill(); } }, true);
const liquidTex = (col, hi) => canvasTex(128, 128, (g, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); g.strokeStyle = hi; g.lineWidth = 3; g.globalAlpha = 0.55; for (let k = 0; k < 9; k++) { const y = (k + 0.5) * h / 9; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 128 * Math.PI * 2 + k) * 5); g.stroke(); } }, true);
const blobTex = canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
const glowTex = canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });

export function createScene(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  let shadows = opts.shadows !== false; renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.5); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(-8, 16, 6); sun.castShadow = true; sun.shadow.mapSize.set(opts.shadowSize || 2048, opts.shadowSize || 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; scene.add(sun, sun.target);
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: rgb(0x58b8ff) }, hor: { value: rgb(0xdff6ff) } },
    vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top;\nuniform vec3 hor;\nvarying vec3 vp;\nvoid main(){\n float h = clamp(normalize(vp).y * 1.6, 0.0, 1.0);\n gl_FragColor = vec4(mix(hor, top, pow(h, 0.7)), 1.0);\n#include <colorspace_fragment>\n}' });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), skyMat); sky.renderOrder = -10; scene.add(sky);
  let holeGroup = null; const anim = []; let flag = null, W = null, th = THEMES.meadow, clock = 0;
  const mats = new Set(); const geos = new Set();
  const own = (o) => { if (o.geometry) geos.add(o.geometry); return o; };
  const std = (o) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o }); mats.add(m); return m; };
  const lam = (o) => { const m = new THREE.MeshLambertMaterial(o); mats.add(m); return m; };
  const bas = (o) => { const m = new THREE.MeshBasicMaterial(o); mats.add(m); return m; };
  function clearHole() { if (holeGroup) { scene.remove(holeGroup); holeGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } for (const m of mats) { if (m.map && m.map !== blobTex && m.map !== glowTex) m.map.dispose(); m.dispose(); } mats.clear(); anim.length = 0; flag = null; }

  // ---------------------------------------------------------------- stavba jamky
  function setHole(world) {
    clearHole(); W = world; th = THEMES[world.theme] || THEMES.meadow; const w = W.w, h = W.h;
    holeGroup = new THREE.Group(); scene.add(holeGroup);
    skyMat.uniforms.top.value.set(th.sky[0]); skyMat.uniforms.hor.value.set(th.sky[1]); scene.fog = new THREE.Fog(th.fog, 30, 130);
    hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = world.theme === 'lava' ? 1.2 : 1.55; sun.color.set(th.sun); sun.intensity = world.theme === 'lava' ? 1.6 : 2.4;
    const cx = w / 2, cz = h / 2; const R = Math.max(w, h) * 0.75;
    sun.position.set(cx - 0.5 * R, 1.1 * R, cz + 0.35 * R); sun.target.position.set(cx, 0, cz);
    const sc = sun.shadow.camera; sc.left = -R * 0.75; sc.right = R * 0.75; sc.top = R * 0.75; sc.bottom = -R * 0.75; sc.near = 1; sc.far = R * 4; sc.updateProjectionMatrix();
    const hv = (i, j) => W.hv[j * W.vw + i]; const type = (x, z) => (x < 0 || z < 0 || x >= w || z >= h ? P.C.WALL : W.cells[z * w + x]);
    const pos = [], col = [], hpos = [], hcol = [], huv = [], wpos = [], wcol = [], curb = [], curbc = [];
    const push = (a, p, c, i, j, y, k) => { a.push(i, y ?? hv(i, j), j); c.push(k[0], k[1], k[2]); };
    const fl0 = rgb(th.floor[0]), fl1 = rgb(th.floor[1]), sand = rgb(th.sand), ice = rgb(th.ice);
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const t = type(x, z); if (t === P.C.WALL) continue;
      let base = (x + z) & 1 ? fl1 : fl0; if (t === P.C.SAND) base = (x + z) & 1 ? sand.clone().multiplyScalar(0.95) : sand; else if (t === P.C.ICE && world.theme !== 'ice') base = ice;
      const quad = (arr, carr, ys, kk, uv) => { const c = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]]; const ord = [0, 2, 1, 1, 2, 3]; for (const o of ord) { const [i, j] = c[o]; arr.push(i, ys ? ys : hv(i, j), j); const k = kk(i, j); carr.push(k.r, k.g, k.b); if (uv) uv.push(i * 0.5, j * 0.5); } };
      if (t === P.C.HAZ) {
        const lvl = Math.min(hv(x, z), hv(x + 1, z), hv(x, z + 1), hv(x + 1, z + 1)) - 0.1; quad(hpos, hcol, lvl, () => ({ r: 1, g: 1, b: 1 }), huv);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nt = type(x + dx, z + dz); if (nt === P.C.HAZ || nt === P.C.WALL) continue; const e = dx ? [[x + (dx > 0 ? 1 : 0), z], [x + (dx > 0 ? 1 : 0), z + 1]] : [[x, z + (dz > 0 ? 1 : 0)], [x + 1, z + (dz > 0 ? 1 : 0)]]; const dark = rgb(th.wallSide).multiplyScalar(0.8); const [a, b] = e; const ys = (p) => hv(p[0], p[1]); curb.push(a[0], ys(a), a[1], b[0], ys(b), b[1], b[0], lvl, b[1], a[0], ys(a), a[1], b[0], lvl, b[1], a[0], lvl, a[1]); for (let q = 0; q < 6; q++) curbc.push(dark.r, dark.g, dark.b); }
        continue;
      }
      quad(pos, col, 0, (i, j) => { const k = base.clone(); let ao = 1; for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (type(i + dx, j + dz) === P.C.WALL) ao = 0.82; return k.multiplyScalar(ao); });
    }
    const gGeo = new THREE.BufferGeometry(); gGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gGeo.computeVertexNormals();
    const ground = new THREE.Mesh(gGeo, std({ vertexColors: true, roughness: world.theme === 'ice' ? 0.3 : 0.95 })); ground.receiveShadow = true; holeGroup.add(ground);
    ground.material.onBeforeCompile = (sh) => {   // skutečná díra v zemi: fragmenty uvnitř jamky se zahodí
      sh.uniforms.uCup = { value: new THREE.Vector2(W.cup[0], W.cup[1]) }; sh.uniforms.uCupR = { value: P.CUP_R };
      sh.vertexShader = 'varying vec2 vWxz;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'varying vec2 vWxz; uniform vec2 uCup; uniform float uCupR;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (distance(vWxz, uCup) < uCupR) discard;');
    };
    if (hpos.length) {
      const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(hpos, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(huv, 2)); hg.computeVertexNormals();
      const lava = world.theme === 'lava'; const lt = liquidTex(lava ? '#ff6a1a' : '#' + rgb(th.liq).getHexString(), lava ? '#ffd24a' : '#bfe6ff'); const lm = std({ map: lt, emissive: rgb(th.liqEm), emissiveIntensity: lava ? 0.9 : 0.25, roughness: 0.25, transparent: !lava, opacity: lava ? 1 : 0.92 });
      holeGroup.add(new THREE.Mesh(hg, lm)); anim.push((t) => { lt.offset.x = t * 0.04; lt.offset.y = t * 0.02; lm.emissiveIntensity = lava ? 0.75 + Math.sin(t * 2) * 0.2 : 0.25; });
      const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(curb, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(curbc, 3)); cg.computeVertexNormals(); holeGroup.add(new THREE.Mesh(cg, std({ vertexColors: true, side: THREE.DoubleSide })));
    }
    // zdi: vrch + boční stěny (dolů k terénu, ven až pod zem)
    const wallTop = rgb(th.wallTop), wallSide = rgb(th.wallSide); const rendered = (x, z) => { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (type(x + dx, z + dz) !== P.C.WALL) return true; return false; };
    const WH = 0.42;
    for (let z = -1; z <= h; z++) for (let x = -1; x <= w; x++) {
      if (type(x, z) !== P.C.WALL || !rendered(x, z)) continue; if (x < 0 || z < 0 || x >= w || z >= h) continue;
      const top = (hv(x, z) + hv(x + 1, z) + hv(x, z + 1) + hv(x + 1, z + 1)) / 4 + WH;
      const tri = (a, b, c, k) => { for (const p of [a, b, c]) { wpos.push(p[0], p[1], p[2]); wcol.push(k(p).r, k(p).g, k(p).b); } };
      const kTop = () => wallTop;
      tri([x, top, z], [x, top, z + 1], [x + 1, top, z], kTop); tri([x + 1, top, z], [x, top, z + 1], [x + 1, top, z + 1], kTop);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz; const nt = type(nx, nz); const vis = nt !== P.C.WALL || !rendered(nx, nz); if (!vis) continue;
        const e = dx ? [[x + (dx > 0 ? 1 : 0), z], [x + (dx > 0 ? 1 : 0), z + 1]] : [[x, z + (dz > 0 ? 1 : 0)], [x + 1, z + (dz > 0 ? 1 : 0)]];
        const [a, b] = dx > 0 || dz < 0 ? e : [e[1], e[0]]; const outer = nt === P.C.WALL; const ya = outer ? -0.4 : hv(a[0], a[1]) - 0.05, yb = outer ? -0.4 : hv(b[0], b[1]) - 0.05;
        const dark = wallSide.clone().multiplyScalar(0.72); const kk = (p) => (p[1] >= top - 0.001 ? wallSide : dark);
        tri([a[0], top, a[1]], [a[0], ya, a[1]], [b[0], yb, b[1]], kk); tri([a[0], top, a[1]], [b[0], yb, b[1]], [b[0], top, b[1]], kk);
      }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3)); wg.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3)); wg.computeVertexNormals();
    const walls = new THREE.Mesh(wg, std({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 })); walls.castShadow = true; walls.receiveShadow = true; holeGroup.add(walls);
    // okolí: velká plocha pod hřištěm a dekorace
    const out = new THREE.Mesh(new THREE.CircleGeometry(260, 40), std({ color: th.out, roughness: 1 })); out.rotation.x = -Math.PI / 2; out.position.set(cx, -0.42, cz); out.receiveShadow = true; holeGroup.add(out);
    buildScenery(cx, cz);
    // značky: start, jamka, vlajka
    const [tx, tz] = W.tee; const tHeight = P.heightAt(W, tx, tz).y;
    const mat = new THREE.Mesh(new THREE.CircleGeometry(0.36, 28), bas({ map: canvasTex(64, 64, (g, ww, hh) => { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(32, 32, 22, 0, 7); g.fill(); }), transparent: true, depthWrite: false })); mat.rotation.x = -Math.PI / 2; mat.position.set(tx, tHeight + 0.012, tz); holeGroup.add(mat);
    const [cxp, czp] = W.cup; const cH = P.heightAt(W, cxp, czp).y;
    // jamka: plastový kalíšek zapuštěný do země (světlé stěny, ke dnu tmavší, žádná černá), bílý okraj
    { const D = P.CUP_DEPTH, R = P.CUP_R; const cg = new THREE.CylinderGeometry(R, R, D, 36, 1, true); const cc = []; const pa = cg.attributes.position;
      for (let i = 0; i < pa.count; i++) { const k = 0.38 + 0.62 * ((pa.getY(i) + D / 2) / D); cc.push(0.9 * k, 0.92 * k, 0.94 * k); } cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      const wall = new THREE.Mesh(cg, std({ vertexColors: true, side: THREE.BackSide, roughness: 0.8 })); wall.position.set(cxp, cH - D / 2 - 0.001, czp); holeGroup.add(wall);
      const bot = new THREE.Mesh(new THREE.CircleGeometry(R, 36), std({ color: 0x6f757b, roughness: 0.9 })); bot.rotation.x = -Math.PI / 2; bot.position.set(cxp, cH - D, czp); holeGroup.add(bot);
      const rim = new THREE.Mesh(new THREE.RingGeometry(R - 0.004, R + 0.045, 36), bas({ color: 0xf6f6f0 })); rim.rotation.x = -Math.PI / 2; rim.position.set(cxp, cH + 0.004, czp); holeGroup.add(rim); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 8), std({ color: 0xf2f2f2 })); pole.position.set(cxp + 0.04, cH + 0.75, czp); pole.castShadow = true; holeGroup.add(pole);
    const fg = new THREE.PlaneGeometry(0.62, 0.36, 8, 1); fg.translate(0.31, 0, 0); const fm = std({ color: th.flag, side: THREE.DoubleSide, roughness: 0.6 }); flag = new THREE.Mesh(fg, fm); flag.position.set(cxp + 0.05, cH + 1.34, czp); flag.castShadow = true; holeGroup.add(flag);
    const gold = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), std({ color: 0xffd24a, metalness: 0.6, roughness: 0.3 })); gold.position.set(cxp + 0.04, cH + 1.52, czp); holeGroup.add(gold);
    const fo = fg.attributes.position.array.slice(); anim.push((t) => { const a = fg.attributes.position; for (let i = 0; i < a.count; i++) { const x = fo[i * 3]; a.setZ(i, Math.sin(t * 5 - x * 7) * 0.06 * (x / 0.62)); } a.needsUpdate = true; });
    // políčka s efektem a překážky
    const dirs = { [P.C.BE]: [1, 0], [P.C.BW]: [-1, 0], [P.C.BN]: [0, -1], [P.C.BS]: [0, 1] }; const chev = chevTex('#ffe14a'); const padMat = bas({ map: chev, transparent: true, depthWrite: false, color: 0xffffff });
    const padBase = bas({ color: 0xffb800, transparent: true, opacity: 0.55, depthWrite: false });
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const t = type(x, z); const y = P.heightAt(W, x + 0.5, z + 0.5).y;
      if (dirs[t]) { const d = dirs[t]; const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), padMat); m.position.set(x + 0.5, y + 0.016, z + 0.5);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(d[1], d[0])); m.quaternion.copy(q2.multiply(q)); holeGroup.add(m);
        const b = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), padBase); b.rotation.x = -Math.PI / 2; b.position.set(x + 0.5, y + 0.012, z + 0.5); holeGroup.add(b); }
    }
    anim.push((t) => { chev.offset.x = -((t * 0.9) % 1); });
    const teleCol = { [P.C.T1]: 0xb35cff, [P.C.T2]: 0xb35cff, [P.C.T3]: 0xff5ca8, [P.C.T4]: 0xff5ca8 };
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) { const t = type(x, z); if (t < P.C.T1) continue; const y = P.heightAt(W, x + 0.5, z + 0.5).y; const c = teleCol[t];
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.44, 24), bas({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(x + 0.5, y + 0.02, z + 0.5); holeGroup.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 20, 1, true), bas({ color: c, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.set(x + 0.5, y + 0.55, z + 0.5); holeGroup.add(beam);
      anim.push((tt) => { ring.rotation.z = tt * 1.6; ring.scale.setScalar(1 + Math.sin(tt * 4 + x) * 0.08); beam.rotation.y = -tt; beam.material.opacity = 0.18 + Math.sin(tt * 3) * 0.06; }); }
    for (const o of W.objs) buildObj(o);
  }

  function buildObj(o) {
    const g = new THREE.Group(); holeGroup.add(g); const y = P.heightAt(W, o.x ?? 0, o.z ?? 0).y; const T = W.theme;
    const cast = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
    if (o.k === 'pillar') {
      g.position.set(o.x, y, o.z);
      if (T === 'meadow') { g.add(cast(new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.55, o.r * 0.7, 0.8, 10), std({ color: 0x8a5a2b })))).position.y = 0.4; const f = cast(new THREE.Mesh(new THREE.SphereGeometry(o.r * 1.35, 14, 10), std({ color: 0x2f9c3c }))); f.position.y = 1.0; g.add(f); const f2 = cast(new THREE.Mesh(new THREE.SphereGeometry(o.r * 0.95, 12, 8), std({ color: 0x45b84c }))); f2.position.set(0.1, 1.45, 0.05); g.add(f2); }
      else if (T === 'desert') { const c = std({ color: 0x3f9a4a }); const body = cast(new THREE.Mesh(new THREE.CapsuleGeometry(o.r * 0.7, 0.9, 6, 12), c)); body.position.y = 0.6; g.add(body); for (const s of [-1, 1]) { const arm = cast(new THREE.Mesh(new THREE.CapsuleGeometry(o.r * 0.32, 0.35, 4, 8), c)); arm.position.set(s * o.r * 1.05, 0.75 + s * 0.08, 0); g.add(arm); const up = cast(new THREE.Mesh(new THREE.CapsuleGeometry(o.r * 0.3, 0.3, 4, 8), c)); up.position.set(s * o.r * 1.3, 1.05 + s * 0.08, 0); g.add(up); } }
      else if (T === 'ice') { const cr = cast(new THREE.Mesh(new THREE.OctahedronGeometry(o.r * 1.1, 0), std({ color: 0x9fe0ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.88 }))); cr.scale.set(1, 2.1, 1); cr.position.y = o.r * 2.0; g.add(cr); const c2 = cast(new THREE.Mesh(new THREE.OctahedronGeometry(o.r * 0.6, 0), std({ color: 0xc8f0ff, roughness: 0.1, transparent: true, opacity: 0.9 }))); c2.scale.set(1, 1.7, 1); c2.position.set(o.r * 0.8, o.r * 0.9, 0.1); g.add(c2); }
      else { const rk = cast(new THREE.Mesh(new THREE.DodecahedronGeometry(o.r * 1.15, 0), std({ color: 0x3a2e34, roughness: 0.9 }))); rk.scale.set(1, 1.5, 1); rk.position.y = o.r * 1.2; g.add(rk); const gl = new THREE.Mesh(new THREE.SphereGeometry(o.r * 0.5, 10, 8), bas({ color: 0xff6a1a })); gl.position.set(0, o.r * 0.4, o.r * 0.6); g.add(gl); }
    } else if (o.k === 'bump') {
      g.position.set(o.x, y, o.z);
      const base = cast(new THREE.Mesh(new THREE.CylinderGeometry(o.r * 1.05, o.r * 1.15, 0.2, 20), std({ color: 0x2b2b3a, roughness: 0.4, metalness: 0.4 }))); base.position.y = 0.1; g.add(base);
      const capM = std({ color: 0xff4a6a, emissive: 0xff2a50, emissiveIntensity: 0.5, roughness: 0.25 }); const cap = cast(new THREE.Mesh(new THREE.SphereGeometry(o.r, 20, 12), capM)); cap.scale.y = 0.7; cap.position.y = 0.3; g.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(o.r * 0.78, 0.04, 8, 24), bas({ color: 0xffffff })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.32; g.add(ring);
      anim.push((t) => { const s = 1 + Math.max(0, Math.sin(t * 4 + o.x)) * 0.03; cap.scale.set(s, 0.7 * s, s); capM.emissiveIntensity = 0.4 + Math.sin(t * 5 + o.z) * 0.25; });
    } else if (o.k === 'bar') {
      const tex = stripeTex('#ff7a1a', '#fff3d0'); tex.repeat.set(o.len * 1.5, 1); const bw = o.w || 0.2;
      const bar = cast(new THREE.Mesh(new THREE.BoxGeometry(o.len + bw, 0.42, bw), std({ map: tex }))); bar.position.y = y + 0.24; g.add(bar); const hub = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.55, 14), std({ color: 0x353545, metalness: 0.4, roughness: 0.4 }))); hub.position.set(o.x, y + 0.27, o.z); g.add(hub);
      anim.push((t) => { bar.position.set(o.x, y + 0.24, o.z); bar.rotation.y = -((o.ph || 0) + (o.spd || 1) * t); });
    } else if (o.k === 'mill') {
      const arms = o.arms || 4; const hub = o.hub || 0.28; const house = cast(new THREE.Mesh(new THREE.CylinderGeometry(hub * 0.8, hub * 1.05, 0.9, 14), std({ color: 0xf2e7d0 }))); house.position.set(o.x, y + 0.45, o.z); g.add(house);
      const roof = cast(new THREE.Mesh(new THREE.ConeGeometry(hub * 1.15, 0.45, 14), std({ color: 0xc8402a }))); roof.position.set(o.x, y + 1.1, o.z); g.add(roof);
      const rot = new THREE.Group(); rot.position.set(o.x, y + 0.5, o.z); g.add(rot); const bw = o.w || 0.24; const tex = stripeTex('#ffffff', '#e86a4a'); tex.repeat.set(o.len, 1);
      for (let k = 0; k < arms; k++) { const arm = cast(new THREE.Mesh(new THREE.BoxGeometry(o.len, 0.5, bw), std({ map: tex }))); arm.position.x = o.len / 2; const pv = new THREE.Group(); pv.rotation.y = -k * Math.PI * 2 / arms; pv.add(arm); rot.add(pv); }
      anim.push((t) => { rot.rotation.y = -((o.ph || 0) + (o.spd || 1) * t); });
    } else if (o.k === 'slider') {
      const tex = stripeTex('#3a8dff', '#ffffff'); tex.repeat.set(Math.max(1, o.w * 2), Math.max(1, o.d * 2)); const box = cast(new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.5, o.d), std({ map: tex, roughness: 0.5 }))); g.add(box);
      anim.push((t) => { const a = Math.PI * 2 * t / o.per + (o.ph || 0); const s = Math.sin(a) * o.amp; box.position.set(o.x + o.ax * s, y + 0.25, o.z + o.az * s); });
    } else if (o.k === 'gate') {
      const tex = stripeTex('#ff3b3b', '#ffffff'); tex.repeat.set(Math.max(1, o.w * 2), Math.max(1, o.d * 2)); const box = cast(new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.6, o.d), std({ map: tex, roughness: 0.5 })));
      g.add(box); anim.push((t) => { const p = ((t / o.per + (o.ph || 0)) % 1 + 1) % 1; const d = o.duty ?? 0.5; const lift = p < d ? Math.min(1, p / 0.05, (d - p) / 0.06) : 0; box.position.set(o.x, y + 0.3 - 0.62 * (1 - clamp(lift, 0, 1)), o.z); });
    } else if (o.k === 'wind') {
      const t2 = chevTex('#ffffff'); t2.repeat.set(o.w, o.d); const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.d), bas({ map: t2, transparent: true, opacity: 0.3, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(o.x, y + 0.03, o.z); g.add(m); anim.push((t) => { t2.offset.x = -((t * 0.8) % 1) * Math.sign(o.ax || 1); });
    }
  }

  // okolí hřiště: kopce, stromy, kaktusy, krystaly... rozmístěné kolem hřiště (mimo něj), jedna instanční síť na typ
  function buildScenery(cx, cz) {
    let s = (W.def.index * 131 + (W.def.course || 0) * 17 + 7) >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const T = W.theme; const base = Math.hypot(W.w, W.h) / 2 + 2;
    const inst = (geo, mat, list) => { const m = new THREE.InstancedMesh(geo, mat, list.length); const d = new THREE.Object3D(); list.forEach((q, i) => { d.position.set(q.x, q.y, q.z); d.scale.set(q.sx, q.sy, q.sz); d.rotation.y = q.r || 0; d.updateMatrix(); m.setMatrixAt(i, d.matrix); }); m.receiveShadow = true; holeGroup.add(m); };
    const place = (n, dmin, dmax, size) => { const out = []; for (let i = 0; i < n; i++) { const q = size(rnd), rad = Math.max(q.sx, q.sz) * (q.big ? 0.95 : 0.6); const a = rnd() * Math.PI * 2, d = base + rad + dmin + rnd() * (dmax - dmin); q.x = cx + Math.cos(a) * d * (W.w >= W.h ? 1.25 : 1); q.z = cz + Math.sin(a) * d * (W.w >= W.h ? 1 : 1.25); out.push(q); } return out; };
    const at = (list, f) => list.map((q) => ({ ...q, ...f(q) }));
    if (T === 'meadow') {
      inst(new THREE.SphereGeometry(1, 16, 10), std({ color: 0x57b84e }), place(9, 4, 40, (r) => ({ big: 1, y: -0.4, sx: 6 + r() * 8, sy: 2.5 + r() * 3.5, sz: 6 + r() * 8 })));
      const trees = place(24, 1, 34, (r) => ({ sx: 0.8 + r() * 0.5, sy: 0.8 + r() * 0.7, sz: 0.8 + r() * 0.5 }));
      inst(new THREE.ConeGeometry(0.9, 2.6, 8), std({ color: 0x2c8a3c }), at(trees, (q) => ({ y: 0.9 + q.sy * 0.9 })));
      inst(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 6), std({ color: 0x7a4a22 }), at(trees, (q) => ({ y: 0.05, sx: 1, sy: 1, sz: 1 })));
    } else if (T === 'desert') {
      inst(new THREE.SphereGeometry(1, 16, 10), std({ color: 0xe3b36b }), place(10, 3, 40, (r) => ({ big: 1, y: -0.5, sx: 7 + r() * 9, sy: 1.8 + r() * 3, sz: 5 + r() * 7, r: r() * 3 })));
      inst(new THREE.ConeGeometry(2.2, 3.2, 4), std({ color: 0xd9a35a }), place(3, 12, 36, (r) => ({ big: 1, y: 1.1, sx: 1 + r(), sy: 1 + r(), sz: 1 + r(), r: 0.78 })));
      inst(new THREE.CapsuleGeometry(0.22, 1.1, 4, 8), std({ color: 0x3f9a4a }), place(14, 1, 32, (r) => ({ y: 0.5, sx: 1, sy: 0.8 + r() * 1, sz: 1 })));
    } else if (T === 'ice') {
      inst(new THREE.SphereGeometry(1, 16, 10), std({ color: 0xf7fcff }), place(9, 4, 40, (r) => ({ big: 1, y: -0.4, sx: 6 + r() * 8, sy: 2 + r() * 3, sz: 6 + r() * 8 })));
      inst(new THREE.ConeGeometry(0.9, 3, 8), std({ color: 0xeaf6ff }), place(22, 1, 34, (r) => ({ y: 1.1, sx: 0.7 + r() * 0.6, sy: 0.8 + r() * 1.0, sz: 0.7 + r() * 0.6 })));
      inst(new THREE.OctahedronGeometry(1, 0), std({ color: 0x9fe0ff, transparent: true, opacity: 0.85, roughness: 0.1 }), place(8, 4, 34, (r) => ({ y: 1.4, sx: 1 + r(), sy: 2.4 + r() * 2, sz: 1 + r(), r: r() * 3 })));
    } else {
      inst(new THREE.ConeGeometry(5, 7, 10), std({ color: 0x2e2024 }), place(7, 6, 44, (r) => ({ big: 1, y: 2.8, sx: 0.8 + r(), sy: 0.8 + r() * 1.2, sz: 0.8 + r() })));
      inst(new THREE.ConeGeometry(0.5, 2.4, 5), std({ color: 0x3a2a30 }), place(20, 1, 34, (r) => ({ y: 0.7, sx: 0.8 + r() * 0.8, sy: 0.8 + r(), sz: 0.8 + r() * 0.8 })));
    }
  }

  // ---------------------------------------------------------------- míčky, jmenovky, zaměřovač, částice
  const balls = []; const ballGeo = new THREE.SphereGeometry(P.BR, 24, 16);
  const ballTex = (c) => canvasTex(128, 64, (g, w, h) => { g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 26, w, 12); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, 20, h); });
  function labelSprite(name, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.font = '700 30px system-ui,sans-serif'; const tw = Math.min(236, g.measureText(name).width + 34);
    g.fillStyle = 'rgba(10,25,20,.72)'; g.beginPath(); g.roundRect(128 - tw / 2, 8, tw, 48, 24); g.fill(); g.fillStyle = color; g.beginPath(); g.arc(128 - tw / 2 + 20, 32, 9, 0, 7); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 128 + 10, 33, tw - 44);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(1.5, 0.375, 1); sp.renderOrder = 20; return sp;
  }
  function setBalls(list) {   // list: [{ color: '#hex', name, mine, skin }]; skin = id skinu z obchodu (nebo prázdné = obyčejný míček v barvě hráče)
    for (const b of balls) { scene.remove(b.g); b.g.traverse((o) => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); } balls.length = 0;
    list.forEach((p) => {
      const art = p.skin ? SKIN_ART[p.skin] : null; const op = p.mine ? 1 : 0.6; let mat;
      if (art) {
        const map = canvasTex(256, 128, (g, w, h) => art.paint(g, w, h), true); map.wrapT = THREE.ClampToEdgeWrapping;
        mat = new THREE.MeshStandardMaterial({ map, roughness: art.rough, metalness: art.metal, transparent: true, opacity: op });
        if (art.em) { mat.emissive = new THREE.Color(art.em[0]); mat.emissiveMap = map; mat.emissiveIntensity = art.em[1]; }
      } else mat = new THREE.MeshStandardMaterial({ map: ballTex(p.color), roughness: 0.25, metalness: 0.05, transparent: true, opacity: op, emissive: new THREE.Color(p.color), emissiveIntensity: 0.12 });
      const g = new THREE.Group(); const mesh = new THREE.Mesh(ballGeo, mat); mesh.castShadow = true; g.add(mesh);
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: shadows ? 0 : 1 })); sh.rotation.x = -Math.PI / 2; g.add(sh);
      const label = p.mine ? null : labelSprite(p.name, p.color); if (label) { label.position.y = 0.75; g.add(label); }
      scene.add(g); balls.push({ g, mesh, sh, label, mat, art, x: 0, z: 0, q: new THREE.Quaternion(), px: null, pz: null, vis: 1, sink: 0 });
    });
  }
  function moveBall(i, x, z, vis = 1, alpha) {
    const b = balls[i]; if (!b) return; const hh = P.heightAt(W, x, z).y; if (b.px !== null) { const dx = x - b.px, dz = z - b.pz, d = Math.hypot(dx, dz); if (d > 1e-5 && d < 2) { const axis = new THREE.Vector3(dz, 0, -dx).normalize(); b.q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, d / P.BR)); b.mesh.quaternion.copy(b.q); } }
    b.px = x; b.pz = z; b.x = x; b.z = z; b.g.visible = vis > 0; b.g.position.set(x, hh, z); b.mesh.position.y = P.BR - b.sink; b.sh.position.y = 0.012;
    if (alpha !== undefined) b.mat.opacity = alpha; b.sh.visible = vis > 0 && b.sink < 0.03;
  }
  const dots = []; const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }); for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), dotMat.clone()); m.visible = false; m.renderOrder = 15; scene.add(m); dots.push(m); }
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false })); arrow.visible = false; arrow.renderOrder = 15; scene.add(arrow);
  function aim(on, x, z, dx, dz, pow, reach = 1) {   // směr (dx, dz) a síla 0–1; tečky ukazují směr a délku rány (reach = delší zaměřovač od hole)
    for (const d of dots) d.visible = false; arrow.visible = false; if (!on) return;
    const len = (0.9 + pow * 5.6) * reach; const n = Math.max(3, Math.round(len / 0.32)); const col = new THREE.Color().setHSL(0.33 - pow * 0.33, 0.95, 0.55);
    for (let i = 0; i < n && i < dots.length; i++) { const t = 0.35 + (i + 1) * len / n; const yy = P.heightAt(W, x + dx * t, z + dz * t).y + P.BR; dots[i].position.set(x + dx * t, yy, z + dz * t); dots[i].material.color.copy(col); dots[i].visible = true; dots[i].scale.setScalar(1.2 - i / n * 0.5); }
    const t = 0.35 + len + 0.28; const ay = P.heightAt(W, x + dx * t, z + dz * t).y + P.BR; arrow.position.set(x + dx * t, ay, z + dz * t); arrow.material.color.copy(col); arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, 0, dz)); arrow.visible = true;
  }
  // částice: několik vrstev (kulatá záře, aditivní záře pro jiskry, hvězdičky, srdíčka), prstence, záblesky, časovač a meteority pro efekty výhry
  const starTex = canvasTex(64, 64, (g) => { g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 13 : 30; g.lineTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r); } g.closePath(); g.fill(); });
  const heartTex = canvasTex(64, 64, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(4, 34, 12, 8, 32, 22); g.bezierCurveTo(52, 8, 60, 34, 32, 54); g.fill(); });
  // částice mají vlastní shader: barva, velikost a průhlednost každé zvlášť (slábnou plynule a jsou vidět i na světlém ledu a písku, kde by aditivní záře zmizela)
  const PVS = 'uniform float scale;\nattribute vec3 pcol;\nattribute float alpha;\nattribute float psize;\nvarying vec3 vc;\nvarying float va;\nvoid main(){\n vc = pcol; va = alpha;\n vec4 mv = modelViewMatrix * vec4(position, 1.0);\n gl_PointSize = psize * scale / max(0.1, -mv.z);\n gl_Position = projectionMatrix * mv;\n}';
  const PFS = 'uniform sampler2D map;\nvarying vec3 vc;\nvarying float va;\nvoid main(){\n float a = texture2D(map, gl_PointCoord).a * va;\n if (a < 0.01) discard;\n gl_FragColor = vec4(vc, a);\n#include <colorspace_fragment>\n}';
  const partScale = { value: 400 };
  function makeLayer(tex, N, size) {
    const L = { N, size, pos: new Float32Array(N * 3), col: new Float32Array(N * 3), alpha: new Float32Array(N), psz: new Float32Array(N), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), g: new Float32Array(N), next: 0 };
    for (let i = 0; i < N; i++) L.pos[i * 3 + 1] = -50;
    L.geo = new THREE.BufferGeometry(); L.geo.setAttribute('position', new THREE.BufferAttribute(L.pos, 3)); L.geo.setAttribute('pcol', new THREE.BufferAttribute(L.col, 3)); L.geo.setAttribute('alpha', new THREE.BufferAttribute(L.alpha, 1)); L.geo.setAttribute('psize', new THREE.BufferAttribute(L.psz, 1));
    L.mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, scale: partScale }, vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false });
    L.points = new THREE.Points(L.geo, L.mat); L.points.frustumCulled = false; L.points.renderOrder = 11; scene.add(L.points); return L;
  }
  const layers = { glow: makeLayer(glowTex, 420, 0.2), add: makeLayer(glowTex, 700, 0.34), star: makeLayer(starTex, 200, 0.46), heart: makeLayer(heartTex, 140, 0.5) };
  /** Vyšle částice: o.layer (glow | add | star | heart), o.col, o.speed, o.up, o.g, o.life, o.rainbow, o.sph (do všech stran), o.pal (paleta barev), o.jx (rozptyl polohy). */
  function emit(x, y, z, n, o = {}) {
    const L = layers[o.layer || 'glow']; const c = rgb(o.col ?? 0xffffff);
    for (let i = 0; i < n; i++) {
      const k = L.next++ % L.N; const sp = (o.speed ?? 2) * (0.4 + Math.random() * 0.8); let vx, vy, vz;
      if (o.sph) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); vx = Math.cos(a) * r * sp; vy = u * sp + (o.up ?? 0); vz = Math.sin(a) * r * sp; }
      else { const a = Math.random() * Math.PI * 2; vx = Math.cos(a) * sp; vy = (o.up ?? 2) * (0.5 + Math.random()); vz = Math.sin(a) * sp; }
      L.pos[k * 3] = x + (o.jx ? (Math.random() - 0.5) * o.jx : 0); L.pos[k * 3 + 1] = y; L.pos[k * 3 + 2] = z + (o.jx ? (Math.random() - 0.5) * o.jx : 0); L.vel[k * 3] = vx; L.vel[k * 3 + 1] = vy; L.vel[k * 3 + 2] = vz;
      L.life[k] = L.max[k] = (o.life ?? 0.8) * (0.6 + Math.random() * 0.6); L.g[k] = o.g ?? 7; L.alpha[k] = 1; L.psz[k] = L.size * (o.size ?? 1) * (0.75 + Math.random() * 0.6);
      const cc = o.rainbow ? new THREE.Color().setHSL(Math.random(), 0.9, 0.58) : o.pal ? new THREE.Color(o.pal[Math.floor(Math.random() * o.pal.length)]) : c; L.col.set([cc.r, cc.g, cc.b], k * 3);
    }
  }
  const timers = []; const after = (dt, fn) => timers.push({ at: clock + dt, fn });
  const ringGeo = new THREE.RingGeometry(0.86, 1, 56); const rings = [];
  function ring(x, y, z, col, r1, life, r0 = 0.25) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.06, z); m.scale.setScalar(r0); m.renderOrder = 13; scene.add(m); rings.push({ m, t: 0, life, r0, r1 }); }
  const flashes = [];   // záblesky: sloup světla nebo koule, rychle slábnou
  function flash(geo, col, x, y, z, life, s0 = 1, s1 = 1) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false })); m.position.set(x, y, z); m.scale.setScalar(s0); m.renderOrder = 14; scene.add(m); flashes.push({ m, t: 0, life, s0, s1 }); }
  const colGeo = new THREE.CylinderGeometry(0.14, 0.14, 18, 10, 1, true), orbGeo = new THREE.SphereGeometry(1, 20, 14);
  const meteors = [];
  const PAL = [0xff3b5c, 0xffc21a, 0x2fb4ff, 0x3ddc5a, 0xff5ce0, 0xff8a1c];
  const burst = (x, y, z, col, n, sp) => { emit(x, y, z, n, { layer: 'add', col, sph: true, speed: sp, up: 0.4, g: 3.2, life: 1.3 }); emit(x, y, z, Math.round(n / 3), { layer: 'star', col: 0xffd84a, sph: true, speed: sp * 0.6, g: 3, life: 0.9, size: 0.6 }); };
  const FXW = {   // efekty výhry: (x, y = výška jamky, z, k = síla; po vítězství v zápase je k větší)
    '': (x, y, z, k) => emit(x, y + 0.3, z, Math.round(60 * k), { rainbow: true, speed: 2.8, up: 5.5, g: 7, life: 1.5 }),
    sparks: (x, y, z, k) => { emit(x, y + 0.2, z, Math.round(55 * k), { layer: 'add', col: 0xffd84a, speed: 3.4, up: 6, g: 9, life: 0.9 }); emit(x, y + 0.2, z, Math.round(30 * k), { layer: 'add', col: 0xfff3b0, speed: 1.4, up: 8, g: 8, life: 1.2 }); },
    stars: (x, y, z, k) => { emit(x, y + 0.3, z, Math.round(26 * k), { layer: 'star', pal: [0xffc21a, 0xff9a1a, 0xffe14a], speed: 2.4, up: 6.5, g: 4.5, life: 1.9 }); emit(x, y + 0.3, z, Math.round(30 * k), { layer: 'add', col: 0xffc21a, speed: 2.2, up: 5, g: 5, life: 1.1 }); },
    rings: (x, y, z, k) => { for (let i = 0; i < 3; i++) after(i * 0.2, () => ring(x, y, z, i === 1 ? 0xffb020 : 0x2fb4ff, 4.2 * k, 0.9)); emit(x, y + 0.1, z, 14, { layer: 'add', col: 0x2fb4ff, speed: 1.4, up: 3, g: 6, life: 0.7 }); },
    hearts: (x, y, z, k) => emit(x, y + 0.3, z, Math.round(22 * k), { layer: 'heart', pal: [0xff5fa0, 0xff9ac4, 0xff2d6a], speed: 1.3, up: 3.4, g: -0.7, life: 2.4 }),
    rainbow: (x, y, z, k) => { emit(x, y + 0.2, z, Math.round(110 * k), { rainbow: true, speed: 0.9, up: 9.5, g: 7.5, life: 1.9 }); ring(x, y, z, 0xff5ce0, 1.8, 0.6); },
    fireworks: (x, y, z, k) => {
      for (let i = 0; i < 9; i++) after(i * 0.055, () => emit(x, y + 0.2 + i * 0.4, z, 5, { layer: 'add', col: 0xffc060, speed: 0.25, up: -0.5, g: 2, life: 0.5 }));
      const n = k > 1.2 ? 6 : 3; for (let b = 0; b < n; b++) after(0.55 + b * 0.28, () => { const a = b * 2.1 + Math.random(), r = b ? 1.2 + Math.random() * 1.2 : 0; burst(x + Math.cos(a) * r, y + 3.3 + Math.random() * 1.4, z + Math.sin(a) * r, PAL[(b + Math.floor(Math.random() * 3)) % PAL.length], 48, 3.3); });
    },
    lightning: (x, y, z, k) => {
      const hit = () => { flash(colGeo, 0x6ab8ff, x, y + 9, z, 0.32, 1, 0.3); emit(x, y + 0.2, z, 40, { layer: 'add', col: 0x3aa8ff, sph: true, speed: 3.6, up: 1.5, g: 6, life: 0.6 }); ring(x, y, z, 0x3aa8ff, 2.6 * k, 0.5); };
      hit(); after(0.14, () => flash(colGeo, 0xffe96a, x + 0.15, y + 9, z - 0.1, 0.26, 1.7, 0.4)); if (k > 1.2) { after(0.5, hit); after(0.9, hit); }
    },
    meteor: (x, y, z, k) => { meteors.push({ t: 0, dur: 0.7, x0: x - 7, y0: y + 15, z0: z - 5, x, y, z, k, m: (() => { const m = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0x4a2a1c })); m.scale.setScalar(0.28); scene.add(m); return m; })() }); },
    goldrain: (x, y, z, k) => { emit(x, y + 0.2, z, 22, { layer: 'add', col: 0xffd24a, speed: 1.8, up: 5, g: 8, life: 1 }); const T = 1.8 * (k > 1.2 ? 1.5 : 1); for (let t = 0; t < T; t += 0.05) after(t, () => { emit(x, y + 3.6 + Math.random() * 1.6, z, 3, { pal: [0xffc21a, 0xffe27a, 0xe8a812], speed: 0.25, up: -0.4, g: 3.4, life: 1.4, jx: 3.2 * (k > 1.2 ? 1.4 : 1) }); if (Math.random() < 0.5) emit(x, y + 3.2, z, 1, { layer: 'star', col: 0xffc21a, speed: 0.3, up: -0.3, g: 3, life: 1.2, jx: 3 }); }); },
    bubbles: (x, y, z, k) => { for (let t = 0; t < 0.8; t += 0.07) after(t, () => emit(x, y + 0.2, z, Math.round(3 * k), { pal: [0x7fd0ff, 0xbfeaff, 0xffffff], speed: 0.7, up: 2.4, g: -1.2, life: 2.2, jx: 0.5 * k, size: 1.5 })); ring(x, y, z, 0x7fd0ff, 2.6 * k, 0.8); },
    snow: (x, y, z, k) => { const T = 1.6 * (k > 1.2 ? 1.5 : 1); for (let t = 0; t < T; t += 0.05) after(t, () => emit(x, y + 4.2 + Math.random() * 1.2, z, 3, { layer: 'star', pal: [0x7cc8ff, 0xb0e0ff, 0x9ad0ff], speed: 0.35, up: -0.3, g: 0.8, life: 2.6, jx: 3.6 * (k > 1.2 ? 1.4 : 1), size: 0.7 })); emit(x, y + 0.3, z, 18, { layer: 'add', col: 0x9ad8ff, sph: true, speed: 1.8, up: 2, g: 4, life: 0.8 }); },
    petals: (x, y, z, k) => { const T = 1.4 * (k > 1.2 ? 1.5 : 1); emit(x, y + 0.3, z, Math.round(30 * k), { pal: [0xff9ac4, 0xffc0d8, 0xff7aa8], speed: 1.6, up: 4.2, g: 1.6, life: 2.6, size: 1.2 }); for (let t = 0; t < T; t += 0.06) after(t, () => emit(x, y + 3.8 + Math.random(), z, 3, { pal: [0xff9ac4, 0xffc0d8, 0xff7aa8], speed: 0.6, up: -0.2, g: 1.1, life: 2.6, jx: 3 * (k > 1.2 ? 1.4 : 1), size: 1.1 })); },
    vortex: (x, y, z, k) => { const T = 1.2 * (k > 1.2 ? 1.5 : 1); for (let t = 0; t < T; t += 0.025) after(t, () => { for (let j = 0; j < 2; j++) { const a = t * 11 + j * Math.PI, r = 0.3 + t * 1.2; emit(x + Math.cos(a) * r, y + 0.1 + t * 1.2, z + Math.sin(a) * r, 2, { layer: 'add', pal: j ? [0xb06aff, 0xff5ce0] : [0x4af0ff, 0x2fb4ff], speed: 0.2, up: 2.6, g: 0.5, life: 0.9 }); } }); ring(x, y, z, 0x4af0ff, 3.2 * k, 0.7); after(T * 0.6, () => ring(x, y, z, 0xb06aff, 4.4 * k, 0.8)); after(T, () => emit(x, y + 1.6, z, Math.round(50 * k), { layer: 'star', pal: [0x4af0ff, 0xb06aff, 0xffffff], sph: true, speed: 3.4, up: 1, g: 2, life: 1.2, size: 0.8 })); },
    nova: (x, y, z, k) => { flash(orbGeo, 0xffb020, x, y + 0.4, z, 0.55, 0.2, 3.4 * k); ring(x, y, z, 0xffb040, 5.2 * k, 0.8); after(0.25, () => ring(x, y, z, 0xff6a3a, 6.5 * k, 0.9)); emit(x, y + 0.4, z, Math.round(90 * k), { layer: 'add', pal: [0xffe27a, 0xffa040, 0xff6a3a], sph: true, speed: 5, up: 1, g: 1.4, life: 1.3 }); emit(x, y + 0.4, z, Math.round(28 * k), { layer: 'star', col: 0xff7a1a, sph: true, speed: 3.4, up: 2, g: 2, life: 1.4 }); },
  };
  function stepFx(dt) {
    partScale.value = renderer.domElement.height * 0.5;
    for (const L of Object.values(layers)) {
      for (let k = 0; k < L.N; k++) {
        if (L.life[k] <= 0) { if (L.alpha[k] > 0) { L.alpha[k] = 0; L.pos[k * 3 + 1] = -50; } continue; }
        L.life[k] -= dt; L.vel[k * 3 + 1] -= L.g[k] * dt; L.pos[k * 3] += L.vel[k * 3] * dt; L.pos[k * 3 + 1] += L.vel[k * 3 + 1] * dt; L.pos[k * 3 + 2] += L.vel[k * 3 + 2] * dt; L.alpha[k] = Math.min(1, Math.max(0, L.life[k] / L.max[k]) * 2.4);
      }
      const A = L.geo.attributes; A.position.needsUpdate = A.alpha.needsUpdate = A.pcol.needsUpdate = A.psize.needsUpdate = true;
    }
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= clock) { const f = timers[i].fn; timers.splice(i, 1); f(); }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt; const u = Math.min(1, r.t / r.life); r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - u, 2))); r.m.material.opacity = 1 - u; if (u >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); } }
    for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t += dt; const u = Math.min(1, f.t / f.life); f.m.scale.setScalar(f.s0 + (f.s1 - f.s0) * u); f.m.material.opacity = 0.9 * (1 - u); if (u >= 1) { scene.remove(f.m); f.m.material.dispose(); flashes.splice(i, 1); } }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i]; m.t += dt; const u = Math.min(1, m.t / m.dur); const x = m.x0 + (m.x - m.x0) * u, y = m.y0 + (m.y - m.y0) * u * u, z = m.z0 + (m.z - m.z0) * u; m.m.position.set(x, y + 0.2, z);
      emit(x, y + 0.2, z, 4, { layer: 'add', pal: [0xff8a1c, 0xffd24a, 0xff4a00], speed: 0.5, up: 0.3, g: 0, life: 0.5 }); emit(x, y + 0.2, z, 1, { layer: 'glow', col: 0x6a5a50, speed: 0.4, up: 0.4, g: -1, life: 0.9 });
      if (u >= 1) { scene.remove(m.m); m.m.material.dispose(); meteors.splice(i, 1); emit(m.x, m.y + 0.2, m.z, Math.round(80 * m.k), { layer: 'add', pal: [0xff8a1c, 0xffd24a, 0xff4a00], sph: true, speed: 4.4, up: 2.5, g: 6, life: 1 }); emit(m.x, m.y + 0.2, m.z, 18, { layer: 'glow', col: 0x7a6a60, speed: 1.6, up: 1.8, g: -0.4, life: 1.5 }); ring(m.x, m.y, m.z, 0xffa040, 3.4 * m.k, 0.7); flash(orbGeo, 0xffd080, m.x, m.y + 0.3, m.z, 0.35, 0.3, 2.2); }
    }
  }
  const fx = {
    splash: (x, z) => emit(x, P.heightAt(W, x, z).y, z, 26, { col: th.liq === 0xff5a14 ? 0xffa030 : 0xbfe6ff, speed: 1.6, up: 3.4, g: 9, life: 0.9 }),
    sparks: (x, z, c = 0xffe08a) => emit(x, P.heightAt(W, x, z).y + 0.2, z, 10, { col: c, speed: 2.2, up: 1.6, g: 6, life: 0.45 }),
    puff: (x, z, c = 0xf0e0b0) => emit(x, P.heightAt(W, x, z).y + 0.08, z, 6, { col: c, speed: 0.9, up: 0.7, g: 3, life: 0.5 }),
    confetti: (x, z) => emit(x, P.heightAt(W, x, z).y + 0.3, z, 60, { rainbow: true, speed: 2.8, up: 5.5, g: 7, life: 1.5 }),
    tele: (x, z, c = 0xc080ff) => emit(x, P.heightAt(W, x, z).y + 0.2, z, 16, { col: c, speed: 1.2, up: 2.4, g: 1, life: 0.7 }),
    /** Efekt výhry z obchodu na místě jamky; big = oslava vítěze celého zápasu (silnější). */
    win: (id, x, z, big) => { try { (FXW[id] || FXW[''])(x, P.heightAt(W, x, z).y, z, big ? 1.7 : 1); } catch (e) { /* efekt nesmí shodit hru */ } },
  };
  // ambient: sníh / jiskry / listí
  const amb = { n: 110, pos: new Float32Array(110 * 3), v: new Float32Array(110 * 3) }; const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.BufferAttribute(amb.pos, 3));
  const am = new THREE.PointsMaterial({ size: 0.12, color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, map: glowTex }); const ambPts = new THREE.Points(ag, am); ambPts.frustumCulled = false; scene.add(ambPts);
  function resetAmb() { const cx = W.w / 2, cz = W.h / 2, R = Math.max(W.w, W.h); const T = W.theme; am.visible = T !== 'meadow' || true; am.color.set(T === 'lava' ? 0xff9a3a : T === 'ice' ? 0xffffff : T === 'desert' ? 0xffe2a0 : 0xfff6c0); am.size = T === 'ice' ? 0.12 : 0.09;
    for (let i = 0; i < amb.n; i++) { amb.pos[i * 3] = cx + (Math.random() - 0.5) * R * 1.8; amb.pos[i * 3 + 1] = Math.random() * 7; amb.pos[i * 3 + 2] = cz + (Math.random() - 0.5) * R * 1.8; const up = T === 'lava'; amb.v[i * 3] = (Math.random() - 0.5) * 0.4; amb.v[i * 3 + 1] = up ? 0.4 + Math.random() * 0.7 : T === 'ice' ? -(0.3 + Math.random() * 0.5) : (Math.random() - 0.5) * 0.12; amb.v[i * 3 + 2] = (Math.random() - 0.5) * 0.4; } }

  function update(dt, t) {
    clock += dt; for (const f of anim) f(t);
    stepFx(dt);
    balls.forEach((b, bi) => { if (!b.art || !b.art.anim) return; if (b.art.anim === 'scroll') b.mat.map.offset.x = (clock * 0.12) % 1; else if (b.art.em) b.mat.emissiveIntensity = b.art.em[1] * (0.72 + 0.28 * Math.sin(clock * 3 + bi)); });
    if (W) { const cx = W.w / 2, cz = W.h / 2, R = Math.max(W.w, W.h) * 0.9; for (let i = 0; i < amb.n; i++) { for (let a = 0; a < 3; a++) amb.pos[i * 3 + a] += amb.v[i * 3 + a] * dt; if (amb.pos[i * 3 + 1] < 0 || amb.pos[i * 3 + 1] > 8) amb.pos[i * 3 + 1] = amb.v[i * 3 + 1] > 0 ? 0 : 7; if (Math.abs(amb.pos[i * 3] - cx) > R) amb.pos[i * 3] = cx - Math.sign(amb.pos[i * 3] - cx) * R; if (Math.abs(amb.pos[i * 3 + 2] - cz) > R) amb.pos[i * 3 + 2] = cz - Math.sign(amb.pos[i * 3 + 2] - cz) * R; } ag.attributes.position.needsUpdate = true; }
    sky.position.copy(cam.position);
  }
  function setShadows(on) { shadows = on; renderer.shadowMap.enabled = on; sun.castShadow = on; for (const b of balls) b.sh.material.opacity = on ? 0 : 1; for (const m of mats) m.needsUpdate = true; }
  function resize(w, h) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  const v3 = new THREE.Vector3();
  const project = (x, y, z, w, h) => { v3.set(x, y, z).project(cam); return [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h]; };
  return { renderer, scene, cam, setHole: (w) => { setHole(w); resetAmb(); }, setBalls, moveBall, aim, fx, update, render: () => renderer.render(scene, cam), resize, setShadows, project, get balls() { return balls; }, get shadows() { return shadows; }, flagOn: () => flag };
}
