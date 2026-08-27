import type { PokemonType } from '@/lib/types';
import type { Inventory, ItemId } from './items';

// ============================================================
// SETUP
// ============================================================

export type Pace = 'express' | 'normal' | 'intense';

export type Archetype = 'aggro' | 'stall' | 'balance' | 'collector' | 'shiny-hunter';

/** Where this run came from — reported as `source` on the run_started event. */
export type RunSource = 'fresh' | 'seed-link' | 'daily';

/**
 * Campaign length. `short` is the original 3-minute single-region run;
 * `season` and `saga` are the long-form modes — more regions, more gyms, more
 * chapters, designed to be picked up across a week or a month.
 */
export type Campaign = 'short' | 'season' | 'saga';

export interface JourneySetup {
  seed: number;
  trainerName: string;
  regionId: string;
  starterId: number;
  archetype: Archetype;
  pace: Pace;
  source: RunSource;
  /** Defaults to 'short' when absent, so old links and saves still replay. */
  campaign?: Campaign;
  /** Set only when source === 'daily' — the local date the seed came from. */
  dailyDate?: string;
}

// ============================================================
// CAREER STATE
// ============================================================

export interface CareerStats {
  /** Trainer age. Starts at 10, advances one year per chapter. */
  age: number;
  badges: number;
  wins: number;
  losses: number;
  catches: number;
  shinies: number;
  /** Tournament titles won (regional, national, Worlds). */
  titles: number;
  /** Best world ranking achieved. 999 = unranked. Lower is better. */
  peakRank: number;
  /** Public profile, 0-100. Drives the "cult hero" / "icon" verdicts. */
  fame: number;
  /** Accumulated team fatigue, 0-100. High fatigue drags win rates down. */
  fatigue: number;
  /** Relationship with the roster, 0-100. Collector/stall scoring input. */
  bond: number;
  /** Rival encounters resolved in the trainer's favour. */
  rivalWins: number;
  rivalLosses: number;
  /**
   * Prize money, the run's only spendable resource.
   *
   * Nothing in Journey Mode used to COST anything, so nothing in it was a
   * trade-off — every prepare action was free and therefore obvious. Money is
   * earned from battles won and milestones cleared, and spent on rerolling a
   * decision you do not want. See REROLL_COSTS in engine.ts.
   */
  money: number;
}

export type ChapterPhase =
  | 'gym-circuit'
  | 'regional'
  | 'national'
  | 'elite-four'
  | 'worlds'
  | 'world-cup'
  | 'veteran'
  | 'retirement';

/** Deltas a chapter (or a choice) applies to the career. */
export type StatDelta = Partial<Record<keyof CareerStats, number>>;

export interface ChapterResult {
  index: number;
  phase: ChapterPhase;
  age: number;
  /** i18n key for the chapter's headline. */
  titleKey: string;
  /** i18n keys for the 1-3 beat lines shown in the recap. */
  beatKeys: string[];
  /** Interpolation values for the beat lines (species names, counts, ...). */
  vars: Record<string, string | number>;
  delta: StatDelta;
  /** Snapshot of the career AFTER this chapter resolved. */
  stats: CareerStats;
  /** Set when this chapter added a Pokémon to the roster. */
  recruitedId?: number;
  recruitedShiny?: boolean;
  /**
   * The named fights this chapter resolved, in order.
   *
   * Carried on the chapter (not just on the run) so the recap can show the
   * result while it is still the thing that just happened. Without this, the
   * player earned or lost a badge and the only trace was a number moving in
   * the stat strip.
   */
  battles?: OpponentResult[];
  /** Event Pokémon this chapter granted, for the recap's event line. */
  eventMonId?: number;
  eventMonShiny?: boolean;
  /** Tournament placement, when the chapter was a tournament. */
  placement?: number;
}

// ============================================================
// DECISIONS
// ============================================================

export interface DecisionOptionSpec {
  id: string;
  /** i18n key for the button label. */
  labelKey: string;
  /** i18n key for the one-line consequence hint under the label. */
  flavorKey: string;
  /** Applied to the career when this option is taken. */
  delta: StatDelta;
  /**
   * Multiplier applied to this chapter's battle outcome roll. 1 = neutral.
   * Values above 1 raise both the upside and the variance.
   */
  riskMultiplier?: number;
}

export interface DecisionCardSpec {
  id: string;
  /** Which career phases this card can appear in. */
  phases: ChapterPhase[];
  /** i18n key for the prompt. */
  promptKey: string;
  options: DecisionOptionSpec[];
  /** Archetypes this card is weighted toward. Purely for selection variety. */
  affinity?: Archetype[];
}

export interface PendingDecision {
  /** Which chapter the player is standing at the start of. */
  chapterIndex: number;
  card: DecisionCardSpec;
  /** Interpolation values for the prompt. */
  vars: Record<string, string | number>;
}

/** A recorded player choice: the card presented and the option id taken. */
export interface RecordedChoice {
  chapterIndex: number;
  cardId: string;
  optionId: string;
}

// ============================================================
// PREPARE ACTIONS — team management before a decision
// ============================================================
//
// Prepare actions are player input taken at a decision chapter, BEFORE the
// chapter resolves. They are recorded and replayed exactly like choices, so
// determinism holds; they are session-only (never serialized into the seed
// deep-link, which carries setup, not history).

export type PrepareAction =
  /** Evolve a roster member (fromId → toId). Consumes a stone/cord when required. */
  | { type: 'evolve'; chapterIndex: number; fromId: number; toId: number; viaItem?: boolean }
  /** Promote a roster member to the ace slot (index 0). */
  | { type: 'ace'; chapterIndex: number; id: number }
  /** Consume an item. `targetId` names the member for targeted items. */
  | { type: 'item'; chapterIndex: number; item: ItemId; targetId?: number }
  /** Swap a party member out for one from the box. */
  | { type: 'swap'; chapterIndex: number; outId: number; inId: number }
  /** Give a party member a nickname (empty string clears it). */
  | { type: 'nickname'; chapterIndex: number; id: number; name: string }
  /** Choose the next region on the tour ("go international"). */
  | { type: 'travel'; chapterIndex: number; regionId: string }
  /**
   * Discard this chapter's decision card and draw another. Costs money after
   * the first one of the run.
   *
   * Recorded rather than applied, because the card shown is a pure function of
   * (seed, chapterIndex, rerollCount) — so a replay reproduces the rerolled
   * card exactly, and a `?seed=` link still reproduces the whole career.
   */
  | { type: 'reroll'; chapterIndex: number }
  /**
   * Queue an evolution to fire the moment its gate clears.
   *
   * The carry-forward mechanic. Without it, an evolution that needs level 36 on
   * a level-34 member means opening the prepare step every chapter to check —
   * which is busywork, not a decision. Queuing turns it into a plan the run
   * executes for you.
   */
  | { type: 'queue-evolve'; chapterIndex: number; fromId: number; toId: number }
  /** Cancel a queued evolution. */
  | { type: 'unqueue-evolve'; chapterIndex: number; fromId: number };

// ============================================================
// POKÉDEX
// ============================================================

export interface DexState {
  /** Species ids the trainer has encountered (seen or caught). */
  seen: number[];
  /** Species ids the trainer has actually caught (superset includes roster). */
  caught: number[];
}

// ============================================================
// BADGES + REGION PROGRESSION
// ============================================================

/** Gyms per region — the story runs the full circuit before moving on. */
export const BADGES_PER_REGION = 8;

export interface BadgeEarned {
  regionId: string;
  /** 1-8 within the region. */
  index: number;
  /** Chapter it was won at. */
  chapterIndex: number;
}

/** Where the career currently stands in its region tour. */
export interface RegionProgress {
  /** Region currently being played. */
  regionId: string;
  /** Ordered list of regions this campaign will visit. */
  tour: string[];
  /** Index into `tour`. */
  tourIndex: number;
  /** Badges earned in the CURRENT region. */
  regionBadges: number;
}

// ============================================================
// QUESTS
// ============================================================

export type QuestKind =
  | 'badges' | 'party-size' | 'evolve' | 'catch' | 'shiny' | 'wins'
  | 'titles' | 'syndicate';

export interface QuestReward {
  item?: ItemId;
  mult?: number;
  fame?: number;
}

export interface QuestSpec {
  id: string;
  kind: QuestKind;
  n: number;
  scope: 'region' | 'campaign';
  reward: QuestReward;
}

export interface Quest {
  id: string;
  scope: 'region' | 'campaign';
  kind: QuestKind;
  target: number;
  progress: number;
  complete: boolean;
  reward: QuestReward;
  titleKey: string;
  descKey: string;
}

// ============================================================
// CROWNS + BRACKETS
// ============================================================

/** Awarded for clearing a region's Elite Four and Champion. */
export interface RegionCrown {
  regionId: string;
  chapterIndex: number;
  /** Champion's name, for the Legend Card. */
  championName: string;
}

/** One resolved battle against a named opponent. */
export interface OpponentResult {
  chapterIndex: number;
  kind: 'gym' | 'elite-four' | 'champion' | 'syndicate' | 'world-cup';
  name: string;
  title: string;
  specialty: PokemonType;
  level: number;
  won: boolean;
  /** Party advantage at the time, -1..+1. */
  advantage: number;
  /** Badges this battle awarded (gym wins only). */
  badgeAwarded?: number;
  /**
   * True when this is a second attempt at an opponent a previous chapter lost
   * to. Rematches are what stop a gym loss from being a dead end.
   */
  rematch?: boolean;
  /** Party ids that hit the specialty super-effectively. */
  strongPicks?: number[];
  /** Party ids the specialty hits super-effectively. */
  weakPicks?: number[];
}

// ============================================================
// STAKES + EVENTS (the Balatro layer)
// ============================================================

/**
 * An "ante": an escalating score target the career must clear. Each region tour
 * stop raises the bar, so a long campaign keeps applying pressure instead of
 * flattening out.
 */
export interface Stake {
  /** 1-based ante number. */
  ante: number;
  /** Score the player must reach by the end of this ante. */
  target: number;
  /** Score actually banked when the ante closed. */
  banked?: number;
  cleared?: boolean;
}

export type EventRarity = 'common' | 'rare' | 'legendary';

/** A special encounter fired at a chapter — the "something happened" beat. */
export interface JourneyEvent {
  id: string;
  rarity: EventRarity;
  chapterIndex: number;
  /** i18n key for the headline. */
  titleKey: string;
  /** i18n key for the body. */
  bodyKey: string;
  /** Interpolation values. */
  vars: Record<string, string | number>;
  /** Score multiplier this event contributed (1 = none). */
  mult?: number;
  /** Species this event granted, if any. */
  grantedId?: number;
  /** The granted species arrives shiny (SHINY FLASH and friends). */
  grantedShiny?: boolean;
}

// ============================================================
// RESULT
// ============================================================

/**
 * How a Pokémon came to be on the team. Independent of `shiny` — a mon can be
 * an event grant AND shiny, or either alone.
 *
 * These were previously conflated: an event grant was marked `shiny` when the
 * event's rarity was 'legendary', which made "shiny" mean two unrelated things
 * and left the player unable to tell a genuinely shiny catch from a legendary
 * encounter.
 */
export type MonOrigin = 'starter' | 'wild' | 'event' | 'gift';

export interface RosterEntry {
  id: number;
  shiny: boolean;
  /** Where this member came from. Absent is treated as 'wild'. */
  origin?: MonOrigin;
  /** For `origin: 'event'`, the event id that granted it — drives the badge. */
  eventId?: string;
  /** Chapter index the Pokémon joined at. Starter is -1, dex-pad is -2. */
  joinedAt: number;
  /** Current types — updated when the member evolves. */
  types: PokemonType[];
  /** How many times this member has evolved this run (0 = base form as caught). */
  evolved?: number;
  /** Cumulative XP. Level is derived from this (see levels.ts). */
  xp?: number;
  /** Nickname, if the player set one. */
  nickname?: string;
}

/** A Pokémon sitting in the box — caught, not currently in the party. */
export interface BoxEntry {
  id: number;
  shiny: boolean;
  /** Where this one came from. Absent is treated as 'wild'. */
  origin?: MonOrigin;
  /** For `origin: 'event'`, the event id that granted it. */
  eventId?: string;
  xp: number;
  /** Chapter it was caught at. */
  caughtAt: number;
}

export interface Verdict {
  id: string;
  /** i18n key for the all-caps verdict headline. */
  titleKey: string;
  /** i18n key for the one-sentence explanation. */
  blurbKey: string;
  /** Which archetype this verdict belongs to; 'any' verdicts fit all. */
  archetype: Archetype | 'any';
  /** Minimum career score this verdict requires. */
  minScore: number;
  /** Extra gate — all listed predicates must hold. */
  requires?: (stats: CareerStats) => boolean;
}

export interface ScoreBreakdown {
  /** Each component's contribution, already archetype-weighted. */
  components: { key: string; label: string; value: number }[];
  /** Final 0-999 score. */
  total: number;
}

export interface JourneyRun {
  setup: JourneySetup;
  chapters: ChapterResult[];
  choices: RecordedChoice[];
  actions: PrepareAction[];
  stats: CareerStats;
  roster: RosterEntry[];
  box: BoxEntry[];
  dex: DexState;
  badges: BadgeEarned[];
  region: RegionProgress;
  stakes: Stake[];
  events: JourneyEvent[];
  quests: Quest[];
  crowns: RegionCrown[];
  battles: OpponentResult[];
  verdict: Verdict;
  score: number;
  breakdown: ScoreBreakdown;
  /** Total chapters this career ran for. */
  chapterCount: number;
}

// ============================================================
// PREPARE AVAILABILITY — what the UI can offer at a decision
// ============================================================

/** One evolution target, with whether it can be taken right now and why not. */
export interface EvolveTarget {
  id: number;
  to: string;
  how: string;
  level: number | null;
  ready: boolean;
  /** Short i18n key explaining the block when `ready` is false. */
  blockKey?: string;
  /** Value for the block message ({n}). */
  blockValue?: number;
}

/** One member's evolve options at the current decision point. */
export interface EvolveOffer {
  fromId: number;
  options: EvolveTarget[];
  /** True when at least one target is takeable right now. */
  eligible: boolean;
}

/** Everything the prepare step can present at the pending decision. */
export interface PrepareAvailability {
  /** Evolve offers keyed by the member's current species id. Members with NO
   *  evolutions are omitted entirely — the UI shows "fully evolved" for those. */
  evolves: EvolveOffer[];
  /** Whether reordering the ace is meaningful (roster length > 1). */
  canSetAce: boolean;
  /** Box members available to swap in. */
  box: BoxEntry[];
  /** Regions the player may travel to next (empty unless at a crossroads). */
  travelOptions?: TravelOption[];
  /** Cost of rerolling this chapter's decision. 0 = the free one. */
  rerollCost: number;
  /** Whether the trainer can afford it. */
  canAffordReroll: boolean;
  /** Rerolls already spent this run. */
  rerollsUsed: number;
  /** Evolutions queued and waiting on their gate, keyed by current species. */
  queued: QueuedEvolve[];
}

/** An evolution the player has queued for when its gate clears. */
export interface QueuedEvolve {
  fromId: number;
  toId: number;
  /** Why it has not fired yet, for the UI to explain the wait. */
  reason: 'level' | 'friendship' | 'item' | 'trade';
  /** Level required, when `reason` is 'level'. */
  needLevel?: number;
}

/** A candidate next region, with what makes it worth choosing. */
export interface TravelOption {
  regionId: string;
  label: string;
  /** Regional-form line available there, if any. */
  formLabel?: string;
  /** Number of legendaries in that region's pool. */
  legendaryCount: number;
  /** A few notable species ids to preview. */
  previewIds: number[];
}

// ============================================================
// ENGINE STEP RESULT
// ============================================================

export type SimStatus = 'awaiting-decision' | 'complete';

export interface SimSnapshot {
  status: SimStatus;
  /** Chapters resolved so far, in order. */
  chapters: ChapterResult[];
  stats: CareerStats;
  roster: RosterEntry[];
  box: BoxEntry[];
  dex: DexState;
  badges: BadgeEarned[];
  region: RegionProgress;
  stakes: Stake[];
  events: JourneyEvent[];
  quests: Quest[];
  crowns: RegionCrown[];
  battles: OpponentResult[];
  inventory: Inventory;
  chapterCount: number;
  /** Present when status === 'awaiting-decision'. */
  decision?: PendingDecision;
  /** Present when status === 'awaiting-decision' — the prepare-step offer. */
  prepare?: PrepareAvailability;
  /** The named adversary standing at this chapter, if the phase has one. */
  opponent?: OpponentSummary;
  /** Party advantage against that opponent, -1..+1. */
  opponentAdvantage?: number;
  /** Present when status === 'complete'. */
  run?: JourneyRun;
}

/** Serializable view of an opponent for the UI layer. */
export interface OpponentSummary {
  kind: 'gym' | 'elite-four' | 'champion' | 'syndicate' | 'world-cup';
  name: string;
  title: string;
  specialty: PokemonType;
  level: number;
  teamIds: number[];
  ghost?: { trainerName: string; score: number };
}

// ============================================================
// UI STATE MACHINE
// ============================================================

export type JourneyUiState =
  | 'setup'
  | 'simulating'
  | 'prepare'
  | 'decision'
  | 'chapter-recap'
  | 'retired'
  | 'card';
