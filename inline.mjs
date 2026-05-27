// Inline Vite dist into single self-contained HTML
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, 'dist');

let html = readFileSync(join(dist, 'index.html'), 'utf8');

// Inline all <script src="..."> tags
html = html.replace(
  /<script[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_, src) => {
    const file = src.startsWith('/') ? src.slice(1) : src;
    const content = readFileSync(join(dist, file), 'utf8');
    return `<script type="module">${content}</script>`;
  }
);

// Inline all <link rel="stylesheet" href="..."> tags
html = html.replace(
  /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*\/?>/g,
  (_, href) => {
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

writeFileSync(join(__dirname, 'bundle.html'), html);
const stats = readFileSync(join(__dirname, 'bundle.html'));
console.log(`✓ bundle.html: ${(stats.length / 1024).toFixed(1)} KB`);
