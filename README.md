# Mini-Games · Plataforma Gaming Crossplay P2P (PC + Android)

Plataforma web multijugador **Crossplay P2P** y **PWA instalable** diseñada para jugar al instante entre **PC** y **Android**, conservando el acceso inmediato como invitado sin registro obligatorio y añadiendo cuentas verificadas, perfiles, amigos, salas avanzadas, chat privado/grupal/en partida, voz WebRTC y ranking competitivo ELO.

---

## Juegos incluidos (Motores originales conservados)

1. **Neo Air Hockey (60 FPS · Tiempo real)**
   - Física 2D con `3×` sub-stepping, estelas, chispas de impacto y respuesta háptica en Android.
   - **Perspectiva simétrica**: cada jugador defiende siempre su portería en la parte inferior de su pantalla.
   - Controles: ratón, `WASD`/flechas en PC (con sensibilidad configurable), arrastre táctil directo y multitáctil 2J en el mismo dispositivo.
   - Predicción local de golpeo del invitado + canal UDP rápido (`RTCDataChannel` / `VOLATILE`).
2. **Conecta 4 Táctico (7×6)**
   - Vista previa de columna, caída con rebote, teclado (`1`–`7`, flechas, `Enter`/`Space`), toque directo e IA Minimax con poda alfa-beta.
3. **Tres en Raya (Infinito + Clásico)**
   - **Modo Infinito (sin empates)**: máximo 3 marcas activas por jugador; al colocar la 4.ª desaparece la más antigua.
   - **Modo Clásico** 3×3 tradicional e IA para ambos modos.
4. **Arquitectura modular para próximos juegos (`src/games/registry.js`)**: slots preparados para Billar 8-Ball, Mini Golf, Batalla Naval y Dibuja y Adivina.

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
- **Correo OTP (`RESEND_API_KEY`, `SMTP_FROM`)**: Sin clave configurada, los OTP se muestran en el log del servidor (y en modo desarrollo para pruebas).
- **Google OAuth (`GOOGLE_CLIENT_ID`)**: Verificación de ID Tokens de Google cuando esté configurado.
- **TURN WebRTC (`TURN_URLS`, `TURN_SHARED_SECRET` o credenciales)**: Servidos de forma segura vía `/api/rtc/ice` sin exponer secretos en el frontend.

## Despliegue en Render y Vercel

- **Render (`render.yaml`)**: `npm install && npm run build` → `npm start` (expone frontend, API REST `/api/*`, WebSockets `/ws` y `/healthz`).
- **Vercel (`vercel.json`)**: Despliegue estático con cabeceras de seguridad, soporte PWA y fallback automático WebRTC P2P mediante PeerJS.
