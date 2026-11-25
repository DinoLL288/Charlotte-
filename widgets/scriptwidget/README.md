# Mac widgets (ScriptWidget)

Scriptable — the app the iPhone/iPad widgets use — is **not available on
macOS**, so the Mac versions of the same two widgets are written for
[ScriptWidget](https://scriptwidget.app) instead, which builds Mac
widgets in JavaScript/JSX from its free Studio app. They show the same
data from the same public endpoint (`GET /api/trackers`) and tap through
to the same tracker pages; only the widget framework is different.

Each widget is a ScriptWidget Package 2.0 folder with two files:

- `mood/main.jsx` + `mood/widget.json` — Charlotte & Luke's latest
  moods. Package id `com.charlotte-site.mood-widget`.
- `bathroom/main.jsx` + `bathroom/widget.json` — who's away right now,
  and today's check-in counts. Package id
  `com.charlotte-site.bathroom-widget`.

The `widget.json` in each folder declares the `network` permission and
the `charlotte-3ts.pages.dev` host — without those, the fetch of the
tracker summary is blocked. The scripts use only baseline ScriptWidget
features (`fetch`, `vstack`/`hstack`/`text`/`spacer`, `linkurl`,
`$getenv("widget-size")`), so no minimum runtime version is declared.
On the small family the footer line is left out to keep everything
fitting.

## Setup (Mac)

In ScriptWidget Studio, choose **Blank Widget** and name it "Mood" (then
again for "Bathroom"). Paste `main.jsx` over the blank script, paste
`widget.json` over the blank manifest, press Command-R to preview and
Command-S to save, then add the widget from the system widget gallery
and pick the widget. `widgets.html` on the site has copy buttons for all
four files and the same steps in plain words.

## Status

These were written from ScriptWidget's docs and bundled examples
(runtime API 1.6) and syntax-checked, but they have **not** been run in
ScriptWidget Studio itself — there is no Mac here to run it on. If
Studio reports a problem, its Problems panel says which line, and the
fix is usually in that file, not on the site.
