// Seeded randomness for Journey Mode.
//
// Every random draw in the sim comes from here, and every stream is derived
// from the run's integer seed. That is what makes a run reproducible from a
// shared link and what makes the Daily Journey identical for everybody who
// plays on the same local date.
//
// Two deliberate design points:
//
//   1. Streams are derived PER CHAPTER (`chapterRng`), not drawn from one
//      long stream. If chapter 4's dice came off a single running stream,
//      a different choice in chapter 3 would consume a different number of
//      draws and shift every later event. Per-chapter derivation means the
//      EVENT SEQUENCE is a pure function of (seed, chapterIndex) and only
//      the OUTCOMES respond to the player's choices — exactly what the Daily
//      Journey needs ("same events for everyone, only choices differ").
//
//   2. No Date.now() anywhere in a seeded path. The daily seed takes an
//      explicit date string so tests can pin it.

/** mulberry32 — 32-bit, fast, good enough distribution for narrative dice. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

/** FNV-1a 32-bit. Used for the daily seed and for stable string→int mapping. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Derive an independent stream for one chapter of one run.
 * The golden-ratio constant spreads adjacent chapter indices apart so
 * chapters 3 and 4 don't produce correlated openings.
 */
export function chapterRng(seed: number, chapterIndex: number): Rng {
  return mulberry32((seed ^ Math.imul(chapterIndex + 1, 0x9e3779b9)) >>> 0);
}

/** Derive a named sub-stream off a run seed (setup rolls, roster picks, ...). */
export function namedRng(seed: number, name: string): Rng {
  return mulberry32((seed ^ hashString(name)) >>> 0);
}

// ---------- draw helpers ----------

/** Integer in [min, max] inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

/** Sample `count` distinct items. Returns fewer if the pool is smaller. */
export function sample<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

/** True with probability p. */
export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

// ---------- seeds ----------

/** Seeds are surfaced to users as 1..999999 so they're short enough to say out loud. */
export const SEED_MIN = 1;
export const SEED_MAX = 999_999;

export function isValidSeed(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= SEED_MIN
    && value <= SEED_MAX;
}

/**
 * Coerce arbitrary input (a URL param, usually) to a usable seed.
 * Returns null for anything out of range so callers can fail soft to a fresh
 * random run instead of rendering an error screen — see §2.6 of the spec.
 */
export function coerceSeed(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const int = Math.trunc(n);
  return isValidSeed(int) ? int : null;
}

/**
 * A fresh random seed. This is the ONE place in Journey Mode that touches
 * Math.random; everything downstream is derived from the result.
 */
export function randomSeed(): number {
  return SEED_MIN + Math.floor(Math.random() * (SEED_MAX - SEED_MIN + 1));
}

// ---------- dates ----------

/**
 * The device-LOCAL calendar date as YYYY-MM-DD.
 *
 * Local, not UTC, on purpose: the Daily Journey follows the Wordle
 * convention where "today" rolls over at the player's own midnight. That
 * needs no server and no timezone negotiation.
 *
 * Built from getFullYear/getMonth/getDate rather than toISOString() — the
 * latter converts to UTC first and would hand back yesterday's date for
 * anyone west of Greenwich in the evening.
 */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Reject impossible days (2026-02-30) by round-tripping through Date.
  const probe = new Date(y, m - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

/** The shared seed for a given local date. Same date → same journey. */
export function dailySeed(dateStr: string): number {
  // Namespaced so a future "weekly challenge" can hash the same date to a
  // different seed without colliding with the daily.
  return SEED_MIN + (hashString(`trainerscodex-daily-${dateStr}`) % (SEED_MAX - SEED_MIN + 1));
}

/** Daily Journey issue number — days since launch, 1-indexed, for share text. */
export const DAILY_EPOCH = '2026-08-26';

export function dailyIssueNumber(dateStr: string): number {
  const [y1, m1, d1] = DAILY_EPOCH.split('-').map(Number);
  const [y2, m2, d2] = dateStr.split('-').map(Number);
  // UTC midnight for both endpoints so the subtraction can't be skewed by a
  // DST transition sitting between them.
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((b - a) / 86_400_000) + 1;
}

/** Shift a YYYY-MM-DD by whole days, staying in calendar space. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
