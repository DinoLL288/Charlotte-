import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  nextOccurrence,
  isCountdownEvent,
  findNextUp,
  describeCountdown,
  renderNextUp
} from '../assets/js/next-up.js';

// Friday 27 Nov 2026, 9:00am local — the morning the countdown was built.
function morning() {
  return new Date(2026, 10, 27, 9, 0, 0);
}

const SPECIALS = [
  { id: 'charlotte-birthday', title: 'Charlotte’s birthday', date: '03-09', icon: '🎂' },
  { id: 'luke-birthday', title: 'Luke’s birthday', date: '07-21', icon: '🎂' },
  { id: 'anniversary', title: 'Our anniversary', date: '10-26', icon: '💛' }
];

function stubEl(variant, tag) {
  return {
    innerHTML: '',
    tagName: tag || 'A',
    href: 'calendar.html',
    hidden: false,
    getAttribute: function () { return variant; },
    setAttribute: function (name, value) { this[name] = value; },
    removeAttribute: function (name) { delete this[name]; }
  };
}

test('escapeHtml escapes markup in event titles', function () {
  assert.equal(escapeHtml('<b>hi</b> & "you"'), '&lt;b&gt;hi&lt;/b&gt; &amp; &quot;you&quot;');
});

test('nextOccurrence returns the next yearly date, rolling to next year', function () {
  var now = morning(); // 27 Nov 2026
  assert.equal(nextOccurrence('03-09', now).getFullYear(), 2027);
  assert.equal(nextOccurrence('03-09', now).getMonth(), 2);
  assert.equal(nextOccurrence('03-09', now).getDate(), 9);
  assert.equal(nextOccurrence('12-25', now).getFullYear(), 2026);
  assert.equal(nextOccurrence('11-27', now).getDate(), 27);
});

test('isCountdownEvent skips shifts, quiet days and call logs', function () {
  assert.equal(isCountdownEvent({ title: 'Movie night' }), true);
  assert.equal(isCountdownEvent({ title: "Luke's job shift", startTime: '09:00' }), false);
  assert.equal(isCountdownEvent({ title: "Charlotte's job shift" }), false);
  assert.equal(isCountdownEvent({ title: '🌙 Luke · quiet day', quietDay: true }), false);
  assert.equal(isCountdownEvent({ title: 'WhatsApp voice call', kind: 'whatsapp-call' }), false);
  assert.equal(isCountdownEvent({ title: 'Birthday', specialDate: true }), false);
  assert.equal(isCountdownEvent(null), false);
});

test('findNextUp picks the earliest real plan and skips the rest', function () {
  var events = {
    '2026-11-27': [{ title: "Luke's job shift", startTime: '16:00', endTime: '21:00' }],
    '2026-11-28': [{ title: 'Movie night', startTime: '18:00' }],
    '2026-12-05': [{ title: 'Picnic', startTime: '11:00' }]
  };
  var next = findNextUp(events, SPECIALS, morning());
  assert.equal(next.title, 'Movie night');
  assert.equal(next.dateKey, '2026-11-28');
  assert.equal(next.at.getHours(), 18);
});

test('findNextUp skips past events and a start time that already passed today', function () {
  var events = {
    '2026-11-20': [{ title: 'Old plan' }],
    '2026-11-27': [{ title: 'Early brekkie', startTime: '07:00' }],
    '2026-11-29': [{ title: 'Walk & talk' }]
  };
  var next = findNextUp(events, SPECIALS, morning());
  assert.equal(next.title, 'Walk & talk');
});

test('findNextUp keeps an all-day event happening today', function () {
  var events = { '2026-11-27': [{ title: 'Anniversary dinner' }] };
  var next = findNextUp(events, SPECIALS, morning());
  assert.equal(next.title, 'Anniversary dinner');
  assert.equal(describeCountdown(next, morning()).headline, 'Today!');
});

test('findNextUp falls back to the next special date when nothing is planned', function () {
  var next = findNextUp({}, SPECIALS, morning());
  assert.equal(next.title, 'Charlotte’s birthday');
  assert.equal(next.dateKey, '2027-03-09');
});

test('findNextUp prefers a real plan over a special date on the same day', function () {
  var events = { '2027-03-09': [{ title: 'Birthday brekkie', startTime: '09:00' }] };
  var now = new Date(2027, 2, 1, 9, 0, 0);
  var next = findNextUp(events, SPECIALS, now);
  assert.equal(next.title, 'Birthday brekkie');
  assert.equal(next.special, false);
});

test('findNextUp returns null when there is nothing at all', function () {
  assert.equal(findNextUp({}, [], morning()), null);
});

test('describeCountdown words the wait for today, tomorrow and days away', function () {
  var now = morning();
  var today = describeCountdown({ title: 'Movie night', at: new Date(2026, 10, 27, 18, 0), startTime: '18:00' }, now);
  assert.equal(today.headline, 'today at 6:00 pm');
  assert.match(today.detail, /Movie night/);

  var soon = describeCountdown({ title: 'Call', at: new Date(2026, 10, 27, 9, 42), startTime: '09:42' }, now);
  assert.equal(soon.headline, 'in 42 minutes');

  var tomorrow = describeCountdown({ title: 'Picnic', at: new Date(2026, 10, 28, 11, 0), startTime: '11:00' }, now);
  assert.equal(tomorrow.headline, 'Tomorrow');

  var days = describeCountdown({ title: 'Beach day', at: new Date(2026, 11, 5, 10, 0), startTime: '10:00' }, now);
  assert.equal(days.headline, 'in 8 days');
  assert.match(days.detail, /Beach day · Sat 5 Dec/);
});

test('renderNextUp fills the hub card with the countdown', function () {
  var el = stubEl('card', 'A');
  var target = { icon: '💛', title: 'Movie night', at: new Date(2026, 10, 28, 18, 0), startTime: '18:00' };
  renderNextUp(el, target, morning());
  assert.match(el.innerHTML, /Tomorrow/);
  assert.match(el.innerHTML, /Movie night/);
  assert.match(el.innerHTML, /Next up together/);
  assert.equal(el.href, 'calendar.html');
});

test('renderNextUp fills the calendar banner and hides it when empty', function () {
  var el = stubEl('banner', 'DIV');
  var target = { icon: '🎂', title: 'Charlotte’s birthday', at: new Date(2027, 2, 9), startTime: '' };
  renderNextUp(el, target, morning());
  assert.match(el.innerHTML, /Charlotte’s birthday/);
  assert.match(el.innerHTML, /in 102 days/);

  var empty = stubEl('banner', 'DIV');
  renderNextUp(empty, null, morning());
  assert.equal(empty.hidden, '');
});

test('renderNextUp with no plans points the hub card at the date spinner', function () {
  var el = stubEl('card', 'A');
  renderNextUp(el, null, morning());
  assert.match(el.innerHTML, /Nothing planned yet/);
  assert.equal(el.href, 'date-spinner.html');
});
