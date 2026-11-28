// Preview-only login bypass — never applies on the live site.
// Cloudflare Pages preview deployments do not get the production login
// secrets (GALLERY_SESSION_SECRET / GALLERY_INTERNAL_SECRET / login
// passwords), so /api/auth/login always answers 503 "Secure login has not
// been configured yet." on preview. On preview hostnames only — any
// *.pages.dev hostname EXCEPT the live charlotte-3ts.pages.dev — sign in
// locally as Luke so the preview hub can be reviewed without a password.
// This only sets the client-side localStorage flag the pages check; it
// does not issue a server session, touch the login API, or change anything
// on main / the live site.
(function () {
  try {
    var host = location.hostname || '';
    var isPreview = host !== 'charlotte-3ts.pages.dev' && host.endsWith('.pages.dev');
    window.__charlottePreviewBypass = isPreview;
    if (isPreview && !localStorage.getItem('charlotte-user')) {
      localStorage.setItem('charlotte-user', 'Luke');
    }
  } catch (error) { /* Keep the site working if storage is unavailable. */ }
})();

(function () {
  const styleId = 'quiet-days-global-style';
  const bannerId = 'quiet-days-global-banner';

  function todayString() {
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function longDate(value) {
    const parts = String(value || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return value || '';
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long'
    });
  }

  function ensureStyles() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Whole-site Quiet Days: calm, gentle, clearly noticeable — never dark or alarming. */
      html[data-quiet-days="on"] {
        color-scheme: light;
        --bg: #e2d8f0;
        --surface: #faf7ff;
        --surface-soft: #f1ebf8;
        --line: #d3c4e6;
        --line-strong: #c0aed8;
        --ink: #1f3448;
        --ink-soft: #556a80;
        --ink-faint: #6f8396;
        --accent: #6b4d9e;
        --accent-ink: #463467;
        --accent-soft: #e5d9f3;
        --gold: #b48a2e;
        --gold-soft: #f1e3bf;
        --gold-ink: #7a6530;
        --danger-soft: #f8ecea;
        --ok-soft: #e9f3ee;
        --navy: #143f5f;
        --ocean: #2a78a8;
        --ice: #f2ecfa;
        --cream: #fdf8ee;
        --couple-page: linear-gradient(180deg,#cdb7e6 0%,#deebf5 38%,#f1ede3 100%);
        --couple-panel: #faf7ff;
        --couple-wash: #f1ebf8;
        --couple-accent: #6b4d9e;
      }
      html[data-quiet-days="on"],
      html[data-quiet-days="on"] body,
      html[data-quiet-days="on"][data-couple-theme],
      html[data-quiet-days="on"][data-couple-theme] body {
        background: linear-gradient(180deg,#cdb7e6 0%,#deebf5 38%,#f1ede3 100%)!important;
        background-color: #e2d8f0!important;
        background-image: radial-gradient(900px 420px at 12% -6%, rgba(255,255,255,.35) 0%, rgba(255,255,255,0) 60%), linear-gradient(180deg,#cdb7e6 0%,#deebf5 38%,#f1ede3 100%)!important;
      }
      html[data-quiet-days="on"] body {
        padding-top:96px!important;
        color: var(--ink)!important;
      }
      /* Theme the items/cards/surfaces across the site. */
      html[data-quiet-days="on"] body :is(
        .panel,.card,.tile,.item,.entry,.row,.group,.group-card,.hub-row,.door,.composer,.prompt,.moment,.plan,.note,
        .toolbar,.gallery-toolbar,.upload-card,.modal,.dialog,.site-dialog,.list,.list-item,.history,.history-item,
        .person,.profile-card,.settings-card,.memory,.status-card,.summary,.stat,.box,.container-card,.section-card,
        .calendar-card,.month-card,.day-card,.event,.rule,.question,.answer,.message,.thread,.folder,.album,
        .menu,.menu-item,.option,.setting,.pill-box,.badge-box,.info,.notice,.callout,.sheet,.drawer,.popover,
        details,[class*="card"],[class*="panel"],[class*="tile"],[class*="item"],[class*="entry"],[class*="box"],[class*="section"]
      ) {
        background-color: var(--surface)!important;
        background-image: none!important;
        border-color: var(--line)!important;
        color: var(--ink);
        box-shadow: 0 8px 22px rgba(90,70,130,.10)!important;
      }
      /* Softer nested/inset items. */
      html[data-quiet-days="on"] body :is(.panel,.card,.section-card,.settings-group,.group-card,.composer) :is(.item,.row,.entry,.note,.meta,.subitem,.list-item,.event,.day,.option,.choice,.tagline,[class*="item"],[class*="row"]) {
        background-color: var(--surface-soft)!important;
        border-color: #d9cde9!important;
        box-shadow: none!important;
      }
      /* Calm headers/heroes without going dark. */
      html[data-quiet-days="on"] body :is(header,.hero,.gallery-hero,.hub-hero,.page-hero,.top-hero,[class*="hero"]) {
        color: #f7f4fb;
        border-color: rgba(255,255,255,.28)!important;
      }
      html[data-quiet-days="on"] body :is(header.hero,.hero,.gallery-hero,.hub-hero,.page-hero,.top-hero) {
        background: linear-gradient(145deg,#5f7fa3,#7295ae 55%,#89afbe)!important;
        background-image: radial-gradient(700px 260px at 50% -10%, rgba(236,215,160,.22) 0%, rgba(236,215,160,0) 70%), linear-gradient(145deg,#5f7fa3,#7295ae 55%,#89afbe)!important;
      }
      html[data-quiet-days="on"] body :is(header.hero,.hero,.gallery-hero,.hub-hero,.page-hero,.top-hero) :is(h1,h2,h3,p,.eyebrow,.subtitle,.hero-sub,.hub-hero-sub) {
        color: #f8f5fc!important;
        text-shadow: 0 2px 14px rgba(20,40,60,.18);
      }
      html[data-quiet-days="on"] body :is(header.hero,.hero,.gallery-hero,.hub-hero,.page-hero,.top-hero) .eyebrow { color: #f3e6c3!important; }
      /* Inputs and controls. */
      html[data-quiet-days="on"] body :is(input,textarea,select,.input) {
        color: var(--ink)!important;
        background-color: #fff!important;
        background-image: none!important;
        border-color: #c9badf!important;
      }
      html[data-quiet-days="on"] body :is(input,textarea,select)::placeholder { color: #7a8a98!important; }
      html[data-quiet-days="on"] body :is(input,textarea,select):focus {
        outline: 3px solid rgba(107,77,158,.22)!important;
        border-color: #957bbe!important;
      }
      html[data-quiet-days="on"] body :is(button,.button,.small,.mini,.tab,.chip,.pill,.tag,.badge,.filter-btn,[role="button"]) {
        border-color: #c9badf;
      }
      html[data-quiet-days="on"] body :is(button.button,.button.primary,.primary,button[type="submit"],.tab[aria-selected="true"],.filter-btn[aria-pressed="true"],.chip.active,.pill.active) {
        color: #fff!important;
        background: #6b4d9e!important;
        background-image: none!important;
        border-color: #6b4d9e!important;
      }
      html[data-quiet-days="on"] body :is(.button.secondary,.button.ghost,.small,.mini,.top-bar .button):not(.primary):not([aria-selected="true"]) {
        color: #463467!important;
        background: #f3ecfb!important;
      }
      html[data-quiet-days="on"] body a { color: var(--accent-ink); }
      html[data-quiet-days="on"] body hr, html[data-quiet-days="on"] body :is(.divider,.separator) { border-color: var(--line)!important; }
      /* Fixed quiet-days banner. */
      #${bannerId} { position:fixed; z-index:2147483000; inset:0 0 auto; min-height:84px; display:flex; align-items:center; justify-content:center; gap:14px; padding:16px 22px; color:#2f2247; background:linear-gradient(100deg,#e6d8f4,#d8c6ea 45%,#e0d2f0 100%); border-bottom:4px solid #ad90cc; box-shadow:0 14px 34px rgba(90,70,130,.24); font:700 16px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif; letter-spacing:.05em; text-align:center; }
      #${bannerId} .quiet-days-global-moon { color:#6b4d9e; font-size:32px; filter:drop-shadow(0 2px 8px rgba(107,77,158,.28)); }
      #${bannerId} .quiet-days-global-pill { padding:6px 14px; border:1px solid #6b4d9e; border-radius:999px; color:#fff; background:#6b4d9e; font-size:11px; letter-spacing:.12em; font-weight:800; box-shadow:0 2px 8px rgba(107,77,158,.25); }
      #${bannerId} .quiet-days-global-detail { color:#46365f; font-weight:600; letter-spacing:0; }
      html[data-quiet-days="on"] body .top-bar { top:106px!important; }
      @media(max-width:600px) { html[data-quiet-days="on"] body { padding-top:106px!important; } #${bannerId} { min-height:94px; flex-wrap:wrap; gap:4px 10px; padding:10px 12px; font-size:13px; } #${bannerId} .quiet-days-global-moon { font-size:26px; } #${bannerId} .quiet-days-global-detail { flex-basis:100%; } html[data-quiet-days="on"] body .top-bar { top:116px!important; } }
      @media(prefers-reduced-motion:reduce) { #${bannerId} { scroll-behavior:auto; } }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setQuietDays(activeEntry) {
    const active = Boolean(activeEntry);
    if (!document.documentElement) return;
    document.documentElement.dataset.quietDays = active ? 'on' : 'off';
    const oldBanner = document.getElementById(bannerId);
    if (!active) {
      oldBanner?.remove();
      return;
    }
    ensureStyles();
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => setQuietDays(activeEntry), { once: true });
      return;
    }
    let banner = document.getElementById(bannerId);
    if (!banner) {
      banner = document.createElement('aside');
      banner.id = bannerId;
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      banner.innerHTML = '<span class="quiet-days-global-moon" aria-hidden="true">☾</span><span>QUIET DAYS MODE</span><span class="quiet-days-global-pill">ON</span><span class="quiet-days-global-detail"></span>';
      document.body.appendChild(banner);
    }
    const detail = banner.querySelector('.quiet-days-global-detail');
    if (detail) detail.textContent = `A little breathing room until ${longDate(activeEntry.until)}.`;
  }

  async function refreshQuietDays() {
    try {
      const response = await fetch('/api/apart', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const today = todayString();
      const active = Array.isArray(data.entries)
        ? data.entries.filter(entry => entry && entry.from <= today && today <= entry.until)
            .sort((a, b) => String(a.until).localeCompare(String(b.until)))[0]
        : null;
      setQuietDays(active || null);
    } catch (error) {
      // Preserve the current look if status cannot be checked right now.
    }
  }

  refreshQuietDays();
  window.setInterval(refreshQuietDays, 60 * 1000);
})();

(function () {
  if (!document.querySelector('link[rel~="icon"]')) {
    const fav = document.createElement('link');
    fav.rel = 'icon';
    fav.href = '/assets/images/favicon.svg';
    fav.type = 'image/svg+xml';
    document.head.appendChild(fav);
  }
  if (window.top !== window.self) return;
  const rawName = location.pathname.split('/').filter(Boolean).pop() || 'index';
  const name = rawName.replace(/\.html$/i, '') || 'index';
  if (name === 'app-shell' || name === 'login') return;
  const page = `${name}${location.search}${location.hash}`;
  location.replace(`app-shell.html?page=${encodeURIComponent(page)}`);
})();

// Register service worker for caching and offline support
if ('serviceWorker' in navigator && window.top === window.self) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=19').catch(() => {});
  });
}
