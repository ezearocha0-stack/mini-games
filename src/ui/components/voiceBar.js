import { escapeHtml, renderAvatarHtml } from '../escape.js';

const VOICE_STATE_LABELS = {
  disconnected: 'Voz desconectada',
  connecting: 'Conectando voz…',
  connected: 'Canal de voz conectado',
  mic_blocked: 'Micrófono bloqueado (solo escucha)',
  permission_error: 'Permiso de micrófono denegado',
  reconnecting: 'Reconectando voz…'
};

export function renderVoiceBarHtml(state) {
  const voice = state.voice || {};
  const roomConnected = state.room.status === 'connected' || state.room.status === 'waiting';
  if (!roomConnected) return '';

  const peers = Object.entries(voice.peers || {});
  const stateLabel = VOICE_STATE_LABELS[voice.state] || 'Voz';

  if (!voice.joined) {
    return `
      <div class="voice-bar" aria-label="Canal de voz">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="pill">🎙️ Canal de Voz</span>
          <span style="font-size:0.8rem;color:var(--text-secondary);">
            Activación voluntaria · El micrófono empieza apagado por privacidad
          </span>
        </div>
        <button type="button" class="btn btn-secondary btn-compact" data-voice-action="join">
          Unirse a Voz
        </button>
      </div>
    `;
  }

  return `
    <div class="voice-bar" aria-label="Canal de voz activo">
      <div class="voice-peers-row">
        <span class="pill ${voice.state === 'connected' ? 'ok' : voice.state === 'permission_error' || voice.state === 'mic_blocked' ? 'warn' : 'accent'}">
          ${escapeHtml(stateLabel)}
        </span>
        ${peers
          .map(
            ([pid, p]) => `
          <div class="voice-peer-pill ${p.speaking ? 'speaking' : ''}" data-voice-peer="${escapeHtml(pid)}">
            ${renderAvatarHtml({ name: p.name, color: p.avatarColor || '#1ad1be', icon: p.avatarIcon || '🎙️', size: 'sm' })}
            <span>${escapeHtml(p.name)}</span>
            ${p.micMuted ? '<span title="Micrófono apagado">🔇</span>' : ''}
            ${
              !p.isSelf
                ? `<button type="button" class="chat-react-chip" data-voice-peer-mute="${escapeHtml(pid)}" title="${p.localMuted ? 'Reactivar audio de participante' : 'Silenciar participante'}">
                     ${p.localMuted ? '🔇' : '🔊'}
                   </button>
                   <input
                     type="range"
                     min="0"
                     max="2"
                     step="0.1"
                     value="${p.volume ?? 1}"
                     data-voice-peer-vol="${escapeHtml(pid)}"
                     style="width:52px;"
                     aria-label="Volumen de ${escapeHtml(p.name)}"
                   />`
                : ''
            }
          </div>`
          )
          .join('')}
      </div>

      <div class="voice-controls-row">
        <button
          type="button"
          class="btn ${voice.micMuted ? 'btn-subtle' : 'btn-ok'} btn-compact"
          data-voice-action="toggle-mic"
        >
          ${voice.micMuted ? '🎙️ Mic OFF' : '🎙️ Mic ON'}
        </button>
        <button
          type="button"
          class="btn ${voice.deafened ? 'btn-danger-ghost' : 'btn-subtle'} btn-compact"
          data-voice-action="toggle-deafen"
        >
          ${voice.deafened ? '🔇 Audio OFF' : '🎧 Audio ON'}
        </button>
        <button
          type="button"
          class="btn ${voice.pttEnabled ? 'btn-accent-soft' : 'btn-subtle'} btn-compact"
          data-voice-action="toggle-ptt"
          title="Push-to-Talk (Tecla V en PC)"
        >
          ${voice.pttEnabled ? 'PTT ON (V)' : 'PTT'}
        </button>
        ${
          voice.pttEnabled
            ? `<button
                 type="button"
                 class="btn ${voice.pttActive ? 'btn-primary' : 'btn-secondary'} btn-compact"
                 data-voice-ptt-hold
               >
                 Mantener para hablar
               </button>`
            : ''
        }
        <button type="button" class="btn btn-subtle btn-compact" data-voice-action="devices" title="Dispositivos de audio">
          ⚙️
        </button>
        <button type="button" class="btn btn-danger-ghost btn-compact" data-voice-action="leave">
          Colgar
        </button>
      </div>
    </div>
  `;
}
