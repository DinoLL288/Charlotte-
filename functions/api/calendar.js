export async function onRequestGet(context) {
  try {
    const { env } = context;
    const repo = env.GITHUB_REPO;
    const token = env.GITHUB_TOKEN;
    const branch = env.GITHUB_BRANCH || 'main';

    if (!repo) {
      return new Response(JSON.stringify({ events: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'cf-pages-calendar'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/calendar/events.json?ref=${branch}`, { headers });
    if (res.status === 404) {
      return new Response(JSON.stringify({ events: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    const json = await res.json();
    const content = atob(json.content.replace(/\n/g, ''));
    const data = JSON.parse(content || '{"events":{}}');
    
    return new Response(JSON.stringify({ events: data.events || {}, sha: json.sha }), {
      status:  200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ events: {}, error: e.message }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { date, event, sha } = await request.json();
    const repo = env.GITHUB_REPO;
    const token = env.GITHUB_TOKEN;
    const branch = env.GITHUB_BRANCH || 'main';

    if (!repo || !token) {
      return new Response(JSON.stringify({ error: 'Missing GITHUB_REPO or GITHUB_TOKEN' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'cf-pages-calendar'
    };

    let events = {};
    let currentSha = sha || null;
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/calendar/events.json?ref=${branch}`, { headers });
    if (getRes.status === 200) {
      const getJson = await getRes.json();
      currentSha = getJson.sha;
      try {
        const content = atob((getJson.content || '').replace(/\n/g, ''));
        const data = JSON.parse(decodeURIComponent(escape(content)) || '{"events":{}}');
        events = data.events || {};
      } catch {
        const content = atob((getJson.content || '').replace(/\n/g, ''));
        const data = JSON.parse(content || '{"events":{}}');
        events = data.events || {};
      }
    } else if (getRes.status === 404) {
      events = {};
      currentSha = null;
    }

    if (!events[date]) events[date] = [];
    events[date].push(event);
    const updatedContent = JSON.stringify({ events }, null, 2);
    const content = btoa(unescape(encodeURIComponent(updatedContent)));

    const body = {
      message: `Add calendar event for ${date}`,
      content: content,
      branch: branch
    };
    if (currentSha) body.sha = currentSha;

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/calendar/events.json`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });

    const json = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: json.message || 'GitHub API error' }), {
        status: res.status,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true, sha: json.content.sha }), {
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
