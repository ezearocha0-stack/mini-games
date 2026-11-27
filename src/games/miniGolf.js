import { sfx } from '../audio/sfx.js';

const W = 840;
const H = 480;
const BALL_R = 10.5;
const CUP_R = 17.5;
const MAX_STROKES = 8;

const COURSES = [
  {
    name: 'Curva Esmeralda',
    par: 2,
    tee: { x: 115, y: 365 },
    cup: { x: 715, y: 120 },
    walls: [
      { x: 40, y: 40, w: 760, h: 18 },
      { x: 40, y: 422, w: 760, h: 18 },
      { x: 40, y: 40, w: 18, h: 400 },
      { x: 782, y: 40, w: 18, h: 400 },
      { x: 240, y: 40, w: 26, h: 245 },
      { x: 525, y: 205, w: 26, h: 235 }
    ],
    bumpers: [],
    sand: [],
    water: [],
    boosts: []
  },
  {
    name: 'Pinball Arcade',
    par: 3,
    tee: { x: 105, y: 240 },
    cup: { x: 735, y: 240 },
    walls: [
      { x: 40, y: 40, w: 760, h: 18 },
      { x: 40, y: 422, w: 760, h: 18 },
      { x: 40, y: 40, w: 18, h: 400 },
      { x: 782, y: 40, w: 18, h: 400 },
      { x: 410, y: 165, w: 24, h: 150 }
    ],
    bumpers: [
      { x: 265, y: 155, r: 22 },
      { x: 265, y: 325, r: 22 },
      { x: 565, y: 145, r: 24 },
      { x: 565, y: 335, r: 24 }
    ],
    sand: [{ x: 365, y: 68, w: 110, h: 65 }],
    water: [],
    boosts: []
  },
  {
    name: 'Puentes Gemelos',
    par: 3,
    tee: { x: 105, y: 240 },
    cup: { x: 735, y: 240 },
    walls: [
      { x: 40, y: 40, w: 760, h: 18 },
      { x: 40, y: 422, w: 760, h: 18 },
      { x: 40, y: 40, w: 18, h: 400 },
      { x: 782, y: 40, w: 18, h: 400 },
      { x: 610, y: 140, w: 22, h: 80 },
      { x: 610, y: 260, w: 22, h: 80 }
    ],
    bumpers: [],
    sand: [{ x: 495, y: 175, w: 85, h: 130 }],
    water: [
      { x: 290, y: 58, w: 130, h: 95 },
      { x: 290, y: 215, w: 130, h: 55 },
      { x: 290, y: 330, w: 130, h: 92 }
    ],
    boosts: []
  },
  {
    name: 'Cañón Turbo',
    par: 4,
    tee: { x: 105, y: 115 },
    cup: { x: 725, y: 365 },
    walls: [
      { x: 40, y: 40, w: 760, h: 18 },
      { x: 40, y: 422, w: 760, h: 18 },
      { x: 40, y: 40, w: 18, h: 400 },
      { x: 782, y: 40, w: 18, h: 400 },
      { x: 210, y: 185, w: 420, h: 24 },
      { x: 210, y: 285, w: 420, h: 24 }
    ],
    bumpers: [{ x: 715, y: 135, r: 22 }],
    sand: [
      { x: 350, y: 68, w: 140, h: 95 },
      { x: 350, y: 320, w: 150, h: 95 }
    ],
    water: [],
    boosts: [{ x: 650, y: 195, w: 105, h: 85, vx: 0, vy: 0.42 }]
  },
  {
    name: 'Molino Sincronizado',
    par: 3,
    tee: { x: 110, y: 240 },
    cup: { x: 730, y: 240 },
    walls: [
      { x: 40, y: 40, w: 760, h: 18 },
      { x: 40, y: 422, w: 760, h: 18 },
      { x: 40, y: 40, w: 18, h: 400 },
      { x: 782, y: 40, w: 18, h: 400 },
      { x: 410, y: 58, w: 22, h: 110 },
      { x: 410, y: 312, w: 22, h: 110 }
    ],
    movingWall: { x: 410, baseY: 205, amp: 58, w: 22, h: 72, speed: 0.0022 },
    bumpers: [
      { x: 560, y: 175, r: 19 },
      { x: 560, y: 305, r: 19 }
    ],
    sand: [],
    water: [{ x: 545, y: 58, w: 95, h: 60 }],
    boosts: [{ x: 200, y: 205, w: 95, h: 70, vx: 0.36, vy: 0 }]
  },
  {
    name: 'Gran Final',
    par: 4,
    tee: { x: 105, y: 365 },
    cup: { x: 725, y: 120 },
    walls: [
      { x: 40, y: 40, w: 760, h: 18 },
      { x: 40, y: 422, w: 760, h: 18 },
      { x: 40, y: 40, w: 18, h: 400 },
      { x: 782, y: 40, w: 18, h: 400 },
      { x: 485, y: 190, w: 24, h: 145 }
    ],
    bumpers: [
      { x: 645, y: 195, r: 20 },
      { x: 350, y: 240, r: 22 }
    ],
    sand: [{ x: 575, y: 62, w: 90, h: 85 }],
    water: [
      { x: 220, y: 58, w: 115, h: 125 },
      { x: 220, y: 310, w: 140, h: 112 }
    ],
    boosts: [{ x: 155, y: 210, w: 90, h: 70, vx: 0.38, vy: -0.18 }]
  }
];

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function createMiniGolfGame(ctx) {
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
  let holeIndex = 0;
  let scores = { 1: Array(COURSES.length).fill(0), 2: Array(COURSES.length).fill(0) };
  let holed = { 1: false, 2: false };
  let turn = 1;
  let phase = 'aiming'; // 'aiming' | 'moving' | 'hole_done' | 'finished'
  let winner = null;

  let balls = {
    1: { x: COURSES[0].tee.x, y: COURSES[0].tee.y, vx: 0, vy: 0, safeX: COURSES[0].tee.x, safeY: COURSES[0].tee.y },
    2: { x: COURSES[0].tee.x, y: COURSES[0].tee.y, vx: 0, vy: 0, safeX: COURSES[0].tee.x, safeY: COURSES[0].tee.y }
  };

  let aimAngle = -0.3;
  let shotPower = 0.62;
  let draggingAim = false;
  let dragCurrPt = null;
  let showCard = false;
  let elapsedClock = 0;
  let portraitRotate = false;
  let rafId = null;
  let aiTimer = null;
  let nextHoleTimer = null;
  let lastTs = 0;
  let resizeObserver = null;
  let destroyed = false;

  const wrap = document.createElement('div');
  wrap.className = 'hockey-wrap';
  wrap.innerHTML = `
    <div class="match-hud" style="max-width:680px;">
      <div class="hud-side" data-hud-p="1">
        <span class="hud-swatch p1"></span>
        <div class="hud-player-info">
          <span class="hud-player-name" data-mg-p1></span>
          <span class="hud-player-role" data-mg-p1-score>Total: 0</span>
        </div>
      </div>
      <div class="hud-center">
        <span class="hud-score-big" data-mg-hole>Hoyo 1/6</span>
        <span class="hud-substatus" data-mg-par>Par 2 · Golpes 0</span>
      </div>
      <div class="hud-side right" data-hud-p="2">
        <div class="hud-player-info">
          <span class="hud-player-name" data-mg-p2></span>
          <span class="hud-player-role" data-mg-p2-score>Total: 0</span>
        </div>
        <span class="hud-swatch p2"></span>
      </div>
    </div>

    <div class="hockey-stage-box" data-mg-stage>
      <div class="hockey-arena-frame" style="padding:7px;border-radius:18px;position:relative;">
        <canvas class="hockey-canvas" style="cursor:crosshair;"></canvas>
        <div class="mg-scorecard-overlay hidden" data-mg-card></div>
      </div>
    </div>

    <div class="game-control-dock" data-mg-controls>
      <button type="button" class="btn btn-subtle btn-compact" data-mg-card-btn>📋 Tarjeta</button>
      <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:140px;">
        <button type="button" class="btn btn-subtle btn-compact" data-mg-nudge="-0.06">◀</button>
        <input type="range" min="12" max="100" value="62" class="eb-power-slider" data-mg-power aria-label="Potencia de golpe" />
        <button type="button" class="btn btn-subtle btn-compact" data-mg-nudge="0.06">▶</button>
      </div>
      <button type="button" class="btn btn-primary btn-compact" data-mg-hit>⛳ Golpear</button>
    </div>

    <div class="board-result-banner hidden" data-mg-result></div>
  `;

  mountEl.innerHTML = '';
  mountEl.appendChild(wrap);

  const stageBox = wrap.querySelector('[data-mg-stage]');
  const arenaFrame = wrap.querySelector('.hockey-arena-frame');
  const canvas = wrap.querySelector('canvas');
  const g = canvas.getContext('2d');
  const cardEl = wrap.querySelector('[data-mg-card]');
  const cardBtn = wrap.querySelector('[data-mg-card-btn]');
  const p1NameEl = wrap.querySelector('[data-mg-p1]');
  const p2NameEl = wrap.querySelector('[data-mg-p2]');
  const p1ScoreEl = wrap.querySelector('[data-mg-p1-score]');
  const p2ScoreEl = wrap.querySelector('[data-mg-p2-score]');
  const side1El = wrap.querySelector('[data-hud-p="1"]');
  const side2El = wrap.querySelector('[data-hud-p="2"]');
  const holeEl = wrap.querySelector('[data-mg-hole]');
  const parEl = wrap.querySelector('[data-mg-par]');
  const powerSlider = wrap.querySelector('[data-mg-power]');
  const hitBtn = wrap.querySelector('[data-mg-hit]');
  const resultEl = wrap.querySelector('[data-mg-result]');

  const totalOf = (p) => scores[p].reduce((a, b) => a + b, 0);

  function canLocalAct() {
    if (destroyed || isSpectator || phase !== 'aiming') return false;
    if (mode === 'local') return true;
    if (mode === 'ai') return turn === 1;
    return turn === localPlayerIndex;
  }

  function formatParRel(total, completedHoles) {
    if (completedHoles === 0) return 'Par';
    const parSum = COURSES.slice(0, completedHoles).reduce((acc, c) => acc + c.par, 0);
    const diff = total - parSum;
    return diff === 0 ? 'E' : diff > 0 ? `+${diff}` : String(diff);
  }

  function renderScorecard() {
    cardEl.classList.toggle('hidden', !showCard);
    if (!showCard) return;
    cardEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <strong>Tarjeta de Puntuación · 6 Hoyos</strong>
        <button type="button" class="btn btn-subtle btn-compact" data-mg-close-card>Cerrar</button>
      </div>
      <table class="data-table" style="font-size:0.78rem;">
        <thead>
          <tr><th>Jugador</th>${COURSES.map((_, i) => `<th>H${i + 1}</th>`).join('')}<th>Total</th></tr>
        </thead>
        <tbody>
          <tr><td>Par</td>${COURSES.map((c) => `<td>${c.par}</td>`).join('')}<td>${COURSES.reduce((a, c) => a + c.par, 0)}</td></tr>
          <tr>
            <td>${currentPlayers[1]?.name || 'J1'}</td>
            ${scores[1].map((s, i) => `<td>${s || (i === holeIndex ? '·' : '-')}</td>`).join('')}
            <td><strong>${totalOf(1)}</strong></td>
          </tr>
          <tr>
            <td>${currentPlayers[2]?.name || (mode === 'ai' ? 'CPU' : 'J2')}</td>
            ${scores[2].map((s, i) => `<td>${s || (i === holeIndex ? '·' : '-')}</td>`).join('')}
            <td><strong>${totalOf(2)}</strong></td>
          </tr>
        </tbody>
      </table>
    `;
    cardEl.querySelector('[data-mg-close-card]')?.addEventListener('click', () => {
      showCard = false;
      renderScorecard();
    });
  }

  function updateHud() {
    const course = COURSES[holeIndex] || COURSES[0];
    p1NameEl.textContent = currentPlayers[1]?.name || 'Jugador 1';
    p2NameEl.textContent = currentPlayers[2]?.name || (mode === 'ai' ? 'CPU Golf' : 'Jugador 2');
    const comp = phase === 'finished' ? COURSES.length : holeIndex;
    p1ScoreEl.textContent = `Total: ${totalOf(1)} (${formatParRel(totalOf(1), comp)})`;
    p2ScoreEl.textContent = `Total: ${totalOf(2)} (${formatParRel(totalOf(2), comp)})`;

    side1El.classList.toggle('active-turn', phase === 'aiming' && turn === 1);
    side2El.classList.toggle('active-turn', phase === 'aiming' && turn === 2);

    holeEl.textContent = `Hoyo ${holeIndex + 1}/6`;
    parEl.textContent = `${course.name} · Par ${course.par} · Golpes: ${scores[turn][holeIndex]}`;

    const active = canLocalAct();
    hitBtn.disabled = !active;
    powerSlider.disabled = !active;
    renderScorecard();

    if (phase === 'finished') {
      const t1 = totalOf(1);
      const t2 = totalOf(2);
      const text =
        winner === 0
          ? `🤝 ¡Empate técnico con ${t1} golpes!`
          : `🏆 ¡Gana ${currentPlayers[winner]?.name || `Jugador ${winner}`} (${t1} vs ${t2} golpes)!`;
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = `
        <strong>${text}</strong>
        <span>Circuito de 6 hoyos completado</span>
        ${!isSpectator ? '<button type="button" class="btn btn-primary btn-compact" data-mg-rematch>Jugar otro circuito</button>' : ''}
      `;
      resultEl.querySelector('[data-mg-rematch]')?.addEventListener('click', () => restart(false));
    } else {
      resultEl.classList.add('hidden');
    }
  }

  function setupHole(idx) {
    holeIndex = idx;
    const c = COURSES[holeIndex];
    holed = { 1: false, 2: false };
    turn = idx % 2 === 0 ? 1 : 2;
    phase = 'aiming';
    balls = {
      1: { x: c.tee.x, y: c.tee.y - 7, vx: 0, vy: 0, safeX: c.tee.x, safeY: c.tee.y - 7 },
      2: { x: c.tee.x, y: c.tee.y + 7, vx: 0, vy: 0, safeX: c.tee.x, safeY: c.tee.y + 7 }
    };
    aimAngle = Math.atan2(c.cup.y - c.tee.y, c.cup.x - c.tee.x);
    updateHud();
    maybeTriggerAi();
  }

  function fitCanvas() {
    const rect = stageBox.getBoundingClientRect();
    const bw = Math.max(240, rect.width - 18);
    const bh = Math.max(180, rect.height - 16);
    portraitRotate = bh > bw * 1.08;

    const lw = portraitRotate ? H : W;
    const lh = portraitRotate ? W : H;
    const scale = Math.min(bw / lw, bh / lh);
    const cssW = Math.floor(lw * scale);
    const cssH = Math.floor(lh * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    arenaFrame.style.width = `${cssW + 16}px`;
    draw();
  }

  function clientToCourseCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / (rect.width || 1);
    const ny = (clientY - rect.top) / (rect.height || 1);
    if (!portraitRotate) return { x: nx * W, y: ny * H };
    return { x: (1 - ny) * W, y: nx * H };
  }

  function currentWallsForCourse(c) {
    if (!c.movingWall) return c.walls;
    const mw = c.movingWall;
    const curY = mw.baseY + Math.sin(elapsedClock * mw.speed) * mw.amp;
    return [...c.walls, { x: mw.x, y: curY, w: mw.w, h: mw.h, isMoving: true }];
  }

  function fireStroke(slot, angle, power) {
    if (phase !== 'aiming' || holed[slot]) return;
    const b = balls[slot];
    b.safeX = b.x;
    b.safeY = b.y;
    const clampedPow = Math.max(0.12, Math.min(1, power));
    const speed = 2.8 + clampedPow * 13.5;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    scores[slot][holeIndex] = Math.min(MAX_STROKES, (scores[slot][holeIndex] || 0) + 1);
    phase = 'moving';
    sfx.cueStrike(clampedPow);
    updateHud();
  }

  function afterStrokeSettled() {
    const opp = turn === 1 ? 2 : 1;
    if (!holed[turn] && scores[turn][holeIndex] >= MAX_STROKES) {
      holed[turn] = true; // Stroke cap reached cleanly
    }

    if (holed[1] && holed[2]) {
      phase = 'hole_done';
      if (holeIndex >= COURSES.length - 1) {
        phase = 'finished';
        const t1 = totalOf(1);
        const t2 = totalOf(2);
        winner = t1 < t2 ? 1 : t2 < t1 ? 2 : 0;
        if (winner === 1 || winner === 2) onMatchWin?.(winner);
        if (mode === 'online' && isHost) {
          sendNet?.({ kind: 'COURSE_COMPLETE', total1: t1, total2: t2, winner });
        }
        sfx.win();
        updateHud();
        return;
      }

      if (mode !== 'online' || isHost) {
        nextHoleTimer = setTimeout(() => {
          if (destroyed) return;
          const nextIdx = holeIndex + 1;
          if (mode === 'online') sendNet?.({ kind: 'HOLE_NEXT', nextHole: nextIdx });
          setupHole(nextIdx);
        }, 1250);
      }
      updateHud();
      return;
    }

    // Alternate to whichever player hasn't holed yet (prefer opponent if both active)
    if (!holed[opp]) turn = opp;
    else turn = turn;
    phase = 'aiming';
    const c = COURSES[holeIndex];
    const b = balls[turn];
    aimAngle = Math.atan2(c.cup.y - b.y, c.cup.x - b.x);
    updateHud();
    maybeTriggerAi();
  }

  function stepPhysics(dtMs) {
    if (destroyed) return;
    elapsedClock += dtMs;
    if (phase !== 'moving') return;

    const c = COURSES[holeIndex];
    const walls = currentWallsForCourse(c);
    const b = balls[turn];
    const dtNorm = Math.min(2, dtMs / 16.6667);
    const subDt = dtNorm / 5;

    for (let s = 0; s < 5; s++) {
      b.x += b.vx * subDt;
      b.y += b.vy * subDt;

      // Water hazard check
      if (c.water.some((wr) => pointInRect(b.x, b.y, wr))) {
        sfx.splash();
        b.x = b.safeX;
        b.y = b.safeY;
        b.vx = 0;
        b.vy = 0;
        if (scores[turn][holeIndex] < MAX_STROKES) scores[turn][holeIndex] += 1;
        break;
      }

      // Cup check
      const distCup = Math.hypot(b.x - c.cup.x, b.y - c.cup.y);
      const speed = Math.hypot(b.vx, b.vy);
      if (distCup < CUP_R - 2 && speed < 8.4) {
        b.x = c.cup.x;
        b.y = c.cup.y;
        b.vx = 0;
        b.vy = 0;
        holed[turn] = true;
        sfx.pocketDrop();
        break;
      }

      // Wall rectangle collisions
      for (const r of walls) {
        const cx = Math.max(r.x, Math.min(r.x + r.w, b.x));
        const cy = Math.max(r.y, Math.min(r.y + r.h, b.y));
        const dx = b.x - cx;
        const dy = b.y - cy;
        const d = Math.hypot(dx, dy);
        if (d < BALL_R) {
          if (d > 0.001) {
            const nx = dx / d;
            const ny = dy / d;
            b.x = cx + nx * BALL_R;
            b.y = cy + ny * BALL_R;
            const dot = b.vx * nx + b.vy * ny;
            if (dot < 0) {
              b.vx -= 1.8 * dot * nx;
              b.vy -= 1.8 * dot * ny;
              sfx.wallHit(0.5);
            }
          } else {
            b.vx = -b.vx * 0.8;
            b.vy = -b.vy * 0.8;
          }
        }
      }

      // Bumper circle collisions
      for (const bmp of c.bumpers) {
        const dx = b.x - bmp.x;
        const dy = b.y - bmp.y;
        const d = Math.hypot(dx, dy);
        const minD = bmp.r + BALL_R;
        if (d > 0 && d < minD) {
          const nx = dx / d;
          const ny = dy / d;
          b.x = bmp.x + nx * minD;
          b.y = bmp.y + ny * minD;
          const spd = Math.max(5.5, Math.hypot(b.vx, b.vy) * 1.12);
          b.vx = nx * spd;
          b.vy = ny * spd;
          sfx.ballClack(0.8);
        }
      }

      // Boost pads
      for (const bst of c.boosts) {
        if (pointInRect(b.x, b.y, bst)) {
          b.vx += bst.vx * subDt;
          b.vy += bst.vy * subDt;
        }
      }

      // Sand vs Grass friction
      const inSand = c.sand.some((sr) => pointInRect(b.x, b.y, sr));
      const friction = inSand ? Math.pow(0.905, subDt) : Math.pow(0.976, subDt);
      b.vx *= friction;
      b.vy *= friction;
    }

    if (holed[turn] || (Math.hypot(b.vx, b.vy) < 0.08 && Math.abs(b.vx) < 0.08)) {
      b.vx = 0;
      b.vy = 0;
      afterStrokeSettled();
    }
  }

  function maybeTriggerAi() {
    if (aiTimer) clearTimeout(aiTimer);
    if (destroyed || mode !== 'ai' || turn !== 2 || phase !== 'aiming') return;
    aiTimer = setTimeout(() => {
      if (destroyed || phase !== 'aiming' || turn !== 2) return;
      const c = COURSES[holeIndex];
      const b = balls[2];
      const dx = c.cup.x - b.x;
      const dy = c.cup.y - b.y;
      const dist = Math.hypot(dx, dy);
      const jitter = (Math.random() - 0.5) * 0.11;
      const ang = Math.atan2(dy, dx) + jitter;
      const pow = Math.max(0.28, Math.min(0.9, dist / 620));
      fireStroke(2, ang, pow);
    }, 640);
  }

  function draw() {
    if (destroyed) return;
    const c = COURSES[holeIndex];
    const walls = currentWallsForCourse(c);
    const sx = canvas.width / (portraitRotate ? H : W);
    const sy = canvas.height / (portraitRotate ? W : H);

    g.save();
    g.setTransform(sx, 0, 0, sy, 0, 0);
    if (portraitRotate) {
      g.translate(0, W);
      g.rotate(-Math.PI / 2);
    }

    // Grass base
    g.fillStyle = '#14583b';
    g.fillRect(0, 0, W, H);
    // Subtle turf stripes
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let x = 40; x < W - 40; x += 48) {
      g.fillRect(x, 40, 24, H - 80);
    }

    // Sand traps
    for (const s of c.sand) {
      g.fillStyle = '#d8be7d';
      g.beginPath();
      g.roundRect(s.x, s.y, s.w, s.h, 14);
      g.fill();
      g.strokeStyle = '#a88c4c';
      g.lineWidth = 2;
      g.stroke();
    }

    // Water hazards
    for (const wr of c.water) {
      g.fillStyle = '#0f5c8a';
      g.beginPath();
      g.roundRect(wr.x, wr.y, wr.w, wr.h, 12);
      g.fill();
      g.strokeStyle = '#38bdf8';
      g.lineWidth = 2;
      g.stroke();
    }

    // Boost pads
    for (const bs of c.boosts) {
      g.fillStyle = 'rgba(26, 209, 190, 0.24)';
      g.beginPath();
      g.roundRect(bs.x, bs.y, bs.w, bs.h, 10);
      g.fill();
      g.strokeStyle = '#1ad1be';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#1ad1be';
      g.font = 'bold 16px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('⚡❯❯', bs.x + bs.w / 2, bs.y + bs.h / 2);
    }

    // Tee mat
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(c.tee.x - 18, c.tee.y - 22, 36, 44);

    // Walls
    for (const r of walls) {
      g.fillStyle = r.isMoving ? '#f5b623' : '#2f2018';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = 1.5;
      g.strokeRect(r.x, r.y, r.w, r.h);
    }

    // Bumpers
    for (const bmp of c.bumpers) {
      g.fillStyle = '#f58229';
      g.beginPath();
      g.arc(bmp.x, bmp.y, bmp.r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff3e0';
      g.lineWidth = 3;
      g.stroke();
    }

    // Cup + Flag
    g.fillStyle = '#090b0f';
    g.beginPath();
    g.arc(c.cup.x, c.cup.y, CUP_R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f4f1ea';
    g.lineWidth = 2;
    g.stroke();

    // Flagpole when balls aren't inside
    g.strokeStyle = '#e2e8f0';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(c.cup.x, c.cup.y);
    g.lineTo(c.cup.x, c.cup.y - 28);
    g.stroke();
    g.fillStyle = '#ef4444';
    g.beginPath();
    g.moveTo(c.cup.x, c.cup.y - 28);
    g.lineTo(c.cup.x + 16, c.cup.y - 22);
    g.lineTo(c.cup.x, c.cup.y - 16);
    g.closePath();
    g.fill();

    // Aim trajectory when aiming
    const activeBall = balls[turn];
    if (phase === 'aiming' && canLocalAct() && !holed[turn]) {
      const len = 35 + shotPower * 125;
      g.save();
      g.setLineDash([5, 5]);
      g.strokeStyle = shotPower > 0.78 ? '#ef4444' : shotPower > 0.45 ? '#f5b623' : '#1ad1be';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(activeBall.x, activeBall.y);
      g.lineTo(activeBall.x + Math.cos(aimAngle) * len, activeBall.y + Math.sin(aimAngle) * len);
      g.stroke();
      g.restore();

      if (draggingAim && dragCurrPt) {
        g.strokeStyle = 'rgba(255,255,255,0.4)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(activeBall.x, activeBall.y);
        g.lineTo(dragCurrPt.x, dragCurrPt.y);
        g.stroke();
      }
    }

    // Draw both player balls
    for (const slot of [2, 1]) {
      if (holed[slot]) continue;
      const b = balls[slot];
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(b.x + 2, b.y + 2, BALL_R, 0, Math.PI * 2);
      g.fill();

      g.fillStyle = slot === 1 ? '#f58229' : '#1ad1be';
      g.beginPath();
      g.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = turn === slot && phase === 'aiming' ? '#ffffff' : 'rgba(0,0,0,0.35)';
      g.lineWidth = turn === slot && phase === 'aiming' ? 2.5 : 1.5;
      g.stroke();
    }

    g.restore();
  }

  function loop(ts) {
    if (destroyed) return;
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;
    stepPhysics(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // Slingshot drag aiming (pull back from anywhere near ball) + direct tap aim
  canvas.addEventListener('pointerdown', (e) => {
    if (!canLocalAct()) return;
    canvas.setPointerCapture?.(e.pointerId);
    const pt = clientToCourseCoords(e.clientX, e.clientY);
    const b = balls[turn];
    draggingAim = true;
    dragCurrPt = pt;
    const dx = b.x - pt.x;
    const dy = b.y - pt.y;
    if (Math.hypot(dx, dy) < 160) {
      // Slingshot feel near ball: pulling back aims forward
      aimAngle = Math.atan2(dy, dx);
      shotPower = Math.max(0.15, Math.min(1, Math.hypot(dx, dy) / 140));
    } else {
      aimAngle = Math.atan2(pt.y - b.y, pt.x - b.x);
    }
    powerSlider.value = String(Math.round(shotPower * 100));
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!draggingAim || !canLocalAct()) return;
    const pt = clientToCourseCoords(e.clientX, e.clientY);
    dragCurrPt = pt;
    const b = balls[turn];
    const dx = b.x - pt.x;
    const dy = b.y - pt.y;
    const d = Math.hypot(dx, dy);
    if (d > 14 && d < 185) {
      aimAngle = Math.atan2(dy, dx);
      shotPower = Math.max(0.15, Math.min(1, d / 145));
      powerSlider.value = String(Math.round(shotPower * 100));
    }
  });

  canvas.addEventListener('pointerup', () => {
    draggingAim = false;
    dragCurrPt = null;
  });

  const fireLocal = () => {
    if (!canLocalAct()) return;
    const pkt = { kind: 'STROKE', slot: turn, angle: aimAngle, power: shotPower };
    if (mode === 'online') sendNet?.(pkt);
    fireStroke(turn, aimAngle, shotPower);
  };

  hitBtn.addEventListener('click', fireLocal);
  powerSlider.addEventListener('input', () => {
    shotPower = Number(powerSlider.value) / 100;
  });
  wrap.querySelectorAll('[data-mg-nudge]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!canLocalAct()) return;
      aimAngle += Number(btn.getAttribute('data-mg-nudge')) || 0;
    });
  });
  cardBtn.addEventListener('click', () => {
    showCard = !showCard;
    renderScorecard();
  });

  const onKeyDown = (e) => {
    if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (!canLocalAct()) return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      aimAngle -= 0.05;
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      aimAngle += 0.05;
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      fireLocal();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  resizeObserver = new ResizeObserver(fitCanvas);
  resizeObserver.observe(stageBox);
  fitCanvas();
  setupHole(0);
  rafId = requestAnimationFrame(loop);

  function restart(fromRemote = false) {
    if (aiTimer) clearTimeout(aiTimer);
    if (nextHoleTimer) clearTimeout(nextHoleTimer);
    scores = { 1: Array(COURSES.length).fill(0), 2: Array(COURSES.length).fill(0) };
    winner = null;
    showCard = false;
    setupHole(0);
    if (!fromRemote && mode === 'online') sendNet?.({ kind: 'RESTART' });
  }

  return {
    onNetMessage(msg) {
      if (!msg || destroyed) return;
      if (msg.kind === 'RESTART') {
        restart(true);
        return;
      }
      if (msg.kind === 'STROKE') {
        fireStroke(msg.slot || turn, msg.angle, msg.power);
        return;
      }
      if (msg.kind === 'HOLE_NEXT' && typeof msg.nextHole === 'number') {
        setupHole(Math.max(0, Math.min(COURSES.length - 1, msg.nextHole)));
      }
    },
    updatePlayers(nextPlayers) {
      currentPlayers = { ...nextPlayers };
      updateHud();
    },
    getSnapshot() {
      return { holeIndex, scores, holed, turn, phase, winner, balls };
    },
    applySnapshot(snap) {
      if (!snap || !snap.scores) return;
      holeIndex = snap.holeIndex || 0;
      scores = snap.scores;
      holed = snap.holed || { 1: false, 2: false };
      turn = snap.turn || 1;
      phase = snap.phase || 'aiming';
      winner = snap.winner ?? null;
      if (snap.balls) balls = snap.balls;
      updateHud();
    },
    restart,
    destroy() {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (aiTimer) clearTimeout(aiTimer);
      if (nextHoleTimer) clearTimeout(nextHoleTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      mountEl.innerHTML = '';
    }
  };
}
