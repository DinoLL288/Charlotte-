(function () {
  const frame = document.getElementById('siteFrame');
  const query = new URLSearchParams(location.search);
  const initialPage = query.get('page') || 'index.html';
  let currentPath = '';
  let pendingPath = '';

  function safePath(value) {
    const target = new URL(value || 'index', location.origin);
    if (target.origin !== location.origin) return '/index';
    let pathname = target.pathname;
    // Cloudflare Pages serves pages without the .html extension (and redirects
    // .html to the clean URL), so normalise everything to the clean form.
    pathname = pathname.replace(/\.html$/i, '');
    if (pathname === '' || pathname === '/') pathname = '/index';
    if (pathname.endsWith('/app-shell')) return '/index';
    // Only allow page-like paths (no file extension other than the stripped .html).
    if (/\.[a-z0-9]+$/i.test(pathname)) return '/index';
    return `${pathname}${target.search}${target.hash}`;
  }

  function startPage(path, push = false) {
    const next = safePath(path);
    if (next === currentPath && frame.contentWindow?.location.href) return;
    pendingPath = next;
    document.body.classList.add('is-navigating');
    if (push) history.pushState({ page: next }, '', next);
    if (frame.contentWindow?.location.href && frame.contentWindow.location.origin === location.origin) frame.contentWindow.location.replace(new URL(next, location.origin));
    else frame.src = next;
  }

  // The balls script (and its saved-state fetch) only loads when the user
  // first turns balls on. Until then the page just gets the toggle button,
  // identical to the one the script itself creates — the script adopts it
  // when it loads instead of making a second one. That saves a 45 KB
  // download and a state fetch on every page load for anyone who never
  // turns the balls on, and the toggle looks and behaves exactly the same.
  function installBouncyBalls() {
  try {
    const pageDocument = frame.contentDocument;
    const pageWindow = frame.contentWindow;
    if (!pageDocument || !pageDocument.documentElement || !pageWindow) return;

    if (pageDocument.getElementById('ui-bouncy-balls-script')) return;
    if (pageDocument.getElementById('fidget-balls-toggle')) return;

    const toggle = pageDocument.createElement('button');
    toggle.id = 'fidget-balls-toggle';
    toggle.textContent = '● Fidget balls: OFF';
    toggle.setAttribute('aria-pressed', 'false');
    Object.assign(toggle.style, {
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: '2147483001',
      padding: '11px 15px',
      border: '1px solid var(--line-strong, #c3d1da)',
      borderRadius: '30px',
      background: 'var(--surface, #ffffff)',
      color: 'var(--ink, #1c3850)',
      font: "600 13px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
      cursor: 'pointer',
      boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28,56,80,0.07))',
      transition: 'background .15s ease'
    });
    toggle.addEventListener('click', () => {
      // Once the balls script has loaded it owns the toggle.
      if (pageWindow.__bouncyBallsLoaded) return;
      if (pageWindow.__bouncyBallsLoading) return;
      pageWindow.__bouncyBallsLoading = true;
      // The tap that loads the script means "on".
      pageWindow.__bouncyBallsAutoEnable = true;
      const script = pageDocument.createElement('script');
      script.id = 'ui-bouncy-balls-script';
      script.src = '/assets/js/ui-bouncy-balls.js?v=3';
      script.async = true;
      script.onerror = () => { pageWindow.__bouncyBallsLoading = false; };
      (pageDocument.head || pageDocument.documentElement).appendChild(script);
    });
    pageDocument.documentElement.appendChild(toggle);
  } catch (error) {
    // Fidget balls failed to load — non-critical, silently continue
  }
}

frame.addEventListener('load', () => {
  installBouncyBalls();

  document.body.classList.remove('is-navigating');
  frame.classList.add('is-visible');
});

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data) return;
    if (event.data.type === 'request-browser-reminders') {
      const notify = window.Notification;
      if (!notify) { frame.contentWindow.postMessage({ type: 'browser-reminder-permission', permission: 'unsupported' }, location.origin); return; }
      notify.requestPermission().then(permission => frame.contentWindow.postMessage({ type: 'browser-reminder-permission', permission }, location.origin)).catch(() => frame.contentWindow.postMessage({ type: 'browser-reminder-permission', permission: 'denied' }, location.origin));
      return;
    }
    if (event.data.type === 'calm-dock') document.documentElement.classList.toggle('dock-away', Boolean(event.data.away));
    if (event.data.type === 'charlotte-theme') {
      const preferences = event.data.preferences || {};
      if (['blue', 'midnight', 'lavender', 'sage', 'sunset'].includes(preferences.theme)) document.documentElement.dataset.coupleTheme = preferences.theme;
      if (/^#[0-9a-f]{6}$/i.test(preferences.accent || '')) document.documentElement.style.setProperty('--couple-accent', preferences.accent);
      document.documentElement.dataset.textSize = preferences.textSize === 'large' ? 'large' : 'normal';
      document.documentElement.dataset.reducedMotion = String(Boolean(preferences.reducedMotion));
      document.documentElement.dataset.compactLayout = String(Boolean(preferences.compactLayout));
      document.documentElement.dataset.showReactions = String(preferences.showReactions !== false);
      document.documentElement.dataset.showPresence = String(preferences.showPresence !== false);
document.documentElement.dataset.homeLayout = preferences.homeLayout === 'doors' ? 'doors' : 'calm';
    }
    if (event.data.type === 'site-page-start') {
      const next = safePath(event.data.path);
      pendingPath = next;
      if (next !== currentPath) history.pushState({ page: next }, '', next);
      document.body.classList.add('is-navigating');
    }
    if (event.data.type === 'site-page-ready') {
      const next = safePath(event.data.path);
      if (pendingPath && next !== pendingPath) return;
      if (!currentPath) history.replaceState({ page: next }, '', next);
      else if (next !== currentPath && !pendingPath) history.pushState({ page: next }, '', next);
      currentPath = next;
      pendingPath = '';
      if (event.data.title) document.title = `${event.data.title} · Charlotte & Luke`;
      document.body.classList.remove('is-navigating');
      frame.classList.add('is-visible');
    }
  });

  window.addEventListener('popstate', () => startPage(`${location.pathname}${location.search}${location.hash}`));
  window.addEventListener('storage', event => {
    if (event.key === 'charlotte-user' && !event.newValue) location.replace('login.html');
  });
  console.log('DEBUG initialPage', JSON.stringify(initialPage), 'safe', JSON.stringify(safePath(initialPage)));
  frame.src = safePath(initialPage);
})();
