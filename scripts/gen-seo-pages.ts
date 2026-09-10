// Emit the static, indexable reference pages.
//
//   node scripts/gen-seo-pages.ts [--out dist]
//
// Reads the same JSON the bundle inlines and writes:
//
//   <out>/pokemon/index.html          hub linking all 1,307 entries
//   <out>/pokemon/<slug>/index.html   one page per species and per form
//   <out>/type/index.html             the 18x18 chart
//   <out>/type/<type>/index.html      one page per type
//   <out>/sitemap.xml                 every URL above plus the app + legal pages
//
// Nothing here touches the app bundle: `bundle.html` is byte-for-byte the same
// whether this ran or not. The pages are additive files in the deploy root.
//
// Run by `pnpm build` (into dist/) and by scripts/inject-config.mjs (into the
// staged deploy directory), so a deploy can never ship the app without them.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPES } from '../src/lib/constants.ts';
import type { PokemonType } from '../src/lib/types.ts';
import { typeFacts, typesOf } from '../src/seo/data.ts';
import type { RawEntry, RawEvolution, RawMove } from '../src/seo/data.ts';
import {
  sitemap, speciesIndexPage, speciesPage, typeIndexPage, typePage,
} from '../src/seo/render.ts';
import type { SitemapUrl } from '../src/seo/render.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as T;
}

function write(out: string, rel: string, content: string): void {
  const target = join(out, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/** Roman-numeral generation labels, in dex order, for the hub page grouping. */
const GEN_LABELS: Record<string, string> = {
  i: 'Generation I — Kanto',
  ii: 'Generation II — Johto',
  iii: 'Generation III — Hoenn',
  iv: 'Generation IV — Sinnoh',
  v: 'Generation V — Unova',
  vi: 'Generation VI — Kalos',
  vii: 'Generation VII — Alola',
  viii: 'Generation VIII — Galar',
  ix: 'Generation IX — Paldea',
};
const GEN_ORDER = Object.keys(GEN_LABELS);

export function main(outDir: string): number {
  const pokemon = readJson<Record<string, RawEntry>>('src/data/pokemon-data.json');
  const moves = readJson<Record<string, RawMove>>('src/data/moves.json');
  const learnsets = readJson<Record<string, number[]>>('src/data/learnsets.json');
  const evolutions = readJson<Record<string, RawEvolution[]>>('src/data/evolutions.json');
  const species = readJson<Record<string, { g?: string }>>('src/data/species.json');

  const all = Object.values(pokemon).sort((a, b) => a.i - b.i);
  const byId = new Map(all.map(e => [e.i, e]));
  const sortedBst = all.map(e => e.b).sort((a, b) => a - b);

  // Invert the evolution map once: every page needs "evolves from", and
  // scanning 1,307 evolution lists per page would be 1.7M comparisons.
  const evolvesFrom = new Map<number, RawEntry[]>();
  for (const [fromId, list] of Object.entries(evolutions)) {
    const parent = byId.get(Number(fromId));
    if (!parent) continue;
    for (const step of list) {
      const arr = evolvesFrom.get(step.id) ?? [];
      arr.push(parent);
      evolvesFrom.set(step.id, arr);
    }
  }

  const urls: SitemapUrl[] = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    { path: '/pokemon', priority: '0.9', changefreq: 'monthly' },
    { path: '/type', priority: '0.9', changefreq: 'monthly' },
  ];

  // ---- species pages -------------------------------------------------
  for (const entry of all) {
    write(outDir, `pokemon/${entry.n}/index.html`, speciesPage({
      entry,
      all,
      sortedBst,
      learnset: learnsets[String(entry.i)],
      moves,
      evolvesTo: evolutions[String(entry.i)],
      evolvesFrom: evolvesFrom.get(entry.i) ?? [],
      byId,
    }));
    // Forms are genuine pages but rank behind their base species, and a flat
    // priority across 1,307 URLs tells a crawler nothing about where to start.
    urls.push({
      path: `/pokemon/${entry.n}`,
      priority: entry.sp === undefined ? '0.7' : '0.5',
      changefreq: 'monthly',
    });
  }

  // ---- type pages ----------------------------------------------------
  const counts = new Map<PokemonType, number>();
  for (const t of TYPES) {
    const members = all.filter(e => typesOf(e).includes(t));
    counts.set(t, members.length);
    write(outDir, `type/${t}/index.html`, typePage(typeFacts(t), members));
    urls.push({ path: `/type/${t}`, priority: '0.8', changefreq: 'monthly' });
  }
  write(outDir, 'type/index.html', typeIndexPage(counts));

  // ---- hubs ----------------------------------------------------------
  const groups = GEN_ORDER.map(g => ({
    label: GEN_LABELS[g],
    entries: all.filter(e => (species[String(e.sp ?? e.i)]?.g ?? '') === g),
  })).filter(g => g.entries.length > 0);
  const grouped = new Set(groups.flatMap(g => g.entries.map(e => e.i)));
  const ungrouped = all.filter(e => !grouped.has(e.i));
  if (ungrouped.length) groups.push({ label: 'Other forms', entries: ungrouped });
  write(outDir, 'pokemon/index.html', speciesIndexPage(groups));

  // ---- sitemap -------------------------------------------------------
  urls.push({ path: '/legal', priority: '0.3', changefreq: 'yearly' });
  urls.push({ path: '/dmca', priority: '0.3', changefreq: 'yearly' });
  const lastmod = new Date().toISOString().slice(0, 10);
  write(outDir, 'sitemap.xml', sitemap(urls, lastmod));

  return urls.length;
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const outFlag = process.argv.indexOf('--out');
  const outDir = outFlag >= 0 && process.argv[outFlag + 1]
    ? process.argv[outFlag + 1]
    : join(ROOT, 'dist');
  const count = main(outDir);
  console.log(`✓ SEO pages → ${outDir} (${count} URLs in sitemap.xml)`);
}
