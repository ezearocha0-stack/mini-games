import { ACTIVE_GAMES, getGameById } from '../../games/registry.js';
import { escapeHtml, renderAvatarHtml } from '../escape.js';

export function renderRoomsView(state, { renderVoiceBarHtml }) {
  const room = state.room;
  const inRoom = room.status !== 'idle' && room.code;
  const isHost = room.role === 'host';
  const myId = state.user?.id || state.guest.guestId;

  if (inRoom) {
    const selectedGame = getGameById(room.gameId);
    const members = room.members || [];
    const friendsToInvite = (state.friends.accepted || []).filter((f) => f.presence !== 'offline');

    return `
      <div class="section-heading">
        <div>
          <h2>Sala ${escapeHtml(room.code)} · ${room.visibility === 'public' ? 'Pública' : 'Privada'}</h2>
          <p>${escapeHtml(room.title || 'Sala Crossplay P2P')} · ${room.rttMs !== null ? `${room.rttMs} ms` : 'Enlazando'}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary btn-compact" data-action="open-invite-modal">Código / QR</button>
          <button type="button" class="btn btn-danger-ghost btn-compact" data-action="leave-room">Abandonar sala</button>
        </div>
      </div>

      ${renderVoiceBarHtml()}

      <div class="settings-grid">
        <div class="surface-card">
          <div class="section-heading" style="margin-bottom:12px;">
            <h3 style="margin:0;font-size:1rem;">Participantes (${members.length}/${room.maxMembers || 2})</h3>
            <span class="pill ${room.status === 'connected' ? 'ok' : 'warn'}">${escapeHtml(room.status)}</span>
          </div>

          <div class="list-stack">
            ${
              members.length === 0
                ? `<div class="empty-state" style="padding:16px;"><span>Esperando sincronización de miembros…</span></div>`
                : members
                    .map((m) => {
                      const isMe = m.clientId === myId || m.userId === myId;
                      return `
                      <div class="list-row">
                        <div class="list-row-left">
                          ${renderAvatarHtml({
                            name: m.name,
                            color: m.avatarColor || '#f58229',
                            icon: m.avatarIcon || '🎮',
                            presence: m.afk ? 'away' : 'online',
                            size: 'sm'
                          })}
                          <div class="list-row-info">
                            <span class="list-row-title">
                              ${escapeHtml(m.name)} ${isMe ? '(Tú)' : ''}
                              ${m.role === 'host' ? ' · 👑 Anfitrión' : m.role === 'spectator' ? ' · 👁️ Espectador' : ''}
                            </span>
                            <span class="list-row-sub">
                              ${escapeHtml(m.device || 'Web')} · ${m.ready ? '✅ Listo' : '⏳ Esperando'}${m.afk ? ' · AFK' : ''}
                            </span>
                          </div>
                        </div>
                        <div class="list-row-actions">
                          ${
                            isHost && !isMe
                              ? `<button type="button" class="btn btn-subtle btn-compact" data-room-transfer="${escapeHtml(m.clientId)}" title="Ceder anfitrión">👑</button>
                                 <button type="button" class="btn btn-danger-ghost btn-compact" data-room-kick="${escapeHtml(m.clientId)}" title="Expulsar">✕</button>`
                              : ''
                          }
                        </div>
                      </div>`;
                    })
                    .join('')
            }
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">
            <button type="button" class="btn btn-ok btn-compact" data-action="toggle-ready">
              Alternar Listo
            </button>
            ${
              room.allowSpectators && !isHost
                ? `<button type="button" class="btn btn-subtle btn-compact" data-action="switch-spectator-role">
                     ${room.role === 'spectator' ? 'Pasar a Jugador' : 'Modo Espectador'}
                   </button>`
                : ''
            }
          </div>
        </div>

        <div class="surface-card">
          <h3 style="margin:0 0 12px;font-size:1rem;">Configuración e Inicio de Partida</h3>

          <div class="form-stack">
            <div>
              <label class="field-label" for="room-cfg-game">Juego de la sala</label>
              <select id="room-cfg-game" class="select-input" data-room-config="gameId" ${isHost ? '' : 'disabled'}>
                ${ACTIVE_GAMES.map(
                  (g) => `<option value="${escapeHtml(g.id)}" ${room.gameId === g.id ? 'selected' : ''}>${escapeHtml(g.title)}</option>`
                ).join('')}
              </select>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div>
                <label class="field-label" for="room-cfg-vis">Visibilidad</label>
                <select id="room-cfg-vis" class="select-input" data-room-config="visibility" ${isHost ? '' : 'disabled'}>
                  <option value="private" ${room.visibility === 'private' ? 'selected' : ''}>Privada</option>
                  <option value="public" ${room.visibility === 'public' ? 'selected' : ''}>Pública</option>
                </select>
              </div>
              <div>
                <label class="field-label" for="room-cfg-cap">Capacidad</label>
                <select id="room-cfg-cap" class="select-input" data-room-config="maxMembers" ${isHost ? '' : 'disabled'}>
                  <option value="2" ${Number(room.maxMembers) === 2 ? 'selected' : ''}>2 (1v1)</option>
                  <option value="4" ${Number(room.maxMembers) === 4 ? 'selected' : ''}>4 (Con espectadores)</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              class="btn btn-primary btn-block"
              data-direct-play="${escapeHtml(selectedGame?.id || 'air-hockey')}:online"
              ${isHost && room.status === 'connected' ? '' : 'disabled'}
            >
              ${
                room.status !== 'connected'
                  ? 'Esperando al menos 2 jugadores…'
                  : isHost
                    ? `Iniciar ${escapeHtml(selectedGame?.shortTitle || 'Partida')}`
                    : 'Esperando a que el anfitrión inicie…'
              }
            </button>
          </div>

          ${
            friendsToInvite.length > 0
              ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--hairline);">
                   <strong style="font-size:0.84rem;display:block;margin-bottom:8px;">Invitar amigos conectados</strong>
                   <div class="list-stack">
                     ${friendsToInvite
                       .slice(0, 4)
                       .map(
                         (f) => `
                       <div class="list-row">
                         <span class="list-row-title">${escapeHtml(f.username)}</span>
                         <button type="button" class="btn btn-accent-soft btn-compact" data-invite-friend="${escapeHtml(f.id)}">Invitar</button>
                       </div>`
                       )
                       .join('')}
                   </div>
                 </div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  return `
    <div class="section-heading">
      <div>
        <h2>Salas Multijugador</h2>
        <p>Crea una sala pública o privada con reglas personalizadas o únete con un código</p>
      </div>
      <button type="button" class="btn btn-subtle btn-compact" data-action="refresh-public-rooms">↻ Actualizar</button>
    </div>

    <div class="settings-grid">
      <div class="surface-card">
        <h3 style="margin:0 0 12px;font-size:1.05rem;">Crear nueva sala</h3>
        <form class="form-stack" data-form="create-advanced-room">
          <div>
            <label class="field-label" for="create-room-title">Nombre de sala</label>
            <input id="create-room-title" name="title" class="text-input" maxlength="32" placeholder="Ej. Duelo Crossplay" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <label class="field-label" for="create-room-vis">Tipo</label>
              <select id="create-room-vis" name="visibility" class="select-input">
                <option value="private">Privada (Código/QR)</option>
                <option value="public">Pública (Listado)</option>
              </select>
            </div>
            <div>
              <label class="field-label" for="create-room-game">Juego inicial</label>
              <select id="create-room-game" name="gameId" class="select-input">
                ${ACTIVE_GAMES.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.shortTitle)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <label class="field-label" for="create-room-cap">Capacidad</label>
              <select id="create-room-cap" name="maxMembers" class="select-input">
                <option value="2">2 participantes</option>
                <option value="4">4 (con espectadores)</option>
              </select>
            </div>
            <div style="display:flex;align-items:flex-end;">
              <label style="display:flex;align-items:center;gap:8px;height:44px;font-size:0.84rem;cursor:pointer;">
                <input type="checkbox" name="allowSpectators" checked /> Permitir espectadores
              </label>
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Crear Sala y Generar QR</button>
        </form>
      </div>

      <div class="surface-card">
        <h3 style="margin:0 0 12px;font-size:1.05rem;">Unirse por código</h3>
        <form class="connect-join" data-form="quick-join-room" autocomplete="off" style="margin-bottom:16px;">
          <input class="code-input" name="code" maxlength="5" placeholder="CÓDIGO" aria-label="Código de sala" />
          <button type="submit" class="btn btn-secondary">Entrar</button>
        </form>

        <h4 style="margin:0 0 8px;font-size:0.9rem;color:var(--text-secondary);">Salas públicas activas (${state.publicRooms.length})</h4>
        ${
          state.publicRooms.length === 0
            ? `<div class="empty-state" style="padding:18px;">
                 <span>No hay salas públicas disponibles en este momento.</span>
               </div>`
            : `<div class="list-stack">
                 ${state.publicRooms
                   .map(
                     (r) => `
                   <div class="list-row">
                     <div class="list-row-left">
                       <span class="pill accent">${escapeHtml(r.code)}</span>
                       <div class="list-row-info">
                         <span class="list-row-title">${escapeHtml(r.title || 'Sala pública')}</span>
                         <span class="list-row-sub">${escapeHtml(r.gameTitle || 'Libre')} · Anfitrión: ${escapeHtml(r.hostName || 'Jugador')} · ${r.memberCount}/${r.maxMembers}</span>
                       </div>
                     </div>
                     <button type="button" class="btn btn-primary btn-compact" data-join-code="${escapeHtml(r.code)}">Entrar</button>
                   </div>`
                   )
                   .join('')}
               </div>`
        }
      </div>
    </div>
  `;
}
