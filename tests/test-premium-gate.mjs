// Premium gating + money-surface client — the launch-hardening regressions.
//
// Everything here runs the bundle AS A WORKER-BACKED DEPLOY (config injected
// before boot via the harness's `config` option), which is the shape the live
// site has and the shape the rest of the suite never exercised. Findings:
//   A-1/C-4  ?unlock=premium must be inert when a worker is configured
//   A-3/E-8  the full PremiumControl (annual term + restore) is reachable
//   A-6      ?checkout=cancel is consumed with a "no charge" toast
//   D-8      legal + dmca links in the footer, terms beside the buy button
//   E-6      locked Journey rows/chips: aria-disabled + "premium" in the name
//   E-7      the Hall of Fame paywall is not a <button> wrapping a <Button>
//   E-12     the trainer-name input has exactly one <label>

import {
  runSuite, newPage, closePage, sleep, exists, assert, assertEq, assertGte, closeBrowser,
} from './harness.mjs';

const WORKER = { worker: { url: 'https://api.example.test' } };

async function loadStarterTeam(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const target = btns.find(b => /kanto|johto|hoenn|sinnoh|unova|kalos|alola|galar|paldea/i.test(b.innerText)
      && !/region/i.test(b.innerText) && b.innerText.trim().length < 40);
    if (target) target.click();
  });
  await sleep(300);
}

async function openPosterStudio(page) {
  await loadStarterTeam(page);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('header button')].find(b => b.querySelector('svg.lucide-wand-sparkles'));
    if (btn) btn.click();
  });
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
  await sleep(400);
}

/** Select the first premium-locked art style so the pitch panel mounts. */
async function pickLockedStyle(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[role="dialog"] button')].find(b => b.querySelector('svg.lucide-lock'));
    if (btn) btn.click();
  });
  await page.waitForSelector('[data-testid="poster-premium-pitch"]', { timeout: 8000 });
}

async function openJourney(page) {
  await page.evaluate(() => document.querySelector('[data-testid="journey-open"]')?.click());
  await page.waitForSelector('[data-testid="journey-setup"]', { timeout: 8000 });
  await sleep(150);
}

const has = (page, sel) => page.evaluate(s => !!document.querySelector(s), sel);
const toasts = (page) => page.evaluate(() =>
  [...document.querySelectorAll('[data-sonner-toast], [role="status"]')].map(el => el.textContent || ''));

// One finished career seeded into the saves slot — the Hall of Fame row.
const FINISHED_SAVE = JSON.stringify([{
  id: '8843-short', schema: 2, chapter: 9, savedOn: '2026-09-01', finished: true, score: 606,
  verdictKey: 'journey.verdict.cult-hero.title',
  setup: { seed: 8843, trainerName: 'Fable', regionId: 'kanto', starterId: 1, archetype: 'aggro', pace: 'express' },
  choices: [], actions: [],
}]);

const tests = [
  // ---- A-1 / C-4 ----
  {
    name: 'A-1: ?unlock=premium is inert on a worker-backed deploy — no toast, no flag, styles stay locked',
    pageOpts: { query: 'unlock=premium', config: WORKER },
    async fn(page) {
      await sleep(800);
      const boot = await page.evaluate(() => ({
        flag: localStorage.getItem('trainerscodex.premium'),
        search: window.location.search,
      }));
      assertEq(boot.flag, null, 'the preview flag must not be written');
      assert(!/unlock=/.test(boot.search), `the param must still be stripped · got "${boot.search}"`);
      const seen = await toasts(page);
      assert(!seen.some(t => /premium (unlocked|preview)/i.test(t)), `no unlock toast may show · got ${JSON.stringify(seen)}`);

      await openPosterStudio(page);
      const studio = await page.evaluate(() => ({
        active: /premium\s*·\s*active/i.test(document.querySelector('[role="dialog"]').innerText),
        locks: document.querySelectorAll('[role="dialog"] svg.lucide-lock').length,
        checkout: !!document.querySelector('[data-testid="premium-checkout"]'),
      }));
      assert(!studio.active, 'the premium · active pill must not render');
      assertGte(studio.locks, 4, `premium styles must stay locked · saw ${studio.locks} locks`);
      assert(studio.checkout, 'the checkout button is the only way in');
    },
  },
  {
    name: 'A-1: a stale trainerscodex.premium flag is purged on boot when a worker is configured',
    pageOpts: { config: WORKER, storage: { 'trainerscodex.premium': 'true' } },
    async fn(page) {
      await sleep(400);
      assertEq(await page.evaluate(() => localStorage.getItem('trainerscodex.premium')), null,
        'the flag must be cleared, not honoured');
      await openPosterStudio(page);
      const active = await page.evaluate(() => /premium\s*·\s*active/i.test(document.querySelector('[role="dialog"]').innerText));
      assert(!active, 'a leftover preview flag is not an entitlement on production');
    },
  },
  {
    name: 'A-1: the same ?unlock=premium still opens the preview on the no-worker static build',
    pageOpts: { query: 'unlock=premium' },
    async fn(page) {
      await sleep(600);
      assertEq(await page.evaluate(() => localStorage.getItem('trainerscodex.premium')), 'true',
        'offline bundle keeps the preview path (the rest of the suite relies on it)');
      const seen = await toasts(page);
      assert(seen.some(t => /premium preview on/i.test(t)), `the offline toast names it a preview · got ${JSON.stringify(seen)}`);
      assert(!seen.some(t => /every premium surface is open/i.test(t)), 'the old wording is gone');
    },
  },

  // ---- A-3 / E-8 / D-8 ----
  {
    name: 'A-3: the locked-style pitch mounts the full control — annual + monthly radios, restore, terms link',
    pageOpts: { config: WORKER },
    async fn(page) {
      await openPosterStudio(page);
      await pickLockedStyle(page);
      const ctl = await page.evaluate(() => {
        const q = s => document.querySelector(s);
        return {
          annual: q('[data-testid="premium-term-annual"]')?.getAttribute('aria-checked'),
          monthly: q('[data-testid="premium-term-monthly"]')?.getAttribute('aria-checked'),
          restore: q('[data-testid="premium-restore"]')?.innerText,
          legal: q('[data-testid="poster-premium-pitch"] a[href$="legal.html"]')?.getAttribute('href'),
          checkout: q('[data-testid="premium-control"] [data-testid="premium-checkout"]')?.innerText,
          radiogroup: !!q('[data-testid="premium-control"] [role="radiogroup"]'),
        };
      });
      assertEq(ctl.annual, 'true', 'annual pre-selected');
      assertEq(ctl.monthly, 'false', 'monthly not selected');
      assert(ctl.restore && /restore purchase/i.test(ctl.restore) && /this browser/i.test(ctl.restore),
        `restore is worded as same-browser · got "${ctl.restore}"`);
      assert(ctl.legal, 'a terms & refund link sits beside the buy button (D-8)');
      assert(/\$39\/yr/.test(ctl.checkout || ''), `checkout button follows the term · got "${ctl.checkout}"`);
      assert(ctl.radiogroup, 'term picker is a radiogroup');

      // Radios toggle aria-checked.
      await page.evaluate(() => document.querySelector('[data-testid="premium-term-monthly"]').click());
      await sleep(100);
      const after = await page.evaluate(() => ({
        annual: document.querySelector('[data-testid="premium-term-annual"]').getAttribute('aria-checked'),
        monthly: document.querySelector('[data-testid="premium-term-monthly"]').getAttribute('aria-checked'),
        checkout: document.querySelector('[data-testid="premium-control"] [data-testid="premium-checkout"]').innerText,
      }));
      assertEq(after.monthly, 'true', 'monthly selected after click');
      assertEq(after.annual, 'false', 'annual deselected after click');
      assert(/\$4\.99\/mo/.test(after.checkout), `checkout label follows monthly · got "${after.checkout}"`);
    },
  },
  {
    name: 'A-3: checkout with annual selected POSTs term:"annual" to the worker',
    pageOpts: { config: WORKER },
    async fn(page) {
      // A cross-origin JSON POST from file:// starts with a CORS preflight,
      // which the harness aborts — so the POST body never reaches the network
      // layer. Record the call at the fetch boundary instead.
      await page.evaluate(() => {
        window.__fetches = [];
        const orig = window.fetch.bind(window);
        window.fetch = (input, init) => {
          window.__fetches.push({ url: String(input), method: init?.method, body: typeof init?.body === 'string' ? init.body : null });
          return orig(input, init);
        };
      });
      await openPosterStudio(page);
      await pickLockedStyle(page);
      await page.evaluate(() => document.querySelector('[data-testid="premium-term-annual"]').click());
      await page.evaluate(() => document.querySelector('[data-testid="premium-control"] [data-testid="premium-checkout"]').click());
      await sleep(800);
      const posts = await page.evaluate(() => window.__fetches);
      const checkout = posts.find(p => /\/stripe\/checkout$/.test(p.url));
      assert(checkout, `a /stripe/checkout request must fire · saw ${JSON.stringify(posts.map(p => p.url))}`);
      assertEq(checkout.method, 'POST', 'checkout is a POST');
      const body = JSON.parse(checkout.body || '{}');
      assertEq(body.term, 'annual', 'the selected term reaches the worker');
      // The harness aborts the request — the dialog must survive the failure.
      assert(await exists(page, '[data-testid="premium-control"]'), 'control survives a failed checkout');
    },
  },
  {
    name: 'A-3: restore purchase with nothing stored explains itself instead of failing',
    pageOpts: { config: WORKER },
    async fn(page) {
      await openPosterStudio(page);
      await pickLockedStyle(page);
      await page.evaluate(() => document.querySelector('[data-testid="premium-restore"]').click());
      await sleep(500);
      const seen = await toasts(page);
      assert(seen.some(t => /no purchase found in this browser/i.test(t)), `restore toast · got ${JSON.stringify(seen)}`);
    },
  },
  {
    name: 'A-3: restore purchase with a stored license calls /license/verify',
    ownPage: true,
    async fn() {
      const now = Math.floor(Date.now() / 1000);
      const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
      const jwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ iss: 'trainerscodex.com', sub: 'cus_test', email: 't@test.com', plan: 'premium', stripe_session: 'cs_test_x', iat: now, exp: now + 86400 * 30 })}.fakesig`;
      // The stored license flips premium on, so the pitch panel never mounts —
      // restore lives in the compact header control for a premium-hold browser
      // whose UI state was cleared. Use a NON-premium storage state with the
      // license present only for the restore click: seed it after boot.
      const page = await newPage({ config: WORKER });
      try {
        const calls = [];
        page.on('request', req => { if (req.url().startsWith('https://api.example.test/')) calls.push(req.url()); });
        await openPosterStudio(page);
        await pickLockedStyle(page);
        await page.evaluate((j) => localStorage.setItem('trainerscodex.license', j), jwt);
        await page.evaluate(() => document.querySelector('[data-testid="premium-restore"]').click());
        await sleep(800);
        assert(calls.some(u => /\/license\/verify$/.test(u)), `restore must hit /license/verify · saw ${JSON.stringify(calls)}`);
      } finally {
        await closePage(page);
      }
    },
  },
  {
    name: 'D-8: the compact header control carries a terms link and a restore entry (merch studio)',
    pageOpts: { config: WORKER },
    async fn(page) {
      await loadStarterTeam(page);
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('header button')].find(b => b.querySelector('svg.lucide-shopping-bag'));
        if (btn) btn.click();
      });
      await page.waitForSelector('[data-testid="premium-control-compact"]', { timeout: 8000 });
      const ctl = await page.evaluate(() => ({
        legal: !!document.querySelector('[data-testid="premium-control-compact"] a[href$="legal.html"]'),
        restore: !!document.querySelector('[data-testid="premium-restore-compact"]'),
      }));
      assert(ctl.legal, 'terms & refund link beside the compact buy button');
      assert(ctl.restore, 'restore purchase reachable from the merch studio header');
    },
  },
  {
    name: 'D-8: the shell footer links legal.html and dmca.html',
    async fn(page) {
      const links = await page.evaluate(() => ({
        legal: document.querySelector('footer a[href$="legal.html"]')?.getAttribute('href'),
        dmca: document.querySelector('footer a[href$="dmca.html"]')?.getAttribute('href'),
      }));
      assertEq(links.legal, '/legal.html', 'footer legal link');
      assertEq(links.dmca, '/dmca.html', 'footer dmca link');
    },
  },

  // ---- A-6 ----
  {
    name: 'A-6: a ?checkout=cancel return is consumed — URL cleaned, "no charge" toast',
    pageOpts: { query: 'checkout=cancel&session_id=cs_test_cancelled', config: WORKER },
    async fn(page) {
      await sleep(800);
      const { search, seen } = await page.evaluate(() => ({
        search: window.location.search,
        seen: [...document.querySelectorAll('[data-sonner-toast], [role="status"]')].map(el => el.textContent || ''),
      }));
      assert(!/checkout=|session_id=/.test(search), `one-time params must be stripped · got "${search}"`);
      assert(seen.some(t => /cancelled/i.test(t) && /no charge/i.test(t)), `cancel toast · got ${JSON.stringify(seen)}`);
    },
  },
  {
    name: 'A-6: a ?credits=cancel return is consumed the same way',
    pageOpts: { query: 'credits=cancel&session_id=cs_test_cancelled', config: WORKER },
    async fn(page) {
      await sleep(800);
      const { search, seen } = await page.evaluate(() => ({
        search: window.location.search,
        seen: [...document.querySelectorAll('[data-sonner-toast], [role="status"]')].map(el => el.textContent || ''),
      }));
      assert(!/credits=|session_id=/.test(search), `one-time params must be stripped · got "${search}"`);
      assert(seen.some(t => /no charge/i.test(t)), `cancel toast · got ${JSON.stringify(seen)}`);
    },
  },

  // ---- E-7 / E-12 / A-7 / E-6 (Journey setup) ----
  {
    name: 'E-7 + E-12 + A-7: HoF paywall is not a nested button, name input is labelled, singular pitch',
    pageOpts: { config: WORKER, storage: { 'trainerscodex.journey.saves': FINISHED_SAVE } },
    async fn(page) {
      await openJourney(page);
      const setup = await page.evaluate(() => {
        const paywall = document.querySelector('[data-testid="journey-hof-paywall"]');
        const input = document.querySelector('[data-testid="journey-name"]');
        return {
          tag: paywall?.tagName,
          nestedButtons: paywall ? paywall.querySelectorAll('button').length : -1,
          insideButton: !!paywall?.closest('button'),
          text: paywall?.innerText || '',
          labels: input?.labels?.length,
          labelText: input?.labels?.[0]?.innerText || '',
        };
      });
      assert(setup.tag && setup.tag !== 'BUTTON', `paywall wrapper must not be a <button> · got ${setup.tag}`);
      assert(!setup.insideButton, 'paywall must not sit inside a button');
      assertEq(setup.nestedButtons, 1, 'exactly one interactive control (the CTA) inside the paywall');
      assert(/1 finished career in/i.test(setup.text), `singular form for one career · got "${setup.text}"`);
      assertEq(setup.labels, 1, 'trainer-name input has exactly one label');
      assert(/name/i.test(setup.labelText), `label names the field · got "${setup.labelText}"`);
    },
  },
  {
    name: 'A-7: a premium Hall of Fame row resolves {region} — "CULT HERO OF Kanto", never "CULT HERO OF"',
    // No worker: the stored preview flag is how the suite plays premium.
    pageOpts: { storage: { 'trainerscodex.journey.saves': FINISHED_SAVE, 'trainerscodex.premium': 'true' } },
    async fn(page) {
      await openJourney(page);
      await page.waitForSelector('[data-testid="journey-hof-8843-short"]', { timeout: 8000 });
      const row = await page.$eval('[data-testid="journey-hof-8843-short"]', el => el.innerText);
      assert(/CULT HERO OF Kanto/.test(row), `region resolved on the HoF row · got "${row.replace(/\n/g, ' ')}"`);
    },
  },
  {
    name: 'E-6: locked archive rows and save rows are aria-disabled, say "premium", and are not dimmed',
    pageOpts: {
      config: WORKER,
      // Two in-progress careers → the second resume row is a free-tier lock.
      // The archive always lists every past issue since launch.
      storage: {
        'trainerscodex.journey.saves': JSON.stringify([
          { id: '1-short', schema: 2, chapter: 2, savedOn: '2026-09-08', setup: { seed: 1, trainerName: 'Ash', regionId: 'kanto', starterId: 1, archetype: 'aggro', pace: 'express' }, choices: [{ chapterIndex: 0, optionIndex: 0 }], actions: [] },
          { id: '2-short', schema: 2, chapter: 3, savedOn: '2026-09-07', setup: { seed: 2, trainerName: 'Gary', regionId: 'johto', starterId: 152, archetype: 'aggro', pace: 'express' }, choices: [{ chapterIndex: 0, optionIndex: 0 }], actions: [] },
        ]),
      },
    },
    async fn(page) {
      await openJourney(page);
      const rows = await page.evaluate(() => {
        const locked = [...document.querySelectorAll('[data-testid^="journey-resume-"][aria-disabled="true"]')];
        return locked.map(el => ({
          name: el.innerText, opacity: getComputedStyle(el).opacity,
          dashed: getComputedStyle(el).borderStyle,
        }));
      });
      assertGte(rows.length, 1, 'the second in-progress career must be a locked row on the free tier');
      for (const r of rows) {
        assert(/premium|locked/i.test(r.name), `locked save row names its state · got "${r.name}"`);
        assertEq(r.opacity, '1', 'locked row text is not dimmed');
        assert(/dashed/.test(r.dashed), `locked row uses a dashed border · got ${r.dashed}`);
      }

      if (await has(page, '[data-testid="journey-archive-toggle"]')) {
        await page.evaluate(() => document.querySelector('[data-testid="journey-archive-toggle"]').click());
        await page.waitForSelector('[data-testid="journey-archive"]', { timeout: 8000 });
        const arch = await page.evaluate(() =>
          [...document.querySelectorAll('[data-testid^="journey-archive-"]')]
            .filter(el => /journey-archive-\d+$/.test(el.getAttribute('data-testid')))
            .map(el => ({ disabled: el.getAttribute('aria-disabled'), name: el.textContent, opacity: getComputedStyle(el).opacity })));
        assertGte(arch.length, 1, 'at least one past issue row');
        for (const r of arch) {
          assertEq(r.disabled, 'true', 'archive row aria-disabled');
          assert(/premium|locked/i.test(r.name), `archive row accessible text names the lock · got "${r.name}"`);
          assertEq(r.opacity, '1', 'archive row not dimmed');
        }
      }
    },
  },
  {
    name: 'E-6: every locked Legend Card finish chip is aria-disabled with "premium" in its name',
    pageOpts: { query: 'seed=8843&pace=express', config: WORKER },
    async fn(page) {
      await page.waitForSelector('[data-testid="journey-start"]', { timeout: 8000 });
      await page.evaluate(() => document.querySelector('[data-testid="journey-start"]').click());
      for (let step = 0; step < 80; step++) {
        if (await has(page, '[data-testid="journey-retired"]')) break;
        const advanced = await page.evaluate(() => {
          const cont = document.querySelector('[data-testid="journey-continue"]');
          if (cont) { cont.click(); return true; }
          const opts = [...document.querySelectorAll('[data-journey-option="1"]')];
          if (opts.length) { opts[0].click(); return true; }
          return false;
        });
        assert(advanced, `stalled at step ${step}`);
        await sleep(70);
      }
      await page.evaluate(() => document.querySelector('[data-testid="journey-reveal-card"]').click());
      await page.waitForSelector('[data-testid="journey-finish-picker"]', { timeout: 8000 });
      const chips = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="journey-finish-"]')]
          .filter(el => el.tagName === 'BUTTON')
          .map(el => ({
            id: el.getAttribute('data-testid'), locked: !!el.querySelector('svg.lucide-lock'),
            disabled: el.getAttribute('aria-disabled'), name: el.textContent, opacity: getComputedStyle(el).opacity,
          })));
      const locked = chips.filter(c => c.locked);
      assertEq(locked.length, 3, `three premium finishes on the free tier · got ${JSON.stringify(chips)}`);
      for (const c of locked) {
        assertEq(c.disabled, 'true', `${c.id} aria-disabled`);
        assert(/premium|locked/i.test(c.name), `${c.id} accessible name names the lock · got "${c.name}"`);
        assertEq(c.opacity, '1', `${c.id} is not dimmed`);
      }
      const classic = chips.find(c => c.id === 'journey-finish-classic');
      assert(classic && classic.disabled !== 'true', 'classic stays free');
    },
  },
];

const result = await runSuite('premium-gate', tests);
await closeBrowser();
process.exit(result.failed === 0 ? 0 : 1);
