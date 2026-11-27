import crypto from 'node:crypto';
import {
  getDb,
  toPrivateUser,
  toPublicUser,
  getSettingsRow,
  isBlockedBetween,
  areFriends,
  createNotification
} from './db.js';
import {
  getAuthenticatedSession,
  createSessionForUser,
  setSessionCookie,
  clearSessionCookie,
  registerUser,
  issueOtp,
  verifyOtpConsume,
  loginWithGoogle
} from './auth.js';
import {
  getClientIp,
  rateLimiter,
  sanitizeText,
  sanitizeUsername,
  isValidEmail,
  hashPassword,
  verifyPassword,
  sha256Hex
} from './security.js';
import { pushToUser, getOnlinePresenceForUser, getPublicRoomsList } from './wsRooms.js';
import { unlockAchievement, RANKED_GAMES, getUserGameElo } from './elo.js';

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (c) => {
      total += c.length;
      if (total > limitBytes) {
        reject(Object.assign(new Error('Payload demasiado grande.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('JSON inválido.'), { status: 400 }));
      }
    });
    req.on('error', () => reject(Object.assign(new Error('Error leyendo cuerpo.'), { status: 400 })));
  });
}

function buildIceServers() {
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];
  const turnUrls = (process.env.TURN_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (turnUrls.length > 0) {
    if (process.env.TURN_SHARED_SECRET) {
      const ttl = 3600;
      const unixExpiry = Math.floor(Date.now() / 1000) + ttl;
      const username = `${unixExpiry}:mg`;
      const credential = crypto
        .createHmac('sha1', process.env.TURN_SHARED_SECRET)
        .update(username)
        .digest('base64');
      servers.push({ urls: turnUrls, username, credential });
    } else if (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      servers.push({
        urls: turnUrls,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL
      });
    }
  }
  return servers;
}

function formatConversation(db, convId, myId) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!conv) return null;
  const members = db
    .prepare(
      `SELECT u.id, u.public_id, u.tag, u.username, u.avatar_color, u.avatar_icon, cm.role, cm.muted, cm.last_read_at
       FROM conversation_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = ?`
    )
    .all(convId);

  const meMember = members.find((m) => m.id === myId);
  if (!meMember) return null;

  const lastMsg = db
    .prepare('SELECT body, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(convId);

  const unread = db
    .prepare(
      'SELECT COUNT(*) AS cnt FROM messages WHERE conversation_id = ? AND created_at > ? AND sender_id <> ?'
    )
    .get(convId, meMember.last_read_at, myId).cnt;

  let title = conv.title;
  let peerAvatarColor = '#1ad1be';
  let peerAvatarIcon = '🎮';
  let peerPresence = null;
  if (conv.type === 'dm') {
    const other = members.find((m) => m.id !== myId) || members[0];
    title = other?.username || 'Chat';
    peerAvatarColor = other?.avatar_color || '#1ad1be';
    peerAvatarIcon = other?.avatar_icon || '🎮';
    peerPresence = other ? getOnlinePresenceForUser(other.id).presence : 'offline';
  }

  return {
    id: conv.id,
    type: conv.type,
    title,
    ownerId: conv.owner_id,
    muted: Boolean(meMember.muted),
    unreadCount: unread || 0,
    lastMessage: lastMsg?.body || '',
    updatedAt: lastMsg?.created_at || conv.updated_at,
    peerAvatarColor,
    peerAvatarIcon,
    peerPresence,
    members: members.map((m) => ({
      id: m.id,
      username: m.username,
      tag: m.tag,
      role: m.role,
      avatarColor: m.avatar_color,
      avatarIcon: m.avatar_icon
    }))
  };
}

function getFriendsPayload(db, myId) {
  const friendRows = db
    .prepare(
      `SELECT u.* FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
       WHERE f.user_a = ? OR f.user_b = ?`
    )
    .all(myId, myId, myId);

  const accepted = friendRows.map((u) => {
    const pres = getOnlinePresenceForUser(u.id);
    const set = getSettingsRow(db, u.id);
    const visible = set ? set.privacy.showOnlineStatus : true;
    return {
      ...toPublicUser(u),
      presence: visible ? pres.presence : 'offline',
      activity: visible ? pres.activity : null
    };
  });

  const incoming = db
    .prepare(
      `SELECT fr.id AS request_id, u.* FROM friend_requests fr
       JOIN users u ON u.id = fr.sender_id
       WHERE fr.receiver_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`
    )
    .all(myId)
    .map((r) => ({ requestId: r.request_id, ...toPublicUser(r) }));

  const outgoing = db
    .prepare(
      `SELECT fr.id AS request_id, u.* FROM friend_requests fr
       JOIN users u ON u.id = fr.receiver_id
       WHERE fr.sender_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`
    )
    .all(myId)
    .map((r) => ({ requestId: r.request_id, ...toPublicUser(r) }));

  const blocked = db
    .prepare(
      `SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = ?`
    )
    .all(myId)
    .map((u) => toPublicUser(u));

  return { accepted, incoming, outgoing, blocked };
}

export async function handleApiRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/')) return false;

  const ip = getClientIp(req);
  const method = (req.method || 'GET').toUpperCase();
  const db = getDb();

  try {
    // Public capabilities & ICE configuration
    if (pathname === '/api/system/capabilities' && method === 'GET') {
      return sendJson(res, 200, {
        sqliteReady: true,
        supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
        googleOAuthEnabled: Boolean(process.env.GOOGLE_CLIENT_ID),
        emailDeliveryMode: process.env.RESEND_API_KEY ? 'resend' : 'server_log',
        turnConfigured: Boolean(process.env.TURN_URLS)
      });
    }

    if (pathname === '/api/rtc/ice' && method === 'GET') {
      return sendJson(res, 200, { iceServers: buildIceServers() });
    }

    if (pathname === '/api/rooms/public' && method === 'GET') {
      return sendJson(res, 200, { rooms: getPublicRoomsList() });
    }

    // AUTH ROUTES
    if (pathname === '/api/auth/register' && method === 'POST') {
      if (!rateLimiter.allow(`auth:${ip}`, 10, 60_000)) {
        return sendJson(res, 429, { message: 'Demasiados intentos. Espera un minuto.' });
      }
      const body = await readJsonBody(req);
      const out = await registerUser(body);
      return sendJson(res, 201, out);
    }

    if (pathname === '/api/auth/request-otp' && method === 'POST') {
      if (!rateLimiter.allow(`otp:${ip}`, 8, 60_000)) {
        return sendJson(res, 429, { message: 'Límite de envíos alcanzado. Espera un minuto.' });
      }
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const purpose = ['verify_email', 'login', 'reset_password'].includes(body.purpose)
        ? body.purpose
        : 'login';
      if (!isValidEmail(email)) return sendJson(res, 400, { message: 'Correo inválido.' });

      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (!user) {
        return sendJson(res, 200, { ok: true, message: 'Si la cuenta existe, enviamos el código OTP.' });
      }
      const resOtp = await issueOtp(db, email, purpose);
      return sendJson(res, 200, { ok: true, ...resOtp });
    }

    if (pathname === '/api/auth/verify-otp' && method === 'POST') {
      if (!rateLimiter.allow(`verify:${ip}`, 12, 60_000)) {
        return sendJson(res, 429, { message: 'Demasiados intentos.' });
      }
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const purpose = ['verify_email', 'login'].includes(body.purpose) ? body.purpose : 'verify_email';
      const check = verifyOtpConsume(db, email, purpose, body.code);
      if (!check.ok) return sendJson(res, 400, { message: check.message });

      db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE email = ?').run(
        new Date().toISOString(),
        email
      );
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) return sendJson(res, 404, { message: 'Usuario no encontrado.' });

      const sess = createSessionForUser(db, user.id, req.headers['user-agent']?.slice(0, 48));
      setSessionCookie(res, sess.rawToken);
      return sendJson(res, 200, {
        token: sess.rawToken,
        user: toPrivateUser(user, db),
        settings: getSettingsRow(db, user.id)
      });
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      if (!rateLimiter.allow(`login:${ip}`, 12, 60_000)) {
        return sendJson(res, 429, { message: 'Demasiados intentos de inicio de sesión.' });
      }
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user || !verifyPassword(String(body.password || ''), user.password_hash)) {
        return sendJson(res, 401, { message: 'Correo o contraseña incorrectos.' });
      }
      if (!user.email_verified) {
        const otpInfo = await issueOtp(db, email, 'verify_email');
        return sendJson(res, 403, {
          code: 'EMAIL_NOT_VERIFIED',
          message: otpInfo.devOtpHint
            ? `Verifica tu correo primero. Código OTP (desarrollo): ${otpInfo.devOtpHint}`
            : 'Verifica tu correo con el código de 6 dígitos enviado.'
        });
      }
      const sess = createSessionForUser(db, user.id, req.headers['user-agent']?.slice(0, 48));
      setSessionCookie(res, sess.rawToken);
      return sendJson(res, 200, {
        token: sess.rawToken,
        user: toPrivateUser(user, db),
        settings: getSettingsRow(db, user.id)
      });
    }

    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      if (!body.newPassword || String(body.newPassword).length < 8) {
        return sendJson(res, 400, { message: 'La nueva contraseña debe tener al menos 8 caracteres.' });
      }
      const check = verifyOtpConsume(db, email, 'reset_password', body.code);
      if (!check.ok) return sendJson(res, 400, { message: check.message });

      db.prepare('UPDATE users SET password_hash = ?, email_verified = 1, updated_at = ? WHERE email = ?').run(
        hashPassword(String(body.newPassword)),
        new Date().toISOString(),
        email
      );
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/auth/google' && method === 'POST') {
      const body = await readJsonBody(req);
      const out = await loginWithGoogle({
        credential: body.credential,
        guestMigration: body.guestMigration,
        deviceLabel: req.headers['user-agent']?.slice(0, 48)
      });
      setSessionCookie(res, out.token);
      return sendJson(res, 200, out);
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const auth = getAuthenticatedSession(req);
      if (auth) db.prepare('DELETE FROM sessions WHERE id = ?').run(auth.sessionId);
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const auth = getAuthenticatedSession(req);
      if (!auth) return sendJson(res, 200, { user: null });
      return sendJson(res, 200, {
        user: toPrivateUser(auth.userRow, db),
        settings: getSettingsRow(db, auth.userRow.id)
      });
    }

    // Public Leaderboard & Match Rankings
    if (pathname === '/api/rankings' && method === 'GET') {
      const requested = url.searchParams.get('game') || 'global';
      const game = requested === 'global' || RANKED_GAMES.has(requested) ? requested : 'global';

      const rows = db
        .prepare(
          `SELECT id, public_id, tag, username, avatar_color, avatar_icon, level, wins, losses, matches_played, best_streak,
                  elo_global, elo_hockey, elo_connect4, elo_tictactoe, elo_by_game
           FROM users
           WHERE email_verified = 1 AND matches_played > 0`
        )
        .all();

      const leaderboard = rows
        .map((r) => ({
          id: r.id,
          publicId: r.public_id,
          tag: r.tag,
          username: r.username,
          avatarColor: r.avatar_color,
          avatarIcon: r.avatar_icon,
          level: r.level,
          elo: game === 'global' ? r.elo_global : getUserGameElo(r, game),
          wins: r.wins,
          losses: r.losses,
          winRate: r.matches_played > 0 ? Math.round((r.wins / r.matches_played) * 100) : 0,
          bestStreak: r.best_streak
        }))
        .sort((a, b) => b.elo - a.elo || b.wins - a.wins)
        .slice(0, 50);

      return sendJson(res, 200, {
        game,
        leaderboard
      });
    }

    if (pathname.startsWith('/api/profile/') && method === 'GET') {
      const ident = decodeURIComponent(pathname.slice('/api/profile/'.length));
      const row = db
        .prepare('SELECT * FROM users WHERE id = ? OR public_id = ? OR tag = ?')
        .get(ident, ident.toUpperCase(), ident.toUpperCase());
      if (!row) return sendJson(res, 404, { message: 'Perfil no encontrado.' });
      return sendJson(res, 200, { profile: toPublicUser(row, db) });
    }

    // PROTECTED ROUTES BELOW
    const auth = getAuthenticatedSession(req);
    if (!auth) {
      return sendJson(res, 401, { message: 'Debes iniciar sesión para acceder a esta función.' });
    }
    const me = auth.userRow;

    if (pathname === '/api/auth/sessions' && method === 'GET') {
      const list = db
        .prepare('SELECT id, device_label, created_at, last_seen_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC')
        .all(me.id);
      return sendJson(res, 200, {
        sessions: list.map((s) => ({
          id: s.id,
          deviceLabel: s.device_label,
          createdAt: s.created_at,
          current: s.id === auth.sessionId
        }))
      });
    }

    if (pathname.startsWith('/api/auth/sessions/') && method === 'DELETE') {
      const sid = decodeURIComponent(pathname.slice('/api/auth/sessions/'.length));
      db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(sid, me.id);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/auth/change-password' && method === 'POST') {
      const body = await readJsonBody(req);
      if (me.password_hash && !verifyPassword(String(body.currentPassword || ''), me.password_hash)) {
        return sendJson(res, 400, { message: 'La contraseña actual no es correcta.' });
      }
      if (!body.newPassword || String(body.newPassword).length < 8) {
        return sendJson(res, 400, { message: 'La nueva contraseña debe tener mínimo 8 caracteres.' });
      }
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
        hashPassword(String(body.newPassword)),
        new Date().toISOString(),
        me.id
      );
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/auth/account' && method === 'DELETE') {
      const body = await readJsonBody(req);
      if (String(body.confirmText || '').trim().toUpperCase() !== 'ELIMINAR') {
        return sendJson(res, 400, { message: 'Debes escribir ELIMINAR para confirmar.' });
      }
      if (me.password_hash && !verifyPassword(String(body.password || ''), me.password_hash)) {
        return sendJson(res, 403, { message: 'Contraseña incorrecta.' });
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(me.id);
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/profile' && method === 'PATCH') {
      const body = await readJsonBody(req);
      if (body.publicId && body.publicId !== me.public_id) {
        return sendJson(res, 403, { message: 'El identificador permanente no puede modificarse.' });
      }
      const nextName = body.username !== undefined ? sanitizeUsername(body.username) || me.username : me.username;
      const nextBio = body.bio !== undefined ? sanitizeText(body.bio, 160) : me.bio;
      const nextColor =
        body.avatarColor && /^#[0-9a-fA-F]{3,8}$/.test(body.avatarColor)
          ? body.avatarColor
          : me.avatar_color;
      const nextIcon = body.avatarIcon ? sanitizeText(body.avatarIcon, 4) : me.avatar_icon;
      const nextFavs = Array.isArray(body.favoriteGames)
        ? JSON.stringify(body.favoriteGames.slice(0, 8))
        : me.favorite_games;

      db.prepare(
        'UPDATE users SET username = ?, bio = ?, avatar_color = ?, avatar_icon = ?, favorite_games = ?, updated_at = ? WHERE id = ?'
      ).run(nextName, nextBio, nextColor, nextIcon, nextFavs, new Date().toISOString(), me.id);

      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id);
      return sendJson(res, 200, { user: toPrivateUser(updated, db) });
    }

    if (pathname === '/api/settings' && method === 'GET') {
      return sendJson(res, 200, { settings: getSettingsRow(db, me.id) });
    }

    if (pathname === '/api/settings' && method === 'PUT') {
      const body = await readJsonBody(req);
      const p = body.privacy || {};
      db.prepare(
        `UPDATE user_settings SET
          theme = ?, accent = ?, ui_scale = ?, reduced_motion = ?,
          master_volume = ?, sfx_volume = ?, music_volume = ?, air_hockey_sensitivity = ?,
          push_notifications = ?, who_can_friend = ?, who_can_invite = ?, who_can_message = ?,
          show_online_status = ?, updated_at = ?
         WHERE user_id = ?`
      ).run(
        body.theme === 'light' ? 'light' : 'dark',
        String(body.accent || 'amber').slice(0, 16),
        ['compact', 'normal', 'large'].includes(body.uiScale) ? body.uiScale : 'normal',
        body.reducedMotion ? 1 : 0,
        Math.max(0, Math.min(1, Number(body.masterVolume ?? 0.85))),
        Math.max(0, Math.min(1, Number(body.sfxVolume ?? 0.9))),
        Math.max(0, Math.min(1, Number(body.musicVolume ?? 0))),
        Math.max(0.65, Math.min(1.45, Number(body.airHockeySensitivity ?? 1))),
        body.pushNotifications ? 1 : 0,
        p.whoCanFriend === 'nobody' ? 'nobody' : 'everyone',
        ['everyone', 'friends', 'nobody'].includes(p.whoCanInvite) ? p.whoCanInvite : 'everyone',
        ['everyone', 'friends', 'nobody'].includes(p.whoCanMessage) ? p.whoCanMessage : 'friends',
        p.showOnlineStatus === false ? 0 : 1,
        new Date().toISOString(),
        me.id
      );
      return sendJson(res, 200, { settings: getSettingsRow(db, me.id) });
    }

    // USERS SEARCH & FRIENDS
    if (pathname === '/api/users/search' && method === 'GET') {
      const q = sanitizeText(url.searchParams.get('q') || '', 40);
      if (!q) return sendJson(res, 200, { users: [] });
      const cleanQ = q.replace(/^#/, '');
      const like = `%${cleanQ}%`;
      const rows = db
        .prepare(
          `SELECT * FROM users
           WHERE id <> ? AND email_verified = 1
             AND (username LIKE ? OR tag = ? OR public_id = ?)
           LIMIT 20`
        )
        .all(me.id, like, cleanQ.toUpperCase(), cleanQ.toUpperCase());

      const users = rows
        .filter((r) => !isBlockedBetween(db, me.id, r.id))
        .map((r) => {
          const friend = areFriends(db, me.id, r.id);
          const outReq = db
            .prepare("SELECT 1 FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'")
            .get(me.id, r.id);
          return {
            ...toPublicUser(r),
            relation: friend ? 'friend' : outReq ? 'outgoing' : 'none'
          };
        });
      return sendJson(res, 200, { users });
    }

    if (pathname === '/api/friends' && method === 'GET') {
      return sendJson(res, 200, getFriendsPayload(db, me.id));
    }

    if (pathname === '/api/friends/request' && method === 'POST') {
      const body = await readJsonBody(req);
      const targetId = String(body.targetUserId || '');
      if (!targetId || targetId === me.id) return sendJson(res, 400, { message: 'Usuario inválido.' });
      const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(targetId);
      if (!target) return sendJson(res, 404, { message: 'Usuario no encontrado.' });
      if (isBlockedBetween(db, me.id, targetId)) {
        return sendJson(res, 403, { message: 'No puedes enviar solicitud a este usuario.' });
      }
      const targetSettings = getSettingsRow(db, targetId);
      if (targetSettings?.privacy?.whoCanFriend === 'nobody') {
        return sendJson(res, 403, { message: 'Este usuario no acepta solicitudes de amistad.' });
      }
      if (areFriends(db, me.id, targetId)) {
        return sendJson(res, 409, { message: 'Ya son amigos.' });
      }
      const dup = db
        .prepare(
          "SELECT 1 FROM friend_requests WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND status = 'pending'"
        )
        .get(me.id, targetId, targetId, me.id);
      if (dup) return sendJson(res, 409, { message: 'Ya existe una solicitud pendiente.' });

      const reqId = 'frq_' + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
      db.prepare(
        "INSERT INTO friend_requests (id, sender_id, receiver_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)"
      ).run(reqId, me.id, targetId, new Date().toISOString());

      const notif = createNotification(db, {
        userId: targetId,
        type: 'friend_request',
        title: `Solicitud de amistad de ${me.username}`,
        body: `#${me.tag} quiere agregarte como amigo.`,
        refId: reqId
      });
      pushToUser(targetId, { sys: 'NOTIFICATION', notification: notif });
      return sendJson(res, 201, { ok: true, requestId: reqId });
    }

    if (pathname === '/api/friends/respond' && method === 'POST') {
      const body = await readJsonBody(req);
      const requestId = String(body.requestId || '');
      const decision = String(body.decision || '');
      const row = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(requestId);
      if (!row || row.status !== 'pending') {
        return sendJson(res, 404, { message: 'Solicitud no encontrada.' });
      }

      if (decision === 'cancel' && row.sender_id === me.id) {
        db.prepare("UPDATE friend_requests SET status = 'cancelled' WHERE id = ?").run(requestId);
        return sendJson(res, 200, { ok: true });
      }
      if (row.receiver_id !== me.id) return sendJson(res, 403, { message: 'Sin permiso.' });

      if (decision === 'reject') {
        db.prepare("UPDATE friend_requests SET status = 'rejected' WHERE id = ?").run(requestId);
        return sendJson(res, 200, { ok: true });
      }
      if (decision === 'accept') {
        const [a, b] = row.sender_id < row.receiver_id ? [row.sender_id, row.receiver_id] : [row.receiver_id, row.sender_id];
        db.exec('BEGIN');
        try {
          db.prepare("UPDATE friend_requests SET status = 'accepted' WHERE id = ?").run(requestId);
          db.prepare('INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)').run(
            a,
            b,
            new Date().toISOString()
          );
          unlockAchievement(db, a, 'social_butterfly');
          unlockAchievement(db, b, 'social_butterfly');
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
        const notif = createNotification(db, {
          userId: row.sender_id,
          type: 'friend_accept',
          title: `${me.username} aceptó tu solicitud`,
          body: 'Ya pueden chatear e invitarse a partidas.'
        });
        pushToUser(row.sender_id, { sys: 'NOTIFICATION', notification: notif });
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 400, { message: 'Decisión inválida.' });
    }

    if (pathname.startsWith('/api/friends/') && method === 'DELETE') {
      const targetId = decodeURIComponent(pathname.slice('/api/friends/'.length));
      const [a, b] = me.id < targetId ? [me.id, targetId] : [targetId, me.id];
      db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(a, b);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/blocks' && method === 'POST') {
      const body = await readJsonBody(req);
      const targetId = String(body.targetUserId || '');
      if (!targetId || targetId === me.id) return sendJson(res, 400, { message: 'Usuario inválido.' });
      const [a, b] = me.id < targetId ? [me.id, targetId] : [targetId, me.id];
      db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(
        me.id,
        targetId,
        new Date().toISOString()
      );
      db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(a, b);
      db.prepare(
        "UPDATE friend_requests SET status = 'cancelled' WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND status = 'pending'"
      ).run(me.id, targetId, targetId, me.id);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname.startsWith('/api/blocks/') && method === 'DELETE') {
      const targetId = decodeURIComponent(pathname.slice('/api/blocks/'.length));
      db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(me.id, targetId);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/reports' && method === 'POST') {
      const body = await readJsonBody(req);
      const targetId = String(body.targetUserId || '');
      const reason = sanitizeText(body.reason || '', 240);
      if (!targetId || reason.length < 3) return sendJson(res, 400, { message: 'Motivo inválido.' });
      db.prepare(
        'INSERT INTO reports (id, reporter_id, target_user_id, message_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('rep_' + crypto.randomUUID().slice(0, 12), me.id, targetId, body.messageId || null, reason, new Date().toISOString());
      return sendJson(res, 201, { ok: true });
    }

    // ROOM INVITES
    if (pathname === '/api/rooms/invite' && method === 'POST') {
      const body = await readJsonBody(req);
      const targetId = String(body.targetUserId || '');
      const code = String(body.roomCode || '').toUpperCase().slice(0, 5);
      if (!targetId || code.length !== 5) return sendJson(res, 400, { message: 'Datos de invitación inválidos.' });
      if (isBlockedBetween(db, me.id, targetId)) return sendJson(res, 403, { message: 'No permitido.' });

      const targetSettings = getSettingsRow(db, targetId);
      const invitePref = targetSettings?.privacy?.whoCanInvite || 'everyone';
      if (invitePref === 'nobody' || (invitePref === 'friends' && !areFriends(db, me.id, targetId))) {
        return sendJson(res, 403, { message: 'La privacidad del usuario no permite invitaciones.' });
      }

      const notif = createNotification(db, {
        userId: targetId,
        type: 'room_invite',
        title: `${me.username} te invitó a la sala ${code}`,
        body: 'Pulsa Unirse para entrar directamente.',
        refId: code
      });
      pushToUser(targetId, { sys: 'NOTIFICATION', notification: notif });
      return sendJson(res, 200, { ok: true });
    }

    // CONVERSATIONS & MESSAGES
    if (pathname === '/api/conversations' && method === 'GET') {
      const convRows = db
        .prepare(
          `SELECT c.id FROM conversations c
           JOIN conversation_members cm ON cm.conversation_id = c.id
           WHERE cm.user_id = ?
           ORDER BY c.updated_at DESC`
        )
        .all(me.id);
      const conversations = convRows.map((r) => formatConversation(db, r.id, me.id)).filter(Boolean);
      return sendJson(res, 200, { conversations });
    }

    if (pathname === '/api/conversations/dm' && method === 'POST') {
      const body = await readJsonBody(req);
      const targetId = String(body.targetUserId || '');
      if (!targetId || targetId === me.id) return sendJson(res, 400, { message: 'Destinatario inválido.' });
      if (isBlockedBetween(db, me.id, targetId)) return sendJson(res, 403, { message: 'Usuario bloqueado.' });

      const targetSettings = getSettingsRow(db, targetId);
      const msgPref = targetSettings?.privacy?.whoCanMessage || 'friends';
      if (msgPref === 'nobody' || (msgPref === 'friends' && !areFriends(db, me.id, targetId))) {
        return sendJson(res, 403, { message: 'Este usuario solo recibe mensajes de amigos.' });
      }

      const [a, b] = me.id < targetId ? [me.id, targetId] : [targetId, me.id];
      const dmKey = `${a}:${b}`;
      let conv = db.prepare('SELECT id FROM conversations WHERE dm_key = ?').get(dmKey);
      if (!conv) {
        const cid = 'cnv_' + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
        const now = new Date().toISOString();
        db.prepare("INSERT INTO conversations (id, type, title, dm_key, created_at, updated_at) VALUES (?, 'dm', '', ?, ?, ?)").run(
          cid,
          dmKey,
          now,
          now
        );
        db.prepare(
          "INSERT INTO conversation_members (conversation_id, user_id, role, last_read_at, joined_at) VALUES (?, ?, 'member', ?, ?)"
        ).run(cid, a, now, now);
        db.prepare(
          "INSERT INTO conversation_members (conversation_id, user_id, role, last_read_at, joined_at) VALUES (?, ?, 'member', ?, ?)"
        ).run(cid, b, now, now);
        conv = { id: cid };
      }
      return sendJson(res, 200, { conversation: formatConversation(db, conv.id, me.id) });
    }

    if (pathname === '/api/conversations/group' && method === 'POST') {
      const body = await readJsonBody(req);
      const title = sanitizeText(body.title || '', 32);
      if (title.length < 2) return sendJson(res, 400, { message: 'Nombre de grupo demasiado corto.' });
      const cid = 'cnv_' + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
      const now = new Date().toISOString();
      db.prepare("INSERT INTO conversations (id, type, title, owner_id, created_at, updated_at) VALUES (?, 'group', ?, ?, ?, ?)").run(
        cid,
        title,
        me.id,
        now,
        now
      );
      db.prepare(
        "INSERT INTO conversation_members (conversation_id, user_id, role, last_read_at, joined_at) VALUES (?, ?, 'owner', ?, ?)"
      ).run(cid, me.id, now, now);

      const memberIds = Array.isArray(body.memberIds) ? body.memberIds : [];
      for (const uid of memberIds.slice(0, 20)) {
        if (uid !== me.id && areFriends(db, me.id, uid) && !isBlockedBetween(db, me.id, uid)) {
          db.prepare(
            "INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, last_read_at, joined_at) VALUES (?, ?, 'member', ?, ?)"
          ).run(cid, String(uid), now, now);
        }
      }
      return sendJson(res, 201, { conversation: formatConversation(db, cid, me.id) });
    }

    const convMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/(messages|read|mute|members)(?:\/([^/]+))?$/);
    if (convMatch) {
      const convId = decodeURIComponent(convMatch[1]);
      const sub = convMatch[2];
      const subUserId = convMatch[3] ? decodeURIComponent(convMatch[3]) : null;
      const membership = db
        .prepare('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
        .get(convId, me.id);
      if (!membership) return sendJson(res, 403, { message: 'No perteneces a esta conversación.' });

      if (sub === 'messages' && method === 'GET') {
        const rows = db
          .prepare(
            `SELECT m.*, u.username AS sender_name
             FROM messages m JOIN users u ON u.id = m.sender_id
             WHERE m.conversation_id = ?
             ORDER BY m.created_at ASC
             LIMIT 100`
          )
          .all(convId);
        return sendJson(res, 200, {
          messages: rows.map((m) => ({
            id: m.id,
            conversationId: m.conversation_id,
            senderId: m.sender_id,
            senderName: m.sender_name,
            body: m.body,
            reactions: JSON.parse(m.reactions || '{}'),
            createdAt: m.created_at
          }))
        });
      }

      if (sub === 'messages' && method === 'POST') {
        if (!rateLimiter.allow(`chat:${me.id}`, 5, 4000)) {
          return sendJson(res, 429, { message: 'Estás enviando mensajes demasiado rápido.' });
        }
        const body = await readJsonBody(req);
        const text = sanitizeText(body.body || '', 400);
        if (!text) return sendJson(res, 400, { message: 'Mensaje vacío.' });

        const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
        const otherMembers = db
          .prepare('SELECT user_id, muted FROM conversation_members WHERE conversation_id = ? AND user_id <> ?')
          .all(convId, me.id);

        if (conv?.type === 'dm' && otherMembers[0] && isBlockedBetween(db, me.id, otherMembers[0].user_id)) {
          return sendJson(res, 403, { message: 'No puedes enviar mensajes a este usuario.' });
        }

        const msgId = 'msg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
        const now = new Date().toISOString();
        db.prepare(
          "INSERT INTO messages (id, conversation_id, sender_id, body, reactions, created_at) VALUES (?, ?, ?, ?, '{}', ?)"
        ).run(msgId, convId, me.id, text, now);
        db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, convId);
        db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(
          now,
          convId,
          me.id
        );

        const messageObj = {
          id: msgId,
          conversationId: convId,
          senderId: me.id,
          senderName: me.username,
          body: text,
          reactions: {},
          createdAt: now
        };

        for (const om of otherMembers) {
          pushToUser(om.user_id, { sys: 'CHAT_MESSAGE', message: messageObj });
          if (!om.muted) {
            const notif = createNotification(db, {
              userId: om.user_id,
              type: 'message',
              title: `Nuevo mensaje de ${me.username}`,
              body: text.slice(0, 80),
              refId: convId
            });
            pushToUser(om.user_id, { sys: 'NOTIFICATION', notification: notif });
          }
        }
        return sendJson(res, 201, { message: messageObj });
      }

      if (sub === 'read' && method === 'POST') {
        db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(
          new Date().toISOString(),
          convId,
          me.id
        );
        return sendJson(res, 200, { ok: true });
      }

      if (sub === 'mute' && method === 'POST') {
        const nextMuted = membership.muted ? 0 : 1;
        db.prepare('UPDATE conversation_members SET muted = ? WHERE conversation_id = ? AND user_id = ?').run(
          nextMuted,
          convId,
          me.id
        );
        return sendJson(res, 200, { muted: Boolean(nextMuted) });
      }

      if (sub === 'members' && method === 'POST') {
        if (membership.role !== 'owner' && membership.role !== 'admin') {
          return sendJson(res, 403, { message: 'Solo el administrador del grupo puede añadir miembros.' });
        }
        const body = await readJsonBody(req);
        const uid = String(body.userId || '');
        if (!areFriends(db, me.id, uid) || isBlockedBetween(db, me.id, uid)) {
          return sendJson(res, 403, { message: 'Solo puedes añadir amigos no bloqueados.' });
        }
        const now = new Date().toISOString();
        db.prepare(
          "INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, last_read_at, joined_at) VALUES (?, ?, 'member', ?, ?)"
        ).run(convId, uid, now, now);
        return sendJson(res, 200, { ok: true });
      }

      if (sub === 'members' && method === 'DELETE' && subUserId) {
        if (subUserId !== me.id && membership.role !== 'owner' && membership.role !== 'admin') {
          return sendJson(res, 403, { message: 'Sin permiso para expulsar del grupo.' });
        }
        db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(convId, subUserId);
        return sendJson(res, 200, { ok: true });
      }
    }

    if (pathname.startsWith('/api/messages/') && pathname.endsWith('/react') && method === 'POST') {
      const msgId = decodeURIComponent(pathname.slice('/api/messages/'.length, -'/react'.length));
      const body = await readJsonBody(req);
      const emoji = sanitizeText(body.emoji || '', 8);
      if (!emoji) return sendJson(res, 400, { message: 'Emoji inválido.' });

      const msg = db
        .prepare('SELECT m.*, u.username AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?')
        .get(msgId);
      if (!msg) return sendJson(res, 404, { message: 'Mensaje no encontrado.' });
      const mem = db
        .prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
        .get(msg.conversation_id, me.id);
      if (!mem) return sendJson(res, 403, { message: 'Sin acceso.' });

      const reactions = JSON.parse(msg.reactions || '{}');
      const list = new Set(Array.isArray(reactions[emoji]) ? reactions[emoji] : []);
      if (list.has(me.id)) list.delete(me.id);
      else list.add(me.id);
      reactions[emoji] = [...list];

      db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), msgId);
      return sendJson(res, 200, {
        message: {
          id: msg.id,
          conversationId: msg.conversation_id,
          senderId: msg.sender_id,
          senderName: msg.sender_name,
          body: msg.body,
          reactions,
          createdAt: msg.created_at
        }
      });
    }

    // NOTIFICATIONS
    if (pathname === '/api/notifications' && method === 'GET') {
      const rows = db
        .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
        .all(me.id);
      return sendJson(res, 200, {
        notifications: rows.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          refId: n.ref_id,
          read: Boolean(n.is_read),
          createdAt: n.created_at
        }))
      });
    }

    if (pathname === '/api/notifications/read-all' && method === 'POST') {
      db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(me.id);
      return sendJson(res, 200, { ok: true });
    }

    // MATCH HISTORY
    if (pathname === '/api/matches/history' && method === 'GET') {
      const rows = db
        .prepare(
          `SELECT gr.*, u1.username AS p1_name, u2.username AS p2_name
           FROM game_results gr
           LEFT JOIN users u1 ON u1.id = gr.player1_id
           LEFT JOIN users u2 ON u2.id = gr.player2_id
           WHERE gr.player1_id = ? OR gr.player2_id = ?
           ORDER BY gr.played_at DESC
           LIMIT 30`
        )
        .all(me.id, me.id);

      return sendJson(res, 200, {
        history: rows.map((r) => {
          const isP1 = r.player1_id === me.id;
          return {
            id: r.id,
            gameId: r.game_id,
            won: r.winner_id === me.id,
            draw: Boolean(r.is_draw),
            opponentName: isP1 ? r.p2_name : r.p1_name,
            scoreSummary: r.score_summary,
            eloDelta: isP1 ? r.p1_elo_delta : r.p2_elo_delta,
            durationSeconds: r.duration_seconds,
            playedAt: r.played_at
          };
        })
      });
    }

    return sendJson(res, 404, { message: 'Endpoint no encontrado.' });
  } catch (err) {
    const status = err.status || 500;
    return sendJson(res, status, {
      message: err.message || 'Error interno del servidor.',
      code: err.code || undefined
    });
  }
}
