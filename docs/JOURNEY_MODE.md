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
| 1. Engine unit tests (determinism, termination, bounds, verdict coverage) | ✅ | `pnpm test:unit` — 106 tests |
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
  streak.ts        Daily streak, stored as local date strings
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

### Measured distribution

600 seeds × 3 choice strategies per archetype, `intense` pace, mechanical player
(cycles option index — not an optimising player, so real players should do
better):

| Archetype | min | p50 | p95 | max |
|---|---|---|---|---|
| aggro | 481 | 653 | 822 | 878 |
| stall | 545 | 746 | 867 | 916 |
| balance | 502 | 674 | 819 | 865 |
| collector | 496 | 669 | 785 | 886 |
| shiny-hunter | 355 | 619 | 829 | 905 |

Tiers were set from this table, not the reverse: `ELITE = 850` is clear of every
archetype's max with margin, which is the fairness property the tests enforce.

**If you change engine numbers, re-derive these.** The
`every archetype can reach a top-tier verdict` and
`every archetype reaches its own top-tier verdict` tests will fail loudly if a
tuning change makes an archetype a dead end — that's their whole job.

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
| ELITE | 850 | 5 signature (conditional) + 4 unconditional fallbacks |
| GREAT | 760 | one per archetype |
| colour | 620 / 600 | `NEARLY-MAN`, `CULT HERO OF {region}` |
| SOLID | 560 | `ONE-REGION LEGEND` + one per archetype |
| MODEST | 280 | one per archetype |
| FLOOR | 0 | `THE ROAD-WALKER` — universal, unconditional |

The floor entry guarantees `resolveVerdict` never returns undefined, so callers
never null-check a verdict. Asserted by
`the verdict table has a universal floor entry`.

Signature ELITE conditions:

| Verdict | Archetype | Requires |
|---|---|---|
| `THE UNDEFEATED` | aggro | `titles ≥ 3 && losses ≤ wins × 0.6` |
| `THE IMMOVABLE` | stall | `bond ≥ 70` |
| `THE PROFESSOR'S PRIDE` | collector | `catches ≥ 45` |
| `CHROMATIC LEGEND` | shiny-hunter | `shinies ≥ 4` |
| `THE COMPLETE TRAINER` | balance | — |

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
pnpm test:unit      # vitest — 106 tests, engine + i18n + deeplink + streak + analytics
pnpm test:browser   # puppeteer — 7 suites, 75 tests (48 pre-existing + 27 journey)
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

27 tests including: the full run through a real DOM, the card rasterising with
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
