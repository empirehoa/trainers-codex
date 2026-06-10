// Stripe integration for the Premium Pack subscription.
//
// Flow:
//   1. Browser POSTs /stripe/checkout { returnUrl } → Worker creates a Stripe
//      Checkout Session for the configured Price ID, returns the hosted URL.
//   2. User completes payment on checkout.stripe.com.
//   3. Stripe redirects back to {returnUrl}?session_id=cs_xxx.
//   4. Browser POSTs /stripe/verify { sessionId } → Worker fetches the
//      session via the Stripe API, confirms `payment_status === 'paid'` or
//      `status === 'complete'`, and mints a license JWT.
//   5. Browser stores the JWT in localStorage as `trainerscodex.license`.
//   6. Parallel webhook flow (/stripe/webhook) handles ongoing subscription
//      events — cancellations, renewals, payment failures — by writing into
//      a `licenses` KV namespace keyed by customer email. (Future hook for
//      cross-device license fan-out once Supabase is wired.)
//
// We use raw fetch against api.stripe.com instead of the stripe npm package
// to keep the Worker bundle tiny (single function, ~10 KB compiled).

import type { Env } from './index';
import { jsonOk, jsonError } from './index';
import { mintLicense } from './jwt';
import { grantCredits } from './credit-store';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

interface StripeCheckoutBody {
  returnUrl?: string;
  email?: string;
  // 'monthly' (default) → $4.99/mo · 'annual' → $39/yr. Both subscriptions.
  term?: 'monthly' | 'annual';
}

export interface StripeSession {
  id: string;
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  status: 'open' | 'complete' | 'expired';
  customer: string | null;
  customer_email: string | null;
  customer_details?: { email?: string | null };
  subscription: string | null;
  metadata?: Record<string, string>;
  url: string;
}

export async function stripeFetch<T>(env: Env, method: 'GET' | 'POST', path: string, body?: Record<string, string>): Promise<T> {
  // No explicit stripe-version header — uses the account's default API
  // version (set in Stripe Dashboard → Developers → API). This avoids
  // version-mismatch errors when Stripe rotates supported versions.
  const headers: HeadersInit = {
    'authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
  };
  let init: RequestInit = { method, headers };
  if (body) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) params.append(k, v);
    init = { method, headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' }, body: params.toString() };
  }
  const resp = await fetch(`${STRIPE_API_BASE}${path}`, init);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`stripe_${resp.status}: ${text.slice(0, 200)}`);
  }
  return await resp.json() as T;
}

/**
 * POST /stripe/checkout
 * Body: { returnUrl: string, email?: string }
 * Returns: { url: string } — the Stripe-hosted Checkout URL.
 */
export async function stripeCheckout(req: Request, env: Env): Promise<Response> {
  let body: StripeCheckoutBody;
  try {
    body = await req.json();
  } catch {
    return jsonError(req, env, 400, 'bad_json');
  }

  if (!body.returnUrl || !isAllowedReturnUrl(body.returnUrl, env)) {
    return jsonError(req, env, 400, 'bad_return_url');
  }

  // success_url and cancel_url use Stripe's literal template placeholder
  // `{CHECKOUT_SESSION_ID}` — Stripe substitutes the real session ID when
  // it redirects.
  const successUrl = appendQuery(body.returnUrl, { session_id: '{CHECKOUT_SESSION_ID}', checkout: 'success' });
  const cancelUrl = appendQuery(body.returnUrl, { checkout: 'cancel' });

  // Annual ($39/yr) falls back to monthly if no annual price is configured.
  const annual = body.term === 'annual';
  const price = annual && env.STRIPE_PRICE_ANNUAL ? env.STRIPE_PRICE_ANNUAL : env.STRIPE_PRICE_ID;
  const term = annual && env.STRIPE_PRICE_ANNUAL ? 'annual' : 'monthly';

  const params: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: 'true',
    // Session-level metadata is echoed back by GET /checkout/sessions so
    // /verify can pick the right license TTL without re-reading the price.
    'metadata[source]': 'trainerscodex_premium_pack',
    'metadata[term]': term,
    'subscription_data[metadata][source]': 'trainerscodex_premium_pack',
    'subscription_data[metadata][term]': term,
  };
  if (body.email) {
    params.customer_email = body.email;
  }
  // Automatic tax disabled by default. To enable: configure your origin
  // address in Stripe Dashboard → Settings → Tax → Set up, then flip this
  // flag back to 'true' and redeploy.
  // params['automatic_tax[enabled]'] = 'true';

  const session = await stripeFetch<StripeSession>(env, 'POST', '/checkout/sessions', params);
  return jsonOk(req, env, { url: session.url, sessionId: session.id });
}

/**
 * POST /stripe/verify
 * Body: { sessionId: string }
 * Returns: { license: string } if the session is paid, else 402.
 */
export async function stripeVerify(req: Request, env: Env): Promise<Response> {
  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(req, env, 400, 'bad_json');
  }
  if (!body.sessionId || !/^cs_(test|live)_[A-Za-z0-9]{20,}$/.test(body.sessionId)) {
    return jsonError(req, env, 400, 'bad_session_id');
  }

  const session = await stripeFetch<StripeSession>(env, 'GET', `/checkout/sessions/${body.sessionId}?expand[]=subscription`);

  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  const done = session.status === 'complete';
  if (!paid || !done) {
    return jsonError(req, env, 402, 'session_not_paid', { payment_status: session.payment_status, status: session.status });
  }

  const email = session.customer_email || session.customer_details?.email || '';
  const sub = session.customer || 'anon';
  if (!email) {
    return jsonError(req, env, 422, 'no_customer_email');
  }

  // Annual subscriptions mint a 366-day license; monthly stays 31 days.
  const annual = session.metadata?.term === 'annual';
  const ttlSeconds = (annual ? 366 : 31) * 24 * 3600;

  const jwt = await mintLicense(env, {
    sub,
    email,
    stripe_session: session.id,
    ttlSeconds,
  });

  return jsonOk(req, env, { license: jwt, email, expiresInDays: annual ? 366 : 31 });
}

/**
 * POST /stripe/webhook
 * Stripe-signed webhook. We verify the signature, then react to:
 *   - checkout.session.completed: mint license (redundant with /verify; cheap)
 *   - customer.subscription.deleted: nothing today (license naturally expires)
 *   - invoice.payment_failed: log; the user keeps their JWT until exp.
 */
export async function stripeWebhook(req: Request, env: Env): Promise<Response> {
  const sig = req.headers.get('stripe-signature') || '';
  const raw = await req.text();

  const ok = await verifyStripeSignature(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'bad_signature' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const event = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };

  switch (event.type) {
    case 'checkout.session.completed': {
      const obj = event.data.object as Record<string, unknown>;
      const meta = (obj.metadata as Record<string, string> | undefined) || {};
      console.log(`[stripe] checkout completed sub=${obj.customer} session=${obj.id} email=${obj.customer_email} source=${meta.source}`);
      // Credit-pack purchases are granted here (the authoritative path — the
      // browser may never return). grantCredits is idempotent on session id, so
      // a later /credits/verify from the browser won't double-credit.
      if (meta.source === 'trainerscodex_credits' && env.AI_QUOTA_KV) {
        const email = (obj.customer_email as string)
          || ((obj.customer_details as { email?: string } | undefined)?.email)
          || '';
        const credits = parseInt(meta.credits || '0', 10);
        if (email && credits > 0) {
          const bal = await grantCredits(env.AI_QUOTA_KV, email, credits, String(obj.id));
          console.log(`[stripe] granted ${credits} credits to ${email} (balance=${bal})`);
        }
      }
      // Premium /verify mints the JWT when the browser comes back; this webhook
      // is otherwise telemetry + future server-side license storage.
      break;
    }
    case 'customer.subscription.deleted':
    case 'customer.subscription.updated': {
      const obj = event.data.object as Record<string, unknown>;
      console.log(`[stripe] subscription ${event.type} status=${obj.status} customer=${obj.customer}`);
      break;
    }
    case 'invoice.payment_failed': {
      const obj = event.data.object as Record<string, unknown>;
      console.log(`[stripe] payment failed customer=${obj.customer}`);
      break;
    }
    default:
      break;
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'content-type': 'application/json' } });
}

/**
 * Verify the `Stripe-Signature` header. The header looks like:
 *   t=1492774577,v1=5257a869...,v0=...
 * We HMAC-SHA-256 the signed payload `${t}.${rawBody}` with the webhook secret
 * and compare against v1.
 */
async function verifyStripeSignature(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=') as [string, string]));
  if (!parts.t || !parts.v1) return false;

  const timestamp = parseInt(parts.t, 10);
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
    // 5-minute replay window
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${rawBody}`));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

  // Constant-time compare
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

export function isAllowedReturnUrl(url: string, env: Env): boolean {
  try {
    const u = new URL(url);
    const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
    return allowed.includes(u.origin);
  } catch {
    return false;
  }
}

export function appendQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}
