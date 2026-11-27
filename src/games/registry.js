import { createAirHockeyGame } from './airHockey.js';
import { createConnectFourGame } from './connectFour.js';
import { createTicTacToeGame } from './ticTacToe.js';

// Modular Game Registry: active playable games + architectural extension slots for upcoming titles
export const GAME_DEFINITIONS = [
  {
    id: 'air-hockey',
    title: 'Neo Air Hockey',
    shortTitle: 'Air Hockey',
    category: 'realtime',
    categoryLabel: '60 FPS · Tiempo real',
    status: 'active',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: true,
    controlsPc: 'Ratón o WASD / Flechas',
    controlsMobile: 'Arrastre táctil + háptica',
    description:
      'Duelo físico a 7 goles con perspectiva simétrica: tú siempre defiendes tu portería inferior en PC o Android.',
    create: createAirHockeyGame
  },
  {
    id: 'connect-four',
    title: 'Conecta 4 Táctico',
    shortTitle: 'Conecta 4',
    category: 'turns',
    categoryLabel: 'Estrategia · 7×6',
    status: 'active',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: true,
    controlsPc: 'Clic o teclas 1–7 / Flechas',
    controlsMobile: 'Toque por columna',
    description:
      'Alinea cuatro fichas verticales, horizontales o diagonales antes que tu rival. Caída con rebote e IA Minimax.',
    create: createConnectFourGame
  },
  {
    id: 'tic-tac-toe',
    title: 'Tres en Raya Infinito',
    shortTitle: 'Tres en Raya',
    category: 'turns',
    categoryLabel: 'Sin empates · 3 Piezas',
    status: 'active',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: true,
    controlsPc: 'Clic o teclas 1–9',
    controlsMobile: 'Toque directo',
    description:
      'Incluye Modo Infinito (máximo 3 marcas activas: al poner la 4.ª desaparece la más antigua) y Modo Clásico.',
    create: createTicTacToeGame
  },
  // Prepared modular slots for future platform expansions (never simulated as playable)
  {
    id: 'eight-ball',
    title: 'Billar 8-Ball',
    shortTitle: 'Billar 8-Ball',
    category: 'realtime',
    categoryLabel: 'Física 2D · Próximamente',
    status: 'upcoming',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: false,
    supportsLocal: true,
    supportsOnline: true,
    ranked: false,
    controlsPc: 'Ratón para apuntar y potencia',
    controlsMobile: 'Arrastre táctil de taco',
    description: 'Arquitectura modular preparada para incorporar billar 8-Ball con física de colisiones elásticas.'
  },
  {
    id: 'mini-golf',
    title: 'Mini Golf Crossplay',
    shortTitle: 'Mini Golf',
    category: 'realtime',
    categoryLabel: 'Precisión · Próximamente',
    status: 'upcoming',
    minPlayers: 2,
    maxPlayers: 4,
    supportsAi: false,
    supportsLocal: true,
    supportsOnline: true,
    ranked: false,
    controlsPc: 'Ratón o toque',
    controlsMobile: 'Honda táctil',
    description: 'Slot preparado para circuitos multijugador por turnos simultáneos de hasta 4 jugadores.'
  },
  {
    id: 'battleship',
    title: 'Batalla Naval',
    shortTitle: 'Batalla Naval',
    category: 'turns',
    categoryLabel: 'Estrategia · Próximamente',
    status: 'upcoming',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: true,
    supportsLocal: false,
    supportsOnline: true,
    ranked: false,
    controlsPc: 'Tablero táctico',
    controlsMobile: 'Toque por coordenadas',
    description: 'Slot preparado para duelos navales con estado oculto validado en sala.'
  },
  {
    id: 'draw-guess',
    title: 'Dibuja y Adivina',
    shortTitle: 'Dibuja y Adivina',
    category: 'party',
    categoryLabel: 'Social · Próximamente',
    status: 'upcoming',
    minPlayers: 2,
    maxPlayers: 4,
    supportsAi: false,
    supportsLocal: false,
    supportsOnline: true,
    ranked: false,
    controlsPc: 'Canvas + Chat',
    controlsMobile: 'Trazo táctil + Chat',
    description: 'Slot preparado para dibujo en tiempo real integrado con el chat de sala.'
  }
];

export const ACTIVE_GAMES = GAME_DEFINITIONS.filter((g) => g.status === 'active');

export const GAME_MAP = Object.fromEntries(GAME_DEFINITIONS.map((g) => [g.id, g]));

export function getGameById(gameId) {
  return GAME_MAP[gameId] || null;
}

export function isPlayableGame(gameId) {
  return Boolean(GAME_MAP[gameId] && GAME_MAP[gameId].status === 'active');
}
