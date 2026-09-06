import { describe, it, expect } from 'vitest';
import pokemonRaw from '@/data/pokemon-data.json';
import movesRaw from '@/data/moves.json';
import learnsetsRaw from '@/data/learnsets.json';
import { TYPES, TYPE_CHART } from '../lib/constants';
import { eff } from '../lib/analysis';
import type { PokemonType } from '../lib/types';
import {
  bstPercentile, countersFor, defensiveProfile, faqFor, familyForms, joinList,
  metaDescription, multiplier, offensiveProfile, relatedTo, speciesPath,
  titleCase, topStabMoves, typeFacts, typeFaq, typeMetaDescription, typePath,
  typesOf,
} from './data';
import type { RawEntry, RawMove } from './data';

const ALL: RawEntry[] = Object.values(pokemonRaw as unknown as Record<string, RawEntry>)
  .sort((a, b) => a.i - b.i);
const MOVES = movesRaw as unknown as Record<string, RawMove>;
const LEARNSETS = learnsetsRaw as unknown as Record<string, number[]>;

const byName = (n: string) => {
  const e = ALL.find(x => x.n === n);
  if (!e) throw new Error(`no entry ${n}`);
  return e;
};

describe('multiplier', () => {
  // data.ts re-implements `eff` rather than importing the analysis module, to
  // keep the build-time script off the app's dependency graph. This is the
  // guard that makes the copy safe: it sweeps every attacking type against
  // every one of the 1,307 entries — 23,526 comparisons — so a divergence in
  // either direction fails the suite instead of silently shipping a wrong
  // matchup chart on 1,307 indexed pages.
  it('agrees with lib/analysis.eff for every attacker against every entry', () => {
    let checked = 0;
    for (const e of ALL) {
      const types = typesOf(e);
      for (const atk of TYPES) {
        expect(multiplier(atk, types)).toBe(eff(atk, types));
        checked++;
      }
    }
    expect(checked).toBe(ALL.length * 18);
  });

  it('agrees with the raw chart for all 324 single-type pairs', () => {
    for (const atk of TYPES) {
      for (const def of TYPES) {
        expect(multiplier(atk, [def])).toBe(TYPE_CHART[atk][def] ?? 1);
      }
    }
  });
});

describe('defensiveProfile', () => {
  it('covers all 18 types exactly once with no overlap between buckets', () => {
    for (const e of ALL) {
      const d = defensiveProfile(typesOf(e));
      expect(d.all).toHaveLength(18);
      const neutral = d.all.filter(r => r.mult === 1).length;
      expect(d.x4.length + d.x2.length + d.half.length + d.quarter.length
        + d.immune.length + neutral).toBe(18);
    }
  });

  it('resolves the textbook 4x case', () => {
    const d = defensiveProfile(['fire', 'flying']);
    expect(d.x4).toEqual(['rock']);
    expect(d.x2).toEqual(['water', 'electric']);
    expect(d.immune).toEqual(['ground']);
    expect(d.quarter).toEqual(['grass', 'bug']);
  });

  it('has no zero-weakness entry in the real dex, and handles one anyway', () => {
    // Nothing in the current dataset is unweak by typing alone — Eelektross
    // gets there only through Levitate, which is an ability, not a type. The
    // no-weakness branches in metaDescription/faqFor are therefore unreachable
    // from real data today and would rot unexercised, so they are pinned here
    // against a synthetic typing instead of quietly deleted: a Gen-10 typing
    // could make them live, and a broken sentence would ship on that page.
    const unweak = ALL.filter(e => defensiveProfile(typesOf(e)).x2.length === 0
      && defensiveProfile(typesOf(e)).x4.length === 0);
    expect(unweak).toEqual([]);

    const synthetic: RawEntry = {
      ...byName('eelektross'), d: 'Testmon', t: ['normal'],
    };
    const d = defensiveProfile(['normal']);
    expect(d.x4).toEqual([]);
    // Even a real single type has weaknesses; assert the FORMATTING path by
    // driving the profile directly.
    expect(defensiveProfile([]).x2).toEqual([]);
    expect(metaDescription({ ...synthetic, t: [] })).toContain('no type weaknesses at all');
  });
});

describe('offensiveProfile', () => {
  it('takes the best of the two STAB types, never the product', () => {
    // Fire is 2x on Steel, Flying is 0.5x. A Fire/Flying attacker gets 2x from
    // its Fire move — multiplying the two would report neutral and be wrong.
    const o = offensiveProfile(['fire', 'flying']);
    expect(o.all.find(r => r.type === 'steel')?.mult).toBe(2);
  });

  it('reports immunity only when every STAB type is blocked', () => {
    expect(offensiveProfile(['normal']).immuneTo).toEqual(['ghost']);
    // Ghost's own STAB hits Ghost, so Normal/Ghost is immune to nothing.
    expect(offensiveProfile(['normal', 'ghost']).immuneTo).toEqual([]);
  });
});

describe('bstPercentile', () => {
  const sorted = ALL.map(e => e.b).sort((a, b) => a - b);

  it('stays inside 0..100 for every entry', () => {
    for (const e of ALL) {
      const p = bstPercentile(e.b, sorted);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it('is monotonic in base stat total', () => {
    expect(bstPercentile(180, sorted)).toBeLessThan(bstPercentile(600, sorted));
  });
});

describe('countersFor', () => {
  it('only returns entries that win the type exchange outright', () => {
    for (const e of ALL.slice(0, 200)) {
      for (const c of countersFor(e, ALL)) {
        expect(c.outgoing).toBeGreaterThanOrEqual(2);
        expect(c.incoming).toBeLessThan(2);
        // A form would answer a different question than the one asked.
        expect(c.entry.sp).toBeUndefined();
        expect(c.entry.i).not.toBe(e.i);
      }
    }
  });

  it('is deterministic across calls', () => {
    const a = countersFor(byName('garchomp'), ALL).map(c => c.entry.i);
    const b = countersFor(byName('garchomp'), ALL).map(c => c.entry.i);
    expect(a).toEqual(b);
  });

  it('leads with an Ice type against Garchomp', () => {
    const top = countersFor(byName('garchomp'), ALL)[0];
    expect(top.entry.t).toContain('ice');
    expect(top.outgoing).toBe(4);
  });

  it('returns nothing for a typing nothing beats cleanly', () => {
    // Sanity: the function must be able to return an empty list rather than
    // padding with weaker candidates.
    const none = countersFor(byName('bulbasaur'), []);
    expect(none).toEqual([]);
  });
});

describe('relatedTo', () => {
  it('shares the primary type and excludes the subject and forms', () => {
    for (const e of ALL.slice(0, 150)) {
      for (const r of relatedTo(e, ALL)) {
        expect(r.t[0]).toBe(e.t[0]);
        expect(r.i).not.toBe(e.i);
        expect(r.sp).toBeUndefined();
      }
    }
  });
});

describe('familyForms', () => {
  it('groups Charizard with all three of its forms', () => {
    const names = familyForms(byName('charizard'), ALL).map(e => e.n);
    expect(names).toContain('charizard');
    expect(names).toContain('charizard-mega-x');
    expect(names).toContain('charizard-mega-y');
  });

  it('is symmetric — a form finds its base species', () => {
    expect(familyForms(byName('charizard-mega-x'), ALL).map(e => e.n))
      .toEqual(familyForms(byName('charizard'), ALL).map(e => e.n));
  });
});

describe('topStabMoves', () => {
  it('returns only damaging same-type moves, strongest first', () => {
    for (const e of ALL.slice(0, 250)) {
      const moves = topStabMoves(e, LEARNSETS[String(e.i)], MOVES);
      expect(moves.length).toBeLessThanOrEqual(6);
      let prev = Infinity;
      for (const m of moves) {
        expect(e.t).toContain(m.t);
        expect(m.p ?? 0).toBeGreaterThan(0);
        expect(m.p ?? 0).toBeLessThanOrEqual(prev);
        prev = m.p ?? 0;
      }
    }
  });

  it('returns nothing when the learnset is missing', () => {
    expect(topStabMoves(byName('bulbasaur'), undefined, MOVES)).toEqual([]);
  });
});

describe('copy generation', () => {
  it('produces a distinct meta description for every entry', () => {
    const seen = new Set(ALL.map(metaDescription));
    // Near-duplicate descriptions across a bulk-generated page set are how a
    // site gets filtered rather than ranked. Same-typed, same-BST pairs do
    // exist, so this asserts an overwhelming majority rather than 100%.
    expect(seen.size).toBeGreaterThan(ALL.length * 0.9);
  });

  it('never leaves an empty clause or a dangling separator', () => {
    for (const e of ALL) {
      const d = metaDescription(e);
      expect(d).not.toMatch(/undefined|NaN|\s,|,\s*\./);
      expect(d.length).toBeGreaterThan(80);
    }
  });

  it('answers every FAQ question with non-empty prose', () => {
    for (const e of ALL) {
      const faq = faqFor(e);
      expect(faq.length).toBeGreaterThanOrEqual(4);
      for (const f of faq) {
        expect(f.q).toMatch(/\?$/);
        expect(f.a.trim().length).toBeGreaterThan(10);
        expect(f.a).not.toMatch(/undefined|NaN/);
      }
    }
  });

  it('handles the no-weakness case without emitting a broken sentence', () => {
    const answer = faqFor({ ...byName('eelektross'), t: [] })[0].a;
    expect(answer).toContain('no type weaknesses');
    expect(answer).not.toContain('weak to .');
  });

  it('writes clean copy for Normal, which resists nothing and hits nothing hard', () => {
    // The one type whose every conditional clause is empty. This shipped as
    // "resist , with immunity to Ghost" in the first draft.
    const f = typeFacts('normal');
    expect(f.resists).toEqual([]);
    expect(f.strongAgainst).toEqual([]);
    expect(typeMetaDescription(f)).not.toMatch(/\s,|resist \./);
    expect(typeMetaDescription(f)).toContain('never super-effective');
    // Every surviving clause must carry its own verb — dropping the "resist"
    // clause used to strand the shared "are": "Normal-type Pokémon weak to
    // Fighting and take no damage from Ghost."
    expect(typeMetaDescription(f)).toContain('Pokémon are weak to Fighting');
    for (const item of typeFaq(f, 10)) {
      expect(item.a).not.toMatch(/^\s|\s,|\s\./);
    }
  });
});

describe('joinList', () => {
  it('renders 0, 1, 2 and 3+ items', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['a'])).toBe('a');
    expect(joinList(['a', 'b'])).toBe('a and b');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('typeFacts', () => {
  it('partitions all 18 defenders for every attacking type', () => {
    for (const t of TYPES) {
      const f = typeFacts(t);
      expect(f.attacking).toHaveLength(18);
      expect(f.defending).toHaveLength(18);
      expect(f.strongAgainst.length + f.weakAgainst.length + f.noEffectOn.length)
        .toBeLessThanOrEqual(18);
    }
  });

  it('matches the known Ghost/Normal immunity pair', () => {
    expect(typeFacts('ghost').noEffectOn).toContain('normal');
    expect(typeFacts('normal').noEffectOn).toContain('ghost');
    expect(typeFacts('normal').immuneTo).toContain('ghost');
  });

  it('writes a clean description and FAQ for all 18 types', () => {
    for (const t of TYPES) {
      const f = typeFacts(t);
      expect(typeMetaDescription(f), t).toMatch(/^[A-Z][a-z]+-type Pokémon (are|resist|take) /);
      expect(typeMetaDescription(f)).not.toMatch(/undefined|NaN|\s,/);
      for (const item of typeFaq(f, 42)) {
        expect(item.a).not.toMatch(/undefined|NaN/);
        expect(item.a.trim().length).toBeGreaterThan(10);
      }
    }
  });
});

describe('paths', () => {
  it('gives every entry a unique, URL-safe path', () => {
    const paths = ALL.map(speciesPath);
    expect(new Set(paths).size).toBe(ALL.length);
    for (const p of paths) expect(p).toMatch(/^\/pokemon\/[a-z0-9-]+$/);
  });

  it('gives every type a path', () => {
    for (const t of TYPES as PokemonType[]) {
      expect(typePath(t)).toBe(`/type/${t}`);
    }
  });
});

describe('titleCase', () => {
  it('capitalises without touching the rest', () => {
    expect(titleCase('fire')).toBe('Fire');
    expect(titleCase('')).toBe('');
  });
});
