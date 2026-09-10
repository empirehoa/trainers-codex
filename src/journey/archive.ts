// The Daily archive — past issues, replayable.
//
// Two jobs, and the second is the one that pays for it:
//
//   1. RETENTION. A player who finds the daily on day 40 currently has one
//      puzzle available and 39 they can never see. Every daily game that
//      keeps players long-term lets them go back.
//   2. DISTRIBUTION. `trainerscodex.com` ranks for one keyword (Semrush, Aug
//      2026: 1 keyword at position 73, Authority Score 2). The archive is an
//      indexable surface that grows by one page a day on its own — which is
//      exactly the problem the competitive intel says we have.
//
// Everything here is derived from the date. No storage, no server, no list to
// keep in sync: issue N always maps to the same seed, forever, on any device.

import { addDays, DAILY_EPOCH, dailyIssueNumber, dailySeed, isValidDateString, localDateString } from './prng';

export interface ArchiveEntry {
  /** Local calendar date, 'YYYY-MM-DD'. */
  date: string;
  /** Issue number, 1-indexed from DAILY_EPOCH. */
  issue: number;
  /** The seed that date's daily runs on. */
  seed: number;
  /** True for the issue currently live. */
  today: boolean;
  /** True if the player has a recorded completion for that date. */
  played: boolean;
}

/**
 * Past issues, newest first.
 *
 * Bounded by `limit` because the list grows by one every day and an unbounded
 * render would eventually mount thousands of rows into a dialog — the same
 * windowing mistake the 1,307-card browse grid already made once.
 */
export function listArchive(opts: {
  today?: string;
  playedDates?: readonly string[];
  limit?: number;
} = {}): ArchiveEntry[] {
  const today = opts.today ?? localDateString();
  if (!isValidDateString(today)) return [];
  const played = new Set(opts.playedDates ?? []);
  const limit = Math.max(1, Math.min(400, opts.limit ?? 60));

  const out: ArchiveEntry[] = [];
  let cursor = today;
  for (let i = 0; i < limit; i++) {
    const issue = dailyIssueNumber(cursor);
    // Never walk back past launch — issue 0 and negatives are not issues.
    if (issue < 1) break;
    out.push({
      date: cursor,
      issue,
      seed: dailySeed(cursor),
      today: cursor === today,
      played: played.has(cursor),
    });
    cursor = addDays(cursor, -1);
  }
  return out;
}

/** How many issues exist as of `today`. */
export function archiveSize(today = localDateString()): number {
  return Math.max(0, dailyIssueNumber(today));
}

/**
 * The date an issue number belongs to, or null when it is out of range.
 *
 * Inverse of `dailyIssueNumber`, so a `?issue=` link resolves without a lookup
 * table. Guards the future: issue 900 on day 40 is not a puzzle, it is a typo.
 */
export function dateForIssue(issue: number, today = localDateString()): string | null {
  if (!Number.isInteger(issue) || issue < 1) return null;
  if (issue > archiveSize(today)) return null;
  return addDays(DAILY_EPOCH, issue - 1);
}
