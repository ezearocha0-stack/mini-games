import { sfx } from '../audio/sfx.js';

const W = 720;
const H = 420;
const MAX_ROUNDS = 4;
const ROUND_SECONDS = 55;

const PALETTE = ['#f4f1ea', '#f58229', '#1ad1be', '#ef4444', '#f5b623', '#38bdf8', '#a855f7', '#16a34a'];

// Procedural recognizable vector drawings for AI mode (each stroke = array of [x, y] 0..1 normalized)
const AI_SKETCHES = {
  SOL: {
    color: '#f5b623',
    strokes: [
      // Circle sun
      Array.from({ length: 22 }, (_, i) => {
        const a = (i / 21) * Math.PI * 2;
        return [0.5 + Math.cos(a) * 0.14, 0.5 + Math.sin(a) * 0.22];
      }),
      // 6 rays
      ...Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return [
          [0.5 + Math.cos(a) * 0.19, 0.5 + Math.sin(a) * 0.29],
          [0.5 + Math.cos(a) * 0.28, 0.5 + Math.sin(a) * 0.41]
        ];
      })
    ]
  },
  CASA: {
    color: '#f58229',
    strokes: [
      [[0.3, 0.45], [0.5, 0.2], [0.7, 0.45], [0.3, 0.45]],
      [[0.34, 0.45], [0.34, 0.8], [0.66, 0.8], [0.66, 0.45]],
      [[0.46, 0.8], [0.46, 0.58], [0.54, 0.58], [0.54, 0.8]]
    ]
  },
  CORAZÓN: {
    color: '#ef4444',
    strokes: [
      [
        [0.5, 0.78], [0.34, 0.6], [0.28, 0.42], [0.36, 0.28], [0.46, 0.32],
        [0.5, 0.4], [0.54, 0.32], [0.64, 0.28], [0.72, 0.42], [0.66, 0.6], [0.5, 0.78]
      ]
    ]
  },
  ESTRELLA: {
    color: '#f5b623',
    strokes: [
      [
        [0.5, 0.16], [0.57, 0.38], [0.74, 0.38], [0.6, 0.54], [0.65, 0.78],
        [0.5, 0.63], [0.35, 0.78], [0.4, 0.54], [0.26, 0.38], [0.43, 0.38], [0.5, 0.16]
      ]
    ]
  },
  ÁRBOL: {
    color: '#16a34a',
    strokes: [
      [[0.47, 0.82], [0.47, 0.56], [0.53, 0.56], [0.53, 0.82], [0.47, 0.82]],
      Array.from({ length: 18 }, (_, i) => {
        const a = (i / 17) * Math.PI * 2;
        return [0.5 + Math.cos(a) * 0.16, 0.4 + Math.sin(a) * 0.22];
      })
    ]
  },
  BARCO: {
    color: '#38bdf8',
    strokes: [
      [[0.25, 0.65], [0.35, 0.8], [0.65, 0.8], [0.75, 0.65], [0.25, 0.65]],
      [[0.5, 0.65], [0.5, 0.24], [0.68, 0.54], [0.5, 0.54]]
    ]
  },
  RELOJ: {
    color: '#f4f1ea',
    strokes: [
      Array.from({ length: 22 }, (_, i) => {
        const a = (i / 21) * Math.PI * 2;
        return [0.5 + Math.cos(a) * 0.18, 0.5 + Math.sin(a) * 0.28];
      }),
      [[0.5, 0.5], [0.5, 0.31]],
      [[0.5, 0.5], [0.61, 0.54]]
    ]
  },
  RAYO: {
    color: '#f5b623',
    strokes: [[[0.55, 0.18], [0.38, 0.5], [0.52, 0.5], [0.43, 0.82], [0.64, 0.45], [0.5, 0.45], [0.55, 0.18]]]
  },
  PEZ: {
    color: '#1ad1be',
    strokes: [
      [[0.26, 0.5], [0.4, 0.32], [0.62, 0.38], [0.72, 0.5], [0.62, 0.62], [0.4, 0.68], [0.26, 0.5]],
      [[0.72, 0.5], [0.83, 0.36], [0.83, 0.64], [0.72, 0.5]],
      [[0.36, 0.46], [0.37, 0.46]]
    ]
  },
  MONTAÑA: {
    color: '#a855f7',
    strokes: [
      [[0.2, 0.78], [0.42, 0.28], [0.56, 0.56], [0.68, 0.35], [0.82, 0.78], [0.2, 0.78]]
    ]
  },
  ESPADA: {
    color: '#38bdf8',
    strokes: [
      [[0.5, 0.16], [0.5, 0.68]],
      [[0.38, 0.68], [0.62, 0.68]],
      [[0.5, 0.68], [0.5, 0.84]]
    ]
  },
  COHETE: {
    color: '#ef4444',
    strokes: [
      [[0.5, 0.18], [0.58, 0.38], [0.58, 0.68], [0.42, 0.68], [0.42, 0.38], [0.5, 0.18]],
      [[0.42, 0.58], [0.34, 0.72], [0.42, 0.68]],
      [[0.58, 0.58], [0.66, 0.72], [0.58, 0.68]]
    ]
  }
};

const WORD_BANK = [
  'SOL', 'CASA', 'PERRO', 'GATO', 'ÁRBOL', 'BARCO', 'COCHE', 'PIZZA', 'RELOJ', 'ESTRELLA',
  'LUNA', 'MONTAÑA', 'ESPADA', 'CORONA', 'ROBOT', 'COHETE', 'MANZANA', 'PEZ', 'RAYO', 'CORAZÓN',
  'LLAVE', 'PUERTA', 'GUITARRA', 'BICICLETA', 'AVIÓN', 'TREN', 'CASTILLO', 'DRAGÓN', 'FANTASMA',
  'TELÉFONO', 'ORDENADOR', 'RATÓN', 'CÁMARA', 'GAFAS', 'SOMBRERO', 'ZAPATO', 'LIBRO', 'LÁPIZ',
  'HELADO', 'HAMBURGUESA', 'PASTEL', 'CAFÉ', 'NUBE', 'LLUVIA', 'ARCOÍRIS', 'VOLCÁN', 'ISLA',
  'FUEGO', 'DIAMANTE', 'TROFEO', 'BALÓN', 'ESCUDO', 'MARTILLO', 'TIJERAS', 'PARAGUAS', 'FLORES',
  'MARIPOSA', 'ELEFANTE', 'TIBURÓN', 'PINGÜINO', 'TORTUGA', 'PULPO', 'ABEJA', 'DINOSAURIO'
];

function normalizeWord(str) {
  return String(str || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function pickRandomWords(pool, count = 3) {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export function createDrawGuessGame(ctx) {
  const {
    mountEl,
    mode = 'ai',
    isHost = true,
    isSpectator = false,
    localPlayerIndex = 1,
    players = { 1: { name: 'Jugador 1' }, 2: { name: 'Jugador 2' } },
    sendNet,
    sendFastNet,
    onMatchWin
  } = ctx;

  let currentPlayers = { ...players };
  let round = 1;
  let drawerSlot = 1;
  let scores = { 1: 0, 2: 0 };
  let phase = 'pick_word'; // 'pick_word' | 'drawing' | 'round_end' | 'finished'
  let wordChoices = [];
  let secretWord = '';
  let revealedIndices = new Set();
  let timeLeft = ROUND_SECONDS;
  let strokes = [];
  let activeStroke = null;

  let brushColor = PALETTE[0];
  let brushWidth = 6;
  let erasing = false;
  let localRevealSecret = false;
  let guessFeed = [];
  let statusBanner = 'Esperando palabra secreta…';

  let tickTimer = null;
  let aiDrawTimer = null;
  let aiGuessTimer = null;
  let nextRoundTimer = null;
  let resizeObserver = null;
  let destroyed = false;

  const wrap = document.createElement('div');
  wrap.className = 'dg-wrap';
  wrap.innerHTML = `
    <div class="match-hud" style="max-width:740px;">
      <div class="hud-side" data-hud-p="1">
        <span class="hud-swatch p1"></span>
        <div class="hud-player-info">
          <span class="hud-player-name" data-dg-p1></span>
          <span class="hud-player-role" data-dg-p1-score>0 pts</span>
        </div>
      </div>
      <div class="hud-center">
        <span class="hud-score-big" data-dg-hint>_ _ _ _</span>
        <span class="hud-substatus" data-dg-sub>Ronda 1/4 · 55s</span>
      </div>
      <div class="hud-side right" data-hud-p="2">
        <div class="hud-player-info">
          <span class="hud-player-name" data-dg-p2></span>
          <span class="hud-player-role" data-dg-p2-score>0 pts</span>
        </div>
        <span class="hud-swatch p2"></span>
      </div>
    </div>

    <div class="hockey-stage-box" data-dg-stage>
      <div class="hockey-arena-frame" style="padding:6px;border-radius:16px;position:relative;">
        <canvas class="hockey-canvas" style="background:#0d1116;cursor:crosshair;"></canvas>
        <div class="dg-overlay-box hidden" data-dg-overlay></div>
      </div>
    </div>

    <div class="dg-bottom-dock" data-dg-dock>
      <div class="dg-tools-row hidden" data-dg-tools>
        <div class="dg-palette">
          ${PALETTE.map((c) => `<button type="button" class="dg-swatch ${c === brushColor ? 'active' : ''}" style="background:${c}" data-dg-color="${c}" aria-label="Color"></button>`).join('')}
        </div>
        <div class="dg-sizes">
          <button type="button" class="btn btn-subtle btn-compact" data-dg-size="4">Fino</button>
          <button type="button" class="btn btn-subtle btn-compact active" data-dg-size="8">Medio</button>
          <button type="button" class="btn btn-subtle btn-compact" data-dg-size="16">Grueso</button>
          <button type="button" class="btn btn-subtle btn-compact" data-dg-eraser>Borrador</button>
          <button type="button" class="btn btn-subtle btn-compact" data-dg-undo>↩</button>
          <button type="button" class="btn btn-danger-ghost btn-compact" data-dg-clear>🗑️</button>
        </div>
      </div>

      <form class="dg-guess-row hidden" data-dg-guess-form autocomplete="off">
        <input type="text" class="text-input" data-dg-guess-input placeholder="Escribe tu respuesta aquí (o en el chat)..." maxlength="36" />
        <button type="submit" class="btn btn-primary btn-compact">Enviar</button>
      </form>
      <div class="dg-feed-strip" data-dg-feed></div>
    </div>

    <div class="board-result-banner hidden" data-dg-result></div>
  `;

  mountEl.innerHTML = '';
  mountEl.appendChild(wrap);

  const stageBox = wrap.querySelector('[data-dg-stage]');
  const arenaFrame = wrap.querySelector('.hockey-arena-frame');
  const canvas = wrap.querySelector('canvas');
  const g = canvas.getContext('2d');
  const overlayEl = wrap.querySelector('[data-dg-overlay]');
  const p1NameEl = wrap.querySelector('[data-dg-p1]');
  const p2NameEl = wrap.querySelector('[data-dg-p2]');
  const p1ScoreEl = wrap.querySelector('[data-dg-p1-score]');
  const p2ScoreEl = wrap.querySelector('[data-dg-p2-score]');
  const side1El = wrap.querySelector('[data-hud-p="1"]');
  const side2El = wrap.querySelector('[data-hud-p="2"]');
  const hintEl = wrap.querySelector('[data-dg-hint]');
  const subEl = wrap.querySelector('[data-dg-sub]');
  const toolsRow = wrap.querySelector('[data-dg-tools]');
  const guessForm = wrap.querySelector('[data-dg-guess-form]');
  const guessInput = wrap.querySelector('[data-dg-guess-input]');
  const feedEl = wrap.querySelector('[data-dg-feed]');
  const resultEl = wrap.querySelector('[data-dg-result]');

  function isLocalDrawer() {
    if (isSpectator) return false;
    if (mode === 'local') return true;
    if (mode === 'ai') return drawerSlot === 1;
    return drawerSlot === localPlayerIndex;
  }

  function formatHintMask() {
    if (!secretWord) return '· · ·';
    if (phase === 'round_end' || phase === 'finished') return secretWord;
    if (mode !== 'local' && isLocalDrawer()) return secretWord;
    if (mode === 'local' && localRevealSecret) return `${secretWord} (toca para ocultar)`;
    return [...secretWord]
      .map((ch, idx) => (ch === ' ' ? '  ' : revealedIndices.has(idx) ? ch : '_'))
      .join(' ');
  }

  function pushFeed(text, tone = 'info') {
    guessFeed = [...guessFeed.slice(-3), { text, tone }];
    feedEl.innerHTML = guessFeed
      .map((f) => `<span class="dg-feed-chip ${f.tone}">${f.text}</span>`)
      .join('');
  }

  function redrawCanvas() {
    const dpr = canvas.width / W;
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0d1116';
    g.fillRect(0, 0, W, H);

    // Faint paper grid
    g.strokeStyle = 'rgba(240,236,228,0.035)';
    g.lineWidth = 1;
    for (let x = 40; x < W; x += 40) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let y = 40; y < H; y += 40) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }

    const drawStroke = (st) => {
      if (!st || !st.pts || st.pts.length === 0) return;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = st.eraser ? '#0d1116' : st.color || '#f4f1ea';
      g.lineWidth = st.width || 6;
      g.beginPath();
      g.moveTo(st.pts[0][0], st.pts[0][1]);
      if (st.pts.length === 1) {
        g.lineTo(st.pts[0][0] + 0.1, st.pts[0][1] + 0.1);
      } else {
        for (let i = 1; i < st.pts.length; i++) {
          g.lineTo(st.pts[i][0], st.pts[i][1]);
        }
      }
      g.stroke();
    };

    for (const s of strokes) drawStroke(s);
    if (activeStroke) drawStroke(activeStroke);
    g.restore();
  }

  function fitCanvas() {
    const rect = stageBox.getBoundingClientRect();
    const bw = Math.max(240, rect.width - 14);
    const bh = Math.max(160, rect.height - 14);
    const scale = Math.min(bw / W, bh / H);
    const cssW = Math.floor(W * scale);
    const cssH = Math.floor(H * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    arenaFrame.style.width = `${cssW + 14}px`;
    redrawCanvas();
  }

  function renderUi() {
    if (destroyed) return;
    p1NameEl.textContent = currentPlayers[1]?.name || 'Jugador 1';
    p2NameEl.textContent = currentPlayers[2]?.name || (mode === 'ai' ? 'IA Artista' : 'Jugador 2');
    p1ScoreEl.textContent = `${scores[1]} pts${drawerSlot === 1 && phase === 'drawing' ? ' · ✏️' : ''}`;
    p2ScoreEl.textContent = `${scores[2]} pts${drawerSlot === 2 && phase === 'drawing' ? ' · ✏️' : ''}`;

    side1El.classList.toggle('active-turn', phase === 'drawing' && drawerSlot === 1);
    side2El.classList.toggle('active-turn', phase === 'drawing' && drawerSlot === 2);

    hintEl.textContent = formatHintMask();
    subEl.textContent = `Ronda ${round}/${MAX_ROUNDS} · ${timeLeft}s · ${statusBanner}`;

    const drawingLocal = phase === 'drawing' && isLocalDrawer();
    toolsRow.classList.toggle('hidden', !drawingLocal);

    const canGuess = phase === 'drawing' && !isSpectator && (mode === 'local' || !isLocalDrawer());
    guessForm.classList.toggle('hidden', !canGuess);

    if (phase === 'pick_word') {
      overlayEl.classList.remove('hidden');
      if (isLocalDrawer()) {
        overlayEl.innerHTML = `
          <strong>🎨 Elige una palabra para dibujar (Ronda ${round}/${MAX_ROUNDS})</strong>
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:8px;">
            ${wordChoices.map((w) => `<button type="button" class="btn btn-primary btn-compact" data-dg-pick="${w}">${w}</button>`).join('')}
          </div>
        `;
        overlayEl.querySelectorAll('[data-dg-pick]').forEach((b) => {
          b.addEventListener('click', () => chooseSecretWord(b.getAttribute('data-dg-pick')));
        });
      } else {
        overlayEl.innerHTML = `<strong>⏳ ${currentPlayers[drawerSlot]?.name || 'El dibujante'} está eligiendo palabra…</strong>`;
      }
    } else if (phase === 'drawing' && mode === 'local') {
      overlayEl.classList.add('hidden');
      // Add secret reveal toggle inside substatus or tools area
      if (!toolsRow.querySelector('[data-dg-secret-toggle]')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-accent-soft btn-compact';
        btn.setAttribute('data-dg-secret-toggle', '1');
        btn.textContent = '👁️ Palabra';
        btn.addEventListener('click', () => {
          localRevealSecret = !localRevealSecret;
          renderUi();
        });
        toolsRow.appendChild(btn);
      }
    } else if (phase === 'round_end') {
      overlayEl.classList.remove('hidden');
      overlayEl.innerHTML = `<strong>La palabra era: ${secretWord}</strong><span>${statusBanner}</span>`;
    } else {
      overlayEl.classList.add('hidden');
    }

    if (phase === 'finished') {
      const winnerSlot = scores[1] > scores[2] ? 1 : scores[2] > scores[1] ? 2 : 0;
      const msg =
        winnerSlot === 0
          ? `🤝 ¡Empate creativo (${scores[1]} pts)!`
          : `🏆 ¡Gana ${currentPlayers[winnerSlot]?.name || `J${winnerSlot}`} (${scores[1]} vs ${scores[2]})!`;
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = `
        <strong>${msg}</strong>
        <span>4 rondas completadas</span>
        ${!isSpectator ? '<button type="button" class="btn btn-primary btn-compact" data-dg-rematch>Nueva Partida</button>' : ''}
      `;
      resultEl.querySelector('[data-dg-rematch]')?.addEventListener('click', () => restart(false));
    } else {
      resultEl.classList.add('hidden');
    }
  }

  function clearAllTimers() {
    if (tickTimer) clearInterval(tickTimer);
    if (aiDrawTimer) clearTimeout(aiDrawTimer);
    if (aiGuessTimer) clearTimeout(aiGuessTimer);
    if (nextRoundTimer) clearTimeout(nextRoundTimer);
    tickTimer = null;
    aiDrawTimer = null;
    aiGuessTimer = null;
    nextRoundTimer = null;
  }

  function startRound(rNum) {
    clearAllTimers();
    round = rNum;
    drawerSlot = rNum % 2 === 1 ? (mode === 'ai' ? 2 : 1) : (mode === 'ai' ? 1 : 2);
    strokes = [];
    activeStroke = null;
    revealedIndices = new Set();
    secretWord = '';
    timeLeft = ROUND_SECONDS;
    localRevealSecret = false;
    redrawCanvas();

    if (mode === 'ai' && drawerSlot === 2) {
      // AI draws from procedural vector library!
      const aiKeys = Object.keys(AI_SKETCHES);
      const picked = aiKeys[Math.floor(Math.random() * aiKeys.length)];
      chooseSecretWord(picked, true);
      animateAiSketch(picked);
      return;
    }

    if (isLocalDrawer() || mode === 'local') {
      phase = 'pick_word';
      wordChoices = pickRandomWords(WORD_BANK, 3);
      statusBanner = 'Elige palabra secreta';
      if (mode === 'online') {
        sendNet?.({ kind: 'ROUND_PHASE', round, drawerSlot, phase: 'pick_word' });
      }
    } else {
      phase = 'pick_word';
      statusBanner = 'Esperando elección de palabra…';
    }
    renderUi();
  }

  function animateAiSketch(word) {
    const spec = AI_SKETCHES[word];
    if (!spec) return;
    let sIdx = 0;
    let pIdx = 0;
    const stepDraw = () => {
      if (destroyed || phase !== 'drawing' || drawerSlot !== 2) return;
      if (sIdx >= spec.strokes.length) return;
      const srcStroke = spec.strokes[sIdx];
      if (!activeStroke) {
        const [nx, ny] = srcStroke[0];
        activeStroke = { color: spec.color, width: 7, eraser: false, pts: [[nx * W, ny * H]] };
        pIdx = 1;
      } else if (pIdx < srcStroke.length) {
        const [nx, ny] = srcStroke[pIdx++];
        activeStroke.pts.push([nx * W, ny * H]);
      } else {
        strokes.push(activeStroke);
        activeStroke = null;
        sIdx++;
        pIdx = 0;
      }
      redrawCanvas();
      aiDrawTimer = setTimeout(stepDraw, 130);
    };
    aiDrawTimer = setTimeout(stepDraw, 400);
  }

  function scheduleAiGuess() {
    if (mode !== 'ai' || drawerSlot !== 1 || phase !== 'drawing') return;
    const tryGuess = () => {
      if (destroyed || phase !== 'drawing' || drawerSlot !== 1) return;
      const totalPts = strokes.reduce((acc, s) => acc + s.pts.length, 0);
      if (totalPts >= 18 && timeLeft <= 44 && Math.random() < (timeLeft < 28 ? 0.62 : 0.25)) {
        handleGuessAttempt(secretWord, 2, 'IA Artista');
        return;
      }
      const wrongPool = WORD_BANK.filter((w) => w !== secretWord);
      const fake = wrongPool[Math.floor(Math.random() * wrongPool.length)];
      pushFeed(`IA: ${fake}`, 'miss');
      aiGuessTimer = setTimeout(tryGuess, 3600);
    };
    aiGuessTimer = setTimeout(tryGuess, 4000);
  }

  function startCountdown() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      if (destroyed || phase !== 'drawing') return;
      timeLeft = Math.max(0, timeLeft - 1);
      if ((timeLeft === 32 || timeLeft === 16) && secretWord.length > 2) {
        const unrevealed = [...secretWord]
          .map((_, i) => i)
          .filter((i) => secretWord[i] !== ' ' && !revealedIndices.has(i));
        if (unrevealed.length > 1) {
          revealedIndices.add(unrevealed[Math.floor(Math.random() * unrevealed.length)]);
        }
      }
      if (timeLeft <= 0) {
        finishRound(0, null, '⏱️ ¡Tiempo agotado!');
        return;
      }
      renderUi();
    }, 1000);
  }

  function chooseSecretWord(word, fromAi = false) {
    secretWord = String(word || 'SOL').toUpperCase();
    phase = 'drawing';
    timeLeft = ROUND_SECONDS;
    statusBanner = isLocalDrawer() ? '¡Dibuja!' : '¡Adivina el dibujo!';
    if (!fromAi) sfx.brushPop();

    if (mode === 'online' && isLocalDrawer()) {
      sendNet?.({ kind: 'SECRET_WORD', word: secretWord });
      sendNet?.({
        kind: 'WORD_CHOSEN',
        round,
        drawerSlot,
        length: secretWord.length,
        wordHash: normalizeWord(secretWord)
      });
    }
    startCountdown();
    if (mode === 'ai' && drawerSlot === 1) scheduleAiGuess();
    renderUi();
  }

  function finishRound(pointsWon, guesserSlot, message) {
    clearAllTimers();
    phase = 'round_end';
    statusBanner = message;
    if (guesserSlot === 1 || guesserSlot === 2) {
      scores[guesserSlot] += pointsWon;
      scores[drawerSlot] += Math.round(pointsWon * 0.65);
    }
    renderUi();

    nextRoundTimer = setTimeout(() => {
      if (destroyed) return;
      if (round >= MAX_ROUNDS) {
        phase = 'finished';
        const winSlot = scores[1] > scores[2] ? 1 : scores[2] > scores[1] ? 2 : 0;
        if (winSlot === 1 || winSlot === 2) onMatchWin?.(winSlot);
        if (mode === 'online' && isHost) {
          sendNet?.({ kind: 'GAME_OVER', scores });
        }
        sfx.win();
        renderUi();
      } else {
        startRound(round + 1);
      }
    }, 2200);
  }

  function handleGuessAttempt(rawText, guesserSlot, guesserName = 'Jugador') {
    if (phase !== 'drawing' || !secretWord) return false;
    const guessNorm = normalizeWord(rawText);
    const targetNorm = normalizeWord(secretWord);
    if (!guessNorm) return false;

    if (guessNorm === targetNorm) {
      const pts = 100 + timeLeft * 2;
      sfx.correctGuess();
      pushFeed(`🎉 ¡${guesserName} acertó (+${pts})!`, 'hit');
      if (mode === 'online') {
        sendNet?.({
          kind: 'ROUND_SOLVED',
          round,
          guesserSlot,
          guesserName,
          points: pts,
          word: secretWord
        });
      }
      finishRound(pts, guesserSlot, `🎉 ¡${guesserName} adivinó "${secretWord}" (+${pts} pts)!`);
      return true;
    }

    if (editDistance(guessNorm, targetNorm) === 1 && guessNorm.length >= 3) {
      pushFeed(`🔥 ${guesserName}: ¡Muy cerca!`, 'close');
    } else {
      pushFeed(`${guesserName}: ${String(rawText).slice(0, 24)}`, 'miss');
    }
    return false;
  }

  // Canvas drawing pointer events
  const getPt = (e) => {
    const r = canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(W, ((e.clientX - r.left) / (r.width || 1)) * W)),
      Math.max(0, Math.min(H, ((e.clientY - r.top) / (r.height || 1)) * H))
    ];
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (phase !== 'drawing' || !isLocalDrawer()) return;
    canvas.setPointerCapture?.(e.pointerId);
    const pt = getPt(e);
    activeStroke = {
      color: brushColor,
      width: brushWidth,
      eraser: erasing,
      pts: [pt]
    };
    redrawCanvas();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!activeStroke || phase !== 'drawing' || !isLocalDrawer()) return;
    const pt = getPt(e);
    const prev = activeStroke.pts[activeStroke.pts.length - 1];
    if (Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) < 2.2) return;
    activeStroke.pts.push(pt);
    redrawCanvas();
    if (mode === 'online' && activeStroke.pts.length % 3 === 0) {
      sendFastNet?.({ kind: 'STROKE_SEG', stroke: activeStroke });
    }
  });

  const commitActiveStroke = () => {
    if (!activeStroke) return;
    strokes.push(activeStroke);
    const committed = activeStroke;
    activeStroke = null;
    redrawCanvas();
    if (mode === 'online') {
      sendNet?.({ kind: 'STROKE_COMMIT', stroke: committed });
    }
  };
  canvas.addEventListener('pointerup', commitActiveStroke);
  canvas.addEventListener('pointercancel', commitActiveStroke);

  // Drawing tools UI listeners
  wrap.querySelectorAll('[data-dg-color]').forEach((b) => {
    b.addEventListener('click', () => {
      brushColor = b.getAttribute('data-dg-color');
      erasing = false;
      wrap.querySelectorAll('[data-dg-color]').forEach((x) => x.classList.toggle('active', x === b));
      wrap.querySelector('[data-dg-eraser]')?.classList.remove('active');
    });
  });
  wrap.querySelectorAll('[data-dg-size]').forEach((b) => {
    b.addEventListener('click', () => {
      brushWidth = Number(b.getAttribute('data-dg-size')) || 6;
      wrap.querySelectorAll('[data-dg-size]').forEach((x) => x.classList.toggle('active', x === b));
    });
  });
  wrap.querySelector('[data-dg-eraser]')?.addEventListener('click', (e) => {
    erasing = !erasing;
    e.currentTarget.classList.toggle('active', erasing);
  });
  wrap.querySelector('[data-dg-undo]')?.addEventListener('click', () => {
    if (strokes.length === 0) return;
    strokes.pop();
    redrawCanvas();
    if (mode === 'online') sendNet?.({ kind: 'STROKE_UNDO' });
  });
  wrap.querySelector('[data-dg-clear]')?.addEventListener('click', () => {
    strokes = [];
    redrawCanvas();
    if (mode === 'online') sendNet?.({ kind: 'STROKE_CLEAR' });
  });

  guessForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = (guessInput.value || '').trim();
    if (!val) return;
    guessInput.value = '';
    const gSlot = mode === 'local' ? (drawerSlot === 1 ? 2 : 1) : localPlayerIndex;
    const gName = currentPlayers[gSlot]?.name || (mode === 'local' ? 'Adivinador' : 'Tú');
    if (mode === 'online') {
      sendNet?.({ kind: 'GUESS_TEXT', text: val, guesserSlot: gSlot, guesserName: gName });
    }
    handleGuessAttempt(val, gSlot, gName);
  });

  resizeObserver = new ResizeObserver(fitCanvas);
  resizeObserver.observe(stageBox);
  fitCanvas();
  startRound(1);

  function restart(fromRemote = false) {
    scores = { 1: 0, 2: 0 };
    guessFeed = [];
    feedEl.innerHTML = '';
    startRound(1);
    if (!fromRemote && mode === 'online') sendNet?.({ kind: 'RESTART' });
  }

  return {
    onLocalChatGuess(text) {
      if (phase !== 'drawing' || isSpectator || isLocalDrawer()) return false;
      const gName = currentPlayers[localPlayerIndex]?.name || 'Tú';
      return handleGuessAttempt(text, localPlayerIndex, gName);
    },
    onRemoteChatGuess(packet) {
      if (phase !== 'drawing' || !packet?.text) return false;
      if (isLocalDrawer() && normalizeWord(packet.text) === normalizeWord(secretWord)) {
        const gSlot = localPlayerIndex === 1 ? 2 : 1;
        handleGuessAttempt(packet.text, gSlot, packet.senderName || 'Rival');
        return true;
      }
      return false;
    },
    onNetMessage(msg) {
      if (!msg || destroyed) return;
      if (msg.kind === 'RESTART') {
        restart(true);
        return;
      }
      if (msg.kind === 'ROUND_PHASE') {
        round = msg.round || round;
        drawerSlot = msg.drawerSlot || drawerSlot;
        phase = msg.phase || 'pick_word';
        strokes = [];
        activeStroke = null;
        secretWord = '';
        redrawCanvas();
        renderUi();
        return;
      }
      if (msg.kind === 'WORD_CHOSEN') {
        round = msg.round || round;
        drawerSlot = msg.drawerSlot || drawerSlot;
        phase = 'drawing';
        timeLeft = ROUND_SECONDS;
        secretWord = '?'.repeat(Math.max(3, Number(msg.length) || 5));
        statusBanner = '¡Adivina el dibujo!';
        startCountdown();
        renderUi();
        return;
      }
      if (msg.kind === 'STROKE_SEG' && msg.stroke) {
        activeStroke = msg.stroke;
        redrawCanvas();
        return;
      }
      if (msg.kind === 'STROKE_COMMIT' && msg.stroke) {
        activeStroke = null;
        strokes.push(msg.stroke);
        redrawCanvas();
        return;
      }
      if (msg.kind === 'STROKE_UNDO') {
        strokes.pop();
        redrawCanvas();
        return;
      }
      if (msg.kind === 'STROKE_CLEAR') {
        strokes = [];
        redrawCanvas();
        return;
      }
      if (msg.kind === 'GUESS_TEXT' && isLocalDrawer() && msg.text) {
        handleGuessAttempt(msg.text, msg.guesserSlot || (localPlayerIndex === 1 ? 2 : 1), msg.guesserName || 'Rival');
        return;
      }
      if (msg.kind === 'ROUND_SOLVED') {
        secretWord = msg.word || secretWord;
        finishRound(msg.points || 120, msg.guesserSlot, `🎉 ¡${msg.guesserName} adivinó "${secretWord}"!`);
      }
    },
    updatePlayers(nextPlayers) {
      currentPlayers = { ...nextPlayers };
      renderUi();
    },
    getSnapshot() {
      return { round, drawerSlot, scores, phase, timeLeft, strokes };
    },
    applySnapshot(snap) {
      if (!snap) return;
      round = snap.round || 1;
      drawerSlot = snap.drawerSlot || 1;
      scores = snap.scores || { 1: 0, 2: 0 };
      phase = snap.phase || 'drawing';
      timeLeft = snap.timeLeft || ROUND_SECONDS;
      strokes = snap.strokes || [];
      redrawCanvas();
      renderUi();
    },
    restart,
    destroy() {
      destroyed = true;
      clearAllTimers();
      resizeObserver?.disconnect();
      mountEl.innerHTML = '';
    }
  };
}
