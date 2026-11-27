import { sfx } from '../audio/sfx.js';

const W = 920;
const H = 460;
const MARGIN = 36;
const BALL_R = 11.2;
const POCKET_R = 21.5;

const POCKETS = [
  { x: MARGIN + 5, y: MARGIN + 5, r: 22.5 },
  { x: W / 2, y: MARGIN + 1, r: 20.5 },
  { x: W - MARGIN - 5, y: MARGIN + 5, r: 22.5 },
  { x: MARGIN + 5, y: H - MARGIN - 5, r: 22.5 },
  { x: W / 2, y: H - MARGIN - 1, r: 20.5 },
  { x: W - MARGIN - 5, y: H - MARGIN - 5, r: 22.5 }
];

const BALL_COLORS = {
  0: '#f4f1ea',
  1: '#f5b623',
  2: '#2563eb',
  3: '#ef4444',
  4: '#7c3aed',
  5: '#f58229',
  6: '#16a34a',
  7: '#991b1b',
  8: '#11161d',
  9: '#f5b623',
  10: '#2563eb',
  11: '#ef4444',
  12: '#7c3aed',
  13: '#f58229',
  14: '#16a34a',
  15: '#991b1b'
};

function ballGroupOf(id) {
  if (id === 0) return 'cue';
  if (id === 8) return 'eight';
  return id >= 1 && id <= 7 ? 'solids' : 'stripes';
}

function groupLabel(group) {
  if (group === 'solids') return 'Lisas (1–7)';
  if (group === 'stripes') return 'Rayadas (9–15)';
  return 'Mesa abierta';
}

function createInitialBalls() {
  const balls = [{ id: 0, x: 245, y: H / 2, vx: 0, vy: 0, pocketed: false }];
  // Standard 15-ball triangle rack at x = 650 (solids 1..7, stripes 9..15, ball 8 in center, opposite corners)
  const cornerSolid = 7;
  const cornerStripe = 15;
  const remSolids = [1, 2, 3, 4, 5, 6];
  const remStripes = [9, 10, 11, 12, 13, 14];
  const order = new Array(15);
  order[4] = 8;
  order[10] = cornerSolid;
  order[14] = cornerStripe;

  let pickSolid = true;
  for (let i = 0; i < 15; i++) {
    if (order[i] !== undefined) continue;
    if ((pickSolid && remSolids.length > 0) || remStripes.length === 0) {
      order[i] = remSolids.shift();
    } else {
      order[i] = remStripes.shift();
    }
    pickSolid = !pickSolid;
  }

  const spacing = BALL_R * 2.06;
  const rowDx = spacing * Math.cos(Math.PI / 6);
  let idx = 0;
  for (let row = 0; row < 5; row++) {
    const startY = H / 2 - (row * spacing) / 2;
    const x = 650 + row * rowDx;
    for (let col = 0; col <= row; col++) {
      balls.push({
        id: order[idx++],
        x,
        y: startY + col * spacing,
        vx: 0,
        vy: 0,
        pocketed: false
      });
    }
  }
  return balls;
}

function clampCuePosition(x, y, balls) {
  let cx = Math.max(MARGIN + BALL_R + 2, Math.min(W - MARGIN - BALL_R - 2, x));
  let cy = Math.max(MARGIN + BALL_R + 2, Math.min(H - MARGIN - BALL_R - 2, y));
  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const dx = cx - b.x;
    const dy = cy - b.y;
    const dist = Math.hypot(dx, dy);
    const minDist = BALL_R * 2 + 2;
    if (dist < minDist) {
      const ang = dist > 0.01 ? Math.atan2(dy, dx) : 0;
      cx = Math.max(MARGIN + BALL_R + 2, Math.min(W - MARGIN - BALL_R - 2, b.x + Math.cos(ang) * minDist));
      cy = Math.max(MARGIN + BALL_R + 2, Math.min(H - MARGIN - BALL_R - 2, b.y + Math.sin(ang) * minDist));
    }
  }
  return { x: cx, y: cy };
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const lenSq = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
  return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
}

export function createEightBallGame(ctx) {
  const {
    mountEl,
    mode = 'ai',
    isHost = true,
    isSpectator = false,
    localPlayerIndex = 1,
    players = { 1: { name: 'Jugador 1' }, 2: { name: 'Jugador 2' } },
    sendNet,
    onMatchWin
  } = ctx;

  let currentPlayers = { ...players };
  let balls = createInitialBalls();
  let turn = 1;
  let groups = { 1: null, 2: null }; // 'solids' | 'stripes' | null
  let ballInHand = true; // free opening placement in kitchen/anywhere
  let isBreakShot = true;
  let phase = 'aiming'; // 'aiming' | 'moving' | 'finished'
  let winner = null;
  let winReason = '';
  let statusBanner = 'Saque inicial: apunta y elige potencia';

  let aimAngle = 0;
  let shotPower = 0.72;
  let spinX = 0; // -1..1
  let spinY = 0; // -1..1 (positive = top follow, negative = draw)
  let draggingCueBall = false;
  let pointerAimActive = false;

  // Per-shot tracking
  let activeShooter = 1;
  let firstHitBallId = null;
  let hitCushionAfterImpact = false;
  let pocketedThisTurn = [];
  let cuePocketedThisTurn = false;
  let activeSpinX = 0;
  let activeSpinY = 0;
  let spinImpulseApplied = false;

  let portraitRotate = false;
  let rafId = null;
  let aiTimer = null;
  let lastFrameTs = 0;
  let resizeObserver = null;
  let destroyed = false;

  const wrap = document.createElement('div');
  wrap.className = 'hockey-wrap';
  wrap.innerHTML = `
    <div class="match-hud" style="max-width:680px;">
      <div class="hud-side" data-hud-p="1">
        <span class="hud-swatch p1"></span>
        <div class="hud-player-info">
          <span class="hud-player-name" data-p1-name></span>
          <span class="hud-player-role" data-p1-group>Mesa abierta</span>
        </div>
      </div>
      <div class="hud-center">
        <span class="hud-score-big" data-eb-turn>J1</span>
        <span class="hud-substatus" data-eb-status>Saque inicial</span>
      </div>
      <div class="hud-side right" data-hud-p="2">
        <div class="hud-player-info">
          <span class="hud-player-name" data-p2-name></span>
          <span class="hud-player-role" data-p2-group>Mesa abierta</span>
        </div>
        <span class="hud-swatch p2"></span>
      </div>
    </div>

    <div class="eb-rack-strip" data-eb-rack></div>

    <div class="hockey-stage-box" data-eb-stage>
      <div class="hockey-arena-frame" style="padding:7px;border-radius:18px;">
        <canvas class="hockey-canvas" style="cursor:crosshair;"></canvas>
      </div>
    </div>

    <div class="game-control-dock" data-eb-controls>
      <div class="eb-spin-wrap" title="Efecto de bola blanca (toca para ajustar)">
        <div class="eb-spin-pad" data-eb-spin-pad>
          <span class="eb-spin-dot" data-eb-spin-dot></span>
        </div>
        <button type="button" class="btn btn-subtle btn-compact" data-eb-spin-reset style="font-size:0.7rem;padding:4px 7px;">Centro</button>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:150px;">
        <button type="button" class="btn btn-subtle btn-compact" data-eb-nudge="-0.035" title="Girar izquierda">◀</button>
        <input type="range" min="15" max="100" value="72" class="eb-power-slider" data-eb-power aria-label="Potencia de tiro" />
        <button type="button" class="btn btn-subtle btn-compact" data-eb-nudge="0.035" title="Girar derecha">▶</button>
      </div>
      <button type="button" class="btn btn-primary btn-compact" data-eb-shoot style="min-width:96px;">🎱 Tirar</button>
    </div>

    <div class="board-result-banner hidden" data-eb-result></div>
  `;

  mountEl.innerHTML = '';
  mountEl.appendChild(wrap);

  const stageBox = wrap.querySelector('[data-eb-stage]');
  const arenaFrame = wrap.querySelector('.hockey-arena-frame');
  const canvas = wrap.querySelector('canvas');
  const g = canvas.getContext('2d');

  const p1NameEl = wrap.querySelector('[data-p1-name]');
  const p2NameEl = wrap.querySelector('[data-p2-name]');
  const p1GroupEl = wrap.querySelector('[data-p1-group]');
  const p2GroupEl = wrap.querySelector('[data-p2-group]');
  const side1El = wrap.querySelector('[data-hud-p="1"]');
  const side2El = wrap.querySelector('[data-hud-p="2"]');
  const turnEl = wrap.querySelector('[data-eb-turn]');
  const statusEl = wrap.querySelector('[data-eb-status]');
  const rackEl = wrap.querySelector('[data-eb-rack]');
  const powerSlider = wrap.querySelector('[data-eb-power]');
  const shootBtn = wrap.querySelector('[data-eb-shoot]');
  const spinPad = wrap.querySelector('[data-eb-spin-pad]');
  const spinDot = wrap.querySelector('[data-eb-spin-dot]');
  const spinResetBtn = wrap.querySelector('[data-eb-spin-reset]');
  const controlsDock = wrap.querySelector('[data-eb-controls]');
  const resultEl = wrap.querySelector('[data-eb-result]');

  function canLocalAct() {
    if (destroyed || isSpectator || phase !== 'aiming') return false;
    if (mode === 'local') return true;
    if (mode === 'ai') return turn === 1;
    return turn === localPlayerIndex;
  }

  function updateSpinUi() {
    const px = 50 + spinX * 36;
    const py = 50 - spinY * 36;
    spinDot.style.left = `${px}%`;
    spinDot.style.top = `${py}%`;
  }

  function renderRemainingRack() {
    const p1Balls = balls.filter((b) => !b.pocketed && b.id >= 1 && b.id <= 7);
    const p2Balls = balls.filter((b) => !b.pocketed && b.id >= 9 && b.id <= 15);
    const b8 = balls.find((b) => b.id === 8 && !b.pocketed);
    const chip = (b) =>
      `<span class="eb-mini-ball ${b.id > 8 ? 'stripe' : ''}" style="--bcol:${BALL_COLORS[b.id]};">${b.id}</span>`;
    rackEl.innerHTML = `
      <span class="eb-rack-group">Lisas: ${p1Balls.map(chip).join('') || '✓'}</span>
      <span class="eb-rack-group">${b8 ? chip(b8) : '8✕'}</span>
      <span class="eb-rack-group">Rayadas: ${p2Balls.map(chip).join('') || '✓'}</span>
    `;
  }

  function updateHud() {
    p1NameEl.textContent = currentPlayers[1]?.name || 'Jugador 1';
    p2NameEl.textContent = currentPlayers[2]?.name || (mode === 'ai' ? 'CPU Taco' : 'Jugador 2');
    p1GroupEl.textContent = groups[1] ? groupLabel(groups[1]) : 'Mesa abierta';
    p2GroupEl.textContent = groups[2] ? groupLabel(groups[2]) : 'Mesa abierta';

    side1El.classList.toggle('active-turn', phase !== 'finished' && turn === 1);
    side2El.classList.toggle('active-turn', phase !== 'finished' && turn === 2);

    if (phase === 'finished') {
      turnEl.textContent = winner ? `GANA J${winner}` : 'FIN';
      statusEl.textContent = winReason;
    } else if (phase === 'moving') {
      turnEl.textContent = 'EN CURSO';
      statusEl.textContent = 'Bolas en movimiento…';
    } else {
      const mine = canLocalAct();
      turnEl.textContent = mode === 'online' ? (mine ? 'TU TIRO' : 'ESPERA') : mode === 'ai' ? (turn === 1 ? 'TU TIRO' : 'IA…') : `TIRO J${turn}`;
      statusEl.textContent = statusBanner;
    }

    const active = canLocalAct();
    shootBtn.disabled = !active;
    powerSlider.disabled = !active;
    controlsDock.style.opacity = active ? '1' : '0.6';

    renderRemainingRack();
    if (phase === 'finished') {
      const winName = currentPlayers[winner]?.name || `Jugador ${winner}`;
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = `
        <strong>🏆 ¡Victoria de ${winName}!</strong>
        <span>${winReason}</span>
        ${!isSpectator ? '<button type="button" class="btn btn-primary btn-compact" data-eb-rematch>Revancha</button>' : ''}
      `;
      resultEl.querySelector('[data-eb-rematch]')?.addEventListener('click', () => restart(false));
    } else {
      resultEl.classList.add('hidden');
    }
  }

  function fitCanvas() {
    const rect = stageBox.getBoundingClientRect();
    const bw = Math.max(240, rect.width - 18);
    const bh = Math.max(180, rect.height - 16);
    portraitRotate = bh > bw * 1.08;

    const logicalW = portraitRotate ? H : W;
    const logicalH = portraitRotate ? W : H;
    const scale = Math.min(bw / logicalW, bh / logicalH);
    const cssW = Math.floor(logicalW * scale);
    const cssH = Math.floor(logicalH * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    arenaFrame.style.width = `${cssW + 16}px`;
    draw();
  }

  function clientToTableCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / (rect.width || 1);
    const ny = (clientY - rect.top) / (rect.height || 1);
    if (!portraitRotate) {
      return { x: nx * W, y: ny * H };
    }
    // Canvas visual rotated -90 deg (width = H, height = W)
    return {
      x: (1 - ny) * W,
      y: nx * H
    };
  }

  function executeShot(shot) {
    const cue = balls[0];
    if (!cue || cue.pocketed) return;
    if (typeof shot.cueX === 'number' && typeof shot.cueY === 'number') {
      const clamped = clampCuePosition(shot.cueX, shot.cueY, balls);
      cue.x = clamped.x;
      cue.y = clamped.y;
    }

    const power = Math.max(0.15, Math.min(1, Number(shot.power) || 0.65));
    const speed = 5.5 + power * 18.5;
    aimAngle = Number(shot.angle) || 0;
    cue.vx = Math.cos(aimAngle) * speed;
    cue.vy = Math.sin(aimAngle) * speed;

    activeShooter = turn;
    firstHitBallId = null;
    hitCushionAfterImpact = false;
    pocketedThisTurn = [];
    cuePocketedThisTurn = false;
    activeSpinX = Math.max(-1, Math.min(1, Number(shot.spinX) || 0));
    activeSpinY = Math.max(-1, Math.min(1, Number(shot.spinY) || 0));
    spinImpulseApplied = false;

    ballInHand = false;
    phase = 'moving';
    sfx.cueStrike(power);
    updateHud();
  }

  function settleTurnFromSimulation() {
    if (phase !== 'moving') return;

    const myGroup = groups[activeShooter];
    const remainingBefore = myGroup
      ? balls.filter((b) => b.id !== 8 && b.id !== 0 && !b.pocketed && ballGroupOf(b.id) === myGroup).length +
        pocketedThisTurn.filter((id) => ballGroupOf(id) === myGroup).length
      : 7;

    const pottedEight = pocketedThisTurn.includes(8);
    let foulReason = '';
    if (cuePocketedThisTurn) foulReason = 'Falta: bola blanca embocada';
    else if (firstHitBallId === null) foulReason = 'Falta: no golpeaste ninguna bola';
    else if (!isBreakShot && myGroup) {
      const hitGroup = ballGroupOf(firstHitBallId);
      if (firstHitBallId === 8 && remainingBefore > 0) {
        foulReason = 'Falta: tocaste la bola 8 antes de tiempo';
      } else if (firstHitBallId !== 8 && hitGroup !== myGroup) {
        foulReason = 'Falta: tocaste primero una bola rival';
      }
    } else if (!isBreakShot && !myGroup && firstHitBallId === 8) {
      foulReason = 'Falta: tocaste la 8 con mesa abierta';
    }
    if (!foulReason && pocketedThisTurn.length === 0 && !hitCushionAfterImpact) {
      foulReason = 'Falta: ninguna bola tocó banda ni cayó';
    }

    // Respot cue ball if scratched
    const cue = balls[0];
    if (cue.pocketed) {
      cue.pocketed = false;
      const safe = clampCuePosition(245, H / 2, balls);
      cue.x = safe.x;
      cue.y = safe.y;
    }

    const opp = activeShooter === 1 ? 2 : 1;

    if (pottedEight) {
      phase = 'finished';
      if (!foulReason && myGroup && remainingBefore === 0) {
        winner = activeShooter;
        winReason = 'Bola 8 embocada legalmente';
      } else {
        winner = opp;
        winReason = foulReason ? `Bola 8 con ${foulReason.toLowerCase()}` : 'Bola 8 embocada antes de tiempo';
      }
      if (winner === 1 || winner === 2) {
        if ((mode === 'online' && winner === localPlayerIndex) || (mode === 'ai' && winner === 1) || mode === 'local') {
          sfx.win();
        } else {
          sfx.lose();
        }
        onMatchWin?.(winner);
      }
      if (mode === 'online' && isHost) {
        sendNet?.({
          kind: 'TURN_SETTLED',
          balls: balls.map((b) => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed })),
          turn,
          groups,
          ballInHand,
          phase,
          winner,
          reason: winReason,
          statusBanner
        });
      }
      updateHud();
      return;
    }

    // Group assignment after break
    if (!isBreakShot && !groups[1] && !foulReason) {
      const firstLegal = pocketedThisTurn.find((id) => id !== 0 && id !== 8);
      if (firstLegal) {
        const gShooter = ballGroupOf(firstLegal);
        const gOpp = gShooter === 'solids' ? 'stripes' : 'solids';
        groups[activeShooter] = gShooter;
        groups[opp] = gOpp;
      }
    }

    isBreakShot = false;
    const myGroupAfter = groups[activeShooter];
    const pocketedOwn = pocketedThisTurn.some(
      (id) => id !== 0 && id !== 8 && (!myGroupAfter || ballGroupOf(id) === myGroupAfter)
    );

    if (foulReason) {
      turn = opp;
      ballInHand = true;
      statusBanner = `${foulReason} · Bola en mano`;
    } else if (pocketedOwn) {
      turn = activeShooter;
      ballInHand = false;
      statusBanner = `¡Buena! Continúa ${currentPlayers[turn]?.name || `J${turn}`}`;
    } else {
      turn = opp;
      ballInHand = false;
      statusBanner = `Turno de ${currentPlayers[turn]?.name || `J${turn}`}`;
    }

    phase = 'aiming';

    if (mode === 'online' && isHost) {
      sendNet?.({
        kind: 'TURN_SETTLED',
        balls: balls.map((b) => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed })),
        turn,
        groups,
        ballInHand,
        phase,
        winner,
        reason: winReason,
        statusBanner
      });
    }

    updateHud();
    maybeTriggerAi();
  }

  function stepPhysics(dtMs) {
    if (phase !== 'moving') return;
    const dtNorm = Math.min(2, dtMs / 16.6667);
    const subDt = dtNorm / 6;

    for (let s = 0; s < 6; s++) {
      // Advance balls & rail collisions
      for (const b of balls) {
        if (b.pocketed) continue;
        b.x += b.vx * subDt;
        b.y += b.vy * subDt;

        // Check pocket capture first
        let dropped = false;
        for (const p of POCKETS) {
          if (Math.hypot(b.x - p.x, b.y - p.y) < p.r) {
            b.pocketed = true;
            b.vx = 0;
            b.vy = 0;
            dropped = true;
            if (b.id === 0) cuePocketedThisTurn = true;
            else pocketedThisTurn.push(b.id);
            sfx.pocketDrop();
            break;
          }
        }
        if (dropped) continue;

        // Cushion bounds (skip near pocket mouths so balls glide cleanly into corner/side pockets)
        const nearPocketMouth = POCKETS.some((p) => Math.hypot(b.x - p.x, b.y - p.y) < p.r + 13);
        if (!nearPocketMouth) {
          let bounced = false;
          if (b.x - BALL_R < MARGIN) {
            b.x = MARGIN + BALL_R;
            b.vx = Math.abs(b.vx) * 0.81;
            if (b.id === 0) b.vy += activeSpinX * 1.4;
            bounced = true;
          } else if (b.x + BALL_R > W - MARGIN) {
            b.x = W - MARGIN - BALL_R;
            b.vx = -Math.abs(b.vx) * 0.81;
            if (b.id === 0) b.vy -= activeSpinX * 1.4;
            bounced = true;
          }

          if (b.y - BALL_R < MARGIN) {
            b.y = MARGIN + BALL_R;
            b.vy = Math.abs(b.vy) * 0.81;
            if (b.id === 0) b.vx -= activeSpinX * 1.4;
            bounced = true;
          } else if (b.y + BALL_R > H - MARGIN) {
            b.y = H - MARGIN - BALL_R;
            b.vy = -Math.abs(b.vy) * 0.81;
            if (b.id === 0) b.vx += activeSpinX * 1.4;
            bounced = true;
          }

          if (bounced) {
            if (firstHitBallId !== null) hitCushionAfterImpact = true;
            else if (b.id === 0) hitCushionAfterImpact = true;
            const spd = Math.hypot(b.vx, b.vy);
            if (spd > 1.2) sfx.wallHit(spd / 16);
          }
        }

        // Cloth friction
        const drag = Math.pow(0.985, subDt);
        b.vx *= drag;
        b.vy *= drag;
        if (Math.hypot(b.vx, b.vy) < 0.055) {
          b.vx = 0;
          b.vy = 0;
        }
      }

      // Ball-ball elastic collisions
      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.pocketed) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (b.pocketed) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const minDist = BALL_R * 2;
          if (dist > 0 && dist < minDist) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = (minDist - dist) * 0.51;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;

            const rvx = b.vx - a.vx;
            const rvy = b.vy - a.vy;
            const velAlongNormal = rvx * nx + rvy * ny;
            if (velAlongNormal < 0) {
              const restitution = 0.94;
              const jImp = (-(1 + restitution) * velAlongNormal) / 2;
              a.vx -= jImp * nx;
              a.vy -= jImp * ny;
              b.vx += jImp * nx;
              b.vy += jImp * ny;

              if ((a.id === 0 || b.id === 0) && firstHitBallId === null) {
                firstHitBallId = a.id === 0 ? b.id : a.id;
              }
              if ((a.id === 0 || b.id === 0) && !spinImpulseApplied) {
                spinImpulseApplied = true;
                const cueRef = a.id === 0 ? a : b;
                const dirSign = a.id === 0 ? 1 : -1;
                const impForce = Math.abs(jImp);
                cueRef.vx += dirSign * nx * activeSpinY * impForce * 0.42;
                cueRef.vy += dirSign * ny * activeSpinY * impForce * 0.42;
                activeSpinX *= 0.45;
              }

              const intensity = Math.min(1.2, Math.abs(velAlongNormal) / 14);
              if (intensity > 0.12) sfx.ballClack(intensity);
            }
          }
        }
      }
    }

    const anyMoving = balls.some((b) => !b.pocketed && (Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05));
    if (!anyMoving) {
      for (const b of balls) {
        b.vx = 0;
        b.vy = 0;
      }
      if (mode !== 'online' || isHost) {
        settleTurnFromSimulation();
      } else {
        // Guest waits slightly for TURN_SETTLED from host, or settles locally after fallback
        settleTurnFromSimulation();
      }
    }
  }

  function maybeTriggerAi() {
    if (aiTimer) clearTimeout(aiTimer);
    if (destroyed || mode !== 'ai' || turn !== 2 || phase !== 'aiming') return;

    aiTimer = setTimeout(() => {
      if (destroyed || phase !== 'aiming' || turn !== 2) return;
      const cue = balls[0];
      const aiGroup = groups[2];
      let targets = balls.filter((b) => {
        if (b.pocketed || b.id === 0) return false;
        if (!aiGroup) return b.id !== 8;
        return ballGroupOf(b.id) === aiGroup;
      });
      if (targets.length === 0) {
        targets = balls.filter((b) => b.id === 8 && !b.pocketed);
      }
      if (targets.length === 0) return;

      let bestShot = null;
      let bestScore = -Infinity;

      for (const t of targets) {
        for (const p of POCKETS) {
          const toPx = p.x - t.x;
          const toPy = p.y - t.y;
          const distToPocket = Math.hypot(toPx, toPy) || 1;
          const ghostX = t.x - (toPx / distToPocket) * (BALL_R * 2);
          const ghostY = t.y - (toPy / distToPocket) * (BALL_R * 2);
          if (
            ghostX < MARGIN + BALL_R ||
            ghostX > W - MARGIN - BALL_R ||
            ghostY < MARGIN + BALL_R ||
            ghostY > H - MARGIN - BALL_R
          ) {
            continue;
          }

          if (ballInHand) {
            const candidateCue = clampCuePosition(
              ghostX - (toPx / distToPocket) * 75,
              ghostY - (toPy / distToPocket) * 75,
              balls
            );
            const ang = Math.atan2(ghostY - candidateCue.y, ghostX - candidateCue.x);
            const obstructed = balls.some(
              (o) =>
                !o.pocketed &&
                o.id !== 0 &&
                o.id !== t.id &&
                pointToSegmentDist(o.x, o.y, candidateCue.x, candidateCue.y, ghostX, ghostY) < BALL_R * 2
            );
            if (!obstructed) {
              const sc = 300 - distToPocket * 0.4;
              if (sc > bestScore) {
                bestScore = sc;
                bestShot = { angle: ang, power: 0.58, spinX: 0, spinY: 0, cueX: candidateCue.x, cueY: candidateCue.y };
              }
            }
            continue;
          }

          const toGx = ghostX - cue.x;
          const toGy = ghostY - cue.y;
          const distCueToGhost = Math.hypot(toGx, toGy) || 1;
          const dot = (toGx / distCueToGhost) * (toPx / distToPocket) + (toGy / distCueToGhost) * (toPy / distToPocket);
          if (dot < 0.25) continue;

          const blockedA = balls.some(
            (o) =>
              !o.pocketed &&
              o.id !== 0 &&
              o.id !== t.id &&
              pointToSegmentDist(o.x, o.y, cue.x, cue.y, ghostX, ghostY) < BALL_R * 1.95
          );
          const blockedB = balls.some(
            (o) =>
              !o.pocketed &&
              o.id !== 0 &&
              o.id !== t.id &&
              pointToSegmentDist(o.x, o.y, t.x, t.y, p.x, p.y) < BALL_R * 1.95
          );
          const sc = dot * 180 - distToPocket * 0.25 - distCueToGhost * 0.12 - (blockedA || blockedB ? 160 : 0);
          if (sc > bestScore) {
            bestScore = sc;
            const jitter = (Math.random() - 0.5) * 0.025;
            bestShot = {
              angle: Math.atan2(toGy, toGx) + jitter,
              power: Math.min(0.88, Math.max(0.45, 0.38 + (distCueToGhost + distToPocket) / 1100)),
              spinX: 0,
              spinY: 0.1
            };
          }
        }
      }

      if (!bestShot) {
        const t = targets[0];
        const cuePlace = ballInHand ? clampCuePosition(240, t.y, balls) : cue;
        bestShot = {
          angle: Math.atan2(t.y - cuePlace.y, t.x - cuePlace.x),
          power: 0.62,
          spinX: 0,
          spinY: 0,
          cueX: cuePlace.x,
          cueY: cuePlace.y
        };
      }
      executeShot(bestShot);
    }, 680);
  }

  function fireLocalShot() {
    if (!canLocalAct()) return;
    const cue = balls[0];
    const shot = {
      kind: 'SHOOT',
      angle: aimAngle,
      power: shotPower,
      spinX,
      spinY,
      cueX: cue.x,
      cueY: cue.y
    };
    if (mode === 'online') sendNet?.(shot);
    executeShot(shot);
  }

  function draw() {
    if (destroyed) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const dprScaleX = cw / (portraitRotate ? H : W);
    const dprScaleY = ch / (portraitRotate ? W : H);

    g.save();
    g.setTransform(dprScaleX, 0, 0, dprScaleY, 0, 0);
    if (portraitRotate) {
      g.translate(0, W);
      g.rotate(-Math.PI / 2);
    }

    // Outer wood rail
    g.fillStyle = '#3b2416';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 3;
    g.strokeRect(2, 2, W - 4, H - 4);

    // Emerald cloth
    const feltGrad = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.65);
    feltGrad.addColorStop(0, '#166b49');
    feltGrad.addColorStop(1, '#0d4730');
    g.fillStyle = feltGrad;
    g.fillRect(MARGIN, MARGIN, W - MARGIN * 2, H - MARGIN * 2);

    // Kitchen / baulk line & foot spot
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(245, MARGIN);
    g.lineTo(245, H - MARGIN);
    g.stroke();

    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.arc(650, H / 2, 3.5, 0, Math.PI * 2);
    g.fill();

    // Inner rail lip bevel
    g.strokeStyle = '#093322';
    g.lineWidth = 4;
    g.strokeRect(MARGIN, MARGIN, W - MARGIN * 2, H - MARGIN * 2);

    // Pockets
    for (const p of POCKETS) {
      g.fillStyle = '#090b0f';
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#b48a4e';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(p.x, p.y, p.r + 1.5, 0, Math.PI * 2);
      g.stroke();
    }

    // Aim guide line & ghost ball when aiming
    const cue = balls[0];
    if (phase === 'aiming' && cue && !cue.pocketed && canLocalAct()) {
      const dx = Math.cos(aimAngle);
      const dy = Math.sin(aimAngle);
      // Raycast nearest obstacle or cushion
      let bestDist = 800;
      let hitBall = null;
      // Wall ray
      if (dx > 0.001) bestDist = Math.min(bestDist, (W - MARGIN - BALL_R - cue.x) / dx);
      else if (dx < -0.001) bestDist = Math.min(bestDist, (MARGIN + BALL_R - cue.x) / dx);
      if (dy > 0.001) bestDist = Math.min(bestDist, (H - MARGIN - BALL_R - cue.y) / dy);
      else if (dy < -0.001) bestDist = Math.min(bestDist, (MARGIN + BALL_R - cue.y) / dy);

      for (const b of balls) {
        if (b.id === 0 || b.pocketed) continue;
        const ocx = b.x - cue.x;
        const ocy = b.y - cue.y;
        const proj = ocx * dx + ocy * dy;
        if (proj <= 0) continue;
        const perpSq = ocx * ocx + ocy * ocy - proj * proj;
        const rr = (BALL_R * 2) ** 2;
        if (perpSq < rr) {
          const hitD = proj - Math.sqrt(rr - perpSq);
          if (hitD > 0 && hitD < bestDist) {
            bestDist = hitD;
            hitBall = b;
          }
        }
      }

      const gx = cue.x + dx * bestDist;
      const gy = cue.y + dy * bestDist;

      g.save();
      g.setLineDash([6, 6]);
      g.strokeStyle = 'rgba(255,255,255,0.65)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cue.x, cue.y);
      g.lineTo(gx, gy);
      g.stroke();
      g.restore();

      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(gx, gy, BALL_R, 0, Math.PI * 2);
      g.stroke();

      if (hitBall) {
        const odx = hitBall.x - gx;
        const ody = hitBall.y - gy;
        const oLen = Math.hypot(odx, ody) || 1;
        g.strokeStyle = 'rgba(245, 182, 35, 0.78)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(hitBall.x, hitBall.y);
        g.lineTo(hitBall.x + (odx / oLen) * 58, hitBall.y + (ody / oLen) * 58);
        g.stroke();
      }

      // Cue stick drawn behind cue ball
      const pull = 16 + shotPower * 34;
      const stickStart = pull;
      const stickEnd = pull + 190;
      g.lineCap = 'round';
      g.strokeStyle = '#d6a364';
      g.lineWidth = 6.5;
      g.beginPath();
      g.moveTo(cue.x - dx * stickStart, cue.y - dy * stickStart);
      g.lineTo(cue.x - dx * stickEnd, cue.y - dy * stickEnd);
      g.stroke();
      g.strokeStyle = '#f4f1ea';
      g.lineWidth = 6.5;
      g.beginPath();
      g.moveTo(cue.x - dx * stickStart, cue.y - dy * stickStart);
      g.lineTo(cue.x - dx * (stickStart + 6), cue.y - dy * (stickStart + 6));
      g.stroke();
    }

    // Draw balls
    for (const b of balls) {
      if (b.pocketed) continue;
      // Drop shadow
      g.fillStyle = 'rgba(0,0,0,0.34)';
      g.beginPath();
      g.arc(b.x + 2, b.y + 2.5, BALL_R, 0, Math.PI * 2);
      g.fill();

      const col = BALL_COLORS[b.id] || '#fff';
      if (b.id > 8) {
        // Striped ball: white base + colored band
        g.fillStyle = '#f4f1ea';
        g.beginPath();
        g.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.beginPath();
        g.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        g.clip();
        g.fillStyle = col;
        g.fillRect(b.x - BALL_R, b.y - BALL_R * 0.56, BALL_R * 2, BALL_R * 1.12);
        g.restore();
      } else {
        g.fillStyle = col;
        g.beginPath();
        g.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        g.fill();
      }

      // Highlight gloss
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.beginPath();
      g.arc(b.x - BALL_R * 0.32, b.y - BALL_R * 0.34, BALL_R * 0.28, 0, Math.PI * 2);
      g.fill();

      if (b.id !== 0) {
        g.save();
        g.translate(b.x, b.y);
        if (portraitRotate) g.rotate(Math.PI / 2);
        g.fillStyle = '#f4f1ea';
        g.beginPath();
        g.arc(0, 0, BALL_R * 0.48, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#11161d';
        g.font = 'bold 7.5px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(b.id), 0, 0.5);
        g.restore();
      } else if (ballInHand && phase === 'aiming' && canLocalAct()) {
        g.strokeStyle = 'rgba(26, 209, 190, 0.9)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(b.x, b.y, BALL_R + 4, 0, Math.PI * 2);
        g.stroke();
      }
    }

    g.restore();
  }

  function loop(ts) {
    if (destroyed) return;
    if (!lastFrameTs) lastFrameTs = ts;
    const dt = ts - lastFrameTs;
    lastFrameTs = ts;
    stepPhysics(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // Pointer aim & ball-in-hand placement
  canvas.addEventListener('pointerdown', (e) => {
    if (!canLocalAct()) return;
    canvas.setPointerCapture?.(e.pointerId);
    const pt = clientToTableCoords(e.clientX, e.clientY);
    const cue = balls[0];
    if (ballInHand && Math.hypot(pt.x - cue.x, pt.y - cue.y) < BALL_R * 2.8) {
      draggingCueBall = true;
      return;
    }
    pointerAimActive = true;
    aimAngle = Math.atan2(pt.y - cue.y, pt.x - cue.x);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!canLocalAct()) return;
    const pt = clientToTableCoords(e.clientX, e.clientY);
    const cue = balls[0];
    if (draggingCueBall) {
      const clamped = clampCuePosition(pt.x, pt.y, balls);
      cue.x = clamped.x;
      cue.y = clamped.y;
      return;
    }
    if (pointerAimActive || e.pointerType === 'mouse') {
      aimAngle = Math.atan2(pt.y - cue.y, pt.x - cue.x);
    }
  });

  const endPointer = () => {
    draggingCueBall = false;
    pointerAimActive = false;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // Spin pad interaction
  let draggingSpin = false;
  const applySpinFromEvent = (e) => {
    const r = spinPad.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / (r.width || 1) - 0.5) * 2;
    const ny = (0.5 - (e.clientY - r.top) / (r.height || 1)) * 2;
    const len = Math.hypot(nx, ny);
    if (len > 1) {
      spinX = nx / len;
      spinY = ny / len;
    } else {
      spinX = nx;
      spinY = ny;
    }
    updateSpinUi();
  };
  spinPad.addEventListener('pointerdown', (e) => {
    if (!canLocalAct()) return;
    draggingSpin = true;
    spinPad.setPointerCapture?.(e.pointerId);
    applySpinFromEvent(e);
  });
  spinPad.addEventListener('pointermove', (e) => {
    if (draggingSpin) applySpinFromEvent(e);
  });
  spinPad.addEventListener('pointerup', () => { draggingSpin = false; });
  spinResetBtn.addEventListener('click', () => {
    spinX = 0;
    spinY = 0;
    updateSpinUi();
  });

  powerSlider.addEventListener('input', () => {
    shotPower = Number(powerSlider.value) / 100;
  });

  wrap.querySelectorAll('[data-eb-nudge]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!canLocalAct()) return;
      aimAngle += Number(btn.getAttribute('data-eb-nudge')) || 0;
    });
  });

  shootBtn.addEventListener('click', fireLocalShot);

  const onKeyDown = (e) => {
    if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (!canLocalAct()) return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      aimAngle -= 0.035;
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      aimAngle += 0.035;
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      fireLocalShot();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  resizeObserver = new ResizeObserver(fitCanvas);
  resizeObserver.observe(stageBox);
  fitCanvas();
  updateSpinUi();
  updateHud();
  rafId = requestAnimationFrame(loop);

  function restart(fromRemote = false) {
    if (aiTimer) clearTimeout(aiTimer);
    balls = createInitialBalls();
    turn = 1;
    groups = { 1: null, 2: null };
    ballInHand = true;
    isBreakShot = true;
    phase = 'aiming';
    winner = null;
    winReason = '';
    statusBanner = 'Saque inicial: apunta y elige potencia';
    spinX = 0;
    spinY = 0;
    updateSpinUi();
    updateHud();
    if (!fromRemote && mode === 'online') {
      sendNet?.({ kind: 'RESTART' });
    }
  }

  return {
    onNetMessage(msg) {
      if (!msg || destroyed) return;
      if (msg.kind === 'RESTART') {
        restart(true);
        return;
      }
      if (msg.kind === 'SHOOT') {
        executeShot(msg);
        return;
      }
      if (msg.kind === 'TURN_SETTLED' && Array.isArray(msg.balls)) {
        balls = msg.balls.map((b) => ({
          id: b.id,
          x: b.x,
          y: b.y,
          vx: 0,
          vy: 0,
          pocketed: Boolean(b.pocketed)
        }));
        turn = msg.turn || turn;
        groups = msg.groups || groups;
        ballInHand = Boolean(msg.ballInHand);
        phase = msg.phase || 'aiming';
        winner = msg.winner || null;
        winReason = msg.reason || '';
        statusBanner = msg.statusBanner || statusBanner;
        if (phase === 'finished' && (winner === 1 || winner === 2)) {
          if (winner === localPlayerIndex) sfx.win();
          else sfx.lose();
          onMatchWin?.(winner);
        }
        updateHud();
      }
    },
    updatePlayers(nextPlayers) {
      currentPlayers = { ...nextPlayers };
      updateHud();
    },
    getSnapshot() {
      return {
        balls: balls.map((b) => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed })),
        turn,
        groups,
        ballInHand,
        isBreakShot,
        phase,
        winner,
        winReason,
        statusBanner
      };
    },
    applySnapshot(snap) {
      if (!snap || !Array.isArray(snap.balls)) return;
      balls = snap.balls.map((b) => ({ id: b.id, x: b.x, y: b.y, vx: 0, vy: 0, pocketed: Boolean(b.pocketed) }));
      turn = snap.turn || 1;
      groups = snap.groups || { 1: null, 2: null };
      ballInHand = Boolean(snap.ballInHand);
      isBreakShot = Boolean(snap.isBreakShot);
      phase = snap.phase || 'aiming';
      winner = snap.winner || null;
      winReason = snap.winReason || '';
      statusBanner = snap.statusBanner || '';
      updateHud();
    },
    restart,
    destroy() {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (aiTimer) clearTimeout(aiTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      mountEl.innerHTML = '';
    }
  };
}
