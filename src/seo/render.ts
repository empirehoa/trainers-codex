// HTML templates for the build-time SEO pages.
//
// Pure string functions — no DOM, no framework, no build step of their own.
// These pages deliberately do NOT load the app bundle: they are reference
// documents that must render instantly on a cold mobile connection and stay
// readable with JavaScript off, and their entire job is to hand the visitor a
// link into the app. Shipping a 1.2 MB bundle to answer "what is Gengar weak
// to" would defeat both.
//
// Styling is a single inline <style> block (the deploy CSP allows inline
// styles; see public/_headers) and no external requests of any kind — no
// fonts, no sprites, no analytics. Sprite art in particular is deliberately
// absent: hotlinking third-party artwork onto 1,307 indexed pages is a
// materially different IP posture than referencing it inside the tool.

import { TYPES } from '../lib/constants.ts';
import type { PokemonType } from '../lib/types.ts';
import {
  SITE_ORIGIN, STAT_NAMES,
  builderLink, bstPercentile, countersFor, defensiveProfile, familyForms,
  faqFor, joinList, metaDescription, offensiveProfile, relatedTo, speciesPath,
  titleCase, topStabMoves, typeColor, typeFacts, typeFaq, typeLine,
  typeMetaDescription, typePath, typesOf,
} from './data.ts';
import type { FaqItem, RawEntry, RawEvolution, RawMove, TypeFacts } from './data.ts';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON-LD is injected inside a <script> element, where `</` ends the block. */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const CSS = `
:root{color-scheme:dark;--bg:#0c0a08;--ink:#f5ead2;--dim:#cdc4ad;--faint:#7f7361;--gold:#f4ae3c;--line:#2a241b;--panel:#141009}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);font-family:ui-monospace,'JetBrains Mono',SFMono-Regular,Menlo,monospace;line-height:1.6;-webkit-text-size-adjust:100%}
a{color:var(--gold);text-decoration:none}
a:hover{text-decoration:underline}
main{max-width:900px;margin:0 auto;padding:1.5rem 1.1rem 5rem}
header.bar{border-bottom:1px solid var(--line);padding:.75rem 1.1rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
header.bar .brand{color:var(--gold);font-weight:700;letter-spacing:.06em;font-size:.8rem}
header.bar nav a{font-size:.72rem;color:var(--dim)}
.crumbs{font-size:.7rem;color:var(--faint);margin:0 0 1rem}
.crumbs a{color:var(--faint)}
h1{font-size:1.7rem;letter-spacing:.03em;margin:.25rem 0 .35rem;color:var(--ink)}
h1 .dex{color:var(--faint);font-size:1rem;font-weight:400}
h2{font-size:.95rem;color:var(--gold);letter-spacing:.06em;text-transform:uppercase;margin:2.25rem 0 .6rem;border-bottom:1px solid var(--line);padding-bottom:.35rem}
h3{font-size:.82rem;color:var(--dim);margin:1.1rem 0 .4rem;letter-spacing:.04em}
p{font-size:.85rem;color:var(--dim)}
.lede{font-size:.92rem;color:var(--ink)}
.pill{display:inline-block;padding:.12rem .5rem;border-radius:999px;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:#0c0a08;font-weight:700;margin-right:.3rem}
.pill.ghost{background:transparent;color:var(--faint);border:1px solid var(--line);font-weight:400}
.grid18{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:.35rem;margin:.6rem 0}
.cell{border:1px solid var(--line);border-radius:5px;padding:.35rem .4rem;background:var(--panel)}
.cell .t{font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);display:block}
.cell .m{font-size:.82rem;font-weight:700}
.m4{color:#ff6b57}.m2{color:#ffa05a}.m1{color:#8e8676}.mh{color:#7fd18a}.mq{color:#4fc4ff}.m0{color:#b07cff}
table{width:100%;border-collapse:collapse;font-size:.76rem;margin:.5rem 0}
th,td{text-align:left;padding:.33rem .45rem;border-bottom:1px solid var(--line);color:var(--dim)}
th{color:var(--faint);font-weight:400;font-size:.66rem;letter-spacing:.07em;text-transform:uppercase}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.bar-wrap{display:flex;align-items:center;gap:.5rem}
.bar-track{flex:1;height:6px;background:#221c14;border-radius:3px;overflow:hidden;min-width:60px}
/* display:block is load-bearing: these are spans, and height:100% does not
   apply to an inline box — without it every stat bar renders at zero height
   and the whole column looks like an empty track. */
.bar-fill{display:block;height:100%;background:var(--gold)}
.chips a{display:inline-block;border:1px solid var(--line);background:var(--panel);border-radius:5px;padding:.28rem .55rem;margin:0 .3rem .35rem 0;font-size:.74rem}
.cta{display:block;margin:1.75rem 0;padding:1rem 1.1rem;border:1px solid var(--gold);border-radius:8px;background:rgba(244,174,60,.07)}
.cta strong{display:block;color:var(--gold);font-size:.95rem;margin-bottom:.2rem}
.cta span{font-size:.78rem;color:var(--dim)}
details{border-bottom:1px solid var(--line);padding:.55rem 0}
summary{cursor:pointer;font-size:.82rem;color:var(--ink)}
details p{margin:.45rem 0 0}
footer{border-top:1px solid var(--line);margin-top:3rem;padding:1.25rem 0 0;font-size:.7rem;color:var(--faint)}
footer a{color:var(--faint)}
.chart{overflow-x:auto}
.chart table{min-width:640px;font-size:.62rem}
.chart td,.chart th{padding:.2rem .25rem;text-align:center;border:1px solid var(--line)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media(max-width:520px){h1{font-size:1.35rem}main{padding:1.1rem .85rem 4rem}}
`.trim();

function multClass(m: number): string {
  if (m >= 4) return 'm4';
  if (m === 2) return 'm2';
  if (m === 1) return 'm1';
  if (m === 0.5) return 'mh';
  if (m === 0) return 'm0';
  return 'mq';
}

function multLabel(m: number): string {
  if (m === 0) return '0';
  if (m === 0.25) return '¼';
  if (m === 0.5) return '½';
  return `${m}×`;
}

function typePill(t: PokemonType, link = true): string {
  const inner = `<span class="pill" style="background:${typeColor(t)}">${escapeHtml(titleCase(t))}</span>`;
  return link ? `<a href="${typePath(t)}">${inner}</a>` : inner;
}

function matchupGrid(rows: { type: PokemonType; mult: number }[]): string {
  return `<div class="grid18">${rows.map(r =>
    `<div class="cell"><span class="t">${escapeHtml(titleCase(r.type))}</span>`
    + `<span class="m ${multClass(r.mult)}">${multLabel(r.mult)}</span></div>`,
  ).join('')}</div>`;
}

function faqSection(items: FaqItem[]): string {
  return `<h2>Common questions</h2>`
    + items.map(f =>
      `<details><summary>${escapeHtml(f.q)}</summary><p>${escapeHtml(f.a)}</p></details>`,
    ).join('');
}

function faqLd(items: FaqItem[]): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function breadcrumbLd(trail: { name: string; path: string }[]): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: `${SITE_ORIGIN}${t.path}`,
    })),
  };
}

export interface LayoutOpts {
  title: string;
  description: string;
  path: string;
  crumbs: { name: string; path: string }[];
  structured: unknown[];
  body: string;
}

export function layout(o: LayoutOpts): string {
  const canonical = `${SITE_ORIGIN}${o.path}`;
  const crumbHtml = o.crumbs
    .map((c, i) => i === o.crumbs.length - 1
      ? escapeHtml(c.name)
      : `<a href="${c.path}">${escapeHtml(c.name)}</a>`)
    .join(' / ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(o.title)}</title>
<meta name="description" content="${escapeHtml(o.description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(o.title)}">
<meta property="og:description" content="${escapeHtml(o.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Trainer's Codex">
<meta property="og:image" content="${SITE_ORIGIN}/og-journey.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(o.title)}">
<meta name="twitter:description" content="${escapeHtml(o.description)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${CSS}</style>
${o.structured.map(s => `<script type="application/ld+json">${jsonLd(s)}</script>`).join('\n')}
</head>
<body>
<header class="bar">
  <a class="brand" href="/">TRAINER'S CODEX</a>
  <nav><a href="/pokemon">All Pokémon</a> · <a href="/type">Types</a> · <a href="/">Team builder</a></nav>
</header>
<main>
<p class="crumbs">${crumbHtml}</p>
${o.body}
<footer>
  <p>Trainer's Codex is an independent fan-made tool. Pokémon and all related names and marks are
  the property of Nintendo, Creatures Inc. and GAME FREAK inc. This site is unaffiliated with and not
  endorsed by them, and claims no ownership of their marks. Type effectiveness and base stat data are
  factual game mechanics.</p>
  <p><a href="/">Team builder</a> · <a href="/pokemon">All Pokémon</a> · <a href="/type">Type chart</a>
  · <a href="/legal">Legal</a> · <a href="/dmca">DMCA</a></p>
</footer>
</main>
</body>
</html>
`;
}

export interface SpeciesPageInput {
  entry: RawEntry;
  all: RawEntry[];
  sortedBst: number[];
  learnset: number[] | undefined;
  moves: Record<string, RawMove>;
  evolvesTo: RawEvolution[] | undefined;
  /** Entries whose evolution list names this one — i.e. what it came from. */
  evolvesFrom: RawEntry[];
  byId: Map<number, RawEntry>;
}

export function speciesPage(input: SpeciesPageInput): string {
  const e = input.entry;
  const types = typesOf(e);
  const def = defensiveProfile(types);
  const off = offensiveProfile(types);
  const pct = bstPercentile(e.b, input.sortedBst);
  const counters = countersFor(e, input.all);
  const related = relatedTo(e, input.all);
  const forms = familyForms(e, input.all).filter(f => f.i !== e.i);
  const stab = topStabMoves(e, input.learnset, input.moves);
  const faq = faqFor(e);
  const title = `${e.d} — weaknesses, base stats & type matchups | Trainer's Codex`;
  const desc = metaDescription(e);
  const maxStat = Math.max(...e.s);

  const weakestLine = def.x4.length
    ? `Its worst matchup is ${joinList(def.x4.map(titleCase))} at 4× damage.`
    : def.x2.length
      ? `Its worst matchups are ${joinList(def.x2.map(titleCase))} at 2× damage.`
      : `Nothing on the type chart hits it for super-effective damage.`;

  const body = `
<h1>${escapeHtml(e.d)} <span class="dex">#${String(e.sp ?? e.i).padStart(4, '0')}${e.form ? ` · ${escapeHtml(e.form)} form` : ''}</span></h1>
<p>${types.map(t => typePill(t)).join('')}${e.form ? `<span class="pill ghost">${escapeHtml(e.form)}</span>` : ''}</p>
<p class="lede">${escapeHtml(e.d)} is a ${escapeHtml(typeLine(e))}-type Pokémon with a base stat total of
${e.b} — higher than ${pct}% of all entries in the dex. ${escapeHtml(weakestLine)}
It resists ${def.half.length + def.quarter.length + def.immune.length} of the 18 attacking types.</p>

<a class="cta" href="${builderLink(e)}"><strong>Build a team around ${escapeHtml(e.d)} →</strong>
<span>Open the coverage analyzer and see what ${escapeHtml(e.d)} leaves exposed across a full six.</span></a>

<h2>What ${escapeHtml(e.d)} is weak to</h2>
<p>Incoming damage multipliers against ${escapeHtml(e.d)}'s ${escapeHtml(typeLine(e))} typing, for all 18 attacking types.</p>
${matchupGrid(def.all)}
<table>
<tbody>
${def.x4.length ? `<tr><th>4× damage</th><td>${def.x4.map(t => typePill(t)).join('')}</td></tr>` : ''}
${def.x2.length ? `<tr><th>2× damage</th><td>${def.x2.map(t => typePill(t)).join('')}</td></tr>` : ''}
${def.half.length ? `<tr><th>½ damage</th><td>${def.half.map(t => typePill(t)).join('')}</td></tr>` : ''}
${def.quarter.length ? `<tr><th>¼ damage</th><td>${def.quarter.map(t => typePill(t)).join('')}</td></tr>` : ''}
${def.immune.length ? `<tr><th>No effect</th><td>${def.immune.map(t => typePill(t)).join('')}</td></tr>` : ''}
</tbody>
</table>

<h2>What ${escapeHtml(e.d)} is strong against</h2>
<p>Best multiplier ${escapeHtml(e.d)}'s same-type attacks reach against each defending type.</p>
${matchupGrid(off.all)}

<h2>${escapeHtml(e.d)} base stats</h2>
<table>
<thead><tr><th>Stat</th><th class="num">Base</th><th>Spread</th></tr></thead>
<tbody>
${STAT_NAMES.map((n, i) => `<tr><td>${n}</td><td class="num">${e.s[i]}</td>
<td><span class="bar-wrap"><span class="bar-track"><span class="bar-fill" style="width:${Math.round((e.s[i] / maxStat) * 100)}%"></span></span></span></td></tr>`).join('')}
<tr><td><strong>Total</strong></td><td class="num"><strong>${e.b}</strong></td><td>${pct}th percentile</td></tr>
</tbody>
</table>

<h2>Abilities</h2>
<p class="chips">${e.a.length ? e.a.map(a => `<span class="pill ghost">${escapeHtml(a)}</span>`).join('') : 'None recorded.'}</p>
<p>Height ${e.h} m · Weight ${e.w} kg</p>

${stab.length ? `<h2>Best same-type moves</h2>
<p>Highest-power ${escapeHtml(typeLine(e))} moves ${escapeHtml(e.d)} can learn — these get the same-type attack bonus.</p>
<table>
<thead><tr><th>Move</th><th>Type</th><th>Class</th><th class="num">Power</th><th class="num">Acc</th><th class="num">PP</th></tr></thead>
<tbody>${stab.map(m => `<tr><td>${escapeHtml(m.d)}</td><td>${escapeHtml(titleCase(m.t))}</td><td>${escapeHtml(m.c)}</td><td class="num">${m.p ?? '—'}</td><td class="num">${m.a ?? '—'}</td><td class="num">${m.pp}</td></tr>`).join('')}</tbody>
</table>` : ''}

${input.evolvesFrom.length || (input.evolvesTo && input.evolvesTo.length) ? `<h2>Evolution</h2>
${input.evolvesFrom.length ? `<p>Evolves from ${input.evolvesFrom.map(f => `<a href="${speciesPath(f)}">${escapeHtml(f.d)}</a>`).join(', ')}.</p>` : ''}
${input.evolvesTo && input.evolvesTo.length ? `<p>Evolves into ${input.evolvesTo.map(v => {
    const target = input.byId.get(v.id);
    const label = target ? `<a href="${speciesPath(target)}">${escapeHtml(v.to)}</a>` : escapeHtml(v.to);
    const how = v.level ? `at level ${v.level}` : `by ${escapeHtml(v.how)}`;
    return `${label} ${how}`;
  }).join(', ')}.</p>` : ''}` : ''}

${forms.length ? `<h2>Other forms</h2>
<p class="chips">${forms.map(f => `<a href="${speciesPath(f)}">${escapeHtml(f.d)}</a>`).join('')}</p>` : ''}

${counters.length ? `<h2>Pokémon that counter ${escapeHtml(e.d)}</h2>
<p>These hit ${escapeHtml(e.d)} for super-effective damage while taking neutral damage or less in return.</p>
<table>
<thead><tr><th>Pokémon</th><th>Type</th><th class="num">Deals</th><th class="num">Takes</th><th class="num">BST</th></tr></thead>
<tbody>${counters.map(c => `<tr><td><a href="${speciesPath(c.entry)}">${escapeHtml(c.entry.d)}</a></td>
<td>${escapeHtml(typeLine(c.entry))}</td><td class="num ${multClass(c.outgoing)}">${multLabel(c.outgoing)}</td>
<td class="num ${multClass(c.incoming)}">${multLabel(c.incoming)}</td><td class="num">${c.entry.b}</td></tr>`).join('')}</tbody>
</table>` : ''}

${related.length ? `<h2>Similar Pokémon</h2>
<p>Other ${escapeHtml(titleCase(e.t[0]))}-types with a comparable base stat total.</p>
<p class="chips">${related.map(r => `<a href="${speciesPath(r)}">${escapeHtml(r.d)} · ${r.b}</a>`).join('')}</p>` : ''}

${faqSection(faq)}

<a class="cta" href="${builderLink(e)}"><strong>Analyze a full team with ${escapeHtml(e.d)} →</strong>
<span>Free, no account. Runs entirely in your browser and works offline.</span></a>
`;

  return layout({
    title,
    description: desc,
    path: speciesPath(e),
    crumbs: [
      { name: 'Home', path: '/' },
      { name: 'Pokémon', path: '/pokemon' },
      { name: e.d, path: speciesPath(e) },
    ],
    structured: [
      breadcrumbLd([
        { name: 'Home', path: '/' },
        { name: 'Pokémon', path: '/pokemon' },
        { name: e.d, path: speciesPath(e) },
      ]),
      faqLd(faq),
    ],
    body,
  });
}

export function typePage(f: TypeFacts, members: RawEntry[]): string {
  const n = titleCase(f.type);
  const faq = typeFaq(f, members.length);
  const top = members.filter(m => m.sp === undefined).sort((a, b) => b.b - a.b);
  const body = `
<h1>${escapeHtml(n)}-type Pokémon</h1>
<p>${typePill(f.type, false)}</p>
<p class="lede">${escapeHtml(typeMetaDescription(f))}</p>

<h2>Defending: what hits ${escapeHtml(n)} hardest</h2>
<p>Damage taken by a pure ${escapeHtml(f.type)}-type. A second type changes these numbers — every
Pokémon page below shows its real combined matchups.</p>
${matchupGrid(f.defending)}

<h2>Attacking: what ${escapeHtml(n)} moves do</h2>
${matchupGrid(f.attacking)}

<a class="cta" href="/"><strong>Check your team's ${escapeHtml(f.type)} coverage →</strong>
<span>See at a glance which of your six can answer a ${escapeHtml(f.type)}-type threat.</span></a>

<h2>Every ${escapeHtml(n)}-type Pokémon</h2>
<p>${top.length} base-form entries, strongest first. Alternate forms appear on their base species' page.</p>
<table>
<thead><tr><th>Pokémon</th><th>Types</th><th class="num">BST</th><th class="num">HP</th><th class="num">Atk</th><th class="num">Def</th><th class="num">SpA</th><th class="num">SpD</th><th class="num">Spe</th></tr></thead>
<tbody>${top.map(m => `<tr><td><a href="${speciesPath(m)}">${escapeHtml(m.d)}</a></td><td>${escapeHtml(typeLine(m))}</td>
<td class="num">${m.b}</td>${m.s.map(v => `<td class="num">${v}</td>`).join('')}</tr>`).join('')}</tbody>
</table>

${faqSection(faq)}
`;
  return layout({
    title: `${n}-type Pokémon — weaknesses, resistances & full list | Trainer's Codex`,
    description: typeMetaDescription(f),
    path: typePath(f.type),
    crumbs: [
      { name: 'Home', path: '/' },
      { name: 'Types', path: '/type' },
      { name: `${n} type`, path: typePath(f.type) },
    ],
    structured: [
      breadcrumbLd([
        { name: 'Home', path: '/' },
        { name: 'Types', path: '/type' },
        { name: `${n} type`, path: typePath(f.type) },
      ]),
      faqLd(faq),
    ],
    body,
  });
}

/** The 18×18 grid — the page that answers "pokemon type chart" directly. */
export function typeIndexPage(counts: Map<PokemonType, number>): string {
  const rows = TYPES.map(atk => {
    const f = typeFacts(atk);
    return `<tr><th>${escapeHtml(titleCase(atk))}</th>${f.attacking
      .map(c => `<td class="${multClass(c.mult)}">${c.mult === 1 ? '' : multLabel(c.mult)}</td>`)
      .join('')}</tr>`;
  }).join('');

  const faq: FaqItem[] = [
    {
      q: 'How do I read the Pokémon type chart?',
      a: 'Find the attacking type in the left column and the defending type across the top. '
        + 'The cell shows the damage multiplier: 2× is super-effective, ½ is resisted, 0 means the '
        + 'attack has no effect, and a blank cell is neutral damage.',
    },
    {
      q: 'How do dual types work?',
      a: 'Multipliers multiply. A Rock attack is 2× against Flying and 2× against Bug, so it deals '
        + '4× to a Bug/Flying Pokémon. A type that resists one half and is weak to the other cancels '
        + 'out to neutral damage.',
    },
    {
      q: 'Which type has the fewest weaknesses?',
      a: 'Steel resists the most attacking types of any single type and is immune to Poison, '
        + 'which is why Steel typings dominate defensive team cores.',
    },
    {
      q: 'What is the best offensive type?',
      a: 'No single type covers everything, which is why coverage is a team property rather than a '
        + 'Pokémon property. Trainer’s Codex scores a full six against all 18 types at once.',
    },
  ];

  const body = `
<h1>Pokémon type chart</h1>
<p class="lede">The complete 18×18 matchup grid. Rows are the attacking type, columns the defending
type. Every cell is the damage multiplier.</p>

<div class="chart">
<table>
<thead><tr><th>ATK \\ DEF</th>${TYPES.map(t => `<th>${escapeHtml(titleCase(t).slice(0, 3))}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody>
</table>
</div>
<p>Legend: <span class="m2">2×</span> super-effective · blank = 1× neutral ·
<span class="mh">½</span> resisted · <span class="m0">0</span> no effect. A single
attacking type never reaches <span class="m4">4×</span> — that needs a dual-type
defender, so it appears on individual Pokémon pages rather than here.</p>

<a class="cta" href="/"><strong>Run this chart against your actual team →</strong>
<span>The coverage analyzer applies all 18 rows to all six of your Pokémon at once and shows the holes.</span></a>

<h2>Every type</h2>
<table>
<thead><tr><th>Type</th><th class="num">Pokémon</th><th>Weak to</th><th>Resists</th><th>Immune to</th></tr></thead>
<tbody>${TYPES.map(t => {
    const f = typeFacts(t);
    return `<tr><td><a href="${typePath(t)}">${escapeHtml(titleCase(t))}</a></td>
<td class="num">${counts.get(t) ?? 0}</td>
<td>${f.weakTo.map(titleCase).join(', ')}</td>
<td>${f.resists.map(titleCase).join(', ')}</td>
<td>${f.immuneTo.map(titleCase).join(', ') || '—'}</td></tr>`;
  }).join('')}</tbody>
</table>

${faqSection(faq)}
`;
  return layout({
    title: 'Pokémon type chart — all 18 types, weaknesses & resistances | Trainer\'s Codex',
    description: 'The complete Pokémon type chart: an 18×18 grid of every attacking and defending '
      + 'matchup, plus weaknesses, resistances and immunities for all 18 types and a full list of '
      + 'the Pokémon in each.',
    path: '/type',
    crumbs: [{ name: 'Home', path: '/' }, { name: 'Types', path: '/type' }],
    structured: [
      breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Types', path: '/type' }]),
      faqLd(faq),
    ],
    body,
  });
}

/** The species hub — the crawl path from the site root to all 1,307 pages. */
export function speciesIndexPage(groups: { label: string; entries: RawEntry[] }[]): string {
  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  const body = `
<h1>All Pokémon</h1>
<p class="lede">${total} entries — every species plus every alternate form, each with its full type
matchup chart, base stats, learnable same-type moves and computed counters.</p>

<a class="cta" href="/"><strong>Open the team builder →</strong>
<span>Pick six, see your defensive and offensive coverage scored live.</span></a>

${groups.map(g => `<h2>${escapeHtml(g.label)}</h2>
<p class="chips">${g.entries.map(e => `<a href="${speciesPath(e)}">${escapeHtml(e.d)}</a>`).join('')}</p>`).join('\n')}
`;
  return layout({
    title: 'All Pokémon — type matchups, base stats & counters | Trainer\'s Codex',
    description: `Browse all ${total} Pokémon and alternate forms. Every entry has a full 18-type `
      + 'matchup chart, base stats with percentile, best same-type moves, evolution line and the '
      + 'Pokémon that counter it.',
    path: '/pokemon',
    crumbs: [{ name: 'Home', path: '/' }, { name: 'Pokémon', path: '/pokemon' }],
    structured: [breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Pokémon', path: '/pokemon' }])],
    body,
  });
}

export interface SitemapUrl { path: string; priority: string; changefreq: string }

export function sitemap(urls: SitemapUrl[], lastmod: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${SITE_ORIGIN}${u.path === '/' ? '/' : u.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
}
