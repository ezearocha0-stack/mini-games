# Registro de Pruebas — Mini-Games (`v2.1.0`)

Leyenda de estado:
- `[PASS]` Probado directamente en esta sesión y verificado sin errores.
- `[PARTIAL]` Probado mediante emulación / pruebas automatizadas locales (pendiente de prueba física en dos dispositivos reales en redes separadas).
- `[BLOCKED-EXT]` Requiere credenciales externas o hardware del propietario no presentes en el entorno (`GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, `SUPABASE_URL`, servidor `TURN` real, o micrófono físico).

## Comprobaciones de Ingeniería Ejecutadas tras Última Edición
- `[PASS]` `git diff --stat src/games/airHockey.js src/games/connectFour.js src/games/ticTacToe.js`: salida vacía (`0` modificaciones sobre los 3 juegos originales).
- `[PASS]` `npm.cmd test` (`tests/platform.test.mjs`): **6/6 pruebas aprobadas** (`fail 0`, `skipped 0`, `900.6 ms`):
  - 4 suites originales de plataforma (seguridad, OTP, migración invitado, social/DM/bloqueos, sala WS + espectadores + reconexión).
  - Validación autoritativa de **Batalla Naval** en `/ws`: verificación de que `PLACE_FLEET` no filtra coordenadas al rival (`ships === undefined` en `FLEET_READY`), hundimiento completo de 17 celdas y subida de ELO en `/api/rankings?game=battleship`.
  - Validación legal de **Ajedrez** en `/ws`: rechazo de jugada ilegal, Mate del Pastor en 4 jugadas y actualización de `stats.eloByGame.chess` en `/api/rankings?game=chess`.
- `[PASS]` `npm.cmd run build`: Compilación Vite 6 limpia en `728 ms` generando `dist/assets/games-pack-*.js`, `net-vendor`, `index.js` e `index.css`.

## Verificación en Navegador Real (`PC 1280×800`, `Android Vertical 390×844`, `Android Horizontal 844×390`)
- `[PASS]` **Catálogo (16 títulos)**: Confirmados `Todos (16)`, `Jugables (8)` y `Próximos (8)` con filtros funcionales y scroll completo sin bloqueos en `390×844` hasta las tarjetas finales.
- `[PASS]` **Ranking**: Pestañas de clasificación operativas para los 8 juegos activos.
- `[PASS]` **Billar 8-Ball (`eight-ball:ai`)**: Verificado tiro real, física del rack completo con bolas `1–15` (sin bolas faltantes ni `undefined`) en PC y Android vertical (`289×578` auto-rotado, pad de efecto y slider accesibles).
- `[PASS]` **Mini Golf (`mini-golf:ai`)**: Verificado hoyo 1, apertura/cierre de tarjeta de puntuación (`Tarjeta`) y golpe real en PC (`1280×800`) y Android horizontal (`844×390`, `maxBottom 379px <= 390px`).
- `[PASS]` **Batalla Naval (`battleship:ai`)**: Verificado despliegue (`Auto-colocar` y `Confirmar Flota`), disparo `E5`, respuesta IA `G5` y pestañas táctiles `Radar Enemigo` / `Mi Flota` en `390×844`.
- `[PASS]` **Dibuja y Adivina (`draw-guess:ai`)**: Verificada animación de trazos vectoriales de la IA en ronda 1 y envío de respuestas en el campo de adivinanza sin interferencias de teclado.
- `[PASS]` **Ajedrez (`chess:ai`)**: Verificado selector de reloj (`3 min` / `5 min`), movimiento legal `e2→e4`, respuesta automática de la IA (`1. e4 Cf6`), cuenta atrás del reloj y correcta visualización sin recortes del historial `.chess-moves-box` (`height: 44px`) en `390×844`.
- `[PASS]` **Neo Air Hockey (`air-hockey:ai`)**: Verificado lanzamiento intacto sin errores de consola (`0` console/page errors en toda la sesión).

## Matriz General (Plataforma + Catálogo)
| Escenario | Estado | Evidencia / Notas |
|---|---|---|
| PC a PC / PC ↔ Android (`/ws`) | `[PARTIAL]` | Probado multi-cliente `/ws` en `tests/platform.test.mjs` (incluyendo Batalla Naval y Ajedrez). PeerJS P2P sin servidor requiere 2 dispositivos físicos en redes separadas. |
| Crear sala / Unirse (`?room=`) | `[PASS]` | Probado en navegador y pruebas automatizadas. |
| Scroll en pantalla completa Android | `[PASS]` | Desplazamiento verificado a `390×844` a lo largo de las 16 tarjetas del catálogo ampliado. |
| Chat / Notificaciones / Revancha | `[PASS]` | DM, grupos, chat en partida integrado con Dibuja y Adivina, notificaciones y `RESTART` probados. |
| Voz WebRTC / Google OAuth / Supabase / SMTP | `[BLOCKED-EXT]` | Código y migraciones SQL (`001` y `002`) listos; la validación en vivo depende de hardware de audio y claves externas en `.env`. |
