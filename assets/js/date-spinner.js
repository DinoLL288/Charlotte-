// Date Night Spinner — pick what Luke & Charlotte do together.
// Pure helpers are exported so tests can check the wheel maths without a DOM.

export const CATEGORIES = [
  { id: 'all', label: 'Anything', emoji: '🎡' },
  { id: 'home', label: 'Cosy at home', emoji: '🏠' },
  { id: 'out', label: 'Out & about', emoji: '🌳' },
  { id: 'treats', label: 'Sweet treats', emoji: '🍦' },
];

export const DEFAULT_IDEAS = [
  { label: 'Movie night', emoji: '🍿', category: 'home', line: 'Popcorn, blankets, and you — perfect night in.' },
  { label: 'Cook together', emoji: '🍳', category: 'home', line: 'Pick a recipe, make a mess, eat the results.' },
  { label: 'Game night', emoji: '🎲', category: 'home', line: 'Loser does the dishes. Winner picks the next game.' },
  { label: 'Blanket fort', emoji: '🏰', category: 'home', line: 'Pillows, fairy lights, and nowhere else to be.' },
  { label: 'Stargazing', emoji: '✨', category: 'out', line: 'Find the brightest star and name it after us.' },
  { label: 'Walk & talk', emoji: '🚶', category: 'out', line: 'No destination, just us and a good chat.' },
  { label: 'Picnic', emoji: '🧺', category: 'out', line: 'Pack snacks, find a sunny spot, stay a while.' },
  { label: 'Sunset watch', emoji: '🌅', category: 'out', line: 'Golden hour looks even better with you in it.' },
  { label: 'Dessert run', emoji: '🍦', category: 'treats', line: 'Ice cream tastes better when it is shared.' },
  { label: 'Bubble tea', emoji: '🧋', category: 'treats', line: 'Two straws, one very large cup.' },
];

export const MAX_IDEAS = 12;
export const CUSTOM_KEY = 'date-spinner-custom';
export const PLAN_KEY = 'date-spinner-plan';

// --- Pure helpers ---

export function filterIdeas(ideas, category) {
  if (!category || category === 'all') return ideas.slice();
  return ideas.filter(function (idea) { return idea.category === category; });
}

export function pickIndex(count, randomFn) {
  var rnd = randomFn || Math.random;
  return Math.floor(rnd() * count);
}

// Normalise an angle to [0, 360).
export function normaliseAngle(deg) {
  return ((deg % 360) + 360) % 360;
}

// Segment size in degrees for a wheel with `count` segments.
export function segmentSize(count) {
  return 360 / count;
}

// Which segment sits under the pointer (at the top of the wheel) when the
// wheel has been rotated `rotation` degrees clockwise. Segments are drawn
// clockwise from the top, so segment i covers [i*size, (i+1)*size).
export function segmentForRotation(rotation, count) {
  var size = segmentSize(count);
  var pointerAngle = normaliseAngle(-rotation);
  var index = Math.floor(pointerAngle / size);
  return index >= count ? count - 1 : index;
}

// Final rotation (degrees, clockwise) that lands segment `index` under the
// pointer, after `extraTurns` full spins from `currentRotation`.
export function spinTargetRotation(currentRotation, index, count, extraTurns) {
  var size = segmentSize(count);
  var centre = (index + 0.5) * size; // angle of the segment centre, from the top
  var base = normaliseAngle(-centre); // rotation that puts that centre at the top
  var turns = extraTurns == null ? 5 : extraTurns;
  var delta = normaliseAngle(base - normaliseAngle(currentRotation));
  return currentRotation + turns * 360 + delta;
}

export function isDuplicateIdea(ideas, label) {
  var wanted = String(label || '').trim().toLowerCase();
  if (!wanted) return true;
  return ideas.some(function (idea) { return idea.label.trim().toLowerCase() === wanted; });
}

export function loadCustomIdeas(storage) {
  try {
    var raw = storage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function (idea) {
      return idea && typeof idea.label === 'string' && idea.label.trim() && typeof idea.emoji === 'string';
    }).map(function (idea) {
      return { label: idea.label.trim().slice(0, 40), emoji: idea.emoji || '💡', category: idea.category || 'home', line: idea.line || 'Your idea — make it a good one!', custom: true };
    });
  } catch (e) {
    return [];
  }
}

export function saveCustomIdeas(storage, ideas) {
  try {
    storage.setItem(CUSTOM_KEY, JSON.stringify(ideas));
  } catch (e) {}
}

// --- Browser wiring (only runs when a DOM is present) ---

if (typeof document !== 'undefined') {
  (function () {
    var wheelCanvas = document.getElementById('dateWheel');
    if (!wheelCanvas) return;

    var SEGMENT_COLOURS = ['#f6c9d4', '#c3e6fb', '#fff3c4', '#d9f2d0', '#e8d5f2', '#ffe0b8'];
    var wheelWrap = document.getElementById('wheelWrap');
    var spinBtn = document.getElementById('spinBtn');
    var againBtn = document.getElementById('againBtn');
    var resultEl = document.getElementById('spinResult');
    var statusEl = document.getElementById('spinStatus');
    var chipsEl = document.getElementById('categoryChips');
    var addInput = document.getElementById('customIdeaInput');
    var addCategory = document.getElementById('customIdeaCategory');
    var addBtn = document.getElementById('addIdeaBtn');
    var customListEl = document.getElementById('customIdeas');
    var planEl = document.getElementById('tonightsPlan');
    var planTextEl = document.getElementById('planText');
    var planClearBtn = document.getElementById('planClear');
    var countEl = document.getElementById('ideaCount');

    var storage = window.localStorage;
    var category = 'all';
    var customIdeas = loadCustomIdeas(storage);
    var rotation = 0;
    var spinning = false;
    var currentIdeas = [];

    function allIdeas() {
      return DEFAULT_IDEAS.concat(customIdeas).slice(0, MAX_IDEAS);
    }

    function visibleIdeas() {
      return filterIdeas(allIdeas(), category);
    }

    function drawWheel(ideas) {
      var size = wheelCanvas.width;
      var ctx = wheelCanvas.getContext('2d');
      var cx = size / 2, cy = size / 2, radius = size / 2 - 4;
      ctx.clearRect(0, 0, size, size);
      if (!ideas.length) return;
      var seg = (Math.PI * 2) / ideas.length;
      ideas.forEach(function (idea, i) {
        var start = i * seg - Math.PI / 2;
        var end = start + seg;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = SEGMENT_COLOURS[i % SEGMENT_COLOURS.length];
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Label: emoji + short text, reading outwards from the centre.
        var mid = start + seg / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(mid + Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#123a58';
        ctx.font = '22px system-ui, sans-serif';
        ctx.fillText(idea.emoji, 0, -radius * 0.62);
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(idea.label.length > 14 ? idea.label.slice(0, 13) + '…' : idea.label, 0, -radius * 0.38);
        ctx.restore();
      });
      // Hub cap
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.fillStyle = '#143f5f';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💕', cx, cy + 1);
    }

    function renderChips() {
      chipsEl.innerHTML = '';
      CATEGORIES.forEach(function (cat) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip' + (cat.id === category ? ' active' : '');
        btn.textContent = cat.emoji + ' ' + cat.label;
        btn.setAttribute('aria-pressed', cat.id === category ? 'true' : 'false');
        btn.addEventListener('click', function () {
          if (spinning) return;
          category = cat.id;
          rotation = 0;
          wheelCanvas.style.transition = 'none';
          wheelCanvas.style.transform = 'rotate(0deg)';
          renderAll();
        });
        chipsEl.appendChild(btn);
      });
    }

    function renderCustomList() {
      customListEl.innerHTML = '';
      customIdeas.forEach(function (idea, i) {
        var li = document.createElement('li');
        var span = document.createElement('span');
        span.textContent = idea.emoji + ' ' + idea.label;
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'remove-idea';
        remove.textContent = '×';
        remove.setAttribute('aria-label', 'Remove ' + idea.label);
        remove.addEventListener('click', function () {
          customIdeas.splice(i, 1);
          saveCustomIdeas(storage, customIdeas);
          renderAll();
        });
        li.appendChild(span);
        li.appendChild(remove);
        customListEl.appendChild(li);
      });
    }

    function renderPlan() {
      var plan = null;
      try { plan = storage.getItem(PLAN_KEY); } catch (e) {}
      if (plan) {
        planEl.hidden = false;
        planTextEl.textContent = plan;
      } else {
        planEl.hidden = true;
      }
    }

    function renderAll() {
      currentIdeas = visibleIdeas();
      drawWheel(currentIdeas);
      renderChips();
      renderCustomList();
      renderPlan();
      countEl.textContent = currentIdeas.length + (currentIdeas.length === 1 ? ' idea' : ' ideas') + ' on the wheel';
      if (!currentIdeas.length) {
        statusEl.textContent = 'No ideas in this category yet — add one below!';
      } else if (!spinning) {
        statusEl.textContent = 'Tap Spin and let the wheel decide. 🎡';
      }
    }

    function showResult(idea) {
      resultEl.innerHTML = '';
      var emoji = document.createElement('div');
      emoji.className = 'result-emoji';
      emoji.textContent = idea.emoji;
      var title = document.createElement('h3');
      title.textContent = idea.label;
      var line = document.createElement('p');
      line.textContent = idea.line;
      var pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'btn small';
      pick.textContent = "That's the one! 💕";
      pick.addEventListener('click', function () {
        try { storage.setItem(PLAN_KEY, idea.emoji + ' ' + idea.label); } catch (e) {}
        renderPlan();
        statusEl.textContent = 'Locked in! See you there. 💕';
      });
      resultEl.appendChild(emoji);
      resultEl.appendChild(title);
      resultEl.appendChild(line);
      resultEl.appendChild(pick);
      resultEl.hidden = false;
      againBtn.hidden = false;
    }

    spinBtn.addEventListener('click', function () {
      if (spinning || currentIdeas.length < 2) {
        if (currentIdeas.length < 2) statusEl.textContent = 'Add at least two ideas to spin the wheel.';
        return;
      }
      spinning = true;
      spinBtn.disabled = true;
      againBtn.hidden = true;
      resultEl.hidden = true;
      statusEl.textContent = 'Spinning…';
      var index = pickIndex(currentIdeas.length);
      var target = spinTargetRotation(rotation, index, currentIdeas.length, 5);
      wheelCanvas.style.transition = 'transform 4s cubic-bezier(.12,.8,.08,1)';
      wheelCanvas.style.transform = 'rotate(' + target + 'deg)';
      rotation = target;
      setTimeout(function () {
        spinning = false;
        spinBtn.disabled = false;
        var landed = segmentForRotation(rotation, currentIdeas.length);
        var idea = currentIdeas[landed] || currentIdeas[index];
        statusEl.textContent = 'The wheel has spoken! 🎉';
        showResult(idea);
      }, 4100);
    });

    againBtn.addEventListener('click', function () {
      spinBtn.click();
    });

    addBtn.addEventListener('click', function () {
      var label = addInput.value.trim();
      if (!label) { statusEl.textContent = 'Type an idea first!'; return; }
      var ideas = allIdeas();
      if (ideas.length >= MAX_IDEAS) { statusEl.textContent = 'The wheel is full (12 ideas max) — remove one first.'; return; }
      if (isDuplicateIdea(ideas, label)) { statusEl.textContent = 'That idea is already on the wheel!'; return; }
      var cat = addCategory.value || 'home';
      var catLabel = (CATEGORIES.find(function (c) { return c.id === cat; }) || {}).label || 'Cosy at home';
      customIdeas.push({ label: label, emoji: '💡', category: cat, line: 'Your idea — ' + catLabel.toLowerCase() + ', your rules!' });
      saveCustomIdeas(storage, customIdeas);
      addInput.value = '';
      renderAll();
      statusEl.textContent = '"' + label + '" is on the wheel now! 🎡';
    });
    addInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
    });

    planClearBtn.addEventListener('click', function () {
      try { storage.removeItem(PLAN_KEY); } catch (e) {}
      renderPlan();
    });

    renderAll();
  })();
}
