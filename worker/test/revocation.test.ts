// Revocation lifecycle tests — the invariant that a cancelled subscription's
// license actually dies. Runs under `node --test` with an in-memory KV stub,
// same pattern as credit-store.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordSubscriptionSession, revokeBySubscription, isSessionRevoked,
} from '../src/revocation.ts';

interface KVish {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

function memKV(): KVish & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(k: string) { return store.get(k) ?? null; },
    async put(k: string, v: string) { store.set(k, v); },
  };
}

const asKV = (kv: KVish) => kv as unknown as Parameters<typeof isSessionRevoked>[0];

test('a recorded subscription can be revoked, and the session then reads revoked', async () => {
  const kv = memKV();
  await recordSubscriptionSession(asKV(kv), 'sub_123', 'cs_test_abc');
  assert.equal(await isSessionRevoked(asKV(kv), 'cs_test_abc'), false);

  const revoked = await revokeBySubscription(asKV(kv), 'sub_123');
  assert.equal(revoked, 'cs_test_abc');
  assert.equal(await isSessionRevoked(asKV(kv), 'cs_test_abc'), true);
});

test('revoking an unmapped subscription is a loud no-op, not a throw', async () => {
  const kv = memKV();
  const revoked = await revokeBySubscription(asKV(kv), 'sub_never_seen');
  assert.equal(revoked, null);
});

test('an unrelated session is never revoked by someone else\'s cancellation', async () => {
  const kv = memKV();
  await recordSubscriptionSession(asKV(kv), 'sub_a', 'cs_test_a');
  await recordSubscriptionSession(asKV(kv), 'sub_b', 'cs_test_b');
  await revokeBySubscription(asKV(kv), 'sub_a');
  assert.equal(await isSessionRevoked(asKV(kv), 'cs_test_a'), true);
  assert.equal(await isSessionRevoked(asKV(kv), 'cs_test_b'), false);
});

test('every helper degrades safely when KV is absent (self-host)', async () => {
  await recordSubscriptionSession(undefined, 'sub_x', 'cs_x'); // must not throw
  assert.equal(await revokeBySubscription(undefined, 'sub_x'), null);
  // Without a store there is nothing to consult — licenses run to exp, which
  // is the documented self-host tradeoff. Crucially this returns false
  // (license stays valid) rather than bricking every offline deploy.
  assert.equal(await isSessionRevoked(undefined, 'cs_x'), false);
});

test('missing ids never poison the store', async () => {
  const kv = memKV();
  await recordSubscriptionSession(asKV(kv), null, 'cs_test_abc');
  await recordSubscriptionSession(asKV(kv), 'sub_123', null);
  assert.equal(kv.store.size, 0);
  assert.equal(await isSessionRevoked(asKV(kv), null), false);
});
