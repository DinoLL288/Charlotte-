/*
  Our little safe.

  The passphrase and the derived key only ever live in this tab's memory.
  Everything is encrypted here with AES-GCM before it is sent to the site,
  so the server stores an opaque box and nothing readable.
*/
(function () {
  'use strict';

  const AAD = new TextEncoder().encode('charlotte-shared-vault-v1');
  const ITERATIONS = 310000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const IDLE_MS = 5 * 60 * 1000;
  const MAX_CIPHERTEXT = 90000;
  const PASSWORD_SETS = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*-_+=?'];
  const PASSWORD_ALPHABET = PASSWORD_SETS.join('');

  const $ = id => document.getElementById(id);
  const els = {
    pageAnnouncement: $('pageAnnouncement'),
    setupPanel: $('setupPanel'),
    lockPanel: $('lockPanel'),
    safePanel: $('safePanel'),
    setupForm: $('setupForm'),
    setupPassphrase: $('setupPassphrase'),
    setupConfirm: $('setupConfirm'),
    setupStrength: $('setupStrength'),
    setupButton: $('setupButton'),
    setupStatus: $('setupStatus'),
    lockIntro: $('lockIntro'),
    unlockForm: $('unlockForm'),
    unlockPassphrase: $('unlockPassphrase'),
    unlockButton: $('unlockButton'),
    unlockStatus: $('unlockStatus'),
    startOverButton: $('startOverButton'),
    entryCount: $('entryCount'),
    addEntryButton: $('addEntryButton'),
    lockButton: $('lockButton'),
    searchInput: $('searchInput'),
    entryList: $('entryList'),
    emptyState: $('emptyState'),
    safeStatus: $('safeStatus'),
    settingsPanel: $('settingsPanel'),
    changeForm: $('changeForm'),
    newPassphrase: $('newPassphrase'),
    newConfirm: $('newConfirm'),
    changeButton: $('changeButton'),
    changeStatus: $('changeStatus'),
    eraseButton: $('eraseButton'),
    entryDialog: $('entryDialog'),
    entryForm: $('entryForm'),
    entryDialogTitle: $('entryDialogTitle'),
    entryTitle: $('entryTitle'),
    entryUsername: $('entryUsername'),
    entryPassword: $('entryPassword'),
    entryNotes: $('entryNotes'),
    toggleEntryPassword: $('toggleEntryPassword'),
    generatePassword: $('generatePassword'),
    entryStatus: $('entryStatus'),
    cancelEntry: $('cancelEntry'),
    saveEntry: $('saveEntry'),
    toast: $('toast')
  };

  const state = {
    key: null,
    salt: null,
    blob: null,
    data: null,
    revealed: new Set(),
    query: '',
    editingId: null,
    idleTimer: 0,
    toastTimer: 0
  };

  /* ---------- small crypto helpers ---------- */

  function toBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function fromBase64Url(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  async function deriveKey(passphrase, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function seal(key, data, salt, iterations) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, plaintext);
    return {
      version: 1,
      kdf: 'PBKDF2-SHA256',
      iterations,
      salt: toBase64Url(salt),
      iv: toBase64Url(iv),
      ciphertext: toBase64Url(ciphertext)
    };
  }

  async function unseal(blob, passphrase) {
    if (!blob || blob.version !== 1 || blob.kdf !== 'PBKDF2-SHA256' || !Number.isInteger(blob.iterations) || blob.iterations < 100000 || blob.iterations > 2000000
      || typeof blob.salt !== 'string' || typeof blob.iv !== 'string' || typeof blob.ciphertext !== 'string') {
      throw new Error('Our safe has an unexpected shape. Try again, or start it over if it stays stuck.');
    }
    const salt = fromBase64Url(blob.salt);
    const key = await deriveKey(passphrase, salt, blob.iterations);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(blob.iv), additionalData: AAD },
      key,
      fromBase64Url(blob.ciphertext)
    );
    const data = JSON.parse(new TextDecoder().decode(plaintext));
    if (!data || data.version !== 1 || !Array.isArray(data.entries)) throw new Error('Our safe has an unexpected shape. Try again, or start it over if it stays stuck.');
    data.entries = cleanEntries(data.entries);
    return { key, salt, data };
  }

  function cleanEntries(entries) {
    const now = new Date().toISOString();
    return entries
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => ({
        id: typeof entry.id === 'string' && entry.id ? entry.id : crypto.randomUUID(),
        title: String(entry.title || '').slice(0, 80).trim() || 'Untitled login',
        username: String(entry.username || '').slice(0, 160),
        password: String(entry.password || '').slice(0, 200),
        notes: String(entry.notes || '').slice(0, 200),
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : now,
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : now
      }));
  }

  /* ---------- server ---------- */

  async function api(method, body) {
    const response = await fetch('/api/vault', {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    let payload = null;
    try { payload = await response.json(); } catch { /* keep the friendly fallback */ }
    if (!response.ok) throw new Error((payload && payload.error) || 'Our little safe is unavailable right now.');
    return payload || {};
  }

  async function ensureBlob() {
    if (state.blob) return state.blob;
    const payload = await api('GET');
    state.blob = payload.vault || null;
    return state.blob;
  }

  async function persist() {
    if (!state.key || !state.salt) throw new Error('Our safe locked itself. Unlock it again to save changes.');
    state.data.updatedAt = new Date().toISOString();
    const blob = await seal(state.key, state.data, state.salt, ITERATIONS);
    if (blob.ciphertext.length > MAX_CIPHERTEXT) throw new Error('Our little safe is full. Remove a login or shorten a note, then try again.');
    const saved = await api('POST', { action: 'save', vault: blob });
    state.blob = saved.vault || { ...blob, updatedAt: state.data.updatedAt };
    bumpIdle();
    return state.blob;
  }

  /* ---------- panels ---------- */

  function showPanel(panel) {
    [els.setupPanel, els.lockPanel, els.safePanel].forEach(item => { item.hidden = item !== panel; });
  }

  function announce(message) {
    els.pageAnnouncement.textContent = message || '';
  }

  function showSetup(message) {
    showPanel(els.setupPanel);
    setStatus(els.setupStatus, message || '');
    announce('Make our safe.');
    window.setTimeout(() => els.setupPassphrase.focus(), 60);
  }

  function showLock(message) {
    const saved = formatSaved(state.blob);
    els.lockIntro.textContent = message || 'Our safe is locked. Type our shared passphrase to see what’s inside.';
    if (saved) els.lockIntro.textContent += ` Last saved ${saved}.`;
    setStatus(els.unlockStatus, '');
    showPanel(els.lockPanel);
    announce('Our safe is locked.');
    window.setTimeout(() => els.unlockPassphrase.focus(), 60);
  }

  function showSafe(message) {
    showPanel(els.safePanel);
    setStatus(els.safeStatus, message || '');
    announce('Our safe is open.');
    bumpIdle();
    render();
  }

  function formatSaved(blob) {
    if (!blob || !blob.updatedAt) return '';
    const when = new Date(blob.updatedAt);
    if (Number.isNaN(when.getTime())) return '';
    const who = ['Luke', 'Charlotte'].includes(blob.updatedBy) ? blob.updatedBy : '';
    const stamp = when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return who ? `${who} · ${stamp}` : stamp;
  }

  /* ---------- rendering ---------- */

  function render() {
    const entries = state.data ? state.data.entries : [];
    const query = state.query.trim().toLowerCase();
    const visible = entries
      .filter(entry => !query || [entry.title, entry.username, entry.notes].some(value => String(value || '').toLowerCase().includes(query)))
      .sort((a, b) => a.title.localeCompare(b.title));

    els.entryList.replaceChildren(...visible.map(entryCard));
    els.entryCount.hidden = entries.length === 0;
    els.entryCount.textContent = entries.length === 1 ? '1 login' : `${entries.length} logins`;

    els.emptyState.hidden = visible.length > 0;
    els.emptyState.textContent = entries.length
      ? 'Nothing matches that search just yet.'
      : 'Our safe is empty and waiting. Add the first shared login with “Add a login”.';
  }

  function entryCard(entry) {
    const card = document.createElement('article');
    card.className = 'entry';
    card.dataset.id = entry.id;

    const head = document.createElement('div');
    head.className = 'entry-head';
    const mark = document.createElement('span');
    mark.className = 'entry-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = (entry.title.trim().charAt(0) || '🔑').toUpperCase();
    const headText = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'entry-title';
    title.textContent = entry.title;
    headText.appendChild(title);
    if (entry.notes) {
      const notes = document.createElement('p');
      notes.className = 'entry-notes';
      notes.textContent = entry.notes;
      headText.appendChild(notes);
    }
    head.append(mark, headText);

    const fields = document.createElement('div');
    fields.className = 'fields';
    fields.append(fieldBlock(entry, 'username', 'Username'), fieldBlock(entry, 'password', 'Password'));

    const actions = document.createElement('div');
    actions.className = 'entry-actions';
    actions.append(miniButton('Edit', 'edit'), miniButton('Remove', 'delete', 'danger'));

    card.append(head, fields, actions);
    return card;
  }

  function fieldBlock(entry, key, label) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const top = document.createElement('div');
    top.className = 'field-top';
    const name = document.createElement('span');
    name.className = 'field-label';
    name.textContent = label;
    top.appendChild(name);
    if (entry[key]) {
      const copy = miniButton('Copy', 'copy');
      copy.dataset.field = key;
      top.appendChild(copy);
    }

    const value = document.createElement('div');
    value.className = 'field-value';
    if (!entry[key]) {
      value.textContent = 'not saved';
      value.classList.add('is-empty');
    } else if (key === 'password' && !state.revealed.has(entry.id)) {
      value.textContent = '••••••••••';
      const reveal = miniButton('Show', 'reveal');
      reveal.dataset.field = key;
      reveal.setAttribute('aria-pressed', 'false');
      value.appendChild(reveal);
    } else {
      value.textContent = entry[key];
      if (key === 'password') {
        const hide = miniButton('Hide', 'reveal');
        hide.dataset.field = key;
        hide.setAttribute('aria-pressed', 'true');
        value.appendChild(hide);
      }
    }

    wrap.append(top, value);
    return wrap;
  }

  function miniButton(label, action, extraClass) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mini' + (extraClass ? ` ${extraClass}` : '');
    button.dataset.action = action;
    button.textContent = label;
    return button;
  }

  /* ---------- entry actions ---------- */

  function entryById(id) {
    return state.data ? state.data.entries.find(entry => entry.id === id) : null;
  }

  async function copyValue(value, label) {
    if (!value) { flash(`No ${label.toLowerCase()} saved for this one`); return; }
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else fallbackCopy(value);
      flash(`${label} copied`);
    } catch {
      try {
        fallbackCopy(value);
        flash(`${label} copied`);
      } catch {
        flash('Couldn’t copy — try showing it and selecting by hand');
      }
    }
  }

  function fallbackCopy(value) {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (!copied) throw new Error('Copy was blocked.');
  }

  function toggleRevealed(id) {
    if (state.revealed.has(id)) state.revealed.delete(id);
    else state.revealed.add(id);
    render();
    const card = els.entryList.querySelector(`.entry[data-id="${CSS.escape(id)}"]`);
    const button = card && card.querySelector('button[data-action="reveal"]');
    if (button) button.focus();
  }

  function openEntryDialog(entry) {
    state.editingId = entry ? entry.id : null;
    els.entryDialogTitle.textContent = entry ? 'Edit this login' : 'Add to our safe';
    els.saveEntry.textContent = entry ? 'Save changes' : 'Save it';
    els.entryTitle.value = entry ? entry.title : '';
    els.entryUsername.value = entry ? entry.username : '';
    els.entryPassword.value = entry ? entry.password : '';
    els.entryNotes.value = entry ? entry.notes : '';
    els.entryPassword.type = 'password';
    els.toggleEntryPassword.textContent = 'Show';
    els.toggleEntryPassword.setAttribute('aria-pressed', 'false');
    setStatus(els.entryStatus, '');
    els.entryDialog.showModal();
    els.entryTitle.focus();
  }

  function closeEntryDialog() {
    state.editingId = null;
    if (els.entryDialog.open) els.entryDialog.close();
  }

  async function deleteEntry(entry) {
    const sure = await window.siteDialog.confirm(`“${entry.title}” will be removed from our safe for both of us.`, {
      eyebrow: 'A little tidy-up',
      title: 'Remove this login?',
      confirmText: 'Remove it',
      cancelText: 'Keep it'
    });
    if (!sure) return;
    state.revealed.delete(entry.id);
    state.data.entries = state.data.entries.filter(item => item.id !== entry.id);
    try {
      await persist();
      render();
      flash('Removed from our safe');
    } catch (error) {
      setStatus(els.safeStatus, error.message);
    }
  }

  function generatePassword(length = 20) {
    const randomIndex = max => {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0] % max;
    };
    const characters = PASSWORD_SETS.map(set => set[randomIndex(set.length)]);
    while (characters.length < length) characters.push(PASSWORD_ALPHABET[randomIndex(PASSWORD_ALPHABET.length)]);
    for (let index = characters.length - 1; index > 0; index--) {
      const swap = randomIndex(index + 1);
      [characters[index], characters[swap]] = [characters[swap], characters[index]];
    }
    return characters.join('').slice(0, length);
  }

  /* ---------- setup, unlock, lock ---------- */

  async function createSafe(event) {
    event.preventDefault();
    const passphrase = els.setupPassphrase.value;
    const confirm = els.setupConfirm.value;
    if (passphrase.length < 10) { setStatus(els.setupStatus, 'Make it at least 10 characters so it’s worth keeping.'); els.setupPassphrase.focus(); return; }
    if (passphrase !== confirm) { setStatus(els.setupStatus, 'Those two don’t match yet — try the second one again.'); els.setupConfirm.focus(); return; }

    setBusy(els.setupButton, true, 'Making our safe…');
    setStatus(els.setupStatus, 'Scrambling everything in this browser…');
    try {
      const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
      const key = await deriveKey(passphrase, salt, ITERATIONS);
      const data = { version: 1, entries: [], updatedAt: new Date().toISOString() };
      const blob = await seal(key, data, salt, ITERATIONS);
      const saved = await api('POST', { action: 'save', vault: blob });
      state.key = key;
      state.salt = salt;
      state.data = data;
      state.blob = saved.vault || blob;
      els.setupForm.reset();
      setStatus(els.setupStatus, '');
      els.setupStrength.textContent = '';
      showSafe('Our safe is ready. Add the first login whenever we like.');
      flash('Our safe is ready');
    } catch (error) {
      setStatus(els.setupStatus, error.message || 'Our safe couldn’t be made just now. Please try again.');
    } finally {
      setBusy(els.setupButton, false, 'Create our safe');
    }
  }

  async function unlockSafe(event) {
    event.preventDefault();
    const passphrase = els.unlockPassphrase.value;
    if (!passphrase) return;

    setBusy(els.unlockButton, true, 'Unlocking…');
    setStatus(els.unlockStatus, 'Unscrambling in this browser only…');
    try {
      const blob = await ensureBlob();
      if (!blob) {
        state.blob = null;
        showSetup('There isn’t a safe yet — make one with a passphrase we’ll both remember.');
        return;
      }
      const opened = await unseal(blob, passphrase);
      state.key = opened.key;
      state.salt = opened.salt;
      state.data = opened.data;
      state.blob = blob;
      state.revealed.clear();
      state.query = '';
      els.searchInput.value = '';
      els.unlockPassphrase.value = '';
      els.unlockForm.reset();
      render();
      showSafe('Unlocked for a little while. It will lock itself when we wander off.');
    } catch (error) {
      const wrongPassphrase = error && (error.name === 'OperationError' || error.name === 'DataError');
      setStatus(els.unlockStatus, wrongPassphrase
        ? 'That passphrase didn’t open it. Take a breath and try again.'
        : (error.message || 'Our safe couldn’t be opened just now.'));
      els.unlockPassphrase.select();
    } finally {
      setBusy(els.unlockButton, false, 'Open our safe');
    }
  }

  function forgetEverything() {
    state.key = null;
    state.data = null;
    state.salt = null;
    state.revealed.clear();
    state.query = '';
    state.editingId = null;
    window.clearTimeout(state.idleTimer);
    state.idleTimer = 0;
    els.searchInput.value = '';
    els.entryList.replaceChildren();
    els.emptyState.hidden = true;
    els.entryCount.hidden = true;
    if (els.entryDialog.open) els.entryDialog.close();
    setStatus(els.safeStatus, '');
    setStatus(els.entryStatus, '');
  }

  function lockNow(message) {
    forgetEverything();
    showLock(message || 'Locked. Type our passphrase when we’re ready to peek inside.');
    flash('Our safe is locked');
  }

  function bumpIdle() {
    if (!state.key) return;
    window.clearTimeout(state.idleTimer);
    state.idleTimer = window.setTimeout(() => {
      if (!state.key) return;
      forgetEverything();
      showLock('It locked itself while we were away. Type our passphrase to carry on.');
      flash('Our safe locked itself');
    }, IDLE_MS);
  }

  async function changePassphrase(event) {
    event.preventDefault();
    const passphrase = els.newPassphrase.value;
    const confirm = els.newConfirm.value;
    if (!state.key) { setStatus(els.changeStatus, 'Unlock our safe again before changing the passphrase.'); return; }
    if (passphrase.length < 10) { setStatus(els.changeStatus, 'Make the new one at least 10 characters.'); els.newPassphrase.focus(); return; }
    if (passphrase !== confirm) { setStatus(els.changeStatus, 'Those two don’t match yet — try the second one again.'); els.newConfirm.focus(); return; }

    setBusy(els.changeButton, true, 'Re-locking…');
    setStatus(els.changeStatus, 'Sealing everything with the new passphrase…');
    try {
      const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
      const key = await deriveKey(passphrase, salt, ITERATIONS);
      state.data.updatedAt = new Date().toISOString();
      const blob = await seal(key, state.data, salt, ITERATIONS);
      const saved = await api('POST', { action: 'save', vault: blob });
      state.key = key;
      state.salt = salt;
      state.blob = saved.vault || { ...blob, updatedAt: state.data.updatedAt };
      els.changeForm.reset();
      setStatus(els.changeStatus, 'New passphrase saved. Keep it somewhere safe — we can’t recover it.');
      flash('Our passphrase changed');
      bumpIdle();
    } catch (error) {
      setStatus(els.changeStatus, error.message || 'The passphrase couldn’t be changed just now.');
    } finally {
      setBusy(els.changeButton, false, 'Save new passphrase');
    }
  }

  async function eraseSafe(button) {
    const sure = await window.siteDialog.confirm('Every login inside our safe will be deleted for both of us, and the passphrase lock goes with it. This can’t be undone.', {
      eyebrow: 'One last check',
      title: 'Empty our safe?',
      confirmText: 'Erase everything',
      cancelText: 'Keep it'
    });
    if (!sure) return;

    const label = button ? button.textContent : '';
    setBusy(button, true, 'Erasing…');
    try {
      await api('POST', { action: 'erase' });
      forgetEverything();
      state.blob = null;
      showSetup('Our safe is empty and ready to start again with a fresh passphrase.');
      flash('Our safe is empty');
    } catch (error) {
      setStatus(els.safeStatus, error.message || 'Our safe couldn’t be erased just now.');
      flash('Couldn’t erase our safe');
    } finally {
      setBusy(button, false, label);
    }
  }

  /* ---------- small UI helpers ---------- */

  function setStatus(element, message) {
    if (!element) return;
    element.textContent = message || '';
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.idleLabel = button.textContent;
      button.textContent = label || 'One moment…';
      button.disabled = true;
    } else {
      button.disabled = false;
      button.textContent = label || button.dataset.idleLabel || button.textContent;
    }
  }

  function flash(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add('show');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => els.toast.classList.remove('show'), 2400);
  }

  function updateStrength() {
    const value = els.setupPassphrase.value;
    if (!value) { els.setupStrength.textContent = ''; return; }
    let score = 0;
    if (value.length >= 10) score++;
    if (value.length >= 16) score++;
    if (value.length >= 24) score++;
    if (/[^a-zA-Z]/.test(value)) score++;
    const words = ['a little short', 'getting cosy', 'nice and sturdy', 'lovely and long'];
    els.setupStrength.textContent = `Strength: ${words[Math.max(0, Math.min(words.length - 1, score - 1))]}`;
  }

  /* ---------- wiring ---------- */

  els.setupForm.addEventListener('submit', createSafe);
  els.unlockForm.addEventListener('submit', unlockSafe);
  els.changeForm.addEventListener('submit', changePassphrase);
  els.setupPassphrase.addEventListener('input', updateStrength);

  els.lockButton.addEventListener('click', () => lockNow());
  els.addEntryButton.addEventListener('click', () => openEntryDialog(null));
  els.cancelEntry.addEventListener('click', closeEntryDialog);
  els.startOverButton.addEventListener('click', () => eraseSafe(els.startOverButton));
  els.eraseButton.addEventListener('click', () => eraseSafe(els.eraseButton));

  els.searchInput.addEventListener('input', () => {
    state.query = els.searchInput.value;
    render();
  });

  els.entryList.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('.entry');
    const entry = card ? entryById(card.dataset.id) : null;
    if (!entry) return;
    const action = button.dataset.action;
    if (action === 'copy') copyValue(entry[button.dataset.field], button.dataset.field === 'password' ? 'Password' : 'Username');
    else if (action === 'reveal') toggleRevealed(entry.id);
    else if (action === 'edit') openEntryDialog(entry);
    else if (action === 'delete') deleteEntry(entry);
  });

  els.entryForm.addEventListener('submit', async event => {
    event.preventDefault();
    const title = els.entryTitle.value.trim();
    if (!title) { setStatus(els.entryStatus, 'Give it a name so we know what it’s for.'); els.entryTitle.focus(); return; }
    if (!state.key || !state.data) { setStatus(els.entryStatus, 'Our safe locked itself. Unlock it again to save this login.'); return; }

    const wasEditing = Boolean(state.editingId);
    const now = new Date().toISOString();
    let entry = state.editingId ? entryById(state.editingId) : null;
    if (!entry) {
      entry = { id: crypto.randomUUID(), title, username: '', password: '', notes: '', createdAt: now, updatedAt: now };
      state.data.entries.push(entry);
      state.editingId = entry.id;
    }
    entry.title = title;
    entry.username = els.entryUsername.value.trim();
    entry.password = els.entryPassword.value;
    entry.notes = els.entryNotes.value.trim();
    entry.updatedAt = now;

    setBusy(els.saveEntry, true, 'Saving…');
    setStatus(els.entryStatus, 'Sealing it in our safe…');
    try {
      await persist();
      closeEntryDialog();
      render();
      flash(wasEditing ? 'Login updated' : 'Added to our safe');
    } catch (error) {
      setStatus(els.entryStatus, error.message || 'That login couldn’t be saved just now.');
    } finally {
      setBusy(els.saveEntry, false, 'Save it');
      if (state.editingId) els.saveEntry.textContent = 'Save changes';
    }
  });

  els.toggleEntryPassword.addEventListener('click', () => {
    const showing = els.entryPassword.type === 'text';
    els.entryPassword.type = showing ? 'password' : 'text';
    els.toggleEntryPassword.textContent = showing ? 'Show' : 'Hide';
    els.toggleEntryPassword.setAttribute('aria-pressed', String(!showing));
  });

  els.generatePassword.addEventListener('click', () => {
    els.entryPassword.value = generatePassword(20);
    els.entryPassword.type = 'text';
    els.toggleEntryPassword.textContent = 'Hide';
    els.toggleEntryPassword.setAttribute('aria-pressed', 'true');
    setStatus(els.entryStatus, 'A long random one — save it here, then pop it into the account.');
  });

  els.entryDialog.addEventListener('click', event => {
    if (event.target === els.entryDialog) closeEntryDialog();
  });

  ['pointerdown', 'keydown'].forEach(name => document.addEventListener(name, () => bumpIdle(), { passive: true }));

  async function start() {
    updateStrength();
    try {
      const blob = await ensureBlob();
      if (blob) {
        showLock();
      } else {
        state.blob = null;
        showSetup('No safe yet. Choose a passphrase we’ll both remember to make one.');
      }
    } catch (error) {
      showLock(error.message || 'Our little safe couldn’t be reached just now. Try again in a moment.');
    }
  }

  start();
})();
