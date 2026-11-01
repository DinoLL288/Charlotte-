import { getGalleryUser, json, readJsonLimited, roomRequest, sameOrigin } from './_gallery-auth.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'This request must come from our website.' }, 403);
  const user = await getGalleryUser(request, env);
  if (!user) return json({ error: 'Please sign in to manage calendar sharing.' }, 401);
  let body;
  try { body = await readJsonLimited(request, 2048); } catch { return json({ error: 'Invalid request.' }, 400); }
  const action = body.action === 'rotate' ? 'rotate-calendar-feed-link' : 'get-calendar-feed-link';
  try {
    const result = await roomRequest(env, { action });
    if (!result.ok) return json({ error: 'Could not manage the calendar link.' }, 503);
    const { token } = await result.json();
    const url = new URL('/api/calendar-feed.ics', request.url);
    url.searchParams.set('token', token);
    const httpsUrl = url.toString();
    return json({ ok: true, url: httpsUrl, webcalUrl: httpsUrl.replace(/^https:/, 'webcal:') });
  } catch {
    return json({ error: 'Calendar sharing is not available right now.' }, 503);
  }
}
