# Journey Mode — Competitive Analysis & Launch Strategy (2026-08-07)

Companion to `COMPETITIVE_INTEL_v3_2026-08.md` (which covers the *builder*).
This one covers **Journey Mode** specifically, plus the virality teardown and
the app-distribution decision. Three parallel research sweeps, 2026-08-07.
Every figure is sourced or marked unverified; nothing here is invented.

---

## 0. The three findings that should drive the next month

1. **What we just shipped is genuinely differentiated — in two specific ways.**
   No competitor found (in any category) combines a career sim with a
   competitive team-builder handoff, and **PokéRogue is the only web tool that
   evolves a team mid-simulation — and it does so automatically.** A discrete,
   opt-in "evolve now, or spend a Rare Candy to go early" choice inside a
   3-minute run is unoccupied design space.
2. **Our share artifact is the wrong shape for the platforms that are actually
   viral right now.** The Legend Card is a *still image of a finished thing*.
   The summer's biggest Pokémon virality event (below) was driven entirely by
   **short vertical video of a transformation in progress**.
3. **Do not put this in an app store.** A free Pokédex *utility* with 400,000+
   users was removed from Google Play by a TPCi DMCA — this exact app category
   has precedent. PWA is the correct distribution channel, and it is a
   *retention* channel, not an acquisition one.

---

## 1. Virality teardown — Gen1Recomp + the DramaticShape Voxel Mod

**What it is (high confidence).** Two July–August 2026 projects that fused:
`bryanthaboi/gen1recomp` — a native Gen-1 recreation hand-written in Lua on
LÖVE2D that ships **zero game content** (it verifies your own ROM's SHA-1,
decodes it to a private cache, then releases it from memory) — plus
`DramaticShape/DramaticShapeVoxelMod`, which rebuilds Kanto's flat tile map as
a voxel diorama with first-person, third-person and PC VR.
Hit **#1 on GitHub Trending on 2026-07-29**; press wave Aug 3–5 (Kotaku,
Polygon, Digital Foundry, Dexerto).

**The mechanic underneath the virality:** pressing **one key (`3`)** walks a
ladder — `OFF → 15° → 35° → 50° → 75° → 1ST → 3RD` — turning flat 1996 Kanto
into a lit 3D world. Every viral clip is that same two-second shot, and because
it's a *ladder*, every creator's clip is slightly different. Feature cadence was
the PR strategy: first-person, VR and third-person shipped inside ~36 hours,
each re-seeding the news cycle.

**Five transferable properties (none require being a game):**
a transformation rather than an artifact · a *knob* so every clip differs ·
legibility in under two seconds · nostalgia specificity (Pallet Town, not
"Pokémon") · a tutorial tier (the compounding UGC was "how to install", not
"look at this").

**The IP lesson, which matters more than the virality one.** The project's
README makes an unusually precise negative claim — it does not include a ROM,
emulate, transpile assembly, or download a disassembly. Four clauses,
each pre-empting a legal theory. Its mod platform enforces the same rule
downward: mods "ship recipes and original assets, never extracted content."
**Our parallel exposure is the PokéAPI sprite dependency**, which is official
art. Also: a squatter domain currently outranks the real project for its own
name — register defensive domains/handles *before* a spike, not after.

---

## 2. Journey Mode vs the field — where we stand after this build

Legend: ✓ have · ~ partial · ✗ missing. **JM** = Journey Mode as shipped today.

| Capability | JM | PokéRogue | Super Auto Pets | BitLife | PokeDoku/Squirdle |
|---|---|---|---|---|---|
| Run ≤ 5 min | ✓ | ✗ (hours) | ~ | ✗ | ✓ |
| Party of six always visible | ✓ | ✓ (daily starts 3) | ~ | ✗ | ✗ |
| Dex fills as you play | ✓ | ✓ (cross-run meta) | ✗ | ✗ | ✗ |
| Prepare step before each decision | ✓ | ✓ (reward screen) | ✓✓ | ✗ | ✗ |
| **Player-chosen evolution mid-run** | **✓ unique** | ~ (automatic) | ~ (merge) | ✗ | ✗ |
| Items spent in prepare | ✓ | ✓ | ✓ | ✗ | ✗ |
| **Visible currency / budget** | **✗** | ✓ | ✓✓ (10 gold) | ✓ | ✗ |
| **Priced reroll (first free)** | **✗** | ✓ | ✓✓ | ✗ | ✗ |
| **Freeze / carry a plan forward** | **✗** | ~ | ✓✓ | ✗ | ✗ |
| Shared-seed daily | ✓ | ✓ | ✗ | ✗ | ✓ |
| Streaks | ✓ | ✗ | ✗ | ✗ | ~ |
| **Streak repair** | **✗** | ✗ | ✗ | ✗ | ✗ |
| Emoji share summary | ✓ | ✗ | ✗ | ✗ | ✓ |
| Playable seed permalink | ✓ rare | ✗ | ✗ | ✗ | ✗ |
| **Rarity / percentile score** | **✗** | ✗ | ✗ | ✗ | ~ |
| **Named rank tiers** | **✗** | ~ | ✓ | ✗ | ✗ |
| **Archive / past seeds** | **✗** | ~ | ✗ | ✗ | ✓ |
| **Async ghost opponents** | **✗** | ✗ | ✓✓ | ✗ | ✗ |
| **Builder handoff** | **✓✓ unique** | ✗ | ✗ | ✗ | ✗ |
| **Cross-run meta-progression** | **✗** | ✓✓ | ✓ | ✓ | ✗ |

**Read:** eleven gaps, and ten of them are *mechanics* — prepare-step depth,
scoring shape, or replay surface. None requires new content.

**Genuinely differentiated (market these):** career-sim → builder handoff ·
player-chosen mid-run evolution · playable seed permalink · six visible from
second one (PokéRogue's own daily starts you with three) · three minutes with a
real party, dex and prepare step.

**Commodity (don't over-invest):** emoji summaries, shared-seed dailies,
streaks without repair, seen/caught tracking, shiny, sprite team displays.

---

## 3. Ranked next moves

### P0 — make the share travel (the virality fix)
1. **"Card Build" 9:16 MP4/WebM export, 6–9s, seamless loop.** Animate the
   Legend Card *assembling* — choices flick past, badges snap in, art style
   resolves, rarity counts up. `canvas.captureStream()` + `MediaRecorder`,
   client-side. This is our version of pressing `3`, and it is the single
   highest-leverage item in this document.
2. **Vertical-first output** — 1080×1920 as the default share size.
3. **"Same run, 12 art styles" morph loop** — the poster renderer already
   exists; cycling it is the *knob* that makes every creator's clip different.
4. **Transparent/green-screen export** so creators react over it.

### P1 — deepen the prepare step (all mechanics, no new content)
5. **Freeze / carry-forward** — hold an item or a queued evolution across
   decisions. Super Auto Pets' single best mechanic and our largest gap; it
   converts "spend what dropped" into "execute a plan."
6. **Visible currency + priced reroll, first reroll free.** Nothing in Journey
   Mode currently *costs* anything, so nothing is a trade-off.
7. **Telegraph escalation** — "Rare Candy pool opens at Gym 3." In a 3-minute
   run, anticipation must be manufactured explicitly.
8. **Treat the six as a spatial board, not a list.** Backpack Battles' whole
   appeal is that the prepare artifact is a *layout* people screenshot. Ace is
   one adjacency rule; lead/pivot slots or type adjacency would be more.

### P2 — scoring shape and retention
9. **Rarity percentile on the card** — "your six is rarer than 94% of today's
   trainers." Immaculate Grid retrofitted exactly this because binary outcomes
   stop being shareable. Independently confirmed by two of three sweeps.
10. **Named rank tiers** (Gym Challenger → Elite Four → Champion). People share
    words, not integers.
11. **Async ghost trainers on the daily seed** — every player's final six
    becomes a later player's opponent. Multiplayer feel, zero netcode.
12. **Daily archive + Unlimited mode** — the archive doubles as indexable SEO
    surface, which directly serves the v3 distribution problem.
13. **Streak repair, one free.** Every daily game loses users permanently at the
    first broken streak; none of them offers repair. Also a clean non-power
    Premium SKU (Fallen London's "sell rate, not power" model).

### P3 — cadence + hygiene
14. **Ship a visible feature every few days through Worlds week (Aug 29–30) and
    post a clip for each.** Feature cadence *is* the PR strategy at our size.
15. **Open-source one component** (the seed spec, or the poster renderer) — a
    real acquisition channel a closed SPA cannot touch.
16. **Audit the sprite dependency**; keep `JOURNEY_MERCH_CTA` off pending
    counsel; register defensive domains/handles now (~$50).

**Explicitly do NOT:** lengthen the run (PokéRogue owns depth; 3 minutes is the
wedge) · add interstitial ads (BitLife's ~70s model works at BitLife's scale and
would kill a share-driven funnel at ours) · gate Journey Mode behind payment
(every competitor in the category is free).

---

## 4. App-mode decision — stay a PWA

**Recommendation: keep shipping as an installable PWA. Do not submit to app
stores.** Reasoning, in order of weight:

1. **IP takedown precedent is the real gate, not app review.** Pokédroid — a
   *free Pokédex utility*, not a game, with 400,000+ users — was removed from
   Android after a TPCi DMCA. Both stores run IP-complaint machinery
   independent of review. Store presence converts our current low-profile
   posture into a permanent, addressable target.
2. **Apple Guideline 4.2** ("beyond a repackaged website") makes a wrapped web
   app a coin-flip anyway; practitioners report inconsistent outcomes, and a
   rejection blocks *bug fixes*, not just launches.
3. **PWA reality in 2026 is good enough.** Android install is one-tap with
   working push. iOS 26 now defaults Home-Screen sites to standalone mode; push
   works when installed (iOS 16.4+). The weakness is the *funnel*, not the
   technology — so treat PWA as retention, not acquisition.
4. **Storage:** the "7-day wipe / 50MB cap" claim circulating in vendor blogs
   describes pre-2023 ITP. Per WebKit's own storage-policy post, installed
   Home-Screen web apps get browser-app quota and Home-Screen status is an
   explicit heuristic favouring `navigator.storage.persist()`. Still ship save
   export/import and treat local storage as best-effort.

**If store distribution ever becomes necessary**, Capacitor (not TWA, not a
bare PWABuilder wrapper) is the lowest-4.2-risk path because genuine native
features can be added — but item 1 above still applies and should be run past
counsel first.

**Responsive work already done:** the party rail, dex grid and prepare panel are
regression-tested for zero horizontal overflow at 360px with *both* expandable
surfaces open, alongside the existing setup/decision/card 360px checks.

---

## 5. Research gaps (be honest about these)
- **Reddit was unreachable** from the research environment (egress-blocked at
  the proxy across every mirror). Part A voice-of-user was substituted from app
  store reviews, GitHub issues, Smogon and the Chrome Web Store. **Re-run the
  Reddit synthesis from an unblocked environment before treating player research
  as complete.**
- PokéRogue's v1.12.0.10 release *year* is not confirmed on-page; PokéClicker's
  current version and PokéFarm Q's 2026 specifics are unverified (403).
- Cobblemon's "25M downloads" is an unverified third-party marketing claim.
- Engagement figures for the voxel mod are limited to Dexerto's reported
  "hundreds of thousands of views / 3,400+ likes" on one X post.
- BitLife revenue/retention numbers are Gamigion third-party estimates.
