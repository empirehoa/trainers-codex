// Minimal HS256 JWT mint + verify for the Trainer's Codex license token.
//
// Why hand-rolled vs a library:
//   - The signing surface is one algorithm (HS256), no exotic claims, no key rotation.
//   - The Cloudflare Worker runtime has WebCrypto natively — `crypto.subtle.sign`
//     with HMAC-SHA256 is one call. Pulling in jose or jsonwebtoken adds ~30KB
//     for zero functional gain.
//
// Claims we mint:
//   {
//     iss: 'trainerscodex.com',
//     sub: <stripe-customer-id>,
//     email: <customer-email>,
//     plan: 'premium',
//     stripe_session: <session_id>,
//     iat: <unix-seconds>,
//     exp: <unix-seconds>,                    // 31 days post mint
//   }
//
// The browser stores the compact JWT in localStorage under `trainerscodex.license`.
// On boot the app decodes + checks `exp`. Server-side `POST /license/verify`
// re-signs the body and compares to confirm authenticity (e.g. on Premium
// Studio open before unlocking premium renderers).

import type { Env } from './index';
import { applyCORS } from './cors';
import { isSessionRevoked } from './revocation';
import { readJsonObject } from './body';

export type LicensePlan = 'premium' | 'credits';

export interface LicenseClaims {
  iss: string;
  sub: string;
  email: string;
  // 'premium' = active subscription (monthly/annual) with a monthly AI quota.
  // 'credits' = a token that merely identifies an email so the Worker can look
  // up that buyer's server-side credit balance. The token grants nothing on its
  // own — the KV balance is the source of truth.
  plan: LicensePlan;
  stripe_session: string;
  iat: number;
  exp: number;
  // Optional not-before. Never minted today; honoured on verify so a future
  // mint path that sets it cannot be bypassed.
  nbf?: number;
}

// HMAC-SHA256 wants at least a 256-bit secret; anything shorter is a
// misconfiguration (an empty or placeholder JWT_SIGNING_KEY would otherwise
// mint perfectly valid-looking licenses). Checked at mint AND verify.
const MIN_SIGNING_KEY_CHARS = 32;

// Longest license we ever mint is 366 days (annual). A token claiming more
// than this is a mint bug or a forgery attempt, not a longer subscription.
const MAX_LICENSE_SECONDS = 400 * 24 * 3600;

function requireSigningKey(env: Env): string {
  const key = env.JWT_SIGNING_KEY;
  if (typeof key !== 'string' || key.length < MIN_SIGNING_KEY_CHARS) {
    throw new Error(`JWT_SIGNING_KEY must be at least ${MIN_SIGNING_KEY_CHARS} characters (got ${typeof key === 'string' ? key.length : 0})`);
  }
  return key;
}

const TEXT = new TextEncoder();

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const pad = str.length % 4;
  const b64 = (str + (pad ? '='.repeat(4 - pad) : '')).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', TEXT.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify'],
  );
}

export async function mintLicense(env: Env, claims: Omit<LicenseClaims, 'iss' | 'iat' | 'exp' | 'plan'> & { plan?: LicensePlan; ttlSeconds?: number }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = claims.ttlSeconds ?? 31 * 24 * 3600;
  const body: LicenseClaims = {
    iss: 'trainerscodex.com',
    sub: claims.sub,
    email: claims.email,
    plan: claims.plan ?? 'premium',
    stripe_session: claims.stripe_session,
    iat: now,
    exp: now + ttl,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = b64urlEncode(TEXT.encode(JSON.stringify(header)));
  const bodyB64 = b64urlEncode(TEXT.encode(JSON.stringify(body)));
  const signingInput = `${headerB64}.${bodyB64}`;

  const key = await getHmacKey(requireSigningKey(env));
  const sig = await crypto.subtle.sign('HMAC', key, TEXT.encode(signingInput));
  const sigB64 = b64urlEncode(sig);

  return `${signingInput}.${sigB64}`;
}

export async function verifyLicense(env: Env, jwt: string): Promise<LicenseClaims | null> {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, sigB64] = parts;

  // Pin the algorithm before trusting the signature. Without this an attacker
  // who can swap the verify path (or a future refactor to a permissive library)
  // could present alg:none / RS256-confusion tokens and forge premium. We only
  // ever mint HS256, so reject anything else outright.
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(headerB64)));
  } catch {
    return null;
  }
  if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

  const signingInput = `${headerB64}.${bodyB64}`;

  const key = await getHmacKey(requireSigningKey(env));
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify('HMAC', key, sig, TEXT.encode(signingInput));
  if (!ok) return null;

  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(bodyB64))) as LicenseClaims;
    if (typeof claims !== 'object' || claims === null) return null;
    if (claims.iss !== 'trainerscodex.com') return null;
    const now = Math.floor(Date.now() / 1000);
    // Temporal claims must be real numbers. A missing / string / NaN `exp`
    // used to compare as "not less than now" and pass — a perpetual license.
    if (!isFiniteNumber(claims.exp) || !isFiniteNumber(claims.iat)) return null;
    if (claims.exp < now) return null;
    if (claims.exp > claims.iat + MAX_LICENSE_SECONDS) return null;
    if (claims.nbf !== undefined && (!isFiniteNumber(claims.nbf) || claims.nbf > now)) return null;
    return claims;
  } catch {
    return null;
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * POST /license/verify — body: { jwt: string }
 * Returns: { valid: boolean, expiresAt?: number, plan?: string }
 * Used by the browser to confirm a stored license is still authentic
 * (e.g. after a long offline period, or before opening Premium Studio).
 */
export async function licenseVerify(req: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(req);
  if (!body) {
    return applyCORS(new Response(JSON.stringify({ error: 'bad_json' }), { status: 400, headers: { 'content-type': 'application/json' } }), req, env);
  }
  if (!body.jwt || typeof body.jwt !== 'string') {
    return applyCORS(new Response(JSON.stringify({ valid: false, error: 'missing_jwt' }), { status: 200, headers: { 'content-type': 'application/json' } }), req, env);
  }

  const claims = await verifyLicense(env, body.jwt);
  if (!claims) {
    return applyCORS(new Response(JSON.stringify({ valid: false }), { status: 200, headers: { 'content-type': 'application/json' } }), req, env);
  }

  // A signature-valid, unexpired premium license can still have been revoked —
  // the subscription behind it ended (see revocation.ts). The client calls
  // this endpoint on a 7-day cadence precisely so this check has a place to
  // bite before `exp` does.
  if (claims.plan === 'premium' && await isSessionRevoked(env.AI_QUOTA_KV, claims.stripe_session)) {
    return applyCORS(new Response(JSON.stringify({ valid: false, revoked: true }), { status: 200, headers: { 'content-type': 'application/json' } }), req, env);
  }

  return applyCORS(new Response(JSON.stringify({
    valid: true,
    expiresAt: claims.exp,
    plan: claims.plan,
    email: claims.email,
  }), { status: 200, headers: { 'content-type': 'application/json' } }), req, env);
}
