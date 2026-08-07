import puppeteer from 'puppeteer';
import { chromiumPath } from './harness.mjs';
const b = await puppeteer.launch({ headless:'new', executablePath: chromiumPath(),
  args:['--no-sandbox','--disable-dev-shm-usage'], defaultViewport:{width:390,height:844} });
const p = await b.newPage();
await p.goto(process.env.TC_URL || 'file:///root/trainers-codex/bundle.html', { waitUntil:'domcontentloaded', timeout:60000 });
await p.waitForSelector('header', { timeout:45000 });
await p.evaluate(() => document.querySelector('[data-testid="journey-open"]')?.click());
await p.waitForSelector('[data-testid="journey-dialog"]', { timeout:30000 });
await p.evaluate(() => document.querySelector('[data-testid="journey-campaign-saga"]')?.click());
await new Promise(r=>setTimeout(r,300));
await p.evaluate(() => document.querySelector('[data-testid="journey-start"]')?.click());
await p.waitForSelector('[data-testid="journey-decision"]', { timeout:30000 });
await new Promise(r=>setTimeout(r,700));
console.log(JSON.stringify(await p.evaluate(() => ({
  buildId: document.documentElement.getAttribute('data-tc-build'),
  progress: document.querySelector('[data-testid="journey-progress"]')?.innerText.trim(),
  badges: document.querySelector('[data-testid="journey-badge-count"]')?.innerText.trim(),
  ante: document.querySelector('[data-testid="journey-ante"]')?.innerText.trim(),
  opponent: document.querySelector('[data-testid="journey-opponent-name"]')?.innerText.trim(),
  oppSub: document.querySelector('[data-testid="journey-opponent"]')?.innerText.split('\n')[1],
  edge: document.querySelector('[data-testid="journey-opponent-edge"]')?.innerText.trim(),
  quests: [...document.querySelectorAll('[data-testid="journey-quest-open"],[data-testid="journey-quest-done"]')].map(q=>q.innerText.replace(/\n/g,' ')).slice(0,3),
  overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
})), null, 1));
await b.close();
