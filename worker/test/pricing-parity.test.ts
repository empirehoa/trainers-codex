// Pricing parity — the two base-cost tables must agree.
//
// The Worker (worker/src/pf-catalog.ts) is the authority that PRICES a paid
// checkout; the app bundle (src/lib/merch.ts) is what the buyer is SHOWN.
// They are separate builds that cannot share a runtime import, so this test
// is the guarantee that they cannot drift apart silently — the exact failure
// mode called out in the 2026-09 monetization audit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_COST_USD } from '../src/pf-catalog.ts';
import { MERCH_PRODUCTS } from '../../src/lib/merch.ts';

test('every app product has a matching worker base cost, to the cent', () => {
  assert.ok(MERCH_PRODUCTS.length >= 12, 'catalog present');
  for (const product of MERCH_PRODUCTS) {
    const workerCost = BASE_COST_USD[product.id];
    assert.ok(workerCost !== undefined, `worker table missing ${product.id}`);
    assert.equal(workerCost, product.baseCostUSD, `${product.id} base cost drifted`);
  }
});

test('the worker table carries no products the app cannot sell', () => {
  const appIds = new Set(MERCH_PRODUCTS.map(p => p.id));
  for (const id of Object.keys(BASE_COST_USD)) {
    assert.ok(appIds.has(id), `worker-only product ${id}`);
  }
});
