// End-to-end worker test harness — drives the REAL router (`src/index.ts`
// `fetch()`) with an in-memory KV + R2 and a stubbed global fetch for
// Stripe / Printful / fal.ai. Ported from the 2026-09 security audit's proof
// scripts so regression tests exercise the same code path production does:
// CORS → rate limit → handler → error handler.
//
// Usage:
//   import { worker, makeEnv, ctx, jsonReq, multipartReq, stubFetch } from './_harness.ts';
//   const env = makeEnv();
//   const res = await worker.fetch(jsonReq('/stripe/verify', { sessionId }), env, ctx);
//
// The resolve hook in _hooks.mjs is registered BEFORE the router is imported so
// the worker's extensionless relative imports load under Node type stripping.

import { register } from 'node:module';
register('./_hooks.mjs', import.meta.url);

type Worker = { fetch(req: Request, env: unknown, ctx: unknown): Promise<Response> };
export const worker = (await import('../src/index.ts')).default as Worker;
export const jwtMod = await import('../src/jwt.ts');

// ── in-memory bindings ─────────────────────────────────────────────────────

export interface MemKV {
  store: Map<string, string>;
  log: Array<[string, string, string?]>;
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export function memKV(opts: { failGet?: boolean } = {}): MemKV {
  const store = new Map<string, string>();
  const log: Array<[string, string, string?]> = [];
  return {
    store, log,
    async get(k) {
      log.push(['get', k]);
      if (opts.failGet) throw new Error('KV get failed (simulated outage)');
      return store.get(k) ?? null;
    },
    async put(k, v) { log.push(['put', k, v]); store.set(k, v); },
    async delete(k) { store.delete(k); },
  };
}

export interface MemR2 {
  objects: Map<string, { body: ArrayBuffer; contentType?: string; customMetadata?: Record<string, string> }>;
  puts: number;
  put(key: string, body: ArrayBuffer | ArrayBufferView | string, opts?: {
    httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string>;
  }): Promise<{ key: string }>;
  get(key: string): Promise<unknown>;
}

export function memR2(): MemR2 {
  const objects: MemR2['objects'] = new Map();
  const r2: MemR2 = {
    objects,
    puts: 0,
    async put(key, body, opts) {
      r2.puts++;
      const buf = typeof body === 'string' ? new TextEncoder().encode(body).buffer as ArrayBuffer
        : body instanceof ArrayBuffer ? body
        : (body.buffer as ArrayBuffer).slice(body.byteOffset, body.byteOffset + body.byteLength);
      objects.set(key, { body: buf, contentType: opts?.httpMetadata?.contentType, customMetadata: opts?.customMetadata });
      return { key };
    },
    async get(key) { return objects.get(key) ?? null; },
  };
  return r2;
}

// ── env ────────────────────────────────────────────────────────────────────

export const ORIGIN = 'https://trainerscodex.com';
export const ORIGINS = 'https://trainerscodex.com,https://www.trainerscodex.com,https://trainers-codex.pages.dev';
export const SIGNING_KEY = 'test-signing-key-0123456789abcdef0123456789abcdef';
export const WEBHOOK_SECRET = 'whsec_testsecret_0123456789';

export interface TestEnv {
  RATELIMIT_KV: MemKV | undefined;
  AI_QUOTA_KV: MemKV | undefined;
  PRINTS_BUCKET: MemR2;
  ALLOWED_ORIGINS: string;
  ENVIRONMENT: string;
  STRIPE_PRICE_ID: string;
  PRINTFUL_STORE_ID: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  JWT_SIGNING_KEY: string;
  PRINTFUL_API_KEY: string;
  FAL_API_KEY: string;
  MERCH_CHECKOUT?: string;
  [k: string]: unknown;
}

export function makeEnv(over: Partial<TestEnv> = {}): TestEnv {
  return {
    RATELIMIT_KV: memKV(),
    AI_QUOTA_KV: memKV(),
    PRINTS_BUCKET: memR2(),
    ALLOWED_ORIGINS: ORIGINS,
    ENVIRONMENT: 'test',
    STRIPE_PRICE_ID: 'price_test',
    PRINTFUL_STORE_ID: '18253803',
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    JWT_SIGNING_KEY: SIGNING_KEY,
    PRINTFUL_API_KEY: 'pf_test',
    FAL_API_KEY: 'fal_test',
    ...over,
  };
}

export const ctx = { waitUntil() {}, passThroughOnException() {} };

// ── requests ───────────────────────────────────────────────────────────────

export function req(path: string, init: RequestInit = {}, origin: string | null = ORIGIN, ip = '1.2.3.4'): Request {
  const headers = new Headers(init.headers || {});
  if (origin) headers.set('origin', origin);
  if (ip) headers.set('cf-connecting-ip', ip);
  return new Request('https://trainers-codex-api.example' + path, { ...init, headers });
}

export function jsonReq(path: string, body: unknown, extra: { headers?: Record<string, string>; ip?: string } = {}, origin: string | null = ORIGIN): Request {
  return req(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(extra.headers || {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }, origin, extra.ip);
}

export function multipartReq(path: string, fields: Record<string, string | Blob>, extra: { headers?: Record<string, string>; ip?: string } = {}): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') fd.set(k, v);
    else fd.set(k, v, `${k}.bin`);
  }
  return req(path, { method: 'POST', headers: extra.headers, body: fd }, ORIGIN, extra.ip);
}

// ── upstream stubs ─────────────────────────────────────────────────────────

export interface FetchCall { url: string; init?: RequestInit; body?: string }

/**
 * Replace global fetch. `handler` receives (url, init) and returns either a
 * Response or a JSON-serialisable body (wrapped as 200 JSON). Always call
 * `restore()` in a finally block.
 */
export function stubFetch(handler: (url: string, init?: RequestInit) => unknown | Promise<unknown>) {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init, body: typeof init?.body === 'string' ? init.body : undefined });
    const r = await handler(url, init);
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r ?? {}), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

/** A Stripe Checkout Session object as GET /checkout/sessions returns it. */
export function stripeSession(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cs_test_abcdefghijklmnopqrstuvwxyz0123',
    object: 'checkout.session',
    mode: 'subscription',
    payment_status: 'paid',
    status: 'complete',
    customer: 'cus_test1',
    customer_email: 'buyer@example.com',
    customer_details: { email: 'buyer@example.com', name: 'Ash Grey' },
    subscription: 'sub_test1',
    metadata: { source: 'trainerscodex_premium_pack', term: 'monthly' },
    url: 'https://checkout.stripe.com/c/pay/cs_test_x',
    ...over,
  };
}

// ── webhook signing ────────────────────────────────────────────────────────

export async function stripeSig(raw: string, secret = WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${hex}`;
}

export async function webhookReq(event: { type: string; data: { object: Record<string, unknown> } }, env: TestEnv): Promise<Request> {
  const raw = JSON.stringify({ id: 'evt_test', ...event });
  return new Request('https://trainers-codex-api.example/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': await stripeSig(raw, env.STRIPE_WEBHOOK_SECRET) },
    body: raw,
  });
}

// ── JWT forging (for negative tests) ───────────────────────────────────────

export const b64u = (s: string): string => Buffer.from(s).toString('base64url');

export async function hmacB64u(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return Buffer.from(sig).toString('base64url');
}

export async function forge(header: Record<string, unknown>, body: Record<string, unknown>, secret: string = SIGNING_KEY): Promise<string> {
  const h = b64u(JSON.stringify(header));
  const b = b64u(JSON.stringify(body));
  return `${h}.${b}.${await hmacB64u(secret, `${h}.${b}`)}`;
}

export function claims(over: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'trainerscodex.com', sub: 'cus_x', email: 'a@b.c', plan: 'premium',
    stripe_session: 'cs_test_abc', iat: now, exp: now + 3600, ...over,
  };
}

// ── image fixtures ─────────────────────────────────────────────────────────

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64',
);
export const PNG_BYTES = new Uint8Array(PNG_1x1);
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
export const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
]);
export const SVG_BYTES = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');

export function blobOf(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as BlobPart], { type });
}

export async function json(res: Response): Promise<Record<string, unknown>> {
  return await res.json() as Record<string, unknown>;
}
