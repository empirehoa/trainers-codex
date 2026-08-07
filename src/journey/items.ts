// Journey Mode items — the "use a tool before a decision" layer.
//
// Items are earned deterministically as the career runs (see engine.ts item
// grants) and spent via a recorded PrepareAction, so the whole thing replays
// byte-identically like every other player input. There is no shop and no
// currency: items are milestone rewards, kept deliberately few so the choice
// of WHEN to spend one stays legible.

export type ItemId = 'soothe-bell' | 'energy-root' | 'rare-candy';

export interface ItemSpec {
  id: ItemId;
  /** i18n key for the item name. */
  nameKey: string;
  /** i18n key for the one-line effect description. */
  descKey: string;
  /** Lucide icon name used by the prepare UI. */
  icon: 'heart' | 'leaf' | 'candy';
}

export const ITEMS: Record<ItemId, ItemSpec> = {
  'soothe-bell': { id: 'soothe-bell', nameKey: 'journey.item.soothe-bell.name', descKey: 'journey.item.soothe-bell.desc', icon: 'heart' },
  'energy-root': { id: 'energy-root', nameKey: 'journey.item.energy-root.name', descKey: 'journey.item.energy-root.desc', icon: 'leaf' },
  'rare-candy':  { id: 'rare-candy',  nameKey: 'journey.item.rare-candy.name',  descKey: 'journey.item.rare-candy.desc',  icon: 'candy' },
};

export const ITEM_IDS: ItemId[] = ['soothe-bell', 'energy-root', 'rare-candy'];

export function isItemId(v: unknown): v is ItemId {
  return typeof v === 'string' && (ITEM_IDS as string[]).includes(v);
}

/** Stat effects of consuming an item. Rare Candy carries no stat delta — its
 *  effect is enabling an off-gate evolution, handled in the engine. */
export const ITEM_STAT_EFFECT: Record<ItemId, { bond?: number; fatigue?: number }> = {
  'soothe-bell': { bond: 12 },
  'energy-root': { fatigue: -20 },
  'rare-candy':  {},
};

/** An owned inventory is a count per item id. */
export type Inventory = Record<ItemId, number>;

export function emptyInventory(): Inventory {
  return { 'soothe-bell': 0, 'energy-root': 0, 'rare-candy': 0 };
}

export function inventoryCount(inv: Inventory): number {
  return ITEM_IDS.reduce((n, id) => n + (inv[id] ?? 0), 0);
}
