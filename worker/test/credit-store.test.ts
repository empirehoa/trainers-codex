// Unit tests for the KV-backed AI credit store. Covers the money-adjacent
// invariants: grants are idempotent on the Stripe session id (so a webhook +
// the browser /verify can both fire without double-crediting), consume refuses
// when empty, and refund restores. Run with `node --test` (Node strips TS types
// natively). Imports the zero-dependency store directly so it needs no Worker
// runtime — see sanitize.test.ts for the same pattern + the reason for it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREDIT_PACKS, getCredits, grantCredits, consumeCredit, refundCredit,
  type CreditKV,
} from '../src/credit-store.ts';

// Minimal in-memory KV stub matching the CreditKV surface (get/put). We ignore
// expirationTtl — these tests don't exercise expiry.
function memKV(): CreditKV & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) { return store.has(key) ? store.get(key)! : null; },
    async put(key: string, value: string) { store.set(key, value); },
  };
}

const EMAIL = 'Buyer@Example.com';

test('catalog matches the documented pricing', () => {
  assert.equal(CREDIT_PACKS.single.credits, 1);
  assert.equal(CREDIT_PACKS.five.credits, 5);
  assert.equal(CREDIT_PACKS.twenty.credits, 20);
  assert.equal(CREDIT_PACKS.single.usd, '1.99');
  assert.equal(CREDIT_PACKS.five.usd, '6.99');
  assert.equal(CREDIT_PACKS.twenty.usd, '19.99');
});

test('empty bucket reads as zero', async () => {
  const kv = memKV();
  assert.equal(await getCredits(kv, EMAIL), 0);
});

test('grant adds credits and returns the new balance', async () => {
  const kv = memKV();
  const bal = await grantCredits(kv, EMAIL, 5, 'cs_test_aaa');
  assert.equal(bal, 5);
  assert.equal(await getCredits(kv, EMAIL), 5);
});

test('grant is idempotent on the session id', async () => {
  const kv = memKV();
  await grantCredits(kv, EMAIL, 5, 'cs_test_dup');
  // Same session id replayed (webhook retry + browser verify) must not stack.
  const bal = await grantCredits(kv, EMAIL, 5, 'cs_test_dup');
  assert.equal(bal, 5, 'replaying the same session must not double-credit');
  assert.equal(await getCredits(kv, EMAIL), 5);
});

test('distinct sessions accumulate', async () => {
  const kv = memKV();
  await grantCredits(kv, EMAIL, 1, 'cs_test_1');
  await grantCredits(kv, EMAIL, 20, 'cs_test_2');
  assert.equal(await getCredits(kv, EMAIL), 21);
});

test('balance is keyed case-insensitively on email', async () => {
  const kv = memKV();
  await grantCredits(kv, 'Buyer@Example.com', 3, 'cs_test_case');
  assert.equal(await getCredits(kv, 'buyer@example.com'), 3);
  assert.equal(await getCredits(kv, 'BUYER@EXAMPLE.COM'), 3);
});

test('consume decrements and reports the new balance', async () => {
  const kv = memKV();
  await grantCredits(kv, EMAIL, 2, 'cs_test_consume');
  const a = await consumeCredit(kv, EMAIL);
  assert.deepEqual(a, { ok: true, balance: 1 });
  const b = await consumeCredit(kv, EMAIL);
  assert.deepEqual(b, { ok: true, balance: 0 });
});

test('consume on an empty bucket refuses', async () => {
  const kv = memKV();
  const r = await consumeCredit(kv, EMAIL);
  assert.deepEqual(r, { ok: false, balance: 0 });
});

test('refund restores a credit (e.g. after a failed generation)', async () => {
  const kv = memKV();
  await grantCredits(kv, EMAIL, 1, 'cs_test_refund');
  await consumeCredit(kv, EMAIL);            // → 0
  const bal = await refundCredit(kv, EMAIL); // → 1
  assert.equal(bal, 1);
  assert.equal(await getCredits(kv, EMAIL), 1);
});

test('consume → fail → refund nets to the original balance', async () => {
  const kv = memKV();
  await grantCredits(kv, EMAIL, 3, 'cs_test_cycle');
  const c = await consumeCredit(kv, EMAIL);
  assert.equal(c.balance, 2);
  await refundCredit(kv, EMAIL);
  assert.equal(await getCredits(kv, EMAIL), 3);
});

test('grant floors fractional amounts and ignores negatives', async () => {
  const kv = memKV();
  await grantCredits(kv, EMAIL, 2.9, 'cs_test_frac');
  assert.equal(await getCredits(kv, EMAIL), 2);
  await grantCredits(kv, EMAIL, -5, 'cs_test_neg');
  assert.equal(await getCredits(kv, EMAIL), 2);
});
