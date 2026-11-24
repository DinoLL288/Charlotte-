import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, latestMood, bathroomSummary, perthDayKey } from '../functions/api/trackers.js';

const MOODS = {
  Charlotte: {
    '2026-11-24': [{ id: 'a', mood: '😊', intensity: 4, note: 'good day', time: '2026-11-24T10:00:00.000Z' }],
    '2026-11-25': [
      { id: 'b', mood: '🌙', intensity: 2, note: 'tired', time: '2026-11-25T08:00:00.000Z' },
      { id: 'c', mood: '🥰', intensity: 5, note: 'loved', time: '2026-11-25T20:00:00.000Z' }
    ]
  },
  Luke: {
    '2026-11-23': [{ id: 'd', mood: '😤', intensity: 3, note: '', time: '2026-11-23T12:00:00.000Z' }]
  }
};

function mockEnv({ moods = MOODS, bathroom = null } = {}) {
  const today = perthDayKey(new Date());
  const bath = bathroom || {
    status: {
      Charlotte: { active: true, startedAt: '2026-11-25T10:00:00.000Z' },
      Luke: { active: false, startedAt: null, returnedAt: '2026-11-25T09:30:00.000Z' }
    },
    // Newest first, as the tracker stores them.
    events: [
      { id: 'e2', user: 'Charlotte', action: 'start', at: '2026-11-25T10:00:00.000Z' },
      { id: 'e1', user: 'Luke', action: 'return', at: '2026-11-25T09:30:00.000Z' },
      { id: 'e0', user: 'Luke', action: 'start', at: '2026-11-25T09:15:00.000Z' }
    ],
    stats: {
      allTime: { Charlotte: 5, Luke: 9 },
      daily: { [today]: { Charlotte: 2, Luke: 3 } }
    }
  };
  return {
    QUESTION_ROOM: {
      idFromName: () => 'test-id',
      get: () => ({
        fetch: async req => {
          const view = new URL(req.url).searchParams.get('view');
          if (view === 'mood') return Response.json({ moods });
          if (view === 'bathroom') return Response.json(bath);
          return Response.json({ error: 'unknown view' }, { status: 400 });
        }
      })
    }
  };
}

test('latestMood picks the newest entry and maps its label', () => {
  assert.deepEqual(latestMood(MOODS, 'Charlotte'), {
    emoji: '🥰',
    label: 'Loved',
    intensity: 5,
    date: '2026-11-25',
    time: '2026-11-25T20:00:00.000Z'
  });
  assert.equal(latestMood(MOODS, 'Luke').emoji, '😤');
  assert.equal(latestMood(MOODS, 'Nobody'), null);
  assert.equal(latestMood({}, 'Luke'), null);
});

test('bathroomSummary reports away state, today count and last event', () => {
  const today = perthDayKey(new Date());
  const bath = {
    status: { Charlotte: { active: true, startedAt: '2026-11-25T10:00:00.000Z' }, Luke: { active: false, startedAt: null, returnedAt: '2026-11-25T09:30:00.000Z' } },
    events: [
      { id: 'e2', user: 'Charlotte', action: 'start', at: '2026-11-25T10:00:00.000Z' },
      { id: 'e1', user: 'Luke', action: 'return', at: '2026-11-25T09:30:00.000Z' }
    ],
    stats: { daily: { [today]: { Charlotte: 2, Luke: 3 } } }
  };
  assert.deepEqual(bathroomSummary(bath, 'Charlotte', today), {
    away: true,
    startedAt: '2026-11-25T10:00:00.000Z',
    returnedAt: null,
    today: 2,
    lastAt: '2026-11-25T10:00:00.000Z',
    lastAction: 'start'
  });
  assert.equal(bathroomSummary(bath, 'Luke', today).away, false);
  assert.equal(bathroomSummary(bath, 'Luke', today).today, 3);
  assert.equal(bathroomSummary({ status: {}, events: [], stats: {} }, 'Luke', today).today, 0);
});

test('GET /api/trackers returns a slim widget summary with no notes', async () => {
  const res = await onRequest({ env: mockEnv(), request: new Request('https://example.com/api/trackers') });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const body = await res.json();
  assert.equal(body.mood.Charlotte.emoji, '🥰');
  assert.equal(body.mood.Charlotte.label, 'Loved');
  assert.equal(body.mood.Luke.emoji, '😤');
  assert.equal(body.bathroom.Charlotte.away, true);
  assert.equal(body.bathroom.Charlotte.today, 2);
  assert.equal(body.bathroom.Luke.away, false);
  assert.equal(body.bathroom.Luke.today, 3);
  assert.equal(body.bathroom.Luke.lastAction, 'return');
  // Notes and full history never leave the server.
  assert.equal(JSON.stringify(body).includes('good day'), false);
  assert.equal(JSON.stringify(body).includes('tired'), false);
  assert.equal('events' in body.bathroom, false);
  assert.ok(body.updatedAt);
});

test('returns 503 without the question-room binding, 405 for non-GET', async () => {
  const noBinding = await onRequest({ env: {}, request: new Request('https://example.com/api/trackers') });
  assert.equal(noBinding.status, 503);
  const post = await onRequest({
    env: mockEnv(),
    request: new Request('https://example.com/api/trackers', { method: 'POST' })
  });
  assert.equal(post.status, 405);
});
