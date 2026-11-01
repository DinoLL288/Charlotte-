import { getGalleryUser, isValidAlbum, json, readJsonLimited, roomRequest, sameOrigin } from './_gallery-auth.js';

export async function onRequestGet({ request, env }) {
  if (!(await getGalleryUser(request, env))) return json({ error: 'Please sign in first.' }, 401);
  try {
    const response = await roomRequest(env, { action: 'get-youtube-videos' });
    if (!response.ok) return json({ error: 'Our video list is unavailable.' }, 503);
    return json(await response.json());
  } catch { return json({ error: 'Our video list is unavailable.' }, 503); }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'This request must come from our website.' }, 403);
  const uploader = await getGalleryUser(request, env);
  if (!uploader) return json({ error: 'Please sign in first.' }, 401);
  let body;
  try { body = await readJsonLimited(request, 4096); } catch { return json({ error: 'Invalid video details.' }, 400); }
  if (body.action === 'add-to-album') {
    const videoId = typeof body.videoId === 'string' ? body.videoId : '';
    const album = typeof body.album === 'string' ? body.album.trim() : '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !isValidAlbum(album)) return json({ error: 'Choose a valid video and album.' }, 400);
    try {
      const moved = await roomRequest(env, { action: 'move-youtube-video-to-album', videoId, album });
      if (!moved.ok) return json({ error: 'Could not add that video to the album.' }, moved.status || 503);
      return json(await moved.json());
    } catch { return json({ error: 'Could not add that video to the album.' }, 503); }
  }
  const videoId = typeof body.videoId === 'string' ? body.videoId : '';
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken : '';
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || accessToken.length < 20 || accessToken.length > 4096) return json({ error: 'The completed video could not be verified.' }, 400);
  try {
    const verifyResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    if (!verifyResponse.ok) return json({ error: 'YouTube could not confirm this upload. Check the connected channel and try again.' }, 502);
    const result = await verifyResponse.json();
    const video = result.items?.[0];
    if (!video || video.status?.privacyStatus !== 'unlisted') return json({ error: 'This upload was not confirmed as an unlisted YouTube video.' }, 400);
    const saved = await roomRequest(env, {
      action: 'add-youtube-video',
      uploader,
      video: { videoId, title: video.snippet?.title, description: video.snippet?.description, album: isValidAlbum(body.album) ? body.album.trim() : 'General' }
    });
    if (!saved.ok) return json({ error: 'The upload is on YouTube, but we could not save it to our shared list.' }, 503);
    return json(await saved.json());
  } catch { return json({ error: 'The upload finished, but its shared card could not be saved.' }, 503); }
}
