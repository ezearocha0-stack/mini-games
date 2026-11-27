import { sfx } from './audio/sfx.js';
import { P2PSession, normalizeRoomCode } from './net/p2p.js';
import { VoiceEngine } from './net/voice.js';
import { buildRoomInviteUrl, renderRoomQr } from './ui/qr.js';
import { initViewportManager, toggleAppFullscreen } from './ui/viewport.js';
import { getGameById, isPlayableGame } from './games/registry.js';
import { store } from './state/store.js';
import { initNavigation, navigateTo, getSectionMeta } from './ui/navigation.js';
import {
  escapeHtml,
  renderAvatarHtml,
  formatPresenceLabel
} from './ui/escape.js';
import { applySettingsToDocument, updateSettings } from './services/settingsService.js';
import {
  bootstrapSession,
  updateProfile,
  logoutAccount,
  fetchSessions,
  revokeSession,
  changePassword
} from './services/authService.js';
import { apiRequest } from './services/apiClient.js';

import { renderHomeView } from './ui/views/homeView.js';
import { renderGamesView, setGamesFilter, setGamesSearch } from './ui/views/gamesView.js';
import { renderPlayView, setPlaySelectedGame } from './ui/views/playView.js';
import { renderRoomsView } from './ui/views/roomsView.js';
import { renderFriendsView, setFriendsTab, setFriendSearchState } from './ui/views/friendsView.js';
import { renderMessagesView } from './ui/views/messagesView.js';
import { renderRankingView } from './ui/views/rankingView.js';
import { renderProfileView } from './ui/views/profileView.js';
import { renderSettingsView, setLoadedSessions } from './ui/views/settingsView.js';

import { createAuthModalController } from './ui/components/authModal.js';
import { createNotificationCenter } from './ui/components/notificationCenter.js';
import { createMatchChatController } from './ui/components/matchChat.js';
import { renderVoiceBarHtml } from './ui/components/voiceBar.js';

let activeGameInstance = null;
let pendingGameForModal = null;
let pendingOnlineAutoLaunchGame = null;
let deferredInstallPrompt = null;
let waitingSwRegistration = null;
let wakeLock = null;
let micTestCleanup = null;

const el = {
  pcSidebar: document.getElementById('pc-sidebar'),
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  btnSidebarCreateRoom: document.getElementById('btn-sidebar-create-room'),
  sidebarUserCard: document.getElementById('sidebar-user-card'),
  sidebarUserAvatar: document.getElementById('sidebar-user-avatar'),
  sidebarUserName: document.getElementById('sidebar-user-name'),
  sidebarUserSub: document.getElementById('sidebar-user-sub'),
  btnHomeBrand: document.getElementById('btn-home-brand'),
  btnMobileBrand: document.getElementById('btn-mobile-brand'),

  topbarViewTitle: document.getElementById('topbar-view-title'),
  btnInstallPwa: document.getElementById('btn-install-pwa'),
  btnOpenNotifications: document.getElementById('btn-open-notifications'),
  badgeNotifCount: document.getElementById('badge-notif-count'),
  btnFullscreen: document.getElementById('btn-fullscreen'),
  btnToggleSound: document.getElementById('btn-toggle-sound'),
  iconSoundOn: document.getElementById('icon-sound-on'),
  iconSoundOff: document.getElementById('icon-sound-off'),
  btnToggleSocialRail: document.getElementById('btn-toggle-social-rail'),
  btnProfileChip: document.getElementById('btn-profile-chip'),
  topbarAvatar: document.getElementById('topbar-avatar'),
  labelPlayerName: document.getElementById('label-player-name'),

  systemBanner: document.getElementById('system-banner'),
  systemBannerText: document.getElementById('system-banner-text'),
  btnSystemBannerAction: document.getElementById('btn-system-banner-action'),

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

  viewContainer: document.getElementById('view-container'),
  pcSocialRail: document.getElementById('pc-social-rail'),

  viewGame: document.getElementById('view-game'),
  btnBackHub: document.getElementById('btn-back-hub'),
  stageGameTitle: document.getElementById('stage-game-title'),
  stageModeBadge: document.getElementById('stage-mode-badge'),
  stageMiniReactions: document.getElementById('stage-mini-reactions'),
  btnStageFullscreen: document.getElementById('btn-stage-fullscreen'),
  btnRestartMatch: document.getElementById('btn-restart-match'),
  stageVoiceSlot: document.getElementById('stage-voice-slot'),
  gameMount: document.getElementById('game-mount'),

  badgeNavFriends: document.getElementById('badge-nav-friends'),
  badgeNavMessages: document.getElementById('badge-nav-messages'),
  badgeMobMessages: document.getElementById('badge-mob-messages'),
  badgeMobMore: document.getElementById('badge-mob-more'),
  btnMobileMore: document.getElementById('btn-mobile-more'),
  modalMobileMore: document.getElementById('modal-mobile-more'),
  btnCloseMobileMore: document.getElementById('btn-close-mobile-more'),
  btnMoreCreateRoom: document.getElementById('btn-more-create-room'),

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

  modalGroup: document.getElementById('modal-group'),
  btnCloseGroupModal: document.getElementById('btn-close-group-modal'),
  modalGroupBody: document.getElementById('modal-group-body'),

  modalVoiceDevices: document.getElementById('modal-voice-devices'),
  btnCloseVoiceDev: document.getElementById('btn-close-voice-dev'),
  modalVoiceDevBody: document.getElementById('modal-voice-dev-body'),

  toastStack: document.getElementById('toast-stack')
};

function showToast(message, isReaction = false) {
  const item = document.createElement('div');
  item.className = `toast-item${isReaction ? ' reaction' : ''}`;
  item.textContent = message;
  el.toastStack?.appendChild(item);
  setTimeout(
    () => {
      item.style.opacity = '0';
      item.style.transition = 'opacity 0.2s ease';
      setTimeout(() => item.remove(), 220);
    },
    isReaction ? 2100 : 2800
  );
}

async function acquireWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {}
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

function getMatchPlayers(mode) {
  const id = store.getLocalIdentity();
  if (mode === 'online') {
    const remote = p2p.remoteProfile || { name: 'Rival', device: 'Remoto' };
    if (p2p.isHost()) {
      return {
        1: { name: id.name, device: id.device },
        2: { name: remote.name, device: remote.device }
      };
    }
    return {
      1: { name: remote.name, device: remote.device },
      2: { name: id.name, device: id.device }
    };
  }
  if (mode === 'ai') {
    return {
      1: { name: id.name, device: id.device },
      2: { name: 'CPU Táctica', device: 'IA' }
    };
  }
  return {
    1: { name: 'Jugador 1', device: 'Local' },
    2: { name: 'Jugador 2', device: 'Local' }
  };
}

// Controllers
const matchChat = createMatchChatController({
  store,
  showToast,
  onSendMatchChat: (text) => {
    const id = store.getLocalIdentity();
    const packet = {
      type: 'ROOM_CHAT',
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderId: id.id,
      senderName: id.name,
      text,
      createdAt: new Date().toISOString()
    };
    matchChat.appendMessage(packet);
    p2p.send(packet);
  }
});

const voice = new VoiceEngine({
  store,
  showToast,
  sendVoiceSignal: (signal) => {
    if (p2p.ws && p2p.ws.readyState === WebSocket.OPEN) {
      p2p.ws.send(JSON.stringify({ sys: 'VOICE_SIGNAL', signal }));
    } else {
      p2p.send({ type: 'VOICE_SIGNAL', signal });
    }
  }
});

const notifications = createNotificationCenter({
  store,
  showToast,
  onJoinRoomCode: (code) => joinExistingRoom(code),
  onOpenFriends: () => navigateTo('amigos'),
  onOpenConversation: (convId) => {
    openConversation(convId);
    navigateTo('mensajes');
  }
});

const authModal = createAuthModalController({
  store,
  showToast,
  onAuthenticated: async () => {
    await refreshSocialData();
    syncWsIdentity();
    connectPresenceSocket();
  }
});

let presenceWs = null;
const typingTimers = new Map();
let lastTypingSentAt = 0;

function handleSystemEvent(evt) {
  if (!evt || typeof evt !== 'object') return;

  if (evt.sys === 'NOTIFICATION' && evt.notification) {
    notifications.pushLocalNotification(evt.notification);
    sfx.notification();
    showToast(evt.notification.title);
    if (evt.notification.type === 'friend_request' || evt.notification.type === 'friend_accept') {
      refreshSocialData();
    }
    return;
  }

  if (evt.sys === 'PRESENCE_UPDATE' && evt.userId) {
    const friends = store.getState().friends;
    const accepted = (friends.accepted || []).map((f) =>
      f.id === evt.userId ? { ...f, presence: evt.presence, activity: evt.activity } : f
    );
    store.setState({ friends: { ...friends, accepted } });
    return;
  }

  if (evt.sys === 'CHAT_MESSAGE' && evt.message) {
    const m = evt.message;
    const cid = m.conversationId;
    const st = store.getState();
    const existing = st.messagesByConv[cid] || [];
    if (!existing.some((x) => x.id === m.id)) {
      const nextMsgs = [...existing, m];
      const nextConvs = (st.conversations || []).map((c) => {
        if (c.id !== cid) return c;
        const isReading = st.activeSection === 'mensajes' && st.activeConversationId === cid;
        return {
          ...c,
          lastMessage: m.body,
          updatedAt: m.createdAt,
          unreadCount: isReading ? 0 : (c.unreadCount || 0) + 1
        };
      });
      store.setState({
        messagesByConv: { ...st.messagesByConv, [cid]: nextMsgs },
        conversations: nextConvs
      });
    }
    return;
  }

  if (evt.sys === 'CHAT_TYPING' && evt.conversationId && evt.username) {
    const cid = evt.conversationId;
    const prev = store.getState().typingByConv || {};
    const list = new Set(prev[cid] || []);
    list.add(evt.username);
    store.setState({ typingByConv: { ...prev, [cid]: [...list] } });
    const key = `${cid}:${evt.userId}`;
    clearTimeout(typingTimers.get(key));
    typingTimers.set(
      key,
      setTimeout(() => {
        const cur = store.getState().typingByConv || {};
        const nextList = (cur[cid] || []).filter((n) => n !== evt.username);
        store.setState({ typingByConv: { ...cur, [cid]: nextList } });
      }, 3200)
    );
    return;
  }

  if (evt.sys === 'KICKED') {
    if (store.getState().gameSession.activeMode === 'online') {
      returnToHub(true);
    }
    showToast(evt.message || 'Fuiste expulsado de la sala');
  }
}

function connectPresenceSocket() {
  if (!store.getState().user) return;
  if (presenceWs && (presenceWs.readyState === WebSocket.OPEN || presenceWs.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    presenceWs = ws;
    ws.addEventListener('open', () => {
      const token = localStorage.getItem('mg_session_token_v1') || '';
      ws.send(JSON.stringify({ sys: 'AUTH_HELLO', token, profile: store.getLocalIdentity() }));
      ws.send(JSON.stringify({ sys: 'SET_PRESENCE', status: store.getState().presenceStatus || 'online' }));
    });
    ws.addEventListener('message', (ev) => {
      try {
        handleSystemEvent(JSON.parse(ev.data));
      } catch {}
    });
    ws.addEventListener('close', () => {
      if (presenceWs === ws) presenceWs = null;
    });
  } catch {}
}

function disconnectPresenceSocket() {
  if (presenceWs) {
    try {
      presenceWs.close();
    } catch {}
    presenceWs = null;
  }
}

const p2p = new P2PSession({
  getLocalProfile: () => store.getLocalIdentity(),

  onSystemEvent: (evt) => handleSystemEvent(evt),

  onStatusChange: (info) => {
    const prevRoom = store.getState().room;
    store.setState({
      room: {
        ...prevRoom,
        status: info.status,
        role: info.role || prevRoom.role,
        code: info.roomCode || null,
        rttMs: info.rttMs ?? null,
        transport: info.transport || null
      }
    });
    if (info.status === 'idle') {
      voice.leave();
      matchChat.clearMessages();
    }
    refreshHeaderAndRoomUi();
  },

  onPeerProfile: (remote) => {
    sfx.reaction();
    showToast(`${remote.name} conectado desde ${remote.device}`);
    el.modalInvite.classList.add('hidden');
    refreshHeaderAndRoomUi();

    if (activeGameInstance && store.getState().gameSession.activeMode === 'online') {
      activeGameInstance.updatePlayers(getMatchPlayers('online'));
    }

    if (p2p.isHost()) {
      const st = store.getState();
      const autoGame = pendingOnlineAutoLaunchGame;
      pendingOnlineAutoLaunchGame = null;
      const syncGame = autoGame || st.gameSession.activeGameId || null;
      p2p.send({
        type: 'SESSION_SYNC',
        wins: st.gameSession.sessionWins,
        activeGameId: syncGame,
        snapshot: activeGameInstance?.getSnapshot?.() || null
      });
      if (autoGame && !st.gameSession.activeGameId) {
        launchGame(autoGame, 'online', true);
      }
    }
  },

  onPingUpdate: (rttMs) => {
    store.setState({
      room: { ...store.getState().room, rttMs }
    });
    updateStageBadge();
    refreshSessionStrip();
  },

  onMessage: (packet) => handleNetPacket(packet)
});

function syncWsIdentity() {
  const token = localStorage.getItem('mg_session_token_v1') || '';
  if (p2p.ws && p2p.ws.readyState === WebSocket.OPEN) {
    p2p.ws.send(
      JSON.stringify({
        sys: 'AUTH_HELLO',
        token,
        profile: store.getLocalIdentity()
      })
    );
  }
}

function handleNetPacket(packet) {
  if (!packet || typeof packet !== 'object') return;

  if (packet.type === 'ROOM_STATE') {
    store.setState({
      room: {
        ...store.getState().room,
        ...packet.room,
        members: packet.members || store.getState().room.members
      }
    });
    renderActiveSection();
    return;
  }

  if (packet.type === 'SESSION_SYNC') {
    if (packet.wins) {
      store.setState({
        gameSession: {
          ...store.getState().gameSession,
          sessionWins: {
            1: Number(packet.wins[1]) || 0,
            2: Number(packet.wins[2]) || 0
          }
        }
      });
      refreshSessionStrip();
    }
    if (packet.activeGameId && isPlayableGame(packet.activeGameId)) {
      launchGame(packet.activeGameId, 'online', true);
      if (packet.snapshot && activeGameInstance?.applySnapshot) {
        setTimeout(() => activeGameInstance?.applySnapshot?.(packet.snapshot), 40);
      }
    }
    return;
  }

  if (packet.type === 'SELECT_GAME' && isPlayableGame(packet.gameId)) {
    launchGame(packet.gameId, 'online', true);
    return;
  }

  if (packet.type === 'RETURN_HUB') {
    returnToHub(true);
    showToast('Regresaron al lobby de sala');
    return;
  }

  if (packet.type === 'REACTION' && packet.text) {
    const sender = p2p.remoteProfile?.name || 'Rival';
    sfx.reaction();
    showToast(`${sender}: ${String(packet.text).slice(0, 18)}`, true);
    return;
  }

  if (packet.type === 'ROOM_CHAT') {
    matchChat.appendMessage(packet);
    return;
  }

  if (packet.type === 'VOICE_SIGNAL') {
    voice.handleSignal(packet.fromId || 'peer', packet.signal);
    return;
  }

  if (packet.type === 'PEER_LEFT') {
    showToast('Tu rival se desconectó de la sala');
    if (store.getState().gameSession.activeMode === 'online') {
      returnToHub(true);
    }
    refreshHeaderAndRoomUi();
    return;
  }

  if (packet.type === 'GAME_EVENT' && packet.game === store.getState().gameSession.activeGameId) {
    activeGameInstance?.onNetMessage?.(packet.payload);
  }
}

function updateStageBadge() {
  const gs = store.getState().gameSession;
  if (!gs.activeGameId) return;
  if (gs.activeMode === 'online') {
    const pingPart = p2p.rttMs !== null ? ` · ${p2p.rttMs}ms` : '';
    const specPart = gs.isSpectator ? ' · Espectador' : '';
    el.stageModeBadge.textContent = `${p2p.roomCode || 'P2P'}${pingPart}${specPart}`;
  } else if (gs.activeMode === 'ai') {
    el.stageModeBadge.textContent = 'vs IA';
  } else {
    el.stageModeBadge.textContent = '2J Local';
  }
}

function launchGame(gameId, mode, fromRemote = false) {
  const spec = getGameById(gameId);
  if (!spec || spec.status !== 'active' || !spec.create) return;

  if (activeGameInstance) {
    activeGameInstance.destroy();
    activeGameInstance = null;
  }

  const isSpectator = mode === 'online' && store.getState().room.role === 'spectator';
  const isHost = mode !== 'online' || p2p.isHost();
  const localPlayerIndex = mode === 'online' ? (p2p.isHost() ? 1 : 2) : 1;

  store.setState({
    gameSession: {
      ...store.getState().gameSession,
      activeGameId: gameId,
      activeMode: mode,
      isSpectator
    }
  });

  document.body.classList.add('in-game');
  el.viewGame.classList.remove('hidden');
  el.stageGameTitle.textContent = spec.title;
  updateStageBadge();
  el.stageMiniReactions?.classList.toggle('hidden', !(mode === 'online' && p2p.isConnected() && !isSpectator));
  el.btnRestartMatch.classList.toggle('hidden', isSpectator);
  matchChat.syncVisibility();

  if (el.stageVoiceSlot) {
    el.stageVoiceSlot.innerHTML = mode === 'online' ? renderVoiceBarHtml(store.getState()) : '';
  }

  acquireWakeLock();

  activeGameInstance = spec.create({
    mountEl: el.gameMount,
    mode,
    isHost,
    isSpectator,
    controlSensitivity: store.getState().settings.airHockeySensitivity || 1,
    localPlayerIndex,
    players: getMatchPlayers(mode),
    sendNet: (payload) => {
      if (mode === 'online' && !isSpectator) {
        p2p.send({
          type: 'GAME_EVENT',
          game: gameId,
          payload
        });
      }
    },
    sendFastNet: (payload) => {
      if (mode === 'online' && !isSpectator) {
        p2p.sendFast({
          type: 'GAME_EVENT',
          game: gameId,
          payload
        });
      }
    },
    onMatchWin: (winnerIdx) => {
      if (mode === 'online' && (winnerIdx === 1 || winnerIdx === 2)) {
        const prevWins = store.getState().gameSession.sessionWins;
        store.setState({
          gameSession: {
            ...store.getState().gameSession,
            sessionWins: {
              ...prevWins,
              [winnerIdx]: (prevWins[winnerIdx] || 0) + 1
            }
          }
        });
        refreshSessionStrip();
        if (store.getState().user) {
          setTimeout(() => bootstrapSession(), 500);
        }
      }
    },
    onRequestHub: () => returnToHub(false)
  });

  if (mode === 'online' && !fromRemote && p2p.isConnected() && !isSpectator) {
    p2p.send({
      type: 'SELECT_GAME',
      gameId
    });
  }
}

function returnToHub(fromRemote = false) {
  if (activeGameInstance) {
    activeGameInstance.destroy();
    activeGameInstance = null;
  }
  const prev = store.getState().gameSession;
  const wasOnline = prev.activeMode === 'online';
  store.setState({
    gameSession: {
      ...prev,
      activeGameId: null,
      activeMode: null,
      isSpectator: false
    }
  });
  el.gameMount.innerHTML = '';
  document.body.classList.remove('in-game');
  el.viewGame.classList.add('hidden');
  matchChat.syncVisibility();

  if (wasOnline && !fromRemote && p2p.isConnected() && prev.isSpectator !== true) {
    p2p.send({ type: 'RETURN_HUB' });
  }
  if (p2p.status === 'idle') {
    releaseWakeLock();
  }
  renderActiveSection();
}

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
  } catch {}
}

async function startHostingRoom(autoGameId = null, options = {}) {
  try {
    store.setState({
      gameSession: { ...store.getState().gameSession, sessionWins: { 1: 0, 2: 0 } },
      room: {
        ...store.getState().room,
        visibility: options.visibility || 'private',
        title: options.title || '',
        gameId: autoGameId || options.gameId || 'air-hockey',
        maxMembers: Number(options.maxMembers) || 2,
        allowSpectators: options.allowSpectators !== false
      }
    });
    pendingOnlineAutoLaunchGame = autoGameId;
    acquireWakeLock();
    const code = await p2p.createRoom(null, options);
    await openInviteModal(code);
    refreshPublicRooms();
  } catch (err) {
    showToast(err.message || 'No se pudo crear la sala');
  }
}

async function joinExistingRoom(rawCode) {
  const code = normalizeRoomCode(rawCode);
  if (code.length !== 5) {
    showToast('Escribe los 5 caracteres del código de sala');
    return;
  }
  try {
    store.setState({
      gameSession: { ...store.getState().gameSession, sessionWins: { 1: 0, 2: 0 } }
    });
    acquireWakeLock();
    await p2p.joinRoom(code);
    navigateTo('salas');
  } catch (err) {
    showToast(err.message || 'No se pudo entrar a la sala');
  }
}

function handlePlayRequest(gameId, explicitMode = null) {
  if (!isPlayableGame(gameId)) return;
  if (explicitMode) {
    if (explicitMode === 'online') {
      if (p2p.isConnected()) {
        launchGame(gameId, 'online', false);
      } else {
        startHostingRoom(gameId);
      }
      return;
    }
    launchGame(gameId, explicitMode, false);
    return;
  }

  if (p2p.isConnected()) {
    launchGame(gameId, 'online', false);
    return;
  }
  if (p2p.status === 'waiting' && p2p.roomCode) {
    pendingOnlineAutoLaunchGame = gameId;
    openInviteModal(p2p.roomCode);
    showToast(`${getGameById(gameId)?.title} iniciará cuando entre tu rival`);
    return;
  }

  pendingGameForModal = gameId;
  el.modalModeTitle.textContent = getGameById(gameId)?.title || 'Jugar';
  el.modalModeSubtitle.textContent = 'Selecciona cómo quieres jugar esta partida';
  el.modalModePicker.classList.remove('hidden');
}

function refreshSessionStrip() {
  const status = p2p.status;
  updateStageBadge();
  el.stageMiniReactions?.classList.toggle(
    'hidden',
    !(store.getState().gameSession.activeMode === 'online' && p2p.isConnected())
  );

  if (status === 'idle') {
    el.sessionStrip.classList.add('hidden');
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
    const modeLabel = p2p.hasDirectUdpFastLane() ? 'Directo UDP' : 'Tiempo real';
    const pingPart = p2p.rttMs !== null ? ` · ${p2p.rttMs} ms` : '';
    el.sessionSubtext.textContent = `Sala ${p2p.roomCode} · ${modeLabel}${pingPart}`;
  } else if (status === 'creating' || status === 'waiting' || status === 'joining' || status === 'reconnecting') {
    el.sessionStatusDot.classList.add('waiting');
    el.sessionStatusText.textContent =
      status === 'joining'
        ? `Conectando a la sala ${p2p.roomCode}…`
        : status === 'reconnecting'
          ? `Reconectando a ${p2p.roomCode}…`
          : `Esperando jugador en sala ${p2p.roomCode || '…'}`;
    el.sessionSubtext.textContent = 'Comparte el código o escanea el QR';
  } else {
    el.sessionStatusDot.classList.add('error');
    el.sessionStatusText.textContent = 'Sin conexión activa';
    el.sessionSubtext.textContent = p2p.roomCode ? `Sala ${p2p.roomCode}` : '';
  }

  const roster = getMatchPlayers('online');
  const wins = store.getState().gameSession.sessionWins;
  el.sessionP1Name.textContent = roster[1].name;
  el.sessionP2Name.textContent = roster[2].name;
  el.sessionP1Wins.textContent = String(wins[1] || 0);
  el.sessionP2Wins.textContent = String(wins[2] || 0);
  el.reactionBar.classList.toggle('hidden', !p2p.isConnected());
  el.btnOpenInvite.classList.toggle('hidden', !p2p.roomCode);
}

function refreshHeaderAndRoomUi() {
  const state = store.getState();
  const id = store.getLocalIdentity();

  if (el.labelPlayerName) el.labelPlayerName.textContent = id.name;
  if (el.topbarAvatar) {
    el.topbarAvatar.style.background = id.avatarColor;
    el.topbarAvatar.textContent = id.avatarIcon || id.name.slice(0, 2).toUpperCase();
  }
  if (el.sidebarUserName) el.sidebarUserName.textContent = id.name;
  if (el.sidebarUserSub) {
    el.sidebarUserSub.textContent = id.isAuthenticated ? `Nv.${id.level} · #${id.tag}` : `Invitado · ${id.device}`;
  }
  if (el.sidebarUserAvatar) {
    el.sidebarUserAvatar.style.background = id.avatarColor;
    el.sidebarUserAvatar.textContent = id.avatarIcon || id.name.slice(0, 2).toUpperCase();
  }

  const pendingReq = (state.friends.incoming || []).length;
  const unreadMsgs = (state.conversations || []).reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const unreadNotif = state.unreadNotifications || 0;

  el.badgeNavFriends?.classList.toggle('hidden', pendingReq === 0);
  if (el.badgeNavFriends) el.badgeNavFriends.textContent = String(pendingReq);

  el.badgeNavMessages?.classList.toggle('hidden', unreadMsgs === 0);
  if (el.badgeNavMessages) el.badgeNavMessages.textContent = String(unreadMsgs);

  el.badgeMobMessages?.classList.toggle('hidden', unreadMsgs === 0);
  if (el.badgeMobMessages) el.badgeMobMessages.textContent = String(unreadMsgs);

  el.badgeMobMore?.classList.toggle('hidden', pendingReq === 0);
  if (el.badgeMobMore) el.badgeMobMore.textContent = String(pendingReq);

  el.badgeNotifCount?.classList.toggle('hidden', unreadNotif === 0);
  if (el.badgeNotifCount) el.badgeNotifCount.textContent = String(unreadNotif);

  refreshSessionStrip();
  renderSocialRail();
  if (state.gameSession.activeMode === 'online' && el.stageVoiceSlot) {
    el.stageVoiceSlot.innerHTML = renderVoiceBarHtml(state);
  }
}

function renderSocialRail() {
  if (!el.pcSocialRail) return;
  const state = store.getState();
  el.pcSocialRail.classList.toggle('hidden-rail', !state.socialRailVisible);
  if (!state.socialRailVisible) return;

  const friends = (state.friends.accepted || []).filter((f) => f.presence !== 'offline');
  const inRoom = state.room.status !== 'idle' && state.room.code;

  el.pcSocialRail.innerHTML = `
    <div>
      <h3 class="rail-section-title">
        <span>Estado de Sala</span>
        ${inRoom ? `<span class="pill ok">${escapeHtml(state.room.code)}</span>` : ''}
      </h3>
      ${
        inRoom
          ? `<div class="surface-card soft" style="padding:11px;display:flex;flex-direction:column;gap:8px;">
               <strong style="font-size:0.86rem;">Sala ${escapeHtml(state.room.code)}</strong>
               <span style="font-size:0.76rem;color:var(--text-secondary);">
                 ${state.room.status === 'connected' ? 'Enlazada en tiempo real' : 'Esperando jugador…'}
               </span>
               <div style="display:flex;gap:6px;">
                 <button type="button" class="btn btn-secondary btn-compact" style="flex:1;" data-nav="salas">Ver Lobby</button>
                 <button type="button" class="btn btn-subtle btn-compact" data-action="open-invite-modal">QR</button>
               </div>
             </div>`
          : `<div class="surface-card soft" style="padding:11px;display:flex;flex-direction:column;gap:8px;">
               <span style="font-size:0.8rem;color:var(--text-secondary);">No estás en ninguna sala online.</span>
               <button type="button" class="btn btn-primary btn-compact" data-action="quick-create-room">+ Crear Sala</button>
             </div>`
      }
    </div>

    <div>
      <h3 class="rail-section-title">
        <span>Amigos Conectados (${friends.length})</span>
        <button type="button" class="chat-react-chip" data-nav="amigos">Ver</button>
      </h3>
      ${
        !state.user
          ? `<div class="surface-card soft" style="padding:11px;font-size:0.8rem;color:var(--text-secondary);display:flex;flex-direction:column;gap:8px;">
               <span>Inicia sesión para ver amigos conectados e invitar directo a tu sala.</span>
               <button type="button" class="btn btn-secondary btn-compact" data-open-auth="login">Entrar</button>
             </div>`
          : friends.length === 0
            ? `<span style="font-size:0.8rem;color:var(--text-muted);">Sin amigos conectados ahora mismo.</span>`
            : `<div class="list-stack">
                 ${friends
                   .map(
                     (f) => `
                   <div class="list-row" style="padding:7px 9px;">
                     <div class="list-row-left">
                       ${renderAvatarHtml({ name: f.username, color: f.avatarColor, icon: f.avatarIcon, presence: f.presence, size: 'sm' })}
                       <div class="list-row-info">
                         <span class="list-row-title" style="font-size:0.82rem;">${escapeHtml(f.username)}</span>
                         <span class="list-row-sub" style="font-size:0.7rem;">${escapeHtml(formatPresenceLabel(f.presence, f.activity))}</span>
                       </div>
                     </div>
                     <button type="button" class="chat-react-chip" data-invite-friend="${escapeHtml(f.id)}" title="Invitar a sala">+</button>
                   </div>`
                   )
                   .join('')}
               </div>`
      }
    </div>
  `;
}

function renderActiveSection() {
  const state = store.getState();
  const section = state.activeSection;
  const meta = getSectionMeta(section);

  if (el.topbarViewTitle) el.topbarViewTitle.textContent = meta.title;

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-nav') === section);
  });

  const actions = {
    getIdentity: () => store.getLocalIdentity()
  };

  let html = '';
  switch (section) {
    case 'inicio':
      html = renderHomeView(state, actions);
      break;
    case 'juegos':
      html = renderGamesView(state, actions);
      break;
    case 'jugar':
      html = renderPlayView(state, actions);
      break;
    case 'salas':
      html = renderRoomsView(state, { renderVoiceBarHtml: () => renderVoiceBarHtml(state) });
      break;
    case 'amigos':
      html = renderFriendsView(state);
      break;
    case 'mensajes':
      html = renderMessagesView(state);
      break;
    case 'ranking':
      html = renderRankingView(state);
      break;
    case 'perfil':
      html = renderProfileView(state, actions);
      break;
    case 'ajustes':
      html = renderSettingsView(state);
      break;
    default:
      html = renderHomeView(state, actions);
  }

  if (el.viewContainer) {
    el.viewContainer.innerHTML = html;
  }

  if (section === 'mensajes') {
    const sc = document.getElementById('dm-messages-scroll');
    if (sc) sc.scrollTop = sc.scrollHeight;
  }
}

async function refreshPublicRooms() {
  try {
    const data = await apiRequest('/api/rooms/public');
    store.setState({ publicRooms: Array.isArray(data.rooms) ? data.rooms : [] });
  } catch {}
}

async function refreshSocialData() {
  if (!store.getState().user) return;
  try {
    const [friendsRes, convRes] = await Promise.all([
      apiRequest('/api/friends'),
      apiRequest('/api/conversations')
    ]);
    store.setState({
      friends: friendsRes,
      conversations: Array.isArray(convRes.conversations) ? convRes.conversations : []
    });
    await notifications.refreshFromServer();
  } catch {}
}

async function refreshRankings(game = store.getState().rankings.game || 'global') {
  store.setState({ rankings: { ...store.getState().rankings, game, loading: true } });
  try {
    const [lbRes, histRes] = await Promise.all([
      apiRequest(`/api/rankings?game=${encodeURIComponent(game)}`),
      store.getState().user ? apiRequest('/api/matches/history') : Promise.resolve({ history: [] })
    ]);
    store.setState({
      rankings: {
        game,
        leaderboard: lbRes.leaderboard || [],
        myHistory: histRes.history || [],
        loading: false
      }
    });
  } catch {
    store.setState({
      rankings: { ...store.getState().rankings, loading: false }
    });
  }
}

async function openConversation(convId) {
  store.setState({ activeConversationId: convId });
  try {
    const data = await apiRequest(`/api/conversations/${encodeURIComponent(convId)}/messages`);
    const nextMap = { ...store.getState().messagesByConv, [convId]: data.messages || [] };
    const nextConvs = (store.getState().conversations || []).map((c) =>
      c.id === convId ? { ...c, unreadCount: 0 } : c
    );
    store.setState({ messagesByConv: nextMap, conversations: nextConvs });
    await apiRequest(`/api/conversations/${encodeURIComponent(convId)}/read`, { method: 'POST' });
  } catch {}
  renderActiveSection();
}

async function openVoiceDevicesModal() {
  if (!el.modalVoiceDevices || !el.modalVoiceDevBody) return;
  const s = store.getState().settings;
  let inputs = [];
  let outputs = [];
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    inputs = devs.filter((d) => d.kind === 'audioinput');
    outputs = devs.filter((d) => d.kind === 'audiooutput');
  } catch {}

  el.modalVoiceDevBody.innerHTML = `
    <div class="form-stack">
      <div>
        <label class="field-label" for="sel-voice-mic">Micrófono</label>
        <select id="sel-voice-mic" class="select-input">
          <option value="default">Predeterminado del sistema</option>
          ${inputs
            .map(
              (d, i) =>
                `<option value="${escapeHtml(d.deviceId)}" ${s.micDeviceId === d.deviceId ? 'selected' : ''}>${escapeHtml(d.label || `Micrófono ${i + 1}`)}</option>`
            )
            .join('')}
        </select>
      </div>
      <div>
        <label class="field-label" for="sel-voice-spk">Altavoces / Auriculares</label>
        <select id="sel-voice-spk" class="select-input">
          <option value="default">Predeterminado del sistema</option>
          ${outputs
            .map(
              (d, i) =>
                `<option value="${escapeHtml(d.deviceId)}" ${s.speakerDeviceId === d.deviceId ? 'selected' : ''}>${escapeHtml(d.label || `Salida ${i + 1}`)}</option>`
            )
            .join('')}
        </select>
      </div>
      <button type="button" id="btn-save-voice-dev" class="btn btn-primary">Guardar dispositivos</button>
    </div>
  `;
  el.modalVoiceDevices.classList.remove('hidden');
  document.getElementById('btn-save-voice-dev')?.addEventListener('click', async () => {
    const micDeviceId = document.getElementById('sel-voice-mic')?.value || 'default';
    const speakerDeviceId = document.getElementById('sel-voice-spk')?.value || 'default';
    await updateSettings({ micDeviceId, speakerDeviceId });
    await voice.setOutputDevice(speakerDeviceId);
    el.modalVoiceDevices.classList.add('hidden');
    showToast('Dispositivos de voz actualizados');
  });
}

function openGroupModal(existingConvId = null) {
  if (!el.modalGroup || !el.modalGroupBody) return;
  const friends = store.getState().friends.accepted || [];
  const conv = existingConvId
    ? (store.getState().conversations || []).find((c) => c.id === existingConvId)
    : null;

  if (!conv) {
    el.modalGroupBody.innerHTML = `
      <form id="form-create-group" class="form-stack">
        <div>
          <label class="field-label" for="grp-title">Nombre del grupo</label>
          <input id="grp-title" name="title" class="text-input" maxlength="32" placeholder="Ej. Escuadrón Arcade" required />
        </div>
        <div>
          <span class="field-label">Añadir amigos</span>
          ${
            friends.length === 0
              ? '<span style="font-size:0.82rem;color:var(--text-muted);">Añade amigos primero para invitarlos al grupo.</span>'
              : `<div class="list-stack" style="max-height:180px;overflow-y:auto;">
                   ${friends
                     .map(
                       (f) => `
                     <label class="list-row" style="cursor:pointer;">
                       <span>${escapeHtml(f.username)} #${escapeHtml(f.tag)}</span>
                       <input type="checkbox" name="memberIds" value="${escapeHtml(f.id)}" />
                     </label>`
                     )
                     .join('')}
                 </div>`
          }
        </div>
        <button type="submit" class="btn btn-primary btn-block">Crear grupo</button>
      </form>
    `;
    el.modalGroup.classList.remove('hidden');
    document.getElementById('form-create-group')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const title = String(fd.get('title') || '').trim();
      const memberIds = fd.getAll('memberIds').map(String);
      try {
        const res = await apiRequest('/api/conversations/group', {
          method: 'POST',
          body: { title, memberIds }
        });
        el.modalGroup.classList.add('hidden');
        await refreshSocialData();
        if (res.conversation?.id) await openConversation(res.conversation.id);
        showToast('Grupo creado');
      } catch (err) {
        showToast(err.message);
      }
    });
    return;
  }

  const members = conv.members || [];
  const myId = store.getState().user?.id;
  const isOwner = conv.ownerId === myId;
  const memberIdSet = new Set(members.map((m) => m.id));
  const addable = friends.filter((f) => !memberIdSet.has(f.id));

  el.modalGroupBody.innerHTML = `
    <div class="form-stack">
      <strong>Participantes (${members.length})</strong>
      <div class="list-stack">
        ${members
          .map(
            (m) => `
          <div class="list-row">
            <span>${escapeHtml(m.username)} ${m.id === conv.ownerId ? '👑' : ''}</span>
            ${
              isOwner && m.id !== myId
                ? `<button type="button" class="btn btn-danger-ghost btn-compact" data-grp-kick="${escapeHtml(conv.id)}:${escapeHtml(m.id)}">Quitar</button>`
                : ''
            }
          </div>`
          )
          .join('')}
      </div>
      ${
        isOwner && addable.length > 0
          ? `<div style="padding-top:8px;">
               <span class="field-label">Añadir amigo al grupo</span>
               <div class="list-stack">
                 ${addable
                   .map(
                     (f) => `
                   <div class="list-row">
                     <span>${escapeHtml(f.username)}</span>
                     <button type="button" class="btn btn-primary btn-compact" data-grp-add="${escapeHtml(conv.id)}:${escapeHtml(f.id)}">Añadir</button>
                   </div>`
                   )
                   .join('')}
               </div>
             </div>`
          : ''
      }
    </div>
  `;
  el.modalGroup.classList.remove('hidden');

  el.modalGroupBody.querySelectorAll('[data-grp-kick]').forEach((b) => {
    b.addEventListener('click', async () => {
      const [cid, uid] = b.getAttribute('data-grp-kick').split(':');
      try {
        await apiRequest(`/api/conversations/${encodeURIComponent(cid)}/members/${encodeURIComponent(uid)}`, {
          method: 'DELETE'
        });
        await refreshSocialData();
        openGroupModal(cid);
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  el.modalGroupBody.querySelectorAll('[data-grp-add]').forEach((b) => {
    b.addEventListener('click', async () => {
      const [cid, uid] = b.getAttribute('data-grp-add').split(':');
      try {
        await apiRequest(`/api/conversations/${encodeURIComponent(cid)}/members`, {
          method: 'POST',
          body: { userId: uid }
        });
        await refreshSocialData();
        openGroupModal(cid);
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function updateSoundIcon() {
  el.iconSoundOn?.classList.toggle('hidden', sfx.muted);
  el.iconSoundOff?.classList.toggle('hidden', !sfx.muted);
}

function updateSystemBanner() {
  const st = store.getState();
  if (!el.systemBanner || !el.systemBannerText || !el.btnSystemBannerAction) return;
  if (!st.networkOnline) {
    el.systemBanner.classList.remove('hidden');
    el.systemBanner.classList.add('offline');
    el.systemBannerText.textContent = 'Sin conexión a Internet · Modo offline (IA y 2J local disponibles)';
    el.btnSystemBannerAction.classList.add('hidden');
    return;
  }
  if (st.swUpdateAvailable) {
    el.systemBanner.classList.remove('hidden', 'offline');
    el.systemBannerText.textContent = 'Hay una actualización de Mini-Games lista para instalar.';
    el.btnSystemBannerAction.classList.remove('hidden');
    return;
  }
  el.systemBanner.classList.add('hidden');
}

// Global Event Delegation across dynamically rendered Views, Social Rail & Voice Bar
function bindDelegatedActions() {
  document.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const navBtn = target.closest('[data-nav]');
    if (navBtn) {
      sfx.click();
      const dest = navBtn.getAttribute('data-nav');
      navigateTo(dest);
      if (dest === 'salas') refreshPublicRooms();
      if (dest === 'ranking') refreshRankings();
      if (dest === 'amigos' || dest === 'mensajes') refreshSocialData();
      return;
    }

    const authBtn = target.closest('[data-open-auth]');
    if (authBtn) {
      sfx.click();
      authModal.open(authBtn.getAttribute('data-open-auth') || 'login');
      return;
    }

    const modalLaunch = target.closest('[data-launch-modal]');
    if (modalLaunch) {
      sfx.ensureContext();
      sfx.click();
      handlePlayRequest(modalLaunch.getAttribute('data-launch-modal'), null);
      return;
    }

    const directPlay = target.closest('[data-direct-play]');
    if (directPlay) {
      sfx.ensureContext();
      sfx.click();
      const [gid, m] = directPlay.getAttribute('data-direct-play').split(':');
      handlePlayRequest(gid, m);
      return;
    }

    const playSelect = target.closest('[data-select-play-game]');
    if (playSelect) {
      sfx.click();
      setPlaySelectedGame(playSelect.getAttribute('data-select-play-game'));
      renderActiveSection();
      return;
    }

    const gamesFilter = target.closest('[data-games-filter]');
    if (gamesFilter) {
      sfx.click();
      setGamesFilter(gamesFilter.getAttribute('data-games-filter'));
      renderActiveSection();
      return;
    }

    const favBtn = target.closest('[data-toggle-fav]');
    if (favBtn) {
      sfx.click();
      const gid = favBtn.getAttribute('data-toggle-fav');
      const nextFavs = store.toggleFavoriteGame(gid);
      if (store.getState().user) {
        updateProfile({ favoriteGames: nextFavs }).catch(() => {});
      }
      renderActiveSection();
      return;
    }

    const joinCodeBtn = target.closest('[data-join-code]');
    if (joinCodeBtn) {
      sfx.ensureContext();
      sfx.click();
      joinExistingRoom(joinCodeBtn.getAttribute('data-join-code'));
      return;
    }

    const actionBtn = target.closest('[data-action]');
    if (actionBtn) {
      const act = actionBtn.getAttribute('data-action');
      sfx.click();
      if (act === 'quick-create-room') {
        sfx.ensureContext();
        startHostingRoom(null);
      } else if (act === 'open-invite-modal') {
        openInviteModal(p2p.roomCode);
      } else if (act === 'leave-room') {
        if (store.getState().gameSession.activeMode === 'online') returnToHub(true);
        p2p.leave();
        releaseWakeLock();
        showToast('Saliste de la sala');
      } else if (act === 'toggle-ready') {
        const myId = store.getLocalIdentity().id;
        const meMember = (store.getState().room.members || []).find(
          (m) => m.clientId === myId || m.userId === myId
        );
        p2p.sendRoomControl('SET_READY', { ready: !meMember?.ready });
      } else if (act === 'switch-spectator-role') {
        p2p.sendRoomControl('SWITCH_ROLE');
      } else if (act === 'refresh-public-rooms') {
        await refreshPublicRooms();
        renderActiveSection();
      } else if (act === 'refresh-rankings') {
        await refreshRankings();
      } else if (act === 'copy-public-id') {
        const pid = store.getLocalIdentity().publicId;
        navigator.clipboard?.writeText(pid).catch(() => {});
        showToast(`ID ${pid} copiado`);
      } else if (act === 'test-audio') {
        sfx.testAudio();
        showToast('Reproduciendo tono de prueba');
      } else if (act === 'test-mic') {
        const meterEl = document.getElementById('mic-test-meter');
        if (micTestCleanup) {
          micTestCleanup();
          micTestCleanup = null;
          if (meterEl) meterEl.textContent = 'Prueba de micrófono detenida.';
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const Ctx = window.AudioContext || window.webkitAudioContext;
          const ctx = new Ctx();
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          src.connect(analyser);
          const arr = new Uint8Array(analyser.frequencyBinCount);
          const timer = setInterval(() => {
            analyser.getByteFrequencyData(arr);
            const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
            const bars = '█'.repeat(Math.min(12, Math.round(avg / 8)));
            if (meterEl) meterEl.textContent = `Nivel de micrófono activo: ${bars || '·'} (${avg})`;
          }, 100);
          micTestCleanup = () => {
            clearInterval(timer);
            stream.getTracks().forEach((t) => t.stop());
            ctx.close().catch(() => {});
          };
          setTimeout(() => {
            if (micTestCleanup) {
              micTestCleanup();
              micTestCleanup = null;
            }
          }, 8000);
        } catch {
          if (meterEl) meterEl.textContent = 'No se pudo acceder al micrófono (permiso denegado o no detectado).';
        }
      } else if (act === 'load-sessions') {
        try {
          const res = await fetchSessions();
          setLoadedSessions(res.sessions || []);
          renderActiveSection();
        } catch (err) {
          showToast(err.message);
        }
      } else if (act === 'logout') {
        await logoutAccount();
        showToast('Sesión cerrada');
        navigateTo('inicio');
      } else if (act === 'open-delete-account') {
        authModal.open('delete_account');
      } else if (act === 'open-new-group-modal') {
        openGroupModal(null);
      } else if (act === 'close-mobile-thread') {
        store.setState({ activeConversationId: null });
        renderActiveSection();
      } else if (act === 'insert-emoji-dm') {
        const input = document.querySelector('[data-form="send-dm-message"] input[name="body"]');
        if (input) {
          input.value += ' 🎮';
          input.focus();
        }
      }
      return;
    }

    // Friends actions
    const friendTab = target.closest('[data-friends-tab]');
    if (friendTab) {
      setFriendsTab(friendTab.getAttribute('data-friends-tab'));
      renderActiveSection();
      return;
    }

    const friendAdd = target.closest('[data-friend-add]');
    if (friendAdd) {
      try {
        await apiRequest('/api/friends/request', {
          method: 'POST',
          body: { targetUserId: friendAdd.getAttribute('data-friend-add') }
        });
        showToast('Solicitud de amistad enviada');
        await refreshSocialData();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const friendResp = target.closest('[data-friend-respond]');
    if (friendResp) {
      const [requestId, decision] = friendResp.getAttribute('data-friend-respond').split(':');
      try {
        await apiRequest('/api/friends/respond', {
          method: 'POST',
          body: { requestId, decision }
        });
        showToast(decision === 'accept' ? '¡Amigo añadido!' : 'Solicitud actualizada');
        await refreshSocialData();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const friendRemove = target.closest('[data-friend-remove]');
    if (friendRemove) {
      try {
        await apiRequest(`/api/friends/${encodeURIComponent(friendRemove.getAttribute('data-friend-remove'))}`, {
          method: 'DELETE'
        });
        showToast('Amigo eliminado');
        await refreshSocialData();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const blockBtn = target.closest('[data-block-user]');
    if (blockBtn) {
      try {
        await apiRequest('/api/blocks', {
          method: 'POST',
          body: { targetUserId: blockBtn.getAttribute('data-block-user') }
        });
        showToast('Usuario bloqueado');
        await refreshSocialData();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const unblockBtn = target.closest('[data-unblock-user]');
    if (unblockBtn) {
      try {
        await apiRequest(`/api/blocks/${encodeURIComponent(unblockBtn.getAttribute('data-unblock-user'))}`, {
          method: 'DELETE'
        });
        showToast('Usuario desbloqueado');
        await refreshSocialData();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const inviteFriendBtn = target.closest('[data-invite-friend]');
    if (inviteFriendBtn) {
      const targetUserId = inviteFriendBtn.getAttribute('data-invite-friend');
      if (!p2p.roomCode) {
        await startHostingRoom(null);
      }
      if (p2p.roomCode) {
        try {
          await apiRequest('/api/rooms/invite', {
            method: 'POST',
            body: { targetUserId, roomCode: p2p.roomCode, gameId: store.getState().room.gameId }
          });
          showToast('Invitación enviada');
        } catch (err) {
          showToast(err.message);
        }
      }
      return;
    }

    const dmFriendBtn = target.closest('[data-dm-friend]');
    if (dmFriendBtn) {
      try {
        const res = await apiRequest('/api/conversations/dm', {
          method: 'POST',
          body: { targetUserId: dmFriendBtn.getAttribute('data-dm-friend') }
        });
        await refreshSocialData();
        if (res.conversation?.id) await openConversation(res.conversation.id);
        navigateTo('mensajes');
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    // Messages actions
    const selectConv = target.closest('[data-select-conv]');
    if (selectConv) {
      await openConversation(selectConv.getAttribute('data-select-conv'));
      return;
    }

    const manageGrp = target.closest('[data-manage-group]');
    if (manageGrp) {
      openGroupModal(manageGrp.getAttribute('data-manage-group'));
      return;
    }

    const muteConv = target.closest('[data-mute-conv]');
    if (muteConv) {
      try {
        await apiRequest(`/api/conversations/${encodeURIComponent(muteConv.getAttribute('data-mute-conv'))}/mute`, {
          method: 'POST'
        });
        await refreshSocialData();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const reactMsg = target.closest('[data-react-msg]');
    if (reactMsg) {
      const [msgId, emoji] = reactMsg.getAttribute('data-react-msg').split(':');
      try {
        const res = await apiRequest(`/api/messages/${encodeURIComponent(msgId)}/react`, {
          method: 'POST',
          body: { emoji }
        });
        const cid = store.getState().activeConversationId;
        if (cid && res.message) {
          const list = (store.getState().messagesByConv[cid] || []).map((m) =>
            m.id === msgId ? res.message : m
          );
          store.setState({ messagesByConv: { ...store.getState().messagesByConv, [cid]: list } });
          renderActiveSection();
        }
      } catch {}
      return;
    }

    const reportMsg = target.closest('[data-report-msg]');
    if (reportMsg) {
      const [uid, msgId] = reportMsg.getAttribute('data-report-msg').split(':');
      try {
        await apiRequest('/api/reports', {
          method: 'POST',
          body: { targetUserId: uid, messageId: msgId, reason: 'Contenido inapropiado' }
        });
        showToast('Reporte enviado para revisión');
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    // Ranking & Sessions
    const rankBtn = target.closest('[data-ranking-game]');
    if (rankBtn) {
      await refreshRankings(rankBtn.getAttribute('data-ranking-game'));
      return;
    }

    const revSess = target.closest('[data-revoke-session]');
    if (revSess) {
      try {
        await revokeSession(revSess.getAttribute('data-revoke-session'));
        const res = await fetchSessions();
        setLoadedSessions(res.sessions || []);
        renderActiveSection();
        showToast('Sesión cerrada');
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    const roomTransfer = target.closest('[data-room-transfer]');
    if (roomTransfer) {
      p2p.sendRoomControl('TRANSFER_HOST', {
        targetClientId: roomTransfer.getAttribute('data-room-transfer')
      });
      return;
    }

    const roomKick = target.closest('[data-room-kick]');
    if (roomKick) {
      p2p.sendRoomControl('KICK_MEMBER', {
        targetClientId: roomKick.getAttribute('data-room-kick')
      });
      return;
    }

    // Voice actions
    const voiceBtn = target.closest('[data-voice-action]');
    if (voiceBtn) {
      const va = voiceBtn.getAttribute('data-voice-action');
      if (va === 'join') await voice.join();
      else if (va === 'leave') voice.leave();
      else if (va === 'toggle-mic') await voice.toggleMic();
      else if (va === 'toggle-deafen') voice.toggleDeafen();
      else if (va === 'toggle-ptt') voice.togglePtt();
      else if (va === 'devices') await openVoiceDevicesModal();
      return;
    }

    const voicePeerMute = target.closest('[data-voice-peer-mute]');
    if (voicePeerMute) {
      voice.togglePeerLocalMute(voicePeerMute.getAttribute('data-voice-peer-mute'));
    }
  });

  // PTT Touch/Mouse Hold
  document.addEventListener('pointerdown', (e) => {
    const holdBtn = e.target instanceof Element ? e.target.closest('[data-voice-ptt-hold]') : null;
    if (holdBtn) voice.setPttActive(true);
  });
  document.addEventListener('pointerup', () => {
    if (voice.pttActive) voice.setPttActive(false);
  });
  document.addEventListener('pointercancel', () => {
    if (voice.pttActive) voice.setPttActive(false);
  });

  // Input & Change Handlers
  document.addEventListener('input', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.getAttribute('data-input') === 'games-search') {
      setGamesSearch(target.value);
      renderActiveSection();
    } else if (target.hasAttribute('data-typing-conv')) {
      const now = Date.now();
      if (now - lastTypingSentAt > 1800) {
        lastTypingSentAt = now;
        const convId = target.getAttribute('data-typing-conv');
        const sock = presenceWs?.readyState === WebSocket.OPEN ? presenceWs : p2p.ws;
        if (sock && sock.readyState === WebSocket.OPEN) {
          sock.send(JSON.stringify({ sys: 'CHAT_TYPING', conversationId: convId }));
        }
      }
    } else if (target.hasAttribute('data-voice-peer-vol')) {
      voice.setPeerVolume(target.getAttribute('data-voice-peer-vol'), target.value);
    } else if (target.hasAttribute('data-setting-range')) {
      const key = target.getAttribute('data-setting-range');
      updateSettings({ [key]: Number(target.value) });
    } else if (target.name === 'code' && target.classList.contains('code-input')) {
      if (target.getAttribute('maxlength') === '6') {
        target.value = target.value.replace(/\D/g, '').slice(0, 6);
      } else {
        target.value = normalizeRoomCode(target.value);
      }
    }
  });

  document.addEventListener('change', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.hasAttribute('data-setting')) {
      await updateSettings({ [target.getAttribute('data-setting')]: target.value });
      renderActiveSection();
    } else if (target.hasAttribute('data-setting-bool')) {
      await updateSettings({ [target.getAttribute('data-setting-bool')]: target.checked });
    } else if (target.hasAttribute('data-setting-privacy')) {
      const k = target.getAttribute('data-setting-privacy');
      await updateSettings({ privacy: { [k]: target.value } });
    } else if (target.hasAttribute('data-setting-privacy-bool')) {
      const k = target.getAttribute('data-setting-privacy-bool');
      await updateSettings({ privacy: { [k]: target.checked } });
    } else if (target.getAttribute('data-action') === 'toggle-browser-push') {
      if (target.checked && typeof Notification !== 'undefined') {
        const perm = await Notification.requestPermission().catch(() => 'denied');
        const enabled = perm === 'granted';
        target.checked = enabled;
        await updateSettings({ pushNotifications: enabled });
        if (!enabled) showToast('Permiso de notificaciones denegado');
      } else {
        await updateSettings({ pushNotifications: false });
      }
    } else if (target.getAttribute('data-action') === 'change-presence') {
      store.setState({ presenceStatus: target.value });
      if (presenceWs && presenceWs.readyState === WebSocket.OPEN) {
        presenceWs.send(JSON.stringify({ sys: 'SET_PRESENCE', status: target.value }));
      }
      if (p2p.ws && p2p.ws.readyState === WebSocket.OPEN) {
        p2p.ws.send(JSON.stringify({ sys: 'SET_PRESENCE', status: target.value }));
      }
      renderActiveSection();
    } else if (target.hasAttribute('data-room-config')) {
      const cfgKey = target.getAttribute('data-room-config');
      p2p.sendRoomControl('UPDATE_ROOM_CONFIG', {
        [cfgKey]: cfgKey === 'maxMembers' ? Number(target.value) : target.value
      });
    }
  });

  // Form Submits
  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const type = form.getAttribute('data-form');
    if (!type) return;
    e.preventDefault();

    const fd = new FormData(form);
    if (type === 'quick-join-room') {
      sfx.ensureContext();
      sfx.click();
      await joinExistingRoom(fd.get('code'));
    } else if (type === 'create-advanced-room') {
      sfx.ensureContext();
      sfx.click();
      await startHostingRoom(null, {
        title: String(fd.get('title') || '').trim(),
        visibility: String(fd.get('visibility') || 'private'),
        gameId: String(fd.get('gameId') || 'air-hockey'),
        maxMembers: Number(fd.get('maxMembers') || 2),
        allowSpectators: fd.get('allowSpectators') === 'on'
      });
      renderActiveSection();
    } else if (type === 'search-users') {
      const q = String(fd.get('q') || '').trim();
      try {
        const res = await apiRequest(`/api/users/search?q=${encodeURIComponent(q)}`);
        setFriendSearchState(q, res.users || []);
        renderActiveSection();
      } catch (err) {
        showToast(err.message);
      }
    } else if (type === 'send-dm-message') {
      const convId = store.getState().activeConversationId;
      const body = String(fd.get('body') || '').trim();
      if (!convId || !body) return;
      try {
        const res = await apiRequest(`/api/conversations/${encodeURIComponent(convId)}/messages`, {
          method: 'POST',
          body: { body }
        });
        form.reset();
        const prev = store.getState().messagesByConv[convId] || [];
        store.setState({
          messagesByConv: {
            ...store.getState().messagesByConv,
            [convId]: [...prev, res.message]
          }
        });
        await refreshSocialData();
        renderActiveSection();
      } catch (err) {
        showToast(err.message);
      }
    } else if (type === 'update-profile') {
      try {
        await updateProfile({
          username: String(fd.get('username') || '').trim().slice(0, 16),
          avatarColor: String(fd.get('avatarColor') || '#f58229'),
          avatarIcon: String(fd.get('avatarIcon') || '🎮'),
          bio: fd.has('bio') ? String(fd.get('bio') || '').trim().slice(0, 160) : undefined
        });
        p2p.broadcastProfileUpdate();
        if (activeGameInstance && store.getState().gameSession.activeMode) {
          activeGameInstance.updatePlayers(getMatchPlayers(store.getState().gameSession.activeMode));
        }
        showToast('Perfil actualizado');
        renderActiveSection();
      } catch (err) {
        showToast(err.message);
      }
    } else if (type === 'change-password') {
      try {
        await changePassword({
          currentPassword: String(fd.get('currentPassword') || ''),
          newPassword: String(fd.get('newPassword') || '')
        });
        form.reset();
        showToast('Contraseña actualizada');
      } catch (err) {
        showToast(err.message);
      }
    }
  });
}

function bindShellControls() {
  updateSoundIcon();

  el.btnHomeBrand?.addEventListener('click', () => {
    sfx.click();
    if (store.getState().gameSession.activeGameId) returnToHub(false);
    navigateTo('inicio');
  });

  el.btnMobileBrand?.addEventListener('click', () => {
    sfx.click();
    navigateTo('inicio');
  });

  el.btnToggleSidebar?.addEventListener('click', () => {
    const collapsed = !store.getState().sidebarCollapsed;
    store.setState({ sidebarCollapsed: collapsed });
    el.pcSidebar?.classList.toggle('collapsed', collapsed);
  });

  el.btnSidebarCreateRoom?.addEventListener('click', () => {
    sfx.ensureContext();
    sfx.click();
    startHostingRoom(null);
  });

  el.btnToggleSocialRail?.addEventListener('click', () => {
    store.setState({ socialRailVisible: !store.getState().socialRailVisible });
    renderSocialRail();
  });

  el.btnOpenNotifications?.addEventListener('click', () => {
    sfx.click();
    notifications.open();
  });

  el.btnFullscreen?.addEventListener('click', () => {
    sfx.click();
    toggleAppFullscreen((m) => showToast(m));
  });

  el.btnStageFullscreen?.addEventListener('click', () => {
    sfx.click();
    toggleAppFullscreen((m) => showToast(m));
  });

  el.btnToggleSound?.addEventListener('click', () => {
    const muted = sfx.toggleMuted();
    updateSoundIcon();
    if (!muted) sfx.click();
    showToast(muted ? 'Sonido silenciado' : 'Sonido activado');
  });

  const openProfileOrAuth = () => {
    sfx.click();
    navigateTo('perfil');
  };
  el.btnProfileChip?.addEventListener('click', openProfileOrAuth);
  el.sidebarUserCard?.addEventListener('click', openProfileOrAuth);

  el.btnMobileMore?.addEventListener('click', () => {
    sfx.click();
    el.modalMobileMore?.classList.remove('hidden');
  });
  el.btnCloseMobileMore?.addEventListener('click', () => el.modalMobileMore?.classList.add('hidden'));
  el.btnMoreCreateRoom?.addEventListener('click', () => {
    el.modalMobileMore?.classList.add('hidden');
    startHostingRoom(null);
  });

  el.btnBackHub?.addEventListener('click', () => {
    sfx.click();
    returnToHub(false);
  });
  el.btnRestartMatch?.addEventListener('click', () => {
    sfx.click();
    activeGameInstance?.restart?.(false);
  });

  document.querySelectorAll('[data-react]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-react');
      if (!text || !p2p.isConnected()) return;
      sfx.click();
      p2p.send({ type: 'REACTION', text });
      showToast(`Tú: ${text}`, true);
    });
  });

  el.btnOpenInvite?.addEventListener('click', () => openInviteModal(p2p.roomCode));
  el.btnLeaveRoom?.addEventListener('click', () => {
    if (store.getState().gameSession.activeMode === 'online') returnToHub(true);
    p2p.leave();
    releaseWakeLock();
    showToast('Saliste de la sala');
  });

  el.btnCloseInviteModal?.addEventListener('click', () => el.modalInvite?.classList.add('hidden'));
  el.btnCopyCode?.addEventListener('click', async () => {
    if (!p2p.roomCode) return;
    await navigator.clipboard?.writeText(p2p.roomCode).catch(() => {});
    showToast(`Código ${p2p.roomCode} copiado`);
  });
  el.btnCopyLink?.addEventListener('click', async () => {
    if (!p2p.roomCode) return;
    const url = buildRoomInviteUrl(p2p.roomCode);
    await navigator.clipboard?.writeText(url).catch(() => {});
    showToast('Enlace de invitación copiado');
  });
  el.btnNativeShare?.addEventListener('click', async () => {
    if (!p2p.roomCode || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({
        title: 'Mini-Games · Sala Crossplay',
        text: `Únete con el código ${p2p.roomCode}:`,
        url: buildRoomInviteUrl(p2p.roomCode)
      });
    } catch {}
  });

  el.btnCloseModeModal?.addEventListener('click', () => el.modalModePicker?.classList.add('hidden'));
  el.btnModeOnline?.addEventListener('click', () => {
    el.modalModePicker?.classList.add('hidden');
    if (pendingGameForModal) startHostingRoom(pendingGameForModal);
  });
  el.btnModeAi?.addEventListener('click', () => {
    el.modalModePicker?.classList.add('hidden');
    if (pendingGameForModal) launchGame(pendingGameForModal, 'ai', false);
  });
  el.btnModeLocal?.addEventListener('click', () => {
    el.modalModePicker?.classList.add('hidden');
    if (pendingGameForModal) launchGame(pendingGameForModal, 'local', false);
  });

  el.btnCloseGroupModal?.addEventListener('click', () => el.modalGroup?.classList.add('hidden'));
  el.btnCloseVoiceDev?.addEventListener('click', () => el.modalVoiceDevices?.classList.add('hidden'));

  [el.modalModePicker, el.modalInvite, el.modalMobileMore, el.modalGroup, el.modalVoiceDevices].forEach((bd) => {
    bd?.addEventListener('click', (e) => {
      if (e.target === bd) bd.classList.add('hidden');
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      el.modalModePicker?.classList.add('hidden');
      el.modalInvite?.classList.add('hidden');
      el.modalMobileMore?.classList.add('hidden');
      el.modalGroup?.classList.add('hidden');
      el.modalVoiceDevices?.classList.add('hidden');
    }
  });

  // PWA Install & Safe Updates
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    el.btnInstallPwa?.classList.remove('hidden');
  });
  el.btnInstallPwa?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice?.outcome === 'accepted') el.btnInstallPwa?.classList.add('hidden');
    deferredInstallPrompt = null;
  });
  window.addEventListener('appinstalled', () => {
    el.btnInstallPwa?.classList.add('hidden');
    deferredInstallPrompt = null;
  });

  // Network Recovery
  window.addEventListener('online', () => {
    store.setState({ networkOnline: true });
    updateSystemBanner();
    showToast('Conexión a Internet recuperada');
    p2p.attemptAutoReconnect?.();
  });
  window.addEventListener('offline', () => {
    store.setState({ networkOnline: false });
    updateSystemBanner();
  });

  el.btnSystemBannerAction?.addEventListener('click', () => {
    if (store.getState().gameSession.activeMode === 'online') {
      showToast('Termina la partida online antes de actualizar la app');
      return;
    }
    if (waitingSwRegistration?.waiting) {
      waitingSwRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });
  window.addEventListener('mg:apply-sw-update', () => {
    if (store.getState().gameSession.activeMode === 'online') {
      showToast('Termina la partida online antes de actualizar');
      return;
    }
    waitingSwRegistration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (reg.waiting) {
          waitingSwRegistration = reg;
          store.setState({ swUpdateAvailable: true });
          updateSystemBanner();
        }
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              waitingSwRegistration = reg;
              store.setState({ swUpdateAvailable: true });
              updateSystemBanner();
              notifications.pushLocalNotification({
                type: 'sw_update',
                title: 'Nueva versión disponible',
                body: 'Pulsa actualizar cuando no estés en una partida activa.'
              });
            }
          });
        });
      })
      .catch(() => {});

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!store.getState().gameSession.activeGameId) {
        window.location.reload();
      }
    });
  });
}

function checkAutoJoinUrlParam() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = normalizeRoomCode(params.get('room'));
  if (roomParam.length === 5) {
    const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);
    setTimeout(() => joinExistingRoom(roomParam), 180);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (store.getState().gameSession.activeGameId || p2p.status !== 'idle')) {
    acquireWakeLock();
  }
});

// Subscribe UI refresh to Store changes cleanly
let lastRenderedSection = null;
let lastRenderedUser = null;
let lastRenderedFriends = null;
let lastRenderedConvs = null;
let lastRenderedRoom = null;
let lastRenderedRankings = null;
let lastRenderedVoice = null;

store.subscribe((state) => {
  if (!state.user && presenceWs) {
    disconnectPresenceSocket();
  }
  el.modalMobileMore?.classList.toggle('hidden', !state.mobileMoreOpen);
  refreshHeaderAndRoomUi();

  const shouldRenderView =
    state.activeSection !== lastRenderedSection ||
    state.user !== lastRenderedUser ||
    state.friends !== lastRenderedFriends ||
    state.conversations !== lastRenderedConvs ||
    state.room !== lastRenderedRoom ||
    state.rankings !== lastRenderedRankings ||
    state.voice !== lastRenderedVoice;

  if (shouldRenderView && !state.gameSession.activeGameId) {
    lastRenderedSection = state.activeSection;
    lastRenderedUser = state.user;
    lastRenderedFriends = state.friends;
    lastRenderedConvs = state.conversations;
    lastRenderedRoom = state.room;
    lastRenderedRankings = state.rankings;
    lastRenderedVoice = state.voice;
    renderActiveSection();
  }
});

// Boot Sequence
initViewportManager();
applySettingsToDocument(store.getState().settings);
initNavigation();
bindShellControls();
bindDelegatedActions();
renderActiveSection();
refreshHeaderAndRoomUi();
registerServiceWorker();
checkAutoJoinUrlParam();

bootstrapSession().then(async (user) => {
  await refreshPublicRooms();
  if (user) {
    connectPresenceSocket();
    await refreshSocialData();
  }
  renderActiveSection();
});
