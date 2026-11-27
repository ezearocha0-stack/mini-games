// Dynamic Viewport, Fullscreen & Android Virtual Keyboard Controller
// Fixes Android Chrome fullscreen scrolling, landscape orientation resize, and keyboard overlap.

let initialized = false;
let immersiveActive = false;

function isNativeFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

export function isFullscreenActive() {
  return isNativeFullscreen() || immersiveActive;
}

export function syncViewportMetrics() {
  const root = document.documentElement;
  const vv = window.visualViewport;

  const layoutH = window.innerHeight || root.clientHeight || 800;
  const visualH = vv ? vv.height : layoutH;
  const offsetTop = vv ? vv.offsetTop : 0;
  const appHeight = Math.max(280, Math.round(visualH));
  const kbOffset = Math.max(0, Math.round(layoutH - visualH - offsetTop));
  const kbOpen = kbOffset > 110;

  root.style.setProperty('--app-height', `${appHeight}px`);
  root.style.setProperty('--kb-offset', `${kbOffset}px`);
  root.dataset.keyboard = kbOpen ? 'open' : 'closed';
  root.dataset.fullscreen = isNativeFullscreen() ? 'true' : 'false';
  root.dataset.immersive = immersiveActive ? 'true' : 'false';
  root.dataset.orientation =
    window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';

  // Ensure document root never remains scrolled sideways/down in fullscreen on Android
  if (window.scrollY !== 0 || window.scrollX !== 0) {
    window.scrollTo(0, 0);
  }
}

export async function toggleAppFullscreen(onToast) {
  const doc = document;
  const root = doc.documentElement;

  if (isNativeFullscreen()) {
    try {
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      }
    } catch {
      // Fall through to immersive reset
    }
    immersiveActive = false;
    syncViewportMetrics();
    window.dispatchEvent(new Event('resize'));
    return false;
  }

  if (immersiveActive) {
    immersiveActive = false;
    syncViewportMetrics();
    window.dispatchEvent(new Event('resize'));
    return false;
  }

  try {
    if (root.requestFullscreen) {
      await Promise.race([
        root.requestFullscreen({ navigationUI: 'hide' }),
        new Promise((resolve) => setTimeout(resolve, 220))
      ]);
    } else if (root.webkitRequestFullscreen) {
      root.webkitRequestFullscreen();
      await new Promise((resolve) => setTimeout(resolve, 120));
    } else {
      throw new Error('FULLSCREEN_UNSUPPORTED');
    }

    if (!isNativeFullscreen()) {
      immersiveActive = true;
      onToast?.('Modo inmersivo activado. En móvil puedes usar "Instalar App" para pantalla completa nativa.');
    }
    syncViewportMetrics();
    window.dispatchEvent(new Event('resize'));
    return true;
  } catch {
    // Fallback mode when Fullscreen API is blocked or unsupported (e.g., iOS Safari / WebView)
    immersiveActive = true;
    syncViewportMetrics();
    window.dispatchEvent(new Event('resize'));
    onToast?.('Modo inmersivo activado. En móvil puedes usar "Instalar App" para pantalla completa nativa.');
    return true;
  }
}

export function initViewportManager(onFullscreenChange) {
  if (initialized) return;
  initialized = true;

  syncViewportMetrics();

  const onViewportChange = () => {
    syncViewportMetrics();
  };

  const onFsEvent = () => {
    if (!isNativeFullscreen() && immersiveActive) {
      immersiveActive = false;
    }
    syncViewportMetrics();
    setTimeout(() => {
      syncViewportMetrics();
      window.dispatchEvent(new Event('resize'));
      onFullscreenChange?.(isFullscreenActive());
    }, 80);
  };

  window.addEventListener('resize', onViewportChange, { passive: true });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      syncViewportMetrics();
      window.dispatchEvent(new Event('resize'));
    }, 120);
  });
  document.addEventListener('fullscreenchange', onFsEvent);
  document.addEventListener('webkitfullscreenchange', onFsEvent);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportChange, { passive: true });
    window.visualViewport.addEventListener('scroll', onViewportChange, { passive: true });
  }
}
