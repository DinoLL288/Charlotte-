(function () {
  const user = localStorage.getItem('charlotte-user') || '';
  const names = ['Charlotte', 'Luke'];
  const data = { status: {}, events: [], stats: { allTime: {}, daily: {}, baselineLimited: true } };
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

  function dateKey(value) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Perth', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
    const get = type => parts.find(part => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function formatDate(value, options = {}) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { timeZone: 'Australia/Perth', ...options });
  }
  function dayLabel(key) {
    if (key === dateKey(new Date())) return 'Today';
    const yesterday = new Date(Date.now() - 86400000);
    if (key === dateKey(yesterday)) return 'Yesterday';
    return new Date(`${key}T12:00:00+08:00`).toLocaleDateString([], { timeZone: 'Australia/Perth', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function buildBreaks() {
    const perUser = Object.fromEntries(names.map(name => [name, []]));
    for (const name of names) {
      let open = null;
      const seen = new Set();
      const events = data.events.filter(item => item.user === name).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).filter(event => {
        if (!event.addedLater) return true;
        const signature = `${event.action}:${Math.floor(Date.parse(event.at) / 60000)}`;
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      });
      for (const event of events) {
        if (event.action === 'start') {
          if (open) open.returnMissing = true;
          open = { user: name, start: event, end: null, returnMissing: false };
          perUser[name].push(open);
        } else if (event.action === 'return') {
          if (open) { open.end = event; open = null; }
          else perUser[name].push({ user: name, start: null, end: event, returnMissing: false });
        }
      }
      if (open) open.returnMissing = true;
    }
    return names.flatMap(name => perUser[name]).sort((a, b) => Date.parse(b.start?.at || b.end?.at || 0) - Date.parse(a.start?.at || a.end?.at || 0));
  }

  function renderPeople() {
    const breaks = buildBreaks();
    document.getElementById('bathroomPeople').innerHTML = names.map(name => {
      const current = data.status[name] || { active: false };
      const active = Boolean(current.active);
      const openBreak = breaks.find(item => item.user === name && item.start && !item.end && item.returnMissing);
      const detail = active ? `Away since ${formatDate(current.startedAt, { dateStyle: 'medium', timeStyle: 'short' })}.` : openBreak ? `We haven’t recorded when ${name} got back from the ${formatDate(openBreak.start.at, { dateStyle: 'medium', timeStyle: 'short' })} break.` : current.returnedAt ? `Back since ${formatDate(current.returnedAt, { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Here with us. No break in progress.';
      const controls = name !== user ? `<span class="meta">${escape(name)} updates this check-in</span>` : active
        ? `<button class="button" type="button" data-action="return">I’m back</button>`
        : `<div class="bathroom-actions">${openBreak ? '<button class="button secondary" type="button" data-action="return">I’m back now</button>' : ''}<button class="button" type="button" data-action="start">I’m going now</button></div>`;
      return `<article class="person"><img src="${escape(photos[name] || fallbackPhoto(name))}" alt="${escape(name)}’s profile photo"><h2>${escape(name)}</h2><p>${escape(detail)}</p>${controls}</article>`;
    }).join('');
  }

  function renderLeaderboard() {
    const period = document.querySelector('[data-leaderboard-period][aria-pressed="true"]')?.dataset.leaderboardPeriod || 'month';
    const now = new Date();
    const today = dateKey(now);
    const month = today.slice(0, 7);
    const year = today.slice(0, 4);
    const counts = { Charlotte: 0, Luke: 0 };
    if (period === 'all') {
      for (const name of names) counts[name] = Number(data.stats.allTime?.[name]) || 0;
    } else {
      for (const [day, users] of Object.entries(data.stats.daily || {})) {
        const include = (period === 'day' && day === today) || (period === 'month' && day.startsWith(month)) || (period === 'year' && day.startsWith(year));
        if (include) for (const name of names) counts[name] += Number(users?.[name]) || 0;
      }
    }
    const ranking = names.map(name => ({ name, count: counts[name] })).sort((a, b) => b.count - a.count || names.indexOf(a.name) - names.indexOf(b.name));
    const max = Math.max(...Object.values(counts));
    const tied = counts.Charlotte === counts.Luke;
    document.getElementById('bathroomLeaderboard').innerHTML = ranking.map(({ name, count }, index) => {
      const pct = max ? Math.round(count / max * 100) : 0;
      const rank = tied ? '↔' : String(index + 1);
      return `<div class="leader-row${!tied && index === 0 && count > 0 ? ' is-leading' : ''}"><span class="leader-rank" aria-label="${tied ? 'Tied' : `Place ${index + 1}`}" title="${tied ? 'Tied' : `Place ${index + 1}`}">${rank}</span><img src="${escape(photos[name] || fallbackPhoto(name))}" alt=""><div class="leader-content"><div class="leader-label"><strong>${escape(name)}</strong><span>${count} ${count === 1 ? 'break' : 'breaks'}</span></div><div class="leader-track"><span style="width:${pct}%"></span></div></div></div>`;
    }).join('');
    const label = { day: 'Today', month: 'This month', year: 'This year', all: 'All time' }[period];
    const leadName = ranking[0].name;
    const leadBy = Math.abs(counts.Charlotte - counts.Luke);
    document.getElementById('leaderboardCaption').textContent = tied ? `We’re tied${max ? '' : ' so far'} · ${label}` : `${leadName} is ahead by ${leadBy} ${leadBy === 1 ? 'break' : 'breaks'} · ${label}`;
    document.getElementById('leaderboardNote').hidden = period !== 'all' || !data.stats.baselineLimited;
  }

  function renderHistory() {
    const target = document.getElementById('bathroomEvents');
    const breaks = buildBreaks();
    if (!breaks.length) { target.innerHTML = '<div class="empty">Our check-in log is ready whenever we need it.</div>'; return; }
    const groups = new Map();
    breaks.forEach(item => {
      const stamp = item.start?.at || item.end?.at;
      const key = dateKey(stamp);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    target.innerHTML = [...groups.entries()].map(([day, items]) => `<section class="day-group"><h3>${escape(dayLabel(day))}<span>${items.length} ${items.length === 1 ? 'break' : 'breaks'}</span></h3>${items.map(item => {
      const name = item.user;
      const starting = item.start ? formatDate(item.start.at, { timeStyle: 'short' }) : '';
      const ending = item.end ? formatDate(item.end.at, { timeStyle: 'short' }) : '';
      const summary = item.start ? `Stepped away at ${starting}` : `Return at ${ending} · start wasn’t logged`;
      const result = item.end ? `Back at ${ending}` : (data.status[name]?.active && item.start?.id === data.events.find(event => event.user === name && event.action === 'start')?.id) ? 'Break in progress' : item.returnMissing ? 'Return not recorded' : '';
      const later = item.start?.addedLater || item.end?.addedLater;
      return `<article class="event"><img src="${escape(photos[name] || fallbackPhoto(name))}" alt=""><div class="event-copy"><p><strong>${escape(name)}</strong> · ${escape(summary)}</p><span>${escape(result)}${later ? ' · added later' : ''}</span></div></article>`;
    }).join('')}</section>`).join('');
  }

  function render() { renderPeople(); renderLeaderboard(); renderHistory(); }

  async function load() {
    const response = await fetch('/api/question-room?view=bathroom', { cache: 'no-store' });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || 'Could not load our check-ins');
    data.status = json.status || {};
    data.events = json.events || [];
    data.stats = json.stats || data.stats;
    render();
  }

  document.addEventListener('click', async event => {
    const periodButton = event.target.closest('[data-leaderboard-period]');
    if (periodButton) {
      document.querySelectorAll('[data-leaderboard-period]').forEach(button => button.setAttribute('aria-pressed', String(button === periodButton)));
      renderLeaderboard();
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      const active = button.dataset.action === 'start';
      const response = await fetch('/api/question-room', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'bathroom', user, active })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Could not save our check-in');
      if (json.bathroom) { data.status = json.bathroom.status || {}; data.events = json.bathroom.events || []; data.stats = json.bathroom.stats || data.stats; render(); }
      statusEl.textContent = active ? 'Our bathroom check-in is saved.' : 'We’re back together. Return recorded.';
    } catch (error) { statusEl.textContent = error.message; button.disabled = false; }
  });

  const laterForm = document.getElementById('bathroomLaterForm');
  const laterStatus = document.getElementById('bathroomLaterStatus');
  const startTime = laterForm.elements.namedItem('startAt');
  const returnTime = laterForm.elements.namedItem('returnAt');
  function localDateTimeValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  startTime.value = localDateTimeValue(new Date());
  startTime.max = startTime.value;
  returnTime.max = startTime.value;
  laterForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!names.includes(user)) { laterStatus.textContent = 'Choose your own profile before saving a check-in.'; return; }
    const leftAt = new Date(startTime.value);
    const returnedAt = returnTime.value ? new Date(returnTime.value) : null;
    if (!startTime.value || Number.isNaN(leftAt.getTime())) { laterStatus.textContent = 'Choose when we stepped away.'; return; }
    if (returnedAt && (Number.isNaN(returnedAt.getTime()) || returnedAt.getTime() <= leftAt.getTime())) { laterStatus.textContent = 'The return time needs to be after the leaving time.'; return; }
    const button = laterForm.querySelector('button[type="submit"]'); button.disabled = true; laterStatus.textContent = 'Saving our earlier check-in…';
    try {
      const response = await fetch('/api/question-room', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'bathroom-history-session', user, startAt: leftAt.toISOString(), returnAt: returnedAt?.toISOString() || '' })
      });
      const json = await response.json(); if (!response.ok) throw new Error(json.error || 'Could not save our check-in.');
      data.status = json.bathroom.status || {}; data.events = json.bathroom.events || []; data.stats = json.bathroom.stats || data.stats; render();
      laterStatus.textContent = json.duplicate ? 'A check-in at that time is already in our history, so nothing was duplicated.' : returnedAt ? 'Both times were added to our break history.' : 'Leaving time added. We can record the return later.';
    } catch (error) { laterStatus.textContent = error.message; }
    finally { button.disabled = false; }
  });

  loadPhotos().then(load).catch(error => { statusEl.textContent = error.message; });
  let socket = null, pingTimer = null, reconnectTimer = null;
  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/api/question-room?user=${encodeURIComponent(user)}&sessionDate=2000-01-01`);
    socket.onmessage = event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'bathroom') {
        data.status = message.bathroom.status || {}; data.events = message.bathroom.events || []; data.stats = message.bathroom.stats || data.stats; render();
      }
    };
    socket.onopen = () => { clearTimeout(reconnectTimer); statusEl.textContent = 'Our check-ins are live.'; pingTimer = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' })); }, 25000); };
    socket.onclose = () => { clearInterval(pingTimer); statusEl.textContent = 'Reconnecting to our live check-ins…'; reconnectTimer = setTimeout(connect, 2500); };
  }
  connect();
})();
