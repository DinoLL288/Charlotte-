(function () {
  const user = localStorage.getItem('charlotte-user');
  const key = user ? 'charlotte-preferences-' + user : null;

  function readPrefs() {
    try { return JSON.parse((key && localStorage.getItem(key)) || 'null') || {}; }
    catch (e) { return {}; }
  }
  function enabled() { return readPrefs().playfulExtras !== false; }

  function ensureStyles() {
    if (!document.querySelector('link[data-surprises]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'surprises.css';
      link.dataset.surprises = 'true';
      document.head.appendChild(link);
    }
  }

  const EMOJIS = [
    "✨","💫","⭐","🌟","💖","💕","💗","💓","💞","💘","💝","🥰","😍","🤩","😊","😄","😁","😆","🤣","😂",
    "😆","😉","😎","🤓","🥳","🤔","🤫","🤗","🤭","🫶","👍","👏","🙌","🤝","🫰","🤙","✌️","🤞","🫡","🫠",
    "🥹","😭","😤","😡","🤯","😱","🥺","😏","🫢","🫣","🫥","🤐","🥱","😴","🤤","😷","🤒","🤕","🤢","🤮",
    "🤧","🥵","🥶","😵","😵‍💫","🤯","🤠","👻","👽","🤖","👾","👹","👺","💀","☠️","🎃","😺","😸","😹","😻",
    "😼","😽","🙀","😿","😾","🙈","🙉","🙊","💋","💌"," "," "," "," "," "," "," "," "," "," ",
    " "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ",
    " "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ",
    " "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ",
    "🎉","🎊","🎈","🎁","🎀","🪅","🪩","🪄","🔮","🪬","🧿","🪙","💎","💍","👑","🎩","🪖","🎓","🧣","🧤",
    "🧦","👔","👕","👖","👗","👘","🥻","🩱","🩲","🩳","👙","👚","👛","👜","👝","🎒","👞","👟","🥾","🥿",
    "👠","👡","🩰","👢","👑","👒","🎩","🎓","🧢","🪖","⛑️","📿","💄"," "," "," "," "," "," "," ",
    " "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ",
    "☕","🍵","🧃","🥤","🧋","🍼","🥛","🍷","🍸","🍹","🍺","🍻","🥂","🍾","🥄","🍴","🍽️","🥡","🥫","🍪",
    "🍩","🍰","🧁","🍦","🍧","🍨","🍫","🍬","🍭","🍮","🍯","🥧","слож"," "," "," "," "," "," "," ",
    "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤",
    "🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🪲","🪳",
    "🦟","🦗","🕷️","🕸️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳",
    "🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🦣","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄",
    "🐎","🐖","🐏","🐑","🐐","🦌","🐕","🐩","🦮","🐕‍🦺","🐈","🐈‍⬛","🪶","🐓","🦃","🦚","🦜","🦢","🦩","🕊️",
    " "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ",
    "🌸","💮","🏵️","🌹","🥀","🌺","🌻","🌼","🌷","🌱","🪴","🌲","🌳","🌴","🌵","🌾","🌿"," "," "," ",
    "☀️"," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ",
    "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🏑","🥍","🏏","🪃","🥅","⛳",
    "🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","⛷️","🏂","🪂"," "," "," "," "," ",
    "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🛵","🏍️","🛺","🚲","🛴","🛹",
    "🚁","✈️","🛩️","🛫","🛬","🚀","🛸","🚢","⛵","🚤","🛥️","⛴️","🛳️"," "," "," "," "," "," "," ",
    " "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," ",
    " "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "," "
  ];

  const EFFECTS = ["wiggle","spin","bounce","grow","shake","rainbow"];
  const MESSAGES = ["hi!","found me","boop","✨","yay","secret!","peek","hello","tap tap"," surprise","✨✨","nice","wow","hi there","gotcha","little win","shh","✨ found","pop","hi friend"];

  function confetti(count) {
    const colors = ['#f6d365','#fda085','#8ecbeb','#ecd7a0','#b8e0d2','#f9a8d4'];
    for (let i = 0; i < (count || 12); i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = (Math.random() * 100) + 'vw';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      piece.style.animationDelay = (Math.random() * 0.3) + 's';
      document.body.appendChild(piece);
      setTimeout(function () { piece.remove(); }, 1800);
    }
  }

  function tip(item, text) {
    const t = document.createElement('div');
    t.className = 'surprise-tip';
    t.textContent = text;
    t.style.left = item.offsetLeft + item.offsetWidth / 2 + 'px';
    t.style.top = item.offsetTop + 'px';
    item.parentElement.appendChild(t);
    setTimeout(function () { t.remove(); }, 1000);
  }

  function scatter() {
    if (!enabled()) return;
    ensureStyles();
    const old = document.getElementById('surpriseLayer');
    if (old) old.remove();

    const layer = document.createElement('div');
    layer.id = 'surpriseLayer';
    layer.className = 'surprise-layer';
    document.body.appendChild(layer);

    const count = 24 + Math.floor(Math.random() * 17);
    const used = new Set();
    for (let i = 0; i < count; i++) {
      let emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      // avoid empty/whitespace picks
      while (!emoji.trim()) emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      const effect = EFFECTS[Math.floor(Math.random() * EFFECTS.length)];
      const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'surprise-item';
      item.textContent = emoji;
      item.setAttribute('aria-label', 'surprise');

      // random position, bias away from exact center text? anywhere is fine
      const x = 4 + Math.random() * 92;
      const y = 6 + Math.random() * 88;
      item.style.left = x + '%';
      item.style.top = y + '%';
      item.style.fontSize = (0.8 + Math.random() * 1.1) + 'rem';
      item.style.opacity = (0.55 + Math.random() * 0.35).toFixed(2);

      item.addEventListener('click', function () {
        item.classList.remove(...EFFECTS);
        void item.offsetWidth;
        item.classList.add(effect);
        tip(item, message);
        if (effect === 'pop') {
          confetti(8);
          setTimeout(function () { item.remove(); }, 220);
        } else {
          setTimeout(function () { item.classList.remove(effect); }, 700);
        }
      });

      // hover gentle wiggle
      item.addEventListener('mouseenter', function () {
        if (!item.classList.contains('wiggle')) {
          item.classList.add('wiggle');
          setTimeout(function () { item.classList.remove('wiggle'); }, 600);
        }
      });

      layer.appendChild(item);
    }
  }

  function sync() {
    if (enabled()) scatter(); else {
      const old = document.getElementById('surpriseLayer');
      if (old) old.remove();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync);
  } else {
    sync();
  }

  window.addEventListener('charlotte-preferences', function (event) {
    const on = event.detail ? event.detail.playfulExtras !== false : enabled();
    if (on) scatter(); else {
      const old = document.getElementById('surpriseLayer');
      if (old) old.remove();
    }
  });
  window.addEventListener('storage', function (event) {
    if (key && event.key === key) sync();
  });
})();