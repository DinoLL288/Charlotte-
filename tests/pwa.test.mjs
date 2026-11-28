import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import '../assets/js/install-prompt.js';

const { installPromptState } = globalThis.__charlottePwa;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- Manifest ----------

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'site.webmanifest'), 'utf8'));

test('manifest has the fields an installable app needs', () => {
  assert.equal(manifest.name, 'Charlotte & Luke');
  assert.equal(manifest.short_name, 'Charlotte');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#0d2c44');
  assert.equal(manifest.background_color, '#0d2c44');
});

test('manifest icons exist on disk at the sizes they claim', () => {
  assert.ok(manifest.icons.length >= 3);
  for (const icon of manifest.icons) {
    const file = path.join(root, icon.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), `missing icon ${icon.src}`);
    const [w, h] = icon.sizes.split('x').map(Number);
    const size = pngSize(file);
    assert.equal(size.width, w, `${icon.src} width`);
    assert.equal(size.height, h, `${icon.src} height`);
  }
});

test('manifest has a maskable icon so Android can crop it safely', () => {
  const maskable = manifest.icons.filter(i => i.purpose === 'maskable');
  assert.equal(maskable.length, 1);
  assert.equal(maskable[0].sizes, '512x512');
});

test('the shell and every page link the manifest', () => {
  const skip = new Set(['googledb8f094e7c8fd3fa.html', 'more-games.html', 'videos.html']);
  for (const f of fs.readdirSync(root).filter(x => x.endsWith('.html'))) {
    if (skip.has(f)) continue;
    const html = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(html.includes('rel="manifest"'), `${f} has no manifest link`);
    assert.ok(html.includes('theme-color'), `${f} has no theme-color`);
  }
});

test('the shell registers the service worker', () => {
  const shell = fs.readFileSync(path.join(root, 'app-shell.html'), 'utf8');
  assert.ok(shell.includes("navigator.serviceWorker.register('/sw.js')"));
  assert.ok(shell.includes('install-prompt.js'));
});

// ---------- Install prompt decisions ----------

const baseEnv = {
  now: Date.now(),
  dismissedAt: null,
  standalone: false,
  matchMediaStandalone: false,
  hasBeforeInstallPrompt: false,
  userAgent: 'Mozilla/5.0 (Linux; Android 13; moto g04)',
  platform: 'Linux armv8l',
  maxTouchPoints: 5
};

test('install prompt shows when the browser offers it', () => {
  assert.equal(installPromptState({ ...baseEnv, hasBeforeInstallPrompt: true }), 'install');
});

test('install prompt never shows inside the native apps', () => {
  assert.equal(installPromptState({ ...baseEnv, hasBeforeInstallPrompt: true, nativeApp: true }), 'none');
});

test('install prompt never shows when already installed', () => {
  assert.equal(installPromptState({ ...baseEnv, hasBeforeInstallPrompt: true, standalone: true }), 'none');
  assert.equal(installPromptState({ ...baseEnv, hasBeforeInstallPrompt: true, matchMediaStandalone: true }), 'none');
});

test('a recent dismissal hides the banner', () => {
  const dismissedAt = String(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
  assert.equal(installPromptState({ ...baseEnv, hasBeforeInstallPrompt: true, dismissedAt }), 'none');
});

test('a dismissal older than 30 days lets the banner show again', () => {
  const dismissedAt = String(Date.now() - 31 * 24 * 60 * 60 * 1000);
  assert.equal(installPromptState({ ...baseEnv, hasBeforeInstallPrompt: true, dismissedAt }), 'install');
});

test('iOS without a prompt event gets the Share-sheet hint', () => {
  assert.equal(installPromptState({
    ...baseEnv,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    platform: 'iPhone',
    maxTouchPoints: 5
  }), 'ios-hint');
});

test('a desktop browser with no prompt event gets nothing', () => {
  assert.equal(installPromptState({
    ...baseEnv,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel',
    maxTouchPoints: 0
  }), 'none');
});

// ---------- Service worker behaviour (run in a vm sandbox) ----------

class FakeResponse {
  constructor(body = '', opts = {}) {
    this.body = body;
    this.status = opts.status || 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = { get: () => '' };
  }
  clone() { return new FakeResponse(this.body, { status: this.status }); }
}

function makeRequest(url, { mode = 'no-cors', accept = '' } = {}) {
  return {
    url,
    method: 'GET',
    mode,
    headers: { get: name => (name.toLowerCase() === 'accept' ? accept : '') }
  };
}

function loadServiceWorker(fetchImpl) {
  const listeners = {};
  const cachesByName = new Map();
  const puts = [];
  function openCache(name) {
    if (!cachesByName.has(name)) {
      const store = new Map();
      cachesByName.set(name, {
        store,
        match: req => Promise.resolve(store.get(typeof req === 'string' ? req : req.url)),
        put: (req, res) => { puts.push(typeof req === 'string' ? req : req.url); store.set(typeof req === 'string' ? req : req.url, res); return Promise.resolve(); },
        add: url => fetchImpl(url).then(res => { if (!res.ok) throw new Error('add failed: ' + url); store.set(url, res); }),
        addAll: urls => Promise.all(urls.map(u => cachesByName.get(name).add(u)))
      });
    }
    return Promise.resolve(cachesByName.get(name));
  }
  const sandbox = {
    console,
    URL,
    location: { origin: 'https://charlotte-3ts.pages.dev' },
    Response: FakeResponse,
    fetch: fetchImpl,
    caches: {
      open: openCache,
      keys: () => Promise.resolve([...cachesByName.keys()]),
      delete: name => { cachesByName.delete(name); return Promise.resolve(true); },
      match: req => {
        for (const c of cachesByName.values()) {
          const hit = c.store.get(typeof req === 'string' ? req : req.url);
          if (hit) return Promise.resolve(hit);
        }
        return Promise.resolve(undefined);
      }
    },
    self: {
      addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
      skipWaiting: () => {},
      clients: { claim: () => {} }
    }
  };
  sandbox.self = sandbox.self;
  const code = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { listeners, cachesByName, puts, sandbox };
}

async function dispatchFetch(harness, request) {
  let responsePromise = null;
  const event = { request, respondWith: p => { responsePromise = p; } };
  for (const fn of harness.listeners.fetch || []) fn(event);
  assert.ok(responsePromise, 'fetch handler did not call respondWith');
  return responsePromise;
}

test('service worker cache name is versioned', () => {
  const src = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const m = src.match(/CACHE_NAME = '(charlotte-v\d+)'/);
  assert.ok(m, 'CACHE_NAME not found');
});

test('navigation offline with no cached copy falls back to the offline page', async () => {
  const h = loadServiceWorker(() => Promise.reject(new Error('offline')));
  // Pre-seed the offline page in the cache.
  const cache = await h.sandbox.caches.open('charlotte-v14');
  const offline = new FakeResponse('<h1>offline</h1>');
  await cache.put('/offline.html', offline);
  const res = await dispatchFetch(h, makeRequest('https://charlotte-3ts.pages.dev/calendar', { mode: 'navigate', accept: 'text/html' }));
  assert.equal(res.body, '<h1>offline</h1>');
});

test('navigation offline with a cached copy serves the cached page', async () => {
  const h = loadServiceWorker(() => Promise.reject(new Error('offline')));
  const cache = await h.sandbox.caches.open('charlotte-v14');
  await cache.put('https://charlotte-3ts.pages.dev/calendar', new FakeResponse('<h1>cached calendar</h1>'));
  const res = await dispatchFetch(h, makeRequest('https://charlotte-3ts.pages.dev/calendar', { mode: 'navigate', accept: 'text/html' }));
  assert.equal(res.body, '<h1>cached calendar</h1>');
});

test('API offline returns a clear 503 and never serves a cached answer', async () => {
  const h = loadServiceWorker(() => Promise.reject(new Error('offline')));
  const cache = await h.sandbox.caches.open('charlotte-v14');
  // Even if an old API answer is somehow in the cache, it must not be served.
  await cache.put('https://charlotte-3ts.pages.dev/api/calendar', new FakeResponse('{"stale":true}'));
  const res = await dispatchFetch(h, makeRequest('https://charlotte-3ts.pages.dev/api/calendar'));
  assert.equal(res.status, 503);
  assert.equal(JSON.parse(res.body).error, 'Offline');
});

test('API success is returned and never written to the cache', async () => {
  const fresh = new FakeResponse('{"ok":true}');
  const h = loadServiceWorker(() => Promise.resolve(fresh));
  const res = await dispatchFetch(h, makeRequest('https://charlotte-3ts.pages.dev/api/calendar'));
  assert.equal(res.body, '{"ok":true}');
  assert.ok(!h.puts.some(u => u.includes('/api/')), 'API response was cached');
});

test('a failed static response is never cached', async () => {
  const h = loadServiceWorker(() => Promise.resolve(new FakeResponse('nope', { status: 404 })));
  const res = await dispatchFetch(h, makeRequest('https://charlotte-3ts.pages.dev/assets/css/missing.css'));
  assert.equal(res.status, 404);
  assert.ok(!h.puts.includes('https://charlotte-3ts.pages.dev/assets/css/missing.css'), '404 was cached');
});

test('a successful static fetch is cached for next time', async () => {
  const h = loadServiceWorker(() => Promise.resolve(new FakeResponse('css here')));
  const res = await dispatchFetch(h, makeRequest('https://charlotte-3ts.pages.dev/assets/css/theme.css'));
  assert.equal(res.body, 'css here');
  assert.ok(h.puts.includes('https://charlotte-3ts.pages.dev/assets/css/theme.css'));
});

test('install precaches the app shell assets without one failure killing it', async () => {
  const attempted = [];
  const h = loadServiceWorker(url => {
    attempted.push(url);
    // Simulate one asset missing from the deploy.
    if (String(url).includes('gallery-videos.js')) return Promise.resolve(new FakeResponse('', { status: 404 }));
    return Promise.resolve(new FakeResponse('ok'));
  });
  let waitPromise = null;
  const event = { waitUntil: p => { waitPromise = p; } };
  for (const fn of h.listeners.install || []) fn(event);
  await waitPromise;
  const cache = await h.sandbox.caches.open('charlotte-v14');
  assert.ok(cache.store.has('/index.html'), 'index was not precached');
  assert.ok(cache.store.has('/offline.html'), 'offline page was not precached');
  assert.ok(!cache.store.has('/assets/js/gallery-videos.js'), 'failed asset was cached');
});
