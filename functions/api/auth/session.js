import { getGalleryUser, json } from '../_gallery-auth.js';

export async function onRequestGet({ request, env }) {
  if (!env.GALLERY_SESSION_SECRET) return json({ error: 'Secure login has not been configured yet.' }, 503);
  const user = await getGalleryUser(request, env);
  return user ? json({ user }) : json({ error: 'Please log in again.' }, 401);
}
