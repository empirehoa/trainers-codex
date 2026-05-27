# Trainer's Codex — Monetization Playbook v3

**Last updated:** 2026-05-27 (v3 — adds merch math + Printful API + Stripe Worker)
**Author:** Jose / Claude Code
**Status:** ready for launch

---

## The thesis

The single-file bundle is the product. The print-on-demand merch is the
moat. The $4.99/mo Premium Pack is the convenience layer.

Three revenue streams, three different elasticities:

1. **Merch margin** — high price ($24.99 tee), discrete unit, impulse
   purchase. The trainer just designed the perfect team — selling them
   a shirt of that team is the natural finish.
2. **Premium Pack subscription** — low price ($4.99/mo), recurring, low
   churn (it's a fan tool — paying users are deeply invested).
3. **Future affiliate / referral** — TCGplayer + Cardmarket links for
   cards mentioned in the in-app TCG lookup. Negligible at launch, modest
   at scale.

The Premium Pack break-even versus a single Bella+Canvas tee:

```
$13.50 margin per tee  ÷  $4.99/mo Premium  =  2.7 months of subscription
```

So **buying a tee = 3 months of Premium** in margin terms. Buying both is
the goal. Premium customers are 4-7x more likely to buy merch (industry
benchmark for freemium SaaS with side product). The site is designed to
maximize this cross-sell.

---

## Merch math — the full unit economics

### Per-product margin at 100% markup (the default "pro" tier)

| Product | Base cost | Retail | Stripe fee | Net margin | Margin % |
|---|---|---|---|---|---|
| Bella+Canvas Unisex Tee | $8.95 | $24.99 | $1.03 | **$15.01** | 60% |
| Gildan Heavy Cotton Tee | $6.50 | $19.99 | $0.88 | **$12.61** | 63% |
| Gildan Heavy Blend Hoodie | $22.50 | $49.99 | $1.75 | **$25.74** | 51% |
| Gildan Crewneck Sweatshirt | $18.50 | $42.99 | $1.55 | **$22.94** | 53% |
| 11oz Ceramic Mug | $4.50 | $14.99 | $0.74 | **$9.75** | 65% |
| Gaming Mouse Pad (small) | $7.95 | $21.99 | $0.94 | **$13.10** | 60% |
| XL Desk Mat 36"×16" | $18.00 | $44.99 | $1.60 | **$25.39** | 56% |
| 4" Die-Cut Sticker | $1.50 | $5.99 | $0.47 | **$4.02** | 67% |
| Poster 11"×14" | $4.50 | $18.99 | $0.85 | **$13.64** | 72% |
| Poster 18"×24" | $11.95 | $34.99 | $1.31 | **$21.73** | 62% |
| Canvas Tote Bag | $12.50 | $27.99 | $1.11 | **$14.38** | 51% |
| Phone Case (iPhone) | $11.95 | $29.99 | $1.17 | **$16.87** | 56% |

Stripe fee assumed at 2.9% + $0.30 (US domestic). International cards add
~1.5%; that's absorbed in margin since we keep retail USD-only at launch.

### Implied AOV by mix

If buyers self-select with the catalog presentation order:

- **Front of funnel (highest impressions):** tees ($24.99) and posters ($18.99)
- **High-margin upsell:** hoodies ($49.99), desk mats ($44.99), 18×24 posters
- **Impulse adds:** stickers ($5.99), mugs ($14.99)

Realistic basket modeling at 1k orders/month assuming 60% tee/poster, 25%
hoodie/desk-mat, 15% impulse adds:

```
600 orders × $22 avg margin   = $13,200
250 orders × $24 avg margin   = $6,000
150 orders × $7  avg margin   = $1,050
                              ────────
                                $20,250/mo gross margin from merch
```

This is the **upper bound** — assumes 1k orders/mo. Realistic launch trajectory:

| Month | Orders | Margin |
|---|---|---|
| 1 (launch) | 20-50 | $400-1,000 |
| 3 | 80-150 | $1,800-3,300 |
| 6 | 200-400 | $4,400-8,800 |
| 12 | 500-1,000 | $11,000-22,000 |

Assumes 1.5% sustained conversion on 10k WAU by month 6, growing to 20-30k WAU
by month 12.

---

## Premium Pack — the recurring layer

### Price: $4.99/mo or $39/year (35% discount, 8 months free vs monthly)

Rationale:
- **$4.99** is the psychological price band for "cheaper than a booster pack"
  — fan tools at this price get bought on impulse, not budget review.
- **Monthly cadence** because a Pokémon fan project has high churn risk
  (post-purchase honeymoon ends in 2-3 months). Monthly billing lets users
  pause without a refund headache.
- **Annual at 35% off** captures the committed users at lower CAC payback.

### What's unlocked

| Gate | Free | Premium |
|---|---|---|
| Pokémon entries browsable | 1,307 (all) | 1,307 (all) |
| Team analysis | full | full |
| Sign-in + cloud sync | yes | yes |
| Poster styles | 6 of 12 | 12 of 12 |
| Merch designs | 2 of 4 | 4 of 4 |
| 3D HOME sprites | no | yes |
| Custom palette overrides | no | yes |
| Future: team A/B compare | — | yes |
| Future: TCG deck builder | — | yes |
| Future: tournament team importer | — | yes |

### Conversion targets

Industry benchmarks for freemium fan tools:
- 1-3% of MAU → paid (Wikia / Curse-style)
- 5-12% of high-engagement users → paid (PokeBattler, Marriland-style sites)

Realistic conversion: **2% of WAU**. At 10k WAU = 200 subscribers = **$998 MRR**.
At 30k WAU = 600 subscribers = **$2,994 MRR**.

### Churn

Expected gross monthly churn for a $4.99/mo fan tool:
- Month 1: 30% (impulse-buyer remorse, decided they don't actually use it)
- Month 2-3: 15% (rotates out as their team is "done")
- Month 6+: 5% (steady-state engaged users)

To minimize churn:
- **Drop new poster styles quarterly** (gives existing subscribers something
  new each season — keeps the "what am I paying for" feeling at bay)
- **Tournament-team importer in v6** (sticky utility for the competitive
  segment)
- **Discord community for premium subscribers** (sunk-cost belonging)

---

## Combined revenue model

### Month 6 projection (10k WAU)

| Stream | Monthly | Annualized |
|---|---|---|
| Merch margin (150 orders × $22 avg) | $3,300 | $39,600 |
| Premium Pack (200 subs × $4.99) | $998 | $11,976 |
| **Total recurring + transactional** | **$4,298** | **$51,576** |

### Month 12 stretch (30k WAU)

| Stream | Monthly | Annualized |
|---|---|---|
| Merch margin (700 orders × $22 avg) | $15,400 | $184,800 |
| Premium Pack (600 subs × $4.99) | $2,994 | $35,928 |
| Affiliate (TCGplayer, est. 0.5% of WAU click + 8% commission) | $180 | $2,160 |
| **Total** | **$18,574** | **$222,888** |

### Costs at month 12 (30k WAU)

- Domain: $22/yr
- Cloudflare Pages: $0 (free)
- Cloudflare Workers: ~$5/mo (10M requests)
- Supabase: $25/mo (Pro, once past 50k MAU)
- Plausible: $19/mo (50k MAU tier)
- Printful: pass-through (already netted out of margin)
- Stripe: 2.9% + $0.30 (already netted out)

**Net OpEx: ~$50/mo at 30k WAU.** Profit margin is essentially 100% of the
margin numbers above.

---

## The cross-sell architecture

Why merch + sub work together better than either alone:

```
Free user → builds team → loves it → sees "Order on Printful" CTA on team bar
       ↓
   Buys $24.99 tee · $15 margin (one-time)
       ↓
   Returns 2 weeks later · sees new team design · same flow
       ↓
   Hits a premium-locked poster style · "$4.99/mo to unlock"
       ↓
   Subscribes · $5/mo (recurring · 6 month lifetime = $30)
       ↓
   Premium subscribers see locked merch designs (Trainer ID, Gym Banner)
       ↓
   Buys ID Card hoodie · $49.99 · $26 margin
```

The premium gate **isn't** the revenue ceiling — it's the *commitment* layer.
Premium subscribers are 4-7x more likely to come back, design more teams,
and buy more merch than free users.

---

## Stripe integration — production architecture

Implemented in `worker/src/stripe.ts`. See `docs/DEPLOYMENT.md` § Phase 5-6
for the full setup.

### Flow

```
User clicks "Get Premium · $4.99/mo" in the Studio dialog
    ↓
Browser POSTs /stripe/checkout to the Worker
    ↓
Worker creates a Stripe Checkout Session for the configured Price ID
    ↓
Browser redirects to checkout.stripe.com
    ↓
User pays
    ↓
Stripe redirects back to ?session_id=cs_xxx&checkout=success
    ↓
Browser POSTs /stripe/verify to the Worker
    ↓
Worker fetches the session, confirms paid, mints HS256 JWT
    ↓
Browser stores JWT in localStorage as trainerscodex.license
    ↓
App.tsx detects the license on next render → setPremium(true)
    ↓
Toast: "premium unlocked · welcome to the pack"
```

Parallel webhook path: Stripe fires `checkout.session.completed` to the
Worker for telemetry + cancellation handling. License JWT TTL is 31 days
(matches monthly subscription billing).

### Why a 31-day JWT instead of a longer one?

- Users who cancel mid-month keep access until the subscription period ends —
  Stripe's prorated-cancel handles this server-side, the JWT mirrors it
  client-side by expiring at the period end.
- A 1-year JWT would mean a cancelled user retains premium for 365 days
  client-side — bad UX for the business, indistinguishable from free for
  the user.
- The Worker can extend the JWT on every successful invoice via the webhook
  path (future enhancement — currently the user re-buys premium each month;
  for subscription this is automatic via Stripe Checkout's recurring mode).

### Test cards

- `4242 4242 4242 4242` — success
- `4000 0000 0000 0002` — generic decline
- `4000 0025 0000 3155` — requires 3DS authentication
- `4100 0000 0000 0019` — fraud / rejected

All other Stripe test cards documented at
https://docs.stripe.com/testing#cards.

---

## Printful integration — production architecture

Implemented in `worker/src/printful.ts`. See `docs/DEPLOYMENT.md` § Phase 8
for the full setup.

### Flow

```
User finishes designing team T-shirt in Merch Studio
    ↓
Click "Order on Printful"
    ↓
Browser generates 3600×4800 print PNG at 300 DPI
    ↓
Browser POSTs multipart to /printful/order on the Worker (PNG + metadata)
    ↓
Worker uploads PNG to R2 bucket → public URL at cdn.trainerscodex.com/prints/<uuid>.png
    ↓
Worker POSTs to api.printful.com/files (registers the file)
    ↓
Worker POSTs to api.printful.com/sync/products with file ID + variant ID + retail price
    ↓
Printful creates a sync product in Jose's store, returns dashboard URL
    ↓
Browser opens that URL in a new tab
    ↓
Jose can review/share the product page; customers buy from the linked storefront
```

### Fallback flow (Worker not deployed yet)

The Merch Studio retains its original URL-deeplink fallback: clicking "Order"
downloads the PNG locally and opens Printful's public product page with the
`design_url` query param. The user drags the downloaded PNG onto the design
uploader. Less smooth, but functional.

### Sales channel options

- **Manual order platform (default):** Jose copies the product details into
  Etsy/Shopify/wherever he sells. No monthly cost; some manual work per order.
- **Shopify connection ($29/mo):** Printful auto-syncs products as Shopify
  listings. Customer buys via Shopify; Printful fulfills. Highest leverage,
  $29/mo overhead.
- **Etsy connection ($0.20/listing):** Same as Shopify but Etsy. Lower fixed
  cost, lower CRO than Shopify.

Recommended progression: start manual → after 50+ orders/mo move to Shopify.

---

## Launch funnel (the first 30 days)

### Day 0 — Build & deploy

- ✓ Deploy bundle to https://trainerscodex.com
- ✓ Test Stripe Checkout (live mode) with a real $4.99 transaction
- ✓ Test Printful order end-to-end on Bella+Canvas tee
- ✓ Capture 6 hero screenshots (different teams, different styles)
- ✓ Set up Plausible Analytics

### Day 1 — Soft launch to network

- Post to your Empire Management Group team Slack/Discord (small)
- Tweet from your personal account if you have one
- Share with 5-10 friends who play Pokémon — get them on the bundle, ask
  for "1 thing that's broken, 1 thing you love"
- Goal: **10 first sessions, 0 critical bugs**

### Day 2-4 — Pokemon subreddit drops

**r/pokemon** (3.4M members):
- Title: "I built a team analyzer + poster generator that fits in one HTML file"
- Body: 1-paragraph intro, link, 2 screenshots, "feedback welcome"
- Reply to every top-level comment within 12 hours
- Expected: 500-2000 first-day visitors, 5-15 Premium signups, 2-8 merch sales

**r/stunfisk** (200K, competitive):
- Lead with the team-coverage analyzer — that's the competitive hook
- Title: "Live coverage scoring + counter-team builder for any 6-mon team"
- Expected: 200-500 visitors, higher conversion (these users are engaged)

**r/PokemonTCG** (400K):
- Lead with the TCG card lookup feature
- Title: "Built a tool that pulls TCGplayer prices for the cards your team uses"
- Expected: 100-300 visitors, lower merch conversion but better card affiliate clicks

### Day 5-7 — Product Hunt

- Submit Tuesday or Wednesday (highest traffic days, lowest competition vs
  Monday/Thursday)
- 250-character tagline: "1,307 Pokémon, 12 poster styles, 12 merch products,
  one HTML file."
- 5 screenshots (poster styles + merch mockups + team analysis)
- 2-minute video walking through team-build → coverage analysis → poster →
  merch order
- DM 10 makers in your network the night before; ask for upvotes within
  the first 2 hours of the day to hit the homepage
- Expected: top 5 of the day = ~2,000 visitors, 30-80 signups, ~$200-500 in
  immediate merch + premium sales

### Day 7-10 — Hacker News

- Title: "Show HN: Trainer's Codex — Pokémon team analyzer in a single HTML file"
- The single-file pitch is the hook — HN loves "this is the whole product, no
  build, no install" framing
- Post Tuesday 9am ET (peak traffic, peak engagement)
- Lead with technical: "1.21 MB gzipped to 311 KB, no service worker, ships
  via drag-drop to Cloudflare Pages"
- Expected: 200-2,000 visitors based on whether it hits front page; the HN
  audience converts low on merch but high on Premium

### Day 14 — Twitter/X content campaign

- Pin the launch tweet from your personal account
- Daily team-poster drops on @trainerscodex (build a new team, post the
  poster + analysis screenshot)
- 1 thread per week explaining a non-obvious mechanic (form-aware game
  compat, the Tera Type meta, etc.)
- Expected: 50-200 new visitors/day, slow burn

### Day 21 — Discord community

- Set up r/pokemon-adjacent Discord server: trainers-codex.gg
- Premium subscribers get a `@trainer` role with a private #team-feedback channel
- Free users get a #general channel
- Daily standup-style "post your team" prompt
- This is the retention lever — without it premium subscribers churn at 30%/mo

### Day 30 — Retrospective

Numbers to hit by end of month 1:
- 20,000+ pageviews
- 5,000+ unique sessions
- 50+ Premium subscribers ($250+ MRR locked in)
- 20+ merch orders ($300+ in margin)
- Discord at 200+ members

If any of these miss by >50%, the funnel needs surgery before scaling
acquisition further.

---

## Affiliate revenue — the slow but compounding tail

Not a launch priority. Add in month 2-3.

### TCGplayer affiliate program

- Apply at https://www.tcgplayer.com/affiliate/
- ~8% commission on purchases via your link, 14-day cookie
- Already linking out from the TCG dialog — adding the affiliate tag is 1 line
- Realistic: 0.5% of WAU clicks through, 8% of those buy something at $30 AOV
  → at 10k WAU = 50 clicks/mo × 8% × $30 × 8% = **~$10/mo**
  → at 30k WAU = **~$30/mo**

### Cardmarket affiliate (EU)

- Apply at https://www.cardmarket.com/en/Magic/Help/AffiliateProgram
- ~5% commission, 30-day cookie
- Adds a few more percent to the international traffic conversion

Combined affiliate ceiling: **~$50-100/mo at 30k WAU**. Worth flipping on but
not worth optimizing.

---

## Non-monetization pages to add

These don't directly print money but compound discoverability:

1. **trainerscodex.com/transfer-guide** — landing page explaining how to move
   teams between mainline games via HOME. Long-tail SEO target: "how to
   transfer pokemon legends arceus to scarlet violet" (15k searches/mo).
2. **trainerscodex.com/best-team-by-type** — 18 pages, one per type, each
   showing a "best team in this type" with the codex's analysis. Long-tail
   SEO target: "best electric team competitive scarlet violet".
3. **trainerscodex.com/tera-type-strategy** — 18 pages explaining each Tera
   Type's strategic use. High-engagement competitive content.

These are written as static HTML pages, sit alongside `index.html` on
Cloudflare Pages, share the bundle's CSS (extracted into a separate file
loaded by all of them), each ends with a CTA to "build a team like this".

Effort: ~2 hours per page, batch over a weekend. Compounds to ~20k organic
visits/month after 6 months of indexing.

---

## What we are NOT doing

- ❌ Loot boxes, gacha mechanics, "buy 100 coins for $0.99"
- ❌ Selling merch with copyrighted character names in product titles
- ❌ Hosting tournaments with cash prizes (gambling regs)
- ❌ A "Pokémon Codex" rebrand (legal bright line is sacred)
- ❌ Mobile app at launch (PWA wrap in v6 after web revenue proves out)
- ❌ Discord/Reddit bot integrations at launch (deferred to v6)
- ❌ Paid acquisition (Reddit ads, Twitter ads) — organic-only at launch
  until we have a baseline conversion rate to bid against

---

## Open questions for v3 → v4 update

To revisit at month 3:

- Is the Premium Pack pricing right? ($4.99 vs $9.99 vs $4.99 yearly $39?)
- Is the merch product mix right? (Should phone cases be removed if they
  underperform? Should we add stickers in multi-packs?)
- Is the URL-deeplink Printful fallback worth maintaining alongside the API
  path, or is it pure operational complexity?
- Should we add a "trainer card" NFT-style digital collectible at $0.99
  one-time? (Probably no — adds compliance overhead, low ARPU.)
- Should we open a Patreon as a third tier for the highest-engagement users?
  ($25-50/mo for early access to new styles, behind-the-scenes development
  updates) — defer to month 6 if Premium Pack churn confirms a power-user
  segment.

---

## Bottom line

This is a side project monetized via aligned-incentive freemium. The free
tool is good enough that fans will share it; the merch and sub layers
convert the ones who get emotionally attached. Zero CAC, zero ads, zero
data extraction. The business model is what fans wish more fan-tools had:
buy the things you want, pay for the convenience you use, ignore the rest.

Month-1 target: **$500 in margin + 50 Premium subs**.
Month-12 target: **$15k/mo gross**.

Boil the ocean.
