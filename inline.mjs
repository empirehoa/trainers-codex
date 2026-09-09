// Inline Vite dist into single self-contained HTML
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
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

// Inline all <script src="..."> tags — and move them to the end of <body>.
//
// Vite emits the module script in <head>. Left there, the ~2 MB of inlined
// JS sits between the stylesheet and the static first-paint markup inside
// #root (index.html), so the browser cannot paint anything until every byte
// of script has arrived. A module script is deferred regardless of position,
// so moving it after the markup changes nothing about when it runs — only
// what the visitor sees while it downloads.
const moduleScripts = [];
html = html.replace(
  /<script[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_, src) => {
    const file = src.startsWith('/') ? src.slice(1) : src;
    const content = readFileSync(join(dist, file), 'utf8');
    moduleScripts.push(`<script type="module">${content}</script>`);
    return '';
  }
);
// Function form: a string replacement would expand `$'`/`$&` sequences that
// occur naturally in minified JS, splicing copies of the page into itself.
html = html.replace('</body>', () => `${moduleScripts.join('\n')}\n  </body>`);

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
