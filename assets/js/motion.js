/*
  Motion runtime. See motion.css for the rules and the reasons.
  Everything here is finite: it runs once per arrival or per touch and then stops.
*/
(function () {
  if (window.__calmMotion) return;
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function reduced() {
    return media.matches || root.dataset.reducedMotion === 'true';
  }
  window.__calmMotion = { reduced };

  /* ---------- Things that appear after the page loads ---------- */
  /*
    Lists on these pages are rebuilt from scratch whenever something changes, so
    "new element" does not mean "new item". We remember what each item said and
    only animate the ones we have not shown before.
  */
  const ITEM = '.note, .entry, .plan, .moment, .item, .history-card, .event, .card, .leader-row, .td-history-item, .album-card, .shared-account, .prompt-card, .upload-card';
  const seen = new Set();
  const keyOf = el => el.className + '|' + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);

  function collect(node, out) {
    if (node.nodeType !== 1) return;
    if (node.matches(ITEM)) out.push(node);
    else if (node.querySelectorAll) node.querySelectorAll(ITEM).forEach(el => out.push(el));
  }

  function watchItems() {
    const observer = new MutationObserver(records => {
      if (reduced()) return;
      const fresh = [];
      records.forEach(r => r.addedNodes.forEach(n => collect(n, fresh)));
      let step = 0;
      fresh.forEach(el => {
        if (el.closest('[hidden], dialog, .site-dialog, .modal')) return;
        const key = keyOf(el);
        if (seen.has(key)) return;
        seen.add(key);
        el.style.setProperty('--d', Math.min(step, 8) * 60 + 'ms');
        el.classList.add('motion-in');
        step += 1;
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- Reveal on scroll ---------- */

  function watchReveals() {
    const targets = [...document.querySelectorAll('.reveal')];
    if (!targets.length) return;
    if (!('IntersectionObserver' in window) || reduced()) { targets.forEach(el => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    targets.forEach(el => io.observe(el));
  }

  /* ---------- Light that follows the pointer ---------- */

  function watchGlow() {
    if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.addEventListener('pointermove', event => {
      const el = event.target.closest && event.target.closest('.glow');
      if (!el) return;
      const box = el.getBoundingClientRect();
      el.style.setProperty('--mx', event.clientX - box.left + 'px');
      el.style.setProperty('--my', event.clientY - box.top + 'px');
    }, { passive: true });
  }

  /* ---------- Floating buttons step aside while scrolling ---------- */

  function watchScroll() {
    let last = window.scrollY, away = false, idle = 0;
    function set(value) {
      if (value === away) return;
      away = value;
      root.classList.toggle('dock-away', away);
      if (window.parent !== window) window.parent.postMessage({ type: 'calm-dock', away }, location.origin);
    }
    window.addEventListener('scroll', () => {
      if (reduced()) return;
      const y = window.scrollY;
      const nearEnds = y < 40 || window.innerHeight + y > document.documentElement.scrollHeight - 60;
      if (Math.abs(y - last) > 10) set(y > last && !nearEnds);
      last = y;
      clearTimeout(idle);
      idle = setTimeout(() => set(false), 1100);
    }, { passive: true });
  }

  function start() {
    watchItems();
    watchReveals();
    watchGlow();
    watchScroll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
