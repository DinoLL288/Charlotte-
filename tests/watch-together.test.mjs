import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeId, thumbnailUrl, syncPosition, pollDelayMs, POLL_ACTIVE_MS, POLL_PAUSED_MS, POLL_IDLE_MS } from '../assets/js/watch-together.js';

test('parseYouTubeId accepts watch, short, shorts and embed links', function () {
  assert.equal(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ?si=abc123'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('  https://youtu.be/dQw4w9WgXcQ  '), 'dQw4w9WgXcQ');
});

test('parseYouTubeId rejects non-YouTube links and bad ids', function () {
  assert.equal(parseYouTubeId(''), null);
  assert.equal(parseYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(parseYouTubeId('https://www.youtube.com/watch'), null);
  assert.equal(parseYouTubeId('https://www.youtube.com/watch?v=tooshort'), null);
  assert.equal(parseYouTubeId('https://youtu.be/'), null);
  assert.equal(parseYouTubeId('not a link'), null);
  assert.equal(parseYouTubeId('https://www.youtube.com/playlist?list=PL1234567890abcdef'), null);
});

test('thumbnailUrl points at the standard YouTube thumbnail', function () {
  assert.equal(thumbnailUrl('dQw4w9WgXcQ'), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
});

test('syncPosition advances a playing video by the time since the state was written', function () {
  const state = { videoId: 'dQw4w9WgXcQ', state: 'playing', position: 30, updatedAt: '2026-11-27T10:00:00.000Z', updatedBy: 'Luke' };
  // 10 seconds later, the follower should be at 40 seconds.
  assert.equal(syncPosition(state, Date.parse('2026-11-27T10:00:10.000Z')), 40);
  // A paused video stays where it was.
  assert.equal(syncPosition({ ...state, state: 'paused' }, Date.parse('2026-11-27T10:00:10.000Z')), 30);
  // A position before the update never goes negative.
  assert.equal(syncPosition({ ...state, position: 0 }, Date.parse('2026-11-27T09:59:00.000Z')), 0);
});

test('syncPosition returns null when nothing is playing', function () {
  assert.equal(syncPosition(null, Date.now()), null);
  assert.equal(syncPosition({}, Date.now()), null);
  assert.equal(syncPosition({ state: 'playing', position: 5 }, Date.now()), null);
});

test('pollDelayMs stays fast while a video is playing', function () {
  assert.equal(pollDelayMs({ hidden: false, nowPlaying: { videoId: 'dQw4w9WgXcQ', state: 'playing' } }), POLL_ACTIVE_MS);
  assert.equal(POLL_ACTIVE_MS, 5000);
});

test('pollDelayMs backs off when a video is loaded but paused', function () {
  assert.equal(pollDelayMs({ hidden: false, nowPlaying: { videoId: 'dQw4w9WgXcQ', state: 'paused' } }), POLL_PAUSED_MS);
  assert.equal(POLL_PAUSED_MS, 15000);
});

test('pollDelayMs backs off most when nothing is playing', function () {
  assert.equal(pollDelayMs({ hidden: false, nowPlaying: null }), POLL_IDLE_MS);
  assert.equal(pollDelayMs({ hidden: false, nowPlaying: {} }), POLL_IDLE_MS);
  assert.equal(pollDelayMs({}), POLL_IDLE_MS);
  assert.equal(POLL_IDLE_MS, 30000);
});

test('pollDelayMs stops polling while the tab is hidden', function () {
  assert.equal(pollDelayMs({ hidden: true, nowPlaying: { videoId: 'dQw4w9WgXcQ', state: 'playing' } }), null);
  assert.equal(pollDelayMs({ hidden: true, nowPlaying: null }), null);
});
