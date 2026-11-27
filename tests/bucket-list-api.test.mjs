import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/api/bucket-list.js';

// The bucket list API talks to GitHub; here fetch is stubbed so the
// handler can be exercised end to end.
function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function makeFetch(initialStore) {
  let saved = null;
  const fetchStub = async function (url, options) {
    const method = (options && options.method) || 'GET';
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
  return new Request('https://example.com/api/bucket-list', { method: 'GET' });
}

function postRequest(payload) {
  return new Request('https://example.com/api/bucket-list', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

test('GET returns the stored items', async function () {
  const store = {
    items: [
      { id: 'a', text: 'Watch the sunrise', addedBy: 'Luke', addedAt: '2026-11-27T00:00:00.000Z', done: false, doneAt: null, doneBy: 'Unknown' },
      { id: 'b', text: 'Bake a cake', addedBy: 'Charlotte', addedAt: '2026-11-27T00:00:00.000Z', done: true, doneAt: '2026-11-27T01:00:00.000Z', doneBy: 'Charlotte' }
    ]
  };
  const mock = makeFetch(store);
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestGet({ env: ctx.env, request: getRequest() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.items.length, 2);
    assert.equal(json.items[0].text, 'Watch the sunrise');
    assert.equal(json.items[1].done, true);
  } finally {
    ctx.restore();
  }
});

test('add stores an item with who added it, unticked', async function () {
  const mock = makeFetch({ items: [] });
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'add', text: '  Go stargazing  ', addedBy: 'Charlotte' })
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    const saved = mock.savedStore();
    assert.equal(saved.items.length, 1);
    assert.equal(saved.items[0].text, 'Go stargazing');
    assert.equal(saved.items[0].addedBy, 'Charlotte');
    assert.equal(saved.items[0].done, false);
    assert.equal(saved.items[0].doneAt, null);
  } finally {
    ctx.restore();
  }
});

test('toggle ticks an item off with the date and who ticked it, and untick clears it', async function () {
  const store = {
    items: [{ id: 'a', text: 'Watch the sunrise', addedBy: 'Luke', addedAt: '2026-11-27T00:00:00.000Z', done: false, doneAt: null, doneBy: 'Unknown' }]
  };
  const mock = makeFetch(store);
  const ctx = context(mock.fetchStub);
  try {
    const tickRes = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'toggle', id: 'a', done: true, doneBy: 'Luke' })
    });
    assert.equal(tickRes.status, 200);
    const ticked = mock.savedStore().items[0];
    assert.equal(ticked.done, true);
    assert.equal(ticked.doneBy, 'Luke');
    assert.ok(ticked.doneAt);

    const untickRes = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'toggle', id: 'a', done: false, doneBy: 'Luke' })
    });
    assert.equal(untickRes.status, 200);
    const unticked = mock.savedStore().items[0];
    assert.equal(unticked.done, false);
    assert.equal(unticked.doneAt, null);
    assert.equal(unticked.doneBy, 'Unknown');
  } finally {
    ctx.restore();
  }
});

test('remove deletes the item', async function () {
  const store = {
    items: [
      { id: 'a', text: 'Watch the sunrise', addedBy: 'Luke', addedAt: '2026-11-27T00:00:00.000Z', done: false, doneAt: null, doneBy: 'Unknown' },
      { id: 'b', text: 'Bake a cake', addedBy: 'Charlotte', addedAt: '2026-11-27T00:00:00.000Z', done: false, doneAt: null, doneBy: 'Unknown' }
    ]
  };
  const mock = makeFetch(store);
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'remove', id: 'a' })
    });
    assert.equal(res.status, 200);
    const saved = mock.savedStore();
    assert.equal(saved.items.length, 1);
    assert.equal(saved.items[0].id, 'b');
  } finally {
    ctx.restore();
  }
});

test('add rejects empty text and unknown actions return 400; missing ids return 404', async function () {
  const cases = [
    { payload: { action: 'add', text: '   ' }, status: 400 },
    { payload: { action: 'add' }, status: 400 },
    { payload: { action: 'dance' }, status: 400 },
    { payload: { action: 'toggle', id: 'missing', done: true }, status: 404 },
    { payload: { action: 'remove', id: 'missing' }, status: 404 }
  ];
  for (const { payload, status } of cases) {
    const mock = makeFetch({ items: [] });
    const ctx = context(mock.fetchStub);
    try {
      const res = await onRequestPost({ env: ctx.env, request: postRequest(payload) });
      assert.equal(res.status, status, JSON.stringify(payload));
    } finally {
      ctx.restore();
    }
  }
});

test('GET returns an empty list when the store file does not exist yet', async function () {
  const fetchStub = async function () {
    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    const res = await onRequestGet({ env: { GITHUB_REPO: 'DinoLL288/Charlotte-', GITHUB_TOKEN: 'test-token' }, request: getRequest() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json.items, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});
