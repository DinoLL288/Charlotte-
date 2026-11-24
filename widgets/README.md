# Phone widgets

A plain website can't ship native iPhone / Mac home-screen widgets on its
own — those need a native app. So the site does it the way that works
without building one:

1. **A tiny public endpoint** — `GET /api/trackers`
   (`functions/api/trackers.js`) returns the latest mood per person and
   today's bathroom counts. No sign-in needed, and it never includes mood
   notes or full history. The mood and bathroom trackers themselves already
   live on the site (`mood.html`, `bathroom.html`) and store their data
   server-side in the question-room Durable Object, so both people see the
   same data.

2. **Ready-to-use Scriptable scripts** — Scriptable is a free app
   (App Store / Mac App Store) that runs JavaScript widgets on iPhone,
   iPad and Mac. Paste one of these scripts into Scriptable and add it as
   a home-screen widget:
   - `mood-widget.js` — Charlotte & Luke's latest moods.
   - `bathroom-widget.js` — who's away right now, and today's counts.

   Tapping either widget opens the matching tracker page on the site.

3. **The site itself as a home-screen app** — the site has a web app
   manifest (`site.webmanifest`) and an Apple touch icon, so in Safari
   use Share → Add to Home Screen and it sits next to the widgets like an
   app. (Android: Chrome menu → Add to Home screen / Install app.)

See `widgets.html` on the site for the same steps in plain words.
`widgets.html` also has copy buttons that grab these scripts straight
from the site.
