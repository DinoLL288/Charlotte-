(() => {
  "use strict";

  if (window.__bouncyBallsLoaded) return;
  window.__bouncyBallsLoaded = true;

  // SETTINGS (base, upgradeable)
  const BASE = {
    ballCount: 60,        // max live balls in physics
    minSize: 4,
    maxSize: 8,
    gravity: 0.22,
    bounce: 0.74,
    wallBounce: 0.72,
    airDamp: 0.992,
    groundDamp: 0.86,
    spawnRate: 180,       // ms between spawn ticks
    substeps: 4,
    maxSpeed: 18,
    friction: 0.88,
    waveSize: 40,         // balls per wave (fixed, not upgradeable)
    maxPile: 80           // max rendered collected balls
  };

  const STORAGE_KEY = "charlotte-bouncy-balls-v1";

  // Persisted state
  let state = {
    tokens: 0,
    spawnBatch: 1,        // balls per spawn tick (upgradeable)
    upgradeCost: 5,
    collected: 0,         // total collected (all time)
    wave: 1,
    waveRemaining: BASE.waveSize,
    pile: [],             // rendered resting balls [{x,y,r,hue}]
    // Customisation (unlocked with tokens in the settings panel)
    theme: 'classic',     // classic | sunset | ocean
    trails: false,        // glow trails behind live balls
    gravity: 'earth',     // earth | moon
    shape: 'round',       // round | star | heart
    unlocks: []           // ids of one-time upgrades already bought
  };

  // Ball looks: hue ranges per theme.
  const THEMES = {
    classic: { label: 'Classic', hues: [0, 360] },
    sunset: { label: 'Sunset', hues: [8, 48] },
    ocean: { label: 'Ocean', hues: [175, 215] }
  };
  const GRAVITIES = {
    earth: { label: 'Earth', mult: 1, bounce: 0.74 },
    moon: { label: 'Moon', mult: 0.45, bounce: 0.85 }
  };
  const SHAPES = {
    round: { label: 'Round' },
    star: { label: 'Stars' },
    heart: { label: 'Hearts' }
  };
  // One-time unlocks buyable with tokens. Each one unlocks something
  // meaningful — a look, a feel, or a ball type — not just more balls.
  const SHOP = [
    { id: 'trails', label: 'Glow trails', desc: 'Balls leave a glowing trail as they fall.', cost: 10 },
    { id: 'theme-sunset', label: 'Sunset theme', desc: 'Warm sunset-coloured balls.', cost: 8 },
    { id: 'theme-ocean', label: 'Ocean theme', desc: 'Cool blue ocean-coloured balls.', cost: 8 },
    { id: 'gravity-moon', label: 'Moon gravity', desc: 'Floatier falls and bouncier landings.', cost: 12 },
    { id: 'shape-star', label: 'Star balls', desc: 'Balls fall as little stars.', cost: 15 },
    { id: 'shape-heart', label: 'Heart balls', desc: 'Balls fall as little hearts.', cost: 15 }
  ];
  function effGravity() { return BASE.gravity * (GRAVITIES[state.gravity] || GRAVITIES.earth).mult; }
  function effBounce() { return (GRAVITIES[state.gravity] || GRAVITIES.earth).bounce; }
  function themeHue() {
    const t = THEMES[state.theme] || THEMES.classic;
    return random(t.hues[0], t.hues[1]);
  }
  function validTheme(v) { return THEMES[v] ? v : 'classic'; }
  function validGravity(v) { return GRAVITIES[v] ? v : 'earth'; }
  function validShape(v) { return SHAPES[v] ? v : 'round'; }
  function validUnlocks(v) {
    if (!Array.isArray(v)) return [];
    const ids = SHOP.map(s => s.id);
    return v.filter(id => ids.includes(id));
  }

  let stateLoaded = false;

  async function loadState() {
    const user = localStorage.getItem('charlotte-user');
    if (user) {
      try {
        const res = await fetch('/api/question-room?view=bouncy-balls&user=' + encodeURIComponent(user), { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object') {
            state.tokens = Math.max(0, Number(data.tokens) || 0);
            state.spawnBatch = Math.max(1, Math.min(12, Number(data.spawnBatch) || 1));
            state.upgradeCost = Math.max(5, Number(data.upgradeCost) || 5);
            state.collected = Math.max(0, Number(data.collected) || 0);
            state.wave = Math.max(1, Number(data.wave) || 1);
            state.waveRemaining = Math.max(0, Math.min(BASE.waveSize, Number(data.waveRemaining) || BASE.waveSize));
            state.pile = Array.isArray(data.pile) ? data.pile.slice(0, BASE.maxPile) : [];
            state.theme = validTheme(data.theme);
            state.trails = data.trails === true;
            state.gravity = validGravity(data.gravity);
            state.shape = validShape(data.shape);
            state.unlocks = validUnlocks(data.unlocks);
            stateLoaded = true;
          }
        }
      } catch (e) { /* fall back to localStorage */ }
    }
    // Fallback to localStorage if server failed or no user
    if (!stateLoaded) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            state.tokens = Number.isFinite(parsed.tokens) ? Math.max(0, parsed.tokens) : 0;
            state.spawnBatch = Number.isFinite(parsed.spawnBatch) ? Math.max(1, Math.min(12, parsed.spawnBatch)) : 1;
            state.upgradeCost = Number.isFinite(parsed.upgradeCost) ? Math.max(5, parsed.upgradeCost) : 5;
            state.collected = Number.isFinite(parsed.collected) ? Math.max(0, parsed.collected) : 0;
            state.wave = Number.isFinite(parsed.wave) ? Math.max(1, parsed.wave) : 1;
            state.waveRemaining = Number.isFinite(parsed.waveRemaining) ? Math.max(0, Math.min(BASE.waveSize, parsed.waveRemaining)) : BASE.waveSize;
            if (Array.isArray(parsed.pile)) {
              state.pile = parsed.pile.filter(b => b && Number.isFinite(b.x) && Number.isFinite(b.y)).slice(0, BASE.maxPile);
            }
            state.theme = validTheme(parsed.theme);
            state.trails = parsed.trails === true;
            state.gravity = validGravity(parsed.gravity);
            state.shape = validShape(parsed.shape);
            state.unlocks = validUnlocks(parsed.unlocks);
          }
        }
      } catch (e) { /* ignore */ }
    }
    stateLoaded = true;
  }

  function stateSnapshot() {
    return {
      tokens: state.tokens,
      spawnBatch: state.spawnBatch,
      upgradeCost: state.upgradeCost,
      collected: state.collected,
      wave: state.wave,
      waveRemaining: state.waveRemaining,
      pile: state.pile.slice(0, BASE.maxPile),
      theme: state.theme,
      trails: state.trails,
      gravity: state.gravity,
      shape: state.shape,
      unlocks: state.unlocks.slice()
    };
  }

  function saveState() {
    // Save to localStorage as cache
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateSnapshot()));
    } catch (e) { /* ignore */ }
    // Save to server
    const user = localStorage.getItem('charlotte-user');
    if (!user) return;
    fetch('/api/question-room', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'bouncy-balls', user, state: stateSnapshot() })
    }).catch(() => { /* ignore */ });
  }

  loadState().catch(() => { /* ignore */ });
  let enabled = false;
  let balls = [];          // live physics balls
  let obstacles = [];
  let animation = null;
  let lastTime = 0;
  let spawnTimer = 0;
  let obstacleRefreshTimer = 0;
  let collecting = 0;      // balls currently being collected this frame

  let canvas = null;
  let ctx = null;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "2147483000"
    });
    document.documentElement.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resize();
  }

  function removeCanvas() {
    if (canvas) {
      canvas.remove();
      canvas = null;
      ctx = null;
    }
  }

  let width = innerWidth;
  let height = innerHeight;
  let dpr = Math.min(devicePixelRatio || 1, 2);
  let scrollY = window.scrollY || 0;
  let pageHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0, height);

  function resize() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    scrollY = window.scrollY || 0;
    pageHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0, height);
    if (canvas && ctx) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    refreshObstacles();
  }

  // ---------- UI: HUD ----------
  const hud = document.createElement("div");
  Object.assign(hud.style, {
    position: "fixed",
    top: "14px",
    left: "14px",
    zIndex: "2147483002",
    padding: "8px 12px",
    borderRadius: "12px",
    background: "rgba(20,35,55,0.72)",
    color: "#fff",
    font: "600 12px system-ui",
    lineHeight: "1.5",
    backdropFilter: "blur(6px)",
    border: "1px solid rgba(255,255,255,0.15)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
    display: "none",
    minWidth: "150px"
  });
  document.documentElement.appendChild(hud);

  function nextUpgrade() {
    // Cheapest thing still to buy: spawn upgrade or a shop unlock.
    const options = [];
    if (state.spawnBatch < 12) options.push({ label: 'Spawn +1', cost: state.upgradeCost });
    for (const item of SHOP) {
      if (!state.unlocks.includes(item.id)) options.push({ label: item.label, cost: item.cost });
    }
    if (!options.length) return null;
    options.sort((a, b) => a.cost - b.cost);
    return options[0];
  }

  function updateHud() {
    if (!enabled) { hud.style.display = "none"; return; }
    hud.style.display = "block";
    const done = BASE.waveSize - state.waveRemaining;
    const pct = Math.round((done / BASE.waveSize) * 100);
    const next = nextUpgrade();
    const perks = [
      THEMES[state.theme].label,
      state.trails ? 'Trails' : null,
      state.gravity === 'moon' ? 'Moon gravity' : null,
      SHAPES[state.shape].label + ' balls'
    ].filter(Boolean).join(' · ');
    hud.innerHTML =
      `<div>Wave <b>${state.wave}</b> — ${done}/${BASE.waveSize} fallen</div>` +
      `<div style="height:6px;border-radius:3px;background:rgba(255,255,255,.2);margin:4px 0 6px;overflow:hidden;"><div style="height:100%;width:${pct}%;border-radius:3px;background:#ffd166;"></div></div>` +
      `<div>Collected: <b>${state.collected}</b> &nbsp; Tokens: <b>${state.tokens}</b></div>` +
      `<div>Spawn: <b>${state.spawnBatch}</b>/tick</div>` +
      `<div style="opacity:.8;">${perks}</div>` +
      `<div style="opacity:.85;">${next ? `Next: ${next.label} — ${next.cost} tokens` : 'All upgrades unlocked ✨'}</div>`;
  }

  // ---------- UI: settings button + panel ----------
  const settingsBtn = document.createElement("button");
  settingsBtn.textContent = "⚙";
  settingsBtn.setAttribute("aria-label", "Ball settings");
  Object.assign(settingsBtn.style, {
    position: "fixed",
    bottom: "18px",
    left: "18px",
    zIndex: "2147483002",
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.3)",
    background: "#1c2030",
    color: "#fff",
    font: "600 18px system-ui",
    cursor: "pointer",
    boxShadow: "0 5px 18px rgba(0,0,0,0.2)",
    display: "none"
  });
  document.documentElement.appendChild(settingsBtn);

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "68px",
    left: "18px",
    zIndex: "2147483003",
    width: "260px",
    padding: "14px",
    borderRadius: "14px",
    background: "rgba(20,30,50,0.92)",
    color: "#fff",
    font: "500 13px system-ui",
    lineHeight: "1.5",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    backdropFilter: "blur(8px)",
    display: "none"
  });
  document.documentElement.appendChild(panel);

  // Custom confirm dialog (styled like the site) — no native browser popups.
  function customConfirm(message, title) {
    if (window.siteDialog && typeof window.siteDialog.confirm === 'function') {
      return window.siteDialog.confirm(message, { title: title || 'Just checking', confirmText: 'Yes, reset it', cancelText: 'Keep it', danger: true });
    }
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483005;display:grid;place-items:center;background:rgba(10,20,35,.55);padding:20px;';
      overlay.innerHTML =
        `<div style="width:min(340px,100%);background:#fff;color:#123a58;border-radius:16px;padding:20px;box-shadow:0 16px 40px rgba(0,0,0,.35);font:500 14px system-ui;line-height:1.5;">` +
        `<div style="font-weight:800;font-size:16px;margin-bottom:6px;">${title || 'Just checking'}</div>` +
        `<p style="margin:0 0 16px;">${message}</p>` +
        `<div style="display:flex;gap:8px;justify-content:flex-end;">` +
        `<button type="button" data-x="no" style="padding:9px 14px;border-radius:999px;border:1px solid #c8dceb;background:#fff;color:#123a58;font:700 13px system-ui;cursor:pointer;">Keep it</button>` +
        `<button type="button" data-x="yes" style="padding:9px 14px;border-radius:999px;border:0;background:#c0392b;color:#fff;font:700 13px system-ui;cursor:pointer;">Yes, reset it</button>` +
        `</div></div>`;
      const done = v => { overlay.remove(); resolve(v); };
      overlay.addEventListener('click', e => {
        if (e.target === overlay) done(false);
        const b = e.target.closest('[data-x]');
        if (b) done(b.dataset.x === 'yes');
      });
      document.documentElement.appendChild(overlay);
    });
  }

  function buyShop(item) {
    if (state.unlocks.includes(item.id) || state.tokens < item.cost) return;
    state.tokens -= item.cost;
    state.unlocks.push(item.id);
    // Apply the unlock straight away where it has an obvious home.
    if (item.id === 'trails') state.trails = true;
    if (item.id === 'theme-sunset') state.theme = 'sunset';
    if (item.id === 'theme-ocean') state.theme = 'ocean';
    if (item.id === 'gravity-moon') state.gravity = 'moon';
    if (item.id === 'shape-star') state.shape = 'star';
    if (item.id === 'shape-heart') state.shape = 'heart';
    saveState();
    renderPanel();
    updateHud();
  }

  function renderPanel() {
    const cost = state.upgradeCost;
    const canUpgrade = state.tokens >= cost && state.spawnBatch < 12;
    const shopRows = SHOP.map(item => {
      const owned = state.unlocks.includes(item.id);
      const afford = state.tokens >= item.cost;
      return `<div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.08);">` +
        `<div style="flex:1;"><div style="font-weight:700;">${owned ? '✓ ' : ''}${item.label}</div><div style="font-size:11px;opacity:.7;">${item.desc}</div></div>` +
        `<button data-shop="${item.id}" style="flex:none;padding:6px 10px;border:0;border-radius:8px;cursor:pointer;font-weight:700;font-size:11px;background:${owned ? '#2c4a3a' : afford ? '#228b60' : '#444'};color:#fff;" ${owned || !afford ? 'disabled' : ''}>${owned ? 'Owned' : item.cost + ' 🪙'}</button></div>`;
    }).join('');
    const themeBtns = Object.keys(THEMES).map(id => {
      const unlocked = id === 'classic' || state.unlocks.includes('theme-' + id);
      const active = state.theme === id;
      return `<button data-theme="${id}" style="flex:1;padding:7px 4px;border-radius:8px;border:1px solid ${active ? '#ffd166' : 'rgba(255,255,255,.25)'};background:${active ? '#3a2f10' : 'transparent'};color:#fff;font:700 11px system-ui;cursor:${unlocked ? 'pointer' : 'not-allowed'};opacity:${unlocked ? 1 : .45};" ${unlocked ? '' : 'disabled'}>${THEMES[id].label}${unlocked ? '' : ' 🔒'}</button>`;
    }).join('');
    const gravBtns = Object.keys(GRAVITIES).map(id => {
      const unlocked = id === 'earth' || state.unlocks.includes('gravity-' + id);
      const active = state.gravity === id;
      return `<button data-gravity="${id}" style="flex:1;padding:7px 4px;border-radius:8px;border:1px solid ${active ? '#ffd166' : 'rgba(255,255,255,.25)'};background:${active ? '#3a2f10' : 'transparent'};color:#fff;font:700 11px system-ui;cursor:${unlocked ? 'pointer' : 'not-allowed'};opacity:${unlocked ? 1 : .45};" ${unlocked ? '' : 'disabled'}>${GRAVITIES[id].label}${unlocked ? '' : ' 🔒'}</button>`;
    }).join('');
    const shapeBtns = Object.keys(SHAPES).map(id => {
      const unlocked = id === 'round' || state.unlocks.includes('shape-' + id);
      const active = state.shape === id;
      return `<button data-shape="${id}" style="flex:1;padding:7px 4px;border-radius:8px;border:1px solid ${active ? '#ffd166' : 'rgba(255,255,255,.25)'};background:${active ? '#3a2f10' : 'transparent'};color:#fff;font:700 11px system-ui;cursor:${unlocked ? 'pointer' : 'not-allowed'};opacity:${unlocked ? 1 : .45};" ${unlocked ? '' : 'disabled'}>${SHAPES[id].label}${unlocked ? '' : ' 🔒'}</button>`;
    }).join('');
    panel.innerHTML =
      `<div style="font-weight:700;font-size:14px;margin-bottom:4px;">Ball settings</div>` +
      `<div style="font-size:12px;opacity:.85;margin-bottom:10px;">Tokens: <b>${state.tokens}</b> &nbsp;·&nbsp; Collected: <b>${state.collected}</b></div>` +
      `<div style="margin-bottom:10px;">Spawn batch: <b>${state.spawnBatch}</b> balls/tick</div>` +
      `<button id="bb-upgrade" style="width:100%;padding:8px 10px;border:0;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;background:${canUpgrade ? '#228b60' : '#444'};color:#fff;margin-bottom:6px;" ${canUpgrade ? '' : 'disabled'}>` +
        `Upgrade spawn (cost ${cost} tokens)` +
      `</button>` +
      `<div style="font-size:11px;opacity:0.7;margin-bottom:12px;">Each upgrade adds 1 ball per spawn tick.</div>` +
      `<div style="font-weight:700;font-size:12px;margin-bottom:4px;">Unlocks — new looks &amp; feels</div>${shopRows}` +
      `<div style="font-weight:700;font-size:12px;margin:12px 0 6px;">Colours</div><div style="display:flex;gap:6px;">${themeBtns}</div>` +
      `<div style="font-weight:700;font-size:12px;margin:12px 0 6px;">Shape</div><div style="display:flex;gap:6px;">${shapeBtns}</div>` +
      `<div style="font-weight:700;font-size:12px;margin:12px 0 6px;">Gravity</div><div style="display:flex;gap:6px;">${gravBtns}</div>` +
      `<label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:12px;cursor:${state.unlocks.includes('trails') ? 'pointer' : 'not-allowed'};opacity:${state.unlocks.includes('trails') ? 1 : .5};">` +
        `<input type="checkbox" id="bb-trails" ${state.trails ? 'checked' : ''} ${state.unlocks.includes('trails') ? '' : 'disabled'}> Glow trails${state.unlocks.includes('trails') ? '' : ' 🔒'}</label>` +
      `<button id="bb-reset" style="width:100%;padding:8px 10px;border:1px solid rgba(255,255,255,0.25);border-radius:8px;cursor:pointer;font-weight:600;font-size:12px;background:transparent;color:#fff;margin-top:12px;">Reset progress</button>`;
    const upBtn = panel.querySelector("#bb-upgrade");
    const resetBtn = panel.querySelector("#bb-reset");
    if (upBtn && canUpgrade) {
      upBtn.addEventListener("click", () => {
        if (state.tokens >= cost && state.spawnBatch < 12) {
          state.tokens -= cost;
          state.spawnBatch++;
          state.upgradeCost = Math.round(cost * 2);
          saveState();
          renderPanel();
          updateHud();
        }
      });
    }
    panel.querySelectorAll('[data-shop]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = SHOP.find(s => s.id === btn.dataset.shop);
        if (item) buyShop(item);
      });
    });
    panel.querySelectorAll('[data-theme]').forEach(btn => {
      btn.addEventListener('click', () => { state.theme = validTheme(btn.dataset.theme); saveState(); renderPanel(); updateHud(); });
    });
    panel.querySelectorAll('[data-shape]').forEach(btn => {
      btn.addEventListener('click', () => { state.shape = validShape(btn.dataset.shape); saveState(); renderPanel(); updateHud(); });
    });
    panel.querySelectorAll('[data-gravity]').forEach(btn => {
      btn.addEventListener('click', () => { state.gravity = validGravity(btn.dataset.gravity); saveState(); renderPanel(); updateHud(); });
    });
    const trailsBox = panel.querySelector('#bb-trails');
    if (trailsBox) {
      trailsBox.addEventListener('change', () => { state.trails = trailsBox.checked; saveState(); updateHud(); });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", async () => {
        const ok = await customConfirm("Tokens, collected count, upgrades, unlocks and the pile will be cleared.", "Reset all ball progress?");
        if (!ok) return;
        state.tokens = 0;
        state.spawnBatch = 1;
        state.upgradeCost = 5;
        state.collected = 0;
        state.wave = 1;
        state.waveRemaining = BASE.waveSize;
        state.pile = [];
        state.theme = 'classic';
        state.trails = false;
        state.gravity = 'earth';
        state.shape = 'round';
        state.unlocks = [];
        balls = [];
        saveState();
        renderPanel();
        updateHud();
      });
    }
  }

  settingsBtn.addEventListener("click", () => {
    state.settingsOpen = !state.settingsOpen;
    panel.style.display = state.settingsOpen ? "block" : "none";
    if (state.settingsOpen) renderPanel();
  });

  // ---------- UI: toggle ----------
  const toggle = document.createElement("button");
  toggle.textContent = "● Fidget balls: OFF";
  toggle.setAttribute("aria-pressed", "false");
  Object.assign(toggle.style, {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    zIndex: "2147483001",
    padding: "11px 15px",
    border: "1px solid rgba(255,255,255,.3)",
    borderRadius: "30px",
    background: "#1c2030",
    color: "white",
    font: "600 13px system-ui",
    cursor: "pointer",
    boxShadow: "0 5px 18px rgba(0,0,0,.2)",
    transition: "background .15s ease"
  });
  document.documentElement.appendChild(toggle);

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function createBall() {
    const radius = random(BASE.minSize, BASE.maxSize);
    let x = random(radius, width - radius);
    let y = random(-120, -radius);
    for (let attempt = 0; attempt < 8; attempt++) {
      let hit = false;
      for (const rect of obstacles) {
        if (x + radius > rect.left && x - radius < rect.right &&
            y + radius > rect.top && y - radius < rect.bottom) {
          hit = true;
          break;
        }
      }
      if (!hit) break;
      x = random(radius, width - radius);
      y = random(-120, -radius);
    }
    return {
      x, y,
      vx: random(-1.2, 1.2),
      vy: random(0, 1.5),
      radius,
      hue: themeHue(),
      trail: [],
      squash: 1,
      resting: false,
      restFrames: 0
    };
  }

  function refreshObstacles() {
    const sy = window.scrollY || 0;
    pageHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0, height);
    const next = [];
    const selectors = [
      "button", "a[href]", "input", "select", "textarea", "summary",
      "[role='button']", "[data-bounce]", ".fidget", ".fidget-button",
      ".fidget-control", ".clickable",
      // Placed stickers are obstacles too — balls bounce off them.
      ".gplaced", "#sticker-bin"
    ];
    document.querySelectorAll(selectors.join(",")).forEach(el => {
      if (el.closest("[data-no-bounce]")) return;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" ||
          Number(style.opacity) === 0 || style.pointerEvents === "none") return;
      const rect = el.getBoundingClientRect();
      // Convert to document coordinates
      const top = rect.top + sy;
      const bottom = rect.bottom + sy;
      if (rect.width < 4 || rect.height < 4 || rect.right <= 0 ||
          rect.left >= width || bottom <= 0 || top >= pageHeight) return;
      next.push({
        left: Math.max(0, rect.left),
        right: Math.min(width, rect.right),
        top: Math.max(0, top),
        bottom: Math.min(pageHeight, bottom)
      });
    });
    const seen = new Set();
    obstacles = next.filter(r => {
      const key = `${r.left}|${r.top}|${r.right}|${r.bottom}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function collideRect(ball, rect) {
    const closestX = Math.max(rect.left, Math.min(ball.x, rect.right));
    const closestY = Math.max(rect.top, Math.min(ball.y, rect.bottom));
    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq >= ball.radius * ball.radius) return false;

    if (distSq === 0) {
      const toLeft = ball.x - rect.left;
      const toRight = rect.right - ball.x;
      const toTop = ball.y - rect.top;
      const toBottom = rect.bottom - ball.y;
      const min = Math.min(toLeft, toRight, toTop, toBottom);
      let nx = 0, ny = 0;
      if (min === toLeft) nx = -1;
      else if (min === toRight) nx = 1;
      else if (min === toTop) ny = -1;
      else ny = 1;
      const overlap = ball.radius + min;
      ball.x += nx * overlap;
      ball.y += ny * overlap;
      const vel = ball.vx * nx + ball.vy * ny;
      if (vel < 0) {
        const j = -(1 + effBounce()) * vel;
        ball.vx += j * nx;
        ball.vy += j * ny;
        const tx = -ny, ty = nx;
        const vt = ball.vx * tx + ball.vy * ty;
        ball.vx -= (1 - BASE.friction) * vt * tx;
        ball.vy -= (1 - BASE.friction) * vt * ty;
        ball.squash = 0.72;
      }
      return true;
    }

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = ball.radius - dist;

    ball.x += nx * overlap;
    ball.y += ny * overlap;

    const vel = ball.vx * nx + ball.vy * ny;
    if (vel < 0) {
      const j = -(1 + effBounce()) * vel;
      ball.vx += j * nx;
      ball.vy += j * ny;
      const tx = -ny, ty = nx;
      const vt = ball.vx * tx + ball.vy * ty;
      ball.vx -= (1 - BASE.friction) * vt * tx;
      ball.vy -= (1 - BASE.friction) * vt * ty;
      ball.squash = 0.72;
    }
    return true;
  }

  function collideBalls(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distSq = dx * dx + dy * dy;
    const minDist = a.radius + b.radius;
    if (distSq >= minDist * minDist || distSq === 0) return false;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;

    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;

    const dvx = b.vx - a.vx;
    const dvy = b.vy - a.vy;
    const vel = dvx * nx + dvy * ny;
    if (vel < 0) {
      const e = 0.85;
      const j = -(1 + e) * vel * 0.5;
      a.vx -= j * nx;
      a.vy -= j * ny;
      b.vx += j * nx;
      b.vy += j * ny;
      a.squash = 0.85;
      b.squash = 0.85;
    }
    return true;
  }

  function collectBall(ball) {
    state.collected++;
    state.tokens++;
    if (state.pile.length < BASE.maxPile) {
      state.pile.push({ x: ball.x, y: pageHeight - ball.radius, r: ball.radius, hue: ball.hue });
    }
    saveState();
  }

  function update(ball, dt) {
    const step = dt / 16.667;

    ball.vy += effGravity() * step;
    ball.vx *= Math.pow(BASE.airDamp, step);
    ball.vy *= Math.pow(BASE.airDamp, step);

    ball.x += ball.vx * step;
    ball.y += ball.vy * step;

    ball.squash += (1 - ball.squash) * (1 - Math.pow(0.7, step));

    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > BASE.maxSpeed) {
      const s = BASE.maxSpeed / speed;
      ball.vx *= s;
      ball.vy *= s;
    }

    // Walls
    if (ball.x < ball.radius) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx) * BASE.wallBounce;
      ball.squash = 0.78;
    }
    if (ball.x > width - ball.radius) {
      ball.x = width - ball.radius;
      ball.vx = -Math.abs(ball.vx) * BASE.wallBounce;
      ball.squash = 0.78;
    }
    if (ball.y < ball.radius) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy) * BASE.wallBounce;
      ball.squash = 0.78;
    }

    // Obstacles
    for (let pass = 0; pass < 3; pass++) {
      for (const rect of obstacles) {
        if (ball.x + ball.radius < rect.left || ball.x - ball.radius > rect.right ||
            ball.y + ball.radius < rect.top || ball.y - ball.radius > rect.bottom) continue;
        collideRect(ball, rect);
      }
    }

    // Ground (bottom of page)
    if (ball.y >= pageHeight - ball.radius - 2) {
      ball.y = pageHeight - ball.radius;
      if (Math.abs(ball.vy) < 0.5) {
        ball.vy = 0;
        ball.vx *= BASE.groundDamp;
        ball.resting = true;
        ball.restFrames++;
        if (ball.restFrames > 8) {
          collectBall(ball);
          ball._collected = true;
        }
      } else {
        ball.vy = -Math.abs(ball.vy) * BASE.wallBounce;
        ball.squash = 0.7;
        ball.resting = false;
        ball.restFrames = 0;
      }
    } else {
      ball.resting = false;
      ball.restFrames = 0;
    }

    if (Math.abs(ball.vx) < 0.02 && Math.abs(ball.vy) < 0.02 && !ball.resting) {
      ball.vx += random(-0.03, 0.03);
    }
  }

  function drawShapePath(r) {
    if (state.shape === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r : r * 0.45;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (state.shape === 'heart') {
      ctx.beginPath();
      ctx.moveTo(0, r * 0.35);
      ctx.bezierCurveTo(-r * 1.1, -r * 0.55, -r * 0.45, -r * 1.05, 0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.45, -r * 1.05, r * 1.1, -r * 0.55, 0, r * 0.35);
      ctx.closePath();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
  }

  function drawBall(ball) {
    const r = ball.radius;
    const vx = ball.x;
    const vy = ball.y - scrollY;
    // Glow trail (unlocked upgrade): fading ghosts of where the ball was.
    if (state.trails && ball.trail && ball.trail.length > 1) {
      for (let i = 0; i < ball.trail.length; i++) {
        const p = ball.trail[i];
        const a = (i + 1) / ball.trail.length;
        ctx.beginPath();
        ctx.arc(p.x, p.y - scrollY, r * (0.35 + 0.55 * a), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${ball.hue}, 90%, 65%, ${0.28 * a})`;
        ctx.fill();
      }
    }
    const gradient = ctx.createRadialGradient(
      vx - r * 0.35, vy - r * 0.4, 0,
      vx, vy, r
    );
    gradient.addColorStop(0, `hsl(${ball.hue}, 95%, 92%)`);
    gradient.addColorStop(0.5, `hsl(${ball.hue}, 85%, 62%)`);
    gradient.addColorStop(1, `hsl(${ball.hue}, 80%, 40%)`);

    ctx.save();
    ctx.translate(vx, vy);
    ctx.scale(1, ball.squash);
    drawShapePath(r);
    ctx.fillStyle = gradient;
    ctx.shadowColor = `hsl(${ball.hue}, 90%, 60%)`;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (state.shape === 'round') {
      ctx.beginPath();
      ctx.arc(-r * 0.25, -r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPile() {
    for (const b of state.pile) {
      const r = b.r;
      const px = b.x;
      const py = b.y - scrollY;
      // skip if off-screen
      if (py + r < 0 || py - r > height) continue;
      const gradient = ctx.createRadialGradient(px - r * 0.35, py - r * 0.4, 0, px, py, r);
      gradient.addColorStop(0, `hsl(${b.hue}, 95%, 92%)`);
      gradient.addColorStop(0.5, `hsl(${b.hue}, 85%, 62%)`);
      gradient.addColorStop(1, `hsl(${b.hue}, 80%, 40%)`);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.shadowColor = `hsl(${b.hue}, 90%, 60%)`;
      ctx.shadowBlur = 4;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function loop(time) {
    animation = null;
    if (!enabled || document.hidden) return;

    scrollY = window.scrollY || 0;
    pageHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0, height);

    const dt = lastTime ? Math.min(time - lastTime, 32) : 16.667;
    lastTime = time;

    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    // Spawn
    spawnTimer += dt;
    if (spawnTimer >= BASE.spawnRate && state.waveRemaining > 0 && balls.length < BASE.ballCount) {
      spawnTimer = 0;
      const n = Math.min(state.spawnBatch, state.waveRemaining, BASE.ballCount - balls.length);
      for (let i = 0; i < n; i++) {
        balls.push(createBall());
        state.waveRemaining--;
      }
      saveState();
    }

    // Physics substeps
    const subDt = dt / BASE.substeps;
    for (let s = 0; s < BASE.substeps; s++) {
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          collideBalls(balls[i], balls[j]);
        }
      }
      for (const ball of balls) {
        if (!ball._collected) update(ball, subDt);
      }
    }

    // Record trail points for the glow-trail upgrade.
    if (state.trails) {
      for (const ball of balls) {
        if (!ball.trail) ball.trail = [];
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 8) ball.trail.shift();
      }
    }

    // Remove collected balls and any that escaped
    for (let i = balls.length - 1; i >= 0; i--) {
      if (balls[i]._collected || balls[i].y > pageHeight + 100) balls.splice(i, 1);
    }

    // Draw pile then balls
    drawPile();
    for (const ball of balls) drawBall(ball);

    // New wave?
    if (state.waveRemaining <= 0 && balls.length === 0) {
      state.wave++;
      state.waveRemaining = BASE.waveSize;
      state.tokens += 5; // wave completion bonus
      saveState();
    }

    updateHud();
    animation = requestAnimationFrame(loop);
  }

  function start() {
    if (!enabled || animation || document.hidden) return;
    lastTime = 0;
    animation = requestAnimationFrame(loop);
  }

  function stop() {
    if (animation) { cancelAnimationFrame(animation); animation = null; }
    if (ctx) ctx.clearRect(0, 0, width, height);
  }

  toggle.addEventListener("click", () => {
    enabled = !enabled;
    toggle.textContent = enabled ? "● Fidget balls: ON" : "● Fidget balls: OFF";
    toggle.style.background = enabled ? "#228b60" : "#1c2030";
    toggle.setAttribute("aria-pressed", String(enabled));
    settingsBtn.style.display = enabled ? "block" : "none";
    if (!enabled) {
      panel.style.display = "none";
      state.settingsOpen = false;
    }
    if (enabled) {
      ensureCanvas();
      balls = [];
      // Spawn initial batch
      const n = Math.min(state.spawnBatch, state.waveRemaining, BASE.ballCount);
      for (let i = 0; i < n; i++) {
        balls.push(createBall());
        state.waveRemaining--;
      }
      saveState();
      start();
    } else {
      balls = [];
      stop();
      removeCanvas();
    }
    updateHud();
  });

  window.addEventListener("resize", resize);
  window.addEventListener("scroll", () => {
    scrollY = window.scrollY || 0;
    const now = performance.now();
    if (now - obstacleRefreshTimer < 150) return;
    obstacleRefreshTimer = now;
    refreshObstacles();
  }, { passive: true, capture: true });

  const observer = new MutationObserver(() => {
    const now = performance.now();
    if (now - obstacleRefreshTimer < 200) return;
    obstacleRefreshTimer = now;
    refreshObstacles();
  });
  observer.observe(document.body, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ["class", "style", "hidden"]
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else start();
  });

  resize();
  refreshObstacles();
  updateHud();

  // Live sync: reload state when another user changes it.
  (function connectSync() {
    const user = localStorage.getItem('charlotte-user');
    if (!user) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket = null, timer = null;
    function open() {
      socket = new WebSocket(`${protocol}//${location.host}/api/question-room?user=${encodeURIComponent(user)}&sessionDate=2000-01-05`);
      socket.onopen = () => { timer = setInterval(() => { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' })); }, 20000); };
      socket.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } if (m.type === 'refresh') { loadState().then(() => { try { updateHud(); } catch (e) {} }).catch(()=>{}); } };
      socket.onclose = () => { clearInterval(timer); setTimeout(open, 3000); };
    }
    open();
  })();

  window.uiBouncyBalls = {
    refresh: refreshObstacles,
    pause() {
      enabled = false;
      balls = [];
      stop();
      toggle.textContent = "● Fidget balls: OFF";
      toggle.style.background = "#1c2030";
      settingsBtn.style.display = "none";
      panel.style.display = "none";
    },
    destroy() {
      stop();
      observer.disconnect();
      removeCanvas();
      toggle.remove();
      hud.remove();
      settingsBtn.remove();
      panel.remove();
      delete window.uiBouncyBalls;
      delete window.__bouncyBallsLoaded;
    }
  };
})();
