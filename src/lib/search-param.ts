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

// ---------------------------------------------------------------------------
// `#team=…&tn=…&by=…` — an INCOMING share link.
// ---------------------------------------------------------------------------

/**
 * Longest team name / sender name a share link may carry. The team-name input
 * enforces the same cap (AnalysisSheet `maxLength`), so a link can never hand
 * the recipient a name they could not have typed. Anything longer is a
 * payload, not a name — a 20 KB `tn=` used to render verbatim on the landing
 * and become the recipient's team name on "load this team".
 */
export const MAX_SHARE_NAME_LENGTH = 40;

export interface ShareHash {
  /** The raw share code (`[0-9a-z,-]+`), still to be parsed by `parseShareCode`. */
  code: string;
  teamName?: string;
  by?: string;
}

function decodeShareText(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let s: string;
  try {
    s = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  // Collapse whitespace (a name is one line) before capping, so a run of
  // spaces cannot be used to push the visible text off the landing card.
  s = s.replace(/\s+/g, ' ').trim().slice(0, MAX_SHARE_NAME_LENGTH).trim();
  return s || undefined;
}

/**
 * Pull the share code and its optional labels out of a location hash.
 * Returns `null` when the hash carries no `team=` segment.
 */
export function parseShareHash(hash: string): ShareHash | null {
  const shared = hash.match(/(?:^#|&)team=([0-9a-z,-]+)/);
  if (!shared) return null;
  const tn = hash.match(/(?:^#|&)tn=([^&]+)/);
  const by = hash.match(/(?:^#|&)by=([^&]+)/);
  return {
    code: shared[1],
    teamName: decodeShareText(tn?.[1]),
    by: decodeShareText(by?.[1]),
  };
}
