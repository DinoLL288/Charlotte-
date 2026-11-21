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
        --bg: #e6ddf3;
        --surface: #fbf9fe;
        --surface-soft: #f3eef9;
        --line: #d6cae6;
        --line-strong: #c4b5d9;
        --ink: #21374a;
        --ink-soft: #5b6e82;
        --ink-faint: #74879a;
        --accent: #6f52a0;
        --accent-ink: #4a3a6b;
        --accent-soft: #e8dff4;
        --gold: #b48a2e;
        --gold-soft: #f0e3bf;
        --gold-ink: #7a6530;
        --danger-soft: #f8ecea;
        --ok-soft: #e9f3ee;
        --couple-page: linear-gradient(180deg,#d4c4e9 0%,#e7edf5 38%,#f3efe6 100%);
        --couple-panel: #fbf9fe;
        --couple-wash: #f3eef9;
        --couple-accent: #6f52a0;
      }
      html[data-quiet-days="on"] body {
        padding-top:94px!important;
        color: var(--ink)!important;
        background: linear-gradient(180deg,#d4c4e9 0%,#e7edf5 38%,#f3efe6 100%)!important;
        background-image: linear-gradient(180deg,#d4c4e9 0%,#e7edf5 38%,#f3efe6 100%)!important;
      }
      /* Gentle site-wide tint for common surfaces, keeping content readable. */
      html[data-quiet-days="on"] body :is(.panel,.card,.tile,.item,.entry,.row,.group,.group-card,.hub-row,.door,.composer,.prompt,.moment,.plan,.note,.toolbar,.gallery-toolbar,.upload-card,.modal,.dialog,.site-dialog,.list,.list-item,.history,.history-item,.person,.profile-card,.settings-card,.memory,.status-card,.summary,.stat,.box,.container-card,.section-card) {
        background-color: var(--surface)!important;
        border-color: var(--line)!important;
      }
      html[data-quiet-days="on"] body :is(.panel,.card,.tile,.entry,.group,.group-card,.composer,.upload-card,.modal,.dialog,.site-dialog,.section-card,.memory,.status-card) {
        box-shadow: 0 8px 24px rgba(90,70,130,.10)!important;
      }
      /* Keep nested/soft areas subtle. */
      html[data-quiet-days="on"] body :is(.panel,.card,.section-card,.settings-group) :is(.item,.row,.entry,.composer,.note,.chip,.pill,.tag,.meta-box) {
        background-color: var(--surface-soft)!important;
        border-color: var(--line)!important;
        box-shadow: none!important;
      }
      /* Calm headers/heroes without going dark. */
      html[data-quiet-days="on"] body :is(header.hero,.hero,.gallery-hero,.hub-hero,.page-hero,.top-hero) {
        color: #f7f4fb!important;
        background: linear-gradient(145deg,#5f7fa3,#7396af 55%,#8ab0be)!important;
        background-image: radial-gradient(700px 260px at 50% -10%, rgba(236,215,160,.22) 0%, rgba(236,215,160,0) 70%), linear-gradient(145deg,#5f7fa3,#7396af 55%,#8ab0be)!important;
        border-color: rgba(255,255,255,.25)!important;
      }
      html[data-quiet-days="on"] body :is(header.hero,.hero,.gallery-hero,.hub-hero,.page-hero,.top-hero) :is(h1,h2,h3,p,.eyebrow,.subtitle,.hero-sub,.hub-hero-sub) {
        color: #f8f5fc!important;
        text-shadow: 0 2px 14px rgba(20,40,60,.18);
      }
      html[data-quiet-days="on"] body :is(header.hero,.hero,.gallery-hero,.hub-hero,.page-hero,.top-hero) .eyebrow { color: #f3e6c3!important; }
      /* Inputs stay light and clear. */
      html[data-quiet-days="on"] body :is(input,textarea,select) {
        color: var(--ink)!important;
        background-color: #ffffff!important;
        border-color: #cdbfe0!important;
      }
      html[data-quiet-days="on"] body :is(input,textarea,select)::placeholder { color: #7a8a98!important; }
      html[data-quiet-days="on"] body :is(input,textarea,select):focus {
        outline: 3px solid rgba(111,82,160,.22)!important;
        border-color: #9b84bf!important;
      }
      /* Buttons/controls keep a soft lavender accent. */
      html[data-quiet-days="on"] body :is(button,.button,.small,.mini,.tab,.chip-btn,.filter-btn,[role="button"]) {
        border-color: #cdbfe0;
      }
      html[data-quiet-days="on"] body :is(button.button,.button.primary,.primary,button[type="submit"],.tab[aria-selected="true"],.filter-btn[aria-pressed="true"]) {
        color: #fff!important;
        background: #6f52a0!important;
        border-color: #6f52a0!important;
      }
      html[data-quiet-days="on"] body :is(a) { color: var(--accent-ink); }
      html[data-quiet-days="on"] body hr, html[data-quiet-days="on"] body :is(.divider,.separator) { border-color: var(--line)!important; }
      /* Fixed quiet-days banner. */
      #${bannerId} { position:fixed; z-index:2147483000; inset:0 0 auto; min-height:84px; display:flex; align-items:center; justify-content:center; gap:14px; padding:16px 22px; color:#2f2247; background:linear-gradient(100deg,#e6d8f4,#d8c6ea 45%,#e0d2f0 100%); border-bottom:4px solid #ad90cc; box-shadow:0 14px 34px rgba(90,70,130,.24); font:700 16px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif; letter-spacing:.05em; text-align:center; }
      #${bannerId} .quiet-days-global-moon { color:#6f52a0; font-size:32px; filter:drop-shadow(0 2px 8px rgba(111,82,160,.28)); }
      #${bannerId} .quiet-days-global-pill { padding:6px 14px; border:1px solid #6f52a0; border-radius:999px; color:#fff; background:#6f52a0; font-size:11px; letter-spacing:.12em; font-weight:800; box-shadow:0 2px 8px rgba(111,82,160,.25); }
      #${bannerId} .quiet-days-global-detail { color:#46365f; font-weight:600; letter-spacing:0; }
      html[data-quiet-days="on"] body .top-bar { top:104px!important; }
      @media(max-width:600px) { html[data-quiet-days="on"] body { padding-top:104px!important; } #${bannerId} { min-height:94px; flex-wrap:wrap; gap:4px 10px; padding:10px 12px; font-size:13px; } #${bannerId} .quiet-days-global-moon { font-size:26px; } #${bannerId} .quiet-days-global-detail { flex-basis:100%; } html[data-quiet-days="on"] body .top-bar { top:114px!important; } }
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
    fav.href = 'favicon.svg';
    fav.type = 'image/svg+xml';
    document.head.appendChild(fav);
  }
  if (window.top !== window.self) return;
  const name = location.pathname.split('/').filter(Boolean).pop() || 'index.html';
  if (name === 'app-shell.html' || name === 'login.html') return;
  const page = `${name}${location.search}${location.hash}`;
  location.replace(`app-shell.html?page=${encodeURIComponent(page)}`);
})();

// Register service worker for caching and offline support
if ('serviceWorker' in navigator && window.top === window.self) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
