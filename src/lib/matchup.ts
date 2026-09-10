// ============================================================
// MATCHUP PREVIEW  (Sprint 3) — @smogon/calc damage ranges + speed tiers
// ============================================================
// A *preview*, not a battle sim. Given one of our TeamMembers and an opponent,
// we ask @smogon/calc — the same engine behind the Damage Calculator every
// competitive player already trusts — for the damage range of each of the
// attacker's moves and how the two speed stats compare. No turn order, no AI,
// no @pkmn/sim: just "what does this hit for, and who moves first."
//
// Why this is the credible-but-bounded choice: r/stunfisk treats Showdown's
// calc output as ground truth, so reusing @smogon/calc means our numbers match
// theirs exactly. We deliberately stop short of a full simulator (out of scope).
//
// Mapping notes:
//   - Species names go through speciesToken() — the SAME Showdown-style names we
//     already export and validate on PokePaste round-trip, which is exactly the
//     naming @smogon/calc's dex expects.
//   - @smogon/calc's @pkmn dataset already carries the three Champions Megas
//     (Meganium/Feraligatr/Emboar) with the SAME stats and types we ship, so
//     their damage ranges and speed tiers come out correct. The one gap is the
//     signature ability (Mega Sol / Dragonize / Mold Breaker), which the dataset
//     doesn't model — it falls back to the base ability. That's a bounded
//     approximation for a *preview*, not a misrepresentation of stats/typing.
//   - The calc engine is still an external boundary: a genuinely unknown
//     species, move, or option set throws, so we catch there and degrade
//     gracefully — unsupported attackers/defenders return null; unknown moves
//     are dropped.
//   - Level defaults to 50 — the VGC / Pokémon Champions / Worlds format. Damage
//     percentages are what matter and are near-level-invariant anyway.

//   - The package is NOT imported statically here. It is 463 KB and only this
//     preview needs it, so it arrives through loadCalc() (src/lib/calc-loader.ts)
//     as a separate chunk that inline.mjs embeds in bundle.html and revives as a
//     Blob-URL module on first use. `computeMatchupWith(calc, …)` is the pure
//     synchronous core; `computeMatchup(…)` awaits the loader and calls it.

import type { Pokemon as CalcPokemon } from '@smogon/calc';
import { loadCalc, type CalcModule } from './calc-loader';
import { POKEMON_BY_ID, MOVES_BY_ID } from './pokemon';
import { HELD_ITEMS } from './constants';
import { speciesToken } from './showdown';
import type { TeamMember } from './types';

const DEFAULT_LEVEL = 50;

type Generation = ReturnType<CalcModule['Generations']['get']>;

// Generations.get(9) is looked up once per calc module instance (there is only
// ever one, but a WeakMap keeps the cache honest rather than global).
const GEN_CACHE = new WeakMap<CalcModule, Generation>();
function genFor(calc: CalcModule): Generation {
  let g = GEN_CACHE.get(calc);
  if (!g) {
    g = calc.Generations.get(9);
    GEN_CACHE.set(calc, g);
  }
  return g;
}

const ITEM_LABEL = new Map<string, string>(HELD_ITEMS.map(it => [it.id, it.label]));

export interface MoveMatchup {
  move: string;          // display name, e.g. "Earthquake"
  minPct: number;        // min damage as % of defender max HP (1 decimal)
  maxPct: number;        // max damage as % of defender max HP
  koText: string;        // e.g. "guaranteed 2HKO", "possible OHKO"
}

export interface Matchup {
  attackerSpe: number;   // attacker's computed Speed stat
  defenderSpe: number;   // defender's computed Speed stat
  speedNote: string;     // "outspeeds" | "outsped by" | "speed ties"
  moves: MoveMatchup[];  // one entry per damaging move (status/0-bp moves dropped)
  supported: boolean;    // false when @smogon/calc can't model the attacker
}

function calcSpecies(id: number): string | null {
  const p = POKEMON_BY_ID[id];
  if (!p) return null;
  return speciesToken(p.name);
}

function buildPokemon(calc: CalcModule, member: TeamMember): CalcPokemon | null {
  const name = calcSpecies(member.id);
  if (!name) return null;
  const GEN = genFor(calc);
  const opts: Record<string, unknown> = { level: DEFAULT_LEVEL };
  if (member.nature) opts.nature = member.nature;
  if (member.ability) opts.ability = member.ability;
  if (member.heldItem) opts.item = ITEM_LABEL.get(member.heldItem) || member.heldItem;
  if (member.evs) opts.evs = member.evs;
  if (member.ivs) opts.ivs = member.ivs;
  if (member.teraType) {
    opts.teraType = member.teraType[0].toUpperCase() + member.teraType.slice(1);
  }
  try {
    return new calc.Pokemon(GEN, name, opts);
  } catch {
    // Unknown species/options for this gen (e.g. a brand-new Champions Mega).
    return null;
  }
}

// A plain defender from a bare species id — used when the opponent is picked
// from the dex with no custom spread. Neutral nature, 0 EVs: the calc default.
function buildDefender(calc: CalcModule, id: number): CalcPokemon | null {
  const name = calcSpecies(id);
  if (!name) return null;
  try {
    return new calc.Pokemon(genFor(calc), name, { level: DEFAULT_LEVEL });
  } catch {
    return null;
  }
}

function speedNote(atk: number, def: number): string {
  if (atk > def) return 'outspeeds';
  if (atk < def) return 'outsped by';
  return 'speed ties';
}

/**
 * Compute the offensive matchup of `attacker` (one of our TeamMembers, full
 * spread) into `defenderId` (a dex species, default spread) with an already
 * loaded calc module. Returns damage ranges per damaging move plus the speed
 * comparison, or an unsupported result when @smogon/calc can't model the
 * attacker. Synchronous — React render paths call this once loadCalc() has
 * resolved (see MatchupSection).
 */
export function computeMatchupWith(calc: CalcModule, attacker: TeamMember, defenderId: number): Matchup {
  const GEN = genFor(calc);
  const atk = buildPokemon(calc, attacker);
  const def = buildDefender(calc, defenderId);
  if (!atk || !def) {
    return { attackerSpe: 0, defenderSpe: 0, speedNote: 'speed ties', moves: [], supported: false };
  }

  const moves: MoveMatchup[] = [];
  const maxHP = def.maxHP();
  for (const mid of attacker.moves || []) {
    const mv = MOVES_BY_ID[mid];
    if (!mv) continue;
    let result;
    try {
      result = calc.calculate(GEN, atk, def, new calc.Move(GEN, mv.display));
    } catch {
      continue; // move not in this gen's calc dex
    }
    const range = result.range();
    if (!range || range[1] <= 0) continue; // status / non-damaging — skip
    const ko = result.kochance();
    moves.push({
      move: mv.display,
      minPct: +((range[0] / maxHP) * 100).toFixed(1),
      maxPct: +((range[1] / maxHP) * 100).toFixed(1),
      koText: (ko && ko.text) || '',
    });
  }

  return {
    attackerSpe: atk.stats.spe,
    defenderSpe: def.stats.spe,
    speedNote: speedNote(atk.stats.spe, def.stats.spe),
    moves,
    supported: true,
  };
}

/** Async form: loads @smogon/calc on first call, then delegates to computeMatchupWith. */
export async function computeMatchup(attacker: TeamMember, defenderId: number): Promise<Matchup> {
  return computeMatchupWith(await loadCalc(), attacker, defenderId);
}

/** Best (highest max%) damaging move name + range for a quick one-line summary. */
export function bestMove(m: Matchup): MoveMatchup | null {
  if (!m.moves.length) return null;
  return m.moves.reduce((best, cur) => (cur.maxPct > best.maxPct ? cur : best));
}
