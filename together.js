/*
  Live counter for our anniversary.
  26 October 2026, 5:46 pm (local time).

  It shows days, hours and minutes and only updates when a minute passes, so
  nothing ticks while you are trying to focus. It counts up once when the page
  opens. To bring the ticking seconds back, set SHOW_SECONDS to true.
*/
(function () {
  var SHOW_SECONDS = false;
  var START = new Date(2026, 9, 26, 17, 46, 0); // month is 0-based: 9 = October
  var targets = document.querySelectorAll('[data-together]');
  if (!targets.length) return;

  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function values() {
    var diff = Math.max(0, Date.now() - START.getTime());
    return [
      { key: 'days', value: Math.floor(diff / 86400000), pad: false },
      { key: 'hours', value: Math.floor(diff / 3600000) % 24, pad: true },
      { key: 'minutes', value: Math.floor(diff / 60000) % 60, pad: true },
      { key: 'seconds', value: Math.floor(diff / 1000) % 60, pad: true }
    ].slice(0, SHOW_SECONDS ? 4 : 3);
  }

  function labelFor(item) {
    return item.key === 'days' && item.value === 1 ? 'day' : item.key;
  }

  function show(item, number) {
    return item.pad ? pad(number) : String(number);
  }

  function build() {
    var html = values().map(function (item) {
      return '<span class="unit" data-unit="' + item.key + '"><span class="num">' + show(item, 0) +
        '</span><span class="label">' + labelFor(item) + '</span></span>';
    }).join('');
    targets.forEach(function (target) { target.innerHTML = html; });
  }

  function update(progress) {
    var items = values();
    targets.forEach(function (target) {
      items.forEach(function (item) {
        var unit = target.querySelector('[data-unit="' + item.key + '"]');
        if (!unit) return;
        unit.querySelector('.num').textContent = show(item, Math.round(item.value * progress));
        unit.querySelector('.label').textContent = labelFor(item);
      });
    });
  }

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.documentElement.dataset.reducedMotion === 'true') reduced = true;

  build();

  if (reduced) {
    update(1);
  } else {
    // Count up once, easing out, then settle.
    var begin = null;
    var length = 1400;
    (function frame(now) {
      if (begin === null) begin = now;
      var t = Math.min(1, (now - begin) / length);
      update(1 - Math.pow(1 - t, 4));
      if (t < 1) requestAnimationFrame(frame);
    })(performance.now());
  }

  setInterval(function () { update(1); }, SHOW_SECONDS ? 1000 : 30000);
})();
