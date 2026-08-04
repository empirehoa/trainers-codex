// Deep-link parsing.
//
// This is the viral surface: a bad parse either breaks a shared journey or, far
// worse, shows an error screen to someone who just clicked a friend's link. The
// contract is that NOTHING here can produce a hard failure — every rejected
// param degrades to a fresh random run with a one-line note.

import { describe, expect, it } from 'vitest';
import {
  buildDailyLink, buildSeedLink, displayLink, JOURNEY_PATH, parseJourneyLink,
} from './deeplink';
import { dailySeed } from './prng';

const ORIGIN = 'https://trainerscodex.com';

describe('parseJourneyLink — happy paths', () => {
  it('reads a bare seed', () => {
    const r = parseJourneyLink('?seed=8843', '/journey');
    expect(r.seed).toBe(8843);
    expect(r.source).toBe('seed-link');
    expect(r.hadInvalidParams).toBe(false);
    expect(r.isJourneyRoute).toBe(true);
  });

  it('reads seed with pace and archetype', () => {
    const r = parseJourneyLink('?seed=1234&pace=express&archetype=collector');
    expect(r.seed).toBe(1234);
    expect(r.pace).toBe('express');
    expect(r.archetype).toBe('collector');
  });

  it('reads region and a starter that belongs to it', () => {
    const r = parseJourneyLink('?seed=99&region=paldea&starter=909');
    expect(r.regionId).toBe('paldea');
    expect(r.starterId).toBe(909);
  });

  it('reads a daily link', () => {
    const r = parseJourneyLink('?daily=2026-08-26', '/journey');
    expect(r.dailyDate).toBe('2026-08-26');
    expect(r.source).toBe('daily');
    expect(r.seed).toBe(dailySeed('2026-08-26'));
  });

  it('daily wins over a simultaneous seed param', () => {
    const r = parseJourneyLink('?daily=2026-08-26&seed=1');
    expect(r.source).toBe('daily');
    expect(r.seed).toBe(dailySeed('2026-08-26'));
  });

  it('detects the journey route from the path', () => {
    for (const p of ['/journey', '/journey/', 'journey']) {
      expect(parseJourneyLink('', p).isJourneyRoute, p).toBe(true);
    }
    for (const p of ['/', '/index.html', '/journeys', '/not-journey-x']) {
      expect(parseJourneyLink('', p).isJourneyRoute, p).toBe(false);
    }
  });
});

describe('parseJourneyLink — fail soft', () => {
  it('rejects out-of-range and non-numeric seeds without erroring', () => {
    for (const bad of ['0', '-1', '1000000', 'abc', 'NaN', '', 'Infinity', '1e99', '<script>']) {
      const r = parseJourneyLink(`?seed=${encodeURIComponent(bad)}`);
      expect(r.seed, `seed=${bad}`).toBeNull();
      expect(r.source).toBe('fresh');
      // An empty seed param is an absent seed, not a malformed one.
      if (bad !== '') expect(r.hadInvalidParams, `seed=${bad}`).toBe(true);
    }
  });

  it('rejects malformed daily dates without erroring', () => {
    for (const bad of ['2026-02-30', '2026-13-01', 'yesterday', '20260826', '2026-8-4']) {
      const r = parseJourneyLink(`?daily=${encodeURIComponent(bad)}`);
      expect(r.dailyDate, `daily=${bad}`).toBeNull();
      expect(r.seed).toBeNull();
      expect(r.hadInvalidParams).toBe(true);
    }
  });

  it('ignores an unknown pace or archetype but keeps a valid seed', () => {
    const r = parseJourneyLink('?seed=555&pace=turbo&archetype=wizard');
    expect(r.seed).toBe(555);
    expect(r.pace).toBeNull();
    expect(r.archetype).toBeNull();
    // A valid seed with junk decoration is still a playable link.
    expect(r.hadInvalidParams).toBe(false);
  });

  it('ignores a starter that does not belong to the named region', () => {
    // 909 is a Paldea starter; asking for it in Kanto must not be honoured.
    const r = parseJourneyLink('?seed=1&region=kanto&starter=909');
    expect(r.regionId).toBe('kanto');
    expect(r.starterId).toBeNull();
  });

  it('ignores a starter with no region given', () => {
    expect(parseJourneyLink('?seed=1&starter=4').starterId).toBeNull();
  });

  it('ignores an unknown region', () => {
    const r = parseJourneyLink('?seed=1&region=atlantis&starter=4');
    expect(r.regionId).toBeNull();
    expect(r.starterId).toBeNull();
  });

  it('handles an empty and a garbage query string', () => {
    expect(parseJourneyLink('').seed).toBeNull();
    expect(parseJourneyLink('?').seed).toBeNull();
    expect(parseJourneyLink('?&&&=').seed).toBeNull();
    expect(parseJourneyLink('%%%').seed).toBeNull();
  });
});

describe('link building', () => {
  it('round-trips a seed link through the parser', () => {
    const url = buildSeedLink({
      seed: 8843, pace: 'intense', archetype: 'aggro',
      regionId: 'johto', starterId: 155, origin: ORIGIN,
    });
    const query = url.slice(url.indexOf('?'));
    const parsed = parseJourneyLink(query, JOURNEY_PATH);
    expect(parsed.seed).toBe(8843);
    expect(parsed.pace).toBe('intense');
    expect(parsed.archetype).toBe('aggro');
    expect(parsed.regionId).toBe('johto');
    expect(parsed.starterId).toBe(155);
  });

  it('seed links point at the journey route', () => {
    expect(buildSeedLink({ seed: 1, origin: ORIGIN })).toBe(`${ORIGIN}/journey?seed=1`);
  });

  it('round-trips a daily link', () => {
    const url = buildDailyLink('2026-08-26', ORIGIN);
    expect(url).toBe(`${ORIGIN}/journey?daily=2026-08-26`);
    expect(parseJourneyLink(url.slice(url.indexOf('?'))).dailyDate).toBe('2026-08-26');
  });

  it('strips a trailing slash from the origin', () => {
    expect(buildSeedLink({ seed: 7, origin: 'https://x.com/' })).toBe('https://x.com/journey?seed=7');
  });

  it('displayLink drops the scheme for printing on the card', () => {
    expect(displayLink(8843, ORIGIN)).toBe('trainerscodex.com/journey?seed=8843');
  });

  it('link builders fall back to the canonical host with no window', () => {
    // vitest runs in node here — there is no window, which is exactly the
    // situation the Legend Card renderer is in when called from a worker.
    expect(buildSeedLink({ seed: 5 })).toContain('trainerscodex.com/journey?seed=5');
  });
});
