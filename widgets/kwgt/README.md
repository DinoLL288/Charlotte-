# Android widgets (KWGT)

Scriptable doesn't exist on Android, so the mood and bathroom widgets are
also shipped as **KWGT** (Kustom Widget Maker) presets — ready-made
`.kwgt` files that fetch the same public `/api/trackers` endpoint as the
iPhone/iPad and Mac versions.

- `mood.kwgt` — Charlotte & Luke's latest moods (emoji, label, intensity,
  how long ago). Tap it to open the mood page.
- `bathroom.kwgt` — who's away right now and today's counts. Tap it to
  open the bathroom page with `?toggle=Luke`, so a tap flips **your own**
  check-in (away, then back) — the same tap-to-toggle as the Mac widget.

## Setup (also on the site: hub → Mood & wins → 📱 Phone widgets)

1. Install **KWGT Kustom Widget Maker** free from the Google Play Store.
2. **Importing a ready-made `.kwgt` file needs the paid KWGT Pro key**
   (about $6.99, one-time, in the Play Store). Without it, KWGT can't
   import someone else's preset — but the free app has the full editor,
   so you can build the same widget by hand with the formulas on
   `widgets.html` (a global text variable `API_URL` holding
   `https://charlotte-3ts.pages.dev/api/trackers`, then text items using
   `wg()` — see "How the presets work" below).
3. Download the `.kwgt` file from the site and move it into the
   `Kustom/widgets` folder on the phone (or in KWGT: Load Preset →
   folder button → Import, then pick the file).
4. Long-press the home screen → Widgets → KWGT → drag a widget on
   (4×2 fits these best), tap it → Load Preset → pick the widget.
5. Tap the widget any time to open the tracker on the site.

Widgets refresh on KWGT's own update cycle, so they can be a little
behind — tapping one always opens the latest on the site.

## How the presets work

A `.kwgt` file is a ZIP archive: `preset.json` at the root, plus
`preset_thumb_portrait.jpg` and `preset_thumb_landscape.jpg` (static
preview mocks for the preset picker — KWGT draws the real widget).

`preset.json` is a flat list of modules on a 960×300 canvas, positioned
relative to the canvas centre (the default KWGT anchor):

- A text global `API_URL` (`https://charlotte-3ts.pages.dev/api/trackers`).
- Text modules that fetch with KWGT's `wg()` function and its `json`
  filter, e.g. `$wg(gv(API_URL), json, .mood.Charlotte.emoji)$`. The
  detail lines combine fields with `if()` and show how long ago with
  `tf()`, e.g. `Happy · 4/5 · 2 hours ago`, or `Not logged yet` when
  there's no mood. Bathroom rows read `.bathroom.<name>.startedAt`
  (set = away, empty = back) and `.bathroom.<name>.today`.
- A fully transparent full-canvas shape on top whose `SINGLE_TAP`
  fires an Android `VIEW` intent (`LAUNCH_APP` with an intent string —
  the same shape real exported presets use) opening the tracker page.
  The bathroom one opens `bathroom.html?toggle=Luke`.

Colours match the site: navy `#0d2c44` background, gold `#f6d365`
headings, white names, muted `#9fc3d8` details.

## Regenerating the presets

Don't hand-edit the `.kwgt` files — edit `build.py` and run it:

    python3 widgets/kwgt/build.py

It rebuilds both presets (and their thumbnails) from the definitions in
the script. `tests/kwgt-widgets.test.mjs` checks the built files: valid
ZIP with `preset.json` first, every `wg()` JSONPath resolving against
the real API payload shape, modules inside the canvas, and the tap URLs.

## What could not be verified (please check on a phone)

There is no Android device with KWGT here, so the presets were
validated structurally, not by loading them in the app:

- **Import + render**: the ZIP layout, `preset.json` shape and module
  fields were modelled on real exported presets (a KWGT quote widget
  and an easy-mode replica) and the files unzip and parse cleanly, but
  nobody has watched KWGT open them yet. If KWGT refuses a file, the
  first thing to check is the zip (it must stay zipped — don't
  decompress it before importing) and the import path above.
- **Text colours**: `paint_color` on text modules is the field the
  preset format uses for shapes, but it wasn't directly confirmed for
  text in a real export. If the widget loads but all the text is white
  (gold heading / muted details missing), set the colours in the
  editor — tap a text item → Paint → colour. The layout and data will
  still be right.
- **Tap**: the tap uses a `VIEW` intent rather than KWGT's native
  "open URL" touch action, because the intent form is the one proven by
  real exports. If a tap does nothing, open the widget in KWGT, tap the
  top layer ("Tap to open") → Touch tab → set the single tap to
  "Open URL" with the page link instead.
- **Refresh timing**: KWGT fetches `wg()` data on its normal widget
  update cycle; there is no fixed 15-minute poll in these presets. If
  the data looks stale, tapping the widget opens the live page.

The `/api/trackers` endpoint returns 503 on branch previews (the
question-room binding is production-only), so the widgets only show
data against the live site — that's expected, and it's why the presets
point at `charlotte-3ts.pages.dev` rather than a preview URL.
