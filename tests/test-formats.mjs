// Formats / team-building restrictions suite.
//
// Logic tests hit the legality functions exposed on `window.__tc`
// (checkLegality / teamLegality / presetById / FORMAT_PRESETS). UI tests open
// the filters panel, apply a preset, and verify the picker grid greys out
// banned mons, that the add control is blocked, and that the team-bar legality
// banner flags an illegal pre-seeded team.

import {
  runSuite, sleep, exists, assert, assertEq, closeBrowser,
} from './harness.mjs';

const STORAGE_KEY = 'trainerscodex.v2';

// Known reference IDs for legality logic:
//   6     = Charizard (base, always legal)
//   10034 = Charizard Mega X (form: mega)
//   10199 = Charizard Gigantamax (form: gigantamax)  [verified below if present]
//   150   = Mewtwo (restricted legendary)
//   987   = Flutter Mane (paradox)
//   794   = Buzzwole (ultra beast)
//   10091 = Alolan Raichu (regional)
async function openFilters(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => /filters/i.test(b.innerText));
    if (btn) btn.click();
  });
  await sleep(300);
}

// Coordinate-click a format preset/rule chip by its data attribute (these are
// plain buttons, but use a real mouse click for consistency with Radix gotcha).
async function clickByAttr(page, attr, val) {
  const box = await page.evaluate((a, v) => {
    const el = document.querySelector(`[${a}="${v}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, attr, val);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  await sleep(250);
  return true;
}

const tests = [
  {
    name: 'checkLegality: a plain low-BST mon is legal under every preset',
    async fn(page) {
      // Pikachu (#25, BST 320, non-legendary, base form) clears even the
      // Underdog BST cap of 350, so it should be legal in all presets.
      const allLegal = await page.evaluate(() => {
        const tc = window.__tc;
        const pika = tc.POKEMON_BY_ID[25];
        return tc.FORMAT_PRESETS.every(r => tc.checkLegality(pika, r).legal);
      });
      assert(allLegal, 'Pikachu should be legal in all presets');
    },
  },
  {
    name: 'checkLegality: No Megas bans mega forms, keeps base species',
    async fn(page) {
      const r = await page.evaluate(() => {
        const tc = window.__tc;
        const noMega = tc.presetById('no-megas');
        const megaX = tc.POKEMON_BY_ID[10034]; // Charizard Mega X
        const base = tc.POKEMON_BY_ID[6];
        return {
          megaLegal: tc.checkLegality(megaX, noMega).legal,
          megaForm: megaX ? megaX.form : null,
          baseLegal: tc.checkLegality(base, noMega).legal,
        };
      });
      assertEq(r.megaForm, 'mega', 'id 10034 should be a mega form');
      assertEq(r.megaLegal, false, 'mega should be banned under No Megas');
      assertEq(r.baseLegal, true, 'base species should remain legal');
    },
  },
  {
    name: 'checkLegality: No Restricteds bans Mewtwo but not Charizard',
    async fn(page) {
      const r = await page.evaluate(() => {
        const tc = window.__tc;
        const preset = tc.presetById('no-restricteds');
        return {
          mewtwo: tc.checkLegality(tc.POKEMON_BY_ID[150], preset).legal,
          char: tc.checkLegality(tc.POKEMON_BY_ID[6], preset).legal,
        };
      });
      assertEq(r.mewtwo, false, 'Mewtwo is a restricted legendary — should be banned');
      assertEq(r.char, true, 'Charizard should remain legal');
    },
  },
  {
    name: 'checkLegality: custom paradox + ultra-beast bans hit the curated sets',
    async fn(page) {
      const r = await page.evaluate(() => {
        const tc = window.__tc;
        const base = { ...tc.UNRESTRICTED, id: 'custom', noParadox: true, noUltraBeast: true };
        return {
          flutterMane: tc.checkLegality(tc.POKEMON_BY_ID[987], base).legal, // paradox
          buzzwole: tc.checkLegality(tc.POKEMON_BY_ID[794], base).legal,    // ultra beast
          pikachu: tc.checkLegality(tc.POKEMON_BY_ID[25], base).legal,
        };
      });
      assertEq(r.flutterMane, false, 'Flutter Mane (paradox) should be banned');
      assertEq(r.buzzwole, false, 'Buzzwole (ultra beast) should be banned');
      assertEq(r.pikachu, true, 'Pikachu should be legal');
    },
  },
  {
    name: 'checkLegality: BST cap and mono-type act as expected',
    async fn(page) {
      const r = await page.evaluate(() => {
        const tc = window.__tc;
        const cap = { ...tc.UNRESTRICTED, id: 'custom', bstCap: 350 };
        const monoFire = { ...tc.UNRESTRICTED, id: 'custom', monoType: 'fire' };
        return {
          weakCappedLegal: tc.checkLegality(tc.POKEMON_BY_ID[10], cap).legal,    // Caterpie (bst 195)
          strongCappedLegal: tc.checkLegality(tc.POKEMON_BY_ID[6], cap).legal,   // Charizard (bst 534)
          fireLegal: tc.checkLegality(tc.POKEMON_BY_ID[6], monoFire).legal,      // Charizard is fire
          waterLegal: tc.checkLegality(tc.POKEMON_BY_ID[9], monoFire).legal,     // Blastoise is water
        };
      });
      assertEq(r.weakCappedLegal, true, 'low-BST mon should pass a 350 cap');
      assertEq(r.strongCappedLegal, false, 'high-BST mon should fail a 350 cap');
      assertEq(r.fireLegal, true, 'fire-type passes mono-fire');
      assertEq(r.waterLegal, false, 'water-type fails mono-fire');
    },
  },
  {
    name: 'teamLegality: flags only the offending slots',
    async fn(page) {
      const r = await page.evaluate(() => {
        const tc = window.__tc;
        const noMega = tc.presetById('no-megas');
        const team = [
          tc.POKEMON_BY_ID[6],      // legal
          tc.POKEMON_BY_ID[10034],  // mega — illegal
          null,
          tc.POKEMON_BY_ID[25],     // legal
          null, null,
        ];
        const res = tc.teamLegality(team, noMega);
        return { legal: res.legal, count: res.offenders.length, idx: res.offenders.map(o => o.index) };
      });
      assertEq(r.legal, false, 'team with a mega is illegal under No Megas');
      assertEq(r.count, 1, 'exactly one offender');
      assertEq(JSON.stringify(r.idx), JSON.stringify([1]), 'offender is slot index 1');
    },
  },
  {
    name: 'recommendations: counter team drawn from a No-Legendaries pool is all legal',
    async fn(page) {
      const r = await page.evaluate(() => {
        const tc = window.__tc;
        const preset = tc.presetById('no-legendaries');
        // Build the format-legal pool exactly like App.legalPool does.
        const pool = {};
        for (const p of Object.values(tc.POKEMON_BY_ID)) {
          if (tc.isLegal(p, preset)) pool[p.id] = p;
        }
        // Counter a strong legal opponent (resolved Pokémon objects).
        const opp = [6, 9, 3, 65, 130, 143].map(id => tc.POKEMON_BY_ID[id]);
        const counters = tc.suggestCounterTeam(opp, pool);
        return {
          count: counters.length,
          anyIllegal: counters.some(c => !tc.checkLegality(c.p, preset).legal),
        };
      });
      assert(r.count >= 1, 'counter team should return candidates');
      assertEq(r.anyIllegal, false, 'no counter pick may be a legendary under No Legendaries');
    },
  },
  {
    name: 'recommendations: random roll under Underdog respects the BST cap',
    async fn(page) {
      const r = await page.evaluate(() => {
        const tc = window.__tc;
        const preset = tc.presetById('underdog'); // bstCap 350
        const pool = {};
        for (const p of Object.values(tc.POKEMON_BY_ID)) {
          if (tc.isLegal(p, preset)) pool[p.id] = p;
        }
        // App drops the BST floor to 0 when a cap is active.
        const team = tc.generateRandomTeam(pool, { minBST: 0 });
        return {
          count: team.length,
          maxBst: team.reduce((m, p) => Math.max(m, p.bst), 0),
        };
      });
      assert(r.count >= 1, 'random roll should produce mons from the capped pool');
      assert(r.maxBst <= 350, `every rolled mon must be <= 350 BST, saw ${r.maxBst}`);
    },
  },
  {
    name: 'UI: applying No Megas greys out mega cards in the grid',
    async fn(page) {
      // Search "charizard" to surface base + mega forms together.
      await page.evaluate(() => {
        const input = document.querySelector('input[placeholder*="search"]');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'charizard');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      await sleep(300);
      await openFilters(page);
      const applied = await clickByAttr(page, 'data-format-preset', 'no-megas');
      assert(applied, 'could not click No Megas preset');
      const bannedCount = await page.evaluate(() =>
        document.querySelectorAll('[data-illegal="true"]').length);
      assert(bannedCount >= 1, `expected >=1 banned card after No Megas, got ${bannedCount}`);
    },
  },
  {
    name: 'UI: legality banner appears for a pre-seeded illegal team',
    async fn(page) {
      await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({
          current: { name: 'Mega Squad', members: [
            { id: 10034, shiny: false }, null, null, null, null, null,
          ] },
          // Persist a No Megas format so the seeded mega is illegal on load.
        }));
        localStorage.setItem('trainerscodex.format', JSON.stringify({
          id: 'no-megas', label: 'No Megas', noMega: true, noPrimal: true,
        }));
      }, STORAGE_KEY);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('header', { timeout: 45000 });
      await sleep(400);
      const hasBanner = await exists(page, '[data-testid="legality-banner"]');
      assert(hasBanner, 'legality banner should show for an illegal seeded team');
      const txt = await page.evaluate(() => {
        const b = document.querySelector('[data-testid="legality-banner"]');
        return b ? b.innerText.toLowerCase() : '';
      });
      assert(txt.includes('illegal'), 'banner should say illegal');
      assert(/no megas/.test(txt), 'banner should name the active format');
    },
  },
  {
    name: 'UI: format persists across reload',
    async fn(page) {
      await openFilters(page);
      await clickByAttr(page, 'data-format-preset', 'standard');
      const stored = await page.evaluate(() => localStorage.getItem('trainerscodex.format'));
      assert(stored && /standard/.test(stored), 'standard format should be persisted');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('header', { timeout: 45000 });
      await sleep(300);
      await openFilters(page);
      const active = await page.evaluate(() => {
        const el = document.querySelector('[data-format-preset="standard"]');
        return el ? el.className.includes('border-primary') : false;
      });
      assert(active, 'standard preset should still be active after reload');
    },
  },
];

const result = await runSuite('formats', tests);
await closeBrowser();
process.exit(result.failed === 0 ? 0 : 1);
