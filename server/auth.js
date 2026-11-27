import crypto from 'node:crypto';
import { getDb, toPrivateUser, getSettingsRow } from './db.js';
import {
  hashPassword,
  verifyPassword,
  sha256Hex,
  generateOtp6,
  generateSecureToken,
  isValidEmail,
  sanitizeUsername
} from './security.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function generatePublicId(db) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 20; i++) {
    let code = 'MG-';
    for (let j = 0; j < 6; j++) code += chars[crypto.randomInt(0, chars.length)];
    const exists = db.prepare('SELECT 1 FROM users WHERE public_id = ?').get(code);
    if (!exists) return code;
  }
  return 'MG-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function generateTag(db) {
  for (let i = 0; i < 25; i++) {
    const tag = String(crypto.randomInt(1000, 9999));
    const exists = db.prepare('SELECT 1 FROM users WHERE tag = ?').get(tag);
    if (!exists) return tag;
  }
  return crypto.randomBytes(2).toString('hex').toUpperCase();
}

async function deliverOtpEmail(email, code, purpose) {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.SMTP_FROM || 'Mini-Games <no-reply@example.com>';
  if (resendKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: `Tu código de verificación Mini-Games: ${code}`,
          text: `Tu código OTP (${purpose}) de 6 dígitos es: ${code}. Caduca en 10 minutos.`
        })
      });
      if (resp.ok) return { delivered: 'email' };
    } catch {}
  }

  console.log(`[Mini-Games OTP] email=${email} purpose=${purpose} code=${code}`);
  return { delivered: 'server_log' };
}

export function createSessionForUser(db, userId, deviceLabel = 'Navegador') {
  const rawToken = generateSecureToken();
  const tokenHash = sha256Hex(rawToken);
  const id = 'ses_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  db.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, device_label, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, userId, tokenHash, String(deviceLabel || 'Navegador').slice(0, 60), now, expiresAt, now);

  return { sessionId: id, rawToken, expiresAt };
}

export function extractSessionToken(req) {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader === 'string') {
    for (const part of cookieHeader.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === 'mg_session') {
        return decodeURIComponent(rest.join('='));
      }
    }
  }
  return '';
}

export function getAuthenticatedSession(req) {
  const rawToken = extractSessionToken(req);
  if (!rawToken) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(sha256Hex(rawToken));
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }
  return { sessionId: row.session_id, userRow: row };
}

export function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `mg_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'mg_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function insertSettingsFromGuest(db, userId, guestSettings = {}) {
  const p = guestSettings.privacy || {};
  db.prepare(
    `INSERT OR IGNORE INTO user_settings (
      user_id, theme, accent, ui_scale, reduced_motion,
      master_volume, sfx_volume, music_volume, air_hockey_sensitivity,
      push_notifications, who_can_friend, who_can_invite, who_can_message,
      show_online_status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    guestSettings.theme === 'light' ? 'light' : 'dark',
    String(guestSettings.accent || 'amber').slice(0, 16),
    ['compact', 'normal', 'large'].includes(guestSettings.uiScale) ? guestSettings.uiScale : 'normal',
    guestSettings.reducedMotion ? 1 : 0,
    Number(guestSettings.masterVolume ?? 0.85),
    Number(guestSettings.sfxVolume ?? 0.9),
    Number(guestSettings.musicVolume ?? 0),
    Number(guestSettings.airHockeySensitivity ?? 1.0),
    guestSettings.pushNotifications ? 1 : 0,
    p.whoCanFriend === 'nobody' ? 'nobody' : 'everyone',
    ['everyone', 'friends', 'nobody'].includes(p.whoCanInvite) ? p.whoCanInvite : 'everyone',
    ['everyone', 'friends', 'nobody'].includes(p.whoCanMessage) ? p.whoCanMessage : 'friends',
    p.showOnlineStatus === false ? 0 : 1,
    new Date().toISOString()
  );
}

export async function issueOtp(db, email, purpose) {
  const code = generateOtp6();
  const id = 'otp_' + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
  const now = Date.now();
  db.prepare('UPDATE otp_codes SET used = 1 WHERE email = ? AND purpose = ? AND used = 0').run(email, purpose);
  db.prepare(
    'INSERT INTO otp_codes (id, email, purpose, code_hash, attempts, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?, 0, ?)'
  ).run(id, email, purpose, sha256Hex(code), now + OTP_TTL_MS, now);

  const delivery = await deliverOtpEmail(email, code, purpose);
  const devOtpHint = process.env.NODE_ENV !== 'production' ? code : undefined;
  return { delivery: delivery.delivered, devOtpHint };
}

export function verifyOtpConsume(db, email, purpose, code) {
  const row = db
    .prepare(
      'SELECT * FROM otp_codes WHERE email = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
    )
    .get(email, purpose);
  if (!row) return { ok: false, message: 'No hay código pendiente para ese correo.' };
  if (row.expires_at < Date.now()) {
    db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
    return { ok: false, message: 'El código OTP expiró. Solicita uno nuevo.' };
  }
  if (row.attempts >= 5) {
    db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
    return { ok: false, message: 'Demasiados intentos. Solicita un código nuevo.' };
  }

  if (sha256Hex(String(code).trim()) !== row.code_hash) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return { ok: false, message: 'Código OTP incorrecto.' };
  }

  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
  return { ok: true };
}

export async function registerUser({ email, password, username, guestMigration }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) {
    throw Object.assign(new Error('Correo electrónico inválido.'), { status: 400 });
  }
  if (!password || String(password).length < 8) {
    throw Object.assign(new Error('La contraseña debe tener al menos 8 caracteres.'), { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(cleanEmail);
  if (existing && existing.email_verified) {
    throw Object.assign(new Error('Ya existe una cuenta verificada con este correo.'), { status: 409 });
  }

  const guestId = guestMigration?.guestId ? String(guestMigration.guestId).slice(0, 48) : null;
  if (guestId && !existing) {
    const dupGuest = db.prepare('SELECT id FROM users WHERE migrated_from_guest_id = ?').get(guestId);
    if (dupGuest) {
      // Idempotent guard: clear old guest reference only if creating an unrelated account? No, keep unique so guest doesn't duplicate!
    }
  }

  const cleanName = sanitizeUsername(username || guestMigration?.name) || 'Jugador';
  const avatarColor = /^#[0-9a-fA-F]{3,8}$/.test(guestMigration?.avatarColor || '')
    ? guestMigration.avatarColor
    : '#f58229';
  const avatarIcon = String(guestMigration?.avatarIcon || '⚡').slice(0, 4);
  const favsJson = JSON.stringify(
    Array.isArray(guestMigration?.favoriteGames) ? guestMigration.favoriteGames.slice(0, 8) : []
  );

  const now = new Date().toISOString();
  const pwHash = hashPassword(String(password));

  let userId;
  if (existing && !existing.email_verified) {
    userId = existing.id;
    db.prepare(
      'UPDATE users SET password_hash = ?, username = ?, avatar_color = ?, avatar_icon = ?, favorite_games = ?, updated_at = ? WHERE id = ?'
    ).run(pwHash, cleanName, avatarColor, avatarIcon, favsJson, now, userId);
  } else {
    userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const safeMigratedGuest =
      guestId && !db.prepare('SELECT 1 FROM users WHERE migrated_from_guest_id = ?').get(guestId)
        ? guestId
        : null;

    db.prepare(
      `INSERT INTO users (
        id, public_id, tag, email, email_verified, password_hash, username,
        avatar_color, avatar_icon, favorite_games, migrated_from_guest_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      generatePublicId(db),
      generateTag(db),
      cleanEmail,
      pwHash,
      cleanName,
      avatarColor,
      avatarIcon,
      favsJson,
      safeMigratedGuest,
      now,
      now
    );
    insertSettingsFromGuest(db, userId, guestMigration?.settings || {});
  }

  const otpInfo = await issueOtp(db, cleanEmail, 'verify_email');
  return {
    ok: true,
    email: cleanEmail,
    message: 'Cuenta creada. Introduce el código OTP de 6 dígitos para verificar tu correo.',
    ...otpInfo
  };
}

export async function loginWithGoogle({ credential, guestMigration, deviceLabel }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw Object.assign(
      new Error('Google OAuth no está configurado en el servidor (falta GOOGLE_CLIENT_ID).'),
      { status: 501, code: 'PROVIDER_NOT_CONFIGURED' }
    );
  }
  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(credential || ''))}`
  );
  if (!resp.ok) {
    throw Object.assign(new Error('Token de Google inválido.'), { status: 401 });
  }
  const info = await resp.json();
  if (info.aud !== clientId || info.email_verified !== 'true' || !isValidEmail(info.email)) {
    throw Object.assign(new Error('El token de Google no coincide con la aplicación.'), { status: 401 });
  }

  const db = getDb();
  const cleanEmail = info.email.toLowerCase();
  let user = db.prepare('SELECT * FROM users WHERE google_sub = ? OR email = ?').get(info.sub, cleanEmail);
  const now = new Date().toISOString();

  if (!user) {
    const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const cleanName = sanitizeUsername(info.name || guestMigration?.name) || 'Jugador';
    db.prepare(
      `INSERT INTO users (
        id, public_id, tag, email, email_verified, google_sub, username,
        avatar_color, avatar_icon, favorite_games, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      generatePublicId(db),
      generateTag(db),
      cleanEmail,
      info.sub,
      cleanName,
      guestMigration?.avatarColor || '#f58229',
      guestMigration?.avatarIcon || '⚡',
      JSON.stringify(guestMigration?.favoriteGames || []),
      now,
      now
    );
    insertSettingsFromGuest(db, userId, guestMigration?.settings || {});
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  } else if (!user.google_sub || !user.email_verified) {
    db.prepare('UPDATE users SET google_sub = ?, email_verified = 1, updated_at = ? WHERE id = ?').run(
      info.sub,
      now,
      user.id
    );
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  const sess = createSessionForUser(db, user.id, deviceLabel);
  return {
    token: sess.rawToken,
    user: toPrivateUser(user, db),
    settings: getSettingsRow(db, user.id)
  };
}
