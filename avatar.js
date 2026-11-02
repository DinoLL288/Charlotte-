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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  fetch('/api/profile?user=' + encodeURIComponent(user))
    .then(res => res.json())
    .then(json => {
      const src = json.url || fallback;
      localStorage.setItem(cacheKey, src);
      const img = document.querySelector('#profilePfp img');
      if (img) img.src = src;
    })
    .catch(() => {});

  if (!document.querySelector('link[data-site-polish]')) {
    const polish = document.createElement('link');
    polish.rel = 'stylesheet';
    polish.href = 'site-polish.css';
    polish.dataset.sitePolish = 'true';
    document.head.appendChild(polish);
  }

  if (!document.querySelector('link[data-site-theme]')) {
    const theme = document.createElement('link');
    theme.rel = 'stylesheet';
    theme.href = 'site-theme.css';
    theme.dataset.siteTheme = 'true';
    document.head.appendChild(theme);
  }

  ['special-dates.js', 'site-theme.js', 'site-reminders.js', 'reactions.js', 'motion.js'].forEach(src => {
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
