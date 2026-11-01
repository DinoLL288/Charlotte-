import { DOMParser } from '@xmldom/xmldom';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectVersionsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getGalleryUser, isValidAlbum, json, readJsonLimited, requireGalleryConfig, roomRequest, sameOrigin } from './_gallery-auth.js';

globalThis.DOMParser ??= DOMParser;
globalThis.Node ??= { ELEMENT_NODE: 1, TEXT_NODE: 3 };

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_INDEX_BYTES = 800 * 1024;
const SIGNED_URL_SECONDS = 15 * 60;
const TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif'
};

async function bucketUsage(s3, bucket) {
  let bytes = 0, objects = 0, keyMarker, versionIdMarker;
  do {
    // Every application-managed gallery object lives under photos/. Keeping
    // the listing in this prefix also supports a prefix-restricted B2 key.
    const result = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: 'photos/', KeyMarker: keyMarker, VersionIdMarker: versionIdMarker }));
    for (const item of result.Versions || []) { bytes += item.Size || 0; objects++; }
    keyMarker = result.NextKeyMarker;
    versionIdMarker = result.NextVersionIdMarker;
    if (result.IsTruncated && !keyMarker && !versionIdMarker) throw new Error('Bucket version listing did not advance.');
    if (!result.IsTruncated) break;
  } while (true);
  return { bytes, objects };
}

async function deleteAllVersions(s3, bucket, key) {
  let keyMarker, versionIdMarker;
  const versions = [];
  do {
    const result = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key, KeyMarker: keyMarker, VersionIdMarker: versionIdMarker }));
    for (const item of [...(result.Versions || []), ...(result.DeleteMarkers || [])]) if (item.Key === key && item.VersionId) versions.push(item.VersionId);
    if (versions.length > 1000) throw new Error('Too many upload versions to clean automatically.');
    keyMarker = result.NextKeyMarker;
    versionIdMarker = result.NextVersionIdMarker;
    if (!result.IsTruncated) break;
    if (!keyMarker && !versionIdMarker) throw new Error('Version cleanup pagination did not advance.');
  } while (true);
  for (const versionId of versions) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }));
}

function validImageHeader(type, data) {
  if (type === 'image/jpeg') return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (type === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => data[index] === byte);
  if (type === 'image/gif') return String.fromCharCode(...data.slice(0, 6)) === 'GIF87a' || String.fromCharCode(...data.slice(0, 6)) === 'GIF89a';
  if (type === 'image/webp') return String.fromCharCode(...data.slice(0, 4)) === 'RIFF' && String.fromCharCode(...data.slice(8, 12)) === 'WEBP';
  if (type === 'image/avif') return String.fromCharCode(...data.slice(4, 8)) === 'ftyp' && /^(avif|avis)$/.test(String.fromCharCode(...data.slice(8, 12)));
  return false;
}

function client(env) {
  const endpoint = new URL(env.B2_ENDPOINT);
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.backblazeb2.com') || !endpoint.hostname.startsWith('s3.')) throw new Error('Invalid B2 endpoint.');
  return new S3Client({
    region: env.B2_REGION,
    endpoint: endpoint.origin,
    forcePathStyle: true,
    credentials: { accessKeyId: env.B2_APPLICATION_KEY_ID, secretAccessKey: env.B2_APPLICATION_KEY }
  });
}

function cleanName(value) {
  const name = String(value || 'memory').replace(/[\\/\u0000-\u001f]/g, '').trim().slice(0, 160);
  return name || 'memory';
}

function expandPhotos(photos, folder) {
  const output = [];
  for (const photo of photos) {
    for (const album of photo.albums || []) {
      if (folder && folder !== 'all' && album !== folder) continue;
      output.push({
        id: photo.id,
        path: `${photo.id}::${album}`,
        name: photo.name,
        album,
        uploadedBy: photo.uploadedBy,
        uploadedAt: photo.uploadedAt,
        caption: photo.caption || '',
        width: photo.width || null,
        height: photo.height || null,
        size: photo.size
      });
    }
  }
  return output.sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')));
}

async function getPhotos(env, folder) {
  const metadataResponse = await roomRequest(env, {}, 'GET');
  if (!metadataResponse.ok) throw new Error('Gallery metadata could not be loaded.');
  const metadata = await metadataResponse.json();
  const all = metadata.photos || [];
  const items = expandPhotos(all, folder);
  const photosById = new Map(all.map(photo => [photo.id, photo]));
  const b2 = client(env);
  const signed = new Map();
  const keys = [...new Set(items.flatMap(item => { const photo = photosById.get(item.id); return [photo?.objectKey, photo?.thumbnailObjectKey].filter(Boolean); }))];
  await Promise.all(keys.map(async key => {
    signed.set(key, await getSignedUrl(b2, new GetObjectCommand({
      Bucket: env.B2_BUCKET_NAME, Key: key,
      ResponseCacheControl: 'private, max-age=600'
    }), { expiresIn: SIGNED_URL_SECONDS }));
  }));
  for (const item of items) {
    const photo = photosById.get(item.id);
    item.fullUrl = signed.get(photo?.objectKey) || '';
    item.url = signed.get(photo?.thumbnailObjectKey) || item.fullUrl;
  }
  const folders = [...new Set(all.flatMap(photo => photo.albums || []))].sort((a, b) => a.localeCompare(b));
  if (!folders.includes('General')) folders.unshift('General');
  const objectSizes = new Map();
  for (const photo of all) {
    objectSizes.set(photo.objectKey, Number(photo.size) || 0);
    if (photo.thumbnailObjectKey) objectSizes.set(photo.thumbnailObjectKey, Number(photo.thumbnailSize) || 0);
  }
  const used = [...objectSizes.values()].reduce((sum, size) => sum + size, 0);
  return { photos: items, folders, storage: { bytes: used, photos: new Set(all.map(photo => photo.objectKey)).size, freeAllowanceBytes: 10_000_000_000 } };
}

export async function onRequestGet({ request, env }) {
  const user = await getGalleryUser(request, env);
  if (!user) return json({ error: 'Please log in to view our private photos.' }, 401);
  try {
    requireGalleryConfig(env);
    const url = new URL(request.url);
    if (url.searchParams.get('usage') === '1') {
      const b2 = client(env);
      const { bytes, objects } = await bucketUsage(b2, env.B2_BUCKET_NAME);
      const metadataResponse = await roomRequest(env, {}, 'GET');
      if (!metadataResponse.ok) return json({ error: 'Could not compare our bucket to the gallery index.' }, 503);
      const metadata = await metadataResponse.json();
      const photos = metadata.photos || [];
      const indexed = new Map();
      for (const photo of photos) {
        indexed.set(photo.objectKey, Number(photo.size) || 0);
        if (photo.thumbnailObjectKey) indexed.set(photo.thumbnailObjectKey, Number(photo.thumbnailSize) || 0);
      }
      return json({ storage: { bytes, objects, indexedBytes: [...indexed.values()].reduce((sum, size) => sum + size, 0), indexedObjects: indexed.size, indexedPhotos: new Set(photos.map(photo => photo.objectKey)).size, freeAllowanceBytes: 10_000_000_000 } });
    }
    const folder = url.searchParams.get('folder') || '';
    return json(await getPhotos(env, folder));
  } catch {
    return json({ error: 'Our private photo gallery is temporarily unavailable.' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  const user = await getGalleryUser(request, env);
  if (!user) return json({ error: 'Please log in to change our photo gallery.' }, 401);
  if (!sameOrigin(request)) return json({ error: 'Gallery request rejected.' }, 403);
  try { requireGalleryConfig(env); } catch { return json({ error: 'Photo storage is not configured yet.' }, 503); }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Send a valid gallery request.' }, 415);
  if (Number(request.headers.get('content-length')) > MAX_INDEX_BYTES) return json({ error: 'Gallery metadata requests are too large.' }, 413);
  let body;
  try { body = await readJsonLimited(request, MAX_INDEX_BYTES); }
  catch (error) { return json({ error: error.message === 'Request body is too large.' ? error.message : 'Invalid gallery request.' }, error.message === 'Request body is too large.' ? 413 : 400); }

  if (body.action === 'create-upload') {
    const extension = TYPES[body.contentType];
    const size = Number(body.size);
    const thumbnailSize = Number(body.thumbnailSize) || 0;
    const width = body.width == null ? null : Number(body.width);
    const height = body.height == null ? null : Number(body.height);
    const albums = Array.isArray(body.albums) ? [...new Set(body.albums.map(String))] : [];
    if (!extension || !Number.isSafeInteger(size) || size < 1 || size > MAX_UPLOAD_BYTES) return json({ error: 'Choose a JPEG, PNG, WebP, GIF, or AVIF photo under 20 MB.' }, 400);
    if ((width !== null && (!Number.isSafeInteger(width) || width < 1 || width > 100_000)) || (height !== null && (!Number.isSafeInteger(height) || height < 1 || height > 100_000))) return json({ error: 'Image dimensions are invalid.' }, 400);
    if (typeof body.name !== 'string' || body.name.length > 250) return json({ error: 'Choose a photo with a valid file name.' }, 400);
    if (!Number.isSafeInteger(Number(body.thumbnailSize || 0)) || thumbnailSize < 0) return json({ error: 'The preview image size is invalid.' }, 400);
    if (thumbnailSize && (!Number.isSafeInteger(thumbnailSize) || thumbnailSize < 1 || thumbnailSize > 2 * 1024 * 1024)) return json({ error: 'The preview image is too large.' }, 400);
    if (!albums.length || albums.length > 20 || !albums.every(isValidAlbum)) return json({ error: 'Choose up to 20 valid albums.' }, 400);
    const id = crypto.randomUUID();
    const uploadId = crypto.randomUUID();
    const objectKey = `photos/${id}.${extension}`;
    const thumbnailObjectKey = thumbnailSize ? `photos/thumbnails/${id}.webp` : '';
    const uploadedAt = new Date().toISOString();
    let bucketBytes;
    try { bucketBytes = (await bucketUsage(client(env), env.B2_BUCKET_NAME)).bytes; }
    catch (error) {
      const httpStatus = Number(error?.$metadata?.httpStatusCode) || 0;
      const errorCode = String(error?.Code || error?.code || error?.name || 'Error').slice(0, 60);
      console.error('Gallery storage allowance check failed', { operation: 'list-photo-versions', errorCode, httpStatus });
      if (errorCode === 'InvalidAccessKeyId') return json({ error: 'Backblaze does not recognize the application key ID saved for this site. Update the production B2_APPLICATION_KEY_ID and matching B2_APPLICATION_KEY together, then redeploy.' }, 503);
      if (errorCode === 'SignatureDoesNotMatch') return json({ error: 'Backblaze rejected the saved application key pair. Make sure B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY come from the same Backblaze key, then redeploy.' }, 503);
      if (httpStatus === 403) return json({ error: 'Backblaze denied listing our photo files. The key needs listFiles access to this bucket and the photos/ prefix.' }, 503);
      return json({ error: 'Could not check our free storage allowance. Please try again later.' }, 503);
    }
    const reserve = await roomRequest(env, { action: 'begin-upload', bucketBytes, upload: { id: uploadId, user, objectKey, size, contentType: body.contentType, albums, name: cleanName(body.name), uploadedAt, thumbnailObjectKey, thumbnailSize, thumbnailContentType: thumbnailSize ? 'image/webp' : '', width, height } });
    if (!reserve.ok) {
      const error = await reserve.json().catch(() => ({}));
      return json({ error: error.error || 'Could not reserve this upload.' }, reserve.status === 429 || reserve.status === 413 ? reserve.status : 503);
    }
    const reservation = await reserve.json();
    try {
      // The Durable Object reserves original + thumbnail bytes against the
      // bucket snapshot above. A second full version listing here made every
      // upload wait on another complete B2 scan.
      const b2 = client(env);
      const uploadUrl = await getSignedUrl(b2, new PutObjectCommand({ Bucket: env.B2_BUCKET_NAME, Key: objectKey, ContentType: body.contentType }), { expiresIn: 5 * 60 });
      const thumbnailUrl = thumbnailSize ? await getSignedUrl(b2, new PutObjectCommand({ Bucket: env.B2_BUCKET_NAME, Key: thumbnailObjectKey, ContentType: 'image/webp' }), { expiresIn: 5 * 60 }) : '';
      return json({ ok: true, uploadId, uploadUrl, headers: { 'Content-Type': body.contentType }, thumbnailUrl, thumbnailHeaders: thumbnailSize ? { 'Content-Type': 'image/webp' } : null });
    } catch {
      await roomRequest(env, { action: 'cancel-upload', uploadId, user });
      return json({ error: 'Could not prepare the secure photo upload.' }, 503);
    }
  }

  if (body.action === 'complete-upload') {
    if (typeof body.uploadId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.uploadId)) return json({ error: 'Invalid upload receipt.' }, 400);
    const metadataResponse = await roomRequest(env, {}, 'GET');
    if (!metadataResponse.ok) return json({ error: 'Could not verify this upload.' }, 503);
    const metadata = await metadataResponse.json();
    const pending = metadata.pendingUploads?.[body.uploadId];
    if (!pending || pending.user !== user) return json({ error: 'Upload receipt expired. Please upload again.' }, 403);
    let verificationStep = 'check the original photo in private storage';
    try {
      const b2 = client(env);
      const head = await b2.send(new HeadObjectCommand({ Bucket: env.B2_BUCKET_NAME, Key: pending.objectKey }));
      if (head.ContentLength !== pending.size || head.ContentType !== pending.contentType) {
        await deleteAllVersions(b2, env.B2_BUCKET_NAME, pending.objectKey);
        if (pending.thumbnailObjectKey) await deleteAllVersions(b2, env.B2_BUCKET_NAME, pending.thumbnailObjectKey);
        await roomRequest(env, { action: 'cancel-upload', uploadId: body.uploadId, user });
        return json({ error: 'The uploaded photo did not match its approved size or type.' }, 400);
      }
      verificationStep = 'read the original photo data';
      const image = await b2.send(new GetObjectCommand({ Bucket: env.B2_BUCKET_NAME, Key: pending.objectKey, Range: 'bytes=0-31' }));
      const header = await image.Body.transformToByteArray();
      if (!validImageHeader(pending.contentType, header)) {
        await deleteAllVersions(b2, env.B2_BUCKET_NAME, pending.objectKey);
        if (pending.thumbnailObjectKey) await deleteAllVersions(b2, env.B2_BUCKET_NAME, pending.thumbnailObjectKey);
        await roomRequest(env, { action: 'cancel-upload', uploadId: body.uploadId, user });
        return json({ error: 'The uploaded file is not a supported image.' }, 400);
      }
      if (pending.thumbnailObjectKey) {
        verificationStep = 'check the preview in private storage';
        const thumbHead = await b2.send(new HeadObjectCommand({ Bucket: env.B2_BUCKET_NAME, Key: pending.thumbnailObjectKey }));
        if (thumbHead.ContentLength !== pending.thumbnailSize || thumbHead.ContentType !== 'image/webp') {
          await deleteAllVersions(b2, env.B2_BUCKET_NAME, pending.objectKey);
          await deleteAllVersions(b2, env.B2_BUCKET_NAME, pending.thumbnailObjectKey);
          await roomRequest(env, { action: 'cancel-upload', uploadId: body.uploadId, user });
          return json({ error: 'The preview upload did not match its reservation.' }, 400);
        }
        verificationStep = 'read the preview image data';
        const thumb = await b2.send(new GetObjectCommand({ Bucket: env.B2_BUCKET_NAME, Key: pending.thumbnailObjectKey, Range: 'bytes=0-31' }));
        if (!validImageHeader('image/webp', await thumb.Body.transformToByteArray())) {
          await deleteAllVersions(b2, env.B2_BUCKET_NAME, pending.objectKey);
          await deleteAllVersions(b2, env.B2_BUCKET_NAME, pending.thumbnailObjectKey);
          await roomRequest(env, { action: 'cancel-upload', uploadId: body.uploadId, user });
          return json({ error: 'The preview file is not a supported image.' }, 400);
        }
      }
      const photo = {
        id: pending.id,
        objectKey: pending.objectKey,
        thumbnailObjectKey: pending.thumbnailObjectKey,
        thumbnailSize: pending.thumbnailSize,
        name: pending.name,
        size: pending.size,
        contentType: pending.contentType,
        uploadedAt: pending.uploadedAt,
        uploadedBy: user,
        width: pending.width,
        height: pending.height
      };
      verificationStep = 'save the photo to our gallery';
      const complete = await roomRequest(env, { action: 'complete-upload', uploadId: body.uploadId, user, photo });
      if (!complete.ok) return json({ error: 'The upload could not be added to our gallery.' }, 409);
      return json({ ok: true, photoId: photo.id });
    } catch (error) {
      const httpStatus = Number(error?.$metadata?.httpStatusCode) || 0;
      const errorName = String(error?.name || 'Error').slice(0, 60);
      // Log only safe diagnostic fields. Never log request URLs, signed URLs,
      // credentials, image contents, or the full SDK error object.
      console.error('Gallery upload completion failed', { step: verificationStep, errorName, httpStatus });
      if (httpStatus === 403) return json({ error: `Private storage denied permission while trying to ${verificationStep}. The B2 application key needs file-read access.` }, 502);
      if (httpStatus === 404) return json({ error: `Private storage could not find the uploaded file while trying to ${verificationStep}. Please retry the upload.` }, 502);
      return json({ error: `The upload reached private storage, but we could not ${verificationStep}. Please try again.` }, 502);
    }
  }

  if (body.action === 'copy-to-album') {
    if (typeof body.photoId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.photoId) || !isValidAlbum(body.album)) return json({ error: 'Choose a photo and a valid album.' }, 400);
    const result = await roomRequest(env, { action: 'copy-to-album', photoId: body.photoId, album: body.album.trim() });
    return result.ok ? json({ ok: true }) : json({ error: 'Could not add that photo to this album.' }, 404);
  }

  if (body.action === 'cancel-upload') {
    if (typeof body.uploadId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.uploadId)) return json({ error: 'Invalid upload receipt.' }, 400);
    const current = await roomRequest(env, {}, 'GET');
    if (!current.ok) return json({ error: 'Could not safely cancel this upload.' }, 503);
    const data = await current.json();
    const pending = data.pendingUploads?.[body.uploadId];
    if (!pending) return json({ ok: true, canceled: false });
    if (pending.user !== user) return json({ error: 'Upload receipt not found.' }, 404);
    try {
      const b2 = client(env);
      await deleteAllVersions(b2, env.B2_BUCKET_NAME, pending.objectKey);
      if (pending.thumbnailObjectKey) await deleteAllVersions(b2, env.B2_BUCKET_NAME, pending.thumbnailObjectKey);
      await roomRequest(env, { action: 'cancel-upload', uploadId: body.uploadId, user });
      return json({ ok: true, canceled: true });
    } catch { return json({ error: 'Could not safely clean up the pending upload.' }, 502); }
  }

  if (body.action === 'migrate-batch') {
    if (!Array.isArray(body.photos) || body.photos.length > 50) return json({ error: 'Migration batches must contain at most 50 photos.' }, 400);
    const liveUsage = await bucketUsage(client(env), env.B2_BUCKET_NAME);
    const incomingBytes = body.photos.reduce((sum, photo) => sum + (Number(photo?.size) || 0) + (Number(photo?.thumbnailSize) || 0), 0);
    const metadataResponse = await roomRequest(env, {}, 'GET');
    if (!metadataResponse.ok) return json({ error: 'Could not check gallery storage usage.' }, 503);
    const existingData = await metadataResponse.json();
    const pendingBytes = Object.values(existingData.pendingUploads || {}).reduce((sum, upload) => sum + (Number(upload.size) || 0) + (Number(upload.thumbnailSize) || 0), 0);
    if (liveUsage.bytes + incomingBytes + pendingBytes > 10_000_000_000) return json({ error: 'Migration would take the bucket over the 10 GB free storage allowance.' }, 413);
    const b2 = client(env);
    const verified = [];
    for (const photo of body.photos) {
        if (!photo || typeof photo.id !== 'string' || !/^legacy-[a-f0-9]{64}$/.test(photo.id) || typeof photo.objectKey !== 'string' || !/^photos\/legacy\/[a-f0-9]{64}$/.test(photo.objectKey) || typeof photo.thumbnailObjectKey !== 'string' || !/^photos\/thumbnails\/[a-f0-9]{64}\.webp$/.test(photo.thumbnailObjectKey) || !isValidAlbum(photo.album) || !Number.isSafeInteger(photo.size) || !Number.isSafeInteger(photo.thumbnailSize) || !TYPES[photo.contentType] || !['Charlotte', 'Luke', 'Unknown'].includes(photo.uploadedBy)) return json({ error: 'Invalid migration record.' }, 400);
      verified.push(photo);
    }
    const seeded = await roomRequest(env, { action: 'seed-migration', photos: verified });
    if (!seeded.ok) return json({ error: 'Verified photos could not be indexed in the gallery.' }, 503);
    return json(await seeded.json());
  }

  return json({ error: 'Unknown gallery action.' }, 400);
}

export async function onRequestDelete({ request, env }) {
  const user = await getGalleryUser(request, env);
  if (!user) return json({ error: 'Please log in to change our photo gallery.' }, 401);
  if (!sameOrigin(request)) return json({ error: 'Gallery request rejected.' }, 403);
  return json({ error: 'Photo removal is not available from the current gallery.' }, 405);
}
