// Open when… — sealed letters for the moments Luke can't be right there.
// The letter text lives here so tests can check it without a DOM; the page
// (open-when.html) renders the envelopes and the letter view from this data.
// Opened state is per user in localStorage, so each of us sees our own
// opened letters.

export const OPEN_WHEN_LETTERS = [
  {
    id: 'miss-me',
    emoji: '💌',
    title: 'Open when you miss me',
    body: [
      'Hi, my favourite person.',
      'If you\u2019re reading this, you miss me \u2014 and I want you to know I miss you too. Probably right this second, wherever I am.',
      'So here\u2019s a hug in letter form: close your eyes, picture me next to you, and know I\u2019m thinking of you. It won\u2019t be long until we\u2019re together again.',
      'Until then \u2014 I\u2019m yours, always.',
    ],
  },
  {
    id: 'cant-sleep',
    emoji: '🌙',
    title: 'Open when you can\u2019t sleep',
    body: [
      'Hey, night owl. It\u2019s late, your brain won\u2019t switch off, and I\u2019m probably asleep \u2014 sorry about that.',
      'Try this: breathe in for four, out for six. Picture our favourite place. Count the good things about today, not the worries.',
      'And if you\u2019re still awake in ten minutes, that\u2019s okay too. I\u2019ll be here in the morning, and I\u2019ll make you laugh about it.',
    ],
  },
  {
    id: 'bad-day',
    emoji: '🌧️',
    title: 'Open when you\u2019re having a bad day',
    body: [
      'Bad days happen, even to the best people. Today was one of them, and I\u2019m sorry it was rough.',
      'You don\u2019t have to fix everything tonight. Drink something warm, put on something comfy, and let today be done.',
      'Tomorrow is a fresh start, and I\u2019ll be cheering you on \u2014 like always. You\u2019re stronger than today made you feel.',
    ],
  },
  {
    id: 'need-a-laugh',
    emoji: '😂',
    title: 'Open when you need a laugh',
    body: [
      'Emergency laugh, reporting for duty.',
      'Why did the scarecrow win an award? Because he was outstanding in his field.',
      'Okay, that one was terrible. But you smiled, didn\u2019t you? That\u2019s the whole job. Whenever you need another one, you know where to find me.',
    ],
  },
  {
    id: 'need-courage',
    emoji: '💪',
    title: 'Open when you need courage',
    body: [
      'You\u2019ve got this. Whatever is in front of you right now \u2014 the scary thing, the big step, the hard conversation \u2014 you can do it.',
      'Remember all the things you\u2019ve already done that once felt impossible? This is just the next one.',
      'I\u2019m so proud of you, and I\u2019ll be right here when you come out the other side.',
    ],
  },
  {
    id: 'amazing-day',
    emoji: '⭐',
    title: 'Open when something amazing happened',
    body: [
      'SOMETHING AMAZING HAPPENED AND I AM SO EXCITED FOR YOU.',
      'I wish I could have seen your face when it happened. Tell me everything \u2014 every little detail \u2014 when you get a chance.',
      'You deserve every good thing that comes your way. Now go celebrate. This one is yours.',
    ],
  },
  {
    id: 'far-apart',
    emoji: '🌏',
    title: 'Open when we feel far apart',
    body: [
      'Distance is rubbish, I know. It doesn\u2019t matter if it\u2019s a few streets or a whole ocean \u2014 missing you feels the same.',
      'But here\u2019s the thing: you\u2019re my favourite person whether you\u2019re next to me or not. The distance doesn\u2019t change that, not even a little.',
      'So until we\u2019re in the same place again \u2014 same sky, same us. Always.',
    ],
  },
  {
    id: 'special-day',
    emoji: '🎉',
    title: 'Open when it\u2019s a special day',
    body: [
      'Happy special day, my love. Birthday, anniversary, or just a day worth celebrating \u2014 I\u2019m glad it\u2019s today.',
      'Thank you for being you: for every laugh, every late-night chat, every little moment that added up to us.',
      'Here\u2019s to today, and to all the special days still coming. I love you.',
    ],
  },
];

export function storageKeyFor(user) {
  return 'open-when-opened:' + (user || 'guest');
}

// Opened letters: { [letterId]: ISO date string }. Tolerates missing or
// corrupt stored data by starting fresh.
export function loadOpened(storage, user) {
  try {
    var raw = storage.getItem(storageKeyFor(user));
    if (!raw) return {};
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    var out = {};
    Object.keys(parsed).forEach(function (id) {
      if (typeof parsed[id] === 'string') out[id] = parsed[id];
    });
    return out;
  } catch (e) {
    return {};
  }
}

export function saveOpened(storage, user, opened) {
  try {
    storage.setItem(storageKeyFor(user), JSON.stringify(opened || {}));
  } catch (e) {
    // Storage full or unavailable (private mode): opened marks are
    // best-effort and the letters still open fine.
  }
}

// Pure: returns a new opened map with `id` marked opened at `now`.
export function markOpened(opened, id, now) {
  var next = Object.assign({}, opened || {});
  next[id] = (now instanceof Date ? now : new Date()).toISOString();
  return next;
}

export function openedCount(opened) {
  return Object.keys(opened || {}).length;
}

// '2026-11-27T…' -> '27 Nov 2026' (en-AU, short). Falls back to the raw
// value when it cannot be parsed.
export function formatOpenedDate(iso) {
  var date = new Date(iso || '');
  if (isNaN(date.getTime())) return String(iso || '');
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
