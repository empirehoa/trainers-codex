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
];

let totalPassed = 0;
let totalFailed = 0;
const suiteResults = [];

for (const suite of SUITES) {
  const file = join(__dirname, suite);
  const child = spawn('node', [file], { stdio: 'inherit' });
  const code = await new Promise(r => child.on('exit', r));
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
