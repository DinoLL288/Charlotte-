const DEFAULT_SPOTIFY_PLAYLIST = 'https://open.spotify.com/playlist/0nd5Ut2ixgw4RfV0EfQHwx';

function bathroomDayKey(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = type => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function bathroomHasOpenBreak(events, user) {
  let open = false;
  for (const event of [...events].filter(item => item.user === user).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    if (event.action === 'start') open = true;
    else if (event.action === 'return') open = false;
  }
  return open;
}

const TRUTH_DARE_PROMPTS = {
  text: {
    truth: [
      'What tiny thing I do always makes you smile?', 'What song feels a little like us?', 'What is a small moment together you wish you could replay?',
      'What is something you would love us to try on our next date?', 'What is your favorite way for me to show I care?', 'What silly thing are you secretly very good at?',
      'What is one thing you have been looking forward to lately?', 'Which photo of us makes you happiest, and why?', 'What is a cozy evening together in your imagination?',
      'What is something you appreciate about how we talk to each other?', 'What snack would you pick for our perfect movie night?', 'What is a little dream you would like us to make time for?'
    ],
    dare: [
      'Send me a photo of something nearby that matches your mood.', 'Write me a three-line love note using three emojis I choose.', 'Send a voice note saying one kind thing about yourself.',
      'Pick a song for us and send me the link with a one-sentence review.', 'Draw a tiny picture of our ideal date and send it.', 'Send me your best dramatic reaction to an imaginary plot twist.',
      'Make up a two-line theme song for us and type it out.', 'Choose a color; send me three things around you in that color.', 'Send me a wholesome meme that feels like us.',
      'Give our next date a movie title and a tagline.', 'Send a voice note reading a very ordinary sentence like a movie trailer.', 'Invent a ridiculous award and tell me what I win it for.'
    ]
  },
  call: {
    truth: [
      'What was your first impression of me?', 'What small thing helps you feel cared for when we are apart?', 'What is one favorite memory from one of our calls?',
      'What would you like more of in our time together?', 'What is a place you would enjoy exploring with me?', 'What is something new you learned about yourself recently?',
      'What kind of date feels most relaxing to you?', 'What is something about us that makes you proud?', 'What is one thing you would like me to ask you more often?',
      'Which shared memory makes you laugh the most?', 'What is a comfort show, game, or song you would share with me?', 'What is one small goal you would like us to cheer each other on with?'
    ],
    dare: [
      'Give me your best impression of a sleepy cat for five seconds.', 'Hum a song and let me guess it.', 'Describe your favorite snack like a fancy restaurant critic.',
      'Show me an object nearby and make up its dramatic backstory.', 'Say something sweet about yourself in your most confident voice.', 'Make up a silly handshake using only words and sound effects.',
      'Tell a tiny story about our next adventure in three sentences.', 'Do your best game-show host introduction for me.', 'Pick an emoji and explain why it is today’s official us emoji.',
      'Invent a new holiday for us and describe how we celebrate it.', 'Try to make me laugh using only a very serious voice.', 'Give a 10-second tour of one favorite thing in your room, if you feel comfortable.'
    ]
  }
};

export class QuestionNightRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.galleryQueue = Promise.resolve();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const sessionDate = url.searchParams.get('sessionDate') || '';

    if (url.pathname.endsWith('/internal/gallery')) return this.handleGalleryInternal(request);

    if (url.pathname.endsWith('/state')) {
      return Response.json(await this.getState(sessionDate));
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'meta') {
      const user = url.searchParams.get('user');
      if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
      const data = await this.getQuestionData();
      const questionCounts = {
        Charlotte: data.questions.filter(item => item.author === 'Charlotte').length,
        Luke: data.questions.filter(item => item.author === 'Luke').length
      };
      return Response.json({
        questionSchedule: data.schedule,
        questionCounts,
        questionItems: data.questions.filter(item => item.author === user).map(item => ({ id: item.id, body: item.body, createdAt: item.createdAt })),
        questionSessions: Object.fromEntries(Object.entries(data.sessions).map(([key, value]) => [key, { questionIds: value.questionIds }]))
      });
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'bathroom') {
      return Response.json(await this.getBathroomData(), { headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'truth-dare') {
      const user = url.searchParams.get('user');
      if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
      return Response.json(await this.getTruthDareView(user), { headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'preferences') {
      const user = url.searchParams.get('user');
      if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
      return Response.json(await this.getPreferences(user), { headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'playful-state') {
      return Response.json(await this.getPlayfulState(), { headers: { 'cache-control': 'no-store' } });
    }
    if (request.method === 'GET' && url.searchParams.get('view') === 'playful-points') {
      const user = url.searchParams.get('user');
      if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
      return Response.json({ points: await this.getPlayfulPoints(user) }, { headers: { 'cache-control': 'no-store' } });
    }
    if (request.method === 'GET' && url.searchParams.get('view') === 'bouncy-balls') {
      const user = url.searchParams.get('user');
      if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
      return Response.json(await this.getBouncyBallsState(user), { headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'love-tasks') {
      return Response.json(await this.getLoveTasks(), { headers: { 'cache-control': 'no-store' } });
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'questions') {
      const requestedSession = url.searchParams.get('sessionDate') || '';
      if (!(await this.getState(requestedSession)).open) return Response.json({ error: 'We both need to be online and ready before our questions open' }, { status: 423 });
      const data = await this.getQuestionData();
      const session = data.sessions[requestedSession] || { questionIds: [], questions: {} };
      const questions = session.questionIds.map(id => {
        const saved = session.questions?.[id];
        const bankItem = data.questions.find(item => item.id === id);
        return { id, body: typeof saved === 'string' ? saved : (saved?.body || bankItem?.body || ''), author: (typeof saved === 'object' && saved?.author) || bankItem?.author || '' };
      }).filter(item => item.body);
      return new Response(JSON.stringify({ questions, questionSessions: { [requestedSession]: session }, questionResponses: { [requestedSession]: data.responses[requestedSession] || {} } }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      });
    }

    if (request.method === 'GET' && url.searchParams.get('view') === 'history') {
      const data = await this.getQuestionData();
      const sessions = Object.fromEntries(Object.entries(data.sessions).map(([date, session]) => {
        const questions = Object.fromEntries((session.questionIds || []).map(id => {
          const saved = session.questions?.[id];
          const bankItem = data.questions.find(item => item.id === id);
          return [id, { body: typeof saved === 'string' ? saved : (saved?.body || bankItem?.body || ''), author: (typeof saved === 'object' && saved?.author) || bankItem?.author || '' }];
        }));
        return [date, { questionIds: session.questionIds || [], questions }];
      }));
      return new Response(JSON.stringify({ questionSessions: sessions, questionResponses: data.responses }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      });
    }

    if (request.method === 'POST') return this.mutateQuestions(request);

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 });
    }


    const user = url.searchParams.get('user');
    if (!['Charlotte', 'Luke'].includes(user)) return new Response('Unknown room member', { status: 403 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return new Response('Invalid question session', { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ user, sessionDate });
    this.ctx.acceptWebSocket(server);

    const ready = await this.ctx.storage.get(`ready:${sessionDate}`) || {};
    ready[user] = false;
    await this.ctx.storage.put(`ready:${sessionDate}`, ready);
    await this.broadcast(sessionDate);
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleGalleryInternal(request) {
    const result = this.galleryQueue.then(() => this.handleGalleryInternalLocked(request));
    this.galleryQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async handleGalleryInternalLocked(request) {
    const supplied = request.headers.get('x-gallery-internal-secret') || '';
    const expected = this.env?.GALLERY_INTERNAL_SECRET || '';
    let mismatch = supplied.length ^ expected.length;
    for (let i = 0; i < Math.max(supplied.length, expected.length); i++) mismatch |= (supplied.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
    if (!expected || mismatch) return Response.json({ error: 'Not found' }, { status: 404 });
    const data = await this.ctx.storage.get('galleryData') || { photos: [], pendingUploads: {} };
    if (request.method === 'GET') return Response.json({ ok: true, photos: data.photos, googlePhotos: data.googlePhotos || [], pendingUploads: data.pendingUploads, vault: await this.ctx.storage.get('sharedVault') || null }, { headers: { 'cache-control': 'no-store' } });
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    let body;
    try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }

    if (body.action === 'get-calendar-feed-link' || body.action === 'rotate-calendar-feed-link') {
      let token = body.action === 'get-calendar-feed-link' ? await this.ctx.storage.get('calendarFeedToken') : '';
      if (!token) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        token = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        await this.ctx.storage.put('calendarFeedToken', token);
      }
      return Response.json({ ok: true, token });
    }
    if (body.action === 'verify-calendar-feed-link') {
      const token = String(body.token || '');
      const saved = await this.ctx.storage.get('calendarFeedToken') || '';
      let diff = token.length ^ saved.length;
      for (let i = 0; i < Math.max(token.length, saved.length); i++) diff |= (token.charCodeAt(i) || 0) ^ (saved.charCodeAt(i) || 0);
      return Response.json({ ok: Boolean(saved) && diff === 0 });
    }
    if (body.action === 'get-shared-accounts') {
      let accounts = await this.ctx.storage.get('sharedAccounts');
      if (!Array.isArray(accounts)) {
        accounts = [
          { id: 'tiktok', name: 'TikTok', platform: 'TikTok', handle: '@secretdino.ll27', profileUrl: 'https://www.tiktok.com/@secretdino.ll27', visibility: 'Public', note: '' },
          { id: 'youtube', name: 'YouTube', platform: 'YouTube', handle: '@secretdino.ll27', profileUrl: 'https://www.youtube.com/@secretdino.ll27', visibility: 'Unlisted videos · anyone with the link can watch', note: '' }
        ];
        await this.ctx.storage.put('sharedAccounts', accounts);
      }
      const youtubeAccount = accounts.find(account => account.id === 'youtube');
      if (youtubeAccount?.visibility === 'Private videos') {
        youtubeAccount.visibility = 'Unlisted videos · anyone with the link can watch';
        await this.ctx.storage.put('sharedAccounts', accounts);
      }
      return Response.json({ ok: true, accounts });
    }
    if (body.action === 'save-shared-accounts') {
      if (!Array.isArray(body.accounts) || body.accounts.length > 30) return Response.json({ error: 'Keep up to 30 shared account cards.' }, { status: 400 });
      const accounts = body.accounts.map(account => ({
        id: String(account.id || crypto.randomUUID()).slice(0, 80),
        name: String(account.name || '').trim().slice(0, 80),
        platform: String(account.platform || 'Other').trim().slice(0, 40),
        handle: String(account.handle || '').trim().slice(0, 100),
        profileUrl: String(account.profileUrl || '').trim().slice(0, 500),
        visibility: String(account.visibility || '').trim().slice(0, 80),
        note: String(account.note || '').trim().slice(0, 300),
        updatedBy: ['Luke', 'Charlotte'].includes(body.updatedBy) ? body.updatedBy : 'Unknown',
        updatedAt: new Date().toISOString()
      }));
      await this.ctx.storage.put('sharedAccounts', accounts);
      return Response.json({ ok: true, accounts });
    }
    if (body.action === 'save-vault') {
      const vault = body.vault || {};
      const base64Url = (value, min, max) => typeof value === 'string' && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
      if (vault.version !== 1 || vault.kdf !== 'PBKDF2-SHA256' || !Number.isInteger(vault.iterations) || vault.iterations < 100000 || vault.iterations > 2000000 || !base64Url(vault.salt, 16, 64) || !base64Url(vault.iv, 12, 32) || !base64Url(vault.ciphertext, 16, 90000) || !['Luke', 'Charlotte'].includes(body.updatedBy)) {
        return Response.json({ error: 'That safe could not be saved.' }, { status: 400 });
      }
      const savedAt = new Date().toISOString();
      const existing = await this.ctx.storage.get('sharedVault');
      const saved = {
        version: 1,
        kdf: 'PBKDF2-SHA256',
        iterations: vault.iterations,
        salt: vault.salt,
        iv: vault.iv,
        ciphertext: vault.ciphertext,
        updatedBy: body.updatedBy,
        updatedAt: savedAt,
        createdAt: existing?.createdAt || savedAt
      };
      await this.ctx.storage.put('sharedVault', saved);
      return Response.json({ ok: true, vault: saved });
    }
    if (body.action === 'erase-vault') {
      await this.ctx.storage.delete('sharedVault');
      return Response.json({ ok: true });
    }
    if (body.action === 'get-youtube-client-id') {
      const saved = await this.ctx.storage.get('youtubeClientId') || '';
      const clientId = saved || '924567335912-jgilvjvqvlf3gos5qojngpdcnn7dcvbu.apps.googleusercontent.com';
      if (!saved) await this.ctx.storage.put('youtubeClientId', clientId);
      return Response.json({ ok: true, clientId });
    }
    if (body.action === 'set-youtube-client-id') {
      const clientId = String(body.clientId || '').trim();
      if (clientId && (!clientId.endsWith('.apps.googleusercontent.com') || clientId.length > 300)) return Response.json({ error: 'Enter a valid Google OAuth web client ID.' }, { status: 400 });
      await this.ctx.storage.put('youtubeClientId', clientId);
      return Response.json({ ok: true, clientId });
    }
    if (body.action === 'get-youtube-videos') {
      const videos = (await this.ctx.storage.get('youtubeVideos') || []).map(video => ({ ...video, albums: Array.isArray(video.albums) && video.albums.length ? video.albums : [video.album || 'General'] }));
      return Response.json({ ok: true, videos });
    }
    if (body.action === 'add-youtube-video') {
      const video = body.video || {};
      if (!/^[A-Za-z0-9_-]{11}$/.test(String(video.videoId || '')) || !['Luke', 'Charlotte'].includes(body.uploader)) return Response.json({ error: 'Invalid YouTube video.' }, { status: 400 });
      const videos = await this.ctx.storage.get('youtubeVideos') || [];
      if (videos.some(item => item.videoId === video.videoId)) return Response.json({ ok: true, video: videos.find(item => item.videoId === video.videoId), videos });
      if (videos.length >= 1000) return Response.json({ error: 'Our shared video list is full.' }, { status: 413 });
      const saved = {
        videoId: video.videoId,
        title: String(video.title || 'Our video').trim().slice(0, 100),
        description: String(video.description || '').trim().slice(0, 1000),
        uploader: body.uploader,
        uploadedAt: new Date().toISOString(),
        privacy: 'unlisted',
        albums: [typeof video.album === 'string' && video.album.trim() ? video.album.trim().slice(0, 80) : 'General']
      };
      videos.unshift(saved);
      await this.ctx.storage.put('youtubeVideos', videos);
      return Response.json({ ok: true, video: saved, videos });
    }
    if (body.action === 'move-youtube-video-to-album') {
      const videoId = String(body.videoId || '');
      const album = typeof body.album === 'string' ? body.album.trim().slice(0, 80) : '';
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !album || /[\\/\u0000-\u001f]/.test(album) || ['.', '..'].includes(album)) return Response.json({ error: 'Choose a valid video and album.' }, { status: 400 });
      const videos = await this.ctx.storage.get('youtubeVideos') || [];
      const video = videos.find(item => item.videoId === videoId);
      if (!video) return Response.json({ error: 'Video not found.' }, { status: 404 });
      const albums = Array.isArray(video.albums) && video.albums.length ? video.albums : [video.album || 'General'];
      video.albums = [...new Set([...albums, album])];
      delete video.album;
      await this.ctx.storage.put('youtubeVideos', videos);
      return Response.json({ ok: true, videos: videos.map(item => ({ ...item, albums: item.albums?.length ? item.albums : [item.album || 'General'] })) });
    }

    if (body.action === 'attempt-login') {
      const ip = String(body.ip || 'unknown').slice(0, 100);
      const user = String(body.user || 'unknown').slice(0, 20);
      const key = `login:${ip}:${user}`;
      const now = Date.now();
      const attempts = (await this.ctx.storage.get(key) || []).filter(time => now - time < 15 * 60 * 1000);
      if (attempts.length >= 8) return Response.json({ allowed: false });
      if (body.success === true) await this.ctx.storage.delete(key);
      else { attempts.push(now); await this.ctx.storage.put(key, attempts); }
      return Response.json({ allowed: true });
    }

    const now = Date.now();
    for (const [id, pending] of Object.entries(data.pendingUploads || {})) {
      if (now - pending.createdMs > 60 * 60 * 1000) delete data.pendingUploads[id];
    }
    if (body.action === 'begin-upload') {
      if (!body.upload || !['Charlotte', 'Luke'].includes(body.upload.user) || !/^photos\/[a-f0-9-]{36}\.[a-z0-9]{2,5}$/.test(body.upload.objectKey)) return Response.json({ error: 'Invalid upload reservation' }, { status: 400 });
      const rates = await this.ctx.storage.get(`gallery-upload-rate:${body.upload.user}`) || [];
      const recent = rates.filter(time => now - time < 24 * 60 * 60 * 1000);
      if (recent.length >= 25) return Response.json({ error: 'We have reached today’s photo upload limit. Try again tomorrow.' }, { status: 429 });
      const indexedBytes = [...new Map(data.photos.flatMap(photo => [[photo.objectKey, Number(photo.size) || 0], ...(photo.thumbnailObjectKey ? [[photo.thumbnailObjectKey, Number(photo.thumbnailSize) || 0]] : [])])).values()].reduce((sum, size) => sum + size, 0);
      const pendingBytes = Object.values(data.pendingUploads).reduce((sum, pending) => sum + (Number(pending.size) || 0) + (Number(pending.thumbnailSize) || 0), 0);
      const storageFloor = Math.max(indexedBytes, Number(body.bucketBytes) || 0);
      const newUploadBytes = (Number(body.upload.size) || 0) + (Number(body.upload.thumbnailSize) || 0);
      if (storageFloor + pendingBytes + newUploadBytes > 10_000_000_000) return Response.json({ error: 'This upload would take our bucket over the 10 GB free storage allowance. Remove files in Backblaze or wait for the monthly allowance to reset.' }, { status: 413 });
      data.pendingUploads[body.upload.id] = { ...body.upload, createdMs: now };
      await this.ctx.storage.put('galleryData', data);
      recent.push(now);
      await this.ctx.storage.put(`gallery-upload-rate:${body.upload.user}`, recent);
      const reservedBytes = Object.values(data.pendingUploads).reduce((sum, pending) => sum + (Number(pending.size) || 0) + (Number(pending.thumbnailSize) || 0), 0);
      return Response.json({ ok: true, reservedBytes });
    }
    if (body.action === 'complete-upload') {
      const pending = data.pendingUploads?.[body.uploadId];
      if (!pending || pending.user !== body.user) return Response.json({ error: 'Upload reservation not found.' }, { status: 404 });
      const existing = data.photos.find(photo => photo.id === body.photo?.id);
      if (!body.photo || body.photo.objectKey !== pending.objectKey || body.photo.size !== pending.size || body.photo.thumbnailObjectKey !== pending.thumbnailObjectKey || body.photo.thumbnailSize !== pending.thumbnailSize) return Response.json({ error: 'Upload details did not match the reservation.' }, { status: 400 });
      if (!existing && data.photos.length >= 1000) return Response.json({ error: 'The gallery index is full. Please contact support.' }, { status: 413 });
      if (!existing) data.photos.push({ ...body.photo, albums: [...new Set(pending.albums)], uploadedBy: pending.user, uploadedAt: pending.uploadedAt });
      delete data.pendingUploads[body.uploadId];
      await this.ctx.storage.put('galleryData', data);
      return Response.json({ ok: true, photo: existing || data.photos[data.photos.length - 1] });
    }
    if (body.action === 'register-google-photo') {
      const photo = body.photo || {};
      if (photo.provider !== 'google-photos' || !/^[A-Za-z0-9_-]{1,200}$/.test(String(photo.mediaItemId || '')) || !/^[a-f0-9-]{36}$/.test(String(photo.id || '')) || !['Luke', 'Charlotte'].includes(photo.uploadedBy) || !Number.isSafeInteger(photo.size) || photo.size < 1 || !Array.isArray(photo.albums) || !photo.albums.length || photo.albums.length > 20 || photo.albums.some(album => typeof album !== 'string' || !album.trim() || album.length > 80 || /[\\/\u0000-\u001f]/.test(album))) return Response.json({ error: 'Invalid Google Photos record.' }, { status: 400 });
      data.googlePhotos ||= [];
      const existing = data.googlePhotos.find(item => item.mediaItemId === photo.mediaItemId);
      if (!existing && data.photos.length + data.googlePhotos.length >= 1000) return Response.json({ error: 'Our gallery index is full.' }, { status: 413 });
      if (!existing) data.googlePhotos.push({ ...photo, albums: [...new Set(photo.albums.map(album => album.trim()))] });
      await this.ctx.storage.put('galleryData', data);
      return Response.json({ ok: true, photo: existing || data.googlePhotos[data.googlePhotos.length - 1] });
    }
    if (body.action === 'cancel-upload') {
      const pending = data.pendingUploads?.[body.uploadId];
      if (pending && pending.user !== body.user) return Response.json({ error: 'Upload reservation not found.' }, { status: 404 });
      if (pending) { delete data.pendingUploads[body.uploadId]; await this.ctx.storage.put('galleryData', data); }
      return Response.json({ ok: true, canceled: Boolean(pending), pending });
    }
    if (body.action === 'copy-to-album') {
      const photo = [...data.photos, ...(data.googlePhotos || [])].find(item => item.id === body.photoId);
      if (!photo || typeof body.album !== 'string' || !body.album.trim() || body.album.length > 80) return Response.json({ error: 'Photo or album not found.' }, { status: 404 });
      if (!(photo.albums || []).includes(body.album.trim()) && [...new Set([...data.photos, ...(data.googlePhotos || [])].flatMap(item => item.albums || []))].length >= 100) return Response.json({ error: 'The gallery already has 100 albums.' }, { status: 413 });
      photo.albums = [...new Set([...(photo.albums || []), body.album.trim()])];
      await this.ctx.storage.put('galleryData', data);
      return Response.json({ ok: true });
    }
    if (body.action === 'seed-migration') {
      if (!Array.isArray(body.photos) || body.photos.length > 1000) return Response.json({ error: 'Invalid migration manifest.' }, { status: 400 });
      if (body.photos.some(photo => !photo || !/^legacy-[a-f0-9]{64}$/.test(photo.id) || !/^photos\/legacy\/[a-f0-9]{64}$/.test(photo.objectKey) || !/^photos\/thumbnails\/[a-f0-9]{64}\.webp$/.test(photo.thumbnailObjectKey) || !Number.isSafeInteger(photo.size) || !Number.isSafeInteger(photo.thumbnailSize) || !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(photo.contentType) || !['Charlotte', 'Luke', 'Unknown'].includes(photo.uploadedBy) || typeof photo.album !== 'string' || photo.album.length > 80 || typeof photo.name !== 'string' || photo.name.length > 160 || typeof photo.uploadedAt !== 'string' || typeof photo.sha256 !== 'string' || typeof photo.thumbnailSha256 !== 'string')) return Response.json({ error: 'Invalid migration manifest.' }, { status: 400 });
      const known = new Set(data.photos.map(photo => photo.id));
      if (data.photos.length + new Set(body.photos.map(photo => photo.id).filter(id => !known.has(id))).size > 1000) return Response.json({ error: 'The gallery index cannot store this migration batch.' }, { status: 413 });
      let added = 0;
      for (const photo of body.photos) {
        if (known.has(photo.id)) continue;
        data.photos.push({ ...photo, albums: [photo.album] });
        known.add(photo.id);
        added++;
      }
      await this.ctx.storage.put('galleryData', data);
      return Response.json({ ok: true, added, total: data.photos.length });
    }
    return Response.json({ error: 'Unknown gallery metadata action.' }, { status: 400 });
  }


  async getQuestionData() {
    return await this.ctx.storage.get('questionData') || { schedule: null, questions: [], sessions: {}, responses: {} };
  }

  async getBathroomData() {
    const bathroom = await this.ctx.storage.get('bathroomData') || { status: {}, events: [] };
    bathroom.status ||= {};
    bathroom.events ||= [];
    if (!bathroom.stats?.daily || !bathroom.stats?.allTime) {
      const allTime = { Charlotte: 0, Luke: 0 };
      const daily = {};
      const seen = new Set();
      for (const event of bathroom.events) {
        if (event.action !== 'start' || !['Charlotte', 'Luke'].includes(event.user)) continue;
        if (event.addedLater) {
          const signature = `${event.user}:${event.action}:${Math.floor(Date.parse(event.at) / 60_000)}`;
          if (seen.has(signature)) continue;
          seen.add(signature);
        }
        const day = bathroomDayKey(event.at);
        allTime[event.user]++;
        daily[day] ||= { Charlotte: 0, Luke: 0 };
        daily[day][event.user]++;
      }
      bathroom.stats = { allTime, daily, baselineLimited: bathroom.events.length >= 250 };
      await this.ctx.storage.put('bathroomData', bathroom);
    }
    bathroom.stats.allTime.Charlotte ||= 0;
    bathroom.stats.allTime.Luke ||= 0;
    bathroom.stats.allTime.Charlotte = Number(bathroom.stats.allTime.Charlotte) || 0;
    bathroom.stats.allTime.Luke = Number(bathroom.stats.allTime.Luke) || 0;
    return bathroom;
  }

  recordBathroomEvent(bathroom, event) {
    bathroom.events.push(event);
    bathroom.events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    bathroom.events = bathroom.events.slice(0, 5000);
    if (event.action === 'start') {
      bathroom.stats.allTime[event.user] = (Number(bathroom.stats.allTime[event.user]) || 0) + 1;
      const day = bathroomDayKey(event.at);
      bathroom.stats.daily[day] ||= { Charlotte: 0, Luke: 0 };
      bathroom.stats.daily[day][event.user] = (Number(bathroom.stats.daily[day][event.user]) || 0) + 1;
    }
  }

  async getTruthDareData() {
    return await this.ctx.storage.get('truthDareData') || {
      rules: { maxDaresInRow: 3, dareAfterTruths: 5 },
      customPrompts: [], usedPrompts: [], history: [], current: null, pending: null,
      stats: { lastType: '', dareStreak: 0, truthsSinceDare: 0 }
    };
  }

  async getTruthDareView(user, storedData = null) {
    const data = storedData || await this.getTruthDareData();
    const online = (await this.getState('2000-01-02')).online;
    const bothOnline = online.includes('Charlotte') && online.includes('Luke');
    return {
      ...data,
      customPrompts: data.customPrompts.filter(item => item.author === user),
      current: bothOnline ? data.current || null : null,
      pending: data.pending || null
    };
  }

  getTruthDarePool(data, chooser, target, type, mode) {
    const modes = mode === 'both' ? ['text', 'call'] : [mode];
    const presets = modes.flatMap(promptMode => TRUTH_DARE_PROMPTS[promptMode][type].map((prompt, index) => ({
      id: `preset-${promptMode}-${type}-${index}`, prompt, type, mode: promptMode, preset: true
    })));
    const custom = data.customPrompts.filter(item => item.author === chooser && (item.assignedTo === target || (!item.assignedTo && item.author !== target)) && item.type === type && (mode === 'both' || item.mode === 'both' || item.mode === mode));
    return [...custom, ...presets];
  }

  async getPreferences(user) {
    const preferences = await this.ctx.storage.get('profilePreferences') || {};
    return {
      theme: 'blue', accent: '#347fa3',
      reminderLeadDays: 1, reminderTime: '09:00', textSize: 'normal',
      reducedMotion: false, compactLayout: false, showReactions: true, showPresence: true,
      homeLayout: 'calm', playfulExtras: true, darkMode: false,
      ...(preferences[user] || {}), birthdayReminders: true
    };
  }

  async getPlayfulState() {
    const state = await this.ctx.storage.get('playfulState') || {};
    return {
      tokens: { Charlotte: 0, Luke: 0, ...(state.tokens || {}) },
      finds: Array.isArray(state.finds) ? state.finds : []
    };
  }
  async getPlayfulPoints(user) {
    const all = await this.ctx.storage.get('playfulPoints') || {};
    return Math.max(0, Number(all[user]) || 0);
  }

  async savePlayfulPoints(user, points) {
    const all = await this.ctx.storage.get('playfulPoints') || {};
    all[user] = Math.max(0, Number(points) || 0);
    await this.ctx.storage.put('playfulPoints', all);
  }


  async getBouncyBallsState(user) {
    const all = await this.ctx.storage.get('bouncyBallsState') || {};
    const s = all[user] || {};
    return {
      tokens: Math.max(0, Number(s.tokens) || 0),
      spawnBatch: Math.max(1, Math.min(12, Number(s.spawnBatch) || 1)),
      upgradeCost: Math.max(5, Number(s.upgradeCost) || 5),
      collected: Math.max(0, Number(s.collected) || 0),
      wave: Math.max(1, Number(s.wave) || 1),
      waveRemaining: Math.max(0, Math.min(40, Number(s.waveRemaining) || 40)),
      pile: Array.isArray(s.pile) ? s.pile.slice(0, 80) : []
    };
  }

  async saveBouncyBallsState(user, state) {
    const all = await this.ctx.storage.get('bouncyBallsState') || {};
    all[user] = {
      tokens: Math.max(0, Number(state.tokens) || 0),
      spawnBatch: Math.max(1, Math.min(12, Number(state.spawnBatch) || 1)),
      upgradeCost: Math.max(5, Number(state.upgradeCost) || 5),
      collected: Math.max(0, Number(state.collected) || 0),
      wave: Math.max(1, Number(state.wave) || 1),
      waveRemaining: Math.max(0, Math.min(40, Number(state.waveRemaining) || 40)),
      pile: Array.isArray(state.pile) ? state.pile.slice(0, 80) : []
    };
    await this.ctx.storage.put('bouncyBallsState', all);
  }

  async getLoveTasks() {
    const state = await this.ctx.storage.get('loveTasks') || {};
    return { tasks: Array.isArray(state.tasks) ? state.tasks : [] };
  }

  async mutateQuestions(request) {
    try {
      const body = await request.json();
      if (body.action === 'truth-dare') return this.mutateTruthDare(body);
      if (body.action === 'preferences') {
        const user = body.user;
        if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
        const allowedThemes = ['blue', 'midnight', 'lavender', 'sage', 'sunset'];
        const theme = allowedThemes.includes(body.preferences?.theme) ? body.preferences.theme : '';
        const accent = /^#[0-9a-fA-F]{6}$/.test(String(body.preferences?.accent || '')) ? body.preferences.accent : '';
        const reminderLeadDays = Number(body.preferences?.reminderLeadDays);
        const reminderTime = String(body.preferences?.reminderTime || '');
        const textSize = ['normal', 'large'].includes(body.preferences?.textSize) ? body.preferences.textSize : '';
        const homeLayout = ['calm', 'doors'].includes(body.preferences?.homeLayout) ? body.preferences.homeLayout : 'calm';
        const playfulExtras = body.preferences?.playfulExtras !== false;
        if (!theme || !accent || ![0, 1, 3, 7, 14].includes(reminderLeadDays) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime) || !textSize) return Response.json({ error: 'Choose a valid theme, accent, text size, and reminder time.' }, { status: 400 });
        const all = await this.ctx.storage.get('profilePreferences') || {};
        all[user] = {
          theme, accent, birthdayReminders: true, reminderLeadDays, reminderTime, textSize, homeLayout, playfulExtras,
          reducedMotion: Boolean(body.preferences?.reducedMotion), compactLayout: Boolean(body.preferences?.compactLayout),
          showReactions: body.preferences?.showReactions !== false, showPresence: body.preferences?.showPresence !== false,
          darkMode: Boolean(body.preferences?.darkMode)
        };
        await this.ctx.storage.put('profilePreferences', all);
        await this.broadcastRefresh();
        return Response.json({ ok: true, preferences: all[user] });
      }
      if (body.action === 'dark-mode') {
        const user = body.user;
        if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
        const all = await this.ctx.storage.get('profilePreferences') || {};
        if (!all[user]) all[user] = {};
        all[user].darkMode = Boolean(body.darkMode);
        await this.ctx.storage.put('profilePreferences', all);
        await this.broadcastRefresh();
        return Response.json({ ok: true, darkMode: all[user].darkMode });
      }
        const user = body.user;
        if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
        const state = await this.getPlayfulState();
        const rare = Boolean(body.rare);
        const amount = rare ? 3 : 1;
        state.tokens[user] = (state.tokens[user] || 0) + amount;
        state.finds.push({ user, emoji: String(body.emoji || ''), rare, at: new Date().toISOString() });
        if (state.finds.length > 500) state.finds = state.finds.slice(-500);
        await this.ctx.storage.put('playfulState', state);
        await this.broadcastRefresh();
        return Response.json({ ok: true, state });
      }
      if (body.action === 'playful-spend') {
        const user = body.user;
        const amount = Number(body.amount);
        if (!['Charlotte', 'Luke'].includes(user) || ![1, 2, 3, 5, 10].includes(amount)) return Response.json({ error: 'Choose a valid spend' }, { status: 400 });
        const state = await this.getPlayfulState();
        if ((state.tokens[user] || 0) < amount) return Response.json({ error: 'Not enough tokens' }, { status: 400 });
        state.tokens[user] -= amount;
        await this.ctx.storage.put('playfulState', state);
        await this.broadcastRefresh();
        return Response.json({ ok: true, state });
      }
      if (body.action === 'playful-award') {
        const user = body.user;
        const amount = Number(body.amount);
        if (!['Charlotte', 'Luke'].includes(user) || !Number.isFinite(amount) || amount < 1 || amount > 50) return Response.json({ error: 'Choose a valid award' }, { status: 400 });
        const state = await this.getPlayfulState();
        state.tokens[user] = (state.tokens[user] || 0) + Math.floor(amount);
        await this.ctx.storage.put('playfulState', state);
        await this.broadcastRefresh();
        return Response.json({ ok: true, state });
      }
      if (body.action === 'playful-points') {
        const user = body.user;
        const points = Number(body.points);
        if (!['Charlotte', 'Luke'].includes(user) || !Number.isFinite(points) || points < 0) return Response.json({ error: 'Choose a valid points value' }, { status: 400 });
        await this.savePlayfulPoints(user, points);
        return Response.json({ ok: true, points: await this.getPlayfulPoints(user) });
      }
      if (body.action === 'bouncy-balls') {
        const user = body.user;
        if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
        const incoming = body.state && typeof body.state === 'object' ? body.state : {};
        await this.saveBouncyBallsState(user, incoming);
        return Response.json({ ok: true, state: await this.getBouncyBallsState(user) });
      }

      if (body.action === 'love-buy') {
  const user = body.user;

  if (!['Charlotte', 'Luke'].includes(user)) {
    return Response.json(
      { error: 'Choose a valid account' },
      { status: 400 }
    );
  }

  const item = String(body.item || '').trim();
  const cost = Number(body.cost);

  if (!item || !Number.isFinite(cost) || cost < 1 || cost > 1000) {
    return Response.json(
      { error: 'Choose a valid item' },
      { status: 400 }
    );
  }

  // Validate date properly.
  const dueDate = String(body.dueDate || '').trim();

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);

  if (!match) {
    return Response.json(
      { error: 'Choose a valid date', received: dueDate },
      { status: 400 }
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return Response.json(
      { error: 'Choose a valid calendar date', received: dueDate },
      { status: 400 }
    );
  }

  // Check token balance.
  const state = await this.getPlayfulState();

  if ((state.tokens[user] || 0) < cost) {
    return Response.json(
      { error: 'Not enough tokens' },
      { status: 400 }
    );
  }

  // Deduct tokens.
  state.tokens[user] -= cost;
  await this.ctx.storage.put('playfulState', state);

  // Create promise.
  const assignee = user === 'Charlotte' ? 'Luke' : 'Charlotte';

  const tasksState = await this.getLoveTasks();

  const task = {
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()),

    item,
    buyer: user,
    assignee,
    dueDate,
    dueTime: String(body.dueTime || '').trim(),
    note: String(body.note || '').trim(),
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  tasksState.tasks.push(task);

  await this.ctx.storage.put('loveTasks', tasksState);
  await this.broadcastRefresh();

  return Response.json({
    ok: true,
    task,
    state
  });
}
      if (body.action === 'love-complete') {
        const user = body.user;
        const id = String(body.id || '');
        if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose a valid account' }, { status: 400 });
        const tasksState = await this.getLoveTasks();
        const task = tasksState.tasks.find(t => t.id === id);
        if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });
        if (task.assignee !== user) return Response.json({ error: 'Only the assigned person can complete this' }, { status: 403 });
        task.status = 'done';
        task.completedAt = new Date().toISOString();
        await this.ctx.storage.put('loveTasks', tasksState);
        await this.broadcastRefresh();
        return Response.json({ ok: true, task });
      }

      const data = await this.getQuestionData();
      if (body.action === 'bathroom') {
        const user = body.user;
        if (!['Charlotte', 'Luke'].includes(user)) return Response.json({ error: 'Choose our own profile to save a check-in' }, { status: 403 });
        const bathroom = await this.getBathroomData();
        const active = Boolean(body.active);
        const previous = bathroom.status[user] || { active: false };
        const openHistory = bathroomHasOpenBreak(bathroom.events, user);
        const shouldRecordReturn = !active && !previous.active && openHistory;
        if (Boolean(previous.active) !== active || shouldRecordReturn) {
          const at = new Date().toISOString();
          const newEvent = { id: crypto.randomUUID(), user, action: active ? 'start' : 'return', at };
          bathroom.status[user] = active ? { active: true, startedAt: at } : { active: false, startedAt: null, returnedAt: at };
          this.recordBathroomEvent(bathroom, newEvent);
          await this.ctx.storage.put('bathroomData', bathroom);
          await this.broadcastBathroom(bathroom, newEvent);
          return Response.json({ ok: true, bathroom: { status: bathroom.status, stats: bathroom.stats }, event: newEvent });
        }
        return Response.json({ ok: true, bathroom: { status: bathroom.status, stats: bathroom.stats } });
      } else if (body.action === 'bathroom-history-session') {
        const user = body.user;
        const startAt = new Date(body.startAt || '');
        const returnAt = body.returnAt ? new Date(body.returnAt) : null;
        const lowerBound = Date.now() - 10 * 365 * 24 * 60 * 60 * 1000;
        if (!['Charlotte', 'Luke'].includes(user) || Number.isNaN(startAt.getTime()) || startAt.getTime() > Date.now() + 5 * 60 * 1000 || startAt.getTime() < lowerBound || (returnAt && (Number.isNaN(returnAt.getTime()) || returnAt.getTime() <= startAt.getTime() || returnAt.getTime() > Date.now() + 5 * 60 * 1000 || returnAt.getTime() < lowerBound))) {
          return Response.json({ error: 'Choose a valid time for when we left and, if known, when we got back.' }, { status: 400 });
        }
        const bathroom = await this.getBathroomData();
        const duplicateAt = (action, time) => bathroom.events.some(event => event.user === user && event.action === action && Math.floor(Date.parse(event.at) / 60_000) === Math.floor(time.getTime() / 60_000));
        if (duplicateAt('start', startAt) || (returnAt && duplicateAt('return', returnAt))) return Response.json({ ok: true, duplicate: true, bathroom: { status: bathroom.status, stats: bathroom.stats } });
        const newEvents = [];
        const startEvent = { id: crypto.randomUUID(), user, action: 'start', at: startAt.toISOString(), addedLater: true };
        this.recordBathroomEvent(bathroom, startEvent);
        newEvents.push(startEvent);
        if (returnAt) {
          const returnEvent = { id: crypto.randomUUID(), user, action: 'return', at: returnAt.toISOString(), addedLater: true };
          this.recordBathroomEvent(bathroom, returnEvent);
          newEvents.push(returnEvent);
        }
        await this.ctx.storage.put('bathroomData', bathroom);
        await this.broadcastBathroom(bathroom, newEvents.length === 1 ? newEvents[0] : newEvents);
        return Response.json({ ok: true, bathroom: { status: bathroom.status, stats: bathroom.stats }, events: newEvents });
      } else if (body.action === 'bathroom-history') {
        const user = body.user;
        const action = body.eventAction === 'return' ? 'return' : body.eventAction === 'start' ? 'start' : '';
        const at = new Date(body.at || '');
        if (!['Charlotte', 'Luke'].includes(user) || !action || Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60 * 1000 || at.getTime() < Date.now() - 10 * 365 * 24 * 60 * 60 * 1000) {
          return Response.json({ error: 'Choose whether we stepped away or came back, and enter a valid recent date and time.' }, { status: 400 });
        }
        const bathroom = await this.getBathroomData();
        const atIso = at.toISOString();
        const duplicate = bathroom.events.some(event => event.user === user && event.action === action && Math.floor(Date.parse(event.at) / 60_000) === Math.floor(at.getTime() / 60_000));
        if (duplicate) return Response.json({ ok: true, duplicate: true, bathroom: { status: bathroom.status, stats: bathroom.stats } });
        const newEvent = { id: crypto.randomUUID(), user, action, at: atIso, addedLater: true };
        this.recordBathroomEvent(bathroom, newEvent);
        await this.ctx.storage.put('bathroomData', bathroom);
        await this.broadcastBathroom(bathroom, newEvent);
        return Response.json({ ok: true, bathroom: { status: bathroom.status, stats: bathroom.stats }, event: newEvent });
      } else if (body.action === 'configure') {
        const day = Number(body.day);
        if (!Number.isInteger(day) || day < 0 || day > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.openTime || ''))) return Response.json({ error: 'Choose a valid opening day and time' }, { status: 400 });
        data.schedule = { day, time: body.openTime, configuredAt: new Date().toISOString() };
      } else if (body.action === 'add') {
        const text = typeof body.question === 'string' ? body.question.trim().slice(0, 300) : '';
        const author = body.author;
        if (!text || !['Charlotte', 'Luke'].includes(author)) return Response.json({ error: 'Write a question for our next night' }, { status: 400 });
        if (data.questions.length >= 500) return Response.json({ error: 'The question bank is full' }, { status: 400 });
        data.questions.unshift({ id: crypto.randomUUID(), body: text, author, recipient: author === 'Charlotte' ? 'Luke' : 'Charlotte', createdAt: new Date().toISOString() });
      } else if (body.action === 'delete') {
        const index = data.questions.findIndex(item => item.id === body.id);
        if (index < 0) return Response.json({ error: 'Question not found' }, { status: 404 });
        if (data.questions[index].author !== body.author) return Response.json({ error: 'That question belongs to the other person’s private list' }, { status: 403 });
        data.questions.splice(index, 1);
      } else if (body.action === 'draw') {
        const date = String(body.sessionDate || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(await this.getState(date)).open) return Response.json({ error: 'We both need to be online and ready first' }, { status: 423 });
        const session = data.sessions[date] || { questionIds: [], questions: {} };
        session.questions = session.questions || {};
        const pool = {
          Charlotte: data.questions.filter(item => item.author === 'Charlotte' && !session.questionIds.includes(item.id)),
          Luke: data.questions.filter(item => item.author === 'Luke' && !session.questionIds.includes(item.id))
        };
        const initialRound = !session.questionIds.length;
        const perPerson = initialRound ? 3 : 1;
        if (initialRound && (pool.Charlotte.length < 3 || pool.Luke.length < 3)) return Response.json({ error: 'We each need at least three questions before we start' }, { status: 400 });
        if (!initialRound && (!pool.Charlotte.length || !pool.Luke.length)) return Response.json({ error: 'We each need another unused question before drawing a pair' }, { status: 400 });
        const selected = ['Charlotte', 'Luke'].flatMap(author => pool[author].sort(() => Math.random() - .5).slice(0, Math.min(perPerson, pool[author].length)));
        if (!selected.length) return Response.json({ error: 'There are no unused questions left for this night' }, { status: 400 });
        selected.forEach(item => { session.questionIds.push(item.id); session.questions[item.id] = { body: item.body, author: item.author }; });
        data.sessions[date] = session;
      } else if (body.action === 'answer') {
        const date = String(body.sessionDate || ''), questionId = String(body.questionId || '');
        if (!(await this.getState(date)).open) return Response.json({ error: 'We both need to be online and ready first' }, { status: 423 });
        const session = data.sessions[date];
        if (!session?.questionIds.includes(questionId)) return Response.json({ error: 'Question session not found' }, { status: 404 });
        const savedQuestion = session.questions?.[questionId];
        const questionAuthor = (typeof savedQuestion === 'object' && savedQuestion?.author) || data.questions.find(item => item.id === questionId)?.author;
        const author = body.author, answer = typeof body.response === 'string' ? body.response.trim().slice(0, 1200) : '';
        if (!answer || !['Charlotte', 'Luke'].includes(author)) return Response.json({ error: 'Add an answer before saving it' }, { status: 400 });
        if (questionAuthor && author === questionAuthor) return Response.json({ error: 'The person who wrote the question asks it; their partner answers' }, { status: 403 });
        data.responses[date] = data.responses[date] || {};
        data.responses[date][questionId] = data.responses[date][questionId] || {};
        data.responses[date][questionId][author] = { text: answer, answeredAt: new Date().toISOString() };
      } else return Response.json({ error: 'Unknown question-room action' }, { status: 400 });

      await this.ctx.storage.put('questionData', data);
      await this.broadcastRefresh();
      return Response.json({ ok: true });
    } catch (error) {
      return Response.json({ error: error.message || 'Could not save the question room' }, { status: 500 });
    }
  }

  async mutateTruthDare(body) {
    const data = await this.getTruthDareData();
    const user = ['Charlotte', 'Luke'].includes(body.user) ? body.user : '';
    if (!user) return Response.json({ error: 'Choose our own profile first' }, { status: 400 });
    if (body.operation === 'rules') {
      const maxDaresInRow = Number(body.rules?.maxDaresInRow);
      const dareAfterTruths = Number(body.rules?.dareAfterTruths);
      if (!Number.isInteger(maxDaresInRow) || maxDaresInRow < 1 || maxDaresInRow > 10 || !Number.isInteger(dareAfterTruths) || dareAfterTruths < 1 || dareAfterTruths > 20) {
        return Response.json({ error: 'Rules must be between 1 and 10 dares in a row, and 1 and 20 truths between dares.' }, { status: 400 });
      }
      data.rules = { maxDaresInRow, dareAfterTruths };
    } else if (body.operation === 'add-prompt') {
      const prompt = String(body.prompt || '').trim().slice(0, 300);
      const type = body.promptType === 'dare' ? 'dare' : body.promptType === 'truth' ? 'truth' : '';
      const mode = ['text', 'call', 'both'].includes(body.mode) ? body.mode : '';
      if (!prompt || !type || !mode) return Response.json({ error: 'Add a truth or dare and choose text, call, or both.' }, { status: 400 });
      if (data.customPrompts.length >= 300) return Response.json({ error: 'Our custom prompt list is full.' }, { status: 400 });
      data.customPrompts.unshift({ id: crypto.randomUUID(), prompt, type, mode, author: user, assignedTo: user === 'Charlotte' ? 'Luke' : 'Charlotte', createdAt: new Date().toISOString() });
    } else if (body.operation === 'remove-prompt') {
      const index = data.customPrompts.findIndex(item => item.id === body.id);
      if (index < 0) return Response.json({ error: 'Custom prompt not found.' }, { status: 404 });
      if (data.customPrompts[index].author !== user) return Response.json({ error: 'Only the person who added a prompt can remove it.' }, { status: 403 });
      data.customPrompts.splice(index, 1);
    } else if (body.operation === 'request-prompt') {
      const mode = ['text', 'call', 'both'].includes(body.mode) ? body.mode : '';
      const type = body.promptType === 'dare' ? 'dare' : body.promptType === 'truth' ? 'truth' : '';
      if (!mode || !type) return Response.json({ error: 'Choose text, call, or both, then truth or dare.' }, { status: 400 });
      const online = (await this.getState('2000-01-02')).online;
      if (!online.includes('Charlotte') || !online.includes('Luke')) return Response.json({ error: 'We both need to be online before we draw a prompt.' }, { status: 423 });
      if (data.pending) return Response.json({ error: 'We already have a prompt waiting for the other person to choose.' }, { status: 409 });
      const { maxDaresInRow, dareAfterTruths } = data.rules;
      if (type === 'dare' && data.stats.dareStreak >= maxDaresInRow) return Response.json({ error: `Let’s do a truth before another dare (our limit is ${maxDaresInRow} dares in a row).` }, { status: 409 });
      if (type === 'truth' && data.stats.truthsSinceDare >= dareAfterTruths) return Response.json({ error: `Our rule says to choose at least one dare every ${dareAfterTruths} truths.` }, { status: 409 });
      const chooser = user === 'Charlotte' ? 'Luke' : 'Charlotte';
      const pool = this.getTruthDarePool(data, chooser, user, type, mode);
      const unusedPool = pool.filter(item => !data.usedPrompts.includes(item.id));
      if (!unusedPool.length) {
        const ids = new Set(pool.map(item => item.id));
        data.usedPrompts = data.usedPrompts.filter(id => !ids.has(id));
      }
      data.current = null;
      data.pending = { id: crypto.randomUUID(), requestedBy: user, assignedTo: user, chooser, type, mode, createdAt: new Date().toISOString() };
    } else if (body.operation === 'select-prompt') {
      const pending = data.pending;
      if (!pending) return Response.json({ error: 'There is no prompt waiting for us to choose.' }, { status: 404 });
      if (pending.chooser !== user) return Response.json({ error: 'This prompt is for the other person to choose.' }, { status: 403 });
      const online = (await this.getState('2000-01-02')).online;
      if (!online.includes('Charlotte') || !online.includes('Luke')) return Response.json({ error: 'We both need to be in the game room to choose a prompt.' }, { status: 423 });
      const { maxDaresInRow, dareAfterTruths } = data.rules;
      if (pending.type === 'dare' && data.stats.dareStreak >= maxDaresInRow) return Response.json({ error: `Let’s do a truth before another dare (our limit is ${maxDaresInRow} dares in a row).` }, { status: 409 });
      if (pending.type === 'truth' && data.stats.truthsSinceDare >= dareAfterTruths) return Response.json({ error: `Our rule says to choose at least one dare every ${dareAfterTruths} truths.` }, { status: 409 });
      const pool = this.getTruthDarePool(data, user, pending.requestedBy, pending.type, pending.mode);
      let selected;
      if (body.random === true) {
        let available = pool.filter(item => !data.usedPrompts.includes(item.id));
        if (!available.length) {
          const ids = new Set(pool.map(item => item.id));
          data.usedPrompts = data.usedPrompts.filter(id => !ids.has(id));
          available = pool;
        }
        selected = available[Math.floor(Math.random() * available.length)];
      } else {
        selected = pool.find(item => item.id === body.promptId);
        if (selected && data.usedPrompts.includes(selected.id)) return Response.json({ error: 'That prompt was already used this round. Choose another one or let us pick randomly.' }, { status: 409 });
      }
      if (!selected) return Response.json({ error: 'That prompt is not available for this round.' }, { status: 404 });
      data.usedPrompts.push(selected.id);
      data.stats.lastType = pending.type;
      data.stats.dareStreak = pending.type === 'dare' ? data.stats.dareStreak + 1 : 0;
      data.stats.truthsSinceDare = pending.type === 'truth' ? data.stats.truthsSinceDare + 1 : 0;
      data.history.unshift({ id: crypto.randomUUID(), promptId: selected.id, prompt: selected.prompt, type: pending.type, mode: selected.mode, by: pending.requestedBy, assignedTo: pending.assignedTo, pickedBy: user, addedBy: selected.author || '', source: selected.preset ? 'preset' : 'custom', at: new Date().toISOString() });
      data.history = data.history.slice(0, 100);
      data.current = data.history[0];
      data.pending = null;
    } else if (body.operation === 'draw') {
      return Response.json({ error: 'Ask the other person to choose a prompt first.' }, { status: 400 });
    } else if (body.operation === 'clear-current') {
      data.current = null;
    } else return Response.json({ error: 'Unknown Truth or Dare action.' }, { status: 400 });

    await this.ctx.storage.put('truthDareData', data);
    await this.broadcastRefresh();
    return Response.json({ ok: true, data: await this.getTruthDareView(user, data) });
  }

  async webSocketMessage(socket, message) {
    let payload;
    try { payload = JSON.parse(message); } catch { return; }
    const attachment = socket.deserializeAttachment();
    if (!attachment) return;
    if (payload.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
      await this.broadcastMusic();
      return;
    }
    if (payload.type === 'ready') {
      const ready = await this.ctx.storage.get(`ready:${attachment.sessionDate}`) || {};
      ready[attachment.user] = Boolean(payload.ready);
      await this.ctx.storage.put(`ready:${attachment.sessionDate}`, ready);
      await this.broadcast(attachment.sessionDate);
    }
    if (payload.type === 'reaction') {
      const emoji = String(payload.emoji || '').slice(0, 12);
      if (emoji) await this.broadcastReaction({ type: 'reaction', emoji, user: attachment.user, id: crypto.randomUUID(), sentAt: Date.now() });
    }
    if (payload.type === 'music') {
      const music = {
        trackId: String(payload.trackId || ''),
        position: Math.max(0, Number(payload.position) || 0),
        paused: Boolean(payload.paused),
        user: attachment.user,
        updatedAt: Date.now()
      };
      await this.ctx.storage.put('sharedMusic', music);
      await this.broadcastMusic();
    }
    if (payload.type === 'spotify-playlist') {
      let playlist = '';
      try {
        const url = new URL(String(payload.url || ''));
        const match = url.hostname === 'open.spotify.com' && url.pathname.match(/^\/playlist\/([A-Za-z0-9]+)\/?$/);
        if (match) playlist = `https://open.spotify.com/playlist/${match[1]}`;
      } catch { /* invalid playlist link */ }
      if (playlist) {
        await this.ctx.storage.put('spotifyPlaylist', playlist);
        await this.broadcastSpotifyPlaylist(playlist);
      }
    }
    if (payload.type === 'spotify-play-request') {
      await this.broadcastSpotifyPlayback({ type: 'spotify-play-request', user: attachment.user });
    }
    if (payload.type === 'game-move') {
      const game = String(payload.game || '').slice(0, 30);
      const move = payload.move && typeof payload.move === 'object' ? payload.move : {};
      if (game) {
        await this.broadcastGameMove({ type: 'game-move', game, user: attachment.user, move, sentAt: Date.now() });
      }
      return;
    }
    if (payload.type === 'game-reset') {
      const game = String(payload.game || '').slice(0, 30);
      if (game) {
        await this.broadcastGameMove({ type: 'game-reset', game, user: attachment.user, sentAt: Date.now() });
      }
      return;
    }
    if (payload.type === 'spotify-playback') {
      const music = {
        trackId: String(payload.track || '').slice(0, 200),
        position: Math.min(86400, Math.max(0, Number(payload.position) || 0)),
        paused: !Boolean(payload.playing),
        user: attachment.user,
        updatedAt: Date.now()
      };
      await this.ctx.storage.put('sharedMusic', music);
      await this.broadcastSpotifyPlayback({
        type: 'spotify-playback',
        ...music,
        playing: !music.paused,
        track: music.trackId
      });
    }
    if (payload.type === 'refresh') {
      await this.broadcast(attachment.sessionDate);
      await this.broadcastRefresh();
    }
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment();
    if (!attachment) return;
    const ready = await this.ctx.storage.get(`ready:${attachment.sessionDate}`) || {};
    ready[attachment.user] = false;
    await this.ctx.storage.put(`ready:${attachment.sessionDate}`, ready);
    await this.broadcast(attachment.sessionDate);
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }

  async getState(sessionDate) {
    const online = new Set();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment && attachment.sessionDate === sessionDate) online.add(attachment.user);
    }
    const ready = await this.ctx.storage.get(`ready:${sessionDate}`) || {};
    const bothOnline = online.has('Charlotte') && online.has('Luke');
    const open = bothOnline && ready.Charlotte === true && ready.Luke === true;
    const music = await this.ctx.storage.get('sharedMusic') || { trackId: '', position: 0, paused: true, user: '', updatedAt: Date.now() };
    const spotifyPlaylist = await this.ctx.storage.get('spotifyPlaylist') || DEFAULT_SPOTIFY_PLAYLIST;
    return { type: 'state', sessionDate, online: [...online], ready, open, music, spotifyPlaylist };
  }

  async broadcast(sessionDate) {
    const state = JSON.stringify(await this.getState(sessionDate));
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment && attachment.sessionDate === sessionDate) {
        try { socket.send(state); } catch { /* closed socket */ }
      }
    }
  }

  async broadcastMusic() {
    const music = await this.ctx.storage.get('sharedMusic');
    const message = JSON.stringify({ type: 'music', music });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* closed socket */ }
    }
  }

  async broadcastSpotifyPlaylist(url) {
    const message = JSON.stringify({ type: 'spotify-playlist', url });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* closed socket */ }
    }
  }

  async broadcastSpotifyPlayback(state) {
    const message = JSON.stringify(state);
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* closed socket */ }
    }
  }

  async broadcastBathroom(bathroom, event = null) {
    const message = JSON.stringify({ type: 'bathroom', status: bathroom.status, stats: bathroom.stats, event });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* closed socket */ }
    }
  }

  async broadcastRefresh() {
    const message = JSON.stringify({ type: 'refresh' });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* closed socket */ }
    }
  }

  async broadcastGameMove(msg) {
    const message = JSON.stringify(msg);
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* closed socket */ }
    }
  }
}

export default {
  async fetch(request, env) {
    const id = env.QUESTION_ROOM.idFromName('charlotte-question-night');
    return env.QUESTION_ROOM.get(id).fetch(request);
  }
};
