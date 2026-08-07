// Saved runs.
//
// The replay architecture makes this almost free: a run IS
// (setup, choices, actions). Nothing else needs persisting — no roster, no
// stats, no dex — because simulate() rebuilds all of it deterministically.
// A save is therefore a few hundred bytes, and resuming is exact.
//
// Storage is localStorage and strictly best-effort: quota errors, private
// mode, and corrupt payloads all degrade to "no saves" rather than throwing
// into the game.

import type { JourneySetup, PrepareAction, RecordedChoice } from './types';

const KEY = 'trainerscodex.journey.saves';
const MAX_SAVES = 8;
/** Bump when the payload shape changes incompatibly. */
const SCHEMA = 2;

export interface SavedRun {
  id: string;
  schema: number;
  setup: JourneySetup;
  choices: RecordedChoice[];
  actions: PrepareAction[];
  /** Chapters resolved when saved — display only. */
  chapter: number;
  /** Local date string, display only. */
  savedOn: string;
}

function read(): SavedRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as SavedRun[]).filter(s =>
      s && typeof s === 'object' && s.schema === SCHEMA && s.setup && Array.isArray(s.choices));
  } catch {
    return [];
  }
}

function write(list: SavedRun[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SAVES)));
  } catch {
    // Quota or private mode — a failed save must never break the run.
  }
}

export function listSaves(): SavedRun[] {
  return read();
}

/**
 * Save (or overwrite) a run. Identity is the seed + campaign, so re-saving the
 * same career updates its slot instead of filling the list with duplicates.
 */
export function saveRun(opts: {
  setup: JourneySetup;
  choices: RecordedChoice[];
  actions: PrepareAction[];
  chapter: number;
  today: string;
}): SavedRun {
  const id = `${opts.setup.seed}-${opts.setup.campaign ?? 'short'}`;
  const entry: SavedRun = {
    id,
    schema: SCHEMA,
    setup: opts.setup,
    choices: opts.choices,
    actions: opts.actions,
    chapter: opts.chapter,
    savedOn: opts.today,
  };
  const rest = read().filter(s => s.id !== id);
  write([entry, ...rest]);
  return entry;
}

export function deleteSave(id: string): void {
  write(read().filter(s => s.id !== id));
}

export function clearSaves(): void {
  try { localStorage.removeItem(KEY); } catch { /* best effort */ }
}
