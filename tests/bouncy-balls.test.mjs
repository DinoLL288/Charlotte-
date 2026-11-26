import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'assets/js/ui-bouncy-balls.js'), 'utf8');

test('balls land on the bottom of the page — the bottom of where you can scroll to', () => {
  // The ground is the bottom of the whole document (pageHeight), not the
  // bottom of the screen you can see. Balls fall all the way to the very
  // bottom of the page and pile up there, so when you scroll all the way
  // down you find the pile. They must not use the viewport bottom.
  assert.match(src, /if \(ball\.y >= pageHeight - ball\.radius - 2\)/, 'ground check uses the document bottom');
  assert.match(src, /ball\.y = pageHeight - ball\.radius;/, 'balls are clamped to the document bottom');
  assert.doesNotMatch(src, /function groundY\(\)/, 'no viewport-bottom ground helper');
  assert.doesNotMatch(src, /scrollY \+ height - ball\.radius/, 'ground is not the viewport bottom');
});

test('collected balls pile at the bottom of the page', () => {
  assert.match(src, /state\.pile\.push\(\{ x: ball\.x, y: pageHeight - ball\.radius/, 'pile entries sit on the document bottom');
  // The pile is drawn at its stored position (document coordinates minus
  // the scroll), so it sits at the bottom of the page and you see it when
  // you scroll all the way down.
  assert.match(src, /const py = b\.y - scrollY;/, 'pile is drawn at the bottom of the page');
});

test('balls spawn just above the top of the screen you can see', () => {
  assert.match(src, /let y = scrollY \+ random\(-120, -radius\);/, 'balls spawn just above the visible top');
});
