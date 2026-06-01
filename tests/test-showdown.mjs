// Sprint-1 gate: Showdown / PokePaste import-export.
//
// Logic tests call the pure parse/export functions exposed on `window.__tc`
// (set in App.tsx) via page.evaluate — this exercises the SHIPPED bundle code,
// not a re-import of the source, matching the repo's "test the real bundle"
// philosophy. UI tests drive the ShowdownImportDialog through real mouse events
// (Radix dialog/tabs need them — CLAUDE.md gotcha #1).
//
// Coverage:
//   - byte-stable round-trip: export(parse(export(parse(x)))) === export(parse(x))
//   - forms (id > 10000) + Tera + EVs + IVs + nature + item + ability + moves survive
//   - unknown species are skipped, valid neighbours still parse
//   - UI: paste → Import replaces the team; Export tab reflects the live team

import {
  runSuite, sleep, clickAt, assert, assertEq, assertGte, closeBrowser,
} from './harness.mjs';

const STORAGE_KEY = 'trainerscodex.v2';

// A 3-mon competitive paste touching every feature the format carries:
// a Mega (Charizard-Mega-X, id 10034), a regional therian (Landorus-Therian,
// id 10021, with 0-Atk IVs), and an Alolan form (Ninetales-Alola, id 10104),
// plus nickname, item, ability, Tera, EVs, nature, shiny, and 4 moves.
const PASTE = `Pyro (Charizard-Mega-X) @ Life Orb
Ability: Tough Claws
Shiny: Yes
Tera Type: Fire
EVs: 252 Atk / 4 Def / 252 Spe
Adamant Nature
- Dragon Dance
- Flare Blitz
- Dragon Claw
- Earthquake

Landorus-Therian @ Choice Scarf
Ability: Intimidate
Tera Type: Flying
EVs: 252 Atk / 4 Def / 252 Spe
Jolly Nature
IVs: 0 Atk
- Earthquake
- U-turn
- Stone Edge
- Stealth Rock

Ninetales-Alola @ Light Clay
Ability: Snow Warning
Tera Type: Ice
EVs: 252 HP / 4 SpA / 252 Spe
Timid Nature
- Aurora Veil
- Blizzard
- Moonblast
- Encore`;

const tests = [
  {
    name: 'round-trip is byte-stable (export∘parse is idempotent)',
    async fn(page) {
      const { first, second, ids } = await page.evaluate((paste) => {
        const tc = window.__tc;
        const first = tc.exportPokePaste(tc.parsePokePaste(paste));
        const second = tc.exportPokePaste(tc.parsePokePaste(first));
        const ids = tc.parsePokePaste(first).map(m => m.id);
        return { first, second, ids };
      }, PASTE);
      assert(first.length > 0, 'first export should be non-empty');
      assertEq(second, first, 'second round-trip diverged from first — export not byte-stable');
      assert(!first.endsWith('\n'), 'export must not have a trailing newline');
      assertEq(ids.length, 3, 'expected all 3 mons to survive the round-trip');
    },
  },
  {
    name: 'forms resolve to PokeAPI form ids (> 10000)',
    async fn(page) {
      const ids = await page.evaluate((paste) =>
        window.__tc.parsePokePaste(paste).map(m => m.id), PASTE);
      assertEq(ids[0], 10034, 'Charizard-Mega-X should resolve to form id 10034');
      assertEq(ids[1], 10021, 'Landorus-Therian should resolve to form id 10021');
      assertEq(ids[2], 10104, 'Ninetales-Alola should resolve to form id 10104');
    },
  },
  {
    name: 'Tera, EVs, IVs, nature, item, ability, nickname, shiny all survive',
    async fn(page) {
      const members = await page.evaluate((paste) =>
        window.__tc.parsePokePaste(paste), PASTE);
      const char = members[0];
      assertEq(char.nickname, 'Pyro', 'nickname lost');
      assertEq(char.heldItem, 'life-orb', 'held item lost / not slugified');
      assertEq(char.ability, 'Tough Claws', 'ability lost');
      assertEq(char.shiny, true, 'shiny flag lost');
      assertEq(char.teraType, 'fire', 'Tera type lost');
      assertEq(char.evs.atk, 252, 'Atk EV lost');
      assertEq(char.evs.spe, 252, 'Spe EV lost');
      assertEq(char.nature, 'Adamant', 'nature lost');
      assertEq((char.moves || []).length, 4, 'expected 4 moves');

      const lando = members[1];
      assertEq(lando.heldItem, 'choice-scarf', 'Choice Scarf lost');
      assertEq(lando.teraType, 'flying', 'Landorus Tera lost');
      assertEq(lando.ivs.atk, 0, '0-Atk IV lost — breaks min-Atk sets');
      assertEq(lando.nature, 'Jolly', 'Jolly nature lost');
    },
  },
  {
    name: 'unknown species are skipped, valid neighbours still parse',
    async fn(page) {
      const { onlyBad, mixed } = await page.evaluate(() => {
        const tc = window.__tc;
        const bad = 'Notarealmon @ Leftovers\nAbility: Levitate\n- Splash';
        const mix = bad + '\n\nLandorus-Therian @ Choice Scarf\nAbility: Intimidate\n- Earthquake';
        return {
          onlyBad: tc.parsePokePaste(bad).length,
          mixed: tc.parsePokePaste(mix).map(m => m.id),
        };
      });
      assertEq(onlyBad, 0, 'a paste with only an unknown species should yield 0 members');
      assertEq(mixed.length, 1, 'the one valid mon should survive a mixed paste');
      assertEq(mixed[0], 10021, 'the surviving mon should be Landorus-Therian');
    },
  },
  {
    name: 'empty / junk input yields an empty team (no throw)',
    async fn(page) {
      const counts = await page.evaluate(() => {
        const tc = window.__tc;
        return ['', '   \n\n  ', 'not a team at all'].map(s => tc.parsePokePaste(s).length);
      });
      assertEq(counts.join(','), '0,0,0', 'empty/junk input should parse to 0 members without error');
    },
  },
  {
    name: 'UI: paste a team and Import replaces the active team',
    async fn(page) {
      // Open the dialog (Radix — needs a real mouse click).
      await clickAt(page, '[data-testid="showdown-btn"]');
      await page.waitForSelector('[data-testid="sd-import-text"]', { timeout: 5000 });

      // Set the textarea value through React's native setter so the controlled
      // component registers the change (typing a 3-block paste key-by-key is slow
      // and flaky). Then dispatch an input event React will pick up.
      await page.evaluate((paste) => {
        const ta = document.querySelector('[data-testid="sd-import-text"]');
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, paste);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }, PASTE);
      await sleep(80);

      await clickAt(page, '[data-testid="sd-import-btn"]');
      await sleep(250);

      const countText = await page.evaluate(() => document.body.innerText);
      assert(/3\/6/.test(countText), `team count should read 3/6 after import; body had no "3/6"`);
    },
  },
  {
    name: 'UI: Export tab reflects the live team as PokePaste',
    async fn(page) {
      // Seed a known 1-mon team, reload, open the dialog, switch to Export.
      await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({
          current: { name: 'Export Test', members: [
            { id: 10021, shiny: false, heldItem: 'choice-scarf',
              ability: 'Intimidate', teraType: 'flying', moves: [] },
            null, null, null, null, null,
          ] },
        }));
      }, STORAGE_KEY);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('header', { timeout: 10000 });
      await sleep(200);

      await clickAt(page, '[data-testid="showdown-btn"]');
      await page.waitForSelector('[data-testid="sd-tab-export"]', { timeout: 5000 });
      await clickAt(page, '[data-testid="sd-tab-export"]');
      await sleep(150);

      const exported = await page.$eval(
        '[data-testid="sd-export-text"]', el => el.value);
      assert(/Landorus-Therian/.test(exported),
        `export textarea should contain the seeded species; got: ${exported.slice(0, 200)}`);
      assert(/Choice Scarf/.test(exported), 'export should include the held item label');
      assert(/Tera Type: Flying/.test(exported), 'export should include the Tera type');
    },
  },
];

const result = await runSuite('showdown', tests);
await closeBrowser();
process.exit(result.failed ? 1 : 0);
