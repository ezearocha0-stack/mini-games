import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';

process.env.MINIGAMES_DB_PATH = ':memory:';
process.env.NODE_ENV = 'development';

const { getDb, closeDbForTests } = await import('../server/db.js');
const { handleApiRequest } = await import('../server/api.js');
const { applySecurityHeaders } = await import('../server/security.js');
const { attachRoomWebSocketServer } = await import('../server/wsRooms.js');

let server;
let baseUrl;
let wsBaseUrl;

async function jsonApi(path, { method = 'GET', body = null, token = '' } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  return { status: res.status, headers: res.headers, data };
}

function openWsClient() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws`);
    const queue = [];
    const waiters = [];

    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (waiters.length > 0) {
        const { predicate, res } = waiters[0];
        if (!predicate || predicate(msg)) {
          waiters.shift();
          res(msg);
          return;
        }
      }
      queue.push(msg);
    });

    ws.nextMsg = (predicate = null, timeoutMs = 4000) => {
      const idx = queue.findIndex((m) => !predicate || predicate(m));
      if (idx !== -1) return Promise.resolve(queue.splice(idx, 1)[0]);
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error('WS wait timeout')), timeoutMs);
        waiters.push({
          predicate,
          res: (m) => {
            clearTimeout(timer);
            res(m);
          }
        });
      });
    };

    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

describe('Mini-Games Platform Integration Suite', () => {
  let tokenA = '';
  let userA = null;
  let tokenB = '';
  let userB = null;
  let tokenC = '';
  let userC = null;

  before(async () => {
    getDb();
    server = http.createServer(async (req, res) => {
      applySecurityHeaders(res);
      const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (u.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (u.pathname.startsWith('/api/')) {
        await handleApiRequest(req, res);
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });
    attachRoomWebSocketServer(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
    wsBaseUrl = `ws://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    closeDbForTests();
  });

  it('exposes security headers, healthz, capabilities & dynamic TURN ICE config', async () => {
    const hz = await fetch(`${baseUrl}/healthz`);
    assert.equal(hz.status, 200);
    assert.equal(hz.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(hz.headers.get('x-frame-options'), 'DENY');

    const caps = await jsonApi('/api/system/capabilities');
    assert.equal(caps.status, 200);
    assert.equal(caps.data.sqliteReady, true);

    process.env.TURN_URLS = 'turn:turn.example.com:3478';
    process.env.TURN_SHARED_SECRET = 'test-ephemeral-secret';
    const ice = await jsonApi('/api/rtc/ice');
    assert.equal(ice.status, 200);
    const turnEntry = ice.data.iceServers.find((s) => String(s.urls).includes('turn:'));
    assert.ok(turnEntry);
    assert.ok(turnEntry.username && turnEntry.credential);
    delete process.env.TURN_URLS;
    delete process.env.TURN_SHARED_SECRET;
  });

  it('registers users with guest migration, 6-digit OTP verification, and protects public_id & email', async () => {
    const regA = await jsonApi('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'alpha@example.com',
        password: 'Password123!',
        username: 'AlphaPro',
        guestMigration: {
          guestId: 'gst_test_alpha',
          name: 'AlphaGuest',
          avatarColor: '#1ad1be',
          avatarIcon: '🔥',
          favoriteGames: ['air-hockey'],
          settings: { theme: 'light', accent: 'teal' }
        }
      }
    });
    assert.equal(regA.status, 201);
    assert.match(regA.data.devOtpHint, /^\d{6}$/);

    const verA = await jsonApi('/api/auth/verify-otp', {
      method: 'POST',
      body: { email: 'alpha@example.com', code: regA.data.devOtpHint, purpose: 'verify_email' }
    });
    assert.equal(verA.status, 200);
    assert.ok(verA.data.token);
    tokenA = verA.data.token;
    userA = verA.data.user;
    assert.equal(verA.data.settings.theme, 'light');
    assert.deepEqual(userA.favoriteGames, ['air-hockey']);

    // Public profile must hide email
    const pubA = await jsonApi(`/api/profile/${userA.publicId}`);
    assert.equal(pubA.status, 200);
    assert.equal(pubA.data.profile.email, undefined);

    // Reject immutable publicId change
    const badPatch = await jsonApi('/api/profile', {
      method: 'PATCH',
      token: tokenA,
      body: { publicId: 'MG-HACKED' }
    });
    assert.equal(badPatch.status, 403);

    // Register User B & User C
    const regB = await jsonApi('/api/auth/register', {
      method: 'POST',
      body: { email: 'beta@example.com', password: 'Password123!', username: 'BetaGamer' }
    });
    const verB = await jsonApi('/api/auth/verify-otp', {
      method: 'POST',
      body: { email: 'beta@example.com', code: regB.data.devOtpHint, purpose: 'verify_email' }
    });
    tokenB = verB.data.token;
    userB = verB.data.user;

    const regC = await jsonApi('/api/auth/register', {
      method: 'POST',
      body: { email: 'gamma@example.com', password: 'Password123!', username: 'GammaSpec' }
    });
    const verC = await jsonApi('/api/auth/verify-otp', {
      method: 'POST',
      body: { email: 'gamma@example.com', code: regC.data.devOtpHint, purpose: 'verify_email' }
    });
    tokenC = verC.data.token;
    userC = verC.data.user;
  });

  it('supports friend requests, DMs, reactions, group permissions, rate limits, and blocks', async () => {
    const reqRes = await jsonApi('/api/friends/request', {
      method: 'POST',
      token: tokenA,
      body: { targetUserId: userB.id }
    });
    assert.equal(reqRes.status, 201);

    const friendsB = await jsonApi('/api/friends', { token: tokenB });
    assert.equal(friendsB.data.incoming.length, 1);

    const acc = await jsonApi('/api/friends/respond', {
      method: 'POST',
      token: tokenB,
      body: { requestId: reqRes.data.requestId, decision: 'accept' }
    });
    assert.equal(acc.status, 200);

    // Verify DM + reaction + spam rate limit
    const dm = await jsonApi('/api/conversations/dm', {
      method: 'POST',
      token: tokenA,
      body: { targetUserId: userB.id }
    });
    assert.equal(dm.status, 200);
    const convId = dm.data.conversation.id;

    const m1 = await jsonApi(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      token: tokenA,
      body: { body: '<script>alert(1)</script> Hola!' }
    });
    assert.equal(m1.status, 201);

    const react = await jsonApi(`/api/messages/${m1.data.message.id}/react`, {
      method: 'POST',
      token: tokenB,
      body: { emoji: '🔥' }
    });
    assert.equal(react.status, 200);
    assert.equal(react.data.message.reactions['🔥'].length, 1);

    // Rate limit check (5 msgs per 4s -> 6th hits 429)
    for (let i = 0; i < 4; i++) {
      await jsonApi(`/api/conversations/${convId}/messages`, {
        method: 'POST',
        token: tokenA,
        body: { body: `msg ${i}` }
      });
    }
    const spam = await jsonApi(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      token: tokenA,
      body: { body: 'too fast' }
    });
    assert.equal(spam.status, 429);

    // Group creation & non-owner permission check
    const grp = await jsonApi('/api/conversations/group', {
      method: 'POST',
      token: tokenA,
      body: { title: 'Escuadrón', memberIds: [userB.id] }
    });
    assert.equal(grp.status, 201);
    const kickFail = await jsonApi(
      `/api/conversations/${grp.data.conversation.id}/members/${userA.id}`,
      { method: 'DELETE', token: tokenB }
    );
    assert.equal(kickFail.status, 403);

    // Block enforcement & unblock
    const blk = await jsonApi('/api/blocks', {
      method: 'POST',
      token: tokenB,
      body: { targetUserId: userA.id }
    });
    assert.equal(blk.status, 200);
    const blockedDmOpen = await jsonApi('/api/conversations/dm', {
      method: 'POST',
      token: tokenA,
      body: { targetUserId: userB.id }
    });
    assert.equal(blockedDmOpen.status, 403);
    const blockedDmSend = await jsonApi(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      token: tokenB,
      body: { body: 'blocked check' }
    });
    assert.equal(blockedDmSend.status, 403);

    await jsonApi(`/api/blocks/${userA.id}`, { method: 'DELETE', token: tokenB });
  });

  it('runs WS Crossplay room, enforces spectator read-only, validates ELO on server & reconnects', async () => {
    const wsA = await openWsClient();
    const wsB = await openWsClient();
    const wsSpec = await openWsClient();

    wsA.send(JSON.stringify({ sys: 'AUTH_HELLO', token: tokenA }));
    wsB.send(JSON.stringify({ sys: 'AUTH_HELLO', token: tokenB }));
    wsSpec.send(JSON.stringify({ sys: 'AUTH_HELLO', token: tokenC }));

    wsA.send(
      JSON.stringify({
        sys: 'CREATE_ROOM',
        visibility: 'public',
        title: 'Torneo Test',
        gameId: 'tic-tac-toe',
        maxMembers: 3,
        allowSpectators: true,
        profile: { id: userA.id, name: userA.username, device: 'PC' }
      })
    );
    const created = await wsA.nextMsg((m) => m.sys === 'ROOM_CREATED');
    const code = created.code;
    assert.equal(code.length, 5);

    const pubRooms = await jsonApi('/api/rooms/public');
    assert.ok(pubRooms.data.rooms.some((r) => r.code === code));

    wsB.send(
      JSON.stringify({
        sys: 'JOIN_ROOM',
        code,
        profile: { id: userB.id, name: userB.username, device: 'Android' }
      })
    );
    const joinB = await wsB.nextMsg((m) => m.sys === 'JOIN_OK');
    assert.equal(joinB.role, 'guest');
    const reconnectTokenB = joinB.reconnectToken;
    await wsA.nextMsg((m) => m.sys === 'PEER_JOINED');

    wsSpec.send(
      JSON.stringify({
        sys: 'JOIN_ROOM',
        code,
        profile: { id: userC.id, name: userC.username, device: 'PC' }
      })
    );
    const joinSpec = await wsSpec.nextMsg((m) => m.sys === 'JOIN_OK');
    assert.equal(joinSpec.role, 'spectator');

    // Start Tic-Tac-Toe & test Spectator cannot inject GAME_EVENT
    wsA.send(
      JSON.stringify({
        sys: 'RELAY',
        payload: { type: 'SELECT_GAME', gameId: 'tic-tac-toe' }
      })
    );
    await wsB.nextMsg((m) => m.sys === 'PACKET' && m.payload?.type === 'SELECT_GAME');

    wsSpec.send(
      JSON.stringify({
        sys: 'RELAY',
        payload: { type: 'GAME_EVENT', game: 'tic-tac-toe', payload: { kind: 'MOVE', cell: 8, player: 1 } }
      })
    );

    // Valid P1 (A) win: 0, 1, 2; P2 (B): 3, 4
    const relayMove = (ws, cell, player) =>
      ws.send(
        JSON.stringify({
          sys: 'RELAY',
          payload: { type: 'GAME_EVENT', game: 'tic-tac-toe', payload: { kind: 'MOVE', cell, player } }
        })
      );
    relayMove(wsA, 0, 1);
    await wsB.nextMsg((m) => m.sys === 'PACKET' && m.payload?.payload?.cell === 0);
    relayMove(wsB, 3, 2);
    await wsA.nextMsg((m) => m.sys === 'PACKET' && m.payload?.payload?.cell === 3);
    relayMove(wsA, 1, 1);
    await wsB.nextMsg((m) => m.sys === 'PACKET' && m.payload?.payload?.cell === 1);
    relayMove(wsB, 4, 2);
    await wsA.nextMsg((m) => m.sys === 'PACKET' && m.payload?.payload?.cell === 4);
    relayMove(wsA, 2, 1);
    await wsB.nextMsg((m) => m.sys === 'PACKET' && m.payload?.payload?.cell === 2);

    // Give DB transaction a tiny tick then verify ELO, badge & ranking
    await new Promise((r) => setTimeout(r, 60));
    const meA = await jsonApi('/api/auth/me', { token: tokenA });
    assert.equal(meA.data.user.stats.wins, 1);
    assert.ok(meA.data.user.stats.eloTicTacToe > 1000);
    assert.ok(meA.data.user.badges.some((b) => b.id === 'first_win' && b.unlocked));

    const rank = await jsonApi('/api/rankings?game=tic-tac-toe');
    assert.equal(rank.data.leaderboard[0].id, userA.id);

    const hist = await jsonApi('/api/matches/history', { token: tokenA });
    assert.equal(hist.data.history.length, 1);

    // Test drop + RECONNECT_ROOM
    wsB.close();
    await new Promise((r) => setTimeout(r, 50));
    const wsB2 = await openWsClient();
    wsB2.send(JSON.stringify({ sys: 'RECONNECT_ROOM', code, reconnectToken: reconnectTokenB }));
    const rec = await wsB2.nextMsg((m) => m.sys === 'JOIN_OK');
    assert.equal(rec.role, 'guest');

    wsA.close();
    wsB2.close();
    wsSpec.close();
  });
});
