// Bundle shape gate: @smogon/calc is a lazy chunk, and the single file still
// works from file:// (LAUNCH_READINESS §6 item 1; findings E-1 / E-2 / E-16).
//
// The calc (474 KB minified) used to ride in the entry module and parse on
// every boot although only the matchup preview needs it. It now ships inside
// bundle.html as an inert <script type="text/plain" data-chunk> block that
// inline.mjs's resolver revives as a Blob-URL module on first use. These tests
// pin the three things that keep that true:
//   1. the static shape of bundle.html (one module script, ≥1 chunk block, a
//      resolver, every referenced chunk present, and no calc dex data in the
//      module script);
//   2. the CSP still allows blob: module scripts on the live origin;
//   3. at runtime on file:// with the network blocked, boot creates no Blob URL
//      and the first matchup creates exactly one — then renders real numbers.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import puppeteer from 'puppeteer';
import { runSuite, assert, assertEq, assertGte, closeBrowser, chromiumPath, sleep } from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const bundle = readFileSync(join(ROOT, 'bundle.html'), 'utf8');

// Strings that occur in @smogon/calc's dex tables / engine and nowhere in the
// app's own code or data (verified against both dist chunks when this test
// was written). If the calc ever leaks back into the entry, these appear there.
const CALC_MARKERS = ['MEGA_STONES', 'Zygarde-Complete', 'Necrozma-Ultra', 'guaranteed OHKO', 'hasOriginalType'];

const moduleScripts = [...bundle.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map(m => m[1]);
const chunkBlocks = [...bundle.matchAll(/<script type="text\/plain" data-chunk="([^"]+)">([\s\S]*?)<\/script>/g)]
  .map(m => ({ name: m[1], code: m[2] }));

const LANDO_PASTE = `Landorus-Therian @ Life Orb
Ability: Intimidate
EVs: 252 Atk / 4 Def / 252 Spe
Jolly Nature
- Earthquake
- Stone Edge`;

const tests = [
  {
    name: 'bundle.html carries one module script, the calc as a text/plain chunk, and the resolver',
    ownPage: true,
    async fn() {
      assertEq(moduleScripts.length, 1, 'exactly one <script type="module"> (the entry)');
      assertGte(chunkBlocks.length, 1, 'at least one text/plain chunk block');
      const calcChunks = chunkBlocks.filter(c => /^assets\/calc-[\w-]+\.js$/.test(c.name));
      assertEq(calcChunks.length, 1, `exactly one calc chunk; got ${chunkBlocks.map(c => c.name).join(', ')}`);
      assertGte(calcChunks[0].code.length, 300_000, 'the calc chunk should hold the whole package (≥300 KB)');
      assert(/globalThis\.__TC_CHUNK=function/.test(bundle), 'the Blob-URL resolver script is missing');
      // Every chunk the entry can request exists, and every embedded chunk is requested.
      const requested = [...moduleScripts[0].matchAll(/__TC_CHUNK\("([^"]+)"\)/g)].map(m => m[1]);
      assertGte(requested.length, 1, 'the entry never calls __TC_CHUNK');
      for (const r of requested) assert(chunkBlocks.some(c => c.name === r), `entry requests ${r} but no block carries it`);
      for (const c of chunkBlocks) assert(requested.includes(c.name), `${c.name} is embedded but never requested`);
      // No relative import literal survives the rewrite in any script.
      for (const code of [moduleScripts[0], ...chunkBlocks.map(c => c.code)]) {
        assert(!/import\((["'`])\.?\/[^)]*\)/.test(code), 'a relative dynamic import literal survived inlining');
        assert(!/^import\s*[{*\w]?[^;]*from\s*["'`]\.?\//.test(code), 'a relative static import survived inlining');
      }
      // The entry ends by publishing the helpers the chunk destructures.
      if (/__TC_SHARED/.test(calcChunks[0].code)) {
        assert(/globalThis\.__TC_SHARED=Object\.freeze\(\{/.test(moduleScripts[0]), 'chunk reads __TC_SHARED but the entry never publishes it');
      }
    },
  },
  {
    name: 'the module script carries no @smogon/calc dex data; the chunk carries all of it',
    ownPage: true,
    async fn() {
      const entry = moduleScripts[0];
      const chunk = chunkBlocks.find(c => /^assets\/calc-/.test(c.name)).code;
      for (const marker of CALC_MARKERS) {
        assert(chunk.includes(marker), `calc chunk lacks marker "${marker}" — did the marker list go stale?`);
        assert(!entry.includes(marker), `entry module contains calc marker "${marker}" — the calc is back on the boot path`);
      }
      assert(!/import\s*\{[^}]*\}\s*from\s*["'`]@smogon\/calc/.test(entry), 'a static @smogon/calc import reached the entry');
    },
  },
  {
    name: 'CSP script-src allows blob: so the chunk loads on the live origin',
    ownPage: true,
    async fn() {
      const headers = readFileSync(join(ROOT, 'public/_headers'), 'utf8');
      const line = headers.split('\n').find(l => /^\s*Content-Security-Policy:/.test(l));
      assert(line, 'public/_headers has no Content-Security-Policy');
      const scriptSrc = line.split(';').map(d => d.trim()).find(d => d.startsWith('script-src '));
      assert(scriptSrc, 'CSP has no script-src directive');
      assert(scriptSrc.split(/\s+/).includes('blob:'), `script-src must include blob: — got "${scriptSrc}"`);
    },
  },
  {
    name: 'file:// offline: boot creates no Blob URL, the first matchup creates one and renders numbers',
    ownPage: true,
    async fn() {
      // Own page so the URL.createObjectURL counter is installed BEFORE any
      // page script runs — a hook added after boot could not tell us whether
      // boot touched the chunk. Same request policy as the harness: only
      // file:/data:/blob: get through, so this is the offline path.
      const browser = await puppeteer.launch({
        headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
      });
      try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', r => (/^(file|data|blob):/.test(r.url()) ? r.continue() : r.abort('failed')));
        const pageErrors = [];
        page.on('pageerror', e => pageErrors.push(e.message));
        await page.evaluateOnNewDocument(() => {
          const orig = URL.createObjectURL;
          window.__blobUrls = [];
          URL.createObjectURL = function (b) { const u = orig.call(URL, b); window.__blobUrls.push(u); return u; };
        });
        await page.goto(`file://${join(ROOT, 'bundle.html')}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('header', { timeout: 45_000 });
        await page.waitForFunction(() => document.querySelectorAll('main .grid > div').length > 10, { timeout: 45_000 });
        await sleep(1000); // idle: anything eager would have fired by now
        const bootBlobs = await page.evaluate(() => window.__blobUrls.length);
        assertEq(bootBlobs, 0, 'boot must not create any Blob URL (the calc must stay lazy)');

        const first = await page.evaluate(async (paste) => {
          const [member] = window.__tc.parsePokePaste(paste);
          const t0 = performance.now();
          const mu = await window.__tc.computeMatchup(member, 143);
          const t1 = performance.now();
          const again = await window.__tc.computeMatchup(member, 143);
          return { blobs: window.__blobUrls.length, mu, again, firstMs: Math.round(t1 - t0) };
        }, LANDO_PASTE);
        assertEq(first.blobs, 1, `the first matchup should create exactly one Blob URL; saw ${first.blobs}`);
        assert(first.mu.supported, 'Landorus-Therian should be modeled after the lazy load');
        assertGte(first.mu.moves.length, 2, 'both damaging moves should produce ranges');
        const eq = first.mu.moves.find(m => m.move === 'Earthquake');
        assert(eq && eq.maxPct > eq.minPct && eq.minPct > 0, `Earthquake should have a real damage range; got ${JSON.stringify(eq)}`);
        assertEq(JSON.stringify(first.again), JSON.stringify(first.mu), 'a second call must reuse the loaded module and agree');
        assert(first.mu.attackerSpe > first.mu.defenderSpe, 'Jolly 252 Spe Lando-T must outspeed Snorlax');
        assertEq(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);
        console.log(`    first matchup (lazy load + calc): ${first.firstMs}ms`);
      } finally {
        await browser.close();
      }
    },
  },
];

const result = await runSuite('bundle-shape', tests);
await closeBrowser();
process.exit(result.failed ? 1 : 0);
