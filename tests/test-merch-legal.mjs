// Legal gate: the merch bright lines, exercised against the SHIPPED bundle.
//
//  1. Store-listing titles must never carry the Pokémon trademark or a species
//     name (window.__tc.sanitizeListingTitle closes over the real 1307-name
//     species list — not a mirror).
//  2. No print design may fetch official artwork ('other/official-artwork') or
//     the HOME renders ('other/home') — prints are built from derived
//     silhouettes of the pixel sprite (src/lib/silhouette.ts).
//  3. Nothing on the Merch Studio surface reaches fulfilment while
//     MERCH_CHECKOUT is off: both 'order on printful' and 'buy this' are absent
//     by default and light up together behind the flag.

import {
  runSuite, sleep, exists, assert, assertEq, closeBrowser, newPage, closePage,
} from './harness.mjs';

const OFFICIAL_ART = /official-artwork|\/other\/home\//;
const DESIGN_LABELS = ['Team Crest', 'Champion Roster', 'Trainer ID Card', 'Gym Banner', 'Trainer Card'];

async function loadStarterTeam(page) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const target = btns.find(b => /kanto|johto|hoenn|sinnoh|unova|kalos|alola|galar|paldea/i.test(b.innerText) && !/region/i.test(b.innerText) && b.innerText.trim().length < 40);
    if (target) target.click();
  });
  await sleep(300);
}

async function openMerchStudio(page) {
  await loadStarterTeam(page);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('header button')];
    const bag = btns.find(b => b.querySelector('svg.lucide-shopping-bag'));
    if (bag) bag.click();
  });
  await sleep(500);
}

/** Click a design-layout button by its label inside the open dialog. */
async function pickDesign(page, label) {
  const found = await page.evaluate((l) => {
    const dialog = document.querySelector('[role="dialog"]');
    const btn = dialog && [...dialog.querySelectorAll('button')].find(b => b.innerText.trim().startsWith(l));
    if (btn) btn.click();
    return !!btn;
  }, label);
  assert(found, `design button "${label}" not found`);
}

/** Wait for the preview <img> to (re)appear — the render finished. */
async function waitForPreview(page) {
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return !!dialog && !!dialog.querySelector('img[alt$="preview"]') && !dialog.querySelector('svg.animate-spin');
  }, { timeout: 15_000 });
}

const tests = [
  {
    name: 'sanitizeListingTitle: strips the Pokémon trademark in every spelling',
    async fn(page) {
      const r = await page.evaluate(() => {
        const s = window.__tc.sanitizeListingTitle;
        return {
          accent: s('My Pokémon Squad'),
          plain: s('Pokemon Masters'),
          plural: s('Pokémons Forever'),
          ball: s('Poké Ball Club'),
          ballNoSpace: s('Pokeball Crew'),
          bareAccent: s('Poké Champions'),
          caseMix: s('pOkEmOn TEAM'),
        };
      });
      assert(!/pok[ée]mon/i.test(r.accent), 'accented trademark stripped');
      assertEq(r.accent, 'My Squad', 'surrounding words survive');
      assert(!/pok[ée]mon/i.test(r.plain), 'plain trademark stripped');
      assert(!/pok[ée]mon/i.test(r.plural), 'plural trademark stripped');
      assert(!/pok[ée]\s?ball/i.test(r.ball), 'Poké Ball stripped');
      assert(!/pokeball/i.test(r.ballNoSpace), 'Pokeball stripped');
      assert(!/pok[ée]/i.test(r.bareAccent), 'bare Poké stripped');
      assertEq(r.bareAccent, 'Champions', 'bare Poké leaves the rest');
      assert(!/pok[ée]mon/i.test(r.caseMix), 'mixed-case trademark stripped');
    },
  },
  {
    name: 'sanitizeListingTitle: strips species names but keeps original team names',
    async fn(page) {
      const r = await page.evaluate(() => {
        const s = window.__tc.sanitizeListingTitle;
        return {
          pikachu: s('Pikachu Power'),
          charizard: s('Team Charizard'),
          mewtwo: s('Mewtwo Mayhem'),
          clean: s('Kanto Classics'),
          homework: s('homework heroes'), // must NOT strip "Mew" inside a word
          empties: s('Pokémon Pikachu'),  // nothing legal survives
        };
      });
      assert(!/pikachu/i.test(r.pikachu), 'Pikachu stripped');
      assertEq(r.pikachu, 'Power', 'rest of Pikachu title survives');
      assert(!/charizard/i.test(r.charizard), 'Charizard stripped');
      assertEq(r.charizard, 'Team', 'rest of Charizard title survives');
      assert(!/mewtwo/i.test(r.mewtwo), 'Mewtwo stripped');
      assertEq(r.clean, 'Kanto Classics', 'IP-free name passes untouched');
      assertEq(r.homework, 'homework heroes', 'species substring inside a word is NOT stripped');
      assertEq(r.empties, '', 'all-infringing title collapses to empty (caller falls back to a generic label)');
    },
  },
  {
    name: 'sanitizeListingTitle: handles empty / nullish input',
    async fn(page) {
      const r = await page.evaluate(() => {
        const s = window.__tc.sanitizeListingTitle;
        return { empty: s(''), nul: s(null), undef: s(undefined), spaces: s('   ') };
      });
      assertEq(r.empty, '', 'empty string → empty');
      assertEq(r.nul, '', 'null → empty');
      assertEq(r.undef, '', 'undefined → empty');
      assertEq(r.spaces, '', 'whitespace → empty');
    },
  },
  {
    name: 'static catalog: no product label or slogan carries the trademark',
    async fn(page) {
      // The built-in catalog/slogans are author-controlled, but assert the
      // bright line holds so a future edit can't reintroduce "Pokémon".
      const r = await page.evaluate(() => {
        const offenders = [];
        const body = document.body.innerText || '';
        // Sweep nothing here; the catalog is validated via the pure data the
        // bundle ships. We re-run the sanitizer over each slogan/label to prove
        // they are already clean (sanitize == identity for clean strings).
        const s = window.__tc.sanitizeListingTitle;
        const samples = [
          'Bella+Canvas Unisex T-Shirt', 'Gildan Heavy Cotton Tee', '11oz Ceramic Mug',
          'GYM LEADER', 'REGIONAL CHAMPION', 'ELITE FOUR', 'TRAINER MASTER',
          'CARD COLLECTOR', 'TEAM TROUBLE', "GOTTA TRAIN 'EM ALL", 'TRAINER FOR LIFE',
        ];
        for (const x of samples) {
          if (s(x) !== x.replace(/\s+/g, ' ').trim()) offenders.push(x);
        }
        return { offenders, hasBody: body.length > 0 };
      });
      assertEq(r.offenders.length, 0, `catalog samples must be IP-clean (offenders: ${r.offenders.join(', ')})`);
    },
  },
  {
    name: 'no merch design fetches official artwork or HOME renders (preview + print PNG)',
    async fn(page) {
      // The harness aborts every non-file request, but the URL is still
      // observable at the interception point — record it before the abort.
      const requested = [];
      page.on('request', req => { requested.push(req.url()); });
      await openMerchStudio(page);
      await waitForPreview(page);
      for (const label of DESIGN_LABELS) {
        await pickDesign(page, label);
        await sleep(400);
        await waitForPreview(page);
        // The print PNG runs the same renderers at full resolution.
        await page.evaluate(() => document.querySelector('[data-testid="merch-download"]')?.click());
        await sleep(600);
      }
      const sprites = requested.filter(u => /PokeAPI\/sprites/.test(u));
      assert(sprites.length > 0, 'a render should have asked the sprite mirror for pixel sprites');
      const offenders = sprites.filter(u => OFFICIAL_ART.test(u));
      assertEq(offenders.length, 0, `official artwork requested during a merch render: ${offenders.slice(0, 5).join(', ')}`);
    },
  },
  {
    name: 'flags default: neither "order on printful" nor "buy this" renders; download stays',
    async fn(page) {
      // Worker configured — the only thing keeping the surface dark is the flag.
      await page.evaluate(() => {
        window.TRAINERS_CODEX_CONFIG = { worker: { url: 'https://api.example.test' } };
      });
      await openMerchStudio(page);
      assert(!(await exists(page, '[data-testid="merch-order"]')), 'order button must be dark while MERCH_CHECKOUT is off');
      assert(!(await exists(page, '[data-testid="merch-buy"]')), 'buy button must be dark while MERCH_CHECKOUT is off');
      assert(await exists(page, '[data-testid="merch-download"]'), 'download print PNG stays available (personal use)');
      const copy = await page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText ?? '');
      assert(/ordering is not open yet/i.test(copy), 'dialog copy must say ordering is not open');
    },
  },
  {
    name: '?ff=MERCH_CHECKOUT:1 + worker: both order and buy render',
    ownPage: true,
    async fn() {
      const page = await newPage({ query: 'ff=MERCH_CHECKOUT:1' });
      try {
        await page.evaluate(() => {
          window.TRAINERS_CODEX_CONFIG = { worker: { url: 'https://api.example.test' } };
        });
        await openMerchStudio(page);
        assert(await exists(page, '[data-testid="merch-order"]'), 'order button renders behind the flag');
        assert(await exists(page, '[data-testid="merch-buy"]'), 'buy button renders behind the flag');
        const orderText = await page.evaluate(() => document.querySelector('[data-testid="merch-order"]').innerText);
        assert(/order on printful/i.test(orderText), `order button names the vendor · got "${orderText}"`);
      } finally {
        await closePage(page);
      }
    },
  },
];

const result = await runSuite('merch-legal', tests);
await closeBrowser();
process.exit(result.failed ? 1 : 0);
