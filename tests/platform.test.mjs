import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';

import { createClient } from '@supabase/supabase-js';

process.env.MINIGAMES_DB_PATH = ':memory:';
process.env.NODE_ENV = 'development';
process.env.MINIGAMES_TEST_CONSOLE_OTP = '1';

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

  it('registers users directly without OTP, migrates guest data, and protects public_id & email', async () => {
    const regA = await jsonApi('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'alpha@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
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
    assert.ok(regA.data.token);
    assert.equal(regA.data.user.emailVerified, false);
    assert.equal(regA.data.devOtpHint, undefined);
    tokenA = regA.data.token;
    userA = regA.data.user;
    assert.equal(regA.data.settings.theme, 'light');
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

    // Register User B & User C directly
    const regB = await jsonApi('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'beta@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        username: 'BetaGamer'
      }
    });
    assert.equal(regB.status, 201);
    tokenB = regB.data.token;
    userB = regB.data.user;

    const regC = await jsonApi('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'gamma@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        username: 'GammaSpec'
      }
    });
    assert.equal(regC.status, 201);
    tokenC = regC.data.token;
    userC = regC.data.user;

    // Search must find registered users without requiring email_verified = 1
    const searchRes = await jsonApi('/api/users/search?q=BetaGamer', { token: tokenA });
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.data.users.some((u) => u.id === userB.id));
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

  it('validates Battleship hidden fleets server-side and updates multi-game ELO rankings', async () => {
    const wsA = await openWsClient();
    const wsB = await openWsClient();
    try {
      wsA.send(JSON.stringify({ sys: 'AUTH_HELLO', token: tokenA }));
      wsB.send(JSON.stringify({ sys: 'AUTH_HELLO', token: tokenB }));

      wsA.send(
        JSON.stringify({
          sys: 'CREATE_ROOM',
          gameId: 'battleship',
          profile: { id: userA.id, name: userA.username, device: 'PC' }
        })
      );
      const created = await wsA.nextMsg((m) => m.sys === 'ROOM_CREATED');
      wsB.send(
        JSON.stringify({
          sys: 'JOIN_ROOM',
          code: created.code,
          profile: { id: userB.id, name: userB.username, device: 'Android' }
        })
      );
      await wsB.nextMsg((m) => m.sys === 'JOIN_OK');
      await wsA.nextMsg((m) => m.sys === 'PEER_JOINED');

      wsA.send(JSON.stringify({ sys: 'RELAY', payload: { type: 'SELECT_GAME', gameId: 'battleship' } }));
      await wsB.nextMsg((m) => m.sys === 'PACKET' && m.payload?.type === 'SELECT_GAME');

      const fleetA = [
        { id: 'carrier', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
        { id: 'battleship', cells: [[2, 0], [2, 1], [2, 2], [2, 3]] },
        { id: 'cruiser', cells: [[4, 0], [4, 1], [4, 2]] },
        { id: 'submarine', cells: [[6, 0], [6, 1], [6, 2]] },
        { id: 'destroyer', cells: [[8, 0], [8, 1]] }
      ];
      const fleetB = [
        { id: 'carrier', cells: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]] },
        { id: 'battleship', cells: [[3, 0], [3, 1], [3, 2], [3, 3]] },
        { id: 'cruiser', cells: [[5, 0], [5, 1], [5, 2]] },
        { id: 'submarine', cells: [[7, 0], [7, 1], [7, 2]] },
        { id: 'destroyer', cells: [[9, 0], [9, 1]] }
      ];

      // Send PLACE_FLEET: server must NEVER broadcast coordinates (only FLEET_READY)
      wsA.send(
        JSON.stringify({
          sys: 'RELAY',
          payload: { type: 'GAME_EVENT', game: 'battleship', payload: { kind: 'PLACE_FLEET', ships: fleetA } }
        })
      );
      const readyAOnB = await wsB.nextMsg((m) => m.sys === 'PACKET' && m.payload?.payload?.kind === 'FLEET_READY');
      assert.equal(readyAOnB.payload.payload.ships, undefined);
      assert.equal(readyAOnB.payload.payload.bothReady, false);

      wsB.send(
        JSON.stringify({
          sys: 'RELAY',
          payload: { type: 'GAME_EVENT', game: 'battleship', payload: { kind: 'PLACE_FLEET', ships: fleetB } }
        })
      );
      const readyBOnA = await wsA.nextMsg((m) => m.sys === 'PACKET' && m.payload?.payload?.bothReady === true);
      assert.equal(readyBOnA.payload.payload.bothReady, true);

      // P1 sinks all 17 segments of fleetB (filtering explicitly by `by === 1` / `by === 2`)
      const targetsB = fleetB.flatMap((s) => s.cells);
      for (let i = 0; i < targetsB.length; i++) {
        const [r, c] = targetsB[i];
        wsA.send(
          JSON.stringify({
            sys: 'RELAY',
            payload: { type: 'GAME_EVENT', game: 'battleship', payload: { kind: 'FIRE', r, c } }
          })
        );
        const shotRes = await wsA.nextMsg(
          (m) => m.sys === 'PACKET' && m.payload?.payload?.kind === 'SHOT_RESULT' && m.payload?.payload?.by === 1
        );
        assert.equal(shotRes.payload.payload.hit, true);

        if (i < targetsB.length - 1) {
          const missR = Math.floor(i / 4) + 1;
          const missC = 6 + (i % 4);
          wsB.send(
            JSON.stringify({
              sys: 'RELAY',
              payload: { type: 'GAME_EVENT', game: 'battleship', payload: { kind: 'FIRE', r: missR, c: missC } }
            })
          );
          const missRes = await wsB.nextMsg(
            (m) => m.sys === 'PACKET' && m.payload?.payload?.kind === 'SHOT_RESULT' && m.payload?.payload?.by === 2
          );
          assert.equal(missRes.payload.payload.hit, false);
        } else {
          assert.equal(shotRes.payload.payload.winner, 1);
        }
      }

      await new Promise((r) => setTimeout(r, 60));
      const rankBs = await jsonApi('/api/rankings?game=battleship');
      assert.equal(rankBs.data.leaderboard[0].id, userA.id);
      assert.ok(rankBs.data.leaderboard[0].elo > 1000);
    } finally {
      wsA.close();
      wsB.close();
    }
  });

  it('validates legal Chess moves server-side, rejects illegal moves, and scores Scholar Mate', async () => {
    const wsA = await openWsClient();
    const wsB = await openWsClient();
    try {
      wsA.send(JSON.stringify({ sys: 'AUTH_HELLO', token: tokenA }));
      wsB.send(JSON.stringify({ sys: 'AUTH_HELLO', token: tokenB }));

      wsA.send(
        JSON.stringify({
          sys: 'CREATE_ROOM',
          gameId: 'chess',
          profile: { id: userA.id, name: userA.username, device: 'PC' }
        })
      );
      const created = await wsA.nextMsg((m) => m.sys === 'ROOM_CREATED');
      wsB.send(
        JSON.stringify({
          sys: 'JOIN_ROOM',
          code: created.code,
          profile: { id: userB.id, name: userB.username, device: 'Android' }
        })
      );
      await wsB.nextMsg((m) => m.sys === 'JOIN_OK');
      await wsA.nextMsg((m) => m.sys === 'PEER_JOINED');

      wsA.send(JSON.stringify({ sys: 'RELAY', payload: { type: 'SELECT_GAME', gameId: 'chess' } }));
      await wsB.nextMsg((m) => m.sys === 'PACKET' && m.payload?.type === 'SELECT_GAME');

      // Attempt illegal move (White e2 -> e5): server must drop it, never forward to B
      wsA.send(
        JSON.stringify({
          sys: 'RELAY',
          payload: { type: 'GAME_EVENT', game: 'chess', payload: { kind: 'MOVE', fromR: 6, fromC: 4, toR: 3, toC: 4 } }
        })
      );

      const mateSeq = [
        [wsA, wsB, 6, 4, 4, 4], // 1. e4
        [wsB, wsA, 1, 4, 3, 4], // 1... e5
        [wsA, wsB, 7, 5, 4, 2], // 2. Bc4
        [wsB, wsA, 0, 1, 2, 2], // 2... Nc6
        [wsA, wsB, 7, 3, 3, 7], // 3. Qh5
        [wsB, wsA, 0, 6, 2, 5], // 3... Nf6
        [wsA, wsB, 3, 7, 1, 5] // 4. Qxf7#
      ];

      for (const [sender, receiver, fromR, fromC, toR, toC] of mateSeq) {
        sender.send(
          JSON.stringify({
            sys: 'RELAY',
            payload: { type: 'GAME_EVENT', game: 'chess', payload: { kind: 'MOVE', fromR, fromC, toR, toC } }
          })
        );
        const fwd = await receiver.nextMsg((m) => m.sys === 'PACKET' && m.payload?.payload?.kind === 'MOVE');
        assert.equal(fwd.payload.payload.fromR, fromR);
        assert.equal(fwd.payload.payload.toC, toC);
      }

      await new Promise((r) => setTimeout(r, 60));
      const rankChess = await jsonApi('/api/rankings?game=chess');
      assert.equal(rankChess.data.leaderboard[0].id, userA.id);
      assert.ok(rankChess.data.leaderboard[0].elo > 1000);

      const meA = await jsonApi('/api/auth/me', { token: tokenA });
      assert.ok(meA.data.user.stats.eloByGame.chess > 1000);
      assert.ok(meA.data.user.stats.eloByGame.battleship > 1000);
    } finally {
      wsA.close();
      wsB.close();
    }
  });

  it('enforces password rules, rejects duplicates, supports logout/login, legacy pending accounts, and optional recovery', async () => {
    // 1. Mismatched passwords
    const mismatch = await jsonApi('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'mismatch@gmail.com',
        password: 'Password123!',
        confirmPassword: 'OtherPassword999!',
        username: 'Mismatch'
      }
    });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.data.code, 'PASSWORD_MISMATCH');

    // 2. Weak password (letters only or digits only)
    const weak = await jsonApi('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'weak@gmail.com',
        password: 'onlyletters',
        confirmPassword: 'onlyletters',
        username: 'WeakPass'
      }
    });
    assert.equal(weak.status, 400);
    assert.equal(weak.data.code, 'WEAK_PASSWORD');

    // 3. Direct registration creates active session immediately without email provider
    const direct = await jsonApi('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'DirectUser@Gmail.com',
        password: 'Arcade2026!',
        confirmPassword: 'Arcade2026!',
        username: 'DirectUser'
      }
    });
    assert.equal(direct.status, 201);
    assert.ok(direct.data.token);
    assert.equal(direct.data.user.email, 'directuser@gmail.com');

    // 4. Duplicate email rejected
    const dup = await jsonApi('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'directuser@gmail.com',
        password: 'AnotherPass1!',
        confirmPassword: 'AnotherPass1!',
        username: 'DupUser'
      }
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.code, 'EMAIL_ALREADY_EXISTS');

    // 5. Logout + /api/auth/me returns null + re-login works
    const out = await jsonApi('/api/auth/logout', { method: 'POST', token: direct.data.token });
    assert.equal(out.status, 200);
    const afterOut = await jsonApi('/api/auth/me', { token: direct.data.token });
    assert.equal(afterOut.data.user, null);

    const badLogin = await jsonApi('/api/auth/login', {
      method: 'POST',
      body: { email: 'directuser@gmail.com', password: 'WrongPassword1' }
    });
    assert.equal(badLogin.status, 401);

    const relogin = await jsonApi('/api/auth/login', {
      method: 'POST',
      body: { email: 'directuser@gmail.com', password: 'Arcade2026!' }
    });
    assert.equal(relogin.status, 200);
    assert.ok(relogin.data.token);
    assert.equal(relogin.data.user.email, 'directuser@gmail.com');

    // 6. Legacy orphaned account (email_verified = 0, no sessions) can log in directly,
    //    or be reclaimed by exact password owner, while blocking strangers
    const { hashPassword } = await import('../server/security.js');
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO users (id, public_id, tag, email, email_verified, password_hash, username, created_at, updated_at)
         VALUES ('usr_legacy_1', 'MG-LEG001', '7788', 'legacy@gmail.com', 0, ?, 'LegacyUser', ?, ?)`
      )
      .run(hashPassword('LegacyPass99'), now, now);

    const strangerAttempt = await jsonApi('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'legacy@gmail.com',
        password: 'HijackPassword1',
        confirmPassword: 'HijackPassword1',
        username: 'Hijacker'
      }
    });
    assert.equal(strangerAttempt.status, 409);

    const legacyLogin = await jsonApi('/api/auth/login', {
      method: 'POST',
      body: { email: 'legacy@gmail.com', password: 'LegacyPass99' }
    });
    assert.equal(legacyLogin.status, 200);
    assert.equal(legacyLogin.data.user.publicId, 'MG-LEG001');

    // 7. Password recovery works without marking emailVerified=true
    const forgot = await jsonApi('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'directuser@gmail.com' }
    });
    assert.equal(forgot.status, 200);
    assert.match(forgot.data.devOtpHint, /^\d{6}$/);

    const reset = await jsonApi('/api/auth/reset-password', {
      method: 'POST',
      body: { email: 'directuser@gmail.com', code: forgot.data.devOtpHint, newPassword: 'NewArcade2026!' }
    });
    assert.equal(reset.status, 200);
    const loginNew = await jsonApi('/api/auth/login', {
      method: 'POST',
      body: { email: 'directuser@gmail.com', password: 'NewArcade2026!' }
    });
    assert.equal(loginNew.status, 200);
    assert.equal(loginNew.data.user.emailVerified, false);
  });

  it('completes Supabase Auth signUp (Confirm Email OFF) -> /api/auth/supabase-exchange immediately without OTP', async () => {
    const prevSbUrl = process.env.SUPABASE_URL;
    const prevSbAnon = process.env.SUPABASE_ANON_KEY;

    const sbUserId = '550e8400-e29b-41d4-a716-446655440000';
    const mockGoTrue = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        const body = bodyStr ? JSON.parse(bodyStr) : {};

        if (req.url === '/auth/v1/signup' && req.method === 'POST') {
          // Confirm Email OFF returns an active session directly
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              access_token: 'sb_direct_access_jwt',
              token_type: 'bearer',
              expires_in: 3600,
              refresh_token: 'sb_refresh_1',
              user: {
                id: sbUserId,
                email: body.email,
                user_metadata: body.data || { username: 'SupaDirect' }
              }
            })
          );
          return;
        }
        if (req.url === '/auth/v1/user' && req.method === 'GET') {
          if (req.headers.authorization !== 'Bearer sb_direct_access_jwt') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid token' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: sbUserId,
              email: 'sbdirect@gmail.com',
              email_confirmed_at: null,
              user_metadata: { username: 'SupaDirect' }
            })
          );
          return;
        }
        res.writeHead(404);
        res.end('{}');
      });
    });

    await new Promise((r) => mockGoTrue.listen(0, '127.0.0.1', r));
    const sbMockUrl = `http://127.0.0.1:${mockGoTrue.address().port}`;
    process.env.SUPABASE_URL = sbMockUrl;
    process.env.SUPABASE_ANON_KEY = 'sb_anon_mock_key';

    try {
      const sb = createClient(sbMockUrl, 'sb_anon_mock_key', {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      const su = await sb.auth.signUp({
        email: 'sbdirect@gmail.com',
        password: 'Password123!',
        options: { data: { username: 'SupaDirect' } }
      });
      assert.equal(su.error, null);
      assert.ok(su.data.session?.access_token);

      // Exchange must succeed even when email_confirmed_at is null (Confirm Email OFF)
      const ex = await jsonApi('/api/auth/supabase-exchange', {
        method: 'POST',
        body: {
          accessToken: su.data.session.access_token,
          guestMigration: { guestId: 'gst_sb_direct', favoriteGames: ['chess'] }
        }
      });
      assert.equal(ex.status, 200);
      assert.equal(ex.data.user.email, 'sbdirect@gmail.com');
      assert.equal(ex.data.user.emailVerified, false);
      assert.equal(ex.data.user.username, 'SupaDirect');
    } finally {
      await new Promise((r) => mockGoTrue.close(r));
      if (prevSbUrl) process.env.SUPABASE_URL = prevSbUrl;
      else delete process.env.SUPABASE_URL;
      if (prevSbAnon) process.env.SUPABASE_ANON_KEY = prevSbAnon;
      else delete process.env.SUPABASE_ANON_KEY;
    }
  });
});
