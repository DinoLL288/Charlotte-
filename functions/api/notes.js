async function getNotes(env) {
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';
  if (!repo) return { notes: [], sha: null };

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'cf-pages-notes'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/notes/notes.json?ref=${branch}`, { headers });
  if (res.status === 404) return { notes: [], sha: null };
  const json = await res.json();
  try {
    const content = atob((json.content || '').replace(/\n/g, ''));
    const data = JSON.parse(decodeURIComponent(escape(content)) || '{"notes":[]}');
    return { notes: data.notes || [], sha: json.sha };
  } catch {
    const content = atob((json.content || '').replace(/\n/g, ''));
    const data = JSON.parse(content || '{"notes":[]}');
    return { notes: data.notes || [], sha: json.sha };
  }
}

async function saveNotes(env, notes, sha, message) {
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';
  if (!repo || !token) throw new Error('Missing GITHUB_REPO or GITHUB_TOKEN');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'cf-pages-notes'
  };

  let currentSha = sha;
  if (!currentSha) {
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/notes/notes.json?ref=${branch}`, { headers });
    if (getRes.status === 200) {
      const getJson = await getRes.json();
      currentSha = getJson.sha;
    }
  }

  const updatedContent = JSON.stringify({ notes }, null, 2);
  const content = btoa(unescape(encodeURIComponent(updatedContent)));

  const body = {
    message: message || 'Update notes',
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
  if (!res.ok) throw new Error(json.message || 'GitHub API error');
  return json.content.sha;
}

export async function onRequestGet(context) {
  try {
    const { env } = context;
    const result = await getNotes(env);
    return new Response(JSON.stringify(result), {
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

function isUnknownAuthor(note) {
  return !note.author || note.author === 'Unknown';
}

function findNoteIndex(notes, id, note) {
  if (id) {
    const byId = notes.findIndex(n => n.id === id);
    if (byId !== -1) return byId;
  }
  // Older notes may not have an id, so match on their contents instead.
  if (note) {
    return notes.findIndex(n =>
      n.title === note.title &&
      n.body === note.body &&
      n.date === note.date &&
      (n.author || '') === (note.author || '')
    );
  }
  return -1;
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    
    if (body.action === 'delete') {
      const { id, sha, currentUser, note } = body;
      const { notes, sha: currentSha } = await getNotes(env);
      const index = findNoteIndex(notes, id, note);
      if (index === -1) {
        return new Response(JSON.stringify({ error: 'Note not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }

      const target = notes[index];
      if (!isUnknownAuthor(target) && target.author !== currentUser) {
        return new Response(JSON.stringify({ error: 'You can only delete your own notes or notes from unknown authors' }), {
          status: 403,
          headers: { 'content-type': 'application/json' }
        });
      }

      notes.splice(index, 1);
      const newSha = await saveNotes(env, notes, sha || currentSha, `Delete note ${id || target.title || 'Untitled'}`);
      return new Response(JSON.stringify({ ok: true, sha: newSha }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    
    const { note, sha } = body;
    const { notes, sha: currentSha } = await getNotes(env);
    notes.push(note);
    const newSha = await saveNotes(env, notes, sha || currentSha, `Add note: ${note.title || 'Untitled'} by ${note.author}`);
    return new Response(JSON.stringify({ ok: true, sha: newSha }), {
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
