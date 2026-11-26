# Mac widgets — Übersicht

Übersicht (free, open-source, tracesof.net/uebersicht) is the Mac widget
app these use. It replaces the ScriptWidget versions: ScriptWidget's tap
kept opening the editor instead of the page, even after its `linkurl` and
`<link>` mechanisms were both added, so these widgets run on Übersicht
instead — a real web view where clicks work.

## What they do

- `bathroom.widget/` — who's away right now and today's bathroom counts.
  Clicking it flips **your own** check-in (away, then back) by POSTing
  straight to the site's API — no browser, no login page. Set up for Luke;
  for Charlotte's own widget, change `'Luke'` to `'Charlotte'` in `USER`.
- `mood.widget/` — Charlotte & Luke's latest moods. Clicking it opens the
  mood tracker page in the browser so a mood can be picked.

Both read the site's public tracker summary (`GET /api/trackers`) every
15 seconds. No sign-in, no notes or history.

## Install (Mac)

1. Install Übersicht (free) from https://tracesof.net/uebersicht/
   (or `brew install --cask ubersicht`).
2. Übersicht menu-bar icon → **Open Widgets Folder**.
3. Download `bathroom.widget.zip` / `mood.widget.zip` from the site's
   Phone widgets page, unzip, and drag the `.widget` folder into the
   widgets folder. (Or create the folder by hand and paste in `index.jsx`.)
4. In Übersicht Preferences, set an **interaction shortcut** and allow
   **Accessibility** when asked — clicks only reach a widget while the
   shortcut is held. This is Übersicht's own requirement, not ours.
5. Hold the interaction shortcut and click the bathroom widget to toggle.

Positions are in `className` at the top of each `index.jsx` (bathroom at
top-left, mood below it). Edit the `top` / `left` numbers to move them.

## Regenerating the zips

The `.zip` files next to the folders are built from the folders:

```
cd widgets/ubersicht
zip -r bathroom.widget.zip bathroom.widget
zip -r mood.widget.zip mood.widget
zip -r hide-toggle.widget.zip hide-toggle.widget
```

Rebuild them whenever `index.jsx` changes, so the download matches the
source.
