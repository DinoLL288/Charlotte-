
(() => {
  "use strict";

  if (window.__bouncyBallsLoaded) return;
  window.__bouncyBallsLoaded = true;

  // SETTINGS
  const SETTINGS = {
    ballCount: 35,
    minSize: 4,
    maxSize: 8,
    gravity: 0.24,
    bounce: 0.78,
    spawnRate: 180
  };

  let enabled = false;
  let balls = [];
  let obstacles = [];
  let animation = null;
  let lastTime = 0;
  let spawnTimer = 0;

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
    boxShadow: "0 5px 18px rgba(0,0,0,.2)"
  });

  document.documentElement.appendChild(toggle);

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function createBall() {
    const radius = random(
      SETTINGS.minSize,
      SETTINGS.maxSize
    );

    return {
      x: random(radius, width - radius),
      y: random(-100, -radius),
      vx: random(-1.5, 1.5),
      vy: random(0, 2),
      radius,
      hue: random(0, 360),
      squash: 1
    };
  }

  // Find interactive elements currently visible on screen
  function refreshObstacles() {
    obstacles = [];

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
        Number(style.opacity) === 0
      ) return;

      const rect = el.getBoundingClientRect();

      if (
        rect.width < 2 ||
        rect.height < 2 ||
        rect.right <= 0 ||
        rect.left >= width ||
        rect.bottom <= 0 ||
        rect.top >= height
      ) return;

      obstacles.push({
        left: Math.max(0, rect.left),
        right: Math.min(width, rect.right),
        top: Math.max(0, rect.top),
        bottom: Math.min(height, rect.bottom)
      });
    });
  }

  // Ball-to-rectangle collision
  function collide(ball, rect) {
    const closestX = Math.max(
      rect.left,
      Math.min(ball.x, rect.right)
    );

    const closestY = Math.max(
      rect.top,
      Math.min(ball.y, rect.bottom)
    );

    const dx = ball.x - closestX;
    const dy = ball.y - closestY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance >= ball.radius) return;

    let nx, ny;

    if (distance > 0.001) {
      nx = dx / distance;
      ny = dy / distance;
    } else {
      const distances = [
        { d: Math.abs(ball.x - rect.left), x: -1, y: 0 },
        { d: Math.abs(rect.right - ball.x), x: 1, y: 0 },
        { d: Math.abs(ball.y - rect.top), x: 0, y: -1 },
        { d: Math.abs(rect.bottom - ball.y), x: 0, y: 1 }
      ];

      distances.sort((a, b) => a.d - b.d);

      nx = distances[0].x;
      ny = distances[0].y;
    }

    const overlap = ball.radius - distance;

    ball.x += nx * overlap;
    ball.y += ny * overlap;

    const velocity = ball.vx * nx + ball.vy * ny;

    if (velocity < 0) {
      ball.vx -= (1 + SETTINGS.bounce) * velocity * nx;
      ball.vy -= (1 + SETTINGS.bounce) * velocity * ny;

      ball.squash = 0.7;
    }
  }

  function update(ball, dt) {
    const step = dt / 16.667;

    ball.vy += SETTINGS.gravity * step;

    ball.x += ball.vx * step;
    ball.y += ball.vy * step;

    ball.squash += (1 - ball.squash) * 0.2;

    // Left and right screen edges
    if (ball.x < ball.radius) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx) * 0.8;
    }

    if (ball.x > width - ball.radius) {
      ball.x = width - ball.radius;
      ball.vx = -Math.abs(ball.vx) * 0.8;
    }

    // Top and bottom edges
    if (ball.y < ball.radius) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy) * 0.8;
    }

    // Bounce off visible UI elements
    for (const rect of obstacles) {
      if (
        ball.x + ball.radius < rect.left ||
        ball.x - ball.radius > rect.right ||
        ball.y + ball.radius < rect.top ||
        ball.y - ball.radius > rect.bottom
      ) continue;

      collide(ball, rect);
    }

    // Tiny random movement
    if (Math.abs(ball.vx) < 0.05) {
      ball.vx += random(-0.04, 0.04);
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

    gradient.addColorStop(
      0,
      `hsl(${ball.hue}, 95%, 90%)`
    );

    gradient.addColorStop(
      0.5,
      `hsl(${ball.hue}, 85%, 60%)`
    );

    gradient.addColorStop(
      1,
      `hsl(${ball.hue}, 80%, 38%)`
    );

    ctx.save();

    ctx.translate(ball.x, ball.y);
    ctx.scale(1, ball.squash);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);

    ctx.fillStyle = gradient;
    ctx.shadowColor = `hsl(${ball.hue}, 90%, 60%)`;
    ctx.shadowBlur = 6;

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

    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];

      update(ball, dt);
      draw(ball);

      // Remove balls after they leave the screen
      if (ball.y > height + 30) {
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

  // Update when the page changes
  window.addEventListener("resize", resize);

  window.addEventListener(
    "scroll",
    refreshObstacles,
    { passive: true, capture: true }
  );

  const observer = new MutationObserver(() => {
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
