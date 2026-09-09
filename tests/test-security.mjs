// Security + provenance regression suite.
//
// Honest scope: none of this PREVENTS someone reading the client bundle — the
// web does not permit that. What these tests guarantee is that we never
// accidentally make a copier's life easy (leaked secrets, shipped sourcemaps),
// that the artifact always carries our notice and fingerprint, and that every
// monetizable path stays behind the Worker where the secrets actually live.

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { runSuite, assert, closeBrowser } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = readFileSync(join(ROOT, 'bundle.html'), 'utf8');

/** Every file under `dir` (recursive) whose name matches `re`. */
function walk(dir, re, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, re, out);
    else if (re.test(name)) out.push(p);
  }
  return out;
}

/** The directives of the CSP shipped in public/_headers, keyed by name. */
function shippedCsp() {
  const headers = readFileSync(join(ROOT, 'public/_headers'), 'utf8');
  const line = headers.split('\n').find(l => /^\s*Content-Security-Policy:/.test(l));
  assert(line, 'public/_headers carries no Content-Security-Policy');
  const out = {};
  for (const d of line.replace(/^\s*Content-Security-Policy:\s*/, '').split(';')) {
    const [name, ...values] = d.trim().split(/\s+/);
    if (name) out[name] = values;
  }
  return out;
}

/**
 * Hosts the client actually fetches: every `https://host` literal in a
 * non-test src/ module that calls fetch() (directly or through an injected
 * `fetcher`), comments stripped. src/seo is excluded — those pages make no
 * request at all, which render.test.ts asserts separately.
 */
function fetchedHosts() {
  const files = walk(join(ROOT, 'src'), /\.(ts|tsx)$/)
    .filter(f => !/\.test\.tsx?$/.test(f) && !relative(ROOT, f).startsWith('src/seo'));
  const hosts = new Map();
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    if (!/\b(fetch|fetcher)\(/.test(src)) continue;
    for (const m of src.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
      const host = m[1].toLowerCase();
      if (!hosts.has(host)) hosts.set(host, relative(ROOT, f));
    }
  }
  return hosts;
}

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
  {
    name: 'every host the client fetches is allowed by the shipped connect-src',
    async fn() {
      // The paste-link import (pokepast.es, pokebin.com, teams.pokemonshowdown.com)
      // shipped with none of its hosts in connect-src, so "Fetch & import" was
      // CSP-blocked on the live origin while working from file://. This keeps
      // the header and the code in step.
      const csp = shippedCsp();
      const allowed = new Set(csp['connect-src'] ?? []);
      const hosts = fetchedHosts();
      assert(hosts.size >= 4, `expected the fetch-host scan to find several hosts, found ${hosts.size}`);
      for (const known of ['pokepast.es', 'pokebin.com', 'teams.pokemonshowdown.com', 'api.pokemontcg.io']) {
        assert(hosts.has(known), `fetch-host scan no longer sees ${known} — did the scan break?`);
      }
      const missing = [...hosts].filter(([h]) => !allowed.has(`https://${h}`)).map(([h, f]) => `${h} (${f})`);
      assert(missing.length === 0, `hosts fetched by the client but absent from connect-src: ${missing.join(', ')}`);
    },
  },

  {
    name: 'the Cloudflare Web Analytics beacon is allowed rather than red in the console',
    async fn() {
      // Cloudflare auto-injects static.cloudflareinsights.com/beacon.min.js
      // for the zone; the owner may disable it there instead, in which case
      // the header comment says both hosts can be dropped together.
      const csp = shippedCsp();
      assert(csp['script-src'].includes('https://static.cloudflareinsights.com'),
        'script-src must allow the Cloudflare insights beacon (or the zone must have it disabled)');
      assert(csp['connect-src'].includes('https://cloudflareinsights.com'),
        'connect-src must allow the beacon to post');
    },
  },

  {
    name: 'public/_headers is the only headers file in the repo',
    async fn() {
      // deploy/_headers was a stale second copy (older CSP, no reference-page
      // cache rules) that never shipped but invited the wrong file being
      // deployed. It is allowed to exist only as a byte-identical copy.
      const stale = join(ROOT, 'deploy/_headers');
      if (existsSync(stale)) {
        assert(readFileSync(stale, 'utf8') === readFileSync(join(ROOT, 'public/_headers'), 'utf8'),
          'deploy/_headers differs from public/_headers — delete it');
      }
      assert(!existsSync(join(ROOT, 'deploy/index.html')),
        'deploy/index.html is a stale pre-built bundle — the deploy is staged from bundle.html by scripts/inject-config.mjs');
    },
  },

  {
    name: 'launch copy matches the shipped product (merch dark, licence proprietary)',
    async fn() {
      const flags = readFileSync(join(ROOT, 'src/lib/flags.ts'), 'utf8');
      const merchOn = /MERCH_CHECKOUT:\s*true/.test(flags);
      const copy = readFileSync(join(ROOT, 'docs/social-copy.md'), 'utf8');
      // Only the fenced blocks are copy someone would paste; the prose around
      // them is allowed to explain why merch is absent.
      const posts = [...copy.matchAll(/```\n([\s\S]*?)```/g)].map(m => m[1]);
      assert(posts.length >= 10, `expected the launch drafts to be fenced blocks, found ${posts.length}`);
      if (!merchOn) {
        const offenders = posts.filter(p => /merch|printful|print-on-demand/i.test(p));
        assert(offenders.length === 0,
          `${offenders.length} launch post(s) pitch merch while MERCH_CHECKOUT is off: ${(offenders[0] ?? '').slice(0, 80)}…`);
      }
      assert(!/4-7x/.test(copy), 'social-copy.md repeats the unsourced 4-7x merch stat');
      const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
      if (!/\bMIT\b/.test(license)) {
        assert(!/\bMIT\b/.test(copy), 'social-copy.md calls the repo MIT-licensed but LICENSE is not MIT');
        const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
        assert(!/\bMIT\b/.test(readme), 'README.md calls the source MIT but LICENSE is not MIT');
      }
    },
  },
];

const result = await runSuite('security', tests);
await closeBrowser();
process.exit(result.failed === 0 ? 0 : 1);
