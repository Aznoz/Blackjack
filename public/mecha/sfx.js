// MECHA ARÉNA – syntetické zvuky (žádné soubory): výstřely, zásahy, výbuchy, mechanické cvaknutí, otevření bedny.
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nic */ } } };
let ac = null, nb = null, muted = LS.get('mecha_mute') === '1';
const audio = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; };
export const isMuted = () => muted;
export function setMuted(v) { muted = !!v; LS.set('mecha_mute', muted ? '1' : '0'); }
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
};
