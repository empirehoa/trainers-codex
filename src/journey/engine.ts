// The Journey Mode simulation engine.
//
// ── Contract ─────────────────────────────────────────────────────────────
// `simulate(setup, choices)` is a PURE function. Same (setup, choices) in →
// byte-identical snapshot out, on any device, in any timezone, forever. It
// touches no clock, no Math.random, no storage, and no DOM.
//
// ── Why replay instead of step ────────────────────────────────────────────
// The UI never advances a mutable engine instance. It holds `choices[]` and
// re-runs the whole career from chapter 0 every time the player picks an
// option. A 20-chapter replay is a few microseconds, and in exchange:
//
//   * a shared ?seed= link reproduces a run exactly, with no state to ship;
//   * "undo my last choice" is `choices.slice(0, -1)`;
//   * the determinism test is one assertion, not a state-machine harness.
//
// ── Choice-independent event selection ───────────────────────────────────
// Which decision card appears at chapter N, and which flavor beats fire, are
// functions of (seed, N) only — never of accumulated stats. Choices move the
// OUTCOMES. That is what lets the Daily Journey say "everyone got the same
// journey today; compare what you did with it."

import {
  chapterRng, chance, namedRng, pick, randInt, sample, type Rng,
} from './prng';
import {
  CHAPTER_BEATS, CHAPTER_TITLES, cardsForPhase, DECISION_CARD_BY_ID,
  describeMon, getPace, getPools, getRegion, monTypes,
} from './content';
import { resolveVerdict, scoreCareer } from './scoring';
import type {
  CareerStats, ChapterPhase, ChapterResult, DecisionCardSpec, JourneyRun,
  JourneySetup, PendingDecision, RecordedChoice, RosterEntry, SimSnapshot,
  StatDelta,
} from './types';

export const MIN_CHAPTERS = 12;
export const MAX_CHAPTERS = 20;
export const START_AGE = 10;
export const ROSTER_SIZE = 6;

/** Unranked sentinel — lower peakRank is better, so this must be the ceiling. */
export const UNRANKED = 999;

// ============================================================
// CAREER SHAPE
// ============================================================

/** How many chapters this career runs for. Depends on the seed alone. */
export function chapterCountFor(seed: number): number {
  return randInt(namedRng(seed, 'career-length'), MIN_CHAPTERS, MAX_CHAPTERS);
}

/**
 * Map a chapter index onto a career phase.
 * Proportional rather than absolute so a 12-chapter career and a 20-chapter
 * career both get a full arc — gyms, the climb, Worlds, veteran years, exit.
 */
export function phaseFor(index: number, chapterCount: number): ChapterPhase {
  if (index >= chapterCount - 1) return 'retirement';
  const t = index / (chapterCount - 1);
  if (t < 0.30) return 'gym-circuit';
  if (t < 0.50) return 'regional';
  if (t < 0.66) return 'national';
  if (t < 0.82) return 'worlds';
  return 'veteran';
}

/** Does the player get a decision at the start of this chapter? */
export function isDecisionChapter(index: number, chapterCount: number, decisionEvery: number): boolean {
  // No decision on the retirement chapter — the last card the player sees is
  // the one that decides HOW they retire, not a prompt after the fact.
  if (index >= chapterCount - 1) return false;
  return index % decisionEvery === 0;
}

/** Every chapter index that will present a decision, for progress display. */
export function decisionChapterIndices(setup: JourneySetup): number[] {
  const count = chapterCountFor(setup.seed);
  const { decisionEvery } = getPace(setup.pace);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    if (isDecisionChapter(i, count, decisionEvery)) out.push(i);
  }
  return out;
}

// ============================================================
// DECISION SELECTION
// ============================================================

/**
 * Pick the card for a decision chapter.
 *
 * `usedCardIds` makes a run avoid repeats. It is choice-independent: the set
 * of decision chapters and the order they resolve in depend only on
 * (seed, pace), so the same seed always burns cards in the same order.
 */
function selectCard(
  seed: number,
  chapterIndex: number,
  phase: ChapterPhase,
  archetype: JourneySetup['archetype'],
  usedCardIds: Set<string>,
): DecisionCardSpec {
  const eligible = cardsForPhase(phase);
  const fresh = eligible.filter(c => !usedCardIds.has(c.id));
  const pool = fresh.length > 0 ? fresh : eligible;

  // Cards tagged with this archetype get a second entry in the weighted pool,
  // so a Collector run leans toward catch-flavoured dilemmas without ever
  // being locked out of the others.
  const weighted = pool.flatMap(c => (c.affinity?.includes(archetype) ? [c, c] : [c]));
  return pick(namedRng(seed, `card-${chapterIndex}`), weighted);
}

/** The decision standing at `chapterIndex`, or null if that chapter has none. */
export function decisionAt(setup: JourneySetup, chapterIndex: number): PendingDecision | null {
  const snapshot = simulate(setup, buildAutoChoices(setup, chapterIndex));
  if (snapshot.status !== 'awaiting-decision') return null;
  return snapshot.decision ?? null;
}

/** First option of every decision before `stopBefore` — used by decisionAt. */
function buildAutoChoices(setup: JourneySetup, stopBefore: number): RecordedChoice[] {
  const out: RecordedChoice[] = [];
  for (const idx of decisionChapterIndices(setup)) {
    if (idx >= stopBefore) break;
    const probe = simulate(setup, out);
    if (probe.status !== 'awaiting-decision' || !probe.decision) break;
    out.push({
      chapterIndex: probe.decision.chapterIndex,
      cardId: probe.decision.card.id,
      optionId: probe.decision.card.options[0].id,
    });
  }
  return out;
}

// ============================================================
// STATS
// ============================================================

function initialStats(): CareerStats {
  return {
    age: START_AGE,
    badges: 0,
    wins: 0,
    losses: 0,
    catches: 1,       // the starter counts
    shinies: 0,
    titles: 0,
    peakRank: UNRANKED,
    fame: 5,
    fatigue: 0,
    bond: 40,
    rivalWins: 0,
    rivalLosses: 0,
  };
}

const BOUNDED: Partial<Record<keyof CareerStats, [number, number]>> = {
  fame: [0, 100],
  fatigue: [0, 100],
  bond: [0, 100],
};

function applyDelta(stats: CareerStats, delta: StatDelta): CareerStats {
  const next = { ...stats };
  for (const [k, v] of Object.entries(delta) as [keyof CareerStats, number][]) {
    if (v === undefined) continue;
    let value = (next[k] ?? 0) + v;
    const bounds = BOUNDED[k];
    if (bounds) value = Math.min(bounds[1], Math.max(bounds[0], value));
    else value = Math.max(0, value);
    next[k] = value;
  }
  return next;
}

// ============================================================
// CHAPTER RESOLUTION
// ============================================================

/** Battle volume and stakes per phase. */
const PHASE_PROFILE: Record<ChapterPhase, {
  battles: [number, number];
  /** Baseline share of battles won before modifiers. */
  baseWinRate: number;
  fatiguePerChapter: [number, number];
  /** Chance this chapter is a ranked tournament. */
  tournamentChance: number;
  fame: [number, number];
}> = {
  // Fame gains are deliberately modest. At the original rates fame pinned to
  // its 100 ceiling in nearly every decent run, which made it useless as a
  // score signal and fired the CULT HERO verdict (fame >= 75, no titles) far
  // more often than "cult hero" should mean anything.
  'gym-circuit': { battles: [10, 22], baseWinRate: 0.62, fatiguePerChapter: [3, 9],  tournamentChance: 0.15, fame: [1, 3] },
  'regional':    { battles: [14, 28], baseWinRate: 0.58, fatiguePerChapter: [5, 12], tournamentChance: 0.75, fame: [1, 5] },
  'national':    { battles: [18, 34], baseWinRate: 0.55, fatiguePerChapter: [6, 14], tournamentChance: 0.85, fame: [2, 6] },
  'worlds':      { battles: [16, 30], baseWinRate: 0.52, fatiguePerChapter: [8, 16], tournamentChance: 0.95, fame: [3, 9] },
  'veteran':     { battles: [10, 24], baseWinRate: 0.56, fatiguePerChapter: [6, 15], tournamentChance: 0.55, fame: [1, 4] },
  'retirement':  { battles: [2, 8],   baseWinRate: 0.60, fatiguePerChapter: [0, 3],  tournamentChance: 0.20, fame: [1, 5] },
};

/** Per-archetype nudges applied every chapter. */
const ARCHETYPE_MODIFIERS: Record<JourneySetup['archetype'], {
  winRate: number;
  catchChance: number;
  shinyChance: number;
  /** Multiplier on fatigue gained per chapter. */
  fatigueScale: number;
  /** Multiplier on the between-chapter recovery rate. */
  recoveryScale: number;
  bondPerChapter: number;
}> = {
  aggro:          { winRate:  0.06, catchChance: 0.10, shinyChance: 0.02, fatigueScale: 1.15, recoveryScale: 0.85, bondPerChapter: 1 },
  stall:          { winRate:  0.02, catchChance: 0.14, shinyChance: 0.02, fatigueScale: 0.75, recoveryScale: 1.30, bondPerChapter: 4 },
  balance:        { winRate:  0.04, catchChance: 0.22, shinyChance: 0.04, fatigueScale: 0.95, recoveryScale: 1.00, bondPerChapter: 3 },
  collector:      { winRate: -0.02, catchChance: 0.60, shinyChance: 0.09, fatigueScale: 1.00, recoveryScale: 1.00, bondPerChapter: 4 },
  'shiny-hunter': { winRate: -0.04, catchChance: 0.45, shinyChance: 0.28, fatigueScale: 1.05, recoveryScale: 0.95, bondPerChapter: 3 },
};

/**
 * Fraction of accumulated fatigue shed between chapters — the off-season.
 *
 * Without this, fatigue is a one-way ratchet: 6-16 gained per chapter over a
 * 17-chapter career pins every trainer at 100 by their mid-twenties, which
 * permanently maxes the win-rate penalty and makes the `durability` score
 * component dead weight. Proportional recovery gives fatigue an equilibrium
 * instead (gain ÷ rate), so pace becomes a real trade-off: a trainer who
 * campaigns hard settles at high fatigue, one who rests settles low, and the
 * "rest the team" decision card actually buys something.
 */
const FATIGUE_RECOVERY_RATE = 0.24;

interface ChapterInput {
  setup: JourneySetup;
  index: number;
  phase: ChapterPhase;
  stats: CareerStats;
  roster: RosterEntry[];
  /** Risk multiplier contributed by this chapter's decision, if any. */
  risk: number;
  /** Delta contributed by this chapter's decision, applied before rolling. */
  choiceDelta: StatDelta | null;
  /** Option id taken, so the recap can echo it. */
  choiceOptionId: string | null;
}

function resolveChapter(input: ChapterInput): { chapter: ChapterResult; roster: RosterEntry[] } {
  const { setup, index, phase, risk } = input;
  const rng = chapterRng(setup.seed, index);
  const profile = PHASE_PROFILE[phase];
  const mods = ARCHETYPE_MODIFIERS[setup.archetype];

  // Choice deltas land before the rolls so a "rest the team" pick actually
  // relieves fatigue for the chapter it was made in.
  let stats = input.choiceDelta ? applyDelta(input.stats, input.choiceDelta) : { ...input.stats };
  const before = stats;

  // ---- battles ----
  const battles = randInt(rng, profile.battles[0], profile.battles[1]);
  const fatiguePenalty = (stats.fatigue / 100) * 0.22;
  const bondBonus = (stats.bond / 100) * 0.10;
  // Risk raises the mean a little and the spread a lot.
  const meanShift = (risk - 1) * 0.05;
  const spread = (rng() - 0.5) * 0.28 * risk;
  const winRate = Math.min(0.95, Math.max(0.05,
    profile.baseWinRate + mods.winRate + bondBonus - fatiguePenalty + meanShift + spread,
  ));
  const wins = Math.round(battles * winRate);
  const losses = battles - wins;

  // ---- tournament ----
  let placement: number | undefined;
  let titles = 0;
  let peakRank = stats.peakRank;
  if (chance(rng, profile.tournamentChance)) {
    // Field size grows with the stage; a strong chapter cuts deeper.
    const fieldSize = phase === 'worlds' ? 64 : phase === 'national' ? 48 : 32;
    const quality = winRate + (rng() - 0.5) * 0.16 * risk;
    // Exponent 2.6 puts a first-place finish at roughly an 0.80 chapter
    // quality in a 64-player field. At 1.7 the bracket was so steep that a
    // dominant career topped out at a single title against a target of three,
    // which capped the `titles` component at 0.33 for every archetype.
    placement = Math.max(1, Math.round(fieldSize * Math.pow(1 - Math.min(0.98, quality), 2.6)));
    if (placement === 1 && phase !== 'gym-circuit') titles = 1;
    peakRank = Math.min(peakRank, placement);
  }

  // ---- badges ----
  const badges = phase === 'gym-circuit' && chance(rng, 0.72) ? randInt(rng, 1, 2) : 0;

  // ---- catches + shinies ----
  const catchRolls = randInt(rng, 1, 4);
  let catches = 0;
  let shinies = 0;
  for (let i = 0; i < catchRolls; i++) {
    if (chance(rng, 0.35 + mods.catchChance)) {
      catches++;
      if (chance(rng, mods.shinyChance * 0.28)) shinies++;
    }
  }

  // ---- roster recruitment ----
  let roster = input.roster;
  let recruitedId: number | undefined;
  let recruitedShiny = false;
  if (roster.length < ROSTER_SIZE && chance(rng, phase === 'gym-circuit' ? 0.85 : 0.55)) {
    const region = getRegion(setup.regionId);
    const pools = getPools(region.gen);
    // Legendaries only become plausible once the career is on a real stage.
    const tier = phase === 'gym-circuit'
      ? pools.common
      : phase === 'veteran' || phase === 'worlds'
        ? (chance(rng, 0.18) ? pools.legendary : pools.rare)
        : (chance(rng, 0.5) ? pools.rare : pools.common);
    const owned = new Set(roster.map(r => r.id));
    const candidates = sample(rng, tier.length ? tier : pools.common, 8).filter(id => !owned.has(id));
    if (candidates.length > 0) {
      recruitedId = candidates[0];
      recruitedShiny = shinies > 0 && chance(rng, 0.5);
      roster = [...roster, {
        id: recruitedId,
        shiny: recruitedShiny,
        joinedAt: index,
        types: monTypes(recruitedId),
      }];
      if (recruitedShiny) shinies = Math.max(shinies, 1);
    }
  }

  // ---- rival ----
  let rivalWins = 0;
  let rivalLosses = 0;
  if (chance(rng, 0.40)) {
    if (chance(rng, winRate)) rivalWins = 1; else rivalLosses = 1;
  }

  // ---- fame + fatigue + bond ----
  const fameGain = randInt(rng, profile.fame[0], profile.fame[1])
    + titles * 12
    + (placement !== undefined && placement <= 4 ? 5 : 0);
  const fatigueGain = Math.round(
    randInt(rng, profile.fatiguePerChapter[0], profile.fatiguePerChapter[1]) * mods.fatigueScale,
  );
  const fatigueRecovered = Math.round(stats.fatigue * FATIGUE_RECOVERY_RATE * mods.recoveryScale);

  const delta: StatDelta = {
    age: 1,
    wins, losses, badges, catches, shinies, titles,
    fame: fameGain,
    fatigue: fatigueGain - fatigueRecovered,
    bond: mods.bondPerChapter,
    rivalWins, rivalLosses,
  };
  stats = applyDelta(stats, delta);
  // peakRank is a minimum, not an accumulation — set it directly.
  stats.peakRank = peakRank;

  // ---- flavor ----
  const beatPool = CHAPTER_BEATS[phase];
  const beatCount = phase === 'retirement' ? 2 : randInt(rng, 1, 2);
  const beatKeys = sample(rng, beatPool, beatCount).map(id => `journey.beat.${id}`);

  const aceId = roster[0]?.id;
  const vars: Record<string, string | number> = {
    trainer: setup.trainerName,
    region: getRegion(setup.regionId).label,
    age: stats.age,
    wins, losses, battles,
    badges: stats.badges,
    catches,
    shinies,
    fame: stats.fame,
    ace: aceId !== undefined ? describeMon(aceId, 'ace') : '',
    recruit: recruitedId !== undefined ? describeMon(recruitedId, 'find') : '',
    placement: placement ?? 0,
    chapter: index + 1,
    choice: input.choiceOptionId ?? '',
  };

  const chapter: ChapterResult = {
    index,
    phase,
    age: stats.age,
    titleKey: `journey.chapterTitle.${CHAPTER_TITLES[phase]}`,
    beatKeys,
    vars,
    delta: {
      wins, losses, badges, catches, shinies, titles,
      fame: stats.fame - before.fame,
      fatigue: stats.fatigue - before.fatigue,
    },
    stats,
    recruitedId,
    recruitedShiny: recruitedId !== undefined ? recruitedShiny : undefined,
    placement,
  };

  return { chapter, roster };
}

// ============================================================
// STARTING ROSTER
// ============================================================

function initialRoster(setup: JourneySetup): RosterEntry[] {
  // A shiny starter is the run's opening flourish — rare, and only for the
  // archetype that earned the right to it.
  const rng = namedRng(setup.seed, 'starter-shiny');
  const shiny = setup.archetype === 'shiny-hunter' ? chance(rng, 0.18) : chance(rng, 0.04);
  return [{
    id: setup.starterId,
    shiny,
    joinedAt: -1,
    types: monTypes(setup.starterId),
  }];
}

// ============================================================
// THE SIMULATION
// ============================================================

/**
 * Replay a career from chapter 0.
 *
 * Returns `awaiting-decision` at the first decision chapter with no recorded
 * choice, or `complete` with the finished run. Extra choices beyond what the
 * career needs are ignored; a choice whose optionId no longer exists falls
 * back to the card's first option so a stale share link still plays.
 */
export function simulate(setup: JourneySetup, choices: RecordedChoice[]): SimSnapshot {
  const chapterCount = chapterCountFor(setup.seed);
  const { decisionEvery } = getPace(setup.pace);

  let stats = initialStats();
  let roster = initialRoster(setup);
  const chapters: ChapterResult[] = [];
  const usedCardIds = new Set<string>();
  const choiceByChapter = new Map(choices.map(c => [c.chapterIndex, c]));

  for (let index = 0; index < chapterCount; index++) {
    const phase = phaseFor(index, chapterCount);

    let risk = 1;
    let choiceDelta: StatDelta | null = null;
    let choiceOptionId: string | null = null;

    if (isDecisionChapter(index, chapterCount, decisionEvery)) {
      const card = selectCard(setup.seed, index, phase, setup.archetype, usedCardIds);
      usedCardIds.add(card.id);

      const recorded = choiceByChapter.get(index);
      if (!recorded) {
        return {
          status: 'awaiting-decision',
          chapters,
          stats,
          roster,
          chapterCount,
          decision: {
            chapterIndex: index,
            card,
            vars: decisionVars(setup, roster, stats, index),
          },
        };
      }

      const option = card.options.find(o => o.id === recorded.optionId) ?? card.options[0];
      risk = option.riskMultiplier ?? 1;
      choiceDelta = option.delta;
      choiceOptionId = option.id;
    }

    const resolved = resolveChapter({
      setup, index, phase, stats, roster, risk, choiceDelta, choiceOptionId,
    });
    chapters.push(resolved.chapter);
    stats = resolved.chapter.stats;
    roster = resolved.roster;
  }

  // Pad the roster to six from the region pool so the Builder handoff always
  // hands over a full team. Deterministic: derived from the seed alone.
  roster = padRoster(setup, roster);

  const breakdown = scoreCareer(stats, setup.archetype, chapterCount);
  const verdict = resolveVerdict(stats, setup.archetype, breakdown.total);

  const run: JourneyRun = {
    setup,
    chapters,
    choices: chapters
      .map(c => choiceByChapter.get(c.index))
      .filter((c): c is RecordedChoice => c !== undefined),
    stats,
    roster,
    verdict,
    score: breakdown.total,
    breakdown,
    chapterCount,
  };

  return { status: 'complete', chapters, stats, roster, chapterCount, run };
}

function padRoster(setup: JourneySetup, roster: RosterEntry[]): RosterEntry[] {
  if (roster.length >= ROSTER_SIZE) return roster.slice(0, ROSTER_SIZE);
  const rng = namedRng(setup.seed, 'roster-pad');
  const pools = getPools(getRegion(setup.regionId).gen);
  const owned = new Set(roster.map(r => r.id));
  const pool = [...pools.rare, ...pools.common].filter(id => !owned.has(id));
  const out = [...roster];
  for (const id of sample(rng, pool, ROSTER_SIZE - roster.length)) {
    out.push({ id, shiny: false, joinedAt: -2, types: monTypes(id) });
  }
  return out.slice(0, ROSTER_SIZE);
}

function decisionVars(
  setup: JourneySetup,
  roster: RosterEntry[],
  stats: CareerStats,
  index: number,
): Record<string, string | number> {
  const rng = namedRng(setup.seed, `decision-vars-${index}`);
  const aceId = roster[0]?.id;
  // The mon a card refers to ("Evolve X now?") is drawn from the roster with a
  // per-chapter stream, so it is stable across replays.
  const subject = roster.length > 0 ? pick(rng, roster).id : aceId;
  return {
    trainer: setup.trainerName,
    region: getRegion(setup.regionId).label,
    age: stats.age,
    fatigue: stats.fatigue,
    fame: stats.fame,
    badges: stats.badges,
    chapter: index + 1,
    ace: aceId !== undefined ? describeMon(aceId, 'ace') : '',
    subject: subject !== undefined ? describeMon(subject, 'partner') : '',
  };
}

// ============================================================
// HELPERS FOR THE UI
// ============================================================

/**
 * Play a career to completion by taking the first option at every decision.
 * Used by the "auto-resolve" affordance and by the coverage tests.
 */
export function simulateWithStrategy(
  setup: JourneySetup,
  choose: (decision: PendingDecision) => string,
  maxSteps = MAX_CHAPTERS + 2,
): JourneyRun {
  const choices: RecordedChoice[] = [];
  for (let step = 0; step < maxSteps; step++) {
    const snapshot = simulate(setup, choices);
    if (snapshot.status === 'complete') return snapshot.run!;
    const decision = snapshot.decision!;
    const optionId = choose(decision);
    const valid = decision.card.options.some(o => o.id === optionId)
      ? optionId
      : decision.card.options[0].id;
    choices.push({ chapterIndex: decision.chapterIndex, cardId: decision.card.id, optionId: valid });
  }
  // A career has at most MAX_CHAPTERS decisions, so this is unreachable unless
  // the pace table and chapter bounds fall out of sync. Loud, not silent.
  throw new Error('simulateWithStrategy: career failed to terminate');
}

/** Rehydrate a card spec from a recorded choice — used by the recap UI. */
export function cardFor(cardId: string): DecisionCardSpec | null {
  return DECISION_CARD_BY_ID.get(cardId) ?? null;
}

/** Progress through the career, 0..1, for the chapter-recap progress bar. */
export function progressOf(snapshot: SimSnapshot): number {
  if (snapshot.chapterCount === 0) return 0;
  return Math.min(1, snapshot.chapters.length / snapshot.chapterCount);
}

export type { Rng };
