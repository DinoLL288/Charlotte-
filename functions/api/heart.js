const TYPES = new Set(['jar', 'letters', 'traditions', 'wishes', 'places', 'songs', 'checkins', 'quizzes', 'futureNotes', 'insideJokes', 'bingo', 'hunts', 'recipes', 'shelf', 'awards', 'projects']);
const LIMITS = { jar: 300, letters: 1500, traditions: 500, wishes: 500, places: 700, songs: 500, checkins: 700, quizzes: 700, futureNotes: 1500, insideJokes: 700, bingo: 150, hunts: 700, recipes: 1500, shelf: 700, awards: 500, projects: 1000 };

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

function decode(value) {
  const binary = atob((value || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function read(env) {
  const { GITHUB_REPO: repo, GITHUB_TOKEN: token, GITHUB_BRANCH = 'main' } = env;
  if (!repo) return { data: {}, sha: null };
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'charlotte-heart-pages' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/heart/heart.json?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (res.status === 404) return { data: {}, sha: null };
  if (!res.ok) throw new Error(`Could not load shared memories (${res.status})`);
  const file = await res.json();
  return { data: JSON.parse(decode(file.content)), sha: file.sha };
}

async function write(env, data, sha, message) {
  const { GITHUB_REPO: repo, GITHUB_TOKEN: token, GITHUB_BRANCH = 'main' } = env;
  if (!repo || !token) throw new Error('Shared saving is not configured yet');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'charlotte-heart-pages' };
  const body = { message, content: encode(JSON.stringify(data, null, 2)), branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/heart/heart.json`, { method: 'PUT', headers, body: JSON.stringify(body) });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || 'Could not save this yet');
  return result.content.sha;
}

function clean(value, limit) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }

export async function onRequestGet({ env, request }) {
  try {
    const { data, sha } = await read(env);
    const url = new URL(request.url);
    const visible = { ...data };
    delete visible.fridayQuestions;
    delete visible.questionSessions;
    delete visible.questionResponses;
    delete visible.questionSchedule;
    return response({ data: visible, sha });
  } catch (error) { return response({ error: error.message }, 500); }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const type = body.type;
    if (!TYPES.has(type)) return response({ error: 'Unknown keepsake type' }, 400);
    const { data, sha } = await read(env);
    const list = Array.isArray(data[type]) ? data[type] : [];
    if (body.action === 'guess' && type === 'quizzes') {
      const entry = list.find(item => item.id === body.id);
      const author = clean(body.author, 40);
      const guess = clean(body.guess, 300);
      if (!entry) return response({ error: 'Question not found' }, 404);
      if (!['Charlotte', 'Luke'].includes(author) || !guess) return response({ error: 'We need a guess before saving' }, 400);
      entry.guesses = entry.guesses || {};
      entry.guesses[author] = guess;
    } else if (body.action === 'delete') {
      const next = list.filter(entry => entry.id !== body.id);
      if (next.length === list.length) return response({ error: 'That keepsake is already gone' }, 404);
      data[type] = next;
    } else if (body.action === 'update' && ['wishes', 'bingo', 'hunts', 'projects'].includes(type)) {
      const entry = list.find(item => item.id === body.id);
      if (!entry) return response({ error: 'Item not found' }, 404);
      if (type === 'wishes' || type === 'bingo') entry.done = Boolean(body.done);
      if (type === 'hunts') entry.revealed = Math.min(entry.clues.length, Math.max(0, Number(body.revealed) || 0));
      if (type === 'projects') entry.progress = Math.min(100, Math.max(0, Number(body.progress) || 0));
    } else if (body.action === 'add') {
      if (list.length >= 500) return response({ error: 'This collection is full' }, 400);
      const fields = body.item && typeof body.item === 'object' ? body.item : {};
      const item = { id: crypto.randomUUID(), author: clean(fields.author, 40), createdAt: new Date().toISOString() };
      for (const key of ['title', 'body', 'occasion', 'rhythm', 'place', 'date', 'url', 'artist', 'feeling', 'question', 'answer', 'category', 'month']) item[key] = clean(fields[key], LIMITS[type] || 500);
      if (type === 'hunts') item.clues = Array.isArray(fields.clues) ? fields.clues.map(clue => clean(clue, 300)).filter(Boolean).slice(0, 20) : [];
      if (type === 'recipes') item.ingredients = clean(fields.ingredients, 1000);
      if (type === 'quizzes') item.guesses = {};
      if (item.date) {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? new Date(`${item.date}T00:00:00.000Z`) : null;
        if (!['traditions', 'futureNotes'].includes(type) || !date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== item.date) {
          return response({ error: 'Pick a valid date' }, 400);
        }
      }
      if (item.url) {
        try {
          const url = new URL(item.url);
          if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
        } catch { return response({ error: 'Use a valid web or map link' }, 400); }
      }
      if (type === 'jar' && !item.body) return response({ error: 'Write a little thing we love first' }, 400);
      if (type === 'letters' && (!item.occasion || !item.body)) return response({ error: 'Add an occasion and our letter' }, 400);
      if (type === 'traditions' && !item.title) return response({ error: 'Give our tradition a name' }, 400);
      if (type === 'wishes' && !item.title) return response({ error: 'Add something to our wish list' }, 400);
      if (type === 'places' && (!item.place || !item.body)) return response({ error: 'Add a place and a memory' }, 400);
      if (type === 'songs' && (!item.title || !item.artist)) return response({ error: 'Add the song and artist' }, 400);
      if (type === 'checkins' && !item.feeling) return response({ error: 'Choose how we are feeling' }, 400);
      if (type === 'quizzes' && (!item.question || !item.answer)) return response({ error: 'Add a question and its answer' }, 400);
      if (type === 'futureNotes' && (!item.date || !item.body)) return response({ error: 'Choose an opening date and write the note' }, 400);
      if (type === 'futureNotes' && item.date <= new Date().toISOString().slice(0, 10)) return response({ error: 'Choose a future date so the note stays tucked away' }, 400);
      if (type === 'wishes' && !['', 'at-home', 'out'].includes(item.category)) return response({ error: 'Choose a valid date idea category' }, 400);
      if (type === 'insideJokes' && (!item.title || !item.body)) return response({ error: 'Add the phrase and its story' }, 400);
      if (type === 'bingo' && !item.title) return response({ error: 'Write a bingo square first' }, 400);
      if (type === 'hunts' && (!item.title || item.clues.length < 2)) return response({ error: 'Add a hunt name and at least two clues' }, 400);
      if (type === 'hunts') item.revealed = 0;
      if (type === 'recipes' && (!item.title || !item.ingredients || !item.body)) return response({ error: 'Add a recipe name, ingredients, and steps' }, 400);
      if (type === 'shelf' && (!item.title || !item.category)) return response({ error: 'Add a title and choose a book or film' }, 400);
      if (type === 'awards' && (!item.title || !item.month || !/^\d{4}-\d{2}$/.test(item.month))) return response({ error: 'Add an award and a valid month' }, 400);
      if (type === 'projects' && (!item.title || !item.body)) return response({ error: 'Name the project and add a little description' }, 400);
      if (type === 'projects') item.progress = 0;
      if (type === 'wishes') item.done = false;
      list.unshift(item);
      data[type] = list;
    } else return response({ error: 'Unknown action' }, 400);

    const nextSha = await write(env, data, sha, `Update shared ${type}`);
    const visible = { ...data };
    delete visible.fridayQuestions;
    delete visible.questionSessions;
    delete visible.questionResponses;
    delete visible.questionSchedule;
    return response({ ok: true, data: visible, sha: nextSha });
  } catch (error) { return response({ error: error.message }, 500); }
}
