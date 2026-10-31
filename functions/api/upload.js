export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const formData = await request.formData();
    const file = formData.get('photo');

    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    // Convert to base64
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const content = btoa(binary);

    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `gallery/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    
    const repo = env.GITHUB_REPO; // e.g. "username/repo"
    const token = env.GITHUB_TOKEN;
    const branch = env.GITHUB_BRANCH || 'main';

    if (!repo || !token) {
      return new Response(JSON.stringify({ error: 'Missing GITHUB_REPO or GITHUB_TOKEN' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filename}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'cf-pages-upload'
      },
      body: JSON.stringify({
        message: `Upload gallery photo ${filename}`,
        content: content,
        branch: branch
      })
    });

    const json = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: json.message || 'GitHub API error' }), {
        status: res.status,
        headers: { 'content-type': 'application/json' }
      });
    }

    const url = json.content?.download_url || `/${filename}`;
    return new Response(JSON.stringify({ ok: true, url, path: filename }), {
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
