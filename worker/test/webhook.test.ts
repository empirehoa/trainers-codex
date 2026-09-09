// Stripe webhook through the real router: the signature table the 2026-09
// audit confirmed (B-P3), and the delayed-payment dispatch it added (B-9) —
// checkout.session.async_payment_succeeded fulfils a merch order that arrived
// as completed(unpaid), exactly once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worker, makeEnv, ctx, stubFetch, stripeSig, webhookReq, WEBHOOK_SECRET, json } from './_harness.ts';

function merchSession(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cs_test_async00000000000000000000000',
    payment_status: 'unpaid',
    customer_email: 'buyer@example.com',
    metadata: {
      source: 'trainerscodex_merch', product: 'mug-11oz-white', design: 'roster',
      r2Key: 'merch-pending/abc.png', retail: '9.99', productName: "Trainer's Codex · Champion Roster · mug-11oz-white",
    },
    shipping_details: { name: 'Ash Grey', address: { line1: '1 Route St', city: 'Kissimmee', state: 'FL', postal_code: '34741', country: 'US' } },
    customer_details: { email: 'buyer@example.com', name: 'Ash Grey' },
    ...over,
  };
}

function printfulStub() {
  return stubFetch((url) => {
    if (url.startsWith('https://api.printful.com/orders')) return { result: { id: 4242, status: 'draft' } };
    throw new Error(`unexpected upstream ${url}`);
  });
}

test('signature table: only a fresh, correctly signed v1 header is accepted', async () => {
  const env = makeEnv();
  const raw = JSON.stringify({ id: 'evt_1', type: 'ping', data: { object: {} } });
  const now = Math.floor(Date.now() / 1000);
  const valid = await stripeSig(raw);
  const cases: Array<[string, string | undefined, number]> = [
    ['valid', valid, 200],
    ['missing header', undefined, 400],
    ['empty header', '', 400],
    ['wrong secret', await stripeSig(raw, 'whsec_other'), 400],
    ['stale 6min', await stripeSig(raw, WEBHOOK_SECRET, now - 360), 400],
    ['future 6min', await stripeSig(raw, WEBHOOK_SECRET, now + 360), 400],
    ['v0 only', valid.replace('v1=', 'v0='), 400],
    ['v1 truncated', valid.slice(0, -2), 400],
    ['v1 uppercase hex', valid.replace(/v1=(.*)/, (_m, h: string) => 'v1=' + h.toUpperCase()), 400],
    ['body tampered', await stripeSig(raw + ' '), 400],
    ['t=NaN', 't=abc,v1=' + '0'.repeat(64), 400],
  ];
  for (const [label, sig, expected] of cases) {
    const r = new Request('https://x/stripe/webhook', { method: 'POST', headers: sig !== undefined ? { 'stripe-signature': sig } : {}, body: raw });
    const res = await worker.fetch(r, env, ctx);
    assert.equal(res.status, expected, label);
  }
});

test('a validly signed non-JSON body is a 400, not a 500 echoing the parser', async () => {
  const env = makeEnv();
  for (const raw of ['{not json', 'null', '[]', '"x"']) {
    const r = new Request('https://x/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': await stripeSig(raw) }, body: raw });
    const res = await worker.fetch(r, env, ctx);
    assert.equal(res.status, 400, raw);
    assert.equal((await json(res)).error, 'bad_json', raw);
  }
});

test('completed(unpaid) then async_payment_succeeded(paid) → exactly one Printful draft order', async () => {
  const env = makeEnv({ MERCH_CHECKOUT: '1' });
  const fx = printfulStub();
  const origWarn = console.warn; console.warn = () => {};
  try {
    const first = await worker.fetch(await webhookReq({ type: 'checkout.session.completed', data: { object: merchSession() } }, env), env, ctx);
    assert.equal(first.status, 200);
    assert.equal(fx.calls.length, 0, 'unpaid completion places nothing');

    const second = await worker.fetch(await webhookReq({ type: 'checkout.session.async_payment_succeeded', data: { object: merchSession({ payment_status: 'paid' }) } }, env), env, ctx);
    assert.equal(second.status, 200);
    assert.equal(fx.calls.filter(c => c.url.includes('/orders')).length, 1, 'one order after payment lands');
    const order = JSON.parse(fx.calls[0].body!);
    assert.equal(order.confirm, false);
    assert.equal(order.items[0].retail_price, '9.99');

    // Stripe redelivery of the paid event is idempotent via merchdone:.
    const third = await worker.fetch(await webhookReq({ type: 'checkout.session.async_payment_succeeded', data: { object: merchSession({ payment_status: 'paid' }) } }, env), env, ctx);
    assert.equal(third.status, 200);
    assert.equal(fx.calls.filter(c => c.url.includes('/orders')).length, 1, 'still exactly one order');
  } finally { fx.restore(); console.warn = origWarn; }
});

test('credits: completed(unpaid) grants nothing; async_payment_succeeded(paid) grants once', async () => {
  const env = makeEnv();
  const session = {
    id: 'cs_test_credasync000000000000000000', payment_status: 'unpaid', customer_email: 'c@x.y',
    metadata: { source: 'trainerscodex_credits', pack: 'five', credits: '5' },
  };
  const origLog = console.log; console.log = () => {};
  try {
    await worker.fetch(await webhookReq({ type: 'checkout.session.completed', data: { object: session } }, env), env, ctx);
    assert.equal(env.AI_QUOTA_KV!.store.get('credits:c@x.y'), undefined, 'no grant before payment');
    await worker.fetch(await webhookReq({ type: 'checkout.session.async_payment_succeeded', data: { object: { ...session, payment_status: 'paid' } } }, env), env, ctx);
    assert.equal(env.AI_QUOTA_KV!.store.get('credits:c@x.y'), '5');
    await worker.fetch(await webhookReq({ type: 'checkout.session.async_payment_succeeded', data: { object: { ...session, payment_status: 'paid' } } }, env), env, ctx);
    assert.equal(env.AI_QUOTA_KV!.store.get('credits:c@x.y'), '5', 'redelivery does not double-grant');
  } finally { console.log = origLog; }
});
