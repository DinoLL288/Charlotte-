export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const user = url.searchParams.get('user');
    const repo = env.GITHUB_REPO;
    const token = env.GITHUB_TOKEN;
    const branch = env.GITHUB_BRANCH || 'main';

    if (!repo || !user) {
      return new Response(JSON.stringify({ url: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'cf-pages-profile'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Try common extensions in parallel
    const results = await Promise.all(['jpg', 'jpeg', 'png', 'webp', 'gif'].map(async ext => {
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/profiles/${user}.${ext}?ref=${branch}`, { headers });
      if (res.status !== 200) return null;
      const json = await res.json();
      return json?.download_url || null;
    }));
    const foundUrl = results.find(Boolean);
    if (foundUrl) return new Response(JSON.stringify({ url: foundUrl }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ url: null }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ url: null, error: e.message }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const formData = await request.formData();
    const file = formData.get('avatar');
    const user = formData.get('user');

    if (!file || typeof file === 'string' || !user) {
      return new Response(JSON.stringify({ error: 'Missing file or user' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const content = btoa(binary);

    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `profiles/${user}.${ext}`;

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
      'User-Agent': 'cf-pages-profile'
    };

    // Try to delete old extensions
    for (const oldExt of ['jpg', 'jpeg', 'png', 'webp', 'gif']) {
      if (oldExt === ext) continue;
      try {
        const getOld = await fetch(`https://api.github.com/repos/${repo}/contents/profiles/${user}.${oldExt}?ref=${branch}`, { headers });
        if (getOld.status === 200) {
          const oldJson = await getOld.json();
          await fetch(`https://api.github.com/repos/${repo}/contents/profiles/${user}.${oldExt}`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ message: `Remove old profile pic for ${user}`, sha: oldJson.sha, branch })
          });
        }
      } catch (e) {}
    }

    let sha = null;
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filename}?ref=${branch}`, { headers });
    if (getRes.status === 200) {
      const getJson = await getRes.json();
      sha = getJson.sha;
    }

    const body = {
      message: `Update profile picture for ${user}`,
      content: content,
      branch: branch
    };
    if (sha) body.sha = sha;

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filename}`, {
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

    return new Response(JSON.stringify({ ok: true, url: json.content?.download_url }), {
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
