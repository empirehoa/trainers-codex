// Responsive probe: loads bundle.html at several viewport widths, seeds a team,
// measures horizontal overflow, header-row overflow, team-bar overflow, and the
// three heavy dialogs (AI Studio, Merch, Poster). Screenshots each viewport.
// Run: node tests/probe-responsive.mjs
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_URL = `file://${resolve(__dirname, '..', 'bundle.html')}`;
const OUT = join(__dirname, '..', 'tmp-responsive');
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'iphone-se', w: 360, h: 780 },
  { name: 'iphone-14', w: 390, h: 844 },
  { name: 'pixel-7', w: 412, h: 915 },
  { name: 'ipad-mini', w: 768, h: 1024 },
  { name: 'desktop', w: 1280, h: 900 },
];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

function overflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const horiz = de.scrollWidth - de.clientWidth;
    // header button cluster
    const header = document.querySelector('header');
    const hRow = header ? header.querySelector('.flex.items-center.gap-3') : null;
    const headerOverflow = header ? header.scrollWidth - header.clientWidth : 0;
    // team bar
    const bar = document.querySelector('.fixed.bottom-0');
    const barOverflow = bar ? bar.scrollWidth - bar.clientWidth : 0;
    // count visible header buttons
    const btns = header ? [...header.querySelectorAll('button')].filter(b => b.offsetParent !== null) : [];
    return {
      docHoriz: horiz,
      headerOverflow,
      barOverflow,
      visibleHeaderButtons: btns.length,
      bodyScrollW: de.scrollWidth,
      bodyClientW: de.clientWidth,
    };
  });
}

const results = [];
for (const vp of VIEWPORTS) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 2 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) req.continue();
    else req.abort('failed');
  });
  await page.goto(BUNDLE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 250));

  const empty = await overflow(page);
  await page.screenshot({ path: join(OUT, `${vp.name}-1-empty.png`) });

  // Seed a full team: click the first themed-preset button if present.
  const seeded = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    // themed presets are the small font-mono buttons under "// themed presets"
    const preset = btns.find(b => /kanto|johto|mega|eevee|starter|dragon|legendary/i.test(b.innerText) && b.className.includes('font-mono'));
    if (preset) { preset.click(); return preset.innerText.trim(); }
    return null;
  });
  await new Promise(r => setTimeout(r, 400));
  const withTeam = await overflow(page);
  await page.screenshot({ path: join(OUT, `${vp.name}-2-team.png`) });

  // Open AI Studio (sparkles button).
  const dialogs = {};
  for (const [label, svgClass] of [['ai', 'lucide-sparkles'], ['merch', 'lucide-shopping-bag'], ['poster', 'lucide-wand-sparkles']]) {
    const opened = await page.evaluate((cls) => {
      const b = [...document.querySelectorAll('header button')].find(x => x.querySelector(`svg.${cls}`));
      if (b && !b.disabled) { b.click(); return true; }
      return false;
    }, svgClass);
    await new Promise(r => setTimeout(r, 400));
    if (opened) {
      const dlg = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        if (!d) return { open: false };
        const r = d.getBoundingClientRect();
        return {
          open: true,
          width: Math.round(r.width),
          left: Math.round(r.left),
          right: Math.round(r.right),
          overflowsRight: r.right > window.innerWidth + 1,
          offscreenLeft: r.left < -1,
          contentOverflow: d.scrollHeight - d.clientHeight,
          vw: window.innerWidth,
        };
      });
      dialogs[label] = dlg;
      await page.screenshot({ path: join(OUT, `${vp.name}-3-${label}.png`) });
      // close
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 250));
    } else {
      dialogs[label] = { open: false, reason: 'trigger not found/disabled' };
    }
  }

  results.push({ vp: vp.name, w: vp.w, empty, withTeam, seeded, dialogs });
  await page.close();
  await ctx.close();
}

await browser.close();

console.log('\n=== RESPONSIVE PROBE ===\n');
for (const r of results) {
  console.log(`▼ ${r.vp} (${r.w}px)  seeded="${r.seeded}"`);
  console.log(`   doc horiz overflow: empty=${r.empty.docHoriz}px  team=${r.withTeam.docHoriz}px   ${r.withTeam.docHoriz > 0 ? '⚠️ OVERFLOW' : 'ok'}`);
  console.log(`   header overflow: ${r.empty.headerOverflow}px  visible header buttons: ${r.empty.visibleHeaderButtons}`);
  console.log(`   team-bar overflow: ${r.withTeam.barOverflow}px (horizontal scroll region — expected)`);
  for (const [k, d] of Object.entries(r.dialogs)) {
    if (!d.open) { console.log(`   dialog ${k}: NOT OPENED (${d.reason || ''})`); continue; }
    const flags = [d.overflowsRight && 'RIGHT-OVERFLOW', d.offscreenLeft && 'OFFSCREEN-LEFT', d.contentOverflow > 0 && `scroll+${d.contentOverflow}px`].filter(Boolean).join(' ');
    console.log(`   dialog ${k}: w=${d.width} vw=${d.vw} [${d.left}..${d.right}] ${flags || 'fits'}`);
  }
  console.log('');
}
console.log(`screenshots → ${OUT}`);
