// Hide-toggle widget for Übersicht (free Mac app — tracesof.net/uebersicht).
//
// A little button that lives at the bottom-left of the desktop. Tap it and
// the bathroom and mood widgets vanish (handy when presenting to a class);
// tap it again and they come back. It works by writing or removing a small
// flag file in your home folder — the bathroom and mood widgets check that
// file every few seconds and hide themselves while it is there. Nothing is
// deleted and no check-ins or moods are touched; they are only hidden.
//
// SETUP (Mac):
//   1. Install Übersicht (free) from https://tracesof.net/uebersicht/
//   2. Übersicht menu-bar icon → Open Widgets Folder.
//   3. Drop this whole "hide-toggle.widget" folder into that folder
//      (or download the zip from the site and unzip it there).
//   4. In Übersicht Preferences, set an interaction shortcut and allow
//      Accessibility when asked — clicks only reach the widget with it.
//   5. Hold the interaction shortcut and tap the button to hide or show
//      the bathroom and mood widgets.
//
// The widget checks the flag every 5 seconds, so the other widgets vanish
// or reappear within a few seconds of tapping it.

import { run, css } from 'uebersicht';

// A hidden flag file in the home folder. While it exists, the bathroom and
// mood widgets hide themselves.
const FLAG = '$HOME/.charlotte-widgets-hidden';

export const refreshFrequency = 5000;

export const command = 'test -f ' + FLAG + ' && echo HIDDEN || echo SHOWN';

export const initialState = { hidden: false, error: null, flipping: false };

export const updateState = (event, previousState) => {
  if (event.type === 'FLIPPING') return { ...previousState, flipping: true };
  if (event.type === 'FLIPPED') return { ...previousState, hidden: event.hidden, flipping: false };
  if (event.type === 'FLIP_FAILED') return { ...previousState, flipping: false, error: 'Could not flip — try again' };
  if (event.output) {
    const hidden = event.output.trim() === 'HIDDEN';
    return { ...previousState, hidden, flipping: false, error: null };
  }
  if (event.error) return { ...previousState, error: String(event.error) };
  return previousState;
};

export const className = `
  bottom: 100px;
  left: 20px;
  width: 180px;
`;

const pill = css`
  background: #0d2c44;
  border-radius: 999px;
  padding: 10px 14px;
  color: #ffffff;
  font-family: -apple-system, 'Helvetica Neue', sans-serif;
  font-size: 13px;
  font-weight: bold;
  text-align: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
`;

const hint = css`
  font-size: 11px;
  color: #ff9a9a;
  margin-top: 6px;
  text-align: center;
`;

export const render = (state, dispatch) => {
  const { hidden, error, flipping } = state;

  const flip = () => {
    if (flipping) return;
    dispatch({ type: 'FLIPPING' });
    run('test -f ' + FLAG + ' && rm ' + FLAG + ' || touch ' + FLAG)
      .then(() => dispatch({ type: 'FLIPPED', hidden: !hidden }))
      .catch(() => dispatch({ type: 'FLIP_FAILED' }));
  };

  return (
    <div>
      <div className={pill} onClick={flip}>
        {flipping ? '…' : (hidden ? '👁️ Show trackers' : '🙈 Hide trackers')}
      </div>
      {error ? <div className={hint}>{error}</div> : null}
    </div>
  );
};
