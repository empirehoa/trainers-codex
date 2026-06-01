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

const PRINTFUL_API = 'https://api.printful.com';

// Map Trainer's Codex product IDs → Printful catalog variant IDs.
// These come from Printful's product catalog (GET /products) and shouldn't
// drift unless Printful retires a SKU. The mapping is intentionally explicit
// rather than dynamic so we can fail loudly on unknowns.
const PRINTFUL_VARIANT_MAP: Record<string, { productId: string; variantId: string }> = {
  'tshirt-bella-3001':      { productId: '71',    variantId: '4011'  }, // Bella+Canvas 3001, white, M
  'tshirt-gildan-64000':    { productId: '162',   variantId: '8923'  }, // Gildan 64000, white, M
  'hoodie-gildan-18500':    { productId: '146',   variantId: '5530'  }, // Gildan 18500, black, M
  'crewneck-gildan-18000':  { productId: '145',   variantId: '5497'  }, // Gildan 18000, black, M
  'mug-11oz-white':         { productId: '19',    variantId: '1320'  }, // 11oz white mug
  'mousepad-small':         { productId: '643',   variantId: '12108' }, // Gaming mouse pad
  'mousepad-xl-desk':       { productId: '14026', variantId: '17517' }, // Desk mat 36x16
  'sticker-die-cut':        { productId: '358',   variantId: '10162' }, // Kiss-cut sticker 4x4 (Printful native)
  'poster-11x14':           { productId: '171',   variantId: '4304'  }, // Matte poster 11x14
  'poster-18x24':           { productId: '173',   variantId: '4314'  }, // Matte poster 18x24
  'tote-canvas':            { productId: '84',    variantId: '1857'  }, // Canvas tote
  'phone-case-iphone':      { productId: '181',   variantId: '4451'  }, // iPhone snap case (15 base; user picks model in PF UI)
};

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

  if (!(file instanceof File) && !(file instanceof Blob)) {
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
  try { metadata = JSON.parse(metadataRaw); } catch {}

  // 1) Stash the PNG in R2 and surface it via a public-readable URL.
  const fileKey = `prints/${crypto.randomUUID()}.png`;
  const fileBytes = await file.arrayBuffer();
  await env.PRINTS_BUCKET.put(fileKey, fileBytes, {
    httpMetadata: { contentType: 'image/png' },
  });

  // Public read URL from R2's bound zone. Jose will configure a public
  // bucket subdomain like cdn.trainerscodex.com → trainerscodex-prints in
  // Cloudflare; the env var PRINTS_PUBLIC_BASE override lives in wrangler.toml.
  const printsBase = (env as unknown as { PRINTS_PUBLIC_BASE?: string }).PRINTS_PUBLIC_BASE
    || 'https://cdn.trainerscodex.com';
  const designUrl = `${printsBase}/${fileKey}`;

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

async function pfFetch<T>(env: Env, method: string, path: string, qs?: Record<string, string>, body?: string): Promise<T> {
  const headers: HeadersInit = {
    'authorization': `Bearer ${env.PRINTFUL_API_KEY}`,
    'x-pf-store-id': env.PRINTFUL_STORE_ID,
  };
  if (body) (headers as Record<string, string>)['content-type'] = 'application/json';

  let url = `${PRINTFUL_API}${path}`;
  if (qs) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, v);
    url = u.toString();
  }
  const resp = await fetch(url, { method, headers, body });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`printful_${resp.status}: ${text.slice(0, 200)}`);
  }
  return await resp.json() as T;
}

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
const TRADEMARK_RE: RegExp[] = [
  /\bpok[ée]mons?\b/gi,
  /\bpok[ée]\s?balls?\b/gi,
  /\bpok[ée](?![a-z])/gi,
];

function stripTrademark(raw: string): string {
  let out = raw;
  for (const re of TRADEMARK_RE) out = out.replace(re, ' ');
  return out.replace(/[·|,/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

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

const BASE_COST_USD: Record<string, number> = {
  'tshirt-bella-3001':      8.95,
  'tshirt-gildan-64000':    6.50,
  'hoodie-gildan-18500':   22.50,
  'crewneck-gildan-18000': 18.50,
  'mug-11oz-white':         4.50,
  'mousepad-small':         7.95,
  'mousepad-xl-desk':      18.00,
  'sticker-die-cut':        1.50,
  'poster-11x14':           4.50,
  'poster-18x24':          11.95,
  'tote-canvas':           12.50,
  'phone-case-iphone':     11.95,
};
