// Emoji rain + emoji of the day for the home hub.
// Purely client-side: no server calls, no storage. Respects prefers-reduced-motion.
(() => {
  const RAIN_EMOJI = ['💛', '🥰', '🌻', '🐻', '✨', '❤️', '🫶', '🌈', '⭐', '🎵'];

  // One emoji + one-liner per day, picked by UTC date so Luke and Charlotte
  // always see the same one on the same day.
  const DAY_EMOJI = [
    { emoji: '💛', message: 'You are my favourite hello.' },
    { emoji: '🥰', message: 'Loved, today and every day.' },
    { emoji: '🌻', message: 'You make ordinary days sunny.' },
    { emoji: '🐻', message: 'A bear hug, sent across the distance.' },
    { emoji: '✨', message: 'You sparkle, even on quiet days.' },
    { emoji: '🌙', message: 'Dream of us tonight.' },
    { emoji: '🫶', message: 'My heart is yours, always.' },
    { emoji: '❤️', message: 'I love you more than yesterday.' },
    { emoji: '🌈', message: 'After every rain, there is us.' },
    { emoji: '🎵', message: 'You are my favourite song.' },
    { emoji: '⭐', message: 'You are my lucky star.' },
    { emoji: '🌊', message: 'Calm seas, full hearts.' },
    { emoji: '🔥', message: 'Still burning for you.' },
    { emoji: '🎲', message: 'Lucky I found you.' }
  ];

  const reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const dayEmoji = document.getElementById('emojiDayEmoji');
  const dayMessage = document.getElementById('emojiDayMessage');
  if (dayEmoji && dayMessage) {
    const dayNumber = Math.floor(Date.now() / 86400000);
    const pick = DAY_EMOJI[dayNumber % DAY_EMOJI.length];
    dayEmoji.textContent = pick.emoji;
    dayMessage.textContent = pick.message;
  }

  const button = document.getElementById('emojiRainButton');
  if (!button) return;

  let raining = false;
  button.addEventListener('click', () => {
    if (raining) return;
    if (reducedMotion) {
      button.textContent = '💛💛💛';
      setTimeout(() => { button.textContent = 'Make it rain 💛'; }, 1200);
      return;
    }
    raining = true;
    button.disabled = true;
    let layer = document.getElementById('emoji-rain-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'emoji-rain-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    for (let i = 0; i < 30; i++) {
      const drop = document.createElement('span');
      drop.className = 'emoji-rain-drop';
      drop.textContent = RAIN_EMOJI[i % RAIN_EMOJI.length];
      drop.style.setProperty('--x', (Math.random() * 96).toFixed(1) + 'vw');
      drop.style.setProperty('--size', (1.4 + Math.random() * 1.6).toFixed(2) + 'rem');
      drop.style.setProperty('--dur', (2.6 + Math.random() * 2).toFixed(2) + 's');
      drop.style.setProperty('--drift', (Math.random() * 120 - 60).toFixed(0) + 'px');
      drop.style.setProperty('--spin', (Math.random() * 360 - 180).toFixed(0) + 'deg');
      drop.style.animationDelay = (Math.random() * 0.9).toFixed(2) + 's';
      layer.appendChild(drop);
      setTimeout(() => drop.remove(), 6000);
    }
    setTimeout(() => { raining = false; button.disabled = false; }, 5200);
  });
})();
