// Named opponents: gym leaders, the Elite Four, region Champions, the World
// Cup field, and the regional syndicates.
//
// ── Why everything here is ORIGINAL and procedural ────────────────────────
// Named trainers and organisations from the games/anime are trademarked, and
// they are precisely the surface The Pokémon Company enforces against. This
// project ships no protected names anywhere (see docs/JOURNEY_STRATEGY_2026-08
// § IP). So the cast is generated: a seeded name pool × a type specialty ×
// a difficulty tier. That is not just the legal path — it is the better game,
// because the roster of rivals is different in every run instead of being the
// same eight people forever.
//
// Everything is derived from (seed, regionId, index) so the cast is stable for
// a given seed and identical for everyone playing the same daily.

import { TYPE_CHART } from '@/lib/constants';
import type { PokemonType } from '@/lib/types';
import { namedRng, pick, sample, randInt } from './prng';
import { getPools, getRegion } from './content';
import { POKEMON_BY_ID } from '@/lib/pokemon';
import type { ChapterPhase, RosterEntry } from './types';

// ============================================================
// ORIGINAL NAME POOLS
// ============================================================

/** Given names — deliberately invented, no character from any Pokémon media. */
const FIRST_NAMES = [
  'Ardis', 'Bexley', 'Corvin', 'Dray', 'Elowen', 'Faro', 'Greer', 'Hale',
  'Isolde', 'Jarek', 'Kestra', 'Lorne', 'Mireya', 'Nyle', 'Orrin', 'Perrin',
  'Quill', 'Rhoda', 'Sable', 'Torren', 'Ulla', 'Vesper', 'Wrenna', 'Xander',
  'Yarrow', 'Zeph', 'Calla', 'Dagen', 'Emric', 'Fenna', 'Goran', 'Halcy',
  'Ivo', 'Juno', 'Kadra', 'Lisle', 'Maren', 'Nikko', 'Odalys', 'Pell',
];

const SURNAMES = [
  'Ashgrove', 'Brightwater', 'Cinderfell', 'Dunmore', 'Emberly', 'Frostvale',
  'Gaultry', 'Hollowbrook', 'Ironsend', 'Jessamine', 'Kestrelton', 'Larkmoor',
  'Mirevale', 'Northgate', 'Oakhurst', 'Pyrewood', 'Quarrenden', 'Ridgefen',
  'Stormhollow', 'Thornbury', 'Umberlyn', 'Valebrook', 'Windmere', 'Yarrowin',
];

/** Titles scale with tier so a Champion never reads like a route trainer. */
const GYM_TITLES = [
  'Rookie Keeper', 'Route Warden', 'Hall Captain', 'Circuit Veteran',
  'Gym Master', 'Grand Warden', 'Circuit Elite', 'Gym Sovereign',
];
const E4_TITLE = 'of the Elite Four';
const CHAMP_TITLE = 'Region Champion';

/** Original antagonist syndicates. One is assigned per region, per seed. */
const SYNDICATES: { id: string; name: string; motif: PokemonType }[] = [
  { id: 'ashfall', name: 'the Ashfall Consortium', motif: 'fire' },
  { id: 'tidewrack', name: 'the Tidewrack Combine', motif: 'water' },
  { id: 'nullsign', name: 'the Nullsign Order', motif: 'dark' },
  { id: 'graftworks', name: 'Graftworks Holdings', motif: 'steel' },
  { id: 'hollowroot', name: 'the Hollowroot Circle', motif: 'grass' },
  { id: 'stormcall', name: 'the Stormcall Syndicate', motif: 'electric' },
  { id: 'palegrave', name: 'the Palegrave Society', motif: 'ghost' },
  { id: 'coldreach', name: 'the Coldreach Cartel', motif: 'ice' },
  { id: 'venthrax', name: 'the Venthrax Group', motif: 'poison' },
];

export const ALL_TYPES: PokemonType[] = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark',
  'steel', 'fairy',
];

// ============================================================
// OPPONENT MODEL
// ============================================================

export type OpponentKind = 'gym' | 'elite-four' | 'champion' | 'syndicate' | 'world-cup';

export interface Opponent {
  kind: OpponentKind;
  /** Display name — original, generated. */
  name: string;
  title: string;
  specialty: PokemonType;
  /** 1-based order within its bracket (gym 1-8, E4 1-4). */
  index: number;
  /** Average level of the opponent's team. */
  level: number;
  /** Species the opponent fields, drawn from the region pool by type. */
  teamIds: number[];
  regionId: string;
  /** Set for ghost opponents — a real player's run. */
  ghost?: { trainerName: string; score: number };
}

function makeName(rng: () => number): string {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, SURNAMES)}`;
}

/** Species of a given type available in the region, for building a team. */
function teamOfType(
  rng: () => number, regionId: string, type: PokemonType, size: number, elite: boolean,
): number[] {
  const gen = getRegion(regionId).gen;
  const pools = getPools(gen, regionId);
  const candidates = [...pools.common, ...pools.rare, ...(elite ? pools.legendary : [])]
    .filter(id => POKEMON_BY_ID[id]?.types.includes(type));
  const fallback = [...pools.rare, ...pools.common];
  const source = candidates.length >= size ? candidates : fallback;
  return sample(rng, source, size);
}

// Opponent rosters are pure functions of (seed, region) but building one
// filters the whole region pool by type. The engine asks for them once per
// chapter during a replay, and the UI replays on every render — so without a
// cache a saga run re-derives the same 8 leaders dozens of times per frame.
const gymCache = new Map<string, Opponent[]>();
const e4Cache = new Map<string, Opponent[]>();
const champCache = new Map<string, Opponent>();
const syndicateCache = new Map<string, Opponent>();

/** The 8 gym leaders of a region — stable for (seed, region). */
export function gymLeaders(seed: number, regionId: string): Opponent[] {
  const key = `${seed}:${regionId}`;
  const hit = gymCache.get(key);
  if (hit) return hit;
  const built = buildGymLeaders(seed, regionId);
  gymCache.set(key, built);
  return built;
}

function buildGymLeaders(seed: number, regionId: string): Opponent[] {
  const out: Opponent[] = [];
  const rng = namedRng(seed, `gyms-${regionId}`);
  // Each region gets 8 distinct specialties drawn without replacement.
  const specialties = sample(rng, ALL_TYPES, 8);
  for (let i = 0; i < 8; i++) {
    const r = namedRng(seed, `gym-${regionId}-${i}`);
    const specialty = specialties[i] ?? ALL_TYPES[i % ALL_TYPES.length];
    // Levels climb across the circuit: ~14 at gym 1 to ~35 at gym 8.
    //
    // EVERY ladder in this file is set against the MEASURED party curve, and
    // that curve is owned by XP_RATE in levels.ts — the two are one number in
    // two places. Measured party level by the phase it is played in:
    //
    //   gym-circuit 19-32 · elite-four 32-38 · regional 36-41
    //   national 39-44 · worlds 41-47 · world-cup 43-49 · end 48 (starter 55)
    //
    // `matchupFor` prices level gap as `levelGap / 20` CLAMPED to ±1, so a
    // ladder more than 20 levels off the party stops being a variable at all —
    // it pins at the floor and no win-rate tuning can move it. Keep every gap
    // inside that band so preparing for a fight actually changes the odds.
    const level = 14 + i * 3 + randInt(r, -1, 1);
    out.push({
      kind: 'gym',
      name: makeName(r),
      title: GYM_TITLES[i] ?? 'Gym Master',
      specialty,
      index: i + 1,
      level: Math.max(5, level),
      teamIds: teamOfType(r, regionId, specialty, i < 3 ? 3 : i < 6 ? 4 : 5, false),
      regionId,
    });
  }
  return out;
}

/** The region's Elite Four, then its Champion. */
export function eliteFour(seed: number, regionId: string): Opponent[] {
  const key = `${seed}:${regionId}`;
  const hit = e4Cache.get(key);
  if (hit) return hit;
  const built = buildEliteFour(seed, regionId);
  e4Cache.set(key, built);
  return built;
}

function buildEliteFour(seed: number, regionId: string): Opponent[] {
  const rng = namedRng(seed, `e4-${regionId}`);
  const specialties = sample(rng, ALL_TYPES, 4);
  const out: Opponent[] = specialties.map((specialty, i) => {
    const r = namedRng(seed, `e4-${regionId}-${i}`);
    return {
      kind: 'elite-four' as const,
      name: makeName(r),
      title: E4_TITLE,
      specialty,
      index: i + 1,
      // Party is ~32-38 through the Elite Four phase. See buildGymLeaders.
      level: 38 + i * 3 + randInt(r, -1, 1),
      teamIds: teamOfType(r, regionId, specialty, 5, true),
      regionId,
    };
  });
  return out;
}

export function regionChampion(seed: number, regionId: string): Opponent {
  const key = `${seed}:${regionId}`;
  const hit = champCache.get(key);
  if (hit) return hit;
  const built = buildChampion(seed, regionId);
  champCache.set(key, built);
  return built;
}

function buildChampion(seed: number, regionId: string): Opponent {
  const r = namedRng(seed, `champ-${regionId}`);
  const specialty = pick(r, ALL_TYPES);
  return {
    kind: 'champion',
    name: makeName(r),
    title: CHAMP_TITLE,
    specialty,
    index: 1,
    // The region's wall. Clearly above the Elite Four, still inside the ±20
    // band where the level term is live.
    level: 50 + randInt(r, -2, 3),
    teamIds: teamOfType(r, regionId, specialty, 6, true),
    regionId,
  };
}

/** The syndicate operating in a region this run. */
export function syndicateFor(seed: number, regionId: string): Opponent {
  const key = `${seed}:${regionId}`;
  const hit = syndicateCache.get(key);
  if (hit) return hit;
  const built = buildSyndicate(seed, regionId);
  syndicateCache.set(key, built);
  return built;
}

function buildSyndicate(seed: number, regionId: string): Opponent {
  const r = namedRng(seed, `syndicate-${regionId}`);
  const s = pick(r, SYNDICATES);
  return {
    kind: 'syndicate',
    name: s.name,
    title: 'Syndicate Operation',
    specialty: s.motif,
    index: 1,
    // Syndicate shows up mid gym-circuit, so it sits just above those gyms.
    level: 26 + randInt(r, -2, 4),
    teamIds: teamOfType(r, regionId, s.motif, 4, false),
    regionId,
  };
}

// ============================================================
// TYPE MATCHUP — the payoff for team-building
// ============================================================

/**
 * Best offensive multiplier any of `attackerTypes` gets against `defender`.
 *
 * Seeded at 0, not 1. The first version started at 1 and only ever accepted a
 * larger value, so a party whose every type is resisted by the specialty still
 * reported neutral — which is what made the `off <= 0.5` arm of `matchupFor`
 * unreachable. Bringing a bad answer now costs you something.
 */
function bestAgainst(attackerTypes: PokemonType[], defender: PokemonType): number {
  let best = 0;
  for (const a of attackerTypes) {
    const m = TYPE_CHART[a]?.[defender] ?? 1;
    if (m > best) best = m;
  }
  return best;
}

/**
 * What an `attacker`-type move does to a Pokémon of `defenderTypes`.
 *
 * Effectiveness against a dual type is the PRODUCT of the two lookups, never
 * the larger of them. This function used to take the max from a floor of 1,
 * which inverted the two cases team-building is actually about:
 *
 *   Charizard (Fire/Flying) vs a Ground specialist → reported 2, a weakness.
 *     Ground is 2x on Fire and 0x on Flying, so the real answer is 0: immune.
 *   Gengar (Ghost/Poison) vs a Normal specialist  → reported 1, neutral.
 *     Normal cannot touch a Ghost at all.
 *
 * Every resistance and every immunity in the game read as neutral-or-worse, so
 * the `def <= 0.5` arm of `matchupFor` never fired and the defensive half of a
 * matchup contributed nothing. Same rule as `lib/analysis.ts` `eff`, kept local
 * so the journey sim stays off the team-analysis module graph.
 */
function incomingOn(attacker: PokemonType, defenderTypes: PokemonType[]): number {
  let m = 1;
  for (const d of defenderTypes) m *= TYPE_CHART[attacker]?.[d] ?? 1;
  return m;
}

export interface Matchup {
  /** -1 (badly outmatched) .. +1 (dominant). */
  advantage: number;
  /** Party members that hit the specialty super-effectively. */
  strongPicks: number[];
  /** Party members the specialty hits super-effectively. */
  weakPicks: number[];
  /** Average party level vs the opponent's. */
  levelGap: number;
}

/**
 * Score the party against an opponent.
 *
 * This is what makes evolving, swapping and travelling matter: a party built
 * to answer the specialty genuinely wins more. Deliberately bounded so type
 * advantage tilts a chapter rather than deciding it outright.
 */
export function matchupFor(
  roster: RosterEntry[],
  opponent: Opponent,
  partyLevel: number,
): Matchup {
  const strongPicks: number[] = [];
  const weakPicks: number[] = [];
  let offense = 0;
  let defense = 0;

  for (const m of roster) {
    const off = bestAgainst(m.types, opponent.specialty);
    const def = incomingOn(opponent.specialty, m.types);
    if (off >= 2) strongPicks.push(m.id);
    if (def >= 2) weakPicks.push(m.id);
    offense += off >= 2 ? 1 : off <= 0.5 ? -0.6 : 0;
    defense += def >= 2 ? -1 : def <= 0.5 ? 0.6 : 0;
  }

  const size = Math.max(1, roster.length);
  const typeScore = (offense + defense) / (size * 2); // ~-1..+1
  const levelGap = partyLevel - opponent.level;
  // 20 levels of gap is worth about as much as total type dominance.
  const levelScore = Math.max(-1, Math.min(1, levelGap / 20));

  const advantage = Math.max(-1, Math.min(1, typeScore * 0.6 + levelScore * 0.4));
  return { advantage, strongPicks, weakPicks, levelGap };
}

/** Win-rate delta contributed by a matchup. Bounded to ±0.22. */
export function matchupWinRateDelta(m: Matchup): number {
  return m.advantage * 0.22;
}

// ============================================================
// WORLD CUP
// ============================================================

/**
 * The World Cup field: every region champion the tour visited, plus the
 * strongest gym leaders across it, plus any ghost trainers supplied. Padded
 * with generated challengers so the bracket is always full.
 */
export function worldCupField(
  seed: number,
  tour: string[],
  ghosts: Opponent[],
  size = 8,
): Opponent[] {
  const field: Opponent[] = [];
  // Region champions enter the World Cup as COMPETITORS, so they are re-tagged
  // `world-cup`. Leaving them as `kind: 'champion'` meant that on a
  // single-region tour the World Cup's opening match — the only one most runs
  // ever reach — was recorded as a champion fight. No battle in a 6,000-run
  // sweep carried the `world-cup` kind at all, and beating one spuriously
  // "crowned" a region the player had already crowned in the Elite Four.
  for (const regionId of tour) {
    const champ = regionChampion(seed, regionId);
    field.push({ ...champ, kind: 'world-cup', title: `${champ.title} · ${getRegion(regionId).label}` });
  }
  field.push(...ghosts.map(g => ({ ...g, kind: 'world-cup' as const })));
  for (const regionId of tour) {
    const leaders = gymLeaders(seed, regionId);
    const top = leaders[leaders.length - 1];
    if (top) field.push({ ...top, kind: 'world-cup', title: `${top.title} · ${getRegion(regionId).label}` });
  }
  // Pad deterministically if the tour was short.
  let pad = 0;
  while (field.length < size) {
    const r = namedRng(seed, `wc-pad-${pad++}`);
    const regionId = tour[pad % tour.length] ?? tour[0];
    field.push({
      kind: 'world-cup',
      name: makeName(r),
      title: 'International Challenger',
      specialty: pick(r, ALL_TYPES),
      index: field.length + 1,
      // World Cup is late — party is ~43-49 by then.
      level: 53 + randInt(r, -2, 4),
      teamIds: teamOfType(r, regionId, pick(r, ALL_TYPES), 6, true),
      regionId,
    });
  }
  return field.slice(0, size).map((o, i) => ({ ...o, index: i + 1 }));
}

/** i18n-free label helper for the UI. */
export function opponentLabel(o: Opponent): string {
  return `${o.name} · ${o.title}`;
}

/** Chapter phases that carry a named opponent. */
export function phaseHasOpponent(phase: ChapterPhase): boolean {
  return phase === 'gym-circuit' || phase === 'elite-four' || phase === 'world-cup';
}
