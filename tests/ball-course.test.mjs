import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

test('ball course page exists and is almost empty by design', () => {
  assert.ok(existsSync(join(root, 'ball-course.html')), 'ball-course.html exists');
  const page = read('ball-course.html');
  assert.match(page, /id="courseArea"/, 'has a course area');
  assert.match(page, /id="courseCanvas"/, 'has a canvas for the balls');
  assert.match(page, /id="stickerLayer"/, 'has a layer for placed stickers');
  assert.match(page, /id="stickerTray"/, 'has a sticker tray');
  assert.match(page, /id="dropBall"/, 'has a Drop a ball button');
  assert.match(page, /id="dropFive"/, 'has a Drop 5 balls button');
  assert.match(page, /id="clearBalls"/, 'has a Clear balls button');
  assert.match(page, /id="clearCourse"/, 'has a Clear course button');
  assert.match(page, /assets\/js\/ball-course\.js/, 'loads the ball course script');
  assert.match(page, /charlotte-user/, 'has the login guard');
});

test('ball course uses all twelve site stickers', () => {
  const src = read('assets/js/ball-course.js');
  for (const [id, icon] of [
    ['heart', '🩷'], ['star', '⭐'], ['moon', '🌙'], ['music', '🎵'],
    ['dice', '🎲'], ['camera', '📷'], ['lock', '🔐'], ['trophy', '🏆'],
    ['wave', '🌊'], ['fire', '🔥'], ['rainbow', '🌈'], ['question', '❓'],
  ]) {
    assert.ok(src.includes(`id: '${id}'`), `course knows the ${id} sticker`);
    assert.ok(src.includes(icon), `course shows the ${icon} sticker`);
  }
});

test('ball course physics: balls fall, bounce off stickers and the floor, and rest', () => {
  const src = read('assets/js/ball-course.js');
  assert.match(src, /GRAVITY/, 'has gravity');
  assert.match(src, /collideCircle\(ball, s\.x, s\.y, STICKER_R/, 'balls collide with placed stickers');
  assert.match(src, /ball\.y >= height - ball\.r/, 'balls land on the course floor');
  assert.match(src, /MAX_BALLS = 30/, 'caps the number of balls');
  assert.match(src, /restMs < REST_TTL/, 'resting balls fade away so the course stays clear');
});

test('ball course stickers are draggable, removable and saved', () => {
  const src = read('assets/js/ball-course.js');
  assert.match(src, /pointerdown/, 'stickers start dragging on pointer down');
  assert.match(src, /pointermove/, 'stickers follow the pointer while dragging');
  assert.match(src, /pointerup/, 'dragging ends on pointer up');
  assert.match(src, /sticker-del/, 'placed stickers have a remove button');
  assert.match(src, /charlotte-ball-course-/, 'the course is saved per user in localStorage');
  assert.match(src, /localStorage\.setItem\(STORE_KEY/, 'saves the course when it changes');
  assert.match(src, /localStorage\.getItem\(STORE_KEY/, 'loads the saved course');
});

test('games page links to the ball course', () => {
  assert.match(read('games.html'), /href="ball-course\.html"/, 'games token-bar links to the ball course');
});
