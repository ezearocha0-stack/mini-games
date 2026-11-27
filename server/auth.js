import crypto from 'node:crypto';
import { getDb, toPrivateUser, getSettingsRow } from './db.js';
import {
  hashPassword,
  verifyPassword,
  sha256Hex,
  generateOtp6,
  generateSecureToken,
  isValidEmail,
  sanitizeUsername,
  validatePasswordStrength
} from './security.js';
import { deliverOtpEmail } from './mailer.js';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
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

// Password recovery helpers (unused by direct registration or password login)
export async function issuePasswordResetCode(db, email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const now = Date.now();

  const latestSent = db
    .prepare(
      `SELECT created_at FROM otp_codes
       WHERE email = ? AND purpose = 'reset_password' AND delivery_status IN ('sent', 'console_test')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(cleanEmail);
  if (latestSent && now - latestSent.created_at < OTP_RESEND_COOLDOWN_MS) {
    const retryAfterSec = Math.max(1, Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - latestSent.created_at)) / 1000));
    throw makeHttpError(
      429,
      `Espera ${retryAfterSec} segundos antes de solicitar otro código de recuperación.`,
      'RECOVERY_COOLDOWN',
      { retryAfterSec }
    );
  }

  const recentCount = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM otp_codes
       WHERE email = ? AND purpose = 'reset_password' AND created_at > ? AND delivery_status IN ('sent', 'console_test')`
    )
    .get(cleanEmail, now - 15 * 60 * 1000).cnt;
  if (recentCount >= OTP_WINDOW_15M_MAX) {
    throw makeHttpError(
      429,
      'Has superado el límite de solicitudes de recuperación. Intenta más tarde.',
      'RECOVERY_RATE_LIMIT',
      { retryAfterSec: 120 }
    );
  }

  const code = generateOtp6();
  const id = 'otp_' + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
  const expiresAt = now + OTP_TTL_MS;

  db.prepare("UPDATE otp_codes SET used = 1 WHERE email = ? AND purpose = 'reset_password' AND used = 0").run(cleanEmail);
  db.prepare(
    `INSERT INTO otp_codes (
      id, email, purpose, code_hash, attempts, expires_at, used, delivery_status, provider_error, created_at
    ) VALUES (?, ?, 'reset_password', ?, 0, ?, 0, 'pending', '', ?)`
  ).run(id, cleanEmail, sha256Hex(code), expiresAt, now);

  const delivery = await deliverOtpEmail({ email: cleanEmail, code, purpose: 'reset_password' });
  const providerError = delivery.errorMessage || '';
  db.prepare('UPDATE otp_codes SET delivery_status = ?, provider_error = ? WHERE id = ?').run(
    delivery.status,
    providerError.slice(0, 300),
    id
  );
  if (delivery.status === 'rejected' || delivery.status === 'unconfigured') {
    db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(id);
  }

  return {
    deliveryStatus: delivery.status,
    provider: delivery.provider,
    providerError: providerError || undefined,
    cooldownSec: delivery.status === 'sent' || delivery.status === 'console_test' ? 60 : 0,
    devOtpHint: delivery.status === 'console_test' ? code : undefined
  };
}

export function verifyPasswordResetCode(db, email, code) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanCode = String(code || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return { ok: false, message: 'El código de recuperación debe tener 6 dígitos.' };
  }

  const row = db
    .prepare("SELECT * FROM otp_codes WHERE email = ? AND purpose = 'reset_password' AND used = 0 ORDER BY created_at DESC LIMIT 1")
    .get(cleanEmail);
  if (!row) {
    return { ok: false, message: 'No hay ningún código de recuperación activo para ese correo.' };
  }
  if (row.expires_at < Date.now()) {
    db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
    return { ok: false, message: 'El código de recuperación expiró. Solicita uno nuevo.' };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
    return { ok: false, message: 'Demasiados intentos. Solicita un nuevo código.' };
  }

  if (sha256Hex(cleanCode) !== row.code_hash) {
    const nextAttempts = row.attempts + 1;
    db.prepare('UPDATE otp_codes SET attempts = ? WHERE id = ?').run(nextAttempts, row.id);
    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
    }
    return { ok: false, message: 'Código de recuperación incorrecto.' };
  }

  db.prepare('UPDATE otp_codes SET used = 1 WHERE id = ?').run(row.id);
  return { ok: true };
}

export async function registerUser({ email, password, confirmPassword, username, guestMigration, deviceLabel }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) {
    throw makeHttpError(400, 'Introduce un correo electrónico válido.', 'INVALID_EMAIL');
  }

  const pwCheck = validatePasswordStrength(password);
  if (!pwCheck.ok) {
    throw makeHttpError(400, pwCheck.message, 'WEAK_PASSWORD');
  }

  if (confirmPassword === undefined || confirmPassword === null || String(password) !== String(confirmPassword)) {
    throw makeHttpError(400, 'Las contraseñas no coinciden.', 'PASSWORD_MISMATCH');
  }

  const db = getDb();
  const cleanName = sanitizeUsername(username || guestMigration?.name) || 'Jugador';
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    // Legacy orphaned test accounts (created during old OTP flow before completing any session or match):
    // allow automatic recovery ONLY if the exact owner supplies the matching password without altering identity.
    const sessCount = db.prepare('SELECT COUNT(*) AS cnt FROM sessions WHERE user_id = ?').get(existing.id).cnt;
    const isOrphanWithSameOwner =
      existing.email_verified === 0 &&
      (existing.matches_played || 0) === 0 &&
      sessCount === 0 &&
      verifyPassword(String(password), existing.password_hash);

    if (isOrphanWithSameOwner) {
      db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?').run(cleanName, now, existing.id);
      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
      const sess = createSessionForUser(db, updated.id, deviceLabel);
      return {
        ok: true,
        token: sess.rawToken,
        user: toPrivateUser(updated, db),
        settings: getSettingsRow(db, updated.id)
      };
    }

    throw makeHttpError(
      409,
      'Ya existe una cuenta registrada con este correo. Inicia sesión con tu contraseña.',
      'EMAIL_ALREADY_EXISTS'
    );
  }

  const guestId = guestMigration?.guestId ? String(guestMigration.guestId).slice(0, 48) : null;
  const avatarColor = /^#[0-9a-fA-F]{3,8}$/.test(guestMigration?.avatarColor || '')
    ? guestMigration.avatarColor
    : '#f58229';
  const avatarIcon = String(guestMigration?.avatarIcon || '⚡').slice(0, 4);
  const favsJson = JSON.stringify(
    Array.isArray(guestMigration?.favoriteGames) ? guestMigration.favoriteGames.slice(0, 8) : []
  );

  const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const pwHash = hashPassword(String(password));
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

  const createdUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const sess = createSessionForUser(db, userId, deviceLabel);
  return {
    ok: true,
    token: sess.rawToken,
    user: toPrivateUser(createdUser, db),
    settings: getSettingsRow(db, userId)
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
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`
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
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`
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
  } else if (!user.google_sub) {
    db.prepare('UPDATE users SET google_sub = ?, updated_at = ? WHERE id = ?').run(info.sub, now, user.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  const sess = createSessionForUser(db, user.id, deviceLabel);
  return {
    token: sess.rawToken,
    user: toPrivateUser(user, db),
    settings: getSettingsRow(db, user.id)
  };
}
