function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'charlotte-kiss-permission',
    Authorization: `Bearer ${token}`
  };
}

function decodeContent(content) {
  const binary = atob((content || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeContent(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

async function readPermissions(env) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/calendar/kiss-permissions.json?ref=${encodeURIComponent(env.GITHUB_BRANCH || 'main')}`;
  const response = await fetch(url, { headers: githubHeaders(env.GITHUB_TOKEN) });
  if (response.status === 404) return { permissions: [], sha: null };
  if (!response.ok) throw new Error(`Could not read permission notices (${response.status})`);
  const file = await response.json();
  const data = JSON.parse(decodeContent(file.content));
  return { permissions: Array.isArray(data.permissions) ? data.permissions : [], sha: file.sha };
}

async function savePermissions(env, permissions, sha, message) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/calendar/kiss-permissions.json`;
  const body = {
    message,
    content: encodeContent(JSON.stringify({ permissions }, null, 2)),
    branch: env.GITHUB_BRANCH || 'main'
  };
  if (sha) body.sha = sha;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { ...githubHeaders(env.GITHUB_TOKEN), 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || `Could not save permission notice (${response.status})`);
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) return jsonResponse({ error: 'Calendar storage is not configured.' }, 500);
  const user = new URL(request.url).searchParams.get('user');
  if (!['Charlotte', 'Luke'].includes(user)) return jsonResponse({ error: 'Choose a valid account.' }, 400);
  try {
    const data = await readPermissions(env);
    if (user !== 'Luke') return jsonResponse({ permissions: [] });

    const today = new Date().toISOString().slice(0, 10);
    const pending = data.permissions
      .filter(item => item && item.date && item.date >= today && !item.firstSeenAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const active = pending || data.permissions
      .filter(item => item && item.date && item.expiresOn >= today)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    if (pending) {
      pending.firstSeenAt = new Date().toISOString();
      await savePermissions(env, data.permissions, data.sha, 'Record first view of kiss permission notice');
    }
    return jsonResponse({ permissions: active ? [active] : [] });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Could not load permission notices.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) return jsonResponse({ error: 'Calendar storage is not configured.' }, 500);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid request.' }, 400); }
  if (body.user !== 'Charlotte') return jsonResponse({ error: 'Only Charlotte can post this permission notice.' }, 403);
  if (!validDate(body.date)) return jsonResponse({ error: 'Choose a valid calendar date.' }, 400);

  try {
    const data = await readPermissions(env);
    const expires = new Date(`${body.date}T00:00:00Z`);
    expires.setUTCDate(expires.getUTCDate() + 5);
    const permission = {
      id: crypto.randomUUID(),
      title: 'Kisses are allowed again',
      date: body.date,
      expiresOn: expires.toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      buyer: 'Charlotte'
    };
    data.permissions.push(permission);
    data.permissions = data.permissions.slice(-100);
    await savePermissions(env, data.permissions, data.sha, 'Add a kiss permission notice');
    return jsonResponse({ ok: true, permission });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Could not save the permission notice.' }, 500);
  }
}
