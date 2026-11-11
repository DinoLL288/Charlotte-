const TIMELINE_AUTHORS = ['Charlotte', 'Luke'];

async function getTimeline(env) {
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';
  if (!repo) return { moments: [], sha: null };

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'cf-pages-timeline'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/timeline/timeline.json?ref=${branch}`, { headers });
  if (res.status === 404) return { moments: [], sha: null };

  const json = await res.json();
  try {
    const content = atob((json.content || '').replace(/\n/g, ''));
    const data = JSON.parse(decodeURIComponent(escape(content)) || '{"moments":[]}');
    return { moments: data.moments || [], sha: json.sha };
  } catch {
    const content = atob((json.content || '').replace(/\n/g, ''));
    const data = JSON.parse(content || '{"moments":[]}');
    return { moments: data.moments || [], sha: json.sha };
  }
}

async function saveTimeline(env, moments, sha, message) {
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';
  if (!repo || !token) throw new Error('Missing GITHUB_REPO or GITHUB_TOKEN');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'cf-pages-timeline'
  };

  let currentSha = sha;
  if (!currentSha) {
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/timeline/timeline.json?ref=${branch}`, { headers });
    if (getRes.status === 200) {
      const getJson = await getRes.json();
      currentSha = getJson.sha;
    }
  }

  const updatedContent = JSON.stringify({ moments }, null, 2);
  const content = btoa(unescape(encodeURIComponent(updatedContent)));

  const body = {
    message: message || 'Update timeline',
    content: content,
    branch: branch
  };
  if (currentSha) body.sha = currentSha;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/timeline/timeline.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'GitHub API error');
  return json.content.sha;
}

export async function onRequestGet(context) {
  try {
    const result = await getTimeline(context.env);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=60, stale-while-revalidate=30' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ moments: [], error: e.message }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { env } = context;
    const { moments, sha: currentSha } = await getTimeline(env);

    if (body.action === 'delete') {
      const id = typeof body.id === 'string' ? body.id : '';
      const currentUser = typeof body.currentUser === 'string' ? body.currentUser : '';
      const index = moments.findIndex(moment => moment.id === id);

      if (index === -1) {
        return new Response(JSON.stringify({ error: 'Moment not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }

      const target = moments[index];
      const author = target.author || '';
      if (author && author !== 'Unknown' && author !== currentUser) {
        return new Response(JSON.stringify({ error: 'We can only delete moments we added' }), {
          status: 403,
          headers: { 'content-type': 'application/json' }
        });
      }

      moments.splice(index, 1);
      const newSha = await saveTimeline(env, moments, body.sha || currentSha, `Delete timeline moment: ${target.title || target.date || 'Untitled'}`);
      return new Response(JSON.stringify({ ok: true, sha: newSha }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    const input = body.moment;
    if (!input || typeof input !== 'object') {
      return new Response(JSON.stringify({ error: 'Moment is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const date = cleanText(input.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: 'Pick a date for this moment' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const title = cleanText(input.title, 120);
    const text = cleanText(input.body, 2000);
    const author = cleanText(input.author, 40);
    let photo = cleanText(input.photo, 600);
    if (photo && !/^(https:\/\/|\/)/.test(photo)) {
      photo = '';
    }

    if (!title && !text && !photo) {
      return new Response(JSON.stringify({ error: 'Add a photo, a title, or a few words' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (!TIMELINE_AUTHORS.includes(author)) {
      return new Response(JSON.stringify({ error: 'Moment author must be Charlotte or Luke' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const moment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      date,
      title,
      body: text,
      photo,
      author,
      createdAt: new Date().toISOString()
    };

    moments.push(moment);
    const newSha = await saveTimeline(
      env,
      moments,
      body.sha || currentSha,
      `Add timeline moment: ${title || date} by ${author}`
    );

    return new Response(JSON.stringify({ ok: true, sha: newSha, moment }), {
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
