# Guía de Configuración Real de Registro y Correos OTP (`Mini-Games`)

## 1. Causa raíz detectada en la auditoría

Al inspeccionar el proyecto se encontraron **cinco fallos reales combinados**:

1. **`@supabase/supabase-js` no estaba conectado al flujo de autenticación**: El cliente (`src/services/authService.js`) no invocaba `supabase.auth.signUp`, `supabase.auth.verifyOtp` ni `supabase.auth.resend`, y faltaban las plantillas `{{ .Token }}` y el trigger SQL `on_auth_user_created` para `public.profiles`.
2. **Fallo silencioso y falsa confirmación en `server/auth.js`**: `deliverOtpEmail` usaba por defecto `Mini-Games <no-reply@example.com>`, ignoraba errores HTTP/red de Resend (`catch {}`), registraba el código por consola y devolvía igualmente `201 OK` como si el correo se hubiera enviado.
3. **Restricción del SMTP predeterminado de Supabase y sandbox de Resend**:
   - El SMTP interno gratuito de Supabase **solo envía correos a miembros autorizados del equipo del proyecto** y limita a 2–4 correos/hora. Para cualquier usuario externo real, Supabase rechaza o descarta el envío.
   - En Resend, usar `onboarding@resend.dev` **solo entrega al correo del propietario de la cuenta Resend** (rechaza con `403` a terceros). Se requiere **verificar un dominio propio** en Resend y usar un remitente de ese dominio en `SMTP_FROM`.
4. **Falta de carga automática de `.env`**: `server.js` y `vite.config.js` no leían `.env` / `.env.local` al arrancar Node.js.
5. **Validación y UX OTP incompletas**: No se bloqueaba el correo tras el registro en `verify_otp`, no existía temporizador de enfriamiento real ni distinción clara entre **enviado**, **rechazado** y **pendiente de verificación**.

---

## 2. Solución Paso a Paso para Envío Real a Cualquier Usuario

Puedes activar **Resend directamente en Supabase Auth (Opción A)** o **en el backend Node.js de Render (Opción B)**. Ambas son compatibles entre sí.

### Paso previo común: Verifica tu dominio en Resend
1. Crea cuenta en https://resend.com e ingresa en **Domains -> Add Domain**.
2. Añade los registros DNS (`SPF`, `DKIM`) en tu proveedor de dominio y verifica el estado en verde (`Verified`).
3. Crea una API Key en **API Keys -> Create API Key** (`re_...`).
4. Elige tu remitente verificado, por ejemplo:
   `Mini-Games <noreply@tudominioverificado.com>`

---

### Opción A — Usar Supabase Auth + Resend Custom SMTP (con OTP de 6 dígitos)

1. **Habilitar Custom SMTP en Supabase Dashboard**:
   - Ve a **Project Settings -> Authentication -> SMTP Settings -> Enable Custom SMTP**:
     - **Sender email**: `noreply@tudominioverificado.com`
     - **Sender name**: `Mini-Games`
     - **Host**: `smtp.resend.com`
     - **Port number**: `465`
     - **Username**: `resend`
     - **Password**: tu `RESEND_API_KEY` (`re_...`)
     - **Minimum interval between emails**: `60` segundos
2. **Configurar Plantillas OTP con `{{ .Token }}`**:
   - Ve a **Authentication -> Email Templates -> Confirm signup** (y **Magic Link** / **Reset Password**).
   - Pega el HTML de [`supabase/templates/confirm_signup.html`](supabase/templates/confirm_signup.html), [`magic_link.html`](supabase/templates/magic_link.html) y [`recovery.html`](supabase/templates/recovery.html), asegurándote de incluir **`{{ .Token }}`** (si dejas `{{ .ConfirmationURL }}`, el usuario recibirá un enlace en lugar del código numérico de 6 dígitos).
3. **Aplicar Migraciones SQL**:
   - Ejecuta en el SQL Editor de Supabase en orden:
     1. [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
     2. [`supabase/migrations/002_catalog_expansion.sql`](supabase/migrations/002_catalog_expansion.sql)
     3. [`supabase/migrations/003_auth_profile_trigger.sql`](supabase/migrations/003_auth_profile_trigger.sql)
4. **Revisar Logs si falla algún correo**:
   - En Supabase Dashboard: **Logs -> Auth Logs** (busca `Error sending confirmation email` o códigos SMTP `535`/`550`).
   - En Resend Dashboard: **Emails** (comprueba si aparece `Delivered`, `Bounced` o `Suppressed`).
5. **Variables de entorno necesarias**:
   ```env
   SUPABASE_URL=https://TU-PROYECTO.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

---

### Opción B — Usar Backend Node.js (Render / Local) con Resend HTTP o SMTP

Si no configuras `SUPABASE_URL`/`SUPABASE_ANON_KEY`, Mini-Games utiliza automáticamente [`server/auth.js`](server/auth.js) + [`server/mailer.js`](server/mailer.js):

1. Configura en `.env` (local) o en **Environment Variables** de Render:
   ```env
   NODE_ENV=production
   SESSION_SECRET=cadena-aleatoria-de-al-menos-32-caracteres
   RESEND_API_KEY=re_tu_clave_real
   SMTP_FROM=Mini-Games <noreply@tudominioverificado.com>
   ```
   *(O si usas otro servidor SMTP como Brevo, Postmark o Zoho en lugar de Resend API, deja vacío `RESEND_API_KEY` y rellena `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).*

---

## 3. Comprobación Real con Proveedor

Tras rellenar tu archivo `.env` con las credenciales reales, ejecuta:

```bash
npm.cmd run check:email -- correo_de_prueba@gmail.com
```

El script verificará la configuración activa y mostrará si el proveedor **ACEPTÓ** o **RECHAZÓ** realmente el correo (sin simular éxitos).
