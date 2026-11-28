// Four in a Row — a pass-and-play game for Luke & Charlotte.
// Drop discs into the grid, first to four in a row wins. Pure helpers are
// exported so tests can check the win detection without a DOM.

export const ROWS = 6;
export const COLS = 7;
export const WIN_LENGTH = 4;
export const WIN_TOKENS = 5;
export const DRAW_TOKENS = 1;
export const WINS_KEY = 'four-in-a-row-wins';

export const PLAYERS = [
  { name: 'Luke', disc: 'luke', emoji: '💙' },
  { name: 'Charlotte', disc: 'charlotte', emoji: '🩷' },
];

// --- Pure helpers ---

// A board is ROWS rows of COLS cells; each cell is null or a player name.
export function createBoard() {
  return Array.from({ length: ROWS }, function () {
    return Array(COLS).fill(null);
  });
}

// Lowest empty row in a column (row 0 is the top), or -1 when the column is full.
export function lowestEmptyRow(board, col) {
  if (col < 0 || col >= COLS) return -1;
  for (var row = ROWS - 1; row >= 0; row--) {
    if (!board[row][col]) return row;
  }
  return -1;
}

// Drop a disc; returns the row it landed on, or -1 when the column is full.
export function dropDisc(board, col, playerName) {
  var row = lowestEmptyRow(board, col);
  if (row < 0) return -1;
  board[row][col] = playerName;
  return row;
}

var DIRECTIONS = [
  [0, 1], // across
  [1, 0], // down
  [1, 1], // diagonal down-right
  [1, -1], // diagonal down-left
];

// Returns { player, cells } for the first four-in-a-row found, or null.
export function findWinner(board) {
  for (var row = 0; row < ROWS; row++) {
    for (var col = 0; col < COLS; col++) {
      var player = board[row][col];
      if (!player) continue;
      for (var d = 0; d < DIRECTIONS.length; d++) {
        var dr = DIRECTIONS[d][0];
        var dc = DIRECTIONS[d][1];
        var cells = [[row, col]];
        var ok = true;
        for (var step = 1; step < WIN_LENGTH; step++) {
          var r = row + dr * step;
          var c = col + dc * step;
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== player) {
            ok = false;
            break;
          }
          cells.push([r, c]);
        }
        if (ok) return { player: player, cells: cells };
      }
    }
  }
  return null;
}

export function isBoardFull(board) {
  for (var col = 0; col < COLS; col++) {
    if (lowestEmptyRow(board, col) >= 0) return false;
  }
  return true;
}

export function emptyWins() {
  return { Luke: 0, Charlotte: 0 };
}

export function loadWins(storage) {
  try {
    var raw = storage.getItem(WINS_KEY);
    if (!raw) return emptyWins();
    var parsed = JSON.parse(raw);
    return {
      Luke: Number(parsed.Luke) || 0,
      Charlotte: Number(parsed.Charlotte) || 0,
    };
  } catch (e) {
    return emptyWins();
  }
}

export function saveWins(storage, wins) {
  try {
    storage.setItem(WINS_KEY, JSON.stringify(wins));
  } catch (e) { /* Tally is a nice-to-have; keep playing if storage fails. */ }
}

// --- Page wiring (browser only) ---

if (typeof document !== 'undefined') {
  (function () {
    var boardEl = document.getElementById('fourBoard');
    if (!boardEl) return;

    var statusEl = document.getElementById('fourStatus');
    var turnEl = document.getElementById('fourTurn');
    var againBtn = document.getElementById('fourAgain');
    var resetTallyBtn = document.getElementById('fourResetTally');
    var lukeWinsEl = document.getElementById('lukeWins');
    var charlotteWinsEl = document.getElementById('charlotteWins');
    var tokenEl = document.getElementById('tokenCount');
    var dropRowEl = document.getElementById('fourDropRow');

    var user = 'Unknown';
    try { user = localStorage.getItem('charlotte-user') || 'Unknown'; } catch (e) {}

    var board = createBoard();
    var current = 0; // index into PLAYERS
    var startingPlayer = 0; // alternates each new game so nobody always starts
    var over = false;
    var wins = loadWins(localStorage);
    var tokenBalance = 0;
    var pendingTokens = 0;
    var flushTimer = null;

    function updateTokenCount() {
      if (tokenEl) tokenEl.textContent = tokenBalance;
    }

    function flushTokens() {
      if (pendingTokens <= 0) return;
      var amount = pendingTokens;
      pendingTokens = 0;
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      // Tokens go to the winner's own account, not whoever holds the phone.
      var winner = flushTokens.winner || user;
      fetch('/api/question-room', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'playful-award', user: winner, amount: Math.min(amount, 50) }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.state && j.state.tokens && typeof j.state.tokens[user] !== 'undefined') {
            tokenBalance = j.state.tokens[user] || 0;
            updateTokenCount();
          }
        })
        .catch(function () { pendingTokens += amount; }); // re-queue on failure
    }

    function scheduleFlush() {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flushTokens, 800);
    }

    function awardTokensTo(playerName, n) {
      if (playerName === user) tokenBalance += n;
      pendingTokens += n;
      flushTokens.winner = playerName;
      updateTokenCount();
      scheduleFlush();
    }

    function loadTokens() {
      fetch('/api/question-room?view=playful-state', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (s) { tokenBalance = (s.tokens && s.tokens[user]) || 0; updateTokenCount(); })
        .catch(function () {});
    }
    loadTokens();
    window.addEventListener('beforeunload', flushTokens);

    function renderWins() {
      if (lukeWinsEl) lukeWinsEl.textContent = wins.Luke;
      if (charlotteWinsEl) charlotteWinsEl.textContent = wins.Charlotte;
    }

    function renderBoard() {
      boardEl.innerHTML = '';
      for (var row = 0; row < ROWS; row++) {
        for (var col = 0; col < COLS; col++) {
          var cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'four-cell';
          cell.dataset.col = String(col);
          cell.setAttribute('aria-label', 'Drop a disc in column ' + (col + 1));
          var owner = board[row][col];
          if (owner) {
            var disc = document.createElement('span');
            disc.className = 'four-disc four-disc-' + (owner === 'Luke' ? 'luke' : 'charlotte');
            disc.textContent = owner === 'Luke' ? '💙' : '🩷';
            cell.appendChild(disc);
          }
          boardEl.appendChild(cell);
        }
      }
    }

    function markWinningCells(cells) {
      cells.forEach(function (pos) {
        var index = pos[0] * COLS + pos[1];
        var cell = boardEl.children[index];
        if (cell) cell.classList.add('four-win');
      });
    }

    function setTurnText() {
      var player = PLAYERS[current];
      if (turnEl) turnEl.textContent = player.emoji + ' ' + player.name + ' — your turn';
    }

    function newGame() {
      board = createBoard();
      over = false;
      startingPlayer = 1 - startingPlayer;
      current = startingPlayer;
      renderBoard();
      setTurnText();
      if (statusEl) statusEl.textContent = 'Tap a column to drop your disc. First to four in a row wins!';
      if (againBtn) againBtn.style.display = 'none';
    }

    function playColumn(col) {
      if (over) return;
      var row = dropDisc(board, col, PLAYERS[current].name);
      if (row < 0) {
        if (statusEl) statusEl.textContent = 'That column is full — pick another one.';
        return;
      }
      renderBoard();
      var winner = findWinner(board);
      if (winner) {
        over = true;
        markWinningCells(winner.cells);
        var winnerPlayer = PLAYERS.find(function (p) { return p.name === winner.player; });
        wins[winner.player] += 1;
        saveWins(localStorage, wins);
        renderWins();
        awardTokensTo(winner.player, WIN_TOKENS);
        if (turnEl) turnEl.textContent = winnerPlayer.emoji + ' ' + winner.player + ' wins! 🎉';
        if (statusEl) statusEl.textContent = winner.player + ' takes the game — ' + WIN_TOKENS + ' tokens for ' + winner.player + '. Tap Play again for a rematch.';
        if (againBtn) againBtn.style.display = '';
        return;
      }
      if (isBoardFull(board)) {
        over = true;
        awardTokensTo(user, DRAW_TOKENS);
        if (turnEl) turnEl.textContent = 'A draw! 🤝';
        if (statusEl) statusEl.textContent = 'Board full, nobody got four. ' + DRAW_TOKENS + ' token for a hard-fought draw — tap Play again.';
        if (againBtn) againBtn.style.display = '';
        return;
      }
      current = 1 - current;
      setTurnText();
    }

    // Column drop buttons along the top.
    if (dropRowEl) {
      for (var col = 0; col < COLS; col++) {
        (function (c) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'four-drop';
          b.textContent = '▼';
          b.setAttribute('aria-label', 'Drop in column ' + (c + 1));
          b.addEventListener('click', function () { playColumn(c); });
          dropRowEl.appendChild(b);
        })(col);
      }
    }

    boardEl.addEventListener('click', function (event) {
      var target = event.target.closest ? event.target.closest('.four-cell') : null;
      if (!target) return;
      playColumn(Number(target.dataset.col));
    });

    if (againBtn) againBtn.addEventListener('click', newGame);
    if (resetTallyBtn) {
      resetTallyBtn.addEventListener('click', function () {
        wins = emptyWins();
        saveWins(localStorage, wins);
        renderWins();
        if (statusEl) statusEl.textContent = 'Tally wiped clean — fresh rivalry, same love.';
      });
    }

    renderWins();
    renderBoard();
    setTurnText();
  })();
}
