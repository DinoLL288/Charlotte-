// Mood widget for Übersicht (free Mac app — tracesof.net/uebersicht).
//
// Shows Charlotte & Luke's latest moods from the site, no sign-in needed.
// The widget reads the site's public tracker summary:
//   https://charlotte-3ts.pages.dev/api/trackers
//
// CLICK the widget to open the mood tracker on the site and log a mood.
//
// SETUP (Mac):
//   1. Install Übersicht (free) from https://tracesof.net/uebersicht/
//   2. Übersicht menu-bar icon → Open Widgets Folder.
//   3. Drop this whole "mood.widget" folder into that folder
//      (or download the zip from the site and unzip it there).
//   4. In Übersicht Preferences, set an interaction shortcut and allow
//      Accessibility when asked — clicks only reach the widget with it.
//   5. Hold the interaction shortcut and click the widget to open the
//      mood tracker.
//
// The widget refreshes from the site every 15 seconds.

import { run, css } from 'uebersicht';

const API_URL = 'https://charlotte-3ts.pages.dev/api/trackers';
const MOOD_PAGE = 'https://charlotte-3ts.pages.dev/mood.html';

export const refreshFrequency = 15000;

export const command = 'curl -s ' + API_URL;

export const initialState = { data: null, error: null };

export const updateState = (event, previousState) => {
  if (event.output) {
    try {
      const data = JSON.parse(event.output);
      return { data, error: null };
    } catch (e) {
      return { ...previousState, error: 'Could not read moods' };
    }
  }
  if (event.error) return { ...previousState, error: String(event.error) };
  return previousState;
};

export const className = `
  top: 230px;
  left: 20px;
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

export const render = (state) => {
  const { data, error } = state;
  const mood = (data && data.mood) || {};

  const openMoodPage = () => {
    run('open ' + MOOD_PAGE);
  };

  return (
    <div className={card} onClick={openMoodPage}>
      <div className={title}>💛 How we’re feeling</div>
      {data ? (
        <div>
          {personRow('Charlotte', mood.Charlotte)}
          {personRow('Luke', mood.Luke)}
        </div>
      ) : (
        <div className={detail}>{error || 'Loading moods…'}</div>
      )}
      <div className={hint}>Click to log a mood</div>
      {error && data ? <div className={err}>{error}</div> : null}
    </div>
  );
};
