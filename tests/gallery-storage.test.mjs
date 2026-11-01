import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { getGalleryUser, issueSession } from '../functions/api/_gallery-auth.js';
import { onRequestGet as galleryGet, onRequestPost as galleryPost } from '../functions/api/gallery.js';
import { onRequestPost as legacyUpload } from '../functions/api/upload.js';
import { onRequestGet as vaultGet, onRequestPost as vaultPost } from '../functions/api/vault.js';
import { QuestionNightRoom } from '../question-room-worker/index.js';

const sessionSecret = 'test-gallery-session-secret-not-for-production';
const internalSecret = 'test-gallery-internal-secret-not-for-production';

function makeContext(storage) {
  let gate = Promise.resolve();
  return {
    storage: { get: async key => storage.get(key), put: async (key, value) => storage.set(key, value), delete: async key => storage.delete(key) },
    blockConcurrencyWhile(callback) {
      const previous = gate;
      let release;
      gate = new Promise(resolve => { release = resolve; });
      return previous.then(callback).finally(release);
    }
  };
}

const origin = 'https://charlotte-3ts.pages.dev';

function roomBinding(storage) {
  const room = new QuestionNightRoom(makeContext(storage), { GALLERY_INTERNAL_SECRET: internalSecret });
  return {
    idFromName: name => name,
    get: () => ({ fetch: (url, init) => room.fetch(new Request(url, init)) })
  };
}

function vaultEnv(storage) {
  return { GALLERY_SESSION_SECRET: sessionSecret, GALLERY_INTERNAL_SECRET: internalSecret, QUESTION_ROOM: roomBinding(storage) };
}

function validVault(overrides = {}) {
  return { version: 1, kdf: 'PBKDF2-SHA256', iterations: 310000, salt: 'A'.repeat(22), iv: 'B'.repeat(16), ciphertext: 'C'.repeat(120), ...overrides };
}

test('gallery sessions reject missing, modified, and unknown-user tokens', async () => {
  const noSession = new Request('https://charlotte-3ts.pages.dev/api/gallery');
  assert.equal(await getGalleryUser(noSession, { GALLERY_SESSION_SECRET: sessionSecret }), null);
  const valid = await issueSession('Luke', sessionSecret);
  const request = new Request('https://charlotte-3ts.pages.dev/api/gallery', { headers: { cookie: `gallery_session=${valid}` } });
  assert.equal(await getGalleryUser(request, { GALLERY_SESSION_SECRET: sessionSecret }), 'Luke');
  const [payload, signature] = valid.split('.');
  const tampered = `${payload}.${(signature[0] === 'A' ? 'B' : 'A')}${signature.slice(1)}`;
  const modified = new Request('https://charlotte-3ts.pages.dev/api/gallery', { headers: { cookie: `gallery_session=${tampered}` } });
  assert.equal(await getGalleryUser(modified, { GALLERY_SESSION_SECRET: sessionSecret }), null);
  const stranger = await issueSession('Mallory', sessionSecret);
  assert.equal(await getGalleryUser(new Request('https://charlotte-3ts.pages.dev', { headers: { cookie: `gallery_session=${stranger}` } }), { GALLERY_SESSION_SECRET: sessionSecret }), null);
});

test('private gallery APIs reject unauthenticated requests before storage access', async () => {
  const context = { request: new Request('https://charlotte-3ts.pages.dev/api/gallery'), env: {} };
  assert.equal((await galleryGet(context)).status, 401);
  const post = new Request('https://charlotte-3ts.pages.dev/api/gallery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create-upload' }) });
  assert.equal((await galleryPost({ request: post, env: {} })).status, 401);
  assert.equal((await legacyUpload()).status, 410);
});

test('valid gallery sessions cannot bypass missing B2 configuration', async () => {
  const token = await issueSession('Charlotte', sessionSecret);
  const request = new Request('https://charlotte-3ts.pages.dev/api/gallery', { headers: { cookie: `gallery_session=${token}` } });
  assert.equal((await galleryGet({ request, env: { GALLERY_SESSION_SECRET: sessionSecret } })).status, 503);
});

test('Durable Object metadata endpoint is secret-protected', async () => {
  const storage = new Map();
  const ctx = makeContext(storage);
  const room = new QuestionNightRoom(ctx, { GALLERY_INTERNAL_SECRET: internalSecret });
  const denied = await room.fetch(new Request('https://room.internal/internal/gallery', { method: 'GET' }));
  assert.equal(denied.status, 404);
  const allowed = await room.fetch(new Request('https://room.internal/internal/gallery', { method: 'GET', headers: { 'x-gallery-internal-secret': internalSecret } }));
  assert.equal(allowed.status, 200);
  assert.deepEqual((await allowed.json()).photos, []);
});

test('gallery upload reservations are per-user, bounded, and complete idempotently', async () => {
  const storage = new Map();
  const ctx = makeContext(storage);
  const room = new QuestionNightRoom(ctx, { GALLERY_INTERNAL_SECRET: internalSecret });
  const post = body => room.fetch(new Request('https://room.internal/internal/gallery', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gallery-internal-secret': internalSecret }, body: JSON.stringify(body) }));
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const objectKey = `photos/${id}.jpg`;
  const reserved = await post({ action: 'begin-upload', upload: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', user: 'Luke', objectKey, size: 4, contentType: 'image/jpeg', albums: ['General'], name: 'test.jpg', uploadedAt: new Date().toISOString() } });
  assert.equal(reserved.status, 200);
  const complete = await post({ action: 'complete-upload', uploadId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', user: 'Luke', photo: { id, objectKey, size: 4, contentType: 'image/jpeg', name: 'test.jpg', width: null, height: null } });
  assert.equal(complete.status, 200);
  assert.equal((await complete.json()).photo.uploadedBy, 'Luke');
  const retry = await post({ action: 'complete-upload', uploadId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', user: 'Luke', photo: { id, objectKey, size: 4, contentType: 'image/jpeg' } });
  assert.equal(retry.status, 404);
  const list = await room.fetch(new Request('https://room.internal/internal/gallery', { method: 'GET', headers: { 'x-gallery-internal-secret': internalSecret } }));
  assert.equal((await list.json()).photos.length, 1);
});

test('repeatable migration seeds preserve originals and do not duplicate records', async () => {
  const storage = new Map();
  const ctx = makeContext(storage);
  const room = new QuestionNightRoom(ctx, { GALLERY_INTERNAL_SECRET: internalSecret });
  const keyHash = 'a'.repeat(64);
  const photo = { id: `legacy-${keyHash}`, objectKey: `photos/legacy/${keyHash}`, thumbnailObjectKey: `photos/thumbnails/${keyHash}.webp`, thumbnailSize: 20, thumbnailSha256: keyHash, album: 'Old Photos', name: 'old.jpeg', size: 100, contentType: 'image/jpeg', uploadedBy: 'Unknown', uploadedAt: new Date().toISOString(), sha256: keyHash, sourcePath: 'gallery/old.jpeg' };
  const post = () => room.fetch(new Request('https://room.internal/internal/gallery', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gallery-internal-secret': internalSecret }, body: JSON.stringify({ action: 'seed-migration', photos: [photo] }) }));
  assert.equal((await (await post()).json()).added, 1);
  assert.equal((await (await post()).json()).added, 0);
  await access(new URL('../gallery/metadata.json', import.meta.url));
  const list = await room.fetch(new Request('https://room.internal/internal/gallery', { method: 'GET', headers: { 'x-gallery-internal-secret': internalSecret } }));
  assert.equal((await list.json()).photos.length, 1);
});

test('login attempts are rate limited per profile and time window', async () => {
  const storage = new Map();
  const ctx = makeContext(storage);
  const room = new QuestionNightRoom(ctx, { GALLERY_INTERNAL_SECRET: internalSecret });
  const attempt = () => room.fetch(new Request('https://room.internal/internal/gallery', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gallery-internal-secret': internalSecret }, body: JSON.stringify({ action: 'attempt-login', ip: '192.0.2.10', user: 'Luke', success: false }) }));
  for (let index = 0; index < 8; index++) assert.equal((await (await attempt()).json()).allowed, true);
  assert.equal((await (await attempt()).json()).allowed, false);
});

test('the shared safe requires sign-in and a same-origin request', async () => {
  assert.equal((await vaultGet({ request: new Request(`${origin}/api/vault`), env: {} })).status, 401);
  const token = await issueSession('Luke', sessionSecret);
  const env = { GALLERY_SESSION_SECRET: sessionSecret };
  assert.equal((await vaultGet({ request: new Request(`${origin}/api/vault`, { headers: { cookie: `gallery_session=${token}` } }), env })).status, 503);

  const post = headers => vaultPost({
    request: new Request(`${origin}/api/vault`, { method: 'POST', headers: { cookie: `gallery_session=${token}`, 'content-type': 'application/json', ...headers }, body: JSON.stringify({ action: 'save', vault: validVault() }) }),
    env
  });
  assert.equal((await post({})).status, 403);
  assert.equal((await post({ origin: 'https://example.com' })).status, 403);
});

test('the shared safe stores only the encrypted envelope and stamps the session user', async () => {
  const storage = new Map();
  const env = vaultEnv(storage);
  const token = await issueSession('Charlotte', sessionSecret);
  const headers = { cookie: `gallery_session=${token}`, origin, 'content-type': 'application/json' };
  const save = vault => vaultPost({ request: new Request(`${origin}/api/vault`, { method: 'POST', headers, body: JSON.stringify({ action: 'save', vault }) }), env });

  const payload = validVault({ updatedBy: 'Luke', updatedAt: '2000-01-01T00:00:00.000Z' });
  const first = await save(payload);
  assert.equal(first.status, 200);
  const firstVault = (await first.json()).vault;
  assert.equal(firstVault.updatedBy, 'Charlotte');
  assert.equal(firstVault.ciphertext, payload.ciphertext);
  assert.equal(firstVault.salt, payload.salt);
  assert.deepEqual(Object.keys(firstVault).sort(), ['ciphertext', 'createdAt', 'iterations', 'iv', 'kdf', 'salt', 'updatedAt', 'updatedBy', 'version']);

  const second = await save(validVault({ ciphertext: 'D'.repeat(64) }));
  const secondVault = (await second.json()).vault;
  assert.equal(secondVault.ciphertext, 'D'.repeat(64));
  assert.equal(secondVault.createdAt, firstVault.createdAt);

  const read = await vaultGet({ request: new Request(`${origin}/api/vault`, { headers: { cookie: `gallery_session=${token}` } }), env });
  assert.equal(read.status, 200);
  const readVault = (await read.json()).vault;
  assert.equal(readVault.ciphertext, 'D'.repeat(64));
  assert.equal(readVault.updatedBy, 'Charlotte');
  assert.equal(storage.get('sharedVault').kdf, 'PBKDF2-SHA256');

  const erase = await vaultPost({ request: new Request(`${origin}/api/vault`, { method: 'POST', headers, body: JSON.stringify({ action: 'erase' }) }), env });
  assert.equal(erase.status, 200);
  const after = await vaultGet({ request: new Request(`${origin}/api/vault`, { headers: { cookie: `gallery_session=${token}` } }), env });
  assert.equal(after.status, 200);
  assert.equal((await after.json()).vault, null);
});

test('the shared safe rejects malformed and oversized envelopes', async () => {
  const storage = new Map();
  const env = vaultEnv(storage);
  const token = await issueSession('Luke', sessionSecret);
  const headers = { cookie: `gallery_session=${token}`, origin, 'content-type': 'application/json' };
  const save = vault => vaultPost({ request: new Request(`${origin}/api/vault`, { method: 'POST', headers, body: JSON.stringify({ action: 'save', vault }) }), env });

  const invalid = [
    validVault({ version: 2 }),
    validVault({ kdf: 'scrypt' }),
    validVault({ iterations: 99999 }),
    validVault({ iterations: 2000001 }),
    validVault({ iterations: '310000' }),
    validVault({ salt: 'short' }),
    validVault({ salt: 'A'.repeat(65) }),
    validVault({ iv: 'B'.repeat(11) }),
    validVault({ ciphertext: 'C'.repeat(15) }),
    validVault({ ciphertext: 'not base64url!' }),
    validVault({ ciphertext: 'C'.repeat(90001) })
  ];
  for (const vault of invalid) assert.equal((await save(vault)).status, 400);
  assert.equal((await vaultPost({ request: new Request(`${origin}/api/vault`, { method: 'POST', headers, body: JSON.stringify({ action: 'rename' }) }), env })).status, 400);
  assert.equal(storage.has('sharedVault'), false);
});

