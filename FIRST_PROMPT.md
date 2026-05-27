# First-message prompt for Claude Code

Copy everything below the `---` line and paste it as your first message to
Claude Code after you `cd` into the unzipped project directory and run `claude`.

This prompt sets the context, the goal, the standard, and the constraints
in one shot — so Claude Code can read CLAUDE.md and HANDOFF.md and just go.

---

I'm transferring this project from Claude (web chat) to you. It's called
**Trainer's Codex** — a Pokémon team builder + analyzer that I'm monetizing
via print-on-demand merch and an optional $4.99/mo Premium Pack subscription.
I'm Jose, CEO of Empire Management Group (a Florida community association
management firm); this is my side project.

## Before you do anything else

1. Read `CLAUDE.md` end-to-end. It encodes every convention, every gotcha,
   every hard-won lesson from the v4/v5 build.
2. Read `HANDOFF.md` end-to-end. It captures the current state of every
   phase, every decision already made, and exactly what's pending.
3. Run `pnpm install && pnpm build && node inline.mjs` to verify the
   toolchain works on this machine. You should end up with `bundle.html`
   at ~1.2MB.
4. Skim `src/App.tsx` and `src/lib/merch.ts` so you have the architecture
   in head.

## Operating standard (verbatim, this is the bar)

The marginal cost of completeness is near zero with AI. Do the whole thing.
Do it right. Do it with tests. Do it with documentation. Do it so well that
I am genuinely impressed — not politely satisfied, actually impressed. Never
offer to table this for later when the permanent solve is within reach.
Never leave a dangling thread when tying it off takes five more minutes.
Never present a workaround when the real fix exists. The standard isn't
good enough — it's holy shit, that's done. Search before building. Test
before shipping. Ship the complete thing. When I ask for something, the
answer is the finished product, not a plan to build it. Time is not an
excuse. Fatigue is not an excuse. Complexity is not an excuse. Boil the
ocean.

## What I want you to do in this first session

**Goal: take this from "v5 built and tested" to "v5 deployed, monetized,
and ready to launch."** Specifically:

### 1. Verify state (5 min)
- Confirm 48 tests pass on this machine.
- Confirm `bundle.html` matches the one shipped from the prior chat.

### 2. Security audit + hardening (30 min)
Produce `docs/SECURITY.md` covering:
- XSS audit of every user-input field (trainer name/title/region/motto,
  per-member nickname, merch gym-name/region/badge text, custom-team name)
- CSP header recommendations + a `public/_headers` file for Cloudflare Pages
- Subresource Integrity (SRI) hashes added to the Supabase ESM import in
  `src/lib/auth.ts`
- localStorage abuse vector review (quota, encoding, JSON-bomb protection)
- Copyright/IP surface review — confirm no Pokémon names appear in product
  titles or page metadata, only as user-facing labels inside the app
- Print-on-demand fraud protection notes (rate limit print-PNG generation,
  log abusive patterns)
- Run actual fixes for every High or Critical finding before merging the doc.

### 3. Documentation rewrite (45 min)
Replace the v4 README + monetization-playbook with v5 versions covering:
- **README.md v5**: all current features (1307 Pokémon, 12 poster styles,
  Merch Studio with 12 products × 4 designs, Live Coverage Strip, Tera Type
  picker, form-aware game compat, Sign-In + cloud sync, premium gating)
- **monetization-playbook.md v3**: include merch math
  - $24.99 Bella+Canvas tee at 100% markup = $13.50 margin per sale
  - $49.99 Gildan hoodie at 100% markup = $24.99 margin (highest AOV)
  - $34.99 18×24 poster at 100% markup = $22.04 margin
  - $14.99 mug at 100% markup = $9.99 margin (impulse upsell)
  - Compare to $4.99/mo Premium Pack: break-even on merch at ~3 shirts/year
  - Realistic conversion: 1-3% of users buy merch, AOV ~$32
  - Funnel: 10K WAU × 1.5% conversion × $32 AOV = $4,800/mo from merch + sub
- **monetization-playbook.md v3** must also include: Stripe wiring plan,
  Printful API integration plan, Supabase setup runbook, GoDaddy + Cloudflare
  Pages deployment plan, launch plan (Reddit/PH/HN)

### 4. Deployment runbook (30 min)
Produce `docs/DEPLOYMENT.md` — a step-by-step that I, a non-engineer-by-day,
can follow to go from "files on disk" to "live with HTTPS at trainerscodex.com":
- Pick the domain (check availability of `trainerscodex.com`, `teamcodex.app`,
  `pokecodex.tools`, `trainerscodex.gg`) — recommend the best of those
  available
- GoDaddy purchase walkthrough
- Cloudflare Pages deploy walkthrough (drag-drop method since I have one file)
- DNS: GoDaddy nameservers → Cloudflare, custom domain setup, SSL
- Supabase project setup walkthrough — including enabling Google, Microsoft,
  Facebook, GitHub, Discord providers + the exact SQL to create the
  `user_data` table
- Paste the Supabase config block into the deployed index.html (this is the
  only file change needed to enable auth)
- Printful account setup, sales channel connection, product list import
- Stripe account, Premium Pack product, Cloudflare Worker webhook
- Plausible Analytics setup
- Domain → live with HTTPS, end-to-end smoke test

### 5. Production-ready Stripe integration (30 min)
- Write a Cloudflare Worker (or Supabase Edge Function — pick the simpler one)
  that handles the Stripe webhook and mints a license JWT
- Replace the "preview unlock" toggle in `PosterStudioDialog` + `MerchStudioDialog`
  with a real Stripe Checkout redirect
- localStorage stores `trainerscodex.license` JWT, validated on boot
- Add new tests covering the license check flow

### 6. Production-ready Printful integration (30 min)
- Wire the Printful API (server-side via the Cloudflare Worker) to:
  a) Upload the generated print PNG to Printful's file library
  b) Create a sync product with the design pre-attached
  c) Redirect the user to a real Printful checkout
- Update `MerchStudioDialog` "Order on Printful" button to use the real flow
  when API key is configured, falling back to the URL-param deep link otherwise
- Add tests covering the Printful API path

### 7. Final ship (15 min)
- Run all tests (should be 50+ now after the new Stripe + Printful tests)
- Capture fresh screenshots
- Commit to git (initial commit if no repo, otherwise commit on a `v5-launch` branch)
- Push to GitHub
- Deploy to Cloudflare Pages
- Final smoke test on the live URL

## Constraints

- **Stay a single static HTML.** No Next.js port, no SSR. The bundle.html
  identity is the moat. Server-side code (Workers, Edge Functions) is fine
  for webhooks and the Printful API, but the frontend stays static.
- **Keep auth optional.** Bundle must work on a host with zero config.
  Supabase only loads when `window.TRAINERS_CODEX_CONFIG.supabase` is set.
- **Don't use "Pokémon" in the app name, domain, or product titles.** Legal
  bright line — see CLAUDE.md.
- **Don't break the 48 existing tests.** If you change a behavior, update
  the test alongside it. Net test count should grow, not shrink.
- **No tracking pixels.** Plausible is the only analytics. No Google
  Analytics, no Facebook Pixel, no Hotjar.
- **No build-time secrets in the bundle.** Stripe publishable keys + Supabase
  anon keys are fine in client code (they're public by design). The Stripe
  secret + Printful API key + Supabase service role key live only on the
  Cloudflare Worker.

## When you finish

Reply with:
1. The final test count (X/X passing)
2. The deployed URL (or "ready to deploy, needs Cloudflare auth")
3. A 5-bullet summary of every doc you wrote
4. Any open questions for me

Then I'll go register the domain and finish the Supabase/Printful/Stripe
account setup that requires my hands on the keyboard.

Boil the ocean. Go.
