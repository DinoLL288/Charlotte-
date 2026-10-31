export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const folder = url.searchParams.get('folder');
    const repo = env.GITHUB_REPO;
    const token = env.GITHUB_TOKEN;
    const branch = env.GITHUB_BRANCH || 'main';

    if (!repo) {
      return new Response(JSON.stringify({ photos: [], folders: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'cf-pages-gallery'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    if (folder) {
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/gallery/${folder}?ref=${branch}`, { headers });
      if (res.status === 404) {
        return new Response(JSON.stringify({ photos: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      const json = await res.json();
      if (!Array.isArray(json)) {
        return new Response(JSON.stringify({ photos: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      const photos = json
        .filter(f => f.type === 'file')
        .map(f => ({ name: f.name, url: f.download_url || f.html_url, path: f.path }))
        .sort((a, b) => b.name.localeCompare(a.name));

      return new Response(JSON.stringify({ photos }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    } else {
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/gallery?ref=${branch}`, { headers });
      if (res.status === 404) {
        return new Response(JSON.stringify({ photos: [], folders: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      const json = await res.json();
      if (!Array.isArray(json)) {
        return new Response(JSON.stringify({ photos: [], folders: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      const folders = json
        .filter(f => f.type === 'dir')
        .map(f => f.name)
        .sort();

      return new Response(JSON.stringify({ photos: [], folders }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ photos: [], folders: [], error: e.message }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
}
