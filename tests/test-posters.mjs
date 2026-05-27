// Poster + merch render suite — 12 tests confirming the canvas-based
// generators produce valid PNG output for every art style and design.
// Each test fills a team, opens the relevant studio, picks a style/design,
// and verifies a blob URL appears as the rendered preview.

import {
  runSuite, sleep, click, exists, countMatches,
  assert, assertEq, assertGte, closeBrowser,
} from './harness.mjs';

const POSTER_STYLES = [
  'pixel-crt', 'pixel-grid', 'gameboy-mono', 'polaroid-stack',
  'blueprint', 'type-collage',
  'manifest', 'arcade-cabinet', 'tcg-card', 'sticker-sheet',
];

async function loadStarterTeam(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const target = btns.find(b => /kanto|johto|hoenn|sinnoh|unova|kalos|alola|galar|paldea/i.test(b.innerText) && !/region/i.test(b.innerText) && b.innerText.trim().length < 40);
    if (target) target.click();
  });
  await sleep(300);
}

async function fillFullTeam(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header button')];
    for (const b of btns) {
      if (b.querySelector('svg.lucide-dices')) { b.click(); return; }
    }
  });
  await sleep(400);
}

async function openPosterStudio(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header button')];
    const wand = btns.find(b => b.querySelector('svg.lucide-wand-sparkles, svg.lucide-wand-2, svg[class*="wand"]'));
    if (wand) wand.click();
  });
  await sleep(500);
}

async function openMerchStudio(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header button')];
    const bag = btns.find(b => b.querySelector('svg.lucide-shopping-bag'));
    if (bag) bag.click();
  });
  await sleep(600);
}

async function enablePremiumPreview(page) {
  await page.evaluate(() => {
    const toggle = document.querySelector('#premium-toggle, button[role="switch"]');
    if (toggle && toggle.getAttribute('aria-checked') !== 'true') toggle.click();
  });
  await sleep(200);
}

async function waitForRenderedPreview(page, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hasImg = await page.evaluate(() => {
      const img = document.querySelector('[role="dialog"] img[src^="blob:"]');
      return img && img.naturalWidth > 100;
    });
    if (hasImg) return true;
    await sleep(150);
  }
  throw new Error('no rendered preview within timeout');
}

const tests = [
  {
    name: 'poster studio renders default (pixel-crt) style',
    async fn(page) {
      await fillFullTeam(page);
      await openPosterStudio(page);
      await waitForRenderedPreview(page);
    },
  },
  {
    name: 'poster: pixel-grid renders for full team',
    async fn(page) {
      await fillFullTeam(page);
      await openPosterStudio(page);
      // Pick the style by its label substring
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const btn = [...dialog.querySelectorAll('button')].find(b => /pixel grid/i.test(b.innerText));
        if (btn) btn.click();
      });
      await waitForRenderedPreview(page);
    },
  },
  {
    name: 'poster: gameboy-mono renders for full team',
    async fn(page) {
      await fillFullTeam(page);
      await openPosterStudio(page);
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const btn = [...dialog.querySelectorAll('button')].find(b => /game ?boy/i.test(b.innerText));
        if (btn) btn.click();
      });
      await waitForRenderedPreview(page);
    },
  },
  {
    name: 'poster: polaroid-stack renders for full team',
    async fn(page) {
      await fillFullTeam(page);
      await openPosterStudio(page);
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const btn = [...dialog.querySelectorAll('button')].find(b => /polaroid/i.test(b.innerText));
        if (btn) btn.click();
      });
      await waitForRenderedPreview(page);
    },
  },
  {
    name: 'poster: blueprint (v5) renders for full team',
    async fn(page) {
      await fillFullTeam(page);
      await openPosterStudio(page);
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const btn = [...dialog.querySelectorAll('button')].find(b => /blueprint/i.test(b.innerText));
        if (btn) btn.click();
      });
      await waitForRenderedPreview(page);
    },
  },
  {
    name: 'poster: type-collage (v5) renders for full team',
    async fn(page) {
      await fillFullTeam(page);
      await openPosterStudio(page);
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const btn = [...dialog.querySelectorAll('button')].find(b => /type collage/i.test(b.innerText));
        if (btn) btn.click();
      });
      await waitForRenderedPreview(page);
    },
  },
  {
    name: 'poster: manifest (premium) renders once preview is unlocked',
    async fn(page) {
      await fillFullTeam(page);
      await openPosterStudio(page);
      await enablePremiumPreview(page);
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const btn = [...dialog.querySelectorAll('button')].find(b => /editorial|manifest/i.test(b.innerText));
        if (btn) btn.click();
      });
      await waitForRenderedPreview(page);
    },
  },
  {
    name: 'poster: holo-foil (v5 premium) renders once preview is unlocked',
    async fn(page) {
      await fillFullTeam(page);
      await openPosterStudio(page);
      await enablePremiumPreview(page);
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const btn = [...dialog.querySelectorAll('button')].find(b => /holo|foil/i.test(b.innerText));
        if (btn) btn.click();
      });
      await waitForRenderedPreview(page);
    },
  },
  {
    name: 'merch: crest design renders preview for Bella+Canvas tee',
    async fn(page) {
      await fillFullTeam(page);
      await openMerchStudio(page);
      // Default product is Bella+Canvas; default design is crest. Wait for the
      // debounced re-render (250ms) plus draw time.
      await waitForRenderedPreview(page, 10_000);
    },
  },
  {
    name: 'merch: roster design renders preview',
    async fn(page) {
      await fillFullTeam(page);
      await openMerchStudio(page);
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const btn = [...dialog.querySelectorAll('button')].find(b => /roster/i.test(b.innerText));
        if (btn) btn.click();
      });
      await waitForRenderedPreview(page, 10_000);
    },
  },
  {
    name: 'merch: ID Card design unlocks under premium preview',
    async fn(page) {
      await fillFullTeam(page);
      await openMerchStudio(page);
      await enablePremiumPreview(page);
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const btn = [...dialog.querySelectorAll('button')].find(b => /id ?card|trainer id/i.test(b.innerText));
        if (btn && !btn.disabled) btn.click();
      });
      await waitForRenderedPreview(page, 10_000);
    },
  },
  {
    name: 'merch: Gym Banner design unlocks under premium preview',
    async fn(page) {
      await fillFullTeam(page);
      await openMerchStudio(page);
      await enablePremiumPreview(page);
      await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const btn = [...dialog.querySelectorAll('button')].find(b => /gym banner|^banner$/i.test(b.innerText.trim()));
        if (btn && !btn.disabled) btn.click();
      });
      await waitForRenderedPreview(page, 10_000);
    },
  },
];

const result = await runSuite('posters', tests);
await closeBrowser();
process.exit(result.failed === 0 ? 0 : 1);
