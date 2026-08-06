// Boot benchmark: time from navigation start to (a) header mounted, (b) grid
// cards present, (c) main-thread quiet. Runs each bundle N times, reports median.
import puppeteer from 'puppeteer';
import { pathToFileURL } from 'url';

const RUNS = 5;
const targets = {
  baseline: '/tmp/bundle-baseline.html',
  optimized: process.env.HOME + '/trainers-codex/bundle.html',
};

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1280, height: 900 },
});

async function bench(file) {
  const out = [];
  for (let i = 0; i < RUNS; i++) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', r => {
      const u = r.url();
      (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) ? r.continue() : r.abort();
    });
    const t0 = Date.now();
    await page.goto(pathToFileURL(file).href, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('header', { timeout: 60000 });
    const tHeader = Date.now() - t0;
    await page.waitForFunction(() => document.querySelectorAll('main .grid > div').length > 10, { timeout: 60000 });
    const tGrid = Date.now() - t0;
    const cards = await page.evaluate(() => document.querySelectorAll('main .grid > div').length);
    const heap = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1);
    out.push({ tHeader, tGrid, cards, heap });
    await page.close();
  }
  return out;
}

const median = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const [name, file] of Object.entries(targets)) {
  const runs = await bench(file);
  console.log(name, JSON.stringify({
    header_ms_median: median(runs.map(r => r.tHeader)),
    grid_ms_median: median(runs.map(r => r.tGrid)),
    dom_cards: runs[0].cards,
    js_heap_mb_median: median(runs.map(r => r.heap)),
    all: runs.map(r => r.tGrid),
  }));
}
await browser.close();
