// Merch route guards, end-to-end through the router:
//   - D-2 / D-3: the server-side MERCH_CHECKOUT kill switch (default OFF) stops
//     /merch/checkout, /printful/order and webhook fulfilment before any R2
//     put or upstream call.
//   - B-2: prototype-key product ids (__proto__, constructor, …) are unknown
//     products, and the R2 put happens only after Stripe accepts the session.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  worker, makeEnv, ctx, multipartReq, stubFetch, webhookReq, json, blobOf, PNG_BYTES,
} from './_harness.ts';
import { computeRetailUsd } from '../src/merch.ts';

const RETURN_URL = 'https://trainerscodex.com/';
const PROTO_KEYS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];

function merchFields(over: Record<string, string> = {}) {
  return {
    product: 'tshirt-bella-3001', design: 'crest', markup: '100', expectedRetail: '17.99',
    returnUrl: RETURN_URL, metadata: JSON.stringify({ teamName: 'Kissimmee Crew' }),
    ...over,
  };
}

function withStubs() {
  return stubFetch((url) => {
    if (url.startsWith('https://api.stripe.com/')) return { id: 'cs_test_new0000000000000000000000', url: 'https://checkout.stripe.com/c/pay/x' };
    if (url.startsWith('https://api.printful.com/')) return { result: { id: 7, url: 'https://pf/x', dashboard_url: 'https://pf/dash' } };
    throw new Error(`unexpected upstream ${url}`);
  });
}

// ── kill switch ────────────────────────────────────────────────────────────

test('MERCH_CHECKOUT unset: /merch/checkout → 503 merch_disabled, zero R2 puts, zero upstream calls', async () => {
  const env = makeEnv(); // no MERCH_CHECKOUT
  const fx = withStubs();
  try {
    const res = await worker.fetch(multipartReq('/merch/checkout', { ...merchFields(), file: blobOf(PNG_BYTES, 'image/png') }), env, ctx);
    assert.equal(res.status, 503);
    assert.equal((await json(res)).error, 'merch_disabled');
    assert.equal(env.PRINTS_BUCKET.puts, 0);
    assert.equal(fx.calls.length, 0);
  } finally { fx.restore(); }
});

test('MERCH_CHECKOUT="0" and "true" both count as OFF for /printful/order', async () => {
  for (const value of ['0', 'true', 'yes', ' 1']) {
    const env = makeEnv({ MERCH_CHECKOUT: value });
    const fx = withStubs();
    try {
      const res = await worker.fetch(multipartReq('/printful/order', { product: 'mug-11oz-white', design: 'roster', markup: '100', file: blobOf(PNG_BYTES, 'image/png') }), env, ctx);
      assert.equal(res.status, 503, `MERCH_CHECKOUT=${JSON.stringify(value)}`);
      assert.equal((await json(res)).error, 'merch_disabled');
      assert.equal(env.PRINTS_BUCKET.puts, 0);
      assert.equal(fx.calls.length, 0);
    } finally { fx.restore(); }
  }
});

test('MERCH_CHECKOUT off: a PAID merch webhook is acknowledged (200) but Printful is never contacted', async () => {
  const env = makeEnv();
  const fx = withStubs();
  try {
    const res = await worker.fetch(await webhookReq({
      type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_test_merchpaid000000000000000000', payment_status: 'paid', customer_email: 'b@x.y',
        metadata: { source: 'trainerscodex_merch', product: 'tshirt-bella-3001', design: 'crest', r2Key: 'merch-pending/a.png', retail: '17.99', productName: 'x' },
        shipping_details: { name: 'A', address: { line1: '1 St', city: 'K', state: 'FL', postal_code: '34741', country: 'US' } },
        customer_details: { email: 'b@x.y' },
      } },
    }, env), env, ctx);
    assert.equal(res.status, 200, 'Stripe must not retry forever');
    assert.equal(fx.calls.length, 0, 'nothing sent to Printful');
    assert.equal([...env.AI_QUOTA_KV!.store.keys()].some(k => k.startsWith('merchdone:')), false, 'not marked fulfilled');
  } finally { fx.restore(); }
});

test('MERCH_CHECKOUT="1": /merch/checkout succeeds and the R2 put happens only AFTER Stripe accepted', async () => {
  const env = makeEnv({ MERCH_CHECKOUT: '1' });
  const order: string[] = [];
  const origPut = env.PRINTS_BUCKET.put.bind(env.PRINTS_BUCKET);
  env.PRINTS_BUCKET.put = async (...args) => { order.push('r2'); return origPut(...args); };
  const fx = stubFetch((url) => {
    order.push(url.includes('stripe') ? 'stripe' : 'other');
    return { id: 'cs_test_new0000000000000000000000', url: 'https://checkout.stripe.com/c/pay/x' };
  });
  try {
    const res = await worker.fetch(multipartReq('/merch/checkout', { ...merchFields(), file: blobOf(PNG_BYTES, 'image/png') }), env, ctx);
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    assert.deepEqual(order, ['stripe', 'r2']);
    const stripeBody = new URLSearchParams(fx.calls[0].body!);
    assert.equal(stripeBody.get('line_items[0][price_data][unit_amount]'), '1799');
    assert.equal(stripeBody.get('line_items[0][price_data][product_data][name]'), "Trainer's Codex · Trainer Crest · tshirt-bella-3001 · Kissimmee Crew");
    // The staged key in metadata is the one that was written.
    const [key] = [...env.PRINTS_BUCKET.objects.keys()];
    assert.equal(stripeBody.get('metadata[r2Key]'), key);
  } finally { fx.restore(); }
});

test('MERCH_CHECKOUT="1": a Stripe rejection leaves nothing in R2', async () => {
  const env = makeEnv({ MERCH_CHECKOUT: '1' });
  const fx = stubFetch(() => new Response('{"error":{"message":"boom"}}', { status: 400 }));
  try {
    const res = await worker.fetch(multipartReq('/merch/checkout', { ...merchFields(), file: blobOf(PNG_BYTES, 'image/png') }), env, ctx);
    assert.equal(res.status, 500);
    assert.deepEqual(await json(res), { error: 'internal' }, 'upstream text is not echoed');
    assert.equal(env.PRINTS_BUCKET.puts, 0);
  } finally { fx.restore(); }
});

// ── prototype keys ─────────────────────────────────────────────────────────

test('computeRetailUsd returns null for prototype-key product ids', () => {
  for (const id of PROTO_KEYS) {
    for (const markup of [15, 50, 100, 150]) {
      assert.equal(computeRetailUsd(id, markup), null, `${id} @ ${markup}`);
    }
  }
});

test('prototype-key product ids → 400 unknown_product with zero R2 puts and zero upstream calls (merch)', async () => {
  for (const id of PROTO_KEYS) {
    const env = makeEnv({ MERCH_CHECKOUT: '1' });
    const fx = withStubs();
    try {
      // expectedRetail is a real number so the old NaN comparison would have passed.
      const res = await worker.fetch(multipartReq('/merch/checkout', { ...merchFields({ product: id, expectedRetail: '17.99' }), file: blobOf(PNG_BYTES, 'image/png') }), env, ctx);
      assert.equal(res.status, 400, id);
      const body = await json(res);
      assert.equal(body.error, 'unknown_product', id);
      assert.equal(env.PRINTS_BUCKET.puts, 0, `${id}: R2 untouched`);
      assert.equal(fx.calls.length, 0, `${id}: Stripe untouched`);
    } finally { fx.restore(); }
  }
});

test('prototype-key product ids → 400 unknown_product with zero R2 puts (printful)', async () => {
  for (const id of PROTO_KEYS) {
    const env = makeEnv({ MERCH_CHECKOUT: '1' });
    const fx = withStubs();
    try {
      const res = await worker.fetch(multipartReq('/printful/order', { product: id, design: 'crest', markup: '100', file: blobOf(PNG_BYTES, 'image/png') }), env, ctx);
      assert.equal(res.status, 400, id);
      assert.equal((await json(res)).error, 'unknown_product', id);
      assert.equal(env.PRINTS_BUCKET.puts, 0);
      assert.equal(fx.calls.length, 0);
    } finally { fx.restore(); }
  }
});
