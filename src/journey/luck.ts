// Skill vs luck — did the player play well, or roll well?
//
// The audit that led to the risk-payoff rebalance found the game could not
// express the one thing a run-based player most wants to know afterwards:
// whether the number on the card was them or the dice. The engine is
// deterministic, so this can be answered honestly rather than estimated: replay
// the SAME seed under a handful of fixed strategies and see where the player's
// actual choices landed inside this seed's range.
//
// Precedent: NYT's WordleBot, a post-game companion that replays a finished
// puzzle and scores the result on skill versus luck. It was the strongest
// verified finding in docs/RESEARCH_2026-09-07.md — and NYT ships it as a
// subscriber feature. Here it is free, because it is the feedback loop that
// makes a second attempt on the same seed mean something.
//
// Pure. No DOM, no clock. ~4 full simulations per call, each low-milliseconds.

import { simulateWithStrategy } from './engine';
import { SCORE_PERCENTILES } from './ranks';
import type { JourneyRun, PendingDecision } from './types';

type Strategy = (d: PendingDecision) => string;

const byRisk = (dir: 1 | -1): Strategy => d => [...d.card.options]
  .sort((a, b) => dir * ((b.riskMultiplier ?? 1) - (a.riskMultiplier ?? 1)))[0].id;

/**
 * The fixed strategies a finished seed is replayed under. Deliberately the
 * same four `risk.test.ts` sweeps with, so "best path on this seed" here means
 * the same thing the balance guard measures.
 */
export const REFERENCE_STRATEGIES: Record<string, Strategy> = {
  maxRisk: byRisk(1),
  minRisk: byRisk(-1),
  first: d => d.card.options[0].id,
  last: d => d.card.options[d.card.options.length - 1].id,
};

export interface SkillLuck {
  /** The player's actual score. */
  player: number;
  /** Highest and lowest score reached on this seed across the reference strategies AND the player. */
  best: number;
  worst: number;
  /** Mean of the reference strategies on this seed — what this seed hands an ordinary player. */
  seedMean: number;
  /** Median of the reference distribution — what an ordinary seed hands an ordinary player. */
  refMedian: number;
  /** seedMean − refMedian. Positive: kind dice. Points. */
  luck: number;
  /** player − seedMean. Positive: the choices beat an ordinary line on this seed. Points. */
  skill: number;
  /** Where the player sits between worst (0) and best (100) on this seed. */
  withinSeedPct: number;
}

/**
 * Replay `run.setup` under the reference strategies and decompose the score.
 *
 * `skill + luck === player − refMedian` by construction, so the two numbers
 * shown to the player always add up to how far they are from an average career.
 */
export function skillVsLuck(run: JourneyRun): SkillLuck {
  const scores = Object.values(REFERENCE_STRATEGIES)
    .map(s => simulateWithStrategy(run.setup, s, 400).score);
  const seedMean = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const all = [...scores, run.score];
  const best = Math.max(...all);
  const worst = Math.min(...all);
  const refMedian = SCORE_PERCENTILES[49];
  const span = best - worst;
  return {
    player: run.score,
    best,
    worst,
    seedMean,
    refMedian,
    luck: seedMean - refMedian,
    skill: run.score - seedMean,
    withinSeedPct: span > 0 ? Math.round(((run.score - worst) / span) * 100) : 100,
  };
}

/** "+12" / "−7" / "±0", for the two headline numbers. */
export function signed(n: number): string {
  if (n === 0) return '±0';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}
