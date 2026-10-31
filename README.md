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
- `together.html` - Shared appreciation notes, open-when letters, traditions, a wish list, and memory map
- `functions/api/heart.js` - Saves shared keepsakes to `heart/heart.json` through the configured GitHub token
- `play.html` - Scheduled question ritual, inside jokes, bingo, and clue hunts
- `our-life.html` - Shared recipes, books and films, monthly awards, and projects
- `question-night.html` - A scheduled weekly question room that reveals only when both people are online and ready
- `presence.js` - Shared online indicator and a shared Spotify playlist player

### Live question room and shared music

The real-time features use a small Cloudflare Durable Object Worker alongside the Pages Functions. Question prompts and answers are stored in its private persistent storage rather than the repository data file:

1. From the repository root, deploy the room Worker with `npx wrangler deploy --config question-room-worker/wrangler.toml`.
2. In Cloudflare Pages, open the project settings and add a **Durable Object** binding named `QUESTION_ROOM`, selecting the `QuestionNightRoom` namespace from the deployed Worker.
3. Redeploy the Pages project so the binding becomes available to its Functions.

Question prompts stay hidden until both Charlotte and Luke have the Question night page open and both press **I’m ready**. The shared music widget stores one Spotify playlist link in the Durable Object and shows that playlist to both accounts. Each listener starts playback in their own Spotify embed; open the playlist in Spotify and turn on repeat to loop it. Spotify's embed does not expose repeat or cross-account playback synchronization controls.

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
