import { store } from '../state/store.js';
import { apiRequest, setStoredToken } from './apiClient.js';
import { applySettingsToDocument } from './settingsService.js';
import { getSupabaseClient } from './supabaseClient.js';

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function buildAuthError(message, code, extra = {}) {
  const err = new Error(message);
  err.code = code;
  err.status = extra.status || 400;
  err.data = { code, message, ...extra };
  return err;
}

function mapSupabaseAuthError(err, context = 'auth', email = '') {
  const raw = String(err?.message || 'Error en Supabase Auth');
  const low = raw.toLowerCase();

  if (
    low.includes('error sending') ||
    low.includes('smtp') ||
    low.includes('not authorized') ||
    low.includes('sender') ||
    low.includes('bounce')
  ) {
    return buildAuthError(
      'Supabase rechazó el envío del correo de verificación (SMTP predeterminado restringido o SMTP externo mal configurado). Configura Custom SMTP con Resend en Supabase.',
      'EMAIL_DELIVERY_REJECTED',
      {
        status: 502,
        accountStatus: 'pending_verification',
        deliveryStatus: 'rejected',
        provider: 'supabase',
        providerError: raw,
        email
      }
    );
  }
  if (low.includes('rate limit') || low.includes('too many') || low.includes('once every') || err?.status === 429) {
    const secMatch = raw.match(/(\d+)\s*seconds?/i);
    const retryAfterSec = secMatch ? Number(secMatch[1]) : 60;
    return buildAuthError(
      `Límite de solicitudes de Supabase alcanzado. Espera ${retryAfterSec} segundos antes de reenviar.`,
      'OTP_COOLDOWN',
      { status: 429, retryAfterSec, email }
    );
  }
  if (low.includes('already registered') || low.includes('already exists')) {
    return buildAuthError('Ya existe una cuenta registrada con este correo.', 'EMAIL_ALREADY_EXISTS', {
      status: 409,
      email
    });
  }
  if (low.includes('email not confirmed')) {
    return buildAuthError(
      `Tu correo (${email}) aún está pendiente de verificación. Introduce el código de 6 dígitos o reenvíalo.`,
      'EMAIL_NOT_VERIFIED',
      {
        status: 403,
        accountStatus: 'pending_verification',
        deliveryStatus: 'pending',
        email,
        cooldownSec: 0
      }
    );
  }
  if (low.includes('expired') || low.includes('token has expired')) {
    return buildAuthError(
      'El código OTP expiró. Pulsa «Reenviar código» para recibir uno nuevo.',
      'OTP_EXPIRED',
      { status: 400, email }
    );
  }
  if (low.includes('invalid') && context === 'verify') {
    return buildAuthError('Código OTP incorrecto o ya utilizado.', 'OTP_INVALID', { status: 400, email });
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
    throw buildAuthError('No se recibió token de sesión tras verificar el código.', 'MISSING_ACCESS_TOKEN');
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
        emailVerified: Boolean(u.email_confirmed_at || u.confirmed_at),
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

export async function registerAccount({ email, password, username }) {
  const cleanEmail = normalizeEmail(email);
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
      throw mapSupabaseAuthError(error, 'register', cleanEmail);
    }

    if (Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {
      throw buildAuthError(
        'Ya existe una cuenta registrada con este correo. Inicia sesión o recupera tu contraseña.',
        'EMAIL_ALREADY_EXISTS',
        { status: 409, email: cleanEmail }
      );
    }

    if (data?.session) {
      const synced = await syncSupabaseSessionWithBackend(data.session);
      return {
        ok: true,
        provider: 'supabase',
        email: cleanEmail,
        accountStatus: 'verified',
        deliveryStatus: 'verified',
        sessionReady: true,
        ...synced
      };
    }

    return {
      ok: true,
      provider: 'supabase',
      email: cleanEmail,
      accountStatus: 'pending_verification',
      deliveryStatus: 'sent',
      cooldownSec: 60,
      expiresInSec: 600,
      message: `Solicitud enviada a ${cleanEmail}. Introduce el código OTP de 6 dígitos de tu correo.`
    };
  }

  return apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      email: cleanEmail,
      password,
      username: cleanName,
      guestMigration: buildGuestMigrationPayload()
    }
  });
}

export async function verifyOtpCode({ email, code, purpose = 'verify_email' }) {
  const cleanEmail = normalizeEmail(email);
  const cleanCode = String(code || '').trim();

  const sb = getSupabaseClient();
  if (sb) {
    const sbType =
      purpose === 'verify_email' ? 'signup' : purpose === 'reset_password' ? 'recovery' : 'email';
    const { data, error } = await sb.auth.verifyOtp({
      email: cleanEmail,
      token: cleanCode,
      type: sbType
    });
    if (error) {
      throw mapSupabaseAuthError(error, 'verify', cleanEmail);
    }
    if (purpose === 'reset_password') {
      return { ok: true, provider: 'supabase', session: data?.session || null };
    }
    if (!data?.session) {
      throw buildAuthError(
        'Código validado sin sesión activa. Intenta iniciar sesión.',
        'MISSING_SESSION',
        { status: 400 }
      );
    }
    return syncSupabaseSessionWithBackend(data.session);
  }

  const data = await apiRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email: cleanEmail, code: cleanCode, purpose }
  });
  if (data.token) setStoredToken(data.token);
  if (data.user) {
    store.setState({ user: data.user });
    if (data.settings) {
      const merged = store.saveLocalSettings(data.settings);
      applySettingsToDocument(merged);
    }
  }
  return data;
}

export async function requestOtpCode({ email, purpose = 'login' }) {
  const cleanEmail = normalizeEmail(email);

  const sb = getSupabaseClient();
  if (sb) {
    if (purpose === 'verify_email') {
      const { error } = await sb.auth.resend({
        type: 'signup',
        email: cleanEmail
      });
      if (error) throw mapSupabaseAuthError(error, 'resend', cleanEmail);
    } else if (purpose === 'reset_password') {
      const { error } = await sb.auth.resetPasswordForEmail(cleanEmail);
      if (error) throw mapSupabaseAuthError(error, 'reset', cleanEmail);
    } else {
      const { error } = await sb.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: false }
      });
      if (error) throw mapSupabaseAuthError(error, 'login_otp', cleanEmail);
    }
    return {
      ok: true,
      provider: 'supabase',
      email: cleanEmail,
      deliveryStatus: 'sent',
      cooldownSec: 60,
      expiresInSec: 600,
      message: `Código reenviado a ${cleanEmail}.`
    };
  }

  return apiRequest('/api/auth/request-otp', {
    method: 'POST',
    body: { email: cleanEmail, purpose }
  });
}

export async function loginWithPassword({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.auth.signInWithPassword({
      email: cleanEmail,
      password
    });
    if (error) {
      throw mapSupabaseAuthError(error, 'login', cleanEmail);
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
    store.setState({ user: data.user });
    if (data.settings) {
      const merged = store.saveLocalSettings(data.settings);
      applySettingsToDocument(merged);
    }
  }
  return data;
}

export async function resetPasswordWithOtp({ email, code, newPassword }) {
  const cleanEmail = normalizeEmail(email);
  const cleanCode = String(code || '').trim();
  const sb = getSupabaseClient();
  if (sb) {
    const { data, error } = await sb.auth.verifyOtp({
      email: cleanEmail,
      token: cleanCode,
      type: 'recovery'
    });
    if (error) throw mapSupabaseAuthError(error, 'verify', cleanEmail);
    if (!data?.session) {
      throw buildAuthError('No se pudo abrir sesión de recuperación.', 'RECOVERY_FAILED');
    }
    const upd = await sb.auth.updateUser({ password: newPassword });
    if (upd.error) throw mapSupabaseAuthError(upd.error, 'reset', cleanEmail);
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
