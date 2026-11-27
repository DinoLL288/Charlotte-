import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/js/milestones.js';

const M = globalThis.Milestones;
const SINCE = new Date('2026-10-26T17:46:00');

test('days together is 0 on the first day', () => {
  assert.equal(M.daysTogether(SINCE, new Date('2026-10-26T20:00:00')), 0);
});

test('days together is 1 after a full day', () => {
  assert.equal(M.daysTogether(SINCE, new Date('2026-10-27T17:46:00')), 1);
  assert.equal(M.daysTogether(SINCE, new Date('2026-10-27T17:45:00')), 0);
});

test('days together counts a month', () => {
  assert.equal(M.daysTogether(SINCE, new Date('2026-11-26T17:46:00')), 31);
});

test('days together returns null for bad input', () => {
  assert.equal(M.daysTogether('not a date', new Date()), null);
  assert.equal(M.daysTogether(SINCE, 'not a date'), null);
});

test('next milestone after 32 days is 50', () => {
  const next = M.nextMilestone(32, SINCE);
  assert.equal(next.target, 50);
  assert.equal(next.inDays, 18);
  assert.equal(next.date.toISOString().slice(0, 10), '2026-12-15');
});

test('next milestone just before a round number', () => {
  assert.equal(M.nextMilestone(99, SINCE).target, 100);
  assert.equal(M.nextMilestone(99, SINCE).inDays, 1);
  assert.equal(M.nextMilestone(364, SINCE).target, 365);
  assert.equal(M.nextMilestone(364, SINCE).inDays, 1);
});

test('next milestone moves past a reached round number', () => {
  assert.equal(M.nextMilestone(100, SINCE).target, 150);
  assert.equal(M.nextMilestone(365, SINCE).target, 400);
  assert.equal(M.nextMilestone(999, SINCE).target, 1000);
});

test('next milestone returns null for bad input', () => {
  assert.equal(M.nextMilestone(null, SINCE), null);
  assert.equal(M.nextMilestone(NaN, SINCE), null);
});

test('streaks are zero with no data', () => {
  assert.deepEqual(M.streaks([], new Date('2026-11-27')), { current: 0, longest: 0 });
});

test('streak counts today and yesterday', () => {
  const keys = ['2026-11-27', '2026-11-26', '2026-11-25'];
  assert.deepEqual(M.streaks(keys, new Date('2026-11-27')), { current: 3, longest: 3 });
});

test('current streak survives today not being logged yet', () => {
  const keys = ['2026-11-26', '2026-11-25'];
  assert.deepEqual(M.streaks(keys, new Date('2026-11-27')), { current: 2, longest: 2 });
});

test('a gap breaks the current streak but not the longest', () => {
  const keys = [
    '2026-11-27', '2026-11-26',
    '2026-11-20', '2026-11-19', '2026-11-18', '2026-11-17', '2026-11-16',
  ];
  assert.deepEqual(M.streaks(keys, new Date('2026-11-27')), { current: 2, longest: 5 });
});

test('an old run alone gives a zero current streak', () => {
  const keys = ['2026-11-10', '2026-11-09', '2026-11-08'];
  assert.deepEqual(M.streaks(keys, new Date('2026-11-27')), { current: 0, longest: 3 });
});

test('total moods counts both people', () => {
  const entries = {
    Luke: { '2026-11-27': [{ mood: '😊' }, { mood: '🥰' }], '2026-11-26': [{ mood: '🌙' }] },
    Charlotte: { '2026-11-27': [{ mood: '😊' }] },
  };
  assert.equal(M.totalMoods(entries), 4);
  assert.equal(M.totalMoods({}), 0);
  assert.equal(M.totalMoods(null), null);
});

test('total events counts every date', () => {
  const events = { '2026-11-27': [{}, {}], '2026-11-28': [{}] };
  assert.equal(M.totalEvents(events), 3);
  assert.equal(M.totalEvents({}), 0);
  assert.equal(M.totalEvents(null), null);
});

test('total photos counts the list, null when missing', () => {
  assert.equal(M.totalPhotos([{ id: 1 }, { id: 2 }]), 2);
  assert.equal(M.totalPhotos([]), 0);
  assert.equal(M.totalPhotos(null), null);
});

test('mood date keys union both people', () => {
  const entries = {
    Luke: { '2026-11-27': [{ mood: '😊' }] },
    Charlotte: { '2026-11-26': [{ mood: '🌙' }], '2026-11-27': [{ mood: '🥰' }] },
  };
  assert.deepEqual(M.moodDateKeys(entries).sort(), ['2026-11-26', '2026-11-27']);
  assert.deepEqual(M.moodDateKeys(null), []);
});

test('normalize keeps the new per-person shape', () => {
  const raw = { Luke: { '2026-11-27': [{ mood: '😊' }] }, Charlotte: {} };
  assert.deepEqual(M.normalizeMoodEntries(raw, 'Luke'), raw);
});

test('normalize treats the old flat shape as the current user', () => {
  const raw = { '2026-11-27': [{ mood: '😊' }] };
  const out = M.normalizeMoodEntries(raw, 'Luke');
  assert.deepEqual(out, { Luke: { '2026-11-27': [{ mood: '😊' }] } });
});

test('normalize returns null for missing data', () => {
  assert.equal(M.normalizeMoodEntries(null, 'Luke'), null);
  assert.equal(M.normalizeMoodEntries(undefined, 'Luke'), null);
});
