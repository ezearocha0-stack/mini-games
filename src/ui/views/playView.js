import { ACTIVE_GAMES } from '../../games/registry.js';
import { escapeHtml } from '../escape.js';

let selectedGameId = 'air-hockey';

export function setPlaySelectedGame(gameId) {
  if (ACTIVE_GAMES.some((g) => g.id === gameId)) {
    selectedGameId = gameId;
  }
}

export function renderPlayView(state) {
  const game = ACTIVE_GAMES.find((g) => g.id === selectedGameId) || ACTIVE_GAMES[0];
  const connected = state.room.status === 'connected';

  return `
    <div class="section-heading">
      <div>
        <h2>Lanzador de Partidas</h2>
        <p>Elige juego, modalidad y conecta al instante por código o QR</p>
      </div>
      ${
        connected
          ? `<span class="pill ok">Sala conectada: ${escapeHtml(state.room.code)}</span>`
          : `<span class="pill">Listo para lanzar</span>`
      }
    </div>

    <div class="surface-card">
      <strong style="display:block;margin-bottom:10px;">1. Selecciona el juego</strong>
      <div class="filter-tabs">
        ${ACTIVE_GAMES.map(
          (g) => `
          <button
            type="button"
            class="filter-tab ${g.id === game.id ? 'active' : ''}"
            data-select-play-game="${escapeHtml(g.id)}"
          >
            ${escapeHtml(g.title)}
          </button>`
        ).join('')}
      </div>
      <p style="margin:12px 0 0;color:var(--text-secondary);font-size:0.88rem;">
        ${escapeHtml(game.description)}
      </p>
    </div>

    <div class="games-grid">
      <div class="surface-card">
        <span class="pill accent">Multijugador Crossplay</span>
        <h3 style="margin:10px 0 6px;">${connected ? 'Lanzar en sala actual' : 'Crear sala privada con QR'}</h3>
        <p style="margin:0 0 14px;color:var(--text-secondary);font-size:0.85rem;">
          ${
            connected
              ? `Estás enlazado en la sala ${escapeHtml(state.room.code)}. El juego se abrirá en ambos dispositivos.`
              : 'Genera un código de 5 letras y un código QR para jugar PC ↔ Android o entre dos móviles.'
          }
        </p>
        <button type="button" class="btn btn-primary btn-block" data-direct-play="${escapeHtml(game.id)}:online">
          ${connected ? `Iniciar ${escapeHtml(game.shortTitle)} en Sala` : `Crear Sala para ${escapeHtml(game.shortTitle)}`}
        </button>
      </div>

      ${
        game.supportsAi
          ? `<div class="surface-card">
               <span class="pill">Un Jugador</span>
               <h3 style="margin:10px 0 6px;">Desafío contra IA</h3>
               <p style="margin:0 0 14px;color:var(--text-secondary);font-size:0.85rem;">
                 Entrena sin internet contra la IA táctica adaptada a ${escapeHtml(game.shortTitle)}.
               </p>
               <button type="button" class="btn btn-secondary btn-block" data-direct-play="${escapeHtml(game.id)}:ai">
                 Jugar contra IA
               </button>
             </div>`
          : ''
      }

      ${
        game.supportsLocal
          ? `<div class="surface-card">
               <span class="pill">Pantalla Compartida</span>
               <h3 style="margin:10px 0 6px;">2 Jugadores Locales</h3>
               <p style="margin:0 0 14px;color:var(--text-secondary);font-size:0.85rem;">
                 Multitáctil simultáneo o juego por turnos compartido en el mismo dispositivo.
               </p>
               <button type="button" class="btn btn-subtle btn-block" data-direct-play="${escapeHtml(game.id)}:local">
                 Jugar 2J Local
               </button>
             </div>`
          : ''
      }
    </div>

    <div class="surface-card soft">
      <strong style="display:block;margin-bottom:8px;">¿Tienes un código de invitación?</strong>
      <form class="connect-join" data-form="quick-join-room" autocomplete="off" style="max-width:420px;">
        <input class="code-input" name="code" maxlength="5" placeholder="CÓDIGO" aria-label="Código de sala" />
        <button type="submit" class="btn btn-primary">Unirse a sala</button>
      </form>
    </div>
  `;
}
