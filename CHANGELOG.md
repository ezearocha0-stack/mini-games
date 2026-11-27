# Changelog — Mini-Games Plataforma Gaming

## [2.2.0] — 2026-11-27 · Registro Directo sin OTP (Usuario + Correo + Contraseña)

### Cambiado
- **Nuevo Registro Directo sin Verificación OTP ([authModal.js](file:///C:/Users/Pc%20Gamer/Desktop/Escritorio/Tarea/proyectos%20Personales/Juego%20online/src/ui/components/authModal.js), [authService.js](file:///C:/Users/Pc%20Gamer/Desktop/Escritorio/Tarea/proyectos%20Personales/Juego%20online/src/services/authService.js), [auth.js](file:///C:/Users/Pc%20Gamer/Desktop/Escritorio/Tarea/proyectos%20Personales/Juego%20online/server/auth.js), [api.js](file:///C:/Users/Pc%20Gamer/Desktop/Escritorio/Tarea/proyectos%20Personales/Juego%20online/server/api.js))**:
  - Formulario simplificado a 4 campos: **Nombre de usuario**, **Correo electrónico**, **Contraseña** y **Confirmar contraseña**.
  - Validación de formato de correo, fortaleza de contraseña (`>= 8` caracteres con letras y números en [security.js](file:///C:/Users/Pc%20Gamer/Desktop/Escritorio/Tarea/proyectos%20Personales/Juego%20online/server/security.js)) y coincidencia exacta de contraseñas.
  - Creación inmediata de cuenta + inicio de sesión automático + migración de perfil de invitado + redirección a `Inicio` ([main.js](file:///C:/Users/Pc%20Gamer/Desktop/Escritorio/Tarea/proyectos%20Personales/Juego%20online/src/main.js)).
- **Integración Supabase Auth `Confirm Email: OFF`**: `supabase.auth.signUp()` trabaja con sesión directa sin requerir `verifyOtp` ni marcar `email_verified = 1`, rechazando simular sesiones falsas si `Confirm Email` siguiera activo en Supabase.
- **Limpieza y Coherencia**: Eliminados la pantalla `verify_otp`, botón de reenvío, temporizadores OTP, rutas `/api/auth/verify-otp` y `/api/auth/request-otp`, insignias de "Verificado/Pendiente" en [profileView.js](file:///C:/Users/Pc%20Gamer/Desktop/Escritorio/Tarea/proyectos%20Personales/Juego%20online/src/ui/views/profileView.js) y [settingsView.js](file:///C:/Users/Pc%20Gamer/Desktop/Escritorio/Tarea/proyectos%20Personales/Juego%20online/src/ui/views/settingsView.js), y filtros `email_verified = 1` en rankings y búsqueda de usuarios.
- **Cuentas Pendientes de Pruebas Anteriores**: Pueden iniciar sesión directamente con su contraseña sin pérdida de identidad, mientras terceros no pueden sobrescribirlas (`409 EMAIL_ALREADY_EXISTS`).
- **Recuperación de Contraseña**: Conservada de forma opcional mediante `/api/auth/forgot-password`, `/api/auth/reset-password` y `resetPasswordForEmail` sin bloquear registro ni login.

## [2.1.1] — 2026-11-27 · Autenticación Real OTP, Supabase Auth y Entrega Resend/SMTP

### Diagnóstico y Correcciones
- **Conexión Real con Supabase Auth (`@supabase/supabase-js`, `src/services/supabaseClient.js`, `src/services/authService.js`, `server/auth.js`)**: Integrados `signUp`, `verifyOtp`, `resend`, `signInWithOtp`, `signInWithPassword`, `resetPasswordForEmail` y endpoint `/api/auth/supabase-exchange`.
- **Entrega Externa Real Sin Simulaciones (`server/mailer.js`, `server/env.js`)**: Reemplazado el fallback silencioso (`no-reply@example.com` + `catch {}`) por envío real vía Resend HTTP API o SMTP externo (`nodemailer`), cargando `.env`/`.env.local` al inicio y diferenciando respuestas reales `sent` (`201`), `rejected` (`502 EMAIL_DELIVERY_REJECTED`), `unconfigured` (`503 EMAIL_PROVIDER_NOT_CONFIGURED`) y `console_test` (solo con `MINIGAMES_TEST_CONSOLE_OTP=1`).
- **Plantillas Supabase `{{ .Token }}` y Trigger de Perfiles**: Añadidas `supabase/templates/confirm_signup.html`, `magic_link.html` y `recovery.html`, `supabase/config.toml` con `[auth.email.smtp]` para Resend, y `supabase/migrations/003_auth_profile_trigger.sql` (`on_auth_user_created`).
- **UI de Verificación y Reenvío Seguro (`src/ui/components/authModal.js`)**: Bloqueo del correo normalizado del registro (`readonly` con opción `Cambiar correo`), temporizador de caducidad de 10 minutos, botón `↻ Reenviar código` con enfriamiento de 60 s (`retryAfterSec` / máx. 5 envíos cada 15 min) y banners diferenciados para cuenta pendiente, envío aceptado o rechazo del proveedor.
- **Diagnóstico CLI y Documentación**: Añadido `npm.cmd run check:email` (`scripts/verify-email-provider.mjs`) y guía paso a paso en `AUTH_OTP_SETUP.md`.

## [2.1.0] — 2026-11-27 · Expansión de Catálogo Crossplay (8 Juegos Activos + 8 Slots Futuros)

### Añadido
- **5 Nuevos Juegos Multijugador Crossplay (PC + Android)**:
  1. **Billar 8-Ball (`src/games/eightBall.js`)**: Física 2D sub-stepped (`6×`), 16 bolas numeradas (`1–7` lisas, `8`, `9–15` rayadas), 6 troneras, control táctil de **efecto/spin** (corrido, retroceso, efecto lateral), faltas con **bola en mano**, IA táctica y auto-rotación en vertical móvil.
  2. **Mini Golf Crossplay (`src/games/miniGolf.js`)**: Circuito de 6 hoyos variados (*Curva Esmeralda*, *Pinball Arcade*, *Puentes Gemelos*, *Cañón Turbo*, *Molino Sincronizado*, *Gran Final*) con bumpers, arena, lagunas de agua, rampas turbo, compuerta móvil, honda táctil y tarjeta de puntuación (`Par` total).
  3. **Batalla Naval (`src/games/battleship.js`)**: Despliegue de flota de 5 barcos, rotación, auto-colocado, radar `10×10`, pestañas móviles en Android, cortina de privacidad en 2J local, IA *Hunt & Target* y **estado oculto validado en servidor** (`/ws`: las flotas no viajan al cliente rival; fallback con hash en PeerJS puro).
  4. **Dibuja y Adivina (`src/games/drawGuess.js`)**: Lienzo vectorial en streaming (`STROKE_SEG`/`STROKE_COMMIT`), paleta de 8 colores, 3 grosores, borrador, deshacer/limpiar, 4 rondas alternas de 55s, pistas progresivas de letras, respuestas vía input o directamente en el **chat de partida**, e ilustraciones vectoriales dibujadas trazo a trazo en modo vs IA.
  5. **Ajedrez Clásico (`src/games/chess.js`, `src/shared/chessEngine.js`)**: Reglas FIDE completas (enroque, captura al paso, coronación con selector, ahogado, triple repetición y 50 movimientos), **reloj configurable** (`3m`, `5m`, `10m`, `Sin reloj`), piezas SVG, IA Minimax alfa-beta y validación legal en servidor.
- **ELO Multi-Juego y Nuevas Insignias (`server/db.js`, `server/elo.js`, `server/api.js`, `supabase/migrations/002_catalog_expansion.sql`)**: Soporte ELO independiente (`elo_by_game`), rankings por cualquiera de los 8 juegos activos y 5 nuevas insignias (`pool_shark`, `golf_pro`, `admiral`, `artist_eye`, `grandmaster`).
- **8 Slots Futuros Preparados en `src/games/registry.js`**: Damas Internacionales, Dominó Clásico, Duelo de Cartas (UNO original), Parchís Crossplay, Tres en Raya Avanzado, Memoria Táctica, Escuadra Táctica y Arena de Preguntas.
- **Arte SVG Dedicado, Chunking y Audio (`src/ui/escape.js`, `src/audio/sfx.js`, `vite.config.js`, `public/sw.js`)**: SVG propios en tarjetas, efectos de taco/bolas/agua/explosión/radar/ajedrez/acierto, chunk separado `games-pack` y caché PWA `minigames-pwa-v4`.

### Conservado Íntegramente
- `src/games/airHockey.js`, `src/games/connectFour.js` y `src/games/ticTacToe.js` sin cambios (`0` líneas modificadas).

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
