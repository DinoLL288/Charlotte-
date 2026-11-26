import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_URL = 'https://charlotte-3ts.pages.dev/api/trackers';

// Sample of the real /api/trackers payload (same shape the live endpoint
// returns; see functions/api/trackers.js). Every JSONPath the presets use
// must resolve against this.
const SAMPLE_PAYLOAD = {
  updatedAt: '2026-11-26T13:23:31.408Z',
  mood: {
    Charlotte: { emoji: '😔', label: 'Low', intensity: 3, date: '2026-11-21', time: '2026-11-21T15:25:22.211Z' },
    Luke: { emoji: '😊', label: 'Happy', intensity: 4, date: '2026-11-23', time: '2026-11-23T13:54:04.421Z' },
  },
  bathroom: {
    Charlotte: { away: false, startedAt: null, returnedAt: '2026-11-15T09:01:54.549Z', today: 0, lastAt: '2026-11-20T14:32:00.000Z', lastAction: 'return' },
    Luke: { away: false, startedAt: null, returnedAt: '2026-11-26T10:09:26.580Z', today: 1, lastAt: '2026-11-26T10:09:26.580Z', lastAction: 'return' },
  },
};

// Minimal ZIP reader (no dependency): walks the central directory, then
// reads each entry's data from its local header. Handles stored + deflated.
function readZip(buffer) {
  // Find the End Of Central Directory record.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.notEqual(eocd, -1, 'no End Of Central Directory record found');
  const count = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    assert.equal(buffer.readUInt32LE(p), 0x02014b50, 'bad central directory signature');
    const method = buffer.readUInt16LE(p + 10);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const name = buffer.toString('utf8', p + 46, p + 46 + nameLen);
    const local = localOffset;
    assert.equal(buffer.readUInt32LE(local), 0x04034b50, 'bad local header signature');
    const localNameLen = buffer.readUInt16LE(local + 26);
    const localExtraLen = buffer.readUInt16LE(local + 28);
    const dataStart = local + 30 + localNameLen + localExtraLen;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(raw) : method === 0 ? raw : null;
    assert.notEqual(data, null, `unsupported zip method ${method} for ${name}`);
    entries.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function resolvePath(payload, path) {
  // Dot path like ".mood.Charlotte.emoji" (leading dot, no brackets).
  assert.ok(path.startsWith('.'), `JSONPath must start with a dot: ${path}`);
  let current = payload;
  for (const key of path.slice(1).split('.')) {
    assert.ok(current !== null && typeof current === 'object', `cannot walk past ${key} in ${path}`);
    assert.ok(key in current, `JSONPath ${path} is missing key ${key}`);
    current = current[key];
  }
  return current; // null is a valid value (e.g. startedAt when back)
}

function loadPreset(file) {
  const buffer = readFileSync(join(ROOT, 'widgets', 'kwgt', file));
  const entries = readZip(buffer);
  assert.deepEqual(
    entries.map((e) => e.name),
    ['preset.json', 'preset_thumb_landscape.jpg', 'preset_thumb_portrait.jpg'],
    `${file}: expected preset.json first, then both thumbnails`,
  );
  const preset = JSON.parse(entries[0].data.toString('utf8'));
  for (const thumb of entries.slice(1)) {
    assert.equal(thumb.data[0], 0xff, `${file}: ${thumb.name} is not a JPEG`);
    assert.equal(thumb.data[1], 0xd8, `${file}: ${thumb.name} is not a JPEG`);
  }
  return preset;
}

const EXPECTED = {
  'mood.kwgt': {
    title: 'Mood — Charlotte & Luke',
    tapUrl: 'https://charlotte-3ts.pages.dev/mood.html',
    heading: "How we're feeling",
  },
  'bathroom.kwgt': {
    title: 'Bathroom — Charlotte & Luke',
    tapUrl: 'https://charlotte-3ts.pages.dev/bathroom.html?toggle=Luke',
    heading: 'Bathroom check-ins',
  },
};

for (const [file, expected] of Object.entries(EXPECTED)) {
  test(`${file} is a valid KWGT preset`, () => {
    const preset = loadPreset(file);
    assert.equal(preset.preset_info.title, expected.title);
    assert.equal(preset.preset_info.width, 960);
    assert.equal(preset.preset_info.height, 300);
    assert.ok(preset.preset_info.version >= 1);

    const root = preset.preset_root;
    assert.equal(root.internal_type, 'RootLayerModule');
    assert.equal(root.background_color, '#FF0D2C44');
    assert.equal(root.globals_list.api_url.value, API_URL);
    assert.equal(root.globals_list.api_url.type, 'TEXT');

    const items = root.viewgroup_items;
    assert.ok(Array.isArray(items) && items.length >= 9, 'expected heading, 6 row texts, footer, tap layer');

    // Heading and footer are the static texts.
    const texts = items.filter((m) => m.internal_type === 'TextModule');
    assert.equal(texts[0].text_expression, expected.heading);
    assert.equal(texts[texts.length - 1].text_expression.startsWith('Tap to'), true);

    // Every module's box (centre-anchored on its offset) stays on canvas.
    for (const m of items) {
      const w = m.text_width ?? m.shape_width;
      const h = m.text_height ?? m.shape_height;
      if (w === undefined || h === undefined) continue;
      const left = 480 + (m.position_offset_x ?? 0) - w / 2;
      const top = 150 + (m.position_offset_y ?? 0) - h / 2;
      assert.ok(left >= 0 && top >= 0, `${m.internal_title} starts off-canvas`);
      assert.ok(left + w <= 960 && top + h <= 300, `${m.internal_title} runs off-canvas`);
    }

    // Every formula is balanced and only uses functions we expect, and
    // every wg() JSONPath resolves against the real API payload shape.
    const allowedFns = new Set(['wg', 'gv', 'if', 'tf']);
    for (const m of texts) {
      const expr = m.text_expression;
      if (!expr.includes('$')) continue;
      assert.equal((expr.match(/\$/g) || []).length, 2, `${m.internal_title}: formula must open and close with $`);
      let depth = 0;
      for (const ch of expr) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        assert.ok(depth >= 0, `${m.internal_title}: unbalanced parens in ${expr}`);
      }
      assert.equal(depth, 0, `${m.internal_title}: unbalanced parens in ${expr}`);
      for (const fn of expr.matchAll(/([a-z]+)\(/g)) {
        assert.ok(allowedFns.has(fn[1]), `${m.internal_title}: unexpected function ${fn[1]}`);
      }
      for (const wgCall of expr.matchAll(/wg\(gv\(API_URL\), json, (\.[A-Za-z0-9_.]+)\)/g)) {
        resolvePath(SAMPLE_PAYLOAD, wgCall[1]);
      }
      assert.ok(expr.includes('wg(gv(API_URL), json, .') || !expr.includes('wg('),
        `${m.internal_title}: wg() must fetch via gv(API_URL)`);
    }

    // The tap layer is a full-canvas transparent shape whose SINGLE_TAP
    // opens the right page (bathroom opens ?toggle=Luke).
    const tap = items.find((m) => m.internal_type === 'ShapeModule');
    assert.ok(tap, 'missing tap shape');
    assert.equal(tap.paint_color, '#00000000');
    assert.equal(tap.shape_width, 960);
    assert.equal(tap.shape_height, 300);
    const event = (tap.internal_events || []).find((e) => e.type === 'SINGLE_TAP');
    assert.ok(event, 'tap shape has no SINGLE_TAP event');
    assert.equal(event.action, 'LAUNCH_APP');
    const data = event.intent.match(/data=([^;]+);end$/);
    assert.ok(data, `tap intent has no data URL: ${event.intent}`);
    assert.equal(data[1], expected.tapUrl);
  });
}

test('widgets.html links the KWGT presets and is honest about Pro', () => {
  const html = readFileSync(join(ROOT, 'widgets.html'), 'utf8');
  assert.ok(html.includes('/widgets/kwgt/mood.kwgt'), 'widgets.html must link mood.kwgt');
  assert.ok(html.includes('/widgets/kwgt/bathroom.kwgt'), 'widgets.html must link bathroom.kwgt');
  assert.ok(html.includes('KWGT'), 'widgets.html must have an Android/KWGT section');
  assert.ok(html.includes('Pro'), 'widgets.html must say importing presets needs the paid KWGT Pro key');
});
