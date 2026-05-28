// ============================================================
// TYPES
// ============================================================

export type PokemonType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export interface Stats {
  hp: number; atk: number; def: number; spa: number; spd: number; spe: number;
}

export type Category = 'normal' | 'legendary' | 'mythical' | 'ub' | 'paradox' | 'pseudo' | 'baby';

export type FormCategory =
  | 'mega'
  | 'primal'
  | 'alolan'
  | 'galarian'
  | 'hisuian'
  | 'paldean'
  | 'gigantamax'
  | 'therian'
  | 'origin'
  | 'fusion'
  | 'crowned'
  | 'eternamax'
  | 'mode'
  | 'style'
  | 'form';

export interface Pokemon {
  id: number;
  name: string;
  display: string;
  types: PokemonType[];
  stats: Stats;
  bst: number;
  roles: Role[];
  abilities: string[];
  height: number;
  weight: number;
  // Category flags
  legendary?: boolean;
  mythical?: boolean;
  baby?: boolean;
  // Form info
  baseSpeciesId?: number;     // For alt forms: the base species ID (e.g. Mega Charizard X → 6)
  form?: FormCategory;        // 'mega', 'alolan', 'gigantamax', etc.
  // Derived: which generation it belongs to
  gen?: number;
}

export type Role = 'sweeper' | 'wall' | 'tank' | 'speedster';

// ============================================================
// MOVES
// ============================================================

export type MoveCategory = 'physical' | 'special' | 'status';

export interface Move {
  id: number;
  name: string;         // 'flamethrower' lowercase
  display: string;      // 'Flamethrower'
  type: PokemonType;
  category: MoveCategory;
  power: number;        // 0 for status
  accuracy: number;     // 0 if always hits
  pp: number;
}

// ============================================================
// SPRITES
// ============================================================

export type SpriteKind =
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

// A "team member" is a Pokémon with chosen customizations
export interface TeamMember {
  id: number;                    // Pokémon ID
  shiny: boolean;
  nickname?: string;
  moves?: number[];              // up to 4 move IDs
  ability?: string;
  heldItem?: string;             // common competitive held item (Leftovers, Choice Band, etc.)
  sprite?: SpriteKind;           // optional cosmetic variant
  teraType?: PokemonType;        // Terastallization type (Gen 9+)
}

export interface SavedTeam {
  id: string;
  name: string;
  members: (TeamMember | null)[];  // legacy may have plain ids
  createdAt: number;
  notes?: string;
}

// Legacy v1 storage shape (id-only team) — used during migration
export interface LegacySavedTeam {
  id: string;
  name: string;
  ids: (number | null)[];
  createdAt: number;
}

// ============================================================
// TRAINER PROFILE
// ============================================================

export interface TrainerProfile {
  name: string;
  title?: string;        // "Champion", "Casual Trainer", etc.
  region?: string;       // "Kanto", "Paldea", etc.
  avatarId?: string;     // ID from TRAINER_AVATARS
  customAvatarDataUrl?: string;   // user-uploaded image as data URL
  catchphrase?: string;
  favoriteType?: PokemonType;
  signaturePokemonId?: number;
  motto?: string;
}

// ============================================================
// ANALYSIS
// ============================================================

export interface CounterCandidate {
  p: Pokemon;
  score: number;
  reasons: string[];
}

export interface SuggestionCandidate {
  p: Pokemon;
  score: number;
  reasons: string[];
}

export interface DefRow {
  type: PokemonType;
  weak4: number;
  weak2: number;
  neutral: number;
  resist2: number;
  resist4: number;
  immune: number;
}

export interface OffRow {
  type: PokemonType;
  coverers: number;
  hits: number;
}

export interface ThreatInfo {
  type: PokemonType;
  weakCount: number;
  weak4Count: number;
  resistCount: number;
}

export interface StatAggregate {
  total: Stats;
  avg: Stats;
  bst: number;
}

export type ToastKind = 'info' | 'success' | 'warn';
