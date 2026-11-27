// Install prompt for Charlotte & Luke — "Add to home screen" banner.
//
// Lives in the top-level shell (app-shell.html), because beforeinstallprompt
// fires on the top-level window. Pure decision logic is exposed on
// globalThis.__charlottePwa so the Node tests can drive it without a DOM.
//
// Rules: never show when the app is already installed (standalone), never
// nag after a dismissal (a dismissal hides the banner for 30 days), show the
// real Install button when the browser offers beforeinstallprompt, and show
// the iOS Share-sheet hint on iPhones/iPads where no prompt event exists.

(function () {
  const DISMISS_KEY = 'charlotte-install-dismissed';
  const DISMISS_DAYS = 30;

  function isStandalone(env) {
    if (env.standalone) return true;
    if (env.matchMediaStandalone) return true;
    return false;
  }

  function isIOS(env) {
    if (/iPad|iPhone|iPod/.test(env.userAgent || '')) return true;
    // iPadOS 13+ reports as Mac — touch points give it away.
    if (/Mac/.test(env.platform || '') && (env.maxTouchPoints || 0) > 1) return true;
    return false;
  }

  function dismissedRecently(env) {
    if (!env.dismissedAt) return false;
    const dismissed = Number(env.dismissedAt);
    if (!Number.isFinite(dismissed)) return false;
    const ageMs = env.now - dismissed;
    return ageMs >= 0 && ageMs < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  }

  // Returns 'install' | 'ios-hint' | 'none'.
  function installPromptState(env) {
    // Inside the real native apps (Capacitor / Tauri) the site is already
    // installed — never nag the user to install it again.
    if (env.nativeApp) return 'none';
    if (isStandalone(env)) return 'none';
    if (dismissedRecently(env)) return 'none';
    if (env.hasBeforeInstallPrompt) return 'install';
    if (isIOS(env)) return 'ios-hint';
    return 'none';
  }

  const api = { installPromptState, isStandalone, isIOS, dismissedRecently, DISMISS_KEY, DISMISS_DAYS };
  if (typeof globalThis !== 'undefined') globalThis.__charlottePwa = api;

  // ---- Browser-only banner below. Skipped when there is no DOM (Node tests).
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  let deferredPrompt = null;
  let banner = null;

  function readEnv() {
    let dismissedAt = null;
    try { dismissedAt = window.localStorage.getItem(DISMISS_KEY); } catch (e) { /* private mode */ }
    return {
      now: Date.now(),
      dismissedAt: dismissedAt,
      standalone: !!(window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches),
      matchMediaStandalone: window.matchMedia('(display-mode: standalone)').matches,
      hasBeforeInstallPrompt: !!deferredPrompt,
      // Capacitor injects window.Capacitor, Tauri injects window.__TAURI__.
      nativeApp: !!(window.Capacitor || window.__TAURI__),
      userAgent: window.navigator.userAgent || '',
      platform: window.navigator.platform || '',
      maxTouchPoints: window.navigator.maxTouchPoints || 0
    };
  }

  function dismiss() {
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* private mode */ }
    hideBanner();
  }

  function hideBanner() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  function showBanner(kind) {
    if (banner) return;
    banner = document.createElement('div');
    banner.className = 'install-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Add Charlotte to your home screen');
    const heart = document.createElement('span');
    heart.className = 'install-banner-heart';
    heart.textContent = '💛';
    const text = document.createElement('span');
    text.className = 'install-banner-text';
    if (kind === 'install') {
      text.textContent = 'Add Charlotte to your home screen — it opens like an app.';
    } else {
      text.textContent = 'Add Charlotte to your home screen: tap Share, then Add to Home Screen.';
    }
    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'install-banner-dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss');
    dismissBtn.textContent = '✕';
    dismissBtn.addEventListener('click', dismiss);
    banner.appendChild(heart);
    banner.appendChild(text);
    if (kind === 'install') {
      const installBtn = document.createElement('button');
      installBtn.type = 'button';
      installBtn.className = 'install-banner-install';
      installBtn.textContent = 'Install';
      installBtn.addEventListener('click', function () {
        hideBanner();
        if (!deferredPrompt) return;
        const promptEvent = deferredPrompt;
        deferredPrompt = null;
        promptEvent.prompt();
        if (promptEvent.userChoice) {
          promptEvent.userChoice.then(function (choice) {
            if (choice && choice.outcome === 'accepted') {
              try { window.localStorage.removeItem(DISMISS_KEY); } catch (e) { /* private mode */ }
            }
          }).catch(function () {});
        }
      });
      banner.appendChild(installBtn);
    }
    banner.appendChild(dismissBtn);
    document.body.appendChild(banner);
  }

  function maybeShow() {
    const kind = installPromptState(readEnv());
    if (kind !== 'none') showBanner(kind);
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    maybeShow();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hideBanner();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeShow);
  } else {
    maybeShow();
  }
})();
