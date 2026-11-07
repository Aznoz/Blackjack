// HOPÍK – hudba: malý syntezátor a sekvencer přes WebAudio (žádné soubory). Tři nálady: menu (vesele poskakující), build (šibalské pokládání pastí) a run (hnaný běh).
// Hraje se po osminových dobách; každý takt má 8 slotů. Notace: 'E5' = nota, '-' = držet, '.' = pauza.
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (tok) => { const m = /^([A-G])([#b]?)(\d)$/.exec(tok); return (Number(m[3]) + 1) * 12 + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MAJ = [0, 4, 7], MIN = [0, 3, 7];

const MOODS = {
  menu: {
    bpm: 126, lead: 'square', leadVol: 0.05, swing: 0.1,
    chords: [['C3', MAJ], ['G2', MAJ], ['A2', MIN], ['F2', MAJ], ['C3', MAJ], ['G2', MAJ], ['F2', MAJ], ['G2', MAJ]],
    bass: ['r . r . o . r .', 'r . r . o . r .', 'r . r . o . r .', 'r . r . o . r .', 'r . r . o . r .', 'r . r . o . r .', 'r . r . o . r .', 'r . f . r . o r'],
    melody: [
      'E5 - G5 E5 C6 - G5 E5', 'D5 - G5 D5 B5 - G5 D5', 'E5 - A5 E5 C6 A5 G5 E5', 'F5 - A5 C6 A5 - F5 .',
      'E5 - G5 E5 C6 - E6 C6', 'D6 - B5 G5 B5 D6 - .', 'A5 - C6 A5 F5 - A5 C6', 'D6 C6 B5 A5 G5 - . .'],
    kick: 'x . . . x . . .', snare: '. . x . . . x .', hat: 'x x x x x x x x', stab: '. x . x . x . x',
  },
  build: {
    bpm: 112, lead: 'square', leadVol: 0.042, swing: 0.16,
    chords: [['A2', MIN], ['F2', MAJ], ['C3', MAJ], ['E2', MAJ], ['A2', MIN], ['F2', MAJ], ['G2', MAJ], ['E2', MAJ]],
    bass: ['r . . r . . f .', 'r . . r . . f .', 'r . . r . . f .', 'r . . r . . f .', 'r . . r . . f .', 'r . . r . . f .', 'r . . r . . f .', 'r . r . o . r .'],
    melody: [
      'A4 . C5 A4 E5 . C5 A4', 'F4 . A4 F4 C5 . A4 F4', 'G4 . C5 G4 E5 . C5 G4', 'G#4 . B4 G#4 E5 D5 B4 G#4',
      'E5 . E5 D5 C5 . A4 .', 'C5 . C5 B4 A4 . F4 .', 'D5 . D5 C5 B4 . G4 .', 'B4 . G#4 . B4 . E5 .'],
    kick: 'x . . . x . . x', snare: '. . x . . . x .', hat: '. x . x . x . x', stab: '. . x . . . x .',
  },
  run: {
    bpm: 150, lead: 'sawtooth', leadVol: 0.034, swing: 0,
    chords: [['A2', MIN], ['G2', MAJ], ['F2', MAJ], ['E2', MAJ], ['A2', MIN], ['G2', MAJ], ['F2', MAJ], ['E2', MAJ]],
    bass: ['r r o r r o r o', 'r r o r r o r o', 'r r o r r o r o', 'r r o r r o r o', 'r r o r r o r o', 'r r o r r o r o', 'r r o r r o r o', 'r r o r r o r o'],
    melody: [
      'A5 E5 A5 C6 B5 A5 G5 E5', 'G5 D5 G5 B5 A5 G5 F5 D5', 'F5 C5 F5 A5 G5 F5 E5 C5', 'E5 B4 E5 G#5 A5 G#5 E5 B4',
      'C6 . C6 B5 A5 . E5 .', 'B5 . B5 A5 G5 . D5 .', 'A5 . A5 G5 F5 . C5 .', 'G#5 A5 B5 C6 B5 G#5 E5 .'],
    kick: 'x . x . x . x .', snare: '. . x . . . x .', hat: 'x x x x x x x x', stab: '. x . x . x . x',
  },
};
const parse = (s) => s.trim().split(/\s+/);
for (const m of Object.values(MOODS)) { m.melodyP = m.melody.map(parse); m.bassP = m.bass.map(parse); m.kickP = parse(m.kick); m.snareP = parse(m.snare); m.hatP = parse(m.hat); m.stabP = parse(m.stab); m.chordsP = m.chords.map(([r, q]) => [midi(r), q]); }   // chordsP drží MIDI kořene akordu

/** Vytvoří hudební přehrávač. getCtx() vrací běžící AudioContext (nebo null), isOn() jestli se smí hrát. */
export function createMusic(getCtx, isOn) {
  let ctx = null, master = null, noiseBuf = null, mood = 'off', cur = null, nextT = 0, slot = 0, timer = 0;
  function ensure() {
    const c = getCtx(); if (!c) return false;
    if (c !== ctx) { ctx = c; master = ctx.createGain(); master.gain.value = 0; const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination); noiseBuf = null; }
    return true;
  }
  function osc(type, f, t, dur, vol, dest, slideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || master); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(t, dur, vol, hp, lp) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp || 12000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f).connect(f2).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  function playSlot(m, t, sl, eighth) {
    const bar = Math.floor(sl / 8) % m.melodyP.length, i = sl % 8; const [root, qual] = m.chordsP[bar];
    // melodie (držení '-' prodlouží předchozí notu, takže nota se spočítá dopředu)
    const tok = m.melodyP[bar][i];
    if (tok !== '-' && tok !== '.') { let len = 1; while (i + len < 8 && m.melodyP[bar][i + len] === '-') len++; osc(m.lead, hz(midi(tok)), t, Math.max(0.09, len * eighth * 0.92), m.leadVol, null); if (m.lead === 'square') osc('triangle', hz(midi(tok) - 12), t, Math.max(0.09, len * eighth * 0.9), m.leadVol * 0.7); }
    // basa
    const b = m.bassP[bar][i]; if (b !== '.') { const n = b === 'r' ? root : b === 'o' ? root + 12 : root + 7; osc('triangle', hz(n), t, eighth * 0.85, 0.11); osc('square', hz(n), t, eighth * 0.4, 0.018); }
    // bicí
    if (m.kickP[i] === 'x') osc('sine', 150, t, 0.13, 0.2, null, 42);
    if (m.snareP[i] === 'x') { noise(t, 0.12, 0.09, 1400, 9000); osc('triangle', 190, t, 0.07, 0.05, null, 120); }
    if (m.hatP[i] === 'x') noise(t, i % 2 ? 0.035 : 0.05, i % 2 ? 0.026 : 0.04, 7500);
    // akordový "stab" na dobách mimo
    if (m.stabP[i] === 'x') for (const iv of qual) osc('square', hz(root + 24 + iv), t, eighth * 0.5, 0.011);
  }
  function tick() {
    if (!cur || !ensure()) return; const m = MOODS[cur]; const eighth = 60 / m.bpm / 2;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.06;       // po pauze (skrytá záložka) se nedohání
    while (nextT < ctx.currentTime + 0.18) {
      const sw = (slot % 2) ? eighth * (m.swing || 0) * 0.5 : 0; playSlot(m, nextT + sw, slot, eighth); slot++; nextT += eighth;
    }
  }
  function fadeTo(v, sec) { if (!master) return; const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(v, t + sec); }
  return {
    /** Nastaví náladu: 'menu' | 'build' | 'run' | 'off'. Volat klidně každý snímek. */
    set(next) {
      const want = isOn() && ensure() ? next : 'off';
      if (want === mood) return;
      if (want === 'off') { mood = 'off'; fadeTo(0, 0.4); setTimeout(() => { if (mood === 'off') { cur = null; clearInterval(timer); timer = 0; } }, 500); return; }
      mood = want;
      const start = () => { cur = want; slot = 0; nextT = ctx.currentTime + 0.08; fadeTo(0.62, 0.25); if (!timer) timer = setInterval(tick, 40); };
      if (cur && cur !== want) { fadeTo(0, 0.25); setTimeout(() => { if (mood === want) start(); }, 280); } else start();
    },
    get mood() { return mood; },
  };
}
