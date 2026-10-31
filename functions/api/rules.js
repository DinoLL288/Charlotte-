const FILE_PATH = 'rules/rules.json';
const SECTIONS = ['rules', 'boundaries'];
const LABELS = { rules: 'rule', boundaries: 'boundary' };
const MAX_LENGTH = 500;

function emptyRules() {
  return { rules: [], boundaries: [] };
}

function isUnknownAuthor(item) {
  return !item.author || item.author === 'Unknown';
}

async function getRules(env) {
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';
  if (!repo) return { ...emptyRules(), sha: null };

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'cf-pages-rules'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${FILE_PATH}?ref=${branch}`, { headers });
  if (res.status === 404) return { ...emptyRules(), sha: null };
  const json = await res.json();

  try {
    const content = atob((json.content || '').replace(/\n/g, ''));
    const data = JSON.parse(decodeURIComponent(escape(content)) || '{}');
    return { rules: data.rules || [], boundaries: data.boundaries || [], sha: json.sha };
  } catch {
    const content = atob((json.content || '').replace(/\n/g, ''));
    const data = JSON.parse(content || '{}');
    return { rules: data.rules || [], boundaries: data.boundaries || [], sha: json.sha };
  }
}

async function saveRules(env, data, sha, message) {
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  const branch = env.GITHUB_BRANCH || 'main';
  if (!repo || !token) throw new Error('Missing GITHUB_REPO or GITHUB_TOKEN');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'cf-pages-rules'
  };

  let currentSha = sha;
  if (!currentSha) {
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${FILE_PATH}?ref=${branch}`, { headers });
    if (getRes.status === 200) {
      const getJson = await getRes.json();
      currentSha = getJson.sha;
    }
  }

  const updatedContent = JSON.stringify(data, null, 2);
  const content = btoa(unescape(encodeURIComponent(updatedContent)));

  const body = {
    message: message || 'Update rules',
    content,
    branch
  };
  if (currentSha) body.sha = currentSha;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'GitHub API error');
  return json.content.sha;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export async function onRequestGet(context) {
  try {
    const result = await getRules(context.env);
    return jsonResponse(result);
  } catch (e) {
    return jsonResponse({ ...emptyRules(), error: e.message });
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { action, section, item, id, currentUser, sha } = body;

    if (!SECTIONS.includes(section)) {
      return jsonResponse({ error: 'Unknown section' }, 400);
    }

    const { rules, boundaries, sha: currentSha } = await getRules(env);
    const data = { rules, boundaries };

    if (action === 'delete') {
      const index = data[section].findIndex(entry => entry.id === id);
      if (index === -1) {
        return jsonResponse({ error: 'Item not found' }, 404);
      }

      const target = data[section][index];
      if (!isUnknownAuthor(target) && target.author !== currentUser) {
        return jsonResponse({ error: 'We can only delete items we added or items without a saved author' }, 403);
      }

      data[section].splice(index, 1);
      const newSha = await saveRules(env, data, sha || currentSha, `Delete ${LABELS[section]}`);
      return jsonResponse({ ok: true, sha: newSha, ...data });
    }

    const text = typeof item?.text === 'string' ? item.text.trim() : '';
    if (!text) {
      return jsonResponse({ error: 'Write something first' }, 400);
    }
    if (text.length > MAX_LENGTH) {
      return jsonResponse({ error: `Keep it under ${MAX_LENGTH} characters` }, 400);
    }

    const entry = {
      id: Date.now().toString() + '-' + Math.random().toString(36).slice(2),
      text,
      author: (item && item.author) || currentUser || 'Unknown',
      date: new Date().toLocaleString()
    };
    data[section].push(entry);

    const newSha = await saveRules(env, data, sha || currentSha, `Add ${LABELS[section]}: ${text.slice(0, 60)}`);
    return jsonResponse({ ok: true, sha: newSha, ...data });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}
