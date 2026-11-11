# Performance Optimization Tracker

## Phase 1: Service Worker + Request Dedup + Prefetching
**Status: Complete**
**Started: 2026-11-11**
**Completed: 2026-11-11**

### 1.1 Service Worker (sw.js)
- [x] Create service worker with stale-while-revalidate for static assets
- [x] Cache API responses (profile, bathroom, calendar, notes, preferences)
- [x] Offline fallback page
- [x] Register service worker in index.html and all pages (via site-shell-guard.js)

### 1.2 Request Deduplication + In-Memory Cache (request-cache.js)
- [x] Dedupe identical in-flight requests
- [x] Cache responses with TTL (profile: 5min, bathroom: 30s, prefs: 5min)
- [x] Apply to bathroom.js, messages.html, timeline.html, apart.html, avatar.js (loaded via avatar.js on all pages)

### 1.3 Prefetching
- [x] Prefetch on hover for hub cards
- [ ] Prefetch during idle time (requestIdleCallback)
- [ ] Prefetch API data for likely next pages

---

## Phase 2: Bundle & Minify + Preload + Inline Critical CSS
**Status: Complete**
**Started: 2026-11-11**
**Completed: 2026-11-11**

### 2.1 Bundle & Minify CSS/JS
- [x] Combine theme.css + site-polish.css + site-theme.css + motion.css into site-bundle.css
- [x] Add site-bundle.css to index.html (replaces 2 separate CSS files)
- [ ] Bundle page-specific JS (deferred — requires build tooling)
- [ ] Minify all assets (deferred — requires build tooling)

### 2.2 Preload Critical Resources
- [x] Add preload hints to index.html (hero image, critical CSS)
- [x] Add preconnect to external domains (ui-avatars.com)

### 2.3 Inline Critical CSS
- [x] Critical CSS already inline in index.html (hero styles in <style> block)
- [x] Load full CSS asynchronously (site-bundle.css replaces 2 separate files)

---

## Phase 3: Image Optimization + Virtual Scrolling
**Status: Not Started**

### 3.1 Image Optimization
- [ ] Convert holding-hands.jpg to WebP/AVIF
- [ ] Add srcset for responsive images
- [ ] Lazy-load all below-the-fold images

### 3.2 Virtual Scrolling
- [ ] Virtual scroll for bathroom events
- [ ] Virtual scroll for notes list
- [ ] Virtual scroll for timeline moments

---

## Phase 4: Edge Caching + GitHub API Caching
**Status: Not Started**

### 4.1 Cloudflare Edge Caching
- [ ] Add Cache-Control headers to read-only API endpoints
- [ ] Configure stale-while-revalidate at edge

### 4.2 GitHub API Caching in Worker
- [ ] Cache profile photos in Durable Object (5 min TTL)
- [ ] Cache notes/rules in Durable Object (1 min TTL)

---

## Phase 5: DOM Diffing + Web Workers + Polish
**Status: Not Started**

### 5.1 DOM Diffing
- [ ] Replace innerHTML with targeted DOM updates
- [ ] Apply to bathroom.js, messages.html, timeline.html

### 5.2 Web Workers
- [ ] Move sorting/filtering to Web Worker
- [ ] Move bouncy balls physics to Web Worker

### 5.3 Polish
- [ ] Reduce MutationObserver scope
- [ ] Connection pooling
- [ ] Remove console.log statements
- [ ] Prefetch on viewport intersection

---

## Completed Optimizations (pre-Phase 1)
- [x] Profile API parallelization (5 sequential → 1 parallel batch)
- [x] Profile photo caching (5-min TTL) in avatar.js, apart.html, messages.html, timeline.html
- [x] Bathroom optimistic UI + lightweight responses
- [x] Bouncy balls: better physics, collect at bottom, upgrades
- [x] Lazy loading images (apart, messages, timeline, gallery, original-heart, profile, love)
- [x] Preconnect hints (index.html, apart.html, messages.html, timeline.html)
- [x] Request throttling for bouncy balls obstacle refresh
- [x] Game token batching (debounced)
- [x] 5 + 10 token games with multiplayer modes

## Notes
- All changes must keep functionality identical
- Test on both desktop and mobile
- Verify offline behavior after Service Worker implementation
"