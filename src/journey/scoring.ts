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
  /** Measured max catches over a full career is ~70, and the p90 is 45. A
   *  target of 65 meant only the extreme tail approached 1.0, which capped the
   *  Collector's ceiling (its own heaviest component, at 0.30) below every
   *  other archetype's. 55 is reachable by a genuinely dedicated run. */
  catches: 55,
  shinies: 5,
  chapters: 20,
  /** Peak rank at or below this counts as a full-credit peak. */
  topRank: 1,
  /**
   * Rank beyond which a peak earns no credit.
   *
   * This was 48, and it made `peak` a dead component: measured across 6,000
   * careers the observed peak rank never fell outside the top 8, so the
   * normalised value ran p10 0.957 / p50 1.000 / min 0.851. A component with
   * that little variance does not measure anything — it just pays every run a
   * flat premium proportional to its weight, which is how the archetypes drifted
   * 113 points apart at the median. 12 is the same band treatment already
   * applied to `winRate`: outside the top twelve of a circuit is not a peak.
   */
  floorRank: 12,
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
  /**
   * Fame and bond are scored against an ACHIEVABLE ceiling, not against 100.
   *
   * Both stats decay (see FAME_DECAY_RATE / BOND_DECAY_RATE in engine.ts), so
   * they now settle into a real spread instead of pinning at the cap — which is
   * what makes them useful signals at all. But dividing by the raw 0-100 range
   * would then mean nobody ever scores above ~0.6 on either, depressing every
   * career's total by a constant. These are set just above the measured p97 of
   * the post-decay distributions, so an excellent run approaches 1.0 and a
   * mediocre one doesn't.
   */
  fame: 95,
  bond: 70,
};

export type ComponentKey =
  | 'winRate' | 'titles' | 'peak' | 'badges' | 'catches'
  | 'shinies' | 'fame' | 'bond' | 'durability' | 'longevity';

const WEIGHTS: Record<Archetype, Record<ComponentKey, number>> = {
  // Aggro and Stall sat at opposite ends of a variance problem. Aggro's two
  // heaviest components were `winRate` (p50 0.52) and `titles` (p50 0.00 — half
  // of all careers end titleless), so its median was dragged down by weights
  // that mostly pay nothing. Stall's were `durability` (p50 0.64) and
  // `longevity` (p50 0.80) — near-guaranteed, and stall's own mechanic lowers
  // fatigue, so it was being paid twice for the same thing. Net effect: stall's
  // median score ran 113 points above aggro's, which showed up as Aggro players
  // landing MODEST verdicts while Stall players landed GREAT.
  //
  // The rebalance moves both toward components that actually discriminate,
  // WITHOUT flattening identity: stall still carries the highest `bond`,
  // `durability` and `longevity` of any archetype, and aggro still carries the
  // highest `winRate`. Cross-archetype median parity is asserted in
  // content-health.test.ts so this cannot drift back silently.
  aggro: {
    winRate: 0.26, titles: 0.18, peak: 0.20, badges: 0.10, fame: 0.12,
    catches: 0.02, shinies: 0.02, bond: 0.04, durability: 0.03, longevity: 0.03,
  },
  stall: {
    winRate: 0.18, titles: 0.18, peak: 0.12, badges: 0.10, fame: 0.05,
    catches: 0.01, shinies: 0.01, bond: 0.15, durability: 0.12, longevity: 0.08,
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
    fame: clamp01(stats.fame / TARGETS.fame),
    bond: clamp01(stats.bond / TARGETS.bond),
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
