import type { PokemonType } from '@/lib/types';
import type { Inventory, ItemId } from './items';

// ============================================================
// SETUP
// ============================================================

export type Pace = 'express' | 'normal' | 'intense';

export type Archetype = 'aggro' | 'stall' | 'balance' | 'collector' | 'shiny-hunter';

/** Where this run came from — reported as `source` on the run_started event. */
export type RunSource = 'fresh' | 'seed-link' | 'daily';

export interface JourneySetup {
  seed: number;
  trainerName: string;
  regionId: string;
  starterId: number;
  archetype: Archetype;
  pace: Pace;
  source: RunSource;
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
}

export type ChapterPhase =
  | 'gym-circuit'
  | 'regional'
  | 'national'
  | 'worlds'
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
  /** Evolve a roster member (fromId → toId). `viaItem` bypasses the hold gate. */
  | { type: 'evolve'; chapterIndex: number; fromId: number; toId: number; viaItem?: boolean }
  /** Promote a roster member to the ace slot (index 0). */
  | { type: 'ace'; chapterIndex: number; id: number }
  /** Consume an item. `targetId` is required for rare-candy (which member). */
  | { type: 'item'; chapterIndex: number; item: ItemId; targetId?: number };

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
// RESULT
// ============================================================

export interface RosterEntry {
  id: number;
  shiny: boolean;
  /** Chapter index the Pokémon joined at. Starter is -1, dex-pad is -2. */
  joinedAt: number;
  /** Current types — updated when the member evolves. */
  types: PokemonType[];
  /** How many times this member has evolved this run (0 = base form as caught). */
  evolved?: number;
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
  dex: DexState;
  verdict: Verdict;
  score: number;
  breakdown: ScoreBreakdown;
  /** Total chapters this career ran for. */
  chapterCount: number;
}

// ============================================================
// PREPARE AVAILABILITY — what the UI can offer at a decision
// ============================================================

/** One member's evolve options at the current decision point. */
export interface EvolveOffer {
  fromId: number;
  /** Legal targets (id + display), from the evolution map. */
  options: { id: number; to: string }[];
  /** True when the normal hold gate is met (no Rare Candy needed). */
  eligible: boolean;
}

/** Everything the prepare step can present at the pending decision. */
export interface PrepareAvailability {
  /** Evolve offers keyed by the member's current species id. */
  evolves: EvolveOffer[];
  /** Whether reordering the ace is meaningful (roster length > 1). */
  canSetAce: boolean;
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
  dex: DexState;
  inventory: Inventory;
  chapterCount: number;
  /** Present when status === 'awaiting-decision'. */
  decision?: PendingDecision;
  /** Present when status === 'awaiting-decision' — the prepare-step offer. */
  prepare?: PrepareAvailability;
  /** Present when status === 'complete'. */
  run?: JourneyRun;
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
