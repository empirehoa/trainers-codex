// Campaign shape, the region tour, escalating stakes, and special events.
//
// ── The Balatro layer ─────────────────────────────────────────────────────
// Balatro's grip comes from three things this module implements:
//   1. ANTES — an escalating score target you must clear, so the pressure
//      never flattens. Journey Mode's antes are region-tour stops.
//   2. RARITY — most encounters are ordinary; a few are rare; a very few are
//      legendary and change the run. Anticipation of the rare pull is the hook.
//   3. STACKING MULTIPLIERS — events grant score multipliers that compound, so
//      a hot run feels exponential rather than linear.
//
// All of it is seeded and pure, so the replay/determinism contract holds.

import { chance, namedRng, pick, randInt } from './prng';
import { JOURNEY_REGIONS, getPools, getRegion } from './content';
import type {
  Campaign, ChapterPhase, EventRarity, JourneyEvent, JourneySetup, Stake,
} from './types';

// ============================================================
// CAMPAIGN SHAPE
// ============================================================

export interface CampaignSpec {
  id: Campaign;
  /** How many regions the tour visits. */
  regions: number;
  /** Chapter budget per region. */
  chaptersPerRegion: [number, number];
  /** i18n keys. */
  nameKey: string;
  descKey: string;
  /** Rough play time, shown on the setup screen. */
  approx: string;
}

export const CAMPAIGNS: CampaignSpec[] = [
  { id: 'short',  regions: 1, chaptersPerRegion: [12, 20], nameKey: 'journey.campaign.short.name',  descKey: 'journey.campaign.short.desc',  approx: '~3 min' },
  { id: 'season', regions: 3, chaptersPerRegion: [14, 20], nameKey: 'journey.campaign.season.name', descKey: 'journey.campaign.season.desc', approx: '~15 min' },
  { id: 'saga',   regions: 9, chaptersPerRegion: [12, 18], nameKey: 'journey.campaign.saga.name',   descKey: 'journey.campaign.saga.desc',   approx: '~45 min' },
];

export function getCampaign(id: Campaign | undefined): CampaignSpec {
  return CAMPAIGNS.find(c => c.id === (id ?? 'short')) ?? CAMPAIGNS[0];
}

/** Total chapters for a campaign — deterministic from the seed. */
export function campaignChapterCount(setup: JourneySetup): number {
  const spec = getCampaign(setup.campaign);
  const rng = namedRng(setup.seed, 'campaign-length');
  let total = 0;
  for (let i = 0; i < spec.regions; i++) {
    total += randInt(rng, spec.chaptersPerRegion[0], spec.chaptersPerRegion[1]);
  }
  return total;
}

/**
 * The ordered region tour. Always starts in the player's chosen region, then
 * continues through the others in dex order so a saga reads as a world tour.
 */
export function regionTour(setup: JourneySetup): string[] {
  const spec = getCampaign(setup.campaign);
  const start = getRegion(setup.regionId).id;
  const rest = JOURNEY_REGIONS.map(r => r.id).filter(r => r !== start);
  return [start, ...rest].slice(0, spec.regions);
}

/** Chapters allotted to each stop on the tour. */
export function regionChapterSpans(setup: JourneySetup): number[] {
  const spec = getCampaign(setup.campaign);
  const rng = namedRng(setup.seed, 'campaign-length');
  const out: number[] = [];
  for (let i = 0; i < spec.regions; i++) {
    out.push(randInt(rng, spec.chaptersPerRegion[0], spec.chaptersPerRegion[1]));
  }
  return out;
}

/** Which tour stop a chapter index falls in, and how far into that region. */
export function regionAt(setup: JourneySetup, chapterIndex: number): {
  tourIndex: number; regionId: string; localIndex: number; localCount: number;
} {
  const spans = regionChapterSpans(setup);
  const tour = regionTour(setup);
  let acc = 0;
  for (let i = 0; i < spans.length; i++) {
    if (chapterIndex < acc + spans[i]) {
      return { tourIndex: i, regionId: tour[i] ?? tour[0], localIndex: chapterIndex - acc, localCount: spans[i] };
    }
    acc += spans[i];
  }
  const last = spans.length - 1;
  return { tourIndex: last, regionId: tour[last] ?? tour[0], localIndex: spans[last] - 1, localCount: spans[last] };
}

// ============================================================
// STAKES (antes)
// ============================================================

/**
 * Score target for ante N. Superlinear so later regions demand a genuinely
 * better career, not just a longer one — the Balatro escalation.
 */
export function stakeTarget(ante: number): number {
  return Math.round(120 * Math.pow(ante, 1.55));
}

export function buildStakes(setup: JourneySetup): Stake[] {
  const spec = getCampaign(setup.campaign);
  return Array.from({ length: spec.regions }, (_, i) => ({
    ante: i + 1,
    target: stakeTarget(i + 1),
  }));
}

// ============================================================
// EVENTS
// ============================================================

interface EventSpec {
  id: string;
  rarity: EventRarity;
  /** Phases this event can fire in. */
  phases: ChapterPhase[];
  /** Score multiplier granted. */
  mult: number;
  /** Grants a Pokémon from the given tier. */
  grants?: 'common' | 'rare' | 'legendary';
}

/**
 * The event table. Deliberately weighted: common events are texture, rare
 * events are a genuine boost, and the three legendary events are run-defining
 * and can each fire at most once.
 */
export const EVENT_TABLE: EventSpec[] = [
  // ---- common (texture) ----
  { id: 'lucky-find',    rarity: 'common', phases: ['gym-circuit', 'regional', 'national', 'veteran'], mult: 1.02 },
  { id: 'crowd-favour',  rarity: 'common', phases: ['regional', 'national', 'worlds'], mult: 1.03 },
  { id: 'training-break', rarity: 'common', phases: ['gym-circuit', 'regional', 'veteran'], mult: 1.02 },
  { id: 'old-mentor',    rarity: 'common', phases: ['national', 'veteran'], mult: 1.04 },
  // ---- rare (a real boost) ----
  { id: 'swarm',         rarity: 'rare', phases: ['gym-circuit', 'regional', 'national'], mult: 1.10, grants: 'rare' },
  { id: 'perfect-run',   rarity: 'rare', phases: ['regional', 'national', 'worlds'], mult: 1.15 },
  { id: 'sponsor-bidding', rarity: 'rare', phases: ['national', 'worlds'], mult: 1.12 },
  { id: 'shiny-flash',   rarity: 'rare', phases: ['gym-circuit', 'regional', 'national', 'veteran'], mult: 1.14, grants: 'rare' },
  // ---- legendary (run-defining, once each) ----
  { id: 'legendary-stirs', rarity: 'legendary', phases: ['worlds', 'veteran', 'national'], mult: 1.45, grants: 'legendary' },
  { id: 'hall-of-fame',    rarity: 'legendary', phases: ['worlds', 'veteran'], mult: 1.35 },
  { id: 'world-record',    rarity: 'legendary', phases: ['worlds'], mult: 1.50 },
];

export const EVENT_BY_ID = new Map(EVENT_TABLE.map(e => [e.id, e]));

/** Base chance an event fires at all in a given chapter. */
const EVENT_CHANCE = 0.34;

/** Rarity roll — legendary is deliberately scarce. */
function rollRarity(r: number): EventRarity {
  if (r < 0.035) return 'legendary';
  if (r < 0.28) return 'rare';
  return 'common';
}

/**
 * Resolve the event for a chapter, if any. Pure in (seed, chapterIndex, phase)
 * plus the set of legendary ids already used, which is itself derived from
 * earlier chapters — so the whole thing replays identically.
 */
export function eventFor(opts: {
  seed: number;
  chapterIndex: number;
  phase: ChapterPhase;
  regionGen: number;
  usedLegendary: Set<string>;
}): JourneyEvent | null {
  const { seed, chapterIndex, phase, regionGen, usedLegendary } = opts;
  const rng = namedRng(seed, `event-${chapterIndex}`);
  if (!chance(rng, EVENT_CHANCE)) return null;

  const rarity = rollRarity(rng());
  let pool = EVENT_TABLE.filter(e => e.rarity === rarity && e.phases.includes(phase));
  if (rarity === 'legendary') pool = pool.filter(e => !usedLegendary.has(e.id));
  if (pool.length === 0) {
    pool = EVENT_TABLE.filter(e => e.rarity === 'common' && e.phases.includes(phase));
    if (pool.length === 0) return null;
  }

  const spec = pick(rng, pool);
  let grantedId: number | undefined;
  if (spec.grants) {
    const pools = getPools(regionGen);
    const tier = spec.grants === 'legendary'
      ? (pools.legendary.length ? pools.legendary : pools.rare)
      : spec.grants === 'rare'
        ? (pools.rare.length ? pools.rare : pools.common)
        : pools.common;
    if (tier.length) grantedId = pick(rng, tier);
  }

  return {
    id: spec.id,
    rarity: spec.rarity,
    chapterIndex,
    titleKey: `journey.event.${spec.id}.title`,
    bodyKey: `journey.event.${spec.id}.body`,
    vars: {},
    mult: spec.mult,
    grantedId,
  };
}

/** Product of every event multiplier earned — the stacking bonus. */
export function eventMultiplier(events: JourneyEvent[]): number {
  return events.reduce((m, e) => m * (e.mult ?? 1), 1);
}
