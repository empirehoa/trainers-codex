// The region atlas.
//
// A map fails quietly: nothing throws when two towns land on top of each other
// or a node drifts off the canvas, it just looks wrong. So the geometry
// invariants are asserted here rather than left to the eye.

import { describe, expect, it } from 'vitest';
import { atlasPolyline, atlasProgress, regionAtlas } from './atlas';
import { JOURNEY_REGIONS } from './content';
import { BADGES_PER_REGION } from './types';

const REGION_IDS = JOURNEY_REGIONS.map(r => r.id);

describe('atlas generation', () => {
  it('is deterministic — the same seed and region give an identical map', () => {
    // This is what makes a map part of the run rather than scenery: a `?seed=`
    // link has to reproduce the roads too.
    for (const regionId of REGION_IDS) {
      const a = regionAtlas(8843, regionId);
      const b = regionAtlas(8843, regionId);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('different seeds give different maps', () => {
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      shapes.add(JSON.stringify(regionAtlas(seed, 'kanto').nodes.map(n => [n.name, n.x.toFixed(3)])));
    }
    // A generator that collapsed to one layout would pass every other test here.
    expect(shapes.size, 'seeds produced identical maps').toBeGreaterThan(30);
  });

  it('has exactly one gym per badge the region awards', () => {
    // The map and the badge track must never disagree about how many gyms a
    // region has — that mismatch is the class of bug that made `full-circuit`
    // unreachable in the first place.
    for (const regionId of REGION_IDS) {
      const gyms = regionAtlas(1234, regionId).nodes.filter(n => n.kind === 'gym');
      expect(gyms.length, `${regionId} has ${gyms.length} gyms`).toBe(BADGES_PER_REGION);
      expect(gyms.map(g => g.badgeIndex))
        .toEqual(Array.from({ length: BADGES_PER_REGION }, (_, i) => i + 1));
    }
  });

  it('starts at a start node and ends at the league', () => {
    for (const regionId of REGION_IDS) {
      const { nodes } = regionAtlas(77, regionId);
      expect(nodes[0].kind).toBe('start');
      expect(nodes[nodes.length - 1].kind).toBe('league');
      // Exactly one of each — two leagues would render two endpoints.
      expect(nodes.filter(n => n.kind === 'start').length).toBe(1);
      expect(nodes.filter(n => n.kind === 'league').length).toBe(1);
    }
  });

  it('every node id is unique and namespaced to its region', () => {
    for (const regionId of REGION_IDS) {
      const ids = regionAtlas(5, regionId).nodes.map(n => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id.startsWith(`${regionId}-`)).toBe(true);
    }
  });

  it('names are non-empty and never repeat inside one region', () => {
    for (const regionId of REGION_IDS) {
      const names = regionAtlas(999, regionId).nodes.map(n => n.name);
      for (const n of names) expect(n.trim().length).toBeGreaterThan(2);
      // A duplicated place name in one region reads as a bug to the player.
      expect(new Set(names).size, `${regionId} repeats a place name`).toBe(names.length);
    }
  });

  it('the league is named for the region it belongs to', () => {
    for (const region of JOURNEY_REGIONS) {
      const { nodes } = regionAtlas(42, region.id);
      expect(nodes[nodes.length - 1].name).toContain(region.label);
    }
  });
});

describe('atlas geometry', () => {
  it('every node stays inside the canvas', () => {
    // Off-canvas nodes are clipped by the viewBox and simply vanish.
    for (let seed = 1; seed <= 60; seed++) {
      for (const regionId of REGION_IDS) {
        for (const n of regionAtlas(seed, regionId).nodes) {
          expect(n.x, `${n.id} x=${n.x}`).toBeGreaterThanOrEqual(0);
          expect(n.x, `${n.id} x=${n.x}`).toBeLessThanOrEqual(1);
          expect(n.y, `${n.id} y=${n.y}`).toBeGreaterThanOrEqual(0);
          expect(n.y, `${n.id} y=${n.y}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('nodes do not pile up on each other', () => {
    // Overlap is the failure that makes a generated map look broken. The
    // separation pass is bounded, so this asserts the outcome, not the loop.
    let worst = Infinity;
    let worstAt = '';
    for (let seed = 1; seed <= 60; seed++) {
      const { nodes } = regionAtlas(seed, 'kanto');
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (d < worst) { worst = d; worstAt = `seed ${seed}: ${nodes[i].id} vs ${nodes[j].id}`; }
        }
      }
    }
    // MIN_SEP is 0.07 and relaxation converges, so this asserts close to the
    // real guarantee rather than a threshold loose enough to pass a broken pass.
    expect(worst, `closest pair ${worst.toFixed(4)} at ${worstAt}`).toBeGreaterThan(0.055);
  });

  it('spaces nodes evenly along the road', () => {
    // The bug this catches shipped and was only visible in a screenshot: with
    // `t` uniform along a diagonal rather than along the CURVE, spacing
    // collapsed wherever the road bent — six nodes crowded one corner while the
    // opposite corner sat empty. Arc-length placement is what fixes it, and
    // this is the assertion that proves it rather than the eye.
    for (let seed = 1; seed <= 40; seed++) {
      const { nodes } = regionAtlas(seed, 'kanto');
      const gaps: number[] = [];
      for (let i = 1; i < nodes.length; i++) {
        gaps.push(Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y));
      }
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const min = Math.min(...gaps);
      const max = Math.max(...gaps);
      // No gap may be less than half or more than double the mean.
      expect(min, `seed ${seed}: tightest gap ${min.toFixed(3)} vs mean ${mean.toFixed(3)}`)
        .toBeGreaterThan(mean * 0.5);
      expect(max, `seed ${seed}: widest gap ${max.toFixed(3)} vs mean ${mean.toFixed(3)}`)
        .toBeLessThan(mean * 2);
    }
  });

  it('the road never doubles back on itself horizontally', () => {
    // x is monotonic in the spine parameter, so "further right" always means
    // "further along". A road that backtracked would make the walked/unwalked
    // split ambiguous to read.
    for (let seed = 1; seed <= 40; seed++) {
      const { nodes } = regionAtlas(seed, 'unova');
      for (let i = 1; i < nodes.length; i++) {
        expect(nodes[i].x, `seed ${seed}: node ${i} sits left of node ${i - 1}`)
          .toBeGreaterThanOrEqual(nodes[i - 1].x - 1e-9);
      }
    }
  });

  it('the road runs away from home rather than doubling back', () => {
    // Progress must read as progress: a later node should generally sit further
    // from the start than an earlier one, or "further along" stops meaning
    // anything visually.
    for (let seed = 1; seed <= 30; seed++) {
      const { nodes } = regionAtlas(seed, 'johto');
      const start = nodes[0];
      const distFromStart = nodes.map(n => Math.hypot(n.x - start.x, n.y - start.y));
      const first = distFromStart.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
      const last = distFromStart.slice(-4).reduce((a, b) => a + b, 0) / 4;
      expect(last, `seed ${seed}: the end of the road is not further than the start`)
        .toBeGreaterThan(first);
    }
  });

  it('the polyline scales to a viewBox without leaving it', () => {
    const atlas = regionAtlas(8843, 'hoenn');
    const pts = atlasPolyline(atlas, 300, 180);
    expect(pts.length).toBe(atlas.nodes.length);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(300);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(180);
    }
  });
});

describe('atlas progress', () => {
  const atlas = regionAtlas(8843, 'kanto');
  const last = atlas.nodes.length - 1;

  it('starts at the first node and finishes at the league', () => {
    expect(atlasProgress({ atlas, localIndex: 0, localCount: 16, regionBadges: 0 }).currentIndex).toBe(0);
    expect(atlasProgress({ atlas, localIndex: 15, localCount: 16, regionBadges: 8 }).currentIndex).toBe(last);
  });

  it('never runs backwards as chapters advance', () => {
    let prev = -1;
    for (let i = 0; i < 16; i++) {
      const { currentIndex } = atlasProgress({ atlas, localIndex: i, localCount: 16, regionBadges: 0 });
      expect(currentIndex).toBeGreaterThanOrEqual(prev);
      prev = currentIndex;
    }
  });

  it('never leaves the map, even on nonsense input', () => {
    // A stale share link or a hand-edited action list must not index off the end.
    for (const [localIndex, localCount] of [[-5, 16], [99, 16], [0, 0], [3, 1], [0, -2]]) {
      const p = atlasProgress({ atlas, localIndex, localCount, regionBadges: 0 });
      expect(p.currentIndex).toBeGreaterThanOrEqual(0);
      expect(p.currentIndex).toBeLessThanOrEqual(last);
    }
  });

  it('clears gyms from the badge count, so the map agrees with the badge track', () => {
    for (let badges = 0; badges <= 8; badges++) {
      const { clearedGyms } = atlasProgress({ atlas, localIndex: 8, localCount: 16, regionBadges: badges });
      expect(clearedGyms.size, `${badges} badges cleared ${clearedGyms.size} gyms`).toBe(badges);
      // And they clear in order — gym 3 is never lit while gym 2 is dark.
      for (const i of clearedGyms) {
        expect(atlas.nodes[i].badgeIndex!).toBeLessThanOrEqual(badges);
      }
    }
  });

  it('position does not depend on badges — losing a gym still moves you on', () => {
    // A map that froze on a loss would contradict the recap, which at that
    // moment is telling the player there is a rematch next chapter.
    const withBadges = atlasProgress({ atlas, localIndex: 6, localCount: 16, regionBadges: 5 });
    const without = atlasProgress({ atlas, localIndex: 6, localCount: 16, regionBadges: 0 });
    expect(withBadges.currentIndex).toBe(without.currentIndex);
  });
});
