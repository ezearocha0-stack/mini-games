import Peer from 'peerjs';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'mgxplay-v1-';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

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
  constructor({ getLocalProfile, onStatusChange, onMessage, onPeerProfile, onPingUpdate }) {
    this.getLocalProfile = getLocalProfile;
    this.onStatusChange = onStatusChange;
    this.onMessage = onMessage;
    this.onPeerProfile = onPeerProfile;
    this.onPingUpdate = onPingUpdate;

    this.transport = null; // 'ws' | 'webrtc' | null
    this.ws = null;
    this.wsPaired = false;
    this.peer = null;
    this.conn = null;
    this.role = null; // 'host' | 'guest' | null
    this.roomCode = null;
    this.status = 'idle'; // 'idle' | 'creating' | 'waiting' | 'joining' | 'connected' | 'disconnected' | 'error'
    this.remoteProfile = null;
    this.rttMs = null;
    this.pingTimer = null;
    this.retryCount = 0;
  }

  isConnected() {
    if (this.transport === 'ws') {
      return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN && this.wsPaired && this.status === 'connected');
    }
    return Boolean(this.conn && this.conn.open && this.status === 'connected');
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
      transport: this.transport
    });
  }

  async createRoom(preferredCode = null) {
    this.cleanupTransports();
    this.role = 'host';
    this.roomCode = preferredCode || generateRoomCode();
    this.remoteProfile = null;
    this.rttMs = null;
    this.setStatus('creating', 'Creando sala…');

    // 1. Try built-in Render / Node WebSocket server first (/ws)
    try {
      const code = await this.createRoomViaWebSocket(this.roomCode);
      return code;
    } catch {
      // 2. Fallback to serverless WebRTC P2P (for static hosts like Vercel)
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

    // 1. Try built-in Render / Node WebSocket server first (/ws)
    try {
      const joinedCode = await this.joinRoomViaWebSocket(code);
      return joinedCode;
    } catch (wsErr) {
      if (wsErr?.isRoomLogicError) {
        this.setStatus('error', wsErr.message);
        throw wsErr;
      }
      // 2. Fallback to serverless WebRTC P2P (for static hosts like Vercel)
      return this.joinRoomViaPeerJs(code);
    }
  }

  // =========================================================================
  // Transport A: Render / Node WebSocket (/ws)
  // =========================================================================
  createRoomViaWebSocket(preferredCode) {
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
          try { ws.close(); } catch {}
          reject(new Error('WS_UNAVAILABLE'));
        }
      }, 2200);

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ sys: 'CREATE_ROOM', code: preferredCode }));
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
          this.startPingLoop();
          return;
        }

        if (msg.sys === 'GUEST_LEFT') {
          this.stopPingLoop();
          this.wsPaired = false;
          this.remoteProfile = null;
          this.rttMs = null;
          this.setStatus('waiting', `Rival desconectado · Sala ${this.roomCode} abierta`);
          this.onMessage?.({ type: 'PEER_LEFT' });
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
          try { ws.close(); } catch {}
          reject(new Error('WS_UNAVAILABLE'));
        }
      }, 2200);

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ sys: 'JOIN_ROOM', code }));
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
          try { ws.close(); } catch {}
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
          this.setStatus('connected', 'Conectado en tiempo real');
          this.send({ type: 'HELLO', profile: this.getLocalProfile() });
          this.startPingLoop();
          if (!settled) {
            settled = true;
            resolve(this.roomCode);
          }
          return;
        }

        if (msg.sys === 'HOST_LEFT' || msg.sys === 'PEER_CLOSED') {
          this.stopPingLoop();
          this.wsPaired = false;
          this.rttMs = null;
          this.setStatus('disconnected', 'El anfitrión cerró la sala.');
          this.onMessage?.({ type: 'PEER_LEFT' });
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
        config: { iceServers: ICE_SERVERS }
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
        config: { iceServers: ICE_SERVERS }
      });
      this.peer = peer;

      peer.on('open', () => {
        const targetId = `${PEER_PREFIX}${code}`;
        const conn = peer.connect(targetId, {
          reliable: true,
          serialization: 'json'
        });
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
  // Shared Packet Processing & Sending
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
      this.send({ type: 'PONG', ts: packet.ts });
      return;
    }

    if (packet.type === 'PONG' && typeof packet.ts === 'number') {
      this.rttMs = Math.max(1, Math.round(performance.now() - packet.ts));
      this.onPingUpdate?.(this.rttMs);
      return;
    }

    this.onMessage?.(packet);
  }

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
    const firePing = () => {
      if (this.isConnected()) {
        this.send({ type: 'PING', ts: performance.now() });
      }
    };
    firePing();
    this.pingTimer = setInterval(firePing, 2500);
  }

  stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  cleanupTransports() {
    this.stopPingLoop();
    this.wsPaired = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
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
    this.role = null;
    this.roomCode = null;
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
