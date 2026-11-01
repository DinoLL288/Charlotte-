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

  const escapeHtml = value => { const el = document.createElement('span'); el.textContent = value || ''; return el.innerHTML; };
  const albumName = name => name === 'Old Photos' ? 'Older photos' : name === 'General' ? 'Our memories' : name;
  const photoDate = photo => {
    if (photo.uploadedAt && !Number.isNaN(Date.parse(photo.uploadedAt))) return new Date(photo.uploadedAt);
    const stamp = Number((photo.name || '').match(/^(\d{13})-/)?.[1]);
    return stamp ? new Date(stamp) : null;
  };
  const groupKey = photo => { const date = photoDate(photo); return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : 'undated'; };
  const groupLabel = key => key === 'undated' ? 'A little while ago' : new Date(`${key}-01T12:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' });

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
    const img = document.createElement('img'); img.src = isVideo ? `https://i.ytimg.com/vi/${encodeURIComponent(photo.videoId)}/hqdefault.jpg` : photo.url; img.alt = isVideo ? `Video: ${photo.title || 'Our video'}` : `Photo from ${albumName(photo.album)}`; img.loading = 'lazy';
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
    tile.addEventListener('click', () => openLightbox(photo));
    tile.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openLightbox(photo); } });
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
    renderAlbumFilters(); render();
    renderUploadFolders();
    const bytes = Number(result.storage?.bytes || 0);
    const percent = Math.min(100, bytes / 10_000_000_000 * 100);
    document.getElementById('storageUsage').textContent = `Our gallery index lists ${formatBytes(bytes)} of the 10 GB B2 free storage allowance (${percent.toFixed(2)}%). Check bucket usage for the total including unindexed files.`;
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
  document.getElementById('checkStorage').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await fetch('/api/gallery?usage=1', { cache: 'no-store', credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not check our bucket usage.');
      const usage = result.storage;
      const percent = Math.min(100, usage.bytes / usage.freeAllowanceBytes * 100);
      const orphanNote = usage.objects !== usage.indexedObjects || usage.bytes !== usage.indexedBytes ? ` The bucket and gallery index differ (${usage.indexedPhotos} indexed photos).` : '';
      document.getElementById('storageUsage').textContent = `B2 bucket: ${formatBytes(usage.bytes)} across ${usage.objects} files (${percent.toFixed(2)}% of the 10 GB free storage allowance).${orphanNote}`;
    } catch (error) { document.getElementById('storageUsage').textContent = error.message; }
    finally { button.disabled = false; }
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
    uploadButton.disabled = true; status.textContent = 'Adding our memory…';
    let prepared = null;
    try {
      const preparedImage = await makeThumbnail(file);
      const thumbnail = preparedImage?.blob || null;
      const preparedResponse = await fetch('/api/gallery', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'create-upload', name: file.name, contentType: file.type, size: file.size, thumbnailSize: thumbnail?.size || 0, width: preparedImage?.width || null, height: preparedImage?.height || null, albums: selected }) });
      prepared = await preparedResponse.json();
      if (!preparedResponse.ok) throw new Error(prepared.error || 'Could not prepare the upload.');
      let uploadPercent = 0;
      const putToB2 = (url, headers, blob, label) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        Object.entries(headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
        xhr.upload.onprogress = event => {
          if (!event.lengthComputable) return;
          uploadPercent = Math.max(uploadPercent, Math.floor(event.loaded / event.total * 100));
          status.textContent = `Uploading our memory… ${uploadPercent}%${label === 'preview' ? ' · preparing preview' : ''}`;
        };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Private photo storage rejected the ${label} (HTTP ${xhr.status}). Please try again.`));
        xhr.onerror = () => reject(new Error(`The ${label} could not connect to private photo storage. Check your connection and try again.`));
        xhr.onabort = () => reject(new Error(`The ${label} upload was interrupted. Please try again.`));
        xhr.send(blob);
      });
      const uploads = await Promise.allSettled([
        putToB2(prepared.uploadUrl, prepared.headers, file, 'photo'),
        prepared.thumbnailUrl ? putToB2(prepared.thumbnailUrl, prepared.thumbnailHeaders, thumbnail, 'preview') : Promise.resolve()
      ]);
      const failedUpload = uploads.find(result => result.status === 'rejected');
      if (failedUpload) throw failedUpload.reason;
      status.textContent = 'Checking and saving our photo…';
      const completeResponse = await fetch('/api/gallery', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'complete-upload', uploadId: prepared.uploadId }) });
      const complete = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(complete.error || 'Could not save this photo to our gallery.');
      status.textContent = 'Memory saved to our album ✨'; form.reset(); filename.textContent = 'No photo selected yet';
      await loadLibrary();
    } catch (error) {
      if (prepared?.uploadId) await fetch('/api/gallery', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'cancel-upload', uploadId: prepared.uploadId }) }).catch(() => {});
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
