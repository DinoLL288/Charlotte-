// Bathroom widget for Scriptable (free app, iPhone / iPad / Mac).
//
// Shows who's away right now and today's bathroom counts for Charlotte
// & Luke, from the site's public tracker summary:
//   https://charlotte-3ts.pages.dev/api/trackers
//
// SETUP (iPhone / iPad):
//   1. Install "Scriptable" free from the App Store.
//   2. In Scriptable, tap + to make a new script, name it "Bathroom",
//      and paste this whole file in.
//   3. Long-press the home screen → + → Scriptable → pick a widget size
//      (small or medium) → long-press the widget → Edit Widget → choose
//      the "Bathroom" script.
//   4. Tap the widget any time to open bathroom check-ins on the site.
//
// SETUP (Mac): Scriptable isn't available on macOS — the Mac versions
// of this widget are in widgets/scriptwidget/ instead, written for the
// free ScriptWidget app. See widgets.html on the site.

const API_URL = 'https://charlotte-3ts.pages.dev/api/trackers';
const BATHROOM_PAGE = 'https://charlotte-3ts.pages.dev/bathroom.html';

const NAVY = new Color('#0d2c44');
const GOLD = new Color('#f6d365');
const MUTED = new Color('#9fc3d8');
const WHITE = new Color('#ffffff');

function minutesAway(startedAt) {
  if (!startedAt) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (mins < 1) return 'just stepped away';
  if (mins < 60) return 'away ' + mins + 'm';
  const hours = Math.floor(mins / 60);
  return 'away ' + hours + 'h ' + (mins % 60) + 'm';
}

function personRow(widget, name, info) {
  const row = widget.addStack();
  row.centerAlignContent();
  const dot = row.addText(info && info.away ? '🚻' : '✅');
  dot.font = Font.systemFont(18);
  row.addSpacer(8);
  const texts = row.addStack();
  texts.layoutVertically();
  const who = texts.addText(name);
  who.font = Font.boldSystemFont(13);
  who.textColor = WHITE;
  const what = texts.addText(
    info
      ? (info.away ? minutesAway(info.startedAt) : 'Back') + ' · ' + info.today + ' today'
      : 'No check-ins yet'
  );
  what.font = Font.systemFont(11);
  what.textColor = MUTED;
  row.addSpacer();
}

async function buildWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = NAVY;
  widget.url = BATHROOM_PAGE;

  const title = widget.addText('🚻 Bathroom check-ins');
  title.font = Font.boldSystemFont(13);
  title.textColor = GOLD;
  widget.addSpacer(8);

  try {
    const req = new Request(API_URL);
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    personRow(widget, 'Charlotte', data.bathroom && data.bathroom.Charlotte);
    widget.addSpacer(6);
    personRow(widget, 'Luke', data.bathroom && data.bathroom.Luke);
  } catch (e) {
    const sorry = widget.addText('Couldn’t load check-ins');
    sorry.font = Font.boldSystemFont(13);
    sorry.textColor = WHITE;
    widget.addSpacer(4);
    const hint = widget.addText('Tap to open bathroom check-ins');
    hint.font = Font.systemFont(11);
    hint.textColor = MUTED;
  }

  widget.addSpacer();
  const foot = widget.addText('Tap to log a check-in');
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
