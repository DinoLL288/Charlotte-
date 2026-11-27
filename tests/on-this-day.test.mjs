import test from 'node:test';
import assert from 'node:assert/strict';
import { pickOnThisDay, describeWhen, normalizeMoods } from '../assets/js/on-this-day.js';

// Friday 27 Nov 2026 — the day the feature was built.
function today() {
  return new Date(2026, 10, 27, 12, 0, 0);
}

test('picks the same-date mood and photo from a past year', function () {
  const picked = pickOnThisDay({
    today: today(),
    moods: {
      Luke: {
        '2025-11-27': [{ mood: '😊', intensity: 4, note: 'Great day', time: '' }],
        '2024-11-27': [{ mood: '🌙', intensity: 2, note: '', time: '' }]
      },
      Charlotte: {
        '2025-11-27': [{ mood: '🥰', intensity: 5, note: '', time: '' }]
      }
    },
    photos: [
      { uploadedAt: '2025-11-27T08:00:00.000Z', url: 'https://example.com/beach.jpg', name: 'Beach day', uploadedBy: 'Luke' },
      { uploadedAt: '2026-11-01T08:00:00.000Z', url: 'https://example.com/newer.jpg', name: 'Newer photo', uploadedBy: 'Charlotte' }
    ]
  });
  assert.equal(picked.kind, 'same-day');
  assert.equal(picked.heading, 'a year ago today');
  // Most recent same-day year (2025), one mood per person.
  assert.equal(picked.moods.length, 2);
  assert.equal(picked.moods.find(m => m.person === 'Luke').emoji, '😊');
  assert.equal(picked.moods.find(m => m.person === 'Charlotte').emoji, '🥰');
  assert.equal(picked.moods.find(m => m.person === 'Luke').note, 'Great day');
  // The same-day photo wins over the newer one.
  assert.equal(picked.photo.url, 'https://example.com/beach.jpg');
  assert.equal(picked.photo.when, 'a year ago today');
});

test('falls back to the most recent past mood and photo, labelled honestly', function () {
  const picked = pickOnThisDay({
    today: today(),
    moods: {
      Luke: { '2026-08-27': [{ mood: '😊', intensity: 3, note: '', time: '' }] },
      Charlotte: { '2026-08-27': [{ mood: '💛', intensity: 4, note: '', time: '' }] }
    },
    photos: [
      { uploadedAt: '2026-09-23T08:00:00.000Z', url: 'https://example.com/sep.jpg', name: 'September photo', uploadedBy: 'Charlotte' }
    ]
  });
  assert.equal(picked.kind, 'recent');
  assert.equal(picked.moods.length, 2);
  assert.equal(picked.moods[0].when, '3 months ago');
  assert.equal(picked.photo.url, 'https://example.com/sep.jpg');
  assert.equal(picked.photo.when, '2 months ago');
});

test('returns nothing honestly when there is no past data', function () {
  assert.deepEqual(pickOnThisDay({ today: today(), moods: {}, photos: [] }), {
    kind: 'none', heading: '', moods: [], photo: null
  });
  // Entries dated today are not memories yet.
  assert.equal(pickOnThisDay({
    today: today(),
    moods: { Luke: { '2026-11-27': [{ mood: '😊', intensity: 3, note: '', time: '' }] } },
    photos: [{ uploadedAt: '2026-11-27T08:00:00.000Z', url: 'https://example.com/today.jpg', name: 'Today', uploadedBy: 'Luke' }]
  }).kind, 'none');
});

test('skips photos with no URL and moods with no emoji', function () {
  const picked = pickOnThisDay({
    today: today(),
    moods: { Luke: { '2026-08-14': [{ mood: '', intensity: 3, note: '', time: '' }] } },
    photos: [{ uploadedAt: '2026-10-01T08:00:00.000Z', url: '', name: 'No URL', uploadedBy: 'Luke' }]
  });
  assert.equal(picked.kind, 'none');
});

test('describeWhen labels past dates honestly', function () {
  const now = today();
  assert.equal(describeWhen(new Date(2025, 10, 27), now), 'a year ago today');
  assert.equal(describeWhen(new Date(2024, 10, 27), now), '2 years ago today');
  assert.equal(describeWhen(new Date(2026, 10, 26), now), 'yesterday');
  assert.equal(describeWhen(new Date(2026, 10, 24), now), '3 days ago');
  assert.equal(describeWhen(new Date(2026, 10, 20), now), 'last week');
  assert.equal(describeWhen(new Date(2026, 8, 23), now), '2 months ago');
  assert.equal(describeWhen(new Date(2025, 10, 26), now), 'last year');
});

test('normalizeMoods handles the per-user and flat shapes', function () {
  const perUser = normalizeMoods({
    Luke: { '2026-11-27': [{ mood: '😊', intensity: 4, note: 'Hi', time: '' }] }
  }, 'Luke');
  assert.equal(perUser.Luke['2026-11-27'][0].mood, '😊');
  const flat = normalizeMoods({ '2026-11-27': '😊' }, 'Charlotte');
  assert.equal(flat.Charlotte['2026-11-27'][0].mood, '😊');
  assert.deepEqual(normalizeMoods(null, 'Luke'), {});
});
