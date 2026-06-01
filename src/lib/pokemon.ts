import pokemonRaw from '@/data/pokemon-data.json';
import movesRaw from '@/data/moves.json';
import learnsetsRaw from '@/data/learnsets.json';
import type { Pokemon, Role, Stats, Move, SpriteKind } from './types';
import { GENERATIONS, STAT_KEYS } from './constants';

interface RawPokemon {
  i: number;
  n: string;
  d: string;
  t: string[];
  s: number[];
  b: number;
  a: string[];
  h: number;
  w: number;
  leg?: number;
  myth?: number;
  baby?: number;
  sp?: number;    // base species ID for alt forms
  form?: string;  // form category
}

interface RawMove {
  i: number;
  n: string;
  d: string;
  t: string;
  c: string;
  p: number;
  a: number;
  pp: number;
}

const rawPokemon = pokemonRaw as Record<string, RawPokemon>;
const rawMoves = movesRaw as Record<string, RawMove>;
const rawLearnsets = learnsetsRaw as Record<string, number[]>;

function classifyRoles(stats: Stats): Role[] {
  const roles: Role[] = [];
  const offensive = Math.max(stats.atk, stats.spa);
  if (offensive >= 95 && stats.spe >= 80) roles.push('sweeper');
  if (stats.def + stats.spd >= 200) roles.push('wall');
  if (stats.hp >= 95 && (stats.def + stats.spd) >= 150) roles.push('tank');
  if (stats.spe >= 105) roles.push('speedster');
  return roles;
}

function getGenForId(id: number): number {
  return GENERATIONS.find(g => id >= g.range[0] && id <= g.range[1])?.num ?? 0;
}
export const getGen = getGenForId;

// Build the full Pokémon map once at module load — no runtime fetches
export const POKEMON_BY_ID: Record<number, Pokemon> = {};
export const POKEMON_LIST: { id: number; name: string }[] = [];

for (const r of Object.values(rawPokemon)) {
  const stats: Stats = { hp: r.s[0], atk: r.s[1], def: r.s[2], spa: r.s[3], spd: r.s[4], spe: r.s[5] };
  // For alt forms (id > 10000), use the base species ID to compute generation,
  // since HOME/games treat them as their species for transfer purposes
  const genSource = (r.sp && r.i > 10000) ? r.sp : r.i;
  POKEMON_BY_ID[r.i] = {
    id: r.i,
    name: r.n,
    display: r.d,
    types: r.t as Pokemon['types'],
    stats,
    bst: r.b,
    roles: classifyRoles(stats),
    abilities: r.a,
    height: r.h,
    weight: r.w,
    legendary: r.leg === 1,
    mythical: r.myth === 1,
    baby: r.baby === 1,
    gen: getGenForId(genSource),
    baseSpeciesId: r.sp,
    form: r.form as Pokemon['form'],
  };
  POKEMON_LIST.push({ id: r.i, name: r.n });
}
POKEMON_LIST.sort((a, b) => a.id - b.id);

export const POKEMON_TOTAL = POKEMON_LIST.length;

// ============================================================
// MOVES — fully loaded with type, category, power, accuracy
// ============================================================

export const MOVES_BY_ID: Record<number, Move> = {};
export const MOVES_LIST: Move[] = [];

for (const r of Object.values(rawMoves)) {
  const m: Move = {
    id: r.i,
    name: r.n,
    display: r.d,
    type: r.t as Move['type'],
    category: (r.c as Move['category']) || 'status',
    power: r.p,
    accuracy: r.a,
    pp: r.pp,
  };
  MOVES_BY_ID[r.i] = m;
  MOVES_LIST.push(m);
}
MOVES_LIST.sort((a, b) => a.display.localeCompare(b.display));

// ============================================================
// LEARNSETS
// ============================================================

export function getLearnset(pokemonId: number): Move[] {
  const ids = rawLearnsets[String(pokemonId)] || [];
  return ids
    .map(mid => MOVES_BY_ID[mid])
    .filter((m): m is Move => Boolean(m));
}

// Suggest 4 default moves for a Pokémon: high power, STAB-biased, diverse coverage
export function suggestDefaultMoves(pokemonId: number): number[] {
  const p = POKEMON_BY_ID[pokemonId];
  if (!p) return [];
  const learnset = getLearnset(pokemonId);
  const scored = learnset.map(m => {
    let score = m.power || 0;
    if (p.types.includes(m.type)) score *= 1.5;
    if (m.category === 'status') score = 30;
    if (m.accuracy && m.accuracy < 70) score *= 0.6;
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picked: number[] = [];
  const usedTypes = new Set<string>();
  for (const { m } of scored) {
    if (picked.length >= 4) break;
    if (m.category !== 'status' && usedTypes.has(m.type) && picked.length < 3) continue;
    picked.push(m.id);
    usedTypes.add(m.type);
  }
  for (const { m } of scored) {
    if (picked.length >= 4) break;
    if (!picked.includes(m.id)) picked.push(m.id);
  }
  return picked;
}

// ============================================================
// SPRITES
// ============================================================

export const padId = (id: number) => `#${String(id).padStart(4, '0')}`;

export function spriteUrl(id: number, kind: SpriteKind = 'pixel-default'): string {
  const base = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  switch (kind) {
    case 'pixel-default':     return `${base}/${id}.png`;
    case 'pixel-shiny':       return `${base}/shiny/${id}.png`;
    case 'artwork-default':   return `${base}/other/official-artwork/${id}.png`;
    case 'artwork-shiny':     return `${base}/other/official-artwork/shiny/${id}.png`;
    case 'home-default':      return `${base}/other/home/${id}.png`;
    case 'home-shiny':        return `${base}/other/home/shiny/${id}.png`;
    case 'home-female':       return `${base}/other/home/female/${id}.png`;
    case 'home-shiny-female': return `${base}/other/home/shiny/female/${id}.png`;
    // Gen 5 animated GIFs from Pokémon Showdown — premium-gated.
    // These render the Black/White/B2W2 in-battle animated sprites.
    case 'animated-gen5':       return animatedGen5Url(id, false);
    case 'animated-gen5-shiny': return animatedGen5Url(id, true);
    default:                  return `${base}/${id}.png`;
  }
}

function animatedGen5Url(id: number, shiny: boolean): string {
  // Showdown's sprite slug is `<species>-<formslug>` where the form portion
  // collapses internal hyphens (mega-x → megax, dusk-mane → duskmane) and
  // a few species names themselves collapse (mr-mime → mrmime). Hand-tuned.
  const p = POKEMON_BY_ID[id];
  if (!p) return spriteUrl(id, shiny ? 'pixel-shiny' : 'pixel-default');
  const dir = shiny ? 'ani-shiny' : 'ani';
  const raw = p.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '');
  return `https://play.pokemonshowdown.com/sprites/${dir}/${showdownSlug(raw)}.gif`;
}

// Species whose canonical name is multi-token but Showdown collapses to one.
// (Some of these — the Gen 9 paradox mons — have no animated sprite on Showdown
// at all; the slug is still correct so the fallback chain probes the right URL.)
const SHOWDOWN_SPECIES_ALIASES: Record<string, string> = {
  'mr-mime': 'mrmime', 'mr-rime': 'mrrime', 'mime-jr': 'mimejr',
  'type-null': 'typenull', 'ho-oh': 'hooh', 'porygon-z': 'porygonz',
  'jangmo-o': 'jangmoo', 'hakamo-o': 'hakamoo', 'kommo-o': 'kommoo',
  'tapu-koko': 'tapukoko', 'tapu-lele': 'tapulele', 'tapu-bulu': 'tapubulu', 'tapu-fini': 'tapufini',
  'wo-chien': 'wochien', 'chien-pao': 'chienpao', 'ting-lu': 'tinglu', 'chi-yu': 'chiyu',
  'great-tusk': 'greattusk', 'scream-tail': 'screamtail', 'brute-bonnet': 'brutebonnet',
  'flutter-mane': 'fluttermane', 'slither-wing': 'slitherwing', 'sandy-shocks': 'sandyshocks',
  'iron-treads': 'irontreads', 'iron-bundle': 'ironbundle', 'iron-hands': 'ironhands',
  'iron-jugulis': 'ironjugulis', 'iron-moth': 'ironmoth', 'iron-thorns': 'ironthorns',
  'roaring-moon': 'roaringmoon', 'iron-valiant': 'ironvaliant', 'walking-wake': 'walkingwake',
  'iron-leaves': 'ironleaves', 'gouging-fire': 'gougingfire', 'raging-bolt': 'ragingbolt',
  'iron-boulder': 'ironboulder', 'iron-crown': 'ironcrown',
};

// Full-name (species+form) overrides where neither the default-collapse rule
// nor mechanical hyphen-collapse produces Showdown's actual slug. Verified by
// HEAD-probing the live ani host (see tests/validate-showdown-slugs.mjs).
const SHOWDOWN_FORM_OVERRIDES: Record<string, string> = {
  // Gendered species where the gender IS the slug identity (no dash)
  'nidoran-f': 'nidoranf', 'nidoran-m': 'nidoranm',
  // Necrozma stub entries map to the fused sprite names
  'necrozma-dusk': 'necrozma-duskmane', 'necrozma-dawn': 'necrozma-dawnwings',
  // Galarian Darmanitan default drops the trailing "standard"
  'darmanitan-galar-standard': 'darmanitan-galar',
  // Ash-Greninja (Battle Bond) has its own animated sprite
  'greninja-battle-bond': 'greninja-ash',
  // Every Minior meteor shell shares one sprite; the red core has none either
  'minior-red-meteor': 'minior', 'minior-orange-meteor': 'minior',
  'minior-yellow-meteor': 'minior', 'minior-green-meteor': 'minior',
  'minior-blue-meteor': 'minior', 'minior-indigo-meteor': 'minior',
  'minior-violet-meteor': 'minior', 'minior-red': 'minior',
};

// Form tokens that denote the in-game DEFAULT form — Showdown serves these
// under the bare species name (deoxys-normal → deoxys, meowstic-male → meowstic).
const SHOWDOWN_DEFAULT_FORMS = new Set([
  'normal', 'plant', 'altered', 'land', 'red-striped', 'standard',
  'incarnate', 'ordinary', 'aria', 'shield', 'average', 'baile',
  'midday', 'solo', 'disguised', 'amped', 'ice', 'full-belly',
  'single-strike', 'zero', 'curly', 'two-segment', 'family-of-four',
  'green-plumage', '50', 'male', 'own-tempo',
]);

export function showdownSlug(raw: string): string {
  if (SHOWDOWN_FORM_OVERRIDES[raw]) return SHOWDOWN_FORM_OVERRIDES[raw];

  // Multi-token species: alias the species, then resolve the trailing form.
  for (const [from, to] of Object.entries(SHOWDOWN_SPECIES_ALIASES)) {
    if (raw === from) return to;
    if (raw.startsWith(from + '-')) {
      const form = raw.slice(from.length + 1);
      return SHOWDOWN_DEFAULT_FORMS.has(form) ? to : to + '-' + collapseFormSlug(form);
    }
  }

  const dashIdx = raw.indexOf('-');
  if (dashIdx === -1) return raw;
  const species = raw.slice(0, dashIdx);
  const form = raw.slice(dashIdx + 1);
  if (SHOWDOWN_DEFAULT_FORMS.has(form)) return species;
  return species + '-' + collapseFormSlug(form);
}

function collapseFormSlug(form: string): string {
  if (form === 'female') return 'f';
  if (form === 'male') return 'm';
  // Showdown omits the "plumage" descriptor (squawkabilly-blue, not -blueplumage)
  form = form.replace(/-plumage$/, '');
  // Collapse internal dashes: mega-x → megax, rapid-strike → rapidstrike
  return form.replace(/-/g, '');
}

export const pixelSprite = (id: number, shiny = false) =>
  spriteUrl(id, shiny ? 'pixel-shiny' : 'pixel-default');
export const artworkSprite = (id: number, shiny = false) =>
  spriteUrl(id, shiny ? 'artwork-shiny' : 'artwork-default');
export const homeSprite = (id: number, shiny = false) =>
  spriteUrl(id, shiny ? 'home-shiny' : 'home-default');

export { STAT_KEYS };
