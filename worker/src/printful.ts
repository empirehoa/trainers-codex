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
  BASE_COST_USD, PRINTFUL_VARIANT_MAP, pfFetch, publicPrintUrl, stripTrademark,
} from './pf-catalog';
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
  if (!env.PRINTFUL_API_KEY) {
    return jsonError(req, env, 503, 'printful_not_configured');
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

  const mapping = PRINTFUL_VARIANT_MAP[productId];
  if (!mapping) {
    return jsonError(req, env, 400, 'unknown_product', { product: productId });
  }

  let metadata: { teamName?: string; gymName?: string; region?: string; trainer?: string } = {};
  try { metadata = JSON.parse(metadataRaw); } catch { /* malformed client field — treat as absent metadata */ }

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
    'filename': `${productId}-${design}.png`,
  });

  // 3) Create the sync product.
  const productName = composeProductName({
    designLabel: designLabel(design),
    teamName: metadata.teamName,
    gymName: metadata.gymName,
    region: metadata.region,
  });
  const externalId = `tc-${productId}-${design}-${crypto.randomUUID().slice(0, 8)}`;

  // Calculate retail using the markup.
  const baseCost = BASE_COST_USD[productId];
  const retail = (baseCost * (1 + parseInt(markup, 10) / 100)).toFixed(2);

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


function designLabel(design: string): string {
  const map: Record<string, string> = {
    'crest':    'Trainer Crest',
    'roster':   'Champion Roster',
    'id-card':  'Trainer ID Card',
    'banner':   'Gym Banner',
  };
  return map[design] || 'Trainer Codex';
}

// Legal bright-line backstop: a public Printful listing title must never carry
// the Pokémon trademark, even if a stale/modified client skips its own strip.
// The client (which holds the full species list) sanitizes species names; here
// we guarantee the trademark token is gone server-side. Mirrors
// src/lib/merch.ts `sanitizeListingTitle`.


function composeProductName(parts: { designLabel: string; teamName?: string; gymName?: string; region?: string }): string {
  const fragments: string[] = [parts.designLabel];
  const gym = parts.gymName ? stripTrademark(parts.gymName) : '';
  const team = parts.teamName ? stripTrademark(parts.teamName) : '';
  const region = parts.region ? stripTrademark(parts.region) : '';
  if (gym) fragments.push(gym);
  else if (team) fragments.push(team);
  if (region) fragments.push(region);
  return fragments.join(' · ');
}

