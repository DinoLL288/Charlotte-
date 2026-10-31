export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const formData = await request.formData();
    const file = formData.get('photo');
    const uploadedBy = formData.get('uploadedBy') || 'Unknown';
    const folder = (formData.get('folder') || 'General').replace(/[^a-zA-Z0-9-_ ]/g, '');

    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), {
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
    const filename = `gallery/${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    
    const repo = env.GITHUB_REPO;
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
        message: `Upload gallery photo by ${uploadedBy} to ${folder}: ${filename}`,
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
    
    // Update metadata
    try {
      const metaPath = 'gallery/metadata.json';
      const metaHeaders = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'cf-pages-upload'
      };
      let metadata = {};
      let metaSha = null;
      const metaRes = await fetch(`https://api.github.com/repos/${repo}/contents/${metaPath}?ref=${branch}`, { headers: metaHeaders });
      if (metaRes.status === 200) {
        const metaJson = await metaRes.json();
        metaSha = metaJson.sha;
        try {
          const metaContent = atob((metaJson.content || '').replace(/\n/g, ''));
          metadata = JSON.parse(decodeURIComponent(escape(metaContent)) || '{}');
        } catch {
          const metaContent = atob((metaJson.content || '').replace(/\n/g, ''));
          metadata = JSON.parse(metaContent || '{}');
        }
      }
      metadata[filename] = { uploadedBy, uploadedAt: new Date().toISOString() };
      const updatedMetaContent = JSON.stringify(metadata, null, 2);
      const metaContentEncoded = btoa(unescape(encodeURIComponent(updatedMetaContent)));
      const metaBody = {
        message: `Update gallery metadata for ${filename.split('/').pop()}`,
        content: metaContentEncoded,
        branch: branch
      };
      if (metaSha) metaBody.sha = metaSha;
      await fetch(`https://api.github.com/repos/${repo}/contents/${metaPath}`, {
        method: 'PUT',
        headers: metaHeaders,
        body: JSON.stringify(metaBody)
      });
    } catch (e) {
      // ignore metadata errors
    }
    
    return new Response(JSON.stringify({ ok: true, url, path: filename, uploadedBy }), {
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
