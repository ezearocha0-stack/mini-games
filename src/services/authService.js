import { store } from '../state/store.js';
import { apiRequest, setStoredToken } from './apiClient.js';
import { applySettingsToDocument } from './settingsService.js';
import { getSupabaseClient } from './supabaseClient.js';

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 160;
}

export function validatePasswordClient(password) {
  const pw = String(password ?? '');
  if (pw.length < 8) {
    return { ok: false, message: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  if (pw.length > 128) {
    return { ok: false, message: 'La contraseña no puede superar los 128 caracteres.' };
  }
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    return {
      ok: false,
      message: 'La contraseña debe incluir al menos una letra y un número.'
    };
  }
  return { ok: true };
}

function buildAuthError(message, code, extra = {}) {
  const err = new Error(message);
  err.code = code;
  err.status = extra.status || 400;
  err.data = { code, message, ...extra };
  return err;
}

function mapSupabaseAuthError(err, email = '') {
  const raw = String(err?.message || 'Error en Supabase Auth');
  const low = raw.toLowerCase();

  if (low.includes('rate limit') || low.includes('too many') || low.includes('once every') || err?.status === 429) {
    const secMatch = raw.match(/(\d+)\s*seconds?/i);
    const retryAfterSec = secMatch ? Number(secMatch[1]) : 60;
    return buildAuthError(
      `Demasiados intentos en Supabase. Espera ${retryAfterSec} segundos antes de intentarlo de nuevo.`,
      'RATE_LIMIT',
      { status: 429, retryAfterSec, email }
    );
  }
  if (low.includes('already registered') || low.includes('already exists')) {
    return buildAuthError(
      'Ya existe una cuenta registrada con este correo. Inicia sesión con tu contraseña.',
      'EMAIL_ALREADY_EXISTS',
      { status: 409, email }
    );
  }
  if (low.includes('invalid login credentials')) {
    return buildAuthError('Correo o contraseña incorrectos.', 'INVALID_CREDENTIALS', { status: 401, email });
  }
  if (low.includes('email not confirmed')) {
    return buildAuthError(
      'Tu proyecto de Supabase tiene «Confirm Email» activado. Desactívalo en Supabase Dashboard → Authentication → Sign In / Providers → Email → Confirm Email: OFF para permitir el acceso inmediato.',
      'SUPABASE_CONFIRM_EMAIL_ENABLED',
      { status: 403, email }
    );
  }
  if (low.includes('expired') || low.includes('token has expired')) {
    return buildAuthError('El código de recuperación expiró. Solicita uno nuevo.', 'RECOVERY_EXPIRED', {
      status: 400,
      email
    });
  }
  return buildAuthError(raw, err?.code || 'SUPABASE_AUTH_ERROR', { status: err?.status || 400, email });
}

function buildGuestMigrationPayload() {
  const guest = store.getState().guest;
  return {
    guestId: guest.guestId,
    name: guest.name,
    avatarColor: guest.avatarColor,
    avatarIcon: guest.avatarIcon,
    favoriteGames: store.getState().favoriteGames,
    settings: store.getState().settings
  };
}

async function syncSupabaseSessionWithBackend(session) {
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw buildAuthError('Supabase no devolvió un token de sesión válido.', 'MISSING_ACCESS_TOKEN');
  }
  try {
    const data = await apiRequest('/api/auth/supabase-exchange', {
      method: 'POST',
      body: {
        accessToken,
        guestMigration: buildGuestMigrationPayload()
      }
    });
    if (data.token) setStoredToken(data.token);
    if (data.user) {
      store.setState({
        user: data.user,
        favoriteGames: Array.isArray(data.user.favoriteGames)
          ? data.user.favoriteGames
          : store.getState().favoriteGames
      });
      if (data.settings) {
        const merged = store.saveLocalSettings(data.settings);
        applySettingsToDocument(merged);
      }
    }
    return data;
  } catch (err) {
    // Only allow static fallback when there is no backend API (e.g. static Vercel preview)
    if (err.code === 'API_UNAVAILABLE' && session?.user) {
      const u = session.user;
      const guest = store.getState().guest;
      const fallbackUser = {
        id: u.id,
        publicId: `MG-${String(u.id).slice(0, 6).toUpperCase()}`,
        tag: 'SB01',
        username: u.user_metadata?.username || guest.name || 'Jugador',
        bio: '',
        avatarColor: u.user_metadata?.avatar_color || guest.avatarColor || '#f58229',
        avatarIcon: u.user_metadata?.avatar_icon || guest.avatarIcon || '⚡',
        favoriteGames: store.getState().favoriteGames || [],
        level: 1,
        xp: 0,
        email: u.email,
        emailVerified: false,
        stats: {
          eloGlobal: 1000,
          eloByGame: {},
          wins: 0,
          losses: 0,
          draws: 0,
          matchesPlayed: 0,
          winRate: 0,
          currentStreak: 0,
          bestStreak: 0,
          playtimeSeconds: 0
        },
        badges: []
      };
      store.setState({ user: fallbackUser });
      return { user: fallbackUser, provider: 'supabase' };
    }
    throw err;
  }
}

export async function bootstrapSession() {
  try {
    const caps = await apiRequest('/api/system/capabilities');
    store.setState({ capabilities: { ...store.getState().capabilities, ...caps } });
  } catch {}

  try {
    const data = await apiRequest('/api/auth/me');
    if (data.user) {
      store.setState({
        user: data.user,
        favoriteGames: Array.isArray(data.user.favoriteGames)
          ? data.user.favoriteGames
          : store.getState().favoriteGames
      });
      if (data.settings) {
        const merged = store.saveLocalSettings(data.settings);
        applySettingsToDocument(merged);
      }
      return data.user;
    }
  } catch {}

  const sb = getSupabaseClient();
  if (sb) {
    try {
      const { data } = await sb.auth.getSession();
      if (data?.session?.access_token) {
        const synced = await syncSupabaseSessionWithBackend(data.session);
        return synced.user || null;
      }
    } catch {}
  }

  return null;
}

export async function registerAccount({ email, password, confirmPassword, username }) {
  const cleanEmail = normalizeEmail(email);
  if (!isValidEmailFormat(cleanEmail)) {
    throw buildAuthError('Introduce un correo electrónico válido.', 'INVALID_EMAIL');
  }
  const pwCheck = validatePasswordClient(password);
  if (!pwCheck.ok) {
    throw buildAuthError(pwCheck.message, 'WEAK_PASSWORD');
  }
  if (String(password) !== String(confirmPassword ?? '')) {
    throw buildAuthError('Las contraseñas no coinciden.', 'PASSWORD_MISMATCH');
  }

  const guest = store.getState().guest;
  const cleanName = String(username || guest.name || 'Jugador').trim();

  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          username: cleanName,
          avatar_color: guest.avatarColor || '#f58229',
          avatar_icon: guest.avatarIcon || '⚡'
        }
      }
    });

    if (error) {
      throw mapSupabaseAuthError(error, cleanEmail);
    }

    if (Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {
      throw buildAuthError(
        'Ya existe una cuenta registrada con este correo. Inicia sesión con tu contraseña.',
        'EMAIL_ALREADY_EXISTS',
        { status: 409, email: cleanEmail }
      );
    }

    if (!data?.session) {
      // Never fake a session when Confirm Email is still ON in remote Supabase Dashboard
      throw buildAuthError(
        'La cuenta se creó en Supabase, pero tu proyecto todavía requiere confirmación por correo. Desactiva «Confirm Email: OFF» en Supabase Dashboard → Authentication → Sign In / Providers → Email para iniciar sesión al instante.',
        'SUPABASE_CONFIRM_EMAIL_ENABLED',
        { status: 409, email: cleanEmail }
      );
    }

    const synced = await syncSupabaseSessionWithBackend(data.session);
    return {
      ok: true,
      provider: 'supabase',
      ...synced
    };
  }

  const data = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      email: cleanEmail,
      password,
      confirmPassword,
      username: cleanName,
      guestMigration: buildGuestMigrationPayload()
    }
  });
  if (data.token) setStoredToken(data.token);
  if (data.user) {
    store.setState({
      user: data.user,
      favoriteGames: Array.isArray(data.user.favoriteGames)
        ? data.user.favoriteGames
        : store.getState().favoriteGames
    });
    if (data.settings) {
      const merged = store.saveLocalSettings(data.settings);
      applySettingsToDocument(merged);
    }
  }
  return data;
}

export async function loginWithPassword({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  if (!isValidEmailFormat(cleanEmail)) {
    throw buildAuthError('Introduce un correo electrónico válido.', 'INVALID_EMAIL');
  }
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.auth.signInWithPassword({
      email: cleanEmail,
      password
    });
    if (error) {
      throw mapSupabaseAuthError(error, cleanEmail);
    }
    if (data?.session) {
      return syncSupabaseSessionWithBackend(data.session);
    }
  }

  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: cleanEmail, password }
  });
  if (data.token) setStoredToken(data.token);
  if (data.user) {
    store.setState({
      user: data.user,
      favoriteGames: Array.isArray(data.user.favoriteGames)
        ? data.user.favoriteGames
        : store.getState().favoriteGames
    });
    if (data.settings) {
      const merged = store.saveLocalSettings(data.settings);
      applySettingsToDocument(merged);
    }
  }
  return data;
}

// Recuperación opcional de contraseña (no interfiere con registro ni login)
export async function requestPasswordReset({ email }) {
  const cleanEmail = normalizeEmail(email);
  if (!isValidEmailFormat(cleanEmail)) {
    throw buildAuthError('Introduce un correo electrónico válido.', 'INVALID_EMAIL');
  }
  const sb = getSupabaseClient();
  if (sb) {
    const { error } = await sb.auth.resetPasswordForEmail(cleanEmail);
    if (error) throw mapSupabaseAuthError(error, cleanEmail);
    return { ok: true, provider: 'supabase', cooldownSec: 60 };
  }
  return apiRequest('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: cleanEmail }
  });
}

export async function resetPasswordWithCode({ email, code, newPassword }) {
  const cleanEmail = normalizeEmail(email);
  const cleanCode = String(code || '').trim();
  const pwCheck = validatePasswordClient(newPassword);
  if (!pwCheck.ok) {
    throw buildAuthError(pwCheck.message, 'WEAK_PASSWORD');
  }

  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.auth.verifyOtp({
      email: cleanEmail,
      token: cleanCode,
      type: 'recovery'
    });
    if (error) throw mapSupabaseAuthError(error, cleanEmail);
    if (!data?.session) {
      throw buildAuthError('No se pudo validar el código de recuperación.', 'RECOVERY_FAILED');
    }
    const upd = await sb.auth.updateUser({ password: newPassword });
    if (upd.error) throw mapSupabaseAuthError(upd.error, cleanEmail);
    await sb.auth.signOut().catch(() => {});
    return { ok: true, provider: 'supabase' };
  }

  return apiRequest('/api/auth/reset-password', {
    method: 'POST',
    body: { email: cleanEmail, code: cleanCode, newPassword }
  });
}

export async function loginWithGoogleToken(credential) {
  const data = await apiRequest('/api/auth/google', {
    method: 'POST',
    body: {
      credential,
      guestMigration: buildGuestMigrationPayload()
    }
  });
  if (data.token) setStoredToken(data.token);
  if (data.user) store.setState({ user: data.user });
  return data;
}

export async function logoutAccount() {
  const sb = getSupabaseClient();
  if (sb) {
    await sb.auth.signOut().catch(() => {});
  }
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch {}
  setStoredToken('');
  store.setState({
    user: null,
    friends: { accepted: [], incoming: [], outgoing: [], blocked: [] },
    conversations: [],
    activeConversationId: null,
    notifications: [],
    unreadNotifications: 0
  });
}

export async function updateProfile(patch) {
  if (!store.getState().user) {
    const updatedGuest = store.updateGuest({
      name: patch.username || store.getState().guest.name,
      avatarColor: patch.avatarColor || store.getState().guest.avatarColor,
      avatarIcon: patch.avatarIcon || store.getState().guest.avatarIcon
    });
    return { guest: updatedGuest };
  }
  const data = await apiRequest('/api/profile', {
    method: 'PATCH',
    body: patch
  });
  if (data.user) {
    store.setState({
      user: data.user,
      favoriteGames: Array.isArray(data.user.favoriteGames)
        ? data.user.favoriteGames
        : store.getState().favoriteGames
    });
  }
  return data;
}

export async function fetchSessions() {
  return apiRequest('/api/auth/sessions');
}

export async function revokeSession(sessionId) {
  return apiRequest(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

export async function changePassword({ currentPassword, newPassword }) {
  const pwCheck = validatePasswordClient(newPassword);
  if (!pwCheck.ok) {
    throw buildAuthError(pwCheck.message, 'WEAK_PASSWORD');
  }
  return apiRequest('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword }
  });
}

export async function deleteAccount({ confirmText, password }) {
  const res = await apiRequest('/api/auth/account', {
    method: 'DELETE',
    body: { confirmText, password }
  });
  const sb = getSupabaseClient();
  if (sb) await sb.auth.signOut().catch(() => {});
  setStoredToken('');
  store.setState({
    user: null,
    friends: { accepted: [], incoming: [], outgoing: [], blocked: [] },
    conversations: [],
    notifications: [],
    unreadNotifications: 0
  });
  return res;
}
