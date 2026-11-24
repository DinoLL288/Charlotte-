// Calendar page wiring for "Add shifts from a screenshot".
// The screenshot is read entirely in this browser with Tesseract.js:
// it is never uploaded, never sent to the server and never stored.
// Only the shift details the user ticks and confirms are saved,
// as calendar events through the existing /api/calendar endpoint.
import { parseRosterText, buildShiftEvent } from './roster-scan.js';

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

const fileInput = document.getElementById('rosterFile');
const statusEl = document.getElementById('rosterStatus');
const previewEl = document.getElementById('rosterPreview');
const saveButton = document.getElementById('saveRosterShifts');

let foundShifts = [];

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_CDN;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('Could not load the text reader.'));
    document.head.appendChild(script);
  });
}

function formatDayLabel(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function formatClock24(value) {
  if (!value) return '';
  const parts = value.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value;
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function renderPreview() {
  if (!previewEl) return;
  previewEl.innerHTML = '';
  foundShifts.forEach((shift, index) => {
    const label = document.createElement('label');
    label.className = 'roster-shift';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.index = String(index);
    checkbox.setAttribute('aria-label', `Add shift on ${formatDayLabel(shift.date)}`);

    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = formatDayLabel(shift.date);
    const details = document.createElement('small');
    const times = [formatClock24(shift.startTime), formatClock24(shift.endTime)]
      .filter(Boolean)
      .join(' – ');
    details.textContent = [
      times,
      shift.location,
      shift.role,
      shift.breakText ? `Break ${shift.breakText}` : '',
      shift.hours
    ].filter(Boolean).join(' · ');
    text.append(title, details);

    label.append(checkbox, text);
    previewEl.appendChild(label);
  });
  previewEl.hidden = foundShifts.length === 0;
  if (saveButton) saveButton.hidden = foundShifts.length === 0;
}

if (fileInput) {
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    foundShifts = [];
    renderPreview();
    setStatus('Reading your screenshot…');
    if (saveButton) saveButton.disabled = true;
    // The file is only ever read locally for OCR; the object URL is
    // released as soon as the read finishes.
    const objectUrl = URL.createObjectURL(file);
    try {
      const Tesseract = await loadTesseract();
      const result = await Tesseract.recognize(objectUrl, 'eng');
      const text = (result && result.data && result.data.text) || '';
      foundShifts = parseRosterText(text);
      if (!foundShifts.length) {
        setStatus('No shifts found in that image. Try a clearer screenshot of the roster.');
        return;
      }
      renderPreview();
      setStatus(`Found ${foundShifts.length} shift${foundShifts.length === 1 ? '' : 's'} — tick the ones to add, then tap “Add to calendar”.`);
    } catch (error) {
      setStatus('Could not read that image. Check your connection and try again.');
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (saveButton) saveButton.disabled = false;
      fileInput.value = '';
    }
  });
}

if (saveButton) {
  saveButton.addEventListener('click', async () => {
    const author = localStorage.getItem('charlotte-user') || 'Us';
    const checked = [...previewEl.querySelectorAll('input[type="checkbox"]:checked')]
      .map(box => foundShifts[Number(box.dataset.index)])
      .filter(Boolean);
    if (!checked.length) {
      setStatus('Tick at least one shift to add.');
      return;
    }
    saveButton.disabled = true;
    setStatus(`Adding ${checked.length} shift${checked.length === 1 ? '' : 's'}…`);
    let added = 0;
    try {
      // One at a time: each save reads the latest calendar before writing.
      for (const shift of checked) {
        const payload = buildShiftEvent(shift, author);
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not save a shift');
        added += 1;
      }
      setStatus(`Added ${added} shift${added === 1 ? '' : 's'} to our calendar.`);
      foundShifts = [];
      renderPreview();
      if (typeof window.loadEvents === 'function') await window.loadEvents();
    } catch (error) {
      setStatus(`Added ${added} of ${checked.length} shifts — ${error.message}`);
    } finally {
      saveButton.disabled = false;
    }
  });
}
