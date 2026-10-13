// Sprint-2 gate: Pokémon Champions in the game/format layer + the Champions Megas.
//
// Logic tests call the compatibility layer exposed on `window.__tc` (set in
// App.tsx) so they exercise the shipped bundle. The Champions Megas
// (Meganium #10282, Feraligatr #10283, Emboar #10286) already live in
// pokemon-data.json; these tests lock in their data and the gating rule that
// makes Mega Evolution available in Legends: Z-A and Champions and nowhere
// else in this list. (v5–v14 gated Megas to Champions alone — wrong since Z-A
// shipped with Mega Evolution as its headline mechanic; fixed in v15.)

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
    name: 'Mega is battle-legal in Legends Z-A and Champions, absent from every other Switch-era game',
    async fn(page) {
      const verdicts = await page.evaluate(() => {
        const tc = window.__tc;
        const out = {};
        for (const id of [10282, 10310]) { // Mega Meganium (Champions wave 1), Mega Lucario Z (Z-A / v15)
          const mega = tc.POKEMON_BY_ID[id];
          out[id] = {};
          for (const g of tc.MAINLINE_GAMES) out[id][g.id] = tc.isPokemonAvailableIn(mega, g);
        }
        return out;
      });
      for (const [id, v] of Object.entries(verdicts)) {
        assertEq(v.champions, true, `Mega ${id} should be legal in Champions`);
        assertEq(v.plza, true, `Mega ${id} should be usable in Legends Z-A`);
        for (const g of ['lgpe', 'swsh', 'bdsp', 'pla', 'sv']) {
          assertEq(v[g], false, `Mega ${id} must NOT be available in ${g}`);
        }
      }
    },
  },
  {
    name: 'analyzeTeamCompatibility marks a Mega team playable in Z-A and Champions only',
    async fn(page) {
      const byGame = await page.evaluate(() => {
        const tc = window.__tc;
        const results = tc.analyzeTeamCompatibility([{ id: 10283, shiny: false }]); // Mega Feraligatr
        const out = {};
        for (const r of results) out[r.game.id] = r.playable;
        return out;
      });
      assertEq(byGame.champions, true, 'Champions should be playable for a Mega team');
      assertEq(byGame.plza, true, 'Legends Z-A should be playable for a Mega team');
      assertEq(byGame.sv, false, 'Scarlet/Violet cannot hold a Mega');
      assertEq(byGame.swsh, false, 'Sword/Shield cannot hold a Mega');
    },
  },
  {
    name: 'recommendTargetGame routes a Mega team to Legends Z-A (mainline first), with a Mega Stone note',
    async fn(page) {
      const { mega, megaLines, normal } = await page.evaluate(() => {
        const tc = window.__tc;
        const rec = (team) => tc.recommendTargetGame(tc.analyzeTeamCompatibility(team));
        const m = rec([{ id: 10286, shiny: false }]);   // Mega Emboar
        return {
          mega: m.result.game.id,
          megaLines: m.instructions.join('\n'),
          normal: rec([{ id: 25, shiny: false }]).result.game.id, // Pikachu — no form constraints
        };
      });
      assertEq(mega, 'plza', 'a Mega-only team has a mainline home now: Legends Z-A');
      assert(/Mega Stone/.test(megaLines), `instructions should explain the Mega form is reached in battle; got:\n${megaLines}`);
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

      const headline = await page.evaluate(() => document.body.innerText);
      assert(/Legends: Z-A/.test(headline),
        'analysis sheet headline should recommend Legends: Z-A for a Mega team');

      // Expand the per-game matrix; Champions is the other game that holds Megas.
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')]
          .find(x => /show all \d+ games/i.test(x.innerText));
        if (b) b.click();
      });
      await sleep(300);
      const text = await page.evaluate(() => document.body.innerText);
      assert(/Champions/.test(text),
        'analysis sheet should list Pokémon Champions in the game-compatibility matrix');
    },
  },
];

// ---- v15: the Champions Regulation M-C allowlist preset ---------------------
tests.push(
  {
    name: 'FORMAT_PRESETS carries the Champions regulation allowlist',
    async fn(page) {
      const info = await page.evaluate(() => {
        const tc = window.__tc;
        const p = tc.FORMAT_PRESETS.find(r => /^champions-/.test(r.id));
        if (!p) return null;
        const legal = (id) => tc.checkLegality(tc.POKEMON_BY_ID[id], p).legal;
        return {
          id: p.id, label: p.label, n: p.allowedIds.length,
          charizard: legal(6), megaCharX: legal(10034), lucarioZ: legal(10310),
          mewtwo: legal(150), zygardeMega: legal(10301), charGmax: legal(10196),
          reason: tc.checkLegality(tc.POKEMON_BY_ID[150], p).reasons[0],
        };
      });
      assert(info, 'no champions-* preset in FORMAT_PRESETS');
      assertEq(info.id, 'champions-m-c', 'preset id');
      assert(/Champions · Reg\. M-C/.test(info.label), `label: ${info.label}`);
      assert(info.n > 300 && info.n < 400, `allowlist size ${info.n} looks wrong`);
      assertEq(info.charizard, true, 'Charizard is usable in Champions');
      assertEq(info.megaCharX, true, 'Mega Charizard X is usable in Champions');
      assertEq(info.lucarioZ, true, 'Mega Lucario Z is usable in Champions (Reg. M-C)');
      assertEq(info.mewtwo, false, 'Mewtwo is not in the game');
      assertEq(info.zygardeMega, false, 'Mega Zygarde has no Champions release');
      assertEq(info.charGmax, false, 'no Gigantamax in Champions');
      assertEq(info.reason, 'not usable in Champions Reg. M-C', 'reason text');
    },
  },
  {
    name: 'UI: applying the Champions preset shows the dated regulation note and flags a seeded Mewtwo',
    async fn(page) {
      await page.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({
          current: { name: 'Ladder', members: [{ id: 6, shiny: false }, { id: 150, shiny: false }, null, null, null, null] },
        }));
        localStorage.removeItem('trainerscodex.format');
      }, STORAGE_KEY);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('header', { timeout: 10000 });
      await sleep(250);

      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(b => /filters/i.test(b.innerText));
        if (btn) btn.click();
      });
      await sleep(300);
      const box = await page.evaluate(() => {
        const el = document.querySelector('[data-format-preset="champions-m-c"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      assert(box, 'champions-m-c preset chip not rendered');
      await page.mouse.click(box.x, box.y);
      await sleep(400);

      const note = await page.evaluate(() => document.querySelector('[data-testid="format-regulation-note"]')?.innerText || '');
      assert(/Regulation M-C/.test(note), `regulation note missing or wrong: "${note}"`);
      assert(/Sep 9 – Dec 2, 2026|ended Dec 2, 2026/.test(note), `note should carry the window: "${note}"`);

      const banner = await page.evaluate(() => document.querySelector('[data-testid="legality-banner"]')?.innerText || '');
      assert(/Mewtwo/.test(banner), `legality banner should flag Mewtwo: "${banner}"`);
      assert(/not usable in Champions Reg\. M-C/.test(banner), `banner reason: "${banner}"`);
      assert(!/Charizard/.test(banner), 'Charizard is legal and must not be flagged');
    },
  },
);

const result = await runSuite('champions', tests);
await closeBrowser();
process.exit(result.failed ? 1 : 0);
