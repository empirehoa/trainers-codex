// Build provenance + deployment integrity.
//
// ── Be honest about what this can and cannot do ───────────────────────────
// This app is client-side. Anyone can read the shipped bundle — that is how
// the web works, and no amount of obfuscation changes it. Nothing in this file
// PREVENTS copying. What it does is make copying (a) legally unambiguous,
// (b) provable, and (c) commercially useless:
//
//   * A copyright banner survives into the built artifact, so a copy carries
//     our notice with it and "I didn't know" stops being a defence.
//   * A build fingerprint gives us a stable marker to point at in a DMCA
//     notice — "this deployment serves EMG build <hash>".
//   * `isAuthorizedHost()` lets the app notice it is being served from a host
//     we don't operate. It is a soft signal, not DRM: it degrades cosmetics
//     and reports, it never breaks the app for a legitimate offline user.
//
// The real moat is elsewhere and by design: every monetizable path (Stripe
// checkout, Printful ordering, AI generation, premium licensing) runs through
// the Cloudflare Worker, keyed to secrets that never ship to the browser. A
// stolen bundle is a toy — it cannot take a payment or place an order.

/** Injected at build time by vite.config.ts `define`. */
declare const __TC_BUILD__: string;

export const BUILD_ID: string = (() => {
  try {
    return typeof __TC_BUILD__ === 'string' ? __TC_BUILD__ : 'dev';
  } catch {
    return 'dev';
  }
})();

export const COPYRIGHT =
  'Trainer’s Codex © 2026 Empire Management Group, LLC. All rights reserved. '
  + 'Unauthorized redeployment prohibited — legal@trainerscodex.com';

/** Hosts EMG operates. Anything else is an unauthorized deployment. */
const AUTHORIZED_HOSTS = [
  'trainerscodex.com',
  'www.trainerscodex.com',
  'tiny-fire-5e03.jrriestra.workers.dev',
];

/**
 * Is this page being served from a host we operate?
 *
 * Local development, `file://` (the offline single-file bundle is a headline
 * feature), and localhost all count as authorized — a user running our bundle
 * offline is exactly who we built it for. Only a real, foreign http(s) origin
 * is treated as unauthorized.
 */
export function isAuthorizedHost(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const { protocol, hostname } = window.location;
    if (protocol === 'file:' || !hostname) return true;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) return true;
    return AUTHORIZED_HOSTS.includes(hostname.toLowerCase());
  } catch {
    return true;
  }
}

/**
 * Write the notice into the console and a DOM comment.
 *
 * Deliberately non-blocking and non-destructive: a mirrored copy still runs,
 * it just carries our attribution and identifies itself when we look at it.
 */
export function stampProvenance(): void {
  if (typeof document === 'undefined') return;
  try {
    document.documentElement.setAttribute('data-tc-build', BUILD_ID);
    document.documentElement.prepend(
      document.createComment(` ${COPYRIGHT} build:${BUILD_ID} `),
    );
    if (!isAuthorizedHost()) {
      // Visible in the console of any mirror, and a hook for support tickets
      // that turn out to be about someone else's copy.
       
      console.warn(
        `${COPYRIGHT}\nThis appears to be an unauthorized copy served from `
        + `${window.location.hostname}. The official app is https://trainerscodex.com`,
      );
    }
  } catch {
    // Never let attribution break the app.
  }
}
