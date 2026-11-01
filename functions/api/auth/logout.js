import { expiredCookie, json, sameOrigin } from '../_gallery-auth.js';

export async function onRequestPost({ request }) {
  if (!sameOrigin(request)) return json({ error: 'Logout request rejected.' }, 403);
  return json({ ok: true }, 200, { 'set-cookie': expiredCookie(request) });
}
