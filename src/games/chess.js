import {
  createInitialChessState,
  getLegalMoves,
  applyChessMove,
  isKingInCheck,
  findKing,
  hasSufficientMatingMaterial,
  chooseChessAiMove,
  PIECE_VALUES
} from '../shared/chessEngine.js';
import { sfx } from '../audio/sfx.js';

const FILES = 'abcdefgh';
const RANKS = '87654321';

// Clean crisp SVG silhouettes for high-DPI rendering in both Dark and Light themes
function pieceSvg(piece) {
  if (!piece) return '';
  const isW = piece.color === 'w';
  const fill = isW ? '#f8fafc' : '#1e242c';
  const stroke = isW ? '#1e242c' : '#f1f5f9';
  const accent = isW ? '#94a3b8' : '#475569';

  const paths = {
    p: `<circle cx="22.5" cy="14" r="6"/><path d="M16 32c0-4 2.5-7 6.5-7s6.5 3 6.5 7H16z"/><rect x="13" y="33" width="19" height="4.5" rx="2"/>`,
    r: `<path d="M13 11h4v4h3.5v-4h4v4H28v-4h4v7H13v-7zm2 8h15l-1.5 13h-12L15 19z"/><rect x="12" y="33" width="21" height="4.5" rx="2"/>`,
    n: `<path d="M14 33c1-7 4-11 7-13-2.5 0-4.5 1.5-5.5 2.5C13 21 13 16 18 12l2-3 2 2c6 0 11 4.5 11 13.5 0 3.5-1.5 6.5-3 8.5H14z"/><circle cx="19.5" cy="16.5" r="1.4" fill="${stroke}" stroke="none"/>`,
    b: `<circle cx="22.5" cy="9" r="2.5"/><path d="M22.5 12c-5 4-6.5 10-4 16h8c2.5-6 1-12-4-16z"/><line x1="20" y1="20" x2="25" y2="15" stroke="${accent}" stroke-width="2"/><rect x="12.5" y="33" width="20" height="4.5" rx="2"/>`,
    q: `<circle cx="10" cy="14" r="2.2"/><circle cx="16" cy="11" r="2.2"/><circle cx="22.5" cy="9.5" r="2.4"/><circle cx="29" cy="11" r="2.2"/><circle cx="35" cy="14" r="2.2"/><path d="M11 16.5l4 13.5h15l4-13.5-6 6-5.5-9.5L17 22.5l-6-6z"/><rect x="12" y="32.5" width="21" height="5" rx="2"/>`,
    k: `<path d="M22.5 7v7M19 10.5h7" stroke-width="2.4" stroke-linecap="round"/><path d="M13.5 21c0-4 3.5-6.5 9-6.5s9 2.5 9 6.5c0 4.5-3 8.5-3 11.5h-12c0-3-3-7-3-11.5z"/><rect x="12" y="33" width="21" height="4.5" rx="2"/>`
  };

  return `<svg viewBox="0 0 45 45" class="chess-piece-svg" aria-hidden="true">
    <g fill="${fill}" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round">${paths[piece.type] || ''}</g>
  </svg>`;
}

function formatClock(ms) {
  const safe = Math.max(0, ms);
  const totalSec = Math.floor(safe / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (safe < 10_000) {
    const tenths = Math.floor((safe % 1000) / 100);
    return `${min}:${String(sec).padStart(2, '0')}.${tenths}`;
  }
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function createChessGame(ctx) {
  const {
    mountEl,
    mode = 'ai',
    isHost = true,
    isSpectator = false,
    localPlayerIndex = 1,
    players = { 1: { name: 'Blancas' }, 2: { name: 'Negras' } },
    sendNet,
    onMatchWin
  } = ctx;

  let currentPlayers = { ...players };
  let state = createInitialChessState();
  let selected = null;
  let legalTargets = [];
  let flipped = mode === 'online' && !isSpectator && localPlayerIndex === 2;
  let pendingPromo = null; // { fromR, fromC, toR, toC }

  let baseClockSec = 300; // 5 min default
  let clocksMs = { 1: 300_000, 2: 300_000 };
  let lastTickAt = null;
  let clockInterval = null;
  let aiTimer = null;
  let destroyed = false;

  const wrap = document.createElement('div');
  wrap.className = 'chess-wrap';
  wrap.innerHTML = `
    <div class="match-hud" style="max-width:740px;">
      <div class="hud-side" data-hud-p="1">
        <span class="hud-swatch" style="background:#f8fafc;border:1px solid #475569;"></span>
        <div class="hud-player-info">
          <span class="hud-player-name" data-ch-p1></span>
          <span class="hud-player-role" data-ch-p1-cap>Blancas</span>
        </div>
        <span class="chess-clock-pill" data-ch-clk="1">05:00</span>
      </div>
      <div class="hud-center">
        <span class="hud-score-big" data-ch-turn>BLANCAS</span>
        <span class="hud-substatus" data-ch-status>Tu turno</span>
      </div>
      <div class="hud-side right" data-hud-p="2">
        <span class="chess-clock-pill" data-ch-clk="2">05:00</span>
        <div class="hud-player-info">
          <span class="hud-player-name" data-ch-p2></span>
          <span class="hud-player-role" data-ch-p2-cap>Negras</span>
        </div>
        <span class="hud-swatch" style="background:#1e242c;border:1px solid #94a3b8;"></span>
      </div>
    </div>

    <div class="chess-stage-body">
      <div class="chess-board-outer">
        <div class="chess-board" data-ch-board></div>
        <div class="chess-promo-modal hidden" data-ch-promo></div>
      </div>

      <aside class="chess-side-panel">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <label class="field-label" for="sel-chess-clock" style="margin:0;">Reloj</label>
          <select id="sel-chess-clock" class="select-input" style="padding:5px 8px;font-size:0.78rem;" data-ch-clock-select>
            <option value="180">3 min (Blitz)</option>
            <option value="300" selected>5 min (Estándar)</option>
            <option value="600">10 min (Rápida)</option>
            <option value="0">Sin reloj</option>
          </select>
        </div>
        <div class="chess-moves-box" data-ch-moves></div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn btn-subtle btn-compact" style="flex:1;" data-ch-flip>🔄 Girar</button>
          <button type="button" class="btn btn-danger-ghost btn-compact" style="flex:1;" data-ch-resign>🏳️ Rendirse</button>
        </div>
      </aside>
    </div>

    <div class="board-result-banner hidden" data-ch-result></div>
  `;

  mountEl.innerHTML = '';
  mountEl.appendChild(wrap);

  const boardEl = wrap.querySelector('[data-ch-board]');
  const promoEl = wrap.querySelector('[data-ch-promo]');
  const movesEl = wrap.querySelector('[data-ch-moves]');
  const clockSel = wrap.querySelector('[data-ch-clock-select]');
  const clk1El = wrap.querySelector('[data-ch-clk="1"]');
  const clk2El = wrap.querySelector('[data-ch-clk="2"]');
  const p1NameEl = wrap.querySelector('[data-ch-p1]');
  const p2NameEl = wrap.querySelector('[data-ch-p2]');
  const p1CapEl = wrap.querySelector('[data-ch-p1-cap]');
  const p2CapEl = wrap.querySelector('[data-ch-p2-cap]');
  const side1El = wrap.querySelector('[data-hud-p="1"]');
  const side2El = wrap.querySelector('[data-hud-p="2"]');
  const turnBadgeEl = wrap.querySelector('[data-ch-turn]');
  const statusEl = wrap.querySelector('[data-ch-status]');
  const resignBtn = wrap.querySelector('[data-ch-resign]');
  const resultEl = wrap.querySelector('[data-ch-result]');

  function activeSlot() {
    return state.turn === 'w' ? 1 : 2;
  }

  function canLocalAct() {
    if (destroyed || isSpectator || state.status !== 'playing') return false;
    if (mode === 'local') return true;
    if (mode === 'ai') return state.turn === 'w';
    return activeSlot() === localPlayerIndex;
  }

  function materialPoints(color) {
    let pts = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (p && p.color === color && p.type !== 'k') pts += PIECE_VALUES[p.type] || 0;
      }
    }
    return pts;
  }

  function renderClocksUi() {
    if (baseClockSec === 0) {
      clk1El.textContent = '∞';
      clk2El.textContent = '∞';
      clk1El.classList.remove('active', 'low');
      clk2El.classList.remove('active', 'low');
      return;
    }
    clk1El.textContent = formatClock(clocksMs[1]);
    clk2El.textContent = formatClock(clocksMs[2]);
    clk1El.classList.toggle('active', state.status === 'playing' && state.history.length > 0 && state.turn === 'w');
    clk2El.classList.toggle('active', state.status === 'playing' && state.history.length > 0 && state.turn === 'b');
    clk1El.classList.toggle('low', clocksMs[1] < 20_000);
    clk2El.classList.toggle('low', clocksMs[2] < 20_000);
  }

  function render() {
    if (destroyed) return;
    p1NameEl.textContent = currentPlayers[1]?.name || 'Jugador 1';
    p2NameEl.textContent = currentPlayers[2]?.name || (mode === 'ai' ? 'CPU Gran Maestro' : 'Jugador 2');

    const diff = Math.round((materialPoints('w') - materialPoints('b')) / 100);
    p1CapEl.textContent = `Blancas${diff > 0 ? ` (+${diff})` : ''}`;
    p2CapEl.textContent = `Negras${diff < 0 ? ` (+${Math.abs(diff)})` : ''}`;

    side1El.classList.toggle('active-turn', state.status === 'playing' && state.turn === 'w');
    side2El.classList.toggle('active-turn', state.status === 'playing' && state.turn === 'b');

    const inCheck = state.status === 'playing' && isKingInCheck(state.board, state.turn);
    if (state.status !== 'playing') {
      turnBadgeEl.textContent = state.winner ? `GANA J${state.winner}` : 'TABLAS';
      statusEl.textContent = state.reason;
    } else {
      turnBadgeEl.textContent = state.turn === 'w' ? 'BLANCAS' : 'NEGRAS';
      statusEl.textContent = inCheck ? '⚠️ ¡JAQUE!' : canLocalAct() ? 'Elige jugada' : 'Esperando rival…';
    }

    clockSel.value = String(baseClockSec);
    clockSel.disabled = state.history.length > 0 || isSpectator || (mode === 'online' && !isHost);
    resignBtn.disabled = state.status !== 'playing' || isSpectator;
    renderClocksUi();

    // Render 8x8 board
    const checkedKing = inCheck ? findKing(state.board, state.turn) : null;
    const legalMap = new Map(legalTargets.map((m) => [`${m.toR},${m.toC}`, m]));
    let html = '';

    for (let vr = 0; vr < 8; vr++) {
      for (let vc = 0; vc < 8; vc++) {
        const r = flipped ? 7 - vr : vr;
        const c = flipped ? 7 - vc : vc;
        const isDark = (r + c) % 2 === 1;
        const piece = state.board[r][c];
        const isSel = selected && selected.r === r && selected.c === c;
        const isLast =
          state.lastMove &&
          ((state.lastMove.fromR === r && state.lastMove.fromC === c) ||
            (state.lastMove.toR === r && state.lastMove.toC === c));
        const legal = legalMap.get(`${r},${c}`);
        const isKingDanger = checkedKing && checkedKing.r === r && checkedKing.c === c;

        let cls = `chess-sq ${isDark ? 'dark' : 'light'}`;
        if (isSel) cls += ' selected';
        if (isLast) cls += ' last-move';
        if (legal) cls += legal.capture ? ' legal-capture' : ' legal-dot';
        if (isKingDanger) cls += ' in-check';

        const rankTag = vc === 0 ? `<span class="chess-coord rank">${RANKS[r]}</span>` : '';
        const fileTag = vr === 7 ? `<span class="chess-coord file">${FILES[c]}</span>` : '';

        html += `<button type="button" class="${cls}" data-sq="${r}:${c}" aria-label="${FILES[c]}${RANKS[r]}">${rankTag}${fileTag}${pieceSvg(piece)}</button>`;
      }
    }
    boardEl.innerHTML = html;

    // Bind square clicks
    boardEl.querySelectorAll('[data-sq]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [r, c] = btn.getAttribute('data-sq').split(':').map(Number);
        handleSquareClick(r, c);
      });
    });

    // Promotion picker overlay
    if (pendingPromo) {
      promoEl.classList.remove('hidden');
      const col = state.turn;
      promoEl.innerHTML = `
        <strong>Coronar peón</strong>
        <div style="display:flex;gap:6px;margin-top:6px;">
          ${['q', 'r', 'b', 'n']
            .map(
              (pt) =>
                `<button type="button" class="chess-promo-btn" data-promo="${pt}">${pieceSvg({ color: col, type: pt })}</button>`
            )
            .join('')}
        </div>
      `;
      promoEl.querySelectorAll('[data-promo]').forEach((b) => {
        b.addEventListener('click', () => {
          const p = pendingPromo;
          pendingPromo = null;
          commitMove({ ...p, promo: b.getAttribute('data-promo') });
        });
      });
    } else {
      promoEl.classList.add('hidden');
    }

    // Move history SAN pairs
    if (state.history.length === 0) {
      movesEl.innerHTML = `<span style="color:var(--text-muted);font-size:0.78rem;">1. Esperando apertura…</span>`;
    } else {
      const pairs = [];
      for (let i = 0; i < state.history.length; i += 2) {
        pairs.push(
          `<div class="chess-move-pair"><span>${i / 2 + 1}.</span><strong>${state.history[i]}</strong><span>${state.history[i + 1] || ''}</span></div>`
        );
      }
      movesEl.innerHTML = pairs.join('');
      movesEl.scrollTop = movesEl.scrollHeight;
    }

    // Result banner
    if (state.status !== 'playing') {
      const msg =
        state.winner === 0
          ? `🤝 ${state.reason}`
          : `🏆 ¡Gana ${currentPlayers[state.winner]?.name || (state.winner === 1 ? 'Blancas' : 'Negras')}!`;
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = `
        <strong>${msg}</strong>
        <span>${state.reason} · ${state.history.length} jugadas</span>
        ${!isSpectator ? '<button type="button" class="btn btn-primary btn-compact" data-ch-rematch>Revancha</button>' : ''}
      `;
      resultEl.querySelector('[data-ch-rematch]')?.addEventListener('click', () => restart(false));
    } else {
      resultEl.classList.add('hidden');
    }
  }

  function commitMove(move, fromRemote = false) {
    const res = applyChessMove(state, move);
    if (!res) return false;
    state = res.state;
    selected = null;
    legalTargets = [];
    lastTickAt = performance.now();

    if (res.inCheck || state.status === 'checkmate') sfx.checkAlert();
    else sfx.chessMove(res.captured);

    if (!fromRemote && mode === 'online') {
      sendNet?.({
        kind: 'MOVE',
        fromR: move.fromR,
        fromC: move.fromC,
        toR: move.toR,
        toC: move.toC,
        promo: move.promo || 'q'
      });
    }

    if (state.status !== 'playing') {
      if (state.winner === 1 || state.winner === 2) {
        if ((mode === 'online' && state.winner === localPlayerIndex) || (mode === 'ai' && state.winner === 1) || mode === 'local') {
          sfx.win();
        } else {
          sfx.lose();
        }
        onMatchWin?.(state.winner);
      }
    }

    render();

    if (mode === 'ai' && state.status === 'playing' && state.turn === 'b') {
      if (aiTimer) clearTimeout(aiTimer);
      aiTimer = setTimeout(() => {
        if (destroyed || state.status !== 'playing' || state.turn !== 'b') return;
        const best = chooseChessAiMove(state, 3);
        if (best) commitMove(best, false);
      }, 280);
    }
    return true;
  }

  function handleSquareClick(r, c) {
    if (!canLocalAct() || pendingPromo) return;
    const matchTarget = legalTargets.find((m) => m.toR === r && m.toC === c);
    if (matchTarget) {
      if (matchTarget.promo) {
        pendingPromo = { fromR: matchTarget.fromR, fromC: matchTarget.fromC, toR: r, toC: c };
        render();
        return;
      }
      commitMove(matchTarget, false);
      return;
    }

    const clickedPiece = state.board[r][c];
    if (clickedPiece && clickedPiece.color === state.turn) {
      if (selected && selected.r === r && selected.c === c) {
        selected = null;
        legalTargets = [];
      } else {
        selected = { r, c };
        legalTargets = getLegalMoves(state, r, c);
      }
      render();
      return;
    }

    selected = null;
    legalTargets = [];
    render();
  }

  function handleTimeout(loserSlot, fromRemote = false) {
    if (state.status !== 'playing') return;
    const winnerSlot = loserSlot === 1 ? 2 : 1;
    const winnerColor = winnerSlot === 1 ? 'w' : 'b';
    const hasMat = hasSufficientMatingMaterial(state.board, winnerColor);
    state.status = hasMat ? 'timeout' : 'draw_timeout';
    state.winner = hasMat ? winnerSlot : 0;
    state.reason = hasMat ? 'Victoria por tiempo agotado' : 'Tablas (tiempo / material insuficiente)';
    if (state.winner === 1 || state.winner === 2) onMatchWin?.(state.winner);
    if (!fromRemote && mode === 'online') {
      sendNet?.({ kind: 'TIMEOUT', loserSlot });
    }
    render();
  }

  clockInterval = setInterval(() => {
    if (destroyed || baseClockSec === 0 || state.status !== 'playing' || state.history.length === 0) {
      lastTickAt = performance.now();
      return;
    }
    const now = performance.now();
    const dt = lastTickAt ? now - lastTickAt : 100;
    lastTickAt = now;
    const slot = activeSlot();
    clocksMs[slot] = Math.max(0, clocksMs[slot] - dt);
    renderClocksUi();
    if (clocksMs[slot] <= 0) {
      if (mode !== 'online' || isHost) {
        handleTimeout(slot, false);
      }
    }
  }, 150);

  clockSel.addEventListener('change', () => {
    if (state.history.length > 0) return;
    baseClockSec = Number(clockSel.value) || 0;
    clocksMs = { 1: baseClockSec * 1000, 2: baseClockSec * 1000 };
    if (mode === 'online' && isHost) {
      sendNet?.({ kind: 'SET_CLOCK', clockSec: baseClockSec });
    }
    render();
  });

  wrap.querySelector('[data-ch-flip]')?.addEventListener('click', () => {
    flipped = !flipped;
    render();
  });

  resignBtn.addEventListener('click', () => {
    if (state.status !== 'playing' || isSpectator) return;
    const loser = mode === 'local' ? activeSlot() : mode === 'online' ? localPlayerIndex : 1;
    state.status = 'resigned';
    state.winner = loser === 1 ? 2 : 1;
    state.reason = `${currentPlayers[loser]?.name || `Jugador ${loser}`} se rindió`;
    sfx.lose();
    onMatchWin?.(state.winner);
    if (mode === 'online') sendNet?.({ kind: 'RESIGN', loserSlot: loser });
    render();
  });

  render();

  function restart(fromRemote = false) {
    if (aiTimer) clearTimeout(aiTimer);
    state = createInitialChessState();
    selected = null;
    legalTargets = [];
    pendingPromo = null;
    clocksMs = { 1: baseClockSec * 1000, 2: baseClockSec * 1000 };
    lastTickAt = null;
    render();
    if (!fromRemote && mode === 'online') {
      sendNet?.({ kind: 'RESTART', clockSec: baseClockSec });
    }
  }

  return {
    onNetMessage(msg) {
      if (!msg || destroyed) return;
      if (msg.kind === 'RESTART') {
        if (typeof msg.clockSec === 'number') baseClockSec = msg.clockSec;
        restart(true);
        return;
      }
      if (msg.kind === 'SET_CLOCK' && state.history.length === 0) {
        baseClockSec = Number(msg.clockSec) || 0;
        clocksMs = { 1: baseClockSec * 1000, 2: baseClockSec * 1000 };
        render();
        return;
      }
      if (msg.kind === 'MOVE') {
        commitMove(msg, true);
        return;
      }
      if (msg.kind === 'RESIGN') {
        const loser = msg.loserSlot === 1 || msg.loserSlot === 2 ? msg.loserSlot : localPlayerIndex === 1 ? 2 : 1;
        state.status = 'resigned';
        state.winner = loser === 1 ? 2 : 1;
        state.reason = `${currentPlayers[loser]?.name || `Jugador ${loser}`} se rindió`;
        sfx.win();
        onMatchWin?.(state.winner);
        render();
        return;
      }
      if (msg.kind === 'TIMEOUT') {
        handleTimeout(msg.loserSlot || activeSlot(), true);
      }
    },
    updatePlayers(nextPlayers) {
      currentPlayers = { ...nextPlayers };
      render();
    },
    getSnapshot() {
      return { state, baseClockSec, clocksMs };
    },
    applySnapshot(snap) {
      if (!snap || !snap.state) return;
      state = snap.state;
      baseClockSec = snap.baseClockSec ?? baseClockSec;
      clocksMs = snap.clocksMs || clocksMs;
      render();
    },
    restart,
    destroy() {
      destroyed = true;
      if (clockInterval) clearInterval(clockInterval);
      if (aiTimer) clearTimeout(aiTimer);
      mountEl.innerHTML = '';
    }
  };
}
