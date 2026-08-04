// Daily streak logic.
//
// The interesting cases are all calendar edge cases: DST transitions, timezone
// travel, month/year rollovers, and double-plays on one date. These are the
// tests that justify storing date strings instead of timestamps.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStreak, currentStreak, hasPlayedToday, loadStreak, longestRun, recordDailyPlay,
} from './streak';

// jsdom isn't configured for this project, so provide the minimum localStorage
// the module needs. Deliberately a real Map, not a mock — the point is to
// exercise the serialize/parse round trip.
function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  });
  return store;
}

describe('longestRun', () => {
  it('is 0 for no history', () => {
    expect(longestRun([])).toBe(0);
  });

  it('counts consecutive days', () => {
    expect(longestRun(['2026-08-01', '2026-08-02', '2026-08-03'])).toBe(3);
  });

  it('breaks on a gap and reports the longest segment', () => {
    expect(longestRun([
      '2026-08-01', '2026-08-02',          // 2
      '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08',  // 4
    ])).toBe(4);
  });

  it('spans a month boundary', () => {
    expect(longestRun(['2026-08-30', '2026-08-31', '2026-09-01'])).toBe(3);
  });

  it('spans a year boundary', () => {
    expect(longestRun(['2026-12-30', '2026-12-31', '2027-01-01'])).toBe(3);
  });

  it('spans a leap day', () => {
    expect(longestRun(['2024-02-28', '2024-02-29', '2024-03-01'])).toBe(3);
  });
});

describe('currentStreak', () => {
  const state = (dates: string[]) => ({ playedDates: dates.sort(), bestStreak: longestRun(dates) });

  it('counts back from today when today was played', () => {
    expect(currentStreak(state(['2026-08-02', '2026-08-03', '2026-08-04']), '2026-08-04')).toBe(3);
  });

  it('counts back from yesterday when today is not played yet', () => {
    // Mid-morning, before the player has done today's daily — the streak is
    // still alive and must not report as broken.
    expect(currentStreak(state(['2026-08-02', '2026-08-03']), '2026-08-04')).toBe(2);
  });

  it('resets after a full missed day', () => {
    expect(currentStreak(state(['2026-08-01', '2026-08-02']), '2026-08-05')).toBe(0);
  });

  it('is 0 with no history', () => {
    expect(currentStreak(state([]), '2026-08-04')).toBe(0);
  });

  it('ignores days after today (a clock rolled backwards)', () => {
    expect(currentStreak(state(['2026-08-10', '2026-08-11']), '2026-08-04')).toBe(0);
  });
});

describe('recordDailyPlay', () => {
  beforeEach(() => {
    installLocalStorage();
    clearStreak();
  });

  it('records a play and persists it', () => {
    recordDailyPlay('2026-08-04');
    expect(loadStreak().playedDates).toEqual(['2026-08-04']);
    expect(hasPlayedToday(loadStreak(), '2026-08-04')).toBe(true);
  });

  it('is idempotent for the same date — a replay cannot inflate a streak', () => {
    recordDailyPlay('2026-08-04');
    recordDailyPlay('2026-08-04');
    recordDailyPlay('2026-08-04');
    const s = loadStreak();
    expect(s.playedDates).toEqual(['2026-08-04']);
    expect(currentStreak(s, '2026-08-04')).toBe(1);
  });

  it('builds and tracks a best streak across a break', () => {
    for (const d of ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04']) recordDailyPlay(d);
    expect(loadStreak().bestStreak).toBe(4);
    // Skip the 5th and 6th, resume on the 7th.
    recordDailyPlay('2026-08-07');
    const s = loadStreak();
    expect(currentStreak(s, '2026-08-07')).toBe(1);
    expect(s.bestStreak).toBe(4);
  });

  it('rejects a malformed date rather than corrupting history', () => {
    recordDailyPlay('2026-08-04');
    recordDailyPlay('not-a-date');
    recordDailyPlay('2026-02-30');
    expect(loadStreak().playedDates).toEqual(['2026-08-04']);
  });

  it('stores dates out of order and reads them back sorted', () => {
    for (const d of ['2026-08-04', '2026-08-02', '2026-08-03']) recordDailyPlay(d);
    expect(loadStreak().playedDates).toEqual(['2026-08-02', '2026-08-03', '2026-08-04']);
    expect(currentStreak(loadStreak(), '2026-08-04')).toBe(3);
  });
});

describe('resilience', () => {
  it('survives a DST transition — the streak is unaffected', () => {
    installLocalStorage();
    clearStreak();
    // US DST ends 2026-11-01: the local day is 25 hours long. Elapsed-time
    // arithmetic would mis-count here; calendar-string comparison cannot.
    for (const d of ['2026-10-31', '2026-11-01', '2026-11-02']) recordDailyPlay(d);
    expect(currentStreak(loadStreak(), '2026-11-02')).toBe(3);

    clearStreak();
    // DST starts 2026-03-08: a 23-hour local day.
    for (const d of ['2026-03-07', '2026-03-08', '2026-03-09']) recordDailyPlay(d);
    expect(currentStreak(loadStreak(), '2026-03-09')).toBe(3);
  });

  it('survives timezone travel — same local date counts once', () => {
    installLocalStorage();
    clearStreak();
    // Play in Tokyo on the 4th, fly to LA, and it is still the 4th locally.
    recordDailyPlay('2026-08-04');
    recordDailyPlay('2026-08-04');
    expect(loadStreak().playedDates).toEqual(['2026-08-04']);
    // Next local day resumes the streak rather than restarting it.
    recordDailyPlay('2026-08-05');
    expect(currentStreak(loadStreak(), '2026-08-05')).toBe(2);
  });

  it('self-heals a corrupted stored payload', () => {
    const store = installLocalStorage();
    store.set('trainerscodex.journey.streak', '{ not json');
    expect(loadStreak()).toEqual({ playedDates: [], bestStreak: 0 });

    store.set('trainerscodex.journey.streak', JSON.stringify({
      playedDates: ['2026-08-01', 'garbage', null, 42, '2026-08-02'],
      bestStreak: -999,
    }));
    const s = loadStreak();
    expect(s.playedDates).toEqual(['2026-08-01', '2026-08-02']);
    // A negative stored best is recomputed from history, not trusted.
    expect(s.bestStreak).toBe(2);
  });

  it('deduplicates a stored payload containing repeats', () => {
    const store = installLocalStorage();
    store.set('trainerscodex.journey.streak', JSON.stringify({
      playedDates: ['2026-08-01', '2026-08-01', '2026-08-02'],
      bestStreak: 0,
    }));
    expect(loadStreak().playedDates).toEqual(['2026-08-01', '2026-08-02']);
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
      removeItem() { throw new Error('denied'); },
    });
    expect(() => loadStreak()).not.toThrow();
    expect(loadStreak()).toEqual({ playedDates: [], bestStreak: 0 });
    expect(() => recordDailyPlay('2026-08-04')).not.toThrow();
    expect(() => clearStreak()).not.toThrow();
  });
});
