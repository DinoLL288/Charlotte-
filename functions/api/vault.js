import { getGalleryUser, json, readJsonLimited, roomRequest, sameOrigin } from './_gallery-auth.js';

// The browser encrypts everything before it reaches us. This API only ever
// sees an opaque AES-GCM blob, so there is nothing readable to leak here.
const MAX_VAULT_BYTES = 120 * 1024;
const ITERATION_RANGE = { min: 100000, max: 2000000 };

function isBase64Url(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
}

function cleanVault(value) {
  if (!value || typeof value !== 'object') return null;
  const vault = value;
  if (vault.version !== 1) return null;
  if (vault.kdf !== 'PBKDF2-SHA256') return null;
  if (!Number.isInteger(vault.iterations) || vault.iterations < ITERATION_RANGE.min || vault.iterations > ITERATION_RANGE.max) return null;
  if (!isBase64Url(vault.salt, 16, 64)) return null;
  if (!isBase64Url(vault.iv, 12, 32)) return null;
  if (!isBase64Url(vault.ciphertext, 16, 90000)) return null;
  return { version: 1, kdf: 'PBKDF2-SHA256', iterations: vault.iterations, salt: vault.salt, iv: vault.iv, ciphertext: vault.ciphertext };
}

export async function onRequestGet({ request, env }) {
  const user = await getGalleryUser(request, env);
  if (!user) return json({ error: 'Please log in to open our little safe.' }, 401);
  try {
    const response = await roomRequest(env, {}, 'GET');
    if (!response.ok) return json({ error: 'Our little safe is temporarily unavailable.' }, 503);
    const data = await response.json();
    return json({ ok: true, vault: data.vault || null });
  } catch {
    return json({ error: 'Our little safe is temporarily unavailable.' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  const user = await getGalleryUser(request, env);
  if (!user) return json({ error: 'Please log in to change our little safe.' }, 401);
  if (!sameOrigin(request)) return json({ error: 'Safe request rejected.' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Send a valid safe request.' }, 415);
  if (Number(request.headers.get('content-length')) > MAX_VAULT_BYTES) return json({ error: 'Our little safe is full. Remove a few entries and try again.' }, 413);

  let body;
  try {
    body = await readJsonLimited(request, MAX_VAULT_BYTES);
  } catch (error) {
    const tooLarge = error.message === 'Request body is too large.';
    return json({ error: tooLarge ? 'Our little safe is full. Remove a few entries and try again.' : 'Invalid safe request.' }, tooLarge ? 413 : 400);
  }

  try {
    if (body.action === 'save') {
      const vault = cleanVault(body.vault);
      if (!vault) return json({ error: 'That safe could not be saved. Please try again.' }, 400);
      const response = await roomRequest(env, { action: 'save-vault', vault, updatedBy: user });
      if (!response.ok) return json({ error: 'Could not save our little safe right now.' }, 503);
      const data = await response.json();
      return json({ ok: true, vault: data.vault });
    }

    if (body.action === 'erase') {
      const response = await roomRequest(env, { action: 'erase-vault' });
      if (!response.ok) return json({ error: 'Could not clear our little safe right now.' }, 503);
      return json({ ok: true });
    }

    return json({ error: 'Unknown safe request.' }, 400);
  } catch {
    return json({ error: 'Our little safe is temporarily unavailable.' }, 503);
  }
}
