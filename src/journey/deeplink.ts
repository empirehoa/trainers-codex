// Seed deep-linking — the viral link.
//
// A shared Legend Card is only half an ad. The other half is that the card's
// URL is PLAYABLE: opening it drops the recipient onto a prefilled setup screen
// running the same seed, so "beat my run" is a real invitation rather than a
// screenshot. Every share surface (Web Share text, copy-link, and the URL baked
// into the card pixels) carries this link.
//
// Route shapes:
//   /journey?seed=8843[&pace=express][&archetype=aggro][&region=kanto][&starter=4]
//   /journey?daily=2026-08-26
//
// Everything is optional and everything fails soft. A malformed seed, an
// unknown pace, a nonexistent starter id — none of them may produce an error
// screen. The worst case is a fresh random run, which is a perfectly good
// outcome for someone who just clicked a link.

import { coerceSeed, dailySeed, isValidDateString, localDateString } from './prng';
import { dateForIssue } from './archive';
import { ARCHETYPES, JOURNEY_REGIONS, PACES, getRegion } from './content';
import type { Archetype, Pace, RunSource } from './types';

/** The path Journey Mode lives at. See public/_redirects for the SPA rewrite. */
export const JOURNEY_PATH = '/journey';

export interface ParsedJourneyLink {
  seed: number | null;
  pace: Pace | null;
  archetype: Archetype | null;
  regionId: string | null;
  starterId: number | null;
  /** Set when ?daily=YYYY-MM-DD was present and valid. */
  dailyDate: string | null;
  source: RunSource;
  /**
   * True when the link carried seed/daily params that we had to reject.
   * The UI surfaces a one-line "we rolled you a fresh one" note — a quiet
   * explanation, never a blocking error.
   */
  hadInvalidParams: boolean;
  /** True when the URL path itself is the Journey route. */
  isJourneyRoute: boolean;
}

const EMPTY: ParsedJourneyLink = {
  seed: null, pace: null, archetype: null, regionId: null, starterId: null,
  dailyDate: null, source: 'fresh', hadInvalidParams: false, isJourneyRoute: false,
};

function coercePace(v: string | null): Pace | null {
  if (!v) return null;
  const found = PACES.find(p => p.id === v.toLowerCase());
  return found ? found.id : null;
}

function coerceArchetype(v: string | null): Archetype | null {
  if (!v) return null;
  const normalized = v.toLowerCase();
  return ARCHETYPES.includes(normalized as Archetype) ? (normalized as Archetype) : null;
}

function coerceRegion(v: string | null): string | null {
  if (!v) return null;
  const normalized = v.toLowerCase();
  return JOURNEY_REGIONS.some(r => r.id === normalized) ? normalized : null;
}

/** A starter is only honoured if it belongs to the region being started in. */
function coerceStarter(v: string | null, regionId: string | null): number | null {
  if (!v || !regionId) return null;
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  return getRegion(regionId).starters.includes(n) ? n : null;
}

export function parseJourneyLink(search: string, pathname = ''): ParsedJourneyLink {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return EMPTY;
  }

  const isJourneyRoute = /(^|\/)journey\/?$/.test(pathname);

  const rawDaily = params.get('daily');
  const rawSeed = params.get('seed');
  const rawIssue = params.get('issue');

  // ?issue=N — the archive's shareable form. Resolved to the date it belongs to
  // and then treated exactly like ?daily=, so an issue link and a daily link
  // for the same day are the same run. Ranked ABOVE ?daily because an issue
  // number is the more specific statement ("this puzzle", not "the puzzle").
  if (rawIssue !== null) {
    const n = Number(rawIssue);
    const date = Number.isFinite(n) ? dateForIssue(Math.trunc(n)) : null;
    if (date === null) {
      // A future or malformed issue fails soft to a fresh run, flagged — the
      // same contract every other bad param honours. Never an error screen.
      return { ...EMPTY, isJourneyRoute, hadInvalidParams: true };
    }
    return {
      ...EMPTY,
      isJourneyRoute,
      seed: dailySeed(date),
      dailyDate: date,
      source: 'daily',
      pace: coercePace(params.get('pace')),
      archetype: coerceArchetype(params.get('archetype')),
    };
  }

  // ?daily wins over ?seed — a daily link is a stronger statement of intent,
  // and a link carrying both is almost certainly a hand-edited URL.
  if (rawDaily !== null) {
    if (isValidDateString(rawDaily)) {
      return {
        ...EMPTY,
        isJourneyRoute,
        seed: dailySeed(rawDaily),
        dailyDate: rawDaily,
        source: 'daily',
        pace: coercePace(params.get('pace')),
        archetype: coerceArchetype(params.get('archetype')),
      };
    }
    // Invalid date → fall through to a fresh run, flagged.
    return { ...EMPTY, isJourneyRoute, hadInvalidParams: true };
  }

  if (rawSeed !== null) {
    const seed = coerceSeed(rawSeed);
    if (seed === null) return { ...EMPTY, isJourneyRoute, hadInvalidParams: true };
    const regionId = coerceRegion(params.get('region'));
    return {
      ...EMPTY,
      isJourneyRoute,
      seed,
      source: 'seed-link',
      pace: coercePace(params.get('pace')),
      archetype: coerceArchetype(params.get('archetype')),
      regionId,
      starterId: coerceStarter(params.get('starter'), regionId),
    };
  }

  return { ...EMPTY, isJourneyRoute };
}

/** Read the deep-link off the live URL. Safe to call outside a browser. */
export function parseCurrentJourneyLink(): ParsedJourneyLink {
  if (typeof window === 'undefined') return EMPTY;
  try {
    return parseJourneyLink(window.location.search, window.location.pathname);
  } catch {
    return EMPTY;
  }
}

export interface BuildLinkOptions {
  seed: number;
  pace?: Pace;
  archetype?: Archetype;
  regionId?: string;
  starterId?: number;
  /** Origin override — the renderers need this without a window. */
  origin?: string;
}

/**
 * The canonical public host. Used whenever the live origin isn't something a
 * recipient could actually open.
 */
export const CANONICAL_ORIGIN = 'https://trainerscodex.com';

function resolveOrigin(explicit?: string): string {
  if (explicit) return explicit.replace(/\/$/, '');
  try {
    const origin = window.location.origin;
    // Only an http(s) origin is shareable. `file://` origins (the offline
    // single-file bundle — a headline feature of this app, so a common case)
    // serialise as "file://" with no host, which would print
    // "file://journey?seed=8843" onto a card meant to be a playable
    // invitation. Opaque origins serialise as the literal "null". Neither is
    // something a recipient can open, so fall back to the canonical host.
    if (/^https?:\/\/.+/.test(origin)) return origin.replace(/\/$/, '');
    return CANONICAL_ORIGIN;
  } catch {
    // No window at all — the Legend Card renderer can be called from contexts
    // without one.
    return CANONICAL_ORIGIN;
  }
}

/** Playable link for a specific run. */
export function buildSeedLink(opts: BuildLinkOptions): string {
  const params = new URLSearchParams({ seed: String(opts.seed) });
  if (opts.pace) params.set('pace', opts.pace);
  if (opts.archetype) params.set('archetype', opts.archetype);
  if (opts.regionId) params.set('region', opts.regionId);
  if (opts.starterId !== undefined) params.set('starter', String(opts.starterId));
  return `${resolveOrigin(opts.origin)}${JOURNEY_PATH}?${params.toString()}`;
}

/** Canonical link for a Daily Journey, so friends land on the same seed. */
export function buildDailyLink(dateStr = localDateString(), origin?: string): string {
  return `${resolveOrigin(origin)}${JOURNEY_PATH}?daily=${dateStr}`;
}

/**
 * Link to an archive issue by number.
 *
 * Preferred over `buildDailyLink` for anything shared publicly: "issue 41"
 * survives being read aloud and stays meaningful in a headline, where
 * `daily=2026-10-06` does not.
 */
export function buildIssueLink(issue: number, origin?: string): string {
  return `${resolveOrigin(origin)}${JOURNEY_PATH}?issue=${issue}`;
}

/**
 * Short display form for printing on the Legend Card. The full query string
 * is unreadable at card scale, and the seed is the only part a human retypes.
 */
export function displayLink(seed: number, origin?: string): string {
  return `${resolveOrigin(origin).replace(/^https?:\/\//, '')}${JOURNEY_PATH}?seed=${seed}`;
}
