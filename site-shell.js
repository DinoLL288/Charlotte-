(function () {
  const frame = document.getElementById('siteFrame');
  const query = new URLSearchParams(location.search);
  const initialPage = query.get('page') || 'index.html';
  let currentPath = '';
  let pendingPath = '';

  function safePath(value) {
    const target = new URL(value || 'index.html', location.origin);
    if (target.origin !== location.origin || !/\.html$/i.test(target.pathname) || target.pathname.endsWith('/app-shell.html')) return '/index.html';
    return `${target.pathname}${target.search}${target.hash}`;
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

  frame.addEventListener('load', () => {
    requestAnimationFrame(() => {
      document.body.classList.remove('is-navigating');
      frame.classList.add('is-visible');
    });
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
  frame.src = safePath(initialPage);
})();
