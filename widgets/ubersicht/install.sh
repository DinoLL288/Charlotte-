#!/bin/bash
# Install the Charlotte & Luke widgets for Übersicht on a Mac.
#
# Run this in Terminal on the Mac you want the widgets on:
#   curl -fsSL https://charlotte-3ts.pages.dev/widgets/ubersicht/install.sh -o /tmp/charlotte-widgets.sh && bash /tmp/charlotte-widgets.sh Charlotte
#
# The name (Charlotte or Luke) sets whose check-ins and moods the widgets
# control — taps only ever log that person's own check-ins and moods, never
# the other person's. It defaults to Charlotte.
#
# What it does:
#   1. Installs Übersicht (free, from tracesof.net) if it is not already
#      in /Applications — with Homebrew if you have it, otherwise by
#      downloading it directly.
#   2. Downloads the bathroom and mood widgets from our site into
#      Übersicht's widgets folder.
#   3. Sets them up for the named person.
#   4. Removes the example widget Übersicht ships with.
#   5. Opens Übersicht, so the widgets appear on the desktop.
#
# After it runs: open Übersicht Preferences from its menu-bar icon, set an
# interaction shortcut and allow Accessibility, then hold the shortcut and
# click a widget. If the widgets do not appear, quit Übersicht and open it
# again.

set -e

NAME="${1:-Charlotte}"
SITE="https://charlotte-3ts.pages.dev"
WIDGETS_DIR="$HOME/Library/Application Support/Übersicht/widgets"

if [ "$NAME" != "Charlotte" ] && [ "$NAME" != "Luke" ]; then
  echo "The name must be Charlotte or Luke, not '$NAME'."
  exit 1
fi

# 1. Install Übersicht if it is not already there.
if [ ! -d "/Applications/Übersicht.app" ]; then
  if command -v brew >/dev/null 2>&1; then
    echo "Installing Übersicht with Homebrew…"
    brew install --cask ubersicht
  else
    echo "Downloading Übersicht…"
    cd /tmp
    curl -fsSL -o Uebersicht.zip "https://tracesof.net/uebersicht/releases/Uebersicht-1.6.82.app.zip"
    unzip -q -o Uebersicht.zip
    ditto "Übersicht.app" /Applications/Übersicht.app
    rm -rf Uebersicht.zip "Übersicht.app"
  fi
else
  echo "Übersicht is already installed."
fi

# 2. Download the widgets from the site.
echo "Downloading the widgets…"
mkdir -p "$WIDGETS_DIR"
cd "$WIDGETS_DIR"
curl -fsSL -o bathroom.widget.zip "$SITE/widgets/ubersicht/bathroom.widget.zip"
curl -fsSL -o mood.widget.zip "$SITE/widgets/ubersicht/mood.widget.zip"
curl -fsSL -o hide-toggle.widget.zip "$SITE/widgets/ubersicht/hide-toggle.widget.zip"
unzip -q -o bathroom.widget.zip
unzip -q -o mood.widget.zip
unzip -q -o hide-toggle.widget.zip
rm -f bathroom.widget.zip mood.widget.zip hide-toggle.widget.zip

# 3. Set the widgets up for the named person, so taps log their own
# check-ins and moods.
sed -i '' "s/const USER = 'Luke'/const USER = '$NAME'/" bathroom.widget/index.jsx mood.widget/index.jsx

# 4. Drop the example widget Übersicht ships with.
rm -f "$WIDGETS_DIR/GettingStarted.jsx"

# 5. Launch Übersicht — the widgets appear on the desktop.
open -a Übersicht

echo ""
echo "Done — the bathroom and mood widgets are on the desktop for $NAME."
echo "In Übersicht Preferences (menu-bar icon), set an interaction shortcut"
echo "and allow Accessibility, then hold the shortcut and click a widget."
