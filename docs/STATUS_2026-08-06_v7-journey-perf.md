# Status — 2026-08-06 session ("v7: Journey merged + perf + Aug intel")

**Branch this work lives on:** `claude/v7-journey-perf` (local name `v6` during
the session). Built on `origin/v5-launch` (the real v6-live line — note the
misleading branch name) with `origin/claude/journey-mode-trainer-sim-1r2yvp`
merged in.

## Repo topology — read this before touching branches
- `origin/main` — **stale**: single squashed "v5 launch" commit. NOT the live code.
- `origin/v5-launch` — the actual v6 line that is live on trainerscodex.com
  (Worker + Stripe + Printful + profiles + Showdown I/O + AI Studio).
- `origin/claude/journey-mode-trainer-sim-1r2yvp` — Journey Mode, branched off
  stale main; superseded by this merge.
- `claude/v7-journey-perf` — this session's output: v6 ⟕ Journey + perf + fixes.
  **Recommended:** make this the new `main` after review
  (`git push origin claude/v7-journey-perf:main --force-with-lease` is NOT
  needed — main is an ancestor, a plain push fast-forwards).

## What shipped this session
1. **Journey Mode merged into the v6 line.** Conflicts resolved in
   `index.html` (kept builder OG tags; Journey OG belongs in a worker route
   rewrite for `/journey`), `App.tsx` (kept v6 desktop-toolbar + mobile
   overflow structure; Journey button added to BOTH), `harness.mjs` (union:
   `opts.query` + 45s mount ceiling), `run-all.mjs` (all 18 suites).
2. **Performance pass** (measured, `tests/bench-boot.mjs`, median of 5,
   file:// with network blocked):
   - Boot → interactive grid: **1,578ms → 673ms (−57%)**
   - Initial DOM cards: 1,307 → 240 (windowed grid + IntersectionObserver sentinel)
   - JS heap after boot: **28MB → 17MB (−39%)**
   - How: windowed grid, `React.memo(PokemonCard)` + stable handlers,
     `useDeferredValue` on search, `json.stringify` in Vite config
     (JSON.parse beats object-literal parse for the ~700KB dataset),
     `decoding="async"` on sprites.
3. **Paste-URL import** (`src/lib/paste-url.ts` + dialog wiring): pokepast.es /
   PokeBin / teams.pokemonshowdown.com links fetch + import directly, with
   clean degradation when a host blocks CORS. Unit-tested (17 tests).
4. **Journey emoji share summary** (`buildEmojiSummary` in
   `src/journey/share.ts`): Wordle-style spoiler-free strip (badge row +
   superlatives) now leads every Legend Card text share. Unit-tested (7 tests).
5. **Toolchain repairs:** removed broken `pnpm-workspace.yaml` (placeholder
   content, broke all pnpm commands), added `vitest.config.ts` (stops vitest
   swallowing worker node:test files), fixed the grid-window reset to the
   render-time pattern (react-hooks v7 clean).
6. **Docs:** `docs/COMPETITIVE_INTEL_v3_2026-08.md` (full fresh analysis, four
   research sweeps + Semrush data), CLAUDE.md gotchas 18–20, README badges.

## Verification
- vitest: **123/123** · worker node:test: **19/19** · browser (puppeteer):
  **18 suites / 168 tests** — see final run log in session deliverables.
- `pnpm build` clean; `bundle.html` regenerated (1.87MB / ~490KB gzip).
- eslint: all files touched this session are clean. **46 pre-existing** errors
  remain on the v6 line (react-hooks v7 `set-state-in-effect` + `no-empty` in
  older dialogs, worker) — untouched deliberately; separate cleanup task.

## Next actions (from COMPETITIVE_INTEL_v3 — P0 first)
1. Champions Reg M-B legality + SP (66/32) planner + VP costs (the whole
   competitive market pivoted; ~10 free tools shipped this in Q2).
2. Speed tiers panel (TW/TR toggles) in the analysis sheet.
3. SEO satellite pages + per-Pokémon pages + shareable team URLs with OG
   posters — trainerscodex.com ranks for ONE keyword today; this is the
   bottleneck, not features.
4. Reddit/PH launch sequence before Worlds (Aug 29–30) with the season-end
   "rank card" merch moment.
5. Disavow the purchased PBN backlinks (Semrush shows a spam cluster).
