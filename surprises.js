(function () {
  const user = localStorage.getItem('charlotte-user');
  const key = user ? 'charlotte-preferences-' + user : null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function readPrefs() {
    try { return JSON.parse((key && localStorage.getItem(key)) || 'null') || {}; }
    catch (e) { return {}; }
  }
  function enabled() { return readPrefs().playfulExtras !== false; }

  function ensureStyles() {
    if (!document.querySelector('link[data-surprises]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'surprises.css';
      link.dataset.surprises = 'true';
      document.head.appendChild(link);
    }
  }

  /* ---------- Content ----------
     Themed pools: each one has its own emoji, reactions, messages and
     optional floating emoji, so what you find feels like it belongs together. */
  const POOLS = {
    hearts: {
      weight: 3,
      emoji: ['💖','💕','💗','💓','💞','💘','💝','🥰','😍','🫶','💌','💋'],
      reactions: ['heartbeat','pop','jelly','swing'],
      messages: ['aww','so sweet','love it','💕','hi love','come here','you!'],
      tipClass: 'warm',
      float: ['💖','💕']
    },
    sparkle: {
      weight: 3,
      emoji: ['✨','💫','⭐','🌟','🪩','🔮'],
      reactions: ['spin','flutter','pop','rainbow','grow'],
      messages: ['✨','shiny','twinkle','found me','ooh','sparkly!'],
      tipClass: 'gold',
      float: ['✨','⭐']
    },
    critters: {
      weight: 3,
      emoji: ['🐶','🐱','🐰','🦊','🐻','🐼','🐨','🐧','🐤','🦋','🐝','🐞','🐢','🦄','🐙','🐬','🦉','🐸','🐹','🦦'],
      reactions: ['hop','jelly','wiggle','flutter','swing','flip'],
      messages: ['hello!','boop','peek','hi friend','squeak','gotcha','shh','tap tap'],
      tipClass: '',
      float: ['🐾']
    },
    treats: {
      weight: 2,
      emoji: ['☕','🍵','🧋','🍪','🍩','🧁','🍰','🍦','🍫','🍓','🍒','🍑','🥐','🍯'],
      reactions: ['wiggle','bounce','jelly','pop','swing'],
      messages: ['yum','snack time','sweet!','treat','mmm','cheers'],
      tipClass: 'warm',
      float: []
    },
    nature: {
      weight: 2,
      emoji: ['🌸','🌷','🌻','🌼','🌹','🪴','🌿','🍀','🌈','☀️','🌙','🍄','🍂','🌊'],
      reactions: ['swing','flutter','grow','wiggle','spin'],
      messages: ['bloom','fresh air','lovely','so pretty','breathe','🌿'],
      tipClass: 'fresh',
      float: ['🌸','🍃']
    },
    fun: {
      weight: 2,
      emoji: ['🎈','🎀','🎁','🪁','🎨','🎵','🎶','🎲','🧩','🪄','🎯','🛼','🚀','🛸'],
      reactions: ['bounce','spin','flip','shake','hop','rainbow','jelly'],
      messages: ['wheee','play time','yay','woo!','little win','nice','pop'],
      tipClass: '',
      float: ['🎵']
    }
  };

  // Rare finds: glow, bigger reaction, confetti, then they're collected
  const RARE = {
    emoji: ['🎁','💎','👑','🦄','🌈','🪩','🏆','🧿'],
    messages: ['rare find!','you found one!','secret!','jackpot','so lucky','wow!'],
    reactions: ['pop','flip','heartbeat']
  };

  const COLORS = ['#f6d365','#fda085','#8ecbeb','#ecd7a0','#b8e0d2','#f9a8d4','#c4b5fd'];
  const SHAPES = ['', 'round', 'ribbon', 'tri'];
  const ALL_REACTIONS = ['wiggle','spin','bounce','grow','shake','rainbow','pop','flip','jelly',
                         'heartbeat','swing','flutter','hop','vanish','collected'];

  /* ---------- Helpers ---------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function weightedPool() {
    const entries = Object.values(POOLS);
    let total = entries.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    for (const p of entries) { r -= p.weight; if (r <= 0) return p; }
    return entries[0];
  }

  // "bag" of emoji so the same one doesn't show up over and over
  function makeBag(list) {
    let bag = [];
    return function () {
      if (!bag.length) bag = list.slice().sort(() => Math.random() - 0.5);
      return bag.pop();
    };
  }
  const bags = new Map();
  function nextEmoji(pool) {
    if (!bags.has(pool)) bags.set(pool, makeBag(pool.emoji));
    return bags.get(pool)();
  }

  /* ---------- Effects ---------- */
  function confetti(count) {
    if (reduceMotion) return;
    for (let i = 0; i < (count || 12); i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece ' + SHAPES[i % SHAPES.length];
      piece.style.left = rand(0, 100) + 'vw';
      piece.style.setProperty('--c', pick(COLORS));
      piece.style.setProperty('--dx', rand(-100, 100) + 'px');
      piece.style.setProperty('--sway', rand(-30, 30) + 'px');
      piece.style.setProperty('--delay', rand(0, 0.3) + 's');
      piece.style.setProperty('--t', rand(1.2, 1.8) + 's');
      document.body.appendChild(piece);
      setTimeout(function () { piece.remove(); }, 2300);
    }
  }

  function center(item) {
    return { x: item.offsetLeft + item.offsetWidth / 2, y: item.offsetTop + item.offsetHeight / 2 };
  }

  function ripple(layer, item) {
    if (reduceMotion) return;
    const c = center(item);
    const r = document.createElement('div');
    r.className = 'surprise-ripple';
    r.style.left = c.x + 'px';
    r.style.top = c.y + 'px';
    layer.appendChild(r);
    setTimeout(function () { r.remove(); }, 800);
  }

  function sparks(layer, item, n) {
    if (reduceMotion) return;
    const c = center(item);
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + rand(-0.3, 0.3);
      const dist = rand(18, 38);
      const s = document.createElement('div');
      s.className = 'surprise-spark';
      s.style.left = c.x + 'px';
      s.style.top = c.y + 'px';
      s.style.setProperty('--c', pick(COLORS));
      s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      layer.appendChild(s);
      setTimeout(function () { s.remove(); }, 800);
    }
  }

  function floaters(layer, item, list, n) {
    if (reduceMotion || !list || !list.length) return;
    const c = center(item);
    for (let i = 0; i < n; i++) {
      const f = document.createElement('div');
      f.className = 'surprise-float';
      f.textContent = pick(list);
      f.style.left = c.x + rand(-14, 14) + 'px';
      f.style.top = c.y + 'px';
      f.style.setProperty('--dx', rand(-26, 26) + 'px');
      f.style.animationDelay = (i * 0.12) + 's';
      layer.appendChild(f);
      setTimeout(function () { f.remove(); }, 1700);
    }
  }

  function tip(item, text, extraClass) {
    const t = document.createElement('div');
    t.className = 'surprise-tip' + (extraClass ? ' ' + extraClass : '');
    t.textContent = text;
    t.style.left = item.offsetLeft + item.offsetWidth / 2 + 'px';
    t.style.top = item.offsetTop + 'px';
    item.parentElement.appendChild(t);
    setTimeout(function () { t.remove(); }, 1000);
  }

  function updateTokenBadge(state) {
    const el = document.getElementById('tokenCount');
    if (el && state && state.tokens) {
      const u = user || 'Luke';
      el.textContent = state.tokens[u] || 0;
    }
  }

  function ensureTokenBadge() {
    if (document.getElementById('tokenBadge')) return;
    const badge = document.createElement('a');
    badge.id = 'tokenBadge';
    badge.className = 'token-badge';
    badge.href = 'discoveries.html';
    badge.innerHTML = 'Tokens: <span id="tokenCount">0</span>';
    document.body.appendChild(badge);
    if (user) {
      fetch('/api/question-room?view=playful-state', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(updateTokenBadge)
        .catch(function () {});
    }
  }

  function recordFind(emoji, rare) {
    if (!user) return;
    fetch('/api/question-room', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'playful-find', user: user, emoji: emoji, rare: !!rare })
    }).then(function (r) { return r.json(); })
      .then(function (res) { if (res && res.state) updateTokenBadge(res.state); })
      .catch(function () {});
  }

  function ensureFidgetSpinner() {
    if (document.getElementById('fidgetSpinner')) return;
    const sp = document.createElement('div');
    sp.id = 'fidgetSpinner';
    sp.className = 'fidget-spinner';
    sp.setAttribute('aria-label', 'Movable fidget spinner');
    document.body.appendChild(sp);

    let dragging = false;
    let moved = false;
    let startX = 0, startY = 0, origX = 0, origY = 0;

    sp.addEventListener('mousedown', function (e) {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = sp.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      sp.style.right = 'auto';
      sp.style.bottom = 'auto';
      sp.style.left = origX + 'px';
      sp.style.top = origY + 'px';
      e.preventDefault();
    });

    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      sp.style.left = (origX + dx) + 'px';
      sp.style.top = (origY + dy) + 'px';
    });

    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      if (!moved) {
        sp.classList.remove('spin');
        void sp.offsetWidth;
        sp.classList.add('spin');
      }
    });

    // touch support
    sp.addEventListener('touchstart', function (e) {
      const t = e.touches[0];
      dragging = true;
      moved = false;
      startX = t.clientX;
      startY = t.clientY;
      const rect = sp.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      sp.style.right = 'auto';
      sp.style.bottom = 'auto';
      sp.style.left = origX + 'px';
      sp.style.top = origY + 'px';
    }, { passive: true });

    window.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      sp.style.left = (origX + dx) + 'px';
      sp.style.top = (origY + dy) + 'px';
    }, { passive: true });

    window.addEventListener('touchend', function () {
      if (!dragging) return;
      dragging = false;
      if (!moved) {
        sp.classList.remove('spin');
        void sp.offsetWidth;
        sp.classList.add('spin');
      }
    });
  }

  /* ---------- Scatter ---------- */
  function scatter() {
    if (!enabled()) return;
    ensureStyles();
    const old = document.getElementById('surpriseLayer');
    if (old) old.remove();

    const layer = document.createElement('div');
    layer.id = 'surpriseLayer';
    layer.className = 'surprise-layer';
    document.body.appendChild(layer);
    ensureTokenBadge();
    ensureFidgetSpinner();

    const count = 8 + Math.floor(Math.random() * 5);     // 8–12, kept sparse so the page stays calm
    const rareCount = Math.random() < 0.5 ? 1 : 0;       // 0–1 rare finds

    for (let i = 0; i < count; i++) {
      const isRare = i < rareCount;
      const pool = isRare ? null : weightedPool();
      const emoji = isRare ? pick(RARE.emoji) : nextEmoji(pool);
      const reaction = isRare ? pick(RARE.reactions) : pick(pool.reactions);
      const message = isRare ? pick(RARE.messages) : pick(pool.messages);

      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'surprise-item';
      item.textContent = emoji;
      item.setAttribute('aria-label', isRare ? 'rare surprise' : 'surprise');

      // size variety through classes (weighted toward small and normal)
      const r = Math.random();
      if (isRare) item.classList.add('lg', 'glow');
      else if (r < 0.3) item.classList.add('sm', 'soft');
      else if (r < 0.85) { /* normal */ }
      else item.classList.add('lg');

      item.style.left = rand(4, 96) + '%';
      item.style.top = rand(6, 94) + '%';
      item.style.setProperty('--d', -rand(0, 7) + 's');   // desync the idle drift
      if (!isRare) item.style.opacity = rand(0.28, 0.46).toFixed(2);

      item.addEventListener('click', function () {
        if (item.dataset.found === 'true') return;
        item.dataset.found = 'true';
        item.classList.remove(...ALL_REACTIONS);
        void item.offsetWidth;
        item.classList.add(reaction);
        tip(item, message, isRare ? 'gold long' : pool.tipClass);
        ripple(layer, item);
        recordFind(emoji, isRare);

        if (isRare) {
          sparks(layer, item, 10);
          confetti(16);
          item.classList.add('collected');
          setTimeout(function () { item.remove(); }, 650);
        } else {
          sparks(layer, item, 5);
          floaters(layer, item, pool.float, 2);
          if (reaction === 'pop') confetti(8);
          setTimeout(function () { item.classList.add('vanish'); }, 400);
          setTimeout(function () { item.remove(); }, 950);
        }
      });

      layer.appendChild(item);
    }
  }

  /* ---------- Preferences wiring (unchanged behaviour) ---------- */
  function removeLayer() {
    const old = document.getElementById('surpriseLayer');
    if (old) old.remove();
    const sp = document.getElementById('fidgetSpinner');
    if (sp) sp.remove();
    const badge = document.getElementById('tokenBadge');
    if (badge) badge.remove();
  }
  function sync() { if (enabled()) scatter(); else removeLayer(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync);
  } else {
    sync();
  }

  window.addEventListener('charlotte-preferences', function (event) {
    const on = event.detail ? event.detail.playfulExtras !== false : enabled();
    if (on) scatter(); else removeLayer();
  });
  window.addEventListener('storage', function (event) {
    if (key && event.key === key) sync();
  });
})();