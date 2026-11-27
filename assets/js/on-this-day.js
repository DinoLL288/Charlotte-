// On this day — a look back at real memories from past years.
// Pure helpers are exported so tests can check the picker without a DOM.
// The card only ever shows entries that actually exist: moods from
// /api/question-room?view=mood and photos from /api/gallery. It never
// invents a memory. When nothing exists for this date in a past year,
// it falls back to the most recent past memory, labelled honestly.

export const MOOD_LABELS = {
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

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateKeyOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(key) {
  const parts = String(key || '').split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Normalise the mood store into { person: { dateKey: [entry] } }.
// Accepts the per-user shape the question room returns, and the old
// flat date -> mood shape (treated as the current user's).
export function normalizeMoods(raw, user) {
  if (!raw || typeof raw !== 'object') return {};
  const cleanEntry = value => {
    if (!value) return null;
    if (typeof value === 'string') return { mood: value, intensity: 3, note: '', time: '' };
    if (!value.mood) return null;
    return {
      mood: value.mood,
      intensity: Number(value.intensity) || 3,
      note: String(value.note || ''),
      time: value.time || '',
      id: value.id || ''
    };
  };
  const cleanDay = value => {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return list.map(cleanEntry).filter(Boolean);
  };
  if (raw.Charlotte || raw.Luke) {
    const out = {};
    for (const person of ['Charlotte', 'Luke']) {
      const src = raw[person] || {};
      out[person] = {};
      for (const dateKey of Object.keys(src)) {
        const entries = cleanDay(src[dateKey]);
        if (entries.length) out[person][dateKey] = entries;
      }
    }
    return out;
  }
  const out = {};
  out[user || 'Unknown'] = {};
  for (const dateKey of Object.keys(raw)) {
    const entries = cleanDay(raw[dateKey]);
    if (entries.length) out[user || 'Unknown'][dateKey] = entries;
  }
  return out;
}

// Honest, human label for when a past date was, relative to today.
// Same month-day in a past year: "a year ago today" / "2 years ago today".
// Anything else: "yesterday", "3 days ago", "last week", "2 months ago",
// "last year", or a plain date when it is very old.
export function describeWhen(date, today) {
  const now = today instanceof Date ? today : new Date();
  const day = startOfDay(date);
  const ref = startOfDay(now);
  if (day.getTime() === ref.getTime()) return 'today';
  if (day.getMonth() === ref.getMonth() && day.getDate() === ref.getDate() && day.getFullYear() < ref.getFullYear()) {
    const years = ref.getFullYear() - day.getFullYear();
    return years === 1 ? 'a year ago today' : `${years} years ago today`;
  }
  const diffDays = Math.round((ref.getTime() - day.getTime()) / 86400000);
  if (diffDays === 1) return 'yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  if (diffDays >= 7 && diffDays < 14) return 'last week';
  if (diffDays >= 14 && diffDays < 60) return `${Math.round(diffDays / 7)} weeks ago`;
  if (diffDays >= 60 && diffDays < 365) {
    const months = Math.round(diffDays / 30);
    return months <= 1 ? 'last month' : `${months} months ago`;
  }
  const years = Math.floor(diffDays / 365);
  if (years === 1) return 'last year';
  if (years > 1 && years < 3) return `${years} years ago`;
  return `on ${day.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][day.getMonth()]} ${day.getFullYear()}`;
}

// Collect every mood entry as { person, date, dateKey, entry }, newest first.
function allMoodEntries(moods) {
  const out = [];
  for (const person of Object.keys(moods || {})) {
    const byDate = moods[person] || {};
    for (const dateKey of Object.keys(byDate)) {
      const date = parseDateKey(dateKey);
      if (!date) continue;
      for (const entry of byDate[dateKey] || []) {
        if (entry && entry.mood) out.push({ person, date, dateKey, entry });
      }
    }
  }
  out.sort((a, b) => b.date.getTime() - a.date.getTime());
  return out;
}

// Collect every usable photo as { date, url, name, uploadedBy }, newest first.
// A photo needs a real uploaded date and a URL to be shown.
function allPhotos(photos) {
  const out = [];
  for (const photo of Array.isArray(photos) ? photos : []) {
    if (!photo || typeof photo !== 'object') continue;
    const url = photo.url || photo.fullUrl || '';
    const date = photo.uploadedAt ? new Date(photo.uploadedAt) : null;
    if (!url || !date || Number.isNaN(date.getTime())) continue;
    out.push({ date, url, name: photo.name || '', uploadedBy: photo.uploadedBy || '' });
  }
  out.sort((a, b) => b.date.getTime() - a.date.getTime());
  return out;
}

// Pick the memory for the hub card.
// Same-day first: moods and photos from this month-day in a past year
// (most recent such year wins). Otherwise the most recent past mood
// and the most recent past photo, each labelled with its own date.
// Returns { kind: 'same-day' | 'recent' | 'none', heading, moods, photo }.
// moods: [{ person, emoji, label, note, when }], photo: { url, name, uploadedBy, when } | null.
export function pickOnThisDay(input) {
  const { today, moods, photos } = input || {};
  const now = today instanceof Date ? today : new Date();
  const ref = startOfDay(now);
  const monthDay = `${pad(ref.getMonth() + 1)}-${pad(ref.getDate())}`;

  const moodList = allMoodEntries(normalizeMoods(moods, 'Unknown'))
    .filter(item => item.date.getTime() < ref.getTime());
  const photoList = allPhotos(photos)
    .filter(item => startOfDay(item.date).getTime() < ref.getTime());

  const sameDayMoods = moodList.filter(item => item.dateKey.slice(5) === monthDay);
  const sameDayPhotos = photoList.filter(item => dateKeyOf(item.date).slice(5) === monthDay);

  if (sameDayMoods.length || sameDayPhotos.length) {
    const chosenDate = sameDayMoods.length ? sameDayMoods[0].date : sameDayPhotos[0].date;
    const heading = describeWhen(chosenDate, now);
    // One mood per person for that date — the latest each of them logged.
    const byPerson = new Map();
    for (const item of sameDayMoods) {
      if (item.date.getTime() !== chosenDate.getTime()) continue;
      if (!byPerson.has(item.person)) {
        byPerson.set(item.person, {
          person: item.person,
          emoji: item.entry.mood,
          label: MOOD_LABELS[item.entry.mood] || '',
          note: item.entry.note || '',
          when: heading
        });
      }
    }
    const photo = sameDayPhotos.length
      ? {
          url: sameDayPhotos[0].url,
          name: sameDayPhotos[0].name,
          uploadedBy: sameDayPhotos[0].uploadedBy,
          when: describeWhen(sameDayPhotos[0].date, now)
        }
      : null;
    return { kind: 'same-day', heading, moods: [...byPerson.values()], photo };
  }

  if (!moodList.length && !photoList.length) {
    return { kind: 'none', heading: '', moods: [], photo: null };
  }

  const recentMoods = [];
  if (moodList.length) {
    const latestDate = moodList[0].date;
    const seen = new Set();
    for (const item of moodList) {
      if (item.date.getTime() !== latestDate.getTime()) break;
      if (seen.has(item.person)) continue;
      seen.add(item.person);
      recentMoods.push({
        person: item.person,
        emoji: item.entry.mood,
        label: MOOD_LABELS[item.entry.mood] || '',
        note: item.entry.note || '',
        when: describeWhen(item.date, now)
      });
    }
  }
  const photo = photoList.length
    ? {
        url: photoList[0].url,
        name: photoList[0].name,
        uploadedBy: photoList[0].uploadedBy,
        when: describeWhen(photoList[0].date, now)
      }
    : null;
  return { kind: 'recent', heading: 'A look back', moods: recentMoods, photo };
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Hub card wiring. Runs only when the card exists on the page.
// Fetches moods and photos in parallel; on any failure it shows the
// honest empty state instead of breaking the hub.
export function initOnThisDayCard() {
  const card = document.getElementById('onThisDayCard');
  if (!card) return;
  const body = document.getElementById('onThisDayBody');
  if (!body) return;
  const user = localStorage.getItem('charlotte-user') || 'Unknown';

  const render = picked => {
    if (!picked || picked.kind === 'none') {
      body.innerHTML = '<span style="color:#6a8292">Nothing from past years yet — as we log moods and add photos, they&rsquo;ll show up here.</span>';
      return;
    }
    const parts = [];
    if (picked.kind === 'same-day') {
      parts.push(`<div style="font-weight:700;margin-bottom:6px">${escapeHtml(picked.heading[0].toUpperCase() + picked.heading.slice(1))}</div>`);
    } else {
      parts.push('<div style="font-weight:700;margin-bottom:6px">A look back</div>');
    }
    for (const mood of picked.moods) {
      const when = picked.kind === 'same-day' ? '' : ` <span style="color:#6a8292">· from ${escapeHtml(mood.when)}</span>`;
      const note = mood.note ? ` — &ldquo;${escapeHtml(mood.note)}&rdquo;` : '';
      parts.push(`<div style="margin-bottom:6px">${escapeHtml(mood.person)} felt ${escapeHtml(mood.emoji)} ${escapeHtml(mood.label)}${note}${when}</div>`);
    }
    if (picked.photo) {
      const when = picked.kind === 'same-day' ? '' : ` <span style="color:#6a8292">· from ${escapeHtml(picked.photo.when)}</span>`;
      const by = picked.photo.uploadedBy ? ` <span style="color:#6a8292">· ${escapeHtml(picked.photo.uploadedBy)}</span>` : '';
      parts.push(`<a href="gallery.html" style="display:flex;gap:10px;align-items:center;text-decoration:none;color:inherit;margin-top:8px"><img src="${escapeHtml(picked.photo.url)}" alt="${escapeHtml(picked.photo.name || 'A photo from our gallery')}" style="width:72px;height:72px;object-fit:cover;border-radius:10px;flex:none"><span>${escapeHtml(picked.photo.name || 'A photo from our gallery')}${when}${by}</span></a>`);
    }
    body.innerHTML = parts.join('');
  };

  Promise.all([
    fetch('/api/question-room?view=mood&user=' + encodeURIComponent(user), { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/gallery', { cache: 'no-store', credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null)).catch(() => null)
  ]).then(([moodJson, galleryJson]) => {
    const moods = (moodJson && (moodJson.entries || moodJson.moods)) || {};
    const photos = (galleryJson && galleryJson.photos) || [];
    render(pickOnThisDay({ today: new Date(), moods, photos }));
  }).catch(() => {
    render({ kind: 'none', heading: '', moods: [], photo: null });
  });
}

if (typeof document !== 'undefined') {
  initOnThisDayCard();
}
