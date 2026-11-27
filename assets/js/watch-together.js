// Watch together — shared YouTube queue and roughly-synced playback.
// Pure helpers are exported so tests can check the URL parsing and the
// sync maths without a DOM or a player.
//
// How sync works: there is no realtime server. The shared "now playing"
// state (video, playing/paused, position, updatedAt) lives in the
// GitHub-backed queue store. Each open page polls it every 5 seconds
// and nudges its own player towards it: if the other side is playing
// and we are paused, we seek to the shared position and play; if the
// other side paused, we pause at the shared position; if both are
// playing but we have drifted more than 5 seconds apart, we seek.
// So both land on roughly the same spot, give or take a few seconds —
// this is approximate sync, not frame-perfect.
//
// TODO (shared Google account): once the eu.org domain is approved and
// Google sign-in works for the site, connect the shared Google/YouTube
// account (the shared Google account) here — e.g. show the shared
// account's subscriptions and playlists as queue suggestions, and use
// the YouTube Data API for titles. Until then the page uses the site
// login (Luke/Charlotte) only; no Google OAuth is involved.

// Pull a YouTube video id out of a watch, short, shorts, embed or live
// URL, or a bare video id. Returns the 11-character id or null.
export function parseYouTubeId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const id = /^[A-Za-z0-9_-]{11}$/;
  if (host === 'youtu.be') {
    const first = url.pathname.split('/').filter(Boolean)[0] || '';
    return id.test(first) ? first : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host.endsWith('.youtube.com')) {
    const v = url.searchParams.get('v') || '';
    if (id.test(v)) return v;
    const parts = url.pathname.split('/').filter(Boolean);
    if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') && id.test(parts[1] || '')) {
      return parts[1];
    }
  }
  return null;
}

export function thumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// Where a follower's player should be, given the shared now-playing
// state and the current time in ms. Playing: the stored position plus
// the time since the state was written. Paused: the stored position.
// Returns null when there is nothing playing.
export function syncPosition(nowPlaying, nowMs) {
  if (!nowPlaying || typeof nowPlaying !== 'object') return null;
  if (!nowPlaying.videoId) return null;
  const position = Math.max(0, Number(nowPlaying.position) || 0);
  if (nowPlaying.state !== 'playing') return position;
  const updatedAt = Date.parse(nowPlaying.updatedAt || '');
  if (Number.isNaN(updatedAt)) return position;
  return Math.max(0, position + (nowMs - updatedAt) / 1000);
}

// --- Browser wiring: queue UI, embedded player, poll-based sync. ---
if (typeof document !== 'undefined' && typeof fetch !== 'undefined') {
  (function initWatchTogether() {
    const user = localStorage.getItem('charlotte-user') || 'Unknown';
    const queueEl = document.getElementById('watchQueue');
    const addInput = document.getElementById('watchAddInput');
    const addButton = document.getElementById('watchAddButton');
    const addStatus = document.getElementById('watchAddStatus');
    const playerWrap = document.getElementById('watchPlayer');
    const nowPlayingTitle = document.getElementById('nowPlayingTitle');
    const nowPlayingMeta = document.getElementById('nowPlayingMeta');
    const watchingAs = document.getElementById('watchingAs');
    const syncNote = document.getElementById('watchSyncNote');
    if (!queueEl || !playerWrap) return;
    if (watchingAs) watchingAs.textContent = `Watching as ${user}`;

    let queue = [];
    let nowPlaying = null;
    let player = null;
    let playerReady = false;
    let playerVideoId = null;
    let lastPosted = '';
    let lastTimeCheck = 0;
    let apiReady = false;

    function escapeHtml(value) {
      const d = document.createElement('div');
      d.textContent = String(value == null ? '' : value);
      return d.innerHTML;
    }

    async function api(method, payload) {
      const res = await fetch('/api/watch-together', {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'POST' ? JSON.stringify(payload || {}) : undefined,
        cache: 'no-store'
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not reach the watch queue');
      return json;
    }

    function renderQueue() {
      if (!queue.length) {
        queueEl.innerHTML = '<span style="color:#6a8292;font-size:.9rem">Nothing queued yet — paste a YouTube link above to add the first video.</span>';
        return;
      }
      queueEl.innerHTML = queue.map(v => {
        const playing = nowPlaying && nowPlaying.videoId === v.videoId;
        return `<div class="watch-item${v.watched ? ' watched' : ''}${playing ? ' playing' : ''}" data-id="${escapeHtml(v.id)}">
          <img class="watch-thumb" src="${escapeHtml(thumbnailUrl(v.videoId))}" alt="" loading="lazy">
          <div class="watch-info">
            <strong>${escapeHtml(v.title || v.videoId)}</strong>
            <span>Added by ${escapeHtml(v.addedBy || 'Unknown')}${v.watched ? ' · watched' : ''}${playing ? ' · now playing' : ''}</span>
          </div>
          <div class="watch-actions">
            <button type="button" class="button small" data-play="${escapeHtml(v.videoId)}">${playing ? 'Playing' : 'Play'}</button>
            <button type="button" class="button secondary small" data-toggle-watched="${escapeHtml(v.id)}">${v.watched ? 'Unwatch' : 'Watched'}</button>
            <button type="button" class="button danger small" data-remove="${escapeHtml(v.id)}" aria-label="Remove ${escapeHtml(v.title || v.videoId)}">✕</button>
          </div>
        </div>`;
      }).join('');
    }

    function setNowPlayingUI() {
      if (!nowPlaying || !nowPlaying.videoId) {
        if (nowPlayingTitle) nowPlayingTitle.textContent = 'Nothing playing yet';
        if (nowPlayingMeta) nowPlayingMeta.textContent = 'Pick a video from the queue below.';
        return;
      }
      const video = queue.find(v => v.videoId === nowPlaying.videoId);
      if (nowPlayingTitle) nowPlayingTitle.textContent = video ? video.title : nowPlaying.videoId;
      if (nowPlayingMeta) {
        nowPlayingMeta.textContent = `${nowPlaying.state === 'playing' ? 'Playing' : 'Paused'} · started by ${nowPlaying.updatedBy || 'Unknown'}`;
      }
    }

    function loadPlayerApi() {
      return new Promise(resolve => {
        if (window.YT && window.YT.Player) return resolve(true);
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.onload = () => resolve(true);
        tag.onerror = () => resolve(false);
        document.head.appendChild(tag);
        const check = setInterval(() => {
          if (window.YT && window.YT.Player) { clearInterval(check); resolve(true); }
        }, 200);
        setTimeout(() => { clearInterval(check); resolve(!!(window.YT && window.YT.Player)); }, 8000);
      });
    }

    async function ensurePlayer(videoId) {
      if (playerVideoId === videoId && player) return true;
      const ok = await loadPlayerApi();
      if (!ok || !window.YT) {
        if (syncNote) syncNote.textContent = 'The YouTube player could not load — check your connection and reload.';
        return false;
      }
      if (player && player.loadVideoById) {
        playerVideoId = videoId;
        player.loadVideoById(videoId);
        return true;
      }
      playerVideoId = videoId;
      player = new window.YT.Player(playerWrap, {
        host: 'https://www.youtube-nocookie.com',
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: () => { playerReady = true; applySharedState(true); },
          onStateChange: (e) => {
            // 1 = playing, 2 = paused. Broadcast what we just did so
            // the other side follows within a few seconds.
            if (!playerReady) return;
            if (e.data === 1 || e.data === 2) {
              postPlayback(e.data === 1 ? 'playing' : 'paused');
            }
          }
        }
      });
      return true;
    }

    async function postPlayback(state) {
      if (!player || !playerVideoId) return;
      let position = 0;
      try { position = player.getCurrentTime() || 0; } catch { /* player not ready */ }
      const key = `${playerVideoId}|${state}|${Math.round(position)}`;
      if (key === lastPosted) return;
      lastPosted = key;
      try {
        const json = await api('POST', { action: 'play', videoId: playerVideoId, state, position, updatedBy: user });
        nowPlaying = json.nowPlaying || nowPlaying;
        setNowPlayingUI();
      } catch { /* keep playing locally; the next poll resyncs */ }
    }

    // Nudge our player towards the shared state. Called on a poll and
    // right after the player becomes ready.
    async function applySharedState(force) {
      if (!nowPlaying || !nowPlaying.videoId || !playerReady || !player) return;
      const target = syncPosition(nowPlaying, Date.now());
      if (target == null) return;
      if (playerVideoId !== nowPlaying.videoId) {
        await ensurePlayer(nowPlaying.videoId);
        return;
      }
      let mine = 0;
      let state = -1;
      try { mine = player.getCurrentTime() || 0; state = player.getPlayerState(); } catch { return; }
      const drift = Math.abs(mine - target);
      if (nowPlaying.state === 'playing') {
        if (state !== 1) {
          // They are playing and we are not: jump to their spot and play.
          // Some browsers block autoplay with sound until a tap; the
          // seek still lands us on the right spot, so one tap resumes
          // in sync.
          try { player.seekTo(target, true); player.playVideo(); } catch { /* ignore */ }
        } else if (drift > 5 || force) {
          try { player.seekTo(target, true); } catch { /* ignore */ }
        }
      } else if (nowPlaying.state === 'paused') {
        if (state === 1) {
          try { player.pauseVideo(); } catch { /* ignore */ }
        }
        if (drift > 2) {
          try { player.seekTo(target, true); } catch { /* ignore */ }
        }
      }
    }

    async function refresh() {
      try {
        const json = await api('GET');
        queue = Array.isArray(json.queue) ? json.queue : [];
        nowPlaying = json.nowPlaying || null;
        apiReady = true;
        renderQueue();
        setNowPlayingUI();
        if (nowPlaying && nowPlaying.videoId) {
          await ensurePlayer(nowPlaying.videoId);
        }
        await applySharedState(false);
        // If we are playing and the time jumped (we seeked), tell the
        // other side where we landed.
        if (player && playerReady && playerVideoId) {
          try {
            const t = player.getCurrentTime() || 0;
            const state = player.getPlayerState();
            if (state === 1 && lastTimeCheck && Math.abs(t - lastTimeCheck) > 2) {
              postPlayback('playing');
            }
            lastTimeCheck = t;
          } catch { /* ignore */ }
        }
      } catch (e) {
        if (!apiReady && syncNote) syncNote.textContent = 'The shared queue could not load — it may need the live site, not this preview.';
      }
    }

    queueEl.addEventListener('click', async (e) => {
      const playBtn = e.target.closest('[data-play]');
      const watchBtn = e.target.closest('[data-toggle-watched]');
      const removeBtn = e.target.closest('[data-remove]');
      if (playBtn) {
        const videoId = playBtn.dataset.play;
        const ok = await ensurePlayer(videoId);
        if (!ok) return;
        try { player.playVideo(); } catch { /* ignore */ }
        await postPlayback('playing');
        return;
      }
      if (watchBtn) {
        const item = queue.find(v => v.id === watchBtn.dataset.toggleWatched);
        if (!item) return;
        try {
          const json = await api('POST', { action: 'watch', id: item.id, watched: !item.watched });
          queue = json.queue || queue;
          renderQueue();
        } catch (err) { if (addStatus) addStatus.textContent = err.message; }
        return;
      }
      if (removeBtn) {
        if (!window.confirm('Remove this video from the queue?')) return;
        try {
          const json = await api('POST', { action: 'remove', id: removeBtn.dataset.remove });
          queue = json.queue || queue;
          if (json.nowPlaying === null) nowPlaying = null;
          renderQueue();
          setNowPlayingUI();
        } catch (err) { if (addStatus) addStatus.textContent = err.message; }
      }
    });

    async function addVideo() {
      const input = (addInput.value || '').trim();
      if (!input) { if (addStatus) addStatus.textContent = 'Paste a YouTube link first.'; return; }
      const videoId = parseYouTubeId(input);
      if (!videoId) { if (addStatus) addStatus.textContent = 'That does not look like a YouTube link.'; return; }
      addButton.disabled = true;
      if (addStatus) addStatus.textContent = 'Adding…';
      try {
        const json = await api('POST', { action: 'add', videoId, addedBy: user });
        queue = json.queue || queue;
        addInput.value = '';
        if (addStatus) addStatus.textContent = json.duplicate ? 'That video is already in the queue.' : 'Added to the queue.';
        renderQueue();
      } catch (err) {
        if (addStatus) addStatus.textContent = err.message || 'Could not add that video.';
      } finally {
        addButton.disabled = false;
      }
    }
    addButton.addEventListener('click', addVideo);
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addVideo(); });

    refresh();
    setInterval(refresh, 5000);
  })();
}
