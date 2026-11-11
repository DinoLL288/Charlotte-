(function () {
  const user = localStorage.getItem('charlotte-user');
  if (!user) return;

  const cacheKey = 'charlotte-avatar-' + user;
  const fallback = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user) + '&background=e8f6ff&color=2873a6&size=128';

  const style = document.createElement('style');
  style.textContent = `
    .profile-pfp {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 20;
      display: block;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      overflow: hidden;
      border: 3px solid #fff;
      background: #e8f6ff;
      box-shadow: 0 7px 20px #347eac40;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .profile-pfp:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 24px #347eac55;
    }
    .profile-pfp:focus-visible {
      outline: 3px solid #245b85;
      outline-offset: 3px;
    }
    .profile-pfp img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    @media (prefers-reduced-motion: reduce) {
      .profile-pfp { transition: none; }
    }
  `;
  document.head.appendChild(style);

  function mount() {
    if (document.getElementById('profilePfp')) return;

    const link = document.createElement('a');
    link.id = 'profilePfp';
    link.className = 'profile-pfp';
    link.href = 'profile.html';
    link.title = 'Settings';
    link.setAttribute('aria-label', 'Open settings');

    const img = document.createElement('img');
    img.alt = user + "'s profile picture";
    img.src = localStorage.getItem(cacheKey) || fallback;

    link.appendChild(img);
    document.body.appendChild(link);
  }

  // Dark mode toggle
  const darkToggle = document.createElement('button');
  darkToggle.id = 'darkModeToggle';
  darkToggle.className = 'profile-pfp';
  darkToggle.style.cssText = 'position:fixed;top:16px;right:72px;z-index:20;width:40px;height:40px;border-radius:50%;border:3px solid #fff;background:#1a2a3a;color:#ecd7a0;font-size:1.1rem;cursor:pointer;box-shadow:0 7px 20px #347eac40;display:grid;place-items:center;';
  darkToggle.textContent = '🌙';
  darkToggle.setAttribute('aria-label', 'Toggle dark mode');
  darkToggle.addEventListener('click', () => {
    const isDark = document.documentElement.dataset.darkMode === 'true';
    const newMode = !isDark;
    document.documentElement.dataset.darkMode = String(newMode);
    darkToggle.textContent = newMode ? '☀️' : '🌙';
    // Save to server
    const u = localStorage.getItem('charlotte-user');
    if (u) {
      fetch('/api/question-room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'dark-mode', user: u, darkMode: newMode }) }).catch(() => {});
    }
    // Save to localStorage cache
    try {
      const key = 'charlotte-preferences-' + u;
      const prefs = JSON.parse(localStorage.getItem(key) || '{}');
      prefs.darkMode = newMode;
      localStorage.setItem(key, JSON.stringify(prefs));
    } catch (e) {}
  });
  // Set initial state from preferences
  try {
    const prefs = JSON.parse(localStorage.getItem('charlotte-preferences-' + user) || '{}');
    if (prefs.darkMode) {
      document.documentElement.dataset.darkMode = 'true';
      darkToggle.textContent = '☀️';
    }
  } catch (e) {}
  document.body.appendChild(darkToggle);

  const lastFetch = Number(localStorage.getItem(cacheKey + '-time') || 0);
  if (Date.now() - lastFetch >= 5 * 60 * 1000) {
    fetch('/api/profile?user=' + encodeURIComponent(user))
      .then(res => res.json())
      .then(json => {
        const src = json.url || fallback;
        localStorage.setItem(cacheKey, src);
        localStorage.setItem(cacheKey + '-time', String(Date.now()));
        const img = document.querySelector('#profilePfp img');
        if (img) img.src = src;
      })
      .catch(() => {});
  }

  if (!document.querySelector('link[data-site-polish]')) {
    const polish = document.createElement('link');
    polish.rel = 'stylesheet';
    polish.href = 'site-polish.css';
    polish.dataset.sitePolish = 'true';
    document.head.appendChild(polish);
  }

  if (!document.querySelector('link[rel~="icon"]')) {
    const fav = document.createElement('link');
    fav.rel = 'icon';
    fav.href = 'favicon.svg';
    fav.type = 'image/svg+xml';
    document.head.appendChild(fav);
  }

  if (!document.querySelector('link[data-site-theme]')) {
    const theme = document.createElement('link');
    theme.rel = 'stylesheet';
    theme.href = 'site-theme.css';
    theme.dataset.siteTheme = 'true';
    document.head.appendChild(theme);
  }

  ['special-dates.js', 'site-theme.js', 'site-reminders.js', 'reactions.js', 'motion.js', 'surprises.js', 'request-cache.js'].forEach(src => {
    if (document.querySelector(`script[data-site-helper="${src}"]`)) return;
    const helper = document.createElement('script');
    helper.src = src;
    helper.async = false;
    helper.dataset.siteHelper = src;
    document.body.appendChild(helper);
  });

  const helperScript = document.createElement('script');
  helperScript.src = window.top === window.self ? 'presence.js' : 'site-frame.js';
  document.body.appendChild(helperScript);
})();
