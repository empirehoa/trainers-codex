// /stripe/verify — only a paid Premium Pack SUBSCRIPTION session may mint a
// premium license (audit finding B-1). Before this check any paid, complete
// Checkout session — a $1.99 credit pack, a $1.99 sticker — minted 31 days of
// premium. Drives the real router with a stubbed Stripe API.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worker, makeEnv, ctx, jsonReq, stubFetch, stripeSession, json, jwtMod } from './_harness.ts';

const SESSION_ID = 'cs_test_abcdefghijklmnopqrstuvwxyz0123';

async function verifyWith(session: Record<string, unknown>) {
  const env = makeEnv();
  const fx = stubFetch((url) => {
    assert.ok(url.startsWith('https://api.stripe.com/v1/checkout/sessions/'), `unexpected upstream call ${url}`);
    return session;
  });
  try {
    const res = await worker.fetch(jsonReq('/stripe/verify', { sessionId: SESSION_ID }), env, ctx);
    return { env, status: res.status, body: await json(res) };
  } finally {
    fx.restore();
  }
}

test('a paid merch session does NOT mint a premium license', async () => {
  const { status, body } = await verifyWith(stripeSession({
    mode: 'payment', subscription: null,
    metadata: { source: 'trainerscodex_merch', product: 'sticker-die-cut', retail: '1.99' },
  }));
  assert.equal(status, 422);
  assert.equal(body.error, 'not_a_premium_session');
  assert.equal('license' in body, false, 'no license field');
});

test('a paid credits session does NOT mint a premium license', async () => {
  const { status, body } = await verifyWith(stripeSession({
    mode: 'payment', subscription: null,
    metadata: { source: 'trainerscodex_credits', pack: 'single', credits: '1' },
  }));
  assert.equal(status, 422);
  assert.equal(body.error, 'not_a_premium_session');
  assert.equal('license' in body, false);
});

test('a paid session with no source metadata does NOT mint a premium license', async () => {
  const { status, body } = await verifyWith(stripeSession({ metadata: undefined }));
  assert.equal(status, 422);
  assert.equal(body.error, 'not_a_premium_session');
  assert.equal('license' in body, false);
});

test('premium metadata alone is not enough: mode must be subscription with a subscription id', async () => {
  const noSub = await verifyWith(stripeSession({ subscription: null }));
  assert.equal(noSub.status, 422);
  assert.equal('license' in noSub.body, false);

  const paymentMode = await verifyWith(stripeSession({ mode: 'payment' }));
  assert.equal(paymentMode.status, 422);
  assert.equal('license' in paymentMode.body, false);
});

test('a paid, complete premium subscription session mints a premium license', async () => {
  const { env, status, body } = await verifyWith(stripeSession());
  assert.equal(status, 200);
  assert.equal(typeof body.license, 'string');
  assert.equal(body.expiresInDays, 31);
  const claims = await jwtMod.verifyLicense(env as never, body.license as string);
  assert.ok(claims, 'minted token verifies');
  assert.equal(claims.plan, 'premium');
  assert.equal(claims.stripe_session, SESSION_ID);
});

test('an unpaid premium session is still 402, and never 422 leaks ahead of payment', async () => {
  const { status, body } = await verifyWith(stripeSession({ payment_status: 'unpaid', status: 'open' }));
  assert.equal(status, 402);
  assert.equal(body.error, 'session_not_paid');
});
