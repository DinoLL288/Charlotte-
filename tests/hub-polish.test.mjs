import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/js/format-time.js'; // loads window.formatTime12h for the countdown
import { shouldShowBackToTop, BACK_TO_TOP_THRESHOLD } from '../assets/js/back-to-top.js';
import { renderNextUp } from '../assets/js/next-up.js';

// Friday 27 Nov 2026, 9:00am local.
function morning() {
  return new Date(2026, 10, 27, 9, 0, 0);
}

function stubEl(variant) {
  const removed = [];
  return {
    el: {
      innerHTML: '',
      tagName: 'A',
      href: 'calendar.html',
      hidden: false,
      getAttribute: function () { return variant; },
      setAttribute: function (key, value) { this[key] = value; },
      removeAttribute: function () {},
      classList: { remove: function (name) { removed.push(name); } }
    },
    removed
  };
}

test('back to top stays hidden at the top of a page', function () {
  assert.equal(shouldShowBackToTop(0), false);
  assert.equal(shouldShowBackToTop(100), false);
  assert.equal(shouldShowBackToTop(599), false);
  assert.equal(shouldShowBackToTop(600), false);
});

test('back to top appears once the page is scrolled down', function () {
  assert.equal(shouldShowBackToTop(601), true);
  assert.equal(shouldShowBackToTop(2000), true);
});

test('back to top appears after 600px of scrolling', function () {
  assert.equal(BACK_TO_TOP_THRESHOLD, 600);
});

test('back to top accepts a custom threshold', function () {
  assert.equal(shouldShowBackToTop(100, 50), true);
  assert.equal(shouldShowBackToTop(49, 50), false);
});

test('renderNextUp clears the loading shimmer when it shows the empty state', function () {
  const { el, removed } = stubEl('card');
  renderNextUp(el, null, morning());
  assert.deepEqual(removed, ['is-loading']);
  assert.match(el.innerHTML, /Nothing planned yet/);
  assert.match(el.innerHTML, /Add a date on the calendar/);
});

test('renderNextUp clears the loading shimmer when it shows a countdown', function () {
  const { el, removed } = stubEl('card');
  const target = {
    icon: '💛',
    title: 'Movie night',
    dateKey: '2026-11-27',
    startTime: '18:00',
    at: new Date(2026, 10, 27, 18, 0, 0),
    special: false
  };
  renderNextUp(el, target, morning());
  assert.deepEqual(removed, ['is-loading']);
  assert.match(el.innerHTML, /today at 6:00 PM/);
});
