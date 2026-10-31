(function () {
  if (window.top === window.self) return;
  const parentOrigin = location.origin;
  function announceReady() {
    window.parent.postMessage({ type: 'site-page-ready', path: `${location.pathname}${location.search}${location.hash}`, title: document.title }, parentOrigin);
  }
  announceReady();
  window.addEventListener('load', announceReady, { once: true });

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || link.target && link.target !== '_self' || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const next = new URL(link.href, location.href);
    if (next.origin !== location.origin || !/\.html$/i.test(next.pathname) || next.pathname === location.pathname && next.search === location.search) return;
    event.preventDefault();
    const path = `${next.pathname}${next.search}${next.hash}`;
    document.documentElement.classList.add('page-leaving');
    window.parent.postMessage({ type: 'site-page-start', path }, parentOrigin);
    setTimeout(() => location.replace(next.href), 130);
  }, true);
})();
