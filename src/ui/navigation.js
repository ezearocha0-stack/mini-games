import { store } from '../state/store.js';

export const SECTIONS = [
  { id: 'inicio', label: 'Inicio', title: 'Centro de Mando' },
  { id: 'juegos', label: 'Juegos', title: 'Catálogo de Juegos' },
  { id: 'jugar', label: 'Jugar', title: 'Lanzador Rápido' },
  { id: 'salas', label: 'Salas', title: 'Salas Crossplay' },
  { id: 'amigos', label: 'Amigos', title: 'Amigos y Presencia' },
  { id: 'mensajes', label: 'Mensajes', title: 'Mensajes y Grupos' },
  { id: 'ranking', label: 'Ranking', title: 'Ranking Competitivo' },
  { id: 'perfil', label: 'Perfil', title: 'Tu Perfil' },
  { id: 'ajustes', label: 'Ajustes', title: 'Configuración' }
];

const SECTION_SET = new Set(SECTIONS.map((s) => s.id));

export function getSectionMeta(sectionId) {
  return SECTIONS.find((s) => s.id === sectionId) || SECTIONS[0];
}

export function navigateTo(sectionId, { updateHash = true } = {}) {
  const target = SECTION_SET.has(sectionId) ? sectionId : 'inicio';
  store.setState({
    activeSection: target,
    mobileMoreOpen: false
  });

  if (updateHash) {
    const nextHash = `#${target}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + nextHash);
    }
  }

  const scroller = document.getElementById('workspace-scroller');
  if (scroller) {
    scroller.scrollTo({ top: 0, behavior: 'auto' });
  }
}

export function initNavigation() {
  const readHash = () => {
    const raw = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (SECTION_SET.has(raw)) {
      store.setState({ activeSection: raw });
    }
  };
  readHash();
  window.addEventListener('hashchange', readHash);
}
