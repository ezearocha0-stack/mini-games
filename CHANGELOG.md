# Changelog — Mini-Games Plataforma Gaming

## [2.0.0] — 2026-11-27 · Transformación a Plataforma Gaming Crossplay (PC + Android)

### Añadido
- **Shell Gaming Profesional**: Sidebar lateral colapsable y panel social derecho en PC; barra inferior táctil y rail vertical compacto en horizontal para Android con áreas seguras (`safe-area-inset-*`).
- **9 Secciones Conectadas**: `Inicio`, `Juegos`, `Jugar`, `Salas`, `Amigos`, `Mensajes`, `Ranking`, `Perfil` y `Ajustes`, sincronizadas mediante store reactivo (`src/state/store.js`) y rutas hash.
- **Control de Viewport y Pantalla Completa (`src/ui/viewport.js`)**: Ajuste dinámico vía `visualViewport` (`--app-height`, `--kb-offset`) y fallback inmersivo `data-immersive="true"` cuando Fullscreen API no está disponible.
- **Cuentas, OTP y Perfiles (`server/auth.js`, `server/db.js`, `supabase/migrations/001_initial_schema.sql`)**: Acceso instantáneo como invitado, registro con verificación OTP de 6 dígitos, recuperación de contraseña, gestión de sesiones activas, migración idempotente de invitado, eliminación segura de cuenta y preparación para Google OAuth y Supabase PostgreSQL + RLS.
- **Sistema Social y Salas Avanzadas (`server/api.js`, `server/wsRooms.js`)**: Búsqueda de usuarios, solicitudes, bloqueos, reportes, presencia en vivo, salas públicas y privadas (2–4 participantes), estado Listo, espectadores, transferencia de anfitrión, expulsión, detección AFK y reconexión con `reconnectToken` (45 s).
- **Chat de Texto y Notificaciones**: Mensajes privados persistentes, grupos con permisos de administrador, reacciones emoji, indicador de escritura, chat integrado en partida (`src/ui/components/matchChat.js`) y centro de notificaciones en tiempo real.
- **Canal de Voz WebRTC (`src/net/voice.js`, `src/ui/components/voiceBar.js`)**: Unión voluntaria con micrófono apagado por defecto, indicadores animados de voz (VAD), mute individual, volumen por participante, Push-to-Talk (`KeyV`/táctil), selector de dispositivos en PC y credenciales ICE/TURN dinámicas vía `/api/rtc/ice`.
- **Competitivo ELO (`server/elo.js`)**: Cálculo ELO global y por juego validado en servidor, anti-boosting, XP, niveles, rachas, historial e insignias desbloqueables.
- **Pruebas automatizadas (`tests/platform.test.mjs`)**: Suite `node:test` que verifica API REST, seguridad, OTP, amigos, chats, WebSockets Crossplay, espectadores, reconexión y ELO en servidor.

### Conservado y Mejorado
- **Neo Air Hockey (60 FPS)**, **Conecta 4 Táctico (7×6 + Minimax alfa-beta)** y **Tres en Raya (Infinito 3 piezas + Clásico)**: reglas, física y perspectiva simétrica preservadas al 100%, añadiendo guardia de teclado en inputs, validación estricta de jugador remoto, `getSnapshot`/`applySnapshot` y sensibilidad configurable en Air Hockey.
- **PWA (`public/sw.js`, `public/manifest.webmanifest`)**: Excluye `/api/*` y `/ws` del caché, avisa de actualizaciones sin interrumpir partidas activas y añade shortcuts instalables.
