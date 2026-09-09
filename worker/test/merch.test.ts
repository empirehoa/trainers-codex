// Merch checkout tests — the money-adjacent invariants of the paid-merch leg:
// server-side pricing is authoritative and sane, fulfillment is idempotent on
// webhook redelivery, refuses unpaid sessions, and hard-fails on a missing
// shipping address (so Stripe retries instead of dropping a paid order).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRetailUsd, fulfillMerchOrder } from '../src/merch.ts';
import { BASE_COST_USD } from '../src/pf-catalog.ts';

// ── pricing ────────────────────────────────────────────────────────────────

test('retail is base cost marked up, rounded UP to a .99 ending', () => {
  // Bella tee $8.95 at 100% → 17.90 raw → $17.99
  assert.equal(computeRetailUsd('tshirt-bella-3001', 100), 17.99);
  // Sticker $1.50 at 150% → 3.75 raw → $3.99
  assert.equal(computeRetailUsd('sticker-die-cut', 150), 3.99);
  for (const [productId, base] of Object.entries(BASE_COST_USD)) {
    for (const markup of [15, 50, 100, 150]) {
      const retail = computeRetailUsd(productId, markup);
      assert.ok(retail !== null, `${productId} @ ${markup}%`);
      // Margin never dips below the requested markup…
      assert.ok(retail! >= base * (1 + markup / 100) - 1e-9, `${productId} @ ${markup}% floor`);
      // …and the rounding bump is bounded.
      assert.ok(retail! <= base * (1 + markup / 100) + 1.0, `${productId} @ ${markup}% ceiling`);
      // Psychological ending.
      assert.equal(Math.round((retail! % 1) * 100), 99, `${productId} @ ${markup}% ends .99`);
    }
  }
});

test('unknown products and unlisted markups price to null, never to $0', () => {
  assert.equal(computeRetailUsd('not-a-product', 100), null);
  assert.equal(computeRetailUsd('tshirt-bella-3001', 37), null);
  assert.equal(computeRetailUsd('tshirt-bella-3001', 0), null);
  assert.equal(computeRetailUsd('tshirt-bella-3001', -50), null);
});

// ── fulfillment ────────────────────────────────────────────────────────────

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

function envWith(kv: KVish | undefined, onFetch: (url: string, init?: RequestInit) => unknown) {
  return {
    PRINTFUL_API_KEY: 'pf_test',
    PRINTFUL_STORE_ID: '18253803',
    AI_QUOTA_KV: kv,
    PRINTS_PUBLIC_BASE: 'https://pub-test.r2.dev',
    __onFetch: onFetch,
  } as unknown as Parameters<typeof fulfillMerchOrder>[0];
}

function paidSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cs_test_merch_0123456789abcdefghijklmn',
    payment_status: 'paid',
    metadata: {
      source: 'trainerscodex_merch',
      product: 'tshirt-bella-3001',
      design: 'crest',
      r2Key: 'merch-pending/abc.png',
      retail: '17.99',
      productName: "Trainer's Codex · crest · tshirt-bella-3001",
    },
    shipping_details: {
      name: 'Ash Grey',
      address: { line1: '1 Route St', city: 'Kissimmee', state: 'FL', postal_code: '34741', country: 'US' },
    },
    customer_details: { email: 'buyer@example.com', name: 'Ash Grey' },
    ...overrides,
  };
}

function stubFetch(calls: { url: string; body?: string }[]) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
    return new Response(JSON.stringify({ result: { id: 4242, status: 'draft' } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

test('a paid session places exactly one draft Printful order, idempotent on redelivery', async () => {
  const kv = memKV();
  const calls: { url: string; body?: string }[] = [];
  const restore = stubFetch(calls);
  try {
    const env = envWith(kv, () => undefined);
    await fulfillMerchOrder(env, paidSession());
    await fulfillMerchOrder(env, paidSession()); // webhook redelivery
    const orderCalls = calls.filter(c => c.url.includes('/orders'));
    assert.equal(orderCalls.length, 1, 'exactly one order placed');
    const body = JSON.parse(orderCalls[0].body!);
    assert.equal(body.confirm, false, 'order is a DRAFT');
    assert.equal(body.items[0].retail_price, '17.99');
    assert.equal(body.recipient.country_code, 'US');
    assert.ok(String(body.items[0].files[0].url).startsWith('https://pub-test.r2.dev/merch-pending/'));
  } finally {
    restore();
  }
});

test('an unpaid session is skipped without throwing', async () => {
  const calls: { url: string; body?: string }[] = [];
  const restore = stubFetch(calls);
  try {
    await fulfillMerchOrder(envWith(memKV(), () => undefined), paidSession({ payment_status: 'unpaid' }));
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test('a paid session missing its shipping address THROWS so Stripe retries', async () => {
  const restore = stubFetch([]);
  try {
    await assert.rejects(
      () => fulfillMerchOrder(envWith(memKV(), () => undefined), paidSession({ shipping_details: undefined })),
      /merch_missing_shipping/,
    );
  } finally {
    restore();
  }
});

test('non-merch sessions are ignored', async () => {
  const calls: { url: string; body?: string }[] = [];
  const restore = stubFetch(calls);
  try {
    await fulfillMerchOrder(
      envWith(memKV(), () => undefined),
      paidSession({ metadata: { source: 'trainerscodex_premium_pack' } }),
    );
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test('shipping under collected_information (2025+ API shape) also fulfills', async () => {
  const calls: { url: string; body?: string }[] = [];
  const restore = stubFetch(calls);
  try {
    const session = paidSession({ shipping_details: undefined });
    session.collected_information = {
      shipping_details: {
        name: 'Ash Grey',
        address: { line1: '1 Route St', city: 'Kissimmee', state: 'FL', postal_code: '34741', country: 'US' },
      },
    };
    await fulfillMerchOrder(envWith(memKV(), () => undefined), session);
    assert.equal(calls.filter(c => c.url.includes('/orders')).length, 1);
  } finally {
    restore();
  }
});
