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

Each person has a private question queue; the other person can see its count but not its text until both are online and press **I’m ready**. A round starts with three questions from each person, with each author asking and their partner answering. Questions and responses persist in the Durable Object, and saved answers include their answer date and time. The shared music widget stores one Spotify playlist link and playback position in the Durable Object; the player attempts to sync play, pause, and position across both browsers. Some phones block remote autoplay and require a local tap. Bathroom check-ins and their recent activity history are also stored in the Durable Object.

## Private gallery storage (Backblaze B2)

Gallery originals and generated previews are stored in the private Backblaze B2 bucket `project-lover-boy-gallery` in region `eu-central-003`. The browser uploads directly to B2 with short-lived signed PUT URLs. Cloudflare Pages Functions verify uploads, issue short-lived signed GET URLs after login, and store gallery records in the existing Question Night Durable Object. New gallery images are not committed to GitHub. Existing images stay in the repository as requested and are migrated by the repeatable script described in [the setup and migration guide](docs/gallery-storage-migration.md).

Gallery login uses server-verified, signed, HttpOnly cookies. The encrypted Cloudflare secrets are configured and the updated site is deployed. The migration report for all 24 existing photo paths is saved locally as the ignored `gallery-migration-report.json`; setup and verification details are in the [B2 guide](docs/gallery-storage-migration.md). Keep login passwords and B2 keys out of source control and chat.

Cloudflare Pages continues to serve the site and API. The existing Durable Object remains in use for Question Night, presence, music, bathroom check-ins, and gallery metadata. GitHub-backed memories and rules are not migrated by this change.
