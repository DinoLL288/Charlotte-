// Request cache & deduplication module
// Usage: import or include this script, then use window.requestCache.fetch(url, options)

(function() {
  'use strict';

  const cache = new Map();       // url -> { data, timestamp, ttl }
  const inflight = new Map();     // url -> Promise

  const TTL = {
    profile: 5 * 60 * 1000,     // 5 minutes
    bathroom: 30 * 1000,         // 30 seconds
    preferences: 5 * 60 * 1000, // 5 minutes
    calendar: 2 * 60 * 1000,     // 2 minutes
    notes: 1 * 60 * 1000,        // 1 minute
    default: 30 * 1000           // 30 seconds default
  };

  function getTTL(url) {
    if (url.includes('/api/profile')) return TTL.profile;
    if (url.includes('/api/question-room?view=bathroom')) return TTL.bathroom;
    if (url.includes('/api/question-room?view=preferences')) return TTL.preferences;
    if (url.includes('/api/calendar')) return TTL.calendar;
    if (url.includes('/api/notes')) return TTL.notes;
    return TTL.default;
  }

  function isCacheable(url, method) {
    if (method !== 'GET') return false;
    if (url.includes('/api/auth/')) return false;
    if (url.includes('/api/vault')) return false;
    return url.includes('/api/');
  }

  async function cachedFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const cacheKey = url + (options.body ? ':' + options.body : '');

    // Check cache first
    if (isCacheable(url, method)) {
      const entry = cache.get(cacheKey);
      if (entry && (Date.now() - entry.timestamp < entry.ttl)) {
        return entry.data.clone();
      }
    }

    // Dedupe in-flight requests
    if (inflight.has(cacheKey)) {
      return inflight.get(cacheKey).then(r => r.clone());
    }

    // Make the request
    const promise = fetch(url, options).then(response => {
      if (response.ok && isCacheable(url, method)) {
        response.clone().json().then(data => {
          cache.set(cacheKey, {
            data: new Response(JSON.stringify(data), {
              status: response.status,
              headers: response.headers
            }),
            timestamp: Date.now(),
            ttl: getTTL(url)
          });
        }).catch(() => {});
      }
      return response;
    }).finally(() => {
      inflight.delete(cacheKey);
    });

    inflight.set(cacheKey, promise);
    return promise.then(r => r.clone());
  }

  // Invalidate cache entries matching a pattern
  function invalidate(pattern) {
    for (const key of cache.keys()) {
      if (key.includes(pattern)) cache.delete(key);
    }
  }

  // Clear all cache
  function clear() {
    cache.clear();
  }

  window.requestCache = { fetch: cachedFetch, invalidate, clear };
})();
