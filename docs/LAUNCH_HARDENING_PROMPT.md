# TRAINER'S CODEX — LAUNCH HARDENING MASTER PROMPT (v1.0-launch)

Paste this whole file as the prompt in a Claude Code session opened at the
root of `empirehoa/trainers-codex`, on branch `claude/monetization-v1`.
It orchestrates multiple agents to test, QA, security-audit, patch, and cut
the final version we begin marketing.

---

## CONTEXT (verified 2026-09-09 — trust but re-verify, never assume)

- Live: trainerscodex.com serves the monetization build. 1,330 SEO pages +
  sitemap live; `/journey?seed=` SPA route live; `TRAINERS_CODEX_CONFIG`
  injected (Supabase `obcrhdmpkvwntwqyixls` + worker
  `trainers-codex-api.jrriestra.workers.dev`).
- Worker deployed with bindings: RATELIMIT_KV, AI_QUOTA_KV
  (`46c775aa88644e4ca0f2c1f8b556be87`), PRINTS_BUCKET (R2 `trainerscodex`),
  Workers AI. Secrets set: STRIPE_SECRET_KEY (**still sk_test_ — collects no
  real money**), STRIPE_WEBHOOK_SECRET, JWT_SIGNING_KEY, PRINTFUL_API_KEY.
- Supabase tables: `journey_events`, `commerce_events`, `journey_ghosts`,
  `user_data` — all RLS, anon INSERT-only on event tables.
- Branch `claude/monetization-v1` (tip `1e96b57`) carries: commerce funnel
  analytics, license revocation, fail-closed AI quota, buyer merch checkout
  (dark behind `MERCH_CHECKOUT`), Journey premium gates (archive / saves /
  Legend finishes), annual term picker, pricing parity tests.
- Test baseline: vitest 368 (+1 skipped) · browser 21 suites (~230) · worker
  34 node:test · lint 0 errors. CI runs all three on push.

## GROUND RULES (non-negotiable, enforce in every agent)

1. Read `CLAUDE.md` first — every gotcha in it is a prior real failure.
2. IP bright lines: no "Pokémon" in app name/domain/listings/paid-surface
   titles; sell the user's design, never official art; sprite-mirror art
   in-app only, never on prints; stay a PWA.
3. Premium gates SURFACES, never OUTCOMES. Never sell gameplay power.
   Leaderboard/daily stay pay-neutral. `simulate()` stays pure/deterministic.
4. OWNER-ONLY (flag, never do): live Stripe keys / account choice, prices,
   coupons; flipping `MERCH_CHECKOUT` or `JOURNEY_MERCH_CTA` (counsel gate);
   R2 `PRINTS_PUBLIC_BASE`; legal counsel questions; Search Console.
5. Never fabricate a finding, a passing result, or a metric. Every claim in
   the final report carries evidence (command output, screenshot, or diff).
   Unverifiable = say "not verifiable".
6. All three test layers + lint must be green before ANY merge or deploy:
   `pnpm test:all` · `(cd worker && node --test test/*.test.ts)` · `pnpm lint`.
7. Fix forward with a regression test per fix. A finding without a test that
   would have caught it is not closed.

## MISSION

Take `claude/monetization-v1` to a tagged **v1.0-launch** we can market:
every finding from parallel QA + security agents adversarially verified,
patched with tests, merged, deployed, and post-verified live — then produce
the launch-readiness report and marketing pack.

## PHASE 1 — PARALLEL AGENT FAN-OUT

Launch these as concurrent agents (Task/Agent tool; isolate written work in
worktrees). Each returns FINDINGS as `{severity, surface, repro, evidence}`.
No agent patches anything in this phase — audit only.

**Agent A — Full regression + UX QA.** Run all three test layers as baseline.
Then the manual matrix against the built `bundle.html` AND live site:
390px mobile (first-content distance, header wordmark unclipped, dialog
scrollWidth ≤ clientWidth), offline `file://` open, PWA install + sw update
(CACHE_VERSION discipline, shell not poisoned by reference pages), deep links
(`?seed=`, `?daily=` today free / past gated with toast, `?issue=`,
`?q=`, `?ff=`, `?unlock=premium` + `unlock=off`), ES locale sweep (no raw
i18n keys anywhere incl. share cards), premium matrix (free vs premium across
archive / saves / HoF / finishes / posters / sprites / saved-team cap),
Stripe checkout round-trip in test mode incl. cancel path, restore-purchase,
autosave/resume across reloads, Legend Card + clip render on iOS-class UA.

**Agent B — Worker security / abuse audit** (`worker/src/*`, plus READ-ONLY
probes against the live worker). JWT: alg confusion (`alg:none`, HS256 key
handling), expiry, revocation actually rejects (revoked premium token → 403
on AI + verify), token audience/issuer. Webhook: signature verification
strictness, replay, redelivery idempotency (`merchdone:`), unpaid-session
handling. Pricing: tamper `expectedRetail` → must 409; unknown product /
markup → 4xx never $0. Uploads: >12MB rejected, content-type sniffing
(is a non-PNG accepted?), R2 key traversal. `returnUrl`: open-redirect /
SSRF — verify `isAllowedReturnUrl` cannot be bypassed (scheme tricks,
userinfo@, subdomain confusion). CORS: ALLOWED_ORIGINS enforcement on every
route incl. errors. Rate limits per route (are the money routes limited?).
Quota: KV-absent fails closed; counter races. Secrets: nothing logged,
nothing in [vars] that belongs in secrets. `pnpm audit` both installs.

**Agent C — Client hardening.** XSS: every user string (nickname, team name,
gym name, trainer name, slogans) through DOM, canvas, share text, SEO `?q=`
bridge, and Stripe product names (stripTrademark path). localStorage: corrupt
every schema (storage v2, license, streak, saves, credits) → app must boot
clean, never crash-loop; license structural validation edge cases. sw.js:
cache poisoning, stale-shell behavior. CSP `_headers` actually served on
every path class (/, /pokemon/*, /journey). Prototype pollution via JSON
imports of shared/deep-link params.

**Agent D — Legal / IP / compliance sweep.** Blocklist tripwire tests still
pass; no species names or "Pokémon" in any paid-surface title, Stripe
product names, store listings, or new premium copy (finishes, archive pitch,
buy button); disclaimer present on all page classes incl. new surfaces;
DMCA + legal pages reachable; analytics truly PII-free (grep every insert);
fair-housing-style clean marketing copy (no protected-class targeting);
merch flow stays dark (flags off) and press materials never pair with merch.

**Agent E — Performance + accessibility.** Lighthouse (or equivalent) on `/`,
`/pokemon/gengar`, `/type/ghost`, journey dialog open: perf ≥ 85 mobile,
a11y ≥ 95. Boot < 700ms mid-tier, heap < 25MB, bundle ≤ 2.1MB. axe pass on
the five main dialogs (focus traps, aria on the new term picker / finish
picker / archive locks). Text floor ≥ 10px enforced.

## PHASE 2 — VERIFY → PATCH → PROVE

For every finding: (1) an adversarial verification agent reproduces it or
downgrades it to PLAUSIBLE/refuted — only CONFIRMED gets patched; (2) patch
on the branch with a regression test; (3) re-run the three layers + lint;
(4) re-run the specific probe that found it. Batch related fixes into
reviewable commits (use `git commit -F` for messages with parens). Anything
CONFIRMED but owner-only goes to the blockers list, not the codebase.

## PHASE 3 — RELEASE

1. Merge `claude/monetization-v1` into the development line
   (`claude/journey-mode-trainer-sim-1r2yvp`) — or `main` if the owner says
   main is the release line now. No squash; history carries the evidence.
2. Tag `v1.0-launch`, push tags.
3. Deploy (from repo root, wrangler authenticated):
   `pnpm build && node inline.mjs`
   `SUPABASE_URL=https://obcrhdmpkvwntwqyixls.supabase.co SUPABASE_ANON_KEY=<anon key> WORKER_URL=https://trainers-codex-api.jrriestra.workers.dev node scripts/inject-config.mjs`
   `(cd worker && npx wrangler deploy)` — API worker
   `(cd worker && npx wrangler deploy --config ../deploy/frontend-wrangler.toml)` — site
4. Post-verify live: `/pokemon/gengar` is the SEO page; `sitemap.xml` = 1330
   `<loc>`; `/journey?seed=8843` = 200; index carries config; worker
   `/health` ok; one full test-mode checkout round-trip. Purge zone cache
   only if any check shows stale.

## PHASE 4 — MARKETING PACK (produce, don't publish)

`LAUNCH_READINESS.md` at repo root: every agent's findings + outcomes with
evidence, the go/no-go table, and the owner blockers. Plus a `launch/`
folder: OG image verification (1200×630 on all page classes), 3 launch-post
drafts (r/stunfisk, r/pokemon, Product Hunt — product + free tools angle,
zero merch mentions), Search Console submission steps, and a first-week
metrics plan (which `journey_events`/`commerce_events` queries answer
"is the funnel working" — include the SQL).

## OWNER BLOCKERS (surface these at the top of the final report)

1. Stripe LIVE keys on the canonical account (B holds the 5 prices) —
   until then every "purchase" is test-mode and premium is unlockable with a
   test card. This is the only step between the site and revenue.
2. `PRINTS_PUBLIC_BASE` → real public R2 base before any merch flip.
3. Counsel's 4 answers before `MERCH_CHECKOUT` / `JOURNEY_MERCH_CTA` flip.
4. Search Console property + sitemap submission (needs domain ownership).
5. Founding Trainer $29 annual coupon (Stripe dashboard).

Close every loop: end with what was delivered, what was verified (with the
numbers), and the exact unblock step for anything that remains.
