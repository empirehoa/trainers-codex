# Trainer's Codex — CLAUDE.md

This file is loaded automatically by Claude Code when working in this repo.
It encodes conventions, constraints, and hard-won gotchas so you don't have to
rediscover them.

## What this project is

**Trainer's Codex** is a Pokémon team builder + analyzer that ships as a single
self-contained HTML file. Users build a team of 6 Pokémon (from 1307 entries
including all forms), analyze defensive/offensive coverage, customize movesets +
shinies + Tera types, see live coverage scoring, generate Instagram-ready
posters in 12 art styles, and order their team as print-on-demand merch
(T-shirts, hoodies, mugs, posters, mousepads, stickers, totes, phone cases).

The app's identity hooks: single static HTML, works offline, embeds every
piece of Pokémon data (1307 species + 919 moves + complete learnsets, ~200KB +
360KB JSON inlined), no accounts required, optional cloud sync via Supabase.

**Owner:** Jose, CEO of Empire Management Group (Florida CAM firm, 250+
communities). This is his side project. He's monetizing it via POD merch sales
(primary) and an optional $4.99/mo Premium Pack (secondary).

## Operating principle

> "The marginal cost of completeness is near zero with AI. Do the whole thing.
> Do it right. Do it with tests. Do it with documentation. Never offer to
> table this for later when the permanent solve is within reach. Never leave
> a dangling thread when tying it off takes five more minutes. Never present
> a workaround when the real fix exists. The standard isn't good enough — it's
> holy shit, that's done. Search before building. Test before shipping. Ship
> the complete thing."

Treat this as the project's North Star. Don't ask "should I also do X" — if X
finishes the job, do X.

## Tech stack

- **React 19 + TypeScript** — UI
- **Vite** — build (`pnpm build` runs `tsc -b && vite build`)
- **Tailwind CSS** — styling
- **shadcn/ui** (Radix primitives) — accessible dialogs/sheets/tabs/selects/switches
- **Lucide React** — icons
- **Sonner** — toast notifications
- **Canvas API** — poster + merch renderers (no WebGL, no AI image gen at runtime)
- **localStorage** — default persistence
- **Supabase JS** (loaded from CDN at runtime, optional) — auth + cloud sync
- **PokeAPI sprite mirror** — `raw.githubusercontent.com/PokeAPI/sprites/...` (CORS-friendly)
- **pokemontcg.io** (runtime) — TCG card lookup

## File layout

```
src/
  App.tsx                          ← main shell, header, team bar, modals wired
  main.tsx                         ← React root
  components/
    ui/                            ← shadcn primitives (don't modify unless adding)
    codex/                         ← all custom components
      AnalysisSheet.tsx            ← side panel with defensive/offensive/threats/game-compat
      GameCompatibilitySection.tsx
      HelpDialog.tsx
      LibraryDialog.tsx
      LiveCoverageStrip.tsx        ← v5 — live weakness/coverage bar above team bar
      MerchStudioDialog.tsx        ← v5 — POD ordering UI
      PokemonCard.tsx              ← grid card, shows form badges (MEGA/GMAX/ALOLA/...)
      PokemonDetailDialog.tsx
      PosterStudioDialog.tsx       ← 12-style poster picker
      ShareDialog.tsx
      SignInDialog.tsx             ← v5 — OAuth provider buttons (Supabase-backed)
      TCGCardsDialog.tsx
      TeamMemberConfigDialog.tsx   ← moves/abilities/shiny/sprite/nickname/teratype
      TeamSlot.tsx                 ← bottom-bar slot, shows tera gem + shiny sparkle
      TrainerProfileDialog.tsx
      TypeChartDialog.tsx
      TypePill.tsx
  lib/
    analysis.ts                    ← defensive matrix, offensive coverage, threats, counter team, sharecode
    auth.ts                        ← v5 — Supabase adapter loaded from CDN only if config present
    compatibility.ts               ← form-aware game compat (megas excluded from Switch-era, etc.)
    constants.ts                   ← TYPES, TYPE_COLORS, TYPE_CHART, ART_STYLES (12), GAMES, GENERATIONS
    merch.ts                       ← v5 — 12-product POD catalog + Printful/Printify URL builders
    merch-renderers.ts             ← v5 — print-ready PNGs at 300 DPI (4 designs)
    pokemon.ts                     ← POKEMON_BY_ID lookup, sprites, learnsets, generation logic
    posters.ts                     ← 12 canvas-based poster renderers (1080×1350)
    storage.ts                     ← localStorage v2 schema + migration from v1
    types.ts                       ← Pokemon, TeamMember, TrainerProfile, FormCategory, Move, etc.
    utils.ts                       ← shadcn cn() helper
  data/
    pokemon-data.json              ← 1307 entries (1025 base + 282 forms), ~200KB
    learnsets.json                 ← 1307 learnsets, ~360KB
    moves.json                     ← 919 moves, ~92KB
    species.json                   ← ~56KB
inline.mjs                         ← bundle.html generator (regex-based Vite dist inliner)
```

## Build + bundle workflow

The shipped artifact is a single HTML file at `bundle.html` (~1.2MB unzipped,
~310KB gzipped). The flow:

```bash
pnpm install                       # first time only
pnpm build                         # vite build → dist/
node inline.mjs                    # → bundle.html (inlines CSS + JS from dist/)
```

`inline.mjs` is the trick that makes this work as a static single-file. It
reads `dist/index.html`, swaps the `<link>` and `<script>` tags for inline
`<style>` and `<script>` blocks pulling from `dist/assets/`, and writes
`bundle.html`. The result drops onto any static host.

## Test commands

Tests live in `/tmp/test-*.mjs` (Puppeteer + headless Chrome). They load
`bundle.html` from `file://` and exercise real UI flows. **48 tests must pass
before shipping:**

```bash
cp bundle.html /tmp/bundle-test.html
node /tmp/test-v4.mjs              # 12 core tests (cards, search, save/load, sheet, library, help)
node /tmp/test-v4-features.mjs     # 12 v4 features (legendary filter, shiny, profile, game compat, poster studio)
node /tmp/test-v5.mjs              # 12 v5 features (forms, badges, live coverage, tera, 12 styles, form-aware compat)
node /tmp/test-v5-extras.mjs       # 12 v5 extras (sign-in, merch studio, product picker, customization, preview)
node /tmp/test-posters.mjs         # 8 v4 poster renders
node /tmp/test-posters-v5.mjs      # 12 poster renders (v4 + v5)
```

If `/tmp/test-*` doesn't exist after a Claude Code restore, the canonical
versions are described in HANDOFF.md and can be regenerated.

## Hard-won gotchas

These are mistakes that cost time in the v4/v5 build. Don't re-make them.

1. **Radix components need real mouse events, not synthetic `.click()`.** When
   testing tabs, switches, or select triggers in Puppeteer, use
   `page.mouse.click(x, y)` after `getBoundingClientRect()`. `element.click()`
   inside `page.evaluate()` does nothing on Radix internals.

2. **Empty-string SelectItem value crashes Radix Select.** Use a sentinel like
   `'_none'` and map it back to `undefined` in handlers. See
   `TrainerProfileDialog.tsx` lines 35-46 for the pattern.

3. **PokeAPI form IDs are > 10000.** Charizard Mega X is `10034`, not `6.5`.
   When computing generation for game-compatibility, look at `baseSpeciesId`
   (field `sp` in raw data) — forms inherit their species's gen. See
   `pokemon.ts` `getGenForId` + the `genSource` logic.

4. **Form-specific game gating overrides generation gating.**
   - Megas/Primals: never in any Switch-era game (return false unconditionally)
   - Gigantamax: only `swsh`
   - Alolan: gen 7+ but not lgpe/bdsp
   - Galarian: gen 8+ but not lgpe/bdsp
   - Hisuian: only pla/sv/plza
   - Paldean: only sv/plza
   - Eternamax: never (story-only)

   See `compatibility.ts` `isPokemonAvailableIn`.

5. **Lucide icon names shift across versions.** `Wand2` renders with class
   `lucide-wand-sparkles`, not `lucide-wand2`. When writing Puppeteer selectors,
   verify against the actual rendered DOM first.

6. **Filter chip text has middle-dot `·` not pipe.** "mega · primal" not
   "mega | primal". When matching in tests, use `/mega.*primal/i` not
   `startsWith('mega ')` (that also matches the "Mega Kanto" preset team).

7. **Auth must stay optional.** The bundle is a static HTML by default.
   Supabase loads from CDN *only* if `window.TRAINERS_CODEX_CONFIG.supabase`
   is set. Never make auth a hard dependency — that breaks the
   drop-on-any-static-host promise. See `lib/auth.ts`.

8. **Print-area aspect ratios.** Apparel = transparent background, print
   area centered in upper half of the canvas (gutter for shoulder seams).
   Mugs/posters/mousepads = full-bleed, cream paper background. See
   `merch-renderers.ts` `computeDesignRegion`.

9. **TypeScript narrowing on Canvas2D `roundRect`.** It's only in newer
   browsers and TS complains. Use `typeof (c as { roundRect?: unknown }).roundRect === 'function'`
   guard, never `if ('roundRect' in c)` (TS infers `never` for the else branch).

10. **The `category` filter chip lives in a `<FilterGroup>`.** Don't move the
    category logic into the main filter block — the chip-rendering pattern is
    `[CategoryFilter, string][]` tuples mapped to buttons. See `App.tsx`.

## Code style conventions

- **No defensive `try/catch` everywhere.** The codebase trusts its inputs.
  Catch only at the network boundary (fetch errors) and at the canvas
  boundary (image-load failures). Don't sprinkle `try/catch` to placate
  linters.
- **`font-mono` everywhere for UI chrome.** The codex's vibe is terminal-meets-
  scientific-instrument. Headings use `font-display` (Major Mono Display).
  Body copy in mons / dialogs uses `font-sans` only sparingly.
- **`text-[10px]` for labels, `text-xs` (12px) for body, `text-sm` (14px) for important UI.**
  No arbitrary text sizes outside this scale.
- **Tailwind not BEM/CSS modules.** Inline styles are fine for one-offs
  involving type colors (we already use TypeScript type-color lookups).
- **Components are functional, no classes.** Hooks only.
- **`useMemo` for any list filter, never recompute on every render.**

## Data update workflow

When you need to regenerate `pokemon-data.json` or `learnsets.json` (e.g.
when Gen 10 ships, or PokeAPI fixes a learnset bug):

```bash
# scripts live in /tmp/ in the current sandbox — for Claude Code, move to scripts/
node /tmp/fetch-forms.mjs          # sweep IDs 10001-10300 via api-data mirror
node /tmp/merge-forms.mjs          # classify by name → form category, attach baseSpeciesId
node /tmp/fetch-form-learnsets.mjs # learnsets for form IDs
```

The api-data mirror URL is
`https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2/pokemon/{id}/index.json`.
It's CORS-friendly and rate-limit-free.

## Premium gating

The `premium` boolean lives in `localStorage` and is controlled by a
"preview unlock" toggle in PosterStudioDialog and MerchStudioDialog. Premium-
gated content:

- **Poster styles** (4 of 12): `manifest` (Editorial), `arcade-cabinet`,
  `tcg-card` (Trading Card 6-up), `sticker-sheet`, `holo-foil`, `grainy-cinema`
  (mixed — see `ART_STYLES` in `constants.ts`)
- **Merch designs** (2 of 4): `id-card` (Trainer ID Card), `banner` (Gym Banner)
- **Sprite variants**: `home-default` and `home-shiny` in the per-member
  config dialog (the 3D HOME sprites)

**To wire the real Stripe flow:** replace the toggle in `PosterStudioDialog`
and `MerchStudioDialog` with a Stripe Checkout redirect, mint a license JWT
on the webhook, store in `localStorage` as `trainerscodex.license`, validate
on load. The toggle approach was a deliberate "ready to flip the switch"
pattern.

## When something breaks: ordered debugging

1. **First check: is the build clean?** `pnpm build 2>&1 | tail -15`.
2. **Second: did the test suite catch it?** Run all 48 tests.
3. **Third: load `bundle.html` in a real browser** (not just Puppeteer).
   Some bugs only appear on Chrome, not headless Chrome. Open DevTools and
   look at console.
4. **Fourth: localStorage corruption.** When in doubt: localStorage.clear()
   in DevTools. We migrate v1 → v2 schema in `storage.ts`; check that ran.
5. **Fifth: sprite 403s.** PokeAPI sprite mirror occasionally rate-limits.
   They're decorative; they fall back to placeholders. Don't fix this in
   code unless it's a hard 100% failure rate.

## Don't do these

- Don't introduce a build step that requires server-side code. Single HTML.
- Don't add a CSS framework other than Tailwind.
- Don't add WebGL or three.js. Canvas 2D is the rendering primitive.
- Don't fetch from random Pokémon APIs. Only PokeAPI (sprite mirror) and
  pokemontcg.io (TCG data). Both are public, fan-built, free.
- Don't add tracking pixels or analytics that exfiltrate user data. If we
  add analytics it'll be Plausible (privacy-first, no cookie banner).
- Don't include Pokémon names in the app title, domain, or store listings.
  "Trainer's Codex" is deliberately not "Pokémon Codex". This is the legal
  bright line — see `monetization-playbook.md`.
- Don't quote song lyrics, sell merch with copyrighted character art, or
  use the official Pokémon TCG card images for prints. We use sprite mirror
  art only for in-app reference and our own canvas renderers for prints.

## Where the project is going

Roadmap items in priority order (see HANDOFF.md for status):

1. Ship v5 (essentially done — bundle is built and tested)
2. Deploy to a real domain via Cloudflare Pages
3. Wire Supabase Auth + Postgres for cloud sync
4. Wire Printful API for one-click merch ordering (replaces URL-param flow)
5. Wire Stripe Checkout for Premium Pack subscription
6. Add Plausible Analytics
7. SEO content pages (best-pokemon-by-type, transfer-guide, etc.)
8. Launch on r/pokemon, r/stunfisk, r/PokemonTCG, Product Hunt, Hacker News
9. Discord community
10. Wrap as PWA → Play Store + TestFlight

## Reading order for new context

1. This file (CLAUDE.md)
2. HANDOFF.md (current state, what's pending, decisions made)
3. README.md (user-facing)
4. monetization-playbook.md (business strategy)
5. DEPLOYMENT.md (when you're ready to go live)
6. SECURITY.md (audit + hardening)
