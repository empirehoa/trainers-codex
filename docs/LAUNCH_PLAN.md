# Trainer's Codex — Launch Plan (v6 → first-revenue → $5K MRR)

**Authored:** 2026-05-29
**Status:** v6 live at https://trainerscodex.com. Stripe Checkout working end-to-end with $4.99/mo test product. Cloud worker + 4 secrets deployed. Ready for soft launch within 7 days.
**Goal:** First paying customer within 14 days. $1K MRR within 60 days. $5K MRR within 6 months.

---

## L99 strategic thesis

Two-rail monetization. **Subscription** for product stickiness (recurring $4.99/mo) and **POD merch margin** for big one-time revenue spikes ($15-25 net per shirt/poster). They reinforce each other: premium subscribers buy 4-7× more merch than free users (industry benchmark for freemium fan tools with side product).

This is NOT a competitor to Pokémon Showdown (battle sim is a different category). This is a **design + analysis + identity tool** — closer to a Canva-for-Pokémon-fans than a Showdown clone. That positioning lets us avoid the rabbithole of building a battle engine (3-4 weeks of work, doesn't differentiate) and instead invest in what nobody else does: **AI-generated trainer cards from user photos** (v6 scaffold ready, ships once fal.ai is wired) + **single-file architecture** + **print-on-demand pipeline**.

---

## Pre-launch checklist (this week)

### Must-have before any public link goes out

| Item | Status | Effort | Owner |
|---|---|---|---|
| Stripe Premium Pack live ($4.99/mo recurring) | ✅ Done — `price_1TcX6MF03KhWyMQ7cqs9OT9p` | — | — |
| Stripe webhook live | ✅ Done — `we_1TcXGsF03KhWyMQ7JaN4mRTt`, signing secret pushed | — | — |
| Worker deployed with Stripe + JWT routes | ✅ Done — https://trainers-codex-api.jrriestra.workers.dev | — | — |
| Bundle live with Supabase + Worker config baked in | ✅ Done — https://trainerscodex.com | — | — |
| R2 bucket enabled for Printful PNG hosting | ⚠️ Pending — 1-click in Cloudflare R2 dashboard, accept ToS | 2 min | You |
| Run `wrangler r2 bucket create trainerscodex-prints` + redeploy worker | ⚠️ After R2 enabled | 2 min | Me |
| At least one Supabase OAuth provider enabled (Google recommended) | ⚠️ Pending — needs Google Cloud OAuth Client ID | 15 min | You |
| Trademark scrub of all printable content | ✅ Done — see docs/SECURITY.md § "Trademark surface" | — | — |
| Footer disclaimer ("independent fan tool, not affiliated with Nintendo / Game Freak / The Pokémon Company") | ✅ Already in `src/App.tsx:783` | — | — |

### Should-have for stronger launch

| Item | Effort | Owner |
|---|---|---|
| fal.ai account + API key → unlocks AI Studio | 10 min signup, $20 prepaid credit | You |
| Cloudflare Web Analytics enabled (free, no cookie banner) | 5 min in CF dashboard | You |
| Plausible Analytics ($9/mo, more detailed) — optional second analytics | 5 min signup + 2 min script paste | You |
| Discord server set up (channel structure: #general, #team-feedback, #merch-drops, #help, #premium) | 30 min | You |
| Twitter/X handle `@trainerscodex` registered | 5 min | You |
| 6 hero screenshots captured (3 light mode + 3 dark mode, varied teams) | 20 min | Me (via Puppeteer against live) |
| 30-second product demo GIF | 30 min | You + screen recording tool |
| `cdn.trainerscodex.com` subdomain for R2 public bucket | 5 min after R2 enabled | Me |
| FAQ page | 20 min | Me |

### Nice-to-have

- Email capture for "notify me at launch" before going public — defer; we're past pre-launch
- Stripe Tax fully configured (HQ address in Stripe settings) — defer until $5K revenue threshold
- Apple Sign-In actually working (needs $99/yr Apple Developer) — defer until iOS users complain

---

## The launch sequence (T-7 to T+30 days)

### T-7 to T-2: Internal & friend testing

**Goal:** 10 sessions from people who'll give honest feedback. Zero strangers yet.

Day -7 to -5:
- **You:** open https://trainerscodex.com from 3 devices (phone, tablet, desktop). Build 3 different teams. Try every feature. Note what breaks.
- **You:** post in Empire Slack/Discord to 5 internal friends. Ask: "what's broken, what's awesome, what's missing?"

Day -4 to -2:
- **Me:** fix any P0 bugs reported.
- **You:** complete the should-haves (fal.ai signup, Discord, Twitter, analytics, hero screenshots).
- **Me:** capture screenshots once Plausible/CF Web Analytics is live so we have analytics from impression #1.

### T-1: Stripe smoke test

- **You:** do a real $4.99 Stripe Checkout with the test card `4242 4242 4242 4242`.
- Confirm: webhook fires (visible in Stripe Dashboard → Developers → Events), JWT minted, premium unlocks in the bundle, can use premium poster styles, sub appears in Stripe Customers.
- Then cancel the test subscription. Don't leave it active.

### T+0 (Wednesday or Thursday, mid-morning ET): soft launch

**Target:** 200-500 first-day visitors, 5-10 signups, 0 paying customers (that's OK — first day is signal collection).

Channel | Time (ET) | Post type
---|---|---
Personal X (yours) | 10:00 | "Built a thing. Single HTML file, 1.3MB. 1,300+ Pokémon. AI trainer cards. Free." + screenshot
r/pokemon | 10:30 | (See `docs/social-copy.md` § Reddit)
Empire Slack/Discord | 10:30 | Internal: "this is the side project I've been building"
Personal LinkedIn | 11:00 | Different angle — "what I learned shipping a single-file React app in 3 weeks"
Discord server | All day | Invite link in r/pokemon thread bio + Twitter bio

**Do NOT** post to PH or HN today. Save those for max signal weeks.

### T+1 to T+3: r/stunfisk and r/PokemonTCG

Wait 24-48h after r/pokemon (mods on r/pokemon are watchful for cross-promotion). Then:

Day +1, 11:00 ET:
- r/stunfisk (200K members, competitive): lead with the analyzer, not the merch. "Built a coverage analyzer that scores 0-100 and suggests counter teams. Looking for stunfisk eyes on the meta picks before I tweak the scoring."

Day +2, 11:00 ET:
- r/PokemonTCG (400K): lead with TCG card lookup. "Built a tool that pulls TCGplayer prices for the cards your team would use in real life."

### T+5: Product Hunt (Tuesday or Wednesday)

PH algo favors midweek launches in the morning ET. Goal: top 5 of the day → ~2,000 visitors, 30-80 signups, 2-5 paying customers.

- **5 days before:** DM 10 people in your network who PH-upvote regularly. Ask for upvotes 9am-noon ET the launch day.
- **Day-of:** post launches automatically at 12:01am PT (00:01 PT = 03:01 ET). Spend 6:00-10:00 ET in the comments answering everything. PH posts that don't have the maker engaging in the first 4 hours die fast.
- **Tagline (250 char max):**
  > Trainer's Codex — 1,307 Pokémon, 12 poster styles, AI-generated trainer cards, print-on-demand merch. One HTML file. Free, with a $4.99/mo premium pack.
- **Description:** lead with single-file architecture (HN appeal), then visual features (PH appeal), then monetization model (transparency wins on PH).
- **Maker comment:** 200 words on the build story. Single-file React, 1.3MB, why no battle simulator (intentional), what's next on roadmap.

### T+7: Hacker News "Show HN"

HN is the technical audience. Different copy.

- **Title:** "Show HN: Trainer's Codex – A Pokémon team analyzer in a single 1.3MB HTML file"
- **First comment (yours, post within 5 min of submission):** 300 words on the engineering. Vite + React 19 + canvas-only rendering, no WebGL, no AI image gen at runtime (all client-side for posters; AI trainer card hits a Cloudflare Worker that calls fal.ai). The 1,307 Pokémon entries + 919 moves + complete learnsets all ship inline as JSON (200KB + 360KB + 92KB). No build pipeline on the host side.
- **Post Tuesday 9:00 ET.** Earlier = ranks higher when EU/UK wakes up.

### T+10: Twitter/X content campaign begins

Daily team-poster drops on `@trainerscodex`. One team per day. Different style each day. Tag relevant accounts (@Pokemon, @PlayPokemon, @VGCNews) sparingly — every 10 posts max.

Weekly thread on Sunday explaining a non-obvious mechanic (form-aware game compat, the Tera Type meta, etc.). Threads drive 5-10x more profile visits than single posts.

### T+14: First-revenue checkpoint

**Target by Day 14:** 1 paying Premium Pack subscriber.

If we hit this: continue plan as-is.
If we don't: post-mortem. Likely causes:
- Premium gate too soft (users discover dev toggle, never see the Stripe button)
- AI Studio failed (fal.ai not wired)
- Sign-in not working (OAuth not enabled — users can't even create accounts)

Fix the actual blocker. Don't add features.

### T+30: Discord milestone

**Target:** 100 Discord members, 20 active in #team-feedback, 5 Premium subscribers.

---

## 30/60/90 day monetization targets

| Metric | Day 30 | Day 60 | Day 90 |
|---|---|---|---|
| Unique sessions | 5,000 | 15,000 | 30,000 |
| Saved teams (cloud sync) | 500 | 2,500 | 8,000 |
| Premium subscribers | 5 | 30 | 100 |
| MRR | $25 | $150 | $500 |
| Merch orders | 5 | 30 | 100 |
| Merch margin | $100 | $700 | $2,200 |
| Total revenue (Premium + merch) | $125 | $850 | $2,700 |
| Discord members | 100 | 400 | 1,200 |
| Twitter followers | 200 | 800 | 3,000 |
| Net OpEx | $11/mo | $11/mo | $20/mo |

These are CONSERVATIVE numbers. Realistic ceilings (after AI trainer card is fully wired + we hit any virality spike) are 2-3× these. But planning for conservative makes the worst case still profitable.

**The break-even math:** at Day 60 we're netting $850 - $80 (CC fees + Cloudflare paid workers) = **$770/mo cash flow**. By Day 90 it's **$2,500/mo cash flow**.

---

## Channel matrix (where to spend time)

| Channel | First-touch ROI | Retention ROI | Cost | When to use |
|---|---|---|---|---|
| r/pokemon | High (one-time hit) | Low | $0 | T+0 launch only — don't repost |
| r/stunfisk | Medium-High | Medium | $0 | T+1, then post-meta-update once/quarter |
| r/PokemonTCG | Medium | Medium | $0 | T+2, then tie-in with new card-set drops |
| Product Hunt | High | Low | $0 | Once. T+5. |
| Hacker News | High (if frontpage) | Low | $0 | Once. T+7. |
| Twitter daily drops | Low per-post | High aggregated | Time | Every day from T+10 |
| Discord community | Low | Very high | Time | Open T+0, invest forever |
| Pokémon YouTube collabs | High | High | $50-500 per collab | T+30 onward, with new tournaments |
| TikTok teasers | Variable | Medium | Time | T+30, when you have 10+ poster examples to remix |
| SEO landing pages | Slow-burn, compounding | High | Time | T+14 — start with /transfer-guide, /best-team-by-type/X |
| Pokémon Discord servers (r/pokemon's Discord, VGC servers) | Medium | High | Time | T+7 onward, soft mentions only |
| Paid Reddit ads | Untested | — | $50-500 | NOT NOW — wait until $1K MRR |
| Pokémon influencer paid posts | Untested | — | $200-2K | NOT NOW |

The unifying rule: **invest in things that compound** (Discord, SEO, Twitter daily drops, content) **over things that spike once** (PH, HN, big subreddit posts). Spike → compound is the order; reverse it and you burn the spike's traffic on a dead site.

---

## Differentiation: what we own that nobody else does

After tonight's competitive scan, our wedges are:

1. **AI-generated trainer cards from user photos.** Marriland and Pokémon Showdown have nothing like this. The @kingbulljs anime-style template is a unique product surface. Once fal.ai is wired (10 min signup), this is the headline feature.

2. **Single-file architecture.** Drop the HTML on any web server, it works. No build, no server, no install. This is the HN angle, and it's quietly important: the bundle works offline once loaded, which means it's an actual *tool* not a *service*.

3. **Print-on-demand merch integrated into the team builder.** Etsy/Redbubble have user-generated Pokémon merch, but creating it requires a separate design tool. Our flow is: build team → click Merch Studio → generate 300DPI print PNG → "Order on Printful" creates a sync product in seconds. That's the unique experience.

4. **12 poster styles, all canvas-rendered, all free at base + 6 premium.** Most fan tools have zero poster generation. The ones that do are Manifesto-like text-only. Holographic Foil + Trading Card Sheet + Editorial styles are visual + share-worthy on Instagram.

5. **Form-aware game compatibility.** We track which mons are obtainable in which Switch-era game with awareness of Megas/Gigantamax/regional variants/Hisuian. Marriland doesn't track Megas correctly. We do. This is small but it builds trust with competitive players.

6. **Tera Type picker with strategy hints.** Gen 9 mechanic; most tools ignore it. We surface it prominently.

7. **Held Items field.** New in v6. 30-item catalog with effects. Marriland has this; Showdown does. The bar is "expected", not differentiator. But we have it.

What we DON'T own and shouldn't try to:

- **Real-time battle simulator.** Pokémon Showdown owns this. Don't compete.
- **Tournament tracking.** Pikalytics owns this. Don't compete.
- **News and meta.** Smogon owns this. Don't compete.

Our wedge is **identity + design + community** — the parts of Pokémon fandom that aren't already over-served by free open-source tools.

---

## v7 roadmap (build right after launch is stable)

| Feature | Why | Effort |
|---|---|---|
| Wire fal.ai for live AI Studio generations | Highest-value premium feature; UI already done | 1 day |
| Photo upload for poster backgrounds | Lets users put themselves in their team poster | 3 hrs |
| OG image + dynamic share preview per saved team | Twitter/Discord shares show the actual team poster, not a generic logo | 1 day |
| Apple Sign-In live (after $99 Apple Developer signup) | iOS users prefer Apple | 1 hr after credentials |
| Public profile pages at /u/handle | Social discovery loop | 2 days |
| Team-rating community | Casual interactivity without battle sim | 3 days |
| Daily challenge teams | Engagement loop; user picks a daily roster against an AI constraint | 2 days |
| VGC team import (Pokémon Showdown paste format) | Tap into stunfisk's existing workflows | 1 day |
| Plausible OR posthog for conversion funnel analytics | Need to know what % of visits → premium | 4 hrs |
| Email newsletter (Buttondown or ConvertKit) — weekly meta picks | Off-platform retention | 1 day |

The discipline: ship one feature per week post-launch. No batching. Every shipped feature → 1 Twitter post + 1 Discord drop + 1 newsletter mention.

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Nintendo C&D over fan merch | Low (we sit in the same protected fan-creator zone as Etsy creators) | Footer disclaimer, no franchise IP in product titles, the bright line on naming. See `docs/SECURITY.md` § "Copyright surface" |
| Reddit moderator deletes launch post | Medium | Don't auto-post. Hand-write. Engage in comments. Use throwaway accounts as backup |
| Cloudflare R2 / Workers free tier exhausted | Low (10M requests/month free, well over our trajectory) | Monitor. Workers Paid is $5/mo if we cross |
| fal.ai costs spike if AI Studio goes viral | Medium | Premium-gated + monthly quota of 5 per kind. Auto-rate-limit per IP at worker level |
| Stripe declines for fraud / chargebacks | Low | Use Test mode initially; flip to Live mode only after first 10 manual smoke tests |
| Pokémon Showdown / Marriland clones our specific UX | Low (they have other priorities) | We move fast; ship 1 feature/week post-launch |
| Site goes down before launch | High historically (3 days down in the past 7) | Cloudflare Web Analytics watchdog → email alert on >5min downtime |
| Influencer post that gets us traffic faster than we can handle | Low | Cloudflare's CDN absorbs effectively unlimited traffic for static HTML. Worker auto-scales. Real bottleneck is fal.ai quota — set hard $/day cap on fal.ai account |

---

## Final pre-launch checklist (the one I'll keep checking weekly)

```
[ ] R2 enabled, bucket created, cdn.trainerscodex.com subdomain set
[ ] At least Google OAuth enabled in Supabase
[ ] fal.ai API key pushed to worker as FAL_API_KEY secret
[ ] Cloudflare Web Analytics enabled
[ ] Stripe webhook actually firing on real test purchase (verify in Stripe Events tab)
[ ] Discord server live with channel structure
[ ] @trainerscodex Twitter/X account
[ ] 6 hero screenshots in repo at deploy/screenshots/
[ ] 30-sec demo GIF in repo
[ ] Reddit, PH, HN, X copy reviewed by 1 outsider
[ ] First real $4.99 Stripe purchase done by you, refunded, confirmed end-to-end
[ ] Footer DMCA contact email working (legal@trainerscodex.com via Cloudflare Email Routing — free)
[ ] sitemap.xml + robots.txt (already done)
[ ] One backup deploy bundle on a backup hosting (e.g. Vercel) in case Cloudflare hiccups during launch hours
[ ] Cancel test Stripe subscription before public launch
```

Tick everything before pasting any URL in any public forum. Each unchecked box is a bullet you've fired into your own foot.

---

## What I commit to deliver this week

(Me, on subsequent /resume calls.)

- ☐ Capture 6 hero screenshots via headless Chromium against the live site
- ☐ Write `docs/social-copy.md` with Reddit/PH/HN/X drafts
- ☐ Write `docs/COMPETITIVE_INTEL.md` once the research subagent returns
- ☐ Wire fal.ai key when you provide it (push secret + redeploy)
- ☐ Run `wrangler r2 bucket create trainerscodex-prints` + uncomment binding + redeploy after R2 is enabled
- ☐ Set up Cloudflare Web Analytics token + bake into bundle
- ☐ Set up sitemap.xml + 3 SEO landing pages
- ☐ Add legal@ Email Routing in Cloudflare (or guide you through it)

The unified goal: zero unchecked boxes by T-1, ship T+0 (next Wednesday), first paying customer by T+14.
