// Shared journal — a short dated diary Luke and Charlotte both write in.
// Stored in data/journal.json on GitHub, the same way the calendar and
// the watch queue are stored (see functions/api/calendar.js and
// functions/api/watch-together.js).
//
// This replaces the earlier journal that lived in the question-room
// Durable Object (journal.html used to read /api/question-room?view=journal
// with journal-save / journal-delete actions). The GitHub-backed store is
// the site's standard pattern: it survives worker redeploys and the
// entries are visible in the repo. The old question-room journal actions
// are now unused.

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
    'User-Agent': 'cf-pages-journal'
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

const STORE_PATH = 'data/journal.json';
const MAX_ENTRIES = 500;

// Newest first, by createdAt (ISO strings sort correctly). Entries
// without a usable date fall to the end, keeping their stored order.
export function sortEntriesNewestFirst(entries) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  return list.sort((a, b) => {
    const ta = Date.parse((a && a.createdAt) || '');
    const tb = Date.parse((b && b.createdAt) || '');
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
}

// Only the person who wrote an entry may delete it.
export function isOwnEntry(entry, user) {
  return Boolean(entry && entry.author && user && entry.author === user);
}

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
    return { entries: [], sha: null };
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
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    sha: json.sha
  };
}

async function saveStore(context, store, message) {
  const { env } = context;
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';
  const content = encodeContent(JSON.stringify({ entries: store.entries }, null, 2));
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
      return jsonResponse({ entries: [], error: 'Missing GitHub configuration' }, 500);
    }
    const store = await getStore(context);
    return jsonResponse({ entries: sortEntriesNewestFirst(store.entries), sha: store.sha });
  } catch (e) {
    return jsonResponse({ entries: [], error: e.message }, 500);
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
      const entry = body.entry || {};
      const text = String(entry.body || '').trim();
      if (!text) {
        return jsonResponse({ error: 'Write something first' }, 400);
      }
      const title = String(entry.title || '').trim();
      const author = normalizePerson(body.user || body.author || entry.author);
      const createdAt = new Date().toISOString();
      const newEntry = {
        id: newId(),
        title,
        body: text,
        author,
        createdAt
      };
      store.entries = sortEntriesNewestFirst([newEntry, ...store.entries]);
      if (store.entries.length > MAX_ENTRIES) {
        store.entries = store.entries.slice(0, MAX_ENTRIES);
      }
      message = `Add journal entry by ${author}${title ? `: ${title}` : ''}`;
      result = { id: newEntry.id, entry: newEntry };
    } else if (action === 'delete') {
      const user = normalizePerson(body.user);
      const index = store.entries.findIndex(e => e && e.id === body.id);
      if (index === -1) {
        return jsonResponse({ error: 'Entry not found' }, 404);
      }
      if (!isOwnEntry(store.entries[index], user)) {
        return jsonResponse({ error: 'You can only delete your own entries' }, 403);
      }
      const removed = store.entries.splice(index, 1)[0];
      message = `Delete journal entry by ${removed.author}${removed.title ? `: ${removed.title}` : ''}`;
      result = { id: removed.id };
    } else {
      return jsonResponse({ error: 'Unknown action', received: action }, 400);
    }

    const sha = await saveStore(context, store, message);
    return jsonResponse({ ok: true, sha, entries: sortEntriesNewestFirst(store.entries), ...result });
  } catch (e) {
    return jsonResponse({ error: e.message || 'Internal server error' }, 500);
  }
}
