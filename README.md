# Project Lover Boy

A little site for Charlotte. Now split into a hub with multiple sections.

**Live Site:** [[https://203e91a9.charlotte-3ts.pages.dev](https://203e91a9.charlotte-3ts.pages.dev](https://77256cdb.charlotte-3ts.pages.dev/gallery)

## Structure
- `index.html` - Hub page to navigate between sections
- `love.html` - Original heart animation + photo memory
- `messages.html`, `gallery.html`, `timeline.html` - Extra sections

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
