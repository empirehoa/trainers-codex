// Ghost trainers — other players' finished teams as opponents.
//
// The strongest retention mechanic available without netcode: when you reach
// the World Cup, the bracket is filled with real careers other people ran on
// the same seed. Purely additive — with zero ghosts the field is generated, so
// the game plays identically offline, on day one, and with Supabase absent.
//
// Privacy: anonymous by construction. We submit a trainer NAME (which the
// player typed, and which defaults to a generated handle), a score, and six
// species ids. No account id, no IP, no PII — the same posture as
// journey_events.

import type { Opponent } from './opponents';
import { monTypes } from './content';
import type { JourneyRun } from './types';

interface SupabaseCfg { url: string; anonKey: string }

function config(): SupabaseCfg | null {
  if (typeof window === 'undefined') return null;
  const cfg = window.TRAINERS_CODEX_CONFIG?.supabase;
  return cfg?.url && cfg?.anonKey ? cfg : null;
}

export interface GhostRow {
  seed: number;
  campaign: string;
  trainer_name: string;
  score: number;
  verdict: string;
  roster: number[];
  level: number;
}

/** Fire-and-forget submit. Never throws, never blocks the UI. */
export function submitGhost(run: JourneyRun, partyLevel: number): void {
  const cfg = config();
  if (!cfg) return;
  const row: GhostRow = {
    seed: run.setup.seed,
    campaign: run.setup.campaign ?? 'short',
    trainer_name: String(run.setup.trainerName).slice(0, 24),
    score: run.score,
    verdict: run.verdict.id,
    roster: run.roster.slice(0, 6).map(m => m.id),
    level: partyLevel,
  };
  try {
    void fetch(`${cfg.url}/rest/v1/journey_ghosts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Offline / blocked / private mode — a ghost is a bonus, never required.
  }
}

/** Fetch ghosts for a seed. Resolves to [] on any failure. */
export async function fetchGhosts(seed: number, limit = 6): Promise<GhostRow[]> {
  const cfg = config();
  if (!cfg) return [];
  try {
    const url = `${cfg.url}/rest/v1/journey_ghosts`
      + `?seed=eq.${encodeURIComponent(String(seed))}`
      + `&order=score.desc&limit=${limit}`;
    const res = await fetch(url, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
    });
    if (!res.ok) return [];
    const rows: unknown = await res.json();
    return Array.isArray(rows) ? (rows as GhostRow[]) : [];
  } catch {
    return [];
  }
}

/** Turn stored rows into World Cup opponents. */
export function ghostsToOpponents(rows: GhostRow[], regionId: string): Opponent[] {
  return rows.map((r, i) => {
    const ids = Array.isArray(r.roster) ? r.roster.filter(n => Number.isInteger(n)) : [];
    const primary = ids.length ? monTypes(ids[0])[0] ?? 'normal' : 'normal';
    return {
      kind: 'world-cup' as const,
      name: r.trainer_name || 'Anonymous',
      title: 'Rival Trainer',
      specialty: primary,
      index: i + 1,
      level: Math.max(40, Math.min(100, r.level || 70)),
      teamIds: ids.slice(0, 6),
      regionId,
      ghost: { trainerName: r.trainer_name || 'Anonymous', score: r.score ?? 0 },
    };
  });
}
