import { store } from '../state/store.js';
import { sfx } from '../audio/sfx.js';
import { apiRequest } from './apiClient.js';

export function applySettingsToDocument(settings) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme === 'light' ? 'light' : 'dark';
  root.dataset.accent = settings.accent || 'amber';
  root.dataset.scale = settings.uiScale || 'normal';
  root.dataset.motion = settings.reducedMotion ? 'reduced' : 'normal';

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', settings.theme === 'light' ? '#eef1f5' : '#0b0f15');
  }

  sfx.applySettings({
    masterVolume: settings.masterVolume,
    sfxVolume: settings.sfxVolume,
    musicVolume: settings.musicVolume
  });
}

export async function updateSettings(patch) {
  const merged = store.saveLocalSettings(patch);
  applySettingsToDocument(merged);

  if (store.getState().user) {
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: merged
      });
    } catch {}
  }
  return merged;
}
