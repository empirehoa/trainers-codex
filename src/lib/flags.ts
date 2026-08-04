// Feature flags.
//
// Three layers, last one wins:
//   1. FLAG_DEFAULTS below — what ships in bundle.html.
//   2. window.TRAINERS_CODEX_CONFIG.flags — per-deploy override, set in the
//      host page's <script> block alongside supabase/worker config. This is
//      how a Cloudflare Pages deploy turns a flag on without a rebuild.
//   3. ?ff=FLAG_NAME:0|1 in the query string — per-session override, comma
//      separated. Exists so QA (and the Puppeteer suite) can exercise both
//      sides of a flag without editing the bundle.
//
// Flags are read at call time, not cached, so a test can mutate
// window.TRAINERS_CODEX_CONFIG and re-render without a reload.

export type FeatureFlag =
  // Whole Journey Mode feature — the setup screen, sim, and Legend Card.
  | 'JOURNEY_MODE'
  // "Print your Legend Card" CTA on the Journey result screen. Stays OFF
  // until (a) the R2 → Printful pipeline is verified end-to-end and (b) IP
  // counsel signs off on selling silhouette merch. See docs/JOURNEY_MODE.md.
  | 'JOURNEY_MERCH_CTA'
  // Species names in Journey flavor text and on the Legend Card. Flipping
  // this OFF degrades every flavor string to type/role descriptors
  // ("your Fire-type ace") without touching the engine. It is the lever for
  // a narrowed counsel opinion — see docs/JOURNEY_MODE.md § IP degradation.
  | 'JOURNEY_SPECIES_FLAVOR';

const FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  JOURNEY_MODE: true,
  JOURNEY_MERCH_CTA: false,
  JOURNEY_SPECIES_FLAVOR: true,
};

function readConfigFlags(): Partial<Record<FeatureFlag, boolean>> {
  const cfg = typeof window !== 'undefined' ? window.TRAINERS_CODEX_CONFIG : undefined;
  return cfg?.flags ?? {};
}

function readUrlFlags(): Partial<Record<FeatureFlag, boolean>> {
  if (typeof window === 'undefined') return {};
  const raw = new URLSearchParams(window.location.search).get('ff');
  if (!raw) return {};
  const out: Partial<Record<FeatureFlag, boolean>> = {};
  for (const pair of raw.split(',')) {
    const [name, value] = pair.split(':');
    const key = name?.trim().toUpperCase() as FeatureFlag;
    if (key in FLAG_DEFAULTS) out[key] = value !== '0' && value !== 'false';
  }
  return out;
}

export function isEnabled(flag: FeatureFlag): boolean {
  const url = readUrlFlags();
  if (flag in url) return url[flag]!;
  const cfg = readConfigFlags();
  if (flag in cfg) return cfg[flag]!;
  return FLAG_DEFAULTS[flag];
}

/** All flags with their effective values — used by the help dialog + tests. */
export function allFlags(): Record<FeatureFlag, boolean> {
  const keys = Object.keys(FLAG_DEFAULTS) as FeatureFlag[];
  return keys.reduce((acc, k) => {
    acc[k] = isEnabled(k);
    return acc;
  }, {} as Record<FeatureFlag, boolean>);
}
