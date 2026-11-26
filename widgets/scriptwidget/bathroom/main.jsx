// Bathroom widget for ScriptWidget (free app, Mac — ScriptWidget Studio).
//
// Shows who's away right now and today's bathroom counts for Charlotte
// & Luke, from the site's public tracker summary:
//   https://charlotte-3ts.pages.dev/api/trackers
//
// SETUP (Mac):
//   1. Open ScriptWidget Studio and choose Blank Widget. Name it "Bathroom".
//   2. Replace the contents of main.jsx with this whole file.
//   3. Replace the contents of widget.json with the widget.json next to
//      this file. It declares the network permission and the site's host,
//      which the fetch below needs.
//   4. Press Command-R to preview, Command-S to save.
//   5. Add the widget from the system widget gallery and pick the
//      "Bathroom" widget.
//
// TAPPING THE WIDGET toggles your own check-in: tap once to step away,
// tap again when you're back. It opens bathroom check-ins on the site,
// which flips your status and shows the result. The page only lets the
// logged-in user toggle their own check-in, so this widget is set up for
// Luke — for Charlotte's own widget, change 'Luke' to 'Charlotte' in
// TOGGLE_URL below.
//
// Widgets refresh on the system's own schedule — for the very latest
// status, tap the widget to open the site.

const API_URL = 'https://charlotte-3ts.pages.dev/api/trackers';
const BATHROOM_PAGE = 'https://charlotte-3ts.pages.dev/bathroom.html';
const TOGGLE_URL = BATHROOM_PAGE + '?toggle=Luke';

const NAVY = '#0d2c44';
const GOLD = '#f6d365';
const MUTED = '#9fc3d8';
const WHITE = '#ffffff';

function minutesAway(startedAt) {
  if (!startedAt) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (mins < 1) return 'just stepped away';
  if (mins < 60) return 'away ' + mins + 'm';
  const hours = Math.floor(mins / 60);
  return 'away ' + hours + 'h ' + (mins % 60) + 'm';
}

function personRow(name, info) {
  const detail = info
    ? (info.away ? minutesAway(info.startedAt) : 'Back') + ' · ' + info.today + ' today'
    : 'No check-ins yet';
  return (
    <hstack spacing="8" alignment="center">
      <text font="title2">{info && info.away ? '🚻' : '✅'}</text>
      <vstack spacing="1" alignment="leading">
        <text font="subheadline" fontWeight="bold" color={WHITE}>{name}</text>
        <text font="footnote" color={MUTED}>{detail}</text>
      </vstack>
      <spacer />
    </hstack>
  );
}

const family = $getenv('widget-size');

let content;
try {
  // fetch returns the response body as a string.
  const data = JSON.parse(await fetch(API_URL));
  content = (
    <vstack frame="max" alignment="leading" spacing="8" padding="16" background={NAVY} linkurl={TOGGLE_URL}>
      <text font="subheadline" fontWeight="bold" color={GOLD}>🚻 Bathroom check-ins</text>
      {personRow('Charlotte', data.bathroom && data.bathroom.Charlotte)}
      {personRow('Luke', data.bathroom && data.bathroom.Luke)}
      <spacer />
      {family === 'small' ? null : <text font="caption2" color={MUTED}>Tap to toggle your check-in</text>}
    </vstack>
  );
} catch (e) {
  content = (
    <vstack frame="max" alignment="leading" spacing="8" padding="16" background={NAVY} linkurl={TOGGLE_URL}>
      <text font="subheadline" fontWeight="bold" color={GOLD}>🚻 Bathroom check-ins</text>
      <text font="subheadline" fontWeight="bold" color={WHITE}>Couldn't load check-ins</text>
      <text font="footnote" color={MUTED}>Tap to toggle your check-in</text>
      <spacer />
      {family === 'small' ? null : <text font="caption2" color={MUTED}>Tap to toggle your check-in</text>}
    </vstack>
  );
}

$render(content);
