import { escapeHtml, renderAvatarHtml, formatTimeClock } from '../escape.js';

const QUICK_EMOJIS = ['👍', '🔥', '😂', '😮', '👏', '🎮'];

export function renderMessagesView(state) {
  if (!state.user) {
    return `
      <div class="section-heading">
        <div>
          <h2>Mensajes y Grupos</h2>
          <p>Chat privado entre amigos y salas de grupo persistentes</p>
        </div>
      </div>
      <div class="surface-card empty-state">
        <strong style="color:var(--text-primary);font-size:1.05rem;">Inicia sesión para chatear con amigos y grupos</strong>
        <span>Como invitado puedes usar el chat dentro de partidas activas. Crea una cuenta para guardar conversaciones privadas y grupos.</span>
        <button type="button" class="btn btn-primary" data-open-auth="register">Crear cuenta</button>
      </div>
    `;
  }

  const convs = state.conversations || [];
  const activeConv = convs.find((c) => c.id === state.activeConversationId) || null;
  const msgs = activeConv ? state.messagesByConv[activeConv.id] || [] : [];
  const typingNames = activeConv ? state.typingByConv[activeConv.id] || [] : [];

  return `
    <div class="section-heading">
      <div>
        <h2>Mensajes y Grupos</h2>
        <p>Conversaciones cifradas en tránsito con protección XSS y control de privacidad</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn btn-primary btn-compact" data-action="open-new-group-modal">+ Nuevo grupo</button>
      </div>
    </div>

    <div class="messages-layout ${activeConv ? 'thread-open' : ''}">
      <aside class="conv-sidebar" aria-label="Lista de conversaciones">
        <div style="padding:10px 12px;border-bottom:1px solid var(--hairline);display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:0.86rem;">Conversaciones (${convs.length})</strong>
        </div>
        <div class="conv-list">
          ${
            convs.length === 0
              ? `<div class="empty-state" style="padding:18px;border:none;">
                   <span style="font-size:0.82rem;">Aún no tienes conversaciones. Abre un chat desde Amigos o crea un grupo.</span>
                   <button type="button" class="btn btn-subtle btn-compact" data-nav="amigos">Ir a Amigos</button>
                 </div>`
              : convs
                  .map(
                    (c) => `
                  <button
                    type="button"
                    class="conv-item ${activeConv?.id === c.id ? 'active' : ''}"
                    data-select-conv="${escapeHtml(c.id)}"
                  >
                    ${renderAvatarHtml({
                      name: c.title || 'Chat',
                      color: c.type === 'group' ? '#6366f1' : c.peerAvatarColor || '#1ad1be',
                      icon: c.type === 'group' ? '👥' : c.peerAvatarIcon || '',
                      presence: c.type === 'dm' ? c.peerPresence : null,
                      size: 'sm'
                    })}
                    <div class="list-row-info" style="flex:1;">
                      <span class="list-row-title">
                        ${escapeHtml(c.title || 'Conversación')}
                        ${c.muted ? ' 🔕' : ''}
                      </span>
                      <span class="list-row-sub">${escapeHtml(c.lastMessage || (c.type === 'group' ? 'Grupo creado' : 'Sin mensajes aún'))}</span>
                    </div>
                    ${c.unreadCount > 0 ? `<span class="nav-badge">${c.unreadCount}</span>` : ''}
                  </button>`
                  )
                  .join('')
          }
        </div>
      </aside>

      <section class="chat-thread-panel" aria-label="Hilo de mensajes">
        ${
          !activeConv
            ? `<div class="empty-state" style="margin:auto;border:none;">
                 <span>Selecciona una conversación para ver el historial y escribir en tiempo real.</span>
               </div>`
            : `
              <div class="chat-thread-head">
                <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                  <button type="button" class="icon-btn" data-action="close-mobile-thread" aria-label="Volver a conversaciones">←</button>
                  <div class="list-row-info">
                    <strong class="list-row-title">${escapeHtml(activeConv.title)}</strong>
                    <span class="list-row-sub">
                      ${
                        activeConv.type === 'group'
                          ? `${(activeConv.members || []).length} participantes`
                          : 'Mensaje privado'
                      }
                      ${typingNames.length ? ` · ${escapeHtml(typingNames.join(', '))} escribiendo…` : ''}
                    </span>
                  </div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  ${
                    activeConv.type === 'group'
                      ? `<button type="button" class="btn btn-subtle btn-compact" data-manage-group="${escapeHtml(activeConv.id)}">Grupo</button>`
                      : ''
                  }
                  <button type="button" class="btn btn-subtle btn-compact" data-mute-conv="${escapeHtml(activeConv.id)}">
                    ${activeConv.muted ? 'Activar notif.' : 'Silenciar'}
                  </button>
                </div>
              </div>

              <div class="chat-messages-scroll" id="dm-messages-scroll">
                ${
                  msgs.length === 0
                    ? `<div class="empty-state" style="margin:auto;border:none;"><span>Envía el primer mensaje 👋</span></div>`
                    : msgs
                        .map((m) => {
                          const mine = m.senderId === state.user.id;
                          const reactions = m.reactions || {};
                          const reactEntries = Object.entries(reactions).filter(([, arr]) => arr.length > 0);
                          return `
                            <div class="chat-bubble-row ${mine ? 'mine' : ''}">
                              <div class="chat-bubble">
                                ${!mine && activeConv.type === 'group' ? `<strong style="display:block;font-size:0.74rem;color:var(--accent-secondary);margin-bottom:2px;">${escapeHtml(m.senderName)}</strong>` : ''}
                                <span>${escapeHtml(m.body)}</span>
                              </div>
                              <div class="chat-meta">
                                <span>${escapeHtml(formatTimeClock(m.createdAt))}</span>
                                ${QUICK_EMOJIS.slice(0, 3)
                                  .map(
                                    (em) =>
                                      `<button type="button" class="chat-react-chip" data-react-msg="${escapeHtml(m.id)}:${em}" title="Reaccionar">${em}</button>`
                                  )
                                  .join('')}
                                ${
                                  !mine
                                    ? `<button type="button" class="chat-react-chip" data-report-msg="${escapeHtml(m.senderId)}:${escapeHtml(m.id)}" title="Reportar mensaje">⚑</button>`
                                    : ''
                                }
                              </div>
                              ${
                                reactEntries.length
                                  ? `<div class="chat-reactions-strip">
                                       ${reactEntries
                                         .map(
                                           ([em, users]) =>
                                             `<button type="button" class="chat-react-chip" data-react-msg="${escapeHtml(m.id)}:${escapeHtml(em)}">${escapeHtml(em)} ${users.length}</button>`
                                         )
                                         .join('')}
                                     </div>`
                                  : ''
                              }
                            </div>`;
                        })
                        .join('')
                }
              </div>

              <form class="chat-composer" data-form="send-dm-message" autocomplete="off">
                <button type="button" class="icon-btn" data-action="insert-emoji-dm" aria-label="Emoji">😊</button>
                <input
                  class="text-input"
                  name="body"
                  maxlength="400"
                  placeholder="Escribe un mensaje…"
                  aria-label="Escribir mensaje"
                  data-typing-conv="${escapeHtml(activeConv.id)}"
                />
                <button type="submit" class="btn btn-primary btn-compact">Enviar</button>
              </form>
            `
        }
      </section>
    </div>
  `;
}
