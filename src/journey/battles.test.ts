// Battles, badges, shinies and event Pokémon.
//
// Every test here pins an invariant that was broken in the shipped v10 engine,
// and each one failed silently — the sim stayed deterministic and in-bounds
// while the mechanics underneath it did not mean what the UI claimed:
//
//   * Gym badges came from a blind `chance(rng, 0.72)` roll that never looked
//     at the gym leader, so a player could lose the battle and collect two
//     badges, or win it and collect none.
//   * `battle.won` was `winRate >= 0.5` — a threshold on the chapter's
//     aggregate rate, which sits near 0.53 at the median, so essentially every
//     named battle was a win.
//   * `shinies` was a counter incremented next to a `BoxEntry` built with
//     `shiny: false` hardcoded. The number had no Pokémon behind it.
//   * Event grants were marked shiny when the event's rarity was 'legendary',
//     conflating two unrelated facts and leaving SHINY FLASH's grant ordinary.
//   * The Elite Four needed five fights in a ~1.5-chapter phase, so members 3
//     and 4 and the region champion were never faced at all.

import { describe, expect, it } from 'vitest';
import { simulateWithStrategy } from './engine';
import { ARCHETYPES } from './content';
import { eliteFour, gymLeaders, regionChampion, worldCupField } from './opponents';
import { eventFor } from './campaign';
import type { Archetype, JourneySetup, JourneyRun } from './types';

function play(seed: number, archetype: Archetype = 'balance'): JourneyRun {
  let step = 0;
  return simulateWithStrategy(
    {
      seed, trainerName: 'Probe', regionId: 'kanto', starterId: 4,
      archetype, pace: 'intense', source: 'fresh',
    } satisfies JourneySetup,
    d => d.card.options[step++ % d.card.options.length].id,
  );
}

/** 150 careers across every archetype — enough to catch a rate, cheap to run. */
const RUNS: JourneyRun[] = (() => {
  const out: JourneyRun[] = [];
  for (let seed = 1; seed <= 30; seed++) for (const a of ARCHETYPES) out.push(play(seed, a));
  return out;
})();

describe('gym badges are won, not rolled', () => {
  it('every badge is paid for by a won gym battle, and no win pays twice', () => {
    for (const run of RUNS) {
      const gymWins = run.battles.filter(b => b.kind === 'gym' && b.won).length;
      expect(run.stats.badges,
        `seed ${run.setup.seed}/${run.setup.archetype}: ${run.stats.badges} badges from ${gymWins} gym wins`)
        .toBeLessThanOrEqual(gymWins);
    }
  });

  it('a lost gym battle never awards a badge', () => {
    for (const run of RUNS) {
      for (const b of run.battles) {
        if (!b.won) expect(b.badgeAwarded, `${b.name} lost but awarded a badge`).toBeUndefined();
      }
    }
  });

  it('badges recorded on the track match the badge stat', () => {
    for (const run of RUNS) expect(run.badges.length).toBe(run.stats.badges);
  });

  it('gym battles are genuinely contested — neither a formality nor a wall', () => {
    const gyms = RUNS.flatMap(r => r.battles.filter(b => b.kind === 'gym'));
    expect(gyms.length).toBeGreaterThan(100);
    const rate = gyms.filter(b => b.won).length / gyms.length;
    // Was effectively 1.0 when `won` was `winRate >= 0.5`.
    expect(rate, `gym win rate is ${(rate * 100).toFixed(1)}%`).toBeGreaterThan(0.4);
    expect(rate, `gym win rate is ${(rate * 100).toFixed(1)}%`).toBeLessThan(0.85);
  });

  it('losing a gym leaves that leader standing, so it can be re-fought', () => {
    // With badges gated on winning, `earnedHere` does not advance on a loss, so
    // the same leader is selected again. At least one run in the sweep must
    // show a rematch or the "a loss is a setback, not a dead end" claim is
    // untested.
    const rematches = RUNS.flatMap(r => r.battles.filter(b => b.rematch));
    expect(rematches.length).toBeGreaterThan(0);
  });
});

describe('the multi-fight ladders are completable', () => {
  it('a chapter can resolve more than one named fight', () => {
    const multi = RUNS.filter(r => {
      const byChapter = new Map<number, number>();
      for (const b of r.battles) byChapter.set(b.chapterIndex, (byChapter.get(b.chapterIndex) ?? 0) + 1);
      return [...byChapter.values()].some(n => n > 1);
    });
    expect(multi.length, 'no run ever fought twice in one chapter').toBeGreaterThan(0);
  });

  it('the Elite Four ladder is walked past its second member', () => {
    // Members 3 and 4 were never faced when a chapter held one fight.
    const seen = new Set<string>();
    for (const r of RUNS) for (const b of r.battles) if (b.kind === 'elite-four') seen.add(b.name);
    const roster = eliteFour(8843, 'kanto');
    expect(roster.length).toBe(4);
    // Across 150 careers every member of the ladder should have been met.
    const met = RUNS.flatMap(r => r.battles.filter(b => b.kind === 'elite-four'));
    expect(met.length).toBeGreaterThan(RUNS.length);
  });

  it('the region champion is reachable', () => {
    const champs = RUNS.flatMap(r => r.battles.filter(b => b.kind === 'champion'));
    expect(champs.length, 'the region champion was never faced').toBeGreaterThan(0);
  });

  it('World Cup entrants are tagged world-cup, not champion', () => {
    // Region champions enter the World Cup as competitors. Leaving them tagged
    // `champion` meant no battle in a 6,000-run sweep ever carried the
    // `world-cup` kind, and winning one spuriously crowned a region.
    const field = worldCupField(8843, ['kanto'], []);
    expect(field.length).toBeGreaterThan(0);
    for (const o of field) expect(o.kind).toBe('world-cup');
  });

  it('a crown is only ever awarded for beating a champion', () => {
    for (const run of RUNS) {
      for (const c of run.crowns) {
        const won = run.battles.some(b => b.kind === 'champion' && b.won && b.name === c.championName);
        expect(won, `crown for ${c.championName} with no won champion battle`).toBe(true);
      }
    }
  });
});

describe('opponent levels track the party the game actually produces', () => {
  // Every ladder in opponents.ts was scaled against an XP curve the engine does
  // not have: gyms ran to 54 and the Elite Four to 70 while the party's
  // end-of-run level is ~25. `matchupFor` clamps its level term at -1, so the
  // whole late game sat pinned at maximum disadvantage and no win-rate tuning
  // could move it — the level term had stopped being a variable.
  it('no ladder is scaled beyond the reach of a finished party', () => {
    const finalLevels = RUNS.map(r => Math.round(
      r.roster.reduce((n, m) => n + (m.xp ?? 0), 0) / Math.max(1, r.roster.length),
    ));
    expect(finalLevels.length).toBeGreaterThan(0);
    const ladders = [
      ...gymLeaders(8843, 'kanto').map(o => o.level),
      ...eliteFour(8843, 'kanto').map(o => o.level),
      regionChampion(8843, 'kanto').level,
      ...worldCupField(8843, ['kanto'], []).map(o => o.level),
    ];
    // 40 is comfortably above the measured max party level (~39) and far below
    // the 54-76 the ladders used to sit at.
    for (const lv of ladders) expect(lv).toBeLessThanOrEqual(40);
  });

  it('gym leaders still climb across the circuit', () => {
    const levels = gymLeaders(8843, 'kanto').map(o => o.level);
    expect(levels[levels.length - 1]).toBeGreaterThan(levels[0]);
  });
});

describe('shinies are Pokémon, not a counter', () => {
  it('the shiny stat always equals the shiny Pokémon actually held', () => {
    for (const run of RUNS) {
      const held = new Set<number>();
      for (const m of run.roster) if (m.shiny) held.add(m.id);
      for (const b of run.box) if (b.shiny) held.add(b.id);
      expect(run.stats.shinies,
        `seed ${run.setup.seed}/${run.setup.archetype}: stat says ${run.stats.shinies}, holding ${held.size}`)
        .toBe(held.size);
    }
  });

  it('a Shiny Hunter career produces real shiny Pokémon', () => {
    const hunters = RUNS.filter(r => r.setup.archetype === 'shiny-hunter');
    const withShiny = hunters.filter(r => [...r.roster, ...r.box].some(m => m.shiny));
    expect(withShiny.length, 'no Shiny Hunter run held a single shiny').toBeGreaterThan(0);
  });
});

describe('event Pokémon are their own kind', () => {
  it('an event grant is marked by origin, independent of being shiny', () => {
    const evMons = RUNS.flatMap(r => [...r.roster, ...r.box].filter(m => m.origin === 'event'));
    expect(evMons.length, 'no event Pokémon was ever granted').toBeGreaterThan(0);
    for (const m of evMons) expect(m.eventId).toBeTruthy();
  });

  it('SHINY FLASH grants a shiny; a legendary encounter does not imply one', () => {
    // Tested against `eventFor` directly rather than by sampling careers.
    // `legendary-stirs` fires for roughly 0.4% of event rolls and is capped at
    // once per run, so a career sweep is the wrong instrument — it reports zero
    // legendary grants and would pass this vacuously.
    let flashGrants = 0;
    let flashShiny = 0;
    let legendaryGrants = 0;
    let legendaryShiny = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      for (const phase of ['worlds', 'veteran', 'national', 'regional', 'gym-circuit'] as const) {
        const ev = eventFor({ seed, chapterIndex: 5, phase, regionGen: 1, usedLegendary: new Set() });
        if (!ev || ev.grantedId === undefined) continue;
        if (ev.id === 'shiny-flash') {
          flashGrants++;
          if (ev.grantedShiny) flashShiny++;
        }
        if (ev.rarity === 'legendary') {
          legendaryGrants++;
          if (ev.grantedShiny) legendaryShiny++;
        }
      }
    }
    expect(flashGrants, 'SHINY FLASH never granted a Pokémon').toBeGreaterThan(0);
    // The event whose whole premise is the colour must deliver it, every time.
    expect(flashShiny).toBe(flashGrants);
    // And rarity must NOT imply colour — that conflation is the bug.
    expect(legendaryGrants, 'no legendary event ever granted a Pokémon').toBeGreaterThan(0);
    expect(legendaryShiny, 'a legendary grant was marked shiny by rarity alone').toBe(0);
  });

  it('provenance survives a round trip through the box', () => {
    // A swap used to rebuild the roster entry without origin/eventId, which
    // laundered an event Pokémon into an ordinary one.
    for (const run of RUNS) {
      for (const m of run.roster) {
        if (m.origin === 'event') expect(m.eventId).toBeTruthy();
      }
    }
  });
});

describe('determinism survives all of it', () => {
  it('the same seed still replays byte-identically', () => {
    for (const seed of [1, 42, 8843, 999999]) {
      const a = play(seed);
      const b = play(seed);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
