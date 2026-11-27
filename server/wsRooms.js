import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { getDb, areFriends, isBlockedBetween } from './db.js';
import { extractSessionToken } from './auth.js';
import { startCompetitiveSession, recordValidatedMatchResult } from './elo.js';
import { getClientIp, rateLimiter, sanitizeText, sha256Hex } from './security.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECONNECT_GRACE_MS = 45_000;
const AFK_THRESHOLD_MS = 180_000;
const MAX_ROOMS_GLOBAL = 1200;

const rooms = new Map(); // code -> room object
const userSockets = new Map(); // userId -> Set<ws>

function generateServerCode() {
  for (let attempt = 0; attempt < 25; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return 'RM' + crypto.randomInt(100, 999);
}

function safeSend(ws, data) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(data));
    } catch {}
  }
}

export function pushToUser(userId, event) {
  if (!userId) return;
  const set = userSockets.get(userId);
  if (!set) return;
  for (const ws of set) {
    safeSend(ws, event);
  }
}

export function getOnlinePresenceForUser(userId) {
  const set = userSockets.get(userId);
  if (!set || set.size === 0) return { presence: 'offline', activity: null };
  let best = 'online';
  let activity = null;
  for (const ws of set) {
    if (ws.roomCode && ws.activeGameName) {
      return { presence: 'playing', activity: ws.activeGameName };
    }
    if (ws.presenceStatus) best = ws.presenceStatus;
  }
  return { presence: best, activity };
}

function broadcastPresenceToFriends(userId) {
  if (!userId) return;
  const db = getDb();
  const setting = db.prepare('SELECT show_online_status FROM user_settings WHERE user_id = ?').get(userId);
  const visible = setting ? Boolean(setting.show_online_status) : true;
  const { presence, activity } = visible
    ? getOnlinePresenceForUser(userId)
    : { presence: 'offline', activity: null };

  db.prepare('UPDATE users SET presence_status = ? WHERE id = ?').run(presence, userId);

  const friendRows = db
    .prepare(
      `SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS fid
       FROM friendships WHERE user_a = ? OR user_b = ?`
    )
    .all(userId, userId, userId);

  for (const { fid } of friendRows) {
    if (!isBlockedBetween(db, userId, fid)) {
      pushToUser(fid, {
        sys: 'PRESENCE_UPDATE',
        userId,
        presence,
        activity
      });
    }
  }
}

export function getPublicRoomsList() {
  const list = [];
  for (const room of rooms.values()) {
    if (room.visibility !== 'public') continue;
    const activeMembers = [...room.members.values()].filter((m) => m.ws && m.ws.readyState === 1);
    if (activeMembers.length === 0) continue;
    const hostMember = activeMembers.find((m) => m.role === 'host') || activeMembers[0];
    list.push({
      code: room.code,
      title: room.title || `Sala ${room.code}`,
      gameId: room.gameId || 'air-hockey',
      gameTitle:
        room.gameId === 'connect-four'
          ? 'Conecta 4'
          : room.gameId === 'tic-tac-toe'
            ? 'Tres en Raya'
            : 'Neo Air Hockey',
      hostName: hostMember?.name || 'Anfitrión',
      memberCount: activeMembers.length,
      maxMembers: room.maxMembers,
      allowSpectators: room.allowSpectators,
      createdAt: room.createdAt
    });
  }
  return list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 40);
}

// Authoritative Shadow Board Helpers (Connect 4 & Tic-Tac-Toe)
function createShadowMatch(room, gameId) {
  const players = [...room.members.values()].filter((m) => m.role === 'host' || m.role === 'guest');
  const p1 = players.find((m) => m.role === 'host');
  const p2 = players.find((m) => m.role === 'guest');
  const sessionId =
    p1?.userId && p2?.userId
      ? startCompetitiveSession({
          roomCode: room.code,
          gameId,
          player1UserId: p1.userId,
          player2UserId: p2.userId
        })
      : null;

  return {
    sessionId,
    gameId,
    startedAt: Date.now(),
    recorded: false,
    c4Board: Array.from({ length: 6 }, () => Array(7).fill(0)),
    c4Turn: 1,
    tttVariant: 'infinite',
    tttBoard: Array(9).fill(0),
    tttQueues: { 1: [], 2: [] },
    tttTurn: 1
  };
}

function checkShadowC4Win(b) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      const p = b[r][c];
      if (!p) continue;
      for (const [dr, dc] of dirs) {
        const r3 = r + dr * 3;
        const c3 = c + dc * 3;
        if (r3 < 0 || r3 >= 6 || c3 < 0 || c3 >= 7) continue;
        if (b[r + dr][c + dc] === p && b[r + dr * 2][c + dc * 2] === p && b[r3][c3] === p) {
          return { winner: p, draw: false };
        }
      }
    }
  }
  if (b[0].every((v) => v !== 0)) return { winner: 0, draw: true };
  return null;
}

function checkShadowTttWin(b) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, c1, c2] of lines) {
    if (b[a] !== 0 && b[a] === b[c1] && b[a] === b[c2]) return b[a];
  }
  return 0;
}

function processCompetitiveEvent(room, senderRole, packet) {
  if (!packet || typeof packet !== 'object') return;
  if (packet.type === 'SELECT_GAME' && senderRole === 'host') {
    room.gameId = String(packet.gameId || 'air-hockey');
    room.activeMatch = createShadowMatch(room, room.gameId);
    for (const m of room.members.values()) {
      if (m.ws) m.ws.activeGameName = room.gameId;
      if (m.userId) broadcastPresenceToFriends(m.userId);
    }
    return;
  }

  if (packet.type === 'RETURN_HUB') {
    room.activeMatch = null;
    for (const m of room.members.values()) {
      if (m.ws) m.ws.activeGameName = null;
      if (m.userId) broadcastPresenceToFriends(m.userId);
    }
    return;
  }

  if (packet.type !== 'GAME_EVENT' || !packet.payload) return;
  const gameId = packet.game;
  const msg = packet.payload;
  if (!room.activeMatch || room.activeMatch.gameId !== gameId) {
    room.activeMatch = createShadowMatch(room, gameId);
  }
  const match = room.activeMatch;
  if (!match) return;

  if (msg.kind === 'RESTART') {
    room.activeMatch = createShadowMatch(room, gameId);
    if (gameId === 'connect-four' && (msg.starter === 1 || msg.starter === 2)) {
      room.activeMatch.c4Turn = msg.starter;
    }
    if (gameId === 'tic-tac-toe' && (msg.starter === 1 || msg.starter === 2)) {
      room.activeMatch.tttTurn = msg.starter;
    }
    return;
  }

  if (match.recorded || !match.sessionId) return;
  const senderSlot = senderRole === 'host' ? 1 : 2;

  if (gameId === 'connect-four' && msg.kind === 'MOVE') {
    const col = Number(msg.col);
    if (!Number.isInteger(col) || col < 0 || col >= 7) return;
    if (senderSlot !== match.c4Turn) return;
    let row = -1;
    for (let r = 5; r >= 0; r--) {
      if (match.c4Board[r][col] === 0) {
        row = r;
        break;
      }
    }
    if (row === -1) return;
    match.c4Board[row][col] = senderSlot;
    const outcome = checkShadowC4Win(match.c4Board);
    if (outcome) {
      match.recorded = true;
      recordValidatedMatchResult({
        sessionId: match.sessionId,
        gameId,
        winnerSlot: outcome.winner,
        scoreSummary: outcome.draw ? 'Empate' : `4 en línea (${senderSlot === 1 ? 'Naranja' : 'Turquesa'})`
      });
    } else {
      match.c4Turn = match.c4Turn === 1 ? 2 : 1;
    }
    return;
  }

  if (gameId === 'tic-tac-toe') {
    if (msg.kind === 'SET_VARIANT' && senderRole === 'host') {
      match.tttVariant = msg.variant === 'classic' ? 'classic' : 'infinite';
      match.tttBoard = Array(9).fill(0);
      match.tttQueues = { 1: [], 2: [] };
      match.tttTurn = 1;
      return;
    }
    if (msg.kind === 'MOVE') {
      const cell = Number(msg.cell);
      if (!Number.isInteger(cell) || cell < 0 || cell > 8 || match.tttBoard[cell] !== 0) return;
      if (senderSlot !== match.tttTurn) return;
      if (match.tttVariant === 'infinite' && match.tttQueues[senderSlot].length >= 3) {
        const old = match.tttQueues[senderSlot].shift();
        match.tttBoard[old] = 0;
      }
      match.tttBoard[cell] = senderSlot;
      match.tttQueues[senderSlot].push(cell);
      const winner = checkShadowTttWin(match.tttBoard);
      if (winner) {
        match.recorded = true;
        recordValidatedMatchResult({
          sessionId: match.sessionId,
          gameId,
          winnerSlot: winner,
          scoreSummary: match.tttVariant === 'infinite' ? 'Tres en Raya Infinito' : 'Tres en Raya Clásico'
        });
      } else if (match.tttVariant === 'classic' && match.tttBoard.every((v) => v !== 0)) {
        match.recorded = true;
        recordValidatedMatchResult({
          sessionId: match.sessionId,
          gameId,
          winnerSlot: 0,
          scoreSummary: 'Empate Clásico'
        });
      } else {
        match.tttTurn = match.tttTurn === 1 ? 2 : 1;
      }
    }
    return;
  }

  if (gameId === 'air-hockey' && msg.kind === 'GOAL_EVENT' && senderRole === 'host') {
    if (msg.phase === 'finished' && (msg.winner === 1 || msg.winner === 2)) {
      if (Date.now() - match.startedAt >= 4000) {
        match.recorded = true;
        recordValidatedMatchResult({
          sessionId: match.sessionId,
          gameId,
          winnerSlot: Number(msg.winner),
          scoreSummary: `${Number(msg.score1) || 0} - ${Number(msg.score2) || 0}`
        });
      }
    }
  }
}

function serializeRoomState(room) {
  const members = [...room.members.values()].map((m) => ({
    clientId: m.clientId,
    userId: m.userId || null,
    name: m.name,
    avatarColor: m.avatarColor || '#f58229',
    avatarIcon: m.avatarIcon || '🎮',
    device: m.device || 'Web',
    role: m.role,
    ready: Boolean(m.ready),
    afk: Boolean(m.afk),
    connected: Boolean(m.ws && m.ws.readyState === 1)
  }));
  return {
    type: 'ROOM_STATE',
    room: {
      code: room.code,
      visibility: room.visibility,
      title: room.title,
      gameId: room.gameId,
      maxMembers: room.maxMembers,
      allowSpectators: room.allowSpectators
    },
    members
  };
}

function broadcastRoomState(room) {
  const pkt = serializeRoomState(room);
  for (const m of room.members.values()) {
    if (m.ws && m.ws.readyState === 1) {
      safeSend(m.ws, { sys: 'PACKET', payload: pkt });
    }
  }
}

export function attachRoomWebSocketServer(httpServer) {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 64 * 1024
  });

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      for (const [cid, m] of room.members.entries()) {
        if (!m.ws && m.disconnectedAt && now - m.disconnectedAt > RECONNECT_GRACE_MS) {
          room.members.delete(cid);
          if (m.role === 'host') {
            const nextPlayer = [...room.members.values()].find((x) => x.ws && x.role === 'guest');
            if (nextPlayer) {
              nextPlayer.role = 'host';
              nextPlayer.ws.role = 'host';
              room.hostClientId = nextPlayer.clientId;
              safeSend(nextPlayer.ws, { sys: 'HOST_PROMOTED', code });
            } else {
              for (const rem of room.members.values()) {
                if (rem.ws) safeSend(rem.ws, { sys: 'PEER_CLOSED' });
              }
              rooms.delete(code);
              break;
            }
          } else {
            const host = [...room.members.values()].find((x) => x.role === 'host' && x.ws);
            if (host) safeSend(host.ws, { sys: 'GUEST_LEFT' });
            broadcastRoomState(room);
          }
        } else if (m.ws && m.lastActivityAt && now - m.lastActivityAt > AFK_THRESHOLD_MS && !m.afk) {
          m.afk = true;
          broadcastRoomState(room);
        }
      }

      const anyAlive = [...room.members.values()].some(
        (m) => (m.ws && m.ws.readyState === 1) || (m.disconnectedAt && now - m.disconnectedAt <= RECONNECT_GRACE_MS)
      );
      if (!anyAlive || now - room.createdAt > 1000 * 60 * 60 * 6) {
        for (const m of room.members.values()) {
          if (m.ws) safeSend(m.ws, { sys: 'PEER_CLOSED' });
        }
        rooms.delete(code);
      }
    }
  }, 15_000);
  cleanupInterval.unref?.();

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = (request.url || '').split('?')[0];
    if (pathname !== '/ws') return;
    socket.setNoDelay?.(true);
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, request) => {
    ws.ip = getClientIp(request);
    ws.roomCode = null;
    ws.role = null;
    ws.clientId = null;
    ws.userId = null;
    ws.username = null;
    ws.presenceStatus = 'online';
    ws.activeGameName = null;
    ws.isAlive = true;

    const bindAuthenticatedToken = (rawToken) => {
      if (!rawToken) return;
      try {
        const db = getDb();
        const row = db
          .prepare(
            `SELECT u.id, u.username
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ?`
          )
          .get(sha256Hex(String(rawToken)));
        if (row) {
          ws.userId = row.id;
          ws.clientId = row.id;
          ws.username = row.username;
          if (!userSockets.has(row.id)) userSockets.set(row.id, new Set());
          userSockets.get(row.id).add(ws);
          broadcastPresenceToFriends(row.id);
        }
      } catch {}
    };

    const cookieToken = extractSessionToken(request);
    if (cookieToken) {
      bindAuthenticatedToken(cookieToken);
    }

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      // Authenticate socket with session token or profile
      if (msg.sys === 'AUTH_HELLO') {
        if (msg.token) {
          bindAuthenticatedToken(msg.token);
        } else if (!ws.userId && msg.profile?.id) {
          ws.clientId = sanitizeText(msg.profile.id, 48);
        }
        return;
      }

      if (msg.sys === 'SET_PRESENCE' && ws.userId) {
        const next = ['online', 'away', 'busy'].includes(msg.status) ? msg.status : 'online';
        ws.presenceStatus = next;
        broadcastPresenceToFriends(ws.userId);
        return;
      }

      if (msg.sys === 'CHAT_TYPING' && ws.userId && msg.conversationId) {
        try {
          const db = getDb();
          const convId = String(msg.conversationId);
          const isMem = db
            .prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
            .get(convId, ws.userId);
          if (!isMem) return;
          const others = db
            .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?')
            .all(convId, ws.userId);
          for (const o of others) {
            if (!isBlockedBetween(db, ws.userId, o.user_id)) {
              pushToUser(o.user_id, {
                sys: 'CHAT_TYPING',
                conversationId: convId,
                userId: ws.userId,
                username: ws.username || 'Amigo'
              });
            }
          }
        } catch {}
        return;
      }

      // 1. Host creates a room
      if (msg.sys === 'CREATE_ROOM') {
        if (!rateLimiter.allow(`ws_create:${ws.ip}`, 10, 60_000) || rooms.size >= MAX_ROOMS_GLOBAL) {
          safeSend(ws, { sys: 'JOIN_ERROR', message: 'Límite temporal de salas alcanzado.' });
          return;
        }
        const preferred = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
        const code = preferred.length === 5 && !rooms.has(preferred) ? preferred : generateServerCode();
        const clientId = sanitizeText(msg.clientId || ws.clientId || 'host_' + crypto.randomBytes(4).toString('hex'), 48);
        const reconnectToken = crypto.randomBytes(16).toString('hex');
        ws.clientId = clientId;
        ws.roomCode = code;
        ws.role = 'host';

        const member = {
          ws,
          clientId,
          userId: ws.userId || null,
          name: sanitizeText(msg.profile?.name || 'Anfitrión', 16) || 'Anfitrión',
          avatarColor: msg.profile?.avatarColor || '#f58229',
          avatarIcon: sanitizeText(msg.profile?.avatarIcon || '🎮', 4),
          device: sanitizeText(msg.profile?.device || 'Web', 16),
          role: 'host',
          ready: false,
          afk: false,
          reconnectToken,
          lastActivityAt: Date.now(),
          disconnectedAt: null
        };

        const room = {
          code,
          visibility: msg.visibility === 'public' ? 'public' : 'private',
          title: sanitizeText(msg.title || '', 32),
          gameId: sanitizeText(msg.gameId || 'air-hockey', 24),
          maxMembers: Math.max(2, Math.min(4, Number(msg.maxMembers) || 2)),
          allowSpectators: msg.allowSpectators !== false,
          hostClientId: clientId,
          members: new Map([[clientId, member]]),
          activeMatch: null,
          createdAt: Date.now()
        };
        rooms.set(code, room);
        safeSend(ws, { sys: 'ROOM_CREATED', code, reconnectToken });
        broadcastRoomState(room);
        return;
      }

      // 2. Guest or Spectator joins room
      if (msg.sys === 'JOIN_ROOM') {
        if (!rateLimiter.allow(`ws_join:${ws.ip}`, 20, 60_000)) {
          safeSend(ws, { sys: 'JOIN_ERROR', message: 'Demasiados intentos. Espera unos segundos.' });
          return;
        }
        const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
        const room = rooms.get(code);
        if (!room) {
          safeSend(ws, {
            sys: 'JOIN_ERROR',
            reason: 'NOT_FOUND',
            message: `No existe ninguna sala activa con el código ${code}.`
          });
          return;
        }

        const clientId = sanitizeText(msg.clientId || ws.clientId || 'gst_' + crypto.randomBytes(4).toString('hex'), 48);
        const existingMember = room.members.get(clientId);

        // Reconnect or duplicate tab takeover
        if (existingMember) {
          if (existingMember.ws && existingMember.ws !== ws) {
            try {
              existingMember.ws.roomCode = null;
              existingMember.ws.close();
            } catch {}
          }
          existingMember.ws = ws;
          existingMember.disconnectedAt = null;
          existingMember.afk = false;
          existingMember.lastActivityAt = Date.now();
          ws.clientId = clientId;
          ws.roomCode = code;
          ws.role = existingMember.role;
          safeSend(ws, { sys: 'JOIN_OK', code, role: existingMember.role, reconnectToken: existingMember.reconnectToken });
          broadcastRoomState(room);
          const host = [...room.members.values()].find((m) => m.role === 'host' && m.ws);
          if (host && host !== existingMember) {
            safeSend(host.ws, { sys: 'PEER_JOINED', code });
          }
          return;
        }

        const guestSlotTaken = [...room.members.values()].some((m) => m.role === 'guest');
        const activeCount = room.members.size;
        if (activeCount >= room.maxMembers || (guestSlotTaken && !room.allowSpectators)) {
          safeSend(ws, {
            sys: 'JOIN_ERROR',
            reason: 'ROOM_FULL',
            message: 'Esa sala está completa.'
          });
          return;
        }

        const role = guestSlotTaken ? 'spectator' : 'guest';
        const reconnectToken = crypto.randomBytes(16).toString('hex');
        ws.clientId = clientId;
        ws.roomCode = code;
        ws.role = role;

        const member = {
          ws,
          clientId,
          userId: ws.userId || null,
          name: sanitizeText(msg.profile?.name || 'Jugador', 16) || 'Jugador',
          avatarColor: msg.profile?.avatarColor || '#1ad1be',
          avatarIcon: sanitizeText(msg.profile?.avatarIcon || '🎮', 4),
          device: sanitizeText(msg.profile?.device || 'Web', 16),
          role,
          ready: false,
          afk: false,
          reconnectToken,
          lastActivityAt: Date.now(),
          disconnectedAt: null
        };
        room.members.set(clientId, member);

        safeSend(ws, { sys: 'JOIN_OK', code, role, reconnectToken });
        const host = [...room.members.values()].find((m) => m.role === 'host' && m.ws);
        if (role === 'guest' && host) {
          safeSend(host.ws, { sys: 'PEER_JOINED', code });
        }
        broadcastRoomState(room);
        return;
      }

      // 2b. Explicit Reconnect Token
      if (msg.sys === 'RECONNECT_ROOM') {
        const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
        const room = rooms.get(code);
        if (!room) {
          safeSend(ws, { sys: 'JOIN_ERROR', reason: 'EXPIRED', message: 'La sala ya se cerró.' });
          return;
        }
        const member = [...room.members.values()].find((m) => m.reconnectToken === msg.reconnectToken);
        if (!member) {
          safeSend(ws, { sys: 'JOIN_ERROR', reason: 'INVALID_TOKEN', message: 'Sesión de sala expirada.' });
          return;
        }
        member.ws = ws;
        member.disconnectedAt = null;
        member.afk = false;
        member.lastActivityAt = Date.now();
        ws.clientId = member.clientId;
        ws.roomCode = code;
        ws.role = member.role;
        safeSend(ws, { sys: 'JOIN_OK', code, role: member.role, reconnectToken: member.reconnectToken });
        const peer = [...room.members.values()].find((m) => m !== member && m.ws && m.role !== 'spectator');
        if (peer) safeSend(peer.ws, { sys: 'PEER_JOINED', code });
        broadcastRoomState(room);
        return;
      }

      if (!ws.roomCode) return;
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const sender = room.members.get(ws.clientId);
      if (sender) {
        sender.lastActivityAt = Date.now();
        if (sender.afk) {
          sender.afk = false;
          broadcastRoomState(room);
        }
      }

      // Room Management Controls
      if (msg.sys === 'SET_READY' && sender) {
        sender.ready = Boolean(msg.ready);
        broadcastRoomState(room);
        return;
      }

      if (msg.sys === 'UPDATE_ROOM_CONFIG' && sender?.role === 'host') {
        if (msg.visibility === 'public' || msg.visibility === 'private') room.visibility = msg.visibility;
        if (typeof msg.title === 'string') room.title = sanitizeText(msg.title, 32);
        if (typeof msg.gameId === 'string') room.gameId = sanitizeText(msg.gameId, 24);
        if (msg.maxMembers) room.maxMembers = Math.max(2, Math.min(4, Number(msg.maxMembers)));
        broadcastRoomState(room);
        return;
      }

      if (msg.sys === 'TRANSFER_HOST' && sender?.role === 'host') {
        const target = room.members.get(String(msg.targetClientId || ''));
        if (target && target !== sender && target.ws) {
          sender.role = 'guest';
          ws.role = 'guest';
          target.role = 'host';
          target.ws.role = 'host';
          room.hostClientId = target.clientId;
          broadcastRoomState(room);
        }
        return;
      }

      if (msg.sys === 'KICK_MEMBER' && sender?.role === 'host') {
        const target = room.members.get(String(msg.targetClientId || ''));
        if (target && target !== sender) {
          if (target.ws) {
            safeSend(target.ws, { sys: 'KICKED', message: 'El anfitrión te expulsó de la sala.' });
            target.ws.roomCode = null;
            target.ws.close();
          }
          room.members.delete(target.clientId);
          broadcastRoomState(room);
        }
        return;
      }

      if (msg.sys === 'SWITCH_ROLE' && sender && sender.role !== 'host') {
        if (sender.role === 'guest' && room.allowSpectators) {
          sender.role = 'spectator';
          ws.role = 'spectator';
          broadcastRoomState(room);
        } else if (sender.role === 'spectator') {
          const guestTaken = [...room.members.values()].some((m) => m.role === 'guest');
          if (!guestTaken) {
            sender.role = 'guest';
            ws.role = 'guest';
            broadcastRoomState(room);
          }
        }
        return;
      }

      // 3. Volatile high-frequency frames (60Hz Air Hockey)
      if (msg.sys === 'VOLATILE') {
        if (ws.role === 'spectator' && msg.payload?.type === 'GAME_EVENT') return;
        for (const m of room.members.values()) {
          if (m.ws && m.ws !== ws && m.ws.readyState === 1 && m.ws.bufferedAmount <= 2048) {
            safeSend(m.ws, { sys: 'PACKET', payload: msg.payload });
          }
        }
        return;
      }

      // 4. Direct UDP Fast-Lane RTC Signaling (host <-> guest)
      if (msg.sys === 'RTC_SIGNAL') {
        const peer = [...room.members.values()].find(
          (m) => m.ws && m.ws !== ws && m.role !== 'spectator'
        );
        if (peer) safeSend(peer.ws, { sys: 'RTC_SIGNAL', signal: msg.signal });
        return;
      }

      // 5. WebRTC Voice Signaling inside room
      if (msg.sys === 'VOICE_SIGNAL' && msg.signal) {
        const pkt = {
          type: 'VOICE_SIGNAL',
          fromId: ws.clientId,
          signal: msg.signal
        };
        if (msg.signal.to) {
          const target = [...room.members.values()].find(
            (m) => (m.clientId === msg.signal.to || m.userId === msg.signal.to) && m.ws
          );
          if (target) safeSend(target.ws, { sys: 'PACKET', payload: pkt });
        } else {
          for (const m of room.members.values()) {
            if (m.ws && m.ws !== ws) safeSend(m.ws, { sys: 'PACKET', payload: pkt });
          }
        }
        return;
      }

      // 6. Reliable game/session packet
      if (msg.sys === 'RELAY' && msg.payload) {
        // Spectators cannot inject GAME_EVENT or SELECT_GAME
        if (
          ws.role === 'spectator' &&
          ['GAME_EVENT', 'SELECT_GAME', 'RETURN_HUB'].includes(msg.payload.type)
        ) {
          return;
        }
        processCompetitiveEvent(room, ws.role, msg.payload);

        for (const m of room.members.values()) {
          if (m.ws && m.ws !== ws && m.ws.readyState === 1) {
            safeSend(m.ws, { sys: 'PACKET', payload: msg.payload });
          }
        }
      }
    });

    ws.on('close', () => {
      if (ws.userId) {
        const set = userSockets.get(ws.userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) userSockets.delete(ws.userId);
        }
        broadcastPresenceToFriends(ws.userId);
      }

      if (!ws.roomCode) return;
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const member = room.members.get(ws.clientId);
      if (!member || member.ws !== ws) return;

      member.ws = null;
      member.disconnectedAt = Date.now();
      // Keep member in grace window for RECONNECT_ROOM instead of immediately deleting room!
    });
  });

  const pingInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      try {
        client.ping();
      } catch {}
    }
  }, 25_000);
  pingInterval.unref?.();

  return wss;
}
