// Unified REST API client with clean error normalization & optional cross-origin support

const TOKEN_STORAGE_KEY = 'mg_session_token_v1';

export function getApiBase() {
  const configured = import.meta.env?.VITE_API_ORIGIN;
  if (configured && typeof configured === 'string') {
    return configured.replace(/\/$/, '');
  }
  return '';
}

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {}
}

export async function apiRequest(path, { method = 'GET', body = null, signal = null } = {}) {
  const base = getApiBase();
  const headers = {};
  const token = getStoredToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers,
      credentials: base ? 'include' : 'same-origin',
      body: body !== null ? JSON.stringify(body) : undefined,
      signal
    });
  } catch {
    const err = new Error('No se pudo conectar con el servidor.');
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const err = new Error('Backend API no disponible en este despliegue estático.');
    err.code = 'API_UNAVAILABLE';
    err.status = res.status;
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `Error ${res.status}`);
    err.code = data.code || 'API_ERROR';
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
