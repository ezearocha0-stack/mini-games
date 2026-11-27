# Auditoría Técnica Completa — Mini-Games (`v1.0.0` → Plataforma Gaming Profesional)

**Fecha de auditoría:** 2026-11-27  
**Commit base auditado:** `02ba494` (`main`, respaldado en la rama `backup/v1-pre-platform`)  
**Stack base verificado:** Vite `^6.2.0` (6.4.6 instalado), ES Modules vanilla, Node.js `>=20` (`v26.13.0` local), `ws ^8.18.0`, `peerjs ^1.5.4`, `qrcode ^1.5.4`.

---

## 1. Inventario de Archivos Inspeccionados

- **Configuración y despliegue:** `package.json`, `package-lock.json`, `vite.config.js`, `vercel.json`, `render.yaml`, `README.md`.
- **Backend HTTP + WebSocket:** `server.js` (100 líneas), `server/wsRooms.js` (194 líneas).
- **Frontend principal y PWA:** `index.html` (504 líneas), `public/manifest.webmanifest`, `public/sw.js`, `public/icon-*.png`, `src/main.js` (793 líneas), `src/styles/index.css` (1682 líneas).
- **Red, audio y utilidades:** `src/net/p2p.js` (836 líneas), `src/audio/sfx.js` (147 líneas), `src/ui/qr.js` (24 líneas).
- **Motores de juegos:** `src/games/airHockey.js` (1118 líneas), `src/games/connectFour.js` (547 líneas), `src/games/ticTacToe.js` (491 líneas).

---

## 2. Funcionalidades que Funcionan Correctamente

1. **Neo Air Hockey (`src/games/airHockey.js`)**:
   - Física 2D a 60 FPS con `subSteps = 3`, fricción (`0.994`), velocidad máxima acotada (`2.85`), rebote en postes de portería, estela del disco y chispas de impacto.
   - **Perspectiva simétrica (`flipView`)**: el invitado en modo online ve la mesa rotada 180°, defendiendo siempre la portería inferior tanto en PC como en Android.
   - **Sincronización baja latencia**: canal rápido UDP (`VOLATILE` / `RTCDataChannel` no ordenado `maxRetransmits: 0`) + predicción local de golpeo del invitado (`GUEST_HIT` + `guestHitHoldUntil = 240 ms`) para eliminar sensación de lag.
   - Controles PC (ratón, `WASD`, flechas), Android táctil con desplazamiento ergonómico (`-0.05`) y multitáctil 2J local (`activePointers` por mitad de pista), más respuesta háptica (`navigator.vibrate`).
2. **Conecta 4 Táctico (`src/games/connectFour.js`)**:
   - Tablero 7×6 con vista previa superior de columna, animación de caída con rebote (`c4-drop-bounce`), resaltado de 4 en línea, controles táctiles y teclado (`1`–`7`, flechas, `Enter`/`Space`), e IA Minimax con poda alfa-beta (profundidad 5, ordenación central `[3,2,4,1,5,0,6]`).
3. **Tres en Raya (`src/games/ticTacToe.js`)**:
   - **Modo Infinito** (cola FIFO de 3 marcas activas por jugador, aviso visual `.vanishing-soon` en la ficha que desaparecerá) y **Modo Clásico** 3×3 tradicional, con IA Minimax alfa-beta para ambos modos.
4. **Conectividad Crossplay híbrida (`src/net/p2p.js`, `server/wsRooms.js`)**:
   - Códigos de 5 caracteres (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), enlace directo `?room=XXXXX`, código QR local (`qrcode`), sesión persistente al cambiar de juego, marcador global de victorias de sesión (`sessionWins`), reacciones rápidas, indicador de latencia (`ms`), Screen Wake Lock (`navigator.wakeLock`) y audio sintetizado (`Web Audio API`).
   - Despliegue dual funcional: servidor Node con `/ws` + actualización automática a WebRTC UDP directo (`RTC_SIGNAL`), y fallback automático a PeerJS para despliegues estáticos en Vercel.

---

## 3. Funcionalidades Incompletas o Ausentes

1. **Navegación de plataforma**: Solo existen `#view-hub` y `#view-game`; no hay sidebar PC, navegación inferior Android, ni las 9 secciones conectadas (`Inicio`, `Juegos`, `Jugar`, `Salas`, `Amigos`, `Mensajes`, `Ranking`, `Perfil`, `Ajustes`).
2. **Cuentas, autenticación y perfiles**: Solo existe un apodo en `localStorage` (`mg_player_name_v1`) sin registro por correo, OTP de 6 dígitos, Google OAuth, sesiones, identificador permanente inmutable, avatar/insignias, nivel/XP ni migración de invitado.
3. **Sistema social**: Sin búsqueda de usuarios, solicitudes de amistad, presencia en tiempo real, bloqueos, reportes ni invitaciones directas a salas.
4. **Salas avanzadas**: Las salas de `server/wsRooms.js` son exclusivamente privadas 1v1 sin listado público, estado *Listo*, configuración de juego/capacidad, espectadores, transferencia de anfitrión, expulsión, detección de AFK ni reconexión tras caída.
5. **Chat de texto y voz**: Sin chat privado persistente, sin grupos, sin chat integrado en partida y sin canal de voz WebRTC.
6. **Competitivo y persistencia**: Sin historial de partidas, ranking ELO global/por juego, estadísticas reales ni base de datos relacional (`PostgreSQL` / `SQLite`).
7. **Notificaciones y ajustes**: Sin centro de notificaciones ni pantalla completa de ajustes (apariencia, audio desglosado, controles, privacidad y cuenta).

---

## 4. Errores Existentes Detectados (Verificados en Código)

- **BUG-01 · Bloqueo de scroll en pantalla completa Android (`src/styles/index.css` L65-130, `src/main.js` L129-159)**:
  - `toggleFullscreen()` llama `document.documentElement.requestFullscreen()`. En Chrome Android/WebKit, el elemento `:fullscreen` (`html`) pasa a ser un *containing block* fijo al viewport con comportamiento de scroll restringido, mientras `index.css` depende del scroll de ventana raíz (`min-height: 100dvh` en `html, body` y `.app-shell` sin un contenedor interno con `overflow-y: auto`).
  - Además, `index.html` L7 usa `user-scalable=no` sin `interactive-widget=resizes-content`, provocando que al abrir el teclado virtual en Android no se recalcule correctamente la altura disponible (`visualViewport`), ocultando inputs o impidiendo desplazar modales/chat/menús.
  - Tampoco existe alternativa CSS inmersiva funcional cuando `requestFullscreen` es rechazado (p. ej. iOS Safari o WebViews embebidos), mostrando solo un toast informativo.
- **BUG-02 · Secuestro de teclado global durante partidas (`airHockey.js` L347, `connectFour.js` L490, `ticTacToe.js` L449)**:
  - Los listeners `window.addEventListener('keydown', ...)` capturan `WASD`, flechas, `1`–`9`, `Enter` y `Space` con `e.preventDefault()` incluso cuando el foco está dentro de un `<input>` o `<textarea>`. Al introducir chat dentro de partida o formularios modales, las teclas moverían palas/fichas o quedarían bloqueadas.
- **BUG-03 · Suplantación de jugador en turnos remotos (`connectFour.js` L532, `ticTacToe.js` L468)**:
  - `onNetMessage` pasa `Number(msg.player)` directamente a `applyMove(..., expectedPlayer)` sin validar que provenga del slot remoto (`isHost ? 2 : 1`).
- **BUG-04 · Pérdida inmediata de sala ante microcortes (`server/wsRooms.js` L423-440)**:
  - Al cerrarse momentáneamente el WebSocket en Android (cambio Wi-Fi ↔ 4G/5G o cambio de pestaña), el servidor destruye la sala de inmediato (`rooms.delete`) sin ventana de gracia ni token de reconexión.
- **BUG-05 · Riesgo de caché y recarga abrupta en PWA (`public/sw.js` L514-563)**:
  - `sw.js` ejecuta `skipWaiting()` + `clients.claim()` automáticamente en `install`/`activate`, lo cual puede desincronizar assets durante una partida activa.
  - La estrategia `fetch` cachea cualquier `GET` mismo origen con `status === 200`: si se añaden rutas `/api/*`, las respuestas privadas de perfil/mensajes quedarían cacheadas en Cache Storage.
- **BUG-06 · Indicador RTT dependiente solo de fast-lane (`src/net/p2p.js` L764-773)**:
  - `startPingLoop()` envía `PING` únicamente por `sendFast()`. Si el canal UDP falla silenciosamente o queda atascado antes de cerrarse, `rttMs` no vuelve a actualizarse.

---

## 5. Problemas de Rendimiento

1. **SVG noise overlay fijo (`src/styles/index.css` L596-603)**: `.grain-overlay` aplica un filtro SVG `feTurbulence` a pantalla completa (`z-index: 999`) sobre el canvas de Air Hockey, forzando composición extra en GPUs móviles de gama media. Conviene limitar su impacto o desactivarlo durante `body.in-game` / modo de animaciones reducidas.
2. **Re-render completo del DOM en Tres en Raya (`src/games/ticTacToe.js` L842-849)**: En cada jugada reasigna `btn.innerHTML` en las 9 casillas aunque no hayan cambiado, disparando la animación CSS `pop-in` en fichas antiguas cuando no hace falta.
3. **Bundle inicial**: `peerjs` (~120 KB minificado) se importa de forma estática en `src/main.js` aunque el usuario juegue Solo vs IA o Local, o utilice el servidor WebSocket `/ws`. Puede mantenerse ligero o cargarse bajo demanda cuando se use PeerJS.

---

## 6. Problemas Responsive

- En horizontal móvil (`landscape`), `.topbar`, `.session-strip` y márgenes fijos compiten con el tablero si no hay un rail lateral compacto.
- No hay manejo de `visualViewport` para que un panel de chat inferior en Android se mantenga por encima del teclado virtual.
- `index.css` concentra reglas globales, plataforma y juegos en un único archivo de 1682 líneas difícil de escalar.

---

## 7. Problemas de Arquitectura

- **Estado acoplado al DOM en `src/main.js`**: Todo el estado global, enrutamiento, red y manipulación DOM vive en un único archivo de 793 líneas sin store reactivo ni módulos de vista.
- **Falta de capa de servicios y base de datos**: No hay separación entre UI, transporte P2P, API REST, base de datos relacional ni reglas competitivas validadas en servidor.
- **Catálogo acoplado (`GAME_CATALOG` en `main.js`)**: No existe registro extensible con metadatos para nuevos juegos (`8-Ball`, `Mini Golf`, `Batalla Naval`, etc.).

---

## 8. Riesgos de Seguridad

1. **WebSocket sin límites ni validación de origen/tasa (`server/wsRooms.js`)**:
   - No hay límite de salas activas globales ni rate limiting por IP en `CREATE_ROOM`, `JOIN_ROOM` o mensajes `RELAY`/`VOLATILE`, permitiendo creación masiva de salas o flood.
   - `RTC_SIGNAL` y `RELAY` reenvían payloads arbitrarios sin validar tamaño/estructura básica más allá de `maxPayload: 64KB`.
2. **Ausencia de cabeceras de seguridad HTTP en `server.js`**: Faltan `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y `Content-Security-Policy`.
3. **Confianza ciega en el cliente para victorias (`main.js` L422)**: `sessionWins` se incrementa localmente sin verificación del servidor; para un ranking ELO real sería manipulable desde consola si no se valida en backend.
4. **TURN y secretos**: Actualmente solo se usan servidores STUN públicos (sin TURN); si se añade TURN con credenciales estáticas o secretas en el frontend, quedarían expuestas. Deben servirse desde un endpoint backend usando variables de entorno.

---

## 9. Código Duplicado, Dependencias y Componentes Reutilizables

- **Código duplicado**:
  - `ResizeObserver` + cálculo de área disponible en `airHockey.js`, `connectFour.js` y `ticTacToe.js`.
  - Cabecera `.match-hud` y `.result-overlay` replicadas manualmente en los 3 HTML strings de juego.
  - Botones de reacciones repetidos en `#reaction-bar` y `#stage-mini-reactions`.
- **Dependencias actuales**: Solo `peerjs`, `qrcode`, `ws` y `vite`. **Cero dependencias innecesarias.** Se debe preservar esta ligereza evitando frameworks pesados o paquetes nativos que requieran compilación C++.
- **Componentes reutilizables existentes**: `src/audio/sfx.js`, `src/ui/qr.js`, `src/net/p2p.js`, y las factorías de juegos (`createAirHockeyGame`, `createConnectFourGame`, `createTicTacToeGame`) tienen una interfaz limpia `{ onNetMessage, updatePlayers, restart, destroy }` ideal para conservar e integrar en el nuevo shell.

---

## 10. Evaluación de Servicios Externos, Costos y Alternativas (Regla 17)

1. **Base de datos y autenticación — Supabase vs Motor Relacional Node integrado**:
   - **Supabase Free Tier (\$0/mes)**: 500 MB PostgreSQL, 50,000 MAU en Supabase Auth (Email OTP + Google OAuth), RLS nativo. Límite: pausa tras 7 días de inactividad en plan gratuito (Plan Pro: \$25/mes).
   - **Solución implementada**: Se genera la migración completa SQL + RLS para Supabase (`supabase/migrations/001_initial_schema.sql`) y además se incluye un motor relacional autónomo en Node.js usando **`node:sqlite` (incluido en Node 22+/26 sin costo ni dependencias externas)** con soporte WAL. Así, la plataforma funciona al 100% de inmediato en local y Render (\$0 extra) sin requerir credenciales previas, y queda lista para conectar Supabase mediante variables de entorno.
2. **Envío de correos OTP (SMTP / Resend)**:
   - Resend Free (\$0/mes, 3,000 emails/mes) o SMTP propio (Gmail App Password / Brevo 300/día). Sin credenciales SMTP configuradas, el servidor nunca inventa un envío exitoso falso ni expone secretos: registra el código OTP en log de servidor y en entorno de desarrollo (`NODE_ENV !== 'production'`) muestra aviso de prueba controlada para poder verificar el flujo completo.
3. **Google OAuth**:
   - \$0 (Google Cloud Console OAuth Client ID). Si `GOOGLE_CLIENT_ID` no está definido, el endpoint `/api/auth/google` devuelve `PROVIDER_NOT_CONFIGURED` y la UI informa honestamente que requiere configurar el Client ID en `.env`.
4. **Servidores TURN para redes simétricas / CGNAT móvil**:
   - **STUN (Google/Cloudflare)**: \$0, resuelve ~80-85% de conexiones P2P.
   - **TURN (Metered.ca Free 50 GB/mes o Cloudflare Calls TURN / coturn autoalojado)**: Necesario para ~15-20% de redes móviles corporativas o CGNAT estricto. Credenciales servidas dinámicamente por `/api/rtc/ice` con soporte para `TURN_SHARED_SECRET` (credenciales efímeras HMAC-SHA1) para nunca exponer claves en el frontend.
5. **Voz grupal (WebRTC P2P Mesh vs SFU LiveKit/mediasoup)**:
   - Con capacidad de sala de **2 a 4 participantes** (como las salas actuales de Mini-Games), **WebRTC P2P Mesh** consume 1–3 streams por usuario (~32–96 kbps con Opus), funciona a **\$0** con latencia mínima directa y no justifica el costo operativo ni complejidad de desplegar un SFU dedicado (`LiveKit Cloud` free hasta 5,000 min/mes; `mediasoup` requiere puertos UDP abiertos no soportados por Render Web Services estándar). Documentado para futura expansión si se crean salas de >6 jugadores.

---

## 11. Estado de Resolución Post-Implementación (`v2.0.0`)

- **BUG-01 (Scroll en pantalla completa Android)**: Resuelto mediante `src/ui/viewport.js` (`visualViewport`, `--app-height`, `--kb-offset`, fallback inmersivo `data-immersive="true"` con race de 220 ms) + contenedor interno `.workspace-scroller` separado de `#view-game`. Verificado en emulación móvil `390×844` y `844×390`.
- **BUG-02 (Secuestro de teclado en partidas)**: Guardia `e.target?.closest?.('input, textarea, select, [contenteditable="true"]')` añadido en `airHockey.js`, `connectFour.js` y `ticTacToe.js`.
- **BUG-03 (Suplantación de jugador remoto)**: Validación estricta `const expectedSender = isHost ? 2 : 1` en `connectFour.js` y `ticTacToe.js`, más validación autoritativa en servidor (`server/wsRooms.js`).
- **BUG-04 (Pérdida inmediata de sala)**: Ventana de gracia de 45 s (`RECONNECT_GRACE_MS`) con `reconnectToken` y `RECONNECT_ROOM` verificada en `tests/platform.test.mjs`.
- **BUG-05 (Caché de `/api/*` y recarga en partida en `sw.js`)**: `public/sw.js` (`minigames-pwa-v3`) excluye `/api/`, `/ws` y `/healthz`, y espera confirmación (`SKIP_WAITING`) fuera de partidas activas.
- **BUG-06 (Ping estancado)**: `src/net/p2p.js` conmuta a ping confiable si no recibe `PONG` en 4.5 s.
- **Seguridad y Arquitectura**: Añadidos `server/security.js` (CSP, headers HTTP, rate limiting, `scrypt` + `sha256`), `server/db.js` (`node:sqlite` WAL), migración completa Supabase RLS (`supabase/migrations/001_initial_schema.sql`), `server/elo.js` (ELO validado en servidor) y modularización completa de UI/CSS.

