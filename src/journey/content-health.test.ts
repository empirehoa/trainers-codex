// Content-health regression guard.
//
// The engine tests prove Journey Mode is CORRECT. These prove it is still
// ENTERTAINING — a distinct property that correctness tests cannot see.
//
// Every threshold here was set from a measured 6,000-run sweep, and each one
// exists because the un-guarded version of it shipped as a real defect:
//
//   * Flavor repetition. Beats were sampled from the full phase pool every
//     chapter, so 99.7% of careers printed the same sentence twice. Nothing
//     failed; the game just felt small.
//   * Verdict concentration. `NEARLY-MAN` (a consolation verdict) was the most
//     common outcome in the table at 19.1% of runs, because ~half of careers
//     end titleless and a top-4 peak is easy.
//
// If a content or tuning change pushes either back, this fails loudly instead
// of quietly making the game worse.

import { describe, expect, it } from 'vitest';
import { simulateWithStrategy } from './engine';
import { ARCHETYPES, CHAPTER_BEATS, DECISION_CARDS, PACES, VERDICTS } from './content';
import type { Archetype, JourneySetup, JourneyRun, Pace } from './types';

function play(seed: number, archetype: Archetype, pace: Pace, off: number): JourneyRun {
  let step = 0;
  return simulateWithStrategy(
    {
      seed, trainerName: 'Probe', regionId: 'kanto', starterId: 4,
      archetype, pace, source: 'fresh',
    } satisfies JourneySetup,
    d => d.card.options[(step++ + off) % d.card.options.length].id,
  );
}

/** One shared sweep — 200 seeds × 5 archetypes × 3 paces = 3,000 careers. */
const RUNS: JourneyRun[] = (() => {
  const out: JourneyRun[] = [];
  for (let seed = 1; seed <= 200; seed++) {
    for (const a of ARCHETYPES) {
      for (const p of PACES) out.push(play(seed, a, p.id, seed % 3));
    }
  }
  return out;
})();

describe('content health — flavor variety', () => {
  it('a career almost never repeats a flavor line', () => {
    let repeats = 0;
    for (const run of RUNS) {
      const seen = new Set<string>();
      let dup = false;
      for (const ch of run.chapters) {
        for (const b of ch.beatKeys) {
          if (seen.has(b)) dup = true;
          seen.add(b);
        }
      }
      if (dup) repeats++;
    }
    const rate = repeats / RUNS.length;
    // Was 99.7% before the pool expansion + run-level dedup.
    expect(rate, `${(rate * 100).toFixed(1)}% of careers repeat a beat line`).toBeLessThan(0.02);
  });

  it('each phase pool is deep enough to cover its longest run of chapters', () => {
    // A phase spanning k chapters can draw up to 2k beats. If the pool is
    // smaller than that, the dedup has to fall back and repeats reappear.
    for (const [phase, pool] of Object.entries(CHAPTER_BEATS)) {
      const longest = Math.max(
        ...RUNS.map(r => r.chapters.filter(c => c.phase === phase).length),
      );
      expect(pool.length, `${phase}: ${longest} chapters can need ${longest * 2} beats, pool has ${pool.length}`)
        .toBeGreaterThanOrEqual(Math.min(longest * 2, 12));
    }
  });

  it('every flavor line in every pool is actually reachable', () => {
    const used = new Set<string>();
    for (const run of RUNS) for (const ch of run.chapters) for (const b of ch.beatKeys) used.add(b);
    const dead = Object.values(CHAPTER_BEATS).flat()
      .filter(id => !used.has(`journey.beat.${id}`));
    expect(dead, `flavor lines that never appear: ${dead.join(', ')}`).toEqual([]);
  });
});

describe('content health — outcome distribution', () => {
  // Two separate invariants, because they fail for different reasons.
  //
  // An ARCHETYPE verdict can legitimately be common: the sweep is an even split
  // across 5 archetypes, so a tier that captures most of one archetype's runs
  // approaches 20% and that is the system working — the label still says
  // something true about how you played.
  //
  // An `archetype: 'any'` verdict is different. It overrides archetype identity,
  // so a common one means everybody gets the same generic label regardless of
  // how they played. That is the failure this file exists to catch: NEARLY-MAN
  // hit 19.1%, then CULT-HERO 21.0%, then ONE-REGION-LEGEND 28.8%, each in turn
  // swallowing the fat middle of the score distribution.
  it('no verdict at all runs away with the outcome space', () => {
    const counts = new Map<string, number>();
    for (const r of RUNS) counts.set(r.verdict.id, (counts.get(r.verdict.id) ?? 0) + 1);
    const [topId, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = topCount / RUNS.length;
    expect(share, `"${topId}" is ${(share * 100).toFixed(1)}% of all outcomes`).toBeLessThan(0.22);
  });

  it('no cross-archetype verdict overrides archetype identity at scale', () => {
    const anyIds = new Set(VERDICTS.filter(v => v.archetype === 'any').map(v => v.id));
    const counts = new Map<string, number>();
    for (const r of RUNS) {
      if (anyIds.has(r.verdict.id)) counts.set(r.verdict.id, (counts.get(r.verdict.id) ?? 0) + 1);
    }
    for (const [id, c] of counts) {
      const share = c / RUNS.length;
      expect(share, `universal verdict "${id}" is ${(share * 100).toFixed(1)}% of all outcomes`)
        .toBeLessThan(0.10);
    }
  });

  it('a healthy spread of verdicts is reachable', () => {
    const distinct = new Set(RUNS.map(r => r.verdict.id));
    expect(distinct.size).toBeGreaterThanOrEqual(15);
  });

  // A first-match table can strand an entry two ways, and both shipped:
  //
  //   * The TIER threshold drifts above the archetype's own ceiling. After the
  //     bond/fame decay pass, ELITE (850) sat 2 points under Collector's
  //     measured maximum (852), so PROFESSOR'S PRIDE, THE COLLECTOR and
  //     ODDS BREAKER could never fire.
  //   * The signature `requires` is implied by the score that gates it.
  //     `catches >= 45` is a near-certainty for any Collector run good enough
  //     to clear ELITE — catches is that archetype's heaviest component — so
  //     the fallback sitting behind it was unreachable by construction.
  //
  // Neither failed a test. The verdict table just quietly had six entries of
  // dead content in it.
  it('every verdict in the table is actually reachable', () => {
    const seen = new Set(RUNS.map(r => r.verdict.id));
    const dead = VERDICTS.filter(v => !seen.has(v.id))
      .map(v => `${v.id}(${v.archetype}/${v.minScore})`);
    expect(dead, `unreachable verdicts: ${dead.join(', ')}`).toEqual([]);
  });

  // Verdict LABELS are archetype-specific at every tier, so a Stall player and
  // an Aggro player who both land SOLID each get their own archetype's name for
  // it — that part is fair by construction. What is not fair by construction is
  // the NUMBER, which is cross-archetype comparable and printed on the share
  // card. Stall's median once ran 113 points above Aggro's because Stall's
  // heaviest components (`durability` p50 0.64, `longevity` p50 0.80) were
  // near-guaranteed while Aggro's (`titles` p50 0.00) mostly paid nothing.
  //
  // Some spread is correct and wanted: a Shiny Hunter who finds no shinies
  // should score badly, and flattening that would make the archetypes
  // interchangeable. The bound below is a drift guard, not a parity target.
  it('no archetype is a systematically better bet than the others', () => {
    const medians = ARCHETYPES.map(a => {
      const xs = RUNS.filter(r => r.setup.archetype === a).map(r => r.score).sort((x, y) => x - y);
      return [a, xs[Math.floor(xs.length / 2)]] as const;
    });
    const vals = medians.map(([, m]) => m);
    const spread = Math.max(...vals) - Math.min(...vals);
    const detail = medians.map(([a, m]) => `${a}=${m}`).join(' ');
    expect(spread, `median score spread across archetypes is ${spread} (${detail})`)
      .toBeLessThan(140);
  });

  it('every decision card gets shown', () => {
    const shown = new Set<string>();
    for (const r of RUNS) for (const c of r.choices) shown.add(c.cardId);
    const unseen = DECISION_CARDS.filter(c => !shown.has(c.id)).map(c => c.id);
    expect(unseen, `decision cards never shown: ${unseen.join(', ')}`).toEqual([]);
  });
});

describe('content health — pacing', () => {
  it('chapters where nothing memorable happens stay rare', () => {
    let dead = 0, total = 0;
    for (const r of RUNS) for (const ch of r.chapters) {
      total++;
      const notable = (ch.delta.badges ?? 0) > 0 || (ch.delta.catches ?? 0) > 0
        || (ch.delta.shinies ?? 0) > 0 || (ch.delta.titles ?? 0) > 0
        || ch.recruitedId !== undefined || ch.placement !== undefined;
      if (!notable) dead++;
    }
    const rate = dead / total;
    expect(rate, `${(rate * 100).toFixed(1)}% of chapters are filler`).toBeLessThan(0.10);
  });

  it('the roster draws from a wide enough species pool to feel fresh', () => {
    const seen = new Set<number>();
    for (const r of RUNS) for (const m of r.roster) seen.add(m.id);
    expect(seen.size, `only ${seen.size} distinct species ever recruited`).toBeGreaterThan(80);
  });
});
