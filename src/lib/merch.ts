// Print-on-demand catalog for Trainer's Codex Merch Studio.
// Base costs sourced from Printful + Printify public pricing (June 2026).
// Markups follow the industry standard for branded fan-merch on POD platforms.
// All prices in USD.

import type { ArtStyle } from './constants';

export type MerchVendor = 'printful' | 'printify' | 'gelato' | 'stickermule' | 'custom';

export type MerchCategory = 'apparel' | 'mug' | 'mousepad' | 'sticker' | 'poster' | 'tote' | 'phone-case';

export interface MerchProduct {
  id: string;
  label: string;
  category: MerchCategory;
  // Aspect ratio + dimensions of the *printable area* — used for canvas sizing
  printWidth: number;   // px at 300 DPI
  printHeight: number;
  baseCostUSD: number;
  defaultRetailUSD: number;
  // Best art-style fits for this product (used for "recommended" UI)
  bestStyles: ArtStyle[];
  // Recommended POD vendor + their internal product code (for direct linking)
  vendor: MerchVendor;
  vendorProductCode: string;
  // Short marketing blurb
  blurb: string;
  // Mockup PNG path (built-in stock mockup, optional)
  mockup?: string;
}

/**
 * Standard print-area dimensions at 300 DPI:
 *  - Adult T-shirt front: 12×16 inches = 3600×4800 px
 *  - Adult Hoodie front: 12×16 inches = 3600×4800 px
 *  - 11oz mug: 8.5×3.5 inches = 2550×1050 px (we generate 1:1 wrap and let POD slice)
 *  - Mousepad small: 9×7.5 inches = 2700×2250 px (with bleed: 2772×2310)
 *  - Mousepad XL: 36×16 inches = 10800×4800 px
 *  - Vinyl sticker: 4×4 inches = 1200×1200 px
 *  - Poster 11×14: 3300×4200 px
 *  - Poster 18×24: 5400×7200 px
 *  - Tote bag: 14×16 inches = 4200×4800 px
 *  - Phone case (iPhone 15): 6×3 inches = 1800×900 px
 */
export const MERCH_PRODUCTS: MerchProduct[] = [
  // ============ APPAREL ============
  {
    id: 'tshirt-bella-3001',
    label: 'Bella+Canvas Unisex T-Shirt',
    category: 'apparel',
    printWidth: 3600,
    printHeight: 4800,
    baseCostUSD: 8.95,
    defaultRetailUSD: 24.99,
    bestStyles: ['holo-foil', 'manifest', 'pixel-crt', 'blueprint', 'type-collage'],
    vendor: 'printful',
    vendorProductCode: '71',
    blurb: 'Premium ringspun cotton · prints crisply, fits true to size. The default starter SKU.',
  },
  {
    id: 'tshirt-gildan-64000',
    label: 'Gildan Heavy Cotton Tee',
    category: 'apparel',
    printWidth: 3600,
    printHeight: 4800,
    baseCostUSD: 6.50,
    defaultRetailUSD: 19.99,
    bestStyles: ['holo-foil', 'pixel-crt', 'type-collage', 'gameboy-mono'],
    vendor: 'printful',
    vendorProductCode: '162',
    blurb: 'Budget-friendly classic-fit tee · best margin for volume drops.',
  },
  {
    id: 'hoodie-gildan-18500',
    label: 'Gildan Heavy Blend Hoodie',
    category: 'apparel',
    printWidth: 3600,
    printHeight: 4800,
    baseCostUSD: 22.50,
    defaultRetailUSD: 49.99,
    bestStyles: ['holo-foil', 'manifest', 'grainy-cinema', 'arcade-cabinet'],
    vendor: 'printful',
    vendorProductCode: '146',
    blurb: 'Cozy 50/50 cotton-poly blend. The "Champion League" upsell — best AOV.',
  },
  {
    id: 'crewneck-gildan-18000',
    label: 'Gildan Crewneck Sweatshirt',
    category: 'apparel',
    printWidth: 3600,
    printHeight: 4800,
    baseCostUSD: 18.50,
    defaultRetailUSD: 42.99,
    bestStyles: ['manifest', 'grainy-cinema', 'pixel-crt', 'blueprint'],
    vendor: 'printful',
    vendorProductCode: '145',
    blurb: 'Heavyweight unisex crewneck — sells well for the "vintage gym jacket" aesthetic.',
  },
  // ============ DRINKWARE ============
  {
    id: 'mug-11oz-white',
    label: '11oz Ceramic Mug',
    category: 'mug',
    printWidth: 2550,
    printHeight: 1050,
    baseCostUSD: 4.50,
    defaultRetailUSD: 14.99,
    bestStyles: ['pixel-grid', 'gameboy-mono', 'blueprint', 'type-collage'],
    vendor: 'printful',
    vendorProductCode: '19',
    blurb: 'Classic dishwasher-safe mug · the desk-mate impulse buy.',
  },
  // ============ DESK / GAMING ============
  {
    id: 'mousepad-small',
    label: 'Gaming Mouse Pad (Small)',
    category: 'mousepad',
    printWidth: 2700,
    printHeight: 2250,
    baseCostUSD: 7.95,
    defaultRetailUSD: 21.99,
    bestStyles: ['pixel-crt', 'pixel-grid', 'blueprint', 'gameboy-mono'],
    vendor: 'printful',
    vendorProductCode: '643',
    blurb: '9"×7.5" gaming mousepad · perfect for the CRT or Pixel Grid styles.',
  },
  {
    id: 'mousepad-xl-desk',
    label: 'XL Desk Mat 36"×16"',
    category: 'mousepad',
    printWidth: 10800,
    printHeight: 4800,
    baseCostUSD: 18.00,
    defaultRetailUSD: 44.99,
    bestStyles: ['pixel-crt', 'pixel-grid', 'blueprint', 'manifest'],
    vendor: 'printful',
    vendorProductCode: '14026',
    blurb: 'Full-desk extended mouse pad · prime real estate for a banner team layout.',
  },
  // ============ STICKERS / PRINT ============
  {
    id: 'sticker-die-cut',
    label: 'Die-Cut Vinyl Sticker (4")',
    category: 'sticker',
    printWidth: 1200,
    printHeight: 1200,
    baseCostUSD: 1.50,
    defaultRetailUSD: 5.99,
    bestStyles: ['sticker-sheet', 'type-collage', 'pixel-crt', 'gameboy-mono'],
    vendor: 'stickermule',
    vendorProductCode: 'die-cut-sticker',
    blurb: 'Glossy vinyl die-cut sticker · the impulse upsell. Order in singles or packs.',
  },
  {
    id: 'poster-11x14',
    label: 'Poster 11"×14"',
    category: 'poster',
    printWidth: 3300,
    printHeight: 4200,
    baseCostUSD: 4.50,
    defaultRetailUSD: 18.99,
    bestStyles: ['manifest', 'holo-foil', 'manifest', 'grainy-cinema', 'blueprint'],
    vendor: 'printful',
    vendorProductCode: '171',
    blurb: 'Matte poster on heavyweight paper · the wall-art SKU.',
  },
  {
    id: 'poster-18x24',
    label: 'Poster 18"×24"',
    category: 'poster',
    printWidth: 5400,
    printHeight: 7200,
    baseCostUSD: 11.95,
    defaultRetailUSD: 34.99,
    bestStyles: ['manifest', 'holo-foil', 'manifest', 'grainy-cinema'],
    vendor: 'printful',
    vendorProductCode: '173',
    blurb: 'Statement size · the "I will frame this" SKU. Highest unit margin.',
  },
  // ============ EXTRAS ============
  {
    id: 'tote-canvas',
    label: 'Canvas Tote Bag',
    category: 'tote',
    printWidth: 4200,
    printHeight: 4800,
    baseCostUSD: 12.50,
    defaultRetailUSD: 27.99,
    bestStyles: ['type-collage', 'manifest', 'gameboy-mono', 'sticker-sheet'],
    vendor: 'printful',
    vendorProductCode: '84',
    blurb: 'Heavyweight cotton canvas tote · great surface for the Type Collage zine style.',
  },
  {
    id: 'phone-case-iphone',
    label: 'Phone Case (iPhone)',
    category: 'phone-case',
    printWidth: 1800,
    printHeight: 3600,
    baseCostUSD: 11.95,
    defaultRetailUSD: 29.99,
    bestStyles: ['holo-foil', 'pixel-crt', 'type-collage', 'sticker-sheet'],
    vendor: 'printful',
    vendorProductCode: '181',
    blurb: 'iPhone snap case · the everyday accessory. Holo Foil sells best here.',
  },
];

// Predefined catchphrase overlay templates the trainer can stamp on apparel.
// These are designed to be timeless / non-trademark-infringing.
export const MERCH_SLOGANS: { id: string; label: string; text: string }[] = [
  { id: 'gym-leader',    label: 'Gym Leader',    text: 'GYM LEADER' },
  { id: 'champion',      label: 'Champion',      text: 'REGIONAL CHAMPION' },
  { id: 'elite-four',    label: 'Elite Four',    text: 'ELITE FOUR' },
  { id: 'master',        label: 'Master',        text: 'TRAINER MASTER' },
  { id: 'collector',     label: 'Collector',     text: 'CARD COLLECTOR' },
  { id: 'breeder',       label: 'Breeder',       text: 'CERTIFIED BREEDER' },
  { id: 'researcher',    label: 'Researcher',    text: 'FIELD RESEARCHER' },
  { id: 'ranger',        label: 'Ranger',        text: 'PARK RANGER' },
  { id: 'rocket',        label: 'Rocket',        text: 'TEAM TROUBLE' },        // generic non-IP
  { id: 'team-six',      label: 'Team Six',      text: 'TEAM OF SIX' },
  { id: 'all-mine',      label: 'All Mine',      text: 'GOTTA TRAIN \'EM ALL' },
  { id: 'forever',       label: 'Forever',       text: 'TRAINER FOR LIFE' },
];

/**
 * Open the vendor's "create your own" design maker as the FALLBACK order path.
 *
 * The public POD maker pages do NOT accept a design through a query string — the
 * artwork has to be uploaded in their UI — so we deliberately do not append a
 * `design_url` param (an earlier version passed a process-local `blob:` URL,
 * which is dead the moment it leaves the tab and produced broken links). The
 * caller (`MerchStudioDialog.handleOrder`) has already downloaded the print-ready
 * PNG for the user to drop onto the uploader.
 *
 * The real one-click flow runs server-side via `submitPrintfulOrder` (uploads the
 * PNG, creates a Printful sync product, returns a dashboard URL) and never reaches
 * this fallback. This path only fires on self-host deploys or when that API call
 * fails. `designPngUrl` is still honored for the `custom` self-hosted-CDN case.
 */
export function buildVendorOrderUrl(product: MerchProduct, designPngUrl: string): string {
  switch (product.vendor) {
    case 'printful':
      return 'https://www.printful.com/custom-products';
    case 'printify':
      return 'https://printify.com/app/products';
    case 'gelato':
      return 'https://www.gelato.com/products';
    case 'stickermule':
      return 'https://www.stickermule.com/products/custom-stickers';
    default:
      return designPngUrl;
  }
}

/**
 * Compute the suggested retail at a given markup over the base cost.
 * Used by the UI to let the trainer choose a price point (15%, 50%, 100%, 150% markup).
 */
export function computeRetail(baseCost: number, markupPct: number): number {
  return Math.round((baseCost * (1 + markupPct / 100)) * 100) / 100;
}

/**
 * The BUYER-checkout retail: base cost marked up, rounded UP to the next .99.
 * This must stay byte-identical to `computeRetailUsd` in worker/src/merch.ts —
 * the Worker prices authoritatively and returns 409 `price_mismatch` when the
 * number the buyer saw drifts from it, so the client has to display the same
 * math. `worker/test/pricing-parity.test.ts` pins the two together.
 */
export function computeRetail99(baseCost: number, markupPct: number): number {
  const raw = baseCost * (1 + markupPct / 100);
  const dollars = Math.floor(raw);
  const retail = raw <= dollars + 0.99 ? dollars + 0.99 : dollars + 1.99;
  return Math.round(retail * 100) / 100;
}

export const MARKUP_OPTIONS = [
  { label: 'fair',    pct: 50,  desc: 'low-margin, high-volume' },
  { label: 'pro',     pct: 100, desc: 'standard POD markup' },
  { label: 'premium', pct: 150, desc: 'collector pricing' },
];

// ============================================================
// Legal bright-line: store-listing title sanitizer
// ============================================================
// The legal line (CLAUDE.md): public store listings must never carry the
// "Pokémon" trademark or any species name. User-supplied fragments (team
// name, gym name) flow into the Printful product title, so they pass through
// here first. In-app reference art is fine; a public commercial *listing* is
// not. This mirrors the server-side strip in worker/src/printful.ts.

const TRADEMARK_RE: RegExp[] = [
  /\bpok[ée]mons?\b/gi,
  /\bpok[ée]\s?balls?\b/gi,
  // Bare "Poké"/"Poke": a trailing \b can't anchor after the accented "é"
  // (é is non-word in ASCII regex), so assert "not followed by a letter".
  /\bpok[ée](?![a-z])/gi,
];

function stripWord(haystack: string, word: string): string {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return haystack.replace(new RegExp(`\\b${esc}\\b`, 'gi'), ' ');
}

/**
 * Remove the Pokémon trademark and any provided species name from a string
 * destined for a public store listing. Word-boundary + case-insensitive.
 * Collapses leftover separators/whitespace. Returns '' when nothing survives —
 * callers should fall back to a generic label.
 */
export function sanitizeListingTitle(raw: string | null | undefined, speciesNames: Iterable<string> = []): string {
  if (!raw) return '';
  let out = String(raw);
  for (const re of TRADEMARK_RE) out = out.replace(re, ' ');
  for (const name of speciesNames) {
    if (name && name.length >= 3) out = stripWord(out, name);
  }
  // Collapse leftover join separators (·, |, comma, slash) into spaces, but
  // keep in-word hyphens/underscores so "T-Shirt" survives intact.
  return out.replace(/[·|,/]+/g, ' ').replace(/\s+/g, ' ').trim();
}
