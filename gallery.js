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
  const user = localStorage.getItem('charlotte-user') || 'Unknown';
  let folders = [];
  let photos = [];
  let visiblePhotos = [];
  let activeAlbum = 'all';
  let viewMode = 'photos';
  let currentIndex = 0;

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
        const response = await fetch('/api/gallery-copy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourcePath: photo.path, targetFolder: target.trim(), uploadedBy: user }) });
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
    const folderResponse = await fetch('/api/gallery', { cache: 'no-store' });
    const folderData = await folderResponse.json();
    folders = [...new Set([...(folderData.folders || []), 'General'])];
    const albumNames = folders;
    const results = await Promise.all(albumNames.map(async album => {
      const folder = album === 'Old Photos' ? 'root' : album;
      const response = await fetch('/api/gallery?folder=' + encodeURIComponent(folder), { cache: 'no-store' });
      const result = await response.json();
      return (result.photos || []).map(photo => ({ ...photo, album }));
    }));
    const seen = new Set();
    photos = results.flat().filter(photo => !seen.has(photo.path) && seen.add(photo.path));
    photos.sort((a, b) => (photoDate(b)?.getTime() || 0) - (photoDate(a)?.getTime() || 0));
    renderAlbumFilters(); render();
  }

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
    try {
      for (const album of selected) {
        const body = new FormData(); body.append('photo', file); body.append('uploadedBy', user); body.append('folder', album);
        const response = await fetch('/api/upload', { method: 'POST', body }); const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Upload failed.');
      }
      status.textContent = 'Memory saved to our album ✨'; form.reset(); filename.textContent = 'No photo selected yet';
      await loadLibrary();
    } catch (error) { status.textContent = error.message; }
    finally { uploadButton.disabled = false; }
  });

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxPfp = document.getElementById('lightboxPfp');
  const lightboxName = document.getElementById('lightboxName');
  function showLightboxPhoto() {
    if (!visiblePhotos.length) return;
    const photo = visiblePhotos[currentIndex]; lightboxImg.src = photo.url; lightboxImg.alt = `Photo from ${albumName(photo.album)}`;
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
  loadLibrary().then(renderUploadFolders).catch(error => { status.textContent = error.message; });
})();
