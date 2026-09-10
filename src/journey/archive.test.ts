import { describe, expect, it } from 'vitest';
import { archiveSize, dateForIssue, listArchive } from './archive';
import { DAILY_EPOCH, addDays, dailyIssueNumber, dailySeed } from './prng';

describe('the daily archive', () => {
  it('lists newest first and stops at launch', () => {
    // Day 5 of the daily: five issues exist, and there is no issue 0.
    const today = addDays(DAILY_EPOCH, 4);
    const list = listArchive({ today, limit: 100 });
    expect(list.length).toBe(5);
    expect(list[0].date).toBe(today);
    expect(list[0].issue).toBe(5);
    expect(list[list.length - 1].date).toBe(DAILY_EPOCH);
    expect(list[list.length - 1].issue).toBe(1);
    for (const e of list) expect(e.issue).toBeGreaterThan(0);
  });

  it('marks exactly one entry as today', () => {
    const today = addDays(DAILY_EPOCH, 20);
    const list = listArchive({ today });
    expect(list.filter(e => e.today).length).toBe(1);
    expect(list.find(e => e.today)?.date).toBe(today);
  });

  it('is bounded, because the list grows by one a day forever', () => {
    // Two years in, an unbounded render would mount 700+ rows into a dialog.
    const today = addDays(DAILY_EPOCH, 700);
    expect(listArchive({ today, limit: 60 }).length).toBe(60);
    // And the cap is enforced even when a caller asks for more.
    expect(listArchive({ today, limit: 10_000 }).length).toBeLessThanOrEqual(400);
  });

  it('every entry carries the same seed the live daily would use', () => {
    // This is the whole promise of an archive: issue N is the puzzle everyone
    // played on day N, not a re-roll.
    const today = addDays(DAILY_EPOCH, 30);
    for (const e of listArchive({ today })) {
      expect(e.seed).toBe(dailySeed(e.date));
      expect(e.issue).toBe(dailyIssueNumber(e.date));
    }
  });

  it('reports which issues the player has completed', () => {
    const today = addDays(DAILY_EPOCH, 5);
    const playedDates = [DAILY_EPOCH, addDays(DAILY_EPOCH, 2)];
    const list = listArchive({ today, playedDates });
    expect(list.filter(e => e.played).map(e => e.date).sort()).toEqual([...playedDates].sort());
  });

  it('a bad today fails soft to an empty list rather than throwing', () => {
    expect(listArchive({ today: 'not-a-date' })).toEqual([]);
  });

  it('archiveSize is 1 on launch day and never negative before it', () => {
    expect(archiveSize(DAILY_EPOCH)).toBe(1);
    expect(archiveSize(addDays(DAILY_EPOCH, 9))).toBe(10);
    expect(archiveSize(addDays(DAILY_EPOCH, -3))).toBe(0);
  });

  it('dateForIssue inverts dailyIssueNumber exactly', () => {
    const today = addDays(DAILY_EPOCH, 50);
    for (let issue = 1; issue <= 51; issue++) {
      const date = dateForIssue(issue, today);
      expect(date, `issue ${issue} should resolve`).not.toBeNull();
      expect(dailyIssueNumber(date!)).toBe(issue);
    }
  });

  it('dateForIssue refuses issues that do not exist yet', () => {
    const today = addDays(DAILY_EPOCH, 10);
    // 11 issues exist; 12 is the future and 0 / -1 / 1.5 are not issues.
    expect(dateForIssue(12, today)).toBeNull();
    expect(dateForIssue(0, today)).toBeNull();
    expect(dateForIssue(-1, today)).toBeNull();
    expect(dateForIssue(1.5, today)).toBeNull();
  });
});
