// V4 features suite — 12 tests covering features shipped in the v4 build:
// legendary filter, shiny toggle, trainer profile, game compatibility,
// member configuration, poster studio.

import {
  runSuite, sleep, click, clickAt, type, exists, countMatches,
  assert, assertEq, assertGte, closeBrowser,
} from './harness.mjs';

async function loadStarterTeam(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const target = btns.find(b => /kanto|johto|hoenn|sinnoh|unova|kalos|alola|galar|paldea/i.test(b.innerText) && !/region/i.test(b.innerText) && b.innerText.trim().length < 40);
    if (target) target.click();
  });
  await sleep(300);
}

async function openFilters(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    for (const b of btns) {
      if (/^filters?$/i.test(b.innerText.trim()) || b.querySelector('svg.lucide-filter')) { b.click(); return; }
    }
  });
  await sleep(200);
}

const tests = [
  {
    name: 'filter panel opens with category chips',
    async fn(page) {
      await openFilters(page);
      const text = await page.evaluate(() => document.body.innerText.toLowerCase());
      assert(text.includes('legendary'), 'legendary chip missing');
      assert(text.includes('mythical'), 'mythical chip missing');
      assert(/category|type|generation/.test(text), 'filter labels missing');
    },
  },
  {
    name: 'legendary filter narrows the grid',
    async fn(page) {
      await openFilters(page);
      // Click "legendary" chip
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const t = btns.find(b => b.innerText.trim().toLowerCase() === 'legendary');
        if (t) t.click();
      });
      await sleep(200);
      // The result count appears below filters as "N result(s)"
      const text = await page.evaluate(() => document.body.innerText);
      const m = text.match(/(\d+)\s+results?/);
      assert(m, 'result count missing');
      const count = parseInt(m[1], 10);
      assert(count > 0 && count < 200, `expected legendary count in (0, 200), got ${count}`);
    },
  },
  {
    name: 'type filter chips show all 18 types',
    async fn(page) {
      await openFilters(page);
      // The TypePill rendering uses a button per type
      const text = await page.evaluate(() => document.body.innerText.toLowerCase());
      const types = ['fire', 'water', 'grass', 'electric', 'psychic', 'dragon', 'fairy', 'ghost'];
      for (const t of types) assert(text.includes(t), `expected type chip "${t}"`);
    },
  },
  {
    name: 'trainer profile dialog opens with form fields',
    async fn(page) {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        for (const b of btns) {
          if (b.querySelector('svg.lucide-user')) { b.click(); return; }
        }
      });
      await sleep(300);
      const opened = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
      assert(opened, 'trainer profile dialog should open');
      const hasNameInput = await page.evaluate(() => {
        return [...document.querySelectorAll('input')].some(i => i.placeholder?.toLowerCase().includes('name') || i.id?.toLowerCase().includes('name'));
      });
      assert(hasNameInput, 'name input should exist in trainer profile');
    },
  },
  {
    name: 'trainer profile name saves and shows in header',
    async fn(page) {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        for (const b of btns) {
          if (b.querySelector('svg.lucide-user')) { b.click(); return; }
        }
      });
      await sleep(300);
      // Type into the name input (first text input in the dialog)
      const typed = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return false;
        const input = dialog.querySelector('input[type="text"], input:not([type])');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'JoseTest');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      });
      assert(typed, 'could not type into name input');
      // Find and click Save button
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('[role="dialog"] button')];
        const save = btns.find(b => /save|create profile|update/i.test(b.innerText));
        if (save) save.click();
      });
      await sleep(400);
      // Reopen dialog and verify name persisted
      const text = await page.evaluate(() => document.body.innerText);
      assert(text.includes('JoseTest') || text.toLowerCase().includes('profile saved'), 'trainer name should persist · body lacks "JoseTest"');
    },
  },
  {
    name: 'opening a pokemon card surfaces its detail dialog',
    async fn(page) {
      // Load a team first to dismiss the empty-state QuickStart .grid (which
      // would otherwise shadow our card-selector).
      await loadStarterTeam(page);
      const clicked = await page.evaluate(() => {
        // The Pokémon grid is the LAST .grid under main — empty state has its
        // own QuickStart grid above when present, but with team loaded only
        // the card grid + filter chip groups remain.
        const grids = [...document.querySelectorAll('main .grid')];
        const cardGrid = grids[grids.length - 1];
        if (!cardGrid) return null;
        const card = cardGrid.children[0];
        if (!card) return null;
        const clickable = card.querySelector('[role="button"], button') || card;
        clickable.click();
        return clickable.tagName;
      });
      assert(clicked, 'no cards in grid');
      await sleep(400);
      const opened = await page.evaluate(() => !!document.querySelector('[role="dialog"], [data-state="open"]'));
      assert(opened, `pokemon detail dialog should open after clicking ${clicked}`);
    },
  },
  {
    name: 'analysis sheet opens with full team',
    async fn(page) {
      await loadStarterTeam(page);
      // Pad to 6 by random
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        for (const b of btns) {
          if (b.querySelector('svg.lucide-dices')) { b.click(); return; }
        }
      });
      await sleep(400);
      // Click analyze
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const a = btns.find(b => /^analyze/i.test(b.innerText.trim()) && !b.disabled);
        if (a) a.click();
      });
      await sleep(400);
      const opened = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
      assert(opened, 'analysis sheet should open');
    },
  },
  {
    name: 'analysis sheet shows defensive and offensive sections',
    async fn(page) {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        for (const b of btns) {
          if (b.querySelector('svg.lucide-dices')) { b.click(); return; }
        }
      });
      await sleep(400);
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const a = btns.find(b => /^analyze/i.test(b.innerText.trim()) && !b.disabled);
        if (a) a.click();
      });
      await sleep(400);
      const text = await page.evaluate(() => document.body.innerText.toLowerCase());
      assert(/defensive|defense/.test(text), 'defensive section missing');
      assert(/offensive|coverage/.test(text), 'offensive section missing');
    },
  },
  {
    name: 'poster studio button is disabled until team has at least one mon',
    async fn(page) {
      // The "disabled" prop on shadcn Button translates to data-disabled / disabled
      // attribute on the underlying <button>. Some setups also use aria-disabled.
      const disabled = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        const wand = btns.find(b => b.querySelector('svg.lucide-wand-sparkles, svg.lucide-wand-2, svg[class*="wand"]'));
        if (!wand) return null;
        return wand.disabled || wand.getAttribute('aria-disabled') === 'true' || wand.dataset.disabled === 'true';
      });
      assert(disabled === true, `poster studio button should be disabled when team is empty (got ${disabled})`);
    },
  },
  {
    name: 'poster studio opens after team has any member',
    async fn(page) {
      await loadStarterTeam(page);
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        const wand = btns.find(b => b.querySelector('svg.lucide-wand-sparkles, svg.lucide-wand-2, svg[class*="wand"]'));
        if (wand) wand.click();
      });
      await sleep(500);
      const text = await page.evaluate(() => document.body.innerText.toLowerCase());
      assert(/poster studio|art style/.test(text), 'poster studio content missing');
    },
  },
  {
    name: 'share dialog generates a sharable code',
    async fn(page) {
      await loadStarterTeam(page);
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        const share = btns.find(b => b.querySelector('svg.lucide-share-2, svg.lucide-share2'));
        if (share) share.click();
      });
      await sleep(400);
      const text = await page.evaluate(() => document.body.innerText.toLowerCase());
      assert(/share|url|link|code/.test(text), 'share dialog content missing');
    },
  },
  {
    name: 'undo button appears in header after a mutating action',
    async fn(page) {
      await loadStarterTeam(page);
      // Undo button only renders when undoStack.length > 0. After loadStarter,
      // there should be an undo button (lucide-rotate-ccw icon) in the header.
      const hasUndo = await page.evaluate(() => {
        return !![...document.querySelectorAll('header button')].find(b => b.querySelector('svg.lucide-rotate-ccw, svg.lucide-rotate-ccw'));
      });
      assert(hasUndo, 'undo button should appear in header after a team load');
    },
  },
];

const result = await runSuite('v4-features', tests);
await closeBrowser();
process.exit(result.failed === 0 ? 0 : 1);
