import type { Pokemon, TeamMember } from './types';
import { MAINLINE_GAMES, LATEST_GAME_ID, HOME_BLOCKED_IDS } from './constants';
import type { GameInfo } from './constants';
import { POKEMON_BY_ID } from './pokemon';

export interface CompatibilityResult {
  game: GameInfo;
  playable: boolean;
  missing: Pokemon[];         // mons not transferable to this game
  available: Pokemon[];       // mons that can exist there
}

/**
 * Determine if a Pokémon (or specific form) can exist in a given game.
 *
 * For base species: matched against the game's supported gen list.
 * For alternate forms: layered rules apply.
 *   - Mega Evolutions: only in Gen 6 (XY/ORAS) and Gen 7 (SM/USUM). Not in any current Switch-era game.
 *   - Primal forms (Kyogre/Groudon): Gen 6 ORAS only. Not in Switch-era games.
 *   - Gigantamax: only Sword/Shield. Cannot transfer to other games (form is lost).
 *   - Regional forms (Alolan/Galarian/Hisuian/Paldean): require their introduction generation
 *     game to be available, and propagate forward via HOME.
 *   - Other forms (Therian, Origin, Crowned, Style, Mode) generally follow base species rules.
 */
export function isPokemonAvailableIn(p: Pokemon, game: GameInfo): boolean {
  if (HOME_BLOCKED_IDS.has(p.id)) return false;
  const gen = p.gen ?? 0;
  if (gen === 0) return false;

  // Form-specific gating
  if (p.form === 'mega' || p.form === 'primal') {
    // Megas and Primals don't exist as form in any Switch-era game.
    return false;
  }
  if (p.form === 'gigantamax') {
    // Only Sword/Shield retain Gigantamax forms.
    return game.id === 'swsh';
  }
  if (p.form === 'alolan') {
    // Alolan forms introduced Gen 7. Available in SM/USUM, transferable via HOME to anything Gen 7+.
    return game.supportedGens.includes(7) && game.id !== 'lgpe' && game.id !== 'bdsp';
  }
  if (p.form === 'galarian') {
    // Galarian forms introduced Gen 8 SwSh. Transferable to anything Gen 8+.
    return game.supportedGens.includes(8) && game.id !== 'lgpe' && game.id !== 'bdsp';
  }
  if (p.form === 'hisuian') {
    // Hisuian forms from Legends: Arceus. Available in PLA, SV (DLC), Z-A.
    return ['pla', 'sv', 'plza'].includes(game.id);
  }
  if (p.form === 'paldean') {
    // Paldean forms from Scarlet/Violet onwards.
    return ['sv', 'plza'].includes(game.id);
  }
  if (p.form === 'eternamax') {
    // Eternatus Eternamax — only encountered in SwSh story, never controllable.
    return false;
  }

  // Default: gen-based check
  return game.supportedGens.includes(gen);
}

/**
 * For a team, return one CompatibilityResult per mainline game.
 */
export function analyzeTeamCompatibility(team: (TeamMember | Pokemon | null)[]): CompatibilityResult[] {
  const pokemons: Pokemon[] = team
    .map(m => {
      if (!m) return null;
      if ('id' in m && 'types' in m) return m as Pokemon;
      return POKEMON_BY_ID[(m as TeamMember).id] || null;
    })
    .filter((x): x is Pokemon => Boolean(x));

  return MAINLINE_GAMES.map(game => {
    const available: Pokemon[] = [];
    const missing: Pokemon[] = [];
    pokemons.forEach(p => {
      if (isPokemonAvailableIn(p, game)) available.push(p);
      else missing.push(p);
    });
    return {
      game,
      playable: missing.length === 0 && available.length > 0,
      missing,
      available,
    };
  });
}

/**
 * "Closest mainline game" — returns the recommended target game and instructions.
 * Priority: the latest game that can hold the full team. If none can, the one
 * that holds the most.
 */
export function recommendTargetGame(
  results: CompatibilityResult[]
): { result: CompatibilityResult; instructions: string[] } {
  // Prefer fully-playable, latest-first
  const fullyPlayable = results
    .filter(r => r.playable)
    .sort((a, b) => b.game.releaseYear - a.game.releaseYear);

  if (fullyPlayable.length > 0) {
    const target = fullyPlayable[0];
    const isLatest = target.game.id === LATEST_GAME_ID;
    const instructions = [
      `All 6 of your Pokémon are transferable to ${target.game.label}.`,
      `Path: Deposit each from its origin game into Pokémon HOME, then withdraw to ${target.game.shortLabel}.`,
      isLatest
        ? `${target.game.shortLabel} is the newest mainline game — no further migration needed.`
        : `If you eventually want to move them to the newest game, transfer them through HOME again.`,
      `Pokémon must exist in the destination game's National Dex to transfer.`,
    ];
    return { result: target, instructions };
  }

  // Otherwise pick the one with most coverage, latest-first as tiebreaker
  const ranked = [...results].sort((a, b) => {
    if (b.available.length !== a.available.length) return b.available.length - a.available.length;
    return b.game.releaseYear - a.game.releaseYear;
  });
  const target = ranked[0];

  // Identify form-related blockers
  const megaIssues = target.missing.filter(p => p.form === 'mega' || p.form === 'primal');
  const gmaxIssues = target.missing.filter(p => p.form === 'gigantamax');
  const regionIssues = target.missing.filter(p => ['alolan', 'galarian', 'hisuian', 'paldean'].includes(p.form || ''));

  const instructions: string[] = [];
  instructions.push(`No single mainline game holds your full team natively.`);
  instructions.push(`${target.game.label} holds the most (${target.available.length}/6).`);

  if (megaIssues.length) {
    instructions.push(`${megaIssues.map(p => p.display).join(', ')}: Mega/Primal forms only exist in Gen 6-7 games (ORAS, SM, USUM). They cannot be obtained in any current Switch-era mainline game.`);
  }
  if (gmaxIssues.length) {
    instructions.push(`${gmaxIssues.map(p => p.display).join(', ')}: Gigantamax forms only exist in Sword/Shield. The base species can transfer, but the G-Max factor is lost.`);
  }
  if (regionIssues.length) {
    instructions.push(`${regionIssues.map(p => p.display).join(', ')}: Regional variants require games that include their introducing generation.`);
  }
  if (!megaIssues.length && !gmaxIssues.length && !regionIssues.length) {
    instructions.push(`Missing: ${target.missing.map(p => p.display).join(', ')} — introduced after this game, can't be transferred backward.`);
  }
  instructions.push(`Recommended: use Pokémon HOME 4.0+ and target Scarlet/Violet or Legends Z-A for the widest coverage.`);
  return { result: target, instructions };
}

export { MAINLINE_GAMES, LATEST_GAME_ID };
