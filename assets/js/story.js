// Our Story — a timeline of Luke & Charlotte built live from real data.
//
// Sources (all real, stored on the site — nothing is invented here):
//   - timeline moments   GET /api/timeline            (hand-written moments)
//   - calendar events    GET /api/calendar            (plans and dates)
//   - mood entries       GET /api/question-room?view=mood&user=Luke|Charlotte
//   - gallery photos     GET /api/gallery             (photos with dates)
//   - fixed milestones   together since 26 Oct 2026, Charlotte's birthday
//                        9 Mar, our anniversary 26 Oct (yearly, next occurrence)
//
// Pure helpers are exported so tests can check the timeline maths
// without a DOM. The page boot at the bottom only runs in a browser.

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The day we started dating. Everything in the story counts from here.
export var TOGETHER_SINCE_KEY = '2026-10-26';

export function parseDateKey(dateKey) {
  var parts = String(dateKey || '').split('-');
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dateKeyOf(date) {
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + m + '-' + d;
}

// Whole days together, from 26 Oct 2026 to today.
export function daysTogether(now) {
  var since = parseDateKey(TOGETHER_SINCE_KEY);
  var days = Math.floor((startOfDay(now) - startOfDay(since)) / 86400000);
  return days < 0 ? 0 : days;
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

// The 13 moods, same labels as the mood tracker.
export var MOOD_LABELS = {
  '🥰': 'Loved', '😊': 'Happy', '💛': 'Calm', '🌙': 'Tired',
  '🤔': 'Unsure', '😤': 'Stressed', '😔': 'Low', '😢': 'Sad',
  '😰': 'Anxious', '😠': 'Angry', '😞': 'Depressed', '😶': 'Numb',
  '😭': 'Overwhelmed'
};

// The story shows moments we shared — not calls, quiet days, work
// shifts, test events, chores or admin. The countdown already skips
// shifts, quiet days and calls for the same reason; the story skips
// the same, plus the test and admin entries that would read as noise.
var SKIP_TITLE_PATTERNS = [
  /job/i,           // "Lukes Job", "Luke Job (Not training)", "Luke's job shift"
  /^test/i,         // "Testing 1 2", "test 1 2"
  /wash hair/i,     // a routine, not a moment together
  /eu\.org/i        // domain admin, not a moment together
];

export function isStoryCalendarEvent(event) {
  if (!event || typeof event !== 'object') return false;
  var title = String(event.title || '').trim();
  if (!title) return false;
  if (event.kind === 'whatsapp-call') return false;
  if (event.quietDay) return false;
  if (event.specialDate) return false;
  for (var i = 0; i < SKIP_TITLE_PATTERNS.length; i++) {
    if (SKIP_TITLE_PATTERNS[i].test(title)) return false;
  }
  return true;
}

function validTime(value) {
  var match = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim());
  if (!match) return null;
  var hours = Number(match[1]);
  var minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

// Normalise a mood response into { person: { dateKey: [entry, ...] } }.
// Accepts the per-user shape, the flat date->entry shape, and entries
// stored under either "entries" or "moods".
export function normalizeMoodMap(raw, person) {
  var out = {};
  if (!raw || typeof raw !== 'object') return out;
  var src = raw.entries || raw.moods || raw;
  if (!src || typeof src !== 'object') return out;
  var people = [];
  if (src.Charlotte || src.Luke) {
    people = ['Charlotte', 'Luke'];
  } else if (person) {
    people = [person];
  } else {
    people = ['Luke'];
  }
  people.forEach(function (name) {
    var mine = src[name];
    if (!mine && people.length === 1 && src && typeof src === 'object') {
      // Flat shape: the whole object is dateKey -> entry/array.
      mine = src;
    }
    if (!mine || typeof mine !== 'object') return;
    var dates = {};
    Object.keys(mine).forEach(function (dateKey) {
      var value = mine[dateKey];
      var list = Array.isArray(value) ? value : (value ? [value] : []);
      var entries = list.filter(function (entry) {
        return entry && entry.mood;
      }).map(function (entry) {
        return {
          mood: entry.mood,
          intensity: entry.intensity,
          note: entry.note || '',
          id: entry.id || ''
        };
      });
      if (entries.length) dates[dateKey] = entries;
    });
    if (Object.keys(dates).length) out[name] = dates;
  });
  return out;
}

// One marker per month: the earliest mood entry that month, from
// either person. Returns [{ dateKey, date, person, entry }].
export function firstMoodPerMonth(moodsByPerson) {
  var byMonth = {};
  Object.keys(moodsByPerson || {}).forEach(function (person) {
    var byDate = moodsByPerson[person] || {};
    Object.keys(byDate).forEach(function (dateKey) {
      var date = parseDateKey(dateKey);
      if (!date) return;
      var list = byDate[dateKey] || [];
      if (!list.length) return;
      var monthKey = dateKey.slice(0, 7);
      var candidate = { dateKey: dateKey, date: date, person: person, entry: list[0] };
      if (!byMonth[monthKey] || date < byMonth[monthKey].date) byMonth[monthKey] = candidate;
    });
  });
  return Object.keys(byMonth).sort().map(function (key) { return byMonth[key]; });
}

// Merge every source into one dated list, oldest first. Each entry:
// { id, kind, date, dateKey, time, title, body, photo, emoji, author,
//   comingUp }. Nothing is invented: a source with no data simply
// contributes no entries.
export function buildStoryEntries(input) {
  var data = input || {};
  var now = data.now || new Date();
  var entries = [];

  (data.moments || []).forEach(function (moment) {
    var date = parseDateKey(moment.date);
    if (!date || !String(moment.title || '').trim()) return;
    entries.push({
      id: 'moment-' + String(moment.id || moment.title),
      kind: 'moment',
      date: date,
      dateKey: dateKeyOf(date),
      time: null,
      title: String(moment.title).trim(),
      body: String(moment.body || '').trim(),
      photo: String(moment.photo || '').trim() || null,
      emoji: '🌅',
      author: moment.author || '',
      comingUp: false
    });
  });

  var calendar = data.calendarEvents || {};
  Object.keys(calendar).forEach(function (dateKey) {
    var date = parseDateKey(dateKey);
    if (!date) return;
    (calendar[dateKey] || []).forEach(function (event) {
      if (!isStoryCalendarEvent(event)) return;
      entries.push({
        id: 'event-' + String(event.id || (dateKey + '-' + event.title)),
        kind: 'event',
        date: date,
        dateKey: dateKey,
        time: validTime(event.startTime || event.time),
        title: String(event.title).trim(),
        body: '',
        photo: null,
        emoji: '📅',
        author: event.author || '',
        comingUp: date > startOfDay(now)
      });
    });
  });

  firstMoodPerMonth(data.moodsByPerson || {}).forEach(function (marker) {
    var label = MOOD_LABELS[marker.entry.mood] || '';
    entries.push({
      id: 'mood-' + marker.dateKey,
      kind: 'mood',
      date: marker.date,
      dateKey: marker.dateKey,
      time: null,
      title: marker.person + ' felt ' + marker.entry.mood + (label ? ' · ' + label : ''),
      body: String(marker.entry.note || '').trim(),
      photo: null,
      emoji: marker.entry.mood,
      author: marker.person,
      comingUp: false
    });
  });

  (data.photos || []).forEach(function (photo) {
    var date = photo.uploadedAt ? new Date(photo.uploadedAt) : null;
    if (!date || Number.isNaN(date.getTime())) return;
    var url = photo.url || photo.fullUrl || '';
    entries.push({
      id: 'photo-' + String(photo.id || photo.name || dateKeyOf(date)),
      kind: 'photo',
      date: startOfDay(date),
      dateKey: dateKeyOf(date),
      time: null,
      title: String(photo.caption || photo.name || 'A photo').trim() || 'A photo',
      body: '',
      photo: url || null,
      emoji: '📷',
      author: photo.uploadedBy || '',
      comingUp: false
    });
  });

  // Fixed milestones. "Together since" is only added when no entry
  // already marks that day (the "We started Dating" moment does).
  var hasTogetherDay = entries.some(function (entry) {
    return entry.dateKey === TOGETHER_SINCE_KEY;
  });
  if (!hasTogetherDay) {
    entries.push({
      id: 'milestone-together',
      kind: 'milestone',
      date: parseDateKey(TOGETHER_SINCE_KEY),
      dateKey: TOGETHER_SINCE_KEY,
      time: null,
      title: 'We started dating',
      body: 'Together since 26 October 2026.',
      photo: null,
      emoji: '💛',
      author: '',
      comingUp: false
    });
  }
  [
    { id: 'milestone-birthday', monthDay: '03-09', title: 'Charlotte’s birthday', emoji: '🎂' },
    { id: 'milestone-anniversary', monthDay: '10-26', title: 'Our anniversary', emoji: '💛' }
  ].forEach(function (milestone) {
    var at = nextOccurrence(milestone.monthDay, now);
    entries.push({
      id: milestone.id,
      kind: 'milestone',
      date: at,
      dateKey: dateKeyOf(at),
      time: null,
      title: milestone.title,
      body: '',
      photo: null,
      emoji: milestone.emoji,
      author: '',
      comingUp: at > startOfDay(now)
    });
  });

  var kindRank = { milestone: 0, moment: 1, event: 2, photo: 3, mood: 4 };
  entries.sort(function (a, b) {
    if (a.date - b.date !== 0) return a.date - b.date;
    var aTime = a.time || '';
    var bTime = b.time || '';
    if (aTime !== bTime) return aTime < bTime ? -1 : 1;
    return (kindRank[a.kind] - kindRank[b.kind]) || (a.title < b.title ? -1 : 1);
  });
  return entries;
}

// Group entries under month headings, oldest month first.
export function groupEntriesByMonth(entries) {
  var groups = [];
  var byKey = {};
  (entries || []).forEach(function (entry) {
    var key = entry.dateKey.slice(0, 7);
    if (!byKey[key]) {
      var label = entry.date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
      byKey[key] = { key: key, label: label, entries: [] };
      groups.push(byKey[key]);
    }
    byKey[key].entries.push(entry);
  });
  return groups;
}

// "Luke & Charlotte — together since 26 Oct 2026, 32 days and counting 💛"
export function buildShareText(input) {
  var data = input || {};
  var now = data.now || new Date();
  var days = daysTogether(now);
  var text = 'Luke & Charlotte — together since 26 Oct 2026, ' + days + ' day' + (days === 1 ? '' : 's') + ' and counting 💛';
  var moments = Number(data.momentCount || 0);
  if (moments > 0) text += ' · ' + moments + ' moment' + (moments === 1 ? '' : 's') + ' in our story';
  return text;
}

function formatStoryTime(time) {
  if (!time) return '';
  if (typeof globalThis !== 'undefined' && typeof globalThis.formatTime12h === 'function') {
    return globalThis.formatTime12h(time);
  }
  return String(time);
}

function formatStoryDate(date) {
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------- Browser boot (only runs with a DOM) ----------------
if (typeof document !== 'undefined' && typeof fetch !== 'undefined') {
  (function () {
    var user = '';
    try { user = localStorage.getItem('charlotte-user') || ''; } catch (e) { user = ''; }

    function fetchJson(url) {
      return fetch(url, { cache: 'no-store' }).then(function (res) {
        return res.json();
      }).catch(function () { return null; });
    }

    function load() {
      var list = document.getElementById('story-timeline');
      var status = document.getElementById('story-status');
      var count = document.getElementById('story-count');
      var days = document.getElementById('story-days');
      if (days) days.textContent = String(daysTogether(new Date()));
      if (status) status.textContent = 'Loading our story…';
      var other = user === 'Charlotte' ? 'Luke' : 'Charlotte';
      Promise.all([
        fetchJson('/api/timeline'),
        fetchJson('/api/calendar'),
        fetchJson('/api/question-room?view=mood&user=' + encodeURIComponent(user || 'Luke')),
        fetchJson('/api/question-room?view=mood&user=' + encodeURIComponent(other)),
        fetchJson('/api/gallery')
      ]).then(function (results) {
        var timeline = results[0] || {};
        var calendar = results[1] || {};
        var myMoods = normalizeMoodMap(results[2] || {}, user || 'Luke');
        var theirMoods = normalizeMoodMap(results[3] || {}, other);
        var moodsByPerson = {};
        [myMoods, theirMoods].forEach(function (map) {
          Object.keys(map).forEach(function (person) {
            moodsByPerson[person] = map[person];
          });
        });
        var gallery = results[4] || {};
        var entries = buildStoryEntries({
          moments: timeline.moments || [],
          calendarEvents: calendar.events || {},
          moodsByPerson: moodsByPerson,
          photos: gallery.photos || [],
          now: new Date()
        });
        render(entries, list, status, count);
      }).catch(function () {
        if (status) status.textContent = 'Our story could not load just now — try again in a moment.';
      });
    }

    function kindLabel(kind) {
      return { moment: 'Moment', event: 'Plan', mood: 'Mood', photo: 'Photo', milestone: 'Milestone' }[kind] || '';
    }

    function render(entries, list, status, count) {
      if (!list) return;
      var groups = groupEntriesByMonth(entries);
      if (count) count.textContent = entries.length ? String(entries.length) + (entries.length === 1 ? ' moment' : ' moments') : '';
      if (!entries.length) {
        if (status) status.textContent = 'Our story starts here — add a moment in the timeline and it will appear.';
        list.innerHTML = '';
        return;
      }
      if (status) status.textContent = '';
      list.innerHTML = groups.map(function (group) {
        var rows = group.entries.map(function (entry) {
          var time = entry.time ? ' · ' + escapeHtml(formatStoryTime(entry.time)) : '';
          var coming = entry.comingUp ? ' <span class="story-coming">coming up</span>' : '';
          var photo = entry.photo
            ? '<a class="story-photo" href="gallery.html"><img src="' + escapeHtml(entry.photo) + '" alt="" loading="lazy" decoding="async"></a>'
            : '';
          var body = entry.body ? '<p class="story-body">' + escapeHtml(entry.body) + '</p>' : '';
          var author = entry.author ? '<span class="story-author">' + escapeHtml(entry.author) + '</span>' : '';
          return '<article class="story-entry story-' + entry.kind + '">' +
            '<span class="story-dot" aria-hidden="true">' + escapeHtml(entry.emoji) + '</span>' +
            '<div class="story-card">' +
            '<div class="story-meta"><span class="story-date">' + escapeHtml(formatStoryDate(entry.date)) + time + '</span>' +
            '<span class="story-kind">' + kindLabel(entry.kind) + '</span>' + coming + '</div>' +
            '<h3 class="story-title">' + escapeHtml(entry.title) + '</h3>' +
            body + photo + author +
            '</div></article>';
        }).join('');
        return '<section class="story-month"><h2 class="story-month-title">' + escapeHtml(group.label) + '</h2>' + rows + '</section>';
      }).join('');
    }

    function share() {
      var button = document.getElementById('story-share');
      var status = document.getElementById('story-status');
      var countEl = document.getElementById('story-count');
      var momentCount = 0;
      if (countEl) {
        var parsed = parseInt(String(countEl.textContent || '').replace(/\D/g, ''), 10);
        momentCount = Number.isNaN(parsed) ? 0 : parsed;
      }
      var text = buildShareText({ now: new Date(), momentCount: momentCount });
      function done(message) {
        if (button) button.textContent = message;
        setTimeout(function () { if (button) button.textContent = '📤 Share our story'; }, 2500);
      }
      function fallback() {
        try {
          var area = document.createElement('textarea');
          area.value = text;
          area.setAttribute('readonly', '');
          area.style.position = 'absolute';
          area.style.left = '-9999px';
          document.body.appendChild(area);
          area.select();
          document.execCommand('copy');
          document.body.removeChild(area);
          done('Copied ✓');
        } catch (e) {
          if (status) status.textContent = text;
          done('Copy this:');
        }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done('Copied ✓'); }, fallback);
      } else {
        fallback();
      }
    }

    document.addEventListener('DOMContentLoaded', function () {
      load();
      var button = document.getElementById('story-share');
      if (button) button.addEventListener('click', share);
    });
  })();
}
