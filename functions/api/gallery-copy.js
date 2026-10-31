export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const repo = env.GITHUB_REPO;
    const token = env.GITHUB_TOKEN;
    const branch = env.GITHUB_BRANCH || 'main';
    
    if (!repo || !token) {
      return new Response(JSON.stringify({ error: 'Missing GitHub config' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
    
    const body = await request.json();
    const { sourcePath, targetFolder, uploadedBy } = body;
    
    if (!sourcePath || !targetFolder) {
      return new Response(JSON.stringify({ error: 'Missing sourcePath or targetFolder' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'cf-pages-copy'
    };
    
    // Get source file
    const sourceRes = await fetch(`https://api.github.com/repos/${repo}/contents/${sourcePath}?ref=${branch}`, { headers });
    if (sourceRes.status !== 200) {
      return new Response(JSON.stringify({ error: 'Source file not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }
    const sourceJson = await sourceRes.json();
    
    // Determine target path
    const filename = sourcePath.split('/').pop();
    let targetPath;
    if (targetFolder === 'root' || targetFolder === 'Old Photos') {
      targetPath = `gallery/${filename}`;
    } else {
      targetPath = `gallery/${targetFolder}/${filename}`;
    }
    
    // Copy file
    const copyBody = {
      message: `Copy ${filename} to ${targetFolder}`,
      content: sourceJson.content,
      branch: branch
    };
    const copyRes = await fetch(`https://api.github.com/repos/${repo}/contents/${targetPath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(copyBody)
    });
    
    if (!copyRes.ok) {
      const err = await copyRes.text();
      return new Response(JSON.stringify({ error: 'Failed to copy', details: err }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
    
    // Copy metadata if exists
    try {
      const metaPath = 'gallery/metadata.json';
      let metadata = {};
      let metaSha = null;
      const metaRes = await fetch(`https://api.github.com/repos/${repo}/contents/${metaPath}?ref=${branch}`, { headers });
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
      metadata[targetPath] = { uploadedBy: uploadedBy || metadata[sourcePath]?.uploadedBy || 'Unknown', copiedAt: new Date().toISOString(), copiedFrom: sourcePath };
      const updatedMetaContent = JSON.stringify(metadata, null, 2);
      const metaContentEncoded = btoa(unescape(encodeURIComponent(updatedMetaContent)));
      const metaBody = {
        message: `Update metadata for copied ${filename}`,
        content: metaContentEncoded,
        branch: branch
      };
      if (metaSha) metaBody.sha = metaSha;
      await fetch(`https://api.github.com/repos/${repo}/contents/${metaPath}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(metaBody)
      });
    } catch (e) {
      // ignore
    }
    
    return new Response(JSON.stringify({ ok: true, targetPath }), {
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
