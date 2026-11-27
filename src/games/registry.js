import { createAirHockeyGame } from './airHockey.js';
import { createConnectFourGame } from './connectFour.js';
import { createTicTacToeGame } from './ticTacToe.js';
import { createEightBallGame } from './eightBall.js';
import { createMiniGolfGame } from './miniGolf.js';
import { createBattleshipGame } from './battleship.js';
import { createDrawGuessGame } from './drawGuess.js';
import { createChessGame } from './chess.js';

// Modular Game Registry: 8 full playable Crossplay games + 8 extensible future slots
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
  {
    id: 'eight-ball',
    title: 'Billar 8-Ball',
    shortTitle: 'Billar 8-Ball',
    category: 'physics',
    categoryLabel: 'Física 2D · Tacos y Efecto',
    status: 'active',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: true,
    controlsPc: 'Ratón para apuntar + potencia',
    controlsMobile: 'Taco táctil + pad de efecto',
    description:
      '16 bolas con física elástica, efectos laterales y retroceso, faltas con bola en mano y reglas completas Lisas vs Rayadas.',
    create: createEightBallGame
  },
  {
    id: 'mini-golf',
    title: 'Mini Golf Crossplay',
    shortTitle: 'Mini Golf',
    category: 'physics',
    categoryLabel: '6 Hoyos · Obstáculos',
    status: 'active',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: true,
    controlsPc: 'Arrastre o barra de potencia',
    controlsMobile: 'Honda táctil predictiva',
    description:
      'Circuito completo de 6 hoyos con rampas turbo, arena, agua, bumpers y compuerta móvil con tarjeta de Par.',
    create: createMiniGolfGame
  },
  {
    id: 'battleship',
    title: 'Batalla Naval',
    shortTitle: 'Batalla Naval',
    category: 'strategy',
    categoryLabel: 'Táctico 10×10 · Oculto',
    status: 'active',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: true,
    controlsPc: 'Tablero táctico + R para rotar',
    controlsMobile: 'Radar y Flota por pestañas',
    description:
      'Despliega tu flota de 5 buques y hunde la escuadra rival. En salas online el servidor protege tus coordenadas.',
    create: createBattleshipGame
  },
  {
    id: 'draw-guess',
    title: 'Dibuja y Adivina',
    shortTitle: 'Dibuja y Adivina',
    category: 'party',
    categoryLabel: 'Tiempo real · Rondas y Chat',
    status: 'active',
    minPlayers: 2,
    maxPlayers: 4,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: true,
    controlsPc: 'Lienzo + Chat de respuestas',
    controlsMobile: 'Trazo táctil + pistas',
    description:
      'Dibuja en vivo por streaming, alterna 4 rondas con temporizador de 55s y adivina directamente o por el chat de sala.',
    create: createDrawGuessGame
  },
  {
    id: 'chess',
    title: 'Ajedrez Clásico',
    shortTitle: 'Ajedrez',
    category: 'strategy',
    categoryLabel: 'FIDE Legal · Reloj',
    status: 'active',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: true,
    controlsPc: 'Clic por casillas legales',
    controlsMobile: 'Toque de piezas + giro',
    description:
      'Reglas FIDE completas (enroque, captura al paso, coronación), IA Minimax y reloj configurable (3m, 5m, 10m o libre).',
    create: createChessGame
  },
  // 8 Future Architecture Slots (honestly labeled as upcoming modular extensions)
  {
    id: 'checkers',
    title: 'Damas Internacionales',
    shortTitle: 'Damas',
    category: 'strategy',
    categoryLabel: 'Tablero 8×8 · Próximamente',
    status: 'upcoming',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: false,
    controlsPc: 'Clic por diagonales',
    controlsMobile: 'Toque directo',
    description: 'Slot preparado para damas con capturas encadenadas obligatorias y coronación.'
  },
  {
    id: 'domino',
    title: 'Dominó Clásico',
    shortTitle: 'Dominó',
    category: 'turns',
    categoryLabel: 'Mesa 28 Fichas · Próximamente',
    status: 'upcoming',
    minPlayers: 2,
    maxPlayers: 4,
    supportsAi: true,
    supportsLocal: false,
    supportsOnline: true,
    ranked: false,
    controlsPc: 'Selección de ficha y extremo',
    controlsMobile: 'Deslizar ficha a mesa',
    description: 'Slot preparado para partidas de 2 a 4 jugadores con pozo y cierre por puntos.'
  },
  {
    id: 'card-clash',
    title: 'Duelo de Cartas (UNO Original)',
    shortTitle: 'Cartas UNO',
    category: 'party',
    categoryLabel: 'Cartas · Próximamente',
    status: 'upcoming',
    minPlayers: 2,
    maxPlayers: 4,
    supportsAi: true,
    supportsLocal: false,
    supportsOnline: true,
    ranked: false,
    controlsPc: 'Mano oculta en servidor',
    controlsMobile: 'Carrusel táctil de cartas',
    description: 'Slot preparado para juego de cartas por colores, comodines, saltos e inversión de turno.'
  },
  {
    id: 'ludo-parchis',
    title: 'Parchís Crossplay',
    shortTitle: 'Parchís',
    category: 'party',
    categoryLabel: '4 Colores · Próximamente',
    status: 'upcoming',
    minPlayers: 2,
    maxPlayers: 4,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: false,
    controlsPc: 'Dado y ficha con clic',
    controlsMobile: 'Toque de dado y barrera',
    description: 'Slot preparado para carreras de 4 fichas, puentes, capturas (+20) y llegada a meta.'
  },
  {
    id: 'ultimate-ttt',
    title: 'Tres en Raya Avanzado',
    shortTitle: 'Mega 3 en Raya',
    category: 'strategy',
    categoryLabel: 'Meta-Tablero 9×9 · Próximamente',
    status: 'upcoming',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: false,
    controlsPc: 'Clic en subtablero activo',
    controlsMobile: 'Zoom táctil de cuadrantes',
    description: 'Slot preparado para tableros anidados 3×3 donde cada jugada decide el siguiente sector rival.'
  },
  {
    id: 'memory-duel',
    title: 'Memoria Táctica',
    shortTitle: 'Memoria',
    category: 'turns',
    categoryLabel: 'Pares y Combos · Próximamente',
    status: 'upcoming',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: false,
    controlsPc: 'Clic por carta',
    controlsMobile: 'Toque de cartas',
    description: 'Slot preparado para duelos por parejas con bonificación por cadena consecutiva.'
  },
  {
    id: 'tactics-grid',
    title: 'Escuadra Táctica',
    shortTitle: 'Estrategia Grid',
    category: 'strategy',
    categoryLabel: 'Táctica por Turnos · Próximamente',
    status: 'upcoming',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: false,
    controlsPc: 'Ratón en tablero táctico',
    controlsMobile: 'Toque de unidades',
    description: 'Slot preparado para combate estratégico por casillas con unidades, cobertura y rango.'
  },
  {
    id: 'trivia-arena',
    title: 'Arena de Preguntas',
    shortTitle: 'Preguntas',
    category: 'party',
    categoryLabel: 'Quiz en Vivo · Próximamente',
    status: 'upcoming',
    minPlayers: 2,
    maxPlayers: 4,
    supportsAi: true,
    supportsLocal: true,
    supportsOnline: true,
    ranked: false,
    controlsPc: 'Teclas 1–4 o clic',
    controlsMobile: '4 botones rápidos',
    description: 'Slot preparado para duelos de cultura general, ciencia y videojuegos con racha de velocidad.'
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
