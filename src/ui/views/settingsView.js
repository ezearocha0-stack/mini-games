import { escapeHtml } from '../escape.js';

let activeSessions = [];
let sessionsLoaded = false;

export function setLoadedSessions(list) {
  activeSessions = Array.isArray(list) ? list : [];
  sessionsLoaded = true;
}

export function renderSettingsView(state) {
  const s = state.settings;
  const p = s.privacy || {};
  const blocked = state.friends?.blocked || [];

  return `
    <div class="section-heading">
      <div>
        <h2>Ajustes y Personalización</h2>
        <p>Configuración sincronizada con tu cuenta y guardada localmente para invitados</p>
      </div>
    </div>

    <div class="settings-grid">
      <!-- Apariencia -->
      <section class="surface-card">
        <h3 style="margin:0 0 12px;font-size:1rem;">🎨 Apariencia</h3>
        <div class="form-stack">
          <div>
            <label class="field-label" for="set-theme">Tema de interfaz</label>
            <select id="set-theme" class="select-input" data-setting="theme">
              <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Obsidian Gaming (Oscuro)</option>
              <option value="light" ${s.theme === 'light' ? 'selected' : ''}>Claro Profesional</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="set-accent">Color de acento</label>
            <select id="set-accent" class="select-input" data-setting="accent">
              <option value="amber" ${s.accent === 'amber' ? 'selected' : ''}>Ámbar Solar</option>
              <option value="teal" ${s.accent === 'teal' ? 'selected' : ''}>Turquesa Neón</option>
              <option value="indigo" ${s.accent === 'indigo' ? 'selected' : ''}>Índigo Eléctrico</option>
              <option value="crimson" ${s.accent === 'crimson' ? 'selected' : ''}>Carmesí Arcade</option>
              <option value="emerald" ${s.accent === 'emerald' ? 'selected' : ''}>Esmeralda Táctica</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="set-scale">Tamaño de interfaz</label>
            <select id="set-scale" class="select-input" data-setting="uiScale">
              <option value="compact" ${s.uiScale === 'compact' ? 'selected' : ''}>Compacto</option>
              <option value="normal" ${s.uiScale === 'normal' ? 'selected' : ''}>Estándar</option>
              <option value="large" ${s.uiScale === 'large' ? 'selected' : ''}>Grande (Táctil cómodo)</option>
            </select>
          </div>
          <label class="toggle-row" style="cursor:pointer;">
            <span>Reducir animaciones</span>
            <input type="checkbox" data-setting-bool="reducedMotion" ${s.reducedMotion ? 'checked' : ''} />
          </label>
        </div>
      </section>

      <!-- Audio -->
      <section class="surface-card">
        <h3 style="margin:0 0 12px;font-size:1rem;">🔊 Audio y Dispositivos</h3>
        <div class="form-stack">
          <div>
            <label class="field-label" for="set-vol-master">Volumen general (${Math.round((s.masterVolume ?? 0.85) * 100)}%)</label>
            <input id="set-vol-master" type="range" min="0" max="1" step="0.05" value="${s.masterVolume ?? 0.85}" data-setting-range="masterVolume" style="width:100%;" />
          </div>
          <div>
            <label class="field-label" for="set-vol-sfx">Efectos de juego (${Math.round((s.sfxVolume ?? 0.9) * 100)}%)</label>
            <input id="set-vol-sfx" type="range" min="0" max="1" step="0.05" value="${s.sfxVolume ?? 0.9}" data-setting-range="sfxVolume" style="width:100%;" />
          </div>
          <div>
            <label class="field-label" for="set-vol-music">Ambiente de fondo (${Math.round((s.musicVolume ?? 0) * 100)}%)</label>
            <input id="set-vol-music" type="range" min="0" max="1" step="0.05" value="${s.musicVolume ?? 0}" data-setting-range="musicVolume" style="width:100%;" />
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-compact" data-action="test-audio">Probar sonido</button>
            <button type="button" class="btn btn-subtle btn-compact" data-action="test-mic">Probar micrófono</button>
          </div>
          <div id="mic-test-meter" style="font-size:0.78rem;color:var(--text-muted);"></div>
        </div>
      </section>

      <!-- Controles -->
      <section class="surface-card">
        <h3 style="margin:0 0 12px;font-size:1rem;">🎮 Controles y Sensibilidad</h3>
        <div class="form-stack">
          <div>
            <label class="field-label" for="set-hockey-sens">
              Sensibilidad teclado en Neo Air Hockey (${Number(s.airHockeySensitivity || 1).toFixed(2)}×)
            </label>
            <input id="set-hockey-sens" type="range" min="0.7" max="1.4" step="0.05" value="${s.airHockeySensitivity ?? 1}" data-setting-range="airHockeySensitivity" style="width:100%;" />
          </div>
          <div class="surface-card soft" style="padding:12px;font-size:0.82rem;color:var(--text-secondary);">
            <div><strong>Air Hockey:</strong> Ratón, WASD/Flechas, táctil directo y multitáctil 2J.</div>
            <div><strong>Conecta 4:</strong> Clic/toque de columna o teclas 1–7 y flechas.</div>
            <div><strong>Tres en Raya:</strong> Clic/toque de casilla o teclas 1–9.</div>
            <div><strong>Push-to-Talk voz:</strong> Tecla <kbd>V</kbd> en PC o mantener pulsado en Android.</div>
          </div>
        </div>
      </section>

      <!-- Privacidad y Notificaciones -->
      <section class="surface-card">
        <h3 style="margin:0 0 12px;font-size:1rem;">🛡️ Privacidad y Notificaciones</h3>
        <div class="form-stack">
          <div>
            <label class="field-label" for="set-priv-friend">Quién puede enviar solicitudes de amistad</label>
            <select id="set-priv-friend" class="select-input" data-setting-privacy="whoCanFriend">
              <option value="everyone" ${p.whoCanFriend === 'everyone' ? 'selected' : ''}>Todos los usuarios</option>
              <option value="nobody" ${p.whoCanFriend === 'nobody' ? 'selected' : ''}>Nadie</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="set-priv-invite">Quién puede invitar a salas</label>
            <select id="set-priv-invite" class="select-input" data-setting-privacy="whoCanInvite">
              <option value="everyone" ${p.whoCanInvite === 'everyone' ? 'selected' : ''}>Todos</option>
              <option value="friends" ${p.whoCanInvite === 'friends' ? 'selected' : ''}>Solo amigos</option>
              <option value="nobody" ${p.whoCanInvite === 'nobody' ? 'selected' : ''}>Nadie</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="set-priv-msg">Quién puede enviar mensajes privados</label>
            <select id="set-priv-msg" class="select-input" data-setting-privacy="whoCanMessage">
              <option value="everyone" ${p.whoCanMessage === 'everyone' ? 'selected' : ''}>Todos</option>
              <option value="friends" ${p.whoCanMessage === 'friends' ? 'selected' : ''}>Solo amigos</option>
              <option value="nobody" ${p.whoCanMessage === 'nobody' ? 'selected' : ''}>Nadie</option>
            </select>
          </div>
          <label class="toggle-row" style="cursor:pointer;">
            <span>Mostrar mi estado conectado a amigos</span>
            <input type="checkbox" data-setting-privacy-bool="showOnlineStatus" ${p.showOnlineStatus !== false ? 'checked' : ''} />
          </label>
          <label class="toggle-row" style="cursor:pointer;">
            <span>Notificaciones del navegador (Push local)</span>
            <input type="checkbox" data-action="toggle-browser-push" ${s.pushNotifications ? 'checked' : ''} />
          </label>

          ${
            blocked.length > 0
              ? `<div style="padding-top:8px;">
                   <span class="field-label">Usuarios bloqueados (${blocked.length})</span>
                   <div class="list-stack">
                     ${blocked
                       .map(
                         (b) => `
                       <div class="list-row">
                         <span>${escapeHtml(b.username)}</span>
                         <button type="button" class="btn btn-subtle btn-compact" data-unblock-user="${escapeHtml(b.id)}">Desbloquear</button>
                       </div>`
                       )
                       .join('')}
                   </div>
                 </div>`
              : ''
          }
        </div>
      </section>
    </div>

    <!-- Cuenta y Seguridad -->
    <section class="surface-card">
      <h3 style="margin:0 0 12px;font-size:1rem;">🔐 Cuenta y Seguridad</h3>
      ${
        !state.user
          ? `<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;">
               <span style="color:var(--text-secondary);font-size:0.88rem;">Estás navegando como invitado. Crea una cuenta o inicia sesión para gestionar sesiones y seguridad.</span>
               <div style="display:flex;gap:8px;">
                 <button type="button" class="btn btn-primary btn-compact" data-open-auth="register">Registrarse</button>
                 <button type="button" class="btn btn-secondary btn-compact" data-open-auth="login">Iniciar sesión</button>
               </div>
             </div>`
          : `<div class="settings-grid">
               <div class="form-stack">
                 <div>
                   <span class="field-label">Correo electrónico</span>
                   <div style="display:flex;align-items:center;gap:8px;">
                     <strong>${escapeHtml(state.user.email)}</strong>
                   </div>
                 </div>

                 <form class="form-stack" data-form="change-password">
                   <strong style="font-size:0.9rem;">Cambiar contraseña</strong>
                   <input type="password" name="currentPassword" class="text-input" placeholder="Contraseña actual" required minlength="6" />
                   <input type="password" name="newPassword" class="text-input" placeholder="Nueva contraseña (mín. 8, letras y números)" required minlength="8" />
                   <button type="submit" class="btn btn-secondary btn-compact">Actualizar contraseña</button>
                 </form>
               </div>

               <div class="form-stack">
                 <div style="display:flex;align-items:center;justify-content:space-between;">
                   <strong style="font-size:0.9rem;">Sesiones activas</strong>
                   <button type="button" class="btn btn-subtle btn-compact" data-action="load-sessions">↻ Ver sesiones</button>
                 </div>
                 ${
                   !sessionsLoaded
                     ? '<span style="font-size:0.82rem;color:var(--text-muted);">Pulsa "Ver sesiones" para inspeccionar tus dispositivos activos.</span>'
                     : `<div class="list-stack">
                          ${activeSessions
                            .map(
                              (sess) => `
                            <div class="list-row">
                              <div class="list-row-info">
                                <span class="list-row-title">${escapeHtml(sess.deviceLabel || 'Navegador')} ${sess.current ? '(Esta sesión)' : ''}</span>
                                <span class="list-row-sub">${escapeHtml(sess.createdAt || '')}</span>
                              </div>
                              ${
                                !sess.current
                                  ? `<button type="button" class="btn btn-danger-ghost btn-compact" data-revoke-session="${escapeHtml(sess.id)}">Cerrar</button>`
                                  : '<span class="pill ok">Actual</span>'
                              }
                            </div>`
                            )
                            .join('')}
                        </div>`
                 }

                 <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                   <button type="button" class="btn btn-secondary btn-compact" data-action="logout">Cerrar sesión</button>
                   <button type="button" class="btn btn-danger-ghost btn-compact" data-action="open-delete-account">Eliminar cuenta</button>
                 </div>
               </div>
             </div>`
      }
    </section>
  `;
}
