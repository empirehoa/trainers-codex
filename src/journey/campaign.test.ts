import { describe, it, expect } from 'vitest';
import {
  CAMPAIGNS, campaignChapterCount, getCampaign, regionAt, regionChapterSpans, regionTour,
} from './campaign';
import { PACES } from './content';
import { MAX_CHAPTERS, MIN_CHAPTERS, chapterCountFor, phaseFor, simulateWithStrategy } from './engine';
import type { Campaign, JourneySetup } from './types';

const setupFor = (over: Partial<JourneySetup> = {}): JourneySetup => ({
  seed: 8843, trainerName: 'Vesper', regionId: 'kanto', starterId: 4,
  archetype: 'balance', pace: 'normal', source: 'fresh', ...over,
});

const SEEDS = [1, 7, 42, 8843, 12345, 99999];
const run = (s: JourneySetup) => simulateWithStrategy(s, d => d.card.options[0].id, 400);

describe('campaign length is single-sourced', () => {
  // These were two independent implementations of the same idea that disagreed:
  // a short run drew its length from the `career-length` stream while its
  // region span came from `campaign-length`, so a 13-chapter career reported a
  // 20-chapter region. Anything measuring position within a region against the
  // career total then resolved to the wrong phase.
  it('campaignChapterCount equals the sum of the region spans', () => {
    for (const c of CAMPAIGNS) {
      for (const seed of SEEDS) {
        const s = setupFor({ seed, campaign: c.id });
        const spans = regionChapterSpans(s);
        expect(campaignChapterCount(s), `${c.id}/${seed}`)
          .toBe(spans.reduce((a, b) => a + b, 0));
      }
    }
  });

  it('the engine agrees with the spans for every campaign', () => {
    for (const c of CAMPAIGNS) {
      for (const seed of SEEDS) {
        const s = setupFor({ seed, campaign: c.id });
        const total = regionChapterSpans(s).reduce((a, b) => a + b, 0);
        expect(chapterCountFor(s), `${c.id}/${seed}`).toBe(total);
      }
    }
  });

  it("a short campaign's single span is its career length, on the old stream", () => {
    // This is the replay contract: every `?seed=` link shared for a short run
    // must still resolve to the same number of chapters.
    for (const seed of SEEDS) {
      const s = setupFor({ seed });
      const spans = regionChapterSpans(s);
      expect(spans).toHaveLength(1);
      expect(spans[0]).toBeGreaterThanOrEqual(MIN_CHAPTERS);
      expect(spans[0]).toBeLessThanOrEqual(MAX_CHAPTERS);
      expect(spans[0]).toBe(chapterCountFor(s));
      // Omitting `campaign` and passing 'short' must be the same run.
      expect(chapterCountFor(setupFor({ seed, campaign: 'short' }))).toBe(spans[0]);
    }
  });

  it('the short bounds here match the engine constants they mirror', () => {
    // campaign.ts cannot import engine.ts (the dependency runs the other way),
    // so the bounds are duplicated. This is the guard on that duplication.
    const s = setupFor({ seed: 1 });
    for (let seed = 1; seed <= 200; seed++) {
      const n = regionChapterSpans(setupFor({ seed })) [0];
      expect(n).toBeGreaterThanOrEqual(MIN_CHAPTERS);
      expect(n).toBeLessThanOrEqual(MAX_CHAPTERS);
    }
    expect(regionTour(s)).toHaveLength(1);
  });
});

describe('phases are region-local', () => {
  // Career-wide phases put the gym circuit (first 26%) and the Elite Four (the
  // next 16%) entirely inside region one. A nine-region saga therefore ran
  // eight regions with no gyms, no badges and no champion.
  it('gives every region on a tour its own gym circuit', () => {
    for (const c of CAMPAIGNS) {
      const spec = getCampaign(c.id);
      const s = setupFor({ campaign: c.id });
      const spans = regionChapterSpans(s);
      for (let i = 0; i < spans.length; i++) {
        const isFinal = i === spans.length - 1;
        const phases = Array.from({ length: spans[i] }, (_, k) => phaseFor(k, spans[i], isFinal));
        expect(phases, `${c.id} region ${i + 1}/${spec.regions}`).toContain('gym-circuit');
        expect(phases, `${c.id} region ${i + 1}`).toContain('elite-four');
      }
    }
  });

  it('keeps retirement to the final region only', () => {
    const spans = regionChapterSpans(setupFor({ campaign: 'saga' }));
    for (let i = 0; i < spans.length - 1; i++) {
      const phases = Array.from({ length: spans[i] }, (_, k) => phaseFor(k, spans[i], false));
      expect(phases, `region ${i + 1} should not retire`).not.toContain('retirement');
    }
    const last = spans.length - 1;
    const finalPhases = Array.from({ length: spans[last] }, (_, k) => phaseFor(k, spans[last], true));
    expect(finalPhases).toContain('retirement');
  });

  it('maps every chapter of every campaign to a region', () => {
    for (const c of CAMPAIGNS) {
      const s = setupFor({ campaign: c.id });
      const total = campaignChapterCount(s);
      for (let i = 0; i < total; i++) {
        const here = regionAt(s, i);
        expect(here.tourIndex, `${c.id} ch${i}`).toBeGreaterThanOrEqual(0);
        expect(here.tourIndex, `${c.id} ch${i}`).toBeLessThan(getCampaign(c.id).regions);
        expect(here.localIndex).toBeLessThan(here.localCount);
      }
    }
  });
});

describe('a multi-region campaign actually delivers more career', () => {
  // The headline symptom: badges capped at one region's worth no matter how
  // long the campaign, because every tour stop resolved back to region one.
  it('earns badges in proportion to the number of regions', () => {
    const avg = (campaign: Campaign) => {
      let total = 0;
      for (const seed of SEEDS) total += run(setupFor({ seed, campaign })).stats.badges;
      return total / SEEDS.length;
    };
    const short = avg('short');
    const season = avg('season');
    const saga = avg('saga');
    expect(short).toBeGreaterThan(0);
    // 3 regions and 9 regions must beat 1 region by a clear margin, not a
    // rounding error. Before the fix all three sat at the 8-badge ceiling.
    expect(season, `season ${season} vs short ${short}`).toBeGreaterThan(short * 1.8);
    expect(saga, `saga ${saga} vs season ${season}`).toBeGreaterThan(season * 1.8);
  });

  it('visits every region on the tour rather than replaying the first', () => {
    for (const seed of SEEDS) {
      const s = setupFor({ seed, campaign: 'saga' });
      const tour = regionTour(s);
      const total = campaignChapterCount(s);
      const seen = new Set<string>();
      for (let i = 0; i < total; i++) seen.add(regionAt(s, i).regionId);
      expect(seen.size, `seed ${seed}`).toBe(tour.length);
    }
  });

  it('terminates for every campaign, seed and pace', () => {
    for (const c of CAMPAIGNS) {
      for (const seed of SEEDS) {
        for (const pace of PACES.map(p => p.id)) {
          const r = run(setupFor({ seed, campaign: c.id, pace }));
          const label = `${c.id}/${seed}/${pace}`;
          expect(r.chapters.length, label).toBe(r.chapterCount);
          // Retirement closes the career exactly once, in the last region.
          expect(r.chapters[r.chapters.length - 1].phase, label).toBe('retirement');
          const retirements = r.chapters.filter(ch => ch.phase === 'retirement').length;
          expect(retirements, label).toBe(1);
        }
      }
    }
  });
});
