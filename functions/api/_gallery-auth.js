const SESSION_COOKIE = 'gallery_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders } });
}

export async function readJsonLimited(request, limitBytes) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body is missing.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limitBytes) { await reader.cancel(); throw new Error('Request body is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return origin === new URL(request.url).origin;
}

export function cookieHeader(request, token) {
  const secure = new URL(request.url).protocol === 'https:';
  const common = `Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  return `${SESSION_COOKIE}=${token}; ${common}; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function expiredCookie(request) {
  const secure = new URL(request.url).protocol === 'https:';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}; Max-Age=0`;
}

export async function issueSession(user, secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ sub: user, iat: now, exp: now + SESSION_TTL_SECONDS })));
  const signature = base64UrlEncode(await hmac(secret, payload));
  return `${payload}.${signature}`;
}

export async function getGalleryUser(request, env) {
  if (!env.GALLERY_SESSION_SECRET) return null;
  const raw = request.headers.get('cookie') || '';
  const token = raw.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) || '';
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  try {
    const expected = await hmac(env.GALLERY_SESSION_SECRET, payload);
    const actual = base64UrlDecode(signature);
    if (expected.length !== actual.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
    if (diff) return null;
    const session = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    if (!['Charlotte', 'Luke'].includes(session.sub) || !Number.isInteger(session.exp) || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session.sub;
  } catch { return null; }
}

export function requireGalleryConfig(env) {
  const missing = ['B2_ENDPOINT', 'B2_REGION', 'B2_BUCKET_NAME', 'B2_APPLICATION_KEY_ID', 'B2_APPLICATION_KEY'].filter(key => !env[key]);
  if (missing.length) throw new Error('Gallery storage is not configured yet.');
}

export async function roomRequest(env, body, method = 'POST') {
  if (!env.QUESTION_ROOM || !env.GALLERY_INTERNAL_SECRET) throw new Error('Gallery metadata storage is not configured yet.');
  const id = env.QUESTION_ROOM.idFromName('charlotte-question-night');
  return env.QUESTION_ROOM.get(id).fetch('https://question-room.internal/internal/gallery', {
    method,
    headers: { 'content-type': 'application/json', 'x-gallery-internal-secret': env.GALLERY_INTERNAL_SECRET },
    body: method === 'GET' ? undefined : JSON.stringify(body || {})
  });
}

export function isValidAlbum(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80 && !/[\\/\u0000-\u001f]/.test(value) && !['.', '..'].includes(value.trim());
}
