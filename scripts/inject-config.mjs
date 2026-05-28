#!/usr/bin/env node
// Inject window.TRAINERS_CODEX_CONFIG into bundle.html.
//
// Reads bundle.html, finds the <script type="module"> block, and inserts
// a config <script> immediately before it. Writes deploy/index.html.
//
// Required env vars:
//   SUPABASE_URL        — https://xxxx.supabase.co
//   SUPABASE_ANON_KEY   — eyJhbG... (legacy anon JWT)
//   WORKER_URL          — https://api.trainerscodex.com (or workers.dev)
//
// Optional:
//   SUPABASE_SHA384     — populated by docs/SECURITY.md runbook
//
// Outputs:
//   /tmp/tc-deploy/index.html  — bundle with config injected
//   /tmp/tc-deploy/_headers    — copied from public/
//   /tmp/tc-deploy/robots.txt
//   /tmp/tc-deploy/favicon.svg

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'WORKER_URL'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env: ${missing.join(', ')}`);
  process.exit(1);
}

const cfg = {
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  worker: {
    url: process.env.WORKER_URL.replace(/\/+$/, ''),
  },
};

const injection = `
    <script>
      // Trainer's Codex runtime configuration.
      // The bundle is self-contained when this block is absent; pasting a
      // valid config unlocks Supabase auth + cloud sync and the Stripe
      // Checkout / Printful API paths via the Cloudflare Worker.
      window.TRAINERS_CODEX_CONFIG = ${JSON.stringify(cfg, null, 6).replace(/\n/g, '\n      ').replace(/^      /, '')};
    </script>
`;

const bundle = readFileSync(join(PROJECT_ROOT, 'bundle.html'), 'utf8');
const moduleRe = /<script type="module">/;
if (!moduleRe.test(bundle)) {
  console.error('Could not find <script type="module"> in bundle.html — has the inline.mjs format changed?');
  process.exit(1);
}
const injected = bundle.replace(moduleRe, `${injection}\n    <script type="module">`);

mkdirSync('/tmp/tc-deploy', { recursive: true });
writeFileSync('/tmp/tc-deploy/index.html', injected);
copyFileSync(join(PROJECT_ROOT, 'public/_headers'), '/tmp/tc-deploy/_headers');
copyFileSync(join(PROJECT_ROOT, 'public/robots.txt'), '/tmp/tc-deploy/robots.txt');
copyFileSync(join(PROJECT_ROOT, 'public/favicon.svg'), '/tmp/tc-deploy/favicon.svg');

console.log(`✓ Wrote /tmp/tc-deploy/index.html (${(injected.length / 1024).toFixed(1)} KB)`);
console.log(`  Supabase: ${cfg.supabase.url}`);
console.log(`  Worker:   ${cfg.worker.url}`);
