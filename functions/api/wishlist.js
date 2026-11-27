// Wishlist — a shared list of things Luke and Charlotte want, or
// want to buy each other. Each item has a name, an optional link and
// an optional price, and can be marked bought. Stored in
// data/wishlist.json on GitHub, the same way the calendar is stored
// (see functions/api/calendar.js).

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
    'User-Agent': 'cf-pages-wishlist'
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

// Parse a price the user typed: "$25", "25", "25.50", "$1,299.99"
// all become a number. A bad price is ignored (null) rather than
// an error, so a typo never blocks adding an item.
export function parsePrice(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  // Strip a leading $ and any commas/spaces inside the number.
  const cleaned = raw.replace(/^\s*\$+/, '').replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

// Format a stored price for display: 25 -> "$25", 25.5 -> "$25.50".
export function formatPrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value % 1 === 0 ? `$${value}` : `$${value.toFixed(2)}`;
}

function normalizePerson(value) {
  return value === 'Luke' || value === 'Charlotte' ? value : 'Unknown';
}

// A link is only stored when it is a real http(s) URL; anything else
// is dropped silently, so a mistyped link never breaks the list.
function normalizeLink(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
  } catch {
    return '';
  }
  return '';
}

const STORE_PATH = 'data/wishlist.json';

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
  return {
    items: Array.isArray(data.items) ? data.items : [],
    sha: json.sha
  };
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
      const name = String(body.name || '').trim();
      if (!name) {
        return jsonResponse({ error: 'A name is required' }, 400);
      }
      const item = {
        id: newId(),
        name,
        link: normalizeLink(body.link),
        price: parsePrice(body.price),
        addedBy: normalizePerson(body.addedBy),
        addedAt: new Date().toISOString(),
        bought: false,
        boughtBy: '',
        boughtAt: ''
      };
      store.items.push(item);
      message = `Add to wishlist: ${name}`;
      result = { id: item.id, item };
    } else if (action === 'bought') {
      const item = store.items.find(v => v && v.id === body.id);
      if (!item) return jsonResponse({ error: 'Item not found' }, 404);
      item.bought = body.bought === true;
      if (item.bought) {
        item.boughtBy = normalizePerson(body.boughtBy);
        item.boughtAt = new Date().toISOString();
      } else {
        item.boughtBy = '';
        item.boughtAt = '';
      }
      message = `${item.bought ? 'Mark wishlist item bought' : 'Mark wishlist item not bought'}: ${item.name}`;
      result = { id: item.id, bought: item.bought };
    } else if (action === 'remove') {
      const index = store.items.findIndex(v => v && v.id === body.id);
      if (index === -1) return jsonResponse({ error: 'Item not found' }, 404);
      const removed = store.items.splice(index, 1)[0];
      message = `Remove from wishlist: ${removed.name}`;
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
