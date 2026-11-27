import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPEN_WHEN_LETTERS,
  storageKeyFor,
  loadOpened,
  saveOpened,
  markOpened,
  openedCount,
  formatOpenedDate,
} from '../assets/js/open-when-letters.js';

function fakeStorage(initial) {
  var store = new Map(Object.entries(initial || {}));
  return {
    getItem: function (key) { return store.has(key) ? store.get(key) : null; },
    setItem: function (key, value) { store.set(key, String(value)); },
    removeItem: function (key) { store.delete(key); },
  };
}

test('eight letters, each with a unique id, emoji, title and a real letter', function () {
  assert.equal(OPEN_WHEN_LETTERS.length, 8);
  var ids = new Set();
  OPEN_WHEN_LETTERS.forEach(function (letter) {
    assert.match(letter.id, /^[a-z0-9-]+$/, 'kebab-case id: ' + letter.id);
    assert.ok(!ids.has(letter.id), 'duplicate id: ' + letter.id);
    ids.add(letter.id);
    assert.ok(letter.emoji, 'emoji for ' + letter.id);
    assert.ok(letter.title.startsWith('Open when'), 'title for ' + letter.id);
    assert.ok(Array.isArray(letter.body) && letter.body.length >= 3, 'at least 3 paragraphs: ' + letter.id);
    letter.body.forEach(function (para) {
      assert.equal(typeof para, 'string');
      assert.ok(para.trim().length >= 20, 'paragraph too short: ' + letter.id);
    });
    var words = letter.body.join(' ').split(/\s+/).length;
    assert.ok(words >= 40 && words <= 120, 'letter reads in under a minute: ' + letter.id + ' (' + words + ' words)');
  });
});

test('opened state is per user and survives a round trip', function () {
  var storage = fakeStorage();
  assert.equal(storageKeyFor('Luke'), 'open-when-opened:Luke');
  assert.notEqual(storageKeyFor('Luke'), storageKeyFor('Charlotte'));
  assert.deepEqual(loadOpened(storage, 'Luke'), {});
  var when = new Date(2026, 10, 28, 0, 5, 0);
  var opened = markOpened({}, 'miss-me', when);
  assert.equal(openedCount(opened), 1);
  saveOpened(storage, 'Luke', opened);
  var loaded = loadOpened(storage, 'Luke');
  assert.equal(loaded['miss-me'], when.toISOString());
  assert.deepEqual(loadOpened(storage, 'Charlotte'), {});
  // Marking again replaces the date, it does not add a second entry.
  var again = markOpened(loaded, 'miss-me', new Date(2026, 10, 29, 9, 0, 0));
  assert.equal(openedCount(again), 1);
});

test('corrupt stored data starts fresh instead of breaking the page', function () {
  var storage = fakeStorage({ 'open-when-opened:Luke': 'not json{{' });
  assert.deepEqual(loadOpened(storage, 'Luke'), {});
  var arrayStorage = fakeStorage({ 'open-when-opened:Luke': '["miss-me"]' });
  assert.deepEqual(loadOpened(arrayStorage, 'Luke'), {});
});

test('opened dates format en-AU short', function () {
  var noon = new Date(2026, 10, 28, 12, 0, 0);
  assert.equal(formatOpenedDate(noon.toISOString()), '28 Nov 2026');
  assert.equal(formatOpenedDate('garbage'), 'garbage');
});
