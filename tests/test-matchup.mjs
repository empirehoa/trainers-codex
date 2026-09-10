// Sprint-3 gate: @smogon/calc matchup preview (damage ranges + speed tiers).
//
// computeMatchup() maps one of our TeamMembers into @smogon/calc's Pokemon and
// asks the same engine the r/stunfisk damage calculator uses for the damage
// range of each move and the speed comparison. These tests exercise the shipped
// bundle via window.__tc (real compiled logic, not a mirror) plus one UI flow.
//
// @smogon/calc is a lazily loaded chunk (src/lib/calc-loader.ts), so
// computeMatchup() is async: every call below awaits it, which also makes this
// suite the offline proof that the Blob-URL chunk revives from file://.
//
// Move IDs are obtained by round-tripping a PokePaste through parsePokePaste,
// so we never hard-code internal move numbering — the test stays valid as data
// regenerates.

import {
  runSuite, sleep, assert, assertEq, assertGte, closeBrowser,
} from './harness.mjs';

const STORAGE_KEY = 'trainerscodex.v2';

// A fast physical attacker with four damaging moves. Jolly + 252 Spe makes its
// raw Speed clearly beat a Snorlax (base 30), so the speed verdict is robust
// regardless of how items modify Speed inside the calc.
const LANDO_PASTE = `Landorus-Therian @ Life Orb
Ability: Intimidate
EVs: 252 Atk / 4 Def / 252 Spe
Jolly Nature
- Earthquake
- Stone Edge
- U-turn
- Rock Slide`;

const SNORLAX_ID = 143;     // base species, slow, known to @smogon/calc
const SWAMPERT_ID = 260;    // Water/Ground — 4× weak to Grass

// A Champions Mega attacker. @smogon/calc's dataset carries this form with the
// same stats + typing we ship, so its damage ranges are authentic (only the
// signature ability isn't modeled). This is exactly our headline format, so we
// lock in that calc covers it rather than degrading it to "unsupported".
const MEGA_MEGANIUM_PASTE = `Meganium-Mega @ Life Orb
Ability: Mega Sol
EVs: 252 SpA / 252 Spe
Modest Nature
- Energy Ball
- Giga Drain`;

const tests = [
  {
    name: 'computeMatchup returns damage ranges + speed verdict for a known attacker',
    async fn(page) {
      const mu = await page.evaluate(async (paste, defId) => {
        const tc = window.__tc;
        const [member] = tc.parsePokePaste(paste);
        return await tc.computeMatchup(member, defId);
      }, LANDO_PASTE, SNORLAX_ID);

      assert(mu.supported, 'Landorus-Therian should be modeled by @smogon/calc');
      assertGte(mu.moves.length, 1, 'should have at least one damaging move');
      assert(['outspeeds', 'outsped by', 'speed ties'].includes(mu.speedNote),
        `speedNote should be a known verdict; got ${mu.speedNote}`);
      assertGte(mu.attackerSpe, 1, 'attacker Speed stat should be computed');
      assertGte(mu.defenderSpe, 1, 'defender Speed stat should be computed');
      for (const m of mu.moves) {
        assert(typeof m.move === 'string' && m.move.length > 0, 'move has a display name');
        assert(m.maxPct > 0, `${m.move} should deal > 0%`);
        assert(m.minPct <= m.maxPct, `${m.move} min% must be <= max%`);
        assert(typeof m.koText === 'string', `${m.move} koText should be a string`);
      }
    },
  },
  {
    name: 'a fast attacker outspeeds a slow defender',
    async fn(page) {
      const mu = await page.evaluate(async (paste, defId) => {
        const [member] = window.__tc.parsePokePaste(paste);
        return await window.__tc.computeMatchup(member, defId);
      }, LANDO_PASTE, SNORLAX_ID);
      assert(mu.attackerSpe > mu.defenderSpe,
        `252 Spe Jolly Lando-T (${mu.attackerSpe}) should outspeed Snorlax (${mu.defenderSpe})`);
      assertEq(mu.speedNote, 'outspeeds', 'speedNote should read "outspeeds"');
    },
  },
  {
    name: 'bestMove picks the highest max% damaging move',
    async fn(page) {
      const { best, maxOfAll } = await page.evaluate(async (paste, defId) => {
        const tc = window.__tc;
        const [member] = tc.parsePokePaste(paste);
        const mu = await tc.computeMatchup(member, defId);
        const best = tc.bestMove(mu);
        const maxOfAll = Math.max(...mu.moves.map(m => m.maxPct));
        return { best, maxOfAll };
      }, LANDO_PASTE, SNORLAX_ID);
      assert(best, 'bestMove should return a move for a damaging set');
      assertEq(best.maxPct, maxOfAll, 'bestMove should be the move with the highest max%');
    },
  },
  {
    name: 'a Champions Mega attacker is modeled by calc with correct STAB damage',
    async fn(page) {
      const mu = await page.evaluate(async (paste, defId) => {
        const tc = window.__tc;
        const [member] = tc.parsePokePaste(paste);
        return { id: member.id, mu: await tc.computeMatchup(member, defId) };
      }, MEGA_MEGANIUM_PASTE, SWAMPERT_ID);
      assertEq(mu.id, 10282, 'paste should resolve to Mega Meganium (10282)');
      assert(mu.mu.supported, 'Champions Mega Meganium should be modeled by @smogon/calc');
      assertGte(mu.mu.moves.length, 1, 'Mega Meganium should have damaging moves');
      // Grass STAB (Energy Ball) into a 4× Grass-weak Water/Ground wall must hit
      // very hard — proves calc applied this form's real typing + stats.
      const best = Math.max(...mu.mu.moves.map(m => m.maxPct));
      assertGte(best, 50, 'Grass STAB into Swampert (4× weak) should exceed 50%');
    },
  },
  {
    name: 'an unknown defender id degrades to unsupported (no throw)',
    async fn(page) {
      const mu = await page.evaluate(async (paste) => {
        const [member] = window.__tc.parsePokePaste(paste);
        return await window.__tc.computeMatchup(member, 999999);
      }, LANDO_PASTE);
      assertEq(mu.supported, false, 'a non-existent defender id → unsupported');
    },
  },
  {
    name: 'UI: matchup preview renders damage % after picking an opponent',
    async fn(page) {
      // Build a member with real move IDs in-page, then seed it as the team.
      const member = await page.evaluate((paste) =>
        window.__tc.parsePokePaste(paste)[0], LANDO_PASTE);

      await page.evaluate((key, m) => {
        localStorage.setItem(key, JSON.stringify({
          current: { name: 'Calc Test', members: [m, null, null, null, null, null] },
        }));
      }, STORAGE_KEY, member);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('header', { timeout: 10000 });
      await sleep(250);

      // Open the analysis sheet.
      await page.evaluate(() => {
        const a = [...document.querySelectorAll('button')]
          .find(b => /^analyze/i.test(b.innerText.trim()) && !b.disabled);
        if (a) a.click();
      });
      await sleep(500);

      const bodyBefore = await page.evaluate(() => document.body.innerText);
      assert(/matchup preview/i.test(bodyBefore), 'analysis sheet should contain the matchup preview section');

      // Type into the opponent picker (controlled input → native setter + event).
      await page.evaluate(() => {
        const input = [...document.querySelectorAll('input')]
          .find(i => /pick an opponent/i.test(i.placeholder || ''));
        if (!input) throw new Error('opponent picker input not found');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'snorlax');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await sleep(300);

      // Click the Snorlax result in the picker. Match on EXACT text — the
      // Pokédex grid behind the sheet also has a "Snorlax" card whose text
      // includes the dex number ("#0143…"), and we must not click that.
      const clicked = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
          .find(b => b.innerText.trim() === 'Snorlax');
        if (btn) { btn.click(); return true; }
        return false;
      });
      assert(clicked, 'a Snorlax result should appear in the opponent picker');
      // The calc chunk is lazy: wait for the "loading calc…" line to give way
      // to the per-member rows instead of racing it with a fixed sleep.
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="matchup-loading"]') && /vs\s+Snorlax/i.test(document.body.innerText),
        { timeout: 10000 },
      );
      await sleep(100);

      const bodyAfter = await page.evaluate(() => document.body.innerText);
      assert(/vs\s+Snorlax/i.test(bodyAfter), 'selected opponent header should read "vs Snorlax"');
      assert(/%/.test(bodyAfter), 'damage ranges (with %) should render after picking an opponent');
      assert(/outspeeds|outsped by|speed ties/.test(bodyAfter), 'a speed verdict should render');
    },
  },
];

const result = await runSuite('matchup', tests);
await closeBrowser();
process.exit(result.failed ? 1 : 0);
