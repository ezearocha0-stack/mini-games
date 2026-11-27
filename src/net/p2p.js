import Peer from 'peerjs';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'mgxplay-v1-';

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];
const RECONNECT_STORAGE_KEY = 'mg_room_reconnect_v1';

async function fetchIceServers() {
  try {
    const res = await fetch('/api/rtc/ice');
    if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
      const data = await res.json();
      if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        return data.iceServers;
      }
    }
  } catch {}
  return DEFAULT_ICE_SERVERS;
}

export function detectDeviceType() {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (navigator.maxTouchPoints > 1 && window.innerWidth < 920) return 'Móvil';
  return 'PC';
}

export function normalizeRoomCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
}

function generateRoomCode() {
  let code = '';
  const randomValues = new Uint32Array(5);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 5; i++) {
    code += CODE_CHARS[randomValues[i] % CODE_CHARS.length];
  }
  return code;
}

function getServerWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export class P2PSession {
  constructor({ getLocalProfile, onStatusChange, onMessage, onPeerProfile, onPingUpdate, onSystemEvent }) {
    this.getLocalProfile = getLocalProfile;
    this.onStatusChange = onStatusChange;
    this.onMessage = onMessage;
    this.onPeerProfile = onPeerProfile;
    this.onPingUpdate = onPingUpdate;
    this.onSystemEvent = onSystemEvent;

    this.transport = null; // 'ws' | 'webrtc' | null
    this.ws = null;
    this.wsPaired = false;
    this.iceServers = DEFAULT_ICE_SERVERS;

    // Optional direct UDP WebRTC fast-lane negotiated over /ws
    this.rtcPc = null;
    this.fastDc = null;
    this.pendingIceCandidates = [];

    // PeerJS fallback (for pure static hosting like Vercel)
    this.peer = null;
    this.conn = null;
    this.fastPeerConn = null;

    this.role = null; // 'host' | 'guest' | 'spectator' | null
    this.roomCode = null;
    this.reconnectToken = null;
    this.status = 'idle';
    this.remoteProfile = null;
    this.rttMs = null;
    this.lastPongAt = 0;
    this.pingTimer = null;
    this.retryCount = 0;
  }

  isConnected() {
    if (this.transport === 'ws') {
      return Boolean(
        this.ws &&
          this.ws.readyState === WebSocket.OPEN &&
          this.wsPaired &&
          this.status === 'connected'
      );
    }
    return Boolean(this.conn && this.conn.open && this.status === 'connected');
  }

  hasDirectUdpFastLane() {
    return Boolean(this.fastDc && this.fastDc.readyState === 'open');
  }

  isHost() {
    return this.role === 'host';
  }

  setStatus(status, detail = '') {
    this.status = status;
    this.onStatusChange?.({
      status,
      detail,
      role: this.role,
      roomCode: this.roomCode,
      remoteProfile: this.remoteProfile,
      rttMs: this.rttMs,
      transport: this.hasDirectUdpFastLane() ? 'udp-direct' : this.transport
    });
  }

  async createRoom(preferredCode = null, options = {}) {
    this.cleanupTransports();
    this.role = 'host';
    this.roomCode = preferredCode || generateRoomCode();
    this.remoteProfile = null;
    this.rttMs = null;
    this.setStatus('creating', 'Creando sala…');
    this.iceServers = await fetchIceServers();

    try {
      const code = await this.createRoomViaWebSocket(this.roomCode, options);
      return code;
    } catch {
      return this.createRoomViaPeerJs(this.roomCode);
    }
  }

  async joinRoom(rawCode) {
    const code = normalizeRoomCode(rawCode);
    if (code.length !== 5) {
      throw new Error('Introduce un código válido de 5 caracteres.');
    }

    this.cleanupTransports();
    this.role = 'guest';
    this.roomCode = code;
    this.remoteProfile = null;
    this.rttMs = null;
    this.setStatus('joining', `Conectando a ${code}…`);
    this.iceServers = await fetchIceServers();

    try {
      const joinedCode = await this.joinRoomViaWebSocket(code);
      return joinedCode;
    } catch (wsErr) {
      if (wsErr?.isRoomLogicError) {
        this.setStatus('error', wsErr.message);
        throw wsErr;
      }
      return this.joinRoomViaPeerJs(code);
    }
  }

  saveReconnectSession() {
    if (!this.roomCode || !this.reconnectToken) return;
    try {
      sessionStorage.setItem(
        RECONNECT_STORAGE_KEY,
        JSON.stringify({ code: this.roomCode, token: this.reconnectToken, ts: Date.now() })
      );
    } catch {}
  }

  clearReconnectSession() {
    try {
      sessionStorage.removeItem(RECONNECT_STORAGE_KEY);
    } catch {}
  }

  attemptAutoReconnect() {
    if (this.status === 'connected' || this.status === 'waiting') return false;
    try {
      const saved = JSON.parse(sessionStorage.getItem(RECONNECT_STORAGE_KEY) || 'null');
      if (!saved || !saved.code || !saved.token || Date.now() - saved.ts > 45_000) return false;
      this.setStatus('reconnecting', `Reconectando a ${saved.code}…`);
      const ws = new WebSocket(getServerWsUrl());
      ws.addEventListener('open', () => {
        const authToken = localStorage.getItem('mg_session_token_v1') || '';
        ws.send(JSON.stringify({ sys: 'AUTH_HELLO', token: authToken, profile: this.getLocalProfile() }));
        ws.send(JSON.stringify({ sys: 'RECONNECT_ROOM', code: saved.code, reconnectToken: saved.token }));
      });
      ws.addEventListener('message', (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.sys === 'JOIN_OK') {
          this.transport = 'ws';
          this.ws = ws;
          this.wsPaired = true;
          this.roomCode = msg.code;
          this.role = msg.role || this.role;
          this.reconnectToken = msg.reconnectToken || saved.token;
          this.setStatus('connected', 'Reconectado');
          this.send({ type: 'HELLO', profile: this.getLocalProfile() });
          this.startPingLoop();
        } else if (msg.sys === 'PACKET' && msg.payload) {
          this.handleIncomingAppPacket(msg.payload);
        } else if (msg.sys === 'RTC_SIGNAL') {
          this.handleRtcSignal(msg.signal);
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // Direct WebRTC UDP Fast-Lane Upgrade (signaled over /ws)
  // Eliminates server geography RTT & TCP head-of-line blocking when possible
  // =========================================================================
  closeRtcFastLane() {
    this.pendingIceCandidates = [];
    if (this.fastDc) {
      try {
        this.fastDc.close();
      } catch {}
      this.fastDc = null;
    }
    if (this.rtcPc) {
      try {
        this.rtcPc.close();
      } catch {}
      this.rtcPc = null;
    }
  }

  setupRtcPeerConnection(isInitiator) {
    if (typeof RTCPeerConnection === 'undefined') return null;
    this.closeRtcFastLane();

    const pc = new RTCPeerConnection({ iceServers: this.iceServers || DEFAULT_ICE_SERVERS });
    this.rtcPc = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            sys: 'RTC_SIGNAL',
            signal: { type: 'ice', candidate: ev.candidate }
          })
        );
      }
    };

    const bindFastChannel = (dc) => {
      this.fastDc = dc;
      dc.onopen = () => {
        // Re-trigger immediate ping over UDP fast-lane so UI reflects ultra-low ms
        this.sendFast({ type: 'PING', ts: performance.now() });
        this.onPingUpdate?.(this.rttMs);
      };
      dc.onmessage = (ev) => {
        try {
          const packet = JSON.parse(ev.data);
          this.handleIncomingAppPacket(packet);
        } catch {}
      };
      dc.onclose = () => {
        if (this.fastDc === dc) this.fastDc = null;
      };
    };

    if (isInitiator) {
      const dc = pc.createDataChannel('fast', {
        ordered: false,
        maxRetransmits: 0
      });
      bindFastChannel(dc);

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN && pc.localDescription) {
            this.ws.send(
              JSON.stringify({
                sys: 'RTC_SIGNAL',
                signal: { type: 'sdp', sdp: pc.localDescription }
              })
            );
          }
        })
        .catch(() => {});
    } else {
      pc.ondatachannel = (ev) => {
        if (ev.channel.label === 'fast') {
          bindFastChannel(ev.channel);
        }
      };
    }

    return pc;
  }

  async handleRtcSignal(signal) {
    if (!signal || typeof RTCPeerConnection === 'undefined') return;
    try {
      if (signal.type === 'sdp' && signal.sdp) {
        let pc = this.rtcPc;
        if (!pc && signal.sdp.type === 'offer') {
          pc = this.setupRtcPeerConnection(false);
        }
        if (!pc) return;

        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        while (this.pendingIceCandidates.length > 0) {
          const cand = this.pendingIceCandidates.shift();
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }

        if (signal.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (this.ws && this.ws.readyState === WebSocket.OPEN && pc.localDescription) {
            this.ws.send(
              JSON.stringify({
                sys: 'RTC_SIGNAL',
                signal: { type: 'sdp', sdp: pc.localDescription }
              })
            );
          }
        }
      } else if (signal.type === 'ice' && signal.candidate) {
        if (this.rtcPc && this.rtcPc.remoteDescription) {
          await this.rtcPc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
        } else {
          this.pendingIceCandidates.push(signal.candidate);
        }
      }
    } catch {
      // If direct UDP fails due to strict firewall, /ws seamlessly keeps carrying traffic
    }
  }

  // =========================================================================
  // Transport A: Render / Node WebSocket (/ws) + Auto UDP Fast-Lane
  // =========================================================================
  createRoomViaWebSocket(preferredCode, options = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws;
      try {
        ws = new WebSocket(getServerWsUrl());
      } catch (e) {
        reject(e);
        return;
      }

      const probeTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            ws.close();
          } catch {}
          reject(new Error('WS_UNAVAILABLE'));
        }
      }, 2200);

      ws.addEventListener('open', () => {
        const profile = this.getLocalProfile();
        const token = localStorage.getItem('mg_session_token_v1') || '';
        ws.send(JSON.stringify({ sys: 'AUTH_HELLO', token, profile }));
        ws.send(
          JSON.stringify({
            sys: 'CREATE_ROOM',
            code: preferredCode,
            clientId: profile?.id,
            profile,
            visibility: options.visibility || 'private',
            title: options.title || '',
            gameId: options.gameId || 'air-hockey',
            maxMembers: options.maxMembers || 2,
            allowSpectators: options.allowSpectators !== false
          })
        );
      });

      ws.addEventListener('message', (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }

        if (msg.sys === 'ROOM_CREATED') {
          clearTimeout(probeTimeout);
          this.transport = 'ws';
          this.ws = ws;
          this.wsPaired = false;
          this.roomCode = msg.code;
          this.reconnectToken = msg.reconnectToken || null;
          this.saveReconnectSession();
          this.setStatus('waiting', `Sala ${this.roomCode} lista`);
          if (!settled) {
            settled = true;
            resolve(this.roomCode);
          }
          return;
        }

        if (msg.sys === 'PEER_JOINED') {
          this.wsPaired = true;
          this.setStatus('connected', 'Conectado en tiempo real');
          this.send({ type: 'HELLO', profile: this.getLocalProfile() });
          this.setupRtcPeerConnection(true);
          this.startPingLoop();
          return;
        }

        if (msg.sys === 'RTC_SIGNAL') {
          this.handleRtcSignal(msg.signal);
          return;
        }

        if (msg.sys === 'HOST_PROMOTED') {
          this.role = 'host';
          this.setStatus(this.wsPaired ? 'connected' : 'waiting', 'Ahora eres el anfitrión');
          return;
        }

        if (msg.sys === 'GUEST_LEFT') {
          this.stopPingLoop();
          this.closeRtcFastLane();
          this.wsPaired = false;
          this.remoteProfile = null;
          this.rttMs = null;
          this.setStatus('waiting', `Rival desconectado · Sala ${this.roomCode} abierta`);
          this.onMessage?.({ type: 'PEER_LEFT' });
          return;
        }

        if (msg.sys === 'NOTIFICATION' || msg.sys === 'PRESENCE_UPDATE' || msg.sys === 'CHAT_MESSAGE') {
          this.onSystemEvent?.(msg);
          return;
        }

        if (msg.sys === 'PACKET' && msg.payload) {
          this.handleIncomingAppPacket(msg.payload);
        }
      });

      ws.addEventListener('error', () => {
        clearTimeout(probeTimeout);
        if (!settled) {
          settled = true;
          reject(new Error('WS_ERROR'));
        }
      });

      ws.addEventListener('close', () => {
        clearTimeout(probeTimeout);
        if (!settled) {
          settled = true;
          reject(new Error('WS_CLOSED'));
          return;
        }
        if (this.transport === 'ws' && this.ws === ws) {
          this.stopPingLoop();
          this.closeRtcFastLane();
          this.wsPaired = false;
          this.setStatus('disconnected', 'Se cerró la conexión con el servidor.');
        }
      });
    });
  }

  joinRoomViaWebSocket(code) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws;
      try {
        ws = new WebSocket(getServerWsUrl());
      } catch (e) {
        reject(e);
        return;
      }

      const probeTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            ws.close();
          } catch {}
          reject(new Error('WS_UNAVAILABLE'));
        }
      }, 2200);

      ws.addEventListener('open', () => {
        const profile = this.getLocalProfile();
        const token = localStorage.getItem('mg_session_token_v1') || '';
        ws.send(JSON.stringify({ sys: 'AUTH_HELLO', token, profile }));
        ws.send(JSON.stringify({ sys: 'JOIN_ROOM', code, clientId: profile?.id, profile }));
      });

      ws.addEventListener('message', (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }

        if (msg.sys === 'JOIN_ERROR') {
          clearTimeout(probeTimeout);
          const err = new Error(msg.message || `No se pudo entrar a la sala ${code}.`);
          err.isRoomLogicError = true;
          try {
            ws.close();
          } catch {}
          if (!settled) {
            settled = true;
            reject(err);
          }
          return;
        }

        if (msg.sys === 'JOIN_OK') {
          clearTimeout(probeTimeout);
          this.transport = 'ws';
          this.ws = ws;
          this.wsPaired = true;
          this.roomCode = msg.code;
          this.role = msg.role || 'guest';
          this.reconnectToken = msg.reconnectToken || null;
          this.saveReconnectSession();
          this.setStatus('connected', 'Conectado en tiempo real');
          this.send({ type: 'HELLO', profile: this.getLocalProfile() });
          this.startPingLoop();
          if (!settled) {
            settled = true;
            resolve(this.roomCode);
          }
          return;
        }

        if (msg.sys === 'RTC_SIGNAL') {
          this.handleRtcSignal(msg.signal);
          return;
        }

        if (msg.sys === 'HOST_PROMOTED') {
          this.role = 'host';
          this.setStatus('connected', 'Ahora eres el anfitrión');
          return;
        }

        if (msg.sys === 'KICKED') {
          this.leave();
          this.onSystemEvent?.({ sys: 'KICKED', message: msg.message });
          return;
        }

        if (msg.sys === 'HOST_LEFT' || msg.sys === 'PEER_CLOSED') {
          this.stopPingLoop();
          this.closeRtcFastLane();
          this.wsPaired = false;
          this.rttMs = null;
          this.clearReconnectSession();
          this.setStatus('disconnected', 'El anfitrión cerró la sala.');
          this.onMessage?.({ type: 'PEER_LEFT' });
          return;
        }

        if (msg.sys === 'NOTIFICATION' || msg.sys === 'PRESENCE_UPDATE' || msg.sys === 'CHAT_MESSAGE') {
          this.onSystemEvent?.(msg);
          return;
        }

        if (msg.sys === 'PACKET' && msg.payload) {
          this.handleIncomingAppPacket(msg.payload);
        }
      });

      ws.addEventListener('error', () => {
        clearTimeout(probeTimeout);
        if (!settled) {
          settled = true;
          reject(new Error('WS_ERROR'));
        }
      });

      ws.addEventListener('close', () => {
        clearTimeout(probeTimeout);
        if (!settled) {
          settled = true;
          reject(new Error('WS_CLOSED'));
          return;
        }
        if (this.transport === 'ws' && this.ws === ws && this.wsPaired) {
          this.stopPingLoop();
          this.closeRtcFastLane();
          this.wsPaired = false;
          this.setStatus('disconnected', 'La conexión se cerró.');
          this.onMessage?.({ type: 'PEER_LEFT' });
        }
      });
    });
  }

  // =========================================================================
  // Transport B: PeerJS WebRTC Fallback (for static Vercel / GitHub Pages)
  // =========================================================================
  createRoomViaPeerJs(preferredCode) {
    return new Promise((resolve, reject) => {
      let settled = false;
      this.transport = 'webrtc';
      this.roomCode = preferredCode || generateRoomCode();
      const peerId = `${PEER_PREFIX}${this.roomCode}`;

      const peer = new Peer(peerId, {
        debug: 0,
        config: { iceServers: this.iceServers || DEFAULT_ICE_SERVERS }
      });
      this.peer = peer;

      peer.on('open', () => {
        this.retryCount = 0;
        this.setStatus('waiting', `Sala ${this.roomCode} lista`);
        if (!settled) {
          settled = true;
          resolve(this.roomCode);
        }
      });

      peer.on('connection', (incomingConn) => {
        if (incomingConn.label === 'fast-unreliable') {
          this.fastPeerConn = incomingConn;
          incomingConn.on('data', (pkt) => this.handleIncomingAppPacket(pkt));
          return;
        }
        if (this.conn && this.conn.open) {
          incomingConn.on('open', () => {
            incomingConn.send({ type: 'ROOM_FULL' });
            setTimeout(() => incomingConn.close(), 250);
          });
          return;
        }
        this.bindPeerConnection(incomingConn);
      });

      peer.on('disconnected', () => {
        if (this.peer && !this.peer.destroyed) {
          this.peer.reconnect();
        }
      });

      peer.on('error', (err) => {
        if (err?.type === 'unavailable-id' && this.retryCount < 4) {
          this.retryCount += 1;
          peer.destroy();
          this.createRoomViaPeerJs(generateRoomCode()).then(resolve).catch(reject);
          settled = true;
          return;
        }
        const msg = this.translateError(err);
        this.setStatus('error', msg);
        if (!settled) {
          settled = true;
          reject(new Error(msg));
        }
      });
    });
  }

  joinRoomViaPeerJs(code) {
    return new Promise((resolve, reject) => {
      let settled = false;
      this.transport = 'webrtc';

      const timeoutId = setTimeout(() => {
        if (!settled && !this.isConnected()) {
          settled = true;
          const msg = `Tiempo agotado al conectar con ${code}. Verifica que la sala siga abierta.`;
          this.setStatus('error', msg);
          this.cleanupTransports();
          reject(new Error(msg));
        }
      }, 14000);

      const peer = new Peer({
        debug: 0,
        config: { iceServers: this.iceServers || DEFAULT_ICE_SERVERS }
      });
      this.peer = peer;

      peer.on('open', () => {
        const targetId = `${PEER_PREFIX}${code}`;
        const conn = peer.connect(targetId, {
          reliable: true,
          serialization: 'json'
        });
        // Also open an unordered UDP channel for fast snapshots
        const fastConn = peer.connect(targetId, {
          label: 'fast-unreliable',
          reliable: false,
          serialization: 'json'
        });
        this.fastPeerConn = fastConn;
        fastConn.on('data', (pkt) => this.handleIncomingAppPacket(pkt));

        this.bindPeerConnection(conn, () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            resolve(code);
          }
        });
      });

      peer.on('error', (err) => {
        clearTimeout(timeoutId);
        const msg = this.translateError(err, code);
        this.setStatus('error', msg);
        if (!settled) {
          settled = true;
          reject(new Error(msg));
        }
      });
    });
  }

  bindPeerConnection(conn, onOpenCallback) {
    this.conn = conn;

    conn.on('open', () => {
      this.send({
        type: 'HELLO',
        profile: this.getLocalProfile()
      });
      this.startPingLoop();
      this.setStatus('connected', 'Conectado por P2P');
      onOpenCallback?.();
    });

    conn.on('data', (packet) => {
      this.handleIncomingAppPacket(packet);
    });

    conn.on('close', () => {
      this.stopPingLoop();
      this.conn = null;
      this.fastPeerConn = null;
      this.rttMs = null;
      if (this.role === 'host' && this.peer && !this.peer.destroyed) {
        this.remoteProfile = null;
        this.setStatus('waiting', `Rival desconectado · Sala ${this.roomCode} abierta`);
        this.onMessage?.({ type: 'PEER_LEFT' });
      } else if (this.role === 'guest') {
        this.setStatus('disconnected', 'La conexión con el anfitrión se cerró.');
        this.onMessage?.({ type: 'PEER_LEFT' });
      }
    });

    conn.on('error', () => {
      this.stopPingLoop();
    });
  }

  // =========================================================================
  // Shared Packet Processing & Dual-Channel Sending (Reliable vs Fast/Volatile)
  // =========================================================================
  handleIncomingAppPacket(packet) {
    if (!packet || typeof packet !== 'object') return;

    if (packet.type === 'ROOM_FULL') {
      this.setStatus('error', 'Esa sala ya tiene 2 jugadores conectados.');
      this.leave();
      return;
    }

    if (packet.type === 'HELLO' || packet.type === 'PROFILE_UPDATE') {
      this.remoteProfile = {
        name: String(packet.profile?.name || 'Rival').slice(0, 16),
        device: String(packet.profile?.device || 'Dispositivo')
      };
      this.onPeerProfile?.(this.remoteProfile);
      this.setStatus('connected', `${this.remoteProfile.name} (${this.remoteProfile.device})`);
      return;
    }

    if (packet.type === 'PING') {
      this.sendFast({ type: 'PONG', ts: packet.ts });
      return;
    }

    if (packet.type === 'PONG' && typeof packet.ts === 'number') {
      this.lastPongAt = performance.now();
      this.rttMs = Math.max(1, Math.round(this.lastPongAt - packet.ts));
      this.onPingUpdate?.(this.rttMs);
      return;
    }

    this.onMessage?.(packet);
  }

  // Reliable ordered send (goals, turn moves, room state, strike impulses)
  send(payload) {
    if (this.transport === 'ws') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsPaired) {
        try {
          this.ws.send(JSON.stringify({ sys: 'RELAY', payload }));
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }

    if (this.conn && this.conn.open) {
      try {
        this.conn.send(payload);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  // Unordered / zero-backpressure send for 60Hz coordinates & physics snapshots
  sendFast(payload) {
    // 1. Direct UDP WebRTC DataChannel (zero head-of-line blocking, lowest ms!)
    if (this.fastDc && this.fastDc.readyState === 'open') {
      if (this.fastDc.bufferedAmount < 4096) {
        try {
          this.fastDc.send(JSON.stringify(payload));
          return true;
        } catch {}
      } else {
        return false; // Drop frame rather than queue
      }
    }

    // 2. PeerJS unreliable DataChannel (on static Vercel)
    if (this.fastPeerConn && this.fastPeerConn.open) {
      const dc = this.fastPeerConn.dataChannel;
      if (!dc || dc.bufferedAmount < 4096) {
        try {
          this.fastPeerConn.send(payload);
          return true;
        } catch {}
      } else {
        return false;
      }
    }

    // 3. WebSocket volatile relay (skip if client socket has pending unacked bytes!)
    if (this.transport === 'ws') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.wsPaired) {
        if (this.ws.bufferedAmount > 2048) {
          return false; // Drop stale frame so latency never builds up
        }
        try {
          this.ws.send(JSON.stringify({ sys: 'VOLATILE', payload }));
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }

    return this.send(payload);
  }

  broadcastProfileUpdate() {
    if (this.isConnected()) {
      this.send({
        type: 'PROFILE_UPDATE',
        profile: this.getLocalProfile()
      });
    }
  }

  startPingLoop() {
    this.stopPingLoop();
    this.lastPongAt = performance.now();
    const firePing = () => {
      if (this.isConnected()) {
        const now = performance.now();
        if (now - this.lastPongAt > 4500) {
          // Reliable fallback if fast channel is transiently stalled
          this.send({ type: 'PING', ts: now });
        } else {
          this.sendFast({ type: 'PING', ts: now });
        }
      }
    };
    firePing();
    this.pingTimer = setInterval(firePing, 2000);
  }

  sendRoomControl(sys, data = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ sys, ...data }));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  cleanupTransports() {
    this.stopPingLoop();
    this.closeRtcFastLane();
    this.wsPaired = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    if (this.fastPeerConn) {
      try {
        this.fastPeerConn.close();
      } catch {}
      this.fastPeerConn = null;
    }
    if (this.conn) {
      try {
        this.conn.close();
      } catch {}
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
    this.transport = null;
  }

  leave() {
    this.cleanupTransports();
    this.clearReconnectSession();
    this.role = null;
    this.roomCode = null;
    this.reconnectToken = null;
    this.remoteProfile = null;
    this.rttMs = null;
    this.setStatus('idle', '');
  }

  translateError(err, code = '') {
    const type = err?.type || '';
    if (type === 'peer-unavailable') {
      return `No existe ninguna sala activa con el código ${code || this.roomCode}.`;
    }
    if (type === 'network' || type === 'server-error' || type === 'socket-error') {
      return 'No se pudo conectar al servicio de salas. Revisa tu conexión.';
    }
    if (type === 'webrtc') {
      return 'Falló la negociación directa entre ambos dispositivos.';
    }
    return err?.message || 'Error de conexión.';
  }
}
