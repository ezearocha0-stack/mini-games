import { ACTIVE_GAMES } from '../../games/registry.js';
import {
  AVATAR_ICONS,
  AVATAR_PALETTE,
  escapeHtml,
  renderAvatarHtml,
  formatPresenceLabel,
  formatPlaytime
} from '../escape.js';

export function renderProfileView(state, actions) {
  const identity = actions.getIdentity();
  const isGuest = !state.user;
  const user = state.user;
  const stats = user?.stats || {
    eloGlobal: 1000,
    wins: 0,
    losses: 0,
    winRate: 0,
    matchesPlayed: 0,
    currentStreak: 0,
    bestStreak: 0,
    playtimeSeconds: 0
  };
  const badges = user?.badges || [];
  const favSet = new Set(state.favoriteGames || []);

  return `
    <div class="section-heading">
      <div>
        <h2>Tu Perfil de Jugador</h2>
        <p>${isGuest ? 'Perfil local de invitado (tu ID permanente se asigna al crear cuenta)' : 'Perfil público visible para tus rivales y amigos'}</p>
      </div>
      ${
        isGuest
          ? '<button type="button" class="btn btn-primary btn-compact" data-open-auth="register">Convertir a Cuenta Permanente</button>'
          : '<button type="button" class="btn btn-subtle btn-compact" data-action="copy-public-id">Copiar ID</button>'
      }
    </div>

    <div class="surface-card" style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:16px;min-width:0;">
        ${renderAvatarHtml({
          name: identity.name,
          color: identity.avatarColor,
          icon: identity.avatarIcon,
          presence: isGuest ? 'online' : state.presenceStatus,
          size: 'lg'
        })}
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-size:1.28rem;">${escapeHtml(identity.name)}</strong>
            <span class="pill accent">${isGuest ? 'INVITADO' : `#${escapeHtml(identity.tag)}`}</span>
            ${user?.emailVerified ? '<span class="pill ok">✓ Verificado</span>' : ''}
          </div>
          <div style="margin-top:4px;font-family:var(--font-mono);font-size:0.76rem;color:var(--text-muted);">
            ID Permanente: <strong>${escapeHtml(identity.publicId)}</strong> · Estado: ${escapeHtml(formatPresenceLabel(isGuest ? 'online' : state.presenceStatus))}
          </div>
          ${user?.bio ? `<p style="margin:6px 0 0;font-size:0.88rem;color:var(--text-secondary);">${escapeHtml(user.bio)}</p>` : ''}
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span class="pill">Nivel ${identity.level}</span>
        <span class="pill">${user?.xp || 0} XP</span>
      </div>
    </div>

    <div class="stats-grid-4">
      <div class="stat-tile"><span class="stat-value">${stats.wins}</span><span class="stat-label">Victorias</span></div>
      <div class="stat-tile"><span class="stat-value">${stats.losses}</span><span class="stat-label">Derrotas</span></div>
      <div class="stat-tile"><span class="stat-value">${stats.winRate}%</span><span class="stat-label">% Victoria</span></div>
      <div class="stat-tile"><span class="stat-value">${stats.matchesPlayed} · ${formatPlaytime(stats.playtimeSeconds)}</span><span class="stat-label">Partidas y Tiempo</span></div>
    </div>

    <div class="settings-grid">
      <div class="surface-card">
        <h3 style="margin:0 0 12px;font-size:1rem;">Personalizar Perfil y Cosméticos</h3>
        <form class="form-stack" data-form="update-profile">
          <div>
            <label class="field-label" for="prof-username">Nombre de usuario</label>
            <input id="prof-username" name="username" class="text-input" maxlength="16" value="${escapeHtml(identity.name)}" required />
          </div>

          <div>
            <span class="field-label">Color de avatar</span>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${AVATAR_PALETTE.map(
                (c) => `
                <label style="cursor:pointer;">
                  <input type="radio" name="avatarColor" value="${c}" ${identity.avatarColor === c ? 'checked' : ''} class="sr-only" />
                  <span style="display:inline-block;width:30px;height:30px;border-radius:10px;background:${c};border:3px solid ${identity.avatarColor === c ? 'var(--text-primary)' : 'transparent'};"></span>
                </label>`
              ).join('')}
            </div>
          </div>

          <div>
            <span class="field-label">Emblema de avatar</span>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${AVATAR_ICONS.map(
                (ic) => `
                <label style="cursor:pointer;">
                  <input type="radio" name="avatarIcon" value="${escapeHtml(ic)}" ${identity.avatarIcon === ic ? 'checked' : ''} class="sr-only" />
                  <span class="icon-btn" style="border-color:${identity.avatarIcon === ic ? 'var(--accent-primary)' : 'var(--hairline)'};background:${identity.avatarIcon === ic ? 'var(--accent-primary-soft)' : 'var(--bg-surface-2)'};">
                    ${escapeHtml(ic)}
                  </span>
                </label>`
              ).join('')}
            </div>
          </div>

          ${
            !isGuest
              ? `<div>
                   <label class="field-label" for="prof-bio">Descripción</label>
                   <textarea id="prof-bio" name="bio" class="textarea-input" maxlength="160" placeholder="Cuéntale a tus rivales qué juegos dominas...">${escapeHtml(user?.bio || '')}</textarea>
                 </div>`
              : ''
          }

          <div>
            <span class="field-label">Juegos favoritos</span>
            <div class="filter-tabs">
              ${ACTIVE_GAMES.map(
                (g) => `
                <button type="button" class="filter-tab ${favSet.has(g.id) ? 'active' : ''}" data-toggle-fav="${escapeHtml(g.id)}">
                  ${favSet.has(g.id) ? '★' : '☆'} ${escapeHtml(g.shortTitle)}
                </button>`
              ).join('')}
            </div>
          </div>

          <button type="submit" class="btn btn-primary">Guardar cambios</button>
        </form>
      </div>

      <div class="surface-card">
        <h3 style="margin:0 0 12px;font-size:1rem;">Insignias Desbloqueadas (${badges.filter((b) => b.unlocked).length}/${badges.length || 8})</h3>
        ${
          badges.length === 0
            ? `<div class="empty-state" style="padding:18px;">
                 <span>Las insignias competitivas se desbloquean automáticamente al competir con una cuenta verificada.</span>
               </div>`
            : `<div class="list-stack">
                 ${badges
                   .map(
                     (b) => `
                   <div class="list-row" style="opacity:${b.unlocked ? 1 : 0.5};">
                     <div class="list-row-left">
                       <span style="font-size:1.35rem;">${escapeHtml(b.icon || '🏅')}</span>
                       <div class="list-row-info">
                         <span class="list-row-title">${escapeHtml(b.name)}</span>
                         <span class="list-row-sub">${escapeHtml(b.description)}</span>
                       </div>
                     </div>
                     <span class="pill ${b.unlocked ? 'ok' : ''}">${b.unlocked ? 'Obtenida' : 'Bloqueada'}</span>
                   </div>`
                   )
                   .join('')}
               </div>`
        }
      </div>
    </div>
  `;
}
