import { WebSocketServer } from 'ws';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateServerCode(rooms) {
  for (let attempt = 0; attempt < 25; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return 'RM' + Math.floor(100 + Math.random() * 900);
}

function safeSend(ws, data) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // Ignore closed socket errors
    }
  }
}

export function attachRoomWebSocketServer(httpServer) {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 64 * 1024
  });
  const rooms = new Map(); // code -> { host: ws, guest: ws | null, createdAt: number }

  // Cleanup stale empty rooms periodically
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      const hostAlive = room.host && room.host.readyState === 1;
      if (!hostAlive || now - room.createdAt > 1000 * 60 * 60 * 6) {
        if (room.guest) safeSend(room.guest, { sys: 'PEER_CLOSED' });
        rooms.delete(code);
      }
    }
  }, 60_000);
  cleanupInterval.unref?.();

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = (request.url || '').split('?')[0];
    if (pathname !== '/ws') {
      return;
    }
    // Disable Nagle's algorithm so small 60Hz game packets dispatch immediately
    socket.setNoDelay?.(true);
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    ws.roomCode = null;
    ws.role = null;
    ws.isAlive = true;

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

      // 1. Host requests a new room
      if (msg.sys === 'CREATE_ROOM') {
        const preferred = String(msg.code || '')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 5);
        const code =
          preferred.length === 5 && !rooms.has(preferred) ? preferred : generateServerCode(rooms);

        rooms.set(code, {
          host: ws,
          guest: null,
          createdAt: Date.now()
        });
        ws.roomCode = code;
        ws.role = 'host';
        safeSend(ws, { sys: 'ROOM_CREATED', code });
        return;
      }

      // 2. Guest joins an existing room
      if (msg.sys === 'JOIN_ROOM') {
        const code = String(msg.code || '')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 5);
        const room = rooms.get(code);
        if (!room || !room.host || room.host.readyState !== 1) {
          safeSend(ws, {
            sys: 'JOIN_ERROR',
            reason: 'NOT_FOUND',
            message: `No existe ninguna sala activa con el código ${code}.`
          });
          return;
        }
        if (room.guest && room.guest.readyState === 1) {
          safeSend(ws, {
            sys: 'JOIN_ERROR',
            reason: 'ROOM_FULL',
            message: 'Esa sala ya tiene 2 jugadores conectados.'
          });
          return;
        }

        room.guest = ws;
        ws.roomCode = code;
        ws.role = 'guest';

        safeSend(ws, { sys: 'JOIN_OK', code });
        safeSend(room.host, { sys: 'PEER_JOINED', code });
        return;
      }

      if (!ws.roomCode) return;
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const target = ws.role === 'host' ? room.guest : room.host;
      if (!target || target.readyState !== 1) return;

      // 3. Volatile high-frequency frames (drop immediately if target socket has backlog!)
      if (msg.sys === 'VOLATILE') {
        if (target.bufferedAmount > 2048) {
          return; // Never queue stale physics frames behind a TCP retransmit
        }
        safeSend(target, { sys: 'PACKET', payload: msg.payload });
        return;
      }

      // 4. WebRTC SDP/ICE signaling to upgrade to direct P2P UDP fast-lane
      if (msg.sys === 'RTC_SIGNAL') {
        safeSend(target, { sys: 'RTC_SIGNAL', signal: msg.signal });
        return;
      }

      // 5. Reliable game/session packet
      if (msg.sys === 'RELAY') {
        safeSend(target, { sys: 'PACKET', payload: msg.payload });
      }
    });

    ws.on('close', () => {
      if (!ws.roomCode) return;
      const room = rooms.get(ws.roomCode);
      if (!room) return;

      if (ws.role === 'host') {
        if (room.guest && room.guest.readyState === 1) {
          safeSend(room.guest, { sys: 'HOST_LEFT' });
          room.guest.roomCode = null;
        }
        rooms.delete(ws.roomCode);
      } else if (ws.role === 'guest' && room.guest === ws) {
        room.guest = null;
        if (room.host && room.host.readyState === 1) {
          safeSend(room.host, { sys: 'GUEST_LEFT' });
        }
      }
    });
  });

  // Heartbeat to keep Render / mobile carrier NAT sockets alive
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
