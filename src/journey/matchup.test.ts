import { describe, it, expect } from 'vitest';
import { matchupFor } from './opponents';
import type { Opponent } from './opponents';
import type { RosterEntry } from './types';

/** Minimal roster entry — matchupFor reads only id, types and (via caller) level. */
const mon = (id: number, types: string[]): RosterEntry =>
  ({ id, name: `m${id}`, types, level: 50 } as unknown as RosterEntry);

const vs = (specialty: string, level = 50): Opponent =>
  ({ id: 'o', name: 'Leader', kind: 'gym', specialty, level } as unknown as Opponent);

describe('matchupFor — defensive half', () => {
  // The defensive arm of the matchup was dead code. `worstFrom` seeded its
  // accumulator at 1 and only accepted larger values, so no resistance and no
  // immunity could ever be recorded, and it took the max across a dual type
  // where the real rule is the product.
  it('treats a Ground attack on Fire/Flying as immunity, not a 4x weakness', () => {
    // Ground is 2x on Fire and 0x on Flying. Product = 0.
    const m = matchupFor([mon(6, ['fire', 'flying'])], vs('ground'), 50);
    expect(m.weakPicks).toEqual([]);
    expect(m.advantage).toBeGreaterThan(0);
  });

  it('credits a Ghost for being untouchable by Normal', () => {
    const m = matchupFor([mon(94, ['ghost', 'poison'])], vs('normal'), 50);
    expect(m.weakPicks).toEqual([]);
    expect(m.advantage).toBeGreaterThan(0);
  });

  it('still flags a genuine 4x weakness', () => {
    // Rock is 2x on Fire and 2x on Flying. Product = 4.
    const m = matchupFor([mon(6, ['fire', 'flying'])], vs('rock'), 50);
    expect(m.weakPicks).toEqual([6]);
    expect(m.advantage).toBeLessThan(0);
  });

  it('cancels a weakness against a resistance for a mixed dual type', () => {
    // Grass is 2x on Water and 0.5x on Flying → product 1, plain neutral.
    const m = matchupFor([mon(1, ['water', 'flying'])], vs('grass'), 50);
    expect(m.weakPicks).toEqual([]);
  });

  it('rewards a wall: a resisted specialty beats a neutral one', () => {
    const resists = matchupFor([mon(1, ['steel'])], vs('fairy'), 50).advantage;
    const neutral = matchupFor([mon(2, ['normal'])], vs('fairy'), 50).advantage;
    // Steel resists Fairy; Normal does not. Bringing the wall must pay.
    expect(resists).toBeGreaterThan(neutral);
  });
});

describe('matchupFor — offensive half', () => {
  it('penalises a party whose every type the specialty resists', () => {
    // Fire resists Grass. A pure-Grass party into a Fire leader is a bad bring
    // and used to score identically to a neutral one.
    const bad = matchupFor([mon(1, ['grass'])], vs('fire'), 50).advantage;
    const neutral = matchupFor([mon(2, ['normal'])], vs('fire'), 50).advantage;
    expect(bad).toBeLessThan(neutral);
  });

  it('rewards a super-effective answer', () => {
    const good = matchupFor([mon(9, ['water'])], vs('fire'), 50);
    expect(good.strongPicks).toEqual([9]);
    expect(good.advantage).toBeGreaterThan(0);
  });
});

describe('matchupFor — bounds', () => {
  it('stays inside -1..+1 across every type pairing and level gap', () => {
    const TYPES = ['normal','fire','water','electric','grass','ice','fighting','poison',
      'ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];
    for (const a of TYPES) {
      for (const b of TYPES) {
        for (const gap of [-60, -20, 0, 20, 60]) {
          const m = matchupFor([mon(1, [a, b])], vs(a, 50), 50 + gap);
          expect(m.advantage).toBeGreaterThanOrEqual(-1);
          expect(m.advantage).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
