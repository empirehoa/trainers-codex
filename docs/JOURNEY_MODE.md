# Journey Mode

A 3–5 minute, browser-only, choose-your-path trainer career simulator that ends
in a shareable **Trainer Legend Card**. Modeled on the viral mechanics of
copero.org and wired into the existing funnel: team builder → Premium → Printful.

Behind two feature flags. `JOURNEY_MODE` ships **on**; `JOURNEY_MERCH_CTA` ships
**off** pending the unblocks in [Blocked items](#blocked-items).

---

## Contents

- [Status](#status)
- [Blocked items](#blocked-items)
- [Architecture](#architecture)
- [The engine](#the-engine)
- [The level economy](#the-level-economy-and-why-it-is-one-number-in-two-places)
- [Money, rerolls, and carry-forward](#money-rerolls-and-carry-forward)
- [Named battles, badges, and the ladders](#named-battles-badges-and-the-ladders)
- [Scoring and calibration](#scoring-and-calibration)
- [Verdict table](#verdict-table)
- [Seeds and deep-links](#seeds-and-deep-links)
- [The Daily Journey](#the-daily-journey)
- [The Legend Card](#the-legend-card)
- [Sharing](#sharing)
- [Analytics](#analytics)
- [i18n workflow](#i18n-workflow)
- [Feature flags](#feature-flags)
- [IP posture and the degradation path](#ip-posture-and-the-degradation-path)
- [Bundle budget](#bundle-budget)
- [Testing](#testing)
- [Extending: new decision cards, beats, verdicts](#extending-new-decision-cards-beats-verdicts)

---

## Status

| Definition-of-Done item | State | Evidence |
|---|---|---|
| 1. Engine unit tests (determinism, termination, bounds, verdict coverage) | ✅ | `pnpm test:unit` — 244 tests |
| 2. Express run completes under 2:30 on mobile viewport | ✅ | `test-journey.mjs` asserts <150s |
| 3. Legend Card renders, shares, downloads | ✅ | `canShare`-gated; download always offered |
| 4. Daily seed identical across sessions; streak survives TZ change | ✅ | browser + unit tests |
| 5. Builder handoff opens the final team | ✅ | asserts 6/6 in the team bar |
| 6. Both flags toggle cleanly | ✅ | `?ff=` overrides, asserted both ways |
| 7. Seed deep-link reproduces a run; malformed fails soft | ✅ | two fresh incognito contexts compared |
| 8. Analytics events + KPI queries | ⚠️ **partial** | payloads unit-tested; live table not created — see below |
| 9. Bundle budget ≤150 KB gzipped | ✅ | **+30.0 KB** (320,326 → 351,052 bytes) |
| 10. i18n map, zero hardcoded English, ES populated | ✅ | audit test enforces both |
| 11. This document | ✅ | — |

**Item 8 caveat.** The client is complete and unit-tested against a stubbed
transport, and it no-ops safely when Supabase is unconfigured (which is the
current state, so nothing is being dropped silently). What has *not* happened is
creating the `journey_events` table in the live Supabase project or running the
KPI queries against real rows — that writes to Jose's production project, so
it's left as an explicit step. DDL and both queries are in
[Analytics](#analytics); apply them and item 8 closes.

### Sprint 0 — infrastructure gate

Reported per instruction until both hard dates clear. **None of the three items
were actionable in this environment**: they require live Stripe keys, the
Cloudflare R2 dashboard, a Printful account, and a fal.ai key — none of which
are in the repo, and all of which move real money or real infrastructure.

| # | Item | Hard date | State |
|---|---|---|---|
| 1 | Stripe → live mode (real $4.99 charge + refund) | **Aug 7** | ⛔ Not started — needs live keys + dashboard access |
| 2 | R2 configured, one 300 DPI render → Printful draft order | **Aug 12** | ⛔ Not started — needs R2 + Printful account |
| 3 | fal.ai trainer-card AI: fix or flag-hide | pre-launch | ⛔ Not started — no fal.ai integration found in this repo |

The worker code that item 1 depends on already exists (`worker/src/stripe.ts`,
`worker/src/printful.ts`) and is wired client-side in `src/lib/license.ts`; what's
missing is credentials and the manual verification runs, not code.

**On item 3:** grep across `src/`, `worker/`, and the docs found no fal.ai
reference, no AI image generation, and no trainer-card AI feature. Either it
lives outside this repository or it was never built here. There is no dead
button to hide — but this should be confirmed rather than assumed.

**Consequence for the defensibility thesis.** §1.8 of the brief argues clones
can copy the sim but not the funnel. Half that funnel is currently unproven:
the builder-handoff leg works and is tested, the merch leg is not. Journey Mode
is built so that gap is contained — `JOURNEY_MERCH_CTA` is off, so there is no
dead button, and the feature ships value through the builder leg alone.

---

## Blocked items

`JOURNEY_MERCH_CTA` stays **off** until **both** clear:

1. **Sprint 0 item #2** — R2 bucket configured and one 300 DPI render pushed
   through to a real Printful draft order.
2. **IP counsel sign-off on §4(b)** — stylized silhouettes of copyrighted
   character designs on *paid merch*. Derivative-work exposure is materially
   higher for something printed and sold than for something displayed on screen,
   and R2 being ready does not address that question.

To flip it after both clear, add to the deploy's config block — no rebuild:

```html
<script>
  window.TRAINERS_CODEX_CONFIG = {
    flags: { JOURNEY_MERCH_CTA: true }
  };
</script>
```

---

## Architecture

```
src/journey/
  prng.ts          mulberry32, FNV-1a, seed coercion, local-calendar dates
  types.ts         engine types (no logic)
  content.ts       regions, starters, recruit pools, decision cards, verdicts,
                   the flavor layer (describeMon / rosterCaption)
  engine.ts        the simulation — pure, deterministic
  scoring.ts       archetype-weighted scoring + verdict resolution
  deeplink.ts      ?seed= / ?daily= parsing and link building
  streak.ts        Daily streak (local date strings) + one free repair
  archive.ts       Daily archive + ?issue=N deep links
  ranks.ts         Score percentile + named rank tiers
  analytics.ts     fire-and-forget Supabase REST inserts
  share.ts         Web Share / clipboard / download tiers
  legend-card.ts   canvas renderer (1080×1350 and 300 DPI print)

src/components/codex/journey/
  JourneyModeDialog.tsx   shell + state machine
  JourneySetup.tsx        setup screen
  JourneyDecision.tsx     decision card, progress header, stat strip
  JourneyRecap.tsx        chapter recap
  JourneyResult.tsx       retired beat, card, share tiers, CTAs

src/i18n/
  strings.ts        EN + ES complete; PT + JA seeded
  useI18n.ts        context + the useI18n hook
  I18nProvider.tsx  the provider component (split from the hook so the file
                    exports only a component — Fast Refresh requires it)

src/lib/flags.ts   feature flags (defaults → config → ?ff= override)
```

### State machine

```
setup → simulating → decision → chapter-recap → … → retired → card
```

`JourneyModeDialog` derives the UI state rather than storing it:

```ts
if (chapters.length > revealed)         → 'chapter-recap'
else if (status === 'awaiting-decision') → 'decision'
else if (cardStage === 'card')           → 'card'
else                                     → 'retired'
```

`retired` is a deliberate beat — verdict headline and score alone, before the
card appears. It is the moment the run becomes a thing worth screenshotting.

---

## The engine

### Replay, not step

`simulate(setup, choices)` is a **pure function**. The UI holds only
`choices[]` and re-runs the entire career from chapter 0 on every pick. A
20-chapter replay is microseconds, and it buys:

- a `?seed=` link reproduces a run exactly, with no state to serialize;
- undo is `choices.slice(0, -1)`;
- the determinism test is one `JSON.stringify` comparison.

No clock, no `Math.random`, no storage, no DOM anywhere in the engine.

### Choice-independent event selection

Streams are derived **per chapter**, not drawn from one long stream:

```ts
chapterRng(seed, i) = mulberry32(seed ^ imul(i + 1, 0x9e3779b9))
```

If chapter 4's dice came off a single running stream, a different choice in
chapter 3 would consume a different number of draws and shift every later
event. Per-chapter derivation makes the **event sequence** a pure function of
`(seed, chapterIndex)` while **outcomes** respond to choices — which is exactly
what the Daily Journey needs: *everyone got the same journey today; compare
what you did with it.* Asserted by the
`event sequence is choice-independent` test.

### Career shape

| Property | Value |
|---|---|
| Chapters | 12–20, from `chapterCountFor(seed)` |
| Starting age | 10, +1 per chapter |
| Roster | starter + up to 5 recruits, padded to exactly 6 |
| Phases | `gym-circuit → regional → national → worlds → veteran → retirement` |

Phases are **proportional**, so a 12-chapter and a 20-chapter career both get a
full arc. The retirement chapter never carries a decision — the last card a
player sees decides *how* they retire, not what happens after.

### Decision cadence

| Pace | Decision every | Approx |
|---|---|---|
| Express | 3 chapters | ~2 min |
| Normal | 2 chapters | ~4 min |
| Intense | 1 chapter | ~8 min |

Cards are drawn from the phase's eligible pool, avoiding repeats while fresh
ones remain, with archetype-affine cards double-weighted. Selection depends only
on `(seed, pace, chapterIndex, cards already used)` — all choice-independent.

### Fatigue has an equilibrium

Fatigue recovers proportionally between chapters
(`FATIGUE_RECOVERY_RATE = 0.24`, scaled per archetype). This was a bug fix, and
worth understanding before touching the numbers: as a one-way ratchet, 6–16
fatigue per chapter over 17 chapters pinned *every* trainer at 100 by their
mid-twenties. That permanently maxed the win-rate penalty and made the
`durability` score component dead weight — a career sim in which everyone is
maximally exhausted by year five models nothing. Proportional recovery gives
fatigue an equilibrium at `gain ÷ rate`, so pace becomes a genuine trade-off and
"rest the team" buys something real.

---

### The level economy, and why it is one number in two places

`XP_RATE` in `levels.ts` was 0.5, roughly ten times too slow, and it made the
player's own Pokémon a dead end. Measured over 300 careers:

| | before | after |
|---|---|---|
| starter final level | p50 **25**, max 28 | p50 **55**, max 61 |
| starters reaching level 32 / 36 | **0% / 0%** | 100% / 100% |
| starter outclassed by an auto-caught mon | **300/300 runs** (worst gap +45 levels) | **0/300** |

Most three-stage lines gate their second evolution at 32–36, so the central
progression fantasy of a career sim — raising the team you chose — was
*arithmetically unreachable*. Nothing the player raised could be their best
Pokémon, so the only line left was "use whatever the engine caught last
chapter", and every chapter played the same. That is what repetitiveness was:
an agency problem, not a difficulty one.

`levelForNewCatch` was the other half. It was
`5 + chapterIndex * 3 + badges * 2` — a formula that looked at neither the party
nor the XP economy, handing out level 60 at chapter 15. It now derives from the
party the player actually raised and sits deliberately below it: 85% of the party
average, never at or above. A wild Pokémon arrives promising but untrained.

**`XP_RATE` and the opponent ladders in `opponents.ts` are one number in two
places.** v10's ladders (gyms to 54, Elite Four 58–70, champion 76) were built
for a party that reaches ~60 — they were never wrong, the rate was. An earlier
pass scaled the ladders *down* to fit the broken curve, which is treating the
symptom; both are now derived from the measured party curve per phase:

```
gym-circuit 19-32 · elite-four 32-38 · regional 36-41 · national 39-44
worlds 41-47 · world-cup 43-49 · end 48 (starter 55)
```

`matchupFor` prices level gap as `levelGap / 20` **clamped to ±1**, so a ladder
more than 20 levels off the party pins at the floor and stops being a variable
at all. Keep every gap inside that band or preparing for a fight cannot change
the odds. Four guards in `battles.test.ts` enforce all of the above.

### Money, rerolls, and carry-forward

Nothing in a run used to **cost** anything, so nothing in it was a trade-off —
and an obvious choice is not a choice.

- **Prize money** (`CareerStats.money`) is earned from battles won, badges and
  titles. Scaled so a career affords a few rerolls, not an unlimited supply.
- **Rerolling** a decision costs money after the first one of the *run*. Free
  first makes the mechanic discoverable without a tutorial; the escalating ladder
  (`REROLL_COSTS = 0 / 400 / 900 / 1800`, plateauing at the last rung) makes the
  second and third real decisions.
- **Queued evolutions** are the carry-forward. A level-gated evolution on a
  member two levels short used to mean reopening the prepare panel every chapter
  to check — busywork, not a decision. Queue it once and the run fires it the
  moment the gate clears.

All three are **derived from the recorded action list**, never accumulated in
mutable state, which is what keeps `simulate(setup, choices, actions)` pure. The
reroll count in particular is folded into the rng key
(`card-${chapterIndex}-r${rerolls}`) rather than drawn from a running stream, so
a rerolled career replays exactly and a `?seed=` link still reproduces it.
`economy.test.ts` asserts replay identity at every reroll depth.

### Named battles, badges, and the ladders

A chapter resolves a **chain** of named opponents: fight, and on a win move to
the next; the first loss ends the day. Every fight past the first carries a
compounding tiredness penalty and costs real fatigue.

**Why a chain and not one fight per chapter.** Two ladders were arithmetically
impossible before:

| Ladder | Fights needed | Phase length | Result |
|---|---|---|---|
| Gym circuit | 8 badges/region | ~26% of 12–20 chapters ≈ 5 | capped at 5 badges |
| Elite Four | 4 members + champion | ~1.5 chapters | members 3–4 and the champion **never faced** |

Measured over 6,000 careers the region champion was faced 0 times, which also
made `RegionCrown` dead content — crowns are awarded for beating a champion. The
alternative to a chain was widening the gym phase until half the career is gyms,
which is not a career sim.

**Badges are won, never rolled.** A badge comes from beating a gym leader, one
per leader. It used to come from a blind `chance(rng, 0.72)` roll that never
looked at the opponent, so a player could lose the battle and collect two badges
or win it and collect none — and `battle.won` was `winRate >= 0.5`, a threshold
on the chapter's aggregate rate (median ~0.53), so essentially every named battle
was a win.

Because `earnedHere` only advances when a badge lands, **losing a gym leaves that
leader standing** — the same leader is selected next chapter and the result is
flagged `rematch`. A loss costs a chapter and stings on fatigue; it is never a
dead end.

Nothing else in the game grants a badge. The `go-pro` decision card used to hand
one out as a choice reward, which desynced the badge *stat* from the badge
*track*: a run could report 5 badges with 4 on the track behind 4 gym wins.

**Measured, 6,000 careers** (mechanical player — a real one preparing for type
matchups should do better):

| Ladder | Win rate |
|---|---|
| gym | 66% |
| syndicate | 64% |
| elite-four | 40% |
| region champion | 32% (reached by 908 runs) |
| world cup | 30% |

~2.9 rematches per run, and 0 runs finish with a badge they did not win.

### Opponent levels have to track the party the engine produces

Every ladder in `opponents.ts` was scaled against an XP curve the game does not
have: gym leaders ran 12→54, the Elite Four 58→70, the champion 76, the World Cup
~70. The party's **measured end-of-run level is p50 25, max 39**.

`matchupFor` prices level gap as `levelGap / 20` clamped to ±1, so every late
battle sat pinned at maximum disadvantage — the level term had stopped being a
variable, which is why no amount of win-rate tuning moved the boss ladders. The
ladders now run 6→20 (gyms), 15→21 (Elite Four), ~25 (champion), ~27 (World Cup),
and `battles.test.ts` asserts no ladder exceeds 40.

**If you change the XP economy, re-derive these together.** A level curve and an
opponent ladder are one number in two places.

### Shinies and event Pokémon are properties of a Pokémon, not of a counter

`shinies` was a counter incremented next to a `BoxEntry` built with
`shiny: false` hardcoded. A Shiny Hunter could finish a career claiming eight
shinies and hold none — nothing to look at, swap in, or put on the card.

The flag on the Pokémon is now the single source of truth and the count derives
from it, so the two cannot disagree. At the end of a run the stat is reconciled
against the distinct shiny Pokémon actually held: a shiny catch of a species you
already own is dropped as a duplicate, and 101 runs in 6,000 finished claiming a
shiny they did not have.

**Origin is separate from colour.** `MonOrigin` is `starter | wild | event | gift`.
An event grant used to be marked `shiny` when the event's rarity was
`'legendary'`, which conflated two unrelated facts three ways: every legendary
encounter came out shiny, `SHINY FLASH` — an event whose entire premise is the
colour — granted an ordinary Pokémon, and the player had no way to tell a shiny
catch from a legendary one. Events now declare `grantsShiny` themselves.

Provenance survives a round trip through the box. The swap path rebuilt the
roster entry without `origin`/`eventId`, laundering an event Pokémon into an
ordinary one.

## Scoring and calibration

Ten components, each normalised to 0..1 against a target, combined with
per-archetype weights **that sum to exactly 1** — so the 0–999 output is bounded
by construction, with no clamping. `weightSum()` is asserted in tests.

Components: `winRate · titles · peak · badges · catches · shinies · fame · bond
· durability · longevity`.

### Position-relative weighting

Copied from Copero in spirit: a run is scored against what its **archetype** was
trying to do. A Shiny Hunter ending with four shinies and no titles must be able
to score as high as a Champion with three titles and no shinies — otherwise four
of the five archetypes are decoration.

Two normalisation choices matter:

- **`winRate` is scored against a band, not against 1.0.** A full career runs
  200–350 battles including Worlds brackets; a literal 100% win rate is not a
  thing any career reaches. Scoring against it capped the heaviest single
  component (0.26 for Aggro) at ~0.67 regardless of how well the run went. The
  band is `[0.35, 0.80]` — 0.35 is a losing career, 0.80 across a whole career
  is historic.
- **Balance carries only 0.03 on `shinies`.** Its shiny modifier is the second
  lowest of any archetype, so weighting shinies like the others charged the
  Balance player for an outcome their own build cannot produce. It was the one
  archetype that could not reach the elite tier. The freed weight went to
  `titles`, which a Balance run genuinely competes for.
- **`peak` is scored against the top 12, not against a 48-deep ladder.** With
  `floorRank: 48` the component measured nothing: across 6,000 careers the peak
  rank never fell outside the top 8, so the normalised value ran p10 0.957 /
  p50 1.000 / min 0.851. A component with that little variance does not
  discriminate between runs — it pays every run a flat premium proportional to
  its weight, which is precisely how the archetypes drifted apart (below).
- **`catches` targets 55, not 65.** Measured career max is ~70 and the p90 is
  45, so a target of 65 left only the extreme tail near 1.0 — and since
  `catches` is the Collector's heaviest component at 0.30, that capped the
  Collector's ceiling below every other archetype's.

### Cross-archetype parity

Verdict *labels* are archetype-specific at every tier, so a Stall player and an
Aggro player who both land SOLID each get their own archetype's name for it —
that half is fair by construction. The *score* is not: it is cross-archetype
comparable and it is printed on the share card.

Stall's median once ran **113 points above Aggro's** (now 74). The cause was
variance, not favouritism:

| | heaviest components | their measured p50 |
|---|---|---|
| aggro | `winRate` 0.26, `titles` 0.22 | 0.52, **0.00** |
| stall | `durability` 0.16, `bond` 0.14, `longevity` 0.12 | 0.64, 0.76, 0.80 |

Half of all careers end titleless, so Aggro's second-heaviest weight mostly paid
nothing, while Stall's three heaviest were near-guaranteed — and Stall's own
mechanic lowers fatigue, so it was paid twice for `durability`. In play this
showed up as Aggro players landing MODEST verdicts while Stall players landed
GREAT.

The rebalance moved both toward components that actually discriminate without
flattening identity: Stall still carries the highest `bond`, `durability` and
`longevity` of any archetype, and Aggro still carries the highest `winRate`.

Some spread is correct and wanted — a Shiny Hunter who finds no shinies *should*
score badly, and erasing that would make the five archetypes interchangeable.
So `no archetype is a systematically better bet than the others` in
`content-health.test.ts` is a **drift guard, not a parity target**: it bounds the
median spread at 140 and prints every archetype's median when it trips.

### Measured distribution

600 seeds × 3 choice strategies per archetype, `intense` pace, mechanical player
(cycles option index — not an optimising player, so real players should do
better):

| Archetype | min | p50 | p95 | max |
|---|---|---|---|---|
| aggro | 434 | 645 | 791 | 886 |
| stall | 502 | 721 | 864 | 942 |
| balance | 444 | 669 | 818 | 913 |
| collector | 493 | 718 | 839 | 909 |
| shiny-hunter | 334 | 675 | 840 | 909 |

Across all three paces (400 seeds × 5 archetypes × 3 paces = 6,000 careers) the
whole-population curve is:

```
p2=473  p5=513  p10=544 p25=597 p50=661 p75=730
p85=764 p90=785 p95=813 p97=830 p99=863   min=300 max=941
```

### The multiplier is an asymptote, not a multiplication

v10 added the Balatro layer — stacked event and quest multipliers on the final
total — as `Math.min(999, total * mult)`. That clamp was **binding for more than
15% of runs**: measured p85 through p99 were all exactly 999. Two things broke
at once, and neither failed a test:

- The score stopped discriminating at the top. Everyone in the best sixth of
  runs shared one number, on the one artifact whose whole job is to be worth
  comparing.
- Because all of those runs cleared the top tier simultaneously, the ELITE
  *fallback* verdicts became the most common outcomes in the game.
  `THE COLLECTOR` alone was **10.1%** of all runs — more than any ordinary
  verdict. A prestige tier that fires for a sixth of players is not a prestige
  tier.

The multiplier now closes a fraction of the remaining headroom instead of
multiplying through it:

```ts
const base = breakdown.total / MAX_SCORE;
finalScore = MAX_SCORE * (1 - (1 - base) / Math.max(1, mult));
```

This keeps every property the Balatro layer wants — strictly increasing in
`mult`, so hitting a legendary event always beats not hitting one — while making
999 an asymptote no stack can reach. High scores gain less in absolute terms than
middling ones, which is correct: they had less room left to win. Post-fix, the
top verdict is an ordinary SOLID one at 13.4% and no ELITE verdict appears in the
top fourteen.

The same v10 curve shift stranded two `requires` gates that had been written
against the old battle counts — see [Verdict table](#verdict-table).

### Tiers are anchored to percentiles, not to round numbers

`ELITE 800 · GREAT 720 · SOLID 540 · MODEST 400` ≈ **p97 · p85 · p25 · p2**.

The first draft used round thresholds (850/760/560/280) and they went stale the
moment engine numbers moved: the bond/fame decay pass compressed the score
distribution, `ELITE = 850` landed 2 points *under* Collector's own maximum, and
three ELITE verdicts became unreachable content. Nothing failed. Percentile
anchors would have moved with the distribution.

**If you change engine numbers, re-derive this whole section.** Three tests
enforce what it claims:

| Test | Catches |
|---|---|
| `every archetype reaches its own top-tier verdict` | a tuning change making an archetype a dead end |
| `every verdict in the table is actually reachable` | a tier threshold or `requires` gate stranding content |
| `no archetype is a systematically better bet…` | median drift between archetypes |

The reachability guard also catches the subtler failure: a signature `requires`
that is *implied* by the score gating it. `catches >= 45` is a near-certainty for
any Collector clearing ELITE, so the fallback verdict behind it could never fire.
Signature conditions have to be harder than what the tier already guarantees —
they now sit roughly a decile above it.

---

## Verdict table

`VERDICTS` in `content.ts` is ordered by **descending prestige**;
`resolveVerdict` takes the first entry matching the archetype (or `any`),
clearing `minScore`, and satisfying its `requires` predicate.

> **Order is load-bearing.** A cross-archetype verdict placed after an
> archetype's lower tiers can never fire, because the lower tier matches first.
> This was a real bug in the first draft: `CULT HERO` sat below `BRAWLER`, so no
> Aggro player could ever get it. Keep entries grouped by `minScore` descending,
> with conditional entries ahead of unconditional ones at the same score.

| Tier | Score | Entries |
|---|---|---|
| ELITE | 800 | 5 signature (conditional) + 4 unconditional fallbacks |
| GREAT | 720 | `NEARLY-MAN` (conditional), then one per archetype |
| colour | 600 | `CULT HERO OF {region}` |
| SOLID | 540 | `ONE-REGION LEGEND` + one per archetype |
| MODEST | 400 | one per archetype |
| FLOOR | 0 | `THE ROAD-WALKER` — universal, unconditional |

`NEARLY-MAN` sits *above* the GREAT block rather than in a band of its own: a
first-match table only reaches it if nothing more prestigious claims the run, so
"good enough to win and never did" has to outrank the tier it is a consolation
for. It began at 620 with `peakRank <= 4` and fired for **19.1% of all runs** —
a consolation label as the single most common outcome in the table.

The floor entry guarantees `resolveVerdict` never returns undefined, so callers
never null-check a verdict. Asserted by
`the verdict table has a universal floor entry`.

Signature ELITE conditions:

| Verdict | Archetype | Requires |
|---|---|---|
| `THE UNDEFEATED` | aggro | `titles ≥ 2 && losses ≤ wins × 0.75` |
| `THE IMMOVABLE` | stall | `bond ≥ 60` |
| `THE PROFESSOR'S PRIDE` | collector | `catches ≥ 55` |
| `CHROMATIC LEGEND` | shiny-hunter | `shinies ≥ 5` |
| `THE COMPLETE TRAINER` | balance | — |

Each of these sits roughly a decile above what clearing ELITE as that archetype
already implies — otherwise the unconditional fallback behind it is unreachable.
`catches ≥ 45` and `shinies ≥ 4` were both *implied* by the tier, which is why
`THE COLLECTOR` and `ODDS BREAKER` were dead content.

Cross-archetype `requires` gates read off the **post-decay** stat curves, not the
nominal 0–100 range (`bond` p50 42 / p90 61 / max 89; `fame` p50 48 / p90 66).
`CULT HERO` shows why this matters: at `fame ≥ 65` — the p90 — combined with a
peak outside the top four, it fired for **0 of 6,000 runs**, because high fame
correlates with a strong peak. It needs "well known", not "famous".

`THE UNDEFEATED` is the same failure from the other direction, caused by an
engine change rather than a decay pass. `titles ≥ 3 && losses ≤ wins × 0.6` was
written against pre-v10 battle counts; v10's gym / Elite Four / World Cup ladder
capped titles at 4 (p90 = 1) and floored the loss:win ratio at 0.540 with a p10
of 0.686, making `≤ 0.6` roughly a top-1% outcome on its own. Together the two
clauses matched **1 run in 6,000** — alive only by luck of the seed, and one
tuning pass from dead. Gates written against a stat curve have to be re-derived
when the engine moves that curve; that is what the reachability guard is for.

---

## Seeds and deep-links

### Seed format

Integers `1..999_999` — short enough to say out loud. `coerceSeed()` truncates
fractions and rejects everything out of range, returning `null` so callers fail
soft.

### Route

```
/journey?seed=<1..999999>[&pace=][&archetype=][&region=][&starter=]
/journey?daily=YYYY-MM-DD[&pace=][&archetype=]
```

`?daily` wins over a simultaneous `?seed` — a link carrying both is almost
certainly hand-edited.

Because the app is a single static HTML with no router, `/journey` needs a
**200 rewrite** (not a redirect, which would drop the query string). See
`public/_redirects`.

### Fail-soft, always

Nothing here may produce an error screen — the visitor just clicked a friend's
link. Every rejected param degrades to a fresh random run plus a one-line note:

| Input | Result |
|---|---|
| `?seed=abc`, `0`, `-1`, `1000000`, `NaN` | fresh run + note |
| `?daily=2026-02-30`, `2026-13-01` | fresh run + note |
| `?pace=turbo`, `?archetype=wizard` | param ignored, valid seed kept, **no** note |
| `?region=atlantis` | ignored |
| `?starter=909&region=kanto` | ignored (starter must belong to the region) |

### Every share carries the link

Web Share text, copy-link, and the URL rendered **into the card pixels** all
carry the seed deep-link. The share is a playable invitation, not an image.

`resolveOrigin()` falls back to `https://trainerscodex.com` unless the live
origin is a real `http(s)` origin. This matters for the offline single-file use
case: a `file://` origin serialises as `"file://"` with no host, which would
print `file://journey?seed=8843` onto a card meant to be openable.

---

## The Daily Journey

```ts
seedOfDay = dailySeed(localDateString())   // FNV-1a over "trainerscodex-daily-<date>"
```

The date is the **device-local calendar date** (Wordle convention): everyone gets
"today" at their own midnight, with zero server dependency.
`localDateString()` builds from `getFullYear/getMonth/getDate` — **not**
`toISOString()`, which converts to UTC first and hands back yesterday's date for
anyone west of Greenwich in the evening.

### Why the streak stores date strings

`streak.ts` stores an array of `'YYYY-MM-DD'` strings, never timestamps.
Epoch-millisecond arithmetic breaks three ways that all occur in real usage:

- **DST** — the gap between consecutive local midnights is 23 or 25 hours twice a
  year, so "did >24h pass?" drops or double-counts a day.
- **Travel** — the same instant is a different calendar day in Tokyo and Los
  Angeles; a timestamp comparison can credit two plays for one day, or none for
  two.
- **Clock changes** — a manual adjustment corrupts history permanently.

Comparing calendar strings never measures elapsed time, so none of them apply.

Behaviour: idempotent per date (a replay cannot inflate a streak); counts back
from today if played, else from yesterday (so a live streak isn't reported broken
before the day is over); a full missed day resets; `bestStreak` is recomputed
from history on load, so a corrupted stored value self-heals.

Recorded **on completion only** — an abandoned run does not extend a streak.

---

## The Legend Card

`renderLegendCard()` — 1080×1350 logical canvas, scaled via `ctx.scale()` for
print. Text stays vector-crisp at any factor.

Contents: wordmark, trainer name, archetype · region · age, verdict headline
(glow, so it survives a busy feed), blurb, 0–999 score, six silhouettes with
captions and epithets, six career stats, top-3 score contributors, seed,
playable deep-link, and the fan-project disclaimer.

### Silhouettes, not sprites

Each roster figure is a **derived silhouette**: the sprite is drawn to an
offscreen canvas, reduced to its alpha channel via `source-in` compositing, and
re-filled with a type-derived gradient. **The source pixels never reach the
output.** This is what the brief asks for ("team silhouette", "original
silhouettes/stylized canvas art only"), and it is the form with the best chance
of surviving the merch review — a solid-fill mask is materially further from the
copyrighted artwork than a reproduction, which matters much more when the output
is printed for sale.

### Sprite loads are time-bounded

`SPRITE_TIMEOUT_MS = 4000`. A bare image load has **no** timeout: `onerror`
fires for a refused or 404'd request, but a request that merely *hangs* —
captive portal, dead proxy, throttled mobile, the sprite mirror rate-limiting —
never settles either way, and the whole render awaits forever while the user
watches a spinner. This was a real hang found during visual QA. On timeout the
card falls back to a neutral capsule, which reads as "a member was here" without
pretending to be a specific creature.

The browser suite runs with **all** network blocked, so it proves the card
rasterises entirely from fallbacks.

### Print targets

| Target | Pixels | Background |
|---|---|---|
| `poster11x14` | 3300×4200 | full-bleed |
| `apparel` | 3600×4800 | transparent |

Gated by `JOURNEY_MERCH_CTA` at the call site.

---

## Sharing

Three tiers, each one tap:

1. **Web Share with the PNG attached** — the only path that reaches Instagram
   Stories / TikTok from mobile web.
2. **Copy image to clipboard** — Chromium, Safari 13.1+; not Firefox.
3. **Download** — always offered, no capability gate.

Two iOS Safari constraints shape this module:

- `navigator.share({ files })` throws unless `navigator.canShare({ files })`
  returned true for the **same payload** first. Feature-detecting
  `navigator.share` alone is not enough — file sharing is a separate capability.
- The call must happen inside the **user-gesture task**. An `await` resolving
  from a network round-trip or a canvas render breaks the gesture chain and the
  share silently fails.

So the card blob is rendered **when the card screen opens**, and the share
handler only ever awaits `navigator.share` itself.

`AbortError` (the user dismissed the sheet) is distinguished from a real failure
— it must not raise an error toast.

---

## Analytics

Client-side inserts to Supabase REST. Anonymous session UUID in `localStorage`,
no PII. **No-ops entirely** when Supabase is unconfigured, fails silent always,
and never blocks the sim loop. `keepalive: true` so `run_abandoned` survives the
page closing — otherwise it's the one event you always lose.

Plain REST rather than the Supabase JS client: that client is a CDN import which
only loads when *auth* is configured, and analytics must work on a deploy with a
project but no auth providers wired.

### Table DDL

Run in the Supabase SQL editor:

```sql
create table if not exists journey_events (
  id          bigserial primary key,
  event       text        not null,
  session_id  text        not null,
  props       jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists journey_events_event_created_idx
  on journey_events (event, created_at desc);
create index if not exists journey_events_session_idx
  on journey_events (session_id);

alter table journey_events enable row level security;

-- Anonymous clients may INSERT only. No select, no update, no delete: the anon
-- key ships inside a public static HTML file, so anyone can read it. Without
-- this, that key would expose the whole event log.
create policy "anon can insert journey events"
  on journey_events for insert to anon with check (true);

-- Constrain the vocabulary so a malformed or hostile client can't fill the
-- table with arbitrary event names.
alter table journey_events add constraint journey_events_event_known
  check (event in (
    'run_started', 'run_completed', 'run_abandoned', 'share_attempted',
    'builder_handoff', 'merch_cta_click', 'daily_played'
  ));
```

### Event schema

| Event | `props` |
|---|---|
| `run_started` | `pace`, `archetype`, `source` (`fresh｜seed-link｜daily`), `seed` |
| `run_completed` | `durationMs`, `score`, `verdict`, `chapters`, `pace`, `archetype`, `source`, `seed` |
| `run_abandoned` | `state` (last UI state), `chapters`, `durationMs`, `seed` |
| `share_attempted` | `method` (`webshare｜copy｜download｜copy-link`), `score`, `verdict`, `seed`, `daily` |
| `builder_handoff` | `score`, `verdict`, `seed` |
| `merch_cta_click` | `score`, `verdict`, `seed` |
| `daily_played` | `streak`, `date`, `score`, `seed` |

### The two KPIs this sprint lives or dies on

**Share rate** — shares ÷ completed runs. Counts distinct completed runs that
produced at least one share, so a user tapping three share tiers on one card
isn't three shares:

```sql
with completed as (
  select count(distinct session_id || ':' || (props->>'seed')) as runs
  from journey_events
  where event = 'run_completed'
    and created_at >= now() - interval '7 days'
),
shared as (
  select count(distinct session_id || ':' || (props->>'seed')) as runs
  from journey_events
  where event = 'share_attempted'
    and created_at >= now() - interval '7 days'
)
select
  shared.runs                                            as shared_runs,
  completed.runs                                         as completed_runs,
  round(100.0 * shared.runs / nullif(completed.runs, 0), 1) as share_rate_pct
from completed, shared;
```

**Builder-handoff rate** — handoffs ÷ completed runs:

```sql
with completed as (
  select count(distinct session_id || ':' || (props->>'seed')) as runs
  from journey_events
  where event = 'run_completed'
    and created_at >= now() - interval '7 days'
),
handed as (
  select count(distinct session_id || ':' || (props->>'seed')) as runs
  from journey_events
  where event = 'builder_handoff'
    and created_at >= now() - interval '7 days'
)
select
  handed.runs                                            as handoff_runs,
  completed.runs                                         as completed_runs,
  round(100.0 * handed.runs / nullif(completed.runs, 0), 1) as handoff_rate_pct
from completed, handed;
```

Useful secondaries:

```sql
-- Completion funnel by pace: where do people drop out?
select props->>'pace' as pace,
       count(*) filter (where event = 'run_started')   as started,
       count(*) filter (where event = 'run_completed') as completed
from journey_events
where event in ('run_started', 'run_completed')
group by 1 order by 1;

-- Which state abandonments happen in.
select props->>'state' as state, count(*)
from journey_events where event = 'run_abandoned'
group by 1 order by 2 desc;

-- Verdict distribution — is any archetype a dead end in the wild?
select props->>'archetype' as archetype, props->>'verdict' as verdict, count(*)
from journey_events where event = 'run_completed'
group by 1, 2 order by 1, 3 desc;
```

The CSP in `public/_headers` already allows `https://*.supabase.co` in
`connect-src`; no change needed.

---

## i18n workflow

`src/i18n/strings.ts` holds one flat map per locale. Journey Mode has **zero
hardcoded English in its components** — every string resolves through
`t(key, vars)` from `useI18n()`.

- **EN** is the reference locale. Every key must exist here.
- **ES** ships complete and is enforced complete by the audit test.
- **PT / JA** ship seeded. A key absent from a locale falls back to EN, so a
  partial locale renders a working mixed UI, never raw key names.

Fallback chain: requested locale → EN → the key itself. Returning the key makes
a typo loud in development without breaking the screen for a user.

Interpolation is `{name}`; a missing var renders empty rather than leaving
`{name}` on screen. `interpolate()` runs **even when `vars` is undefined** — an
early return there was a real bug that put a literal `{seed}` in the UI.

### Adding a translation

1. Add the key to `en` first.
2. Add it to `es`. If you can't, the `locales marked complete are actually 100%
   covered` test will fail — that's intended.
3. For PT/JA, add what you have; the rest falls back.
4. `pnpm test:unit` — `strings.test.ts` verifies every key referenced by
   `content.ts` exists, that no locale carries a stray key, that no EN value is
   empty, and that no string asks for a var no caller supplies.

### Promoting PT or JA to complete

Fill in every `referenceKeys()` entry, then set `complete: true` in `LOCALES`.
The audit test enforces the claim.

---

## Feature flags

`src/lib/flags.ts`. Three layers, last wins:

1. `FLAG_DEFAULTS` in code.
2. `window.TRAINERS_CODEX_CONFIG.flags` — per-deploy, no rebuild.
3. `?ff=NAME:0|1` in the query string, comma-separated — per-session, for QA and
   the test suite.

| Flag | Default | Effect |
|---|---|---|
| `JOURNEY_MODE` | `true` | The whole feature. Off ⇒ no header button, dialog never mounts. |
| `JOURNEY_MERCH_CTA` | `false` | The print CTA. See [Blocked items](#blocked-items). |
| `JOURNEY_SPECIES_FLAVOR` | `true` | Species names in flavor text and on the card. |

Flags are read at call time, not cached, so a test can mutate the config and
re-render without a reload.

---

## IP posture and the degradation path

Copero's posture does not transfer. It uses real players' and clubs' names as
nominative references to real-world facts. Pokémon species and region names are
not real-world facts — they are trademarked fictional property owned by the most
enforcement-aggressive rights holder in gaming, and Journey Mode is designed for
maximum visibility during Worlds week, when enforcement attention peaks. Success
is what triggers the risk.

### The degradation path is a data swap

Every user-visible reference to a Pokémon goes through **one** function:

```ts
describeMon(id, role)  // "Charizard"  |  "your Fire-type ace"
rosterCaption(id)      // "Charizard"  |  "Fire/Flying"
```

With `JOURNEY_SPECIES_FLAVOR` off, flavor text degrades to type/role descriptors
and card captions to type pairings. **Nothing else knows which mode is active** —
the engine, the recap UI, and the renderer interpolate whatever string they're
handed. If counsel narrows what we may ship, flipping one flag is the entire
change. No rewrite, no rebuild.

Asserted by the `JOURNEY_SPECIES_FLAVOR=0 degrades flavor text` browser test,
which also checks the screen stays fully functional in degraded mode.

### What is already conservative

- No official artwork, sprites, ROM assets, or copied text in any output. Card
  figures are derived alpha-mask silhouettes.
- All flavor text is original. Trainer names are generic invented handles, not
  characters from the games or anime.
- Route copy, page title, and OG tags **omit the word "Pokémon"** — including
  the brief's own suggested title. §4(c) puts that copy inside the counsel
  review, and this is the reversible default. If counsel clears it, update
  `index.html` and `scripts/make-og-image.mjs`, then `pnpm og`.
- The fan-project disclaimer is baked into the card pixels, not just the footer.

### Still required before Aug 26

An actual IP attorney's written opinions on §4(a)–(d): species/region names in
the sim and on the card; silhouettes on **paid merch**; "Pokémon" in route copy
and OG tags; required disclaimers. `JOURNEY_MERCH_CTA` stays off until (b)
clears, regardless of R2 status.

---

## Bundle budget

| | gzipped |
|---|---|
| Before | 320,326 bytes (312.8 KB) |
| After | 351,052 bytes (342.8 KB) |
| **Delta** | **+30.0 KB** — budget 150 KB |

Comfortably inside. Real code-splitting is mostly fiction in a single-file
bundle, so the budget is the constraint that matters. To re-measure:

```bash
pnpm build && node inline.mjs && gzip -c bundle.html | wc -c
```

The 1200×630 OG image (`public/og-journey.jpg`, ~104 KB) is **not** in the
bundle — `inline.mjs` inlines only CSS, JS, and the favicon, so it ships as a
separate static asset and doesn't count against this.

---

## Testing

```bash
pnpm test:unit      # vitest — 244 tests: engine, battles/badges/shinies, level economy,
                    #          money/rerolls/carry-forward, ranks, archive, content health,
                    #          i18n, deeplink, streak, analytics, prepare
pnpm test:browser   # puppeteer — 20 suites, 198 tests (incl. 41 journey, 7 favorites)
pnpm test:all       # both
pnpm ship           # build + inline + test:all
```

`vitest` was added as a dev dependency — the repo previously had no non-browser
test runner, and the engine's determinism makes unit testing it nearly free.

### What the unit tests cover

| Area | Notable |
|---|---|
| Determinism | byte-identical runs; partial replay is a prefix of the full replay; **event sequence is choice-independent** |
| Termination | 225 combinations of seed × archetype × pace × strategy, all complete |
| Bounds | 2,000 runs stay in 0..999; absurd stats clamp; empty career scores 0 not NaN |
| Invariants | `peakRank` only improves; age +1/chapter; roster is exactly 6 unique; every run has a verdict |
| Fairness | every archetype reaches ELITE, **and its own** ELITE verdict |
| Dates | local-not-UTC; leap years; DST; month/year rollovers |
| Deep-links | round-trips; 25 malformed inputs all fail soft |
| Streak | DST transitions, timezone travel, corrupted payload self-heal |
| Analytics | every event shape; no-PII assertion; four failure-isolation cases |
| i18n | every content key exists; no stray keys; ES 100%; no unresolved vars |

### What the browser tests cover

37 tests including: the full run through a real DOM, the card rasterising with
**all network blocked**, `?seed=` reproducing a run across two fresh incognito
contexts, malformed seeds failing soft, `?daily=` matching across sessions, the
streak surviving a Kiritimati → Midway (25-hour) timezone swing, all three flags
gating both ways, the Spanish locale toggle, and no horizontal overflow at 360px
on both the decision and card screens.

### Harness notes

- `newPage({ query, viewport })` — `query` is appended to the `file://` URL,
  which preserves query strings, so deep-links are testable without a server.
- Tests may set `ownPage: true` to manage their own pages (multi-session
  determinism needs this).
- `resolveExecutablePath()` finds a pre-provisioned Chromium when puppeteer's
  own download was skipped — honours `PUPPETEER_EXECUTABLE_PATH` / `CHROME_PATH`
  first.
- Radix internals need **real mouse events** (CLAUDE.md gotcha #1). The locale
  `Select` is clicked via `page.mouse.click` at measured coordinates; plain
  `<button>` elements respond to `.click()` fine.
- Radix keeps dialog content mounted through its exit animation. Poll for
  `!el || data-state === "closed"` rather than sleeping a guessed interval.

---

## Extending: new decision cards, beats, verdicts

### A new decision card

1. Append to `DECISION_CARDS` in `content.ts`:

```ts
{
  id: 'sponsor-buyout',
  phases: ['worlds', 'veteran'],
  promptKey: 'journey.card.sponsor-buyout.prompt',
  options: [
    { id: 'accept', labelKey: 'journey.card.sponsor-buyout.accept.label',
      flavorKey: 'journey.card.sponsor-buyout.accept.flavor',
      delta: { fame: 14, bond: -8 }, riskMultiplier: 1.2 },
    { id: 'walk',   labelKey: 'journey.card.sponsor-buyout.walk.label',
      flavorKey: 'journey.card.sponsor-buyout.walk.flavor',
      delta: { bond: 10 } },
  ],
  affinity: ['aggro'],
}
```

2. Add the three keys × 2 locales to `strings.ts`. The i18n audit test will name
   anything you miss.
3. `pnpm test:unit`. The card tests check id uniqueness, 2–4 options, that each
   phase keeps ≥2 eligible cards, no back-to-back repeats, and phase legality.

Guidance on numbers: keep `delta` small — the sim's own rolls should do most of
the work, and a choice should tilt a career, not decide it. `riskMultiplier`
above 1 raises the mean slightly and the variance a lot. Available `delta` keys
are the `CareerStats` fields; `fame`, `fatigue`, and `bond` are clamped to
0..100, everything else to ≥0.

### A new chapter beat

Add the id to the right phase in `CHAPTER_BEATS`, then add
`journey.beat.<id>` to EN and ES. Available vars: `trainer`, `region`, `age`,
`wins`, `losses`, `battles`, `badges`, `catches`, `shinies`, `fame`, `ace`,
`recruit`, `placement`, `chapter`.

Keep `ace` and `recruit` going through `describeMon` — that's the IP degradation
chokepoint. Never hardcode a species name into a string.

### A new verdict

Insert into `VERDICTS` **at the right prestige position** (see the warning in
[Verdict table](#verdict-table)), add both keys to EN and ES, and re-run the
unit tests — the fairness and uniqueness tests will catch a table that no longer
covers every archetype.

### A new analytics event

1. Add the name to `JourneyEventName` and a variant to `JourneyEventProps` in
   `analytics.ts` — the union is deliberately narrow so an event that isn't
   declared cannot be sent.
2. Add the name to the `journey_events_event_known` check constraint.
3. Document it in [Event schema](#event-schema).
4. Add a case to `analytics.test.ts`.
