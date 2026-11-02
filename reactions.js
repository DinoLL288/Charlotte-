(() => {
  const user = localStorage.getItem('charlotte-user');
  if (!user || document.getElementById('couple-reactions')) return;
  const style = document.createElement('style');
  style.textContent = `
    #couple-reactions{position:fixed;left:16px;bottom:18px;z-index:100;display:flex;align-items:flex-end;gap:8px;font-family:var(--font-body,Arial,sans-serif)}
    #reaction-toggle{width:48px;height:48px;border:1px solid #fff;border-radius:50%;color:#174866;background:#fffefa;box-shadow:0 8px 24px #143f5f30;font-size:1.25rem;cursor:pointer}
    #reaction-picker{display:flex;gap:4px;padding:7px;border:1px solid #fff;border-radius:999px;background:#fffefa;box-shadow:0 8px 24px #143f5f30;transform-origin:left bottom;animation:reaction-picker-in .16s ease-out}
    #reaction-picker[hidden]{display:none}
    #reaction-picker button{width:36px;height:36px;border:0;border-radius:50%;background:#edf6fa;font-size:1.2rem;cursor:pointer;transition:transform .15s ease}
    #reaction-picker button:hover{transform:scale(1.2)}
    #reaction-status{position:absolute;left:0;bottom:56px;width:max-content;max-width:260px;padding:7px 11px;border:1px solid #fff;border-radius:999px;color:#315d78;background:#fffefa;font-size:.76rem;box-shadow:0 5px 15px #143f5f20}
    #reaction-status:empty{display:none}
    #reaction-burst-layer{position:fixed;inset:0;z-index:99;overflow:hidden;pointer-events:none}
    .reaction-burst{position:absolute;bottom:0;left:var(--x);font-size:clamp(1.8rem,5vw,2.8rem);filter:drop-shadow(0 3px 6px #143f5f40);animation:reaction-float 3.4s cubic-bezier(.22,1,.36,1) forwards}
    .reaction-burst small{position:absolute;left:50%;top:-18px;white-space:nowrap;color:#fff;font:700 10px var(--font-body,Arial,sans-serif);text-shadow:0 1px 5px #143f5f;text-align:center;transform:translateX(-50%)}
    @keyframes reaction-float{0%{opacity:0;transform:translate(0,0) scale(.7)}14%{opacity:1}55%{opacity:1;transform:translate(14px,-34vh) scale(1)}100%{opacity:0;transform:translate(-8px,-60vh) scale(1.08)}}
    @keyframes reaction-picker-in{from{opacity:0;transform:translateY(8px) scale(.94)}to{opacity:1;transform:none}}
    @media(prefers-reduced-motion:reduce){.reaction-burst{animation-duration:1ms!important}}
    @media(max-width:520px){#couple-reactions{left:12px;bottom:12px}#reaction-picker{gap:2px;padding:5px}#reaction-picker button{width:32px;height:32px}}
  `;
  document.head.appendChild(style);
  const widget = document.createElement('div');
  widget.id = 'couple-reactions';
  widget.innerHTML = '<span id="reaction-status" role="status" aria-live="polite"></span><div id="reaction-picker" hidden></div><button id="reaction-toggle" type="button" aria-label="Send a reaction" aria-expanded="false">💌</button>';
  document.body.appendChild(widget);
  const layer = document.createElement('div'); layer.id = 'reaction-burst-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer);
  const picker = widget.querySelector('#reaction-picker');
  const toggle = widget.querySelector('#reaction-toggle');
  const status = widget.querySelector('#reaction-status');
  const reactions = ['💛', '🥰', '😂', '🥹', '😘', '🫶', '✨', '🐻', '❤️', '🌻'];
  reactions.forEach(emoji => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = emoji; button.setAttribute('aria-label', `Send ${emoji}`);
    button.addEventListener('click', () => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'reaction', emoji })); else status.textContent = 'Trying to reconnect before we send that…'; });
    picker.appendChild(button);
  });
  toggle.addEventListener('click', () => { picker.hidden = !picker.hidden; toggle.setAttribute('aria-expanded', String(!picker.hidden)); });
  document.addEventListener('click', event => { if (!widget.contains(event.target)) { picker.hidden = true; toggle.setAttribute('aria-expanded', 'false'); } });

  let socket, retry;
  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/api/question-room?user=${encodeURIComponent(user)}&sessionDate=2000-01-01`);
    socket.onmessage = event => { let data; try { data = JSON.parse(event.data); } catch { return; } if (data.type === 'reaction') show(data); };
    socket.onopen = () => { clearTimeout(retry); status.textContent = ''; };
    socket.onclose = () => { status.textContent = 'Reconnecting to our reaction line…'; retry = setTimeout(connect, 2500); };
  }
  function show(data) {
    const burst = document.createElement('div'); burst.className = 'reaction-burst'; burst.style.setProperty('--x', `${8 + Math.random() * 84}%`);
    burst.textContent = data.emoji;
    const sender = document.createElement('small'); sender.textContent = data.user === user ? 'sent!' : `${data.user} sent this`;
    burst.appendChild(sender); layer.appendChild(burst); status.textContent = data.user === user ? `Sent ${data.emoji}` : `${data.user} sent ${data.emoji}`;
    setTimeout(() => burst.remove(), 3500);
  }
  connect();
  window.addEventListener('pagehide', () => { clearTimeout(retry); socket?.close(); });
})();
