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
      html[data-quiet-days="on"] { color-scheme: dark; --ink:#e8edf5; --ink-soft:#c0ccda; --ink-faint:#a5b2c2; --surface:#1b273a; --surface-soft:#253247; --line:#3a4659; --line-strong:#536176; --accent-soft:#34445a; --accent-ink:#d5e5f4; --gold-ink:#ead39a; --bg:#101a2b; }
      html[data-quiet-days="on"] body { color:#e8edf5!important; background:#101a2b!important; background-image:radial-gradient(ellipse at 50% 0%,#26334a 0%,#101a2b 62%)!important; }
      html[data-quiet-days="on"] body :is(h1,h2,h3,h4,h5,h6,strong,b,legend,.title,.range,.section-title,.section-heading,.group-title,.row-title,.calm-title) { color:#f1f3f7!important; }
      html[data-quiet-days="on"] body :is(p,small,label,li,dt,dd,.subtitle,.intro,.hint,.form-hint,.meta,.status,.description,.row-sub,.calm-sub,.section-label) { color:#c0ccda!important; }
      html[data-quiet-days="on"] body a:not(.button):not(.small):not(.mini):not(.primary) { color:#d5e5f4!important; }
      html[data-quiet-days="on"] body :is(.panel,.card,.composer,.entry,.item,.person,.tool-card,.moment,.plan,.upload-card,.gallery-toolbar,.album-card,.modal-card,.td-current,.td-custom,.td-history,.td-rules,.prompt-card,.settings-group,.shared-account,.calendar-card,.month-card,.group-card,.door,.group,.section,.site-dialog,.calm-row,.hub-row,.event,.day,.empty,details.fold) { color:#e8edf5!important; background-color:#1b273a!important; background-image:none!important; border-color:#3a4659!important; box-shadow:0 12px 32px #050a1433!important; }
      html[data-quiet-days="on"] body :is(.hub-row,.calm-row,.door-links a,.group-card a) { color:#e8edf5!important; }
      html[data-quiet-days="on"] body :is(input,textarea,select,.site-dialog-input) { color:#eef2f7!important; background-color:#111c2c!important; border-color:#536176!important; }
      html[data-quiet-days="on"] body :is(input,textarea,select)::placeholder { color:#a5b2c2!important; }
      html[data-quiet-days="on"] body :is(button,.button,.small,.mini,.primary,.tab,.album-filter,.site-dialog-button,.door-links a) { color:#f4f6fa!important; background-color:#34445a!important; border-color:#617087!important; }
      html[data-quiet-days="on"] body :is(.top-bar .button,.button.secondary,.button.ghost,.small, .mini) { color:#e5eaf1!important; background-color:#253247!important; }
      html[data-quiet-days="on"] body :is(.chip,.badge,.event-badge,.today-tag) { color:#f1e2b9!important; background-color:#574b32!important; border-color:#756343!important; }
      html[data-quiet-days="on"] body img,html[data-quiet-days="on"] body video,html[data-quiet-days="on"] body canvas { filter:brightness(.82) saturate(.82); }
      #${bannerId} { position:fixed; z-index:2147483000; inset:0 0 auto; min-height:50px; display:flex; align-items:center; justify-content:center; gap:10px; padding:8px 16px; color:#f8f3e7; background:linear-gradient(100deg,#172238,#27344b 55%,#172238); border-bottom:1px solid #c4ab70; box-shadow:0 5px 22px #050a1466; font:700 14px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif; text-align:center; }
      #${bannerId} .quiet-days-global-moon { color:#f1d89d; font-size:19px; }
      #${bannerId} .quiet-days-global-detail { color:#d2d9e3; font-weight:500; }
      html[data-quiet-days="on"] body { padding-top:58px!important; }
      html[data-quiet-days="on"] body .top-bar { top:66px!important; }
      @media(max-width:520px) { #${bannerId} { min-height:54px; flex-wrap:wrap; gap:2px 8px; padding:7px 10px; font-size:12px; } html[data-quiet-days="on"] body { padding-top:62px!important; } html[data-quiet-days="on"] body .top-bar { top:70px!important; } }
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
      banner.innerHTML = '<span class="quiet-days-global-moon" aria-hidden="true">☾</span><span>QUIET DAYS ARE ON</span><span class="quiet-days-global-detail"></span>';
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
      // Keep the current visual state if the status service is briefly unavailable.
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
