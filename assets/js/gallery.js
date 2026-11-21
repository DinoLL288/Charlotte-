(() => {
  const form = document.getElementById('uploadForm');
  const input = document.getElementById('photoInput');
  const filename = document.getElementById('selectedFileName');
  const uploadButton = document.getElementById('uploadBtn');
  const status = document.getElementById('uploadStatus');
  const folderCheckboxes = document.getElementById('folderCheckboxes');
  const folderInput = document.getElementById('newFolderInput');
  const createFolder = document.getElementById('createFolderBtn');
  const folderView = document.getElementById('folderView');
  const albumFilters = document.getElementById('albumFilters');
  const search = document.getElementById('photoSearch');
  const uploadCard = document.getElementById('uploadCard');
  let user = '';
  let folders = [];
  let photos = [];
  let videos = [];
  let visiblePhotos = [];
  let visibleItems = [];
  let activeAlbum = 'all';
  let viewMode = 'all';
  let currentIndex = 0;
  let signedAt = 0;
  let refreshPromise = null;
  let googleAccessToken = '';
  let googleTokenExpiresAt = 0;
  let googleGrantedScopes = '';
  let googleTokenClient = null;
  let googleClientIdPromise = null;
  let googlePendingRequest = null;
  const googlePhotosScopes = 'https://www.googleapis.com/auth/photoslibrary.appendonly https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata';
  const googleConnectButton = document.getElementById('googlePhotosConnect');
  const googleStatus = document.getElementById('googlePhotosStatus');

  function setGoogleStatus(message, tone = 'info') {
    if (!googleStatus) return;
    googleStatus.textContent = message || '';
    googleStatus.dataset.tone = tone;
  }
  function googleAuthMessage(code, detail) {
    switch (code) {
      case 'popup_closed': return 'Google sign-in was closed before it finished. Try Connect our shared Google Photos again.';
      case 'popup_failed_to_open': return 'This browser blocked Google’s sign-in window. Allow pop-ups for this site, then try again.';
      case 'access_denied': return 'Google did not allow access. Add the shared account (secretdino.ll27) as a test user on the OAuth consent screen, or submit the app for verification, then try again.';
      case 'invalid_scope': return 'The Google app is not allowed to use the Photos scopes yet. Add photoslibrary.appendonly and photoslibrary.readonly.appcreateddata to the OAuth consent screen, then try again.';
      case 'origin_mismatch': return 'This website is not an authorised JavaScript origin for the Google OAuth client. Add it in Google Cloud Console, then try again.';
      case 'idpiframe_initialization_failed': return 'Google sign-in could not start in this browser. Third-party cookies may be blocked for this site.';
      case 'interaction_required': return 'Google needs you to sign in again before it can connect our shared account.';
      default: return `Google sign-in did not finish${code ? ` (${code})` : ''}.${detail ? ` ${detail}` : ''}`;
    }
  }

  const escapeHtml = value => { const el = document.createElement('span'); el.textContent = value || ''; return el.innerHTML; };
  const albumName = name => name === 'Old Photos' ? 'Older photos' : name === 'General' ? 'Our memories' : name;
  const photoDate = photo => {
    if (photo.uploadedAt && !Number.isNaN(Date.parse(photo.uploadedAt))) return new Date(photo.uploadedAt);
    const stamp = Number((photo.name || '').match(/^(\d{13})-/)?.[1]);
    return stamp ? new Date(stamp) : null;
  };
  const groupKey = photo => { const date = photoDate(photo); return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : 'undated'; };
  const groupLabel = key => key === 'undated' ? 'A little while ago' : new Date(`${key}-01T12:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' });

  async function waitForGoogleIdentity() {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (window.google?.accounts?.oauth2) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Google sign-in did not load. Please refresh and try again.');
  }
  async function getGoogleClientId() {
    if (!googleClientIdPromise) {
      googleClientIdPromise = fetch('/api/youtube-config', { credentials: 'same-origin', cache: 'no-store' })
        .then(async response => {
          const config = await response.json().catch(() => ({}));
          if (!response.ok || !config.clientId) throw new Error(config.error || 'Google Photos sign-in is not configured yet.');
          return config.clientId;
        })
        .catch(error => { googleClientIdPromise = null; throw error; });
    }
    return googleClientIdPromise;
  }
  async function getGoogleTokenClient() {
    if (googleTokenClient) return googleTokenClient;
    await waitForGoogleIdentity();
    const clientId = await getGoogleClientId();
    if (!googleTokenClient) {
      googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: googlePhotosScopes,
        // Replaced for every request below. Keeping the handlers present means a
        // cancelled or blocked popup always rejects instead of hanging forever.
        callback: () => {},
        error_callback: () => {}
      });
    }
    return googleTokenClient;
  }
  async function getGoogleAccessToken(prompt = '', options = {}) {
    if (!options.force && googleAccessToken && Date.now() < googleTokenExpiresAt - 60_000) return googleAccessToken;
    if (googlePendingRequest) return googlePendingRequest;
    const client = await getGoogleTokenClient();
    let pending;
    pending = new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(reject, new Error('Google sign-in did not finish in time. Check that pop-ups are allowed, then try again.')), 120_000);
      function finish(settle, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (googlePendingRequest === pending) googlePendingRequest = null;
        settle(value);
      }
      client.callback = response => {
        if (response?.error || !response?.access_token) { finish(reject, new Error(googleAuthMessage(response?.error, response?.error_description))); return; }
        googleAccessToken = response.access_token;
        googleTokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
        googleGrantedScopes = response.scope || '';
        finish(resolve, googleAccessToken);
      };
      client.error_callback = error => finish(reject, new Error(googleAuthMessage(error?.type, error?.message)));
      try { client.requestAccessToken({ prompt }); }
      catch (error) { finish(reject, new Error(`Google sign-in could not start. ${error?.message || ''}`.trim())); }
    });
    googlePendingRequest = pending;
    return pending;
  }
  function resetGoogleConnection(label = 'Connect our shared Google Photos') {
    googleAccessToken = '';
    googleTokenExpiresAt = 0;
    googleGrantedScopes = '';
    photos.forEach(photo => { if (photo.provider === 'google-photos') { photo.url = ''; photo.fullUrl = ''; } });
    if (googleConnectButton) googleConnectButton.textContent = label;
  }
  async function loadGooglePhotoUrls(allowPrompt = false) {
    const googlePhotos = photos.filter(photo => photo.provider === 'google-photos');
    const uniquePhotos = [...new Map(googlePhotos.map(photo => [photo.mediaItemId, photo])).values()];
    if (!uniquePhotos.length) return 0;
    if (!allowPrompt && (!googleAccessToken || Date.now() >= googleTokenExpiresAt - 60_000)) {
      resetGoogleConnection('Connect our shared Google Photos');
      return 0;
    }
    const token = await getGoogleAccessToken(allowPrompt ? 'consent' : '');
    const byMediaId = new Map();
    googlePhotos.forEach(photo => { if (!byMediaId.has(photo.mediaItemId)) byMediaId.set(photo.mediaItemId, []); byMediaId.get(photo.mediaItemId).push(photo); });
    for (let start = 0; start < uniquePhotos.length; start += 50) {
      const batch = uniquePhotos.slice(start, start + 50);
      const query = new URLSearchParams();
      batch.forEach(photo => query.append('mediaItemIds', photo.mediaItemId));
      const response = await fetch(`https://photoslibrary.googleapis.com/v1/mediaItems:batchGet?${query}`, { headers: { authorization: `Bearer ${token}` } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) resetGoogleConnection('Reconnect our shared Google Photos');
        throw new Error(result.error?.message || 'Google Photos could not load our saved photos. Connect the shared account again.');
      }
      for (const entry of result.mediaItemResults || []) {
        const media = entry.mediaItem;
        const photo = batch.find(item => item.mediaItemId === media?.id);
        if (!photo || !media?.baseUrl) continue;
        byMediaId.get(media.id)?.forEach(copy => { copy.url = `${media.baseUrl}=w900-h900`; copy.fullUrl = `${media.baseUrl}=d`; });
      }
    }
    if (googleConnectButton) googleConnectButton.textContent = 'Google Photos connected ✓';
    render();
    return uniquePhotos.length;
  }

  input.addEventListener('change', () => { filename.textContent = input.files?.[0]?.name || 'No photo selected yet'; });
  document.getElementById('toggleUpload').addEventListener('click', () => {
    uploadCard.hidden = !uploadCard.hidden;
    if (!uploadCard.hidden) uploadCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.querySelectorAll('.gallery-view-tabs [data-mode]').forEach(button => button.addEventListener('click', () => setView(button.dataset.mode)));
  search.addEventListener('input', render);

  function setView(mode) {
    viewMode = mode;
    const hash = mode === 'all' ? '' : `#${mode}`;
    if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);
    document.querySelectorAll('.gallery-view-tabs [data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    albumFilters.hidden = mode === 'albums';
    render();
  }

  function renderAlbumFilters() {
    albumFilters.replaceChildren();
    const names = ['all', ...folders.filter(name => name !== 'Old Photos')];
    names.forEach(name => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'album-filter';
      button.textContent = name === 'all' ? 'All memories' : albumName(name);
      button.setAttribute('aria-pressed', String(activeAlbum === name));
      button.addEventListener('click', () => { activeAlbum = name; renderAlbumFilters(); render(); });
      albumFilters.appendChild(button);
    });
  }

  function itemDate(item) { return item.type === 'video' ? new Date(item.uploadedAt) : photoDate(item); }
  function itemKey(item) { return item.type === 'video' ? `video:${item.videoId}` : `photo:${item.path}`; }
  function itemAlbum(item) { return (item.albums || (item.album ? [item.album] : ['General']))[0] || 'General'; }
  function matchesSearch(item, query) {
    return !query || `${item.name || item.title || ''} ${item.path || ''} ${item.uploadedBy || item.uploader || ''} ${(item.albums || []).join(' ')} ${item.album || ''}`.toLowerCase().includes(query);
  }

  function render() {
    folderView.replaceChildren();
    const query = search.value.trim().toLowerCase();
    if (viewMode === 'albums') { renderAlbums(query); return; }
    const photoItems = photos.filter(photo => viewMode !== 'videos' && matchesSearch(photo, query) && (activeAlbum === 'all' || photo.album === activeAlbum)).map(photo => ({ ...photo, type: 'photo' }));
    const videoItems = videos.filter(video => viewMode !== 'photos' && matchesSearch(video, query) && (activeAlbum === 'all' || (video.albums || ['General']).includes(activeAlbum))).map(video => ({ ...video, type: 'video' }));
    visibleItems = [...photoItems, ...videoItems].sort((a, b) => (itemDate(b)?.getTime() || 0) - (itemDate(a)?.getTime() || 0));
    visiblePhotos = visibleItems;
    document.getElementById('mediaCount').textContent = `${visibleItems.length} ${visibleItems.length === 1 ? 'memory' : 'memories'}${viewMode === 'videos' ? ' · videos' : viewMode === 'photos' ? ' · photos' : ''}`;
    if (!visibleItems.length) {
      const empty = document.createElement('div'); empty.className = 'folder-empty';
      empty.textContent = photos.length || videos.length ? 'No memories match that search yet.' : 'Our shared gallery is ready for its first memory.';
      folderView.appendChild(empty); return;
    }
    const groups = new Map();
    visibleItems.forEach(item => {
      const date = itemDate(item);
      const key = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : 'undated';
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item);
    });
    [...groups.entries()].forEach(([key, group]) => {
      const section = document.createElement('section'); section.className = 'photo-section';
      const heading = document.createElement('h2'); heading.innerHTML = `${escapeHtml(groupLabel(key))}<span>${group.length} ${group.length === 1 ? 'memory' : 'memories'}</span>`;
      const grid = document.createElement('div'); grid.className = 'grid';
      group.forEach(item => grid.appendChild(makeTile(item)));
      section.append(heading, grid); folderView.appendChild(section);
    });
  }

  function renderAlbums(query) {
    const media = [...photos.map(photo => ({ ...photo, type: 'photo' })), ...videos.map(video => ({ ...video, type: 'video' }))];
    const albums = folders.filter(name => name !== 'Old Photos').map(name => ({
      name,
      items: media.filter(item => (item.albums || (item.album ? [item.album] : ['General'])).includes(name) && matchesSearch(item, query))
    })).filter(album => !query || album.name.toLowerCase().includes(query) || album.items.length);
    document.getElementById('mediaCount').textContent = `${albums.length} ${albums.length === 1 ? 'album' : 'albums'}`;
    if (!albums.length) { const empty = document.createElement('div'); empty.className = 'folder-empty'; empty.textContent = 'We haven’t made any albums yet.'; folderView.appendChild(empty); return; }
    const grid = document.createElement('div'); grid.className = 'grid album-grid';
    albums.forEach(album => {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'album-card';
      const cover = album.items[0];
      const coverUrl = cover?.type === 'video' ? `https://i.ytimg.com/vi/${encodeURIComponent(cover.videoId)}/hqdefault.jpg` : cover?.url;
      card.innerHTML = coverUrl ? `<img src="${escapeHtml(coverUrl)}" alt="" loading="lazy"><span class="album-card-count">${album.items.length}</span>` : '<span class="album-card-empty">📁</span>';
      const title = document.createElement('strong'); title.textContent = albumName(album.name);
      const count = document.createElement('small'); count.textContent = `${album.items.length} ${album.items.length === 1 ? 'memory' : 'memories'}`;
      card.append(title, count); card.addEventListener('click', () => { activeAlbum = album.name; renderAlbumFilters(); setView('all'); });
      grid.appendChild(card);
    });
    folderView.appendChild(grid);
  }

  function makeTile(photo) {
    const isVideo = photo.type === 'video';
    const tile = document.createElement('div'); tile.className = 'tile' + (isVideo ? ' video-tile' : ''); tile.tabIndex = 0;
    tile.dataset.uploadedBy = photo.uploadedBy || photo.uploader || 'Unknown'; tile.dataset.path = itemKey(photo); tile.dataset.date = itemDate(photo)?.toLocaleDateString([], { dateStyle: 'medium' }) || '';
    if (isVideo) tile.dataset.title = photo.title || 'Our video';
    const img = document.createElement('img'); img.src = isVideo ? `https://i.ytimg.com/vi/${encodeURIComponent(photo.videoId)}/hqdefault.jpg` : (photo.url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect width="400" height="300" fill="%23e8f4f9"/%3E%3Ctext x="200" y="150" text-anchor="middle" font-size="52"%3E%F0%9F%93%B7%3C/text%3E%3C/svg%3E'); img.alt = isVideo ? `Video: ${photo.title || 'Our video'}` : `Photo from ${albumName(photo.album)}`; img.loading = 'lazy';
    tile.appendChild(img);
    if (isVideo) { const play = document.createElement('span'); play.className = 'video-play'; play.innerHTML = '<span aria-hidden="true">▶</span>'; tile.appendChild(play); }
    const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = '+'; copy.title = `Add this ${isVideo ? 'video' : 'photo'} to another album`; copy.setAttribute('aria-label', 'Add to another album');
    copy.addEventListener('click', async event => {
      event.stopPropagation();
      const target = await siteDialog.prompt(`Add this ${isVideo ? 'video' : 'photo'} to which album? ${folders.filter(x => x !== 'Old Photos').map(albumName).join(', ')}`);
      if (!target) return;
      try {
      const response = await fetch(isVideo ? '/api/youtube-videos' : '/api/gallery', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(isVideo ? { action: 'add-to-album', videoId: photo.videoId, album: target.trim() } : { action: 'copy-to-album', photoId: photo.id, album: target.trim() }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not add that memory to the album.');
        status.textContent = 'Memory added to the album.'; await loadLibrary();
      } catch (error) { status.textContent = error.message; }
    });
    tile.appendChild(copy);
    tile.addEventListener('click', () => {
      if (!isVideo && photo.provider === 'google-photos' && !photo.url) { status.textContent = 'Connect our shared Google Photos account to view this memory.'; document.getElementById('googlePhotosConnect').focus(); return; }
      openLightbox(photo);
    });
    tile.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!isVideo && photo.provider === 'google-photos' && !photo.url) { status.textContent = 'Connect our shared Google Photos account to view this memory.'; document.getElementById('googlePhotosConnect').focus(); return; } openLightbox(photo); } });
    return tile;
  }

  async function loadLibrary() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
    const response = await fetch('/api/gallery', { cache: 'no-store', credentials: 'same-origin' });
    const result = await response.json();
    if (response.status === 401) { localStorage.removeItem('charlotte-user'); location.href = 'login.html'; return; }
    if (!response.ok) throw new Error(result.error || 'Could not load our photos.');
    let videoResponse = null;
    let videoResult = {};
    try {
      videoResponse = await fetch('/api/youtube-videos', { cache: 'no-store', credentials: 'same-origin' });
      videoResult = await videoResponse.json().catch(() => ({}));
    } catch (error) { videoResult.error = error.message || 'Our video shelf could not load.'; }
    folders = [...new Set([...(result.folders || []), ...((videoResult.videos || []).flatMap(video => video.albums || ['General'])), 'General'])];
    photos = result.photos || [];
    videos = videoResponse?.ok ? (videoResult.videos || []).map(video => ({ ...video, albums: video.albums?.length ? video.albums : ['General'] })) : [];
    if (!videoResponse?.ok) document.getElementById('videoUploadStatus').textContent = videoResult.error || 'Our video shelf could not load.';
    signedAt = Date.now();
    photos.sort((a, b) => (photoDate(b)?.getTime() || 0) - (photoDate(a)?.getTime() || 0));
    try { await loadGooglePhotoUrls(false); } catch (error) { status.textContent = error.message; }
    renderAlbumFilters(); render();
    renderUploadFolders();
    const googleCount = photos.filter(photo => photo.provider === 'google-photos').length;
    const olderCount = photos.filter(photo => photo.provider !== 'google-photos').length;
    document.getElementById('storageUsage').textContent = `Our gallery has ${googleCount} photos saved in Google Photos and ${olderCount} older memories from previous storage. Google Photos manages the account’s storage allowance.`;
    })();
    try { await refreshPromise; } finally { refreshPromise = null; }
  }

  function formatBytes(value) {
    if (value < 1024) return `${value} bytes`;
    const units = ['KB', 'MB', 'GB']; let size = value / 1024; let index = 0;
    while (size >= 1024 && index < units.length - 1) { size /= 1024; index++; }
    return `${size.toFixed(size < 10 ? 1 : 0)} ${units[index]}`;
  }
  async function makeThumbnail(file) {
    if (typeof createImageBitmap !== 'function') return null;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const preview = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .84));
      return { blob: preview && preview.size < file.size ? preview : null, width: bitmap.width, height: bitmap.height };
    } catch { return null; }
    finally { bitmap?.close(); }
  }
  // Warm up Google sign-in before the first click: the OAuth popup needs the
  // browser's user activation, so the click handler should not wait on network
  // requests before asking Google for the token.
  waitForGoogleIdentity().then(() => getGoogleTokenClient()).catch(() => {});
  googleConnectButton?.addEventListener('click', async event => {
    const button = event.currentTarget;
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Connecting…';
    setGoogleStatus('Opening Google sign-in for our shared account…');
    try {
      await getGoogleAccessToken('select_account', { force: true });
      const missingScopes = googlePhotosScopes.split(' ').filter(scope => !googleGrantedScopes.includes(scope));
      if (missingScopes.length) {
        resetGoogleConnection();
        throw new Error('Google signed in, but it did not grant photo access. In Google Cloud (project molten-crowbar-513403-j7) add photoslibrary.appendonly and photoslibrary.readonly.appcreateddata to the OAuth consent screen, then connect again.');
      }
      button.textContent = 'Google Photos connected ✓';
      let loaded = 0;
      try { loaded = await loadGooglePhotoUrls(false); }
      catch (error) { setGoogleStatus(`Connected to Google, but our saved photos could not load yet: ${error.message}`, 'error'); button.disabled = false; return; }
      setGoogleStatus(loaded ? `Our shared Google Photos account is connected. Showing ${loaded} saved photo${loaded === 1 ? '' : 's'}.` : 'Our shared Google Photos account is connected. Choose albums and save a photo to add the first one.', 'success');
    } catch (error) {
      button.textContent = 'Connect our shared Google Photos';
      setGoogleStatus(error.message, 'error');
    } finally { button.disabled = false; }
  });

  createFolder.addEventListener('click', () => {
    const name = folderInput.value.trim(); if (!name) return;
    if (name.toLowerCase() === 'general' || name.toLowerCase() === 'old photos') { status.textContent = 'That album name is already reserved.'; return; }
    if (!folders.some(folder => folder.toLowerCase() === name.toLowerCase())) folders.push(name);
    folderInput.value = ''; renderUploadFolders(); renderAlbumFilters();
  });
  function renderUploadFolders() {
    folderCheckboxes.replaceChildren();
    folders.filter(name => name !== 'Old Photos').forEach(name => {
      const label = document.createElement('label'); label.className = 'folder-chip';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = name;
      label.append(checkbox, document.createTextNode(name)); folderCheckboxes.appendChild(label);
    });
    const videoAlbum = document.getElementById('videoAlbum');
    if (videoAlbum) {
      const selected = videoAlbum.value || 'General';
      videoAlbum.replaceChildren(...folders.filter(name => name !== 'Old Photos').map(name => { const option = document.createElement('option'); option.value = name; option.textContent = albumName(name); return option; }));
      if (folders.includes(selected)) videoAlbum.value = selected;
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault(); const file = input.files?.[0]; if (!file) return;
    const selected = [...folderCheckboxes.querySelectorAll('input:checked')].map(box => box.value);
    if (!selected.length) { status.textContent = 'Choose an album first (or make one above).'; return; }
    const type = file.type.toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(type) || file.size > 200 * 1024 * 1024) { status.textContent = 'Choose a JPEG, PNG, WebP, GIF, or AVIF photo under 200 MB.'; return; }
    const uploadFileName = file.name.normalize('NFKD').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200) || 'memory';
    uploadButton.disabled = true; status.textContent = 'Adding our memory…';
    try {
      if (!googleAccessToken || Date.now() >= googleTokenExpiresAt - 60_000) {
        setGoogleStatus('Connect our shared Google Photos account first, then save the photo.', 'error');
        throw new Error('Connect our shared Google Photos account first, then save the photo.');
      }
      const token = await getGoogleAccessToken('');
      const uploadToken = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://photoslibrary.googleapis.com/v1/uploads');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('X-Goog-Upload-Content-Type', type);
        xhr.setRequestHeader('X-Goog-Upload-Protocol', 'raw');
        xhr.setRequestHeader('X-Goog-Upload-File-Name', uploadFileName);
        xhr.upload.onprogress = event => {
          if (event.lengthComputable) status.textContent = `Saving our photo to Google Photos… ${Math.floor(event.loaded / event.total * 100)}%`;
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) { resolve(xhr.responseText.trim()); return; }
          if (xhr.status === 401) resetGoogleConnection('Reconnect our shared Google Photos');
          reject(new Error(xhr.status === 401 ? 'Our Google Photos connection expired. Connect our shared Google Photos again, then save the photo.' : `Google Photos rejected our upload (HTTP ${xhr.status}). ${xhr.responseText.slice(0, 500)}`));
        };
        xhr.onerror = () => reject(new Error('Could not connect to Google Photos. Check our connection and try again.'));
        xhr.onabort = () => reject(new Error('The upload was interrupted. Please try again.'));
        xhr.send(file);
      });
      status.textContent = 'Adding our photo to the gallery…';
      const createResponse = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ newMediaItems: [{ simpleMediaItem: { uploadToken, fileName: uploadFileName } }] }) });
      const created = await createResponse.json().catch(() => ({}));
      const item = created.newMediaItemResults?.[0]?.mediaItem;
      if (!createResponse.ok || !item?.id) throw new Error(created.newMediaItemResults?.[0]?.status?.message || created.error?.message || 'Google Photos received the upload but could not add it to our library.');
      const registerResponse = await fetch('/api/gallery', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'register-google-photo', mediaItemId: item.id, name: file.name, contentType: type, size: file.size, albums: selected }) });
      const registered = await registerResponse.json();
      if (!registerResponse.ok) throw new Error(registered.error || 'Google Photos saved the image, but our gallery could not index it. Refresh before retrying the upload.');
      status.textContent = 'Memory saved to Google Photos and our gallery ✨'; form.reset(); filename.textContent = 'No photo selected yet';
      await loadLibrary();
    } catch (error) {
      status.textContent = error.message;
    }
    finally { uploadButton.disabled = false; }
  });

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxVideo = document.getElementById('lightboxVideo');
  const lightboxPfp = document.getElementById('lightboxPfp');
  const lightboxName = document.getElementById('lightboxName');
  function showLightboxPhoto() {
    if (!visiblePhotos.length) return;
    const photo = visiblePhotos[currentIndex];
    const isVideo = photo.type === 'video';
    lightboxImg.hidden = isVideo;
    lightboxVideo.hidden = !isVideo;
    if (isVideo) {
      lightboxImg.removeAttribute('src');
      lightboxVideo.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(photo.videoId)}?autoplay=1`;
    } else {
      lightboxVideo.removeAttribute('src');
      lightboxImg.src = photo.fullUrl || photo.url;
      lightboxImg.alt = `Photo from ${albumName(photo.album)}`;
    }
    const by = photo.uploadedBy || photo.uploader || 'One of us';
    const date = itemDate(photo);
    const album = itemAlbum(photo);
    lightboxName.textContent = `${by} · ${albumName(album)}${date ? ` · ${date.toLocaleDateString([], { dateStyle: 'medium' })}` : ''}${isVideo ? ` · ${photo.title || 'Our video'}` : ''}`;
    lightboxPfp.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(by) + '&background=e8f6ff&color=2873a6&size=128';
    fetch('/api/profile?user=' + encodeURIComponent(by)).then(response => response.json()).then(profile => { if (profile.url) lightboxPfp.src = profile.url; }).catch(() => {});
    lightbox.classList.add('active');
  }
  function openLightbox(photo) { currentIndex = visiblePhotos.findIndex(item => itemKey(item) === itemKey(photo)); if (currentIndex < 0) currentIndex = 0; showLightboxPhoto(); }
  function movePhoto(amount) { if (!visiblePhotos.length) return; currentIndex = (currentIndex + amount + visiblePhotos.length) % visiblePhotos.length; showLightboxPhoto(); }
  document.getElementById('photoPrev').addEventListener('click', () => movePhoto(-1));
  document.getElementById('photoNext').addEventListener('click', () => movePhoto(1));
  function closeLightbox() { lightbox.classList.remove('active'); lightboxVideo.removeAttribute('src'); }
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', event => { if (event.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeLightbox();
    if (lightbox.classList.contains('active') && event.key === 'ArrowLeft') movePhoto(-1);
    if (lightbox.classList.contains('active') && event.key === 'ArrowRight') movePhoto(1);
  });
  fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' }).then(async response => {
    const session = await response.json();
    if (!response.ok) { localStorage.removeItem('charlotte-user'); location.href = 'login.html'; return; }
    user = session.user;
    if (localStorage.getItem('charlotte-user') !== user) localStorage.setItem('charlotte-user', user);
    await loadLibrary();
  }).catch(error => { status.textContent = error.message || 'Please log in to open our private photos.'; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - signedAt > 12 * 60 * 1000) loadLibrary().catch(error => { status.textContent = error.message; }); });
  window.setInterval(() => { if (!document.hidden && Date.now() - signedAt > 12 * 60 * 1000) loadLibrary().catch(error => { status.textContent = error.message; }); }, 60 * 1000);
  if (['all', 'photos', 'videos', 'albums'].includes(location.hash.slice(1))) setView(location.hash.slice(1));
  window.refreshGalleryLibrary = () => loadLibrary().catch(error => { status.textContent = error.message; });
})();
