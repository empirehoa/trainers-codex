// Journey Mode analytics.
//
// A growth feature you can't measure is a guess. This sprint lives or dies on
// two numbers — share rate and builder-handoff rate — and both need event data
// to exist at all. See docs/JOURNEY_MODE.md § Analytics for the table DDL and
// the two KPI queries.
//
// ── Non-negotiables ──────────────────────────────────────────────────────
//   * NEVER blocks the sim. Every send is fire-and-forget; nothing awaits it.
//   * NEVER throws into the caller. All failures are swallowed.
//   * NO PII. An anonymous per-browser UUID, and nothing else that identifies
//     anyone. No trainer names (users type real names into that field), no IP
//     collection on our side, no cross-site identifiers.
//   * NO-OP when Supabase isn't configured, which is the default for the
//     static single-file bundle. The offline promise is not negotiable either.
//
// Transport is a plain REST insert rather than the Supabase JS client: the
// client is a CDN import that only loads when auth is configured, and
// analytics must work on a deploy that has a Supabase project but no auth
// providers wired.

import type { Archetype, Pace, RunSource } from './types';

const SESSION_KEY = 'trainerscodex.journey.session';
const TABLE = 'journey_events';

export type JourneyEventName =
  | 'run_started'
  | 'run_completed'
  | 'run_abandoned'
  | 'share_attempted'
  | 'builder_handoff'
  | 'merch_cta_click'
  | 'daily_played';

// 'clip' is the 9:16 video download — kept distinct from a plain image
// 'download' so the launch report can say WHICH share artifact converts.
export type ShareMethod = 'webshare' | 'copy' | 'download' | 'copy-link' | 'clip';

/** Event payloads. Deliberately narrow — anything not listed cannot be sent. */
export type JourneyEventProps =
  | { event: 'run_started'; pace: Pace; archetype: Archetype; source: RunSource; seed: number }
  | { event: 'run_completed'; durationMs: number; score: number; verdict: string; chapters: number; pace: Pace; archetype: Archetype; source: RunSource; seed: number }
  | { event: 'run_abandoned'; state: string; chapters: number; durationMs: number; seed: number }
  | { event: 'share_attempted'; method: ShareMethod; score: number; verdict: string; seed: number; daily: boolean }
  | { event: 'builder_handoff'; score: number; verdict: string; seed: number }
  | { event: 'merch_cta_click'; score: number; verdict: string; seed: number }
  | { event: 'daily_played'; streak: number; date: string; score: number; seed: number };

interface SupabaseRest {
  url: string;
  anonKey: string;
}

function getRest(): SupabaseRest | null {
  const cfg = typeof window !== 'undefined' ? window.TRAINERS_CODEX_CONFIG : undefined;
  const sb = cfg?.supabase;
  if (!sb?.url || !sb.anonKey) return null;
  return { url: sb.url.replace(/\/$/, ''), anonKey: sb.anonKey };
}

export function isAnalyticsConfigured(): boolean {
  return getRest() !== null;
}

/**
 * Anonymous, per-browser session id. Generated once and reused so runs by the
 * same browser can be sequenced (needed for the abandon-rate funnel) without
 * knowing anything about who that browser belongs to.
 */
export function sessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      // Fallback for older Safari — not cryptographically meaningful, and
      // doesn't need to be: this is a bucketing key, not a credential.
      : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return 'anonymous';
  }
}

/**
 * Send one event. Returns immediately; the caller never awaits and never sees
 * a rejection.
 */
export function track(props: JourneyEventProps): void {
  const rest = getRest();
  if (!rest) return;

  const { event, ...rest_props } = props;
  const body = JSON.stringify([{
    event,
    session_id: sessionId(),
    props: rest_props,
    // Client-stamped so a queued beacon keeps its real ordering; the table
    // also has a server default for rows that arrive without one.
    created_at: new Date().toISOString(),
  }]);

  try {
    void fetch(`${rest.url}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: rest.anonKey,
        authorization: `Bearer ${rest.anonKey}`,
        // Don't ask the server to echo the row back — we don't read it.
        prefer: 'return=minimal',
      },
      body,
      // Survives the page being closed mid-send, which is exactly when
      // run_abandoned fires and exactly the event we'd otherwise always lose.
      keepalive: true,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    }).catch(() => { /* offline, blocked, RLS refusal — all fine, drop it */ });
  } catch {
    // Even constructing the request can throw in locked-down environments.
  }
}
