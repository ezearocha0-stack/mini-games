import { store } from '../state/store.js';
import { apiRequest, setStoredToken } from './apiClient.js';
import { applySettingsToDocument } from './settingsService.js';

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
    }
    return data.user || null;
  } catch {
    return null;
  }
}

export async function registerAccount({ email, password, username }) {
  const guest = store.getState().guest;
  const data = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      email,
      password,
      username: username || guest.name,
      guestMigration: {
        guestId: guest.guestId,
        name: guest.name,
        avatarColor: guest.avatarColor,
        avatarIcon: guest.avatarIcon,
        favoriteGames: store.getState().favoriteGames,
        settings: store.getState().settings
      }
    }
  });
  return data;
}

export async function verifyOtpCode({ email, code, purpose = 'verify_email' }) {
  const data = await apiRequest('/api/auth/verify-otp', {
    method: 'POST',
    body: { email, code, purpose }
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
  return apiRequest('/api/auth/request-otp', {
    method: 'POST',
    body: { email, purpose }
  });
}

export async function loginWithPassword({ email, password }) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email, password }
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
  return apiRequest('/api/auth/reset-password', {
    method: 'POST',
    body: { email, code, newPassword }
  });
}

export async function loginWithGoogleToken(credential) {
  const guest = store.getState().guest;
  const data = await apiRequest('/api/auth/google', {
    method: 'POST',
    body: {
      credential,
      guestMigration: {
        guestId: guest.guestId,
        name: guest.name,
        avatarColor: guest.avatarColor,
        avatarIcon: guest.avatarIcon,
        favoriteGames: store.getState().favoriteGames,
        settings: store.getState().settings
      }
    }
  });
  if (data.token) setStoredToken(data.token);
  if (data.user) store.setState({ user: data.user });
  return data;
}

export async function logoutAccount() {
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
