// Static reference pages + the `?q=` bridge back into the app.
//
// Two halves, both genuinely browser-scoped:
//
//   1. The generated pages under dist/pokemon and dist/type must RENDER — the
//      vitest sweep in src/seo/render.test.ts checks their markup as strings,
//      which cannot catch a page that parses into a broken DOM or throws.
//   2. `?q=` must actually seed the builder's search box. That is the entire
//      conversion path from a search result into the product; if it silently
//      stops working, 1,300 pages keep ranking and send everyone to an
//      unfiltered grid of 1,307 cards.
//
// The pages are read from dist/, so this suite requires `pnpm build` to have
// run — same precondition the rest of the runner has on bundle.html.

import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  runSuite, sleep, assert, assertGte, closeBrowser, newPage,
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');

function pageUrl(rel) {
  return `file://${resolve(DIST, rel)}`;
}

/** Navigate an already-open page to a generated file and wait for its shell. */
async function openStatic(page, rel) {
  const path = resolve(DIST, rel);
  assert(existsSync(path), `missing generated page: ${rel} — run \`pnpm build\` first`);
  await page.goto(pageUrl(rel), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 15_000 });
}

const tests = [
  {
    name: 'a generated species page renders its headings and matchup data',
    async fn(page) {
      await openStatic(page, 'pokemon/gengar/index.html');
      const text = await page.evaluate(() => document.body.innerText);
      assert(/Gengar/.test(text), 'species name missing from the rendered page');
      assert(/base stats/i.test(text), 'base stats section missing');
      assert(/weak to/i.test(text), 'weakness section missing');
      assert(/counter/i.test(text), 'counters section missing');
      // 18 matchup cells for the defensive grid and 18 for the offensive one.
      const cells = await page.evaluate(() => document.querySelectorAll('.grid18 .cell').length);
      assert(cells === 36, `expected 36 matchup cells, got ${cells}`);
    },
  },

  {
    name: 'a species page renders with no script of any kind',
    async fn(page) {
      await openStatic(page, 'pokemon/charizard/index.html');
      const scripts = await page.evaluate(
        () => [...document.querySelectorAll('script')].filter(s => s.type !== 'application/ld+json').length,
      );
      assert(scripts === 0, `reference pages must ship no executable script, found ${scripts}`);
      assert(!page.__pageErrors, 'page threw during render');
    },
  },

  {
    name: 'structured data parses as JSON in a real browser',
    async fn(page) {
      await openStatic(page, 'pokemon/charizard/index.html');
      const types = await page.evaluate(() =>
        [...document.querySelectorAll('script[type="application/ld+json"]')]
          .map(s => JSON.parse(s.textContent)['@type']));
      assert(JSON.stringify(types) === JSON.stringify(['BreadcrumbList', 'FAQPage']),
        `unexpected structured data: ${JSON.stringify(types)}`);
    },
  },

  {
    name: 'base stat bars actually paint at a width proportional to the stat',
    async fn(page) {
      // These are spans; `height:100%` on an inline box is ignored, so the
      // first cut rendered six invisible bars over a full-width empty track.
      // A string assertion cannot see that — only layout can.
      await openStatic(page, 'pokemon/charizard/index.html');
      const bars = await page.evaluate(() => [...document.querySelectorAll('.bar-fill')]
        .map(el => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        }));
      assert(bars.length === 6, `expected 6 stat bars, got ${bars.length}`);
      for (const b of bars) {
        assert(b.h > 0, 'stat bar has zero height — the fill is not painting');
        assert(b.w > 0, 'stat bar has zero width');
      }
      // Charizard's Sp. Atk (109) is its highest stat, so that bar is the
      // widest and HP (78) is strictly narrower.
      assert(bars[3].w > bars[0].w, 'bars are not proportional to the stat');
    },
  },

  {
    name: 'the type chart page renders a full 18-column grid',
    async fn(page) {
      await openStatic(page, 'type/index.html');
      const cols = await page.evaluate(() =>
        document.querySelector('.chart thead tr').children.length);
      // 18 defending types plus the row-label column.
      assert(cols === 19, `expected 19 header cells, got ${cols}`);
      const rows = await page.evaluate(() =>
        document.querySelectorAll('.chart tbody tr').length);
      assert(rows === 18, `expected 18 attacking rows, got ${rows}`);
    },
  },

  {
    name: 'the species hub links every generated page',
    async fn(page) {
      await openStatic(page, 'pokemon/index.html');
      const links = await page.evaluate(() =>
        document.querySelectorAll('a[href^="/pokemon/"]').length);
      assertGte(links, 1307, `hub links ${links} pages, expected all 1307`);
    },
  },

  {
    name: 'reference pages are readable on a 360px viewport without sideways scroll',
    async fn(page) {
      await page.setViewport({ width: 360, height: 780 });
      await openStatic(page, 'pokemon/charizard/index.html');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflow <= 1, `page scrolls ${overflow}px horizontally at 360px wide`);
    },
  },

  {
    name: '?q= seeds the builder search box',
    async fn(page) {
      // `page` here is already the bundle; reload it with the param the
      // reference pages link to.
      const seeded = await newPage({ query: 'q=Gengar' });
      try {
        await sleep(400);
        const value = await seeded.evaluate(() => {
          const el = [...document.querySelectorAll('input')]
            .find(i => (i.placeholder || '').includes('search by name'));
          return el ? el.value : null;
        });
        assert(value === 'Gengar', `search box holds ${JSON.stringify(value)}, expected "Gengar"`);
      } finally {
        await seeded.close();
      }
    },
  },

  {
    name: '?q= actually filters the grid down',
    async fn(page) {
      const seeded = await newPage({ query: 'q=Gengar' });
      try {
        await sleep(500);
        const text = await seeded.evaluate(() => document.body.innerText);
        assert(/Gengar/i.test(text), 'filtered grid does not show the requested Pokémon');
        // The unfiltered grid mounts a 240-card window; a single-name search
        // must land far below that.
        const cards = await seeded.evaluate(
          () => document.querySelectorAll('[data-testid^="fav-"]').length);
        assert(cards > 0 && cards < 20, `expected a narrow result set, got ${cards} cards`);
      } finally {
        await seeded.close();
      }
    },
  },

  {
    name: 'a percent-encoded multi-word ?q= round-trips',
    async fn(page) {
      const seeded = await newPage({ query: 'q=Charizard%20Mega%20X' });
      try {
        await sleep(400);
        const value = await seeded.evaluate(() => {
          const el = [...document.querySelectorAll('input')]
            .find(i => (i.placeholder || '').includes('search by name'));
          return el ? el.value : null;
        });
        assert(value === 'Charizard Mega X', `got ${JSON.stringify(value)}`);
      } finally {
        await seeded.close();
      }
    },
  },

  {
    name: 'an empty or absent ?q= leaves the app exactly as it was',
    async fn(page) {
      const value = await page.evaluate(() => {
        const el = [...document.querySelectorAll('input')]
          .find(i => (i.placeholder || '').includes('search by name'));
        return el ? el.value : null;
      });
      assert(value === '', `unfiltered load should have an empty search box, got ${JSON.stringify(value)}`);
      assert(!page.__pageErrors, 'app threw on a plain load');
    },
  },
];

await runSuite('SEO reference pages', tests);
await closeBrowser();
