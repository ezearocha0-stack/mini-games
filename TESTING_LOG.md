# Registro de Pruebas — Mini-Games (`v2.2.0`)

Leyenda de estado:
- `[PASS]` Probado directamente en esta sesión y verificado sin errores.
- `[PARTIAL]` Probado mediante emulación / pruebas automatizadas locales (pendiente de prueba física en dos dispositivos reales o confirmación en panel externo de Supabase).
- `[BLOCKED-EXT]` Depende de credenciales o ajustes externos del propietario en `.env` / Supabase Dashboard (`SUPABASE_URL`, `Confirm Email: OFF`, `GOOGLE_CLIENT_ID`).

## Pruebas Obligatorias de Registro Directo sin OTP (`v2.2.0`)
- `[PASS]` **`npm.cmd test` (`tests/platform.test.mjs`)**: **8/8 pruebas aprobadas** (`fail 0`, `skipped 0`, `1613.6 ms`):
  - Registro directo (`201`) con migración de invitado, sesión inmediata, `emailVerified: false` y sin OTP.
  - Rechazo por contraseñas distintas (`400 PASSWORD_MISMATCH`) y por contraseña sin letras+números (`400 WEAK_PASSWORD`).
  - Bloqueo de correo duplicado (`409 EMAIL_ALREADY_EXISTS`).
  - Cierre de sesión (`/api/auth/logout`) + invalidez del token + nuevo inicio de sesión (`/api/auth/login`).
  - Acceso directo con cuentas pendientes previas (`email_verified = 0`) sin sobrescribir su identidad (`409` ante clave ajena).
  - Búsqueda de usuarios (`/api/users/search`) y rankings funcionando sin filtro `email_verified = 1`.
  - Flujo `@supabase/supabase-js` `signUp()` con sesión activa inmediata (`Confirm Email: OFF`) → `/api/auth/supabase-exchange`.
- `[PASS]` **Navegador Real en PC (`1280×800`) y Android Vertical (`390×844`)** (`0` errores de consola / `0` excepciones JS):
  1. Formulario `#auth-form-register` comprobado con exactamente 4 campos (usuario, correo, contraseña, confirmar contraseña) sin OTP.
  2. Contraseñas diferentes bloqueadas con `"Las contraseñas no coinciden."`.
  3. Creación de `PlayerUno` (`uno@gmail.com`) con entrada automática, redirección a `Inicio` y perfil/ajustes sin insignia "Verificado".
  4. Auditoría de código en `src/` verificando cero almacenamiento de contraseñas en `localStorage` (el sandbox del worker restringe `window.localStorage` en runtime).
  5. Recarga de página (`reload`) conservando la sesión activa vía cookie/`/api/auth/me`.
  6. Cierre de sesión (`Cerrar sesión`) e inicio de sesión posterior con el mismo correo y contraseña.
  7. Intento de registro duplicado sobre `uno@gmail.com` bloqueado (`409`).
  8. Flujo móvil en `390×844` (`MovilUno` / `movil@gmail.com`) + lanzamiento de `Ajedrez Clásico` `vs IA` operativo sin desbordes.
- `[BLOCKED-EXT]` **Desactivar `Confirm Email: OFF` en Supabase Dashboard**: Sin credenciales de tu proyecto Supabase en `.env`, esta casilla externa (`Supabase Dashboard → Authentication → Sign In / Providers → Email → Confirm Email: OFF`) debe desactivarla el propietario en su panel si usa Supabase.

## Compilación de Producción y Catálogo de Juegos
- `[PASS]` **`npm.cmd run build`**: Compilación Vite 6 limpia sin errores.
- `[PASS]` Juegos originales (`Neo Air Hockey`, `Conecta 4 Táctico`, `Tres en Raya`) y 5 nuevos (`Billar 8-Ball`, `Mini Golf`, `Batalla Naval`, `Dibuja y Adivina`, `Ajedrez`), salas WS, amigos, chat, voz y rankings conservados al 100%.
