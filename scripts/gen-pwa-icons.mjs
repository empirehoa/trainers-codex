// gen-pwa-icons.mjs — rasterize the PWA icon set from an inline SVG using the
// Puppeteer/Chromium that already ships as a devDependency (no image libs).
//
// Produces, into public/:
//   icon-192.png            192×192  "any" purpose
//   icon-512.png            512×512  "any" purpose
//   icon-maskable-512.png   512×512  maskable (poké-ball pulled into the 80% safe zone)
//   apple-touch-icon.png    180×180  iOS home screen
//
// The motif matches the inline data: favicon in index.html — a gold (#f4ae3c)
// poké-ball outline on the app's near-black (#0c0a08) field. Re-run whenever the
// brand mark changes: `node scripts/gen-pwa-icons.mjs`.

import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');

const BG = '#0c0a08';
const GOLD = '#f4ae3c';

// rScale = poké-ball outer radius as a fraction of half the canvas. "any" icons
// breathe at 0.68; the maskable icon shrinks to 0.50 so the mark survives the
// circular/rounded masks the OS applies (the safe zone is the central 80%).
function svg(rScale) {
  const r = 50 * rScale;          // viewBox is 0 0 100 100 → half = 50
  const inner = r * 0.36;
  const stroke = r * 0.13;
  const beltY = 50;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <rect width="100" height="100" fill="${BG}"/>
  <g fill="none" stroke="${GOLD}" stroke-width="${stroke}">
    <circle cx="50" cy="50" r="${r}"/>
    <circle cx="50" cy="50" r="${inner}"/>
    <line x1="${50 - r}" y1="${beltY}" x2="${50 - inner}" y2="${beltY}"/>
    <line x1="${50 + inner}" y1="${beltY}" x2="${50 + r}" y2="${beltY}"/>
  </g>
  <circle cx="50" cy="50" r="${inner * 0.34}" fill="${GOLD}"/>
</svg>`;
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, rScale: 0.68 },
  { file: 'icon-512.png', size: 512, rScale: 0.68 },
  { file: 'icon-maskable-512.png', size: 512, rScale: 0.50 },
  { file: 'apple-touch-icon.png', size: 180, rScale: 0.68 },
];

const browser = await puppeteer.launch({ headless: 'new' });
try {
  for (const { file, size, rScale } of TARGETS) {
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;padding:0;width:${size}px;height:${size}px">${svg(rScale)}</body></html>`,
      { waitUntil: 'load' },
    );
    const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(join(PUBLIC, file), buf);
    await page.close();
    console.log(`✓ ${file} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
