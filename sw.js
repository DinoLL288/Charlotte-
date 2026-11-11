// Service Worker for Charlotte & Luke
// Strategy: stale-while-revalidate for static assets, network-first for API

const CACHE_NAME = 'charlotte-v1';
const OFFLINE_URL = '/offline.html';

// Static assets to precache
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/theme.css',
  '/site-polish.css',
  '/site-theme.css',
  '/motion.css',
  '/avatar.js',
  '/together.js',
  '/dialog.js',
  '/site-shell.js',
  '/site-shell-guard.js',
  '/site-frame.js',
  '/site-theme.js',
  '/site-reminders.js',
  '/presence.js',
  '/reactions.js',
  '/motion.js',
  '/surprises.js',
  '/special-dates.js',
  '/playful.js',
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
