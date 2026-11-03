from pathlib import Path

path = Path("/mnt/data/ui-bouncy-balls.js")
code = path.read_text(encoding="utf-8")

code = code.replace(
'''  let paused = false;
  let obstacles = [];''',
'''  let paused = true; // Starts OFF; the floating toggle activates the effect.
  let enabled = false;
  let obstacles = [];'''
)

code = code.replace(
'''  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  document.documentElement.appendChild(canvas);

  let width = 0;''',
'''  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  document.documentElement.appendChild(canvas);

  // Floating toggle button, automatically added to every page loading this file.
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.setAttribute("aria-pressed", "false");
  toggle.setAttribute("aria-label", "Turn bouncing balls on");
  toggle.textContent = "● Fidget balls: OFF";
  Object.assign(toggle.style, {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    zIndex: "2147483001",
    border: "1px solid rgba(255,255,255,.35)",
    borderRadius: "999px",
    padding: "11px 15px",
    background: "rgba(28, 32, 48, .92)",
    color: "#fff",
    font: "600 13px/1.2 system-ui, sans-serif",
    letterSpacing: ".1px",
    boxShadow: "0 5px 18px rgba(0,0,0,.22)",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent"
  });
  document.documentElement.appendChild(toggle);

  let width = 0;'''
)

code = code.replace(
'''  function start() {
    if (paused || animationId) return;
    lastTime = 0;
    animationId = requestAnimationFrame(frame);
  }

  function stop() {''',
'''  function start() {
    if (paused || !enabled || animationId) return;
    lastTime = 0;
    animationId = requestAnimationFrame(frame);
  }

  function stop() {'''
)

code = code.replace(
'''  function handleVisibility() {
    paused = document.hidden;
    if (paused) stop();
    else start();
  }

  // Keep the collision list current as the UI changes or moves.''',
'''  function handleVisibility() {
    paused = document.hidden || !enabled;
    if (paused) stop();
    else start();
  }

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    paused = document.hidden || !enabled;
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.setAttribute(
      "aria-label",
      enabled ? "Turn bouncing balls off" : "Turn bouncing balls on"
    );
    toggle.textContent = enabled ? "● Fidget balls: ON" : "● Fidget balls: OFF";
    toggle.style.background = enabled
      ? "rgba(34, 139, 96, .96)"
      : "rgba(28, 32, 48, .92)";

    if (enabled) {
      // Start with a lively handful, then let the normal spawn cycle fill in.
      if (balls.length === 0) {
        for (let i = 0; i < Math.min(12, CONFIG.ballCount); i++) {
          balls.push(makeBall(true));
        }
      }
      start();
    } else {
      stop();
      balls = [];
    }
  }

  toggle.addEventListener("click", () => setEnabled(!enabled));

  // Keep the collision list current as the UI changes or moves.''')
code = code.replace(
'''  // Seed a few balls immediately, then continue spawning gradually.
  resizeCanvas();
  for (let i = 0; i < Math.min(12, CONFIG.ballCount); i++) {
    balls.push(makeBall(true));
  }
  refreshObstacles();
  start();''',
'''  // Prepare the canvas and collision targets. The animation stays OFF until clicked.
  resizeCanvas();
  refreshObstacles();'''
)
code = code.replace(
'''      canvas.remove();
      delete window.uiBouncyBalls;''',
'''      canvas.remove();
      toggle.remove();
      delete window.uiBouncyBalls;'''
)
code = code.replace(
'''    resume() {
      paused = false;
      start();
    },''',
'''    resume() {
      setEnabled(true);
    },
    isEnabled() {
      return enabled;
    },''')

path.write_text(code, encoding="utf-8")
print(f"Updated {path} ({len(code.splitlines())} lines)")
