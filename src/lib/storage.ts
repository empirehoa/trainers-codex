import type {
  SavedTeam, TeamMember, LegacySavedTeam, TrainerProfile, PokemonType, Nature, Stats, SpriteKind,
} from './types';
import { STORAGE_KEY, TYPES, NATURES, STAT_KEYS, SPRITE_VARIANT_LABELS } from './constants';
import { POKEMON_BY_ID, MOVES_BY_ID } from './pokemon';

export interface CurrentTeamState {
  members: (TeamMember | null)[];
  name: string;
}

export interface StorageShape {
  teams: SavedTeam[];
  current: CurrentTeamState | null;
  trainer: TrainerProfile | null;
  premium?: boolean;
  /**
   * Favourited Pokémon ids.
   *
   * Stored as an array rather than a Set because this shape is JSON round-
   * tripped; the app holds it as a Set. Absent in every pre-existing payload,
   * so `loadStorage` defaults it — no migration step and no version bump.
   */
  favorites?: number[];
}

const LEGACY_KEY = 'trainerscodex.v1';

// ============================================================
// SHAPE VALIDATION
// ============================================================
//
// Everything below the storage boundary trusts its inputs (CLAUDE.md, code
// style). That contract only holds if the boundary itself refuses anything
// that is not the shape it claims to be. A team member with `moves: "x"` or a
// team whose `name` is an object is *plausible* JSON — it passes `Array.isArray`
// and `||` checks — and used to reach `member.moves.slice(0,4).map(...)` and
// `teamName.toLowerCase()` unchanged, unmounting the React tree. Because the
// payload was already persisted, every reload crashed the same way until the
// user cleared localStorage by hand.
//
// These sanitizers are the single place wrong-typed data is dropped. They run
// on every read (loadStorage), on Library import, and on the share-landing
// restore, so nothing downstream needs a defensive check.

/** Longest team / trainer name kept from storage or an import. */
export const MAX_NAME_LENGTH = 60;
/** Longest free-text member field (nickname, ability, held item). */
export const MAX_FIELD_LENGTH = 40;

const TYPE_SET = new Set<string>(TYPES);
const NATURE_SET = new Set<string>(NATURES);
const SPRITE_SET = new Set<string>(Object.keys(SPRITE_VARIANT_LABELS));

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const isFiniteNumber = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x);

function shortString(x: unknown, max: number): string | undefined {
  if (typeof x !== 'string') return undefined;
  const s = x.trim().slice(0, max);
  return s || undefined;
}

/**
 * Coerce anything into a display name: a trimmed string of at most
 * `MAX_NAME_LENGTH` characters, `''` for anything that is not a string.
 */
export function sanitizeName(x: unknown, max = MAX_NAME_LENGTH): string {
  return typeof x === 'string' ? x.trim().slice(0, max) : '';
}

function sanitizeSpread(x: unknown, max: number): Partial<Stats> | undefined {
  if (!isRecord(x)) return undefined;
  const out: Partial<Stats> = {};
  let any = false;
  for (const k of STAT_KEYS) {
    const v = x[k];
    if (isFiniteNumber(v)) {
      out[k] = Math.max(0, Math.min(max, Math.round(v)));
      any = true;
    }
  }
  return any ? out : undefined;
}

/**
 * Coerce anything into a `TeamMember`, or `null` when it cannot be one.
 *
 * The id must resolve in the embedded dex; every optional field is kept only
 * when it is exactly the type the UI expects, and dropped otherwise (a member
 * with a junk nickname is still a valid member — just without the nickname).
 */
export function sanitizeMember(x: unknown): TeamMember | null {
  if (!isRecord(x)) return null;
  const id = x.id;
  if (!isFiniteNumber(id) || !POKEMON_BY_ID[id]) return null;

  const m: TeamMember = { id, shiny: x.shiny === true };

  const nickname = shortString(x.nickname, MAX_FIELD_LENGTH);
  if (nickname) m.nickname = nickname;
  const ability = shortString(x.ability, MAX_FIELD_LENGTH);
  if (ability) m.ability = ability;
  const heldItem = shortString(x.heldItem, MAX_FIELD_LENGTH);
  if (heldItem) m.heldItem = heldItem;

  if (Array.isArray(x.moves)) {
    const moves = x.moves
      .filter((mid): mid is number => isFiniteNumber(mid) && !!MOVES_BY_ID[mid])
      .slice(0, 4);
    if (moves.length) m.moves = moves;
  }
  if (typeof x.sprite === 'string' && SPRITE_SET.has(x.sprite)) m.sprite = x.sprite as SpriteKind;
  if (typeof x.teraType === 'string' && TYPE_SET.has(x.teraType)) m.teraType = x.teraType as PokemonType;
  if (typeof x.nature === 'string' && NATURE_SET.has(x.nature)) m.nature = x.nature as Nature;

  const evs = sanitizeSpread(x.evs, 252);
  if (evs) m.evs = evs;
  const ivs = sanitizeSpread(x.ivs, 31);
  if (ivs) m.ivs = ivs;

  return m;
}

/** Exactly six slots, each a valid member or null. */
export function sanitizeMembers(x: unknown): (TeamMember | null)[] {
  const src = Array.isArray(x) ? x.slice(0, 6) : [];
  const members = src.map(sanitizeMember);
  while (members.length < 6) members.push(null);
  return members;
}

/**
 * Coerce a stored / imported team. Returns `null` only when the value is not
 * an object at all; a team with no valid members is still returned (six empty
 * slots), so a user's saved-team list keeps its length.
 */
export function sanitizeTeam(x: unknown): SavedTeam | null {
  if (!isRecord(x)) return null;
  const legacyIds = Array.isArray(x.ids)
    ? x.ids.map(id => (isFiniteNumber(id) && id > 0 ? { id, shiny: false } : null))
    : null;
  const members = sanitizeMembers('members' in x ? x.members : legacyIds);
  const team: SavedTeam = {
    id: typeof x.id === 'string' && x.id ? x.id.slice(0, 64) : genId(),
    name: sanitizeName(x.name) || 'Untitled',
    members,
    createdAt: isFiniteNumber(x.createdAt) ? x.createdAt : Date.now(),
  };
  const notes = shortString(x.notes, 500);
  if (notes) team.notes = notes;
  return team;
}

/** Coerce a stored trainer profile; `null` unless it carries a string name. */
export function sanitizeTrainer(x: unknown): TrainerProfile | null {
  if (!isRecord(x)) return null;
  const name = sanitizeName(x.name, MAX_FIELD_LENGTH);
  if (!name) return null;
  const t: TrainerProfile = { name };
  const title = shortString(x.title, MAX_FIELD_LENGTH);
  if (title) t.title = title;
  const region = shortString(x.region, MAX_FIELD_LENGTH);
  if (region) t.region = region;
  const avatarId = shortString(x.avatarId, MAX_FIELD_LENGTH);
  if (avatarId) t.avatarId = avatarId;
  // Uploaded avatars are ~30 KB webp data URLs; anything that is not an image
  // data URL is not an avatar.
  if (typeof x.customAvatarDataUrl === 'string' && x.customAvatarDataUrl.startsWith('data:image/')) {
    t.customAvatarDataUrl = x.customAvatarDataUrl;
  }
  const catchphrase = shortString(x.catchphrase, 120);
  if (catchphrase) t.catchphrase = catchphrase;
  const motto = shortString(x.motto, 120);
  if (motto) t.motto = motto;
  if (typeof x.favoriteType === 'string' && TYPE_SET.has(x.favoriteType)) t.favoriteType = x.favoriteType as PokemonType;
  if (isFiniteNumber(x.signaturePokemonId) && POKEMON_BY_ID[x.signaturePokemonId]) t.signaturePokemonId = x.signaturePokemonId;
  return t;
}

function sanitizeCurrent(x: unknown): CurrentTeamState | null {
  if (!isRecord(x)) return null;
  if (Array.isArray(x.members)) {
    return { members: sanitizeMembers(x.members), name: sanitizeName(x.name) };
  }
  if (Array.isArray(x.ids)) {
    const members = sanitizeMembers(x.ids.map(id => (isFiniteNumber(id) && id > 0 ? { id, shiny: false } : null)));
    return { members, name: sanitizeName(x.name) };
  }
  return null;
}

function sanitizeTeams(x: unknown): SavedTeam[] {
  if (!Array.isArray(x)) return [];
  return x.map(sanitizeTeam).filter((t): t is SavedTeam => t !== null);
}

// ============================================================
// LOAD / SAVE
// ============================================================

function migrateLegacyTeam(t: LegacySavedTeam): SavedTeam {
  return sanitizeTeam(t) ?? { id: genId(), name: 'Untitled', members: sanitizeMembers([]), createdAt: Date.now() };
}

export function loadStorage(): StorageShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const p = isRecord(parsed) ? parsed : {};
      return {
        teams: sanitizeTeams(p.teams),
        current: sanitizeCurrent(p.current),
        trainer: sanitizeTrainer(p.trainer),
        premium: p.premium === true,
        favorites: Array.isArray(p.favorites)
          ? p.favorites.filter((n: unknown): n is number => isFiniteNumber(n))
          : [],
      };
    }
  } catch { /* unreadable v2 payload — fall through to the legacy read below */ }

  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed: unknown = JSON.parse(legacy);
      const p = isRecord(parsed) ? parsed : {};
      const teams = Array.isArray(p.teams)
        ? p.teams.map(t => migrateLegacyTeam(t as LegacySavedTeam))
        : [];
      return { teams, current: sanitizeCurrent(p.current), trainer: null, favorites: [] };
    }
  } catch { /* unreadable legacy payload — fall through to an empty store */ }

  return { teams: [], current: null, trainer: null, favorites: [] };
}

// 4 MB cap — below the 5 MB localStorage quota most browsers enforce, with
// margin for the per-key overhead and any other tabs writing concurrently.
// The realistic upper bound for legitimate data is ~150 KB (10 saved teams +
// trainer profile + 30 KB webp avatar). The cap is a defense against either
// a corrupted-import path stuffing the store full of garbage, or future
// features that grow the schema unexpectedly.
const STORAGE_MAX_BYTES = 4 * 1024 * 1024;

export function saveStorage(data: StorageShape): void {
  try {
    const json = JSON.stringify(data);
    if (json.length > STORAGE_MAX_BYTES) {
      console.warn(`[trainerscodex] localStorage payload ${json.length} bytes exceeds cap — refusing to write.`);
      return;
    }
    localStorage.setItem(STORAGE_KEY, json);
  } catch { /* quota or private mode — losing a save must not break the app */ }
}

/**
 * Remove every key this app owns and reload. The ErrorBoundary's last-resort
 * "reset local data" action: a payload the sanitizers did not anticipate must
 * never be a permanent white screen.
 */
export function resetLocalData(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('trainerscodex.')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch { /* private mode — nothing to clear */ }
  window.location.reload();
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
