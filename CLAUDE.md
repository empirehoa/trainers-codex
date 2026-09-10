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
    ui/                            ← shadcn primitives, 14 of them (see gotcha #24)
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
      journey/                     ← v6 — Journey Mode UI (see docs/JOURNEY_MODE.md)
        JourneyModeDialog.tsx      ← shell + state machine
        JourneySetup.tsx
        JourneyDecision.tsx        ← also exports ProgressHeader + StatStrip
        JourneyRecap.tsx
        JourneyResult.tsx          ← retired beat, card, share tiers, CTAs
        AreaMap.tsx                ← v12 — SVG route map, fills in as it's travelled
  journey/                         ← v6 — the sim. Pure TS, no React, no DOM.
    prng.ts                        ← mulberry32, FNV-1a, seed coercion, local dates
    types.ts
    content.ts                     ← regions, decision cards, verdicts, flavor layer
    engine.ts                      ← simulate(setup, choices) — pure + deterministic
    scoring.ts                     ← archetype-weighted 0-999 + verdict resolution
    deeplink.ts                    ← ?seed= / ?daily= parse + build
    streak.ts                      ← daily streak + one-free repair (local date strings)
    archive.ts                     ← v11 — daily archive, ?issue=N deep links
    ranks.ts                       ← v11 — score percentile + named rank tiers
    analytics.ts                   ← fire-and-forget Supabase REST inserts
    share.ts                       ← Web Share / clipboard / download tiers
    legend-card.ts                 ← canvas renderer, 1080×1350 + 300 DPI
    card-video.ts                  ← v11 — 9:16 clip, captureStream + MediaRecorder
    atlas.ts                       ← v12 — seeded region route maps (pure geometry)
    luck.ts                        ← v14 — skill-vs-luck: replay the seed 4 ways, decompose the score
    risk.test.ts                   ← v14 — 3,000-career sweep pinning "risk is a choice, not a tax"
    ranks.gen.test.ts              ← v14 — regenerates SCORE_PERCENTILES (GEN_RANKS=1), skipped otherwise
    *.test.ts                      ← vitest, colocated
  i18n/
    strings.ts                     ← EN + ES complete; PT + JA seeded
    useI18n.ts                     ← context + useI18n hook
    I18nProvider.tsx               ← provider component (kept separate from the
                                     hook: a file exporting both breaks Fast Refresh)
  seo/                           ← v12 — build-time static page generation.
    data.ts                        ← pure derivation: matchups, counters, copy, FAQ
    render.ts                      ← HTML templates (no DOM, no framework, no app bundle)
    *.test.ts                      ← vitest; sweeps all 1,307 rendered pages
  lib/
    flags.ts                       ← v6 — feature flags (defaults → config → ?ff=)
    analysis.ts                    ← defensive matrix, offensive coverage, threats, counter team, sharecode
    auth.ts                        ← v5 — Supabase adapter loaded from CDN only if config present
    compatibility.ts               ← form-aware game compat (megas excluded from Switch-era, etc.)
    constants.ts                   ← TYPES, TYPE_COLORS, TYPE_CHART, ART_STYLES (12), GAMES, GENERATIONS
    merch.ts                       ← v5 — 12-product POD catalog + Printful/Printify URL builders
    merch-renderers.ts             ← v5 — print-ready PNGs at 300 DPI (4 designs)
    pokemon.ts                     ← POKEMON_BY_ID lookup, sprites, learnsets, generation logic
    search-param.ts                ← v12 — `?q=` bridge from the reference pages into the builder
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
docs/
  RESEARCH_2026-09-07.md           ← deep-research report: what moves retention/sharing (cited, with refuted claims)
scripts/
  make-og-image.mjs                ← renders public/og-journey.jpg via puppeteer (`pnpm og`)
  gen-seo-pages.ts                 ← v12 — emits ~1,330 static pages + sitemap.xml (`pnpm seo`)
  inject-config.mjs                ← stages /tmp/tc-deploy for the Cloudflare deploy
public/
  _headers                         ← Cloudflare CSP + security headers
  _redirects                       ← 200 rewrite for /journey (preserves ?seed=)
  og-journey.jpg                   ← static OG card, 1200×630 (not inlined into the bundle)
  sw.js                            ← PWA service worker (see gotcha #21)
  (no sitemap.xml — it is generated; see "Static reference pages" below)
tests/
  harness.mjs                      ← puppeteer harness (newPage, runSuite, assertions)
  run-all.mjs                      ← suite orchestrator (`pnpm test:browser`)
  test-*.mjs                       ← 21 suites, 224 tests
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

## Static reference pages (v12)

`pnpm build` also runs `scripts/gen-seo-pages.ts`, which emits ~1,330 plain
static HTML files into `dist/` — one per species, one per form, one per type,
plus two hubs and a regenerated `sitemap.xml`:

```
dist/pokemon/index.html            hub, links all 1,307
dist/pokemon/<slug>/index.html     matchup chart, base stats, moves, evolution, counters
dist/type/index.html               the 18x18 chart
dist/type/<type>/index.html        per-type page + every member by BST
dist/sitemap.xml                   every URL above
```

**Why:** the whole product was one indexable URL. The dataset that makes the app
good — 1,307 species, 919 moves, every learnset — was invisible to search
because none of it was addressable. The comparable fan sites earn effectively
all of their organic traffic from one page per species; the data is the same,
the difference was purely that theirs had URLs.

Rules for this layer:

- It is **additive**. `bundle.html` is unaffected — nothing under `src/seo/` is
  imported by `App.tsx`, so Vite never bundles it.
- The pages load **no script and no external resource at all**: no sprite art,
  no fonts, no analytics, no app bundle. Asserted in `src/seo/render.test.ts`
  and again in the browser suite. Hotlinking third-party artwork onto 1,300
  indexed pages is a different IP posture than referencing it inside the tool —
  don't add images here without deciding that deliberately.
- Every page ends with a link to `/?q=<Display Name>`, read by
  `lib/search-param.ts`. That is the only conversion path from a search result
  into the product; `tests/test-seo-pages.mjs` guards it.
- `sitemap.xml` is generated, not committed. The old three-URL file in
  `public/` was deleted — a stale sitemap is worse than none.
- `scripts/inject-config.mjs` regenerates the pages straight into the staging
  directory at deploy time, so a deploy can't ship the app without them.

## Test commands

**CI runs all three layers on every push and pull request**
(`.github/workflows/ci.yml`). Before that workflow existed the suite only ran
when someone remembered to.

`pnpm lint` is a real gate — the tree is at **0 errors**, so any new one fails
CI. It carries 23 warnings from four react-hooks/react-refresh rules that are
set to `warn` in `eslint.config.js`: every violation predates the workflow and
sits in components whose fix is a restructure rather than an edit. The rationale
and the count to drive down are in that config; when it reaches zero, promote
them back to `error`.

Tests are committed under `tests/` (Puppeteer, drives the built `bundle.html`),
colocated `*.test.ts` files under `src/` (vitest, pure logic — scoped by
`vitest.config.ts`; do NOT let vitest glob `worker/`), and `worker/test/`
(node:test suites, run inside `worker/`). **All three layers must pass before
shipping:**

```bash
pnpm test:all      # vitest + puppeteer — what `pnpm ship` runs
pnpm test:unit     # vitest · 365 tests · engine, battles/badges/shinies/events, level economy,
                   #            money/rerolls/carry-forward, ranks, archive, card-video, atlas,
                   #            content health, i18n, deeplink, streak, analytics, prepare
pnpm test:browser  # puppeteer · 21 suites / 224 tests (incl. 44 Journey Mode, 16 responsive,
                   #            10 SEO pages — the last needs `pnpm build` for dist/)
(cd worker && node --test test/*.test.ts)   # 19 worker tests
```

Prefer a **vitest** test for anything that doesn't need a DOM — it runs in
milliseconds instead of seconds, and pure modules (the Journey engine, date
handling, link parsing) can be swept over thousands of inputs at that speed.
Reach for Puppeteer when the assertion is genuinely about rendering, browser
APIs, or the built bundle.

The browser harness (`tests/harness.mjs`) blocks all non-`file://` requests, so
the suite doubles as the offline-path check. It resolves a system Chromium when
puppeteer's bundled download was skipped — set `PUPPETEER_EXECUTABLE_PATH` to
override.

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

11. **`new Image()` has no timeout.** `onerror` fires for a refused or 404'd
    request, but a request that merely *hangs* (captive portal, dead proxy,
    throttled mobile, sprite mirror rate-limiting) never settles either way — so
    an `await` on it blocks forever and the user watches a spinner. Every sprite
    load in a render path needs an explicit timer that rejects and falls back.
    See `journey/legend-card.ts` `SPRITE_TIMEOUT_MS`.

12. **A `file://` origin serialises as `"file://"` with no host.** Anything that
    builds a shareable URL from `window.location.origin` must check for a real
    `http(s)` origin and fall back to the canonical host, or it prints
    `file://journey?seed=8843` onto a card. This matters here specifically
    *because* opening `bundle.html` locally is a supported use case. See
    `journey/deeplink.ts` `resolveOrigin`.

13. **Radix keeps dialog content mounted through its exit animation.** After
    closing a dialog the node is still in the DOM with `data-state="closed"` for
    a few hundred ms. In tests, poll for `!el || data-state === "closed"` —
    a fixed `sleep()` races the animation and flakes.

14. **First-match tables are order-dependent, and silently so.** The Journey
    verdict table is walked top-down and returns the first match, so a
    cross-archetype entry placed below an archetype's lower tiers can never
    fire. This shipped as a bug in the first draft (`CULT HERO` sat under
    `BRAWLER`, so no Aggro player could ever get it). Keep such tables ordered
    by descending threshold, conditional entries first at equal thresholds, and
    say so in a comment above the array.

15. **Don't short-circuit interpolation on a missing vars object.**
    `interpolate(tpl, vars)` must run the replace even when `vars` is
    `undefined`, or a caller that forgot to pass one leaves a literal `{seed}`
    on screen. See `i18n/strings.ts`.

16. **New i18n keys need an audit test, not vigilance.** Content tables
    reference translation keys as bare strings, so TypeScript can't catch a
    typo and the failure mode is a raw `journey.verdict.x.title` rendered in
    the middle of a share card. `i18n/strings.test.ts` enumerates every key the
    content layer can emit and asserts it resolves — extend it when you add a
    content table.

17. **Feature flags read at call time, never cached.** `lib/flags.ts` resolves
    defaults → `window.TRAINERS_CODEX_CONFIG.flags` → `?ff=NAME:0|1`. The URL
    layer exists so tests and QA can exercise both sides of a flag without
    editing the bundle; the config layer exists so a deploy can flip one
    without a rebuild. Don't memoise them.

18. **The browse grid is windowed — never render `visible` directly.** The
    grid mounts `renderedGrid` (`visible.slice(0, renderCount)`, window 240)
    and grows via an IntersectionObserver sentinel. Mounting all 1,307 cards
    was measured at 1,578ms boot / 28MB heap vs 673ms / 17MB windowed
    (`tests/bench-boot.mjs`). The "N results" counter still reads
    `visible.length`. `PokemonCard` is `React.memo` with handlers that take
    the Pokémon as an argument — keep callbacks passed to it referentially
    stable or the memo is dead weight.

19. **There is no pnpm workspace.** `pnpm-workspace.yaml` was removed (it
    shipped with malformed placeholder content and broke every `pnpm`
    command under pnpm 9). Root and `worker/` are separate installs; use
    `pnpm install` at root and `pnpm install --ignore-workspace` in
    `worker/`. In sandboxes without network Chrome downloads, install with
    `PUPPETEER_SKIP_DOWNLOAD=1` — the harness resolves a system Chromium.

20. **vitest must not glob `worker/`.** `worker/test/*.test.ts` are node:test
    suites; vitest reports "No test suite found" on them. `vitest.config.ts`
    scopes vitest to `src/**/*.test.ts` — keep it that way.

21. **The service worker's navigate handler must not cache every navigation as
    the shell.** It used to `cache.put('/', response)` on *any* navigation.
    That was harmless while the deploy had one HTML file; the moment ~1,300
    reference pages shipped alongside it, opening `/pokemon/charizard` stored
    that page as the offline app shell, so going offline and opening `/` served
    Charizard instead of the builder. Only `/` and `/index.html` may refresh the
    shell entry. Bump `CACHE_VERSION` whenever you touch `sw.js`, or clients
    keep the old one.

22. **`src/` is typechecked with `types: ["vite/client"]` — no Node types.**
    A colocated `*.test.ts` therefore cannot `import { readFileSync } from
    'node:fs'` or touch `import.meta.dirname`; `tsc -b` fails even though
    vitest runs the file fine. Load fixture data with a JSON import
    (`import raw from '@/data/pokemon-data.json'`) instead — `resolveJsonModule`
    is on and that is what the rest of the suite does.

24. **Only add a shadcn component when something imports it.** 26 of the 40
    vendored `ui/` primitives were never imported by app code — ~2,250 dead
    lines carrying 26 npm dependencies, plus a complete second toast stack
    (`ui/toast` + `ui/toaster` + `hooks/use-toast`) that duplicated Sonner,
    which is what the app actually uses. Vite tree-shook them out of the
    bundle, so the cost was invisible there and real everywhere else: install
    size, audit surface, and lint warnings on files nobody ran. The directory
    is now 14 components, all reachable. `shadcn add` pulls a dependency —
    only run it when you are about to import the result.

25. **The header is the tightest layout in the app; screenshot it after any
    change to it.** It carries 15 controls and every one competes with the
    wordmark. Growing the icon buttons 32px → 36px for touch silently
    truncated the brand to "tr…" at 768px with its subtitle wrapped to three
    lines — and *every overflow assertion still passed*, because the header
    relieves pressure by collapsing its own children rather than scrolling the
    document. Overflow tests cannot see this class of bug. The full icon row is
    now `lg:` (≥1024px) and everything below gets the overflow menu;
    `test-responsive.mjs` asserts the wordmark renders un-clipped and
    un-wrapped at 768/820/1024.

26. **Mobile's enemy is the empty state, not the bundle.** Boot is 584ms and
    the heap 20MB, but on a 390px phone the first Pokémon card sat at 1,022px —
    1.2 screens of scrolling past a 60-word intro and 20 always-open preset
    chips before the app showed what it does. Trimming the copy and collapsing
    the presets behind one tap moved it to 545px, better than desktop. Judge
    mobile by distance-to-first-content, not load time. `test-responsive.mjs`
    pins it under one screen.

27. **A feature that only exists in the overflow menu does not exist on a
    phone.** Journey Mode is the app's most engaging surface and, below the
    header breakpoint, reaching it meant tapping "More actions" and hunting a
    12-item list. It now has a first-screen CTA in the empty state. Anything
    you would put in the marketing copy needs a reachable entry point at 390px.

29. **Two functions computing "the same" number will disagree.** Career length
    had two implementations: `chapterCountFor` drew a short run from the
    `career-length` stream, `regionChapterSpans` drew from `campaign-length`.
    A 13-chapter career therefore reported a 20-chapter region, and anything
    measuring position *within* a region against the *career* total resolved to
    the wrong phase. `regionChapterSpans` is now the single source and
    `campaignChapterCount` sums it; `campaign.test.ts` asserts they agree for
    every campaign and seed. When you add a second way to compute a quantity,
    delete the first.

30. **A default that is also a fallback hides its own failure.**
    `visited[Math.min(tourIndex, visited.length - 1)]` looks defensive and is
    the reason a nine-region saga ran nine regions of chapters inside Kanto:
    `visited` only grows through a player travel choice, so every later tour
    stop clamped back to region one. Badges hit the 8-per-region ceiling,
    `gymLeaders` ran dry, and eight regions had nothing to fight. `?? ` to the
    seeded value, don't clamp to the last known one.

31. **Type effectiveness against a dual type is the PRODUCT, never the max, and
    an accumulator seeded at 1 can never record a resistance.** `matchupFor`
    made both mistakes at once, so Charizard read as *weak* to Ground (it is
    immune) and every resistance in the game read as neutral. Both `<= 0.5`
    arms of the function were unreachable, which meant the defensive half of
    "bring the right team" did nothing. `lib/analysis.ts` `eff` has always been
    correct — match it. `journey/matchup.test.ts` pins the cases.

32. **A paid reroll must exclude what it replaces.** Drawing the reroll from an
    independent rng stream returned the same card 19.4% of the time — 21% in
    the six-card gym pool, ~50% in world-cup's two. Walk the chain from zero and
    filter what has been shown, which keeps the draw a pure function of
    (seed, chapterIndex, rerolls) and the replay contract intact.

33. **Risk needs a durable payoff or it is a tax, and the sweep is the only
    way to know which.** Every risky option now carries `payoff` (see `Payoff`
    in `journey/types.ts`): money, an item, a rare partner, or the fatigue
    refunded, granted when the chapter's own roll comes up positive — a
    deterministic coin flip. `landedSoFar` adds bounded **momentum** to win
    rate so an early gamble is run-defining. Before this, always-min-risk beat
    always-max-risk by 26–74 points for *every* archetype; after, |gap| ≤ 20
    with risk ahead for three of five, and a risky career banks ≥15% more
    money. `journey/risk.test.ts` sweeps 3,000 careers and pins all of it. Any
    balance change: run it, then regenerate the rank table (next item).

34. **The rank table is a snapshot of the engine; regenerate it after any
    balance change.** `SCORE_PERCENTILES` in `ranks.ts` is measured, not
    derived, so when engine numbers move every run is silently mis-ranked.
    `ranks.test.ts` catches the drift; fix it with
    `GEN_RANKS=1 npx vitest run src/journey/ranks.gen.test.ts` and paste.

35. **Two things that compute "the same" number will disagree, and a fallback
    that clamps hides its own failure.** Both bit the multi-region campaigns
    (see HANDOFF v13). Check for the pattern whenever a quantity has a second
    implementation or a `Math.min(i, arr.length - 1)` index.

36. **Test-id prefixes are selectors.** `tests/test-journey.mjs` counts options
    with `[data-testid^="journey-option-"]`. Adding `journey-option-risk` to a
    span *inside* an option would have inflated that count. Inner elements get
    their own prefix (`journey-risk-tag`, `journey-consequences`).

37. **A one-shot Python edit that asserts every anchor and writes at the end is
    atomic — and silently a no-op when one anchor is wrong.** Two engine edits
    here "succeeded" in five of six replacements and applied none of them,
    because the import anchor guessed a format the file did not use. Read the
    exact lines before anchoring on them; for imports, find `from '<module>'`
    and walk back to the brace rather than matching the whole statement.

38. **The decision must lead the decision screen.** Journey's prompt sat 8th in
    document order — below the badge track, map, opponent, party rail and the
    whole prepare panel — putting the question at y≈780 of a 844px phone. It is
    now at y≈245, with the option's consequences (delta chips, risk tag, "if it
    lands: …") visible *before* the tap. Same for setup: Start is sticky on
    phones. Anything that asks the player something goes above the things
    that merely inform them.

39. **Measure overflow on the scroll container, not the page.** Journey's
    dialog scrolls vertically inside a fixed-width box, so a child that grows
    sideways (an unbreakable share URL in a `<pre>`) clips *inside* the dialog
    and never moves `document.documentElement.scrollWidth`. Every page-level
    overflow test stayed green while the card screen ran off the right edge of
    a 390px phone. Assert `dialog.scrollWidth <= dialog.clientWidth` on the
    dialog itself; for long tokens use `[overflow-wrap:anywhere]` — plain
    `break-words` does not reduce min-content width.

40. **`pkill -f` matches its own shell.** A chain that begins
    `pkill -f "tests/test-"` and later runs `tests/test-journey.mjs` kills
    itself at line one (exit 144), because the pattern appears in the shell's
    own command line — and every edit after it silently never happens. Use a
    pattern that matches the target but not the literal text you typed:
    `pkill -f "run-al[l].mjs"`.

41. **Don't draw from the RNG when the outcome is moot.** Moving a recruit
    roll out of a short-circuited `&&` so it ran even on a full roster shifted
    every later roll on the seed and flipped a browser test that had nothing to
    do with recruitment. Under the replay contract *any* extra `rng()` call is
    a behaviour change; keep draws behind the guards they were behind.

42. **A build-time script that shares code with `src/` must import with an
    explicit `.ts` extension.** `scripts/gen-seo-pages.ts` runs under Node's
    native type stripping, which is real ESM: extensionless specifiers do not
    resolve. `allowImportingTsExtensions` is already on, so
    `from '../src/seo/render.ts'` satisfies Node, Vite, vitest and `tsc` at
    once. The chain only works because every module it reaches is pure or
    type-only — routing it through something that imports `./constants`
    extensionless breaks it at runtime with no compile-time warning.

## Code style conventions

- **No defensive `try/catch` everywhere.** The codebase trusts its inputs.
  Catch only at the network boundary (fetch errors) and at the canvas
  boundary (image-load failures). Don't sprinkle `try/catch` to placate
  linters.
- **`font-mono` everywhere for UI chrome.** The codex's vibe is terminal-meets-
  scientific-instrument. Headings use `font-display` (Major Mono Display).
  Body copy in mons / dialogs uses `font-sans` only sparingly.
- **`text-[10px]` for labels, `text-xs` (12px) for body, `text-sm` (14px) for important UI.**
  No arbitrary text sizes outside this scale. This had drifted to 98 uses of
  `text-[8px]`/`text-[9px]` before being pulled back to the floor; 8px is not
  readable on a phone. `test-responsive.mjs` now fails on anything under 10px,
  so the scale is enforced rather than merely documented.
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
