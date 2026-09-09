// Paid merch checkout — the buyer leg the Printful integration never had.
//
// The existing /printful/order route creates a *seller-side* sync product and
// returns a dashboard URL: useful for cataloguing, but no customer can pay
// through it. This module is the actual purchase path:
//
//   1. Browser POSTs /merch/checkout (multipart, same shape as /printful/order
//      plus returnUrl). The Worker validates the product + markup, uploads the
//      print PNG to R2 under `merch-pending/`, computes the retail price
//      SERVER-SIDE from the base-cost table, and creates a Stripe Checkout
//      session in `payment` mode with shipping-address collection.
//   2. The buyer pays on checkout.stripe.com.
//   3. Stripe fires checkout.session.completed → stripe.ts routes sessions
//      with metadata.source === 'trainerscodex_merch' to fulfillMerchOrder(),
//      which places a Printful DRAFT order (confirm=false) with the buyer's
//      shipping address and the R2 design URL. Draft, not confirmed: the
//      seller reviews and confirms in the Printful dashboard, which is the
//      safety valve while the pipeline is young. Fulfillment errors throw so
//      Stripe retries the webhook.
//
// Pricing is authoritative on the server: the client sends its displayed
// retail only so we can refuse on drift (a tampered client cannot buy a $50
// hoodie for $0.50, and a stale client cannot silently undercharge).
//
// This route ships DARK. The client path is behind the MERCH_CHECKOUT feature
// flag (default off) and the whole merch surface additionally sits behind the
// JOURNEY_MERCH_CTA / counsel gate — see docs/JOURNEY_MODE.md. Building the
// leg now means flipping the flag is a config change, not a build.

// Imports use explicit .ts extensions and only LEAF modules (type-only index
// import aside) so node:test can load this file directly — gotcha 42.
import type { Env } from './index.ts';
import { applyCORS } from './cors.ts';
import { stripeFetch, isAllowedReturnUrl, appendQuery, type StripeSession } from './stripe-client.ts';
import {
  BASE_COST_USD, PRINTFUL_VARIANT_MAP, pfFetch, publicPrintUrl, stripTrademark,
} from './pf-catalog.ts';

// Local JSON response helpers. index.ts has identical ones, but importing
// index.ts here would drag the whole route table (and its non-leaf imports)
// into node:test module resolution.
function jsonError(req: Request, env: Env, status: number, code: string, extra?: Record<string, unknown>): Response {
  return applyCORS(new Response(JSON.stringify({ error: code, ...extra }), {
    status, headers: { 'content-type': 'application/json' },
  }), req, env);
}
function jsonOk(req: Request, env: Env, body: unknown): Response {
  return applyCORS(new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  }), req, env);
}

/** Markups the client may request — mirrors MARKUP_OPTIONS in src/lib/merch.ts. */
const ALLOWED_MARKUPS = new Set([15, 50, 100, 150]);

/** Ship-to countries at launch. USD-only retail per the monetization playbook. */
const ALLOWED_COUNTRIES = ['US'];

interface MerchSessionMeta extends Record<string, string> {
  source: 'trainerscodex_merch';
  product: string;
  design: string;
  r2Key: string;
  retail: string;
  productName: string;
}

/** Server-side retail: base cost marked up, rounded to psychological .99. */
export function computeRetailUsd(productId: string, markupPct: number): number | null {
  const base = BASE_COST_USD[productId];
  if (base === undefined || !ALLOWED_MARKUPS.has(markupPct)) return null;
  const raw = base * (1 + markupPct / 100);
  // Round UP to the next .99 so margin never dips below the requested markup.
  const dollars = Math.floor(raw);
  const retail = raw <= dollars + 0.99 ? dollars + 0.99 : dollars + 1.99;
  return Math.round(retail * 100) / 100;
}

/**
 * POST /merch/checkout
 * Multipart body: product, design, markup, metadata (JSON), returnUrl,
 * expectedRetail (the price the buyer saw), file (print-ready PNG).
 * Returns: { url } — the Stripe-hosted Checkout URL.
 */
export async function merchCheckout(req: Request, env: Env): Promise<Response> {
  if (!env.PRINTFUL_API_KEY) {
    return jsonError(req, env, 503, 'printful_not_configured');
  }

  const form = await req.formData();
  const productId = form.get('product')?.toString() || '';
  const design = form.get('design')?.toString() || '';
  const markup = parseInt(form.get('markup')?.toString() || '100', 10);
  const returnUrl = form.get('returnUrl')?.toString() || '';
  const expectedRetail = parseFloat(form.get('expectedRetail')?.toString() || '0');
  const metadataRaw = form.get('metadata')?.toString() || '{}';
  const file = form.get('file');

  if (!returnUrl || !isAllowedReturnUrl(returnUrl, env)) {
    return jsonError(req, env, 400, 'bad_return_url');
  }
  if (!file || typeof file === 'string') {
    return jsonError(req, env, 400, 'no_file');
  }
  if (file.size > 12 * 1024 * 1024) {
    return jsonError(req, env, 413, 'file_too_large', { max_mb: 12 });
  }
  if (!PRINTFUL_VARIANT_MAP[productId]) {
    return jsonError(req, env, 400, 'unknown_product', { product: productId });
  }

  const retail = computeRetailUsd(productId, markup);
  if (retail === null) {
    return jsonError(req, env, 400, 'bad_markup', { markup });
  }
  // The buyer must be charged the number they were shown. A drifted or
  // tampered client fails loudly here instead of billing a surprise.
  if (!Number.isFinite(expectedRetail) || Math.abs(expectedRetail - retail) > 0.005) {
    return jsonError(req, env, 409, 'price_mismatch', { server: retail, client: expectedRetail });
  }

  let metadata: { teamName?: string; trainer?: string; region?: string } = {};
  try { metadata = JSON.parse(metadataRaw); } catch { /* absent metadata is fine */ }

  // Stage the print file where fulfillment (and Printful) can reach it. The
  // key carries no PII; the session metadata is what ties it to the buyer.
  const r2Key = `merch-pending/${crypto.randomUUID()}.png`;
  await env.PRINTS_BUCKET.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: 'image/png' },
  });

  const cleanTeam = metadata.teamName ? stripTrademark(metadata.teamName) : '';
  const productName = stripTrademark(
    `Trainer's Codex · ${design} · ${productId}${cleanTeam ? ` · ${cleanTeam}` : ''}`,
  );

  const meta: MerchSessionMeta = {
    source: 'trainerscodex_merch',
    product: productId,
    design,
    r2Key,
    retail: retail.toFixed(2),
    productName,
  };

  const successUrl = appendQuery(returnUrl, { merch: 'success', session_id: '{CHECKOUT_SESSION_ID}' });
  const cancelUrl = appendQuery(returnUrl, { merch: 'cancel' });

  const params: Record<string, string> = {
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(Math.round(retail * 100)),
    'line_items[0][price_data][product_data][name]': productName,
    // Physical goods: Stripe collects the shipping address for us.
    ...ALLOWED_COUNTRIES.reduce<Record<string, string>>((acc, c, i) => {
      acc[`shipping_address_collection[allowed_countries][${i}]`] = c;
      return acc;
    }, {}),
  };
  for (const [k, v] of Object.entries(meta)) params[`metadata[${k}]`] = v;

  const session = await stripeFetch<StripeSession>(env, 'POST', '/checkout/sessions', params);
  return jsonOk(req, env, { url: session.url, sessionId: session.id, retail: retail.toFixed(2) });
}

// ── Fulfillment (webhook side) ─────────────────────────────────────────────

interface ShippingDetails {
  name?: string;
  address?: {
    line1?: string; line2?: string; city?: string;
    state?: string; postal_code?: string; country?: string;
  };
}

interface PrintfulOrderResp {
  result: { id: number; status: string; dashboard_url?: string };
}

/**
 * Place the Printful DRAFT order for a paid merch checkout session. Called
 * from the Stripe webhook; the session object arrives in the webhook payload.
 * Throws on anything unfulfillable so Stripe retries — a paid order must
 * never be silently dropped.
 */
export async function fulfillMerchOrder(env: Env, session: Record<string, unknown>): Promise<void> {
  const meta = (session.metadata as MerchSessionMeta | undefined);
  if (!meta || meta.source !== 'trainerscodex_merch') return;

  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if (!paid) {
    console.warn(`[merch] session ${session.id} completed but not paid (${session.payment_status}) — skipping`);
    return;
  }

  // Idempotency: Stripe redelivers webhooks; a paid order must be placed once.
  if (env.AI_QUOTA_KV) {
    const doneKey = `merchdone:${session.id}`;
    if (await env.AI_QUOTA_KV.get(doneKey)) {
      console.log(`[merch] session ${session.id} already fulfilled — skipping redelivery`);
      return;
    }
  }

  const mapping = PRINTFUL_VARIANT_MAP[meta.product];
  if (!mapping) throw new Error(`merch_unknown_product:${meta.product}`);

  // checkout.session.completed carries shipping under either key by API era:
  // older API versions use `shipping_details`, 2025+ moved it under
  // `collected_information.shipping_details`.
  const shipping = (session.shipping_details
    ?? (session.collected_information as { shipping_details?: ShippingDetails } | undefined)?.shipping_details
  ) as ShippingDetails | undefined;
  const customer = session.customer_details as { email?: string; name?: string } | undefined;
  const addr = shipping?.address;
  if (!addr?.line1 || !addr.city || !addr.postal_code || !addr.country) {
    throw new Error(`merch_missing_shipping:${session.id}`);
  }

  const designUrl = publicPrintUrl(env, meta.r2Key);

  const order = await pfFetch<PrintfulOrderResp>(env, 'POST', '/orders', undefined, JSON.stringify({
    external_id: `tc-merch-${String(session.id).slice(-24)}`,
    confirm: false, // DRAFT — the seller confirms in the dashboard.
    recipient: {
      name: shipping?.name || customer?.name || 'Trainer',
      address1: addr.line1,
      address2: addr.line2 || undefined,
      city: addr.city,
      state_code: addr.state || undefined,
      country_code: addr.country,
      zip: addr.postal_code,
      email: customer?.email || undefined,
    },
    items: [{
      variant_id: parseInt(mapping.variantId, 10),
      quantity: 1,
      retail_price: meta.retail,
      name: meta.productName,
      files: [{ url: designUrl }],
    }],
  }));

  if (env.AI_QUOTA_KV) {
    await env.AI_QUOTA_KV.put(`merchdone:${session.id}`, String(order.result.id), {
      expirationTtl: 90 * 24 * 3600,
    });
  }
  console.log(`[merch] draft order ${order.result.id} placed for session ${session.id} (${meta.product}, $${meta.retail})`);
}
