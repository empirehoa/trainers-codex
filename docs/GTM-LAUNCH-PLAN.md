# Trainer's Codex — Go-To-Market & Launch Plan

**Author:** Growth (Claude Code) · **Date:** 2026-06-10 · **Status:** execute now
**Tentpole:** Pokémon World Championships 2026 — **San Francisco, Aug 28–30, 2026**
**Runway:** ~11–12 weeks from today.

> **Date correction (flagged, not silently overridden):** The brief cited Worlds
> as 2026-08-26. The official 2026 World Championships are **San Francisco,
> Aug 28–30, 2026** (Anaheim was the 2025 event, Aug 15–17). This plan is built
> to the real dates. Net effect: ~2 extra days of runway, and the SF venue is a
> gift — it overlaps the Product Hunt / Hacker News / tech-Twitter geography, so
> the Worlds push and the PH/HN push reinforce each other instead of competing.

---

## 0. The legal bright line governs everything below

Non-negotiable, repeated here so no tactic violates it:

- **Never** put "Pokémon" in a title, domain, store listing, PH tagline, HN
  title, ad, SEO `<title>` lead, or merch product name.
- **Never** sell merch with copyrighted character art, names, or official TCG
  card images. Merch designs are the app's *own* canvas renderers (Trainer
  Crest, Champion Roster, Trainer ID, Gym Banner) — original layout work the
  user composes.
- In *body copy* we may use "Pokémon" descriptively (nominative fair use) to
  identify the subject — exactly as the legal page and ToS already do. The word
  can appear in a sentence; it cannot appear in a **name slot** (title tag,
  domain, product name, brand).
- The AI Studio (photo→trainer-art via fal.ai) outputs are user-licensed for
  personal use only; we never market AI outputs as official or sell them as
  stock. Marketing of AI Studio must say "your photo, reimagined as trainer
  art" — never imply it generates Pokémon characters.

**Tension points flagged inline throughout with ⚠️.**

---

## 1. Positioning & messaging

### One-liner (the canonical pitch)
**"Build your dream team of six. Analyze every matchup. Wear it."**

Secondary technical one-liner (for HN / dev crowd):
**"1,307 creatures, full coverage analysis, and a poster generator — in one
HTML file that works offline."**

### The wedge
Existing tools are split into three boxes and none of them close the loop:
- **Damage calcs / Showdown** — powerful, ugly, competitive-only, no shareable artifact.
- **Pokédex/wiki sites** — reference, not creation; ad-choked; no team identity.
- **Merch sites** — generic, infringing, no connection to *your* team.

Trainer's Codex is the only tool where **analysis ends in an artifact you want
to show off** — a poster or a shirt of the exact team you just optimized. The
wedge is the *finish*: every other tool drops you after the math. We hand you
something beautiful and personal to share or wear.

### Who it's for (three buyers, three jobs)
1. **Competitive players (VGC/Smogon)** — job: validate coverage, find threats,
   export to Showdown. They come for the analyzer, stay for the export, share
   the coverage screenshot to argue about teams.
2. **Casual collectors / nostalgic fans** — job: build their "favorites" team
   and make it real. They come for the poster, convert on merch.
3. **Content creators (TikTok/Reels/IG/YouTube)** — job: produce visual content
   fast. They come for the 12 poster styles + AI Studio, and they are the
   *distribution* — every poster they post is a billboard.

### The viral hooks (what makes someone screenshot-and-share)
- **The poster is the share unit.** 1080×1350 is *exactly* Instagram-portrait.
  12 distinct, gorgeous styles means the same team can be posted 12 ways. The
  Holo Foil and Editorial styles are screenshot bait.
- **The AI Studio "me as a trainer" output** is the single most viral asset in
  the product — face-swap/identity content is the most-shared format on TikTok.
  ⚠️ Market it as "you, as a trainer" — never "you as a Pokémon character."
- **The coverage score (0–100) + "weak to / no hit on" strip** is *argument
  bait* for the competitive crowd. People share scores to flex or to start a
  fight. "My team is a 94, beat it."
- **The counter-team feature** ("here's a 6-mon team that wrecks yours") is a
  built-in callout mechanic — perfect for duels/threads.
- **"Fits in one HTML file, works offline"** is the share hook for the dev/HN
  tribe. Engineers share technical audacity.

---

## 2. ICP / audience segments (ranked)

| Rank | Segment | Why ranked here | Where they are |
|---|---|---|---|
| 1 | **Content creators (TikTok/IG/YouTube Shorts)** | They are *distribution*, not just demand. One creator post = thousands of impressions at $0 CAC. Highest leverage. | TikTok (#pokemon, #vgc, #competitivepokemon), IG Reels, YouTube Shorts, X |
| 2 | **Competitive players (VGC + Smogon)** | Highest engagement, highest Premium conversion, loudest opinions, concentrated communities. Worlds is *their* event. | r/stunfisk, r/VGC, Smogon forums, VGC Discords, X (#VGC2026) |
| 3 | **Casual / nostalgic collectors** | Largest TAM, highest *merch* conversion (emotional buy), lowest engagement. | r/pokemon, IG, TikTok, Facebook groups |
| 4 | **TCG players** | Adjacent; the in-app TCG lookup is the hook; merch conversion lower, affiliate-click higher. | r/PokemonTCG, r/pkmntcg, TCG Discords |
| 5 | **Dev / maker / IndieHacker crowd** | Won't buy merch, but amplifies the single-file story and drives the PH/HN spikes that seed everything else. | Hacker News, Product Hunt, r/webdev, IndieHackers, X dev-tech |

---

## 3. Channel strategy (ranked by ROI for a solo founder, ~$0 ad budget)

### Tier 1 — do these no matter what

**1. TikTok / Reels / YouTube Shorts (the growth engine)**
- *Angle:* the poster generator and AI Studio are inherently visual. This is
  where the product *demonstrates itself*.
- *What to post:* (a) screen-record building a team → poster reveal in a premium
  style, set to trending audio; (b) "I turned my photo into trainer art" AI
  Studio reveals; (c) "rate my team's coverage score" duet-bait; (d)
  "make your team a shirt in 30 seconds" merch reveals.
- *Cadence:* 1 short/day minimum from launch −4 weeks. Volume is the strategy —
  post 60 before judging. Repurpose each clip across all three platforms same day.
- *Timing:* start NOW (week of 6/10). The algorithm needs a 3–4 week warmup so
  the account isn't cold during Worlds week.
- *Self-promo rule:* none — this is owned media. Use a niche handle like
  `@trainerscodex`. Watermark every clip with the domain (bottom-left, subtle).
- ⚠️ Audio: trending sounds are often copyrighted music; that's standard
  TikTok use, but **never** use official Pokémon anime/game audio over merch
  CTAs — that links commercial intent to TPC audio. Use generic trending audio.

**2. r/stunfisk (200K, competitive) — highest-converting subreddit**
- *Angle:* lead with the analyzer, never the merch. "Live coverage scoring +
  threat detection + counter-team builder for any 6-mon team."
- *What to post:* a genuinely useful post — e.g., "I built a tool that flags
  the types your team can't hit super-effectively and suggests a counter-team.
  Feedback on the threat model?" Include the coverage-strip screenshot.
- *Timing:* launch week, AFTER you've been a real commenter for 2+ weeks.
- *Ban-avoidance rule (critical):* stunfisk hates self-promo. **Earn karma
  first** — spend the next 2 weeks answering team questions with genuine help.
  Post the tool as a *contribution to the discussion*, framed as "feedback
  wanted," not "check out my product." Reply to every comment. Never mention
  merch or Premium in the post body. Read their self-promo rule and post in any
  designated thread if one exists.

**3. r/pokemon (3.4M) — largest reach**
- *Angle:* the poster generator (casual-friendly, visual).
- *What to post:* "I built a free team builder that makes Instagram-style
  posters of your team — one HTML file, works offline, no account." Two poster
  screenshots. **No merch mention** in the post.
- *Timing:* launch week, a day or two after stunfisk so you've battle-tested
  messaging on a harsher crowd first.
- *Ban-avoidance rule:* r/pokemon allows OC tool shares but the mods nuke
  anything that smells like a storefront. Free-tool framing only. Merch lives
  one click deep inside the app, never in the Reddit post. Flair it correctly
  (likely "OC" or "Discussion"). 9:1 rule: have a comment history.

### Tier 2 — high value, time-boxed events

**4. Product Hunt (one-shot spike)**
- *Tagline (≤60 chars, trademark-safe):* "Build, analyze & print your dream
  team — in one HTML file." (No "Pokémon" in the tagline. The description body
  can say "for Pokémon fans.")
- *Assets:* 5 gallery images (3 poster styles, 1 coverage analysis, 1 merch
  mockup) + a 60–90s demo video (build → analyze → poster → shirt).
- *Timing:* **Tuesday Aug 18 or Wed Aug 19** (week before Worlds) — rides the
  pre-Worlds search wave, avoids being buried by Worlds-day news.
- *Mechanics:* line up 10–15 hunters/supporters the night before; ask for
  engagement (comments > upvotes) in the first 2 hours PT. Reply to every
  comment. Solo-founder PH posts that engage hit top-5 routinely.

**5. Hacker News — "Show HN" (one-shot spike)**
- *Title (trademark-safe, technical):* "Show HN: A team builder + analyzer that
  ships as a single 311 KB offline HTML file." The single-file/offline angle IS
  the hook; "Pokémon" can appear in the first body sentence, not the title.
- *Timing:* **Tuesday or Wednesday ~8–9am ET**, ideally the week of 8/24 so it
  laddered after PH. Don't post PH and HN same day.
- *Lead:* the engineering — inlined data, no build, no service worker, ships via
  drag-drop. HN converts low on merch, higher on Premium and on backlinks/SEO.
- *Rule:* be present in comments for 6+ hours; HN punishes drive-by promo.

**6. r/VGC + r/PokemonTCG (segment-specific)**
- r/VGC: same as stunfisk but lead with Showdown/PokePaste import-export and
  "Worlds team coverage check." Post during Worlds week — peak attention.
- r/PokemonTCG: lead with the TCG card-price lookup feature only. ⚠️ Never show
  merch with card art here; that crowd will instantly flag IP issues. Lower
  merch conversion, better affiliate clicks.

### Tier 3 — slow burn / retention, not acquisition spikes

**7. Discord communities** — *don't spam other servers.* Instead, (a) be a
helpful presence in 3–4 large VGC/competitive Discords (link the tool only when
genuinely answering a team question), and (b) stand up your own server
(`trainerscodex.gg`) as the retention lever for Premium subscribers. This is
the churn fix from the playbook, not an acquisition channel.

**8. X / Twitter** — daily poster drops from `@trainerscodex`, 1 mechanics
thread/week, reply-guy into VGC conversations during Worlds. Slow burn; mostly
amplifies the TikTok content. Use #VGC2026 / #PokemonWorlds2026 during the event
⚠️ in *post text only*, never in a product name.

### Channels to skip at launch
Paid ads (no baseline conversion to bid against), Facebook groups (low ROI,
high spam-flag risk), bot integrations (deferred per playbook), influencer
*payments* (instead, gift Premium + free merch to 10 mid-tier creators — barter,
not cash).

---

## 4. Content / SEO plan (8–12 pages, trademark-safe)

All pages are static HTML alongside `index.html` on Cloudflare Pages, share the
extracted bundle CSS, and end with a "build a team like this →" CTA into the app.
**Rule: the `<title>` and H1 never *lead* with "Pokémon."** Lead with the query
intent or the function; "Pokémon" sits mid-title where Google still indexes it
for the descriptive query but it's not the brand/name slot. This is the same
nominative-use posture as the ToS. Priority = (search volume × intent × ease to
rank as a fresh domain).

| # | Page slug | Target query | Title pattern (safe) | Why it ranks |
|---|---|---|---|---|
| 1 | `/team-coverage-calculator` | "pokemon team weakness calculator" | "Team Coverage Calculator — find your weaknesses" | High-intent tool query, weak SERP, our tool literally *is* the answer |
| 2 | `/transfer-guide` | "how to transfer pokemon to scarlet violet" (already named) | "Transfer Guide: moving your team between games via HOME" | 15k/mo long-tail, evergreen, low competition |
| 3 | `/best-team-by-type/{type}` (18 pages) | "best electric team competitive scarlet violet" | "Best Electric-Type Team — coverage & threats" | 18 long-tail pages, each shows a real analyzed team; programmatic SEO |
| 4 | `/tera-type-strategy/{type}` (cluster) | "best tera type for [mon]" | "Tera Type Strategy: when to Tera [Type]" | Competitive evergreen, high engagement, internal-links to #1 |
| 5 | `/showdown-import` | "pokepaste to team" / "import showdown team" | "Import a Showdown / PokePaste team and analyze it" | Tool-intent, captures Smogon overflow, demonstrates the import feature |
| 6 | `/type-chart` | "pokemon type chart" | "Interactive Type Chart — weaknesses & resistances" | Massive evergreen volume; ours is interactive (dwell time → ranking) |
| 7 | `/best-team-builder` | "pokemon team builder" | "Free Team Builder — analyze & visualize your six" | Head term, hard but worth a long-tail-supported run |
| 8 | `/counter-team` | "how to counter a pokemon team" | "Counter-Team Builder — beat any six" | Unique feature = unique SERP; low competition |
| 9 | `/vgc-2026-team-check` | "vgc 2026 team" / "worlds 2026 teams" | "VGC 2026 Team Coverage Check" | Timely, rides Worlds search spike Aug–Sep |
| 10 | `/poster-maker` | "pokemon team poster maker" | "Team Poster Maker — 12 Instagram-ready styles" | Visual-intent, near-zero competition, feeds the viral loop |
| 11 | `/shiny-team-tracker` | "shiny team showcase" | "Shiny Team Showcase — build & flex your shinies" | Niche, passionate, high merch intent |
| 12 | `/best-team-by-game/{game}` (6 pages) | "best team scarlet violet" | "Best Team for Scarlet & Violet — fully analyzed" | Per-game programmatic, evergreen, internal-link hub |

**Build order:** #2, #6, #1, #9 first (highest ROI + #9 is time-sensitive for
Worlds). Batch #3 and #4 programmatically (template + data loop) over a weekend.
⚠️ Every page: footer disclaimer identical to the ToS ("not affiliated with
Nintendo / TPC"), no character art in OG images — use our own poster renders as
the share preview.

---

## 5. Viral loops (the share mechanics, spelled out)

**Loop A — The Poster Loop (primary, casual + creator)**
```
User builds team → opens Poster Studio → picks a style → downloads 1080×1350 PNG
  → posts to IG/TikTok/X (watermarked w/ trainerscodex.com bottom-left)
  → followers see a gorgeous team poster → "what made that?" → visit site
  → build their own → post → ...
```
Mechanics to add/confirm:
- **Watermark every downloaded poster** with a tasteful `trainerscodex.com` mark
  (small, corner). This is the single highest-leverage growth change. The free
  styles keep the watermark; you could offer watermark-removal as a Premium perk
  — but DON'T at launch; the watermark IS the loop. Reconsider month 3.
- **One-tap share sheet** in the poster dialog (native `navigator.share`) so
  mobile users post in two taps, not "download then find the file."

**Loop B — The Shareable Team Link (primary, competitive)**
```
User builds team → "Share" generates a sharecode URL (analysis.ts already has
  sharecode) → pastes into a Discord/Reddit/X argument → recipient opens link,
  sees the exact team + coverage score → modifies it → re-shares their version
```
Mechanics to add/confirm:
- The sharecode loads a **read-only team + live coverage score** for anyone,
  no account. The OG image for a shared link should auto-render that team's
  poster (Cloudflare Worker can generate it) so the link unfurls beautifully in
  Discord/X/iMessage — unfurl quality drives click-through.
- Add a **"score badge"** (e.g. "Coverage 94/100") to the OG image — that number
  is the argument bait that makes people click.

**Loop C — The Merch Loop (revenue + slow virality)**
```
User loves their team → orders a shirt/poster → wears it / hangs it →
  friends ask "where's that from?" → word of mouth → site visit
```
Merch is a weak *viral* loop (offline, slow) but a strong *revenue* loop. Don't
over-invest in merch-as-acquisition; invest in merch-as-monetization. The poster
is the acquisition unit; the shirt is the cash unit.

**Loop D — The AI Studio Loop (highest viral ceiling, content-creator fuel)**
```
User uploads selfie → AI Studio renders "you as a trainer" art →
  reveal-format post (before/after) → face-swap content is peak TikTok →
  huge reach → site visit
```
⚠️ This is the loop with the most upside AND the most IP sensitivity. Market it
strictly as personalized *trainer-style portrait of the user*, never as
generating Pokémon. Keep outputs personal-use licensed (already in ToS §6).

---

## 6. Launch sequence (week-by-week, 2026-06-10 → 2026-09-12)

**Week 0 — Jun 10–15: Foundation (do this week)**
- Deploy `bundle.html` to trainerscodex.com (Cloudflare Pages). Wire Plausible.
- Live-mode test: one real $4.99 Premium purchase + one real Printful tee order
  end-to-end. Confirm watermark + `navigator.share` on poster download.
- Capture 6 hero screenshots + record 5 short clips (bank content).
- Stand up `@trainerscodex` on TikTok, IG, X, YouTube. Reserve `trainerscodex.gg`
  Discord.
- Start a tiny email list: a one-field "get notified at launch" capture on a
  `/soon` page (ConvertKit free tier or a Worker + KV).

**Weeks 1–3 — Jun 16 – Jul 6: Content warmup + community seeding**
- **Post 1 short/day** across all platforms. Goal: 60 clips before Worlds; let
  TikTok find the audience. Track which formats pop (poster reveal vs AI Studio
  vs coverage-score).
- Build SEO pages #2, #6, #1, #9 and ship them (indexing takes weeks — start now).
- Become a genuine contributor in r/stunfisk, r/VGC, 3 VGC Discords. **No links
  yet.** Pure karma + relationship building.
- Recruit 8–12 friends/fans for a private beta. Ask each: "1 thing broken, 1
  thing you love." Fix the broken things.

**Weeks 4–6 — Jul 7 – Jul 27: Beta → soft launch**
- Open beta to email list + Discord. Drive first 200–500 real sessions.
- Gift Premium + a free custom shirt to 10 mid-tier creators (5–50k followers)
  in the VGC/Pokémon niche — barter for an honest post during Worlds week.
- Ship SEO pages #3 (18 type pages) + #4 (Tera cluster) programmatically.
- First *soft* Reddit toe-dip: answer team questions in stunfisk/VGC and, when
  directly relevant, drop the tool as a helpful reply (not a top-level post yet).

**Weeks 7–8 — Jul 28 – Aug 10: Pre-launch ramp**
- Tighten messaging based on which TikToks converted. Double down on the winner.
- Build SEO pages #5, #7, #8, #10. Internal-link everything to the app.
- Line up PH hunters + HN timing. Draft PH assets + HN post.
- Push email list to 500+ via the content engine (every TikTok bio → /soon).

**Week 9 — Aug 11–17: Reddit launch week**
- **Tue Aug 11:** top-level post to **r/stunfisk** (analyzer angle). Reply all day.
- **Thu Aug 13:** top-level post to **r/pokemon** (poster angle, free-tool framing).
- **Sat Aug 15:** **r/PokemonTCG** (TCG-lookup angle only).
- Pin the launch tweet; start daily poster drops on X.

**Week 10 — Aug 18–24: Product Hunt + Hacker News**
- **Tue Aug 18:** Product Hunt launch. All-day comment engagement.
- **Wed/Thu Aug 24/25:** "Show HN" (single-file/offline angle).
- Ramp TikTok posting to 2/day — Worlds hype is building, ride the search wave.
- Ship SEO page #9 update (VGC 2026) and #12 (per-game) — peak relevance.

**Week 11 — Aug 25–31: WORLDS WEEK (the tentpole), SF Aug 28–30**
- **The whole week is the campaign.** Daily AI Studio + poster content tagged
  #VGC2026 #PokemonWorlds2026 (post text only ⚠️).
- Post a "build the Worlds-winning team's coverage" analysis the moment results
  drop (timely = shareable). Use sharecode links so it spreads.
- r/VGC top-level post mid-week (peak attention): "coverage check your Worlds
  team." Reply all day.
- Reply-guy into every viral Worlds Twitter thread with a relevant team poster
  or coverage link (helpful, not spammy).
- **This is the merch spike window** — fans are maximally emotionally engaged.
  Surface the "make it a shirt" CTA prominently in-app this week only.

**Weeks 12–13 — Sep 1–12: Post-Worlds harvest + retro**
- Convert the traffic spike into retained users: push Discord invites, email
  capture, Premium offers to the engaged.
- Publish a "best teams of Worlds 2026, analyzed" content piece (rides the
  long-tail search that persists for months). ⚠️ Use our own poster renders, no
  broadcast screenshots/character art.
- **Day-30 retro** against the metrics in §7. If anything misses by >50%, fix
  the funnel before spending more acquisition energy.

---

## 7. Metrics & targets (cold-launch realistic)

Watch these five. Everything else is noise at this stage.

| Metric | Definition | Launch-month target | Healthy by month 3 |
|---|---|---|---|
| **Activation** | % of sessions that build a full team of 6 | **35%** | 45% |
| **Share rate** | % of activated users who download a poster OR copy a share link | **20%** | 30% |
| **Viral K-factor** | invites (poster posts + shared links) × conversion to new session, per user | **0.15–0.3** (sub-viral, expected cold) | 0.4–0.6 |
| **Merch conversion** | % of WAU who place a merch order | **0.5–1.0%** | 1.5% |
| **Premium conversion** | % of WAU who subscribe | **1–2%** | 2% |

**Volume targets (month 1, consistent with the playbook):**
- 20,000+ pageviews · 5,000+ unique sessions
- 50+ Premium subs (~$250 MRR) · 20+ merch orders (~$300 margin)
- Discord 200+ · email list 500+ · TikTok 60+ posts shipped

**The one number that predicts everything:** share rate. If activated users
aren't posting posters/links, the loops are broken and acquisition will stall —
fix watermark, share-sheet, and OG-image unfurl before scaling channels. A cold
launch will NOT hit K>1; that's fine. The job in months 1–3 is to get K from
~0.2 toward ~0.5 by tightening the share mechanics, not to fake virality.

---

## 8. Risks & mitigations

**R1 — IP enforcement (existential).** Nintendo/TPC are historically aggressive.
- *Mitigations:* the bright line (no trademark in name slots, no character art
  on merch, own-renderer prints only) is already the core defense. Additionally:
  (a) keep the prominent "not affiliated" disclaimer on every page + OG image
  free of character art; (b) never run *paid ads* that bid on the "Pokémon"
  trademark; (c) keep merch designs to original layouts (crest/roster/ID/banner),
  never silhouettes or sprites of specific characters on sellable goods;
  (d) have a takedown-response plan — if a C&D arrives, comply fast on the
  specific item, keep the tool. The tool itself (analysis of publicly known game
  data) is the most defensible part; merch is the exposed flank — keep it clean.
- ⚠️ **Highest-risk surface = AI Studio + merch.** If AI outputs resemble
  specific copyrighted characters and get printed, that's the worst-case combo.
  Mitigate: AI Studio is "trainer-style portrait of the user," personal-license,
  and AI outputs are NOT offered as default merch designs.

**R2 — Platform bans (Reddit especially).** A premature self-promo post can get
the domain shadow-banned across subreddits.
- *Mitigations:* the 2-week karma warmup, free-tool framing, zero merch mention
  in posts, reply to everything, post in designated self-promo threads where
  required, never cross-post the same text to multiple subs same day. If a sub
  removes a post, don't repost — DM mods politely and move on.

**R3 — Virality fails to ignite (most likely failure mode).**
- *Causes:* posters not getting shared (no watermark/share-sheet), cold TikTok
  account, weak link unfurls.
- *Mitigations:* watermark + `navigator.share` + OG-image-with-score shipped in
  Week 0; 3–4 week TikTok warmup; if share rate < 15% by week 6, the product
  must change before more marketing. Treat low share rate as a product bug.

**R4 — Worlds timing whiff.** Banking on one event is fragile.
- *Mitigations:* the SEO content engine is event-independent and compounds for
  months; the TikTok engine runs continuously. Worlds is an accelerant, not the
  whole plan. If Worlds underperforms, the evergreen channels still carry.

**R5 — Solo-founder bandwidth.** CEO with a day job can't do daily TikTok +
Reddit + PH + HN + SEO simultaneously.
- *Mitigations:* batch-record TikTok content (10 clips in one sitting, drip
  daily via scheduler); pre-write all Reddit/PH/HN copy in Weeks 7–8; the SEO
  pages are weekend batches. Protect launch-week (Aug 11–31) calendar hard —
  that's the only stretch requiring daily live presence.

**R6 — fal.ai / Printful / Stripe dependency.** Third-party outage during the
spike.
- *Mitigations:* the bundle works fully offline without any of them (core value
  intact); Printful has the URL-deeplink fallback; AI Studio failures degrade
  gracefully to the 12 canvas poster styles, which need no third party.

---

## Bottom line

Lead with the **poster generator and AI Studio as the viral engine** (owned
TikTok/Reels, daily, starting now), use **r/stunfisk → r/pokemon → PH → HN** as
timed spikes laddering into **Worlds week (SF, Aug 28–30)**, and let a
**compounding SEO content layer** carry the long tail. Monetize on the back end
(merch primary, Premium secondary) exactly per the existing playbook — never in
the acquisition message. The bright line is honored everywhere: no "Pokémon" in
any name slot, no character art on merch, AI/merch kept on the defensible side
of fair use. The single number that decides success is **share rate** — protect
the watermark + share-sheet + OG-unfurl loops above all else.
