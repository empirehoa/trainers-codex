# Trainer's Codex — LAUNCH READINESS (v1.0-launch)

Produced 2026-09-09 by the launch-hardening run (`docs/LAUNCH_HARDENING_PROMPT.md`)
on `claude/monetization-v1` from tip `fcc2ef9` → `82be3b5` (15 patch commits +
5 merges, 110 files, +7,742 / −1,012). Every claim below carries its evidence
source; anything that could not be verified from the audit sandbox says so.

---

## 0. OWNER BLOCKERS — the only things between the site and revenue

| # | Blocker | Why it blocks | Exact unblock step |
|---|---|---|---|
| 1 | **Stripe LIVE keys** on the canonical account (the one holding the 5 prices) | Worker secret `STRIPE_SECRET_KEY` is `sk_test_…`; every "purchase" is test-mode and premium unlocks with `4242 4242 4242 4242`. No real money moves. | On the Mac, in `~/Projects/tc-monetization/worker`: `npx wrangler secret put STRIPE_SECRET_KEY` (paste `sk_live_…`), `npx wrangler secret put STRIPE_WEBHOOK_SECRET` (the **live** endpoint's `whsec_…` from Stripe → Developers → Webhooks → endpoint `…workers.dev/stripe/webhook`, events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.deleted`, `customer.subscription.updated`, `invoice.payment_failed`). Confirm `STRIPE_PRICE_ID` in `worker/wrangler.toml` is the LIVE monthly price id and the annual id the code expects (see `worker/src/stripe.ts`). Redeploy the worker. Then one real $4.99 purchase → license appears → refund it in the dashboard → confirm `license_revoked` fires (or at least verify `/license/verify` after `customer.subscription.deleted`). |
| 2 | `PRINTS_PUBLIC_BASE` → real public R2 base | Merch fulfilment hands Printful a public URL; without it every order fails. **Merch is dark anyway** (blocker 3). | Cloudflare → R2 → bucket `trainerscodex` → enable public access / custom domain (`cdn.trainerscodex.com`) → `wrangler secret put PRINTS_PUBLIC_BASE` (or `[vars]`) → redeploy. |
| 3 | Counsel's answers before flipping `MERCH_CHECKOUT` / `JOURNEY_MERCH_CTA` | Merch is now dark on **both** sides: client flag `false` (`src/lib/flags.ts`) **and** worker `[vars] MERCH_CHECKOUT = "0"` (new this run — `?ff=` can no longer reach fulfilment). | Counsel questions are listed in §5. To flip: set `MERCH_CHECKOUT = "1"` in `worker/wrangler.toml` `[vars]`, redeploy worker, then flip the client default (or set it in `TRAINERS_CODEX_CONFIG.flags` via `inject-config`). |
| 4 | Google Search Console property + sitemap | 1,330 URLs are live but unsubmitted. | `launch/search-console.md` (15 min; TXT record in Cloudflare DNS, submit `sitemap.xml`, expect 1,330 discovered). |
| 5 | Founding Trainer $29 annual coupon | Marketing hook for the launch posts. | Stripe Dashboard → Products → Coupons → new coupon, amount-off $10 on the $39/yr price (or fixed-price promo), duration `once`, redeem-by = launch + 14d; create a Promotion Code `FOUNDING`; pass it via Checkout `discounts` or `allow_promotion_codes: true` in `worker/src/stripe.ts` `createCheckoutSession` (one-line change; not done because the coupon/price choice is owner-only). |
| 6 | **DMCA designated-agent registration** (`public/dmca.html` says "in progress") and the registered address/venue (Pembroke Pines / S.D. Fla. vs. EMG's Kissimmee HQ) | §512(c) safe harbour depends on the registration. | copyright.gov/dmca-directory → register → edit `public/dmca.html` to remove "in progress"; confirm the address + venue with counsel; confirm `legal@ / billing@ / privacy@trainerscodex.com` mailboxes exist (not verifiable from here). |
| 7 | **Deploy of this build** (see §4) | The hardened build is merged and tagged but the Mac (wrangler OAuth + GitHub push) was unreachable from this session when the release was cut. | §4 has the exact commands. Until then, production still runs the pre-hardening `fcc2ef9` build — including the `?unlock=premium` bypass (A-1). **Deploy before any marketing post.** |

---

## 1. Go / No-Go

| Gate | Status | Evidence |
|---|---|---|
| vitest | **GO** — 458 passed, 1 skipped (was 368) | `npx vitest run` on `82be3b5`: `Test Files 31 passed \| 1 skipped · Tests 458 passed \| 1 skipped` |
| Browser (puppeteer) | **GO** — 24 suites / 290 tests (was 21 / 228) | `node tests/run-all.mjs`: `SUITES: 24 · passed: 24 · failed: 0`; new suites `test-premium-gate` 15, `test-a11y` 24, `test-robustness` 7 |
| Worker (node:test) | **GO** — 79 passed (was 34) | `(cd worker && node --test test/*.test.ts)`: `# pass 79 # fail 0` |
| Lint | **GO** — 0 errors, 21 warnings (unchanged baseline) | `pnpm lint`: `✖ 21 problems (0 errors, 21 warnings)` |
| Bundle size | **GO** — 2,137,756 B (2,087.7 KB) ≤ 2,150,400 B cap; gzip ≈ 530 KB | `stat -c %s bundle.html`; CI gate added |
| Sitemap | **GO** — 1,330 `<loc>` | `grep -c '<loc>' dist/sitemap.xml` → 1330 |
| Boot (file://, 1×) | **GO (marginal)** — 714 ms median first-card, heap 20 MB | `tests/bench-boot.mjs` merged vs base: 704 → 714 ms (noise) |
| Boot (4× CPU) | **NO-GO vs the 700 ms target, accepted for launch** — DCL→first card ≈ 1.6 s | Agent E measurement; static first-paint shell added (FCP 5.0 → 1.0 s in devtools-throttled Lighthouse); TBT lever (`@smogon/calc` 463 KB lazy) deferred — §6 |
| Lighthouse a11y | **GO** — SEO pages 83/91 → **100/100**; shell 95 (axe: 0 critical on shell + 6 dialogs) | Agent S/R reports; `tests/test-a11y.mjs` |
| Lighthouse perf (mobile, `/`) | **Lab only, NO-GO vs ≥85** — 35 → 70 (devtools throttling, local gzip mirror) | live Lighthouse not verifiable (egress). Reference pages 100. |
| Security (worker) | **GO** — 1 HIGH + 3 MEDIUM + 6 LOW fixed; 0 open CRITICAL/HIGH | §2 B-* |
| Security (client) | **GO** — CRITICAL A-1 fixed; 0 open CRITICAL/HIGH | §2 A-1, C-* |
| Legal / IP bright lines | **GO on code; counsel items open** | §2 D-*; §5 |
| Deployed live | **PENDING** — see blocker 7 | §4 |

**Verdict: GO to deploy and tag; GO to market once blockers 1, 4, 7 are done (5 is a nice-to-have; 2, 3, 6 gate merch, not launch).**

---

## 2. Findings → outcomes (every one adversarially re-reproduced before patching)

Severity legend: C critical · H high · M medium · L low · I info. "Fixed" = patched + regression test that failed before / passes after. Agents: A regression/UX · B worker security · C client hardening · D legal/IP · E perf/a11y.

### Money & entitlement

| ID | Sev | Finding | Outcome | Test |
|---|---|---|---|---|
| A-1 / C-4 | **C** | `https://trainerscodex.com/?unlock=premium` granted every premium surface on production, persisted across reloads (live-reproduced on the owner's Mac; `license.ts` had no env gate). | **Fixed** `9d6f0eb` — when a worker is configured the URL directive is stripped silently, `trainerscodex.premium` is purged on boot, and the only entitlement is a verified license. Preview toggle kept for the no-worker static build. | `src/lib/license.test.ts`; `tests/test-premium-gate.mjs` (A-1 ×3) |
| B-1 | **H** | `/stripe/verify` minted a 31-day premium JWT for **any** paid session — a $1.99 credit pack or sticker order → premium; revocation could never bite (no subscription mapping). | **Fixed** `14099d0` — requires `metadata.source === 'trainerscodex_premium_pack'` + `mode === 'subscription'` + subscription id, else 422 `not_a_premium_session`. | `worker/test/stripe-verify.test.ts` (6) |
| A-3 / E-8 | M | Annual $39/yr picker and "restore purchase" were dead code — `PremiumControl` only ever mounted compact; buyers saw monthly only and had no restore path. | **Fixed** `9d6f0eb` — full control (radiogroup + restore + terms link) mounted in Poster Studio's locked-style pitch; compact header control gains restore + terms. | `test-premium-gate.mjs` (term:'annual' captured at the fetch boundary) |
| A-6 | L | `?checkout=cancel` return not consumed (no toast, dirty URL). | **Fixed** — `consumeCheckoutCancel()`; no `checkout_abandoned` event because it is not in the live `commerce_events` CHECK vocabulary (verified). | vitest ×4, puppeteer ×2 |
| B-9 | L | `checkout.session.async_payment_succeeded` unhandled → delayed-method merch orders never fulfilled; credits granted on unpaid `completed`. | **Fixed** — shared `handleCheckoutSession`, paid-only grants. | `worker/test/webhook.test.ts` |
| B-7 | L | JWT `exp` missing/non-numeric accepted forever; no `nbf`; no key-length check. | **Fixed** — finite `exp` ≤ iat+400d, `nbf`, key ≥ 32 chars. | `worker/test/jwt.test.ts` (8) |
| B-11 | I | AI quota key case-sensitive on email (credits key was not). | **Fixed** — lower-cased. | `ai-upload.test.ts` |

### Merch bright lines (merch stays DARK)

| ID | Sev | Finding | Outcome | Test |
|---|---|---|---|---|
| D-1 | **H** | Every merch print composited **official artwork** (PokeAPI `other/official-artwork`) into the PNG uploaded to Printful — contradicting CLAUDE.md, ToS §4, GTM plan. | **Fixed** `cc63a06` — new `src/lib/silhouette.ts` (extracted from the Legend Card) renders every figure as a derived alpha-mask silhouette in type colours from the pixel sprite only, with a glyph fallback on timeout; `merch-renderers.ts` no longer imports `spriteUrl`. Sample PNGs inspected. | `src/lib/merch-renderers.test.ts` (never requests `official-artwork`/`home`/`artwork-`); `tests/test-merch-legal.mjs` request interception |
| D-2 | **H** | "order on printful" button was **unflagged** — any visitor could create a priced sync product in the owner's Printful store; only the Stripe "buy" button was behind `MERCH_CHECKOUT`. | **Fixed** client `3634940` (button gated like buy; download stays) + worker `14099d0` (`/printful/order` 503 `merch_disabled`). | puppeteer default flags → both buttons absent; `worker/test/merch-guard.test.ts` 0 R2 puts / 0 upstream |
| D-3 | **H** | `?ff=MERCH_CHECKOUT:1` was a pure client flip; worker had no guard → Stripe session + Printful draft order reachable. | **Fixed** — `[vars] MERCH_CHECKOUT = "0"`; `merchCheckout()`, `printfulOrder()` and the webhook merch branch refuse before any R2/Stripe/Printful call. Flipping is owner-only. | `merch-guard.test.ts` |
| D-6 | M | Species display names auto-printed on prints when no nickname (roster, banner, trainer-card signature) — SECURITY.md claimed otherwise. | **Fixed** — nickname or type pairing (`FIRE · FLYING`), slot labels; SECURITY.md row corrected. | vitest records `fillText` args for all 7 designs |
| D-5 | M | Worker `stripTrademark` only stripped Pokémon/Poké; species names, Nintendo, Game Freak, diacritic variants reached Stripe line items / Printful titles (species strip was client-only). | **Fixed** — NFD-normalised token/n-gram sanitiser with brand phrases + generated `worker/src/species-names.ts` (1,307; drift test vs the JSON); fail-closed `Custom team design`. | `worker/test/listing-name.test.ts` |
| B-2 | M | `product=__proto__` passed catalog lookups → `unit_amount=NaN` to Stripe (rejected, so no $0 sale) but a 12 MB R2 write ran first. | **Fixed** — `Object.hasOwn` everywhere, non-finite → 400 `unknown_product`, R2 put moved after Stripe. | `merch-guard.test.ts` (5 proto keys → 400, 0 puts) |

### Worker robustness

| ID | Sev | Finding | Outcome | Test |
|---|---|---|---|---|
| B-3 | M | AI photo upload stored in the public prints bucket with the **client-supplied** content type → SVG/HTML served from the CDN origin. | **Fixed** — PNG/JPEG/WebP magic-byte sniff before moderation/fal; 400 `bad_image`; sniffed type stored. | `worker/test/ai-upload.test.ts` |
| B-5 | L | JSON `null` body → 500 echoing `Cannot read properties of null`; multipart routes given JSON → 500 with undici text; 500 handler echoed upstream Stripe/Printful messages. | **Fixed** — `body.ts` guards (400 `bad_json` / `multipart_required`), generic `{error:'internal'}`. | `worker/test/body-guards.test.ts` |
| B-6 | L | 13 MB upload rejected only after full buffering. | **Fixed** — Content-Length pre-check → 413 before `formData()`. | spy: `formData` never called |
| B-8 | L | `RATELIMIT_KV` absent/erroring → unhandled throw (1101 page, no CORS). | **Fixed** — JSON 503 with CORS, `/health` unaffected. | `body-guards.test.ts` |
| B-10 | L | `pnpm audit` in worker: 1 high (`sharp` via wrangler/miniflare, dev-only). | **Fixed** — `pnpm.overrides.sharp >= 0.35.4`; audit clean. Root `--prod` was already clean. | audit output; CI `pnpm audit --prod` step |
| B-4 | M | All KV counters (AI quota, credits, rate limit) are non-atomic check-then-put; a concurrent burst over-spends (simulated: 12 requests vs quota 5 → 12 fal calls). | **DEFERRED — accepted risk for launch.** Cloudflare KV has no CAS; the real fix is a Durable Object or the Workers Rate Limiting binding. Bounded today by 5 req/min/IP and $0.039 per generation. Tracked in §6. | (keeps B's stale-read test as the target) |

### Client hardening

| ID | Sev | Finding | Outcome | Test |
|---|---|---|---|---|
| C-1 | M | Crafted library-import JSON / localStorage payload → white screen and a **persistent boot crash-loop** (`n.toLowerCase is not a function`). | **Fixed** `c0cc83e` — `sanitizeMember/Team/Trainer/Name` at load, import and restore; root `ErrorBoundary` with "reset local data". | `src/lib/storage.test.ts` fuzz table; `tests/test-robustness.mjs` (7) |
| C-5 | L | Share-hash `tn=`/`by=` unbounded (20 KB rendered; spoofable "from …"); posters drew names without fitting. | **Fixed** — `parseShareHash` caps at 40; `maxLength=40`; `lib/canvas-text.ts` ellipsize/fit in all 12 poster renderers. | vitest + robustness |
| C-2 | M | CSP `connect-src` omitted `pokepast.es`, `pokebin.com`, `teams.pokemonshowdown.com` → paste-link import silently blocked live. | **Fixed** `403f914`. | `tests/test-security.mjs` static fetch-host → connect-src scan |
| A-5 | M | Cloudflare Insights beacon blocked by CSP → console error on every live load, analytics dead. | **Fixed** — beacon hosts allowed (cookieless); owner may instead disable the beacon in the zone. | same |
| C-3 | M | Supabase esm.sh SRI hash empty and the deploy env var never wired. | **Wired** `90541dd` — `SUPABASE_SHA384` → `config.supabase.sha384` → `auth.ts`. Hash still empty (owner computes per SECURITY.md runbook; note: esm.sh shim re-exports, so the hash pins the shim only). | `test-security.mjs` |
| C-6 / D-13 | L | Stale tracked `deploy/_headers` (old CSP) and 1.2 MB stale `deploy/index.html`. | **Fixed** — removed; guard test. | `test-security.mjs` |
| A-2 | **H** | Every anonymous live visit showed a **"signed out" toast** on boot (`INITIAL_SESSION` null forwarded as a sign-out). | **Fixed** `9d6f0eb` — event passed through; toast only on a real SIGNED_OUT transition. | `src/lib/auth.test.ts` (puppeteer not feasible: SDK loads via `import(esm.sh)`, harness blocks network) |
| A-4 | M | Type Chart dialog 608 px wide on a 390 px phone. | **Fixed** `840fb47`. | `test-responsive.mjs` |
| A-7 / A-8 | L | HoF "CULT HERO OF ␣" + "1 finished careers"; Help FAQ still described premium as a dev toggle, header "V5.0 / what's new in v4". | **Fixed** `b491ac8`/`9d6f0eb`. | `src/journey/saves.test.ts`; `HelpDialog.test.ts` |
| A-10 | I | Offline grid cards showed the broken-image glyph. | **Fixed** — inline SVG placeholder. | robustness |
| D-8 | M | No legal/DMCA links in the app footer; premium CTA had no terms link. | **Fixed**. | puppeteer |

### Accessibility & performance

| ID | Sev | Finding | Outcome | Test |
|---|---|---|---|---|
| E-3 | **H** | 12 header icon buttons + Analyze/filter/Select triggers had **no accessible name** (axe critical ×13). | **Fixed** `840fb47`. | `tests/test-a11y.mjs` (axe: 0 critical on shell @1280/390 + 6 dialogs) |
| E-4 | M | Focus lost to `<body>` after every dialog close (no `DialogTrigger`). | **Fixed** — `useReturnFocus` in `ui/dialog.tsx` + `sheet.tsx`. | test-a11y ×4 dialogs |
| E-5 | M | SEO pages: `--faint` 4.26:1, type pills 2.5–3.6:1, colour-only links, 9.6 px labels → Lighthouse a11y 83/91. | **Fixed** `35e57f8` → **100/100**. | `src/seo/render.test.ts` WCAG sweep; `test-seo-pages.mjs` font floor |
| E-6 / E-7 / E-12 | M | Lock states conveyed by opacity + hidden icon only; HoF paywall `<button>` inside `<button>`; Journey name input unlabelled. | **Fixed** `b491ac8`. | test-premium-gate / test-a11y |
| E-9 | M | No `prefers-reduced-motion` handling (infinite `flicker`, `pulse-dot`). | **Fixed**. | test-a11y |
| E-11 | M | 10 px `text-destructive` 3.03:1; dimmed locked cards ~3:1. | **Fixed** — `--destructive-text` token, AA type-pill ink (`lib/contrast.ts`). | `contrast.test.ts`; axe colour-contrast on Analysis/Poster |
| E-13 / E-14 / E-17 / E-19 | L/I | Sprite alt text widened the Journey dialog offline; map numerals 7.8 px; 16 px close X on desktop; Analyze button named "6/6" on phones. | **Fixed**. | test-journey / test-a11y |
| E-1 / E-2 / E-10 | **H** | Nothing painted until the 2 MB inline script executed (FCP = LCP ≈ 4–5 s lab); Google Fonts `@import` render-blocking. | **Half fixed** `b69df6f` — static header + hero inside `#root` (JS-off vs JS-on bounding boxes asserted equal), script moved after `#root`, fonts preloaded non-blocking. Lab (devtools throttling): FCP/LCP 5.0 → 1.0 s, SI 7.7 → 2.2 s, perf 35 → 70. TBT unchanged; the remaining lever is `@smogon/calc` (463 KB, matchup preview only) → §6. | `test-pwa.mjs` |
| E-15 | L | `json.stringify` silently ignored under Vite 8 (needs `namedExports:false`). | **Tried and reverted** `82be3b5` — +26 KB for 704 → 714 ms (noise) on the merged bundle; documented in `vite.config.ts`. | — |
| E-16 | L | 85 KB headroom under the 2.1 MB cap, nothing measuring it. | **Fixed** — CI size gate 2,150,400 B + `pnpm audit --prod`. | `.github/workflows/ci.yml` |
| D-4 | **H** | PWA manifest `name` "Trainer's Codex — Pokémon Team Builder" (store-listing bright line); description advertised merch. | **Fixed** `403f914` — name "Trainer's Codex", mark- and merch-free description. `<title>`/`og:title` left for counsel (§5). | `src/pwa-manifest.test.ts` |
| D-7 | M | Launch copy paired product with merch, claimed MIT licence (LICENSE is proprietary), wrong design counts, unsourced "4-7x". | **Fixed** — README + `docs/social-copy.md`; docs lint fails if launch posts mention merch while the flag is off or README says MIT. | `test-security.mjs` docs lint |
| D-10 | M | Privacy policy silent on anonymous event analytics and public Journey ghost names; ToS lacked the annual price. | **Draft added** to `public/legal.html` behind `<!-- DRAFT 2026-09-09: pending counsel review -->` markers ($39/yr verified from `PremiumControl.tsx`). | `test-security.mjs` |

### Verified PASS (no change needed) — evidence in `scratchpad/findings/*.json`

Mobile 390: first card at 661 px (< 1 screen), wordmark unclipped, 7 of 8 dialogs within width · offline `file://` boot 636–692 ms, 0 errors · PWA manifest/sw content types, live `sw.js` == `public/sw.js` (`tc-v10`), navigate handler refreshes shell only for `/` and `/index.html` · deep links `?seed`, `?daily` (today free / past gated with toast / open for premium), `?issue`, `?q` (64-char cap), `?ff` · **premium gates surfaces not outcomes**: seed 8843, fixed choices → identical score/verdict/rank/luck free vs preview vs JWT premium · zero raw i18n keys in ES across every screen incl. the Legend Card · Stripe TEST checkout → `checkout.stripe.com` URL; bogus `session_id` → 400, no license · autosave/resume intact across reload · Legend Card renders 100% non-blank under an iPhone UA; clip button hides when `MediaRecorder` is absent · JWT alg pinning (`none`/RS256/HS512 rejected), constant-time verify, `iss` check · revocation rejects on `/license/verify` **and** `/ai/*` · webhook 13-case signature table (v1 only, ±300 s, constant-time) · CORS enforced on every route incl. 404/403/preflight · rate limits on all money routes keyed on `cf-connecting-ip` · pricing tamper table (`expectedRetail`/markup/quantity) all 409/4xx, never $0 · R2 keys UUID-only · `returnUrl` 33-payload table, zero leaks · quota fails closed without KV · no secrets in the bundle or `[vars]` · XSS: 3 payloads × every user field → 0 injected nodes; all SEO interpolations escaped · 139-case localStorage corruption sweep clean, `Object.prototype` clean · disclaimer on the shell, all 4 SEO page classes (built + live), `legal.html`, Legend Card PNG/clip · client event vocabularies match the live CHECK constraints exactly (journey 7/7, commerce 8/8), no PII in rows · LICENSE / fonts / `@smogon/calc` MIT / PokeAPI attribution present.

### Not verifiable from the audit sandbox (org egress denies `trainerscodex.com`, `*.workers.dev`, `esm.sh`, `*.supabase.co`)

Live security-header matrix per path class; live Lighthouse; live brotli; the 12 live worker probes (executed locally against identical code instead — `launch/live-probes.sh` re-runs them with expected results); D-14 (`/pokemon/gengar` without trailing slash via WebFetch returned the shell title — likely a fetch-tool redirect artefact; confirm `curl -sI` shows a 3xx to `/pokemon/gengar/`). Agent A's live UX checks **were** executed read-only from the owner's Mac while it was linked (≈45 requests, one abandoned Stripe test session).

---

## 3. Release

- Branch `claude/monetization-v1` → `82be3b5` (15 patch commits, 5 merge commits, no squash).
- Development line `claude/journey-mode-trainer-sim-1r2yvp` moved to the same commit (fast-forward — the dev line `1257de3` was already an ancestor, so no merge commit was needed and history is intact).
- Tag `v1.0-launch` on the commit that adds this report (`docs: LAUNCH_READINESS.md …`, child of `82be3b5`).
- **Push and deploy could not be executed from this session** (no GitHub credentials in the sandbox; the Mac that holds wrangler OAuth and `gh` auth was unreachable at release time). An incremental `git bundle` (prerequisite `fcc2ef9`, which the Mac already has; ~400 KB) carrying both branches and the tag is delivered alongside this report: `trainers-codex-v1.0-launch.bundle`.

---

## 4. Deploy + post-verify (run on the Mac; ~10 minutes)

```bash
# 0. bring the commits in (the bundle was delivered to the chat; save it to ~/Downloads)
cd ~/Projects/tc-monetization
git fetch ~/Downloads/trainers-codex-v1.0-launch.bundle \
  'refs/heads/*:refs/remotes/bundle/*' 'refs/tags/*:refs/tags/*'
git checkout claude/monetization-v1 && git merge --ff-only bundle/claude/monetization-v1
git branch -f claude/journey-mode-trainer-sim-1r2yvp bundle/claude/journey-mode-trainer-sim-1r2yvp
git push origin claude/monetization-v1 claude/journey-mode-trainer-sim-1r2yvp
git push origin v1.0-launch

# 1. build (pnpm 11 on the Mac: pnpm config set verify-deps-before-run false --location project)
PUPPETEER_SKIP_DOWNLOAD=1 pnpm install && (cd worker && pnpm install --ignore-workspace)
pnpm build && node inline.mjs
stat -f %z bundle.html            # expect 2137756 (≤ 2150400)

# 2. stage with config (same values as the 2026-09-09 deploy)
SUPABASE_URL=https://obcrhdmpkvwntwqyixls.supabase.co \
SUPABASE_ANON_KEY=<anon key> \
WORKER_URL=https://trainers-codex-api.jrriestra.workers.dev \
node scripts/inject-config.mjs

# 3. deploy — API worker first (it now carries MERCH_CHECKOUT="0" in [vars]), then the site
(cd worker && npx wrangler deploy)
(cd worker && npx wrangler deploy --config ../deploy/frontend-wrangler.toml)

# 4. post-verify
curl -s https://trainers-codex-api.jrriestra.workers.dev/health
curl -sI https://trainerscodex.com/pokemon/gengar/ | head -1           # 200, static page
curl -s https://trainerscodex.com/pokemon/gengar/ | grep -c 'fan-made'  # 1
curl -s https://trainerscodex.com/sitemap.xml | grep -c '<loc>'         # 1330
curl -s -o /dev/null -w '%{http_code}\n' 'https://trainerscodex.com/journey?seed=8843'   # 200
curl -s https://trainerscodex.com/ | grep -c 'TRAINERS_CODEX_CONFIG'    # ≥1
curl -s https://trainerscodex.com/ | grep -c 'og-home.jpg'              # ≥1  (new OG)
curl -s https://trainerscodex.com/manifest.webmanifest | grep '"name"'  # "Trainer's Codex"
curl -sI https://trainerscodex.com/ | grep -i content-security-policy | grep -c pokepast   # 1
# the CRITICAL: open https://trainerscodex.com/?unlock=premium in a fresh profile →
#   NO toast, Poster Studio still shows locked styles, localStorage has no trainerscodex.premium
# worker guard:
curl -s -X POST https://trainers-codex-api.jrriestra.workers.dev/merch/checkout \
  -H 'origin: https://trainerscodex.com' -F product=mug -F markup=100 -F expectedRetail=1 \
  -F returnUrl=https://trainerscodex.com/ -F file=@public/icon-192.png | head -c 200      # 503 merch_disabled
# one full TEST-mode checkout round-trip: get premium → 4242… → return → premium active → restore purchase works
# if any check shows the old build: Cloudflare → Caching → Purge Everything, retry.
bash launch/live-probes.sh   # optional: the 12 worker probes with expected results
```

---

## 5. Counsel-facing questions (from Agent D; not legal advice)

1. Merch prints now contain only **derived silhouettes** (alpha-mask of the pixel sprite, recoloured) and type/slot labels — no official art, no species names. Is that posture acceptable for fulfilment via the owner's Printful store (owner = seller)? (D-1, D-2, D-11)
2. Legend Card silhouettes (same derivation) are downloadable by everyone in-app; species names appear in card flavour text unless `JOURNEY_SPECIES_FLAVOR` is flipped off. Acceptable? (D-11)
3. Poster Studio personal-use downloads composite full sprite-mirror art including official artwork and HOME renders; 3 of 12 styles bake a disclaimer. Keep, restrict to pixel sprites, or add the disclaimer to all 12? (D-12)
4. `<title>` / `og:title` "Trainer's Codex — Pokémon Team Builder & Coverage Analyzer" as nominative use — acceptable, or bare brand like the manifest now is? (D-4)
5. Privacy-policy drafts (anonymous events, public ghost names) and ToS §3 annual term — approve wording (`public/legal.html`, marked DRAFT). (D-10)
6. DMCA agent registration, registered address and venue clauses. (D-9)
7. Licence statement now consistent (proprietary) — confirm the README wording. (D-7)

---

## 6. Post-launch backlog (measured, not blocking)

1. **TBT / perf ≥ 85 on `/`** — move `@smogon/calc` (463 KB, 22 % of the bundle, matchup preview only) out of the critical script while staying single-file (blob-URL module on first matchup), then the ES/PT/JA strings. Expected: −460 KB, TBT −60 %+. Then tighten the CI cap to 1.8 MB.
2. **KV counter atomicity** (B-4) — Durable Object or Workers Rate Limiting binding for AI quota / credits / rate limit.
3. **Boot < 700 ms at 4× CPU** — follows from (1); also consider a 60-card first window.
4. ES for the shell (Journey is fully translated; the shell is English — A-9), PT/JA.
5. `source: 'seo'` on `run_started` so the 1,330-page → Journey funnel is measurable in-DB (`launch/first-week-metrics.md` Q5).
6. `checkout_abandoned` event (needs a DB CHECK change + client).
7. Supabase SRI: vendor `@supabase/supabase-js` into the bundle behind a dynamic chunk and drop `esm.sh` from CSP (C-3 root fix).
8. 21 react-hooks lint warnings; `App.tsx` 1,600+ lines.

---

## 7. Process notes for the next run

- `git stash` is **shared across worktrees**. Three of five parallel patch agents collided on it; all recovered (dangling commits `37a3974`, `0cb5710`, `8c7d1e6`) and every branch's footprint was verified against its assigned file set before merging. Rule: never stash in a worktree; commit WIP instead.
- The full browser suite is now ~12 minutes on a 2-core box — run it detached (`setsid nohup node tests/run-all.mjs`) or it trips 10-minute tool timeouts.
- Org egress denies the production hosts from the cloud sandbox; live checks need the linked Mac.
