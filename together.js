/*
  Live counter for our anniversary.
  26 October 2026, 5:46 pm (local time).
*/
(function () {
  var START = new Date(2026, 9, 26, 17, 46, 0); // month is 0-based: 9 = October
  var targets = document.querySelectorAll('[data-together]');
  if (!targets.length) return;

  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function render() {
    var diff = Math.max(0, Date.now() - START.getTime());
    var days = Math.floor(diff / 86400000);
    var hours = Math.floor(diff / 3600000) % 24;
    var minutes = Math.floor(diff / 60000) % 60;
    var seconds = Math.floor(diff / 1000) % 60;

    var html =
      '<span class="unit"><span class="num">' + days + '</span><span class="label">' + (days === 1 ? 'day' : 'days') + '</span></span>' +
      '<span class="unit"><span class="num">' + pad(hours) + '</span><span class="label">hours</span></span>' +
      '<span class="unit"><span class="num">' + pad(minutes) + '</span><span class="label">minutes</span></span>' +
      '<span class="unit"><span class="num">' + pad(seconds) + '</span><span class="label">seconds</span></span>';

    for (var i = 0; i < targets.length; i++) {
      targets[i].innerHTML = html;
    }
  }

  render();
  setInterval(render, 1000);
})();
