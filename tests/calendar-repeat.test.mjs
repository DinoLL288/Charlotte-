import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expandRepeat,
  normalizeFor,
  isValidFor,
  REPEAT_FREQUENCIES
} from '../functions/api/calendar.js';

test('expandRepeat daily lists every day up to the until date', function () {
  assert.deepEqual(
    expandRepeat('2026-11-30', 'daily', '2026-12-02'),
    ['2026-11-30', '2026-12-01', '2026-12-02']
  );
});

test('expandRepeat weekly steps seven days at a time', function () {
  assert.deepEqual(
    expandRepeat('2026-11-30', 'weekly', '2026-12-21'),
    ['2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21']
  );
});

test('expandRepeat weekdays skips Saturday and Sunday', function () {
  // 2026-11-27 is a Friday; the next weekday is Monday 30 Nov.
  assert.deepEqual(
    expandRepeat('2026-11-27', 'weekdays', '2026-12-02'),
    ['2026-11-27', '2026-11-30', '2026-12-01', '2026-12-02']
  );
  // Starting on a Saturday lands on the Monday after.
  assert.deepEqual(
    expandRepeat('2026-11-28', 'weekdays', '2026-11-30'),
    ['2026-11-30']
  );
});

test('expandRepeat monthly keeps the same day and skips short months', function () {
  assert.deepEqual(
    expandRepeat('2026-11-15', 'monthly', '2027-02-15'),
    ['2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15']
  );
  // 31 January has no 31 February, so February is skipped entirely.
  assert.deepEqual(
    expandRepeat('2027-01-31', 'monthly', '2027-04-30'),
    ['2027-01-31', '2027-03-31']
  );
});

test('expandRepeat caps a long series at 52 instances', function () {
  const dates = expandRepeat('2026-11-30', 'daily', '2027-12-31');
  assert.equal(dates.length, 52);
  assert.equal(dates[0], '2026-11-30');
  assert.equal(dates[51], '2027-01-20');
});

test('expandRepeat returns only the start date when until is the start date', function () {
  assert.deepEqual(
    expandRepeat('2026-11-30', 'weekly', '2026-11-30'),
    ['2026-11-30']
  );
  assert.deepEqual(expandRepeat('2026-11-30', 'daily', '2026-11-29'), []);
});

test('normalizeFor defaults anything unknown to both', function () {
  assert.equal(normalizeFor('both'), 'both');
  assert.equal(normalizeFor('Luke'), 'Luke');
  assert.equal(normalizeFor('Charlotte'), 'Charlotte');
  assert.equal(normalizeFor(undefined), 'both');
  assert.equal(normalizeFor(''), 'both');
  assert.equal(normalizeFor('everyone'), 'both');
});

test('isValidFor only accepts the three audience values', function () {
  assert.equal(isValidFor('both'), true);
  assert.equal(isValidFor('Luke'), true);
  assert.equal(isValidFor('Charlotte'), true);
  assert.equal(isValidFor('Us'), false);
  assert.equal(isValidFor(undefined), false);
});

test('REPEAT_FREQUENCIES lists the four supported repeats', function () {
  assert.deepEqual(REPEAT_FREQUENCIES, ['daily', 'weekly', 'weekdays', 'monthly']);
});
