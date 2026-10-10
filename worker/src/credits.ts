// One-time AI-credit purchase + balance routes.
//
//   POST /credits/checkout  { pack, returnUrl, email? }  → Stripe Checkout URL
//   POST /credits/verify    { sessionId }                → grant + mint token
//   POST /credits/balance   {}  (Bearer token)           → current balance
//
// Credits are the no-subscription path to AI generation: a buyer purchases a
// pack ($1.99 / $6.99 / $19.99), the balance is stored server-side in KV, and a
// long-lived "credits" JWT identifies their email-bucket so the AI routes can
// spend against it. The token grants nothing on its own — KV is authoritative.

import type { Env } from './index';
import { jsonOk, jsonError } from './index';
import { mintLicense, verifyLicense } from './jwt';
import { stripeFetch, isAllowedReturnUrl, appendQuery, type StripeSession } from './stripe';
import { CREDIT_PACKS, grantCredits, getCredits } from './credit-store';
import { readJsonObject } from './body';

/**
 * POST /credits/checkout
 * Body: { pack: 'single'|'five'|'twenty', returnUrl: string, email?: string }
 * Returns: { url, sessionId }
 */
export async function creditsCheckout(req: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(req);
  if (!body) {
    return jsonError(req, env, 400, 'bad_json');
  }

  const packId = typeof body.pack === 'string' ? body.pack : '';
  const pack = Object.hasOwn(CREDIT_PACKS, packId) ? CREDIT_PACKS[packId] : undefined;
  if (!pack) {
    return jsonError(req, env, 400, 'bad_pack', { packs: Object.keys(CREDIT_PACKS) });
  }
  if (typeof body.returnUrl !== 'string' || !isAllowedReturnUrl(body.returnUrl, env)) {
    return jsonError(req, env, 400, 'bad_return_url');
  }

  const priceId = (env as unknown as Record<string, string | undefined>)[pack.priceEnv];
  if (!priceId) {
    return jsonError(req, env, 503, 'credits_not_configured', { missing: pack.priceEnv });
  }

  const successUrl = appendQuery(body.returnUrl, { session_id: '{CHECKOUT_SESSION_ID}', credits: 'success' });
  const cancelUrl = appendQuery(body.returnUrl, { credits: 'cancel' });

  const params: Record<string, string> = {
    mode: 'payment',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: successUrl,
    cancel_url: cancelUrl,
    // No promotion-code field here. The launch coupon (Founding Trainer, $10
    // off the annual Premium price) is designed for the subscription; an
    // amount-off coupon that is not product-restricted in Stripe would zero out
    // a $1.99 credit pack if this surface exposed the field. Only the premium
    // checkout (stripe.ts) accepts codes.
    // Session metadata drives the webhook grant + the /verify grant.
    'metadata[source]': 'trainerscodex_credits',
    'metadata[pack]': packId,
    'metadata[credits]': String(pack.credits),
    'payment_intent_data[metadata][source]': 'trainerscodex_credits',
    'payment_intent_data[metadata][credits]': String(pack.credits),
  };
  if (typeof body.email === 'string' && body.email) params.customer_email = body.email;

  const session = await stripeFetch<StripeSession>(env, 'POST', '/checkout/sessions', params);
  return jsonOk(req, env, { url: session.url, sessionId: session.id });
}

/**
 * POST /credits/verify
 * Body: { sessionId: string }
 * Confirms the session is paid, grants the credits (idempotent), and mints a
 * long-lived credits token bound to the buyer's email.
 * Returns: { token, balance, creditsGranted, email }
 */
export async function creditsVerify(req: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(req);
  if (!body) {
    return jsonError(req, env, 400, 'bad_json');
  }
  const sessionId = body.sessionId;
  if (typeof sessionId !== 'string' || !/^cs_(test|live)_[A-Za-z0-9]{20,}$/.test(sessionId)) {
    return jsonError(req, env, 400, 'bad_session_id');
  }

  const session = await stripeFetch<StripeSession>(env, 'GET', `/checkout/sessions/${sessionId}`);

  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  const done = session.status === 'complete';
  if (!paid || !done) {
    return jsonError(req, env, 402, 'session_not_paid', { payment_status: session.payment_status, status: session.status });
  }
  if (session.metadata?.source !== 'trainerscodex_credits') {
    return jsonError(req, env, 422, 'not_a_credit_session');
  }

  const email = session.customer_email || session.customer_details?.email || '';
  if (!email) {
    return jsonError(req, env, 422, 'no_customer_email');
  }
  const credits = parseInt(session.metadata?.credits || '0', 10);

  let balance = 0;
  if (env.AI_QUOTA_KV) {
    balance = await grantCredits(env.AI_QUOTA_KV, email, credits, session.id);
  }

  // Credits token: long-lived (1 year) — it only points at the KV bucket.
  const token = await mintLicense(env, {
    sub: session.customer || 'anon',
    email,
    plan: 'credits',
    stripe_session: session.id,
    ttlSeconds: 366 * 24 * 3600,
  });

  return jsonOk(req, env, { token, balance, creditsGranted: credits, email });
}

/**
 * POST /credits/balance — Bearer <token>
 * Returns the current balance for the token's email. Premium tokens report
 * plan:'premium' (their entitlement is the monthly quota, not credits).
 */
export async function creditsBalance(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return jsonError(req, env, 401, 'token_required');

  const claims = await verifyLicense(env, m[1]);
  if (!claims) return jsonError(req, env, 401, 'invalid_token');

  if (claims.plan === 'premium') {
    return jsonOk(req, env, { plan: 'premium', balance: null });
  }
  const balance = env.AI_QUOTA_KV ? await getCredits(env.AI_QUOTA_KV, claims.email) : 0;
  return jsonOk(req, env, { plan: 'credits', balance, email: claims.email });
}
