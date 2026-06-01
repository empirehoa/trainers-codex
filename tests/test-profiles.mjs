// Sprint-4 gate: public profiles — handles, routing, payload shaping, and the
// public-profile UI driven by an injected in-memory ProfileClient.
//
// The bundle is static and the harness aborts every external request, so there
// is no real Supabase round-trip to test. Instead we exercise the SHIPPED pure
// logic via window.__tc (real compiled code, not a mirror) and drive the /u/<h>
// route with a stub client injected through window.__tc.__setProfileClient.

import {
  runSuite, sleep, assert, assertEq, closeBrowser,
} from './harness.mjs';

// Build a stub ProfileClient in page scope and open a profile route against it.
// Returns nothing — callers wait on rendered text. Everything runs inside one
// evaluate so the stub's functions live in the page (functions can't cross the
// node↔page boundary as arguments).
const SEED_AND_OPEN = (handle, viewerId, opts) => {
  const o = opts || {};
  const w = window;
  w.__tc.__setProfileClient({
    getProfile: async (h) =>
      o.missing ? null : { handle: h, display: 'Red', bio: 'Kanto champ in training.', region: 'Kanto', motto: 'Catch em all', avatarUrl: null },
    getTeams: async () => ([
      { id: 't1', name: 'Kanto Classics', members: [{ id: 6, shiny: false }, { id: 3, shiny: false }, null, null, null, null], trainer: null },
    ]),
    publishProfile: async () => ({ ok: true }),
    publishTeam: async () => ({ ok: true, id: 't1' }),
    fileReport: async () => { w.__reportFiled = true; return { ok: true }; },
  });
  w.__tc.__openProfile(handle, viewerId);
};

const tests = [
  {
    name: 'validateHandle: accepts good handles, normalizes case, rejects bad + reserved',
    async fn(page) {
      const r = await page.evaluate(() => {
        const v = window.__tc.validateHandle;
        return {
          good: v('redfan'),
          upper: v('RedFan'),       // should normalize to lowercase
          short: v('ab').ok,
          long: v('x'.repeat(25)).ok,
          spaces: v('red fan').ok,
          reserved: v('admin').ok,
          dollar: v('red$fan').ok,
        };
      });
      assert(r.good.ok && r.good.handle === 'redfan', 'redfan should be valid');
      assert(r.upper.ok && r.upper.handle === 'redfan', 'uppercase should normalize to lowercase');
      assertEq(r.short, false, '2 chars too short');
      assertEq(r.long, false, '25 chars too long');
      assertEq(r.spaces, false, 'spaces invalid');
      assertEq(r.reserved, false, 'reserved handle "admin" rejected');
      assertEq(r.dollar, false, 'illegal char rejected');
    },
  },
  {
    name: 'parseProfileRoute: path, hash-path, hash-param, query — and null for non-routes',
    async fn(page) {
      const r = await page.evaluate(() => {
        const p = window.__tc.parseProfileRoute;
        return {
          path: p({ pathname: '/u/redfan', hash: '', search: '' }),
          hashPath: p({ pathname: '/', hash: '#/u/redfan', search: '' }),
          hashParam: p({ pathname: '/', hash: '#u=redfan', search: '' }),
          query: p({ pathname: '/', hash: '', search: '?u=redfan' }),
          encoded: p({ pathname: '/u/red%2Dfan', hash: '', search: '' }),
          root: p({ pathname: '/', hash: '', search: '' }),
          reserved: p({ pathname: '/u/admin', hash: '', search: '' }),
        };
      });
      assertEq(r.path, 'redfan', 'real path /u/redfan');
      assertEq(r.hashPath, 'redfan', 'hash path #/u/redfan');
      assertEq(r.hashParam, 'redfan', 'hash param #u=redfan');
      assertEq(r.query, 'redfan', 'query ?u=redfan');
      assertEq(r.encoded, 'red-fan', 'percent-encoded handle decodes');
      assertEq(r.root, null, 'root path is not a profile route');
      assertEq(r.reserved, null, 'reserved handle in path → null (validation rejects)');
    },
  },
  {
    name: 'profileUrl: real path with origin, hash deep-link without',
    async fn(page) {
      const r = await page.evaluate(() => ({
        withOrigin: window.__tc.profileUrl('redfan', 'https://trainerscodex.com'),
        withSlash: window.__tc.profileUrl('redfan', 'https://trainerscodex.com/'),
        without: window.__tc.profileUrl('redfan', ''),
      }));
      assertEq(r.withOrigin, 'https://trainerscodex.com/u/redfan', 'origin → real path url');
      assertEq(r.withSlash, 'https://trainerscodex.com/u/redfan', 'trailing slash trimmed');
      assertEq(r.without, '#/u/redfan', 'no origin → hash deep link');
    },
  },
  {
    name: 'shapeProfilePayload: valid handle shapes a row + clamps bio; invalid → error',
    async fn(page) {
      const r = await page.evaluate(() => {
        const s = window.__tc.shapeProfilePayload;
        const longBio = 'x'.repeat(400);
        return {
          ok: s({ userId: 'u1', handle: 'redfan', trainer: { name: 'Red', region: 'Kanto', motto: 'GG' }, bio: longBio, isPublic: true }),
          noUser: s({ userId: '', handle: 'redfan' }).ok,
          badHandle: s({ userId: 'u1', handle: 'a' }).ok,
        };
      });
      assert(r.ok.ok, 'valid input should shape ok');
      assertEq(r.ok.row.handle, 'redfan', 'row carries normalized handle');
      assertEq(r.ok.row.display, 'Red', 'display pulled from trainer name');
      assertEq(r.ok.row.bio.length, 280, 'bio clamped to 280');
      assertEq(r.ok.row.is_public, true, 'is_public passes through');
      assertEq(r.noUser, false, 'missing userId → not ok');
      assertEq(r.badHandle, false, 'bad handle → not ok');
    },
  },
  {
    name: 'shapeTeamPayload: drops empty slots, rejects empty teams',
    async fn(page) {
      const r = await page.evaluate(() => {
        const s = window.__tc.shapeTeamPayload;
        const team = { name: 'My Squad', members: [{ id: 6, shiny: false }, null, { id: 9, shiny: true }, null, null, null] };
        return {
          ok: s({ ownerId: 'u1', team, isPublic: true }),
          empty: s({ ownerId: 'u1', team: { name: 'x', members: [null, null, null, null, null, null] } }).ok,
        };
      });
      assert(r.ok.ok, 'non-empty team shapes ok');
      assertEq(r.ok.row.members.length, 2, 'null slots dropped');
      assertEq(r.ok.row.name, 'My Squad', 'name carried through');
      assertEq(r.empty, false, 'all-null team rejected');
    },
  },
  {
    name: 'shapeReportPayload: validates reason + target kind',
    async fn(page) {
      const r = await page.evaluate(() => {
        const s = window.__tc.shapeReportPayload;
        return {
          ok: s({ reporterId: 'u1', targetKind: 'profile', targetId: 'redfan', reason: 'spam', detail: 'bot' }),
          badReason: s({ reporterId: 'u1', targetKind: 'profile', targetId: 'redfan', reason: 'nonsense' }).ok,
          badKind: s({ reporterId: 'u1', targetKind: 'banana', targetId: 'x', reason: 'spam' }).ok,
          noReporter: s({ reporterId: '', targetKind: 'profile', targetId: 'redfan', reason: 'spam' }).ok,
        };
      });
      assert(r.ok.ok, 'valid report shapes ok');
      assertEq(r.ok.row.reason, 'spam', 'reason carried');
      assertEq(r.ok.row.target_kind, 'profile', 'target_kind carried');
      assertEq(r.badReason, false, 'unknown reason rejected');
      assertEq(r.badKind, false, 'unknown target kind rejected');
      assertEq(r.noReporter, false, 'missing reporter rejected');
    },
  },
  {
    name: 'UI: /u/<handle> renders the profile + public team from injected client',
    async fn(page) {
      await page.evaluate(SEED_AND_OPEN, 'redfan', null, {});
      await sleep(400);
      const body = await page.evaluate(() => document.body.innerText);
      assert(/@redfan/.test(body), 'profile header shows @redfan');
      assert(/Kanto champ/.test(body), 'bio renders');
      assert(/Kanto Classics/.test(body), 'public team name renders');
      assert(/Charizard/.test(body), 'team member sprite/name resolves (Charizard for id 6)');
      assert(/\/u\/redfan/.test(body), 'route breadcrumb shows /u/redfan');
    },
  },
  {
    name: 'UI: unknown handle degrades to "no trainer here" (client returns null)',
    async fn(page) {
      await page.evaluate(SEED_AND_OPEN, 'ghost', null, { missing: true });
      await sleep(350);
      const body = await page.evaluate(() => document.body.innerText);
      assert(/no trainer here/i.test(body), 'missing profile shows empty state');
    },
  },
  {
    name: 'UI: no configured client → "cloud features are off"',
    async fn(page) {
      // Open a route WITHOUT injecting a client. Default deployment has no
      // Supabase config, so the client resolves to null → offline state.
      await page.evaluate(() => window.__tc.__openProfile('redfan'));
      await sleep(350);
      const body = await page.evaluate(() => document.body.innerText);
      assert(/cloud features are off/i.test(body), 'offline deployment shows cloud-off state');
    },
  },
  {
    name: 'UI: a signed-in viewer can file a report through the injected client',
    async fn(page) {
      await page.evaluate(SEED_AND_OPEN, 'redfan', 'viewer-123', {});
      await sleep(400);

      // Click the "report" toggle.
      const opened = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(b => /report/i.test(b.innerText.trim()) && b.innerText.trim().length < 12);
        if (btn) { btn.click(); return true; }
        return false;
      });
      assert(opened, 'report toggle should be present for a signed-in viewer');
      await sleep(200);

      // Submit the report (default reason = spam).
      const submitted = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(b => /submit report/i.test(b.innerText.trim()));
        if (btn) { btn.click(); return true; }
        return false;
      });
      assert(submitted, 'submit report button should appear once reporting is open');
      await sleep(300);

      const filed = await page.evaluate(() => window.__reportFiled === true);
      assert(filed, 'fileReport should have been called on the injected client');
    },
  },
];

const result = await runSuite('profiles', tests);
await closeBrowser();
process.exit(result.failed ? 1 : 0);
