// Learnset codec + inheritance. Pure: no imports, no DOM, so the build-time
// SEO generator (scripts/gen-seo-pages.ts) can reach it with a `.ts` import
// alongside the app and the tests.
//
// FORMAT — src/data/learnsets.json is `Record<id, string>`, each string the
// entry's sorted move ids as fixed-width base-36 DELTAS: two characters per
// move, each the gap from the previous id (the first from 0). Move ids are
// < 1,000 and strictly increasing, so every gap is in 1..999 < 36² = 1,296,
// and the string length is exactly 2 × moves. "0d0102" → [13, 14, 15].
//
// Why not a plain number array: the v5 shape (`[13,14,15,…]`) averaged ~4.5
// characters per move across ~130,000 entries — 360 KB, a third of the data
// the bundle carries — and the 2026-10 PokeAPI re-sweep grew it by 20 KB
// against an 11 KB budget. Deltas are 2 chars/move flat (~170 KB) and decode
// in a tight loop with no allocation beyond the result. Measured, not
// estimated: see HANDOFF.md v15.
//
// INHERITANCE — a form whose own list is empty (every Gigantamax form, the
// Megas PokeAPI has not published moves for) learns what its base species
// learns. The copy is resolved here at read time rather than stored, which
// is both smaller and self-correcting when the base species' list changes.

export type LearnsetTable = Record<string, string>;

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

export function encodeLearnset(ids: readonly number[]): string {
  let out = '';
  let prev = 0;
  for (const id of ids) {
    const gap = id - prev;
    if (!Number.isInteger(gap) || gap < 1 || gap >= 1296) {
      throw new Error(`learnset ids must be strictly increasing and < 1296 apart (got ${prev} → ${id})`);
    }
    out += B36[Math.floor(gap / 36)] + B36[gap % 36];
    prev = id;
  }
  return out;
}

export function decodeLearnset(s: string | undefined): number[] {
  if (!s) return [];
  const out = new Array<number>(s.length >> 1);
  let prev = 0;
  for (let i = 0, j = 0; i < s.length; i += 2, j++) {
    prev += parseInt(s.slice(i, i + 2), 36);
    out[j] = prev;
  }
  return out;
}

/**
 * The move ids `id` can learn: its own list, or its base species' when its
 * own is empty. `baseId` is the entry's `sp` (undefined for base species).
 */
export function resolveLearnset(table: LearnsetTable, id: number, baseId?: number): number[] {
  const own = table[String(id)];
  if (own) return decodeLearnset(own);
  if (baseId !== undefined && baseId !== id) return decodeLearnset(table[String(baseId)]);
  return [];
}
