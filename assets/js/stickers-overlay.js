(function () {
  // Only run on pages other than the dedicated stickers page (which has its own canvas).
  if (/stickers\.html$/i.test(location.pathname)) return;
  if (!localStorage.getItem('charlotte-user')) return;

  const user = localStorage.getItem('charlotte-user') || 'Unknown';
  const STICKERS = [
    { id:'heart', icon:'🩷', name:'Heart' },
    { id:'star', icon:'⭐', name:'Star' },
    { id:'moon', icon:'🌙', name:'Moon' },
    { id:'music', icon:'🎵', name:'Music' },
    { id:'dice', icon:'🎲', name:'Dice' },
    { id:'camera', icon:'📷', name:'Camera' },
    { id:'lock', icon:'🔐', name:'Lock' },
    { id:'trophy', icon:'🏆', name:'Trophy' },
    { id:'wave', icon:'🌊', name:'Wave' },
    { id:'fire', icon:'🔥', name:'Fire' },
    { id:'rainbow', icon:'🌈', name:'Rainbow' },
    { id:'question', icon:'❓', name:'Mystery' },
  ];

  const pageKey = (location.pathname.split('/').pop() || 'index.html') || 'index.html';

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    #global-sticker-layer { position:absolute; top:0; left:0; width:100%; min-height:100%; z-index:40; pointer-events:none; }
    #global-sticker-layer .gplaced { position:absolute; font-size:2rem; cursor:grab; user-select:none; filter:drop-shadow(0 2px 4px rgba(0,0,0,.18)); transform:translate(-50%,-50%); pointer-events:auto; }
    #global-sticker-layer .gplaced:hover { transform:translate(-50%,-50%) scale(1.12); }
    #global-sticker-layer .gplaced img { width:48px; height:48px; object-fit:contain; pointer-events:none; }
    #sticker-palette-btn { position:fixed; left:16px; bottom:16px; z-index:999; width:52px; height:52px; border-radius:50%; border:0; background:#2a78a8; color:#fff; font-size:1.4rem; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.25); }
    #sticker-palette { position:fixed; left:16px; bottom:76px; z-index:999; width:260px; max-height:60vh; overflow:auto; background:#fff; border:1px solid #c8dceb; border-radius:14px; padding:12px; box-shadow:0 8px 24px rgba(0,0,0,.2); display:none; }
    #sticker-palette.open { display:block; }
    #sticker-palette h4 { margin:0 0 8px; color:#123a58; }
    #sticker-palette .pg { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; }
    #sticker-palette .pslot { aspect-ratio:1; border-radius:8px; background:#f0f5fa; display:grid; place-items:center; font-size:1.2rem; cursor:grab; border:2px dashed #c8dceb; overflow:hidden; }
    #sticker-palette .pslot.owned { border-style:solid; border-color:#c9a24a; background:#fff7df; }
    #sticker-palette .pslot.imported { border-style:solid; border-color:#7aa8c4; background:#eaf4fb; }
    #sticker-palette .pslot img { width:100%; height:100%; object-fit:contain; }
    #sticker-palette .import-row { margin-top:8px; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
    #sticker-palette .import-row label { cursor:pointer; font-size:.8rem; }
    #sticker-palette .import-row input[type=file] { display:none; }
    #sticker-palette .status { font-size:.75rem; color:#73591f; margin-top:6px; min-height:1em; }
  `;
  document.head.appendChild(style);

  let owned = new Set();
  let imported = [];
  let placements = [];
  let selectedOverlayPid = null;

  function ensureLayer() {
    let layer = document.getElementById('global-sticker-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'global-sticker-layer';
      // append to body; body needs relative positioning for absolute children to anchor
      if (getComputedStyle(document.body).position === 'static') document.body.style.position = 'relative';
      document.body.appendChild(layer);
    }
    return layer;
  }

  async function load() {
    try {
      const res = await fetch('/api/question-room?view=stickers&user=' + encodeURIComponent(user), { cache: 'no-store' });
      const json = await res.json();
      owned = new Set(json.owned || []);
      imported = Array.isArray(json.stickers) ? json.stickers : [];
      const all = Array.isArray(json.placements) ? json.placements : [];
      placements = all.filter(p => (p.page || 'stickers') === pageKey);
    } catch (e) { owned = new Set(); imported = []; placements = []; }
    render();
  }

  function findSticker(pl) {
    if (pl.kind === 'image') return imported.find(s => s.id === pl.stickerId);
    return STICKERS.find(s => s.id === pl.stickerId);
  }

  function render() {
    const layer = ensureLayer();
    layer.querySelectorAll('.gplaced').forEach(el => el.remove());
    placements.forEach(pl => {
      const st = findSticker(pl);
      if (!st) return;
      const sz = pl.size || 1;
      const el = document.createElement('div');
      el.className = 'gplaced';
      el.style.left = pl.x + 'px';
      el.style.top = pl.y + 'px';
      el.dataset.placementId = pl.id;
      if (pl.kind === 'image' || imported.some(s => s.id === pl.stickerId)) {
        const img = document.createElement('img');
        img.src = st.dataUrl;
        img.alt = st.name || 'sticker';
        img.style.width = (48*sz) + 'px';
        img.style.height = (48*sz) + 'px';
        el.appendChild(img);
      } else {
        el.textContent = st.icon;
        el.style.fontSize = (2*sz) + 'rem';
      }
      el.draggable = true;
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', 'move:' + pl.id);
        el.style.opacity = '.5';
      });
      el.addEventListener('dragend', e => { el.style.opacity = '1'; });
      el.addEventListener('dblclick', async e => {
        e.stopPropagation();
        if (!confirm('Remove this sticker?')) return;
        await removePlacement(pl.id);
      });
      el.addEventListener('contextmenu', async e => {
        e.preventDefault();
        if (confirm('Remove this sticker?')) await removePlacement(pl.id);
      });
      el.addEventListener('click', e => { e.stopPropagation(); selectOverlay(pl.id); });
      if (pl.id === selectedOverlayPid) {
        el.style.outline = '2px dashed #2a78a8';
        const handle = document.createElement('div');
        handle.style.cssText = 'position:absolute;right:-6px;bottom:-6px;width:14px;height:14px;background:#2a78a8;border:2px solid #fff;border-radius:50%;cursor:nwse-resize;box-shadow:0 2px 6px rgba(0,0,0,.3);pointer-events:auto;';
        el.appendChild(handle);
        let resizing=false, sx, sy, ss;
        handle.addEventListener('mousedown', e => {
          e.stopPropagation(); e.preventDefault();
          resizing=true; sx=e.clientX; sy=e.clientY; ss=pl.size||1;
          function onMove(ev){ if(!resizing) return; const dx=ev.clientX-sx, dy=ev.clientY-sy; const ns=Math.max(0.4,Math.min(4, ss+(dx+dy)/120)); pl.size=ns;
            const img=el.querySelector('img'); if(img){img.style.width=(48*ns)+'px';img.style.height=(48*ns)+'px';} else { el.style.fontSize=(2*ns)+'rem'; }
          }
          function onUp(){ resizing=false; window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); saveOverlayResize(pl.id, pl.size, pl.x, pl.y); }
          window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp);
        });
      }
      layer.appendChild(el);
    });
  }

  async function placeSticker(kind, stickerId, x, y) {
    try {
      const res = await fetch('/api/question-room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'sticker-place', user, placement: { stickerId, kind: kind === 'image' ? 'image' : 'emoji', page: pageKey, x, y } }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not place');
      placements.push({ id: json.placementId, user, stickerId, kind: kind === 'image' ? 'image' : 'emoji', page: pageKey, x, y, at: new Date().toISOString() });
      render();
    } catch (err) { alert(err.message); }
  }

  async function movePlacement(pid, x, y) {
    const pl = placements.find(p => p.id === pid);
    if (pl) { pl.x = x; pl.y = y; }
    render();
    try {
      await fetch('/api/question-room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'sticker-move', user, placementId: pid, x, y }) });
    } catch (e) { /* ignore */ }
  }

  function selectOverlay(pid) {
    selectedOverlayPid = (selectedOverlayPid === pid) ? null : pid;
    render();
  }
  async function saveOverlayResize(pid, size, x, y) {
    try {
      await fetch('/api/question-room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'sticker-move', user, placementId: pid, x, y, size }) });
    } catch (e) { /* ignore */ }
  }
  async function removePlacement(pid) {
    placements = placements.filter(p => p.id !== pid);
    render();
    try {
      await fetch('/api/question-room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'sticker-remove', user, placementId: pid }) });
    } catch (e) { /* ignore */ }
  }

  // Floating palette
  function buildPalette() {
    const btn = document.createElement('button');
    btn.id = 'sticker-palette-btn';
    btn.textContent = '🎨';
    btn.title = 'Stickers';
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = 'sticker-palette';
    panel.innerHTML = '<h4>Stickers</h4><div class="pg" id="pg"></div><div class="import-row"><label for="gfile">Import</label><input id="gfile" type="file" accept="image/*" multiple></div><div class="status" id="gstatus"></div>';
    document.body.appendChild(panel);

    btn.addEventListener('click', () => panel.classList.toggle('open'));

    const pg = panel.querySelector('#pg');
    const statusEl = panel.querySelector('#gstatus');
    const fileInput = panel.querySelector('#gfile');

    function renderPalette() {
      const earnedHtml = STICKERS.map(s => {
        const isOwned = owned.has(s.id);
        return `<div class="pslot ${isOwned ? 'owned' : ''}" data-kind="emoji" data-id="${s.id}" draggable="${isOwned}" title="${isOwned ? s.name : 'Locked'}">${isOwned ? s.icon : '🔒'}</div>`;
      }).join('');
      const importedHtml = imported.map(s => `<div class="pslot imported" data-kind="image" data-id="${s.id}" draggable="true" title="${escapeHtml(s.name)}"><img src="${s.dataUrl}" alt=""></div>`).join('');
      pg.innerHTML = earnedHtml + importedHtml;
      pg.querySelectorAll('.pslot[draggable="true"]').forEach(slot => {
        slot.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/plain', 'new:' + slot.dataset.kind + ':' + slot.dataset.id);
        });
      });
    }

    // Drop on document body (the layer area) — but body drop conflicts; use layer drop
    const layer = ensureLayer();
    layer.style.pointerEvents = 'none';
    // Make whole document a drop target
    document.addEventListener('dragover', e => {
      // only react if carrying a sticker
      if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.indexOf('text/plain') !== -1) e.preventDefault();
    });
    document.addEventListener('drop', async e => {
      // ignore drops inside palette
      if (panel.contains(e.target)) return;
      let data;
      try { data = e.dataTransfer.getData('text/plain'); } catch { return; }
      if (!data) return;
      // compute coords relative to document
      const x = e.pageX;
      const y = e.pageY;
      if (data.startsWith('move:')) {
        await movePlacement(data.slice(5), x, y);
      } else if (data.startsWith('new:')) {
        const parts = data.split(':');
        const kind = parts[1];
        const sid = parts.slice(2).join(':');
        // only place if owned/imported
        if (kind === 'emoji' && !owned.has(sid)) return;
        if (kind === 'image' && !imported.some(s => s.id === sid)) return;
        e.preventDefault();
        await placeSticker(kind, sid, x, y);
      }
    });

    // Also allow drop on layer
    layer.addEventListener('dragover', e => e.preventDefault());
    layer.addEventListener('drop', e => { /* handled by document */ });

    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      if (!files.length) return;
      statusEl.textContent = `Importing ${files.length}…`;
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        const dataUrl = await readFileAsDataUrl(file);
        if (!dataUrl) continue;
        const name = file.name.replace(/\.[^.]+$/, '') || 'Sticker';
        try {
          const res = await fetch('/api/question-room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'sticker-import', user, name, dataUrl }) });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Import failed');
          imported.push(json.sticker);
          statusEl.textContent = `Imported ${json.sticker.name}`;
        } catch (err) { statusEl.textContent = err.message; }
      }
      fileInput.value = '';
      renderPalette();
    });

    function readFileAsDataUrl(file) {
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    }

    // expose re-render of palette when data changes
    window.__renderStickerPalette = renderPalette;
    renderPalette();
  }

  function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

  // WebSocket sync
  let socket = null, reconnectTimer = null, pingTimer = null;
  function connect() {
    clearTimeout(reconnectTimer);
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/api/question-room?user=${encodeURIComponent(user)}&sessionDate=2000-01-04`);
    socket.onopen = () => {
      clearInterval(pingTimer);
      pingTimer = setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' })); }, 20000);
    };
    socket.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'refresh') { load(); if (window.__renderStickerPalette) window.__renderStickerPalette(); }
    };
    socket.onclose = () => { clearInterval(pingTimer); reconnectTimer = setTimeout(connect, 2500); };
  }

  document.addEventListener('click', e => { if (selectedOverlayPid && (e.target === document.body || e.target.id === 'global-sticker-layer')) { selectedOverlayPid = null; render(); } });
  function init() {
    ensureLayer();
    buildPalette();
    load().then(() => { if (window.__renderStickerPalette) window.__renderStickerPalette(); });
    connect();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
