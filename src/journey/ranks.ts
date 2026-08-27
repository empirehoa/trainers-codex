// Percentile + named rank for a finished career.
//
// Two pieces of score PRESENTATION, which the Aug-7 strategy doc argued for on
// evidence: Immaculate Grid retrofitted a rarity line because binary outcomes
// stop being shareable, and people share words rather than integers.
//
// ── Why this could not have shipped before ────────────────────────────────
// The score used to saturate. Measured across 6,000 careers, p85 through p99
// were ALL exactly 999, because the event/quest multiplier landed as
// `Math.min(999, total * mult)` and the clamp was binding for more than a
// sixth of runs. A percentile over that distribution tells the best sixth of
// players they are all tied — the exact opposite of the bragging-rights
// mechanic it is meant to provide. It works now because the multiplier is an
// asymptote (see engine.ts) and the curve is continuous to 926.

import type { Archetype } from './types';

/**
 * Score at each percentile of the reference distribution, p1..p99.
 *
 * Measured from 9,000 careers: 600 seeds × 5 archetypes × 3 paces, played by a
 * mechanical strategy that cycles option indices. That is deliberately NOT an
 * optimising player, so a real one should sit above their percentile here.
 *
 * This is a REFERENCE distribution, not a population of real players, and the
 * UI must say so — see `journey.rank.percentile`. When live analytics exist
 * (`journey_events`), swap this table for real percentiles and the copy can
 * drop the qualifier.
 *
 * Regenerate whenever engine numbers move; a stale table silently mis-ranks
 * every run. `ranks.test.ts` asserts it stays monotonic and covers the range.
 */
export const SCORE_PERCENTILES: readonly number[] = [
  433, 455, 470, 483, 491, 499, 506, 511, 516, 522, 526, 530, 534, 538, 542,
  546, 550, 554, 558, 562, 566, 569, 572, 575, 577, 580, 583, 586, 589, 592,
  594, 598, 600, 603, 606, 609, 612, 614, 617, 620, 622, 625, 627, 630, 632,
  635, 637, 640, 643, 646, 648, 651, 654, 656, 659, 662, 664, 667, 669, 672,
  674, 677, 679, 682, 685, 688, 691, 693, 696, 698, 701, 705, 708, 711, 714,
  718, 721, 725, 728, 731, 735, 739, 743, 747, 750, 754, 759, 763, 768, 773,
  777, 782, 789, 794, 803, 812, 823, 834, 856,
];

/**
 * Percentile of the reference distribution this score beats, 1..99.
 *
 * Clamped away from 0 and 100: "you beat 0% of careers" is a worse thing to
 * print than "bottom 1%", and 100 would claim a run beat every possible career
 * including better ones.
 */
export function scorePercentile(score: number): number {
  let beaten = 0;
  for (const bp of SCORE_PERCENTILES) {
    if (score >= bp) beaten++;
    else break;
  }
  return Math.max(1, Math.min(99, beaten));
}

export interface RankTier {
  id: string;
  /** Minimum percentile this tier starts at. */
  minPercentile: number;
}

/**
 * Named tiers, ordered high to low. `resolveRank` takes the first match, so —
 * exactly like the verdict table — ORDER IS LOAD-BEARING.
 *
 * Deliberately borrowed from the *structure* of a competitive circuit rather
 * than any published ladder, and named so they read as a progression out loud:
 * a player says "I hit Champion", not "I scored 812".
 *
 * Tiers are anchored to percentiles, not raw scores, so they survive an engine
 * retune — the same lesson the verdict TIER constants learned the hard way when
 * ELITE drifted 2 points under an archetype's own ceiling.
 */
export const RANK_TIERS: readonly RankTier[] = [
  { id: 'champion',    minPercentile: 97 },
  { id: 'elite-four',  minPercentile: 90 },
  { id: 'ace',         minPercentile: 75 },
  { id: 'veteran',     minPercentile: 55 },
  { id: 'challenger',  minPercentile: 35 },
  { id: 'rookie',      minPercentile: 15 },
  { id: 'newcomer',    minPercentile: 1 },
];

export interface Rank {
  tier: RankTier;
  percentile: number;
  /** i18n key for the tier name. */
  nameKey: string;
  /** i18n key for the percentile line. */
  lineKey: string;
}

export function resolveRank(score: number): Rank {
  const percentile = scorePercentile(score);
  const tier = RANK_TIERS.find(t => percentile >= t.minPercentile)
    // Unreachable — the last tier starts at 1 and percentile is clamped to >=1.
    // Typed as non-optional so callers never null-check a rank.
    ?? RANK_TIERS[RANK_TIERS.length - 1];
  return {
    tier,
    percentile,
    nameKey: `journey.rank.${tier.id}`,
    lineKey: 'journey.rank.percentile',
  };
}

/**
 * How rare this exact six is, as a percentage, for the share line.
 *
 * Distinct from the score percentile: it asks "how unusual is this TEAM", which
 * is the thing a player feels ownership of. Computed from the roster itself —
 * legendaries, shinies and event Pokémon are what make a six uncommon — so it
 * needs no reference table and cannot go stale.
 */
export function rosterRarity(opts: {
  legendaryCount: number;
  shinyCount: number;
  eventCount: number;
  evolvedCount: number;
  archetype: Archetype;
}): number {
  const { legendaryCount, shinyCount, eventCount, evolvedCount } = opts;
  // Weights reflect roughly how often each shows up in a career, so the
  // headline number moves most for the things that are genuinely scarce.
  const score = legendaryCount * 14 + shinyCount * 11 + eventCount * 7 + evolvedCount * 3;
  // Saturating curve: a stacked six approaches 99 without ever claiming 100.
  return Math.max(1, Math.min(99, Math.round(99 * (1 - Math.exp(-score / 26)))));
}
