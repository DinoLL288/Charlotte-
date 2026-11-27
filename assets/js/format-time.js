// Shared 12-hour clock formatting.
//
// Site times used to render through toLocaleTimeString with no locale,
// which follows the browser/OS setting — on a device set to 24-hour time
// that showed "15:00". These helpers are deterministic: "15:05" becomes
// "3:05 PM", midnight "00:00" becomes "12:00 AM", noon becomes "12:00 PM".
// Stored values stay 24-hour "HH:MM" — only what is shown changes.
//
// Plain script (no imports/exports) so it loads with a normal <script>
// tag before any page script that uses it, and so Node tests can import
// it for its side effects. Exposes window.formatTime12h and
// window.formatDateTime12h.
(function (root) {
  function parseHHMM(value) {
    var match = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim());
    if (!match) return null;
    var hours = Number(match[1]);
    var minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return { hours: hours, minutes: minutes };
  }

  function fromParts(hours, minutes) {
    var ampm = hours >= 12 ? 'PM' : 'AM';
    var h = hours % 12 || 12;
    return h + ':' + String(minutes).padStart(2, '0') + ' ' + ampm;
  }

  function partsInZone(date, timeZone) {
    if (!timeZone) return { hours: date.getHours(), minutes: date.getMinutes() };
    var parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: timeZone, hour: 'numeric', minute: '2-digit', hour12: false,
    }).formatToParts(date);
    var get = function (type) {
      var found = parts.find(function (p) { return p.type === type; });
      return Number((found && found.value) || 0);
    };
    return { hours: get('hour') % 24, minutes: get('minute') };
  }

  // "15:05" -> "3:05 PM". Also accepts "HH:MM:SS" or a Date.
  // Unparseable input is returned unchanged, like the old formatters did.
  function formatTime12h(value, options) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return '';
      var parts = partsInZone(value, options && options.timeZone);
      return fromParts(parts.hours, parts.minutes);
    }
    var parsed = parseHHMM(value);
    if (!parsed) return String(value || '');
    return fromParts(parsed.hours, parsed.minutes);
  }

  // Date -> "5 Dec 2026, 3:05 PM" (or just "3:05 PM" when only a
  // timeStyle is given). The date part stays en-AU; the time is forced
  // 12-hour with AM/PM instead of following the device setting.
  function formatDateTime12h(value, options) {
    var opts = options || {};
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    var time = formatTime12h(date, { timeZone: opts.timeZone });
    if (opts.timeStyle && !opts.dateStyle) return time;
    var datePart = date.toLocaleDateString('en-AU', {
      ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
      dateStyle: opts.dateStyle || 'medium',
    });
    return datePart + ', ' + time;
  }

  root.formatTime12h = formatTime12h;
  root.formatDateTime12h = formatDateTime12h;
})(typeof globalThis !== 'undefined' ? globalThis : this);
