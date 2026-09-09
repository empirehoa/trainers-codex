// Commerce funnel analytics.
//
// The journey funnel has had events since v6 (src/journey/analytics.ts); the
// MONEY funnel had none — no paywall_shown, no checkout_started, no
// purchase_completed. You cannot tune a conversion rate you cannot see, and
// every pricing decision made without these numbers is a guess.
//
// Same non-negotiables as journey analytics, same transport, same reasons:
//   * fire-and-forget, never awaited, never throws into a caller
//   * NO PII — the anonymous per-browser session id and nothing else. No
//     emails, no Stripe ids, no names. Amounts are list prices, not secrets.
//   * silent no-op when Supabase isn't configured (offline bundle stays pure)
//
// Table: `commerce_events` (DDL in docs/JOURNEY_MODE.md § Analytics, next to
// journey_events — RLS anon INSERT only, no select).
//
// Funnel shape these events reconstruct:
//   paywall_shown → checkout_started → purchase_completed  (premium/credits)
//   merch_render_started → merch_checkout_started → merch_order_paid (server logs)

import { sessionId } from '@/journey/analytics';

const TABLE = 'commerce_events';

/** Where a paywall or checkout was initiated from — the funnel's dimension. */
export type CommerceSurface =
  | 'ai-studio'          // hard paywall on AI generation
  | 'poster-style'       // locked poster style selected
  | 'sprite-variant'     // HOME/animated sprite lock in member config
  | 'saved-teams'        // 4th team save refused on the free tier
  | 'journey-archive'    // past daily issue locked
  | 'journey-saves'      // career save slots beyond the free one
  | 'legend-finish'      // premium Legend Card finish selected
  | 'merch-studio'       // merch flow
  | 'header'             // the generic premium control
  | 'other';

export type CommerceEventProps =
  /** A locked surface was actually seen — the top of the funnel. */
  | { event: 'paywall_shown'; surface: CommerceSurface }
  /** The user clicked through to Stripe Checkout. */
  | { event: 'checkout_started'; surface: CommerceSurface; plan: 'premium' | 'credits' | 'merch'; term?: 'monthly' | 'annual'; pack?: string; valueUsd?: number }
  /** A verified premium purchase landed (post-/stripe/verify). */
  | { event: 'purchase_completed'; plan: 'premium'; term: 'monthly' | 'annual' }
  /** A verified credit-pack purchase landed (post-/credits/verify). */
  | { event: 'credits_purchased'; balance: number }
  /** A returning browser booted with a still-valid stored license. */
  | { event: 'license_restored'; daysLeft: number }
  /** A stored license failed server re-verification and was cleared. */
  | { event: 'license_revoked' }
  /** A print-ready merch render was produced (intent signal). */
  | { event: 'merch_render_started'; product: string; design: string }
  /** The seller-side sync-product order was submitted. */
  | { event: 'merch_order_submitted'; product: string; design: string; valueUsd: number };

function getRest(): { url: string; anonKey: string } | null {
  const cfg = typeof window !== 'undefined' ? window.TRAINERS_CODEX_CONFIG : undefined;
  const sb = cfg?.supabase;
  if (!sb?.url || !sb.anonKey) return null;
  return { url: sb.url.replace(/\/$/, ''), anonKey: sb.anonKey };
}

// paywall_shown fires from render paths; a dialog that re-renders must not
// spam a row per render. One event per (surface, page-load) is the honest
// measure of "a human saw a lock".
const shownThisLoad = new Set<string>();

export function trackCommerce(props: CommerceEventProps): void {
  if (props.event === 'paywall_shown') {
    if (shownThisLoad.has(props.surface)) return;
    shownThisLoad.add(props.surface);
  }

  const rest = getRest();
  if (!rest) return;

  const { event, ...rest_props } = props;
  const body = JSON.stringify([{
    event,
    session_id: sessionId(),
    props: rest_props,
    created_at: new Date().toISOString(),
  }]);

  try {
    void fetch(`${rest.url}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: rest.anonKey,
        authorization: `Bearer ${rest.anonKey}`,
        prefer: 'return=minimal',
      },
      body,
      keepalive: true,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    }).catch(() => { /* offline, blocked, RLS refusal — drop it */ });
  } catch {
    // Constructing the request can throw in locked-down environments.
  }
}

/** Test hook: reset the per-load paywall dedupe. */
export function __resetPaywallDedupe(): void {
  shownThisLoad.clear();
}
