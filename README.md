# Trainer's Codex

> Pokémon team builder + coverage analyzer + poster generator + print-on-demand merch — all in **one self-contained HTML file**.

[![status](https://img.shields.io/badge/status-v5_live-emerald)](https://trainerscodex.com)
[![bundle](https://img.shields.io/badge/bundle-1.21_MB-blue)](#)
[![mons](https://img.shields.io/badge/pok%C3%A9mon-1%2C307-orange)](#)
[![tests](https://img.shields.io/badge/tests-48%2F48-green)](#)

A single 1.21 MB `bundle.html` — zero install, zero accounts, works offline.
Drag-drop the file onto any web server and it just runs. Auth and cloud sync
unlock if you paste a Supabase config block; Stripe-gated premium and
real Printful integration unlock if you paste a Worker URL.

**Demo:** https://trainerscodex.com

---

## What it does

### Team building (free)

- **Browse all 1,307 Pokémon entries** — 1,025 base species + 282 form variants
  (71 Mega, 2 Primal, 19 Alolan, 20 Galarian, 16 Hisuian, 4 Paldean, 34
  Gigantamax, 4 Therian, 5 Origin, 1 Fusion, 1 Eternamax, 2 Crowned, plus all
  Deoxys/Rotom/Castform/Calyrex/Urshifu/Necrozma variants).
- **Filter chips**: all · base only · normal · legendary · mythical · mega ·
  gigantamax · regional · paradox · by type · by generation · by role.
- **Per-member configuration**: full PokéAPI learnset (4 moves, ability
  picker), shiny toggle, 6 sprite-variant choices, nickname, Tera Type
  (all 18 types with strategy hints).
- **Live Coverage Strip** above the team bar — composite 0–100 coverage
  score, "weak to" type pills (where 2+ members are weak with ≤1 resisting),
  "no hit on" gaps (types nothing can hit super-effectively), all updating
  live as the team fills in.

### Trainer profile (free)

- Name + title + region + favorite type + signature Pokémon + motto.
- 16 avatar options: 12 partner Pokémon + 4 icons + custom photo upload
  (resized to 256×256 webp client-side).

### Analysis (free)

- Full defensive matrix (18 types × 6 members), aggregate stat radar,
  threat detection (mons that 2HKO multiple team members), AI counter-team
  suggestion ("here's a 6-mon team that wrecks yours").
- Per-member offensive coverage map.
- 6 mainline Switch-era games supported with per-game progress bar:
  Let's Go, Sword/Shield, BDSP, Legends Arceus, Scarlet/Violet, Z-A.
- HOME-transfer step-by-step instructions for getting your team into your
  target game. Form-aware (Megas excluded from Switch-era, Gigantamax SwSh-
  only, Hisuian PLA/SV/PLZA-only, etc.).

### Poster generator (4 free + 8 premium styles)

- 12 art styles, all canvas-rendered, all 1080×1350 PNG (Instagram-ready):
  - Free: **Pixel CRT**, **Pixel Grid**, **Game Boy DMG**, **Polaroid Stack**,
    **Blueprint**, **Type Collage**
  - Premium: **Editorial (Manifest)**, **Arcade Cabinet**, **Trading Card Sheet**,
    **Sticker Sheet**, **Holographic Foil**, **Grainy Cinema**
- Trainer name + avatar + signature Pokémon + motto baked into each poster.
- One-click PNG download.

### Journey Mode (free) — a 3-minute trainer career sim

- Pick a name, region, starter, playstyle, and pace, then live a full career
  from age 10 to retirement in **12–20 chapters**. No battles are played; the
  sim stops at turning points and asks one question with 2–4 options.
- **Seeded and deterministic.** The same seed plus the same choices always
  produces the same career, so a run is shareable and replayable.
- Ends in a **Trainer Legend Card** — an archetype verdict
  ("THE UNDEFEATED", "CULT HERO OF KANTO"), your final six as silhouettes,
  career stats, a 0–999 score, and a **playable link back to the same seed**
  baked into the pixels. Share via Web Share / clipboard / download.
- **Daily Journey.** One shared seed per calendar day, with a local streak
  counter. Everyone plays the same journey; only the choices differ.
- Two CTAs on the result: open the final six **in the builder**, and (behind a
  flag) print the card as merch.
- Multi-language: English and Spanish complete, Portuguese and Japanese seeded.

Full design notes: [`docs/JOURNEY_MODE.md`](docs/JOURNEY_MODE.md).

### Print-on-demand merch (Merch Studio) — 12 products × 4 designs

- **Products**: Bella+Canvas tee · Gildan heavy cotton tee · Gildan heavy
  blend hoodie · Gildan crewneck · 11oz ceramic mug · small gaming mousepad ·
  XL 36"×16" desk mat · 4" die-cut sticker · 11×14 matte poster · 18×24 matte
  poster · canvas tote · iPhone snap case.
- **Designs**: Trainer Crest (free) · Champion Roster (free) · Trainer ID
  Card (premium) · Gym Banner (premium).
- **Customization**: gym name, region, title/slogan (8 preset chips + custom),
  year.
- **Output**: 300 DPI print-ready PNG at the product's exact print dimensions
  (T-shirt 3600×4800px, 18×24 poster 5400×7200px), transparent BG for
  apparel/totes/cases, full-bleed cream for posters/mugs/mousepads.
- **Order flow**: with a Worker deployed, "Order on Printful" uploads the
  PNG to your Printful store and creates a sync product with the design
  pre-attached. Without a Worker, it auto-downloads the print file + opens
  the vendor's product page so you can drag-drop and complete the order.

### Premium Pack ($4.99/mo) — unlocks

- 6 premium poster styles (Editorial, Arcade Cabinet, Trading Card Sheet,
  Sticker Sheet, Holographic Foil, Grainy Cinema)
- 2 premium merch designs (Trainer ID Card, Gym Banner)
- 3D HOME sprites in the per-member sprite picker
- Custom palette overrides on every poster style

### Cloud sync (free — Google/Microsoft/GitHub/Discord/Facebook/X sign-in)

- Supabase-backed. Trainer profile + saved teams sync across devices,
  debounced 1.5s after any local change.
- RLS-enforced — each user can only see their own data.
- Optional. Bundle works fully offline if you don't sign in.

---

## Architecture in one diagram

```
                            Cloudflare Edge
                            ┌──────────────────────────────────┐
   Browser ◄────────────────┤ Pages: bundle.html (1.21 MB)     │
   (your phone / laptop)    │      + _headers + robots.txt     │
                            │                                  │
                            │ Worker /stripe/* /printful/*     │
                            │   - JWT mint + verify            │
                            │   - Stripe Checkout sessions     │
                            │   - Stripe webhook receiver      │
                            │   - Printful API proxy           │
                            │   - Per-IP rate limit (KV)       │
                            │   - Print PNG R2 storage         │
                            └────────┬───────────────┬─────────┘
                                     │               │
                            Stripe   ▼               ▼ Printful API
                       api.stripe.com           api.printful.com
                                     │
                                     ▼
                            Supabase (auth + Postgres)
                            (optional — only when configured)
```

The whole frontend ships in `bundle.html`. The Worker is optional — it
unlocks paid Stripe Checkout and real Printful API integration. Without
the Worker, the bundle still works (with a freemium-preview dev toggle for
gating and a URL-deeplink fallback for Printful).

---

## Tech stack

- React 19 + TypeScript
- Vite (build), `inline.mjs` (single-file inliner)
- Tailwind CSS + shadcn/ui (Radix primitives)
- Canvas 2D for poster + merch rendering (no WebGL, no AI image gen at runtime)
- localStorage for default persistence
- Supabase JS (loaded from CDN with SHA-384 integrity verification)
- PokeAPI sprite mirror (CORS-friendly raw.githubusercontent.com)
- pokemontcg.io for TCG card lookups

### Bundle anatomy

| Layer | Size (gzipped) |
|---|---|
| React 19 + ReactDOM | ~45 KB |
| Radix UI + shadcn/ui primitives | ~30 KB |
| Tailwind CSS (Vite-extracted) | ~10 KB |
| App code (`src/**/*`) | ~25 KB |
| Pokémon data (1307 entries, 919 moves, 1307 learnsets, JSON-inlined) | ~120 KB |
| Poster + merch canvas renderers | ~12 KB |
| Sonner toasts + lucide icons (tree-shaken) | ~8 KB |
| **Total bundle.html gzipped** | **~311 KB** |

---

## Quickstart

```bash
git clone https://github.com/empirehoa/trainers-codex.git
cd trainers-codex
pnpm install
pnpm dev                    # http://localhost:5173 — Vite HMR
# or to build the shipping artifact:
pnpm build && node inline.mjs
open bundle.html            # works from file://
```

### Deploy

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the full step-by-step
runbook (domain → Cloudflare Pages → Supabase → Stripe → Printful → live).
End-to-end first-time deploy takes ~3 hours; subsequent deploys take 5 min.

---

## Project layout

```
src/
  App.tsx                          ← main shell, header, team bar, modals wired
  main.tsx                         ← React root
  components/
    ui/                            ← shadcn primitives (don't modify unless adding)
    codex/
      AnalysisSheet.tsx            ← side panel with defensive/offensive/threats/game-compat
      GameCompatibilitySection.tsx
      HelpDialog.tsx
      LibraryDialog.tsx
      LiveCoverageStrip.tsx        ← v5 — live weakness/coverage bar above team bar
      MerchStudioDialog.tsx        ← v5 — POD ordering UI (Printful API + URL-deeplink fallback)
      PokemonCard.tsx              ← grid card, shows form badges (MEGA/GMAX/ALOLA/...)
      PokemonDetailDialog.tsx
      PosterStudioDialog.tsx       ← 12-style poster picker
      PremiumControl.tsx           ← Stripe Checkout button / preview toggle
      ShareDialog.tsx
      SignInDialog.tsx             ← v5 — OAuth provider buttons (Supabase-backed)
      TCGCardsDialog.tsx
      TeamMemberConfigDialog.tsx   ← moves/abilities/shiny/sprite/nickname/teratype
      TeamSlot.tsx
      TrainerProfileDialog.tsx
      TypeChartDialog.tsx
      TypePill.tsx
  lib/
    analysis.ts                    ← defensive matrix, offensive coverage, threats, counter team, sharecode
    auth.ts                        ← Supabase adapter, SHA-384-verified CDN load
    compatibility.ts               ← form-aware game compat
    constants.ts                   ← TYPES, TYPE_COLORS, TYPE_CHART, ART_STYLES, GAMES, GENERATIONS
    license.ts                     ← Stripe Checkout client + JWT verify + Printful API client
    merch-renderers.ts             ← 300 DPI print PNG generators (4 designs)
    merch.ts                       ← 12-product POD catalog + URL-deeplink fallback
    pokemon.ts                     ← POKEMON_BY_ID lookup, sprite + learnset helpers
    posters.ts                     ← 12 canvas-based poster renderers (1080×1350)
    storage.ts                     ← localStorage v2 schema + migration + size cap
    types.ts
    utils.ts                       ← shadcn cn() helper
  data/
    pokemon-data.json              ← 1307 entries
    learnsets.json                 ← 1307 learnsets
    moves.json                     ← 919 moves
    species.json
worker/                            ← Cloudflare Worker (Stripe + Printful + JWT + rate limit)
  src/
    index.ts                       ← router, CORS, route table
    cors.ts                        ← origin allow-list
    ratelimit.ts                   ← per-IP per-route limits via Cloudflare KV
    jwt.ts                         ← HS256 license JWT mint + verify
    stripe.ts                      ← Checkout sessions + webhook receiver
    printful.ts                    ← upload + sync-product creation
  wrangler.toml
  tsconfig.json
public/
  _headers                         ← CSP + HSTS + X-Frame-Options for Cloudflare Pages
  robots.txt
  favicon.svg
  icons.svg
docs/
  SECURITY.md                      ← audit + threat model + hardening status
  DEPLOYMENT.md                    ← step-by-step deploy runbook
inline.mjs                         ← bundle.html generator
CLAUDE.md                          ← AI-context for future Claude Code sessions
HANDOFF.md                         ← project state at v5
monetization-playbook.md           ← merch math, launch funnel, growth plan
```

---

## Testing

Two layers. **181 tests must pass before shipping.**

```bash
pnpm test:all      # both layers — this is what `pnpm ship` runs
pnpm test:unit     # vitest · 106 tests · pure logic, no browser
pnpm test:browser  # puppeteer · 7 suites / 75 tests · drives the built bundle.html
```

**Unit tests (vitest)** cover the pure modules — the Journey engine's
determinism, termination, and score bounds; date and seed handling; deep-link
parsing; streak arithmetic across DST and timezone travel; the analytics
payloads; and an i18n audit that fails if any translation key a content table
can emit is missing.

**Browser tests (Puppeteer + headless Chrome)** load the built `bundle.html`
from `file://` and exercise real UI flows:

```bash
node tests/test-v4-core.mjs         # 12 core (cards, search, save/load, library, help)
node tests/test-v4-features.mjs     # 12 v4 features
node tests/test-v5-features.mjs     # 12 v5 features (forms, badges, tera, coverage)
node tests/test-v5-extras.mjs       # 12 v5 extras (sign-in, merch studio)
node tests/test-posters.mjs         # 12 poster renders
node tests/test-stripe-printful.mjs #  6 payment + POD wiring
node tests/test-journey.mjs         # 27 Journey Mode
```

All network is blocked in the browser suite, so it also proves the offline
path — including that the Legend Card rasterises with no sprite access.

If puppeteer's bundled Chromium wasn't downloaded (common in CI images that
pre-provision a browser), set `PUPPETEER_EXECUTABLE_PATH`; the harness also
probes the usual system locations automatically.

---

## Constraints (the legal & architectural bright lines)

- **Single static HTML.** No Next.js port, no SSR. The bundle.html identity
  is the moat. Server-side code (Workers, Edge Functions) is fine for
  webhooks and the Printful API, but the frontend stays static.
- **Auth optional.** The bundle works on a host with zero config. Supabase
  loads only when `window.TRAINERS_CODEX_CONFIG.supabase` is set.
- **No "Pokémon" in the app name, domain, or product titles.** Legal bright
  line. Use only inside the app as the user's chosen subject (a Canva-style
  design tool boundary).
- **No tracking pixels.** Plausible is the only analytics. No Google
  Analytics, no Facebook Pixel, no Hotjar.
- **No build-time secrets in the bundle.** Stripe publishable keys + Supabase
  anon keys are public by design and fine in client code. The Stripe secret
  + Printful API key + Supabase service role key live only on the Cloudflare
  Worker.

---

## Browser support

- Chrome / Edge / Brave 90+
- Safari 15.4+
- Firefox 88+

All Canvas 2D features and `crypto.subtle` are required. WebKit on older iOS
(< 15.4) misses `OffscreenCanvas.convertToBlob` — affected users see a
graceful fallback in the poster studio.

---

## License

Source: MIT. Commercial use, fork, sell — go. The bundle, however, ships
with no warranty as fan art tooling. Pokémon, the Pokéball, all character
designs, and TCG card art are property of Nintendo / Game Freak / The
Pokémon Company. This project uses them under nominative-fair-use as a
descriptive fan tool — see `docs/SECURITY.md` § "Copyright / IP surface"
for the full positioning.

---

## Credits

- Built by Jose, CEO of [Empire Management Group](https://empirehoa.com)
- Sprite mirror: [PokéAPI](https://pokeapi.co)
- TCG card data: [pokemontcg.io](https://pokemontcg.io)
- v5 hand-off implementation by Claude Code (Anthropic), 2026-05-27
