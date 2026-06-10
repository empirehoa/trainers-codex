// v6 additions: region gym badges, the shared-team landing page + team
// matchup, and the owner premium quick-unlock. Exercises the SHIPPED compiled
// logic via window.__tc plus the real landing/unlock boot flows — not mirrors.

import {
  runSuite, assert, assertEq, closeBrowser,
} from './harness.mjs';

const KANTO_TEAM = [1, 4, 7, 25, 143, 149]; // Bulbasaur, Charmander, Squirtle, Pikachu, Snorlax, Dragonite
const RIVAL_TEAM = [6, 9, 3, 131, 94, 130];  // Charizard, Blastoise, Venusaur, Lapras, Gengar, Gyarados

const tests = [
  {
    name: 'BADGE_REGIONS: 9 main-series regions with correct gym counts',
    async fn(page) {
      const r = await page.evaluate(() => {
        const t = window.__tc;
        const regions = t.BADGE_REGIONS;
        const byId = Object.fromEntries(regions.map(x => [x.id, x.count]));
        return { len: regions.length, ids: regions.map(x => x.id), byId };
      });
      assertEq(r.len, 9, 'nine regions defined');
      for (const id of ['kanto','johto','hoenn','sinnoh','unova','kalos','alola','galar','paldea']) {
        assert(r.ids.includes(id), `region present: ${id}`);
      }
      assertEq(r.byId.kanto, 8, 'kanto has 8 badges');
      assertEq(r.byId.alola, 4, 'alola has 4 grand trials');
      assertEq(r.byId.galar, 8, 'galar has 8 badges');
      assertEq(r.byId.paldea, 8, 'paldea has 8 badges');
    },
  },
  {
    name: 'badgesForRegion: region-scoped, id-prefixed, hex-colored, case-insensitive',
    async fn(page) {
      const r = await page.evaluate(() => {
        const t = window.__tc;
        const kanto = t.badgesForRegion('kanto');
        const upper = t.badgesForRegion('PALDEA');
        return {
          kantoLen: kanto.length,
          firstId: kanto[0]?.id,
          allPrefixed: kanto.every(b => b.id.startsWith('kanto-')),
          allHex: kanto.every(b => typeof b.color === 'string' && /^#/.test(b.color)),
          allLabeled: kanto.every(b => typeof b.label === 'string' && b.label.includes('·')),
          upperLen: upper.length,
          bogus: t.badgesForRegion('atlantis').length,
        };
      });
      assertEq(r.kantoLen, 8, 'kanto returns 8');
      assertEq(r.firstId, 'kanto-boulder', 'kanto-boulder id preserved for back-compat');
      assert(r.allPrefixed, 'every kanto id is region-prefixed');
      assert(r.allHex, 'every badge carries a hex color from its type');
      assert(r.allLabeled, 'every badge label is "Leader · City"');
      assertEq(r.upperLen, 8, 'lookup is case-insensitive');
      assertEq(r.bogus, 0, 'unknown region yields no badges');
    },
  },
  {
    name: 'share code round-trips through buildShareCode/parseShareCode',
    async fn(page) {
      const r = await page.evaluate((ids) => {
        const t = window.__tc;
        const members = ids.map(id => ({ id, shiny: false }));
        const code = t.buildShareCode(members);
        const parsed = t.parseShareCode(code);
        return { code, len: parsed?.length, ids: parsed?.map(m => m?.id) };
      }, KANTO_TEAM);
      assert(!!r.code && r.code.length > 0, 'code is non-empty');
      assertEq(r.len, 6, 'parses back to six slots');
      assertEq(JSON.stringify(r.ids), JSON.stringify(KANTO_TEAM), 'ids survive the round-trip');
    },
  },
  {
    name: 'computeTeamMatchup returns a verdict + per-mon threat rows for both sides',
    async fn(page) {
      const r = await page.evaluate((mineIds, theirIds) => {
        const t = window.__tc;
        const mine = mineIds.map(id => t.POKEMON_BY_ID[id]);
        const theirs = theirIds.map(id => t.POKEMON_BY_ID[id]);
        const mu = t.computeTeamMatchup(mine, theirs);
        return {
          verdict: mu.verdict,
          mineRows: mu.mine.length,
          theirRows: mu.theirs.length,
          hasSummary: typeof mu.summary === 'string' && mu.summary.length > 0,
          rowKeys: mu.mine[0] ? Object.keys(mu.mine[0]) : [],
        };
      }, KANTO_TEAM, RIVAL_TEAM);
      assert(['mine','theirs','even'].includes(r.verdict), 'verdict is one of mine/theirs/even');
      assertEq(r.mineRows, 6, 'six rows for my side');
      assertEq(r.theirRows, 6, 'six rows for their side');
      assert(r.hasSummary, 'matchup carries a human summary');
      for (const k of ['id','threatens','threatenedBy']) {
        assert(r.rowKeys.includes(k), `matchup row exposes ${k}`);
      }
    },
  },
  {
    name: 'shared-team landing page renders for #team= links',
    async fn(page) {
      const base = page.url().split('#')[0];
      const code = await page.evaluate((ids) =>
        window.__tc.buildShareCode(ids.map(id => ({ id, shiny: false }))), KANTO_TEAM);
      // The hash is parsed on boot, so it must be present at document load.
      // Navigating to a fragment-only-different URL is an in-page anchor jump
      // (no remount); reload() re-runs the boot effect with the hash in place.
      await page.goto(`${base}#team=${code}&tn=${encodeURIComponent('Kanto Classics')}&by=${encodeURIComponent('Prof Oak')}`,
        { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      // The header renders uppercase via CSS, so match case-insensitively.
      await page.waitForFunction(
        () => /shared a team with you/i.test(document.body.innerText),
        { timeout: 15000 });
      const body = await page.evaluate(() => document.body.innerText);
      assert(/kanto classics/i.test(body), 'landing shows the shared team name');
      assert(/prof oak/i.test(body), 'landing shows who shared it');
      assert(/load this team/i.test(body), 'landing offers to load the team');
      assert(/battle my team|matchup/i.test(body), 'landing offers a head-to-head action');
    },
  },
  {
    name: 'owner quick-unlock: #unlock= flips and clears the premium preview flag',
    async fn(page) {
      const base = page.url().split('#')[0];

      await page.goto(`${base}#unlock=1`, { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => localStorage.getItem('trainerscodex.premium') === 'true',
        { timeout: 15000 });
      const on = await page.evaluate(() => localStorage.getItem('trainerscodex.premium'));
      assertEq(on, 'true', 'premium preview flag set after #unlock=1');

      await page.goto(`${base}#unlock=off`, { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => localStorage.getItem('trainerscodex.premium') !== 'true',
        { timeout: 15000 });
      const off = await page.evaluate(() => localStorage.getItem('trainerscodex.premium'));
      assert(off !== 'true', 'premium preview flag cleared after #unlock=off');
    },
  },
];

const result = await runSuite('v6-badges', tests);
await closeBrowser();
process.exit(result.failed ? 1 : 0);
