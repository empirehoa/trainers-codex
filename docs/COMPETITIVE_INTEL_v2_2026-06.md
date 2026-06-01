# Trainer's Codex — Competitive Intelligence v2 (2026-06-01)

**Supersedes:** `COMPETITIVE_INTEL.md` (2026-05-29) for anything that conflicts.
**Method:** Fresh web research (June 2026) + honest self-audit of the live v5/v6
build (`src/`, `worker/`, `docs/v6-PLAN.md`).
**One-line verdict:** The design/identity/merch wedge is real and *shipped*.
What stands between us and "best" is **competitive-credibility table-stakes**
(Showdown import + current Champions data) and **discipline** (don't lead with a
non-live, non-unique AI card; don't build a full battle sim).

---

## 1. Where we actually stand — TC in the feature matrix

Scored against code, not docs. Legend: ✓ yes · ~ partial · – no.
Columns: **TB** team builder+coverage · **CT** counter suggest · **1300+** all
forms · **Art** poster/art gen · **Mer** POD merch · **AI** AI cards from photo ·
**Syn** cloud sync · **Mob** mobile · **Fr** free · **Pd** paid · **Rec**
recurring · **Sim** battle sim · **VGC** tournament/import.

| Competitor | TB | CT | 1300+ | Art | Mer | AI | Syn | Mob | Fr | Pd | Rec | Sim | VGC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pokémon Showdown | ✓ | ~ | ✓ | – | – | – | ✓ | ~ | ✓ | – | – | ✓ | ✓ |
| Pikalytics | ✓ | ✓ | ✓ | – | – | – | ✓ | ✓ | ✓ | – | – | – | ✓ |
| Champions Lab *(new)* | ✓ | ✓ | ✓ | – | – | – | ✓ | ✓ | ✓ | ~ | ~ | ✓ | ✓ |
| Pokestats.gg *(new)* | ✓ | ✓ | ✓ | – | – | – | ~ | ✓ | ✓ | – | – | – | ✓ |
| Marriland | ✓ | – | ✓ | – | – | – | ~ | ✓ | ✓ | – | – | – | ~ |
| Smogon | ~ | ~ | ✓ | – | – | – | – | ~ | ✓ | – | – | ~ | ✓ |
| PokeBattler (GO) | ✓ | ✓ | ~ | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| PokemonDB | – | – | ✓ | – | – | – | – | ✓ | ✓ | – | – | – | – |
| Generic AI card tools | – | – | – | ✓ | ~ | ✓ | – | ✓ | ✓ | ✓ | ~ | – | – |
| **Trainer's Codex** | **✓** | **✓** | **✓** | **✓** | **✓** | **~** | **✓** | **✓** | **✓** | **✓** | **✓** | **–** | **–** |

**Read:** We are the *only* row with ✓ in both **Art** and **Merch** — empty for
every data tool. That white-space is built and live, not aspirational. We also
genuinely hold full-form coverage (1,307, verified in `pokemon-data.json`).
We're exposed on the right two columns — **Sim** and **VGC/import** — which is
exactly where the launch audience (r/stunfisk, r/VGC) lives.

---

## 2. What we genuinely own (confirmed in code)

- Live coverage scoring + counter-team — `src/lib/analysis.ts`
- 12 canvas poster styles — `src/lib/constants.ts` (`ART_STYLES`) + `posters.ts`
- 12×4 POD catalog at real Printful base costs, 300 DPI renderers — `merch.ts`, `merch-renderers.ts`
- Optional Supabase sync, recurring Stripe Premium Pack — `worker/`
- All 1,307 forms with form-aware game gating — `pokemon.ts`, `compatibility.ts`
- Single-file `bundle.html` architecture — the genuine engineering moat

**No competitor combines team data + identity art + merch. The thesis holds.**

---

## 3. Three corrections to the May-29 intel (fresh June research)

1. **"AI trainer cards from a user photo — zero direct competitors" is no longer
   true at the feature level.** There are now many generic AI trainer-card
   generators (Kapwing, LightX, insmind, AI-Portraits, HitPaw, Filtrix, and the
   sprite-based CircleJourney). The AI card is commoditized. **Our moat is the
   *integration* — team data → card → merch — not the card itself.** Also: it's
   still `~`, not `✓`. `worker/src/ai.ts` is scaffolded but returns 200 without
   generating; blocked on the fal.ai key. Either ship it fully or stop leading
   with it.

2. **A new direct threat to the core appeared: Champions Lab + Pokestats.gg.**
   Both shipped team builder + battle simulator + Champions meta, free, updated
   within the last week. They lack our art/merch layer but out-feature us on the
   competitive-credibility axis (sim + import) for free. Champions Lab is now a
   more dangerous comp than PikaTeams because it's Champions-native and growing.

3. **Our data may be one game behind the meta.** `constants.ts` stops at Gen 9 /
   Z-A; there's no Champions entry. Pokémon Champions (live since **April 8,
   2026**) introduced new Mega forms with new abilities — Mega Meganium (Mega
   Sol), Mega Emboar (Mold Breaker), Mega Feraligatr (Dragonize). **Verify
   `pokemon-data.json` includes these**; if not, we look stale to the exact
   competitive crowd we're courting at Worlds.

---

## 4. Gaps that matter (ranked — fresh research and our own v7 doc agree)

1. **Showdown / PokePaste import-export — highest ROI, not built.** Every
   credible tool has it (Pikalytics, Pokestats.gg, Champions Lab). Launch on
   r/stunfisk without it and the top comment is "no Showdown import = unusable."
   ~1-week build; converts us from "poster toy" to "real team tool." **First.**
2. **Champions-format meta + data freshness** — new megas/abilities above + a
   Champions format selector. Table-stakes by the Worlds window.
3. **Lightweight matchup/damage calc (NOT a full sim)** — use `@smogon/calc`.
   Closes the visible Showdown gap without the multi-week `@pkmn/sim` trap.
4. **Shareable public team/trainer profiles** — cheap on-ramp to friends +
   leaderboards *and* the viral loop that feeds merch. Schema already in
   `docs/supabase-v6-schema.sql`.
5. **VGC/tournament import as the Worlds hook** — owning Champions import before
   Aug 28 is the single biggest launch tailwind.

---

## 5. The play — how to be the best

We don't win by out-simming Showdown. We win by being **the only place a
competitive team becomes an identity you can wear** — while being *credible
enough* that the competitive crowd doesn't dismiss us.

```
Now → mid-Jul   Ship Showdown/PokePaste import-export (#1).
                Verify + refresh Champions data + new megas (#2).
                → these two make us legitimate to r/stunfisk.
Mid-Jul         Decide the AI card: wire fal.ai and ship it real, OR pull it
                from the headline. No ~ features in the launch story.
Late Jul        @smogon/calc matchup preview + public team profiles.
                → now sticky AND shareable.
Aug 26 (Tue)    HARD LAUNCH, before Worlds (Aug 28–30). Champions import live.
                Lead with the LOOP (build → analyze → wear it), not the AI card.
                r/stunfisk + r/VGC: analyzer + import.
                r/pokemon + short-form video: poster/merch.
                WolfeyVGC / CybertronVGC cold outreach w/ existing demo.mp4.
Defer ruthlessly: full battle sim, native apps, badge verification.
```

---

## 6. Legal — win without lawsuits

**Handled well (keep enforcing):**
- No "Pokémon" in app name, domain, product titles — bright line in `merch.ts`.
- Original merch designs only; sprites appear in user previews, never as the
  product's claimed subject. (Precedent: the Poképrincxss merch C&D — Nintendo
  acted on merchandise carrying Pokémon trademarks, including "pokéballs.")
- Footer disclaimer present (`App.tsx`); DMCA/legal pages live.

**New surface to watch — AI-generated images:**
- Keep the prompt constraint "anime-style, original art direction, NOT based on
  official Pokémon artwork"; store the prompt server-side as evidence.
- Run uploaded user photos through image moderation before storing (faces +
  inappropriate content); short TTL on stored photos.
- Never let AI output reproduce official Sugimori art or TCG card frames.

**Open action:** register `legal@trainerscodex.com` as a US Copyright Office
DMCA designated agent ($6 / 3 yrs) for safe-harbor.

---

## 7. Bottom line

The wedge is real and shipped — we own the design/identity/merch lane outright.
The thing between us and "best" isn't a missing differentiator; it's
credibility table-stakes (Showdown import + current Champions data) and
discipline (don't lead with a non-live, non-unique AI card; don't build a full
sim). Close those two, time it to Worlds, win.
