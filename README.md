# Mini-Games · Plataforma Gaming Crossplay P2P (PC + Android)

Plataforma web multijugador **Crossplay P2P** y **PWA instalable** diseñada para jugar al instante entre **PC** y **Android**, conservando el acceso inmediato como invitado sin registro obligatorio y añadiendo cuentas verificadas, perfiles, amigos, salas avanzadas, chat privado/grupal/en partida, voz WebRTC y ranking competitivo ELO.

---

## Catálogo de Juegos (8 Activos Crossplay + 8 Próximos Slots)

### Juegos Originales Conservados
1. **Neo Air Hockey (60 FPS · Tiempo real)**
   - Física 2D con `3×` sub-stepping, estelas, chispas de impacto y respuesta háptica en Android.
   - **Perspectiva simétrica**: cada jugador defiende siempre su portería en la parte inferior de su pantalla.
   - Controles: ratón, `WASD`/flechas en PC (con sensibilidad configurable), arrastre táctil directo y multitáctil 2J en el mismo dispositivo.
2. **Conecta 4 Táctico (7×6)**
   - Vista previa de columna, caída con rebote, teclado (`1`–`7`, flechas, `Enter`/`Space`), toque directo e IA Minimax con poda alfa-beta.
3. **Tres en Raya (Infinito + Clásico)**
   - **Modo Infinito (sin empates)**: máximo 3 marcas activas por jugador; al colocar la 4.ª desaparece la más antigua.
   - **Modo Clásico** 3×3 tradicional e IA para ambos modos.

### Nuevos Juegos Integrados (v2.1.0)
4. **Billar 8-Ball (`src/games/eightBall.js`)**: Física 2D con 16 bolas, 6 troneras, control de efecto/spin, faltas con bola en mano, IA táctica y rotación automática en vertical móvil.
5. **Mini Golf Crossplay (`src/games/miniGolf.js`)**: Circuito de 6 hoyos con obstáculos (arena, agua, bumpers, rampas turbo, compuerta móvil), honda táctil y tarjeta de puntuación.
6. **Batalla Naval (`src/games/battleship.js`)**: Flota de 5 barcos en cuadrícula `10×10`, flotas ocultas validadas en servidor (`/ws`), cortina de privacidad en 2J local e IA *Hunt & Target*.
7. **Dibuja y Adivina (`src/games/drawGuess.js`)**: Dibujo vectorial en streaming por rondas de 55s, pistas progresivas, chat integrado de respuestas e ilustraciones automáticas en modo vs IA.
8. **Ajedrez Clásico (`src/games/chess.js`)**: Reglas FIDE completas (`src/shared/chessEngine.js`), reloj configurable (`3m`, `5m`, `10m`, libre), IA Minimax alfa-beta y validación en servidor.

### Próximos Slots Preparados (`src/games/registry.js`)
- Damas Internacionales, Dominó Clásico, Duelo de Cartas (UNO original), Parchís Crossplay, Tres en Raya Avanzado, Memoria Táctica, Escuadra Táctica y Arena de Preguntas.

---

## Funcionalidades de Plataforma

- **Diseño Adaptativo PC y Android**: Tema oscuro *Obsidian Gaming* (y tema claro), acentos configurables, barra lateral colapsable + panel social en PC, barra táctil inferior y rail compacto en horizontal para Android, y scroll fluido en pantalla completa (`src/ui/viewport.js`).
- **Invitados + Cuentas Opcionales**: Juega gratis como invitado mediante código de 5 caracteres o QR (`?room=XXXXX`), o crea una cuenta con verificación OTP de 6 dígitos (con migración de perfil local).
- **Amigos, Chat y Voz WebRTC**: Solicitudes, presencia en tiempo real, bloqueos, reportes, mensajes privados y grupales, chat integrado dentro de partidas y canal de voz WebRTC con micrófono apagado por defecto y Push-to-Talk (`V`).
- **Competitivo Validado en Servidor**: ELO global y por juego, niveles, XP, rachas, historial e insignias calculados autoritativamente en backend (`server/elo.js`).

---

## Desarrollo local y Pruebas

Requisitos: **Node.js `>=20`** (`>=22` recomendado para `node:sqlite` integrado).

```bash
npm install
npm test
npm run build
npm start
```

Para desarrollo con recarga rápida y API + WebSockets integrados en Vite:

```bash
npm run dev
```

*(Nota en Windows PowerShell si `npm.ps1` está restringido: usa `npm.cmd`, y si existe inspección TLS corporativa usa `NODE_OPTIONS=--use-system-ca`.)*

---

## Variables de Entorno y Servicios Externos

Consulta [`.env.example`](.env.example) para configurar opcionalmente:
- **Base de datos local autónoma**: Funciona de serie con `node:sqlite` (`.data/minigames.sqlite`) sin coste ni configuración externa.
- **Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)**: Incluye migración completa SQL + Row Level Security en [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql).
- **Correo OTP (`RESEND_API_KEY` + `SMTP_FROM`, `SMTP_*` o Supabase Custom SMTP)**: Consulta [`AUTH_OTP_SETUP.md`](AUTH_OTP_SETUP.md) para configurar el envío real hacia cualquier correo externo con Resend, plantilla `{{ .Token }}` y verificación mediante `npm.cmd run check:email -- correo@ejemplo.com`. Sin proveedor configurado, la plataforma advierte explícitamente que no se envió correo en lugar de simularlo.
- **Google OAuth (`GOOGLE_CLIENT_ID`)**: Verificación de ID Tokens de Google cuando esté configurado.
- **TURN WebRTC (`TURN_URLS`, `TURN_SHARED_SECRET` o credenciales)**: Servidos de forma segura vía `/api/rtc/ice` sin exponer secretos en el frontend.

## Despliegue en Render y Vercel

- **Render (`render.yaml`)**: `npm install && npm run build` → `npm start` (expone frontend, API REST `/api/*`, WebSockets `/ws` y `/healthz`).
- **Vercel (`vercel.json`)**: Despliegue estático con cabeceras de seguridad, soporte PWA y fallback automático WebRTC P2P mediante PeerJS.
