(function () {
  const defaultPlaylist = 'https://open.spotify.com/playlist/0nd5Ut2ixgw4RfV0EfQHwx';
  const user = localStorage.getItem('charlotte-user');
  if (!user) return;

  const style = document.createElement('style');
  style.textContent = `
    #shared-presence { position:fixed; top:70px; right:14px; z-index:30; max-width:210px; padding:7px 11px; border:1px solid #d5e3ec; border-radius:999px; background:rgba(255,255,255,.92); color:#486a83; box-shadow:0 6px 18px #143f5f22; font:600 11px/1.2 var(--font-body,Arial,sans-serif); }
    #shared-presence::before { content:""; display:inline-block; width:7px; height:7px; margin-right:6px; border-radius:50%; background:#a7b6bf; }
    #shared-presence.is-online::before { background:#61a447; box-shadow:0 0 0 3px #61a44722; }
    #shared-music { position:fixed; right:16px; bottom:16px; z-index:40; font-family:var(--font-body,Arial,sans-serif); }
    #shared-music-toggle { width:50px; height:50px; border:1px solid rgba(255,255,255,.9); border-radius:50%; color:white; background:#143f5f; box-shadow:0 8px 24px #143f5f44; font-size:1.2rem; cursor:pointer; }
    #shared-music-panel { width:min(360px,calc(100vw - 32px)); margin-bottom:10px; padding:17px; border:1px solid #dce9f0; border-radius:18px; background:rgba(255,253,247,.99); box-shadow:0 18px 50px #143f5f33; }
    #shared-music-panel[hidden] { display:none; }
    #shared-music-panel h2 { margin:0 0 8px; color:#123a58; font:700 1.25rem var(--font-display,Georgia,serif); }
    #shared-music-panel p { margin:6px 0 12px; color:#5c7c93; font-size:.82rem; line-height:1.45; }
    #shared-music-panel input { width:100%; margin:4px 0; padding:10px 11px; border:1px solid #c8dceb; border-radius:10px; color:#10344f; background:#fff; font:inherit; }
    #shared-music-panel button { border:1px solid #d5e3ec; border-radius:999px; padding:8px 12px; color:#24516e; background:#fff; font:inherit; font-weight:700; cursor:pointer; }
    #shared-music-panel button.primary { color:#fff; border-color:#143f5f; background:#143f5f; }
    #shared-music-play { width:100%; margin-top:8px; }
    #shared-music-player { width:100%; min-height:152px; margin-top:10px; overflow:hidden; border:0; border-radius:12px; background:#e8f0f5; }
    #shared-music-player iframe { display:block; width:100%; border:0; }
    #shared-music-status { min-height:1.2em; font-size:.76rem; }
    @media(max-width:520px) { #shared-presence { top:68px; right:10px; max-width:175px; font-size:10px; } #shared-music { right:12px; bottom:12px; } }
  `;
  document.head.appendChild(style);

  const presence = document.createElement('div');
  presence.id = 'shared-presence';
  presence.textContent = 'Checking our live room…';
  document.body.appendChild(presence);

  const widget = document.createElement('div');
  widget.id = 'shared-music';
  widget.innerHTML = `
    <section id="shared-music-panel" hidden aria-label="Shared Spotify playlist">
      <h2>Our background music</h2>
      <p>Our Spotify player stays on this page. When one of us starts or pauses it, we send that action to the other browser. Some phones block remote playback; if it doesn’t start, tap play here too.</p>
      <form id="shared-music-form"><label for="shared-music-url">Link for our Spotify playlist</label><input id="shared-music-url" name="url" type="url" maxlength="500" placeholder="https://open.spotify.com/playlist/…" required><button class="primary" type="submit">Set our playlist</button></form>
      <button id="shared-music-play" class="primary" type="button" disabled>Play our playlist here</button>
      <p id="shared-music-status" role="status">Connecting…</p>
      <div id="shared-music-player" title="Shared Spotify playlist"></div>
    </section>
    <button id="shared-music-toggle" type="button" aria-label="Open shared music controls" aria-expanded="false">♫</button>
  `;
  document.body.appendChild(widget);

  const status = widget.querySelector('#shared-music-status');
  const input = widget.querySelector('#shared-music-url');
  const playerElement = widget.querySelector('#shared-music-player');
  const playButton = widget.querySelector('#shared-music-play');
  let socket = null, reconnectTimer = null, syncTimer = null, playlist = '', controller = null, controllerReady = false, requestedPlaylist = '', isPlaying = false, currentTrack = '', currentPosition = 0, lastPositionSent = 0, applyingRemote = false, remoteTimer = null, pendingPlayback = null;

  function setPresence(online, connected = true) {
    if (!connected) {
      presence.classList.remove('is-online');
      presence.textContent = 'Live status unavailable';
      presence.title = 'The shared presence connection is unavailable';
      return;
    }
    const other = user === 'Charlotte' ? 'Luke' : 'Charlotte';
    const isOnline = online.includes(other);
    presence.classList.toggle('is-online', isOnline);
    presence.textContent = isOnline ? `${other} is online` : `${other} is away`;
    presence.title = isOnline ? `${other} has the app open` : `${other} does not have the app open`;
  }

  function normalizePlaylist(value) {
    try {
      const url = new URL(value.trim());
      if (url.hostname !== 'open.spotify.com') return '';
      const match = url.pathname.match(/^\/playlist\/([A-Za-z0-9]+)\/?$/);
      return match ? `https://open.spotify.com/playlist/${match[1]}` : '';
    } catch { return ''; }
  }

  function showPlaylist(value) {
    const normalized = normalizePlaylist(value || '');
    if (!normalized) return;
    playlist = normalized;
    input.value = normalized;
    if (controller && requestedPlaylist !== normalized) {
      requestedPlaylist = normalized;
      controller.loadUri(`spotify:playlist:${normalized.split('/').pop()}`);
    } else if (!controller && !widget.querySelector('#shared-music-panel').hidden) initializeSpotifyEmbed(normalized);
    playButton.disabled = !controllerReady;
  }

  function syncPlayback(playing, other, music = {}) {
    if (!controller || !controllerReady) {
      pendingPlayback = { ...music, paused: !playing, user: other, updatedAt: music.updatedAt || Date.now() };
      status.textContent = `${other} started our playlist. The player is loading; tap play here if it doesn’t start.`;
      return;
    }
    applyingRemote = true;
    clearTimeout(remoteTimer);
    if (playing) {
      status.textContent = `${other} started our playlist. Syncing playback here…`;
      if (music.trackId && music.trackId === currentTrack && Number.isFinite(Number(music.position))) {
        const delay = Math.max(0, (Date.now() - Number(music.updatedAt || Date.now())) / 1000);
        const target = Number(music.position) + delay;
        if (Math.abs(target - currentPosition) > 4) controller.seek(Math.floor(target));
      }
      controller.play();
      remoteTimer = setTimeout(() => {
        applyingRemote = false;
        if (!isPlaying) status.textContent = `${other} started our playlist. Tap “Play our playlist here” to join on this phone.`;
      }, 2200);
    } else {
      controller.pause();
      status.textContent = `${other} paused our playlist.`;
      remoteTimer = setTimeout(() => { applyingRemote = false; }, 1200);
    }
  }

  function initializeSpotifyEmbed(value) {
    if (controller || !window.SpotifyIframeApi) return;
    const normalized = normalizePlaylist(value);
    if (!normalized) return;
    requestedPlaylist = normalized;
    const id = normalized.split('/').pop();
    window.SpotifyIframeApi.createController(playerElement, { uri: `spotify:playlist:${id}`, width: '100%', height: 152 }, embed => {
      controller = embed;
      controllerReady = true;
      playButton.disabled = false;
      controller.addListener('ready', () => { playButton.disabled = false; status.textContent = 'Ready. Tap play to listen here.'; });
      controller.addListener('playback_started', event => {
        isPlaying = true;
        currentTrack = event.data?.playingURI || currentTrack;
        status.textContent = 'Our playlist is playing in this browser.';
        if (!applyingRemote) sendPlayback(true, currentTrack, currentPosition);
      });
      controller.addListener('playback_update', event => {
        if (typeof event.data?.isPaused !== 'boolean' || !Number.isFinite(Number(event.data.position))) return;
        const wasPlaying = isPlaying;
        isPlaying = !event.data.isPaused;
        currentTrack = event.data.playingURI || currentTrack;
        currentPosition = Number(event.data.position) / 1000;
        if (applyingRemote) return;
        const now = Date.now();
        if (!isPlaying && wasPlaying) status.textContent = 'Our playlist is paused in this browser.';
        if ((isPlaying && (wasPlaying === false || now - lastPositionSent > 4000)) || (!isPlaying && wasPlaying)) {
          sendPlayback(isPlaying, currentTrack, currentPosition);
          lastPositionSent = now;
        }
      });
      if (pendingPlayback && !pendingPlayback.paused && Date.now() - Number(pendingPlayback.updatedAt || 0) < 30000) syncPlayback(true, pendingPlayback.user || 'The other person', pendingPlayback);
    });
  }

  function sendPlayback(playing, track, position) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'spotify-playback', playing, track, position }));
  }

  window.onSpotifyIframeApiReady = api => {
    window.SpotifyIframeApi = api;
    if (playlist && !widget.querySelector('#shared-music-panel').hidden) initializeSpotifyEmbed(playlist);
  };
  const spotifyApiScript = document.createElement('script');
  spotifyApiScript.src = 'https://open.spotify.com/embed/iframe-api/v1';
  spotifyApiScript.async = true;
  document.head.appendChild(spotifyApiScript);

  function showJoinPrompt(other) {
    widget.querySelector('#shared-music-panel').hidden = false;
    widget.querySelector('#shared-music-toggle').setAttribute('aria-expanded', 'true');
    remotePlayback(true, other);
  }

  function connect() {
    clearTimeout(reconnectTimer);
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/api/question-room?user=${encodeURIComponent(user)}&sessionDate=2000-01-01`);
    socket.onmessage = event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'state') {
        setPresence(message.online || []);
        showPlaylist(message.spotifyPlaylist || defaultPlaylist);
        if (message.music && !message.music.paused && Date.now() - Number(message.music.updatedAt || 0) < 30000) {
          pendingPlayback = message.music;
          status.textContent = 'Our player has saved playback. Open the music panel to reconnect.';
        }
      }
      if (message.type === 'spotify-playlist') showPlaylist(message.url || '');
      if (message.type === 'spotify-play-request' && message.user !== user) showJoinPrompt(message.user);
      if (message.type === 'spotify-playback' && message.user !== user) syncPlayback(Boolean(message.playing), message.user, message);
    };
    socket.onopen = () => {
      clearInterval(syncTimer);
      syncTimer = setInterval(() => { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' })); }, 25000);
      status.textContent = playlist ? 'Connected. Our playlist is ready.' : 'Loading our shared playlist…';
    };
    socket.onclose = () => { clearInterval(syncTimer); setPresence([], false); status.textContent = 'Reconnecting to our shared room…'; reconnectTimer = setTimeout(connect, 2500); };
    socket.onerror = () => setPresence([], false);
  }

  widget.querySelector('#shared-music-toggle').addEventListener('click', event => {
    const panel = widget.querySelector('#shared-music-panel');
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden && playlist && !controller) initializeSpotifyEmbed(playlist);
    if (!panel.hidden && pendingPlayback && !pendingPlayback.paused && Date.now() - Number(pendingPlayback.updatedAt || 0) < 30000) syncPlayback(true, pendingPlayback.user || (user === 'Charlotte' ? 'Luke' : 'Charlotte'), pendingPlayback);
  });
  playButton.addEventListener('click', () => {
    if (!controller || !controllerReady) { status.textContent = 'The Spotify player is still loading. Try again in a moment.'; return; }
    controller.play();
    status.textContent = 'Starting our playlist in this browser…';
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'spotify-play-request' }));
  });
  widget.querySelector('#shared-music-form').addEventListener('submit', event => {
    event.preventDefault();
    const url = normalizePlaylist(input.value);
    if (!url) { status.textContent = 'Use a Spotify playlist link from open.spotify.com.'; return; }
    if (!socket || socket.readyState !== WebSocket.OPEN) { status.textContent = 'The shared room is reconnecting. Try again in a moment.'; return; }
    socket.send(JSON.stringify({ type: 'spotify-playlist', url }));
    showPlaylist(url);
    status.textContent = 'Our playlist is saved for both of us.';
  });

  connect();
})();
