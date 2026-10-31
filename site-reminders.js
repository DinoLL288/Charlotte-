(() => {
  const user = localStorage.getItem('charlotte-user');
  const dates = window.CHARLOTTE_LUKE_SPECIAL_DATES || [];
  if (!user || !dates.length || !('Notification' in window)) return;
  let enabled = true;
  window.addEventListener('charlotte-preferences', event => { enabled = event.detail?.birthdayReminders !== false; check(); });
  async function check() {
    if (!enabled || Notification.permission !== 'granted') return;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    dates.forEach(item => {
      const [month, day] = item.date.split('-').map(Number);
      let target = new Date(now.getFullYear(), month - 1, day);
      if (target < today) target = new Date(now.getFullYear() + 1, month - 1, day);
      const days = Math.round((target - today) / 86400000);
      if (days > 1) return;
      const stamp = `${item.id}-${target.getFullYear()}`;
      const key = `charlotte-reminder-shown-${user}`;
      if (localStorage.getItem(key) === stamp) return;
      localStorage.setItem(key, stamp);
      new Notification(days === 0 ? `${item.icon} ${item.title} is today` : `${item.icon} ${item.title} is tomorrow`, {
        body: days === 0 ? 'A special day for us 💛' : 'Let’s get ready to celebrate together.',
        tag: stamp
      });
    });
  }
  fetch('/api/question-room?view=preferences&user=' + encodeURIComponent(user), { cache: 'no-store' })
    .then(response => response.json()).then(preferences => { enabled = preferences.birthdayReminders !== false; check(); }).catch(() => {});
  setInterval(check, 15 * 60 * 1000);
})();
