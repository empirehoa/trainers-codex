# Stripe Products — Trainer's Codex

This is the **single source of truth** for every Stripe object the Worker
expects, and the exact values to create them with. The code is already written
and deployed against the env-var names below — **nothing in the app works until
these products/prices exist and their IDs are set as Worker vars/secrets.**

> **Do this in TEST mode first** (`sk_test_…`, `price_…` test IDs), verify the
> full buy → generate flow, then repeat in LIVE mode and swap the Worker env.

There are two independent monetization surfaces:

| Surface | Stripe mode | What the buyer gets |
|---|---|---|
| **Premium Pack** (subscription) | `subscription` | 5 AI generations *per kind* per month + all premium poster/merch designs |
| **AI Credit Packs** (one-time) | `payment` | N one-time AI generations, no subscription. Printing is free for everyone. |

---

## 1. Premium Pack (subscription) — 2 prices, 1 product

**Product**

- **Name:** `Trainer's Codex Premium Pack`
- **Description:** `Premium Pack — 5 AI generations per kind each month, plus all premium poster styles, merch designs, and 3D HOME sprites.`
- **Tax code:** Digital goods / SaaS (`txcd_10000000`) if you enable Stripe Tax.

**Price A — Monthly**

| Field | Value |
|---|---|
| Amount | `499` (cents → **$4.99**) |
| Currency | `usd` |
| Billing | Recurring, `interval = month` |
| Nickname | `Premium Pack Monthly` |
| → set as Worker var | **`STRIPE_PRICE_ID`** |

**Price B — Annual**

| Field | Value |
|---|---|
| Amount | `3900` (cents → **$39.00**) |
| Currency | `usd` |
| Billing | Recurring, `interval = year` |
| Nickname | `Premium Pack Annual` |
| → set as Worker var | **`STRIPE_PRICE_ANNUAL`** |

> Annual is optional. If `STRIPE_PRICE_ANNUAL` is unset, the client's "$39/yr"
> button silently falls back to the monthly price (see `worker/src/stripe.ts`).

---

## 2. AI Credit Packs (one-time) — 3 prices, 1 product

These use Checkout in `mode: payment` (no subscription). The credit count is
carried in **price/session metadata** and granted by the webhook + `/credits/verify`.

**Product**

- **Name:** `Trainer's Codex AI Credits`
- **Description:** `One-time AI generation credits. Each credit makes one AI image (trainer card, team art, or codex card). Credits never expire for ~13 months.`

**Prices** (all one-time, `currency = usd`, no `recurring`)

| Pack id (app) | Credits | Amount (cents) | Display | Nickname | → Worker var |
|---|---|---|---|---|---|
| `single` | 1 | `199` | **$1.99** | `1 AI Credit` | **`STRIPE_PRICE_CREDITS_1`** |
| `five` | 5 | `699` | **$6.99** | `5 AI Credits` | **`STRIPE_PRICE_CREDITS_5`** |
| `twenty` | 20 | `1999` | **$19.99** | `20 AI Credits` | **`STRIPE_PRICE_CREDITS_20`** |

> The credit **counts** above are also hard-coded in
> `worker/src/credit-store.ts` (`CREDIT_PACKS`). The Stripe price is the
> authority for **amount charged**; the code is the authority for **credits
> granted**. Keep the two tables in sync if you ever re-price.

---

## 3. Webhook endpoint (shared by both surfaces)

One endpoint handles subscription lifecycle **and** credit-pack grants.

| Field | Value |
|---|---|
| URL | `https://trainers-codex-api.jrriestra.workers.dev/stripe/webhook` |
| Events | `checkout.session.completed`, `customer.subscription.deleted`, `customer.subscription.updated`, `invoice.payment_failed` |
| → set as Worker secret | **`STRIPE_WEBHOOK_SECRET`** (the `whsec_…` shown once at creation) |

`checkout.session.completed` is where credit packs are actually granted (the
browser may never return). Grants are idempotent on the Stripe session id, so
the webhook + the browser's `/credits/verify` can both fire without
double-crediting.

---

## 4. The full env-var checklist

Set on the Worker (vars in `wrangler.toml`, secrets via `wrangler secret put`):

```
# Secrets (wrangler secret put …)
STRIPE_SECRET_KEY          = sk_live_…        # or sk_test_… while testing
STRIPE_WEBHOOK_SECRET      = whsec_…

# Vars (prices)
STRIPE_PRICE_ID            = price_…          # $4.99/mo  (required)
STRIPE_PRICE_ANNUAL        = price_…          # $39/yr    (optional)
STRIPE_PRICE_CREDITS_1     = price_…          # $1.99 → 1 credit
STRIPE_PRICE_CREDITS_5     = price_…          # $6.99 → 5 credits
STRIPE_PRICE_CREDITS_20    = price_…          # $19.99 → 20 credits
```

If a credit price var is **missing**, that pack's checkout returns
`503 credits_not_configured` (the others still work). If the subscription price
is missing, premium checkout fails — so `STRIPE_PRICE_ID` is the only hard
requirement.

---

## 5. Automated provisioning (optional)

`scripts/setup-stripe-live.sh` is idempotent and now provisions **all** of the
above (premium monthly + annual, the three credit packs, and the webhook),
printing every `price_…` id and the `whsec_…` secret. Prereqs: `stripe login`
done and the account activated for live payments. Run it, then paste the
printed ids into the Worker env per the checklist above.

The script never sets `STRIPE_SECRET_KEY` for you — Stripe never exposes
`sk_live_…`. Set that one yourself with `wrangler secret put STRIPE_SECRET_KEY`.

---

## 6. End-to-end test checklist

Run these in TEST mode before flipping to live:

- [ ] `/credits/checkout {pack:'single'}` → returns a Checkout URL
- [ ] Pay with `4242 4242 4242 4242` → redirected back with `?credits=success&session_id=cs_test_…`
- [ ] App shows toast "credits added", AI Studio shows balance `1`
- [ ] Generate once → balance drops to `0`, AI Studio re-shows the paywall
- [ ] Buy the `five` pack → balance shows `5`
- [ ] Premium monthly checkout → app shows "premium unlocked", AI Studio hides paywall
- [ ] Premium annual checkout (if `STRIPE_PRICE_ANNUAL` set) → license TTL ~366 days
- [ ] Webhook log shows `granted N credits to <email>` for each credit purchase
- [ ] Re-deliver the same webhook event → balance unchanged (idempotency holds)

---

## 7. Verified production state (2026-06-11) — TWO ACCOUNTS, decisions needed

Probed the **live** Worker and both Stripe accounts directly. Findings:

**Production is wired and working — in TEST mode.**
- `POST https://trainers-codex-api.jrriestra.workers.dev/stripe/checkout` returns a
  valid Checkout URL with a **`cs_test_…`** session → the deployed
  `STRIPE_SECRET_KEY` is an **`sk_test_`** key. Real visitors who "subscribe"
  hit a **test** checkout and **no real money is collected.** (This matches
  `LAUNCH_PLAN.md`, which calls it the "$4.99/mo test product" for soft launch.)
- The deployed `STRIPE_PRICE_ID = price_1TcX6MF03KhWyMQ7cqs9OT9p` **is valid**
  for the deployed account and premium checkout succeeds. `wrangler.toml` is
  **consistent** with the deployed account — *not* stale, as previously feared.

**There are two distinct Stripe accounts in play:**

| | Account A — **production** | Account B — local CLI |
|---|---|---|
| Account id (suffix) | `…F03KhWyMQ7` | `acct_1TbohkF3S2NCbljb` ("Trainers Codex") |
| Used by | the **deployed Worker** (secret key + price + webhook) | the `stripe` CLI on this Mac |
| Premium price | `price_1TcX6M…` (test, works) | `price_1Tgt5U…` ($4.99/mo test) |
| Annual price | — (not in `wrangler.toml`) | `price_1Tgt5V…` ($39/yr test) |
| Credit packs | — (none wired → `/credits/*` returns `503`) | `price_1Tgt5X/Y/Z…` (1/5/20, test) |

The 5 prices created by `scripts/setup-stripe-live.sh` (or by hand) landed in
**Account B**, but production runs on **Account A**. That's why credit-pack
checkout returns `503 credits_not_configured` in production: Account A has no
credit prices wired into `wrangler.toml`.

**Decisions only Jose can make (money infrastructure — not done autonomously):**

1. **Which account is canonical — A or B?** If A, create the annual + 3 credit
   prices *in Account A* and add their ids to `wrangler.toml`. If B, repoint the
   Worker's `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to Account B and set
   the five `price_1Tgt5…` ids.
2. **Go live for real money.** Production is in TEST mode today. To collect
   revenue: provision **live-mode** prices in the canonical account, then
   `wrangler secret put STRIPE_SECRET_KEY` (`sk_live_…`), set the live
   `STRIPE_PRICE_ID` (+ annual + credit ids) in `wrangler.toml`, add the live
   webhook secret, and redeploy.

> ⚠️ Do **not** redeploy the Worker from the current tree expecting no change to
> billing — the deployed account/prices are correct, but any change to the
> Stripe vars/secrets directly affects what buyers are charged. Stage and
> approve before deploying Stripe changes.
