'use strict';
(() => {
  // ==========================================================================
  // Pomocné funkce
  // ==========================================================================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = (n) => Number(n).toLocaleString('cs-CZ');
  const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };

  /** Mini helper na tvorbu DOM – veškerý text jde přes textContent (žádné XSS). */
  function el(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === false || v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* soukromý režim */ } },
  };

  let memToken = null;
  function getToken() {
    let t = store.get('bj_token') || memToken;
    if (!t || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) {
      const b = new Uint8Array(24);
      crypto.getRandomValues(b);
      t = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      store.set('bj_token', t);
    }
    memToken = t;
    return t;
  }

  // ==========================================================================
  // Stav
  // ==========================================================================
  let ws = null;
  let retry = 0;
  let kicked = false;
  let me = null;          // profil: {name, balance, stats}
  let state = null;       // poslední stav stolu
  let screen = 'menu';
  let draft = 100;        // rozpracovaná sázka
  let draftRound = -1;
  let betLimits = { min: 100, max: 100 };
  const timer = { until: 0, total: 1 };
  let popTimeout = null;

  // ==========================================================================
  // Profilovky
  // ==========================================================================
  // Předvolby a1..a10: eso a číselné karty 2–10 přes všechny čtyři barvy.
  const AVATARS = [
    { r: 'A', s: 'S' }, { r: '2', s: 'H' }, { r: '3', s: 'D' }, { r: '4', s: 'C' }, { r: '5', s: 'S' },
    { r: '6', s: 'H' }, { r: '7', s: 'D' }, { r: '8', s: 'C' }, { r: '9', s: 'S' }, { r: '10', s: 'H' },
  ];

  /** Adresa herního serveru pro obrázky (stejný server jako WebSocket). */
  function serverHttpBase() {
    const u = (window.BJ_WS_URL || '').trim();
    if (!u) return location.origin;
    try {
      const x = new URL(u);
      return (x.protocol === 'wss:' ? 'https:' : 'http:') + '//' + x.host;
    } catch (e) {
      return location.origin;
    }
  }

  /** Profilovka: předvolba 'a1'..'a10' (karta kreslená CSS) nebo vlastní 'u:<hash>' (obrázek ze serveru). */
  function avatarEl(id, size = '') {
    const cls = ('avatar ' + size).trim();
    if (typeof id === 'string' && id.startsWith('u:')) {
      const img = el('img', { class: cls, src: `${serverHttpBase()}/avatar/${id.slice(2)}.jpg`, alt: '', loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', () => img.replaceWith(avatarEl('a1', size)));
      return img;
    }
    const n = parseInt(String(id || 'a1').slice(1), 10);
    const a = AVATARS[(n >= 1 && n <= AVATARS.length ? n : 1) - 1];
    return el('div', { class: cls + (a.s === 'H' || a.s === 'D' ? ' red' : '') },
      el('b', { text: a.r }), el('i', { text: SUIT[a.s] }));
  }

  // ==========================================================================
  // Zvuk (syntetizovaný přes WebAudio, žádné soubory)
  // ==========================================================================
  let soundOn = store.get('bj_sound') !== '0';
  let audioCtx = null;
  function ac() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function tone(freq, dur = 0.12, type = 'sine', vol = 0.07, delay = 0) {
    if (!soundOn) return;
    const c = ac();
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  const sfx = {
    card() { tone(520, 0.05, 'triangle', 0.06); tone(310, 0.05, 'square', 0.02, 0.012); },
    chip() { tone(900, 0.05, 'square', 0.035); tone(1300, 0.04, 'square', 0.03, 0.03); },
    turn() { tone(660, 0.1, 'sine', 0.07); tone(880, 0.14, 'sine', 0.07, 0.1); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, i * 0.09)); },
    bj() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, i * 0.08)); },
    lose() { tone(220, 0.25, 'sawtooth', 0.045); tone(165, 0.35, 'sawtooth', 0.045, 0.15); },
    push() { tone(440, 0.15, 'sine', 0.06); },
  };

  // ==========================================================================
  // Síť
  // ==========================================================================
  function send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  function connect() {
    // Adresu herního serveru lze nastavit v config.js (když web a server běží na různých místech).
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = (window.BJ_WS_URL || '').trim() || `${proto}://${location.host}/ws`;
    ws = new WebSocket(url);
    ws.onopen = () => {
      retry = 0;
      $('#conn').hidden = true;
      let session;
      try { session = localStorage.getItem('portal_session') || undefined; } catch (err) { /* ignore */ }
      send({ t: 'hello', token: getToken(), name: store.get('bj_name') || undefined, session });
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      handle(m);
    };
    ws.onclose = () => {
      if (kicked) return;
      $('#conn').hidden = false;
      setTimeout(connect, Math.min(5000, 400 * 2 ** retry++));
    };
    ws.onerror = () => {};
  }

  function handle(m) {
    switch (m.t) {
      case 'welcome':
        me = { name: m.name, balance: m.balance, stats: m.stats, avatar: m.avatar, custom: m.custom, linked: m.linked || null };
        if (m.sessionInvalid) { try { localStorage.removeItem('portal_session'); } catch (err) { /* ignore */ } }
        renderMenu();
        if (m.isNew) {
          toast('Vítej! Jméno a profilovku nastavíš na hlavní stránce po přihlášení přes Google.');
        }
        if (!m.inTable) {
          state = null;
          if (screen === 'table') show('menu');
        }
        break;
      case 'profile':
        me = { name: m.name, balance: m.balance, stats: m.stats, avatar: m.avatar, custom: m.custom, linked: me ? me.linked : null };
        renderMenu();
        if (m.saved === 'name') {
          store.set('bj_name', m.name);
          toast('Přezdívka uložena.');
        } else if (m.saved === 'avatar') {
          toast('Profilovka uložena.');
        }
        break;
      case 'lobby':
        renderLobby(m.tables);
        break;
      case 'table':
        if (screen !== 'table') show('table');
        renderTable(m);
        break;
      case 'left':
        state = null;
        if (screen === 'table') show('menu');
        if (m.reason === 'afk') toast('Byl jsi odpojen od stolu kvůli nečinnosti.', 'err');
        break;
      case 'error':
        toast(m.msg, 'err');
        break;
      case 'toast':
        toast(m.msg);
        break;
      case 'kicked':
        kicked = true;
        toast(m.reason || 'Spojení ukončeno.', 'err');
        $('#conn').textContent = 'Připojeno jinde. Obnov stránku pro návrat do hry.';
        $('#conn').hidden = false;
        break;
      default:
        break;
    }
  }

  function toast(msg, kind = '') {
    const t = el('div', { class: 'toast ' + kind, text: msg });
    $('#toasts').append(t);
    setTimeout(() => t.remove(), 3600);
  }

  // ==========================================================================
  // Obrazovky
  // ==========================================================================
  function show(name) {
    screen = name;
    for (const s of $$('.screen')) s.classList.toggle('active', s.id === 'screen-' + name);
    if (name === 'lobby') send({ t: 'lobby' });
    if (name === 'settings') {
      $('#opt-sound').checked = soundOn;
    }
    window.scrollTo(0, 0);
  }

  function renderMenu() {
    if (!me) return;
    $('#menu-name').textContent = me.name;
    const lk = $('#menu-link');
    lk.hidden = !me.linked;
    lk.textContent = me.linked ? 'Propojeno s Google účtem' + (me.linked.email ? ' (' + me.linked.email + ')' : '') : '';
    $('#menu-avatar').replaceChildren(avatarEl(me.avatar, 'lg'));
    $('#menu-balance').textContent = fmt(me.balance);
    const s = me.stats || {};
    $('#menu-stats').textContent =
      `Kola: ${fmt(s.rounds || 0)} · Výhry: ${fmt(s.wins || 0)} · Blackjacky: ${fmt(s.blackjacks || 0)} · Nejvyšší výhra: ${fmt(s.biggestWin || 0)}`;
  }

  const PHASE_LABEL = {
    betting: 'Sázení', dealing: 'Rozdává se', insurance: 'Pojištění',
    playing: 'Hraje se', dealer: 'Hraje dealer', settle: 'Vyúčtování',
  };

  function renderLobby(tables) {
    const box = $('#lobby-list');
    box.replaceChildren();
    if (!tables.length) {
      box.append(el('div', { class: 'muted', text: 'Zatím žádné stoly – vytvoř první.' }));
      return;
    }
    for (const t of tables) {
      const dots = el('div', { class: 'seatsdots' });
      for (let i = 0; i < t.max; i++) dots.append(el('span', { class: 'dot' + (i < t.players ? ' on' : '') }));
      box.append(
        el('div', { class: 'table-row' },
          el('div', {},
            el('div', { class: 'tname', text: t.name }),
            el('div', { class: 'tinfo', text: `${t.players}/${t.max} hráčů · ${PHASE_LABEL[t.phase] || ''}` })),
          dots,
          el('button', {
            class: 'btn small primary', text: t.players >= t.max ? 'Plno' : 'Připojit',
            disabled: t.players >= t.max,
            onclick: () => send({ t: 'join', id: t.id }),
          })),
      );
    }
  }

  // ==========================================================================
  // Vykreslení stolu
  // ==========================================================================
  function cardEl(c, cls = '') {
    if (!c) return el('div', { class: ('card back ' + cls).trim() });
    const sym = SUIT[c.s];
    const red = c.s === 'H' || c.s === 'D' ? ' red' : '';
    return el('div', { class: ('card' + red + ' ' + cls).trim() },
      el('div', { class: 'corner tl' }, el('b', { text: c.r }), el('i', { text: sym })),
      el('div', { class: 'pip', text: sym }),
      el('div', { class: 'corner br' }, el('b', { text: c.r }), el('i', { text: sym })));
  }

  function totalText(total, soft) {
    return soft && total < 21 ? `${total - 10}/${total}` : String(total);
  }

  const RESULT_LABEL = { win: 'Výhra', blackjack: 'Blackjack!', push: 'Remíza', lose: 'Prohra', bust: 'Přes 21' };

  function cardCount(st) {
    let n = st.dealer.cards.length;
    for (const s of st.seats) for (const h of s.hands) n += h.cards.length;
    return n;
  }

  function renderDealer(st, prev) {
    const box = $('#dealer-cards');
    box.replaceChildren();
    const pc = prev ? prev.dealer.cards : null;
    st.dealer.cards.forEach((c, i) => {
      let cls = '';
      if (pc) {
        if (i >= pc.length) cls = 'deal';
        else if (pc[i] === null && c) cls = 'flip';
      }
      box.append(cardEl(c, cls));
    });
    const tot = $('#dealer-total');
    tot.className = 'total';
    if (!st.dealer.cards.length) {
      tot.textContent = '';
    } else {
      const hidden = st.dealer.cards.includes(null);
      tot.textContent = totalText(st.dealer.total, st.dealer.soft);
      if (st.dealer.total > 21) { tot.classList.add('bust'); tot.textContent = 'Přes ' + st.dealer.total; }
      else if (!hidden && st.dealer.cards.length === 2 && st.dealer.total === 21) { tot.classList.add('bj'); tot.textContent = 'Blackjack'; }
    }
  }

  function renderSeats(st, prev) {
    const box = $('#seats');
    box.replaceChildren();
    for (const s of st.seats) {
      const ps = prev ? prev.seats.find((x) => x.sid === s.sid) : null;
      const cls = ['seat'];
      if (s.you) cls.push('you');
      if (s.active >= 0) cls.push('active');
      if (!s.connected) cls.push('offline');
      if (s.leaving) cls.push('leaving');

      const seat = el('div', { class: cls.join(' ') });
      seat.append(
        el('div', { class: 'seat-pic' }, avatarEl(s.avatar, 'sm')),
        el('div', { class: 'seat-head' },
          el('span', { class: 'who' },
            el('span', { class: 'name', text: s.name }),
            s.you ? el('span', { class: 'you-tag', text: 'ty' }) : null),
          el('span', { class: 'bal' }, el('span', { class: 'coin' }), fmt(s.balance))));

      const hands = el('div', { class: 'hands' });
      s.hands.forEach((h, hi) => {
        const pcount = prev ? ((ps && ps.hands[hi]) ? ps.hands[hi].cards.length : 0) : 99;
        const hc = ['hand'];
        if (s.active === hi) hc.push('on');
        const cards = el('div', { class: 'cards' }, h.cards.map((c, i) => cardEl(c, i >= pcount ? 'deal' : '')));

        const meta = el('div', { class: 'hand-meta' });
        if (h.cards.length) {
          const tc = ['total'];
          let ttxt = totalText(h.total, h.soft);
          if (h.total > 21) { tc.push('bust'); ttxt = 'Přes ' + h.total; }
          else if (h.blackjack) { tc.push('bj'); ttxt = 'BJ'; }
          meta.append(el('span', { class: tc.join(' '), text: ttxt }));
        }
        meta.append(el('span', { class: 'hand-bet' }, el('span', { class: 'coin' }), fmt(h.bet)));
        if (h.doubled) meta.append(el('span', { class: 'badge tag', text: 'x2' }));
        if (h.result) meta.append(el('span', { class: 'badge ' + h.result, text: RESULT_LABEL[h.result] || '' }));
        hands.append(el('div', { class: hc.join(' ') }, cards, meta));
      });
      seat.append(hands);

      if (!s.hands.length) {
        let txt;
        if (s.bet > 0) txt = 'Sázka ' + fmt(s.bet);
        else if (st.phase === 'betting') txt = s.leaving ? 'Odchází…' : 'Vybírá sázku…';
        else txt = 'Čeká na další kolo';
        seat.append(el('div', { class: 'seat-note', text: txt }));
      }
      if (s.insurance > 0) seat.append(el('div', { class: 'insured', text: 'Pojištěno (' + fmt(s.insurance) + ')' }));
      if (s.net != null && st.phase === 'settle') {
        seat.append(el('div', { class: 'net ' + (s.net > 0 ? 'pos' : s.net < 0 ? 'neg' : ''), text: (s.net > 0 ? '+' : s.net < 0 ? '−' : '') + fmt(Math.abs(s.net)) }));
      }
      if (s.leaving) seat.append(el('div', { class: 'seat-note', text: 'Odchází po kole' }));
      if (!s.connected) seat.append(el('div', { class: 'seat-note', text: 'Odpojen' }));
      box.append(seat);
    }
  }

  function statusText(st) {
    const mine = st.seats.find((s) => s.you);
    switch (st.phase) {
      case 'betting': {
        const base = st.you.bet > 0
          ? 'Sázka přijata. Čekáme na ostatní…'
          : st.seats.some((s) => s.bet > 0) ? 'Vsaď včas – kolo se brzy rozdává.' : 'Vsaďte a začne kolo.';
        return st.note ? `${base} ${st.note}` : base;
      }
      case 'dealing':
        return st.note || 'Rozdávám karty…';
      case 'insurance':
        return st.note || 'Dealer ukazuje eso – pojištění?';
      case 'playing': {
        if (st.note) return st.note;
        const a = st.seats.find((s) => s.active >= 0);
        if (!a) return '';
        return a.you ? 'Jsi na tahu!' : `Na tahu: ${a.name}`;
      }
      case 'dealer':
        return 'Hraje dealer…';
      case 'settle': {
        let txt = 'Konec kola.';
        if (mine && mine.participant && mine.net != null) {
          if (mine.net > 0) txt = `Vyhráváš ${fmt(mine.net)}.`;
          else if (mine.net < 0) txt = `Prohráváš ${fmt(-mine.net)}.`;
          else txt = 'Remíza – sázka se vrací.';
        }
        return st.note ? `${txt} ${st.note}` : txt;
      }
      default:
        return '';
    }
  }

  function setTimer(st) {
    if (st.timeLeft == null) {
      timer.until = 0;
    } else {
      timer.until = Date.now() + st.timeLeft;
      timer.total = st.timeTotal || st.timeLeft || 1;
    }
  }

  function tickTimer() {
    const box = $('#timer');
    if (timer.until && screen === 'table') {
      const left = Math.max(0, timer.until - Date.now());
      box.hidden = false;
      $('#timer-bar').style.width = Math.min(100, (left / timer.total) * 100) + '%';
      $('#timer-text').textContent = Math.ceil(left / 1000) + ' s';
      box.classList.toggle('low', left < 5000);
    } else {
      box.hidden = true;
    }
    requestAnimationFrame(tickTimer);
  }

  function showPop(text, kind) {
    const pop = $('#pop');
    pop.textContent = text;
    pop.className = 'pop ' + kind;
    pop.hidden = false;
    clearTimeout(popTimeout);
    popTimeout = setTimeout(() => { pop.hidden = true; }, 3800);
  }

  function resultPop(st, prev) {
    if (st.phase !== 'settle' || (prev && prev.phase === 'settle')) {
      if (st.phase !== 'settle') $('#pop').hidden = true;
      return;
    }
    const mine = st.seats.find((s) => s.you);
    if (!mine || !mine.participant || mine.net == null) return;
    const hasBJ = mine.hands.some((h) => h.result === 'blackjack');
    if (hasBJ && mine.net > 0) { showPop('BLACKJACK! +' + fmt(mine.net), 'win'); sfx.bj(); }
    else if (mine.net > 0) { showPop('+' + fmt(mine.net), 'win'); sfx.win(); }
    else if (mine.net < 0) { showPop('−' + fmt(-mine.net), 'lose'); sfx.lose(); }
    else { showPop('Remíza', 'push'); sfx.push(); }
  }

  function playSounds(st, prev) {
    if (!prev) return;
    if (cardCount(st) > cardCount(prev)) sfx.card();
    if (st.phase === 'betting') {
      const sum = (x) => x.seats.reduce((a, s) => a + (s.bet > 0 ? 1 : 0), 0);
      if (sum(st) > sum(prev)) sfx.chip();
    }
    const now = st.seats.find((s) => s.you);
    const before = prev.seats.find((s) => s.you);
    if (now && now.active >= 0 && (!before || before.active !== now.active)) sfx.turn();
  }

  function renderTable(st) {
    const prev = state && state.id === st.id ? state : null;
    state = st;
    $('#t-name').textContent = st.name;
    $('#t-round').textContent = st.round ? '· kolo ' + st.round : '';
    $('#t-balance').textContent = fmt(st.you.balance);
    renderDealer(st, prev);
    renderSeats(st, prev);
    $('#status').textContent = statusText(st);
    setTimer(st);
    updateControls(st);
    playSounds(st, prev);
    resultPop(st, prev);
  }

  // ==========================================================================
  // Ovládání
  // ==========================================================================
  const CHIPS = [100, 250, 500, 1000, 5000];

  function clampBet(v) {
    v = Math.round(v / 10) * 10;
    return Math.max(betLimits.min, Math.min(betLimits.max, v));
  }

  function setDraft(v) {
    draft = clampBet(v);
    $('#draft-amt').textContent = fmt(draft);
    $('#bet-slider').value = draft;
    $('#bet-confirm').textContent = 'Vsadit ' + fmt(draft);
  }

  function waitText(st, mine) {
    if (st.you.leaving) return 'Stůl opustíš po dohrání kola.';
    if (mine && !mine.participant && st.phase !== 'betting') return 'Čekáš na další kolo – vsadit půjde při dalším sázení.';
    switch (st.phase) {
      case 'insurance': return 'Čekáme na rozhodnutí o pojištění…';
      case 'playing': {
        const a = st.seats.find((s) => s.active >= 0);
        return a ? `Hraje ${a.name}…` : '';
      }
      case 'dealer': return 'Dealer dobírá karty…';
      case 'settle': return 'Za chvíli začne další kolo.';
      default: return '';
    }
  }

  function updateControls(st) {
    const y = st.you;
    const mine = st.seats.find((s) => s.you);
    betLimits = { min: y.minBet, max: y.maxBet };
    const slider = $('#bet-slider');
    slider.min = y.minBet;
    slider.max = y.maxBet;
    $('#bet-limits').textContent = `Min ${fmt(y.minBet)} · Max ${fmt(y.maxBet)} (80 % zůstatku, zaokrouhleno)`;

    const betting = st.phase === 'betting' && y.canBet;
    if (betting && draftRound !== st.round) {
      draftRound = st.round;
      setDraft(y.lastBet || y.minBet);
    } else {
      setDraft(draft);
    }

    const isMyTurn = st.phase === 'playing' && mine && mine.active >= 0;
    $('#ctl-bet').hidden = !betting;
    $('#ctl-insure').hidden = !y.canInsure;
    $('#ctl-play').hidden = !isMyTurn;
    const waiting = !betting && !y.canInsure && !isMyTurn;
    const w = $('#ctl-wait');
    w.hidden = !waiting;
    if (waiting) w.textContent = waitText(st, mine);

    if (betting) {
      $('#bet-edit').hidden = y.bet > 0;
      $('#bet-done').hidden = !(y.bet > 0);
      $('#bet-placed').textContent = fmt(y.bet);
    }
    if (y.canInsure) $('#ins-cost').textContent = fmt(y.insuranceCost);
    if (isMyTurn) {
      for (const b of $$('#ctl-play .act')) b.disabled = !y.actions.includes(b.dataset.act);
    }
  }

  function act(a) {
    if (state && state.you.actions.includes(a)) send({ t: 'act', a });
  }

  function confirmBet() {
    if (!state || !state.you.canBet || state.you.bet > 0) return;
    send({ t: 'bet', amount: draft });
    sfx.chip();
  }

  // ==========================================================================
  // Inicializace
  // ==========================================================================
  function init() {
    // navigace
    for (const b of $$('[data-go]')) {
      b.addEventListener('click', () => {
        ac();
        const go = b.dataset.go;
        if (go === 'quick') send({ t: 'quick' });
        else show(go);
      });
    }

    // nastavení
    $('#opt-sound').addEventListener('change', (e) => {
      soundOn = e.target.checked;
      store.set('bj_sound', soundOn ? '1' : '0');
      if (soundOn) sfx.chip();
    });

    // lobby
    $('#create-form').addEventListener('submit', (e) => {
      e.preventDefault();
      send({ t: 'create', name: $('#create-name').value });
    });

    // stůl
    $('#btn-leave').addEventListener('click', () => send({ t: 'leave' }));
    for (const v of CHIPS) {
      $('#chips').append(el('button', {
        class: 'chip', type: 'button', 'data-v': String(v), 'aria-label': 'Žeton ' + v,
        text: v >= 1000 ? v / 1000 + 'K' : String(v),
        onclick: () => { setDraft(draft + v); sfx.chip(); },
      }));
    }
    $('#bet-slider').addEventListener('input', (e) => setDraft(Number(e.target.value)));
    $('#bet-min').addEventListener('click', () => setDraft(betLimits.min));
    $('#bet-max').addEventListener('click', () => setDraft(betLimits.max));
    $('#bet-confirm').addEventListener('click', confirmBet);
    $('#bet-cancel').addEventListener('click', () => send({ t: 'bet', amount: 0 }));
    $('#ins-yes').addEventListener('click', () => send({ t: 'act', a: 'insure' }));
    $('#ins-no').addEventListener('click', () => send({ t: 'act', a: 'decline' }));
    for (const b of $$('#ctl-play .act')) b.addEventListener('click', () => act(b.dataset.act));

    document.addEventListener('keydown', (e) => {
      if (screen !== 'table' || !state || e.target.tagName === 'INPUT' && e.target.type === 'text') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'h') act('hit');
      else if (k === 's') act('stand');
      else if (k === 'd') act('double');
      else if (k === 'p') act('split');
      else if (k === 'enter' && state.phase === 'betting') confirmBet();
    });

    requestAnimationFrame(tickTimer);
    connect();
  }

  // mobil: zákaz pinch-zoomu (iOS ignoruje user-scalable)
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  init();
})();
