// Mood widget for Übersicht (free Mac app — tracesof.net/uebersicht).
//
// Shows Charlotte & Luke's latest moods from the site, no sign-in needed.
// The widget reads the site's public tracker summary:
//   https://charlotte-3ts.pages.dev/api/trackers
//
// TAP A MOOD to log it right from the widget: tapping an emoji logs that
// mood for you straight to the site — no browser, no login page — and the
// widget shows the new mood right away. Tap anywhere else on the card to
// open the mood tracker on the site (for intensity, notes and history).
// The page only lets you log your own mood, so this widget is set up for
// Luke — for Charlotte's own widget, change 'Luke' to 'Charlotte' in USER
// below.
//
// SETUP (Mac):
//   1. Install Übersicht (free) from https://tracesof.net/uebersicht/
//   2. Übersicht menu-bar icon → Open Widgets Folder.
//   3. Drop this whole "mood.widget" folder into that folder
//      (or download the zip from the site and unzip it there).
//   4. In Übersicht Preferences, set an interaction shortcut and allow
//      Accessibility when asked — clicks only reach the widget with it.
//   5. Hold the interaction shortcut and tap a mood to log it.
//
// The widget refreshes from the site every 15 seconds.

import { run, css } from 'uebersicht';

const API_URL = 'https://charlotte-3ts.pages.dev/api/trackers';
const MOOD_API = 'https://charlotte-3ts.pages.dev/api/question-room';
const MOOD_PAGE = 'https://charlotte-3ts.pages.dev/mood.html';
// Change to 'Charlotte' for Charlotte's own widget.
const USER = 'Luke';

// The 13 moods from the site's mood tracker (same emoji and labels).
const MOODS = [
  { emoji: '🥰', label: 'Loved' },
  { emoji: '😊', label: 'Happy' },
  { emoji: '💛', label: 'Calm' },
  { emoji: '🌙', label: 'Tired' },
  { emoji: '🤔', label: 'Unsure' },
  { emoji: '😤', label: 'Stressed' },
  { emoji: '😔', label: 'Low' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '😰', label: 'Anxious' },
  { emoji: '😠', label: 'Angry' },
  { emoji: '😞', label: 'Depressed' },
  { emoji: '😶', label: 'Numb' },
  { emoji: '😭', label: 'Overwhelmed' },
];

export const refreshFrequency = 15000;

export const command = 'curl -s ' + API_URL;

export const initialState = { data: null, error: null, justLogged: null, logging: false };

export const updateState = (event, previousState) => {
  if (event.type === 'LOGGING') return { ...previousState, logging: true };
  if (event.type === 'LOGGED') return { ...previousState, justLogged: event.mood, logging: false };
  if (event.type === 'LOG_FAILED') return { ...previousState, logging: false, error: 'Could not log that mood — try again' };
  if (event.output) {
    try {
      const data = JSON.parse(event.output);
      return { data, error: null, justLogged: null, logging: false };
    } catch (e) {
      return { ...previousState, error: 'Could not read moods' };
    }
  }
  if (event.error) return { ...previousState, error: String(event.error) };
  return previousState;
};

export const className = `
  top: 230px;
  left: 480px;
  width: 300px;
`;

const card = css`
  background: #0d2c44;
  border-radius: 16px;
  padding: 16px;
  color: #ffffff;
  font-family: -apple-system, 'Helvetica Neue', sans-serif;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
`;

const title = css`
  font-size: 14px;
  font-weight: bold;
  color: #f6d365;
  margin-bottom: 10px;
`;

const row = css`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
`;

const name = css`
  font-size: 14px;
  font-weight: bold;
`;

const detail = css`
  font-size: 12px;
  color: #9fc3d8;
`;

const pickerLabel = css`
  font-size: 11px;
  font-weight: bold;
  color: #f6d365;
  margin-top: 10px;
`;

const moodGrid = css`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-top: 8px;
`;

const moodBtn = css`
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 20px;
  line-height: 1;
  padding: 7px 0;
  cursor: pointer;
  text-align: center;
`;

const moodBtnActive = css`
  border: 1px solid #f6d365;
  border-radius: 10px;
  background: #fff4d8;
  font-size: 20px;
  line-height: 1;
  padding: 7px 0;
  cursor: pointer;
  text-align: center;
`;

const hint = css`
  font-size: 11px;
  color: #9fc3d8;
  margin-top: 8px;
`;

const err = css`
  font-size: 11px;
  color: #ff9a9a;
  margin-top: 8px;
`;

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

function personRow(personName, mood) {
  const detailText = mood
    ? mood.label + (mood.intensity ? ' · ' + mood.intensity + '/5' : '') + (mood.time ? ' · ' + timeAgo(mood.time) : '')
    : 'Not logged yet';
  return (
    <div className={row} key={personName}>
      <span style={{ fontSize: '18px' }}>{mood ? mood.emoji : '—'}</span>
      <div>
        <div className={name}>{personName}</div>
        <div className={detail}>{detailText}</div>
      </div>
    </div>
  );
}

export const render = (state, dispatch) => {
  const { data, error, justLogged, logging } = state;
  const mood = (data && data.mood) || {};

  const openMoodPage = () => {
    run('open ' + MOOD_PAGE);
  };

  const logMood = (emoji) => {
    if (logging) return;
    const body = JSON.stringify({ action: 'mood', user: USER, date: todayKey(), mood: emoji, intensity: 3, note: '' });
    dispatch({ type: 'LOGGING' });
    run('curl -s -X POST ' + MOOD_API + " -H 'Content-Type: application/json' -d '" + body + "'")
      .then(() => dispatch({ type: 'LOGGED', mood: emoji }))
      .catch(() => dispatch({ type: 'LOG_FAILED' }));
  };

  const labels = {};
  MOODS.forEach((m) => { labels[m.emoji] = m.label; });
  const lukeMood = justLogged
    ? { emoji: justLogged, label: labels[justLogged], intensity: 3, time: new Date().toISOString() }
    : mood.Luke;

  const hintText = logging
    ? 'Logging…'
    : (justLogged ? 'Logged ' + justLogged + ' — tap another to change it' : 'Tap a mood to log it · tap the card for the full tracker');

  return (
    <div className={card} onClick={openMoodPage}>
      <div className={title}>💛 How we’re feeling</div>
      {data ? (
        <div>
          {personRow('Charlotte', mood.Charlotte)}
          {personRow('Luke', lukeMood)}
        </div>
      ) : (
        <div className={detail}>{error || 'Loading moods…'}</div>
      )}
      <div className={pickerLabel}>Log your mood:</div>
      <div className={moodGrid}>
        {MOODS.map((m) => (
          <button
            key={m.emoji}
            className={justLogged === m.emoji ? moodBtnActive : moodBtn}
            onClick={(e) => { e.stopPropagation(); logMood(m.emoji); }}
          >
            {m.emoji}
          </button>
        ))}
      </div>
      <div className={hint}>{hintText}</div>
      {error && data ? <div className={err}>{error}</div> : null}
    </div>
  );
};
