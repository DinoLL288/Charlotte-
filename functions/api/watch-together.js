// Watch together — a shared YouTube queue and a shared "now playing"
// state so Luke and Charlotte can queue videos and watch them in sync.
// Stored in data/watch-queue.json on GitHub, the same way the calendar
// is stored (see functions/api/calendar.js).
//
// TODO (shared Google account): once the eu.org domain is approved and
// Google sign-in works for the site, connect the shared Google/YouTube
// account here — store a YouTube OAuth token server-side and use the
// YouTube Data API for titles, playlists and the shared account's
// subscriptions instead of the no-auth oEmbed lookup below. Until then
// this page uses the site login (Luke/Charlotte) only; no Google OAuth
// and no YouTube Data API are involved.

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
    'User-Agent': 'cf-pages-watch-together'
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

// Pull a YouTube video id out of a watch, short, shorts, embed or live
// URL, or a bare video id. Returns the 11-character id or null.
export function parseYouTubeId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const id = /^[A-Za-z0-9_-]{11}$/;
  if (host === 'youtu.be') {
    const first = url.pathname.split('/').filter(Boolean)[0] || '';
    return id.test(first) ? first : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host.endsWith('.youtube.com')) {
    const v = url.searchParams.get('v') || '';
    if (id.test(v)) return v;
    const parts = url.pathname.split('/').filter(Boolean);
    if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') && id.test(parts[1] || '')) {
      return parts[1];
    }
  }
  return null;
}

function normalizePerson(value) {
  return value === 'Luke' || value === 'Charlotte' ? value : 'Unknown';
}

// Look up a video title without any login, via YouTube's oEmbed
// endpoint. Returns the title string, or null when it cannot be found.
async function fetchVideoTitle(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    return title || null;
  } catch {
    return null;
  }
}

const STORE_PATH = 'data/watch-queue.json';

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
    return { queue: [], nowPlaying: null, sha: null };
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
    queue: Array.isArray(data.queue) ? data.queue : [],
    nowPlaying: data.nowPlaying && typeof data.nowPlaying === 'object' ? data.nowPlaying : null,
    sha: json.sha
  };
}

async function saveStore(context, store, message) {
  const { env } = context;
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';
  const content = encodeContent(JSON.stringify({ queue: store.queue, nowPlaying: store.nowPlaying }, null, 2));
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
      return jsonResponse({ queue: [], nowPlaying: null, error: 'Missing GitHub configuration' }, 500);
    }
    const store = await getStore(context);
    return jsonResponse({ queue: store.queue, nowPlaying: store.nowPlaying, sha: store.sha });
  } catch (e) {
    return jsonResponse({ queue: [], nowPlaying: null, error: e.message }, 500);
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
      const videoId = parseYouTubeId(body.url || body.videoId || '');
      if (!videoId) {
        return jsonResponse({ error: 'That does not look like a YouTube link', received: String(body.url || body.videoId || '') }, 400);
      }
      const existing = store.queue.find(v => v && v.videoId === videoId);
      if (existing) {
        return jsonResponse({ ok: true, duplicate: true, id: existing.id, queue: store.queue, nowPlaying: store.nowPlaying });
      }
      const addedBy = normalizePerson(body.addedBy);
      const title = (await fetchVideoTitle(videoId)) || videoId;
      const video = {
        id: newId(),
        videoId,
        title,
        addedBy,
        addedAt: new Date().toISOString(),
        watched: false
      };
      store.queue.push(video);
      message = `Add video to watch queue: ${title}`;
      result = { id: video.id, video };
    } else if (action === 'watch') {
      const item = store.queue.find(v => v && v.id === body.id);
      if (!item) return jsonResponse({ error: 'Video not found' }, 404);
      item.watched = body.watched === true;
      message = `${item.watched ? 'Mark video watched' : 'Mark video unwatched'}: ${item.title}`;
      result = { id: item.id, watched: item.watched };
    } else if (action === 'remove') {
      const index = store.queue.findIndex(v => v && v.id === body.id);
      if (index === -1) return jsonResponse({ error: 'Video not found' }, 404);
      const removed = store.queue.splice(index, 1)[0];
      if (store.nowPlaying && store.nowPlaying.videoId === removed.videoId) {
        store.nowPlaying = null;
      }
      message = `Remove video from watch queue: ${removed.title}`;
      result = { id: removed.id };
    } else if (action === 'play') {
      const videoId = parseYouTubeId(body.videoId || '');
      if (!videoId) return jsonResponse({ error: 'Invalid video' }, 400);
      if (!store.queue.some(v => v && v.videoId === videoId)) {
        return jsonResponse({ error: 'Video is not in the queue' }, 404);
      }
      const state = body.state === 'playing' ? 'playing' : 'paused';
      const position = Math.max(0, Number(body.position) || 0);
      store.nowPlaying = {
        videoId,
        state,
        position,
        updatedAt: new Date().toISOString(),
        updatedBy: normalizePerson(body.updatedBy)
      };
      message = `Watch together: ${state} ${videoId} at ${position}s`;
      result = { nowPlaying: store.nowPlaying };
    } else if (action === 'stop') {
      store.nowPlaying = null;
      message = 'Watch together: stop playback';
      result = { nowPlaying: null };
    } else {
      return jsonResponse({ error: 'Unknown action', received: action }, 400);
    }

    const sha = await saveStore(context, store, message);
    return jsonResponse({ ok: true, sha, queue: store.queue, nowPlaying: store.nowPlaying, ...result });
  } catch (e) {
    return jsonResponse({ error: e.message || 'Internal server error' }, 500);
  }
}
