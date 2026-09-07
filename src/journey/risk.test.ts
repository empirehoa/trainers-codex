import { describe, it, expect } from 'vitest';
import { simulateWithStrategy, MOMENTUM_PER_LANDED, MOMENTUM_CAP } from './engine';
import { ARCHETYPES, DECISION_CARDS } from './content';
import type { Archetype, JourneySetup, PendingDecision } from './types';

/**
 * Risk is a choice, not a tax.
 *
 * Before payoffs, measured over 150 seeds × 5 archetypes: always-min-risk beat
 * always-max-risk by 26–74 points for EVERY archetype and earned more prize
 * money too, because a risky option bought a one-chapter mean shift while its
 * +fatigue compounded against the run for every later chapter. The dice
 * outweighed every decision in a run combined. These sweeps pin the repair:
 *
 *   C1  neither pure strategy dominates beyond a small band
 *   C2  decisions move a run by a meaningful fraction of the career SD
 *   C3  risk earns more durable money than safety
 *   C4  the landing trigger is a genuine coin flip, not always/never
 *   C5  every risky option carries a payoff; no safe option does
 *
 * The engine is deterministic, so these thresholds cannot flake — a failure
 * here is a balance change that moved the numbers, which is what it is for.
 */
const setup = (seed: number, archetype: Archetype): JourneySetup => ({
  seed, trainerName: 'Probe', regionId: 'kanto', starterId: 4, archetype, pace: 'normal', source: 'fresh',
});
type Strat = (d: PendingDecision) => string;
const byRisk = (dir: 1 | -1): Strat => d => [...d.card.options]
  .sort((a, b) => dir * ((b.riskMultiplier ?? 1) - (a.riskMultiplier ?? 1)))[0].id;
const STRATS: Record<string, Strat> = {
  maxRisk: byRisk(1), minRisk: byRisk(-1),
  first: d => d.card.options[0].id, last: d => d.card.options[d.card.options.length - 1].id,
};
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

interface Sweep { gap: number; ratio: number; moneyMax: number; moneyMin: number; landedRate: number }
const SWEEP: Record<Archetype, Sweep> = (() => {
  const out = {} as Record<Archetype, Sweep>;
  for (const a of ARCHETYPES) {
    const scores: Record<string, number[]> = {}; const money: Record<string, number[]> = {};
    const spread: number[] = []; let landed = 0, decisions = 0;
    for (const seed of SEEDS) {
      const per: number[] = [];
      for (const [name, s] of Object.entries(STRATS)) {
        const r = simulateWithStrategy(setup(seed, a), s, 400);
        (scores[name] ??= []).push(r.score); (money[name] ??= []).push(r.stats.money); per.push(r.score);
        if (name === 'maxRisk') { landed += r.chapters.filter(c => c.landed).length; decisions += r.choices.length; }
      }
      spread.push(Math.max(...per) - Math.min(...per));
    }
    out[a] = {
      gap: mean(scores.maxRisk) - mean(scores.minRisk),
      ratio: mean(spread) / sd(scores.first),
      moneyMax: mean(money.maxRisk), moneyMin: mean(money.minRisk),
      landedRate: landed / Math.max(1, decisions),
    };
  }
  return out;
})();

describe('C1 — neither strategy dominates', () => {
  it('keeps max-risk within 20 points of min-risk for every archetype', () => {
    // 20, not the 15 first aimed for: past ~15 the knobs trade archetypes
    // against each other (trimming aggro's overshoot moved stall from -11 to
    // -18). The old world was -26 to -74, one-directional.
    for (const a of ARCHETYPES) {
      expect(Math.abs(SWEEP[a].gap), `${a}: gap ${SWEEP[a].gap.toFixed(0)}`).toBeLessThanOrEqual(20);
    }
  });

  it('lets risk come out ahead for at least two archetypes', () => {
    // A tax is negative everywhere. A choice wins somewhere.
    const ahead = ARCHETYPES.filter(a => SWEEP[a].gap > 0);
    expect(ahead.length, `risk ahead for: ${ahead.join(', ') || 'none'}`).toBeGreaterThanOrEqual(2);
  });
});

describe('C2 — decisions move the run', () => {
  it('per-seed decision spread is a real fraction of the career SD', () => {
    // Battle-oriented archetypes: half a standard deviation between the best
    // and worst way to play the same seed. Collector and Shiny Hunter are
    // DEFINED by dice — catches and shinies are rolls — so they are held to a
    // lower floor rather than having the thing they are about removed.
    const floor = (a: Archetype) => (a === 'shiny-hunter' ? 0.3 : a === 'collector' ? 0.4 : 0.5);
    for (const a of ARCHETYPES) {
      expect(SWEEP[a].ratio, `${a}: spread/sd ${SWEEP[a].ratio.toFixed(2)}`).toBeGreaterThanOrEqual(floor(a));
    }
  });
});

describe('C3 — risk is for something durable', () => {
  it('a risky career banks at least 15% more prize money than a safe one', () => {
    // It used to bank LESS: +fatigue cost wins, and wins are the prize source.
    for (const a of ARCHETYPES) {
      expect(SWEEP[a].moneyMax, `${a}: ₽${SWEEP[a].moneyMax.toFixed(0)} vs ₽${SWEEP[a].moneyMin.toFixed(0)}`)
        .toBeGreaterThan(SWEEP[a].moneyMin * 1.15);
    }
  });
});

describe('C4 — the gamble is a coin flip', () => {
  it('a max-risk career lands roughly half its gambles', () => {
    for (const a of ARCHETYPES) {
      expect(SWEEP[a].landedRate, a).toBeGreaterThan(0.4);
      expect(SWEEP[a].landedRate, a).toBeLessThan(0.6);
    }
  });

  it('momentum is bounded so a lucky streak cannot run away', () => {
    expect(MOMENTUM_PER_LANDED * MOMENTUM_CAP).toBeLessThanOrEqual(0.06);
  });
});

describe('C5 — content invariants', () => {
  it('every risky option carries a payoff and no safe option does', () => {
    for (const card of DECISION_CARDS) {
      for (const opt of card.options) {
        const risk = opt.riskMultiplier ?? 1;
        if (risk > 1) expect(opt.payoff, `${card.id}/${opt.id} is risky (${risk}) with no payoff`).toBeTruthy();
        else expect(opt.payoff, `${card.id}/${opt.id} is safe (${risk}) but carries a payoff`).toBeUndefined();
      }
    }
  });

  it('every card offers at least one risky and one safe arm', () => {
    // A card with two safe arms has no decision in it.
    for (const card of DECISION_CARDS) {
      const risks = card.options.map(o => o.riskMultiplier ?? 1);
      expect(Math.max(...risks), `${card.id} has no risky arm`).toBeGreaterThan(1);
      expect(Math.min(...risks), `${card.id} has no safe arm`).toBeLessThanOrEqual(1);
    }
  });

  it('a payoff that refunds fatigue never refunds less than the option cost', () => {
    // Refunds are ~1.7× cost so a landed gamble is a net relief, not a wash.
    for (const card of DECISION_CARDS) {
      for (const opt of card.options) {
        const cost = opt.delta.fatigue ?? 0, refund = opt.payoff?.fatigue ?? 0;
        if (cost > 0 && refund < 0) {
          expect(-refund, `${card.id}/${opt.id}: refund ${refund} vs cost ${cost}`).toBeGreaterThanOrEqual(cost);
        }
      }
    }
  });
});
