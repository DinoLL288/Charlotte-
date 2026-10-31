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
  frame.src = safePath(initialPage);
})();
