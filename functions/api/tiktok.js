const PLANS_PATH = 'tiktok/plans.json';
const EVENTS_PATH = 'calendar/events.json';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  });
}

function githubHeaders(env) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'cf-pages-tiktok'
  };
  if (env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`;
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

async function readJson(env, path, fallback) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, {
    headers: githubHeaders(env)
  });
  if (res.status === 404) return { data: fallback, sha: null };
  if (!res.ok) throw new Error(`Could not read ${path} (${res.status})`);
  const meta = await res.json();
  if (!meta || Array.isArray(meta) || typeof meta.content !== 'string') {
    throw new Error(`${path} is not a file`);
  }
  try {
    return { data: JSON.parse(decodeContent(meta.content)), sha: meta.sha };
  } catch {
    return { data: fallback, sha: meta.sha };
  }
}

async function writeJson(env, path, data, sha, message) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  const body = {
    message,
    content: encodeContent(JSON.stringify(data, null, 2)),
    branch
  };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: githubHeaders(env),
    body: JSON.stringify(body)
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.message || `Could not save ${path} (${res.status})`);
  return out.content ? out.content.sha : null;
}

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanNote(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeUrl(value) {
  let url = cleanText(value, 500);
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00'));
}

function isTime(value) {
  return /^\d{1,2}:\d{2}$/.test(value);
}

async function lookupTikTok(url) {
  if (!/tiktok\.com/i.test(url)) return null;
  try {
    const res = await fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(url), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cf-pages-tiktok)' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: typeof data.title === 'string' ? data.title : '',
      author: typeof data.author_name === 'string' ? data.author_name : ''
    };
  } catch {
    return null;
  }
}

function sortPlans(plans) {
  return [...plans].sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');
    if (a.date) return -1;
    if (b.date) return 1;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

async function syncCalendar(env, plan) {
  const { data, sha } = await readJson(env, EVENTS_PATH, { events: {} });
  const events = data && data.events && typeof data.events === 'object' ? data.events : {};
  let changed = false;

  // Remove any calendar entry this plan created earlier (reschedules must not duplicate).
  for (const key of Object.keys(events)) {
    if (!Array.isArray(events[key])) continue;
    const before = events[key].length;
    events[key] = events[key].filter(e => !(e && e.source === 'tiktok' && e.sourceId === plan.id));
    if (events[key].length !== before) changed = true;
    if (events[key].length === 0) delete events[key];
  }

  if (plan.date) {
    const time = [plan.time ? 'Dance at ' + plan.time : '', plan.url].filter(Boolean).join(' · ');
    if (!events[plan.date]) events[plan.date] = [];
    events[plan.date].push({
      title: 'TikTok: ' + (plan.title || 'Dance idea'),
      time,
      author: plan.author || 'Unknown',
      date: new Date().toISOString(),
      source: 'tiktok',
      sourceId: plan.id
    });
    changed = true;
  }

  if (changed) {
    await writeJson(env, EVENTS_PATH, { events }, sha, `Sync TikTok plan to calendar: ${plan.title || plan.id}`);
  }
  return changed;
}

async function handleSave(env, body) {
  if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) {
    return jsonResponse({ error: 'Saving needs GITHUB_REPO and GITHUB_TOKEN set in Cloudflare' }, 500);
  }

  const raw = body.plan || {};
  const { data, sha } = await readJson(env, PLANS_PATH, { plans: [] });
  const plans = Array.isArray(data.plans) ? data.plans : [];

  const id = cleanText(raw.id, 100);
  const existingIndex = id ? plans.findIndex(p => p.id === id) : -1;
  const existing = existingIndex >= 0 ? plans[existingIndex] : null;

  const url = normalizeUrl(raw.url) || (existing ? existing.url : '');
  if (!url) return jsonResponse({ error: 'Please paste a valid link' }, 400);

  const date = isDate(cleanText(raw.date, 10)) ? cleanText(raw.date, 10) : '';
  const time = isTime(cleanText(raw.time, 5)) ? cleanText(raw.time, 5) : '';

  let title = cleanText(raw.title, 120);
  if (!title && !existing) {
    const info = await lookupTikTok(url);
    if (info && info.title) title = cleanText(info.title, 100);
  }

  const plan = {
    ...(existing || {}),
    id: existing ? existing.id : (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    url,
    title: title || (existing && existing.title) || 'TikTok dance',
    date,
    time,
    note: cleanNote(raw.note, 500),
    author: (existing && existing.author) || cleanText(raw.author, 60) || 'Unknown',
    createdAt: (existing && existing.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) plans[existingIndex] = plan;
  else plans.push(plan);

  await writeJson(env, PLANS_PATH, { plans }, sha, `${existing ? 'Update' : 'Add'} TikTok plan: ${plan.title}`);

  let calendarSynced = true;
  let calendarWarning = '';
  try {
    await syncCalendar(env, plan);
  } catch (e) {
    calendarSynced = false;
    calendarWarning = e.message;
  }

  return jsonResponse({ ok: true, plans: sortPlans(plans), plan, calendarSynced, calendarWarning });
}

async function handleDelete(env, body) {
  if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) {
    return jsonResponse({ error: 'Saving needs GITHUB_REPO and GITHUB_TOKEN set in Cloudflare' }, 500);
  }

  const id = cleanText(body.id, 100);
  if (!id) return jsonResponse({ error: 'Missing plan id' }, 400);

  const { data, sha } = await readJson(env, PLANS_PATH, { plans: [] });
  const plans = Array.isArray(data.plans) ? data.plans : [];
  const remaining = plans.filter(p => p.id !== id);

  if (remaining.length !== plans.length) {
    await writeJson(env, PLANS_PATH, { plans: remaining }, sha, 'Delete TikTok plan');
  }

  let calendarSynced = true;
  let calendarWarning = '';
  try {
    await syncCalendar(env, { id });
  } catch (e) {
    calendarSynced = false;
    calendarWarning = e.message;
  }

  return jsonResponse({ ok: true, plans: sortPlans(remaining), calendarSynced, calendarWarning });
}

export async function onRequestGet(context) {
  try {
    const { env } = context;
    if (!env.GITHUB_REPO) return jsonResponse({ plans: [] });
    const { data } = await readJson(env, PLANS_PATH, { plans: [] });
    const plans = Array.isArray(data.plans) ? data.plans : [];
    return jsonResponse({ plans: sortPlans(plans) });
  } catch (e) {
    return jsonResponse({ plans: [], error: e.message });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json().catch(() => ({}));
    if (body.action === 'delete') return await handleDelete(env, body);
    return await handleSave(env, body);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}
