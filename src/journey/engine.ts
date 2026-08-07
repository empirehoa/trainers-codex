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
import { resolveVerdict, scoreCareer } from './scoring';
import {
  BADGES_PER_REGION,
  type BadgeEarned, type BoxEntry, type CareerStats, type ChapterPhase,
  type ChapterResult, type DecisionCardSpec, type DexState, type EvolveOffer,
  type EvolveTarget, type JourneyEvent, type JourneyRun, type JourneySetup,
  type PendingDecision, type PrepareAction, type PrepareAvailability,
  type RecordedChoice, type RosterEntry, type SimSnapshot,
  type Stake, type StatDelta,
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
  /** Badges still available in the region being played. */
  badgeRoom: number;
  /** Region generation, for the recruit/catch pools on a multi-region tour. */
  regionGen: number;
  /** Region id currently being toured. */
  regionId: string;
}

function resolveChapter(input: ChapterInput): {
  chapter: ChapterResult;
  roster: RosterEntry[];
  seenAdded: number[];
  caughtAdded: number[];
  badgesWon: number;
  boxAdded: BoxEntry[];
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
  // Badges are capped at BADGES_PER_REGION per region so the gym circuit is a
  // real, completable track rather than an unbounded counter. `badgeRoom` is
  // what's left in the current region.
  const badgeRoom = Math.max(0, input.badgeRoom);
  const badgeRoll = phase === 'gym-circuit' && chance(rng, 0.72) ? randInt(rng, 1, 2) : 0;
  const badges = Math.min(badgeRoll, badgeRoom);

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
  for (let i = 0; i < catchRolls; i++) {
    // Wild sighting either way — a seen entry even when the catch fails.
    const sighted = nextSpecies();
    if (sighted !== undefined) seenAdded.push(sighted);
    if (chance(rng, 0.35 + mods.catchChance)) {
      catches++;
      if (sighted !== undefined) caughtAdded.push(sighted);
      if (chance(rng, mods.shinyChance * 0.28)) shinies++;
    }
  }

  // Catches beyond the party go to the BOX, so "swap in something I caught"
  // has real inventory behind it.
  const boxAdded: BoxEntry[] = caughtAdded.map(id => ({
    id, shiny: false, xp: xpForLevel(levelForNewCatch(stats, index)), caughtAt: index,
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
      recruitedShiny = shinies > 0 && chance(rng, 0.5);
      roster = [...roster, {
        id: recruitedId,
        shiny: recruitedShiny,
        joinedAt: index,
        types: monTypes(recruitedId),
        evolved: 0,
        xp: xpForLevel(levelForNewCatch(stats, index)),
      }];
      seenAdded.push(recruitedId);
      caughtAdded.push(recruitedId);
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

  return { chapter, roster, seenAdded, caughtAdded, badgesWon: badges, boxAdded };
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
        joinedAt: chapterIndex,
        types: typesOf(incoming.id),
        evolved: 0,
        xp: incoming.xp,
      } : m);
      // The benched member keeps its XP — swapping is reversible, not a cull.
      box = [
        ...box.slice(0, inIdx), ...box.slice(inIdx + 1),
        { id: outgoing.id, shiny: outgoing.shiny, xp: outgoing.xp ?? 0, caughtAt: outgoing.joinedAt },
      ];
      if (!seen.includes(incoming.id)) seen.push(incoming.id);
      if (!caught.includes(incoming.id)) caught.push(incoming.id);
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
    joinedAt: -1,
    types: monTypes(setup.starterId),
    evolved: 0,
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
export function simulate(
  setup: JourneySetup,
  choices: RecordedChoice[],
  actions: PrepareAction[] = [],
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
  const choiceByChapter = new Map(choices.map(c => [c.chapterIndex, c]));

  // Region tour, badges, stakes and events — the long-campaign + Balatro layer.
  const tour = regionTour(setup);
  const badges: BadgeEarned[] = [];
  const stakes: Stake[] = buildStakes(setup);
  const events: JourneyEvent[] = [];
  const usedLegendary = new Set<string>();
  const regionBadgeCount = new Map<string, number>();

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
    const regionId = here.regionId;
    const regionGen = getRegion(regionId).gen;
    const earnedHere = regionBadgeCount.get(regionId) ?? 0;

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

      const recorded = choiceByChapter.get(index);
      if (!recorded) {
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
          prepare: computePrepare(roster, box, stats, inventory),
        };
      }

      const option = card.options.find(o => o.id === recorded.optionId) ?? card.options[0];
      risk = option.riskMultiplier ?? 1;
      choiceDelta = option.delta;
      choiceOptionId = option.id;
    }

    const resolved = resolveChapter({
      setup, index, phase, stats, roster, risk, choiceDelta, choiceOptionId,
      badgeRoom: BADGES_PER_REGION - earnedHere, regionGen, regionId,
    });
    chapters.push(resolved.chapter);
    stats = resolved.chapter.stats;
    roster = resolved.roster;
    mergeDex(resolved.seenAdded, resolved.caughtAdded);

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
          box = [...box, {
            id: ev.grantedId, shiny: ev.rarity === 'legendary',
            xp: xpForLevel(levelForNewCatch(stats, index)), caughtAt: index,
          }];
        }
      }
    }
  }

  // Complete the six from the species the trainer actually CAUGHT this run
  // (falling back to the region pool only if they somehow caught nothing new).
  // This is the "true six" fix — the roster is the trainer's, never filler.
  roster = padRoster(setup, roster, caught);

  const dex: DexState = { seen: [...seen], caught: [...caught] };
  const breakdown = scoreCareer(stats, setup.archetype, chapterCount);

  // ---- the Balatro layer lands on the score ----
  // Stacked event multipliers apply to the final total, so a run that hit a
  // legendary event genuinely outscores one that didn't. Antes are then banked
  // against their escalating targets.
  const mult = eventMultiplier(events);
  const finalScore = Math.min(999, Math.round(breakdown.total * mult));
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
    verdict,
    score: finalScore,
    breakdown: { ...breakdown, total: finalScore },
    chapterCount,
  };

  return {
    status: 'complete', chapters, stats, roster, box, dex, badges,
    region: run.region, stakes: bankedStakes, events, inventory, chapterCount, run,
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
    out.push({ id, shiny: false, joinedAt: -2, types: monTypes(id), evolved: 0 });
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
      out.push({ id, shiny: false, joinedAt: -2, types: monTypes(id), evolved: 0 });
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
