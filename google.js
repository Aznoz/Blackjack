'use strict';
/**
 * Ověření Google ID tokenu (JWT, RS256) bez externích knihoven.
 * Podpis se ověřuje veřejnými klíči Googlu (JWKS), kontroluje se aud, iss a platnost.
 */
const crypto = require('crypto');

const JWKS_URL = process.env.GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

let cache = { keys: new Map(), at: 0 };

async function fetchKeys() {
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('JWKS HTTP ' + res.status);
  const body = await res.json();
  const keys = new Map();
  for (const jwk of body.keys || []) {
    if (jwk.kty === 'RSA' && jwk.kid) keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
  }
  if (!keys.size) throw new Error('JWKS bez klíčů');
  cache = { keys, at: Date.now() };
  return keys;
}

async function getKey(kid, force) {
  if (!force && cache.keys.has(kid) && Date.now() - cache.at < 3600 * 1000) return cache.keys.get(kid);
  // neznámý kid nebo stará cache: stáhnout znovu (ne častěji než jednou za 30 s kvůli zneužití)
  if (force || Date.now() - cache.at > 30000 || !cache.keys.size) await fetchKeys();
  return cache.keys.get(kid) || null;
}

const b64u = (s) => Buffer.from(s, 'base64url');

/** Vrací {sub, name, email, picture} nebo vyhodí chybu. */
async function verifyIdToken(token, clientId) {
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID není nastaven');
  if (typeof token !== 'string' || token.length > 4096) throw new Error('špatný token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('špatný formát');
  let header, payload;
  try {
    header = JSON.parse(b64u(parts[0]).toString('utf8'));
    payload = JSON.parse(b64u(parts[1]).toString('utf8'));
  } catch (e) { throw new Error('špatný formát'); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('špatný algoritmus');

  const key = await getKey(header.kid, false);
  if (!key) throw new Error('neznámý klíč');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, b64u(parts[2]));
  if (!ok) throw new Error('neplatný podpis');

  const now = Math.floor(Date.now() / 1000);
  if (!ISSUERS.has(payload.iss)) throw new Error('špatný vydavatel');
  if (payload.aud !== clientId) throw new Error('špatná aplikace (aud)');
  if (typeof payload.exp !== 'number' || payload.exp < now - 60) throw new Error('token vypršel');
  if (typeof payload.iat === 'number' && payload.iat > now + 300) throw new Error('token z budoucnosti');
  if (typeof payload.sub !== 'string' || !/^[0-9A-Za-z_-]{1,64}$/.test(payload.sub)) throw new Error('špatné sub');
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const picture = str(payload.picture, 400);
  return {
    sub: payload.sub,
    name: str(payload.name || payload.given_name, 80),
    email: str(payload.email, 120),
    picture: /^https:\/\//.test(picture) ? picture : '',
  };
}

module.exports = { verifyIdToken };
