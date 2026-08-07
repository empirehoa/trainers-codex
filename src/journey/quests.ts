// Missions & quests — the near-term goals that carry a long campaign.
//
// ── Why quests are DERIVED, never stored ─────────────────────────────────
// Progress is computed from the run state on every replay rather than being
// accumulated into mutable state. That keeps the determinism contract intact
// for free: two replays of the same (setup, choices, actions) produce the same
// quest board, and a save (which is just those three things) restores it
// exactly. No quest bookkeeping ever has to be serialized.

import { namedRng, sample } from './prng';
import { POKEMON_BY_ID } from '@/lib/pokemon';
import { canEvolve } from './evolution';
import type { PokemonType } from '@/lib/types';
import type {
  BadgeEarned, CareerStats, DexState, JourneyEvent, Quest, QuestSpec, RosterEntry,
} from './types';

/** The quest catalogue. Goals are all readable off run state. */
export const QUEST_SPECS: QuestSpec[] = [
  { id: 'first-badges',   kind: 'badges',     n: 3,  scope: 'region',   reward: { item: 'exp-share', fame: 4 } },
  { id: 'full-circuit',   kind: 'badges',     n: 8,  scope: 'region',   reward: { item: 'rare-candy', mult: 1.08, fame: 10 } },
  { id: 'full-party',     kind: 'party-size', n: 6,  scope: 'campaign', reward: { item: 'soothe-bell', fame: 3 } },
  { id: 'evolve-three',   kind: 'evolve',     n: 3,  scope: 'campaign', reward: { item: 'evo-stone', mult: 1.05 } },
  { id: 'dex-twenty',     kind: 'catch',      n: 20, scope: 'campaign', reward: { item: 'link-cord', fame: 5 } },
  { id: 'dex-fifty',      kind: 'catch',      n: 50, scope: 'campaign', reward: { mult: 1.12, fame: 12 } },
  { id: 'find-shiny',     kind: 'shiny',      n: 1,  scope: 'campaign', reward: { mult: 1.10, fame: 8 } },
  { id: 'win-streak',     kind: 'wins',       n: 120, scope: 'campaign', reward: { item: 'energy-root', fame: 4 } },
  { id: 'title-hunter',   kind: 'titles',     n: 2,  scope: 'campaign', reward: { mult: 1.15, fame: 15 } },
  { id: 'break-syndicate', kind: 'syndicate', n: 1,  scope: 'region',   reward: { item: 'rare-candy', mult: 1.10, fame: 10 } },
];

export const QUEST_BY_ID = new Map(QUEST_SPECS.map(q => [q.id, q]));

/** How many quests are active at once — few enough to stay legible. */
export const ACTIVE_QUESTS = 3;

/**
 * The quest board for a run: a seeded selection, each with progress derived
 * from current state. Region-scoped quests reset their target per region.
 */
export function questBoard(opts: {
  seed: number;
  stats: CareerStats;
  roster: RosterEntry[];
  dex: DexState;
  badges: BadgeEarned[];
  regionId: string;
  events: JourneyEvent[];
  syndicateBeaten: number;
}): Quest[] {
  const { seed, stats, roster, dex, badges, regionId, syndicateBeaten } = opts;
  const rng = namedRng(seed, 'quest-board');
  const chosen = sample(rng, QUEST_SPECS, Math.min(ACTIVE_QUESTS + 3, QUEST_SPECS.length));

  const regionBadges = badges.filter(b => b.regionId === regionId).length;
  const evolvedCount = roster.reduce((n, m) => n + (m.evolved ?? 0), 0);

  const progressFor = (spec: QuestSpec): number => {
    switch (spec.kind) {
      case 'badges':     return regionBadges;
      case 'party-size': return roster.length;
      case 'evolve':     return evolvedCount;
      case 'catch':      return dex.caught.length;
      case 'shiny':      return stats.shinies;
      case 'wins':       return stats.wins;
      case 'titles':     return stats.titles;
      case 'syndicate':  return syndicateBeaten;
      default:           return 0;
    }
  };

  const all = chosen.map<Quest>(spec => {
    const progress = progressFor(spec);
    return {
      id: spec.id,
      scope: spec.scope,
      kind: spec.kind,
      target: spec.n,
      progress: Math.min(progress, spec.n),
      complete: progress >= spec.n,
      reward: spec.reward,
      titleKey: `journey.quest.${spec.id}.title`,
      descKey: `journey.quest.${spec.id}.desc`,
    };
  });

  // Show completed ones (satisfying) plus the nearest incomplete ones.
  const done = all.filter(q => q.complete);
  const open = all.filter(q => !q.complete)
    .sort((a, b) => (b.progress / b.target) - (a.progress / a.target));
  return [...done, ...open].slice(0, ACTIVE_QUESTS + done.length).slice(0, 5);
}

/** Product of the multipliers from every completed quest. */
export function questMultiplier(quests: Quest[]): number {
  return quests.reduce((m, q) => (q.complete && q.reward.mult ? m * q.reward.mult : m), 1);
}

/** Fame awarded by completed quests. */
export function questFame(quests: Quest[]): number {
  return quests.reduce((n, q) => n + (q.complete ? (q.reward.fame ?? 0) : 0), 0);
}

/** A type the party has no super-effective answer to — used for quest flavor. */
export function uncoveredType(roster: RosterEntry[]): PokemonType | null {
  const covered = new Set<PokemonType>();
  for (const m of roster) for (const t of m.types) covered.add(t);
  const all: PokemonType[] = [
    'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
    'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark',
    'steel', 'fairy',
  ];
  return all.find(t => !covered.has(t)) ?? null;
}

/** True when a species is worth flagging as a rare pull. */
export function isRareSpecies(id: number): boolean {
  const p = POKEMON_BY_ID[id];
  if (!p) return false;
  return Boolean(p.legendary || p.mythical || p.bst >= 540 || !canEvolve(id));
}
