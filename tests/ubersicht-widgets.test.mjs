import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const widgets = [
  { name: 'bathroom', dir: 'widgets/ubersicht/bathroom.widget' },
  { name: 'mood', dir: 'widgets/ubersicht/mood.widget' },
];

for (const { name, dir } of widgets) {
  test(`ubersicht ${name} widget exists and is a valid widget module`, () => {
    const src = read(`${dir}/index.jsx`);
    assert.match(src, /https:\/\/charlotte-3ts\.pages\.dev\/api\/trackers/, 'reads the public trackers summary');
    assert.match(src, /export const command/, 'exports command');
    assert.match(src, /export const refreshFrequency = 15000/, 'refreshes every 15 seconds');
    assert.match(src, /export const updateState/, 'exports updateState');
    assert.match(src, /export const initialState/, 'exports initialState');
    assert.match(src, /export const render/, 'exports render');
    assert.match(src, /export const className/, 'exports className (position)');
    assert.match(src, /from 'uebersicht'/, 'imports from the ubersicht module');
    assert.match(src, /#0d2c44/, 'uses the site navy');
    assert.match(src, /#f6d365/, 'uses the site gold');
  });

  test(`ubersicht ${name} widget has a downloadable zip`, () => {
    const zipPath = join(root, `${dir}.zip`);
    assert.ok(existsSync(zipPath), `${dir}.zip exists`);
    const buf = readFileSync(zipPath);
    assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK', 'zip starts with PK magic');
    assert.ok(buf.length > 1000, 'zip is not empty');
    assert.ok(buf.includes(`${name}.widget/index.jsx`), 'zip contains the widget index.jsx');
  });
}

test('ubersicht bathroom widget toggles via a direct API POST', () => {
  const src = read('widgets/ubersicht/bathroom.widget/index.jsx');
  assert.match(src, /api\/question-room/, 'posts to the question-room API');
  assert.match(src, /action: 'bathroom'/, 'posts a bathroom action');
  assert.match(src, /user: USER/, 'posts for the configured user');
  assert.match(src, /const USER = 'Luke'/, 'configured for Luke');
  assert.match(src, /run\('curl -s -X POST /, 'runs the POST with curl on click');
  assert.match(src, /optimisticAway/, 'shows the new state immediately after a tap');
});

test('ubersicht mood widget opens the mood page on click', () => {
  const src = read('widgets/ubersicht/mood.widget/index.jsx');
  assert.match(src, /mood\.html/, 'knows the mood page');
  assert.match(src, /run\('open ' \+ MOOD_PAGE\)/, 'opens the mood page on click');
});

test('widgets page offers the ubersicht widgets and setup', () => {
  const page = read('widgets.html');
  assert.match(page, /widgets\/ubersicht\/bathroom\.widget\.zip/, 'page links the bathroom zip');
  assert.match(page, /widgets\/ubersicht\/mood\.widget\.zip/, 'page links the mood zip');
  assert.match(page, /widgets\/ubersicht\/bathroom\.widget\/index\.jsx/, 'page offers the bathroom script copy');
  assert.match(page, /widgets\/ubersicht\/mood\.widget\/index\.jsx/, 'page offers the mood script copy');
  assert.match(page, /Set them up — Mac \(Übersicht\)/, 'page has Übersicht setup steps');
  assert.match(page, /interaction shortcut/, 'page explains the interaction shortcut');
  assert.match(page, /Accessibility/, 'page explains the Accessibility requirement');
  assert.match(page, /ScriptWidget/, 'page still documents ScriptWidget');
});
