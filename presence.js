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
      <p>Our playlist is shared here. We each start playback in our own Spotify player; to loop it, open the playlist in Spotify and turn on repeat.</p>
      <form id="shared-music-form"><label for="shared-music-url">Link for our Spotify playlist</label><input id="shared-music-url" name="url" type="url" maxlength="500" placeholder="https://open.spotify.com/playlist/…" required><button class="primary" type="submit">Set our playlist</button></form>
      <a id="shared-music-open" href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer" hidden>Open our playlist in Spotify to turn on repeat ↗</a>
      <p id="shared-music-status" role="status">Connecting…</p>
      <iframe id="shared-music-player" title="Shared Spotify playlist" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" hidden></iframe>
    </section>
    <button id="shared-music-toggle" type="button" aria-label="Open shared music controls" aria-expanded="false">♫</button>
  `;
  document.body.appendChild(widget);

  const status = widget.querySelector('#shared-music-status');
  const input = widget.querySelector('#shared-music-url');
  const player = widget.querySelector('#shared-music-player');
  const openLink = widget.querySelector('#shared-music-open');
  let socket = null, reconnectTimer = null, syncTimer = null, playlist = '';

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
      player.hidden = true;
      openLink.hidden = true;
      player.removeAttribute('src');
      if (!input.value) status.textContent = 'Paste a Spotify playlist link to set ours.';
      return;
    }
    input.value = normalized;
    const embed = normalized.replace('https://open.spotify.com/playlist/', 'https://open.spotify.com/embed/playlist/');
    if (player.src !== `${embed}?utm_source=generator&theme=0`) player.src = `${embed}?utm_source=generator&theme=0`;
    player.hidden = false;
    openLink.href = normalized;
    openLink.hidden = false;
    status.textContent = 'Our playlist is ready in the Spotify player.';
  }

  function connect() {
    clearTimeout(reconnectTimer);
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/api/question-room?user=${encodeURIComponent(user)}&sessionDate=2000-01-01`);
    socket.onmessage = event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'state') { setPresence(message.online || []); showPlaylist(message.spotifyPlaylist || defaultPlaylist); }
      if (message.type === 'spotify-playlist') showPlaylist(message.url || '');
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
