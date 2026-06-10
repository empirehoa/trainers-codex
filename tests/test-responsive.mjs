// Responsive regression suite. Guards the mobile header against the
// horizontal-overflow bug (13 inline icon buttons blew past phone widths).
// At <640px the toolbar collapses into a "More" menu; at >=640px the full
// icon row renders inline. Verifies both, plus no horizontal page scroll on
// the common phone widths.
import { runSuite, sleep, clickAt, assert, assertGte, closeBrowser } from './harness.mjs';

async function reflow(page, w, h) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 10_000 });
  await sleep(220);
}

const docOverflow = (page) => page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);

const tests = [
  {
    name: 'no horizontal page overflow at 360px (iPhone SE)',
    fn: async (page) => {
      await reflow(page, 360, 780);
      const o = await docOverflow(page);
      assert(o <= 1, `horizontal overflow ${o}px at 360px (should be 0)`);
    },
  },
  {
    name: 'no horizontal page overflow at 390px (iPhone 14)',
    fn: async (page) => {
      await reflow(page, 390, 844);
      const o = await docOverflow(page);
      assert(o <= 1, `horizontal overflow ${o}px at 390px (should be 0)`);
    },
  },
  {
    name: 'no horizontal page overflow at 412px (Pixel 7)',
    fn: async (page) => {
      await reflow(page, 412, 915);
      const o = await docOverflow(page);
      assert(o <= 1, `horizontal overflow ${o}px at 412px (should be 0)`);
    },
  },
  {
    name: 'mobile: header collapses to a "More" menu (<= 3 inline buttons)',
    fn: async (page) => {
      await reflow(page, 360, 780);
      const visible = await page.evaluate(() =>
        [...document.querySelectorAll('header button')].filter(b => b.offsetParent !== null).length);
      assert(visible <= 3, `expected <=3 visible header buttons on mobile, got ${visible}`);
      const hasMore = await page.evaluate(() =>
        !!document.querySelector('header button[aria-label="More actions"]'));
      assert(hasMore, 'mobile "More actions" trigger not found');
    },
  },
  {
    name: 'mobile: More menu opens with all core actions',
    fn: async (page) => {
      await reflow(page, 360, 780);
      await clickAt(page, 'header button[aria-label="More actions"]');
      await sleep(400);
      const info = await page.evaluate(() => {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) return null;
        const r = menu.getBoundingClientRect();
        const labels = [...menu.querySelectorAll('[role="menuitem"]')].map(i => i.innerText.trim());
        return { fits: r.right <= window.innerWidth + 1 && r.left >= -1, labels };
      });
      assert(info, 'More menu did not open');
      assert(info.fits, 'More menu overflows the viewport');
      for (const want of ['AI Studio', 'Poster studio', 'Merch studio', 'Share team', 'Library', 'Type chart', 'Help']) {
        assert(info.labels.some(l => l.includes(want)), `menu missing action: ${want}`);
      }
    },
  },
  {
    name: 'desktop: full icon toolbar renders inline at 1280px',
    fn: async (page) => {
      await reflow(page, 1280, 900);
      const visible = await page.evaluate(() =>
        [...document.querySelectorAll('header button')].filter(b => b.offsetParent !== null).length);
      assertGte(visible, 10, `expected the full inline toolbar at 1280px, got ${visible} buttons`);
      // The key feature triggers must be present + queryable for other suites.
      const hasTriggers = await page.evaluate(() => {
        const h = document.querySelector('header');
        return ['lucide-sparkles', 'lucide-shopping-bag', 'lucide-wand-sparkles', 'lucide-share-2']
          .every(c => !!h.querySelector(`svg.${c}`));
      });
      assert(hasTriggers, 'desktop toolbar missing one of the expected feature triggers');
    },
  },
];

const r = await runSuite('responsive', tests);
await closeBrowser();
process.exit(r.failed ? 1 : 0);
