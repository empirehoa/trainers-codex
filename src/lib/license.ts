// Trainer's Codex client-side license handling.
//
// Lifecycle:
//   1. `getStoredLicense()` reads localStorage on app boot. If a valid-by-shape
//      JWT exists with `exp > now`, the user is treated as premium.
//   2. `bootstrapFromCheckoutReturn()` looks for `?session_id=cs_...` in the
//      current URL — set by Stripe Checkout's success redirect — and POSTs it
//      to /stripe/verify on the Worker to mint a real signed JWT.
//   3. `redirectToCheckout()` creates a Stripe Checkout session via the
//      Worker and redirects the browser there.
//   4. `verifyServerSide()` re-checks an existing JWT against the Worker's
//      signing key. Cheap (~50ms), called before opening premium UI.
//
// When the Worker is NOT configured (no `window.TRAINERS_CODEX_CONFIG.worker`
// set), all helpers either no-op or surface a clear error. The freemium
// preview toggle remains as a development affordance — see PosterStudioDialog
// / MerchStudioDialog. That makes the bundle work offline / on a static host
// without a paid worker.

import type { Pokemon } from './types';
import { trackCommerce } from './commerce-analytics';

export type LicensePlan = 'premium' | 'credits';

export interface LicenseClaims {
  iss: string;
  sub: string;
  email: string;
  plan: LicensePlan;
  stripe_session: string;
  iat: number;
  exp: number;
}

// Global Window.TRAINERS_CODEX_CONFIG is declared in lib/auth.ts as the
// single canonical type for the runtime config payload. We re-import only
// what we need here.

export const LICENSE_KEY = 'trainerscodex.license';
// The legacy/preview premium flag. Set by the in-app preview toggle on no-worker
// deploys, and by the owner quick-unlock below. Read on boot in App.tsx.
export const PREVIEW_PREMIUM_KEY = 'trainerscodex.premium';
// Credits live as a separate long-lived token: a Premium subscriber and a
// credit-pack buyer are independent entitlements, so we never overwrite one
// with the other. The KV balance is authoritative; this token only names the
// email-bucket to spend against.
export const CREDITS_TOKEN_KEY = 'trainerscodex.credits';
export const CREDITS_BALANCE_KEY = 'trainerscodex.credits.balance';
// When the stored license last passed a server-side re-verification. The
// client re-checks weekly so a cancelled subscription (revoked server-side,
// see worker/src/revocation.ts) loses premium within days, not at JWT expiry.
export const LICENSE_CHECKED_KEY = 'trainerscodex.license.checkedAt';
const REVERIFY_INTERVAL_MS = 7 * 24 * 3600 * 1000;

function getWorkerUrl(): string | null {
  const cfg = typeof window !== 'undefined' ? window.TRAINERS_CODEX_CONFIG : undefined;
  return cfg?.worker?.url ?? null;
}

export function isWorkerConfigured(): boolean {
  return !!getWorkerUrl();
}

/** Decode a JWT body without verifying the signature. Used for cheap boot checks. */
export function decodeLicense(jwt: string): LicenseClaims | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const padded = parts[1] + '==='.slice((parts[1].length + 3) % 4);
    const json = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as LicenseClaims;
    if (!claims.exp || typeof claims.exp !== 'number') return null;
    return claims;
  } catch {
    return null;
  }
}

export function isLicenseValid(claims: LicenseClaims | null): boolean {
  if (!claims) return false;
  return claims.exp * 1000 > Date.now() && claims.plan === 'premium';
}

export function getStoredLicense(): { jwt: string; claims: LicenseClaims } | null {
  try {
    const raw = localStorage.getItem(LICENSE_KEY);
    if (!raw) return null;
    const claims = decodeLicense(raw);
    if (!isLicenseValid(claims)) {
      localStorage.removeItem(LICENSE_KEY);
      return null;
    }
    return { jwt: raw, claims: claims! };
  } catch {
    return null;
  }
}

export function storeLicense(jwt: string): LicenseClaims | null {
  const claims = decodeLicense(jwt);
  if (!isLicenseValid(claims)) return null;
  try {
    localStorage.setItem(LICENSE_KEY, jwt);
  } catch { /* private mode — the claims are returned regardless, so this session still works */ }
  return claims;
}

export function clearLicense(): void {
  try { localStorage.removeItem(LICENSE_KEY); } catch { /* nothing to clear if storage is denied */ }
}

// ── Credits token lifecycle ──────────────────────────────────────────────
// A credits token is shape-valid when it's unexpired and carries plan:'credits'.
// Unlike premium, an expired/invalid credits token is harmless to keep around,
// but we prune it so the UI doesn't show a stale "buy more" affordance.

export function isCreditsTokenValid(claims: LicenseClaims | null): boolean {
  if (!claims) return false;
  return claims.exp * 1000 > Date.now() && claims.plan === 'credits';
}

export function getStoredCreditsToken(): { jwt: string; claims: LicenseClaims } | null {
  try {
    const raw = localStorage.getItem(CREDITS_TOKEN_KEY);
    if (!raw) return null;
    const claims = decodeLicense(raw);
    if (!isCreditsTokenValid(claims)) {
      localStorage.removeItem(CREDITS_TOKEN_KEY);
      return null;
    }
    return { jwt: raw, claims: claims! };
  } catch {
    return null;
  }
}

export function storeCreditsToken(jwt: string): LicenseClaims | null {
  const claims = decodeLicense(jwt);
  if (!isCreditsTokenValid(claims)) return null;
  try { localStorage.setItem(CREDITS_TOKEN_KEY, jwt); } catch { /* private mode — claims are still returned for this session */ }
  return claims;
}

export function clearCreditsToken(): void {
  try {
    localStorage.removeItem(CREDITS_TOKEN_KEY);
    localStorage.removeItem(CREDITS_BALANCE_KEY);
  } catch { /* nothing to clear if storage is denied */ }
}

/** Cached balance so the UI has a number to show before /credits/balance returns. */
export function getCachedCreditBalance(): number {
  try {
    const raw = localStorage.getItem(CREDITS_BALANCE_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function setCachedCreditBalance(balance: number): void {
  try { localStorage.setItem(CREDITS_BALANCE_KEY, String(Math.max(0, Math.floor(balance)))); } catch { /* a cached balance is an optimisation, never the source of truth */ }
}

/**
 * Redirect the browser to Stripe Checkout for the Premium Pack.
 * Throws if the worker isn't configured.
 * On the way back, the browser will hit /?session_id=cs_... — handled by
 * `bootstrapFromCheckoutReturn()`.
 */
export async function redirectToCheckout(email?: string, term: 'monthly' | 'annual' = 'monthly'): Promise<void> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    throw new Error('Stripe checkout is not available — this deploy has no worker configured.');
  }

  const returnUrl = window.location.origin + window.location.pathname;
  const resp = await fetch(`${workerUrl}/stripe/checkout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnUrl, email, term }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Checkout creation failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const { url } = await resp.json() as { url: string };
  if (!url) throw new Error('Checkout response missing URL');
  window.location.href = url;
}

/**
 * Redirect to Stripe Checkout for a one-time AI-credit pack (no subscription).
 * `pack` is one of the catalog ids: 'single' | 'five' | 'twenty'.
 * On return the browser hits /?session_id=cs_...&credits=success — handled by
 * `bootstrapFromCheckoutReturn()`.
 */
export async function redirectToCreditsCheckout(pack: 'single' | 'five' | 'twenty', email?: string): Promise<void> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    throw new Error('Credit purchases are not available — this deploy has no worker configured.');
  }

  const returnUrl = window.location.origin + window.location.pathname;
  const resp = await fetch(`${workerUrl}/credits/checkout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pack, returnUrl, email }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Credit checkout failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const { url } = await resp.json() as { url: string };
  if (!url) throw new Error('Credit checkout response missing URL');
  window.location.href = url;
}

/**
 * Fetch the live credit balance for a stored credits token. Premium tokens
 * report `balance: null` (their entitlement is the monthly quota). Updates the
 * cached balance as a side effect. Returns null if no balance is applicable.
 */
export async function fetchCreditBalance(jwt: string): Promise<number | null> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) return null;
  try {
    const resp = await fetch(`${workerUrl}/credits/balance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { plan: string; balance: number | null };
    if (typeof data.balance === 'number') {
      setCachedCreditBalance(data.balance);
      return data.balance;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Called on app boot. Looks for `?session_id=cs_...&checkout=success` in the
 * URL, exchanges it for a license, stores it, and cleans the URL.
 * Returns the parsed claims if a successful exchange happened, null otherwise.
 */
export async function bootstrapFromCheckoutReturn(): Promise<LicenseClaims | null> {
  try {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const checkoutFlag = params.get('checkout');
    const creditsFlag = params.get('credits');
    if (!sessionId || (checkoutFlag !== 'success' && creditsFlag !== 'success')) return null;

    const workerUrl = getWorkerUrl();
    if (!workerUrl) return null;

    const cleanReturnUrl = () => {
      // Drop the one-time return params so a refresh doesn't re-verify.
      params.delete('session_id');
      params.delete('checkout');
      params.delete('credits');
      const cleanUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '') + window.location.hash;
      window.history.replaceState(null, '', cleanUrl);
    };

    // Credit-pack return → /credits/verify mints a credits token + balance.
    if (creditsFlag === 'success') {
      const resp = await fetch(`${workerUrl}/credits/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!resp.ok) {
        console.warn('[license] credits verify failed', await resp.text());
        cleanReturnUrl();
        return null;
      }
      const { token, balance } = await resp.json() as { token: string; balance: number };
      const claims = storeCreditsToken(token);
      if (typeof balance === 'number') setCachedCreditBalance(balance);
      if (claims) trackCommerce({ event: 'credits_purchased', balance: balance ?? 0 });
      cleanReturnUrl();
      return claims;
    }

    // Premium subscription return → /stripe/verify mints the license JWT.
    const resp = await fetch(`${workerUrl}/stripe/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (!resp.ok) {
      console.warn('[license] verify failed', await resp.text());
      cleanReturnUrl();
      return null;
    }
    const { license } = await resp.json() as { license: string };
    const claims = storeLicense(license);
    if (claims) {
      // >90 days of TTL can only be the annual plan (monthly mints 31d).
      const days = (claims.exp - claims.iat) / 86400;
      trackCommerce({ event: 'purchase_completed', plan: 'premium', term: days > 90 ? 'annual' : 'monthly' });
      try { localStorage.setItem(LICENSE_CHECKED_KEY, String(Date.now())); } catch { /* best effort */ }
    }
    cleanReturnUrl();
    return claims;
  } catch (e) {
    console.warn('[license] bootstrap failed', e);
    return null;
  }
}

/**
 * Re-verify a stored license server-side. Called before opening premium UI
 * for a defense-in-depth check that the stored JWT was actually signed by
 * the worker (the client-side decode only checks shape + expiry).
 */
export async function verifyServerSide(jwt: string): Promise<boolean> {
  return (await verifyServerSideDetailed(jwt)) !== 'invalid';
}

/**
 * Tri-state server verification. The distinction matters for revocation:
 * 'invalid' means the Worker examined the token and rejected it (bad
 * signature, expired, or REVOKED after a cancelled subscription) — the client
 * must clear it. 'unreachable' means we simply couldn't ask (offline, worker
 * down) — the client must NOT punish the user for our availability, so the
 * stored license stands until a definitive answer arrives.
 */
export async function verifyServerSideDetailed(jwt: string): Promise<'valid' | 'invalid' | 'unreachable'> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) return isLicenseValid(decodeLicense(jwt)) ? 'valid' : 'invalid';

  try {
    const resp = await fetch(`${workerUrl}/license/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jwt }),
    });
    // Only a 200 with an explicit verdict is a verdict. 5xx/429 are the
    // worker's problem, not the license's.
    if (!resp.ok) return 'unreachable';
    const { valid } = await resp.json() as { valid: boolean };
    return valid ? 'valid' : 'invalid';
  } catch {
    return 'unreachable';
  }
}

/**
 * Weekly license re-verification, called once on boot when a stored license
 * exists. Returns 'revoked' when the license was definitively rejected (the
 * caller flips premium off and clears storage), 'ok' otherwise.
 *
 * Cadence, not every boot: the offline single-file bundle is a headline
 * feature and a boot-blocking network check would break it; weekly keeps the
 * revocation tail short (a cancelled annual is out within 7 days instead of
 * 366) at zero cost to the offline path.
 */
export async function maybeReverifyLicense(jwt: string): Promise<'ok' | 'revoked'> {
  let last = 0;
  try { last = parseInt(localStorage.getItem(LICENSE_CHECKED_KEY) || '0', 10) || 0; } catch { /* unreadable → recheck */ }
  if (Date.now() - last < REVERIFY_INTERVAL_MS) return 'ok';

  const verdict = await verifyServerSideDetailed(jwt);
  if (verdict === 'valid') {
    try { localStorage.setItem(LICENSE_CHECKED_KEY, String(Date.now())); } catch { /* best effort */ }
    return 'ok';
  }
  if (verdict === 'invalid') {
    clearLicense();
    trackCommerce({ event: 'license_revoked' });
    return 'revoked';
  }
  // 'unreachable' — leave the license and the timestamp alone; we'll ask again
  // next boot until we get a real answer.
  return 'ok';
}

/**
 * Owner/dev quick-unlock. Reads a `unlock=` directive from either the query
 * string (`?unlock=premium`) or the hash (`#unlock=premium`) and flips the
 * local preview-premium flag accordingly — independent of whether a Stripe
 * Worker is configured. This lets the owner exercise every premium-gated
 * surface (poster styles, merch designs, HOME sprites) without a purchase, and
 * `unlock=off` locks back down to compare the free experience.
 *
 * Returns 'unlocked' | 'locked' when a directive was applied (so the caller can
 * toast + flip React state), or null when no directive was present. The token
 * is stripped from the URL either way so a refresh doesn't re-trigger it.
 *
 * This is a deliberate soft backdoor for pre-launch testing. It only grants the
 * *client-side* preview flag — it cannot mint a server-signed license, so it
 * never unlocks Worker-gated AI generation (that still needs real credits).
 */
export function hasOwnerUnlock(): boolean {
  try { return localStorage.getItem(PREVIEW_PREMIUM_KEY) === 'true'; } catch { return false; }
}

export function applyOwnerUnlock(): 'unlocked' | 'locked' | null {
  try {
    const search = new URLSearchParams(window.location.search);
    const hash = window.location.hash || '';
    const hashMatch = hash.match(/(?:^#|[#&])unlock=([a-z0-9]+)/i);
    const directive = (search.get('unlock') || hashMatch?.[1] || '').toLowerCase();
    if (!directive) return null;

    const strip = () => {
      search.delete('unlock');
      const newHash = hash.replace(/(^#|[#&])unlock=[a-z0-9]+/i, (_m, p1) => (p1 === '#' ? '#' : p1 === '&' ? '' : ''))
        .replace(/#&/, '#').replace(/#$/, '');
      const qs = search.toString();
      const url = window.location.pathname + (qs ? `?${qs}` : '') + (newHash && newHash !== '#' ? newHash : '');
      window.history.replaceState(null, '', url);
    };

    if (directive === 'off' || directive === 'lock' || directive === 'free') {
      try {
        localStorage.removeItem(PREVIEW_PREMIUM_KEY);
        localStorage.removeItem(LICENSE_KEY);
      } catch { /* ignore */ }
      strip();
      return 'locked';
    }
    // Any other value (premium / pro / on / 1 …) unlocks the preview flag.
    try { localStorage.setItem(PREVIEW_PREMIUM_KEY, 'true'); } catch { /* ignore */ }
    strip();
    return 'unlocked';
  } catch {
    return null;
  }
}

/**
 * Place a real Printful order via the worker. Uploads the print PNG and
 * creates a sync product with the design pre-attached. Falls back to the
 * URL-deeplink flow if the worker is unconfigured.
 */
export interface PrintfulOrderResult {
  storeUrl: string;
  dashboardUrl: string;
  productName: string;
  externalId: string;
  retail: string;
  designUrl: string;
}

export async function submitPrintfulOrder(opts: {
  productId: string;
  design: string;
  markup: number;
  metadata: { teamName?: string; gymName?: string; region?: string; trainer?: string };
  pngBlob: Blob;
  _pokemon?: Pokemon | null; // reserved for future per-mon attribution
}): Promise<PrintfulOrderResult> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    throw new Error('Printful API not configured — using URL-deeplink fallback.');
  }

  const form = new FormData();
  form.append('product', opts.productId);
  form.append('design', opts.design);
  form.append('markup', String(opts.markup));
  form.append('metadata', JSON.stringify(opts.metadata));
  form.append('file', opts.pngBlob, `${opts.productId}-${opts.design}.png`);

  const resp = await fetch(`${workerUrl}/printful/order`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Printful order failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  return await resp.json() as PrintfulOrderResult;
}

/**
 * BUYER merch checkout (POST /merch/checkout): uploads the print PNG, has the
 * Worker price the product server-side, and navigates to the returned
 * Stripe-hosted Checkout page (payment mode, shipping collected there).
 *
 * `expectedRetail` is the price the buyer was shown — the Worker refuses with
 * 409 `price_mismatch` when it drifts from the authoritative computation, so a
 * stale or tampered client can never silently mischarge.
 *
 * Behind the MERCH_CHECKOUT feature flag (default off) — see worker/src/merch.ts
 * for the full pipeline (R2 staging → Stripe → webhook → Printful DRAFT order).
 */
export async function startMerchCheckout(opts: {
  productId: string;
  design: string;
  markup: number;
  expectedRetail: number;
  metadata: { teamName?: string; gymName?: string; region?: string; trainer?: string };
  pngBlob: Blob;
}): Promise<void> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) throw new Error('checkout not configured');

  const form = new FormData();
  form.append('product', opts.productId);
  form.append('design', opts.design);
  form.append('markup', String(opts.markup));
  form.append('expectedRetail', opts.expectedRetail.toFixed(2));
  form.append('metadata', JSON.stringify(opts.metadata));
  form.append('returnUrl', window.location.origin + window.location.pathname);
  form.append('file', opts.pngBlob, `${opts.productId}-${opts.design}.png`);

  const resp = await fetch(`${workerUrl}/merch/checkout`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 409) {
      // Price drifted between render and click (e.g. a deploy changed base
      // costs). Reload picks up the new table — surface that, don't retry.
      throw new Error('the price just changed — refresh the page and try again');
    }
    throw new Error(`checkout failed (${resp.status}): ${body.slice(0, 200)}`);
  }
  const { url } = await resp.json() as { url: string };
  if (!url) throw new Error('checkout failed: no redirect URL');
  window.location.assign(url);
}

/**
 * Consume a merch-checkout return (`?merch=success|cancel`) — strips the
 * one-time params and reports which way the buyer came back. Runs on boot,
 * before `bootstrapFromCheckoutReturn` (which ignores merch sessions: they
 * carry `session_id` but no `checkout`/`credits` flag).
 */
export function consumeMerchReturn(): 'success' | 'cancel' | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('merch');
    if (flag !== 'success' && flag !== 'cancel') return null;
    params.delete('merch');
    params.delete('session_id');
    const cleanUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '') + window.location.hash;
    window.history.replaceState(null, '', cleanUrl);
    return flag;
  } catch {
    return null;
  }
}
