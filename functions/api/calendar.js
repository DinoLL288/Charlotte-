
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
    'User-Agent': 'cf-pages-calendar'
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

// Validate YYYY-MM-DD dates properly.
function isValidDate(value) {
  if (typeof value !== 'string') return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Get and validate a date from an API request.
function getValidDate(value) {
  const date = typeof value === 'string' ? value.trim() : '';

  if (!isValidDate(date)) {
    return {
      valid: false,
      date,
      error: {
        error: 'Invalid date',
        received: value ?? null,
        expected: 'YYYY-MM-DD'
      }
    };
  }

  return {
    valid: true,
    date
  };
}

function findEventIndex(list, id, fallbackIndex) {
  if (id) {
    const byId = list.findIndex(ev => ev && ev.id === id);

    if (byId !== -1) return byId;
  }

  if (
    Number.isInteger(fallbackIndex) &&
    fallbackIndex >= 0 &&
    fallbackIndex < list.length
  ) {
    return fallbackIndex;
  }

  return -1;
}

function normalizeTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(
    String(value || '').trim()
  );

  if (!match) return '';

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return '';

  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

async function getCalendar(context) {
  const { env } = context;

  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';

  if (!repo || !token) {
    throw new Error('Missing GITHUB_REPO or GITHUB_TOKEN');
  }

  const headers = githubHeaders(token);

  const url =
    `https://api.github.com/repos/${repo}/contents/calendar/events.json?ref=${encodeURIComponent(branch)}`;

  const response = await fetch(url, { headers });

  if (response.status === 404) {
    return {
      events: {},
      sha: null
    };
  }

  if (!response.ok) {
    throw new Error(`GitHub read failed (${response.status})`);
  }

  const json = await response.json();

  if (typeof json.content !== 'string') {
    throw new Error('Invalid calendar file from GitHub');
  }

  let data;

  try {
    data = JSON.parse(decodeContent(json.content));
  } catch {
    throw new Error('Could not parse calendar/events.json');
  }

  return {
    events: data.events && typeof data.events === 'object'
      ? data.events
      : {},
    sha: json.sha
  };
}

export async function onRequestGet(context) {
  try {
    const { env } = context;

    if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) {
      return jsonResponse({ events: {}, error: 'Missing GitHub configuration' }, 500);
    }

    const calendar = await getCalendar(context);

    return jsonResponse({
      events: calendar.events,
      sha: calendar.sha
    });

  } catch (e) {
    return jsonResponse({
      events: {},
      error: e.message
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) {
      return jsonResponse({
        error: 'Missing GITHUB_REPO or GITHUB_TOKEN'
      }, 500);
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

    const repo = env.GITHUB_REPO;
    const token = env.GITHUB_TOKEN;
    const branch = env.GITHUB_BRANCH || 'main';

    const headers = githubHeaders(token);

    // Load existing calendar.
    const calendar = await getCalendar(context);

    const events = calendar.events;
    const currentSha = calendar.sha;

    const action = body.action || 'add';

    let message = '';
    let eventId = '';

    // ADD EVENT
    if (action === 'add') {
      const result = getValidDate(body.date);

      if (!result.valid) {
        return jsonResponse(result.error, 400);
      }

      const date = result.date;

      const title = String(
        (body.event && body.event.title) || ''
      ).trim();

      if (!title) {
        return jsonResponse({
          error: 'Title is required'
        }, 400);
      }

      const event = body.event || {};

      eventId = newId();

      if (!Array.isArray(events[date])) {
        events[date] = [];
      }

      events[date].push({
        ...event,
        id: eventId,
        title,
        startTime: normalizeTime(event.startTime),
        time: String(event.time || '').trim(),
        author: String(event.author || 'Unknown')
      });

      message = `Add calendar event for ${date}`;

    // UPDATE EVENT
    } else if (action === 'update') {
      const result = getValidDate(body.date);

      if (!result.valid) {
        return jsonResponse(result.error, 400);
      }

      const date = result.date;
      const list = events[date];

      if (!Array.isArray(list) || list.length === 0) {
        return jsonResponse({
          error: 'Event not found'
        }, 404);
      }

      const index = findEventIndex(
        list,
        body.id,
        Number(body.index)
      );

      if (index === -1) {
        return jsonResponse({
          error: 'Event not found'
        }, 404);
      }

      const event = body.event || {};

      const title = String(event.title || '').trim();

      if (!title) {
        return jsonResponse({
          error: 'Title is required'
        }, 400);
      }

      const old = list[index];

      eventId = old.id || newId();

      list[index] = {
        ...old,
        id: eventId,
        title,
        startTime: normalizeTime(event.startTime),
        time: String(event.time || '').trim(),
        editedBy: String(event.author || 'Unknown'),
        editedAt: new Date().toISOString()
      };

      message = `Edit calendar event: ${title}`;

    // DELETE EVENT
    } else if (action === 'delete') {
      const result = getValidDate(body.date);

      if (!result.valid) {
        return jsonResponse(result.error, 400);
      }

      const date = result.date;
      const list = events[date];

      if (!Array.isArray(list) || list.length === 0) {
        return jsonResponse({
          error: 'Event not found'
        }, 404);
      }

      const index = findEventIndex(
        list,
        body.id,
        Number(body.index)
      );

      if (index === -1) {
        return jsonResponse({
          error: 'Event not found'
        }, 404);
      }

      const removed = list.splice(index, 1)[0];

      if (list.length === 0) {
        delete events[date];
      }

      eventId = removed.id || '';

      message = `Delete calendar event: ${removed.title || date}`;

    } else {
      return jsonResponse({
        error: 'Unknown action',
        received: action
      }, 400);
    }

    // Save updated calendar to GitHub.
    const content = encodeContent(
      JSON.stringify({ events }, null, 2)
    );

    const putBody = {
      message,
      content,
      branch
    };

    if (currentSha) {
      putBody.sha = currentSha;
    }

    const url =
      `https://api.github.com/repos/${repo}/contents/calendar/events.json`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...headers,
        'content-type': 'application/json'
      },
      body: JSON.stringify(putBody)
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      return jsonResponse({
        error: json.message || 'GitHub API error',
        status: response.status
      }, response.status);
    }

    return jsonResponse({
      ok: true,
      sha: json.content?.sha || null,
      id: eventId
    });

  } catch (e) {
    return jsonResponse({
      error: e.message || 'Internal server error'
    }, 500);
  }
}
