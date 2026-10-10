// License JWT hardening (audit finding B-7) plus the alg-pinning invariants
// the audit confirmed (B-P1), so a refactor cannot regress either silently.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, forge, claims, SIGNING_KEY, jwtMod, worker, ctx, jsonReq, json } from './_harness.ts';

const { mintLicense, verifyLicense } = jwtMod;
const HS256 = { alg: 'HS256', typ: 'JWT' };
const env = makeEnv();
const asEnv = env as never;

test('a freshly minted license verifies and carries the expected claims', async () => {
  const jwt = await mintLicense(asEnv, { sub: 'cus_1', email: 'a@b.c', stripe_session: 'cs_test_1' });
  const c = await verifyLicense(asEnv, jwt);
  assert.ok(c);
  assert.equal(c.plan, 'premium');
  assert.equal(c.exp - c.iat, 31 * 24 * 3600);
});

test('exp must be a finite number: missing / string / NaN / null / Infinity are all rejected', async () => {
  for (const exp of [undefined, 'never', NaN, null, Infinity, '9999999999']) {
    const body = claims();
    if (exp === undefined) delete body.exp; else body.exp = exp;
    const jwt = await forge(HS256, body);
    assert.equal(await verifyLicense(asEnv, jwt), null, `exp=${String(exp)}`);
  }
});

test('an expired token is rejected; a token expiring in 1s is accepted', async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(await verifyLicense(asEnv, await forge(HS256, claims({ exp: now - 1 }))), null);
  assert.ok(await verifyLicense(asEnv, await forge(HS256, claims({ exp: now + 1 }))));
});

test('exp more than 400 days after iat is rejected (a 10-year token cannot be a real license)', async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(await verifyLicense(asEnv, await forge(HS256, claims({ iat: now, exp: now + 10 * 365 * 24 * 3600 }))), null);
  assert.equal(await verifyLicense(asEnv, await forge(HS256, claims({ iat: now, exp: now + 401 * 24 * 3600 }))), null);
  // …the real annual license (366 days) is within the cap.
  assert.ok(await verifyLicense(asEnv, await forge(HS256, claims({ iat: now, exp: now + 366 * 24 * 3600 }))));
  // iat missing or non-numeric cannot be used to dodge the cap.
  const noIat = claims({ exp: now + 3600 }); delete noIat.iat;
  assert.equal(await verifyLicense(asEnv, await forge(HS256, noIat)), null);
  assert.equal(await verifyLicense(asEnv, await forge(HS256, claims({ iat: 'x', exp: now + 3600 }))), null);
});

test('nbf is honoured when present', async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(await verifyLicense(asEnv, await forge(HS256, claims({ nbf: now + 600 }))), null, 'future nbf');
  assert.ok(await verifyLicense(asEnv, await forge(HS256, claims({ nbf: now - 600 }))), 'past nbf');
  assert.equal(await verifyLicense(asEnv, await forge(HS256, claims({ nbf: 'soon' }))), null, 'non-numeric nbf');
});

test('JWT_SIGNING_KEY shorter than 32 chars is a loud config error at mint and at verify', async () => {
  for (const key of ['', 'x', 'short-key-0123456789']) {
    const weak = makeEnv({ JWT_SIGNING_KEY: key }) as never;
    await assert.rejects(
      () => mintLicense(weak, { sub: 's', email: 'e@x.y', stripe_session: 'cs_test_1' }),
      /JWT_SIGNING_KEY must be at least 32 characters/,
      `mint with key length ${key.length}`,
    );
    const jwt = await forge(HS256, claims(), key || 'x'); // WebCrypto refuses a zero-length HMAC key; verify must reject before it gets there
    await assert.rejects(() => verifyLicense(weak, jwt), /JWT_SIGNING_KEY must be at least 32 characters/, `verify with key length ${key.length}`);
  }
});

test('alg pinning: none / None / RS256 / HS384 / HS512 / missing typ are rejected even with a valid HMAC', async () => {
  for (const header of [
    { alg: 'none', typ: 'JWT' }, { alg: 'None', typ: 'JWT' }, { alg: 'RS256', typ: 'JWT' },
    { alg: 'HS384', typ: 'JWT' }, { alg: 'HS512', typ: 'JWT' }, { alg: 'HS256' }, { alg: 'HS256', typ: 'jwt' },
  ]) {
    assert.equal(await verifyLicense(asEnv, await forge(header, claims())), null, JSON.stringify(header));
  }
  // Same body, wrong key.
  assert.equal(await verifyLicense(asEnv, await forge(HS256, claims(), SIGNING_KEY + 'x')), null);
  // Malformed inputs never throw.
  for (const bad of ['', 'a', 'a.b', 'a.b.c', '!!!.###.$$$']) {
    assert.equal(await verifyLicense(asEnv, bad), null, bad);
  }
});

test('/license/verify reports a perpetual-exp forgery as invalid', async () => {
  const jwt = await forge(HS256, claims({ exp: 'never' }));
  const res = await worker.fetch(jsonReq('/license/verify', { jwt }), env, ctx);
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), { valid: false });
});
