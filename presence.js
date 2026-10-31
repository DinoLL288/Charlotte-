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
    #shared-music-open { display:inline-block; margin-top:8px; color:#24516e; font-size:.82rem; }
    #shared-music-player { width:100%; min-height:152px; margin-top:10px; border:0; border-radius:12px; background:#e8f0f5; }
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
      <p>When one of us starts the playlist, the other gets a prompt to join. Tap play on each phone so Spotify can start audio there.</p>
      <form id="shared-music-form"><label for="shared-music-url">Link for our Spotify playlist</label><input id="shared-music-url" name="url" type="url" maxlength="500" placeholder="https://open.spotify.com/playlist/…" required><button class="primary" type="submit">Set our playlist</button></form>
      <button id="shared-music-play" class="primary" type="button" disabled>Play our playlist here</button>
      <a id="shared-music-open" href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer" hidden>Open our playlist in Spotify ↗</a>
      <p id="shared-music-status" role="status">Connecting…</p>
      <div id="shared-music-player" title="Shared Spotify playlist"></div>
    </section>
    <button id="shared-music-toggle" type="button" aria-label="Open shared music controls" aria-expanded="false">♫</button>
  `;
  document.body.appendChild(widget);

  const status = widget.querySelector('#shared-music-status');
  const input = widget.querySelector('#shared-music-url');
  const player = widget.querySelector('#shared-music-player');
  const playButton = widget.querySelector('#shared-music-play');
  const openLink = widget.querySelector('#shared-music-open');
  let socket = null, reconnectTimer = null, syncTimer = null, playlist = '', controller = null, controllerReady = false, requestedPlaylist = '';

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
    playlist = normalized;
    if (!normalized) {
      openLink.hidden = true;
      playButton.disabled = true;
      if (!input.value) status.textContent = 'Paste a Spotify playlist link to set ours.';
      return;
    }
    input.value = normalized;
    if (controller && requestedPlaylist !== normalized) {
      requestedPlaylist = normalized;
      controller.loadUri(`spotify:playlist:${normalized.split('/').pop()}`);
    } else if (!controller) initializeSpotifyEmbed(normalized);
    playButton.disabled = !controllerReady;
    openLink.href = normalized;
    openLink.hidden = false;
    if (!controllerReady) status.textContent = 'Loading our Spotify player…';
  }

  function initializeSpotifyEmbed(value) {
    if (controller || !window.SpotifyIframeApi) return;
    const normalized = normalizePlaylist(value);
    if (!normalized) return;
    requestedPlaylist = normalized;
    const id = normalized.split('/').pop();
    window.SpotifyIframeApi.createController(player, { uri: `spotify:playlist:${id}`, width: '100%', height: 152 }, embed => {
      controller = embed;
      controllerReady = true;
      playButton.disabled = false;
      controller.addListener('ready', () => { playButton.disabled = false; status.textContent = 'Ready. Tap play here to listen on this phone.'; });
      controller.addListener('playback_started', event => {
        status.textContent = 'Our playlist is playing here.';
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'spotify-playback', playing: true, track: event.data?.playingURI || '' }));
      });
      controller.addListener('playback_update', event => {
        if (!event.data?.isPaused) return;
        status.textContent = 'Our playlist is paused here.';
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'spotify-playback', playing: false }));
      });
      playButton.disabled = false;
    });
  }

  window.onSpotifyIframeApiReady = api => {
    window.SpotifyIframeApi = api;
    if (playlist) initializeSpotifyEmbed(playlist);
  };
  const spotifyApiScript = document.createElement('script');
  spotifyApiScript.src = 'https://open.spotify.com/embed/iframe-api/v1';
  spotifyApiScript.async = true;
  document.head.appendChild(spotifyApiScript);

  function connect() {
    clearTimeout(reconnectTimer);
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/api/question-room?user=${encodeURIComponent(user)}&sessionDate=2000-01-01`);
    socket.onmessage = event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'state') { setPresence(message.online || []); showPlaylist(message.spotifyPlaylist || defaultPlaylist); }
      if (message.type === 'spotify-playlist') showPlaylist(message.url || '');
      if (message.type === 'spotify-play-request' && message.user !== user) {
        status.textContent = `${message.user} started our playlist. Tap “Play our playlist here” to join on this phone.`;
        widget.querySelector('#shared-music-panel').hidden = false;
        widget.querySelector('#shared-music-toggle').setAttribute('aria-expanded', 'true');
      }
      if (message.type === 'spotify-playback' && message.user !== user && message.playing) {
        status.textContent = `${message.user} started our playlist. Tap “Play our playlist here” to join on this phone.`;
        widget.querySelector('#shared-music-panel').hidden = false;
        widget.querySelector('#shared-music-toggle').setAttribute('aria-expanded', 'true');
      }
      if (message.type === 'pong') return;
    };
    socket.onopen = () => {
      clearInterval(syncTimer);
      syncTimer = setInterval(() => { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' })); }, 25000);
      status.textContent = playlist ? 'Connected. Our playlist is ready.' : 'Paste a Spotify playlist link to set ours.';
    };
    socket.onclose = () => { clearInterval(syncTimer); setPresence([], false); status.textContent = 'Reconnecting to our shared room…'; reconnectTimer = setTimeout(connect, 2500); };
    socket.onerror = () => setPresence([], false);
  }

  widget.querySelector('#shared-music-toggle').addEventListener('click', event => {
    const panel = widget.querySelector('#shared-music-panel');
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
  });
  playButton.addEventListener('click', () => {
    if (!controller || !controllerReady) { status.textContent = 'The Spotify player is still loading. Try again in a moment.'; return; }
    controller.play();
    status.textContent = 'Starting our playlist on this phone…';
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
