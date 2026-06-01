// Captures launch-grade hero screenshots from the live site for use in:
//   - Reddit posts (r/stunfisk, r/pokemon, r/PokemonChampions)
//   - Product Hunt listing
//   - Hacker News Show HN thread image
//   - Twitter / X 8-tweet thread
//   - Wolfey VGC cold-email attachment
//
// Output: /Users/jrrclaw/projects/trainers-codex/deploy/screenshots/hero-*.png
//
// Run: node tests/capture-hero-shots.mjs

import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { join } from 'path';

const LIVE = 'https://trainerscodex.com';
const OUT = '/Users/jrrclaw/projects/trainers-codex/deploy/screenshots';
mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();
  await page.goto(LIVE, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('header h1', { timeout: 10000 });

  // ---- Hero 1: cleaned-up empty state (dark) ----
  await wait(800);
  await page.screenshot({ path: join(OUT, 'hero-01-empty-dark.png'), fullPage: false });
  console.log('  ✓ hero-01-empty-dark.png');

  // ---- Hero 2: cleaned-up empty state (light) ----
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header button')].find(b => b.querySelector('svg.lucide-sun, svg.lucide-moon'));
    btn?.click();
  });
  await wait(450);
  await page.screenshot({ path: join(OUT, 'hero-02-empty-light.png'), fullPage: false });
  console.log('  ✓ hero-02-empty-light.png');

  // Flip back to dark for the rest
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header button')].find(b => b.querySelector('svg.lucide-sun, svg.lucide-moon'));
    btn?.click();
  });
  await wait(450);

  // ---- Hero 3: random team built (dark) ----
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header button')];
    const dice = btns.find(b => b.querySelector('svg.lucide-dices'));
    dice?.click();
  });
  await wait(700);
  await page.screenshot({ path: join(OUT, 'hero-03-team-built-dark.png'), fullPage: false });
  console.log('  ✓ hero-03-team-built-dark.png');

  // ---- Hero 4: team built (light) ----
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header button')].find(b => b.querySelector('svg.lucide-sun, svg.lucide-moon'));
    btn?.click();
  });
  await wait(450);
  await page.screenshot({ path: join(OUT, 'hero-04-team-built-light.png'), fullPage: false });
  console.log('  ✓ hero-04-team-built-light.png');

  // back to dark
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header button')].find(b => b.querySelector('svg.lucide-sun, svg.lucide-moon'));
    btn?.click();
  });
  await wait(450);

  // ---- Hero 5: analysis side-sheet open ----
  // Trigger analysis sheet — usually opens via a button or by clicking a slot
  try {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      // Look for "analyze" labels or shield icons
      const analyzeBtn = btns.find(b => /analy[sz]e/i.test(b.innerText || '') || b.querySelector('svg.lucide-shield, svg.lucide-shield-half, svg.lucide-shield-check'));
      analyzeBtn?.click();
    });
    await wait(600);
    await page.screenshot({ path: join(OUT, 'hero-05-analysis-sheet.png'), fullPage: false });
    console.log('  ✓ hero-05-analysis-sheet.png');
    await page.keyboard.press('Escape');
    await wait(300);
  } catch (e) { console.log('  ✗ analysis sheet:', e.message); }

  // ---- Hero 6: Poster Studio (Wand2) ----
  try {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('header button')];
      const wand = btns.find(b => b.querySelector('svg.lucide-wand-sparkles, svg.lucide-wand2'));
      wand?.click();
    });
    await wait(900);
    await page.screenshot({ path: join(OUT, 'hero-06-poster-studio.png'), fullPage: false });
    console.log('  ✓ hero-06-poster-studio.png');
    await page.keyboard.press('Escape');
    await wait(300);
  } catch (e) { console.log('  ✗ poster studio:', e.message); }

  // ---- Hero 7: Merch Studio (shopping-bag icon) ----
  try {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('header button')];
      const bag = btns.find(b => b.querySelector('svg.lucide-shopping-bag'));
      bag?.click();
    });
    await wait(900);
    await page.screenshot({ path: join(OUT, 'hero-07-merch-studio.png'), fullPage: false });
    console.log('  ✓ hero-07-merch-studio.png');

    // Also capture trainer-card design tab
    try {
      await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('[role="tab"], button')];
        const trainerTab = tabs.find(t => /trainer card/i.test(t.innerText || ''));
        trainerTab?.click();
      });
      await wait(500);
      await page.screenshot({ path: join(OUT, 'hero-08-trainer-card-design.png'), fullPage: false });
      console.log('  ✓ hero-08-trainer-card-design.png');
    } catch (e) { console.log('  ✗ trainer card tab:', e.message); }
    await page.keyboard.press('Escape');
    await wait(300);
  } catch (e) { console.log('  ✗ merch studio:', e.message); }

  // ---- Hero 9: AI Studio dialog (Sparkles icon) ----
  try {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('header button')];
      const ai = btns.find(b => b.querySelector('svg.lucide-sparkles'));
      ai?.click();
    });
    await wait(700);
    await page.screenshot({ path: join(OUT, 'hero-09-ai-studio.png'), fullPage: false });
    console.log('  ✓ hero-09-ai-studio.png');
    await page.keyboard.press('Escape');
    await wait(300);
  } catch (e) { console.log('  ✗ ai studio:', e.message); }

  // ---- Hero 10: Sign-in dialog (cloud or log-in icon) ----
  try {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('header button')];
      const login = btns.find(b => b.querySelector('svg.lucide-log-in, svg.lucide-cloud, svg.lucide-cloud-cog'));
      login?.click();
    });
    await wait(700);
    await page.screenshot({ path: join(OUT, 'hero-10-sign-in.png'), fullPage: false });
    console.log('  ✓ hero-10-sign-in.png');
    await page.keyboard.press('Escape');
    await wait(300);
  } catch (e) { console.log('  ✗ sign-in:', e.message); }

  // ---- Hero 11: Mobile view (375 px wide, iPhone 13) ----
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });
    await page.reload({ waitUntil: 'networkidle2' });
    await wait(700);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('header button')];
      const dice = btns.find(b => b.querySelector('svg.lucide-dices'));
      dice?.click();
    });
    await wait(700);
    await page.screenshot({ path: join(OUT, 'hero-11-mobile.png'), fullPage: false });
    console.log('  ✓ hero-11-mobile.png');
  } catch (e) { console.log('  ✗ mobile:', e.message); }

  await browser.close();
  console.log('\n✓ Hero screenshots saved to', OUT);
}

main().catch(e => { console.error(e); process.exit(2); });
