// Trainer's Codex service worker.
//
// The whole app is one self-contained HTML with every script, style, and the
// Pokémon dataset inlined — so caching the navigation document is the entire
// offline story. There is no separate JS/CSS bundle to precache.
//
// Strategy:
//   • navigations  → network-first, fall back to the cached shell when offline
//   • same-origin static (icons, manifest) → cache-first
//   • cross-origin (sprite mirror, fonts, TCG, Supabase, Stripe, the API Worker)
//     → not intercepted at all. Auth tokens, checkout sessions, and license
//       calls must always hit the live network and must never be cached.
//
// Bump CACHE_VERSION on any shipped change to the shell so clients refresh.

const CACHE_VERSION = 'tc-v9';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

// The shell + install-metadata. '/' is the inlined app; the rest let the
// install/launch experience render without a network round-trip.
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll is atomic; a single 404 would reject it and abort the install,
      // so add resiliently — a missing optional asset shouldn't break offline.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Leave everything cross-origin to the network untouched (sprites, fonts,
  // TCG art, Supabase, Stripe, the API Worker). Never cache those.
  if (url.origin !== self.location.origin) return;

  // App navigations: serve fresh when online, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/').then((c) => c || caches.match('/index.html'))),
    );
    return;
  }

  // Same-origin static assets: cache-first, populate on first miss.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      });
    }),
  );
});
