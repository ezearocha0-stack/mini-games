# Plan de Implementación — Transformación de Mini-Games a Plataforma Gaming

Este plan siguió las 8 fases manteniendo Vite 6, ES Modules, Node.js, PeerJS, WebRTC, `/ws`, QR, Wake Lock y los 3 juegos originales (`Neo Air Hockey`, `Conecta 4 Táctico`, `Tres en Raya Infinito + Clásico`).

## Fase 1 — Auditoría y estabilidad
- [x] Clonar repositorio real y respaldar commit inicial en rama `backup/v1-pre-platform`.
- [x] Verificar instalación de dependencias y build base (`npm.cmd run build`).
- [x] Redactar `AUDIT.md`, `IMPLEMENTATION_PLAN.md`, `CHANGELOG.md` y `TESTING_LOG.md`.
- [x] Resolver scroll en Android, pantalla completa, orientación y teclado virtual (`src/ui/viewport.js`, `index.html`, refactor de contenedores scrollables).
- [x] Corregir bugs de auditoría en juegos: guardia de teclado en inputs, validación del slot remoto en `connectFour.js` y `ticTacToe.js`, y añadir `getSnapshot`/`applySnapshot` para reconexión y espectadores.
- [x] Crear `src/games/registry.js` modular para los 3 juegos activos y slots preparados para futuros juegos.

## Fase 2 — Rediseño visual profesional (PC + Android)
- [x] Diseñar sistema visual Obsidian Gaming (tema oscuro predeterminado + tema claro, acentos configurables, escala de interfaz, animaciones reducidas) en `src/styles/index.css`, `src/styles/platform.css` y `src/styles/games.css`.
- [x] Construir shell dual: Sidebar colapsable + Topbar + Panel social derecho en PC; barra inferior táctil y rail izquierdo en horizontal para Android con áreas seguras (`env(safe-area-inset-*)`).
- [x] Conectar las 9 secciones navegables con estado reactivo (`src/state/store.js`, `src/ui/navigation.js`): Inicio, Juegos, Jugar, Salas, Amigos, Mensajes, Ranking, Perfil y Ajustes.

## Fase 3 — Base de datos, cuentas y perfiles
- [x] Crear migración PostgreSQL + políticas RLS completas en `supabase/migrations/001_initial_schema.sql` y documentar variables en `.env.example`.
- [x] Implementar base de datos relacional autónoma en Node (`server/db.js` con `node:sqlite` WAL) + capa de seguridad (`server/security.js`).
- [x] Implementar autenticación (`server/auth.js`, `server/api.js`): invitado instantáneo, registro con OTP de 6 dígitos, login, recuperación, sesiones activas, cambio de contraseña, eliminación de cuenta, integración opcional de Google OAuth y migración idempotente de invitado.
- [x] Implementar perfiles editables con `public_id` permanente inmutable y ocultación estricta de email/tokens en perfiles públicos.

## Fase 4 — Sistema de amigos y salas avanzadas
- [x] Endpoints y eventos en tiempo real para búsqueda, solicitudes, eliminación, bloqueos, reportes y presencia en vivo (`online`, `away`, `busy`, `playing`, `offline`).
- [x] Mejorar `server/wsRooms.js` y `src/net/p2p.js`: salas públicas/privadas, configuración de juego/capacidad/espectadores, estado Listo, transferencia de anfitrión, expulsión, detección AFK, reconexión con `reconnectToken` (45 s), ping dual y `/api/rtc/ice`.

## Fase 5 — Chat de texto y centro de notificaciones
- [x] Chat privado persistente y chat grupal (crear grupo, añadir/expulsar miembros según permisos, historial, no leídos, indicador de escritura, emojis, reacciones, silenciar, bloquear/reportar).
- [x] Chat integrado en partidas (`src/ui/components/matchChat.js`): panel lateral colapsable en PC y botón flotante + sheet inferior en Android adaptado a `visualViewport`.
- [x] Centro de notificaciones en tiempo real (`src/ui/components/notificationCenter.js`) con deduplicación e invitaciones accionables.

## Fase 6 — Chat de voz WebRTC
- [x] Motor de voz WebRTC (`src/net/voice.js`) + barra UI (`src/ui/components/voiceBar.js`): micrófono apagado por defecto, mute/deafen, volumen individual y silenciado local, indicador visual de quién habla, Push-to-Talk (`KeyV` / táctil), reducción de ruido/eco, selector de dispositivos PC y reconexión ICE.

## Fase 7 — Competitivo: Ranking, ELO, XP e Insignias
- [x] Motor competitivo validado en servidor (`server/elo.js`): sesiones de partida, validación anti-manipulación en tableros sombra e historial, ELO global y por juego, anti-boosting, rachas, tiempo de juego, XP, niveles e insignias.

## Fase 8 — Optimización, PWA, Pruebas y Despliegue
- [x] Mejorar `public/manifest.webmanifest` y `public/sw.js` (sin cachear `/api/*`, actualización segura fuera de partida, recuperación offline).
- [x] Suite automatizada `tests/platform.test.mjs` (`npm.cmd test`), build (`npm.cmd run build`) y verificación en navegador escritorio (`1280×800`) y móvil (`390×844` / `844×390`).
- [x] Actualizar `AUDIT.md`, `CHANGELOG.md`, `TESTING_LOG.md`, `README.md` y preparar subida a `https://github.com/ezearocha0-stack/mini-games.git`.
