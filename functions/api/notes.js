export async function onRequestGet(context) {
  try {
    const { env } = context;
    const repo = env.GITHUB_REPO;
    const token = env.GITHUB_TOKEN;
    const branch = env.GITHUB_BRANCH || 'main';

    if (!repo) {
      return new Response(JSON.stringify({ notes: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'cf-pages-notes'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/notes/notes.json?ref=${branch}`, { headers });
    if (res.status === 404) {
      return new Response(JSON.stringify({ notes: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    const json = await res.json();
    const content = atob(json.content.replace(/\n/g, ''));
    const data = JSON.parse(content || '{"notes":[]}');
    
    return new Response(JSON.stringify({ notes: data.notes || [], sha: json.sha }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ notes: [], error: e.message }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { note, sha } = await request.json();
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
      'User-Agent': 'cf-pages-notes'
    };

    // Get current notes
    let notes = [];
    let currentSha = sha;
    if (!currentSha) {
      const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/notes/notes.json?ref=${branch}`, { headers });
      if (getRes.status === 200) {
        const getJson = await getRes.json();
        currentSha = getJson.sha;
        const content = atob(getJson.content.replace(/\n/g, ''));
        notes = JSON.parse(content || '{"notes":[]}').notes || [];
      }
    } else {
      const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/notes/notes.json?ref=${branch}`, { headers });
      if (getRes.status === 200) {
        const getJson = await getRes.json();
        currentSha = getJson.sha;
        const content = atob(getJson.content.replace(/\n/g, ''));
        notes = JSON.parse(content || '{"notes":[]}').notes || [];
      }
    }

    notes.push(note);
    const updatedContent = JSON.stringify({ notes }, null, 2);
    const content = btoa(unescape(encodeURIComponent(updatedContent)));

    const body = {
      message: `Add note: ${note.title || 'Untitled'}`,
      content: content,
      branch: branch
    };
    if (currentSha) body.sha = currentSha;

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/notes/notes.json`, {
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
