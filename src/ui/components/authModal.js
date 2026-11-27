import { escapeHtml } from '../escape.js';
import {
  registerAccount,
  verifyOtpCode,
  requestOtpCode,
  loginWithPassword,
  resetPasswordWithOtp,
  deleteAccount
} from '../../services/authService.js';

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function formatSecClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function createAuthModalController({ store, showToast, onAuthenticated }) {
  const backdrop = document.getElementById('modal-auth');
  const contentEl = document.getElementById('modal-auth-body');
  const titleEl = document.getElementById('modal-auth-title');
  const subtitleEl = document.getElementById('modal-auth-subtitle');
  const closeBtn = document.getElementById('btn-close-auth-modal');

  let mode = 'login'; // 'login' | 'register' | 'verify_otp' | 'otp_login' | 'recover' | 'delete_account'
  let pendingEmail = '';
  let emailLocked = true;
  let otpPurpose = 'verify_email';
  let statusBanner = '';
  let errorBanner = '';
  let deliveryState = ''; // 'sent' | 'rejected' | 'unconfigured' | 'console_test' | 'pending' | ''
  let pendingVerification = false;
  let resendCooldownSec = 0;
  let otpExpiresSec = 0;
  let isBusy = false;
  let countdownTimer = null;

  function stopTimers() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function startCountdown() {
    stopTimers();
    if (resendCooldownSec <= 0 && otpExpiresSec <= 0) return;
    countdownTimer = setInterval(() => {
      let changed = false;
      if (resendCooldownSec > 0) {
        resendCooldownSec -= 1;
        changed = true;
      }
      if (otpExpiresSec > 0) {
        otpExpiresSec -= 1;
        changed = true;
      }
      if (!changed) {
        stopTimers();
        return;
      }
      const resendBtn = contentEl?.querySelector('[data-auth-resend]');
      if (resendBtn) {
        resendBtn.disabled = isBusy || resendCooldownSec > 0;
        resendBtn.textContent =
          resendCooldownSec > 0 ? `↻ Reenviar (${resendCooldownSec}s)` : '↻ Reenviar código';
      }
      const recResendBtn = contentEl?.querySelector('[data-auth-recover-send]');
      if (recResendBtn) {
        recResendBtn.disabled = isBusy || resendCooldownSec > 0;
        recResendBtn.textContent = resendCooldownSec > 0 ? `${resendCooldownSec}s` : 'Enviar';
      }
      const expEl = contentEl?.querySelector('[data-otp-expiry]');
      if (expEl) {
        expEl.textContent =
          otpExpiresSec > 0
            ? `Código válido durante ${formatSecClock(otpExpiresSec)} · Revisa también Spam`
            : 'El código anterior expiró · Pulsa «Reenviar código» para obtener uno nuevo';
      }
    }, 1000);
  }

  function close() {
    stopTimers();
    isBusy = false;
    backdrop?.classList.add('hidden');
  }

  function open(nextMode = 'login') {
    mode = nextMode;
    statusBanner = '';
    errorBanner = '';
    deliveryState = '';
    pendingVerification = false;
    emailLocked = true;
    isBusy = false;
    render();
    backdrop?.classList.remove('hidden');
  }

  function renderDeliveryAlert() {
    const caps = store.getState().capabilities || {};
    const blocks = [];

    if (pendingVerification && (deliveryState === 'rejected' || deliveryState === 'unconfigured')) {
      blocks.push(
        `<div class="pill" style="display:block;line-height:1.45;background:rgba(245,182,35,0.14);color:#f5b623;border-color:rgba(245,182,35,0.34);width:100%;border-radius:8px;padding:8px 10px;white-space:normal;">⏳ Cuenta registrada en estado <strong>pendiente de verificación</strong> para <strong>${escapeHtml(pendingEmail)}</strong>, pero el correo aún no pudo entregarse.</div>`
      );
    }

    if (errorBanner) {
      blocks.push(
        `<div class="pill" style="display:block;line-height:1.45;background:rgba(239,83,80,0.14);color:#f27471;border-color:rgba(239,83,80,0.32);width:100%;border-radius:8px;padding:8px 10px;white-space:normal;">❌ ${escapeHtml(errorBanner)}</div>`
      );
    } else if (statusBanner) {
      blocks.push(
        `<div class="pill ok" style="display:block;line-height:1.45;width:100%;border-radius:8px;padding:8px 10px;white-space:normal;">${escapeHtml(statusBanner)}</div>`
      );
    }

    if (mode === 'register' && !caps.supabaseConfigured && caps.emailDeliveryMode === 'none') {
      blocks.push(
        `<div class="pill" style="display:block;line-height:1.45;background:rgba(245,130,41,0.12);color:var(--text-secondary);border-color:rgba(245,130,41,0.3);width:100%;border-radius:8px;padding:8px 10px;white-space:normal;font-size:0.78rem;">⚠️ Este servidor no tiene proveedor de correo configurado todavía (RESEND_API_KEY / SMTP_HOST o Supabase Auth). Puedes jugar al instante como invitado mientras configuras el envío de correos.</div>`
      );
    }

    return blocks.join('');
  }

  function render() {
    if (!contentEl) return;
    const state = store.getState();
    const caps = state.capabilities || {};

    const titles = {
      login: ['Iniciar sesión', 'Accede a tu perfil, amigos, chat, voz y ranking ELO'],
      register: ['Crear cuenta gratis', `Migrarás tu perfil de invitado "${state.guest.name}" automáticamente`],
      verify_otp: ['Verifica tu correo', 'Introduce el código OTP de 6 dígitos asociado a tu registro'],
      otp_login: ['Acceso sin contraseña', 'Recibe un código de 6 dígitos en tu correo'],
      recover: ['Recuperar acceso', 'Restablece tu contraseña mediante código OTP de 6 dígitos'],
      delete_account: ['Eliminar cuenta', 'Esta acción borra permanentemente tu cuenta, sesiones y mensajes']
    };
    const [t, sub] = titles[mode] || titles.login;
    if (titleEl) titleEl.textContent = t;
    if (subtitleEl) subtitleEl.textContent = sub;

    const alertHtml = renderDeliveryAlert();

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
      const canShowTimer = deliveryState === 'sent' || deliveryState === 'console_test';
      contentEl.innerHTML = `
        ${alertHtml}
        <form id="auth-form-otp" class="form-stack">
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
              <label class="field-label" for="auth-otp-email" style="margin:0;">Correo de verificación</label>
              <button type="button" class="btn btn-subtle btn-compact" data-auth-unlock-email style="font-size:0.72rem;padding:2px 8px;">
                ${emailLocked ? 'Cambiar correo' : 'Bloquear correo'}
              </button>
            </div>
            <input
              id="auth-otp-email"
              name="email"
              type="email"
              class="text-input"
              value="${escapeHtml(pendingEmail)}"
              ${emailLocked && pendingEmail ? 'readonly' : ''}
              required
            />
          </div>
          <div>
            <label class="field-label" for="auth-otp-code">Código OTP de 6 dígitos</label>
            <input id="auth-otp-code" name="code" class="code-input" style="width:100%;" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" placeholder="000000" required />
            ${
              canShowTimer
                ? `<span data-otp-expiry style="display:block;margin-top:6px;font-size:0.76rem;color:var(--text-muted);">${
                    otpExpiresSec > 0
                      ? `Código válido durante ${formatSecClock(otpExpiresSec)} · Revisa también Spam`
                      : 'El código anterior expiró · Pulsa «Reenviar código»'
                  }</span>`
                : ''
            }
          </div>
          <button type="submit" class="btn btn-primary btn-block" ${isBusy ? 'disabled' : ''}>
            ${isBusy ? 'Verificando…' : 'Verificar y Entrar'}
          </button>
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <button type="button" class="btn btn-secondary btn-compact" data-auth-resend ${isBusy || resendCooldownSec > 0 ? 'disabled' : ''}>
              ${resendCooldownSec > 0 ? `↻ Reenviar (${resendCooldownSec}s)` : '↻ Reenviar código'}
            </button>
            <button type="button" class="btn btn-subtle btn-compact" data-auth-mode="login">Volver</button>
          </div>
        </form>
      `;
      bindOtpForm();
      startCountdown();
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
          <button type="submit" class="btn btn-primary btn-block" ${isBusy ? 'disabled' : ''}>
            ${isBusy ? 'Enviando solicitud…' : 'Enviar código de 6 dígitos'}
          </button>
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
              <button type="submit" class="btn btn-secondary btn-compact" data-auth-recover-send ${isBusy || resendCooldownSec > 0 ? 'disabled' : ''}>
                ${resendCooldownSec > 0 ? `${resendCooldownSec}s` : 'Enviar'}
              </button>
            </div>
          </div>
        </form>
        <form id="auth-form-recover-confirm" class="form-stack">
          <div>
            <label class="field-label" for="auth-rec-code">2. Código de 6 dígitos</label>
            <input id="auth-rec-code" name="code" class="code-input" style="width:100%;" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" placeholder="000000" required />
          </div>
          <div>
            <label class="field-label" for="auth-rec-pass">3. Nueva contraseña (mín. 8 caracteres)</label>
            <input id="auth-rec-pass" name="newPassword" type="password" class="text-input" minlength="8" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block" ${isBusy ? 'disabled' : ''}>Restablecer contraseña</button>
          <button type="button" class="btn btn-subtle btn-compact" data-auth-mode="login">Volver</button>
        </form>
      `;
      bindRecoverForms();
      startCountdown();
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
            <input id="auth-reg-email" name="email" type="email" class="text-input" value="${escapeHtml(pendingEmail)}" placeholder="jugador@ejemplo.com" required />
          </div>
          <div>
            <label class="field-label" for="auth-reg-pass">Contraseña (mín. 8 caracteres)</label>
            <input id="auth-reg-pass" name="password" type="password" class="text-input" minlength="8" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block" ${isBusy ? 'disabled' : ''}>
            ${isBusy ? 'Enviando solicitud…' : 'Crear cuenta y enviar OTP'}
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
          <input id="auth-login-email" name="email" type="email" class="text-input" value="${escapeHtml(pendingEmail)}" placeholder="jugador@ejemplo.com" required />
        </div>
        <div>
          <label class="field-label" for="auth-login-pass">Contraseña</label>
          <input id="auth-login-pass" name="password" type="password" class="text-input" required />
        </div>
        <button type="submit" class="btn btn-primary btn-block" ${isBusy ? 'disabled' : ''}>
          ${isBusy ? 'Entrando…' : 'Iniciar sesión'}
        </button>
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
        deliveryState = '';
        pendingVerification = false;
        stopTimers();
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
      pendingEmail = normalizeEmail(fd.get('email'));
      isBusy = true;
      render();
      try {
        await loginWithPassword({
          email: pendingEmail,
          password: String(fd.get('password') || '')
        });
        isBusy = false;
        close();
        showToast('Sesión iniciada correctamente');
        await onAuthenticated?.();
      } catch (err) {
        isBusy = false;
        if (err.code === 'EMAIL_NOT_VERIFIED') {
          const d = err.data || {};
          otpPurpose = 'verify_email';
          mode = 'verify_otp';
          emailLocked = true;
          pendingVerification = true;
          deliveryState = d.deliveryStatus || 'pending';
          resendCooldownSec = Number(d.retryAfterSec ?? d.cooldownSec ?? 0);
          otpExpiresSec = Number(d.expiresInSec || 600);
          if (deliveryState === 'rejected' || deliveryState === 'unconfigured') {
            errorBanner = err.message;
            statusBanner = '';
          } else {
            statusBanner = d.devOtpHint
              ? `Código OTP generado (pruebas): ${d.devOtpHint}`
              : err.message;
          }
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
      statusBanner = '';
      const fd = new FormData(e.target);
      pendingEmail = normalizeEmail(fd.get('email'));
      isBusy = true;
      render();
      try {
        const res = await registerAccount({
          username: String(fd.get('username') || '').trim(),
          email: pendingEmail,
          password: String(fd.get('password') || '')
        });
        isBusy = false;

        if (res.sessionReady) {
          close();
          showToast('¡Cuenta creada y verificada!');
          await onAuthenticated?.();
          return;
        }

        otpPurpose = 'verify_email';
        mode = 'verify_otp';
        emailLocked = true;
        pendingVerification = true;
        deliveryState = res.deliveryStatus || 'sent';
        resendCooldownSec = Number(res.cooldownSec ?? 60);
        otpExpiresSec = Number(res.expiresInSec ?? 600);
        statusBanner = res.devOtpHint
          ? `Código OTP (pruebas locales): ${res.devOtpHint}`
          : `✅ Correo enviado a ${pendingEmail}. Introduce el código de 6 dígitos.`;
        render();
      } catch (err) {
        isBusy = false;
        const d = err.data || {};
        if (err.code === 'EMAIL_DELIVERY_REJECTED' || err.code === 'EMAIL_PROVIDER_NOT_CONFIGURED') {
          otpPurpose = 'verify_email';
          mode = 'verify_otp';
          emailLocked = true;
          pendingVerification = true;
          deliveryState = d.deliveryStatus || (err.code === 'EMAIL_DELIVERY_REJECTED' ? 'rejected' : 'unconfigured');
          resendCooldownSec = 0;
          otpExpiresSec = 0;
          errorBanner = err.message;
          render();
          return;
        }
        errorBanner = err.message;
        render();
      }
    });
  }

  function bindOtpForm() {
    bindModeSwitchers();

    contentEl.querySelector('[data-auth-unlock-email]')?.addEventListener('click', () => {
      if (emailLocked) {
        emailLocked = false;
      } else {
        mode = otpPurpose === 'verify_email' ? 'register' : 'otp_login';
        emailLocked = true;
      }
      render();
    });

    contentEl.querySelector('#auth-form-otp')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBanner = '';
      const fd = new FormData(e.target);
      pendingEmail = normalizeEmail(fd.get('email') || pendingEmail);
      isBusy = true;
      render();
      try {
        await verifyOtpCode({
          email: pendingEmail,
          code: String(fd.get('code') || '').trim(),
          purpose: otpPurpose
        });
        isBusy = false;
        close();
        showToast('¡Correo verificado y sesión activa!');
        await onAuthenticated?.();
      } catch (err) {
        isBusy = false;
        errorBanner = err.message;
        render();
      }
    });

    contentEl.querySelector('[data-auth-resend]')?.addEventListener('click', async () => {
      if (isBusy || resendCooldownSec > 0) return;
      const emailInput = contentEl.querySelector('#auth-otp-email');
      pendingEmail = normalizeEmail(emailInput?.value || pendingEmail);
      errorBanner = '';
      statusBanner = '';
      isBusy = true;
      render();
      try {
        const res = await requestOtpCode({ email: pendingEmail, purpose: otpPurpose });
        isBusy = false;
        deliveryState = res.deliveryStatus || 'sent';
        resendCooldownSec = Number(res.cooldownSec ?? 60);
        otpExpiresSec = Number(res.expiresInSec ?? 600);
        statusBanner = res.devOtpHint
          ? `Nuevo código OTP (pruebas locales): ${res.devOtpHint}`
          : `✅ Nuevo código enviado a ${pendingEmail}.`;
        render();
      } catch (err) {
        isBusy = false;
        const d = err.data || {};
        if (err.status === 429 && d.retryAfterSec) {
          resendCooldownSec = Number(d.retryAfterSec);
        }
        if (d.deliveryStatus === 'rejected' || d.deliveryStatus === 'unconfigured') {
          deliveryState = d.deliveryStatus;
        }
        errorBanner = err.message;
        render();
      }
    });
  }

  function bindRequestOtpForm(purpose) {
    bindModeSwitchers();
    contentEl.querySelector('#auth-form-req-otp')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBanner = '';
      const fd = new FormData(e.target);
      pendingEmail = normalizeEmail(fd.get('email'));
      isBusy = true;
      render();
      try {
        const res = await requestOtpCode({ email: pendingEmail, purpose });
        isBusy = false;
        otpPurpose = purpose;
        mode = 'verify_otp';
        emailLocked = true;
        deliveryState = res.deliveryStatus || 'sent';
        resendCooldownSec = Number(res.cooldownSec ?? 60);
        otpExpiresSec = Number(res.expiresInSec ?? 600);
        statusBanner = res.devOtpHint
          ? `Código OTP (pruebas locales): ${res.devOtpHint}`
          : `✅ Revisa la bandeja de ${pendingEmail} e introduce los 6 dígitos.`;
        render();
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
      if (isBusy || resendCooldownSec > 0) return;
      const fd = new FormData(e.target);
      pendingEmail = normalizeEmail(fd.get('email'));
      errorBanner = '';
      isBusy = true;
      render();
      try {
        const res = await requestOtpCode({ email: pendingEmail, purpose: 'reset_password' });
        isBusy = false;
        resendCooldownSec = Number(res.cooldownSec ?? 60);
        statusBanner = res.devOtpHint
          ? `Código de recuperación (pruebas): ${res.devOtpHint}`
          : `✅ Código enviado a ${pendingEmail} si la cuenta existe.`;
        render();
      } catch (err) {
        isBusy = false;
        if (err.data?.retryAfterSec) resendCooldownSec = Number(err.data.retryAfterSec);
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
        await resetPasswordWithOtp({
          email: pendingEmail,
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
