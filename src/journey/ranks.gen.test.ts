import { describe, it, expect } from 'vitest';
import { simulateWithStrategy } from './engine';
import { ARCHETYPES, PACES } from './content';
import type { Archetype, JourneySetup, Pace } from './types';

/**
 * Regenerates SCORE_PERCENTILES for ranks.ts from the live engine.
 *
 * Not part of the normal run — `ranks.test.ts` asserts the committed table
 * still matches the engine, and when it doesn't (any balance change moves the
 * distribution) this prints the replacement:
 *
 *   GEN_RANKS=1 npx vitest run src/journey/ranks.gen.test.ts
 *
 * Same mechanical strategy as ranks.test.ts's `play` (cycle option indices),
 * swept over 400 seeds × 5 archetypes × 3 paces = 6,000 careers — the method
 * the table's provenance comment in ranks.ts describes. Paces matter: intense
 * careers take a decision every chapter and score differently from express.
 */
const setup = (seed: number, archetype: Archetype, pace: Pace): JourneySetup => ({
  seed, trainerName: 'Ref', regionId: 'kanto', starterId: 4, archetype, pace, source: 'fresh',
});

describe.skipIf(!import.meta.env.GEN_RANKS)('rank table generator', () => {
  it('prints p1..p99 of the current score distribution', () => {
    const scores: number[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      for (const a of ARCHETYPES) {
        for (const p of PACES) {
          let step = 0;
          scores.push(simulateWithStrategy(setup(seed, a, p.id),
            d => d.card.options[step++ % d.card.options.length].id, 400).score);
        }
      }
    }
    scores.sort((x, y) => x - y);
    const pct = (p: number) => scores[Math.min(scores.length - 1, Math.floor((p / 100) * scores.length))];
    const table = Array.from({ length: 99 }, (_, i) => pct(i + 1));
    const rows: string[] = [];
    for (let i = 0; i < 99; i += 11) rows.push('  ' + table.slice(i, i + 11).join(', ') + ',');
    expect(`\nSCORE_PERCENTILES (n=${scores.length}, min=${scores[0]}, max=${scores[scores.length - 1]}):\n${rows.join('\n')}\n`).toBe('PASTE');
  });
});
