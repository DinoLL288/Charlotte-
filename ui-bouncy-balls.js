(() => {
  "use strict";

  if (window.__bouncyBallsLoaded) return;
  window.__bouncyBallsLoaded = true;

  // SETTINGS
  const SETTINGS = {
    ballCount: 35,
    minSize: 4,
    maxSize: 8,
    gravity: 0.22,
    bounce: 0.74,        // coefficient of restitution for obstacles
    wallBounce: 0.72,    // coefficient of restitution for screen edges
    airDamp: 0.992,      // per-frame air resistance
    groundDamp: 0.86,    // extra damping when resting on a surface
    spawnRate: 180,
    substeps: 4,         // physics substeps per frame (stability)
    maxSpeed: 18,        // clamp to prevent tunneling
    friction: 0.88       // tangential friction on contact
  };

  let enabled = false;
  let balls = [];
  let obstacles = [];
  let animation = null;
  let lastTime = 0;
  let spawnTimer = 0;
  let obstacleRefreshTimer = 0;

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

  function resize() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refreshObstacles();
  }

  // Floating ON/OFF button
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
    const radius = random(SETTINGS.minSize, SETTINGS.maxSize);
    // Try to spawn away from obstacles
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
      x,
      y,
      vx: random(-1.2, 1.2),
      vy: random(0, 1.5),
      radius,
      hue: random(0, 360),
      squash: 1,
      resting: false
    };
  }

  // Find interactive elements currently visible on screen
  function refreshObstacles() {
    const next = [];
    const selectors = [
      "button",
      "a[href]",
      "input",
      "select",
      "textarea",
      "summary",
      "[role='button']",
      "[data-bounce]",
      ".fidget",
      ".fidget-button",
      ".fidget-control",
      ".clickable"
    ];

    document.querySelectorAll(selectors.join(",")).forEach(el => {
      if (el.closest("[data-no-bounce]")) return;

      const style = getComputedStyle(el);

      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        style.pointerEvents === "none"
      ) return;

      const rect = el.getBoundingClientRect();

      if (
        rect.width < 4 ||
        rect.height < 4 ||
        rect.right <= 0 ||
        rect.left >= width ||
        rect.bottom <= 0 ||
        rect.top >= height
      ) return;

      // Merge tiny overlaps by pushing a clamped rect
      next.push({
        left: Math.max(0, rect.left),
        right: Math.min(width, rect.right),
        top: Math.max(0, rect.top),
        bottom: Math.min(height, rect.bottom)
      });
    });

    // De-duplicate identical rects
    const seen = new Set();
    obstacles = next.filter(r => {
      const key = `${r.left}|${r.top}|${r.right}|${r.bottom}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Resolve a single ball-vs-rectangle collision with impulse + friction
  function collideRect(ball, rect) {
    const closestX = Math.max(rect.left, Math.min(ball.x, rect.right));
    const closestY = Math.max(rect.top, Math.min(ball.y, rect.bottom));

    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq >= ball.radius * ball.radius) return false;
    if (distSq === 0) {
      // Ball center inside rect — push out via nearest edge
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
        const j = -(1 + SETTINGS.bounce) * vel;
        ball.vx += j * nx;
        ball.vy += j * ny;
        // tangential friction
        const tx = -ny, ty = nx;
        const vt = ball.vx * tx + ball.vy * ty;
        ball.vx -= (1 - SETTINGS.friction) * vt * tx;
        ball.vy -= (1 - SETTINGS.friction) * vt * ty;
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
      const j = -(1 + SETTINGS.bounce) * vel;
      ball.vx += j * nx;
      ball.vy += j * ny;
      const tx = -ny, ty = nx;
      const vt = ball.vx * tx + ball.vy * ty;
      ball.vx -= (1 - SETTINGS.friction) * vt * tx;
      ball.vy -= (1 - SETTINGS.friction) * vt * ty;
      ball.squash = 0.72;
    }
    return true;
  }

  // Ball-ball collision (equal mass, elastic-ish)
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

    // Separate
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;

    // Relative velocity along normal
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

  function update(ball, dt) {
    const step = dt / 16.667;

    ball.vy += SETTINGS.gravity * step;

    // Air resistance
    ball.vx *= Math.pow(SETTINGS.airDamp, step);
    ball.vy *= Math.pow(SETTINGS.airDamp, step);

    ball.x += ball.vx * step;
    ball.y += ball.vy * step;

    // Squash recovery (exponential ease)
    ball.squash += (1 - ball.squash) * (1 - Math.pow(0.7, step));

    // Clamp speed
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > SETTINGS.maxSpeed) {
      const s = SETTINGS.maxSpeed / speed;
      ball.vx *= s;
      ball.vy *= s;
    }

    // Left and right screen edges
    if (ball.x < ball.radius) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx) * SETTINGS.wallBounce;
      ball.squash = 0.78;
    }
    if (ball.x > width - ball.radius) {
      ball.x = width - ball.radius;
      ball.vx = -Math.abs(ball.vx) * SETTINGS.wallBounce;
      ball.squash = 0.78;
    }

    // Top edge
    if (ball.y < ball.radius) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy) * SETTINGS.wallBounce;
      ball.squash = 0.78;
    }

    // Bounce off visible UI elements (multiple passes for stability)
    for (let pass = 0; pass < 3; pass++) {
      for (const rect of obstacles) {
        if (
          ball.x + ball.radius < rect.left ||
          ball.x - ball.radius > rect.right ||
          ball.y + ball.radius < rect.top ||
          ball.y - ball.radius > rect.bottom
        ) continue;
        collideRect(ball, rect);
      }
    }

    // Ground damping when resting
    if (ball.y > height - ball.radius - 1) {
      ball.y = height - ball.radius;
      if (Math.abs(ball.vy) < 0.6) {
        ball.vy = 0;
        ball.vx *= SETTINGS.groundDamp;
        ball.resting = true;
      } else {
        ball.vy = -Math.abs(ball.vy) * SETTINGS.wallBounce;
        ball.squash = 0.7;
        ball.resting = false;
      }
    } else {
      ball.resting = false;
    }

    // Tiny nudge to keep things alive, only when nearly still
    if (Math.abs(ball.vx) < 0.02 && Math.abs(ball.vy) < 0.02 && !ball.resting) {
      ball.vx += random(-0.03, 0.03);
    }
  }

  function draw(ball) {
    const r = ball.radius;

    const gradient = ctx.createRadialGradient(
      ball.x - r * 0.35,
      ball.y - r * 0.4,
      0,
      ball.x,
      ball.y,
      r
    );

    gradient.addColorStop(0, `hsl(${ball.hue}, 95%, 92%)`);
    gradient.addColorStop(0.5, `hsl(${ball.hue}, 85%, 62%)`);
    gradient.addColorStop(1, `hsl(${ball.hue}, 80%, 40%)`);

    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.scale(1, ball.squash);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.shadowColor = `hsl(${ball.hue}, 90%, 60%)`;
    ctx.shadowBlur = 8;
    ctx.fill();

    // Subtle highlight
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();

    ctx.restore();
  }

  function loop(time) {
    animation = null;

    if (!enabled || document.hidden) return;

    const dt = lastTime
      ? Math.min(time - lastTime, 32)
      : 16.667;

    lastTime = time;

    ctx.clearRect(0, 0, width, height);

    spawnTimer += dt;

    if (
      spawnTimer >= SETTINGS.spawnRate &&
      balls.length < SETTINGS.ballCount
    ) {
      spawnTimer = 0;
      balls.push(createBall());
    }

    const subDt = dt / SETTINGS.substeps;
    for (let s = 0; s < SETTINGS.substeps; s++) {
      // Ball-ball collisions first
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          collideBalls(balls[i], balls[j]);
        }
      }
      // Then update each ball
      for (const ball of balls) {
        update(ball, subDt);
      }
    }

    for (const ball of balls) {
      draw(ball);
    }

    // Remove balls that fall off screen
    for (let i = balls.length - 1; i >= 0; i--) {
      if (balls[i].y > height + 40) {
        balls.splice(i, 1);
      }
    }

    animation = requestAnimationFrame(loop);
  }

  function start() {
    if (!enabled || animation || document.hidden) return;

    lastTime = 0;
    animation = requestAnimationFrame(loop);
  }

  function stop() {
    if (animation) {
      cancelAnimationFrame(animation);
      animation = null;
    }

    ctx.clearRect(0, 0, width, height);
  }

  // Toggle effect
  toggle.addEventListener("click", () => {
    enabled = !enabled;

    toggle.textContent = enabled
      ? "● Fidget balls: ON"
      : "● Fidget balls: OFF";

    toggle.style.background = enabled
      ? "#228b60"
      : "#1c2030";

    toggle.setAttribute("aria-pressed", String(enabled));

    if (enabled) {
      balls = [];

      for (let i = 0; i < 12; i++) {
        balls.push(createBall());
      }

      start();
    } else {
      balls = [];
      stop();
    }
  });

  // Update when the page changes (throttled obstacle refresh)
  window.addEventListener("resize", resize);

  window.addEventListener(
    "scroll",
    () => {
      const now = performance.now();
      if (now - obstacleRefreshTimer < 150) return;
      obstacleRefreshTimer = now;
      refreshObstacles();
    },
    { passive: true, capture: true }
  );

  const observer = new MutationObserver(() => {
    const now = performance.now();
    if (now - obstacleRefreshTimer < 200) return;
    obstacleRefreshTimer = now;
    refreshObstacles();
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden"]
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });

  resize();
  refreshObstacles();

  // Optional manual controls
  window.uiBouncyBalls = {
    refresh: refreshObstacles,

    pause() {
      enabled = false;
      balls = [];
      stop();
      toggle.textContent = "● Fidget balls: OFF";
      toggle.style.background = "#1c2030";
    },

    destroy() {
      stop();
      observer.disconnect();
      canvas.remove();
      toggle.remove();

      delete window.uiBouncyBalls;
      delete window.__bouncyBallsLoaded;
    }
  };
})();
