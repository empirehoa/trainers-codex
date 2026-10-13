import { describe, it, expect } from 'vitest';
import {
  MEGA_GAMES, analyzeTeamCompatibility, isPokemonAvailableIn, recommendTargetGame,
} from './compatibility';
import { MAINLINE_GAMES } from './constants';
import { POKEMON_BY_ID } from './pokemon';
import type { Pokemon } from './types';

// Pure sweep of the form-aware game gating. tests/test-champions.mjs drives the
// same functions through the built bundle; this runs the whole dataset against
// every game in milliseconds, so a rule that silently stops firing for one
// form category fails here first.

const ALL = Object.values(POKEMON_BY_ID) as Pokemon[];
const GAME = Object.fromEntries(MAINLINE_GAMES.map(g => [g.id, g]));
const byName = (n: string) => {
  const p = ALL.find(x => x.name === n);
  if (!p) throw new Error(`no entry ${n}`);
  return p;
};
const gamesFor = (p: Pokemon) => MAINLINE_GAMES.filter(g => isPokemonAvailableIn(p, g)).map(g => g.id);

describe('isPokemonAvailableIn — form gating', () => {
  it('Megas and Primals are usable in Legends Z-A and Champions, nowhere else', () => {
    const megas = ALL.filter(p => p.form === 'mega' || p.form === 'primal');
    expect(megas.length).toBe(99); // 97 Mega + 2 Primal after the v15 refresh
    for (const p of megas) expect(gamesFor(p), p.name).toEqual([...MEGA_GAMES]);
    expect(MEGA_GAMES).toEqual(['plza', 'champions']);
  });

  it('the 2026 Legends Z-A Megas follow the same rule as the Gen 6 ones', () => {
    for (const n of ['lucario-mega-z', 'garchomp-mega-z', 'raichu-mega-x', 'zygarde-mega', 'charizard-mega-x']) {
      expect(gamesFor(byName(n)), n).toEqual(['plza', 'champions']);
    }
  });

  it('Gigantamax forms exist only in Sword/Shield', () => {
    for (const p of ALL.filter(p => p.form === 'gigantamax')) expect(gamesFor(p), p.name).toEqual(['swsh']);
  });

  it('Eternamax is never playable', () => {
    expect(gamesFor(byName('eternatus-eternamax'))).toEqual([]);
  });

  it('regional forms are gated to the games that carry their region', () => {
    for (const p of ALL.filter(p => p.form === 'alolan')) {
      const g = gamesFor(p);
      expect(g, p.name).not.toContain('lgpe');
      expect(g, p.name).not.toContain('bdsp');
      expect(g, p.name).toContain('sv');
    }
    for (const p of ALL.filter(p => p.form === 'hisuian')) expect(gamesFor(p), p.name).toEqual(['pla', 'sv', 'plza']);
    for (const p of ALL.filter(p => p.form === 'paldean')) expect(gamesFor(p), p.name).toEqual(['sv', 'plza']);
  });

  it('a base species follows its generation', () => {
    expect(gamesFor(byName('pikachu'))).toEqual(MAINLINE_GAMES.map(g => g.id));
    expect(gamesFor(byName('sprigatito'))).toEqual(['sv', 'plza', 'champions']);
  });

  it('every entry is playable somewhere except the story-only form', () => {
    const stranded = ALL.filter(p => gamesFor(p).length === 0).map(p => p.name);
    expect(stranded).toEqual(['eternatus-eternamax']);
  });
});

describe('recommendTargetGame', () => {
  const rec = (ids: number[]) => recommendTargetGame(analyzeTeamCompatibility(ids.map(id => ({ id, shiny: false }))));

  it('a Mega team is recommended for Legends Z-A — the mainline game — and told about Mega Stones', () => {
    const { result, instructions } = rec([byName('emboar-mega').id, byName('lucario-mega-z').id]);
    expect(result.game.id).toBe('plza');
    expect(result.playable).toBe(true);
    expect(instructions.join('\n')).toMatch(/Mega Stone/);
    expect(instructions.join('\n')).toMatch(/newest mainline/);
  });

  it('Champions never wins the headline over a mainline game that holds the team', () => {
    expect(rec([25]).result.game.id).not.toBe('champions');
    expect(rec([byName('charizard-mega-x').id]).result.game.id).toBe('plza');
  });

  it('a Mega plus a Gigantamax has no single home; a mainline game wins the tie over Champions', () => {
    // Z-A, Sword/Shield and Champions each hold exactly one of these two. The
    // fallback used to break the tie by release year alone, which handed the
    // headline to Champions (2026) — a battle sim with no overworld.
    const { result, instructions } = rec([byName('charizard-mega-x').id, byName('charizard-gmax').id]);
    expect(result.playable).toBe(false);
    expect(result.game.id).toBe('plza');
    const text = instructions.join('\n');
    expect(text).toMatch(/No single mainline game/);
    expect(text).toMatch(/holds the most \(1\/2\)/); // not the old hard-coded "/6"
    expect(text).toMatch(/Gigantamax forms only exist in Sword\/Shield/);
  });

  it('when the best fit lacks the Megas, it says where Megas live now', () => {
    const team = ['venusaur-gmax', 'charizard-gmax', 'blastoise-gmax', 'charizard-mega-x'].map(n => byName(n).id);
    const { result, instructions } = rec(team);
    expect(result.game.id).toBe('swsh');
    expect(instructions.join('\n')).toMatch(/holds the most \(3\/4\)/);
    expect(instructions.join('\n')).toMatch(/Legends: Z-A and Pokémon Champions/);
  });

  it('the instructions count the Pokémon actually on the team, not a fixed six', () => {
    const { instructions } = rec([25]);
    expect(instructions[0]).toMatch(/^All 1 of your Pokémon/);
  });

  it('every game in the matrix is reported once per analysis', () => {
    const results = analyzeTeamCompatibility([{ id: 25, shiny: false }]);
    expect(results.map(r => r.game.id).sort()).toEqual(Object.keys(GAME).sort());
  });
});
