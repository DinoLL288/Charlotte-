import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROWS,
  COLS,
  WIN_LENGTH,
  WIN_TOKENS,
  createBoard,
  lowestEmptyRow,
  dropDisc,
  findWinner,
  isBoardFull,
  emptyWins,
  loadWins,
  saveWins,
} from '../assets/js/four-in-a-row.js';

function fakeStorage(initial) {
  var store = new Map(Object.entries(initial || {}));
  return {
    getItem: function (key) { return store.has(key) ? store.get(key) : null; },
    setItem: function (key, value) { store.set(key, String(value)); },
    removeItem: function (key) { store.delete(key); },
  };
}

test('board is 6 rows by 7 columns and starts empty', function () {
  var board = createBoard();
  assert.equal(board.length, ROWS);
  assert.equal(ROWS, 6);
  assert.equal(COLS, 7);
  assert.equal(WIN_LENGTH, 4);
  board.forEach(function (row) {
    assert.equal(row.length, COLS);
    row.forEach(function (cell) { assert.equal(cell, null); });
  });
});

test('discs stack from the bottom of a column', function () {
  var board = createBoard();
  assert.equal(dropDisc(board, 3, 'Luke'), 5);
  assert.equal(dropDisc(board, 3, 'Charlotte'), 4);
  assert.equal(dropDisc(board, 3, 'Luke'), 3);
  assert.equal(board[5][3], 'Luke');
  assert.equal(board[4][3], 'Charlotte');
  assert.equal(board[3][3], 'Luke');
});

test('a full column refuses another disc', function () {
  var board = createBoard();
  for (var i = 0; i < ROWS; i++) dropDisc(board, 0, i % 2 ? 'Charlotte' : 'Luke');
  assert.equal(lowestEmptyRow(board, 0), -1);
  assert.equal(dropDisc(board, 0, 'Luke'), -1);
  assert.equal(lowestEmptyRow(board, -1), -1);
  assert.equal(lowestEmptyRow(board, COLS), -1);
});

test('horizontal four in a row wins', function () {
  var board = createBoard();
  dropDisc(board, 0, 'Luke');
  dropDisc(board, 1, 'Luke');
  dropDisc(board, 2, 'Luke');
  assert.equal(findWinner(board), null);
  dropDisc(board, 3, 'Luke');
  var win = findWinner(board);
  assert.ok(win);
  assert.equal(win.player, 'Luke');
  assert.deepEqual(win.cells, [[5, 0], [5, 1], [5, 2], [5, 3]]);
});

test('vertical four in a row wins', function () {
  var board = createBoard();
  for (var i = 0; i < 3; i++) dropDisc(board, 6, 'Charlotte');
  assert.equal(findWinner(board), null);
  dropDisc(board, 6, 'Charlotte');
  var win = findWinner(board);
  assert.ok(win);
  assert.equal(win.player, 'Charlotte');
  assert.deepEqual(win.cells, [[2, 6], [3, 6], [4, 6], [5, 6]]);
});

test('diagonal down-right four in a row wins', function () {
  var board = createBoard();
  // Build a diagonal for Luke: (5,0) (4,1) (3,2) (2,3).
  board[5][0] = 'Luke';
  board[5][1] = 'Charlotte'; board[4][1] = 'Luke';
  board[5][2] = 'Charlotte'; board[4][2] = 'Charlotte'; board[3][2] = 'Luke';
  board[5][3] = 'Charlotte'; board[4][3] = 'Charlotte'; board[3][3] = 'Charlotte'; board[2][3] = 'Luke';
  var win = findWinner(board);
  assert.ok(win);
  assert.equal(win.player, 'Luke');
  assert.deepEqual(win.cells, [[2, 3], [3, 2], [4, 1], [5, 0]]);
});

test('diagonal down-left four in a row wins', function () {
  var board = createBoard();
  // Diagonal for Charlotte: (5,6) (4,5) (3,4) (2,3).
  board[5][6] = 'Charlotte';
  board[5][5] = 'Luke'; board[4][5] = 'Charlotte';
  board[5][4] = 'Luke'; board[4][4] = 'Luke'; board[3][4] = 'Charlotte';
  board[5][3] = 'Luke'; board[4][3] = 'Luke'; board[3][3] = 'Luke'; board[2][3] = 'Charlotte';
  var win = findWinner(board);
  assert.ok(win);
  assert.equal(win.player, 'Charlotte');
  assert.deepEqual(win.cells, [[2, 3], [3, 4], [4, 5], [5, 6]]);
});

test('three in a row is not a win', function () {
  var board = createBoard();
  dropDisc(board, 0, 'Luke');
  dropDisc(board, 1, 'Luke');
  dropDisc(board, 2, 'Luke');
  dropDisc(board, 0, 'Charlotte');
  dropDisc(board, 1, 'Charlotte');
  dropDisc(board, 2, 'Charlotte');
  assert.equal(findWinner(board), null);
});

test('a played game ends with a horizontal win for Luke', function () {
  var board = createBoard();
  var moves = [0, 0, 1, 1, 2, 2, 3]; // Luke takes the bottom row
  moves.forEach(function (col, i) {
    dropDisc(board, col, i % 2 === 0 ? 'Luke' : 'Charlotte');
  });
  var win = findWinner(board);
  assert.ok(win);
  assert.equal(win.player, 'Luke');
});

test('board full detection', function () {
  var board = createBoard();
  assert.equal(isBoardFull(board), false);
  for (var col = 0; col < COLS; col++) {
    for (var i = 0; i < ROWS; i++) board[i][col] = (i + col) % 2 ? 'Luke' : 'Charlotte';
  }
  assert.equal(isBoardFull(board), true);
});

test('win tally saves and loads, and bad data falls back to zero', function () {
  var storage = fakeStorage();
  assert.deepEqual(loadWins(storage), { Luke: 0, Charlotte: 0 });
  assert.deepEqual(emptyWins(), { Luke: 0, Charlotte: 0 });
  saveWins(storage, { Luke: 3, Charlotte: 2 });
  assert.deepEqual(loadWins(storage), { Luke: 3, Charlotte: 2 });
  var broken = fakeStorage({ 'four-in-a-row-wins': 'not json{' });
  assert.deepEqual(loadWins(broken), { Luke: 0, Charlotte: 0 });
});

test('a win is worth five tokens', function () {
  assert.equal(WIN_TOKENS, 5);
});
