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
    pile: []              // rendered resting balls [{x,y,r,hue}]
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          state.tokens = Number.isFinite(parsed.tokens) ? Math.max(0, parsed.tokens) : 0;
          state.spawnBatch = Number.isFinite(parsed.spawnBatch) ? Math.max(1, Math.min(12, parsed.spawnBatch)) : 1;
          state.upgradeCost = Number.isFinite(parsed.upgradeCost) ? Math.max(5, parsed.upgradeCost) : 5;
          state.collected = Number.isFinite(parsed.collected) ? Math.max(0, parsed.collected) : 0;
          state.wave = Number.isFinite(parsed.wave) ? Math.max(1, parsed.wave) : 1;
          state.waveRemaining = Number.isFinite(parsed.waveRemaining) ? Math.max(0, Math.min(BASE.waveSize, parsed.waveRemaining)) : BASE.waveSize;
          if (Array.isArray(parsed.pile)) {
            state.pile = parsed.pile.filter(b => b && Number.isFinite(b.x) && Number.isFinite(b.y)).slice(0, BASE.maxPile);
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tokens: state.tokens,
        spawnBatch: state.spawnBatch,
        upgradeCost: state.upgradeCost,
        collected: state.collected,
        wave: state.wave,
        waveRemaining: state.waveRemaining,
        pile: state.pile.slice(0, BASE.maxPile)
      }));
    } catch (e) { /* ignore */ }
  }

  loadState();

  let enabled = false;
  let balls = [];          // live physics balls
  let obstacles = [];
  let animation = null;
  let lastTime = 0;
  let spawnTimer = 0;
  let obstacleRefreshTimer = 0;
  let collecting = 0;      // balls currently being collected this frame

  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "2147483000"
  });
  document.documentElement.appendChild(canvas);

  const ctx = canvas.getContext("2d");

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
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  function updateHud() {
    if (!enabled) { hud.style.display = "none"; return; }
    hud.style.display = "block";
    hud.innerHTML =
      `<div>Left to fall: <b>${state.waveRemaining}</b></div>` +
      `<div>Collected: <b>${state.collected}</b></div>` +
      `<div>Tokens: <b>${state.tokens}</b></div>` +
      `<div>Spawn: <b>${state.spawnBatch}</b> &nbsp; Wave <b>${state.wave}</b></div>`;
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

  function renderPanel() {
    const cost = state.upgradeCost;
    const canUpgrade = state.tokens >= cost && state.spawnBatch < 12;
    panel.innerHTML =
      `<div style="font-weight:700;font-size:14px;margin-bottom:8px;">Ball settings</div>` +
      `<div style="margin-bottom:10px;">Spawn batch: <b>${state.spawnBatch}</b> balls/tick</div>` +
      `<button id="bb-upgrade" style="width:100%;padding:8px 10px;border:0;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;background:${canUpgrade ? '#228b60' : '#444'};color:#fff;margin-bottom:6px;" ${canUpgrade ? '' : 'disabled'}>` +
        `Upgrade spawn (cost ${cost} tokens)` +
      `</button>` +
      `<div style="font-size:11px;opacity:0.7;margin-bottom:10px;">Each upgrade adds 1 ball per spawn tick. Tokens earned by collecting balls.</div>` +
      `<button id="bb-reset" style="width:100%;padding:8px 10px;border:1px solid rgba(255,255,255,0.25);border-radius:8px;cursor:pointer;font-weight:600;font-size:12px;background:transparent;color:#fff;">Reset progress</button>`;
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
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("Reset all ball progress? Tokens, collected count, upgrades and pile will be cleared.")) {
          state.tokens = 0;
          state.spawnBatch = 1;
          state.upgradeCost = 5;
          state.collected = 0;
          state.wave = 1;
          state.waveRemaining = BASE.waveSize;
          state.pile = [];
          balls = [];
          saveState();
          renderPanel();
          updateHud();
        }
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
      hue: random(0, 360),
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
      ".fidget-control", ".clickable"
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
        const j = -(1 + BASE.bounce) * vel;
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
      const j = -(1 + BASE.bounce) * vel;
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

    ball.vy += BASE.gravity * step;
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

  function drawBall(ball) {
    const r = ball.radius;
    const vx = ball.x;
    const vy = ball.y - scrollY;
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
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.shadowColor = `hsl(${ball.hue}, 90%, 60%)`;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
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
    ctx.clearRect(0, 0, width, height);
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
  observer.observe(document.documentElement, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ["class", "style", "hidden"]
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else start();
  });

  resize();
  refreshObstacles();
  updateHud();

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
      canvas.remove();
      toggle.remove();
      hud.remove();
      settingsBtn.remove();
      panel.remove();
      delete window.uiBouncyBalls;
      delete window.__bouncyBallsLoaded;
    }
  };
})();
