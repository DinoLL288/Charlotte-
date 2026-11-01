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
  let visiblePhotos = [];
  let activeAlbum = 'all';
  let viewMode = 'photos';
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
  document.getElementById('allPhotosTab').addEventListener('click', () => setView('photos'));
  document.getElementById('albumsTab').addEventListener('click', () => setView('albums'));
  search.addEventListener('input', render);

  function setView(mode) {
    viewMode = mode;
    document.getElementById('allPhotosTab').setAttribute('aria-pressed', String(mode === 'photos'));
    document.getElementById('albumsTab').setAttribute('aria-pressed', String(mode === 'albums'));
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

  function matchesSearch(photo, query) {
    return !query || `${photo.name} ${photo.path} ${photo.uploadedBy || ''}`.toLowerCase().includes(query);
  }

  function render() {
    folderView.replaceChildren();
    const query = search.value.trim().toLowerCase();
    if (viewMode === 'albums') { renderAlbums(query); return; }
    visiblePhotos = photos.filter(photo => matchesSearch(photo, query) && (activeAlbum === 'all' || photo.album === activeAlbum));
    if (!visiblePhotos.length) {
      const empty = document.createElement('div'); empty.className = 'folder-empty';
      empty.textContent = photos.length ? 'No memories match that search yet.' : 'Our photo library is ready for its first memory.';
      folderView.appendChild(empty); return;
    }
    const groups = new Map();
    visiblePhotos.forEach(photo => { const key = groupKey(photo); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(photo); });
    [...groups.entries()].forEach(([key, group]) => {
      const section = document.createElement('section'); section.className = 'photo-section';
      const heading = document.createElement('h2'); heading.innerHTML = `${escapeHtml(groupLabel(key))}<span>${group.length} ${group.length === 1 ? 'photo' : 'photos'}</span>`;
      const grid = document.createElement('div'); grid.className = 'grid';
      group.forEach(photo => grid.appendChild(makeTile(photo)));
      section.append(heading, grid); folderView.appendChild(section);
    });
  }

  function renderAlbums(query) {
    const albums = folders.filter(name => name !== 'Old Photos').map(name => ({
      name,
      items: photos.filter(photo => photo.album === name && matchesSearch(photo, query))
    })).filter(album => !query || album.name.toLowerCase().includes(query) || album.items.length);
    if (!albums.length) { const empty = document.createElement('div'); empty.className = 'folder-empty'; empty.textContent = 'We haven’t made any albums yet.'; folderView.appendChild(empty); return; }
    const grid = document.createElement('div'); grid.className = 'grid album-grid';
    albums.forEach(album => {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'album-card';
      const cover = album.items[0];
      card.innerHTML = cover ? `<img src="${escapeHtml(cover.url)}" alt="" loading="lazy"><span class="album-card-count">${album.items.length}</span>` : '<span class="album-card-empty">📁</span>';
      const title = document.createElement('strong'); title.textContent = albumName(album.name);
      const count = document.createElement('small'); count.textContent = `${album.items.length} ${album.items.length === 1 ? 'photo' : 'photos'}`;
      card.append(title, count); card.addEventListener('click', () => { activeAlbum = album.name; setView('photos'); renderAlbumFilters(); });
      grid.appendChild(card);
    });
    folderView.appendChild(grid);
  }

  function makeTile(photo) {
    const tile = document.createElement('div'); tile.className = 'tile'; tile.tabIndex = 0;
    tile.dataset.uploadedBy = photo.uploadedBy || 'Unknown'; tile.dataset.path = photo.path; tile.dataset.date = photoDate(photo)?.toLocaleDateString([], { dateStyle: 'medium' }) || '';
    const img = document.createElement('img'); img.src = photo.url; img.alt = `Photo from ${albumName(photo.album)}`; img.loading = 'lazy';
    tile.appendChild(img);
    const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = '+'; copy.title = 'Add this photo to another album'; copy.setAttribute('aria-label', 'Add to another album');
    copy.addEventListener('click', async event => {
      event.stopPropagation();
      const target = await siteDialog.prompt(`Add this photo to which album? ${folders.filter(x => x !== 'Old Photos').map(albumName).join(', ')}`);
      if (!target) return;
      try {
      const response = await fetch('/api/gallery', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'copy-to-album', photoId: photo.id, album: target.trim() }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not add photo to that album.');
        status.textContent = 'Photo added to the album.'; await loadLibrary();
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
    folders = [...new Set([...(result.folders || []), 'General'])];
    photos = result.photos || [];
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
      const [uploaded, thumbUploaded] = await Promise.all([
        fetch(prepared.uploadUrl, { method: 'PUT', headers: prepared.headers, body: file }),
        prepared.thumbnailUrl ? fetch(prepared.thumbnailUrl, { method: 'PUT', headers: prepared.thumbnailHeaders, body: thumbnail }) : Promise.resolve({ ok: true })
      ]);
    if (!uploaded.ok || !thumbUploaded.ok) {
      if (!uploaded.ok && thumbUploaded.ok && prepared.thumbnailUrl) await fetch('/api/gallery', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action: 'cancel-upload', uploadId: prepared.uploadId }) }).catch(() => {});
      throw new Error('Backblaze could not receive the photo. Please try again.');
    }
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
  const lightboxPfp = document.getElementById('lightboxPfp');
  const lightboxName = document.getElementById('lightboxName');
  function showLightboxPhoto() {
    if (!visiblePhotos.length) return;
    const photo = visiblePhotos[currentIndex]; lightboxImg.src = photo.fullUrl || photo.url; lightboxImg.alt = `Photo from ${albumName(photo.album)}`;
    const by = photo.uploadedBy || 'One of us'; lightboxName.textContent = `${by} · ${albumName(photo.album)}${photoDate(photo) ? ` · ${photoDate(photo).toLocaleDateString([], { dateStyle: 'medium' })}` : ''}`;
    lightboxPfp.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(by) + '&background=e8f6ff&color=2873a6&size=128';
    fetch('/api/profile?user=' + encodeURIComponent(by)).then(response => response.json()).then(profile => { if (profile.url) lightboxPfp.src = profile.url; }).catch(() => {});
    lightbox.classList.add('active');
  }
  function openLightbox(photo) { currentIndex = visiblePhotos.findIndex(item => item.path === photo.path); if (currentIndex < 0) currentIndex = 0; showLightboxPhoto(); }
  function movePhoto(amount) { if (!visiblePhotos.length) return; currentIndex = (currentIndex + amount + visiblePhotos.length) % visiblePhotos.length; showLightboxPhoto(); }
  document.getElementById('photoPrev').addEventListener('click', () => movePhoto(-1));
  document.getElementById('photoNext').addEventListener('click', () => movePhoto(1));
  document.getElementById('lightboxClose').addEventListener('click', () => lightbox.classList.remove('active'));
  lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.classList.remove('active'); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') lightbox.classList.remove('active');
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
})();
