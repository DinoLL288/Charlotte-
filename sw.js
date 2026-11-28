// Service Worker for Charlotte & Luke
// Strategy: stale-while-revalidate for static assets, network-first for API.
// Two hard rules: never cache a failed response, and never serve stale API
// data as if it were fresh — an offline API call gets a clear 503, not an
// old answer. Navigation requests with no cached copy fall back to the
// offline page instead of a browser error.

const CACHE_NAME = 'charlotte-v13';
const OFFLINE_URL = '/offline.html';

// Static assets to precache — keep in sync with what pages actually load.
// The four source CSS files are still loaded directly by 16 pages, so they
// stay here alongside site-bundle.css (hub + 6 pages) until those pages
// are switched to the bundle alone.
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/widgets.html',
  '/site.webmanifest',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/assets/css/theme.css',
  '/assets/css/site-polish.css',
  '/assets/css/site-theme.css',
  '/assets/css/motion.css',
  '/assets/css/site-bundle.css',
  '/assets/css/gallery-media.css',
  '/assets/css/surprises.css',
  '/assets/css/playful.css',
  '/assets/js/avatar.js',
  '/assets/js/together.js',
  '/assets/js/dialog.js',
  '/assets/js/site-shell.js',
  '/assets/js/site-shell-guard.js',
  '/assets/js/site-frame.js',
  '/assets/js/site-theme.js',
  '/assets/js/site-reminders.js',
  '/assets/js/presence.js',
  '/assets/js/reactions.js',
  '/assets/js/motion.js',
  '/assets/js/surprises.js',
  '/assets/js/special-dates.js',
  '/assets/js/playful.js',
  '/assets/js/gallery.js',
  '/assets/js/gallery-videos.js',
  '/assets/js/vault.js',
  '/assets/js/stickers-overlay.js',
];

// Install: precache static assets. Each asset is added on its own so one
// missing file can never fail the whole precache.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url => cache.add(url).catch(err => {
          console.warn('Precache failed for', url, err);
        }))
      );
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

function offlineJsonResponse() {
  return new Response(JSON.stringify({ error: 'Offline' }), {
    status: 503,
    headers: { 'content-type': 'application/json' }
  });
}

// Fetch: stale-while-revalidate for static, network-first for API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Cloudflare redirects .html to the extensionless pretty URL. Following that
  // redirect inside a service worker breaks navigation in Chrome (ERR_FAILED),
  // so fetch the extensionless URL directly instead.
  const fetchTarget = url.pathname.endsWith('.html')
    ? new URL(url.pathname.replace(/\.html$/i, '') + url.search + url.hash, url.origin).toString()
    : event.request.url;

  // Skip cross-origin requests (except known CDNs)
  if (url.origin !== location.origin) {
    // Allow ui-avatars.com through (profile pics)
    if (url.hostname === 'ui-avatars.com') {
      event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
          return cache.match(event.request).then(cached => {
            const fetchPromise = fetch(fetchTarget).then(response => {
              if (response.ok) cache.put(event.request, response.clone());
              return response;
            }).catch(() => cached);
            return cached || fetchPromise;
          });
        })
      );
    }
    return;
  }

  // API requests: network-first, never cached. Shared data must never be
  // stale, so an offline API call gets a clear 503 instead of an old answer.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(fetchTarget).then(response => {
        if (!response.ok) return response;
        return response;
      }).catch(() => offlineJsonResponse())
    );
    return;
  }

  // Navigation requests: serve from cache when offline, and fall back to
  // the offline page when there is no cached copy of the page at all.
  const isNavigation = event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');
  if (isNavigation) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cached => {
          const fetchPromise = fetch(fetchTarget).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached || cache.match(OFFLINE_URL));
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Static assets: stale-while-revalidate. Only successful responses are
  // ever written to the cache.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cached => {
        const fetchPromise = fetch(fetchTarget).then(response => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached || new Response('Offline', { status: 503 }));
        return cached || fetchPromise;
      });
    })
  );
});
