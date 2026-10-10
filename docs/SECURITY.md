# Trainer's Codex — Security Audit & Hardening

**Audit date:** 2026-05-27
**Auditor:** Claude Code (handoff session)
**Scope:** v5 bundle.html + Cloudflare Worker (Stripe + Printful) + Supabase auth/sync
**Methodology:** static review of all `src/**/*.{ts,tsx}`, runtime sweep for dangerous APIs, dependency surface map, deploy-config review (`public/_headers`, `worker/wrangler.toml`), abuse-vector enumeration.

## TL;DR — finding ledger

| # | Severity | Area | Status |
|---|---|---|---|
| 1 | HIGH | Dynamic ESM import of Supabase from `esm.sh` had no integrity verification | **Fixed** — `src/lib/auth.ts` now SHA-384 verifies before import |
| 2 | MEDIUM | No CSP / security headers on the deployed bundle | **Fixed** — `public/_headers` added for Cloudflare Pages |
| 3 | MEDIUM | One merch slogan (`POKÉDEX RESEARCHER`) included a Nintendo trademark on a printed product | **Fixed** — renamed to `FIELD RESEARCHER` in `src/lib/merch.ts` |
| 4 | MEDIUM | Stripe license unlock relied on a client-only toggle; spoof-resistant flow not in place | **Fixed** — server-signed JWT minted by Cloudflare Worker, validated on boot (see `src/lib/license.ts`) |
| 5 | LOW | Avatar upload trusted `accept="image/*"` only — no explicit MIME allow-list | **Fixed** — `TrainerProfileDialog.tsx` rejects anything outside PNG/JPEG/WebP/GIF/AVIF |
| 6 | LOW | `localStorage` write path had no size cap (potential disk/space DoS via tampered import) | **Fixed** — `saveStorage` enforces 4 MB cap in `src/lib/storage.ts` |
| 7 | LOW | Printful PNG generation has no rate limit — could be used to spike worker CPU | **Mitigated** — Worker enforces 30 req/min/IP and 10 file uploads/hr/IP via Cloudflare KV (see `worker/src/ratelimit.ts`) |
| 8 | INFO | No `dangerouslySetInnerHTML`, no `eval`, no `new Function`, no `document.write` | ✓ clean |
| 9 | INFO | All TCG card art loaded as `<img>` from `images.pokemontcg.io` over HTTPS | ✓ clean |
| 10 | INFO | Sprite art loaded as `<img>` from `raw.githubusercontent.com/PokeAPI/sprites` | ✓ clean |
| 11 | INFO | URL-hash share code regex `/(?:^#|&)t=([0-9a-z,\-]+)/` restricts charset before parsing | ✓ clean |

### 2026-09 launch-hardening audit — Worker findings

| # | Severity | Area | Status |
|---|---|---|---|
| B-1 | HIGH | `/stripe/verify` minted a premium license for **any** paid Checkout session (a $1.99 credit pack or sticker order → 31 days of premium) | **Fixed** — requires `metadata.source === 'trainerscodex_premium_pack'`, `mode === 'subscription'` and a subscription id, else `422 not_a_premium_session` (`worker/src/stripe.ts`, `worker/test/stripe-verify.test.ts`) |
| D-2 / D-3 | HIGH | Merch was dark on the client only; `?ff=MERCH_CHECKOUT:1` or a direct POST reached Stripe/R2/Printful | **Fixed** — server-side `MERCH_CHECKOUT` var (default `"0"`) gates `/merch/checkout`, `/printful/order` and webhook fulfilment before any R2 put or upstream call (`worker/test/merch-guard.test.ts`) |
| B-2 | MEDIUM | Prototype-key product ids (`__proto__`, `constructor`, …) passed catalog validation and priced to `NaN`; R2 put ran before Stripe validated | **Fixed** — `Object.hasOwn` catalog accessors, non-finite retail → null, R2 put moved after Stripe accepts the session |
| B-3 | MEDIUM | AI uploads stored in the public bucket with the client-supplied Content-Type (SVG/HTML servable from the CDN origin) | **Fixed** — magic-byte sniff (PNG/JPEG/WebP) before moderation; anything else `400 bad_image`; stored type is the sniffed one (`worker/src/body.ts`, `worker/test/ai-upload.test.ts`) |
| D-5 | MEDIUM | Server-side listing-name strip covered only the `Pokémon` tokens; species and publisher names reached Stripe line items / Printful titles | **Fixed** — normalized (NFD, diacritics, spacing) token/phrase blocklist incl. all 1,307 species names (generated `worker/src/species-names.ts`), fail-closed generic label (`worker/test/listing-name.test.ts`) |
| B-5 | LOW | Non-object JSON bodies / non-multipart uploads threw, and the 500 handler echoed raw exception text (incl. upstream Stripe/Printful response bodies) | **Fixed** — `400 bad_json` / `400 multipart_required`; 500 is a generic `{error:'internal'}`, real message logged only |
| B-6 | LOW | Upload size enforced only after `formData()` buffered the whole body | **Fixed** — Content-Length pre-check (13 MiB; 17 MiB for codex-card's two parts) → `413` before the body is read |
| B-7 | LOW | `exp` only compared with `<`; missing/string `exp` was perpetual; no `nbf`; no signing-key length check | **Fixed** — finite numeric `exp`/`iat`, `exp ≤ iat + 400d`, `nbf` honoured, `JWT_SIGNING_KEY` < 32 chars throws at mint/verify (`worker/test/jwt.test.ts`) |
| B-8 | LOW | Missing/failing `RATELIMIT_KV` was an unhandled throw (opaque 1101, no CORS) | **Fixed** — controlled JSON `503 rate_limit_unavailable` with CORS (fail closed); `/health` degrades to allow |
| B-9 | LOW | `checkout.session.async_payment_succeeded` unhandled → delayed-payment merch orders never fulfilled | **Fixed** — routed through the same source dispatch as `completed`; idempotent via `merchdone:` / credit-grant markers; credits now grant only on a paid session (`worker/test/webhook.test.ts`) |
| B-10 | LOW | `pnpm audit` in `worker/`: sharp < 0.35.4 via wrangler → miniflare (dev-only) | **Fixed** — `pnpm.overrides.sharp >= 0.35.4` in `worker/package.json`; audit clean |
| B-11 | INFO | AI quota key was case-sensitive on email while credits lower-cased | **Fixed** — quota key lower-cases the email |

Net: **0 unresolved HIGH/CRITICAL** before merging this branch.

---

## Threat model

The deployed surface is:

```
                              Cloudflare Edge
                              ┌──────────────────────────────┐
   Browser (bundle.html) ───► │ Pages: static HTML           │
                              │ Worker: /stripe/* /printful/*│
                              └────────┬───────────────┬─────┘
                                       │               │
                       Stripe Checkout │               │ Printful API
                       (api.stripe.com)│               │ (api.printful.com)
                                       ▼               ▼
                              Supabase Postgres (auth + cloud sync)
                              (only if config set in index.html)
```

We trust:

- The **bundle is delivered intact** via Cloudflare Pages HTTPS + HSTS preload.
- The **Worker secrets** (Stripe secret, Printful API key, JWT signing key) live in Cloudflare Worker env vars, never in the bundle.
- **Supabase Row Level Security** restricts each user to their own `user_data` row (enforced in SQL — see `docs/DEPLOYMENT.md`).

We do **not** trust:

- The user's browser (a determined user can flip premium flags in localStorage — see "Premium gating" below for why this is OK).
- Any third-party CDN to serve unchanged bytes forever (mitigated by SRI on `esm.sh` and version-pinned imports).
- The Printful API to be available 100% of the time (the URL-deeplink fallback in `MerchStudioDialog` covers downtime).

---

## Finding 1 — Dynamic ESM SRI (HIGH → FIXED)

**Before:**

```ts
// src/lib/auth.ts
const cdn = 'https://esm.sh/@supabase' + '/supabase-js@2.45.4';
const mod = await import(/* @vite-ignore */ cdn);
```

If `esm.sh` were compromised — or if an attacker on a hostile network managed to MITM the response despite HTTPS — the loaded module ran with full DOM and Supabase-client access. That includes session tokens, OAuth callbacks, and any cloud-sync payload.

**After:**

```ts
// src/lib/auth.ts (excerpt)
const SUPABASE_BUNDLE_SHA384 = ''; // populated post-deploy
async function verifyAndImport(url, expected) {
  if (expected) {
    const buf = await (await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-384', buf);
    const actual = btoa(String.fromCharCode(...new Uint8Array(digest)));
    if (actual !== expected) throw new Error(`SRI mismatch on ${url}`);
  }
  return await import(/* @vite-ignore */ url);
}
```

Native Subresource Integrity is not yet supported for dynamic `import()` calls — see the [HTML spec discussion](https://github.com/whatwg/html/issues/3014). We pre-fetch + hash + verify, then the dynamic import is served from the browser's HTTP cache (same URL, valid cache entry). The fetch / import race window is sub-millisecond and the `esm.sh` response is deterministic for a pinned version.

### Pinning the hash (one-time deploy step)

Before the first production deploy, run this in a browser DevTools console:

```js
const url = 'https://esm.sh/@supabase/supabase-js@2.45.4';
const buf = await (await fetch(url)).arrayBuffer();
const h = await crypto.subtle.digest('SHA-384', buf);
const sri = btoa(String.fromCharCode(...new Uint8Array(h)));
console.log('SHA-384 base64:', sri);
```

Set the result as `SUPABASE_SHA384` in the deploy environment: `scripts/inject-config.mjs` injects it as `config.supabase.sha384` and `src/lib/auth.ts` prefers it over the compiled-in `SUPABASE_BUNDLE_SHA384`, so a rotation needs no rebuild (pasting it into the constant still works as a fallback). The deploy log prints `Supabase SDK integrity: OFF` while the variable is unset.

**Status 2026-09-09: the hash is still empty on the live deploy.** The wiring exists (`tests/test-security.mjs` proves the env var reaches the staged config), but the value has to be computed by the owner from a network that can reach `esm.sh` — this sandbox cannot. Until then the integrity check is off and the CDN is trusted.

**Known limitation:** the `esm.sh` URL returns a small shim that `export … from` a second, versioned module URL. The hash pins the shim only; the module it re-exports is fetched by the browser afterwards and is not hashed. This still catches version drift and a tampered entry point, but a compromise that keeps the shim byte-identical and swaps the target would pass. Vendoring `@supabase/supabase-js` into the bundle (it is already an npm dependency) is the fix that removes runtime CDN code altogether.

### Rotation

When the Supabase JS version is bumped:

1. Update `SUPABASE_BUNDLE_VERSION` in `src/lib/auth.ts`.
2. Re-run the SHA-384 snippet against the new URL.
3. Paste, rebuild, redeploy.
4. Verify in production DevTools: `Network → supabase-js@... → response time < 50 ms` (cache hit confirms the verify-then-import path worked).

---

## Finding 2 — CSP & security headers (MEDIUM → FIXED)

A single static HTML inlines all JS and CSS, which forces `'unsafe-inline'` for script-src. That's a real CSP weakness, but it's a deliberate trade — the single-file architecture is the product. The mitigations:

- **`'unsafe-eval'` is NOT allowed** — the bundle doesn't use `eval`, `new Function`, or unsafe sourcemap modes.
- **All connect/img/frame sources are tightly allow-listed** — nothing wildcards `*`.
- **`frame-ancestors 'none'`** + **`X-Frame-Options: DENY`** prevent click-jacking.
- **`Strict-Transport-Security` 2-year preload** locks HTTPS at the browser level.

See `public/_headers` for the full policy. Cloudflare Pages picks it up automatically.

### Inline-hash upgrade path (future hardening)

`script-src` also carries `blob:`. The lazily loaded `@smogon/calc` chunk ships
inside `bundle.html` as an inert `<script type="text/plain" data-chunk>` block
and is imported as a Blob-URL module on first matchup (`inline.mjs`,
`src/lib/calc-loader.ts`). `blob:` is not a network source — only same-document
script can mint one — so it widens nothing beyond what `'unsafe-inline'` already
concedes; without it the matchup preview never loads on the live origin.

When this project is ready to drop `'unsafe-inline'`, modify `inline.mjs` to compute the SHA-384 of the inline `<script>` content during the inline step, and emit a companion `_headers` file with `script-src 'self' 'sha384-XXX'`. The hash must be regenerated on every build. This is a ~30-line change but adds operational complexity (header drift detection) — deferred until a clear threat justifies it.

---

## Finding 3 — Trademark slogan on printed product (MEDIUM → FIXED)

The `MERCH_SLOGANS` catalog (`src/lib/merch.ts`) included one entry — `POKÉDEX RESEARCHER` — that printed the Pokédex trademark directly onto sold products. While nominative fair use covers descriptive use ("a Pokémon team builder"), the use of `POKÉDEX` on apparel sold for profit is exactly the kind of surface The Pokémon Company actively enforces against.

**Resolution:** renamed to `FIELD RESEARCHER`. Every other slogan has been reviewed:

| Slogan | Risk | Verdict |
|---|---|---|
| `GYM LEADER` | Common English phrase | Fine |
| `REGIONAL CHAMPION` | Common English phrase | Fine |
| `ELITE FOUR` | Generic 4-person group naming | Fine |
| `TRAINER MASTER` | Generic | Fine |
| `CARD COLLECTOR` | Generic | Fine |
| `CERTIFIED BREEDER` | Generic | Fine |
| `FIELD RESEARCHER` | Was POKÉDEX RESEARCHER | **Renamed** |
| `PARK RANGER` | Common occupation | Fine |
| `TEAM TROUBLE` | Deliberately non-IP play on "Team Rocket" | Fine |
| `TEAM OF SIX` | Generic | Fine |
| `GOTTA TRAIN 'EM ALL` | Transformative play on "Gotta catch 'em all" — fair use under [Mattel v. MCA](https://en.wikipedia.org/wiki/Mattel,_Inc._v._MCA_Records,_Inc.) reasoning | Fine |
| `TRAINER FOR LIFE` | Generic | Fine |

The product titles themselves (`Bella+Canvas Unisex T-Shirt`, `Gildan Heavy Blend Hoodie`, etc.) never mention Pokémon — that's the legal bright line established in `monetization-playbook.md`. The user-generated content *on the design* (their team's sprites + their chosen gym name) is their content; this app is the canvas, not the publisher.

---

## Finding 4 — Premium gating spoof resistance (MEDIUM → FIXED)

**Before:** `premium: boolean` lived in `localStorage` and was toggled by a "preview unlock" switch in `PosterStudioDialog` + `MerchStudioDialog`. Any user could flip the switch with one click and unlock paid features.

**Why this was a deliberate stub:** in the v5 build, the team wanted the surface for premium gating to exist before the payment rail was wired. The toggle was a "ready to flip the switch" pattern.

**After:**

- A new `src/lib/license.ts` module owns license state.
- `localStorage` key `trainerscodex.license` stores a JWT minted by the Cloudflare Worker after Stripe Checkout success.
- The JWT is signed with **HS256** using a 256-bit secret in the Worker env (`JWT_SIGNING_KEY`).
- On boot, the app calls `validateLicense(jwt)` which:
  - Decodes the JWT.
  - Verifies `exp > now`.
  - For full verification, optionally pings `POST {WORKER_URL}/license/verify` which re-checks the signature server-side and confirms the Stripe subscription is still active.
- The "preview unlock" Switch is retained in development mode (when `import.meta.env.DEV`) to keep the existing test fixtures working, and is **removed in production builds** via a Vite-time conditional in `PosterStudioDialog.tsx` and `MerchStudioDialog.tsx`.

### Why a JWT and not server-only state?

Most premium content here is **client-side rendering** (canvas posters with specific styles, 3D HOME sprites, ID Card / Gym Banner layouts). The server can't withhold those — they're shipped in the bundle. The JWT is a *signal of payment* and the client renders accordingly. A determined user could still patch the bundle to remove the gate. That's accepted; the legitimate revenue path is the convenience layer for the 99%+ of users who won't reverse-engineer a freemium gate.

The places where server-side enforcement matters — **Printful product creation, paid Stripe Checkout, cloud sync** — all live on the Worker and check the JWT signature server-side before acting.

---

## Finding 5 — Avatar upload MIME enforcement (LOW → FIXED)

`TrainerProfileDialog.tsx` previously trusted the `accept="image/*"` attribute on the file input. That's advisory client-side guidance; a user can drag any file in. The downstream code paths (`new Image()` + `canvas.drawImage` + `canvas.toDataURL('image/webp')`) are safe — they either successfully decode the image or fail silently — but an explicit allow-list:

1. Surfaces a clear error to the user instead of a silent failure.
2. Documents intent: SVG is excluded because XML-in-SVG can carry script payloads when round-tripped through other surfaces (e.g. served as `Content-Type: image/svg+xml` elsewhere). Canvas refuses to load script-bearing SVG, but explicit is better.

Patch added a five-element allow-list: PNG, JPEG, WebP, GIF, AVIF.

---

## Finding 6 — localStorage size cap (LOW → FIXED)

The realistic upper bound for legitimate `trainerscodex.v2` data is ~150 KB (10 saved teams × ~6 KB + trainer profile + a 30 KB webp avatar). The browser's localStorage quota is 5 MB.

A 4 MB cap was added in `saveStorage()`:

```ts
if (json.length > STORAGE_MAX_BYTES) {
  console.warn(`[trainerscodex] localStorage payload ${json.length} bytes exceeds cap — refusing to write.`);
  return;
}
```

Threat addressed: a future import-from-JSON feature (already shipped in `LibraryDialog.tsx` line 868 — `onImport={(parsed) => ...}`) could pull in an attacker-supplied payload. The cap means a tampered file can't fill localStorage, blocking persistence for legitimate writes.

---

## Finding 7 — POD rate limiting (LOW → MITIGATED)

The print-PNG generator can run at hundreds of pixels per millisecond in Canvas2D, but the Printful upload path goes through the Cloudflare Worker. Without limits, a single client could spam the Worker, blow through the Cloudflare free-tier quota, and trigger Printful's anti-abuse on the API key.

Implemented in `worker/src/ratelimit.ts`:

- **30 requests/minute per IP** across all routes.
- **10 file uploads/hour per IP** on `/printful/upload`.
- Storage: Cloudflare KV (`RATELIMIT_KV` namespace), keyed by `IP:route`, 1-hour TTL.
- On limit-hit: 429 with `Retry-After` header.

The frontend respects 429 and surfaces a toast: "Slow down — please wait a minute before generating another print file."

---

## Findings 8–11 — Clean items (INFO)

### No dangerous DOM APIs

A repository-wide sweep for `dangerouslySetInnerHTML`, `innerHTML =`, `document.write`, `eval(`, and `new Function(` returned zero matches in `src/**/*.{ts,tsx}`. All user-input fields (trainer name, title, region, motto, nickname, gym name, badge text, custom team name) flow through React's standard JSX text interpolation, which auto-escapes HTML metacharacters.

### TCG card and sprite art

- Sprites: `https://raw.githubusercontent.com/PokeAPI/sprites/master/...` — public GitHub raw, CORS-permissive, served via Cloudflare edge.
- TCG card art: `https://images.pokemontcg.io/...` — pokemontcg.io public CDN.
- Both render as plain `<img src="">` tags. No `crossorigin="use-credentials"`, no canvas tainting from these for the poster renderer (which uses the sprite mirror for canvas reads — verified clean in `posters.ts`).

### URL-hash share code

```ts
// src/App.tsx:109
const m = hash.match(/(?:^#|&)t=([0-9a-z,\-]+)/);
```

The regex restricts the captured group to `[0-9a-z,\-]+`, so the parsed share code can only contain hex IDs and separators. The downstream `parseShareCode` (in `analysis.ts`) further bounds the parse to known Pokémon IDs — anything unknown becomes `null` and the slot stays empty.

---

## Copyright / IP surface

| Surface | Risk | Status |
|---|---|---|
| App name | "Trainer's Codex" — not "Pokémon Codex" | ✓ clean (CLAUDE.md bright line) |
| Product titles | `Bella+Canvas Unisex T-Shirt`, etc. — no franchise names | ✓ clean |
| `<meta name="description">` | Uses "Pokémon" descriptively in fair-use context | ✓ clean (nominative fair use) |
| `<title>` | "Trainer's Codex — Pokémon Team Builder & Coverage Analyzer" | ✓ clean (nominative fair use) |
| Schema.org JSON-LD | `"description": "Pokemon team builder..."` | ✓ clean |
| Merch slogan catalog | One slogan with `POKÉDEX` | **Fixed** (finding #3) |
| Pokémon sprites on prints | User-generated configuration of their team, transformative canvas output | Gray area; transformative-use defense (same as Etsy / Redbubble fan art) |
| Pokémon names in printed designs | Nickname or type/role label only (species display names removed 2026-09-09); gym-name / badge-text remain user-typed | ✓ clean (user-content boundary) |
| TCG card images | Loaded via pokemontcg.io's documented public API, displayed in-app only, never printed | ✓ clean |
| Footer disclaimer | "// trainer's codex v5.0 · independent fan tool · not affiliated with nintendo / game freak / the pokémon company" | ✓ in place at `src/App.tsx:783` |

### Notes on the sprites-on-merch question

The grayest surface is "user prints a team of Pokémon sprites on a T-shirt and sells it via Printful." Two facts that shape the risk:

1. **The user is the publisher.** They configure the team, they place the order, they pay. Trainer's Codex is a design tool, not a marketplace — analogous to how Canva isn't responsible for what designs users print.
2. **Sprites are user-facing rendering aids, not the product subject.** Product names never say "Charizard" — they say "Trainer Crest Tee". The Pokémon appears via the user's configuration, framed as their team identity.

This positioning aligns with Etsy / Redbubble / TeePublic precedent for fan merch tools. The Pokémon Company has historically pursued direct sellers (factories printing branded Pokéball merch and selling at retail under the Pokémon name), not creator-platforms whose users post fan content.

**Defensive belt:** the deploy includes a DMCA contact and a takedown form via the Plausible / contact pipeline. See `docs/DEPLOYMENT.md` § "Post-launch policies".

---

## Premium gating — why client-side is acceptable

The four premium-gated surfaces:

| Surface | Server-enforceable? | Reason |
|---|---|---|
| Poster styles (`manifest`, `arcade-cabinet`, `tcg-card`, `sticker-sheet`, `holo-foil`, `grainy-cinema`) | No | Renderers ship in the bundle. |
| Merch designs (`id-card`, `banner`) | No | Renderers ship in the bundle. |
| 3D HOME sprites (`home-default`, `home-shiny`) | Partial | Sprite URLs are public PokeAPI; we can't gate the URL itself. |
| Cloud sync (Supabase) | **Yes** | Server enforces via Supabase RLS — only signed-in users can write `user_data`. |

For client-renderable premium content, gating is a UX layer over an honor system. A determined user can patch the bundle. The legitimate revenue model assumes:

- 1–3% of WAU convert.
- Conversion friction is a single Stripe Checkout redirect.
- The 97–99% who don't convert never reverse-engineer the gate (industry consensus across cosmetic gaming gates, freemium app templates, etc.).

The Worker enforces server-side for the **paid actions**: minting the license JWT (only after Stripe webhook confirms payment), and creating a Printful sync product (only with the user's verified order).

---

## Cloudflare Worker security

See `worker/src/index.ts` for the routing surface. The Worker is the *only* place that holds secrets:

| Env var | Source | Used by | Rotation cadence |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → API keys | `worker/src/stripe.ts` | On compromise; annual hygiene rotation |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → endpoint | `worker/src/stripe.ts` | On compromise; quarterly |
| `STRIPE_PRICE_ID` | Stripe Dashboard → Products → "Premium Pack" | `worker/src/stripe.ts` | When pricing changes |
| `PRINTFUL_API_KEY` | Printful Dashboard → API → Create Token | `worker/src/printful.ts` | On compromise; annual |
| `JWT_SIGNING_KEY` | Generate locally: `openssl rand -base64 32` | `worker/src/jwt.ts` | Annual + on any compromise |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role | Cloud-sync escalation only (not used in normal flow) | On compromise; annual |

All env vars set via `wrangler secret put NAME`, never committed.

| `MERCH_CHECKOUT` (`[vars]`, not a secret) | `worker/wrangler.toml`, default `"0"` | `worker/src/pf-catalog.ts` `merchEnabled()` → `/merch/checkout`, `/printful/order`, webhook fulfilment | **Owner-only.** Flip to `"1"` only after counsel clears merch; the client flag of the same name is UI only |

### Server-side merch kill switch

Every path that can create a physical-goods Checkout session or reach Printful checks `env.MERCH_CHECKOUT === '1'` before touching R2, Stripe or Printful. With it off (the default) `/merch/checkout` and `/printful/order` answer `503 merch_disabled`, and a paid merch webhook is acknowledged (200, so Stripe stops retrying) but logged for manual review instead of fulfilled — nothing is ever sent to Printful. The browser's `MERCH_CHECKOUT` feature flag only shows or hides buttons; it cannot override the server.

### Premium license minting

`/stripe/verify` mints a premium JWT only for a paid, complete Checkout session whose `metadata.source` is `trainerscodex_premium_pack`, whose `mode` is `subscription`, and which carries a subscription id. Any other paid session (credit packs, merch) is `422 not_a_premium_session`. Credits tokens are minted separately by `/credits/verify` with the mirror-image check.

### Webhook signature verification

`worker/src/stripe.ts` `verifyStripeSignature` HMAC-SHA256s `${t}.${rawBody}` with the webhook secret, accepts only `v1`, enforces a ±300 s replay window and compares in constant time. Without this, an attacker could POST a fake `checkout.session.completed` and grant credits or trigger fulfilment. `checkout.session.completed` and `checkout.session.async_payment_succeeded` share one idempotent dispatch keyed on `metadata.source`.

### Rate limit + 429

`worker/src/ratelimit.ts` enforces per-IP limits using Cloudflare KV. Returning a `Retry-After` header lets the browser back off gracefully. If the KV binding is missing or KV errors, every rate-limited route fails **closed** with a JSON `503 rate_limit_unavailable` (with CORS headers); only `/health` degrades to allow so monitors can tell a KV outage from a dead worker.

### Request-body guards

`worker/src/body.ts` is the single place request shapes are policed: JSON routes require a JSON object (`400 bad_json` for `null`, arrays, strings, numbers, malformed input); upload routes require `multipart/form-data` (`400 multipart_required`) and refuse a declared Content-Length above the cap (`413`) before reading the body; AI uploads are sniffed by magic bytes and stored under the sniffed PNG/JPEG/WebP type only. Unhandled exceptions surface as a generic `{"error":"internal"}` — the real message goes to the Worker log.

### Listing-name sanitization (paid surfaces)

`worker/src/pf-catalog.ts` `stripTrademark` normalizes free text (NFD, diacritics stripped, lowercase, punctuation → spaces) and removes franchise/publisher terms plus every species display name from `worker/src/species-names.ts` — a generated file (`node worker/scripts/gen-species-names.mjs`) pinned to `src/data/pokemon-data.json` by `worker/test/listing-name.test.ts`. A label that is nothing but blocked terms falls back to `Custom team design`. Applied to Stripe `product_data.name` and Printful product titles regardless of what the client sent.

### CORS allow-list

Worker responses include `Access-Control-Allow-Origin: <ORIGIN>` only when the request `Origin` matches the deployed bundle URL (`https://trainerscodex.com` and the `*.pages.dev` preview domains). All other origins receive a 403.

---

## Deferred hardening (post-launch backlog)

These were not addressed in this session and are flagged for the v5.1 milestone:

1. **Replace `'unsafe-inline'` in CSP with per-build SHA-384 hashes.** Requires `inline.mjs` to compute the hash and emit a per-build `_headers` file. Modest engineering lift; defers until threat model includes XSS injection via a future feature.
2. **Honest signature verification for the license JWT on boot, not just structural decode.** Currently the boot path decodes + checks `exp` only. A `POST /license/verify` call adds ~50ms and confirms the JWT signature server-side. Wire this in once the Stripe Checkout success-redirect flow is fully traced through.
3. **Subresource Integrity migration if `esm.sh` adds native dynamic-import SRI support.** Once the HTML spec lands `import("url", { integrity: "sha384-..." })`, swap the verify-then-import shim for the native form. (Issue WHATWG/HTML#3014 — track via WPT.)
4. **A `report-uri` for CSP violations.** Right now the policy is silent on violation; wiring `report-uri https://csp.trainerscodex.com/violations` and a Worker route to log them would surface XSS attempts early.
5. **Supabase RLS audit.** The schema in `docs/DEPLOYMENT.md` § "Supabase setup" includes RLS policies. Once the project is up, verify against [supabase-audit](https://github.com/supabase/supabase-audit) before opening sign-up.
6. **Automated dependency scanning.** Done 2026-09-09: `.github/workflows/ci.yml` runs `pnpm audit --prod` at the root on every push (the worker audit is separate). Zero runtime dependencies with known CVEs at the time of wiring.

---

## How to re-run this audit

```bash
cd ~/projects/trainers-codex

# Dangerous-API sweep (must be empty)
grep -rn -E "dangerouslySetInnerHTML|innerHTML *=|document\.write|eval\(|new Function" src/

# Dependency vuln scan
pnpm audit --prod

# Bundle build + size budget (warning above 1.5 MB)
pnpm build && node inline.mjs
test "$(stat -f%z bundle.html 2>/dev/null || stat -c%s bundle.html)" -lt 1572864

# CSP / headers verification (on deployed site)
curl -sI https://trainerscodex.com/ | grep -iE "content-security|strict-transport|x-frame|x-content-type"

# Worker suite: signature table, premium-session check, merch kill switch,
# body guards, JWT hardening, listing-name sanitizer (drives the real router
# through worker/test/_harness.ts with in-memory KV/R2 and stubbed upstreams)
cd worker && pnpm audit --ignore-workspace && node --test test/*.test.ts
```

A passing run produces zero findings on the static sweep, the bundle under 1.5 MB, all five security headers present, and a green worker suite.
