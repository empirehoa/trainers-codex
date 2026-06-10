// AI Studio suite — verifies the photo→AI generator UI: three modes
// (trainer card / team art / codex card), the per-mode style pickers, the
// collectible-card finishes + featured-creature control, and the premium +
// consent gates. These exercise the client UI only; actual generation needs a
// deployed Worker + license and is out of scope for headless tests.

import {
  runSuite, sleep, exists, assert, closeBrowser,
} from './harness.mjs';

async function openAIStudio(page) {
  // Desktop toolbar button carries a stable testid.
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="ai-studio-btn"]');
    if (btn) btn.click();
  });
  await sleep(400);
  const ok = await exists(page, '[role="dialog"]');
  assert(ok, 'AI Studio dialog did not open');
}

// Click a tab trigger / button inside the open dialog by visible-text regex.
// Radix tab triggers ignore synthetic element.click() (CLAUDE.md gotcha #1),
// so locate the element's box and issue a real mouse click at its center.
async function clickInDialog(page, re) {
  const box = await page.evaluate((reSrc) => {
    const rx = new RegExp(reSrc, 'i');
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return null;
    const el = [...dialog.querySelectorAll('button, [role="tab"]')]
      .find(b => rx.test(b.innerText || b.textContent || ''));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, re.source);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  await sleep(300);
  return true;
}

async function dialogText(page) {
  return await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return d ? d.innerText : '';
  });
}

const tests = [
  {
    name: 'AI Studio opens with three mode tabs',
    async fn(page) {
      await openAIStudio(page);
      const txt = (await dialogText(page)).toLowerCase();
      assert(txt.includes('trainer card'), 'missing trainer card tab');
      assert(txt.includes('team art'), 'missing team art tab');
      assert(txt.includes('codex card'), 'missing codex card tab');
    },
  },
  {
    name: 'trainer card tab shows art-style variants',
    async fn(page) {
      await openAIStudio(page);
      // trainer-card is the default tab.
      const txt = (await dialogText(page)).toLowerCase();
      assert(txt.includes('art style'), 'missing art style label');
      const hits = ['modern anime', 'retro 90s', 'watercolor', 'synthwave', 'storybook']
        .filter(s => txt.includes(s));
      assert(hits.length >= 4, `expected >=4 trainer styles, found ${hits.length}: ${hits}`);
    },
  },
  {
    name: 'team art tab shows its own style variants',
    async fn(page) {
      await openAIStudio(page);
      const clicked = await clickInDialog(page, /team art/);
      assert(clicked, 'could not click team art tab');
      const txt = (await dialogText(page)).toLowerCase();
      const hits = ['hyperreal 3d', 'cinematic', 'comic ink', 'vaporwave']
        .filter(s => txt.includes(s));
      assert(hits.length >= 3, `expected >=3 team-art styles, found ${hits.length}: ${hits}`);
    },
  },
  {
    name: 'codex card tab shows six collectible finishes',
    async fn(page) {
      await openAIStudio(page);
      const clicked = await clickInDialog(page, /codex card/);
      assert(clicked, 'could not click codex card tab');
      const txt = (await dialogText(page)).toLowerCase();
      assert(txt.includes('card finish'), 'missing card finish label');
      const finishes = ['classic', 'full art', 'holo rainbow', 'gold premium', 'vintage', 'neo burst']
        .filter(s => txt.includes(s));
      assert(finishes.length >= 5, `expected >=5 card finishes, found ${finishes.length}: ${finishes}`);
    },
  },
  {
    name: 'codex card tab exposes a featured-creature control + legal note',
    async fn(page) {
      await openAIStudio(page);
      await clickInDialog(page, /codex card/);
      const txt = (await dialogText(page)).toLowerCase();
      assert(txt.includes('featured creature'), 'missing featured creature control');
      // Legal bright line surfaced to the user.
      assert(/no official tcg|original/.test(txt), 'missing originality / no-official-TCG note');
    },
  },
  {
    name: 'codex card tab exposes custom style prompt + reference upload',
    async fn(page) {
      await openAIStudio(page);
      await clickInDialog(page, /codex card/);
      // Free-text style prompt textarea.
      const hasPrompt = await exists(page, '[data-testid="codex-card-prompt"]');
      assert(hasPrompt, 'missing custom style prompt textarea');
      // Optional reference-card upload control.
      const hasRef = await exists(page, '[data-testid="codex-card-reference"]');
      assert(hasRef, 'missing style-reference upload control');
      const txt = (await dialogText(page)).toLowerCase();
      // Reference must be framed as style-only, never a copy.
      assert(/style cue|style only|never copy/.test(txt), 'missing style-only / no-copy reassurance');
    },
  },
  {
    name: 'premium gate and consent confirmation are present',
    async fn(page) {
      await openAIStudio(page);
      const txt = (await dialogText(page)).toLowerCase();
      assert(txt.includes('premium'), 'missing premium gating copy');
      assert(/consent|rights to use it|confirm this photo/.test(txt), 'missing consent confirmation');
      // Consent checkbox must exist as an interactive control.
      const hasCheckbox = await exists(page, '#ai-consent, [role="checkbox"]');
      assert(hasCheckbox, 'missing consent checkbox');
    },
  },
  {
    name: 'credit packs + premium tiers render when a worker is configured',
    async fn(page) {
      // The buy UI only appears when a worker URL is configured (static/offline
      // builds show a preview-unlock toggle instead). Inject a config before
      // opening — getWorkerUrl() reads window.TRAINERS_CODEX_CONFIG at render.
      await page.evaluate(() => {
        window.TRAINERS_CODEX_CONFIG = { worker: { url: 'https://worker.test' } };
      });
      await openAIStudio(page);
      const hasPaywall = await exists(page, '[data-testid="ai-paywall"]');
      assert(hasPaywall, 'paywall did not render with worker configured');
      // Three one-time credit packs at the agreed prices.
      assert(await exists(page, '[data-testid="ai-buy-single"]'), 'missing 1-credit pack');
      assert(await exists(page, '[data-testid="ai-buy-five"]'), 'missing 5-credit pack');
      assert(await exists(page, '[data-testid="ai-buy-twenty"]'), 'missing 20-credit pack');
      const txt = await dialogText(page);
      for (const price of ['$1.99', '$6.99', '$19.99']) {
        assert(txt.includes(price), `missing credit price ${price}`);
      }
      // Both premium terms — monthly $4.99 and annual $39.
      assert(await exists(page, '[data-testid="ai-premium-monthly"]'), 'missing monthly premium option');
      assert(await exists(page, '[data-testid="ai-premium-annual"]'), 'missing annual premium option');
      assert(txt.includes('$4.99'), 'missing $4.99/mo price');
      assert(txt.includes('$39'), 'missing $39/yr price');
    },
  },
  {
    name: 'a positive credit balance entitles generation (no paywall)',
    async fn(page) {
      // Seed a cached credit balance + a worker config, then open: the paywall
      // must give way to the "credits available" strip.
      await page.evaluate(() => {
        window.TRAINERS_CODEX_CONFIG = { worker: { url: 'https://worker.test' } };
        localStorage.setItem('trainerscodex.credits.balance', '7');
      });
      await openAIStudio(page);
      assert(!(await exists(page, '[data-testid="ai-paywall"]')), 'paywall shown despite a positive balance');
      assert(await exists(page, '[data-testid="ai-credit-balance"]'), 'missing credit-balance strip');
      const txt = (await dialogText(page)).toLowerCase();
      assert(/\b7\b/.test(txt) && txt.includes('credit'), 'balance count not surfaced');
    },
  },
];

const result = await runSuite('ai-studio', tests);
await closeBrowser();
process.exit(result.failed === 0 ? 0 : 1);
