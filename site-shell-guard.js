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
      /* Whole-site Quiet Days: a calm, gentle indication — clearly noticeable, never dark or alarming. */
      html[data-quiet-days="on"] { color-scheme: light; }
      html[data-quiet-days="on"] body { padding-top:92px!important; background:linear-gradient(180deg,#e4d9f2 0%,#ecf0f7 42%,#f4f1ea 100%)!important; }
      #${bannerId} { position:fixed; z-index:2147483000; inset:0 0 auto; min-height:78px; display:flex; align-items:center; justify-content:center; gap:14px; padding:14px 20px; color:#3f305c; background:linear-gradient(100deg,#ede4f7,#e3d7f1 45%,#e9e1f5 100%); border-bottom:3px solid #c7b4df; box-shadow:0 10px 28px rgba(90,70,130,.18); font:700 16px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif; letter-spacing:.04em; text-align:center; }
      #${bannerId} .quiet-days-global-moon { color:#7a5fa3; font-size:30px; filter:drop-shadow(0 2px 6px rgba(122,95,163,.25)); }
      #${bannerId} .quiet-days-global-pill { padding:5px 12px; border:1px solid #7a5fa3; border-radius:999px; color:#fff; background:#7a5fa3; font-size:11px; letter-spacing:.1em; font-weight:800; }
      #${bannerId} .quiet-days-global-detail { color:#4e3f66; font-weight:600; letter-spacing:0; }
      html[data-quiet-days="on"] body .top-bar { top:100px!important; }
      @media(max-width:600px) { html[data-quiet-days="on"] body { padding-top:100px!important; } #${bannerId} { min-height:90px; flex-wrap:wrap; gap:4px 10px; padding:10px 12px; font-size:13px; } #${bannerId} .quiet-days-global-moon { font-size:24px; } #${bannerId} .quiet-days-global-detail { flex-basis:100%; } html[data-quiet-days="on"] body .top-bar { top:110px!important; } }
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
