// Shared FIDE-legal Chess rules engine + Alpha-Beta AI (used by client UI and server shadow validator)

const FILES = 'abcdefgh';
const RANKS = '87654321';
const SAN_LETTER = { p: '', n: 'C', b: 'A', r: 'T', q: 'D', k: 'R' };

export const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PST = {
  p: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 27, 27, 10, 5, 5],
    [0, 0, 0, 24, 24, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -22, -22, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ],
  n: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50]
  ],
  b: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20]
  ],
  r: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 6, 6, 0, 0, 0]
  ],
  q: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20]
  ],
  k: [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20]
  ]
};

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function cloneChessState(state) {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: { ...state.castling },
    ep: state.ep ? { ...state.ep } : null,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
    history: [...state.history],
    captured: { w: [...state.captured.w], b: [...state.captured.b] },
    posCounts: { ...state.posCounts },
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    status: state.status,
    winner: state.winner,
    reason: state.reason
  };
}

function positionKey(board, turn, castling, ep) {
  const bStr = board
    .map((row) => row.map((p) => (p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : '.')).join(''))
    .join('/');
  const cStr =
    (castling.wK ? 'K' : '') +
    (castling.wQ ? 'Q' : '') +
    (castling.bK ? 'k' : '') +
    (castling.bQ ? 'q' : '');
  const epStr = ep ? `${ep.r},${ep.c}` : '-';
  return `${bStr}|${turn}|${cStr || '-'}|${epStr}`;
}

export function createInitialChessState() {
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { color: 'b', type: back[c] };
    board[1][c] = { color: 'b', type: 'p' };
    board[6][c] = { color: 'w', type: 'p' };
    board[7][c] = { color: 'w', type: back[c] };
  }
  const castling = { wK: true, wQ: true, bK: true, bQ: true };
  const initKey = positionKey(board, 'w', castling, null);
  return {
    board,
    turn: 'w',
    castling,
    ep: null,
    halfmove: 0,
    fullmove: 1,
    history: [],
    captured: { w: [], b: [] },
    posCounts: { [initKey]: 1 },
    lastMove: null,
    status: 'playing',
    winner: null,
    reason: ''
  };
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function findKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === 'k') return { r, c };
    }
  }
  return null;
}

export function isSquareAttacked(board, r, c, attackerColor) {
  // Pawn attacks
  const pawnDir = attackerColor === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const pr = r + pawnDir;
    const pc = c + dc;
    if (inBounds(pr, pc)) {
      const p = board[pr][pc];
      if (p && p.color === attackerColor && p.type === 'p') return true;
    }
  }

  // Knight attacks
  const kJumps = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1]
  ];
  for (const [dr, dc] of kJumps) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === attackerColor && p.type === 'n') return true;
    }
  }

  // Orthogonal sliders (rook / queen)
  const ortho = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of ortho) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === attackerColor && (p.type === 'r' || p.type === 'q')) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // Diagonal sliders (bishop / queen)
  const diag = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of diag) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === attackerColor && (p.type === 'b' || p.type === 'q')) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // King adjacency
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc)) {
        const p = board[nr][nc];
        if (p && p.color === attackerColor && p.type === 'k') return true;
      }
    }
  }

  return false;
}

export function isKingInCheck(board, color) {
  const k = findKing(board, color);
  if (!k) return false;
  return isSquareAttacked(board, k.r, k.c, color === 'w' ? 'b' : 'w');
}

function generatePseudoMovesForSquare(state, r, c) {
  const { board, castling, ep } = state;
  const piece = board[r][c];
  if (!piece) return [];
  const color = piece.color;
  const enemy = color === 'w' ? 'b' : 'w';
  const moves = [];

  if (piece.type === 'p') {
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    const promoRow = color === 'w' ? 0 : 7;

    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      if (r + dir === promoRow) {
        for (const promo of ['q', 'r', 'b', 'n']) {
          moves.push({ fromR: r, fromC: c, toR: r + dir, toC: c, promo });
        }
      } else {
        moves.push({ fromR: r, fromC: c, toR: r + dir, toC: c });
        if (r === startRow && !board[r + dir * 2][c]) {
          moves.push({ fromR: r, fromC: c, toR: r + dir * 2, toC: c, doublePawn: true });
        }
      }
    }

    for (const dc of [-1, 1]) {
      const tr = r + dir;
      const tc = c + dc;
      if (!inBounds(tr, tc)) continue;
      const target = board[tr][tc];
      if (target && target.color === enemy) {
        if (tr === promoRow) {
          for (const promo of ['q', 'r', 'b', 'n']) {
            moves.push({ fromR: r, fromC: c, toR: tr, toC: tc, promo, capture: true });
          }
        } else {
          moves.push({ fromR: r, fromC: c, toR: tr, toC: tc, capture: true });
        }
      } else if (ep && ep.r === tr && ep.c === tc) {
        moves.push({ fromR: r, fromC: c, toR: tr, toC: tc, epCapture: true, capture: true });
      }
    }
    return moves;
  }

  if (piece.type === 'n') {
    const jumps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    for (const [dr, dc] of jumps) {
      const tr = r + dr;
      const tc = c + dc;
      if (!inBounds(tr, tc)) continue;
      const target = board[tr][tc];
      if (!target || target.color === enemy) {
        moves.push({ fromR: r, fromC: c, toR: tr, toC: tc, capture: Boolean(target) });
      }
    }
    return moves;
  }

  if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
    const dirs = [];
    if (piece.type === 'b' || piece.type === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (piece.type === 'r' || piece.type === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    for (const [dr, dc] of dirs) {
      let tr = r + dr;
      let tc = c + dc;
      while (inBounds(tr, tc)) {
        const target = board[tr][tc];
        if (!target) {
          moves.push({ fromR: r, fromC: c, toR: tr, toC: tc });
        } else {
          if (target.color === enemy) {
            moves.push({ fromR: r, fromC: c, toR: tr, toC: tc, capture: true });
          }
          break;
        }
        tr += dr;
        tc += dc;
      }
    }
    return moves;
  }

  if (piece.type === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const tr = r + dr;
        const tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        const target = board[tr][tc];
        if (!target || target.color === enemy) {
          moves.push({ fromR: r, fromC: c, toR: tr, toC: tc, capture: Boolean(target) });
        }
      }
    }

    // Castling
    const homeRow = color === 'w' ? 7 : 0;
    if (r === homeRow && c === 4 && !isSquareAttacked(board, homeRow, 4, enemy)) {
      const canK = color === 'w' ? castling.wK : castling.bK;
      const canQ = color === 'w' ? castling.wQ : castling.bQ;
      const rookK = board[homeRow][7];
      const rookQ = board[homeRow][0];
      if (
        canK &&
        rookK &&
        rookK.color === color &&
        rookK.type === 'r' &&
        !board[homeRow][5] &&
        !board[homeRow][6] &&
        !isSquareAttacked(board, homeRow, 5, enemy) &&
        !isSquareAttacked(board, homeRow, 6, enemy)
      ) {
        moves.push({ fromR: homeRow, fromC: 4, toR: homeRow, toC: 6, castle: 'K' });
      }
      if (
        canQ &&
        rookQ &&
        rookQ.color === color &&
        rookQ.type === 'r' &&
        !board[homeRow][1] &&
        !board[homeRow][2] &&
        !board[homeRow][3] &&
        !isSquareAttacked(board, homeRow, 3, enemy) &&
        !isSquareAttacked(board, homeRow, 2, enemy)
      ) {
        moves.push({ fromR: homeRow, fromC: 4, toR: homeRow, toC: 2, castle: 'Q' });
      }
    }
  }

  return moves;
}

function makeMoveOnBoard(board, m) {
  const next = cloneBoard(board);
  const piece = next[m.fromR][m.fromC];
  next[m.fromR][m.fromC] = null;

  if (m.epCapture) {
    next[m.fromR][m.toC] = null;
  }
  if (m.castle === 'K') {
    next[m.fromR][5] = next[m.fromR][7];
    next[m.fromR][7] = null;
  } else if (m.castle === 'Q') {
    next[m.fromR][3] = next[m.fromR][0];
    next[m.fromR][0] = null;
  }

  next[m.toR][m.toC] = m.promo ? { color: piece.color, type: m.promo } : { ...piece };
  return next;
}

export function getLegalMoves(state, fromR, fromC) {
  if (state.status !== 'playing') return [];
  const p = state.board[fromR]?.[fromC];
  if (!p || p.color !== state.turn) return [];
  const pseudo = generatePseudoMovesForSquare(state, fromR, fromC);
  return pseudo.filter((m) => {
    const nextBoard = makeMoveOnBoard(state.board, m);
    return !isKingInCheck(nextBoard, p.color);
  });
}

export function getAllLegalMoves(state, color = state.turn) {
  if (state.status !== 'playing') return [];
  const out = [];
  const savedTurn = state.turn;
  const work = savedTurn === color ? state : { ...state, turn: color };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = work.board[r][c];
      if (p && p.color === color) {
        const list = getLegalMoves(work, r, c);
        for (const m of list) out.push(m);
      }
    }
  }
  return out;
}

export function hasSufficientMatingMaterial(board, color = null) {
  const counts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  const bishops = { w: [], b: [] };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.type === 'k') continue;
      counts[p.color][p.type]++;
      if (p.type === 'b') bishops[p.color].push((r + c) % 2);
    }
  }
  const hasFor = (side) => {
    const cs = counts[side];
    if (cs.p > 0 || cs.r > 0 || cs.q > 0) return true;
    if (cs.n + cs.b >= 2) return true;
    return false;
  };
  if (color) return hasFor(color);
  if (hasFor('w') || hasFor('b')) return true;
  // K+B vs K+B on different-colored squares could still mate in corner edge cases, same color cannot
  if (bishops.w.length === 1 && bishops.b.length === 1 && bishops.w[0] !== bishops.b[0]) {
    return true;
  }
  return false;
}

export function applyChessMove(state, moveInput) {
  if (state.status !== 'playing') return null;
  const fromR = Number(moveInput?.fromR);
  const fromC = Number(moveInput?.fromC);
  const toR = Number(moveInput?.toR);
  const toC = Number(moveInput?.toC);
  const promo = ['q', 'r', 'b', 'n'].includes(moveInput?.promo) ? moveInput.promo : 'q';

  const legal = getLegalMoves(state, fromR, fromC);
  const matched = legal.find(
    (m) => m.toR === toR && m.toC === toC && (!m.promo || m.promo === promo)
  );
  if (!matched) return null;

  const next = cloneChessState(state);
  const mover = next.board[fromR][fromC];
  const color = mover.color;
  const enemy = color === 'w' ? 'b' : 'w';
  const capturedPiece = matched.epCapture
    ? next.board[fromR][toC]
    : next.board[toR][toC];

  // Check SAN disambiguation before mutating board
  let disambig = '';
  if (mover.type !== 'p' && mover.type !== 'k' && !matched.castle) {
    const siblings = getAllLegalMoves(state, color).filter(
      (m) =>
        m.toR === toR &&
        m.toC === toC &&
        (m.fromR !== fromR || m.fromC !== fromC) &&
        state.board[m.fromR][m.fromC]?.type === mover.type
    );
    if (siblings.length > 0) {
      const sameFile = siblings.some((s) => s.fromC === fromC);
      const sameRank = siblings.some((s) => s.fromR === fromR);
      if (!sameFile) disambig = FILES[fromC];
      else if (!sameRank) disambig = RANKS[fromR];
      else disambig = FILES[fromC] + RANKS[fromR];
    }
  }

  next.board = makeMoveOnBoard(next.board, matched);
  if (capturedPiece) {
    next.captured[color].push(capturedPiece.type);
  }

  // Update castling rights
  if (mover.type === 'k') {
    if (color === 'w') {
      next.castling.wK = false;
      next.castling.wQ = false;
    } else {
      next.castling.bK = false;
      next.castling.bQ = false;
    }
  }
  if (mover.type === 'r') {
    if (fromR === 7 && fromC === 7) next.castling.wK = false;
    if (fromR === 7 && fromC === 0) next.castling.wQ = false;
    if (fromR === 0 && fromC === 7) next.castling.bK = false;
    if (fromR === 0 && fromC === 0) next.castling.bQ = false;
  }
  if (toR === 7 && toC === 7) next.castling.wK = false;
  if (toR === 7 && toC === 0) next.castling.wQ = false;
  if (toR === 0 && toC === 7) next.castling.bK = false;
  if (toR === 0 && toC === 0) next.castling.bQ = false;

  next.ep = matched.doublePawn ? { r: (fromR + toR) / 2, c: fromC } : null;
  next.halfmove = mover.type === 'p' || capturedPiece ? 0 : next.halfmove + 1;
  if (color === 'b') next.fullmove += 1;
  next.turn = enemy;
  next.lastMove = { fromR, fromC, toR, toC, castle: matched.castle || null, capture: Boolean(capturedPiece) };

  const inCheck = isKingInCheck(next.board, enemy);
  const enemyMoves = getAllLegalMoves(next, enemy);

  let san = '';
  if (matched.castle === 'K') san = 'O-O';
  else if (matched.castle === 'Q') san = 'O-O-O';
  else if (mover.type === 'p') {
    san = capturedPiece ? `${FILES[fromC]}x${FILES[toC]}${RANKS[toR]}` : `${FILES[toC]}${RANKS[toR]}`;
    if (matched.promo) san += `=${SAN_LETTER[matched.promo]}`;
  } else {
    san = `${SAN_LETTER[mover.type]}${disambig}${capturedPiece ? 'x' : ''}${FILES[toC]}${RANKS[toR]}`;
  }

  if (enemyMoves.length === 0) {
    if (inCheck) {
      san += '#';
      next.status = 'checkmate';
      next.winner = color === 'w' ? 1 : 2;
      next.reason = 'Jaque mate';
    } else {
      next.status = 'stalemate';
      next.winner = 0;
      next.reason = 'Tablas por ahogado';
    }
  } else {
    if (inCheck) san += '+';
    const key = positionKey(next.board, next.turn, next.castling, next.ep);
    next.posCounts[key] = (next.posCounts[key] || 0) + 1;
    if (next.posCounts[key] >= 3) {
      next.status = 'draw_repetition';
      next.winner = 0;
      next.reason = 'Tablas por triple repetición';
    } else if (next.halfmove >= 100) {
      next.status = 'draw_50';
      next.winner = 0;
      next.reason = 'Tablas por regla de 50 movimientos';
    } else if (!hasSufficientMatingMaterial(next.board)) {
      next.status = 'draw_material';
      next.winner = 0;
      next.reason = 'Tablas por material insuficiente';
    }
  }

  next.history.push(san);
  return { state: next, move: matched, san, inCheck, captured: Boolean(capturedPiece) };
}

function evaluateChessBoard(state) {
  if (state.status === 'checkmate') {
    return state.winner === 1 ? 95000 : -95000;
  }
  if (state.status !== 'playing') return 0;

  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      const pstR = p.color === 'w' ? r : 7 - r;
      const val = (PIECE_VALUES[p.type] || 0) + (PST[p.type]?.[pstR]?.[c] || 0);
      score += p.color === 'w' ? val : -val;
    }
  }
  return score;
}

function orderMoves(board, moves) {
  return moves.sort((a, b) => {
    const scoreOf = (m) => {
      let s = 0;
      if (m.promo) s += PIECE_VALUES[m.promo] || 800;
      const vic = board[m.toR][m.toC];
      const att = board[m.fromR][m.fromC];
      if (vic) s += 10 * (PIECE_VALUES[vic.type] || 100) - (PIECE_VALUES[att?.type] || 0);
      if (m.castle) s += 65;
      if (m.toR >= 2 && m.toR <= 5 && m.toC >= 2 && m.toC <= 5) s += 12;
      return s;
    };
    return scoreOf(b) - scoreOf(a);
  });
}

function minimaxChess(state, depth, alpha, beta, maximizing, ply) {
  if (state.status !== 'playing') {
    if (state.status === 'checkmate') {
      return state.winner === 1 ? 90000 - ply : -90000 + ply;
    }
    return 0;
  }
  if (depth === 0) return evaluateChessBoard(state);

  const moves = orderMoves(state.board, getAllLegalMoves(state, state.turn));
  if (moves.length === 0) return evaluateChessBoard(state);

  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      const res = applyChessMove(state, m);
      if (!res) continue;
      const val = minimaxChess(res.state, depth - 1, alpha, beta, false, ply + 1);
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const m of moves) {
    const res = applyChessMove(state, m);
    if (!res) continue;
    const val = minimaxChess(res.state, depth - 1, alpha, beta, true, ply + 1);
    if (val < best) best = val;
    if (val < beta) beta = val;
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseChessAiMove(state, depth = 3) {
  const moves = orderMoves(state.board, getAllLegalMoves(state, state.turn));
  if (moves.length === 0) return null;

  const maximizing = state.turn === 'w';
  let bestVal = maximizing ? -Infinity : Infinity;
  let bestMoves = [];

  for (const m of moves) {
    // Only consider queen or knight underpromotion in search to keep branching fast
    if (m.promo && m.promo !== 'q' && m.promo !== 'n') continue;
    const res = applyChessMove(state, m);
    if (!res) continue;
    const val = minimaxChess(res.state, depth - 1, -Infinity, Infinity, !maximizing, 1);
    if (maximizing) {
      if (val > bestVal) {
        bestVal = val;
        bestMoves = [m];
      } else if (val === bestVal) {
        bestMoves.push(m);
      }
    } else {
      if (val < bestVal) {
        bestVal = val;
        bestMoves = [m];
      } else if (val === bestVal) {
        bestMoves.push(m);
      }
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)] || moves[0];
}
