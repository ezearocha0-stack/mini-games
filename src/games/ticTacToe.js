import { sfx } from '../audio/sfx.js';

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

const SVG_X = `
  <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M16 16L48 48M48 16L16 48" stroke="#f58229" stroke-width="8" stroke-linecap="round"/>
  </svg>
`;

const SVG_O = `
  <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="18" stroke="#1ad1be" stroke-width="8"/>
  </svg>
`;

function checkWinner(board) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] !== 0 && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return null;
}

// Minimax AI supporting BOTH Infinite (3-piece FIFO) and Classic modes
function chooseSmartMove(board, queues, variant, aiPlayer) {
  const human = aiPlayer === 1 ? 2 : 1;

  function simulateMove(b, q, player, cell) {
    const nb = [...b];
    const nq = { 1: [...q[1]], 2: [...q[2]] };
    if (variant === 'infinite' && nq[player].length >= 3) {
      const oldest = nq[player].shift();
      nb[oldest] = 0;
    }
    nb[cell] = player;
    nq[player].push(cell);
    return { nb, nq };
  }

  function minimax(b, q, depth, alpha, beta, maximizing) {
    const win = checkWinner(b);
    if (win) {
      return win.winner === aiPlayer ? 100 + depth : -100 - depth;
    }
    const empty = [];
    for (let i = 0; i < 9; i++) {
      if (b[i] === 0) empty.push(i);
    }
    if (empty.length === 0 || depth === 0) {
      // Heuristic center + two-in-a-row count
      let score = b[4] === aiPlayer ? 4 : b[4] === human ? -4 : 0;
      for (const [x, y, z] of WIN_LINES) {
        const vals = [b[x], b[y], b[z]];
        const aiC = vals.filter((v) => v === aiPlayer).length;
        const huC = vals.filter((v) => v === human).length;
        if (aiC === 2 && huC === 0) score += 6;
        if (huC === 2 && aiC === 0) score -= 7;
      }
      return score;
    }

    if (maximizing) {
      let best = -Infinity;
      for (const idx of empty) {
        const { nb, nq } = simulateMove(b, q, aiPlayer, idx);
        const val = minimax(nb, nq, depth - 1, alpha, beta, false);
        best = Math.max(best, val);
        alpha = Math.max(alpha, val);
        if (alpha >= beta) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const idx of empty) {
        const { nb, nq } = simulateMove(b, q, human, idx);
        const val = minimax(nb, nq, depth - 1, alpha, beta, true);
        best = Math.min(best, val);
        beta = Math.min(beta, val);
        if (alpha >= beta) break;
      }
      return best;
    }
  }

  const maxDepth = variant === 'infinite' ? 6 : 8;
  const candidates = [4, 0, 2, 6, 8, 1, 3, 5, 7].filter((i) => board[i] === 0);
  let bestScore = -Infinity;
  let bestCell = candidates[0] ?? 0;

  for (const idx of candidates) {
    const { nb, nq } = simulateMove(board, queues, aiPlayer, idx);
    const val = minimax(nb, nq, maxDepth - 1, -Infinity, Infinity, false);
    if (val > bestScore) {
      bestScore = val;
      bestCell = idx;
    }
  }
  return bestCell;
}

export function createTicTacToeGame(ctx) {
  const { mountEl, mode, isHost, localPlayerIndex, sendNet, onMatchWin, onRequestHub } = ctx;
  let players = { ...ctx.players };

  let variant = 'infinite'; // 'infinite' | 'classic'
  let board = Array(9).fill(0);
  let queues = { 1: [], 2: [] };
  let turn = 1;
  let nextStarter = 1;
  let finished = false;
  let winLine = [];
  let aiTimer = null;

  mountEl.innerHTML = `
    <div class="ttt-wrap">
      <div class="match-hud">
        <div class="hud-side" id="ttt-side-1">
          <span class="hud-swatch p1"></span>
          <div class="hud-player-info">
            <span class="hud-player-name" id="ttt-name-1"></span>
            <span class="hud-player-role" id="ttt-role-1"></span>
          </div>
        </div>
        <div class="hud-center">
          <span class="hud-score-big" id="ttt-turn-badge">TURNO</span>
          <span class="hud-substatus" id="ttt-turn-sub"></span>
        </div>
        <div class="hud-side right" id="ttt-side-2">
          <div class="hud-player-info">
            <span class="hud-player-name" id="ttt-name-2"></span>
            <span class="hud-player-role" id="ttt-role-2"></span>
          </div>
          <span class="hud-swatch p2"></span>
        </div>
      </div>

      <div class="ttt-mode-bar" role="tablist" aria-label="Variante de Tres en Raya">
        <button type="button" class="ttt-mode-tab active" id="ttt-tab-infinite" data-variant="infinite">
          Infinito (3 piezas)
        </button>
        <button type="button" class="ttt-mode-tab" id="ttt-tab-classic" data-variant="classic">
          Clásico
        </button>
      </div>

      <p class="ttt-rule-note" id="ttt-rule-note">
        Máximo 3 marcas por jugador: al poner la 4.ª, tu marca más antigua se borra.
      </p>

      <div class="ttt-board" id="ttt-board" role="grid" aria-label="Tablero de Tres en Raya"></div>

      <div class="result-overlay hidden" id="ttt-result">
        <div class="result-copy">
          <span class="result-headline" id="ttt-result-title"></span>
          <span class="result-sub" id="ttt-result-sub"></span>
        </div>
        <div class="result-actions">
          <button type="button" class="btn btn-primary btn-compact" id="ttt-btn-rematch">Revancha</button>
          <button type="button" class="btn btn-subtle btn-compact" id="ttt-btn-hub">Cambiar juego</button>
        </div>
      </div>
    </div>
  `;

  const boardEl = mountEl.querySelector('#ttt-board');
  const side1El = mountEl.querySelector('#ttt-side-1');
  const side2El = mountEl.querySelector('#ttt-side-2');
  const name1El = mountEl.querySelector('#ttt-name-1');
  const name2El = mountEl.querySelector('#ttt-name-2');
  const role1El = mountEl.querySelector('#ttt-role-1');
  const role2El = mountEl.querySelector('#ttt-role-2');
  const turnBadgeEl = mountEl.querySelector('#ttt-turn-badge');
  const turnSubEl = mountEl.querySelector('#ttt-turn-sub');
  const tabInfinite = mountEl.querySelector('#ttt-tab-infinite');
  const tabClassic = mountEl.querySelector('#ttt-tab-classic');
  const ruleNoteEl = mountEl.querySelector('#ttt-rule-note');
  const resultBox = mountEl.querySelector('#ttt-result');
  const resultTitle = mountEl.querySelector('#ttt-result-title');
  const resultSub = mountEl.querySelector('#ttt-result-sub');

  const cellBtns = [];
  for (let i = 0; i < 9; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ttt-cell';
    btn.id = `ttt-cell-${i + 1}`;
    btn.setAttribute('aria-label', `Casilla ${i + 1}`);
    btn.addEventListener('click', () => {
      sfx.ensureContext();
      attemptHumanMove(i);
    });
    boardEl.appendChild(btn);
    cellBtns.push(btn);
  }

  function canLocalActNow() {
    if (finished) return false;
    if (mode === 'local') return true;
    if (mode === 'ai') return turn === 1;
    return turn === localPlayerIndex;
  }

  function updateVariantUi() {
    tabInfinite.classList.toggle('active', variant === 'infinite');
    tabClassic.classList.toggle('active', variant === 'classic');

    // In online P2P, only Host switches rule variant to avoid simultaneous conflict
    const canSwitchVariant = mode !== 'online' || isHost;
    tabInfinite.disabled = !canSwitchVariant;
    tabClassic.disabled = !canSwitchVariant;

    ruleNoteEl.textContent =
      variant === 'infinite'
        ? 'Máximo 3 marcas por jugador: al colocar la 4.ª, tu marca más antigua desaparece.'
        : 'Modo tradicional 3×3: alinea tres marcas iguales antes de llenar el tablero.';
  }

  function updateHud() {
    name1El.textContent = players[1]?.name || 'Jugador 1';
    name2El.textContent = players[2]?.name || 'Jugador 2';

    side1El.classList.toggle('active-turn', !finished && turn === 1);
    side2El.classList.toggle('active-turn', !finished && turn === 2);

    if (mode === 'online') {
      role1El.textContent = localPlayerIndex === 1 ? 'Tú · X' : 'Rival · X';
      role2El.textContent = localPlayerIndex === 2 ? 'Tú · O' : 'Rival · O';
    } else if (mode === 'ai') {
      role1El.textContent = 'Tú · X';
      role2El.textContent = 'IA · O';
    } else {
      role1El.textContent = 'Marca X';
      role2El.textContent = 'Marca O';
    }

    if (finished) {
      turnBadgeEl.textContent = 'FIN';
      turnSubEl.textContent = 'Ronda terminada';
    } else if (mode === 'online') {
      const mine = turn === localPlayerIndex;
      turnBadgeEl.textContent = mine ? 'TU TURNO' : 'ESPERANDO';
      turnSubEl.textContent = mine ? 'Toca una casilla' : `Juega ${players[turn]?.name || 'rival'}`;
    } else if (mode === 'ai') {
      turnBadgeEl.textContent = turn === 1 ? 'TU TURNO' : 'IA…';
      turnSubEl.textContent = turn === 1 ? 'Toca una casilla' : 'Calculando jugada';
    } else {
      turnBadgeEl.textContent = turn === 1 ? 'TURNO X' : 'TURNO O';
      turnSubEl.textContent = players[turn]?.name || `Jugador ${turn}`;
    }
  }

  function renderBoard() {
    const interactive = canLocalActNow();
    const winSet = new Set(winLine);
    const vanishingCell =
      !finished && variant === 'infinite' && queues[turn].length >= 3 ? queues[turn][0] : -1;

    for (let i = 0; i < 9; i++) {
      const btn = cellBtns[i];
      const val = board[i];
      btn.className = 'ttt-cell';

      if (val === 1) {
        btn.innerHTML = SVG_X;
      } else if (val === 2) {
        btn.innerHTML = SVG_O;
      } else {
        btn.innerHTML = '';
      }

      if (i === vanishingCell) {
        btn.classList.add('vanishing-soon');
      }
      if (winSet.has(i)) {
        btn.classList.add('win-cell');
      }

      btn.disabled = !interactive || val !== 0;
    }
  }

  function applyMove(cellIdx, expectedPlayer) {
    if (finished) return false;
    if (expectedPlayer && expectedPlayer !== turn) return false;
    if (cellIdx < 0 || cellIdx > 8 || board[cellIdx] !== 0) return false;

    if (variant === 'infinite' && queues[turn].length >= 3) {
      const removedIdx = queues[turn].shift();
      board[removedIdx] = 0;
    }

    board[cellIdx] = turn;
    queues[turn].push(cellIdx);
    sfx.markPlace(turn);

    const win = checkWinner(board);
    if (win) {
      finished = true;
      winLine = win.line;
      renderBoard();
      updateHud();
      showResult({ winner: win.winner, draw: false });
      onMatchWin?.(win.winner);
      return true;
    }

    if (variant === 'classic' && board.every((v) => v !== 0)) {
      finished = true;
      winLine = [];
      renderBoard();
      updateHud();
      showResult({ winner: 0, draw: true });
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

  function attemptHumanMove(cellIdx) {
    if (!canLocalActNow()) return;
    if (board[cellIdx] !== 0) return;

    const actingPlayer = turn;
    const ok = applyMove(cellIdx, actingPlayer);
    if (ok && mode === 'online') {
      sendNet({ kind: 'MOVE', cell: cellIdx, player: actingPlayer });
    }
  }

  function scheduleAiMove() {
    clearTimeout(aiTimer);
    aiTimer = setTimeout(() => {
      if (finished || turn !== 2) return;
      const cell = chooseSmartMove(board, queues, variant, 2);
      applyMove(cell, 2);
    }, 360);
  }

  function showResult({ winner, draw }) {
    if (draw) {
      resultTitle.textContent = '¡Empate!';
      resultSub.textContent = 'Prueba el modo Infinito para eliminar los empates.';
    } else if (mode === 'local') {
      const wName = players[winner]?.name || `Jugador ${winner}`;
      resultTitle.textContent = `¡Victoria de ${wName}!`;
      resultSub.textContent = 'Tres en línea completado.';
      sfx.win();
    } else if (winner === localPlayerIndex) {
      resultTitle.textContent = '¡Tres en raya! Ganaste';
      resultSub.textContent = 'Excelente control del tablero.';
      sfx.win();
    } else {
      const wName = players[winner]?.name || 'Tu rival';
      resultTitle.textContent = `${wName} gana esta ronda`;
      resultSub.textContent = '¿Otra ronda rápida?';
      sfx.lose();
    }
    resultBox.classList.remove('hidden');
  }

  function setVariant(nextVariant, fromRemote = false) {
    if (nextVariant !== 'infinite' && nextVariant !== 'classic') return;
    variant = nextVariant;
    updateVariantUi();
    restart(true, 1);
    if (mode === 'online' && !fromRemote && isHost) {
      sendNet({ kind: 'SET_VARIANT', variant: nextVariant });
    }
  }

  function restart(fromRemote = false, forcedStarter = null) {
    clearTimeout(aiTimer);
    board = Array(9).fill(0);
    queues = { 1: [], 2: [] };
    if (forcedStarter === 1 || forcedStarter === 2) {
      nextStarter = forcedStarter;
    } else {
      nextStarter = nextStarter === 1 ? 2 : 1;
    }
    turn = nextStarter;
    finished = false;
    winLine = [];
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

  tabInfinite.addEventListener('click', () => {
    if (variant === 'infinite') return;
    sfx.click();
    setVariant('infinite', false);
  });

  tabClassic.addEventListener('click', () => {
    if (variant === 'classic') return;
    sfx.click();
    setVariant('classic', false);
  });

  mountEl.querySelector('#ttt-btn-rematch').addEventListener('click', () => {
    sfx.click();
    restart(false);
  });

  mountEl.querySelector('#ttt-btn-hub').addEventListener('click', () => {
    sfx.click();
    onRequestHub?.();
  });

  function onKeyDown(e) {
    if (!canLocalActNow()) return;
    if (e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      attemptHumanMove(Number(e.key) - 1);
    }
  }
  window.addEventListener('keydown', onKeyDown);

  updateVariantUi();
  renderBoard();
  updateHud();

  return {
    onNetMessage(msg) {
      if (!msg) return;
      if (msg.kind === 'MOVE') {
        applyMove(Number(msg.cell), Number(msg.player));
      } else if (msg.kind === 'SET_VARIANT') {
        setVariant(msg.variant, true);
      } else if (msg.kind === 'RESTART') {
        restart(true, msg.starter);
      }
    },

    updatePlayers(nextPlayers) {
      players = { ...nextPlayers };
      updateHud();
    },

    restart: () => restart(false),

    destroy() {
      clearTimeout(aiTimer);
      window.removeEventListener('keydown', onKeyDown);
    }
  };
}
