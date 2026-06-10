// Shared Puppeteer harness for Trainer's Codex tests.
//
// Each test file imports `runSuite(suiteName, tests)` and registers an array
// of named test functions. The harness:
//   - launches headless Chromium once per process,
//   - loads bundle.html from file:// for each test (full isolation),
//   - times each test, prints a single-line summary, and exits non-zero on
//     any failure.
//
// Tests interact with the DOM via Puppeteer page methods. Where Radix UI
// requires real mouse events (per CLAUDE.md gotcha #1), use `clickAt(page, sel)`
// which falls back to a coordinate click.

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(__dirname, '..', 'bundle.html');
const BUNDLE_URL = `file://${BUNDLE_PATH}`;

let _browser = null;

async function getBrowser() {
  if (_browser) return _browser;
  _browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 900 },
  });
  return _browser;
}

export async function newPage() {
  const browser = await getBrowser();
  // Each test gets its own isolated browser context so localStorage, cookies,
  // and session state can't bleed between tests. This is the puppeteer
  // equivalent of "one fresh incognito window per test".
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.__context = context;

  page.on('pageerror', (err) => {
    console.error('  [pageerror]', err.message);
    page.__pageErrors = (page.__pageErrors || 0) + 1;
  });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
      req.continue();
    } else {
      req.abort('failed');
    }
  });

  await page.goto(BUNDLE_URL, { waitUntil: 'domcontentloaded' });
  // The inlined bundle is ~1.7MB of JS; under CPU contention (the full runner
  // launches a fresh context per test across 14 suites) the React mount can
  // take well past 10s, which previously caused intermittent "Waiting for
  // selector `header`" failures. A generous ceiling keeps the runner
  // deterministic without masking a genuinely broken bundle (which never
  // mounts `header` at all).
  await page.waitForSelector('header', { timeout: 45_000 });
  await sleep(120);
  return page;
}

export async function closePage(page) {
  if (!page) return;
  const ctx = page.__context;
  await page.close();
  if (ctx) await ctx.close();
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Click using real mouse coordinates — required for Radix UI components
 * whose internals don't respond to `element.click()` inside page.evaluate.
 */
export async function clickAt(page, selector) {
  const el = await page.$(selector);
  if (!el) throw new Error(`element not found: ${selector}`);
  const box = await el.boundingBox();
  if (!box) throw new Error(`element has no box: ${selector}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Click via the standard puppeteer .click() — works for native elements. */
export async function click(page, selector) {
  const el = await page.$(selector);
  if (!el) throw new Error(`element not found: ${selector}`);
  await el.click();
}

export async function type(page, selector, text) {
  await click(page, selector);
  await page.keyboard.type(text);
}

export async function waitForText(page, text, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const content = await page.evaluate(() => document.body.innerText);
    if (content.includes(text)) return true;
    await sleep(80);
  }
  throw new Error(`text not found within ${timeoutMs}ms: ${text}`);
}

export async function exists(page, selector) {
  return (await page.$(selector)) !== null;
}

export async function countMatches(page, selector) {
  return (await page.$$(selector)).length;
}

export async function innerText(page, selector) {
  return await page.$eval(selector, (el) => el.innerText);
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export function assertGte(actual, min, msg) {
  if (actual < min) throw new Error(`${msg}: expected >= ${min}, got ${actual}`);
}

/**
 * Run a suite of named tests. Each test receives a fresh page.
 * Prints a per-test line and a suite summary.
 * Returns { passed, failed, results } so the suite runner can aggregate.
 */
export async function runSuite(suiteName, tests) {
  console.log(`\n━━━ ${suiteName} ━━━ (${tests.length} tests)`);
  let passed = 0;
  let failed = 0;
  const results = [];

  for (const t of tests) {
    const start = Date.now();
    let page = null;
    try {
      page = await newPage();
      await t.fn(page);
      // Fail the test if any unhandled page errors occurred during execution.
      if (page.__pageErrors) {
        throw new Error(`${page.__pageErrors} page error(s) during test`);
      }
      const ms = Date.now() - start;
      console.log(`  ✓ ${t.name}  (${ms}ms)`);
      passed++;
      results.push({ name: t.name, status: 'pass', ms });
    } catch (e) {
      const ms = Date.now() - start;
      console.log(`  ✗ ${t.name}  (${ms}ms)  → ${e.message}`);
      failed++;
      results.push({ name: t.name, status: 'fail', ms, error: e.message });
    } finally {
      if (page) await closePage(page);
    }
  }

  console.log(`  ${passed}/${tests.length} passed${failed ? ` · ${failed} failed` : ''}`);
  return { passed, failed, results, suite: suiteName };
}
