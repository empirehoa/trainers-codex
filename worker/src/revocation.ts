// License revocation — the missing half of the subscription lifecycle.
//
// The license JWT is stateless: once minted it is valid until `exp`, and an
// annual license lives 366 days. Before this module, a subscriber who
// cancelled (or whose final payment failed) kept full premium for the entire
// remaining JWT lifetime, because the webhook handler for
// `customer.subscription.deleted` was a console.log. That is a revenue leak
// with a one-year tail.
//
// Mechanism — two tiny KV records, both written best-effort:
//
//   sub2sess:<subscription_id> → <checkout_session_id>
//     Written when `checkout.session.completed` arrives for a premium
//     subscription. The JWT carries the checkout session id (not the
//     subscription id), so this mapping is what lets a subscription-scoped
//     webhook find the license it must kill.
//
//   revoked:<checkout_session_id> → ISO timestamp
//     Written when the subscription is actually terminated. Checked by
//     `licenseVerify` (the client re-verifies on a cadence) and by the AI
//     entitlement gate, so a revoked license loses both the premium UI and
//     the metered AI quota.
//
// Deliberately NOT revoked: `cancel_at_period_end` updates. A subscriber who
// cancels mid-cycle has paid through the period; Stripe fires
// `customer.subscription.deleted` when the period actually ends, and that is
// the moment entitlement stops.
//
// KV is the AI quota namespace (AI_QUOTA_KV) under distinct prefixes — one
// more namespace binding would buy nothing. When the KV binding is absent
// (self-host without AI), revocation degrades to the old behaviour: licenses
// run to `exp`. That is an accepted self-host tradeoff, logged loudly.

const SUB_PREFIX = 'sub2sess:';
const REVOKED_PREFIX = 'revoked:';

// A license can be at most 366 days old; keep tombstones a hair longer so a
// revoked annual can never outlive its tombstone.
const REVOKED_TTL_SECONDS = 400 * 24 * 3600;
const MAPPING_TTL_SECONDS = 400 * 24 * 3600;

export async function recordSubscriptionSession(
  kv: KVNamespace | undefined,
  subscriptionId: string | null | undefined,
  sessionId: string | null | undefined,
): Promise<void> {
  if (!kv || !subscriptionId || !sessionId) return;
  await kv.put(`${SUB_PREFIX}${subscriptionId}`, sessionId, { expirationTtl: MAPPING_TTL_SECONDS });
}

/**
 * Revoke whatever license was minted from the given subscription's checkout
 * session. Returns the revoked session id, or null when no mapping existed
 * (webhook ordering, pre-revocation purchases, or KV disabled).
 */
export async function revokeBySubscription(
  kv: KVNamespace | undefined,
  subscriptionId: string | null | undefined,
): Promise<string | null> {
  if (!kv || !subscriptionId) return null;
  const sessionId = await kv.get(`${SUB_PREFIX}${subscriptionId}`);
  if (!sessionId) return null;
  await kv.put(`${REVOKED_PREFIX}${sessionId}`, new Date().toISOString(), {
    expirationTtl: REVOKED_TTL_SECONDS,
  });
  return sessionId;
}

/** Has the license minted from this checkout session been revoked? */
export async function isSessionRevoked(
  kv: KVNamespace | undefined,
  sessionId: string | null | undefined,
): Promise<boolean> {
  if (!kv || !sessionId) return false;
  return (await kv.get(`${REVOKED_PREFIX}${sessionId}`)) !== null;
}
