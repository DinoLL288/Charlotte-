(() => {
  const user = localStorage.getItem('charlotte-user');
  const dates = window.CHARLOTTE_LUKE_SPECIAL_DATES || [];
  if (!user || !dates.length) return;
  let preferences = { reminderLeadDays: 1, reminderTime: '09:00' };
  const banner = document.createElement('a');
  banner.id = 'special-date-reminder';
  banner.hidden = true;
  banner.innerHTML = '<span class="special-date-icon"></span><span class="special-date-copy"><strong></strong><small></small></span><span aria-hidden="true">›</span>';
  const style = document.createElement('style');
  style.textContent = `
    #special-date-reminder{position:fixed;left:50%;bottom:18px;z-index:85;display:flex;align-items:center;gap:11px;width:min(430px,calc(100vw - 112px));padding:12px 15px;border:1px solid #fff;border-radius:20px;color:#173f5c;background:#fffefa;box-shadow:0 14px 36px #143f5f35;text-decoration:none;transform:translateX(-50%);animation:special-reminder-in .22s ease-out}
    #special-date-reminder[hidden]{display:none}.special-date-icon{display:grid;place-items:center;width:38px;height:38px;flex:none;border-radius:14px;background:#f5e8c6;font-size:1.3rem}.special-date-copy{display:grid;gap:2px;min-width:0;flex:1}.special-date-copy strong{font-size:.91rem}.special-date-copy small{color:#607e92;font-size:.76rem;line-height:1.35}.special-date-copy strong,.special-date-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    @keyframes special-reminder-in{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
    @media(max-width:520px){#special-date-reminder{bottom:72px;width:min(370px,calc(100vw - 32px));padding:10px 12px}}
    @media(prefers-reduced-motion:reduce){#special-date-reminder{animation:none}}
  `;
  document.head.append(style); document.body.append(banner);

  function upcoming() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return dates.map(item => {
      const [month, day] = item.date.split('-').map(Number);
      let target = new Date(now.getFullYear(), month - 1, day);
      if (target < today) target = new Date(now.getFullYear() + 1, month - 1, day);
      return { ...item, target, days: Math.round((target - today) / 86400000) };
    }).sort((a, b) => a.days - b.days);
  }
  function check() {
    const now = new Date();
    const items = upcoming();
    const nearest = items[0];
    const lead = Number(preferences.reminderLeadDays) || 0;
    if (nearest && nearest.days <= Math.max(lead, 7)) {
      const date = `${nearest.target.getFullYear()}-${String(nearest.target.getMonth() + 1).padStart(2, '0')}-${String(nearest.target.getDate()).padStart(2, '0')}`;
      const when = nearest.days === 0 ? 'Today is our special day' : nearest.days === 1 ? 'Tomorrow is our special day' : `Our special day is in ${nearest.days} days`;
      banner.href = `calendar.html#${date}`;
      banner.querySelector('.special-date-icon').textContent = nearest.icon;
      banner.querySelector('strong').textContent = `${when}: ${nearest.title}`;
      banner.querySelector('small').textContent = 'Our reminder is here whenever we open the site.';
      banner.hidden = false;
    } else banner.hidden = true;

    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const [hour, minute] = (preferences.reminderTime || '09:00').split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() < hour * 60 + minute) return;
    items.forEach(item => {
      const offsets = [...new Set([0, lead])];
      if (!offsets.includes(item.days)) return;
      const key = `charlotte-reminder-shown-${user}-${item.id}-${item.target.getFullYear()}-${item.days}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, 'shown');
      const description = item.days === 0 ? `${item.title} is today` : `${item.title} is in ${item.days} days`;
      new Notification(`${item.icon} ${description}`, { body: 'A little heads-up for our special day 💛', tag: key });
    });
  }
  window.addEventListener('charlotte-preferences', event => { preferences = { ...preferences, ...(event.detail || {}) }; check(); });
  fetch('/api/question-room?view=preferences&user=' + encodeURIComponent(user), { cache: 'no-store' })
    .then(response => response.json()).then(value => { preferences = { ...preferences, ...value }; check(); }).catch(check);
  check(); setInterval(check, 60 * 1000);
})();
