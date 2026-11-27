import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/js/photo-of-the-day.js';

const { pickPhotoOfTheDay, photoOfTheDayDate } = globalThis;

function photo(id, overrides = {}) {
  return {
    id,
    url: `https://example.com/${id}.jpg`,
    caption: '',
    album: 'General',
    uploadedAt: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

function tenPhotos() {
  return Array.from({ length: 10 }, (_, i) => photo(`photo-${String(i + 1).padStart(2, '0')}`));
}

test('same date picks the same photo', () => {
  const photos = tenPhotos();
  assert.equal(pickPhotoOfTheDay(photos, '2026-11-27'), pickPhotoOfTheDay(photos, '2026-11-27'));
});

test('different dates can pick different photos', () => {
  const photos = tenPhotos();
  const picks = new Set();
  for (let day = 1; day <= 30; day++) {
    picks.add(pickPhotoOfTheDay(photos, `2026-11-${String(day).padStart(2, '0')}`).id);
  }
  assert.ok(picks.size >= 2, `expected several different photos across 30 days, got ${picks.size}`);
});

test('empty gallery returns nothing honestly', () => {
  assert.equal(pickPhotoOfTheDay([], '2026-11-27'), null);
  assert.equal(pickPhotoOfTheDay(null, '2026-11-27'), null);
});

test('a single photo is always picked', () => {
  const only = photo('only-one');
  assert.equal(pickPhotoOfTheDay([only], '2026-11-27'), only);
  assert.equal(pickPhotoOfTheDay([only], '2027-03-09'), only);
});

test('photos without a usable url are skipped', () => {
  const good = photo('good-one');
  const google = photo('google-one', { url: '' });
  assert.equal(pickPhotoOfTheDay([google, good], '2026-11-27'), good);
  assert.equal(pickPhotoOfTheDay([google], '2026-11-27'), null);
});

test('the pick does not depend on the order the photos arrive in', () => {
  const photos = tenPhotos();
  const shuffled = [...photos].reverse();
  assert.equal(pickPhotoOfTheDay(photos, '2026-11-27'), pickPhotoOfTheDay(shuffled, '2026-11-27'));
});

test('a photo in several albums is only counted once', () => {
  const a = photo('a', { album: 'General' });
  const aAgain = photo('a', { album: 'Old Photos' });
  const b = photo('b');
  const picks = new Set();
  for (let day = 1; day <= 30; day++) {
    picks.add(pickPhotoOfTheDay([a, aAgain, b], `2026-11-${String(day).padStart(2, '0')}`).id);
  }
  assert.ok(picks.has('a') && picks.has('b'), `expected both photos to appear, got ${[...picks]}`);
});

test('photo date comes from uploadedAt, then the name stamp, then nothing', () => {
  assert.equal(photoOfTheDayDate(photo('x', { uploadedAt: '2026-03-09T08:00:00.000Z' })).toISOString(), '2026-03-09T08:00:00.000Z');
  assert.equal(photoOfTheDayDate(photo('x', { uploadedAt: '', name: '1793436357564-beach.png' })).getTime(), 1793436357564);
  assert.equal(photoOfTheDayDate(photo('x', { uploadedAt: '', name: 'beach.png' })), null);
});
