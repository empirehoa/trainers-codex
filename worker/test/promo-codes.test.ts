// Promotion codes reach exactly one Checkout surface: the Premium subscription.
//
// LAUNCH_READINESS blocker 5 — the owner's Founding Trainer coupon is redeemed
// through Stripe's "Add promotion code" field, which only appears when the
// session is created with `allow_promotion_codes=true`. That field must exist on
// the premium checkout and must NOT exist on credits or merch: an amount-off
// coupon that is not product-restricted in the dashboard would otherwise zero
// out a $1.99 credit pack or a sticker. Asserted on the form-encoded body that
// actually goes to api.stripe.com, through the real router.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  worker, makeEnv, ctx, jsonReq, multipartReq, stubFetch, json, blobOf, PNG_BYTES,
} from './_harness.ts';

const RETURN_URL = 'https://trainerscodex.com/';
const SESSION = { id: 'cs_test_new0000000000000000000000', url: 'https://checkout.stripe.com/c/pay/x' };

function stripeOnly() {
  return stubFetch((url) => {
    if (url.startsWith('https://api.stripe.com/v1/checkout/sessions')) return SESSION;
    if (url.startsWith('https://api.printful.com/')) return { result: { id: 7, url: 'https://pf/x', dashboard_url: 'https://pf/dash' } };
    throw new Error(`unexpected upstream ${url}`);
  });
}

function sessionBody(fx: ReturnType<typeof stubFetch>): URLSearchParams {
  const call = fx.calls.find(c => c.url === 'https://api.stripe.com/v1/checkout/sessions');
  assert.ok(call, 'a Checkout Session was created');
  assert.equal((call.init?.headers as Record<string, string>)['content-type'], 'application/x-www-form-urlencoded');
  return new URLSearchParams(call.body);
}

test('premium monthly checkout sends allow_promotion_codes=true', async () => {
  const fx = stripeOnly();
  try {
    const res = await worker.fetch(jsonReq('/stripe/checkout', { returnUrl: RETURN_URL }), makeEnv(), ctx);
    assert.equal(res.status, 200);
    const p = sessionBody(fx);
    assert.equal(p.get('mode'), 'subscription');
    assert.equal(p.get('allow_promotion_codes'), 'true');
    assert.equal(p.get('metadata[term]'), 'monthly');
  } finally {
    fx.restore();
  }
});

test('premium annual checkout — the Founding Trainer target — sends allow_promotion_codes=true', async () => {
  const fx = stripeOnly();
  try {
    const env = makeEnv({ STRIPE_PRICE_ANNUAL: 'price_annual_test' });
    const res = await worker.fetch(jsonReq('/stripe/checkout', { returnUrl: RETURN_URL, term: 'annual' }), env, ctx);
    assert.equal(res.status, 200);
    const p = sessionBody(fx);
    assert.equal(p.get('line_items[0][price]'), 'price_annual_test');
    assert.equal(p.get('metadata[term]'), 'annual');
    assert.equal(p.get('allow_promotion_codes'), 'true');
    // No coupon or discount is pinned server-side: the owner chooses it in the
    // dashboard and the buyer types the code.
    assert.equal([...p.keys()].some(k => k.startsWith('discounts[')), false, 'no server-pinned discount');
  } finally {
    fx.restore();
  }
});

test('credits checkout does NOT expose a promotion-code field', async () => {
  const fx = stripeOnly();
  try {
    const env = makeEnv({ STRIPE_PRICE_CREDITS_1: 'price_credits_1_test' });
    const res = await worker.fetch(jsonReq('/credits/checkout', { pack: 'single', returnUrl: RETURN_URL }), env, ctx);
    assert.equal(res.status, 200, JSON.stringify(await json(res.clone())));
    const p = sessionBody(fx);
    assert.equal(p.get('mode'), 'payment');
    assert.equal(p.get('metadata[source]'), 'trainerscodex_credits');
    assert.equal(p.has('allow_promotion_codes'), false, 'credits must not accept promotion codes');
  } finally {
    fx.restore();
  }
});

test('merch checkout (kill switch ON for the test) does NOT expose a promotion-code field', async () => {
  const fx = stripeOnly();
  try {
    const env = makeEnv({ MERCH_CHECKOUT: '1' });
    const fields = {
      product: 'tshirt-bella-3001', design: 'crest', markup: '100', expectedRetail: '17.99',
      returnUrl: RETURN_URL, metadata: JSON.stringify({ teamName: 'Kissimmee Crew' }),
      file: blobOf(PNG_BYTES, 'image/png'),
    };
    const res = await worker.fetch(multipartReq('/merch/checkout', fields), env, ctx);
    assert.equal(res.status, 200, JSON.stringify(await json(res.clone())));
    const p = sessionBody(fx);
    assert.equal(p.get('mode'), 'payment');
    assert.equal(p.has('allow_promotion_codes'), false, 'merch must not accept promotion codes');
  } finally {
    fx.restore();
  }
});
