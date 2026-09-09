// Accessibility suite — the checks a keyboard or screen-reader user would hit
// on the first visit, run against the built bundle at desktop and phone width:
//
//   - axe-core (WCAG 2.x A/AA + best-practice) on the shell and inside each of
//     the main dialogs, failing on any CRITICAL violation (12 header icon
//     buttons shipped with no accessible name — only a hover Tooltip);
//   - every button / combobox in the header and main has an accessible name;
//   - focus returns to the opener when a dialog closes (Radix restores focus
//     to a DialogTrigger ref, and this app has none — focus fell to <body>);
//   - `prefers-reduced-motion: reduce` stops the ambient loops;
//   - AA colour contrast on the Analysis sheet and Poster Studio (the 10px
//     `text-destructive` status copy measured 3.03:1);
//   - the dialog close "X" is at least 24×24 on desktop (WCAG 2.5.8).
//
// axe-core is injected from node_modules — the harness blocks network, and the
// bundle must not carry it.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runSuite, sleep, clickAt, assert, assertGte, closeBrowser } from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXE = readFileSync(join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2 };
const OPEN_DIALOG = '[role="dialog"]:not([data-state="closed"])';

// ---------- helpers ----------

async function runAxe(page, scope) {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async (sel) => {
    const ctx = sel ? { include: [[sel]] } : document;
    const r = await window.axe.run(ctx, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      resultTypes: ['violations'],
    });
    return r.violations.map(v => ({
      id: v.id, impact: v.impact, count: v.nodes.length,
      nodes: v.nodes.slice(0, 3).map(n => n.html.slice(0, 120)),
    }));
  }, scope || null);
}

function describe(violations) {
  return violations.map(v => `[${v.impact}] ${v.id} ×${v.count}: ${v.nodes.join(' | ')}`).join('\n    ');
}

function assertNoCritical(violations, where) {
  const critical = violations.filter(v => v.impact === 'critical');
  assert(critical.length === 0, `critical axe violations in ${where}:\n    ${describe(critical)}`);
}

// Fill the team so the team-dependent studios are enabled.
async function fillTeam(page) {
  const done = await page.evaluate(() => {
    const b = document.querySelector('header button[aria-label="Random team"]');
    if (b && b.offsetParent !== null) { b.click(); return true; }
    return false;
  });
  if (!done) {
    // Phone: the action lives in the overflow menu (a Radix item — real click).
    await clickAt(page, '[data-testid="more-actions"]');
    await sleep(250);
    await clickMenuItem(page, /random team/i);
  }
  await sleep(350);
}

async function clickMenuItem(page, re) {
  const handle = await page.evaluateHandle((src) =>
    [...document.querySelectorAll('[role="menuitem"]')].find(m => new RegExp(src, 'i').test(m.textContent)), re.source);
  const box = await handle.boundingBox();
  assert(box, `menu item ${re} not found`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(450);
}

/** Open a dialog by its header aria-label (desktop) or overflow-menu label (phone). */
async function openByLabel(page, label, phone) {
  if (!phone) {
    await page.evaluate((l) => document.querySelector(`header button[aria-label^="${l}"]`).click(), label);
  } else {
    await clickAt(page, '[data-testid="more-actions"]');
    await sleep(250);
    await clickMenuItem(page, new RegExp(label.split(' ')[0], 'i'));
  }
  await page.waitForSelector(OPEN_DIALOG, { timeout: 8000 });
  await sleep(500);
}

async function openAnalysis(page) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(b => /analy/i.test(b.getAttribute('aria-label') || b.textContent) && !b.disabled && b.offsetParent !== null);
    b.click();
  });
  await page.waitForSelector(OPEN_DIALOG, { timeout: 8000 });
  await sleep(500);
}

// The five surfaces a first-time visitor reaches from the header.
const DIALOGS = [
  { name: 'journey', open: async (page, phone) => {
      await page.evaluate((sel) => document.querySelector(sel).click(), phone ? '[data-testid="journey-open-hero"]' : '[data-testid="journey-open"]');
      await page.waitForSelector('[data-testid="journey-dialog"]', { timeout: 8000 }); await sleep(400);
    } },
  { name: 'poster studio', needsTeam: true, open: (page, phone) => openByLabel(page, 'Poster studio', phone) },
  { name: 'merch studio', needsTeam: true, open: (page, phone) => openByLabel(page, 'Merch studio', phone) },
  { name: 'analysis sheet', needsTeam: true, open: (page) => openAnalysis(page) },
  { name: 'library', open: (page, phone) => openByLabel(page, 'Library', phone) },
  { name: 'type chart', open: (page, phone) => openByLabel(page, 'Type chart', phone) },
];

const accessibleNames = (page) => page.evaluate(() => {
  const name = (el) => {
    const label = el.getAttribute('aria-label');
    if (label && label.trim()) return label.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) { const t = by.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim(); if (t) return t; }
    if (el.getAttribute('title')) return el.getAttribute('title');
    return (el.textContent || '').trim();
  };
  const els = [...document.querySelectorAll('header button, main button, header [role="combobox"], main [role="combobox"], [role="combobox"]')]
    .filter(el => el.offsetParent !== null);
  return { total: els.length, unnamed: els.filter(el => !name(el)).map(el => el.outerHTML.slice(0, 120)) };
});

const tests = [];

for (const [label, viewport] of [['1280', DESKTOP], ['390', PHONE]]) {
  const phone = viewport === PHONE;

  tests.push({
    name: `axe: no critical violations on the shell at ${label}`,
    pageOpts: { viewport },
    fn: async (page) => {
      await fillTeam(page);
      assertNoCritical(await runAxe(page, null), `shell-${label}`);
    },
  });

  tests.push({
    name: `every header/main button and combobox has an accessible name at ${label}`,
    pageOpts: { viewport },
    fn: async (page) => {
      await fillTeam(page);
      const r = await accessibleNames(page);
      assertGte(r.total, 10, 'expected the toolbar and grid controls to be present');
      assert(r.unnamed.length === 0, `${r.unnamed.length} unnamed controls:\n    ${r.unnamed.join('\n    ')}`);
      // The primary CTA must say what it does, not just "6/6".
      const analyze = await page.evaluate(() =>
        [...document.querySelectorAll('button')].filter(b => b.querySelector('svg.lucide-chart-column, svg.lucide-bar-chart-3, svg[class*="chart"]') && b.offsetParent !== null)
          .map(b => (b.getAttribute('aria-label') || b.textContent || '').trim()));
      assertGte(analyze.length, 1, 'no Analyze button found');
      for (const n of analyze) assert(/analy/i.test(n), `Analyze button's accessible name is "${n}"`);
    },
  });

  for (const d of DIALOGS) {
    tests.push({
      name: `axe: no critical violations inside ${d.name} at ${label}`,
      pageOpts: { viewport },
      fn: async (page) => {
        if (d.needsTeam) await fillTeam(page);
        await d.open(page, phone);
        assertNoCritical(await runAxe(page, OPEN_DIALOG), `${d.name}-${label}`);
      },
    });
  }
}

// ---------- contrast on the surfaces that carried the 10px destructive copy ----------
for (const d of DIALOGS.filter(x => x.name === 'analysis sheet' || x.name === 'poster studio')) {
  tests.push({
    name: `axe: no serious colour-contrast failures in ${d.name}`,
    pageOpts: { viewport: DESKTOP },
    fn: async (page) => {
      await fillTeam(page);
      await d.open(page, false);
      if (d.name === 'poster studio') {
        // Select a locked style so the locked-card treatment is on screen.
        await page.evaluate(() => { const b = [...document.querySelectorAll('[role="dialog"] button')].find(b => b.querySelector('svg.lucide-lock')); if (b) b.click(); });
        await sleep(300);
      }
      const v = (await runAxe(page, OPEN_DIALOG)).filter(x => x.id === 'color-contrast' && (x.impact === 'serious' || x.impact === 'critical'));
      assert(v.length === 0, `contrast failures in ${d.name}:\n    ${describe(v)}`);
    },
  });
}

// ---------- focus returns to the opener ----------
async function pollDialogGone(page) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const gone = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
    if (gone) return;
    await sleep(60);
  }
  throw new Error('dialog did not close');
}

for (const [testid, waitFor] of [
  ['journey-open', '[data-testid="journey-dialog"]'],
  ['ai-studio-btn', OPEN_DIALOG],
  ['showdown-btn', OPEN_DIALOG],
]) {
  tests.push({
    name: `focus returns to [data-testid=${testid}] after Enter → Escape`,
    pageOpts: { viewport: DESKTOP },
    fn: async (page) => {
      await page.focus(`[data-testid="${testid}"]`);
      await page.keyboard.press('Enter');
      await page.waitForSelector(waitFor, { timeout: 8000 });
      await sleep(300);
      const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
      assert(inside, 'focus did not move into the dialog on open');
      await page.keyboard.press('Escape');
      await pollDialogGone(page);
      await sleep(100);
      const active = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName);
      assert(active === testid, `focus landed on ${active}, expected the opener ${testid}`);
    },
  });
}

tests.push({
  name: 'focus returns to the Analyze button after the analysis sheet closes',
  pageOpts: { viewport: DESKTOP },
  fn: async (page) => {
    await fillTeam(page);
    await page.focus('header button[aria-label="Random team"]');
    await page.keyboard.press('Tab'); // → Type chart
    // Find and focus the header Analyze button directly — Tab order past the
    // journey/poster/merch cluster depends on flags.
    await page.evaluate(() => { const b = [...document.querySelectorAll('header button')].find(b => /analy/i.test(b.textContent)); b.focus(); });
    await page.keyboard.press('Enter');
    await page.waitForSelector(OPEN_DIALOG, { timeout: 8000 });
    await sleep(300);
    await page.keyboard.press('Escape');
    await pollDialogGone(page);
    await sleep(100);
    const ok = await page.evaluate(() => /analy/i.test(document.activeElement?.textContent || ''));
    assert(ok, 'focus did not return to the Analyze button');
  },
});

// ---------- reduced motion ----------
tests.push({
  name: 'prefers-reduced-motion stops the wordmark flicker and every infinite loop',
  pageOpts: { viewport: DESKTOP },
  fn: async (page) => {
    const before = await page.evaluate(() => getComputedStyle(document.querySelector('header h1')).animationName);
    assert(before !== 'none', `sanity: the wordmark should animate by default (got ${before})`);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await sleep(200);
    const after = await page.evaluate(() => ({
      h1: getComputedStyle(document.querySelector('header h1')).animationName,
      infinite: [...document.querySelectorAll('body *')].filter(e => {
        const cs = getComputedStyle(e);
        return cs.animationName !== 'none' && cs.animationIterationCount === 'infinite';
      }).map(e => e.tagName + '.' + [...e.classList].slice(0, 2).join('.')),
    }));
    assert(after.h1 === 'none', `wordmark still animates under reduce: ${after.h1}`);
    assert(after.infinite.length === 0, `infinite animations under reduce: ${after.infinite.join(', ')}`);
  },
});

// ---------- close target size ----------
tests.push({
  name: 'the dialog close X is at least 24×24 at desktop width',
  pageOpts: { viewport: DESKTOP },
  fn: async (page) => {
    await fillTeam(page);
    for (const d of DIALOGS) {
      await d.open(page, false);
      const box = await page.evaluate((sel) => {
        const dlg = document.querySelector(sel);
        const x = [...dlg.querySelectorAll('button')].find(b => /^close/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
        if (!x) return null;
        const r = x.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }, OPEN_DIALOG);
      assert(box, `${d.name}: no close button`);
      assertGte(box.w, 24, `${d.name}: close X is ${box.w}px wide`);
      assertGte(box.h, 24, `${d.name}: close X is ${box.h}px tall`);
      await page.keyboard.press('Escape');
      await pollDialogGone(page);
    }
  },
});

const r = await runSuite('a11y', tests);
await closeBrowser();
process.exit(r.failed ? 1 : 0);
