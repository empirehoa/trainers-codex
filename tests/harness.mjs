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
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(__dirname, '..', 'bundle.html');
const BUNDLE_URL = `file://${BUNDLE_PATH}`;

let _browser = null;

/**
 * Locate a Chromium binary.
 *
 * Puppeteer normally downloads its own during install, but that postinstall
 * script is skipped in sandboxes and CI images that pre-provision a browser
 * instead. PUPPETEER_EXECUTABLE_PATH is honoured first, then the common
 * pre-provisioned locations, and finally we hand back undefined so puppeteer
 * falls back to its bundled download (and produces its own clear error if
 * that's missing too).
 */
function resolveExecutablePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  // Also accept any versioned chromium under the Playwright browser root.
  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const v of ['chromium']) {
    const guess = join(pwRoot, v, 'chrome-linux', 'chrome');
    if (existsSync(guess)) return guess;
  }
  return undefined;
}

export function chromiumPath() {
  return resolveExecutablePath();
}

async function getBrowser() {
  if (_browser) return _browser;
  const executablePath = resolveExecutablePath();
  _browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 900 },
    ...(executablePath ? { executablePath } : {}),
  });
  return _browser;
}

/**
 * Fresh page on bundle.html.
 *
 * @param {object} [opts]
 * @param {string} [opts.query]     Query string appended to the file:// URL,
 *                                  e.g. 'seed=8843'. file:// preserves the
 *                                  query string, so deep-link parsing can be
 *                                  exercised without a server.
 * @param {{width:number,height:number}} [opts.viewport] Viewport override, for
 *                                  the 360px mobile-layout assertions.
 * @param {object} [opts.config]    window.TRAINERS_CODEX_CONFIG to install
 *                                  BEFORE the bundle runs (evaluateOnNewDocument),
 *                                  e.g. `{ worker: { url: 'https://api.example.test' } }`
 *                                  — the only way to exercise boot-time code
 *                                  paths (license bootstrap, unlock gating) as a
 *                                  Worker-backed deploy. Setting the global after
 *                                  boot only reaches render-time reads.
 * @param {Record<string,string>} [opts.storage] localStorage entries seeded
 *                                  before boot (saves, flags, licenses).
 * @param {(req: import('puppeteer').HTTPRequest) => boolean} [opts.onRequest]
 *                                  Runs before the default network block for
 *                                  every request. Return true after calling
 *                                  `req.respond(...)` / `req.continue()` to
 *                                  take the request over; anything else falls
 *                                  through to the block. This is how a test
 *                                  observes a cross-origin POST body: the
 *                                  browser sends a CORS preflight first, and a
 *                                  blocked preflight means the POST never
 *                                  leaves the page.
 * @param {number} [opts.timezone]  Unused placeholder kept out on purpose —
 *                                  timezone shifts are emulated per-test via
 *                                  page.emulateTimezone.
 */
export async function newPage(opts = {}) {
  const browser = await getBrowser();
  // Each test gets its own isolated browser context so localStorage, cookies,
  // and session state can't bleed between tests. This is the puppeteer
  // equivalent of "one fresh incognito window per test".
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.__context = context;
  if (opts.viewport) await page.setViewport(opts.viewport);

  page.on('pageerror', (err) => {
    console.error('  [pageerror]', err.message);
    page.__pageErrors = (page.__pageErrors || 0) + 1;
  });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (opts.onRequest && opts.onRequest(req)) return;
    const url = req.url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
      req.continue();
    } else {
      req.abort('failed');
    }
  });

  if (opts.config || opts.storage) {
    await page.evaluateOnNewDocument((config, storage) => {
      if (config) window.TRAINERS_CODEX_CONFIG = config;
      for (const [k, v] of Object.entries(storage || {})) localStorage.setItem(k, v);
    }, opts.config ?? null, opts.storage ?? null);
  }

  const url = opts.query ? `${BUNDLE_URL}?${opts.query}` : BUNDLE_URL;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // The inlined bundle is ~1.7MB of JS; under CPU contention (the full runner
  // launches a fresh context per test across 15 suites) the React mount can
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
 *
 * A test may declare `pageOpts` ({ query, viewport }) to control how its page
 * is opened — used by the deep-link and mobile-layout tests. A test may also
 * set `ownPage: true` to skip page creation entirely and open its own pages,
 * which the multi-session determinism tests need.
 *
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
      page = t.ownPage ? null : await newPage(t.pageOpts);
      await t.fn(page);
      // Fail the test if any unhandled page errors occurred during execution.
      if (page?.__pageErrors) {
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
