import { sfx } from '../audio/sfx.js';

const ROWS = 6;
const COLS = 7;

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function getDropRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) return r;
  }
  return -1;
}

function checkWin(board) {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;

      for (const [dr, dc] of dirs) {
        const r3 = r + dr * 3;
        const c3 = c + dc * 3;
        if (r3 < 0 || r3 >= ROWS || c3 < 0 || c3 >= COLS) continue;

        if (
          board[r + dr][c + dc] === p &&
          board[r + dr * 2][c + dc * 2] === p &&
          board[r3][c3] === p
        ) {
          return {
            winner: p,
            cells: [
              [r, c],
              [r + dr, c + dc],
              [r + dr * 2, c + dc * 2],
              [r3, c3]
            ]
          };
        }
      }
    }
  }

  const isFull = board[0].every((v) => v !== 0);
  if (isFull) return { winner: 0, draw: true, cells: [] };
  return null;
}

function scoreWindow(w, aiPlayer) {
  const human = aiPlayer === 1 ? 2 : 1;
  let aiCount = 0;
  let huCount = 0;
  let empty = 0;
  for (const v of w) {
    if (v === aiPlayer) aiCount++;
    else if (v === human) huCount++;
    else empty++;
  }
  if (aiCount === 4) return 10000;
  if (huCount === 4) return -10000;
  if (aiCount === 3 && empty === 1) return 28;
  if (aiCount === 2 && empty === 2) return 7;
  if (huCount === 3 && empty === 1) return -34;
  if (huCount === 2 && empty === 2) return -6;
  return 0;
}

function evaluateBoard(board, aiPlayer) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    if (board[r][3] === aiPlayer) score += 6;
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 3; c++) {
      score += scoreWindow(
        [board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]],
        aiPlayer
      );
    }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS - 3; r++) {
      score += scoreWindow(
        [board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]],
        aiPlayer
      );
    }
  }
  for (let r = 0; r < ROWS - 3; r++) {
    for (let c = 0; c < COLS - 3; c++) {
      score += scoreWindow(
        [board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]],
        aiPlayer
      );
      score += scoreWindow(
        [board[r + 3][c], board[r + 2][c + 1], board[r + 1][c + 2], board[r][c + 3]],
        aiPlayer
      );
    }
  }
  return score;
}

function chooseAiColumn(board, aiPlayer) {
  const colOrder = [3, 2, 4, 1, 5, 0, 6];
  const human = aiPlayer === 1 ? 2 : 1;

  function minimax(depth, alpha, beta, maximizing) {
    const res = checkWin(board);
    if (res) {
      if (res.winner === aiPlayer) return { score: 100000 + depth * 100 };
      if (res.winner === human) return { score: -100000 - depth * 100 };
      return { score: 0 };
    }
    if (depth === 0) {
      return { score: evaluateBoard(board, aiPlayer) };
    }

    const validCols = colOrder.filter((c) => board[0][c] === 0);
    let bestCol = validCols[0] ?? 3;

    if (maximizing) {
      let maxEval = -Infinity;
      for (const col of validCols) {
        const row = getDropRow(board, col);
        board[row][col] = aiPlayer;
        const val = minimax(depth - 1, alpha, beta, false).score;
        board[row][col] = 0;
        if (val > maxEval) {
          maxEval = val;
          bestCol = col;
        }
        alpha = Math.max(alpha, val);
        if (alpha >= beta) break;
      }
      return { col: bestCol, score: maxEval };
    } else {
      let minEval = Infinity;
      for (const col of validCols) {
        const row = getDropRow(board, col);
        board[row][col] = human;
        const val = minimax(depth - 1, alpha, beta, true).score;
        board[row][col] = 0;
        if (val < minEval) {
          minEval = val;
          bestCol = col;
        }
        beta = Math.min(beta, val);
        if (alpha >= beta) break;
      }
      return { col: bestCol, score: minEval };
    }
  }

  return minimax(5, -Infinity, Infinity, true).col ?? 3;
}

export function createConnectFourGame(ctx) {
  const {
    mountEl,
    mode,
    isHost,
    isSpectator = false,
    localPlayerIndex,
    sendNet,
    onMatchWin,
    onRequestHub
  } = ctx;
  let players = { ...ctx.players };

  let board = createEmptyBoard();
  let turn = 1;
  let nextStarter = 1;
  let finished = false;
  let winningCells = [];
  let lastPlaced = null;
  let hoverCol = 3;
  let aiTimer = null;

  mountEl.innerHTML = `
    <div class="c4-wrap">
      <div class="match-hud">
        <div class="hud-side" id="c4-side-1">
          <span class="hud-swatch p1"></span>
          <div class="hud-player-info">
            <span class="hud-player-name" id="c4-name-1"></span>
            <span class="hud-player-role" id="c4-role-1"></span>
          </div>
        </div>
        <div class="hud-center">
          <span class="hud-score-big" id="c4-turn-badge">TURNO</span>
          <span class="hud-substatus" id="c4-turn-sub"></span>
        </div>
        <div class="hud-side right" id="c4-side-2">
          <div class="hud-player-info">
            <span class="hud-player-name" id="c4-name-2"></span>
            <span class="hud-player-role" id="c4-role-2"></span>
          </div>
          <span class="hud-swatch p2"></span>
        </div>
      </div>

      <div class="board-stage-box" id="c4-stage-box">
        <div class="c4-board-shell" id="c4-board-shell">
          <div class="c4-preview-row" id="c4-preview-row" aria-hidden="true"></div>
          <div class="c4-grid" id="c4-grid" role="grid" aria-label="Tablero de Conecta 4"></div>
        </div>
      </div>

      <div class="hockey-help-caption">
        PC: Haz clic en una columna o usa teclas 1–7 · Android: Toca la columna deseada
      </div>

      <div class="result-overlay hidden" id="c4-result">
        <div class="result-copy">
          <span class="result-headline" id="c4-result-title"></span>
          <span class="result-sub" id="c4-result-sub"></span>
        </div>
        <div class="result-actions">
          <button type="button" class="btn btn-primary btn-compact" id="c4-btn-rematch">Revancha</button>
          <button type="button" class="btn btn-subtle btn-compact" id="c4-btn-hub">Cambiar juego</button>
        </div>
      </div>
    </div>
  `;

  const stageBox = mountEl.querySelector('#c4-stage-box');
  const boardShell = mountEl.querySelector('#c4-board-shell');
  const previewRowEl = mountEl.querySelector('#c4-preview-row');
  const gridEl = mountEl.querySelector('#c4-grid');
  const side1El = mountEl.querySelector('#c4-side-1');
  const side2El = mountEl.querySelector('#c4-side-2');
  const name1El = mountEl.querySelector('#c4-name-1');
  const name2El = mountEl.querySelector('#c4-name-2');
  const role1El = mountEl.querySelector('#c4-role-1');
  const role2El = mountEl.querySelector('#c4-role-2');
  const turnBadgeEl = mountEl.querySelector('#c4-turn-badge');
  const turnSubEl = mountEl.querySelector('#c4-turn-sub');
  const resultBox = mountEl.querySelector('#c4-result');
  const resultTitle = mountEl.querySelector('#c4-result-title');
  const resultSub = mountEl.querySelector('#c4-result-sub');

  // Dynamically fit 7x6 rack + preview row inside exact mobile stage height
  function fitBoardToStage() {
    const rect = stageBox.getBoundingClientRect();
    const availW = Math.max(220, (rect.width || window.innerWidth) - 4);
    const availH = Math.max(210, (rect.height || window.innerHeight - 130) - 4);
    // Shell height ~= shellWidth * (6/7) + 46px (padding + preview row)
    const maxWidthFromHeight = Math.floor((availH - 46) * (7 / 6));
    const finalW = Math.max(210, Math.min(500, availW, maxWidthFromHeight));
    boardShell.style.width = `${finalW}px`;
  }

  const resizeObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fitBoardToStage()) : null;
  resizeObserver?.observe(stageBox);

  const previewSlots = [];
  const colButtons = [];
  const cellDiscs = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  for (let c = 0; c < COLS; c++) {
    const slot = document.createElement('div');
    slot.className = 'c4-preview-slot';
    slot.innerHTML = '<div class="c4-preview-disc"></div>';
    previewRowEl.appendChild(slot);
    previewSlots.push(slot);

    const colBtn = document.createElement('button');
    colBtn.type = 'button';
    colBtn.className = 'c4-col-btn';
    colBtn.id = `c4-col-${c + 1}`;
    colBtn.setAttribute('aria-label', `Soltar ficha en columna ${c + 1}`);

    for (let r = 0; r < ROWS; r++) {
      const cell = document.createElement('div');
      cell.className = 'c4-cell';
      const disc = document.createElement('div');
      disc.className = 'c4-disc';
      cell.appendChild(disc);
      colBtn.appendChild(cell);
      cellDiscs[r][c] = disc;
    }

    colBtn.addEventListener('pointerenter', () => {
      hoverCol = c;
      updatePreviewRow();
    });

    colBtn.addEventListener('click', () => {
      sfx.ensureContext();
      attemptHumanMove(c);
    });

    gridEl.appendChild(colBtn);
    colButtons.push(colBtn);
  }

  function canLocalActNow() {
    if (finished || isSpectator) return false;
    if (mode === 'local') return true;
    if (mode === 'ai') return turn === 1;
    return turn === localPlayerIndex;
  }

  function updatePreviewRow() {
    const show = canLocalActNow();
    for (let c = 0; c < COLS; c++) {
      previewSlots[c].classList.remove('show-p1', 'show-p2');
      if (show && c === hoverCol && board[0][c] === 0) {
        previewSlots[c].classList.add(turn === 1 ? 'show-p1' : 'show-p2');
      }
    }
  }

  function updateHud() {
    name1El.textContent = players[1]?.name || 'Jugador 1';
    name2El.textContent = players[2]?.name || 'Jugador 2';

    side1El.classList.toggle('active-turn', !finished && turn === 1);
    side2El.classList.toggle('active-turn', !finished && turn === 2);

    if (mode === 'online') {
      if (isSpectator) {
        role1El.textContent = 'Jugador 1 · Naranja';
        role2El.textContent = 'Jugador 2 · Turquesa';
      } else {
        role1El.textContent = localPlayerIndex === 1 ? 'Tú · Naranja' : 'Rival · Naranja';
        role2El.textContent = localPlayerIndex === 2 ? 'Tú · Turquesa' : 'Rival · Turquesa';
      }
    } else if (mode === 'ai') {
      role1El.textContent = 'Tú · Naranja';
      role2El.textContent = 'IA · Turquesa';
    } else {
      role1El.textContent = 'Ficha Naranja';
      role2El.textContent = 'Ficha Turquesa';
    }

    if (finished) {
      turnBadgeEl.textContent = 'FIN';
      turnSubEl.textContent = 'Partida concluida';
    } else if (mode === 'online') {
      const mine = turn === localPlayerIndex;
      turnBadgeEl.textContent = mine ? 'TU TURNO' : 'ESPERANDO';
      turnSubEl.textContent = mine ? 'Elige columna' : `Juega ${players[turn]?.name || 'rival'}`;
    } else if (mode === 'ai') {
      turnBadgeEl.textContent = turn === 1 ? 'TU TURNO' : 'PENSANDO';
      turnSubEl.textContent = turn === 1 ? 'Elige columna' : 'Turno de la IA…';
    } else {
      turnBadgeEl.textContent = `J${turn}`;
      turnSubEl.textContent = `Turno de ${players[turn]?.name || `Jugador ${turn}`}`;
    }

    const interactive = canLocalActNow();
    for (let c = 0; c < COLS; c++) {
      colButtons[c].disabled = !interactive || board[0][c] !== 0;
    }
    updatePreviewRow();
  }

  function renderBoard() {
    const winSet = new Set(winningCells.map(([r, c]) => `${r},${c}`));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const disc = cellDiscs[r][c];
        const val = board[r][c];
        disc.className = 'c4-disc';
        if (val === 1) disc.classList.add('p1');
        else if (val === 2) disc.classList.add('p2');

        if (lastPlaced && lastPlaced.r === r && lastPlaced.c === c && val !== 0) {
          disc.classList.add('drop-anim');
        }
        if (winSet.has(`${r},${c}`)) {
          disc.classList.add('win-highlight');
        }
      }
    }
  }

  function applyMove(col, expectedPlayer) {
    if (finished) return false;
    if (expectedPlayer && expectedPlayer !== turn) return false;
    if (col < 0 || col >= COLS) return false;

    const row = getDropRow(board, col);
    if (row === -1) return false;

    board[row][col] = turn;
    lastPlaced = { r: row, c: col };
    sfx.discDrop();

    const outcome = checkWin(board);
    if (outcome) {
      finished = true;
      winningCells = outcome.cells || [];
      renderBoard();
      updateHud();
      presentResult(outcome);
      if (outcome.winner === 1 || outcome.winner === 2) {
        onMatchWin?.(outcome.winner);
      }
      return true;
    }

    turn = turn === 1 ? 2 : 1;
    renderBoard();
    updateHud();

    if (mode === 'ai' && turn === 2 && !finished) {
      scheduleAiMove();
    }
    return true;
  }

  function attemptHumanMove(col) {
    if (!canLocalActNow()) return;
    if (board[0][col] !== 0) return;

    hoverCol = col;
    if (mode === 'online') {
      const actingPlayer = isHost ? 1 : 2;
      const ok = applyMove(col, actingPlayer);
      if (ok) {
        sendNet({ kind: 'MOVE', col, player: actingPlayer });
      }
    } else {
      applyMove(col, turn);
    }
  }

  function scheduleAiMove() {
    clearTimeout(aiTimer);
    aiTimer = setTimeout(() => {
      if (finished || turn !== 2) return;
      const copy = board.map((row) => [...row]);
      const aiCol = chooseAiColumn(copy, 2);
      applyMove(aiCol, 2);
    }, 420);
  }

  function presentResult(outcome) {
    if (outcome.draw) {
      resultTitle.textContent = '¡Tablero lleno · Empate!';
      resultSub.textContent = 'Nadie cedió cuatro en línea.';
    } else if (mode === 'local') {
      const wName = players[outcome.winner]?.name || `Jugador ${outcome.winner}`;
      resultTitle.textContent = `¡${wName} conecta 4!`;
      resultSub.textContent = 'Alineación ganadora completada.';
      sfx.win();
    } else if (outcome.winner === localPlayerIndex) {
      resultTitle.textContent = '¡Conectaste 4! Victoria';
      resultSub.textContent = 'Lectura táctica impecable.';
      sfx.win();
    } else {
      const wName = players[outcome.winner]?.name || 'Tu rival';
      resultTitle.textContent = `${wName} conectó 4`;
      resultSub.textContent = 'Pide la revancha para desquitarte.';
      sfx.lose();
    }
    resultBox.classList.remove('hidden');
  }

  function restart(fromRemote = false, forcedStarter = null) {
    clearTimeout(aiTimer);
    board = createEmptyBoard();
    if (forcedStarter === 1 || forcedStarter === 2) {
      nextStarter = forcedStarter;
    } else {
      nextStarter = nextStarter === 1 ? 2 : 1;
    }
    turn = nextStarter;
    finished = false;
    winningCells = [];
    lastPlaced = null;
    resultBox.classList.add('hidden');
    renderBoard();
    updateHud();

    if (mode === 'online' && !fromRemote) {
      sendNet({ kind: 'RESTART', starter: turn });
    }
    if (mode === 'ai' && turn === 2) {
      scheduleAiMove();
    }
  }

  function onKeyDown(e) {
    if (!canLocalActNow()) return;
    if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key >= '1' && e.key <= '7') {
      e.preventDefault();
      attemptHumanMove(Number(e.key) - 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      hoverCol = (hoverCol + COLS - 1) % COLS;
      updatePreviewRow();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      hoverCol = (hoverCol + 1) % COLS;
      updatePreviewRow();
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (document.activeElement?.tagName !== 'BUTTON') {
        e.preventDefault();
        attemptHumanMove(hoverCol);
      }
    }
  }

  const btnRematch = mountEl.querySelector('#c4-btn-rematch');
  if (isSpectator) btnRematch.classList.add('hidden');
  btnRematch.addEventListener('click', () => {
    if (isSpectator) return;
    sfx.click();
    restart(false);
  });

  mountEl.querySelector('#c4-btn-hub').addEventListener('click', () => {
    sfx.click();
    onRequestHub?.();
  });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', fitBoardToStage);

  renderBoard();
  updateHud();
  requestAnimationFrame(() => fitBoardToStage());

  return {
    onNetMessage(msg) {
      if (!msg) return;
      if (msg.kind === 'MOVE') {
        const expectedSender = isHost ? 2 : 1;
        if (!isSpectator && mode === 'online' && Number(msg.player) !== expectedSender) return;
        applyMove(Number(msg.col), Number(msg.player));
      } else if (msg.kind === 'RESTART') {
        restart(true, msg.starter);
      }
    },

    updatePlayers(nextPlayers) {
      players = { ...nextPlayers };
      updateHud();
    },

    getSnapshot() {
      return {
        gameId: 'connect-four',
        board: board.map((r) => [...r]),
        turn,
        nextStarter,
        finished,
        winningCells,
        lastPlaced
      };
    },

    applySnapshot(snap) {
      if (!snap || snap.gameId !== 'connect-four' || !Array.isArray(snap.board)) return;
      board = snap.board.map((r) => [...r]);
      turn = Number(snap.turn) || 1;
      nextStarter = Number(snap.nextStarter) || 1;
      finished = Boolean(snap.finished);
      winningCells = Array.isArray(snap.winningCells) ? snap.winningCells : [];
      lastPlaced = snap.lastPlaced || null;
      renderBoard();
      updateHud();
      if (finished) {
        const outcome = checkWin(board);
        if (outcome) presentResult(outcome);
      } else {
        resultBox.classList.add('hidden');
      }
    },

    restart: () => restart(false),

    destroy() {
      clearTimeout(aiTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', fitBoardToStage);
    }
  };
}
