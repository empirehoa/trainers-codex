// `?q=` — the bridge from the static reference pages into the builder.
//
// Every page under /pokemon/<slug> ends with a link to `/?q=<Display Name>`.
// Reading it here means a visitor who arrived from a search for "gengar
// weaknesses" lands in the app with Gengar already filtered, instead of on an
// empty grid of 1,307 cards with no idea what to do next.
//
// Kept separate from journey/deeplink.ts: that module owns the run-sharing
// params (?seed, ?daily, ?issue) and has its own local-date and origin
// handling. This is one string with no state attached to it.

/** Longer than any dex name; anything past this is not a search, it's a payload. */
const MAX_LENGTH = 64;

/**
 * Parse a `?q=` value into an initial search string.
 *
 * Returns `''` for anything absent, blank, or implausible so the caller can use
 * it directly as `useState`'s initial value with no null-checking.
 */
export function parseSearchParam(search: string): string {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return '';
  }
  const raw = params.get('q');
  if (!raw) return '';
  const trimmed = raw.trim().slice(0, MAX_LENGTH);
  return trimmed;
}

/**
 * Lazy initialiser for the builder's search box.
 *
 * Guarded for a non-browser context because this module is imported from
 * App.tsx, which the vitest suite loads without a `window`.
 */
export function initialSearchQuery(): string {
  if (typeof window === 'undefined') return '';
  return parseSearchParam(window.location.search);
}
