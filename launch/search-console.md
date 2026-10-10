# Google Search Console — property + sitemap submission (OWNER ACTION)

Needs domain ownership; cannot be done by an agent. ~15 minutes.

## 1. Create the property (Domain property, not URL-prefix)

1. https://search.google.com/search-console → **Add property** → **Domain** →
   `trainerscodex.com`.
2. Google shows a TXT record `google-site-verification=…`.
3. Cloudflare dashboard → zone `trainerscodex.com` → **DNS** → **Add record**:
   Type `TXT`, Name `@`, Content = the token, TTL Auto. Save.
4. Back in Search Console → **Verify** (propagation is usually < 5 min on
   Cloudflare).

A Domain property covers `https://`, `http://`, `www.` and every path in one
view, which is what the 1,330 reference URLs need.

## 2. Submit the sitemap

1. Search Console → **Sitemaps** → enter `sitemap.xml` → **Submit**.
2. Confirm it reads **Success · 1,330 discovered URLs** within a day. (The
   sitemap is generated at build time by `scripts/gen-seo-pages.ts` and staged
   by `scripts/inject-config.mjs`; `curl -s https://trainerscodex.com/sitemap.xml | grep -c '<loc>'`
   must print `1330`.)
3. `robots.txt` already references the sitemap — verify with
   `curl -s https://trainerscodex.com/robots.txt`.

## 3. Request indexing for the hubs (optional accelerant)

URL Inspection → paste each → **Request indexing**:
`https://trainerscodex.com/`, `/pokemon/`, `/type/`, `/pokemon/charizard/`,
`/pokemon/gengar/`, `/type/ghost/`. Google rate-limits this to ~10/day; the
sitemap handles the rest.

## 4. Things to watch in the first two weeks

- **Pages → "Crawled – currently not indexed"**: expected for a fresh site
  with 1,300 thin-ish pages. If it stays > 50% after 14 days, the fix is more
  internal linking (the hub already links every page) and inbound links (the
  Reddit / PH posts).
- **Pages → "Duplicate without user-selected canonical"**: would mean the
  trailing-slash and no-slash variants are both being served (finding D-14 in
  `LAUNCH_READINESS.md`). Verify `curl -sI https://trainerscodex.com/pokemon/gengar`
  returns a 3xx to the slash form or the same canonical; each page carries
  `<link rel="canonical">` (see `src/seo/render.ts`).
- **Enhancements → Structured data**: every species page ships JSON-LD; zero
  errors expected (asserted by `tests/test-seo-pages.mjs`).
- **Core Web Vitals**: the reference pages score 100/100 in lab; the app shell
  is the one to watch (LCP). Field data appears after ~28 days of traffic.

## 5. Bing (5 minutes, free traffic)

https://www.bing.com/webmasters → **Import from Google Search Console** → done.
