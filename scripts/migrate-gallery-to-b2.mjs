import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { HeadObjectCommand, ListObjectVersionsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { imageSize } from 'image-size';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_TYPES = new Map([['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.gif', 'image/gif'], ['.avif', 'image/avif']]);
const MAX_BATCH = 50;
const SITE = process.env.GALLERY_SITE_ORIGIN || 'https://charlotte-3ts.pages.dev';
const BUCKET = process.env.B2_BUCKET_NAME || 'project-lover-boy-gallery';
const REGION = process.env.B2_REGION || 'eu-central-003';
const ENDPOINT = process.env.B2_ENDPOINT || `https://s3.${REGION}.backblazeb2.com`;
const REPORT_PATH = path.join(ROOT, 'gallery-migration-report.json');

const rl = createInterface({ input: stdin, output: stdout });
const ask = async label => (await rl.question(label)).trim();

async function askSecret(label, envName = label) {
  if (process.env[envName]) return process.env[envName];
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') throw new Error(`${label} must be entered in an interactive terminal.`);
  stdout.write(label + ': ');
  stdin.setRawMode(true);
  stdin.resume();
  return await new Promise((resolve, reject) => {
    let value = '';
    const onData = chunk => {
      const character = chunk.toString('utf8');
      if (character === '\u0003') { stdin.off('data', onData); stdin.setRawMode(false); reject(new Error('Cancelled.')); return; }
      if (character === '\r' || character === '\n') {
        stdin.off('data', onData); stdin.setRawMode(false); stdout.write('\n'); resolve(value); return;
      }
      if (character === '\u0008' || character === '\u007f') value = value.slice(0, -1);
      else if (!/[\u0000-\u001f]/.test(character)) value += character;
    };
    stdin.on('data', onData);
  });
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function contentType(file) { return IMAGE_TYPES.get(path.extname(file).toLowerCase()); }
function albumFor(relativePath) {
  const album = path.dirname(relativePath).replaceAll('\\', '/');
  return album === '.' ? 'Old Photos' : album;
}
function uploadedAtFor(relativePath, metadata, stat) {
  const saved = metadata[relativePath]?.uploadedAt;
  if (saved && !Number.isNaN(Date.parse(saved))) return new Date(saved).toISOString();
  const timestamp = Number(path.basename(relativePath).match(/^(\d{13})-/)?.[1]);
  return new Date(timestamp || stat.mtimeMs).toISOString();
}
async function listImages(folder) {
  const output = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) output.push(...await listImages(fullPath));
    else if (entry.isFile() && IMAGE_TYPES.has(path.extname(entry.name).toLowerCase())) output.push(fullPath);
  }
  return output.sort();
}
async function verifyCors() {
  const url = `${ENDPOINT.replace(/\/$/, '')}/${BUCKET}/`;
  for (const origin of [SITE, 'http://localhost:8788']) {
    const response = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' } });
    if (!response.ok || response.headers.get('access-control-allow-origin') !== origin || !(response.headers.get('access-control-allow-methods') || '').toUpperCase().includes('PUT')) throw new Error(`B2 CORS is not ready for ${origin}. Apply the documented bucket CORS rule first.`);
  }
}
async function currentBucketBytes(s3) {
  let bytes = 0, keyMarker, versionIdMarker;
  do {
    const page = await s3.send(new ListObjectVersionsCommand({ Bucket: BUCKET, KeyMarker: keyMarker, VersionIdMarker: versionIdMarker }));
    for (const item of page.Versions || []) bytes += item.Size || 0;
    keyMarker = page.NextKeyMarker;
    versionIdMarker = page.NextVersionIdMarker;
    if (page.IsTruncated && !keyMarker && !versionIdMarker) throw new Error('B2 object-version listing did not advance.');
    if (!page.IsTruncated) break;
  } while (true);
  return bytes;
}
async function login() {
  const user = process.env.GALLERY_SITE_USER || await ask('Log in as Luke or Charlotte: ');
  if (!['Luke', 'Charlotte'].includes(user)) throw new Error('Choose Luke or Charlotte.');
  const password = process.env.GALLERY_SITE_PASSWORD || await askSecret('Site password (input hidden)');
  const response = await fetch(`${SITE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: SITE }, body: JSON.stringify({ user, password }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Site login failed. Configure the production login secrets before migrating.');
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('The site did not issue a secure migration session.');
  return { user, cookie: setCookie.split(';', 1)[0] };
}
async function appApi(cookie, body) {
  const response = await fetch(`${SITE}/api/gallery`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: SITE }, body: JSON.stringify(body) });
  let result;
  try { result = await response.json(); }
  catch { throw new Error(`Gallery API action ${body.action} returned a non-JSON response (${response.status}).`); }
  if (!response.ok) throw new Error(result.error || 'Gallery API request failed.');
  return result;
}

async function main() {
  const keyId = await askSecret('B2_APPLICATION_KEY_ID (input hidden)', 'B2_APPLICATION_KEY_ID');
  const applicationKey = await askSecret('B2_APPLICATION_KEY (input hidden)', 'B2_APPLICATION_KEY');
  if (!keyId || !applicationKey) throw new Error('A restricted B2 application key is required.');
  const s3 = new S3Client({ region: REGION, endpoint: ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: keyId, secretAccessKey: applicationKey } });
  await verifyCors();
  const { user, cookie } = await login();
  const legacyRoot = path.join(ROOT, 'gallery');
  const metadataPath = path.join(legacyRoot, 'metadata.json');
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  const files = await listImages(legacyRoot);
  const records = [];
  let uploadedCount = 0;
  let thumbnailUploadedCount = 0;
  const uploadedKeys = new Set();
  const uploadedThumbnailKeys = new Set();
  const preexistingKeys = new Set();
  let totalBytes = 0;

  for (const absolutePath of files) {
    const relativePath = path.relative(legacyRoot, absolutePath).replaceAll('\\', '/');
    const ext = path.extname(relativePath).toLowerCase();
    const mime = contentType(relativePath);
    const bytes = await fs.readFile(absolutePath);
    if (bytes.length > 20 * 1024 * 1024) throw new Error(`A legacy photo exceeds the 20 MB safety limit: ${relativePath}`);
    const digest = sha256(bytes);
    const pathHash = sha256(relativePath);
    const objectKey = `photos/legacy/${digest}`;
    const thumbnailObjectKey = `photos/thumbnails/${digest}.webp`;
    const thumbnail = await sharp(bytes, { limitInputPixels: 100_000_000 }).rotate().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    const thumbnailDigest = sha256(thumbnail);
    const id = `legacy-${pathHash}`;
    const previous = metadata[`gallery/${relativePath}`] || {};
    const stat = await fs.stat(absolutePath);
    let dimensions = {};
    try { dimensions = imageSize(bytes); } catch { /* Keep dimensions empty for an unsupported image header. */ }
    let existing = null;
    try { existing = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: objectKey })); }
    catch (error) { if (!['NotFound', 'NoSuchKey', '404'].includes(error.name) && error.$metadata?.httpStatusCode !== 404) throw new Error(`Could not inspect the reserved B2 object for ${relativePath}.`); }
    if (existing) {
      if (existing.ContentLength !== bytes.length || existing.Metadata?.['source-sha256'] !== digest) throw new Error(`A different B2 object already uses the deterministic key for ${relativePath}; no files were overwritten.`);
      if (!uploadedKeys.has(objectKey)) preexistingKeys.add(objectKey);
    } else {
      if (await currentBucketBytes(s3) + bytes > 10_000_000_000) throw new Error('Migration would take the B2 bucket over the 10 GB free storage allowance.');
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, Body: bytes, ContentLength: bytes.length, ContentType: mime, Metadata: { 'source-sha256': digest } }));
      const verified = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: objectKey }));
      if (verified.ContentLength !== bytes.length || verified.Metadata?.['source-sha256'] !== digest) throw new Error(`B2 verification failed for ${relativePath}.`);
      uploadedCount++;
      uploadedKeys.add(objectKey);
    }
    let existingThumbnail = null;
    try { existingThumbnail = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: thumbnailObjectKey })); }
    catch (error) { if (!['NotFound', 'NoSuchKey', '404'].includes(error.name) && error.$metadata?.httpStatusCode !== 404) throw new Error(`Could not inspect the preview object for ${relativePath}.`); }
    if (existingThumbnail) {
      if (existingThumbnail.ContentLength !== thumbnail.length || existingThumbnail.Metadata?.['source-sha256'] !== thumbnailDigest) throw new Error(`A different B2 preview already uses the deterministic key for ${relativePath}; no files were overwritten.`);
      if (!uploadedThumbnailKeys.has(thumbnailObjectKey)) preexistingKeys.add(thumbnailObjectKey);
    } else {
      if (await currentBucketBytes(s3) + thumbnail.length > 10_000_000_000) throw new Error('Migration would take the B2 bucket over the 10 GB free storage allowance.');
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: thumbnailObjectKey, Body: thumbnail, ContentLength: thumbnail.length, ContentType: 'image/webp', Metadata: { 'source-sha256': thumbnailDigest } }));
      const verifiedThumbnail = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: thumbnailObjectKey }));
      if (verifiedThumbnail.ContentLength !== thumbnail.length || verifiedThumbnail.Metadata?.['source-sha256'] !== thumbnailDigest) throw new Error(`Preview verification failed for ${relativePath}.`);
      thumbnailUploadedCount++;
      uploadedThumbnailKeys.add(thumbnailObjectKey);
    }
    records.push({
      id, objectKey, thumbnailObjectKey, thumbnailSize: thumbnail.length, thumbnailSha256: thumbnailDigest,
      album: albumFor(relativePath), name: path.basename(relativePath), size: bytes.length,
      contentType: mime, uploadedAt: uploadedAtFor(relativePath, metadata, stat), uploadedBy: ['Luke', 'Charlotte'].includes(previous.uploadedBy) ? previous.uploadedBy : 'Unknown',
      width: dimensions.width || null, height: dimensions.height || null, caption: typeof previous.caption === 'string' ? previous.caption.slice(0, 500) : '',
      sha256: digest,
      sourcePath: `gallery/${relativePath}`
    });
    totalBytes += bytes.length;
    stdout.write(`Verified ${records.length}/${files.length}: ${relativePath}\n`);
  }

  const bucketBytes = await currentBucketBytes(s3);
  if (bucketBytes > 10_000_000_000) throw new Error('The B2 bucket already exceeds the 10 GB free storage allowance; migration stopped before indexing photos.');

  for (let start = 0; start < records.length; start += MAX_BATCH) {
    stdout.write(`Saving gallery metadata batch ${Math.floor(start / MAX_BATCH) + 1}/${Math.ceil(records.length / MAX_BATCH)}...\n`);
    await appApi(cookie, { action: 'migrate-batch', photos: records.slice(start, start + MAX_BATCH) });
  }
  const libraryResponse = await fetch(`${SITE}/api/gallery`, { headers: { cookie }, cache: 'no-store' });
  let library;
  try { library = await libraryResponse.json(); }
  catch { throw new Error(`Gallery read-back returned a non-JSON response (${libraryResponse.status}).`); }
  if (!libraryResponse.ok) throw new Error(library.error || 'Could not read back the migrated gallery.');
  const photos = library.photos || [];
  for (const record of records) {
    const stored = photos.find(photo => photo.id === record.id);
    if (!stored?.url || !stored?.fullUrl) throw new Error(`The gallery did not return signed retrieval URLs for ${record.sourcePath}.`);
    const response = await fetch(stored.fullUrl);
    if (!response.ok) throw new Error(`Private original retrieval failed for ${record.sourcePath}.`);
    if (sha256(new Uint8Array(await response.arrayBuffer())) !== record.sha256) throw new Error(`Downloaded original did not match its source for ${record.sourcePath}.`);
    const thumbResponse = await fetch(stored.url);
    if (!thumbResponse.ok) throw new Error(`Private preview retrieval failed for ${record.sourcePath}.`);
    if (sha256(new Uint8Array(await thumbResponse.arrayBuffer())) !== record.thumbnailSha256) throw new Error(`Downloaded preview did not match its source for ${record.sourcePath}.`);
  }
  const report = {
    completedAt: new Date().toISOString(), site: SITE, bucket: BUCKET, region: REGION,
    verifiedBy: user, sourceImagePathCount: records.length, sourceBytes: totalBytes,
    distinctOriginalCount: new Set(records.map(record => record.objectKey)).size,
    uniqueOriginalBytes: [...new Map(records.map(record => [record.objectKey, record.size])).values()].reduce((sum, size) => sum + size, 0),
    uniqueThumbnailCount: new Set(records.map(record => record.thumbnailObjectKey)).size,
    uniqueThumbnailBytes: [...new Map(records.map(record => [record.thumbnailObjectKey, record.thumbnailSize])).values()].reduce((sum, size) => sum + size, 0),
    totalStoredBytes: [...new Map(records.flatMap(record => [[record.objectKey, record.size], [record.thumbnailObjectKey, record.thumbnailSize]])).values()].reduce((sum, size) => sum + size, 0),
    uploadedCount, thumbnailUploadedCount, previouslyVerifiedObjectCount: preexistingKeys.size, retrievedAndChecksumVerifiedOriginalCount: records.length, retrievedAndChecksumVerifiedThumbnailCount: records.length,
    metadataRecordsVisible: records.length, repositoryImagesDeleted: false,
    photos: records.map(({ sourcePath, objectKey, thumbnailObjectKey, album, size, thumbnailSize, uploadedAt, uploadedBy, width, height, sha256: hash, thumbnailSha256 }) => ({ sourcePath, objectKey, thumbnailObjectKey, album, size, thumbnailSize, uploadedAt, uploadedBy, width, height, sha256: hash, thumbnailSha256 }))
  };
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', { flag: 'w' });
  stdout.write(`\nMigration finished: ${records.length} source paths referencing ${report.distinctOriginalCount} unique originals. Unique originals and previews use ${report.totalStoredBytes} B2 bytes. Every original and preview download matched its source SHA-256.\n`);
  stdout.write(`Report saved locally to ${REPORT_PATH}. Original repository images remain untouched.\n`);
}

try { await main(); }
catch (error) { stdout.write(`Migration stopped: ${error.message}\n`); process.exitCode = 1; }
finally { rl.close(); }
