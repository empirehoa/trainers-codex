# Trainer's Codex — v6 Plan ("L99 Ultraplan")

**Authored:** 2026-05-27
**Status:** v5 live + v5.1 monetization wiring pending (see `scripts/deploy.sh`)
**Owner:** Jose / Empire Management Group

This document is the ruthlessly prioritized roadmap from "v5 live with localStorage" → "v6 social platform with paid trainer cards and AI-generated art". It captures every requested feature with effort, dependency, and ship-decision.

---

## Bucket A — Ship Today (this session)

Done in code, ready to commit. Total: ~6 hours engineering, ~0 dollars new infra.

### A1. Light / Dark mode toggle
- **Why:** Accessibility + user choice. Current bundle is dark-only with hard-coded `color-scheme: dark`.
- **How:** `next-themes` is already in dependencies. Add `<ThemeProvider>` in `main.tsx`, define `.light` palette in `index.css` mirroring `:root`, add a sun/moon button in the header that toggles. Persisted via `next-themes`' `localStorage` adapter.
- **Status:** Implemented.

### A2. Mobile-friendly close button on Pokémon detail dialog
- **Why:** Reported bug — user trapped on detail screen on mobile.
- **How:** shadcn `DialogContent` has a default X close, but it can be hidden by the scroll-locked dialog on small viewports. Add an explicit `← back` button in the header row and ensure `onOpenChange` fires reliably.
- **Status:** Implemented.

### A3. Apple Sign-In (code)
- **Why:** Jose asked. iOS users prefer Apple.
- **How:** Add `'apple'` to `AuthProvider` union in `lib/auth.ts`, append to `AUTH_PROVIDERS` array, add Apple svg in `SignInDialog.tsx` provider-icon switch.
- **Manual setup:** Apple Developer account ($99/yr) → create Service ID → configure return URLs → paste credentials in Supabase Auth → Providers → Apple. Documented in `docs/DEPLOYMENT.md`.
- **Status:** Code implemented. Apple Developer setup is your task post-deploy.

### A4. Held Items field on `TeamMember`
- **Why:** Standard competitive Pokémon configuration; user-requested.
- **How:** New `heldItem?: string` on `TeamMember` interface. New `HELD_ITEMS` constants array with ~28 common items (Leftovers, Choice Band, Life Orb, etc.). Surface in `TeamMemberConfigDialog` as a `<Select>` in the Identity tab.
- **Status:** Implemented.

### A5. Animated sprites (Gen 5 BW) — premium-gated
- **Why:** Premium incentive. Pokémon Showdown hosts animated Gen 5 sprite GIFs for every species, CORS-friendly.
- **How:** New `SpriteKind = 'animated-gen5' | 'animated-gen5-shiny'`. Renders `https://play.pokemonshowdown.com/sprites/ani/<name>.gif`. Premium gate in `TeamMemberConfigDialog` sprite picker.
- **Status:** Implemented.

### A6. 3-team free / unlimited premium gate
- **Why:** Premium incentive that doesn't feel punitive — 3 teams covers casual use; superusers pay.
- **How:** Check `savedTeams.length >= 3 && !premium` in `App.tsx` `saveCurrentToLibrary`; surface upgrade CTA via toast + Library footer.
- **Status:** Implemented.

### A7. Trainer Card merch design (basic)
- **Why:** Top-requested feature; trainer card is the iconic Pokémon design surface.
- **How:** New `'trainer-card'` design in `merch-renderers.ts`. Layout: trainer photo/avatar + name + region + 8 badge slots (claimed badges shown filled, unclaimed dimmed) + 6-mon party row + signature mon highlight. Available on poster + T-shirt + ID Card SKUs.
- **Status:** Implemented (badge data + visual layout; badge-claim mechanism is Bucket B).

### A8. `v6-PLAN.md` (this document)
- **Status:** Done.

---

## Bucket B — Ship This Week (next 1-3 sessions)

Designed; needs server-side work + 3rd-party API integration. Effort: 2-3 days each.

### B1. AI-generated trainer card (anime-style, from user photo)
- **What:** User uploads their face photo, picks vibe, AI generates an anime-style trainer with their face + a chosen starter + 6-mon team using the @kingbulljs prompt template.
- **Stack:** `fal.ai/models/fal-ai/nano-banana/edit` (Gemini 2.5 Flash Image, $0.039/image, image-to-image with prompt). Alternative: Replicate's `flux-redux-schnell` or `bytedance/seedream-3`.
- **Flow:**
  1. User uploads photo → client compresses to 1024×1024 → POSTs to Worker `/ai/trainer-card`.
  2. Worker stores photo in R2 (24h TTL).
  3. Worker calls fal.ai with a templated prompt:
     ```
     Create an anime-style Pokémon trainer card based on the uploaded photo.
     - Preserve the subject's face exactly
     - Outfit: ${outfitChoice} (default: trainer-style hoodie + jeans)
     - First Partner: starter chosen from ${starterChoice}
     - 6-Pokémon team cohesive with the photo's vibe
     - Include 1 Mega Evolution
     - Standard PokéBalls + 1-2 GreatBall/UltraBall
     - 2% chance: 1 shiny with subtle sparkle
     - Trainer stats: Seen 400-800, Caught 300-600, Joined ${year}
     - Strengths, Weaknesses, Playstyle, 1-2 line backstory
     - Signature Stat: "System Control" — higher for calm vibes
     - Clean, infographic layout, balanced, not cluttered
     ```
  4. Returns generated image URL → user reviews → can regenerate (charged again) or download.
- **Pricing:** Free users: $0.04 internal cost, charge $0.99/generation OR include 1 free + premium gives unlimited at $0.04 cost. Path B is simpler.
- **Effort:** ~1 day (Worker route, frontend dialog, prompt templating, fal.ai key handling).
- **Status:** Worker scaffold added (`worker/src/ai.ts`); frontend dialog deferred.

### B2. AI-generated team art (Roblogs hyperrealistic 3D prompt)
- **What:** User uploads photo + selects up to 6 mons; AI generates a hyperrealistic 3D team portrait with the user as the trainer in the center, mons surrounding, low-angle dominant pose.
- **Stack:** Same fal.ai endpoint or `fal-ai/seedream-3.0` (better at multi-subject composition).
- **Prompt template (from Roblogs):**
  ```
  Take this person as reference + render in hyperrealistic 3D, extreme close-up.
  All characters standing, facing forward, prideful and looking down on the viewer.
  Low angle, chin up, eyes directly at camera from above.
  Dominant attitude. Cold tones, blurred background with lights/shadows + mist.
  8K resolution, skin texture, hair root detail, cinematic lighting, CGI texture.
  3:4 aspect ratio. Pokémon smaller than the person.
  Person in center with PokéBall, anime-protagonist pose, modern young-adult outfit
  in the Pokémon world. Preserve facial features strictly.
  ```
- **Effort:** ~6 hours (mostly UI; backend route is the same as B1 with different prompt template).
- **Status:** Worker route scaffold supports both. Frontend dialog deferred.

### B3. Photo upload for poster backgrounds (non-AI)
- **What:** User uploads their own photo as a poster background; team renders composited on top in the chosen style.
- **How:** Extend `TrainerProfileDialog`'s upload pipeline into `PosterStudioDialog`. Add new `userPhotoDataUrl?: string` prop threaded through `posters.ts` renderers.
- **Effort:** ~3 hours.
- **Status:** Not started; PRD complete.

### B4. Cloud-sync extension to held items + animated sprite preference + premium flags
- **What:** Existing Supabase schema covers `trainer + teams jsonb`. Need to verify new fields (heldItem, sprite='animated-gen5') survive the round trip. Should already work since they're inside `teams jsonb`.
- **Effort:** ~30 min validation only.
- **Status:** No code change needed; smoke test in Bucket B testing pass.

### B5. Custom outfits / trainer character beyond avatar
- **What:** User picks outfit, accessories, hair color from a presets list (not AI).
- **How:** Extend `TrainerProfile` with `outfit?: string`, `hairColor?: string`, `accessory?: string`. Add a tab in `TrainerProfileDialog`. Render in trainer card.
- **Effort:** ~4 hours.
- **Status:** Not started; trumped in priority by B1 (AI trainer card supersedes this for most users).

---

## Bucket C — Ship This Month (1-2 weeks each)

Real product features needing schema, backend, and admin workflows. Defer until v6 traffic justifies the build.

### C1. Friends + follow teams
- **Schema:** new Supabase tables:
  ```sql
  create table profiles (
    user_id uuid primary key references auth.users(id),
    handle text unique not null,
    bio text,
    avatar_url text,
    is_public boolean default true,
    created_at timestamptz default now()
  );

  create table friendships (
    requester uuid references profiles(user_id),
    requested uuid references profiles(user_id),
    status text check (status in ('pending','accepted','blocked')),
    created_at timestamptz default now(),
    primary key (requester, requested)
  );

  create table team_follows (
    follower uuid references profiles(user_id),
    team_id uuid references public_teams(id),
    created_at timestamptz default now(),
    primary key (follower, team_id)
  );

  create table public_teams (
    id uuid primary key default gen_random_uuid(),
    owner uuid references profiles(user_id),
    name text not null,
    members jsonb not null,
    trainer jsonb,
    is_public boolean default false,
    created_at timestamptz default now()
  );
  ```
- **UI:** Friends list panel, public profile pages at `/u/<handle>`, "Follow this team" button on shared team URLs.
- **Effort:** ~1 week (schema + RLS + 4 new dialogs + handle-validation).
- **Risk:** Public profile = moderation surface. Need report flow.

### C2. Team-vs-team battle simulator
- **Hard problem:** A real Pokémon battle simulator is months of work. Pokémon Showdown's open-source code (`pokemon-showdown-client` + `@pkmn/sim`) covers gens 1-9 + every quirky interaction.
- **Pragmatic v1:** Use `@pkmn/sim` as an npm package, run battles server-side in the Worker, return a turn-by-turn log + winner.
- **Effort:** ~3-4 weeks (integration + UI + battle replay viewer).
- **Risk:** `@pkmn/sim` is ~5MB; doesn't fit in Worker free-tier 10MB script limit. Solution: deploy as a separate paid Worker ($5/mo paid plan), or use a tier 2 service like Fly.io.
- **Defer until C1 ships and demand is proven.**

### C3. Gym Leader / Elite 4 / Champion win verification
- **What:** User submits a photo of their winning team screen → admin or AI-vision verifies → badge added to trainer profile → unlocks the relevant gym badge on their trainer card.
- **Schema:**
  ```sql
  create table game_badges (
    id text primary key,  -- e.g. 'kanto-brock', 'paldea-elite-4-grusha'
    region text, game text, leader text, badge_label text, badge_image_url text
  );

  create table user_badges (
    user_id uuid references profiles(user_id),
    badge_id text references game_badges(id),
    proof_image_url text,
    submitted_at timestamptz default now(),
    verified_at timestamptz,
    verified_by uuid references profiles(user_id),
    status text check (status in ('pending','approved','rejected'))
  );
  ```
- **AI vision:** Worker route that uses Claude Vision (`claude-haiku-4-5` is $0.80/M input tokens, $4/M output, plus vision tokens) to auto-screen submissions. Manual admin queue for ambiguous cases.
- **Effort:** ~1 week MVP (admin queue + AI screening + badge display on profile + trainer card).
- **Risk:** Photo content moderation (faces, inappropriate imagery) — use Cloudflare's AI image moderation route before storing.

### C4. Competitive leaderboards
- **What:** Track wins/losses per game, rank trainers within each region.
- **Depends on:** C3 (badge data feeds the leaderboard).
- **Effort:** ~3-4 days.

---

## Bucket D — Future / v7+

Park for now; not in current product fit.

- **D1.** Native iOS app via PWA + TestFlight wrap (Capacitor or similar).
- **D2.** Native Android app via Trusted Web Activities.
- **D3.** Real-time multiplayer team-vs-team battles (websocket Worker + Durable Objects).
- **D4.** Tournament brackets with prize pools (compliance: gambling regs).
- **D5.** Discord bot for team analysis (`/teamcheck @user`).
- **D6.** TCG deck-builder side feature (separate codex for the card game).

---

## Premium tier matrix (post-v6)

| Feature | Free | Premium ($4.99/mo) |
|---|---|---|
| Browse all 1,307 mons | ✓ | ✓ |
| Build teams, analyze, save | ✓ (3 teams) | ✓ (unlimited) |
| Filter chips, sorts, search | ✓ | ✓ |
| 12 poster styles | 6 free | 12 all |
| Merch Studio designs | Crest + Roster | + ID Card + Banner + Trainer Card |
| Animated Gen 5 sprites | — | ✓ |
| 3D HOME sprites | — | ✓ |
| Custom palette overrides | — | ✓ |
| Held items | ✓ | ✓ |
| Apple/Google/Microsoft sign-in | ✓ | ✓ |
| Cloud sync (Supabase) | ✓ | ✓ |
| Friends + public profile | ✓ | ✓ |
| Follow teams | ✓ (10 follows) | ✓ unlimited |
| Battle simulator | 5/day | unlimited |
| AI trainer card | — | 5/mo included, $0.99 each over |
| AI team art (Roblogs style) | — | 5/mo included, $0.99 each over |
| Badge verification submissions | 1/mo | unlimited |
| Print-on-demand merch | ✓ (every product) | ✓ |

The narrative: **free is generous, premium removes friction**. Every premium feature is "more of the same" not "different product". This keeps the freemium signal high and avoids the "paywalled essentials" backlash.

---

## Execution sequence

```
[Done] v5 live at https://trainerscodex.com
[Now]  Run ./scripts/deploy.sh → wires Stripe + Printful + Supabase
[Today] Ship Bucket A — quick wins
[Week 1] Ship B1 — AI trainer card (one feature; biggest ROI on the premium tier)
[Week 2] Ship B2 — AI team art + B3 photo upload (paired release)
[Week 3] Soft-launch on r/pokemon, r/stunfisk (free features only — let interest build)
[Week 4] Ship C1 — Friends + public profiles (social loop)
[Month 2] Ship C3 — Badge verification (community moat)
[Month 3] Ship C2 — Battle sim (the killer feature)
[Month 4] Hard-launch: Product Hunt + HN + Discord (all features live)
```

Hold the heavy-investment items (C2 battle sim, native apps) until you've validated demand with the lower-cost upgrades.

---

## v6 Engineering Sprints — Execution Log (updated 2026-06-01)

The four-sprint "competitively credible + legally bulletproof" pass before the
Worlds window (hard launch 2026-08-26). Worked in order; each gate = build clean
→ inline bundle → all existing tests pass → new tests added → committed.

| Sprint | Scope | Status | Commit |
|---|---|---|---|
| 1 | PokePaste/Showdown import-export + round-trip tests | ✅ green | `3b4a203` |
| 2 | Pokémon Champions format + Champions Megas + Mega gating | ✅ green | `a001134` |
| 3 | @smogon/calc matchup preview (damage ranges + speed tiers) | ✅ green | `f819a61` |
| 4 | Public trainer/team profiles — `/u/<handle>`, strict RLS, moderation | ✅ green | `0c4e922` |

**Test suite:** 12 suites, all green (`tests/run-all.mjs`). Sprint 4 added
`test-profiles.mjs` (10 tests); legal hardening added `test-merch-legal.mjs` (4).

### Legal hardening (shipped this run)

- **AI prompts (`worker/src/ai.ts`)** now carry an `LEGAL_ART_DIRECTION` block on
  both templates: original anime-inspired art, no copying/tracing of official
  artwork, logos, trade dress, or game UI. Prompts are server-authored only
  (never client-supplied) and persisted to R2 object metadata as an audit trail.
- **Image moderation hook** screens every uploaded photo before fal.ai when
  `MODERATION_API_URL` is set; flagged → 422, provider outage → 503 (fails
  closed). Skipped when unconfigured (optional-service pattern).
- **Merch bright-line** (`src/lib/merch.ts` `sanitizeListingTitle`): strips the
  Pokémon trademark + any species name from anything that becomes a public store
  listing. Enforced client-side in Merch Studio (full species list) and backed
  by a trademark strip server-side in `worker/src/printful.ts`.
- **Legal pages verified:** `public/legal.html` (ToS + privacy + "not affiliated"
  disclaimer) and `public/dmca.html` (takedown + counter-notice + designated
  agent → legal@trainerscodex.com) are present and current.

### Discipline gate

- **AI Studio degrades gracefully.** With no Worker/fal.ai key configured,
  `isWorkerConfigured()` is false → the generate button is disabled and a
  "requires the Cloudflare Worker… set FAL_API_KEY" notice shows. The feature is
  visibly gated, never broken — satisfying "wire fal.ai OR feature-flag-hide".

### Blocked on Jose (not shippable from code)

1. **fal.ai API key** — set `FAL_API_KEY` as a Worker secret to switch AI Studio live.
2. **R2 bucket** (Task #28) — create `trainerscodex-prints` + public subdomain
   `cdn.trainerscodex.com`; required for AI photo upload + merch print hosting.
   Add a 24-hour lifecycle rule on the `trainer-cards/` and `team-art/` prefixes
   (R2 has no per-object TTL; this is a bucket lifecycle policy, set in Cloudflare).
3. **Image-moderation provider** — stand up `MODERATION_API_URL` (+ key) so photo
   screening enforces rather than skips.
4. **DMCA designated agent** — register the agent with the U.S. Copyright Office
   DMCA Designated Agent Directory (dmca.copyright.gov, $6) using
   legal@trainerscodex.com; safe-harbor protection isn't perfected until filed.
5. **Stripe live** — flip from preview-unlock toggle to live Checkout when ready.
