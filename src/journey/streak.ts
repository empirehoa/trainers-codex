// Daily Journey streak tracking. Local-only, no account, no server.
//
// ── Why this stores DATE STRINGS, not timestamps ─────────────────────────
// A streak stored as epoch milliseconds breaks in three ways that all show up
// in real usage:
//
//   * DST. The gap between two consecutive local midnights is 23 or 25 hours
//     twice a year, so "did >24h pass?" arithmetic drops or double-counts a day.
//   * Travel. Fly Tokyo → Los Angeles and the same instant is a different
//     calendar day; a timestamp comparison can credit two plays for one day, or
//     none for two.
//   * Clock changes. Any manual clock adjustment corrupts the history
//     permanently rather than just for the day it happened.
//
// Comparing 'YYYY-MM-DD' strings in local calendar space sidesteps all three:
// the only question ever asked is "is this a different calendar day than the
// last one, and is it exactly one day later?" — which is DST-agnostic because
// it never measures elapsed time at all.

import { addDays, isValidDateString, localDateString } from './prng';

const STREAK_KEY = 'trainerscodex.journey.streak';

export interface StreakState {
  /** Completed local dates, ascending, deduplicated. */
  playedDates: string[];
  /** Longest run of consecutive days ever achieved. */
  bestStreak: number;
  /**
   * Repairs used, as the local dates they patched.
   *
   * Every daily game loses users permanently at the first broken streak, and
   * none of the ones surveyed offers a way back. One free repair is the cheapest
   * retention mechanic available here, and — per the Fallen London model of
   * selling rate rather than power — it is a clean non-power Premium SKU later:
   * it buys back a day, never an advantage.
   *
   * Stored as the patched dates rather than a counter so the history stays
   * self-describing and `longestRun` needs no special case.
   */
  repairsUsed?: string[];
}

/** Free repairs granted, ever. Not per week — one, so it stays a real choice. */
export const FREE_REPAIRS = 1;

const EMPTY: StreakState = { playedDates: [], bestStreak: 0, repairsUsed: [] };

export function loadStreak(): StreakState {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<StreakState>;
    const playedDates = Array.isArray(parsed.playedDates)
      ? [...new Set(parsed.playedDates.filter(isValidDateString))].sort()
      : [];
    const bestStreak = typeof parsed.bestStreak === 'number' && parsed.bestStreak >= 0
      ? Math.floor(parsed.bestStreak)
      : 0;
    const repairsUsed = Array.isArray(parsed.repairsUsed)
      ? [...new Set(parsed.repairsUsed.filter(isValidDateString))].sort()
      : [];
    // Recompute best from history rather than trusting the stored number —
    // cheap, and it self-heals a corrupted or hand-edited value.
    return {
      playedDates,
      bestStreak: Math.max(bestStreak, longestRun(playedDates)),
      repairsUsed,
    };
  } catch {
    return EMPTY;
  }
}

function saveStreak(state: StreakState): void {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(state));
  } catch { /* quota or private mode — a lost streak must not break the game */ }
}

/** Longest consecutive-day run inside a sorted, deduplicated date list. */
export function longestRun(dates: string[]): number {
  if (dates.length === 0) return 0;
  let best = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] === addDays(dates[i - 1], 1)) current++;
    else current = 1;
    if (current > best) best = current;
  }
  return best;
}

/**
 * Current streak as of `today`.
 *
 * Counts back from today if today was played, otherwise from yesterday — so a
 * streak isn't reported as broken before the day is over. Missing a full day
 * resets it to 0.
 */
export function currentStreak(state: StreakState, today = localDateString()): number {
  const played = new Set(state.playedDates);
  const anchor = played.has(today) ? today : addDays(today, -1);
  if (!played.has(anchor)) return 0;

  let streak = 0;
  let cursor = anchor;
  while (played.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function hasPlayedToday(state: StreakState, today = localDateString()): boolean {
  return state.playedDates.includes(today);
}

/**
 * Record a completed Daily run.
 *
 * Idempotent per calendar day: playing the daily twice on the same date counts
 * once, so a replay can't inflate a streak.
 */
export function recordDailyPlay(dateStr = localDateString()): StreakState {
  const state = loadStreak();
  if (!isValidDateString(dateStr) || state.playedDates.includes(dateStr)) return state;

  const playedDates = [...state.playedDates, dateStr].sort();
  const next: StreakState = {
    playedDates,
    bestStreak: Math.max(state.bestStreak, longestRun(playedDates)),
    repairsUsed: state.repairsUsed ?? [],
  };
  saveStreak(next);
  return next;
}

// ============================================================
// STREAK REPAIR
// ============================================================

/**
 * The single missed day that a repair would bridge, or null.
 *
 * Only ever ONE day, and only a day that actually rejoins two played stretches
 * — a repair mends a streak, it does not extend one. Concretely: the gap must
 * be exactly one day wide, with a played day on both sides.
 *
 * `today` is excluded deliberately. Today is not missed until it is over, and
 * offering to repair it would sell the player something they can still earn.
 */
export function repairableDate(
  state: StreakState,
  today = localDateString(),
): string | null {
  if ((state.repairsUsed?.length ?? 0) >= FREE_REPAIRS) return null;
  const played = new Set(state.playedDates);
  if (played.size < 2) return null;

  // Walk back from the most recent played day. The interesting gap is the one
  // closest to now, because that is the streak the player is actually losing.
  const sorted = [...state.playedDates].sort();
  for (let i = sorted.length - 1; i > 0; i--) {
    const later = sorted[i];
    const earlier = sorted[i - 1];
    const missed = addDays(earlier, 1);
    // Exactly one day wide: earlier + 1 === missed, missed + 1 === later.
    if (missed !== later && addDays(missed, 1) === later && missed !== today) {
      return missed;
    }
  }
  return null;
}

/** Repairs available right now. */
export function repairsRemaining(state: StreakState): number {
  return Math.max(0, FREE_REPAIRS - (state.repairsUsed?.length ?? 0));
}

/**
 * Spend a repair on `dateStr`, bridging a one-day gap.
 *
 * Returns the new state unchanged when the repair is not legal, so a caller can
 * fire this without pre-validating and never corrupt a history. The repaired day
 * is recorded in BOTH `playedDates` (so the streak maths needs no special case)
 * and `repairsUsed` (so the cost is spent and auditable).
 */
export function repairStreak(
  dateStr: string,
  today = localDateString(),
): StreakState {
  const state = loadStreak();
  if (repairsRemaining(state) <= 0) return state;
  if (!isValidDateString(dateStr) || dateStr === today) return state;
  // Must be the gap the caller thinks it is — never trust a passed-in date.
  if (repairableDate(state, today) !== dateStr) return state;

  const playedDates = [...state.playedDates, dateStr].sort();
  const next: StreakState = {
    playedDates,
    bestStreak: Math.max(state.bestStreak, longestRun(playedDates)),
    repairsUsed: [...(state.repairsUsed ?? []), dateStr].sort(),
  };
  saveStreak(next);
  return next;
}

/** Test/debug affordance — also the escape hatch if a user's history corrupts. */
export function clearStreak(): void {
  try { localStorage.removeItem(STREAK_KEY); } catch { /* nothing to clear if storage is denied */ }
}
