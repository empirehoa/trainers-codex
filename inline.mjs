// Inline Vite dist into single self-contained HTML
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname, posix } from 'path';
import { fileURLToPath } from 'url';

// Legal banner stamped into the shipped single-file artifact. This is the file
// that actually reaches browsers (and the one a copier would take), so the
// notice belongs HERE rather than only in the pre-inline chunks.
const LEGAL_BANNER = `<!--
  Trainer's Codex — https://trainerscodex.com
  Copyright (c) 2026 Empire Management Group, LLC. All rights reserved.

  PROPRIETARY SOFTWARE. This is not open source. Redeploying, rehosting,
  rebranding, or creating derivative works from this file is prohibited
  without written permission from Empire Management Group, LLC.

  Pokemon and all related names and marks are the property of Nintendo,
  Creatures Inc. and GAME FREAK inc. This project is unaffiliated with and
  not endorsed by them, and claims no ownership of their marks.

  Report misuse: legal@trainerscodex.com
-->
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, 'dist');

let html = readFileSync(join(dist, 'index.html'), 'utf8');

// ---------------------------------------------------------------------------
// Scripts: one inline module (the entry) + every other chunk as an inert block.
//
// Vite emits the entry as a module script in <head>. Left there, the ~1.6 MB of
// inlined JS sits between the stylesheet and the static first-paint markup
// inside #root (index.html), so the browser cannot paint anything until every
// byte of script has arrived. A module script is deferred regardless of
// position, so moving it after the markup changes nothing about when it runs —
// only what the visitor sees while it downloads.
//
// Lazy chunks (today: @smogon/calc, 474 KB, reached only through the dynamic
// import in src/lib/calc-loader.ts) must stay inside this one file and must
// work from file://, where there is no server to fetch "./assets/calc-x.js"
// from. So each non-entry chunk is embedded as
//   <script type="text/plain" data-chunk="assets/calc-x.js">…</script>
// which the HTML parser stores as raw text and never compiles, and a classic
// script defines globalThis.__TC_CHUNK(name) that turns that text into a Blob
// URL on first request. The entry's `import("./assets/calc-x.js")` is rewritten
// to `import(globalThis.__TC_CHUNK("assets/calc-x.js"))`. The parse/compile
// cost of the chunk is therefore paid on first matchup, not on every boot.
//
// A chunk may statically import a few rolldown runtime helpers back from the
// entry (`import{t as e}from"./index-x.js"`). The entry has no URL to import
// from, so its export list is mirrored onto globalThis.__TC_SHARED at the end
// of its body and the chunk's import becomes a destructuring read of that
// object. Live bindings become snapshots, which is fine for helpers; anything
// else — a chunk importing another chunk statically, an import form this
// script does not recognise — throws here so the build fails loudly instead of
// shipping a bundle whose lazy path breaks at runtime.
// ---------------------------------------------------------------------------

// Resolve a specifier to a dist-relative path. index.html's `src` is root-
// absolute ("/assets/x.js"); a chunk's specifiers are relative to assets/.
const assetPath = (spec, fromDir = '') => {
  if (spec.startsWith('/')) return spec.slice(1);
  return posix.normalize(posix.join(fromDir, spec));
};

function assertEmbeddable(name, code) {
  // Script element content is raw text until the first "</script" (and "<!--"
  // opens a comment-like state in the tokenizer), so either sequence inside a
  // chunk would truncate or mangle the page. Neither occurs in our output;
  // if one ever does, escaping needs a deliberate design, not a silent pass.
  if (/<\/script/i.test(code) || /<!--/.test(code)) {
    throw new Error(`${name}: contains "</script" or "<!--" and cannot be inlined verbatim`);
  }
}

// Convert an ES import/export binding list ("a as b, c") into object syntax.
const bindingsToObject = (list, importSide) =>
  list.split(',').map(b => b.trim()).filter(Boolean).map(b => {
    const [from, to = from] = b.split(/\s+as\s+/);
    // import{t as e}  → {t:e}   (read exported name t into local e)
    // export{o as t}  → {t:o}   (publish local o under exported name t)
    return importSide ? `${from}:${to}` : `${to}:${from}`;
  }).join(',');

const entryTags = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)];
if (entryTags.length !== 1) {
  throw new Error(`expected exactly one <script src> in dist/index.html, found ${entryTags.length}`);
}
const entryFile = assetPath(entryTags[0][1]);
let entry = readFileSync(join(dist, entryFile), 'utf8');
html = html.replace(entryTags[0][0], '');

const chunkFiles = readdirSync(join(dist, 'assets'))
  .filter(f => f.endsWith('.js') && `assets/${f}` !== entryFile)
  .map(f => `assets/${f}`)
  .sort();

const chunks = [];
let sharedExports = null; // populated when a chunk imports from the entry
for (const file of chunkFiles) {
  let code = readFileSync(join(dist, file), 'utf8');
  // Static imports sit at the very top of a rolldown chunk. Resolve each one.
  for (;;) {
    const m = code.match(/^import\s*(\{[^}]*\}|\*\s*as\s+\w+|\w+)?\s*(?:from\s*)?["'`](\.?\/[^"'`]+)["'`];?/);
    if (!m) break;
    const target = assetPath(m[2], 'assets');
    if (target !== entryFile) {
      throw new Error(`${file}: static import of "${target}" — only the entry can be imported statically; ` +
        'make the chunk self-contained (see vite.config.ts) or teach inline.mjs to order and link chunks');
    }
    if (!m[1] || !m[1].startsWith('{')) {
      throw new Error(`${file}: unsupported import form "${m[0]}" — only named imports from the entry are bridged`);
    }
    if (!sharedExports) {
      const ex = entry.match(/export\s*\{([^}]*)\};?\s*$/);
      if (!ex) throw new Error(`${file} imports from the entry, but the entry has no trailing export list to bridge`);
      sharedExports = bindingsToObject(ex[1], false);
    }
    code = `const{${bindingsToObject(m[1].slice(1, -1), true)}}=globalThis.__TC_SHARED;` + code.slice(m[0].length);
  }
  // Nested dynamic imports inside a chunk go through the same lazy resolver.
  code = code.replace(/import\((["'`])(\.?\/[^"'`]+)\1\)/g, (_, q, spec) => `import(globalThis.__TC_CHUNK(${JSON.stringify(assetPath(spec, 'assets'))}))`);
  assertEmbeddable(file, code);
  chunks.push({ file, code });
}

// The entry: route every dynamic import through the resolver, then bridge the
// helpers a chunk needs. Assert every embedded chunk is actually referenced,
// and that no relative import literal survives — either means rolldown changed
// its output shape and this script needs updating.
const referenced = new Set();
entry = entry.replace(/import\((["'`])(\.?\/[^"'`]+)\1\)/g, (_, q, spec) => {
  const name = assetPath(spec, posix.dirname(entryFile));
  referenced.add(name);
  return `import(globalThis.__TC_CHUNK(${JSON.stringify(name)}))`;
});
for (const { file } of chunks) {
  if (!referenced.has(file)) throw new Error(`${file} is not imported by the entry — unexpected chunk; check vite.config.ts`);
}
if (/import\((["'`])\.?\/[^)]*\)/.test(entry)) throw new Error('entry still contains a relative dynamic import');
if (sharedExports) entry += `\nglobalThis.__TC_SHARED=Object.freeze({${sharedExports}});`;
assertEmbeddable(entryFile, entry);

const chunkBlocks = chunks.map(({ file, code }) =>
  `<script type="text/plain" data-chunk="${file}">${code}</script>`);
// The resolver is a classic script, so it runs while the parser reaches it —
// always before the deferred module script above executes — and the chunk
// blocks it reads precede it in document order.
const resolver = chunks.length ? `<script>
(function(){var urls={};globalThis.__TC_CHUNK=function(name){if(!urls[name]){var el=document.querySelector('script[type="text/plain"][data-chunk="'+name+'"]');if(!el)throw new Error('missing chunk '+name);urls[name]=URL.createObjectURL(new Blob([el.textContent],{type:'text/javascript'}))}return urls[name]}})();
</script>` : '';

// Function form: a string replacement would expand `$'`/`$&` sequences that
// occur naturally in minified JS, splicing copies of the page into itself.
html = html.replace('</body>', () =>
  [`<script type="module">${entry}</script>`, ...chunkBlocks, resolver].filter(Boolean).join('\n') + '\n  </body>');

// Inline all <link rel="stylesheet" href="..."> tags. External sheets (the
// <noscript> Google Fonts fallback in index.html) are left as they are.
html = html.replace(
  /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*\/?>/g,
  (tag, href) => {
    if (/^https?:/.test(href)) return tag;
    const file = href.startsWith('/') ? href.slice(1) : href;
    const content = readFileSync(join(dist, file), 'utf8');
    return `<style>${content}</style>`;
  }
);

// Inline any <link rel="modulepreload" ...> — strip since content is already inlined
html = html.replace(/<link[^>]*rel="modulepreload"[^>]*\/?>/g, '');

// Inline <link rel="icon" href="/favicon.svg"> — load and convert
html = html.replace(
  /<link[^>]*rel="icon"[^>]*href="([^"]+\.svg)"[^>]*\/?>/g,
  (_, href) => {
    try {
      const file = href.startsWith('/') ? href.slice(1) : href;
      const content = readFileSync(join(dist, file), 'utf8');
      const encoded = encodeURIComponent(content).replace(/'/g, '%27').replace(/"/g, '%22');
      return `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encoded}" />`;
    } catch { return ''; }
  }
);

writeFileSync(join(__dirname, 'bundle.html'), LEGAL_BANNER + html);
const stats = readFileSync(join(__dirname, 'bundle.html'));
console.log(`✓ bundle.html: ${(stats.length / 1024).toFixed(1)} KB`);
