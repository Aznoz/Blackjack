// MECHA ARÉNA – syntetické zvuky (žádné soubory): výstřely, zásahy, výbuchy, mechanické cvaknutí, otevření bedny.
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nic */ } } };
let ac = null, nb = null, muted = LS.get('mecha_mute') === '1';
const audio = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; };
export const isMuted = () => muted;
export function setMuted(v) { muted = !!v; LS.set('mecha_mute', muted ? '1' : '0'); if (muted) stopMusic(); else if (want) { cur = null; music.play(want); } }
function tone(f, d, type = 'square', v = 0.05, slide = 0, delay = 0) {
  if (muted) return; const a = audio(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(25, f + slide), t0 + d);
  g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + d + 0.02);
}
function noise(d, v, f0, f1, delay = 0) {
  if (muted) return; const a = audio(); if (!a) return;
  if (!nb) { nb = a.createBuffer(1, a.sampleRate, a.sampleRate); const x = nb.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1; }
  const s = a.createBufferSource(); s.buffer = nb; s.loop = true; const f = a.createBiquadFilter(); f.type = 'lowpass'; const t0 = a.currentTime + delay;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t0 + d); const g = a.createGain(); g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  s.connect(f).connect(g).connect(a.destination); s.start(t0); s.stop(t0 + d + 0.05);
}
export const sfx = {
  click() { tone(900, 0.04, 'square', 0.03); tone(500, 0.05, 'square', 0.02, 0, 0.03); },
  kin() { noise(0.09, 0.07, 5000, 800); tone(180, 0.08, 'square', 0.03, -90); },
  nrg() { tone(1400, 0.18, 'sawtooth', 0.035, -1000); tone(700, 0.2, 'sine', 0.03, 300); },
  exp() { tone(220, 0.2, 'sawtooth', 0.04, 220); noise(0.2, 0.05, 2000, 400, 0.05); },
  boom() { noise(0.55, 0.16, 1800, 90); tone(90, 0.4, 'sine', 0.12, -50); },
  hit(c) { noise(0.12, c ? 0.14 : 0.09, 3200, 300); tone(c ? 210 : 140, 0.14, 'triangle', c ? 0.09 : 0.06, -60); },
  miss() { noise(0.12, 0.025, 4000, 2000); },
  step() { tone(120, 0.07, 'square', 0.04, -40); tone(95, 0.07, 'square', 0.03, -30, 0.14); },
  jump() { tone(200, 0.3, 'sawtooth', 0.035, 500); noise(0.25, 0.04, 3000, 900); },
  guard() { tone(300, 0.2, 'triangle', 0.05, 200); tone(600, 0.25, 'sine', 0.03, 0, 0.05); },
  heal() { [520, 660, 880].forEach((f, i) => tone(f, 0.15, 'sine', 0.045, 0, i * 0.08)); },
  deploy() { tone(260, 0.3, 'sawtooth', 0.04, 600); tone(900, 0.2, 'sine', 0.03, 300, 0.15); },
  turn() { tone(660, 0.1, 'triangle', 0.045); tone(990, 0.14, 'triangle', 0.045, 0, 0.09); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.26, 'square', 0.04, 0, i * 0.09)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.04, 0, i * 0.14)); },
  crate() { noise(0.3, 0.1, 900, 200); tone(80, 0.25, 'sine', 0.1, -20); },
  pop() { tone(400, 0.12, 'square', 0.05, 600); noise(0.25, 0.1, 5000, 500); },
  land(r) { tone(200 + r * 90, 0.12, 'triangle', 0.06, -40); noise(0.08, 0.06, 2500, 400); if (r >= 3) [784, 988, 1319].forEach((f, i) => tone(f, 0.25, 'square', 0.03, 0, 0.08 + i * 0.07)); },
  bad() { tone(200, 0.2, 'sawtooth', 0.05, -80); },
  tele() { tone(300, 0.45, 'sine', 0.05, 1500); tone(1800, 0.35, 'triangle', 0.03, -1200, 0.2); noise(0.35, 0.05, 6000, 800); },
  hook() { tone(160, 0.12, 'square', 0.04, -60); noise(0.12, 0.06, 4500, 700); tone(420, 0.1, 'triangle', 0.04, 200, 0.12); },
};

// ------------------------------------------------------------ hudba (generovaná, bez souborů): klidné menu a bojová hudba podle prostředí
let musicOn = LS.get('mecha_music') !== '0', mg = null, timer = 0, cur = null, trk = null, nextT = 0, step = 0;
export const isMusicOn = () => musicOn;
const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);
const TRACKS = {
  menu: { bpm: 78, root: 57, prog: [[0, 3, 7], [8, 0, 3], [3, 7, 10], [10, 2, 5]], roots: [0, 8, 3, 10], drums: 0 },
  junk: { bpm: 112, root: 50, prog: [[0, 3, 7], [8, 0, 3], [3, 7, 10], [10, 2, 5]], roots: [0, 8, 3, 10], drums: 1 },
  factory: { bpm: 126, root: 52, prog: [[0, 3, 7], [0, 3, 7], [8, 0, 3], [10, 2, 5]], roots: [0, 0, 8, 10], drums: 2 },
  desert: { bpm: 104, root: 50, prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [10, 2, 5]], roots: [0, 1, 0, 10], drums: 1 },
  ice: { bpm: 100, root: 57, prog: [[0, 4, 7], [5, 9, 0], [7, 11, 2], [3, 7, 10]], roots: [0, 5, 7, 3], drums: 1 },
  lava: { bpm: 132, root: 48, prog: [[0, 3, 7], [1, 5, 8], [8, 0, 3], [7, 10, 2]], roots: [0, 1, 8, 7], drums: 2 },
  space: { bpm: 96, root: 55, prog: [[0, 3, 7], [8, 0, 3], [10, 2, 5], [7, 10, 2]], roots: [0, 8, 10, 7], drums: 1 },
};
function mnote(a, f, t0, d, type, v, lp = 4000) {
  const o = a.createOscillator(), g = a.createGain(), fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + Math.min(0.03, d / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(fl).connect(g).connect(mg); o.start(t0); o.stop(t0 + d + 0.05);
}
function mdrum(a, kind, t0, v) {
  if (kind === 'k') { const o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(150, t0); o.frequency.exponentialRampToValueAtTime(42, t0 + 0.13); g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18); o.connect(g).connect(mg); o.start(t0); o.stop(t0 + 0.2); return; }
  if (!nb) { nb = a.createBuffer(1, a.sampleRate, a.sampleRate); const x = nb.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1; }
  const s = a.createBufferSource(); s.buffer = nb; s.loop = true; const f = a.createBiquadFilter(), g = a.createGain();
  if (kind === 's') { f.type = 'bandpass'; f.frequency.value = 1900; g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16); } else { f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(v * 0.5, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04); }
  s.connect(f).connect(g).connect(mg); s.start(t0); s.stop(t0 + 0.2);
}
function schedule(a, tr, st, t0) {   // jedna šestnáctina (st = číslo kroku od začátku skladby)
  const bar = Math.floor(st / 16) % 4, k = st % 16, ch = tr.prog[bar], root = tr.root + tr.roots[bar], sd = 60 / tr.bpm / 4;
  if (tr.drums === 0) {   // menu: tichý podklad a arpeggio
    if (k === 0) { ch.forEach((n, j) => mnote(a, mf(tr.root + n + 12), t0, sd * 16, 'sawtooth', 0.016 - j * 0.002, 900)); mnote(a, mf(root - 12), t0, sd * 8, 'sine', 0.09, 400); }
    if (k % 2 === 0) { const n = ch[(k / 2 + (bar % 2)) % 3] + (k % 8 === 4 ? 12 : 0); mnote(a, mf(tr.root + n + 24), t0, sd * 3, 'triangle', 0.035, 3000); }
    return;
  }
  const hard = tr.drums === 2;
  if (k % 4 === 0 || (hard && k === 14)) mdrum(a, 'k', t0, 0.32);
  if (k === 4 || k === 12) mdrum(a, 's', t0, 0.12);
  if (k % 2 === 0) mdrum(a, 'h', t0, k % 4 === 2 ? 0.07 : 0.035); else if (hard && k % 4 === 3) mdrum(a, 'h', t0, 0.03);
  const bp = [0, 0, 7, 0, 0, 12, 7, 0][k >> 1];
  if (k % 2 === 0) mnote(a, mf(root - 12 + (k % 8 === 6 ? bp % 12 : 0)), t0, sd * 1.8, hard ? 'sawtooth' : 'square', 0.07, hard ? 700 : 500);
  if (k === 0) ch.forEach((n, j) => mnote(a, mf(tr.root + n + 12), t0, sd * 14, 'sawtooth', 0.012, 1100 + j * 200));
  if (k % 4 === 2 || (hard && k % 2 === 1)) mnote(a, mf(tr.root + ch[(k >> 1) % 3] + 24 + (k >= 8 ? 12 : 0)), t0, sd * 2, 'triangle', 0.03, 3500);
}
function tickMusic() {
  const a = ac; if (!a || !trk || !mg) return; if (a.state === 'suspended') a.resume();
  const sd = 60 / trk.bpm / 4; if (nextT < a.currentTime) nextT = a.currentTime + 0.05;
  while (nextT < a.currentTime + 0.25) { schedule(a, trk, step, nextT); step++; nextT += sd; }
}
function stopMusic() { clearInterval(timer); timer = 0; trk = null; cur = null; if (mg) { try { mg.gain.cancelScheduledValues(0); mg.gain.value = 0; mg.disconnect(); } catch (e) { /* nic */ } mg = null; } }
export const music = {
  /** kind = 'menu' nebo téma arény (junk, factory, desert, ice, lava, space). Hraje jen po prvním kliknutí (pravidlo prohlížečů). */
  play(kind) {
    if (!musicOn || muted) { stopMusic(); cur = null; want = kind; return; }
    want = kind; const a = audio(); if (!a) return; if (a.state !== 'running') { Promise.resolve(a.resume()).then(() => { if (a.state === 'running' && want === kind && !timer) music.play(kind); }).catch(() => {}); return; }
    const name = TRACKS[kind] ? kind : 'menu'; if (cur === name && timer) return; stopMusic();
    cur = name; trk = TRACKS[name]; step = 0; nextT = a.currentTime + 0.1; mg = a.createGain(); mg.gain.setValueAtTime(0.0001, a.currentTime); mg.gain.exponentialRampToValueAtTime(name === 'menu' ? 0.32 : 0.34, a.currentTime + 1.2); mg.connect(a.destination);
    timer = setInterval(tickMusic, 60);
  },
  stop() { want = null; stopMusic(); },
  /** po prvním kliknutí/dotyku se rozběhne to, co se čekalo */
  unlock() { const a = audio(); if (!a) return; Promise.resolve(a.resume()).then(() => { if (want && !timer) { cur = null; music.play(want); } }).catch(() => {}); },
  setOn(v) { musicOn = !!v; LS.set('mecha_music', musicOn ? '1' : '0'); if (!musicOn) stopMusic(); else if (want) { cur = null; music.play(want); } },
};
let want = null;
