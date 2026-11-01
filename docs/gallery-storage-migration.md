# Backblaze B2 gallery setup and migration

## Current implementation status

The B2 upload and private retrieval code, server-verified gallery sessions, Durable Object gallery metadata, repeatable migration script, and automated security test suite are deployed on the existing Cloudflare Pages project. Production secrets and bucket CORS are configured. The migration completed on 2026-11-01 and the report is saved locally as `gallery-migration-report.json` (gitignored).

The existing B2 bucket is private, encrypted, and in `eu-central-003`:

- Bucket: `project-lover-boy-gallery`
- S3 endpoint: `https://s3.eu-central-003.backblazeb2.com`
- Region: `eu-central-003`
- The account region was selected when the Backblaze account was created and cannot be changed later. This setup uses the bucket's actual region; it does not assume an Australian region.

## Backblaze key security

The bucket-restricted B2 key supplied by Luke is configured as an encrypted Cloudflare Pages secret and was used for migration. Because it was pasted into chat, replace and revoke it in Backblaze when convenient, then update `B2_APPLICATION_KEY_ID` and `B2_APPLICATION_KEY` in Pages. Never paste keys into chat or commit them. The gallery needs list, read, write, and delete access: delete is used only to permanently remove rejected or abandoned upload versions, and the gallery does not have a user-facing photo-delete control. Do not grant access to other buckets or use the master key.

The public GitHub repository contains the previous browser-side login values in its Git history. The same Luke and Charlotte values are now checked server-side from encrypted Cloudflare secrets so the selected profile still identifies who performed an action. The public history was not rewritten.

## Configure CORS on the private bucket

The private bucket has the rules from [`b2-cors.json`](../b2-cors.json) configured for the **S3-compatible API**. The rule permits only browser `PUT` uploads from:

- `https://charlotte-3ts.pages.dev`
- `http://localhost:8788`

The browser displays private photos with temporary signed GET URLs in `<img>` elements, which do not require cross-origin JavaScript access. No public-read ACL or public bucket setting is needed.

## Cloudflare configuration

The non-secret bucket configuration is in the root [`wrangler.toml`](../wrangler.toml). These encrypted secrets are configured on the existing Cloudflare Pages project `charlotte`:

- `B2_APPLICATION_KEY_ID`
- `B2_APPLICATION_KEY`
- `GALLERY_SESSION_SECRET` — a random secret of at least 32 bytes used to sign seven-day HttpOnly sessions.
- `GALLERY_INTERNAL_SECRET` — a random secret of at least 32 bytes used only between Pages Functions and the existing Durable Object.
- `LUKE_LOGIN_PASSWORD` — a new password, never sent in chat.
- `CHARLOTTE_LOGIN_PASSWORD` — a separate new password, never sent in chat.

Set the same `GALLERY_INTERNAL_SECRET` as an encrypted secret on the existing `charlotte-question-room` Worker. The B2 key values belong only on the Pages project. The internal secret is shared only between the Pages project and that Worker. Use Cloudflare's dashboard secret fields or Wrangler's interactive secret prompts; do not add secret values to `wrangler.toml`, `.dev.vars.example`, or source control.

To rotate or update a secret later, use Wrangler's interactive prompt:

```powershell
npx wrangler pages secret put B2_APPLICATION_KEY_ID --project-name charlotte
npx wrangler pages secret put B2_APPLICATION_KEY --project-name charlotte
npx wrangler pages secret put GALLERY_SESSION_SECRET --project-name charlotte
npx wrangler pages secret put GALLERY_INTERNAL_SECRET --project-name charlotte
npx wrangler pages secret put LUKE_LOGIN_PASSWORD --project-name charlotte
npx wrangler pages secret put CHARLOTTE_LOGIN_PASSWORD --project-name charlotte
npx wrangler secret put GALLERY_INTERNAL_SECRET --config question-room-worker/wrangler.toml
```

The Pages and Worker `GALLERY_INTERNAL_SECRET` values match. Do not run those commands with plaintext secret arguments.

For local development, put local test values in an ignored root `.dev.vars` and an ignored `question-room-worker/.dev.vars`. `.gitignore` excludes both. Use a dedicated B2 application key, not a production master key. Start the room Worker and Pages dev server as described in the [Cloudflare Pages local development guide](https://developers.cloudflare.com/pages/functions/local-development/); bind the existing Durable Object with `--do QUESTION_ROOM=QuestionNightRoom@charlotte-question-room`.

## Production deployment

The updated app is deployed to the existing Pages project and Durable Object Worker; no duplicate production resources were created. To deploy a later revision, use:

```powershell
npm ci
npm test
npx wrangler deploy --config question-room-worker/wrangler.toml
npx wrangler pages deploy . --project-name charlotte --branch main
```

The Pages Function route for `/gallery/*` returns 404 for old repository-backed photo paths. The original image files remain in GitHub as requested.

## Repeatable migration

The migrated inventory is **24 image paths totaling 23,357,785 source bytes**, representing **22 distinct original image contents**: there are two byte-for-byte duplicate pairs. The migration stores each unique original and preview only once, then keeps each path's album and metadata record pointing at the shared object. There are 10 root photos and 14 album photos across `1`, `Charlottes Painted Nails`, `General`, and `Luke`. Root photos are presented as the `Old Photos` album. The existing `gallery/metadata.json` has uploader and timestamp data for 11 images; other dates are read from timestamped filenames and uploader identity is kept as `Unknown` when the repository has no record. The migration reads captions when present and extracts dimensions where supported. It creates WebP previews while retaining exact original files.

The completed migration report records **24 source paths**, **22 unique originals**, **23,596,491 bytes** of B2 originals plus previews, and successful signed-URL SHA-256 verification for all 24 originals and 24 previews. It is stored locally at `gallery-migration-report.json` and excluded from Git.

To safely repeat the migration, run:

```powershell
npm run gallery:migrate
```

Set `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `GALLERY_SITE_USER`, and `GALLERY_SITE_PASSWORD` in the local process environment before running. The script checks CORS from both configured origins, computes deterministic keys from each relative source path, skips verified objects, checks object size/type/checksum metadata, seeds metadata through the authenticated Pages API in batches, and downloads every signed original and preview URL to compare its SHA-256 with the local source. It writes the ignored local `gallery-migration-report.json`. It never deletes repository photos or Git history.

## Storage and usage

The gallery creates private originals and, when the browser can make a smaller WebP preview, one 640-pixel preview per image. Originals are never recompressed. Uploads are limited to 20 MB each and 25 per account per day. New uploads are refused when indexed plus reserved/observed bucket usage would exceed the first 10 GB free storage allowance. The gallery's **Check B2 bucket usage** button lists all stored object versions (including retained noncurrent versions) and compares them with indexed originals/previews so unindexed objects are visible.

Backblaze currently publishes the first 10 GB of storage free and free egress up to 3× average monthly storage; additional egress beyond the free amount is published at $0.01/GB under the pay-as-you-go model. API transaction allowances have published limits and are not unlimited. Check [Backblaze's current transaction pricing](https://www.backblaze.com/cloud-storage/transaction-pricing) and [B2 storage pricing](https://www.backblaze.com/cloud-storage/pricing) before usage grows. The app does not enable a payment method or paid plan. Its 10 GB upload cap prevents intentional growth beyond the storage allowance; monitor the bucket, since an account's other stored data or retained historical versions can also affect billing.

B2 keeps object versions. The app uses random keys for new originals and derived thumbnails; the migration uses deterministic keys and refuses to overwrite mismatched objects. Rejected pending uploads are permanently cleaned by version ID. No lifecycle rule is changed automatically.

## Gallery architecture and security review

- B2 is the only permanent image-file store. The GitHub image upload and copy APIs are disabled; new uploads do not pass image bytes through Pages Functions.
- A login is verified by a Pages Function against encrypted Cloudflare password secrets. The server issues a signed HttpOnly, SameSite cookie. Gallery APIs derive identity from that cookie; a browser-supplied username is not accepted as proof.
- Upload requests validate same-origin JSON, album names, supported raster image MIME types, a 20 MB limit, rate limits, and the storage cap. Pages creates a short-lived signed PUT URL for a generated UUID key. After upload, Pages verifies object size, content type, and file signature before saving metadata.
- Photo listings and batch signed GET URLs are returned only after session validation. The bucket stays private, URLs expire after 15 minutes, responses are `no-store`, and browser object caching is private. The browser refreshes the entire URL batch after 12 minutes rather than making one Function request per image.
- Durable Object records store IDs, B2 object keys, album names, original names, upload date/uploader, captions, dimensions, sizes, and preview keys. Album copies reference the same B2 object instead of duplicating the original. Durable Object writes serialize concurrent metadata changes.
- Login attempts are limited in the Durable Object; photo uploads are limited to 25 per account per day. API keys and signed URLs are not logged or returned in errors.
- No gallery delete feature existed before this change. The current gallery still has no photo-delete button or public delete API. Old `/api/upload` and `/api/gallery-copy` endpoints no longer write to GitHub.
- The remaining data exposure is the public GitHub repository. The raw URL for an existing gallery metadata file returned HTTP 200 during this review, which confirms repository files are publicly reachable. You chose to keep the repository public and preserve its files/history, so the old GitHub photo copies and historical login values remain public. The new B2 photos and the Cloudflare `/gallery/*` static paths are private after deployment, but old copies in GitHub are not private. This cannot be fixed by application code while retaining public repository history.

## Verification report

Automated tests cover signed-session validation, unauthenticated gallery rejection, disabled legacy upload behavior, Durable Object internal-secret checks, upload reservations, and repeatable migration seeding. Run `npm test` for these. They do not contact Backblaze or Cloudflare.

The live migration verified private original and preview retrieval by downloading all 48 URLs and checking SHA-256 hashes. Both original profile logins were smoke-tested against production, the authenticated gallery API returned JSON, and unauthenticated gallery access returned 401. The site now caches static assets in the browser for 60 seconds; private APIs stay `no-store`. Question Night draft recovery and live refreshes reduce text loss and repeated requests. No manual upload through a browser or regression run for Question Night, presence, shared playlist, bathroom check-ins, memories, and rules was completed as part of this migration.

## Known limits / unfinished steps

1. Replace and revoke the B2 key that appeared in chat, then update the two B2 secrets in Cloudflare.
2. Verify new uploads manually in both browsers; no live browser-based upload was performed in this session.
3. The GitHub repository stays public by your choice, so old photos and historical source data remain publicly accessible there.
