# Competitive delta + capability re-score — 2026-08-20

Two-week delta on `COMPETITIVE_INTEL_v3_2026-08.md` (Aug 6, the *builder*) and
`JOURNEY_STRATEGY_2026-08.md` (Aug 7, *Journey Mode*). Those two documents still
stand; this one records what changed, what v9/v10 closed, and one category the
earlier sweeps missed.

Sourcing rule unchanged: every figure is sourced or marked unverified. Vendor
self-reported numbers are labelled as such — none of them are audited.

---

## 0. The three things that changed

1. **The builder category went from competitive to commoditized.** The v3 sweep
   counted ~10 free Champions tools launched in Q2. A sweep today surfaces
   **16+ distinct live tools**, several launched or updated inside the last two
   weeks. This is no longer a market to compete in on features.
2. **A large adjacent category was missed by both prior sweeps: pack-opening
   simulators.** Same shape as us — free, browser, no account, artifact-first —
   but at a scale nothing in our competitive set approaches, and monetized
   through a channel we are not using.
3. **Nothing has entered the career-sim lane.** Two weeks on, a targeted sweep
   still finds no Pokémon career simulator with a shareable end-card. The core
   Journey Mode concept remains unoccupied.

---

## 1. The builder is now a red ocean — stop investing in it

Live Pokémon Champions builders/calculators found in one sweep:

Pikalytics · ChampTeams.gg · PokeSynergy · Champions Builder · Porygon Labs ·
ChampionsHub · VGC Helper · PikaChampions · VGC.tools · PokemonBuilder ·
Champions Lab · MetaVGC · Pokémon Zone · NCP VGC Damage Calculator

Two data points on how fast this is moving:

- **PokeSynergy** advertises a meta-threat dataset **updated 2026-08-15** —
  five days ago (vendor claim).
- **PokemonBuilder** claims **10,295 real battle replays and 8,705,800
  simulations** behind a prediction engine (vendor claim, unaudited).

None of them charge. All of them do type coverage, speed tiers, damage calc and
Showdown import/export — the feature set Trainer's Codex's builder half offers.

**Read.** This confirms the v3 thesis harder than v3 stated it. Coverage
analysis is not a product any more; it is table stakes that fourteen teams give
away. We cannot win on replay volume against a competitor with 8.7M simulations,
and we should not try. The builder's remaining strategic job is to be the
*destination* of the Journey Mode handoff — which is the one thing on the
capability matrix marked `✓✓ unique` — not a thing anyone arrives for.

**Concrete implication:** the v3 P0 "Champions credibility" work is worth doing
only to the extent it makes the handoff land. Building toward parity with
Pikalytics is spending against fourteen free competitors for a customer who has
already picked one.

---

## 2. The category both prior sweeps missed: pack-opening simulators

Live: PackRip · pokemonsim.com · pokemoncard.io/pack-sim · PikaWiz ·
pokemon-pack-simulator.com · My TCG Collection · PokeTCG Sim (Android).

Why this matters more than the builder list:

| Property | Pack sims | Journey Mode |
|---|---|---|
| Free, browser, no account | ✓ | ✓ |
| Artifact-first (the thing you get) | ✓ | ✓ |
| Randomized **reveal** as the core loop | ✓✓ | ✗ |
| Collection persists across sessions | ✓ | ~ (dex, in-run) |
| Native TikTok format | ✓✓ | ✗ |
| Monetized | affiliate | none yet |

Three findings:

- **Scale.** One simulator reports **over 165 million packs opened** (vendor
  self-report, unaudited). Even discounted heavily, that is a different order of
  magnitude from anything in the v3 or Aug-7 competitive sets.
- **The mechanic is the reveal, not the artifact.** PackRip's pitch is
  "authentic pull rates, real holo effects" across 139 sets from 1996–2026. The
  product is the *moment of not knowing*, repeated. This is the same finding the
  Aug-7 doc reached from the voxel-mod teardown — transformation beats artifact —
  arriving independently from a second direction. Two independent sweeps
  converging on one conclusion is the strongest signal in either document.
- **An unused monetization channel.** At least one runs on **TCGplayer affiliate
  links** for hosting costs. We have a TCG dialog already (`TCGCardsDialog.tsx`,
  pokemontcg.io). Affiliate is materially lower-risk than POD merch: it needs no
  R2, no Printful, and — critically — **no counsel sign-off on printing
  silhouettes of copyrighted character designs**, which is the gate currently
  holding `JOURNEY_MERCH_CTA` off. It is not a replacement for the merch thesis,
  but it is revenue that is not blocked on the two Sprint 0 items that have now
  both missed their hard dates (Aug 7, Aug 12).

**Do not build a pack simulator.** Seven exist, one has a nine-figure counter,
and the IP posture of showing official card images is materially worse than
anything we currently do. The transferable lessons are the reveal mechanic and
the affiliate channel.

---

## 3. Copero: the format gets cloned in weeks

The Aug-7 doc treats copero.org as the model. Worth recording what happened to
it: a sweep for it returns **at least seven live domains** running the same
product — `copero.org`, `coperojuego.com`, `coperojuego.app`, `coperogame.com`,
`copero.net`, `copero.xyz`, `copero.online` — one of which explicitly disclaims
being connected to the others.

The mechanic is trivially cloneable and gets cloned fast. This is direct
evidence for the §1.8 defensibility thesis: **the sim is not the moat, the funnel
is.** It also sharpens the v3 doc's defensive-domain recommendation from
housekeeping to urgent — Copero is currently losing its own brand-name SERP to
clones, which is the failure mode to avoid, and it costs ~$50 to prevent.

---

## 4. Capability re-score — what v9/v10 actually closed

The Aug-7 doc listed eleven gaps. v9 and v10 shipped since. Re-scored against
the code as it stands today:

### Closed

| Gap | Closed by |
|---|---|
| Async ghost opponents (P2 #11) | `journey/ghosts.ts` — real careers on the same seed fill the World Cup bracket; generated field with zero ghosts, so it degrades cleanly offline |
| Telegraph escalation (P1 #7) | `journey/campaign.ts` — antes with superlinear score targets per region stop |
| Items spent in prepare | `journey/items.ts` |
| Player-chosen evolution | `journey/levels.ts` + `evolution.ts` |
| Cross-run meta-progression (partial) | levels/XP + campaigns |

### Still open, re-ranked

| # | Gap | Why it still matters |
|---|---|---|
| **1** | **9:16 video export of the card assembling** | Still the single highest-leverage unbuilt item in either document, and now supported by a second independent line of evidence (§2). No `MediaRecorder`/`captureStream` anywhere in `src/`. |
| **2** | **Rarity percentile on the card** | **Newly unblocked — see §5.** |
| 3 | Named rank tiers | People share words, not integers. Cheap: a lookup over the score. |
| 4 | Freeze / carry-forward in prepare | Converts "spend what dropped" into "execute a plan." |
| 5 | Visible currency + priced reroll | `items.ts` states outright: "There is no shop and no currency." Nothing in a run currently *costs* anything. |
| 6 | Streak repair | No `repair` in `streak.ts`. Still nobody in the category offers it. |
| 7 | Daily archive / Unlimited | Doubles as the indexable SEO surface §1 says we need. |
| 8 | Spatial prepare board | Largest effort, least evidence. |

---

## 5. The rarity percentile was impossible until today, and nobody knew

The Aug-7 doc's P2 #9 recommends putting "your six is rarer than 94% of today's
trainers" on the card, citing Immaculate Grid retrofitting exactly that.

**That feature could not have worked on the code as it stood this morning.** The
score saturated: measured across 6,000 careers, p85 through p99 were **all
exactly 999**, because v10's Balatro multiplier landed as
`Math.min(999, total * mult)` and the clamp was binding for more than a sixth of
all runs. A percentile computed over that distribution would have told the top
sixth of players they were all tied at the 85th percentile — the exact opposite
of the bragging-rights mechanic the recommendation is reaching for.

Fixed in the same pass as this analysis (PR #2): the multiplier now closes a
fraction of the remaining headroom rather than multiplying through it, so 999 is
an asymptote and the distribution runs p50 661 / p90 785 / p95 813 / max 941.
**A percentile is now a meaningful number**, and #2 above moves from "nice idea"
to "cheap and ready."

This is the general lesson worth keeping: a growth recommendation can be
silently blocked by a scoring defect that no correctness test can see. The
strategy doc and the engine have to be read against each other, which is why the
guards added in PR #2 assert *distribution* properties, not just correctness.

---

## 6. Recommended order

1. **9:16 video export.** Unchanged as P0 since Aug 7, now double-sourced.
2. **Rarity percentile + named rank tiers.** Both are score-presentation work on
   a score that finally supports them, and they ship together cheaply.
3. **TCGplayer affiliate on the existing TCG dialog.** The only revenue path not
   blocked behind R2, Printful, or counsel.
4. **Defensive domains/handles (~$50).** §3 upgrades this to urgent.
5. **Streak repair, daily archive.** Retention + the SEO surface §1 argues for.
6. **Currency/reroll and freeze/carry-forward.** Real depth, but they change the
   prepare loop and want their own calibration pass.

**Unchanged "do not":** don't lengthen the run · don't add interstitial ads ·
don't gate Journey Mode behind payment · don't chase builder feature parity
(§1) · don't build a pack simulator (§2) · don't submit to app stores
(Aug-7 §4, IP-takedown precedent).

---

## 7. Honest limits of this sweep

- **Reddit is still unreachable** from this environment — the same gap the Aug-7
  doc flagged. Voice-of-user research remains incomplete and this sweep did not
  close it.
- **Every scale figure in §2 and §1 is vendor self-reported** (165M packs,
  10,295 replays, 8.7M simulations) and unaudited. They establish
  order-of-magnitude, not fact.
- **No traffic data.** Semrush was available but not queried for this pass; the
  v3 organic findings (1 ranked keyword at position 73, Authority Score 2) are
  two weeks old and were not re-verified.
- **Etsy/POD pricing not re-checked.** The v3 figures ($15–45 trainer cards) are
  carried forward unverified.
- The competitor tool list is what one sweep surfaced, not an exhaustive census.
