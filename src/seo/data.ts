// Build-time SEO data derivation.
//
// WHY THIS EXISTS
// ---------------
// The app ships as one HTML file with 1,307 species, 919 moves and every
// learnset inlined. That is superb for the product and catastrophic for
// discovery: a crawler sees exactly one URL, so none of that data can rank for
// the questions people actually type ("what is X weak to", "X base stats",
// "fire type weaknesses"). Competitors in this space earn the overwhelming
// majority of their organic traffic from one page per species — the data is
// identical to ours, the difference is purely that theirs is addressable.
//
// So: at BUILD time we emit a static page per species and per type from the
// same JSON the bundle inlines. No server, no runtime cost to the app, nothing
// added to bundle.html. This module holds the pure derivation; `render.ts`
// turns it into HTML and `scripts/gen-seo-pages.ts` does the file I/O.
//
// Everything here is a pure function of its arguments so it can be swept in
// vitest rather than checked by eye across 1,307 outputs.

import { TYPES, TYPE_CHART, TYPE_COLORS } from '../lib/constants.ts';
import type { PokemonType } from '../lib/types.ts';

/** The raw shape stored in src/data/pokemon-data.json (keyed by national id). */
export interface RawEntry {
  i: number;
  n: string;
  d: string;
  t: string[];
  s: [number, number, number, number, number, number];
  b: number;
  a: string[];
  h: number;
  w: number;
  /** Base species id — present only on alternate forms. */
  sp?: number;
  /** Form category: 'mega' | 'alolan' | 'gigantamax' | … */
  form?: string;
}

export interface RawMove {
  i: number; n: string; d: string; t: string; c: string;
  p: number | null; a: number | null; pp: number;
}

export interface RawEvolution { id: number; to: string; level: number | null; how: string }

export const STAT_NAMES = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'] as const;

export const SITE_ORIGIN = 'https://trainerscodex.com';

/**
 * Type effectiveness of `attacker` against a defender with `defenderTypes`.
 *
 * Deliberately a re-implementation of `lib/analysis.ts`'s `eff` rather than an
 * import: `analysis.ts` pulls in the whole team-analysis module graph, which
 * this build-time script has no business loading. `seo/data.test.ts` asserts
 * the two agree for every attacker against every one of the 1,307 entries, so
 * the copy cannot drift without the suite going red.
 */
export function multiplier(attacker: PokemonType, defenderTypes: PokemonType[]): number {
  let m = 1;
  for (const d of defenderTypes) {
    const v = TYPE_CHART[attacker]?.[d];
    if (v !== undefined) m *= v;
  }
  return m;
}

export interface DefensiveProfile {
  /** Every one of the 18 types with its incoming multiplier, in TYPES order. */
  all: { type: PokemonType; mult: number }[];
  x4: PokemonType[];
  x2: PokemonType[];
  half: PokemonType[];
  quarter: PokemonType[];
  immune: PokemonType[];
}

export function defensiveProfile(types: PokemonType[]): DefensiveProfile {
  const all = TYPES.map(t => ({ type: t, mult: multiplier(t, types) }));
  return {
    all,
    x4: all.filter(r => r.mult >= 4).map(r => r.type),
    x2: all.filter(r => r.mult === 2).map(r => r.type),
    half: all.filter(r => r.mult === 0.5).map(r => r.type),
    quarter: all.filter(r => r.mult > 0 && r.mult <= 0.25).map(r => r.type),
    immune: all.filter(r => r.mult === 0).map(r => r.type),
  };
}

export interface OffensiveProfile {
  /** Best multiplier this mon's OWN types achieve against each defender. */
  all: { type: PokemonType; mult: number }[];
  superEffective: PokemonType[];
  resisted: PokemonType[];
  immuneTo: PokemonType[];
}

/** What this Pokémon's same-type-attack-bonus moves do to each defending type. */
export function offensiveProfile(types: PokemonType[]): OffensiveProfile {
  const all = TYPES.map(def => ({
    type: def,
    mult: Math.max(...types.map(t => multiplier(t, [def]))),
  }));
  return {
    all,
    superEffective: all.filter(r => r.mult >= 2).map(r => r.type),
    resisted: all.filter(r => r.mult > 0 && r.mult < 1).map(r => r.type),
    immuneTo: all.filter(r => r.mult === 0).map(r => r.type),
  };
}

/** `1307` → the entry's own types, narrowed from the JSON's `string[]`. */
export function typesOf(e: RawEntry): PokemonType[] {
  return e.t as PokemonType[];
}

export function isForm(e: RawEntry): boolean {
  return e.sp !== undefined;
}

/**
 * Percentile of `bst` within `sorted` (ascending base stat totals).
 *
 * Reported on every species page because "is X good" is the question behind
 * most stat searches, and a raw 534 answers it only for people who already
 * know the distribution.
 */
export function bstPercentile(bst: number, sorted: number[]): number {
  let below = 0;
  for (const v of sorted) {
    if (v < bst) below++;
    else break;
  }
  return Math.round((below / sorted.length) * 100);
}

export interface Counter {
  entry: RawEntry;
  /** What the counter's STAB does to the subject. */
  outgoing: number;
  /** What the subject's STAB does back. */
  incoming: number;
}

/**
 * Pokémon that beat `subject` on the type chart.
 *
 * Ranked by the gap between what they deal and what they take, then by base
 * stat total. Alternate forms are excluded: a page that answers "what counters
 * Garchomp" with four Megas is answering a different question than the one
 * asked.
 */
export function countersFor(subject: RawEntry, pool: RawEntry[], limit = 8): Counter[] {
  const subjTypes = typesOf(subject);
  const scored: { c: Counter; score: number }[] = [];
  for (const e of pool) {
    if (e.i === subject.i || isForm(e)) continue;
    const eTypes = typesOf(e);
    const outgoing = Math.max(...eTypes.map(t => multiplier(t, subjTypes)));
    const incoming = Math.max(...subjTypes.map(t => multiplier(t, eTypes)));
    if (outgoing < 2 || incoming >= 2) continue;
    // Type advantage dominates; base stats break ties among equals.
    const score = outgoing * 1000 - incoming * 500 + e.b;
    scored.push({ c: { entry: e, outgoing, incoming }, score });
  }
  scored.sort((a, b) => b.score - a.score || a.c.entry.i - b.c.entry.i);
  return scored.slice(0, limit).map(s => s.c);
}

/**
 * Other Pokémon a visitor to this page plausibly wants next.
 *
 * Same primary type, closest base stat total. This is the internal-linking
 * layer: without it 1,307 pages are 1,307 orphans and a crawler has to take
 * every one of them from the sitemap alone.
 */
export function relatedTo(subject: RawEntry, pool: RawEntry[], limit = 8): RawEntry[] {
  const primary = subject.t[0];
  return pool
    .filter(e => e.i !== subject.i && !isForm(e) && e.t[0] === primary)
    .sort((a, b) => Math.abs(a.b - subject.b) - Math.abs(b.b - subject.b) || a.i - b.i)
    .slice(0, limit);
}

/** Every entry sharing a base species with `subject` — including `subject`. */
export function familyForms(subject: RawEntry, pool: RawEntry[]): RawEntry[] {
  const base = subject.sp ?? subject.i;
  return pool.filter(e => (e.sp ?? e.i) === base).sort((a, b) => a.i - b.i);
}

/** Highest-power same-type moves the entry can learn, physical and special. */
export function topStabMoves(
  entry: RawEntry,
  learnset: number[] | undefined,
  moves: Record<string, RawMove>,
  limit = 6,
): RawMove[] {
  if (!learnset) return [];
  const own = new Set(entry.t);
  return learnset
    .map(id => moves[String(id)])
    .filter((m): m is RawMove => !!m && own.has(m.t) && (m.p ?? 0) > 0)
    .sort((a, b) => (b.p ?? 0) - (a.p ?? 0) || a.d.localeCompare(b.d))
    .slice(0, limit);
}

export function typeColor(t: PokemonType): string {
  return TYPE_COLORS[t];
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function joinList(items: string[], conjunction = 'and'): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

export function typeLine(e: RawEntry): string {
  return e.t.map(titleCase).join('/');
}

/**
 * The meta description.
 *
 * Built from the entry's own numbers rather than a template with a name
 * substituted in, so no two of the 1,307 read alike — near-duplicate
 * descriptions across a large page set are the classic way a bulk-generated
 * site gets filtered out of the index rather than ranked.
 */
export function metaDescription(e: RawEntry): string {
  const d = defensiveProfile(typesOf(e));
  const worst = d.x4.length ? d.x4 : d.x2;
  const weakPhrase = worst.length
    ? `takes ${d.x4.length ? '4×' : '2×'} damage from ${joinList(worst.map(titleCase))}`
    : 'has no type weaknesses at all';
  const resistCount = d.half.length + d.quarter.length + d.immune.length;
  return `${e.d} is a ${typeLine(e)}-type Pokémon with a base stat total of ${e.b}. `
    + `It ${weakPhrase}, and resists ${resistCount} of the 18 types. `
    + `Full matchup chart, base stats, abilities and best counters.`;
}

export interface FaqItem { q: string; a: string }

/**
 * FAQ entries, emitted both as visible copy and as FAQPage structured data.
 *
 * These are phrased as the questions people actually search — "what is X weak
 * to" outranks "X type chart" by an order of magnitude in volume — which is
 * also what makes them eligible for a rich result.
 */
export function faqFor(e: RawEntry): FaqItem[] {
  const d = defensiveProfile(typesOf(e));
  const o = offensiveProfile(typesOf(e));
  const weak = [...d.x4, ...d.x2];
  const resists = [...d.quarter, ...d.half];
  const out: FaqItem[] = [];

  out.push({
    q: `What is ${e.d} weak to?`,
    a: weak.length
      ? `${e.d} is weak to ${joinList(weak.map(titleCase))}.`
        + (d.x4.length ? ` ${joinList(d.x4.map(titleCase))} hits it for 4× damage.` : '')
      : `${e.d} has no type weaknesses — every one of the 18 attacking types deals neutral damage or less.`,
  });

  out.push({
    q: `What resists ${e.d}?`,
    a: o.resisted.length || o.immuneTo.length
      ? `${o.resisted.length ? `${joinList(o.resisted.map(titleCase))} resist ${e.d}'s same-type attacks.` : ''}`
        + `${o.immuneTo.length ? ` ${joinList(o.immuneTo.map(titleCase))} ${o.immuneTo.length === 1 ? 'is' : 'are'} immune to them entirely.` : ''}`.trim()
      : `Nothing resists ${e.d}'s same-type attacks.`,
  });

  out.push({
    q: `What are ${e.d}'s base stats?`,
    a: `${e.d} has ${STAT_NAMES.map((n, i) => `${n} ${e.s[i]}`).join(', ')}, `
      + `for a base stat total of ${e.b}.`,
  });

  if (resists.length) {
    out.push({
      q: `What is ${e.d} resistant to?`,
      a: `${e.d} resists ${joinList(resists.map(titleCase))}.`
        + (d.immune.length ? ` It is immune to ${joinList(d.immune.map(titleCase))}.` : ''),
    });
  }

  out.push({
    q: `Is ${e.d} a good Pokémon?`,
    a: `${e.d}'s base stat total of ${e.b} is its raw ceiling; how well it performs depends on the team around it. `
      + `Its best defensive trait is resisting ${resists.length} of the 18 types, `
      + `and its same-type attacks hit ${o.superEffective.length} types for super-effective damage. `
      + `Use the coverage analyzer to see how it fits a specific six.`,
  });

  return out;
}

/** URL path for a species page. Slugs come straight from the dataset's `n`. */
export function speciesPath(e: RawEntry): string {
  return `/pokemon/${e.n}`;
}

export function typePath(t: PokemonType): string {
  return `/type/${t}`;
}

/** Deep link that opens the builder with this Pokémon already searched for. */
export function builderLink(e: RawEntry): string {
  return `/?q=${encodeURIComponent(e.d)}`;
}

export interface TypeFacts {
  type: PokemonType;
  /** Attacking: what this type does to each defender. */
  attacking: { type: PokemonType; mult: number }[];
  /** Defending: what each attacker does to a pure mon of this type. */
  defending: { type: PokemonType; mult: number }[];
  strongAgainst: PokemonType[];
  weakAgainst: PokemonType[];
  noEffectOn: PokemonType[];
  weakTo: PokemonType[];
  resists: PokemonType[];
  immuneTo: PokemonType[];
}

export function typeFacts(t: PokemonType): TypeFacts {
  const attacking = TYPES.map(def => ({ type: def, mult: multiplier(t, [def]) }));
  const defending = TYPES.map(atk => ({ type: atk, mult: multiplier(atk, [t]) }));
  return {
    type: t,
    attacking,
    defending,
    strongAgainst: attacking.filter(r => r.mult === 2).map(r => r.type),
    weakAgainst: attacking.filter(r => r.mult === 0.5).map(r => r.type),
    noEffectOn: attacking.filter(r => r.mult === 0).map(r => r.type),
    weakTo: defending.filter(r => r.mult === 2).map(r => r.type),
    resists: defending.filter(r => r.mult === 0.5).map(r => r.type),
    immuneTo: defending.filter(r => r.mult === 0).map(r => r.type),
  };
}

/**
 * Type-page meta description.
 *
 * Every clause here is conditional because Normal is a genuine edge case: it
 * resists nothing and is super-effective against nothing, so a template that
 * assumes both lists are non-empty renders "resist , with immunity to Ghost"
 * as the meta description of one of the eighteen most-searched pages on the
 * site. Asserted for all 18 types in data.test.ts.
 */
export function typeMetaDescription(f: TypeFacts): string {
  const n = titleCase(f.type);
  // Each clause has to stand on its own grammatically, because which ones
  // survive the filter varies by type — "Pokémon are weak to X and resist Y"
  // reads fine, but drop the first clause and the shared "are" strands the
  // second. Carrying the verb inside each clause makes every combination read.
  const defensive = [
    f.weakTo.length ? `are weak to ${joinList(f.weakTo.map(titleCase))}` : '',
    f.resists.length ? `resist ${joinList(f.resists.map(titleCase))}` : '',
    f.immuneTo.length ? `take no damage from ${joinList(f.immuneTo.map(titleCase))}` : '',
  ].filter(Boolean);
  const offensive = f.strongAgainst.length
    ? `${n} attacks are super-effective against ${joinList(f.strongAgainst.map(titleCase))}.`
    : `${n} attacks are never super-effective — no type is weak to ${n}.`;
  return `${n}-type Pokémon ${joinList(defensive)}. ${offensive} `
    + `Full ${f.type}-type matchup chart and every ${f.type}-type Pokémon by base stat total.`;
}

export function typeFaq(f: TypeFacts, count: number): FaqItem[] {
  const n = titleCase(f.type);
  return [
    {
      q: `What is ${n} weak to?`,
      a: (f.weakTo.length
        ? `${n}-type Pokémon take double damage from ${joinList(f.weakTo.map(titleCase))} attacks. `
        : `Nothing is super-effective against a pure ${n}-type. `)
        + `A dual type changes this — check an individual Pokémon's page for its real matchups.`,
    },
    {
      q: `What is ${n} strong against?`,
      a: f.strongAgainst.length
        ? `${n} attacks are super-effective against ${joinList(f.strongAgainst.map(titleCase))}-type Pokémon`
          + `${f.noEffectOn.length ? `, and have no effect at all on ${joinList(f.noEffectOn.map(titleCase))}` : ''}.`
        : `Nothing is weak to ${n}. ${n} attacks never deal super-effective damage`
          + `${f.noEffectOn.length ? `, and have no effect at all on ${joinList(f.noEffectOn.map(titleCase))}` : ''}.`,
    },
    {
      q: `What resists ${n}?`,
      a: (() => {
        const reduced = [...f.weakAgainst, ...f.noEffectOn];
        return reduced.length
          ? `${joinList(reduced.map(titleCase))} take reduced damage from ${n} attacks.`
          : `Nothing resists ${n} attacks — every type takes at least neutral damage.`;
      })(),
    },
    {
      q: `How many ${n}-type Pokémon are there?`,
      a: `There are ${count} ${n}-type entries in the Trainer's Codex dataset, counting alternate forms `
        + `such as Mega Evolutions and regional variants.`,
    },
  ];
}
