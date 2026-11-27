import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost, sortEntriesNewestFirst, isOwnEntry } from '../functions/api/journal.js';

// The journal API talks to GitHub; here fetch is stubbed so the
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
  return new Request('https://example.com/api/journal', { method: 'GET' });
}

function postRequest(payload) {
  return new Request('https://example.com/api/journal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

const older = { id: 'e1', title: 'First', body: 'Hello', author: 'Luke', createdAt: '2026-11-20T10:00:00.000Z' };
const newer = { id: 'e2', title: '', body: 'Later', author: 'Charlotte', createdAt: '2026-11-27T10:00:00.000Z' };

test('GET returns entries newest first', async () => {
  const { fetchStub } = makeFetch({ entries: [older, newer] });
  const ctx = context(fetchStub);
  try {
    const res = await onRequestGet({ ...ctx, request: getRequest() });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(json.entries.map(e => e.id), ['e2', 'e1']);
  } finally { ctx.restore(); }
});

test('GET returns an empty list when the store is empty', async () => {
  const { fetchStub } = makeFetch({ entries: [] });
  const ctx = context(fetchStub);
  try {
    const res = await onRequestGet({ ...ctx, request: getRequest() });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(json.entries, []);
  } finally { ctx.restore(); }
});

test('GET reports missing GitHub configuration', async () => {
  const res = await onRequestGet({ env: {}, request: getRequest() });
  const json = await res.json();
  assert.equal(res.status, 500);
  assert.match(json.error, /Missing GitHub configuration/);
});

test('add stores a new entry at the top, newest first', async () => {
  const made = makeFetch({ entries: [older] });
  const ctx = context(made.fetchStub);
  try {
    const res = await onRequestPost({ ...ctx, request: postRequest({ action: 'add', user: 'Charlotte', entry: { title: 'Today', body: 'A lovely day' } }) });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.entry.author, 'Charlotte');
    assert.equal(json.entry.title, 'Today');
    assert.equal(json.entries[0].id, json.entry.id);
    assert.equal(json.entries[1].id, 'e1');
    const saved = made.savedStore();
    assert.equal(saved.entries[0].body, 'A lovely day');
  } finally { ctx.restore(); }
});

test('add works without a title and normalises an unknown author', async () => {
  const made = makeFetch({ entries: [] });
  const ctx = context(made.fetchStub);
  try {
    const res = await onRequestPost({ ...ctx, request: postRequest({ action: 'add', user: 'Nobody', entry: { body: 'No title here' } }) });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.entry.title, '');
    assert.equal(json.entry.author, 'Unknown');
  } finally { ctx.restore(); }
});

test('add rejects an empty body', async () => {
  const made = makeFetch({ entries: [] });
  const ctx = context(made.fetchStub);
  try {
    const res = await onRequestPost({ ...ctx, request: postRequest({ action: 'add', user: 'Luke', entry: { title: 'Empty', body: '   ' } }) });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.error, /Write something first/);
  } finally { ctx.restore(); }
});

test('delete removes your own entry', async () => {
  const made = makeFetch({ entries: [older, newer] });
  const ctx = context(made.fetchStub);
  try {
    const res = await onRequestPost({ ...ctx, request: postRequest({ action: 'delete', user: 'Luke', id: 'e1' }) });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.ok, true);
    assert.deepEqual(json.entries.map(e => e.id), ['e2']);
    assert.deepEqual(made.savedStore().entries.map(e => e.id), ['e2']);
  } finally { ctx.restore(); }
});

test('delete rejects someone else\'s entry', async () => {
  const made = makeFetch({ entries: [older, newer] });
  const ctx = context(made.fetchStub);
  try {
    const res = await onRequestPost({ ...ctx, request: postRequest({ action: 'delete', user: 'Charlotte', id: 'e1' }) });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.match(json.error, /only delete your own/);
  } finally { ctx.restore(); }
});

test('delete reports a missing entry', async () => {
  const made = makeFetch({ entries: [older] });
  const ctx = context(made.fetchStub);
  try {
    const res = await onRequestPost({ ...ctx, request: postRequest({ action: 'delete', user: 'Luke', id: 'nope' }) });
    assert.equal(res.status, 404);
  } finally { ctx.restore(); }
});

test('unknown action is rejected', async () => {
  const made = makeFetch({ entries: [] });
  const ctx = context(made.fetchStub);
  try {
    const res = await onRequestPost({ ...ctx, request: postRequest({ action: 'edit', user: 'Luke', id: 'e1' }) });
    assert.equal(res.status, 400);
  } finally { ctx.restore(); }
});

test('sortEntriesNewestFirst orders by date and puts undated entries last', () => {
  const sorted = sortEntriesNewestFirst([
    { id: 'a', createdAt: '2026-11-20T10:00:00.000Z' },
    { id: 'b', createdAt: 'not-a-date' },
    { id: 'c', createdAt: '2026-11-27T10:00:00.000Z' }
  ]);
  assert.deepEqual(sorted.map(e => e.id), ['c', 'a', 'b']);
});

test('isOwnEntry only matches the entry author', () => {
  assert.equal(isOwnEntry({ author: 'Luke' }, 'Luke'), true);
  assert.equal(isOwnEntry({ author: 'Luke' }, 'Charlotte'), false);
  assert.equal(isOwnEntry({ author: 'Luke' }, ''), false);
  assert.equal(isOwnEntry(null, 'Luke'), false);
});
