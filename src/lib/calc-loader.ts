// ============================================================
// CALC LOADER — the one place @smogon/calc is imported
// ============================================================
// @smogon/calc is 463 KB minified (22 % of the bundle) and only the matchup
// preview needs it, so it must never sit on the boot path. Every consumer goes
// through loadCalc(), which is a memoised dynamic import: Vite/rolldown emits
// the package as its own chunk, and inline.mjs embeds that chunk in
// bundle.html as an inert <script type="text/plain" data-chunk> block that a
// tiny classic script turns into a Blob URL before the module script runs.
// The product stays a single self-contained file that works from file://; the
// calc just parses on first matchup instead of on every page load.
//
// Never add a static `import ... from '@smogon/calc'` anywhere else —
// tests/test-bundle-shape.mjs asserts the entry chunk does not contain the
// calc's dex data.

export type CalcModule = typeof import('@smogon/calc');

let pending: Promise<CalcModule> | null = null;
let loaded: CalcModule | null = null;

/** Resolve the calc module, importing it on first call and reusing it after. */
export function loadCalc(): Promise<CalcModule> {
  if (!pending) {
    pending = import('@smogon/calc').then(mod => {
      loaded = mod;
      return mod;
    });
  }
  return pending;
}

/** The calc module if it has already resolved, else null. Never triggers a load. */
export function calcIfLoaded(): CalcModule | null {
  return loaded;
}
