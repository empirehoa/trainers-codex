// PWA suite — verifies the app is installable as a Progressive Web App on
// iOS, iPadOS, and Android. The shipped artifact is a single self-contained
// HTML, so the "offline" story is just the cached navigation document; these
// tests confirm the install metadata (manifest + icons + iOS meta tags), the
// service worker contract, and that SW registration is guarded so the bundle
// still runs cleanly from file:// (where these very tests load it).
//
// Head-tag checks run against the built bundle in the browser; manifest, icon,
// service-worker, and deploy-header checks read the public/ sidecars + bundle
// from disk (the harness aborts non-file requests, so the sidecars never load
// over the network here — and they don't need to).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import puppeteer from 'puppeteer';
import {
  runSuite, assert, exists, closeBrowser, chromiumPath,
} from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

const readPub = (f) => readFileSync(join(PUBLIC, f), 'utf8');
const readBytes = (f) => readFileSync(join(PUBLIC, f));
// PNG dimensions live in the IHDR chunk at byte offsets 16 (width) / 20 (height).
const pngDims = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

const tests = [
  {
    name: 'head links the manifest and declares iOS/Android app metadata',
    async fn(page) {
      assert(await exists(page, 'link[rel="manifest"]'), 'missing <link rel="manifest">');
      assert(await exists(page, 'link[rel="apple-touch-icon"]'), 'missing apple-touch-icon');
      const meta = await page.evaluate(() => {
        const get = (n) => {
          const el = document.querySelector(`meta[name="${n}"]`);
          return el ? el.getAttribute('content') : null;
        };
        return {
          appleCapable: get('apple-mobile-web-app-capable'),
          mobileCapable: get('mobile-web-app-capable'),
          statusBar: get('apple-mobile-web-app-status-bar-style'),
          title: get('apple-mobile-web-app-title'),
          theme: get('theme-color'),
          touchHref: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'),
        };
      });
      assert(meta.appleCapable === 'yes', `apple-mobile-web-app-capable=${meta.appleCapable}`);
      assert(meta.mobileCapable === 'yes', `mobile-web-app-capable=${meta.mobileCapable}`);
      assert(!!meta.statusBar, 'missing apple-mobile-web-app-status-bar-style');
      assert(!!meta.title, 'missing apple-mobile-web-app-title');
      assert(meta.theme === '#0c0a08', `theme-color=${meta.theme}`);
      // iOS wants a real raster icon — an SVG apple-touch-icon is unreliable.
      assert(/\.png$/.test(meta.touchHref), `apple-touch-icon should be a PNG, got ${meta.touchHref}`);
    },
  },
  {
    name: 'web manifest declares an installable standalone app',
    async fn() {
      const m = JSON.parse(readPub('manifest.webmanifest'));
      assert(m.name && m.name.length > 3, 'manifest missing name');
      assert(m.short_name && m.short_name.length <= 16, `short_name too long for the home screen: ${m.short_name}`);
      assert(m.start_url, 'missing start_url');
      assert(m.scope, 'missing scope');
      assert(m.display === 'standalone', `display should be standalone, got ${m.display}`);
      assert(m.background_color === '#0c0a08', `background_color=${m.background_color}`);
      assert(m.theme_color === '#0c0a08', `theme_color=${m.theme_color}`);
      assert(Array.isArray(m.icons) && m.icons.length >= 3, 'manifest needs >= 3 icon entries');
    },
  },
  {
    name: 'manifest icons meet Chrome installability (192 + 512 + maskable)',
    async fn() {
      const m = JSON.parse(readPub('manifest.webmanifest'));
      const png = m.icons.filter((i) => i.type === 'image/png');
      const has = (size) => png.some((i) => i.sizes === `${size}x${size}`);
      assert(has(192), 'no 192×192 PNG icon (Chrome install minimum)');
      assert(has(512), 'no 512×512 PNG icon (Chrome install minimum)');
      const maskable = m.icons.some((i) => /\bmaskable\b/.test(i.purpose || ''));
      assert(maskable, 'no maskable icon (Android adaptive-icon requirement)');
      // Every PNG the manifest names must actually exist at its declared size.
      for (const i of png) {
        const [w] = i.sizes.split('x').map(Number);
        const dims = pngDims(readBytes(i.src.replace(/^\//, '')));
        assert(dims.w === w && dims.h === w, `${i.src} is ${dims.w}×${dims.h}, manifest says ${i.sizes}`);
      }
      // And the iOS home-screen icon is a real 180×180 raster.
      const apple = pngDims(readBytes('apple-touch-icon.png'));
      assert(apple.w === 180 && apple.h === 180, `apple-touch-icon is ${apple.w}×${apple.h}, expected 180×180`);
    },
  },
  {
    name: 'service worker ships and implements the install/activate/fetch contract',
    async fn() {
      const sw = readPub('sw.js');
      for (const ev of ['install', 'activate', 'fetch']) {
        assert(sw.includes(`addEventListener('${ev}'`), `sw.js missing ${ev} handler`);
      }
      assert(/skipWaiting/.test(sw), 'sw.js should call skipWaiting for prompt updates');
      assert(/clients\.claim/.test(sw), 'sw.js should claim clients on activate');
      // Money/auth-adjacent traffic must never be cached: the SW bails on any
      // cross-origin request (Stripe, the API Worker, Supabase, sprite mirror).
      assert(/origin !== self\.location\.origin/.test(sw), 'sw.js must skip cross-origin requests, not cache them');
    },
  },
  {
    name: 'bundle registers the SW but stays silent off a secure origin',
    async fn() {
      const bundle = readFileSync(join(ROOT, 'bundle.html'), 'utf8');
      assert(bundle.includes('serviceWorker'), 'bundle never references serviceWorker');
      assert(bundle.includes('/sw.js'), 'bundle never registers /sw.js');
      // The guard is what keeps file:// (this very test) and plain http from
      // throwing — registration must be conditional on a secure origin.
      assert(/https:|localhost/.test(bundle), 'SW registration is not guarded to a secure origin');
    },
  },
  {
    name: 'the shell paints before the script: static markup in #root, fonts off the critical path',
    async fn() {
      // E-1/E-10: #root shipped empty and the stylesheet opened with a Google
      // Fonts @import, so nothing painted until 2 MB of HTML had downloaded and
      // a cross-origin CSS request had settled. Both the Vite output and the
      // inlined bundle must now carry the first-paint markup, and the head's
      // inline styles must not import anything.
      for (const file of ['dist/index.html', 'bundle.html']) {
        const html = readFileSync(join(ROOT, file), 'utf8');
        const m = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script>/);
        assert(m && m[1].trim().length > 500, `${file}: #root has no static first-paint markup`);
        assert(/<header[\s>]/.test(m[1]) && /build your six/.test(m[1]),
          `${file}: the placeholder is missing the header or the empty-state hero`);
        const head = html.slice(0, html.indexOf('<body>')).replace(/<!--[\s\S]*?-->/g, '');
        for (const style of head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
          assert(!/@import/.test(style[1]), `${file}: a <style> in <head> still carries an @import`);
        }
        assert(/<link rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com[^"]*display=swap"/.test(head),
          `${file}: fonts are not preloaded non-blocking`);
      }
      const bundle = readFileSync(join(ROOT, 'bundle.html'), 'utf8');
      // The module script must sit after the markup or the markup waits on it.
      assert(bundle.indexOf('<div id="root">') < bundle.indexOf('<script type="module">'),
        'the inlined module script precedes #root — first paint waits on the whole script');
    },
  },

  {
    name: 'the static placeholder matches what React renders first (no visual jump)',
    ownPage: true,
    async fn() {
      // Load the bundle twice per viewport — once with scripts disabled (what
      // the visitor sees while the JS downloads) and once normally — and compare
      // the boxes of the header, wordmark and hero heading. A drift here means
      // the placeholder in index.html has fallen out of step with App.tsx.
      const browser = await puppeteer.launch({
        headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        ...(chromiumPath() ? { executablePath: chromiumPath() } : {}),
      });
      const url = `file://${join(ROOT, 'bundle.html')}`;
      const measure = () => [...document.querySelectorAll('header, header h1, main section h2, main section .grid')]
        .map(el => { const r = el.getBoundingClientRect(); return [el.tagName, Math.round(r.top), Math.round(r.height), Math.round(r.width)]; });
      try {
        for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
          const boxes = [];
          for (const js of [false, true]) {
            const page = await browser.newPage();
            await page.setViewport(vp);
            await page.setJavaScriptEnabled(js);
            await page.setRequestInterception(true);
            page.on('request', r => (/^(file|data|blob):/.test(r.url()) ? r.continue() : r.abort('failed')));
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            if (js) {
              await page.waitForFunction(() => document.querySelectorAll('main .grid > div').length > 10, { timeout: 60_000 });
              // The hero mounts with a 350ms fade-up (translateY) — let the
              // finite animations settle so we measure the resting layout.
              await page.evaluate(() => Promise.all(document.getAnimations()
                .filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished)));
            }
            boxes.push(await page.evaluate(measure));
            await page.close();
          }
          const [staticBoxes, reactBoxes] = boxes;
          assert(staticBoxes.length === 4, `placeholder at ${vp.width}px is missing an element: ${JSON.stringify(staticBoxes)}`);
          for (let i = 0; i < staticBoxes.length; i++) {
            const [tag, top, h, w] = staticBoxes[i];
            const [, rTop, rH, rW] = reactBoxes[i];
            assert(Math.abs(top - rTop) <= 1 && Math.abs(h - rH) <= 1 && Math.abs(w - rW) <= 1,
              `${tag} at ${vp.width}px moves on mount: static top/h/w ${top}/${h}/${w} vs React ${rTop}/${rH}/${rW}`);
          }
        }
      } finally {
        await browser.close();
      }
    },
  },

  {
    name: 'the data blobs ship as JSON.parse strings, not object literals',
    async fn() {
      // E-15: vite.config.ts asked for json.stringify and Vite 8 silently
      // ignored it while namedExports stayed on, so ~600 KB of species data
      // parsed as a JS AST on every boot. Pin the fast path in the artifact.
      const bundle = readFileSync(join(ROOT, 'bundle.html'), 'utf8');
      const blobs = [];
      for (let i = bundle.indexOf('JSON.parse(`'); i >= 0; i = bundle.indexOf('JSON.parse(`', i + 12)) {
        const end = bundle.indexOf('`)', i + 12);
        blobs.push(bundle.slice(i + 12, end));
      }
      const big = blobs.filter(b => b.length >= 100_000);
      assert(big.length >= 2, `expected the species + learnset data as >=100 KB JSON.parse strings, found ${big.length} (blobs: ${blobs.map(b => b.length).join(', ')})`);
      assert(big.some(b => b.includes('"n":"bulbasaur"')), 'species data is not among the JSON.parse blobs');
    },
  },

  {
    name: 'deploy headers pin the manifest MIME type and keep the SW fresh',
    async fn() {
      const headers = readPub('_headers');
      assert(/\/sw\.js/.test(headers), '_headers has no /sw.js rule');
      assert(/\/manifest\.webmanifest/.test(headers), '_headers has no manifest rule');
      assert(/application\/manifest\+json/.test(headers), 'manifest Content-Type not pinned');
      // SW must revalidate so a deploy is not pinned to a stale worker forever.
      const swBlock = headers.slice(headers.indexOf('/sw.js'));
      assert(/must-revalidate/.test(swBlock.slice(0, 200)), 'sw.js is not set to revalidate');
    },
  },
];

const result = await runSuite('pwa', tests);
await closeBrowser();
process.exit(result.failed === 0 ? 0 : 1);
