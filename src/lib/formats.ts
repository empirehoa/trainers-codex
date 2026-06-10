// ============================================================
// TEAM-BUILDING FORMATS / RULESETS
// ============================================================
//
// Lets users constrain the buildable pool the way real competitive formats do
// ("no megas", "no gigantamax", "no legendaries", BST caps, mono-type, gen
// locks). A Ruleset is a flat bag of toggles; FORMAT_PRESETS are curated bundles
// of those toggles surfaced as one-tap buttons. Legality is computed per-mon
// (checkLegality) and rolled up per-team (teamLegality).
//
// Why curated ID sets and not data flags: pokemon-data.json carries `legendary`,
// `mythical`, `baby`, and `form`, but has NO field for paradox / ultra-beast /
// "restricted" (box-legendary) status. Those three categories are therefore
// hard-coded ID sets below, matching the same PARADOX_IDS App.tsx already used
// for its category filter. Everything else reads off real fields.

import type { Pokemon, PokemonType } from './types';

// ---- Curated classification sets (no data field exists for these) ----

// Gen 9 Paradox Pokémon (ancient + future). Same set the category filter uses.
export const PARADOX_IDS = new Set<number>([
  984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995,
  1005, 1006, 1009, 1010, 1020, 1021, 1022, 1023,
]);

// Gen 7 Ultra Beasts (includes Poipole / Naganadel).
export const ULTRA_BEAST_IDS = new Set<number>([
  793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806,
]);

// "Restricted" legendaries — the box/cover legendaries banned from standard
// singles and gated in VGC. Mythicals are handled by their own flag; this set is
// strictly the restricted-tier legendaries.
export const RESTRICTED_IDS = new Set<number>([
  150,                       // Mewtwo
  249, 250,                  // Lugia, Ho-Oh
  382, 383, 384,             // Kyogre, Groudon, Rayquaza
  483, 484, 487,             // Dialga, Palkia, Giratina
  643, 644, 646,             // Reshiram, Zekrom, Kyurem
  716, 717, 718,             // Xerneas, Yveltal, Zygarde
  789, 790, 791, 792, 800,   // Cosmog, Cosmoem, Solgaleo, Lunala, Necrozma
  888, 889, 890,             // Zacian, Zamazenta, Eternatus
  898,                       // Calyrex
  1007, 1008,                // Koraidon, Miraidon
  1024,                      // Terapagos
]);

const REGIONAL_FORMS = new Set(['alolan', 'galarian', 'hisuian', 'paldean']);

// ---- Ruleset shape ----

export interface Ruleset {
  id: string;
  label: string;
  description?: string;
  noMega?: boolean;
  noPrimal?: boolean;
  noGigantamax?: boolean;
  noRegional?: boolean;
  noLegendary?: boolean;
  noMythical?: boolean;
  noParadox?: boolean;
  noUltraBeast?: boolean;
  noRestricted?: boolean;
  bstCap?: number | null;
  monoType?: PokemonType | null;
  allowedGens?: number[] | null;
}

// The "anything goes" baseline. Spreading this guarantees every toggle has a
// defined value so React state updates stay shallow-mergeable.
export const UNRESTRICTED: Ruleset = {
  id: 'unrestricted',
  label: 'Unrestricted',
  description: 'Every Pokémon and form is legal.',
  noMega: false,
  noPrimal: false,
  noGigantamax: false,
  noRegional: false,
  noLegendary: false,
  noMythical: false,
  noParadox: false,
  noUltraBeast: false,
  noRestricted: false,
  bstCap: null,
  monoType: null,
  allowedGens: null,
};

// ---- Presets ----
// Each preset is a full Ruleset (so applying one fully replaces the active set
// rather than leaving stale toggles from a previous preset).

export const FORMAT_PRESETS: Ruleset[] = [
  UNRESTRICTED,
  {
    ...UNRESTRICTED,
    id: 'no-megas',
    label: 'No Megas',
    description: 'Bans Mega Evolutions and Primal reversions.',
    noMega: true,
    noPrimal: true,
  },
  {
    ...UNRESTRICTED,
    id: 'no-gigantamax',
    label: 'No Gigantamax',
    description: 'Bans Gigantamax forms.',
    noGigantamax: true,
  },
  {
    ...UNRESTRICTED,
    id: 'no-legendaries',
    label: 'No Legendaries',
    description: 'Bans legendary and mythical Pokémon.',
    noLegendary: true,
    noMythical: true,
  },
  {
    ...UNRESTRICTED,
    id: 'no-restricteds',
    label: 'No Restricteds',
    description: 'Bans box/cover restricted legendaries (VGC-style).',
    noRestricted: true,
  },
  {
    ...UNRESTRICTED,
    id: 'standard',
    label: 'Standard',
    description: 'Tournament-style: no megas, primals, gigantamax, restricteds, or mythicals.',
    noMega: true,
    noPrimal: true,
    noGigantamax: true,
    noRestricted: true,
    noMythical: true,
  },
  {
    ...UNRESTRICTED,
    id: 'underdog',
    label: 'Underdog',
    description: 'Only Pokémon with a base-stat total of 350 or less.',
    bstCap: 350,
  },
];

export function presetById(id: string): Ruleset {
  return FORMAT_PRESETS.find(p => p.id === id) || UNRESTRICTED;
}

// ---- Legality ----

export interface Legality {
  legal: boolean;
  reasons: string[];
}

/**
 * Check a single Pokémon against a ruleset. Returns every reason it's illegal
 * (not just the first) so the UI can explain compound bans clearly.
 */
export function checkLegality(p: Pokemon, r: Ruleset): Legality {
  const reasons: string[] = [];

  if (r.noMega && p.form === 'mega') reasons.push('megas banned');
  if (r.noPrimal && p.form === 'primal') reasons.push('primals banned');
  if (r.noGigantamax && p.form === 'gigantamax') reasons.push('gigantamax banned');
  if (r.noRegional && REGIONAL_FORMS.has(p.form || '')) reasons.push('regional forms banned');
  if (r.noLegendary && p.legendary) reasons.push('legendaries banned');
  if (r.noMythical && p.mythical) reasons.push('mythicals banned');
  if (r.noParadox && PARADOX_IDS.has(p.id)) reasons.push('paradox banned');
  if (r.noUltraBeast && ULTRA_BEAST_IDS.has(p.id)) reasons.push('ultra beasts banned');
  if (r.noRestricted && RESTRICTED_IDS.has(p.id)) reasons.push('restricted legendary');
  if (r.bstCap != null && p.bst > r.bstCap) reasons.push(`bst > ${r.bstCap}`);
  if (r.monoType && !p.types.includes(r.monoType)) {
    reasons.push(`must be ${r.monoType}-type`);
  }
  if (r.allowedGens && r.allowedGens.length && p.gen != null && !r.allowedGens.includes(p.gen)) {
    reasons.push(`gen ${p.gen} not allowed`);
  }

  return { legal: reasons.length === 0, reasons };
}

export function isLegal(p: Pokemon, r: Ruleset): boolean {
  return checkLegality(p, r).legal;
}

/** True when the ruleset imposes no constraints (the unrestricted baseline). */
export function isUnrestricted(r: Ruleset): boolean {
  return (
    !r.noMega && !r.noPrimal && !r.noGigantamax && !r.noRegional &&
    !r.noLegendary && !r.noMythical && !r.noParadox && !r.noUltraBeast &&
    !r.noRestricted && r.bstCap == null && r.monoType == null &&
    (!r.allowedGens || r.allowedGens.length === 0)
  );
}

export interface TeamLegality {
  legal: boolean;
  // Per-slot offenders: index into the team + the offending Pokémon + reasons.
  offenders: { index: number; p: Pokemon; reasons: string[] }[];
}

/**
 * Roll legality up across a team (slots may be null). A team is legal when every
 * filled slot is legal under the ruleset.
 */
export function teamLegality(team: (Pokemon | null)[], r: Ruleset): TeamLegality {
  const offenders: TeamLegality['offenders'] = [];
  team.forEach((p, index) => {
    if (!p) return;
    const { legal, reasons } = checkLegality(p, r);
    if (!legal) offenders.push({ index, p, reasons });
  });
  return { legal: offenders.length === 0, offenders };
}

/** Filter a pool of Pokémon down to those legal under a ruleset. */
export function filterLegal<T extends Pokemon>(pool: T[], r: Ruleset): T[] {
  if (isUnrestricted(r)) return pool;
  return pool.filter(p => isLegal(p, r));
}
