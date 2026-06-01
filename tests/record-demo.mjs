// Frame-by-frame capture of the live demo flow, then assembled into a GIF + MP4 via ffmpeg.
//
// Demo flow: empty state → random team → analysis sheet → poster studio.
//
// Output:
//   /tmp/tc-demo-frames/frame-NNN.png  — intermediate
//   /Users/jrrclaw/projects/trainers-codex/deploy/screenshots/demo.gif
//   /Users/jrrclaw/projects/trainers-codex/deploy/screenshots/demo.mp4
//
// Run: node tests/record-demo.mjs

import puppeteer from 'puppeteer';
import { mkdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const LIVE = 'https://trainerscodex.com';
const FRAMES_DIR = '/tmp/tc-demo-frames';
const OUT = '/Users/jrrclaw/projects/trainers-codex/deploy/screenshots';
const TOTAL_FRAMES = 60;
const FPS = 12;

mkdirSync(OUT, { recursive: true });
rmSync(FRAMES_DIR, { recursive: true, force: true });
mkdirSync(FRAMES_DIR, { recursive: true });

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();
  await page.goto(LIVE, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('header h1', { timeout: 10000 });

  let frameIdx = 0;
  const cap = async () => {
    const n = String(frameIdx).padStart(3, '0');
    await page.screenshot({ path: join(FRAMES_DIR, `frame-${n}.png`) });
    frameIdx++;
  };

  // Phase 1: hold on empty state (8 frames = ~0.66s)
  await wait(600);
  for (let i = 0; i < 8; i++) { await cap(); await wait(80); }

  // Phase 2: click random team
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header button')];
    const dice = btns.find(b => b.querySelector('svg.lucide-dices'));
    dice?.click();
  });

  // Phase 3: capture team filling in (16 frames at ~50ms = build animation)
  for (let i = 0; i < 16; i++) { await cap(); await wait(80); }

  // Phase 4: open analysis sheet via clicking analyze button if present
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const analyzeBtn = btns.find(b => /analy[sz]e/i.test(b.innerText || '') || b.querySelector('svg.lucide-shield, svg.lucide-shield-half'));
    analyzeBtn?.click();
  });

  for (let i = 0; i < 16; i++) { await cap(); await wait(100); }

  // Phase 5: close analysis, open poster studio
  await page.keyboard.press('Escape');
  await wait(300);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header button')];
    const wand = btns.find(b => b.querySelector('svg.lucide-wand-sparkles, svg.lucide-wand2'));
    wand?.click();
  });

  // Phase 6: capture poster studio open
  for (let i = 0; i < 20; i++) { await cap(); await wait(100); }

  await browser.close();

  console.log(`\n✓ Captured ${frameIdx} frames to ${FRAMES_DIR}`);
  console.log('▶ Encoding GIF...');

  // Two-pass GIF with high-quality palette
  execSync(
    `ffmpeg -y -framerate ${FPS} -i ${FRAMES_DIR}/frame-%03d.png ` +
    `-vf "fps=${FPS},scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" ` +
    `-loop 0 ${OUT}/demo.gif`,
    { stdio: 'inherit' }
  );

  console.log('\n▶ Encoding MP4...');
  execSync(
    `ffmpeg -y -framerate ${FPS} -i ${FRAMES_DIR}/frame-%03d.png ` +
    `-c:v libx264 -pix_fmt yuv420p -movflags +faststart -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" ` +
    `${OUT}/demo.mp4`,
    { stdio: 'inherit' }
  );

  console.log('\n✓ Demo encoded:');
  console.log(`  ${OUT}/demo.gif`);
  console.log(`  ${OUT}/demo.mp4`);
}

main().catch(e => { console.error(e); process.exit(2); });
