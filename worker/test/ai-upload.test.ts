// AI upload hardening (audit findings B-3, B-11), end-to-end through the
// router with moderation disabled (no AI binding) and fal.ai stubbed:
//   - the multipart Content-Type is never trusted: bytes are sniffed, anything
//     that is not PNG/JPEG/WebP is 400 bad_image before moderation / fal / R2,
//     and stored objects carry the sniffed type only;
//   - the monthly quota key lower-cases the email (parity with credits).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  worker, makeEnv, ctx, multipartReq, stubFetch, json, jwtMod, blobOf,
  PNG_BYTES, JPEG_BYTES, WEBP_BYTES, SVG_BYTES,
} from './_harness.ts';
import { sniffImageType } from '../src/body.ts';

async function premium(env: ReturnType<typeof makeEnv>, email = 'p@x.y') {
  const token = await jwtMod.mintLicense(env as never, { sub: 'cus_1', email, stripe_session: 'cs_test_p' });
  return { authorization: `Bearer ${token}` };
}

function falStub() {
  return stubFetch((url) => {
    if (url.startsWith('https://fal.run/')) return { images: [{ url: 'https://fal.example/out.png' }] };
    throw new Error(`unexpected upstream ${url}`);
  });
}

test('sniffImageType recognises PNG / JPEG / WebP and nothing else', () => {
  assert.equal(sniffImageType(PNG_BYTES), 'image/png');
  assert.equal(sniffImageType(JPEG_BYTES), 'image/jpeg');
  assert.equal(sniffImageType(WEBP_BYTES), 'image/webp');
  assert.equal(sniffImageType(SVG_BYTES), null);
  assert.equal(sniffImageType(new TextEncoder().encode('<html><script>1</script>')), null);
  assert.equal(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), null); // GIF
  assert.equal(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])), null); // RIFF/WAVE
  assert.equal(sniffImageType(new Uint8Array([])), null);
});

test('SVG bytes typed image/svg+xml → 400 bad_image, zero R2 objects, zero fal calls', async () => {
  for (const route of ['/ai/trainer-card', '/ai/team-art', '/ai/codex-card']) {
    const env = makeEnv();
    const fx = falStub();
    try {
      const res = await worker.fetch(multipartReq(route, { photo: blobOf(SVG_BYTES, 'image/svg+xml'), name: 'Ash' }, { headers: await premium(env) }), env, ctx);
      assert.equal(res.status, 400, route);
      assert.equal((await json(res)).error, 'bad_image', route);
      assert.equal(env.PRINTS_BUCKET.objects.size, 0, `${route}: nothing stored`);
      assert.equal(fx.calls.length, 0, `${route}: fal not called`);
      assert.equal([...env.AI_QUOTA_KV!.store.keys()].some(k => k.startsWith('ai:')), false, `${route}: no quota burned`);
    } finally { fx.restore(); }
  }
});

test('HTML bytes typed image/png → 400 bad_image (type header is ignored)', async () => {
  const env = makeEnv();
  const fx = falStub();
  try {
    const res = await worker.fetch(multipartReq('/ai/codex-card', {
      photo: blobOf(new TextEncoder().encode('<html><script>alert(1)</script></html>'), 'image/png'),
    }, { headers: await premium(env) }), env, ctx);
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error, 'bad_image');
    assert.equal(env.PRINTS_BUCKET.objects.size, 0);
  } finally { fx.restore(); }
});

test('a bad codex-card REFERENCE is rejected too, before anything is stored', async () => {
  const env = makeEnv();
  const fx = falStub();
  try {
    const res = await worker.fetch(multipartReq('/ai/codex-card', {
      photo: blobOf(PNG_BYTES, 'image/png'),
      reference: blobOf(SVG_BYTES, 'image/png'),
    }, { headers: await premium(env) }), env, ctx);
    assert.equal(res.status, 400);
    assert.deepEqual(await json(res), { error: 'bad_image', field: 'reference' });
    assert.equal(env.PRINTS_BUCKET.objects.size, 0);
    assert.equal(fx.calls.length, 0);
  } finally { fx.restore(); }
});

test('PNG bytes typed text/html → accepted and stored as image/png (sniffed type wins)', async () => {
  const env = makeEnv();
  const fx = falStub();
  try {
    const res = await worker.fetch(multipartReq('/ai/trainer-card', { photo: blobOf(PNG_BYTES, 'text/html'), name: 'Ash' }, { headers: await premium(env) }), env, ctx);
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(env.PRINTS_BUCKET.objects.size, 1);
    const [obj] = [...env.PRINTS_BUCKET.objects.values()];
    assert.equal(obj.contentType, 'image/png');
    assert.equal(fx.calls.length, 1, 'one fal call');
  } finally { fx.restore(); }
});

test('JPEG and WebP uploads are stored with their sniffed type regardless of the header', async () => {
  for (const [bytes, expected] of [[JPEG_BYTES, 'image/jpeg'], [WEBP_BYTES, 'image/webp']] as const) {
    const env = makeEnv();
    const fx = falStub();
    try {
      const res = await worker.fetch(multipartReq('/ai/team-art', { photo: blobOf(bytes, 'application/octet-stream') }, { headers: await premium(env) }), env, ctx);
      assert.equal(res.status, 200, expected);
      const [obj] = [...env.PRINTS_BUCKET.objects.values()];
      assert.equal(obj.contentType, expected);
    } finally { fx.restore(); }
  }
});

test('quota key lower-cases the email: P@X.Y and p@x.y share one monthly bucket', async () => {
  const env = makeEnv();
  const fx = falStub();
  try {
    const upper = await premium(env, 'P@X.Y');
    const lower = await premium(env, 'p@x.y');
    for (let i = 0; i < 3; i++) {
      assert.equal((await worker.fetch(multipartReq('/ai/trainer-card', { photo: blobOf(PNG_BYTES, 'image/png') }, { headers: upper, ip: '9.9.9.1' }), env, ctx)).status, 200);
    }
    for (let i = 0; i < 2; i++) {
      assert.equal((await worker.fetch(multipartReq('/ai/trainer-card', { photo: blobOf(PNG_BYTES, 'image/png') }, { headers: lower, ip: '9.9.9.2' }), env, ctx)).status, 200);
    }
    const sixth = await worker.fetch(multipartReq('/ai/trainer-card', { photo: blobOf(PNG_BYTES, 'image/png') }, { headers: upper, ip: '9.9.9.3' }), env, ctx);
    assert.equal(sixth.status, 429, 'shared bucket exhausted at 5');
    const quotaKeys = [...env.AI_QUOTA_KV!.store.keys()].filter(k => k.startsWith('ai:'));
    assert.equal(quotaKeys.length, 1, quotaKeys.join(','));
    assert.match(quotaKeys[0], /^ai:\d{4}-\d{2}:p@x\.y:trainer-card$/);
  } finally { fx.restore(); }
});
