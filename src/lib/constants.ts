import type { PokemonType, Role, Stats } from './types';

export const TYPES: PokemonType[] = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

export const STAT_KEYS: (keyof Stats)[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export const STAT_LABELS: Record<keyof Stats, string> = {
  hp: 'HP', atk: 'ATK', def: 'DEF', spa: 'SPA', spd: 'SPD', spe: 'SPE'
};

// Full 18-type matrix — TYPE_CHART[attacker][defender] = multiplier
export const TYPE_CHART: Record<PokemonType, Partial<Record<PokemonType, number>>> = {
  normal:   { rock: 0.5, ghost: 0, steel: 0.5 },
  fire:     { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water:    { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass:    { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice:      { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison:   { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground:   { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying:   { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic:  { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug:      { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock:     { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost:    { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon:   { dragon: 2, steel: 0.5, fairy: 0 },
  dark:     { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel:    { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy:    { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

export const TYPE_COLORS: Record<PokemonType, string> = {
  normal: '#9fa19f',  fire: '#e62829',     water: '#2980ef',    electric: '#fac000',
  grass: '#3fa129',   ice: '#3dcef3',      fighting: '#ff8000', poison: '#9141cb',
  ground: '#915121',  flying: '#81b9ef',   psychic: '#ef4179', bug: '#91a119',
  rock: '#afa981',    ghost: '#704170',    dragon: '#5060e1',  dark: '#624d4e',
  steel: '#60a1b8',   fairy: '#ef70ef',
};

export const GENERATIONS = [
  { num: 1, label: 'Kanto',   range: [1, 151]    as [number, number] },
  { num: 2, label: 'Johto',   range: [152, 251]  as [number, number] },
  { num: 3, label: 'Hoenn',   range: [252, 386]  as [number, number] },
  { num: 4, label: 'Sinnoh',  range: [387, 493]  as [number, number] },
  { num: 5, label: 'Unova',   range: [494, 649]  as [number, number] },
  { num: 6, label: 'Kalos',   range: [650, 721]  as [number, number] },
  { num: 7, label: 'Alola',   range: [722, 809]  as [number, number] },
  { num: 8, label: 'Galar',   range: [810, 905]  as [number, number] },
  { num: 9, label: 'Paldea',  range: [906, 1025] as [number, number] },
];

export const ROLES: Role[] = ['sweeper', 'wall', 'tank', 'speedster'];

export const ROLE_DESC: Record<Role, string> = {
  sweeper: 'high offense + speed',
  wall: 'high defenses',
  tank: 'high HP + bulk',
  speedster: 'very fast',
};

export interface PresetTeam {
  id: string;
  label: string;
  ids: number[];
}

export const STARTER_TEAMS: PresetTeam[] = [
  { id: 'kanto',  label: 'Kanto Classic',  ids: [3, 6, 9, 25, 143, 149] },
  { id: 'johto',  label: 'Johto Heroes',   ids: [154, 157, 160, 181, 214, 248] },
  { id: 'hoenn',  label: 'Hoenn Power',    ids: [254, 257, 260, 282, 373, 376] },
  { id: 'sinnoh', label: 'Sinnoh Squad',   ids: [389, 392, 395, 445, 448, 468] },
  { id: 'unova',  label: 'Unova Strong',   ids: [497, 500, 503, 530, 635, 637] },
  { id: 'kalos',  label: 'Kalos Crew',     ids: [652, 655, 658, 663, 700, 706] },
  { id: 'alola',  label: 'Alola Trip',     ids: [724, 727, 730, 745, 778, 784] },
  { id: 'galar',  label: 'Galar Tour',     ids: [748, 812, 815, 818, 823, 887] },
  { id: 'paldea', label: 'Paldea Pride',   ids: [908, 911, 914, 934, 959, 998] },
];

export const THEMED_TEAMS: PresetTeam[] = [
  { id: 'pseudo',  label: 'Pseudo-Legendaries', ids: [149, 248, 373, 376, 445, 635] },
  { id: 'eevee',   label: 'Eevee Evolutions',   ids: [134, 135, 136, 196, 197, 470] },
  { id: 'starters', label: 'All Starter Finals', ids: [3, 6, 9, 154, 157, 160] },
  { id: 'gen9',    label: 'Modern Meta',        ids: [908, 998, 1000, 1019, 970, 945] },
  { id: 'legends', label: 'Legendary Beasts +', ids: [243, 244, 245, 380, 381, 384] },
  { id: 'creation', label: 'Creation Trio',     ids: [483, 484, 487, 480, 481, 482] },
  { id: 'ubs',     label: 'Ultra Beasts',       ids: [793, 794, 795, 796, 797, 798] },
  { id: 'paradox', label: 'Paradox Pokémon',    ids: [984, 985, 986, 987, 988, 989] },
  // Form-themed teams — use the form IDs from PokeAPI
  { id: 'megas-kanto', label: 'Mega Kanto',     ids: [10033, 10034, 10036, 10037, 10044, 10038] },  // Venusaur, Charizard X, Blastoise, Alakazam, Mewtwo Y, Gengar — all Mega
  { id: 'alolan',  label: 'Alolan Forms',       ids: [10100, 10101, 10103, 10104, 10105, 10106] },  // Rattata-A, Raticate-A, Raichu-A, Sandshrew-A, Sandslash-A, Vulpix-A
  { id: 'galarian', label: 'Galarian Forms',    ids: [10161, 10164, 10166, 10167, 10173, 10174] },  // Meowth-G, Ponyta-G, Slowpoke-G, Slowbro-G, Corsola-G, Zigzagoon-G
  { id: 'hisuian', label: 'Hisuian Forms',      ids: [10229, 10230, 10232, 10239, 10233, 10240] },  // Growlithe-H, Arcanine-H, Voltorb-H, Sneasel-H, Electrode-H, Sliggoo-H
];

export const STORAGE_KEY = 'trainerscodex.v2';

// ============================================================
// GAME COMPATIBILITY
// ============================================================
// For each mainline game on Switch and later, list which generations
// of Pokémon can exist there (either natively or via HOME transfer).
// Used to flag whether the user's team is playable in a given game.
// Generations are 1-9.

export interface GameInfo {
  id: string;
  label: string;
  shortLabel: string;
  console: string;
  releaseYear: number;
  // Which generations this game supports (via dex + HOME transfer)
  supportedGens: number[];
  // For monsters introduced later, can they transfer back? (sometimes no)
  notes: string;
}

export const MAINLINE_GAMES: GameInfo[] = [
  { id: 'lgpe',  label: "Pokémon: Let's Go Pikachu/Eevee", shortLabel: "Let's Go",      console: 'Switch', releaseYear: 2018, supportedGens: [1],                notes: 'Only Kanto. Mew/Mewtwo via in-game only.' },
  { id: 'swsh',  label: 'Pokémon Sword/Shield',            shortLabel: 'Sword/Shield',   console: 'Switch', releaseYear: 2019, supportedGens: [1,2,3,4,5,6,7,8],   notes: 'Galar dex + HOME transfer.' },
  { id: 'bdsp',  label: 'Brilliant Diamond / Shining Pearl', shortLabel: 'BDSP',         console: 'Switch', releaseYear: 2021, supportedGens: [1,2,3,4],          notes: 'Sinnoh dex only. Some HOME-transferred mons.' },
  { id: 'pla',   label: 'Pokémon Legends: Arceus',          shortLabel: 'Legends Arceus', console: 'Switch', releaseYear: 2022, supportedGens: [1,2,3,4,5,6,7,8],  notes: 'Hisui dex + HOME. Hisuian forms.' },
  { id: 'sv',    label: 'Scarlet / Violet',                shortLabel: 'Scarlet/Violet', console: 'Switch', releaseYear: 2022, supportedGens: [1,2,3,4,5,6,7,8,9], notes: 'Paldea dex + HOME. Most permissive Switch-era game.' },
  { id: 'plza',  label: 'Pokémon Legends: Z-A',            shortLabel: 'Legends Z-A',    console: 'Switch 2', releaseYear: 2025, supportedGens: [1,2,3,4,5,6,7,8,9], notes: 'Newest mainline. HOME 4.0 compatible.' },
];

export const LATEST_GAME_ID = 'plza';

// Pokémon NOT in HOME at all (cannot be transferred anywhere) — shown as warnings.
// Source: serebii/bulbapedia HOME compatibility lists, current as of HOME 4.0.0 (April 2026).
// This list is intentionally conservative — only the truly stranded mons.
export const HOME_BLOCKED_IDS = new Set<number>([
  // None confirmed as of HOME 4.0 — all reachable via some chain.
  // Spinda alt patterns and Vivillon alt patterns are aggregated into base id.
]);

// ============================================================
// COSMETIC PALETTES (monetization angle — Pokémon shiny + custom)
// ============================================================

export type SpriteVariant =
  | 'pixel-default'
  | 'pixel-shiny'
  | 'artwork-default'
  | 'artwork-shiny'
  | 'home-default'
  | 'home-shiny'
  | 'home-female'
  | 'home-shiny-female'
  | 'animated-gen5'
  | 'animated-gen5-shiny';

export const SPRITE_VARIANT_LABELS: Record<SpriteVariant, string> = {
  'pixel-default':       'Pixel · Default',
  'pixel-shiny':         'Pixel · Shiny ⭐',
  'artwork-default':     'Artwork · Default',
  'artwork-shiny':       'Artwork · Shiny ⭐',
  'home-default':        '3D HOME · Default',
  'home-shiny':          '3D HOME · Shiny ⭐',
  'home-female':         '3D HOME · Female',
  'home-shiny-female':   '3D HOME · Female Shiny ⭐',
  'animated-gen5':       'Animated Gen 5 (BW)',
  'animated-gen5-shiny': 'Animated Gen 5 · Shiny ⭐',
};

// ============================================================
// HELD ITEMS — common competitive selections (v6)
// ============================================================
// Curated from real meta usage on Smogon. Items are character-canonical
// (real Pokémon items, not invented). Order is approximate usage frequency.

export const HELD_ITEMS: { id: string; label: string; effect: string }[] = [
  { id: 'leftovers',       label: 'Leftovers',       effect: 'Heals 1/16 HP each turn.' },
  { id: 'choice-band',     label: 'Choice Band',     effect: '+50% Attack, but locked into one move.' },
  { id: 'choice-specs',    label: 'Choice Specs',    effect: '+50% Sp. Atk, but locked into one move.' },
  { id: 'choice-scarf',    label: 'Choice Scarf',    effect: '+50% Speed, but locked into one move.' },
  { id: 'life-orb',        label: 'Life Orb',        effect: '+30% damage. Loses 10% HP per attack.' },
  { id: 'focus-sash',      label: 'Focus Sash',      effect: 'Survives one OHKO at 1 HP. Consumed.' },
  { id: 'assault-vest',    label: 'Assault Vest',    effect: '+50% Sp. Def. Cannot use status moves.' },
  { id: 'heavy-duty-boots', label: 'Heavy-Duty Boots', effect: 'Ignores entry hazards on switch.' },
  { id: 'eviolite',        label: 'Eviolite',        effect: '+50% Def & Sp. Def on non-fully-evolved.' },
  { id: 'rocky-helmet',    label: 'Rocky Helmet',    effect: 'Contact attackers lose 1/6 HP.' },
  { id: 'sitrus-berry',    label: 'Sitrus Berry',    effect: 'Heals 25% HP when below 50%. Consumed.' },
  { id: 'lum-berry',       label: 'Lum Berry',       effect: 'Cures any major status. Consumed.' },
  { id: 'black-sludge',    label: 'Black Sludge',    effect: 'Heals Poison-types; damages others.' },
  { id: 'mental-herb',     label: 'Mental Herb',     effect: 'Cures attraction/taunt/encore. Consumed.' },
  { id: 'power-herb',      label: 'Power Herb',      effect: 'Skips charge turn of a two-turn move.' },
  { id: 'wide-lens',       label: 'Wide Lens',       effect: '+10% accuracy on all moves.' },
  { id: 'expert-belt',     label: 'Expert Belt',     effect: '+20% damage on super-effective hits.' },
  { id: 'air-balloon',     label: 'Air Balloon',     effect: 'Grants Ground immunity until hit.' },
  { id: 'light-clay',      label: 'Light Clay',      effect: 'Light Screen/Reflect last 8 turns.' },
  { id: 'mystic-water',    label: 'Mystic Water',    effect: '+20% damage on Water moves.' },
  { id: 'charcoal',        label: 'Charcoal',        effect: '+20% damage on Fire moves.' },
  { id: 'magnet',          label: 'Magnet',          effect: '+20% damage on Electric moves.' },
  { id: 'soft-sand',       label: 'Soft Sand',       effect: '+20% damage on Ground moves.' },
  { id: 'silver-powder',   label: 'Silver Powder',   effect: '+20% damage on Bug moves.' },
  { id: 'twisted-spoon',   label: 'Twisted Spoon',   effect: '+20% damage on Psychic moves.' },
  { id: 'black-belt',      label: 'Black Belt',      effect: '+20% damage on Fighting moves.' },
  { id: 'spell-tag',       label: 'Spell Tag',       effect: '+20% damage on Ghost moves.' },
  { id: 'sharp-beak',      label: 'Sharp Beak',      effect: '+20% damage on Flying moves.' },
  { id: 'soothe-bell',     label: 'Soothe Bell',     effect: 'Speeds up friendship gain.' },
  { id: 'lucky-egg',       label: 'Lucky Egg',       effect: '+50% XP gain.' },
];

// ============================================================
// POSTER ART STYLES — for the generated team poster
// ============================================================

export type ArtStyle =
  | 'pixel-crt'
  | 'pixel-grid'
  | 'arcade-cabinet'
  | 'gameboy-mono'
  | 'tcg-card'
  | 'polaroid'
  | 'manifest'
  | 'sticker-sheet'
  | 'holo-foil'
  | 'blueprint'
  | 'grainy-cinema'
  | 'type-collage';

export interface ArtStyleInfo {
  id: ArtStyle;
  label: string;
  desc: string;
  premium?: boolean;
}

export const ART_STYLES: ArtStyleInfo[] = [
  { id: 'pixel-crt',     label: 'CRT Manifest',    desc: 'amber-on-black terminal · scan lines' },
  { id: 'pixel-grid',    label: 'Pixel Grid',      desc: 'clean grid · pixel sprites' },
  { id: 'manifest',      label: 'Editorial',       desc: 'large artwork · serif typography', premium: true },
  { id: 'gameboy-mono',  label: 'Game Boy',        desc: '4-color green monochrome' },
  { id: 'arcade-cabinet', label: 'Arcade Cabinet', desc: 'neon · CRT vignette · retro-future', premium: true },
  { id: 'tcg-card',      label: 'Trading Card',    desc: 'foil card layout · 6-up sheet', premium: true },
  { id: 'polaroid',      label: 'Polaroid Stack',  desc: 'tilted photos · handwritten labels' },
  { id: 'sticker-sheet', label: 'Sticker Sheet',   desc: 'die-cut stickers · pastel pop', premium: true },
  // v5 — inspired by 2026 design-trend research
  { id: 'holo-foil',     label: 'Holographic Foil', desc: 'iridescent rainbow shine · full-art', premium: true },
  { id: 'blueprint',     label: 'Blueprint',        desc: 'technical drawing · exploded view' },
  { id: 'grainy-cinema', label: 'Grainy Cinema',    desc: 'soft-focus · film grain · dreamy', premium: true },
  { id: 'type-collage',  label: 'Type Collage',     desc: 'DIY zine · cut-paper aesthetic' },
];

// ============================================================
// TRAINER AVATARS — built-in selection, no external requests
// ============================================================

export interface TrainerAvatar {
  id: string;
  label: string;
  // 3D HOME sprite URL on raw.githubusercontent.com (we reuse PokeAPI sprite mirror)
  // For people-trainers we use lucide-react icons; for Pokémon-as-trainer we use sprites.
  kind: 'pokemon' | 'icon';
  ref: string | number;
}

// Built-in trainer avatar bank. Half are Pokémon partners (Pikachu, Eevee, etc.)
// half are abstract user icons. The user can also upload their own photo.
export const TRAINER_AVATARS: TrainerAvatar[] = [
  { id: 'pikachu',    label: 'Pikachu',    kind: 'pokemon', ref: 25 },
  { id: 'eevee',      label: 'Eevee',      kind: 'pokemon', ref: 133 },
  { id: 'charmander', label: 'Charmander', kind: 'pokemon', ref: 4 },
  { id: 'bulbasaur',  label: 'Bulbasaur',  kind: 'pokemon', ref: 1 },
  { id: 'squirtle',   label: 'Squirtle',   kind: 'pokemon', ref: 7 },
  { id: 'mimikyu',    label: 'Mimikyu',    kind: 'pokemon', ref: 778 },
  { id: 'gengar',     label: 'Gengar',     kind: 'pokemon', ref: 94 },
  { id: 'snorlax',    label: 'Snorlax',    kind: 'pokemon', ref: 143 },
  { id: 'lucario',    label: 'Lucario',    kind: 'pokemon', ref: 448 },
  { id: 'umbreon',    label: 'Umbreon',    kind: 'pokemon', ref: 197 },
  { id: 'sylveon',    label: 'Sylveon',    kind: 'pokemon', ref: 700 },
  { id: 'sprigatito', label: 'Sprigatito', kind: 'pokemon', ref: 906 },
  { id: 'cap-red',    label: 'Red Cap',    kind: 'icon',    ref: 'cap-red' },
  { id: 'cap-blue',   label: 'Blue Cap',   kind: 'icon',    ref: 'cap-blue' },
  { id: 'cap-purple', label: 'Purple Cap', kind: 'icon',    ref: 'cap-purple' },
  { id: 'rocket',     label: 'Rocket',     kind: 'icon',    ref: 'rocket' },
];
