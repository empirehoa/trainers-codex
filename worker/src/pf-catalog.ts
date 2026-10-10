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
import { SPECIES_NAMES } from './species-names.ts';

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

/**
 * Server-side merch kill switch. Every path that can reach Printful or create
 * a physical-goods Checkout session checks this FIRST. Exactly '1' enables;
 * absent / '0' / anything else disables. Default "0" in wrangler.toml; flipping
 * it is owner-only (counsel gate) — see docs/SECURITY.md.
 */
export function merchEnabled(env: Env): boolean {
  return env.MERCH_CHECKOUT === '1';
}

/**
 * Prototype-safe catalog lookups. `PRINTFUL_VARIANT_MAP['__proto__']` is
 * Object.prototype — truthy — so a client-supplied product id of `__proto__`,
 * `constructor` or `toString` used to pass validation and price to NaN (audit
 * finding B-2). Every catalog read goes through these.
 */
export function catalogVariant(productId: string): { productId: string; variantId: string } | undefined {
  return Object.hasOwn(PRINTFUL_VARIANT_MAP, productId) ? PRINTFUL_VARIANT_MAP[productId] : undefined;
}

export function catalogBaseCost(productId: string): number | undefined {
  const cost = Object.hasOwn(BASE_COST_USD, productId) ? BASE_COST_USD[productId] : undefined;
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : undefined;
}

/** Human label for a design layout id; unknown ids collapse to a neutral label. */
export function designLabel(design: string): string {
  const map: Record<string, string> = {
    'crest':    'Trainer Crest',
    'roster':   'Champion Roster',
    'id-card':  'Trainer ID Card',
    'banner':   'Gym Banner',
  };
  return Object.hasOwn(map, design) ? map[design] : 'Trainer Codex';
}

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

// ── Listing-name sanitization ──────────────────────────────────────────────
//
// Legal bright line: a Stripe line-item name or a Printful product title is a
// PAID surface and must never carry the franchise trademark, the publisher
// names, or a species name — even when a stale or modified client skips its
// own strip (src/lib/merch.ts sanitizeListingTitle is the UX layer; this is
// the backstop). Matching is done on a normalized token stream so diacritics
// ("Pokèmon", "Pokémon"), spacing ("Poke mon"), casing and suffixes
// ("pokemonmasters", "Pokemon GO") cannot slip past a word-boundary regex.

/** NFD, strip combining marks, lowercase, non-alphanumerics → single spaces. */
export function normalizeListing(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Single normalized tokens that are always removed (prefix-style: pokemon*, pokeball*, pokedex*). */
const BLOCKED_TOKEN_RE = /^(poke|pokemon\w*|pokeball\w*|pokedex\w*|pokeballs?|nintendo|gamefreak|tpci)$/;

/** Multi-token phrases (normalized) that are removed as a unit. */
const BLOCKED_PHRASES = [
  'poke mon', 'poke ball', 'poke balls', 'poke dex',
  'game freak', 'creatures inc', 'creatures incorporated',
  'the pokemon company', 'pokemon company', 'pokemon go', 'pokemon masters',
  'nintendo switch',
];

const MAX_PHRASE_TOKENS = 4; // longest species display name is four words

const BLOCKED_PHRASE_SET: ReadonlySet<string> = new Set([
  ...BLOCKED_PHRASES,
  ...SPECIES_NAMES,
]);

export const GENERIC_LISTING_LABEL = 'Custom team design';

/**
 * Remove every blocked token/phrase from free text, preserving the casing and
 * order of what survives. Returns '' when nothing survives — callers decide
 * whether to omit the fragment or fall back to GENERIC_LISTING_LABEL.
 */
export function stripTrademark(raw: string): string {
  if (!raw) return '';
  // Tokenize the ORIGINAL text on non-letter/digit runs so we can keep the
  // user's casing, and normalize each token independently for matching.
  const original = raw.match(/[\p{L}\p{N}]+/gu) ?? [];
  const norm = original.map(t => normalizeListing(t)).map(t => t.replace(/ /g, ''));
  const removed = new Array<boolean>(original.length).fill(false);

  for (let n = MAX_PHRASE_TOKENS; n >= 1; n--) {
    for (let i = 0; i + n <= norm.length; i++) {
      let free = true;
      for (let j = i; j < i + n; j++) if (removed[j]) { free = false; break; }
      if (!free) continue;
      const phrase = norm.slice(i, i + n).join(' ');
      const hit = n === 1
        ? BLOCKED_TOKEN_RE.test(phrase) || BLOCKED_PHRASE_SET.has(phrase)
        : BLOCKED_PHRASE_SET.has(phrase);
      if (hit) for (let j = i; j < i + n; j++) removed[j] = true;
    }
  }
  return original.filter((_, i) => !removed[i]).join(' ').trim();
}

/** stripTrademark, failing closed to the generic label when nothing survives. */
export function safeListingLabel(raw: string | null | undefined): string {
  const out = raw ? stripTrademark(raw) : '';
  return out || GENERIC_LISTING_LABEL;
}
