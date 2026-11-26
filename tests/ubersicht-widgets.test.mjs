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
  { name: 'hide-toggle', dir: 'widgets/ubersicht/hide-toggle.widget' },
];

for (const { name, dir } of widgets) {
  test(`ubersicht ${name} widget exists and is a valid widget module`, () => {
    const src = read(`${dir}/index.jsx`);
    assert.match(src, /charlotte-3ts\.pages\.dev\/api\/trackers|\.charlotte-widgets-hidden/, 'reads the public trackers summary or the hide flag');
    assert.match(src, /export const command/, 'exports command');
    assert.match(src, /export const refreshFrequency = 5000/, 'refreshes every 5 seconds');
    assert.match(src, /export const updateState/, 'exports updateState');
    assert.match(src, /export const initialState/, 'exports initialState');
    assert.match(src, /export const render/, 'exports render');
    assert.match(src, /export const className/, 'exports className (position)');
    assert.match(src, /from 'uebersicht'/, 'imports from the ubersicht module');
    assert.match(src, /#0d2c44/, 'uses the site navy');
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

test('ubersicht mood widget logs a mood from the widget itself', () => {
  const src = read('widgets/ubersicht/mood.widget/index.jsx');
  assert.match(src, /api\/question-room/, 'posts to the question-room API');
  assert.match(src, /action: 'mood'/, 'posts a mood action');
  assert.match(src, /user: USER/, 'posts for the configured user');
  assert.match(src, /const USER = 'Luke'/, 'configured for Luke');
  assert.match(src, /run\('curl -s -X POST /, 'runs the POST with curl on tap');
  assert.match(src, /stopPropagation/, 'a mood tap does not also open the mood page');
  assert.match(src, /justLogged/, 'shows the logged mood right away');
  for (const emoji of ['🥰', '😊', '💛', '🌙', '🤔', '😤', '😔', '😢', '😰', '😠', '😞', '😶', '😭']) {
    assert.ok(src.includes(emoji), `picker includes ${emoji}`);
  }
});

test('ubersicht bathroom and mood widgets hide when the flag file exists', () => {
  for (const name of ['bathroom', 'mood']) {
    const src = read(`widgets/ubersicht/${name}.widget/index.jsx`);
    assert.match(src, /\.charlotte-widgets-hidden/, `${name} knows the hide flag file`);
    assert.match(src, /test -f .*FLAG.*&& echo HIDDEN \|\| curl/, `${name} checks the flag before fetching`);
    assert.match(src, /if \(hidden\) return \(<div \/>\)/, `${name} renders nothing while hidden`);
  }
});

test('ubersicht hide-toggle widget flips the flag file', () => {
  const src = read('widgets/ubersicht/hide-toggle.widget/index.jsx');
  assert.match(src, /bottom: 20px;/, 'sits at the bottom of the desktop');
  assert.match(src, /left: 20px;/, 'sits at the left of the desktop');
  assert.match(src, /test -f .*FLAG.*&& rm .*FLAG.*\|\| touch .*FLAG/, 'tap writes or removes the flag file');
  assert.match(src, /Hide trackers/, 'offers to hide the trackers');
  assert.match(src, /Show trackers/, 'offers to show them again');
  const zipPath = join(root, 'widgets/ubersicht/hide-toggle.widget.zip');
  assert.ok(existsSync(zipPath), 'hide-toggle.widget.zip exists');
  const buf = readFileSync(zipPath);
  assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK', 'zip starts with PK magic');
  assert.ok(buf.includes('hide-toggle.widget/index.jsx'), 'zip contains the widget index.jsx');
});

test('ubersicht bathroom and mood widgets use the site gold', () => {
  for (const name of ['bathroom', 'mood']) {
    assert.match(read(`widgets/ubersicht/${name}.widget/index.jsx`), /#f6d365/, `${name} uses the site gold`);
  }
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

test('widgets page has a hide toggle for the install command', () => {
  const page = read('widgets.html');
  assert.match(page, /id="install-command"/, 'install section has an id to hide');
  assert.match(page, /id="installToggle"/, 'toggle button exists');
  assert.match(page, /position:fixed;left:16px;bottom:16px/, 'toggle stays fixed bottom-left');
  assert.match(page, /#install-command\.is-hidden\{display:none\}/, 'hidden state hides the section');
  assert.match(page, /charlotte-hide-install-command/, 'choice is remembered across visits');
  assert.match(page, /var\(--couple-panel,var\(--surface\)\)/, 'toggle follows the site theme');
  assert.match(page, /html\[data-quiet-days="on"\] \.install-toggle/, 'toggle follows quiet mode');
  assert.match(page, /:root\[data-dark-mode="true"\] \.install-toggle/, 'toggle follows dark mode');
});

test('ubersicht one-command install script is safe and complete', () => {
  const src = read('widgets/ubersicht/install.sh');
  assert.match(src, /^#!\/bin\/bash/, 'has a bash shebang');
  assert.match(src, /set -e/, 'stops on the first failure');
  assert.match(src, /tracesof\.net\/uebersicht\/releases\/Uebersicht-1\.6\.82\.app\.zip/, 'downloads Übersicht from its official site');
  assert.match(src, /brew install --cask ubersicht/, 'prefers Homebrew when it is there');
  assert.match(src, /SITE="https:\/\/charlotte-3ts\.pages\.dev"/, 'points at our site');
  assert.match(src, /\$SITE\/widgets\/ubersicht\/bathroom\.widget\.zip/, 'downloads the bathroom widget from our site');
  assert.match(src, /\$SITE\/widgets\/ubersicht\/mood\.widget\.zip/, 'downloads the mood widget from our site');
  assert.match(src, /\$SITE\/widgets\/ubersicht\/hide-toggle\.widget\.zip/, 'downloads the hide-toggle widget from our site');
  assert.match(src, /sed -i '' "s\/const USER = 'Luke'\/const USER = '\$NAME'\/"/, 'sets the widgets up for the named person');
  assert.match(src, /GettingStarted\.jsx/, 'drops the example widget');
  assert.match(src, /open -a Übersicht/, 'launches Übersicht at the end');
  assert.match(src, /NAME.*Charlotte.*Luke/, 'only accepts Charlotte or Luke');
});
