// Safe HTML escaping & shared presentation helpers

const HTML_ESCAPE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]);
}

export function getInitials(name) {
  const parts = String(name || 'JG').trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return String(name || 'JG').slice(0, 2).toUpperCase();
}

export const AVATAR_PALETTE = [
  '#f58229',
  '#1ad1be',
  '#6366f1',
  '#ec4899',
  '#10b981',
  '#f5b623',
  '#38bdf8',
  '#a855f7'
];

export const AVATAR_ICONS = ['⚡', '🎮', '🔥', '🛡️', '🚀', '🎯', '👾', '🦊'];

export function renderAvatarHtml({
  name,
  color = '#f58229',
  icon = '',
  presence = null,
  size = ''
}) {
  const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : '#f58229';
  const label = icon ? escapeHtml(icon) : escapeHtml(getInitials(name));
  const dot = presence
    ? `<span class="presence-dot ${escapeHtml(presence)}" aria-hidden="true"></span>`
    : '';
  return `<span class="avatar ${size}" style="background:${safeColor}">${label}${dot}</span>`;
}

export function formatPresenceLabel(status, activity = null) {
  if (status === 'playing') {
    return activity ? `Jugando ${activity}` : 'En partida';
  }
  if (status === 'online') return 'Conectado';
  if (status === 'away') return 'Ausente';
  if (status === 'busy') return 'Ocupado';
  return 'Desconectado';
}

export function formatRelativeTime(isoOrMs) {
  if (!isoOrMs) return '';
  const ts = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'ahora';
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)}h`;
  return `hace ${Math.floor(diffSec / 86400)}d`;
}

export function formatTimeClock(isoOrMs) {
  if (!isoOrMs) return '';
  const d = new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatPlaytime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export function renderGameArtSvg(gameId) {
  if (gameId === 'air-hockey') {
    return `<svg viewBox="0 0 280 148" class="art-svg" aria-hidden="true">
      <rect x="14" y="12" width="252" height="124" rx="18" fill="#101419" stroke="rgba(240,236,228,0.12)" stroke-width="2"/>
      <line x1="140" y1="14" x2="140" y2="134" stroke="rgba(240,236,228,0.12)" stroke-width="2" stroke-dasharray="5 5"/>
      <circle cx="140" cy="74" r="22" fill="none" stroke="rgba(240,236,228,0.12)" stroke-width="2"/>
      <circle cx="64" cy="86" r="19" fill="#f58229"/>
      <circle cx="64" cy="86" r="11" fill="#181e26" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
      <line x1="94" y1="78" x2="142" y2="58" stroke="rgba(245,130,41,0.35)" stroke-width="8" stroke-linecap="round"/>
      <circle cx="150" cy="54" r="10" fill="#f4f1ea"/>
      <circle cx="216" cy="60" r="19" fill="#1ad1be"/>
      <circle cx="216" cy="60" r="11" fill="#181e26" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
    </svg>`;
  }
  if (gameId === 'connect-four') {
    return `<svg viewBox="0 0 280 148" class="art-svg" aria-hidden="true">
      <rect x="46" y="14" width="188" height="120" rx="14" fill="#101419" stroke="rgba(240,236,228,0.12)" stroke-width="2"/>
      <g transform="translate(68, 30)">
        <circle cx="16" cy="16" r="11" fill="#1b222b"/><circle cx="48" cy="16" r="11" fill="#1b222b"/>
        <circle cx="80" cy="16" r="11" fill="#f58229"/><circle cx="112" cy="16" r="11" fill="#1b222b"/><circle cx="144" cy="16" r="11" fill="#1b222b"/>
        <circle cx="16" cy="46" r="11" fill="#1b222b"/><circle cx="48" cy="46" r="11" fill="#f58229"/>
        <circle cx="80" cy="46" r="11" fill="#1ad1be"/><circle cx="112" cy="46" r="11" fill="#1b222b"/><circle cx="144" cy="46" r="11" fill="#1b222b"/>
        <circle cx="16" cy="76" r="11" fill="#f58229"/><circle cx="48" cy="76" r="11" fill="#1ad1be"/>
        <circle cx="80" cy="76" r="11" fill="#1ad1be"/><circle cx="112" cy="76" r="11" fill="#f58229"/><circle cx="144" cy="76" r="11" fill="#1ad1be"/>
        <line x1="16" y1="76" x2="80" y2="16" stroke="#f4f1ea" stroke-width="3" stroke-linecap="round"/>
      </g>
    </svg>`;
  }
  if (gameId === 'tic-tac-toe') {
    return `<svg viewBox="0 0 280 148" class="art-svg" aria-hidden="true">
      <rect x="76" y="10" width="128" height="128" rx="16" fill="#101419" stroke="rgba(240,236,228,0.12)" stroke-width="2"/>
      <line x1="118" y1="24" x2="118" y2="124" stroke="rgba(240,236,228,0.14)" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="162" y1="24" x2="162" y2="124" stroke="rgba(240,236,228,0.14)" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="90" y1="57" x2="190" y2="57" stroke="rgba(240,236,228,0.14)" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="90" y1="91" x2="190" y2="91" stroke="rgba(240,236,228,0.14)" stroke-width="2.5" stroke-linecap="round"/>
      <g stroke="#f58229" stroke-width="4" stroke-linecap="round">
        <line x1="96" y1="32" x2="110" y2="46"/><line x1="110" y1="32" x2="96" y2="46"/>
        <line x1="133" y1="67" x2="147" y2="81"/><line x1="147" y1="67" x2="133" y2="81"/>
      </g>
      <g stroke="rgba(245,130,41,0.32)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="3 3">
        <line x1="169" y1="101" x2="183" y2="115"/><line x1="183" y1="101" x2="169" y2="115"/>
      </g>
      <circle cx="176" cy="39" r="8.5" fill="none" stroke="#1ad1be" stroke-width="4"/>
      <circle cx="103" cy="74" r="8.5" fill="none" stroke="#1ad1be" stroke-width="4"/>
    </svg>`;
  }
  if (gameId === 'eight-ball') {
    return `<svg viewBox="0 0 280 148" class="art-svg" aria-hidden="true">
      <rect x="20" y="16" width="240" height="116" rx="14" fill="#3b2416" stroke="rgba(240,236,228,0.14)" stroke-width="2"/>
      <rect x="30" y="26" width="220" height="96" rx="8" fill="#145c3e"/>
      <circle cx="34" cy="30" r="8" fill="#090b0f"/><circle cx="140" cy="28" r="7" fill="#090b0f"/><circle cx="246" cy="30" r="8" fill="#090b0f"/>
      <circle cx="34" cy="118" r="8" fill="#090b0f"/><circle cx="140" cy="120" r="7" fill="#090b0f"/><circle cx="246" cy="118" r="8" fill="#090b0f"/>
      <line x1="48" y1="88" x2="100" y2="76" stroke="#d6a364" stroke-width="5" stroke-linecap="round"/>
      <circle cx="114" cy="73" r="10" fill="#f4f1ea"/>
      <circle cx="176" cy="74" r="11" fill="#11161d" stroke="rgba(255,255,255,0.22)" stroke-width="1.5"/>
      <circle cx="176" cy="74" r="5" fill="#f4f1ea"/>
      <circle cx="198" cy="60" r="10" fill="#f58229"/><circle cx="198" cy="88" r="10" fill="#2563eb"/>
    </svg>`;
  }
  if (gameId === 'mini-golf') {
    return `<svg viewBox="0 0 280 148" class="art-svg" aria-hidden="true">
      <rect x="20" y="16" width="240" height="116" rx="16" fill="#14583b" stroke="rgba(240,236,228,0.12)" stroke-width="2"/>
      <ellipse cx="148" cy="45" rx="34" ry="16" fill="#d8be7d" stroke="#a88c4c" stroke-width="1.5"/>
      <rect x="115" y="92" width="48" height="24" rx="8" fill="#0f5c8a" stroke="#38bdf8" stroke-width="1.5"/>
      <circle cx="72" cy="74" r="9" fill="#f58229" stroke="#fff" stroke-width="1.5"/>
      <line x1="82" y1="74" x2="178" y2="74" stroke="#1ad1be" stroke-width="2.5" stroke-dasharray="5 5"/>
      <circle cx="215" cy="74" r="12" fill="#090b0f" stroke="#f4f1ea" stroke-width="2"/>
      <line x1="215" y1="74" x2="215" y2="30" stroke="#e2e8f0" stroke-width="2.5"/>
      <polygon points="215,30 238,38 215,46" fill="#ef4444"/>
    </svg>`;
  }
  if (gameId === 'battleship') {
    return `<svg viewBox="0 0 280 148" class="art-svg" aria-hidden="true">
      <rect x="34" y="14" width="212" height="120" rx="14" fill="#0d1722" stroke="rgba(56,189,248,0.22)" stroke-width="2"/>
      <g stroke="rgba(56,189,248,0.12)" stroke-width="1">
        <line x1="76" y1="22" x2="76" y2="126"/><line x1="118" y1="22" x2="118" y2="126"/>
        <line x1="160" y1="22" x2="160" y2="126"/><line x1="202" y1="22" x2="202" y2="126"/>
        <line x1="42" y1="48" x2="238" y2="48"/><line x1="42" y1="74" x2="238" y2="74"/><line x1="42" y1="100" x2="238" y2="100"/>
      </g>
      <rect x="64" y="64" width="126" height="22" rx="11" fill="#475569" stroke="#94a3b8" stroke-width="2"/>
      <circle cx="96" cy="75" r="8" fill="#ef4444"/><circle cx="138" cy="75" r="8" fill="#f58229"/>
      <circle cx="180" cy="36" r="5" fill="#38bdf8"/><circle cx="216" cy="112" r="5" fill="#38bdf8"/>
    </svg>`;
  }
  if (gameId === 'draw-guess') {
    return `<svg viewBox="0 0 280 148" class="art-svg" aria-hidden="true">
      <rect x="28" y="14" width="224" height="120" rx="14" fill="#101419" stroke="rgba(240,236,228,0.14)" stroke-width="2"/>
      <path d="M58 96 Q90 36 128 74 T192 52" fill="none" stroke="#1ad1be" stroke-width="5" stroke-linecap="round"/>
      <circle cx="72" cy="48" r="10" fill="#f5b623"/>
      <rect x="190" y="96" width="14" height="14" rx="4" fill="#f58229"/><rect x="210" y="96" width="14" height="14" rx="4" fill="#ef4444"/>
      <path d="M188 76 L216 42 L224 49 L196 83 L185 86 Z" fill="#f4f1ea"/>
    </svg>`;
  }
  if (gameId === 'chess') {
    return `<svg viewBox="0 0 280 148" class="art-svg" aria-hidden="true">
      <rect x="64" y="12" width="152" height="124" rx="12" fill="#1e242c" stroke="rgba(240,236,228,0.15)" stroke-width="2"/>
      <rect x="76" y="22" width="32" height="25" fill="#d9cbb8"/><rect x="140" y="22" width="32" height="25" fill="#d9cbb8"/>
      <rect x="108" y="47" width="32" height="25" fill="#d9cbb8"/><rect x="172" y="47" width="32" height="25" fill="#d9cbb8"/>
      <rect x="76" y="72" width="32" height="25" fill="#d9cbb8"/><rect x="140" y="72" width="32" height="25" fill="#d9cbb8"/>
      <rect x="108" y="97" width="32" height="25" fill="#d9cbb8"/><rect x="172" y="97" width="32" height="25" fill="#d9cbb8"/>
      <path d="M140 34v10M135 39h10" stroke="#f58229" stroke-width="3" stroke-linecap="round"/>
      <circle cx="140" cy="64" r="13" fill="#f8fafc" stroke="#1e242c" stroke-width="2"/>
      <circle cx="172" cy="94" r="11" fill="#1ad1be" stroke="#101419" stroke-width="2"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 280 148" class="art-svg" aria-hidden="true">
    <rect x="28" y="18" width="224" height="112" rx="16" fill="#101419" stroke="rgba(240,236,228,0.1)" stroke-width="2" stroke-dasharray="6 5"/>
    <circle cx="140" cy="74" r="24" fill="rgba(26,209,190,0.14)" stroke="#1ad1be" stroke-width="2"/>
    <path d="M132 74h16M140 66v16" stroke="#f58229" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}
