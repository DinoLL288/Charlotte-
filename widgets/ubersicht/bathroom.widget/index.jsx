// Bathroom widget for Übersicht (free Mac app — tracesof.net/uebersicht).
//
// Shows who's away right now and today's bathroom counts for Charlotte
// & Luke, from the site's public tracker summary:
//   https://charlotte-3ts.pages.dev/api/trackers
//
// CLICK TO TOGGLE your own check-in: click once to step away, click again
// when you're back. The click sends the flip straight to the site — no
// browser, no login page — and the widget shows the new state right away.
// The page only lets you toggle your own check-in, so this widget is set
// up for Luke — for Charlotte's own widget, change 'Luke' to 'Charlotte'
// in USER below.
//
// SETUP (Mac):
//   1. Install Übersicht (free) from https://tracesof.net/uebersicht/
//   2. Übersicht menu-bar icon → Open Widgets Folder.
//   3. Drop this whole "bathroom.widget" folder into that folder
//      (or download the zip from the site and unzip it there).
//   4. In Übersicht Preferences, set an interaction shortcut and allow
//      Accessibility when asked — clicks only reach the widget with it.
//   5. Hold the interaction shortcut and click the widget to toggle.
//
// The widget refreshes from the site every 15 seconds.

import { run, css } from 'uebersicht';

const API_URL = 'https://charlotte-3ts.pages.dev/api/trackers';
const TOGGLE_API = 'https://charlotte-3ts.pages.dev/api/question-room';
// Change to 'Charlotte' for Charlotte's own widget.
const USER = 'Luke';

export const refreshFrequency = 15000;

export const command = 'curl -s ' + API_URL;

export const initialState = { data: null, error: null, optimisticAway: null, toggling: false };

export const updateState = (event, previousState) => {
  if (event.type === 'TOGGLING') return { ...previousState, toggling: true };
  if (event.type === 'TOGGLED') return { ...previousState, optimisticAway: event.away, toggling: false };
  if (event.type === 'TOGGLE_FAILED') return { ...previousState, toggling: false, error: 'Toggle failed — try again' };
  if (event.output) {
    try {
      const data = JSON.parse(event.output);
      return { data, error: null, optimisticAway: null, toggling: false };
    } catch (e) {
      return { ...previousState, error: 'Could not read check-ins' };
    }
  }
  if (event.error) return { ...previousState, error: String(event.error) };
  return previousState;
};

export const className = `
  top: 20px;
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

function minutesAway(startedAt) {
  if (!startedAt) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (mins < 1) return 'just stepped away';
  if (mins < 60) return 'away ' + mins + 'm';
  const hours = Math.floor(mins / 60);
  return 'away ' + hours + 'h ' + (mins % 60) + 'm';
}

function personRow(personName, info, awayOverride) {
  const away = awayOverride !== null && awayOverride !== undefined ? awayOverride : (info && info.away);
  const detailText = info
    ? (away ? minutesAway(info.startedAt) : 'Back') + ' · ' + info.today + ' today'
    : 'No check-ins yet';
  return (
    <div className={row} key={personName}>
      <span style={{ fontSize: '18px' }}>{away ? '🚻' : '✅'}</span>
      <div>
        <div className={name}>{personName}</div>
        <div className={detail}>{detailText}</div>
      </div>
    </div>
  );
}

export const render = (state, dispatch) => {
  const { data, error, optimisticAway, toggling } = state;
  const bathroom = (data && data.bathroom) || {};
  const me = bathroom[USER];
  const otherName = USER === 'Luke' ? 'Charlotte' : 'Luke';
  const other = bathroom[otherName];
  const myAway = optimisticAway !== null ? optimisticAway : (me && me.away);

  const toggle = () => {
    if (!me || toggling) return;
    const nextAway = !myAway;
    const body = JSON.stringify({ action: 'bathroom', user: USER, active: nextAway });
    dispatch({ type: 'TOGGLING' });
    run('curl -s -X POST ' + TOGGLE_API + " -H 'Content-Type: application/json' -d '" + body + "'")
      .then(() => dispatch({ type: 'TOGGLED', away: nextAway }))
      .catch(() => dispatch({ type: 'TOGGLE_FAILED' }));
  };

  return (
    <div className={card} onClick={toggle}>
      <div className={title}>🚻 Bathroom check-ins</div>
      {data ? (
        <div>
          {personRow('Charlotte', bathroom.Charlotte, USER === 'Charlotte' ? myAway : null)}
          {personRow('Luke', bathroom.Luke, USER === 'Luke' ? myAway : null)}
        </div>
      ) : (
        <div className={detail}>{error || 'Loading check-ins…'}</div>
      )}
      <div className={hint}>{toggling ? 'Flipping…' : 'Click to toggle your check-in'}</div>
      {error && data ? <div className={err}>{error}</div> : null}
    </div>
  );
};
