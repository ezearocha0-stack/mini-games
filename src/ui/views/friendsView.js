import { escapeHtml, renderAvatarHtml, formatPresenceLabel } from '../escape.js';

let friendsTab = 'online'; // 'online' | 'all' | 'incoming' | 'outgoing' | 'blocked'
let searchQuery = '';
let searchResults = [];

export function setFriendsTab(tab) {
  friendsTab = tab;
}

export function setFriendSearchState(query, results) {
  searchQuery = query;
  searchResults = Array.isArray(results) ? results : [];
}

export function renderFriendsView(state) {
  if (!state.user) {
    return `
      <div class="section-heading">
        <div>
          <h2>Amigos y Presencia</h2>
          <p>Conecta con otros jugadores, mira qué están jugando e invítalos en 1 clic</p>
        </div>
      </div>
      <div class="surface-card empty-state">
        <strong style="color:var(--text-primary);font-size:1.05rem;">Inicia sesión para desbloquear Amigos</strong>
        <span>El acceso como invitado te permite jugar con QR y enlaces, mientras que una cuenta gratuita habilita lista de amigos, presencia en vivo e invitaciones directas.</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
          <button type="button" class="btn btn-primary" data-open-auth="register">Crear cuenta gratis</button>
          <button type="button" class="btn btn-secondary" data-open-auth="login">Ya tengo cuenta</button>
        </div>
      </div>
    `;
  }

  const { accepted = [], incoming = [], outgoing = [], blocked = [] } = state.friends;
  const onlineList = accepted.filter((f) => f.presence !== 'offline');

  const tabMap = {
    online: onlineList,
    all: accepted,
    incoming,
    outgoing,
    blocked
  };
  const currentRows = tabMap[friendsTab] || accepted;

  return `
    <div class="section-heading">
      <div>
        <h2>Amigos y Presencia</h2>
        <p>Tu estado actual: <strong>${escapeHtml(formatPresenceLabel(state.presenceStatus))}</strong></p>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <label for="sel-presence-status" class="sr-only">Estado de presencia</label>
        <select id="sel-presence-status" class="select-input" style="width:auto;height:36px;" data-action="change-presence">
          <option value="online" ${state.presenceStatus === 'online' ? 'selected' : ''}>🟢 Conectado</option>
          <option value="away" ${state.presenceStatus === 'away' ? 'selected' : ''}>🟡 Ausente</option>
          <option value="busy" ${state.presenceStatus === 'busy' ? 'selected' : ''}>🔴 Ocupado</option>
        </select>
      </div>
    </div>

    <div class="surface-card">
      <h3 style="margin:0 0 10px;font-size:0.98rem;">Buscar jugadores</h3>
      <form class="connect-join" data-form="search-users" style="margin-bottom:${searchResults.length ? '12px' : '0'};">
        <input
          class="text-input"
          name="q"
          value="${escapeHtml(searchQuery)}"
          placeholder="Buscar por nombre o #TAG (ej. Alex o MG-1234)"
          aria-label="Buscar usuarios"
        />
        <button type="submit" class="btn btn-primary">Buscar</button>
      </form>

      ${
        searchQuery && searchResults.length === 0
          ? `<p style="margin:10px 0 0;font-size:0.84rem;color:var(--text-muted);">No se encontraron usuarios para "${escapeHtml(searchQuery)}".</p>`
          : searchResults.length > 0
            ? `<div class="list-stack">
                 ${searchResults
                   .map(
                     (u) => `
                   <div class="list-row">
                     <div class="list-row-left">
                       ${renderAvatarHtml({ name: u.username, color: u.avatarColor, icon: u.avatarIcon, size: 'sm' })}
                       <div class="list-row-info">
                         <span class="list-row-title">${escapeHtml(u.username)} <span class="pill">#${escapeHtml(u.tag)}</span></span>
                         <span class="list-row-sub">Nivel ${u.level || 1} · ID ${escapeHtml(u.publicId)}</span>
                       </div>
                     </div>
                     <div class="list-row-actions">
                       ${
                         u.relation === 'friend'
                           ? '<span class="pill ok">Amigo</span>'
                           : u.relation === 'outgoing'
                             ? '<span class="pill warn">Enviada</span>'
                             : `<button type="button" class="btn btn-primary btn-compact" data-friend-add="${escapeHtml(u.id)}">Añadir</button>`
                       }
                     </div>
                   </div>`
                   )
                   .join('')}
               </div>`
            : ''
      }
    </div>

    <div class="filter-tabs" role="tablist">
      ${[
        ['online', `Conectados (${onlineList.length})`],
        ['all', `Todos (${accepted.length})`],
        ['incoming', `Solicitudes (${incoming.length})`],
        ['outgoing', `Enviadas (${outgoing.length})`],
        ['blocked', `Bloqueados (${blocked.length})`]
      ]
        .map(
          ([k, label]) => `
        <button type="button" class="filter-tab ${friendsTab === k ? 'active' : ''}" data-friends-tab="${k}">
          ${escapeHtml(label)}
        </button>`
        )
        .join('')}
    </div>

    <div class="surface-card">
      ${
        currentRows.length === 0
          ? `<div class="empty-state">
               <span>No hay elementos en esta sección.</span>
             </div>`
          : `<div class="list-stack">
               ${currentRows
                 .map((item) => {
                   if (friendsTab === 'incoming') {
                     return `
                       <div class="list-row">
                         <div class="list-row-left">
                           ${renderAvatarHtml({ name: item.username, color: item.avatarColor, icon: item.avatarIcon, size: 'sm' })}
                           <div class="list-row-info">
                             <span class="list-row-title">${escapeHtml(item.username)} #${escapeHtml(item.tag)}</span>
                             <span class="list-row-sub">Solicitud recibida</span>
                           </div>
                         </div>
                         <div class="list-row-actions">
                           <button type="button" class="btn btn-ok btn-compact" data-friend-respond="${escapeHtml(item.requestId)}:accept">Aceptar</button>
                           <button type="button" class="btn btn-danger-ghost btn-compact" data-friend-respond="${escapeHtml(item.requestId)}:reject">Rechazar</button>
                         </div>
                       </div>`;
                   }
                   if (friendsTab === 'outgoing') {
                     return `
                       <div class="list-row">
                         <div class="list-row-left">
                           ${renderAvatarHtml({ name: item.username, color: item.avatarColor, icon: item.avatarIcon, size: 'sm' })}
                           <div class="list-row-info">
                             <span class="list-row-title">${escapeHtml(item.username)} #${escapeHtml(item.tag)}</span>
                             <span class="list-row-sub">Pendiente de respuesta</span>
                           </div>
                         </div>
                         <button type="button" class="btn btn-subtle btn-compact" data-friend-respond="${escapeHtml(item.requestId)}:cancel">Cancelar</button>
                       </div>`;
                   }
                   if (friendsTab === 'blocked') {
                     return `
                       <div class="list-row">
                         <div class="list-row-left">
                           ${renderAvatarHtml({ name: item.username, color: item.avatarColor, icon: item.avatarIcon, size: 'sm' })}
                           <div class="list-row-info">
                             <span class="list-row-title">${escapeHtml(item.username)} #${escapeHtml(item.tag)}</span>
                             <span class="list-row-sub">Usuario bloqueado</span>
                           </div>
                         </div>
                         <button type="button" class="btn btn-secondary btn-compact" data-unblock-user="${escapeHtml(item.id)}">Desbloquear</button>
                       </div>`;
                   }
                   return `
                     <div class="list-row">
                       <div class="list-row-left">
                         ${renderAvatarHtml({
                           name: item.username,
                           color: item.avatarColor,
                           icon: item.avatarIcon,
                           presence: item.presence || 'offline',
                           size: 'sm'
                         })}
                         <div class="list-row-info">
                           <span class="list-row-title">${escapeHtml(item.username)} <span style="color:var(--text-muted);font-weight:500;">#${escapeHtml(item.tag)}</span></span>
                           <span class="list-row-sub">${escapeHtml(formatPresenceLabel(item.presence, item.activity))}</span>
                         </div>
                       </div>
                       <div class="list-row-actions">
                         <button type="button" class="btn btn-accent-soft btn-compact" data-invite-friend="${escapeHtml(item.id)}">Invitar</button>
                         <button type="button" class="btn btn-secondary btn-compact" data-dm-friend="${escapeHtml(item.id)}">Chat</button>
                         <button type="button" class="btn btn-subtle btn-compact" data-friend-remove="${escapeHtml(item.id)}" title="Eliminar amigo">✕</button>
                         <button type="button" class="btn btn-danger-ghost btn-compact" data-block-user="${escapeHtml(item.id)}" title="Bloquear">🚫</button>
                       </div>
                     </div>`;
                 })
                 .join('')}
             </div>`
      }
    </div>
  `;
}
