// Back to top — a small button that appears after scrolling down on long
// pages (hub, calendar, gallery) and smoothly scrolls back to the top.
// It sits above the fidget-balls toggle (bottom-right), never over it.
// Pure helper exported so tests can check the visibility rule without a DOM.

export const BACK_TO_TOP_THRESHOLD = 600;

export function shouldShowBackToTop(scrollY, threshold) {
  var limit = typeof threshold === 'number' ? threshold : BACK_TO_TOP_THRESHOLD;
  return Number(scrollY || 0) > limit;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  (function initBackToTop() {
    if (document.getElementById('back-to-top')) return;
    var style = document.createElement('style');
    style.textContent = [
      '#back-to-top{position:fixed;right:18px;bottom:calc(76px + env(safe-area-inset-bottom, 0px));z-index:200;width:44px;height:44px;border:1px solid var(--line-strong,#c3d1da);border-radius:50%;background:var(--surface,#ffffff);color:var(--accent-ink,#1f5778);font:700 20px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(20,63,95,.18);opacity:0;visibility:hidden;transform:translateY(8px);transition:opacity .25s ease,transform .25s ease,visibility .25s}',
      '#back-to-top.is-visible{opacity:1;visibility:visible;transform:none}',
      '@media(prefers-reduced-motion:reduce){#back-to-top{transition:none}}'
    ].join('\n');
    document.head.appendChild(style);

    var button = document.createElement('button');
    button.id = 'back-to-top';
    button.type = 'button';
    button.textContent = '↑';
    button.setAttribute('aria-label', 'Back to top');
    document.body.appendChild(button);

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function update() {
      button.classList.toggle('is-visible', shouldShowBackToTop(window.scrollY || 0));
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
    button.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
  })();
}
