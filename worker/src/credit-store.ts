// Credit-pack catalog + KV-backed balance store for one-time AI generation
// credits (the alternative to a Premium subscription).
//
// Balances live in the same KV namespace as the AI monthly quota (AI_QUOTA_KV),
// under `credits:<email>`. The store is the single source of truth — a credit
// JWT only names which email-bucket to read, it never carries a balance.
//
// Kept import-free (operates on a KVNamespace, not the full Env) so it can be
// unit-tested with a tiny in-memory KV stub under `node --test`.

export interface CreditPack {
  credits: number;
  usd: string;        // display price, documentation only
  label: string;
  priceEnv: string;   // name of the Env var holding the Stripe Price ID
}

// pack id → definition. The Stripe Price IDs are supplied via env (see
// docs/STRIPE-PRODUCTS.md). Prices here are display-only; Stripe is authoritative.
export const CREDIT_PACKS: Record<string, CreditPack> = {
  single: { credits: 1,  usd: '1.99',  label: '1 credit',   priceEnv: 'STRIPE_PRICE_CREDITS_1'  },
  five:   { credits: 5,  usd: '6.99',  label: '5 credits',  priceEnv: 'STRIPE_PRICE_CREDITS_5'  },
  twenty: { credits: 20, usd: '19.99', label: '20 credits', priceEnv: 'STRIPE_PRICE_CREDITS_20' },
};

// Minimal KV surface we need — matches the Cloudflare KVNamespace shape used
// elsewhere, narrowed so this module needs no Worker types to compile/test.
export interface CreditKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

// Balances + grant markers persist ~13 months so an annual buyer's credits don't
// silently evaporate. (Premium monthly quota uses a separate, shorter TTL.)
const CREDIT_TTL = 400 * 24 * 3600;

function balanceKey(email: string): string {
  return `credits:${email.toLowerCase()}`;
}

export async function getCredits(kv: CreditKV, email: string): Promise<number> {
  const raw = await kv.get(balanceKey(email));
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Grant credits for a paid session. Idempotent: a per-session marker guarantees
// that webhook + browser-return verify (or webhook retries) never double-credit.
// Returns the resulting balance.
export async function grantCredits(kv: CreditKV, email: string, amount: number, sessionId: string): Promise<number> {
  const marker = `credit-grant:${sessionId}`;
  if (await kv.get(marker)) {
    return getCredits(kv, email);
  }
  const current = await getCredits(kv, email);
  const next = current + Math.max(0, Math.floor(amount));
  await kv.put(balanceKey(email), String(next), { expirationTtl: CREDIT_TTL });
  await kv.put(marker, '1', { expirationTtl: CREDIT_TTL });
  return next;
}

// Consume one credit. Returns ok:false when the balance is empty.
export async function consumeCredit(kv: CreditKV, email: string): Promise<{ ok: boolean; balance: number }> {
  const current = await getCredits(kv, email);
  if (current <= 0) return { ok: false, balance: 0 };
  const next = current - 1;
  await kv.put(balanceKey(email), String(next), { expirationTtl: CREDIT_TTL });
  return { ok: true, balance: next };
}

// Give a credit back when the downstream generation fails after consuming.
export async function refundCredit(kv: CreditKV, email: string): Promise<number> {
  const next = (await getCredits(kv, email)) + 1;
  await kv.put(balanceKey(email), String(next), { expirationTtl: CREDIT_TTL });
  return next;
}
