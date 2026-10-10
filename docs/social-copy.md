# Trainer's Codex — Launch Social Copy

**Authored:** 2026-05-29
**Status:** Drafts. Paste, tweak, do NOT auto-post.

> **Merch is dark at launch.** `MERCH_CHECKOUT` defaults to off in
> `src/lib/flags.ts`, so no post below mentions merch, Printful or print-on-demand.
> Merch copy returns to these drafts only after the owner flips `MERCH_CHECKOUT`
> and counsel has cleared the printed designs (docs/SECURITY.md). The lint in
> `tests/test-security.mjs` fails the build if a fenced post block mentions
> merch while the flag is off. The repo is proprietary (see `LICENSE`), so no
> post links "the code" or calls it open source.

All copy below assumes launch sequence per `docs/LAUNCH_PLAN.md` — soft launch mid-June 2026, hard launch Aug 26, 2026 (Tuesday before VGC Worlds weekend).

**Tone rules:**
- First person ("I built").
- No hype words: "revolutionary," "game-changing," "next-generation" → all banned.
- One concrete number per post.
- Always include a screenshot or GIF link.
- For Pokémon-specific subs: drop the casual marketing voice. Be a builder talking to other Pokémon fans.

---

## r/stunfisk (T+0, 11:00 ET — high-conversion competitive crowd)

**Title:**
```
Built a coverage analyzer that scores 0-100 and suggests counter teams — looking for stunfisk eyes on the meta picks
```

**Body:**
```
Been building this for a few weeks. It's a team analyzer that runs entirely in the browser (single 1.3MB HTML file, no install).

Things stunfisk might actually care about:
- All 1,307 entries including Megas, Gigantamax, Hisuian, Paldean, Paradox
- Live coverage strip above the team bar: composite 0-100 score, "weak to" type pills (where 2+ members share a weakness with ≤1 resist), "no hit on" gaps
- Per-member Tera Type picker with strategy hints (1.5x→2x STAB if same-type, defensive flip if off-type)
- Threat detection: surfaces what 2HKOs multiple team members
- Counter team builder: picks 6 mons that should beat your team

Things stunfisk WON'T care about but exist:
- 12 poster styles, AI-generated trainer card from a user photo, Journey Mode (a three-minute seeded trainer career with a daily run)

I'm not here to sell anything (the premium tier is $4.99/mo for cosmetic gates — all the analyzer features are free). I'm here because I tuned the coverage scoring against my own teams and want stunfisk to roast it.

Build a team you've actually played, hit "Analyze," and tell me if the coverage score and threat list make sense for your matchups.

https://trainerscodex.com

What scoring weight am I missing?
```

**Comment to drop in your own thread within 5 min:**
```
For transparency: there's a Premium Pack ($4.99/mo) that unlocks 6 of 12 poster styles and animated Gen 5 sprites. Everything analytic (coverage, threats, counter teams, Tera hints) is free forever. If you only ever use it on free tier you get full functional value.

Asking it of stunfisk specifically because if the analyzer is bad, the posters are just pictures of a broken analyzer.
```

---

## r/pokemon (T+0 or T+1, 11:00 ET — mass casual reach)

**Title:**
```
Made a Pokémon team analyzer + AI-generated trainer cards that fits in a single HTML file (1.3MB)
```

**Body:**
```
I'm a HOA management CEO by day, side-project Pokémon dad by night. Built this because every team-building tool I've tried either:
- Requires an account before I see the UI
- Is bloated with ads
- Doesn't know about Megas, Hisuian forms, Paradox Pokémon
- Or makes the poster output ugly

[Screenshot: dark mode team builder]
[Screenshot: poster studio with 12 art styles]
[Screenshot: AI trainer card example — anime style, looks great]

Features:
- 1,307 Pokémon including every form (Megas, Gigantamax, regional, Paradox)
- 12 poster styles (holographic foil, retro CRT, editorial, blueprint, polaroid stack, etc.)
- AI trainer card generator from a selfie (anime style, picks a starter, builds a 6-mon team around your vibe)
- Journey Mode — a seeded three-minute trainer career with a daily run you can share
- Type chart, threat detection, counter team builder
- Works offline once loaded — the entire thing is one HTML file

It's free. There's a $4.99/mo Premium Pack for cosmetic stuff (extra poster styles, animated sprites) but you don't need it.

https://trainerscodex.com

What features would you want next? Currently scoping a Pokémon Champions team import for VGC players + a battle simulator integration.
```

---

## r/PokemonChampions (T+2, after Champions players are warmed up)

**Title:**
```
Champions team builder + coverage analyzer — anyone want to test for VGC prep?
```

**Body:**
```
Building toward Worlds. Free team builder with:
- Live coverage scoring (0-100 with "weak to" pills updating in real-time)
- Counter team suggestions
- Tera Type strategy hints per member
- Threat detection (what 2HKOs multiple slots)
- Form-aware (Megas, regional variants, Paradox all covered)

Going to ship Champions-specific team import/export before Worlds. What format does Champions use for team sharing? Showdown's `[name] @ [item] / Ability: / etc.` paste format, or its own?

Looking for 5-10 VGC players to feedback the analyzer before I share it broader.

https://trainerscodex.com
```

---

## Product Hunt (T+5, Tuesday or Wednesday, 12:01 AM PT launch)

**Tagline (250 char max):**
```
Trainer's Codex — Pokémon team builder, analyzer, AI-generated trainer cards from your photo, and a three-minute Journey Mode. 1,307 mons, 12 poster styles. One HTML file. Free.
```

**Description (1,000 char max):**
```
I built Trainer's Codex because Pokémon team builders are either bloated SaaS or unmaintained spreadsheets. This is the version I wanted to use.

🎮 Build teams from 1,307 entries — every Mega, every Gigantamax, every regional variant, every Paradox Pokémon
🛡 Live coverage analyzer scores your team 0-100, surfaces threats, suggests counter teams
🎨 12 poster art styles — generate a print-ready 300DPI image of your team in any style
🧬 AI trainer card generator from your selfie — anime style, picks your starter, builds a cohesive 6-mon team
🗺 Journey Mode — a seeded trainer career in three minutes, with a daily run and a shareable card
☁️ Sign in with Google/Apple/Microsoft/Discord — your teams sync across devices

Free. Premium Pack is $4.99/mo for extra poster styles and animated Gen 5 sprites.

The whole thing is a single 1.3MB HTML file. Works offline. Drop on any web server, it just runs.

Built by Jose, a Florida HOA management CEO who has been losing to his nephew at Pokémon since 2018.
```

**Maker comment (post within 30 min of launch):**
```
Builder here, happy to answer anything.

Three things I tried to do differently:

(1) Single-file architecture. Drop bundle.html on any web server, no build pipeline. The 1,307 Pokémon entries + 919 moves + every learnset are inlined as JSON (~650KB). React 19, Tailwind, Canvas-2D for poster rendering (no WebGL, no AI image gen at runtime). The Cloudflare Worker handles Stripe Checkout + AI trainer card generation (via fal.ai's nano-banana for face-preservation).

(2) Form coverage. Most team builders track 1,025 base species. We track 1,307 including 71 Megas, 34 Gigantamax, 59 regional variants, 24 Paradox. Built form-aware game compatibility (Megas excluded from Switch-era games, Hisuian only in PLA/SV/PLZA, etc.).

(3) Journey Mode is a pure, deterministic simulation. `simulate(setup, choices)` has no DOM, no randomness outside the seed, so the same seed replays identically for everyone — that is what makes the daily run and the shared cards comparable.

Honest about what's not here: no battle simulator (Pokémon Showdown owns that and it's not winnable to compete). No tournament tracker (Pikalytics owns that).

What's coming next: Pokémon Champions team import (by August), battle simulator iframe integration via Showdown, friends + public profiles, VGC meta leaderboard.

Site: https://trainerscodex.com
```

---

## Hacker News Show HN (T+7, Tuesday 9:00 ET)

**Title:**
```
Show HN: Trainer's Codex – A Pokémon team analyzer in a single 1.3MB HTML file
```

**Top-level comment (post within 60 seconds of submission):**
```
Builder here. Three engineering choices that made this fit in one file:

1. Vite + React 19 + Tailwind, inline.mjs script that reads dist/index.html and inlines the JS/CSS into `<script>` and `<style>` tags. Output is 1.21MB unzipped, 313KB gzipped. Drops on any static host, no build pipeline on the host side.

2. All 1,307 Pokémon entries + 919 moves + every learnset are inlined as JSON (~650KB total before gzip). Generation logic is form-aware (Mega Charizard X is PokeAPI ID 10034, not 6.5; baseSpeciesId is a separate field for transfer-game compatibility math).

3. All poster rendering is Canvas-2D, no WebGL, no Web Workers, no AI image gen at runtime. The 12 poster styles are all hand-coded canvas renderers. The AI trainer card feature (when enabled) hits a Cloudflare Worker that proxies fal.ai's nano-banana edit endpoint — image stays client-side until the user opts into AI.

The Worker handles Stripe Checkout creation + JWT mint for the $4.99/mo Premium Pack. About 800 LOC of Worker code. Webhook signature verification is hand-rolled HMAC-SHA-256 (cheaper than the stripe-sdk dependency).

Live: https://trainerscodex.com

Happy to answer questions on architecture, the bundle.html inlining trick, the form-aware game compatibility logic, the Canvas-2D poster renderers, or the Stripe integration.
```

---

## X / Twitter — launch thread (T+0, 10:00 ET)

**Tweet 1:**
```
I built a Pokémon team builder + AI trainer card generator that fits in a single 1.3MB HTML file.

1,307 Pokémon, 12 poster styles, works offline. Drop bundle.html on any web server, it runs.

https://trainerscodex.com

[Screenshot 1: team builder + analyzer in dark mode]
```

**Tweet 2:**
```
Coverage analyzer scores your team 0-100 in real-time, surfaces threats, suggests counter teams.

Every Mega, every Gigantamax, every Paradox Pokémon is tracked. Form-aware game compatibility (Hisuian only in PLA, etc.)

[Screenshot 2: live coverage strip with threats]
```

**Tweet 3:**
```
12 poster art styles, all canvas-rendered, all 1080×1350 (Instagram-ready).

Holographic Foil, Editorial, Game Boy DMG, Trading Card Sheet, Blueprint, Polaroid Stack, Grainy Cinema, Type Collage, more.

[Screenshot 3: poster studio with 4 style examples]
```

**Tweet 4:**
```
The differentiator: AI-generated trainer cards from your selfie.

Anime style, picks a starter (Grass/Fire/Water), builds a cohesive 6-mon team around your "vibe" (calm/balanced/chaotic), includes a Mega Evolution. Face preservation via fal.ai nano-banana.

[Screenshot 4: AI trainer card example]
```

**Tweet 5:**
```
Journey Mode: a seeded trainer career in about three minutes. Same seed, same run, for everyone — so the daily is a fair race.

Retire, get a verdict and a rank, share the card.

[Screenshot 5: Journey Mode result card]
```

**Tweet 6:**
```
Sign in with Google / Apple / Microsoft / GitHub / Discord / X for cloud sync.

Build a team on your phone, finish it on your laptop. Saved teams + trainer profile sync via Supabase.

[Screenshot 6: sign-in dialog]
```

**Tweet 7:**
```
Free. Premium Pack is $4.99/mo for extra poster styles and animated Gen 5 sprites.

If you only ever use it on free tier, you still get the full analyzer + 6 poster styles + Journey Mode.

I'm not gating essential features. The premium stuff is cosmetic.
```

**Tweet 8 (call to action):**
```
Built by a Florida HOA management CEO who has been losing to his nephew at Pokémon since 2018.

https://trainerscodex.com

What feature should I build next? Pokémon Champions team import for VGC players, lightweight battle sim via Showdown iframe, or friends + public team profiles?
```

---

## LinkedIn (T+0, 11:00 ET — different angle, B2B audience)

**Headline + body:**
```
What I learned shipping a side-project SaaS in 3 weeks

I run Empire Management Group — a Florida community-association firm with 90 employees and ~$11M revenue. By day I'm managing 316 communities.

By night, I built a Pokémon team analyzer with a Stripe-billed Premium Pack. It's live at https://trainerscodex.com.

Three counterintuitive lessons from a CEO-built side project:

→ Single-file architecture beats microservices for side projects. The entire frontend is ONE 1.3MB HTML file. Drop it on any web server, it works. Zero infrastructure to maintain. I deploy by dragging a file onto Cloudflare's web UI.

→ Validate the niche, not the idea. Before writing one line of code, I cross-referenced what's missing across the top 10 competing tools (Pokémon Showdown, Pikalytics, Marriland, etc.). The wedge: nobody combines AI-generated trainer cards from user photos + team analysis + a shareable three-minute career mode. So I built exactly that combination.

→ Premium gating should remove friction, not paywall essentials. The entire analyzer is free. Premium ($4.99/mo) is cosmetic — extra poster styles, animated sprites. If 99% of users never pay, they still got real value. The 1% who pay paid for convenience, not access.

What I'd do differently:
- Launch sequence matters more than feature count. I'm planning my hard launch around Pokémon Champions Worlds (Aug 28-30) instead of next week.
- Build the differentiation feature (AI trainer card) BEFORE shipping the table-stakes features (team builder).
- Pick monetization before pricing. The subscription ($4.99/mo) is cosmetic-only, so the free tier stays the full product.

Engineering specifics for those curious: React 19 + Vite + Tailwind + shadcn/ui, all inlined into a single bundle.html via a custom 50-line Node script. Cloudflare Worker for Stripe + AI generation. Supabase for cloud sync. 66 puppeteer tests.
```

---

## Discord — welcome message for the Trainer's Codex server

**Pin in #welcome:**
```
👋 Welcome to Trainer's Codex.

This is a side project by Jose, a Florida HOA management CEO who has been losing to his nephew at Pokémon since 2018. Built because every team-building tool I tried was bloated, account-gated, or missing forms.

🎮 The site: https://trainerscodex.com
🐦 Twitter: @trainerscodex

🟢 #team-feedback — share a team via URL hash, get coverage scoring feedback from other trainers
🟢 #poster-drops — show off your posters and Journey cards
🟢 #premium — Premium Pack subscribers' channel
🟢 #help — bugs, feature requests, "how do I X"
🟢 #champions-vgc — Pokémon Champions VGC discussion (we're shipping team import before August Worlds)

House rules:
1. No console war / leaks / piracy talk
2. Family-safe channel — assume kids are reading
3. No begging for premium codes (the gates are cosmetic; everything competitive is free)
4. Report bugs in #help with what you tried + what happened + browser/device

What you can build:
✅ AI trainer card from your selfie (Premium)
✅ Posters in 12 styles, 1080×1350 Instagram-ready (6 free + 6 Premium)
✅ Journey Mode — seeded three-minute trainer careers with a daily run
✅ Cloud-synced trainer profile + saved teams
✅ Coverage analyzer scoring 0-100 with threat detection + counter team builder

Roadmap (vote in #feature-requests):
- Pokémon Champions team import (before Worlds, Aug 28-30)
- Lightweight battle simulator (Showdown iframe)
- Friends + public profile pages
- VGC meta leaderboard
- Tournament/bracket mode for private friend groups
```

---

## Email outreach — Wolfey VGC (cold ask)

**Subject:** Built a Pokémon trainer-card AI gen — open to a 90sec demo?

**Body:**
```
Hi Wolfey,

I'm Jose — Florida HOA management CEO by day, dad-side-project Pokémon developer by night. Long-time viewer (your Crunch Tier List videos are how I learned VGC).

I shipped a side project last week: https://trainerscodex.com

The thing I think might be worth your 60 seconds is the AI-generated trainer card feature. User uploads a selfie, our worker calls fal.ai with a Pokémon-trainer prompt template, the output is an anime-style trainer card with a starter + 6-mon team built around the photo's vibe.

Example output: [LINK to one of your hero screenshots]

The reason I'm reaching out specifically: I think this would make a great 5-minute video — "I uploaded my face to a Pokémon trainer card generator and this is what it said about my team" — for your channel. No payment, just an interesting build for VGC fans. Happy to ship you a free Premium Pack invite for life if you ever use it.

If you want, I'll send you a 30-second video of me generating one for myself. Or if it's not your thing, no worries at all — appreciate you reading.

Best,
Jose Riestra
CEO, Empire Management Group
https://trainerscodex.com
```

---

## Notes for whoever posts these

1. **Tweak everything.** These are drafts. Your voice is more casual than mine. Edit accordingly.
2. **Always include a screenshot.** Plain-text posts on Reddit/X/HN underperform by ~3x.
3. **Reply to comments fast.** First-hour comment engagement on PH and Reddit is what separates "frontpage" from "buried."
4. **One post per platform per launch.** Don't re-post. Mods see it as spam.
5. **Hold back the AI trainer card demo for posts where it shines.** It's the wedge — don't burn it on r/stunfisk (they care about the analyzer, not the AI gen).
6. **Track every traffic source.** Add `?utm_source=reddit_pokemon` etc. to each link so we know what worked.
