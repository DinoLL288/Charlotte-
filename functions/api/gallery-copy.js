import { json } from './_gallery-auth.js';

export async function onRequestPost() {
  return json({ error: 'The old GitHub gallery copy endpoint is disabled. Use the private gallery album action.' }, 410);
}
