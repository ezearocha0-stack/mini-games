import { escapeHtml, formatTimeClock } from '../escape.js';

export function createMatchChatController({ store, onSendMatchChat, showToast }) {
  const drawerEl = document.getElementById('match-chat-drawer');
  const fabEl = document.getElementById('btn-match-chat-fab');
  const fabBadgeEl = document.getElementById('match-chat-fab-badge');
  const stageToggleBtn = document.getElementById('btn-stage-chat');
  const stageToggleBadge = document.getElementById('stage-chat-badge');
  const closeBtn = document.getElementById('btn-close-match-chat');
  const listEl = document.getElementById('match-chat-messages');
  const formEl = document.getElementById('form-match-chat');
  const inputEl = document.getElementById('input-match-chat');

  let recentSendTimes = [];
  const mutedSenders = new Set();

  function syncVisibility() {
    const state = store.getState();
    const isOnlineMatch = state.gameSession.activeMode === 'online' && state.room.status === 'connected';
    const open = state.matchChatOpen && isOnlineMatch;

    drawerEl?.classList.toggle('hidden', !open);
    fabEl?.classList.toggle('hidden', !isOnlineMatch || open);
    stageToggleBtn?.classList.toggle('hidden', !isOnlineMatch);

    const unread = state.matchChatUnread || 0;
    if (fabBadgeEl) {
      fabBadgeEl.textContent = String(unread);
      fabBadgeEl.classList.toggle('hidden', unread === 0);
    }
    if (stageToggleBadge) {
      stageToggleBadge.textContent = String(unread);
      stageToggleBadge.classList.toggle('hidden', unread === 0);
    }

    if (open) {
      renderMessages();
      // Trigger canvas ResizeObserver cleanly when PC side drawer opens/closes
      window.dispatchEvent(new Event('resize'));
    }
  }

  function setOpen(nextOpen) {
    store.setState({
      matchChatOpen: Boolean(nextOpen),
      matchChatUnread: nextOpen ? 0 : store.getState().matchChatUnread
    });
    syncVisibility();
    if (nextOpen) {
      setTimeout(() => inputEl?.focus(), 40);
    }
  }

  function appendMessage(msg) {
    if (!msg || !msg.text) return;
    if (msg.senderId && mutedSenders.has(msg.senderId)) return;

    const state = store.getState();
    const myId = state.user?.id || state.guest.guestId;
    const isMine = msg.senderId === myId;
    const item = {
      id: msg.id || `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderId: msg.senderId || 'peer',
      senderName: String(msg.senderName || 'Jugador').slice(0, 20),
      text: String(msg.text).slice(0, 260),
      createdAt: msg.createdAt || new Date().toISOString(),
      mine: isMine
    };

    const next = [...(state.matchChatMessages || []), item].slice(-80);
    const unread = state.matchChatOpen || isMine ? 0 : (state.matchChatUnread || 0) + 1;

    store.setState({
      matchChatMessages: next,
      matchChatUnread: unread
    });

    if (state.matchChatOpen) {
      renderMessages();
    } else {
      syncVisibility();
    }
  }

  function clearMessages() {
    store.setState({ matchChatMessages: [], matchChatUnread: 0, matchChatOpen: false });
    syncVisibility();
  }

  function renderMessages() {
    if (!listEl) return;
    const msgs = store.getState().matchChatMessages || [];
    if (msgs.length === 0) {
      listEl.innerHTML = `<div style="margin:auto;text-align:center;color:var(--text-muted);font-size:0.8rem;padding:12px;">Chat de sala listo. Escribe sin interrumpir la partida.</div>`;
      return;
    }
    listEl.innerHTML = msgs
      .map(
        (m) => `
      <div class="chat-bubble-row ${m.mine ? 'mine' : ''}">
        <div class="chat-bubble" style="padding:6px 10px;font-size:0.82rem;">
          ${!m.mine ? `<strong style="display:block;font-size:0.7rem;color:var(--accent-secondary);">${escapeHtml(m.senderName)}</strong>` : ''}
          <span>${escapeHtml(m.text)}</span>
        </div>
        <span class="chat-meta">${escapeHtml(formatTimeClock(m.createdAt))}</span>
      </div>`
      )
      .join('');
    listEl.scrollTop = listEl.scrollHeight;
  }

  fabEl?.addEventListener('click', () => setOpen(true));
  stageToggleBtn?.addEventListener('click', () => setOpen(!store.getState().matchChatOpen));
  closeBtn?.addEventListener('click', () => {
    setOpen(false);
    window.dispatchEvent(new Event('resize'));
  });

  formEl?.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = (inputEl?.value || '').trim();
    if (!raw) return;

    const now = Date.now();
    recentSendTimes = recentSendTimes.filter((t) => now - t < 4000);
    if (recentSendTimes.length >= 5) {
      showToast('Espera un momento antes de enviar más mensajes');
      return;
    }
    recentSendTimes.push(now);

    const text = raw.slice(0, 260);
    inputEl.value = '';
    onSendMatchChat?.(text);
  });

  return {
    syncVisibility,
    setOpen,
    appendMessage,
    clearMessages
  };
}
