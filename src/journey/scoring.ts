// Career scoring + verdict assignment.
//
// The design goal, lifted from Copero's position-relative scoring: a run is
// scored against what its ARCHETYPE was trying to do, not against one
// universal "did you win Worlds" yardstick. A Shiny Hunter who ends with four
// shinies and no titles must be able to score as high as a Champion who ended
// with three titles and no shinies. Otherwise four of the five archetypes are
// decoration and only one path is worth playing.
//
// Mechanically: ten components, each normalised to 0..1 against a target, then
// combined with per-archetype weights that sum to exactly 1. That makes the
// output bounded by construction — no clamping needed, no way for a lucky run
// to overflow 999.

import type { Archetype, CareerStats, ScoreBreakdown, Verdict } from './types';
import { VERDICTS } from './content';

export const MAX_SCORE = 999;

/** What a "1.0" looks like for each component. Tuned so a strong, well-played
 *  run lands 820+ and a near-perfect one reaches 900+. */
const TARGETS = {
  titles: 3,
  badges: 8,
  catches: 65,
  shinies: 5,
  chapters: 20,
  /** Peak rank at or below this counts as a full-credit peak. */
  topRank: 1,
  /** Rank beyond this earns no peak credit. */
  floorRank: 48,
  /**
   * Win rate is normalised against a realistic band, not against 1.0.
   *
   * A full career runs 200-350 battles including Worlds-level brackets, so a
   * literal 100% win rate is not a thing any career reaches — scoring against
   * it capped the single heaviest component (0.26 for Aggro) at ~0.67 no
   * matter how well the run went, and put the top verdict tier out of reach
   * for three of the five archetypes. 0.35 is a losing career; 0.80 across a
   * whole career is historic.
   */
  winRateFloor: 0.35,
  winRateCeil: 0.80,
};

export type ComponentKey =
  | 'winRate' | 'titles' | 'peak' | 'badges' | 'catches'
  | 'shinies' | 'fame' | 'bond' | 'durability' | 'longevity';

const WEIGHTS: Record<Archetype, Record<ComponentKey, number>> = {
  aggro: {
    winRate: 0.26, titles: 0.22, peak: 0.18, badges: 0.08, fame: 0.12,
    catches: 0.02, shinies: 0.02, bond: 0.04, durability: 0.03, longevity: 0.03,
  },
  stall: {
    winRate: 0.16, titles: 0.14, peak: 0.12, badges: 0.10, fame: 0.04,
    catches: 0.01, shinies: 0.01, bond: 0.14, durability: 0.16, longevity: 0.12,
  },
  // Balance carries only 0.03 on shinies. Its shiny modifier is the second
  // lowest of any archetype, so weighting shinies like the others charged the
  // Balance player for an outcome their own build can't produce — it was the
  // one archetype that could not reach the elite tier. The freed weight goes
  // to titles, which a Balance run genuinely competes for.
  balance: {
    winRate: 0.16, titles: 0.17, peak: 0.12, badges: 0.10, fame: 0.10,
    catches: 0.10, shinies: 0.03, bond: 0.10, durability: 0.06, longevity: 0.06,
  },
  collector: {
    winRate: 0.08, titles: 0.06, peak: 0.04, badges: 0.08, fame: 0.08,
    catches: 0.30, shinies: 0.12, bond: 0.18, durability: 0.03, longevity: 0.03,
  },
  'shiny-hunter': {
    winRate: 0.08, titles: 0.05, peak: 0.03, badges: 0.04, fame: 0.14,
    catches: 0.16, shinies: 0.34, bond: 0.12, durability: 0.02, longevity: 0.02,
  },
};

// Every weight table must sum to 1 or the 0..999 bound stops holding. Asserted
// by the engine unit tests rather than at runtime.
export function weightSum(archetype: Archetype): number {
  return Object.values(WEIGHTS[archetype]).reduce((a, b) => a + b, 0);
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function componentValues(stats: CareerStats, chapterCount: number): Record<ComponentKey, number> {
  const battles = stats.wins + stats.losses;
  const peakSpan = TARGETS.floorRank - TARGETS.topRank;
  const rawWinRate = battles > 0 ? stats.wins / battles : 0;
  const winRateSpan = TARGETS.winRateCeil - TARGETS.winRateFloor;
  return {
    winRate: clamp01((rawWinRate - TARGETS.winRateFloor) / winRateSpan),
    titles: clamp01(stats.titles / TARGETS.titles),
    peak: clamp01((TARGETS.floorRank - stats.peakRank) / peakSpan),
    badges: clamp01(stats.badges / TARGETS.badges),
    catches: clamp01(stats.catches / TARGETS.catches),
    shinies: clamp01(stats.shinies / TARGETS.shinies),
    fame: clamp01(stats.fame / 100),
    bond: clamp01(stats.bond / 100),
    durability: clamp01(1 - stats.fatigue / 100),
    longevity: clamp01(chapterCount / TARGETS.chapters),
  };
}

const COMPONENT_LABEL_KEYS: Record<ComponentKey, string> = {
  winRate: 'journey.score.winRate',
  titles: 'journey.score.titles',
  peak: 'journey.score.peak',
  badges: 'journey.score.badges',
  catches: 'journey.score.catches',
  shinies: 'journey.score.shinies',
  fame: 'journey.score.fame',
  bond: 'journey.score.bond',
  durability: 'journey.score.durability',
  longevity: 'journey.score.longevity',
};

export function scoreCareer(
  stats: CareerStats,
  archetype: Archetype,
  chapterCount: number,
): ScoreBreakdown {
  const values = componentValues(stats, chapterCount);
  const weights = WEIGHTS[archetype];

  const components = (Object.keys(weights) as ComponentKey[])
    .map(key => ({
      key,
      label: COMPONENT_LABEL_KEYS[key],
      value: Math.round(values[key] * weights[key] * MAX_SCORE),
    }))
    // Biggest contributors first — the Legend Card only has room for a few.
    .sort((a, b) => b.value - a.value);

  const weighted = (Object.keys(weights) as ComponentKey[])
    .reduce((sum, key) => sum + values[key] * weights[key], 0);

  return { components, total: Math.round(clamp01(weighted) * MAX_SCORE) };
}

/**
 * Resolve the verdict for a finished career.
 *
 * Walks VERDICTS in declaration order (most prestigious first) and takes the
 * first entry that matches the archetype (or is universal), clears minScore,
 * and satisfies its `requires` predicate. The table ends with a minScore-0
 * universal entry, so this always returns something.
 */
export function resolveVerdict(
  stats: CareerStats,
  archetype: Archetype,
  score: number,
): Verdict {
  for (const v of VERDICTS) {
    if (v.archetype !== 'any' && v.archetype !== archetype) continue;
    if (score < v.minScore) continue;
    if (v.requires && !v.requires(stats)) continue;
    return v;
  }
  // Unreachable given the table's floor entry, but typed as non-optional so
  // callers never have to null-check a verdict.
  return VERDICTS[VERDICTS.length - 1];
}
