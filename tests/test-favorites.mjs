// Favourites suite.
//
// Favouriting is trivial to render and easy to get wrong in two specific ways,
// both covered here: the star must not also open the detail dialog (it sits
// inside a card whose body is itself a button), and the set must survive a
// reload (it is persisted through StorageShape, which had no `favorites` field
// before and defaults it on load rather than bumping the schema version).

import {
  runSuite, sleep, exists, countMatches, innerText, assert, assertGte, closeBrowser, newPage,
} from './harness.mjs';

/** The category chips live in the filter panel, which is collapsed on load. */
async function openFilters(page) {
  await page.waitForSelector('[data-testid="toggle-filters"]', { timeout: 8000 });
  const open = await page.evaluate(() => !!document.querySelector('[data-testid="cat-favorites"]'));
  if (!open) {
    await page.evaluate(() => document.querySelector('[data-testid="toggle-filters"]').click());
    await page.waitForSelector('[data-testid="cat-favorites"]', { timeout: 8000 });
  }
}

/** Star the first N cards in the grid, returning the ids starred. */
async function starFirst(page, n) {
  return page.evaluate((count) => {
    const btns = [...document.querySelectorAll('[data-testid^="fav-"]')].slice(0, count);
    const ids = [];
    for (const b of btns) {
      b.click();
      ids.push(b.getAttribute('data-testid'));
    }
    return ids;
  }, n);
}

const tests = [
  {
    name: 'every grid card offers a favourite toggle',
    async fn(page) {
      await page.waitForSelector('[data-testid^="fav-"]', { timeout: 8000 });
      const stars = await countMatches(page, '[data-testid^="fav-"]');
      assertGte(stars, 24, `expected a star on each card, found ${stars}`);
    },
  },

  {
    name: 'starring a card marks it favourited without opening the detail dialog',
    async fn(page) {
      await page.waitForSelector('[data-testid^="fav-"]', { timeout: 8000 });
      const id = await page.evaluate(() => {
        const b = document.querySelector('[data-testid^="fav-"]');
        b.click();
        return b.getAttribute('data-testid');
      });
      await sleep(120);
      const state = await page.evaluate((sel) =>
        document.querySelector(`[data-testid="${sel}"]`)?.getAttribute('data-favorite'), id);
      assert(state === 'true', `card should be favourited, got data-favorite=${state}`);
      // The star lives inside a card whose body is a select button. If it were
      // nested, this click would also have opened the Pokémon dialog.
      const dialog = await exists(page, '[role="dialog"]');
      assert(!dialog, 'starring a card must not open the detail dialog');
    },
  },

  {
    name: 'the favourites filter narrows the grid to exactly what was starred',
    async fn(page) {
      await page.waitForSelector('[data-testid^="fav-"]', { timeout: 8000 });
      await starFirst(page, 3);
      await sleep(120);
      await openFilters(page);
      await page.evaluate(() => document.querySelector('[data-testid="cat-favorites"]').click());
      await sleep(200);
      const shown = await countMatches(page, '[data-testid^="fav-"]');
      assert(shown === 3, `favourites filter should show exactly 3 cards, got ${shown}`);
      const allStarred = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="fav-"]')]
          .every(el => el.getAttribute('data-favorite') === 'true'));
      assert(allStarred, 'every card under the favourites filter should be starred');
    },
  },

  {
    name: 'the chip reports how many are favourited',
    async fn(page) {
      await page.waitForSelector('[data-testid^="fav-"]', { timeout: 8000 });
      await starFirst(page, 2);
      await sleep(150);
      await openFilters(page);
      const label = await innerText(page, '[data-testid="cat-favorites"]');
      assert(/2/.test(label), `chip should report the count, got "${label}"`);
    },
  },

  {
    name: 'un-starring removes it from favourites',
    async fn(page) {
      await page.waitForSelector('[data-testid^="fav-"]', { timeout: 8000 });
      const id = (await starFirst(page, 1))[0];
      await sleep(120);
      await page.evaluate((sel) => document.querySelector(`[data-testid="${sel}"]`).click(), id);
      await sleep(120);
      const state = await page.evaluate((sel) =>
        document.querySelector(`[data-testid="${sel}"]`)?.getAttribute('data-favorite'), id);
      assert(state === 'false', `un-starred card should not be favourited, got ${state}`);
      await openFilters(page);
      const label = await innerText(page, '[data-testid="cat-favorites"]');
      assert(!/\(\d+\)/.test(label), `chip should drop the count at zero, got "${label}"`);
    },
  },

  {
    name: 'favourites survive a reload',
    async fn(page) {
      await page.waitForSelector('[data-testid^="fav-"]', { timeout: 8000 });
      const ids = await starFirst(page, 2);
      await sleep(250); // let the persist effect run
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid^="fav-"]', { timeout: 8000 });
      await sleep(250);
      for (const id of ids) {
        const state = await page.evaluate((sel) =>
          document.querySelector(`[data-testid="${sel}"]`)?.getAttribute('data-favorite'), id);
        assert(state === 'true', `${id} should still be favourited after reload, got ${state}`);
      }
    },
  },

  {
    name: 'a store with no favourites field loads clean rather than throwing',
    ownPage: true,
    async fn() {
      // Every payload written before this feature has no `favorites` key.
      // loadStorage defaults it instead of bumping the schema version, so an
      // old store must come back with an empty set and a working chip.
      const page = await newPage();
      await page.evaluate(() => {
        localStorage.setItem('trainerscodex.v2', JSON.stringify({
          teams: [], current: null, trainer: null,
        }));
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openFilters(page);
      const label = await innerText(page, '[data-testid="cat-favorites"]');
      assert(!/\(\d+\)/.test(label), `legacy store should yield no favourites, got "${label}"`);
      await page.close();
    },
  },
];

const result = await runSuite('favorites', tests);
await closeBrowser();
process.exit(result.failed > 0 ? 1 : 0);
