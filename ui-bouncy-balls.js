from pathlib import Path

code = r'''/*
 * ui-bouncy-balls.js
 * A self-contained falling-balls effect for visible UI elements.
 *
 * Add to a page with:
 *   <script src="ui-bouncy-balls.js" defer></script>
 *
 * Optional element targeting:
 *   - Automatically detects buttons, links, inputs, selects, textareas,
 *     summary elements, [role="button"], and common fidget/control classes.
 *   - Add data-bounce to any other element you want balls to bounce on.
 *   - Add data-no-bounce to exclude an element.
 *
 * No libraries or HTML changes required.
 */
(() => {
  "use strict";

  if (window.__uiBouncyBallsLoaded) return;
  window.__uiBouncyBallsLoaded = true;

  const CONFIG = {
    ballCount: 34,
    minRadius: 3,
    maxRadius: 7,
    gravity: 0.22,
    bounce: 0.72,
    wallBounce: 0.78,
    airDrag: 0.999,
    maxSpeed: 12,
    spawnInterval: 170,
    maxFrameDelta: 32,
    selectors: [
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
      ".control",
      ".ui-control",
      ".clickable"
    ].join(",")
  };

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: "2147483000",
    pointerEvents: "none",
    display: "block"
  });

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  document.documentElement.appendChild(canvas);

  let width = 0;
  let height = 0;
  let dpr = 1;
  let lastTime = 0;
  let spawnTimer = 0;
  let animationId = 0;
  let paused = false;
  let obstacles = [];
  let balls = [];
  let resizeObserver = null;
  let mutationObserver = null;
  let refreshQueued = false;

  const random = (min, max) => Math.random() * (max - min) + min;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refreshObstacles();
  }

  function isVisibleElement(element) {
    if (!(element instanceof Element)) return false;
    if (element.closest("[data-no-bounce]")) return false;

    const style = getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0 ||
      style.pointerEvents === "none"
    ) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;

    // Only elements with some area inside the current viewport are included.
    return (
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < width &&
      rect.top < height
    );
  }

  function refreshObstacles() {
    obstacles = [];
    const found = document.querySelectorAll(CONFIG.selectors);

    for (const element of found) {
      if (!isVisibleElement(element)) continue;

      const rect = element.getBoundingClientRect();
      obstacles.push({
        element,
        left: Math.max(0, rect.left),
        right: Math.min(width, rect.right),
        top: Math.max(0, rect.top),
        bottom: Math.min(height, rect.bottom)
      });
    }
  }

  function queueObstacleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refreshObstacles();
    });
  }

  function makeBall(startAtTop = true) {
    const radius = random(CONFIG.minRadius, CONFIG.maxRadius);
    return {
      x: random(radius, Math.max(radius + 1, width - radius)),
      y: startAtTop ? random(-height * 0.45, -radius) : random(0, height),
      vx: random(-1.5, 1.5),
      vy: random(0.2, 1.8),
      radius,
      rotation: random(0, Math.PI * 2),
      spin: random(-0.08, 0.08),
      hue: random(0, 360),
      squash: 1
    };
  }

  function spawnBall() {
    if (balls.length < CONFIG.ballCount) balls.push(makeBall(true));
  }

  function circleRectCollision(ball, rect) {
    const closestX = clamp(ball.x, rect.left, rect.right);
    const closestY = clamp(ball.y, rect.top, rect.bottom);
    const dx = ball.x - closestX;
    const dy = ball.y - closestY;
    const distanceSquared = dx * dx + dy * dy;
    const radiusSquared = ball.radius * ball.radius;

    if (distanceSquared >= radiusSquared) return;

    // Resolve along the nearest side if the centre is inside the rectangle.
    let nx = 0;
    let ny = 0;
    let distance = Math.sqrt(distanceSquared);

    if (distance > 0.0001) {
      nx = dx / distance;
      ny = dy / distance;
    } else {
      const toLeft = Math.abs(ball.x - rect.left);
      const toRight = Math.abs(rect.right - ball.x);
      const toTop = Math.abs(ball.y - rect.top);
      const toBottom = Math.abs(rect.bottom - ball.y);
      const smallest = Math.min(toLeft, toRight, toTop, toBottom);

      if (smallest === toLeft) nx = -1;
      else if (smallest === toRight) nx = 1;
      else if (smallest === toTop) ny = -1;
      else ny = 1;

      distance = -smallest;
    }

    const overlap = ball.radius - distance;
    ball.x += nx * overlap;
    ball.y += ny * overlap;

    const velocityAlongNormal = ball.vx * nx + ball.vy * ny;
    if (velocityAlongNormal < 0) {
      const impulse = (1 + CONFIG.bounce) * velocityAlongNormal;
      ball.vx -= impulse * nx;
      ball.vy -= impulse * ny;
      ball.squash = 0.72;
    }
  }

  function updateBall(ball, dt) {
    const step = dt / 16.667;
    ball.vy += CONFIG.gravity * step;
    ball.vx *= Math.pow(CONFIG.airDrag, step);
    ball.vy *= Math.pow(CONFIG.airDrag, step);

    ball.vx = clamp(ball.vx, -CONFIG.maxSpeed, CONFIG.maxSpeed);
    ball.vy = clamp(ball.vy, -CONFIG.maxSpeed, CONFIG.maxSpeed);

    const oldY = ball.y;
    ball.x += ball.vx * step;
    ball.y += ball.vy * step;
    ball.rotation += ball.spin * step;
    ball.squash += (1 - ball.squash) * 0.18;

    // Screen edges.
    if (ball.x - ball.radius < 0) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx) * CONFIG.wallBounce;
    } else if (ball.x + ball.radius > width) {
      ball.x = width - ball.radius;
      ball.vx = -Math.abs(ball.vx) * CONFIG.wallBounce;
    }

    if (ball.y - ball.radius < 0) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy) * CONFIG.wallBounce;
    }

    // Collide only with elements currently intersecting the viewport.
    for (const rect of obstacles) {
      if (
        ball.x + ball.radius < rect.left ||
        ball.x - ball.radius > rect.right ||
        ball.y + ball.radius < rect.top ||
        ball.y - ball.radius > rect.bottom
      ) continue;

      circleRectCollision(ball, rect);
    }

    // A small amount of sideways movement keeps the balls lively.
    if (Math.abs(ball.vx) < 0.08 && ball.y > oldY) {
      ball.vx += random(-0.035, 0.035);
    }
  }

  function drawBall(ball) {
    const r = ball.radius;
    const gradient = ctx.createRadialGradient(
      ball.x - r * 0.35,
      ball.y - r * 0.4,
      r * 0.12,
      ball.x,
      ball.y,
      r * 1.2
    );

    gradient.addColorStop(0, `hsla(${ball.hue}, 95%, 88%, 1)`);
    gradient.addColorStop(0.38, `hsla(${ball.hue}, 88%, 62%, 1)`);
    gradient.addColorStop(1, `hsla(${ball.hue}, 82%, 38%, 1)`);

    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.rotation);
    ctx.scale(1 + (1 - ball.squash) * 0.35, ball.squash);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.shadowColor = `hsla(${ball.hue}, 90%, 55%, 0.28)`;
    ctx.shadowBlur = 5;
    ctx.fill();

    // Tiny glossy highlight.
    ctx.beginPath();
    ctx.arc(-r * 0.32, -r * 0.34, Math.max(0.8, r * 0.22), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.shadowBlur = 0;
    ctx.fill();
    ctx.restore();
  }

  function frame(time) {
    animationId = 0;
    if (paused) return;

    const dt = lastTime ? Math.min(time - lastTime, CONFIG.maxFrameDelta) : 16.667;
    lastTime = time;

    ctx.clearRect(0, 0, width, height);

    spawnTimer += dt;
    while (spawnTimer >= CONFIG.spawnInterval) {
      spawnTimer -= CONFIG.spawnInterval;
      spawnBall();
    }

    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      updateBall(ball, dt);
      drawBall(ball);

      // Recycle balls that have fallen well below the visible screen.
      if (ball.y - ball.radius > height + 30) {
        balls.splice(i, 1);
      }
    }

    animationId = requestAnimationFrame(frame);
  }

  function start() {
    if (paused || animationId) return;
    lastTime = 0;
    animationId = requestAnimationFrame(frame);
  }

  function stop() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = 0;
    ctx.clearRect(0, 0, width, height);
  }

  function handleVisibility() {
    paused = document.hidden;
    if (paused) stop();
    else start();
  }

  // Keep the collision list current as the UI changes or moves.
  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener("scroll", queueObstacleRefresh, { passive: true, capture: true });

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(queueObstacleRefresh);
    resizeObserver.observe(document.documentElement);
  }

  if ("MutationObserver" in window) {
    mutationObserver = new MutationObserver(queueObstacleRefresh);
    mutationObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"]
    });
  }

  document.addEventListener("visibilitychange", handleVisibility);

  // Seed a few balls immediately, then continue spawning gradually.
  resizeCanvas();
  for (let i = 0; i < Math.min(12, CONFIG.ballCount); i++) {
    balls.push(makeBall(true));
  }
  refreshObstacles();
  start();

  // Optional manual controls for debugging or page-specific controls.
  window.uiBouncyBalls = {
    refresh: refreshObstacles,
    pause() {
      paused = true;
      stop();
    },
    resume() {
      paused = false;
      start();
    },
    destroy() {
      stop();
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("scroll", queueObstacleRefresh, true);
      document.removeEventListener("visibilitychange", handleVisibility);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      canvas.remove();
      delete window.uiBouncyBalls;
      delete window.__uiBouncyBallsLoaded;
    }
  };
})();
'''

path = Path("/mnt/data/ui-bouncy-balls.js")
path.write_text(code, encoding="utf-8")
print(f"Created {path} ({len(code.splitlines())} lines)")
