# r/stunfisk draft — "I built a free, offline team-coverage analyzer with a real 18×18 chart, Showdown import and a matchup preview"

> Post as a self-post with the link in the body (r/stunfisk removes bare link posts
> from new accounts). Flair: **Resource** (or whatever the mod team's current
> flair for tools is — check the sidebar the day you post). Read the sub's
> self-promotion rule that morning; if it requires mod pre-approval, message
> them first with this text. No merch. No affiliate anything.

**Title options** (pick one, ≤ 300 chars, no clickbait):

1. `I built a free offline team-coverage analyzer: defensive matrix, offensive coverage, threat list, Showdown paste import — single HTML file, no account`
2. `Free tool: paste a Showdown team, get the full defensive/offensive coverage breakdown + a per-species matchup page for all 1,307 forms`

**Body:**

Hey stunfisk — I've been building **Trainer's Codex**, a free team builder /
coverage analyzer for Pokémon, and it's at the point where it's useful to people
who actually care about matchups rather than just me. Sharing it here because
this is the audience that will tell me what's wrong with it.

What it does today (all free, no account, works offline as an installable web app):

- **Defensive matrix** across all 18 types for your six, with the dual-type
  math done properly (product of the two effectivenesses — immunities and 4×
  weaknesses show up as such, not as "neutral").
- **Offensive coverage** from the actual movesets you pick (919 moves, full
  learnsets per form), plus a threat list of what walls you.
- **Showdown import/export** — paste a PokePaste / Showdown export, or a
  pokepast.es link, and it loads the team with moves, items, abilities,
  Tera types and shinies.
- **Matchup preview** powered by `@smogon/calc` so the "which move do I click"
  question has a number next to it.
- **Reference pages** for every species and form (1,307 of them) and every type:
  weaknesses, base stats, learnset, evolution line, counters. Plain static
  HTML, loads nothing external, so they're fast and indexable —
  `trainerscodex.com/pokemon/gengar` for example.
- Full 18×18 type chart in a dialog that actually fits on a phone.

Also in there, if you want a break from spreadsheets: **Journey Mode**, a
seeded, deterministic run-based career sim with a daily (same seed for everyone,
compare scores — it's pay-neutral, nothing you can buy changes an outcome).

Honest limits: Gen 9 mechanics are represented via the calc, not a battle
sim; damage rolls are the calc's, not Showdown's server; no doubles-specific
analysis yet. Tell me what a competitive player needs that isn't here.

It's a single self-contained HTML file (~2 MB) — you can literally save the
page and run it offline. There's an optional $4.99/mo premium for cosmetic
extras (poster art styles, Journey archive/finishes); nothing about the analysis
or the numbers is behind it and it never will be.

Link: https://trainerscodex.com

Independent fan project, not affiliated with Nintendo, Game Freak or The Pokémon
Company. Species data via PokeAPI; matchup math via @smogon/calc (MIT).

**Comment-thread prep** (answers to have ready):

- *"How does this differ from Pikalytics / Marriland / Showdown teambuilder?"* —
  It's a coverage-first builder that runs offline and outputs shareable
  posters/cards; it isn't a usage-stats site and doesn't try to be. Reference
  pages are static and load nothing external.
- *"Is the matchup math right?"* — Dual-type effectiveness is the product of
  the two single-type values; `journey/matchup.test.ts` and `lib/analysis.ts`
  pin the cases (Charizard vs Ground = immune, etc.). Report anything wrong
  with a species + move and I'll fix it with a test.
- *"Open source?"* — Source is visible on GitHub under a proprietary licence
  (not OSS). Bug reports and PRs welcome.
- *"Data source / licence?"* — PokeAPI (species/moves/learnsets, sprite mirror
  for in-app reference only), @smogon/calc (MIT). Reference pages ship zero
  third-party artwork.
