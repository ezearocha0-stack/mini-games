import { ACTIVE_GAMES, getGameById } from '../../games/registry.js';
import { escapeHtml, renderAvatarHtml, formatPlaytime, formatRelativeTime } from '../escape.js';

export function renderRankingView(state) {
  const activeTab = state.rankings.game || 'global';
  const rows = state.rankings.leaderboard || [];
  const history = state.rankings.myHistory || [];
  const stats = state.user?.stats || null;

  return `
    <div class="section-heading">
      <div>
        <h2>Ranking y Estadísticas</h2>
        <p>Clasificación ELO validada en el servidor — sin manipulación posible desde el navegador</p>
      </div>
      <button type="button" class="btn btn-subtle btn-compact" data-action="refresh-rankings">↻ Actualizar</button>
    </div>

    ${
      state.user && stats
        ? `<div class="stats-grid-4">
             <div class="stat-tile">
               <span class="stat-value" style="color:var(--accent-primary);">${stats.eloGlobal}</span>
               <span class="stat-label">ELO Global</span>
             </div>
             <div class="stat-tile">
               <span class="stat-value">${stats.wins}V · ${stats.losses}D</span>
               <span class="stat-label">Winrate ${stats.winRate}% (${stats.matchesPlayed} partidas)</span>
             </div>
             <div class="stat-tile">
               <span class="stat-value">🔥 ${stats.currentStreak}</span>
               <span class="stat-label">Racha actual (Mejor: ${stats.bestStreak})</span>
             </div>
             <div class="stat-tile">
               <span class="stat-value">${formatPlaytime(stats.playtimeSeconds)}</span>
               <span class="stat-label">Nivel ${state.user.level} · ${state.user.xp} XP</span>
             </div>
           </div>`
        : `<div class="surface-card soft" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;">
             <div>
               <strong>Modo Invitado</strong>
               <p style="margin:2px 0 0;font-size:0.84rem;color:var(--text-secondary);">Inicia sesión para registrar tus partidas competitivas, subir de ELO y desbloquear insignias.</p>
             </div>
             <button type="button" class="btn btn-primary btn-compact" data-open-auth="register">Crear cuenta</button>
           </div>`
    }

    <div class="filter-tabs" role="tablist">
      <button type="button" class="filter-tab ${activeTab === 'global' ? 'active' : ''}" data-ranking-game="global">
        Ranking Global
      </button>
      ${ACTIVE_GAMES.map(
        (g) => `
        <button type="button" class="filter-tab ${activeTab === g.id ? 'active' : ''}" data-ranking-game="${escapeHtml(g.id)}">
          ${escapeHtml(g.shortTitle)}
        </button>`
      ).join('')}
    </div>

    <div class="surface-card">
      ${
        state.rankings.loading
          ? `<div class="empty-state" style="border:none;"><span>Cargando clasificación…</span></div>`
          : rows.length === 0
            ? `<div class="empty-state" style="border:none;">
                 <span>Todavía no hay jugadores con partidas competitivas registradas en esta categoría. ¡Sé el primero en competir!</span>
               </div>`
            : `<div class="data-table-wrap">
                 <table class="data-table">
                   <thead>
                     <tr>
                       <th>#</th>
                       <th>Jugador</th>
                       <th>Nivel</th>
                       <th>ELO</th>
                       <th>V / D</th>
                       <th>Winrate</th>
                       <th>Mejor Racha</th>
                     </tr>
                   </thead>
                   <tbody>
                     ${rows
                       .map(
                         (r, idx) => `
                       <tr>
                         <td><strong>${idx + 1}</strong></td>
                         <td>
                           <div style="display:flex;align-items:center;gap:8px;">
                             ${renderAvatarHtml({ name: r.username, color: r.avatarColor, icon: r.avatarIcon, size: 'sm' })}
                             <span><strong>${escapeHtml(r.username)}</strong> <span style="color:var(--text-muted);font-size:0.75rem;">#${escapeHtml(r.tag)}</span></span>
                           </div>
                         </td>
                         <td>Nv. ${r.level || 1}</td>
                         <td><strong style="font-family:var(--font-mono);color:var(--accent-primary);">${r.elo}</strong></td>
                         <td>${r.wins} / ${r.losses}</td>
                         <td>${r.winRate}%</td>
                         <td>🔥 ${r.bestStreak || 0}</td>
                       </tr>`
                       )
                       .join('')}
                   </tbody>
                 </table>
               </div>`
      }
    </div>

    ${
      state.user
        ? `<div class="surface-card">
             <h3 style="margin:0 0 12px;font-size:1rem;">Tu Historial Reciente</h3>
             ${
               history.length === 0
                 ? `<div class="empty-state" style="padding:18px;"><span>Aún no tienes partidas competitivas registradas.</span></div>`
                 : `<div class="list-stack">
                      ${history
                        .map((h) => {
                          const g = getGameById(h.gameId);
                          return `
                          <div class="list-row">
                            <div class="list-row-left">
                              <span class="pill ${h.won ? 'ok' : ''}">${h.won ? 'VICTORIA' : h.draw ? 'EMPATE' : 'DERROTA'}</span>
                              <div class="list-row-info">
                                <span class="list-row-title">${escapeHtml(g?.title || h.gameId)} vs ${escapeHtml(h.opponentName || 'Rival')}</span>
                                <span class="list-row-sub">${escapeHtml(h.scoreSummary || '')} · ${escapeHtml(formatRelativeTime(h.playedAt))}</span>
                              </div>
                            </div>
                            <span style="font-family:var(--font-mono);font-weight:700;color:${h.eloDelta >= 0 ? 'var(--status-ok)' : 'var(--status-danger)'};">
                              ${h.eloDelta >= 0 ? `+${h.eloDelta}` : h.eloDelta} ELO
                            </span>
                          </div>`;
                        })
                        .join('')}
                    </div>`
             }
           </div>`
        : ''
    }
  `;
}
