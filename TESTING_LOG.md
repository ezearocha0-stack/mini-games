# Registro de Pruebas — Mini-Games (`v2.0.0`)

Leyenda de estado:
- `[PASS]` Probado directamente en esta sesión y verificado sin errores.
- `[PARTIAL]` Probado mediante emulación / pruebas automatizadas locales (pendiente de prueba física en dos dispositivos reales en redes separadas).
- `[BLOCKED-EXT]` Requiere credenciales externas o hardware del propietario no presentes en el entorno (`GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, `SUPABASE_URL`, servidor `TURN` real, o micrófono físico).

## Comprobaciones de Ingeniería Ejecutadas tras Última Edición
- `[PASS]` `npm.cmd test` (`tests/platform.test.mjs`): 4/4 suites y casos aprobados (`fail 0`, `skipped 0`), cubriendo `/healthz`, headers de seguridad, `/api/rtc/ice` con TURN HMAC, registro + migración de invitado + OTP de 6 dígitos, ocultación de email en perfil público, inmutabilidad de `publicId`, solicitudes de amistad, DM, reacciones, rate-limit `429`, permisos de grupo `403`, bloqueos, sala pública `/ws`, bloqueo de inyección por espectador, validación autoritativa de ELO/insignia en servidor y reconexión con `reconnectToken`.
- `[PASS]` `npm.cmd run build`: Compilación Vite 6 limpia en 486 ms (`index.html`, CSS y chunks JS sin errores ni advertencias).

## Matriz Obligatoria de Pruebas (Protocolo Sección 23)
| Escenario | Estado | Evidencia / Notas |
|---|---|---|
| PC a PC (WS/WebRTC) | `[PARTIAL]` | Probado multi-cliente `/ws` en `tests/platform.test.mjs` (relay, turnos, espectador, ELO y reconexión). PeerJS/WebRTC P2P entre dos hosts físicos distintos queda pendiente de 2 dispositivos reales. |
| Android a Android | `[PARTIAL]` | Flujo lógico verificado por clientes `/ws` y viewport móvil emulado; requiere dos teléfonos físicos para validar red móvil real. |
| PC a Android | `[PARTIAL]` | Probado protocolo Crossplay mixto (`PC` + `Android` device tags) en pruebas WS automatizadas; falta prueba física entre PC y teléfono real en LAN/4G. |
| Crear sala | `[PASS]` | Probado en navegador (`1280×800`, código `9N2FC`) y en test automatizado. |
| Escanear QR | `[PARTIAL]` | Verificado renderizado del canvas QR e URL `?room=XXXXX` en el modal de invitación; el escaneo con cámara física requiere dispositivo móvil externo. |
| Unirse por enlace (`?room=`) | `[PASS]` | Lógica de `checkAutoJoinUrlParam()` verificada en código y enlace de invitación generado desde `src/ui/qr.js`; entrada de sala verificada por WS. |
| Cambiar de juego en sala | `[PASS]` | Verificado evento `SELECT_GAME` en `tests/platform.test.mjs` y navegación entre los 3 juegos en navegador. |
| Revancha | `[PASS]` | Botones y flujo `RESTART` presentes y conectados en los 3 juegos; estado de sesión validado en pruebas. |
| Reconexión | `[PASS]` | Probado cierre de socket y recuperación de rol `guest` mediante `RECONNECT_ROOM` + `reconnectToken` en `tests/platform.test.mjs`. |
| Pérdida de Internet | `[PARTIAL]` | Banner offline y listener `online`/`offline` implementados en `src/main.js`; la caída de red física requiere prueba manual en dispositivo. |
| Scroll en pantalla completa | `[PASS]` | Probado en navegador a `390×844` activando `#btn-fullscreen` (`html[data-immersive="true"]` en webview sin soporte nativo) con desplazamiento completo de `Ajustes` y `Juegos` arriba/abajo y restauración al salir. |
| Orientación vertical | `[PASS]` | Probado a `390×844`: navegación inferior, scroll fluido sin cortes, cabecera legible y Air Hockey encajado dentro del viewport sin desplazamiento accidental de página al arrastrar. |
| Orientación horizontal | `[PASS]` | Probado a `844×390`: rail lateral izquierdo de `60×390` lado a lado con `.app-main-column` (`784×390`) y scroll vertical completo en `Ajustes`. |
| Teclado virtual | `[PARTIAL]` | Implementado `interactive-widget=resizes-content` + `visualViewport` (`--app-height`, `--kb-offset`, ocultación automática de barra inferior con `data-keyboard="open"`); teclado IME nativo Android pendiente de prueba en teléfono físico. |
| Chat (privado, grupo, partida) | `[PASS]` | DM, grupos, permisos, reacciones, rate-limit `429`, bloqueos y XSS control-char stripping probados en `tests/platform.test.mjs`; drawer/FAB en partida renderizado sin errores en navegador. |
| Permisos de micrófono / Voz | `[BLOCKED-EXT]` | Motor WebRTC (`src/net/voice.js`) y UI (`src/ui/components/voiceBar.js`) implementados con micrófono apagado por defecto, VAD y fallback `permission_error`/`mic_blocked`; requiere 2 dispositivos con micrófono real (y servidor TURN en `.env` para CGNAT) para prueba de audio bidireccional real. |
| Notificaciones | `[PASS]` | Generación en servidor, push WS `NOTIFICATION`, deduplicación y centro de notificaciones verificados en código y API; Web Push nativo requiere permiso del usuario en dispositivo real. |
| Instalación PWA | `[PARTIAL]` | `manifest.webmanifest`, `sw.js` (`minigames-pwa-v3`) y botón `beforeinstallprompt` verificados; el diálogo nativo de instalación Android requiere contexto HTTPS en producción (Render/Vercel). |
| Integración Google OAuth / Supabase / Email SMTP | `[BLOCKED-EXT]` | Endpoints y migración SQL `supabase/migrations/001_initial_schema.sql` listos; verificación real depende de credenciales del propietario en `.env`. |
