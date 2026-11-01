import { cookieHeader, issueSession, json, readJsonLimited, roomRequest, sameOrigin } from '../_gallery-auth.js';

const VALID_USERS = ['Charlotte', 'Luke'];

async function sameSecret(left, right) {
  const encode = value => new TextEncoder().encode(value);
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', encode(left)), crypto.subtle.digest('SHA-256', encode(right))]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Login request rejected.' }, 403);
  if (!env.GALLERY_SESSION_SECRET || !env.GALLERY_INTERNAL_SECRET) return json({ error: 'Secure login has not been configured yet.' }, 503);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  let body;
  try { body = await readJsonLimited(request, 4096); } catch { return json({ error: 'Enter a valid username and password.' }, 400); }
  const user = VALID_USERS.includes(body.user) ? body.user : '';
  const password = typeof body.password === 'string' ? body.password.slice(0, 256) : '';
  const expected = user === 'Luke' ? env.LUKE_LOGIN_PASSWORD : user === 'Charlotte' ? env.CHARLOTTE_LOGIN_PASSWORD : '';
  const valid = Boolean(expected && password && await sameSecret(password, expected));
  const limiter = await roomRequest(env, { action: 'attempt-login', ip, user: user || 'unknown', success: valid });
  if (!limiter.ok) return json({ error: 'Login is temporarily unavailable.' }, 503);
  const limit = await limiter.json();
  if (!limit.allowed) return json({ error: 'Too many login attempts. Try again in 15 minutes.' }, 429);
  if (!valid) return json({ error: 'Username or password is incorrect.' }, 401);
  const token = await issueSession(user, env.GALLERY_SESSION_SECRET);
  return json({ ok: true, user }, 200, { 'set-cookie': cookieHeader(request, token) });
}
