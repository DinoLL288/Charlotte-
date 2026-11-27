import test from 'node:test';
import assert from 'node:assert/strict';
// The client module touches the DOM at the bottom, so only import it
// in a test that stubs the DOM pieces it needs. Node has no DOM, so
// these tests exercise the pure helpers via a light DOM shim.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const clientPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'js', 'wishlist.js');
const source = readFileSync(clientPath, 'utf8');

// Pull the two pure helpers out of the client source and evaluate
// them on their own, so the DOM code at the bottom never runs.
function extractHelpers() {
  const start = source.indexOf('export function parsePrice');
  const end = source.indexOf('const user =');
  const code = source.slice(start, end).replace(/export /g, '');
  const fn = new Function(`${code}; return { parsePrice, formatPrice, boughtCount };`);
  return fn();
}

const { parsePrice, formatPrice, boughtCount } = extractHelpers();

test('client parsePrice accepts "$25", "25" and "25.50"', function () {
  assert.equal(parsePrice('$25'), 25);
  assert.equal(parsePrice('25'), 25);
  assert.equal(parsePrice('25.50'), 25.5);
  assert.equal(parsePrice('$1,299.99'), 1299.99);
});

test('client parsePrice ignores a bad price rather than crashing', function () {
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice('abc'), null);
  assert.equal(parsePrice('$'), null);
  assert.equal(parsePrice('25.999'), null);
  assert.equal(parsePrice('-5'), null);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice(undefined), null);
});

test('client formatPrice shows whole dollars without cents', function () {
  assert.equal(formatPrice(25), '$25');
  assert.equal(formatPrice(25.5), '$25.50');
  assert.equal(formatPrice(null), null);
});

test('boughtCount counts bought items out of the total', function () {
  assert.deepEqual(boughtCount([
    { bought: true }, { bought: false }, { bought: true }
  ]), { bought: 2, total: 3 });
  assert.deepEqual(boughtCount([]), { bought: 0, total: 0 });
  assert.deepEqual(boughtCount(null), { bought: 0, total: 0 });
});
