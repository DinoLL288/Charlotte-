// Public, widget-sized summary of the mood + bathroom trackers.
//
// The site pages keep the full data behind the login, but a phone widget
// cannot sign in — so this endpoint returns only the latest mood per person
// and today's bathroom counts. No notes, no history, no private detail.
// Scriptable widgets (iPhone, iPad and Mac) fetch this with no login.
//
// Reads the same Durable Object the site pages use, through the
// QUESTION_ROOM binding (production only — branch previews do not have it,
// so this returns 503 there, just like /api/question-room does).

const PEOPLE = ['Charlotte', 'Luke'];

const MOOD_LABELS = {
  '🥰': 'Loved',
  '😊': 'Happy',
  '💛': 'Calm',
  '🌙': 'Tired',
  '🤔': 'Unsure',
  '😤': 'Stressed',
  '😔': 'Low',
  '😢': 'Sad',
  '😰': 'Anxious',
  '😠': 'Angry',
  '😞': 'Depressed',
  '😶': 'Numb',
  '😭': 'Overwhelmed'
};

// Same Perth day key the bathroom tracker uses.
function perthDayKey(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Perth',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value));
  const get = type => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Newest mood entry for one person, across all dates. Returns null when
// they have never logged one.
function latestMood(moods, person) {
  const byDate = (moods && moods[person]) || {};
  const dates = Object.keys(byDate).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    const entries = Array.isArray(byDate[dates[i]]) ? byDate[dates[i]] : [];
    const entry = entries[entries.length - 1];
    if (entry && entry.mood) {
      return {
        emoji: entry.mood,
        label: MOOD_LABELS[entry.mood] || '',
        intensity: Number(entry.intensity) || null,
        date: dates[i],
        time: entry.time || null
      };
    }
  }
  return null;
}

function bathroomSummary(bathroom, person, today) {
  const status = (bathroom.status && bathroom.status[person]) || {};
  const todayCounts = (bathroom.stats && bathroom.stats.daily && bathroom.stats.daily[today]) || {};
  // Events arrive newest-first, so the first match is the latest one.
  const last = (bathroom.events || []).find(event => event.user === person) || null;
  return {
    away: Boolean(status.active),
    startedAt: status.startedAt || null,
    returnedAt: status.returnedAt || null,
    today: Number(todayCounts[person]) || 0,
    lastAt: last ? last.at : null,
    lastAction: last ? last.action : null
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    }
  });
}

export async function onRequest(context) {
  const { env, request } = context;

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!env.QUESTION_ROOM) {
    return jsonResponse({ error: 'Trackers are not configured yet' }, 503);
  }

  const id = env.QUESTION_ROOM.idFromName('charlotte-question-night');
  const stub = env.QUESTION_ROOM.get(id);

  const [moodRes, bathroomRes] = await Promise.all([
    stub.fetch(new Request('https://internal/?view=mood&user=Luke')),
    stub.fetch(new Request('https://internal/?view=bathroom'))
  ]);

  if (!moodRes.ok || !bathroomRes.ok) {
    return jsonResponse({ error: 'Could not load trackers' }, 502);
  }

  const moodJson = await moodRes.json();
  const bathroomJson = await bathroomRes.json();
  const today = perthDayKey(new Date());

  const mood = {};
  const bathroom = {};
  for (const person of PEOPLE) {
    mood[person] = latestMood(moodJson.moods, person);
    bathroom[person] = bathroomSummary(bathroomJson, person, today);
  }

  return jsonResponse({ updatedAt: new Date().toISOString(), mood, bathroom });
}

// Exported for tests.
export { latestMood, bathroomSummary, perthDayKey };
