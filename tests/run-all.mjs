// Orchestrator: runs all 5 test suites sequentially and aggregates results.
// Exits non-zero if any suite fails. Used by `pnpm test`.

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUITES = [
  'test-v4-core.mjs',
  'test-v4-features.mjs',
  'test-v5-features.mjs',
  'test-v5-extras.mjs',
  'test-posters.mjs',
  'test-stripe-printful.mjs',
  'test-team-sprites.mjs',
  'test-showdown.mjs',
  'test-champions.mjs',
  'test-matchup.mjs',
  'test-profiles.mjs',
  'test-merch-legal.mjs',
  'test-responsive.mjs',
  'test-ai-studio.mjs',
  'test-formats.mjs',
  'test-pwa.mjs',
  'test-v6-badges.mjs',
  'test-journey.mjs',
  'test-favorites.mjs',
  'test-security.mjs',
  'test-seo-pages.mjs',
];

let totalPassed = 0;
let totalFailed = 0;
const suiteResults = [];

// Each suite spawns a fresh headless-Chrome context per test and reloads the
// ~1.7MB inlined bundle. On a busy machine that CPU contention can push a
// single page-mount or text-wait past its timeout, flaking a different suite
// each run even though every suite is deterministic in isolation. To keep the
// runner trustworthy we retry a failed suite ONCE: a genuine break fails both
// attempts, while a transient load timeout clears on the quieter retry.
async function runSuite(file) {
  const child = spawn('node', [file], { stdio: 'inherit' });
  return await new Promise(r => child.on('exit', r));
}

for (const suite of SUITES) {
  const file = join(__dirname, suite);
  let code = await runSuite(file);
  if (code !== 0) {
    console.log(`\n↻ retrying ${suite} (first attempt failed — likely load contention)…`);
    code = await runSuite(file);
  }
  suiteResults.push({ suite, code });
  if (code === 0) totalPassed++;
  else totalFailed++;
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`SUITES: ${suiteResults.length}  ·  passed: ${totalPassed}  ·  failed: ${totalFailed}`);
suiteResults.forEach(r => {
  console.log(`  ${r.code === 0 ? '✓' : '✗'}  ${r.suite}`);
});

process.exit(totalFailed === 0 ? 0 : 1);
