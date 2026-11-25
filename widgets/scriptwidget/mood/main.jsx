// Mood widget for ScriptWidget (free app, Mac — ScriptWidget Studio).
//
// Shows Charlotte & Luke's latest moods from the site, no sign-in needed.
// The widget reads the site's public tracker summary:
//   https://charlotte-3ts.pages.dev/api/trackers
//
// SETUP (Mac):
//   1. Open ScriptWidget Studio and choose Blank Widget. Name it "Mood".
//   2. Replace the contents of main.jsx with this whole file.
//   3. Replace the contents of widget.json with the widget.json next to
//      this file. It declares the network permission and the site's host,
//      which the fetch below needs.
//   4. Press Command-R to preview, Command-S to save.
//   5. Add the widget from the system widget gallery and pick the "Mood"
//      widget. Tap it any time to open the mood tracker on the site.
//
// Widgets refresh on the system's own schedule — for the very latest mood,
// tap the widget to open the site.

const API_URL = 'https://charlotte-3ts.pages.dev/api/trackers';
const MOOD_PAGE = 'https://charlotte-3ts.pages.dev/mood.html';

const NAVY = '#0d2c44';
const GOLD = '#f6d365';
const MUTED = '#9fc3d8';
const WHITE = '#ffffff';

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

function personRow(name, mood) {
  const detail = mood
    ? mood.label + (mood.intensity ? ' · ' + mood.intensity + '/5' : '')
    : 'Not logged yet';
  return (
    <hstack spacing="8" alignment="center">
      <text font="title2">{mood ? mood.emoji : '—'}</text>
      <vstack spacing="1" alignment="leading">
        <text font="subheadline" fontWeight="bold" color={WHITE}>{name}</text>
        <text font="footnote" color={MUTED}>{detail}</text>
      </vstack>
      <spacer />
      {mood && mood.time ? <text font="footnote" color={MUTED}>{timeAgo(mood.time)}</text> : null}
    </hstack>
  );
}

const family = $getenv('widget-size');

let content;
try {
  // fetch returns the response body as a string.
  const data = JSON.parse(await fetch(API_URL));
  content = (
    <vstack frame="max" alignment="leading" spacing="8" padding="16" background={NAVY} linkurl={MOOD_PAGE}>
      <text font="subheadline" fontWeight="bold" color={GOLD}>💛 How we’re feeling</text>
      {personRow('Charlotte', data.mood && data.mood.Charlotte)}
      {personRow('Luke', data.mood && data.mood.Luke)}
      <spacer />
      {family === 'small' ? null : <text font="caption2" color={MUTED}>Tap to log a mood</text>}
    </vstack>
  );
} catch (e) {
  content = (
    <vstack frame="max" alignment="leading" spacing="8" padding="16" background={NAVY} linkurl={MOOD_PAGE}>
      <text font="subheadline" fontWeight="bold" color={GOLD}>💛 How we’re feeling</text>
      <text font="subheadline" fontWeight="bold" color={WHITE}>Couldn't load moods</text>
      <text font="footnote" color={MUTED}>Tap to open the mood tracker</text>
      <spacer />
      {family === 'small' ? null : <text font="caption2" color={MUTED}>Tap to log a mood</text>}
    </vstack>
  );
}

$render(content);
