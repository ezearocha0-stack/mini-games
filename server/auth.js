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
import { deliverOtpEmail } from './mailer.js';

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 segundos entre envíos exitosos
export const OTP_WINDOW_15M_MAX = 5;
export const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function makeHttpError(status, message, code, extra = {}) {
  return Object.assign(new Error(message), { status, code, extra });
}

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

export function getActiveOtpCooldown(db, email, purpose) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const now = Date.now();
  const latestSent = db
    .prepare(
      `SELECT created_at, expires_at FROM otp_codes
       WHERE email = ? AND purpose = ? AND delivery_status IN ('sent', 'console_test')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(cleanEmail, purpose);

  if (latestSent) {
    const elapsed = now - latestSent.created_at;
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      return {
        inCooldown: true,
        retryAfterSec: Math.max(1, Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000)),
        expiresInSec: Math.max(0, Math.floor((latestSent.expires_at - now) / 1000))
      };
    }
  }
  return { inCooldown: false, retryAfterSec: 0, expiresInSec: 0 };
}

export async function issueOtp(db, email, purpose, { enforceCooldown = true } = {}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const now = Date.now();

  if (enforceCooldown) {
    const cd = getActiveOtpCooldown(db, cleanEmail, purpose);
    if (cd.inCooldown) {
      throw makeHttpError(
        429,
        `Espera ${cd.retryAfterSec} segundos antes de solicitar otro código para ${cleanEmail}.`,
        'OTP_COOLDOWN',
        { retryAfterSec: cd.retryAfterSec, email: cleanEmail }
      );
    }

    const recentSentCount = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM otp_codes
         WHERE email = ? AND created_at > ? AND delivery_status IN ('sent', 'console_test')`
      )
      .get(cleanEmail, now - 15 * 60 * 1000).cnt;
    if (recentSentCount >= OTP_WINDOW_15M_MAX) {
      throw makeHttpError(
        429,
        'Has superado el límite de 5 solicitudes de código en 15 minutos. Intenta más tarde.',
        'OTP_RATE_LIMIT',
        { retryAfterSec: 120, email: cleanEmail }
      );
    }
  }

  const code = generateOtp6();
  const id = 'otp_' + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
  const expiresAt = now + OTP_TTL_MS;

  db.prepare('UPDATE otp_codes SET used = 1 WHERE email = ? AND purpose = ? AND used = 0').run(
    cleanEmail,
    purpose
  );
  db.prepare(
    `INSERT INTO otp_codes (
      id, email, purpose, code_hash, attempts, expires_at, used, delivery_status, provider_error, created_at
    ) VALUES (?, ?, ?, ?, 0, ?, 0, 'pending', '', ?)`
  ).run(id, cleanEmail, purpose, sha256Hex(code), expiresAt, now);

  const delivery = await deliverOtpEmail({ email: cleanEmail, code, purpose });
  const providerError = delivery.errorMessage || '';

  db.prepare('UPDATE otp_codes SET delivery_status = ?, provider_error = ? WHERE id = ?').run(
    delivery.status,
    providerError.slice(0, 300),
    id
  );

  // If rejected or unconfigured, mark OTP code invalid so user cannot verify a dead unsent code
  if (delivery.status === 'rejected' || delivery.status === 'unconfigured') {
    db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(id);
  }

  const devOtpHint = delivery.status === 'console_test' ? code : undefined;
  return {
    email: cleanEmail,
    deliveryStatus: delivery.status,
    provider: delivery.provider,
    messageId: delivery.messageId,
    errorCode: delivery.errorCode,
    providerError: providerError || undefined,
    expiresAt,
    expiresInSec: Math.round(OTP_TTL_MS / 1000),
    cooldownSec: delivery.status === 'sent' || delivery.status === 'console_test' ? 60 : 0,
    devOtpHint
  };
}

export function verifyOtpConsume(db, email, purpose, code) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanCode = String(code || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return { ok: false, message: 'El código OTP debe tener exactamente 6 dígitos numéricos.' };
  }

  const row = db
    .prepare(
      'SELECT * FROM otp_codes WHERE email = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
    )
    .get(cleanEmail, purpose);

  if (!row) {
    const lastRow = db
      .prepare('SELECT delivery_status, expires_at, used FROM otp_codes WHERE email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1')
      .get(cleanEmail, purpose);
    if (lastRow && (lastRow.delivery_status === 'rejected' || lastRow.delivery_status === 'unconfigured')) {
      return {
        ok: false,
        message: 'El envío de correo anterior falló y no hay ningún código válido. Pulsa Reenviar código cuando el correo esté configurado.'
      };
    }
    if (lastRow && lastRow.expires_at < Date.now()) {
      return { ok: false, message: 'El código OTP expiró (10 min). Pulsa Reenviar código.' };
    }
    return { ok: false, message: 'No hay código pendiente para ese correo. Solicita uno nuevo.' };
  }

  if (row.expires_at < Date.now()) {
    db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
    return { ok: false, message: 'El código OTP expiró tras 10 minutos. Solicita uno nuevo.' };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
    return { ok: false, message: 'Demasiados intentos fallidos. Solicita un código nuevo.' };
  }

  if (sha256Hex(cleanCode) !== row.code_hash) {
    const nextAttempts = row.attempts + 1;
    db.prepare('UPDATE otp_codes SET attempts = ? WHERE id = ?').run(nextAttempts, row.id);
    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
      return { ok: false, message: 'Has agotado los 5 intentos permitidos. Solicita un código nuevo.' };
    }
    return {
      ok: false,
      message: `Código OTP incorrecto. Te quedan ${OTP_MAX_ATTEMPTS - nextAttempts} intento(s).`
    };
  }

  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
  return { ok: true };
}

export async function registerUser({ email, password, username, guestMigration }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) {
    throw makeHttpError(400, 'Correo electrónico inválido.', 'INVALID_EMAIL');
  }
  if (!password || String(password).length < 8) {
    throw makeHttpError(400, 'La contraseña debe tener al menos 8 caracteres.', 'WEAK_PASSWORD');
  }

  const db = getDb();
  const existing = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(cleanEmail);
  if (existing && existing.email_verified) {
    throw makeHttpError(409, 'Ya existe una cuenta verificada con este correo.', 'EMAIL_ALREADY_EXISTS');
  }

  const guestId = guestMigration?.guestId ? String(guestMigration.guestId).slice(0, 48) : null;
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

  if (otpInfo.deliveryStatus === 'rejected') {
    throw makeHttpError(
      502,
      otpInfo.providerError || 'El proveedor de correo rechazó el envío del código OTP.',
      'EMAIL_DELIVERY_REJECTED',
      {
        accountStatus: 'pending_verification',
        deliveryStatus: 'rejected',
        email: cleanEmail,
        provider: otpInfo.provider,
        providerError: otpInfo.providerError
      }
    );
  }

  if (otpInfo.deliveryStatus === 'unconfigured') {
    throw makeHttpError(
      503,
      otpInfo.providerError || 'No hay proveedor de correo configurado para enviar el código OTP.',
      'EMAIL_PROVIDER_NOT_CONFIGURED',
      {
        accountStatus: 'pending_verification',
        deliveryStatus: 'unconfigured',
        email: cleanEmail,
        provider: 'none'
      }
    );
  }

  return {
    ok: true,
    accountStatus: 'pending_verification',
    message:
      otpInfo.deliveryStatus === 'sent'
        ? `Código de verificación enviado a ${cleanEmail}.`
        : 'Cuenta pendiente de verificación (modo pruebas locales).',
    ...otpInfo
  };
}

export async function exchangeSupabaseSession({ accessToken, guestMigration, deviceLabel }) {
  const supabaseUrl = String(process.env.SUPABASE_AUTH_BASE_URL || process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw makeHttpError(
      501,
      'Supabase Auth no está configurado en el servidor (SUPABASE_URL / SUPABASE_ANON_KEY).',
      'SUPABASE_NOT_CONFIGURED'
    );
  }
  const tokenStr = String(accessToken || '').trim();
  if (!tokenStr) {
    throw makeHttpError(400, 'Falta accessToken de Supabase.', 'MISSING_ACCESS_TOKEN');
  }

  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${tokenStr}`
    },
    signal: AbortSignal.timeout(10_000)
  });

  if (!resp.ok) {
    throw makeHttpError(401, 'La sesión de Supabase no es válida o expiró.', 'INVALID_SUPABASE_SESSION');
  }

  const sbUser = await resp.json();
  const cleanEmail = String(sbUser?.email || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) {
    throw makeHttpError(401, 'El usuario de Supabase no contiene un correo válido.', 'INVALID_SUPABASE_USER');
  }
  const isConfirmed = Boolean(sbUser.email_confirmed_at || sbUser.confirmed_at);
  if (!isConfirmed) {
    throw makeHttpError(403, 'Debes verificar tu correo con el código OTP primero.', 'EMAIL_NOT_VERIFIED', {
      accountStatus: 'pending_verification',
      email: cleanEmail
    });
  }

  const db = getDb();
  const now = new Date().toISOString();
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);

  if (!user) {
    const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const metaName = sbUser.user_metadata?.username || guestMigration?.name;
    const cleanName = sanitizeUsername(metaName || cleanEmail.split('@')[0]) || 'Jugador';
    const guestId = guestMigration?.guestId ? String(guestMigration.guestId).slice(0, 48) : null;
    const safeMigratedGuest =
      guestId && !db.prepare('SELECT 1 FROM users WHERE migrated_from_guest_id = ?').get(guestId)
        ? guestId
        : null;

    db.prepare(
      `INSERT INTO users (
        id, public_id, tag, email, email_verified, username,
        avatar_color, avatar_icon, favorite_games, migrated_from_guest_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      generatePublicId(db),
      generateTag(db),
      cleanEmail,
      cleanName,
      sbUser.user_metadata?.avatar_color || guestMigration?.avatarColor || '#f58229',
      sbUser.user_metadata?.avatar_icon || guestMigration?.avatarIcon || '⚡',
      JSON.stringify(guestMigration?.favoriteGames || []),
      safeMigratedGuest,
      now,
      now
    );
    insertSettingsFromGuest(db, userId, guestMigration?.settings || {});
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  } else if (!user.email_verified) {
    db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').run(now, user.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  const sess = createSessionForUser(db, user.id, deviceLabel);
  return {
    token: sess.rawToken,
    user: toPrivateUser(user, db),
    settings: getSettingsRow(db, user.id)
  };
}

export async function loginWithGoogle({ credential, guestMigration, deviceLabel }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw makeHttpError(
      501,
      'Google OAuth no está configurado en el servidor (falta GOOGLE_CLIENT_ID).',
      'PROVIDER_NOT_CONFIGURED'
    );
  }
  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(credential || ''))}`
  );
  if (!resp.ok) {
    throw makeHttpError(401, 'Token de Google inválido.', 'INVALID_GOOGLE_TOKEN');
  }
  const info = await resp.json();
  if (info.aud !== clientId || info.email_verified !== 'true' || !isValidEmail(info.email)) {
    throw makeHttpError(401, 'El token de Google no coincide con la aplicación.', 'GOOGLE_MISMATCH');
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
