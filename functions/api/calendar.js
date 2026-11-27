
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

// Who an event is for: 'both' (the default), 'Luke' or 'Charlotte'.
// Anything else falls back to 'both'.
function normalizeFor(value) {
  return value === 'Luke' || value === 'Charlotte' ? value : 'both';
}

function isValidFor(value) {
  return value === 'both' || value === 'Luke' || value === 'Charlotte';
}

const REPEAT_FREQUENCIES = ['daily', 'weekly', 'weekdays', 'monthly', 'every-n-days'];

// Date helpers for repeat expansion. All UTC so month lengths and
// weekdays never shift with the viewer's timezone.
function dateParts(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return { y, m, d };
}

function dateKeyOfParts(parts) {
  return `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  // month is 1-12; day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayOfWeek(parts) {
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay();
}

function addDays(parts, count) {
  const dt = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + count));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function nextRepeatDate(current, frequency, anchorDay, interval) {
  if (frequency === 'daily') return addDays(current, 1);
  if (frequency === 'every-n-days') return addDays(current, interval || 2);
  if (frequency === 'weekly') return addDays(current, 7);
  if (frequency === 'weekdays') {
    let next = addDays(current, 1);
    while (dayOfWeek(next) === 0 || dayOfWeek(next) === 6) {
      next = addDays(next, 1);
    }
    return next;
  }
  // monthly: step one month at a time, skipping months that do not
  // have the anchor day (31 Jan repeats 31 Mar, not 28 Feb).
  let y = current.y;
  let m = current.m + 1;
  if (m > 12) { m = 1; y += 1; }
  while (anchorDay > daysInMonth(y, m)) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return { y, m, d: anchorDay };
}

// Expand a repeat into its occurrence dates, starting on `startDate`
// and stopping at `until` (inclusive). At most 52 instances. The
// first occurrence is the start date itself when it matches the
// pattern — a weekday repeat starting on a Saturday begins on the
// Monday after, not on the Saturday. `interval` is the day gap for
// an 'every-n-days' repeat (2 = every other day).
function expandRepeat(startDate, frequency, until, interval) {
  const start = dateParts(startDate);
  const dates = [];
  let current = { ...start };
  if (frequency === 'weekdays') {
    while (dayOfWeek(current) === 0 || dayOfWeek(current) === 6) {
      current = addDays(current, 1);
    }
  }
  while (dates.length < 52) {
    const key = dateKeyOfParts(current);
    if (key > until) break;
    dates.push(key);
    current = nextRepeatDate(current, frequency, start.d, interval);
  }
  return dates;
}

// Pure helpers are exported so tests can check the repeat maths
// without a GitHub-backed request.
export { expandRepeat, normalizeFor, isValidFor, REPEAT_FREQUENCIES };

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
    `https://api.github.com/repos/${repo}/contents/data/calendar-events.json?ref=${encodeURIComponent(branch)}`;

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
    throw new Error('Could not parse data/calendar-events.json');
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

    return new Response(JSON.stringify({
      events: calendar.events,
      sha: calendar.sha
    }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=60, stale-while-revalidate=30' }
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
    let repeatInfo = null;

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

      // A repeat is expanded here into one stored instance per
      // occurrence, all sharing one repeatId.
      let repeat = null;
      if (event.repeat !== undefined && event.repeat !== null) {
        if (typeof event.repeat !== 'object' || Array.isArray(event.repeat)) {
          return jsonResponse({ error: 'Invalid repeat' }, 400);
        }
        const frequency = event.repeat.frequency;
        if (!REPEAT_FREQUENCIES.includes(frequency)) {
          return jsonResponse({
            error: 'Invalid repeat frequency',
            received: frequency ?? null,
            expected: 'daily, weekly, weekdays, monthly or every-n-days'
          }, 400);
        }
        // "Every few days" needs a whole-day gap: 2 to 30 days.
        let interval = null;
        if (frequency === 'every-n-days') {
          interval = Number(event.repeat.interval);
          if (!Number.isInteger(interval) || interval < 2 || interval > 30) {
            return jsonResponse({
              error: 'Invalid repeat interval',
              received: event.repeat.interval ?? null,
              expected: 'a whole number of days from 2 to 30'
            }, 400);
          }
        }
        const untilResult = getValidDate(event.repeat.until);
        if (!untilResult.valid) return jsonResponse(untilResult.error, 400);
        if (untilResult.date < date) {
          return jsonResponse({
            error: 'Repeat "until" date is before the start date',
            received: untilResult.date
          }, 400);
        }
        repeat = { frequency, until: untilResult.date, interval };
      }

      const baseEvent = {
        ...event,
        title,
        startTime: normalizeTime(event.startTime),
        endTime: normalizeTime(event.endTime),
        time: String(event.time || '').trim(),
        author: String(event.author || 'Unknown'),
        for: normalizeFor(event.for)
      };
      // The repeat spec itself is not stored on instances; the
      // shared repeatId is what groups them.
      delete baseEvent.repeat;
      delete baseEvent.repeatId;

      if (repeat) {
        const repeatId = newId();
        const dates = expandRepeat(date, repeat.frequency, repeat.until, repeat.interval);
        const ids = [];
        for (const occurrence of dates) {
          const id = newId();
          if (!Array.isArray(events[occurrence])) {
            events[occurrence] = [];
          }
          events[occurrence].push({ ...baseEvent, id, repeatId });
          ids.push(id);
        }
        eventId = ids[0] || '';
        repeatInfo = { repeatId, count: dates.length, ids };
        message = `Add repeating calendar event (${dates.length} dates) from ${date}`;
      } else {
        eventId = newId();

        if (!Array.isArray(events[date])) {
          events[date] = [];
        }

        events[date].push({ ...baseEvent, id: eventId });

        message = `Add calendar event for ${date}`;
      }

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

      // Optional move to a new date.
      let targetDate = date;
      if (body.newDate) {
        const nr = getValidDate(body.newDate);
        if (!nr.valid) return jsonResponse(nr.error, 400);
        targetDate = nr.date;
      }

      const updated = {
        ...old,
        id: eventId,
        title,
        startTime: normalizeTime(event.startTime),
        endTime: normalizeTime(event.endTime),
        time: String(event.time || '').trim(),
        // Editing one instance only ever touches that instance; a new
        // "for" value applies to it alone, the rest of a repeat series
        // keeps theirs.
        for: isValidFor(event.for)
          ? event.for
          : (isValidFor(old.for) ? old.for : 'both'),
        editedBy: String(event.author || 'Unknown'),
        editedAt: new Date().toISOString()
      };

      if (targetDate !== date) {
        list.splice(index, 1);
        if (list.length === 0) delete events[date];
        if (!Array.isArray(events[targetDate])) events[targetDate] = [];
        events[targetDate].push(updated);
      } else {
        list[index] = updated;
      }

      message = targetDate !== date
        ? `Move calendar event to ${targetDate}: ${title}`
        : `Edit calendar event: ${title}`;

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
      `https://api.github.com/repos/${repo}/contents/data/calendar-events.json`;

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
      id: eventId,
      ...(repeatInfo
        ? { repeatId: repeatInfo.repeatId, count: repeatInfo.count, ids: repeatInfo.ids }
        : {})
    });

  } catch (e) {
    return jsonResponse({
      error: e.message || 'Internal server error'
    }, 500);
  }
}
