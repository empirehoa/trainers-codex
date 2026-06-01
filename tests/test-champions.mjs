// Sprint-2 gate: Pokémon Champions in the game/format layer + the Champions Megas.
//
// Logic tests call the compatibility layer exposed on `window.__tc` (set in
// App.tsx) so they exercise the shipped bundle. The Champions Megas
// (Meganium #10282, Feraligatr #10283, Emboar #10286) already live in
// pokemon-data.json; these tests lock in their data and the gating rule that
// makes Mega Evolution available in Champions and nowhere else in this list.

import {
  runSuite, sleep, assert, assertEq, closeBrowser,
} from './harness.mjs';

const STORAGE_KEY = 'trainerscodex.v2';

// id → expected { name, types, ability } for the three Champions Megas.
const CHAMP_MEGAS = {
  10282: { name: 'meganium-mega',   types: ['grass', 'fairy'],     ability: 'Mega Sol' },
  10283: { name: 'feraligatr-mega', types: ['water', 'dragon'],    ability: 'Dragonize' },
  10286: { name: 'emboar-mega',     types: ['fire', 'fighting'],   ability: 'Mold Breaker' },
};

const tests = [
  {
    name: 'the three Champions Megas exist with correct types + signature ability',
    async fn(page) {
      const got = await page.evaluate((ids) => {
        const byId = window.__tc.POKEMON_BY_ID;
        const out = {};
        for (const id of ids) {
          const p = byId[id];
          out[id] = p ? { name: p.name, types: p.types, abilities: p.abilities, form: p.form } : null;
        }
        return out;
      }, Object.keys(CHAMP_MEGAS).map(Number));

      for (const [id, exp] of Object.entries(CHAMP_MEGAS)) {
        const p = got[id];
        assert(p, `Champions Mega id ${id} missing from data`);
        assertEq(p.name, exp.name, `id ${id} name`);
        assertEq(p.form, 'mega', `id ${id} should be a mega form`);
        assertEq(JSON.stringify(p.types), JSON.stringify(exp.types), `id ${id} types`);
        assert(p.abilities.includes(exp.ability),
          `id ${id} should have signature ability ${exp.ability}; got ${JSON.stringify(p.abilities)}`);
      }
    },
  },
  {
    name: 'MAINLINE_GAMES includes Pokémon Champions',
    async fn(page) {
      const game = await page.evaluate(() =>
        window.__tc.MAINLINE_GAMES.find(g => g.id === 'champions') || null);
      assert(game, 'champions game entry missing from MAINLINE_GAMES');
      assert(/Champions/.test(game.label), `champions label wrong: ${game && game.label}`);
    },
  },
  {
    name: 'Mega is battle-legal in Champions, absent from every Switch-era game',
    async fn(page) {
      const verdicts = await page.evaluate(() => {
        const tc = window.__tc;
        const mega = tc.POKEMON_BY_ID[10282]; // Mega Meganium
        const out = {};
        for (const g of tc.MAINLINE_GAMES) out[g.id] = tc.isPokemonAvailableIn(mega, g);
        return out;
      });
      assertEq(verdicts.champions, true, 'Mega Meganium should be legal in Champions');
      for (const id of ['lgpe', 'swsh', 'bdsp', 'pla', 'sv', 'plza']) {
        assertEq(verdicts[id], false, `Mega Meganium must NOT be available in ${id}`);
      }
    },
  },
  {
    name: 'analyzeTeamCompatibility marks a Mega team playable only in Champions',
    async fn(page) {
      const byGame = await page.evaluate(() => {
        const tc = window.__tc;
        const results = tc.analyzeTeamCompatibility([{ id: 10283, shiny: false }]); // Mega Feraligatr
        const out = {};
        for (const r of results) out[r.game.id] = r.playable;
        return out;
      });
      assertEq(byGame.champions, true, 'Champions should be playable for a Mega team');
      assertEq(byGame.sv, false, 'Scarlet/Violet cannot hold a Mega');
      assertEq(byGame.plza, false, 'Legends Z-A cannot hold a Mega');
    },
  },
  {
    name: 'recommendTargetGame routes a Mega team to Champions, a normal team to mainline',
    async fn(page) {
      const { mega, normal } = await page.evaluate(() => {
        const tc = window.__tc;
        const rec = (team) => tc.recommendTargetGame(tc.analyzeTeamCompatibility(team)).result.game.id;
        return {
          mega: rec([{ id: 10286, shiny: false }]),   // Mega Emboar
          normal: rec([{ id: 25, shiny: false }]),     // Pikachu — no form constraints
        };
      });
      assertEq(mega, 'champions', 'a Mega-only team should be recommended for Champions');
      assert(normal !== 'champions',
        `a normal team should NOT be defaulted to Champions; got ${normal}`);
    },
  },
  {
    name: 'UI: analysis sheet surfaces Champions for a seeded Mega team',
    async fn(page) {
      await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({
          current: { name: 'Mega Squad', members: [
            { id: 10282, shiny: false }, { id: 10283, shiny: false },
            { id: 10286, shiny: false }, null, null, null,
          ] },
        }));
      }, STORAGE_KEY);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('header', { timeout: 10000 });
      await sleep(250);

      // Open the analysis sheet (the Analyze button is enabled once the team has
      // members). Same approach as the v4 game-compat test.
      await page.evaluate(() => {
        const a = [...document.querySelectorAll('button')]
          .find(b => /^analyze/i.test(b.innerText.trim()) && !b.disabled);
        if (a) a.click();
      });
      await sleep(500);

      const text = await page.evaluate(() => document.body.innerText);
      assert(/Champions/.test(text),
        'analysis sheet should list Pokémon Champions in the game-compatibility section');
    },
  },
];

const result = await runSuite('champions', tests);
await closeBrowser();
process.exit(result.failed ? 1 : 0);
