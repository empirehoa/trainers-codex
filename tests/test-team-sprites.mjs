// Verifies the team bar honors each member's chosen sprite family — the
// TeamSlot.resolveSlotSprite() fix. Injects a team via localStorage (mixed
// sprite kinds), reloads, and asserts each slot's <img src> points at the
// right host: Showdown ani for animated-gen5, PokeAPI home for home-default,
// PokeAPI pixel for the default. The harness aborts external requests, so we
// assert on the src attribute the app sets, not on pixel data.

import { runSuite, sleep, assert, closeBrowser } from './harness.mjs';

const STORAGE_KEY = 'trainerscodex.v2';

// id 10034 = Charizard Mega X (form slug → charizard-megax),
// id 25 = Pikachu, id 448 = Lucario.
const TEAM = {
  current: {
    name: 'Sprite Test',
    members: [
      { id: 10034, shiny: false, sprite: 'animated-gen5' },
      { id: 25, shiny: false, sprite: 'home-default' },
      { id: 448, shiny: false, sprite: 'pixel-default' },
      null, null, null,
    ],
  },
  premium: true,
};

// 1x1 transparent PNG — served as a stub for any sprite-host image request.
const STUB_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// The harness aborts all external requests for offline determinism. But TeamSlot's
// <img onError> handler rewrites src to the pixel fallback when its request is
// aborted — which destroys the very attribute this test inspects. So we replace
// the harness interception: respond to sprite-host image requests with a stub PNG
// (load succeeds, onError never fires, src stays as the app set it) and abort
// everything else. Still fully offline — the stub never leaves the process.
function installSpriteStub(page) {
  page.removeAllListeners('request');
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
      req.continue();
    } else if (/play\.pokemonshowdown\.com|raw\.githubusercontent\.com/.test(url)) {
      req.respond({ status: 200, contentType: 'image/png', body: STUB_PNG });
    } else {
      req.abort('failed');
    }
  });
}

async function seedAndReload(page) {
  installSpriteStub(page);
  await page.evaluate((key, payload) => {
    localStorage.setItem(key, JSON.stringify(payload));
  }, STORAGE_KEY, TEAM);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 10_000 });
  await sleep(300);
}

// Collect the src of every team-bar slot img. Each filled slot wraps its img in
// a `button[title^="Configure "]`, which is unique to the team bar — scoping to
// it keeps the Pokémon picker grid (which legitimately shows id 10034 as a pixel
// card) out of the results, so the "no pixel fallback" assertion stays honest.
async function slotSrcs(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll('button[title^="Configure "] img')]
      .map(img => img.getAttribute('src') || '')
      .filter(Boolean);
  });
}

const tests = [
  {
    name: 'animated-gen5 member renders Showdown ani URL on the team bar',
    async fn(page) {
      await seedAndReload(page);
      const srcs = await slotSrcs(page);
      const hit = srcs.find(s => /play\.pokemonshowdown\.com\/sprites\/ani\/charizard-megax\.gif/.test(s));
      assert(hit, `expected charizard-megax.gif Showdown URL; got: ${srcs.join(' | ').slice(0, 400)}`);
    },
  },
  {
    name: 'home-default member renders PokeAPI HOME 3D sprite',
    async fn(page) {
      await seedAndReload(page);
      const srcs = await slotSrcs(page);
      const hit = srcs.find(s => /sprites\/pokemon\/other\/home\/25\.png/.test(s));
      assert(hit, `expected HOME sprite for Pikachu (id 25); got: ${srcs.join(' | ').slice(0, 400)}`);
    },
  },
  {
    name: 'default (pixel) member renders PokeAPI pixel sprite',
    async fn(page) {
      await seedAndReload(page);
      const srcs = await slotSrcs(page);
      const hit = srcs.find(s => /sprites\/pokemon\/448\.png$/.test(s));
      assert(hit, `expected pixel sprite for Lucario (id 448); got: ${srcs.join(' | ').slice(0, 400)}`);
    },
  },
  {
    name: 'animated and home members do NOT fall back to pixel by default',
    async fn(page) {
      await seedAndReload(page);
      const srcs = await slotSrcs(page);
      // The Charizard Mega X slot must not render the plain pixel URL for 10034.
      const wrongPixel = srcs.find(s => /sprites\/pokemon\/10034\.png$/.test(s));
      assert(!wrongPixel, `animated member fell back to pixel unexpectedly: ${srcs.join(' | ').slice(0, 400)}`);
    },
  },
];

const result = await runSuite('team-sprites', tests);
await closeBrowser();
process.exit(result.failed ? 1 : 0);
