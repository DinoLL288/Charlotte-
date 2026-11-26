(() => {
  "use strict";

  // Ball course — an almost-empty page where you build a course out of the
  // site's emoji stickers. Tap a sticker in the tray to add it to the
  // course, drag it where you want it, and drop balls from the top: they
  // fall, bounce off the stickers, and roll down to the floor. Your course
  // is saved on this device, so it is still there when you come back.

  const STICKERS = [
    { id: 'heart', icon: '🩷', name: 'Heart' },
    { id: 'star', icon: '⭐', name: 'Star' },
    { id: 'moon', icon: '🌙', name: 'Moon' },
    { id: 'music', icon: '🎵', name: 'Music' },
    { id: 'dice', icon: '🎲', name: 'Dice' },
    { id: 'camera', icon: '📷', name: 'Camera' },
    { id: 'lock', icon: '🔐', name: 'Lock' },
    { id: 'trophy', icon: '🏆', name: 'Trophy' },
    { id: 'wave', icon: '🌊', name: 'Wave' },
    { id: 'fire', icon: '🔥', name: 'Fire' },
    { id: 'rainbow', icon: '🌈', name: 'Rainbow' },
    { id: 'question', icon: '❓', name: 'Mystery' },
  ];

  const STICKER_R = 26;      // collider radius for a placed sticker
  const MAX_BALLS = 30;
  const GRAVITY = 0.35;
  const BOUNCE_FLOOR = 0.72;
  const BOUNCE_STICKER = 0.8;
  const REST_VY = 0.7;       // below this speed at the floor, a ball is resting
  const REST_TTL = 4000;     // a resting ball fades out after this long (ms)

  const user = (localStorage.getItem('charlotte-user') || 'Unknown').trim() || 'Unknown';
  const STORE_KEY = 'charlotte-ball-course-' + user;

  const area = document.getElementById('courseArea');
  const canvas = document.getElementById('courseCanvas');
  const layer = document.getElementById('stickerLayer');
  const tray = document.getElementById('stickerTray');
  const countEl = document.getElementById('ballCount');
  const emptyEl = document.getElementById('courseEmpty');
  if (!area || !canvas || !layer || !tray) return;
  const ctx = canvas.getContext('2d');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let stickers = []; // {uid, id, icon, name, x, y}
  let balls = [];    // {x, y, vx, vy, r, hue, restMs}
  let uidCounter = 1;
  let dragging = null; // {sticker, dx, dy}
  let lastTime = 0;
  let raf = 0;

  function random(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function resize() {
    const rect = area.getBoundingClientRect();
    width = Math.max(120, rect.width);
    height = Math.max(200, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of stickers) {
      s.x = clamp(s.x, STICKER_R, width - STICKER_R);
      s.y = clamp(s.y, STICKER_R, height - STICKER_R);
    }
    for (const b of balls) {
      b.x = clamp(b.x, b.r, width - b.r);
      b.y = clamp(b.y, b.r, height - b.r);
    }
    positionStickers();
  }

  // ---------- persistence ----------
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(stickers.map(s => ({ id: s.id, x: Math.round(s.x), y: Math.round(s.y) }))));
    } catch (e) { /* storage full or blocked — the course just won't persist */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      stickers = parsed.filter(p => p && STICKERS.some(s => s.id === p.id) && Number.isFinite(p.x) && Number.isFinite(p.y))
        .map(p => {
          const def = STICKERS.find(s => s.id === p.id);
          return { uid: uidCounter++, id: p.id, icon: def.icon, name: def.name, x: p.x, y: p.y };
        });
    } catch (e) { stickers = []; }
  }

  // ---------- placed stickers (HTML, so they are easy to drag) ----------
  function positionStickers() {
    for (const el of layer.children) {
      const s = stickers.find(v => v.uid === Number(el.dataset.uid));
      if (!s) continue;
      el.style.left = s.x + 'px';
      el.style.top = s.y + 'px';
    }
  }

  function renderStickers() {
    layer.innerHTML = '';
    for (const s of stickers) {
      const el = document.createElement('div');
      el.className = 'placed-sticker';
      el.dataset.uid = String(s.uid);
      el.style.left = s.x + 'px';
      el.style.top = s.y + 'px';
      el.title = s.name + ' — drag to move, tap × to remove';
      el.textContent = s.icon;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'sticker-del';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Remove ' + s.name);
      del.addEventListener('pointerdown', e => e.stopPropagation());
      del.addEventListener('click', e => {
        e.stopPropagation();
        stickers = stickers.filter(v => v.uid !== s.uid);
        save();
        renderStickers();
      });
      el.appendChild(del);
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        const rect = area.getBoundingClientRect();
        dragging = { sticker: s, dx: e.clientX - rect.left - s.x, dy: e.clientY - rect.top - s.y };
        el.classList.add('dragging');
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', e => {
        if (!dragging || dragging.sticker.uid !== s.uid) return;
        const rect = area.getBoundingClientRect();
        s.x = clamp(e.clientX - rect.left - dragging.dx, STICKER_R, width - STICKER_R);
        s.y = clamp(e.clientY - rect.top - dragging.dy, STICKER_R, height - STICKER_R);
        el.style.left = s.x + 'px';
        el.style.top = s.y + 'px';
      });
      const endDrag = e => {
        if (!dragging || dragging.sticker.uid !== s.uid) return;
        dragging = null;
        el.classList.remove('dragging');
        save();
      };
      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);
      layer.appendChild(el);
    }
    updateCount();
  }

  function addSticker(def) {
    const s = {
      uid: uidCounter++,
      id: def.id,
      icon: def.icon,
      name: def.name,
      x: clamp(width / 2 + random(-60, 60), STICKER_R, width - STICKER_R),
      y: clamp(height * 0.35 + random(-30, 30), STICKER_R, height - STICKER_R),
    };
    stickers.push(s);
    save();
    renderStickers();
  }

  // ---------- tray ----------
  function renderTray() {
    tray.innerHTML = '';
    for (const def of STICKERS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tray-sticker';
      btn.textContent = def.icon;
      btn.title = def.name + ' — tap to add it to the course';
      btn.setAttribute('aria-label', 'Add ' + def.name + ' to the course');
      btn.addEventListener('click', () => addSticker(def));
      tray.appendChild(btn);
    }
  }

  // ---------- balls ----------
  function dropBall(count) {
    for (let i = 0; i < (count || 1); i++) {
      if (balls.length >= MAX_BALLS) balls.shift();
      const r = random(9, 15);
      balls.push({
        x: random(r + 4, Math.max(r + 5, width - r - 4)),
        y: -r - random(0, 30),
        vx: random(-0.8, 0.8),
        vy: random(0, 1),
        r,
        hue: Math.floor(random(0, 360)),
        restMs: 0,
      });
    }
    updateCount();
  }

  function updateCount() {
    if (countEl) countEl.textContent = String(balls.length);
    if (emptyEl) emptyEl.style.display = (balls.length === 0 && stickers.length === 0) ? '' : 'none';
  }

  function collideCircle(ball, cx, cy, cr, bounce) {
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const minDist = ball.r + cr;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDist * minDist || distSq === 0) return;
    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;
    ball.x = cx + nx * minDist;
    ball.y = cy + ny * minDist;
    const vel = ball.vx * nx + ball.vy * ny;
    if (vel < 0) {
      const j = -(1 + bounce) * vel;
      ball.vx += j * nx;
      ball.vy += j * ny;
    }
  }

  function step(ball, dt) {
    const k = dt / 16.667;
    ball.vy += GRAVITY * k;
    ball.vx *= Math.pow(0.999, k);
    ball.x += ball.vx * k;
    ball.y += ball.vy * k;

    // Walls and ceiling
    if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx) * BOUNCE_FLOOR; }
    if (ball.x > width - ball.r) { ball.x = width - ball.r; ball.vx = -Math.abs(ball.vx) * BOUNCE_FLOOR; }
    if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy) * BOUNCE_FLOOR; }

    // Floor
    if (ball.y >= height - ball.r) {
      ball.y = height - ball.r;
      if (Math.abs(ball.vy) < REST_VY && Math.abs(ball.vx) < 0.4) {
        ball.vy = 0;
        ball.vx *= 0.9;
        ball.restMs += dt;
      } else {
        ball.vy = -Math.abs(ball.vy) * BOUNCE_FLOOR;
        ball.restMs = 0;
      }
    } else {
      ball.restMs = 0;
    }

    // Stickers are bumpers — balls bounce off them.
    for (const s of stickers) {
      collideCircle(ball, s.x, s.y, STICKER_R, BOUNCE_STICKER);
    }
  }

  function collideBalls(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minDist = a.r + b.r;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDist * minDist || distSq === 0) return;
    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;
    const vel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vel < 0) {
      const j = -(1 + 0.8) * vel * 0.5;
      a.vx -= j * nx; a.vy -= j * ny;
      b.vx += j * nx; b.vy += j * ny;
    }
  }

  function drawBall(ball) {
    const g = ctx.createRadialGradient(ball.x - ball.r * 0.35, ball.y - ball.r * 0.4, 0, ball.x, ball.y, ball.r);
    g.addColorStop(0, 'hsl(' + ball.hue + ', 95%, 92%)');
    g.addColorStop(0.5, 'hsl(' + ball.hue + ', 85%, 62%)');
    g.addColorStop(1, 'hsl(' + ball.hue + ', 80%, 40%)');
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.shadowColor = 'hsl(' + ball.hue + ', 90%, 60%)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function loop(t) {
    const dt = Math.min(50, t - (lastTime || t));
    lastTime = t;
    for (const ball of balls) step(ball, dt || 16.667);
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) collideBalls(balls[i], balls[j]);
    }
    const before = balls.length;
    balls = balls.filter(b => b.restMs < REST_TTL);
    if (balls.length !== before) updateCount();
    ctx.clearRect(0, 0, width, height);
    for (const ball of balls) drawBall(ball);
    raf = requestAnimationFrame(loop);
  }

  // ---------- controls ----------
  const dropBtn = document.getElementById('dropBall');
  const dropFiveBtn = document.getElementById('dropFive');
  const clearBallsBtn = document.getElementById('clearBalls');
  const clearCourseBtn = document.getElementById('clearCourse');
  if (dropBtn) dropBtn.addEventListener('click', () => dropBall(1));
  if (dropFiveBtn) dropFiveBtn.addEventListener('click', () => dropBall(5));
  if (clearBallsBtn) clearBallsBtn.addEventListener('click', () => { balls = []; updateCount(); });
  if (clearCourseBtn) clearCourseBtn.addEventListener('click', () => {
    stickers = [];
    save();
    renderStickers();
  });

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) { lastTime = 0; raf = requestAnimationFrame(loop); }
  });

  load();
  renderTray();
  resize();
  renderStickers();
  updateCount();
  raf = requestAnimationFrame(loop);
})();
