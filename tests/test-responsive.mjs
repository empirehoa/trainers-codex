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
  // ---- Tablet ---------------------------------------------------------
  // The suite used to stop at 430px. Every tablet width therefore fell into the
  // "desktop" branch untested, which is exactly where the header's 15-control
  // cluster is tightest: at 768px it measures 705px against 63px of slack.
  ...[[768, 1024, 'iPad portrait'], [820, 1180, 'iPad Air portrait'], [1024, 768, 'iPad landscape']]
    .map(([w, h, label]) => ({
      name: `no horizontal overflow at ${w}px (${label})`,
      fn: async (page) => {
        await reflow(page, w, h);
        const o = await docOverflow(page);
        assert(o <= 1, `horizontal overflow ${o}px at ${w}px — the header cluster no longer fits`);
      },
    })),

  {
    // The regression this guards actually shipped: a 60-word intro plus 20
    // always-expanded preset chips put the first Pokémon card at 1,022px on a
    // 390px phone — 1.2 screens of scrolling before the app showed what it is.
    name: 'phone: the grid starts within the first screen',
    fn: async (page) => {
      await reflow(page, 390, 844);
      await page.waitForSelector('[data-testid^="fav-"]', { timeout: 15_000 });
      const y = await page.evaluate(() => {
        const first = document.querySelector('[data-testid^="fav-"]');
        const card = first.closest('div[class*="rounded"]') || first.parentElement;
        return Math.round(card.getBoundingClientRect().top + window.scrollY);
      });
      assert(y < 844, `first card sits at ${y}px, below the 844px fold`);
    },
  },

  {
    name: 'phone: the search field gets a full-width row of its own',
    fn: async (page) => {
      await reflow(page, 390, 844);
      const w = await page.evaluate(() => {
        const el = [...document.querySelectorAll('input')]
          .find(i => (i.placeholder || '').includes('search by name'));
        return el ? Math.round(el.getBoundingClientRect().width) : 0;
      });
      // Sharing a row with the filter and sort controls left it ~150px, which
      // clipped the placeholder mid-word.
      assertGte(w, 300, `search field is only ${w}px wide at 390px`);
    },
  },

  {
    name: 'phone: presets collapse behind one tap, and open on demand',
    fn: async (page) => {
      await reflow(page, 390, 844);
      const collapsed = await page.evaluate(() =>
        [...document.querySelectorAll('button')].filter(b => /Kanto Classic|Pseudo-Legendaries/.test(b.textContent || '') && b.offsetParent !== null).length);
      assert(collapsed === 0, `expected preset chips hidden on a phone, found ${collapsed} visible`);
      await clickAt(page, '[data-testid="toggle-presets"]');
      await sleep(150);
      const opened = await page.evaluate(() =>
        [...document.querySelectorAll('button')].filter(b => /Kanto Classic|Pseudo-Legendaries/.test(b.textContent || '') && b.offsetParent !== null).length);
      assertGte(opened, 2, 'preset chips did not appear after tapping the disclosure');
    },
  },

  {
    name: 'tablet: presets are open without a tap from 640px up',
    fn: async (page) => {
      await reflow(page, 820, 1180);
      const visible = await page.evaluate(() =>
        [...document.querySelectorAll('button')].filter(b => /Kanto Classic/.test(b.textContent || '') && b.offsetParent !== null).length);
      assertGte(visible, 1, 'preset chips should render inline at 820px with no disclosure');
    },
  },

  {
    // Journey Mode is the app's most engaging feature and was its least
    // reachable one on a phone: the header collapses to two buttons under
    // 640px, so a run started with "More actions" then a hunt through a
    // 12-item menu. It now has a first-screen entry point.
    name: 'phone: Journey Mode is one tap from the first screen',
    fn: async (page) => {
      await reflow(page, 390, 844);
      const cta = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="journey-open-hero"]');
        if (!el || el.offsetParent === null) return null;
        const r = el.getBoundingClientRect();
        return { y: Math.round(r.top + window.scrollY), h: Math.round(r.height) };
      });
      assert(cta, 'no Journey Mode entry point in the empty state');
      assert(cta.y < 844, `Journey CTA sits at ${cta.y}px, below the fold`);
      assertGte(cta.h, 44, `Journey CTA is only ${cta.h}px tall — under the touch minimum`);
      await clickAt(page, '[data-testid="journey-open-hero"]');
      await sleep(400);
      const opened = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        return d ? { fits: d.getBoundingClientRect().width <= window.innerWidth + 1,
                     text: (d.innerText || '').slice(0, 60) } : null;
      });
      assert(opened, 'Journey dialog did not open from the hero CTA');
      assert(opened.fits, 'Journey dialog overflows a 390px viewport');
      assert(/journey/i.test(opened.text), `unexpected dialog content: ${opened.text}`);
    },
  },

  {
    // Growing the header's icon buttons for touch stole width from the
    // wordmark, which shrank to "tr…" with the version line wrapping to three
    // rows at 820px. The overflow assertions all still passed — the header
    // absorbed the pressure by collapsing rather than scrolling — so this
    // checks the brand actually renders.
    name: 'tablet: the wordmark still fits beside the touch-sized toolbar',
    fn: async (page) => {
      for (const [w, h] of [[768, 1024], [820, 1180], [1024, 768]]) {
        await reflow(page, w, h);
        const brand = await page.evaluate(() => {
          const el = document.querySelector('header h1');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
                   w: Math.round(r.width), h: Math.round(r.height),
                   clipped: el.scrollWidth > el.clientWidth + 1 };
        });
        assert(brand, `no wordmark at ${w}px`);
        assert(!brand.clipped, `wordmark clipped at ${w}px (${brand.text})`);
        assert(/trainer.s codex/i.test(brand.text), `wordmark reads "${brand.text}" at ${w}px`);
        // Two lines is the wrap budget; three means the row has given up.
        assert(brand.h < 60, `wordmark is ${brand.h}px tall at ${w}px — it has wrapped`);
      }
    },
  },

  {
    // The Type Chart's 18-column table sized the dialog instead of scrolling
    // inside it: 608px wide on a 390px phone, title and legend clipped
    // off-screen. Measured on the dialog itself (gotcha 39).
    name: 'phone: the type chart dialog scrolls its table instead of growing past the viewport',
    fn: async (page) => {
      await reflow(page, 390, 844);
      await clickAt(page, '[data-testid="more-actions"]');
      await sleep(300);
      const item = await page.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"]')].find(m => /type chart/i.test(m.textContent)));
      const box = await item.boundingBox();
      assert(box, 'Type chart menu item not found');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
      await sleep(400);
      const o = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        const r = d.getBoundingClientRect();
        return { s: d.scrollWidth, c: d.clientWidth, right: Math.round(r.right), inner: window.innerWidth };
      });
      assert(o.s <= o.c + 1, `type chart dialog overflows sideways: scrollWidth ${o.s} vs clientWidth ${o.c}`);
      assert(o.right <= o.inner + 1, `type chart dialog extends to ${o.right}px on a ${o.inner}px viewport`);
    },
  },

  {
    name: 'no text renders below the 10px floor the style guide sets',
    fn: async (page) => {
      await reflow(page, 390, 844);
      const tiny = await page.evaluate(() => {
        const out = new Set();
        for (const el of document.querySelectorAll('body *')) {
          if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs && fs < 10) out.add(`${el.tagName}@${fs}px`);
        }
        return [...out];
      });
      assert(tiny.length === 0, `text below 10px: ${tiny.join(', ')}`);
    },
  },
];

const r = await runSuite('responsive', tests);
await closeBrowser();
process.exit(r.failed ? 1 : 0);
