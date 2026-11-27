import { escapeHtml, formatRelativeTime } from '../escape.js';
import { apiRequest } from '../../services/apiClient.js';

export function createNotificationCenter({ store, showToast, onJoinRoomCode, onOpenConversation, onOpenFriends }) {
  const drawerBackdrop = document.getElementById('drawer-notifications');
  const listEl = document.getElementById('notif-list-body');
  const closeBtn = document.getElementById('btn-close-notif-drawer');
  const readAllBtn = document.getElementById('btn-read-all-notifs');

  const recentDedupe = new Map();

  function open() {
    store.setState({ notificationsOpen: true });
    render();
    drawerBackdrop?.classList.remove('hidden');
  }

  function close() {
    store.setState({ notificationsOpen: false });
    drawerBackdrop?.classList.add('hidden');
  }

  function pushLocalNotification(notif) {
    const dedupeKey = `${notif.type}:${notif.refId || notif.title}`;
    const now = Date.now();
    const last = recentDedupe.get(dedupeKey) || 0;
    if (now - last < 4500) return;
    recentDedupe.set(dedupeKey, now);

    const current = store.getState().notifications || [];
    const next = [
      {
        id: notif.id || `loc_${now}_${Math.random().toString(36).slice(2, 6)}`,
        type: notif.type || 'info',
        title: notif.title || 'Notificación',
        body: notif.body || '',
        refId: notif.refId || null,
        read: false,
        createdAt: notif.createdAt || new Date().toISOString()
      },
      ...current
    ].slice(0, 60);

    const unread = next.filter((n) => !n.read).length;
    store.setState({ notifications: next, unreadNotifications: unread });

    if (store.getState().notificationsOpen) render();

    if (store.getState().settings.pushNotifications && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      try {
        new Notification(notif.title, { body: notif.body, icon: '/icon-192.png' });
      } catch {}
    }
  }

  async function refreshFromServer() {
    if (!store.getState().user) return;
    try {
      const data = await apiRequest('/api/notifications');
      const items = Array.isArray(data.notifications) ? data.notifications : [];
      store.setState({
        notifications: items,
        unreadNotifications: items.filter((n) => !n.read).length
      });
      if (store.getState().notificationsOpen) render();
    } catch {}
  }

  async function markAllRead() {
    const items = (store.getState().notifications || []).map((n) => ({ ...n, read: true }));
    store.setState({ notifications: items, unreadNotifications: 0 });
    render();
    if (store.getState().user) {
      try {
        await apiRequest('/api/notifications/read-all', { method: 'POST' });
      } catch {}
    }
  }

  function render() {
    if (!listEl) return;
    const items = store.getState().notifications || [];
    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="margin-top:20px;">
          <span>Sin notificaciones por ahora. Aquí verás solicitudes, invitaciones a sala y actualizaciones.</span>
        </div>`;
      return;
    }

    listEl.innerHTML = items
      .map(
        (n) => `
      <div class="list-row" style="align-items:flex-start;flex-direction:column;gap:8px;${n.read ? 'opacity:0.74;' : 'border-color:var(--accent-primary);'}">
        <div style="display:flex;justify-content:space-between;width:100%;gap:8px;">
          <strong style="font-size:0.88rem;">${escapeHtml(n.title)}</strong>
          <span style="font-size:0.7rem;color:var(--text-muted);white-space:nowrap;">${escapeHtml(formatRelativeTime(n.createdAt))}</span>
        </div>
        ${n.body ? `<span style="font-size:0.8rem;color:var(--text-secondary);">${escapeHtml(n.body)}</span>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${
            n.type === 'room_invite' && n.refId
              ? `<button type="button" class="btn btn-primary btn-compact" data-notif-join="${escapeHtml(n.refId)}">Unirse (${escapeHtml(n.refId)})</button>`
              : n.type === 'friend_request' || n.type === 'friend_accept'
                ? `<button type="button" class="btn btn-secondary btn-compact" data-notif-friends>Ver Amigos</button>`
                : n.type === 'message' && n.refId
                  ? `<button type="button" class="btn btn-secondary btn-compact" data-notif-conv="${escapeHtml(n.refId)}">Abrir Chat</button>`
                  : n.type === 'sw_update'
                    ? `<button type="button" class="btn btn-primary btn-compact" data-notif-sw-update>Actualizar ahora</button>`
                    : ''
          }
        </div>
      </div>`
      )
      .join('');

    listEl.querySelectorAll('[data-notif-join]').forEach((b) => {
      b.addEventListener('click', () => {
        const code = b.getAttribute('data-notif-join');
        close();
        onJoinRoomCode?.(code);
      });
    });
    listEl.querySelectorAll('[data-notif-friends]').forEach((b) => {
      b.addEventListener('click', () => {
        close();
        onOpenFriends?.();
      });
    });
    listEl.querySelectorAll('[data-notif-conv]').forEach((b) => {
      b.addEventListener('click', () => {
        const cid = b.getAttribute('data-notif-conv');
        close();
        onOpenConversation?.(cid);
      });
    });
    listEl.querySelectorAll('[data-notif-sw-update]').forEach((b) => {
      b.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('mg:apply-sw-update'));
      });
    });
  }

  closeBtn?.addEventListener('click', close);
  readAllBtn?.addEventListener('click', () => {
    markAllRead();
    showToast('Notificaciones marcadas como leídas');
  });
  drawerBackdrop?.addEventListener('click', (e) => {
    if (e.target === drawerBackdrop) close();
  });

  return {
    open,
    close,
    render,
    pushLocalNotification,
    refreshFromServer,
    markAllRead
  };
}
