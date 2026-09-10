# Trainer's Codex — Deployment Runbook

This is the step-by-step you, Jose, follow to go from "files on disk" to
"live at trainerscodex.com." It's deliberately exhaustive — every screen,
every paste, every gotcha. Plan ~3 hours end-to-end the first time.

> **Domain recommendation (from research):** register **trainerscodex.com**.
> The `.com` is available at ~$12 year-1 / ~$22 renewal, has clean trademark
> surface, no name collisions, and de-risks Stripe verification later.
> See `docs/SECURITY.md` for the full domain audit.

## Release in one command

Everything below this section is the long-form runbook for the *first* deploy.
Once the accounts exist, a release is one script run from the repo root on the
Mac:

```bash
# once: the runtime config, kept out of git (.env.deploy is gitignored)
cat > .env.deploy <<'ENV'
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon public key>
WORKER_URL=https://trainers-codex-api.jrriestra.workers.dev
ENV

# every release
scripts/release.sh --all                      # push → deploy → verify
scripts/release.sh --all --bundle ~/Downloads/trainers-codex-v1.0-launch.bundle
                                              # same, but first fast-forward onto a git bundle
scripts/release.sh --deploy --dry-run         # print the plan, run nothing
```

`scripts/release.sh` refuses to deploy unless the tree is clean, the branch is
`claude/monetization-v1`, `pnpm lint` has 0 errors, `bundle.html` is under the
2,150,400-byte cap and `npx wrangler whoami` succeeds. It deploys the API
worker first, then the site (`deploy/frontend-wrangler.toml` over
`/tmp/tc-deploy`, staged by `scripts/inject-config.mjs`), and never prints a
secret.

`--verify` runs `scripts/smoke-live.mjs --browser` against production: the
shell has its config and static first paint, `/pokemon/gengar/` is the static
page, the sitemap has 1,330 URLs, `sw.js` / the manifest carry the right MIME
types, CSP + HSTS + `X-Frame-Options` are on every route, the worker refuses
foreign origins and keeps merch dark, an `alg:none` license is never valid,
and `?unlock=premium` is inert in a real browser. It prints a PASS/FAIL table
and exits non-zero on any failure; run it on its own any time with
`node scripts/smoke-live.mjs --browser` (`SITE=` / `API=` override the
targets; `--skip-worker`, `--skip-site` narrow it). Requests are spaced one per
second.

If a probe still shows the previous build after a deploy: Cloudflare → Caching
→ Purge Everything, then `scripts/release.sh --verify` again.

---

## Prerequisites

You'll need accounts on:

- GoDaddy (or any domain registrar — GoDaddy is your preference)
- Cloudflare (free tier covers everything — Pages, Workers, R2, KV, DNS)
- Supabase (free tier — 50k MAU, 500MB Postgres)
- Stripe (no monthly fee — pay-per-transaction)
- Printful (no monthly fee — pay-per-order, base cost only)
- Plausible Analytics (optional — $9/mo)

Total monthly fixed cost at launch: **$0** (Plausible optional → $9/mo).

---

## Phase 1 — Register the domain (10 min)

1. Go to https://www.godaddy.com/ and search `trainerscodex.com`.
2. Add to cart. **Decline every upsell** — domain privacy is free on GoDaddy
   since 2023, no need for "Domain Protection". You don't need their hosting,
   email, or SSL — Cloudflare does all of that.
3. Buy 1-year ($12 promo). Auto-renewal can stay on.
4. Once purchased, in GoDaddy → My Products → DNS → click `trainerscodex.com`.
   Leave the nameservers alone for now — Cloudflare will give you replacements
   in Phase 3.

---

## Phase 2 — Build the bundle (5 min)

```bash
cd ~/projects/trainers-codex
pnpm install        # ~30s, once
pnpm build          # ~5s, every deploy
node inline.mjs     # ~1s, every deploy
ls -lh bundle.html  # should be ~1.21 MB
```

Sanity-check the bundle:

```bash
# Should print "✓ bundle.html: 1213.8 KB" (or similar)
# Should be byte-identical to the prior shipped one if no code changed
shasum -a 256 bundle.html
```

If you ever need to ship without the worker (offline demo, static host,
no Stripe/Printful), this is the complete artifact. Just drop `bundle.html`
on any web server.

---

## Phase 3 — Cloudflare Pages deploy (20 min)

### 3a. Connect your domain to Cloudflare

1. Go to https://dash.cloudflare.com/ → "Add a site" → enter `trainerscodex.com`.
2. Pick the **Free** plan.
3. Cloudflare will scan existing DNS and give you 2 nameservers like:
   - `nina.ns.cloudflare.com`
   - `walt.ns.cloudflare.com`
4. Back in GoDaddy → DNS for `trainerscodex.com` → "Change Nameservers" →
   "I'll use my own nameservers" → paste the 2 Cloudflare ones. Save.
5. Wait 5–60 minutes for DNS propagation. Cloudflare will email when active.

### 3b. Create the Pages project

1. Cloudflare dashboard → "Workers & Pages" → "Create" → "Pages" → "Upload assets".
2. Project name: `trainers-codex` (becomes `trainers-codex.pages.dev`).
3. Production branch: leave default.
4. Upload — drag `bundle.html` and the `public/` folder contents into the
   browser drop zone. Cloudflare will:
   - Treat `bundle.html` as the entry point (rename to `index.html` during
     upload, or upload as `index.html` directly — see note below).
   - Pick up `public/_headers` automatically for security headers.
   - Pick up `public/robots.txt` automatically.

> **Note on filename:** Pages serves `index.html` by default at `/`. Either
> (a) rename `bundle.html` → `index.html` before uploading, or (b) upload it as
> `index.html`, or (c) add a Pages function redirect. (a) is simplest. To
> automate: `cp bundle.html /tmp/deploy/index.html && cp -r public/* /tmp/deploy/ && open https://dash.cloudflare.com/...`

5. Click "Deploy". Wait ~30s.
6. The preview URL `https://trainers-codex.pages.dev` should now be live.
   Open it — you should see the codex with v5.0 features.

### 3c. Bind your custom domain

1. Pages → `trainers-codex` → "Custom domains" → "Set up a custom domain" → `trainerscodex.com`.
2. Cloudflare automatically adds the CNAME (root) + AAAA records.
3. SSL certificate auto-provisions in ~2 minutes.
4. Open https://trainerscodex.com — bundle should load with valid HTTPS.
5. Add `www.trainerscodex.com` as a second custom domain → redirect 301 to apex.

### 3d. Verify security headers

```bash
curl -sI https://trainerscodex.com/ | grep -iE "content-security|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy"
```

Should print 6 headers. If any are missing, double-check `public/_headers`
made it into the upload.

---

## Phase 4 — Supabase auth + cloud sync (30 min)

### 4a. Create the project

1. https://supabase.com/dashboard → "New project".
2. Name: `trainerscodex-prod`.
3. Database password: generate via `openssl rand -base64 32`, paste, **save
   in 1Password / Bitwarden** — you won't be shown this again.
4. Region: `us-east-1` (or closest to your buyers).
5. Free plan. Click "Create new project". Wait ~2 min for provisioning.

### 4b. Schema

Supabase dashboard → SQL Editor → "New query". Paste this verbatim and click
"Run":

```sql
-- Trainer's Codex user_data table — one row per user, holds trainer profile + saved teams.
create table user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trainer jsonb,
  teams jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

-- Row Level Security: each user can only read/write their own row.
alter table user_data enable row level security;

create policy "users see own" on user_data
  for select using (auth.uid() = user_id);

create policy "users update own" on user_data
  for insert with check (auth.uid() = user_id);

create policy "users modify own" on user_data
  for update using (auth.uid() = user_id);

-- Optional: index on updated_at for future "recently active users" queries.
create index user_data_updated_at_idx on user_data(updated_at desc);

-- Confirm the policies installed correctly.
select tablename, policyname, cmd, qual from pg_policies where tablename = 'user_data';
```

You should see 3 rows back (SELECT, INSERT, UPDATE policies).

### 4c. Enable OAuth providers

Supabase dashboard → "Authentication" → "Providers".

For each of these, flip the toggle ON and paste the credentials:

| Provider | Where to get credentials | What to paste |
|---|---|---|
| **Google** | https://console.cloud.google.com/ → OAuth 2.0 → Web app | Client ID + Client Secret |
| **GitHub** | https://github.com/settings/developers → OAuth Apps | Client ID + Client Secret |
| **Discord** | https://discord.com/developers/applications → OAuth2 | Client ID + Client Secret |
| **Microsoft (Azure)** | https://entra.microsoft.com/ → App registrations | Application ID + Client Secret + Tenant ID |
| **Facebook** | https://developers.facebook.com/apps → Facebook Login | App ID + App Secret |
| **Twitter/X** | https://developer.twitter.com/portal → OAuth 2.0 | Client ID + Client Secret |

For each OAuth app, the **Redirect URI** to add is:
```
https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
```
(Supabase shows you the exact URL on the provider settings page.)

### 4d. Grab the keys

Supabase dashboard → "Project Settings" → "API". You'll see two values:

- **Project URL** → `https://abc123.supabase.co`
- **anon public key** → `eyJhbG...` (this is safe to embed in the client)

You'll paste these into the deployed bundle in Phase 7.

---

## Phase 5 — Stripe Premium Pack ($4.99/mo) (20 min)

### 5a. Create the product

1. https://dashboard.stripe.com/ → Products → Add product.
2. **Name:** `Trainer's Codex — Premium Pack`
3. **Description:** `Unlocks 6 premium poster styles, 2 premium merch designs, 3D HOME sprites, and cloud sync across devices.`
4. **Pricing:** Recurring, $4.99 USD, monthly billing.
5. Click "Save product". On the product page, copy the **Price ID** — it looks
   like `price_1ABC...`. Save it — you'll set `STRIPE_PRICE_ID` on the Worker.

### 5b. Configure tax (optional but recommended)

Stripe → Settings → Tax → enable "Automatic tax" for your registered states.
Costs $0.50 per taxable transaction. For US-only ops with no nexus outside FL,
you can defer this until $20k+ ARR.

### 5c. Get API keys

Stripe → Developers → API keys. You need:
- **Secret key** (`sk_live_...` once you're out of test mode, `sk_test_...` for testing)

Webhook secret comes after Phase 6.

---

## Phase 6 — Cloudflare Worker (Stripe + Printful API) (40 min)

### 6a. Install wrangler

```bash
cd ~/projects/trainers-codex/worker
pnpm install
pnpm exec wrangler login   # opens browser
```

### 6b. Provision Cloudflare resources

```bash
# KV namespace for rate limiting
pnpm exec wrangler kv:namespace create RATELIMIT_KV
# Output gives you an `id` — copy into worker/wrangler.toml under [[kv_namespaces]]

# R2 bucket for print PNGs
pnpm exec wrangler r2 bucket create trainerscodex-prints

# Expose the bucket publicly under a custom subdomain
# Cloudflare dashboard → R2 → trainerscodex-prints → Settings → "Public access" → enable
# Custom domain: cdn.trainerscodex.com → Add to Cloudflare DNS as CNAME → trainerscodex-prints.r2.cloudflarestorage.com
```

Edit `worker/wrangler.toml` and replace the placeholder IDs with the real ones
from the commands above.

### 6c. Set secrets

```bash
cd ~/projects/trainers-codex/worker

# Stripe — from Phase 5
pnpm exec wrangler secret put STRIPE_SECRET_KEY
# Paste sk_live_... (or sk_test_... for staging)

# JWT signing key — generate fresh
openssl rand -base64 32 | pnpm exec wrangler secret put JWT_SIGNING_KEY

# Printful — from Phase 8 (set after creating the API token)
# Skip for now; come back after Phase 8.

# Stripe webhook secret — set in 6e after creating the endpoint
```

### 6d. Deploy

```bash
cd ~/projects/trainers-codex/worker
pnpm exec wrangler deploy
```

Output gives you the worker URL: `https://trainers-codex-api.YOUR-ACCOUNT.workers.dev`

Smoke test:
```bash
curl https://trainers-codex-api.YOUR-ACCOUNT.workers.dev/health
# {"ok":true,"time":"2026-05-27T..."}
```

### 6e. Wire Stripe webhook

1. https://dashboard.stripe.com/ → Developers → Webhooks → "Add endpoint".
2. **Endpoint URL:** `https://trainers-codex-api.YOUR-ACCOUNT.workers.dev/stripe/webhook`
3. **Events:** select
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Click "Add endpoint". On the resulting page, click "Reveal" next to
   "Signing secret" — copy the `whsec_...` value.
5. Back in the terminal:

```bash
pnpm exec wrangler secret put STRIPE_WEBHOOK_SECRET
# Paste whsec_...
```

6. In `worker/wrangler.toml`, set `STRIPE_PRICE_ID` to the Price ID you saved
   in Phase 5a. Redeploy: `pnpm exec wrangler deploy`.

### 6f. Custom domain for the worker (optional but recommended)

Cloudflare dashboard → Workers & Pages → `trainers-codex-api` → "Triggers"
→ "Add Custom Domain" → `api.trainerscodex.com`.

This avoids exposing your account-id `*.workers.dev` URL in the deployed bundle.

---

## Phase 7 — Wire the bundle to Supabase + Stripe + Printful (10 min)

The deployed `index.html` needs a `<script>` block injecting the config. Edit
the deployed file (or rebuild with the script baked in — your call):

```html
<!-- Add this BEFORE the bundle's inline <script type="module"> block -->
<script>
  window.TRAINERS_CODEX_CONFIG = {
    supabase: {
      url: 'https://YOUR-PROJECT-REF.supabase.co',
      anonKey: 'eyJhbG...',
    },
    worker: {
      url: 'https://api.trainerscodex.com',  // or https://trainers-codex-api.YOUR-ACCOUNT.workers.dev
    },
  };
</script>
```

The simplest way: keep a small `deploy-template.html` in the repo that's just
this `<script>` block + a comment, and add a build step that concatenates it
into `bundle.html` before upload.

```bash
# Manual approach:
# 1. Open bundle.html in an editor
# 2. Find the `<script type="module">` line
# 3. Paste the config block immediately before it
# 4. Re-upload to Cloudflare Pages (drag-drop into the existing project)
```

After re-upload:
- Visit https://trainerscodex.com
- Click the sign-in icon (top right) — should now show the provider buttons
- Open Poster Studio → click a premium style → button should read
  "unlock with premium · $4.99/mo" (not the dev switch)

---

## Phase 8 — Printful POD integration (30 min)

### 8a. Create the account

1. https://www.printful.com/ → Sign up.
2. Once in the dashboard, **don't connect Shopify/Etsy yet** — we'll use
   Printful's native fulfillment via the API.
3. Settings → Stores → "Add store" → "Manual order platform / API" → Name it
   `Trainer's Codex`.
4. The store ID shows in the URL (`/stores/12345678/...`) — note it. You'll set
   `PRINTFUL_STORE_ID` on the Worker.

### 8b. Get the API token

1. Printful dashboard → "Developers" (bottom-left) → "Tokens" → "Create new token".
2. Scopes needed: `Stores: read & write`, `Sync products: read & write`,
   `File library: read & write`, `Catalog: read`.
3. Copy the token (it's only shown once).

```bash
cd ~/projects/trainers-codex/worker
pnpm exec wrangler secret put PRINTFUL_API_KEY
# Paste the token

# Set the store ID in wrangler.toml
# Edit PRINTFUL_STORE_ID = "12345678" under [vars]
pnpm exec wrangler deploy
```

### 8c. Test the API path

In the deployed bundle:
1. Build a team of 6.
2. Open Merch Studio.
3. Pick "Bella+Canvas Unisex T-Shirt" + "Champion Roster" design.
4. Click "Order on Printful".
5. The worker should:
   - Accept your PNG upload (~3-5s).
   - Create a sync product in your Printful store.
   - Return a `dashboardUrl` that opens the Printful product page with the
     design already attached.

If the response says `printful_not_configured`, the API key isn't set or
the worker hasn't redeployed. Re-run `wrangler deploy`.

### 8d. Connect to a sales channel (when you're ready)

The "manual order platform" mode means **you fulfill orders manually** —
copy the product details into Etsy / Shopify / wherever you sell. To enable
direct customer checkout via Printful's own storefront URL, connect a
Shopify store ($29/mo for the cheapest plan) or Etsy ($0.20/listing).

For launch, the manual flow is fine — you can copy listings into Etsy by hand
once orders start coming in.

---

## Phase 9 — Plausible Analytics (5 min, optional)

1. https://plausible.io/ → Sign up → Add site → `trainerscodex.com`.
2. They give you a `<script>` tag. Add it to `index.html` right after the
   `TRAINERS_CODEX_CONFIG` block.
3. Re-upload `bundle.html`.
4. Plausible costs $9/mo for up to 10k MAU. Free 30-day trial.

Alternative: skip analytics entirely for launch — your conversion data lives
in Stripe + Printful anyway.

---

## Phase 10 — Post-launch (10 min)

### 10a. Pin the Supabase SRI hash

See `docs/SECURITY.md` § "Pinning the hash". One-time browser DevTools
script computes the SHA-384 of `supabase-js@2.45.4`. Paste into
`src/lib/auth.ts` `SUPABASE_BUNDLE_SHA384`, rebuild, redeploy.

### 10b. Set up the takedown contact

For DMCA / trademark issues you'll inevitably face when selling fan-content
merch:
- Reserve `legal@trainerscodex.com` (Cloudflare Email Routing — free)
- Add a `<small>` block to the bundle footer linking to a Cloudflare Pages
  `/policies.html` static page that lists DMCA contact info

### 10c. Smoke test the full funnel

End-to-end checklist:
- [ ] https://trainerscodex.com loads with valid HTTPS
- [ ] Build a 6-mon team
- [ ] Sign in with Google → toast says "signed in"
- [ ] Save a team → close tab → reopen → team loads from cloud sync
- [ ] Open Poster Studio → click a premium style → Stripe Checkout opens
- [ ] Complete Checkout with Stripe test card `4242 4242 4242 4242` → return to bundle → premium unlocked toast
- [ ] Open Merch Studio → "Order on Printful" → product created in Printful dashboard
- [ ] DevTools Network tab shows no CSP violations
- [ ] DevTools Network tab shows worker requests go to https://api.trainerscodex.com
- [ ] DevTools Console shows no errors

Pass all 9 → you are live in production. Tweet it.

---

## Rollback

If anything goes wrong:

```bash
# Pages: revert to a previous deploy
# Dashboard → Pages → trainers-codex → Deployments → ⋮ → "Rollback"

# Worker: revert to previous deployment
cd ~/projects/trainers-codex/worker
pnpm exec wrangler deployments list
pnpm exec wrangler rollback --message "rollback to <id>" <id>

# Domain: in GoDaddy, revert nameservers to GoDaddy defaults (takes ~30 min)
```

DNS rollback is the slowest piece (~30 min); Pages and Workers rollback in
seconds.

---

## Cost ceiling (year 1)

Assuming 10k WAU at 1.5% conversion ($32 AOV merch + $4.99/mo sub):

| Line item | Monthly | Annual |
|---|---|---|
| Domain (trainerscodex.com renewal) | $1.83 | $22 |
| Cloudflare Pages | $0 (free tier) | $0 |
| Cloudflare Workers (10M requests + KV + R2 well below free limits) | $0 | $0 |
| Supabase (50k MAU free) | $0 | $0 |
| Stripe processing (2.9% + $0.30) on ~$4,800/mo merch + sub | ~$170 | ~$2,040 |
| Printful base costs (passed through — not a fixed cost) | variable | variable |
| Plausible Analytics | $9 | $108 |
| **Net fixed cost** | **~$11** | **~$130** |

The Stripe processing fee is consumed entirely by the revenue you're already
collecting, so the net out-of-pocket fixed cost is **~$11/mo**.

You break even (after stripe fees) at **3 merch sales per month** or **5
Premium Pack subscribers**.
