import { sfx } from './audio/sfx.js';
import { P2PSession, detectDeviceType, normalizeRoomCode } from './net/p2p.js';
import { buildRoomInviteUrl, renderRoomQr } from './ui/qr.js';
import { createAirHockeyGame } from './games/airHockey.js';
import { createConnectFourGame } from './games/connectFour.js';
import { createTicTacToeGame } from './games/ticTacToe.js';

const NAME_STORAGE_KEY = 'mg_player_name_v1';

const GAME_CATALOG = {
  'air-hockey': {
    title: 'Neo Air Hockey',
    create: createAirHockeyGame
  },
  'connect-four': {
    title: 'Conecta 4 Táctico',
    create: createConnectFourGame
  },
  'tic-tac-toe': {
    title: 'Tres en Raya Infinito',
    create: createTicTacToeGame
  }
};

function getInitialPlayerName() {
  const saved = localStorage.getItem(NAME_STORAGE_KEY);
  if (saved && saved.trim()) return saved.trim().slice(0, 16);
  const suffix = Math.floor(100 + Math.random() * 900);
  const generated = `Jugador ${suffix}`;
  localStorage.setItem(NAME_STORAGE_KEY, generated);
  return generated;
}

// Application State
const appState = {
  localName: getInitialPlayerName(),
  localDevice: detectDeviceType(),
  activeGameId: null,
  activeMode: null, // 'online' | 'ai' | 'local'
  gameInstance: null,
  pendingGameForModal: null,
  pendingOnlineAutoLaunchGame: null,
  sessionWins: { 1: 0, 2: 0 },
  deferredInstallPrompt: null,
  wakeLock: null
};

// DOM References
const el = {
  btnHomeBrand: document.getElementById('btn-home-brand'),
  btnInstallPwa: document.getElementById('btn-install-pwa'),
  btnFullscreen: document.getElementById('btn-fullscreen'),
  btnToggleSound: document.getElementById('btn-toggle-sound'),
  iconSoundOn: document.getElementById('icon-sound-on'),
  iconSoundOff: document.getElementById('icon-sound-off'),
  btnEditProfile: document.getElementById('btn-edit-profile'),
  labelPlayerName: document.getElementById('label-player-name'),
  labelDeviceBadge: document.getElementById('label-device-badge'),

  sessionStrip: document.getElementById('session-strip'),
  sessionStatusDot: document.getElementById('session-status-dot'),
  sessionStatusText: document.getElementById('session-status-text'),
  sessionSubtext: document.getElementById('session-subtext'),
  sessionP1Name: document.getElementById('session-p1-name'),
  sessionP2Name: document.getElementById('session-p2-name'),
  sessionP1Wins: document.getElementById('session-p1-wins'),
  sessionP2Wins: document.getElementById('session-p2-wins'),
  reactionBar: document.getElementById('reaction-bar'),
  btnOpenInvite: document.getElementById('btn-open-invite'),
  btnLeaveRoom: document.getElementById('btn-leave-room'),

  viewHub: document.getElementById('view-hub'),
  connectPanel: document.getElementById('connect-panel'),
  btnCreateRoom: document.getElementById('btn-create-room'),
  formJoinRoom: document.getElementById('form-join-room'),
  inputRoomCode: document.getElementById('input-room-code'),
  btnJoinRoom: document.getElementById('btn-join-room'),
  hubModeIndicator: document.getElementById('hub-mode-indicator'),

  viewGame: document.getElementById('view-game'),
  btnBackHub: document.getElementById('btn-back-hub'),
  stageGameTitle: document.getElementById('stage-game-title'),
  stageModeBadge: document.getElementById('stage-mode-badge'),
  btnRestartMatch: document.getElementById('btn-restart-match'),
  gameMount: document.getElementById('game-mount'),

  toastStack: document.getElementById('toast-stack'),

  modalModePicker: document.getElementById('modal-mode-picker'),
  modalModeTitle: document.getElementById('modal-mode-title'),
  modalModeSubtitle: document.getElementById('modal-mode-subtitle'),
  btnCloseModeModal: document.getElementById('btn-close-mode-modal'),
  btnModeOnline: document.getElementById('btn-mode-online'),
  btnModeAi: document.getElementById('btn-mode-ai'),
  btnModeLocal: document.getElementById('btn-mode-local'),

  modalInvite: document.getElementById('modal-invite'),
  modalInviteStatus: document.getElementById('modal-invite-status'),
  btnCloseInviteModal: document.getElementById('btn-close-invite-modal'),
  qrCanvas: document.getElementById('qr-canvas'),
  inviteRoomCode: document.getElementById('invite-room-code'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  btnCopyLink: document.getElementById('btn-copy-link'),
  btnNativeShare: document.getElementById('btn-native-share'),

  modalProfile: document.getElementById('modal-profile'),
  btnCloseProfileModal: document.getElementById('btn-close-profile-modal'),
  formProfile: document.getElementById('form-profile'),
  inputPlayerName: document.getElementById('input-player-name')
};

// Toast Notifications
function showToast(message, isReaction = false) {
  const item = document.createElement('div');
  item.className = `toast-item${isReaction ? ' reaction' : ''}`;
  item.textContent = message;
  el.toastStack.appendChild(item);

  setTimeout(() => {
    item.style.opacity = '0';
    item.style.transition = 'opacity 0.2s ease';
    setTimeout(() => item.remove(), 220);
  }, isReaction ? 2200 : 2800);
}

// Screen Wake Lock (prevents Android screen sleep during gameplay)
async function acquireWakeLock() {
  if (!('wakeLock' in navigator) || appState.wakeLock) return;
  try {
    appState.wakeLock = await navigator.wakeLock.request('screen');
    appState.wakeLock.addEventListener('release', () => {
      appState.wakeLock = null;
    });
  } catch {
    // Ignore if browser denies wake lock
  }
}

function releaseWakeLock() {
  if (appState.wakeLock) {
    appState.wakeLock.release().catch(() => {});
    appState.wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (appState.activeGameId || p2p.status !== 'idle')) {
    acquireWakeLock();
  }
});

// Build player roster object { 1: {...}, 2: {...} }
function getMatchPlayers(mode) {
  if (mode === 'online') {
    const remote = p2p.remoteProfile || { name: 'Rival', device: 'Remoto' };
    if (p2p.isHost()) {
      return {
        1: { name: appState.localName, device: appState.localDevice },
        2: { name: remote.name, device: remote.device }
      };
    }
    return {
      1: { name: remote.name, device: remote.device },
      2: { name: appState.localName, device: appState.localDevice }
    };
  }

  if (mode === 'ai') {
    return {
      1: { name: appState.localName, device: appState.localDevice },
      2: { name: 'CPU Táctica', device: 'IA' }
    };
  }

  return {
    1: { name: 'Jugador 1', device: 'Local' },
    2: { name: 'Jugador 2', device: 'Local' }
  };
}

// Initialize P2P Network Session
const p2p = new P2PSession({
  getLocalProfile: () => ({
    name: appState.localName,
    device: appState.localDevice
  }),

  onStatusChange: (info) => {
    refreshSessionUi(info);
  },

  onPeerProfile: (remote) => {
    sfx.reaction();
    showToast(`${remote.name} conectado desde ${remote.device}`);
    el.modalInvite.classList.add('hidden');
    refreshSessionUi();

    if (appState.gameInstance && appState.activeMode === 'online') {
      appState.gameInstance.updatePlayers(getMatchPlayers('online'));
    }

    // If Host was waiting to launch a specific game, or already has a game open, sync Guest!
    if (p2p.isHost()) {
      const targetGame = appState.pendingOnlineAutoLaunchGame || appState.activeGameId;
      appState.pendingOnlineAutoLaunchGame = null;
      p2p.send({
        type: 'SESSION_SYNC',
        wins: appState.sessionWins,
        activeGameId: targetGame || null
      });
      if (targetGame) {
        launchGame(targetGame, 'online', true);
      }
    }
  },

  onPingUpdate: () => {
    refreshSessionUi();
  },

  onMessage: (packet) => {
    handleNetPacket(packet);
  }
});

function handleNetPacket(packet) {
  if (!packet || typeof packet !== 'object') return;

  if (packet.type === 'SESSION_SYNC') {
    if (packet.wins) {
      appState.sessionWins = {
        1: Number(packet.wins[1]) || 0,
        2: Number(packet.wins[2]) || 0
      };
      refreshSessionUi();
    }
    if (packet.activeGameId && GAME_CATALOG[packet.activeGameId]) {
      launchGame(packet.activeGameId, 'online', true);
    }
    return;
  }

  if (packet.type === 'SELECT_GAME' && GAME_CATALOG[packet.gameId]) {
    launchGame(packet.gameId, 'online', true);
    return;
  }

  if (packet.type === 'RETURN_HUB') {
    returnToHub(true);
    showToast('Regresaron al menú de juegos');
    return;
  }

  if (packet.type === 'REACTION' && packet.text) {
    const sender = p2p.remoteProfile?.name || 'Rival';
    sfx.reaction();
    showToast(`${sender}: ${String(packet.text).slice(0, 18)}`, true);
    return;
  }

  if (packet.type === 'PEER_LEFT') {
    showToast('Tu rival se desconectó de la sala');
    if (appState.activeMode === 'online') {
      returnToHub(true);
    }
    refreshSessionUi();
    return;
  }

  if (packet.type === 'GAME_EVENT' && packet.game === appState.activeGameId) {
    appState.gameInstance?.onNetMessage?.(packet.payload);
  }
}

function refreshSessionUi() {
  const status = p2p.status;

  if (status === 'idle') {
    el.sessionStrip.classList.add('hidden');
    el.connectPanel.classList.remove('hidden');
    el.hubModeIndicator.textContent =
      'Elige un juego para jugar Online P2P, 2 jugadores en pantalla compartida o contra la IA';
    return;
  }

  el.sessionStrip.classList.remove('hidden');

  el.sessionStatusDot.className = 'status-led';
  if (status === 'connected') {
    el.sessionStatusDot.classList.add('connected');
    const remote = p2p.remoteProfile;
    el.sessionStatusText.textContent = remote
      ? `Conectado con ${remote.name} (${remote.device})`
      : 'Conectado en tiempo real';
    const pingPart = p2p.rttMs !== null ? ` · ${p2p.rttMs} ms` : '';
    el.sessionSubtext.textContent = `Sala ${p2p.roomCode} · WebRTC P2P${pingPart}`;
    el.connectPanel.classList.add('hidden');
    el.hubModeIndicator.textContent =
      'Sala P2P activa: toca cualquier juego para iniciarlo en ambos dispositivos a la vez';
  } else if (status === 'creating' || status === 'waiting' || status === 'joining') {
    el.sessionStatusDot.classList.add('waiting');
    el.sessionStatusText.textContent =
      status === 'joining'
        ? `Conectando a la sala ${p2p.roomCode}…`
        : `Esperando jugador en sala ${p2p.roomCode || '…'}`;
    el.sessionSubtext.textContent = ' Comparte el código o escanea el QR desde el otro dispositivo';
    el.connectPanel.classList.remove('hidden');
  } else {
    el.sessionStatusDot.classList.add('error');
    el.sessionStatusText.textContent = 'Sin conexión activa';
    el.sessionSubtext.textContent = p2p.roomCode ? `Sala ${p2p.roomCode}` : '';
    el.connectPanel.classList.remove('hidden');
  }

  const roster = getMatchPlayers('online');
  el.sessionP1Name.textContent = roster[1].name;
  el.sessionP2Name.textContent = roster[2].name;
  el.sessionP1Wins.textContent = String(appState.sessionWins[1] || 0);
  el.sessionP2Wins.textContent = String(appState.sessionWins[2] || 0);

  el.reactionBar.classList.toggle('hidden', !p2p.isConnected());
  el.btnOpenInvite.classList.toggle('hidden', !p2p.roomCode);
}

// Launch or Switch Active Game
function launchGame(gameId, mode, fromRemote = false) {
  const spec = GAME_CATALOG[gameId];
  if (!spec) return;

  if (appState.gameInstance) {
    appState.gameInstance.destroy();
    appState.gameInstance = null;
  }

  appState.activeGameId = gameId;
  appState.activeMode = mode;

  el.viewHub.classList.add('hidden');
  el.viewGame.classList.remove('hidden');
  el.stageGameTitle.textContent = spec.title;

  if (mode === 'online') {
    el.stageModeBadge.textContent = `P2P · Sala ${p2p.roomCode}`;
  } else if (mode === 'ai') {
    el.stageModeBadge.textContent = '1 Jugador vs IA';
  } else {
    el.stageModeBadge.textContent = '2 Jugadores Local';
  }

  const isHost = mode !== 'online' || p2p.isHost();
  const localPlayerIndex = mode === 'online' ? (p2p.isHost() ? 1 : 2) : 1;

  acquireWakeLock();

  appState.gameInstance = spec.create({
    mountEl: el.gameMount,
    mode,
    isHost,
    localPlayerIndex,
    players: getMatchPlayers(mode),
    sendNet: (payload) => {
      if (mode === 'online') {
        p2p.send({
          type: 'GAME_EVENT',
          game: gameId,
          payload
        });
      }
    },
    onMatchWin: (winnerIdx) => {
      if (mode === 'online' && (winnerIdx === 1 || winnerIdx === 2)) {
        appState.sessionWins[winnerIdx] = (appState.sessionWins[winnerIdx] || 0) + 1;
        refreshSessionUi();
      }
    },
    onRequestHub: () => {
      returnToHub(false);
    }
  });

  if (mode === 'online' && !fromRemote && p2p.isConnected()) {
    p2p.send({
      type: 'SELECT_GAME',
      gameId
    });
  }
}

function returnToHub(fromRemote = false) {
  if (appState.gameInstance) {
    appState.gameInstance.destroy();
    appState.gameInstance = null;
  }
  const wasOnline = appState.activeMode === 'online';
  appState.activeGameId = null;
  appState.activeMode = null;
  el.gameMount.innerHTML = '';

  el.viewGame.classList.add('hidden');
  el.viewHub.classList.remove('hidden');

  if (wasOnline && !fromRemote && p2p.isConnected()) {
    p2p.send({ type: 'RETURN_HUB' });
  }

  if (p2p.status === 'idle') {
    releaseWakeLock();
  }
}

// Open Invite / QR Modal
async function openInviteModal(roomCode) {
  if (!roomCode) return;
  el.inviteRoomCode.textContent = roomCode;
  el.modalInviteStatus.textContent = p2p.isConnected()
    ? 'Sala conectada · Ambos dispositivos enlazados'
    : 'Escanea el código QR desde Android o escribe el código de 5 letras';

  el.btnNativeShare.classList.toggle('hidden', typeof navigator.share !== 'function');
  el.modalInvite.classList.remove('hidden');

  try {
    await renderRoomQr(el.qrCanvas, roomCode);
  } catch {
    // QR canvas fallback handled gracefully
  }
}

async function startHostingRoom(autoGameId = null) {
  try {
    el.btnCreateRoom.disabled = true;
    appState.sessionWins = { 1: 0, 2: 0 };
    appState.pendingOnlineAutoLaunchGame = autoGameId;
    acquireWakeLock();
    const code = await p2p.createRoom();
    await openInviteModal(code);
  } catch (err) {
    showToast(err.message || 'No se pudo crear la sala');
  } finally {
    el.btnCreateRoom.disabled = false;
  }
}

async function joinExistingRoom(rawCode) {
  const code = normalizeRoomCode(rawCode);
  if (code.length !== 5) {
    showToast('Escribe los 5 caracteres del código de sala');
    el.inputRoomCode.focus();
    return;
  }
  try {
    el.btnJoinRoom.disabled = true;
    appState.sessionWins = { 1: 0, 2: 0 };
    acquireWakeLock();
    await p2p.joinRoom(code);
    el.inputRoomCode.value = '';
  } catch (err) {
    showToast(err.message || 'No se pudo entrar a la sala');
  } finally {
    el.btnJoinRoom.disabled = false;
  }
}

// Event Bindings
function bindUiEvents() {
  // Profile UI init
  el.labelPlayerName.textContent = appState.localName;
  el.labelDeviceBadge.textContent = appState.localDevice;
  updateSoundIcon();

  el.btnHomeBrand.addEventListener('click', () => {
    sfx.click();
    if (appState.activeGameId) {
      returnToHub(false);
    }
  });

  el.btnBackHub.addEventListener('click', () => {
    sfx.click();
    returnToHub(false);
  });

  el.btnRestartMatch.addEventListener('click', () => {
    sfx.click();
    appState.gameInstance?.restart?.(false);
  });

  // Sound toggle
  el.btnToggleSound.addEventListener('click', () => {
    const muted = sfx.toggleMuted();
    updateSoundIcon();
    if (!muted) sfx.click();
    showToast(muted ? 'Sonido silenciado' : 'Sonido activado');
  });

  // Fullscreen toggle
  el.btnFullscreen.addEventListener('click', async () => {
    sfx.click();
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      showToast('Usa "Instalar App" o "Añadir a pantalla de inicio" para pantalla completa');
    }
  });

  // Profile Modal
  el.btnEditProfile.addEventListener('click', () => {
    sfx.click();
    el.inputPlayerName.value = appState.localName;
    el.modalProfile.classList.remove('hidden');
    setTimeout(() => el.inputPlayerName.select(), 40);
  });

  el.btnCloseProfileModal.addEventListener('click', () => {
    el.modalProfile.classList.add('hidden');
  });

  el.formProfile.addEventListener('submit', (e) => {
    e.preventDefault();
    const clean = el.inputPlayerName.value.trim().slice(0, 16);
    if (!clean) return;
    appState.localName = clean;
    localStorage.setItem(NAME_STORAGE_KEY, clean);
    el.labelPlayerName.textContent = clean;
    el.modalProfile.classList.add('hidden');
    sfx.click();
    p2p.broadcastProfileUpdate();
    refreshSessionUi();
    if (appState.gameInstance && appState.activeMode) {
      appState.gameInstance.updatePlayers(getMatchPlayers(appState.activeMode));
    }
    showToast(`Apodo actualizado: ${clean}`);
  });

  // Create & Join P2P Room
  el.btnCreateRoom.addEventListener('click', () => {
    sfx.ensureContext();
    sfx.click();
    startHostingRoom(null);
  });

  el.inputRoomCode.addEventListener('input', () => {
    el.inputRoomCode.value = normalizeRoomCode(el.inputRoomCode.value);
  });

  el.formJoinRoom.addEventListener('submit', (e) => {
    e.preventDefault();
    sfx.ensureContext();
    sfx.click();
    joinExistingRoom(el.inputRoomCode.value);
  });

  // Session Strip Controls
  el.btnOpenInvite.addEventListener('click', () => {
    sfx.click();
    openInviteModal(p2p.roomCode);
  });

  el.btnLeaveRoom.addEventListener('click', () => {
    sfx.click();
    if (appState.activeMode === 'online') {
      returnToHub(true);
    }
    p2p.leave();
    releaseWakeLock();
    showToast('Saliste de la sala P2P');
  });

  el.reactionBar.querySelectorAll('[data-react]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-react');
      if (!text || !p2p.isConnected()) return;
      sfx.click();
      p2p.send({ type: 'REACTION', text });
      showToast(`Tú: ${text}`, true);
    });
  });

  // Invite Modal Actions
  el.btnCloseInviteModal.addEventListener('click', () => {
    el.modalInvite.classList.add('hidden');
  });

  el.btnCopyCode.addEventListener('click', async () => {
    if (!p2p.roomCode) return;
    sfx.click();
    try {
      await navigator.clipboard.writeText(p2p.roomCode);
      showToast(`Código ${p2p.roomCode} copiado`);
    } catch {
      showToast(`Código: ${p2p.roomCode}`);
    }
  });

  el.btnCopyLink.addEventListener('click', async () => {
    if (!p2p.roomCode) return;
    sfx.click();
    const url = buildRoomInviteUrl(p2p.roomCode);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Enlace de invitación copiado');
    } catch {
      showToast(url);
    }
  });

  el.btnNativeShare.addEventListener('click', async () => {
    if (!p2p.roomCode || typeof navigator.share !== 'function') return;
    sfx.click();
    const url = buildRoomInviteUrl(p2p.roomCode);
    try {
      await navigator.share({
        title: 'Mini-Games · Sala Crossplay',
        text: `Únete a mi partida (PC ↔ Android) con el código ${p2p.roomCode}:`,
        url
      });
    } catch {
      // User cancelled share sheet
    }
  });

  // Game Cards Click -> If P2P connected, launch immediately for both! Otherwise open Mode Picker
  document.querySelectorAll('[data-game]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sfx.ensureContext();
      sfx.click();
      const gameId = btn.getAttribute('data-game');
      if (!GAME_CATALOG[gameId]) return;

      if (p2p.isConnected()) {
        launchGame(gameId, 'online', false);
        return;
      }

      if (p2p.status === 'waiting' && p2p.roomCode) {
        appState.pendingOnlineAutoLaunchGame = gameId;
        openInviteModal(p2p.roomCode);
        showToast(`${GAME_CATALOG[gameId].title} iniciará en cuanto entre tu rival`);
        return;
      }

      appState.pendingGameForModal = gameId;
      el.modalModeTitle.textContent = GAME_CATALOG[gameId].title;
      el.modalModeSubtitle.textContent = 'Selecciona cómo quieres jugar esta partida';
      el.modalModePicker.classList.remove('hidden');
    });
  });

  // Mode Picker Modal Buttons
  el.btnCloseModeModal.addEventListener('click', () => {
    el.modalModePicker.classList.add('hidden');
  });

  el.btnModeOnline.addEventListener('click', () => {
    sfx.click();
    const gameId = appState.pendingGameForModal;
    el.modalModePicker.classList.add('hidden');
    if (gameId) {
      startHostingRoom(gameId);
    }
  });

  el.btnModeAi.addEventListener('click', () => {
    sfx.click();
    const gameId = appState.pendingGameForModal;
    el.modalModePicker.classList.add('hidden');
    if (gameId) {
      launchGame(gameId, 'ai', false);
    }
  });

  el.btnModeLocal.addEventListener('click', () => {
    sfx.click();
    const gameId = appState.pendingGameForModal;
    el.modalModePicker.classList.add('hidden');
    if (gameId) {
      launchGame(gameId, 'local', false);
    }
  });

  // Close modals on backdrop click or Escape
  [el.modalModePicker, el.modalInvite, el.modalProfile].forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.add('hidden');
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      el.modalModePicker.classList.add('hidden');
      el.modalInvite.classList.add('hidden');
      el.modalProfile.classList.add('hidden');
    }
  });

  // PWA Install Prompt (Android Chrome / Desktop Edge & Chrome)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    appState.deferredInstallPrompt = e;
    el.btnInstallPwa.classList.remove('hidden');
  });

  el.btnInstallPwa.addEventListener('click', async () => {
    if (!appState.deferredInstallPrompt) return;
    sfx.click();
    appState.deferredInstallPrompt.prompt();
    const choice = await appState.deferredInstallPrompt.userChoice;
    if (choice?.outcome === 'accepted') {
      el.btnInstallPwa.classList.add('hidden');
      showToast('Instalando Mini-Games…');
    }
    appState.deferredInstallPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    el.btnInstallPwa.classList.add('hidden');
    appState.deferredInstallPrompt = null;
  });
}

function updateSoundIcon() {
  el.iconSoundOn.classList.toggle('hidden', sfx.muted);
  el.iconSoundOff.classList.toggle('hidden', !sfx.muted);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

function checkAutoJoinUrlParam() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = normalizeRoomCode(params.get('room'));
  if (roomParam.length === 5) {
    // Clean URL query parameter so page reloads stay clean
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    el.inputRoomCode.value = roomParam;
    setTimeout(() => {
      joinExistingRoom(roomParam);
    }, 180);
  }
}

// Boot
bindUiEvents();
registerServiceWorker();
checkAutoJoinUrlParam();
