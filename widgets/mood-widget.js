// Mood widget for Scriptable (free app, iPhone / iPad / Mac).
//
// Shows Charlotte & Luke's latest moods from the site, no sign-in needed.
// The widget reads the site's public tracker summary:
//   https://charlotte-3ts.pages.dev/api/trackers
//
// SETUP (iPhone / iPad):
//   1. Install "Scriptable" free from the App Store.
//   2. In Scriptable, tap + to make a new script, name it "Mood", and
//      paste this whole file in.
//   3. Long-press the home screen → + → Scriptable → pick a widget size
//      (small or medium) → long-press the widget → Edit Widget → choose
//      the "Mood" script.
//   4. Tap the widget any time to open the mood tracker on the site.
//
// SETUP (Mac): same steps in Scriptable for Mac, then add the widget
//   from Notification Center. Widgets refresh on the system's own
//   schedule — for the very latest mood, tap the widget to open the site.

const API_URL = 'https://charlotte-3ts.pages.dev/api/trackers';
const MOOD_PAGE = 'https://charlotte-3ts.pages.dev/mood.html';

const NAVY = new Color('#0d2c44');
const GOLD = new Color('#f6d365');
const MUTED = new Color('#9fc3d8');
const WHITE = new Color('#ffffff');

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

function personRow(widget, name, mood) {
  const row = widget.addStack();
  row.centerAlignContent();
  const emoji = row.addText(mood ? mood.emoji : '—');
  emoji.font = Font.systemFont(20);
  row.addSpacer(8);
  const texts = row.addStack();
  texts.layoutVertically();
  const who = texts.addText(name);
  who.font = Font.boldSystemFont(13);
  who.textColor = WHITE;
  const what = texts.addText(
    mood ? mood.label + (mood.intensity ? ' · ' + mood.intensity + '/5' : '') : 'Not logged yet'
  );
  what.font = Font.systemFont(11);
  what.textColor = MUTED;
  row.addSpacer();
  if (mood && mood.time) {
    const when = row.addText(timeAgo(mood.time));
    when.font = Font.systemFont(11);
    when.textColor = MUTED;
  }
}

async function buildWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = NAVY;
  widget.url = MOOD_PAGE;

  const title = widget.addText('💛 How we’re feeling');
  title.font = Font.boldSystemFont(13);
  title.textColor = GOLD;
  widget.addSpacer(8);

  try {
    const req = new Request(API_URL);
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    personRow(widget, 'Charlotte', data.mood && data.mood.Charlotte);
    widget.addSpacer(6);
    personRow(widget, 'Luke', data.mood && data.mood.Luke);
  } catch (e) {
    const sorry = widget.addText('Couldn’t load moods');
    sorry.font = Font.boldSystemFont(13);
    sorry.textColor = WHITE;
    widget.addSpacer(4);
    const hint = widget.addText('Tap to open the mood tracker');
    hint.font = Font.systemFont(11);
    hint.textColor = MUTED;
  }

  widget.addSpacer();
  const foot = widget.addText('Tap to log a mood');
  foot.font = Font.systemFont(10);
  foot.textColor = MUTED;
  return widget;
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
