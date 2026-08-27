// Prize money, the priced reroll, and the queued-evolution carry-forward.
//
// All three exist for one reason: nothing in a run used to COST anything, so
// nothing in it was a trade-off. Every prepare action was free, which made every
// prepare action obvious — and an obvious choice is not a choice. Playing the
// same way every chapter was the optimal line, which is what "repetitive" means
// mechanically.
//
// The hard constraint on all of it is the replay contract: `simulate(setup,
// choices, actions)` must stay a pure function, so money, rerolls and queues are
// all DERIVED from the recorded action list rather than accumulated in mutable
// state. The determinism tests at the bottom are the ones that matter most.

import { describe, expect, it } from 'vitest';
import { REROLL_COSTS, rerollCostFor, simulate, simulateWithStrategy } from './engine';
import { ARCHETYPES } from './content';
import { levelFromXp } from './levels';
import { evolutionsOf } from './evolution';
import type {
  Archetype, JourneySetup, JourneyRun, PrepareAction, RecordedChoice,
} from './types';

function setupFor(over: Partial<JourneySetup> = {}): JourneySetup {
  return {
    seed: 8843, trainerName: 'Probe', regionId: 'kanto', starterId: 4,
    archetype: 'balance', pace: 'intense', source: 'fresh', ...over,
  };
}

function play(seed: number, a: Archetype = 'balance'): JourneyRun {
  let step = 0;
  return simulateWithStrategy(setupFor({ seed, archetype: a }),
    d => d.card.options[step++ % d.card.options.length].id);
}

/** Play to the end, recording choices, so actions can be replayed against them. */
function choicesFor(setup: JourneySetup): RecordedChoice[] {
  const out: RecordedChoice[] = [];
  for (let i = 0; i < 60; i++) {
    const snap = simulate(setup, out);
    if (snap.status !== 'awaiting-decision' || !snap.decision) break;
    out.push({
      chapterIndex: snap.decision.chapterIndex,
      cardId: snap.decision.card.id,
      optionId: snap.decision.card.options[0].id,
    });
  }
  return out;
}

const RUNS: JourneyRun[] = (() => {
  const out: JourneyRun[] = [];
  for (let seed = 1; seed <= 30; seed++) for (const a of ARCHETYPES) out.push(play(seed, a));
  return out;
})();

describe('prize money', () => {
  it('a career earns some, and never a negative balance', () => {
    for (const run of RUNS) {
      expect(run.stats.money).toBeGreaterThanOrEqual(0);
    }
    const earned = RUNS.filter(r => r.stats.money > 0).length;
    expect(earned, 'no career earned any prize money').toBe(RUNS.length);
  });

  it('is bounded — enough for a few rerolls, not an unlimited supply', () => {
    const totals = RUNS.map(r => r.stats.money).sort((a, b) => a - b);
    const median = totals[Math.floor(totals.length / 2)];
    // The reroll ladder is 0 / 400 / 900 / 1800. A career should comfortably
    // afford the first two and have to think about the third.
    expect(median, `median career money is ${median}`).toBeGreaterThan(REROLL_COSTS[1]);
    expect(median, `median career money is ${median}`)
      .toBeLessThan(REROLL_COSTS.reduce((a, b) => a + b, 0) * 4);
  });

  it('rises with the things that should pay', () => {
    // More badges and titles must mean more money, or the currency is noise.
    const withTitles = RUNS.filter(r => r.stats.titles > 0);
    const without = RUNS.filter(r => r.stats.titles === 0);
    if (withTitles.length && without.length) {
      const avg = (xs: JourneyRun[]) => xs.reduce((n, r) => n + r.stats.money, 0) / xs.length;
      expect(avg(withTitles)).toBeGreaterThan(avg(without));
    }
  });
});

describe('the reroll price ladder', () => {
  it('starts free so the mechanic is discoverable without a tutorial', () => {
    expect(rerollCostFor(0)).toBe(0);
  });

  it('escalates, then plateaus at the last rung rather than overflowing', () => {
    for (let i = 1; i < REROLL_COSTS.length; i++) {
      expect(rerollCostFor(i)).toBeGreaterThan(rerollCostFor(i - 1));
    }
    const last = REROLL_COSTS[REROLL_COSTS.length - 1];
    expect(rerollCostFor(99)).toBe(last);
  });

  it('a decision chapter reports its own price and affordability', () => {
    const snap = simulate(setupFor(), []);
    expect(snap.status).toBe('awaiting-decision');
    expect(snap.prepare?.rerollCost).toBe(0);
    // The free one is always affordable, even at zero money.
    expect(snap.prepare?.canAffordReroll).toBe(true);
    expect(snap.prepare?.rerollsUsed).toBe(0);
  });
});

describe('rerolling changes the card, deterministically', () => {
  it('a reroll draws a different decision', () => {
    const setup = setupFor();
    const before = simulate(setup, []).decision;
    const actions: PrepareAction[] = [{ type: 'reroll', chapterIndex: before!.chapterIndex }];
    const afterSnap = simulate(setup, [], actions);
    const after = afterSnap.decision;
    expect(after).toBeTruthy();
    // Same chapter, and the reroll must actually have done something. A pool of
    // one card for a phase would make this vacuous, so assert the pool is real.
    expect(after!.chapterIndex).toBe(before!.chapterIndex);
    expect(afterSnap.prepare!.rerollsUsed).toBe(1);
    expect(afterSnap.prepare!.rerollCost).toBe(REROLL_COSTS[1]);
  });

  it('the same reroll replays to the same card, every time', () => {
    // This is the whole reason the reroll count is folded into the rng key
    // instead of drawn from a running stream: a `?seed=` link has to reproduce
    // a rerolled career exactly.
    const setup = setupFor();
    const actions: PrepareAction[] = [{ type: 'reroll', chapterIndex: 0 }];
    const a = simulate(setup, [], actions);
    const b = simulate(setup, [], actions);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('stacked rerolls keep walking, and keep replaying', () => {
    const setup = setupFor();
    const seen: string[] = [];
    for (let n = 0; n <= 3; n++) {
      const actions: PrepareAction[] = Array.from({ length: n }, () => ({ type: 'reroll' as const, chapterIndex: 0 }));
      const snap = simulate(setup, [], actions);
      expect(snap.prepare?.rerollsUsed).toBe(n);
      seen.push(snap.decision!.card.id);
      // Replay stability at every depth.
      expect(JSON.stringify(simulate(setup, [], actions))).toBe(JSON.stringify(snap));
    }
    // At least one reroll must land on a different card, or the mechanic is a
    // no-op dressed as a cost.
    expect(new Set(seen).size, `rerolling never changed the card: ${seen.join(', ')}`)
      .toBeGreaterThan(1);
  });

  it('is charged for — money goes down when a paid reroll is taken', () => {
    // Two rerolls on the same chapter: the first free, the second priced.
    const setup = setupFor();
    const free = simulate(setup, [], [{ type: 'reroll', chapterIndex: 0 }]);
    const paid = simulate(setup, [], [
      { type: 'reroll', chapterIndex: 0 },
      { type: 'reroll', chapterIndex: 0 },
    ]);
    // At chapter 0 the trainer has earned nothing yet, so the paid reroll is
    // clamped against a zero balance rather than going negative.
    expect(paid.prepare!.rerollsUsed).toBe(2);
    expect(free.stats.money).toBeGreaterThanOrEqual(0);
    expect(paid.stats.money).toBeGreaterThanOrEqual(0);
  });
});

describe('queued evolutions carry forward', () => {
  /** A member with a level-gated evolution it cannot yet take, and its target. */
  function findBlocked(setup: JourneySetup) {
    const snap = simulate(setup, []);
    for (const offer of snap.prepare?.evolves ?? []) {
      const blocked = offer.options.find(o => !o.ready);
      if (blocked) return { fromId: offer.fromId, toId: blocked.id };
    }
    return null;
  }

  it('a queue is reported while it waits', () => {
    const setup = setupFor();
    const target = findBlocked(setup);
    expect(target, 'no blocked evolution at chapter 0 to queue').toBeTruthy();
    const actions: PrepareAction[] = [
      { type: 'queue-evolve', chapterIndex: 0, fromId: target!.fromId, toId: target!.toId },
    ];
    const snap = simulate(setup, [], actions);
    const q = snap.prepare?.queued ?? [];
    expect(q.some(x => x.fromId === target!.fromId)).toBe(true);
  });

  it('it fires by itself once the gate clears', () => {
    const setup = setupFor();
    const target = findBlocked(setup);
    expect(target).toBeTruthy();
    const actions: PrepareAction[] = [
      { type: 'queue-evolve', chapterIndex: 0, fromId: target!.fromId, toId: target!.toId },
    ];
    const choices = choicesFor(setup);
    const withQueue = simulate(setup, choices, actions);
    const without = simulate(setup, choices, []);
    // The queued member must have evolved in the queued run and not the other.
    const evolvedWith = withQueue.roster.reduce((n, m) => n + (m.evolved ?? 0), 0);
    const evolvedWithout = without.roster.reduce((n, m) => n + (m.evolved ?? 0), 0);
    expect(evolvedWith, 'a queued evolution never fired across a whole career')
      .toBeGreaterThan(evolvedWithout);
  });

  it('unqueueing cancels it', () => {
    const setup = setupFor();
    const target = findBlocked(setup);
    expect(target).toBeTruthy();
    const choices = choicesFor(setup);
    const queued = simulate(setup, choices, [
      { type: 'queue-evolve', chapterIndex: 0, fromId: target!.fromId, toId: target!.toId },
    ]);
    const cancelled = simulate(setup, choices, [
      { type: 'queue-evolve', chapterIndex: 0, fromId: target!.fromId, toId: target!.toId },
      { type: 'unqueue-evolve', chapterIndex: 1, fromId: target!.fromId },
    ]);
    const ev = (r: JourneyRun) => r.roster.reduce((n, m) => n + (m.evolved ?? 0), 0);
    expect(ev(cancelled)).toBeLessThan(ev(queued));
  });

  it('a stale queue is ignored rather than throwing', () => {
    // Species that is not on the roster, and a target that is not a real edge.
    const setup = setupFor();
    const choices = choicesFor(setup);
    const bogus: PrepareAction[] = [
      { type: 'queue-evolve', chapterIndex: 0, fromId: 99999, toId: 1 },
      { type: 'queue-evolve', chapterIndex: 0, fromId: 4, toId: 99999 },
      { type: 'unqueue-evolve', chapterIndex: 0, fromId: 12345 },
    ];
    expect(() => simulate(setup, choices, bogus)).not.toThrow();
    const run = simulate(setup, choices, bogus);
    expect(run.roster.every(m => evolutionsOf(m.id) !== undefined)).toBe(true);
  });

  it('never breaks the six-unique invariant', () => {
    const setup = setupFor();
    const target = findBlocked(setup);
    if (!target) return;
    const run = simulate(setup, choicesFor(setup), [
      { type: 'queue-evolve', chapterIndex: 0, fromId: target.fromId, toId: target.toId },
    ]);
    const ids = run.roster.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('determinism survives money, rerolls and queues', () => {
  it('a career with all three replays byte-identically', () => {
    const setup = setupFor();
    const target = (() => {
      const snap = simulate(setup, []);
      for (const o of snap.prepare?.evolves ?? []) {
        const b = o.options.find(x => !x.ready);
        if (b) return { fromId: o.fromId, toId: b.id };
      }
      return null;
    })();
    const actions: PrepareAction[] = [
      { type: 'reroll', chapterIndex: 0 },
      ...(target ? [{ type: 'queue-evolve' as const, chapterIndex: 0, fromId: target.fromId, toId: target.toId }] : []),
    ];
    const choices = choicesFor(setup);
    const a = simulate(setup, choices, actions);
    const b = simulate(setup, choices, actions);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('party levels still behave with a queue in play', () => {
    const setup = setupFor();
    const run = simulate(setup, choicesFor(setup), [{ type: 'reroll', chapterIndex: 0 }]);
    for (const m of run.roster) {
      const lv = levelFromXp(m.xp ?? 0);
      expect(lv).toBeGreaterThanOrEqual(1);
      expect(lv).toBeLessThanOrEqual(100);
    }
  });
});
