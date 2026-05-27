# Trainer's Codex — HANDOFF.md

This document captures the state of the project as of the transfer to
Claude Code. Read CLAUDE.md first for conventions and gotchas.

---

## TL;DR

The project is functionally **v5** but documentation/deployment is incomplete.
Bundle is built, 48/48 tests pass, all visible features work. The remaining
work is:

1. Security hardening + content security policy
2. Deployment runbook (GoDaddy + Cloudflare Pages + Supabase wiring)
3. Real Printful API integration (currently URL-param deep-link only)
4. Real Stripe Checkout integration (currently a toggle stub)
5. Documentation polish (README v5, monetization playbook v3)
6. Going live: domain, hosting, OAuth provider setup
7. Launch (Reddit, ProductHunt, HN)

---

## Owner context

**Jose** — CEO of Empire Management Group (Florida community association
management, 250+ communities, ~$7.8M revenue 2025, ~75 employees). EMG's
tech stack: Vantaca/Vantaca IQ, HubSpot, SharePoint/M365, QuickBooks
(OAuth pending), Paylocity. Ryance Systems is the dev partner.

Trainer's Codex is Jose's side project. Stated goal: "make as much cash as
possible" via print-on-demand merch + a $4.99/mo Premium Pack subscription.
He wants this on a real domain via GoDaddy + login via Google/Microsoft/
Facebook/etc.

His operating preference (verbatim):

> "The marginal cost of completeness is near zero with AI. Do the whole
> thing. Do it right. Do it with tests. Do it with documentation... The
> standard isn't good enough — it's holy shit, that's done."

Treat this as the bar.

---

## What's shipped & tested

### Data
- **1,307 Pokémon entries** = 1025 base species + 282 alternate forms:
  - 71 Mega, 2 Primal
  - 19 Alolan, 20 Galarian, 16 Hisuian, 4 Paldean (regional variants)
  - 34 Gigantamax
  - 4 Therian, 5 Origin, 2 Crowned
  - 1 Fusion, 1 Eternamax, 1 Style
  - 7 Mode, 95 other (Deoxys forms, Rotom forms, Castform, Necrozma fusions,
    Calyrex Ice/Shadow Rider, Urshifu Single/Rapid, etc.)
- **1,307 learnsets** (every form has its own movepool from PokeAPI)
- **919 moves**, full type/category/power/accuracy/PP
- All data inlined as JSON. No runtime API calls for core data.

### Features
- **All 1,307 species browsable** with form-aware filter chips: all · base
  only · normal · legendary · mythical · mega · primal · gigantamax · regional
  · paradox
- **Form badges on cards**: color-coded ribbons (MEGA orange · PRIMAL red ·
  ALOLA orange · GALAR purple · HISUI green · PALDEA cyan · G-MAX red ·
  THERIAN blue · ORIGIN purple · FUSION pink · CROWNED yellow · E-MAX violet)
- **Per-member configuration dialog** with three tabs:
  - Moves & Ability — full PokeAPI learnset, 4-pick with STAB-aware auto-fill
  - Cosmetic — shiny toggle + 6 sprite variants (3D HOME premium-gated)
  - Identity — nickname + Tera Type picker (Gen 9, all 18 types with strategy hints)
- **Tera Type gem** on the team-bar slot (colored sphere indicator)
- **Live Coverage Strip** above the team bar — composite 0-100 coverage score,
  "weak to" type pills (where 2+ members are weak with ≤1 resists), "no hit
  on" gaps (types nothing can hit super-effectively), all updating live as
  the team fills in
- **Trainer Profile** — name/title/region/avatar (12 partners + 4 icons +
  custom photo upload at 256×256 webp)/favorite type/signature Pokémon/motto
- **Game Compatibility** in the analysis sheet:
  - 6 mainline games: Let's Go, Sword/Shield, BDSP, Legends Arceus, S/V, Z-A
  - Per-game progress bar with missing-Pokémon sprite strips
  - Recommended target game with step-by-step HOME transfer instructions
  - Form-aware: Megas flagged as "no Switch-era game", Gigantamax as "SwSh
    only", regional variants gated to their introduction-gen+ games
- **TCG Card Lookup** — live `pokemontcg.io` integration, rarity filter,
  TCGplayer + Cardmarket prices, external buy links
- **Poster Studio — 12 art styles**, all canvas-rendered, all 1080×1350 PNG:
  1. CRT Manifest (free) — amber-on-black terminal with scan lines
  2. Pixel Grid (free) — clean grid + pixel sprites on parchment
  3. Editorial (premium) — large official artwork, serif typography
  4. Game Boy (free) — 4-color DMG green with live sprite quantization
  5. Arcade Cabinet (premium) — neon synthwave, CRT vignette
  6. Trading Card Sheet (premium) — 6-up TCG cards with stats
  7. Polaroid Stack (free) — tilted photos on cork board
  8. Sticker Sheet (premium) — pastel polka-dot, die-cut circles
  9. **Holographic Foil (premium)** — iridescent rainbow foil, gold borders,
     sparkle/lens-flare overlays (v5 new)
  10. **Blueprint (free)** — navy technical drawing with measurement brackets
      and exploded-view arrows (v5 new)
  11. **Grainy Cinema (premium)** — soft-focus dreamy with film grain,
      cinematic letterboxing, teal-orange split-tone (v5 new)
  12. **Type Collage (free)** — DIY zine cut-paper with tape strips and
      marker scribble names (v5 new)
- **Merch Studio** (v5 new) — 12 POD products × 4 designs:
  - **Products** (with real Printful base costs):
    - Bella+Canvas T-Shirt — $8.95 base → $24.99 default
    - Gildan Heavy Cotton Tee — $6.50 → $19.99
    - Gildan Heavy Blend Hoodie — $22.50 → $49.99
    - Gildan Crewneck Sweatshirt — $18.50 → $42.99
    - 11oz Ceramic Mug — $4.50 → $14.99
    - Gaming Mouse Pad — $7.95 → $21.99
    - XL Desk Mat 36"×16" — $18.00 → $44.99
    - Die-Cut Vinyl Sticker 4" — $1.50 → $5.99
    - Poster 11"×14" — $4.50 → $18.99
    - Poster 18"×24" — $11.95 → $34.99
    - Canvas Tote Bag — $12.50 → $27.99
    - Phone Case (iPhone) — $11.95 → $29.99
  - **Designs**:
    - Team Crest (free) — circular gold-ringed badge with 6 sprites around a monogram, gym name arched on top, region+year arched on bottom
    - Champion Roster (free) — horizontal sprite strip with trainer name + region banner
    - Trainer ID Card (premium) — license-style badge with avatar, title, region, party slot row with Tera indicators, barcode footer
    - Gym Banner (premium) — tall pennant with 6 typed blocks stacked vertically
  - **Customization**: gym name, region/city, title/slogan (8 preset chips), year
  - **Markup ladder**: fair +50% · pro +100% · premium +150%, live margin display
  - **Output**: 300 DPI print-ready PNG at product's exact print dimensions
    (T-shirt = 3600×4800px, poster 18×24 = 5400×7200px), transparent BG for
    apparel/totes/cases, full-bleed cream for posters/mugs/mousepads
  - **Order flow**: "Order on Printful" auto-downloads the print file + opens
    Printful product page with `design_url` query param
- **Sign-In Dialog** (v5 new) — OAuth UI for Google/Microsoft/Facebook/GitHub/
  Discord/X(Twitter):
  - When `window.TRAINERS_CODEX_CONFIG.supabase` is NOT set: dialog shows
    setup-mode panel explaining exactly what to paste in index.html to enable
  - When set: dialog dynamically loads `@supabase/supabase-js@2.45.4` from
    esm.sh CDN and shows real OAuth buttons; on success, full session panel
    with avatar + sync status + manual-sync button
  - Cloud sync: trainer profile + saved teams pushed to a `user_data` Supabase
    Postgres row, debounced 1.5s after any local change, also pulled on
    sign-in (last-write-wins reconciliation)

### Build state
- `bundle.html` — 1.21 MB unzipped, 310 KB gzipped
- `pnpm build` is clean (only the standard ">500KB chunk" warning, which is
  expected for a single-file app)
- All 48 tests pass:
  - 12 core (cards, search, save/load, sheet, library, help, keybinds)
  - 12 v4 features (legendary filter, shiny toggle, profile, game compat, member config, poster studio)
  - 12 v5 features (1307 entries, mega/gmax/regional filters, form badges, live coverage, tera type, 12 styles, form-aware compat)
  - 12 v5 extras (sign-in dialog, merch button gating, merch studio open, 4 designs, 7+ products, markup ladder, customization, mockup preview, preview rerender)
  - 8 poster v4 renders + 12 poster v5 renders
- Zero JS exceptions in headless Chrome across all suites

---

## What's PARTIALLY done (architecture-only, no runtime config)

These pieces have full UI + adapter code but need real credentials/config to
actually work in production:

### Supabase Auth
- `lib/auth.ts` has the full adapter
- `SignInDialog.tsx` has the full UI
- **Pending**: Jose creates Supabase project → enables Google/Microsoft/etc.
  in Auth Providers → pastes URL + anonKey into a `<script>window.TRAINERS_CODEX_CONFIG = {supabase: {...}}</script>` block in deployed index.html
- **DB schema needed** (run in Supabase SQL editor):
  ```sql
  create table user_data (
    user_id uuid primary key references auth.users(id) on delete cascade,
    trainer jsonb,
    teams jsonb default '[]'::jsonb,
    updated_at timestamptz default now()
  );
  alter table user_data enable row level security;
  create policy "users see own" on user_data
    for select using (auth.uid() = user_id);
  create policy "users update own" on user_data
    for insert with check (auth.uid() = user_id);
  create policy "users modify own" on user_data
    for update using (auth.uid() = user_id);
  ```

### Premium subscription ($4.99/mo Premium Pack)
- All gating is in place via a `premium: boolean` in localStorage
- "Preview unlock" toggle in PosterStudioDialog + MerchStudioDialog
- **Pending**: replace toggle with Stripe Checkout redirect
  - Stripe → create $4.99/mo recurring product, get price ID
  - Cloudflare Worker or Supabase Edge Function to handle webhook + mint JWT
  - Store JWT as `trainerscodex.license` in localStorage
  - On boot, decode + validate → set premium = true

### Printful POD integration
- `lib/merch.ts` has the catalog with real base costs + Printful product codes
- `buildVendorOrderUrl` generates Printful deep-link URLs with `design_url` param
- "Order on Printful" auto-downloads the PNG and opens the URL
- **Pending**: real Printful API integration via OAuth
  - Jose creates Printful account → connects to a sales channel (Cloudflare Pages, Shopify, etc.)
  - Server-side: POST `/sync/products` with the design pre-uploaded to Printful's file library
  - Browser flow then redirects to a real checkout page on Jose's channel

---

## What's NOT done

### Phase 5 — Security hardening
- [ ] XSS audit of trainer profile / nickname / gym-name / motto fields
  (currently rendered via React's default escaping — verify no `dangerouslySetInnerHTML`)
- [ ] CSP header for the hosting platform (Cloudflare Pages → `_headers` file)
- [ ] localStorage abuse vectors review (size limits, encoding edge cases)
- [ ] Copyright/IP surface review (sprites referenced via CORS-friendly mirror,
  TCG via pokemontcg.io, no copyrighted character names in product titles)
- [ ] Subresource Integrity (SRI) hashes on the esm.sh Supabase load
  (currently no SRI — opportunistic CDN integrity)
- [ ] Rate limiting for any future API endpoints

### Phase 6 — Deployment runbook
A full step-by-step is needed for Jose. Recommended path:

- [ ] Register domain on GoDaddy (`trainerscodex.com`, `teamcodex.app`, or similar)
- [ ] Deploy to Cloudflare Pages (drag-drop `bundle.html`, free tier covers
  everything for the foreseeable future)
- [ ] Configure DNS: GoDaddy → Cloudflare (free DNS, faster CDN)
- [ ] Auto-SSL via Cloudflare
- [ ] Supabase project setup + OAuth provider wiring
- [ ] Printful account + sales channel + first product upload
- [ ] Stripe account + Premium Pack product
- [ ] Plausible Analytics

### Phase 7 — Final docs
- [ ] README v5 rewrite (covers Merch + Auth)
- [ ] monetization-playbook v3 (merch math: $24.99 tee × 100% markup = $13.50 margin, vs $4.99/mo Premium Pack — break-even at ~3 shirts/year per user)
- [ ] DEPLOYMENT.md (the runbook from Phase 6)
- [ ] SECURITY.md (Phase 5 output)

### Phase 8 — Launch
- [ ] Post to r/pokemon (3.4M members)
- [ ] r/stunfisk (200K, competitive battling — emphasize analyzer)
- [ ] r/PokemonTCG (400K — emphasize card lookup)
- [ ] Product Hunt
- [ ] Hacker News Show HN ("I built a self-contained Pokémon team analyzer in a single HTML file")
- [ ] Twitter/X account, weekly team-poster drops as marketing
- [ ] Discord server

---

## Decisions already made

These are locked in unless you have a strong reason to change. If you do
change one, update CLAUDE.md.

| Decision | Choice | Why |
|---|---|---|
| Hosting | Cloudflare Pages | Free tier easily covers, free SSL, global CDN, drag-drop deploy |
| Domain registrar | GoDaddy (Jose's preference) | Just preferences — Cloudflare Registrar would be cheaper but they're equivalent |
| Auth | Supabase | 50K free MAU, free OAuth for Google/Azure/Facebook/GitHub/Discord/Twitter, free Postgres for cloud sync |
| POD vendor | Printful (primary) + Sticker Mule (stickers only) | Best quality + best API + URL deep-linking works; Printify secondary if Jose wants higher margins |
| Payments | Stripe | Industry standard, 2.9% + 30¢, Checkout-as-URL means no PCI scope |
| Analytics | Plausible | Privacy-first, no cookie banner, $9/mo |
| Currency | USD only at launch | Add EUR/GBP after v6 |
| Domain ideas (in preference order) | `trainerscodex.com`, `teamcodex.app`, `pokecodex.tools` | First needs to be checked; "codex" is the brand |
| Pricing — Premium Pack | $4.99/mo | Under $5 psychological, less than 1 booster pack |
| Pricing — Merch markup default | 100% (pro tier) | Industry standard for POD branded merch |
| Bundle format | Single self-contained HTML | The whole identity — no build pipeline on host side |
| Default sprite source | PokeAPI sprite mirror on raw.githubusercontent.com | CORS-friendly, free, comprehensive |
| TCG data source | pokemontcg.io | Free API, comprehensive, well-maintained |

---

## Anti-decisions (things explicitly ruled out)

- ❌ **Don't sell merch with Pokémon names or sprites in the product title.**
  E.g., the product name is "Trainer Crest Tee" not "Mewtwo Mega Tee". The
  sprites appear in the user's design preview/print, but the product listings
  themselves never claim Pokémon as the subject.
- ❌ **Don't use "Pokémon" in the app name, domain, or store listings.**
  Trainer's Codex. That's the legal bright line.
- ❌ **Don't add a built-in price chart for cards (just link out to TCGplayer/Cardmarket).**
  Compounded copyright + financial-advice risk.
- ❌ **Don't add server-side rendering or a Next.js port.**
  The single-static-HTML architecture is the moat.
- ❌ **Don't add real-money in-app purchases beyond the Premium Pack and merch.**
  No loot boxes, no booster packs, no "buy 100 coins for $0.99".

---

## Suggested first session in Claude Code

A high-impact ~2-hour session for the first Claude Code run:

1. `cd trainers-codex && pnpm install && pnpm build && node inline.mjs` —
   verify the toolchain works on the new machine
2. Run all 48 tests to baseline
3. **Write `DEPLOYMENT.md`** — the runbook Jose follows to go live
4. **Write `SECURITY.md`** — the audit + hardening checklist
5. **Write `README.md` v5** — replaces the v4 README (covers Merch + Auth)
6. **Write `monetization-playbook.md` v3** — merch math, Stripe + Printful
   integration plans, the launch funnel
7. **Commit + push to a GitHub repo** (`gh repo create trainerscodex --public`)
8. **Deploy to Cloudflare Pages** via `wrangler` or the dashboard
9. (Optional) Register the domain via GoDaddy + DNS to Cloudflare
10. (Optional) Set up Supabase project + paste keys into the deployed
    `index.html` to wire auth

---

## File-by-file pending list

For when you want to grep your way to a TODO:

```
src/components/codex/PosterStudioDialog.tsx     ← Premium toggle → Stripe Checkout
src/components/codex/MerchStudioDialog.tsx      ← URL-param order flow → Printful API
src/lib/auth.ts                                 ← Add SRI hash to esm.sh import
src/lib/merch.ts                                ← Add Printify fallback if Printful API rate-limits
docs/DEPLOYMENT.md                              ← NOT YET WRITTEN
docs/SECURITY.md                                ← NOT YET WRITTEN
README.md                                       ← v4 — needs v5 rewrite
monetization-playbook.md                        ← v2 — needs v3 (merch + auth)
```
