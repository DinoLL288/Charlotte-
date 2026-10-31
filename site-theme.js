(() => {
  const user = localStorage.getItem('charlotte-user');
  if (!user) return;
  const key = `charlotte-preferences-${user}`;
  const presets = new Set(['blue', 'midnight', 'lavender', 'sage', 'sunset']);
  function apply(preferences) {
    if (!preferences || !presets.has(preferences.theme)) return;
    const root = document.documentElement;
    root.dataset.coupleTheme = preferences.theme;
    if (/^#[0-9a-f]{6}$/i.test(preferences.accent || '')) root.style.setProperty('--couple-accent', preferences.accent);
    root.dataset.textSize = preferences.textSize === 'large' ? 'large' : 'normal';
    root.dataset.reducedMotion = String(Boolean(preferences.reducedMotion));
    root.dataset.compactLayout = String(Boolean(preferences.compactLayout));
    root.dataset.showReactions = String(preferences.showReactions !== false);
    root.dataset.showPresence = String(preferences.showPresence !== false);
    try { localStorage.setItem(key, JSON.stringify(preferences)); } catch {}
    if (window.parent !== window) window.parent.postMessage({ type: 'charlotte-theme', preferences }, location.origin);
  }
  try { apply(JSON.parse(localStorage.getItem(key) || 'null')); } catch {}
  fetch('/api/question-room?view=preferences&user=' + encodeURIComponent(user), { cache: 'no-store' })
    .then(response => response.json()).then(apply).catch(() => {});
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.data?.type === 'charlotte-theme') apply(event.data.preferences);
  });
})();
