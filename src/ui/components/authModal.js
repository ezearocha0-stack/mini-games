import { escapeHtml } from '../escape.js';
import {
  registerAccount,
  verifyOtpCode,
  requestOtpCode,
  loginWithPassword,
  resetPasswordWithOtp,
  deleteAccount
} from '../../services/authService.js';

export function createAuthModalController({ store, showToast, onAuthenticated }) {
  const backdrop = document.getElementById('modal-auth');
  const contentEl = document.getElementById('modal-auth-body');
  const titleEl = document.getElementById('modal-auth-title');
  const subtitleEl = document.getElementById('modal-auth-subtitle');
  const closeBtn = document.getElementById('btn-close-auth-modal');

  let mode = 'login'; // 'login' | 'register' | 'verify_otp' | 'otp_login' | 'recover' | 'delete_account'
  let pendingEmail = '';
  let otpPurpose = 'verify_email';
  let statusBanner = '';
  let errorBanner = '';

  function close() {
    backdrop?.classList.add('hidden');
  }

  function open(nextMode = 'login') {
    mode = nextMode;
    statusBanner = '';
    errorBanner = '';
    render();
    backdrop?.classList.remove('hidden');
  }

  function render() {
    if (!contentEl) return;
    const state = store.getState();
    const caps = state.capabilities || {};

    const titles = {
      login: ['Iniciar sesión', 'Accede a tu perfil, amigos, chat, voz y ranking ELO'],
      register: ['Crear cuenta gratis', `Migrarás tu perfil de invitado "${state.guest.name}" automáticamente`],
      verify_otp: ['Verifica tu correo', 'Introduce el código OTP de 6 dígitos enviado a tu email'],
      otp_login: ['Acceso sin contraseña', 'Recibe un código de 6 dígitos en tu correo'],
      recover: ['Recuperar acceso', 'Restablece tu contraseña mediante código OTP de 6 dígitos'],
      delete_account: ['Eliminar cuenta', 'Esta acción borra permanentemente tu cuenta, sesiones y mensajes']
    };
    const [t, sub] = titles[mode] || titles.login;
    if (titleEl) titleEl.textContent = t;
    if (subtitleEl) subtitleEl.textContent = sub;

    const alertHtml = errorBanner
      ? `<div class="pill" style="background:rgba(239,83,80,0.14);color:#f27471;border-color:rgba(239,83,80,0.3);width:100%;border-radius:8px;padding:8px 10px;white-space:normal;">${escapeHtml(errorBanner)}</div>`
      : statusBanner
        ? `<div class="pill ok" style="width:100%;border-radius:8px;padding:8px 10px;white-space:normal;">${escapeHtml(statusBanner)}</div>`
        : '';

    if (mode === 'delete_account') {
      contentEl.innerHTML = `
        ${alertHtml}
        <form id="auth-form-delete" class="form-stack">
          <div>
            <label class="field-label" for="auth-del-pass">Tu contraseña (si tienes)</label>
            <input id="auth-del-pass" name="password" type="password" class="text-input" placeholder="Contraseña actual" />
          </div>
          <div>
            <label class="field-label" for="auth-del-confirm">Escribe ELIMINAR para confirmar</label>
            <input id="auth-del-confirm" name="confirmText" class="text-input" placeholder="ELIMINAR" required />
          </div>
          <button type="submit" class="btn btn-danger-ghost btn-block">Confirmar eliminación permanente</button>
        </form>
      `;
      bindDeleteForm();
      return;
    }

    if (mode === 'verify_otp') {
      contentEl.innerHTML = `
        ${alertHtml}
        <form id="auth-form-otp" class="form-stack">
          <div>
            <label class="field-label" for="auth-otp-email">Correo</label>
            <input id="auth-otp-email" name="email" type="email" class="text-input" value="${escapeHtml(pendingEmail)}" required />
          </div>
          <div>
            <label class="field-label" for="auth-otp-code">Código OTP de 6 dígitos</label>
            <input id="auth-otp-code" name="code" class="code-input" style="width:100%;" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" placeholder="000000" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block">Verificar y Entrar</button>
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <button type="button" class="btn btn-subtle btn-compact" data-auth-resend>Reenviar código</button>
            <button type="button" class="btn btn-subtle btn-compact" data-auth-mode="login">Volver</button>
          </div>
        </form>
      `;
      bindOtpForm();
      return;
    }

    if (mode === 'otp_login') {
      contentEl.innerHTML = `
        ${alertHtml}
        <form id="auth-form-req-otp" class="form-stack">
          <div>
            <label class="field-label" for="auth-req-email">Correo electrónico</label>
            <input id="auth-req-email" name="email" type="email" class="text-input" value="${escapeHtml(pendingEmail)}" placeholder="tu@correo.com" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block">Enviar código de 6 dígitos</button>
          <button type="button" class="btn btn-subtle btn-compact" data-auth-mode="login">Volver a contraseña</button>
        </form>
      `;
      bindRequestOtpForm('login');
      return;
    }

    if (mode === 'recover') {
      contentEl.innerHTML = `
        ${alertHtml}
        <form id="auth-form-recover-req" class="form-stack">
          <div>
            <label class="field-label" for="auth-rec-email">1. Solicita código de recuperación</label>
            <div style="display:flex;gap:8px;">
              <input id="auth-rec-email" name="email" type="email" class="text-input" value="${escapeHtml(pendingEmail)}" placeholder="tu@correo.com" required />
              <button type="submit" class="btn btn-secondary btn-compact">Enviar</button>
            </div>
          </div>
        </form>
        <form id="auth-form-recover-confirm" class="form-stack">
          <div>
            <label class="field-label" for="auth-rec-code">2. Código de 6 dígitos</label>
            <input id="auth-rec-code" name="code" class="code-input" style="width:100%;" maxlength="6" inputmode="numeric" placeholder="000000" required />
          </div>
          <div>
            <label class="field-label" for="auth-rec-pass">3. Nueva contraseña (mín. 8 caracteres)</label>
            <input id="auth-rec-pass" name="newPassword" type="password" class="text-input" minlength="8" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block">Restablecer contraseña</button>
          <button type="button" class="btn btn-subtle btn-compact" data-auth-mode="login">Volver</button>
        </form>
      `;
      bindRecoverForms();
      return;
    }

    const googleBtn = `
      <button type="button" class="btn btn-secondary btn-block" id="btn-google-oauth">
        <span>Continuar con Google</span>
        <span class="pill">${caps.googleOAuthEnabled ? 'OAuth' : 'Configurar ID'}</span>
      </button>
    `;

    if (mode === 'register') {
      contentEl.innerHTML = `
        ${alertHtml}
        <form id="auth-form-register" class="form-stack">
          <div>
            <label class="field-label" for="auth-reg-user">Nombre de usuario</label>
            <input id="auth-reg-user" name="username" class="text-input" maxlength="16" value="${escapeHtml(state.guest.name)}" required />
          </div>
          <div>
            <label class="field-label" for="auth-reg-email">Correo electrónico</label>
            <input id="auth-reg-email" name="email" type="email" class="text-input" placeholder="jugador@ejemplo.com" required />
          </div>
          <div>
            <label class="field-label" for="auth-reg-pass">Contraseña (mín. 8 caracteres)</label>
            <input id="auth-reg-pass" name="password" type="password" class="text-input" minlength="8" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block">Crear cuenta y enviar OTP</button>
        </form>
        ${googleBtn}
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;color:var(--text-secondary);">
          <span>¿Ya tienes cuenta?</span>
          <button type="button" class="btn btn-subtle btn-compact" data-auth-mode="login">Iniciar sesión</button>
        </div>
      `;
      bindRegisterForm();
      bindGoogleBtn();
      return;
    }

    // Default: Login
    contentEl.innerHTML = `
      ${alertHtml}
      <form id="auth-form-login" class="form-stack">
        <div>
          <label class="field-label" for="auth-login-email">Correo electrónico</label>
          <input id="auth-login-email" name="email" type="email" class="text-input" value="${escapeHtml(pendingEmail)}" placeholder="jugador@ejemplo.com" required />
        </div>
        <div>
          <label class="field-label" for="auth-login-pass">Contraseña</label>
          <input id="auth-login-pass" name="password" type="password" class="text-input" required />
        </div>
        <button type="submit" class="btn btn-primary btn-block">Iniciar sesión</button>
      </form>
      ${googleBtn}
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;">
        <button type="button" class="btn btn-subtle btn-compact" data-auth-mode="otp_login">Entrar con OTP</button>
        <button type="button" class="btn btn-subtle btn-compact" data-auth-mode="recover">Olvidé contraseña</button>
        <button type="button" class="btn btn-accent-soft btn-compact" data-auth-mode="register">Crear cuenta</button>
      </div>
    `;
    bindLoginForm();
    bindGoogleBtn();
  }

  function bindModeSwitchers() {
    contentEl.querySelectorAll('[data-auth-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.getAttribute('data-auth-mode');
        errorBanner = '';
        statusBanner = '';
        render();
      });
    });
  }

  function bindGoogleBtn() {
    bindModeSwitchers();
    contentEl.querySelector('#btn-google-oauth')?.addEventListener('click', () => {
      const caps = store.getState().capabilities;
      if (!caps.googleOAuthEnabled) {
        errorBanner =
          'Google OAuth requiere configurar GOOGLE_CLIENT_ID en las variables de entorno del servidor (ver .env.example).';
        render();
        return;
      }
      showToast('Inicia el flujo de Google Identity Services con tu GOOGLE_CLIENT_ID.');
    });
  }

  function bindLoginForm() {
    contentEl.querySelector('#auth-form-login')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBanner = '';
      const fd = new FormData(e.target);
      pendingEmail = String(fd.get('email') || '').trim();
      try {
        await loginWithPassword({
          email: pendingEmail,
          password: String(fd.get('password') || '')
        });
        close();
        showToast('Sesión iniciada correctamente');
        await onAuthenticated?.();
      } catch (err) {
        if (err.code === 'EMAIL_NOT_VERIFIED') {
          otpPurpose = 'verify_email';
          mode = 'verify_otp';
          statusBanner = err.message;
          render();
          return;
        }
        errorBanner = err.message;
        render();
      }
    });
  }

  function bindRegisterForm() {
    contentEl.querySelector('#auth-form-register')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBanner = '';
      const fd = new FormData(e.target);
      pendingEmail = String(fd.get('email') || '').trim();
      try {
        const res = await registerAccount({
          username: String(fd.get('username') || '').trim(),
          email: pendingEmail,
          password: String(fd.get('password') || '')
        });
        otpPurpose = 'verify_email';
        mode = 'verify_otp';
        statusBanner = res.devOtpHint
          ? `Código OTP generado (modo desarrollo): ${res.devOtpHint}`
          : res.message || 'Revisa tu correo e introduce el código de 6 dígitos.';
        render();
      } catch (err) {
        errorBanner = err.message;
        render();
      }
    });
  }

  function bindOtpForm() {
    bindModeSwitchers();
    contentEl.querySelector('#auth-form-otp')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBanner = '';
      const fd = new FormData(e.target);
      pendingEmail = String(fd.get('email') || '').trim();
      try {
        await verifyOtpCode({
          email: pendingEmail,
          code: String(fd.get('code') || '').trim(),
          purpose: otpPurpose
        });
        close();
        showToast('¡Correo verificado y sesión activa!');
        await onAuthenticated?.();
      } catch (err) {
        errorBanner = err.message;
        render();
      }
    });
    contentEl.querySelector('[data-auth-resend]')?.addEventListener('click', async () => {
      try {
        const res = await requestOtpCode({ email: pendingEmail, purpose: otpPurpose });
        statusBanner = res.devOtpHint
          ? `Nuevo código OTP (desarrollo): ${res.devOtpHint}`
          : 'Código reenviado a tu correo.';
        errorBanner = '';
        render();
      } catch (err) {
        errorBanner = err.message;
        render();
      }
    });
  }

  function bindRequestOtpForm(purpose) {
    bindModeSwitchers();
    contentEl.querySelector('#auth-form-req-otp')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      pendingEmail = String(fd.get('email') || '').trim();
      try {
        const res = await requestOtpCode({ email: pendingEmail, purpose });
        otpPurpose = purpose;
        mode = 'verify_otp';
        statusBanner = res.devOtpHint
          ? `Código OTP (desarrollo): ${res.devOtpHint}`
          : 'Revisa tu bandeja de entrada e introduce los 6 dígitos.';
        errorBanner = '';
        render();
      } catch (err) {
        errorBanner = err.message;
        render();
      }
    });
  }

  function bindRecoverForms() {
    bindModeSwitchers();
    contentEl.querySelector('#auth-form-recover-req')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      pendingEmail = String(fd.get('email') || '').trim();
      try {
        const res = await requestOtpCode({ email: pendingEmail, purpose: 'reset_password' });
        statusBanner = res.devOtpHint
          ? `Código de recuperación (desarrollo): ${res.devOtpHint}`
          : 'Código enviado si el correo existe.';
        errorBanner = '';
        render();
      } catch (err) {
        errorBanner = err.message;
        render();
      }
    });

    contentEl.querySelector('#auth-form-recover-confirm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await resetPasswordWithOtp({
          email: pendingEmail,
          code: String(fd.get('code') || '').trim(),
          newPassword: String(fd.get('newPassword') || '')
        });
        mode = 'login';
        statusBanner = 'Contraseña actualizada. Ya puedes iniciar sesión.';
        errorBanner = '';
        render();
      } catch (err) {
        errorBanner = err.message;
        render();
      }
    });
  }

  function bindDeleteForm() {
    contentEl.querySelector('#auth-form-delete')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await deleteAccount({
          password: String(fd.get('password') || ''),
          confirmText: String(fd.get('confirmText') || '').trim()
        });
        close();
        showToast('Cuenta eliminada de forma segura');
      } catch (err) {
        errorBanner = err.message;
        render();
      }
    });
  }

  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  return { open, close };
}
