// Photo of the day.
//
// One gallery photo per day, picked deterministically from the date so
// Luke and Charlotte see the SAME photo on the same day on both devices.
// The pick hashes the local date key ("YYYY-MM-DD") — never Math.random,
// so the choice cannot drift between devices.
//
// Only photos the card can actually show are eligible: entries with a
// signed url. Google Photos entries have no url until the gallery's
// Google sign-in loads them, so they are skipped here rather than shown
// broken. Photos listed in several albums are counted once (dedupe by id).
//
// Plain script (no imports/exports) so it loads with a normal <script>
// tag, and so Node tests can import it for its side effects. Exposes
// window.pickPhotoOfTheDay, window.photoOfTheDayDate and
// window.photoOfTheDayKey.
(function (root) {
  function hashDateKey(key) {
    // FNV-1a, 32-bit — small, deterministic, spreads dates evenly.
    var hash = 0x811c9dc5;
    var str = String(key || '');
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash;
  }

  function viewable(photo) {
    return !!photo && typeof photo.url === 'string' && photo.url.length > 0 && !photo.videoId;
  }

  function pickPhotoOfTheDay(photos, dateKey) {
    var seen = {};
    var list = [];
    (Array.isArray(photos) ? photos : []).forEach(function (photo) {
      if (!viewable(photo) || !photo.id || seen[photo.id]) return;
      seen[photo.id] = true;
      list.push(photo);
    });
    list.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
    if (!list.length) return null;
    return list[hashDateKey(dateKey) % list.length];
  }

  function photoOfTheDayDate(photo) {
    if (photo && photo.uploadedAt && !Number.isNaN(Date.parse(photo.uploadedAt))) return new Date(photo.uploadedAt);
    var match = /^(\d{13})-/.exec((photo && photo.name) || '');
    var stamp = match ? Number(match[1]) : NaN;
    return stamp ? new Date(stamp) : null;
  }

  function localDateKey(date) {
    var d = date || new Date();
    function pad(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function albumLabel(photo) {
    if (photo.album === 'Old Photos') return 'Older photos';
    if (photo.album === 'General') return 'Our memories';
    return photo.album || '';
  }

  function render() {
    var card = document.getElementById('photoDayCard');
    if (!card) return;
    var img = document.getElementById('photoDayImg');
    var empty = document.getElementById('photoDayEmpty');
    var caption = document.getElementById('photoDayCaption');
    var dateEl = document.getElementById('photoDayDate');

    function showEmpty(message) {
      if (img) { img.hidden = true; img.removeAttribute('src'); }
      if (empty) empty.hidden = false;
      if (caption) caption.textContent = message;
      if (dateEl) dateEl.textContent = '';
    }

    function showPhoto(photo) {
      var taken = photoOfTheDayDate(photo);
      if (img) {
        img.onerror = function () { showEmpty('No photos yet — add one in the gallery'); };
        img.alt = photo.caption ? photo.caption : 'Photo of the day';
        img.src = photo.url;
        img.hidden = false;
      }
      if (empty) empty.hidden = true;
      if (caption) caption.textContent = photo.caption || (photo.album ? 'From ' + albumLabel(photo) : 'Our photo of the day');
      if (dateEl) dateEl.textContent = taken ? taken.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    }

    fetch('/api/gallery', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (result) {
        var photo = result ? pickPhotoOfTheDay(result.photos || [], localDateKey()) : null;
        if (photo) showPhoto(photo);
        else showEmpty('No photos yet — add one in the gallery');
      })
      .catch(function () { showEmpty('No photos yet — add one in the gallery'); });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
    else render();
  }

  root.pickPhotoOfTheDay = pickPhotoOfTheDay;
  root.photoOfTheDayDate = photoOfTheDayDate;
  root.photoOfTheDayKey = localDateKey;
})(typeof window !== 'undefined' ? window : globalThis);
