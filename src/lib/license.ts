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

export interface LicenseClaims {
  iss: string;
  sub: string;
  email: string;
  plan: 'premium';
  stripe_session: string;
  iat: number;
  exp: number;
}

// Global Window.TRAINERS_CODEX_CONFIG is declared in lib/auth.ts as the
// single canonical type for the runtime config payload. We re-import only
// what we need here.

export const LICENSE_KEY = 'trainerscodex.license';

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
  } catch {}
  return claims;
}

export function clearLicense(): void {
  try { localStorage.removeItem(LICENSE_KEY); } catch {}
}

/**
 * Redirect the browser to Stripe Checkout for the Premium Pack.
 * Throws if the worker isn't configured.
 * On the way back, the browser will hit /?session_id=cs_... — handled by
 * `bootstrapFromCheckoutReturn()`.
 */
export async function redirectToCheckout(email?: string): Promise<void> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    throw new Error('Stripe checkout is not available — this deploy has no worker configured.');
  }

  const returnUrl = window.location.origin + window.location.pathname;
  const resp = await fetch(`${workerUrl}/stripe/checkout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ returnUrl, email }),
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
 * Called on app boot. Looks for `?session_id=cs_...&checkout=success` in the
 * URL, exchanges it for a license, stores it, and cleans the URL.
 * Returns the parsed claims if a successful exchange happened, null otherwise.
 */
export async function bootstrapFromCheckoutReturn(): Promise<LicenseClaims | null> {
  try {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const checkoutFlag = params.get('checkout');
    if (!sessionId || checkoutFlag !== 'success') return null;

    const workerUrl = getWorkerUrl();
    if (!workerUrl) return null;

    const resp = await fetch(`${workerUrl}/stripe/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (!resp.ok) {
      console.warn('[license] verify failed', await resp.text());
      return null;
    }
    const { license } = await resp.json() as { license: string };
    const claims = storeLicense(license);

    // Clean the URL — drop the session_id and checkout params so a refresh
    // doesn't try to re-verify a one-time token.
    params.delete('session_id');
    params.delete('checkout');
    const cleanUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '') + window.location.hash;
    window.history.replaceState(null, '', cleanUrl);

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
  const workerUrl = getWorkerUrl();
  if (!workerUrl) return isLicenseValid(decodeLicense(jwt));

  try {
    const resp = await fetch(`${workerUrl}/license/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jwt }),
    });
    if (!resp.ok) return false;
    const { valid } = await resp.json() as { valid: boolean };
    return valid;
  } catch {
    return false;
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
