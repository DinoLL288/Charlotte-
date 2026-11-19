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
      /* Whole-site Quiet Days: a deliberate midnight palette, not a small tint. */
      html[data-quiet-days="on"] { color-scheme:dark; --ink:#f0f3f8; --ink-soft:#d0d8e4; --ink-faint:#b5c0d0; --surface:#202b40; --surface-soft:#2a3850; --line:#53617a; --line-strong:#71809a; --accent-soft:#354661; --accent-ink:#e0e9f4; --gold-ink:#f2d89b; --bg:#111a2b; }
      html[data-quiet-days="on"] body { padding-top:86px!important; color:#f0f3f8!important; background:#111a2b!important; background-image:radial-gradient(ellipse at 50% -12%,#45516d 0%,#202c43 38%,#111a2b 78%)!important; }
      html[data-quiet-days="on"] body :is(h1,h2,h3,h4,h5,h6,strong,b,legend,.title,.range,.section-title,.section-heading,.group-title,.row-title,.calm-title) { color:#fff8e9!important; }
      html[data-quiet-days="on"] body :is(p,small,label,li,dt,dd,.subtitle,.intro,.hint,.form-hint,.meta,.status,.description,.row-sub,.calm-sub,.section-label) { color:#d0d8e4!important; }
      html[data-quiet-days="on"] body a:not(.button):not(.small):not(.mini):not(.primary) { color:#e4d3a7!important; }
      html[data-quiet-days="on"] body :is(header,main,footer,section,article,aside,nav,form,details,dialog,[class*="card"],[class*="panel"],[class*="tile"],[class*="row"],[class*="item"],[class*="entry"],[class*="group"],[class*="door"],[class*="toolbar"],[class*="history"],[class*="person"],[class*="prompt"],[class*="plan"],[class*="moment"],[class*="section"]) { color:#f0f3f8!important; background-color:#202b40!important; background-image:none!important; border-color:#53617a!important; box-shadow:0 12px 34px #05091455!important; }
      html[data-quiet-days="on"] body :is(header.hero,.hero,.hub-hero,.hero-doors,.gallery-hero) { color:#fff8e9!important; background:radial-gradient(ellipse at 50% 0%,#596581,#283650 58%,#1a263b)!important; }
      html[data-quiet-days="on"] body :is(input,textarea,select,.site-dialog-input) { color:#f3f5f8!important; background-color:#121d30!important; border-color:#71809a!important; }
      html[data-quiet-days="on"] body :is(input,textarea,select)::placeholder { color:#b5c0d0!important; }
      html[data-quiet-days="on"] body :is(button,.button,.small,.mini,.primary,.tab,.album-filter,.site-dialog-button,.door-links a) { color:#fff8e9!important; background-color:#42516d!important; border-color:#8491a8!important; }
      html[data-quiet-days="on"] body :is(.button.secondary,.button.ghost,.small,.mini,.top-bar .button) { color:#f0e2bd!important; background-color:#29364d!important; border-color:#71809a!important; }
      html[data-quiet-days="on"] body :is(.chip,.badge,.event-badge,.today-tag) { color:#fff0c8!important; background-color:#655632!important; border-color:#a28b52!important; }
      html[data-quiet-days="on"] body .hub-hero-photo::after { background:linear-gradient(180deg,#141c2caa,#141c2cdd)!important; }
      html[data-quiet-days="on"] body img,html[data-quiet-days="on"] body video,html[data-quiet-days="on"] body canvas { filter:brightness(.88) saturate(.86); }
      #${bannerId} { position:fixed; z-index:2147483000; inset:0 0 auto; min-height:72px; display:flex; align-items:center; justify-content:center; gap:13px; padding:12px 18px; color:#fff8e9; background:linear-gradient(100deg,#111a2b,#303d58 50%,#111a2b); border-bottom:2px solid #d5bd80; box-shadow:0 8px 32px #05091499; font:800 15px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif; letter-spacing:.08em; text-align:center; }
      #${bannerId} .quiet-days-global-moon { color:#f2d89b; font-size:26px; }
      #${bannerId} .quiet-days-global-pill { padding:5px 9px; border:1px solid #d5bd80; border-radius:999px; color:#f2d89b; font-size:11px; letter-spacing:.12em; }
      #${bannerId} .quiet-days-global-detail { color:#e0e5ed; font-weight:500; letter-spacing:0; }
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
