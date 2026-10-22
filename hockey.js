'use strict';
/**
 * Air hockey: stoly, zápasy pro dva hráče, odměny za série výher.
 * Server je autoritativní (fyzika běží tady), klient posílá jen polohu kurzoru.
 */
const { Rink, W, H, DT } = require('./hockey-physics');

const SC = Number(process.env.TIME_SCALE) > 0 ? Number(process.env.TIME_SCALE) : 1;
const tt = (ms) => Math.max(5, Math.round(ms * SC));

const HCFG = Object.freeze({
  WIN_SCORE: Math.max(1, parseInt(process.env.HOCKEY_WIN_SCORE, 10) || 7),
  COUNTDOWN: tt(3000),
  VOTE_TIME: tt(9000),       // hlasování o rychlosti před každým zápasem
  VOTE_REVEAL: tt(1500),     // když hlasují oba, počkáme chvilku a rozhodneme
  SPEEDS: { slow: 0.7, normal: 1, fast: 1.35 }, // násobek rychlosti puku
  GOAL_PAUSE: tt(1800),
  OVER_PAUSE: tt(7000),
  EMPTY_TTL: tt(60000),
  STILL_RESERVE: tt(8000), // puk stojí tak dlouho -> nové podání
  REWARDS: [200, 400, 650, 1000], // 1. výhra v řadě u stolu, 2., 3., 4. a každá další
  MAX_TABLES: 30,
});

const reward = (streak) => HCFG.REWARDS[Math.min(streak, HCFG.REWARDS.length) - 1];
const r1 = (v) => Math.round(v * 10) / 10;

module.exports = function createHockey(ctx) {
  const { send, markDirty, resolveAccount, notifyBalance, cleanTableName, TOKEN_RE } = ctx;
  const tables = new Map();
  let seq = 0;
  const lobbyListeners = new Set(); // spojení, která zrovna nesedí u stolu

  class Table {
    constructor(name, permanent) {
      this.id = ++seq;
      this.name = name;
      this.permanent = permanent;
      this.seats = [null, null]; // { acc, streak, score }
      this.phase = 'waiting';    // waiting | vote | reveal | countdown | playing | goal | over
      this.phaseEnd = 0;
      this.rink = new Rink();
      this.serve = 0;
      this.winner = null;
      this.lastReward = null;
      this.emptySince = permanent ? 0 : Date.now();
      this.lastTick = Date.now();
      this.acc = 0;
      this.tickNo = 0;
      this.pending = 0; // události od posledního snímku
      this.stillSince = 0;
      this.speedKey = 'normal';
      this.voteHow = null; // same | coin | default
    }

    count() { return this.seats.filter(Boolean).length; }
    idx(acc) { return this.seats.findIndex((s) => s && s.acc === acc); }

    add(acc) {
      const i = this.seats[0] ? 1 : 0;
      this.seats[i] = { acc, streak: 0, score: 0, vote: null };
      acc.htable = this;
      this.emptySince = 0;
      lobbyListeners.delete(acc.hws);
      if (this.count() === 2 && this.phase === 'waiting') this.startMatch();
      this.meta();
      broadcastLobby();
    }

    leave(acc) {
      const i = this.idx(acc);
      if (i < 0) return;
      this.seats[i] = null;
      acc.htable = null;
      if (acc.hws) { lobbyListeners.add(acc.hws); send(acc.hws, { t: 'left' }); send(acc.hws, { t: 'lobby', tables: lobbyInfo() }); }
      // odchod uprostřed zápasu = zápas se ruší (bez odměny), zbylý hráč čeká na dalšího
      if (this.phase !== 'waiting') {
        this.phase = 'waiting';
        this.winner = null;
        this.lastReward = null;
        const other = this.seats[1 - i];
        if (other) other.score = 0;
        this.rink.reset(0);
      }
      if (this.count() === 0 && !this.permanent) this.emptySince = Date.now();
      this.meta();
      broadcastLobby();
    }

    startMatch() {
      for (const s of this.seats) if (s) s.score = 0;
      this.winner = null;
      this.lastReward = null;
      this.serve = Math.random() < 0.5 ? 0 : 1;
      this.rink.reset(this.serve);
      this.stillSince = 0;
      for (const s of this.seats) if (s) s.vote = null;
      this.voteHow = null;
      this.phase = 'vote';
      this.phaseEnd = Date.now() + HCFG.VOTE_TIME;
    }

    vote(acc, key) {
      const i = this.idx(acc);
      if (i < 0 || this.phase !== 'vote' || !(key in HCFG.SPEEDS)) return;
      this.seats[i].vote = key;
      if (this.seats.every((s) => s && s.vote)) this.resolveVote(Date.now());
      else this.meta();
    }

    /** Oba hlasovali (nebo vypršel čas): stejný hlas platí, jinak 50/50 mezi dvěma hlasy. */
    resolveVote(now) {
      const vs = this.seats.map((s) => (s && s.vote) || null);
      const given = vs.filter(Boolean);
      if (given.length === 0) { this.speedKey = 'normal'; this.voteHow = 'default'; }
      else if (given.length === 1) { this.speedKey = given[0]; this.voteHow = 'same'; } // hlasoval jen jeden
      else if (given[0] === given[1]) { this.speedKey = given[0]; this.voteHow = 'same'; }
      else { this.speedKey = given[Math.random() < 0.5 ? 0 : 1]; this.voteHow = 'coin'; }
      this.rink.speed = HCFG.SPEEDS[this.speedKey];
      this.phase = 'reveal';
      this.phaseEnd = now + HCFG.VOTE_REVEAL;
      this.meta();
    }

    view(forIdx) {
      return {
        t: 'table', id: this.id, name: this.name, phase: this.phase, you: forIdx,
        win: HCFG.WIN_SCORE, rewards: HCFG.REWARDS,
        left: Math.max(0, this.phaseEnd - Date.now()),
        winner: this.winner, reward: this.lastReward,
        speeds: Object.keys(HCFG.SPEEDS), speed: this.speedKey, how: this.voteHow,
        myVote: forIdx >= 0 && this.seats[forIdx] ? this.seats[forIdx].vote : null,
        votes: this.phase === 'reveal' || this.phase === 'countdown' ? this.seats.map((s) => s && s.vote) : null,
        voted: this.seats.map((s) => !!(s && s.vote)),
        seats: this.seats.map((s) => s && {
          name: s.acc.name, avatar: s.acc.avatar, score: s.score, streak: s.streak,
          next: reward(s.streak + 1),
        }),
      };
    }

    meta() {
      for (let i = 0; i < 2; i++) {
        const s = this.seats[i];
        if (s && s.acc.hws) send(s.acc.hws, this.view(i));
      }
    }

    snapshot() {
      const p = this.rink.puck;
      const m = this.rink.mallets;
      const snap = JSON.stringify({ t: 's', p: [r1(p.x), r1(p.y), r1(p.vx), r1(p.vy)], m: [r1(m[0].x), r1(m[0].y), r1(m[1].x), r1(m[1].y)], e: this.pending });
      this.pending = 0;
      for (const s of this.seats) if (s && s.acc.hws && s.acc.hws.readyState === 1) { try { s.acc.hws.send(snap); } catch (e) { /* ignore */ } }
    }

    /** Jeden fixní tick (1/60 s). */
    tick(now) {
      if (this.phase === 'waiting') return;
      if (this.phase === 'vote') {
        this.rink.step(false);
        if (now >= this.phaseEnd) this.resolveVote(now);
      } else if (this.phase === 'reveal') {
        this.rink.step(false);
        if (now >= this.phaseEnd) { this.phase = 'countdown'; this.phaseEnd = now + HCFG.COUNTDOWN; this.meta(); }
      } else if (this.phase === 'countdown') {
        this.rink.step(false);
        if (now >= this.phaseEnd) { this.phase = 'playing'; this.meta(); }
      } else if (this.phase === 'playing') {
        const ev = this.rink.step(true);
        this.pending |= ev;
        if (ev & 4) this.onGoal(now);
        else {
          // puk stojí a nikdo na něj nesáhl: podání se přehodí na druhého hráče
          const p = this.rink.puck;
          if (Math.hypot(p.vx, p.vy) > 8) this.stillSince = now;
          else if (!this.stillSince) this.stillSince = now;
          else if (now - this.stillSince > HCFG.STILL_RESERVE) {
            this.serve = 1 - this.serve;
            this.rink.resetPuck(this.serve);
            this.stillSince = now;
          }
        }
      } else if (this.phase === 'goal') {
        this.rink.step(false);
        if (now >= this.phaseEnd) {
          this.rink.resetPuck(this.serve);
          this.stillSince = 0;
          this.phase = 'playing';
          this.meta();
        }
      } else if (this.phase === 'over') {
        this.rink.step(false);
        if (now >= this.phaseEnd) {
          if (this.count() === 2) this.startMatch(); else { this.phase = 'waiting'; this.winner = null; this.lastReward = null; }
          this.meta();
        }
      }
      if (++this.tickNo % 2 === 0) this.snapshot();
    }

    onGoal(now) {
      const scorer = this.rink.goal;
      const s = this.seats[scorer];
      if (!s) return;
      s.score++;
      this.serve = 1 - scorer; // podává ten, kdo inkasoval
      if (s.score >= HCFG.WIN_SCORE) return this.endMatch(scorer, now);
      this.phase = 'goal';
      this.phaseEnd = now + HCFG.GOAL_PAUSE;
      this.meta();
    }

    endMatch(winIdx, now) {
      const w = this.seats[winIdx];
      const l = this.seats[1 - winIdx];
      w.streak++;
      if (l) l.streak = 0;
      const amount = reward(w.streak);
      w.acc.balance += amount; // společný zůstatek pro všechny hry
      markDirty();
      notifyBalance(w.acc);
      this.winner = winIdx;
      this.lastReward = { to: winIdx, amount, streak: w.streak };
      this.phase = 'over';
      this.phaseEnd = now + HCFG.OVER_PAUSE;
      this.meta();
    }

    setMallet(acc, x, y) {
      const i = this.idx(acc);
      if (i < 0) return;
      this.rink.setTarget(i, x, y);
    }

    info() {
      return { id: this.id, name: this.name, permanent: this.permanent, players: this.seats.filter(Boolean).map((s) => s.acc.name), phase: this.phase, full: this.count() >= 2 };
    }
  }

  function lobbyInfo() {
    return [...tables.values()].map((tb) => tb.info());
  }

  let lobbyTimer = null;
  function broadcastLobby() {
    if (lobbyTimer) return;
    lobbyTimer = setTimeout(() => {
      lobbyTimer = null;
      const msg = { t: 'lobby', tables: lobbyInfo() };
      for (const ws of lobbyListeners) send(ws, msg);
    }, 150);
  }

  function createTable(name, permanent) {
    const tb = new Table(name, permanent);
    tables.set(tb.id, tb);
    return tb;
  }
  ['Stůl 1', 'Stůl 2', 'Stůl 3'].forEach((n) => createTable(n, true));

  // ---- hlavní smyčka: fixní tick 60 Hz, dohání zpoždění ------------------------------------------
  const loop = setInterval(() => {
    const now = Date.now();
    for (const tb of tables.values()) {
      if (tb.phase !== 'waiting') {
        tb.acc += now - tb.lastTick;
        let steps = 0;
        while (tb.acc >= DT * 1000 && steps < 5) { tb.tick(now); tb.acc -= DT * 1000; steps++; }
        if (tb.acc > 200) tb.acc = 0; // server se zasekl, nedoháníme
      } else {
        tb.acc = 0;
      }
      tb.lastTick = now;
      if (!tb.permanent && tb.count() === 0 && tb.emptySince && now - tb.emptySince > HCFG.EMPTY_TTL) {
        tables.delete(tb.id);
        broadcastLobby();
      }
    }
  }, 8);
  loop.unref();

  // ---- spojení --------------------------------------------------------------------------------------
  function profileMsg(acc, saved) {
    return { t: 'profile', name: acc.name, balance: acc.balance, avatar: acc.avatar, custom: acc.custom, saved };
  }

  function leaveAll(acc) {
    if (acc.htable) acc.htable.leave(acc);
  }

  function joinTable(acc, tb) {
    if (!tb) return 'Stůl neexistuje.';
    if (acc.htable) return 'Už sedíš u stolu.';
    if (tb.count() >= 2) return 'Stůl je plný.';
    tb.add(acc);
    return null;
  }

  function handleConnection(ws) {
    ws.bucket = 30; ws.bucketAt = Date.now(); ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (raw) => {
      if (raw.length > 512) return;
      const now = Date.now();
      ws.bucket = Math.min(150, ws.bucket + ((now - ws.bucketAt) / 1000) * 120);
      ws.bucketAt = now;
      if (ws.bucket < 1) return;
      ws.bucket -= 1;
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
      if (!msg || typeof msg.t !== 'string') return;
      const acc = ws.account;

      if (msg.t === 'hello') {
        if (typeof msg.token !== 'string' || !TOKEN_RE.test(msg.token)) { send(ws, { t: 'error', msg: 'Neplatný token.' }); return ws.close(); }
        const r = resolveAccount(msg);
        const a = r.acc;
        if (a.hws && a.hws !== ws) {
          const old = a.hws;
          old.account = null;
          lobbyListeners.delete(old);
          send(old, { t: 'kicked', reason: 'Přihlásil ses v jiném okně.' });
          old.close();
        }
        a.hws = ws;
        ws.account = a;
        a.lastSeen = Date.now();
        if (a.htable) a.htable.leave(a); // po novém připojení se k původnímu stolu nevracíme
        lobbyListeners.add(ws);
        markDirty();
        send(ws, { ...profileMsg(a), t: 'welcome', isNew: r.isNew, linked: r.linked ? { email: r.linked.email } : null, sessionInvalid: !!msg.session && !r.linked,
          rules: { win: HCFG.WIN_SCORE, rewards: HCFG.REWARDS, W, H } });
        send(ws, { t: 'lobby', tables: lobbyInfo() });
        return;
      }
      if (!acc) return;

      switch (msg.t) {
        case 'm': // poloha kurzoru v souřadnicích stolu
          if (acc.htable) acc.htable.setMallet(acc, Number(msg.x), Number(msg.y));
          break;
        case 'lobby':
          send(ws, { t: 'lobby', tables: lobbyInfo() });
          break;
        case 'join': {
          const e = joinTable(acc, tables.get(Number(msg.id)));
          if (e) send(ws, { t: 'error', msg: e });
          break;
        }
        case 'quick': {
          if (acc.htable) return send(ws, { t: 'error', msg: 'Už sedíš u stolu.' });
          const all = [...tables.values()];
          const tb = all.find((x) => x.count() === 1) || all.find((x) => x.permanent && x.count() === 0) || all.find((x) => x.count() === 0);
          const e = joinTable(acc, tb);
          if (e) send(ws, { t: 'error', msg: 'Všechny stoly jsou plné, vytvoř si vlastní.' });
          break;
        }
        case 'create': {
          if (acc.htable) return send(ws, { t: 'error', msg: 'Už sedíš u stolu.' });
          const name = cleanTableName(msg.name);
          if (!name) return send(ws, { t: 'error', msg: 'Název stolu musí mít 2–24 znaků (písmena, čísla, mezera, _ . -).' });
          if (tables.size >= HCFG.MAX_TABLES) return send(ws, { t: 'error', msg: 'Je moc stolů, zkus to později.' });
          const tb = createTable(name, false);
          tb.add(acc);
          break;
        }
        case 'vote':
          if (acc.htable && typeof msg.v === 'string') acc.htable.vote(acc, msg.v);
          break;
        case 'leave':
          leaveAll(acc);
          break;
        default: break;
      }
    });
    ws.on('close', () => {
      lobbyListeners.delete(ws);
      const acc = ws.account;
      if (acc && acc.hws === ws) { acc.hws = null; leaveAll(acc); }
    });
    ws.on('error', () => {});
  }

  const heartbeat = setInterval(() => {
    // ping se řeší v server.js (heartbeat prochází i naše klienty)
  }, 60000);
  heartbeat.unref();

  return {
    tables, handleConnection, HCFG,
    /** Změna jména/profilovky/zůstatku: dát vědět otevřené hře a stolu. */
    refresh(acc, saved) {
      if (acc.hws) send(acc.hws, profileMsg(acc, saved));
      if (acc.htable) acc.htable.meta();
      if (saved) broadcastLobby();
    },
    removeAccount(acc) {
      leaveAll(acc);
      if (acc.hws) { const w = acc.hws; w.account = null; acc.hws = null; send(w, { t: 'kicked', reason: 'Účet byl smazán.' }); w.close(); }
    },
    clients: () => lobbyListeners,
  };
};
