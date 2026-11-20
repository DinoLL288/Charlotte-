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
      /* Whole-site Quiet Days: a calm, gentle indication — never dark or alarming. */
      html[data-quiet-days="on"] { color-scheme: light; }
      html[data-quiet-days="on"] body { padding-top:86px!important; background:linear-gradient(180deg,#eef3f7,#f5f3f8 50%,#f7f5f0)!important; }
      #${bannerId} { position:fixed; z-index:2147483000; inset:0 0 auto; min-height:72px; display:flex; align-items:center; justify-content:center; gap:13px; padding:12px 18px; color:#4c3d6b; background:linear-gradient(100deg,#f3eefa,#ece6f6 50%,#f3eefa); border-bottom:1px solid #ddd4ea; box-shadow:0 6px 24px rgba(76,61,107,.12); font:700 15px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif; letter-spacing:.04em; text-align:center; }
      #${bannerId} .quiet-days-global-moon { color:#8b7aa8; font-size:24px; }
      #${bannerId} .quiet-days-global-pill { padding:4px 10px; border:1px solid #d5cce6; border-radius:999px; color:#5a4a78; background:#fff; font-size:11px; letter-spacing:.08em; font-weight:800; }
      #${bannerId} .quiet-days-global-detail { color:#5f527a; font-weight:500; letter-spacing:0; }
      html[data-quiet-days="on"] body .top-bar { top:94px!important; }
      @media(max-width:600px) { html[data-quiet-days="on"] body { padding-top:92px!important; } #${bannerId} { min-height:82px; flex-wrap:wrap; gap:3px 8px; padding:8px 10px; font-size:12px; } #${bannerId} .quiet-days-global-moon { font-size:20px; } #${bannerId} .quiet-days-global-detail { flex-basis:100%; } html[data-quiet-days="on"] body .top-bar { top:102px!important; } }
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
