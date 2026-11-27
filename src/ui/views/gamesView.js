import { GAME_DEFINITIONS } from '../../games/registry.js';
import { escapeHtml, renderGameArtSvg } from '../escape.js';

let activeFilter = 'all';
let searchTerm = '';

export function setGamesFilter(filter) {
  activeFilter = filter;
}

export function setGamesSearch(q) {
  searchTerm = q;
}

export function renderGamesView(state) {
  const favorites = new Set(state.favoriteGames || []);
  const q = searchTerm.trim().toLowerCase();

  const filtered = GAME_DEFINITIONS.filter((g) => {
    if (activeFilter === 'active' && g.status !== 'active') return false;
    if (activeFilter === 'realtime' && g.category !== 'realtime' && g.category !== 'physics') return false;
    if (activeFilter === 'turns' && g.category !== 'turns' && g.category !== 'strategy') return false;
    if (activeFilter === 'party' && g.category !== 'party') return false;
    if (activeFilter === 'favorites' && !favorites.has(g.id)) return false;
    if (activeFilter === 'upcoming' && g.status !== 'upcoming') return false;
    if (q && !g.title.toLowerCase().includes(q) && !g.description.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  return `
    <div class="section-heading">
      <div>
        <h2>Catálogo de Juegos</h2>
        <p>8 juegos Crossplay jugables al instante (Online P2P, IA o Local) + 8 expansiones preparadas</p>
      </div>
      <div style="min-width:min(280px,100%);">
        <input
          type="search"
          class="text-input"
          placeholder="Buscar juego..."
          value="${escapeHtml(searchTerm)}"
          data-input="games-search"
          aria-label="Buscar juego"
        />
      </div>
    </div>

    <div class="filter-tabs" role="tablist" aria-label="Filtrar catálogo">
      ${[
        ['all', `Todos (${GAME_DEFINITIONS.length})`],
        ['active', 'Jugables (8)'],
        ['realtime', 'Física y Tiempo Real'],
        ['turns', 'Estrategia y Turnos'],
        ['party', 'Social y Mesa'],
        ['favorites', `Favoritos (${favorites.size})`],
        ['upcoming', 'Próximos (8)']
      ]
        .map(
          ([key, label]) => `
        <button type="button" class="filter-tab ${activeFilter === key ? 'active' : ''}" data-games-filter="${key}">
          ${escapeHtml(label)}
        </button>`
        )
        .join('')}
    </div>

    ${
      filtered.length === 0
        ? `<div class="empty-state">
             <span>No hay juegos que coincidan con el filtro actual.</span>
             <button type="button" class="btn btn-subtle btn-compact" data-games-filter="all">Mostrar todos</button>
           </div>`
        : `<div class="games-grid">
            ${filtered
              .map((g) => {
                const isFav = favorites.has(g.id);
                const isActive = g.status === 'active';
                return `
                  <article class="game-card">
                    <div class="game-artwork">
                      ${renderGameArtSvg(g.id)}
                      <button
                        type="button"
                        class="game-fav-btn ${isFav ? 'active' : ''}"
                        data-toggle-fav="${escapeHtml(g.id)}"
                        aria-label="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}"
                        title="Favorito"
                      >
                        ${isFav ? '★' : '☆'}
                      </button>
                      <span class="game-tempo-tag">${escapeHtml(g.categoryLabel)}</span>
                    </div>
                    <div class="game-body">
                      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <h3 class="game-title">${escapeHtml(g.title)}</h3>
                        ${isActive ? '<span class="pill ok">Disponible</span>' : '<span class="pill">Slot Modular</span>'}
                      </div>
                      <p class="game-desc">${escapeHtml(g.description)}</p>
                      <div class="game-controls-meta">
                        <span>PC: ${escapeHtml(g.controlsPc)}</span>
                        <span>Móvil: ${escapeHtml(g.controlsMobile)}</span>
                      </div>
                      ${
                        isActive
                          ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px;">
                               <button type="button" class="btn btn-primary btn-compact" style="grid-column:1/-1;" data-direct-play="${escapeHtml(g.id)}:online">
                                 Jugar Online P2P
                               </button>
                               ${
                                 g.supportsAi
                                   ? `<button type="button" class="btn btn-secondary btn-compact" data-direct-play="${escapeHtml(g.id)}:ai">vs IA</button>`
                                   : ''
                               }
                               ${
                                 g.supportsLocal
                                   ? `<button type="button" class="btn btn-subtle btn-compact" data-direct-play="${escapeHtml(g.id)}:local">2J Local</button>`
                                   : ''
                               }
                             </div>`
                          : `<button type="button" class="btn btn-subtle btn-block" disabled>
                               Arquitectura preparada
                             </button>`
                      }
                    </div>
                  </article>`;
              })
              .join('')}
          </div>`
    }
  `;
}
