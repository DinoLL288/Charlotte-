// Shared bucket list — things Luke and Charlotte want to do together.
// Pure helpers are exported so tests can check the ordering without a DOM.

// Undone items first, in the order they were added; done items after,
// most recently ticked first. Returns a new array, never mutates.
export function sortBucketItems(items) {
  const list = Array.isArray(items) ? [...items] : [];
  const undone = list.filter(item => item && !item.done);
  const done = list
    .filter(item => item && item.done)
    .sort((a, b) => String(b.doneAt || b.addedAt || '').localeCompare(String(a.doneAt || a.addedAt || '')));
  return [...undone, ...done];
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDoneDate(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// --- Browser wiring: list UI, add, tick off, delete. ---
if (typeof document !== 'undefined' && typeof fetch !== 'undefined') {
  (function initBucketList() {
    const user = localStorage.getItem('charlotte-user') || 'Unknown';
    const listEl = document.getElementById('bucketList');
    const countEl = document.getElementById('bucketCount');
    const progressEl = document.getElementById('bucketProgress');
    const addInput = document.getElementById('bucketAddInput');
    const addButton = document.getElementById('bucketAddButton');
    const addStatus = document.getElementById('bucketAddStatus');
    if (!listEl) return;

    let items = [];

    function render() {
      const done = items.filter(item => item.done).length;
      const total = items.length;
      if (countEl) countEl.textContent = total ? `${done} of ${total} done` : 'Nothing on the list yet';
      if (progressEl) {
        progressEl.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
      }
      if (!total) {
        listEl.innerHTML = '<span style="color:#6a8292;font-size:.9rem">Add the first thing you want to do together — a place, a trip, a silly little dream.</span>';
        return;
      }
      listEl.innerHTML = sortBucketItems(items).map(item => {
        const doneOn = item.done && item.doneAt ? `done on ${escapeHtml(formatDoneDate(item.doneAt))}` : '';
        const doneBy = item.done && item.doneBy && item.doneBy !== 'Unknown' ? ` · by ${escapeHtml(item.doneBy)}` : '';
        const addedBy = item.addedBy && item.addedBy !== 'Unknown' ? ` · added by ${escapeHtml(item.addedBy)}` : '';
        return `<div class="bucket-item${item.done ? ' done' : ''}">
          <button class="bucket-tick" type="button" data-toggle="${escapeHtml(item.id)}" aria-label="${item.done ? 'Untick' : 'Tick off'} ${escapeHtml(item.text)}">${item.done ? '✓' : ''}</button>
          <div class="bucket-info">
            <strong>${escapeHtml(item.text)}</strong>
            <span>${item.done ? `${doneOn}${doneBy}` : `added${addedBy}`}</span>
          </div>
          <button class="button danger small" type="button" data-remove="${escapeHtml(item.id)}">Remove</button>
        </div>`;
      }).join('');
      listEl.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => toggleItem(btn.dataset.toggle)));
      listEl.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => removeItem(btn.dataset.remove)));
    }

    async function load() {
      try {
        const res = await fetch('/api/bucket-list', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Could not load the bucket list');
        items = Array.isArray(json.items) ? json.items : [];
      } catch (e) {
        listEl.innerHTML = `<span style="color:#8a3b2e;font-size:.9rem">The bucket list could not load — ${escapeHtml(e.message || 'it may need the live site, not this preview.')}</span>`;
        return;
      }
      render();
    }

    async function post(payload) {
      const res = await fetch('/api/bucket-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not save');
      if (Array.isArray(json.items)) items = json.items;
      render();
      return json;
    }

    async function addItem() {
      const text = addInput.value.trim();
      if (!text) {
        addStatus.textContent = 'Write something for the bucket list first.';
        return;
      }
      addButton.disabled = true;
      addStatus.textContent = 'Adding…';
      try {
        await post({ action: 'add', text, addedBy: user });
        addInput.value = '';
        addStatus.textContent = 'Added to the list.';
      } catch (e) {
        addStatus.textContent = e.message || 'Could not add it';
      } finally {
        addButton.disabled = false;
      }
    }

    async function toggleItem(id) {
      const item = items.find(v => v && v.id === id);
      if (!item) return;
      try {
        await post({ action: 'toggle', id, done: !item.done, doneBy: user });
      } catch (e) {
        addStatus.textContent = e.message || 'Could not update it';
      }
    }

    async function removeItem(id) {
      const item = items.find(v => v && v.id === id);
      if (!item) return;
      if (!window.confirm(`Remove “${item.text}” from the bucket list?`)) return;
      try {
        await post({ action: 'remove', id });
      } catch (e) {
        addStatus.textContent = e.message || 'Could not remove it';
      }
    }

    addButton.addEventListener('click', addItem);
    addInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') addItem();
    });
    load();
  })();
}
