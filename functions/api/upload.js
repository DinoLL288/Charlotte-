import { json } from './_gallery-auth.js';

export async function onRequestPost() {
  return json({ error: 'The old GitHub image upload is disabled. Use the private gallery upload flow.' }, 410);
}
