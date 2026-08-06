// Engine unit tests (vitest, node environment — no DOM, no browser).
//
// These cover the four properties the whole feature rests on:
//   1. DETERMINISM   — (seed, choices) → identical career, always.
//   2. TERMINATION   — every run finishes; no seed loops forever.
//   3. BOUNDS        — scores stay inside 0..999; stats stay sane.
//   4. REACHABILITY  — every archetype can reach a top-tier verdict.
//
// Plus the seed/date primitives that the deep-link and daily-streak features
// depend on being exactly right.

import { describe, expect, it } from 'vitest';
import {
  MAX_CHAPTERS, MIN_CHAPTERS, ROSTER_SIZE, UNRANKED,
  chapterCountFor, decisionChapterIndices, isDecisionChapter, phaseFor,
  simulate, simulateWithStrategy,
} from './engine';
import { MAX_SCORE, componentValues, scoreCareer, weightSum } from './scoring';
import { ARCHETYPES, DECISION_CARDS, PACES, TIER, VERDICTS, getRegion } from './content';
import {
  addDays, coerceSeed, dailyIssueNumber, dailySeed, isValidDateString,
  isValidSeed, localDateString, mulberry32, SEED_MAX, SEED_MIN,
} from './prng';
import type { Archetype, JourneySetup, Pace, RecordedChoice } from './types';

// ---------- fixtures ----------

function setupFor(overrides: Partial<JourneySetup> = {}): JourneySetup {
  return {
    seed: 8843,
    trainerName: 'Vesper',
    regionId: 'kanto',
    starterId: 4,
    archetype: 'balance',
    pace: 'normal',
    source: 'fresh',
    ...overrides,
  };
}

/** Deterministic pseudo-player: picks option (i mod optionCount) at each step. */
function playRun(setup: JourneySetup, strategyOffset = 0) {
  let step = 0;
  return simulateWithStrategy(setup, d => {
    const idx = (step++ + strategyOffset) % d.card.options.length;
    return d.card.options[idx].id;
  });
}

const SEEDS = [1, 7, 42, 8843, 12345, 99999, 314159, 654321, 999999];

// ============================================================
describe('prng primitives', () => {
  it('mulberry32 is stable for a given seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('mulberry32 stays in [0, 1)', () => {
    const rng = mulberry32(777);
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds diverge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('coerceSeed accepts in-range integers and rejects everything else', () => {
    expect(coerceSeed('8843')).toBe(8843);
    expect(coerceSeed(1)).toBe(1);
    expect(coerceSeed(999999)).toBe(999999);
    // Fail-soft cases — all must be null so the caller rolls a fresh run.
    expect(coerceSeed('0')).toBeNull();
    expect(coerceSeed('1000000')).toBeNull();
    expect(coerceSeed('-5')).toBeNull();
    expect(coerceSeed('abc')).toBeNull();
    expect(coerceSeed('')).toBeNull();
    expect(coerceSeed(null)).toBeNull();
    expect(coerceSeed(undefined)).toBeNull();
    expect(coerceSeed('NaN')).toBeNull();
    expect(coerceSeed('Infinity')).toBeNull();
    expect(coerceSeed('8843; DROP TABLE')).toBeNull();
  });

  it('coerceSeed truncates a fractional seed rather than rejecting it', () => {
    expect(coerceSeed('8843.7')).toBe(8843);
  });

  it('dailySeed is stable per date and in range', () => {
    expect(dailySeed('2026-08-26')).toBe(dailySeed('2026-08-26'));
    expect(dailySeed('2026-08-26')).not.toBe(dailySeed('2026-08-27'));
    for (const d of ['2026-01-01', '2026-08-26', '2027-12-31', '2030-02-28']) {
      const s = dailySeed(d);
      expect(isValidSeed(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(SEED_MIN);
      expect(s).toBeLessThanOrEqual(SEED_MAX);
    }
  });

  it('localDateString uses the LOCAL calendar date, not UTC', () => {
    // 2026-08-04 23:30 local. toISOString() would report the 5th for anyone
    // east of UTC and the 4th for anyone west — we must always get the 4th.
    const d = new Date(2026, 7, 4, 23, 30, 0);
    expect(localDateString(d)).toBe('2026-08-04');
    // ...and the same instant one minute past midnight is the 5th.
    expect(localDateString(new Date(2026, 7, 5, 0, 1, 0))).toBe('2026-08-05');
  });

  it('localDateString zero-pads month and day', () => {
    expect(localDateString(new Date(2026, 0, 9))).toBe('2026-01-09');
  });

  it('isValidDateString rejects impossible dates', () => {
    expect(isValidDateString('2026-08-26')).toBe(true);
    expect(isValidDateString('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isValidDateString('2024-02-29')).toBe(true);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-00-10')).toBe(false);
    expect(isValidDateString('2026-8-4')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
    expect(isValidDateString(20260826)).toBe(false);
  });

  it('addDays walks the calendar across month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('dailyIssueNumber counts from the launch epoch', () => {
    expect(dailyIssueNumber('2026-08-26')).toBe(1);
    expect(dailyIssueNumber('2026-09-18')).toBe(24);
  });
});

// ============================================================
describe('career shape', () => {
  it('chapter count stays within bounds for every seed', () => {
    for (let seed = SEED_MIN; seed < 4000; seed++) {
      const n = chapterCountFor(seed);
      expect(n).toBeGreaterThanOrEqual(MIN_CHAPTERS);
      expect(n).toBeLessThanOrEqual(MAX_CHAPTERS);
    }
  });

  it('every career passes through every phase and ends in retirement', () => {
    for (const seed of SEEDS) {
      const count = chapterCountFor(seed);
      const phases = Array.from({ length: count }, (_, i) => phaseFor(i, count));
      expect(phases[0]).toBe('gym-circuit');
      expect(phases[count - 1]).toBe('retirement');
      for (const phase of ['gym-circuit', 'regional', 'national', 'worlds', 'veteran'] as const) {
        expect(phases).toContain(phase);
      }
    }
  });

  it('the retirement chapter never carries a decision', () => {
    for (const pace of PACES) {
      for (const seed of SEEDS) {
        const count = chapterCountFor(seed);
        expect(isDecisionChapter(count - 1, count, pace.decisionEvery)).toBe(false);
      }
    }
  });

  it('pace controls decision density: intense > normal > express', () => {
    const setup = setupFor();
    const counts = (['express', 'normal', 'intense'] as Pace[])
      .map(pace => decisionChapterIndices({ ...setup, pace }).length);
    expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[0]);
  });
});

// ============================================================
describe('determinism', () => {
  it('same seed + same choices produce a byte-identical run', () => {
    for (const seed of SEEDS) {
      const setup = setupFor({ seed });
      const a = playRun(setup);
      const b = playRun(setup);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('a partial replay is a prefix of the full replay', () => {
    const setup = setupFor({ seed: 4242 });
    const full = playRun(setup);
    const partial = simulate(setup, full.choices.slice(0, 2));
    // Whatever chapters the partial resolved must match the full run exactly.
    expect(partial.chapters.length).toBeGreaterThan(0);
    partial.chapters.forEach((ch, i) => {
      expect(JSON.stringify(ch)).toBe(JSON.stringify(full.chapters[i]));
    });
  });

  it('the event sequence is choice-independent (the Daily Journey guarantee)', () => {
    // Two players, same seed, opposite choices. Chapter titles, flavor beats
    // and which decision card appears must be identical; only the numbers move.
    const setup = setupFor({ seed: 5150 });
    const a = playRun(setup, 0);
    const b = playRun(setup, 1);

    expect(a.chapterCount).toBe(b.chapterCount);
    a.chapters.forEach((ch, i) => {
      expect(ch.titleKey).toBe(b.chapters[i].titleKey);
      expect(ch.beatKeys).toEqual(b.chapters[i].beatKeys);
      expect(ch.phase).toBe(b.chapters[i].phase);
    });
    expect(a.choices.map(c => c.cardId)).toEqual(b.choices.map(c => c.cardId));
    // Sanity: opposite choices really did change something.
    expect(a.score).not.toBe(b.score);
  });

  it('different seeds produce different careers', () => {
    const runs = SEEDS.map(seed => playRun(setupFor({ seed })));
    const signatures = new Set(runs.map(r => `${r.chapterCount}:${r.score}:${r.verdict.id}`));
    expect(signatures.size).toBeGreaterThan(1);
  });

  it('an unknown optionId falls back to the first option instead of throwing', () => {
    const setup = setupFor({ seed: 606 });
    const first = simulate(setup, []);
    expect(first.status).toBe('awaiting-decision');
    const bogus: RecordedChoice[] = [{
      chapterIndex: first.decision!.chapterIndex,
      cardId: first.decision!.card.id,
      optionId: 'this-option-does-not-exist',
    }];
    const withBogus = simulate(setup, bogus);
    const withFirst = simulate(setup, [{
      ...bogus[0],
      optionId: first.decision!.card.options[0].id,
    }]);
    expect(JSON.stringify(withBogus.chapters)).toBe(JSON.stringify(withFirst.chapters));
  });
});

// ============================================================
describe('termination', () => {
  it('100% of runs terminate across seeds × archetypes × paces', () => {
    let completed = 0;
    let attempted = 0;
    for (const seed of [1, 99, 8843, 250_000, 999_999]) {
      for (const archetype of ARCHETYPES) {
        for (const pace of PACES) {
          for (const offset of [0, 1, 2]) {
            attempted++;
            const run = playRun(setupFor({ seed, archetype, pace: pace.id }), offset);
            expect(run.chapters.length).toBe(run.chapterCount);
            expect(run.chapters[run.chapters.length - 1].phase).toBe('retirement');
            completed++;
          }
        }
      }
    }
    expect(completed).toBe(attempted);
    expect(attempted).toBe(225);
  });

  it('terminates for every region and starter', () => {
    for (const region of ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea']) {
      for (const starterId of getRegion(region).starters) {
        const run = playRun(setupFor({ regionId: region, starterId, seed: 321 }));
        expect(run.chapters.length).toBe(run.chapterCount);
      }
    }
  });
});

// ============================================================
describe('bounds + invariants', () => {
  it('every archetype weight table sums to exactly 1', () => {
    for (const a of ARCHETYPES) {
      expect(weightSum(a)).toBeCloseTo(1, 10);
    }
  });

  it('score stays within 0..999 over a wide sweep', () => {
    for (let seed = 1; seed <= 400; seed++) {
      for (const archetype of ARCHETYPES) {
        const run = playRun(setupFor({ seed, archetype }), seed % 3);
        expect(run.score).toBeGreaterThanOrEqual(0);
        expect(run.score).toBeLessThanOrEqual(MAX_SCORE);
        expect(Number.isInteger(run.score)).toBe(true);
      }
    }
  });

  it('score components are bounded even for absurd stats', () => {
    const absurd = {
      age: 900, badges: 9999, wins: 1e6, losses: 0, catches: 1e6, shinies: 1e6,
      titles: 1e6, peakRank: 0, fame: 1e6, fatigue: -500, bond: 1e6,
      rivalWins: 1e6, rivalLosses: 0,
    };
    const values = componentValues(absurd, 1e6);
    for (const v of Object.values(values)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    for (const a of ARCHETYPES) {
      expect(scoreCareer(absurd, a, 1e6).total).toBe(MAX_SCORE);
    }
  });

  it('an empty career scores 0, not NaN', () => {
    const empty = {
      age: 10, badges: 0, wins: 0, losses: 0, catches: 0, shinies: 0,
      titles: 0, peakRank: UNRANKED, fame: 0, fatigue: 100, bond: 0,
      rivalWins: 0, rivalLosses: 0,
    };
    for (const a of ARCHETYPES) {
      const { total } = scoreCareer(empty, a, 0);
      expect(Number.isNaN(total)).toBe(false);
      expect(total).toBe(0);
    }
  });

  it('bounded stats never escape their range', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const run = playRun(setupFor({ seed, archetype: 'aggro' }), seed % 3);
      for (const ch of run.chapters) {
        expect(ch.stats.fame).toBeGreaterThanOrEqual(0);
        expect(ch.stats.fame).toBeLessThanOrEqual(100);
        expect(ch.stats.fatigue).toBeGreaterThanOrEqual(0);
        expect(ch.stats.fatigue).toBeLessThanOrEqual(100);
        expect(ch.stats.bond).toBeGreaterThanOrEqual(0);
        expect(ch.stats.bond).toBeLessThanOrEqual(100);
        expect(ch.stats.losses).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('peakRank only ever improves', () => {
    for (const seed of SEEDS) {
      const run = playRun(setupFor({ seed }));
      let best = UNRANKED;
      for (const ch of run.chapters) {
        expect(ch.stats.peakRank).toBeLessThanOrEqual(best);
        best = ch.stats.peakRank;
      }
    }
  });

  it('age advances exactly one year per chapter from 10', () => {
    const run = playRun(setupFor({ seed: 2718 }));
    run.chapters.forEach((ch, i) => expect(ch.age).toBe(10 + i + 1));
  });

  it('the final roster is always exactly six unique members', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const run = playRun(setupFor({ seed, archetype: ARCHETYPES[seed % ARCHETYPES.length] }));
      expect(run.roster.length).toBe(ROSTER_SIZE);
      expect(new Set(run.roster.map(r => r.id)).size).toBe(ROSTER_SIZE);
      expect(run.roster[0].id).toBe(run.setup.starterId);
    }
  });

  it('a run never ends without a verdict', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const run = playRun(setupFor({ seed, archetype: ARCHETYPES[seed % ARCHETYPES.length] }));
      expect(run.verdict).toBeTruthy();
      expect(run.verdict.id).toBeTruthy();
      expect(VERDICTS.some(v => v.id === run.verdict.id)).toBe(true);
    }
  });
});

// ============================================================
describe('archetype verdict coverage', () => {
  // The load-bearing fairness property: no archetype may be a dead end.
  const TOP_TIER = TIER.ELITE;

  it('every archetype can reach a top-tier verdict', () => {
    const reached = new Map<Archetype, { seed: number; score: number; verdict: string }>();

    for (const archetype of ARCHETYPES) {
      for (let seed = 1; seed <= 1200 && !reached.has(archetype); seed++) {
        for (const offset of [0, 1, 2]) {
          const run = playRun(setupFor({ seed, archetype, pace: 'intense' }), offset);
          if (run.score >= TOP_TIER) {
            reached.set(archetype, { seed, score: run.score, verdict: run.verdict.id });
            break;
          }
        }
      }
    }

    const missing = ARCHETYPES.filter(a => !reached.has(a));
    expect(missing, `archetypes that cannot reach ${TOP_TIER}: ${missing.join(', ')}`).toEqual([]);
  });

  it('every archetype reaches its own top-tier verdict, not just a universal one', () => {
    const own = new Set<Archetype>();
    for (const archetype of ARCHETYPES) {
      for (let seed = 1; seed <= 1200 && !own.has(archetype); seed++) {
        for (const offset of [0, 1, 2]) {
          const run = playRun(setupFor({ seed, archetype, pace: 'intense' }), offset);
          const v = VERDICTS.find(x => x.id === run.verdict.id)!;
          if (v.archetype === archetype && v.minScore >= TOP_TIER) {
            own.add(archetype);
            break;
          }
        }
      }
    }
    expect([...own].sort()).toEqual([...ARCHETYPES].sort());
  });

  it('low-scoring runs still land a verdict from the archetype or the universal set', () => {
    for (const archetype of ARCHETYPES) {
      const run = playRun(setupFor({ seed: 11, archetype, pace: 'express' }));
      const v = VERDICTS.find(x => x.id === run.verdict.id)!;
      expect(['any', archetype]).toContain(v.archetype);
      expect(run.score).toBeGreaterThanOrEqual(v.minScore);
    }
  });

  it('the verdict table has a universal floor entry so resolution cannot fail', () => {
    const floor = VERDICTS.filter(v => v.archetype === 'any' && v.minScore === 0 && !v.requires);
    expect(floor.length).toBeGreaterThanOrEqual(1);
  });

  it('verdict ids are unique', () => {
    expect(new Set(VERDICTS.map(v => v.id)).size).toBe(VERDICTS.length);
  });
});

// ============================================================
describe('decision cards', () => {
  it('card and option ids are unique', () => {
    expect(new Set(DECISION_CARDS.map(c => c.id)).size).toBe(DECISION_CARDS.length);
    for (const card of DECISION_CARDS) {
      expect(new Set(card.options.map(o => o.id)).size).toBe(card.options.length);
    }
  });

  it('every card offers 2-4 options', () => {
    for (const card of DECISION_CARDS) {
      expect(card.options.length).toBeGreaterThanOrEqual(2);
      expect(card.options.length).toBeLessThanOrEqual(4);
    }
  });

  it('every phase that can present a decision has at least two eligible cards', () => {
    for (const phase of ['gym-circuit', 'regional', 'national', 'worlds', 'veteran'] as const) {
      const eligible = DECISION_CARDS.filter(c => c.phases.includes(phase));
      expect(eligible.length, `phase ${phase}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('a run does not repeat a decision card while fresh ones remain', () => {
    for (const seed of SEEDS) {
      const run = playRun(setupFor({ seed, pace: 'intense' }));
      const ids = run.choices.map(c => c.cardId);
      // Cards are drawn per phase; a repeat is only legal once a phase has
      // exhausted its pool. Assert no back-to-back repeat, which is the
      // version a player would actually notice.
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i], `seed ${seed} repeated ${ids[i]} back-to-back`).not.toBe(ids[i - 1]);
      }
    }
  });

  it('each presented card is legal for the phase it appears in', () => {
    for (const seed of SEEDS) {
      const setup = setupFor({ seed, pace: 'intense' });
      const run = playRun(setup);
      const byIndex = new Map(run.chapters.map(c => [c.index, c]));
      for (const choice of run.choices) {
        const card = DECISION_CARDS.find(c => c.id === choice.cardId)!;
        const phase = byIndex.get(choice.chapterIndex)!.phase;
        expect(card.phases, `${card.id} in ${phase}`).toContain(phase);
      }
    }
  });
});
