// MINIGOLF – boti: vyzkouší desítky ran ve skutečné fyzice (phys.js simulate) a vyberou tu, po které míček skončí nejblíž jamce (podle vzdálenosti po průchodných
// políčkách), nebo rovnou spadne. Obtížnost mění počet zkoušených ran, přesnost míření a rychlost přemýšlení.
import * as P from './phys.js';
export const BOT_NAMES = { 1: 'Bot Nováček', 2: 'Bot Hráč', 3: 'Bot Šampion' };
export const LV = {
  1: { angN: 36, pows: [0.3, 0.5, 0.7, 0.9], noiseA: 0.1, noiseP: 0.16, top: 4, think: [2.4, 5] },
  2: { angN: 72, pows: [0.2, 0.35, 0.5, 0.65, 0.8, 1], noiseA: 0.035, noiseP: 0.07, top: 2, think: [1.4, 3] },
  3: { angN: 120, pows: [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.78, 0.9, 1], noiseA: 0.005, noiseP: 0.015, top: 1, think: [0.8, 1.8] },
};
const gauss = (rnd) => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) * 1.7; };
/** Vybere ránu: { ang, pow, score }. t = čas jamky, rnd = generátor 0–1. */
export function chooseShot(W, df, x, z, t, level, rnd = Math.random) {
  const lv = LV[level] || LV[2]; const cand = [];
  const tryShot = (ang, pow) => {
    const r = P.simulate(W, x, z, ang, pow, t); let s;
    if (r.ev === 'sink') s = -10000 + r.steps * 0.002 + pow * 2; else if (r.ev === 'hz') s = 1e5; else s = P.distAt(W, df, r.x, r.z) + 0.15 * pow;
    cand.push({ ang, pow, score: s });
  };
  const off = rnd() * Math.PI * 2;
  for (let a = 0; a < lv.angN; a++) for (const p of lv.pows) tryShot(off + a / lv.angN * Math.PI * 2, p);
  cand.sort((a, b) => a.score - b.score);
  if (level >= 2) {   // zjemnění kolem nejlepších ran
    for (const c of cand.slice(0, 3)) for (let da = -3; da <= 3; da++) for (const dp of [-0.06, 0, 0.06]) if (da || dp) tryShot(c.ang + da * (Math.PI * 2 / lv.angN) / 4, Math.max(0.05, Math.min(1, c.pow + dp)));
    cand.sort((a, b) => a.score - b.score);
  }
  const pick = cand[Math.floor(rnd() * Math.min(lv.top, cand.length))];
  return { ang: pick.ang + gauss(rnd) * lv.noiseA, pow: Math.max(0.05, Math.min(1, pick.pow + gauss(rnd) * lv.noiseP)), score: pick.score };
}
