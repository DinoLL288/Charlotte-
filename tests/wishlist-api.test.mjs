import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost, parsePrice, formatPrice } from '../functions/api/wishlist.js';

// The wishlist API talks to GitHub; here fetch is stubbed so the
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
  return new Request('https://example.com/api/wishlist', { method: 'GET' });
}

function postRequest(payload) {
  return new Request('https://example.com/api/wishlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

test('parsePrice accepts "$25", "25" and "25.50", and ignores bad prices', function () {
  assert.equal(parsePrice('$25'), 25);
  assert.equal(parsePrice('25'), 25);
  assert.equal(parsePrice('25.50'), 25.5);
  assert.equal(parsePrice('$1,299.99'), 1299.99);
  assert.equal(parsePrice('  $7  '), 7);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('abc'), null);
  assert.equal(parsePrice('$'), null);
  assert.equal(parsePrice('25.999'), null);
  assert.equal(parsePrice('-5'), null);
  assert.equal(parsePrice('12 apples'), null);
});

test('formatPrice shows whole dollars without cents', function () {
  assert.equal(formatPrice(25), '$25');
  assert.equal(formatPrice(25.5), '$25.50');
  assert.equal(formatPrice(null), null);
  assert.equal(formatPrice('25'), null);
});

test('GET returns the items', async function () {
  const store = {
    items: [{ id: 'a', name: 'A book', link: '', price: 25, addedBy: 'Luke', addedAt: '2026-11-27T00:00:00.000Z', bought: false, boughtBy: '', boughtAt: '' }]
  };
  const mock = makeFetch(store);
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestGet({ env: ctx.env, request: getRequest() });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.items.length, 1);
    assert.equal(json.items[0].name, 'A book');
    assert.equal(json.items[0].price, 25);
  } finally {
    ctx.restore();
  }
});

test('add stores an item with name, link, price and who added it', async function () {
  const mock = makeFetch({ items: [] });
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'add', name: 'Headphones', link: 'https://example.com/headphones', price: '$25.50', addedBy: 'Charlotte' })
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    const saved = mock.savedStore();
    assert.equal(saved.items.length, 1);
    assert.equal(saved.items[0].name, 'Headphones');
    assert.equal(saved.items[0].link, 'https://example.com/headphones');
    assert.equal(saved.items[0].price, 25.5);
    assert.equal(saved.items[0].addedBy, 'Charlotte');
    assert.equal(saved.items[0].bought, false);
  } finally {
    ctx.restore();
  }
});

test('add ignores a bad price and a bad link instead of failing', async function () {
  const mock = makeFetch({ items: [] });
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'add', name: 'A thing', link: 'not a link', price: 'too much', addedBy: 'Luke' })
    });
    assert.equal(res.status, 200);
    const saved = mock.savedStore();
    assert.equal(saved.items.length, 1);
    assert.equal(saved.items[0].price, null);
    assert.equal(saved.items[0].link, '');
  } finally {
    ctx.restore();
  }
});

test('add requires a name', async function () {
  const mock = makeFetch({ items: [] });
  const ctx = context(mock.fetchStub);
  try {
    const res = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'add', name: '   ', addedBy: 'Luke' })
    });
    assert.equal(res.status, 400);
  } finally {
    ctx.restore();
  }
});

test('bought marks an item bought with who and when, and unmarks it', async function () {
  const store = {
    items: [{ id: 'a', name: 'A book', link: '', price: null, addedBy: 'Luke', addedAt: '2026-11-27T00:00:00.000Z', bought: false, boughtBy: '', boughtAt: '' }]
  };
  const mock = makeFetch(store);
  const ctx = context(mock.fetchStub);
  try {
    const buyRes = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'bought', id: 'a', bought: true, boughtBy: 'Charlotte' })
    });
    assert.equal(buyRes.status, 200);
    assert.equal((await buyRes.json()).bought, true);
    const bought = mock.savedStore().items[0];
    assert.equal(bought.bought, true);
    assert.equal(bought.boughtBy, 'Charlotte');
    assert.ok(bought.boughtAt);

    const unbuyRes = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'bought', id: 'a', bought: false, boughtBy: 'Charlotte' })
    });
    assert.equal(unbuyRes.status, 200);
    const unbought = mock.savedStore().items[0];
    assert.equal(unbought.bought, false);
    assert.equal(unbought.boughtBy, '');
    assert.equal(unbought.boughtAt, '');
  } finally {
    ctx.restore();
  }
});

test('remove deletes an item; unknown ids and actions return 404/400', async function () {
  const store = {
    items: [
      { id: 'a', name: 'A book', link: '', price: null, addedBy: 'Luke', addedAt: '2026-11-27T00:00:00.000Z', bought: false, boughtBy: '', boughtAt: '' },
      { id: 'b', name: 'A game', link: '', price: 50, addedBy: 'Charlotte', addedAt: '2026-11-27T00:00:00.000Z', bought: true, boughtBy: 'Luke', boughtAt: '2026-11-27T00:00:00.000Z' }
    ]
  };
  const mock = makeFetch(store);
  const ctx = context(mock.fetchStub);
  try {
    const removeRes = await onRequestPost({
      env: ctx.env,
      request: postRequest({ action: 'remove', id: 'a' })
    });
    assert.equal(removeRes.status, 200);
    const saved = mock.savedStore();
    assert.equal(saved.items.length, 1);
    assert.equal(saved.items[0].id, 'b');

    const cases = [
      { action: 'bought', id: 'missing', bought: true },
      { action: 'remove', id: 'missing' },
      { action: 'dance' },
      { action: 'add' }
    ];
    for (const payload of cases) {
      const res = await onRequestPost({ env: ctx.env, request: postRequest(payload) });
      assert.equal(res.status === 400 || res.status === 404, true, JSON.stringify(payload));
    }
  } finally {
    ctx.restore();
  }
});
