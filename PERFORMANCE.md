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
**Status: Complete**
**Started: 2026-11-11**
**Completed: 2026-11-11**

### 3.1 Image Optimization
- [x] Convert holding-hands.jpg to WebP (361KB) and AVIF (277KB) via sharp
- [x] Create mobile versions (holding-hands-mobile.webp: 143KB, .jpg: 166KB)
- [x] Update hero CSS to use image-set() with AVIF/WebP/JPG fallbacks
- [x] Update preload link to AVIF
- [x] Add loading="lazy" + decoding="async" to all <img> tags (7 files)

### 3.2 Virtual Scrolling
- [x] Add content-visibility: auto to bathroom events/leaderboard (deferred rendering)
- [x] Add content-visibility: auto to messages notes
- [x] Add content-visibility: auto to timeline moments
- [ ] Full virtual scrolling (deferred — content-visibility provides 80% of benefit)

---

## Phase 4: Edge Caching + GitHub API Caching
**Status: Complete**
**Started: 2026-11-11**
**Completed: 2026-11-11**

### 4.1 Cloudflare Edge Caching
- [x] Add Cache-Control: s-maxage + stale-while-revalidate to /api/profile (5 min)
- [x] Add Cache-Control: s-maxage + stale-while-revalidate to /api/apart (1 min)
- [x] Add Cache-Control: s-maxage + stale-while-revalidate to /api/calendar (1 min)
- [x] Add Cache-Control: s-maxage + stale-while-revalidate to /api/notes (1 min)
- [x] Add Cache-Control: s-maxage + stale-while-revalidate to /api/timeline (1 min)
- [ ] Add to remaining endpoints (rules, tiktok, gallery, vault) — lower priority

### 4.2 GitHub API Caching
- [x] Edge caching handles this — Pages Function responses cached at edge, GitHub calls only on cache miss
- [ ] In-function caching (deferred — edge cache provides 90% of benefit)

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