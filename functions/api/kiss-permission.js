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

async function readPermissionState(env) {
  const branch = env.GITHUB_BRANCH || 'main';
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/calendar/kiss-permissions.json?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers: githubHeaders(env.GITHUB_TOKEN) });
  if (response.status === 404) return { state: { welcome: false, updatedAt: null }, sha: null };
  if (!response.ok) throw new Error(`Could not read the kiss welcome setting (${response.status})`);
  const file = await response.json();
  const saved = JSON.parse(decodeContent(file.content));
  // Old date-limited notices are deliberately not treated as ongoing permission.
  const state = saved.state && typeof saved.state === 'object'
    ? { welcome: saved.state.welcome === true, updatedAt: saved.state.updatedAt || null, updatedBy: saved.state.updatedBy || 'Charlotte' }
    : { welcome: false, updatedAt: null };
  return { state, sha: file.sha };
}

async function savePermissionState(env, state, sha) {
  const branch = env.GITHUB_BRANCH || 'main';
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/calendar/kiss-permissions.json`;
  const body = {
    message: state.welcome ? 'Set kisses as welcome' : 'Pause kiss welcome setting',
    content: encodeContent(JSON.stringify({ state }, null, 2)),
    branch
  };
  if (sha) body.sha = sha;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { ...githubHeaders(env.GITHUB_TOKEN), 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || `Could not save the kiss welcome setting (${response.status})`);
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) return jsonResponse({ error: 'Calendar storage is not configured.' }, 500);
  const user = new URL(request.url).searchParams.get('user');
  if (!['Charlotte', 'Luke'].includes(user)) return jsonResponse({ error: 'Choose a valid account.' }, 400);
  try {
    const { state } = await readPermissionState(env);
    return jsonResponse({ state });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Could not load the kiss welcome setting.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) return jsonResponse({ error: 'Calendar storage is not configured.' }, 500);
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid request.' }, 400); }
  if (body.user !== 'Charlotte') return jsonResponse({ error: 'Only Charlotte can change this setting.' }, 403);
  if (typeof body.welcome !== 'boolean') return jsonResponse({ error: 'Choose whether kisses are welcome.' }, 400);

  try {
    const { sha } = await readPermissionState(env);
    const state = {
      welcome: body.welcome,
      updatedAt: new Date().toISOString(),
      updatedBy: 'Charlotte'
    };
    await savePermissionState(env, state, sha);
    return jsonResponse({ ok: true, state });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Could not save the kiss welcome setting.' }, 500);
  }
}
