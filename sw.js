// Service Worker for Charlotte & Luke
// Strategy: stale-while-revalidate for static assets, network-first for API

const CACHE_NAME = 'charlotte-v9';
const OFFLINE_URL = '/offline.html';

// Static assets to precache — keep in sync with what pages actually load.
// The four source CSS files are still loaded directly by 16 pages, so they
// stay here alongside site-bundle.css (hub + 6 pages) until those pages
// are switched to the bundle alone.
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
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

// Install: precache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('Precache failed for some assets:', err);
      });
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

// Fetch: stale-while-revalidate for static, network-first for API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests (except known CDNs)
  if (url.origin !== location.origin) {
    // Allow ui-avatars.com through (profile pics)
    if (url.hostname === 'ui-avatars.com') {
      event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
          return cache.match(event.request).then(cached => {
            const fetchPromise = fetch(event.request).then(response => {
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

  // API requests: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const cache = caches.open(CACHE_NAME);
          cache.then(c => c.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'content-type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached || new Response('Offline', { status: 503 }));
        return cached || fetchPromise;
      });
    })
  );
});

// Background sync for pending saves
self.addEventListener('sync', event => {
  if (event.tag === 'sync-bathroom') {
    event.waitUntil(syncBathroom());
  }
});

async function syncBathroom() {
  // Placeholder for background sync of bathroom check-ins
  // Will be implemented when needed
}
