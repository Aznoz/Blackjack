// ARÉNA VĚŽÍ – kreslené postavy (bez emoji). Každá karta má vlastní vektorovou postavu, kterou používá hra (canvas),
// karty v ruce, balíček, návod i menu (přes iconURL). Postava se kreslí v krabici cca 48 × 48 se středem v (0, 0), chodidla na y ≈ +17.
const TAU = Math.PI * 2;
export const TEAM = {
  me: { main: '#3f8cf0', dark: '#1f4fa8', light: '#9ccbff' },
  en: { main: '#e5483f', dark: '#971f1a', light: '#ffa49d' },
};
const OL = '#2a1f3a', SKIN = '#f3c59d', SKIN2 = '#d99f74', STEEL = '#c3ccdc', STEEL2 = '#7e8aa5', GOLD = '#ffd24a', WOOD = '#8b5a2b', WOOD2 = '#5d3a1a', BONE = '#efe9d8';

function fin(g, fill, lw = 1.6, stroke = OL) { if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
function circ(g, x, y, r, fill, lw) { g.beginPath(); g.arc(x, y, r, 0, TAU); fin(g, fill, lw); }
function ell(g, x, y, rx, ry, fill, lw, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); fin(g, fill, lw); }
function rr(g, x, y, w, h, r, fill, lw) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); fin(g, fill, lw); }
function poly(g, pts, fill, lw) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); fin(g, fill, lw); }
function line(g, x0, y0, x1, y1, w, col) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = col; g.lineWidth = w; g.stroke(); }
function eyes(g, y, dx = 3, r = 1.15, col = '#1a1426') { circ(g, -dx, y, r, col, 0); circ(g, dx, y, r, col, 0); }
function feet(g, t, y = 15, sp = 7, col = '#46301e') { const s = Math.sin(t * 9); ell(g, -sp * 0.6, y - Math.max(0, s) * 2, 4.4, 2.7, col); ell(g, sp * 0.6, y - Math.max(0, -s) * 2, 4.4, 2.7, col); }
const bob = (t, a = 0.9) => Math.sin(t * 9) * a;

/** Plamen (kouzlo Ohnivá koule, meteor). s = velikost, směřuje špičkou nahoru. */
export function flame(g, s = 1, t = 0) {
  g.save(); g.scale(s, s);
  const w = Math.sin(t * 12) * 1.2;
  g.beginPath(); g.moveTo(0, -23); g.bezierCurveTo(10 + w, -10, 17, 0, 15, 8); g.bezierCurveTo(13, 17, 5, 20, 0, 20); g.bezierCurveTo(-6, 20, -14, 17, -15, 8); g.bezierCurveTo(-16, 0, -8, -6, -3 - w, -14); g.bezierCurveTo(-2, -18, 0, -20, 0, -23); g.closePath(); fin(g, '#ff7a1a', 1.8, '#7a2208');
  g.beginPath(); g.moveTo(1, -10); g.bezierCurveTo(8, -2, 11, 3, 9, 9); g.bezierCurveTo(7, 15, 3, 16, 0, 16); g.bezierCurveTo(-5, 16, -9, 12, -8, 7); g.bezierCurveTo(-7, 2, -2, -2, 1, -10); g.closePath(); fin(g, '#ffc928', 0);
  g.beginPath(); g.moveTo(1, 0); g.bezierCurveTo(5, 5, 6, 8, 4, 12); g.bezierCurveTo(2, 15, -3, 14, -3, 10); g.bezierCurveTo(-3, 6, 0, 4, 1, 0); g.closePath(); fin(g, '#fff6c8', 0);
  g.restore();
}
/** Koruna na hlavní věž. */
export function crown(g, x, y, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  poly(g, [[-11, 5], [-12, -7], [-6, -1], [0, -9], [6, -1], [12, -7], [11, 5]], GOLD, 1.6);
  rr(g, -11, 4, 22, 4, 1.5, '#e0a91c', 1.4);
  circ(g, 0, -9, 1.7, '#ff4b45', 1); circ(g, -12, -7, 1.5, '#4aa3ff', 1); circ(g, 12, -7, 1.5, '#4aa3ff', 1);
  g.restore();
}

const DRAW = {
  soldier(g, T, t) {
    feet(g, t); g.save(); g.translate(0, bob(t));
    rr(g, 9.5, -9, 3.4, 17, 1.4, STEEL, 1.4); rr(g, 7, 6, 8.5, 3, 1.2, GOLD, 1.2); circ(g, 11.2, 11, 2, '#5d3a1a', 1);        // meč
    rr(g, -8, -3, 16, 18, 5, T.main); rr(g, -8, 8, 16, 3.2, 1, '#5d3a1a', 1.2); rr(g, -2, 7.6, 4, 4, 1, GOLD, 1);                 // tunika, opasek
    circ(g, 9, 5, 3, SKIN); poly(g, [[-18, -3], [-7, -3], [-7, 7], [-12.5, 15], [-18, 7]], T.light); poly(g, [[-12.5, -2], [-12.5, 11]], null, 1.2); circ(g, -13, 4, 2, T.dark, 0);   // štít
    circ(g, 0, -10, 7.4, SKIN); eyes(g, -9, 2.6);
    g.beginPath(); g.arc(0, -11.5, 8.3, Math.PI, 0); g.lineTo(8.3, -9.2); g.lineTo(-8.3, -9.2); g.closePath(); fin(g, STEEL); line(g, 0, -20, 0, -9.5, 1.4, STEEL2);
    poly(g, [[-1.5, -19.5], [1.5, -19.5], [3, -25], [-3, -25]], T.main, 1.2);
    g.restore();
  },
  archer(g, T, t) {
    feet(g, t, 15, 6); g.save(); g.translate(0, bob(t));
    rr(g, 7, -9, 5, 14, 2, WOOD2, 1.2); for (let i = 0; i < 3; i++) line(g, 8 + i * 1.6, -9, 7.4 + i * 2, -13, 1.2, '#fff');   // toulec
    poly(g, [[-8, -2], [8, -2], [10, 15], [-10, 15]], T.main); line(g, -7, 4, 7, 12, 3, '#6b4423'); rr(g, -8, 7, 16, 2.6, 1, '#5d3a1a', 1);
    g.beginPath(); g.moveTo(9.5, 6); g.lineTo(15, 6); g.lineTo(15, 4); g.strokeStyle = SKIN2; g.lineWidth = 3; g.stroke();
    circ(g, 0, -10, 7, SKIN); eyes(g, -9, 2.6); ell(g, 0, -6.4, 1.4, 0.7, '#d97b72', 0);
    g.beginPath(); g.moveTo(-8.4, -4); g.quadraticCurveTo(-9, -21, 0, -21); g.quadraticCurveTo(9, -21, 8.4, -4); g.quadraticCurveTo(7, -8, 4.6, -11.6); g.quadraticCurveTo(0, -13, -4.6, -11.6); g.quadraticCurveTo(-7, -8, -8.4, -4); g.closePath(); fin(g, T.dark);   // kapuce
    g.beginPath(); g.arc(-14, 1, 15, -1.15, 1.15); g.strokeStyle = OL; g.lineWidth = 4.2; g.stroke(); g.strokeStyle = WOOD; g.lineWidth = 2.4; g.stroke();   // luk
    line(g, -14 + 15 * Math.cos(-1.15), 1 + 15 * Math.sin(-1.15), -14 + 15 * Math.cos(1.15), 1 + 15 * Math.sin(1.15), 1, '#fff');
    circ(g, -9, 3, 2.6, SKIN);
    g.restore();
  },
  knight(g, T, t) {
    feet(g, t, 15, 8, '#59627a'); g.save(); g.translate(0, bob(t, 0.6));
    rr(g, 12, -13, 3.6, 22, 1.4, STEEL, 1.4); rr(g, 9, 7, 10, 3.2, 1.2, GOLD, 1.2);                                      // meč
    rr(g, -10, -4, 20, 20, 6, STEEL); rr(g, -10, 9, 20, 3.4, 1, T.dark, 1.2);
    circ(g, -11, -3, 4.6, STEEL2); circ(g, 11, -3, 4.6, STEEL2);                                                          // ramena
    poly(g, [[-20, -2], [-6, -2], [-6, 9], [-13, 20], [-20, 9]], T.main, 2); line(g, -13, 0, -13, 15, 2, '#fff'); line(g, -18.5, 5, -7.5, 5, 2, '#fff');   // štít s křížem
    g.beginPath(); g.arc(0, -10, 8.8, Math.PI * 0.9, Math.PI * 2.1); g.lineTo(8.4, -3); g.lineTo(-8.4, -3); g.closePath(); fin(g, STEEL);   // přilba
    rr(g, -6.5, -11.5, 13, 3.4, 1.2, '#1c1630', 0); rr(g, -1, -9, 2, 6, 1, '#1c1630', 0);
    g.beginPath(); g.moveTo(0, -18.5); g.quadraticCurveTo(10, -26, 11, -15); g.quadraticCurveTo(5, -20, 0, -17); g.closePath(); fin(g, T.main, 1.2);
    g.restore();
  },
  skeletons(g, T, t) {
    feet(g, t, 15, 5, BONE); g.save(); g.translate(0, bob(t, 1.2));
    rr(g, 9, -8, 3, 16, 1.5, BONE, 1.2); circ(g, 10.5, -9, 3, BONE, 1.2); circ(g, 10.5, 9, 2.4, BONE, 1.2);              // kost jako kyj
    rr(g, -6, -3, 12, 15, 4, '#3a3446'); for (let i = 0; i < 3; i++) line(g, -5, 0 + i * 4, 5, 0 + i * 4, 2, BONE); line(g, 0, -3, 0, 12, 2, BONE);
    line(g, -6, 0, -11, 8, 2.4, BONE); line(g, 6, 0, 9.5, 5, 2.4, BONE); circ(g, -11, 9, 2, BONE, 1);
    ell(g, 0, -10, 8, 7.4, BONE); rr(g, -5, -4, 10, 5, 2, BONE, 1.4);
    ell(g, -3.2, -10.5, 2.3, 2.7, '#1a1426', 0); ell(g, 3.2, -10.5, 2.3, 2.7, '#1a1426', 0); circ(g, -3.2, -10.7, 0.8, T.light, 0); circ(g, 3.2, -10.7, 0.8, T.light, 0);
    poly(g, [[0, -7.6], [-1.3, -5.2], [1.3, -5.2]], '#1a1426', 0); for (let i = -3; i <= 3; i += 2) line(g, i, -3.6, i, -1.2, 1, OL);
    g.restore();
  },
  fireball(g, T, t) { flame(g, 1.02, t); },
  golem(g, T, t) {
    g.save(); g.translate(0, bob(t, 0.5));
    rr(g, -12, 8, 10, 10, 3, '#767b86'); rr(g, 2, 8, 10, 10, 3, '#767b86');
    circ(g, -17, 0, 7, '#8b909b'); circ(g, 17, 0, 7, '#8b909b'); circ(g, -17, 7, 5.5, '#767b86'); circ(g, 17, 7, 5.5, '#767b86');   // pěsti
    rr(g, -13, -9, 26, 22, 7, '#9aa0ab'); poly(g, [[-13, 2], [-6, -2], [-3, 6], [-9, 11]], '#858b97', 1.2);
    g.beginPath(); g.moveTo(-6, -9); g.lineTo(-2, -2); g.lineTo(-5, 2); g.strokeStyle = '#555b66'; g.lineWidth = 1.4; g.stroke();   // prasklina
    ell(g, 6, -8, 5, 2.2, '#4f9a45', 0); ell(g, -8, 12, 4, 1.8, '#4f9a45', 0);                                           // mech
    poly(g, [[0, -1], [5, 4], [0, 9], [-5, 4]], T.main, 1.4); circ(g, 0, 4, 1.8, '#fff', 0);                              // runa týmu
    rr(g, -8, -21, 16, 13, 4, '#a7adb8'); rr(g, -6.5, -16.5, 13, 3.4, 1.4, '#2a2430', 0); circ(g, -3.2, -14.8, 1.5, '#ffb84a', 0); circ(g, 3.2, -14.8, 1.5, '#ffb84a', 0);
    g.restore();
  },
  wizard(g, T, t) {
    feet(g, t, 15, 5, '#4a2d54'); g.save(); g.translate(0, bob(t, 0.7));
    line(g, 11.5, -10, 11.5, 15, 2.8, OL); line(g, 11.5, -10, 11.5, 15, 1.6, WOOD); circ(g, 11.5, -12, 4, '#ff8a2a', 1.4); circ(g, 10.4, -13.2, 1.4, '#fff3b0', 0);   // hůl s orbem
    poly(g, [[-6, -3], [6, -3], [11, 16], [-11, 16]], T.main); rr(g, -6.5, 5, 13, 3, 1, GOLD, 1.2);
    poly(g, [[-6, -2], [-12, 7], [-8, 9], [-4, 3]], T.main); circ(g, -10, 8, 2.6, SKIN, 1.2); circ(g, 9, 3, 2.6, SKIN, 1.2);
    circ(g, 0, -9, 6.6, SKIN); eyes(g, -9.4, 2.4);
    g.beginPath(); g.moveTo(-6, -7); g.quadraticCurveTo(-7, 6, 0, 8); g.quadraticCurveTo(7, 6, 6, -7); g.quadraticCurveTo(3, -4, 0, -4.5); g.quadraticCurveTo(-3, -4, -6, -7); g.closePath(); fin(g, '#f6f4f0', 1.4);   // vous
    ell(g, 0, -13.5, 11, 3, T.dark, 1.5); poly(g, [[-6.5, -14], [6.5, -14], [1.5, -29]], T.dark, 1.5);
    g.save(); g.translate(0, -19.5); g.fillStyle = GOLD; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 1.5 : 3.3; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.restore();
    g.restore();
  },
  bats(g, T, t) {
    const f = Math.sin(t * 15); g.save(); g.translate(0, Math.sin(t * 6) * 1.2 - 2);
    for (const sd of [-1, 1]) {   // křídla
      g.save(); g.scale(sd, 1); g.beginPath(); g.moveTo(3, -2); g.quadraticCurveTo(14, -14 - f * 5, 23, -10 - f * 7); g.quadraticCurveTo(20, -5 - f * 4, 20, 0 - f * 3); g.quadraticCurveTo(15, -1, 14, 4 - f * 2); g.quadraticCurveTo(10, 1, 8, 6 - f); g.quadraticCurveTo(5, 3, 3, 7); g.closePath(); fin(g, T.dark, 1.6); g.restore();
    }
    ell(g, 0, 1, 6.5, 8, '#43296a'); ell(g, 0, 4, 3.8, 4.5, T.main, 0);
    poly(g, [[-5.5, -5], [-3, -13], [-1, -6]], '#43296a', 1.4); poly(g, [[5.5, -5], [3, -13], [1, -6]], '#43296a', 1.4);
    circ(g, -2.6, -2.4, 1.7, '#ff5a52', 0); circ(g, 2.6, -2.4, 1.7, '#ff5a52', 0); circ(g, -2.6, -2.5, 0.6, '#fff', 0); circ(g, 2.6, -2.5, 0.6, '#fff', 0);
    poly(g, [[-1.8, 2], [-0.6, 2], [-1.2, 4.5]], '#fff', 0.8); poly(g, [[1.8, 2], [0.6, 2], [1.2, 4.5]], '#fff', 0.8);
    g.restore();
  },
  musketeer(g, T, t) {
    feet(g, t, 15, 6, '#3a2616'); g.save(); g.translate(0, bob(t, 0.8));
    g.save(); g.rotate(-0.42); rr(g, 8, -24, 3, 36, 1.2, WOOD); rr(g, 8, -27, 3, 11, 1, STEEL2, 1.2); rr(g, 6.8, 6, 5.4, 7, 2, WOOD2, 1.2); g.restore();   // mušketa
    rr(g, -8, -3, 16, 18, 5, T.main); line(g, -7, -2, 7, 12, 2.8, '#f2efe6'); rr(g, -8, 9, 16, 2.8, 1, '#3a2616', 1); circ(g, 0, 3.4, 1.4, GOLD, 0);
    circ(g, 9, 4, 3, SKIN); circ(g, -9, 5, 3, SKIN);
    circ(g, 0, -10, 6.8, SKIN); eyes(g, -9.6, 2.6); g.beginPath(); g.moveTo(-4.4, -6.4); g.quadraticCurveTo(0, -8.6, 4.4, -6.4); g.quadraticCurveTo(0, -5, -4.4, -6.4); g.fillStyle = '#4b2f1a'; g.fill();
    g.beginPath(); g.moveTo(-14, -12); g.quadraticCurveTo(-7, -15, 0, -21); g.quadraticCurveTo(7, -15, 14, -12); g.quadraticCurveTo(0, -8.5, -14, -12); g.closePath(); fin(g, T.dark);   // klobouk
    g.beginPath(); g.moveTo(1, -19); g.quadraticCurveTo(12, -29, 15, -18); g.quadraticCurveTo(8, -22, 3, -17); g.closePath(); fin(g, '#fbf7ee', 1.2);
    g.restore();
  },
  dragon(g, T, t) {
    const f = Math.sin(t * 8); g.save(); g.translate(0, Math.sin(t * 5) * 1.2);
    for (const sd of [-1, 1]) { g.save(); g.scale(sd, 1); g.beginPath(); g.moveTo(5, -3); g.quadraticCurveTo(16, -22 - f * 4, 25, -12 - f * 5); g.quadraticCurveTo(21, -10, 22, -4 - f * 2); g.quadraticCurveTo(17, -5, 17, 2); g.quadraticCurveTo(12, -1, 10, 6); g.closePath(); fin(g, T.main, 1.7); g.restore(); }
    g.beginPath(); g.moveTo(3, 11); g.quadraticCurveTo(14, 18, 18, 9); g.quadraticCurveTo(15, 14, 5, 7); g.closePath(); fin(g, '#4eb35a', 1.4); poly(g, [[16, 6], [21, 9], [16, 12]], '#ffd24a', 1.1);   // ocas
    ell(g, 0, 4, 9, 11, '#5ec86a'); ell(g, 0, 6, 5.4, 7.5, '#f4e6a0', 0);
    for (let i = 0; i < 3; i++) line(g, -4, 1 + i * 4, 4, 1 + i * 4, 1, '#d6c06a');
    ell(g, 0, -9, 7.4, 6.4, '#6ad576'); ell(g, 0, -5.4, 4.4, 3, '#78e085', 1.2); circ(g, -1.5, -5.4, 0.7, OL, 0); circ(g, 1.5, -5.4, 0.7, OL, 0);
    circ(g, -3.4, -11.5, 2, '#fff', 1.2); circ(g, 3.4, -11.5, 2, '#fff', 1.2); circ(g, -3.2, -11.3, 1, '#1a1426', 0); circ(g, 3.2, -11.3, 1, '#1a1426', 0);
    poly(g, [[-5.5, -14], [-8, -22], [-2.6, -15.5]], '#ffd24a', 1.4); poly(g, [[5.5, -14], [8, -22], [2.6, -15.5]], '#ffd24a', 1.4);
    g.restore();
  },
  bomber(g, T, t) {
    feet(g, t, 15, 6, '#3a2616'); g.save(); g.translate(0, bob(t, 1));
    rr(g, -7.5, -3, 15, 17, 5, '#8a6a43'); rr(g, -7.5, 4, 15, 3, 1, '#5d3a1a', 1.2); rr(g, -4, 0, 8, 5, 1.5, '#6e5030', 1);
    circ(g, -9, 5, 3, SKIN); circ(g, 7, 8, 3, SKIN);
    circ(g, 0, -10, 7.2, SKIN); circ(g, 0, -10.6, 7.9, null, 0); rr(g, -7.6, -12.6, 15.2, 5.6, 2.6, '#2b2638', 1.4); circ(g, -3.4, -9.8, 2.4, '#9ad3ff', 1); circ(g, 3.4, -9.8, 2.4, '#9ad3ff', 1);   // brýle
    g.beginPath(); g.arc(0, -12.4, 8.4, Math.PI, 0); g.closePath(); fin(g, T.main); rr(g, -9.5, -13, 19, 3, 1.4, T.dark, 1.2);    // čepice
    circ(g, 10, 5, 7.4, '#2a2a34', 1.8); circ(g, 8, 2.8, 2.2, 'rgba(255,255,255,.35)', 0);                                  // bomba
    rr(g, 8.4, -4, 3.2, 4, 1, '#6e5030', 1.2); g.beginPath(); g.moveTo(10, -4); g.quadraticCurveTo(14, -9, 12, -12); g.strokeStyle = '#d8c8a0'; g.lineWidth = 1.6; g.stroke();
    const sp = 2.4 + Math.sin(t * 25) * 0.9; g.save(); g.translate(12, -13); g.fillStyle = '#ffd24a'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? sp * 0.45 : sp; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.restore();
    g.restore();
  },
  berserker(g, T, t) {
    feet(g, t, 15, 7, '#3a2616'); g.save(); g.translate(0, bob(t, 1));
    g.save(); g.translate(-12, 0); g.rotate(0.22); rr(g, -1.4, -17, 2.8, 36, 1.2, WOOD); poly(g, [[-1, -16], [-12, -19], [-11, -6], [-1, -8]], STEEL, 1.5); poly(g, [[1, -16], [10, -17], [9, -7], [1, -8]], STEEL, 1.5); g.restore();   // sekera
    rr(g, -8, 6, 16, 10, 3, T.dark); rr(g, -9, 5, 18, 3, 1.2, '#5d3a1a', 1.2);
    rr(g, -9, -4, 18, 12, 5, SKIN); line(g, -6, -1, 6, -1, 2, T.main); line(g, -5, 3, 5, 3, 2, T.main);                     // hruď s válečnými pruhy
    circ(g, -10, 2, 4, SKIN); circ(g, 10, 3, 4, SKIN);
    circ(g, 0, -10, 7.2, SKIN); eyes(g, -10.4, 2.8);
    g.beginPath(); g.moveTo(-6.4, -6.6); g.quadraticCurveTo(-7, 1, 0, 3); g.quadraticCurveTo(7, 1, 6.4, -6.6); g.quadraticCurveTo(3, -4.4, 0, -5); g.quadraticCurveTo(-3, -4.4, -6.4, -6.6); g.closePath(); fin(g, '#c8641e', 1.4);   // plnovous
    g.beginPath(); g.arc(0, -11.5, 8, Math.PI, 0); g.closePath(); fin(g, STEEL2);
    g.beginPath(); g.moveTo(-7.4, -13); g.quadraticCurveTo(-13, -14, -12, -23); g.quadraticCurveTo(-8, -18, -5, -17); g.closePath(); fin(g, BONE, 1.4);
    g.beginPath(); g.moveTo(7.4, -13); g.quadraticCurveTo(13, -14, 12, -23); g.quadraticCurveTo(8, -18, 5, -17); g.closePath(); fin(g, BONE, 1.4);
    g.restore();
  },
  priest(g, T, t) {
    feet(g, t, 15, 5, '#8a7a5a'); g.save(); g.translate(0, bob(t, 0.6));
    line(g, 11.5, -12, 11.5, 15, 2.8, OL); line(g, 11.5, -12, 11.5, 15, 1.6, GOLD); rr(g, 9.5, -17, 4, 9, 1, GOLD, 1.2); rr(g, 7.5, -15, 8, 3.2, 1, GOLD, 1.2);   // hůl s křížem
    poly(g, [[-6, -3], [6, -3], [11, 16], [-11, 16]], '#f6f3ec'); rr(g, -6.6, 2, 13.2, 3.4, 1, T.main, 1.2); poly(g, [[-2, -3], [2, -3], [0.6, 14], [-0.6, 14]], T.light, 0.8);
    poly(g, [[-6, -2], [-11, 6], [-7.5, 8], [-4, 3]], '#f6f3ec'); circ(g, -9, 7.4, 2.5, SKIN, 1.2); circ(g, 9.5, 4, 2.5, SKIN, 1.2);
    circ(g, 0, -9.5, 6.8, SKIN); eyes(g, -9.5, 2.5); circ(g, -3.8, -7, 1.3, '#f0a39a', 0); circ(g, 3.8, -7, 1.3, '#f0a39a', 0);
    g.beginPath(); g.arc(0, -11.5, 7.4, Math.PI * 1.02, Math.PI * 1.98); g.quadraticCurveTo(5, -14.5, 0, -14.5); g.quadraticCurveTo(-5, -14.5, -7.4, -11.5); g.closePath(); fin(g, '#7a4a28', 1.3);
    ell(g, 0, -21.5, 8, 2.6, null, 2.4, 0); g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.ellipse(0, -21.5, 8, 2.6, 0, 0, TAU); g.stroke();   // svatozář
    g.restore();
  },
};

/** Nakreslí postavu karty `id` (střed v 0, 0). t = čas v sekundách (animace), team = 'me' | 'en'. */
export function drawChar(g, id, team = 'me', t = 0) {
  const fn = DRAW[id]; if (!fn) return;
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; fn(g, TEAM[team] || TEAM.me, t); g.restore();
}

const cache = new Map();
/** Obrázek karty (canvas 112×112, modrý tým) – použije se v DOM i jako náhled při pokládání. */
export function iconCanvas(id) {
  let c = cache.get(id); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 112; const g = c.getContext('2d');
  g.translate(56, 58); g.scale(2.05, 2.05); drawChar(g, id, 'me', 0.35);
  cache.set(id, c); return c;
}
const urls = new Map();
export function iconURL(id) { let u = urls.get(id); if (!u) { u = iconCanvas(id).toDataURL('image/png'); urls.set(id, u); } return u; }
export const iconImg = (id, cls = '') => `<img class="cimg ${cls}" alt="" draggable="false" src="${iconURL(id)}">`;
