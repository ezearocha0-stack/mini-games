import { sfx } from '../audio/sfx.js';

const GRID_SIZE = 10;
const LETTERS = 'ABCDEFGHIJ';
const SHIPS_CATALOG = [
  { id: 'carrier', name: 'Portaaviones', size: 5, short: '5' },
  { id: 'battleship', name: 'Acorazado', size: 4, short: '4' },
  { id: 'cruiser', name: 'Crucero', size: 3, short: '3' },
  { id: 'submarine', name: 'Submarino', size: 3, short: '3' },
  { id: 'destroyer', name: 'Destructor', size: 2, short: '2' }
];

function computeCells(r, c, size, horizontal) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    const nr = horizontal ? r : r + i;
    const nc = horizontal ? c + i : c;
    if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return null;
    cells.push([nr, nc]);
  }
  return cells;
}

function generateRandomFleet() {
  for (let attempt = 0; attempt < 80; attempt++) {
    const used = new Set();
    const fleet = [];
    let ok = true;
    for (const spec of SHIPS_CATALOG) {
      let placed = null;
      for (let t = 0; t < 50; t++) {
        const horiz = Math.random() < 0.5;
        const r = Math.floor(Math.random() * GRID_SIZE);
        const c = Math.floor(Math.random() * GRID_SIZE);
        const cells = computeCells(r, c, spec.size, horiz);
        if (!cells) continue;
        if (cells.some(([sr, sc]) => used.has(`${sr},${sc}`))) continue;
        placed = { id: spec.id, name: spec.name, size: spec.size, horizontal: horiz, cells };
        break;
      }
      if (!placed) {
        ok = false;
        break;
      }
      placed.cells.forEach(([sr, sc]) => used.add(`${sr},${sc}`));
      fleet.push(placed);
    }
    if (ok) return fleet;
  }
  // Fallback deterministic spacing
  return SHIPS_CATALOG.map((spec, idx) => ({
    id: spec.id,
    name: spec.name,
    size: spec.size,
    horizontal: true,
    cells: computeCells(idx * 2, 0, spec.size, true)
  }));
}

async function computeFleetHash(fleet, salt) {
  try {
    const msg = `${salt}|${JSON.stringify(fleet.map((s) => s.cells))}`;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${salt}_local`;
  }
}

export function createBattleshipGame(ctx) {
  const {
    mountEl,
    mode = 'ai',
    isSpectator = false,
    isServerRelay = false,
    localPlayerIndex = 1,
    players = { 1: { name: 'Jugador 1' }, 2: { name: 'Jugador 2' } },
    sendNet,
    onMatchWin
  } = ctx;

  let currentPlayers = { ...players };
  let phase = 'deploy'; // 'deploy' | 'waiting_enemy' | 'combat' | 'finished'
  let turn = 1;
  let winner = null;
  let activeDeploySlot = 1;
  let localPrivacyCurtain = false;
  let mobileTab = 'attack'; // 'attack' | 'own'

  let horizontal = true;
  let selectedShipIdx = 0;

  // Per player slot state (in online mode, opponent fleet stays null until sunk ships are revealed!)
  let fleets = { 1: generateRandomFleet(), 2: mode === 'ai' ? generateRandomFleet() : null };
  let readyFlags = { 1: false, 2: mode === 'ai' };
  let p2pSalts = { 1: Math.random().toString(36).slice(2, 10), 2: '' };

  // Shot logs recorded from attacker perspective: shotsBy[attacker] -> Map("r,c", { hit: boolean })
  let shotsBy = { 1: new Map(), 2: new Map() };
  let sunkOn = { 1: [], 2: [] }; // Revealed sunk ships belonging to player 1 or player 2

  // Smart Hunt & Target queue for AI (slot 2 attacking slot 1)
  let aiTargetQueue = [];
  let aiTimer = null;
  let statusText = 'Coloca tu flota y pulsa Confirmar Flota';
  let lastShotInfo = '';
  let destroyed = false;

  const wrap = document.createElement('div');
  wrap.className = 'bs-wrap';
  wrap.innerHTML = `
    <div class="match-hud" style="max-width:740px;">
      <div class="hud-side" data-hud-p="1">
        <span class="hud-swatch p1"></span>
        <div class="hud-player-info">
          <span class="hud-player-name" data-bs-p1></span>
          <span class="hud-player-role" data-bs-p1-info>Flota: 5/5</span>
        </div>
      </div>
      <div class="hud-center">
        <span class="hud-score-big" data-bs-turn>DESPLIEGUE</span>
        <span class="hud-substatus" data-bs-status>Prepara tus naves</span>
      </div>
      <div class="hud-side right" data-hud-p="2">
        <div class="hud-player-info">
          <span class="hud-player-name" data-bs-p2></span>
          <span class="hud-player-role" data-bs-p2-info>Flota: 5/5</span>
        </div>
        <span class="hud-swatch p2"></span>
      </div>
    </div>

    <div class="bs-mobile-tabs hidden" data-bs-mob-tabs>
      <button type="button" class="filter-tab active" data-bs-tab="attack">🎯 Radar Enemigo</button>
      <button type="button" class="filter-tab" data-bs-tab="own">🛡️ Mi Flota</button>
    </div>

    <div class="bs-arena" data-bs-arena></div>
    <div class="game-control-dock" data-bs-controls></div>
    <div class="board-result-banner hidden" data-bs-result></div>
  `;

  mountEl.innerHTML = '';
  mountEl.appendChild(wrap);

  const p1NameEl = wrap.querySelector('[data-bs-p1]');
  const p2NameEl = wrap.querySelector('[data-bs-p2]');
  const p1InfoEl = wrap.querySelector('[data-bs-p1-info]');
  const p2InfoEl = wrap.querySelector('[data-bs-p2-info]');
  const side1El = wrap.querySelector('[data-hud-p="1"]');
  const side2El = wrap.querySelector('[data-hud-p="2"]');
  const turnBadgeEl = wrap.querySelector('[data-bs-turn]');
  const statusEl = wrap.querySelector('[data-bs-status]');
  const mobTabsEl = wrap.querySelector('[data-bs-mob-tabs]');
  const arenaEl = wrap.querySelector('[data-bs-arena]');
  const controlsEl = wrap.querySelector('[data-bs-controls]');
  const resultEl = wrap.querySelector('[data-bs-result]');

  function viewerSlot() {
    if (mode === 'local') return phase === 'deploy' ? activeDeploySlot : turn;
    if (mode === 'online') return isSpectator ? 1 : localPlayerIndex;
    return 1;
  }

  function oppOf(slot) {
    return slot === 1 ? 2 : 1;
  }

  function countHits(byAttacker) {
    let n = 0;
    for (const v of shotsBy[byAttacker].values()) {
      if (v.hit) n++;
    }
    return n;
  }

  function buildGridHtml({ boardOwnerSlot, isAttackGrid, interactive }) {
    const fleet = fleets[boardOwnerSlot];
    const incomingShots = shotsBy[oppOf(boardOwnerSlot)];
    const revealedSunk = sunkOn[boardOwnerSlot] || [];

    const shipCellMap = new Map();
    if (fleet && (!isAttackGrid || phase === 'finished')) {
      for (const s of fleet) {
        for (const [r, c] of s.cells) {
          shipCellMap.set(`${r},${c}`, s);
        }
      }
    }
    const sunkCellSet = new Set();
    for (const s of revealedSunk) {
      for (const [r, c] of s.cells) sunkCellSet.add(`${r},${c}`);
    }

    let cellsHtml = '';
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const key = `${r},${c}`;
        const shot = incomingShots.get(key);
        const ship = shipCellMap.get(key);
        const isSunk = sunkCellSet.has(key);
        let cls = 'bs-cell';
        let label = '';
        if (ship && !isAttackGrid) cls += ' ship';
        if (isSunk) cls += ' sunk';
        if (shot) {
          cls += shot.hit ? ' hit' : ' miss';
          label = shot.hit ? '💥' : '•';
        }
        const disabled = !interactive || (isAttackGrid && shot);
        cellsHtml += `<button type="button" class="${cls}" data-bs-cell="${isAttackGrid ? 'atk' : 'own'}:${r}:${c}" ${disabled ? 'disabled' : ''} aria-label="${LETTERS[c]}${r + 1}">${label}</button>`;
      }
    }

    return `
      <div class="bs-board-panel">
        <div class="bs-board-header">
          <strong>${isAttackGrid ? '🎯 Radar Enemigo' : `🛡️ Flota de ${currentPlayers[boardOwnerSlot]?.name || `J${boardOwnerSlot}`}`}</strong>
          <span class="pill ${isAttackGrid ? 'accent' : ''}">${isAttackGrid ? `${countHits(oppOf(boardOwnerSlot))}/17 impactos` : `${5 - revealedSunk.length}/5 activas`}</span>
        </div>
        <div class="bs-grid" role="grid">${cellsHtml}</div>
      </div>
    `;
  }

  function render() {
    if (destroyed) return;
    const viewSlot = viewerSlot();
    const enemySlot = oppOf(viewSlot);

    p1NameEl.textContent = currentPlayers[1]?.name || 'Jugador 1';
    p2NameEl.textContent = currentPlayers[2]?.name || (mode === 'ai' ? 'Almirante CPU' : 'Jugador 2');
    p1InfoEl.textContent = `Impactos: ${countHits(1)}/17 · Barcos: ${5 - sunkOn[1].length}/5`;
    p2InfoEl.textContent = `Impactos: ${countHits(2)}/17 · Barcos: ${5 - sunkOn[2].length}/5`;

    side1El.classList.toggle('active-turn', phase === 'combat' && turn === 1);
    side2El.classList.toggle('active-turn', phase === 'combat' && turn === 2);

    if (phase === 'deploy' || phase === 'waiting_enemy') {
      turnBadgeEl.textContent = phase === 'waiting_enemy' ? 'LISTO' : 'DESPLIEGUE';
    } else if (phase === 'finished') {
      turnBadgeEl.textContent = `GANA J${winner}`;
    } else {
      const myTurn = mode === 'online' ? turn === localPlayerIndex && !isSpectator : mode === 'ai' ? turn === 1 : true;
      turnBadgeEl.textContent = mode === 'ai' ? (turn === 1 ? 'TU DISPARO' : 'IA…') : myTurn ? 'TU DISPARO' : `TURNO J${turn}`;
    }
    statusEl.textContent = lastShotInfo || statusText;

    // Local 2P privacy curtain
    if (mode === 'local' && localPrivacyCurtain && phase !== 'finished') {
      mobTabsEl.classList.add('hidden');
      const nextName =
        phase === 'deploy'
          ? currentPlayers[activeDeploySlot]?.name || `Jugador ${activeDeploySlot}`
          : currentPlayers[turn]?.name || `Jugador ${turn}`;
      arenaEl.innerHTML = `
        <div class="surface-card" style="max-width:420px;text-align:center;margin:auto;padding:24px;">
          <h3 style="margin:0 0 8px;">🔒 Cortina Táctica · 2J Local</h3>
          <p style="margin:0 0 14px;color:var(--text-secondary);font-size:0.88rem;">
            Entrega la pantalla a <strong>${nextName}</strong> para mantener sus barcos ocultos.
          </p>
          <button type="button" class="btn btn-primary" data-bs-curtain-go>Continuar como ${nextName}</button>
        </div>
      `;
      controlsEl.innerHTML = '';
      arenaEl.querySelector('[data-bs-curtain-go]')?.addEventListener('click', () => {
        localPrivacyCurtain = false;
        render();
      });
      return;
    }

    if (phase === 'deploy' || phase === 'waiting_enemy') {
      mobTabsEl.classList.add('hidden');
      const slotToShow = mode === 'local' ? activeDeploySlot : localPlayerIndex;
      if (isSpectator) {
        arenaEl.innerHTML = `<div class="surface-card" style="margin:auto;text-align:center;">👁️ Esperando a que los jugadores desplieguen sus flotas…</div>`;
        controlsEl.innerHTML = '';
        return;
      }

      if (!fleets[slotToShow]) fleets[slotToShow] = generateRandomFleet();
      arenaEl.innerHTML = `<div class="bs-single-wrap">${buildGridHtml({
        boardOwnerSlot: slotToShow,
        isAttackGrid: false,
        interactive: phase === 'deploy'
      })}</div>`;

      const selSpec = SHIPS_CATALOG[selectedShipIdx];
      controlsEl.innerHTML = `
        <div class="bs-ship-pills">
          ${SHIPS_CATALOG.map(
            (s, idx) => `
            <button type="button" class="filter-tab ${idx === selectedShipIdx ? 'active' : ''}" data-bs-pick-ship="${idx}" ${phase !== 'deploy' ? 'disabled' : ''}>
              ${s.name} (${s.size})
            </button>`
          ).join('')}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;">
          <button type="button" class="btn btn-subtle btn-compact" data-bs-rotate ${phase !== 'deploy' ? 'disabled' : ''}>
            🔄 ${horizontal ? 'Horizontal' : 'Vertical'}
          </button>
          <button type="button" class="btn btn-secondary btn-compact" data-bs-random ${phase !== 'deploy' ? 'disabled' : ''}>
            🎲 Auto-colocar
          </button>
          <button type="button" class="btn btn-primary btn-compact" data-bs-confirm ${phase !== 'deploy' ? 'disabled' : ''}>
            ${phase === 'waiting_enemy' ? '⏳ Esperando rival…' : '✅ Confirmar Flota'}
          </button>
        </div>
      `;
    } else {
      // Combat / Finished
      mobTabsEl.classList.remove('hidden');
      mobTabsEl.querySelectorAll('[data-bs-tab]').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-bs-tab') === mobileTab);
      });

      const canFireNow =
        phase === 'combat' &&
        !isSpectator &&
        (mode === 'local' || (mode === 'ai' && turn === 1) || (mode === 'online' && turn === localPlayerIndex));

      arenaEl.innerHTML = `
        <div class="bs-dual-grids" data-mob-tab="${mobileTab}">
          <div class="bs-panel-slot" data-slot-kind="attack">
            ${buildGridHtml({ boardOwnerSlot: enemySlot, isAttackGrid: true, interactive: canFireNow })}
          </div>
          <div class="bs-panel-slot" data-slot-kind="own">
            ${buildGridHtml({ boardOwnerSlot: viewSlot, isAttackGrid: false, interactive: false })}
          </div>
        </div>
      `;

      const sunkListHtml = SHIPS_CATALOG.map((s) => {
        const isSunk = sunkOn[enemySlot].some((x) => x.id === s.id);
        return `<span class="pill ${isSunk ? 'ok' : ''}" style="${isSunk ? 'text-decoration:line-through;opacity:0.7;' : ''}">${s.name} (${s.size})</span>`;
      }).join('');
      controlsEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center;">
        <span style="font-size:0.75rem;color:var(--text-muted);">Objetivos:</span>${sunkListHtml}
      </div>`;
    }

    if (phase === 'finished') {
      const winName = currentPlayers[winner]?.name || `Jugador ${winner}`;
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = `
        <strong>⚓ ¡Flota hundida! Gana ${winName}</strong>
        <span>${lastShotInfo || 'Batalla naval decidida'}</span>
        ${!isSpectator ? '<button type="button" class="btn btn-primary btn-compact" data-bs-rematch>Nueva Batalla</button>' : ''}
      `;
      resultEl.querySelector('[data-bs-rematch]')?.addEventListener('click', () => restart(false));
    } else {
      resultEl.classList.add('hidden');
    }

    bindArenaListeners();
  }

  function tryMoveSelectedShip(r, c) {
    if (phase !== 'deploy') return;
    const slot = mode === 'local' ? activeDeploySlot : localPlayerIndex;
    const fleet = fleets[slot];
    const spec = SHIPS_CATALOG[selectedShipIdx];
    const nextCells = computeCells(r, c, spec.size, horizontal);
    if (!nextCells) {
      statusText = 'No cabe en esa posición';
      render();
      return;
    }
    const occupiedByOthers = new Set();
    fleet.forEach((s) => {
      if (s.id !== spec.id) s.cells.forEach(([sr, sc]) => occupiedByOthers.add(`${sr},${sc}`));
    });
    if (nextCells.some(([sr, sc]) => occupiedByOthers.has(`${sr},${sc}`))) {
      statusText = 'Se solapa con otro barco';
      render();
      return;
    }
    const idx = fleet.findIndex((s) => s.id === spec.id);
    fleet[idx] = { ...fleet[idx], horizontal, cells: nextCells };
    sfx.click();
    statusText = `${spec.name} reubicado en ${LETTERS[c]}${r + 1}`;
    render();
  }

  async function confirmDeployment() {
    if (phase !== 'deploy' || isSpectator) return;
    sfx.radarPing();

    if (mode === 'local') {
      readyFlags[activeDeploySlot] = true;
      if (activeDeploySlot === 1) {
        activeDeploySlot = 2;
        if (!fleets[2]) fleets[2] = generateRandomFleet();
        localPrivacyCurtain = true;
        statusText = 'Turno de despliegue del Jugador 2';
        render();
        return;
      }
      phase = 'combat';
      turn = 1;
      localPrivacyCurtain = true;
      statusText = '¡Combate iniciado! Dispara en el radar';
      render();
      return;
    }

    if (mode === 'ai') {
      readyFlags[1] = true;
      readyFlags[2] = true;
      phase = 'combat';
      turn = 1;
      statusText = '¡Combate iniciado! Elige coordenada enemiga';
      render();
      return;
    }

    // Online mode
    readyFlags[localPlayerIndex] = true;
    const myFleet = fleets[localPlayerIndex];
    if (isServerRelay) {
      sendNet?.({
        kind: 'PLACE_FLEET',
        ships: myFleet.map((s) => ({ id: s.id, cells: s.cells }))
      });
    } else {
      const hash = await computeFleetHash(myFleet, p2pSalts[localPlayerIndex]);
      sendNet?.({ kind: 'P2P_FLEET_READY', slot: localPlayerIndex, hash });
    }

    if (readyFlags[1] && readyFlags[2]) {
      phase = 'combat';
      statusText = turn === localPlayerIndex ? '¡Combate iniciado! Tu turno de disparo' : 'Esperando disparo rival…';
    } else {
      phase = 'waiting_enemy';
      statusText = 'Flota confirmada · Esperando al rival…';
    }
    render();
  }

  function applyShotResult({ by, r, c, hit, sunkShip, nextTurn, winner: nextWinner }) {
    const opp = oppOf(by);
    const key = `${r},${c}`;
    shotsBy[by].set(key, { hit: Boolean(hit) });

    if (hit) {
      if (sunkShip) {
        if (!sunkOn[opp].some((x) => x.id === sunkShip.id)) {
          sunkOn[opp].push(sunkShip);
        }
        sfx.explosion();
        lastShotInfo = `🔥 ¡${sunkShip.name} hundido en ${LETTERS[c]}${r + 1}!`;
      } else {
        sfx.puckHit(1.0);
        lastShotInfo = `💥 ¡Impacto en ${LETTERS[c]}${r + 1}!`;
      }
    } else {
      sfx.splash();
      lastShotInfo = `🌊 Agua en ${LETTERS[c]}${r + 1}`;
    }

    if (nextWinner === 1 || nextWinner === 2) {
      phase = 'finished';
      winner = nextWinner;
      if ((mode === 'online' && winner === localPlayerIndex) || (mode === 'ai' && winner === 1) || mode === 'local') {
        sfx.win();
      } else {
        sfx.lose();
      }
      onMatchWin?.(winner);
      render();
      return;
    }

    turn = nextTurn;
    if (mode === 'local') {
      localPrivacyCurtain = true;
    }
    render();
    maybeTriggerAi();
  }

  function resolveLocalFleetShot(by, r, c) {
    const opp = oppOf(by);
    const key = `${r},${c}`;
    if (shotsBy[by].has(key)) return;
    const targetFleet = fleets[opp];
    let hitShip = null;
    for (const s of targetFleet) {
      if (s.cells.some(([sr, sc]) => sr === r && sc === c)) {
        hitShip = s;
        break;
      }
    }
    const hit = Boolean(hitShip);
    shotsBy[by].set(key, { hit });
    let sunkShip = null;
    if (hitShip) {
      const allHit = hitShip.cells.every(([sr, sc]) => shotsBy[by].get(`${sr},${sc}`)?.hit);
      if (allHit) sunkShip = { id: hitShip.id, name: hitShip.name, size: hitShip.size, cells: hitShip.cells };
    }
    const totalHits = countHits(by) + (hit ? 0 : 0); // already inserted in shotsBy
    const winSlot = totalHits >= 17 ? by : null;
    const nextTurn = winSlot ? by : opp;
    applyShotResult({ by, r, c, hit, sunkShip, nextTurn, winner: winSlot });
  }

  function handleAttackCell(r, c) {
    if (phase !== 'combat' || isSpectator) return;
    if (mode === 'online' && turn !== localPlayerIndex) return;
    if (mode === 'ai' && turn !== 1) return;
    const key = `${r},${c}`;
    const shooter = mode === 'local' ? turn : mode === 'online' ? localPlayerIndex : 1;
    if (shotsBy[shooter].has(key)) return;

    sfx.radarPing();
    if (mode === 'online') {
      if (isServerRelay) {
        sendNet?.({ kind: 'FIRE', r, c });
      } else {
        sendNet?.({ kind: 'P2P_FIRE', by: shooter, r, c });
      }
      return;
    }

    resolveLocalFleetShot(shooter, r, c);
  }

  function maybeTriggerAi() {
    if (aiTimer) clearTimeout(aiTimer);
    if (destroyed || mode !== 'ai' || phase !== 'combat' || turn !== 2) return;

    aiTimer = setTimeout(() => {
      if (destroyed || phase !== 'combat' || turn !== 2) return;
      let target = null;
      while (aiTargetQueue.length > 0) {
        const cand = aiTargetQueue.shift();
        if (
          cand.r >= 0 &&
          cand.r < GRID_SIZE &&
          cand.c >= 0 &&
          cand.c < GRID_SIZE &&
          !shotsBy[2].has(`${cand.r},${cand.c}`)
        ) {
          target = cand;
          break;
        }
      }
      if (!target) {
        // Checkerboard parity hunt first
        const parity = [];
        const anyAvail = [];
        for (let r = 0; r < GRID_SIZE; r++) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (!shotsBy[2].has(`${r},${c}`)) {
              anyAvail.push({ r, c });
              if ((r + c) % 2 === 0) parity.push({ r, c });
            }
          }
        }
        const pool = parity.length > 0 ? parity : anyAvail;
        target = pool[Math.floor(Math.random() * pool.length)];
      }
      if (!target) return;

      const beforeHits = countHits(2);
      resolveLocalFleetShot(2, target.r, target.c);
      if (countHits(2) > beforeHits && phase === 'combat') {
        // Push cardinal neighbors to Hunt/Target queue
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of dirs) {
          aiTargetQueue.push({ r: target.r + dr, c: target.c + dc });
        }
      }
    }, 550);
  }

  function bindArenaListeners() {
    arenaEl.querySelectorAll('[data-bs-cell]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [kind, rStr, cStr] = btn.getAttribute('data-bs-cell').split(':');
        const r = Number(rStr);
        const c = Number(cStr);
        if (kind === 'own' && phase === 'deploy') tryMoveSelectedShip(r, c);
        else if (kind === 'atk' && phase === 'combat') handleAttackCell(r, c);
      });
    });

    controlsEl.querySelectorAll('[data-bs-pick-ship]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedShipIdx = Number(btn.getAttribute('data-bs-pick-ship')) || 0;
        render();
      });
    });

    controlsEl.querySelector('[data-bs-rotate]')?.addEventListener('click', () => {
      horizontal = !horizontal;
      render();
    });

    controlsEl.querySelector('[data-bs-random]')?.addEventListener('click', () => {
      const slot = mode === 'local' ? activeDeploySlot : localPlayerIndex;
      fleets[slot] = generateRandomFleet();
      sfx.click();
      statusText = 'Flota reorganizada aleatoriamente';
      render();
    });

    controlsEl.querySelector('[data-bs-confirm]')?.addEventListener('click', confirmDeployment);
  }

  mobTabsEl.querySelectorAll('[data-bs-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mobileTab = btn.getAttribute('data-bs-tab') || 'attack';
      render();
    });
  });

  const onKeyDown = (e) => {
    if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (phase === 'deploy' && (e.key === 'r' || e.key === 'R')) {
      horizontal = !horizontal;
      render();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  render();

  function restart(fromRemote = false) {
    if (aiTimer) clearTimeout(aiTimer);
    phase = 'deploy';
    turn = 1;
    winner = null;
    activeDeploySlot = 1;
    localPrivacyCurtain = false;
    mobileTab = 'attack';
    fleets = { 1: generateRandomFleet(), 2: mode === 'ai' ? generateRandomFleet() : null };
    readyFlags = { 1: false, 2: mode === 'ai' };
    shotsBy = { 1: new Map(), 2: new Map() };
    sunkOn = { 1: [], 2: [] };
    aiTargetQueue = [];
    lastShotInfo = '';
    statusText = 'Coloca tu flota y pulsa Confirmar Flota';
    render();
    if (!fromRemote && mode === 'online') sendNet?.({ kind: 'RESTART' });
  }

  return {
    onNetMessage(msg) {
      if (!msg || destroyed) return;
      if (msg.kind === 'RESTART') {
        restart(true);
        return;
      }
      if (msg.kind === 'FLEET_READY') {
        readyFlags[msg.slot] = true;
        if (msg.bothReady) {
          phase = 'combat';
          turn = msg.turn || 1;
          statusText = turn === localPlayerIndex ? '¡Combate iniciado! Tu disparo' : 'Combate iniciado · Esperando rival';
        }
        render();
        return;
      }
      if (msg.kind === 'SHOT_RESULT') {
        applyShotResult(msg);
        return;
      }
      // Static PeerJS fallback handlers
      if (msg.kind === 'P2P_FLEET_READY') {
        readyFlags[msg.slot] = true;
        if (readyFlags[1] && readyFlags[2]) {
          phase = 'combat';
          turn = 1;
          statusText = turn === localPlayerIndex ? '¡Combate iniciado! Tu disparo' : 'Esperando disparo rival';
        }
        render();
        return;
      }
      if (msg.kind === 'P2P_FIRE' && msg.by !== localPlayerIndex && !isSpectator) {
        const myFleet = fleets[localPlayerIndex] || [];
        let hitShip = null;
        for (const s of myFleet) {
          if (s.cells.some(([sr, sc]) => sr === msg.r && sc === msg.c)) {
            hitShip = s;
            break;
          }
        }
        const hit = Boolean(hitShip);
        const key = `${msg.r},${msg.c}`;
        shotsBy[msg.by].set(key, { hit });
        let sunkShip = null;
        if (hitShip && hitShip.cells.every(([sr, sc]) => shotsBy[msg.by].get(`${sr},${sc}`)?.hit)) {
          sunkShip = { id: hitShip.id, name: hitShip.name, size: hitShip.size, cells: hitShip.cells };
        }
        const winSlot = countHits(msg.by) >= 17 ? msg.by : null;
        const resultPkt = {
          kind: 'SHOT_RESULT',
          by: msg.by,
          r: msg.r,
          c: msg.c,
          hit,
          sunkShip,
          nextTurn: winSlot ? msg.by : localPlayerIndex,
          winner: winSlot
        };
        sendNet?.(resultPkt);
        applyShotResult(resultPkt);
      }
    },
    updatePlayers(nextPlayers) {
      currentPlayers = { ...nextPlayers };
      render();
    },
    getSnapshot() {
      // Never leak hidden opponent fleet in snapshot
      return {
        phase,
        turn,
        winner,
        readyFlags,
        shotsBy: {
          1: [...shotsBy[1].entries()],
          2: [...shotsBy[2].entries()]
        },
        sunkOn
      };
    },
    applySnapshot(snap) {
      if (!snap) return;
      phase = snap.phase || 'deploy';
      turn = snap.turn || 1;
      winner = snap.winner || null;
      if (snap.readyFlags) readyFlags = snap.readyFlags;
      if (snap.shotsBy) {
        shotsBy = {
          1: new Map(snap.shotsBy[1] || []),
          2: new Map(snap.shotsBy[2] || [])
        };
      }
      if (snap.sunkOn) sunkOn = snap.sunkOn;
      render();
    },
    restart,
    destroy() {
      destroyed = true;
      if (aiTimer) clearTimeout(aiTimer);
      window.removeEventListener('keydown', onKeyDown);
      mountEl.innerHTML = '';
    }
  };
}
