// Analytics contract.
//
// Verifies what can be verified without a live Supabase project: that events
// no-op entirely when unconfigured, that each event shape reaches the REST
// endpoint intact, that the session id is anonymous and stable, and — the
// non-negotiable one — that a failing transport can never throw into the sim.
//
// The live end-to-end check (rows actually landing in `journey_events`, KPI
// queries returning correct numbers) needs the table to exist in Jose's
// project. The DDL and both queries are in docs/JOURNEY_MODE.md § Analytics.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAnalyticsConfigured, sessionId, track } from './analytics';

const SUPABASE_URL = 'https://example.supabase.co';
const ANON = 'anon-key-123';

function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size; },
  });
  return store;
}

/** Captures fetch calls and returns the parsed request bodies. */
function installFetch(impl?: () => Promise<unknown>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return impl ? impl() : Promise.resolve({ ok: true });
  });
  vi.stubGlobal('fetch', fn);
  return {
    calls,
    bodies: () => calls.map(c => JSON.parse(c.init.body as string)[0]),
  };
}

function configure(cfg: unknown) {
  vi.stubGlobal('window', { TRAINERS_CODEX_CONFIG: cfg });
}

beforeEach(() => {
  installLocalStorage();
  // Date is stamped into every payload; pin it so assertions are exact.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('configuration gating', () => {
  it('is not configured without a supabase block', () => {
    configure({});
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it('is not configured with a partial supabase block', () => {
    configure({ supabase: { url: SUPABASE_URL } });
    expect(isAnalyticsConfigured()).toBe(false);
    configure({ supabase: { anonKey: ANON } });
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it('is configured with url + anonKey', () => {
    configure({ supabase: { url: SUPABASE_URL, anonKey: ANON } });
    expect(isAnalyticsConfigured()).toBe(true);
  });

  it('sends NOTHING when unconfigured — the static bundle default', () => {
    configure({});
    const f = installFetch();
    track({ event: 'run_started', pace: 'normal', archetype: 'balance', source: 'fresh', seed: 1 });
    track({ event: 'builder_handoff', score: 500, verdict: 'journeyman', seed: 1 });
    expect(f.calls.length).toBe(0);
  });
});

describe('transport', () => {
  beforeEach(() => configure({ supabase: { url: SUPABASE_URL, anonKey: ANON } }));

  it('POSTs to the journey_events REST endpoint with auth headers', () => {
    const f = installFetch();
    track({ event: 'run_started', pace: 'express', archetype: 'aggro', source: 'daily', seed: 42 });

    expect(f.calls.length).toBe(1);
    const { url, init } = f.calls[0];
    expect(url).toBe(`${SUPABASE_URL}/rest/v1/journey_events`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe(ANON);
    expect(headers.authorization).toBe(`Bearer ${ANON}`);
    expect(headers.prefer).toBe('return=minimal');
    // keepalive is what lets run_abandoned survive the page closing.
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
  });

  it('strips a trailing slash from the configured url', () => {
    configure({ supabase: { url: `${SUPABASE_URL}/`, anonKey: ANON } });
    const f = installFetch();
    track({ event: 'builder_handoff', score: 1, verdict: 'v', seed: 1 });
    expect(f.calls[0].url).toBe(`${SUPABASE_URL}/rest/v1/journey_events`);
  });

  it('sends the event name, session id, props and timestamp', () => {
    const f = installFetch();
    track({
      event: 'run_completed', durationMs: 142_000, score: 714, verdict: 'steady-hand',
      chapters: 17, pace: 'normal', archetype: 'balance', source: 'seed-link', seed: 8843,
    });
    const row = f.bodies()[0];
    expect(row.event).toBe('run_completed');
    expect(typeof row.session_id).toBe('string');
    expect(row.session_id.length).toBeGreaterThan(0);
    expect(row.created_at).toBe('2026-08-04T12:00:00.000Z');
    expect(row.props).toEqual({
      durationMs: 142_000, score: 714, verdict: 'steady-hand',
      chapters: 17, pace: 'normal', archetype: 'balance', source: 'seed-link', seed: 8843,
    });
    // `event` must not be duplicated inside props.
    expect(row.props.event).toBeUndefined();
  });

  it('carries every §2.7 event with its documented fields', () => {
    const f = installFetch();
    track({ event: 'run_started', pace: 'express', archetype: 'collector', source: 'fresh', seed: 1 });
    track({ event: 'run_completed', durationMs: 1, score: 2, verdict: 'v', chapters: 12, pace: 'express', archetype: 'collector', source: 'fresh', seed: 1 });
    track({ event: 'run_abandoned', state: 'decision', chapters: 3, durationMs: 9, seed: 1 });
    track({ event: 'share_attempted', method: 'webshare', score: 2, verdict: 'v', seed: 1, daily: false });
    track({ event: 'builder_handoff', score: 2, verdict: 'v', seed: 1 });
    track({ event: 'merch_cta_click', score: 2, verdict: 'v', seed: 1 });
    track({ event: 'daily_played', streak: 4, date: '2026-08-04', score: 2, seed: 1 });

    const rows = f.bodies();
    expect(rows.map(r => r.event)).toEqual([
      'run_started', 'run_completed', 'run_abandoned', 'share_attempted',
      'builder_handoff', 'merch_cta_click', 'daily_played',
    ]);
    // The two KPI numerators must carry what the queries group by.
    const share = rows.find(r => r.event === 'share_attempted')!;
    expect(share.props.method).toBe('webshare');
    const daily = rows.find(r => r.event === 'daily_played')!;
    expect(daily.props.streak).toBe(4);
    expect(daily.props.date).toBe('2026-08-04');
  });

  it('records every share method the UI can emit', () => {
    const f = installFetch();
    for (const method of ['webshare', 'copy', 'download', 'copy-link'] as const) {
      track({ event: 'share_attempted', method, score: 1, verdict: 'v', seed: 1, daily: true });
    }
    expect(f.bodies().map(r => r.props.method))
      .toEqual(['webshare', 'copy', 'download', 'copy-link']);
  });

  it('never sends the trainer name or any other free-text PII', () => {
    const f = installFetch();
    track({ event: 'run_started', pace: 'normal', archetype: 'balance', source: 'fresh', seed: 7 });
    track({ event: 'run_completed', durationMs: 1, score: 1, verdict: 'v', chapters: 12, pace: 'normal', archetype: 'balance', source: 'fresh', seed: 7 });
    const serialized = JSON.stringify(f.bodies());
    for (const field of ['trainerName', 'trainer', 'email', 'name']) {
      expect(serialized, `payload leaked ${field}`).not.toContain(`"${field}"`);
    }
  });
});

describe('session id', () => {
  it('is stable across calls and persisted', () => {
    configure({ supabase: { url: SUPABASE_URL, anonKey: ANON } });
    const first = sessionId();
    expect(sessionId()).toBe(first);
    expect(localStorage.getItem('trainerscodex.journey.session')).toBe(first);
  });

  it('falls back to a literal anonymous id when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
      removeItem() {},
    });
    expect(sessionId()).toBe('anonymous');
  });
});

describe('failure isolation — analytics must never break the sim', () => {
  beforeEach(() => configure({ supabase: { url: SUPABASE_URL, anonKey: ANON } }));

  it('swallows a rejected fetch', () => {
    installFetch(() => Promise.reject(new Error('offline')));
    expect(() => track({ event: 'builder_handoff', score: 1, verdict: 'v', seed: 1 })).not.toThrow();
  });

  it('swallows a fetch that throws synchronously', () => {
    vi.stubGlobal('fetch', () => { throw new Error('blocked by extension'); });
    expect(() => track({ event: 'builder_handoff', score: 1, verdict: 'v', seed: 1 })).not.toThrow();
  });

  it('swallows a missing fetch entirely', () => {
    vi.stubGlobal('fetch', undefined);
    expect(() => track({ event: 'builder_handoff', score: 1, verdict: 'v', seed: 1 })).not.toThrow();
  });

  it('returns synchronously — it must not be awaited on the hot path', () => {
    installFetch(() => new Promise(() => { /* never settles */ }));
    const result = track({ event: 'builder_handoff', score: 1, verdict: 'v', seed: 1 });
    expect(result).toBeUndefined();
  });
});
