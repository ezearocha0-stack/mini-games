import { ACTIVE_GAMES } from '../../games/registry.js';
import { escapeHtml, renderAvatarHtml, renderGameArtSvg, formatPresenceLabel } from '../escape.js';

export function renderHomeView(state, actions) {
  const identity = actions.getIdentity();
  const isGuest = !state.user;
  const userStats = state.user?.stats || null;
  const onlineFriends = (state.friends.accepted || []).filter((f) => f.presence !== 'offline');
  const roomActive = state.room.status !== 'idle';

  const xp = state.user?.xp || 0;
  const level = state.user?.level || 1;
  const nextLevelXp = Math.pow(level, 2) * 100;
  const prevLevelXp = Math.pow(level - 1, 2) * 100;
  const pct = Math.max(0, Math.min(100, Math.round(((xp - prevLevelXp) / Math.max(1, nextLevelXp - prevLevelXp)) * 100)));

  return `
    <div class="hero-banner">
      <div>
        <span class="pill accent">PC ↔ ANDROID CROSSPLAY P2P</span>
        <h2 class="hero-title">Juega al instante, compite con amigos y conecta por voz.</h2>
        <p class="hero-subtitle">
          Salas directas P2P con código de 5 letras y QR sin registro obligatorio, o inicia sesión para guardar tu ELO, amigos, chat persistente y progreso.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">
          <button type="button" class="btn btn-primary" data-nav="jugar">Jugar ahora</button>
          <button type="button" class="btn btn-secondary" data-nav="salas">${roomActive ? `Ir a sala ${escapeHtml(state.room.code || '')}` : 'Explorar salas'}</button>
          ${isGuest ? '<button type="button" class="btn btn-subtle" data-open-auth="register">Crear cuenta / Entrar</button>' : ''}
        </div>
      </div>

      <div class="connect-panel">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <strong style="font-size:0.9rem;">Conexión P2P Express</strong>
          <span class="pill ${roomActive ? 'ok' : ''}">${roomActive ? `Sala ${escapeHtml(state.room.code || 'ACTIVA')}` : 'Sin sala'}</span>
        </div>
        <button type="button" class="btn btn-primary btn-block" data-action="quick-create-room">
          + Crear Sala P2P con QR
        </button>
        <form class="connect-join" data-form="quick-join-room" autocomplete="off">
          <input class="code-input" name="code" maxlength="5" placeholder="CÓDIGO" aria-label="Código de sala" />
          <button class="btn btn-secondary" type="submit">Entrar</button>
        </form>
        <span style="font-size:0.75rem;color:var(--text-muted);text-align:center;">
          Comparte el QR para unir otro PC o Android en segundos
        </span>
      </div>
    </div>

    <div class="surface-card" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;">
      <div style="display:flex;align-items:center;gap:12px;min-width:0;">
        ${renderAvatarHtml({
          name: identity.name,
          color: identity.avatarColor,
          icon: identity.avatarIcon,
          presence: state.user ? state.presenceStatus : 'online',
          size: 'lg'
        })}
        <div style="min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-size:1.05rem;">${escapeHtml(identity.name)}</strong>
            <span class="pill">${isGuest ? 'Modo Invitado' : `Nivel ${level} · #${escapeHtml(identity.tag)}`}</span>
          </div>
          <p style="margin:3px 0 0;font-size:0.82rem;color:var(--text-secondary);">
            ${
              isGuest
                ? 'Puedes jugar todas las partidas P2P gratis. Regístrate para desbloquear ELO, amigos, historial y chat.'
                : `${xp} XP · ${userStats?.wins || 0}V / ${userStats?.losses || 0}D · ELO Global ${userStats?.eloGlobal || 1000}`
            }
          </p>
          ${
            !isGuest
              ? `<div style="margin-top:6px;width:min(260px,65vw);height:6px;border-radius:999px;background:var(--bg-well);overflow:hidden;">
                   <div style="width:${pct}%;height:100%;background:var(--accent-primary);"></div>
                 </div>`
              : ''
          }
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn btn-subtle btn-compact" data-nav="perfil">Ver Perfil</button>
        ${
          isGuest
            ? '<button type="button" class="btn btn-primary btn-compact" data-open-auth="register">Guardar progreso</button>'
            : '<button type="button" class="btn btn-subtle btn-compact" data-nav="ranking">Mi Ranking</button>'
        }
      </div>
    </div>

    <div class="section-heading">
      <div>
        <h2>Juegos listos para jugar</h2>
        <p>Motores originales conservados al 100% con Crossplay PC ↔ Android</p>
      </div>
      <button type="button" class="btn btn-subtle btn-compact" data-nav="juegos">Ver catálogo completo →</button>
    </div>

    <div class="games-grid">
      ${ACTIVE_GAMES.map(
        (g) => `
        <article class="game-card">
          <div class="game-artwork">
            ${renderGameArtSvg(g.id)}
            <span class="game-tempo-tag">${escapeHtml(g.categoryLabel)}</span>
          </div>
          <div class="game-body">
            <h3 class="game-title">${escapeHtml(g.title)}</h3>
            <p class="game-desc">${escapeHtml(g.description)}</p>
            <div class="game-controls-meta">
              <span>PC: ${escapeHtml(g.controlsPc)}</span>
              <span>Móvil: ${escapeHtml(g.controlsMobile)}</span>
            </div>
            <button type="button" class="btn btn-primary btn-block" data-launch-modal="${escapeHtml(g.id)}">
              Jugar ${escapeHtml(g.shortTitle)}
            </button>
          </div>
        </article>
      `
      ).join('')}
    </div>

    <div class="settings-grid">
      <div class="surface-card">
        <div class="section-heading" style="margin-bottom:10px;">
          <h3 style="margin:0;font-size:1rem;">Amigos conectados (${onlineFriends.length})</h3>
          <button type="button" class="btn btn-subtle btn-compact" data-nav="amigos">Abrir Amigos</button>
        </div>
        ${
          !state.user
            ? `<div class="empty-state" style="padding:18px;">
                 <span>Inicia sesión para añadir amigos y ver quién está jugando en tiempo real.</span>
                 <button type="button" class="btn btn-primary btn-compact" data-open-auth="login">Iniciar sesión</button>
               </div>`
            : onlineFriends.length === 0
              ? `<div class="empty-state" style="padding:18px;">
                   <span>Ningún amigo conectado en este momento.</span>
                   <button type="button" class="btn btn-subtle btn-compact" data-nav="amigos">Buscar jugadores</button>
                 </div>`
              : `<div class="list-stack">
                   ${onlineFriends
                     .slice(0, 4)
                     .map(
                       (f) => `
                     <div class="list-row">
                       <div class="list-row-left">
                         ${renderAvatarHtml({ name: f.username, color: f.avatarColor, icon: f.avatarIcon, presence: f.presence, size: 'sm' })}
                         <div class="list-row-info">
                           <span class="list-row-title">${escapeHtml(f.username)}</span>
                           <span class="list-row-sub">${escapeHtml(formatPresenceLabel(f.presence, f.activity))}</span>
                         </div>
                       </div>
                       <button type="button" class="btn btn-accent-soft btn-compact" data-invite-friend="${escapeHtml(f.id)}">Invitar</button>
                     </div>`
                     )
                     .join('')}
                 </div>`
        }
      </div>

      <div class="surface-card">
        <div class="section-heading" style="margin-bottom:10px;">
          <h3 style="margin:0;font-size:1rem;">Salas públicas activas (${state.publicRooms.length})</h3>
          <button type="button" class="btn btn-subtle btn-compact" data-nav="salas">Ver Salas</button>
        </div>
        ${
          state.publicRooms.length === 0
            ? `<div class="empty-state" style="padding:18px;">
                 <span>No hay salas públicas abiertas ahora mismo. ¡Crea una en un toque!</span>
                 <button type="button" class="btn btn-primary btn-compact" data-nav="salas">Crear Sala Pública</button>
               </div>`
            : `<div class="list-stack">
                 ${state.publicRooms
                   .slice(0, 4)
                   .map(
                     (r) => `
                   <div class="list-row">
                     <div class="list-row-left">
                       <span class="pill accent">${escapeHtml(r.code)}</span>
                       <div class="list-row-info">
                         <span class="list-row-title">${escapeHtml(r.title || 'Sala Crossplay')}</span>
                         <span class="list-row-sub">${escapeHtml(r.gameTitle || 'Libre')} · ${r.memberCount}/${r.maxMembers}</span>
                       </div>
                     </div>
                     <button type="button" class="btn btn-secondary btn-compact" data-join-code="${escapeHtml(r.code)}">Unirse</button>
                   </div>`
                   )
                   .join('')}
               </div>`
        }
      </div>
    </div>
  `;
}
