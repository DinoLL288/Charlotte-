// Wishlist — a shared list of things Luke and Charlotte want, or want
// to buy each other. Pure helpers are exported so tests can check the
// price parsing without a DOM.

// Parse a price the user typed: "$25", "25", "25.50", "$1,299.99" all
// become a number. A bad price is ignored (null) rather than an error,
// so a typo never blocks adding an item.
export function parsePrice(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/^\s*\$+/, '').replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

// Format a stored price for display: 25 -> "$25", 25.5 -> "$25.50".
export function formatPrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value % 1 === 0 ? `$${value}` : `$${value.toFixed(2)}`;
}

// How many of the list are bought, for the "2 of 8 bought" count.
export function boughtCount(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    bought: list.filter(v => v && v.bought).length,
    total: list.length
  };
}

const user = localStorage.getItem('charlotte-user') || 'Unknown';
let items = [];

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function itemRow(item) {
  const price = formatPrice(item.price);
  const meta = [
    `Added by ${escapeHtml(item.addedBy || 'Unknown')}`,
    item.addedAt ? formatDate(item.addedAt) : ''
  ].filter(Boolean).join(' · ');
  const boughtMeta = item.bought && item.boughtAt
    ? `Bought ${item.boughtBy ? `by ${escapeHtml(item.boughtBy)} · ` : ''}${formatDate(item.boughtAt)}`
    : '';
  const name = item.link
    ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>`
    : escapeHtml(item.name);
  return `<div class="wish-item${item.bought ? ' bought' : ''}" data-id="${escapeHtml(item.id)}">
    <div class="wish-info">
      <strong>${name}</strong>
      <span>${meta}${price ? ` · ${escapeHtml(price)}` : ''}</span>
      ${boughtMeta ? `<span class="wish-bought-meta">${boughtMeta}</span>` : ''}
    </div>
    <div class="wish-actions">
      <button type="button" class="button secondary small" data-toggle-bought="${escapeHtml(item.id)}">${item.bought ? 'Not bought' : 'Bought it'}</button>
      <button type="button" class="button danger small" data-remove="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)}">✕</button>
    </div>
  </div>`;
}

function render() {
  const count = boughtCount(items);
  document.getElementById('wishCount').textContent =
    count.total === 0
      ? 'Nothing on the list yet — add something you want, or something for each other.'
      : `${count.bought} of ${count.total} bought`;
  const open = items.filter(v => v && !v.bought);
  const done = items.filter(v => v && v.bought);
  const openEl = document.getElementById('wishOpen');
  const doneEl = document.getElementById('wishBought');
  const doneSection = document.getElementById('wishBoughtSection');
  openEl.innerHTML = open.length
    ? open.map(itemRow).join('')
    : '<span style="color:#6a8292;font-size:.9rem">Nothing waiting — add the first wish above.</span>';
  if (done.length) {
    doneSection.style.display = '';
    doneEl.innerHTML = done.map(itemRow).join('');
  } else {
    doneSection.style.display = 'none';
    doneEl.innerHTML = '';
  }
}

async function api(action, payload) {
  const res = await fetch('/api/wishlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong');
  return json;
}

async function load() {
  const listEl = document.getElementById('wishOpen');
  try {
    const res = await fetch('/api/wishlist');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Could not load the wishlist');
    items = Array.isArray(json.items) ? json.items : [];
  } catch (e) {
    listEl.innerHTML = `<span style="color:#8a3b2e;font-size:.9rem">The wishlist could not load — ${escapeHtml(e.message)}. It may need the live site, not this preview.</span>`;
    return;
  }
  render();
}

function setStatus(text) {
  document.getElementById('wishAddStatus').textContent = text || '';
}

document.getElementById('wishAddButton').addEventListener('click', async () => {
  const nameInput = document.getElementById('wishNameInput');
  const linkInput = document.getElementById('wishLinkInput');
  const priceInput = document.getElementById('wishPriceInput');
  const name = nameInput.value.trim();
  if (!name) {
    setStatus('Give it a name first.');
    nameInput.focus();
    return;
  }
  setStatus('Adding…');
  try {
    const json = await api('add', {
      name,
      link: linkInput.value.trim(),
      price: priceInput.value.trim(),
      addedBy: user
    });
    items = json.items || items;
    nameInput.value = '';
    linkInput.value = '';
    priceInput.value = '';
    setStatus('');
    render();
  } catch (e) {
    setStatus(e.message);
  }
});

document.getElementById('wishOpen').addEventListener('click', onListClick);
document.getElementById('wishBought').addEventListener('click', onListClick);

async function onListClick(ev) {
  const toggle = ev.target.closest('[data-toggle-bought]');
  const remove = ev.target.closest('[data-remove]');
  if (toggle) {
    const id = toggle.getAttribute('data-toggle-bought');
    const item = items.find(v => v && v.id === id);
    if (!item) return;
    try {
      const json = await api('bought', { id, bought: !item.bought, boughtBy: user });
      items = json.items || items;
      render();
    } catch (e) {
      setStatus(e.message);
    }
    return;
  }
  if (remove) {
    const id = remove.getAttribute('data-remove');
    const item = items.find(v => v && v.id === id);
    if (!item) return;
    if (!window.confirm(`Remove "${item.name}" from the wishlist?`)) return;
    try {
      const json = await api('remove', { id });
      items = json.items || items;
      render();
    } catch (e) {
      setStatus(e.message);
    }
  }
}

document.getElementById('wishingAs').textContent = `Wishing as ${user}.`;
load();
