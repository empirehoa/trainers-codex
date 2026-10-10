// Printful POD integration.
//
// Flow:
//   1. Browser POSTs /printful/order with multipart form:
//        - product: <product-id from MERCH_PRODUCTS>
//        - design: <design layout id>
//        - file:    <PNG blob>
//        - markup:  <50|100|150>
//        - metadata: <JSON-encoded design context>
//   2. Worker uploads the PNG to R2 (so Printful can fetch it via HTTPS URL).
//   3. Worker calls Printful's /sync/products endpoint with the design URL.
//   4. Worker returns { storeUrl, productId, externalUrl } so the browser
//      can deep-link the user into Printful checkout with the product
//      pre-attached.
//
// The browser falls back to the legacy URL-deeplink in buildVendorOrderUrl
// if Printful is misconfigured (env.PRINTFUL_API_KEY empty). That keeps the
// Merch Studio working in self-host setups without a Worker.

import type { Env } from './index';
import { jsonOk, jsonError } from './index';
import {
  catalogBaseCost, catalogVariant, designLabel, merchEnabled, pfFetch, publicPrintUrl, stripTrademark,
  GENERIC_LISTING_LABEL,
} from './pf-catalog';
import { guardMultipart } from './body';
// Re-exported for existing importers.
export {
  BASE_COST_USD, PRINTFUL_VARIANT_MAP, pfFetch, publicPrintUrl, stripTrademark,
} from './pf-catalog';


// Map Trainer's Codex product IDs → Printful catalog variant IDs.
// These come from Printful's product catalog (GET /products) and shouldn't
// drift unless Printful retires a SKU. The mapping is intentionally explicit
// rather than dynamic so we can fail loudly on unknowns.

interface PrintfulFileResp {
  result: { id: number; url: string };
}

interface PrintfulProductResp {
  result: {
    id: number;
    external_id: string;
    name: string;
    dashboard_url: string;
  };
}

/**
 * POST /printful/order
 * Multipart body:
 *   product   (string)  — internal product id (e.g. "tshirt-bella-3001")
 *   design    (string)  — "crest" | "roster" | "id-card" | "banner"
 *   markup    (string)  — "50" | "100" | "150"
 *   metadata  (string)  — JSON object with team context (for the SKU name)
 *   file      (Blob)    — print-ready PNG
 *
 * Returns: { storeUrl, dashboardUrl, productName, externalId }
 *   storeUrl     — link to send to the buyer (Printful generic product page)
 *   dashboardUrl — link for the seller (Jose) to inspect the listing
 *   productName  — Printful-side display name we generated
 *   externalId   — our internal ID so the seller can grep their Printful catalog
 */
export async function printfulOrder(req: Request, env: Env): Promise<Response> {
  // Server-side kill switch (shared with /merch/checkout): this route creates
  // a priced sync product in the OWNER's Printful store, so it is gated by the
  // same MERCH_CHECKOUT var — a client flag flip cannot reach Printful.
  if (!merchEnabled(env)) {
    return jsonError(req, env, 503, 'merch_disabled');
  }
  if (!env.PRINTFUL_API_KEY) {
    return jsonError(req, env, 503, 'printful_not_configured');
  }
  const guard = guardMultipart(req);
  if (!guard.ok) {
    return jsonError(req, env, guard.status, guard.code, guard.status === 413 ? { max_bytes: guard.maxBytes } : undefined);
  }

  const form = await req.formData();
  const productId = form.get('product')?.toString() || '';
  const design = form.get('design')?.toString() || '';
  const markup = form.get('markup')?.toString() || '100';
  const metadataRaw = form.get('metadata')?.toString() || '{}';
  const file = form.get('file');

  if (!file || typeof file === 'string') {
    return jsonError(req, env, 400, 'no_file');
  }
  if (file.size > 12 * 1024 * 1024) {
    return jsonError(req, env, 413, 'file_too_large', { max_mb: 12 });
  }

  const mapping = catalogVariant(productId);
  const baseCost = catalogBaseCost(productId);
  if (!mapping || baseCost === undefined) {
    return jsonError(req, env, 400, 'unknown_product', { product: productId });
  }
  const markupPct = parseInt(markup, 10);
  if (!Number.isFinite(markupPct) || markupPct <= 0 || markupPct > 500) {
    return jsonError(req, env, 400, 'bad_markup', { markup });
  }

  let metadata: { teamName?: unknown; gymName?: unknown; region?: unknown; trainer?: unknown } = {};
  try {
    const parsed: unknown = JSON.parse(metadataRaw);
    if (typeof parsed === 'object' && parsed !== null) metadata = parsed as typeof metadata;
  } catch { /* malformed client field — treat as absent metadata */ }

  // 1) Stash the PNG in R2 and surface it via a public-readable URL.
  const fileKey = `prints/${crypto.randomUUID()}.png`;
  const fileBytes = await file.arrayBuffer();
  await env.PRINTS_BUCKET.put(fileKey, fileBytes, {
    httpMetadata: { contentType: 'image/png' },
  });

  const designUrl = publicPrintUrl(env, fileKey);

  // 2) Upload the file reference to Printful's file library.
  const pfFile = await pfFetch<PrintfulFileResp>(env, 'POST', '/files', {
    'type': 'default',
    'url': designUrl,
    'filename': `${productId}-${designSlug(design)}.png`,
  });

  // 3) Create the sync product.
  const productName = composeProductName({
    designLabel: designLabel(design),
    teamName: typeof metadata.teamName === 'string' ? metadata.teamName : undefined,
    gymName: typeof metadata.gymName === 'string' ? metadata.gymName : undefined,
    region: typeof metadata.region === 'string' ? metadata.region : undefined,
  });
  const externalId = `tc-${productId}-${designSlug(design)}-${crypto.randomUUID().slice(0, 8)}`;

  // Calculate retail using the markup.
  const retail = (baseCost * (1 + markupPct / 100)).toFixed(2);

  const pfProduct = await pfFetch<PrintfulProductResp>(env, 'POST', '/sync/products', undefined, JSON.stringify({
    sync_product: {
      name: productName,
      external_id: externalId,
      thumbnail: designUrl,
    },
    sync_variants: [
      {
        external_id: `${externalId}-default`,
        variant_id: parseInt(mapping.variantId, 10),
        retail_price: retail,
        sku: externalId,
        files: [
          { id: pfFile.result.id, type: 'default' },
        ],
      },
    ],
  }));

  // The store URL pattern is documented at https://help.printful.com/.
  // For an unconnected store (no Shopify / Woo / Etsy yet), Printful returns
  // the dashboard URL — Jose can copy the listing into his platform of choice.
  const storeUrl = pfProduct.result.dashboard_url;
  const dashboardUrl = pfProduct.result.dashboard_url;

  return jsonOk(req, env, {
    storeUrl,
    dashboardUrl,
    productName,
    externalId,
    retail,
    designUrl,
  });
}

/**
 * Public read URL for an object in the prints bucket. Jose configures either a
 * public bucket subdomain (cdn.trainerscodex.com) or the bucket's r2.dev URL;
 * the PRINTS_PUBLIC_BASE var in wrangler.toml overrides the default. Printful
 * fetches designs from this host — if it is not actually serving the bucket,
 * every order dies at the file-upload step (see docs/PRINTFUL-SETUP.md).
 */


/** Design id as it may appear in a filename / external id — never echoed raw. */
function designSlug(design: string): string {
  const slug = design.toLowerCase().replace(/[^a-z0-9-]+/g, '').slice(0, 24);
  return slug || 'design';
}

// Legal bright-line backstop: a public Printful listing title must never carry
// the franchise trademark, the publisher names, or a species name — even if a
// stale/modified client skips its own strip. The worker holds the full species
// list (species-names.ts, generated) so this no longer depends on the client.
// A user label that is nothing BUT blocked terms falls back to the generic
// label rather than vanishing, so the seller can still recognise the listing.
export function composeProductName(parts: { designLabel: string; teamName?: string; gymName?: string; region?: string }): string {
  const fragments: string[] = [parts.designLabel];
  const primary = parts.gymName || parts.teamName;
  if (primary) fragments.push(stripTrademark(primary) || GENERIC_LISTING_LABEL);
  if (parts.region) {
    const region = stripTrademark(parts.region);
    if (region) fragments.push(region);
  }
  return fragments.join(' · ');
}

