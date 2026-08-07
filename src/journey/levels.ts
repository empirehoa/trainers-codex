// Levels, XP, and the evolution gate.
//
// ── Why this exists ───────────────────────────────────────────────────────
// v8 gated evolution on "chapters held", which meant a player could take every
// member to its final stage almost immediately and the party stopped being a
// thing you develop. Levels fix that: a member evolves when it reaches the
// species' REAL evolution level (from evolutions.json), or meets the item /
// friendship condition. XP is earned from the chapter's battles, so the six
// grow at a rate the career actually earns.
//
// Everything here is pure arithmetic on already-deterministic inputs, so the
// replay contract is untouched.

import type { CareerStats, ChapterPhase, RosterEntry } from './types';

export const MAX_LEVEL = 100;
export const START_LEVEL = 5;

/**
 * Cumulative XP required to REACH a level. Medium-fast curve (n^3), the
 * mainline standard, scaled down so a 12-20 chapter career lands a starter
 * somewhere in the 40-70 range rather than pinning at 100.
 */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, level));
  return Math.round(Math.pow(l, 3) / 5);
}

/** Level implied by a cumulative XP total. */
export function levelFromXp(xp: number): number {
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (xpForLevel(mid) <= xp) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** XP into the current level, and what the next level costs. */
export function xpProgress(xp: number): { level: number; into: number; need: number; pct: number } {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, need: 0, pct: 1 };
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const into = xp - base;
  const need = next - base;
  return { level, into, need, pct: need > 0 ? Math.min(1, into / need) : 1 };
}

/** Per-phase XP scale — later stages of a career are worth more per battle. */
const PHASE_XP: Record<ChapterPhase, number> = {
  'gym-circuit': 1.0,
  'regional': 1.35,
  'national': 1.8,
  'worlds': 2.4,
  'veteran': 2.0,
  'retirement': 1.2,
};

/**
 * XP the party earns for a chapter.
 *
 * The ace takes a larger share (it's the one battling), and members that
 * joined recently get a catch-up bonus so a late recruit isn't dead weight
 * for the rest of the run — the "flat party" problem in reverse.
 */
export function chapterXp(opts: {
  phase: ChapterPhase;
  wins: number;
  battles: number;
  memberIndex: number;
  joinedAt: number;
  chapterIndex: number;
  partySize: number;
}): number {
  const { phase, wins, battles, memberIndex, joinedAt, chapterIndex, partySize } = opts;
  const base = (wins * 9 + battles * 3) * PHASE_XP[phase];
  // Ace share: 1.35x for slot 0, evenly split remainder for the rest.
  const share = memberIndex === 0 ? 1.35 : 0.85;
  // Catch-up: a member that joined in the last 3 chapters earns 1.5x until it
  // has had time to close the gap.
  const fresh = chapterIndex - Math.max(joinedAt, 0) <= 3 ? 1.5 : 1;
  const spread = partySize > 0 ? 6 / Math.max(3, partySize) : 1;
  return Math.max(1, Math.round(base * share * fresh * spread * 0.5));
}

/** A member's level, derived from its XP. */
export function memberLevel(m: Pick<RosterEntry, 'xp'>): number {
  return levelFromXp(m.xp ?? 0);
}

// ============================================================
// EVOLUTION GATE
// ============================================================

export type EvolveBlock =
  | { ok: true }
  | { ok: false; reason: 'level'; needLevel: number }
  | { ok: false; reason: 'friendship'; needBond: number }
  | { ok: false; reason: 'item' }
  | { ok: false; reason: 'trade' };

/** Bond required for a friendship evolution. */
export const FRIENDSHIP_BOND = 70;

/**
 * Can this member evolve along the given edge right now?
 *
 * `how` and `level` come straight from evolutions.json, so a species evolves
 * on the same condition the games use. Item and trade evolutions are satisfied
 * by an Evolution Stone / Link Cord from the inventory — the prepare UI passes
 * `hasItem` when the player owns the right one.
 */
export function canEvolveNow(opts: {
  memberXp: number;
  how: string;
  evoLevel: number | null;
  bond: number;
  hasStone: boolean;
  hasLinkCord: boolean;
}): EvolveBlock {
  const { memberXp, how, evoLevel, bond, hasStone, hasLinkCord } = opts;
  const level = levelFromXp(memberXp);

  if (how === 'item') {
    return hasStone ? { ok: true } : { ok: false, reason: 'item' };
  }
  if (how === 'trade') {
    return hasLinkCord ? { ok: true } : { ok: false, reason: 'trade' };
  }
  if (how === 'friendship') {
    return bond >= FRIENDSHIP_BOND
      ? { ok: true }
      : { ok: false, reason: 'friendship', needBond: FRIENDSHIP_BOND };
  }
  // Level (and level-with-extra-condition, which we treat as level-only).
  const need = evoLevel ?? 36;
  return level >= need ? { ok: true } : { ok: false, reason: 'level', needLevel: need };
}

/** Level a newly-boxed/swapped-in member should arrive at — scaled to the run. */
export function levelForNewCatch(stats: CareerStats, chapterIndex: number): number {
  // Roughly tracks the party's own progression so a swap-in is playable.
  return Math.max(START_LEVEL, Math.min(70, 5 + chapterIndex * 3 + stats.badges * 2));
}
