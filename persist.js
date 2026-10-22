'use strict';
/**
 * Ukládání JSON dat (účty hráčů, Google účty).
 *  - vždy lokální soubor v DATA_DIR (na Renderu free plánu je disk dočasný)
 *  - volitelně navíc Upstash Redis (REST) – nastav UPSTASH_REDIS_REST_URL a UPSTASH_REDIS_REST_TOKEN,
 *    data pak přežijí restart i nové nasazení serveru
 */
const fs = require('fs');
const path = require('path');

const REMOTE_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const REMOTE_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const PREFIX = process.env.UPSTASH_KEY_PREFIX || 'blackjack:';
const remoteOn = !!(REMOTE_URL && REMOTE_TOKEN);

function create(dataDir) {
  const pending = new Map(); // name -> poslední neodeslaná hodnota
  const inflight = new Map(); // name -> promise

  const file = (name) => path.join(dataDir, name + '.json');

  async function remoteGet(name) {
    const res = await fetch(`${REMOTE_URL}/get/${encodeURIComponent(PREFIX + name)}`, {
      headers: { Authorization: 'Bearer ' + REMOTE_TOKEN }, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error('Upstash GET ' + res.status);
    const j = await res.json();
    return typeof j.result === 'string' ? j.result : null;
  }

  async function remoteSet(name, str) {
    const res = await fetch(`${REMOTE_URL}/set/${encodeURIComponent(PREFIX + name)}`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + REMOTE_TOKEN }, body: str, signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error('Upstash SET ' + res.status);
  }

  /** Načte text: vzdálené úložiště má přednost, jinak lokální soubor. Vrací řetězec nebo null. */
  async function read(name) {
    if (remoteOn) {
      try {
        const v = await remoteGet(name);
        if (v !== null) return v;
      } catch (e) {
        console.error(`Načtení "${name}" z Upstash selhalo (použiju lokální soubor):`, e.message);
      }
    }
    try { return fs.readFileSync(file(name), 'utf8'); } catch (e) {
      if (e.code !== 'ENOENT') console.error(`Načtení ${name}.json selhalo:`, e.message);
      return null;
    }
  }

  function writeLocal(name, str) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = file(name) + '.tmp';
      fs.writeFileSync(tmp, str);
      fs.renameSync(tmp, file(name));
    } catch (e) {
      console.error(`Uložení ${name}.json selhalo:`, e.message);
    }
  }

  async function pump(name) {
    while (pending.has(name)) {
      const str = pending.get(name);
      pending.delete(name);
      try { await remoteSet(name, str); } catch (e) { console.error(`Uložení "${name}" do Upstash selhalo:`, e.message); }
    }
  }

  /** Uloží hned lokálně a na pozadí do vzdáleného úložiště (sloučí rychlé po sobě jdoucí zápisy). */
  function write(name, str) {
    writeLocal(name, str);
    if (!remoteOn) return;
    pending.set(name, str);
    if (!inflight.has(name)) {
      const p = pump(name).finally(() => inflight.delete(name));
      inflight.set(name, p);
    }
  }

  /** Počká na odeslání do vzdáleného úložiště (při vypínání serveru). */
  async function flush(timeoutMs = 4000) {
    if (!remoteOn) return;
    await Promise.race([Promise.all([...inflight.values()]), new Promise((r) => setTimeout(r, timeoutMs))]);
  }

  return { read, write, flush, remoteOn };
}

module.exports = { create, remoteOn };
