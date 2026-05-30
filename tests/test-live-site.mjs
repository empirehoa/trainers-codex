// Smoke test against the LIVE production site at https://trainerscodex.com.
// Verifies v6 features end-to-end including:
//   - Page loads with correct headers + CSP
//   - Supabase config baked in
//   - All v6 features render
//   - Light/dark toggle works
//   - Trainer card design works in Merch Studio
//   - Stripe Checkout returns a real session URL
//
// Run after every deploy: `node tests/test-live-site.mjs`

import puppeteer from 'puppeteer';

const LIVE = 'https://trainerscodex.com';
const WORKER = 'https://trainers-codex-api.jrriestra.workers.dev';

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const results = [];
  const fail = (name, err) => { results.push({ name, status: 'fail', error: err.message }); console.log(`  ✗ ${name}: ${err.message}`); };
  const pass = (name, ms) => { results.push({ name, status: 'pass', ms }); console.log(`  ✓ ${name} (${ms}ms)`); };

  // ---------- 1. Site loads with v6 bundle ----------
  let t0 = Date.now();
  const page = await browser.newPage();
  try {
    const resp = await page.goto(LIVE, { waitUntil: 'networkidle2', timeout: 30000 });
    if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);
    const headers = resp.headers();
    if (!headers['content-security-policy']) throw new Error('CSP header missing');
    if (!headers['strict-transport-security']) throw new Error('HSTS missing');
    pass('Page loads with security headers', Date.now() - t0);
  } catch (e) { fail('Page loads with security headers', e); }

  // ---------- 2. Supabase config baked in ----------
  t0 = Date.now();
  try {
    const config = await page.evaluate(() => window.TRAINERS_CODEX_CONFIG);
    if (!config?.supabase?.url?.includes('supabase.co')) throw new Error('Supabase URL missing');
    if (!config?.supabase?.anonKey?.startsWith('sb_publishable_')) throw new Error('Supabase key missing or wrong format');
    if (!config?.worker?.url?.includes('workers.dev')) throw new Error('Worker URL missing');
    pass('TRAINERS_CODEX_CONFIG is wired', Date.now() - t0);
  } catch (e) { fail('TRAINERS_CODEX_CONFIG is wired', e); }

  // ---------- 3. React mounts ----------
  t0 = Date.now();
  try {
    await page.waitForSelector('header h1', { timeout: 10000 });
    const title = await page.$eval('header h1', el => el.innerText);
    if (!title.toLowerCase().includes('trainer')) throw new Error(`Header missing trainer · got "${title}"`);
    pass('React mounts and header renders', Date.now() - t0);
  } catch (e) { fail('React mounts and header renders', e); }

  // ---------- 4. v6 features present ----------
  t0 = Date.now();
  try {
    // Find theme toggle, AI Studio, Merch buttons via icon classes
    const hasThemeToggle = await page.evaluate(() => {
      return !![...document.querySelectorAll('header button svg')].find(s => s.classList.contains('lucide-sun') || s.classList.contains('lucide-moon'));
    });
    const hasAIStudio = await page.evaluate(() => {
      return !![...document.querySelectorAll('header button svg')].find(s => s.classList.contains('lucide-sparkles'));
    });
    if (!hasThemeToggle) throw new Error('Theme toggle button missing');
    if (!hasAIStudio) throw new Error('AI Studio button missing');
    pass('v6 buttons present (theme toggle + AI Studio)', Date.now() - t0);
  } catch (e) { fail('v6 buttons present (theme toggle + AI Studio)', e); }

  // ---------- 5. Light/dark mode toggle ----------
  t0 = Date.now();
  try {
    const initialTheme = await page.evaluate(() => document.documentElement.classList.contains('light') ? 'light' : 'dark');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('header button')].find(b => b.querySelector('svg.lucide-sun, svg.lucide-moon'));
      btn?.click();
    });
    await new Promise(r => setTimeout(r, 300));
    const newTheme = await page.evaluate(() => document.documentElement.classList.contains('light') ? 'light' : 'dark');
    if (newTheme === initialTheme) throw new Error('Theme did not change after toggle click');
    pass(`Light/dark toggle: ${initialTheme} → ${newTheme}`, Date.now() - t0);
  } catch (e) { fail('Light/dark toggle', e); }

  // ---------- 6. Build a team ----------
  t0 = Date.now();
  try {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('header button')];
      const dice = btns.find(b => b.querySelector('svg.lucide-dices'));
      dice?.click();
    });
    await new Promise(r => setTimeout(r, 500));
    const teamCount = await page.evaluate(() => document.querySelectorAll('[class*="fixed bottom-0"] img').length);
    if (teamCount < 6) throw new Error(`Random team only filled ${teamCount}/6 slots`);
    pass(`Random team builds (${teamCount}/6 slots)`, Date.now() - t0);
  } catch (e) { fail('Random team builds', e); }

  // ---------- 7. Worker /health endpoint ----------
  t0 = Date.now();
  try {
    const resp = await page.evaluate(async (url) => {
      const r = await fetch(url, { method: 'GET' });
      return { status: r.status, json: await r.json() };
    }, `${WORKER}/health`);
    if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
    if (!resp.json?.ok) throw new Error(`Worker /health did not return ok`);
    pass('Worker /health responds OK', Date.now() - t0);
  } catch (e) { fail('Worker /health responds OK', e); }

  // ---------- 8. Worker /stripe/checkout returns real session ----------
  t0 = Date.now();
  try {
    const resp = await page.evaluate(async (url) => {
      const r = await fetch(`${url}/stripe/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnUrl: 'https://trainerscodex.com', email: 'smoke@trainerscodex.com' }),
      });
      return { status: r.status, json: await r.json() };
    }, WORKER);
    if (resp.status !== 200) throw new Error(`HTTP ${resp.status}: ${JSON.stringify(resp.json)}`);
    if (!resp.json?.url?.includes('checkout.stripe.com')) throw new Error(`No Stripe URL in response`);
    if (!resp.json?.sessionId?.startsWith('cs_')) throw new Error(`No session ID in response`);
    pass(`Worker /stripe/checkout returns real Stripe URL (${resp.json.sessionId.slice(0, 20)}…)`, Date.now() - t0);
  } catch (e) { fail('Worker /stripe/checkout returns real Stripe URL', e); }

  // ---------- 9. Sign-in dialog opens ----------
  t0 = Date.now();
  try {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('header button')];
      const login = btns.find(b => b.querySelector('svg.lucide-log-in, svg.lucide-cloud'));
      login?.click();
    });
    await new Promise(r => setTimeout(r, 400));
    const opened = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
    if (!opened) throw new Error('Sign-in dialog did not open');
    const text = await page.evaluate(() => document.body.innerText);
    const hasProviders = /google|apple|microsoft|github|discord/i.test(text);
    if (!hasProviders) throw new Error('No OAuth provider buttons visible');
    pass('Sign-in dialog opens with real OAuth providers', Date.now() - t0);
  } catch (e) { fail('Sign-in dialog opens with real OAuth providers', e); }

  // ---------- 10. Merch Studio with trainer-card design ----------
  t0 = Date.now();
  try {
    // Close any open dialogs first
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 200));
    // Open Merch Studio
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('header button')];
      const bag = btns.find(b => b.querySelector('svg.lucide-shopping-bag'));
      bag?.click();
    });
    await new Promise(r => setTimeout(r, 600));
    const hasTrainerCard = await page.evaluate(() => /trainer card/i.test(document.body.innerText));
    if (!hasTrainerCard) throw new Error('Trainer Card design not visible in Merch Studio');
    pass('Merch Studio opens with Trainer Card design', Date.now() - t0);
  } catch (e) { fail('Merch Studio opens with Trainer Card design', e); }

  // ---------- Screenshots ----------
  t0 = Date.now();
  try {
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: '/tmp/tc-screenshots/live-team-dark.png', fullPage: false });
    // Toggle to light mode for second shot
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('header button')].find(b => b.querySelector('svg.lucide-sun, svg.lucide-moon'));
      btn?.click();
    });
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: '/tmp/tc-screenshots/live-team-light.png', fullPage: false });
    pass('Screenshots captured (dark + light)', Date.now() - t0);
  } catch (e) { fail('Screenshots captured', e); }

  await browser.close();

  // ---------- Summary ----------
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  console.log(`\n${passed}/${results.length} passed${failed ? ` · ${failed} failed` : ''}`);

  if (failed === 0) {
    console.log('\n✅ Live site smoke test PASSED end-to-end.');
  } else {
    console.log('\n❌ Live site smoke test FAILED. See errors above.');
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
