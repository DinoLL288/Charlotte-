# Project Lover Boy

A little site for Charlotte. Now split into a hub with multiple sections.

**Live Site:** [https://charlotte-3ts.pages.dev](https://charlotte-3ts.pages.dev)

## Structure
- `index.html` - Hub page to navigate between sections
- `app-shell.html` - Persistent site frame for animated page transitions and shared music
- `site-shell-guard.js`, `site-frame.js`, `site-shell.js` - Route pages through the persistent app shell
- `site-polish.css` - Shared visual styling and form controls
- `love.html` - Original heart animation + photo memory
- `messages.html`, `gallery.html`, `timeline.html` - Extra sections
- `rules.html` - Shared rules & boundaries, saved to `rules/rules.json` via `/api/rules`
- `avatar.js` - Shared top-right profile picture button that links to Settings
- `tiktok.html` - Save TikTok links and plan dance dates (dates auto-sync to the calendar)
- `messages.html` - Notes we leave for each other
- `functions/api/heart.js` - Saves shared keepsakes to `heart/heart.json` through the configured GitHub token
- `play.html` - Inside jokes, bingo, and clue hunts
- `our-life.html` - Shared recipes, books and films, monthly awards, and projects
- `question-night.html` - An anytime question room that reveals only when both people are online and ready
- `presence.js` - Shared online indicator, editable playlist, and on-page Spotify player
- `bathroom.html` - Shared bathroom check-ins with each person's profile picture and activity history

### Live question room and shared music

The real-time features use a small Cloudflare Durable Object Worker alongside the Pages Functions. Question prompts and answers are stored in its private persistent storage rather than the repository data file:

1. From the repository root, deploy the room Worker with `npx wrangler deploy --config question-room-worker/wrangler.toml`.
2. The root `wrangler.toml` defines the production `QUESTION_ROOM` binding for the `charlotte-question-room` Worker.
3. Deploy the Pages project with `npx wrangler pages deploy . --project-name charlotte --branch main` so the binding is attached to the Functions.

The GitHub-connected Pages project must also keep the build command `npm ci --omit=dev`. Pages Functions import `@aws-sdk/*` and `@xmldom/xmldom`; without an install step the build fails with "Could not resolve" errors.

Each person has a private question queue; the other person can see its count but not its text until both are online and press **I’m ready**. A round starts with three questions from each person, with each author asking and their partner answering. Questions and responses persist in the Durable Object, and saved answers include their answer date and time. The shared music widget stores one Spotify playlist link and playback position in the Durable Object; the player attempts to sync play, pause, and position across both browsers. Some phones block remote autoplay and require a local tap. Bathroom check-ins and their recent activity history are also stored in the Durable Object.

## Gallery photo storage (Google Photos)

New photo uploads go directly from the browser to the shared Google Photos account using the Google Photos Library API. Gallery metadata and website album assignments are stored in the existing Question Night Durable Object. The Google OAuth access token stays in that browser session and is not sent to Cloudflare or stored in the repository. Both of us need to connect the same shared Google account from the **Connect our shared Google Photos** button; the site login still identifies Luke or Charlotte as the uploader.

Google Photos only lets this integration list and retrieve media items created through this app. It does not expose the rest of the account library or support API-managed shared albums. The website keeps its own album organization. Existing B2 and GitHub photos are preserved and are not automatically moved or deleted. The earlier B2 setup/migration notes remain available in [the historical storage guide](docs/gallery-storage-migration.md).

### One-time Google setup

In the Google Cloud project used by the website's existing OAuth web client (`molten-crowbar-513403-j7`, project number `924567335912`):

1. Enable **Photos Library API** (done). Without it, uploads fail with a misleading browser CORS error.
2. In OAuth consent **Data Access**, add `https://www.googleapis.com/auth/photoslibrary.appendonly` and `https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata`.
3. Confirm the OAuth web client has `https://charlotte-3ts.pages.dev` as an authorized JavaScript origin. Add the exact local development origin too if testing locally.
4. If the consent screen is in **Testing**, add the shared Google Photos account as a test user. Google may require app verification before wider production access to Photos scopes.
5. In both browsers, sign in to the same shared Google Photos account on the gallery page and choose **Connect our shared Google Photos**. Google access tokens expire, so reconnect when the page asks.

Uploads are stored at original quality and use the shared account's Google storage. The API does not offer a delete-media-item operation for this flow; deleting an item from Google Photos outside the website can leave a stale entry in our site index.

Gallery login uses server-verified, signed, HttpOnly cookies. Keep login passwords and API credentials out of source control and chat.

Cloudflare Pages continues to serve the site and API. The existing Durable Object remains in use for Question Night, presence, music, bathroom check-ins, and gallery metadata. GitHub-backed memories and rules are not migrated by this change.
