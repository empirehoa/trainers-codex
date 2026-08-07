// Evolution data + rules for Journey Mode.
//
// The map in evolutions.json is keyed by national-dex number and generated at
// dev time from @pkmn/dex (see scripts/gen-evolutions.mjs). It ships inlined so
// the offline single-file bundle keeps working with zero network. Journey
// rosters only ever hold BASE species ids (no alternate forms), so the map is
// intentionally base-form → base-form only.

import rawEvolutions from '@/data/evolutions.json';
import { monTypes } from './content';
import type { PokemonType } from '@/lib/types';

export interface EvolutionOption {
  /** National-dex id of the evolved species. */
  id: number;
  /** Display name of the target (baked in at generation time). */
  to: string;
  /** Evolution level, when it's a level-up evolution; null otherwise. */
  level: number | null;
  /** How it evolves: level | item | trade | friendship | special. */
  how: string;
}

const EVOLUTIONS: Record<string, EvolutionOption[]> = rawEvolutions as Record<string, EvolutionOption[]>;

/** Every species this id can evolve INTO. Empty when it's fully evolved. */
export function evolutionsOf(id: number): EvolutionOption[] {
  return EVOLUTIONS[String(id)] ?? [];
}

/** Does this species have any evolution at all? */
export function canEvolve(id: number): boolean {
  return evolutionsOf(id).length > 0;
}

/**
 * Chapters a member must be on the roster before it may evolve normally.
 * A Rare Candy bypasses this — that's the item's whole point.
 */
export const EVOLVE_MIN_CHAPTERS = 2;

/**
 * Is a roster member eligible to evolve at `chapterIndex` under the normal
 * (non-item) rule? The starter (joinedAt -1) becomes eligible at chapter 1;
 * a mid-run catch must be carried for EVOLVE_MIN_CHAPTERS chapters first, so
 * evolving feels earned rather than instant.
 */
export function evolveEligible(joinedAt: number, chapterIndex: number): boolean {
  const held = chapterIndex - Math.max(joinedAt, 0);
  return held >= EVOLVE_MIN_CHAPTERS;
}

/** Resolve the types of an evolved species — kept alongside the id on the roster. */
export function typesOf(id: number): PokemonType[] {
  return monTypes(id);
}

/** Validate that `toId` is a legal evolution target of `fromId`. */
export function isValidEvolution(fromId: number, toId: number): boolean {
  return evolutionsOf(fromId).some(e => e.id === toId);
}
