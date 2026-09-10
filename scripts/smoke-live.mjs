#!/usr/bin/env node
// Trainer's Codex — post-deploy smoke.
//
// Reads the LIVE site and API and asserts the things a bad deploy breaks: the
// shell shipped with its config and static first paint, the reference pages
// are served statically, the sitemap is complete, the PWA files carry the right
// MIME types, the security headers are on every route, and the worker's guards
// (CORS allow-list, merch kill switch, JSON guards, license verification) hold.
//
//   SITE=https://trainerscodex.com API=https://trainers-codex-api.jrriestra.workers.dev \
//     node scripts/smoke-live.mjs [--browser] [--skip-site] [--skip-worker]
//
// Defaults are production. No dependencies beyond Node 22's fetch; --browser
// adds the puppeteer checks (the ?unlock=premium bypass must be inert, zero
// console errors on boot) using the same Chromium the test suite resolves.
//
// Every request is spaced ≥ 1 s apart — this runs against production. Exit
// code is non-zero on any FAIL.

import { setTimeout as delay } from 'node:timers/promises';

const SITE = (process.env.SITE || 'https://trainerscodex.com').replace(/\/+$/, '');
const API = (process.env.API || 'https://trainers-codex-api.jrriestra.workers.dev').replace(/\/+$/, '');
const args = new Set(process.argv.slice(2));
const BROWSER = args.has('--browser');
const SKIP_SITE = args.has('--skip-site');
const SKIP_WORKER = args.has('--skip-worker');
const EXPECTED_LOCS = 1330;
const SITE_ORIGIN = 'https://trainerscodex.com';

// ── rate-limited fetch ──────────────────────────────────────────────────────

let lastStart = 0;
async function fetchSlow(url, init = {}) {
  const wait = lastStart + 1000 - Date.now();
  if (wait > 0) await delay(wait);
  lastStart = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    return await fetch(url, { redirect: 'manual', ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Follow redirects by hand so the chain can be reported. */
async function fetchChain(url, max = 5) {
  const chain = [];
  let current = url;
  for (let i = 0; i <= max; i++) {
    const res = await fetchSlow(current);
    chain.push({ url: current, status: res.status });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).href;
      continue;
    }
    return { res, chain };
  }
  throw new Error(`more than ${max} redirects: ${chain.map(c => `${c.status} ${c.url}`).join(' → ')}`);
}

// ── results ─────────────────────────────────────────────────────────────────

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`  ${mark}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** Run one check; any thrown error is a FAIL with the message as detail. */
async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, typeof detail === 'string' ? detail : '');
  } catch (e) {
    record(name, false, e instanceof Error ? e.message : String(e));
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

const has = (s, needle) => s.includes(needle);

// ── site ────────────────────────────────────────────────────────────────────

async function siteChecks() {
  console.log(`\n▶ site ${SITE}`);

  let home = null;
  await check('GET / → 200, shell with config + static first paint', async () => {
    const res = await fetchSlow(`${SITE}/`, { headers: { 'accept-encoding': 'br, gzip' } });
    expect(res.status === 200, `status ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    expect(ct.startsWith('text/html'), `content-type ${ct}`);
    const html = await res.text();
    home = { res, html };
    expect(has(html, 'TRAINERS_CODEX_CONFIG'), 'TRAINERS_CODEX_CONFIG missing — config was not injected');
    expect(has(html, 'og-home.jpg'), 'og-home.jpg missing — old OG image or old build');
    const root = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script/);
    expect(root && root[1].trim().length > 0 && /<header/.test(root[1]),
      '<div id="root"> has no static markup — the pre-hydration shell is missing');
    expect(!has(html, 'preview mode — every premium surface'),
      'old unlock toast wording present — this is the pre-hardening build (A-1)');
    return `${(html.length / 1024).toFixed(0)} KB`;
  });

  await check('GET / → content-encoding br|gzip', async () => {
    expect(home, 'home did not load');
    const enc = home.res.headers.get('content-encoding') || '';
    expect(/\b(br|gzip)\b/.test(enc), `content-encoding "${enc}"`);
    return enc;
  });

  await check('GET / → security headers (CSP incl. pokepast.es + cloudflareinsights, XFO DENY, HSTS)', async () => {
    expect(home, 'home did not load');
    assertSecurityHeaders(home.res);
    return 'ok';
  });

  await check('GET /pokemon/gengar/ → 200 static reference page', async () => {
    const res = await fetchSlow(`${SITE}/pokemon/gengar/`);
    expect(res.status === 200, `status ${res.status}`);
    const html = await res.text();
    expect(!has(html, 'TRAINERS_CODEX_CONFIG'), 'served the app shell, not the static page');
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || '';
    expect(/gengar/i.test(title), `title "${title}" does not name the species`);
    expect(has(html, 'fan-made'), "'fan-made' disclaimer missing");
    assertSecurityHeaders(res);
    return title;
  });

  await check('GET /pokemon/gengar (no slash) → resolves to the static page', async () => {
    const { res, chain } = await fetchChain(`${SITE}/pokemon/gengar`);
    expect(res.status >= 200 && res.status < 300, `final status ${res.status}`);
    const html = await res.text();
    expect(has(html, 'fan-made') && !has(html, 'TRAINERS_CODEX_CONFIG'),
      'final content is not the static page (SPA fallback swallowed the route?)');
    return chain.map(c => `${c.status} ${c.url.replace(SITE, '')}`).join(' → ');
  });

  await check('GET /type/ghost/ → 200', async () => {
    const res = await fetchSlow(`${SITE}/type/ghost/`);
    expect(res.status === 200, `status ${res.status}`);
    const html = await res.text();
    expect(/ghost/i.test(html.match(/<title>([^<]*)<\/title>/)?.[1] || ''), 'title does not name the type');
    return 'ok';
  });

  await check(`GET /sitemap.xml → ${EXPECTED_LOCS} <loc>`, async () => {
    const res = await fetchSlow(`${SITE}/sitemap.xml`);
    expect(res.status === 200, `status ${res.status}`);
    const xml = await res.text();
    const n = (xml.match(/<loc>/g) || []).length;
    expect(n === EXPECTED_LOCS, `${n} <loc> entries`);
    return `${n} urls`;
  });

  await check('GET /journey?seed=8843 → 200 text/html with config (SPA fallback)', async () => {
    const res = await fetchSlow(`${SITE}/journey?seed=8843`);
    expect(res.status === 200, `status ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    expect(ct.startsWith('text/html'), `content-type ${ct}`);
    const html = await res.text();
    expect(has(html, 'TRAINERS_CODEX_CONFIG'), 'the journey route did not serve the app shell');
    return 'ok';
  });

  await check('GET /sw.js → application/javascript, max-age=0', async () => {
    const res = await fetchSlow(`${SITE}/sw.js`);
    expect(res.status === 200, `status ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    expect(/^(application|text)\/javascript/.test(ct), `content-type ${ct}`);
    const cc = res.headers.get('cache-control') || '';
    expect(/max-age=0/.test(cc), `cache-control "${cc}" — a long-cached SW pins clients to a stale shell`);
    return `${ct}; ${cc}`;
  });

  await check("GET /manifest.webmanifest → application/manifest+json, name \"Trainer's Codex\"", async () => {
    const res = await fetchSlow(`${SITE}/manifest.webmanifest`);
    expect(res.status === 200, `status ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    expect(ct.startsWith('application/manifest+json'), `content-type ${ct}`);
    const manifest = JSON.parse(await res.text());
    expect(manifest.name === "Trainer's Codex", `name ${JSON.stringify(manifest.name)}`);
    return ct;
  });

  for (const path of ['/legal.html', '/dmca.html']) {
    await check(`GET ${path} → 200`, async () => {
      const res = await fetchSlow(`${SITE}${path}`);
      expect(res.status === 200, `status ${res.status}`);
      expect((res.headers.get('content-type') || '').startsWith('text/html'), 'not html');
      return 'ok';
    });
  }

  await check('GET /nonexistent-route → security headers still applied', async () => {
    const res = await fetchSlow(`${SITE}/nonexistent-route-${Date.now().toString(36)}`);
    assertSecurityHeaders(res);
    return `status ${res.status}`;
  });
}

function assertSecurityHeaders(res) {
  const csp = res.headers.get('content-security-policy') || '';
  expect(csp, 'no Content-Security-Policy header — public/_headers did not ship');
  expect(has(csp, 'pokepast.es'), 'CSP lacks pokepast.es (Showdown paste import is blocked)');
  expect(has(csp, 'static.cloudflareinsights.com'), 'CSP lacks static.cloudflareinsights.com');
  expect(has(csp, "frame-ancestors 'none'"), "CSP lacks frame-ancestors 'none'");
  expect((res.headers.get('x-frame-options') || '').toUpperCase() === 'DENY',
    `x-frame-options "${res.headers.get('x-frame-options')}"`);
  const hsts = res.headers.get('strict-transport-security') || '';
  expect(/max-age=\d{6,}/.test(hsts), `strict-transport-security "${hsts}"`);
  expect((res.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff', 'x-content-type-options missing');
}

// ── worker ──────────────────────────────────────────────────────────────────

// 1×1 transparent PNG — the smallest thing the merch upload accepts.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function noneJwt() {
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({
    iss: 'trainerscodex.com', sub: 'smoke', email: 'smoke@example.test', plan: 'premium',
    stripe_session: 'cs_test_smoke', iat: now, exp: now + 3600,
  })}.`;
}

async function readJson(res) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

async function workerChecks() {
  console.log(`\n▶ worker ${API}`);
  const site = { origin: SITE_ORIGIN };

  await check('GET /health → 200 JSON', async () => {
    const res = await fetchSlow(`${API}/health`);
    expect(res.status === 200, `status ${res.status}`);
    const { json, text } = await readJson(res);
    expect(json && typeof json === 'object', `not JSON: ${text.slice(0, 80)}`);
    return text.slice(0, 80);
  });

  await check('OPTIONS /stripe/checkout from an evil origin → no ACAO', async () => {
    const res = await fetchSlow(`${API}/stripe/checkout`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    const acao = res.headers.get('access-control-allow-origin');
    expect(!acao, `access-control-allow-origin: ${acao}`);
    return `status ${res.status}, no ACAO`;
  });

  await check('POST /merch/checkout (multipart, tiny png) → 503 merch_disabled', async () => {
    const fd = new FormData();
    fd.set('product', 'mug');
    fd.set('design', 'crest');
    fd.set('markup', '100');
    fd.set('expectedRetail', '1');
    fd.set('returnUrl', `${SITE_ORIGIN}/`);
    fd.set('file', new Blob([PNG_1x1], { type: 'image/png' }), 'print.png');
    const res = await fetchSlow(`${API}/merch/checkout`, { method: 'POST', headers: site, body: fd });
    const { json, text } = await readJson(res);
    expect(res.status === 503, `status ${res.status}: ${text.slice(0, 120)}`);
    expect(json?.error === 'merch_disabled', `error ${JSON.stringify(json?.error)} — MERCH IS NOT DARK`);
    return '503 merch_disabled';
  });

  await check('POST /stripe/verify body `null` → 400 bad_json', async () => {
    const res = await fetchSlow(`${API}/stripe/verify`, {
      method: 'POST', headers: { ...site, 'content-type': 'application/json' }, body: 'null',
    });
    const { json, text } = await readJson(res);
    expect(res.status === 400, `status ${res.status}: ${text.slice(0, 120)}`);
    expect(json?.error === 'bad_json', `error ${JSON.stringify(json?.error)}`);
    return '400 bad_json';
  });

  await check('POST /license/verify with an alg:none JWT → never valid:true', async () => {
    const res = await fetchSlow(`${API}/license/verify`, {
      method: 'POST', headers: { ...site, 'content-type': 'application/json' },
      body: JSON.stringify({ jwt: noneJwt() }),
    });
    const { json, text } = await readJson(res);
    expect(json?.valid !== true, 'alg:none token accepted as VALID — license verification is broken');
    expect(res.status === 200 || (res.status >= 400 && res.status < 500), `status ${res.status}: ${text.slice(0, 120)}`);
    return `status ${res.status}, valid=${JSON.stringify(json?.valid ?? null)}`;
  });

  await check('POST /stripe/checkout {} → 400 (not 500)', async () => {
    const res = await fetchSlow(`${API}/stripe/checkout`, {
      method: 'POST', headers: { ...site, 'content-type': 'application/json' }, body: '{}',
    });
    const { text } = await readJson(res);
    expect(res.status === 400, `status ${res.status}: ${text.slice(0, 120)}`);
    return text.slice(0, 80);
  });
}

// ── browser ─────────────────────────────────────────────────────────────────

async function browserChecks() {
  console.log(`\n▶ browser ${SITE}`);
  const [{ default: puppeteer }, { chromiumPath }] = await Promise.all([
    import('puppeteer'),
    import('../tests/harness.mjs'),
  ]);
  const executablePath = chromiumPath();
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 900 },
    ...(executablePath ? { executablePath } : {}),
  });

  async function freshPage() {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      // Network-level failures (a rate-limited sprite mirror, an ad blocker)
      // also surface as console errors; they are not app defects.
      if (msg.type() === 'error' && !/Failed to load resource|net::ERR_/.test(msg.text())) {
        errors.push(`console.error: ${msg.text()}`);
      }
    });
    return { page, context, errors };
  }

  try {
    await check('?unlock=premium is inert: no unlock toast, no preview flag, locked poster styles', async () => {
      const { page, context } = await freshPage();
      try {
        await page.goto(`${SITE}/?unlock=premium`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForSelector('header', { timeout: 45_000 });
        await delay(1500);
        const boot = await page.evaluate(() => ({
          flag: localStorage.getItem('trainerscodex.premium'),
          toasts: [...document.querySelectorAll('[data-sonner-toast], [role="status"]')].map(el => el.textContent || ''),
          workerConfigured: !!window.TRAINERS_CODEX_CONFIG?.worker?.url,
        }));
        expect(boot.workerConfigured, 'TRAINERS_CODEX_CONFIG.worker.url missing — the deploy has no worker configured');
        expect(boot.flag === null, `trainerscodex.premium = ${JSON.stringify(boot.flag)} — the preview flag was written`);
        expect(!boot.toasts.some(t => /premium unlocked/i.test(t)), `unlock toast shown: ${JSON.stringify(boot.toasts)}`);

        // Poster Studio: load a preset team, open the wand, count locks.
        await page.evaluate(() => {
          const target = [...document.querySelectorAll('button')].find(b =>
            /kanto|johto|hoenn|sinnoh|unova|kalos|alola|galar|paldea/i.test(b.innerText)
            && !/region/i.test(b.innerText) && b.innerText.trim().length < 40);
          if (target) target.click();
        });
        await delay(300);
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('header button')].find(b => b.querySelector('svg.lucide-wand-sparkles'));
          if (btn) btn.click();
        });
        await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
        await delay(500);
        const studio = await page.evaluate(() => ({
          locks: document.querySelectorAll('[role="dialog"] svg.lucide-lock').length,
          active: /premium\s*·\s*active/i.test(document.querySelector('[role="dialog"]')?.innerText || ''),
        }));
        expect(studio.locks >= 1, `Poster Studio shows ${studio.locks} locked styles — premium is open to everyone`);
        expect(!studio.active, 'the premium · active pill rendered without a license');
        return `${studio.locks} locked styles, flag null`;
      } finally {
        await context.close();
      }
    });

    await check('zero console errors on boot of /', async () => {
      const { page, context, errors } = await freshPage();
      try {
        await page.goto(`${SITE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForSelector('header', { timeout: 45_000 });
        await delay(2000);
        expect(errors.length === 0, errors.join(' | ').slice(0, 400));
        return 'clean console';
      } finally {
        await context.close();
      }
    });
  } finally {
    await browser.close();
  }
}

// ── main ────────────────────────────────────────────────────────────────────

console.log(`Trainer's Codex smoke · ${new Date().toISOString()}`);
if (!SKIP_SITE) await siteChecks();
if (!SKIP_WORKER) await workerChecks();
if (BROWSER) await browserChecks();

const failed = results.filter(r => !r.pass);
const width = Math.min(72, Math.max(...results.map(r => r.name.length)));
console.log('\n' + '─'.repeat(width + 8));
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}${r.pass ? '' : `  ${r.detail}`}`);
}
console.log('─'.repeat(width + 8));
console.log(`${results.length - failed.length}/${results.length} passed${failed.length ? ` · ${failed.length} FAILED` : ''}`);
process.exit(failed.length ? 1 : 0);
