import { sfx } from '../audio/sfx.js';

const H = 1.62; // Logical table height (width = 1.0)
const PUCK_R = 0.042;
const MALLET_R = 0.072;
const GOAL_HALF = 0.185; // Goal spans x in [0.5 - GOAL_HALF, 0.5 + GOAL_HALF]
const MAX_MALLET_SPEED = 2.75;
const MAX_PUCK_SPEED = 2.85;
const FRICTION = 0.994;
const WIN_SCORE = 7;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function createAirHockeyGame(ctx) {
  const { mountEl, mode, isHost, localPlayerIndex, sendNet, onMatchWin, onRequestHub } = ctx;
  let players = { ...ctx.players };

  // Guest in online mode sees table rotated 180deg so own goal is always at bottom
  const flipView = mode === 'online' && !isHost;

  mountEl.innerHTML = `
    <div class="hockey-wrap">
      <div class="match-hud">
        <div class="hud-side" id="hk-side-me">
          <span class="hud-swatch ${localPlayerIndex === 1 ? 'p1' : 'p2'}"></span>
          <div class="hud-player-info">
            <span class="hud-player-name" id="hk-name-bottom"></span>
            <span class="hud-player-role" id="hk-role-bottom">Abajo</span>
          </div>
        </div>
        <div class="hud-center">
          <span class="hud-score-big" id="hk-score-text">0 : 0</span>
          <span class="hud-substatus" id="hk-status-text">A ${WIN_SCORE} goles</span>
        </div>
        <div class="hud-side right" id="hk-side-opp">
          <div class="hud-player-info">
            <span class="hud-player-name" id="hk-name-top"></span>
            <span class="hud-player-role" id="hk-role-top">Arriba</span>
          </div>
          <span class="hud-swatch ${localPlayerIndex === 1 ? 'p2' : 'p1'}"></span>
        </div>
      </div>

      <div class="hockey-arena-frame" id="hk-frame">
        <canvas id="hk-canvas" class="hockey-canvas" width="380" height="615"></canvas>
      </div>

      <div class="hockey-help-caption" id="hk-help"></div>

      <div class="result-overlay hidden" id="hk-result">
        <div class="result-copy">
          <span class="result-headline" id="hk-result-title">¡Partida terminada!</span>
          <span class="result-sub" id="hk-result-sub"></span>
        </div>
        <div class="result-actions">
          <button type="button" class="btn btn-primary btn-compact" id="hk-btn-rematch">Revancha</button>
          <button type="button" class="btn btn-subtle btn-compact" id="hk-btn-hub">Cambiar juego</button>
        </div>
      </div>
    </div>
  `;

  const canvas = mountEl.querySelector('#hk-canvas');
  const g = canvas.getContext('2d');
  const scoreEl = mountEl.querySelector('#hk-score-text');
  const statusEl = mountEl.querySelector('#hk-status-text');
  const nameBottomEl = mountEl.querySelector('#hk-name-bottom');
  const nameTopEl = mountEl.querySelector('#hk-name-top');
  const roleBottomEl = mountEl.querySelector('#hk-role-bottom');
  const roleTopEl = mountEl.querySelector('#hk-role-top');
  const helpEl = mountEl.querySelector('#hk-help');
  const resultBox = mountEl.querySelector('#hk-result');
  const resultTitle = mountEl.querySelector('#hk-result-title');
  const resultSub = mountEl.querySelector('#hk-result-sub');
  const btnRematch = mountEl.querySelector('#hk-btn-rematch');
  const btnHub = mountEl.querySelector('#hk-btn-hub');

  if (mode === 'local') {
    helpEl.textContent = 'Multitáctil (1 en cada mitad) o en PC: Ratón/WASD (Abajo) vs Flechas (Arriba)';
  } else {
    helpEl.textContent = 'PC: Mueve con ratón o WASD · Android: Desliza el dedo en tu mitad inferior';
  }

  // Canonical state (P1 at bottom y ~ 1.38, P2 at top y ~ 0.24)
  const state = {
    p1: { x: 0.5, y: H - 0.22, vx: 0, vy: 0, tx: 0.5, ty: H - 0.22 },
    p2: { x: 0.5, y: 0.22, vx: 0, vy: 0, tx: 0.5, ty: 0.22 },
    puck: { x: 0.5, y: H / 2, vx: 0, vy: 0 },
    score1: 0,
    score2: 0,
    phase: 'countdown', // 'countdown' | 'playing' | 'goal_pause' | 'finished'
    countdown: 2.1,
    winner: 0,
    serveTo: 0 // 0 neutral, 1 towards P1, 2 towards P2
  };

  // Visual effects (local)
  const trail = [];
  const sparks = [];
  let flashAlpha = 0;
  let flashColor = '#f58229';
  let lastCountdownBeep = 4;

  // Guest interpolation target
  const netTarget = {
    p1x: 0.5,
    p1y: H - 0.22,
    p2x: 0.5,
    p2y: 0.22,
    px: 0.5,
    py: H / 2,
    pvx: 0,
    pvy: 0,
    hasSnapshot: false
  };

  // Input tracking
  const activePointers = new Map(); // pointerId -> 'p1' | 'p2' | 'mine'
  const keys = new Set();
  let lastInputSentAt = 0;
  let lastSnapSentAt = 0;
  let logicalPxWidth = 360;
  let logicalPxHeight = Math.round(360 * H);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  function refreshHudLabels() {
    const bottomIdx = flipView ? 2 : 1;
    const topIdx = flipView ? 1 : 2;
    nameBottomEl.textContent = players[bottomIdx]?.name || `Jugador ${bottomIdx}`;
    nameTopEl.textContent = players[topIdx]?.name || `Jugador ${topIdx}`;

    if (mode === 'online') {
      roleBottomEl.textContent = `Tú · ${players[bottomIdx]?.device || ''}`;
      roleTopEl.textContent = `Rival · ${players[topIdx]?.device || ''}`;
    } else if (mode === 'ai') {
      roleBottomEl.textContent = 'Tú';
      roleTopEl.textContent = 'CPU Táctica';
    } else {
      roleBottomEl.textContent = 'Jugador 1 (Sur)';
      roleTopEl.textContent = 'Jugador 2 (Norte)';
    }
    refreshScoreText();
  }

  function refreshScoreText() {
    const myScore = flipView ? state.score2 : state.score1;
    const oppScore = flipView ? state.score1 : state.score2;
    scoreEl.textContent = `${myScore} : ${oppScore}`;
  }

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const reservedVertical = viewportW < 640 ? 225 : 250;
    const maxH = Math.max(330, Math.min(680, viewportH - reservedVertical));
    const maxW = Math.max(250, Math.min(440, viewportW - 44));

    let width = Math.min(maxW, maxH / H);
    let height = width * H;

    logicalPxWidth = Math.round(width);
    logicalPxHeight = Math.round(height);

    canvas.style.width = `${logicalPxWidth}px`;
    canvas.style.height = `${logicalPxHeight}px`;
    canvas.width = Math.round(logicalPxWidth * dpr);
    canvas.height = Math.round(logicalPxHeight * dpr);
  }

  function spawnSparks(cx, cy, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.25 + Math.random() * 0.85;
      sparks.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color
      });
    }
  }

  function resetPositions(serveTowards = 0) {
    state.p1.x = 0.5;
    state.p1.y = H - 0.22;
    state.p1.tx = 0.5;
    state.p1.ty = H - 0.22;
    state.p1.vx = 0;
    state.p1.vy = 0;

    state.p2.x = 0.5;
    state.p2.y = 0.22;
    state.p2.tx = 0.5;
    state.p2.ty = 0.22;
    state.p2.vx = 0;
    state.p2.vy = 0;

    state.puck.x = 0.5;
    state.puck.y =
      serveTowards === 1 ? H * 0.6 : serveTowards === 2 ? H * 0.4 : H * 0.5;
    state.puck.vx = 0;
    state.puck.vy = 0;
    trail.length = 0;
  }

  function launchServe() {
    const angleSpread = (Math.random() - 0.5) * 0.7;
    const dirY =
      state.serveTo === 1 ? 1 : state.serveTo === 2 ? -1 : Math.random() < 0.5 ? 1 : -1;
    const speed = 0.68;
    state.puck.vx = Math.sin(angleSpread) * speed;
    state.puck.vy = Math.cos(angleSpread) * speed * dirY;
  }

  function screenToTableCoords(clientX, clientY, isTouch = false) {
    const rect = canvas.getBoundingClientRect();
    let sx = (clientX - rect.left) / rect.width;
    let sy = ((clientY - rect.top) / rect.height) * H;
    if (isTouch) {
      // Slight ergonomic lift so finger pad doesn't obscure mallet
      sy -= 0.055;
    }
    sx = clamp(sx, MALLET_R, 1 - MALLET_R);
    sy = clamp(sy, MALLET_R, H - MALLET_R);
    if (flipView) {
      return { x: 1 - sx, y: H - sy, screenY: sy };
    }
    return { x: sx, y: sy, screenY: sy };
  }

  function applyLocalTarget(side, cx, cy) {
    if (side === 'p1') {
      state.p1.tx = clamp(cx, MALLET_R, 1 - MALLET_R);
      state.p1.ty = clamp(cy, H / 2 + MALLET_R * 0.95, H - MALLET_R);
    } else if (side === 'p2') {
      state.p2.tx = clamp(cx, MALLET_R, 1 - MALLET_R);
      state.p2.ty = clamp(cy, MALLET_R, H / 2 - MALLET_R * 0.95);
    }
  }

  function handlePointerInput(e, isDown = false) {
    const isTouch = e.pointerType === 'touch';
    if (!isTouch && e.type === 'pointermove' && mode === 'local' && e.buttons === 0) {
      // On PC local mode, mouse freely controls bottom player
      const pt = screenToTableCoords(e.clientX, e.clientY, false);
      applyLocalTarget('p1', pt.x, pt.y);
      return;
    }

    if (mode !== 'local') {
      // Online or vs AI: pointer always controls our own mallet
      if (!isTouch || activePointers.has(e.pointerId) || isDown) {
        if (isDown) activePointers.set(e.pointerId, 'mine');
        const pt = screenToTableCoords(e.clientX, e.clientY, isTouch);
        if (mode === 'online' && !isHost) {
          // Constrain to P2 canonical half (top)
          const tx = clamp(pt.x, MALLET_R, 1 - MALLET_R);
          const ty = clamp(pt.y, MALLET_R, H / 2 - MALLET_R * 0.95);
          state.p2.tx = tx;
          state.p2.ty = ty;
          const now = performance.now();
          if (now - lastInputSentAt >= 15) {
            lastInputSentAt = now;
            sendNet({ kind: 'INPUT', tx, ty });
          }
        } else {
          applyLocalTarget('p1', pt.x, pt.y);
        }
      }
      return;
    }

    // Local 2P multitouch: assign pointer to P1 (bottom) or P2 (top) based on touch start half
    const rect = canvas.getBoundingClientRect();
    const rawSy = ((e.clientY - rect.top) / rect.height) * H;
    if (isDown) {
      const side = rawSy >= H / 2 ? 'p1' : 'p2';
      activePointers.set(e.pointerId, side);
    }
    const assigned = activePointers.get(e.pointerId);
    if (assigned) {
      const offsetY = isTouch ? (assigned === 'p1' ? rawSy - 0.055 : rawSy + 0.055) : rawSy;
      const sx = clamp((e.clientX - rect.left) / rect.width, MALLET_R, 1 - MALLET_R);
      applyLocalTarget(assigned, sx, offsetY);
    }
  }

  function onPointerDown(e) {
    e.preventDefault();
    sfx.ensureContext();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
    handlePointerInput(e, true);
  }

  function onPointerMove(e) {
    handlePointerInput(e, false);
  }

  function onPointerUp(e) {
    activePointers.delete(e.pointerId);
  }

  function onKeyDown(e) {
    const code = e.code;
    if (
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
        code
      )
    ) {
      keys.add(code);
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function updateKeyboardTargets(dt) {
    if (keys.size === 0) return;
    const kbSpeed = 1.45 * dt;

    // In Online/AI mode, both WASD and Arrows move local player's mallet (in screen space!)
    if (mode !== 'local') {
      let dx = 0;
      let dy = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= kbSpeed;
      if (keys.has('KeyD') || keys.has('ArrowRight')) dx += kbSpeed;
      if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= kbSpeed;
      if (keys.has('KeyS') || keys.has('ArrowDown')) dy += kbSpeed;
      if (dx === 0 && dy === 0) return;

      if (flipView) {
        state.p2.tx = clamp(state.p2.tx - dx, MALLET_R, 1 - MALLET_R);
        state.p2.ty = clamp(state.p2.ty - dy, MALLET_R, H / 2 - MALLET_R * 0.95);
        const now = performance.now();
        if (now - lastInputSentAt >= 16) {
          lastInputSentAt = now;
          sendNet({ kind: 'INPUT', tx: state.p2.tx, ty: state.p2.ty });
        }
      } else {
        applyLocalTarget('p1', state.p1.tx + dx, state.p1.ty + dy);
      }
      return;
    }

    // Local 2P on PC: WASD -> P1 (bottom), Arrows -> P2 (top)
    let dx1 = 0;
    let dy1 = 0;
    if (keys.has('KeyA')) dx1 -= kbSpeed;
    if (keys.has('KeyD')) dx1 += kbSpeed;
    if (keys.has('KeyW')) dy1 -= kbSpeed;
    if (keys.has('KeyS')) dy1 += kbSpeed;
    if (dx1 || dy1) applyLocalTarget('p1', state.p1.tx + dx1, state.p1.ty + dy1);

    let dx2 = 0;
    let dy2 = 0;
    if (keys.has('ArrowLeft')) dx2 -= kbSpeed;
    if (keys.has('ArrowRight')) dx2 += kbSpeed;
    if (keys.has('ArrowUp')) dy2 -= kbSpeed;
    if (keys.has('ArrowDown')) dy2 += kbSpeed;
    if (dx2 || dy2) applyLocalTarget('p2', state.p2.tx + dx2, state.p2.ty + dy2);
  }

  function updateAiTarget(dt) {
    const puck = state.puck;
    let targetX = 0.5;
    let targetY = 0.2;

    if (puck.y < H * 0.54) {
      // Attack / intercept when puck enters top half
      targetX = clamp(puck.x + puck.vx * 0.08, MALLET_R + 0.03, 1 - MALLET_R - 0.03);
      if (puck.y < state.p2.y - 0.02) {
        // Retreat toward goal if puck got behind AI
        targetY = clamp(puck.y - 0.08, MALLET_R, 0.22);
        targetX = puck.x < 0.5 ? clamp(puck.x + 0.1, MALLET_R, 0.9) : clamp(puck.x - 0.1, 0.1, 1 - MALLET_R);
      } else {
        targetY = clamp(puck.y - 0.015, MALLET_R + 0.02, H / 2 - MALLET_R * 1.15);
      }
    } else {
      // Defend goal crease tracking puck X softly
      targetX = clamp(0.5 + (puck.x - 0.5) * 0.55, 0.28, 0.72);
      targetY = 0.2;
    }

    const blend = Math.min(1, dt * 8.5);
    state.p2.tx += (targetX - state.p2.tx) * blend;
    state.p2.ty += (targetY - state.p2.ty) * blend;
  }

  function moveMallet(m, minY, maxY, dt) {
    const dx = m.tx - m.x;
    const dy = m.ty - m.y;
    const dist = Math.hypot(dx, dy);
    const maxStep = MAX_MALLET_SPEED * dt;

    let nx = m.tx;
    let ny = m.ty;
    if (dist > maxStep && dist > 1e-6) {
      nx = m.x + (dx / dist) * maxStep;
      ny = m.y + (dy / dist) * maxStep;
    }
    nx = clamp(nx, MALLET_R, 1 - MALLET_R);
    ny = clamp(ny, minY, maxY);

    m.vx = dt > 1e-5 ? (nx - m.x) / dt : 0;
    m.vy = dt > 1e-5 ? (ny - m.y) / dt : 0;
    m.x = nx;
    m.y = ny;
  }

  function collideMalletPuck(m, colorHex) {
    const p = state.puck;
    let dx = p.x - m.x;
    let dy = p.y - m.y;
    let dist = Math.hypot(dx, dy);
    const minDist = MALLET_R + PUCK_R;

    if (dist < minDist) {
      if (dist < 1e-5) {
        dx = 0;
        dy = m.y > H / 2 ? -1 : 1;
        dist = 1;
      }
      const nx = dx / dist;
      const ny = dy / dist;

      // Push puck out of overlap
      p.x = m.x + nx * (minDist + 0.0015);
      p.y = m.y + ny * (minDist + 0.0015);

      const rvx = p.vx - m.vx;
      const rvy = p.vy - m.vy;
      const velAlongNormal = rvx * nx + rvy * ny;

      if (velAlongNormal < 0) {
        const restitution = 0.92;
        const impulse = -(1 + restitution) * velAlongNormal;
        p.vx += impulse * nx + m.vx * 0.22;
        p.vy += impulse * ny + m.vy * 0.22;

        // Minimum pop so gentle touches still feel crisp
        const speed = Math.hypot(p.vx, p.vy);
        if (speed < 0.55) {
          p.vx = nx * 0.55;
          p.vy = ny * 0.55;
        } else if (speed > MAX_PUCK_SPEED) {
          p.vx = (p.vx / speed) * MAX_PUCK_SPEED;
          p.vy = (p.vy / speed) * MAX_PUCK_SPEED;
        }

        const hitStrength = clamp(Math.hypot(p.vx, p.vy) / 1.8, 0.35, 1.35);
        sfx.puckHit(hitStrength);
        spawnSparks(m.x + nx * MALLET_R, m.y + ny * MALLET_R, colorHex, 9);

        if (mode === 'online' && isHost) {
          sendNet({
            kind: 'FX_HIT',
            x: m.x + nx * MALLET_R,
            y: m.y + ny * MALLET_R,
            c: colorHex,
            s: hitStrength
          });
        }
      }
    }
  }

  function handleGoal(scorer) {
    if (scorer === 1) state.score1 += 1;
    else state.score2 += 1;

    refreshScoreText();
    const scoredByMe = scorer === localPlayerIndex || mode === 'local';
    sfx.goal(scoredByMe);

    flashColor = scorer === 1 ? '#f58229' : '#1ad1be';
    flashAlpha = 0.34;
    spawnSparks(0.5, scorer === 1 ? 0.05 : H - 0.05, flashColor, 22);

    if (state.score1 >= WIN_SCORE || state.score2 >= WIN_SCORE) {
      state.phase = 'finished';
      state.winner = state.score1 >= WIN_SCORE ? 1 : 2;
      showResultBanner();
      onMatchWin?.(state.winner);
    } else {
      state.phase = 'countdown';
      state.serveTo = scorer === 1 ? 2 : 1; // Loser of point receives serve area
      state.countdown = 1.6;
      lastCountdownBeep = 3;
      resetPositions(state.serveTo);
    }

    if (mode === 'online' && isHost) {
      sendNet({
        kind: 'GOAL_EVENT',
        scorer,
        score1: state.score1,
        score2: state.score2,
        phase: state.phase,
        winner: state.winner,
        serveTo: state.serveTo
      });
    }
  }

  function stepAuthoritativePhysics(dt) {
    if (state.phase === 'finished') return;

    if (mode === 'ai') {
      updateAiTarget(dt);
    }

    if (state.phase === 'countdown') {
      moveMallet(state.p1, H / 2 + MALLET_R * 0.95, H - MALLET_R, dt);
      moveMallet(state.p2, MALLET_R, H / 2 - MALLET_R * 0.95, dt);

      state.countdown -= dt;
      const secCeil = Math.ceil(state.countdown);
      if (secCeil < lastCountdownBeep && secCeil >= 1) {
        lastCountdownBeep = secCeil;
        sfx.countdownPip(false);
      }
      statusEl.textContent = secCeil > 0 ? `Saque en ${secCeil}…` : '¡Ya!';

      if (state.countdown <= 0) {
        state.phase = 'playing';
        statusEl.textContent = `A ${WIN_SCORE} goles`;
        sfx.countdownPip(true);
        launchServe();
      }
      return;
    }

    const subSteps = 3;
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      moveMallet(state.p1, H / 2 + MALLET_R * 0.95, H - MALLET_R, subDt);
      moveMallet(state.p2, MALLET_R, H / 2 - MALLET_R * 0.95, subDt);

      const p = state.puck;
      p.x += p.vx * subDt;
      p.y += p.vy * subDt;

      const damp = Math.pow(FRICTION, subDt * 60);
      p.vx *= damp;
      p.vy *= damp;

      // Side rails
      if (p.x < PUCK_R) {
        p.x = PUCK_R;
        p.vx = Math.abs(p.vx) * 0.94;
        sfx.wallHit(Math.abs(p.vx) * 0.5);
      } else if (p.x > 1 - PUCK_R) {
        p.x = 1 - PUCK_R;
        p.vx = -Math.abs(p.vx) * 0.94;
        sfx.wallHit(Math.abs(p.vx) * 0.5);
      }

      const inGoalMouth = p.x > 0.5 - GOAL_HALF + PUCK_R * 0.35 && p.x < 0.5 + GOAL_HALF - PUCK_R * 0.35;

      // Top rail / Goal 2 (P1 scores!)
      if (inGoalMouth) {
        if (p.y < -PUCK_R * 0.35) {
          handleGoal(1);
          return;
        }
      } else if (p.y < PUCK_R) {
        p.y = PUCK_R;
        p.vy = Math.abs(p.vy) * 0.94;
        // Soft corner push so puck never stalls in corners
        if (p.x < 0.12) p.vx += 0.18;
        if (p.x > 0.88) p.vx -= 0.18;
        sfx.wallHit(Math.abs(p.vy) * 0.5);
      }

      // Bottom rail / Goal 1 (P2 scores!)
      if (inGoalMouth) {
        if (p.y > H + PUCK_R * 0.35) {
          handleGoal(2);
          return;
        }
      } else if (p.y > H - PUCK_R) {
        p.y = H - PUCK_R;
        p.vy = -Math.abs(p.vy) * 0.94;
        if (p.x < 0.12) p.vx += 0.18;
        if (p.x > 0.88) p.vx -= 0.18;
        sfx.wallHit(Math.abs(p.vy) * 0.5);
      }

      // Goal post circular bumpers
      const posts = [
        { x: 0.5 - GOAL_HALF, y: 0 },
        { x: 0.5 + GOAL_HALF, y: 0 },
        { x: 0.5 - GOAL_HALF, y: H },
        { x: 0.5 + GOAL_HALF, y: H }
      ];
      for (const post of posts) {
        const dx = p.x - post.x;
        const dy = p.y - post.y;
        const dist = Math.hypot(dx, dy);
        if (dist < PUCK_R && dist > 1e-5) {
          const nx = dx / dist;
          const ny = dy / dist;
          p.x = post.x + nx * PUCK_R;
          p.y = post.y + ny * PUCK_R;
          const dot = p.vx * nx + p.vy * ny;
          if (dot < 0) {
            p.vx -= 1.9 * dot * nx;
            p.vy -= 1.9 * dot * ny;
            sfx.wallHit(0.6);
          }
        }
      }

      collideMalletPuck(state.p1, '#f58229');
      collideMalletPuck(state.p2, '#1ad1be');

      // Anti-stall nudge if puck stops dead near center line
      if (Math.hypot(p.vx, p.vy) < 0.04 && Math.abs(p.y - H / 2) < 0.08) {
        p.vy = p.y >= H / 2 ? 0.32 : -0.32;
      }
    }
  }

  function stepGuestInterpolation(dt) {
    // Move own mallet locally for zero-latency feel
    moveMallet(state.p2, MALLET_R, H / 2 - MALLET_R * 0.95, dt);

    if (!netTarget.hasSnapshot) return;
    const blend = Math.min(1, dt * 22);
    state.p1.x += (netTarget.p1x - state.p1.x) * blend;
    state.p1.y += (netTarget.p1y - state.p1.y) * blend;

    // Softly reconcile own mallet with authoritative position if far off
    if (Math.hypot(netTarget.p2x - state.p2.x, netTarget.p2y - state.p2.y) > 0.14) {
      state.p2.x += (netTarget.p2x - state.p2.x) * 0.35;
      state.p2.y += (netTarget.p2y - state.p2.y) * 0.35;
    }

    if (state.phase === 'playing') {
      // Extrapolate + smooth puck
      state.puck.x += netTarget.pvx * dt;
      state.puck.y += netTarget.pvy * dt;
      state.puck.x += (netTarget.px - state.puck.x) * Math.min(1, dt * 18);
      state.puck.y += (netTarget.py - state.puck.y) * Math.min(1, dt * 18);
    } else {
      state.puck.x = netTarget.px;
      state.puck.y = netTarget.py;
    }
  }

  function showResultBanner() {
    const myWin = state.winner === localPlayerIndex;
    if (mode === 'local') {
      const wName = players[state.winner]?.name || `Jugador ${state.winner}`;
      resultTitle.textContent = `¡Victoria de ${wName}!`;
      resultSub.textContent = `Marcador final ${state.score1} - ${state.score2}`;
      sfx.win();
    } else if (myWin) {
      resultTitle.textContent = '¡Ganaste la partida!';
      resultSub.textContent = 'Dominio total en la pista.';
      sfx.win();
    } else {
      const oppName = players[state.winner]?.name || 'Tu rival';
      resultTitle.textContent = `${oppName} gana esta ronda`;
      resultSub.textContent = '¿Listo para la revancha?';
      sfx.lose();
    }
    statusEl.textContent = 'Finalizado';
    resultBox.classList.remove('hidden');
  }

  function toView(cx, cy) {
    if (flipView) {
      return {
        x: (1 - cx) * logicalPxWidth,
        y: ((H - cy) / H) * logicalPxHeight
      };
    }
    return {
      x: cx * logicalPxWidth,
      y: (cy / H) * logicalPxHeight
    };
  }

  function render(dt) {
    g.save();
    g.scale(dpr, dpr);

    const Wpx = logicalPxWidth;
    const Hpx = logicalPxHeight;

    // Rink matte surface
    g.fillStyle = '#0d1116';
    g.fillRect(0, 0, Wpx, Hpx);

    if (flashAlpha > 0.005) {
      g.fillStyle = flashColor;
      g.globalAlpha = flashAlpha;
      g.fillRect(0, 0, Wpx, Hpx);
      g.globalAlpha = 1;
      flashAlpha = Math.max(0, flashAlpha - dt * 1.4);
    }

    // Markings: Center line, center circle, goal creases
    g.strokeStyle = 'rgba(240, 236, 228, 0.09)';
    g.lineWidth = 2;

    g.beginPath();
    g.setLineDash([7, 7]);
    g.moveTo(0, Hpx / 2);
    g.lineTo(Wpx, Hpx / 2);
    g.stroke();
    g.setLineDash([]);

    g.beginPath();
    g.arc(Wpx / 2, Hpx / 2, Wpx * 0.16, 0, Math.PI * 2);
    g.stroke();

    // Top & Bottom goal creases
    const topColor = flipView ? '#f58229' : '#1ad1be';
    const bottomColor = flipView ? '#1ad1be' : '#f58229';

    const goalLeftPx = (0.5 - GOAL_HALF) * Wpx;
    const goalWidthPx = GOAL_HALF * 2 * Wpx;

    // Top goal semicircle & slot
    g.strokeStyle = 'rgba(240, 236, 228, 0.11)';
    g.beginPath();
    g.arc(Wpx / 2, 0, GOAL_HALF * Wpx, 0, Math.PI);
    g.stroke();

    g.fillStyle = topColor;
    g.fillRect(goalLeftPx, 0, goalWidthPx, 5);

    // Bottom goal semicircle & slot
    g.beginPath();
    g.arc(Wpx / 2, Hpx, GOAL_HALF * Wpx, Math.PI, Math.PI * 2);
    g.stroke();

    g.fillStyle = bottomColor;
    g.fillRect(goalLeftPx, Hpx - 5, goalWidthPx, 5);

    // Puck trail
    if (state.phase === 'playing') {
      const pv = toView(state.puck.x, state.puck.y);
      trail.push({ x: pv.x, y: pv.y });
      if (trail.length > 9) trail.shift();
    }

    for (let i = 0; i < trail.length; i++) {
      const pt = trail[i];
      const ratio = (i + 1) / trail.length;
      g.beginPath();
      g.fillStyle = `rgba(244, 241, 234, ${ratio * 0.18})`;
      g.arc(pt.x, pt.y, PUCK_R * Wpx * ratio * 0.88, 0, Math.PI * 2);
      g.fill();
    }

    // Sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.life -= dt * 3.1;
      if (sp.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      const sv = toView(sp.x, sp.y);
      g.globalAlpha = sp.life;
      g.fillStyle = sp.color;
      g.beginPath();
      g.arc(sv.x, sv.y, 2.6, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }

    // Draw Mallets
    drawMallet(state.p1.x, state.p1.y, '#f58229', Wpx);
    drawMallet(state.p2.x, state.p2.y, '#1ad1be', Wpx);

    // Draw Puck
    const puckPos = toView(state.puck.x, state.puck.y);
    const puckRpx = PUCK_R * Wpx;

    g.beginPath();
    g.fillStyle = 'rgba(0, 0, 0, 0.45)';
    g.arc(puckPos.x, puckPos.y + 3, puckRpx, 0, Math.PI * 2);
    g.fill();

    g.beginPath();
    g.fillStyle = '#f4f1ea';
    g.arc(puckPos.x, puckPos.y, puckRpx, 0, Math.PI * 2);
    g.fill();

    g.beginPath();
    g.strokeStyle = 'rgba(18, 22, 27, 0.28)';
    g.lineWidth = 2;
    g.arc(puckPos.x, puckPos.y, puckRpx * 0.62, 0, Math.PI * 2);
    g.stroke();

    // Countdown center badge
    if (state.phase === 'countdown') {
      const countNum = Math.max(1, Math.ceil(state.countdown));
      g.fillStyle = 'rgba(13, 17, 22, 0.78)';
      g.beginPath();
      g.arc(Wpx / 2, Hpx / 2, 30, 0, Math.PI * 2);
      g.fill();

      g.fillStyle = '#f4f1ea';
      g.font = '700 24px "Space Grotesk", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(countNum), Wpx / 2, Hpx / 2 + 1);
    }

    g.restore();
  }

  function drawMallet(cx, cy, color, Wpx) {
    const pos = toView(cx, cy);
    const r = MALLET_R * Wpx;

    // Drop shadow
    g.beginPath();
    g.fillStyle = 'rgba(0, 0, 0, 0.5)';
    g.arc(pos.x, pos.y + 4, r, 0, Math.PI * 2);
    g.fill();

    // Outer striker body
    g.beginPath();
    g.fillStyle = color;
    g.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    g.fill();

    // Recessed handle grip
    g.beginPath();
    g.fillStyle = '#171d24';
    g.arc(pos.x, pos.y, r * 0.56, 0, Math.PI * 2);
    g.fill();

    // Center cap
    g.beginPath();
    g.fillStyle = color;
    g.arc(pos.x, pos.y, r * 0.24, 0, Math.PI * 2);
    g.fill();
  }

  // Main animation loop
  let rafId = null;
  let prevTime = performance.now();

  function frame(now) {
    const dt = Math.min(0.04, Math.max(0.001, (now - prevTime) / 1000));
    prevTime = now;

    updateKeyboardTargets(dt);

    if (mode !== 'online' || isHost) {
      stepAuthoritativePhysics(dt);

      if (mode === 'online' && isHost && now - lastSnapSentAt >= 20) {
        lastSnapSentAt = now;
        sendNet({
          kind: 'SNAP',
          p1x: +state.p1.x.toFixed(4),
          p1y: +state.p1.y.toFixed(4),
          p2x: +state.p2.x.toFixed(4),
          p2y: +state.p2.y.toFixed(4),
          px: +state.puck.x.toFixed(4),
          py: +state.puck.y.toFixed(4),
          pvx: +state.puck.vx.toFixed(3),
          pvy: +state.puck.vy.toFixed(3),
          ph: state.phase,
          cd: +state.countdown.toFixed(2)
        });
      }
    } else {
      stepGuestInterpolation(dt);
    }

    render(dt);
    rafId = requestAnimationFrame(frame);
  }

  function restart(fromRemote = false) {
    state.score1 = 0;
    state.score2 = 0;
    state.phase = 'countdown';
    state.countdown = 2.0;
    state.winner = 0;
    state.serveTo = 0;
    lastCountdownBeep = 3;
    resultBox.classList.add('hidden');
    resetPositions(0);
    refreshScoreText();
    statusEl.textContent = `A ${WIN_SCORE} goles`;

    if (mode === 'online' && !fromRemote) {
      sendNet({ kind: 'RESTART' });
    }
  }

  btnRematch.addEventListener('click', () => {
    sfx.click();
    restart(false);
  });

  btnHub.addEventListener('click', () => {
    sfx.click();
    onRequestHub?.();
  });

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', resizeCanvas);

  refreshHudLabels();
  resizeCanvas();
  resetPositions(0);
  rafId = requestAnimationFrame(frame);

  return {
    onNetMessage(msg) {
      if (!msg) return;
      if (msg.kind === 'INPUT' && isHost) {
        state.p2.tx = clamp(Number(msg.tx) || 0.5, MALLET_R, 1 - MALLET_R);
        state.p2.ty = clamp(Number(msg.ty) || 0.22, MALLET_R, H / 2 - MALLET_R * 0.95);
        return;
      }

      if (msg.kind === 'SNAP' && !isHost) {
        netTarget.p1x = msg.p1x;
        netTarget.p1y = msg.p1y;
        netTarget.p2x = msg.p2x;
        netTarget.p2y = msg.p2y;
        netTarget.px = msg.px;
        netTarget.py = msg.py;
        netTarget.pvx = msg.pvx;
        netTarget.pvy = msg.pvy;
        if (!netTarget.hasSnapshot) {
          state.puck.x = msg.px;
          state.puck.y = msg.py;
          netTarget.hasSnapshot = true;
        }
        if (msg.ph === 'countdown') {
          const prevCeil = Math.ceil(state.countdown);
          state.phase = 'countdown';
          state.countdown = msg.cd;
          const nextCeil = Math.ceil(state.countdown);
          if (nextCeil < prevCeil && nextCeil >= 1) sfx.countdownPip(false);
          statusEl.textContent = nextCeil > 0 ? `Saque en ${nextCeil}…` : '¡Ya!';
        } else if (msg.ph === 'playing' && state.phase !== 'playing') {
          state.phase = 'playing';
          statusEl.textContent = `A ${WIN_SCORE} goles`;
          sfx.countdownPip(true);
        }
        return;
      }

      if (msg.kind === 'FX_HIT' && !isHost) {
        sfx.puckHit(msg.s || 0.8);
        spawnSparks(msg.x, msg.y, msg.c || '#f58229', 9);
        return;
      }

      if (msg.kind === 'GOAL_EVENT' && !isHost) {
        state.score1 = msg.score1;
        state.score2 = msg.score2;
        state.phase = msg.phase;
        state.winner = msg.winner;
        state.serveTo = msg.serveTo;
        refreshScoreText();

        const scoredByMe = msg.scorer === localPlayerIndex;
        sfx.goal(scoredByMe);
        flashColor = msg.scorer === 1 ? '#f58229' : '#1ad1be';
        flashAlpha = 0.34;
        spawnSparks(0.5, msg.scorer === 1 ? 0.05 : H - 0.05, flashColor, 20);
        trail.length = 0;

        if (state.phase === 'finished') {
          showResultBanner();
          onMatchWin?.(state.winner);
        } else {
          state.countdown = 1.6;
        }
        return;
      }

      if (msg.kind === 'RESTART') {
        restart(true);
      }
    },

    updatePlayers(nextPlayers) {
      players = { ...nextPlayers };
      refreshHudLabels();
    },

    restart,

    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resizeCanvas);
    }
  };
}
