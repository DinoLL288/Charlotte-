import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_IDEAS,
  MAX_IDEAS,
  filterIdeas,
  pickIndex,
  normaliseAngle,
  segmentSize,
  segmentForRotation,
  spinTargetRotation,
  isDuplicateIdea,
  loadCustomIdeas,
  saveCustomIdeas,
} from '../assets/js/date-spinner.js';

function fakeStorage(initial) {
  var store = new Map(Object.entries(initial || {}));
  return {
    getItem: function (key) { return store.has(key) ? store.get(key) : null; },
    setItem: function (key, value) { store.set(key, String(value)); },
    removeItem: function (key) { store.delete(key); },
  };
}

test('default ideas cover every category and fit on the wheel', function () {
  assert.ok(DEFAULT_IDEAS.length >= 2);
  assert.ok(DEFAULT_IDEAS.length <= MAX_IDEAS);
  var cats = new Set(DEFAULT_IDEAS.map(function (idea) { return idea.category; }));
  assert.ok(cats.has('home'));
  assert.ok(cats.has('out'));
  assert.ok(cats.has('treats'));
  DEFAULT_IDEAS.forEach(function (idea) {
    assert.ok(idea.label && idea.label.length <= 14, 'label short enough for a wheel segment: ' + idea.label);
    assert.ok(idea.emoji);
    assert.ok(idea.line);
  });
});

test('filterIdeas returns all ideas for "all" and only matching ones otherwise', function () {
  assert.equal(filterIdeas(DEFAULT_IDEAS, 'all').length, DEFAULT_IDEAS.length);
  assert.equal(filterIdeas(DEFAULT_IDEAS, 'home').length, 4);
  assert.equal(filterIdeas(DEFAULT_IDEAS, 'out').length, 4);
  assert.equal(filterIdeas(DEFAULT_IDEAS, 'treats').length, 2);
  assert.ok(filterIdeas(DEFAULT_IDEAS, 'home').every(function (idea) { return idea.category === 'home'; }));
  // Filtering must not mutate the input.
  assert.equal(DEFAULT_IDEAS.length, 10);
});

test('pickIndex stays inside the wheel', function () {
  for (var i = 0; i < 200; i++) {
    var idx = pickIndex(10);
    assert.ok(idx >= 0 && idx < 10);
  }
  assert.equal(pickIndex(4, function () { return 0; }), 0);
  assert.equal(pickIndex(4, function () { return 0.999; }), 3);
});

test('normaliseAngle wraps into [0, 360)', function () {
  assert.equal(normaliseAngle(0), 0);
  assert.equal(normaliseAngle(360), 0);
  assert.equal(normaliseAngle(-90), 270);
  assert.equal(normaliseAngle(720 + 45), 45);
});

test('segmentSize divides the wheel evenly', function () {
  assert.equal(segmentSize(10), 36);
  assert.equal(segmentSize(4), 90);
});

test('segmentForRotation finds the segment under the pointer', function () {
  // No rotation: segment 0 starts at the top.
  assert.equal(segmentForRotation(0, 10), 0);
  // Rotating the wheel 36deg clockwise moves segment 9 under the pointer.
  assert.equal(segmentForRotation(36, 10), 9);
  assert.equal(segmentForRotation(360, 8), 0);
  assert.equal(segmentForRotation(-45, 8), 1);
});

test('spinTargetRotation lands the chosen segment under the pointer', function () {
  [2, 4, 5, 8, 10, 12].forEach(function (count) {
    for (var index = 0; index < count; index++) {
      [0, 137, 1440, 2523].forEach(function (current) {
        var target = spinTargetRotation(current, index, count, 5);
        assert.ok(target > current, 'wheel must spin forwards');
        assert.ok(target >= current + 5 * 360, 'at least five full turns');
        assert.equal(segmentForRotation(target, count), index);
      });
    }
  });
});

test('isDuplicateIdea matches case-insensitively and ignores blank labels', function () {
  assert.equal(isDuplicateIdea(DEFAULT_IDEAS, 'movie night'), true);
  assert.equal(isDuplicateIdea(DEFAULT_IDEAS, 'MOVIE NIGHT'), true);
  assert.equal(isDuplicateIdea(DEFAULT_IDEAS, '  Movie Night  '), true);
  assert.equal(isDuplicateIdea(DEFAULT_IDEAS, 'kayaking'), false);
  assert.equal(isDuplicateIdea(DEFAULT_IDEAS, ''), true);
  assert.equal(isDuplicateIdea(DEFAULT_IDEAS, '   '), true);
});

test('custom ideas round-trip through storage and bad data is ignored', function () {
  var storage = fakeStorage();
  assert.deepEqual(loadCustomIdeas(storage), []);
  saveCustomIdeas(storage, [{ label: 'Kayaking', emoji: '🛶', category: 'out', line: 'Paddle!' }]);
  var loaded = loadCustomIdeas(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].label, 'Kayaking');
  assert.equal(loaded[0].custom, true);

  var broken = fakeStorage({ 'date-spinner-custom': 'not json{' });
  assert.deepEqual(loadCustomIdeas(broken), []);
  var wrongShape = fakeStorage({ 'date-spinner-custom': JSON.stringify({ label: 'nope' }) });
  assert.deepEqual(loadCustomIdeas(wrongShape), []);
});
