import { detectDeviceType } from '../net/p2p.js';

const NAME_STORAGE_KEY = 'mg_player_name_v1';
const GUEST_STORAGE_KEY = 'mg_guest_profile_v2';
const SETTINGS_STORAGE_KEY = 'mg_user_settings_v2';
const FAVORITES_STORAGE_KEY = 'mg_favorite_games_v1';

export const DEFAULT_SETTINGS = {
  theme: 'dark', // 'dark' | 'light'
  accent: 'amber', // 'amber' | 'teal' | 'indigo' | 'crimson' | 'emerald'
  uiScale: 'normal', // 'compact' | 'normal' | 'large'
  reducedMotion: false,
  masterVolume: 0.85,
  sfxVolume: 0.9,
  musicVolume: 0,
  micDeviceId: 'default',
  speakerDeviceId: 'default',
  airHockeySensitivity: 1.0,
  pushNotifications: false,
  privacy: {
    whoCanFriend: 'everyone', // 'everyone' | 'nobody'
    whoCanInvite: 'everyone', // 'everyone' | 'friends' | 'nobody'
    whoCanMessage: 'friends', // 'everyone' | 'friends' | 'nobody'
    showOnlineStatus: true
  }
};

function generateGuestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'gst_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return 'gst_' + Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
}

function loadGuestProfile() {
  const savedName = (localStorage.getItem(NAME_STORAGE_KEY) || '').trim().slice(0, 16);
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_STORAGE_KEY) || 'null');
    if (raw && raw.guestId) {
      if (savedName && !raw.name) raw.name = savedName;
      raw.device = detectDeviceType();
      return raw;
    }
  } catch {}
  const suffix = Math.floor(100 + Math.random() * 900);
  const initial = {
    guestId: generateGuestId(),
    name: savedName || `Jugador ${suffix}`,
    avatarColor: '#f58229',
    avatarIcon: '🎮',
    device: detectDeviceType()
  };
  localStorage.setItem(NAME_STORAGE_KEY, initial.name);
  localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        ...DEFAULT_SETTINGS,
        ...raw,
        privacy: {
          ...DEFAULT_SETTINGS.privacy,
          ...(raw.privacy || {})
        }
      };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS, privacy: { ...DEFAULT_SETTINGS.privacy } };
}

function loadFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]');
    if (Array.isArray(raw)) return raw;
  } catch {}
  return [];
}

const initialState = {
  activeSection: 'inicio',
  sidebarCollapsed: false,
  socialRailVisible: true,
  mobileMoreOpen: false,
  notificationsOpen: false,

  user: null, // Authenticated user object or null when Guest
  guest: loadGuestProfile(),
  favoriteGames: loadFavorites(),
  settings: loadSettings(),
  capabilities: {
    sqliteReady: true,
    supabaseConfigured: false,
    googleOAuthEnabled: false,
    emailDeliveryMode: 'log',
    turnConfigured: false
  },

  presenceStatus: 'online', // 'online' | 'away' | 'busy' | 'playing'

  room: {
    status: 'idle', // 'idle' | 'creating' | 'waiting' | 'joining' | 'connected' | 'reconnecting' | 'disconnected' | 'error'
    code: null,
    role: null, // 'host' | 'guest' | 'spectator' | null
    visibility: 'private', // 'private' | 'public'
    title: '',
    gameId: null,
    maxMembers: 2,
    allowSpectators: true,
    members: [],
    rttMs: null,
    transport: null,
    reconnectToken: null
  },
  publicRooms: [],

  friends: {
    accepted: [],
    incoming: [],
    outgoing: [],
    blocked: []
  },

  conversations: [],
  activeConversationId: null,
  messagesByConv: {},
  typingByConv: {},

  matchChatMessages: [],
  matchChatUnread: 0,
  matchChatOpen: false,

  voice: {
    joined: false,
    state: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'mic_blocked' | 'permission_error' | 'reconnecting'
    micMuted: true,
    deafened: false,
    pttEnabled: false,
    pttActive: false,
    peers: {}, // peerId -> { name, avatarColor, avatarIcon, micMuted, volume, localMuted, speaking }
    error: ''
  },

  notifications: [],
  unreadNotifications: 0,

  rankings: {
    game: 'global',
    leaderboard: [],
    myHistory: [],
    loading: false
  },

  gameSession: {
    activeGameId: null,
    activeMode: null, // 'online' | 'ai' | 'local'
    isSpectator: false,
    sessionWins: { 1: 0, 2: 0 }
  },

  networkOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  swUpdateAvailable: false
};

class AppStore {
  constructor(seed) {
    this.state = seed;
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  setState(updater) {
    const patch = typeof updater === 'function' ? updater(this.state) : updater;
    if (!patch || typeof patch !== 'object') return;
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) {
      try {
        fn(this.state);
      } catch (err) {
        console.error('Store listener error:', err);
      }
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  updateGuest(patch) {
    const next = { ...this.state.guest, ...patch };
    localStorage.setItem(NAME_STORAGE_KEY, next.name || 'Jugador');
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(next));
    this.setState({ guest: next });
    return next;
  }

  saveLocalSettings(nextSettings) {
    const merged = {
      ...DEFAULT_SETTINGS,
      ...this.state.settings,
      ...nextSettings,
      privacy: {
        ...DEFAULT_SETTINGS.privacy,
        ...this.state.settings.privacy,
        ...(nextSettings.privacy || {})
      }
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
    this.setState({ settings: merged });
    return merged;
  }

  toggleFavoriteGame(gameId) {
    const exists = this.state.favoriteGames.includes(gameId);
    const next = exists
      ? this.state.favoriteGames.filter((id) => id !== gameId)
      : [...this.state.favoriteGames, gameId];
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    this.setState({ favoriteGames: next });
    return next;
  }

  getLocalIdentity() {
    if (this.state.user) {
      return {
        isAuthenticated: true,
        id: this.state.user.id,
        publicId: this.state.user.publicId,
        tag: this.state.user.tag,
        name: this.state.user.username,
        avatarColor: this.state.user.avatarColor || '#f58229',
        avatarIcon: this.state.user.avatarIcon || '⚡',
        device: this.state.guest.device,
        level: this.state.user.level || 1
      };
    }
    return {
      isAuthenticated: false,
      id: this.state.guest.guestId,
      publicId: 'INVITADO',
      tag: 'LOCAL',
      name: this.state.guest.name,
      avatarColor: this.state.guest.avatarColor || '#f58229',
      avatarIcon: this.state.guest.avatarIcon || '🎮',
      device: this.state.guest.device,
      level: 1
    };
  }
}

export const store = new AppStore(initialState);
