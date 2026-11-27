import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost, parseYouTubeId } from '../functions/api/watch-together.js';

// The watch API talks to GitHub (and YouTube oEmbed for titles); here
// fetch is stubbed so the handler can be exercised end to end.
function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function makeFetch(initialStore, oembedTitle = 'Test Video Title') {
  let saved = null;
  const fetchStub = async function (url, options) {
    const method = (options && options.method) || 'GET';
    const target = String(url);
    if (target.includes('youtube.com/oembed')) {
      return new Response(JSON.stringify({ title: oembedTitle }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }
    if (method === 'GET') {
      return new Response(JSON.stringify({
        content: b64(JSON.stringify(initialStore)),
        sha: 'abc123'
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    saved = JSON.parse(options.body);
    return new Response(JSON.stringify({ content: { sha: 'newsha' } }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  };
  return {
    fetchStub,
    savedStore: function () {
      return JSON.parse(Buffer.from(saved.content, 'base64').toString('utf8'));
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

function getRequest() {
  return new Request('https://example.com/api/watch-together', { method: 'GET' });
}

function postRequest(payload) {
  return new Request('https://example.com/api/watch-together', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

test('parseYouTubeId in the API matches the client parser', function () {
  assert.equal(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
});

test('GET returns the queue and now playing state', async function () {
  const store = {
    queue: [{ id: 'a', videoId: 'dQw4w9WgXcQ', title: 'A video', addedBy: 'Luke', addedAt: '2026-11-27T00:00:00.000Z', watched: false }],
    nowPlaying: null
  };
  const mock = makeFetch(store);
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestGet({ env: ctx.env, request: getRequest() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.queue.length, 1);
    assert.equal(json.queue[0].title, 'A video');
    assert.equal(json.nowPlaying, null);
  } finally {
    ctx.restore();
  }
});

test('add stores a video with its oEmbed title and who added it', async function () {
  const mock = makeFetch({ queue: [], nowPlaying: null });
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'add', url: 'https://youtu.be/dQw4w9WgXcQ', addedBy: 'Charlotte' })
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    const saved = mock.savedStore();
    assert.equal(saved.queue.length, 1);
    assert.equal(saved.queue[0].videoId, 'dQw4w9WgXcQ');
    assert.equal(saved.queue[0].title, 'Test Video Title');
    assert.equal(saved.queue[0].addedBy, 'Charlotte');
    assert.equal(saved.queue[0].watched, false);
  } finally {
    ctx.restore();
  }
});

test('add falls back to the video id when the title lookup fails', async function () {
  const mock = makeFetch({ queue: [], nowPlaying: null }, '');
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'add', videoId: 'dQw4w9WgXcQ', addedBy: 'Luke' })
    });
    assert.equal(res.status, 200);
    const saved = mock.savedStore();
    assert.equal(saved.queue[0].title, 'dQw4w9WgXcQ');
  } finally {
    ctx.restore();
  }
});

test('add does not duplicate a video already in the queue', async function () {
  const store = {
    queue: [{ id: 'a', videoId: 'dQw4w9WgXcQ', title: 'A video', addedBy: 'Luke', addedAt: '2026-11-27T00:00:00.000Z', watched: false }],
    nowPlaying: null
  };
  const mock = makeFetch(store);
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'add', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', addedBy: 'Charlotte' })
    });
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.duplicate, true);
    assert.equal(json.id, 'a');
  } finally {
    ctx.restore();
  }
});

test('watch toggles watched and remove deletes, clearing now playing', async function () {
  const store = {
    queue: [
      { id: 'a', videoId: 'dQw4w9WgXcQ', title: 'A video', addedBy: 'Luke', addedAt: '2026-11-27T00:00:00.000Z', watched: false },
      { id: 'b', videoId: '9bZkp7q19f0', title: 'B video', addedBy: 'Charlotte', addedAt: '2026-11-27T00:00:00.000Z', watched: false }
    ],
    nowPlaying: { videoId: '9bZkp7q19f0', state: 'playing', position: 5, updatedAt: '2026-11-27T00:00:00.000Z', updatedBy: 'Luke' }
  };
  const mock = makeFetch(store);
  const ctx = context(mock.fetchStub);
  try {
    const watchRes = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'watch', id: 'a', watched: true })
    });
    assert.equal((await watchRes.json()).watched, true);
    assert.equal(mock.savedStore().queue[0].watched, true);

    const removeRes = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'remove', id: 'b' })
    });
    assert.equal(removeRes.status, 200);
    const saved = mock.savedStore();
    assert.equal(saved.queue.length, 1);
    assert.equal(saved.nowPlaying, null);
  } finally {
    ctx.restore();
  }
});

test('play stores the shared playback state; stop clears it', async function () {
  const store = {
    queue: [{ id: 'a', videoId: 'dQw4w9WgXcQ', title: 'A video', addedBy: 'Luke', addedAt: '2026-11-27T00:00:00.000Z', watched: false }],
    nowPlaying: null
  };
  const mock = makeFetch(store);
  const ctx = context(mock.fetchStub);
  try {
    const playRes = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'play', videoId: 'dQw4w9WgXcQ', state: 'playing', position: 42.5, updatedBy: 'Charlotte' })
    });
    assert.equal(playRes.status, 200);
    const playing = mock.savedStore().nowPlaying;
    assert.equal(playing.videoId, 'dQw4w9WgXcQ');
    assert.equal(playing.state, 'playing');
    assert.equal(playing.position, 42.5);
    assert.equal(playing.updatedBy, 'Charlotte');

    const stopRes = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'stop' })
    });
    assert.equal(stopRes.status, 200);
    assert.equal(mock.savedStore().nowPlaying, null);
  } finally {
    ctx.restore();
  }
});

test('play rejects a video that is not in the queue', async function () {
  const mock = makeFetch({ queue: [], nowPlaying: null });
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'play', videoId: 'dQw4w9WgXcQ', state: 'playing', position: 0 })
    });
    assert.equal(res.status, 404);
  } finally {
    ctx.restore();
  }
});

test('add rejects bad links and unknown actions return 400', async function () {
  const cases = [
    { action: 'add', url: 'https://example.com/not-youtube' },
    { action: 'add' },
    { action: 'dance' },
    { action: 'watch', id: 'missing', watched: true },
    { action: 'remove', id: 'missing' }
  ];
  for (const payload of cases) {
    const mock = makeFetch({ queue: [], nowPlaying: null });
    const ctx = context(mock.fetchStub);
    try {
      const res = await onRequestPost({ env: ctx.env, request: postRequest(payload) });
      assert.equal(res.status === 400 || res.status === 404, true, JSON.stringify(payload));
    } finally {
      ctx.restore();
    }
  }
});
