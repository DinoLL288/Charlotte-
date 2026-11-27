// Shared bucket list — things Luke and Charlotte want to do together.
// Stored in data/bucket-list.json on GitHub, the same way the watch
// queue is stored (see functions/api/watch-together.js). Items carry
// the text, who added it, and the done state (when it was ticked off
// and by whom). Completed items are shown struck through at the bottom
// of the page.

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  });
}

function githubHeaders(token) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'cf-pages-bucket-list'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function decodeContent(content) {
  const binary = atob((content || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeContent(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function newId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePerson(value) {
  return value === 'Luke' || value === 'Charlotte' ? value : 'Unknown';
}

// Keep items tidy: text is required, trimmed, and capped so one long
// paste cannot blow up the store.
function cleanText(value) {
  return String(value || '').trim().slice(0, 200);
}

function normalizeItem(value) {
  if (!value || typeof value !== 'object') return null;
  const text = cleanText(value.text);
  if (!text) return null;
  return {
    id: typeof value.id === 'string' && value.id ? value.id : newId(),
    text,
    addedBy: normalizePerson(value.addedBy),
    addedAt: typeof value.addedAt === 'string' ? value.addedAt : new Date().toISOString(),
    done: value.done === true,
    doneAt: typeof value.doneAt === 'string' ? value.doneAt : null,
    doneBy: normalizePerson(value.doneBy)
  };
}

const STORE_PATH = 'data/bucket-list.json';

async function getStore(context) {
  const { env } = context;
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';
  if (!repo || !token) {
    throw new Error('Missing GITHUB_REPO or GITHUB_TOKEN');
  }
  const headers = githubHeaders(token);
  const url = `https://api.github.com/repos/${repo}/contents/${STORE_PATH}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers });
  if (response.status === 404) {
    return { items: [], sha: null };
  }
  if (!response.ok) {
    throw new Error(`GitHub read failed (${response.status})`);
  }
  const json = await response.json();
  if (typeof json.content !== 'string') {
    throw new Error(`Invalid ${STORE_PATH} from GitHub`);
  }
  let data;
  try {
    data = JSON.parse(decodeContent(json.content));
  } catch {
    throw new Error(`Could not parse ${STORE_PATH}`);
  }
  const items = Array.isArray(data.items) ? data.items.map(normalizeItem).filter(Boolean) : [];
  return { items, sha: json.sha };
}

async function saveStore(context, store, message) {
  const { env } = context;
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';
  const content = encodeContent(JSON.stringify({ items: store.items }, null, 2));
  const putBody = { message, content, branch };
  if (store.sha) putBody.sha = store.sha;
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/${STORE_PATH}`,
    {
      method: 'PUT',
      headers: { ...githubHeaders(token), 'content-type': 'application/json' },
      body: JSON.stringify(putBody)
    }
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.message || 'GitHub API error');
  }
  return json.content?.sha || null;
}

export async function onRequestGet(context) {
  try {
    const { env } = context;
    if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) {
      return jsonResponse({ items: [], error: 'Missing GitHub configuration' }, 500);
    }
    const store = await getStore(context);
    return jsonResponse({ items: store.items, sha: store.sha });
  } catch (e) {
    return jsonResponse({ items: [], error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) {
      return jsonResponse({ error: 'Missing GITHUB_REPO or GITHUB_TOKEN' }, 500);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON request body' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    const store = await getStore(context);
    const action = body.action || '';
    let message = '';
    let result = {};

    if (action === 'add') {
      const text = cleanText(body.text);
      if (!text) {
        return jsonResponse({ error: 'Write something for the bucket list first' }, 400);
      }
      const item = {
        id: newId(),
        text,
        addedBy: normalizePerson(body.addedBy),
        addedAt: new Date().toISOString(),
        done: false,
        doneAt: null,
        doneBy: 'Unknown'
      };
      store.items.push(item);
      message = `Add to bucket list: ${text}`;
      result = { id: item.id, item };
    } else if (action === 'toggle') {
      const item = store.items.find(v => v && v.id === body.id);
      if (!item) return jsonResponse({ error: 'Bucket list item not found' }, 404);
      item.done = body.done === true;
      if (item.done) {
        item.doneAt = new Date().toISOString();
        item.doneBy = normalizePerson(body.doneBy);
      } else {
        item.doneAt = null;
        item.doneBy = 'Unknown';
      }
      message = `${item.done ? 'Tick off bucket list' : 'Untick bucket list'}: ${item.text}`;
      result = { id: item.id, done: item.done, doneAt: item.doneAt, doneBy: item.doneBy };
    } else if (action === 'remove') {
      const index = store.items.findIndex(v => v && v.id === body.id);
      if (index === -1) return jsonResponse({ error: 'Bucket list item not found' }, 404);
      const removed = store.items.splice(index, 1)[0];
      message = `Remove from bucket list: ${removed.text}`;
      result = { id: removed.id };
    } else {
      return jsonResponse({ error: 'Unknown action', received: action }, 400);
    }

    const sha = await saveStore(context, store, message);
    return jsonResponse({ ok: true, sha, items: store.items, ...result });
  } catch (e) {
    return jsonResponse({ error: e.message || 'Internal server error' }, 500);
  }
}
