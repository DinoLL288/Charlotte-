function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

function githubHeaders(token) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'cf-pages-calendar'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
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
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function findEventIndex(list, id, fallbackIndex) {
  if (id) {
    const byId = list.findIndex(ev => ev && ev.id === id);
    if (byId !== -1) return byId;
  }
  if (Number.isInteger(fallbackIndex) && fallbackIndex >= 0 && fallbackIndex < list.length) {
    return fallbackIndex;
  }
  return -1;
}

export async function onRequestGet(context) {
  try {
    const { env } = context;
    const repo = env.GITHUB_REPO;
    const token = env.GITHUB_TOKEN;
    const branch = env.GITHUB_BRANCH || 'main';

    if (!repo) return jsonResponse({ events: {} });

    const headers = githubHeaders(token);
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/calendar/events.json?ref=${encodeURIComponent(branch)}`, { headers });

    if (res.status === 404) return jsonResponse({ events: {} });
    if (!res.ok) return jsonResponse({ events: {}, error: `GitHub read failed (${res.status})` });

    const json = await res.json();
    if (!json || typeof json.content !== 'string') return jsonResponse({ events: {} });

    let data = { events: {} };
    try {
      data = JSON.parse(decodeContent(json.content));
    } catch {
      data = { events: {} };
    }

    return jsonResponse({ events: data.events || {}, sha: json.sha });
  } catch (e) {
    return jsonResponse({ events: {}, error: e.message });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const repo = env.GITHUB_REPO;
    const token = env.GITHUB_TOKEN;
    const branch = env.GITHUB_BRANCH || 'main';

    if (!repo || !token) {
      return jsonResponse({ error: 'Missing GITHUB_REPO or GITHUB_TOKEN' }, 500);
    }

    const headers = githubHeaders(token);

    let events = {};
    let currentSha = null;
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/calendar/events.json?ref=${encodeURIComponent(branch)}`, { headers });
    if (getRes.status === 200) {
      const getJson = await getRes.json();
      currentSha = getJson.sha;
      try {
        const data = JSON.parse(decodeContent(getJson.content || ''));
        events = data.events && typeof data.events === 'object' ? data.events : {};
      } catch {
        events = {};
      }
    } else if (getRes.status !== 404) {
      return jsonResponse({ error: `Could not read calendar (${getRes.status})` }, 500);
    }

    const action = body.action || 'add';
    let message = '';
    let eventId = '';

    if (action === 'update') {
      const date = String(body.date || '');
      const list = events[date];
      if (!Array.isArray(list) || list.length === 0) {
        return jsonResponse({ error: 'Event not found' }, 404);
      }
      const index = findEventIndex(list, body.id, Number(body.index));
      if (index === -1) return jsonResponse({ error: 'Event not found' }, 404);

      const title = String((body.event && body.event.title) || '').trim();
      if (!title) return jsonResponse({ error: 'Title is required' }, 400);

      const old = list[index];
      eventId = old.id || newId();
      list[index] = {
        ...old,
        id: eventId,
        title,
        time: String((body.event && body.event.time) || '').trim(),
        editedBy: String((body.event && body.event.author) || 'Unknown'),
        editedAt: new Date().toISOString()
      };
      message = `Edit calendar event: ${title}`;
    } else if (action === 'delete') {
      const date = String(body.date || '');
      const list = events[date];
      if (!Array.isArray(list) || list.length === 0) {
        return jsonResponse({ error: 'Event not found' }, 404);
      }
      const index = findEventIndex(list, body.id, Number(body.index));
      if (index === -1) return jsonResponse({ error: 'Event not found' }, 404);

      const removed = list.splice(index, 1)[0];
      if (list.length === 0) delete events[date];
      eventId = (removed && removed.id) || '';
      message = `Delete calendar event: ${(removed && removed.title) || date}`;
    } else {
      const date = String(body.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return jsonResponse({ error: 'Invalid date' }, 400);
      }
      const title = String((body.event && body.event.title) || '').trim();
      if (!title) return jsonResponse({ error: 'Title is required' }, 400);

      eventId = newId();
      if (!events[date]) events[date] = [];
      events[date].push({
        ...body.event,
        id: eventId,
        title,
        time: String((body.event && body.event.time) || '').trim(),
        author: String((body.event && body.event.author) || 'Unknown')
      });
      message = `Add calendar event for ${date}`;
    }

    const content = encodeContent(JSON.stringify({ events }, null, 2));
    const putBody = { message, content, branch };
    if (currentSha) putBody.sha = currentSha;

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/calendar/events.json`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(putBody)
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return jsonResponse({ error: json.message || 'GitHub API error' }, res.status);
    }

    return jsonResponse({ ok: true, sha: json.content.sha, id: eventId });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}
