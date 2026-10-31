# Project Lover Boy

A little site for Charlotte. Now split into a hub with multiple sections.

**Live Site:** [https://charlotte-3ts.pages.dev](https://charlotte-3ts.pages.dev)

## Structure
- `index.html` - Hub page to navigate between sections
- `love.html` - Original heart animation + photo memory
- `messages.html`, `gallery.html`, `timeline.html` - Extra sections
- `rules.html` - Shared rules & boundaries, saved to `rules/rules.json` via `/api/rules`
- `avatar.js` - Shared top-right profile picture button that links to Settings
- `tiktok.html` - Save TikTok links and plan dance dates (dates auto-sync to the calendar)
- `messages.html` - Notes we leave for each other
- `music.html` - Persistent shared Spotify player; keep this tab open while browsing the site
- `functions/api/heart.js` - Saves shared keepsakes to `heart/heart.json` through the configured GitHub token
- `play.html` - Inside jokes, bingo, and clue hunts
- `our-life.html` - Shared recipes, books and films, monthly awards, and projects
- `question-night.html` - An anytime question room that reveals only when both people are online and ready
- `presence.js` - Shared online indicator, playlist settings, and persistent-player link
- `music-player.js` - Spotify embed playback and cross-device play prompts

### Live question room and shared music

The real-time features use a small Cloudflare Durable Object Worker alongside the Pages Functions. Question prompts and answers are stored in its private persistent storage rather than the repository data file:

1. From the repository root, deploy the room Worker with `npx wrangler deploy --config question-room-worker/wrangler.toml`.
2. The root `wrangler.toml` defines the production `QUESTION_ROOM` binding for the `charlotte-question-room` Worker.
3. Deploy the Pages project with `npx wrangler pages deploy . --project-name charlotte --branch main` so the binding is attached to the Functions.

Each person has a private question queue; the other person can see its count but not its text until both are online and press **I’m ready**. A round starts with three questions from each person, with each author asking and their partner answering. Questions and responses persist in the Durable Object, and saved answers include their answer date and time. The shared music widget stores one Spotify playlist link in the Durable Object and shows that playlist to both accounts. Playback runs in the separate `music.html` tab so browsing or reloading the main site does not close the player. Each phone still needs a local play tap; Spotify may block autoplay on the other device.

## Gallery photo uploads (Cloudflare Pages)

The gallery supports uploading photos directly from the website. They get committed to this repo via a Cloudflare Pages Function.

### Setup
1. Deploy this repo to [Cloudflare Pages](https://pages.cloudflare.com/). Use the default build settings (static site, no build command needed).
2. Create a GitHub personal access token (classic) with `repo` scope: https://github.com/settings/tokens
3. In Cloudflare Pages > your project > Settings > Environment variables, add:
   - `GITHUB_TOKEN` - your PAT
   - `GITHUB_REPO` - `username/repo` (e.g. `DinoLL288/Charlotte-`)
   - `GITHUB_BRANCH` - `main` (optional)
4. Redeploy the project.

Once set up, photos uploaded from `gallery.html` go to `gallery/` in the repo and appear in the gallery.

### Notes
- GitHub Pages alone cannot do this - this site is hosted on Cloudflare Pages with Functions.
- Large photos may take a moment to appear after upload.
- If uploads fail, check the function logs in Cloudflare Pages.
