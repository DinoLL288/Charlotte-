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

test('collected balls pile into a heap at the bottom of the page', () => {
  assert.match(src, /state\.pile\.push\(\{ x: ball\.x, y: pageHeight - ball\.radius/, 'pile entries sit on the document bottom');
  // Balls stack in columns where they landed, so the heap grows upward
  // instead of spreading in one flat row.
  assert.match(src, /PILE_MAX_ROWS = 6/, 'the heap stacks up to six rows high');
  assert.match(src, /const py = pageHeight - r - row \* PILE_ROW_H - scrollY;/, 'each ball is drawn stacked in its column at the bottom of the page');
  // When the heap is full the oldest ball makes way, so the pile stays
  // fresh instead of freezing with stale entries.
  assert.match(src, /if \(state\.pile\.length >= BASE\.maxPile\) state\.pile\.shift\(\);/, 'a full heap makes way for new balls');
});

test('balls spawn just above the top of the screen you can see', () => {
  assert.match(src, /let y = scrollY \+ random\(-120, -radius\);/, 'balls spawn just above the visible top');
});
