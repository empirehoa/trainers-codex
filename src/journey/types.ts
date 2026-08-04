import type { PokemonType } from '@/lib/types';

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
// RESULT
// ============================================================

export interface RosterEntry {
  id: number;
  shiny: boolean;
  /** Chapter index the Pokémon joined at. Starter is -1. */
  joinedAt: number;
  /** Highest-tier role this member filled — drives Legend Card captions. */
  types: PokemonType[];
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
  stats: CareerStats;
  roster: RosterEntry[];
  verdict: Verdict;
  score: number;
  breakdown: ScoreBreakdown;
  /** Total chapters this career ran for. */
  chapterCount: number;
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
  chapterCount: number;
  /** Present when status === 'awaiting-decision'. */
  decision?: PendingDecision;
  /** Present when status === 'complete'. */
  run?: JourneyRun;
}

// ============================================================
// UI STATE MACHINE
// ============================================================

export type JourneyUiState =
  | 'setup'
  | 'simulating'
  | 'decision'
  | 'chapter-recap'
  | 'retired'
  | 'card';
