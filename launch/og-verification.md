# OG / social card verification — v1.0-launch

Checked 2026-09-09 against the built tree (`pnpm build && node inline.mjs`,
`scripts/inject-config.mjs` staging list). Live re-verification requires egress
to trainerscodex.com (denied from the audit sandbox) — commands at the bottom.

| Page class | `og:image` | Dimensions | Source file | Staged by |
|---|---|---|---|---|
| `/` (app shell, `/journey?seed=`, SPA fallback) | `https://trainerscodex.com/og-home.jpg` | **1200×630** JPEG (114 KB) | `public/og-home.jpg` — center-cropped from the 1280×800 `deploy/og-image.png` screenshot on 2026-09-09 | `scripts/inject-config.mjs` staticAssets |
| `/pokemon/<slug>` (1,307 pages) | `https://trainerscodex.com/og-journey.jpg` | **1200×630** JPEG | `public/og-journey.jpg` (rendered by `scripts/make-og-image.mjs`) | staticAssets |
| `/pokemon/` hub | same | 1200×630 | same | staticAssets |
| `/type/<type>` (18) + `/type/` chart | same | 1200×630 | same | staticAssets |
| `/legal.html`, `/dmca.html` | none (utility pages) | — | — | — |

Before 2026-09-09 the app shell pointed at `og-image.png` (1280×800, declared
as such). It rendered on most platforms but is outside the 1.91:1 spec; Twitter
`summary_large_image` and LinkedIn crop it. Now every marketable page class
serves 1200×630. `og:image:width/height` in `index.html` updated to match.

`og:title` on the app shell is still "Trainer's Codex — Pokémon Team Builder &
Coverage Analyzer" (nominative use; flagged for counsel in
`LAUNCH_READINESS.md` D-4 note — the PWA manifest `name` was changed to the bare
brand, the HTML title was deliberately left for counsel).

## Re-verify live (owner / any machine with egress)

```bash
for p in / /pokemon/gengar/ /type/ghost/ "/journey?seed=8843"; do
  echo "== $p"; curl -s "https://trainerscodex.com$p" | grep -oE '<meta (property|name)="(og:image|og:image:width|og:image:height|twitter:image)"[^>]*>'
done
curl -sI https://trainerscodex.com/og-home.jpg    | grep -iE 'HTTP/|content-type|content-length'
curl -sI https://trainerscodex.com/og-journey.jpg | grep -iE 'HTTP/|content-type|content-length'
# Then paste https://trainerscodex.com/ into https://cards-dev.twitter.com/validator ,
# https://developers.facebook.com/tools/debug/ and https://www.linkedin.com/post-inspector/
# and click "Scrape again" so cached 1280×800 cards are replaced.
```

Expected: both images 200, `image/jpeg`; the shell shows `og-home.jpg` 1200/630;
species/type pages show `og-journey.jpg`.
