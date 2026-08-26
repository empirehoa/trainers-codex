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
  CHAPTER_BEATS, CHAPTER_TITLES, cardsForPhase, DECISION_CARDS, DECISION_CARD_BY_ID,
  describeMon, getPace, getPools, getRegion, monTypes, JOURNEY_REGIONS,
} from './content';
import {
  evolutionsOf, isValidEvolution, typesOf,
} from './evolution';
import {
  emptyInventory, ITEM_LEVEL_GRANT, ITEM_PARTY_XP, ITEM_STAT_EFFECT,
  type Inventory, type ItemId,
} from './items';
import {
  canEvolveNow, chapterXp, levelForNewCatch, levelFromXp, xpForLevel,
} from './levels';
import {
  buildStakes, campaignChapterCount, eventFor, eventMultiplier, getCampaign,
  regionAt, regionTour,
} from './campaign';
import {
  eliteFour, gymLeaders, matchupFor, matchupWinRateDelta, regionChampion,
  syndicateFor, worldCupField, type Opponent,
} from './opponents';
import { questBoard, questFame, questMultiplier } from './quests';
import { MAX_SCORE, resolveVerdict, scoreCareer } from './scoring';
import {
  BADGES_PER_REGION,
  type BadgeEarned, type BoxEntry, type CareerStats, type ChapterPhase,
  type ChapterResult, type DecisionCardSpec, type DexState, type EvolveOffer,
  type EvolveTarget, type JourneyEvent, type JourneyRun, type JourneySetup,
  type PendingDecision, type PrepareAction, type PrepareAvailability,
  type RecordedChoice, type RosterEntry, type SimSnapshot,
  type OpponentResult, type Quest, type RegionCrown, type Stake, type StatDelta,
  type TravelOption,
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

/**
 * How many chapters this career runs for.
 *
 * Legacy signature (seed only) still works and yields the original short-run
 * length, so old seed links replay unchanged. Pass a full setup to get the
 * campaign-aware count (season/saga are multi-region and much longer).
 */
export function chapterCountFor(seedOrSetup: number | JourneySetup): number {
  if (typeof seedOrSetup === 'number') {
    return randInt(namedRng(seedOrSetup, 'career-length'), MIN_CHAPTERS, MAX_CHAPTERS);
  }
  const setup = seedOrSetup;
  if (!setup.campaign || setup.campaign === 'short') {
    return randInt(namedRng(setup.seed, 'career-length'), MIN_CHAPTERS, MAX_CHAPTERS);
  }
  return campaignChapterCount(setup);
}

/**
 * Map a chapter index onto a career phase.
 * Proportional rather than absolute so a 12-chapter career and a 20-chapter
 * career both get a full arc — gyms, the climb, Worlds, veteran years, exit.
 */
export function phaseFor(index: number, chapterCount: number): ChapterPhase {
  if (index >= chapterCount - 1) return 'retirement';
  const t = index / (chapterCount - 1);
  if (t < 0.26) return 'gym-circuit';
  // The Elite Four sits right after the gym circuit — it is the region's exam.
  //
  // Widened from 0.38 to 0.42 to give the gauntlet room. Four members plus a
  // champion is five fights, and at ~1.5 chapters the phase could not hold
  // them: measured over 6,000 careers, members 3 and 4 and the region champion
  // were never faced at all. `e4Step` advances on wins and persists across
  // chapters, so with room the player can chip through the ladder over two or
  // three sittings and actually reach the champion.
  if (t < 0.42) return 'elite-four';
  if (t < 0.54) return 'regional';
  if (t < 0.66) return 'national';
  if (t < 0.80) return 'worlds';
  // The World Cup is the finale, just before the veteran wind-down.
  if (t < 0.86) return 'world-cup';
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
  const count = chapterCountFor(setup);
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
  // A phase with no cards would otherwise crash the sim. Fall back to the
  // whole deck rather than dying — a wrong-flavoured card beats a dead run.
  const safe = weighted.length ? weighted : DECISION_CARDS;
  return pick(namedRng(seed, `card-${chapterIndex}`), safe);
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
  'elite-four':  { battles: [12, 20], baseWinRate: 0.48, fatiguePerChapter: [12, 20], tournamentChance: 0.30, fame: [4, 10] },
  'worlds':      { battles: [16, 30], baseWinRate: 0.52, fatiguePerChapter: [8, 16], tournamentChance: 0.95, fame: [3, 9] },
  'world-cup':   { battles: [10, 18], baseWinRate: 0.46, fatiguePerChapter: [10, 18], tournamentChance: 1.00, fame: [8, 18] },
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

/**
 * Fame and bond decay the same way fatigue recovers, and for the same reason.
 *
 * Both were pure one-way ratchets: fame only went up with results, bond only
 * went up with chapters survived. Measured over 3,000 careers, each pinned to
 * its 100 ceiling in ~62% of runs and sat >= 90 in ~76%. Two consequences, both
 * bad:
 *
 *   1. As SCORE components (0.10-0.18 weight each) they became near-constant —
 *      a flat offset added to everybody rather than something that separates
 *      careers.
 *   2. As VERDICT conditions they became meaningless. `bond >= 90 && titles
 *      === 0` reads like a specific kind of career; with bond saturated it
 *      resolves to plain "titleless", which is half of all players. That one
 *      substitution is what let a single consolation verdict swallow 20-29% of
 *      every outcome, and no amount of re-tuning the predicates fixed it —
 *      the ceiling was the bug.
 *
 * Decay also models the things better than a ratchet does. Fame is a stock that
 * leaks: last season's notability doesn't survive a quiet year, it has to be
 * re-earned. Bond is a relationship, not a tenure counter — it needs
 * maintaining, which is what the loyalty-flavoured decision cards are for.
 * Equilibrium sits at roughly (per-chapter gain ÷ rate), so both now spread
 * across their range instead of collapsing onto the cap.
 */
const FAME_DECAY_RATE = 0.12;
const BOND_DECAY_RATE = 0.10;

/** Bond value treated as "maxed" for gameplay effects. Mirrors TARGETS.bond. */
const BOND_EFFECTIVE_MAX = 70;

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
  /** Badges still available in the region being played. */
  badgeRoom: number;
  /** Region generation, for the recruit/catch pools on a multi-region tour. */
  regionGen: number;
  /** Region id currently being toured. */
  regionId: string;
  /**
   * The named opponents standing in front of the player this chapter, in order.
   *
   * A chapter used to resolve exactly ONE named fight, and two multi-stage
   * ladders were arithmetically impossible as a result:
   *
   *   * The gym circuit needs 8 badges per region but the gym phase is only
   *     ~28% of a 12-20 chapter career, so five chapters at one badge each
   *     capped out at five. `full-circuit` and the 8-slot badge track were
   *     unreachable and the `badges` component sat at a p50 of 0.25.
   *   * The Elite Four needs four members plus the champion — five fights — and
   *     its phase spans ~1.5 chapters. Measured over 6,000 careers, members 3
   *     and 4 and the region champion were NEVER faced, and because crowns are
   *     awarded for beating a champion, `RegionCrown` was dead content too.
   *
   * So a chapter walks the chain instead: fight, and on a win move to the next.
   * A loss ends the day there. Each extra fight carries a cumulative tiredness
   * penalty, which is exactly the Elite Four's "no healing between battles" and
   * makes pressing on at a gym a real gamble rather than free value.
   */
  chain: Opponent[];
  /** True when a previous chapter already lost to chain[0]. */
  rematch: boolean;
  /**
   * Flavor lines this career has already spent. MUTATED by resolveChapter —
   * the one intentional piece of shared state, so a run never repeats a beat.
   * Owned by simulate() and rebuilt per replay, which keeps simulate() itself
   * a pure function of (setup, choices).
   */
  usedBeats: Set<string>;
}

function resolveChapter(input: ChapterInput): {
  chapter: ChapterResult;
  roster: RosterEntry[];
  seenAdded: number[];
  caughtAdded: number[];
  badgesWon: number;
  boxAdded: BoxEntry[];
  battles: OpponentResult[];
} {
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
  // Scaled against the post-decay bond range, not the 0-100 cap. Dividing by
  // 100 here silently halved the bonus once bond stopped saturating, which
  // dragged win rates down and pushed the titleless share from 51% to 67%.
  const bondBonus = Math.min(1, stats.bond / BOND_EFFECTIVE_MAX) * 0.10;
  // Risk raises the mean a little and the spread a lot.
  const meanShift = (risk - 1) * 0.05;
  const spread = (rng() - 0.5) * 0.28 * risk;
  // Type matchup + level gap vs a named opponent. This is the payoff for
  // team-building: a party built to answer the specialty genuinely wins more.
  const partyLevel = input.roster.length
    ? Math.round(input.roster.reduce((n, m) => n + levelFromXp(m.xp ?? 0), 0) / input.roster.length)
    : 5;
  // chain[0] is this chapter's headline opponent — the one the recap names and
  // the one the chapter's win rate is tilted by.
  const primary = input.chain[0] ?? null;
  const matchup = primary ? matchupFor(input.roster, primary, partyLevel) : null;
  const matchupDelta = matchup ? matchupWinRateDelta(matchup) : 0;

  const winRate = Math.min(0.95, Math.max(0.05,
    profile.baseWinRate + mods.winRate + bondBonus - fatiguePenalty + meanShift + spread + matchupDelta,
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

  // ---- the named battle ----
  // This is resolved BEFORE badges, because in the gym circuit the badge is
  // what winning it pays out.
  //
  // It used to be neither contested nor consequential. `won` was
  // `winRate >= 0.5` — a threshold on the chapter's aggregate rate, which sits
  // near 0.53 at the median, so essentially every named battle was a win. And
  // the badge came from a blind `chance(rng, 0.72)` roll that never looked at
  // the opponent at all, so a player could lose to the gym leader and still
  // collect two badges, or beat them and collect none. The leader was set
  // dressing on both counts.
  //
  // Now it is one explicit roll, centred on the chapter's win rate and tilted
  // by the matchup the player actually built for. A gym leader is beatable but
  // not a formality, and the type/level work in the prepare step is what moves
  // the odds.
  const badgeRoomNow = Math.max(0, input.badgeRoom);

  // Bosses are harder than gym leaders at the same matchup. The floor and
  // ceiling keep a hopeless matchup from being unwinnable and a dominant one
  // from being automatic — there is always a run to be had either way.
  const oddsAgainst = (o: Opponent, tired: number): number => {
    const bossPenalty = o.kind === 'gym' ? 0
      : o.kind === 'syndicate' ? 0.04
      : o.kind === 'elite-four' ? 0.05
      : 0.12;
    const m = matchupFor(input.roster, o, partyLevel);
    return Math.min(0.93, Math.max(0.12,
      winRate + matchupWinRateDelta(m) * 0.5 - bossPenalty - tired,
    ));
  };

  // Walk the chain: each win advances, the first loss ends the day. Tiredness
  // compounds per extra fight and scales with fatigue already carried, so a
  // rested party gets further down the ladder than an exhausted one.
  const fought: OpponentResult[] = [];
  let gymWinsHere = 0;
  for (let f = 0; f < input.chain.length; f++) {
    const o = input.chain[f];
    // A gym win with no badge left to award is not worth the fatigue.
    if (o.kind === 'gym' && gymWinsHere >= badgeRoomNow) break;
    // Kept deliberately small. The difficulty RAMP through a gauntlet is
    // already carried by the level curve — Elite Four members run 58/62/66/70
    // and the champion 76, and `matchupFor` prices level gap — so a steep
    // per-fight penalty on top double-counted it and walled the ladder off:
    // at 0.06 per fight the region champion was reached by 52 runs in 6,000.
    // This is the cost of not healing, not a second difficulty curve.
    const tired = f === 0 ? 0 : f * 0.03 + (stats.fatigue / 100) * 0.10;
    const m = matchupFor(input.roster, o, partyLevel);
    const won = chance(rng, oddsAgainst(o, tired));
    if (won && o.kind === 'gym') gymWinsHere++;
    fought.push({
      chapterIndex: index,
      kind: o.kind,
      name: o.name,
      title: o.title,
      specialty: o.specialty,
      level: o.level,
      won,
      advantage: m.advantage,
      badgeAwarded: won && o.kind === 'gym' ? 1 : undefined,
      rematch: f === 0 && input.rematch ? true : undefined,
      // Surfaced so the recap can name WHICH of the six carried the fight and
      // which one the specialty punished — the payoff for the prepare step is
      // only motivating if the player can see it.
      strongPicks: m.strongPicks.length ? m.strongPicks : undefined,
      weakPicks: m.weakPicks.length ? m.weakPicks : undefined,
    });
    if (!won) break;
  }
  // Every fight past the first costs real fatigue — that is the price of the
  // gauntlet, and what makes "press on" a decision instead of a freebie.
  const chainFatigue = Math.max(0, fought.length - 1) * 4;

  // ---- badges ----
  // Badges are capped at BADGES_PER_REGION per region so the gym circuit is a
  // real, completable track rather than an unbounded counter. `badgeRoom` is
  // what's left in the current region.
  //
  // One badge per gym leader beaten — never two, and never any without a win.
  // `earnedHere` in simulate() only advances when a badge lands, so LOSING a
  // gym leaves the same leader standing for the next chapter. That is the
  // rematch: a loss costs a chapter and stings on fatigue, but it is never a
  // dead end.
  const badgeRoom = badgeRoomNow;
  const badges = Math.min(gymWinsHere, badgeRoom);

  // ---- catches + shinies ----
  // Pools follow the CURRENT tour region, not the starting one, so a saga's
  // later regions actually offer their own species.
  const region = getRegion(input.regionId);
  const pools = getPools(input.regionGen, input.regionId);
  const seenAdded: number[] = [];
  const caughtAdded: number[] = [];
  const catchRolls = randInt(rng, 1, 4);
  let catches = 0;
  let shinies = 0;
  // Actual species drawn for the dex. Every catch registers a real id so the
  // Pokédex fills with what the trainer met, and the caught set becomes the
  // pool the "true six" is completed from (never arbitrary region filler).
  const owned0 = new Set([...input.roster.map(r => r.id)]);
  const catchTier = phase === 'gym-circuit'
    ? pools.common
    : (chance(rng, 0.4) ? pools.rare : pools.common);
  const catchDraw = sample(rng, catchTier.length ? catchTier : pools.common, 12);
  let drawCursor = 0;
  const nextSpecies = (): number | undefined => {
    while (drawCursor < catchDraw.length) {
      const id = catchDraw[drawCursor++];
      if (!owned0.has(id)) return id;
    }
    return undefined;
  };
  // Which of this chapter's catches came out shiny. Tracked per-species rather
  // than as a bare count, because the count used to be exactly that — a bare
  // count. `shinies++` fired here while the BoxEntry below was built with
  // `shiny: false` hardcoded, so a Shiny Hunter could finish a career with a
  // shiny counter of 8 and not one shiny Pokémon they could look at, swap in,
  // or put on the Legend Card. The number was decorative.
  //
  // Now the flag on the Pokémon is the single source of truth and the counter
  // is derived from it, which makes the two incapable of disagreeing.
  const shinyIds = new Set<number>();
  for (let i = 0; i < catchRolls; i++) {
    // Wild sighting either way — a seen entry even when the catch fails.
    const sighted = nextSpecies();
    if (sighted !== undefined) seenAdded.push(sighted);
    if (chance(rng, 0.35 + mods.catchChance)) {
      catches++;
      if (sighted !== undefined) caughtAdded.push(sighted);
      // Roll shiny only when there is a real species to attach it to.
      if (sighted !== undefined && chance(rng, mods.shinyChance * 0.28)) {
        shinyIds.add(sighted);
      }
    }
  }
  shinies = shinyIds.size;

  // Catches beyond the party go to the BOX, so "swap in something I caught"
  // has real inventory behind it.
  const boxAdded: BoxEntry[] = caughtAdded.map(id => ({
    id,
    shiny: shinyIds.has(id),
    origin: 'wild' as const,
    xp: xpForLevel(levelForNewCatch(stats, index)),
    caughtAt: index,
  }));

  // ---- roster recruitment ----
  let roster = input.roster;
  let recruitedId: number | undefined;
  let recruitedShiny = false;
  if (roster.length < ROSTER_SIZE && chance(rng, phase === 'gym-circuit' ? 0.85 : 0.55)) {
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
      // Its own roll against the archetype's shiny rate — it used to be
      // `shinies > 0 && chance(rng, 0.5)`, which made a recruit shiny only as a
      // side effect of some OTHER Pokémon being shiny this chapter.
      recruitedShiny = shinyIds.has(recruitedId) || chance(rng, mods.shinyChance * 0.22);
      roster = [...roster, {
        id: recruitedId,
        shiny: recruitedShiny,
        origin: 'wild' as const,
        joinedAt: index,
        types: monTypes(recruitedId),
        evolved: 0,
        xp: xpForLevel(levelForNewCatch(stats, index)),
      }];
      seenAdded.push(recruitedId);
      caughtAdded.push(recruitedId);
      if (recruitedShiny) shinyIds.add(recruitedId);
      shinies = shinyIds.size;
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
    fame: fameGain - Math.round(stats.fame * FAME_DECAY_RATE),
    fatigue: fatigueGain - fatigueRecovered + chainFatigue,
    bond: mods.bondPerChapter - Math.round(stats.bond * BOND_DECAY_RATE),
    rivalWins, rivalLosses,
  };
  stats = applyDelta(stats, delta);
  // peakRank is a minimum, not an accumulation — set it directly.
  stats.peakRank = peakRank;

  // ---- flavor ----
  // Beats are drawn from the lines this career has NOT used yet. Sampling the
  // full pool every chapter made 99.7% of careers repeat a line (measured over
  // 6,000 runs), which is the single loudest "this is a small game" tell — the
  // player reads the same sentence twice and stops trusting the rest.
  //
  // `usedBeats` is fed only by earlier chapters' beat draws, and those depend
  // on (seed, chapterIndex) alone — so this stays choice-independent and the
  // Daily Journey guarantee holds.
  const beatPool = CHAPTER_BEATS[phase];
  const fresh = beatPool.filter(id => !input.usedBeats.has(id));
  // Fall back to the whole pool only once a phase has genuinely run dry.
  const drawFrom = fresh.length > 0 ? fresh : beatPool;
  const beatCount = phase === 'retirement' ? 2 : randInt(rng, 1, 2);
  const drawn = sample(rng, drawFrom, beatCount);
  for (const id of drawn) input.usedBeats.add(id);
  const beatKeys = drawn.map(id => `journey.beat.${id}`);

  const aceId = roster[0]?.id;
  const vars: Record<string, string | number> = {
    trainer: setup.trainerName,
    region: region.label,
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
    opponent: primary?.name ?? '',
    opponentTitle: primary?.title ?? '',
    specialty: primary?.specialty ?? '',
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
    battles: fought.length ? fought : undefined,
  };

  // ---- party XP ----
  // Awarded AFTER recruitment so a member that joined this chapter also earns
  // from it (with the catch-up multiplier), and levels visibly tick up every
  // chapter instead of the party sitting flat.
  roster = roster.map((m, i) => ({
    ...m,
    xp: (m.xp ?? 0) + chapterXp({
      phase, wins, battles, memberIndex: i,
      joinedAt: m.joinedAt, chapterIndex: index, partySize: roster.length,
    }),
  }));

  return { chapter, roster, seenAdded, caughtAdded, badgesWon: badges, boxAdded, battles: fought };
}

// ============================================================
// PREPARE ACTIONS
// ============================================================

/** Deterministic item drop for the decision chapter at `index`, or null. */
function itemGrantFor(seed: number, index: number): ItemId | null {
  const rng = namedRng(seed, `item-grant-${index}`);
  // ~70% of decision chapters hand out something, so the inventory grows
  // steadily but a run isn't drowning in items.
  if (!chance(rng, 0.7)) return null;
  const roll = rng();
  if (roll < 0.26) return 'soothe-bell';
  if (roll < 0.50) return 'energy-root';
  if (roll < 0.68) return 'exp-share';
  if (roll < 0.84) return 'rare-candy';
  if (roll < 0.95) return 'evo-stone';
  return 'link-cord';
}

/**
 * What the prepare step can offer at the pending decision.
 *
 * Members with NO evolutions are omitted entirely — that's the fix for
 * "it offers to evolve Pokémon that don't evolve". Each remaining target
 * reports whether it is takeable RIGHT NOW and, if not, exactly why (level /
 * friendship / stone / link cord), so the UI can say "Lv.16 required" instead
 * of an opaque disabled button.
 */
function computePrepare(
  roster: RosterEntry[],
  box: BoxEntry[],
  stats: CareerStats,
  inventory: Inventory,
): PrepareAvailability {
  const evolves: EvolveOffer[] = [];
  const hasStone = (inventory['evo-stone'] ?? 0) > 0;
  const hasLinkCord = (inventory['link-cord'] ?? 0) > 0;

  for (const m of roster) {
    const opts = evolutionsOf(m.id);
    if (opts.length === 0) continue; // fully evolved — never offered
    const targets: EvolveTarget[] = opts.map(o => {
      const gate = canEvolveNow({
        memberXp: m.xp ?? 0, how: o.how, evoLevel: o.level,
        bond: stats.bond, hasStone, hasLinkCord,
      });
      if (gate.ok) return { id: o.id, to: o.to, how: o.how, level: o.level, ready: true };
      const blockKey =
        gate.reason === 'level' ? 'journey.prepare.needLevel'
        : gate.reason === 'friendship' ? 'journey.prepare.needBond'
        : gate.reason === 'item' ? 'journey.prepare.needStone'
        : 'journey.prepare.needCord';
      const blockValue =
        gate.reason === 'level' ? gate.needLevel
        : gate.reason === 'friendship' ? gate.needBond
        : undefined;
      return { id: o.id, to: o.to, how: o.how, level: o.level, ready: false, blockKey, blockValue };
    });
    evolves.push({ fromId: m.id, options: targets, eligible: targets.some(t => t.ready) });
  }

  return { evolves, canSetAce: roster.length > 1, box };
}

interface PrepareState {
  roster: RosterEntry[];
  box: BoxEntry[];
  inventory: Inventory;
  stats: CareerStats;
  seen: number[];
  caught: number[];
}

/**
 * Apply the recorded prepare-actions for one chapter, in order. Every action
 * is validated; an invalid one (stale share link, missing item, illegal
 * target) is skipped rather than throwing, so a replay never hard-fails.
 */
function applyPrepareActions(
  state: PrepareState,
  actions: PrepareAction[],
  chapterIndex: number,
): PrepareState {
  let roster = state.roster;
  let box = state.box;
  const inventory: Inventory = { ...state.inventory };
  let stats = state.stats;
  const seen = [...state.seen];
  const caught = [...state.caught];

  for (const action of actions) {
    if (action.chapterIndex !== chapterIndex) continue;

    if (action.type === 'evolve') {
      const i = roster.findIndex(m => m.id === action.fromId);
      if (i === -1) continue;
      if (!isValidEvolution(action.fromId, action.toId)) continue;
      if (roster.some(m => m.id === action.toId)) continue; // keep the six unique
      const member = roster[i];
      const edge = evolutionsOf(action.fromId).find(e => e.id === action.toId);
      if (!edge) continue;
      const gate = canEvolveNow({
        memberXp: member.xp ?? 0, how: edge.how, evoLevel: edge.level,
        bond: stats.bond,
        hasStone: (inventory['evo-stone'] ?? 0) > 0,
        hasLinkCord: (inventory['link-cord'] ?? 0) > 0,
      });
      if (!gate.ok) continue; // level/friendship not met → no-op (soft replay)
      // Stone/cord evolutions consume the item that unlocked them.
      if (edge.how === 'item') inventory['evo-stone'] -= 1;
      else if (edge.how === 'trade') inventory['link-cord'] -= 1;

      roster = roster.map((m, idx) => idx === i
        ? { ...m, id: action.toId, types: typesOf(action.toId), evolved: (m.evolved ?? 0) + 1 }
        : m);
      if (!seen.includes(action.toId)) seen.push(action.toId);
      if (!caught.includes(action.toId)) caught.push(action.toId);
      continue;
    }

    if (action.type === 'ace') {
      const i = roster.findIndex(m => m.id === action.id);
      if (i <= 0) continue; // -1 not found, 0 already ace
      const member = roster[i];
      roster = [member, ...roster.slice(0, i), ...roster.slice(i + 1)];
      continue;
    }

    if (action.type === 'swap') {
      const outIdx = roster.findIndex(m => m.id === action.outId);
      const inIdx = box.findIndex(b => b.id === action.inId);
      if (outIdx === -1 || inIdx === -1) continue;
      if (roster.some(m => m.id === action.inId)) continue; // no duplicates
      const outgoing = roster[outIdx];
      const incoming = box[inIdx];
      roster = roster.map((m, idx) => idx === outIdx ? {
        id: incoming.id,
        shiny: incoming.shiny,
        // Provenance survives the swap in both directions. Without this a
        // round trip through the box launders an event Pokémon into an
        // ordinary one, and the badge on its card silently disappears.
        origin: incoming.origin,
        eventId: incoming.eventId,
        joinedAt: chapterIndex,
        types: typesOf(incoming.id),
        evolved: 0,
        xp: incoming.xp,
      } : m);
      // The benched member keeps its XP — swapping is reversible, not a cull.
      box = [
        ...box.slice(0, inIdx), ...box.slice(inIdx + 1),
        {
          id: outgoing.id, shiny: outgoing.shiny,
          origin: outgoing.origin, eventId: outgoing.eventId,
          xp: outgoing.xp ?? 0, caughtAt: outgoing.joinedAt,
        },
      ];
      if (!seen.includes(incoming.id)) seen.push(incoming.id);
      if (!caught.includes(incoming.id)) caught.push(incoming.id);
      continue;
    }

    if (action.type === 'travel') {
      // Handled up-front when building the visited-region list; nothing to do
      // to the party here.
      continue;
    }

    if (action.type === 'nickname') {
      const i = roster.findIndex(m => m.id === action.id);
      if (i === -1) continue;
      // Trimmed and length-capped here so the cap holds on replay too, not
      // just in the input that produced it.
      const clean = String(action.name).replace(/\s+/g, ' ').trim().slice(0, 14);
      roster = roster.map((m, idx) => idx === i
        ? { ...m, nickname: clean.length ? clean : undefined }
        : m);
      continue;
    }

    if (action.type === 'item') {
      const item = action.item;
      if ((inventory[item] ?? 0) <= 0) continue;
      const statEffect = ITEM_STAT_EFFECT[item];
      const levelGrant = ITEM_LEVEL_GRANT[item];
      const partyXp = ITEM_PARTY_XP[item];
      // Stones and cords are consumed by the evolution they enable, not here.
      if (!statEffect && !levelGrant && !partyXp) continue;

      if (levelGrant) {
        // Rare Candy: +1 level to the named member (or the ace by default).
        const targetId = action.targetId ?? roster[0]?.id;
        const i = roster.findIndex(m => m.id === targetId);
        if (i === -1) continue;
        const cur = levelFromXp(roster[i].xp ?? 0);
        roster = roster.map((m, idx) => idx === i
          ? { ...m, xp: xpForLevel(Math.min(100, cur + levelGrant)) }
          : m);
      }
      if (partyXp) {
        roster = roster.map(m => ({ ...m, xp: (m.xp ?? 0) + partyXp }));
      }
      inventory[item] -= 1;
      if (statEffect) stats = applyDelta(stats, statEffect);
      continue;
    }
  }

  return { roster, box, inventory, stats, seen, caught };
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
    origin: 'starter',
    joinedAt: -1,
    types: monTypes(setup.starterId),
    evolved: 0,
  }];
}

// ============================================================
// OPPONENT SELECTION
// ============================================================

/**
 * The named adversary standing at a chapter, if any.
 *
 * Gyms are indexed by how many badges the region has already yielded, so the
 * circuit is walked in order. The Elite Four is walked by its own position
 * within the phase. Syndicate operations interrupt the gym circuit at fixed
 * local chapters, which is what makes the region feel inhabited.
 */
function opponentAt(opts: {
  seed: number;
  regionId: string;
  phase: ChapterPhase;
  localIndex: number;
  earnedHere: number;
  e4Step: number;
  tour: string[];
  ghosts: Opponent[];
  wcStep: number;
}): Opponent | null {
  const { seed, regionId, phase, localIndex, earnedHere, e4Step, tour, ghosts, wcStep } = opts;

  if (phase === 'gym-circuit') {
    // Syndicate shows up twice per region, between gyms.
    if (localIndex > 0 && localIndex % 4 === 3) return syndicateFor(seed, regionId);
    const leaders = gymLeaders(seed, regionId);
    return leaders[Math.min(earnedHere, leaders.length - 1)] ?? null;
  }
  if (phase === 'elite-four') {
    const four = eliteFour(seed, regionId);
    if (e4Step < four.length) return four[e4Step];
    return regionChampion(seed, regionId);
  }
  if (phase === 'world-cup') {
    const field = worldCupField(seed, tour, ghosts);
    return field[Math.min(wcStep, field.length - 1)] ?? null;
  }
  return null;
}

/**
 * The ordered opponents a chapter can work through.
 *
 * One entry for most phases. Two ladders get more, because both need more
 * fights than their phase has chapters (see `ChapterInput.chain`):
 *
 *   * gym-circuit — the current leader plus the next one, so a strong day can
 *     take two badges and eight per region is reachable.
 *   * elite-four — the remaining members from `e4Step` on, then the region
 *     champion. Canonically a gauntlet with no healing, which is exactly what
 *     the chain's compounding tiredness penalty models.
 */
function chainAt(opts: {
  seed: number;
  regionId: string;
  phase: ChapterPhase;
  opponent: Opponent | null;
  earnedHere: number;
  e4Step: number;
}): Opponent[] {
  const { seed, regionId, phase, opponent, earnedHere, e4Step } = opts;
  if (!opponent) return [];

  if (phase === 'gym-circuit' && opponent.kind === 'gym') {
    const next = gymLeaders(seed, regionId)[earnedHere + 1];
    return next ? [opponent, next] : [opponent];
  }

  if (phase === 'elite-four') {
    const four = eliteFour(seed, regionId);
    // The gauntlet from wherever the player has got to, then the champion.
    const rest = four.slice(Math.min(e4Step, four.length));
    const chain = rest.length ? rest : [];
    return [...chain, regionChampion(seed, regionId)];
  }

  return [opponent];
}

/** Regions the player can travel to next, with what each offers. */
function travelOptionsFor(seed: number, visited: string[], chapterIndex: number): TravelOption[] {
  const remaining = JOURNEY_REGIONS.filter(r => !visited.includes(r.id));
  if (remaining.length === 0) return [];
  const rng = namedRng(seed, `travel-${chapterIndex}`);
  const offer = sample(rng, remaining, Math.min(3, remaining.length));
  return offer.map(r => {
    const pools = getPools(r.gen, r.id);
    const formLabel = REGION_FORM_LABEL[r.id];
    return {
      regionId: r.id,
      label: r.label,
      formLabel,
      legendaryCount: pools.legendary.length,
      previewIds: sample(namedRng(seed, `travel-preview-${r.id}`), pools.rare.length ? pools.rare : pools.common, 3),
    };
  });
}

/** Human-readable regional-variant line per region, for the travel card. */
const REGION_FORM_LABEL: Record<string, string | undefined> = {
  alola: 'Alolan forms',
  galar: 'Galarian forms',
  paldea: 'Paldean forms',
  sinnoh: 'Hisuian forms',
};

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
export function simulate(
  setup: JourneySetup,
  choices: RecordedChoice[],
  actions: PrepareAction[] = [],
  /**
   * Other players' finished teams, used as World Cup opponents. Optional and
   * additive: with none supplied the bracket fills with generated challengers,
   * so the game is identical offline and on day one.
   */
  ghostOpponents: Opponent[] = [],
): SimSnapshot {
  const chapterCount = chapterCountFor(setup);
  const { decisionEvery } = getPace(setup.pace);

  let stats = initialStats();
  let roster = initialRoster(setup);
  let box: BoxEntry[] = [];
  let inventory = emptyInventory();
  // Dex seeded with the starter — the trainer has, at minimum, met their own.
  const seen: number[] = [setup.starterId];
  const caught: number[] = [setup.starterId];
  const grantedFor = new Set<number>();
  const chapters: ChapterResult[] = [];
  const usedCardIds = new Set<string>();
  const usedBeats = new Set<string>();
  const choiceByChapter = new Map(choices.map(c => [c.chapterIndex, c]));

  // Region tour, badges, stakes and events — the long-campaign + Balatro layer.
  const tour = regionTour(setup);
  const badges: BadgeEarned[] = [];
  const stakes: Stake[] = buildStakes(setup);
  const events: JourneyEvent[] = [];
  const usedLegendary = new Set<string>();
  const regionBadgeCount = new Map<string, number>();
  const crowns: RegionCrown[] = [];
  const battles: OpponentResult[] = [];
  // Player-chosen travel overrides the seeded tour; visited order is what the
  // region resolver actually walks.
  const travelByChapter = new Map(
    actions.filter(a => a.type === 'travel').map(a => [a.chapterIndex, a.regionId]),
  );
  const visited: string[] = [tour[0]];
  for (const [, regionId] of [...travelByChapter.entries()].sort((a, b) => a[0] - b[0])) {
    if (!visited.includes(regionId)) visited.push(regionId);
  }
  let e4Step = 0;
  let wcStep = 0;
  let syndicateBeaten = 0;

  const mergeDex = (addSeen: number[], addCaught: number[]) => {
    for (const id of addSeen) if (!seen.includes(id)) seen.push(id);
    for (const id of addCaught) {
      if (!caught.includes(id)) caught.push(id);
      if (!seen.includes(id)) seen.push(id);
    }
  };

  for (let index = 0; index < chapterCount; index++) {
    const phase = phaseFor(index, chapterCount);
    const here = regionAt(setup, index);
    // Player travel choices replace the seeded tour stop for their leg.
    const regionId = visited[Math.min(here.tourIndex, visited.length - 1)] ?? here.regionId;
    const regionGen = getRegion(regionId).gen;
    const earnedHere = regionBadgeCount.get(regionId) ?? 0;

    const opponent = opponentAt({
      seed: setup.seed, regionId, phase, localIndex: here.localIndex,
      earnedHere, e4Step, tour: visited, ghosts: ghostOpponents, wcStep,
    });
    // e4Step advances by members actually BEATEN, not by chapters spent. With
    // the chain resolving a gauntlet in one sitting, a chapter-counter would
    // skip members the player never faced — and would also let a loss advance
    // the ladder, which is the opposite of a gauntlet.
    const e4StepNow = e4Step;
    if (phase === 'world-cup') wcStep++;

    let risk = 1;
    let choiceDelta: StatDelta | null = null;
    let choiceOptionId: string | null = null;

    if (isDecisionChapter(index, chapterCount, decisionEvery)) {
      const card = selectCard(setup.seed, index, phase, setup.archetype, usedCardIds);
      usedCardIds.add(card.id);

      // Grant this chapter's item once, the first time we arrive, so it's
      // spendable in the prepare step at the same decision.
      if (!grantedFor.has(index)) {
        grantedFor.add(index);
        const grant = itemGrantFor(setup.seed, index);
        if (grant) inventory = { ...inventory, [grant]: (inventory[grant] ?? 0) + 1 };
      }

      // Apply any recorded prepare-actions BEFORE the decision resolves, so the
      // team the player shaped (evolutions, ace, items) is what faces the
      // chapter — and is what the awaiting-decision snapshot shows.
      const prepped = applyPrepareActions(
        { roster, box, inventory, stats, seen, caught }, actions, index,
      );
      roster = prepped.roster;
      box = prepped.box;
      inventory = prepped.inventory;
      stats = prepped.stats;
      mergeDex(prepped.seen, prepped.caught);

      // Quest board for THIS decision only — the final board is recomputed at
      // the end of the run, so this local never needs to outlive the return.
      const boardNow = questBoard({
        seed: setup.seed, stats, roster, dex: { seen, caught }, badges,
        regionId, events, syndicateBeaten,
      });

      const recorded = choiceByChapter.get(index);
      if (!recorded) {
        // A crossroads opens at the END of a region's Elite Four, when there
        // is somewhere left to go — that's the "go international" moment.
        const atCrossroads = phase === 'elite-four'
          && crowns.some(c => c.regionId === regionId)
          && visited.length < getCampaign(setup.campaign).regions;
        return {
          status: 'awaiting-decision',
          chapters,
          stats,
          roster,
          box,
          dex: { seen: [...seen], caught: [...caught] },
          badges: [...badges],
          region: {
            regionId, tour, tourIndex: here.tourIndex, regionBadges: earnedHere,
          },
          stakes: stakes.map(st => ({ ...st })),
          events: [...events],
          inventory,
          chapterCount,
          decision: {
            chapterIndex: index,
            card,
            vars: decisionVars(setup, roster, stats, index),
          },
          quests: boardNow,
          crowns: [...crowns],
          battles: [...battles],
          opponent: opponent ? {
            kind: opponent.kind, name: opponent.name, title: opponent.title,
            specialty: opponent.specialty, level: opponent.level,
            teamIds: opponent.teamIds, ghost: opponent.ghost,
          } : undefined,
          opponentAdvantage: opponent
            ? matchupFor(
                roster, opponent,
                roster.length
                  ? Math.round(roster.reduce((n, m) => n + levelFromXp(m.xp ?? 0), 0) / roster.length)
                  : 5,
              ).advantage
            : undefined,
          prepare: {
            ...computePrepare(roster, box, stats, inventory),
            travelOptions: atCrossroads
              ? travelOptionsFor(setup.seed, visited, index)
              : undefined,
          },
        };
      }

      const option = card.options.find(o => o.id === recorded.optionId) ?? card.options[0];
      risk = option.riskMultiplier ?? 1;
      choiceDelta = option.delta;
      choiceOptionId = option.id;
    }

    // A rematch is any named opponent this run has already faced and lost to.
    // With badges gated on winning, a lost gym leaves `earnedHere` unmoved, so
    // the SAME leader is selected again next chapter — this flags that so the
    // recap can say "rematch" instead of silently repeating a name.
    const rematch = opponent
      ? battles.some(b => b.name === opponent.name && !b.won)
      : false;

    const resolved = resolveChapter({
      setup, index, phase, stats, roster, risk, choiceDelta, choiceOptionId,
      badgeRoom: BADGES_PER_REGION - earnedHere, regionGen, regionId,
      chain: chainAt({
        seed: setup.seed, regionId, phase, opponent, earnedHere, e4Step: e4StepNow,
      }),
      rematch, usedBeats,
    });
    chapters.push(resolved.chapter);
    stats = resolved.chapter.stats;
    roster = resolved.roster;
    mergeDex(resolved.seenAdded, resolved.caughtAdded);

    for (const b of resolved.battles) {
      battles.push(b);
      if (b.won && b.kind === 'elite-four') e4Step++;
      if (b.won && b.kind === 'syndicate') syndicateBeaten++;
      // Beating a region Champion crowns the region.
      if (b.won && b.kind === 'champion' && !crowns.some(c => c.regionId === regionId)) {
        crowns.push({ regionId, chapterIndex: index, championName: b.name });
      }
    }

    // Record each badge individually so the UI can render a real badge track.
    if (resolved.badgesWon > 0) {
      for (let b = 0; b < resolved.badgesWon; b++) {
        badges.push({ regionId, index: earnedHere + b + 1, chapterIndex: index });
      }
      regionBadgeCount.set(regionId, earnedHere + resolved.badgesWon);
    }

    // Box the overflow catches.
    if (resolved.boxAdded.length) {
      const held = new Set([...roster.map(r => r.id), ...box.map(b => b.id)]);
      for (const entry of resolved.boxAdded) {
        if (held.has(entry.id)) continue;
        held.add(entry.id);
        box = [...box, entry];
      }
    }

    // Special event for this chapter — the rare/legendary pull.
    const ev = eventFor({ seed: setup.seed, chapterIndex: index, phase, regionGen, usedLegendary });
    if (ev) {
      if (ev.rarity === 'legendary') usedLegendary.add(ev.id);
      events.push(ev);
      if (ev.grantedId !== undefined) {
        mergeDex([ev.grantedId], [ev.grantedId]);
        const held = new Set([...roster.map(r => r.id), ...box.map(b => b.id)]);
        if (!held.has(ev.grantedId)) {
          // Marked as an EVENT mon, not as a shiny one. `shiny` used to be
          // `ev.rarity === 'legendary'`, which conflated two unrelated facts:
          // it made every legendary encounter shiny, made SHINY FLASH's grant
          // ordinary, and left the player no way to tell a shiny catch from a
          // legendary one. Origin and colour are now separate properties.
          box = [...box, {
            id: ev.grantedId,
            shiny: ev.grantedShiny === true,
            origin: 'event' as const,
            eventId: ev.id,
            xp: xpForLevel(levelForNewCatch(stats, index)),
            caughtAt: index,
          }];
          // An event shiny is still a shiny. Counting it here keeps the stat
          // consistent with what is actually in the box — the same invariant
          // the per-chapter catch path now maintains.
          if (ev.grantedShiny) stats = applyDelta(stats, { shinies: 1 });
          // Surface it on the chapter that granted it, so the recap can call
          // the moment out instead of the Pokémon appearing in the box unseen.
          const last = chapters[chapters.length - 1];
          if (last) {
            last.eventMonId = ev.grantedId;
            last.eventMonShiny = ev.grantedShiny === true ? true : undefined;
          }
        }
      }
    }
  }

  // Complete the six from the species the trainer actually CAUGHT this run
  // (falling back to the region pool only if they somehow caught nothing new).
  // This is the "true six" fix — the roster is the trainer's, never filler.
  roster = padRoster(setup, roster, caught);

  const dex: DexState = { seen: [...seen], caught: [...caught] };

  // Reconcile the shiny count against the Pokémon actually held.
  //
  // The per-chapter counter can drift above the truth: a shiny catch is dropped
  // when the species is already owned, and `padRoster` can displace a member.
  // Measured over 6,000 careers, 101 runs finished claiming a shiny they had
  // none of — a number on the Legend Card with nothing behind it, which is the
  // same class of defect as the counter that never set the flag at all.
  //
  // A duplicate of something you already own is not a new shiny, so the honest
  // figure is the count of distinct shiny Pokémon in hand.
  const shinyHeld = new Set<number>();
  for (const m of roster) if (m.shiny) shinyHeld.add(m.id);
  for (const b of box) if (b.shiny) shinyHeld.add(b.id);
  if (stats.shinies !== shinyHeld.size) stats = { ...stats, shinies: shinyHeld.size };

  const breakdown = scoreCareer(stats, setup.archetype, chapterCount);

  // ---- the Balatro layer lands on the score ----
  // Stacked event multipliers apply to the final total, so a run that hit a
  // legendary event genuinely outscores one that didn't. Antes are then banked
  // against their escalating targets.
  // Final quest board, then the stacked multipliers: events × quests.
  const quests: Quest[] = questBoard({
    seed: setup.seed, stats, roster, dex, badges,
    regionId: regionAt(setup, Math.max(0, chapterCount - 1)).regionId,
    events, syndicateBeaten,
  });
  stats = applyDelta(stats, { fame: questFame(quests) });
  const mult = eventMultiplier(events) * questMultiplier(quests);
  // The multiplier closes the gap to the ceiling instead of multiplying through
  // it. `total * mult` clamped at 999, and the clamp was binding for more than
  // 15% of runs — measured p85 through p99 were ALL exactly 999. Two things
  // broke at once: the score stopped discriminating between good and superb
  // careers (everyone in the top sixth shares one number on the share card),
  // and because every one of those runs cleared the top verdict tier
  // simultaneously, the ELITE *fallback* verdicts became the most common
  // outcomes in the game — THE COLLECTOR alone was 10.1% of all runs, more than
  // any ordinary verdict. A prestige tier that fires for a sixth of players is
  // not a prestige tier.
  //
  // Closing a fraction of the remaining headroom keeps every property the
  // Balatro layer wants — strictly increasing in `mult`, so hitting a legendary
  // event always beats not hitting one — while making 999 an asymptote that no
  // stack can reach. High scores gain less in absolute terms than middling ones,
  // which is correct: they had less room left to win.
  const base = breakdown.total / MAX_SCORE;
  const finalScore = Math.round(MAX_SCORE * (1 - (1 - base) / Math.max(1, mult)));
  const spec = getCampaign(setup.campaign);
  const bankedStakes: Stake[] = stakes.map((st, i) => {
    // Each ante banks the share of the score earned by the end of its region.
    const share = spec.regions > 0 ? (i + 1) / spec.regions : 1;
    const banked = Math.round(finalScore * share);
    return { ...st, banked, cleared: banked >= st.target };
  });

  const verdict = resolveVerdict(stats, setup.archetype, finalScore);
  const lastRegion = regionAt(setup, Math.max(0, chapterCount - 1));

  const run: JourneyRun = {
    setup,
    chapters,
    choices: chapters
      .map(c => choiceByChapter.get(c.index))
      .filter((c): c is RecordedChoice => c !== undefined),
    actions: actions.filter(a => a.chapterIndex < chapterCount),
    stats,
    roster,
    box,
    dex,
    badges,
    region: {
      regionId: lastRegion.regionId,
      tour,
      tourIndex: lastRegion.tourIndex,
      regionBadges: regionBadgeCount.get(lastRegion.regionId) ?? 0,
    },
    stakes: bankedStakes,
    events,
    quests,
    crowns,
    battles,
    verdict,
    score: finalScore,
    breakdown: { ...breakdown, total: finalScore },
    chapterCount,
  };

  return {
    status: 'complete', chapters, stats, roster, box, dex, badges,
    region: run.region, stakes: bankedStakes, events, quests, crowns, battles,
    inventory, chapterCount, run,
  };
}

function padRoster(setup: JourneySetup, roster: RosterEntry[], caught: number[] = []): RosterEntry[] {
  if (roster.length >= ROSTER_SIZE) return roster.slice(0, ROSTER_SIZE);
  const owned = new Set(roster.map(r => r.id));
  const out = [...roster];

  // Prefer species the trainer actually caught this run — a "true six" is
  // assembled from real encounters, in the order they were caught.
  for (const id of caught) {
    if (out.length >= ROSTER_SIZE) break;
    if (owned.has(id)) continue;
    owned.add(id);
    out.push({ id, shiny: false, origin: 'gift', joinedAt: -2, types: monTypes(id), evolved: 0 });
  }

  // Fallback: only if the caught pool couldn't fill the six (a very short or
  // catch-averse run), top up deterministically from the region pool.
  if (out.length < ROSTER_SIZE) {
    const rng = namedRng(setup.seed, 'roster-pad');
    const pools = getPools(getRegion(setup.regionId).gen);
    const pool = [...pools.rare, ...pools.common].filter(id => !owned.has(id));
    for (const id of sample(rng, pool, ROSTER_SIZE - out.length)) {
      if (owned.has(id)) continue;
      owned.add(id);
      out.push({ id, shiny: false, origin: 'gift', joinedAt: -2, types: monTypes(id), evolved: 0 });
    }
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
