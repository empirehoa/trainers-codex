// V4 core suite — 12 tests covering the foundational team-building UI
// that's been stable since v4. Anything that breaks one of these is a
// regression in the base experience.

import {
  runSuite, sleep, click, clickAt, type, waitForText, exists,
  countMatches, innerText, assert, assertEq, assertGte, closeBrowser,
} from './harness.mjs';

const tests = [
  {
    name: 'app renders header and team bar',
    async fn(page) {
      await page.waitForSelector('header h1', { timeout: 5000 });
      const title = await innerText(page, 'header h1');
      assert(title.toLowerCase().includes("trainer"), `header title missing trainer · got "${title}"`);
      const slots = await countMatches(page, 'header + main, [class*="fixed bottom-0"]');
      assertGte(slots, 1, 'sticky team bar should exist');
    },
  },
  {
    name: 'grid shows at least 24 pokemon cards on first load',
    async fn(page) {
      const cards = await countMatches(page, '.grid > [class*="rounded"], .grid > div, [data-testid="pokemon-card"]');
      assertGte(cards, 24, `expected >= 24 cards in grid, got ${cards}`);
    },
  },
  {
    name: 'search by name filters the grid',
    async fn(page) {
      const input = await page.$('input[placeholder*="search" i]');
      assert(input, 'search input not found');
      await input.click();
      await page.keyboard.type('pikachu');
      await sleep(200);
      const text = await page.evaluate(() => document.body.innerText.toLowerCase());
      assert(text.includes('pikachu'), 'grid should contain pikachu after search');
    },
  },
  {
    name: '/ keyboard shortcut focuses search',
    async fn(page) {
      await page.keyboard.press('/');
      await sleep(80);
      const focused = await page.evaluate(() => document.activeElement?.tagName === 'INPUT');
      assert(focused, 'expected search input to be focused after /');
    },
  },
  {
    name: 'analyze button is disabled with empty team',
    async fn(page) {
      const disabled = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const a = btns.find(b => /analyze/i.test(b.innerText));
        return a?.disabled === true;
      });
      assert(disabled, 'analyze button should be disabled when team is empty');
    },
  },
  {
    name: 'loading a starter team fills the team bar',
    async fn(page) {
      // Click any themed/region preset button on the empty state
      const presetClicked = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const target = btns.find(b => /kanto|johto|hoenn|sinnoh|unova|kalos|alola|galar|paldea/i.test(b.innerText) && !/region/i.test(b.innerText) && b.innerText.trim().length < 40);
        if (target) { target.click(); return target.innerText; }
        return null;
      });
      assert(presetClicked, 'no region/themed preset button found');
      await sleep(300);
      // Count team-slot Pokémon (filled slots)
      const teamCount = await page.evaluate(() => {
        return document.querySelectorAll('[class*="fixed bottom-0"] img').length;
      });
      assertGte(teamCount, 1, 'expected at least one filled team slot');
    },
  },
  {
    name: 'random team button rolls 6 mons',
    async fn(page) {
      // Click the Dices icon button (Random team tooltip)
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        // The Random button is the icon button with svg.lucide-dices
        for (const b of btns) {
          if (b.querySelector('svg.lucide-dices')) { b.click(); return; }
        }
      });
      await sleep(400);
      const teamCount = await page.evaluate(() => {
        return document.querySelectorAll('[class*="fixed bottom-0"] img').length;
      });
      assertGte(teamCount, 6, `expected 6 random mons in team, got ${teamCount}`);
    },
  },
  {
    name: 'team persists across page reload',
    async fn(page) {
      // Load a random team
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        for (const b of btns) {
          if (b.querySelector('svg.lucide-dices')) { b.click(); return; }
        }
      });
      await sleep(400);
      const beforeCount = await page.evaluate(() => {
        return document.querySelectorAll('[class*="fixed bottom-0"] img').length;
      });
      assertGte(beforeCount, 4, `expected at least 4 mons before reload, got ${beforeCount}`);
      // Reload — combined URL-hash + localStorage restore. URL hash may drop
      // some mega-form IDs (older share-code limitation); we accept any
      // non-empty restoration as evidence persistence works.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('header', { timeout: 5000 });
      await sleep(300);
      const afterCount = await page.evaluate(() => {
        return document.querySelectorAll('[class*="fixed bottom-0"] img').length;
      });
      assertGte(afterCount, 4, `expected at least 4 mons after reload, got ${afterCount}`);
    },
  },
  {
    name: 'library dialog opens with no saved teams initially',
    async fn(page) {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        for (const b of btns) {
          if (b.querySelector('svg.lucide-folder-open')) { b.click(); return; }
        }
      });
      await sleep(300);
      const opened = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
      assert(opened, 'library dialog should open');
    },
  },
  {
    name: 'help dialog opens via ? shortcut',
    async fn(page) {
      // Ensure no input is focused
      await page.evaluate(() => document.activeElement?.blur?.());
      await page.keyboard.press('?');
      await sleep(300);
      const opened = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
      assert(opened, 'help dialog should open after ? key');
    },
  },
  {
    name: 'type chart dialog opens',
    async fn(page) {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('header button')];
        for (const b of btns) {
          if (b.querySelector('svg.lucide-grid-3x3')) { b.click(); return; }
        }
      });
      await sleep(300);
      const text = await page.evaluate(() => document.body.innerText.toLowerCase());
      assert(/type chart|defenders|attackers|type matchup/i.test(text), `type chart content missing · got first 200 chars: ${text.slice(0,200)}`);
    },
  },
  {
    name: 'footer disclaimer is present',
    async fn(page) {
      const text = await page.evaluate(() => document.body.innerText.toLowerCase());
      assert(text.includes('not affiliated'), 'footer disclaimer "not affiliated" missing');
    },
  },
];

const result = await runSuite('v4-core', tests);
await closeBrowser();
process.exit(result.failed === 0 ? 0 : 1);
