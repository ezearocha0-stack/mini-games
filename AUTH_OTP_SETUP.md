# Configuración de Autenticación y Registro Directo (`Mini-Games v2.2.0`)

## 1. Registro Directo sin Código OTP

Mini-Games utiliza ahora **registro directo sin verificación OTP ni confirmación por correo**:

- Formulario de registro: **Nombre de usuario**, **Correo electrónico**, **Contraseña** y **Confirmar contraseña**.
- Requisitos de contraseña: mínimo **8 caracteres**, combinando al menos **una letra y un número**.
- Al pulsar **"Crear cuenta"**: la cuenta se crea, inicia sesión automáticamente, migra el perfil de invitado y redirige al **Inicio** de Mini-Games.
- No se presenta la dirección de correo como "verificada" ni se otorgan permisos especiales por verificación de correo.

---

## 2. Configuración Obligatoria si Utilizas Supabase Auth (Externo)

Cuando configures `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, **debes desactivar manualmente la confirmación por correo en tu proyecto de Supabase** para que `supabase.auth.signUp()` devuelva una sesión activa al instante:

1. Entra en tu panel de Supabase:
   **`Supabase Dashboard → Authentication → Sign In / Providers → Email → Confirm Email: OFF`**
2. Guarda los cambios. *(Nota: esta configuración pertenece a tu panel externo de Supabase; verifica manualmente que esté en `OFF` antes de publicar).*
3. Asegúrate de haber ejecutado las migraciones SQL en orden:
   - [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
   - [`supabase/migrations/002_catalog_expansion.sql`](supabase/migrations/002_catalog_expansion.sql)
   - [`supabase/migrations/003_auth_profile_trigger.sql`](supabase/migrations/003_auth_profile_trigger.sql)

Si `Confirm Email` permaneciera activado (`ON`) en Supabase y `signUp()` devolviera `session: null`, la aplicación **no simulará una sesión falsa**: mostrará un aviso claro indicando esa ruta exacta del Dashboard.

---

## 3. Recuperación de Contraseña (Opcional)

La recuperación de contraseña queda preparada aparte en [`server/mailer.js`](server/mailer.js) y en el enlace **"Olvidé contraseña"** (sin bloquear ni afectar al registro o inicio de sesión). Si quieres activarla:

- **Con Resend HTTP (Backend Node / Render)**:
  ```env
  RESEND_API_KEY=re_tu_clave
  SMTP_FROM=Mini-Games <noreply@tudominioverificado.com>
  ```
- **Con SMTP externo (Gmail, Brevo, Zoho, etc.)**:
  ```env
  SMTP_HOST=smtp.tudominio.com
  SMTP_PORT=465
  SMTP_SECURE=true
  SMTP_USER=usuario
  SMTP_PASS=clave
  SMTP_FROM=Mini-Games <noreply@tudominio.com>
  ```
- Comprobación CLI de correo de recuperación:
  ```bash
  npm.cmd run check:email -- correo@ejemplo.com
  ```
