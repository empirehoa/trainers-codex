import { describe, it, expect } from 'vitest';
import { simulate } from './engine';
import { emptyInventory } from './items';
import {
  MEGA_STONE_BADGE, MEGA_WIN_RATE_BONUS, canMegaEvolve, defaultMegaFor, displayId, megaFormsFor,
} from './mega';
import type { JourneySetup, PrepareAction, RecordedChoice } from './types';

// Mega Evolution (v15). Two contracts are pinned here:
//   1. The Key Stone is a deterministic milestone grant — no dice — so a seed
//      that never spends it replays exactly, choice-independence included.
//   2. Spending it is a recorded item action like any other: the ace becomes
//      Mega-capable (Mega types, Mega sprite, no further evolution), the party
//      wins a little more, and the chapter carries the debut beat.

// Charizard as the starter so the ace has a Mega form from chapter 0.
const SETUP: JourneySetup = {
  seed: 7101, trainerName: 'Mega', regionId: 'kanto', starterId: 6,
  archetype: 'balance', pace: 'normal', source: 'fresh',
};

type Snap = ReturnType<typeof simulate>;
const pick0 = (snap: Snap): RecordedChoice => ({
  chapterIndex: snap.decision!.chapterIndex,
  cardId: snap.decision!.card.id,
  optionId: snap.decision!.card.options[0].id,
});

/** Drive a run to completion taking option 0 everywhere, with given actions. */
function playTo(setup: JourneySetup, actions: PrepareAction[] = []) {
  const choices: RecordedChoice[] = [];
  for (let i = 0; i < 200; i++) {
    const snap = simulate(setup, choices, actions);
    if (snap.status === 'complete') return snap;
    choices.push(pick0(snap));
  }
  throw new Error('did not terminate');
}

/** Walk to the first decision where `pred` holds. */
function walkUntil(setup: JourneySetup, pred: (s: Snap) => boolean, actions: PrepareAction[] = []) {
  const choices: RecordedChoice[] = [];
  for (let i = 0; i < 200; i++) {
    const snap = simulate(setup, choices, actions);
    if (snap.status === 'complete') return null;
    if (pred(snap)) return { snap, choices: [...choices] };
    choices.push(pick0(snap));
  }
  return null;
}

/** A seed (from `from` upward) whose option-0 career reaches the Key Stone. */
function stoneSeed(from: number): { setup: JourneySetup; at: NonNullable<ReturnType<typeof walkUntil>> } {
  for (let seed = from; seed < from + 200; seed++) {
    const setup = { ...SETUP, seed };
    const at = walkUntil(setup, s => (s.inventory['mega-stone'] ?? 0) > 0);
    if (at) return { setup, at };
  }
  throw new Error('no seed reached four badges before a decision — tune the test');
}

describe('mega.ts lookups', () => {
  it('knows the Mega forms of a species in dex order and picks the first', () => {
    expect(megaFormsFor(6).map(p => p.name)).toEqual(['charizard-mega-x', 'charizard-mega-y']);
    expect(defaultMegaFor(6)?.id).toBe(10034);
    expect(megaFormsFor(448).map(p => p.name)).toEqual(['lucario-mega', 'lucario-mega-z']);
    expect(megaFormsFor(25)).toEqual([]);
    expect(defaultMegaFor(10034)).toBeUndefined(); // a Mega has no Mega
  });

  it('canMegaEvolve needs a Mega form and no stone already spent', () => {
    const base = { id: 6, shiny: false, joinedAt: -1, types: ['fire', 'flying'] as const } as never;
    expect(canMegaEvolve(base)).toBe(true);
    expect(canMegaEvolve({ ...(base as object), megaId: 10034 } as never)).toBe(false);
    expect(canMegaEvolve({ ...(base as object), id: 25 } as never)).toBe(false);
    expect(displayId({ id: 6, megaId: 10034 })).toBe(10034);
    expect(displayId({ id: 6 })).toBe(6);
  });

  it('the bag starts without a stone and the constants are the documented ones', () => {
    expect(emptyInventory()['mega-stone']).toBe(0);
    expect(MEGA_STONE_BADGE).toBe(4);
    expect(MEGA_WIN_RATE_BONUS).toBe(0.04);
  });
});

describe('the Key Stone grant', () => {
  const { setup, at } = stoneSeed(7101);

  it('arrives exactly once, on the chapter the fourth badge lands, with its beat', () => {
    expect(at.snap.stats.badges).toBeGreaterThanOrEqual(MEGA_STONE_BADGE);
    expect(at.snap.inventory['mega-stone']).toBe(1);
    const granted = at.snap.chapters.filter(c => c.keyStone);
    expect(granted).toHaveLength(1);
    expect(granted[0].beatKeys).toContain('journey.beat.key-stone');
    expect(granted[0].stats.badges).toBeGreaterThanOrEqual(MEGA_STONE_BADGE);
    // Every chapter before it sat below the threshold.
    for (const c of at.snap.chapters) {
      if (c.index < granted[0].index) expect(c.stats.badges).toBeLessThan(MEGA_STONE_BADGE);
    }
  });

  it('never arrives twice, however long the career', () => {
    const run = playTo({ ...setup, campaign: 'season' });
    expect(run.run!.chapters.filter(c => c.keyStone).length).toBeLessThanOrEqual(1);
    const done = playTo(setup);
    expect(done.run!.chapters.filter(c => c.keyStone)).toHaveLength(1);
    expect(done.inventory['mega-stone']).toBe(1); // unspent, still in the bag
  });

  it('a career that never reaches four badges never gets one', () => {
    // Sweep seeds; any run finishing under the threshold must have no stone.
    let checked = 0;
    for (let seed = 1; seed < 400 && checked < 5; seed++) {
      const done = playTo({ ...SETUP, seed, pace: 'express' });
      if (done.stats.badges >= MEGA_STONE_BADGE) continue;
      checked++;
      expect(done.inventory['mega-stone']).toBe(0);
      expect(done.run!.chapters.some(c => c.keyStone)).toBe(false);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('spending the Key Stone', () => {
  const { setup, at } = stoneSeed(7101);
  const ch = at.snap.decision!.chapterIndex;
  const spend: PrepareAction = { type: 'item', chapterIndex: ch, item: 'mega-stone' };
  const after = simulate(setup, at.choices, [spend]);

  it('makes the ace Mega-capable: Mega id, Mega types, stone consumed', () => {
    const ace = after.roster[0];
    expect(ace.id).toBe(6);
    expect(ace.megaId).toBe(10034);
    expect(ace.types).toEqual(['fire', 'dragon']); // Mega Charizard X
    expect(after.inventory['mega-stone']).toBe(0);
    expect(after.dex.seen).toContain(10034);
  });

  it('a Mega-capable member no longer appears in the evolve offers', () => {
    expect(after.prepare!.evolves.some(e => e.fromId === 6)).toBe(false);
  });

  it('the chapter it debuts in carries the beat and the Mega id, and the party wins more on average', () => {
    const played = playTo(setup, [spend]);
    const debut = played.run!.chapters.find(c => c.megaDebutId !== undefined)!;
    expect(debut).toBeDefined();
    expect(debut.index).toBe(ch);
    expect(debut.megaDebutId).toBe(10034);
    expect(debut.beatKeys).toContain('journey.beat.mega-debut');
    expect(String(debut.vars.mega)).not.toBe('');
    expect(played.run!.roster[0].megaId).toBe(10034);

    // The flat bonus is small by design; measure it across seeds rather than
    // on one career, where rounding can hide it.
    let diff = 0;
    let n = 0;
    for (let seed = 7101; seed < 7101 + 300 && n < 40; seed++) {
      const s = { ...SETUP, seed };
      const found = walkUntil(s, x => (x.inventory['mega-stone'] ?? 0) > 0);
      if (!found) continue;
      const a: PrepareAction = { type: 'item', chapterIndex: found.snap.decision!.chapterIndex, item: 'mega-stone' };
      diff += playTo(s, [a]).stats.wins - playTo(s).stats.wins;
      n++;
    }
    expect(n).toBeGreaterThan(10);
    expect(diff / n).toBeGreaterThan(0);
  });

  it('is a soft no-op on a target that cannot Mega Evolve, and keeps the stone', () => {
    const bogus = simulate(setup, at.choices, [{ ...spend, targetId: 999_999 }]);
    expect(bogus.roster.every(m => m.megaId === undefined)).toBe(true);
    expect(bogus.inventory['mega-stone']).toBe(1);
    // A second stone action after the first is spent does nothing either.
    const twice = simulate(setup, at.choices, [spend, spend]);
    expect(twice.roster[0].megaId).toBe(10034);
    expect(twice.inventory['mega-stone']).toBe(0);
  });

  it('survives a trip through the box', () => {
    const later = walkUntil(setup, s => s.decision!.chapterIndex > ch && s.box.length > 0, [spend]);
    if (!later) return; // this seed boxed nothing after the debut — nothing to test
    const out: PrepareAction = {
      type: 'swap', chapterIndex: later.snap.decision!.chapterIndex, outId: 6, inId: later.snap.box[0].id,
    };
    const swapped = simulate(setup, later.choices, [spend, out]);
    const benched = swapped.box.find(b => b.id === 6);
    expect(benched?.megaId).toBe(10034);
    expect(swapped.roster.some(m => m.id === 6)).toBe(false);
  });

  it('keeps the replay contract: chapters before the action are unchanged and the event sequence is identical', () => {
    const base = playTo(setup);
    const mega = playTo(setup, [spend]);
    for (let i = 0; i < ch; i++) {
      expect(JSON.stringify(mega.run!.chapters[i])).toBe(JSON.stringify(base.run!.chapters[i]));
    }
    expect(mega.run!.events.map(e => e.id)).toEqual(base.run!.events.map(e => e.id));
    expect(mega.run!.chapters.map(c => c.titleKey)).toEqual(base.run!.chapters.map(c => c.titleKey));
    // And the whole thing is deterministic.
    expect(JSON.stringify(playTo(setup, [spend]))).toBe(JSON.stringify(mega));
  });
});
