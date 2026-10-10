import type { Pokemon, TeamMember } from './types';
import { MAINLINE_GAMES, LATEST_GAME_ID, HOME_BLOCKED_IDS } from './constants';
import type { GameInfo } from './constants';
import { POKEMON_BY_ID } from './pokemon';

/**
 * Games in which a Mega or Primal form can be used. Legends: Z-A is a mainline
 * game, so a Mega team now has a mainline home; Champions is the ranked ladder.
 * Exported so the UI can say "Mega-only" in one place and tests can sweep it.
 */
export const MEGA_GAMES: readonly string[] = ['plza', 'champions'];

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
 *   - Mega Evolutions: Gen 6-7 historically, gone for the first Switch
 *     generation, and back in two places — Pokémon Legends: Z-A (where Mega
 *     Evolution is the headline mechanic and the 2025–26 Megas debuted) and
 *     Pokémon Champions (which gives them abilities and a ranked ladder).
 *   - Primal forms (Kyogre/Groudon): Gen 6 ORAS, otherwise treated like Megas.
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
    // Megas/Primals vanished for the first Switch generation. Mega Evolution
    // returned in Legends: Z-A (2025, with Mega Dimension adding more) and is
    // the battle format of Pokémon Champions (2026). Nowhere else in this list.
    // v5–v14 gated these to Champions alone, which told a Z-A player their
    // Mega Lucario Z team was "not playable in any mainline game".
    return MEGA_GAMES.includes(game.id);
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
  // Prefer a mainline game for the headline recommendation, latest-first.
  // Pokémon Champions is a competitive battle title, not a collection game, so
  // it only wins the headline when it's the *only* fully-playable option — i.e.
  // the team carries a Mega/Primal that exists nowhere else.
  const fullyPlayable = results.filter(r => r.playable);
  const mainlineFull = fullyPlayable
    .filter(r => r.game.id !== 'champions')
    .sort((a, b) => b.game.releaseYear - a.game.releaseYear);
  const championsFull = fullyPlayable.filter(r => r.game.id === 'champions');
  const ordered = [...mainlineFull, ...championsFull];

  if (ordered.length > 0) {
    const target = ordered[0];
    const megas = target.available.filter(p => p.form === 'mega' || p.form === 'primal');
    if (target.game.id === 'champions') {
      // Only reached when no mainline game holds the full team but Champions
      // does — in practice a Mega alongside something Z-A's dex lacks.
      const instructions = [
        `All ${target.available.length} of your Pokémon are battle-legal in ${target.game.label}.`,
        megas.length
          ? `${megas.map(p => p.display).join(', ')}: Mega Evolve in battle from the base species — Champions gives every Mega its ability.`
          : `Champions is HOME-linked: bring each Pokémon in through Pokémon HOME.`,
        `Champions is a competitive battle title, so there's no overworld to catch in — teams are built from your HOME boxes.`,
      ];
      return { result: target, instructions };
    }
    const isLatest = target.game.id === LATEST_GAME_ID;
    const instructions = [
      `All ${target.available.length} of your Pokémon are transferable to ${target.game.label}.`,
      `Path: Deposit each from its origin game into Pokémon HOME, then withdraw to ${target.game.shortLabel}.`,
    ];
    if (megas.length) {
      instructions.push(
        `${megas.map(p => p.display).join(', ')}: transfer the base species — the Mega form is reached in battle with its Mega Stone.`,
      );
    }
    instructions.push(
      isLatest
        ? `${target.game.shortLabel} is the newest mainline game — no further migration needed.`
        : `If you eventually want to move them to the newest game, transfer them through HOME again.`,
      `Pokémon must exist in the destination game's National Dex to transfer.`,
    );
    return { result: target, instructions };
  }

  // Otherwise pick the one with most coverage; on a tie a mainline game beats
  // Champions (same reasoning as above — it has no overworld), then latest-first.
  const ranked = [...results].sort((a, b) => {
    if (b.available.length !== a.available.length) return b.available.length - a.available.length;
    const aChamp = a.game.id === 'champions' ? 1 : 0;
    const bChamp = b.game.id === 'champions' ? 1 : 0;
    if (aChamp !== bChamp) return aChamp - bChamp;
    return b.game.releaseYear - a.game.releaseYear;
  });
  const target = ranked[0];
  const teamSize = target.available.length + target.missing.length;

  // Identify form-related blockers
  const megaIssues = target.missing.filter(p => p.form === 'mega' || p.form === 'primal');
  const gmaxIssues = target.missing.filter(p => p.form === 'gigantamax');
  const regionIssues = target.missing.filter(p => ['alolan', 'galarian', 'hisuian', 'paldean'].includes(p.form || ''));

  const instructions: string[] = [];
  instructions.push(`No single mainline game holds your full team natively.`);
  instructions.push(`${target.game.label} holds the most (${target.available.length}/${teamSize}).`);

  if (megaIssues.length) {
    instructions.push(`${megaIssues.map(p => p.display).join(', ')}: Mega/Primal forms exist in Gen 6-7 games (ORAS, SM, USUM), Legends: Z-A and Pokémon Champions. They cannot be used in Let's Go, Sword/Shield, BDSP, Legends: Arceus or Scarlet/Violet.`);
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
