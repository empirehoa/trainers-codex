# launch/ — v1.0-launch marketing pack (produced 2026-09-09, NOT published)

Everything here is a draft for the owner to post by hand. Nothing in this folder
is wired to any publishing tool. Rules baked into every draft:

- The product is **Trainer's Codex**. "Pokémon" appears only descriptively
  ("a team builder for Pokémon"), never as part of the name, title, or tagline.
- **Zero merch mentions.** `MERCH_CHECKOUT` is off (client and worker) pending
  counsel; press copy must never pair the launch with print-on-demand.
- Premium is described as cosmetic/surface-only. Scores, the daily, and the
  leaderboard are pay-neutral — say so, it is a selling point.
- Every claim is true of the shipped build (v1.0-launch). No invented stats.
- Fan-project disclaimer present in every post.

| File | What |
|---|---|
| `og-verification.md` | OG/Twitter card image check per page class (sizes, URLs, how to re-verify live) |
| `post-r-stunfisk.md` | r/stunfisk draft — competitive angle (coverage analysis, Showdown import, type chart) |
| `post-r-pokemon.md` | r/pokemon draft — casual angle (build your six, Journey Mode daily, offline PWA) |
| `post-product-hunt.md` | Product Hunt listing draft — product + free tools angle, maker comment |
| `search-console.md` | Google Search Console property + sitemap submission steps (owner action) |
| `first-week-metrics.md` | The "is the funnel working" plan with the exact SQL over `journey_events` / `commerce_events` |
| `live-probes.sh` | The 12 read-only worker security probes with expected results (re-run after each worker deploy) |

Sequencing suggestion (owner's call): Search Console first (indexing takes
days), then r/stunfisk (highest-intent audience for the analysis tools), then
r/pokemon 48h later, Product Hunt on a Tuesday–Thursday once the first two have
surfaced any bugs. Never post before the owner blockers at the top of
`LAUNCH_READINESS.md` are cleared — until Stripe is live, every "purchase" is a
test-mode transaction.
