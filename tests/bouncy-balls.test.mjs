import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'assets/js/ui-bouncy-balls.js'), 'utf8');

test('balls land on the bottom of the screen you can see, not the document bottom', () => {
  // The ground is the viewport bottom in document coordinates. On a page
  // taller than the screen, a document-bottom ground sits below the fold,
  // so balls fall past the bottom edge and only "land" where nobody can
  // see them — they look like they fall through.
  assert.match(src, /function groundY\(\) \{ return scrollY \+ height; \}/, 'groundY is the viewport bottom');
  assert.match(src, /if \(ball\.y >= groundY\(\) - ball\.radius - 2\)/, 'ground check uses the viewport bottom');
  assert.match(src, /ball\.y = groundY\(\) - ball\.radius;/, 'balls are clamped to the viewport bottom');
  assert.doesNotMatch(src, /if \(ball\.y >= pageHeight - ball\.radius/, 'ground no longer uses the document bottom');
});

test('collected balls pile at the bottom of the screen', () => {
  assert.match(src, /state\.pile\.push\(\{ x: ball\.x, y: groundY\(\) - ball\.radius/, 'pile entries sit on the viewport bottom');
  // The pile is drawn pinned to the viewport bottom, so it stays put when
  // you scroll (the stored y goes stale as soon as scrollY changes).
  assert.match(src, /const py = height - r;/, 'pile is drawn at the viewport bottom');
});

test('balls spawn just above the top of the screen you can see', () => {
  assert.match(src, /let y = scrollY \+ random\(-120, -radius\);/, 'balls spawn just above the visible top');
});
