import { createClient } from '@supabase/supabase-js';
import { store } from '../state/store.js';

let cachedClient = null;
let cachedKey = '';

export function resolveSupabaseConfig(explicit = null) {
  const caps = store.getState()?.capabilities || {};
  const url = String(
    explicit?.url ||
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
      caps.supabaseUrl ||
      ''
  )
    .trim()
    .replace(/\/$/, '');
  const anonKey = String(
    explicit?.anonKey ||
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
      caps.supabaseAnonKey ||
      ''
  ).trim();
  return { url, anonKey };
}

export function getSupabaseClient(explicit = null) {
  const { url, anonKey } = resolveSupabaseConfig(explicit);
  if (!url || !anonKey) return null;
  const key = `${url}|${anonKey}`;
  if (cachedClient && cachedKey === key) return cachedClient;

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });
  cachedKey = key;
  return cachedClient;
}

export function resetSupabaseClientForTests() {
  cachedClient = null;
  cachedKey = '';
}
