import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/js/format-time.js';

const { formatTime12h, formatDateTime12h } = globalThis;

test('midnight is 12:00 AM', () => {
  assert.equal(formatTime12h('00:00'), '12:00 AM');
});

test('noon is 12:00 PM', () => {
  assert.equal(formatTime12h('12:00'), '12:00 PM');
});

test('afternoon drops the leading zero', () => {
  assert.equal(formatTime12h('13:05'), '1:05 PM');
});

test('morning keeps a single-digit hour', () => {
  assert.equal(formatTime12h('09:30'), '9:30 AM');
});

test('late night is 11:59 PM', () => {
  assert.equal(formatTime12h('23:59'), '11:59 PM');
});

test('single-digit minutes stay two digits', () => {
  assert.equal(formatTime12h('03:05'), '3:05 AM');
});

test('seconds in the value are ignored', () => {
  assert.equal(formatTime12h('15:04:30'), '3:04 PM');
});

test('a Date input formats in local time', () => {
  assert.equal(formatTime12h(new Date(2026, 10, 27, 15, 5)), '3:05 PM');
  assert.equal(formatTime12h(new Date(2026, 10, 27, 0, 0)), '12:00 AM');
});

test('unparseable input passes through unchanged', () => {
  assert.equal(formatTime12h('soon'), 'soon');
  assert.equal(formatTime12h(''), '');
});

test('date+time stamp keeps the date and forces 12-hour time', () => {
  const stamp = formatDateTime12h(new Date(2026, 10, 27, 15, 5), { dateStyle: 'medium', timeStyle: 'short' });
  assert.match(stamp, /3:05 PM/);
  assert.match(stamp, /27 Nov 2026/);
});

test('time-only stamp is just the 12-hour time', () => {
  assert.equal(formatDateTime12h(new Date(2026, 10, 27, 9, 30), { timeStyle: 'short' }), '9:30 AM');
});

test('invalid date gives an empty stamp', () => {
  assert.equal(formatDateTime12h('not a date'), '');
});
