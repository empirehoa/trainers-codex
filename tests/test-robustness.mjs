// Client robustness suite — untrusted input that used to take the app down.
//
//   - a wrong-typed `trainerscodex.v2` payload (a team name that is an object,
//     a member whose `moves` is a string) used to crash React at boot and,
//     because the payload was already persisted, on every reload after;
//   - the same shapes pasted into Library → import json → load team unmounted
//     the tree on "load team";
//   - a share link's `tn=`/`by=` had no length cap and became the recipient's
//     team name verbatim; the poster renderers drew it off the canvas;
//   - offline, grid cards showed the browser's broken-image glyph.
//
// The harness blocks every non-file:// request, so the sprite path is the
// offline path by construction.

import { runSuite, newPage, closePage, sleep, assert, assertGte, closeBrowser } from './harness.mjs';

const NAME_OBJECT = { teams: [{ id: 'a', name: { o: 1 }, members: [{ id: 25, shiny: false }, null, null, null, null, null], createdAt: 1 }], current: { members: [{ id: 25, shiny: false }, null, null, null, null, null], name: { o: 1 } }, trainer: { name: { x: 1 }, title: 5, region: ['a'], motto: { m: 1 } } };
const MEMBER_JUNK = { teams: [{ id: 'b', name: 'junk', members: ['garbage', 7, { id: 'abc' }, { id: 999999, shiny: 'yes' }, { id: 25, moves: 'x', nickname: { a: 1 }, teraType: 'lava', ability: 9 }, { id: 6, moves: [999999, 'x', null] }], createdAt: 'x' }], current: { members: ['garbage', 7, { id: 'abc' }, { id: 999999 }, { id: 25, moves: 'x', nickname: { a: 1 }, teraType: 'lava' }, { id: 6, moves: [999999, 'x', null], evs: 'no', nature: 'Zzz' }], name: 'junk' }, trainer: { name: 'T', favoriteType: 'lava', signaturePokemonId: 'x', avatarId: 12345 } };
const IMPORT_BRICK = { teams: [{ name: 'Free team pack', members: [{ id: 25, shiny: false, moves: 'x' }, { id: 6, shiny: false, nickname: { a: 1 } }, null, null, null, null], createdAt: 1 }] };

const rootMounted = (page) => page.evaluate(() => (document.getElementById('root')?.children.length ?? 0) > 0);

/** Open a fresh page with localStorage pre-seeded before the app boots. */
async function seededPage(entries, viewport) {
  const page = await newPage({ viewport, query: 'seeded=1' });
  // newPage already navigated; seed then reload so the app boots on the payload.
  await page.evaluate((o) => { for (const [k, v] of Object.entries(o)) localStorage.setItem(k, v); }, entries);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#root', { timeout: 15_000 });
  await sleep(1200);
  return page;
}

async function openAnalysis(page) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(b => /analy/i.test(b.getAttribute('aria-label') || b.textContent) && !b.disabled && b.offsetParent !== null);
    if (b) b.click();
  });
  await sleep(600);
}

const tests = [
  ...[['nameObject', NAME_OBJECT], ['memberJunk', MEMBER_JUNK]].map(([label, payload]) => ({
    name: `a wrong-typed v2 payload (${label}) boots the app and opens the analysis sheet`,
    ownPage: true,
    fn: async () => {
      const page = await seededPage({ 'trainerscodex.v2': JSON.stringify(payload) });
      try {
        assert(await rootMounted(page), 'React tree did not mount');
        assert(!page.__pageErrors, `${page.__pageErrors} page error(s) at boot`);
        // The sanitized current team is restored — the valid members survive.
        const slots = await page.evaluate(() => document.body.innerText.match(/[1-6]\/6/)?.[0] ?? null);
        assert(slots && slots !== '0/6', `expected the valid members restored, team counter reads ${slots}`);
        await openAnalysis(page);
        assert(await rootMounted(page), 'React tree unmounted when the analysis sheet opened');
        assert(!page.__pageErrors, 'page error while rendering the analysis sheet');
        // The stored payload is still there — no crash loop on reload either.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('header', { timeout: 15_000 });
        await sleep(300);
        assert(await rootMounted(page), 'crash loop: tree did not mount on reload');
      } finally {
        await closePage(page);
      }
    },
  })),

  {
    name: 'a crafted Library import cannot brick "load team"',
    fn: async (page) => {
      await page.evaluate(() => document.querySelector('header button[aria-label^="Library"]').click());
      await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
      await page.evaluate(() => { const b = [...document.querySelectorAll('[role="dialog"] button')].find(b => /import json/i.test(b.textContent)); b.click(); });
      await sleep(300);
      await page.evaluate((v) => {
        const t = document.querySelector('textarea[placeholder*="JSON"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(t, v);
        t.dispatchEvent(new Event('input', { bubbles: true }));
      }, JSON.stringify(IMPORT_BRICK));
      await sleep(150);
      await page.evaluate(() => { const b = [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === 'import'); b.click(); });
      await sleep(500);
      const imported = await page.evaluate(() => /imported 1 team/.test(document.body.innerText));
      assert(imported, 'import did not report success');
      await page.evaluate(() => { const b = [...document.querySelectorAll('[role="dialog"] button')].find(b => /^load team/i.test(b.textContent.trim())); b.click(); });
      await sleep(800);
      assert(await rootMounted(page), 'React tree unmounted on "load team"');
      assert(!page.__pageErrors, 'page error on "load team"');
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('trainerscodex.v2')));
      const m = stored.teams[0].members;
      assert(m[0].moves === undefined && m[1].nickname === undefined, `junk fields persisted: ${JSON.stringify(m.slice(0, 2))}`);
      await openAnalysis(page);
      assert(await rootMounted(page) && !page.__pageErrors, 'analysis sheet crashed on the imported team');
    },
  },

  {
    name: 'a share link with 20 KB tn/by labels renders capped names',
    ownPage: true,
    fn: async () => {
      const big = encodeURIComponent('Z'.repeat(20_000));
      const page = await newPage();
      try {
        // Setting the hash on the loaded document is a fragment navigation and
        // does not re-run the mount-time parser — reload so it boots on the link.
        await page.goto(`${page.url().split('#')[0]}#team=25-6-9-3-143-149&tn=${big}&by=${big}`, { waitUntil: 'domcontentloaded' });
        await page.reload({ waitUntil: 'domcontentloaded' });
        // The landing replaces the shell — there is no <header> to wait for.
        await page.waitForFunction(() => /load this team/i.test(document.body.innerText), { timeout: 20_000 });
        await sleep(300);
        const landing = await page.evaluate(() => ({
          shown: /SHARED A TEAM/i.test(document.body.innerText),
          longestRun: Math.max(0, ...(document.body.innerText.match(/Z+/g) || []).map(s => s.length)),
        }));
        assert(landing.shown, 'share landing did not render');
        assert(landing.longestRun <= 40, `landing shows a ${landing.longestRun}-character label`);
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /load this team/i.test(b.textContent)); b.click(); });
        await sleep(500);
        const name = await page.evaluate(() => JSON.parse(localStorage.getItem('trainerscodex.v2') || '{}').current?.name ?? '');
        assert(name.length <= 40, `team name became ${name.length} characters`);
        assert(!page.__pageErrors, 'page error on the share landing');
      } finally {
        await closePage(page);
      }
    },
  },

  {
    name: 'the team-name input caps at 40 characters',
    fn: async (page) => {
      await page.evaluate(() => document.querySelector('header button[aria-label="Random team"]').click());
      await sleep(400);
      await openAnalysis(page);
      const max = await page.evaluate(() => document.querySelector('[role="dialog"] input[aria-label="Team name"]')?.maxLength);
      assert(max === 40, `team-name maxLength is ${max}`);
    },
  },

  {
    name: 'poster renderers keep a 60-character team name inside the canvas',
    ownPage: true,
    fn: async () => {
      // 60 W's — the widest glyph, the storage cap for a name.
      const page = await seededPage({ 'trainerscodex.v2': JSON.stringify({ teams: [], current: { members: [{ id: 25, shiny: false }, { id: 6, shiny: false }, { id: 9, shiny: false }, { id: 3, shiny: false }, { id: 143, shiny: false }, { id: 149, shiny: false }], name: 'W'.repeat(60) }, trainer: { name: 'Tester', motto: 'M'.repeat(120) } }) });
      try {
        // Record every fillText with its measured width and the canvas edge.
        await page.evaluate(() => {
          window.__fills = [];
          const orig = CanvasRenderingContext2D.prototype.fillText;
          CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
            if (/W{6}|M{6}|…/.test(String(text))) {
              window.__fills.push({ text: String(text).slice(0, 30), len: String(text).length, x, w: this.measureText(String(text)).width, align: this.textAlign, W: this.canvas.width });
            }
            return orig.call(this, text, x, y, maxWidth);
          };
        });
        await page.evaluate(() => document.querySelector('header button[aria-label="Poster studio"]').click());
        await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
        const styleButtons = await page.evaluate(() =>
          [...document.querySelectorAll('[role="dialog"] button')].filter(b => b.querySelector('.font-semibold') && !b.querySelector('svg.lucide-lock')).map(b => b.querySelector('.font-semibold').textContent));
        assertGte(styleButtons.length, 4, 'expected the free style picker');
        for (const label of styleButtons) {
          await page.evaluate((l) => { const b = [...document.querySelectorAll('[role="dialog"] button')].find(b => b.querySelector('.font-semibold')?.textContent === l); b.click(); }, label);
          const deadline = Date.now() + 10_000;
          let ok = false;
          while (Date.now() < deadline) {
            ok = await page.evaluate(() => { const i = document.querySelector('[role="dialog"] img[src^="blob:"]'); return !!i && i.naturalWidth > 100; });
            if (ok) break;
            await sleep(120);
          }
          assert(ok, `${label}: no rendered preview`);
        }
        const fills = await page.evaluate(() => window.__fills);
        assertGte(fills.length, styleButtons.length, `expected the title drawn in every style, saw ${fills.length} fills`);
        for (const f of fills) {
          const left = f.align === 'center' ? f.x - f.w / 2 : f.align === 'right' || f.align === 'end' ? f.x - f.w : f.x;
          const right = left + f.w;
          assert(left >= -1 && right <= f.W + 1, `"${f.text}…" (${f.len} chars) spans ${Math.round(left)}..${Math.round(right)} on a ${f.W}px canvas`);
        }
      } finally {
        await closePage(page);
      }
    },
  },

  {
    name: 'offline, no grid card shows the broken-image glyph',
    fn: async (page) => {
      await page.waitForSelector('main img', { timeout: 10_000 });
      await sleep(1500);
      const r = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('main img')];
        return {
          total: imgs.length,
          broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
          fallback: imgs.filter(i => i.src.startsWith('data:image/svg+xml')).length,
        };
      });
      assertGte(r.total, 20, 'grid did not render');
      assert(r.broken === 0, `${r.broken} of ${r.total} grid images are broken`);
      assertGte(r.fallback, 1, 'no card used the placeholder — is the network actually blocked?');
    },
  },
];

const r = await runSuite('robustness', tests);
await closeBrowser();
process.exit(r.failed ? 1 : 0);
