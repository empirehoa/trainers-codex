// Module-resolution hook for the worker test harness.
//
// Worker sources import each other extensionless (`./cors`, `./stripe`) —
// wrangler's bundler resolves those, but Node's native type stripping is real
// ESM and does not. This hook appends `.ts` when a sibling `.ts` file exists,
// so `node --test` can load `src/index.ts` and drive the whole router without
// touching the production sources. Registered by _harness.ts.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL
      && !/\.(ts|mts|mjs|js|json)$/.test(specifier)) {
    const candidate = new URL(specifier, context.parentURL);
    if (existsSync(fileURLToPath(candidate) + '.ts')) {
      return next(specifier + '.ts', context);
    }
  }
  return next(specifier, context);
}
