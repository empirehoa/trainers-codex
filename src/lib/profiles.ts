// ============================================================
// PUBLIC PROFILES  (Sprint 4) — handles, shareable teams, moderation
// ============================================================
// Trainer's Codex ships as a single static HTML that drops on any host. Public
// profiles are an OPTIONAL cloud layer: when Supabase is configured (see
// lib/auth.ts), a user can claim a handle, publish a team, follow others, and
// report abuse. When it's NOT configured the app stays 100% offline and these
// helpers simply never get a live client.
//
// Design rules that keep this testable AND host-agnostic:
//   - All the logic that doesn't need the network lives here as PURE functions:
//     handle validation, route parsing, payload shaping, text sanitization.
//     The Puppeteer harness aborts every external request, so the only way to
//     test this is to keep the brains offline and inject the client.
//   - The network surface is a small `ProfileClient` interface. Production wires
//     a Supabase-backed implementation; tests inject an in-memory stub. The UI
//     never imports Supabase directly — it takes a ProfileClient.
//   - Routing is parsed from location WITHOUT assuming a server: we try the real
//     path (/u/<handle>) first, then a hash route (#/u/<handle> or #u=<handle>),
//     then a query param (?u=<handle>). A static host with no SPA rewrite can
//     still deep-link via the hash form.

import type { SavedTeam, TeamMember, TrainerProfile } from './types';

// ------------------------------------------------------------
// Handles
// ------------------------------------------------------------
// Mirror the DB constraint exactly: ^[a-z0-9_-]{3,24}$ (see
// docs/supabase-v6-schema.sql). Validating client-side gives a friendly error
// before the round-trip; the DB check is still the source of truth.
export const HANDLE_RE = /^[a-z0-9_-]{3,24}$/;

// Words we never let a user claim — they'd collide with routes, impersonate the
// brand, or be used for phishing. Kept lowercase; comparison is case-folded.
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'u', 'admin', 'administrator', 'root', 'system', 'support', 'help', 'api',
  'app', 'www', 'mail', 'official', 'staff', 'mod', 'moderator', 'team',
  'teams', 'profile', 'profiles', 'settings', 'login', 'logout', 'signin',
  'signup', 'register', 'auth', 'about', 'terms', 'privacy', 'dmca', 'legal',
  'trainerscodex', 'trainers-codex', 'codex', 'pokemon', 'pokémon', 'nintendo',
  'gamefreak', 'null', 'undefined', 'me', 'you', 'everyone', 'home',
]);

export interface HandleCheck {
  ok: boolean;
  handle?: string;   // normalized (lowercased/trimmed) when ok
  error?: string;    // human-readable reason when !ok
}

/** Lowercase + trim. Does NOT validate — use validateHandle for that. */
export function normalizeHandle(raw: string): string {
  return (raw || '').trim().toLowerCase();
}

/**
 * Validate a desired handle. Returns the normalized handle when valid, else a
 * specific human-readable error. Pure — no network, safe to call on keystroke.
 */
export function validateHandle(raw: string): HandleCheck {
  const handle = normalizeHandle(raw);
  if (!handle) return { ok: false, error: 'Pick a handle.' };
  if (handle.length < 3) return { ok: false, error: 'Too short — at least 3 characters.' };
  if (handle.length > 24) return { ok: false, error: 'Too long — 24 characters max.' };
  if (!HANDLE_RE.test(handle)) {
    return { ok: false, error: 'Only lowercase letters, numbers, hyphen and underscore.' };
  }
  if (RESERVED_HANDLES.has(handle)) return { ok: false, error: 'That handle is reserved.' };
  return { ok: true, handle };
}

// ------------------------------------------------------------
// Routing — host-agnostic /u/<handle>
// ------------------------------------------------------------
export interface RouteLocation {
  pathname: string;
  hash: string;
  search: string;
}

function fromLocation(loc?: Partial<RouteLocation>): RouteLocation {
  if (loc && (loc.pathname != null || loc.hash != null || loc.search != null)) {
    return { pathname: loc.pathname || '', hash: loc.hash || '', search: loc.search || '' };
  }
  if (typeof window !== 'undefined' && window.location) {
    return {
      pathname: window.location.pathname || '',
      hash: window.location.hash || '',
      search: window.location.search || '',
    };
  }
  return { pathname: '', hash: '', search: '' };
}

/**
 * Extract a profile handle from the current (or given) location, or null when
 * the URL isn't a profile route. Tries, in order:
 *   1. real path     /u/<handle>             (works behind an SPA rewrite)
 *   2. hash path      #/u/<handle>            (static-host deep link)
 *   3. hash param     #u=<handle>             (legacy/share form)
 *   4. query param    ?u=<handle>
 * The handle is returned only if it passes validateHandle, so a junk URL can't
 * drive a lookup.
 */
export function parseProfileRoute(loc?: Partial<RouteLocation>): string | null {
  const { pathname, hash, search } = fromLocation(loc);

  const tryHandle = (h: string | undefined | null): string | null => {
    if (!h) return null;
    const dec = (() => { try { return decodeURIComponent(h); } catch { return h; } })();
    const v = validateHandle(dec);
    return v.ok ? v.handle! : null;
  };

  // 1. real path /u/<handle>
  const pathMatch = pathname.match(/\/u\/([^/?#]+)/i);
  const fromPath = tryHandle(pathMatch?.[1]);
  if (fromPath) return fromPath;

  // 2 + 3. hash forms
  if (hash) {
    const h = hash.replace(/^#/, '');
    const hashPath = h.match(/^\/?u\/([^/?#&]+)/i);
    const fromHashPath = tryHandle(hashPath?.[1]);
    if (fromHashPath) return fromHashPath;
    const hashParam = h.match(/(?:^|&)u=([^&]+)/i);
    const fromHashParam = tryHandle(hashParam?.[1]);
    if (fromHashParam) return fromHashParam;
  }

  // 4. query param ?u=<handle>
  if (search) {
    const q = search.match(/(?:^\?|&)u=([^&]+)/i);
    const fromQuery = tryHandle(q?.[1]);
    if (fromQuery) return fromQuery;
  }

  return null;
}

/**
 * Canonical share URL for a handle. Uses a real path when an origin is given
 * (production behind a rewrite); falls back to a hash deep link so it also
 * works when dropped on a dumb static host.
 */
export function profileUrl(handle: string, origin?: string): string {
  const h = normalizeHandle(handle);
  const base = origin === undefined
    ? (typeof window !== 'undefined' ? window.location.origin : '')
    : origin;
  if (!base) return `#/u/${h}`;
  return `${base.replace(/\/$/, '')}/u/${h}`;
}

// ------------------------------------------------------------
// Text sanitization
// ------------------------------------------------------------
// Strip control characters (codepoints < 0x20 and DEL 0x7f) by scanning code
// points rather than a regex class — a literal control-char range in source
// would make this file non-text. Then collapse whitespace and clamp length.
export function sanitizeText(raw: string | undefined | null, max: number): string {
  if (!raw) return '';
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    out += (code < 0x20 || code === 0x7f) ? ' ' : ch;
  }
  const collapsed = out.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? collapsed.slice(0, max) : collapsed;
}

// ------------------------------------------------------------
// Payload shaping — the exact row shapes the DB expects
// ------------------------------------------------------------
export interface ProfileRow {
  user_id: string;
  handle: string;
  display: string | null;
  bio: string | null;
  avatar_url: string | null;
  region: string | null;
  motto: string | null;
  is_public: boolean;
}

export interface ProfilePublishInput {
  userId: string;
  handle: string;
  trainer?: TrainerProfile | null;
  bio?: string;
  isPublic?: boolean;
}

export interface ShapeResult<T> {
  ok: boolean;
  row?: T;
  error?: string;
}

/**
 * Build the profiles upsert row from a publish request. Validates the handle,
 * clamps bio (≤280) and motto (≤80) to match the DB checks, and pulls sensible
 * defaults off the local TrainerProfile when present.
 */
export function shapeProfilePayload(input: ProfilePublishInput): ShapeResult<ProfileRow> {
  if (!input.userId) return { ok: false, error: 'Not signed in.' };
  const v = validateHandle(input.handle);
  if (!v.ok) return { ok: false, error: v.error };
  const t = input.trainer || null;
  return {
    ok: true,
    row: {
      user_id: input.userId,
      handle: v.handle!,
      display: sanitizeText(t?.name, 60) || null,
      bio: sanitizeText(input.bio, 280) || null,
      avatar_url: null, // never push data URLs to a text column; sprites resolve client-side
      region: sanitizeText(t?.region, 40) || null,
      motto: sanitizeText(t?.motto || t?.catchphrase, 80) || null,
      is_public: input.isPublic !== false,
    },
  };
}

export interface PublicTeamRow {
  owner: string;
  name: string;
  members: (TeamMember | null)[];
  trainer: TrainerProfile | null;
  is_public: boolean;
}

export interface TeamPublishInput {
  ownerId: string;
  team: Pick<SavedTeam, 'name' | 'members'>;
  trainer?: TrainerProfile | null;
  isPublic?: boolean;
}

/** Build a public_teams row. Drops empty slots, clamps name (≤60). */
export function shapeTeamPayload(input: TeamPublishInput): ShapeResult<PublicTeamRow> {
  if (!input.ownerId) return { ok: false, error: 'Not signed in.' };
  const members = (input.team.members || []).filter((m): m is TeamMember => Boolean(m));
  if (members.length === 0) return { ok: false, error: 'Team is empty.' };
  return {
    ok: true,
    row: {
      owner: input.ownerId,
      name: sanitizeText(input.team.name, 60) || 'Untitled Team',
      members,
      trainer: input.trainer || null,
      is_public: input.isPublic !== false,
    },
  };
}

export const REPORT_REASONS = ['spam', 'abuse', 'impersonation', 'nsfw', 'copyright', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTargetKind = 'profile' | 'team';

export interface ReportRow {
  reporter: string;
  target_kind: ReportTargetKind;
  target_id: string;
  reason: ReportReason;
  detail: string | null;
}

export interface ReportInput {
  reporterId: string;
  targetKind: ReportTargetKind;
  targetId: string;
  reason: string;
  detail?: string;
}

/** Build a reports row. Validates kind + reason against the DB enums. */
export function shapeReportPayload(input: ReportInput): ShapeResult<ReportRow> {
  if (!input.reporterId) return { ok: false, error: 'Sign in to report.' };
  if (input.targetKind !== 'profile' && input.targetKind !== 'team') {
    return { ok: false, error: 'Unknown report target.' };
  }
  if (!input.targetId) return { ok: false, error: 'Missing report target.' };
  if (!REPORT_REASONS.includes(input.reason as ReportReason)) {
    return { ok: false, error: 'Pick a reason.' };
  }
  return {
    ok: true,
    row: {
      reporter: input.reporterId,
      target_kind: input.targetKind,
      target_id: input.targetId,
      reason: input.reason as ReportReason,
      detail: sanitizeText(input.detail, 500) || null,
    },
  };
}

// ------------------------------------------------------------
// Client seam — the only network surface
// ------------------------------------------------------------
export interface PublicProfile {
  handle: string;
  display: string | null;
  bio: string | null;
  region: string | null;
  motto: string | null;
  avatarUrl: string | null;
}

export interface PublicTeam {
  id: string;
  name: string;
  members: (TeamMember | null)[];
  trainer: TrainerProfile | null;
}

/**
 * The whole network surface for public profiles. UI components depend on THIS,
 * never on Supabase directly — so tests inject an in-memory stub and the
 * production wiring stays swappable.
 */
export interface ProfileClient {
  /** Look up a public profile by handle, or null when absent/private. */
  getProfile(handle: string): Promise<PublicProfile | null>;
  /** Public teams for a handle, newest first. */
  getTeams(handle: string): Promise<PublicTeam[]>;
  /** Upsert the signed-in user's profile. */
  publishProfile(row: ProfileRow): Promise<{ ok: boolean; error?: string }>;
  /** Insert a public team for the signed-in user. */
  publishTeam(row: PublicTeamRow): Promise<{ ok: boolean; id?: string; error?: string }>;
  /** File a moderation report. */
  fileReport(row: ReportRow): Promise<{ ok: boolean; error?: string }>;
}
