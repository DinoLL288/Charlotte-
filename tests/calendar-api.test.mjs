import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/calendar.js';

// The calendar API talks to GitHub; here fetch is stubbed so the
// handler can be exercised end to end without a live repo.
function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function makeFetch(initialEvents) {
  const calls = [];
  let saved = null;
  const fetchStub = async function (url, options) {
    const method = (options && options.method) || 'GET';
    calls.push({ url, method });
    if (method === 'GET') {
      return new Response(JSON.stringify({
        content: b64(JSON.stringify({ events: initialEvents })),
        sha: 'abc123'
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    saved = JSON.parse(options.body);
    return new Response(JSON.stringify({ content: { sha: 'newsha' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  return {
    fetchStub,
    calls,
    savedEvents: function () {
      return JSON.parse(Buffer.from(saved.content, 'base64').toString('utf8')).events;
    }
  };
}

function context(stub) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = stub;
  return {
    env: { GITHUB_REPO: 'DinoLL288/Charlotte-', GITHUB_TOKEN: 'test-token', GITHUB_BRANCH: 'main' },
    restore: function () { globalThis.fetch = realFetch; }
  };
}

function postRequest(payload) {
  return new Request('https://example.com/api/calendar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

test('add expands a weekly repeat into dated instances sharing one repeatId', async function () {
  const mock = makeFetch({});
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({
        date: '2026-11-30',
        event: {
          title: 'Gym',
          startTime: '07:00',
          for: 'Luke',
          repeat: { frequency: 'weekly', until: '2026-12-21' }
        }
      })
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.count, 4);
    assert.equal(typeof json.repeatId, 'string');

    const events = mock.savedEvents();
    const dates = Object.keys(events).sort();
    assert.deepEqual(dates, ['2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21']);
    for (const date of dates) {
      assert.equal(events[date].length, 1);
      assert.equal(events[date][0].title, 'Gym');
      assert.equal(events[date][0].for, 'Luke');
      assert.equal(events[date][0].repeatId, json.repeatId);
      assert.equal(events[date][0].startTime, '07:00');
    }
    // Instances have distinct ids.
    const ids = dates.map(date => events[date][0].id);
    assert.equal(new Set(ids).size, 4);
  } finally {
    ctx.restore();
  }
});

test('add expands an every-n-days repeat by the chosen gap', async function () {
  const mock = makeFetch({});
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({
        date: '2026-11-30',
        event: {
          title: 'Water the plants',
          repeat: { frequency: 'every-n-days', interval: 3, until: '2026-12-09' }
        }
      })
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.count, 4);
    const events = mock.savedEvents();
    assert.deepEqual(Object.keys(events).sort(), ['2026-11-30', '2026-12-03', '2026-12-06', '2026-12-09']);
  } finally {
    ctx.restore();
  }
});

test('add caps a repeat at 52 instances', async function () {
  const mock = makeFetch({});
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({
        date: '2026-11-30',
        event: {
          title: 'Daily walk',
          repeat: { frequency: 'daily', until: '2027-12-31' }
        }
      })
    });
    const json = await res.json();
    assert.equal(json.count, 52);
    const events = mock.savedEvents();
    assert.equal(Object.keys(events).length, 52);
  } finally {
    ctx.restore();
  }
});

test('add without repeat or for stores one both event with no repeatId', async function () {
  const mock = makeFetch({});
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({
        date: '2026-11-30',
        event: { title: 'Movie night' }
      })
    });
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.count, undefined);
    assert.equal(json.repeatId, undefined);
    const events = mock.savedEvents();
    assert.equal(events['2026-11-30'].length, 1);
    assert.equal(events['2026-11-30'][0].for, 'both');
    assert.equal(events['2026-11-30'][0].repeatId, undefined);
  } finally {
    ctx.restore();
  }
});

test('add rejects a bad frequency, a bad until date and an until before the start', async function () {
  const cases = [
    { event: { title: 'X', repeat: { frequency: 'yearly', until: '2026-12-31' } } },
    { event: { title: 'X', repeat: { frequency: 'daily', until: '31-12-2026' } } },
    { event: { title: 'X', repeat: { frequency: 'daily', until: '2026-11-29' } } },
    { event: { title: 'X', repeat: 'daily' } },
    { event: { title: 'X', repeat: { frequency: 'every-n-days', until: '2026-12-31' } } },
    { event: { title: 'X', repeat: { frequency: 'every-n-days', interval: 1, until: '2026-12-31' } } },
    { event: { title: 'X', repeat: { frequency: 'every-n-days', interval: 31, until: '2026-12-31' } } },
    { event: { title: 'X', repeat: { frequency: 'every-n-days', interval: 'three', until: '2026-12-31' } } }
  ];
  for (const payload of cases) {
    const mock = makeFetch({});
    const ctx = context(mock.fetchStub);
    try {
      const res = await onRequestPost({
        env: ctx.env,
        request: postRequest({ date: '2026-11-30', ...payload })
      });
      assert.equal(res.status, 400, JSON.stringify(payload));
      const json = await res.json();
      assert.equal(typeof json.error, 'string');
    } finally {
      ctx.restore();
    }
  }
});

test('update changes one instance only and keeps its repeatId', async function () {
  const shared = 'repeat-1';
  const initial = {
    '2026-11-30': [{ id: 'a', title: 'Gym', for: 'Luke', repeatId: shared }],
    '2026-12-07': [{ id: 'b', title: 'Gym', for: 'Luke', repeatId: shared }]
  };
  const mock = makeFetch(initial);
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({
        action: 'update',
        date: '2026-12-07',
        id: 'b',
        event: { title: 'Gym (late)', for: 'Charlotte' }
      })
    });
    assert.equal(res.status, 200);
    const events = mock.savedEvents();
    assert.equal(events['2026-12-07'][0].title, 'Gym (late)');
    assert.equal(events['2026-12-07'][0].for, 'Charlotte');
    assert.equal(events['2026-12-07'][0].repeatId, shared);
    // The other instance is untouched.
    assert.equal(events['2026-11-30'][0].title, 'Gym');
    assert.equal(events['2026-11-30'][0].for, 'Luke');
  } finally {
    ctx.restore();
  }
});

test('delete removes one instance and leaves the rest of the series', async function () {
  const shared = 'repeat-1';
  const initial = {
    '2026-11-30': [{ id: 'a', title: 'Gym', for: 'Luke', repeatId: shared }],
    '2026-12-07': [{ id: 'b', title: 'Gym', for: 'Luke', repeatId: shared }],
    '2026-12-14': [{ id: 'c', title: 'Gym', for: 'Luke', repeatId: shared }]
  };
  const mock = makeFetch(initial);
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'delete', date: '2026-12-07', id: 'b' })
    });
    assert.equal(res.status, 200);
    const events = mock.savedEvents();
    assert.equal(events['2026-12-07'], undefined);
    assert.equal(events['2026-11-30'].length, 1);
    assert.equal(events['2026-12-14'].length, 1);
  } finally {
    ctx.restore();
  }
});
