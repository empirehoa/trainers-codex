import { describe, it, expect } from 'vitest';
import { simulateWithStrategy } from './engine';
import { ARCHETYPES } from './content';
import { REFERENCE_STRATEGIES, signed, skillVsLuck } from './luck';
import type { Archetype, JourneySetup } from './types';

const setup = (seed: number, archetype: Archetype = 'balance'): JourneySetup => ({
  seed, trainerName: 'Probe', regionId: 'kanto', starterId: 4, archetype, pace: 'normal', source: 'fresh',
});
/** A "real player" who alternates options — not one of the reference strategies. */
const played = (seed: number, a: Archetype = 'balance') => {
  let step = 0;
  return simulateWithStrategy(setup(seed, a), d => d.card.options[step++ % d.card.options.length].id, 400);
};

describe('skillVsLuck', () => {
  it('the two headline numbers always add up to distance from an average career', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = played(seed);
      const s = skillVsLuck(r);
      expect(s.skill + s.luck).toBe(s.player - s.refMedian);
    }
  });

  it("the player always sits inside this seed's range, and the range is real", () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const a of ARCHETYPES) {
        const s = skillVsLuck(played(seed, a));
        expect(s.player).toBeGreaterThanOrEqual(s.worst);
        expect(s.player).toBeLessThanOrEqual(s.best);
        expect(s.withinSeedPct).toBeGreaterThanOrEqual(0);
        expect(s.withinSeedPct).toBeLessThanOrEqual(100);
      }
    }
  });

  it('is deterministic — the same run decomposes identically every time', () => {
    const r = played(8843);
    expect(skillVsLuck(r)).toEqual(skillVsLuck(r));
  });

  it('a run played exactly like a reference strategy reports zero-or-better skill against itself', () => {
    // If the player IS the max-risk line, "best on this seed" must be at least
    // their score — the decomposition can never tell a player they beat a line
    // they did not beat.
    for (let seed = 1; seed <= 20; seed++) {
      const r = simulateWithStrategy(setup(seed), REFERENCE_STRATEGIES.maxRisk, 400);
      const s = skillVsLuck(r);
      expect(s.best).toBeGreaterThanOrEqual(r.score);
    }
  });

  it('luck varies across seeds while the reference median does not', () => {
    const lucks = new Set<number>();
    let median = -1;
    for (let seed = 1; seed <= 30; seed++) {
      const s = skillVsLuck(played(seed));
      lucks.add(s.luck);
      if (median === -1) median = s.refMedian; else expect(s.refMedian).toBe(median);
    }
    // Thirty seeds should not all hand the player the same dice.
    expect(lucks.size).toBeGreaterThan(10);
  });

  it('skill spans both signs across seeds — the readout can say "you played badly"', () => {
    const skills = Array.from({ length: 40 }, (_, i) => skillVsLuck(played(i + 1)).skill);
    expect(skills.some(x => x > 0)).toBe(true);
    expect(skills.some(x => x < 0)).toBe(true);
  });
});

describe('signed', () => {
  it('formats the three cases', () => {
    expect(signed(12)).toBe('+12');
    expect(signed(-7)).toBe('−7');
    expect(signed(0)).toBe('±0');
  });
});
