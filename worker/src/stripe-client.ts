// Shared Stripe HTTP client + URL helpers.
//
// Split out of stripe.ts so modules that talk to Stripe (subscriptions in
// stripe.ts, paid merch in merch.ts) don't import each other — merch.ts
// importing stripe.ts while stripe.ts imports merch.ts for webhook
// fulfillment was a cycle. This is also a LEAF module (its only ./index
// import is type-only, which Node's type stripping erases), so node:test
// suites can import the checkout logic directly — see CLAUDE.md gotcha 42.

import type { Env } from './index';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

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
