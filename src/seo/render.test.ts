import { describe, it, expect } from 'vitest';
import pokemonRaw from '@/data/pokemon-data.json';
import movesRaw from '@/data/moves.json';
import learnsetsRaw from '@/data/learnsets.json';
import evolutionsRaw from '@/data/evolutions.json';
import { TYPES } from '../lib/constants';
import type { PokemonType } from '../lib/types';
import { typeFacts, typesOf, SITE_ORIGIN } from './data';
import type { RawEntry, RawEvolution, RawMove } from './data';
import {
  contrastRatio, escapeHtml, jsonLd, pillColors, relativeLuminance, sitemap,
  speciesIndexPage, speciesPage, typeIndexPage, typePage,
} from './render';

const ALL: RawEntry[] = Object.values(pokemonRaw as unknown as Record<string, RawEntry>)
  .sort((a, b) => a.i - b.i);
const MOVES = movesRaw as unknown as Record<string, RawMove>;
const LEARNSETS = learnsetsRaw as unknown as Record<string, number[]>;
const EVOS = evolutionsRaw as unknown as Record<string, RawEvolution[]>;

const BY_ID = new Map(ALL.map(e => [e.i, e]));
const SORTED_BST = ALL.map(e => e.b).sort((a, b) => a - b);

function render(entry: RawEntry): string {
  return speciesPage({
    entry,
    all: ALL,
    sortedBst: SORTED_BST,
    learnset: LEARNSETS[String(entry.i)],
    moves: MOVES,
    evolvesTo: EVOS[String(entry.i)],
    evolvesFrom: [],
    byId: BY_ID,
  });
}

const byName = (n: string) => {
  const e = ALL.find(x => x.n === n);
  if (!e) throw new Error(`no entry ${n}`);
  return e;
};

describe('escapeHtml', () => {
  it('neutralises every character that can break out of markup', () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`))
      .toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
  });

  it('escapes the ampersand first so entities are not double-broken', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });
});

describe('jsonLd', () => {
  it('escapes the sequence that would close the script element early', () => {
    // `</script>` inside a JSON-LD payload terminates the block regardless of
    // JSON quoting — the parser is the HTML tokenizer, not JSON.
    const out = jsonLd({ a: '</script><img onerror=alert(1)>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out)).toEqual({ a: '</script><img onerror=alert(1)>' });
  });
});

describe('speciesPage — full sweep', () => {
  // Bulk generation fails silently: one bad branch prints `undefined` on 1,307
  // pages and nothing errors. Every page is rendered here and checked for the
  // structural invariants a crawler actually cares about.
  const pages = ALL.map(e => [e, render(e)] as const);

  it('renders every one of the entries without a template leak', () => {
    expect(pages).toHaveLength(1307);
    for (const [e, html] of pages) {
      expect(html, e.n).not.toMatch(/undefined|NaN|\[object Object\]|\$\{/);
    }
  });

  it('gives every page exactly one h1, one title and one canonical', () => {
    for (const [e, html] of pages) {
      expect(html.match(/<h1[\s>]/g) ?? [], e.n).toHaveLength(1);
      expect(html.match(/<title>/g) ?? [], e.n).toHaveLength(1);
      expect(html.match(/rel="canonical"/g) ?? [], e.n).toHaveLength(1);
      expect(html, e.n).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/pokemon/${e.n}">`);
    }
  });

  it('keeps every meta description inside the length search engines render', () => {
    for (const [e, html] of pages) {
      const m = html.match(/<meta name="description" content="([^"]*)">/);
      expect(m, e.n).toBeTruthy();
      const len = m![1].length;
      expect(len, `${e.n} (${len})`).toBeGreaterThan(70);
      expect(len, `${e.n} (${len})`).toBeLessThan(340);
    }
  });

  it('emits valid, parseable structured data on every page', () => {
    for (const [e, html] of pages) {
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      expect(blocks.length, e.n).toBe(2);
      const types = blocks.map(b => JSON.parse(b[1].replace(/\\u003c/g, '<'))['@type']);
      expect(types, e.n).toEqual(['BreadcrumbList', 'FAQPage']);
    }
  });

  it('links only to paths this generator actually emits', () => {
    const known = new Set<string>([
      // /journey is a real SPA route (public/_redirects rewrites it to the
      // app shell) — the species pages cross-sell Journey Mode into it.
      '/', '/pokemon', '/type', '/legal', '/dmca', '/journey',
      ...ALL.map(e => `/pokemon/${e.n}`),
      ...TYPES.map(t => `/type/${t}`),
    ]);
    for (const [e, html] of pages) {
      for (const m of html.matchAll(/href="(\/[^"]*)"/g)) {
        const href = m[1].split('?')[0];
        expect(known.has(href) || href === '/favicon.svg', `${e.n} → ${href}`).toBe(true);
      }
    }
  });

  it('always offers a way into the app', () => {
    for (const [e, html] of pages) {
      expect(html, e.n).toContain(`href="/?q=${encodeURIComponent(e.d)}"`);
    }
  });

  it('carries the trademark disclaimer on every page', () => {
    for (const [e, html] of pages) {
      expect(html, e.n).toContain('unaffiliated with and not');
      expect(html, e.n).toContain('Nintendo, Creatures Inc. and GAME FREAK inc.');
    }
  });

  it('never emits an external request', () => {
    // These pages must render on a cold connection with nothing to fetch, and
    // hotlinking third-party artwork onto 1,307 indexed pages is a materially
    // different IP posture than referencing it inside the tool.
    for (const [e, html] of pages) {
      const body = html.slice(html.indexOf('<body>'));
      expect(body.match(/src="https?:/g) ?? [], e.n).toHaveLength(0);
      expect(body.match(/<img /g) ?? [], e.n).toHaveLength(0);
      expect(body.match(/<script/g) ?? [], e.n).toHaveLength(0);
    }
  });

  it('renders the sections a species page is for', () => {
    const html = render(byName('gengar'));
    expect(html).toContain('What Gengar is weak to');
    expect(html).toContain('Gengar base stats');
    expect(html).toContain('Pokémon that counter Gengar');
    expect(html).toContain('Common questions');
    // Ghost/Poison has no 4x weakness, so the 4x row must be absent rather
    // than rendered empty — the multiplier rows are conditional.
    expect(html).toContain('2× damage');
    expect(html).not.toContain('4× damage');
    expect(render(byName('charizard'))).toContain('4× damage');
  });

  it('labels a form with its base species number and form category', () => {
    const html = render(byName('charizard-mega-x'));
    expect(html).toContain('#0006 · mega form');
    expect(render(byName('charizard'))).toContain('#0006</span>');
  });

  it('links a form back to its base species and vice versa', () => {
    expect(render(byName('charizard'))).toContain('href="/pokemon/charizard-mega-x"');
    expect(render(byName('charizard-mega-x'))).toContain('href="/pokemon/charizard"');
  });

  it('renders the evolution line with the method that triggers it', () => {
    const html = render(byName('bulbasaur'));
    expect(html).toContain('href="/pokemon/ivysaur"');
    expect(html).toContain('at level 16');
  });
});

describe('typePage', () => {
  it('renders all 18 cleanly, Normal included', () => {
    for (const t of TYPES as PokemonType[]) {
      const members = ALL.filter(e => typesOf(e).includes(t));
      const html = typePage(typeFacts(t), members);
      expect(html, t).not.toMatch(/undefined|NaN|\[object Object\]|\$\{/);
      expect(html.match(/<h1[\s>]/g) ?? [], t).toHaveLength(1);
      expect(html, t).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/type/${t}">`);
    }
  });

  it('lists every base-form member of the type, strongest first', () => {
    const members = ALL.filter(e => typesOf(e).includes('dragon'));
    const html = typePage(typeFacts('dragon'), members);
    const listed = [...html.matchAll(/href="\/pokemon\/([a-z0-9-]+)"/g)].map(m => m[1]);
    for (const m of members.filter(e => e.sp === undefined)) {
      expect(listed, m.n).toContain(m.n);
    }
  });
});

describe('typeIndexPage', () => {
  const counts = new Map(TYPES.map(t => [t, ALL.filter(e => typesOf(e).includes(t)).length]));
  const html = typeIndexPage(counts as Map<PokemonType, number>);

  it('renders an 18-column grid with a row per attacking type', () => {
    const rows = html.match(/<tr><th>[A-Z][a-z]+<\/th>/g) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(18);
    expect(html).toContain('ATK \\ DEF');
  });

  it('links to all 18 type pages', () => {
    for (const t of TYPES) expect(html).toContain(`href="/type/${t}"`);
  });
});

describe('speciesIndexPage', () => {
  it('links every entry so no page is an orphan', () => {
    const html = speciesIndexPage([{ label: 'All', entries: ALL }]);
    const linked = new Set([...html.matchAll(/href="\/pokemon\/([a-z0-9-]+)"/g)].map(m => m[1]));
    for (const e of ALL) expect(linked.has(e.n), e.n).toBe(true);
  });
});

describe('sitemap', () => {
  it('emits well-formed XML with absolute URLs', () => {
    const xml = sitemap([
      { path: '/', priority: '1.0', changefreq: 'weekly' },
      { path: '/pokemon/gengar', priority: '0.7', changefreq: 'monthly' },
    ], '2026-09-06');
    expect(xml).toContain('<loc>https://trainerscodex.com/pokemon/gengar</loc>');
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml.match(/<\/url>/g)).toHaveLength(2);
    expect(xml).toContain('<lastmod>2026-09-06</lastmod>');
  });

  it('stays under the 50,000-URL limit for a single sitemap file', () => {
    // 1,307 species + 18 types + 5 hub/legal pages. If the dataset ever grows
    // past 50,000 this has to become a sitemap index.
    expect(ALL.length + TYPES.length + 5).toBeLessThan(50_000);
  });
});

describe('stylesheet accessibility', () => {
  // Lighthouse scored the generated pages 83 (gengar) / 91 (ghost) on
  // accessibility: --faint was 4.26:1, the type pills 2.5-3.6:1, links were
  // distinguished by colour alone and `.cell .t` rendered at 9.6px. Every one
  // of those is a property of the single inline stylesheet, so they are
  // pinned here rather than by re-running Lighthouse.
  const html = render(byName('gengar'));
  const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
  const vars = Object.fromEntries(
    [...css.matchAll(/--([a-z]+):(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]),
  ) as Record<string, string>;

  // Independent reference implementation of the WCAG 2.x formula, so a bug in
  // render.ts's copy cannot vouch for itself.
  function wcagContrast(fg: string, bg: string): number {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [a, b] = [lum(fg), lum(bg)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  it('exposes the palette the checks below depend on', () => {
    for (const k of ['bg', 'panel', 'ink', 'dim', 'faint', 'gold']) expect(vars[k], k).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('agrees with the reference WCAG formula', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 6);
    for (const [fg, bg] of [['#7f7361', '#0c0a08'], ['#e62829', '#ffffff'], ['#f4ae3c', '#0c0a08']]) {
      expect(contrastRatio(fg, bg)).toBeCloseTo(wcagContrast(fg, bg), 6);
    }
  });

  it('keeps every text colour at >= 4.5:1 on both surfaces it sits on', () => {
    // Multiplier colours live in .cell (panel) and the type chart (page bg).
    const mults = Object.fromEntries(
      [...css.matchAll(/\.(m[420hq]|m1)\{color:(#[0-9a-f]{6})\}/g)].map(m => [m[1], m[2]]),
    );
    expect(Object.keys(mults).sort()).toEqual(['m0', 'm1', 'm2', 'm4', 'mh', 'mq']);
    const inks = { ...mults, ink: vars.ink, dim: vars.dim, faint: vars.faint, gold: vars.gold };
    for (const [name, fg] of Object.entries(inks)) {
      for (const surface of ['bg', 'panel'] as const) {
        const ratio = wcagContrast(fg, vars[surface]);
        expect(ratio, `${name} ${fg} on --${surface} ${vars[surface]} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('picks a pill ink that meets AA against every one of the 18 type colours', () => {
    for (const t of TYPES as PokemonType[]) {
      const { bg, fg } = pillColors(t);
      const ratio = wcagContrast(fg, bg);
      expect(ratio, `${t}: ${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      expect(bg).toMatch(/^#[0-9a-f]{6}$/);
    }
    // The dark ink is the default; light ink only where the colour needs it.
    expect(pillColors('electric').fg).toBe('#0c0a08');
    expect(pillColors('ghost').fg).toBe('#ffffff');
    // And the rendered page carries the chosen pair, not the old fixed ink.
    expect(html).toContain(`style="background:${pillColors('ghost').bg};color:#ffffff"`);
    expect(css).not.toMatch(/\.pill\{[^}]*color:#0c0a08/);
  });

  it('never sets a font size below 10px (0.625rem)', () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)(rem|px|em)/g)];
    expect(sizes.length).toBeGreaterThan(10);
    for (const [decl, n, unit] of sizes) {
      const px = unit === 'px' ? Number(n) : Number(n) * 16;
      expect(px, decl).toBeGreaterThanOrEqual(10);
    }
  });

  it('underlines links that sit inside running text', () => {
    expect(css).toMatch(/(^|[,\n])p a[^{]*\{text-decoration:underline\}/);
  });
});
