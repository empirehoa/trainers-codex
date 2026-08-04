// Generates the static Open Graph image for the /journey route.
//
// Per the spec, per-run OG images are out of scope for v1 — they need a server
// to render per-seed. This produces the single static card that every /journey
// share unfurls with, rendered from an HTML template through the Chromium that
// Puppeteer already provides for the test suite (no new dependency, no design
// tool in the loop).
//
// Run:  node scripts/make-og-image.mjs
// Out:  public/og-journey.jpg  (1200×630, the size every major crawler wants)
//
// JPEG, not PNG: the card is a photographic gradient with no transparency, and
// the PNG encoding of it was ~430 KB against ~60 KB for a quality-92 JPEG.
// Unfurl previews are fetched synchronously by crawlers, so the weight matters.
//
// Re-run only when the wordmark or the tagline changes; the PNG is committed so
// a normal build never needs Chromium.

import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'public', 'og-journey.jpg');

// NOTE ON COPY: the tagline deliberately omits the word "Pokémon". Route copy,
// the page title, and OG tags are all inside the scope of the pre-launch IP
// counsel review (§4c of the sprint brief), and Journey Mode is engineered for
// peak visibility during Worlds week — which is exactly when that word is most
// expensive to be wrong about. If counsel clears it, add it here and re-run.
const TITLE = "TRAINER'S CODEX";
const HEADLINE = 'Live an entire trainer career in three minutes.';
const SUB = 'Journey Mode · choose your path · shareable Legend Card';

const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Major+Mono+Display&family=Sora:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: radial-gradient(circle at 50% 35%, #1c1812 0%, #0a0806 78%);
    color: #f5ead2; font-family: 'Sora', system-ui;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    position: relative;
  }
  .scan { position: absolute; inset: 0; background: repeating-linear-gradient(
      to bottom, rgba(244,174,60,.028) 0 1px, transparent 1px 3px); }
  .vig { position: absolute; inset: 0;
    background: radial-gradient(circle at 50% 50%, transparent 38%, rgba(0,0,0,.62) 100%); }
  .frame { position: absolute; inset: 26px; border: 2px solid rgba(244,174,60,.4); border-radius: 16px; }
  .br { position: absolute; width: 46px; height: 46px; border: 3px solid #f4ae3c; }
  .tl { top: 34px; left: 34px; border-right: 0; border-bottom: 0; }
  .tr { top: 34px; right: 34px; border-left: 0; border-bottom: 0; }
  .bl { bottom: 34px; left: 34px; border-right: 0; border-top: 0; }
  .brr { bottom: 34px; right: 34px; border-left: 0; border-top: 0; }
  .dots { display: flex; gap: 8px; margin-bottom: 26px; }
  .dots i { width: 9px; height: 9px; border-radius: 50%; display: block; }
  .wordmark { font-family: 'Major Mono Display', monospace; font-size: 40px; color: #f4ae3c;
    letter-spacing: .02em; margin-bottom: 34px; }
  h1 { font-size: 56px; font-weight: 700; line-height: 1.14; text-align: center;
    max-width: 900px; text-shadow: 0 0 34px rgba(244,174,60,.34); }
  .sub { font-family: 'JetBrains Mono', monospace; font-size: 20px; color: #8a7e62;
    margin-top: 30px; letter-spacing: .04em; }
  .url { font-family: 'JetBrains Mono', monospace; font-size: 22px; color: #f4ae3c;
    position: absolute; bottom: 62px; letter-spacing: .05em; }
  .z { position: relative; display: flex; flex-direction: column; align-items: center; }
</style></head>
<body>
  <div class="scan"></div><div class="vig"></div>
  <div class="frame"></div>
  <div class="br tl"></div><div class="br tr"></div><div class="br bl"></div><div class="br brr"></div>
  <div class="z">
    <div class="dots">
      <i style="background:#34d399"></i><i style="background:#fbbf24"></i><i style="background:#f87171"></i>
    </div>
    <div class="wordmark">${TITLE}</div>
    <h1>${HEADLINE}</h1>
    <div class="sub">${SUB}</div>
  </div>
  <div class="url">trainerscodex.com/journey</div>
</body></html>`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle0' });
// Give the webfonts a beat to paint — a screenshot taken mid-swap renders the
// fallback face and the card looks wrong forever afterwards.
await new Promise(r => setTimeout(r, 600));
const png = await page.screenshot({ type: 'jpeg', quality: 92 });
writeFileSync(OUT, png);
await browser.close();

console.log(`✓ ${join('public', 'og-journey.jpg')}: ${(png.length / 1024).toFixed(1)} KB (1200×630)`);
