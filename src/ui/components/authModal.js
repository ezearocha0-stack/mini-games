import { escapeHtml } from '../escape.js';
import {
  registerAccount,
  loginWithPassword,
  requestPasswordReset,
  resetPasswordWithCode,
  validatePasswordClient,
  deleteAccount
} from '../../services/authService.js';

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function createAuthModalController({ store, showToast, onAuthenticated }) {
  const backdrop = document.getElementById('modal-auth');
  const contentEl = document.getElementById('modal-auth-body');
  const titleEl = document.getElementById('modal-auth-title');
  const subtitleEl = document.getElementById('modal-auth-subtitle');
  const closeBtn = document.getElementById('btn-close-auth-modal');

  let mode = 'login'; // 'login' | 'register' | 'recover' | 'delete_account'
  let lastEmail = '';
  let lastUsername = '';
  let statusBanner = '';
  let errorBanner = '';
  let isBusy = false;

  function close() {
    isBusy = false;
    backdrop?.classList.add('hidden');
  }

  function open(nextMode = 'login') {
    mode = ['login', 'register', 'recover', 'delete_account'].includes(nextMode) ? nextMode : 'login';
    statusBanner = '';
    errorBanner = '';
    isBusy = false;
    render();
    backdrop?.classList.remove('hidden');
  }

  function renderAlert() {
    if (errorBanner) {
      return `<div class="pill" style="display:block;line-height:1.45;background:rgba(239,83,80,0.14);color:#f27471;border-color:rgba(239,83,80,0.32);width:100%;border-radius:8px;padding:8px 10px;white-space:normal;">${escapeHtml(errorBanner)}</div>`;
    }
    if (statusBanner) {
      return `<div class="pill ok" style="display:block;line-height:1.45;width:100%;border-radius:8px;padding:8px 10px;white-space:normal;">${escapeHtml(statusBanner)}</div>`;
    }
    return '';
  }

  function render() {
    if (!contentEl) return;
    const state = store.getState();
    const caps = state.capabilities || {};

    const titles = {
      login: ['Iniciar sesión', 'Accede a tu perfil, amigos, chat, voz y ranking ELO'],
      register: ['Crear cuenta gratis', `Migrarás tu perfil de invitado "${state.guest.name}" al instante`],
      recover: ['Recuperar contraseña', 'Solicita un código si hay correo configurado y define una nueva clave'],
      delete_account: ['Eliminar cuenta', 'Esta acción borra permanentemente tu cuenta, sesiones y mensajes']
    };
    const [t, sub] = titles[mode] || titles.login;
    if (titleEl) titleEl.textContent = t;
    if (subtitleEl) subtitleEl.textContent = sub;

    const alertHtml = renderAlert();

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

    if (mode === 'recover') {
      contentEl.innerHTML = `
        ${alertHtml}
        <form id="auth-form-recover-req" class="form-stack">
          <div>
            <label class="field-label" for="auth-rec-email">1. Correo electrónico de tu cuenta</label>
            <div style="display:flex;gap:8px;">
              <input id="auth-rec-email" name="email" type="email" class="text-input" value="${escapeHtml(lastEmail)}" placeholder="tu@correo.com" required />
              <button type="submit" class="btn btn-secondary btn-compact" ${isBusy ? 'disabled' : ''}>Enviar</button>
            </div>
          </div>
        </form>
        <form id="auth-form-recover-confirm" class="form-stack">
          <div>
            <label class="field-label" for="auth-rec-code">2. Código de recuperación</label>
            <input id="auth-rec-code" name="code" class="code-input" style="width:100%;" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" placeholder="000000" required />
          </div>
          <div>
            <label class="field-label" for="auth-rec-pass">3. Nueva contraseña (mín. 8 caracteres, letras y números)</label>
            <input id="auth-rec-pass" name="newPassword" type="password" class="text-input" minlength="8" autocomplete="new-password" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block" ${isBusy ? 'disabled' : ''}>Restablecer contraseña</button>
          <button type="button" class="btn btn-subtle btn-compact" data-auth-mode="login">Volver al inicio de sesión</button>
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
            <input id="auth-reg-user" name="username" class="text-input" maxlength="16" minlength="2" value="${escapeHtml(lastUsername || state.guest.name)}" autocomplete="username" required />
          </div>
          <div>
            <label class="field-label" for="auth-reg-email">Correo electrónico</label>
            <input id="auth-reg-email" name="email" type="email" class="text-input" value="${escapeHtml(lastEmail)}" placeholder="jugador@ejemplo.com" autocomplete="email" required />
          </div>
          <div>
            <label class="field-label" for="auth-reg-pass">Contraseña (mín. 8 caracteres, letras y números)</label>
            <input id="auth-reg-pass" name="password" type="password" class="text-input" minlength="8" autocomplete="new-password" placeholder="Ej. Arcade2026" required />
          </div>
          <div>
            <label class="field-label" for="auth-reg-pass-confirm">Confirmar contraseña</label>
            <input id="auth-reg-pass-confirm" name="confirmPassword" type="password" class="text-input" minlength="8" autocomplete="new-password" placeholder="Repite tu contraseña" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block" ${isBusy ? 'disabled' : ''}>
            ${isBusy ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
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
          <input id="auth-login-email" name="email" type="email" class="text-input" value="${escapeHtml(lastEmail)}" placeholder="jugador@ejemplo.com" autocomplete="email" required />
        </div>
        <div>
          <label class="field-label" for="auth-login-pass">Contraseña</label>
          <input id="auth-login-pass" name="password" type="password" class="text-input" autocomplete="current-password" required />
        </div>
        <button type="submit" class="btn btn-primary btn-block" ${isBusy ? 'disabled' : ''}>
          ${isBusy ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>
      ${googleBtn}
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;">
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
        mode = btn.getAttribute('data-auth-mode') || 'login';
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
      statusBanner = '';
      const fd = new FormData(e.target);
      lastEmail = normalizeEmail(fd.get('email'));
      isBusy = true;
      render();
      try {
        await loginWithPassword({
          email: lastEmail,
          password: String(fd.get('password') || '')
        });
        isBusy = false;
        close();
        showToast('Sesión iniciada correctamente');
        await onAuthenticated?.({ isNewRegistration: false });
      } catch (err) {
        isBusy = false;
        errorBanner = err.message;
        render();
      }
    });
  }

  function bindRegisterForm() {
    contentEl.querySelector('#auth-form-register')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBanner = '';
      statusBanner = '';
      const fd = new FormData(e.target);
      const username = String(fd.get('username') || '').trim();
      lastUsername = username;
      lastEmail = normalizeEmail(fd.get('email'));
      const password = String(fd.get('password') || '');
      const confirmPassword = String(fd.get('confirmPassword') || '');

      const pwCheck = validatePasswordClient(password);
      if (!pwCheck.ok) {
        errorBanner = pwCheck.message;
        render();
        return;
      }
      if (password !== confirmPassword) {
        errorBanner = 'Las contraseñas no coinciden.';
        render();
        return;
      }

      isBusy = true;
      render();
      try {
        await registerAccount({
          username,
          email: lastEmail,
          password,
          confirmPassword
        });
        isBusy = false;
        close();
        showToast('¡Cuenta creada! Sesión iniciada');
        await onAuthenticated?.({ isNewRegistration: true });
      } catch (err) {
        isBusy = false;
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
      lastEmail = normalizeEmail(fd.get('email'));
      errorBanner = '';
      isBusy = true;
      render();
      try {
        const res = await requestPasswordReset({ email: lastEmail });
        isBusy = false;
        statusBanner = res.devOtpHint
          ? `Código de recuperación (pruebas): ${res.devOtpHint}`
          : `Código enviado a ${lastEmail} si la cuenta existe.`;
        render();
      } catch (err) {
        isBusy = false;
        errorBanner = err.message;
        render();
      }
    });

    contentEl.querySelector('#auth-form-recover-confirm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      isBusy = true;
      render();
      try {
        await resetPasswordWithCode({
          email: lastEmail,
          code: String(fd.get('code') || '').trim(),
          newPassword: String(fd.get('newPassword') || '')
        });
        isBusy = false;
        mode = 'login';
        statusBanner = 'Contraseña actualizada. Ya puedes iniciar sesión.';
        errorBanner = '';
        render();
      } catch (err) {
        isBusy = false;
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

  return { open, close };
}
