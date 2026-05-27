import type { SavedTeam, TeamMember, LegacySavedTeam, TrainerProfile } from './types';
import { STORAGE_KEY } from './constants';

export interface CurrentTeamState {
  members: (TeamMember | null)[];
  name: string;
}

export interface StorageShape {
  teams: SavedTeam[];
  current: CurrentTeamState | null;
  trainer: TrainerProfile | null;
  premium?: boolean;
}

const LEGACY_KEY = 'trainerscodex.v1';

function migrateLegacyTeam(t: LegacySavedTeam): SavedTeam {
  const members: (TeamMember | null)[] = (t.ids || []).map(id =>
    id ? { id, shiny: false } : null
  );
  while (members.length < 6) members.push(null);
  return {
    id: t.id,
    name: t.name,
    members,
    createdAt: t.createdAt,
  };
}

export function loadStorage(): StorageShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const teams: SavedTeam[] = (parsed.teams || []).map((t: SavedTeam | LegacySavedTeam) => {
        if ('members' in t && Array.isArray(t.members)) return t;
        return migrateLegacyTeam(t as LegacySavedTeam);
      });
      let current: CurrentTeamState | null = null;
      if (parsed.current) {
        if (Array.isArray(parsed.current.members)) {
          current = parsed.current;
        } else if (Array.isArray(parsed.current.ids)) {
          const members: (TeamMember | null)[] = parsed.current.ids.map((id: number | null) =>
            id ? { id, shiny: false } : null
          );
          while (members.length < 6) members.push(null);
          current = { members, name: parsed.current.name || '' };
        }
      }
      return {
        teams,
        current,
        trainer: parsed.trainer || null,
        premium: parsed.premium === true,
      };
    }
  } catch {}

  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      const teams = (parsed.teams || []).map(migrateLegacyTeam);
      let current: CurrentTeamState | null = null;
      if (parsed.current && Array.isArray(parsed.current.ids)) {
        const members: (TeamMember | null)[] = parsed.current.ids.map((id: number | null) =>
          id ? { id, shiny: false } : null
        );
        while (members.length < 6) members.push(null);
        current = { members, name: parsed.current.name || '' };
      }
      return { teams, current, trainer: null };
    }
  } catch {}

  return { teams: [], current: null, trainer: null };
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
  } catch {}
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
