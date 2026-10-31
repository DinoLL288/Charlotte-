(function () {
  const defaultPlaylist = 'https://open.spotify.com/playlist/0nd5Ut2ixgw4RfV0EfQHwx';
  const user = localStorage.getItem('charlotte-user');
  const input = document.getElementById('playlistUrl');
  const player = document.getElementById('spotifyEmbed');
  const playButton = document.getElementById('playButton');
  const openSpotify = document.getElementById('openSpotify');
  const status = document.getElementById('musicStatus');
  let socket = null, reconnectTimer = null, pingTimer = null, playlist = '', requestedPlaylist = '', controller = null, controllerReady = false;

  function normalizePlaylist(value) {
    try {
      const url = new URL(value.trim());
      if (url.hostname !== 'open.spotify.com') return '';
      const match = url.pathname.match(/^\/playlist\/([A-Za-z0-9]+)\/?$/);
      return match ? `https://open.spotify.com/playlist/${match[1]}` : '';
    } catch { return ''; }
  }

  function initializeEmbed(value) {
    if (controller || !window.SpotifyIframeApi) return;
    const normalized = normalizePlaylist(value);
    if (!normalized) return;
    requestedPlaylist = normalized;
    const id = normalized.split('/').pop();
    window.SpotifyIframeApi.createController(player, { uri: `spotify:playlist:${id}`, width: '100%', height: 380 }, embed => {
      controller = embed;
      controllerReady = true;
      playButton.disabled = false;
      controller.addListener('ready', () => { playButton.disabled = false; status.textContent = 'Ready. Tap play here to listen on this phone.'; });
      controller.addListener('playback_started', event => {
        status.textContent = 'Our playlist is playing on this phone.';
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'spotify-playback', playing: true, track: event.data?.playingURI || '' }));
      });
      controller.addListener('playback_update', event => {
        if (!event.data?.isPaused) return;
        status.textContent = 'Our playlist is paused on this phone.';
        if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'spotify-playback', playing: false }));
      });
    });
  }

  function showPlaylist(value) {
    const normalized = normalizePlaylist(value || '');
    if (!normalized) return;
    playlist = normalized;
    input.value = normalized;
    openSpotify.href = normalized;
    openSpotify.hidden = false;
    if (controller && requestedPlaylist !== normalized) {
      requestedPlaylist = normalized;
      controller.loadUri(`spotify:playlist:${normalized.split('/').pop()}`);
    } else if (!controller) initializeEmbed(normalized);
  }

  window.onSpotifyIframeApiReady = api => {
    window.SpotifyIframeApi = api;
    if (playlist) initializeEmbed(playlist);
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
      if (message.type === 'state') showPlaylist(message.spotifyPlaylist || defaultPlaylist);
      if (message.type === 'spotify-playlist') showPlaylist(message.url || '');
      if ((message.type === 'spotify-play-request' || message.type === 'spotify-playback') && message.user !== user && (message.type === 'spotify-play-request' || message.playing)) {
        status.textContent = `${message.user} started our playlist. Tap play below to join on this phone.`;
      }
    };
    socket.onopen = () => {
      clearInterval(pingTimer);
      pingTimer = setInterval(() => { if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' })); }, 25000);
      if (!playlist) status.textContent = 'Connected. Loading our playlist…';
    };
    socket.onclose = () => {
      clearInterval(pingTimer);
      status.textContent = 'Reconnecting to our shared room…';
      reconnectTimer = setTimeout(connect, 2500);
    };
    socket.onerror = () => { status.textContent = 'Our shared room is unavailable. Reconnecting…'; };
  }

  document.getElementById('playlistForm').addEventListener('submit', event => {
    event.preventDefault();
    const url = normalizePlaylist(input.value);
    if (!url) { status.textContent = 'Use a Spotify playlist link from open.spotify.com.'; return; }
    if (!socket || socket.readyState !== WebSocket.OPEN) { status.textContent = 'The shared room is reconnecting. Try again in a moment.'; return; }
    socket.send(JSON.stringify({ type: 'spotify-playlist', url }));
    showPlaylist(url);
    status.textContent = 'Our playlist is saved for both of us.';
  });

  playButton.addEventListener('click', () => {
    if (!controller || !controllerReady) { status.textContent = 'The Spotify player is still loading. Try again in a moment.'; return; }
    controller.play();
    status.textContent = 'Starting our playlist on this phone…';
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'spotify-play-request' }));
  });

  connect();
})();
