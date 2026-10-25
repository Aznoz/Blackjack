// Vesmírná štvanice – vektorová grafika (vše kreslené kódem, žádné obrázkové soubory).
// Čtyři vesmírné barvy (Nova, Kometa, Pulsar, Asteroid), ikony karet, portréty postav a ikony rolí.

const INK = '#16203a';
const sw = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;

// ---------------------------------------------------------------- čtyři barvy (24×24)
export const SUIT_INNER = {
  // Nova: osmicípá hvězda s jasným jádrem (červená)
  nova: `<polygon points="12,0.8 14.2,8.2 21.6,5.6 16.6,11.4 23.2,12 16.6,13.4 21.6,18.6 14.2,15.8 12,23.2 9.8,15.8 2.4,18.6 7.4,13.4 0.8,12 7.4,11.4 2.4,5.6 9.8,8.2" fill="#e5322d"/><circle cx="12" cy="12" r="4.4" fill="#ffb32e"/><circle cx="12" cy="12" r="2" fill="#fff4cf"/>`,
  // Kometa: hlava s ohonem (karmínová)
  kometa: `<path d="M15 9.5C10.5 9.8 6 13 2 22.5c5-3.2 9.5-4.2 14-8.2z" fill="#d1224f" opacity=".9"/><path d="M13 6.5C8 7 4.4 9.6 1.5 14c4-2.2 7-2.6 10.5-5z" fill="#d1224f" opacity=".5"/><circle cx="16.4" cy="8.2" r="5.6" fill="#d1224f"/><circle cx="14.9" cy="6.9" r="2" fill="#ff9aaa"/>`,
  // Pulsar: jádro, dva paprsky a kroužící prstenec (černý)
  pulsar: `<path d="M12 .8l2.1 11.2L12 23.2 9.9 12z" fill="#141b2d"/><ellipse cx="12" cy="12" rx="10.6" ry="3.4" transform="rotate(-28 12 12)" fill="none" stroke="#141b2d" stroke-width="1.7"/><circle cx="12" cy="12" r="3.7" fill="#141b2d"/><circle cx="11" cy="11" r="1.1" fill="#8fe6ff"/>`,
  // Asteroid: hranatý šutr s krátery (tmavě šedý)
  asteroid: `<path d="M4.6 8.2L9.4 2.6l7.2 1.6 5 5.2-1.2 7.4-5.6 5-7.8-1.2-4.4-6.6z" fill="#3d3b49"/><path d="M9.4 2.6l7.2 1.6-3.4 5-6.2-.8z" fill="#55525f"/><circle cx="14.4" cy="14.2" r="2.7" fill="#25232d"/><circle cx="8.2" cy="12.6" r="1.7" fill="#2c2a35"/><circle cx="12.4" cy="18.6" r="1.2" fill="#2c2a35"/>`,
};
export const suitSvg = (suit, cls = 'suit') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${SUIT_INNER[suit] || ''}</svg>`;

// ---------------------------------------------------------------- ikony karet (64×64)
const pistol = (fill = '#cfd6e6', beam = true) => `<polygon points="6,26 36,26 41,19 54,19 54,31 42,31 39,45 28,45 30,33 6,33" fill="${fill}" ${sw}/><rect x="9" y="27.5" width="22" height="2.5" fill="#8793b5"/>${beam ? `<path d="M56 25h6" stroke="#ff4fd8" stroke-width="3" stroke-linecap="round"/><path d="M58 19l3-3M58 31l3 3" stroke="#ffb02e" stroke-width="2" stroke-linecap="round"/>` : ''}`;
const rifle = (len, opts = {}) => {
  const L = 8 + len; // konec hlavně
  const bh = opts.thick ? 7 : 4.6;
  return `<polygon points="3,41 12,29 14,29 14,40 9,47 3,47" fill="#8a6a3a" ${sw}/><rect x="12" y="28" width="20" height="10" rx="3" fill="#cfd6e6" ${sw}/><rect x="28" y="${31 - bh / 2}" width="${L - 28}" height="${bh}" rx="2" fill="#aab6d6" ${sw}/><polygon points="21,37 29,37 27,48 20,48" fill="#5a6890" ${sw}/>` +
    (opts.scope ? `<rect x="16" y="20" width="${opts.scope}" height="6" rx="3" fill="#3a4a7a" ${sw}/><circle cx="${16 + opts.scope}" cy="23" r="3.4" fill="#6ee7ff" stroke="${INK}" stroke-width="1.5"/>` : '') +
    (opts.bipod ? `<path d="M${L - 8} 33l-5 14M${L - 8} 33l5 14" ${sw} fill="none"/>` : '') +
    `<path d="M${L + 3} 31H62" stroke="#ff4fd8" stroke-width="2.5" stroke-linecap="round"/>`;
};
export const ICON_INNER = {
  strela: pistol(),
  stit: `<polygon points="32,5 55,17 55,40 32,59 9,40 9,17" fill="#bfe9ff" ${sw}/><polygon points="32,12 49,21 49,37 32,52 15,37 15,21" fill="#5bc7ff" opacity=".55"/><path d="M35 17L22 35h9l-3 14 15-20h-9z" fill="#ffd23e" ${sw}/>`,
  pilulka: `<g transform="rotate(-38 32 32)"><rect x="6" y="21" width="52" height="22" rx="11" fill="#f4f7ff" ${sw}/><path d="M17 21h15v22H17a11 11 0 0 1 0-22z" fill="#ff5470" ${sw}/><rect x="40" y="25" width="12" height="3.5" rx="1.7" fill="#fff" opacity=".9"/></g><path d="M50 8v10M45 13h10" stroke="#29d17d" stroke-width="3.4" stroke-linecap="round"/>`,
  foukacka: `<path d="M8 54L44 18" stroke="#8fa3c8" stroke-width="7" stroke-linecap="round"/><path d="M8 54L44 18" stroke="#c9d6f2" stroke-width="3" stroke-linecap="round"/><path d="M46 16l10-8-2 12z" fill="#29d17d" ${sw}/><path d="M50 36v14M43 43h14" stroke="#29d17d" stroke-width="4" stroke-linecap="round"/>`,
  varovny: `<polygon points="32,6 59,54 5,54" fill="#ffc531" ${sw}/><rect x="29" y="22" width="6" height="18" rx="3" fill="${INK}"/><circle cx="32" cy="47" r="3.6" fill="${INK}"/><path d="M12 14l-6-4M52 14l6-4M32 2V-1" stroke="#ff4fd8" stroke-width="2.5" stroke-linecap="round"/>`,
  dezintegrator: `<rect x="6" y="26" width="30" height="12" rx="4" fill="#cfd6e6" ${sw}/><rect x="14" y="36" width="8" height="14" rx="2" fill="#8793b5" ${sw}/><path d="M36 32h4" stroke="#6ee7ff" stroke-width="4" stroke-linecap="round"/><rect x="43" y="26" width="8" height="8" fill="#6ee7ff" ${sw}/><rect x="52" y="20" width="6" height="6" fill="#6ee7ff" opacity=".8"/><rect x="53" y="33" width="5" height="5" fill="#6ee7ff" opacity=".7"/><rect x="47" y="14" width="4" height="4" fill="#6ee7ff" opacity=".55"/><rect x="58" y="28" width="3" height="3" fill="#6ee7ff" opacity=".45"/><rect x="48" y="40" width="4" height="4" fill="#6ee7ff" opacity=".5"/>`,
  duel: `<g transform="translate(0 4) scale(.64)">${pistol('#cfd6e6', false)}</g><g transform="translate(64 28) scale(-.64 .64)">${pistol('#aab6d6', false)}</g><polygon points="32,24 34,29 40,30 35,34 37,40 32,37 27,40 29,34 24,30 30,29" fill="#ffb02e" ${sw}/><path d="M6 52h14M44 12h14" stroke="#ff4fd8" stroke-width="3" stroke-linecap="round"/>`,
  zaloha: `<g opacity=".55" transform="translate(-9 6) scale(.8)"><path d="M12 22c0-12 40-12 40 0v10c0 10-10 16-20 16s-20-6-20-16z" fill="#8a96b8" ${sw}/></g><g opacity=".55" transform="translate(21 6) scale(.8)"><path d="M12 22c0-12 40-12 40 0v10c0 10-10 16-20 16s-20-6-20-16z" fill="#8a96b8" ${sw}/></g><path d="M10 25c0-14 44-14 44 0v11c0 11-11 19-22 19S10 47 10 36z" fill="#2a3358" ${sw}/><path d="M13 29h38v10H13z" fill="#e44b4b" ${sw}/><circle cx="23" cy="34" r="3.4" fill="#fff"/><circle cx="41" cy="34" r="3.4" fill="#fff"/><path d="M26 47h12" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  prepadeni: `<path d="M4 14L60 50M4 50L60 14M4 32H60M32 4V60" stroke="#ff3f6e" stroke-width="3" stroke-linecap="round" opacity=".9"/><path d="M4 14L60 50M4 50L60 14M4 32H60M32 4V60" stroke="#ffd0dc" stroke-width="1" stroke-linecap="round"/><circle cx="32" cy="32" r="9" fill="#1c2345" ${sw}/><circle cx="32" cy="32" r="3.4" fill="#ff3f6e"/>`,
  stanice: `<ellipse cx="32" cy="34" rx="25" ry="9" fill="none" stroke="#8fa3c8" stroke-width="5"/><ellipse cx="32" cy="34" rx="25" ry="9" fill="none" stroke="#cfd6e6" stroke-width="2" /><rect x="22" y="16" width="20" height="30" rx="8" fill="#cfd6e6" ${sw}/><rect x="26" y="22" width="12" height="7" rx="3.5" fill="#6ee7ff"/><rect x="2" y="29" width="10" height="10" fill="#3a6fdc" ${sw}/><rect x="52" y="29" width="10" height="10" fill="#3a6fdc" ${sw}/><path d="M32 16V8" ${sw}/><circle cx="32" cy="7" r="2.5" fill="#ff4fd8"/>`,
  sklad: `<rect x="10" y="26" width="44" height="30" rx="3" fill="#a3763d" ${sw}/><path d="M10 26l44 30M54 26L10 56" stroke="#6a4a22" stroke-width="2.5"/><rect x="10" y="26" width="44" height="7" fill="#c89655" ${sw}/><rect x="17" y="8" width="7" height="17" rx="3.5" fill="#ffd23e" ${sw}/><rect x="28" y="4" width="7" height="21" rx="3.5" fill="#ffd23e" ${sw}/><rect x="39" y="10" width="7" height="15" rx="3.5" fill="#ffd23e" ${sw}/>`,
  cerna_dira: `<ellipse cx="32" cy="32" rx="28" ry="11" transform="rotate(-18 32 32)" fill="none" stroke="#ff7a3c" stroke-width="5"/><ellipse cx="32" cy="32" rx="22" ry="8" transform="rotate(-18 32 32)" fill="none" stroke="#ffd36b" stroke-width="2"/><circle cx="32" cy="32" r="13" fill="#04050b" ${sw}/><path d="M32 22c8 0 11 8 5 12s-14 0-12-7" fill="none" stroke="#7a5cff" stroke-width="2"/><circle cx="9" cy="10" r="1.6" fill="#fff"/><circle cx="55" cy="52" r="1.6" fill="#fff"/><circle cx="52" cy="10" r="1.2" fill="#fff"/>`,
  kantyna: `<path d="M12 14h40L35 36v14h10v6H19v-6h10V36z" fill="#d8ecff" opacity=".85" ${sw}/><path d="M16 17h32L35 33H29z" fill="#5be3b4" opacity=".85"/><polygon points="32,19 33.6,23.4 38,23.8 34.6,26.6 35.8,31 32,28.6 28.2,31 29.4,26.6 26,23.8 30.4,23.4" fill="#ffd23e"/><circle cx="50" cy="12" r="3" fill="#ff4fd8"/>`,
  teleport: `<ellipse cx="32" cy="52" rx="20" ry="7" fill="#6ee7ff" opacity=".35" stroke="#6ee7ff" stroke-width="2.5"/><ellipse cx="32" cy="14" rx="20" ry="7" fill="#6ee7ff" opacity=".18" stroke="#6ee7ff" stroke-width="2.5"/><path d="M12 14v38M52 14v38M22 17v38M42 17v38M32 20v38" stroke="#6ee7ff" stroke-width="2" opacity=".6"/><circle cx="32" cy="32" r="6" fill="#fff" opacity=".9"/><path d="M32 22v-6M32 42v6M22 32h-6M42 32h6" stroke="#ff4fd8" stroke-width="3" stroke-linecap="round"/>`,
  harpuna: `<path d="M8 56L46 18" stroke="#8793b5" stroke-width="5" stroke-linecap="round"/><path d="M46 18l-3-14 13 11z" fill="#cfd6e6" ${sw}/><path d="M43 4l-7 8M56 15l-8 7" ${sw}/><path d="M8 56c-4-8 6-14 14-8s2 12-4 8" fill="none" stroke="#ffb02e" stroke-width="3"/>`,
  opasek: `<rect x="2" y="22" width="60" height="20" fill="#6d4b2a" ${sw}/><path d="M2 28h60M2 36h60" stroke="#4a3118" stroke-width="1.4"/><polygon points="22,12 42,12 52,22 52,42 42,52 22,52 12,42 12,22" fill="#e3b94a" ${sw}/><polygon points="25,18 39,18 46,25 46,39 39,46 25,46 18,39 18,25" fill="#2a3358"/><path d="M34 21l-9 13h7l-3 10 11-15h-7z" fill="#ffd23e"/>`,
  brokovnice: rifle(36, { thick: true }),
  kanon: `<rect x="6" y="26" width="46" height="16" rx="5" fill="#8fa3c8" ${sw}/><rect x="48" y="23" width="10" height="22" rx="3" fill="#cfd6e6" ${sw}/><rect x="8" y="42" width="18" height="12" rx="3" fill="#5a6890" ${sw}/><circle cx="14" cy="55" r="5" fill="#cfd6e6" ${sw}/><path d="M60 34h4" stroke="#ff4fd8" stroke-width="3" stroke-linecap="round"/><path d="M62 28l2-3M62 40l2 3" stroke="#ffb02e" stroke-width="2" stroke-linecap="round"/>`,
  puska: rifle(40, { scope: 14 }),
  odstrelovaci: rifle(46, { scope: 20, bipod: true }),
  kulomet: `<rect x="6" y="28" width="22" height="16" rx="4" fill="#5a6890" ${sw}/><circle cx="17" cy="36" r="8" fill="#cfd6e6" ${sw}/><circle cx="17" cy="36" r="3" fill="${INK}"/><rect x="28" y="27" width="28" height="3.6" rx="1.8" fill="#cfd6e6" ${sw}/><rect x="28" y="33" width="28" height="3.6" rx="1.8" fill="#cfd6e6" ${sw}/><rect x="28" y="39" width="28" height="3.6" rx="1.8" fill="#cfd6e6" ${sw}/><path d="M58 29h5M58 35h5M58 41h5" stroke="#ff4fd8" stroke-width="2.4" stroke-linecap="round"/><rect x="10" y="44" width="10" height="12" rx="2" fill="#3a4a7a" ${sw}/>`,
  cela: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#0c1230" ${sw}/><path d="M16 8v48M26 8v48M36 8v48M46 8v48" stroke="#6ee7ff" stroke-width="3.4" opacity=".9"/><path d="M16 8v48M26 8v48M36 8v48M46 8v48" stroke="#fff" stroke-width="1" opacity=".7"/><rect x="22" y="28" width="20" height="16" rx="3" fill="#ffb02e" ${sw}/><path d="M26 28v-5a6 6 0 0 1 12 0v5" fill="none" ${sw}/><circle cx="32" cy="36" r="2.4" fill="${INK}"/>`,
  vynalez: `<circle cx="32" cy="36" r="19" fill="#39426b" ${sw}/><circle cx="32" cy="36" r="9" fill="#ff3f6e" ${sw}/><circle cx="32" cy="36" r="4" fill="#ffd0dc"/><path d="M32 17V8M45 23l7-7M19 23l-7-7M51 36h8M13 36H5" ${sw}/><path d="M32 8l5-4M32 8l-5-4" stroke="#ffb02e" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="4" r="2.4" fill="#ffb02e"/>`,
};
export const iconSvg = (type, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">${ICON_INNER[type] || ''}</svg>`;

// ---------------------------------------------------------------- rub karty (balíček)
export const BACK_SVG = `<svg viewBox="0 0 64 90" class="backsvg" aria-hidden="true"><rect x="2" y="2" width="60" height="86" rx="8" fill="#0d1432" stroke="#38e1ff" stroke-width="2"/><rect x="7" y="7" width="50" height="76" rx="5" fill="none" stroke="#ff4fd8" stroke-width="1" opacity=".7"/><circle cx="32" cy="45" r="16" fill="none" stroke="#38e1ff" stroke-width="2"/><ellipse cx="32" cy="45" rx="25" ry="7" transform="rotate(-22 32 45)" fill="none" stroke="#ff4fd8" stroke-width="2"/><circle cx="32" cy="45" r="5" fill="#ffd23e"/><circle cx="14" cy="16" r="1.4" fill="#fff"/><circle cx="50" cy="74" r="1.4" fill="#fff"/><circle cx="48" cy="14" r="1" fill="#fff"/><circle cx="16" cy="72" r="1" fill="#fff"/></svg>`;

// ---------------------------------------------------------------- ikony rolí (48×48)
export const ROLE_INNER = {
  kapitan: `<circle cx="24" cy="24" r="21" fill="#1c2a5c" stroke="#ffd23e" stroke-width="2.5"/><polygon points="24,8 28,19 40,19 30.500,26 34,38 24,31 14,38 17.500,26 8,19 20,19" fill="#ffd23e"/>`,
  ruka: `<path d="M24 4l17 6v13c0 11-8 18-17 21C15 41 7 34 7 23V10z" fill="#2b5fd8" stroke="#bfe9ff" stroke-width="2.4" stroke-linejoin="round"/><path d="M15 24l7 7 12-14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  bandita: `<path d="M9 22c0-14 30-14 30 0v8c0 7-7 12-15 12S9 37 9 30z" fill="#e8ecf8" stroke="#16203a" stroke-width="2.2"/><circle cx="18" cy="26" r="4.4" fill="#16203a"/><circle cx="30" cy="26" r="4.4" fill="#16203a"/><path d="M20 36v4M24 36v5M28 36v4" stroke="#16203a" stroke-width="2.2" stroke-linecap="round"/><path d="M6 17h36" stroke="#e44b4b" stroke-width="5"/>`,
  zabijak: `<circle cx="24" cy="24" r="14" fill="none" stroke="#ff3f6e" stroke-width="3"/><circle cx="24" cy="24" r="4" fill="#ff3f6e"/><path d="M24 3v12M24 33v12M3 24h12M33 24h12" stroke="#ff3f6e" stroke-width="3" stroke-linecap="round"/>`,
  sebevrah: `<circle cx="22" cy="28" r="15" fill="#2a3358" stroke="#16203a" stroke-width="2.2"/><path d="M30 14c3-4 6-5 9-4" fill="none" stroke="#c9a15a" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="9" r="3.4" fill="#ffb02e"/><circle cx="17" cy="23" r="3" fill="#fff" opacity=".6"/>`,
  silenec: `<circle cx="24" cy="24" r="20" fill="#7a3fd8" stroke="#16203a" stroke-width="2.2"/><circle cx="16" cy="21" r="6.4" fill="#fff"/><circle cx="32" cy="21" r="6.4" fill="#fff"/><path d="M16 21m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M32 21m-3 0a3 3 0 1 1 6 0a3 3 0 1 1-6 0" fill="none" stroke="#16203a" stroke-width="2"/><path d="M13 35q11 8 22 0" fill="none" stroke="#16203a" stroke-width="3" stroke-linecap="round"/>`,
};
export const roleSvg = (role, cls = 'roleico') => `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true">${ROLE_INNER[role] || '<circle cx="24" cy="24" r="20" fill="#26305a"/><text x="24" y="32" text-anchor="middle" font-size="26" font-weight="800" fill="#8fa3c8">?</text>'}</svg>`;

// ---------------------------------------------------------------- portréty postav (64×64)
// suit = barva obleku, helm = přilba, vis = hledí; acc = doplněk
const CHAR_LOOK = {
  blackhole: { suit: '#3a2a6b', helm: '#15122a', vis: '#b66bff', acc: 'swirl' },
  mjohnson:  { suit: '#d9772b', helm: '#f0d8b8', vis: '#2a3358', acc: 'dual' },
  mat:       { suit: '#8a2a2a', helm: '#c9c2bc', vis: '#ff4a4a', acc: 'scar', wide: true },
  jjohnson:  { suit: '#2f8a52', helm: '#e9eef5', vis: '#0e2a22', acc: 'cap' },
  jjackson:  { suit: '#3d5aa8', helm: '#e9eef5', vis: '#1a2447', acc: 'monocle' },
  fwild:     { suit: '#e9eef5', helm: '#e9eef5', vis: '#2f9ad8', acc: 'cross' },
  underpost: { suit: '#5a6b3a', helm: '#cdd3b8', vis: '#1c2a14', acc: 'goggles' },
  doe:       { suit: '#9aa6bd', helm: '#f3f6fb', vis: '#f3f6fb', acc: 'blank' },
  blackjack: { suit: '#1f1f2b', helm: '#2b2b3a', vis: '#ff3f6e', acc: 'beak' },
  cassidy:   { suit: '#7a5a2e', helm: '#d8c8a0', vis: '#243040', acc: 'hat' },
  acecart:   { suit: '#a32a52', helm: '#e9eef5', vis: '#1a2447', acc: 'ace' },
  trench:    { suit: '#6a5a44', helm: '#d6cdbd', vis: '#1a2447', acc: 'collar' },
  lafayette: { suit: '#c43f7f', helm: '#f0e0ea', vis: '#2a3358', acc: 'round' },
  kriko:     { suit: '#2a8a8a', helm: '#cfe9e9', vis: '#102a2a', acc: 'mohawk' },
  trash:     { suit: '#5c6470', helm: '#aab2bd', vis: '#1d2a22', acc: 'lid' },
  bench:     { suit: '#b08a3a', helm: '#f0e6c8', vis: '#2a3358', acc: 'pack' },
  belt:      { suit: '#3a7fd0', helm: '#e9eef5', vis: '#14224a', acc: 'bandolier' },
  put:       { suit: '#8ad04a', helm: '#f3f6e9', vis: '#2a3a1c', acc: 'tiara' },
  jurassic:  { suit: '#3f9a5a', helm: '#bfe8c4', vis: '#12301c', acc: 'spikes' },
};
export function portraitSvg(id, cls = 'portrait') {
  const L = CHAR_LOOK[id] || { suit: '#4a5a88', helm: '#e9eef5', vis: '#1a2447', acc: '' };
  const shoulder = L.wide ? 'M4 64c0-14 10-20 28-20s28 6 28 20z' : 'M10 64c0-13 8-20 22-20s22 7 22 20z';
  let back = ''; let front = '';
  switch (L.acc) {
    case 'swirl': front = `<path d="M32 20c6 0 8 6 4 8s-9-1-7-5" fill="none" stroke="#e1b8ff" stroke-width="1.6" opacity=".9"/>`; break;
    case 'dual': front = `<rect x="29.500" y="18" width="5" height="14" fill="${L.helm}"/>`; break;
    case 'scar': front = `<path d="M38 17l-6 14" stroke="#fff" stroke-width="2" opacity=".85"/>`; break;
    case 'cap': back = ''; front = `<path d="M15 21q17-14 34 0z" fill="#1f6a3f" stroke="${INK}" stroke-width="1.6"/><rect x="12" y="20" width="40" height="3.5" rx="1.7" fill="#164d2e" stroke="${INK}" stroke-width="1.4"/>`; break;
    case 'monocle': front = `<circle cx="39" cy="26" r="5" fill="none" stroke="#ffd23e" stroke-width="2"/><path d="M42 30q4 8 1 14" fill="none" stroke="#ffd23e" stroke-width="1.2"/>`; break;
    case 'cross': front = `<path d="M32 4v8M28 8h8" stroke="#e44b4b" stroke-width="3.4" stroke-linecap="round"/>`; break;
    case 'goggles': front = `<circle cx="25" cy="23" r="5.600" fill="#6ee7ff" stroke="${INK}" stroke-width="2"/><circle cx="39" cy="23" r="5.600" fill="#6ee7ff" stroke="${INK}" stroke-width="2"/>`; break;
    case 'blank': front = ''; break;
    case 'beak': front = `<path d="M32 28l-5 8 5-2 5 2z" fill="#e8d9a0" stroke="${INK}" stroke-width="1.4"/><path d="M20 12l-4-8 8 5M44 12l4-8-8 5" fill="#2b2b3a" stroke="${INK}" stroke-width="1.4"/>`; break;
    case 'hat': front = `<path d="M10 20h44l-6-3q-4-10-16-10t-16 10z" fill="#9a7035" stroke="${INK}" stroke-width="1.6"/><rect x="18" y="14" width="28" height="3" fill="#5a3f1c"/>`; break;
    case 'ace': front = `<rect x="26" y="3" width="12" height="16" rx="2" fill="#fff" stroke="${INK}" stroke-width="1.4" transform="rotate(12 32 11)"/><path d="M32 7l3 6h-6z" fill="${INK}" transform="rotate(12 32 11)"/>`; break;
    case 'collar': back = `<path d="M10 44l8-10 6 12zM54 44l-8-10-6 12z" fill="#52452f" stroke="${INK}" stroke-width="1.4"/>`; break;
    case 'round': front = `<circle cx="25" cy="25" r="6" fill="none" stroke="#fff" stroke-width="2"/><circle cx="39" cy="25" r="6" fill="none" stroke="#fff" stroke-width="2"/><path d="M31 25h2" stroke="#fff" stroke-width="2"/>`; break;
    case 'mohawk': back = `<path d="M24 12l4-9 4 7 4-8 4 9z" fill="#ff4f6a" stroke="${INK}" stroke-width="1.4"/>`; break;
    case 'lid': front = `<ellipse cx="32" cy="9" rx="13" ry="4" fill="#98a2b0" stroke="${INK}" stroke-width="1.6"/><rect x="29" y="3" width="6" height="4" rx="2" fill="#6b7482" stroke="${INK}" stroke-width="1.2"/>`; break;
    case 'pack': back = `<rect x="6" y="38" width="12" height="18" rx="4" fill="#7a5a2e" stroke="${INK}" stroke-width="1.6"/><rect x="46" y="38" width="12" height="18" rx="4" fill="#7a5a2e" stroke="${INK}" stroke-width="1.6"/>`; break;
    case 'bandolier': front = `<path d="M14 62l36-16" stroke="#5a3f1c" stroke-width="6"/><circle cx="24" cy="57" r="2.200" fill="#ffd23e"/><circle cx="32" cy="53" r="2.200" fill="#ffd23e"/><circle cx="40" cy="50" r="2.200" fill="#ffd23e"/>`; break;
    case 'tiara': front = `<path d="M18 13l5-8 4 6 5-8 5 8 4-6 5 8z" fill="#ffd23e" stroke="${INK}" stroke-width="1.4"/>`; break;
    case 'spikes': back = `<path d="M16 16l-6-9 10 4zM26 9l1-9 6 8zM38 8l5-8 3 10zM48 16l8-6-2 11z" fill="#2c7a44" stroke="${INK}" stroke-width="1.4"/>`; break;
    default:
  }
  const helmX = 32; const helmY = 26;
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="pg-${id}" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#2c3a78"/><stop offset="1" stop-color="#0a0f26"/></radialGradient></defs>
  <rect width="64" height="64" fill="url(#pg-${id})"/><circle cx="8" cy="10" r=".9" fill="#fff"/><circle cx="56" cy="14" r=".8" fill="#fff"/><circle cx="52" cy="48" r=".7" fill="#fff"/>
  ${back}<path d="${shoulder}" fill="${L.suit}" stroke="${INK}" stroke-width="2"/><path d="M24 44q8 6 16 0" fill="none" stroke="${INK}" stroke-width="2"/>
  <circle cx="${helmX}" cy="${helmY}" r="19" fill="${L.helm}" stroke="${INK}" stroke-width="2.200"/>
  <rect x="17" y="17" width="30" height="19" rx="9.500" fill="${L.vis}" stroke="${INK}" stroke-width="2"/><ellipse cx="25" cy="21.500" rx="5" ry="2.200" fill="#fff" opacity=".35"/>
  ${front}</svg>`;
}
// robot (pro boty)
export const botSvg = (cls = 'portrait') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="#101a3d"/><path d="M32 4v9" stroke="#8fa3c8" stroke-width="3"/><circle cx="32" cy="4" r="3" fill="#ff4fd8"/><rect x="11" y="13" width="42" height="36" rx="9" fill="#b9c4de" stroke="${INK}" stroke-width="2.2"/><rect x="17" y="21" width="30" height="16" rx="6" fill="#0d1432" stroke="${INK}" stroke-width="2"/><circle cx="25" cy="29" r="4" fill="#6ee7ff"/><circle cx="39" cy="29" r="4" fill="#6ee7ff"/><path d="M24 43h16" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M6 24v14M58 24v14" stroke="#8fa3c8" stroke-width="5" stroke-linecap="round"/><path d="M14 64c0-8 8-12 18-12s18 4 18 12z" fill="#5a6890" stroke="${INK}" stroke-width="2"/></svg>`;
export const CHAR_IDS = Object.keys(CHAR_LOOK);
