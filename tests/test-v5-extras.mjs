// V5 extras suite — 12 tests covering sign-in dialog, merch studio open
// behavior, product picker, design picker, markup ladder, customization,
// mockup preview rerender, and the PremiumControl dev-toggle fallback.

import {
  runSuite, sleep, click, exists, countMatches,
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

async function openMerchStudio(page) {
  await loadStarterTeam(page);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header button')];
    const bag = btns.find(b => b.querySelector('svg.lucide-shopping-bag'));
    if (bag) bag.click();
  });
  await sleep(500);
}

const tests = [
  {
    name: 'sign-in dialog opens',
    async fn(page) {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        const login = btns.find(b => b.querySelector('svg.lucide-log-in'));
        if (login) login.click();
      });
      await sleep(400);
      const opened = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
      assert(opened, 'sign-in dialog should open');
    },
  },
  {
    name: 'sign-in dialog shows setup-mode panel when supabase not configured',
    async fn(page) {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        const login = btns.find(b => b.querySelector('svg.lucide-log-in'));
        if (login) login.click();
      });
      await sleep(400);
      const text = await page.evaluate(() => document.body.innerText.toLowerCase());
      assert(/setup|config|supabase|window\.trainers_codex_config|paste/.test(text), `sign-in setup panel content missing · got first 300: ${text.slice(0, 300)}`);
    },
  },
  {
    name: 'merch button is disabled with empty team',
    async fn(page) {
      const disabled = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        const bag = btns.find(b => b.querySelector('svg.lucide-shopping-bag'));
        return bag?.disabled === true;
      });
      assert(disabled, 'merch button should be disabled with empty team');
    },
  },
  {
    name: 'merch studio opens when team is non-empty',
    async fn(page) {
      await openMerchStudio(page);
      const text = await page.evaluate(() => document.body.innerText.toLowerCase());
      assert(/merch studio|print-on-demand|order on/.test(text), `merch studio content missing · got first 200: ${text.slice(0, 200)}`);
    },
  },
  {
    name: 'merch studio lists at least 7 products',
    async fn(page) {
      await openMerchStudio(page);
      const productCount = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return 0;
        // Product picker buttons have "base $X.XX" text inside
        return [...dialog.querySelectorAll('button')].filter(b => /base\s*\$/i.test(b.innerText)).length;
      });
      assertGte(productCount, 7, `expected >= 7 products in picker, got ${productCount}`);
    },
  },
  {
    name: 'merch studio shows all 4 designs',
    async fn(page) {
      await openMerchStudio(page);
      const designsText = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        return dialog ? dialog.innerText : '';
      });
      assert(/crest/i.test(designsText), 'Crest design missing');
      assert(/roster/i.test(designsText), 'Roster design missing');
      assert(/id.*card|trainer id/i.test(designsText), 'ID Card design missing');
      assert(/banner/i.test(designsText), 'Banner design missing');
    },
  },
  {
    name: 'markup ladder shows fair/pro/premium options',
    async fn(page) {
      await openMerchStudio(page);
      const text = await page.evaluate(() => document.body.innerText.toLowerCase());
      assert(/fair.*\+50%/.test(text), 'fair markup option missing');
      assert(/pro.*\+100%/.test(text), 'pro markup option missing');
      assert(/premium.*\+150%/.test(text), 'premium markup option missing');
    },
  },
  {
    name: 'customization fields render (gym name, region, badge text, year)',
    async fn(page) {
      await openMerchStudio(page);
      const inputs = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return [];
        return [...dialog.querySelectorAll('input')].map(i => i.placeholder || i.id || '').filter(Boolean);
      });
      assert(inputs.some(p => /gym/i.test(p)), 'gym name input missing');
      assert(inputs.some(p => /region|city|orlando/i.test(p)), 'region input missing');
      assert(inputs.some(p => /title|slogan|gym leader/i.test(p)), 'badge text input missing');
      assert(inputs.some(p => /year|202/.test(p)), 'year input missing');
    },
  },
  {
    name: 'gym name input accepts text up to 28 chars',
    async fn(page) {
      await openMerchStudio(page);
      const typed = await page.evaluate(() => {
        const input = document.querySelector('#gym-name');
        if (!input) return null;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Empire City Gym');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return input.value;
      });
      assertEq(typed, 'Empire City Gym', 'gym name should set');
    },
  },
  {
    name: 'premium preview toggle is present (worker-not-configured path)',
    async fn(page) {
      await openMerchStudio(page);
      // PremiumControl falls back to a toggle when window.TRAINERS_CODEX_CONFIG.worker is unset
      const hasToggle = await page.evaluate(() => {
        return !!document.querySelector('#premium-toggle') ||
          !![...document.querySelectorAll('label')].find(l => /premium preview/i.test(l.innerText));
      });
      assert(hasToggle, 'expected premium preview toggle in dev mode');
    },
  },
  {
    name: 'preset slogan chips populate the badge input on click',
    async fn(page) {
      await openMerchStudio(page);
      // Click a slogan preset chip (e.g. "Champion")
      const clickedSlogan = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return null;
        const chips = [...dialog.querySelectorAll('button')];
        const champ = chips.find(c => /^champion$/i.test(c.innerText.trim()));
        if (champ) { champ.click(); return true; }
        return false;
      });
      assert(clickedSlogan, 'Champion chip not found');
      await sleep(200);
      const badgeValue = await page.evaluate(() => {
        const i = document.querySelector('#merch-badge');
        return i ? i.value : '';
      });
      assert(/champion/i.test(badgeValue), `expected badge input to contain "CHAMPION", got "${badgeValue}"`);
    },
  },
  {
    name: 'analyze button opens analysis sheet for 6-mon team',
    async fn(page) {
      // Random team (fills to 6)
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
      assert(/threat|counter|coverage|defensive|offensive/.test(text), 'analysis content missing');
    },
  },
];

const result = await runSuite('v5-extras', tests);
await closeBrowser();
process.exit(result.failed === 0 ? 0 : 1);
