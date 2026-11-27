// Milestones maths — every number on the milestones page is computed
// live from real stored data, never invented. These helpers are pure and
// deterministic so Node tests can check them exactly.
//
// Days together counts from the same moment the hub and stats page use:
// 26 October 2026 at 5:46 pm. The mood streak uses the same walk-back
// logic as mood.html renderStats (today may still be unlogged; the streak
// breaks at the first empty day before today). A day counts towards the
// shared streak when either Luke or Charlotte logged a mood that day.
//
// Plain script (no imports/exports) so it loads with a normal <script>
// tag before any page script that uses it, and so Node tests can import
// it for its side effects. Exposes window.Milestones.
(function (root) {
  var TOGETHER_SINCE = '2026-10-26T17:46:00';
  var DAY_MS = 24 * 60 * 60 * 1000;

  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  // Local date key, "YYYY-MM-DD", matching the keys mood and calendar data use.
  function dateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  // Parse a "YYYY-MM-DD" key at noon so timezone shifts never move the day.
  function parseKey(key) {
    var date = new Date(String(key || '') + 'T12:00:00');
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Full days from `since` to `now`. Invalid input returns null (the page
  // shows "—" for it); a date before `since` clamps to 0.
  function daysTogether(since, now) {
    var start = since instanceof Date ? since : new Date(since);
    var end = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
  }

  // The round numbers we celebrate: first week, first fortnight, first
  // month, then every 50 days up to 1000, every 100 after that, plus each
  // yearly anniversary (365, 730, 1095, ...). Returns the first target
  // above `days`, or null when `days` is not a number.
  function milestoneTargets() {
    var targets = [7, 14, 30];
    for (var d = 50; d <= 1000; d += 50) targets.push(d);
    for (var e = 1100; e <= 10000; e += 100) targets.push(e);
    for (var y = 1; y <= 10; y++) targets.push(365 * y);
    targets.sort(function (a, b) { return a - b; });
    return targets.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  // { target, inDays, date } for the next round-number milestone after
  // `days` days together, where `date` is the calendar date it lands on
  // (since + target days). Null when `days` is not a number.
  function nextMilestone(days, since) {
    if (typeof days !== 'number' || Number.isNaN(days)) return null;
    var start = since instanceof Date ? since : new Date(since || TOGETHER_SINCE);
    if (Number.isNaN(start.getTime())) return null;
    var targets = milestoneTargets();
    for (var i = 0; i < targets.length; i++) {
      if (targets[i] > days) {
        return {
          target: targets[i],
          inDays: targets[i] - days,
          date: new Date(start.getTime() + targets[i] * DAY_MS),
        };
      }
    }
    return null;
  }

  // Current and longest streaks from an array of "YYYY-MM-DD" keys (days
  // with at least one entry). Current walks back from `today` the way
  // mood.html renderStats does: today may still be unlogged, but the
  // streak breaks at the first empty day before today. Longest is the
  // longest run of consecutive days anywhere in the data. Empty data
  // gives { current: 0, longest: 0 } — a real zero, not a missing value.
  function streaks(dateKeys, today) {
    var days = new Set((dateKeys || []).filter(Boolean));
    var now = today instanceof Date ? today : new Date(today || Date.now());
    var current = 0;
    for (var i = 0; i < 400; i++) {
      var date = new Date(now);
      date.setDate(now.getDate() - i);
      if (days.has(dateKey(date))) current++;
      else if (i === 0) continue;
      else break;
    }
    var sorted = Array.from(days).map(parseKey).filter(Boolean).sort(function (a, b) { return a - b; });
    var longest = 0, run = 0, prev = null;
    sorted.forEach(function (d) {
      if (prev && Math.round((d - prev) / DAY_MS) === 1) run++;
      else run = 1;
      if (run > longest) longest = run;
      prev = d;
    });
    return { current: current, longest: longest };
  }

  // The mood store shape is { person: { "YYYY-MM-DD": [entry, ...] } }
  // (mood.html also accepts the old flat { "YYYY-MM-DD": ... } shape,
  // treated as the current user's). Returns the normalised per-person
  // shape, or null when there is nothing to normalise.
  function normalizeMoodEntries(raw, user) {
    if (!raw || typeof raw !== 'object') return null;
    var out = {};
    var people = (raw.Charlotte || raw.Luke) ? ['Charlotte', 'Luke'] : [user || 'Luke'];
    people.forEach(function (person) {
      var source = raw[person] || (people.length === 1 ? raw : {});
      out[person] = {};
      Object.keys(source).forEach(function (d) {
        var value = source[d];
        var arr = Array.isArray(value) ? value : (value ? [value] : []);
        var kept = arr.filter(function (v) { return v && (typeof v === 'string' ? v : v.mood); });
        if (kept.length) out[person][d] = kept;
      });
    });
    return out;
  }

  // All "YYYY-MM-DD" keys either person logged a mood on (each day once,
  // even when both people logged that day).
  function moodDateKeys(entries) {
    if (!entries || typeof entries !== 'object') return [];
    var keys = new Set();
    Object.keys(entries).forEach(function (person) {
      Object.keys(entries[person] || {}).forEach(function (d) {
        if ((entries[person][d] || []).length) keys.add(d);
      });
    });
    return Array.from(keys);
  }

  // Total mood entries logged by both people. Null when the data itself
  // is missing (the page shows "—"); 0 when it loaded but is empty.
  function totalMoods(entries) {
    if (!entries || typeof entries !== 'object') return null;
    var total = 0;
    Object.keys(entries).forEach(function (person) {
      Object.keys(entries[person] || {}).forEach(function (d) {
        total += (entries[person][d] || []).length;
      });
    });
    return total;
  }

  // Total calendar events. `events` is { "YYYY-MM-DD": [event, ...] }.
  // Null when the data itself is missing; 0 when it loaded but is empty.
  function totalEvents(events) {
    if (!events || typeof events !== 'object') return null;
    var total = 0;
    Object.keys(events).forEach(function (d) {
      total += (events[d] || []).length;
    });
    return total;
  }

  // Total photos. Null when the data itself is missing; 0 when the
  // list loaded but is empty.
  function totalPhotos(photos) {
    if (!Array.isArray(photos)) return null;
    return photos.length;
  }

  root.Milestones = {
    TOGETHER_SINCE: TOGETHER_SINCE,
    dateKey: dateKey,
    parseKey: parseKey,
    daysTogether: daysTogether,
    nextMilestone: nextMilestone,
    streaks: streaks,
    normalizeMoodEntries: normalizeMoodEntries,
    moodDateKeys: moodDateKeys,
    totalMoods: totalMoods,
    totalEvents: totalEvents,
    totalPhotos: totalPhotos,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
