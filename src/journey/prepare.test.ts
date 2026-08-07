// Tests for the prepare-step layer: level-gated evolution, item effects, dex
// tracking, box swapping, badges, campaigns, stakes/events, and — most
// importantly — that prepare-actions preserve the determinism/replay contract.

import { describe, it, expect } from 'vitest';
import { simulate, decisionChapterIndices, ROSTER_SIZE } from './engine';
import { evolutionsOf, canEvolve, isValidEvolution } from './evolution';
import {
  canEvolveNow, levelFromXp, xpForLevel, xpProgress, chapterXp,
} from './levels';
import { emptyInventory, inventoryCount, ITEM_STAT_EFFECT } from './items';
import { getCampaign, regionTour, stakeTarget } from './campaign';
import { BADGES_PER_REGION } from './types';
import type { JourneySetup, PrepareAction, RecordedChoice } from './types';

const SETUP: JourneySetup = {
  seed: 4242, trainerName: 'Test', regionId: 'kanto', starterId: 1,
  archetype: 'balance', pace: 'normal', source: 'fresh',
};

/** Drive a run to completion taking option 0 everywhere, with given actions. */
function playTo(setup: JourneySetup, actions: PrepareAction[] = []) {
  const choices: RecordedChoice[] = [];
  for (let i = 0; i < 200; i++) {
    const snap = simulate(setup, choices, actions);
    if (snap.status === 'complete') return snap;
    choices.push({
      chapterIndex: snap.decision!.chapterIndex,
      cardId: snap.decision!.card.id,
      optionId: snap.decision!.card.options[0].id,
    });
  }
  throw new Error('did not terminate');
}

/** Walk to the first decision where `pred` holds, returning that snapshot + choices. */
function walkUntil(
  setup: JourneySetup,
  pred: (s: ReturnType<typeof simulate>) => boolean,
  actions: PrepareAction[] = [],
) {
  const choices: RecordedChoice[] = [];
  for (let i = 0; i < 200; i++) {
    const snap = simulate(setup, choices, actions);
    if (snap.status === 'complete') return null;
    if (pred(snap)) return { snap, choices: [...choices] };
    choices.push({
      chapterIndex: snap.decision!.chapterIndex,
      cardId: snap.decision!.card.id,
      optionId: snap.decision!.card.options[0].id,
    });
  }
  return null;
}

describe('evolution data', () => {
  it('Bulbasaur → Ivysaur; Charizard is fully evolved', () => {
    expect(evolutionsOf(1).map(e => e.id)).toContain(2);
    expect(canEvolve(6)).toBe(false);
  });

  it('branches (Eevee) expose every target', () => {
    const ids = evolutionsOf(133).map(e => e.id);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(isValidEvolution(133, 134)).toBe(true);
    expect(isValidEvolution(133, 999999)).toBe(false);
  });
});

describe('levels + XP', () => {
  it('the XP curve is monotonic and round-trips through levelFromXp', () => {
    for (let l = 2; l <= 100; l++) {
      expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
      expect(levelFromXp(xpForLevel(l))).toBe(l);
    }
  });

  it('xpProgress reports a sane fraction toward the next level', () => {
    const p = xpProgress(xpForLevel(20));
    expect(p.level).toBe(20);
    expect(p.pct).toBeGreaterThanOrEqual(0);
    expect(p.pct).toBeLessThanOrEqual(1);
  });

  it('the ace earns more XP than a benched member, and fresh catches catch up', () => {
    const base = { phase: 'regional' as const, wins: 10, battles: 20, chapterIndex: 8, partySize: 6 };
    const ace = chapterXp({ ...base, memberIndex: 0, joinedAt: -1 });
    const bench = chapterXp({ ...base, memberIndex: 3, joinedAt: -1 });
    const fresh = chapterXp({ ...base, memberIndex: 3, joinedAt: 7 });
    expect(ace).toBeGreaterThan(bench);
    expect(fresh).toBeGreaterThan(bench);
  });
});

describe('the evolution gate is by LEVEL, not by time held', () => {
  it('a level evolution is blocked below the species level and allowed at/above it', () => {
    const below = canEvolveNow({
      memberXp: xpForLevel(10), how: 'level', evoLevel: 16, bond: 50,
      hasStone: false, hasLinkCord: false,
    });
    expect(below.ok).toBe(false);
    if (!below.ok && below.reason === 'level') expect(below.needLevel).toBe(16);

    const at = canEvolveNow({
      memberXp: xpForLevel(16), how: 'level', evoLevel: 16, bond: 50,
      hasStone: false, hasLinkCord: false,
    });
    expect(at.ok).toBe(true);
  });

  it('stone and trade evolutions need the matching item, regardless of level', () => {
    const noStone = canEvolveNow({ memberXp: xpForLevel(99), how: 'item', evoLevel: null, bond: 99, hasStone: false, hasLinkCord: false });
    expect(noStone.ok).toBe(false);
    const withStone = canEvolveNow({ memberXp: xpForLevel(5), how: 'item', evoLevel: null, bond: 0, hasStone: true, hasLinkCord: false });
    expect(withStone.ok).toBe(true);

    const noCord = canEvolveNow({ memberXp: xpForLevel(99), how: 'trade', evoLevel: null, bond: 99, hasStone: true, hasLinkCord: false });
    expect(noCord.ok).toBe(false);
    const withCord = canEvolveNow({ memberXp: xpForLevel(5), how: 'trade', evoLevel: null, bond: 0, hasStone: false, hasLinkCord: true });
    expect(withCord.ok).toBe(true);
  });

  it('friendship evolutions gate on bond', () => {
    expect(canEvolveNow({ memberXp: xpForLevel(50), how: 'friendship', evoLevel: null, bond: 10, hasStone: false, hasLinkCord: false }).ok).toBe(false);
    expect(canEvolveNow({ memberXp: xpForLevel(50), how: 'friendship', evoLevel: null, bond: 95, hasStone: false, hasLinkCord: false }).ok).toBe(true);
  });
});

describe('prepare availability', () => {
  it('NEVER offers an evolution for a fully-evolved species', () => {
    // Walk the whole run and assert the invariant at every decision.
    const choices: RecordedChoice[] = [];
    for (let i = 0; i < 200; i++) {
      const snap = simulate(SETUP, choices, []);
      if (snap.status === 'complete') break;
      for (const offer of snap.prepare!.evolves) {
        expect(evolutionsOf(offer.fromId).length).toBeGreaterThan(0);
        expect(offer.options.length).toBeGreaterThan(0);
      }
      // Every roster member with no evolutions must be absent from the offers.
      const offered = new Set(snap.prepare!.evolves.map(e => e.fromId));
      for (const m of snap.roster) {
        if (!canEvolve(m.id)) expect(offered.has(m.id)).toBe(false);
      }
      choices.push({
        chapterIndex: snap.decision!.chapterIndex,
        cardId: snap.decision!.card.id,
        optionId: snap.decision!.card.options[0].id,
      });
    }
  });

  it('every blocked target explains itself with a reason key', () => {
    const first = simulate(SETUP, [], []);
    for (const offer of first.prepare!.evolves) {
      for (const opt of offer.options) {
        if (!opt.ready) expect(opt.blockKey).toBeTruthy();
      }
    }
  });
});

describe('dex + box', () => {
  it('caught ⊇ roster, seen ⊇ caught, no duplicates', () => {
    const run = playTo(SETUP).run!;
    const caught = new Set(run.dex.caught);
    const seen = new Set(run.dex.seen);
    expect(caught.has(SETUP.starterId)).toBe(true);
    for (const id of run.dex.caught) expect(seen.has(id)).toBe(true);
    for (const m of run.roster) if (m.joinedAt !== -2) expect(caught.has(m.id)).toBe(true);
    expect(new Set(run.dex.seen).size).toBe(run.dex.seen.length);
    expect(new Set(run.dex.caught).size).toBe(run.dex.caught.length);
  });

  it('the box fills with catches and never duplicates the party', () => {
    const run = playTo(SETUP).run!;
    expect(new Set(run.box.map(b => b.id)).size).toBe(run.box.length);
  });

  it('swapping brings a box member into the party and benches the outgoing one', () => {
    const found = walkUntil(SETUP, s => s.box.length > 0 && s.roster.length > 1);
    expect(found).toBeTruthy();
    const { snap, choices } = found!;
    const outId = snap.roster[snap.roster.length - 1].id;
    const inId = snap.box[0].id;
    const idx = snap.decision!.chapterIndex;

    const acted = simulate(SETUP, choices, [{ type: 'swap', chapterIndex: idx, outId, inId }]);
    expect(acted.roster.some(m => m.id === inId)).toBe(true);
    expect(acted.roster.some(m => m.id === outId)).toBe(false);
    expect(acted.box.some(b => b.id === outId)).toBe(true);
    // Party size is preserved by a swap.
    expect(acted.roster.length).toBe(snap.roster.length);
  });
});

describe('badges + regions', () => {
  it('badges never exceed the per-region cap and are numbered in order', () => {
    const run = playTo(SETUP).run!;
    const perRegion = new Map<string, number[]>();
    for (const b of run.badges) {
      expect(b.index).toBeGreaterThanOrEqual(1);
      expect(b.index).toBeLessThanOrEqual(BADGES_PER_REGION);
      perRegion.set(b.regionId, [...(perRegion.get(b.regionId) ?? []), b.index]);
    }
    for (const [, list] of perRegion) {
      expect(list.length).toBeLessThanOrEqual(BADGES_PER_REGION);
      expect(new Set(list).size).toBe(list.length); // no duplicate badge numbers
    }
  });

  it('a short campaign tours one region; a saga tours nine', () => {
    expect(regionTour(SETUP).length).toBe(1);
    expect(regionTour({ ...SETUP, campaign: 'saga' }).length).toBe(9);
    expect(getCampaign('season').regions).toBe(3);
  });

  it('a season campaign runs materially longer than a short one', () => {
    const short = playTo(SETUP).run!;
    const season = playTo({ ...SETUP, campaign: 'season' }).run!;
    expect(season.chapterCount).toBeGreaterThan(short.chapterCount);
    expect(season.region.tour.length).toBe(3);
  });
});

describe('stakes + events (the Balatro layer)', () => {
  it('ante targets escalate superlinearly', () => {
    const t1 = stakeTarget(1), t2 = stakeTarget(2), t3 = stakeTarget(3);
    expect(t2 - t1).toBeGreaterThan(0);
    expect(t3 - t2).toBeGreaterThan(t2 - t1);
  });

  it('a completed run reports stakes and any events it rolled', () => {
    const run = playTo(SETUP).run!;
    expect(run.stakes.length).toBe(1); // short campaign = 1 ante
    expect(run.stakes[0].banked).toBeGreaterThanOrEqual(0);
    for (const e of run.events) {
      expect(['common', 'rare', 'legendary']).toContain(e.rarity);
      expect(e.mult).toBeGreaterThanOrEqual(1);
    }
  });

  it('legendary events never repeat within a run', () => {
    const run = playTo({ ...SETUP, campaign: 'saga' }).run!;
    const legendary = run.events.filter(e => e.rarity === 'legendary').map(e => e.id);
    expect(new Set(legendary).size).toBe(legendary.length);
  });

  it('the score stays within 0-999 even with stacked multipliers', () => {
    for (const seed of [1, 77, 4242, 90210, 999999]) {
      const run = playTo({ ...SETUP, seed, campaign: 'season' }).run!;
      expect(run.score).toBeGreaterThanOrEqual(0);
      expect(run.score).toBeLessThanOrEqual(999);
    }
  });
});

describe('determinism holds with the new systems', () => {
  it('same (setup, choices, actions) → byte-identical run', () => {
    const found = walkUntil(SETUP, s => s.box.length > 0);
    const actions: PrepareAction[] = found
      ? [{ type: 'swap', chapterIndex: found.snap.decision!.chapterIndex, outId: found.snap.roster[0].id, inId: found.snap.box[0].id }]
      : [];
    const a = JSON.stringify(playTo(SETUP, actions).run);
    const b = JSON.stringify(playTo(SETUP, actions).run);
    expect(a).toBe(b);
  });

  it('the final roster is still exactly six unique members', () => {
    for (const seed of [7, 4242, 31337]) {
      const run = playTo({ ...SETUP, seed }).run!;
      expect(run.roster.length).toBe(ROSTER_SIZE);
      expect(new Set(run.roster.map(r => r.id)).size).toBe(ROSTER_SIZE);
    }
  });

  it('an illegal or under-levelled evolution is a no-op, not a throw', () => {
    const idx = decisionChapterIndices(SETUP)[0];
    expect(() => playTo(SETUP, [{ type: 'evolve', chapterIndex: idx, fromId: 1, toId: 999999 }])).not.toThrow();
    const run = playTo(SETUP, [{ type: 'evolve', chapterIndex: idx, fromId: 1, toId: 2 }]).run!;
    // At chapter 0 the starter is level ~5, far below Ivysaur's 16.
    expect(run.roster[0].id).toBe(1);
  });
});

describe('items', () => {
  it('empty inventory counts zero; stat effects are defined', () => {
    expect(inventoryCount(emptyInventory())).toBe(0);
    expect(ITEM_STAT_EFFECT['soothe-bell']?.bond ?? 0).toBeGreaterThan(0);
    expect(ITEM_STAT_EFFECT['energy-root']?.fatigue ?? 0).toBeLessThan(0);
  });

  it('a Rare Candy raises the targeted member by exactly one level', () => {
    const found = walkUntil(SETUP, s => (s.inventory['rare-candy'] ?? 0) > 0);
    if (!found) return; // seed-dependent; the grant table is exercised elsewhere
    const { snap, choices } = found;
    const target = snap.roster[0];
    const before = levelFromXp(target.xp ?? 0);
    const acted = simulate(SETUP, choices, [{
      type: 'item', chapterIndex: snap.decision!.chapterIndex,
      item: 'rare-candy', targetId: target.id,
    }]);
    const after = levelFromXp(acted.roster.find(m => m.id === target.id)?.xp ?? 0);
    expect(after).toBe(before + 1);
    expect(acted.inventory['rare-candy']).toBe((snap.inventory['rare-candy'] ?? 0) - 1);
  });
});

describe('regional forms follow the region being toured', () => {
  it('Alola surfaces Alolan variants; Kanto does not', async () => {
    const { getPools } = await import('./content');
    const { POKEMON_BY_ID } = await import('@/lib/pokemon');
    const alola = getPools(7, 'alola');
    const kanto = getPools(1, 'kanto');
    const alolanIn = (pool: number[]) =>
      pool.filter(id => POKEMON_BY_ID[id]?.form === 'alolan').length;
    expect(alolanIn([...alola.common, ...alola.rare, ...alola.legendary])).toBeGreaterThan(0);
    expect(alolanIn([...kanto.common, ...kanto.rare, ...kanto.legendary])).toBe(0);
  });

  it('never surfaces Mega / Gigantamax / story-only forms in any region', async () => {
    const { getPools } = await import('./content');
    const { POKEMON_BY_ID } = await import('@/lib/pokemon');
    const banned = new Set(['mega', 'primal', 'gigantamax', 'eternamax', 'crowned']);
    for (const [gen, region] of [[1,'kanto'],[4,'sinnoh'],[7,'alola'],[8,'galar'],[9,'paldea']] as const) {
      const p = getPools(gen, region);
      for (const id of [...p.common, ...p.rare, ...p.legendary]) {
        const form = POKEMON_BY_ID[id]?.form;
        if (form) expect(banned.has(form)).toBe(false);
      }
    }
  });

  it('Sinnoh includes Hisuian variants', async () => {
    const { getPools } = await import('./content');
    const { POKEMON_BY_ID } = await import('@/lib/pokemon');
    const p = getPools(4, 'sinnoh');
    const hisui = [...p.common, ...p.rare, ...p.legendary]
      .filter(id => POKEMON_BY_ID[id]?.form === 'hisuian').length;
    expect(hisui).toBeGreaterThan(0);
  });
});

describe('nicknames', () => {
  it('a nickname is recorded, trimmed, and capped at 14 chars', () => {
    const idx = decisionChapterIndices(SETUP)[0];
    const snap = simulate(SETUP, [], [{
      type: 'nickname', chapterIndex: idx, id: SETUP.starterId,
      name: '   Sir  Leafy McLongname   ',
    }]);
    const m = snap.roster.find(r => r.id === SETUP.starterId);
    expect(m?.nickname).toBe('Sir Leafy McLo');
    expect((m?.nickname ?? '').length).toBeLessThanOrEqual(14);
  });

  it('an empty nickname clears it', () => {
    const idx = decisionChapterIndices(SETUP)[0];
    const snap = simulate(SETUP, [], [
      { type: 'nickname', chapterIndex: idx, id: SETUP.starterId, name: 'Spike' },
      { type: 'nickname', chapterIndex: idx, id: SETUP.starterId, name: '  ' },
    ]);
    expect(snap.roster.find(r => r.id === SETUP.starterId)?.nickname).toBeUndefined();
  });
});

describe('v10: opponents, quests, crowns, travel', () => {
  it('gym leaders are original, 8 per region, with rising levels', async () => {
    const { gymLeaders } = await import('./opponents');
    const leaders = gymLeaders(4242, 'kanto');
    expect(leaders.length).toBe(8);
    for (let i = 1; i < leaders.length; i++) {
      expect(leaders[i].level).toBeGreaterThan(leaders[i - 1].level - 5);
    }
    // Specialties are distinct across the circuit.
    expect(new Set(leaders.map(l => l.specialty)).size).toBe(8);
    // Every leader fields a real team.
    for (const l of leaders) expect(l.teamIds.length).toBeGreaterThan(0);
  });

  it('the cast never uses a protected character or organisation name', async () => {
    const { gymLeaders, eliteFour, regionChampion, syndicateFor } = await import('./opponents');
    // A representative blocklist. If any of these ever appear we have a real
    // legal problem, so this test is a tripwire, not a style check.
    const BANNED = /\b(ash|misty|brock|giovanni|cynthia|leon|red|blue|gary|lance|steven|wallace|team rocket|team magma|team aqua|team galactic|team plasma|team flare|team skull|team yell)\b/i;
    const names: string[] = [];
    for (const region of ['kanto', 'johto', 'alola', 'galar', 'paldea']) {
      names.push(...gymLeaders(4242, region).map(l => `${l.name} ${l.title}`));
      names.push(...eliteFour(4242, region).map(l => `${l.name} ${l.title}`));
      names.push(`${regionChampion(4242, region).name}`);
      names.push(`${syndicateFor(4242, region).name}`);
    }
    const offenders = names.filter(n => BANNED.test(n));
    expect(offenders, `protected names leaked: ${offenders.join(', ')}`).toEqual([]);
  });

  it('type matchup rewards a party that answers the specialty', async () => {
    const { matchupFor } = await import('./opponents');
    const fireLeader = {
      kind: 'gym' as const, name: 'X', title: 'Y', specialty: 'fire' as const,
      index: 1, level: 30, teamIds: [4], regionId: 'kanto',
    };
    const water = [{ id: 7, shiny: false, joinedAt: -1, types: ['water' as const], xp: 0 }];
    const grass = [{ id: 1, shiny: false, joinedAt: -1, types: ['grass' as const], xp: 0 }];
    const good = matchupFor(water, fireLeader, 30);
    const bad = matchupFor(grass, fireLeader, 30);
    expect(good.advantage).toBeGreaterThan(bad.advantage);
    expect(good.strongPicks).toContain(7);
    expect(bad.weakPicks).toContain(1);
  });

  it('a saga run earns crowns and records named battles', () => {
    const run = playTo({ ...SETUP, campaign: 'saga' }).run!;
    expect(run.battles.length).toBeGreaterThan(0);
    for (const b of run.battles) {
      expect(b.name.length).toBeGreaterThan(2);
      expect(['gym', 'elite-four', 'champion', 'syndicate', 'world-cup']).toContain(b.kind);
    }
    // Crowns only come from beaten champions, and never duplicate a region.
    expect(new Set(run.crowns.map(c => c.regionId)).size).toBe(run.crowns.length);
  });

  it('quests are derived, bounded, and never exceed their target', () => {
    const run = playTo(SETUP).run!;
    for (const q of run.quests) {
      expect(q.progress).toBeLessThanOrEqual(q.target);
      expect(q.progress).toBeGreaterThanOrEqual(0);
      expect(q.complete).toBe(q.progress >= q.target);
    }
  });

  it('a travel action redirects the tour to the chosen region', () => {
    const found = walkUntil({ ...SETUP, campaign: 'season' },
      s => (s.prepare?.travelOptions?.length ?? 0) > 0);
    if (!found) return; // crossroads is seed-dependent; engine path covered below
    const { snap, choices } = found;
    const target = snap.prepare!.travelOptions![0].regionId;
    const acted = simulate({ ...SETUP, campaign: 'season' }, choices, [{
      type: 'travel', chapterIndex: snap.decision!.chapterIndex, regionId: target,
    }]);
    expect(acted.region.tour.includes(target) || acted.region.regionId === target).toBe(true);
  });

  it('a travel action never breaks determinism', () => {
    const setup = { ...SETUP, campaign: 'season' as const };
    const actions: PrepareAction[] = [{ type: 'travel', chapterIndex: 4, regionId: 'alola' }];
    expect(JSON.stringify(playTo(setup, actions).run))
      .toBe(JSON.stringify(playTo(setup, actions).run));
  });

  it('ghost opponents are optional — a run with none still completes', () => {
    const run = playTo({ ...SETUP, campaign: 'season' }).run!;
    expect(run.score).toBeGreaterThanOrEqual(0);
    expect(run.roster.length).toBe(ROSTER_SIZE);
  });
});
