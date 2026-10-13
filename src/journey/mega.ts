// Mega Evolution in Journey Mode — the v15 beat. Pure: dataset lookups and
// two tuning constants, no rng, no DOM. The design note is in
// docs/JOURNEY_MODE.md § Mega Evolution; the short version:
//
//   * The career hands out exactly ONE Key Stone, at the fourth badge — the
//     moment the games do — as a deterministic grant with no dice behind it.
//     A seed that never spends it replays byte-identically to v14 apart from
//     one extra recap line and one more item in the bag.
//   * Spending it (a recorded `item` prepare action, like every other item)
//     permanently marks the target as able to Mega Evolve: its types become
//     the Mega form's for every matchup from then on and the party carries a
//     flat win-rate bonus for the rest of the run. Megas are final — a
//     Mega-capable member no longer evolves.
//   * The form is the species' first Mega in dex order (Charizard → X). A
//     seeded pick would cost an rng draw and break the replay contract; a
//     player pick is a later feature with its own action type.

import { POKEMON_BY_ID } from '@/lib/pokemon';
import type { Pokemon } from '@/lib/types';
import type { BoxEntry, RosterEntry } from './types';

/** Career badge count at which the Key Stone is granted. */
export const MEGA_STONE_BADGE = 4;

/**
 * Flat win-rate bonus while a Mega-capable member is on the party. Sized like
 * a strong type matchup (matchupWinRateDelta tops out at 0.22) rather than
 * like a payoff: the Mega form's new types already move the matchup math, and
 * the stone is one-per-career, so this is the "it's a Mega" premium on top.
 */
export const MEGA_WIN_RATE_BONUS = 0.04;

let megaIndex: Map<number, Pokemon[]> | null = null;

/** Mega forms of a species (by base species id), in dex order. */
export function megaFormsFor(speciesId: number): Pokemon[] {
  if (!megaIndex) {
    megaIndex = new Map();
    for (const p of Object.values(POKEMON_BY_ID)) {
      if (p.form !== 'mega' || p.baseSpeciesId === undefined) continue;
      const list = megaIndex.get(p.baseSpeciesId) ?? [];
      list.push(p);
      megaIndex.set(p.baseSpeciesId, list);
    }
    for (const list of megaIndex.values()) list.sort((a, b) => a.id - b.id);
  }
  return megaIndex.get(speciesId) ?? [];
}

/** The Mega form a member would take, or undefined when the species has none. */
export function defaultMegaFor(speciesId: number): Pokemon | undefined {
  return megaFormsFor(speciesId)[0];
}

export function canMegaEvolve(member: RosterEntry): boolean {
  return member.megaId === undefined && defaultMegaFor(member.id) !== undefined;
}

/** The id whose sprite represents this member — the Mega form once it has one. */
export function displayId(entry: Pick<RosterEntry | BoxEntry, 'id' | 'megaId'>): number {
  return entry.megaId ?? entry.id;
}
