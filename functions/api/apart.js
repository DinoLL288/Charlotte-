const APART_AUTHORS = ['Charlotte', 'Luke'];
const MAX_ENTRIES = 200;

async function getApart(env) {
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';
  if (!repo) return { entries: [], sha: null };

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'cf-pages-apart'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/apart/apart.json?ref=${branch}`, { headers });
  if (res.status === 404) return { entries: [], sha: null };

  const json = await res.json();
  try {
    const content = atob((json.content || '').replace(/\n/g, ''));
    const data = JSON.parse(decodeURIComponent(escape(content)) || '{"entries":[]}');
    return { entries: data.entries || [], sha: json.sha };
  } catch {
    const content = atob((json.content || '').replace(/\n/g, ''));
    const data = JSON.parse(content || '{"entries":[]}');
    return { entries: data.entries || [], sha: json.sha };
  }
}

async function saveApart(env, entries, sha, message) {
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';
  if (!repo || !token) throw new Error('Missing GITHUB_REPO or GITHUB_TOKEN');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'cf-pages-apart'
  };

  let currentSha = sha;
  if (!currentSha) {
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/apart/apart.json?ref=${branch}`, { headers });
    if (getRes.status === 200) {
      const getJson = await getRes.json();
      currentSha = getJson.sha;
    }
  }

  const updatedContent = JSON.stringify({ entries }, null, 2);
  const content = btoa(unescape(encodeURIComponent(updatedContent)));

  const body = {
    message: message || 'Update quiet days',
    content: content,
    branch: branch
  };
  if (currentSha) body.sha = currentSha;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/apart/apart.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'GitHub API error');
  return json.content.sha;
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function onRequestGet(context) {
  try {
    const result = await getApart(context.env);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'Could not load quiet days' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { env } = context;
    const { entries, sha: currentSha } = await getApart(env);

    if (body.action === 'delete') {
      const id = typeof body.id === 'string' ? body.id : '';
      const currentUser = typeof body.currentUser === 'string' ? body.currentUser : '';
      const index = entries.findIndex(entry => entry.id === id);

      if (index === -1) {
        return new Response(JSON.stringify({ error: 'Quiet days not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }

      const target = entries[index];
      const author = target.author || '';
      if (author && author !== 'Unknown' && author !== currentUser) {
        return new Response(JSON.stringify({ error: 'We can only remove quiet days we added' }), {
          status: 403,
          headers: { 'content-type': 'application/json' }
        });
      }

      entries.splice(index, 1);
      const newSha = await saveApart(
        env,
        entries,
        currentSha,
        `Remove quiet days: ${target.from} to ${target.until}`
      );

      return new Response(JSON.stringify({ ok: true, sha: newSha, entries }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    const input = body.entry;
    if (!input || typeof input !== 'object') {
      return new Response(JSON.stringify({ error: 'Quiet days are required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const from = input.from;
    const until = input.until;
    if (!isDate(from) || !isDate(until)) {
      return new Response(JSON.stringify({ error: 'Pick the first and last day' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (until < from) {
      return new Response(JSON.stringify({ error: 'The last day must be on or after the first' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const author = cleanText(input.author, 40);
    if (!APART_AUTHORS.includes(author)) {
      return new Response(JSON.stringify({ error: 'Quiet days must be added by Charlotte or Luke' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (entries.length >= MAX_ENTRIES) {
      return new Response(JSON.stringify({ error: 'That is a lot of quiet days — remove some first' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const overlaps = entries.some(entry => entry.from <= until && from <= entry.until);
    if (overlaps) {
      return new Response(JSON.stringify({ error: 'Those days are already marked as quiet days' }), {
        status: 409,
        headers: { 'content-type': 'application/json' }
      });
    }

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      from,
      until,
      note: cleanText(input.note, 300),
      author,
      createdAt: new Date().toISOString()
    };

    entries.push(entry);
    const newSha = await saveApart(
      env,
      entries,
      currentSha,
      `Quiet days for ${author}: ${from} to ${until}`
    );

    return new Response(JSON.stringify({ ok: true, sha: newSha, entry, entries }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
