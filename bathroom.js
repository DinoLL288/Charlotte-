(function () {
  const user = localStorage.getItem('charlotte-user') || '';
  const names = ['Charlotte', 'Luke'];
  const data = { status: {}, events: [] };
  const photos = {};
  const statusEl = document.getElementById('bathroomStatus');
  const escape = value => { const node = document.createElement('span'); node.textContent = value || ''; return node.innerHTML; };
  const fallbackPhoto = name => `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e8f6ff&color=2873a6&size=128`;

  async function loadPhotos() {
    await Promise.all(names.map(async name => {
      const key = `charlotte-avatar-${name}`;
      photos[name] = localStorage.getItem(key) || fallbackPhoto(name);
      try {
        const response = await fetch('/api/profile?user=' + encodeURIComponent(name));
        const json = await response.json();
        if (json.url) { photos[name] = json.url; localStorage.setItem(key, json.url); }
      } catch { /* Keep the cached or initials avatar. */ }
    }));
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  function render() {
    document.getElementById('bathroomPeople').innerHTML = names.map(name => {
      const current = data.status[name] || { active: false };
      const active = Boolean(current.active);
      const detail = active ? `Stepped away at ${formatDate(current.startedAt)}.` : current.returnedAt ? `Back since ${formatDate(current.returnedAt)}.` : 'Here with us. No break in progress.';
      const control = name === user ? `<button class="button" type="button" data-toggle="${name}">${active ? 'I’m back' : 'I’m going now'}</button>` : `<span class="meta">${escape(name)} updates this check-in</span>`;
      return `<article class="person"><img src="${escape(photos[name] || fallbackPhoto(name))}" alt="${escape(name)}’s profile photo"><h2>${escape(name)}</h2><p>${escape(detail)}</p>${control}</article>`;
    }).join('');
    document.getElementById('bathroomEvents').innerHTML = data.events.length ? data.events.map(event => {
      const name = names.includes(event.user) ? event.user : 'One of us';
      const action = event.action === 'start' ? 'stepped away for a bathroom break' : 'came back';
      return `<article class="event"><img src="${escape(photos[name] || fallbackPhoto(name))}" alt=""><p><strong>${escape(name)}</strong> ${action}.<br><time>${escape(formatDate(event.at))}</time></p></article>`;
    }).join('') : '<div class="empty">Our check-in log is ready whenever we need it.</div>';
  }

  async function load() {
    const response = await fetch('/api/question-room?view=bathroom', { cache: 'no-store' });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || 'Could not load our check-ins');
    data.status = json.status || {};
    data.events = json.events || [];
    render();
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-toggle]');
    if (!button) return;
    button.disabled = true;
    try {
      const name = button.dataset.toggle;
      const current = data.status[name] || {};
      const response = await fetch('/api/question-room', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'bathroom', user, active: !current.active })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Could not save our check-in');
      if (json.bathroom) { data.status = json.bathroom.status || {}; data.events = json.bathroom.events || []; render(); }
      statusEl.textContent = current.active ? 'We’re back together.' : 'Our bathroom check-in is saved.';
    } catch (error) {
      statusEl.textContent = error.message;
      button.disabled = false;
    }
  });

  loadPhotos().then(load).catch(error => { statusEl.textContent = error.message; });

  let socket = null, pingTimer = null, reconnectTimer = null;
  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/api/question-room?user=${encodeURIComponent(user)}&sessionDate=2000-01-01`);
    socket.onmessage = event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'bathroom') {
        data.status = message.bathroom.status || {};
        data.events = message.bathroom.events || [];
        render();
      }
    };
    socket.onopen = () => {
      clearTimeout(reconnectTimer);
      statusEl.textContent = 'Our check-ins are live.';
      pingTimer = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' })); }, 25000);
    };
    socket.onclose = () => {
      clearInterval(pingTimer);
      statusEl.textContent = 'Reconnecting to our live check-ins…';
      reconnectTimer = setTimeout(connect, 2500);
    };
  }
  connect();
})();
