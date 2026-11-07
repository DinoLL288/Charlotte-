(function () {
  const user = localStorage.getItem('charlotte-user');
  const key = user ? 'charlotte-preferences-' + user : null;

  function readPrefs() {
    try { return JSON.parse((key && localStorage.getItem(key)) || 'null') || {}; }
    catch (e) { return {}; }
  }

  function enabled() {
    const p = readPrefs();
    return p.playfulExtras !== false;
  }

  function ensureStyles() {
    if (!document.querySelector('link[data-playful]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'playful.css';
      link.dataset.playful = 'true';
      document.head.appendChild(link);
    }
  }

  function removeWidget() {
    const fab = document.getElementById('playfulFab');
    const panel = document.getElementById('playfulPanel');
    if (fab) fab.remove();
    if (panel) panel.remove();
  }

  function confetti(count) {
    const colors = ['#f6d365', '#fda085', '#8ecbeb', '#ecd7a0', '#b8e0d2'];
    for (let i = 0; i < (count || 24); i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = (Math.random() * 100) + 'vw';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      piece.style.animationDelay = (Math.random() * 0.3) + 's';
      document.body.appendChild(piece);
      setTimeout(function () { piece.remove(); }, 1800);
    }
  }

  function render() {
    if (document.getElementById('playfulFab')) return;
    ensureStyles();

    const fab = document.createElement('button');
    fab.id = 'playfulFab';
    fab.className = 'playful-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Open playful extras');
    fab.textContent = '✨';
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'playfulPanel';
    panel.className = 'playful-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="playful-head">
        <h3>Playful extras</h3>
        <button class="playful-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="playful-tabs">
        <button class="playful-tab active" data-tab="fidget" type="button">Fidget</button>
        <button class="playful-tab" data-tab="focus" type="button">Focus</button>
        <button class="playful-tab" data-tab="rewards" type="button">Rewards</button>
      </div>
      <section class="playful-section active" data-panel="fidget">
        <p>Pop all the bubbles.</p>
        <div class="bubble-grid" id="bubbleGrid"></div>
        <button class="playful-btn secondary" id="resetBubbles" type="button">Reset bubbles</button>
        <div class="spinner-wrap">
          <div class="spinner" id="spinner">🔄</div>
          <p>Tap the spinner.</p>
        </div>
      </section>
      <section class="playful-section" data-panel="focus">
        <div class="timer-display" id="timerDisplay">25:00</div>
        <div class="timer-actions">
          <button class="playful-btn" id="focusStart" type="button">Start</button>
          <button class="playful-btn secondary" id="focusReset" type="button">Reset</button>
        </div>
        <p>One thing at a time.</p>
      </section>
      <section class="playful-section" data-panel="rewards">
        <div class="reward-points" id="rewardPoints">0</div>
        <div class="timer-actions">
          <button class="playful-btn" id="rewardCheer" type="button">Cheer me!</button>
        </div>
        <p>Tiny wins count.</p>
      </section>
    `;
    document.body.appendChild(panel);

    const closeBtn = panel.querySelector('.playful-close');
    const tabs = panel.querySelectorAll('.playful-tab');
    const sections = panel.querySelectorAll('.playful-section');
    const bubbleGrid = panel.querySelector('#bubbleGrid');
    const resetBubbles = panel.querySelector('#resetBubbles');
    const spinner = panel.querySelector('#spinner');
    const timerDisplay = panel.querySelector('#timerDisplay');
    const focusStart = panel.querySelector('#focusStart');
    const focusReset = panel.querySelector('#focusReset');
    const rewardPoints = panel.querySelector('#rewardPoints');
    const rewardCheer = panel.querySelector('#rewardCheer');

    let points = 0;
    const user = localStorage.getItem('charlotte-user');
    // Load points from server
    if (user) {
      fetch('/api/question-room?view=playful-points&user=' + encodeURIComponent(user), { cache: 'no-store' })
        .then(res => res.json())
        .then(json => { points = Number(json.points) || 0; rewardPoints.textContent = points; })
        .catch(() => {});
    }
    rewardPoints.textContent = points;

    function savePoints() {
      if (!user) return;
      fetch('/api/question-room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'playful-points', user, points }) }).catch(() => {});
    }

    function buildBubbles() {
      bubbleGrid.innerHTML = '';
      for (let i = 0; i < 12; i++) {
        const b = document.createElement('button');
        b.className = 'bubble';
        b.type = 'button';
        b.textContent = '🫧';
        b.addEventListener('click', function () {
          if (b.classList.contains('popped')) return;
          b.classList.add('popped');
          points += 1;
          rewardPoints.textContent = points;
          savePoints();
          if (!bubbleGrid.querySelector('.bubble:not(.popped)')) {
            confetti(30);
            points += 5;
            rewardPoints.textContent = points;
            savePoints();
          }
        });
        bubbleGrid.appendChild(b);
      }
    }
    buildBubbles();
    resetBubbles.addEventListener('click', buildBubbles);

    let spin = 0;
    spinner.addEventListener('click', function () {
      spin += 360 + Math.random() * 360;
      spinner.style.transform = 'rotate(' + spin + 'deg)';
    });

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        sections.forEach(function (s) { s.classList.remove('active'); });
        tab.classList.add('active');
        panel.querySelector('[data-panel="' + tab.dataset.tab + '"]').classList.add('active');
      });
    });

    let timerLeft = 25 * 60;
    let timerRunning = false;
    let timerInterval = null;
    function fmt(s) {
      const m = Math.floor(s / 60);
      const r = s % 60;
      return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
    }
    timerDisplay.textContent = fmt(timerLeft);
    focusStart.addEventListener('click', function () {
      if (timerRunning) {
        timerRunning = false;
        focusStart.textContent = 'Start';
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = null;
        return;
      }
      timerRunning = true;
      focusStart.textContent = 'Pause';
      timerInterval = setInterval(function () {
        timerLeft -= 1;
        if (timerLeft <= 0) {
          timerLeft = 0;
          timerRunning = false;
          if (timerInterval) clearInterval(timerInterval);
          timerInterval = null;
          focusStart.textContent = 'Start';
          confetti(40);
          try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Focus session done'); } catch (e) {}
        }
        timerDisplay.textContent = fmt(timerLeft);
      }, 1000);
    });
    focusReset.addEventListener('click', function () {
      timerRunning = false;
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      focusStart.textContent = 'Start';
      timerLeft = 25 * 60;
      timerDisplay.textContent = fmt(timerLeft);
    });

    rewardCheer.addEventListener('click', function () {
      confetti(50);
      points += 3;
      rewardPoints.textContent = points;
      savePoints();
    });

    fab.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
    });
    closeBtn.addEventListener('click', function () {
      panel.hidden = true;
    });
  }

  function sync() {
    if (enabled()) render(); else removeWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync);
  } else {
    sync();
  }

  window.addEventListener('charlotte-preferences', function (event) {
    const on = event.detail ? event.detail.playfulExtras !== false : enabled();
    if (on) render(); else removeWidget();
  });
  window.addEventListener('storage', function (event) {
    if (key && event.key === key) sync();
  });
})();