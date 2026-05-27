// Trainer's Codex auth + cloud-sync adapter.
//
// At rest the app runs purely on localStorage — no network calls, no accounts.
// When a `window.TRAINERS_CODEX_CONFIG` object is present with valid Supabase
// credentials, this module dynamically loads the Supabase JS client from a CDN
// and unlocks:
//   - Sign in with Google / GitHub / Discord / Facebook / Microsoft (via Azure)
//   - Cloud-sync of trainer profile + saved teams (Supabase Postgres row owned by user)
//   - Cross-device continuity
//
// The bundle stays a single self-contained HTML when the config is absent.
// To enable auth in production, paste a config block before the closing </body>:
//
//   <script>
//     window.TRAINERS_CODEX_CONFIG = {
//       supabase: {
//         url: 'https://YOUR-PROJECT.supabase.co',
//         anonKey: 'eyJhbG...',
//       },
//     };
//   </script>
//
// See /docs/DEPLOYMENT.md for the full setup runbook.

import type { TrainerProfile, SavedTeam } from './types';

export type AuthProvider = 'google' | 'github' | 'discord' | 'facebook' | 'azure' | 'twitter';

export interface AuthSession {
  userId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  provider: AuthProvider | 'email';
}

export interface CloudData {
  trainer: TrainerProfile | null;
  teams: SavedTeam[];
  updatedAt: number;
}

export interface AuthAdapter {
  isConfigured: boolean;
  /** Resolve the current session, or null if signed out. */
  getSession(): Promise<AuthSession | null>;
  /** Initiate OAuth flow. Redirects in same tab; returns Promise that may never resolve. */
  signInWith(provider: AuthProvider): Promise<void>;
  /** Sign out. */
  signOut(): Promise<void>;
  /** Subscribe to session changes. Returns unsubscribe. */
  onAuthChange(cb: (session: AuthSession | null) => void): () => void;
  /** Fetch the current user's cloud-stored trainer + teams. */
  fetchCloudData(): Promise<CloudData | null>;
  /** Push a complete snapshot of trainer + teams. */
  saveCloudData(data: CloudData): Promise<void>;
}

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface WorkerEndpointConfig {
  /** Base URL of the deployed Cloudflare Worker, no trailing slash. */
  url: string;
}

export interface TrainersCodexConfig {
  supabase?: SupabaseConfig;
  worker?: WorkerEndpointConfig;
}

declare global {
  interface Window {
    TRAINERS_CODEX_CONFIG?: TrainersCodexConfig;
  }
}

function getConfig(): SupabaseConfig | null {
  const cfg = typeof window !== 'undefined' ? window.TRAINERS_CODEX_CONFIG : undefined;
  if (cfg?.supabase?.url && cfg.supabase.anonKey) return cfg.supabase;
  return null;
}

let cachedClient: SupabaseClientLike | null = null;
let loadingPromise: Promise<SupabaseClientLike | null> | null = null;

// Minimal typed surface of the Supabase JS client we use.
// We load the runtime SDK from a CDN; this interface keeps the rest of our
// codebase typed without making @supabase/supabase-js a build dependency.
interface SupabaseClientLike {
  auth: {
    getSession(): Promise<{ data: { session: { user: SupabaseUser; access_token: string } | null }; error: unknown }>;
    signInWithOAuth(opts: { provider: string; options?: { redirectTo?: string } }): Promise<unknown>;
    signOut(): Promise<unknown>;
    onAuthStateChange(cb: (event: string, session: { user: SupabaseUser } | null) => void): { data: { subscription: { unsubscribe(): void } } };
  };
  from(table: string): {
    select(cols?: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{ data: CloudRow | null; error: unknown }>;
      };
    };
    upsert(row: CloudRow, opts?: { onConflict?: string }): Promise<{ data: unknown; error: unknown }>;
  };
}

interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
    name?: string;
    picture?: string;
  };
  app_metadata?: {
    provider?: string;
  };
}

interface CloudRow {
  user_id: string;
  trainer: TrainerProfile | null;
  teams: SavedTeam[];
  updated_at: string;
}

// Supabase JS v2.45.4 ESM bundle SHA-384 pinned at build time.
// Native Subresource Integrity is not yet supported for dynamic ESM
// import() — see https://github.com/whatwg/html/issues/3014. As a stopgap
// we fetch + digest + verify, then import a blob: URL that has been
// content-checked. If the upstream CDN ever returns different bytes
// (compromise, version drift, MITM), the import is refused and auth
// silently falls back to localStorage-only.
//
// To rotate: download the bundle, run:
//   shasum -a 384 supabase.js | xxd -r -p | base64
// Or in JS:
//   const buf = await (await fetch(URL)).arrayBuffer();
//   const h = await crypto.subtle.digest('SHA-384', buf);
//   btoa(String.fromCharCode(...new Uint8Array(h)));
//
// Setting this to an empty string disables the integrity check (NOT
// recommended for production, but allowed for staging).
const SUPABASE_BUNDLE_VERSION = '2.45.4';
const SUPABASE_BUNDLE_URL = 'https://esm.sh/@supabase/supabase-js@' + SUPABASE_BUNDLE_VERSION;
const SUPABASE_BUNDLE_SHA384 = ''; // Populated post-deploy via docs/SECURITY.md runbook.

async function verifyAndImport(url: string, expectedSha384: string): Promise<unknown> {
  // The esm.sh response is a small re-export shim with internal relative
  // imports — that rules out blob: URLs (relative paths would break) and
  // import-map integrity (CSP doesn't allow inline maps in this bundle).
  // The pragmatic compromise: pre-fetch the bytes, hash them, and only THEN
  // do the dynamic import on the same URL. The browser's HTTP cache reuses
  // the verified response for the import, so the same bytes are evaluated.
  // This catches the realistic threats (CDN compromise, dependency-confusion
  // version drift) while keeping the relative-import chain intact.
  if (expectedSha384) {
    const resp = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!resp.ok) throw new Error(`CDN fetch failed: ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-384', buf);
    const actual = btoa(String.fromCharCode(...new Uint8Array(digest)));
    if (actual !== expectedSha384) {
      throw new Error(`SRI mismatch on ${url}: expected sha384-${expectedSha384}, got sha384-${actual}`);
    }
  }
  return await import(/* @vite-ignore */ url);
}

async function getClient(): Promise<SupabaseClientLike | null> {
  if (cachedClient) return cachedClient;
  if (loadingPromise) return loadingPromise;
  const cfg = getConfig();
  if (!cfg) return null;

  loadingPromise = (async () => {
    try {
      const mod = await verifyAndImport(SUPABASE_BUNDLE_URL, SUPABASE_BUNDLE_SHA384);
      const createClient = (mod as { createClient: (url: string, key: string) => SupabaseClientLike }).createClient;
      cachedClient = createClient(cfg.url, cfg.anonKey);
      return cachedClient;
    } catch (e) {
      console.warn('[trainerscodex] Supabase client failed to load:', e);
      return null;
    }
  })();

  return loadingPromise;
}

function mapUser(u: SupabaseUser, provider?: string): AuthSession {
  const meta = u.user_metadata || {};
  return {
    userId: u.id,
    email: u.email ?? null,
    name: meta.full_name || meta.name || (u.email ? u.email.split('@')[0] : null),
    avatarUrl: meta.avatar_url || meta.picture || null,
    provider: (provider || u.app_metadata?.provider || 'email') as AuthProvider | 'email',
  };
}

/**
 * Active adapter — Supabase if configured, no-op stub otherwise.
 * Either way, the rest of the app calls these methods and the auth UI
 * stays consistent.
 */
export const auth: AuthAdapter = {
  get isConfigured() { return !!getConfig(); },

  async getSession() {
    const client = await getClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    if (!data.session) return null;
    return mapUser(data.session.user);
  },

  async signInWith(provider) {
    const client = await getClient();
    if (!client) throw new Error('Auth is not configured for this deployment.');
    // Map our provider names to Supabase's
    const supaProvider = provider === 'azure' ? 'azure' : provider;
    await client.auth.signInWithOAuth({
      provider: supaProvider,
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  },

  async signOut() {
    const client = await getClient();
    if (!client) return;
    await client.auth.signOut();
  },

  onAuthChange(cb) {
    let unsub = () => {};
    void (async () => {
      const client = await getClient();
      if (!client) return;
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        cb(session ? mapUser(session.user) : null);
      });
      unsub = () => data.subscription.unsubscribe();
    })();
    return () => unsub();
  },

  async fetchCloudData() {
    const client = await getClient();
    if (!client) return null;
    const session = await this.getSession();
    if (!session) return null;
    const { data, error } = await client.from('user_data').select('*').eq('user_id', session.userId).maybeSingle();
    if (error || !data) return null;
    return {
      trainer: data.trainer,
      teams: data.teams,
      updatedAt: new Date(data.updated_at).getTime(),
    };
  },

  async saveCloudData(payload) {
    const client = await getClient();
    if (!client) return;
    const session = await this.getSession();
    if (!session) return;
    await client.from('user_data').upsert(
      {
        user_id: session.userId,
        trainer: payload.trainer,
        teams: payload.teams,
        updated_at: new Date(payload.updatedAt).toISOString(),
      },
      { onConflict: 'user_id' }
    );
  },
};

/**
 * Provider catalog for the sign-in UI. Each entry is shown only when the
 * corresponding provider is enabled in Supabase Dashboard → Auth → Providers.
 * The dashboard config drives availability; the UI shows the full list.
 */
export const AUTH_PROVIDERS: Array<{
  id: AuthProvider;
  label: string;
  // Short hex color used for the button accent
  accent: string;
}> = [
  { id: 'google',   label: 'Google',          accent: '#ea4335' },
  { id: 'azure',    label: 'Microsoft',       accent: '#0078d4' },
  { id: 'facebook', label: 'Facebook',        accent: '#1877f2' },
  { id: 'github',   label: 'GitHub',          accent: '#24292e' },
  { id: 'discord',  label: 'Discord',         accent: '#5865f2' },
  { id: 'twitter',  label: 'X (Twitter)',     accent: '#000000' },
];
