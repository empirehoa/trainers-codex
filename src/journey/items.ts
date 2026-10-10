// Journey Mode items — the "use a tool before a decision" layer.
//
// Items are earned deterministically as the career runs and spent via a
// recorded PrepareAction, so the whole thing replays byte-identically like
// every other player input. There is no shop and no currency: items are
// milestone rewards, kept few so the choice of WHEN to spend one stays legible.
//
// v9: Rare Candy now grants a LEVEL (matching the games) rather than bypassing
// the evolution gate, and evolution stones / link cords satisfy the item and
// trade evolution conditions that levels alone can't.

export type ItemId =
  | 'soothe-bell'
  | 'energy-root'
  | 'rare-candy'
  | 'evo-stone'
  | 'link-cord'
  | 'exp-share'
  | 'mega-stone';

export interface ItemSpec {
  id: ItemId;
  nameKey: string;
  descKey: string;
  icon: 'heart' | 'leaf' | 'candy' | 'gem' | 'link' | 'share' | 'mega';
  /** True when the player picks WHICH member it applies to. */
  targeted: boolean;
}

export const ITEMS: Record<ItemId, ItemSpec> = {
  'soothe-bell': { id: 'soothe-bell', nameKey: 'journey.item.soothe-bell.name', descKey: 'journey.item.soothe-bell.desc', icon: 'heart', targeted: false },
  'energy-root': { id: 'energy-root', nameKey: 'journey.item.energy-root.name', descKey: 'journey.item.energy-root.desc', icon: 'leaf', targeted: false },
  'rare-candy':  { id: 'rare-candy',  nameKey: 'journey.item.rare-candy.name',  descKey: 'journey.item.rare-candy.desc',  icon: 'candy', targeted: true },
  'evo-stone':   { id: 'evo-stone',   nameKey: 'journey.item.evo-stone.name',   descKey: 'journey.item.evo-stone.desc',   icon: 'gem',   targeted: true },
  'link-cord':   { id: 'link-cord',   nameKey: 'journey.item.link-cord.name',   descKey: 'journey.item.link-cord.desc',   icon: 'link',  targeted: true },
  'exp-share':   { id: 'exp-share',   nameKey: 'journey.item.exp-share.name',   descKey: 'journey.item.exp-share.desc',   icon: 'share', targeted: false },
  // v15: granted once per career at the fourth badge (engine.ts), never by the
  // per-decision item roll — see mega.ts for why that keeps replays stable.
  'mega-stone':  { id: 'mega-stone',  nameKey: 'journey.item.mega-stone.name',  descKey: 'journey.item.mega-stone.desc',  icon: 'mega',  targeted: true },
};

export const ITEM_IDS: ItemId[] = [
  'soothe-bell', 'energy-root', 'rare-candy', 'evo-stone', 'link-cord', 'exp-share', 'mega-stone',
];

export function isItemId(v: unknown): v is ItemId {
  return typeof v === 'string' && (ITEM_IDS as string[]).includes(v);
}

/** Career-stat effects of consuming an item (party effects handled in engine). */
export const ITEM_STAT_EFFECT: Partial<Record<ItemId, { bond?: number; fatigue?: number }>> = {
  'soothe-bell': { bond: 14 },
  'energy-root': { fatigue: -20 },
};

/** Levels granted to the targeted member. */
export const ITEM_LEVEL_GRANT: Partial<Record<ItemId, number>> = {
  'rare-candy': 1,
};

/**
 * Flat XP granted to the WHOLE party.
 *
 * Scaled with XP_RATE in levels.ts. At 900 against a ~33k career this was 2.7%
 * of a run's total and effectively did nothing; 4,000 is worth a couple of
 * levels mid-run, which is what a one-shot item should feel like.
 */
export const ITEM_PARTY_XP: Partial<Record<ItemId, number>> = {
  'exp-share': 4000,
};

/** Items that unlock a non-level evolution condition. */
export const STONE_ITEM: ItemId = 'evo-stone';
export const CORD_ITEM: ItemId = 'link-cord';

export type Inventory = Record<ItemId, number>;

export function emptyInventory(): Inventory {
  return {
    'soothe-bell': 0, 'energy-root': 0, 'rare-candy': 0,
    'evo-stone': 0, 'link-cord': 0, 'exp-share': 0, 'mega-stone': 0,
  };
}

export function inventoryCount(inv: Inventory): number {
  return ITEM_IDS.reduce((n, id) => n + (inv[id] ?? 0), 0);
}
