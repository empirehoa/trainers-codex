# Trainer's Codex — HANDOFF.md

This document captures the state of the project as of the transfer to
Claude Code. Read CLAUDE.md first for conventions and gotchas.

---

## v14 — Risk is a choice now, and the choice comes first (Sep 2026)

Scoped by a deep-research pass on what makes short share-driven roguelites
retain (report in `docs/RESEARCH_2026-09-07.md` once the workflow lands) and a
phone-first design critique of every Journey screen. Two findings drove the
work.

### The dice outweighed the player

Measured over 150 seeds × 5 archetypes with four fixed strategies:
always-min-risk beat always-max-risk by **26–74 points for every archetype**,
earned more prize money, and per-seed decision spread (35–88) sat below the
seed SD (83–107). A risky option bought a one-chapter `(risk−1)×0.05` mean
shift while its `+fatigue` compounded against the run on every later chapter.
Risk was not a choice; it was a tax.

**Fix — durable payoffs + momentum.** Every risky option carries a `payoff`
granted when the chapter's own roll lands (a deterministic coin flip, 51%
measured): money for the prepare step, an item, a rare partner, the fatigue
refunded at ~1.7× cost, fame. Each landed gamble also adds bounded momentum to
win rate (+0.8pp, cap 5), the compounding-for to set against fatigue's
compounding-against. The consequence line under each option shows the delta
chips, a steady/risky/gamble tag and "if it lands: …" — a choice you can read.

| | before | after |
|---|---:|---:|
| max-risk − min-risk, worst archetype | −74 | −18 |
| archetypes where risk comes out ahead | 0 of 5 | 3 of 5 |
| money, risky vs safe career | −7% | **+25–33%** |
| decision spread ÷ career SD | 0.29–0.65, one-directional | 0.33–0.63, two-directional |

Two content bugs surfaced by the new consequence line: `shiny-rumor` and
`rare-encounter` had their risk arms *inverted* against their own fiction —
"Go hunt it" was the steady pick and "Let it go" the gamble. Fixed; that alone
closed most of Collector's gap.

Also found: the engine's catch counter never counted recruits, so a payoff
promising "a rare partner" put a Pokémon on the roster and nothing on the stat
Collector scores at 30%; and a payoff recruit did nothing at all once the roster
was full — exactly when late-run gambles happen. Overflow goes to the box now.

`journey/risk.test.ts` pins all of it over 3,000 careers. The rank table was
regenerated (`ranks.gen.test.ts`, provenance in `ranks.ts`).

### The question was the eighth thing on the screen

On a 390px phone the decision prompt sat at y≈780 of 844 — below the badge
track, area map, opponent card, party rail and the entire prepare panel. Setup
ran 1.8 screens with Start at ~1,140px. The dialog header repeated a 40px
tagline on every screen; Close was 16×16.

| | before | after |
|---|---:|---:|
| decision prompt, y at 390px | ~780px | **245px** |
| setup Start button | 1,142px (1.5 screens) | **sticky, visible on first paint** |
| setup height | 1.8 screens | 1.39 |
| dialog Close target | 16×16 | 44×44 (touch) |
| region chips / dex toggle / archive toggle | 25px / 15px / 15px tall | ≥36px |

Archetype rows went two-up, pace and campaign became segmented controls (same
testids), the tagline is `sr-only` under 640px, the locale picker is icon-only.

### The research landed, and it justified two more things

`docs/RESEARCH_2026-09-07.md` — 102 agents, 3-vote adversarial verification,
8 claims survived, 12 refuted (recorded so nobody rebuilds on the same sand).
The harness was honest that only sharing, archive/retention and fan-project
legal posture produced verifiable evidence; nothing on decision-vs-RNG balance
or mobile browser UX survived, so those decisions stand on this repo's own
measurements.

**Skill vs luck (shipped).** The strongest verified precedent was NYT's
WordleBot — a post-game readout scoring a finished puzzle on skill versus luck.
It answers exactly what the audit found Journey could not: was that me or the
dice? The engine is deterministic, so `journey/luck.ts` replays the finished
seed under the same four strategies `risk.test.ts` sweeps with and decomposes
the score: *this seed's dice* (seed mean − reference median) and *your
choices* (player − seed mean), which sum to the player's distance from an
average career by construction. Shown on the retired beat. NYT sells this to
subscribers; it is free here because it is what makes a second try on the same
seed mean something.

**The text share artifact, made visible (shipped).** Only ~5% of Wordle
players ever posted a grid publicly; the format carried the game by being
pasted into private chats. Journey already had one (`buildShareText`: rank line
+ emoji badge strip + sentence + link) — hidden behind a button labelled
"Copy link". It is now previewed on the card screen and the button says what it
does.

**Recorded, not built — Jose's calls:** NYT gated its 1,000-puzzle archive
behind the subscription (archive play does not count toward streaks) while
keeping the daily free — a direct precedent for gating `?issue=N`. And the
fan-project legal evidence (PokéRogue's cost-recovery-only posture; TPC's
former CLO naming *money + press* as the trigger) confirms `JOURNEY_MERCH_CTA`
staying off until counsel clears it, and adds that a Product Hunt / HN launch
is itself the exposure event.

### Not done

- **Recruitment ignores evolution families.** After the starter evolves
  (Bulbasaur → Ivysaur), a wild Bulbasaur can still join, because the recruit
  filter excludes exact roster ids only. `evolutionsOf` in `journey/evolution.ts`
  gives the forward edges; a `familyOf(id)` built from a reverse map would let
  the filter exclude the whole line. Deliberately not done here: it changes
  which species land on every seed, so it needs its own sweep and a rank-table
  regeneration, not a footnote in a research commit.
- Shiny Hunter's decision/dice ratio is 0.33 — held to a lower floor
  deliberately, because a third of its score *is* dice. If that ever feels flat
  in play, the lever is more payoffs in its currency, not a higher floor.
- World Cup is still one fight against your own region champion.

---

## v13 — Audit, simplification, and the mobile experience (Sep 2026)

A full audit: measure first, then cut. Boot was already healthy — **584ms to
header, 20MB heap, 0 cumulative layout shift, 46ms to filter 1,307 entries** —
so the wins were not in the bundle. They were in dead weight, in the phone
experience, and in reachability.

### Simplification

**26 of the 40 vendored `ui/` components were never imported.** ~2,250 dead
lines carrying **26 npm dependencies**, plus a complete second toast system
(`ui/toast` + `ui/toaster` + `hooks/use-toast`) duplicating Sonner, which is
what the app actually uses. Vite tree-shook them out of the bundle, so the cost
was invisible in the artifact and real everywhere else: install size, audit
surface, and lint warnings on files nobody ran. Dependencies are down from 44 to
18, and eslint warnings from 23 to 19 with zero errors throughout.

### Mobile was the real problem, and it was not performance

On a 390px phone the first Pokémon card sat at **1,022px — 1.2 screens of
scrolling** past a 60-word intro and 20 always-expanded preset chips before the
app showed what it does. Desktop was 0.72 screens. Mobile was 68% worse on
distance-to-first-content while being identical on every load metric.

| | before | after |
|---|---:|---:|
| first card, 390px phone | 1,022px (1.21 screens) | **545px (0.65)** |
| first card, 820px tablet | 738px (0.63) | **692px (0.59)** |
| search field width, 390px | ~150px (placeholder clipped) | **full row** |
| text below the 10px floor | 98 occurrences | **0** |
| taps to start Journey Mode on a phone | 3 (menu → scroll → item) | **1** |

The intro was trimmed to two lines, the presets collapsed behind a single tap
under 640px, and the search field given its own full-width row.

### Journey Mode was unreachable on the device most people hold

The header collapses to two buttons under the breakpoint, so starting a run
meant tapping "More actions" and hunting a 12-item menu — for the feature most
likely to make someone share the app. It now has a first-screen CTA in the
empty state, above the fold at 239px.

### A bug that every existing test passed

Growing the header's icon buttons from 32px to 36px for touch **truncated the
wordmark to "tr…" at 768px** with its subtitle wrapped to three lines. Every
overflow assertion still passed: the header relieves pressure by collapsing its
own children rather than scrolling the document, so overflow tests are blind to
it. Caught by screenshot, not by the suite.

The fix was better than the workaround: the full 15-icon row now starts at
1024px, and everything below gets the overflow menu that phones already had —
already built, already tested, and far better than 15 cramped targets on an
iPad. With only two controls left in the collapsed header, those two got a
genuine 44px touch target.

### Guards added

`test-responsive.mjs` went from 6 tests to 16 — tablet widths were previously
untested entirely, falling into the "desktop" branch unchecked. It now pins
distance-to-first-content, the 10px type floor, the preset disclosure, the
Journey CTA, and an un-clipped wordmark at 768/820/1024.

**Suite: 331 unit + 222 browser (21 suites) + 19 worker = 572 passing, 0 eslint
errors.**

### Second-opinion pass (Fable 5.1)

An independent adversarial audit was run on the finished work, told to find
what the first pass missed. It found five real defects, four of which are now
fixed. It also correctly flagged that the first pass's `git add -A` had swept
its own scratch file into the tree — removed.

**Season and Saga campaigns were structurally broken.** Measured over 25 runs
each: a nine-region saga ran 135 chapters and produced **8 badges and gym wins
in 1 of 9 regions**. Two independent causes, both now fixed:

1. `phaseFor` was proportional to the *whole* career, so the gym circuit (the
   opening 26%) and the Elite Four (the next 16%) fell entirely inside region
   one. Phases are region-local now, with the endgame reserved for the last
   stop on the tour.
2. `visited[Math.min(tourIndex, visited.length - 1)]` clamped every tour stop
   past the player's chosen legs back to the home region — and `visited` only
   grows through a travel choice, so by default *every* stop was region one.

Underneath both sat a third bug: career length had **two implementations that
disagreed**. A short run drew from the `career-length` stream while its region
span came from `campaign-length`, so a 13-chapter career reported a 20-chapter
region. `regionChapterSpans` is now the single source.

Result — badges by campaign, same strategy and seeds: **short 4.6 · season
15.4 · saga 41.7** (all three were pinned at 8 before). Crowns 0.08 / 0.28 /
0.84. `short` is bit-identical: it draws from the same stream with the same
bounds, and all 262 pre-existing journey tests pass unchanged.

**Type matchups had the defensive half inverted.** `matchupFor` took the *max*
across a dual type where the rule is the *product*, from an accumulator seeded
at 1 that no resistance could ever beat. Charizard read as **weak** to Ground
(Flying makes it immune); Gengar read as neutral against Normal. Both `<= 0.5`
arms were unreachable dead code, so the entire "bring the right team" payoff
did nothing. Fixed and pinned by `journey/matchup.test.ts` — 3 of its 8 tests
fail against the old code.

**Share codes silently dropped every alternate form.** `parseTeamCode` rejected
any id `> 1025`, but form ids live above 10000 — so a shared team containing a
Mega, a regional or a Gigantamax lost those slots, and the builder then rewrote
the URL from the parsed result, destroying the original. Now validated against
the dataset.

**A paid reroll returned the same card 19.4% of the time** (~50% in world-cup's
two-card pool) because each reroll drew from an independent stream. It now
walks the chain and excludes what it has shown, without breaking determinism.

Also fixed: `skipToEnd` capped at 32 iterations and stranded long campaigns
mid-run; `buildSeedLink` omitted `campaign`, so a shared saga replayed as a
short run — a different game on the same seed.

Not fixed, and worth knowing: the audit measured that **the safe option
strictly dominates** across all five archetypes, and that seed-to-seed variance
(SD 83-108) outweighs every decision in a run combined (spread 34-90). That is
a design problem, not a bug — risky choices buy a one-chapter mean shift while
fatigue and bond compound for the rest of the run. Fixing it means giving risk
a persistent payoff, which is a balance change that deserves its own pass.

### Not done

- The choice-weight problem above. It is the single biggest remaining lever on
  whether Journey Mode is actually fun.
- The World Cup is always one fight against your own region champion; the ghost
  pipeline never surfaces because ghosts sit past the end of the field.
- Saga ante targets scale past 999 and can never be cleared.
- The 19 remaining eslint warnings are `react-hooks` rules on pre-existing
  components (10 in `App.tsx`); their fix is a restructure, not an edit.
- `App.tsx` is 1,600 lines with 15 `useEffect`s. It is the next thing to split.
- 15 controls in the header is the root cause of the sizing ceiling. Reducing
  that count would let the desktop row take proper touch targets too.

---

## v12 — Static reference pages (Sep 2026)

### The finding

An audit of the product's discovery surface, using Semrush against the live
competitive set, produced one number that explains everything else:

**`public/sitemap.xml` contained three URLs** — `/`, `/legal`, `/dmca`.

Measured, same tool, same day:

| Domain | Organic keywords | Organic traffic/mo |
|---|---:|---:|
| pokemondb.net | 550,033 | 6,557,224 |
| pikalytics.com | 46,461 | 48,755 |
| pokesynergy.app | 1,382 | 5,061 |
| championsbuilder.com | 287 | 70 |
| **trainerscodex.com** | **no data returned** | **no data returned** |

Pikalytics' traffic is not built on a better team builder. Its top non-branded
keywords are one page per species — `incineroar`, `mawile`, `ogerpon`,
`ursaluna`, each ranking positions 5–8 on 14K–40K monthly volume. Its own
ranking for `pokemon team builder` (74,000/mo, KD 34) sits at **position 15**,
worth 370 visits. The traffic is the reference pages, not the tool.

Trainer's Codex ships 1,307 species, 919 moves and every learnset inlined into
one HTML file, and exposed **none** of it as an addressable URL. The data was
already better than the competition's; it simply had nowhere to be found.

### What shipped

`scripts/gen-seo-pages.ts` — a build-time generator that emits ~1,330 static
pages from the same JSON the bundle inlines. One per species, one per form, one
per type, two hubs, and a regenerated `sitemap.xml`. Wired into `pnpm build`
and into `scripts/inject-config.mjs` so a deploy cannot ship the app without
them. Full description and rules in CLAUDE.md → "Static reference pages".

Each species page carries computed, non-boilerplate content: the full 18-type
incoming and outgoing matchup grids, base stats with a dex-wide percentile,
highest-power learnable STAB moves, the evolution line with its trigger, other
forms, and a ranked list of Pokémon that beat it on the type chart. Plus
BreadcrumbList and FAQPage structured data, a canonical tag, and the trademark
disclaimer.

The pages load **no script and no external resource of any kind**. No sprite
art in particular — hotlinking third-party artwork onto 1,300 indexed pages is
a materially different IP posture than referencing it inside the tool, and that
call belongs to counsel, not to a generator.

One deploy-side assumption to verify on the first live push: `/pokemon/gengar`
must resolve to `/pokemon/gengar/index.html`. Cloudflare's static-asset handling
does this by default (`auto-trailing-slash`), and the sitemap lists the
extensionless form, but it is worth a single curl after deploy rather than an
assumption.

### Two bugs found on the way in

**The service worker cached every navigation as the app shell.** `sw.js` ran
`cache.put('/', response)` on any navigation, which was harmless while the
deploy was one HTML file. With reference pages alongside it, visiting
`/pokemon/charizard` stored that page as the offline shell — so going offline
and opening `/` served a Charizard reference page instead of the builder. Fixed
and `CACHE_VERSION` bumped to `tc-v10`.

**The deploy never staged the PWA assets.** `scripts/inject-config.mjs` copied
five files out of `public/`; `sw.js`, `manifest.webmanifest` and every icon were
not among them. Every deploy shipped an `index.html` that registered a service
worker and advertised a manifest that 404'd. Fixed.

### Decisions left to Jose

**1. Pokémon names now appear in 1,307 page titles.** CLAUDE.md's bright line is
that the name must not be in the app title, domain, or store listings, and that
is untouched. Page titles on reference content are a different surface —
nominative use to identify the subject, which is what every comparable fan site
does and the basis on which they operate. It still increases IP surface area,
and it is a business call, not a technical one. Say the word and the titles
become descriptive rather than named; the pages still work, they just rank for
less.

**2. `robots.txt` blocks GPTBot, ClaudeBot and CCBot.** That was a deliberate
AI-training opt-out. It also means the pages cannot be cited in AI answers,
which is a growing share of how people find reference data at all. The two goals
are in genuine tension and the file should be a decision, not an inheritance.

**3. `trainerscodex.net` is registered by someone else.** `.org`, `.app`, `.io`,
`.gg` and `.co` were available when checked. Worth deciding whether to defend
the name.

### Also noticed, not touched

`CLAUDE.md` lists `public/_redirects` as the 200 rewrite that makes
`/journey?seed=` work. **That file does not exist in the repository.** Either it
was never committed or it was removed; either way the documented behaviour is
unverified, and a shared `?seed=` link landing on `/journey` may 404 in
production. Left alone deliberately — changing routing is not part of this
change — but it should be checked before the next share-driven push.

### Not done

- No content pages beyond species and types. The obvious next tier is the
  comparison and "best X" long-tail (`best water type pokemon`,
  `pokemon type coverage calculator` — 1,300/mo at **KD 8**), which wants
  editorial judgement rather than generation.
- Nothing was submitted to Search Console; the sitemap has to be registered by
  hand once the pages are live.

---

## Sprint 5 addendum — Journey Mode (Aug 2026)

**Journey Mode is built, tested, and behind a flag.** A 3–5 minute
choose-your-path trainer career sim ending in a shareable Trainer Legend Card.
Full design notes, analytics schema, KPI queries, and extension guide:
[`docs/JOURNEY_MODE.md`](docs/JOURNEY_MODE.md).

- `JOURNEY_MODE` ships **on**. `JOURNEY_MERCH_CTA` ships **off**.
- Bundle cost: **+30.0 KB gzipped** (budget was 150 KB).
- Tests: **106 unit (vitest, new) + 75 browser (48 pre-existing + 27 new)**.
- `vitest` added as a dev dependency — the repo had no non-browser test runner.

### Two things a reader of this file should know

**1. Sprint 0 did not happen, and it is a stated gate.** The sprint brief made
live Stripe (Aug 7) and R2 → Printful (Aug 12) hard-dated prerequisites, on the
argument that "clones can copy the game but not the funnel" is false while the
funnel's money legs are broken. Neither was actionable without live credentials
and dashboard access. The worker code exists (`worker/src/stripe.ts`,
`worker/src/printful.ts`, R2 binding declared in `worker/wrangler.toml`); what's
missing is credentials plus the manual charge/refund and draft-order runs.

The consequence is contained by design: the builder-handoff leg of the funnel
works and is tested, the merch leg is flag-hidden, and there are no dead
buttons. But **half the defensibility thesis is currently unproven.**

**2. No fal.ai integration exists in this repository.** Sprint 0 item #3 asked
to fix or flag-hide a fal.ai trainer-card AI feature. A grep across `src/`,
`worker/`, and the docs finds no fal.ai reference, no AI image generation, and
no trainer-card AI feature — only CLAUDE.md and README noting "no AI image gen
at runtime." Either it lives elsewhere or it was never built here. Worth
confirming rather than assuming.

### Also fixed in passing

The header action row overflowed the viewport horizontally on mobile — 428 px
against a 360 px viewport **before** Journey Mode added an eleventh button.
`shrink-0` pinned it at max-content so nothing could give. It now wraps. This
was pre-existing, not introduced.

### Still required before the Aug 26 public launch

- **IP counsel sign-off** on §4(a)–(d) of the brief. `JOURNEY_MERCH_CTA` stays
  off until the paid-merch silhouette question (b) clears, independently of R2.
  The degradation path is built: flipping `JOURNEY_SPECIES_FLAVOR` off swaps all
  species names for type/role descriptors as a pure data change.
- **Create the `journey_events` table** in Supabase (DDL in the Journey doc).
  Until it exists, analytics no-op silently — nothing is being lost, but
  nothing is being measured either, and the sprint's two KPIs are share rate and
  builder-handoff rate.
- PT and JA translations (structure ships; EN and ES are complete).

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
