// Supabase-backed ProfileClient — the production wiring for public profiles.
//
// profiles.ts stays pure (no network). This module is the ONLY place that
// touches the live Supabase query surface for profiles/teams/reports. It reuses
// the CDN-loaded client from auth.ts (so there's a single SDK load) and narrows
// it to just the PostgREST query methods we use. When auth isn't configured the
// factory returns null and the UI degrades to "cloud features are off."

import { getSupabaseClient } from './auth';
import type {
  ProfileClient, ProfileRow, PublicTeamRow, ReportRow, PublicProfile, PublicTeam,
} from './profiles';

// Minimal structural view of the Supabase PostgREST builder. The real builder
// is thenable and chainable; we type only the chain we call. Rows come back as
// loose records and we map them into our own shapes.
type PgResult<T> = Promise<{ data: T; error: unknown }>;

interface PgBuilder {
  select(cols?: string): PgBuilder;
  eq(col: string, val: string | boolean): PgBuilder;
  order(col: string, opts: { ascending: boolean }): PgBuilder;
  maybeSingle(): PgResult<Record<string, unknown> | null>;
  then<R>(onfulfilled: (v: { data: unknown; error: unknown }) => R): Promise<R>;
}

interface PgTable {
  select(cols?: string): PgBuilder;
  insert(row: Record<string, unknown>): PgBuilder;
  upsert(row: Record<string, unknown>, opts?: { onConflict?: string }): PgResult<{ data: unknown; error: unknown }>;
}

interface PgClient {
  from(table: string): PgTable;
}

function toProfile(row: Record<string, unknown>): PublicProfile {
  return {
    handle: String(row.handle ?? ''),
    display: (row.display as string) ?? null,
    bio: (row.bio as string) ?? null,
    region: (row.region as string) ?? null,
    motto: (row.motto as string) ?? null,
    avatarUrl: (row.avatar_url as string) ?? null,
  };
}

function toTeam(row: Record<string, unknown>): PublicTeam {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? 'Untitled Team'),
    members: (row.members as PublicTeam['members']) ?? [],
    trainer: (row.trainer as PublicTeam['trainer']) ?? null,
  };
}

/** Wrap an already-loaded Supabase client as a ProfileClient. */
export function createSupabaseProfileClient(raw: unknown): ProfileClient {
  const client = raw as PgClient;
  return {
    async getProfile(handle) {
      const { data, error } = await client
        .from('profiles')
        .select('handle,display,bio,region,motto,avatar_url')
        .eq('handle', handle)
        .maybeSingle();
      if (error || !data) return null;
      return toProfile(data);
    },

    async getTeams(handle) {
      const prof = await client
        .from('profiles')
        .select('user_id')
        .eq('handle', handle)
        .maybeSingle();
      const ownerId = prof.data?.user_id;
      if (prof.error || !ownerId) return [];
      const res = await client
        .from('public_teams')
        .select('id,name,members,trainer,updated_at')
        .eq('owner', String(ownerId))
        .eq('is_public', true)
        .order('updated_at', { ascending: false });
      const rows = (res as unknown as { data: Record<string, unknown>[] | null; error: unknown });
      if (rows.error || !rows.data) return [];
      return rows.data.map(toTeam);
    },

    async publishProfile(row: ProfileRow) {
      const { error } = await client.from('profiles').upsert(row as unknown as Record<string, unknown>, { onConflict: 'user_id' });
      if (error) return { ok: false, error: 'Could not save your profile.' };
      return { ok: true };
    },

    async publishTeam(row: PublicTeamRow) {
      const res = await client
        .from('public_teams')
        .insert(row as unknown as Record<string, unknown>)
        .select('id')
        .maybeSingle();
      if (res.error || !res.data) return { ok: false, error: 'Could not publish your team.' };
      return { ok: true, id: String((res.data as Record<string, unknown>).id) };
    },

    async fileReport(row: ReportRow) {
      const { error } = await client.from('reports').insert(row as unknown as Record<string, unknown>) as unknown as { error: unknown };
      if (error) return { ok: false, error: 'Could not file the report.' };
      return { ok: true };
    },
  };
}

let cached: ProfileClient | null = null;

/**
 * Resolve the production ProfileClient, or null when cloud features are off.
 * Memoized so we wrap the SDK once.
 */
export async function getProfileClient(): Promise<ProfileClient | null> {
  if (cached) return cached;
  const raw = await getSupabaseClient();
  if (!raw) return null;
  cached = createSupabaseProfileClient(raw);
  return cached;
}
