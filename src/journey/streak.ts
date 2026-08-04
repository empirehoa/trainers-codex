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
}

const EMPTY: StreakState = { playedDates: [], bestStreak: 0 };

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
    // Recompute best from history rather than trusting the stored number —
    // cheap, and it self-heals a corrupted or hand-edited value.
    return { playedDates, bestStreak: Math.max(bestStreak, longestRun(playedDates)) };
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
  };
  saveStreak(next);
  return next;
}

/** Test/debug affordance — also the escape hatch if a user's history corrupts. */
export function clearStreak(): void {
  try { localStorage.removeItem(STREAK_KEY); } catch { /* nothing to clear if storage is denied */ }
}
