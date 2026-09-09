// Request-shape hardening across every route (audit findings B-5, B-6, B-8):
//   - JSON routes reject non-object bodies with 400 bad_json instead of a
//     TypeError that the 500 handler used to echo verbatim.
//   - Multipart routes reject non-multipart bodies (400 multipart_required)
//     and oversized Content-Length (413) BEFORE reading the body.
//   - The 500 handler returns a generic code.
//   - A missing / failing rate-limit KV is a controlled 503 with CORS, and
//     /health still answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  worker, makeEnv, ctx, req, jsonReq, stubFetch, json, memKV, ORIGIN, blobOf, PNG_BYTES, jwtMod,
} from './_harness.ts';

const JSON_ROUTES = ['/stripe/checkout', '/stripe/verify', '/credits/checkout', '/credits/verify', '/license/verify'];
const MULTIPART_ROUTES = ['/merch/checkout', '/printful/order', '/ai/trainer-card', '/ai/team-art', '/ai/codex-card'];
const BAD_JSON_BODIES: Array<[string, string]> = [
  ['null', 'null'], ['array', '[]'], ['string', '"str"'], ['number', '42'], ['bool', 'true'],
  ['malformed', '{not json'], ['empty', ''],
];

test('every JSON route answers 400 bad_json for non-object bodies', async () => {
  const env = makeEnv();
  const fx = stubFetch(() => { throw new Error('upstream must not be reached'); });
  try {
    for (const route of JSON_ROUTES) {
      for (const [label, body] of BAD_JSON_BODIES) {
        const res = await worker.fetch(jsonReq(route, body), env, ctx);
        assert.equal(res.status, 400, `${route} ${label}`);
        assert.equal((await json(res)).error, 'bad_json', `${route} ${label}`);
      }
    }
    assert.equal(fx.calls.length, 0);
  } finally { fx.restore(); }
});

async function premiumAuth(env: ReturnType<typeof makeEnv>): Promise<Record<string, string>> {
  const token = await jwtMod.mintLicense(env as never, { sub: 'cus_1', email: 'p@x.y', stripe_session: 'cs_test_p' });
  return { authorization: `Bearer ${token}` };
}

test('every multipart route answers 400 multipart_required for a JSON body', async () => {
  const env = makeEnv({ MERCH_CHECKOUT: '1' });
  const fx = stubFetch(() => { throw new Error('upstream must not be reached'); });
  try {
    const auth = await premiumAuth(env);
    for (const route of MULTIPART_ROUTES) {
      const res = await worker.fetch(jsonReq(route, { product: 'x' }, { headers: auth }), env, ctx);
      assert.equal(res.status, 400, route);
      assert.equal((await json(res)).error, 'multipart_required', route);
    }
    assert.equal(env.PRINTS_BUCKET.puts, 0);
    assert.equal(fx.calls.length, 0);
  } finally { fx.restore(); }
});

test('Content-Length above the cap → 413 before formData() is ever called', async () => {
  const env = makeEnv({ MERCH_CHECKOUT: '1' });
  const auth = await premiumAuth(env);
  for (const route of MULTIPART_ROUTES) {
    const fd = new FormData();
    fd.set('file', blobOf(PNG_BYTES, 'image/png'), 'f.png');
    fd.set('photo', blobOf(PNG_BYTES, 'image/png'), 'p.png');
    const r = req(route, { method: 'POST', body: fd, headers: auth });
    // Real content-type (with boundary) but a lying, oversized length.
    const headers = new Headers(r.headers);
    headers.set('content-length', String(40 * 1024 * 1024));
    const spied = new Request(r.url, { method: 'POST', headers, body: fd });
    let formDataCalled = false;
    Object.defineProperty(spied, 'formData', { value: async () => { formDataCalled = true; return new FormData(); } });

    const res = await worker.fetch(spied, env, ctx);
    assert.equal(res.status, 413, route);
    assert.equal((await json(res)).error, 'payload_too_large', route);
    assert.equal(formDataCalled, false, `${route}: body was not read`);
  }
});

test('handler exceptions produce a generic {error:"internal"} — upstream text and stack never reach the client', async () => {
  const env = makeEnv();
  const fx = stubFetch(() => new Response('{"error":{"message":"No such checkout.session: sk_live_LEAK"}}', { status: 404 }));
  const origError = console.error;
  const logged: unknown[][] = [];
  console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    const res = await worker.fetch(jsonReq('/stripe/verify', { sessionId: 'cs_test_abcdefghijklmnopqrstuvwxyz0123' }), env, ctx);
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.equal(text, '{"error":"internal"}');
    assert.equal(/stripe_|LEAK|Cannot read/.test(text), false);
    // …but the operator still sees the real cause.
    assert.ok(logged.some(a => a.some(x => x instanceof Error && /stripe_404/.test(x.message))), 'real message logged');
  } finally { fx.restore(); console.error = origError; }
});

test('rate limiter: RATELIMIT_KV missing → JSON 503 with CORS on money routes; /health still answers', async () => {
  const env = makeEnv({ RATELIMIT_KV: undefined });
  const origError = console.error;
  console.error = () => {};
  try {
    const res = await worker.fetch(jsonReq('/stripe/verify', { sessionId: 'x' }), env, ctx);
    assert.equal(res.status, 503);
    assert.equal((await json(res)).error, 'rate_limit_unavailable');
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);

    const health = await worker.fetch(req('/health'), env, ctx);
    assert.equal(health.status, 200);
    assert.equal((await json(health)).ok, true);
  } finally { console.error = origError; }
});

test('rate limiter: KV.get throwing → JSON 503 with CORS (fail closed), not an unhandled throw', async () => {
  const env = makeEnv({ RATELIMIT_KV: memKV({ failGet: true }) });
  const origError = console.error;
  console.error = () => {};
  const fx = stubFetch(() => { throw new Error('upstream must not be reached'); });
  try {
    const res = await worker.fetch(jsonReq('/merch/checkout', {}), env, ctx);
    assert.equal(res.status, 503);
    assert.equal((await json(res)).error, 'rate_limit_unavailable');
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(fx.calls.length, 0);
  } finally { fx.restore(); console.error = origError; }
});
