// Next up together — a live countdown to the next thing Luke & Charlotte
// have planned, shown on the hub and on the calendar page.
// Pure helpers are exported so tests can check the countdown maths
// without a DOM.

// A calendar event is one entry of the /api/calendar events map:
// { title, startTime, endTime, time, quietDay, kind, specialDate }.
// Special dates are { id, title, date: 'MM-DD', icon } from
// window.CHARLOTTE_LUKE_SPECIAL_DATES and repeat every year.

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Next occurrence of a yearly 'MM-DD' date, at local midnight.
// If it is today, that is the occurrence — it is still ahead of us.
export function nextOccurrence(monthDay, now) {
  var parts = String(monthDay || '').split('-');
  var month = Number(parts[0]) - 1;
  var day = Number(parts[1]);
  var at = new Date(now.getFullYear(), month, day);
  if (at < startOfDay(now)) at = new Date(now.getFullYear() + 1, month, day);
  return at;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateKey(dateKey) {
  var parts = String(dateKey || '').split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function applyStartTime(date, startTime) {
  var match = /^(\d{1,2}):(\d{2})/.exec(String(startTime || ''));
  if (!match) return date;
  var at = new Date(date.getTime());
  at.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return at;
}

// Next up together only counts down to plans for both of us, or to a
// quiet day. Work shifts, logged WhatsApp calls and single-person
// events are not "together" plans, so they never drive the countdown.
export function isCountdownEvent(ev) {
  if (!ev || typeof ev !== 'object') return false;
  if (ev.specialDate) return false;
  if (ev.kind === 'whatsapp-call') return false;
  var title = String(ev.title || '').toLowerCase();
  if (title.indexOf('job shift') !== -1) return false;
  // Quiet days are together time; otherwise only "both of us" events count.
  if (ev.quietDay) return true;
  if (ev.for === 'Luke' || ev.for === 'Charlotte') return false;
  return true;
}

// Find the next thing to count down to, or null when nothing is planned.
// `events` is the /api/calendar map keyed by 'YYYY-MM-DD'.
// `specialDates` is the yearly list (birthdays, anniversary).
// Returns { icon, title, dateKey, startTime, at } with `at` a local Date.
export function findNextUp(events, specialDates, now) {
  var current = now || new Date();
  var today = startOfDay(current);
  var candidates = [];

  Object.keys(events || {}).forEach(function (dateKey) {
    var list = events[dateKey] || [];
    list.forEach(function (ev) {
      if (!isCountdownEvent(ev)) return;
      var day = parseDateKey(dateKey);
      if (Number.isNaN(day.getTime())) return;
      var at = applyStartTime(day, ev.startTime);
      // An event with a start time that has already passed is over;
      // an all-day event still counts for the rest of today.
      if (ev.startTime && at <= current) return;
      if (!ev.startTime && day < today) return;
      candidates.push({
        icon: '💛',
        title: String(ev.title || 'Something lovely').trim() || 'Something lovely',
        dateKey: dateKey,
        startTime: ev.startTime || '',
        at: at,
        special: false
      });
    });
  });

  (specialDates || []).forEach(function (item) {
    if (!item || !item.date) return;
    var at = nextOccurrence(item.date, current);
    candidates.push({
      icon: item.icon || '💛',
      title: String(item.title || 'A special day').trim() || 'A special day',
      dateKey: at.getFullYear() + '-' + String(at.getMonth() + 1).padStart(2, '0') + '-' + String(at.getDate()).padStart(2, '0'),
      startTime: '',
      at: at,
      special: true
    });
  });

  if (!candidates.length) return null;
  // Earliest day first; on the same day a real plan beats a yearly
  // reminder (a birthday at midnight would otherwise win over a 9am plan).
  candidates.sort(function (a, b) {
    var dayA = startOfDay(a.at).getTime();
    var dayB = startOfDay(b.at).getTime();
    if (dayA !== dayB) return dayA - dayB;
    if (a.special !== b.special) return a.special ? 1 : -1;
    return a.at - b.at;
  });
  return candidates[0];
}

function formatDay(at) {
  // en-AU gives "Sat, 5 Dec" — drop the comma for a cleaner countdown line.
  return at.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
}

function formatTime(at) {
  // 12-hour with AM/PM ("6:00 PM"), never the device's 24-hour setting.
  // formatTime12h comes from assets/js/format-time.js, loaded before this
  // module on every page; fall back to the locale call if it is missing.
  if (typeof formatTime12h === 'function') return formatTime12h(at);
  return at.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(/[\u202f\u00a0]/g, ' ');
}

// Human words for how far away `target` is.
// Returns { headline, detail }: headline is the big countdown,
// detail names the plan and when it is.
export function describeCountdown(target, now) {
  var current = now || new Date();
  var diffMs = target.at.getTime() - current.getTime();
  var when = formatDay(target.at) + (target.startTime ? ', ' + formatTime(target.at) : '');
  var detail = target.title + ' · ' + when;
  var today = startOfDay(current);
  var targetDay = startOfDay(target.at);
  var dayDiff = Math.round((targetDay.getTime() - today.getTime()) / 86400000);

  if (dayDiff <= 0) {
    if (target.startTime && diffMs > 0) {
      var mins = Math.floor(diffMs / 60000);
      if (mins < 60) return { headline: 'in ' + mins + (mins === 1 ? ' minute' : ' minutes'), detail: detail };
      var hours = Math.floor(mins / 60);
      var rem = mins % 60;
      return { headline: 'today at ' + formatTime(target.at), detail: detail + ' · in ' + hours + 'h' + (rem ? ' ' + rem + 'm' : '') };
    }
    return { headline: 'Today!', detail: detail };
  }
  if (dayDiff === 1) return { headline: 'Tomorrow', detail: detail };
  return { headline: 'in ' + dayDiff + (dayDiff === 1 ? ' day' : ' days'), detail: detail };
}

// Fill one [data-next-up] element. `variant` is 'card' (hub row) or
// 'banner' (calendar page). Works with a plain { innerHTML } stub in tests.
export function renderNextUp(el, target, now) {
  var variant = el.getAttribute ? el.getAttribute('data-next-up') : 'card';
  // The hub card starts with a shimmering "Counting down…" loading line;
  // real content (or the friendly empty state) has arrived now.
  if (el.classList && el.classList.remove) el.classList.remove('is-loading');
  if (!target) {
    if (variant === 'banner') {
      if (el.setAttribute) el.setAttribute('hidden', '');
      return;
    }
    el.innerHTML =
      '<span class="calm-icon">⏳</span>' +
      '<span class="calm-body">' +
      '<span class="next-up-eyebrow">Next up together</span>' +
      '<span class="calm-title">Nothing planned yet</span>' +
      '<span class="calm-sub">Add a date on the calendar, or spin the date spinner for an idea</span>' +
      '</span><span class="calm-arrow">→</span>';
    if (el.tagName === 'A') el.setAttribute('href', 'date-spinner.html');
    return;
  }
  if (el.removeAttribute) el.removeAttribute('hidden');
  var words = describeCountdown(target, now);
  if (variant === 'banner') {
    el.innerHTML =
      '<span aria-hidden="true">' + escapeHtml(target.icon) + '</span> ' +
      '<strong>' + escapeHtml(words.headline) + '</strong> until ' +
      '<strong>' + escapeHtml(target.title) + '</strong>' +
      ' <span class="countdown-when">· ' + escapeHtml(words.detail.split(' · ')[1] || '') + '</span>';
    return;
  }
  el.innerHTML =
    '<span class="calm-icon">' + escapeHtml(target.icon) + '</span>' +
    '<span class="calm-body">' +
    '<span class="next-up-eyebrow">Next up together</span>' +
    '<span class="calm-title">' + escapeHtml(words.headline) + '</span>' +
    '<span class="calm-sub">' + escapeHtml(target.title) + ' · ' + escapeHtml(words.detail.split(' · ')[1] || '') + '</span>' +
    '</span><span class="calm-arrow">→</span>';
}

// --- Browser wiring: fetch the shared calendar once, tick every 30s. ---
if (typeof document !== 'undefined' && typeof fetch !== 'undefined') {
  (function initNextUp() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-next-up]'));
    if (!els.length) return;
    var events = null;

    function specialDates() {
      return (typeof window !== 'undefined' && window.CHARLOTTE_LUKE_SPECIAL_DATES) || [];
    }

    function renderAll() {
      var now = new Date();
      els.forEach(function (el) {
        renderNextUp(el, events ? findNextUp(events, specialDates(), now) : null, now);
      });
    }

    function load() {
      fetch('/api/calendar', { cache: 'no-store' })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          events = (json && json.events) || {};
          renderAll();
        })
        .catch(function () {
          // Preview builds have no live calendar: show the gentle
          // "nothing planned" state on the hub card, hide the banner.
          events = {};
          renderAll();
        });
    }

    load();
    // Re-render as the clock ticks; refetch every 10th tick (5 minutes)
    // so a plan added on the other side of the world shows up
    // without a reload.
    var ticks = 0;
    setInterval(function () {
      ticks += 1;
      renderAll();
      if (ticks % 10 === 0) load();
    }, 30000);
  })();
}
