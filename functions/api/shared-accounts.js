import { getGalleryUser, json, readJsonLimited, roomRequest, sameOrigin } from './_gallery-auth.js';

export async function onRequestGet({ request, env }) {
  if (!(await getGalleryUser(request, env))) return json({ error: 'Please sign in to view our shared accounts.' }, 401);
  try {
    const response = await roomRequest(env, { action: 'get-shared-accounts' });
    if (!response.ok) return json({ error: 'Could not load our shared accounts.' }, 503);
    return json(await response.json());
  } catch {
    return json({ error: 'Our shared accounts are unavailable right now.' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'This request must come from our website.' }, 403);
  const user = await getGalleryUser(request, env);
  if (!user) return json({ error: 'Please sign in to update our shared accounts.' }, 401);
  let body;
  try { body = await readJsonLimited(request, 16 * 1024); } catch { return json({ error: 'Invalid account list.' }, 400); }
  if (!Array.isArray(body.accounts) || body.accounts.length > 30) return json({ error: 'Keep up to 30 shared account cards.' }, 400);
  for (const account of body.accounts) {
    if (!account || typeof account !== 'object'
      || typeof account.name !== 'string' || account.name.trim().length < 1 || account.name.length > 80
      || typeof account.platform !== 'string' || account.platform.length > 40
      || typeof account.handle !== 'string' || account.handle.length > 100
      || typeof account.profileUrl !== 'string' || account.profileUrl.length > 500
      || typeof account.visibility !== 'string' || account.visibility.length > 80
      || typeof account.note !== 'string' || account.note.length > 300) {
      return json({ error: 'Check the account name, handle, link, and notes.' }, 400);
    }
    if (account.profileUrl) {
      try { if (new URL(account.profileUrl).protocol !== 'https:') throw new Error(); }
      catch { return json({ error: 'Account links must be valid HTTPS links.' }, 400); }
    }
  }
  try {
    const response = await roomRequest(env, { action: 'save-shared-accounts', accounts: body.accounts, updatedBy: user });
    if (!response.ok) return json({ error: 'Could not save our shared accounts.' }, 503);
    return json(await response.json());
  } catch {
    return json({ error: 'Our shared accounts could not be saved right now.' }, 503);
  }
}
