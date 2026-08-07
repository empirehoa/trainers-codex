// Security + provenance regression suite.
//
// Honest scope: none of this PREVENTS someone reading the client bundle — the
// web does not permit that. What these tests guarantee is that we never
// accidentally make a copier's life easy (leaked secrets, shipped sourcemaps),
// that the artifact always carries our notice and fingerprint, and that every
// monetizable path stays behind the Worker where the secrets actually live.

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runSuite, assert, closeBrowser } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = readFileSync(join(ROOT, 'bundle.html'), 'utf8');

const tests = [
  {
    name: 'no live secret of any known shape ships in the bundle',
    async fn() {
      const PATTERNS = [
        [/sk_live_[A-Za-z0-9]{8,}/, 'Stripe live secret key'],
        [/sk_test_[A-Za-z0-9]{8,}/, 'Stripe test secret key'],
        [/rk_live_[A-Za-z0-9]{8,}/, 'Stripe restricted key'],
        [/whsec_[A-Za-z0-9]{16,}/, 'Stripe webhook secret'],
        [/ghp_[A-Za-z0-9]{20,}/, 'GitHub token'],
        [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub fine-grained token'],
        [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
        [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
        [/service_role/, 'Supabase service-role reference'],
        [/\bBearer\s+eyJ[A-Za-z0-9_-]{20,}/, 'hardcoded bearer JWT'],
      ];
      const found = PATTERNS.filter(([re]) => re.test(bundle)).map(([, label]) => label);
      assert(found.length === 0, `secrets leaked into bundle.html: ${found.join(', ')}`);
    },
  },

  {
    name: 'no sourcemap is shipped or referenced',
    async fn() {
      assert(!/sourceMappingURL/.test(bundle), 'bundle references a sourcemap');
      assert(!existsSync(join(ROOT, 'dist/assets')) ||
        !readFileSync(join(ROOT, 'dist/index.html'), 'utf8').includes('.map'),
        'a .map file is referenced from dist');
    },
  },

  {
    name: 'the shipped artifact carries the copyright notice and a build fingerprint',
    async fn() {
      assert(/Empire Management Group, LLC\. All rights reserved/.test(bundle),
        'copyright notice missing from bundle.html');
      assert(/PROPRIETARY SOFTWARE/.test(bundle), 'proprietary notice missing');
      assert(/legal@trainerscodex\.com/.test(bundle), 'contact for misuse missing');
      assert(/data-tc-build/.test(bundle), 'build fingerprint hook missing');
    },
  },

  {
    name: 'the repository declares an explicit proprietary license',
    async fn() {
      const p = join(ROOT, 'LICENSE');
      assert(existsSync(p), 'LICENSE file is missing — unlicensed code is ambiguous');
      const text = readFileSync(p, 'utf8');
      assert(/NOT OPEN SOURCE/i.test(text), 'LICENSE must state it is not open source');
      assert(/All rights reserved/i.test(text), 'LICENSE must reserve rights');
    },
  },

  {
    name: 'the IP disclaimer for third-party marks is present',
    async fn() {
      assert(/Nintendo/.test(bundle) && /GAME FREAK/i.test(bundle),
        'third-party trademark disclaimer missing from the shipped artifact');
    },
  },

  {
    name: 'every monetizable path is gated behind the Worker, not the client',
    async fn() {
      // The client may REFERENCE these routes; it must never contain the
      // credentials that make them work. If any of these appear as literals
      // we have shipped a key.
      const clientSecrets = [
        /STRIPE_SECRET_KEY\s*[:=]\s*["'][^"']+["']/,
        /PRINTFUL_API_KEY\s*[:=]\s*["'][^"']+["']/,
        /JWT_SIGNING_KEY\s*[:=]\s*["'][^"']+["']/,
      ];
      const bad = clientSecrets.filter(re => re.test(bundle));
      assert(bad.length === 0, 'a Worker-only secret is assigned in client code');
    },
  },

  {
    name: 'the Worker enforces a CORS allowlist rather than a wildcard',
    async fn() {
      const cors = readFileSync(join(ROOT, 'worker/src/cors.ts'), 'utf8');
      assert(/ALLOWED_ORIGINS/.test(cors), 'worker CORS must read an allowlist');
      assert(!/["']\*["']/.test(cors.replace(/\/\/.*$/gm, '')),
        'worker CORS must not use a wildcard origin');
    },
  },

  {
    name: 'the Worker rate-limits its routes',
    async fn() {
      const idx = readFileSync(join(ROOT, 'worker/src/index.ts'), 'utf8');
      assert(/rateLimit\(/.test(idx), 'worker routes must pass through rateLimit()');
    },
  },

  {
    name: 'premium is verified server-side, not trusted from localStorage alone',
    async fn() {
      const lic = readFileSync(join(ROOT, 'src/lib/license.ts'), 'utf8');
      assert(/verify/i.test(lic), 'license module must support server-side verification');
      const jwt = readFileSync(join(ROOT, 'worker/src/jwt.ts'), 'utf8');
      assert(/HMAC/.test(jwt) && /verify/i.test(jwt),
        'worker must verify license JWTs with HMAC');
    },
  },
];

const result = await runSuite('security', tests);
await closeBrowser();
process.exit(result.failed === 0 ? 0 : 1);
