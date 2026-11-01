import { getGalleryUser, json, readJsonLimited, roomRequest, sameOrigin } from './_gallery-auth.js';

export async function onRequestGet({ request, env }) {
  if (!(await getGalleryUser(request, env))) return json({ error: 'Please sign in first.' }, 401);
  try {
    const response = await roomRequest(env, { action: 'get-youtube-client-id' });
    if (!response.ok) return json({ error: 'YouTube setup is unavailable.' }, 503);
    return json(await response.json());
  } catch { return json({ error: 'YouTube setup is unavailable.' }, 503); }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'This request must come from our website.' }, 403);
  if (!(await getGalleryUser(request, env))) return json({ error: 'Please sign in first.' }, 401);
  let body;
  try { body = await readJsonLimited(request, 2048); } catch { return json({ error: 'Invalid YouTube setup.' }, 400); }
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  if (clientId && (!clientId.endsWith('.apps.googleusercontent.com') || clientId.length > 300)) return json({ error: 'Enter a valid Google OAuth web client ID.' }, 400);
  try {
    const response = await roomRequest(env, { action: 'set-youtube-client-id', clientId });
    if (!response.ok) return json({ error: 'YouTube setup could not be saved.' }, 503);
    return json(await response.json());
  } catch { return json({ error: 'YouTube setup could not be saved.' }, 503); }
}
