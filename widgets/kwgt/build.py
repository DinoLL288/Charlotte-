#!/usr/bin/env python3
"""Build the KWGT (.kwgt) presets for the Charlotte- site tracker widgets.

Regenerates widgets/kwgt/mood.kwgt and widgets/kwgt/bathroom.kwgt from the
preset definitions below. A .kwgt file is a ZIP archive with preset.json at
the root plus two preview thumbnails.

    python3 widgets/kwgt/build.py

Layout notes (see widgets/kwgt/README.md for the full story):
- Canvas is 960x300. KWGT positions modules relative to the canvas centre
  by default, so each module is placed by its top-left corner here and the
  offset is computed from the centre (480, 150).
- Text is left-aligned in its box by default (as in the reference widgets
  this was modelled on), so a wide box starting at x=24 reads as a
  left-aligned line starting 24px from the edge.
- Data comes from the same public endpoint as the Scriptable/ScriptWidget
  versions: https://charlotte-3ts.pages.dev/api/trackers, via KWGT's wg()
  function with the json filter, e.g.
  $wg(gv(API_URL), json, .mood.Charlotte.emoji)$
- The tap target is a fully transparent full-canvas shape on top of
  everything, with a SINGLE_TAP action that fires an Android VIEW intent
  (LAUNCH_APP + intent string, the same shape real exported presets use).
  Mood opens mood.html; bathroom opens bathroom.html?toggle=Luke so a tap
  flips Luke's own check-in, matching the Mac widget.
"""

import json
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SITE = "https://charlotte-3ts.pages.dev"
API_URL = f"{SITE}/api/trackers"

# Canvas and colours (same navy/gold palette as the site).
W, H = 960, 300
CX, CY = W // 2, H // 2
NAVY = "#FF0D2C44"   # opaque #0d2c44
GOLD = "#FFF6D365"   # opaque #f6d365
WHITE = "#FFFFFFFF"
MUTED = "#FF9FC3D8"  # opaque #9fc3d8
CLEAR = "#00000000"  # fully transparent (tap layer)


def wg(path):
    """wg() call fetching one JSONPath from the trackers endpoint."""
    return f"wg(gv(API_URL), json, {path})"


def text_module(title, expression, x, y, w, h, size, color):
    """A text module placed by top-left corner; offset is from canvas centre."""
    return {
        "internal_type": "TextModule",
        "internal_title": title,
        "text_expression": expression,
        "paint_color": color,
        "text_size": float(size),
        "text_size_type": "FIXED_WIDTH",
        "text_width": float(w),
        "text_height": float(h),
        "text_lines": 1,
        "position_offset_x": float(x + w / 2 - CX),
        "position_offset_y": float(y + h / 2 - CY),
    }


def tap_layer(url):
    """Invisible full-canvas shape on top that makes the whole widget tappable."""
    return {
        "internal_type": "ShapeModule",
        "internal_title": "Tap to open",
        "shape_type": "RECT",
        "shape_width": float(W),
        "shape_height": float(H),
        "paint_color": CLEAR,
        "position_offset_x": 0.0,
        "position_offset_y": 0.0,
        "internal_events": [
            {
                "type": "SINGLE_TAP",
                "action": "LAUNCH_APP",
                "intent": (
                    "intent:#Intent;action=android.intent.action.VIEW;"
                    "category=android.intent.category.BROWSABLE;"
                    f"data={url};end"
                ),
            }
        ],
    }


def mood_detail(person):
    """'Happy · 4/5 · 2 hours ago' or 'Not logged yet'."""
    base = f".mood.{person}"
    emoji = wg(f"{base}.emoji")
    label = wg(f"{base}.label")
    intensity = wg(f"{base}.intensity")
    time = wg(f"{base}.time")
    return (
        f"$if({emoji}=\"\", \"Not logged yet\", {label}"
        f" + if({intensity}=\"\", \"\", \" · \" + {intensity} + \"/5\")"
        f" + if({time}=\"\", \"\", \" · \" + tf({time})))$"
    )


def mood_emoji(person):
    base = f".mood.{person}"
    emoji = wg(f"{base}.emoji")
    return f"$if({emoji}=\"\", \"—\", {emoji})$"


def bathroom_detail(person):
    """'Away · 25 minutes ago · 2 today' or 'Back · 1 today'."""
    base = f".bathroom.{person}"
    started = wg(f"{base}.startedAt")
    today = wg(f"{base}.today")
    today_part = f" + if({today}=\"\", \"\", \" · \" + {today} + \" today\")"
    return (
        f"$if({started}=\"\", \"Back\"{today_part}, "
        f"\"Away · \" + tf({started}){today_part})$"
    )


def bathroom_emoji(person):
    base = f".bathroom.{person}"
    started = wg(f"{base}.startedAt")
    return f"$if({started}=\"\", \"✅\", \"🚻\")$"


def person_rows(kind, person1, person2):
    """Two rows: emoji + name + detail, one per person."""
    if kind == "mood":
        emoji_fn, detail_fn = mood_emoji, mood_detail
    else:
        emoji_fn, detail_fn = bathroom_emoji, bathroom_detail
    rows = []
    for i, person in enumerate((person1, person2)):
        y = 72 + i * 88  # row 1 at y=72, row 2 at y=160
        rows.append(text_module(f"{person} emoji", emoji_fn(person),
                                24, y, 72, 60, 48, WHITE))
        rows.append(text_module(f"{person} name", person,
                                108, y, 400, 38, 30, WHITE))
        rows.append(text_module(f"{person} detail", detail_fn(person),
                                108, y + 40, 700, 32, 24, MUTED))
    return rows


def build_preset(title, description, tap_url, kind, heading, footer):
    return {
        "preset_info": {
            "version": 1,
            "title": title,
            "description": description,
            "author": "Charlotte & Luke",
            "width": W,
            "height": H,
            "features": "",
            "release": 1,
            "locked": False,
            "pflags": 0,
        },
        "preset_root": {
            "internal_type": "RootLayerModule",
            "globals_list": {
                "api_url": {
                    "index": 1,
                    "type": "TEXT",
                    "title": "API_URL",
                    "value": API_URL,
                }
            },
            "background_color": NAVY,
            "viewgroup_items": [
                text_module("Heading", heading, 24, 18, 912, 40, 32, GOLD),
                *person_rows(kind, "Charlotte", "Luke"),
                text_module("Footer", footer, 24, 248, 912, 28, 22, MUTED),
                tap_layer(tap_url),
            ],
        },
    }


# ---------------------------------------------------------------- thumbnails
# Static preview mocks for the preset picker (not renders of the live widget:
# KWGT draws the real thing on the phone). Drawn with DejaVu; emoji are
# shown as a gold dot because the thumbnail font has no emoji glyphs.

def _font(size, bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", size)


def thumbnail_landscape(heading, rows, footer):
    img = Image.new("RGB", (W, H), "#0d2c44")
    d = ImageDraw.Draw(img)
    d.text((24, 18), heading, font=_font(32, bold=True), fill="#f6d365")
    for i, (name, detail) in enumerate(rows):
        y = 72 + i * 88
        d.ellipse((30, y + 14, 62, y + 46), fill="#f6d365")
        d.text((108, y), name, font=_font(30, bold=True), fill="#ffffff")
        d.text((108, y + 40), detail, font=_font(24), fill="#9fc3d8")
    d.text((24, 248), footer, font=_font(22), fill="#9fc3d8")
    return img


def thumbnail_portrait(landscape):
    img = Image.new("RGB", (540, 960), "#0d2c44")
    small = landscape.resize((500, 156))
    img.paste(small, (20, 402))
    return img


def write_preset(name, preset, heading, rows, footer):
    land = thumbnail_landscape(heading, rows, footer)
    port = thumbnail_portrait(land)
    kwgt_path = HERE / f"{name}.kwgt"
    with zipfile.ZipFile(kwgt_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("preset.json", json.dumps(preset, ensure_ascii=False))
        land_bytes = HERE / f".{name}-land.jpg"
        port_bytes = HERE / f".{name}-port.jpg"
        land.save(land_bytes, "JPEG", quality=88)
        port.save(port_bytes, "JPEG", quality=88)
        z.write(land_bytes, "preset_thumb_landscape.jpg")
        z.write(port_bytes, "preset_thumb_portrait.jpg")
        land_bytes.unlink()
        port_bytes.unlink()
    print(f"wrote {kwgt_path} ({kwgt_path.stat().st_size} bytes)")


def main():
    mood = build_preset(
        title="Mood — Charlotte & Luke",
        description="Shows Charlotte and Luke's latest moods from "
                    "charlotte-3ts.pages.dev. Tap to open the mood page.",
        tap_url=f"{SITE}/mood.html",
        kind="mood",
        heading="How we're feeling",
        footer="Tap to log a mood",
    )
    write_preset("mood", mood, "How we're feeling",
                 [("Charlotte", "Happy · 4/5 · 2 hours ago"),
                  ("Luke", "Happy · 4/5 · 2 hours ago")],
                 "Tap to log a mood")

    bathroom = build_preset(
        title="Bathroom — Charlotte & Luke",
        description="Shows Charlotte and Luke's bathroom check-ins from "
                    "charlotte-3ts.pages.dev. Tap to toggle your own check-in.",
        tap_url=f"{SITE}/bathroom.html?toggle=Luke",
        kind="bathroom",
        heading="Bathroom check-ins",
        footer="Tap to toggle your check-in",
    )
    write_preset("bathroom", bathroom, "Bathroom check-ins",
                 [("Charlotte", "Back · 0 today"),
                  ("Luke", "Back · 1 today")],
                 "Tap to toggle your check-in")


if __name__ == "__main__":
    main()
