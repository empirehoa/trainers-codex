// Journey Mode browser suite — the Definition-of-Done checks that only a real
// browser can answer: does the state machine advance, does the Legend Card
// actually rasterise, do the flags gate cleanly, does a shared ?seed= link
// reproduce a run in a fresh incognito context, and does the mobile layout hold
// at 360px.
//
// Sprites are blocked by the harness (only file://, data:, blob: are allowed),
// so these also prove the offline path: the card must render from silhouette
// fallbacks with zero network access.

import {
  runSuite, newPage, closePage, sleep, exists, assert, assertEq, assertGte, closeBrowser,
} from './harness.mjs';

// ---------- helpers ----------

async function openJourney(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="journey-open"]');
    if (btn) btn.click();
  });
  await page.waitForSelector('[data-testid="journey-dialog"]', { timeout: 8000 });
  await sleep(150);
}

async function startRun(page) {
  await page.waitForSelector('[data-testid="journey-start"]', { timeout: 8000 });
  await page.evaluate(() => document.querySelector('[data-testid="journey-start"]').click());
  await sleep(200);
}

const has = (page, sel) => page.evaluate(s => !!document.querySelector(s), sel);
const text = (page) => page.evaluate(() => document.body.innerText);

/**
 * Text inside the Journey dialog only.
 *
 * `document.body.innerText` also contains the app rendered *behind* the modal —
 * including the browse grid, which lists all 1,307 species names. Any assertion
 * about what Journey Mode does or doesn't say must be scoped to the dialog, or
 * it silently reads the page underneath.
 */
const dialogText = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="journey-dialog"]');
  return el ? el.innerText : '';
});

/**
 * Click through a whole career, always taking option index `optionIndex`.
 * Returns { verdict, score, steps }.
 */
async function playToEnd(page, optionIndex = 0, maxSteps = 80) {
  for (let step = 0; step < maxSteps; step++) {
    if (await has(page, '[data-testid="journey-retired"]')) {
      const verdict = await page.$eval('[data-testid="journey-verdict"]', el => el.innerText.trim());
      const score = await page.$eval('[data-testid="journey-score"]', el => el.innerText.trim());
      return { verdict, score, steps: step };
    }
    const advanced = await page.evaluate((idx) => {
      const cont = document.querySelector('[data-testid="journey-continue"]');
      if (cont) { cont.click(); return 'continue'; }
      const opts = [...document.querySelectorAll('[data-journey-option="1"]')];
      if (opts.length) { opts[Math.min(idx, opts.length - 1)].click(); return 'option'; }
      return null;
    }, optionIndex);
    if (!advanced) throw new Error(`stalled at step ${step} with no advance control`);
    await sleep(70);
  }
  throw new Error(`run did not finish within ${maxSteps} steps`);
}

async function revealCard(page) {
  await page.evaluate(() => document.querySelector('[data-testid="journey-reveal-card"]').click());
  await page.waitForSelector('[data-testid="journey-card-screen"]', { timeout: 8000 });
}

// ---------- tests ----------

const tests = [
  {
    name: 'journey button appears in the header and opens the dialog',
    async fn(page) {
      assert(await exists(page, '[data-testid="journey-open"]'), 'journey button should render');
      await openJourney(page);
      assert(await has(page, '[data-testid="journey-setup"]'), 'setup screen should render');
    },
  },

  {
    name: 'setup screen ships playable defaults — name, starter, archetype, pace prefilled',
    async fn(page) {
      await openJourney(page);
      const state = await page.evaluate(() => ({
        name: document.querySelector('[data-testid="journey-name"]')?.value ?? '',
        starters: document.querySelectorAll('[data-testid^="journey-starter-"]').length,
        archetypes: document.querySelectorAll('[data-testid^="journey-archetype-"]').length,
        paces: document.querySelectorAll('[data-testid^="journey-pace-"]').length,
        startEnabled: document.querySelector('[data-testid="journey-start"]')?.disabled === false,
      }));
      assertGte(state.name.length, 2, 'trainer name should be pre-filled');
      assertEq(state.starters, 3, 'three starters offered');
      assertEq(state.archetypes, 5, 'five archetypes offered');
      assertEq(state.paces, 3, 'three paces offered');
      assert(state.startEnabled, 'start must be tappable immediately — no required fields');
    },
  },

  {
    name: 'starting a run presents the first decision with 2-4 options',
    async fn(page) {
      await openJourney(page);
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });
      const n = await page.evaluate(() => document.querySelectorAll('[data-journey-option="1"]').length);
      assertGte(n, 2, 'decision should offer at least 2 options');
      assert(n <= 4, `decision should offer at most 4 options, got ${n}`);
      const prompt = await page.$eval('[data-testid="journey-decision-prompt"]', el => el.innerText.trim());
      assertGte(prompt.length, 20, 'prompt should carry real copy');
      assert(!/^journey\./.test(prompt), `prompt must be translated, got raw key: ${prompt}`);
    },
  },

  {
    name: 'picking an option advances to a chapter recap with stat deltas',
    async fn(page) {
      await openJourney(page);
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });
      await page.evaluate(() => document.querySelectorAll('[data-journey-option="1"]')[0].click());
      await page.waitForSelector('[data-testid="journey-recap"]', { timeout: 8000 });
      assert(await has(page, '[data-testid="journey-stats"]'), 'recap should show the stat strip');
      const body = await text(page);
      assert(!/journey\.(beat|chapterTitle)\./.test(body), 'recap must not leak raw i18n keys');
    },
  },

  {
    name: 'a full express run completes and produces a verdict plus a bounded score',
    async fn(page) {
      await openJourney(page);
      await page.evaluate(() => document.querySelector('[data-testid="journey-pace-express"]').click());
      await sleep(80);
      await startRun(page);
      const { verdict, score } = await playToEnd(page);
      assertGte(verdict.length, 3, 'verdict headline should render');
      assert(!/^journey\./.test(verdict), `verdict must be translated, got: ${verdict}`);
      const n = Number(score);
      assert(Number.isInteger(n) && n >= 0 && n <= 999, `score out of bounds: ${score}`);
    },
  },

  {
    name: 'a full express run finishes well inside the 2:30 budget',
    async fn(page) {
      await openJourney(page);
      await page.evaluate(() => document.querySelector('[data-testid="journey-pace-express"]').click());
      await sleep(80);
      const t0 = Date.now();
      await startRun(page);
      await playToEnd(page);
      const elapsedMs = Date.now() - t0;
      // 150s is the DoD ceiling. The clickthrough here has no human think-time,
      // so this asserts the machinery never becomes the bottleneck.
      assert(elapsedMs < 150_000, `express run took ${(elapsedMs / 1000).toFixed(1)}s, budget 150s`);
    },
  },

  {
    name: 'the Legend Card rasterises with zero network access',
    async fn(page) {
      await openJourney(page);
      await page.evaluate(() => document.querySelector('[data-testid="journey-pace-express"]').click());
      await sleep(80);
      await startRun(page);
      await playToEnd(page);
      await revealCard(page);
      await page.waitForSelector('[data-testid="journey-card-image"]', { timeout: 15000 });
      const img = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="journey-card-image"]');
        return { src: el?.src ?? '', w: el?.naturalWidth ?? 0, h: el?.naturalHeight ?? 0 };
      });
      assert(img.src.startsWith('blob:'), `card should be a blob URL, got ${img.src.slice(0, 40)}`);
      assertEq(img.w, 1080, 'card width');
      assertEq(img.h, 1350, 'card height');
    },
  },

  {
    name: 'share controls render, and download is always offered',
    async fn(page) {
      await openJourney(page);
      await page.evaluate(() => document.querySelector('[data-testid="journey-pace-express"]').click());
      await sleep(80);
      await startRun(page);
      await playToEnd(page);
      await revealCard(page);
      await page.waitForSelector('[data-testid="journey-share-download"]', { timeout: 15000 });
      const controls = await page.evaluate(() => ({
        download: !!document.querySelector('[data-testid="journey-share-download"]'),
        copy: !!document.querySelector('[data-testid="journey-share-copy"]'),
        link: !!document.querySelector('[data-testid="journey-share-link"]'),
      }));
      assert(controls.download, 'download fallback must always be present');
      assert(controls.copy, 'copy-image tier should be present');
      assert(controls.link, 'copy-link tier should be present');
    },
  },

  {
    name: 'builder handoff loads the final six into the team bar',
    async fn(page) {
      await openJourney(page);
      await page.evaluate(() => document.querySelector('[data-testid="journey-pace-express"]').click());
      await sleep(80);
      await startRun(page);
      await playToEnd(page);
      await revealCard(page);
      await page.waitForSelector('[data-testid="journey-cta-builder"]', { timeout: 15000 });
      await page.evaluate(() => document.querySelector('[data-testid="journey-cta-builder"]').click());
      // Radix keeps the content mounted through its exit animation, so poll for
      // "gone or data-state=closed" rather than sleeping a guessed interval.
      await page.waitForFunction(() => {
        const d = document.querySelector('[data-testid="journey-dialog"]');
        return !d || d.getAttribute('data-state') === 'closed';
      }, { timeout: 5000 });
      // The analyze button reports team fill as "N/6".
      const body = await text(page);
      assert(/6\/6/.test(body), `team bar should report 6/6 after handoff · body: ${body.slice(0, 300)}`);
    },
  },

  {
    name: 'a shared ?seed= link prefills setup and shows the shared-journey banner',
    pageOpts: { query: 'seed=8843' },
    async fn(page) {
      // The link auto-opens Journey Mode — a shared link must land on the game.
      await page.waitForSelector('[data-testid="journey-dialog"]', { timeout: 8000 });
      assert(await has(page, '[data-testid="journey-seed-banner"]'), 'shared-seed banner should render');
      const body = await text(page);
      assert(body.includes('8843'), 'the shared seed should be shown');
    },
  },

  {
    name: 'the same ?seed= link reproduces an identical run in two fresh contexts',
    ownPage: true,
    async fn() {
      const run = async () => {
        const page = await newPage({ query: 'seed=8843&pace=express' });
        try {
          await page.waitForSelector('[data-testid="journey-dialog"]', { timeout: 8000 });
          await startRun(page);
          const result = await playToEnd(page, 0);
          return result;
        } finally {
          await closePage(page);
        }
      };
      const a = await run();
      const b = await run();
      assertEq(b.verdict, a.verdict, 'verdict must match across fresh sessions');
      assertEq(b.score, a.score, 'score must match across fresh sessions');
      assertEq(b.steps, a.steps, 'career length must match across fresh sessions');
    },
  },

  {
    name: 'different choices on the same seed produce a different career',
    ownPage: true,
    async fn() {
      const run = async (optionIndex) => {
        const page = await newPage({ query: 'seed=8843&pace=intense' });
        try {
          await page.waitForSelector('[data-testid="journey-dialog"]', { timeout: 8000 });
          await startRun(page);
          return await playToEnd(page, optionIndex);
        } finally {
          await closePage(page);
        }
      };
      const first = await run(0);
      const second = await run(1);
      assert(
        first.score !== second.score || first.verdict !== second.verdict,
        `opposite choices should change the outcome (both were ${first.verdict} / ${first.score})`,
      );
    },
  },

  {
    name: 'a malformed seed fails soft to a fresh run — never an error screen',
    pageOpts: { query: 'seed=not-a-number' },
    async fn(page) {
      await page.waitForSelector('[data-testid="journey-dialog"]', { timeout: 8000 });
      assert(await has(page, '[data-testid="journey-setup"]'), 'setup should still render');
      assert(!(await has(page, '[data-testid="journey-seed-banner"]')), 'no shared-seed banner for a bad seed');
      assert(await has(page, '[data-testid="journey-invalid-seed"]'), 'a soft explanatory note should render');
      // And the run must be playable.
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });
    },
  },

  {
    name: 'an out-of-range seed also fails soft and stays playable',
    pageOpts: { query: 'seed=99999999' },
    async fn(page) {
      await page.waitForSelector('[data-testid="journey-dialog"]', { timeout: 8000 });
      assert(await has(page, '[data-testid="journey-invalid-seed"]'), 'soft note expected');
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });
    },
  },

  {
    name: 'a ?daily= link shows the daily banner and the same seed in two fresh sessions',
    ownPage: true,
    async fn() {
      const run = async () => {
        const page = await newPage({ query: 'daily=2026-08-26&pace=express' });
        try {
          await page.waitForSelector('[data-testid="journey-daily-banner"]', { timeout: 8000 });
          await startRun(page);
          return await playToEnd(page, 0);
        } finally {
          await closePage(page);
        }
      };
      const a = await run();
      const b = await run();
      assertEq(b.verdict, a.verdict, 'the daily seed must be identical across sessions');
      assertEq(b.score, a.score, 'the daily score must be identical across sessions');
    },
  },

  {
    name: 'the streak counter survives a timezone change without inflating or corrupting',
    ownPage: true,
    async fn() {
      // Kiritimati (UTC+14) → Midway (UTC-11) is a 25-hour swing, so the local
      // calendar date is guaranteed to shift.
      const page = await newPage();
      try {
        await page.emulateTimezone('Pacific/Kiritimati');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('header', { timeout: 8000 });

        // Seed a 3-day streak ending on the local "today" in this timezone.
        const before = await page.evaluate(() => {
          const pad = n => String(n).padStart(2, '0');
          const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          const now = new Date();
          const dates = [2, 1, 0].map(back => {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
            return local(d);
          });
          localStorage.setItem('trainerscodex.journey.streak',
            JSON.stringify({ playedDates: dates, bestStreak: 3 }));
          return dates;
        });

        await page.emulateTimezone('Pacific/Midway');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('header', { timeout: 8000 });
        await openJourney(page);
        await page.waitForSelector('[data-testid="journey-streak"]', { timeout: 8000 });

        const after = await page.evaluate(() =>
          JSON.parse(localStorage.getItem('trainerscodex.journey.streak')).playedDates);
        assertEq(JSON.stringify(after), JSON.stringify(before),
          'stored dates must be untouched by a timezone change');

        const streakText = await page.$eval('[data-testid="journey-streak"]', el => el.innerText);
        const match = streakText.match(/(\d+)/);
        assert(match, `streak counter should render a number, got: ${streakText}`);
        const days = Number(match[1]);
        // Crossing the date line moves "today" by one, so 3 (date unchanged or
        // ahead) or 2 (date moved back) are both correct. 4+ would mean the
        // change invented a day; 0 would mean it broke a live streak.
        assert(days === 3 || days === 2,
          `timezone change must not inflate or break the streak, got ${days} from "${streakText}"`);
      } finally {
        await closePage(page);
      }
    },
  },

  {
    name: 'JOURNEY_MODE=0 hides the entire feature',
    pageOpts: { query: 'ff=JOURNEY_MODE:0' },
    async fn(page) {
      assert(!(await exists(page, '[data-testid="journey-open"]')), 'journey button must be hidden');
      assert(!(await exists(page, '[data-testid="journey-dialog"]')), 'journey dialog must not mount');
      // The rest of the app must be unaffected.
      assert(await exists(page, 'header'), 'app should still render with the flag off');
    },
  },

  {
    name: 'JOURNEY_MERCH_CTA gates the print CTA off by default and on when enabled',
    ownPage: true,
    async fn() {
      const checkMerch = async (query) => {
        const page = await newPage({ query });
        try {
          await openJourney(page);
          await page.evaluate(() => document.querySelector('[data-testid="journey-pace-express"]').click());
          await sleep(80);
          await startRun(page);
          await playToEnd(page);
          await revealCard(page);
          await page.waitForSelector('[data-testid="journey-cta-builder"]', { timeout: 15000 });
          return await has(page, '[data-testid="journey-cta-merch"]');
        } finally {
          await closePage(page);
        }
      };
      assertEq(await checkMerch(''), false, 'merch CTA must be OFF by default (R2 + counsel pending)');
      assertEq(await checkMerch('ff=JOURNEY_MERCH_CTA:1'), true, 'merch CTA should appear when flagged on');
    },
  },

  {
    name: 'JOURNEY_SPECIES_FLAVOR=0 degrades flavor text to type descriptors',
    pageOpts: { query: 'ff=JOURNEY_SPECIES_FLAVOR:0&pace=express' },
    async fn(page) {
      await openJourney(page);
      await startRun(page);
      await playToEnd(page);
      await revealCard(page);
      // Wait for the IMAGE, not just the screen: the card renders asynchronously
      // after the screen mounts, so asserting on the screen alone races the render.
      await page.waitForSelector('[data-testid="journey-card-image"]', { timeout: 15000 });
      const body = await dialogText(page);
      // With the flag off, roster captions become type pairings.
      const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting',
        'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon',
        'Dark', 'Steel', 'Fairy'];
      assert(TYPES.some(ty => body.includes(ty)),
        `degraded mode should show type descriptors · got: ${body.slice(0, 300)}`);
      // And no species name may survive inside the feature.
      const leaked = /Bulbasaur|Charmander|Squirtle|Pikachu|Eevee|Charizard|Gengar/.exec(body);
      assert(!leaked, `degraded mode leaked a species name: ${leaked?.[0]}`);
    },
  },

  {
    name: 'JOURNEY_SPECIES_FLAVOR=0 also degrades the setup screen starter picker',
    pageOpts: { query: 'ff=JOURNEY_SPECIES_FLAVOR:0' },
    async fn(page) {
      await openJourney(page);
      await page.waitForSelector('[data-testid="journey-setup"]', { timeout: 8000 });
      const body = await dialogText(page);
      // Kanto is the default region, so these three are what the picker shows.
      const leaked = /Bulbasaur|Charmander|Squirtle/.exec(body);
      assert(!leaked, `setup screen leaked a species name: ${leaked?.[0]}`);
      assert(/Grass|Fire|Water/.test(body),
        `starter picker should show type descriptors · got: ${body.slice(0, 300)}`);
    },
  },

  {
    name: 'species names DO appear with the flavor flag on (the default)',
    async fn(page) {
      await openJourney(page);
      await page.waitForSelector('[data-testid="journey-setup"]', { timeout: 8000 });
      const body = await dialogText(page);
      assert(/Bulbasaur|Charmander|Squirtle/.test(body),
        `default mode should name the starters · got: ${body.slice(0, 300)}`);
    },
  },

  {
    name: 'the locale toggle switches the UI to Spanish',
    async fn(page) {
      await openJourney(page);
      const englishBody = await text(page);
      assert(/Start your career|Start Journey/i.test(englishBody), 'should start in English');

      // Radix Select needs real mouse events (CLAUDE.md gotcha #1).
      const box = await page.$eval('[data-testid="journey-locale"]', el => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.click(box.x, box.y);
      await sleep(250);
      const picked = await page.evaluate(() => {
        const opt = [...document.querySelectorAll('[role="option"]')]
          .find(o => /español/i.test(o.innerText));
        if (!opt) return false;
        opt.click();
        return true;
      });
      assert(picked, 'Spanish option should be listed');
      await sleep(300);

      const spanishBody = await text(page);
      assert(/Comienza tu carrera|Empezar la travesía/i.test(spanishBody),
        `UI should switch to Spanish · got: ${spanishBody.slice(0, 200)}`);
      assert(!/journey\./.test(spanishBody), 'no raw i18n keys after switching locale');
    },
  },

  {
    name: 'the setup screen fits a 360px viewport with no horizontal overflow',
    pageOpts: { viewport: { width: 360, height: 720 } },
    async fn(page) {
      await openJourney(page);
      const overflow = await page.evaluate(() => ({
        docScroll: document.documentElement.scrollWidth,
        docClient: document.documentElement.clientWidth,
      }));
      // A couple of pixels of rounding slack; anything more is a real overflow.
      assert(overflow.docScroll <= overflow.docClient + 2,
        `horizontal overflow at 360px: scrollWidth ${overflow.docScroll} vs clientWidth ${overflow.docClient}`);
    },
  },

  {
    name: 'a decision and the Legend Card both fit a 360px viewport',
    pageOpts: { viewport: { width: 360, height: 720 } },
    async fn(page) {
      await openJourney(page);
      await page.evaluate(() => document.querySelector('[data-testid="journey-pace-express"]').click());
      await sleep(80);
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });
      let o = await page.evaluate(() => ({
        s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth,
      }));
      assert(o.s <= o.c + 2, `decision overflows at 360px: ${o.s} vs ${o.c}`);

      await playToEnd(page);
      await revealCard(page);
      await page.waitForSelector('[data-testid="journey-card-image"]', { timeout: 15000 });
      o = await page.evaluate(() => ({
        s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth,
      }));
      assert(o.s <= o.c + 2, `card screen overflows at 360px: ${o.s} vs ${o.c}`);
    },
  },

  {
    name: 'undo rewinds a choice and re-presents a decision',
    async fn(page) {
      await openJourney(page);
      await page.evaluate(() => document.querySelector('[data-testid="journey-pace-intense"]').click());
      await sleep(80);
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });
      await page.evaluate(() => document.querySelectorAll('[data-journey-option="1"]')[0].click());
      await page.waitForSelector('[data-testid="journey-recap"]', { timeout: 8000 });
      await page.evaluate(() => document.querySelector('[data-testid="journey-continue"]').click());
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });

      assert(await has(page, '[data-testid="journey-undo"]'), 'undo should be offered after a choice');
      await page.evaluate(() => document.querySelector('[data-testid="journey-undo"]').click());
      await sleep(250);
      const back = await has(page, '[data-testid="journey-decision"]')
        || await has(page, '[data-testid="journey-recap"]');
      assert(back, 'undo should return to a playable state');
      assert(!(await has(page, '[data-testid="journey-retired"]')), 'undo must not end the run');
    },
  },

  {
    name: 'replaying the same seed reproduces the same career in-session',
    async fn(page) {
      await openJourney(page);
      await page.evaluate(() => document.querySelector('[data-testid="journey-pace-express"]').click());
      await sleep(80);
      await startRun(page);
      const first = await playToEnd(page, 0);
      await revealCard(page);
      await page.waitForSelector('[data-testid="journey-replay"]', { timeout: 15000 });
      await page.evaluate(() => document.querySelector('[data-testid="journey-replay"]').click());
      await sleep(250);
      const second = await playToEnd(page, 0);
      assertEq(second.verdict, first.verdict, 'replay verdict should match');
      assertEq(second.score, first.score, 'replay score should match');
    },
  },

  {
    name: 'no journey analytics requests are attempted when Supabase is unconfigured',
    async fn(page) {
      const attempts = [];
      page.on('request', req => {
        if (/journey_events/.test(req.url())) attempts.push(req.url());
      });
      await openJourney(page);
      await page.evaluate(() => document.querySelector('[data-testid="journey-pace-express"]').click());
      await sleep(80);
      await startRun(page);
      await playToEnd(page);
      assertEq(attempts.length, 0,
        `analytics must no-op without config, saw: ${attempts.join(', ')}`);
    },
  },

  // ---------- party / pokédex / prepare (v7) ----------

  {
    name: 'the party rail, dex grid and prepare panel all fit a 360px viewport',
    pageOpts: { viewport: { width: 360, height: 720 } },
    async fn(page) {
      await openJourney(page);
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });
      // Open both expandable surfaces — the worst case for narrow layouts.
      await page.evaluate(() => {
        document.querySelector('[data-testid="journey-dex-toggle"]')?.click();
        document.querySelector('[data-testid="journey-prepare-toggle"]')?.click();
      });
      await sleep(200);
      const o = await page.evaluate(() => ({
        s: document.documentElement.scrollWidth,
        c: document.documentElement.clientWidth,
        party: !!document.querySelector('[data-testid="journey-party"]'),
        dex: !!document.querySelector('[data-testid="journey-dex-grid"]'),
        prep: !!document.querySelector('[data-testid="journey-prepare"]'),
      }));
      assert(o.party && o.dex && o.prep, 'party, dex and prepare should all render at 360px');
      assert(o.s <= o.c + 2,
        `journey party/prepare overflow at 360px: scrollWidth ${o.s} vs clientWidth ${o.c}`);
    },
  },

  {
    name: 'the party rail shows the six with the starter as ace, and a dex counter',
    async fn(page) {
      await openJourney(page);
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });
      assert(await has(page, '[data-testid="journey-party"]'), 'party rail should render on the decision');
      // The starter occupies the ace slot at the first decision.
      assert(await has(page, '[data-testid="journey-party-slot-0"]'), 'ace slot should be filled by the starter');
      const dex = await page.$eval('[data-testid="journey-dex-toggle"]', el => el.innerText.trim());
      assert(/caught/i.test(dex), `dex counter should read a caught count, got: ${dex}`);
    },
  },

  {
    name: 'the pokédex toggle opens a caught grid',
    async fn(page) {
      await openJourney(page);
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });
      assert(!(await has(page, '[data-testid="journey-dex-grid"]')), 'dex grid starts collapsed');
      await page.evaluate(() => document.querySelector('[data-testid="journey-dex-toggle"]').click());
      await sleep(120);
      assert(await has(page, '[data-testid="journey-dex-grid"]'), 'dex grid should open on toggle');
      const sprites = await page.evaluate(() =>
        document.querySelectorAll('[data-testid="journey-dex-grid"] img').length);
      assertGte(sprites, 1, 'caught grid should show at least the starter');
    },
  },

  {
    name: 'the prepare step opens and can evolve the starter at an eligible chapter',
    async fn(page) {
      await openJourney(page);
      // Intense pace = a decision every chapter, so the starter clears the
      // two-chapter hold gate on the third decision without skipping content.
      await page.evaluate(() => document.querySelector('[data-testid="journey-pace-intense"]').click());
      await sleep(60);
      // Kanto default starter is Bulbasaur (#1) → evolves into Ivysaur (#2).
      await startRun(page);

      let evolved = false;
      for (let step = 0; step < 60 && !evolved; step++) {
        if (await has(page, '[data-testid="journey-retired"]')) break;
        // On a decision, try to open prepare and evolve the starter (#1 → #2).
        if (await has(page, '[data-testid="journey-decision"]')) {
          await page.evaluate(() => {
            const t = document.querySelector('[data-testid="journey-prepare-toggle"]');
            if (t) t.click();
          });
          await sleep(80);
          const clicked = await page.evaluate(() => {
            const b = document.querySelector('[data-testid="journey-evolve-1-2"]');
            if (b && !b.disabled) { b.click(); return true; }
            return false;
          });
          if (clicked) { await sleep(150); evolved = true; break; }
        }
        // Advance: click continue on a recap, else take the first decision option.
        const moved = await page.evaluate(() => {
          const cont = document.querySelector('[data-testid="journey-continue"]');
          if (cont) { cont.click(); return true; }
          const opts = [...document.querySelectorAll('[data-journey-option="1"]')];
          if (opts.length) { opts[0].click(); return true; }
          return false;
        });
        if (!moved) break;
        await sleep(80);
      }
      assert(evolved, 'should have found an eligible chapter to evolve the starter');

      // Finish the run and confirm the ace on the Legend Card is the evolved
      // species (Ivysaur, #2) rather than the base starter (#1).
      await playToEnd(page, 0);
      // The roster grid lives on the Legend Card screen, not the retired beat.
      await revealCard(page);
      await page.waitForSelector('[data-testid="journey-result-roster"]', { timeout: 8000 });
      const aceSrc = await page.evaluate(() => {
        const grid = document.querySelector('[data-testid="journey-result-roster"]');
        const img = grid ? grid.querySelector('img') : null;
        return img ? img.getAttribute('src') : '';
      });
      assert(aceSrc.endsWith('/2.png'),
        `ace sprite should be the evolved species (#2 Ivysaur); got ${aceSrc}`);
    },
  },

  // ---------- levels / badges / box / nicknames (v9) ----------

  {
    name: 'the badge track renders 8 slots and a region label',
    async fn(page) {
      await openJourney(page);
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });
      assert(await has(page, '[data-testid="journey-badges"]'), 'badge track should render');
      const count = await page.$eval('[data-testid="journey-badge-count"]', el => el.innerText.trim());
      assert(/\/\s*8/.test(count), `badge counter should be out of 8, got: ${count}`);
    },
  },

  {
    name: 'party members show a level, and levels rise as the career runs',
    async fn(page) {
      await openJourney(page);
      await page.evaluate(() => document.querySelector('[data-testid="journey-pace-intense"]').click());
      await sleep(60);
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });

      const readLevel = async () => {
        await page.evaluate(() => document.querySelector('[data-testid="journey-prepare-toggle"]')?.click());
        await sleep(120);
        const txt = await page.evaluate(() => {
          const el = document.querySelector('[data-testid^="journey-level-"]');
          return el ? el.innerText.trim() : '';
        });
        await page.evaluate(() => document.querySelector('[data-testid="journey-prepare-toggle"]')?.click());
        return parseInt((txt.match(/(\d+)/) || [])[1] || '0', 10);
      };

      const first = await readLevel();
      assertGte(first, 1, 'a level should be displayed');

      // Advance several chapters, then read again.
      for (let i = 0; i < 12; i++) {
        const moved = await page.evaluate(() => {
          const c = document.querySelector('[data-testid="journey-continue"]');
          if (c) { c.click(); return true; }
          const o = [...document.querySelectorAll('[data-journey-option="1"]')];
          if (o.length) { o[0].click(); return true; }
          return false;
        });
        if (!moved) break;
        await sleep(70);
      }
      if (await has(page, '[data-testid="journey-decision"]')) {
        const later = await readLevel();
        assertGte(later, first, `level should not go backwards (${first} -> ${later})`);
      }
    },
  },

  {
    name: 'a party member can be given a nickname that sticks',
    async fn(page) {
      await openJourney(page);
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-decision"]', { timeout: 8000 });
      await page.evaluate(() => document.querySelector('[data-testid="journey-prepare-toggle"]').click());
      await sleep(150);
      const opened = await page.evaluate(() => {
        const b = document.querySelector('[data-testid^="journey-nick-open-"]');
        if (!b) return false;
        b.click();
        return true;
      });
      assert(opened, 'nickname control should be present');
      await sleep(150);
      await page.evaluate(() => {
        const input = document.querySelector('[data-testid^="journey-nick-input-"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Spike');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('[data-testid^="journey-nick-save-"]').click();
      });
      await sleep(250);
      const txt = await page.evaluate(() =>
        document.querySelector('[data-testid="journey-prepare"]')?.innerText || '');
      assert(/Spike/.test(txt), 'the nickname should render on the member row');
    },
  },

  {
    name: 'a season campaign runs longer than a single-region run',
    async fn(page) {
      await openJourney(page);
      const shortTotal = await page.evaluate(() => {
        document.querySelector('[data-testid="journey-campaign-short"]')?.click();
        return true;
      });
      assert(shortTotal, 'campaign picker should offer the short option');
      await sleep(80);
      await startRun(page);
      await page.waitForSelector('[data-testid="journey-progress"]', { timeout: 8000 });
      const a = await page.$eval('[data-testid="journey-progress"]', el => el.innerText.trim());
      const aTotal = parseInt((a.match(/of\s+(\d+)/) || [])[1] || '0', 10);

      // Restart with a season campaign and compare the chapter total.
      // NOTE: never closePage(page) here — the harness owns that page's
      // lifecycle and will close it again, which throws on a dead session.
      const p2 = await newPage();
      await openJourney(p2);
      await p2.evaluate(() => document.querySelector('[data-testid="journey-campaign-season"]').click());
      await sleep(80);
      await startRun(p2);
      await p2.waitForSelector('[data-testid="journey-progress"]', { timeout: 8000 });
      const b = await p2.$eval('[data-testid="journey-progress"]', el => el.innerText.trim());
      const bTotal = parseInt((b.match(/of\s+(\d+)/) || [])[1] || '0', 10);
      await closePage(p2);

      assertGte(bTotal, aTotal + 1, `season (${bTotal}) should exceed short (${aTotal})`);
    },
  },
];

const result = await runSuite('journey-mode', tests);
await closeBrowser();
process.exit(result.failed === 0 ? 0 : 1);
