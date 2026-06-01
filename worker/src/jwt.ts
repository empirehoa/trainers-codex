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

export interface LicenseClaims {
  iss: string;
  sub: string;
  email: string;
  plan: 'premium';
  stripe_session: string;
  iat: number;
  exp: number;
}

const TEXT = new TextEncoder();

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4;
  const b64 = (str + (pad ? '='.repeat(4 - pad) : '')).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
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

export async function mintLicense(env: Env, claims: Omit<LicenseClaims, 'iss' | 'iat' | 'exp' | 'plan'> & { ttlSeconds?: number }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = claims.ttlSeconds ?? 31 * 24 * 3600;
  const body: LicenseClaims = {
    iss: 'trainerscodex.com',
    sub: claims.sub,
    email: claims.email,
    plan: 'premium',
    stripe_session: claims.stripe_session,
    iat: now,
    exp: now + ttl,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = b64urlEncode(TEXT.encode(JSON.stringify(header)));
  const bodyB64 = b64urlEncode(TEXT.encode(JSON.stringify(body)));
  const signingInput = `${headerB64}.${bodyB64}`;

  const key = await getHmacKey(env.JWT_SIGNING_KEY);
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

  const key = await getHmacKey(env.JWT_SIGNING_KEY);
  const sig = b64urlDecode(sigB64);
  const ok = await crypto.subtle.verify('HMAC', key, sig, TEXT.encode(signingInput));
  if (!ok) return null;

  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(bodyB64))) as LicenseClaims;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    if (claims.iss !== 'trainerscodex.com') return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * POST /license/verify — body: { jwt: string }
 * Returns: { valid: boolean, expiresAt?: number, plan?: string }
 * Used by the browser to confirm a stored license is still authentic
 * (e.g. after a long offline period, or before opening Premium Studio).
 */
export async function licenseVerify(req: Request, env: Env): Promise<Response> {
  let body: { jwt?: string };
  try {
    body = await req.json();
  } catch {
    return applyCORS(new Response(JSON.stringify({ error: 'bad_json' }), { status: 400, headers: { 'content-type': 'application/json' } }), req, env);
  }
  if (!body.jwt || typeof body.jwt !== 'string') {
    return applyCORS(new Response(JSON.stringify({ valid: false, error: 'missing_jwt' }), { status: 200, headers: { 'content-type': 'application/json' } }), req, env);
  }

  const claims = await verifyLicense(env, body.jwt);
  if (!claims) {
    return applyCORS(new Response(JSON.stringify({ valid: false }), { status: 200, headers: { 'content-type': 'application/json' } }), req, env);
  }

  return applyCORS(new Response(JSON.stringify({
    valid: true,
    expiresAt: claims.exp,
    plan: claims.plan,
    email: claims.email,
  }), { status: 200, headers: { 'content-type': 'application/json' } }), req, env);
}
