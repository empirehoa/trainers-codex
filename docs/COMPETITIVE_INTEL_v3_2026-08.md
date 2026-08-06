# Trainer's Codex — Competitive Intelligence v3 (2026-08-06)

**Supersedes:** `COMPETITIVE_INTEL_v2_2026-06.md` for anything that conflicts.
**Method:** Four parallel fresh research sweeps (2026-08-06): (1) team-builder/analyzer
competitors, (2) art/card/merch competitors incl. Etsy/Fiverr demand signals,
(3) browser-game & daily-game landscape for Journey Mode, (4) Semrush SEO/traffic
data (US database, pulled 2026-08-06). Sources cited inline throughout; nothing
below is invented. Semrush Traffic Analytics (clickstream) was unavailable on the
current plan — all traffic figures are *estimated US organic search traffic*.

**One-line verdict:** The moat thesis still holds — nobody else combines team
data + identity art + merch — but the ground moved twice since June: **Pokémon
Champions is now the entire competitive platform** (and spawned ~10 free
purpose-built tools in a quarter), and **trainerscodex.com is organically
invisible (1 ranked keyword, position 73)**. The binding constraint is no longer
features. It is (a) Champions-era credibility and (b) distribution.

---

## 1. The three facts that should drive every decision

### Fact 1 — VGC lives inside Pokémon Champions now
Champions released April 8, 2026 (Switch; mobile June 17, 2026) and **officially
replaced Scarlet/Violet as the Play! Pokémon VGC platform in April–May 2026**
(Worlds runs on it Aug 29–30, San Francisco). It replaced EV spreads with a
**Stat Points system (66 total, 32 max/stat)** plus **VP (Victory Point) costs**
for recruiting/training, restored Megas, and runs monthly ranked seasons
(Reg M-A → M-B). Every serious competitor pivoted within weeks; at least ten
Champions-native tools launched in Q2 2026 (Champions Lab, ChampTeams.gg,
Porygon Labs, PokeSynergy, PokéChampions Coach, Champions Builder, TurnZeroVGC,
MetaVGC, PokéBase, plus Game8's builder). **None of them charges money yet.**
Sources: nintendolife.com/news/2026/03/pokemon-vgc-competitions-officially-transition-to-pokemon-champions,
pokemon.com Play! transition + Worlds announcements, porygonlabs.com, championsbuilder.com.

**Implication:** Codex's "1,307 forms incl. every Mega" dataset is *more*
relevant in Champions (Megas are back) — but without SP/VP modeling and Reg M-B
legality, Codex reads as a Gen-9 legacy tool to exactly the audience (r/VGC,
r/stunfisk) the launch plan targets.

### Fact 2 — trainerscodex.com has zero organic distribution
Semrush (US, 2026-08-06): **1 ranked keyword ("trainer dex", pos 73), est.
0 organic visits/mo, Authority Score 2.** The 95 backlinks / 28 ref-domains are
almost entirely Fiverr-grade PBN spam (`seopxl-*.shop`, `fiverr-seo-*.site`,
several from one Moldovan IP) — zero equity, real risk; disavow or ignore, never
buy more. Meanwhile the prize is large and soft:

| Keyword (US/mo) | Volume | KD | Who wins today |
|---|---|---|---|
| pokemon team builder | 74,000 | 38 | richi3f's **static GitHub Pages site** is #1 |
| pokemon team maker | 27,100 | 45 | same page cluster |
| pokemon type calculator | 18,100 | 20 | soft SERP |
| pokemon team planner | 12,100 | 43 | — |
| team builder pokemon | 9,900 | 18 | — |
| custom pokemon card | 6,600 | 23 | legacy card-makers |
| pokemon trainer card maker | 3,600 | 39 (ad comp 0.01) | circlejourney.net (~6K visits/mo total) |
| personalized pokemon card | 3,600 | **4** | nearly uncontested |
| pokemon champions team builder | 1,300 → spiking | 25 | pokebase.app, champteams.gg — **weeks old** |

The structural blocker is the single-file SPA: Google gets one URL. nuzlocke.app
(1,669 referring domains, ~0 measurable organic) is the cautionary tale;
marriland.com's *one* tool page (~15K visits/mo) and pikalytics' per-Pokémon
usage pages are the winning patterns.

### Fact 3 — the money is provably in the artifact, not the analysis
Etsy listings for personalized trainer cards / team portraits run $15–45 with
**5,200 and 11,300 reviews** on the top two listings (tens of thousands of
orders); Fiverr "draw your Pokémon team" gigs run $20–100+ with 4-day
turnarounds. Every free Champions tool has zero merch. Codex renders the same
artifact instantly. Meanwhile **no observed competitor charges a subscription
for analysis features** — ten free tools now do coverage/damage/speed. $4.99/mo
cannot sell what's free everywhere; it can sell posters, print credits, AI art,
and unlimited cloud teams. Mobile comps (ProDex $0.99–5.99 IAP, dataDex PRO)
prove Pokémon users pay — at one-time-purchase price points.

---

## 2. Updated feature matrix (Aug 2026, scored against our shipped v6+Journey build)

Legend: ✓ yes · ~ partial · ✗ no. TC = this repo (v6 line + Journey Mode merged).

| Capability | TC | Showdown | Pikalytics | Pokestats.gg | ChampTeams | Porygon Labs | Champions Lab | crob.at | Media.io/AI-card tools |
|---|---|---|---|---|---|---|---|---|---|
| Full-form dex (1,300+) | ✓ | ✓ | ~ | ✓ | ? | ✓ | ✓ | ✓ | ✗ |
| Coverage scoring | ✓ | ✗ | ~ | ✓ | ✓ | ~ | ✓ | ~ | ✗ |
| Counter-team suggest | ✓ | ✗ | ✗ | ✗ | ~ | ✗ | ? | ~ | ✗ |
| Showdown/PokePaste text I/O | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| **Paste-URL import (pokepast.es etc.)** | **✗** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Damage calc (KO%, field) | ~ (@smogon/calc preview) | ~ | ✓ | ? | ✓✓ | ✓✓ | ? | ✗ | ✗ |
| **Champions SP/VP modeling** | **✗** | ✓ (formats) | ✓ | ✓ | ✓ | ✓✓ | ✓ | ~ | ✗ |
| **Usage stats in builder** | **✗** | ✗ | ✓✓ | ✓✓ | ✓ | ✓ | ✓ | ~ | ✗ |
| **Speed tiers (TW/TR)** | **✗** | ✗ | ✓ | ✓ | ✓✓ | ✓ | ? | ✗ | ✗ |
| One-click tournament team import | ✗ | ~ | ✓ | ~ | ✓ | ✗ | ✓ | ✓ | ✗ |
| Game-compat bridge (Switch titles) | ✓ unique | ✗ | ✗ | ~ | ✗ | ✗ | ✗ | ✗ | ✗ |
| TCG lookup | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Poster/art engine (12 styles) | ✓✓ unique | ✗ | ~ img export | ✗ | ✗ | ✗ | ✗ | ~ | ~ (prompt slop) |
| POD merch pipeline | ✓✓ unique | ✗ | ✗ | ✗ | ✗ | ✗ | ~ ("Shop", nascent) | ✗ | ✗ |
| AI art studio | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Daily/run game layer | ✓ (Journey) | ✗ | ~ quizzes | ✗ | ~ preview trainer | ✗ | ~ Battle Bot | ✗ | ✗ |
| Cloud sync + public profiles | ✓ | ✓ | ~ | ? | ? | ✓ | ? | ✗ | ✗ |
| Offline/PWA | ✓ | ~ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Multi-language | ~ (i18n scaffold, EN) | ✓ | ~ | ? | ? | ? | ? | ✗ | ~ |
| Charges money | ✓ $4.99/mo | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ $5–33/mo |

**Bold ✗ = the four credibility gaps.** Everything in the left third of the
matrix (art, merch, game-compat, TCG, Journey, offline) remains uncontested.

Near-miss watchlist: **Champions Lab** (velocity + influencer coverage + nascent
Shop), **Pokestats.gg** (closest scope overlap), **PokéBase** (multi-game + TCG
Pocket + weekly cadence), **PokemonTeamForge** (builder + "Team Card Generator",
~0 traffic today), **Media.io** (Wondershare building "Pokemon Team Card Maker"
SEO pages on raw text-to-image).

---

## 3. The plan — ranked, with effort

### P0 — Champions credibility (the table stakes, ~1–2 focused sessions)
1. **Reg M-B / Champions format in the format layer** — we already ship a
   ruleset engine (`src/lib/formats.ts`) with Champions groundwork from sprint 2;
   finish: Reg M-B legal pool + a visible "Champions VGC 2026" chip. Update
   monthly per season.
2. **SP planner (66/32) + VP cost display** on the member config dialog —
   Champions' replacement for EV spreads. Every Champions tool has it; ours can
   be prettier (live stat bars already exist).
3. **Speed tiers panel** in the analysis sheet (base + SP-modified, Tailwind/
   Trick Room toggles) — cheapest gap to close; data already inlined.
4. **Paste-URL import** — accept pokepast.es / pokebin / teams.pokemonshowdown
   links in the existing Showdown import dialog (fetch + parse; graceful CORS
   fallback to "paste the text").

### P1 — Distribution (the actual bottleneck)
5. **Static satellite pages** on real URLs (`/team-builder`, `/champions/`,
   `/type-calculator`, `/card-maker`, `/daily`) — pre-rendered HTML shells with
   title/H1/copy/FAQ/schema that deep-link into the app. The worker already
   fronts the domain; serve them from KV/R2. This is the marriland play
   (one good tool page ≈ 15K visits/mo).
6. **Per-Pokémon pages** (`/pokemon/<slug>` × 1,307) generated at build time
   from the inlined dataset (stats, matchups, best teammates, coverage gaps,
   "add to team / make poster" CTA). This is 100% of what pikalytics and
   pokemondb traffic is made of. Sitemap + canonical + server routing.
7. **Shareable team URLs with OG poster images** (`/team/<slug>`) — crob.at's
   entire product, but beautiful; every share is an indexable page + a social
   ad. (Public profiles shipped in sprint 4 give us the storage layer.)
8. **Reddit launch sequence** — r/VGC + r/stunfisk "I built a Champions team
   builder with SP planning + poster export" (launch posts literally rank #3 in
   Google for "pokemon champions team builder"); r/pokemon for the poster/merch
   angle; Product Hunt for backlinks. **Time to Worlds (Aug 29–30): 3 weeks** —
   the season-end "rank card" moment.
9. **Disavow/ignore the PBN backlinks**; earn listings on the tool roundups
   that already rank (DevonCorp VGC resources, IGN team-planner article,
   GitHub awesome lists).

### P2 — Journey Mode as the growth engine (research-validated design)
10. **Same-seed daily** with countdown + streak on `daily_played` (not wins) +
    one free streak-repair (Duolingo's +40% streak-engagement pattern).
11. **Dual-format share**: Legend Card image + one-tap copyable emoji summary
    line (Wordle/Squirdle pattern) — spoiler-free for the day's seed.
12. **Rarity score** on every run ("rarer than 97% of today's trainers") —
    Immaculate Grid/PokeDoku both retrofitted this because binary results stop
    being shareable.
13. **Structural builder handoff** — every run ends in "rebuild this team in
    the builder" (the Immaculate Grid → Sports Reference acquisition logic;
    already wired as `builder_handoff`).
14. **Creator Journeys** — guest-authored daily seeds by Pokémon YouTubers
    (PokeDoku's "Creator Mondays" distribution engine).

### P3 — Monetization repositioning
15. Anchor Premium on what's uncontested: premium poster styles, AI Studio,
    print credits, unlimited cloud teams, streak insurance, run archive —
    **never** on analysis features ten free tools give away. Add a **$14.99
    one-time "Codex Lifetime"** tier (mobile IAP comps: ProDex $0.99–5.99/module).
16. Merch stays own-brand (Trainer's Codex / Legend Card marks, user's design,
    no character names in listings) — the PokeDoku shop.dokugames.com pattern.
    Moment-based SKUs: season-end rank cards, Worlds-week posters, Nuzlocke
    memorials.

---

## 4. Legal watchlist (facts only — route decisions through counsel)
- Enforcement 2024–2026 hit: fan-game hubs (Relic Castle DMCA 3/2024), asset
  toolkits (Pokémon Essentials), leak content, YouTube channels using official
  footage (PokéNational, 2026), and mechanics-with-revenue (Palworld patent suit,
  ongoing). TPC publicly rebuked even the White House's "Pokopia" meme (3/2026).
- Visibly tolerated so far: trainer-card web tools (CircleJourney, mypokecard,
  pokecardmaker.net — years of operation at real traffic), PokeAPI-sprite team
  builders, marketplace fan merch (inconsistently swept).
- Survivor pattern: no official key art in *marketing*, no "Pokémon" in
  name/domain/listings (we comply), sell the user's design not official art,
  data-driven gameplay (Journey Mode's sim is types/stats — the Squirdle-clean
  posture), monetization decoupled from the IP (own-brand merch).
- The dangerous combination observed: **viral moment + visible revenue +
  official assets**. We deliberately have only the first two — keep it that way.
  The existing merch bright-line tests (`test-merch-legal.mjs`) and the AI
  art-direction guard stay load-bearing.

## 5. What changed vs. v2 intel (June)
- "Ship Showdown import + Champions data" → Showdown/PokePaste I/O **shipped**
  (sprint 1); Champions data layer **partially shipped** (sprint 2: game/format
  layer + Mega gating) — SP/VP + Reg M-B legality still open (P0 above).
- New since v2: the Champions tool gold-rush (10 entrants, all free), Pikalytics
  staleness attack surface ("last updated May 2026"), the SEO numbers (we now
  *know* we're invisible rather than suspecting it), Journey Mode exists and has
  a research-validated playbook, and Worlds Aug 29–30 gives a hard 3-week clock.
