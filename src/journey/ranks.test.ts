import { describe, expect, it } from 'vitest';
import {
  RANK_TIERS, SCORE_PERCENTILES, resolveRank, rosterRarity, scorePercentile,
} from './ranks';
import { simulateWithStrategy } from './engine';
import { ARCHETYPES } from './content';
import type { Archetype, JourneySetup, JourneyRun } from './types';

function play(seed: number, a: Archetype): JourneyRun {
  let step = 0;
  return simulateWithStrategy(
    { seed, trainerName: 'P', regionId: 'kanto', starterId: 4, archetype: a, pace: 'intense', source: 'fresh' } satisfies JourneySetup,
    d => d.card.options[step++ % d.card.options.length].id);
}

describe('the percentile table', () => {
  it('has one breakpoint per percentile', () => {
    expect(SCORE_PERCENTILES.length).toBe(99);
  });

  it('is monotonically non-decreasing', () => {
    // A table that dips would rank a better score lower than a worse one.
    for (let i = 1; i < SCORE_PERCENTILES.length; i++) {
      expect(SCORE_PERCENTILES[i], `breakpoint ${i} dips below ${i - 1}`)
        .toBeGreaterThanOrEqual(SCORE_PERCENTILES[i - 1]);
    }
  });

  it('is monotonic as a function too, and stays inside 1..99', () => {
    let last = 0;
    for (let score = 0; score <= 999; score += 7) {
      const p = scorePercentile(score);
      expect(p).toBeGreaterThanOrEqual(1);
      expect(p).toBeLessThanOrEqual(99);
      expect(p, `percentile fell as score rose at ${score}`).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });

  it('still matches the engine it was measured from', () => {
    // The table is a snapshot. If engine numbers move and it is not
    // regenerated, every run is silently mis-ranked — so assert the live
    // distribution still lands near the middle of the table.
    const scores: number[] = [];
    for (let seed = 1; seed <= 40; seed++) for (const a of ARCHETYPES) scores.push(play(seed, a).score);
    const pcts = scores.map(scorePercentile);
    const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    // A correct table puts the mean percentile near 50. Drift beyond 35..65
    // means the table and the engine have diverged.
    expect(mean, `mean percentile is ${mean.toFixed(1)} — regenerate SCORE_PERCENTILES`)
      .toBeGreaterThan(35);
    expect(mean, `mean percentile is ${mean.toFixed(1)} — regenerate SCORE_PERCENTILES`)
      .toBeLessThan(65);
  });
});

describe('named ranks', () => {
  it('tiers are ordered high to low, which the first-match lookup depends on', () => {
    for (let i = 1; i < RANK_TIERS.length; i++) {
      expect(RANK_TIERS[i].minPercentile, `tier ${RANK_TIERS[i].id} is out of order`)
        .toBeLessThan(RANK_TIERS[i - 1].minPercentile);
    }
  });

  it('the lowest tier is a floor, so resolveRank always returns something', () => {
    expect(RANK_TIERS[RANK_TIERS.length - 1].minPercentile).toBeLessThanOrEqual(1);
    for (const score of [0, 1, 306, 650, 926, 999]) {
      expect(resolveRank(score).tier.id).toBeTruthy();
    }
  });

  it('every tier is reachable by a real career', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 120; seed++) {
      for (const a of ARCHETYPES) seen.add(resolveRank(play(seed, a).score).tier.id);
    }
    // Dead content is the failure this file exists to catch — the verdict table
    // shipped six unreachable entries the same way.
    const dead = RANK_TIERS.filter(t => !seen.has(t.id)).map(t => t.id);
    // `newcomer` needs a genuinely terrible run; allow it to be the one gap.
    expect(dead.filter(id => id !== 'newcomer'), `unreachable ranks: ${dead.join(', ')}`).toEqual([]);
  });

  it('a better score never gets a worse rank', () => {
    let lastIdx = RANK_TIERS.length;
    for (let score = 300; score <= 930; score += 5) {
      const idx = RANK_TIERS.findIndex(t => t.id === resolveRank(score).tier.id);
      expect(idx).toBeLessThanOrEqual(lastIdx);
      lastIdx = idx;
    }
  });
});

describe('roster rarity', () => {
  it('stays inside 1..99 for every plausible six', () => {
    for (const leg of [0, 1, 3, 6]) for (const shiny of [0, 1, 6]) for (const ev of [0, 2]) {
      const r = rosterRarity({ legendaryCount: leg, shinyCount: shiny, eventCount: ev, evolvedCount: 6, archetype: 'balance' });
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(99);
    }
  });

  it('rises with scarcity and never claims 100', () => {
    const plain = rosterRarity({ legendaryCount: 0, shinyCount: 0, eventCount: 0, evolvedCount: 0, archetype: 'balance' });
    const stacked = rosterRarity({ legendaryCount: 6, shinyCount: 6, eventCount: 6, evolvedCount: 6, archetype: 'balance' });
    expect(stacked).toBeGreaterThan(plain);
    expect(stacked).toBeLessThan(100);
  });
});
