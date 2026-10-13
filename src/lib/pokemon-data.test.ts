import { describe, it, expect } from 'vitest';
import pokemonRaw from '@/data/pokemon-data.json';
import speciesRaw from '@/data/species.json';
import { POKEMON_BY_ID, POKEMON_TOTAL, getLearnset, suggestDefaultMoves } from './pokemon';
import { TYPES } from './constants';

// Shape + health of the shipped dataset. scripts/fetch-forms.mjs rebuilds the
// two JSON files from PokeAPI; this is what makes a bad rebuild fail CI instead
// of shipping. Counts are exact on purpose — a refresh that adds or drops an
// entry must come with the matching edit here (and in README / index.html /
// HelpDialog, which quote the same number).

interface Raw { i: number; n: string; d: string; t: string[]; s: number[]; b: number; a: string[]; h: number; w: number; sp?: number; form?: string; leg?: number; myth?: number; baby?: number }
const ENTRIES = Object.values(pokemonRaw as unknown as Record<string, Raw>);
const SPECIES = speciesRaw as unknown as Record<string, { i: number }>;

const EXPECTED_TOTAL = 1333;
const EXPECTED_BASE = 1025;
const EXPECTED_FORMS: Record<string, number> = {
  form: 95, mega: 97, gigantamax: 34, galarian: 20, alolan: 19, hisuian: 16,
  mode: 7, origin: 5, therian: 4, paldean: 4, primal: 2, crowned: 2,
  fusion: 1, eternamax: 1, style: 1,
};

/** The 2026-10 Legends Z-A / Champions Megas (PokeAPI ids 10301–10326). */
const V15_MEGAS: Record<number, string> = {
  10301: 'zygarde-mega', 10302: 'drampa-mega', 10303: 'falinks-mega',
  10304: 'raichu-mega-x', 10305: 'raichu-mega-y', 10306: 'chimecho-mega',
  10307: 'absol-mega-z', 10308: 'staraptor-mega', 10309: 'garchomp-mega-z',
  10310: 'lucario-mega-z', 10311: 'heatran-mega', 10312: 'darkrai-mega',
  10313: 'golurk-mega', 10314: 'meowstic-male-mega', 10315: 'crabominable-mega',
  10316: 'golisopod-mega', 10317: 'magearna-mega', 10318: 'magearna-original-mega',
  10319: 'zeraora-mega', 10320: 'scovillain-mega', 10321: 'glimmora-mega',
  10322: 'tatsugiri-curly-mega', 10323: 'tatsugiri-droopy-mega',
  10324: 'tatsugiri-stretchy-mega', 10325: 'baxcalibur-mega', 10326: 'meowstic-female-mega',
};

/**
 * Megas whose ability has not been published anywhere (not yet in Pokémon
 * Champions; Legends Z-A has no abilities). They ship with `a: []` — an empty
 * list is honest, a guess is not. Remove an entry here when its ability lands
 * in scripts/fetch-forms.mjs ABILITY_OVERRIDES.
 */
const ABILITY_UNPUBLISHED = new Set([
  'zygarde-mega', 'heatran-mega', 'darkrai-mega', 'magearna-mega',
  'magearna-original-mega', 'zeraora-mega', 'tatsugiri-curly-mega',
  'tatsugiri-droopy-mega', 'tatsugiri-stretchy-mega',
]);

describe('pokemon-data.json', () => {
  it(`has exactly ${EXPECTED_TOTAL} entries: ${EXPECTED_BASE} base species + forms`, () => {
    expect(ENTRIES).toHaveLength(EXPECTED_TOTAL);
    expect(POKEMON_TOTAL).toBe(EXPECTED_TOTAL);
    expect(ENTRIES.filter(e => !e.form)).toHaveLength(EXPECTED_BASE);
    const counts: Record<string, number> = {};
    for (const e of ENTRIES) if (e.form) counts[e.form] = (counts[e.form] ?? 0) + 1;
    expect(counts).toEqual(EXPECTED_FORMS);
  });

  it('keys match ids, names are unique slugs, display names are non-empty', () => {
    const seen = new Set<string>();
    for (const [key, e] of Object.entries(pokemonRaw as unknown as Record<string, Raw>)) {
      expect(Number(key)).toBe(e.i);
      expect(e.n).toMatch(/^[a-z0-9-]+$/);
      expect(seen.has(e.n), `duplicate slug ${e.n}`).toBe(false);
      seen.add(e.n);
      expect(e.d.trim().length).toBeGreaterThan(0);
    }
  });

  it('every entry has 1–2 known types, six stats summing to bst, positive size', () => {
    const typeSet = new Set<string>(TYPES);
    for (const e of ENTRIES) {
      expect(e.t.length, e.n).toBeGreaterThanOrEqual(1);
      expect(e.t.length, e.n).toBeLessThanOrEqual(2);
      for (const t of e.t) expect(typeSet.has(t), `${e.n}: unknown type ${t}`).toBe(true);
      expect(e.s, e.n).toHaveLength(6);
      expect(e.s.reduce((a, b) => a + b, 0), `${e.n} bst`).toBe(e.b);
      expect(e.h, e.n).toBeGreaterThan(0);
      // Eternatus Eternamax weighs "???" in every game; PokeAPI publishes 0.
      expect(e.w, e.n).toBeGreaterThanOrEqual(0);
    }
  });

  it('every form points at a base species that exists, and only forms carry sp/form', () => {
    for (const e of ENTRIES) {
      if (e.i > 10000) {
        expect(e.sp, `${e.n} missing sp`).toBeDefined();
        expect(e.form, `${e.n} missing form`).toBeDefined();
        const base = (pokemonRaw as unknown as Record<string, Raw>)[String(e.sp)];
        expect(base, `${e.n}: base ${e.sp} missing`).toBeDefined();
        expect(base.form, `${e.n}: base ${base.n} is itself a form`).toBeUndefined();
        expect(SPECIES[String(e.sp)], `${e.n}: base ${e.sp} not in species.json`).toBeDefined();
      } else {
        expect(e.sp, `${e.n} is a base species with sp`).toBeUndefined();
        expect(e.form, `${e.n} is a base species with form`).toBeUndefined();
      }
    }
  });

  it('forms inherit their base species\' legendary / mythical flags', () => {
    const byId = pokemonRaw as unknown as Record<string, Raw>;
    for (const e of ENTRIES) {
      if (!e.sp) continue;
      const base = byId[String(e.sp)];
      expect(e.leg ?? 0, `${e.n} leg`).toBe(base.leg ?? 0);
      expect(e.myth ?? 0, `${e.n} myth`).toBe(base.myth ?? 0);
    }
  });

  it('every entry has a published ability, except the Megas nobody has published one for', () => {
    for (const e of ENTRIES) {
      if (ABILITY_UNPUBLISHED.has(e.n)) {
        expect(e.a, `${e.n} is listed as unpublished but has abilities — drop it from the list`).toEqual([]);
      } else {
        expect(e.a.length, `${e.n} has no abilities`).toBeGreaterThan(0);
      }
    }
  });

  it('ships the 26 Legends Z-A / Champions Megas with the right species and category', () => {
    for (const [id, name] of Object.entries(V15_MEGAS)) {
      const p = POKEMON_BY_ID[Number(id)];
      expect(p, `${name} (${id}) missing`).toBeDefined();
      expect(p.name).toBe(name);
      expect(p.form).toBe('mega');
      expect(p.baseSpeciesId).toBeDefined();
      // The base species is the slug minus its form tokens.
      const base = POKEMON_BY_ID[p.baseSpeciesId!];
      expect(name.startsWith(base.name.split('-')[0]), `${name} → ${base.name}`).toBe(true);
      // Generation follows the species, not the 10xxx id (gotcha #3).
      expect(p.gen).toBe(base.gen);
    }
    // Spot checks against the published data.
    expect(POKEMON_BY_ID[10304].abilities).toEqual(['Electric Surge']);
    expect(POKEMON_BY_ID[10309].types).toEqual(['dragon']);
    expect(POKEMON_BY_ID[10310].abilities).toEqual(['Aura Guard']);
    expect(POKEMON_BY_ID[10325].abilities).toEqual(['Thermal Exchange']);
    expect(POKEMON_BY_ID[10301].stats.hp).toBe(216);
  });

  it('every entry — including forms with no list of their own — has a learnset the builder can use', () => {
    for (const e of ENTRIES) {
      expect(getLearnset(e.i).length, `${e.n} has no moves`).toBeGreaterThan(0);
      expect(suggestDefaultMoves(e.i).length, `${e.n} has no default moveset`).toBeGreaterThan(0);
    }
    // Gigantamax Charizard learns what Charizard learns.
    expect(getLearnset(10196).map(m => m.id)).toEqual(getLearnset(6).map(m => m.id));
    // Mega Charizard X has a list of its own (XY-era move data) and keeps it.
    expect(getLearnset(10034).map(m => m.id)).not.toEqual(getLearnset(6).map(m => m.id));
  });
});
