import { describe, it, expect } from 'vitest';
import learnsetsRaw from '@/data/learnsets.json';
import pokemonRaw from '@/data/pokemon-data.json';
import movesRaw from '@/data/moves.json';
import { decodeLearnset, encodeLearnset, resolveLearnset } from './learnset';
import type { LearnsetTable } from './learnset';

const TABLE = learnsetsRaw as unknown as LearnsetTable;
const ENTRIES = Object.values(pokemonRaw as unknown as Record<string, { i: number; n: string; sp?: number; form?: string }>);
const MOVE_IDS = new Set(Object.keys(movesRaw).map(Number));

describe('learnset codec', () => {
  it('round-trips the documented example', () => {
    expect(encodeLearnset([13, 14, 15])).toBe('0d0101');
    expect(decodeLearnset('0d0101')).toEqual([13, 14, 15]);
  });

  it('decodes empty / missing to an empty list', () => {
    expect(decodeLearnset('')).toEqual([]);
    expect(decodeLearnset(undefined)).toEqual([]);
  });

  it('round-trips every committed learnset and keeps each sorted, unique and known', () => {
    let moves = 0;
    for (const [id, encoded] of Object.entries(TABLE)) {
      expect(encoded.length % 2, `entry ${id} has an odd-length string`).toBe(0);
      const ids = decodeLearnset(encoded);
      expect(encodeLearnset(ids), `entry ${id} does not round-trip`).toBe(encoded);
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i], `entry ${id} is not strictly increasing at ${i}`).toBeGreaterThan(ids[i - 1]);
      }
      for (const m of ids) expect(MOVE_IDS.has(m), `entry ${id} references unknown move ${m}`).toBe(true);
      moves += ids.length;
    }
    // The dataset is ~98k (species, move) pairs (2026-10 sweep: 98,385); a
    // silent truncation upstream shows up here long before anyone notices a
    // missing move in the UI.
    expect(moves).toBeGreaterThan(90_000);
  });

  it('rejects ids that are not strictly increasing or too far apart', () => {
    expect(() => encodeLearnset([5, 5])).toThrow();
    expect(() => encodeLearnset([5, 4])).toThrow();
    expect(() => encodeLearnset([0, 1296])).toThrow();
    expect(() => encodeLearnset([0])).toThrow(); // gap 0 from the implicit start
  });
});

describe('learnset inheritance', () => {
  it('a form with no list of its own learns its base species\' moves', () => {
    const table: LearnsetTable = { '6': encodeLearnset([1, 2, 3]), '10034': '' };
    expect(resolveLearnset(table, 10034, 6)).toEqual([1, 2, 3]);
    expect(resolveLearnset(table, 99999, 6)).toEqual([1, 2, 3]);
  });

  it('a form with its own list keeps it', () => {
    const table: LearnsetTable = { '6': encodeLearnset([1, 2, 3]), '10034': encodeLearnset([7]) };
    expect(resolveLearnset(table, 10034, 6)).toEqual([7]);
  });

  it('a base species never inherits', () => {
    expect(resolveLearnset({}, 6, undefined)).toEqual([]);
    expect(resolveLearnset({ '6': '' }, 6, 6)).toEqual([]);
  });

  it('every committed entry resolves to a non-empty learnset', () => {
    // Every Gigantamax form and the newest Megas ship with an empty list of
    // their own. Before inheritance, 57 entries — including all 34 G-Max forms —
    // had NO moves in the builder, the SEO pages and the matchup preview.
    const empty: string[] = [];
    for (const e of ENTRIES) {
      const own = decodeLearnset(TABLE[String(e.i)]);
      const resolved = resolveLearnset(TABLE, e.i, e.sp);
      if (own.length === 0) empty.push(e.n);
      expect(resolved.length, `${e.n} (${e.i}) resolves to nothing`).toBeGreaterThan(0);
      if (own.length === 0) expect(resolved, `${e.n} should inherit from ${e.sp}`).toEqual(decodeLearnset(TABLE[String(e.sp)]));
    }
    // Only forms inherit; a base species with no moves would be a data bug.
    for (const n of empty) {
      const e = ENTRIES.find(x => x.n === n)!;
      expect(e.sp, `${n} has no moves and no base species`).toBeDefined();
    }
    expect(empty.length).toBeGreaterThan(0);
  });
});
