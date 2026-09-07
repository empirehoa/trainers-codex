// Journey Mode content: regions, starters, recruit pools, decision cards,
// verdict table, and the flavor layer.
//
// ── The flavor layer, and why it is a data swap ──────────────────────────
// Every user-visible reference to a Pokémon goes through `describeMon()`.
// With JOURNEY_SPECIES_FLAVOR on, that returns the species display name
// ("Charizard"). With the flag off it returns a type/role descriptor
// ("your Fire-type ace"). Nothing else in the engine, the recap UI, or the
// Legend Card renderer knows which mode is active — they interpolate whatever
// string they're handed. If IP counsel narrows what we may ship, flipping the
// flag is the entire change. See docs/JOURNEY_MODE.md § IP degradation path.

import { POKEMON_BY_ID, POKEMON_LIST, getGen } from '@/lib/pokemon';
import { GENERATIONS } from '@/lib/constants';
import { isEnabled } from '@/lib/flags';
import type { Pokemon, PokemonType } from '@/lib/types';
import type { Archetype, ChapterPhase, DecisionCardSpec, Pace, Verdict } from './types';

// ============================================================
// REGIONS + STARTERS
// ============================================================

export interface JourneyRegion {
  id: string;
  /** Generation number — used to scope the recruit pool. */
  gen: number;
  /** Region label. Not translated: these are proper nouns in every locale. */
  label: string;
  /** First-stage starter trio offered on the setup screen. */
  starters: [number, number, number];
}

export const JOURNEY_REGIONS: JourneyRegion[] = [
  { id: 'kanto',  gen: 1, label: 'Kanto',  starters: [1, 4, 7] },
  { id: 'johto',  gen: 2, label: 'Johto',  starters: [152, 155, 158] },
  { id: 'hoenn',  gen: 3, label: 'Hoenn',  starters: [252, 255, 258] },
  { id: 'sinnoh', gen: 4, label: 'Sinnoh', starters: [387, 390, 393] },
  { id: 'unova',  gen: 5, label: 'Unova',  starters: [495, 498, 501] },
  { id: 'kalos',  gen: 6, label: 'Kalos',  starters: [650, 653, 656] },
  { id: 'alola',  gen: 7, label: 'Alola',  starters: [722, 725, 728] },
  { id: 'galar',  gen: 8, label: 'Galar',  starters: [810, 813, 816] },
  { id: 'paldea', gen: 9, label: 'Paldea', starters: [906, 909, 912] },
];

export function getRegion(id: string): JourneyRegion {
  return JOURNEY_REGIONS.find(r => r.id === id) ?? JOURNEY_REGIONS[0];
}

export const REGION_IDS = JOURNEY_REGIONS.map(r => r.id);

// ============================================================
// RECRUIT POOLS
// ============================================================
// Built once at module load from the data layer already in the bundle — no
// new JSON. Base species only (no alternate forms): a career narrative about
// catching a Gigantamax form reads wrong, and forms would let the same
// species appear twice on one roster.

interface Pools {
  common: number[];
  rare: number[];
  legendary: number[];
}

const poolCache = new Map<string, Pools>();

/**
 * Regional forms belong to the region that produced them.
 *
 * Touring Alola should surface Alolan Vulpix, not just Kanto's — that's the
 * whole point of a region tour. Each region id maps to the `form` tag its
 * variants carry in the dataset; regions with no variant line map to none.
 */
const REGION_FORM_TAG: Record<string, string | null> = {
  kanto: null, johto: null, hoenn: null, sinnoh: null, unova: null,
  kalos: null,
  alola: 'alolan',
  galar: 'galarian',
  paldea: 'paldean',
};

/** Hisuian forms are Legends-Arceus era; surface them alongside Sinnoh. */
const EXTRA_FORM_TAGS: Record<string, string[]> = {
  sinnoh: ['hisuian'],
};

function formTagsFor(regionId: string | undefined): Set<string> {
  if (!regionId) return new Set();
  const tags = new Set<string>();
  const main = REGION_FORM_TAG[regionId];
  if (main) tags.add(main);
  for (const extra of EXTRA_FORM_TAGS[regionId] ?? []) tags.add(extra);
  return tags;
}

function buildPools(regionGen: number, regionId?: string): Pools {
  const common: number[] = [];
  const rare: number[] = [];
  const legendary: number[] = [];
  const formTags = formTagsFor(regionId);

  for (const entry of POKEMON_LIST) {
    const p = POKEMON_BY_ID[entry.id];
    if (!p) continue;
    if (p.form) {
      // Only the CURRENT region's own variant line is catchable, and only
      // regional variants — never Megas, Gigantamax, or story-only forms.
      if (!formTags.has(p.form)) continue;
    } else {
      const gen = getGen(p.id);
      // A career is regionally rooted but not sealed off — the home region's
      // dex plus everything from earlier generations is reachable.
      if (gen > regionGen) continue;
    }
    if (p.legendary || p.mythical) legendary.push(p.id);
    else if (p.bst >= 500) rare.push(p.id);
    else common.push(p.id);
  }
  return { common, rare, legendary };
}

/**
 * Species pools for a region. Pass the region id to include that region's
 * own regional forms; the gen-only signature stays for callers that don't
 * care (and keeps older behaviour).
 */
export function getPools(regionGen: number, regionId?: string): Pools {
  const key = `${regionGen}:${regionId ?? '-'}`;
  let pools = poolCache.get(key);
  if (!pools) {
    pools = buildPools(regionGen, regionId);
    poolCache.set(key, pools);
  }
  return pools;
}

// ============================================================
// TRAINER NAME POOL
// ============================================================
// Original, deliberately generic handles — not character names from the games
// or anime. Mixed styles so the random default doesn't feel like one voice.

export const TRAINER_NAMES: string[] = [
  'Ash Grey', 'Nova', 'Rill', 'Kestrel', 'Juno', 'Bex', 'Onyx', 'Wren',
  'Sable', 'Pike', 'Marlow', 'Vesper', 'Cass', 'Dune', 'Fable', 'Halo',
  'Indigo', 'Jett', 'Koa', 'Lyric', 'Mox', 'Nyx', 'Orrin', 'Pax',
  'Quill', 'Rowan', 'Sol', 'Tamsin', 'Umber', 'Vale', 'Wilder', 'Zephyr',
  'Ember Vale', 'Storm Quill', 'Ash Meridian', 'Cobalt', 'Ferro', 'Gale',
];

// ============================================================
// FLAVOR LAYER
// ============================================================

const TYPE_EPITHETS: Record<PokemonType, string> = {
  normal: 'all-rounder', fire: 'firebrand', water: 'tidebreaker',
  electric: 'live wire', grass: 'grower', ice: 'frostbite',
  fighting: 'brawler', poison: 'venom artist', ground: 'earthshaker',
  flying: 'skyrunner', psychic: 'mindreader', bug: 'swarmleader',
  rock: 'bedrock', ghost: 'phantom', dragon: 'dragonheart',
  dark: 'nightblade', steel: 'ironclad', fairy: 'charmbreaker',
};

/** Title-cased type, for the generic descriptors. */
function typeLabel(t: PokemonType): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * The single chokepoint for naming a Pokémon in user-visible Journey text.
 *
 * @param role optional slot descriptor ('ace', 'partner', 'find') used only
 *             by the generic path, where there is no name to lean on.
 */
export function describeMon(id: number, role: 'ace' | 'partner' | 'find' = 'partner'): string {
  const p = POKEMON_BY_ID[id];
  if (!p) return 'your partner';
  if (isEnabled('JOURNEY_SPECIES_FLAVOR')) return p.display;

  const primary = p.types[0] ?? 'normal';
  const noun = role === 'ace' ? 'ace' : role === 'find' ? 'find' : 'partner';
  return `your ${typeLabel(primary)}-type ${noun}`;
}

/** Short epithet for Legend Card captions — never a species name. */
export function monEpithet(id: number): string {
  const p = POKEMON_BY_ID[id];
  if (!p) return 'partner';
  return TYPE_EPITHETS[p.types[0] ?? 'normal'];
}

/**
 * Roster caption for the Legend Card. Species mode shows the name; generic
 * mode shows the type pairing, which is what the silhouette already conveys.
 */
export function rosterCaption(id: number): string {
  const p = POKEMON_BY_ID[id];
  if (!p) return '???';
  if (isEnabled('JOURNEY_SPECIES_FLAVOR')) return p.display;
  return p.types.map(typeLabel).join('/');
}

export function monTypes(id: number): PokemonType[] {
  return POKEMON_BY_ID[id]?.types ?? ['normal'];
}

export function getMon(id: number): Pokemon | null {
  return POKEMON_BY_ID[id] ?? null;
}

// ============================================================
// PACE
// ============================================================

export interface PaceInfo {
  id: Pace;
  /** Ask for a decision every N chapters. */
  decisionEvery: number;
  /** Approximate minutes, shown on the setup screen. */
  approxMinutes: string;
}

export const PACES: PaceInfo[] = [
  { id: 'express', decisionEvery: 3, approxMinutes: '~2' },
  { id: 'normal',  decisionEvery: 2, approxMinutes: '~4' },
  { id: 'intense', decisionEvery: 1, approxMinutes: '~8' },
];

export function getPace(id: Pace): PaceInfo {
  return PACES.find(p => p.id === id) ?? PACES[1];
}

export const ARCHETYPES: Archetype[] = ['aggro', 'stall', 'balance', 'collector', 'shiny-hunter'];

// ============================================================
// DECISION CARDS
// ============================================================
// Deltas are small — the sim's own rolls do most of the work. A choice should
// tilt a career, not decide it. `riskMultiplier` above 1 widens the outcome
// spread for that chapter in both directions.

// Every option with riskMultiplier > 1 carries a `payoff` — what a landed
// gamble leaves behind. Tiered by how much variance the pick buys, so bigger
// dice mean bigger durable upside rather than just a wider spread:
//
//   1.05–1.2   money the prepare step can spend (rerolls, later: shop)
//   1.25–1.35  money + a thematic item, or the chapter's fatigue refunded
//   1.45–1.6   a rare partner (legendary on the late-career stage) + refund
//
// See Payoff in types.ts for why: without these, min-risk beat max-risk for
// every archetype and the dice outweighed every decision in a run combined.
// journey/risk.test.ts sweeps the deck and fails if that ever comes back.
export const DECISION_CARDS: DecisionCardSpec[] = [
  {
    id: 'underdog-gym',
    phases: ['gym-circuit'],
    promptKey: 'journey.card.underdog-gym.prompt',
    options: [
      { id: 'challenge', labelKey: 'journey.card.underdog-gym.challenge.label', flavorKey: 'journey.card.underdog-gym.challenge.flavor', delta: { fame: 6, fatigue: 8 }, riskMultiplier: 1.35, payoff: { money: 500, fatigue: -14, fame: 2 } },
      { id: 'train',     labelKey: 'journey.card.underdog-gym.train.label',     flavorKey: 'journey.card.underdog-gym.train.flavor',     delta: { bond: 8, fatigue: -6, fame: -2 }, riskMultiplier: 0.8 },
    ],
    affinity: ['aggro'],
  },
  {
    id: 'rare-encounter',
    phases: ['gym-circuit', 'regional', 'national'],
    promptKey: 'journey.card.rare-encounter.prompt',
    options: [
      // The risk arms were inverted against the card's own fiction: catching the
      // rare Pokémon was the SAFE pick (0.85) and walking past it the risky one
      // (1.15). Under a max-risk strategy a Collector therefore skipped every
      // catch card, which is most of why that archetype's risky careers scored
      // 29 points below its safe ones. Hunting is the gamble; it pays in catches.
      { id: 'catch',   labelKey: 'journey.card.rare-encounter.catch.label',   flavorKey: 'journey.card.rare-encounter.catch.flavor',   delta: { catches: 1, bond: 4, fatigue: 10 }, riskMultiplier: 1.3, payoff: { recruit: 'rare', catches: 3, fatigue: -17 } },
      { id: 'prepare', labelKey: 'journey.card.rare-encounter.prepare.label', flavorKey: 'journey.card.rare-encounter.prepare.flavor', delta: { fatigue: -4, bond: 3 }, riskMultiplier: 0.9 },
      { id: 'both',    labelKey: 'journey.card.rare-encounter.both.label',    flavorKey: 'journey.card.rare-encounter.both.flavor',    delta: { catches: 1, fatigue: 16, fame: 3 }, riskMultiplier: 1.0 },
    ],
    affinity: ['collector', 'shiny-hunter'],
  },
  {
    id: 'rival-wager',
    phases: ['gym-circuit', 'regional', 'national', 'worlds'],
    promptKey: 'journey.card.rival-wager.prompt',
    options: [
      { id: 'accept',  labelKey: 'journey.card.rival-wager.accept.label',  flavorKey: 'journey.card.rival-wager.accept.flavor',  delta: { fame: 10, fatigue: 6 }, riskMultiplier: 1.5, payoff: { money: 900, recruit: 'rare', fatigue: -12, fame: 4, catches: 1} },
      { id: 'decline', labelKey: 'journey.card.rival-wager.decline.label', flavorKey: 'journey.card.rival-wager.decline.flavor', delta: { fame: -4, bond: 3 }, riskMultiplier: 0.75 },
    ],
    affinity: ['aggro', 'balance'],
  },
  {
    id: 'evolve-timing',
    phases: ['gym-circuit', 'regional'],
    promptKey: 'journey.card.evolve-timing.prompt',
    options: [
      { id: 'now',   labelKey: 'journey.card.evolve-timing.now.label',   flavorKey: 'journey.card.evolve-timing.now.flavor',   delta: { wins: 3, bond: -3 }, riskMultiplier: 1.1, payoff: { money: 300, item: 'rare-candy', bond: 6 } },
      { id: 'delay', labelKey: 'journey.card.evolve-timing.delay.label', flavorKey: 'journey.card.evolve-timing.delay.flavor', delta: { bond: 10 }, riskMultiplier: 0.9 },
    ],
  },
  {
    id: 'go-pro',
    phases: ['regional', 'national'],
    promptKey: 'journey.card.go-pro.prompt',
    options: [
      { id: 'overseas', labelKey: 'journey.card.go-pro.overseas.label', flavorKey: 'journey.card.go-pro.overseas.flavor', delta: { fame: 14, fatigue: 12 }, riskMultiplier: 1.6, payoff: { recruit: 'rare', fatigue: -21, fame: 6, catches: 1} },
      // NOT `badges: 1`. A badge now means "you beat a gym leader" and is
      // recorded on the region badge track, so handing one out as a card reward
      // desynced the badge STAT from the track: a run could report 5 badges
      // with 4 on the track and 4 gym wins behind them. Nothing else in the
      // game grants a badge, and nothing else should.
      { id: 'regional', labelKey: 'journey.card.go-pro.regional.label', flavorKey: 'journey.card.go-pro.regional.flavor', delta: { fame: 6, bond: 8 }, riskMultiplier: 0.8 },
    ],
    affinity: ['balance'],
  },
  {
    id: 'comeback-tour',
    phases: ['veteran'],
    promptKey: 'journey.card.comeback-tour.prompt',
    options: [
      { id: 'comeback', labelKey: 'journey.card.comeback-tour.comeback.label', flavorKey: 'journey.card.comeback-tour.comeback.flavor', delta: { fame: 12, fatigue: 18 }, riskMultiplier: 1.55, payoff: { recruit: 'legendary', fatigue: -31, fame: 6, catches: 1} },
      { id: 'retire',   labelKey: 'journey.card.comeback-tour.retire.label',   flavorKey: 'journey.card.comeback-tour.retire.flavor',   delta: { bond: 14, fame: 4, fatigue: -20 }, riskMultiplier: 0.7 },
    ],
  },
  {
    id: 'sponsor-offer',
    phases: ['regional', 'national', 'worlds'],
    promptKey: 'journey.card.sponsor-offer.prompt',
    options: [
      { id: 'sign',    labelKey: 'journey.card.sponsor-offer.sign.label',    flavorKey: 'journey.card.sponsor-offer.sign.flavor',    delta: { fame: 12, bond: -6, fatigue: 4 }, riskMultiplier: 1.1, payoff: { money: 1200, bond: 8 } },
      { id: 'refuse',  labelKey: 'journey.card.sponsor-offer.refuse.label',  flavorKey: 'journey.card.sponsor-offer.refuse.flavor',  delta: { bond: 8, fame: -3 }, riskMultiplier: 0.95 },
    ],
  },
  {
    id: 'team-fatigue',
    phases: ['regional', 'national', 'worlds', 'veteran'],
    promptKey: 'journey.card.team-fatigue.prompt',
    options: [
      { id: 'rest',  labelKey: 'journey.card.team-fatigue.rest.label',  flavorKey: 'journey.card.team-fatigue.rest.flavor',  delta: { fatigue: -25, fame: -3 }, riskMultiplier: 0.7 },
      { id: 'push',  labelKey: 'journey.card.team-fatigue.push.label',  flavorKey: 'journey.card.team-fatigue.push.flavor',  delta: { fatigue: 12, fame: 5 }, riskMultiplier: 1.3, payoff: { money: 400, fatigue: -21, fame: 2 } },
      { id: 'rotate', labelKey: 'journey.card.team-fatigue.rotate.label', flavorKey: 'journey.card.team-fatigue.rotate.flavor', delta: { fatigue: -12, catches: 1, bond: -4 }, riskMultiplier: 0.95 },
    ],
  },
  {
    id: 'shiny-rumor',
    phases: ['gym-circuit', 'regional', 'national', 'veteran'],
    promptKey: 'journey.card.shiny-rumor.prompt',
    options: [
      // Same inversion as rare-encounter: "Go hunt it" was the steady pick and
      // "Let it go" the risky one — the consequence line made that visible for
      // the first time, tagging the do-nothing option as the gamble.
      { id: 'hunt',   labelKey: 'journey.card.shiny-rumor.hunt.label',   flavorKey: 'journey.card.shiny-rumor.hunt.flavor',   delta: { fatigue: 14, fame: 4 }, riskMultiplier: 1.4, payoff: { recruit: 'rare', shinies: 1, catches: 1, fatigue: -24, fame: 4 } },
      { id: 'ignore', labelKey: 'journey.card.shiny-rumor.ignore.label', flavorKey: 'journey.card.shiny-rumor.ignore.flavor', delta: { fatigue: -4, bond: 3 }, riskMultiplier: 0.9 },
    ],
    affinity: ['shiny-hunter'],
  },
  {
    id: 'mentor-request',
    phases: ['national', 'worlds', 'veteran'],
    promptKey: 'journey.card.mentor-request.prompt',
    options: [
      { id: 'mentor',  labelKey: 'journey.card.mentor-request.mentor.label',  flavorKey: 'journey.card.mentor-request.mentor.flavor',  delta: { fame: 8, bond: 10, fatigue: 6 }, riskMultiplier: 0.9 },
      { id: 'focus',   labelKey: 'journey.card.mentor-request.focus.label',   flavorKey: 'journey.card.mentor-request.focus.flavor',   delta: { fatigue: -6 }, riskMultiplier: 1.2, payoff: { money: 300, item: 'exp-share', fatigue: -5 } },
    ],
  },
  {
    id: 'format-shift',
    phases: ['national', 'worlds'],
    promptKey: 'journey.card.format-shift.prompt',
    options: [
      { id: 'adapt',  labelKey: 'journey.card.format-shift.adapt.label',  flavorKey: 'journey.card.format-shift.adapt.flavor',  delta: { catches: 2, bond: -5, fatigue: 8 }, riskMultiplier: 1.15, payoff: { money: 350, item: 'link-cord', fatigue: -14, bond: 6 } },
      { id: 'commit', labelKey: 'journey.card.format-shift.commit.label', flavorKey: 'journey.card.format-shift.commit.flavor', delta: { bond: 12, fame: 4 }, riskMultiplier: 0.85 },
    ],
    affinity: ['stall'],
  },
  {
    id: 'injury-scare',
    phases: ['regional', 'national', 'worlds', 'veteran'],
    promptKey: 'journey.card.injury-scare.prompt',
    options: [
      { id: 'withdraw', labelKey: 'journey.card.injury-scare.withdraw.label', flavorKey: 'journey.card.injury-scare.withdraw.flavor', delta: { fatigue: -22, bond: 12, fame: -6 }, riskMultiplier: 0.6 },
      { id: 'compete',  labelKey: 'journey.card.injury-scare.compete.label',  flavorKey: 'journey.card.injury-scare.compete.flavor',  delta: { fatigue: 20, fame: 8 }, riskMultiplier: 1.45, payoff: { recruit: 'rare', fatigue: -34, fame: 6, catches: 1} },
    ],
    affinity: ['stall'],
  },
  {
    id: 'trade-offer',
    phases: ['gym-circuit', 'regional', 'national'],
    promptKey: 'journey.card.trade-offer.prompt',
    options: [
      { id: 'trade', labelKey: 'journey.card.trade-offer.trade.label', flavorKey: 'journey.card.trade-offer.trade.flavor', delta: { catches: 1, bond: -8, wins: 2 }, riskMultiplier: 1.1, payoff: { item: 'evo-stone', bond: 10, money: 300, catches: 1 } },
      { id: 'keep',  labelKey: 'journey.card.trade-offer.keep.label',  flavorKey: 'journey.card.trade-offer.keep.flavor',  delta: { bond: 12 }, riskMultiplier: 0.95 },
    ],
    affinity: ['collector'],
  },
  {
    id: 'documentary',
    phases: ['worlds', 'veteran'],
    promptKey: 'journey.card.documentary.prompt',
    options: [
      { id: 'allow',  labelKey: 'journey.card.documentary.allow.label',  flavorKey: 'journey.card.documentary.allow.flavor',  delta: { fame: 18, fatigue: 8, bond: -4 }, riskMultiplier: 1.05, payoff: { money: 800, fatigue: -14, bond: 6 } },
      { id: 'refuse', labelKey: 'journey.card.documentary.refuse.label', flavorKey: 'journey.card.documentary.refuse.flavor', delta: { bond: 8, fatigue: -4 }, riskMultiplier: 0.95 },
    ],
  },
  {
    id: 'dex-completion',
    phases: ['national', 'worlds', 'veteran'],
    promptKey: 'journey.card.dex-completion.prompt',
    options: [
      { id: 'chase',  labelKey: 'journey.card.dex-completion.chase.label',  flavorKey: 'journey.card.dex-completion.chase.flavor',  delta: { catches: 5, fatigue: 14, fame: 5 }, riskMultiplier: 0.8 },
      { id: 'ladder', labelKey: 'journey.card.dex-completion.ladder.label', flavorKey: 'journey.card.dex-completion.ladder.flavor', delta: { wins: 4, fatigue: 6 }, riskMultiplier: 1.2, payoff: { money: 450, item: 'rare-candy', recruit: 'rare', fatigue: -10, catches: 1} },
    ],
    affinity: ['collector'],
  },
  {
    id: 'final-roster',
    phases: ['worlds', 'veteran'],
    promptKey: 'journey.card.final-roster.prompt',
    options: [
      { id: 'loyal', labelKey: 'journey.card.final-roster.loyal.label', flavorKey: 'journey.card.final-roster.loyal.flavor', delta: { bond: 18, fame: 4 }, riskMultiplier: 0.85 },
      { id: 'meta',  labelKey: 'journey.card.final-roster.meta.label',  flavorKey: 'journey.card.final-roster.meta.flavor',  delta: { wins: 5, bond: -10, catches: 2 }, riskMultiplier: 1.25, payoff: { money: 600, item: 'exp-share', bond: 12 } },
    ],
  },
  {
    id: 'e4-order',
    phases: ['elite-four'],
    promptKey: 'journey.card.e4-order.prompt',
    options: [
      { id: 'lead-ace',  labelKey: 'journey.card.e4-order.lead-ace.label',  flavorKey: 'journey.card.e4-order.lead-ace.flavor',  delta: { fame: 6, fatigue: 10 }, riskMultiplier: 1.25, payoff: { money: 500, fatigue: -17, fame: 2 } },
      { id: 'lead-wall', labelKey: 'journey.card.e4-order.lead-wall.label', flavorKey: 'journey.card.e4-order.lead-wall.flavor', delta: { bond: 8, fatigue: 4 }, riskMultiplier: 0.85 },
    ],
    affinity: ['aggro', 'stall'],
  },
  {
    id: 'e4-rest',
    phases: ['elite-four'],
    promptKey: 'journey.card.e4-rest.prompt',
    options: [
      { id: 'push-on',  labelKey: 'journey.card.e4-rest.push-on.label',  flavorKey: 'journey.card.e4-rest.push-on.flavor',  delta: { fame: 8, fatigue: 14 }, riskMultiplier: 1.35, payoff: { money: 500, fatigue: -24, fame: 2 } },
      { id: 'breathe',  labelKey: 'journey.card.e4-rest.breathe.label',  flavorKey: 'journey.card.e4-rest.breathe.flavor',  delta: { fatigue: -10, bond: 5 }, riskMultiplier: 0.8 },
    ],
    affinity: ['stall'],
  },
  {
    id: 'e4-scout',
    phases: ['elite-four'],
    promptKey: 'journey.card.e4-scout.prompt',
    options: [
      { id: 'study',   labelKey: 'journey.card.e4-scout.study.label',   flavorKey: 'journey.card.e4-scout.study.flavor',   delta: { fatigue: 4, bond: 4 }, riskMultiplier: 0.85 },
      { id: 'improvise', labelKey: 'journey.card.e4-scout.improvise.label', flavorKey: 'journey.card.e4-scout.improvise.flavor', delta: { fame: 7, fatigue: 8 }, riskMultiplier: 1.3, payoff: { money: 450, item: 'energy-root', fatigue: -14, fame: 2 } },
    ],
    affinity: ['balance'],
  },
  {
    id: 'e4-gambit',
    phases: ['elite-four'],
    promptKey: 'journey.card.e4-gambit.prompt',
    options: [
      { id: 'all-in',   labelKey: 'journey.card.e4-gambit.all-in.label',   flavorKey: 'journey.card.e4-gambit.all-in.flavor',   delta: { fame: 12, fatigue: 18 }, riskMultiplier: 1.6, payoff: { recruit: 'rare', fatigue: -31, fame: 6, catches: 1} },
      { id: 'measured', labelKey: 'journey.card.e4-gambit.measured.label', flavorKey: 'journey.card.e4-gambit.measured.flavor', delta: { fatigue: -6, bond: 6 }, riskMultiplier: 0.8 },
    ],
  },
  {
    id: 'wc-scout',
    phases: ['world-cup'],
    promptKey: 'journey.card.wc-scout.prompt',
    options: [
      { id: 'scout',   labelKey: 'journey.card.wc-scout.scout.label',   flavorKey: 'journey.card.wc-scout.scout.flavor',   delta: { fatigue: 8 }, riskMultiplier: 0.8 },
      { id: 'trust',   labelKey: 'journey.card.wc-scout.trust.label',   flavorKey: 'journey.card.wc-scout.trust.flavor',   delta: { bond: 10, fame: 4 }, riskMultiplier: 1.2, payoff: { money: 600, item: 'soothe-bell', fatigue: -7 } },
    ],
  },
  {
    id: 'wc-final',
    phases: ['world-cup'],
    promptKey: 'journey.card.wc-final.prompt',
    options: [
      { id: 'signature', labelKey: 'journey.card.wc-final.signature.label', flavorKey: 'journey.card.wc-final.signature.flavor', delta: { fame: 16, fatigue: 12 }, riskMultiplier: 1.45, payoff: { recruit: 'legendary', fatigue: -21, fame: 8, catches: 1} },
      { id: 'safe',      labelKey: 'journey.card.wc-final.safe.label',      flavorKey: 'journey.card.wc-final.safe.flavor',      delta: { bond: 8, fatigue: 4 }, riskMultiplier: 0.9 },
    ],
  },
];

/** Cards eligible in a phase, in stable order. */
export function cardsForPhase(phase: ChapterPhase): DecisionCardSpec[] {
  return DECISION_CARDS.filter(c => c.phases.includes(phase));
}

export const DECISION_CARD_BY_ID = new Map(DECISION_CARDS.map(c => [c.id, c]));

// ============================================================
// CHAPTER FLAVOR BEATS
// ============================================================
// Beat ids per phase; the engine picks from these with the chapter's stream.
// Keys resolve to `journey.beat.<id>`.

// Pool size is load-bearing, not cosmetic. A phase covers 4-6 chapters and each
// chapter draws 1-2 beats, so a 6-line pool made a repeat inside one career
// near-certain — a 6,000-run sweep measured 99.7% of careers reusing a line.
// Twelve per phase (six for the single retirement chapter) plus the run-level
// dedup in engine.ts drops that to ~0. If you add a phase or raise the per-
// chapter beat count, re-check with the same sweep.
export const CHAPTER_BEATS: Record<ChapterPhase, string[]> = {
  'gym-circuit': [
    'first-badge', 'route-grind', 'gym-upset', 'crowd-notices', 'lost-close', 'training-camp',
    'rival-intro', 'night-grind', 'small-crowd', 'type-lesson', 'lucky-break', 'mentor-note',
  ],
  'regional': [
    'bracket-run', 'regional-final', 'meta-read', 'sponsor-scout', 'bad-matchup', 'clutch-set',
    'seed-upset', 'travel-budget', 'bracket-luck', 'team-gel', 'first-stream', 'coach-offer',
  ],
  'national': [
    'national-stage', 'travel-toll', 'top-cut', 'rival-rematch', 'format-lock', 'press-row',
    'hotel-prep', 'nemesis', 'tech-pick', 'crowd-turn', 'burnout-signs', 'roster-swap',
  ],
  'elite-four': [
    'e4-gauntlet', 'e4-no-heal', 'e4-final-door', 'e4-crowd-hush',
    'e4-first-room', 'e4-potion-count', 'e4-type-read', 'e4-ace-holds',
    'e4-attendant', 'e4-long-walk', 'e4-scoreboard', 'e4-champion-waits',
  ],
  'worlds': [
    'worlds-debut', 'day-two', 'stage-lights', 'heartbreak', 'trophy-lift', 'stream-clip',
    'opening-round', 'far-from-home', 'bracket-reset', 'ace-carry', 'photo-finish', 'locker-room',
  ],
  'world-cup': ['wc-opening', 'wc-bracket', 'wc-upset', 'wc-final-stage'],
  'veteran': [
    'veteran-grind', 'young-guns', 'legacy-set', 'body-aches', 'mentor-role', 'last-ladder',
    'coaching-gig', 'rival-retires', 'format-nostalgia', 'travel-lighter', 'one-more-major', 'signature-set',
  ],
  'retirement': [
    'final-bow', 'hall-of-fame', 'quiet-exit', 'passing-torch', 'last-interview', 'number-retired',
  ],
};

/** Chapter headline keys per phase — resolve to `journey.chapterTitle.<id>`. */
export const CHAPTER_TITLES: Record<ChapterPhase, string> = {
  'gym-circuit': 'gym-circuit',
  'regional': 'regional',
  'national': 'national',
  'elite-four': 'elite-four',
  'worlds': 'worlds',
  'world-cup': 'world-cup',
  'veteran': 'veteran',
  'retirement': 'retirement',
};

// ============================================================
// VERDICT TABLE
// ============================================================
// Ordered most-prestigious first; the scorer walks the list and takes the
// first entry whose archetype matches (or is 'any'), whose minScore is met,
// and whose `requires` predicate holds.
//
// Every archetype has a >=820 tier entry. That is the point of the
// position-relative scoring in scoring.ts: a Shiny Hunter run and a Champion
// run should both be able to end on a headline worth screenshotting.

/** Score tiers. Calibrated against the engine's actual output distribution —
 *  see docs/JOURNEY_MODE.md § Calibration for the measured p50/p95/max per
 *  archetype that these were set from. ELITE must stay reachable by all five. */
/** Anchored to percentiles of the measured sweep, not to round numbers:
 *  ELITE ≈ p97, GREAT ≈ p85, SOLID ≈ p25, MODEST ≈ p2. Anchoring this way is
 *  what keeps every tier populated when engine numbers move — the first draft
 *  used round thresholds, and after the bond/fame decay pass compressed scores
 *  ELITE (850) landed 2 points under collector's own maximum (852), which
 *  silently killed three ELITE verdicts. Percentile anchors would have moved
 *  with the distribution. Re-derive from `docs/JOURNEY_MODE.md § Calibration`. */
export const TIER = {
  ELITE: 800,
  GREAT: 720,
  SOLID: 540,
  MODEST: 400,
  FLOOR: 0,
} as const;

// IMPORTANT: this array is ordered by DESCENDING prestige, and resolveVerdict
// takes the first match. Order is therefore load-bearing — a cross-archetype
// verdict placed after the archetype's lower tiers can never fire, because the
// lower tier matches first. Keep entries grouped by minScore, descending, with
// conditional entries ahead of unconditional ones at the same score.
// NOTE ON bond/fame THRESHOLDS: these are calibrated against the POST-DECAY
// distributions (bond p50 42 / p90 61 / max 89; fame p50 48 / p90 66 / max 100),
// not the 0-100 nominal range. Before decay both stats pinned at 100 in ~62% of
// runs, so any `>= 90` gate was really just "titleless" and swallowed a fifth of
// all outcomes. Re-measure before moving them — see docs/JOURNEY_MODE.md.
export const VERDICTS: Verdict[] = [
  // ---- ELITE (850+) — one per archetype, each with a signature condition ----
  // `titles >= 3 && losses <= wins * 0.6` was written against the pre-v10
  // battle counts. v10's gym/Elite Four/World Cup ladder compressed both curves:
  // titles now top out at 4 (p90 is 1), and the loss:win ratio bottoms out at
  // 0.540 with a p10 of 0.686 — so `<= 0.6` is roughly the top 1% on its own.
  // Together they matched 1 run in 6,000, which is alive only by luck of the
  // seed.
  //
  // The replacement then has to clear a SECOND bar: Aggro's ELITE band is the
  // thinnest of any archetype (p97 766 against a max of 877), so a signature
  // this tier nearly implies leaves APEX PREDATOR — the fallback behind it —
  // with nothing to catch. `titles >= 2 && <= 0.75` was that mistake; three
  // titles and a 3:4 record is a genuinely dominant career and leaves the
  // merely-elite ones to the fallback.
  { id: 'undefeated',        archetype: 'aggro',        minScore: TIER.ELITE, titleKey: 'journey.verdict.undefeated.title',        blurbKey: 'journey.verdict.undefeated.blurb',        requires: s => s.titles >= 3 && s.losses <= s.wins * 0.72 },
  { id: 'immovable',         archetype: 'stall',        minScore: TIER.ELITE, titleKey: 'journey.verdict.immovable.title',         blurbKey: 'journey.verdict.immovable.blurb',         requires: s => s.bond >= 60 },
  // The signature gates have to be HARDER than what the score already implies,
  // or the fallback below can never fire. `catches >= 45` and `shinies >= 4`
  // were both implied by clearing ELITE as that archetype — catches and shinies
  // are the heaviest components of those two archetypes' own weightings — so
  // THE COLLECTOR and ODDS BREAKER were unreachable content. The gates now sit
  // roughly a decile above what the tier itself guarantees.
  { id: 'professors-pride',  archetype: 'collector',    minScore: TIER.ELITE, titleKey: 'journey.verdict.professors-pride.title',  blurbKey: 'journey.verdict.professors-pride.blurb',  requires: s => s.catches >= 55 },
  { id: 'chromatic-legend',  archetype: 'shiny-hunter', minScore: TIER.ELITE, titleKey: 'journey.verdict.chromatic-legend.title',  blurbKey: 'journey.verdict.chromatic-legend.blurb',  requires: s => s.shinies >= 5 },
  { id: 'complete-trainer',  archetype: 'balance',      minScore: TIER.ELITE, titleKey: 'journey.verdict.complete-trainer.title',  blurbKey: 'journey.verdict.complete-trainer.blurb' },
  // Fallbacks at the same tier, so clearing 850 without the signature
  // condition still reads as elite rather than dropping a whole tier.
  { id: 'apex-predator',     archetype: 'aggro',        minScore: TIER.ELITE, titleKey: 'journey.verdict.apex-predator.title',     blurbKey: 'journey.verdict.apex-predator.blurb' },
  { id: 'attrition-master',  archetype: 'stall',        minScore: TIER.ELITE, titleKey: 'journey.verdict.attrition-master.title',  blurbKey: 'journey.verdict.attrition-master.blurb' },
  { id: 'the-collector',     archetype: 'collector',    minScore: TIER.ELITE, titleKey: 'journey.verdict.the-collector.title',     blurbKey: 'journey.verdict.the-collector.blurb' },
  { id: 'odds-breaker',      archetype: 'shiny-hunter', minScore: TIER.ELITE, titleKey: 'journey.verdict.odds-breaker.title',      blurbKey: 'journey.verdict.odds-breaker.blurb' },

  // ---- "so close" — must outrank the GREAT tier to be reachable at all ----
  // Two measured corrections live in this one entry. It began at minScore 620
  // with `peakRank <= 4` and fired for 19.1% of ALL runs — a consolation label
  // was the most common outcome in the table, because roughly half of careers
  // end titleless and a top-4 peak is easy across ~8 tournaments. Tightening
  // to <= 2 alone only moved it to 16.4%: the real problem was the THRESHOLD,
  // not the predicate. At 620 it outranked every SOLID entry across the fattest
  // part of the score distribution (p50 is ~660), so it stole the archetype's
  // own identity from ordinary careers.
  //
  // At GREAT it means what the name promises: you were good enough to win and
  // never did. Sits above the GREAT block because a first-match table only
  // reaches it if nothing earlier claims the run.
  { id: 'nearly-man',        archetype: 'any', minScore: TIER.GREAT, titleKey: 'journey.verdict.nearly-man.title',        blurbKey: 'journey.verdict.nearly-man.blurb',        requires: s => s.titles === 0 && s.peakRank <= 2 },

  // ---- GREAT (760+) ----
  { id: 'ranked-terror',     archetype: 'aggro',        minScore: TIER.GREAT, titleKey: 'journey.verdict.ranked-terror.title',     blurbKey: 'journey.verdict.ranked-terror.blurb' },
  { id: 'wall-of-record',    archetype: 'stall',        minScore: TIER.GREAT, titleKey: 'journey.verdict.wall-of-record.title',    blurbKey: 'journey.verdict.wall-of-record.blurb' },
  { id: 'all-format-threat', archetype: 'balance',      minScore: TIER.GREAT, titleKey: 'journey.verdict.all-format-threat.title', blurbKey: 'journey.verdict.all-format-threat.blurb' },
  { id: 'archivist',         archetype: 'collector',    minScore: TIER.GREAT, titleKey: 'journey.verdict.archivist.title',         blurbKey: 'journey.verdict.archivist.blurb' },
  { id: 'rare-light',        archetype: 'shiny-hunter', minScore: TIER.GREAT, titleKey: 'journey.verdict.rare-light.title',        blurbKey: 'journey.verdict.rare-light.blurb' },

  // ---- Cross-archetype colour, above the SOLID tier so it can actually fire ----
  // `fame >= 80 && titles === 0` was effectively just "titleless": fame nearly
  // saturates in any decent career, and ~half of careers end without a title.
  // Once NEARLY-MAN moved up to GREAT, this inherited its problem and became
  // 21.0% of all outcomes.
  //
  // The fix is semantic, not numeric. A cult hero is loved and never came
  // close — so a weak peak is part of the definition, not a tuning knob, and it
  // makes this mutually exclusive with NEARLY-MAN (which needs peak <= 2)
  // instead of the two fighting over the same careers.
  //
  // The fame gate then has to be read off the post-decay curve. `>= 65` sat at
  // the p90 of fame, and high fame correlates with a strong peak — so requiring
  // both top-decile fame AND a peak outside the top four made this
  // unreachable: it fired for 0 of 6,000 sweep runs. `>= 55` is ~p70, which is
  // "well known" rather than "famous", and that is what the verdict means.
  { id: 'cult-hero',         archetype: 'any', minScore: 600, titleKey: 'journey.verdict.cult-hero.title',         blurbKey: 'journey.verdict.cult-hero.blurb',         requires: s => s.fame >= 55 && s.titles === 0 && s.peakRank > 3 },

  // ---- SOLID (560+) ----
  { id: 'one-region-legend', archetype: 'any',          minScore: TIER.SOLID, titleKey: 'journey.verdict.one-region-legend.title', blurbKey: 'journey.verdict.one-region-legend.blurb', requires: s => s.bond >= 65 && s.titles === 0 },
  { id: 'glass-cannon',      archetype: 'aggro',        minScore: TIER.SOLID, titleKey: 'journey.verdict.glass-cannon.title',      blurbKey: 'journey.verdict.glass-cannon.blurb' },
  { id: 'long-game',         archetype: 'stall',        minScore: TIER.SOLID, titleKey: 'journey.verdict.long-game.title',         blurbKey: 'journey.verdict.long-game.blurb' },
  { id: 'steady-hand',       archetype: 'balance',      minScore: TIER.SOLID, titleKey: 'journey.verdict.steady-hand.title',       blurbKey: 'journey.verdict.steady-hand.blurb' },
  { id: 'field-researcher',  archetype: 'collector',    minScore: TIER.SOLID, titleKey: 'journey.verdict.field-researcher.title',  blurbKey: 'journey.verdict.field-researcher.blurb' },
  { id: 'sparkle-chaser',    archetype: 'shiny-hunter', minScore: TIER.SOLID, titleKey: 'journey.verdict.sparkle-chaser.title',    blurbKey: 'journey.verdict.sparkle-chaser.blurb' },

  // ---- MODEST (280+) ----
  { id: 'brawler',           archetype: 'aggro',        minScore: TIER.MODEST, titleKey: 'journey.verdict.brawler.title',        blurbKey: 'journey.verdict.brawler.blurb' },
  { id: 'patient-one',       archetype: 'stall',        minScore: TIER.MODEST, titleKey: 'journey.verdict.patient-one.title',    blurbKey: 'journey.verdict.patient-one.blurb' },
  { id: 'journeyman',        archetype: 'balance',      minScore: TIER.MODEST, titleKey: 'journey.verdict.journeyman.title',     blurbKey: 'journey.verdict.journeyman.blurb' },
  { id: 'dex-filler',        archetype: 'collector',    minScore: TIER.MODEST, titleKey: 'journey.verdict.dex-filler.title',     blurbKey: 'journey.verdict.dex-filler.blurb' },
  { id: 'patient-hunter',    archetype: 'shiny-hunter', minScore: TIER.MODEST, titleKey: 'journey.verdict.patient-hunter.title', blurbKey: 'journey.verdict.patient-hunter.blurb' },

  // ---- FLOOR: universal, unconditional. Guarantees resolveVerdict never
  //      returns undefined, and catches the genuinely rough careers. ----
  { id: 'road-walker',       archetype: 'any', minScore: TIER.FLOOR, titleKey: 'journey.verdict.road-walker.title', blurbKey: 'journey.verdict.road-walker.blurb' },
];

export const VERDICT_BY_ID = new Map(VERDICTS.map(v => [v.id, v]));

/** Region label for a generation number — used by the CULT HERO verdict text. */
export function regionLabelForGen(gen: number): string {
  return GENERATIONS.find(g => g.num === gen)?.label ?? 'the circuit';
}
