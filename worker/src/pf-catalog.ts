// Printful catalog + shared POD helpers — a LEAF module.
//
// Everything here is shared between the seller-side sync-product route
// (printful.ts) and the buyer-side paid checkout (merch.ts). It lives in its
// own module for two reasons: (1) neither route should import the other, and
// (2) this file's only ./index import is type-only, so Node's type stripping
// can load it directly in node:test suites (CLAUDE.md gotcha 42).
//
// THE single source of truth for base costs. src/lib/merch.ts in the app
// bundle carries the same numbers for display; worker/test/pricing-parity
// asserts the two tables agree so they cannot drift apart silently.

import type { Env } from './index';

const PRINTFUL_API = 'https://api.printful.com';

export const PRINTFUL_VARIANT_MAP: Record<string, { productId: string; variantId: string }> = {
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

export const BASE_COST_USD: Record<string, number> = {
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

export function publicPrintUrl(env: Env, fileKey: string): string {
  const printsBase = (env as unknown as { PRINTS_PUBLIC_BASE?: string }).PRINTS_PUBLIC_BASE
    || 'https://cdn.trainerscodex.com';
  return `${printsBase.replace(/\/$/, '')}/${fileKey}`;
}

export async function pfFetch<T>(env: Env, method: string, path: string, qs?: Record<string, string>, body?: string): Promise<T> {
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

const TRADEMARK_RE: RegExp[] = [
  /\bpok[ée]mons?\b/gi,
  /\bpok[ée]\s?balls?\b/gi,
  /\bpok[ée](?![a-z])/gi,
];

export function stripTrademark(raw: string): string {
  let out = raw;
  for (const re of TRADEMARK_RE) out = out.replace(re, ' ');
  return out.replace(/[·|,/]+/g, ' ').replace(/\s+/g, ' ').trim();
}
