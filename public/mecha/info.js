// MECHA ARÉNA – popis karet (štítky s vlastnostmi), společné pro garáž a souboj.
import * as H from './shared.js?v=4';
export const pct = (v) => Math.round(v * 100) + ' %';
export function itemLines(it, lv = 1) {
  const L = [], chips = [];
  if (it.kind === 'weapon') {
    const slot = it.fit[0] === 'hand' ? 'hdL' : 'shL', w = H.mechStats({ [slot]: it.id }, { [it.id]: { lv } }).weapons[0], T = H.TYPES[w.type];
    chips.push(`<span class="chip ch-${w.type}">${T.name}</span>`, `<span class="chip">${w.dmg}${w.hits > 1 ? ' × ' + w.hits : ''} dmg</span>`, `<span class="chip">přesnost ${w.acc} %</span>`, `<span class="chip">dosah ${w.rng[0] === w.rng[1] ? w.rng[0] : w.rng[0] + '–' + w.rng[1]}</span>`, `<span class="chip">${w.ap} TB</span>`, `<span class="chip">${w.en} EN</span>`);
    if (w.crit) chips.push(`<span class="chip">+${w.crit} % krit</span>`);
    const f = w.fx || {}; if (f.burn) chips.push(`<span class="chip">hoří ${f.burn}× ${f.burnDmg}</span>`); if (f.shock) chips.push(`<span class="chip">šok ${pct(f.shock)}</span>`); if (f.emp) chips.push(`<span class="chip">−${f.emp} EN soupeři</span>`);
    if (f.pull) chips.push(`<span class="chip">přitáhne o ${f.pull}</span>`); if (f.push) chips.push(`<span class="chip">odhodí ${f.push}</span>`); if (f.pierce) chips.push(`<span class="chip">pronikne ${pct(f.pierce)}</span>`); if (f.arc) chips.push(`<span class="chip">obloukem</span>`);
  } else if (it.kind === 'drone') {
    const d = H.mechStats({ drone: it.id }, { [it.id]: { lv } }).drone;
    chips.push(`<span class="chip">${d.hp} HP</span>`, `<span class="chip">vyslání ${d.ap} TB · ${d.en} EN</span>`);
    if (d.dmg) chips.push(`<span class="chip">${d.dmg} dmg / kolo</span>`); if (d.heal) chips.push(`<span class="chip">+${d.heal} HP / kolo</span>`); if (d.shield) chips.push(`<span class="chip">+${d.shield} štít / kolo</span>`); if (d.jam) chips.push(`<span class="chip">−${d.jam} přesnost soupeře</span>`);
    if (d.drain) chips.push(`<span class="chip">−${d.drain} EN / kolo</span>`);
  } else {
    const slot = it.fit[0] === 'head' ? 'head' : it.fit[0] === 'chest' ? 'chest' : it.fit[0] === 'shoulder' ? 'shL' : 'lgL', base = H.mechStats({}, {}), m = H.mechStats({ [slot]: it.id }, { [it.id]: { lv } });
    const d = (k) => Math.round((m[k] - base[k]) * 10) / 10;
    if (d('hp')) chips.push(`<span class="chip">+${d('hp')} HP</span>`); if (d('shield')) chips.push(`<span class="chip">+${d('shield')} štít</span>`); if (d('shieldRegen')) chips.push(`<span class="chip">štít +${d('shieldRegen')} / kolo</span>`);
    if (d('ap')) chips.push(`<span class="chip">+${d('ap')} TB</span>`); if (d('en')) chips.push(`<span class="chip">+${d('en')} EN</span>`); if (d('regen')) chips.push(`<span class="chip">+${d('regen')} EN / kolo</span>`);
    if (d('acc')) chips.push(`<span class="chip">+${d('acc')} přesnost</span>`); if (d('crit')) chips.push(`<span class="chip">+${d('crit')} % krit</span>`); if (d('evade')) chips.push(`<span class="chip">+${d('evade')} % úhyb</span>`);
    if (d('jmp')) chips.push(`<span class="chip">+${d('jmp')} skok</span>`); if (d('spd')) chips.push(`<span class="chip">+${d('spd')} chůze</span>`); if (d('cap')) chips.push(`<span class="chip">+${d('cap')} nosnost</span>`); if (d('rngb')) chips.push(`<span class="chip">+${d('rngb')} dosah</span>`);
    if (m.tele) chips.push(`<span class="chip">teleport až ${m.tele} polí</span>`, `<span class="chip">1 TB · ${m.teleEn} EN</span>`); if (m.rep) chips.push(`<span class="chip">oprava ${m.rep} HP ×${m.repUses}</span>`); if (m.noBurn) chips.push(`<span class="chip">nehoří</span>`);
    for (const k of ['kin', 'nrg', 'exp']) if (m.res[k]) chips.push(`<span class="chip ch-${k}">odolnost ${H.TYPES[k].short} ${pct(m.res[k])}</span>`);
  }
  chips.push(`<span class="chip">váha ${it.w}</span>`); return chips.join('');
}
